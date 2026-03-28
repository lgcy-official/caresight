import { NextResponse } from 'next/server';
import { z } from 'zod';
import Twilio from 'twilio';
import { eventBus } from '@/services/event-bus';

const RequestSchema = z.object({
  message: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  cameraName: z.string(),
  recipientNumber: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const { message, severity, cameraName, recipientNumber } = parsed.data;
  const to = recipientNumber || process.env.ALERT_PHONE_NUMBER;
  if (!to) {
    return NextResponse.json({ success: false, error: 'No recipient number configured' }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    return NextResponse.json({ success: false, error: 'Missing Twilio credentials' }, { status: 500 });
  }

  try {
    const client = Twilio(accountSid, authToken);
    const twiml = `<Response><Say voice="alice">CareSight AI alert. Severity: ${severity}. Camera: ${cameraName}. ${message}</Say></Response>`;

    const call = await client.calls.create({ to, from, twiml });

    eventBus.publish({
      type: 'agent_message',
      message: `Manual dispatch call placed to ${to} for ${severity} incident on ${cameraName} (CallSID: ${call.sid})`,
    });

    return NextResponse.json({ success: true, callSid: call.sid });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
