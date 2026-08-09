# S0.5 — Art Capability Spike

**Gate (from the plan, Step 0 row S0.5):** produce ONE throw-clip end-to-end via
the AI-assisted pipeline below (base mesh + Blender + render). Show **3/3 blind
raters** the clip's informative frame; all three must identify the finger count
correctly. Median rating on "looks like a game character, not a placeholder"
must be **≥ 4/5**. Fail either gate → drop to the pre-authorized fallback tier
chain: **stylized → hands-only** (user-approved 2026-08-08, see plan risk table).

This spike also validates the **splice mechanism** (R1) that the full 15-render
model depends on at Step 7: the windup is authored and rendered **once**, then
concatenated as the identical head of every throw render. If the splice leaks
finger-count information through the windup segment, or the windup pixels
diverge across throws, R1 is violated and the whole clip-composition model
(D4) is unsound — that's why `tools/validate_splice.sh` exists and is not
optional.

This README is the runbook: sourcing a mesh through a rated, splice-validated
final clip. It is written so the pipeline scales unchanged from "one clip for
this spike" to "15 clips for Step 7 content" (5 finger poses × 2 reveal-timing
variants, sharing one windup head — see plan §Step 7).

---

## 0. Vocabulary

- **Windup** — the pre-beat anticipation animation. Character raises hand,
  no fingers legible yet. Identical in every throw render (R1).
- **Throw / reveal** — the beat-aligned moment the hand snaps to its final
  finger-count pose and holds. This is the "body" segment that differs per
  throw (1–5 fingers).
- **Informative frame** — the single frame raters are shown to judge finger
  legibility. It sits at a fixed offset **after the beat frame**: this spike
  authors **two reveal-timing variants**, informative frame at **+300 ms**
  and at **+150 ms** post-beat (matching the two `w` tempo tiers in the
  plan, D16). Both variants share the same windup and the same final pose;
  only how soon post-beat the pose is legible/held differs.
- **Beat frame** — the frame whose presentation time is `T_beatAudible`
  (see plan driver 1). The engine schedules playback so this frame lands on
  the beat; render-time, we just need a clean, unambiguous frame at that
  index to offset from.

## 1. Sourcing a rigged base character mesh

We are not modeling a character from scratch — no artist on the team. Source
a **CC0 / permissively-licensed, already-rigged** humanoid with usable hand
bones (or riggable hands) and bring it into Blender.

Concrete candidates, cheapest-to-most-effort first:

