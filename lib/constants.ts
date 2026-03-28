export const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8001';
export const PYTHON_SERVICE_ENABLED = process.env.PYTHON_SERVICE_ENABLED !== 'false';

export const MAX_CONCURRENT_STREAMS = 4;
export const YOLO_POLL_INTERVAL_MS = 2000;
export const SUB_AGENT_MAX_STEPS = 50;

export const CARTO_DARK_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const SF_CENTER: [number, number] = [-122.4194, 37.7749];
export const SF_ZOOM = 12;

export const GLOBE_INITIAL_CENTER: [number, number] = [0, 20];
export const GLOBE_ZOOM = 2;
export const GLOBE_SPIN_SPEED = 0.1;

export const RISK_COLORS: Record<string, string> = {
  low: '#facc15',
  medium: '#f97316',
  high: '#ef4444',
  critical: '#dc2626',
};
