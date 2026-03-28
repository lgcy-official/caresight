import { streamText, generateText, tool, stepCountIs } from 'ai';
import { readFileSync } from 'node:fs';
import { google } from '@/lib/ai-providers';
import { z } from 'zod';
import { eventBus } from '@/services/event-bus';
import { agentMemory } from '@/services/agent-memory';
import { runCctvWatcher } from '@/agents/cctv-watcher';
import type { Camera, SurveillanceEvent, WebcamFeed } from '@/lib/types';
import type { ModelMessage } from 'ai';
import { sendCallAlertTool } from '@/tools/send-call-alert';

// ── Logger ──────────────────────────────────────────────────────────

const TAG = '[orchestrator]';
const log = {
  info: (...args: unknown[]) => console.log(TAG, ...args),
  warn: (...args: unknown[]) => console.warn(TAG, ...args),
  error: (...args: unknown[]) => console.error(TAG, ...args),
};

// ── Constants ──────────────────────────────────────────────────────────

const BROWSER_USE_SKILL_ID = '7ced2f63-e2dc-4651-9f3c-2a09bf07b2eb';
const MAIN_AGENT_ID = 'main-orchestrator';
const SUPERVISOR_INTERVAL_MS = 3_000; // assess every 3s

interface ToolCallLog {
  toolName?: string;
  args?: Record<string, unknown>;
}

interface ToolResultLog {
  toolName?: string;
  result?: unknown;
}

interface StreamResponseLog {
  headers?: Record<string, unknown>;
  messages?: unknown[];
}

interface StreamStepLog {
  finishReason?: string;
  toolCalls?: ToolCallLog[];
  toolResults?: ToolResultLog[];
  text?: string;
  warnings?: unknown[];
  usage?: Record<string, unknown>;
  response?: StreamResponseLog;
  error?: unknown;
}

interface WatcherLogEntry {
  type?: string;
  timestamp?: string;
  agentId?: string;
  data?: Record<string, unknown>;
}

// ── Active watcher registry (for abort) ────────────────────────────────

const activeWatchers = new Map<string, AbortController>();
let supervisorAbort: AbortController | null = null;

export function stopAllAgents(): void {
  log.info('Stopping all agents', { watchers: activeWatchers.size, hasSupervisor: !!supervisorAbort });
  supervisorAbort?.abort();
  supervisorAbort = null;
  for (const [id, controller] of activeWatchers) {
    log.info(`Aborting watcher: ${id}`);
    controller.abort();
    activeWatchers.delete(id);
  }
}

export function registerWatcher(watcherId: string): AbortController {
  if (activeWatchers.has(watcherId)) {
    log.info(`Replacing existing watcher: ${watcherId}`);
    activeWatchers.get(watcherId)!.abort();
  }
  const controller = new AbortController();
  activeWatchers.set(watcherId, controller);
  log.info(`Registered watcher: ${watcherId} (total: ${activeWatchers.size})`);
  return controller;
}

// ── System prompts ─────────────────────────────────────────────────────

const mainAgentSystemPrompt = `You are Blartclaw, an AI-powered urban surveillance coordinator. Your mission is to find live CCTV/webcam streams for a given location and deploy them on a monitoring dashboard.

When given a location:
1. Extract the city or area name from the location (e.g. "San Francisco, California" → "san-francisco", "Amsterdam, Netherlands" → "amsterdam")
2. Call the execute_skill tool with:
   - skill_id: "${BROWSER_USE_SKILL_ID}"
   - parameters: { "area": "<area-name>" }
   This runs the Browser Use skill that scrapes livestream webcam URLs for that area.
3. Process the returned livestreams — each has a youtube_url, youtube_video_id, youtube_title, description, location, and gps_coordinates (latitude/longitude).
4. Use updateCameraPins to place ALL discovered cameras on the map at once, using the GPS coordinates and YouTube URLs from the results. This also automatically publishes video embeds and spawns watcher sub-agents.
5. Send a final status update via sendAgentMessage confirming deployment is complete.

Important:
- You MUST use the execute_skill tool (NOT browser_task) to run the livestream skill. Pass the skill_id and parameters as described above.
- Always call sendAgentMessage before and after the skill execution so the user sees progress.
- Use the gps_coordinates from the skill results for accurate camera placement.
- For the "address" field in updateCameraPins: Set it to a specific address for each camera — include the landmark, neighborhood, or venue name + city.
- Set riskLevel to "medium" by default for discovered cameras.
- If the skill returns no results, inform the user via sendAgentMessage.
- If execute_skill fails with a timeout or gateway error, RETRY it up to 2 more times before giving up. The skill can take up to 30 seconds — this is normal.
- Do NOT call populateVideos or readWatcherLogs — these are handled automatically.`;

