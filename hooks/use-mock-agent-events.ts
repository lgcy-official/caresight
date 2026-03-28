'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MockCamera, RiskLevel } from '@/data/mock-cameras';

export interface AgentEvent {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  severity: RiskLevel;
  description: string;
  detections: string[];
}

// Templated events by severity
const EVENT_TEMPLATES: Record<RiskLevel, { descriptions: string[]; detections: string[][] }> = {
  critical: {
    descriptions: [
      'Weapon-like object detected near intersection',
      'Altercation in progress — multiple subjects',
      'Individual down on pavement, not moving',
      'Crowd surge detected, possible stampede',
      'Vehicle mounted curb, occupants fled on foot',
      'Armed robbery in progress at storefront',
    ],
    detections: [
      ['person x4', 'knife', 'aggressive posture'],
      ['person x6', 'running', 'crowd'],
      ['person x2', 'weapon', 'vehicle'],
      ['person x12', 'crowd surge'],
      ['vehicle', 'person x3', 'running'],
    ],
  },
  high: {
    descriptions: [
      'Group loitering — possible drug activity',
      'Aggressive panhandling reported at corner',
      'Smashed window detected at storefront',
      'Running detected away from collision site',
      'Unattended bag flagged near entrance',
      'Crowd density spike in pedestrian zone',
    ],
    detections: [
      ['person x5', 'loitering'],
      ['person x2', 'confrontation'],
      ['broken glass', 'person x1'],
      ['person x3', 'running', 'backpack'],
      ['unattended object', 'person x8'],
    ],
  },
  medium: {
    descriptions: [
      'Suspicious individual circling parked vehicles',
      'Minor traffic altercation, no injuries apparent',
      'Graffiti activity detected on wall surface',
      'Overnight encampment forming on sidewalk',
      'Bicycle theft attempt flagged by YOLO',
    ],
    detections: [
      ['person x1', 'vehicle x3', 'slow movement'],
      ['vehicle x2', 'person x2'],
      ['person x1', 'spray can'],
      ['person x4', 'tent', 'bags'],
      ['bicycle', 'person x2', 'tools'],
    ],
  },
};

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateEvent(camera: MockCamera): AgentEvent {
  // Bias toward the camera's existing risk level, with some variance
  const roll = Math.random();
  let severity: RiskLevel;
  if (camera.riskLevel === 'critical') {
    severity = roll < 0.6 ? 'critical' : roll < 0.9 ? 'high' : 'medium';
  } else if (camera.riskLevel === 'high') {
    severity = roll < 0.2 ? 'critical' : roll < 0.75 ? 'high' : 'medium';
  } else {
    severity = roll < 0.05 ? 'critical' : roll < 0.35 ? 'high' : 'medium';
  }

  const template = EVENT_TEMPLATES[severity];
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    cameraId: camera.id,
    cameraName: camera.name,
    timestamp: Date.now(),
    severity,
    description: randomPick(template.descriptions),
    detections: randomPick(template.detections),
  };
}

export interface CameraLiveState {
  riskLevel: RiskLevel;
  incidentsLast24h: number;
  lastEvent: AgentEvent | null;
  lastIncident: string;
  isLive: boolean;
}

interface MockAgentState {
  sessionKey: string;
  liveStates: Record<string, CameraLiveState>;
  recentEvents: AgentEvent[];
}

function getSessionKey(cameras: MockCamera[]): string {
  return cameras.map((camera) => `${camera.id}:${camera.riskLevel}:${camera.incidentsLast24h}`).join('|');
}

function buildInitialLiveStates(cameras: MockCamera[]): Record<string, CameraLiveState> {
  const initial: Record<string, CameraLiveState> = {};
  cameras.forEach((camera) => {
    initial[camera.id] = {
      riskLevel: camera.riskLevel,
      incidentsLast24h: camera.incidentsLast24h,
      lastEvent: null,
      lastIncident: camera.lastIncident,
      isLive: camera.isLive,
    };
  });
  return initial;
}

export function useMockAgentEvents(cameras: MockCamera[], active: boolean) {
  const sessionKey = useMemo(() => getSessionKey(cameras), [cameras]);
  const initialLiveStates = useMemo(() => buildInitialLiveStates(cameras), [cameras]);
  const [state, setState] = useState<MockAgentState>({
    sessionKey,
    liveStates: initialLiveStates,
    recentEvents: [],
  });
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Fire events while active
  useEffect(() => {
    if (!active || cameras.length === 0) return;

    function scheduleNext(camera: MockCamera) {
      // Higher-risk cameras report more frequently
      const baseMs = camera.riskLevel === 'critical' ? 4000
        : camera.riskLevel === 'high' ? 7000
        : 12000;
      const jitter = Math.random() * baseMs;
      const delay = baseMs + jitter;

      const t = setTimeout(() => {
        const event = generateEvent(camera);

        setState((prev) => {
          const current =
            prev.sessionKey === sessionKey
              ? prev
              : { sessionKey, liveStates: initialLiveStates, recentEvents: [] };
          const existing = current.liveStates[camera.id];
          if (!existing) return current;
          return {
            ...current,
            liveStates: {
              ...current.liveStates,
              [camera.id]: {
                ...existing,
                riskLevel: event.severity,
                incidentsLast24h: existing.incidentsLast24h + (event.severity !== 'medium' ? 1 : 0),
                lastEvent: event,
                lastIncident: 'just now',
              },
            },
            recentEvents: [event, ...current.recentEvents].slice(0, 30),
          };
        });

        // Schedule the next event for this camera
        scheduleNext(camera);
      }, delay);

      timersRef.current.push(t);
    }

    // Stagger initial events so they don't all fire at once
    cameras.forEach((cam, i) => {
      const t = setTimeout(() => scheduleNext(cam), i * 600 + Math.random() * 1000);
      timersRef.current.push(t);
    });

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [active, cameras, initialLiveStates, sessionKey]);

  function triggerEvent(cameraId: string) {
    const camera = cameras.find((c) => c.id === cameraId);
    if (!camera) return;
    const event = generateEvent(camera);
    setState((prev) => {
      const current =
        prev.sessionKey === sessionKey
          ? prev
          : { sessionKey, liveStates: initialLiveStates, recentEvents: [] };
      const existing = current.liveStates[cameraId];
      if (!existing) return current;
      return {
        ...current,
        liveStates: {
          ...current.liveStates,
          [cameraId]: {
            ...existing,
            riskLevel: event.severity,
            incidentsLast24h: existing.incidentsLast24h + 1,
            lastEvent: event,
            lastIncident: 'just now',
          },
        },
        recentEvents: [event, ...current.recentEvents].slice(0, 30),
      };
    });
  }

  const currentState =
    state.sessionKey === sessionKey
      ? state
      : { sessionKey, liveStates: initialLiveStates, recentEvents: [] };

  return {
    liveStates: active ? currentState.liveStates : initialLiveStates,
    recentEvents: active ? currentState.recentEvents : [],
    triggerEvent,
  };
}
