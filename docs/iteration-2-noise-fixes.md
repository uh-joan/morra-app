# Iteration 2 — noisy-venue fixes (implemented 2026-08-16)

Follow-up to `iteration-1-playtest-analysis.md`. Three fixes, one commit each
on `ux-pirates`:

| Phase | Commit | What |
|---|---|---|
| 1 | `0b87d82` | Offline onset noise-floor priming (the core bug) |
| 2 | `bf895d7` | Entorn preset (🎧 Tranquil / 🔊 Local sorollós) + ambient calibration + tunable live-VAD floor |
| 3 | `92ece69` | Sorollós verdict softening: preWindow-pinned onsets ≠ voice evidence |

Those are fixes #1–#3 of the six ranked in `iteration-1-playtest-analysis.md`
§5. The remaining three are closed out in **§ Fixes #4–#6** at the end of this
document.

## The design in one paragraph

Everything hangs off ONE player-facing switch, **Entorn**, on the title
screen. **Tranquil** is the spike-verbatim world the parity harness guards:
raw mic, live-VAD floor 0.015, strict verdicts. **Sorollós** bundles the
noisy-venue policy: browser noiseSuppression + echoCancellation (AGC stays
off — it would fight the adaptive onset floor), the live-VAD floor ridden
off a ~1.5 s ambient calibration that reruns on every mic (re)start, and the
softer preWindow verdict rule. The one *unconditional* change is the phase-1
floor priming, because it self-neutralizes in quiet rooms (primes to ~0.001
= spike behavior) and fixes a genuine bug in any room: the spike restarts
the offline detector's noise floor at 0.001 every pass, so it never learns
the room it is standing in. A player in Tranquil whose room floor alone
clears 0.015 — the exact field failure condition — gets a one-tap banner
suggesting the switch.

## Validation

**Unit/typecheck (sandbox, linux-x64):** recognition 78/78 (12 new noisy
fixtures + 3 demotion tests), platform-web 55/55, app unit 40/40 (15 new),
tsc clean. packages/core: 221/225 with 4 pre-existing last-ulp float
diffs in the aiPredictor conformance fixtures (mac-arm64-generated corpus
vs linux-x64 — not caused by these changes; the same 4 fail on the
untouched tree).

**Integration (built app, headless Chromium, fake devices):** 38 passed
+ 4 new entorn checks included, 1 failure — "verdict card shows SYNCED" —
which fails identically on the pre-change tree (pre-existing, tracked
separately). Stable across repeated runs.

**Field replay (the money check):** the 1,264 field-session
`recognition_window` events carry real per-window RMS measurements
(venue median block RMS 0.057 ≈ 4× floorMin). Each window's noise profile
was synthesized (deterministic seed) and run through the ACTUAL built
detector code, old config vs new:

|  | OLD (floor=0.001) | NEW (primed) |
|---|---|---|
| false preWindow | **90.6%** | **12.8%** |
| accurate in-window onset on shout windows | 99/1207 (8%) | 891/1207 (74%) |

The residual 12.8% pinned onsets are what phase 3 handles in sorollós:
demoted to hand-only (round void, no commit burned as "massa aviat").

**Parity: verified 18/18** (2026-08-16, cloud sandbox): the untouched spike
was served its MediaPipe/vosk dependencies from the vendored copies via
puppeteer request interception (test-rig shim only — the spike file stayed
byte-identical, only the network answered differently). All scenarios green
including both preWindow-pin-never-SYNCED checks — tranquil is confirmed
spike-equivalent with phases 1–3 in the build.

**Still worth one run on the Mac:**

```
pnpm --filter @morra/play build
pnpm test                      # core's 4 FP fixture diffs should NOT appear on the mac
pnpm --filter @morra/play test:integration
pnpm --filter @morra/play test:parity   # re-confirm on real Chrome/CDN
node scripts/cross-check-conformance.mjs
```

Expectation: the 4 core FP fixture diffs seen on linux-x64 should NOT
appear on the mac (arm64-generated corpus); parity already verified above.

## What lands uncommitted (rides with the ux-pirates r2 working tree)

The `#entornToggle` + `#entornSuggest` markup (index.html), their styles
(style.css), and the 4 entorn integration checks (run.mjs) — the entorn
modules are null-safe without the markup, so the committed history stays
behaviorally spike-equivalent until the UX pass lands. Commit them together
with the r2 pass.

## Field protocol for iteration 2 (next outing)

1. On arrival: start the mic once, wait ~2 s — if the suggestion banner
   fires, accept it (or preload with `?entorn=sorollos`).
2. A/B if time allows: a few matches with `?primefloor=0` vs default to
   measure the priming win on real audio (telemetry now logs
   `primedNoiseFloor` per window + `prewindow_demoted` + `ambient_calibration`).
3. Bring the directional/headset mic anyway — DSP can't beat physics.
4. Record a noisy-venue corpus on the s02 rig while there (the current
   corpus is all headphones-at-home).

## New telemetry to watch in the next logs

`ambient_calibration` (floor, suggestion decision, and the `dspMode`/`dsp`
capture config in force), `primedNoiseFloor` on every `recognition_window`,
`prewindow_demoted` (phase-3 rule firing), `setting_change {setting:
"entorn"}` (preset switches, with source ui/suggestion/init), and
`setting_change {setting: "dsp"}` (override switches, carrying the
`effective` boolean).

## Fixes #4–#6 (closed 2026-08-16)

### #4 — A/B the mic constraints: **the toggle now exists**

