import { tool } from 'ai';
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import type { Detection } from '@/lib/types';

const analyzeFrameSchema = z.object({
  frameB64: z.string().describe('Base64-encoded JPEG frame from the camera'),
  detections: z
    .array(
      z.object({
        class: z.string(),
        confidence: z.number(),
        bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      })
    )
    .describe('YOLO detection results for this frame'),
  cameraName: z.string().describe('Name/location of the camera'),
  focusAreas: z.array(z.string()).describe('What to look for'),
});

type AnalyzeFrameInput = z.infer<typeof analyzeFrameSchema>;

export const analyzeFrameTool = tool({
  description:
    'Analyze a YOLO-flagged video frame using a vision model to determine if the activity is genuinely suspicious.',
  inputSchema: analyzeFrameSchema,
  execute: async ({ frameB64, detections, cameraName, focusAreas }: AnalyzeFrameInput) => {
    const detectionSummary = (detections as Detection[])
      .map((d) => `${d.class} (conf: ${(d.confidence * 100).toFixed(0)}%)`)
      .join(', ');

    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: frameB64,
              mediaType: 'image/jpeg',
            },
            {
              type: 'text',
              text: `Camera: ${cameraName}
YOLO detected: ${detectionSummary}
Focus areas: ${focusAreas.join(', ')}

Analyze this frame. Is there genuinely suspicious activity? Consider context carefully.
Respond with: SUSPICIOUS or NORMAL, followed by a brief explanation (1-2 sentences).`,
            },
          ],
        },
      ],
    });

    const isSuspicious = text.toUpperCase().startsWith('SUSPICIOUS');
    return { isSuspicious, analysis: text };
  },
});
