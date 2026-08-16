# Iteration 2 — noisy-venue fixes (implemented 2026-08-16)

Follow-up to `iteration-1-playtest-analysis.md`. Three fixes, one commit each
on `ux-pirates`:

| Phase | Commit | What |
|---|---|---|
| 1 | `0b87d82` | Offline onset noise-floor priming (the core bug) |
| 2 | `bf895d7` | Entorn preset (🎧 Tranquil / 🔊 Local sorollós) + ambient calibration + tunable live-VAD floor |
| 3 | `92ece69` | Sorollós verdict softening: preWindow-pinned onsets ≠ voice evidence |

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

`ambient_calibration` (floor, suggestion decision), `primedNoiseFloor` on
every `recognition_window`, `prewindow_demoted` (phase-3 rule firing),
`setting_change {setting: "entorn"}` (preset switches, with source
ui/suggestion/init).
