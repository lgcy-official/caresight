import { createMainAgentStream, stopAllAgents } from '@/agents/main-agent';
import { runCrewAiOrchestrator } from '@/services/crewai-client';

export const maxDuration = 300; // 5 min — Browser Use skill can take ~30s per attempt

export async function POST(req: Request) {
  const body = await req.json();

  // Stop any agents from a previous session
  stopAllAgents();

  let prompt: string;
  if (body.location) {
    const { name, lat, lng } = body.location as { name: string; lat: number; lng: number };
    prompt =
      `Find and deploy livestream cameras for the area: "${name}" ` +
      `(coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}). ` +
      `Search for webcam livestreams in this area using the Browser Use skill, ` +
      `then place them on the monitoring map with their GPS coordinates and YouTube stream URLs.`;
  } else {
    const messages = body.messages ?? [];
    const last = messages[messages.length - 1];
    prompt =
      typeof last?.content === 'string'
        ? last.content
        : last?.content?.[0]?.text ?? 'Find livestream cameras in San Francisco';
  }

  try {
    if (process.env.USE_CREWAI_ORCHESTRATOR === 'true') {
      const result = await runCrewAiOrchestrator(prompt, body.location);
      return new Response(result, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const result = await createMainAgentStream(prompt);
    return result.toTextStreamResponse();
  } catch (err) {
    console.error('[api/chat] createMainAgentStream threw:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
