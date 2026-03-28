import type { GeoLocation } from '@/components/location-search';

export type RiskLevel = 'critical' | 'high' | 'medium';

export interface MockCamera {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  riskLevel: RiskLevel;
  crimeTypes: string[];
  incidentsLast24h: number;
  lastIncident: string; // relative time string
  isLive: boolean;
  feedUrl: string;
}

const RISK_TEMPLATES: {
  riskLevel: RiskLevel;
  crimeTypes: string[];
  incidentRange: [number, number];
}[] = [
  { riskLevel: 'critical', crimeTypes: ['assault', 'robbery', 'weapons'], incidentRange: [8, 18] },
  { riskLevel: 'critical', crimeTypes: ['drug activity', 'robbery'], incidentRange: [6, 14] },
  { riskLevel: 'high', crimeTypes: ['theft', 'assault'], incidentRange: [4, 9] },
  { riskLevel: 'high', crimeTypes: ['vandalism', 'robbery'], incidentRange: [3, 8] },
  { riskLevel: 'high', crimeTypes: ['theft', 'drug activity'], incidentRange: [4, 7] },
  { riskLevel: 'medium', crimeTypes: ['vandalism', 'theft'], incidentRange: [1, 4] },
  { riskLevel: 'medium', crimeTypes: ['trespassing', 'theft'], incidentRange: [1, 3] },
  { riskLevel: 'medium', crimeTypes: ['suspicious activity'], incidentRange: [1, 3] },
];

const LAST_INCIDENT_OPTIONS = [
  '4 min ago', '11 min ago', '23 min ago', '38 min ago',
  '1 hr ago', '2 hrs ago', '3 hrs ago', '5 hrs ago',
];

const STREET_TYPES = ['St', 'Ave', 'Blvd', 'Dr', 'Rd', 'Way', 'Pl'];
const DIRECTIONS = ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'];

// Deterministic pseudo-random from a seed string
function seededRand(seed: string, index: number): number {
  let h = index * 2654435761;
  for (let i = 0; i < seed.length; i++) h ^= seed.charCodeAt(i) * (i + 1) * 1234567;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return Math.abs(h) / 2147483647;
}

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length)];
}

export function generateMockCameras(location: GeoLocation): MockCamera[] {
  const seed = location.name;
  const cameras: MockCamera[] = [];

  for (let i = 0; i < RISK_TEMPLATES.length; i++) {
    const template = RISK_TEMPLATES[i];
    const r = (n: number) => seededRand(seed, i * 20 + n);

    // Scatter within ~1.5km radius
    const angle = r(0) * 2 * Math.PI;
    const dist = 0.003 + r(1) * 0.012; // ~300m–1.5km in degrees
    const lat = location.lat + Math.sin(angle) * dist;
    const lng = location.lng + Math.cos(angle) * dist * 1.3;

    const streetNum = Math.floor(r(2) * 1800) + 100;
    const streetType = pick(STREET_TYPES, r(3));
    const dir = pick(DIRECTIONS, r(4));
    const address = `${streetNum} ${dir} ${pick(['Main', 'Oak', 'Park', 'Market', 'Mission', 'Valencia', 'Castro', 'Geary', 'Haight', 'Fillmore', 'Polk', 'Larkin', 'Turk', 'Eddy'], r(5))} ${streetType}`;

    const incidents = Math.floor(
      r(6) * (template.incidentRange[1] - template.incidentRange[0]) + template.incidentRange[0]
    );

    cameras.push({
      id: `cam-${seed.slice(0, 4)}-${i}`,
      name: `Camera #${Math.floor(r(7) * 900) + 100}`,
      address,
      lat,
      lng,
      riskLevel: template.riskLevel,
      crimeTypes: template.crimeTypes,
      incidentsLast24h: incidents,
      lastIncident: pick(LAST_INCIDENT_OPTIONS, r(8)),
      isLive: r(9) > 0.15,
      feedUrl: '',
    });
  }

  // Sort: critical first, then high, then medium
  const order: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2 };
  return cameras.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]);
}
