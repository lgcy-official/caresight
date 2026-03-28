#!/usr/bin/env python3
"""Capture a single frame from an HLS stream using ffmpeg."""

import os
import subprocess
import sys


def capture(stream_url: str, agent_id: str) -> str:
    frames_dir = "/tmp/blartclaw/frames"
    os.makedirs(frames_dir, exist_ok=True)
    out_path = os.path.join(frames_dir, f"{agent_id}.jpg")

    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i", stream_url,
            "-frames:v", "1",
            "-q:v", "5",
            out_path,
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        print(f"Error: {result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    print(out_path)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: capture_frame.py <stream_url> <agent_id>", file=sys.stderr)
        sys.exit(1)
    capture(sys.argv[1], sys.argv[2])
