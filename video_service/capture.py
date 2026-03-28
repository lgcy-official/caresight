"""VidGear CamGear stream capture manager."""
from __future__ import annotations

import asyncio
import base64
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np


@dataclass
class CaptureSession:
    capture_id: str
    stream_url: str
    thread: Optional[threading.Thread] = None
    running: bool = False

    # Latest frame state
    latest_frame: Optional[np.ndarray] = None
    latest_detections: list[dict] = field(default_factory=list)
    latest_timestamp: float = 0.0
    is_suspicious: bool = False

    # Queue of flagged frames for the sub-agent to consume
    flagged_queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    lock: threading.Lock = field(default_factory=threading.Lock)


class CaptureManager:
    def __init__(self):
        self._sessions: dict[str, CaptureSession] = {}
        self._lock = threading.Lock()

    def start_capture(self, stream_url: str) -> str:
        """Start capturing a stream. Returns the capture_id."""
        from vidgear.gears import CamGear  # type: ignore
        from .detector import get_detector

        capture_id = str(uuid.uuid4())[:8]
        session = CaptureSession(capture_id=capture_id, stream_url=stream_url)

        def run():
            options = {"STREAM_RESOLUTION": "360p", "CAP_PROP_FPS": 10}
            cam = CamGear(source=stream_url, stream_mode=True, logging=False, **options).start()
            detector = get_detector()
            session.running = True

            try:
                while session.running:
                    frame = cam.read()
                    if frame is None:
                        time.sleep(0.1)
                        continue

                    detections = detector.detect(frame)
                    suspicious = detector.is_suspicious(detections)

                    with session.lock:
                        session.latest_frame = frame.copy()
                        session.latest_detections = detections
                        session.latest_timestamp = time.time()
                        session.is_suspicious = suspicious

                    if suspicious:
                        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
                        frame_b64 = base64.b64encode(buf).decode()
                        flagged = {
                            "frame_b64": frame_b64,
                            "timestamp": session.latest_timestamp,
                            "detections": detections,
                            "is_suspicious": True,
                        }
                        # Put in queue (don't block — drop if full)
                        try:
                            session.flagged_queue.put_nowait(flagged)
                        except asyncio.QueueFull:
                            pass
            finally:
                cam.stop()

        session.thread = threading.Thread(target=run, daemon=True)

        with self._lock:
            self._sessions[capture_id] = session

        session.thread.start()
        return capture_id

    def stop_capture(self, capture_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(capture_id, None)
        if session:
            session.running = False

    def get_latest_frame(self, capture_id: str) -> Optional[dict]:
        session = self._sessions.get(capture_id)
        if not session:
            return None
        with session.lock:
            if session.latest_frame is None:
                return None
            _, buf = cv2.imencode(".jpg", session.latest_frame, [cv2.IMWRITE_JPEG_QUALITY, 60])
            frame_b64 = base64.b64encode(buf).decode()
            return {
                "frame_b64": frame_b64,
                "timestamp": session.latest_timestamp,
                "detections": session.latest_detections,
                "is_suspicious": session.is_suspicious,
            }

    def get_detections(self, capture_id: str) -> list[dict]:
        session = self._sessions.get(capture_id)
        if not session:
            return []
        with session.lock:
            return session.latest_detections.copy()

    async def get_next_flagged(self, capture_id: str, timeout: float = 8.0) -> Optional[dict]:
        """Async: wait for next YOLO-flagged frame, or return None on timeout."""
        session = self._sessions.get(capture_id)
        if not session:
            return None
        try:
            return await asyncio.wait_for(session.flagged_queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None


# Singleton
_manager: CaptureManager | None = None


def get_manager() -> CaptureManager:
    global _manager
    if _manager is None:
        _manager = CaptureManager()
    return _manager
