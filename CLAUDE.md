# CCTV Agent — Zero to Agent Hackathon

## Stack
- Next.js 14 App Router, TypeScript, Tailwind
- Gemini 2.0 Flash for vision + function calling
- Vercel for deployment

## Architecture
- `/app/api/analyze/route.ts` — POST endpoint, accepts base64 frame, calls Gemini, returns action
- `/app/api/incidents/route.ts` — GET/POST for incident log (in-memory or Vercel KV)
- `/app/page.tsx` — main dashboard: live feed + incident list
- `/lib/agent.ts` — Gemini agent logic, tool definitions, system prompt
- `/lib/tools.ts` — tool implementations (log, alert, snapshot)

## Tools the agent can call
- log_incident(threat_level, description)
- save_snapshot(frame_b64, incident_id)
- send_alert(message) — POST to a Slack webhook

## Environment variables
GEMINI_API_KEY, SLACK_WEBHOOK_URL, KV_URL (if using Vercel KV)

## Do not
- Use any client-side camera access in server components
- Block the edge runtime with heavy computation
