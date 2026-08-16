# Iteration 1 — Field playtest telemetry analysis (2026-08-16)

**Data:** all 181 `spikes/logs/session-*.ndjson` files (34,331 events, Aug 9–16).
**Segments** (by log mtime + in-session spans):

| Segment | When | What it was |
|---|---|---|
| HOME | Aug 9–15 | Dev + home play (quiet, corpus recorded with headphones) |
| EARLY | Aug 16, 13:00–15:25 | Same-day controlled play before heading out |
| **FIELD** | **Aug 16, 15:30–17:20** | **Real morra users, noisy venue, no headphones** |

Field day totals: 94 sessions, 2,356 throws, 556 reveals, ~136 min of active play.
Human-ambiguity check + batch scoring on the s02 rig were run and passed separately
(browser-side; that corpus lives in IndexedDB, not in these logs).

---

## 1. Headline: the noise didn't break the recognizer — it broke the onset detector

| Metric | HOME | EARLY | FIELD |
|---|---|---|---|
| Throws | 1,193 | 1,007 | 1,349 |
| **synced** | 35% | 46% | **19%** |
| **voice-early** | 3% | 10% | **64%** |
| reset | 44% | 34% | 8% |
| hand-only | 17% | 7% | 7% |
| Reveals per throw | 33% | 41% | **10%** |
| Pace (rounds/min of active play) | 2.8 | 6.6 | **1.9** |
| Commits burned as voice-early | 5 | 33 | **422** |
| `voicePreWindow=true` throws | 37 | 99 | **807** |

The FIELD voice-early syncDelta histogram is the smoking gun — it piles up at the
capture-window edge, not around real shouts:

```
  -700ms:  102  ######
  -600ms:  491  ################################   ← pinned to window start
  -500ms:   62  ####
  -400..0:  168 (spread)
```

593 of 868 voice-early throws (68%) sit in the -600/-700 bucket, and 807 carry
`voicePreWindow=true`: the energy was **already above threshold the instant the
window opened**. That is continuous room noise, not players shouting early.

### Root cause (located in code)

`packages/recognition/src/voice/onset.ts` — the offline, authoritative onset used
for sync — **restarts `noiseFloor = 0.001` on every analysis pass**. Threshold
starts at `max(0.001 × vadMult, floorMin=0.015)` ≈ 0.015. In a quiet room the
first blocks sit under that and the floor adapts; in the venue, ambient RMS was
above 0.015 at block 0, so the detector returned `{onsetMs: 0, preWindow: true}`
immediately (onset.ts L40–42) — every single time. The offline detector never
gets to learn the room the way the live worklet's floor (which adapts
continuously) does.

Corroborating evidence: someone was fighting this live — `vadMult` was changed
8 times on Aug 16 (values from 2 to 12.5). The knob can't win, because the
offline pass forgets the floor each throw.

## 2. Recognition (vosk) itself held up surprisingly well

No-word rate **on synced throws only** (the fair test — global "57% no-word" is
dominated by resets, where nobody shouted, 99–100% no-word as expected):

| Segment | no-word on synced throws | median latency | p90 |
|---|---|---|---|
| HOME | 4% | 137 ms | 143 ms |
| EARLY | 10% | 134 ms | 152 ms |
| FIELD | **39%** | 148 ms | 156 ms |

Latency stayed comfortably inside the ≤70 ms post-close budget's overall
envelope even in the noise (it's compute-bound, not noise-bound). Word yield in
noise degraded (39% of synced throws produced no usable word) but the pipeline
was starved upstream anyway: only 260 throws even reached synced in the field.
**Fix the onset first; re-measure vosk in iteration 2 before touching it.**

Recognized-word distribution is healthy and matches real play (vuit/sis/set most
called). 202 windows skipped for "too little audio" across all segments — small.

## 3. Knock-on effects visible in the field data

- **AI aim hit rate: 18% (HOME) / 17% (EARLY) → 8% (FIELD)** — below the 20%
  random baseline. The AI was aiming at a player-finger distribution learned
  from rounds that mostly never resolved; garbage in, garbage out.
- **Matches completed (someone reached 10): 4 in the EARLY block alone vs 3 in
  the whole field session** — with ~10× the audience.
- The longest field session (`2ad3742f`, 17:08–17:18) is brutal: 332 throws,
  **11 reveals**. Ten minutes of a group throwing at a wall.
- 460 total voice-early burns means the commit→reveal trust mechanic spent the
  evening burning hashes instead of revealing them.

## 4. What went right (worth keeping)

- The system survived ~2 hours of continuous group use: no crashes, zero
  `error` events during the field window (the 4 vendor-fetch errors were
  EARLY, dev-server port 5174; `setGameHooks` errors are pre-Aug-16 builds).
- Onboarding was exercised for real: 43 starts → 39 ready. New-user flow works.
- Mode tècnic got used in anger (20 toggles), profiles were created mid-field
  (`pmst82zczsd`, `pmsw01m3ewx`), and the vadMult/coOccurrence tunables being
  reachable saved the session from being a total loss.
- EARLY block shows the game at its best: 6.6 rounds/min, 46% synced, 41% of
  throws becoming reveals. **The game is good when the onset layer can hear.**

## 5. Ranked fixes for iteration 2

1. **Prime the offline onset's noise floor** (packages/recognition/onset.ts):
   seed from the live worklet's continuously-adapted floor, or from the first
   ~100–150 ms of the window itself, instead of the constant 0.001. This is a
   deliberate divergence from the spike oracle — gate it behind a config flag
   and extend the conformance corpus with noisy-window fixtures so parity stays
   meaningful.
2. **Ambient calibration step in onboarding** ("Calibra el soroll…"): sample
   ~2 s of room noise before play, set floorMin/vadMult from it, re-run on
   demand. Cheap, and it also fixes the *live* VAD cosmetics in noise.
3. **Rules decision (Janis):** should `preWindow + no recognized word` still
   burn the commit as voice-early? In continuous noise that verdict is almost
   always wrong. Option: downgrade to hand-only when there's no recognized
   word AND the onset was preWindow-pinned. This touches verdict semantics —
   explicitly NOT skin-only, needs its own decision + corpus entries.
4. **A/B the mic constraints:** `noiseSuppression`/`echoCancellation`/AGC are
   all off (spike parity). In a venue, browser noise suppression might carry
   real weight — test it as a toggle in mode tècnic before deciding.
5. **Field kit:** a directional/headset mic for the shouting player is the
   zero-code mitigation for the next outing; also record a noisy-venue corpus
   with the s02 recorder (current corpus is headphones-at-home — the exact
   condition that didn't fail).
6. Minor observability: `gesture_reset` events stopped appearing in Aug-16
   builds (all 636 are pre-Aug-16) while `reset` outcomes continue — check the
   event didn't get lost in the ux-pirates refactor.

## 6. Caveats

- Segment boundaries are inferred from file mtimes (15:30 cut); a few
  EARLY/FIELD sessions near the boundary could be misassigned.
- No ground truth for what players actually shouted, so "no-word" conflates
  recognizer misses with players not shouting; the synced-only view minimizes
  but doesn't eliminate this.
- The s02 corpus results (human check, batch scoring, streaming probe) live in
  the browser's IndexedDB — export them (Export tab → manifest + WAVs) if you
  want them preserved alongside this analysis.
