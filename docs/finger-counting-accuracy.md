# Finger counting accuracy — probe, diagnosis, and the corpus plan (2026-08-16)

**Status (evening of 2026-08-16): fixed on data.** The corpus was recorded,
the evaluator picked the rule, and it ships: the thumb is judged by the
angle at its MCP joint. On held frames truth 4 went **63% → 99%**; overall
**93% → 98%**. Details in "The corpus, and what it said" below; the probe
and diagnosis that led there follow unchanged.

## The probe

Janis reported: throws *toward* the camera read well, flat "shows" less so.
A console probe over `__play.handFrameHistory` + `__play.syncThrows`
(no code change) captured 74 onsets in L'Espill — batches of ~10 throws
each, labelled thrust/flat × truth 3/4, fist between throws. Per onset it
recorded the count the pipeline sampled at settle, the dominant count over
the next 300 ms, and the raw count sequence during and after the motion.

### Result

Sampling is **not** the problem: the sampled frame disagreed with the
following 300 ms on 3 of 74 onsets (4%). **The rule is.** Splitting the
onsets into real throws vs the return-to-fist (each cycle logs two):

| batch | real throws | read correctly | misreads |
|---|---|---|---|
| thrust 4 | 13 | **2** (15%) | →3 ×8, →5 ×3 |
| flat 4 | ~9 | **2** (22%) | →5 ×3, →2 ×3, →3 ×1 |
| thrust 3 | 5 | **1** (20%) | →2 ×2, →4, →5 |
| flat 3 | 10 | **2** (20%) | **→2 ×6**, →4, →5 |

- Thrust vs flat: no meaningful difference. The original impression was
  the small-N feel of a rule that's ~20% right on 3/4 for this hand.
- Errors are systematic: **4→3 and 3→2** (a finger — the ring, most
  likely; it physiologically can't fully straighten with the pinky folded —
  failing the tip-vs-PIP ×1.05 wrist-distance margin) and **4→5** (thumb
  counted).
- Every return to fist read **1** (~35 of ~37) — the field-log finding
  (fc=1 on 53% of resets) reproduced on one hand. The throw-of-one reveal
  rule's pre-onset guard exists because of exactly this.

## Why the rule fails (structural, not tuning)

`countFingers` judges "extended" as *tip farther from the wrist than the
PIP joint by 5%*, in 3-D, where the third axis is MediaPipe's *estimated*
depth. A distance-to-wrist ratio is orientation- and foreshortening-
sensitive; a half-straight ring finger sits right at the 5% margin in many
poses. Both thumb rules (the spike's lateral one and r2's thumbs-up one)
are 3-D too, so a thumb tucked *toward* the lens gains Δz and can clear
either. A finger's **curl angle** at its joints is invariant to all of that
— it's the obvious candidate, and it must be validated on data.

## What changed now (small, safe)

The r2 thumbs-up wrist rule is **gated on the other four fingers being
folded** — a thumbs-up "1" is by definition thumb + fist. It can therefore
only ever turn a 0 into a 1, closing the 4→5 route it may have opened; a
thumb next to open fingers is judged by the spike's lateral rule alone,
exactly as before r2. (That lateral rule shares the depth sensitivity —
the corpus measures it; not touched.)

## The corpus plan

1. **Record** — `apps/play` with `?rec=1&tecnic=1` shows a *Corpus de
   dits* strip in the tècnic drawer (also `window.__rec`). Start camera,
   press **R** (or ▶ Grava), then for each number: press the digit key
   **0–5** to set the truth and throw / hold / rotate the hand for ~20 s —
   thrust, flat, palm-in, palm-out, pointing at the lens, high and low in
   frame. Repeat for a second hand if one is around. **■ Atura → ⤓ Exporta
   JSON.** ~2 minutes of hand = a few thousand labelled frames.
2. **Evaluate** — `node scripts/eval-counting.mjs <file.json> [--settled]`
   replays every candidate in `@morra/recognition/countingCandidates`
   (shipped, spike-verbatim, ratio margin sweep, curl-angle 2-D/3-D at
   several thresholds, curl-both-joints, curl + shipped-thumb) and prints
   overall / **worst-class** / per-truth accuracy and each rule's top
   confusions. Worst-class is the ranking key: one bad number ruins a game.
3. **Decide** — ship the winner behind a config flag; keep the spike's
   `countFingers` byte-identical for parity; add the corpus (or a
   subsample) to `packages/recognition/test` as a fixture so the number
   never regresses silently.

