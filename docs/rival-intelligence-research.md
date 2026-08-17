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
