# El puny com a 1 — design note for a later implementation

*Status: parked (2026-08-22). Explored, not built. This note is the brief for whoever
picks it up — what the code does today, why "fist = 1" is harder than it sounds, and
the recommended, data-first path.*

## The ask

In Catalan morra there is no zero: **a closed fist is a one**. The app teaches "tira
l'1 amb el puny i el polze" (thumbs-up), and many players struggle with it — they have
thrown the fist as a one all their lives.

## What the code does today (with pointers)

1. **The rules already have no zero.** The AI throws 1–5 (`FingerValue`,
   `packages/core/src/ai.ts`), calls run 2–10 (`VOSK_GRAMMAR_WORDS` starts at *dos*), the
   verdict just sums (`packages/core/src/rules.ts:computeMicatioVerdict`). Nothing in
   core knows a "0".

2. **The fist is not a number — it is the game's READY gesture.** The self-paced loop
   has no *go* button; the arming signal is the hand returning to the fist («Torna al
   puny…»). `classifyHandSettleForSync` (`packages/core/src/scorer.ts`) reads a settle
   at ≤1 fingers *with no shout* as a **reset** — the hand coming back to rest — never a
   throw.

3. **A plain fist + a shout is ALREADY scored as a one.** Same function: a ≤1 settle
   *with* a voice onset → `effectiveFingerCount = 1`. The Catalan rule is in the code
   for the voiced path. What the thumb buys is:
   - **The early (phase-1) reveal** — `shouldRevealPhase1From` opens the rival's hand
     at settle time only when the pose alone is confident: ≥2 fingers, or (Janis's
     2026-08-16 decision) a `1` whose pre-onset count was ≤1 (it came *from* a resting
     fist). A plain fist never qualifies; a fist-one resolves later, through the voice.
   - **The ready-pill re-arm** — `handHasResetSince` (`apps/play/src/game/handHasReset.ts`)
     re-arms when the count *changes* from the last throw. Thumb-up one → rest fist
     reads 0 → re-armed. Fist-one → rest reads the same → the pill can sit on
     «Torna al puny» until the hand wiggles.

4. **The thumb detector is tuned for exactly this** — `counting.ts` judges the thumb by
   the MCP angle and reads thumbs-up directly (see its comments; the "worst number in
   the game" history lives there).

## Why it is genuinely hard — the field numbers

From the scorer's own comments (field logs, 2026-08-16/17):

- fc≤1 is **the single most common settle: 41% of 3,622 throws**; **53% of those are
  resets**; 73% of those are the hand retracting from a ≥2 throw within a **median
  0.87 s**.
- Janis's 12-min L4 session: **92 of 250 onsets were retractions**; when a previous
  rule misread them as throws of one, the L4 rival learned to aim at 1 half the time
  and fell to a 10% hit rate.

**"Fist = 1" is not a labeling change — it attacks the one disambiguation the pipeline
depends on.** A fist at rest, a fist retracting from a 4, and a fist thrown *as* a one
are the same pose. Today the pose difference (thumb) is the tell. Without it, the tell
must come from elsewhere:

| Signal | Distinguishes? |
|---|---|
| Where the hand came from (pre-onset count) | Yes, for retractions — a fist-settle from a held ≥2 is a retraction. **Already implemented.** |
| Motion — the throw is a jab | Partly. Onset detection is already a velocity spike; a fist jab triggers it. **A fidget at rest is the risk.** |
| Voice — the shout | Yes, and it is already the rule — but it lands ~700 ms after settle, too late for the early reveal. |

## What changing it would mean

- **Rules / scoring / AI / calls / Classificació / L4 model: nothing.** Zero already
  does not exist.
- **The throw-of-one rule widens** from `fc === 1` to `fc ≤ 1` (from a resting fist,
  after a real motion onset) in `shouldRevealPhase1From` / `classifyHandSettleForSyncFrom`
  — the deliberate-divergence functions. The spike originals (`shouldRevealPhase1`,
  `classifyHandSettleForSync`) stay byte-identical; the conformance corpus keeps
  pinning them. Small code.
- **The real cost is false reveals.** Every rest-fidget that trips the onset detector
  from a fist becomes a "throw of one" that *reveals and burns the rival's
  commitment* — the exact failure the field data was gathered to prevent.
- **The ready pill** needs a re-arm that is not "count changed" (it would never re-arm
  after a fist-one): "hand quiet for N ms" after the throw resolved, or motion-based.
- **Calibration**: the `tira un 1` prompt (`PROMPTS = [3, 1, 4, 2, 5]`) and the thumb
  work become optional, not wrong.
- **Copy**: «Torna al puny» stays meaningful — rest is still the fist.

## Options

| | Approach | Verdict |
|---|---|---|
| A | Keep thumb-up as the canonical one; teach it harder (onboarding/calibration) | 6/10 — robust, fights a lifetime of habit, not authentic morra |
| **B** | **Accept both**: thumb-up *or* jabbed fist = one. Widen the rule to `fc ≤ 1` from a resting fist, gated on a real motion onset; keep retraction detection via pre-onset; re-arm the pill on "hand quiet" | **8/10 — authentic, incremental, measurable** |
| C | Replace fist-as-reset with another arming signal (hand out of frame, pause) | 3/10 — reworks the whole self-paced feel |
| D | Fist = 1 but never early-reveal on ≤1 (voice-only resolution) | 5/10 — no false-reveal risk, but reverses the 2026-08-16 "ones reveal like any throw" decision |

## Recommended path: B, data-first

1. **Probe, don't flip.** Add a log-only telemetry event at the settle classifier:
   "this fist-settle *would have* counted as a throw of one under the widened rule"
   (with `fingerCount`, `preOnsetFingerCount`, onset velocity, ms since the last
   resolved throw, and whether a voice onset later arrived). `throw_outcome` already
   carries most of the context; this adds the counterfactual.
2. **Play a few real sessions** (Jani + one more hand), then read it with
   `deploy/collector/stats.sh` (DuckDB over `/srv/morra-logs`): how many would-be ones
   were followed by a shout (true throws) vs silent (fidgets / retractions)?
3. **Decide the gate from the numbers**: if silent would-be ones are rare, flip the rule
   as-is; if not, add the cheapest extra gate that separates them — jab amplitude
   (velocity threshold for ≤1 settles) and/or a minimum quiet time since the last
   resolved throw — and re-measure.
4. **Flip**, together with the pill re-arm change, and keep thumb-up working (both read
   as one). Update calibration copy to say the fist is fine.
5. **Guardrails**: conformance corpus untouched (spike functions byte-identical); a
   parity-harness scenario for "fist from fist + shout = one, early reveal"; a scorer
   unit test for "fist from ≥2 = retraction, still".

## The honest bottom line

The game already agrees with Catalan morra **when you shout** — the thumb is a
concession to the camera, not to the rules. Making the silent/early path agree too is
feasible and small in code, but it spends the one thing the pipeline guards most
carefully (unburned commitments), so it earns a measurement before a merge.
