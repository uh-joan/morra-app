#!/usr/bin/env python3
"""
S0.5 art spike — Blender render scaffold.

Renders the WINDUP segment ONCE and each of the five throw BODY segments,
per the plan's R1 rule (windup must be pixel-identical across every throw
render — see ../README.md section 4). This script does NOT splice windup +
body together; that's tools/splice.sh, run after this script produces frames.

Usage (headless, from the repo root or this directory):

    blender -b /path/to/character.blend -P pose_render.py -- \\
        --poses poses/poses.json \\
        --out out/ \\
        --frames-only          # optional: stop after PNG frames, skip encode

Or with defaults (character.blend expected alongside this script, poses.json
at ../poses/poses.json, output to ../out/):

    blender -b character.blend -P pose_render.py

This file imports `bpy` (the Blender Python API), which only exists inside
Blender's embedded interpreter. All bpy usage is guarded behind
`if HAVE_BPY:` / functions that are only called when running inside Blender,
so `python3 -m py_compile pose_render.py` succeeds outside Blender too (used
by CI/local syntax checks — see CHECKLIST.md).

TODO markers below are where YOUR character file's specifics plug in —
bone names, pose asset names, armature object name all vary per source mesh
(see README.md section 1-3 for sourcing/rigging).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    import bpy  # type: ignore
    HAVE_BPY = True
except ImportError:
    HAVE_BPY = False


# ---------------------------------------------------------------------------
# Config / constants
# ---------------------------------------------------------------------------

DEFAULT_POSES_JSON = "poses/poses.json"
DEFAULT_OUT_DIR = "out"

# TODO: confirm against README.md §6 / the renderer-clips package before
# locking in — this must match whatever playbackRate math the engine uses.
FRAME_RATE = 30

# Frame counts are placeholders — set these once the windup/throw animations
# are actually authored in Blender and you know their real durations.
# TODO: replace with real values once windup.blend animation is authored.
WINDUP_FRAME_COUNT = 24          # e.g. 0.8s at 30fps
THROW_BODY_FRAME_COUNT = 30      # e.g. 1.0s at 30fps, covers both w=300/150 cuts

# Reveal-timing variants (README.md §7): offsets in ms after the beat frame.
REVEAL_VARIANTS_MS = (300, 150)

FINGER_COUNTS = (1, 2, 3, 4, 5)

# TODO: these object/armature/pose names are EXAMPLES matching a typical
# Mixamo-style import (see README.md §1-2). Replace with the actual names
# in YOUR character.blend — run `blender -b character.blend --python-expr
# "import bpy; print([o.name for o in bpy.data.objects])"` to inspect.
ARMATURE_OBJECT_NAME = "Armature"          # TODO
CAMERA_OBJECT_NAME = "Camera"              # TODO
WINDUP_ACTION_NAME = "windup"              # TODO: NLA/action name for windup anim
THROW_ACTION_PREFIX = "throw"              # expects actions named throw1..throw5


# ---------------------------------------------------------------------------
# Scene setup checks (run before any render — fail loud, not silent)
# ---------------------------------------------------------------------------

def check_scene() -> list[str]:
    """Return a list of problems found in the currently loaded .blend file.
    Empty list means the scene is ready to render. This is meant to catch
    the most common "forgot to do X in Blender" mistakes before burning
    render time.
    """
    problems: list[str] = []

    if not HAVE_BPY:
        return ["check_scene() called outside Blender — no bpy available"]

    scene = bpy.context.scene

    armature = bpy.data.objects.get(ARMATURE_OBJECT_NAME)
    if armature is None:
        problems.append(
            f"No object named '{ARMATURE_OBJECT_NAME}' found. "
            f"Update ARMATURE_OBJECT_NAME to match your character.blend "
            f"(see README.md section 2)."
        )
    elif armature.type != "ARMATURE":
        problems.append(
            f"Object '{ARMATURE_OBJECT_NAME}' exists but is type "
            f"'{armature.type}', expected 'ARMATURE'."
        )

    camera = bpy.data.objects.get(CAMERA_OBJECT_NAME)
    if camera is None:
        problems.append(
            f"No camera object named '{CAMERA_OBJECT_NAME}' found. "
            f"Fixed camera framing is required (README.md section 5)."
        )
    elif scene.camera is None:
        problems.append("Scene has no active camera set (scene.camera is None).")

    if armature is not None:
        anim_data = armature.animation_data
        available_actions = (
            {a.name for a in bpy.data.actions} if bpy.data.actions else set()
        )
        if WINDUP_ACTION_NAME not in available_actions:
            problems.append(
                f"No action named '{WINDUP_ACTION_NAME}' found on armature "
                f"— author the windup animation first (README.md section 3-4)."
            )
        for n in FINGER_COUNTS:
            action_name = f"{THROW_ACTION_PREFIX}{n}"
            if action_name not in available_actions:
                problems.append(
                    f"No action/pose named '{action_name}' found — the five "
                    f"finger poses must all exist before rendering "
                    f"(README.md section 3)."
                )

    render = scene.render
    if render.fps != FRAME_RATE:
        problems.append(
            f"Scene FPS is {render.fps}, expected {FRAME_RATE}. Set "
            f"scene.render.fps to match FRAME_RATE (or update FRAME_RATE "
            f"to match your intended output)."
        )

    if render.film_transparent is False and render.engine == "CYCLES":
        # Not a hard error, just a nudge — transparent background makes
        # compositing/cropping easier downstream if ever needed.
        problems.append(
            "NOTE (non-blocking): render.film_transparent is False. "
            "Consider enabling if you want an alpha-safe render."
        )

    return problems


# ---------------------------------------------------------------------------
# poses.json loading
# ---------------------------------------------------------------------------

def load_poses(poses_json_path: Path) -> dict[str, Any]:
    """Load the poses manifest. Expected shape:

    {
      "windup": {"action": "windup", "frame_start": 1, "frame_end": 24},
      "throws": {
        "1": {"action": "throw1", "frame_start": 1, "frame_end": 30},
        "2": {"action": "throw2", "frame_start": 1, "frame_end": 30},
        "3": {"action": "throw3", "frame_start": 1, "frame_end": 30},
        "4": {"action": "throw4", "frame_start": 1, "frame_end": 30},
        "5": {"action": "throw5", "frame_start": 1, "frame_end": 30}
      },
      "reveal_variants_ms": [300, 150]
    }

    See poses/poses.json (sibling directory) for a working example scaffold.
    """
    if not poses_json_path.exists():
        raise FileNotFoundError(
            f"poses.json not found at {poses_json_path}. Create it from "
            f"the example in README.md / the docstring above, matching "
            f"your character.blend's actual action names."
        )
    with poses_json_path.open() as f:
        data = json.load(f)

    required_top = {"windup", "throws"}
    missing = required_top - data.keys()
    if missing:
        raise ValueError(f"poses.json missing required keys: {missing}")

    missing_throws = set(str(n) for n in FINGER_COUNTS) - data["throws"].keys()
    if missing_throws:
        raise ValueError(
            f"poses.json 'throws' missing entries for finger counts: "
            f"{missing_throws}"
        )

    return data


# ---------------------------------------------------------------------------
# Per-throw pose application + render-to-frames
# ---------------------------------------------------------------------------

def apply_action(armature_name: str, action_name: str) -> None:
    """Bind the named action to the armature's active animation data.
    TODO: if your rig uses NLA strips instead of a single active action per
    render pass, replace this with NLA track muting/soloing logic instead.
    """
    if not HAVE_BPY:
        raise RuntimeError("apply_action() requires bpy (run inside Blender)")

    armature = bpy.data.objects.get(armature_name)
    if armature is None:
        raise RuntimeError(f"Armature '{armature_name}' not found in scene")

    action = bpy.data.actions.get(action_name)
    if action is None:
        raise RuntimeError(f"Action '{action_name}' not found in blend file")

    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = action


def render_frame_range(
    out_dir: Path, name_prefix: str, frame_start: int, frame_end: int
) -> Path:
    """Render frame_start..frame_end (inclusive) as a PNG sequence into
    out_dir/name_prefix/, e.g. out/windup/frame_0001.png ...
    Returns the directory the frames were written to.
    """
    if not HAVE_BPY:
        raise RuntimeError("render_frame_range() requires bpy")

    scene = bpy.context.scene
    seq_dir = out_dir / name_prefix
    seq_dir.mkdir(parents=True, exist_ok=True)

    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(seq_dir / "frame_")

    scene.frame_start = frame_start
    scene.frame_end = frame_end

    # Renders frame_start..frame_end inclusive as a numbered PNG sequence.
    bpy.ops.render.render(animation=True)

    return seq_dir


def render_windup(poses: dict[str, Any], out_dir: Path) -> Path:
    """Render the windup segment. MUST be called exactly once per pipeline
    run — see README.md section 4 (WINDUP-ONCE rule, R1). This function
    itself doesn't enforce "once" (that's a pipeline-level discipline /
    validate_splice.sh's job); it just renders whatever windup.json says.
    """
    windup = poses["windup"]
    apply_action(ARMATURE_OBJECT_NAME, windup["action"])
    return render_frame_range(
        out_dir, "windup", windup["frame_start"], windup["frame_end"]
    )


def render_throw_body(poses: dict[str, Any], finger_count: int, out_dir: Path) -> Path:
    """Render one throw's body segment (post-windup reveal animation)."""
    throw = poses["throws"][str(finger_count)]
    apply_action(ARMATURE_OBJECT_NAME, throw["action"])
    return render_frame_range(
        out_dir,
        f"throw{finger_count}_body",
        throw["frame_start"],
        throw["frame_end"],
    )


