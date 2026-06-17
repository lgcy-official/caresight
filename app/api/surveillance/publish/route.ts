import { eventBus } from '@/services/event-bus';
import type { SurveillanceEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

const EVENT_TYPES = new Set<SurveillanceEvent['type']>([
  'camera_deployed',
  'camera_status',
  'frame_update',
  'incident',
  'hotspots',
  'cameras_ready',
  'agent_message',
  'integration_status',
  'mcp_tool_call',
  'operations_report',
  'agent_collaboration',
  'agent_task',
  'agent_analysis',
  'incident_response_plan',
  'videos_ready',
  'watcher_cycle',
  'watcher_terminated',
]);

function isSurveillanceEvent(value: unknown): value is SurveillanceEvent {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && EVENT_TYPES.has(type as SurveillanceEvent['type']);
}

export async function POST(req: Request) {
  const expectedToken = process.env.CARESIGHT_PUBLISH_TOKEN;
  if (expectedToken && req.headers.get('x-caresight-publish-token') !== expectedToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const event = await req.json();
  if (!isSurveillanceEvent(event)) {
    return Response.json({ error: 'Invalid surveillance event' }, { status: 400 });
  }

  eventBus.publish(event);
  return Response.json({ ok: true });
}
