# Rival AI & Player Mirror — Design

*2026-08-09. Feeds spike phases F–H; later migrates to `packages/core/src/ai`.*

## 1. The decomposition that makes morra AI tractable

A morra action is `(f, c)`: fingers thrown, total called. But since `c = f + g`, every
action is really **`(f, g)`: what I show, what I guess YOU will show** — both in 1–5.
The verdict in these terms:

> **I score iff `g_me == f_opp` AND `g_opp != f_me`.**

So morra is two independent skills per throw:
- **Aim** — predict the opponent's fingers (your `g`)
- **Stealth** — make your own fingers unpredictable (your `f`)

This 5×5 space is what the AI reasons in, what the analytics display, and what makes
"reading" a player meaningful: a human leaks patterns in *both* channels — their `f`
sequence AND their `g` habits (the user calls "vuit" a lot: with varied `f`, that's a
varied `g`; with constant `f=5`, it's a constant `g=3` — a tell in the joint space).

**Baseline math** (both sides uniform): P(hit) = 1/5 each way, independent →
P(parata) = 1 − 2·(1/5·4/5) = **68%**. Parata-heaviness is intrinsic to fair play,
NOT a bug — observed 58–81% across the user's sessions matches. Drama comes from
exploitation: every % the AI (or player) predicts above 20% converts paratas into
points. Research anchor: beginners are heavily patterned (15.5% redundancy), experts
near-random (3.31%) with poor self-awareness (Delogu 2020, in the research doc) —
which is why the ladder and the mirror are two views of the same engine.

## 2. The ladder — four rivals

All levels share the fairness invariants (§4). Differences are purely policy.
Names are placeholders; each level is a personality seed for the future roster.

### L1 — L'Aprenent (the apprentice) — *designed to be read*
- `f`: biased (favors 2 and 5, ~35% repeat-after-scoring) → the player CAN learn
  its tells and punish them. Tells are honest, stable, and discoverable.
- `g`: uniform random (it doesn't read you at all).
- Teaching goal: the player discovers that *watching the rival's habits works*.

### L2 — El Jugador (the honest player) — *the equilibrium wall*
- `f`: uniform. `g`: uniform. Unexploitable, non-exploiting.
- This is fair morra: ~68% parata, pure chance-with-ritual. The control group.

### L3 — El Vell de la Taverna (the tavern veteran) — *reads you, this match*
- `g`: aims using an **in-match predictor ensemble** over the player's `f` history
  (order-1/order-2 n-grams with backoff, global frequency, win-stay/lose-shift
  conditioned on last outcome), recency-decayed (half-life ≈ 20 throws).
- `f`: uniform (doesn't bother hiding — its arrogance is its weakness).
- Exploitation is **confidence-scaled**: predicted distribution is mixed toward
  uniform by λ = n_eff/(n_eff+8); guesses are **sampled** from the sharpened
  distribution (temperature τ=1), never argmax — argmax is itself a tell.

### L4 — El Déu de la Morra — *reads you across your whole life*
- Everything L3 does, plus:
  - **Cross-match persistent player model** (localStorage profile; the plan's
    `PlayerModelStore` port) — it remembers you between sessions.
  - **Joint (f,g) modeling**: learns your finger–call correlations
    ("when he calls vuit he shows 5").
  - **Anti-aim `f`**: models YOUR `g` habits from your calls and samples its own
    fingers inversely to your predicted guess — it hides where you don't look.
  - **Meta-hedge** (lightweight Iocaine): maintains 4–6 predictors, tracks each
    one's recent hit-rate with exponential decay, and weights them multiplicatively
    — so when the player *adapts*, the ensemble follows within a few throws.
  - Sharper temperature (τ=0.6) and λ half-saturation at n=4: it commits to reads
    fast, but the equilibrium mixing floor guarantees it is **never worse than L2**
    even against a perfectly random player. God does not tilt.

**Expected feel**: L1 loses to attentive play; L2 is a coin ritual; L3 punishes
lazy patterns within a match; L4 feels like it knows you — because it does, and the
mirror (§3) can prove exactly what it knows.

## 3. The Player Mirror — "L'Espill"

Training analytics from the same engine, always available (panel + post-match):

1. **Randomness score**: Shannon redundancy of your `f` sequence, displayed against
   the research benchmarks (expert ≈3%, beginner ≈15%). Your number, tracked over
   sessions.
2. **Distributions**: your `f` histogram, your `g` histogram (from `c − f`), most
   common calls/words.
3. **Sequences**: bigram heatmap (after a 3 you throw…), repeat rate,
   win-stay/lose-shift bias.
4. **Tells**: strongest finger–call correlations, stated plainly
   ("after losing, you throw 5 twice as often").
5. **Exploitability meter** — the headline number: run L4's predictor over your own
   history; the % of throws it would have called correctly. 20% = unreadable
   (equilibrium); 40%+ = an open book. This is the honest "how good am I really"
   metric, and it's also literally the AI's aim accuracy against you.
6. Timing you already have (sync %, median |Δ|) alongside, per session.

Persisted per player profile (localStorage), exportable JSON, fed by the existing
event bus — the mirror and the rival share one `PlayerModel` implementation.

## 4. Fairness invariants (unchanged, now load-bearing)

- The AI decision `(f, g)` is computed **at commit time**, from history strictly
  before the current throw, then sealed (SHA-256 commit as today). Reveal on the
  player's throw; burned if the throw voids. Nothing about the pending throw —
  including partial recognition — may reach the policy.
- Policy stays a **pure function** of (rng, playerModelSnapshot, history) so the
  transcript replay of the plan's fairness design remains possible; the model
  snapshot hash goes into the debug/event log per throw.
- The mirror never shows the player anything the AI "knows" about the *pending*
  committed move.

## 5. Validation (telemetry-driven, real sessions)

- Log per throw: level, predicted distribution, actual player `f`, hit/miss of `g`,
  λ, chosen predictor weights (L4). This gives per-level **aim accuracy** curves.
- Expectations to check against live logs: L2 aim ≈20%; L3/L4 aim vs the user
  climbing above 30% within a match (his vuit-bias is measurable); parata rate
  falling as level rises; L4 ≥ L2 always.
- Fun check (the real gate): does the user *choose* to keep playing L3/L4?

## 6. Build phases

- **F — module extraction** (pre-req): rules/verdict, commit-reveal, co-occurrence
  scorer, AI policy, player model → plain ES modules loaded by the page. No build
  step. Unit harness in Node.
- **G — the ladder**: engine + 4 levels + level selector UI (names, one-line
  descriptions, current level shown by the rival's avatar) + prediction telemetry.
- **H — the mirror**: panel + post-match card + profile persistence + export.
