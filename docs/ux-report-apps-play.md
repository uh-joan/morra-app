# UX Report — apps/play (starting point for the UX pass)

**Status:** snapshot written 2026-08-16, after the rebuild (M0–M7), profiles,
and the all-time L'Espill default. Nothing here is implemented — this is the
map to resume from.

**Ground rule the pass inherits:** the timing/game layer is untouchable and
doesn't need touching. The presentation seam was built for exactly this:
`src/render/*`, `src/style.css`, and `index.html` can be replaced wholesale;
`analysis.ts` / `game.ts` / sensors never touch the DOM outside that seam.
The parity harness + conformance corpus keep guarding behavior while the
skin changes. Visual parity with the spike is explicitly NOT a goal — the
spike look was inherited for fidelity during the rebuild, not chosen.

---

## 1. What the player sees today (surface inventory)

| Surface | What it is | Assessment |
|---|---|---|
| Title + subtitle | "Morra" + one Catalan line | Placeholder |
| Mode row | Partida / Entrenament buttons | Fine, needs visual hierarchy |
| Profile row | Perfil select + Nou/Esborra | Functional, unstyled |
| Sensor row | 3 buttons: Start Camera / Start Mic / Load Voice Recognition (CA) | **Biggest UX debt** — the player must know to press three buttons in the right spirit before anything works; labels in English |
| Co-occurrence input | ±ms number input in the top bar | Debug tunable living in the primary UI |
| Export debug button | top bar | Debug tool in the primary UI |
| Face-off: player side | Mirrored video + skeleton overlay, 180px finger count, 84px word, ready pill, shout badge + voice meter + sensitivity slider + onset info | The core loop reads well; meter/slider/onset-info are diagnostics |
| Face-off: rival side | Emoji avatar (🙂🧔🧙👹), rectangle-SVG hand, digit, Catalan word, commit-hash line | Emoji + rectangles = placeholder art; the commit hash is a trust feature but reads as debug noise |
| Game panel | Level select + description, scoreboard, round card, end banner + post-match tiles | Solid bones, no drama: first-to-10 has no arc, match end is a text line |
| Verdict card + tally | SYNCED/late/early card, sync %, median Δ, natural lead | Research-rig framing ("85% kill bar" heritage); tally is stats, not game feedback |
| Status strip | 7 chips (Camera/Model/Hand/Mic/VAD/Voice Rec/Clock) | Invaluable diagnostics, wrong audience by default |
| Error panel | Red visible error list | Keep — but style as a game-friendly toast/banner |
| Ajustos `<details>` | velocity/RMS meters + HIGH_V/LOW_V/settle tunables | Correctly tucked away already |
| L'Espill (Entrenament) | 4 tiles, histograms, tells, bigram heatmap, scope toggle, export/reset | Content is genuinely good; presentation is dense |

Language today is a Catalan/English mix (game copy Catalan, sensor/diagnostic
copy English — inherited from the spike verbatim).

## 2. What must be preserved (the feel that works)

These are the product, verified by play and by the parity harness — the UX
pass must not degrade them:

1. **The reveal snap** — throw ≥2 fingers → rival hand + Jordi's voice,
   instantly. This is the game's magic moment; any redesign should *stage*
   it (make the rival side the visual protagonist at reveal), never delay it.
2. **Player-only pacing** — no countdowns, no timers, no metronome. UI must
   never imply "wait for it".
3. **The evidence-driven ready pill** — "Torna al puny…" → "Llest — tira!"
   from real per-frame hand data. Great mechanic, deserves better staging
   than a small pill.
4. **Visible errors, never silent failure** — keep the principle, restyle
   the surface.
5. **The trust affordance** — commit-before-reveal hash. Keep it visible but
   quiet (e.g. a small seal icon + fingerprint on hover/tap), not a raw
   hex line mid-panel.
6. **~0.7 s throw→verdict latency** — any animation added between throw and
   verdict must fit inside time the pipeline already spends, not add to it.

## 3. Pain points, ranked

1. **Cold start is expert-only.** Three separately-labeled sensor buttons +
   a 47 MB model load with no framing. A first-time player doesn't know
   what to press, in what order, or why. (The buttons exist for a real
   reason — gesture-gated permissions — but the UX can be one "Juga"
   flow that requests each in sequence with friendly Catalan copy.)
