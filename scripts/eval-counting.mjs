#!/usr/bin/env node
// eval-counting.mjs — replay a recorded landmark corpus (apps/play, ?rec=1
// → "Exporta JSON") through every candidate finger-count rule and print
// per-truth accuracy + the confusion each rule makes. THE decision tool for
// changing countFingers: the 2026-08-16 console probe put the shipped rule
// at ~20% on 3s and 4s for one hand, and the fix must be picked on data.
//
//   node scripts/eval-counting.mjs <corpus.json> [more.json ...] [--settled] [--open[=1.4]]
//
// --settled : only frames the hand was HOLDING (count unchanged for the
//             surrounding ±3 frames of the shipped rule) — closer to what
//             the pipeline samples at settle; default is every frame.
// --open    : drop the between-throw FISTS a "throw"-style recording labels
//             with the truth. Openness = max over the 5 tips of tip-to-wrist
//             / wrist-to-middle-MCP; a fist sits ≈0.8–1.0, a shown hand
//             ≈1.6–2.5. Rule-independent (assumes only that a fist has
//             every tip near the palm), so fair to every candidate. Default
//             threshold 1.4 (the 2026-08-16 corpus is bimodal there).
//
// Needs @morra/recognition built (pnpm build). Unlabeled frames (truth
// null) are excluded from accuracy but reported.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REC = join(HERE, "..", "packages", "recognition", "dist", "index.js");
const { DEFAULT_CANDIDATES } = await import(REC);

const args = process.argv.slice(2);
const settledOnly = args.includes("--settled");
const openArg = args.find((a) => a.startsWith("--open"));
const openMin = openArg ? (openArg.includes("=") ? parseFloat(openArg.split("=")[1]) : 1.4) : null;
const files = args.filter((a) => !a.startsWith("--"));
if (!files.length) {
  console.error("usage: node scripts/eval-counting.mjs <corpus.json> [...] [--settled]");
  process.exit(2);
}

// ------------------------------------------------------------ load frames
let frames = [];
for (const f of files) {
  const doc = JSON.parse(await readFile(f, "utf8"));
  if (doc.kind !== "morra-landmark-corpus") {
    console.error(`${f}: not a morra-landmark-corpus`);
    process.exit(2);
  }
  frames.push(...doc.frames.map((fr) => ({ ...fr, file: f })));
}
const total = frames.length;
if (settledOnly) {
  const keep = [];
  for (let i = 0; i < frames.length; i++) {
    let stable = true;
    for (let d = -3; d <= 3 && stable; d++) {
      const j = i + d;
      if (j < 0 || j >= frames.length || frames[j].file !== frames[i].file) continue;
      if (frames[j].count !== frames[i].count) stable = false;
    }
    if (stable) keep.push(frames[i]);
  }
  frames = keep;
}
let droppedClosed = 0;
if (openMin != null) {
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const openness = (lm) => {
    const palm = d3(lm[0], lm[9]) || 1e-6;
    return Math.max(...[4, 8, 12, 16, 20].map((i) => d3(lm[0], lm[i]))) / palm;
  };
  const before = frames.length;
  frames = frames.filter((f) => openness(f.lm) >= openMin);
  droppedClosed = before - frames.length;
}
const labeled = frames.filter((f) => f.label != null);
const unlabeled = frames.length - labeled.length;
const toLm = (fr) => fr.lm.map(([x, y, z]) => ({ x, y, z }));

console.log(`corpus: ${files.length} file(s), ${total} frames` + (settledOnly ? ` → settled` : "") + (openMin != null ? ` → open≥${openMin} (dropped ${droppedClosed} closed)` : "") + ` → ${frames.length} used, ${labeled.length} labeled, ${unlabeled} unlabeled`);
const perTruth = {};
for (const f of labeled) perTruth[f.label] = (perTruth[f.label] ?? 0) + 1;
console.log("frames per truth: " + Object.entries(perTruth).sort().map(([k, v]) => `${k}:${v}`).join("  "));
console.log();

// --------------------------------------------------------------- evaluate
const truths = Object.keys(perTruth).map(Number).sort();
const rows = [];
for (const rule of DEFAULT_CANDIDATES) {
  const conf = {}; // truth -> predicted -> n
  let ok = 0;
  for (const f of labeled) {
    const p = rule.count(toLm(f));
    ((conf[f.label] ??= {})[p] ??= 0);
    conf[f.label][p]++;
    if (p === f.label) ok++;
  }
  const perT = {};
  for (const t of truths) {
    const n = perTruth[t];
    perT[t] = n ? (conf[t]?.[t] ?? 0) / n : null;
  }
  // worst-class accuracy is what matters in a game: one bad number ruins it
  const worst = Math.min(...truths.map((t) => perT[t] ?? 1));
  rows.push({ rule, overall: ok / labeled.length, perT, worst, conf });
}
rows.sort((a, b) => b.worst - a.worst || b.overall - a.overall);

// ---------------------------------------------------------------- report
const pct = (x) => (x == null ? "  – " : String(Math.round(x * 100)).padStart(3) + "%");
console.log("rule".padEnd(20) + " overall  worst  " + truths.map((t) => `  t=${t}`).join(""));
for (const r of rows) {
  console.log(r.rule.id.padEnd(20) + " " + pct(r.overall) + "   " + pct(r.worst) + "  " + truths.map((t) => " " + pct(r.perT[t])).join(""));
}
console.log();
console.log("confusions (truth → what it read, top 3 wrong):");
for (const r of rows.slice(0, 4)) {
  console.log(`  ${r.rule.id} — ${r.rule.describe}`);
  for (const t of truths) {
    const wrong = Object.entries(r.conf[t] ?? {})
      .filter(([p]) => Number(p) !== t)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([p, n]) => `${t}→${p}:${n}`)
      .join("  ");
    if (wrong) console.log(`    truth ${t}: ${wrong}`);
  }
}
console.log();
console.log(`best by worst-class accuracy: ${rows[0].rule.id}  (shipped: worst ${pct(rows.find((r) => r.rule.id === "shipped").worst)})`);
