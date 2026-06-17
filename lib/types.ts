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

export interface IntegrationAgent {
  id: string;
  role: string;
  goal: string;
  status: 'pending' | 'running' | 'complete' | 'error';
}

export interface IntegrationToolCall {
  id: string;
  toolName: string;
  agentRole: string;
  summary: string;
  status: 'started' | 'complete' | 'error';
  timestamp: number;
}

export interface IntegrationProof {
  runId: string;
  orchestrator: 'CrewAI';
  runtime: 'crewai' | 'local-fallback';
  gatewayBaseUrl: string;
  model: string;
  tracingProject: string;
  tracingEnabled: boolean;
  mcpServer: string;
  agents: IntegrationAgent[];
  mcpTools: string[];
  governanceNotes: string[];
  timestamp: number;
}

export interface OperationsReport {
  id: string;
  title: string;
  summary: string;
  controls: string[];
  timestamp: number;
}

export interface AgentCollaborationEvent {
  id: string;
  fromAgent: string;
  toAgent: string;
  action: string;
  message: string;
  status: 'queued' | 'running' | 'complete' | 'blocked';
  timestamp: number;
}

export interface AgentTask {
  id: string;
  owner: string;
  title: string;
  detail: string;
  status: 'queued' | 'running' | 'complete' | 'blocked';
  timestamp: number;
}

export type AgentAnalysisEventType =
  | 'traffic_collision'
  | 'smoke'
  | 'fire'
  | 'crowd_surge'
  | 'medical_emergency'
  | 'security_concern'
  | 'infrastructure_hazard'
  | 'unknown';

export interface AgentAnalysisOutput {
  id: string;
  runId: string;
  sourceAgent: string;
  cameraId: string;
  cameraName: string;
  eventType: AgentAnalysisEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  riskScore: number;
  evidence: string[];
  explanation: string;
  timestamp: number;
}

export interface IncidentResponsePlan {
  id: string;
  runId: string;
  sourceAgent: string;
  cameraId: string;
  cameraName: string;
  threshold: number;
  riskScore: number;
  responderActionRecommended: boolean;
  incidentTitle: string;
  executiveSummary: string;
  location: string;
  event: string;
  priority: 'none' | 'low' | 'medium' | 'high' | 'critical';
  informationMissing: string[];
  recommendedAction: string;
  estimatedUrgency: string;
  timestamp: number;
}

export type SurveillanceEvent =
  | { type: 'camera_deployed'; camera: CameraStatus }
  | { type: 'camera_status'; cameraId: string; status: CameraStatus['status'] }
  | { type: 'frame_update'; cameraId: string; frameB64: string; detections: Detection[] }
  | { type: 'incident'; incident: Incident }
  | { type: 'hotspots'; hotspots: CrimeHotspot[] }
  | { type: 'cameras_ready'; cameras: Camera[] }
  | { type: 'agent_message'; message: string }
  | { type: 'integration_status'; proof: IntegrationProof }
  | { type: 'mcp_tool_call'; toolCall: IntegrationToolCall }
  | { type: 'operations_report'; report: OperationsReport }
  | { type: 'agent_collaboration'; event: AgentCollaborationEvent }
  | { type: 'agent_task'; task: AgentTask }
  | { type: 'agent_analysis'; analysis: AgentAnalysisOutput }
  | { type: 'incident_response_plan'; plan: IncidentResponsePlan }
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
