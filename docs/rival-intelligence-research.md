# The rivals' intelligence — what the data says, the math, and the plan

*2026-08-17. Research pass before touching `packages/core/src/ai.ts`. Every
number below is computed from the repo's own logs (`spikes/logs/*.ndjson`,
1,202 resolved rounds across 39 sessions, all players pooled unless stated) —
the analysis script is `scripts/eval-rival.mjs`'s ancestor and will become it.*

## 0. TL;DR

1. **The ladder is upside down in the field.** Live aim (rival's guess = your
   fingers): L1 **19.8%**, L2 14.8%, L3 14.3%, **L4 12.3%** — the "God" aims
   worse than the Apprentice, and worse than chance. Cause: L4 guessed **"1"
   on 50% of its throws** — it learned the retraction phantoms (the fist
   coming down was recorded as a throw of 1 for weeks; fixed on the pipeline
   side in #10, but the persisted player models still carry it).
2. **Humans here are readable, but on a specific channel and per person.**
   Pooled, the best simple predictor reaches **~25–26% on your fingers** and
   **~28% on your guesses**; individual sessions reach 30–38%. Three tells
   are strong and stable (§2).
3. **The achievable edge is large.** Replaying an ideal decoupled policy
   (best-context aim + joint anti-aim) against the real rounds: **rival wins
   23.4% of rounds, player 11.2%** — a 2:1 edge — vs the current L4's actual
   16 / 17 (it loses). Sampling instead of argmax gives most of it back;
   there is a principled middle (§4).
4. **The current design is right; the implementation leaves the edge on the
   table.** The (f, g) decomposition and the four-level ladder stand. What's
   missing: a per-context model selection that actually beats the marginal,
   the *joint* f→g anti-aim the doc planned, calibrated exploitation instead
   of fixed temperatures, a self-watch against being read, and clean data.
5. **The rival must be measured, not eyeballed.** Every change to `ai.ts`
   should be replayed against the logged rounds by a script in the repo.

## 1. What the rounds look like

| | |
|---|---|
| Rounds (resolved, `game_reveal`) | 1,202 in 39 sessions |
| Verdicts | parata **67%**, rival 16%, player 17% (theory at equilibrium: 68 / 16 / 16 — the game is played fairly) |
| Player fingers f | 1: 13% · 2: 17% · 3: 25% · 4: 20% · 5: 26% |
| Player guess g (= call − f) | 1: 17% · 2: 21% · 3: 17% · 4: 18% · 5: 23% (2% impossible calls — recognizer/word errors) |
| Player hits rival fingers | 21.1% |
| Rival hits player fingers | **19.7%** — chance |
| Rival's guess distribution | 1: **30%** (should be ~20%) |

So today the human is at chance-plus and the machine is at chance. Note that
*always guessing 5* (26%) would already beat the deployed rival.

## 2. The tells (measured)

**T1 — Win-shift, not win-stay.** P(repeat own fingers): 0.16 overall (uniform
0.20); **after a round the player won: 0.10**; after the rival won: 0.16;
after a parata: 0.18. Morra players who just scored feel "read" and change.
This is the *inverse* of the win-stay/lose-shift the RPS literature reports
([Wang, Xu & Zhou 2014](https://www.nature.com/articles/srep05830)) — a
morra-specific dynamic worth its own predictor (`prev_outcome`, already the
best single context on several sessions).

**T2 — The guess chases the rival's last fingers.** P(player's guess = the
rival's *previous* fingers) = **0.26**. Players expect the rival to repeat.
Consequence for anti-aim: the rival should almost never be where it just was.

**T3 — The call is welded to the fingers.** Guess given own fingers:

| f | g=1 | 2 | 3 | 4 | 5 | most likely call |
|---|---|---|---|---|---|---|
| 1 | .13 | .17 | .16 | .21 | **.33** | 6 |
| 2 | .15 | **.39** | .08 | .16 | .23 | 4 (doubling) |
| 3 | .20 | .14 | .18 | .11 | **.37** | 8 |
| 4 | .17 | .20 | .19 | .25 | .19 | 8 |
| 5 | .21 | .21 | .23 | .23 | .12 | 9 (avoids «tot») |

The player's guess is conditionally predictable from their own throw. The
rival can't see the throw at commit — but it can marginalize:
`q(g) = Σ_f p(f)·p(g|f)`, sharper than the g marginal. That is the joint
model the design doc planned for L4 and the code never got.

**T4 — Repetition avoidance / alternation** in general (0.16 vs 0.20),
consistent with the human random-sequence literature (negative recency;
[Frontiers 2023](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1113654/full)),
with the twist that people trying to be *unpredictable to an opponent* become
more predictable, not less
([bioRxiv 2025](https://www.biorxiv.org/content/10.1101/2025.11.16.688665.full.pdf)).

**Per person, not per population.** Best argmax-hit on f / g by session
(min 5 rounds of history): 28/35, 24/38, 28/37, 31/27, **35/28**, 27/31,
34/26, 22/38 … and some at chance. Which *context* wins also differs by
person (marginal for one, order-1 for another, `prev_ai_f` for a third). The
rival must select the context per player, online.

## 3. The math

A morra action is (f, c) with c = f + g: **f = what I show, g = what I guess
you show.** I score iff `g_me == f_you AND g_you != f_me` (design doc §1).

Per round, with the rival's belief p(·) over the player's next f and q(·)
over the player's next g:

```
P(rival scores)  = p(g_ai) · (1 − q(f_ai))
P(player scores) = q(f_ai) · (1 − p(g_ai))
```

The two channels **decouple**: choose `g_ai` to maximize p (aim), choose
`f_ai` to minimize q (anti-aim). Nothing couples them except the joint model
that sharpens q. At equilibrium (uniform p, q) both sides score 16%, parata
68% — the game's baseline; every point of p above 0.2 and of q below 0.2 is
pure edge, and it compounds over first-to-10.

Two things break the argmax fantasy:

- **Being read.** The player sees f_ai every round. A rival that always throws
  the number you never guess becomes predictable in *its own* f within a few
  rounds; the human's q moves, the edge inverts. So f_ai must be *mixed* —
  and the amount of mixing should follow how readable the rival currently
  is (§4, "self-watch").
- **Small-sample overconfidence.** Sessions have 5–150 rounds. A context that
  looks 40%-predictive after 6 samples is noise. Bayesian model averaging by
  *predictive log-likelihood* (not by argmax hit-rate, which is what the
  current meta-hedge scores) is the right selector; Dirichlet(0.5) smoothing
  keeps early distributions honest.

**Replay of policies against the real rounds** (open-loop — the humans were
playing the deployed rival, so a sharper rival would perturb them somewhat;
still the standard offline measure):

| policy | rival aim | player hit | rival wins | player wins | parata |
|---|---|---|---|---|---|
| uniform / uniform (= L2) | 21.7 | 19.1 | 17.7 | 15.1 | 67.1 |
| aim only, f uniform (≈ L3), argmax | 27.5 | 17.4 | 22.8 | 12.7 | 64.5 |
| aim + anti-aim (g marginal), argmax | 27.5 | 16.6 | 22.9 | 12.0 | 65.1 |
| **aim + anti-aim (joint f→g), argmax** | 27.5 | **15.3** | **23.4** | **11.2** | 65.4 |
| same, sampled τ = 0.5 | 24.3 | 20.4 | 19.1 | 15.1 | 65.8 |
| same, sampled τ = 0.3 | 23.9 | 15.9 | 20.8 | 12.8 | 66.4 |
| *deployed L4, actual* | *19.7* | *21.1* | *≈16* | *≈17* | *≈67* |

## 4. Proposal — same ladder, an engine that earns it

**One engine, four parameter presets** (the pirates stay presentation):

| | aim (g) | anti-aim (f) | memory | mixing | self-watch |
|---|---|---|---|---|---|
| **Nino** (L1) | none — uniform | *human-beginner tells*: win-shift 10%, repeat 16%, guess chases its own last f — the measured human template, so a beginner learns to read a beginner | none | fixed | no |
| **Bru** (L2) | uniform | uniform | none | — | — |
| **Mercè** (L3) | BMA over contexts, in-match | uniform (doesn't hide — her arrogance) | this match | τ ≈ 0.7 | no |
| **El Rei** (L4) | BMA over contexts + Iocaine-style *predict-the-predictor* layer | **joint f→g** anti-aim + T2 (never where it just was) | cross-match, cleaned | **calibrated**: τ from the model's recent log-loss edge over uniform, floor 8% uniform | **yes**: if the player's hit rate on f_ai over the last 20 rounds > 24%, widen τ |

Concretely, in `ai.ts`:

1. **Context predictors** as pure functions over history: marginal, freq
   (half-life 20), order-1, order-2 (min 2 samples), `prev_outcome`
   (T1), `prev_ai_f`, `prev_g`, `prev_total`, `outcome+prev_f`. Each returns a
   Dirichlet(0.5)-smoothed distribution.
2. **BMA selector**: weight_i ∝ exp(η · decayed Σ log p_i(actual)), decay
   0.98, η 1. Replaces the argmax-hit meta-hedge. Same call for the g
   channel, plus the **joint** predictor `Σ_f p(f)·p(g|f)`.
3. **Level-2 layer (Iocaine)**: run the same BMA on the *rival's own* past
   moves as the player would see them; if the player is tracking the rival's
   f (their g predicts our f), the anti-aim uses the player's *predictor of
   us*, not just their marginal g. This is what turns T2 into a weapon
   rather than a leak.
4. **Calibrated exploitation**: τ = clamp(1 − k·edge), where edge = decayed
   (log-loss_uniform − log-loss_model). No edge → uniform (the equilibrium
   floor, unchanged principle). Strong edge → τ toward 0.3. Never below an
   8% uniform floor.
5. **Self-watch**: track the player's hit rate on f_ai (they see it every
   round). Above 24% over 20 rounds → widen τ on the f channel and shift the
   anti-aim to the level-2 predictor. This is the "God does not tilt"
   guarantee made adaptive.
6. **Data hygiene** — the actual cause of the inverted ladder: the model
   must learn only from **resolved or revealed** throws (a synced round, or a
   revealed hand-only/void), never from incompletes with fingers ≤ 1. Existing
   profiles: on load, drop history entries with `syncOutcome` voice-early /
   incomplete and `playerFingers ≤ 1` (the phantom signature); log how many.
   Jani's `pmst82zczsd` profile carries dozens.
7. **The evaluator** — `scripts/eval-rival.mjs`: replays every level's real
   `decideMove`/`predictPlayerF` (from `packages/core` dist) over the logged
   `game_reveal` rounds and prints per-level aim, player-hit, and the
   round-outcome table above, per session and pooled. A change to `ai.ts` is
   accepted when it moves this table, not because it sounds clever. The
   existing `ai_aim_result` telemetry gives the *live* curve to compare.

## 5. Bonus — closing the loop with L'Espill

- **Show the read.** After a match: "El Rei t'ha llegit així: després de
  guanyar canvies de dits el 90% — ho sabia." The mirror and the rival share
  one engine; today the mirror shows exploitability as a number, it should
  show the *tell the rival used*.
- **Nino as the human template.** L1's tells become the measured beginner
  tells (T1–T3), so a new player literally learns to read *themselves*.
- **The «tot» card.** T3 says people avoid «tot» on a 5 (12%) — the one
  place a 5-thrower is safe from being read is the call they never use.
  Coach it.

## 6. Caveats, stated

- Pooled data mixes players (the field day was other people); per-person
  numbers are small-n. The engine must be *online per profile*; the pooled
  numbers bound the population, not any one player.
- The replay is open-loop; a human facing a sharper rival adapts. That's
  what the self-watch is for, and why the sampled rows matter more than the
  argmax rows.
- The recognizer's word errors leak into g (2% impossible calls); the
  joint model should ignore g outside 1–5.

## Sources

- Wang, Xu & Zhou, *Social cycling and conditional responses in the RPS
  game*, Sci. Rep. 2014 — win-stay/lose-shift in humans:
  https://www.nature.com/articles/srep05830
- Egnor, *Iocaine Powder* (RoShamBo 1999) — predict-the-predictor
  meta-strategy: https://github.com/erdman/roshambo · https://icga.org/icga/games/roshambo/
- Human random-sequence biases (repetition avoidance / alternation):
  https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1113654/full
- *The Paradox of Unpredictability* (2025) — trying to be unpredictable
  makes sequences more predictable:
  https://www.biorxiv.org/content/10.1101/2025.11.16.688665.full.pdf
- Two-finger morra equilibrium (7/12, 5/12) as a textbook anchor:
  https://ocw.mit.edu/courses/17-810-game-theory-spring-2021/mit17_810s21_lec3.pdf

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

## 9. Steps 4–5 (2026-08-17, night): the second guess, Nino the human, the read shown

**The fix, confirmed in the field.** After §8's mint-order fix, 77 rounds
of El Rei on the same profile: **El Rei 20, player 6**; aim 29% (the
replay predicted 29%); the player's hit on it 10% and falling (13→8);
`fEdge` reproduces exactly at lag 0 (0/79 at lag 1 — the staleness is
gone); the onset-time mint fired 2× in 80 (the rare fast-rhythm race, as
designed). Fingers 17/10/10/23/17.

**Iocaine, gated.** Three level-2 hypotheses about a player who is
reading the *rival* — "you guess where I usually am" (decayed frequency
of my fingers), "you guess anything but where I just was", and "your
guess follows my last guess" (`prevAiG` context) — as candidates in the
g-channel BMA. On the static corpus the layer is a wash (26.4 → 26.1
argmax when the f-side `prevAiG` was in; removed from f, neutral on g):
logged players didn't adapt to a rival that didn't exist. So it enters
**only when the self-watch trips** (player hit rate on our fingers >
24%) — a second guess for a reader, dilution for no one else.

**Nino, the human template.** L1 no longer plays the spike's stylized
tells; it plays the measured human beginner (§1–2), amplified ×2 in log
space so a first reader can find them: fingers 9/15/27/21/28 (3 and 5
heavy, 1 light), repeats 15% (10% after scoring — win-shift), the guess
chases the player's last fingers ~39%, the call welded to the fingers
(shows 2 → calls 4 half the time). These are the same tells L'Espill
names in the player's own game — reading Nino is practice for reading
people. Its aim stays at chance-minus, by design: chasing a player who
repeats 16% hits less than a coin.

**The read, shown.** L'Espill gets "El que veu El Rei": *what it thinks
you'll throw* (the BMA belief, the top digit named — "Ara mateix, El Rei
apostaria que tiraràs 4 (30%)" — or "no et veu cap costum clar" when
nothing clears 26%), *what guides it* (the top contexts by BMA weight, in
words: "els teus dos últims números 26% · el que acabes de tirar 18%"),
*where it thinks you'll look* (the g belief), and the self-watch line
("Tu li has llegit els dits el 15% de les últimes rondes"). `explainReadV2`
in core is the same functions the policy uses; the panel only formats.
Under 8 rounds it says so.
