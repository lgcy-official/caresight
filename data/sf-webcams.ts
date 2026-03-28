import type { WebcamFeed } from '@/lib/types';
import type { MockCamera, RiskLevel } from '@/data/mock-cameras';

// Static registry of publicly available San Francisco webcam streams
export const SF_WEBCAMS: WebcamFeed[] = [
  {
    id: 'sf-market-powell',
    name: 'Market St & Powell St',
    streamUrl: 'https://www.youtube.com/watch?v=ydYDqZQpim8',
    lat: 37.7841,
    lng: -122.4078,
    hotspotId: 'tenderloin',
  },
  {
    id: 'sf-fishermans-wharf',
    name: "Fisherman's Wharf",
    streamUrl: 'https://www.youtube.com/watch?v=f6zJwAmZHbI',
    lat: 37.8080,
    lng: -122.4177,
    hotspotId: 'fishermans-wharf',
  },
  {
    id: 'sf-union-square',
    name: 'Union Square',
    streamUrl: 'https://www.youtube.com/watch?v=_Pjc9A8GHKQ',
    lat: 37.7880,
    lng: -122.4074,
    hotspotId: 'union-square',
  },
  {
    id: 'sf-civic-center',
    name: 'Civic Center Plaza',
    streamUrl: 'https://www.youtube.com/watch?v=1EiC9bvVGnk',
    lat: 37.7793,
    lng: -122.4193,
    hotspotId: 'civic-center',
  },
  {
    id: 'sf-mission-24th',
    name: 'Mission & 24th St',
    streamUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
    lat: 37.7524,
    lng: -122.4183,
    hotspotId: 'mission',
  },
  {
    id: 'sf-soma',
    name: 'SoMa / 6th & Market',
    streamUrl: 'https://www.youtube.com/watch?v=86YLFOog4GM',
    lat: 37.7822,
    lng: -122.4108,
    hotspotId: 'soma',
  },
];

// Risk metadata per webcam for UI display
const WEBCAM_META: Record<string, { riskLevel: RiskLevel; crimeTypes: string[]; incidentsLast24h: number; lastIncident: string }> = {
  'sf-market-powell':   { riskLevel: 'critical', crimeTypes: ['theft', 'assault', 'drug activity'], incidentsLast24h: 14, lastIncident: '8 min ago' },
  'sf-civic-center':    { riskLevel: 'critical', crimeTypes: ['drug activity', 'assault', 'robbery'], incidentsLast24h: 11, lastIncident: '3 min ago' },
  'sf-soma':            { riskLevel: 'high',     crimeTypes: ['theft', 'robbery', 'drug activity'], incidentsLast24h: 7,  lastIncident: '22 min ago' },
  'sf-union-square':    { riskLevel: 'high',     crimeTypes: ['theft', 'robbery', 'assault'], incidentsLast24h: 6,  lastIncident: '41 min ago' },
  'sf-mission-24th':    { riskLevel: 'high',     crimeTypes: ['theft', 'vandalism', 'assault'], incidentsLast24h: 5,  lastIncident: '1 hr ago' },
  'sf-fishermans-wharf':{ riskLevel: 'medium',   crimeTypes: ['theft', 'pickpocketing', 'vandalism'], incidentsLast24h: 2,  lastIncident: '3 hrs ago' },
};

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Returns all SF webcams as MockCamera objects, sorted by distance from the given coordinates. */
export function getWebcamsNear(lat: number, lng: number): MockCamera[] {
  return SF_WEBCAMS.map((w) => {
    const meta = WEBCAM_META[w.id] ?? {
      riskLevel: 'medium' as RiskLevel,
      crimeTypes: ['suspicious activity'],
      incidentsLast24h: 1,
      lastIncident: 'unknown',
    };
    return {
      id: w.id,
      name: w.name,
      address: w.name, // webcam name is already a street address
      lat: w.lat,
      lng: w.lng,
      riskLevel: meta.riskLevel,
      crimeTypes: meta.crimeTypes,
      incidentsLast24h: meta.incidentsLast24h,
      lastIncident: meta.lastIncident,
      isLive: true,
      feedUrl: w.streamUrl,
      _distanceKm: distanceKm(lat, lng, w.lat, w.lng),
    };
  })
    .sort((a, b) => a._distanceKm - b._distanceKm)
    .map(({ _distanceKm: _, ...cam }) => cam);
}

export function getWebcamsForHotspot(hotspotId: string): WebcamFeed[] {
  return SF_WEBCAMS.filter((w) => w.hotspotId === hotspotId);
}

export function getWebcamById(id: string): WebcamFeed | undefined {
  return SF_WEBCAMS.find((w) => w.id === id);
}
