#!/usr/bin/env python3
"""Append a JSON log entry to the shared watcher log file."""

import json
import os
import sys
from datetime import datetime, timezone


LOG_DIR = "/tmp/blartclaw"
LOG_FILE = os.path.join(LOG_DIR, "watcher.log")


def append(agent_id: str, entry_type: str, data_json: str) -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    try:
        data = json.loads(data_json)
    except json.JSONDecodeError:
        data = {"raw": data_json}

    entry = {
        "agentId": agent_id,
        "type": entry_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
    print(f"Logged: {entry_type} for agent {agent_id}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(
            'Usage: log_entry.py <agent_id> <type> \'{"key": "value"}\'',
            file=sys.stderr,
        )
        sys.exit(1)
    append(sys.argv[1], sys.argv[2], sys.argv[3])
