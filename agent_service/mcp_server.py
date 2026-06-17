from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any, Literal

from mcp.server.fastmcp import FastMCP

from agent_service.dashboard_client import publish_agent_message, publish_event
from agent_service.demo_data import build_demo_cameras, build_video_events
from agent_service.env_loader import load_env_file


load_env_file(Path(__file__).resolve().parents[1] / ".env.local")
mcp = FastMCP("caresight-ops-tools")


def _now_ms() -> int:
    return int(time.time() * 1000)


def _publish_tool_call(tool_name: str, agent_role: str, summary: str) -> None:
    publish_event(
        {
            "type": "mcp_tool_call",
            "toolCall": {
                "id": f"{tool_name}:{uuid.uuid4().hex[:8]}",
                "toolName": tool_name,
                "agentRole": agent_role,
                "summary": summary,
                "status": "complete",
                "timestamp": _now_ms(),
            },
        }
    )


@mcp.tool()
def publish_status(message: str) -> dict[str, Any]:
    """Send a short operations status update to the CareSight dashboard."""
    result = publish_agent_message(message)
    _publish_tool_call("publish_status", "CrewAI Agent", message)
    return result


@mcp.tool()
def deploy_cameras_to_dashboard(
    location_name: str,
    lat: float,
    lng: float,
    limit: int = 4,
) -> dict[str, Any]:
    """Deploy public/demo camera pins and video embeds for a location."""
    cameras = build_demo_cameras(location_name, lat, lng, limit)
    camera_result = publish_event({"type": "cameras_ready", "cameras": cameras})
    video_result = publish_event({"type": "videos_ready", "videos": build_video_events(cameras)})
    publish_agent_message(
        f"CrewAI MCP deployed {len(cameras)} public-safety camera feeds for {location_name}."
    )
    _publish_tool_call(
        "deploy_cameras_to_dashboard",
        "Scout",
        f"Deployed {len(cameras)} public/demo feeds for {location_name}.",
    )
    return {
        "deployed": camera_result.get("ok") and video_result.get("ok"),
        "camera_count": len(cameras),
        "cameras": cameras,
    }


@mcp.tool()
def publish_event_analysis(
    run_id: str,
    camera_id: str,
    camera_name: str,
    event_type: Literal[
        "traffic_collision",
        "smoke",
        "fire",
        "crowd_surge",
        "medical_emergency",
        "security_concern",
        "infrastructure_hazard",
        "unknown",
    ],
    severity: Literal["low", "medium", "high", "critical"],
    confidence: float,
    risk_score: int,
    evidence: list[str],
    explanation: str,
) -> dict[str, Any]:
    """Publish a structured Analyzer output for a possible event candidate."""
    analysis = {
        "id": f"{run_id}:analysis:{event_type}:{uuid.uuid4().hex[:6]}",
        "runId": run_id,
        "sourceAgent": "Analyzer",
        "cameraId": camera_id,
        "cameraName": camera_name,
        "eventType": event_type,
        "severity": severity,
        "confidence": max(0.0, min(1.0, confidence)),
        "riskScore": max(0, min(100, risk_score)),
        "evidence": evidence[:5],
        "explanation": explanation,
        "timestamp": _now_ms(),
    }
    result = publish_event({"type": "agent_analysis", "analysis": analysis})
    publish_agent_message(
        f"Analyzer classified {event_type.replace('_', ' ')} at {camera_name}: risk {analysis['riskScore']}."
    )
    _publish_tool_call(
        "publish_event_analysis",
        "Analyzer",
        f"Published {event_type.replace('_', ' ')} analysis for {camera_name}.",
    )
    return {"published": result.get("ok"), "analysis": analysis}


@mcp.tool()
def publish_safety_incident(
    camera_id: str,
    camera_name: str,
    lat: float,
    lng: float,
    severity: Literal["medium", "high", "critical"],
    description: str,
) -> dict[str, Any]:
    """Publish a human-review safety incident to the dashboard."""
    incident = {
        "id": str(uuid.uuid4()),
        "cameraId": camera_id,
        "cameraName": camera_name,
        "timestamp": int(time.time() * 1000),
        "description": description,
        "severity": severity,
        "lat": lat,
        "lng": lng,
        "detections": [],
    }
    result = publish_event({"type": "incident", "incident": incident})
    publish_agent_message(
        f"Incident queued for human review: {severity.upper()} at {camera_name}."
    )
    _publish_tool_call(
        "publish_safety_incident",
        "Analyzer",
        f"Queued {severity} incident at {camera_name} for human review.",
    )
    return {"published": result.get("ok"), "incident": incident}


@mcp.tool()
def publish_incident_response_plan(
    run_id: str,
    camera_id: str,
    camera_name: str,
    threshold: int,
    risk_score: int,
    responder_action_recommended: bool,
    incident_title: str,
    executive_summary: str,
    location: str,
    event: str,
    priority: Literal["none", "low", "medium", "high", "critical"],
    information_missing: list[str],
    recommended_action: str,
    estimated_urgency: str,
) -> dict[str, Any]:
    """Publish a threshold-based incident response plan for human operators."""
    plan = {
        "id": f"{run_id}:plan:{uuid.uuid4().hex[:8]}",
        "runId": run_id,
        "sourceAgent": "Planner",
        "cameraId": camera_id,
        "cameraName": camera_name,
        "threshold": max(0, min(100, threshold)),
        "riskScore": max(0, min(100, risk_score)),
        "responderActionRecommended": responder_action_recommended,
        "incidentTitle": incident_title,
        "executiveSummary": executive_summary,
        "location": location,
        "event": event,
        "priority": priority,
        "informationMissing": information_missing[:6],
        "recommendedAction": recommended_action,
        "estimatedUrgency": estimated_urgency,
        "timestamp": _now_ms(),
    }
    plan_result = publish_event({"type": "incident_response_plan", "plan": plan})
    summary = (
        f"Planner threshold {plan['threshold']} vs risk {plan['riskScore']}: "
        f"{'responder action recommended' if responder_action_recommended else 'no responder action recommended'}."
    )
    status_result = publish_agent_message(summary)
    handoff_result = publish_event(
        {
            "type": "agent_collaboration",
            "event": {
                "id": f"planner:{uuid.uuid4().hex[:8]}",
                "fromAgent": "Planner",
                "toAgent": "Audit",
                "action": "Threshold decision recorded",
                "message": summary,
                "status": "complete",
                "timestamp": _now_ms(),
            },
        }
    )
    _publish_tool_call("publish_incident_response_plan", "Planner", summary)
    return {
        "published": plan_result.get("ok") and status_result.get("ok") and handoff_result.get("ok"),
        "plan": plan,
    }


@mcp.tool()
def create_operations_report(location_name: str, summary: str) -> dict[str, Any]:
    """Publish a concise final operations report for the current run."""
    message = f"Operations report for {location_name}: {summary}"
    result = publish_agent_message(message)
    report_result = publish_event(
        {
            "type": "operations_report",
            "report": {
                "id": f"report:{uuid.uuid4().hex[:8]}",
                "title": f"Operations report for {location_name}",
                "summary": summary,
                "controls": [
                    "Public/demo feeds only",
                    "Human review before escalation",
                    "No identity recognition",
                    "MCP tools used for dashboard side effects",
                ],
                "timestamp": _now_ms(),
            },
        }
    )
    _publish_tool_call("create_operations_report", "Audit", message)
    return {"published": result.get("ok") and report_result.get("ok"), "summary": summary}


if __name__ == "__main__":
    mcp.run()