| Source | What you get | Hand rig? | License | Notes |
|---|---|---|---|---|
| [Mixamo](https://www.mixamo.com/) | Rigged humanoids + huge anim library, auto-rigger for your own mesh | Full finger bones on most characters | Free w/ Adobe account, redistribution-friendly for game use — **read current ToS before shipping** | Fastest path. Auto-Rigger can also rig a **mesh sourced elsewhere** if you like its look better than the stock characters. |
| [Quaternius](https://quaternius.com/) | Low-poly CC0 character packs, some rigged, stylized | Often simplified hands (mitten/no separate fingers) — **check per-model**, may need finger bones added manually | CC0 | Good fit if the project ends up in the **stylized fallback tier** — assets already read as "game," not "realistic-but-uncanny." |
| [Poly Haven](https://polyhaven.com/models) | High-quality CC0 models/HDRIs | Mostly **props/environment**, not rigged characters | CC0 | Use for **lighting (HDRIs)** and stage/background dressing, not the character itself. |

**Selection checklist** (apply to whatever you pick):
1. Individually posable fingers (5 per hand, or at minimum the throwing hand)
   — a single "hand curl" blend shape is not enough; morra poses need
   independent finger states.
2. Import cleanly to Blender 4.x as FBX or glTF with the armature intact.
3. License permits redistribution inside a shipped game asset (Mixamo:
   confirm current terms; CC0 sources: no restriction).
4. Reasonable poly count for real-time-adjacent offline render (a few
   thousand tris is plenty at chest-height hand framing — see §4).

If the sourced rig has no finger bones (common on stylized low-poly packs),
either (a) pick a different source with fingers, or (b) rig fingers in
Blender yourself (§2) — budget extra time, this is exactly the kind of cost
that pushes the project toward the **stylized fallback tier** if it blows
the spike's time box.

## 2. Importing to Blender 4.x

1. `File > Import > FBX` (or glTF 2.0, whichever the source provides).
2. Verify the armature: `Viewport > Armature > Show in Front`, check the
   hand/finger bone chain exists (`hand.R`, `thumb.01.R`…`pinky.03.R` or
   equivalent — naming varies by source).
3. If importing via Mixamo, bones are typically prefixed (`mixamorig:Hand_R`
   etc.) — keep the prefix, don't rename mid-pipeline; `poses.json` (§3)
   should reference whatever names actually exist in **your** file.
4. Apply all transforms (`Ctrl+A > All Transforms`) on mesh and armature
   before posing — avoids scale/rotation surprises when the render script
   drives bone rotations programmatically.
5. Save as `character.blend` in this spike's working directory (gitignored —
   see CHECKLIST.md; the source mesh is not committed to the repo).

## 3. Hand-rig requirements

The throwing hand needs, at minimum:

- **Independent rotation control per finger segment** (proximal/middle/distal
  or a simplified 1-bone-per-finger rig is acceptable for the flat, extended
  morra poses — we don't need curl gradients, we need "extended" vs "closed").
- **IK or FK on the arm** — FK is sufficient and simpler for a single held
  windup→throw arc; IK only matters if you want the hand to hit a precise
  screen-space target across different arm lengths from different source
  meshes. Default to FK unless you have a reason not to.
- A **rest/closed-fist pose** as the windup pose (no fingers legible — this
  is what makes the windup safe to reuse across all five throws, R1) and
  five **named pose targets**, one per finger count.

### The five finger poses

Morra shows 1–5 fingers as a forceful, sudden extension (not a gentle
count-up). Author each as a single held pose (not an animated curl):

| Pose | Fingers extended | Reference |
|---|---|---|
| `throw1` | index only | fist otherwise closed |
| `throw2` | index + middle | "peace sign" adjacent, not identical — keep it a throw, not a gesture |
| `throw3` | index + middle + ring | |
| `throw4` | index + middle + ring + pinky (no thumb) | |
| `throw5` | all five, thumb included, open hand | |

Author these as **pose assets or keyframed poses** on the armature, one per
throw, held during the "throw" render pass. Keep the **arm/wrist path**
identical across all five — only the finger state should differ — so the
five throw renders are visually consistent with each other and with the
shared windup.

## 4. The WINDUP-ONCE rule (R1 — critical)

**This is the load-bearing constraint of the whole clip-composition model
(plan D4).** Read this section before rendering anything.

> The windup segment is animated and rendered **exactly once**. Every throw
> render is produced by concatenating that **one** windup render with a
> throw-specific "body" render. The windup pixels must be **byte-for-byte
> identical** (or at minimum pixel-identical under diff) across all final
> throw clips — because if the windup differed even subtly per throw (a
> different sub-pixel arm angle, a compression artifact that correlates
> with which pose follows), a sufficiently motivated player — or a
> classifier — could learn to predict the finger count **before the reveal**,
> which breaks the game's whole "perceived simultaneity" premise (plan
> driver 1, R1).

Practically, this means:

1. **Render the windup animation once**, producing `windup.webm` (or PNG
   sequence → encode once). Do not re-render it per throw, do not re-export
   it per throw, do not let per-throw metadata (filenames, timestamps) leak
   into pixel content (e.g. burned-in labels — don't do this).
2. Each throw's "body" segment (`throw{N}_body.webm`) starts from the **exact
   last frame of the windup** (same camera, same lighting, same character
   transform) and animates only the reveal.
3. Splicing (`tools/splice.sh`) concatenates `windup.webm + throw{N}_body.webm`
   into the final per-throw clip. Stream-copy concatenation (no re-encode)
   is strongly preferred for the windup segment specifically, because
   re-encoding is a second place identical input could produce
   non-identical output (different encoder pass decisions) — see
   `tools/splice.sh` for the fallback if stream-copy isn't possible given
   your codec/keyframe layout.
4. **Validate, don't assume.** `tools/validate_splice.sh` extracts the
   windup segment back out of every final rendered clip and diffs them
   against each other. This is the S0.5-specific proof for the plan's
   Step-7 gate ("windup leak gates (R1): pixel-diff asserts windup frames
   identical across all throw renders").

## 5. Camera / framing spec

Fixed, locked-off camera for the whole pipeline (no camera cuts, no push-in
— consistency across renders matters more than cinematography here):

- **Opponent facing the viewer**, roughly head-on with a slight 3/4 turn if
  it reads more naturally for the character's idle stance — pick one and
  keep it identical across all 15 renders.
- **Throwing hand at chest height**, framed so the hand and forearm occupy
  a stable, legible region of frame — this is what the finger-count
  recognition (both human raters here, and later the vision recognizer
  spikes S0.1/S0.4 for the *player's* hand, though that's a separate
  camera) depends on. Leave headroom; don't crop the hand at frame edges
  during the throw pose.
- **Static focal length, static camera transform** — save the camera as
  part of `character.blend` so it can't drift between render sessions.
- **Lighting**: fixed 2–3 point setup (or a single HDRI from Poly Haven),
  saved in the same file. Lighting must not change between windup and body
  renders, or the splice seam will be visible even with matching poses.

## 6. Render settings

Target: **VP9 or AV1**, web-deliverable, **≤ 35 MB total across all 15
renders** (5 finger poses × 2 reveal-timing variants — see plan Step 7; for
this spike specifically you are validating the pipeline with one clip, but
render settings should already be tuned to the 15-clip budget so Step 7 is
a scale-up, not a redesign).

Rough per-clip budget: 35 MB / 15 ≈ **2.3 MB/clip** average. Windup is shared
storage-wise only if you keep it as a **separate reusable asset** the player
downloads once and splice **client-side or at build time** — check with the
renderer-clips package design (plan `renderer-clips/`) before assuming
server-side splicing; if the runtime plays `windup.webm` once and then seeks
into per-throw body clips, the effective per-throw *marginal* download is
much smaller than 2.3 MB. Document whichever model you actually implement
in `blender/pose_render.py`'s header comment.

Suggested `ffmpeg` encode settings (tune per real render, these are starting
points, not gospel):

```
# VP9, quality-constrained, no audio (windup/throw clips are silent —
# vocal/audio cues are a separate spike, S0.2)
ffmpeg -i frames_%04d.png -c:v libvpx-vp9 -b:v 0 -crf 32 \
  -pix_fmt yuv420p -an -row-mt 1 windup.webm

# AV1 alternative (smaller at same quality, slower encode — fine for an
# offline asset pipeline)
ffmpeg -i frames_%04d.png -c:v libaom-av1 -b:v 0 -crf 34 -cpu-used 4 \
  -pix_fmt yuv420p -an out.webm
```

Frame rate: match whatever the engine's `playbackRate` story assumes (plan
D5/D8 — 30fps is a safe, broadly-compatible default; confirm against the
renderer-clips package before locking in).

## 7. The two reveal-timing variants

Per the plan (D16, Step 7 acceptance row), the informative frame — the frame
raters/the recognizer treat as "the reveal is legible now" — is authored at
**two fixed offsets after the beat frame**:

- **`w=300`**: informative frame at **beat + 300 ms**.
- **`w=150`**: informative frame at **beat + 150 ms**.

These are **not** two different animations of the hand snapping into place —
they're two different **body-segment cuts/timings** of when the pose is
already-legible-and-held, matching the two tempo tiers the game engine can
pick between at runtime. Author the body segment so the pose is fully
resolved (no in-between blur) by the earlier of the two offsets, then simply
mark/trim the clip so the "informative" frame lands at the right spot for
each variant. Naming convention: `throw{N}_w{300|150}.webm` (see
`blender/pose_render.py`).

## 8. Pipeline order of operations

```
1. Source + import mesh (Blender, manual)         §1–2
2. Rig verification / finger authoring (manual)    §3
3. Author windup pose→animation (manual, Blender)  §4
4. Author 5 throw body poses (manual, Blender)      §3
5. Render windup ONCE           -> windup.webm      blender/pose_render.py + §4
6. Render 5 throw bodies        -> throw{N}_body.webm  blender/pose_render.py
7. Splice windup + each body -> throw{N}_w{300,150}.webm   tools/splice.sh
8. Validate splice pixel-identity across all outputs        tools/validate_splice.sh
9. Blind-rater pass on the informative frame + windup-only frames   rater/rating-sheet.md
10. Gate check: 3/3 correct AND median look-and-feel >= 4/5
    -> pass: proceed:; fail: drop to stylized/hands-only fallback (plan-approved)
```

## 9. Fallback tiers (pre-authorized, plan risk table, 2026-08-08)

If the gate fails at any point — sourcing a usable rig proves infeasible,
the render doesn't clear the rater bar, or the timeline blows the spike's
box — fall back **in order**, do not silently lower the bar:

1. **Stylized** — simpler/low-poly character (e.g. straight from Quaternius
   without heavy customization), leaning into an intentionally cartoonish
   look rather than chasing realism. Often *easier* to clear "looks like a
   game character" because it isn't fighting the uncanny valley.
2. **Hands-only** — drop the full character; render/show only the throwing
   hand and forearm against a simple background. Loses character
   personality but keeps the finger-legibility and windup-splice mechanics
   intact, which are the actually load-bearing parts of the gate.

Both tiers still go through the same splice/validate/rate pipeline in this
spike — only the source asset and framing change.

## 10. What this spike does NOT cover

- Voice/audio for the character (S0.2).
- The finger-recognition CV pipeline for the *player's* hand (S0.1/S0.4) —
  unrelated camera, unrelated code path, only shares the "5 finger states"
  vocabulary.
- Runtime splice/playback wiring inside `renderer-clips/` (that's Step 7
  product code) — this spike proves the pipeline and the splice mechanism
  offline, it doesn't integrate with the game engine.
