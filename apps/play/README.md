# @morra/play

The morra micatio game app — a spike-faithful vanilla TS port of
`spikes/s03-beat.html` (the oracle; every `src/` module header cites the
spike line range it ports). No framework: same rVFC camera loop, same
single-rAF analysis drain, same imperative DOM renders, same CSS.

```
pnpm install            # repo root
./play.sh app           # dev server on :5173 (spike: ./play.sh, :8080)
pnpm build              # tsc --noEmit + vite build → dist/
pnpm test               # unit (vitest)
pnpm test:integration   # headless smoke vs built dist (needs local Chrome)
pnpm test:parity        # live spike vs app through identical seams
```

Manual, step-at-a-time verification: `VERIFY.md`.

Architecture notes:

- Pure game logic comes from `@morra/core` (machine-verified identical to
  `spikes/modules/*.mjs` via `pnpm cross-check:conformance`); sensor pure
  parts from `@morra/recognition`; browser adapters from
  `@morra/platform-web`. Only the device/timing glue lives here.
- The four invariants (per-throw object identity; motion-start anchor +
  deferred extraction; player-only pacing; blanking + clamping with the
  clamp floor snapshotted at onset) are structural — see
  `src/analysis.ts`'s header.
- Profiles: `src/profileRegistry.ts` (pure, node-tested) +
  `src/profile.ts` (storage IO, sole owner of the keys) +
  `src/profiles.ts` (picker UI). The default profile IS the spike's legacy
  key (`morra-s03-playermodel-v1`) — zero migration; extra profiles use
  `morra-playermodel-v1:<id>`. Presentation seam: only `src/render/*` +
  `src/status.ts` touch the DOM.
- `window.__play` mirrors the spike's `__s03` member signatures — the
  parity harness drives both with one driver.

Follow-ups (deliberately not done in the rebuild):

- **Vendor the three CDN dependencies** (MediaPipe +esm/wasm/task,
  vosk-browser) for offline/deploy resilience — a `src/config.ts` +
  `scripts/prepare-assets.mjs` change only.
- Optional: extend `scripts/cross-check-conformance.mjs` to
  `mirror.mjs`/`playermodel.mjs`.
- User profiles + UX iteration — the seams above are where they land.
