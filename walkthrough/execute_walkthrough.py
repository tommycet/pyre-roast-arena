#!/usr/bin/env python3
"""
execute_walkthrough.py — Run a walkthrough plan via Playwright and record.

Usage:
    python3 execute_walkthrough.py <plan.yaml> [--out <output_dir>]

Output:
    <output_dir>/walkthrough.webm     (raw recording, before speedup)
    <output_dir>/walkthrough.mp4      (final, after speed regions + trim + size)
    <output_dir>/walkthrough.gif      (if output.format includes 'gif')
    <output_dir>/walkthrough.timeline.json  (per-stage timing data)
    <output_dir>/plan.yaml            (copy of the plan — the "project file")

Plan YAML schema (see SKILL.md for full reference):
    target_url:    full URL of the dApp root
    viewport:      [width, height] (default 1440x900)
    fps:           output frame rate (default 25)
    output:        { format, size, quality, trim, gif_fps }  (all optional)
    stages:
      - id:        unique identifier
        description: human-readable description
        scroll_to: { y, behavior } — position page BEFORE running actions
        speed:     N — fast-forward this stage Nx in the final video (opt-in)
        actions:   list of operations (goto, click, fill, wait, scroll, eval)
        expected_visible: text that should appear in body.innerText after stage

Output config (all optional, with sensible defaults):
    output.format:    'mp4' (default) | 'gif' | 'both'
    output.size:      'original' (default) | '1080p' | '720p' | '480p'
    output.quality:   'high' (default, crf 18) | 'medium' (crf 23) | 'low' (crf 28)
    output.trim:      { start: <sec to skip from start>,
                        end:   <sec to skip from end> }
    output.gif_fps:   integer, default 15
"""
import argparse
import json
import re
import subprocess
import sys
import shutil
from pathlib import Path

import yaml
from playwright.sync_api import sync_playwright


# ------------------------------------------------------------------
# Output presets
# ------------------------------------------------------------------

SIZE_PRESETS = {
    "original": None,    # use the recorded resolution
    "1080p":   (1920, 1080),
    "720p":    (1280, 720),
    "480p":    (854, 480),
}

QUALITY_PRESETS = {
    "high":   18,
    "medium": 23,
    "low":    28,
}


def run_actions(page, actions, target_url):
    """Execute a list of actions on the page."""
    for action in actions:
        if "goto" in action:
            url = action["goto"]
            if url.startswith("/"):
                url = target_url.rstrip("/") + url
            page.goto(url, timeout=20000)
            yield ("goto", url)
        elif "click" in action:
            sel = action["click"]
            page.click(sel)
            yield ("click", sel)
        elif "fill" in action:
            sel = action["fill"]["selector"]
            val = action["fill"]["value"]
            page.fill(sel, val)
            yield ("fill", f"{sel} = {val!r}")
        elif "wait" in action:
            ms = int(action["wait"])
            page.wait_for_timeout(ms)
            yield ("wait", f"{ms}ms")
        elif "scroll" in action:
            y = action["scroll"]["y"]
            behavior = action["scroll"].get("behavior", "smooth")
            page.evaluate(f"window.scrollTo({{top: {y}, behavior: '{behavior}'}})")
            yield ("scroll", f"y={y} behavior={behavior}")
        elif "eval" in action:
            try:
                result = page.evaluate(action["eval"])
                yield ("eval", f"returned {result!r}" if result is not None else "ok")
            except Exception as e:
                yield ("eval-error", f"{type(e).__name__}: {str(e)[:120]}")
        else:
            yield ("warn", f"unknown action: {action}")


def check_expected(page, expected):
    """Check that the expected text is visible somewhere in the page."""
    if not expected:
        return True
    try:
        body_text = page.evaluate("document.body.innerText || ''")
        if expected.lower() in body_text.lower():
            return True
        for _ in range(4):
            page.wait_for_timeout(500)
            body_text = page.evaluate("document.body.innerText || ''")
            if expected.lower() in body_text.lower():
                return True
        snippet = body_text[:120].replace("\n", " | ") if body_text else "(empty)"
        print(f"    [debug] expected {expected!r} not in body. body starts: {snippet!r}")
        return False
    except Exception as e:
        print(f"    [check] error: {type(e).__name__}: {e}")
        return False


def get_video_duration(path: Path) -> float:
    """Return duration in seconds via ffprobe."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True
    )
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def get_video_size(path: Path) -> tuple:
    """Return (width, height) via ffprobe."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", str(path)],
        capture_output=True, text=True
    )
    try:
        w, h = r.stdout.strip().split("x")
        return int(w), int(h)
    except (ValueError, AttributeError):
        return 0, 0


