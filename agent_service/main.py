from __future__ import annotations

import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

try:
    from crewai import Agent, Crew, LLM, Task
except Exception as exc:  # pragma: no cover - local demo fallback
    Agent = Crew = LLM = Task = None  # type: ignore[assignment]
    CREWAI_IMPORT_ERROR: Exception | None = exc
else:
    CREWAI_IMPORT_ERROR = None

from agent_service.dashboard_client import publish_agent_message, publish_event
from agent_service.demo_data import build_demo_cameras, build_video_events
from agent_service.env_loader import load_env_file


REPO_ROOT = Path(__file__).resolve().parents[1]
load_env_file(REPO_ROOT / ".env.local")


class Location(BaseModel):
    name: str
    lat: float
    lng: float


class RunRequest(BaseModel):
    prompt: str
    location: Location | None = None


app = FastAPI(title="CareSight CrewAI Orchestrator")

AGENT_BLUEPRINTS = [
    {
        "id": "scout",
        "role": "Scout",
        "goal": "Find and deploy public or demo camera feeds for the requested area.",
    },
    {
        "id": "analyzer",
        "role": "Analyzer",
        "goal": "Classify likely visible safety events with severity, confidence, evidence, explanation, and risk score.",
    },
    {
        "id": "planner",
        "role": "Planner",
        "goal": "Apply the responder threshold and create an incident response plan only when risk is high enough.",
    },
    {
        "id": "audit",
        "role": "Audit",
        "goal": "Record model routing, MCP tool usage, traceability, and safety constraints.",
    },
]

RESPONDER_ACTION_THRESHOLD = 70


def _now_ms() -> int:
    return int(time.time() * 1000)


def _publish_task(
    run_id: str,
    owner: str,
    title: str,
    detail: str,
    status: str,
) -> None:
    publish_event(
        {
            "type": "agent_task",
            "task": {
                "id": f"{run_id}:{owner.lower()}:{title.lower().replace(' ', '-')}",
                "owner": owner,
                "title": title,
                "detail": detail,
                "status": status,
                "timestamp": _now_ms(),
            },
        }
    )


def _publish_handoff(
    run_id: str,
    from_agent: str,
    to_agent: str,
    action: str,
    message: str,
    status: str = "complete",
) -> None:
    publish_event(
        {
            "type": "agent_collaboration",
            "event": {
                "id": f"{run_id}:{from_agent.lower()}:{to_agent.lower()}:{uuid.uuid4().hex[:6]}",
                "fromAgent": from_agent,
                "toAgent": to_agent,
                "action": action,
                "message": message,
                "status": status,
                "timestamp": _now_ms(),
            },
        }
    )


def _publish_operations_report(run_id: str, title: str, summary: str) -> None:
    publish_event(
        {
            "type": "operations_report",
            "report": {
                "id": f"{run_id}:operations-report",
                "title": title,
                "summary": summary,
                "controls": [
                    "Public/demo feeds only",
                    "Human review before escalation",
                    "No identity recognition",
                    "TrueFoundry gateway metadata attached",
                    "MCP dashboard tools used for side effects",
                ],
                "timestamp": _now_ms(),
            },
        }
    )


def _publish_integration_status(run_id: str, runtime: str) -> None:
    publish_event(
        {
            "type": "integration_status",
            "proof": {
                "runId": run_id,
                "orchestrator": "CrewAI",
                "runtime": runtime,
                "gatewayBaseUrl": os.getenv(
                    "TRUEFOUNDRY_GATEWAY_BASE_URL",
                    "https://gateway.truefoundry.ai",
                ),
                "model": os.getenv("TRUEFOUNDRY_MODEL", "openai/openai/gpt-5.5"),
                "tracingProject": os.getenv("TRUEFOUNDRY_TRACING_PROJECT", "caresight"),
                "tracingEnabled": bool(os.getenv("TRUEFOUNDRY_TRACING_ENDPOINT")),
                "mcpServer": "caresight-ops-tools",
                "agents": [
                    {
                        "id": agent["id"],
                        "role": agent["role"],
                        "goal": agent["goal"],
                        "status": "running" if runtime == "crewai" else "pending",
                    }
                    for agent in AGENT_BLUEPRINTS
                ],
                "mcpTools": [
                    "deploy_cameras_to_dashboard",
                    "publish_event_analysis",
                    "publish_safety_incident",
                    "publish_incident_response_plan",
                    "create_operations_report",
                ],
                "governanceNotes": [
                    "Crew-level task context is passed between specialist agents.",
                    "Dashboard mutations happen through MCP tools, not direct UI state edits.",
                    "TrueFoundry model and gateway settings are loaded from environment.",
                ],
                "timestamp": _now_ms(),
            },
        }
    )


