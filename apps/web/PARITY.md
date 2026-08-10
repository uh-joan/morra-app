# Parity: apps/web vs spikes/s03-beat.html

Status as of M5, plus a post-migration feature pass (reset palette,
throw-of-1 fix, player profiles — see "Post-M5" section below).
spikes/** is the untouched regression oracle — this document records
what's been verified equivalent, what's genuinely new architecture (not a
parity target), and what's an honest, disclosed gap.

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

## Post-M5: reset palette, throw-of-1 fix, player profiles (deliberate product evolution, spike NOT updated)

This is genuine post-migration product evolution, dispatched and approved
after M5 — the spike (`spikes/s03-beat.html`) stays frozen as before; these
changes are **not** parity gaps to close, they're `apps/web` moving ahead of
the oracle on purpose. Root cause of the design change: the user observed
186 silent deletions of throws-of-1 in one real session — the fist was
doing double duty as both a legal throw of 1 finger AND the reset gesture,
disambiguated only by whether a voice onset happened to land alongside it.

- **Feature 1 — throw-of-1 fix.**
  - Micatio has no zero: a raw recognized hand count of 0 now clamps to 1
    (`clampFingerCountToThrow`, `packages/core/src/scorer.ts`) — the fist is
    a legal throw, never "no throw". `rules.ts` stays untouched/generic;
    the clamp lives specifically in the function that turns a raw hand
    count into a throw's effective finger value.
  - `classifyHandSettleForSync` no longer decides "reset" at all — a
    settle with no voice caught now flows through `classifySyncThrow`
    exactly like counts 2–5 always did, producing a visible **INCOMPLETE**
    outcome instead of vanishing with no trace.
  - **Divergence, by design**: `packages/core/conformance/scorer.json` no
    longer carries `classifyHandSettleForSync` cases (removed, not
    updated to match the spike) — see that file and
    `scripts/cross-check-conformance.mjs`'s own header comments. The M5
    parity suite (`apps/web/test/parity/run.mjs`) asserts this divergence
    explicitly (`DIVERGE`, not `FAIL`): the spike still resets on
    fist(0)+silence; the app now records a real incomplete throw.

- **Feature 2 — the reset palette.** Fist-as-reset is retired; resetting
  (re-arming the ready pill) is now four independently-toggleable, OR'd
  gestures, each logged via telemetry (`gesture_reset` events, reason
  `out-of-frame|below-zone|wave|stillness`) for later pruning:
  - **Out-of-frame** and **below-zone** (a configurable horizontal line
    near the bottom of the camera preview, drawn subtly — `App.tsx`'s
    `.below-zone-line`) are edge-triggered from per-frame hand position
    (`packages/core/src/resetPalette.ts`'s `stepResetPalette`, fed by
    `@morra/recognition`'s new `handCenterY`/`lateralVelocity` fields on
    `FingerRecognitionResult` — landmark-index-0/wrist Y and x-axis-only
    tip velocity, computed in both the worker and main-thread-fallback
    recognizer paths without touching the worker's Blob source, since the
    landmarks it already sent across `postMessage` for the overlay canvas
    were sufficient).
  - **Wave-to-cancel** (quick horizontal shake) evaluates independent of
    the settle pipeline — a wave deliberately never settles.
  - **Stillness** is the pre-existing held-over/transition backstop
    (`handHasResetSince`/`updateReadyPillFromFrame`), unchanged, now also
    telemetry-logged for the same pruning purpose.
  - Ready pill's amber text is now "Amaga la mà"; the coach hint
    (previously defined in `copy.ts` but never actually rendered anywhere
    in `apps/web`'s UI — an M4 gap) is now wired into `PartidaView.tsx`.

- **Feature 3 — player profiles.** Named profiles ("who's playing"): a
  header switcher (`ProfilePicker.tsx`, "Qui juga: `<name>` ▾") that
  auto-expands on a fresh install and is otherwise non-blocking; the store
  auto-loads whoever played last with zero friction
  (`resolveInitialProfileId`). Everything player-specific is keyed by
  profileId:
  - `PlayerModel` — `@morra/core`'s `PlayerModelStore` port stayed
    completely generic (it already took an optional storage `key`); the
    profile→key mapping lives entirely in `apps/web/src/game/gameStore.ts`'s
    `playerModelKey()`, per the dispatch's "keying can live in the web
    impl" allowance.
  - Settings (velocity thresholds, co-occurrence window, VAD sensitivity,
    AND the reset palette's own on/off + zone-height preferences, since
    they're nested inside `GameSettings` already) persist through a new,
    dedicated `SettingsStore` port + `LocalSettingsStore` web impl —
    genuinely new infrastructure; `GameSettings` had **no** persistence at
    all before this (reset to defaults on every reload).
  - The profile registry (list + last-played) is its own small port
    (`ProfileRegistryStore`) with pure transform functions in
    `apps/web/src/profiles/profileTypes.ts`, kept importable into
    `gameStore.ts` without dragging an ambient `localStorage` dependency
    into the one module this codebase keeps fully testable via injected
    deps.
  - Export / confirm-gated reset (`resetProfile()`) act on the ACTIVE
    profile only. The mirror's session-vs-all-time toggle is unaffected —
    it still scopes by `sessionId`, not profileId.
  - Verified end-to-end in a real headless-Chrome run (not just unit
    tests): two profiles trained different throws/settings, switching
    between them showed zero cross-contamination in either direction, and
    a real page reload correctly re-loaded the last-played profile with
    its data intact.

- **Bug fix — reload appeared to wipe training data.** Root cause (found
  via a live headless-Chrome repro against the built app, not guessed):
  `EventBusTelemetrySink` minted a brand-new random `sessionId` on every
  page load; `gameStore.ts` stamps that id onto every `HistoryEntry` and
  the Entrenament mirror's **default** "session" scope filters by exactly
  that id. So a plain reload never actually lost any data
  (`PlayerModel.throws` stayed fully intact in `localStorage`), but the
  mirror's default view went completely empty — no prior throw could ever
  match the new load's session id again — which is indistinguishable from
  "wiped" to anyone just looking at the panel. Fixed by persisting the
  session id in `sessionStorage` (`packages/platform-web/src/ports/sessionId.ts`'s
  `getOrCreateBrowserSessionId`) — survives a reload/back-forward
  navigation in the same tab, cleared on a real tab close, preserving the
  "session" concept's actual meaning. Regression-tested at both the
  `SimpleStorage`-level (`sessionId.test.ts`) and the `GameStore`-level
  (two store instances sharing one backing store, `gameStore.test.ts`'s
  "reload persistence regression" suite) plus reproduced/fixed live in a
  real browser.

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

## Test counts (as of the post-M5 feature pass)

- Unit: 421 across the workspace (241 core, 66 recognition, 60
  platform-web, 54 apps/web).
- Integration (headless, puppeteer, all SKIP gracefully with no local
  Chrome): recognition 11/11, platform-web 15/15, apps/web 11/11.
- Parity (`test:parity`): 47/47 checks pass across L1–L4, 4 noted
  structurally unverifiable (AI move value, unchanged from M5) + 4 noted
  as deliberate divergences (the throw-of-1 fix, one per AI level — see
  "Post-M5" above).
