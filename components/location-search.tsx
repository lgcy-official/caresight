'use client';

import { useState } from 'react';

export interface GeoLocation {
  lat: number;
  lng: number;
  name: string;
}

interface Props {
  onResults: (results: GeoLocation[]) => void;
  onLocationSelect: (location: GeoLocation) => void;
  disabled?: boolean;
  agentLoading?: boolean;
}

export function LocationSearch({ onResults, onLocationSelect, disabled, agentLoading }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const showSpinner = loading || agentLoading;

  async function executeSearch() {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: trimmed, format: 'json', limit: '5', addressdetails: '0' });
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data: { lat: string; lon: string; display_name: string }[] = await res.json();
      onResults(data.map((r) => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        name: r.display_name.split(',').slice(0, 2).join(',').trim(),
      })));
    } catch {
      onResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  }

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        <svg
          className="absolute left-3.5 w-4 h-4 text-gray-500 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search a city or address..."
          disabled={disabled}
          className="w-full bg-black/30 backdrop-blur-md border border-white/10 hover:border-white/20 text-gray-100 placeholder-gray-500 rounded-xl pl-10 pr-4 py-3.5 text-sm outline-none focus:border-white/30 focus:bg-black/40 disabled:opacity-40 shadow-xl transition-all cursor-text"
        />
        {showSpinner && (
          <div className="absolute right-3.5">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
