from pydantic import BaseModel
from typing import Optional


class CaptureRequest(BaseModel):
    stream_url: str


class StopRequest(BaseModel):
    capture_id: str


class Detection(BaseModel):
    class_name: str = ""
    confidence: float = 0.0
    bbox: list[float] = []  # [x, y, w, h] normalized

    class Config:
        populate_by_name = True

    def model_dump(self, **kwargs):
        d = super().model_dump(**kwargs)
        # Rename class_name → class for JSON output
        d["class"] = d.pop("class_name")
        return d


class FrameResponse(BaseModel):
    frame_b64: str
    timestamp: float
    detections: list[Detection]
    is_suspicious: bool


class CaptureStartResponse(BaseModel):
    capture_id: str
