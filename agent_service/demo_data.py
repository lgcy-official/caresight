from __future__ import annotations

import math
from hashlib import sha1
from typing import Any


DEMO_STREAMS = [
    {
        "id": "care-pier-23",
        "name": "Pier 23 Public Waterfront Camera",
        "address": "Pier 23, San Francisco, CA",
        "streamUrl": "https://www.youtube.com/watch?v=a5IW4I-z2rs",
        "lat": 37.8030,
        "lng": -122.4000,
        "riskLevel": "medium",
        "crimeTypes": ["crowd safety", "waterfront operations"],
    },
    {
        "id": "care-castro-1",
        "name": "Castro Street Public Camera",
        "address": "Castro Street, San Francisco, CA",
        "lat": 37.7609,
        "lng": -122.4350,
        "riskLevel": "medium",
        "crimeTypes": ["pedestrian safety", "public event monitoring"],
    },
    {
        "id": "care-sfo-airport",
        "name": "SFO Operations Camera",
        "address": "San Francisco International Airport, CA",
        "lat": 37.6213,
        "lng": -122.3790,
        "riskLevel": "high",
        "crimeTypes": ["traffic safety", "operations disruption"],
    },
    {
        "id": "care-academy",
        "name": "Golden Gate Park Public Venue Camera",
        "address": "California Academy of Sciences, San Francisco, CA",
        "lat": 37.7699,
        "lng": -122.4661,
        "riskLevel": "medium",
        "crimeTypes": ["venue safety", "crowd flow"],
    },
]


def _youtube_id(url: str) -> str:
    if "watch?v=" in url:
        return url.split("watch?v=", 1)[1].split("&", 1)[0]
    if "youtu.be/" in url:
        return url.split("youtu.be/", 1)[1].split("?", 1)[0]
    return url.rsplit("/", 1)[-1]


def build_demo_cameras(
    location_name: str,
    lat: float,
    lng: float,
    limit: int = 4,
) -> list[dict[str, Any]]:
    """Return deterministic demo cameras, shifted near the requested location."""
    selected = DEMO_STREAMS[: max(1, min(limit, len(DEMO_STREAMS)))]
    near_sf = abs(lat - 37.7749) < 0.75 and abs(lng + 122.4194) < 0.75
    if near_sf:
        return [dict(camera) for camera in selected]

    cameras: list[dict[str, Any]] = []
    radius = 0.018
    location_slug = sha1(location_name.encode("utf-8")).hexdigest()[:8]
    for index, camera in enumerate(selected):
        angle = (2 * math.pi * index) / len(selected)
        shifted = dict(camera)
        shifted["id"] = f"{camera['id']}-{location_slug}"
        shifted["name"] = camera["name"].replace("San Francisco", location_name)
        shifted["address"] = f"{location_name} operations zone {index + 1}"
        shifted["lat"] = lat + radius * math.cos(angle)
        shifted["lng"] = lng + radius * math.sin(angle)
        cameras.append(shifted)
    return cameras


def build_video_events(cameras: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {
            "cameraId": str(camera["id"]),
            "youtubeUrl": str(camera["streamUrl"]),
            "youtubeVideoId": _youtube_id(str(camera["streamUrl"])),
            "title": str(camera["name"]),
        }
        for camera in cameras
        if camera.get("streamUrl")
    ]
