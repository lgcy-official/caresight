# YouTube Frame Extraction for Gemini Vision

## The Problem

`youtube.com/watch?v=...` URLs are webpages, not video files. Passing them directly to
Gemini's file API fails for live streams (works only for recorded YouTube videos).

## The Approach

YouTube live streams are HLS under the hood. We can get raw video segments via pure HTTP
— no ffmpeg, no Python service, no native binaries. Works on Vercel.

**Flow:**
1. `ytdl-core` resolves `watch?v=...` → signed HLS manifest URL
2. Fetch manifest → parse out the latest `.ts` segment URL
3. Fetch that segment (2–4s of raw video, ~200KB)
4. Pass buffer to Gemini as `{ type: 'file', data: segmentBuffer, mediaType: 'video/mp2t' }`

## Implementation

```bash
npm install @distube/ytdl-core
```

New file: `services/youtube-frames.ts`

```typescript
import ytdl from '@distube/ytdl-core';

export async function getLatestSegment(youtubeUrl: string): Promise<Buffer | null> {
  try {
    const info = await ytdl.getInfo(youtubeUrl);
    const liveFormat = info.formats.find((f) => f.isHLS && f.hasVideo);
    if (!liveFormat?.url) return null;

    // Fetch HLS manifest
    const manifest = await fetch(liveFormat.url).then((r) => r.text());

    // Get the last segment URL (most recent footage)
    const segmentUrl = manifest
      .split('\n')
      .filter((l) => l.startsWith('http'))
      .at(-1);
    if (!segmentUrl) return null;

    // Fetch the segment bytes
    const buf = await fetch(segmentUrl).then((r) => r.arrayBuffer());
    return Buffer.from(buf);
  } catch {
    return null;
  }
}
```

Then in `agents/cctv-watcher.ts`, replace the `file` content part:

```typescript
import { getLatestSegment } from '@/services/youtube-frames';

// Inside the monitoring loop, before calling generateText:
const segment = await getLatestSegment(webcam.streamUrl);
if (!segment) {
  // fall back to error handling
}

// In the message content:
{
  type: 'file',
  data: segment,          // Buffer of raw .ts bytes
  mediaType: 'video/mp2t',
}
```

## Tradeoffs

| | |
|---|---|
| No native binaries | ✅ Pure npm + HTTP |
| Works on Vercel | ✅ |
| Real live footage | ✅ Fresh segment each cycle |
| Fragility | ⚠️ YouTube changes internals, `ytdl-core` needs updates |
| YouTube ToS | ⚠️ Prohibits programmatic access — fine for hackathon, not production |
| Segment signing | ⚠️ HLS URLs expire — must resolve fresh each cycle (already handled above) |

## Alternative: `@distube/ytdl-core` vs `ytdl-core`

Use `@distube/ytdl-core` — it's the actively maintained community fork and handles
YouTube API changes faster than the original.
