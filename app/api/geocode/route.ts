interface GeocodeResult {
  lat: number;
  lng: number;
  name: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

const FALLBACK_LOCATIONS: GeocodeResult[] = [
  { name: 'San Francisco, CA', lat: 37.7749, lng: -122.4194 },
  { name: 'New York, NY', lat: 40.7128, lng: -74.006 },
  { name: 'Los Angeles, CA', lat: 34.0522, lng: -118.2437 },
  { name: 'Chicago, IL', lat: 41.8781, lng: -87.6298 },
  { name: 'Seattle, WA', lat: 47.6062, lng: -122.3321 },
  { name: 'Boston, MA', lat: 42.3601, lng: -71.0589 },
  { name: 'Miami, FL', lat: 25.7617, lng: -80.1918 },
  { name: 'Austin, TX', lat: 30.2672, lng: -97.7431 },
  { name: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
  { name: 'Las Vegas, NV', lat: 36.1716, lng: -115.1391 },
  { name: 'London, UK', lat: 51.5072, lng: -0.1276 },
  { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
  { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
  { name: 'Amsterdam, Netherlands', lat: 52.3676, lng: 4.9041 },
];

function fallbackSearch(query: string): GeocodeResult[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];
  return FALLBACK_LOCATIONS.filter((location) =>
    location.name.toLowerCase().includes(normalized),
  ).slice(0, 5);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2) return Response.json({ results: [] });

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
    addressdetails: '0',
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'CareSight AI local development',
      },
      cache: 'no-store',
    });

    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

    const data = (await response.json()) as NominatimResult[];
    const results = data
      .map((result): GeocodeResult => ({
        lat: Number.parseFloat(result.lat),
        lng: Number.parseFloat(result.lon),
        name: result.display_name.split(',').slice(0, 2).join(',').trim(),
      }))
      .filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lng));

    return Response.json({ results: results.length > 0 ? results : fallbackSearch(query) });
  } catch {
    return Response.json({ results: fallbackSearch(query) });
  }
}
