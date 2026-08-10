# Parity: apps/web vs spikes/s03-beat.html

Status as of M5. spikes/** is the untouched regression oracle — this
document records what's been verified equivalent, what's genuinely new
architecture (not a parity target), and what's an honest, disclosed gap.

## How to reproduce

```
pnpm install
pnpm build
pnpm --filter @morra/web run test:integration   # M4: drives the built app headless
pnpm --filter @morra/web run test:parity        # M5: drives the app AND the live spike side by side
```

`test:parity` (`apps/web/test/parity/run.mjs`) needs a local Chrome install
(SKIPs, exit 0, if none is found) and drives the spike's real camera+mic
via `--use-fake-device-for-media-stream` (SKIPs if the spike's own
`syncReady()` gate never becomes true — a MediaPipe CDN/network issue in
that specific environment, not a code defect).

## Checklist

| Area | Status | Notes |
|---|---|---|
| Pure decision logic (verdict, calls, commit/reveal, sync classification, AI predictors, mirror analytics) | ✅ Verified value-identical | M1's `packages/core/conformance` corpus (105 cases) + `scripts/cross-check-conformance.mjs` replay the SAME inputs against the ORIGINAL `spikes/modules/*.mjs` — zero discrepancies, checked on every `pnpm -r test`. |
| Round state machine wiring (reset-vs-throw, commit-before-reveal, two-phase reveal, void/incomplete, ready pill, first-to-10, parata) | ✅ Verified via live comparison | M5's `test:parity` drives BOTH systems' real functions (the spike's own `window.__s03` debug seam, untouched; the app's `gameStore.ts` via `window.__morraTestHooks`) through identical synthetic scenarios across all 4 AI levels — 55/55 checks pass. See "M5 findings" below for what this caught. |
| Hand-onset detection (velocity-based motion-start, not settle/stability-only) | ✅ Closed (M5) | Was M4's one disclosed gap. `MediaPipeFingerRecognizer` (`@morra/recognition`) now runs `stepVelocityStateMachine` (pure, M2) against real per-frame fingertip velocity in BOTH worker and main-thread-fallback modes, surfaced via `FingerRecognitionResult.motionOnset` (new `@morra/core` contract field). `apps/web`'s `sensorPipeline.ts` anchors on `motionStartPerfTime` exactly as the spike does, with `findStableCountRun`'s transition-preceded case kept as the documented fallback (unchanged held-over/reset semantics) for throws too slow to ever cross `HIGH_V`. |
| Entrenament / mirror ("L'Espill") — headline tiles incl. real `predictPlayerF`-backed exploitability, f/g histograms, top-3 tells, bigram heatmap, session/all-time toggle, export, confirm-gated reset, post-match card | ✅ Implemented, unit + integration tested | Every number comes directly from `@morra/core`'s `mirror.ts` (the same functions the corpus above verifies) — the view layer only formats/lays out. |
| Settings (co-occurrence window, VAD sensitivity, HIGH_V/LOW_V/settle-ms) | ✅ Implemented, live-updating | `MediaPipeFingerRecognizer.setVelocityConfig()` (new, M5) lets the settings panel's sliders take effect without a sensor restart. |
| Security audit M6 (SecureRandomSource split) | ✅ Closed (M4) | `commit.ts`'s `randomNonceHex` requires `SecureRandomSource`; `RandomSource` no longer has a bytes method at all — verified as an actual `tsc` compile error, not just documented. |
| XSS discipline (audit M5) | ✅ | `eslint-plugin-react`'s `react/no-danger` rule bans `dangerouslySetInnerHTML` repo-wide; the hand SVG (the one place with numeric/positional "markup") is built via `document.createElementNS`, never string interpolation. |

## M5 findings (from the live parity comparison, not assumed)

Two real issues were caught by actually running scenarios through the live
spike via `window.__s03` and comparing against the app, rather than relying
on the read-the-source spec alone:

1. **The velocity gap (closed).** Confirmed the spike's phase-1 reveal
   timing anchors on `motionStartPerfTime`, not the settle instant — this
   was the documented M4 gap M5 was dispatched to close (see above).
2. **Incomplete throws are recorded, not just void ones (fixed).**
   Reading `spikes/s03-beat.html`'s `maybeResolveGameRound` closely (while
   building the parity scenario for it) showed `recordMatchHistoryEntry` is
   called in the "incomplete" branch too — `if (playerFingers != null)`
   — with `aiMove: null, verdictWinner: null`, i.e. every real throw
   attempt is recorded even if it never got a chance to sync, as long as a
   hand was genuinely detected (not a reset). `apps/web`'s `gameStore.ts`
   originally only recorded the **void** branch. Fixed in `tryResolve()`;
   covered by two new unit tests (`gameStore.test.ts`) and the parity
   suite's `incomplete` scenario across all 4 AI levels.

## Structurally unverifiable (documented, not silently skipped)

**AI move VALUE parity** — does the spike draw the exact same `(fingers,
call)` as the app for an equivalent history? **No**, and it cannot be made
to: `spikes/s03-beat.html`'s `commitAiMove()` calls
`AiPolicy.decideMove(currentAiLevel, Math.random, history, null)` —
`Math.random` is hardcoded, not injectable through `window.__s03`. There is
no seed to align between the two systems for a literal move-by-move
comparison. This is flagged explicitly by `test:parity` (`N/A` lines, not
silent skips) for all 4 levels rather than pretended-away.

What IS verified instead, and is the thing that actually matters for
correctness: the DECISION FUNCTION itself (`decideMove`/`ai.ts`) is already
proven byte/value-identical to `spikes/modules/ai.mjs` via the M1
conformance corpus — so "does the app's AI behave like the spike's AI" is
answered by that corpus, not by hoping two unseeded RNG streams happen to
agree.

## Retired / deferred (not a parity target)

- **Beat mode** (the earlier metronome-driven mode) — retired per the M4
  dispatch; kept in the spike for reference only. `apps/web` implements
  only the self-paced sync pipeline both Partida and Entrenament share.
- **CSS/visual polish** — `apps/web`'s styling (`src/style.css`) is
  minimal and utilitarian, not pixel-matched to the spike's design. Game
  logic and the React-boundary architecture were prioritized this pass.
- **Orphan voice onset diagnostic** (`isOrphanVoiceOnset` — "shouted but
  never threw" detection) — a debug-log-only affordance in the spike, does
  not affect scoring or round resolution; not wired into `apps/web`'s UI.

## Test counts (as of M5)

- Unit: 363 across the workspace (225 core, 60 recognition, 55
  platform-web, 23 apps/web).
- Integration (headless, puppeteer, all SKIP gracefully with no local
  Chrome): recognition 11/11, platform-web 15/15, apps/web 11/11.
- Parity (`test:parity`): 55/55 checks pass across L1–L4, 4 explicitly
  noted structurally unverifiable (see above).
