"""YOLOv8 object detection wrapper."""
from __future__ import annotations

import numpy as np
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ultralytics import YOLO

# Classes we care about for surveillance
SUSPICIOUS_CLASSES = {
    "person", "knife", "gun", "backpack", "car", "truck",
    "motorcycle", "bicycle", "sports ball", "bottle",
}

# Thresholds
CROWD_THRESHOLD = 5          # >= N people in frame → suspicious
CONFIDENCE_THRESHOLD = 0.4   # Minimum detection confidence
WEAPON_CLASSES = {"knife", "gun"}


class Detector:
    def __init__(self, model_path: str = "yolov8n.pt"):
        from ultralytics import YOLO  # noqa: F811
        self.model: YOLO = YOLO(model_path)
        self.model.fuse()  # Optimize for inference

    def detect(self, frame: np.ndarray) -> list[dict]:
        """Run YOLOv8 on a frame, return list of detections."""
        results = self.model(frame, verbose=False)[0]
        detections = []
        h, w = frame.shape[:2]

        for box in results.boxes:
            conf = float(box.conf[0])
            if conf < CONFIDENCE_THRESHOLD:
                continue
            cls_id = int(box.cls[0])
            cls_name = self.model.names[cls_id]
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "class": cls_name,
                "confidence": conf,
                "bbox": [
                    round(x1 / w, 4),
                    round(y1 / h, 4),
                    round((x2 - x1) / w, 4),
                    round((y2 - y1) / h, 4),
                ],
            })

        return detections

    def is_suspicious(self, detections: list[dict]) -> bool:
        """Determine if the detection set indicates suspicious activity."""
        classes = [d["class"] for d in detections]

        # Any weapon detected
        if any(c in WEAPON_CLASSES for c in classes):
            return True

        # Unusual crowd density
        person_count = classes.count("person")
        if person_count >= CROWD_THRESHOLD:
            return True

        return False


# Singleton
_detector: Detector | None = None


def get_detector() -> Detector:
    global _detector
    if _detector is None:
        _detector = Detector()
    return _detector
