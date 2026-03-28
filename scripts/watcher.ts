import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { execFileSync, spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

const [agentId, streamUrl, location] = process.argv.slice(2);

if (!agentId || !streamUrl || !location) {
  console.error(
    "Usage: npx tsx scripts/watcher.ts <agentId> <streamUrl> <location>"
  );
  process.exit(1);
}

const SCRIPTS_DIR = path.resolve(__dirname);
const FRAME_PATH = `/tmp/blartclaw/frames/${agentId}.jpg`;
const MAX_FRAMES = 10;

function runPython(script: string, args: string[], timeout = 60000): string {
  const scriptPath = path.join(SCRIPTS_DIR, script);
  return execFileSync("python3", [scriptPath, ...args], {
    encoding: "utf-8",
    timeout,
  }).trim();
}

function log(type: string, data: Record<string, unknown>): void {
  runPython("log_entry.py", [agentId, type, JSON.stringify(data)]);
}

// Start a persistent ffmpeg process that continuously overwrites the frame file
let streamProc: ChildProcess | null = null;

function startStream(pageUrl: string): void {
  fs.mkdirSync(path.dirname(FRAME_PATH), { recursive: true });

  // yt-dlp resolves the URL, pipes to ffmpeg which writes frames
  streamProc = spawn("bash", ["-c",
    `ffmpeg -y -i "$(yt-dlp -g --format best '${pageUrl}')" -vf fps=1 -f image2 -update 1 -q:v 3 "${FRAME_PATH}" 2>/dev/null`
  ]);

  streamProc.on("exit", (code) => {
    console.log(`[${agentId}] stream pipeline exited with code ${code}`);
    streamProc = null;
  });
}

function stopStream(): void {
  if (streamProc) {
    streamProc.kill("SIGTERM");
    streamProc = null;
  }
}

function readLatestFrame(): string | null {
  try {
    const buffer = fs.readFileSync(FRAME_PATH);
    if (buffer.length < 100) return null; // incomplete write
    return buffer.toString("base64");
  } catch {
    return null;
  }
}

// Start streamlink → ffmpeg pipeline (no separate resolve step needed)
console.log(`[${agentId}] Starting stream pipeline: ${streamUrl}`);
startStream(streamUrl);
console.log(`[${agentId}] Pipeline started, waiting for first frame...`);

// Wait for first frame to appear
async function waitForFirstFrame(maxWait = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    if (readLatestFrame()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}


log("started", { location, streamUrl });

async function main() {
  console.log(`[${agentId}] Starting watcher for ${location}`);

  // Wait for ffmpeg to produce the first frame
  const ready = await waitForFirstFrame();
  if (!ready) {
    console.error(`[${agentId}] No frame received after 30s, exiting`);
    stopStream();
    process.exit(1);
  }

  const frameBuffer = fs.readFileSync(FRAME_PATH);
  console.log(`[${agentId}] First frame ready (${Math.round(frameBuffer.length / 1024)}KB)`);

  const GENERATE_CRIME_AT = 4; // 0-indexed, so this is frame 5 // on frame 5, AI-generate a crime scene
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

  for (let i = 0; i < MAX_FRAMES; i++) {
    // 1. Read latest frame
    let frame = readLatestFrame();

    if (!frame) {
      console.log(`[${agentId}] No frame available, restarting stream...`);
      startStream(streamUrl);
      await waitForFirstFrame();
      continue;
    }

    // On frame 5, use Gemini to generate a crime scene from the current frame
    let generated = false;
    if (i === GENERATE_CRIME_AT && apiKey) {
      console.log(`[${agentId}] Generating AI crime scene from current frame...`);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inlineData: { mimeType: "image/jpeg", data: frame } },
                  { text: "Add two people fighting each other in this image. Make it look natural and photorealistic." },
                ],
              }],
              generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
            }),
          }
        );
        const json = await res.json();
        const parts = json?.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith("image/")) {
              frame = part.inlineData.data as string;
              generated = true;
              console.log(`[${agentId}] Crime scene generated successfully`);
              break;
            }
          }
        }
        if (!generated) {
          console.log(`[${agentId}] Image generation returned no image, using live frame`);
        }
      } catch (err) {
        console.error(`[${agentId}] Image generation failed:`, err);
      }
    }

    const sizeKB = Math.round(Buffer.from(frame, "base64").length / 1024);
    console.log(`[${agentId}] Frame ${i + 1}/${MAX_FRAMES} (${sizeKB}KB)${generated ? " [AI-GENERATED]" : ""}`);

    // 2. Send frame to Gemini for structured analysis
    try {
      const { object: analysis } = await generateObject({
        model: google("gemini-2.5-flash"),
        schema: z.object({
          suspicious: z.boolean().describe("Whether suspicious activity is detected"),
          summary: z.string().describe("Brief description of what is visible in the frame"),
          peopleCount: z.number().describe("Approximate number of people visible"),
          severity: z.enum(["none", "low", "medium", "high"]).describe("Threat severity level"),
          crimeType: z.string().nullable().describe("Type of crime suspected, or null if none"),
          details: z.string().nullable().describe("Detailed description of suspicious activity, or null if none"),
        }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                image: Buffer.from(frame, "base64"),
                mediaType: "image/jpeg",
              },
              {
                type: "text",
                text: `You are a CCTV surveillance analyst monitoring ${location}. Analyze this frame. Report whether you see any suspicious or criminal activity (fights, weapons, break-ins, vandalism, threatening behavior, robbery, etc). Do NOT flag normal pedestrian activity.`,
              },
            ],
          },
        ],
      });

      console.log(`[${agentId}] Analysis: suspicious=${analysis.suspicious} severity=${analysis.severity} people=${analysis.peopleCount} | ${analysis.summary}`);

      if (analysis.suspicious) {
        // Save incident snapshot to public/ so UI can display it
        const snapshotName = `${agentId}-${Date.now()}.jpg`;
        const snapshotDir = path.resolve(__dirname, "..", "public", "snapshots");
        fs.mkdirSync(snapshotDir, { recursive: true });
        fs.writeFileSync(path.join(snapshotDir, snapshotName), Buffer.from(frame, "base64"));

        log("incident", {
          description: analysis.details,
          severity: analysis.severity,
          crimeType: analysis.crimeType,
          summary: analysis.summary,
          peopleCount: analysis.peopleCount,
          location,
          snapshot: `/snapshots/${snapshotName}`,
        });
        console.log(`[${agentId}] INCIDENT: [${analysis.severity}] ${analysis.crimeType} - ${analysis.details}`);
        console.log(`[${agentId}] Suspicious activity detected, stopping watcher.`);
        stopStream();
        log("stopped", { location, reason: "incident_detected", frames: i + 1 });
        return;
      } else {
        log("frame_analyzed", {
          summary: analysis.summary,
          peopleCount: analysis.peopleCount,
          severity: analysis.severity,
        });
      }
    } catch (err) {
      console.error(`[${agentId}] Analysis error:`, err);
    }

    // 3. Wait before reading next frame
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  stopStream();
  console.log(`[${agentId}] Watcher finished after ${MAX_FRAMES} frames`);
  log("stopped", { location, frames: MAX_FRAMES });
}

// Cleanup on exit
process.on("SIGINT", () => { stopStream(); process.exit(0); });
process.on("SIGTERM", () => { stopStream(); process.exit(0); });

main();
