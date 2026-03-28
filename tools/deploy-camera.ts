import { tool } from 'ai';
import { z } from 'zod';
import { visionClient } from '@/services/vision-client';
import { eventBus } from '@/services/event-bus';
import { runCctvWatcher } from '@/agents/cctv-watcher';
import { SF_WEBCAMS } from '@/data/sf-webcams';
import { PYTHON_SERVICE_ENABLED } from '@/lib/constants';
import type { CameraStatus } from '@/lib/types';

export const deployCameraTool = tool({
  description:
    'Deploy a CCTV monitoring sub-agent for a specific webcam. The sub-agent will watch the stream, run YOLO detection, and report suspicious incidents.',
  inputSchema: z.object({
    webcamId: z.string().describe('ID of the webcam to monitor (from sf-webcams registry)'),
    focusAreas: z
      .array(z.string())
      .describe('What to specifically watch for (e.g. "weapons", "crowd disturbances")'),
  }),
  execute: async ({ webcamId, focusAreas }: { webcamId: string; focusAreas: string[] }) => {
    const webcam = SF_WEBCAMS.find((w) => w.id === webcamId);
    if (!webcam) {
      return { error: `Unknown webcam: ${webcamId}` };
    }

    const camera: CameraStatus = {
      id: webcamId,
      webcamId,
      name: webcam.name,
      streamUrl: webcam.streamUrl,
      lat: webcam.lat,
      lng: webcam.lng,
      status: 'connecting',
      incidentCount: 0,
    };

    eventBus.publish({ type: 'camera_deployed', camera });

    let captureId: string;
    try {
      captureId = await visionClient.startCapture(webcam.streamUrl);
      eventBus.publish({ type: 'camera_status', cameraId: webcamId, status: 'active' });
    } catch (err) {
      if (PYTHON_SERVICE_ENABLED) {
        eventBus.publish({ type: 'camera_status', cameraId: webcamId, status: 'error' });
        return { error: `Failed to start capture: ${String(err)}` };
      }
      // Python disabled — treat as a no-op capture
      captureId = `noop-${webcamId}`;
      eventBus.publish({ type: 'camera_status', cameraId: webcamId, status: 'active' });
    }

    // Run sub-agent (async, non-blocking — fire and forget for the main agent)
    runCctvWatcher(webcam, captureId, focusAreas).catch(console.error);

    return {
      success: true,
      cameraId: webcamId,
      cameraName: webcam.name,
      captureId,
      message: `Camera "${webcam.name}" deployed and monitoring started`,
    };
  },
});
