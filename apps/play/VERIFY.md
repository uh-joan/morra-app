# apps/play — manual verification script

One section per milestone. Each step is "do X, you should see Y" with a real
camera/mic. For feel comparison, run the spike side by side: `./play.sh` in
one terminal (spike on :8080), `./play.sh app` in another (this app on :5173).

## M0 — Scaffold + shell

1. `pnpm install` at the repo root (first time only).
2. `./play.sh app` → the page opens at http://localhost:5173/.
   - You should see the dark spike-styled page: title "Morra", the Hand +
     Voice Mirror panel with Partida/Entrenament buttons, the three sensor
     buttons (Start Camera / Start Mic / Load Voice Recognition), the big
     "–" number and word placeholders, the shout badge ("mic off"), the
     verdict card ("waiting for a throw…"), and the tally row.
   - The status strip shows 7 chips, all dim: Camera idle, Model not
     loaded, Hand —, Mic idle, VAD —, Voice Rec not loaded, Clock unsampled.
   - The footer shows `session <8-hex-id> — apps/play — …`.
   - The "Ajustos (detectors)" collapsed panel at the bottom expands to show
     the velocity/RMS readouts and the HIGH_V / LOW_V / settle-ms tunables.
3. Buttons are present but inert in M0 (camera lands in M1, mic in M2,
   vosk in M4, exports in M6).
4. Error panel: paste this in the devtools console —
   `setTimeout(() => { throw new Error("test M0") })` — a red "Errors (1)"
   panel appears below the status strip; "Clear" dismisses it.
5. Telemetry: with the spike server also running (`./play.sh`), reload the
   app page, wait ~3 s, then check `ls -t spikes/logs/ | head` — a new
   `session-<id>.ndjson` matching the footer's session id contains a
   `page_load` event (the Vite dev server proxies `/log` to :8080).

## M1 — Camera path

1. `./play.sh app`, then click **Start Camera** and grant permission.
   - The Camera chip goes `requesting…` → `480x360 @ ~30fps`; the Model
     chip goes `loading…` → `loaded (GPU)` (or `(CPU)` after a one-time
     GPU-failure error entry — that retry is expected behavior, not a bug).
   - The Clock chip flips from `unsampled` to `outputLatency ok` — this is
     the fix for the old app's dead-audio-clock bug: the AudioContext is
     resumed inside the button click.
