import { tool } from 'ai';
import { z } from 'zod';
import Twilio from 'twilio';
import { eventBus } from '@/services/event-bus';

export const sendCallAlertTool = (cameraId: string, cameraName: string) =>
  tool({
    description:
      'Place an outbound phone call via Twilio to alert a human about a critical incident. The message is read aloud using TwiML <Say>.',
    inputSchema: z.object({
      message: z.string().describe('Alert message to read aloud on the call'),
      severity: z
        .enum(['low', 'medium', 'high', 'critical'])
        .describe('Severity level of the incident'),
      recipientNumber: z
        .string()
        .optional()
        .describe(
          'Phone number to call in E.164 format (e.g. +15551234567). Defaults to ALERT_PHONE_NUMBER env var.'
        ),
    }),
    execute: async ({
      message,
      severity,
      recipientNumber,
    }: {
      message: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      recipientNumber?: string;
    }) => {
      const to = recipientNumber || process.env.ALERT_PHONE_NUMBER;
      if (!to) {
        return { called: false, error: 'No recipient number provided and ALERT_PHONE_NUMBER is not set' };
      }

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !from) {
        return { called: false, error: 'Missing Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER)' };
      }

      const client = Twilio(accountSid, authToken);

      const twiml = `<Response><Say voice="alice">Blartclaw surveillance alert. Severity: ${severity}. Camera: ${cameraName}. ${message}</Say></Response>`;

      const call = await client.calls.create({
        to,
        from,
        twiml,
      });

      eventBus.publish({
        type: 'agent_message',
        message: `Phone alert placed to ${to} for ${severity} incident on ${cameraName} (CallSID: ${call.sid})`,
      });

      return { called: true, callSid: call.sid };
    },
  });