def _format_event_type(event_type: str) -> str:
    return " ".join(part.capitalize() for part in event_type.split("_"))


def _camera_location(camera: dict[str, Any]) -> str:
    address = camera.get("address") or camera.get("name") or "Unknown location"
    return f"{address} ({camera.get('lat')}, {camera.get('lng')})"


def _publish_analysis(run_id: str, analysis: dict[str, Any]) -> None:
    publish_event({"type": "agent_analysis", "analysis": analysis})
    publish_event(
        {
            "type": "mcp_tool_call",
            "toolCall": {
                "id": f"{run_id}:publish-analysis:{analysis['eventType']}",
                "toolName": "publish_event_analysis",
                "agentRole": "Analyzer",
                "summary": (
                    f"{_format_event_type(str(analysis['eventType']))} at "
                    f"{analysis['cameraName']} scored {analysis['riskScore']}."
                ),
                "status": "complete",
                "timestamp": _now_ms(),
            },
        }
    )


def _build_demo_analyses(run_id: str, cameras: list[dict[str, Any]]) -> list[dict[str, Any]]:
    traffic_camera = next(
        (camera for camera in cameras if "traffic" in " ".join(camera.get("crimeTypes", [])).lower()),
        cameras[0],
    )
    smoke_camera = cameras[0 if len(cameras) == 1 else 1]
    fire_camera = cameras[-1]
    now = _now_ms()
    return [
        {
            "id": f"{run_id}:analysis:traffic-collision",
            "runId": run_id,
            "sourceAgent": "Analyzer",
            "cameraId": traffic_camera["id"],
            "cameraName": traffic_camera["name"],
            "eventType": "traffic_collision",
            "severity": "high",
            "confidence": 0.86,
            "riskScore": 84,
            "evidence": [
                "Scout feed tagged traffic safety",
                "Possible obstruction pattern",
                "Operations route impact",
            ],
            "explanation": (
                "Analyzer classifies a likely traffic collision or lane obstruction candidate. "
                "This is an operational risk signal and still requires human visual confirmation."
            ),
            "timestamp": now,
        },
        {
            "id": f"{run_id}:analysis:smoke",
            "runId": run_id,
            "sourceAgent": "Analyzer",
            "cameraId": smoke_camera["id"],
            "cameraName": smoke_camera["name"],
            "eventType": "smoke",
            "severity": "medium",
            "confidence": 0.64,
            "riskScore": 58,
            "evidence": [
                "Light haze candidate",
                "No flame confirmation",
                "Visibility needs verification",
            ],
            "explanation": (
                "Analyzer found a smoke-like candidate but confidence and risk remain below "
                "the responder threshold. A human operator should verify before escalation."
            ),
            "timestamp": now + 1,
        },
        {
            "id": f"{run_id}:analysis:fire",
            "runId": run_id,
            "sourceAgent": "Analyzer",
            "cameraId": fire_camera["id"],
            "cameraName": fire_camera["name"],
            "eventType": "fire",
            "severity": "high",
            "confidence": 0.48,
            "riskScore": 66,
            "evidence": [
                "Warm color anomaly candidate",
                "No sustained flame evidence",
                "Occlusion limits certainty",
            ],
            "explanation": (
                "Analyzer marks fire as a lower-confidence candidate. Risk is elevated enough "
                "for monitoring, but below the threshold for responder action."
            ),
            "timestamp": now + 2,
        },
    ]


def _priority_for_score(risk_score: int) -> str:
    if risk_score >= 90:
        return "critical"
    if risk_score >= RESPONDER_ACTION_THRESHOLD:
        return "high"
    if risk_score >= 50:
        return "medium"
    return "low"


