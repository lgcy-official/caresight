import { tool } from 'ai';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '@/services/event-bus';
import type { Incident } from '@/lib/types';

export const reportIncidentTool = (
  cameraId: string,
  cameraName: string,
  lat: number,
  lng: number
) =>
  tool({
    description: 'Report a confirmed suspicious incident detected on camera.',
    inputSchema: z.object({
      description: z.string().describe('Detailed description of the suspicious activity'),
      severity: z
        .enum(['low', 'medium', 'high', 'critical'])
        .describe('Severity level of the incident'),
      frameB64: z.string().optional().describe('Base64 frame showing the incident'),
    }),
    execute: async ({
      description,
      severity,
      frameB64,
    }: {
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      frameB64?: string;
    }) => {
      const incident: Incident = {
        id: uuidv4(),
        cameraId,
        cameraName,
        timestamp: Date.now(),
        description,
        severity,
        lat,
        lng,
        frameB64,
      };

      eventBus.publish({ type: 'incident', incident });

      return {
        incidentId: incident.id,
        reported: true,
        message: `Incident reported: ${description}`,
      };
    },
  });