2. Show your hand to the camera:
   - The mirrored preview draws the green/amber hand skeleton overlay
     (amber while your hand moves fast, green when settled).
   - The 180 px big number tracks your finger count live (heavy on 3 vs 4 —
     that was the spike's hardest case); "no hand" ↔ "N fingers" label.
   - The hand indicator pill under the video goes green "hand detected";
     the Hand chip mirrors it with the detector state, e.g. `detected (idle)`.
3. Open "Ajustos (detectors)": throw your hand — the fingertip-velocity
   readout + meter spike, and `hand state` cycles idle → spiking →
   settling → idle. (This velocity is the spike's centroid formula; the
   thresholds HIGH 0.9 / LOW 0.25 are meaningful again.)
4. Nothing else reacts to throws yet — the sync pipeline is M3. Mic, VAD
   and voice chips stay idle until M2/M4.

## M2 — Mic + live VAD (and the vosk model load)

1. Click **Start Mic** and grant permission.
   - Mic chip → `running`; shout badge → "listening…" (calm blue).
   - The voice meter under the badge moves with room noise; the red
     threshold mark sits a bit to the right of the idle level.
   - The VAD chip shows a live `rms … / thr …` readout (Ajustos shows the
     same numbers bigger).
2. Shout a number: the badge flashes bright **SHOUT!** (~400 ms) and the
   onset-info line below reports the onset's ring-buffer time. The VAD
   chip briefly reads `firing!`. If normal speech triggers it too easily
   (or shouts don't), adjust the Sensitivity slider — it takes effect
   immediately.
3. Speaker check (this is the setup that matters for real play): with the
   spike's known behavior, no echo cancellation is applied — if you'll
   play with speakers later, note whether the rival's voice (from M5 on)
   triggers the badge; blanking handles it for scoring either way.
4. Click **Load Voice Recognition (CA)**.
   - The status line shows the model download with a live % (from the
     local dev server it's near-instant; the first ever load in a fresh
     browser still extracts into WASM for a few seconds).
   - Voice Rec chip → `loaded`; the button relabels "Voice Recognition
     Loaded (CA)"; the big word label flips "voice rec off" → "listening".
   - Recognized words do NOT display yet — recognition runs per-throw and
     the throw pipeline is M3/M4.
5. `syncReady` (throws being accepted) requires BOTH camera and mic — the
   M3 pipeline will refuse to arm with either missing.

## M3 (+M4) — The throw pipeline: throw + shout → verdict

Start Camera + Start Mic (+ Load Voice Recognition for words). This is the
milestone to compare side-by-side with the spike (`./play.sh` in another
terminal) — the FEEL should be identical.

1. **A real throw**: fist up, then throw N fingers and shout the number at
   the same moment.
   - The ready pill goes "Llest — tira!" → "Reading your throw…", and
     ~0.7 s after your hand's motion started, the verdict card resolves:
     **SYNCED** (green glow, sync delta ±ms) if hand and voice landed
     within the ±400 ms co-occurrence window.
   - With vosk loaded, the big word shows "…" then the recognized word
     («tres», «quatre»…), and the verdict card shows it quoted.
   - The tally row updates: throw count, sync %, median |Δ|; after 8+
     paired throws, "your natural lead" appears.
2. **Timing verdicts**: shout deliberately late → "voice late by Nms"
   (red); shout before you move → "voice early by ≥Nms" with the ≥ marker
   when your voice started before the capture window.
3. **Silent throw**: throw fingers, say nothing → "ONLY HAND SEEN" (amber).
4. **Reset is not a throw**: after a throw, retract to a fist silently →
   card shows "hand reset — fist seen, no voice", the throw count does NOT
   increase, and the pill re-arms immediately.
5. **Shout without throwing**: keep the hand down, shout → after ~1.5 s the
   card shows "ONLY VOICE HEARD" (the orphan-voice diagnostic the old app
   never had).
6. **Pill discipline**: after a resolved throw the pill reads "Torna al
   puny…" until your hand visibly changes (drop to a fist), then "Llest —
   tira!". It's evidence-driven, not a timer.
7. Feel check vs the spike: same throw cadence, same ~0.7 s verdict
   latency, same classifications on the same gestures. If anything feels
   different, that's a parity bug — report it.

## M5 — Partida (the real game vs the rival)

All three sensors on (camera + mic + voice recognition — the game NEEDS
vosk; without it every round is incomplete by design, same as the spike).

1. On load the rival panel shows: avatar (🧔 for L2), a closed-fist SVG
   hand, "?", and `Opponent committed: <8 hex>` — the move is sealed
   BEFORE you throw.
2. **Play a round**: fist up → throw N fingers + shout the total you guess.
   - The instant your hand settles (2+ fingers), the rival's hand flips to
     its move, the digit + Catalan word appear, the commit line gains ✓,
     and you HEAR the rival's voice (Jordi) call its number — while your
     own audio window is still open (blanking keeps it out of your shout).
   - ~0.7 s later the round card resolves: TU GUANYES! (green) / RIVAL
     GUANYA (red) / PARATA, with the full line
     `tu: N dits + "word"(call) · rival: M dits + word(call) · total T ·
     commitment ✓`, and the scoreboard ticks.
3. **Void vs incomplete** (the fairness discipline):
   - Throw fingers but flub the timing/word AFTER the rival revealed →
     RONDA ANUL·LADA — the revealed move is burned, a fresh commitment
     (new hash) is already in force.
   - Throw ≤1 fingers silently (no reveal happened) → INCOMPLETE — same
     commitment stands, same hash shown.
4. **Levels**: switch Rival (L1 L'Aprenent … L4 El Déu de la Morra) — the
   avatar + description change; the change applies from the NEXT
   commitment (never a sealed one).
5. **First to 10**: play (or drive) a match to 10 — end banner in Catalan,
   post-match card with 3 tiles (Explotabilitat / Aleatorietat /
   Sincronia), and "Torna a jugar" resets score + match history while your
   cross-match profile persists (localStorage morra-s03-playermodel-v1).
6. Feel check vs the spike (`./play.sh` side by side): the phase-1 reveal
   snap — throw → rival hand + voice instantly — is the heart of the
   experience and should be indistinguishable.

## M6 — Entrenament (L'Espill), settings, exports

1. Click **Entrenament**: the rival's place is taken by the mirror panel —
   4 tiles (Explotabilitat / Aleatorietat / Sincronia / Δ mediana),
   f/g histograms, "Crits més usats", "Els teus defectes" tells, and the
   5×5 bigram heatmap. No game, no commitments — but every throw still
   feeds the same profile the L4 rival reads.
2. Throw a few times: the panel updates live after each throw; the sample
   count line shows "N tirs (aquesta sessió)".
3. "Tot el temps" widens the scope to your whole stored history (including
   Partida rounds from previous sessions); "Aquesta sessió" narrows back.
4. **Exporta perfil (JSON)** downloads your player model; **Reinicia
   perfil** asks for confirmation and wipes it (this cannot be undone).
5. Switch back to **Partida**: the rival panel returns showing the SAME
   sealed commitment (switching modes never burns a move).
6. **Export debug log (JSON)** (top bar) downloads the full session debug
   record — per-throw timing/recognition details incl. shout loudness
   (peakBlockRms) for diagnosing recognition issues.
7. The 5 tunables (co-occurrence ±ms, Sensitivity, HIGH_V/LOW_V/settle in
   Ajustos) apply live and are logged as setting_change events.

## M7 — Automated suite

From the repo root:

```
pnpm build && pnpm test && pnpm cross-check:conformance
cd apps/play && pnpm test:integration && pnpm test:parity
```

- Unit: 357 across the workspace (225 core, 65 recognition, 55
  platform-web, 12 apps/play).
- `cross-check:conformance`: 105 cases replayed against the untouched
  spikes/modules/*.mjs — zero discrepancies (THE SPIKE IS THE TRUTH).
- Integration (`test/integration/run.mjs`): 19 checks driving the built
  app headless with fake devices — shell, gesture-gated sensors, a full
  synced round via the __play seam, L'Espill, error surfacing. SKIPs
  without a local Chrome.
- Parity (`test/parity/run.mjs`): ONE shared driver runs identical
  scenarios through the live spike's __s03 and the app's __play — synced +
  void across L1–L4, incomplete, reset, preWindow demotion, reset-latest
  guard: 18 checks. AI move VALUES stay N/A (spike hardcodes Math.random;
  the conformance corpus covers decideMove instead).

## Known field caveat — "word recognized but no onset"

The offline energy detector's threshold is `max(roomNoise × sensitivity,
0.015)` — a hard floor the Sensitivity slider cannot go below. A quiet
shout (low mic input volume, distance, noisy room) can be recognizable to
vosk (amplitude-normalized) yet below the energy floor → hand-only →
RONDA ANUL·LADA "no call word heard". Diagnose from a session's NDJSON:
`recognition_window` events carry `peakBlockRms` / `meanBlockRms` — if
peak stays ≲0.02 on real shouts, raise the macOS input volume or shout
closer; the spike behaves identically.
