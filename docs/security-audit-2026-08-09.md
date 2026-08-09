# Security Audit — 2026-08-09

Read-only audit by security-reviewer agent; forensic injection investigation by tracer agent.
Status column reflects remediation as of the same day.

## Injection incident: FALSE POSITIVE (closed)
A worker agent reported a prompt-injection attempt mid-task. Forensics verdict: it was
oh-my-claudecode's own `project-memory-precompact` hook (fires on context compaction,
injects "Project Memory (Post-Compaction Recovery)… IMPORTANT: must be followed") —
legitimate first-party harness content that reads like an injection template. Exhaustive
transcript search found zero actual injected content and zero resulting actions.
Recorded in agent memory so future workers don't re-flag it.

## Findings & status

| ID | Sev | Finding | Status |
|---|---|---|---|
| C1 | CRIT | CDN code unpinned (`@latest`), no SRI, no CSP, in pages holding live camera+mic | **Partially fixed**: MediaPipe pinned 0.10.14 everywhere. DEFERRED to pre-public: vendor MediaPipe/vosk/React same-origin + CSP (SRI can't cover `+esm` dynamic import or wasm asset fetches) |
| H2 | HIGH | Dev servers bound 0.0.0.0 — voice corpus + logs exposed to any LAN | **FIXED**: all three servers loopback-only (verified via netstat) |
| H3 | HIGH | `POST /log` unauthenticated; any website can write NDJSON (CORS simple request, no preflight) | **DEFERRED** (dev-phase risk accepted, loopback bind reduces surface): fix = Origin check + sessionId regex `^[0-9a-f]{8}$` + per-file byte cap + Content-Length try/except |
| H4 | HIGH | Model zips downloaded with no integrity check into a WASM decoder | **FIXED**: SHA-256 pinned in both fetch scripts, https-only, delete-on-mismatch |
| M5 | MED | Stored XSS via speaker name (s02 innerHTML), reflected via error messages (s03) | **DEFERRED** to M4 migration (new app will use textContent/escaping patterns; spike is single-user local) |
| M6 | MED | `createSeededRandomSource` satisfies the same `RandomSource` port used for commitment nonces — predictable nonce = brute-forceable commitment (≤45 values) | **DEFERRED to M3/M4 (must fix before P2P)**: split port into `SecureRandomSource` so mis-wiring is a compile error. Spike is correct (crypto.getRandomValues) |
| M7 | MED | Trust model honesty: commit-reveal binds the AI code, not the local player (devtools reads the move). P2P needs mutual commit + round/identity binding + reveal timeout | **DOCUMENTED** (by design for v1 single-player; P2P requirements recorded) |
| M8 | MED | Nested `spikes/rival-voice/.omc/state/` + `.omc/project-memory.json` (abs paths) tracked; 12 state files in history | **Mostly fixed**: untracked + `**/.omc/state/` ignored. DEFERRED: `git filter-repo` history rewrite before any public push (cheap now at ~10 commits) |
| M9 | MED | Purity gates bypassable via `globalThis.crypto` / `Math["random"]`; lint not wired into build/CI | **DEFERRED** to M4/M5: add no-restricted-syntax rules + wire lint into build or CI |
| L | LOW | staticServer prefix-compare path check; CSV formula injection (`=`/`+` in names); serve.py directory listings; s03 uses Math.random for AI (spike-only) | **DEFERRED** (folded into migration checklists) |

## Verified clean
No eval/new Function; no secrets/recordings ever committed (full history checked);
pnpm lockfile fully integrity-pinned, registry untampered; @noble/hashes 1.8.0 sole core
runtime dep; POSIX path traversal on /log genuinely blocked; worker/worklet blob URLs
built from literals only; commit hashes logged pre-reveal never contain the move
(verified against real session logs).

## Standing rules going forward
1. Never `@latest` for runtime CDN code.
2. Anything downloaded that executes (wasm, models) gets a pinned checksum.
3. Dev servers bind loopback unless explicitly LAN-testing (and never with the corpus dir served).
4. Before ANY public push: history rewrite (M8), CDN vendoring + CSP (C1), XSS pass (M5), /log auth (H3).
5. Before P2P: SecureRandomSource split (M6) + mutual round-bound commit-reveal (M7).
