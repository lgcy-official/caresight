# Blartclaw Implementation Plan

## Context

Blartclaw is an AI-powered crime surveillance system. A main "OpenClaw" agent takes a city (San Francisco for demo), identifies crime hotspots, spins up sub-agents to watch CCTV livestreams from those areas, and reports detected incidents. The UI is a dark/cerebral map dashboard with a camera sidebar.

## Tech Stack

- **Next.js 15** (App Router, TypeScript, Tailwind v4) - frontend + agent API
- **Vercel AI SDK v4** (`ai`, `@ai-sdk/google`) - agent orchestration
- **MapLibre GL JS** with CARTO Dark Matter basemap - dark map UI (free, no API key)
- **ffmpeg** (via `child_process`) - frame extraction from HLS/YouTube streams
- **yt-dlp** - resolves webcam/YouTube page URLs to direct HLS stream URLs
- **Docker** - containerized runtime
- **Zod** for schemas

## Architecture

```
User (city search) → OpenClaw Agent → identifyHotspots tool → CrimeHotspot[]
                                     → findWebcams tool → WebcamFeed[]
                                     → spawnWatcher tool (per camera) →
                                         Sub-agent (generateText + maxSteps loop):
                                           captureFrame tool → ffmpeg grabs frame from stream
                                           Vision LLM analyzes frame for crime
                                           reportIncident tool → if suspicious
                                         → EventBus → SSE → UI sidebar updates
```

### Analysis Pipeline (per camera)

Each sub-agent runs a simple loop via `generateText` with `maxSteps`:

```
Sub-agent step loop (~every 3-5 seconds):
  1. Call captureFrame tool → ffmpeg extracts latest frame from HLS stream → base64 JPEG
  2. Vision LLM (Gemini Flash) sees the frame directly
  3. LLM analyzes for: fights, weapons, break-ins, vandalism, threatening behavior, etc.
  4. If suspicious → call reportIncident tool → event bus → SSE → UI
  5. If normal → loop back to captureFrame (next step)
```

Vision LLMs understand scenes holistically — body language, spatial relationships, context, intent — which is exactly what crime detection requires. Claude Haiku is fast (~1-2s per frame) and cheap enough for polling every 3-5 seconds per camera.

### Agent Orchestration (Vercel AI SDK)

OpenClaw reads a **skill file** that defines how to spin up watcher sub-agents. The skill is a tool definition:

```typescript
// src/skills/spawn-watcher.ts

const spawnWatcher = tool({
  description: 'Deploy a CCTV watcher sub-agent for a livestream',
  parameters: z.object({
    webcamId: z.string(),
    streamUrl: z.string(),
    location: z.string(),
    focusAreas: z.array(z.string()).describe('What to watch for based on crime hotspot data'),
  }),
  execute: async ({ webcamId, streamUrl, location, focusAreas }) => {
    // Start ffmpeg frame capture (child_process, runs in same container)
    const capture = startFrameCapture(streamUrl);

    // Spin up sub-agent — a generateText loop with its own tools
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: watcherPrompt(location, focusAreas),
      tools: {
        captureFrame: tool({
          description: 'Capture the latest frame from the livestream',
          parameters: z.object({}),
          execute: async () => {
            const frame = await capture.getLatestFrame();
            eventBus.emit({ type: 'frame_captured', cameraId: webcamId, frame });
            return { image: frame };
          },
        }),
        reportIncident: tool({
          description: 'Report suspicious activity detected in the stream',
          parameters: z.object({
            description: z.string(),
            severity: z.enum(['low', 'medium', 'high']),
            crimeType: z.string(),
          }),
          execute: async ({ description, severity, crimeType }) => {
            eventBus.emit({
              type: 'incident_detected',
              cameraId: webcamId,
              data: { description, severity, crimeType, location, timestamp: new Date() },
            });
            return { reported: true };
          },
        }),
      },
      maxSteps: 100,
      messages: [{
        role: 'user',
        content: 'Begin monitoring. Capture a frame, analyze it, report anything suspicious, then capture the next frame. Repeat continuously.',
      }],
    });

    capture.stop();
    return { cameraId: webcamId, summary: result.text };
  },
});
```

