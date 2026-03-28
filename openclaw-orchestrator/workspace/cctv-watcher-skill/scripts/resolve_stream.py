#!/usr/bin/env python3
"""Resolve a webcam page URL to a direct HLS stream URL using yt-dlp."""

import subprocess
import sys


def resolve(page_url: str) -> str:
    result = subprocess.run(
        ["yt-dlp", "-g", "--format", "best", page_url],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Error: {result.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: resolve_stream.py <page_url>", file=sys.stderr)
        sys.exit(1)
    print(resolve(sys.argv[1]))