const supervisorSystemPrompt = `You are the Blartclaw supervisor. You receive periodic updates from CCTV watcher sub-agents and must:

1. Assess the overall situation across all cameras.
2. Escalate critical patterns (multiple cameras showing incidents, same area recurring).
3. Update camera risk levels if the evidence warrants it.
4. Send concise status summaries to the dashboard.
5. For critical-severity incidents or rapidly escalating situations, use sendCallAlert to place an outbound phone call alerting the on-duty responder.

Be brief and action-oriented. Only take action when the events warrant it — routine "all clear" cycles need no response.`;

// ── Shared tools ───────────────────────────────────────────────────────

const updateLocationTool = tool({
  description: 'Update the monitored location on the dashboard map.',
  inputSchema: z.object({
    name: z.string().describe('Display name of the location'),
    lat: z.number().describe('Latitude'),
    lng: z.number().describe('Longitude'),
  }),
  execute: async ({ name, lat, lng }) => {
    log.info(`Tool:updateLocation → ${name} (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    eventBus.publish({
      type: 'agent_message',
      message: `Location set to: ${name} (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    });
    return { success: true, location: { name, lat, lng } };
  },
});

const updateCameraPinsTool = tool({
  description: 'Batch-update all camera pins on the dashboard map with discovered livestream cameras.',
  inputSchema: z.object({
    cameras: z.array(
      z.object({
        id: z.string().describe('Unique camera identifier (use youtube_video_id)'),
        name: z.string().describe('Camera display name'),
        lat: z.number().describe('Latitude from gps_coordinates'),
        lng: z.number().describe('Longitude from gps_coordinates'),
        address: z.string().optional().describe('Specific geocodable address — include landmark/venue name + city (e.g. "Fisherman\'s Wharf, San Francisco, CA")'),
        streamUrl: z.string().optional().describe('YouTube livestream URL'),
        riskLevel: z
          .enum(['medium', 'high', 'critical'])
          .optional()
          .default('medium')
          .describe('Risk level'),
      })
    ),
  }),
  execute: async ({ cameras }) => {
    log.info(`Tool:updateCameraPins → ${cameras.length} camera(s)`);
    for (const cam of cameras) {
      log.info(`  📍 ${cam.id} "${cam.name}" → (${cam.lat}, ${cam.lng}) addr="${cam.address ?? ''}"`)
    }

    // Geocode cameras with missing/duplicate coordinates
    eventBus.publish({ type: 'agent_message', message: `Geocoding ${cameras.length} camera locations...` });
    const geocoded = await geocodeCameras(cameras);

    const deployed: Camera[] = geocoded.map((cam) => ({
      id: cam.id,
      name: cam.name,
      lat: cam.lat,
      lng: cam.lng,
      address: cam.address,
      riskLevel: cam.riskLevel ?? 'medium',
      crimeTypes: [],
      streamUrl: cam.streamUrl,
    }));

    // 1. Push camera pins to the map
    eventBus.publish({ type: 'agent_message', message: `Placing ${deployed.length} camera pins on map...` });
    eventBus.publish({ type: 'cameras_ready', cameras: deployed });

    // 2. Push video embeds so the UI can render iframes immediately
    const videos = deployed
      .filter((cam) => cam.streamUrl)
      .map((cam) => {
        const videoId = extractYouTubeId(cam.streamUrl!);
        return {
          cameraId: cam.id,
          youtubeUrl: cam.streamUrl!,
          youtubeVideoId: videoId ?? cam.id,
          title: cam.name,
        };
      });
    if (videos.length > 0) {
      eventBus.publish({ type: 'videos_ready', videos });
      log.info(`Published ${videos.length} video embed(s) to UI`);
    }

    eventBus.publish({
      type: 'agent_message',
      message: `Deployed ${deployed.length} camera(s) with ${videos.length} livestream(s)`,
    });

    // 3. Spawn watcher sub-agents last
    const watcherCount = deployed.filter((c) => c.streamUrl).length;
    eventBus.publish({ type: 'agent_message', message: `Spawning ${watcherCount} surveillance watcher(s)...` });
    for (const cam of deployed) {
      if (!cam.streamUrl) continue;
      const watcherId = `watcher-${cam.id}`;
      const abortController = registerWatcher(watcherId);
      const feed: WebcamFeed = {
        id: cam.id,
        name: cam.name,
        streamUrl: cam.streamUrl,
        lat: cam.lat,
        lng: cam.lng,
        hotspotId: cam.id,
      };
      log.info(`Spawning watcher for camera: ${cam.id} (${cam.name})`);
      runCctvWatcher(feed, `capture-${cam.id}`, ['suspicious activity'], abortController.signal)
        .catch((err) => log.error(`Watcher ${cam.id} failed:`, err));
    }

    return { success: true, count: deployed.length };
  },
});