def encode_sequence_to_webm(seq_dir: Path, out_file: Path) -> None:
    """Encode a PNG frame sequence to a .webm via ffmpeg. Shells out rather
    than using Blender's own video output so encode settings (README.md
    section 6) are controlled in one place, consistent with tools/splice.sh.
    """
    import subprocess

    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FRAME_RATE),
        "-i", str(seq_dir / "frame_%04d.png"),
        "-c:v", "libvpx-vp9",
        "-b:v", "0",
        "-crf", "32",
        "-pix_fmt", "yuv420p",
        "-an",
        "-row-mt", "1",
        str(out_file),
    ]
    subprocess.run(cmd, check=True)


# ---------------------------------------------------------------------------
# Naming convention
# ---------------------------------------------------------------------------

def windup_filename() -> str:
    return "windup.webm"


def throw_body_filename(finger_count: int) -> str:
    return f"throw{finger_count}_body.webm"


def final_throw_filename(finger_count: int, reveal_ms: int) -> str:
    """Naming convention for the spliced, final per-throw clip.
    e.g. throw3_w300.webm, throw3_w150.webm — see README.md section 7.
    Produced by tools/splice.sh, not by this script.
    """
    if reveal_ms not in REVEAL_VARIANTS_MS:
        raise ValueError(f"reveal_ms {reveal_ms} not in {REVEAL_VARIANTS_MS}")
    return f"throw{finger_count}_w{reveal_ms}.webm"


