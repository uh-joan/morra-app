// test.mjs — exercises the collector's Classificació endpoints against a
// live instance on a temp port/dir. Zero deps, plain asserts.
//
//   node deploy/collector/test.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 19310;
const DATA = mkdtempSync(path.join(tmpdir(), "morra-collector-test-"));
const child = spawn(process.execPath, [path.join(here, "collector.mjs")], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
  child.stdout.on("data", (d) => { if (String(d).includes("morra collector")) resolve(); });
  child.on("exit", (code) => reject(new Error("collector exited " + code)));
  setTimeout(() => reject(new Error("collector boot timeout")), 5000);
});

const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
function check(label, ok, detail = "") {
  if (ok) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${detail ? " — " + detail : ""}`); }
}
const post = (body) => fetch(`${BASE}/classificacio`, { method: "POST", body: JSON.stringify(body) });
const get = () => fetch(`${BASE}/classificacio`).then((r) => r.json());

// empty boot
check("boots with an empty table", (await get()).entries.length === 0);

// a valid entry takes the top
let r = await post({ name: "jani", levelId: "L1", score: 1200, you: 10, rival: 8 });
let j = await r.json();
check("valid entry accepted at 1st", r.status === 200 && j.placement === 1 && j.entries[0].name === "jani");
check("server stamps at", typeof j.entries[0].at === "string" && j.entries[0].at.includes("T"));

// formula clamp: 31000 is beyond El Rei 10-0's ceiling (30000)
r = await post({ name: "trampa", levelId: "L4", score: 31000, you: 10, rival: 0 });
check("forged score above the ceiling bounces 422", r.status === 422);
r = await post({ name: "trampa", levelId: "L1", score: 900, you: 10, rival: 9 });
check("score below the floor bounces 422", r.status === 422);
r = await post({ name: "rei", levelId: "L4", score: 30000, you: 10, rival: 0 });
check("the exact ceiling is legal", r.status === 200 && (await r.json()).placement === 1);

// shape violations
for (const [label, bad] of [
  ["no name", { levelId: "L1", score: 1200, you: 10, rival: 8 }],
  ["empty name after strip", { name: " ​ ", levelId: "L1", score: 1200, you: 10, rival: 8 }],
  ["unknown level", { name: "x", levelId: "L9", score: 1200, you: 10, rival: 8 }],
  ["non-winning tally", { name: "x", levelId: "L1", score: 1200, you: 9, rival: 10 }],
  ["float score", { name: "x", levelId: "L1", score: 1200.5, you: 10, rival: 8 }],
  ["array body", [1, 2, 3]],
]) {
  r = await post(bad);
  check(`invalid rejected: ${label}`, r.status === 422);
}
r = await fetch(`${BASE}/classificacio`, { method: "POST", body: "not json" });
check("invalid rejected: non-JSON body", r.status === 422);

// sanitization: long name capped at 12, controls stripped
r = await post({ name: "  Barba-rossa el Terrible  ", levelId: "L2", score: 3000, you: 10, rival: 8 });
j = await r.json();
const worn = j.entries.find((e) => e.name.startsWith("Barba"))?.name;
check("name sanitized + capped at 12", worn === "Barba-rossa", JSON.stringify(worn));

// tie keeps the incumbent
r = await post({ name: "segon", levelId: "L1", score: 1200, you: 10, rival: 8 });
j = await r.json();
const janiIdx = j.entries.findIndex((e) => e.name === "jani");
const segonIdx = j.entries.findIndex((e) => e.name === "segon");
check("tie keeps the earlier entry", janiIdx !== -1 && segonIdx === janiIdx + 1, JSON.stringify(j.entries.map((e) => e.name)));

// fill to the cap, then a low score misses the cut
for (let i = 0; i < 10; i++) await post({ name: `n${i}`, levelId: "L3", score: 6500 + i, you: 10, rival: 7 });
j = await get();
check("table capped at 10", j.entries.length === 10);
r = await post({ name: "tard", levelId: "L1", score: 1100, you: 10, rival: 9 });
j = await r.json();
check("below the cut: placement null, table unchanged", j.placement === null && j.entries.length === 10 && !j.entries.some((e) => e.name === "tard"));

// persistence: the json on disk mirrors the live table
const disk = JSON.parse(readFileSync(path.join(DATA, "classificacio.json"), "utf8"));
check("table persisted to classificacio.json", disk.entries.length === 10 && disk.entries[0].score === j.entries[0].score);

// /log unaffected
r = await fetch(`${BASE}/log`, { method: "POST", body: '{"sessionId":"t","type":"smoke"}' });
check("/log still answers 204", r.status === 204);
r = await fetch(`${BASE}/nope`);
check("everything else still 404s", r.status === 404);

child.kill();
console.log(`collector test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
