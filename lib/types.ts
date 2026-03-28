export interface CrimeHotspot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  crimeTypes: string[];
}

export interface WebcamFeed {
  id: string;
  name: string;
  streamUrl: string;
  lat: number;
  lng: number;
  hotspotId: string;
}

export interface Detection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // x, y, w, h
}

export interface FlaggedFrame {
  captureId: string;
  frameB64: string;
  timestamp: number;
  detections: Detection[];
  isSuspicious: boolean;
}

export interface Incident {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  lat: number;
  lng: number;
  frameB64?: string;
  detections?: Detection[];
}

export interface CameraStatus {
  id: string;
  webcamId: string;
  name: string;
  streamUrl: string;
  lat: number;
  lng: number;
  status: 'connecting' | 'active' | 'error' | 'stopped';
  captureId?: string;
  latestFrameB64?: string;
  latestDetections?: Detection[];
  incidentCount: number;
  lastActivity?: string;
}

export type RiskLevel = 'critical' | 'high' | 'medium';

export interface Camera {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  riskLevel: RiskLevel;
  crimeTypes: string[];
  incidentsLast24h?: number;
  lastIncident?: string;
  streamUrl?: string;
}

export interface AgentEvent {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  severity: RiskLevel;
  description: string;
  detections: string[];
}

export interface CameraLiveState {
  riskLevel: RiskLevel;
  incidentsLast24h: number;
  lastEvent: AgentEvent | null;
  lastIncident: string;
  isLive: boolean;
}

export type SurveillanceEvent =
  | { type: 'camera_deployed'; camera: CameraStatus }
  | { type: 'camera_status'; cameraId: string; status: CameraStatus['status'] }
  | { type: 'frame_update'; cameraId: string; frameB64: string; detections: Detection[] }
  | { type: 'incident'; incident: Incident }
  | { type: 'hotspots'; hotspots: CrimeHotspot[] }
  | { type: 'cameras_ready'; cameras: Camera[] }
  | { type: 'agent_message'; message: string }
  | {
      type: 'videos_ready';
      videos: Array<{
        cameraId: string;
        youtubeUrl: string;
        youtubeVideoId: string;
        title: string;
      }>;
    }
  | {
      type: 'watcher_cycle';
      watcherId: string;
      cameraId: string;
      cameraName: string;
      summary: string;
      iteration: number;
    }
  | {
      type: 'watcher_terminated';
      watcherId: string;
      cameraId: string;
      cameraName: string;
      reason: string;
      willRestart: boolean;
    };
