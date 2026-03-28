# Agent API Contract

This document describes the interface between the frontend and the agent orchestration layer. Intended for the agent team.

## HTTP Endpoints

### `POST /api/chat`

Called when the user selects a location. Starts the OpenClaw orchestrator.

**Request body:**
```json
{
  "location": {
    "lat": 37.7749,
    "lng": -122.4194,
    "name": "San Francisco, CA"
  }
}
```

**Response:** `text/plain` stream. The agent's narration text, streamed as it is generated. Displayed in a status bar at the top of the UI — no special format required, plain prose is fine.

---

### `GET /api/surveillance/stream`

Server-Sent Events endpoint. The frontend holds this open for the lifetime of a session. All real-time UI updates (cameras, incidents, hotspots) come through here.

The agent publishes to the in-memory event bus (`services/event-bus.ts`); this endpoint fans those events out to the client automatically.

**Usage:**
```ts
import { eventBus } from '@/services/event-bus'
eventBus.publish({ type: 'cameras_ready', cameras: [...] })
```

---

## Event Types

Defined in `lib/types.ts` as `SurveillanceEvent`. The frontend currently reacts to three:

### `cameras_ready` *(add to `SurveillanceEvent`)*

Emitted once by the orchestrator after `findWebcams` resolves, before sub-agents are deployed. Populates the camera list in the UI.

```ts
{
  type: 'cameras_ready'
  cameras: Camera[]
}
```

### `incident`

Emitted by sub-agents when suspicious activity is confirmed. Drives live risk level updates, incident counts, and the events feed in the UI.

```ts
{
  type: 'incident'
  incident: {
    id: string
    cameraId: string
    cameraName: string
    timestamp: number        // Unix ms
    description: string      // Human-readable summary
    severity: 'critical' | 'high' | 'medium'
    lat: number
    lng: number
  }
}
```

### `hotspots`

Emitted by the orchestrator after high-risk areas are identified. Drives map markers. Already defined — move the publish call from `tools/identify-hotspots.ts` into the orchestrator's `onStepFinish`.

```ts
{
  type: 'hotspots'
  hotspots: CrimeHotspot[]   // see lib/types.ts
}
```

---

## Camera Shape

The `Camera` objects inside `cameras_ready` must include these fields:

```ts
interface Camera {
  id: string
  name: string
  address: string          // Human-readable street address
  lat: number
  lng: number
  riskLevel: 'critical' | 'high' | 'medium'
  crimeTypes: string[]     // e.g. ["robbery", "assault"]
  incidentsLast24h: number
  lastIncident: string     // Relative time string, e.g. "4 min ago"
  isLive: boolean
}
```

---

## Event Bus Rules

- **Only the orchestrator publishes** to the event bus for the main flow (`hotspots`, `cameras_ready`).
- **Sub-agents are the exception** — they publish `incident` events directly via `tools/report-incident.ts`. This is intentional; sub-agents run fire-and-forget and cannot return results through the orchestrator.
- The following event types exist in `SurveillanceEvent` but are **not consumed by the frontend** and should not be published: `camera_deployed`, `camera_status`, `frame_update`.

---

## Pending Backend Work

Before the frontend can drop its mocks, the agent team needs to:

1. Add `cameras_ready` to `SurveillanceEvent` in `lib/types.ts`
2. Remove `eventBus.publish` from `tools/identify-hotspots.ts` — publish `hotspots` from `onStepFinish` in `agents/open-claw.ts` instead
3. Remove all `eventBus.publish` calls from `tools/deploy-camera.ts`
4. Emit `cameras_ready` from the orchestrator after `findWebcams` resolves
5. Ensure `incident` events from `tools/report-incident.ts` use the shape above