**OpenClaw main agent** loads this skill and calls it per camera:

```typescript
// src/agents/open-claw.ts
const { text } = await generateText({
  model: google('gemini-2.5-pro'),
  system: OPENCLAW_SYSTEM_PROMPT,
  tools: {
    identifyHotspots,
    findWebcams,
    spawnWatcher,  // skill file
  },
  maxSteps: 20,
  messages,
});
```

When OpenClaw calls `spawnWatcher` 3 times in one step, all 3 execute concurrently:

```
OpenClaw step 3:
  ├── spawnWatcher("golden-gate", ...) → sub-agent loop running...
  ├── spawnWatcher("bay-bridge", ...)  → sub-agent loop running...
  └── spawnWatcher("downtown", ...)    → sub-agent loop running...
```

### Frame Capture (ffmpeg via child_process)

A spawned ffmpeg process per stream, running in the same container:

```typescript
// src/services/frame-capture.ts
function startFrameCapture(streamUrl: string) {
  const proc = spawn('ffmpeg', [
    '-i', streamUrl,
    '-vf', 'fps=1/3',           // 1 frame every 3 seconds
    '-f', 'image2',
    '-update', '1',              // overwrite same file with latest frame
    '-y', `/tmp/frame-${id}.jpg`
  ]);

  return {
    getLatestFrame: async () => {
      const buffer = await fs.readFile(`/tmp/frame-${id}.jpg`);
      return buffer.toString('base64');
    },
    stop: () => proc.kill(),
  };
}
```

Stream URL resolution via `yt-dlp`:
```bash
yt-dlp -g --format best "https://www.youtube.com/watch?v=VIDEO_ID"
# → outputs direct HLS .m3u8 URL
```

## File Structure

```
src/
  app/
    layout.tsx                    # Root layout, dark theme, fonts
    page.tsx                      # Main dashboard
    globals.css                   # Dark theme CSS
    api/
      chat/route.ts               # OpenClaw agent streaming endpoint
      surveillance/stream/route.ts # SSE for sub-agent updates
  agents/
    open-claw.ts                  # Main agent definition
    prompts.ts                    # System prompts for OpenClaw + watchers
  skills/
    spawn-watcher.ts              # Skill file: how to spin up a watcher sub-agent
  tools/
    identify-hotspots.ts          # LLM-based crime hotspot finder
    find-webcams.ts               # Match webcams near hotspots
  services/
    frame-capture.ts              # ffmpeg frame capture (child_process)
    stream-resolver.ts            # yt-dlp URL resolution
    event-bus.ts                  # In-memory EventEmitter singleton
  components/
    dashboard.tsx                 # Three-column layout (sidebar + map + chat)
    city-search.tsx               # City search input overlay on map
    surveillance-map.tsx          # MapLibre dark map with markers
    camera-sidebar.tsx            # Sidebar listing active camera feeds
    camera-card.tsx               # Individual camera card (frame + status)
    incident-alert.tsx            # Alert popup for detected incidents
    chat-panel.tsx                # Chat with OpenClaw agent
  hooks/
    use-surveillance-stream.ts    # SSE hook for real-time sub-agent events
  lib/
    types.ts                      # TypeScript interfaces
    constants.ts                  # Config constants
  data/
    sf-webcams.ts                 # Static SF webcam registry
Dockerfile                        # Node 20 + ffmpeg + yt-dlp
docker-compose.yml                # Single container setup
```

## Implementation Phases

### Phase 1: Project Scaffold
1. `npx create-next-app@latest` with App Router, TS, Tailwind
2. Install deps: `ai @ai-sdk/google maplibre-gl zod uuid`
3. Set up `.env.local` with `GOOGLE_GENERATIVE_AI_API_KEY`
4. Create `Dockerfile` with Node 20 + ffmpeg + yt-dlp
5. Create file structure, `types.ts`, `constants.ts`

