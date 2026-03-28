# CareSight AI

CareSight AI is our AI health hackathon prototype for continuous patient-safety and care-operations monitoring.

It combines a Next.js control center, a Python video-analysis service, Gemini-powered agent workflows, and live event streaming to help a care team detect and escalate high-risk situations from video feeds in real time.

## What We Built

We built a multi-agent monitoring system that can:

- accept a location or operational area as input
- discover and deploy live video feeds
- analyze frames for suspicious or high-risk activity
- stream incidents back into a central dashboard
- support human escalation workflows

For the hackathon framing, the same architecture is positioned around health and patient safety use cases such as:

- fall-risk and mobility-event monitoring
- unsafe crowding in waiting rooms or care areas
- perimeter and after-hours safety review
- rapid escalation of high-severity events to staff

The current product is a working prototype rather than a clinical device. It is designed to demonstrate agent orchestration, live video reasoning, and escalation workflows that could be adapted for hospitals, clinics, senior living, or home-health operations.

## How It Works

### 1. Frontend command center

The Next.js app provides:

- live map and camera visualization
- agent status updates
- incident feed and detail views
- operator controls for reviewing events

### 2. Video analysis backend

The Python FastAPI service:

- starts and manages live captures
- extracts current frames from streams
- runs YOLO-based object detection
- exposes frame, detection, and health endpoints

### 3. Agent orchestration

Gemini-powered agents:

- decide where to monitor
- deploy watcher agents to streams
- analyze flagged frames
- report incidents back to the UI

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Gemini via `@ai-sdk/google`
- FastAPI
- OpenCV
- Ultralytics YOLO
- Streamlink / VidGear
- SSE for real-time event updates

## Local Setup

### Requirements

- Node.js
- npm
- Python 3.11

### Environment

Create `.env.local` with:

```bash
GEMINI_API_KEY=your_key_here
PYTHON_SERVICE_URL=http://127.0.0.1:8001
PYTHON_SERVICE_ENABLED=true
```

### Install

JavaScript dependencies:

```bash
npm install
```

Python environment:

```bash
/usr/local/bin/python3.11 -m venv .venv311
./.venv311/bin/pip install -r video_service/requirements.txt
```

## Run

Start the Python video service:

```bash
./.venv311/bin/python -m uvicorn video_service.main:app --host 127.0.0.1 --port 8001
```

Start the Next.js app:

```bash
npm run dev
```

Open:

- `http://127.0.0.1:3000`

## Verified Local Runtime

The following local setup has already been validated in this repo:

- frontend responds on port `3000`
- video service responds on port `8001`
- Gemini environment variable is loaded through `.env.local`
- Python stack imports cleanly in the Python 3.11 environment at `.venv311`

## Optional Integrations

These are not required for the main prototype flow:

### Twilio

Only needed if you want outbound phone-call alerts.

Optional environment variables:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
ALERT_PHONE_NUMBER=
```

### OpenClaw orchestrator

An experimental OpenClaw Docker setup is present in the repo, but the main application path does not require it.

Optional environment variables:

```bash
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENCLAW_GATEWAY_TOKEN=
```

## Repo Structure

```text
app/                     Next.js routes and app shell
components/              Dashboard UI
agents/                  Main and watcher agent logic
services/                Event bus and backend client helpers
tools/                   Agent tools
video_service/           FastAPI + video processing backend
openclaw-orchestrator/   Optional Docker-based orchestration experiment
```

## Hackathon Positioning

CareSight AI is intended as an AI-assisted health operations and patient-safety prototype.

The core idea is simple:

- use AI agents to coordinate what should be monitored
- use computer vision to surface potentially unsafe situations
- keep a human in the loop for escalation and review

That makes it a strong fit for an AI health hackathon focused on care delivery, safety operations, or workforce support.