# ---------------------------------------------------------------------------
# Main / CLI
# ---------------------------------------------------------------------------

def parse_args(argv: list[str]) -> argparse.Namespace:
    # When run via `blender -b file.blend -P pose_render.py -- --foo`,
    # Blender consumes everything before `--`; sys.argv after `--` is ours.
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--poses", type=Path, default=Path(DEFAULT_POSES_JSON),
        help="Path to poses.json"
    )
    parser.add_argument(
        "--out", type=Path, default=Path(DEFAULT_OUT_DIR),
        help="Output directory for frames and encoded clips"
    )
    parser.add_argument(
        "--frames-only", action="store_true",
        help="Stop after rendering PNG frame sequences; skip ffmpeg encode "
             "(useful for a quick scene-setup check without a full render)"
    )
    parser.add_argument(
        "--check-only", action="store_true",
        help="Run check_scene() and exit without rendering anything"
    )
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args(sys.argv)

    if not HAVE_BPY:
        print(
            "ERROR: this script must be run inside Blender:\n"
            "  blender -b character.blend -P pose_render.py -- --poses ... --out ...",
            file=sys.stderr,
        )
        return 1

    problems = check_scene()
    # Filter out non-blocking NOTE lines for the pass/fail decision, but
    # still print them.
    blocking = [p for p in problems if not p.startswith("NOTE")]
    for p in problems:
        print(("NOTE: " if p.startswith("NOTE") else "PROBLEM: ") + p)

    if blocking:
        print(f"\n{len(blocking)} blocking problem(s) found — fix before rendering.")
        return 1

    if args.check_only:
        print("Scene check passed.")
        return 0

    poses = load_poses(args.poses)
    out_dir = args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Rendering windup (ONCE — see README.md section 4)...")
    windup_seq_dir = render_windup(poses, out_dir)
    if not args.frames_only:
        encode_sequence_to_webm(windup_seq_dir, out_dir / windup_filename())

    for n in FINGER_COUNTS:
        print(f"Rendering throw{n} body...")
        body_seq_dir = render_throw_body(poses, n, out_dir)
        if not args.frames_only:
            encode_sequence_to_webm(body_seq_dir, out_dir / throw_body_filename(n))

    print(
        "\nDone. Next step: splice windup + each throw{N}_body into final "
        "clips with tools/splice.sh, then validate with "
        "tools/validate_splice.sh."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