Synthetic smoke (clean hands; a hard set with fingers pointed at the lens
and a lagging ring): the tool discriminates — the curl+shipped-thumb family
holds 100% on the hard set while 2-D angle variants collapse under
foreshortening and thumb-by-angle mis-fires on a lens-tucked thumb (so
those are already known-bad shapes). The synthetic hands did **not**
reproduce the probe's 4→3 failure, which is the point: only a real corpus
can pick the rule.

## The corpus, and what it said (same evening)

Janis recorded 2,901 frames (one hand, 480×360, truths 1–5 — no 0) with
the `?rec=1` recorder. Two things the raw evaluator run made obvious:

1. **My "throw"-style protocol polluted the labels.** Every batch carried
   the between-throw fists and the motion frames, labelled with the truth
   — every rule scored ~57% with →0/→1 dominating every confusion. The
   data is bimodal on hand *openness* (max tip-to-wrist / palm size:
   fists ≈0.8–1.0, shown hands ≈2.0–2.5), so `--open` (rule-independent:
   assumes only that a fist has every tip near the palm) drops the fists;
   `--settled` drops the transitions. On **held, open frames (n=1,025)**
   the shipped rule read 100/99/96/**63**/97% on truths 1–5.
2. **The counting is thumb-first.** 1 = thumb only, 2 = thumb + index,
   3 = thumb + index + middle, 5 = all — and **4 is the only number where
   the thumb must read folded.** So the thumb rule matters on every
   number, and 4 is exactly where the spike's lateral ratio breaks:
   folded-across-the-palm 1.05–1.23 vs extended 1.13–1.23 — **overlap** —
   which read a 4 as 5 on 36% of held frames.

Feature scan on the open frames, truth 4 (thumb folded) vs 1/2/3/5 (thumb
extended): the **angle at the thumb MCP** (CMC–MCP–IP) separates cleanly —
folded p50 140°, p90 **156°**; extended p10 **≥170°**. So does the tip/IP
wrist ratio (folded p90 1.17, extended p10 ≥1.19) but with far less margin.

`node scripts/eval-counting.mjs <corpus> --open --settled`:

| rule | overall | worst | t1 | t2 | t3 | t4 | t5 |
|---|---|---|---|---|---|---|---|
| **thumbMcp>160°** (ships) | **98%** | **96%** | 99 | 99 | 96 | **99** | 97 |
| thumbMcp>155° / >165° | 98% | 96% | 100/98 | 99/97 | 96 | 96/99 | 97 |
| shipped-before (lateral) | 93% | 63% | 100 | 99 | 96 | **63** | 97 |
| spike verbatim | 93% | 63% | 100 | 99 | 96 | 63 | 97 |
| ratio margin sweep | 93% | 63% | — | — | — | 63 | — |
| curl-angle family | ≤86% | ≤56% | | | | | |

The curl-angle candidates for the four fingers did **not** beat the spike's
wrist-distance ratio — the ratio was never the problem for the fingers on
this hand (t3 96%, t5 97% either way). The residual on 3 (96%) is 3→1
transitions surviving `--settled`, not a rule error.

### What ships

- `countFingers`: four fingers unchanged (spike ratio ×1.05); **thumb
  extended iff angle at thumb MCP > 160°** (`THUMB_MCP_STRAIGHT_DEG`).
  Handles the thumbs-up 1 directly, so the r2 wrist-ratio rule and its
  gate are gone. Both copies (module + worker Blob) updated; the drift
  test covers the new poses.
- `countFingersSpike`: the verbatim spike rule, kept for the evaluator
  baseline and the `?count=spike` field fallback (`page_load` logs
  `fingerCountRule`).
- **Regression fixture** `packages/recognition/test/fixtures/
  counting-corpus-2026-08-16.json`: 40 held/open frames per truth,
  stride-subsampled. The suite asserts ≥95/95/90/95/93% (measured
  99/99/96/99/97) and that the spike rule reads 4 below 75% — so the
  number cannot regress silently, and the *why* is executable.

### Caveats, honestly

One hand, one camera, one session, one lighting. 160° sits in a 14° gap on
this hand; a different thumb might sit closer. The fallback flag exists
for exactly that. Next recording — a second person, ideally with the
"hold, don't throw" protocol — should be appended to the fixture, not
replace it.

The recording protocol above should read **hold** each number for ~20 s
and rotate the hand, not throw; `--open --settled` recovers a throw-style
recording but wastes ~2/3 of the frames.