Phase 2 turned `noiseSuppression` + `echoCancellation` on inside the
sorollós preset (AGC stays off everywhere — it rescales RMS mid-window and
would fight the onset detector's adaptive floor). That shipped the DSP but
*not* the experiment: switching to sorollós moves three things at once —
browser DSP, the raised live-VAD floor, and the phase-3 preWindow demotion
— so no field session could ever attribute a win to the DSP alone.

There is now an independent override: **DSP del navegador** in mode tècnic
(Auto / Sempre / Mai), also settable as `?dsp=1` / `?dsp=0`, persisted in
`localStorage.morra_dsp`. `auto` keeps the preset's own answer, so nothing
changes for a player who never opens the drawer. Switching it takes the
same mic-restart path the preset switch does. Every `ambient_calibration`
event records the `dspMode` and the `effective` boolean, so a session log
can be segmented by capture config after the fact.

**Still open:** the measurement itself. Pin `Sempre` vs `Mai` within one
venue, one entorn, and compare synced rate and no-word rate on synced
throws. That is a field task, not a code task.

### #5 — Field kit: **not a code task**

Directional/headset mic for the shouting player, and record a noisy-venue
corpus on the s02 rig while there (the current corpus is all
headphones-at-home — the exact condition that never failed). Carried in the
field protocol above.

### #6 — `gesture_reset` events: **false alarm, no code change**

The iteration-1 item asked to "check the event didn't get lost in the
ux-pirates refactor". It wasn't. The evidence:

- `gesture_reset` appears nowhere in the current tree **and nowhere in
  `spikes/s03-beat.html`** — it was never a spike event.
- All 636 events come from exactly two sessions, `61ec5348` and
  `acfcf6f6`, both 2026-08-10. Reasons: `wave` 281, `stillness` 180,
  `below-zone` 122, `out-of-frame` 53 — the four gestures of the
  short-lived **reset palette**.
- That feature landed in `cf1ffd1`, was hardened in `fb0c867` (whose own
  message names incident session `acfcf6f6`), and was then reverted
  wholesale at the user's request in `9ad7a7c` — all on 2026-08-10, three
  days before the apps/play rebuild (`7ae176d`, 08-13) and six before the
  ux-pirates work.

So the event stopped because the feature it belonged to was deliberately
removed. The `reset` outcomes that continue are M5 fist-as-reset — a
different mechanism that never emitted `gesture_reset`. Nothing to restore;
if the reset palette is ever re-landed (it is parked for redesign in
`9ad7a7c`'s message), the event comes back with it.

## Rules change: a throw of ONE reveals (2026-08-16, decided by Janis)

Not one of the six — it surfaced right after, testing 0 → 1 without voice:
the rival never revealed. That was the spike's `shouldRevealPhase1 =
fingerCount >= 2`, ported verbatim. Janis: "it should def work with 0 → 1".

**Why the spike gated at 2 — measured, not assumed.** Across all 3,622
`throw_outcome` events in the field logs:

| settle count | n | share | outcomes |
|---|---|---|---|
| 0 | 219 | 6% | reset 100% |
| **1** | **1,503** | **41%** | **reset 53%**, voice-early 31%, synced 13%, voice-late 3% |
| 2 | 354 | 10% | synced 50%, hand-only 25%, voice-early 23% |
| 3–5 | 1,546 | 43% | synced ~50%, voice-early ~30%, hand-only ~20% |

fc=1 is the single most common settle, and it is *both* the number players
throw most *and* what a resting fist reads as (the thumb-lateral rule
fires on a relaxed fist far more often than the count drops to 0). Of the
800 fc=1 resets, **73% follow a ≥2 throw within 3 s (median 0.87 s)** —
they are the hand coming back down. A naive `>= 1` reveal would burn the
commitment on more than half of all fc=1 settles.

**The rule that ships.** Where the hand *came from* separates the two: a
throw of one starts from a resting fist (reads 0 or 1); a retraction
starts from the held ≥2 pose. `core.shouldRevealPhase1From(fc, preOnset)`:
fc ≥ 2 → reveal (spike); **fc = 1 and pre-onset ≤ 1 → reveal**; fc = 1 and
pre-onset ≥ 2 → no (retraction); pre-onset unknown → spike answer. The
pre-onset count is the median of the detected-hand frames in the 200 ms
before the velocity FSM's motion start (`apps/play/src/game/preOnset.ts`);
unknown when fewer than 2 such frames exist — hand entered mid-motion, or a
headless harness with a fake camera. So parity stays 18/18 unchanged and
the degraded case is exactly today: no early reveal, the round still
resolves through voice.

The spike's `shouldRevealPhase1` stays byte-identical in core (the
conformance corpus pins it, 7 cases); the new function is the only caller
that widens it. `throw_onset` telemetry now carries `preOnsetFingerCount`
so the next field analysis can measure how often the rule fires and how
often it's wrong.

**Follow-up the same night (found by Janis at the camera):** the reveal
fired for a silent thumb-1, but the pill never said "Torna al puny" — the
spike's Phase C.1 rule (`count ≤ 1` + no voice = *reset*) still classified
that 1 as a retraction 700 ms later, so the round was dropped, the revealed
move burned silently, and the pill re-armed straight away. A silent 3 goes
hand-only → RONDA ANUL·LADA → "Torna al puny"; a silent 1 that revealed
must too. `core.classifyHandSettleForSyncFrom(fc, voice, preOnset)`: the
spike's classification, except that a silent 1 the reveal rule judged a
throw-of-one is **hand-only, not reset**. Same inputs, same answer, one
place; unknown pre-onset and 0 keep the spike answer, so parity's reset
scenarios are unchanged.

**Known residual:** a genuine throw of one that follows a ≥2 throw *without*
the retraction registering as its own settle (retract-and-throw in one
motion, < 200 ms at rest) reads pre-onset ≥ 2 and does not early-reveal —
it degrades to the spike path (resolves through voice, no burn). Watch
`preOnsetFingerCount` on synced fc=1 throws in the next logs to size it.
