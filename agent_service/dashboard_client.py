from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


def _base_url() -> str:
    return os.getenv("CARESIGHT_NEXT_BASE_URL", "http://127.0.0.1:3000").rstrip("/")


def publish_event(event: dict[str, Any]) -> dict[str, Any]:
    """Publish a dashboard event through the Next.js event-bus bridge."""
    url = f"{_base_url()}/api/surveillance/publish"
    payload = json.dumps(event).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    publish_token = os.getenv("CARESIGHT_PUBLISH_TOKEN")
    if publish_token:
        headers["x-caresight-publish-token"] = publish_token

    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8")
            return {
                "ok": 200 <= response.status < 300,
                "status": response.status,
                "body": body,
            }
    except urllib.error.HTTPError as exc:
        return {"ok": False, "status": exc.code, "body": exc.read().decode("utf-8")}
    except Exception as exc:  # pragma: no cover - defensive for live demo service
        return {"ok": False, "status": 0, "body": str(exc)}


def publish_agent_message(message: str) -> dict[str, Any]:
    return publish_event({"type": "agent_message", "message": message})

