'use client';

import { useState } from 'react';

export interface GeoLocation {
  lat: number;
  lng: number;
  name: string;
}

interface Props {
  onResults: (results: GeoLocation[]) => void;
  disabled?: boolean;
  agentLoading?: boolean;
}

export function LocationSearch({ onResults, disabled, agentLoading }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const showSpinner = loading || agentLoading;

  async function executeSearch() {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ q: trimmed });
      const res = await fetch(`/api/geocode?${params}`);
      const data = (await res.json()) as { results?: GeoLocation[] };
      const results = data.results ?? [];
      if (results.length === 0) {
        setMessage('No location found');
      }
      onResults(results);
    } catch {
      setMessage('Search failed');
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
      <form
        className="relative flex items-center"
        onSubmit={(e) => {
          e.preventDefault();
          executeSearch();
        }}
      >
        <svg
          className="absolute left-4 h-5 w-5 text-gray-500 pointer-events-none"
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
          className="w-full bg-black/30 backdrop-blur-md border border-white/10 hover:border-white/20 text-gray-100 placeholder-gray-500 rounded-2xl pl-12 pr-16 py-4 text-base outline-none focus:border-white/30 focus:bg-black/40 disabled:opacity-40 shadow-xl transition-all cursor-text"
        />
        {showSpinner && (
          <div className="absolute right-3.5">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!showSpinner && (
          <button
            type="submit"
            disabled={disabled || query.trim().length < 2}
            className="absolute right-2.5 flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200 disabled:pointer-events-none disabled:opacity-30"
            title="Search"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </button>
        )}
      </form>
      {message && (
        <p className="absolute left-3.5 top-full mt-2 text-[11px] text-red-300/80">
          {message}
        </p>
      )}
    </div>
  );
}
