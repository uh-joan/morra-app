# Step 0 Spikes — Operator Run-Sheet

These five spikes gate everything (plan: `.omc/plans/morra-micatio-vertical-slice.md`, Step 0).
**No monorepo scaffolding happens until the kill criteria below are evaluated with REAL data.**
Every harness only records real measurements — none of them can fabricate results.

## Serving

```bash
cd spikes
python3 -m http.server 8080          # plain HTTP (crossOriginIsolated = false)
python3 serve-coi.py 8000            # with COOP/COEP headers (for the S0.4 comparison run)
```

Open the pages in **real Chrome** (not headless), grant camera/mic permission when asked.
Reference hardware for the numbers: your M1 MacBook Air (baseline). If you can also run
on a low-end Windows laptop, even better — the plan binds figures to both.

## The five spikes

| Spike | Page | What you do | Kill criterion (gate) |
|---|---|---|---|
| **S0.3 — RUN THIS FIRST** (existential: decides the product shape) | `s03-beat.html` | Start metronome+camera+mic, tune thresholds in Advanced until live readouts look sane, then **5 people × 40 throws each**: throw fingers + shout the number on the beat. Export CSV. | Both channels within **±200 ms** of the beat **≥85%** of throws. Fail → product pivots to button+voice or buttons (pre-authorized). Also run the 5-min drift test once (target <10 ms). |
| S0.1 — finger CV | `s01-fingers.html` | Hold the true digit key (1–5) while throwing that many fingers. **5 people × 3 lighting conditions** (window backlight / overhead LED / dim lamp), heavy on 3s and 4s. Export CSV. | **≥90% on 3-vs-4** per tester/lighting; worker inference **≤12 ms p95**; main thread **≤8 ms/frame**. |
| S0.2 — shouted voice | `s02-voice.html` | Load the model (pre-filled, self-hosted — the official host blocks CORS). Record **2 speakers × 11 Italian words × ≥5 SHOUTED reps** (EN optional). Run Batch Scoring, Streaming Probe, Human-Ambiguity Check. Export. | vosk **≥80%** shouted; download ≤60 MB ✓(47 MB); heap ≤300 MB; batch ≤250 ms; **streaming probe ≤100 ms**; kill only if humans themselves score <95% on the corpus. <80% → tiny trained KWS becomes mandatory primary (risk flag, not kill). |
| S0.4 — contention | `s04-contention.html` | Start camera, cycle Idle / Full-rate / Window-burst ~30 s each in a real windowed browser. Run once under plain HTTP and once under `serve-coi.py`. Export JSON. | **Sustained 60 fps** main thread with CV duty-cycled (idle p50 ≥59, p5 ≥55). Capability table + decoder probe feed the ADR's COOP/COEP decision. |
| S0.5 — character art | `s05-art/` (no page) | Follow `s05-art/CHECKLIST.md`: source a rigged mesh, author the 5 finger poses in Blender, render via `blender/pose_render.py`, splice via `tools/splice.sh`, validate via `tools/validate_splice.sh`, then run `rater/rating-sheet.md` with 3 blind raters. | **3/3 raters** read the finger count from the informative frame; windup-only guesses at **chance (~20%)**; "game character not placeholder" **median ≥4/5**. Fail → stylized tier → hands-only tier (both pre-authorized). |

## Findings already validated while building the harnesses (feed the ADR)

- **MediaPipe in a Worker requires a CLASSIC worker** (importScripts / dynamic `import()`), never `{type:'module'}` — "ModuleFactory not set" otherwise. Found independently by two spikes.
- **COOP/COEP does not break our CDN loads** (React UMD with `crossorigin`, tasks-vision via `+esm` + raw asset base both load cleanly under `require-corp`) — verified with a real COEP server.
- **vosk grammar restriction genuinely constrains decoding** on the small IT model (validated with real audio), **but `[unk]` never fires** — out-of-vocab speech is forced to the nearest number word, so the product reject-class needs confidence/duration heuristics on top of the grammar.
- **The official vosk model host (alphacephei.com) blocks CORS** — the IT model is self-hosted at `spikes/models/` (47.4 MB, `fetch-it-model.sh` re-fetches it).
- jsdelivr needs the **`+esm` suffix** for the tasks-vision module import, and the **raw package path** for WASM assets — two different URLs.
- MediaPipe's graph requires **strictly monotonic timestamps**; rVFC's `expectedDisplayTime` isn't guaranteed monotonic — clamp before feeding the graph, keep the real time for offset math.

## After you've collected the data

Bring the exported CSVs/JSONs back to a Claude session. The gate evaluation (pass / risk-flag / pivot per spike) is made **from your real numbers**, and only then does step 2 (monorepo walking skeleton) begin. The S0.3 rig is retained as the step-1 corpus capture harness — don't delete it with the other spikes.