def build_speed_filtergraph(segments, total_duration, trim_start=0, trim_end=0):
    """
    Build an ffmpeg filtergraph that applies per-segment setpts (speed change)
    and concat's the segments back together.

    segments: list of dicts {start, end, speed}  (times in seconds, in original video)
    total_duration: full video duration
    trim_start, trim_end: seconds to chop from the start/end of the final video
                          (applied AFTER speedup, so this is a bit tricky — we
                           pass it through as `trim` filters per segment).

    Returns: (filtergraph_str, output_duration_estimate)

    The filtergraph chains:
        [0:v]trim=start=S0:end=E0,setpts=PTS/SPEED0[v0];
        [0:v]trim=start=S1:end=E1,setpts=PTS/SPEED1[v1];
        ...
        [v0][v1][v2]concat=n=N:v=1:a=0[outv]
    """
    # If no segment is sped up, return a passthrough (just trim).
    if all(s.get("speed", 1) == 1 for s in segments):
        if trim_start == 0 and trim_end == 0:
            return None, total_duration

    parts = []
    output_duration = 0
    for i, seg in enumerate(segments):
        s, e = seg["start"], seg["end"]
        speed = seg.get("speed", 1)
        # Apply trim on each segment so the final concat has no dead time.
        # Per-segment trim for trim_start: only the first segment loses trim_start
        # at the front. trim_end: only the last segment loses trim_end at the back.
        seg_start = s + (trim_start if i == 0 else 0)
        seg_end = e - (trim_end if i == len(segments) - 1 else 0)
        if seg_end <= seg_start:
            continue
        if speed == 1:
            parts.append(f"[0:v]trim=start={seg_start}:end={seg_end},setpts=PTS-STARTPTS[v{i}]")
        else:
            parts.append(f"[0:v]trim=start={seg_start}:end={seg_end},setpts=(PTS-STARTPTS)/{speed}[v{i}]")
        output_duration += (seg_end - seg_start) / speed

    n = len(parts)
    if n == 0:
        return None, 0
    parts.append(f"{''.join(f'[v{i}]' for i in range(n))}concat=n={n}:v=1:a=0[outv]")
    return ";\n".join(parts), output_duration


def transcode_with_speed(input_path, output_path, segments, output_cfg):
    """
    Build the ffmpeg command for the final mp4 — handles speed regions,
    output size, quality, and (optionally) trim.
    """
    total_dur = get_video_duration(input_path)
    if total_dur == 0:
        print("  ERROR: could not determine input video duration")
        return False

    trim_cfg = output_cfg.get("trim", {}) or {}
    trim_start = float(trim_cfg.get("start", 0))
    trim_end = float(trim_cfg.get("end", 0))

    filtergraph, _ = build_speed_filtergraph(segments, total_dur, trim_start, trim_end)

    # Output size
    size = output_cfg.get("size", "original")
    target_size = SIZE_PRESETS.get(size)
    if target_size is None:
        # 'original' or unknown — keep recorded size
        iw, ih = get_video_size(input_path)
        target_w, target_h = iw, ih
    else:
        target_w, target_h = target_size

    # Quality
    crf = QUALITY_PRESETS.get(output_cfg.get("quality", "high"), 18)

    # If using filtergraph (any speedup or trim), include scale at the end
    if filtergraph is not None:
        # Append scale to the filtergraph
        # The current filtergraph ends with [outv]. We need to add a scale filter.
        # Replace the trailing [outv] with the scale and renames [outv]
        # Simpler: append a new chain: [outv]scale=W:H[finalv]
        filtergraph = filtergraph.replace("[outv]", f"[outv];[outv]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:color=black[finalv]")
        # Set -map for [finalv]
        map_arg = ["-map", "[finalv]"]
    else:
        # No speedup / trim. Just use the scale filter as a normal filter.
        if target_w and (target_w, target_h) != get_video_size(input_path):
            vf = f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:color=black"
        else:
            vf = None
        map_arg = []

    cmd = ["ffmpeg", "-y", "-i", str(input_path)]
    if filtergraph is not None:
        cmd += ["-filter_complex", filtergraph] + map_arg
    elif vf:
        cmd += ["-vf", vf]

    cmd += [
        "-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        "-an",
        "-movflags", "+faststart",
        str(output_path)
    ]

    # Don't dump the whole giant filtergraph unless verbose
    print(f"  ffmpeg: speed regions + trim + size={size} quality={output_cfg.get('quality', 'high')}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ERROR: {result.stderr[-1500:]}")
        return False
    return True