def _build_response_plan(
    run_id: str,
    analysis: dict[str, Any],
    camera: dict[str, Any],
    threshold: int = RESPONDER_ACTION_THRESHOLD,
) -> dict[str, Any]:
    risk_score = int(analysis["riskScore"])
    event_label = _format_event_type(str(analysis["eventType"]))
    recommended = risk_score >= threshold
    priority = _priority_for_score(risk_score) if recommended else "none"
    if not recommended:
        return {
            "id": f"{run_id}:plan:{analysis['eventType']}",
            "runId": run_id,
            "sourceAgent": "Planner",
            "cameraId": analysis["cameraId"],
            "cameraName": analysis["cameraName"],
            "threshold": threshold,
            "riskScore": risk_score,
            "responderActionRecommended": False,
            "incidentTitle": "No responder action recommended",
            "executiveSummary": (
                f"{event_label} candidate scored {risk_score}, below the responder threshold of {threshold}."
            ),
            "location": _camera_location(camera),
            "event": event_label,
            "priority": "none",
            "informationMissing": [
                "Human visual confirmation",
                "Whether condition is persistent",
                "Exact impact area",
            ],
            "recommendedAction": "Continue monitoring and ask an operator to verify before escalation.",
            "estimatedUrgency": "Monitor only",
            "timestamp": _now_ms(),
        }

    return {
        "id": f"{run_id}:plan:{analysis['eventType']}",
        "runId": run_id,
        "sourceAgent": "Planner",
        "cameraId": analysis["cameraId"],
        "cameraName": analysis["cameraName"],
        "threshold": threshold,
        "riskScore": risk_score,
        "responderActionRecommended": True,
        "incidentTitle": f"Possible {event_label} at {analysis['cameraName']}",
        "executiveSummary": (
            f"Analyzer risk score {risk_score} exceeded the responder threshold of {threshold}. "
            "Planner recommends human verification and a responder-ready escalation path."
        ),
        "location": _camera_location(camera),
        "event": event_label,
        "priority": priority,
        "informationMissing": [
            "Exact number of affected vehicles or people",
            "Whether emergency services are already on scene",
            "Current lane, access, or evacuation impact",
        ],
        "recommendedAction": (
            "Open the live feed, verify the obstruction or hazard, notify operations lead, "
            "and prepare responder dispatch if confirmed."
        ),
        "estimatedUrgency": "Immediate operator review, responder decision within 2 minutes",
        "timestamp": _now_ms(),
    }


def _publish_response_plan(run_id: str, plan: dict[str, Any]) -> None:
    publish_event({"type": "incident_response_plan", "plan": plan})
    publish_event(
        {
            "type": "mcp_tool_call",
            "toolCall": {
                "id": f"{run_id}:publish-response-plan",
                "toolName": "publish_incident_response_plan",
                "agentRole": "Planner",
                "summary": (
                    f"Planner threshold {plan['threshold']} compared against risk {plan['riskScore']}: "
                    f"{'action recommended' if plan['responderActionRecommended'] else 'no responder action'}."
                ),
                "status": "complete",
                "timestamp": _now_ms(),
            },
        }
    )


def _init_tracing() -> None:
    endpoint = os.getenv("TRUEFOUNDRY_TRACING_ENDPOINT")
    token = os.getenv("TRUEFOUNDRY_PAT_TOKEN")
    project = os.getenv("TRUEFOUNDRY_TRACING_PROJECT", "caresight")
    if not endpoint or not token:
        return

    try:
        from traceloop.sdk import Traceloop

        Traceloop.init(
            api_endpoint=endpoint,
            headers={
                "Authorization": f"Bearer {token}",
                "TFY-Tracing-Project": project,
            },
        )
    except Exception as exc:  # pragma: no cover - tracing should not break demos
        print(f"[agent_service] Traceloop init skipped: {exc}", file=sys.stderr)