const addCameraPinTool = tool({
  description: 'Add a single camera pin to the dashboard map.',
  inputSchema: z.object({
    id: z.string(),
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
    streamUrl: z.string().optional(),
    riskLevel: z.enum(['medium', 'high', 'critical']).optional().default('medium'),
  }),
  execute: async ({ id, name, lat, lng, address, streamUrl, riskLevel }) => {
    log.info(`Tool:addCameraPin → ${id} "${name}" at (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    const camera: Camera = {
      id,
      name,
      lat,
      lng,
      address,
      riskLevel: riskLevel ?? 'medium',
      crimeTypes: [],
      streamUrl,
    };
    eventBus.publish({ type: 'cameras_ready', cameras: [camera] });
    return { success: true, cameraId: id };
  },
});

const sendAgentMessageTool = tool({
  description: 'Send a status update to the dashboard UI.',
  inputSchema: z.object({
    message: z.string().describe('Status message to display'),
  }),
  execute: async ({ message }) => {
    log.info(`Tool:sendAgentMessage → "${message.slice(0, 80)}"`);
    eventBus.publish({ type: 'agent_message', message });
    return { sent: true };
  },
});

// ── Mock data for Browser Use skill ─────────────────────────────────────

const MOCK_LIVESTREAMS = [
  { youtube_url: "https://www.youtube.com/watch?v=BSWhGNXxT9A", youtube_video_id: "BSWhGNXxT9A", youtube_title: "San Francisco Bay Webcam", description: "Livestream from San Francisco Bay Webcam", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/bay", gps_coordinates: { latitude: 37.8080, longitude: -122.4090 } },
  { youtube_url: "https://www.youtube.com/watch?v=_VqvVJfmyfs", youtube_video_id: "_VqvVJfmyfs", youtube_title: "San Francisco Bay Webcam", description: "Livestream from San Francisco Bay Webcam", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/bay", gps_coordinates: { latitude: 37.8095, longitude: -122.4110 } },
  { youtube_url: "https://www.youtube.com/watch?v=CXYr04BWvmc", youtube_video_id: "CXYr04BWvmc", youtube_title: "San Francisco Bay Webcam", description: "Livestream from San Francisco Bay Webcam", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/bay", gps_coordinates: { latitude: 37.8070, longitude: -122.4075 } },
  { youtube_url: "https://www.youtube.com/watch?v=G8RIAgPxaMc", youtube_video_id: "G8RIAgPxaMc", youtube_title: "San Francisco Bay Webcam", description: "Livestream from San Francisco Bay Webcam", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/bay", gps_coordinates: { latitude: 37.8085, longitude: -122.4060 } },
  { youtube_url: "https://www.youtube.com/watch?v=DaB_xIJEXzs", youtube_video_id: "DaB_xIJEXzs", youtube_title: "Cal. Academy of Sciences: Penguins (San Francisco) Webcam", description: "Livestream from Cal. Academy of Sciences: Penguins (San Francisco) Webcam", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/academy-of-sciences-penguins", gps_coordinates: { latitude: 37.7699, longitude: -122.4661 } },
  { youtube_url: "https://www.youtube.com/watch?v=oP6V5VrOrWc", youtube_video_id: "oP6V5VrOrWc", youtube_title: "Cal. Academy of Sciences: Penguins (San Francisco) Webcam", description: "Livestream from Cal. Academy of Sciences: Penguins (San Francisco) Webcam", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/academy-of-sciences-penguins", gps_coordinates: { latitude: 37.7702, longitude: -122.4665 } },
  { youtube_url: "https://www.youtube.com/watch?v=99aULx3GORo", youtube_video_id: "99aULx3GORo", youtube_title: "Cal. Academy of Sciences: Coral Reef (San Francisco) Webcam", description: "Livestream from Cal. Academy of Sciences: Coral Reef (San Francisco) Webcam", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/academy-of-sciences-coral-reef", gps_coordinates: { latitude: 37.7696, longitude: -122.4658 } },
  { youtube_url: "https://www.youtube.com/watch?v=ThpFcm9vD7c", youtube_video_id: "ThpFcm9vD7c", youtube_title: "San Francisco International Airport Webcam", description: "Livestream from San Francisco International Airport Webcam", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/international-airport", gps_coordinates: { latitude: 37.6213, longitude: -122.3790 } },
  { youtube_url: "https://www.youtube.com/watch?v=wRP2BtRYZ28", youtube_video_id: "wRP2BtRYZ28", youtube_title: "KSFO Airport Live 24/7 Tracking, ATC Audio", description: "Livestream: KSFO Airport Live 24/7 Tracking, ATC Audio", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/international-airport", gps_coordinates: { latitude: 37.6193, longitude: -122.3816 } },
  { youtube_url: "https://www.youtube.com/watch?v=a5IW4I-z2rs", youtube_video_id: "a5IW4I-z2rs", youtube_title: "San Francisco: Pier 23 Webcam", description: "Livestream from San Francisco: Pier 23 Webcam", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/pier-23", gps_coordinates: { latitude: 37.8030, longitude: -122.4000 } },
  { youtube_url: "https://www.youtube.com/watch?v=poEjWqI7-Wk", youtube_video_id: "poEjWqI7-Wk", youtube_title: "Castro Street Cam 1 Live Stream", description: "Livestream: Castro Street Cam 1 Live Stream", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/castro-street", gps_coordinates: { latitude: 37.7609, longitude: -122.4350 } },
  { youtube_url: "https://www.youtube.com/watch?v=ByG6k2b7Twc", youtube_video_id: "ByG6k2b7Twc", youtube_title: "San Francisco: Castro Street Webcam", description: "Livestream from San Francisco: Castro Street Webcam", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/castro-street", gps_coordinates: { latitude: 37.7612, longitude: -122.4347 } },
  { youtube_url: "https://www.youtube.com/watch?v=T4iRkn3F98M", youtube_video_id: "T4iRkn3F98M", youtube_title: "Castro Street Cam 4 Live Stream", description: "Livestream: Castro Street Cam 4 Live Stream", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/castro-street", gps_coordinates: { latitude: 37.7615, longitude: -122.4343 } },
  { youtube_url: "https://www.youtube.com/watch?v=rUcC51_2djY", youtube_video_id: "rUcC51_2djY", youtube_title: "Live Reef Lagoon Cam | California Academy of Sciences", description: "Livestream: Live Reef Lagoon Cam | California Academy of Sciences", location: "San Francisco, United States", webcam_url: "https://worldcams.tv/united-states/san-francisco/academy-of-sciences-sharks", gps_coordinates: { latitude: 37.7693, longitude: -122.4670 } },
];

const mockExecuteSkillTool = tool({
  description: 'Execute a Browser Use skill (mock mode — returns cached San Francisco livestream data).',
  inputSchema: z.object({
    skill_id: z.string().describe('The skill ID to execute'),
    parameters: z.record(z.string(), z.any()).optional().describe('Parameters for the skill'),
  }),
  execute: async ({ skill_id, parameters }) => {
    log.info(`Tool:execute_skill (MOCK) → skill_id=${skill_id}, params=${JSON.stringify(parameters)}`);
    return {
      success: true,
      result: {
        success: true,
        data: {
          area: (parameters as Record<string, string>)?.area ?? 'san-francisco',
          city_url: 'https://worldcams.tv/united-states/san-francisco/',
          livestreams: MOCK_LIVESTREAMS,
          count: MOCK_LIVESTREAMS.length,
        },
      },
    };
  },
});

// ── Initial agent stream (HTTP response) ───────────────────────────────

export async function createMainAgentStream(locationPrompt: string) {
  log.info(`Creating main agent stream for: "${locationPrompt}"`);

  // Stop any agents from a previous location
  stopAllAgents();
  agentMemory.clear();

  const browserUseTools = { execute_skill: mockExecuteSkillTool };
  eventBus.publish({
    type: 'agent_message',
    message: 'Initializing livestream search...',
  });

  const result = streamText({
    model: google('gemini-2.5-flash'),
    system: mainAgentSystemPrompt,
    tools: {
      ...browserUseTools,
      updateLocation: updateLocationTool,
      updateCameraPins: updateCameraPinsTool,
      addCameraPin: addCameraPinTool,
      sendAgentMessage: sendAgentMessageTool,
    },
    stopWhen: stepCountIs(10),
    messages: [{ role: 'user', content: locationPrompt }],

    onStepFinish(event) {
      const calls = (event.toolCalls ?? []) as ToolCallLog[];
      const results = (event.toolResults ?? []) as ToolResultLog[];
      const details = event as StreamStepLog;
      log.info(`Step finished (reason: ${event.finishReason})`, {
        text: event.text?.slice(0, 200) || '(none)',
        toolCalls: calls.map((toolCall) => ({
          tool: toolCall.toolName,
          args: JSON.stringify(toolCall.args ?? {}).slice(0, 300),
        })),
        toolResults: results.map((toolResult) => ({
          tool: toolResult.toolName,
          result: JSON.stringify(toolResult.result).slice(0, 500),
        })),
        warnings: details.warnings ?? [],
        usage: details.usage ?? {},
      });

      if (event.finishReason === 'error') {
        const raw = details.response;
        const explicitError = details.error;

        log.error('=== STEP ERROR ===');
        if (explicitError) {
          log.error('event.error:', explicitError);
        }
        log.error('response headers:', JSON.stringify(raw?.headers ?? {}));
        // Log tail of messages (most recent = where the error is)
        const msgs: unknown[] = raw?.messages ?? [];
        log.error(`response messages (${msgs.length} total), last 3:`);
        for (const msg of msgs.slice(-3)) {
          log.error(' msg:', JSON.stringify(msg).slice(0, 1000));
        }
        log.error('==================');
        eventBus.publish({ type: 'agent_message', message: `Agent step error. Check server logs for details.` });
      }

      // Broadcast notable tool calls to the UI
      for (const tc of calls) {
        const name = tc.toolName;
        const args = tc.args ?? {};
        if (name === 'execute_skill') {
          const parameters =
            typeof args.parameters === 'object' && args.parameters !== null
              ? (args.parameters as Record<string, unknown>)
              : undefined;
          const area =
            typeof parameters?.area === 'string'
              ? parameters.area
              : typeof args.skill_id === 'string'
                ? args.skill_id
                : '?';
          eventBus.publish({ type: 'agent_message', message: `Running Browser Use skill for "${area}"... (this takes ~30s)` });
        }
      }

      // Broadcast tool results / errors to the UI
      for (const tr of results) {
        const name = tr.toolName;
        const r =
          typeof tr.result === 'object' && tr.result !== null
            ? (tr.result as Record<string, unknown>)
            : undefined;
        if (r && (r.error || r.isError)) {
          log.error(`Tool "${name}" returned error:`, JSON.stringify(r).slice(0, 500));
          eventBus.publish({ type: 'agent_message', message: `Tool error (${name}): ${String(r.error ?? r.message ?? 'unknown').slice(0, 100)}` });
        } else if (name === 'execute_skill' && r) {
          const resultStr = JSON.stringify(r).slice(0, 200);
          log.info(`execute_skill result: ${resultStr}`);
          eventBus.publish({ type: 'agent_message', message: `Browser Use skill finished. Processing results...` });
        }
      }
    },

    async onFinish(event) {
      log.info('Main agent stream finished', {
        steps: event.steps?.length ?? '?',
        finishReason: event.finishReason,
        warnings: event.warnings ?? [],
        usage: event.usage ?? {},
      });

      if (event.finishReason === 'error') {
        log.error('=== STREAM FINISHED WITH ERROR ===');
        log.error('warnings:', JSON.stringify(event.warnings ?? []));

        // Per-step breakdown
        for (const [i, step] of (event.steps ?? []).entries()) {
          const s = step as StreamStepLog;
          log.error(`  Step[${i}] reason=${s.finishReason} tools=[${(s.toolCalls ?? []).map((toolCall) => toolCall.toolName).join(', ')}]`);
          if (s.text) log.error(`    text: ${s.text.slice(0, 200)}`);
          for (const tr of (s.toolResults ?? [])) {
            log.error(`    toolResult(${tr.toolName}):`, JSON.stringify(tr.result).slice(0, 500));
          }
          if (s.finishReason === 'error') {
            const stepError = s.error;
            if (stepError) log.error(`    error:`, stepError);
            const stepMsgs: unknown[] = s.response?.messages ?? [];
            log.error(`    response messages (${stepMsgs.length}), last 2:`);
            for (const msg of stepMsgs.slice(-2)) {
              log.error('     ', JSON.stringify(msg).slice(0, 800));
            }
          }
        }
        log.error('==================================');
        eventBus.publish({ type: 'agent_message', message: `Search failed (finish reason: error). Check server logs.` });
      }
      // ── Save initial conversation memory ──────────────────────────
      const responseMessages = event.response.messages as ModelMessage[];
      const fullConversation: ModelMessage[] = [
        { role: 'user' as const, content: locationPrompt },
        ...responseMessages,
      ];

      agentMemory.save(MAIN_AGENT_ID, 'main', fullConversation, {
        locationPrompt,
        phase: 'monitoring',
        initialFinishedAt: Date.now(),
      });
      log.info('Initial memory saved', { messages: fullConversation.length });
      eventBus.publish({ type: 'agent_message', message: `Agent memory saved — ${fullConversation.length} messages captured` });

      // ── Start background supervisor loop ──────────────────────────
      log.info('Starting supervisor loop');
      eventBus.publish({ type: 'agent_message', message: 'Supervisor loop active — monitoring all feeds' });
      supervisorAbort = new AbortController();
      runSupervisorLoop(supervisorAbort.signal).catch((err) => log.error('Supervisor loop crashed:', err));
    },
  });

  return result;
}

// ── Background supervisor loop ─────────────────────────────────────────

/**
 * Collects surveillance events from the event bus and drains them
 * on demand for supervisor processing.
 */
class EventCollector {
  private events: SurveillanceEvent[] = [];

  collect = (event: SurveillanceEvent): void => {
    // Only collect events relevant to the supervisor
    if (
      event.type === 'incident' ||
      event.type === 'watcher_cycle' ||
      event.type === 'watcher_terminated'
    ) {
      this.events.push(event);
    }
  };

  drain(): SurveillanceEvent[] {
    const batch = [...this.events];
    this.events = [];
    return batch;
  }

  get length(): number {
    return this.events.length;
  }
}

/**
 * Runs indefinitely in the background, periodically processing
 * sub-agent events and persisting main-agent memory.
 *
 * Each cycle:
 *   1. Drain accumulated events
 *   2. If any meaningful events, run a short LLM assessment
 *   3. Save memory
 *   4. Sleep and repeat
 */
async function runSupervisorLoop(abort: AbortSignal): Promise<void> {
  log.info('Supervisor loop started');
  const collector = new EventCollector();
  eventBus.on('surveillance', collector.collect);
  const processedTimestamps = new Set<string>(); // track processed incidents to avoid duplicates
  let incidentCounter = 0;

  try {
    while (!abort.aborted) {
      await sleep(SUPERVISOR_INTERVAL_MS, abort);
      if (abort.aborted) break;

      const events = collector.drain();

      // Check watcher log file for new incidents
      try {
        const logPath = '/tmp/blartclaw/watcher.log';
        const raw = readFileSync(logPath, 'utf-8');
        if (!raw.trim()) throw new Error('empty');
        const entries = raw.trim().split('\n').map((line) => JSON.parse(line) as WatcherLogEntry);
        const incidents = entries.filter((entry) =>
          entry.type === 'incident' && typeof entry.timestamp === 'string' && !processedTimestamps.has(entry.timestamp)
        );
        for (const inc of incidents) {
          const data = inc.data ?? {};
          const cameraId = (inc.agentId ?? '').replace('watcher-', '');
          processedTimestamps.add(inc.timestamp ?? '');
          incidentCounter++;
          log.info(`Watcher log incident #${incidentCounter}: [${data.severity}] ${data.crimeType} - ${data.description} (camera: ${cameraId})`);

          eventBus.publish({
            type: 'incident',
            incident: {
              id: `inc-${incidentCounter}-${cameraId}`,
              cameraId,
              cameraName: String(data.location ?? 'Unknown'),
              timestamp: Date.now(),
              description: String(data.description ?? ''),
              severity: (data.severity as 'low' | 'medium' | 'high' | 'critical') ?? 'medium',
              lat: 0,
              lng: 0,
            },
          });

          eventBus.publish({
            type: 'agent_message',
            message: `🚨 INCIDENT [${data.severity}] at ${data.location}: ${data.crimeType} — ${data.description}${data.snapshot ? ` 📸 ${data.snapshot}` : ''}`,
          });
        }
      } catch {
        // No log file yet, that's fine
      }

      if (events.length === 0) {
        log.info('Supervisor cycle: no events, skipping');
        continue;
      }
      log.info(`Supervisor cycle: processing ${events.length} event(s)`);

      // Build a textual summary of the events
      const eventSummary = events
        .map((e) => {
          switch (e.type) {
            case 'incident':
              return `INCIDENT [${e.incident.severity}] ${e.incident.cameraName}: ${e.incident.description}`;
            case 'watcher_cycle':
              return `CYCLE [${e.cameraName}] #${e.iteration}: ${e.summary}`;
            case 'watcher_terminated':
              return `TERMINATED [${e.cameraName}]: ${e.reason} (restart: ${e.willRestart})`;
            default:
              return null;
          }
        })
        .filter(Boolean)
        .join('\n');

      if (!eventSummary.trim()) continue;

      const memory = agentMemory.load(MAIN_AGENT_ID);

      try {
        // Build context from previous supervisor state
        const prevSummary = (memory?.state.lastAssessment as string) ?? 'No previous assessment.';

        const result = await generateText({
          model: google('gemini-2.5-flash'),
          system: supervisorSystemPrompt,
          tools: {
            updateCameraPins: updateCameraPinsTool,
            sendAgentMessage: sendAgentMessageTool,
            sendCallAlert: sendCallAlertTool('supervisor', 'Supervisor'),
          },
          stopWhen: stepCountIs(5),
          messages: [
            {
              role: 'user' as const,
              content: `Previous supervisor assessment:\n${prevSummary}\n\n` +
                `New sub-agent updates (${events.length} events):\n${eventSummary}\n\n` +
                `Assess the situation. If there are critical or escalating patterns, update camera risk levels and send a status update. If everything is routine, respond briefly.`,
            },
          ],
          abortSignal: abort,
        });

        log.info('Supervisor LLM assessment complete', { textLength: result.text.length });

        // Save supervisor memory
        const supervisorCycle = ((memory?.state.supervisorCycles as number) ?? 0) + 1;
        const newMessages: ModelMessage[] = [
          ...(memory?.messages ?? []),
          { role: 'user' as const, content: `[Supervisor cycle ${supervisorCycle}] ${eventSummary.slice(0, 300)}` },
          ...(result.response.messages as ModelMessage[]),
        ];

        agentMemory.save(MAIN_AGENT_ID, 'main', newMessages, {
          ...memory?.state,
          supervisorCycles: supervisorCycle,
          lastSupervisorRun: Date.now(),
          lastAssessment: result.text.slice(0, 500),
          eventsProcessed: ((memory?.state.eventsProcessed as number) ?? 0) + events.length,
        });
        log.info(`Supervisor cycle #${supervisorCycle} saved`, { eventsProcessed: events.length, totalMessages: newMessages.length });
      } catch (err) {
        if (abort.aborted) break;

        log.error('Supervisor LLM error:', err);
        // Save error but keep looping
        agentMemory.save(MAIN_AGENT_ID, 'main', memory?.messages ?? [], {
          ...memory?.state,
          lastSupervisorError: String(err).slice(0, 200),
          lastSupervisorErrorAt: Date.now(),
        });

        eventBus.publish({
          type: 'agent_message',
          message: `Supervisor error: ${String(err).slice(0, 80)} — will retry`,
        });
      }
    }
  } finally {
    eventBus.off('surveillance', collector.collect);
    log.info('Supervisor loop stopped');
  }

  // ── Final memory save on shutdown ──────────────────────────────────
  const finalMemory = agentMemory.load(MAIN_AGENT_ID);
  agentMemory.save(MAIN_AGENT_ID, 'main', finalMemory?.messages ?? [], {
    ...finalMemory?.state,
    supervisorStoppedAt: Date.now(),
    supervisorStoppedReason: 'abort',
  });
  log.info('Supervisor final memory saved');
}