def transcode_to_gif(input_path, output_path, gif_cfg):
    """Generate a GIF from the (already processed) mp4."""
    fps = int(gif_cfg.get("fps", 15))
    # Default: scale to 720px wide for chat-friendly size
    width = int(gif_cfg.get("width", 720))
    # Use the palette technique for clean GIFs
    palette_path = output_path.with_suffix(".palette.png")
    try:
        # Generate palette
        r1 = subprocess.run([
            "ffmpeg", "-y", "-i", str(input_path),
            "-vf", f"fps={fps},scale={width}:-1:flags=lanczos,palettegen=stats_mode=diff",
            str(palette_path)
        ], capture_output=True, text=True)
        if r1.returncode != 0:
            print(f"  GIF palette gen failed: {r1.stderr[-500:]}")
            return False
        # Use palette
        r2 = subprocess.run([
            "ffmpeg", "-y", "-i", str(input_path), "-i", str(palette_path),
            "-lavfi", f"fps={fps},scale={width}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5",
            "-loop", "0",
            str(output_path)
        ], capture_output=True, text=True)
        if r2.returncode != 0:
            print(f"  GIF encode failed: {r2.stderr[-500:]}")
            return False
        return True
    finally:
        if palette_path.exists():
            palette_path.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("plan", type=Path, help="Path to walkthrough plan YAML")
    parser.add_argument("--out", type=Path, default=None, help="Output directory (default: <plan_stem>_rec/)")
    parser.add_argument("--keep-webm", action="store_true", help="Keep the raw .webm (default: delete after processing)")
    args = parser.parse_args()

    if not args.plan.exists():
        print(f"Plan not found: {args.plan}")
        sys.exit(1)

    with open(args.plan) as f:
        plan = yaml.safe_load(f)

    target_url = plan["target_url"].rstrip("/")
    viewport = plan.get("viewport", [1440, 900])
    viewport_dict = {"width": int(viewport[0]), "height": int(viewport[1])}
    fps = plan.get("fps", 25)
    stages = plan.get("stages", [])
    output_cfg = plan.get("output", {}) or {}

    out_dir = args.out or Path(f"/tmp/{args.plan.stem}_rec")
    out_dir.mkdir(parents=True, exist_ok=True)
    rec_dir = out_dir / "raw"
    rec_dir.mkdir(parents=True, exist_ok=True)

    # Save a copy of the plan as the "project file" alongside the recording
    project_file = out_dir / "plan.yaml"
    shutil.copy(args.plan, project_file)

    print(f"=== Walkthrough Recorder ===")
    print(f"Target: {target_url}")
    print(f"Viewport: {viewport[0]}x{viewport[1]} @ {fps}fps")
    print(f"Stages: {len(stages)}")
    print(f"Output: {out_dir}")
    print(f"Output config: format={output_cfg.get('format', 'mp4')} size={output_cfg.get('size', 'original')} quality={output_cfg.get('quality', 'high')}")
    sped_stages = [(s.get("id", "?"), s.get("speed", 1)) for s in stages if s.get("speed", 1) != 1]
    if sped_stages:
        print(f"Speed regions: {sped_stages}")
    if output_cfg.get("trim"):
        print(f"Trim: {output_cfg['trim']}")
    print()

    # Track per-stage timing for speed regions
    stage_timings = []  # list of {id, start, end, speed}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu"]
        )
        ctx = browser.new_context(
            viewport=viewport_dict,
            record_video_dir=str(rec_dir),
            record_video_size=viewport_dict,
        )
        page = ctx.new_page()

        # We need an absolute time reference. Playwright records from when the
        # context is created. We use the wall clock relative to that.
        import time as _time
        ctx_start = _time.time()

        for stage in stages:
            sid = stage.get("id", "?")
            desc = stage.get("description", "")
            speed = stage.get("speed", 1)
            print(f"  [{sid}] {desc}")

            # Pre-scroll if specified
            if "scroll_to" in stage:
                y = stage["scroll_to"]["y"]
                behavior = stage["scroll_to"].get("behavior", "smooth")
                page.evaluate(f"window.scrollTo({{top: {y}, behavior: '{behavior}'}})")
                page.wait_for_timeout(400 if behavior == "smooth" else 100)
                print(f"    → scrolled to y={y}")

            # Wait for body to have content (dApp hydration)
            for _ in range(20):
                body_len = page.evaluate("(document.body.innerText || '').length")
                if body_len > 100:
                    break
                page.wait_for_timeout(500)

            # Mark stage start (in original-video time)
            stage_start = _time.time() - ctx_start

            # Run actions
            for kind, info in run_actions(page, stage.get("actions", []), target_url):
                if kind == "warn":
                    print(f"    ⚠ {info}")
                else:
                    print(f"    {kind}: {info}")

            # Sanity check
            if "expected_visible" in stage:
                ok = check_expected(page, stage["expected_visible"])
                mark = "✓" if ok else "✗"
                print(f"    {mark} expected_visible: {stage['expected_visible']!r}")

            stage_end = _time.time() - ctx_start
            stage_timings.append({
                "id": sid,
                "start": round(stage_start, 3),
                "end": round(stage_end, 3),
                "speed": speed,
                "duration": round(stage_end - stage_start, 3),
            })
            if speed != 1:
                print(f"    ⏩ speed {speed}x: {stage_end - stage_start:.1f}s → {(stage_end - stage_start)/speed:.1f}s")

        print("\nClosing browser and finalizing recording...")
        page.close()
        ctx.close()
        browser.close()

    # Find the .webm Playwright wrote
    webms = sorted(rec_dir.glob("*.webm"), key=lambda p: p.stat().st_mtime)
    if not webms:
        print("ERROR: no .webm produced")
        sys.exit(1)
    webm = webms[-1]
    final_webm = out_dir / "walkthrough.webm"
    webm.rename(final_webm)
    for f in rec_dir.glob("*"):
        if f.is_file():
            f.unlink()
    rec_dir.rmdir()

    # Save timing data
    timeline_path = out_dir / "walkthrough.timeline.json"
    with open(timeline_path, "w") as f:
        json.dump({"stages": stage_timings, "fps": fps, "viewport": viewport}, f, indent=2)

    # Transcode to .mp4 (with speed regions, trim, size, quality)
    final_mp4 = out_dir / "walkthrough.mp4"
    fmt = output_cfg.get("format", "mp4")
    if fmt in ("mp4", "both"):
        print(f"\nTranscoding → {final_mp4.name} (speed regions + trim + size + quality)...")
        ok = transcode_with_speed(final_webm, final_mp4, stage_timings, output_cfg)
        if not ok:
            sys.exit(1)
    else:
        # 'gif' only — still need an intermediate mp4 for the GIF input
        print(f"\nTranscoding → {final_mp4.name} (intermediate for GIF)...")
        ok = transcode_with_speed(final_webm, final_mp4, stage_timings, output_cfg)
        if not ok:
            sys.exit(1)

    # Report
    r = subprocess.run(
        ["ffprobe", "-v", "error",
         "-show_entries", "format=duration,size",
         "-show_entries", "stream=codec_name,width,height,r_frame_rate",
         "-of", "json", str(final_mp4)],
        capture_output=True, text=True
    )
    info = json.loads(r.stdout)
    print(f"\n✓ Output: {final_mp4}")
    print(f"  Duration: {float(info['format']['duration']):.1f}s")
    print(f"  Size: {int(info['format']['size']) / 1024 / 1024:.2f} MB")
    for s in info.get("streams", []):
        print(f"  Stream: {s['codec_name']} {s.get('width', '')}x{s.get('height', '')} @ {s.get('r_frame_rate', '')}")

    # GIF export
    if fmt in ("gif", "both"):
        gif_path = out_dir / "walkthrough.gif"
        print(f"\nTranscoding → {gif_path.name} (GIF)...")
        gif_cfg = {**output_cfg, **output_cfg.get("gif", {})}
        if transcode_to_gif(final_mp4, gif_path, gif_cfg):
            r2 = subprocess.run(
                ["ffprobe", "-v", "error",
                 "-show_entries", "format=duration,size",
                 "-of", "json", str(gif_path)],
                capture_output=True, text=True
            )
            try:
                gi = json.loads(r2.stdout)
                print(f"  GIF Duration: {float(gi['format']['duration']):.1f}s")
                print(f"  GIF Size: {int(gi['format']['size']) / 1024 / 1024:.2f} MB")
            except Exception:
                pass
            print(f"  ✓ Output: {gif_path}")
        else:
            print(f"  ✗ GIF export failed")

    # Clean up raw webm unless --keep-webm
    if not args.keep_webm:
        final_webm.unlink()

    # Show speed summary
    raw_total = sum(s["duration"] for s in stage_timings)
    final_total = sum(s["duration"] / s["speed"] for s in stage_timings)
    if raw_total != final_total:
        print(f"\n⏩ Speed summary: {raw_total:.1f}s raw → {final_total:.1f}s final ({(1 - final_total/raw_total) * 100:.0f}% faster)")


if __name__ == "__main__":
    main()
