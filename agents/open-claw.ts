import { streamText, tool, stepCountIs } from 'ai';
import { google } from '@/lib/ai-providers';
import { z } from 'zod';
import { openClawSystemPrompt } from './prompts';
import { identifyHotspotsTool } from '@/tools/identify-hotspots';
import { deployCameraTool } from '@/tools/deploy-camera';
import { SF_WEBCAMS } from '@/data/sf-webcams';
import { eventBus } from '@/services/event-bus';
import type { Camera } from '@/lib/types';

const findWebcamsTool = tool({
  description: 'Get all available webcam feeds that can be deployed for monitoring.',
  inputSchema: z.object({}),
  execute: async () => {
    return { webcams: SF_WEBCAMS, count: SF_WEBCAMS.length };
  },
});

export function createOpenClawStream(userMessage: string) {
  const deployedCameras: Camera[] = [];

  return streamText({
    model: google('gemini-2.5-flash'),
    system: openClawSystemPrompt,
    tools: {
      identifyHotspots: identifyHotspotsTool,
      findWebcams: findWebcamsTool,
      deployCamera: deployCameraTool,
    },
    stopWhen: stepCountIs(20),
    messages: [{ role: 'user', content: userMessage }],
    onStepFinish({ toolResults }) {
      for (const result of toolResults ?? []) {
        if (result.toolName === 'deployCamera' && result.type === 'tool-result') {
          const r = result.output as {
            success?: boolean;
            cameraId?: string;
            cameraName?: string;
          };
          if (r.success && r.cameraId) {
            const webcam = SF_WEBCAMS.find((w) => w.id === r.cameraId);
            if (webcam) {
              deployedCameras.push({
                id: webcam.id,
                name: webcam.name,
                lat: webcam.lat,
                lng: webcam.lng,
                riskLevel: 'high', // will be updated by incidents
                crimeTypes: [],
                streamUrl: webcam.streamUrl,
              });
            }
          }
        }
        if (result.toolName === 'identifyHotspots' && result.type === 'tool-result') {
          const r = result.output as { summary?: string };
          if (r.summary) {
            eventBus.publish({ type: 'agent_message', message: r.summary });
          }
        }
      }
    },
    onFinish() {
      if (deployedCameras.length > 0) {
        eventBus.publish({ type: 'cameras_ready', cameras: deployedCameras });
      }
    },
  });
}
