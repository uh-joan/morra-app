// collector.mjs — the /log event collector for morra.joans.cat.
// The app already POSTs batched NDJSON (one JSON event per line) to /log
// every 2s + a sendBeacon flush on tab-hide (apps/play/src/telemetry.ts);
// this is the production sink the spike's serve.py played in dev. Zero
// dependencies, one file, appends to a per-day NDJSON file.
//
// Hardening (security audit 2026-08-20, "harden /log before deploying"):
//   - POST /log only; everything else 404
//   - body capped at 1 MB (connection destroyed past it)
//   - per-IP sliding rate limit (60 req/min) — Caddy fronts us, the client
//     IP arrives in X-Forwarded-For
//   - every line must parse as JSON and fit 8 KB, or it is dropped
//   - lines are re-serialized (never raw-appended) with a server receive
//     timestamp and the batch's remote-ip day-scoped hash for coarse
//     unique-visitor counts without storing addresses
//
// Run: DATA_DIR=/data node collector.mjs   (port 9310)

import http from "node:http";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

const PORT = parseInt(process.env.PORT || "9310", 10);
const DATA_DIR = process.env.DATA_DIR || "/data";
const MAX_BODY = 1024 * 1024; // 1 MB per request
const MAX_LINE = 8 * 1024; // 8 KB per event line
const RATE_CAP = 60; // requests per window per IP
const RATE_WINDOW_MS = 60_000;

mkdirSync(DATA_DIR, { recursive: true });

// ---- per-IP sliding-window rate limit (in-memory; resets on restart) ----
const buckets = new Map(); // ip -> { windowStart, count }
function allowed(ip) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.windowStart >= RATE_WINDOW_MS) {
    buckets.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  b.count += 1;
  return b.count <= RATE_CAP;
}
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, b] of buckets) if (b.windowStart < cutoff) buckets.delete(ip);
}, RATE_WINDOW_MS).unref();

// ---- per-day append stream (UTC day in the filename) ----
let streamDay = "";
let stream = null;
function dayStream() {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== streamDay) {
    stream?.end();
    stream = createWriteStream(path.join(DATA_DIR, `events-${day}.ndjson`), { flags: "a" });
    // An unhandled 'error' event would crash the process (seen in prod:
    // EACCES on a root-owned bind mount → crash loop, silent data loss).
    // Log it and force a reopen attempt on the next batch instead.
    stream.on("error", (err) => {
      console.error(`write stream error: ${err.message}`);
      streamDay = "";
    });
    streamDay = day;
  }
  return stream;
}

// Coarse visitor id: hash(ip + UTC day). Rotates daily, is never reversible
// to an address, and lets stats count unique devices per day.
function visitorHash(ip, day) {
  return createHash("sha256").update(`${ip}|${day}`).digest("hex").slice(0, 12);
}

// ---- la Classificació: the ONE arcade table for every vessel -------------
// The app's local board (apps/play/src/leaderboard.ts) mirrors these exact
// semantics: top 10 matches (not people), score desc, ties keep the earlier
// entry, the server stamps `at` (client clocks lie). Validation IS the
// anti-cheat: a score must be consistent with the formula's range for its
// (levelId, you, rival) — base × margin × style, style ∈ [1.0, 1.5] — the
// same numbers the client's pinned-score unit tests define. Retuning the
// formula means changing BOTH in one PR.
const TABLE_CAP = 10;
const TABLE_FILE = path.join(DATA_DIR, "classificacio.json");
const BASE_BY_LEVEL = { L1: 1000, L2: 2500, L3: 5000, L4: 10000 };
const GAME_WIN_SCORE = 10;

function loadTable() {
  try {
    const raw = JSON.parse(readFileSync(TABLE_FILE, "utf8"));
    if (raw && Array.isArray(raw.entries)) {
      return raw.entries.filter(
        (e) => e && typeof e.name === "string" && typeof e.score === "number" && typeof e.at === "string"
      ).slice(0, TABLE_CAP);
    }
  } catch {
    // missing or corrupt — the table opens empty, rungs unclaimed
  }
  return [];
}
let table = loadTable();

