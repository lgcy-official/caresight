# CareSight AI

CareSight is a location-based AI surveillance prototype. You search for a city or address, the app tries to find public livestream cameras for that area, drops them onto an interactive map, opens the feeds in the dashboard, and starts watching for risky activity.

The project combines a Next.js control center, an agent orchestration layer, and a Python video-analysis service. Its current behavior is closer to an AI-assisted operations and monitoring console than a polished product.

## What It Does Right Now

Today, the app can:

- let an operator search for a location from the top search bar
- geocode that location and send it to the main orchestrator agent
- discover livestream webcam or CCTV sources for the area
- place discovered cameras on the map with live feed metadata
- open camera feeds in the dashboard, using YouTube embeds when available
- run watcher agents against deployed streams
- stream incident updates back into the UI over SSE
- optionally place a Twilio phone call for high-severity alerts

In practice, the user flow is:

1. Search for a city or address.
2. The frontend posts that location to `/api/chat`.
3. The main agent finds livestream cameras for that area and publishes them to the dashboard.
4. Watcher agents monitor those feeds and emit incidents.
5. The incident feed, map pins, risk badges, and camera detail panel update live.

## Main Pieces

### Next.js dashboard

The frontend is the operator console. It currently includes:

- a full-screen surveillance map
- a location search box
- live camera pins and camera selection
- a side panel / incident feed for detected events
- agent status messages showing what the system is doing

The main UI entry point is [app/page.tsx](/Users/vincerusso/Documents/GitHub/caresight/app/page.tsx), which renders the dashboard in [components/dashboard.tsx](/Users/vincerusso/Documents/GitHub/caresight/components/dashboard.tsx).

### Agent orchestration

The main agent is responsible for finding livestreams and deploying them into the UI. Once cameras are deployed, watcher agents are spawned to monitor individual streams.

The orchestration logic lives in [agents/main-agent.ts](/Users/vincerusso/Documents/GitHub/caresight/agents/main-agent.ts).

At a high level, it:

- accepts a requested location
- runs a browser-based discovery workflow to find livestream cameras
- publishes camera pins and video metadata to the dashboard
- spawns per-camera watcher processes
- escalates severe incidents through the event bus and optional phone alerts

### Python video service

The Python service is the computer-vision backend. It exposes endpoints to:

- start a stream capture
- stop a stream capture
- fetch the latest frame
- fetch current detections
- stream flagged frames and detections over SSE

The service entry point is [video_service/main.py](/Users/vincerusso/Documents/GitHub/caresight/video_service/main.py).

## Real-Time Data Flow

The app uses server-sent events for live updates.

- The frontend listens to `/api/surveillance/stream`.
- The event bus publishes `cameras_ready`, `videos_ready`, `incident`, and `agent_message` events.
- The `useAgentSSE` hook merges those updates into the UI state.

Relevant files:

- [app/api/surveillance/stream/route.ts](/Users/vincerusso/Documents/GitHub/caresight/app/api/surveillance/stream/route.ts)
- [hooks/use-agent-sse.ts](/Users/vincerusso/Documents/GitHub/caresight/hooks/use-agent-sse.ts)
- [services/event-bus.ts](/Users/vincerusso/Documents/GitHub/caresight/services/event-bus.ts)

## Alerting

There is an API route for outbound phone-call alerts using Twilio. This is optional and only works if the Twilio environment variables are configured.

The route is implemented in [app/api/dispatch-call/route.ts](/Users/vincerusso/Documents/GitHub/caresight/app/api/dispatch-call/route.ts).

## Current Positioning

The repo still carries some health-hackathon framing, but the codebase today behaves like a general AI surveillance and incident-monitoring prototype.

That means:

- it is useful for demos of livestream discovery, monitoring, and escalation
- it is not a production-ready safety platform
- it is not a medical device or clinically validated system

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- AI SDK with Google Gemini
- FastAPI
- OpenCV
- Ultralytics YOLO
- SSE for live frontend updates
- Twilio for optional outbound alert calls

## Local Setup

### Requirements

- Node.js
- npm
- Python 3.11

### Environment

Create `.env.local` with the values from `.env.local.example`.

For the original TypeScript/Gemini orchestrator path:

```bash
GEMINI_API_KEY=your_key_here
PYTHON_SERVICE_URL=http://127.0.0.1:8001
PYTHON_SERVICE_ENABLED=true
```

For the hackathon CrewAI + TrueFoundry path:

```bash
USE_CREWAI_ORCHESTRATOR=true
CREWAI_SERVICE_URL=http://127.0.0.1:8010
TRUEFOUNDRY_GATEWAY_BASE_URL=https://gateway.truefoundry.ai
TRUEFOUNDRY_MODEL=openai/openai/gpt-5.5
TRUEFOUNDRY_API_KEY=your_truefoundry_gateway_key
TRUEFOUNDRY_METADATA={}
TRUEFOUNDRY_LOGGING_CONFIG={"enabled": true}
CARESIGHT_NEXT_BASE_URL=http://127.0.0.1:3000
SYNTHETIC_INCIDENTS_ENABLED=false
```

Optional TrueFoundry tracing:

```bash
TRUEFOUNDRY_TRACING_ENDPOINT=
TRUEFOUNDRY_PAT_TOKEN=
TRUEFOUNDRY_TRACING_PROJECT=caresight
```

Optional Twilio variables:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
ALERT_PHONE_NUMBER=
```

### Install

Install JavaScript dependencies:

```bash
npm install
```

Create the Python environment and install the video-service dependencies:

```bash
/usr/local/bin/python3.11 -m venv .venv311
./.venv311/bin/pip install -r video_service/requirements.txt
```

Install the CrewAI sidecar dependencies into the same environment, or into a separate one:

```bash
./.venv311/bin/pip install -r agent_service/requirements.txt
```

## Run

Start the Python video service:

```bash
./.venv311/bin/python -m uvicorn video_service.main:app --host 127.0.0.1 --port 8001
```

For the CrewAI + TrueFoundry hackathon path, start the agent sidecar:

```bash
./.venv311/bin/python -m uvicorn agent_service.main:app --host 127.0.0.1 --port 8010 --reload
```

Start the frontend:

```bash
npm run dev
```

Then open `http://127.0.0.1:3000`.

## Repo Layout

```text
app/                     Next.js app routes and API endpoints
components/              Dashboard UI components
agents/                  Main orchestrator and watcher logic
hooks/                   Client hooks for SSE and monitoring state
services/                Shared event and backend helpers
tools/                   Agent tool implementations
video_service/           FastAPI video capture and detection service
openclaw-orchestrator/   Experimental orchestration setup
```

## Limitations

Current limitations are important:

- camera discovery depends on external livestream availability
- some feeds may be YouTube embeds rather than direct raw streams
- alerting depends on external credentials and services
- the system is prototype-grade and still mixes surveillance and healthcare framing in different parts of the repo

If you are pitching or demoing this project, the most accurate short description is:

> CareSight is an AI-assisted surveillance dashboard that discovers public livestream cameras for a location, monitors them with agent and CV workflows, and surfaces live incidents for human review and escalation.

For the hackathon pitch, the safer positioning is:

> CareSight is a public-safety operations console that uses CrewAI agents, MCP tools, and TrueFoundry-routed model calls to deploy public/demo feeds, triage operational incidents, and maintain an auditable human-review workflow.
