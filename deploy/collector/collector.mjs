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
import { createWriteStream, mkdirSync } from "node:fs";
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
    streamDay = day;
  }
  return stream;
}

// Coarse visitor id: hash(ip + UTC day). Rotates daily, is never reversible
// to an address, and lets stats count unique devices per day.
function visitorHash(ip, day) {
  return createHash("sha256").update(`${ip}|${day}`).digest("hex").slice(0, 12);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok\n");
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
