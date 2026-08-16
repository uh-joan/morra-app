# Finger counting accuracy — probe, diagnosis, and the corpus plan (2026-08-16)

**Status:** the shipped rule is measurably wrong on 3s and 4s. Nothing about
the rule has been changed except closing one thumb route (below). The fix
will be picked by `scripts/eval-counting.mjs` on a recorded landmark corpus,
not by eye.

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
