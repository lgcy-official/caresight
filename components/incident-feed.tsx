'use client';

import { useState, useCallback } from 'react';
import type { AgentEvent } from '@/hooks/use-mock-agent-events';
import type { RealIncident } from '@/hooks/use-agent-sse';
import type { RiskLevel, Camera } from '@/lib/types';
import { IncidentDetailModal } from './incident-detail-modal';

type IncidentSeverity = RiskLevel | 'low';

export interface NormalizedIncident {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: number;
  severity: IncidentSeverity;
  description: string;
  detections: string[];
  frameB64?: string;
  lat?: number;
  lng?: number;
  isReal: boolean;
}

const SEV_BADGE: Record<IncidentSeverity, string> = {
  critical: 'bg-red-950 text-red-400 border-red-800',
  high: 'bg-orange-950 text-orange-400 border-orange-800',
  medium: 'bg-yellow-950 text-yellow-500 border-yellow-800',
  low: 'bg-gray-800 text-gray-400 border-gray-600',
};
const SEV_LABEL: Record<IncidentSeverity, string> = {
  critical: 'CRITICAL', high: 'HIGH', medium: 'MED', low: 'LOW',
};
const SEV_BAR: Record<IncidentSeverity, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-gray-500',
};

export function FramePlaceholder({ severity }: { severity: IncidentSeverity }) {
  const color = severity === 'critical' ? '#ef4444' : severity === 'high' ? '#f97316' : '#eab308';
  return (
    <div
      className="w-full aspect-video bg-gray-950 relative flex items-center justify-center overflow-hidden"
      style={{ border: `1px solid ${color}22` }}
    >
      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
      }} />
      {/* Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-10" style={{
        backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
        backgroundSize: '20px 20px',
      }} />
      <div className="flex flex-col items-center gap-1 z-10">
        <svg className="w-6 h-6 opacity-30" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
        </svg>
        <span className="text-[10px] font-mono opacity-30" style={{ color }}>NO FRAME</span>
      </div>
      {/* Corner brackets */}
      <div className="absolute top-1.5 left-1.5 w-4 h-4 border-l border-t opacity-40" style={{ borderColor: color }} />
      <div className="absolute top-1.5 right-1.5 w-4 h-4 border-r border-t opacity-40" style={{ borderColor: color }} />
      <div className="absolute bottom-1.5 left-1.5 w-4 h-4 border-l border-b opacity-40" style={{ borderColor: color }} />
      <div className="absolute bottom-1.5 right-1.5 w-4 h-4 border-r border-b opacity-40" style={{ borderColor: color }} />
    </div>
  );
}

function IncidentCard({ incident, onClick }: { incident: NormalizedIncident; onClick: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(incident.timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <div className="border border-white/8 rounded-xl overflow-hidden bg-gray-950/80 hover:border-white/15 transition-colors cursor-pointer" onClick={onClick}>
      {/* Severity bar */}
      <div className={`h-0.5 w-full ${SEV_BAR[incident.severity]}`} />

      {/* Frame */}
      {incident.frameB64 ? (
        <img
          src={`data:image/jpeg;base64,${incident.frameB64}`}
          alt="Incident frame"
          className="w-full aspect-video object-cover"
        />
      ) : (
        <FramePlaceholder severity={incident.severity} />
      )}

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-medium text-gray-200 truncate block">{incident.cameraName}</span>
            {incident.lat !== undefined && incident.lng !== undefined && (
              <span className="text-[10px] text-gray-600 font-mono">
                {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${SEV_BADGE[incident.severity]}`}>
              {SEV_LABEL[incident.severity]}
            </span>
            {incident.isReal && (
              <span className="text-[9px] font-mono text-blue-400/60 px-1 py-0.5 rounded bg-blue-950/40 border border-blue-900/40">LIVE</span>
            )}
          </div>
        </div>

        {/* Description */}
        <p
          className={`text-[11px] text-gray-400 leading-relaxed cursor-pointer ${expanded ? '' : 'line-clamp-2'}`}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        >
          {incident.description}
        </p>

        {/* Detections */}
        {incident.detections.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {incident.detections.map((d) => (
              <span key={d} className="text-[9px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded font-mono">{d}</span>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <p className="text-[10px] text-gray-600 font-mono">{time}</p>
      </div>
    </div>
  );
}

interface Props {
  mockEvents: AgentEvent[];
  realIncidents: RealIncident[];
  cameras: Camera[];
}

export function IncidentFeed({ mockEvents, realIncidents, cameras }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<NormalizedIncident | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const handleDismiss = useCallback(() => {
    if (selectedIncident) {
      setDismissedIds((prev) => new Set(prev).add(selectedIncident.id));
      setSelectedIncident(null);
    }
  }, [selectedIncident]);

  // Merge and normalize
  const normalized: NormalizedIncident[] = [
    ...realIncidents.map((r): NormalizedIncident => ({
      id: r.id,
      cameraId: r.cameraId,
      cameraName: r.cameraName,
      timestamp: r.timestamp,
      severity: r.severity,
      description: r.description,
      detections: r.detections,
      frameB64: r.frameB64,
      lat: r.lat,
      lng: r.lng,
      isReal: true,
    })),
    ...mockEvents.map((e): NormalizedIncident => {
      const cam = cameras.find((c) => c.id === e.cameraId);
      return {
        id: e.id,
        cameraId: e.cameraId,
        cameraName: e.cameraName,
        timestamp: e.timestamp,
        severity: e.severity,
        description: e.description,
        detections: e.detections,
        lat: cam?.lat,
        lng: cam?.lng,
        isReal: false,
      };
    }),
  ].sort((a, b) => b.timestamp - a.timestamp)
   .filter((inc, idx, arr) => arr.findIndex(i => i.id === inc.id) === idx)
   .filter((inc) => !dismissedIds.has(inc.id))
   .slice(0, 50);

  const count = normalized.length;
  const criticalCount = normalized.filter((i) => i.severity === 'critical').length;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 group"
        title={open ? 'Hide incident feed' : 'Show incident feed'}
      >
        <div className="relative bg-black/60 backdrop-blur-sm border border-white/10 rounded-xl px-2.5 py-2 hover:border-white/20 transition-colors">
          <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-200 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {count > 0 && (
            <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${criticalCount > 0 ? 'bg-red-500 text-white' : 'bg-gray-600 text-gray-200'}`}>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </div>
        <span className="text-[9px] text-gray-600 font-mono tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity">
          {open ? 'hide' : 'feed'}
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute left-14 top-0 bottom-0 z-30 flex flex-col w-72 py-4 gap-2 pointer-events-none">
          <div className="flex-1 overflow-hidden flex flex-col pointer-events-auto">
            <div className="bg-black/60 backdrop-blur-md border border-white/8 rounded-2xl flex flex-col h-full overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${criticalCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-gray-600'}`} />
                  <span className="text-[11px] font-semibold text-gray-300 tracking-wider uppercase">Incidents</span>
                  {count > 0 && (
                    <span className="text-[10px] text-gray-600">{count}</span>
                  )}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-5 h-5 rounded-full bg-white/5 hover:bg-white/15 text-gray-500 hover:text-white flex items-center justify-center text-[10px] transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Incident list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {count === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2">
                    <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-[11px] text-gray-700">No incidents yet</p>
                  </div>
                ) : (
                  normalized.map((inc) => <IncidentCard key={inc.id} incident={inc} onClick={() => setSelectedIncident(inc)} />)
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedIncident && (
        <IncidentDetailModal
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onDismiss={handleDismiss}
        />
      )}
    </>
  );
}