// ── Helpers ────────────────────────────────────────────────────────────

interface RawCamera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  streamUrl?: string;
  riskLevel?: 'medium' | 'high' | 'critical';
}

/**
 * Detects cameras with missing (0,0), duplicate, or suspiciously identical
 * coordinates and geocodes them using the free Nominatim API.
 */
function geocodeCameras(cameras: RawCamera[]): RawCamera[] {
  // Group cameras by coordinate key to find duplicates
  const groups = new Map<string, number[]>();
  for (let i = 0; i < cameras.length; i++) {
    const cam = cameras[i];
    const key = `${cam.lat.toFixed(5)},${cam.lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  }

  const result = [...cameras];

  for (const [key, indices] of groups) {
    if (indices.length <= 1) continue; // unique coord, no offset needed
    log.info(`Spreading ${indices.length} cameras at ${key}`);
    // Spread duplicates in a small circle around their shared point
    const radius = 0.003; // ~300m
    for (let j = 0; j < indices.length; j++) {
      const idx = indices[j];
      const cam = result[idx];
      const angle = (2 * Math.PI * j) / indices.length;
      result[idx] = {
        ...cam,
        lat: cam.lat + radius * Math.cos(angle),
        lng: cam.lng + radius * Math.sin(angle),
      };
    }
  }

  return result;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function sleep(ms: number, abort?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (abort?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    abort?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
