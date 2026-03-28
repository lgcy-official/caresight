import { tool, generateObject } from 'ai';
import { google } from '@/lib/ai-providers';
import { z } from 'zod';
import { eventBus } from '@/services/event-bus';
import type { CrimeHotspot } from '@/lib/types';

const HotspotSchema = z.object({
  hotspots: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      lat: z.number(),
      lng: z.number(),
      riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
      description: z.string(),
      crimeTypes: z.array(z.string()),
    })
  ),
});

export const identifyHotspotsTool = tool({
  description:
    'Identify the top crime hotspots in a city based on historical crime data knowledge. Returns hotspot locations with risk levels.',
  inputSchema: z.object({
    city: z.string().describe('The city to analyze (e.g. "San Francisco")'),
    maxHotspots: z.number().optional().default(5).describe('Maximum number of hotspots to return'),
  }),
  execute: async ({ city, maxHotspots }: { city: string; maxHotspots?: number }) => {
    const { object } = await generateObject({
      model: google('gemini-2.5-flash'),
      schema: HotspotSchema,
      prompt: `Identify the top ${maxHotspots} crime hotspots in ${city}. For each hotspot provide:
- A unique snake_case id
- Neighborhood/location name
- Accurate lat/lng coordinates
- Risk level (low/medium/high/critical) based on known crime rates
- Brief description of the crime patterns
- List of common crime types

Return real, accurate locations in ${city}.`,
    });

    const hotspots: CrimeHotspot[] = object.hotspots;

    eventBus.publish({ type: 'hotspots', hotspots });

    return {
      hotspots,
      summary: `Identified ${hotspots.length} hotspots in ${city}`,
    };
  },
});
