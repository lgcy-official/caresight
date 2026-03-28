"""FastAPI video processing service."""
import asyncio
import json
import os
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .capture import get_manager
from .models import CaptureRequest, CaptureStartResponse, StopRequest


def _allowed_origins() -> list[str]:
    raw = os.getenv(
        "PYTHON_SERVICE_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]

app = FastAPI(title="CareSight AI Video Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/capture/start", response_model=CaptureStartResponse)
def start_capture(req: CaptureRequest):
    try:
        mgr = get_manager()
        capture_id = mgr.start_capture(req.stream_url)
        return CaptureStartResponse(capture_id=capture_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/capture/stop")
def stop_capture(req: StopRequest):
    get_manager().stop_capture(req.capture_id)
    return {"stopped": True}


@app.get("/capture/{capture_id}/frame")
def get_frame(capture_id: str):
    data = get_manager().get_latest_frame(capture_id)
    if data is None:
        raise HTTPException(status_code=404, detail="No frame available")
    return data


@app.get("/capture/{capture_id}/detections")
def get_detections(capture_id: str):
    detections = get_manager().get_detections(capture_id)
    return {"detections": detections}


@app.get("/capture/{capture_id}/next-flag")
async def get_next_flag(capture_id: str, timeout: float = 8.0):
    """Long-poll: returns next YOLO-flagged frame, or 204 on timeout."""
    data = await get_manager().get_next_flagged(capture_id, timeout=timeout)
    if data is None:
        from fastapi.responses import Response
        return Response(status_code=204)
    return data


@app.get("/capture/{capture_id}/stream")
async def stream_detections(capture_id: str):
    """SSE stream of flagged detection events."""

    async def event_generator() -> AsyncGenerator[str, None]:
        mgr = get_manager()
        while True:
            data = await mgr.get_next_flagged(capture_id, timeout=30.0)
            if data is not None:
                yield f"data: {json.dumps(data)}\n\n"
            else:
                yield ": keepalive\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