function saveTable() {
  try {
    const tmp = TABLE_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify({ version: 1, entries: table }));
    renameSync(tmp, TABLE_FILE);
  } catch (err) {
    console.error(`classificacio save error: ${err.message}`); // in-memory table still serves
  }
}

/** Trim to something a table row can wear: NFC, no control/zero-width
 * chars, collapsed whitespace, 12 chars max. Null when nothing survives. */
function sanitizeName(raw) {
  if (typeof raw !== "string") return null;
  const clean = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12)
    .trim();
  return clean.length ? clean : null;
}

/** A submitted entry, validated hard or null. */
function validateEntry(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const name = sanitizeName(raw.name);
  const base = BASE_BY_LEVEL[raw.levelId];
  if (!name || !base) return null;
  const { you, rival, score } = raw;
  if (you !== GAME_WIN_SCORE) return null;
  if (!Number.isInteger(rival) || rival < 0 || rival >= GAME_WIN_SCORE) return null;
  if (!Number.isInteger(score)) return null;
  const margin = 1 + (you - rival) / GAME_WIN_SCORE;
  const min = Math.round(base * margin); // style 1.0 — no data
  const max = Math.round(base * margin * 1.5); // style ceiling
  if (score < min || score > max) return null;
  return { name, levelId: raw.levelId, score, you, rival, at: new Date().toISOString() };
}

/** Ranked insert, the client's own semantics. Returns 1-based placement or
 * null when the entry misses the cut (table unchanged). */
function insertEntry(entry) {
  const next = [...table, entry].sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
  if (next.length > TABLE_CAP) next.length = TABLE_CAP;
  const placement = next.indexOf(entry);
  if (placement === -1) return null;
  table = next;
  saveTable();
  return placement + 1;
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok\n");
  }
  if (req.method === "GET" && req.url === "/classificacio") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ entries: table }));
  }
  if (req.method === "POST" && req.url === "/classificacio") {
    const ip0 = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
    if (!allowed(ip0)) {
      res.writeHead(429);
      return res.end();
    }
    const parts = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > 4096) {
        // one entry is a few hundred bytes; anything bigger is not a game
        res.writeHead(413);
        res.end();
        req.destroy();
        return;
      }
      parts.push(c);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      let entry = null;
      try {
        entry = validateEntry(JSON.parse(Buffer.concat(parts).toString("utf8")));
      } catch {
        // not JSON — falls through as invalid
      }
      if (!entry) {
        res.writeHead(422, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "invalid entry" }));
      }
      const placement = insertEntry(entry);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ entries: table, placement }));
    });
    req.on("error", () => {});
    return;
  }
  if (req.method !== "POST" || req.url !== "/log") {
    res.writeHead(404);
    return res.end();
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  if (!allowed(ip)) {
    res.writeHead(429);
    return res.end();
  }
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      res.writeHead(413);
      res.end();
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("end", () => {
    if (res.writableEnded) return;
    const day = new Date().toISOString().slice(0, 10);
    const rx = new Date().toISOString();
    const visitor = visitorHash(ip, day);
    const out = dayStream();
    let kept = 0;
    for (const line of Buffer.concat(chunks).toString("utf8").split("\n")) {
      const s = line.trim();
      if (!s || s.length > MAX_LINE) continue;
      try {
        const evt = JSON.parse(s);
        if (typeof evt !== "object" || evt === null || Array.isArray(evt)) continue;
        evt.rx = rx;
        evt.visitor = visitor;
        out.write(JSON.stringify(evt) + "\n");
        kept += 1;
      } catch {
        // not JSON — dropped, never appended raw
      }
    }
    res.writeHead(204, { "X-Kept": String(kept) });
    res.end();
  });
  req.on("error", () => {});
});

server.listen(PORT, () => {
  console.log(`morra collector on :${PORT}, appending to ${DATA_DIR}/events-<day>.ndjson`);
});
