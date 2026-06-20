#!/usr/bin/env python3
"""Standalone transcoder: apply per-stage speed regions + trim + scale to a raw .webm recording."""
import json, subprocess, sys
from pathlib import Path

WEBM = Path('/root/pyre/walkthrough/out/walkthrough.webm')
MP4 = Path('/root/pyre/walkthrough/out/walkthrough.mp4')
TIMELINE = Path('/root/pyre/walkthrough/out/walkthrough.timeline.json')
PLAN = Path('/root/pyre/walkthrough/plan.yaml')

import yaml
plan = yaml.safe_load(PLAN.read_text())
timeline = json.loads(TIMELINE.read_text())
stages = timeline['stages']

output_cfg = plan.get('output', {}) or {}
trim = output_cfg.get('trim', {}) or {}
trim_start = float(trim.get('start', 0))
trim_end = float(trim.get('end', 0))

# Build filtergraph: per-stage trim + setpts speedup, then concat, then scale.
# Segments that have speed=1 use setpts=PTS-STARTPTS (passthrough).
# Segments with speed=N use setpts=(PTS-STARTPTS)/N.
parts = []
for i, seg in enumerate(stages):
    s, e = seg['start'], seg['end']
    speed = seg['speed']
    # Apply trim_start to first segment, trim_end to last
    seg_start = s + (trim_start if i == 0 else 0)
    seg_end = e - (trim_end if i == len(stages) - 1 else 0)
    if seg_end <= seg_start:
        continue
    if speed == 1:
        parts.append(f"[0:v]trim=start={seg_start}:end={seg_end},setpts=PTS-STARTPTS[v{i}]")
    else:
        parts.append(f"[0:v]trim=start={seg_start}:end={seg_end},setpts=(PTS-STARTPTS)/{speed}[v{i}]")

n = len(parts)
if n == 0:
    print("ERROR: no segments after trim")
    sys.exit(1)

concat_in = ''.join(f'[v{i}]' for i in range(n))
# Final scale to 1080p with letterbox
size = output_cfg.get('size', '1080p')
target = (1920, 1080) if size == '1080p' else None
if target:
    scale_chain = f"[outv]scale={target[0]}:{target[1]}:force_original_aspect_ratio=decrease,pad={target[0]}:{target[1]}:(ow-iw)/2:(oh-ih)/2:color=black[finalv]"
    # Concatenate everything into one filter chain using commas (not semicolons)
    parts.append(f"{concat_in}concat=n={n}:v=1:a=0[outv]")
    parts.append(scale_chain)
    map_arg = ['-map', '[finalv]']
else:
    parts.append(f"{concat_in}concat=n={n}:v=1:a=0[outv]")
    map_arg = ['-map', '[outv]']

# Use single semicolons between filter chains (not double)
filtergraph = ';'.join(parts)

crf = {'high': 18, 'medium': 23, 'low': 28}.get(output_cfg.get('quality', 'high'), 18)

cmd = ['ffmpeg', '-y', '-i', str(WEBM),
       '-filter_complex', filtergraph] + map_arg + [
       '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf),
       '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart',
       str(MP4)]

print(f"Transcoding with {n} segments...")
print(f"Filtergraph has {filtergraph.count(';') + 1} parts")
print(f"Output: {MP4}")
result = subprocess.run(cmd, capture_output=True, text=True)
if result.returncode != 0:
    print(f"FFMPEG FAILED:")
    print(result.stderr[-2000:])
    sys.exit(1)

# Verify
r = subprocess.run(['ffprobe', '-v', 'error',
                    '-show_entries', 'format=duration,size',
                    '-show_entries', 'stream=codec_name,width,height,r_frame_rate',
                    '-of', 'json', str(MP4)], capture_output=True, text=True)
info = json.loads(r.stdout)
print(f"\n✓ {MP4}")
print(f"  Duration: {float(info['format']['duration']):.2f}s")
print(f"  Size: {int(info['format']['size']) / 1024 / 1024:.2f} MB")
for s in info.get('streams', []):
    print(f"  Stream: {s['codec_name']} {s['width']}x{s['height']} @ {s['r_frame_rate']}")