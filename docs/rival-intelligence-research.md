
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

## 8. First playtest (2026-08-17 evening): "seemed easy" — and it was, for one row

Jani played 100 rounds of El Rei on a fresh profile with the v2 engine:
**you 20, it 10; its aim 11% (below the 20% coin), your hit on it 21%.**
Worse than the spike. Replaying the *same engine* over the *same rounds*
told a different story — 32% argmax / 29% sampled — so the live brain
was not seeing the history I was replaying. Reconstructing the exact live
history from `ai_aim_result` (one event per persisted entry, burned voids
included, with the recognized call a voice-late throw still carries) and
matching the logged `fEdge` round by round: **117/118 live commits
reproduce exactly with the history one row short.**

The cause was ordering, not policy. Phase E mints the next commitment at
the phase-1 reveal — the instant the throw is detected, before the word
is recognized, before the round is judged, before the entry is written.
Phase G's comment says "feed the ladder BEFORE minting the next
commitment"; Phase E, later, silently broke it. So every read ran one
round stale, and the row it leans on hardest — last fingers, last total,
last outcome, my last fingers — was always the one missing. On today's
rounds that single row is the difference between reading you at 13% and
at 30%; the outcome swings from rival 10 / player 20 (live) to **rival
~22 / player ~11** (3 seeds, same rounds, one row later). Two-to-one the
other way.

Fix (`apps/play/src/game.ts`): the revealed move is *burned* at phase-1
(`currentAiMove = null` — the round keeps its own reference), and the
next commitment is minted by `ensureNextCommitment()` once the round is
recorded — resolved or void — with an onset-time mint only if a throw
arrives while the previous round is still resolving (logged as
`commit_minted_at_onset`, so it can be counted). Integration checks the
order `game_reveal < ai_aim_result < game_commit` and that a move is
sealed again after the round.

A second, smaller thing from the same rounds: the anti-aim at T=0.04
piled El Rei's fingers onto 1 and 5 (28% / 31%) because you look at 2
most — a static replay can't adapt, a person does, and your hit rate went
14% → 28% across the session. `antiT` 0.04 → 0.08 and the self-watch
temperature 0.12 → 0.25: on the corpus that costs ~0.3 pt of static
player-hit and halves the concentration.

Lesson for the evaluator: it replays *what the policy would decide given
the history*; it cannot see when the app hands the policy the wrong
history. Field traces (`fEdge` at commit) reconciled against a replay of
the persisted entries are the check — now a script,
`scripts/diag-live-vs-replay.mjs`.
