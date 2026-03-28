'use client';

import { useEffect, useReducer } from 'react';
import type { CameraStatus, CrimeHotspot, Incident, SurveillanceEvent, Detection } from '@/lib/types';

interface SurveillanceState {
  cameras: Record<string, CameraStatus>;
  hotspots: CrimeHotspot[];
  incidents: Incident[];
  connected: boolean;
}

type Action =
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECTED' }
  | { type: 'EVENT'; event: SurveillanceEvent };

function reducer(state: SurveillanceState, action: Action): SurveillanceState {
  switch (action.type) {
    case 'CONNECTED':
      return { ...state, connected: true };
    case 'DISCONNECTED':
      return { ...state, connected: false };
    case 'EVENT': {
      const event = action.event;
      switch (event.type) {
        case 'hotspots':
          return { ...state, hotspots: event.hotspots };
        case 'camera_deployed':
          return {
            ...state,
            cameras: { ...state.cameras, [event.camera.id]: event.camera },
          };
        case 'camera_status':
          return {
            ...state,
            cameras: {
              ...state.cameras,
              [event.cameraId]: {
                ...(state.cameras[event.cameraId] ?? {}),
                status: event.status,
              } as CameraStatus,
            },
          };
        case 'frame_update':
          return {
            ...state,
            cameras: {
              ...state.cameras,
              [event.cameraId]: {
                ...(state.cameras[event.cameraId] ?? {}),
                latestFrameB64: event.frameB64,
                latestDetections: event.detections as Detection[],
              } as CameraStatus,
            },
          };
        case 'incident': {
          // Skip duplicate incidents
          if (state.incidents.some(inc => inc.id === event.incident.id)) return state;
          const updated = {
            ...state,
            incidents: [event.incident, ...state.incidents].slice(0, 50),
          };
          // Increment camera incident count
          const cam = state.cameras[event.incident.cameraId];
          if (cam) {
            updated.cameras = {
              ...updated.cameras,
              [event.incident.cameraId]: {
                ...cam,
                incidentCount: cam.incidentCount + 1,
                lastActivity: event.incident.description,
              },
            };
          }
          return updated;
        }
        default:
          return state;
      }
    }
  }
}

const initialState: SurveillanceState = {
  cameras: {},
  hotspots: [],
  incidents: [],
  connected: false,
};

export function useSurveillanceStream() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const es = new EventSource('/api/surveillance/stream');
    es.onopen = () => dispatch({ type: 'CONNECTED' });
    es.onmessage = (e) => {
      try {
        const event: SurveillanceEvent = JSON.parse(e.data);
        dispatch({ type: 'EVENT', event });
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => dispatch({ type: 'DISCONNECTED' });
    return () => es.close();
  }, []);

  return state;
}
