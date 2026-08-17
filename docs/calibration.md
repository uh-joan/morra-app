# Calibratge — per-player, per-camera sensor fits (2026-08-17)

**What it is.** A guided throw session in L'Espill that fits the sensor
thresholds to *this player on this camera*, and stores the fit per profile +
device. Born from the evening we hand-tuned `HIGH_V` for one thumb: the
right value depends on the hand and on the camera, so it should be measured,
not guessed.

## Decisions (made on the data we had)

| Question | Decision | Why |
|---|---|---|
| What gets fitted | **HIGH_V, LOW_V, vadMult** — sensor reads of the player | These are "how do we read you", not "what are the rules" |
| What never moves | **co-occurrence ±ms** (and first-to-10) | It's the rule: hand and voice must be simultaneous. Adapting the tolerance to a player is adjusting the rulebook to them. L'Espill shows the natural lead as coaching instead |
| settleMs | untouched (spike 50) | no evidence it's per-person |
| finger thresholds (thumb 160°, margin 1.05) | **follow-up** | per-hand too, but needs both a 4 and a thumb-out number in the session and a corpus-style fit |
| Keyed by | **profile + camera device** | velocity is in frame-normalized units: the same throw reads differently on a phone and a laptop; hand-size-in-frame differs too. New device → app defaults + "Sense calibrar" nudge |
| Do prompted throws feed the model? | **No — pure calibration** | "tira un 3" isn't a choice; the L4 rival must not learn from it (`game.ts` skips `recordTrainingThrow` while calibrating) |
| Where the values live | **the live sliders** stay the source of truth | mode tècnic keeps working; everything is inspectable; reversible in Ajustos. Persistence is a per-player fit applied INTO them — a deliberate divergence from "the 5 spike tunables stay unpersisted" |

## The framing guide (ghost hand)

The corpus (2026-08-16, held frames, same rule) says framing alone moves the
count from **71% correct (hand < 30% of the frame) to 99–100% (≥ 40%)**, and
from 100% (hand within 10% of frame center) to 84% (20–30% off). So a target
silhouette + one word of coaching is a real accuracy lever.

`framing.ts` computes size / off-center / edge margin from the 21 landmarks
every frame; a ghost hand is drawn on the overlay while calibration is on,
gold when the hand is in the zone, with **Acosta la mà / Allunya una mica /
Centra la mà / Es talla la mà**. Every state change logs a `framing` event.
Target starts at size ≥ 0.42, off-center ≤ 0.15, edge ≥ 0.02 (from the
corpus buckets); the `?rec=1` recorder can capture framing per frame so the
next recording re-fits it. Only calibration draws it today; onboarding and
a faint in-play version are natural next homes.

## The flow (evidence-driven — no countdowns)

1. **Enquadra** — 20 consecutive in-zone frames.
2. **Puny quiet** — fist, still, in zone: 60 frames of idle-state velocity →
   `jitterP95` (the floor no threshold may go under); the live RMS over the
   same span → `ambientFloor` (p25). Any motion or leaving the zone restarts.
3. **Tira** — prompts `3, 1, 4, 2, 5` (thumb-in and thumb-out numbers, small
   ones included): "Des del puny, tira un N i crida fort qualsevol número".
   Per throw: peak centroid velocity between motion start and settle
   (`velocity.ts` history), shout peak RMS from 300 ms before motion start
   to 800 ms after settle (`mic.ts` history), and the count the pipeline
   read vs the prompt.
4. **Resultat** — old → new per value with one line of why; **Desa per a
   aquest perfil / Descarta / Restableix**.

## The fits (`calibration/fit.ts`, pure, tested) — **fit v2**

- `HIGH_V = clamp(max(2·jitterP95, min(0.7·min(throwPeaks), 0.45·median)), 0.3..1.5)`
  — **under the weakest prompted throw** with 30% headroom, capped so one
  freak fast throw can't drag it up, never below 2× the resting jitter.
- `LOW_V = clamp(max(1.5·jitterP95, 0.3·HIGH_V), 0.08..0.6)`; then HIGH_V
  is raised if needed so `LOW_V ≤ 0.6·HIGH_V` — a throw must be able to
  *settle* (the FSM waits for `v < LOW_V`), and that outranks the ratio.
- `vadMult = clamp(sqrt(median(shoutPeaks) / max(ambientFloor, 0.015)), 2.5..12)`
  — judged against the floor that will be **in force** (the live VAD hard-
  floors at 0.015); a 36× shout over an audible room lands on the spike's 6.
- Minimums: 4 throws, 3 shouts. A fit that can't be made leaves that value
  untouched and says so.
- Records carry `fitVersion`; a record fitted by an older rule is **re-fit
  from its saved samples on apply** and re-stamped — the player never redoes
  the session because the math improved.

### Why v2 — the first real session (jani, 2026-08-17)

Throw peaks `1.17, 0.58 (the thumb-1), 1.80, 2.48, 4.50`; jitter p95 0.11;
room floor 0.00005 (near digital silence); shouts 0.40–0.66. The flow
behaved perfectly (every return-to-fist ignored, 5/5 prompts, 4/5 read
right — the 2 read as 4, one sample). **The v1 fit did not:** 45% of the
median gave HIGH_V **0.81 — above the thumb-1's 0.58** — i.e. calibrated
would have made the thumb-1 unregisterable, worse than the 0.5 default; and
the raw ratio against near-silence sent vadMult to the 12 cap, which is
inert in a quiet room but aggressive in a loud one. v2 on the same
samples: **HIGH_V 0.40, LOW_V 0.17, vadMult 5.3.** The session is a unit
fixture; the stored record re-fits itself on next load.

## Storage

`localStorage["morra-calibration-v1:<profileId>"]` → `{ version: 1,
byDevice: { "<deviceId12>@<w>x<h>": { values, measuredAt, samples } } }`.
The samples include the prompted truth vs the read count — every calibration
is also a labelled mini-corpus.

## Telemetry

`calibration_start / step / quiet / throw / result / saved / reset / stop /
apply`, and `framing`. Enough to answer, from field logs, whether calibrated
players sync more.
