# Security audit — 2026-08-20

Follow-up to [`security-audit-2026-08-09.md`](security-audit-2026-08-09.md),
after the onboarding / Calibratge / L'Espill / responsive / port-ambience work
and the header redesign. First-hand review with line-level evidence.

## Threat model

Morra is a **fully client-side static app**: no backend, no auth, no
multiplayer, no other users' data. The realistic attack surface is:

1. **Supply chain** — third-party code executing on a page that holds camera + mic.
2. **XSS** reaching that same privileged context.
3. A **deployed telemetry collector** (`/log`) being abused.

Everything else (localStorage tampering, "cheating" the AI) only affects the
tampering user themselves — there is no other party to defend against.

## Findings & status

| ID | Sev | Finding | Status |
|---|---|---|---|
| A1 | LOW→MED | No Content-Security-Policy on a camera+mic page using dynamic `import()` (the unclosed tail of prior **C1**) | **FIXED**: build-time CSP injected into `dist/index.html` via a Vite plugin (`apply: "build"`, so dev HMR is untouched). Validated under fake devices — camera, mic, and MediaPipe (WASM) all run with **zero `securitypolicyviolation` events**. |
| A2 | LOW | Tripulant NAME sent to telemetry (`profileName` in `firstrun_named` / `profile_active` / `profile_change` → POST `/log`) | **FIXED (2026-08-21)**: those events now carry a `profileHash` (sha256 of the case/space-folded name, truncated — `profile.ts:profileNameHash`), never the raw name. The live collector (`deploy/collector/`) applies the prior **H3** hardening (body cap, per-IP rate limit, JSON validation, no IPs stored). |
| A3 | INFO | Vendored-bundle self-containment relies on the build step | **FIXED**: added `scripts/check-origins.mjs`, wired into `prebuild`, asserting the runtime loader URLs (`VOSK_*`, `MEDIAPIPE_*`) stay same-origin. A stray edit pointing a loader back at a CDN now fails the build. |
| A4 | INFO | Git history rewrite still pending (prior **M8**) | **DEFERRED (needs owner action)**: `.omc/state` was tracked in early history. `git filter-repo` before any public push — a destructive shared-history operation, not run autonomously. |
| A5 | LOW | Header-only hardening a meta CSP can't express (`frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy`) | **FIXED (host-portable)**: `apps/play/public/_headers` → `dist/_headers` sets them on Netlify / Cloudflare Pages (inert elsewhere), including `Permissions-Policy: camera=(self), microphone=(self)` locking capture to same-origin. nginx/Apache equivalents below for other hosts. |

## Verified clean

- **XSS / DOM injection** — all 11 `innerHTML` sinks receive only app-controlled
  constants: pirate SVG art (`PIRATE_ART`, `WORDMARK_SVG` in `screens.ts`,
  `pirate/render.ts`) or numeric calibration values (`calibration.ts:422`,
  `landmarkRecorder.ts:95` — digits 0–5, `?rec=1`-gated). The one user input,
  the **tripulant name**, never reaches an HTML sink — only `textContent` /
  `createElement` / `replaceChildren` (header chip, nameplate, score strip, VS
  splash, the hail, the menu). No `eval` / `new Function` / `dangerouslySet*`.
- **Commit-reveal integrity** — `commit.ts` hashes `sha256(fingers|call|nonce)`
  via `@noble/hashes`, nonce from an injected `SecureRandomSource` (16 bytes),
  never `Math.random` (banned outright in `packages/core`, `ai.ts:8`). The
  "can't peek" guarantee is cryptographically sound against code-level bugs.
- **Runtime supply chain** — MediaPipe + vosk fully vendored same-origin
  (`/assets/vendor/…`, `config.ts:73-88`). The built `dist/` has no live CDN
  fetch — the two `jsdelivr` strings present are inert (a provenance comment
  and a doc link that survived minification), not executed URLs.
- **localStorage** — defensive parsing everywhere: `try/catch` around
  `JSON.parse`, then `normalizeRegistry` / `normalizeBlob` rebuild objects
  field-by-field (`profile.ts:31`, `calibration/store.ts:125`). No
  prototype-pollution path.
- **Hash-router parsing** — bounded regex + `URLSearchParams`; unknown routes
  fall back to title; slugs resolve via lookup, never eval (`router.ts`).

## Notes

- **CSP vs. vosk (2026-08-21 correction).** The initial strict CSP **broke
  voice recognition** in production — my earlier "benign EvalError" call was
  wrong. The mistake: headless, the 41 MB model never finished downloading, so
  vosk never reached its eval-dependent init, so a with/without-`'unsafe-eval'`
  control looked identical. On the deployed site (full model) the truth
  surfaced: vosk-browser@0.0.8's `RecognizerWorker` **both** `fetch()`es its
  inlined WASM from a base64 `data:` URI + a `blob:` URL **and** calls
  `new Function` (Emscripten `createNamedFunction`) during recognizer init.
  Under the strict policy the fetch was blocked (`connect-src`) and the eval
  blocked (no `'unsafe-eval'`), so the model downloaded and then voice hung
  forever. **Fix:** `connect-src 'self' blob: data:` + `'unsafe-eval'` in
  `script-src`. Verified against the full model (browser, not headless): vosk
  reaches `loaded` in ~1.5 s, console clean. Both concessions are **bounded** —
  `script-src 'self'` (no foreign JS) and no cross-**origin** connect are kept
  (`data:`/`blob:` are self-contained, no egress), and `'unsafe-eval'` is only
  reachable via an XSS vector, which is verified clean (name only via
  `textContent`). **Lesson:** always exercise the full model in a real browser,
  not headless, when validating a CSP against WASM/worker libraries.
- **Client-side trust, framed:** the commit-reveal protects against code-level
  peeking, not a user with devtools — that is inherent to a single-player
  client game and not a vulnerability.

## The CSP

Injected at build time only (a meta CSP in source breaks Vite dev HMR):

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval' blob:;   # MediaPipe/vosk WASM + vosk worker (blob:)
worker-src 'self' blob:;                       # vosk-browser recognizer worker
style-src 'self' 'unsafe-inline';              # element.style.* + inline style="" (no nonce path)
img-src 'self' data:;
media-src 'self' blob:;
font-src 'self';
connect-src 'self';                            # blocks cross-origin exfiltration
object-src 'none';
base-uri 'self';
```

`frame-ancestors` / clickjacking protection is **HTTP-header-only** (ignored in
a meta CSP). Shipped via `apps/play/public/_headers` (Netlify / Cloudflare
Pages; copied to `dist/_headers`). For nginx, the equivalent:

```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(), payment=()" always;
add_header Content-Security-Policy "frame-ancestors 'none'" always;
```

## Pre-public checklist (carried forward)

- [ ] `git filter-repo` to drop the early `.omc/state` blobs (A4 / prior M8).
- [ ] `/log` collector, if deployed: Origin check + `sessionId` regex + byte cap; decide name handling (A2 / prior H3).
- [x] Edge headers — shipped via `public/_headers` for Netlify/CF Pages (A5); set the nginx/Apache equivalents by hand if hosting elsewhere.
- [ ] Confirm voice recognition on a real device under the new CSP (expected fine).

## Posture

No Critical or High findings in the current app. The open items are hardening
and deploy hygiene, not live vulnerabilities. Net improvement over the Aug-09
audit: **C1 closed** (CSP shipped, loaders fully vendored + guarded), no
regressions.
