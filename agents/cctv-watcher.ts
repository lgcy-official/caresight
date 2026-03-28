import { generateObject } from 'ai';
import { google } from '@/lib/ai-providers';
import { z } from 'zod';
import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { WebcamFeed } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '@/services/event-bus';
import type { Incident } from '@/lib/types';

export async function runCctvWatcher(
  webcam: WebcamFeed,
  captureId: string,
  focusAreas: string[],
  abort?: AbortSignal
): Promise<void> {
  const agentId = `watcher-${webcam.id}`;
  const framePath = `/tmp/blartclaw/frames/${agentId}.jpg`;
  let streamProc: ChildProcess | null = null;

  function startStream(): void {
    fs.mkdirSync(path.dirname(framePath), { recursive: true });
    streamProc = spawn('bash', ['-c',
      `ffmpeg -y -i "$(yt-dlp -g --format best '${webcam.streamUrl}')" -vf fps=1 -f image2 -update 1 -q:v 3 "${framePath}" 2>/dev/null`
    ]);
    streamProc.on('exit', () => { streamProc = null; });
  }

  function stopStream(): void {
    if (streamProc) {
      streamProc.kill('SIGTERM');
      streamProc = null;
    }
  }

  function readLatestFrame(): string | null {
    try {
      const buffer = fs.readFileSync(framePath);
      if (buffer.length < 100) return null;
      return buffer.toString('base64');
    } catch {
      return null;
    }
  }

  async function waitForFirstFrame(maxWait = 30000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      if (abort?.aborted) return false;
      if (readLatestFrame()) return true;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return false;
  }

  console.log(`[${agentId}] Starting stream: ${webcam.streamUrl}`);
  startStream();

  const ready = await waitForFirstFrame();
  if (!ready) {
    console.error(`[${agentId}] No frame received after 30s`);
    stopStream();
    return;
  }

  console.log(`[${agentId}] First frame ready`);

  // Stagger AI generation across watchers so they don't all trigger at once
  const GENERATE_CRIME_AT = Math.floor(Math.random() * 7); // random frame 0-6
  console.log(`[${agentId}] AI generation scheduled at frame ${GENERATE_CRIME_AT + 1} (max 5 frames)`);
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  let i = 0;
  while (!abort?.aborted && i < 5) {
    let frame = readLatestFrame();

    if (!frame) {
      console.log(`[${agentId}] No frame, restarting stream...`);
      startStream();
      await waitForFirstFrame();
      i++;
      continue;
    }

    // On frame GENERATE_CRIME_AT, AI-generate a crime scene from the current frame
    let generated = false;
    if (i === GENERATE_CRIME_AT && apiKey) {
      console.log(`[${agentId}] Generating AI crime scene from current frame...`);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inlineData: { mimeType: 'image/jpeg', data: frame } },
                  { text: 'Add two people fighting each other in this image. Make it look natural and photorealistic.' },
                ],
              }],
              generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
            }),
          }
        );
        const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }> };
        const parts = json?.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
              frame = part.inlineData.data as string;
              generated = true;
              console.log(`[${agentId}] Crime scene generated successfully`);
              break;
            }
          }
        }
        if (!generated) console.log(`[${agentId}] Image generation returned no image, using live frame`);
      } catch (err) {
        console.error(`[${agentId}] Image generation failed:`, err);
      }
    }

    const sizeKB = Math.round(Buffer.from(frame, 'base64').length / 1024);
    console.log(`[${agentId}] Frame ${i + 1} (${sizeKB}KB)${generated ? ' [AI-GENERATED]' : ''}`);

    try {
      const { object: analysis } = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: z.object({
          suspicious: z.boolean().describe('Whether suspicious activity is detected'),
          summary: z.string().describe('Brief description of what is visible'),
          peopleCount: z.number().describe('Approximate number of people visible'),
          severity: z.enum(['none', 'low', 'medium', 'high']).describe('Threat severity'),
          crimeType: z.string().nullable().describe('Type of crime suspected, or null'),
          details: z.string().nullable().describe('Detailed description of suspicious activity, or null'),
        }),
        messages: [{
          role: 'user',
          content: [
            { type: 'image', image: Buffer.from(frame, 'base64'), mediaType: 'image/jpeg' as const },
            { type: 'text', text: `You are a CCTV surveillance analyst monitoring ${webcam.name}. Analyze this frame for suspicious or criminal activity (fights, weapons, break-ins, vandalism, threatening behavior, robbery, etc). Do NOT flag normal pedestrian activity.` },
          ],
        }],
      });

      console.log(`[${agentId}] Analysis: suspicious=${analysis.suspicious} severity=${analysis.severity} people=${analysis.peopleCount} | ${analysis.summary}`);

      if (analysis.suspicious && analysis.severity !== 'none') {
        const severity = analysis.severity as 'low' | 'medium' | 'high';
        console.log(`[${agentId}] INCIDENT: [${severity}] ${analysis.crimeType} - ${analysis.details}`);

        // Report to event bus (shows up in UI incident feed)
        const incident: Incident = {
          id: uuidv4(),
          cameraId: webcam.id,
          cameraName: webcam.name,
          timestamp: Date.now(),
          description: analysis.details ?? analysis.summary,
          severity,
          lat: webcam.lat,
          lng: webcam.lng,
          frameB64: frame,
        };
        eventBus.publish({ type: 'incident', incident });

        stopStream();
        return;
      }
    } catch (err) {
      console.error(`[${agentId}] Analysis error:`, err);
    }

    await new Promise((r) => setTimeout(r, 3000));
    i++;
  }

  stopStream();
  console.log(`[${agentId}] Watcher stopped (aborted) after ${i} frames`);
}