### Phase 2: Frame Capture Service
1. `stream-resolver.ts` - wraps `yt-dlp -g` to resolve webcam/YouTube URLs to direct HLS URLs
2. `frame-capture.ts` - spawns ffmpeg per stream, extracts frames every 3 seconds
3. Test: resolve a skylinewebcams URL → get HLS stream → capture frames → verify base64 JPEGs

### Phase 3: Core Agent Infrastructure
1. `sf-webcams.ts` - static registry of SF webcams with lat/lng and URLs
2. `event-bus.ts` - EventEmitter singleton for sub-agent events
3. `prompts.ts` - system prompts for OpenClaw and watcher sub-agents
4. `identify-hotspots.ts` - uses `generateObject` to return `CrimeHotspot[]` via LLM knowledge
5. `find-webcams.ts` - matches webcam feeds to hotspot locations
6. `spawn-watcher.ts` - skill file: spins up sub-agent with `captureFrame` + `reportIncident` tools
7. `open-claw.ts` - main agent with `identifyHotspots`, `findWebcams`, `spawnWatcher` tools
8. `api/chat/route.ts` - streaming endpoint wiring agent to frontend

### Phase 4: Dark Map UI
1. `surveillance-map.tsx` - MapLibre with CARTO dark-matter style, hotspot markers (pulsing red circles), camera markers
2. `city-search.tsx` - search input with dark styling
3. `chat-panel.tsx` - `useChat` integration with OpenClaw
4. `dashboard.tsx` - three-column layout (camera sidebar 25% | map 50% | chat 25%)
5. `page.tsx` + `layout.tsx` + `globals.css` - dark theme

### Phase 5: Real-time Integration
1. `api/surveillance/stream/route.ts` - SSE endpoint subscribing to event bus
2. `use-surveillance-stream.ts` - client hook connecting via EventSource
3. Wire frame captures + incident reports from sub-agents → SSE → UI components

### Phase 6: Camera Sidebar
1. `camera-card.tsx` - shows latest frame, status badge, analysis summary
2. `camera-sidebar.tsx` - scrollable list of camera cards
3. `incident-alert.tsx` - toast/popup for detected incidents
4. Wire SSE updates to camera cards in real-time

### Phase 7: Polish
1. Map animations (pulsing markers, incident highlights)
2. Smooth transitions for camera deployment
3. Docker compose setup for one-command startup
4. (Bonus) Twilio integration for calling local businesses

## Key Technical Notes

- **ffmpeg + yt-dlp** are the only system dependencies beyond Node. Both install easily in Docker.
- **Frame rate: 1 frame every 3 seconds** — ~20 Gemini Flash calls/min per camera.
- **yt-dlp resolves stream URLs** from YouTube, skylinewebcams, and hundreds of other sites. No browser needed.
- **Sub-agents are `generateText` loops** — simple, native to the Vercel AI SDK.
- **Everything runs in one container** — ffmpeg processes, Node server, agents all colocated.
- **Limit concurrent cameras to 3-4** for CPU management (ffmpeg decoding).

## Running

```bash
# Docker (recommended)
docker compose up

# Direct (requires ffmpeg + yt-dlp installed)
npm install
npm run dev
```

Open `http://localhost:3000`, type "San Francisco" in the chat, and watch it go.

## Verification Checklist
- [ ] Hotspots appear on map with risk indicators
- [ ] Agent deploys watcher sub-agents for nearby cameras
- [ ] ffmpeg captures frames from livestreams
- [ ] Sidebar shows live frames updating every ~3 seconds
- [ ] Vision LLM analyzes each frame for suspicious activity
- [ ] Incident alerts appear on map + sidebar when crime detected
- [ ] Multiple cameras run concurrently without issues
