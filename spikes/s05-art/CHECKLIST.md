# S0.5 Checklist — who does what

Legend: **[USER]** hands-on human work, mostly in Blender or with raters.
**[SCRIPTED]** already scaffolded in this spike, runs via CLI/Blender headless.
**[AI-TOOL]** optional AI-assisted step to speed up **[USER]** work — suggested
tools, not required, and not scripted here.

## 1. Sourcing & rigging — [USER]

- [ ] Pick a base mesh source (README.md §1): Mixamo character, or a
      Quaternius pack, or another CC0/licensed rigged humanoid.
- [ ] Confirm license permits redistribution in a shipped game asset.
- [ ] Import to Blender 4.x (README.md §2), verify armature + finger bones.
- [ ] If the source has no finger rig: either pick a different source, or
      hand-rig fingers in Blender (budget extra time; consider going
      straight to the stylized fallback tier if this blows the time box).
- [ ] Save as `character.blend` in this spike's working directory (not
      committed to git — see "Not committed" below).

**[AI-TOOL] suggestion:** if hand-rigging fingers from scratch turns out to
be the bottleneck, Mixamo's Auto-Rigger can take a *custom* mesh (sourced
elsewhere, e.g. a nicer-looking Quaternius model) and auto-generate a full
finger rig from it — often faster than manual rigging. Not required; try
manual rigging first if the source already has usable hand bones.

## 2. Authoring poses & animation — [USER]

- [ ] Author the **windup** pose/animation (closed fist, no fingers legible
      — README.md §4).
- [ ] Author the **five throw poses** (README.md §3 table): throw1..throw5,
      each a held pose with the arm/wrist path identical across all five.
- [ ] Author **body segment** timing so the pose is fully resolved by the
      earlier reveal offset (w=150ms) — needed for both reveal-timing
      variants (README.md §7).
- [ ] Set up **fixed camera + lighting** (README.md §5), save in the same
      `.blend` file.
- [ ] Update `poses/poses.json` with the real action names and frame ranges
      from your actual `.blend` file (the checked-in one is a placeholder
      scaffold with example values).

**[AI-TOOL] suggestion:** if authoring 5 distinct, readable hand poses by
hand-manipulating bones is slow, most humanoid rigs ship with (or can
import) pose libraries; alternatively, sketch/describe each pose to an
image-generation tool for a quick visual reference to pose against, rather
than generating the 3D asset itself (3D generation from text/image is not
reliable enough yet for a rigged, animatable result — stick to Blender for
the actual asset).

## 3. Rendering — [SCRIPTED]

- [ ] Run `blender -b character.blend -P blender/pose_render.py -- --check-only`
      first — confirms armature/camera/actions/fps are all in place before
      spending render time.
- [ ] Run `blender -b character.blend -P blender/pose_render.py -- --poses poses/poses.json --out out/`
      to render windup + 5 throw bodies to PNG sequences and encode to
      `.webm` (README.md §6 settings).

**[USER]** step folded in here: review the rendered frames for obvious
problems (clipping, lighting seam between windup and body, finger overlap)
before moving on — the script renders what you authored, it can't judge
whether it looks right.

## 4. Splicing — [SCRIPTED]

- [ ] Run `tools/splice.sh out/windup.webm out/ out/final/` (adjust per
      actual body-file naming — see script header for `--dual-variant`
      placeholder mode if per-variant body renders don't exist yet).
- [ ] Confirm it reports `OK (stream-copy)` for each pair. If it falls back
      to re-encode, note that in your results — it changes what
      `validate_splice.sh` can strictly prove.

## 5. Validating the splice (R1) — [SCRIPTED]

- [ ] Run `tools/validate_splice.sh out/final/` (framemd5 method by
      default).
- [ ] Confirm output says **IDENTICAL** for every clip pair. This is the
      concrete proof artifact for the plan's R1 requirement — don't skip
      it, don't eyeball it instead.
- [ ] If splice.sh used the re-encode fallback, re-run with
      `--method ssim` and record the SSIM values too.

## 6. Blind rating — [USER]

- [ ] Recruit 3 raters (not the pipeline author).
- [ ] Walk through `rater/rating-sheet.md` Tests 1-3 in order, in person or
      screen-share (don't email the clips ahead with no supervision — you
      want to control what they've seen and in what order).
- [ ] Fill in the results tables in the rating sheet.
- [ ] Check the overall gate: 3/3 finger-count correct AND median
      look-and-feel rating ≥ 4/5.

## 7. Decision — [USER]

- [ ] If gate **passed**: S0.5 is cleared, proceed with this pipeline
      scaled to the full 15-render model at Step 7.
- [ ] If gate **failed**: drop to the next fallback tier (stylized, then
      hands-only — README.md §9, pre-authorized 2026-08-08) and repeat
      from step 1 or 2 with the simpler asset. Log what failed and why —
      this feeds the plan's risk table.

## What's scripted vs. what's genuinely manual

| Step | Owner | Why |
|---|---|---|
| Mesh sourcing/licensing decision | USER | Judgment call, not automatable |
| Blender rigging/posing/animation | USER | Requires a human making it look right in the 3D viewport |
| Scene readiness check | SCRIPTED | `pose_render.py --check-only` |
| Frame rendering + encode | SCRIPTED | `pose_render.py` |
| Splicing | SCRIPTED | `tools/splice.sh` |
| Splice pixel-identity validation | SCRIPTED | `tools/validate_splice.sh` |
| Recruiting raters | USER | Needs real people |
| Running the rating sessions | USER | Needs supervision per the ordering rule (rating-sheet.md) |
| Gate pass/fail decision | USER | Final judgment, informed by scripted evidence |

## Not committed to this repo

`character.blend`, rendered frame sequences, and `.webm` outputs are
pipeline artifacts, not source — do not commit them. Add (or confirm) a
`.gitignore` entry for this spike's `out/` directory and any `.blend` /
`.blend1` files before committing script changes.
