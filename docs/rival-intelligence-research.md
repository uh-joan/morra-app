
---

## 7. What shipped (same day) — and what the measurements overruled

`packages/core/src/ai2.ts` (`decideMoveV2` / `predictPlayerFV2`), the app's
engine from now on; `?rival=spike` restores `ai.ts`. `ai.ts` is untouched
(the conformance corpus pins it). Every number from `scripts/eval-rival.mjs`
over the 992–1,018 logged rounds with ≥ 5 rounds of in-session history.

| L4 | aim argmax | aim sampled | player-hit | rival wins | player wins |
|---|---|---|---|---|---|
| spike engine (deployed until now), clean data | 22.2 | 22.1 | 21.5 | 17.8 | 17.2 |
| v2 as first written (BMA η=1, invert-anti-aim, calibrated τ) | 24.7 | 24.0 | 20.6 | 18.6 | 15.1 |
| + softmax anti-aim (antiT 0.04) | 25.0 | 24.0 | 18.4 | 18.5 | 12.9 |
| + hedged BMA (η 0.3) with the o1+marginal blend as a candidate | 26.6 | 24.5 | 17.9 | 19.4 | 12.8 |
| **+ fixed cold τ (L4 0.15) — shipped**, mean of 3 seeds | 26.6 | 22–25 | 17–18 | **19.7** | **13.3** |
| *(ceiling: argmax both channels, Python)* | 27.5 | — | 15.3 | 23.4 | 11.2 |

Three things the data overruled in the plan:

1. **BMA at η=1 lost to a fixed 50/50 blend** of order-1 and marginal (24.7
   vs 26.8 argmax): the human is better described by a mixture than by any
   one context, and a proper Bayesian selector concentrates. Hedged (η 0.3)
   and offered the blend as a candidate, it matches the blend and adapts.
2. **`invert(q)` was too flat to bite** — normalized 1−q turns q=.30 vs .15
   into .175 vs .21. Anti-aim is now `softmax(−q/T)`, T=0.04, over the 8%
   floor: player-hit 20.6 → 17–18%.
3. **Calibrated τ never activated.** The ensemble's log-loss edge over
   uniform is ≈0 nats even where its argmax hits 26% (smoothed predictors are
   overconfident in log-loss terms), and early-match beliefs are nearly flat,
   so τ 1 → 19% sampled aim, 0.35 → 20%, 0.05 → 24%. The God gets a fixed
   cold τ (0.15), Mercè 0.5, both over the 8% floor. The calibration stays a
   knob (`V2_TUNING.edgeMode`, `tauFixed*`).

Still on the table: the Iocaine level-2 layer, Nino's human template,
"show the read" in L'Espill, cross-match memory evaluated per *profile*
(the logs pool players, so `--cross` conflates people today).