def _truefoundry_llm() -> LLM:
    if LLM is None:
        raise RuntimeError(f"CrewAI is unavailable: {CREWAI_IMPORT_ERROR}")

    api_key = os.getenv("TRUEFOUNDRY_API_KEY")
    if not api_key:
        raise RuntimeError("TRUEFOUNDRY_API_KEY is required for CrewAI TrueFoundry routing")

    return LLM(
        model=os.getenv("TRUEFOUNDRY_MODEL", "openai/openai/gpt-5.5"),
        base_url=os.getenv("TRUEFOUNDRY_GATEWAY_BASE_URL", "https://gateway.truefoundry.ai"),
        api_key=api_key,
        stream=True,
        extra_headers={
            "X-TFY-METADATA": os.getenv("TRUEFOUNDRY_METADATA", "{}"),
            "X-TFY-LOGGING-CONFIG": os.getenv(
                "TRUEFOUNDRY_LOGGING_CONFIG",
                '{"enabled": true}',
            ),
        },
    )


def _mcp_server() -> Any:
    from crewai.mcp import MCPServerStdio

    child_env = dict(os.environ)
    child_env["PYTHONPATH"] = str(REPO_ROOT)
    child_env.setdefault("CARESIGHT_NEXT_BASE_URL", "http://127.0.0.1:3000")

    return MCPServerStdio(
        command=sys.executable,
        args=["-m", "agent_service.mcp_server"],
        env=child_env,
        cache_tools_list=True,
    )


def _run_crew(request: RunRequest) -> str:
    run_id = uuid.uuid4().hex[:10]
    if CREWAI_IMPORT_ERROR is not None:
        return _run_demo_fallback(request, run_id)

    location = request.location or Location(name="San Francisco, CA", lat=37.7749, lng=-122.4194)
    llm = _truefoundry_llm()
    _publish_integration_status(run_id, "crewai")
    _publish_task(
        run_id,
        "Scout",
        "Deploy feeds",
        f"Use MCP tools to place public/demo feeds around {location.name}.",
        "running",
    )

    discovery_agent = Agent(
        role="Scout - Public Safety Feed Discovery Agent",
        goal="Deploy relevant public/demo camera feeds onto the CareSight operations map.",
        backstory=(
            "You are an operations analyst. You only use public or demo feeds, "
            "avoid identity claims, and keep humans in the review loop."
        ),
        llm=llm,
        mcps=[_mcp_server()],
        verbose=True,
    )

    analyzer_agent = Agent(
        role="Analyzer - Event Classification Agent",
        goal="Classify likely safety events with severity, confidence, evidence, explanation, and risk score.",
        backstory=(
            "You are careful and conservative. You classify visible operational candidates "
            "such as traffic collision, smoke, fire, crowd surge, medical emergency, or "
            "infrastructure hazard. You do not identify people or assert unsupported crime."
        ),
        llm=llm,
        mcps=[_mcp_server()],
        verbose=True,
    )

    planner_agent = Agent(
        role="Planner - Incident Response Planner Agent",
        goal="Compare Analyzer risk score to the responder threshold and create a structured incident response plan.",
        backstory=(
            "You are an incident response planner. If risk is below threshold, you recommend no "
            "responder action. If risk meets or exceeds threshold, you produce a concise "
            "responder-ready plan with missing information and urgency."
        ),
        llm=llm,
        mcps=[_mcp_server()],
        verbose=True,
    )

    governance_agent = Agent(
        role="Audit - Governance and Observability Agent",
        goal="Summarize the workflow with production controls, auditability, and escalation limits.",
        backstory=(
            "You explain what happened in production terms: tools called, human review, "
            "logging, model routing, and safe deployment constraints."
        ),
        llm=llm,
        mcps=[_mcp_server()],
        verbose=True,
    )

    discovery_task = Task(
        description=(
            f"User request: {request.prompt}\n\n"
            f"Use the MCP tool deploy_cameras_to_dashboard for {location.name} at "
            f"lat={location.lat}, lng={location.lng}. Deploy 4 feeds. "
            "Then return the deployed camera IDs and names."
        ),
        expected_output="A list of deployed camera IDs, names, and risk levels.",
        agent=discovery_agent,
    )

    analyzer_task = Task(
        description=(
            "Using the camera list from the discovery task, identify possible visible events "
            "including traffic_collision, smoke, fire, crowd_surge, medical_emergency, "
            "security_concern, infrastructure_hazard, or unknown. For each important "
            "candidate call publish_event_analysis with event type, severity, confidence, "
            "evidence, explanation, and risk_score from 0 to 100. Then publish exactly one "
            "human-review safety incident with publish_safety_incident for the highest-risk "
            "candidate. Avoid identity recognition or definitive criminal accusations."
        ),
        expected_output=(
            "Structured event analysis outputs plus the published incident ID for the "
            "highest-risk candidate."
        ),
        agent=analyzer_agent,
        context=[discovery_task],
    )

    planner_task = Task(
        description=(
            f"Using the highest-risk Analyzer output, apply responder threshold "
            f"{RESPONDER_ACTION_THRESHOLD}. If risk_score is below threshold, call "
            "publish_incident_response_plan with responder_action_recommended=false and "
            "recommended_action='No responder action recommended'. Otherwise call "
            "publish_incident_response_plan with incident title, executive summary, location, "
            "event, priority, information missing, recommended action, and estimated urgency."
        ),
        expected_output="A threshold-based response plan or a no-action recommendation.",
        agent=planner_agent,
        context=[discovery_task, analyzer_task],
    )

    governance_task = Task(
        description=(
            f"Use create_operations_report for {location.name}. Summarize how CareSight "
            "used CrewAI agents, MCP dashboard tools, TrueFoundry-routed model calls, "
            "logging, and human-review safety constraints."
        ),
        expected_output="A concise production-readiness report for the dashboard.",
        agent=governance_agent,
        context=[discovery_task, analyzer_task, planner_task],
    )

    publish_agent_message("CrewAI orchestration started through TrueFoundry AI Gateway.")
    crew = Crew(
        agents=[discovery_agent, analyzer_agent, planner_agent, governance_agent],
        tasks=[discovery_task, analyzer_task, planner_task, governance_task],
        verbose=True,
    )
    result = crew.kickoff()
    _publish_task(
        run_id,
        "Audit",
        "Close run",
        "CrewAI completed the multi-agent workflow and emitted the final operations report.",
        "complete",
    )
    return str(result)


