import { PYTHON_SERVICE_URL, PYTHON_SERVICE_ENABLED } from '@/lib/constants';
import type { Detection, FlaggedFrame } from '@/lib/types';

export interface CaptureStartResponse {
  capture_id: string;
}

export interface FrameResponse {
  frame_b64: string;
  timestamp: number;
  detections: Detection[];
  is_suspicious: boolean;
}

export const visionClient = {
  async startCapture(streamUrl: string): Promise<string> {
    if (!PYTHON_SERVICE_ENABLED) return `noop-${Date.now()}`;

    const res = await fetch(`${PYTHON_SERVICE_URL}/capture/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stream_url: streamUrl }),
    });
    if (!res.ok) throw new Error(`Failed to start capture: ${res.statusText}`);
    const data: CaptureStartResponse = await res.json();
    return data.capture_id;
  },

  async stopCapture(captureId: string): Promise<void> {
    await fetch(`${PYTHON_SERVICE_URL}/capture/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capture_id: captureId }),
    });
  },

  async getLatestFrame(captureId: string): Promise<FrameResponse | null> {
    const res = await fetch(`${PYTHON_SERVICE_URL}/capture/${captureId}/frame`);
    if (!res.ok) return null;
    return res.json();
  },

  async getDetections(captureId: string): Promise<Detection[]> {
    const res = await fetch(`${PYTHON_SERVICE_URL}/capture/${captureId}/detections`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.detections ?? [];
  },

  async getNextFlaggedFrame(captureId: string, timeoutMs = 5000): Promise<FlaggedFrame | null> {
    if (!PYTHON_SERVICE_ENABLED) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/capture/${captureId}/next-flag`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        captureId,
        frameB64: data.frame_b64,
        timestamp: data.timestamp,
        detections: data.detections ?? [],
        isSuspicious: data.is_suspicious ?? false,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${PYTHON_SERVICE_URL}/health`, { cache: 'no-store' });
      return res.ok;
    } catch {
      return false;
    }
  },
};
