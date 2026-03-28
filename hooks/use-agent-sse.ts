'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { SurveillanceEvent, Camera } from '@/lib/types';
import type { GeoLocation } from '@/components/location-search';

// Module-level cache — persists across renders and component remounts.
// Keyed by "lat,lng" rounded to 3 decimal places (~111m grid).
const cameraCache = new Map<string, Camera[]>();

// 1 mile ≈ 0.0145 degrees
const GRID = 0.0145;
function locationKey(loc: GeoLocation): string {
  const snapLat = Math.round(loc.lat / GRID) * GRID;
  const snapLng = Math.round(loc.lng / GRID) * GRID;
  return `${snapLat.toFixed(4)},${snapLng.toFixed(4)}`;
}

export interface RealIncident {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detections: string[];
  frameB64?: string;
  lat?: number;
  lng?: number;
}

export interface VideoFeed {
  cameraId: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  title: string;
}

export interface AgentSSEState {
  agentMessage: string | null;
  agentLog: string[];
  realCameras: Camera[] | null;
  realIncidents: RealIncident[];
  videoFeeds: Record<string, VideoFeed>;
  connected: boolean;
}

const INITIAL_STATE: AgentSSEState = {
  agentMessage: null,
  agentLog: [],
  realCameras: null,
  realIncidents: [],
  videoFeeds: {},
  connected: false,
};

interface InternalAgentSSEState extends AgentSSEState {
  sessionKey: string | null;
}

function createSessionState(sessionKey: string): InternalAgentSSEState {
  return { ...INITIAL_STATE, sessionKey };
}

export function useAgentSSE(location: GeoLocation | null, active: boolean) {
  const activeKey = active && location ? locationKey(location) : null;
  const [state, setState] = useState<InternalAgentSSEState>({ ...INITIAL_STATE, sessionKey: null });
  const esRef = useRef<EventSource | null>(null);
  const fetchRef = useRef<AbortController | null>(null);

  const startAgent = useCallback(async (loc: GeoLocation) => {
    fetchRef.current?.abort();
    fetchRef.current = new AbortController();
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: { name: loc.name, lat: loc.lat, lng: loc.lng } }),
        signal: fetchRef.current.signal,
      });
    } catch {
      // fire-and-forget; errors are non-fatal
    }
  }, []);

  useEffect(() => {
    if (!activeKey || !location) {
      esRef.current?.close();
      esRef.current = null;
      fetchRef.current?.abort();
      return;
    }

    const sessionKey = activeKey;
    const es = new EventSource('/api/surveillance/stream');
    esRef.current = es;
    const cached = cameraCache.get(sessionKey);

    es.onopen = () => {
      const nextState = createSessionState(sessionKey);
      nextState.connected = true;
      if (cached) {
        nextState.realCameras = cached;
        setState(nextState);
      } else {
        setState(nextState);
        startAgent(location);
      }
    };

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SurveillanceEvent;
        if (event.type === 'cameras_ready') {
          setState((s) => {
            const current = s.sessionKey === sessionKey ? s : createSessionState(sessionKey);
            const existing = current.realCameras ?? [];
            const existingIds = new Set(existing.map((c) => c.id));
            const merged = [...existing, ...event.cameras.filter((c) => !existingIds.has(c.id))];
            cameraCache.set(sessionKey, merged);
            return { ...current, realCameras: merged };
          });
        } else if (event.type === 'incident') {
          const inc = event.incident;
          const realInc: RealIncident = {
            id: inc.id,
            cameraId: inc.cameraId,
            cameraName: inc.cameraName,
            timestamp: inc.timestamp,
            severity: inc.severity === 'low' ? 'medium' : inc.severity,
            description: inc.description,
            detections: inc.detections?.map((d) => d.class) ?? [],
            frameB64: inc.frameB64,
            lat: inc.lat,
            lng: inc.lng,
          };
          setState((s) => {
            const current = s.sessionKey === sessionKey ? s : createSessionState(sessionKey);
            return {
              ...current,
              realIncidents: [realInc, ...current.realIncidents].slice(0, 50),
            };
          });
        } else if (event.type === 'videos_ready') {
          const feeds: Record<string, VideoFeed> = {};
          for (const v of event.videos) {
            feeds[v.cameraId] = v;
          }
          setState((s) => {
            const current = s.sessionKey === sessionKey ? s : createSessionState(sessionKey);
            return { ...current, videoFeeds: { ...current.videoFeeds, ...feeds } };
          });
        } else if (event.type === 'agent_message') {
          const entry = `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${event.message}`;
          setState((s) => {
            const current = s.sessionKey === sessionKey ? s : createSessionState(sessionKey);
            return {
              ...current,
              agentMessage: event.message,
              agentLog: [entry, ...current.agentLog].slice(0, 50),
            };
          });
        }
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () =>
      setState((s) => {
        const current = s.sessionKey === sessionKey ? s : createSessionState(sessionKey);
        return { ...current, connected: false };
      });

    return () => {
      es.close();
      esRef.current = null;
      fetchRef.current?.abort();
    };
  }, [activeKey, location, startAgent]);

  if (state.sessionKey !== activeKey) {
    return INITIAL_STATE;
  }

  return {
    agentMessage: state.agentMessage,
    agentLog: state.agentLog,
    realCameras: state.realCameras,
    realIncidents: state.realIncidents,
    videoFeeds: state.videoFeeds,
    connected: state.connected,
  };
}
