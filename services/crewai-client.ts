import { eventBus } from '@/services/event-bus';

interface CrewAiLocation {
  name: string;
  lat: number;
  lng: number;
}

interface CrewAiResponse {
  result?: unknown;
  detail?: unknown;
}

export async function runCrewAiOrchestrator(
  prompt: string,
  location?: CrewAiLocation,
): Promise<string> {
  const serviceUrl = process.env.CREWAI_SERVICE_URL ?? 'http://127.0.0.1:8010';
  eventBus.publish({
    type: 'agent_message',
    message: 'Routing workflow to CrewAI through TrueFoundry AI Gateway...',
  });

  const response = await fetch(`${serviceUrl.replace(/\/$/, '')}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, location }),
  });

  const payload = (await response.json().catch(() => ({}))) as CrewAiResponse;
  if (!response.ok) {
    const detail = typeof payload.detail === 'string' ? payload.detail : response.statusText;
    throw new Error(`CrewAI service failed: ${detail}`);
  }

  return typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result ?? '');
}