def _run_demo_fallback(request: RunRequest, run_id: str) -> str:
    location = request.location or Location(name="San Francisco, CA", lat=37.7749, lng=-122.4194)
    _publish_integration_status(run_id, "local-fallback")
    publish_agent_message(
        "Crew run started: Scout, Analyzer, Planner, and Audit are coordinating the operation."
    )
    _publish_task(
        run_id,
        "Scout",
        "Deploy feeds",
        f"Find public/demo feeds around {location.name} and place them on the map.",
        "running",
    )

    cameras = build_demo_cameras(location.name, location.lat, location.lng, 4)
    publish_event({"type": "cameras_ready", "cameras": cameras})
    publish_event({"type": "videos_ready", "videos": build_video_events(cameras)})
    publish_event(
        {
            "type": "mcp_tool_call",
            "toolCall": {
                "id": f"{run_id}:deploy-cameras",
                "toolName": "deploy_cameras_to_dashboard",
                "agentRole": "Scout",
                "summary": f"Deployed {len(cameras)} camera feeds near {location.name}.",
                "status": "complete",
                "timestamp": _now_ms(),
            },
        }
    )
    _publish_task(
        run_id,
        "Scout",
        "Deploy feeds",
        f"Placed {len(cameras)} feeds and published video embeds for {location.name}.",
        "complete",
    )
    _publish_handoff(
        run_id,
        "Scout",
        "Analyzer",
        "Feeds ready for event classification",
        f"{len(cameras)} feeds are available. Classify possible events and score operational risk.",
    )
    _publish_task(
        run_id,
        "Analyzer",
        "Classify events",
        "Return event type, severity, confidence, evidence, explanation, and risk score.",
        "running",
    )

    analyses = _build_demo_analyses(run_id, cameras)
    for analysis in analyses:
        _publish_analysis(run_id, analysis)

    top_analysis = max(analyses, key=lambda item: int(item["riskScore"]))
    incident_camera = next(
        (camera for camera in cameras if camera.get("id") == top_analysis["cameraId"]),
        cameras[0],
    )
    incident_description = (
        f"Analyzer classified possible {_format_event_type(str(top_analysis['eventType']))} "
        f"with {round(float(top_analysis['confidence']) * 100)}% confidence and risk score "
        f"{top_analysis['riskScore']}. Queued for human review; no identity recognition or "
        "definitive criminal conclusion is asserted."
    )
    publish_event(
        {
            "type": "incident",
            "incident": {
                "id": str(uuid.uuid4()),
                "cameraId": incident_camera["id"],
                "cameraName": incident_camera["name"],
                "timestamp": int(time.time() * 1000),
                "description": incident_description,
                "severity": top_analysis["severity"],
                "lat": incident_camera["lat"],
                "lng": incident_camera["lng"],
                "detections": [
                    {
                        "class": top_analysis["eventType"],
                        "confidence": top_analysis["confidence"],
                        "bbox": [0, 0, 0, 0],
                    }
                ],
            },
        }
    )
    publish_event(
        {
            "type": "mcp_tool_call",
            "toolCall": {
                "id": f"{run_id}:publish-incident",
                "toolName": "publish_safety_incident",
                "agentRole": "Analyzer",
                "summary": (
                    f"Queued {_format_event_type(str(top_analysis['eventType']))} incident "
                    f"at {incident_camera['name']} for human review."
                ),
                "status": "complete",
                "timestamp": _now_ms(),
            },
        }
    )
    _publish_task(
        run_id,
        "Analyzer",
        "Classify events",
        (
            f"Published {len(analyses)} candidate event outputs. Highest risk: "
            f"{_format_event_type(str(top_analysis['eventType']))} at score {top_analysis['riskScore']}."
        ),
        "complete",
    )
    _publish_handoff(
        run_id,
        "Analyzer",
        "Planner",
        "Risk score ready",
        (
            f"Top candidate scored {top_analysis['riskScore']}; apply responder threshold "
            f"{RESPONDER_ACTION_THRESHOLD}."
        ),
    )
    _publish_task(
        run_id,
        "Planner",
        "Incident response plan",
        f"Compare risk score to threshold {RESPONDER_ACTION_THRESHOLD} and decide responder action.",
        "running",
    )

    plan = _build_response_plan(run_id, top_analysis, incident_camera)
    _publish_response_plan(run_id, plan)
    _publish_handoff(
        run_id,
        "Planner",
        "Audit",
        "Threshold decision recorded",
        (
            f"Risk {plan['riskScore']} vs threshold {plan['threshold']}: "
            f"{'responder action recommended' if plan['responderActionRecommended'] else 'no responder action recommended'}."
        ),
    )
    _publish_task(
        run_id,
        "Planner",
        "Incident response plan",
        f"{plan['incidentTitle']}: {plan['estimatedUrgency']}.",
        "complete",
    )
    _publish_task(
        run_id,
        "Audit",
        "Governance report",
        "Record safety controls, model routing, and tool-based side effects.",
        "running",
    )
    _publish_operations_report(
        run_id,
        f"Operations report for {location.name}",
        "Crew completed feed deployment, event analysis, threshold planning, and audit-safe reporting.",
    )
    publish_agent_message(
        f"Agent crew deployed {len(cameras)} feeds, analyzed {len(analyses)} event candidates, and created a threshold-based response plan."
    )
    publish_agent_message(
        "Audit complete: MCP-style dashboard tools handled side effects; human review remains required before escalation."
    )
    _publish_task(
        run_id,
        "Audit",
        "Governance report",
        "Recorded controls: public/demo feeds, no identity recognition, human review, and auditable tool calls.",
        "complete",
    )
    return (
        f"Agent crew deployed {len(cameras)} cameras for {location.name}, "
        "classified event candidates, generated a threshold-based response plan, and recorded governance controls."
    )


@app.on_event("startup")
def startup() -> None:
    _init_tracing()


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/run")
async def run(request: RunRequest) -> dict[str, str]:
    try:
        result = await run_in_threadpool(_run_crew, request)
        return {"result": result}
    except Exception as exc:
        publish_agent_message(f"CrewAI orchestration failed: {str(exc)[:180]}")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