2. **The app looks like the lab rig it came from.** Dense dark dashboard,
   tables of numbers, debug controls interleaved with game controls. The
   game is *in there* but doesn't present itself as one.
3. **No match arc.** First-to-10 with parata rules is genuinely tense in
   real morra; the UI gives it a static scoreboard line. No round
   transitions, no escalation near match point, flat match end.
4. **Placeholder rival.** Emoji avatar + rectangle hand undercut the core
   fantasy (playing against *someone*). The S0.5 art direction (rigged 3D
   hand clips, windup + informative frame) was validated in the spike era
   and is waiting.
5. **Mixed language.** Sensor/status/verdict copy in English inside an
   otherwise Catalan game.
6. **Diagnostics compete with the game.** Chips, meters, hash, tally stats
   — all valuable, all should live behind a "mode tècnic" toggle.
7. **Desktop-only layout.** Real morra is played face-to-face; a propped
   phone/tablet is the natural device. Currently 900px+ grid.

## 4. Candidate directions

### A — Game-feel polish (recommended first; skin-only, ~1 milestone-sized pass)
Keep today's layout logic, make it present as a game:
- **Onboarding**: single "Juga" entry that walks camera → mic → veu with
  Catalan copy and progress, replacing the three raw buttons (they remain
  the underlying handlers — gesture-gating preserved).
- **Stage the face-off**: player vs rival as the whole screen; diagnostics
  (chips, meters, hash, tally, Ajustos, export, co-occurrence) behind a
  "mode tècnic" toggle, off by default.
- **Round choreography**: verdict card → brief score punch on the
  scoreboard; near-match-point tension state; a real end-of-match screen
  (result, post-match tiles, Torna a jugar / Entrenament) instead of a
  banner div.
- **All-Catalan copy** (one pass over the English strings; `copy.ts`
  already centralizes game copy — extend it to sensor/status copy).
- Touches: `index.html`, `style.css`, `src/render/*`, `copy.ts`, thin
  wiring in `main.ts`. Zero timing-layer changes.

### B — The rival becomes a character (S0.5 direction; content-heavy)
Replace emoji + rectangle hand with the planned clip-based character
(offline-rendered windup → informative frame → reveal), behind core's
existing `CharacterRenderer` port — `SvgHandCharacterRenderer` is already an
implementation of that contract, so a `ClipCharacterRenderer` slots in
without touching game logic. Requires the S0.5 asset pipeline
(`spikes/s05-art/CHECKLIST.md`) actually producing clips first. Big win,
bigger lift; sensible AFTER direction A gives it a stage.

### C — Mobile/tablet layout
Portrait-first face-off (rival top, player video bottom), touch-sized
controls, testing MediaPipe/vosk performance on phone hardware (the plan's
low-end target was a 2019 laptop; phones are unproven). Worth a spike
before committing. Note iOS Safari has its own AudioWorklet/getUserMedia
quirks the app has never met.

**Recommended order: A → B, with a C feasibility spike whenever convenient.**

## 5. Decisions needed from Janis before starting

1. Direction: A first? (everything below assumes A)
2. All-Catalan, including diagnostics — or keep tech copy English?
3. "Mode tècnic" toggle: hidden behind a key/URL param, or a visible small
   switch?
4. Onboarding: auto-load the 47 MB voice model as part of "Juga" (slow but
   one-tap), or keep it an explicit opt-in step with a size warning?
5. The commit-hash trust line: quiet seal-icon treatment OK, or keep the
   full fingerprint always visible?
6. Sound: any appetite for minimal SFX (verdict hit/miss, score punch), or
   voice-clips-only? (Anything added must respect the mic pipeline —
   scheduled app audio needs registering for blanking like the rival clips.)
7. Match end: keep first-to-10 only, or also surface best-of-3 (the plan
   mentioned it; the engine only knows first-to-10 today — that one is NOT
   skin-only).

## 6. Verification plan for the pass

- The full automated gate must stay green untouched: unit + conformance +
  integration (28) + parity (18) — the harnesses drive seams and ids, so
  keep element ids stable or update the harnesses in the same commit.
- Add a VERIFY.md section per UX milestone (same step-at-a-time protocol).
- Real-play feel check vs the spike stays the final judge for anything that
  moves pixels near the throw→reveal→verdict path.
