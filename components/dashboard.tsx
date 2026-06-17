'use client';

import { useMemo, useState } from 'react';
import { LocationSearch, type GeoLocation } from './location-search';
import { MockCctvFeed } from './mock-cctv-feed';
import type { Camera, RiskLevel } from '@/lib/types';
import { SurveillanceMap, type CameraContextMenu } from './surveillance-map';
import { useAgentSSE } from '@/hooks/use-agent-sse';
import { IncidentFeed } from './incident-feed';
import { AgentConsole } from './agent-console';

const RISK_LABEL: Record<RiskLevel, string> = { critical: 'CRITICAL', high: 'HIGH', medium: 'MED' };
const RISK_BADGE: Record<RiskLevel, string> = {
  critical: 'bg-red-950 text-red-400 border-red-800',
  high: 'bg-orange-950 text-orange-400 border-orange-800',
  medium: 'bg-yellow-950 text-yellow-500 border-yellow-800',
};
const RISK_DOT: Record<RiskLevel, string> = {
  critical: 'bg-red-500 animate-pulse',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
};

const DISABLED_EXTERNAL_VIDEO_PREFIXES = ['care-castro-1', 'care-sfo-airport', 'care-academy'];

function externalVideoEnabled(cameraId: string) {
  return !DISABLED_EXTERNAL_VIDEO_PREFIXES.some((prefix) => cameraId.startsWith(prefix));
}

export function Dashboard() {
  const [selectedLocation, setSelectedLocation] = useState<GeoLocation | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [agentLocation, setAgentLocation] = useState<GeoLocation | null>(null);
  const {
    agentMessage,
    agentLog,
    realCameras,
    realIncidents,
    videoFeeds,
    collaborations,
    agentTasks,
    analyses,
    responsePlans,
    connected,
  } = useAgentSSE(
    agentLocation,
    !!agentLocation,
  );

  // Cameras come exclusively from the agent
  const cameras = useMemo<Camera[]>(() => realCameras ?? [], [realCameras]);

  // Build live states from real incidents
  interface LiveEvent {
    id: string;
    cameraId: string;
    cameraName: string;
    timestamp: number;
    severity: RiskLevel;
    description: string;
    detections: string[];
  }

  const liveStates = useMemo(() => {
    const states: Record<string, { riskLevel: RiskLevel; incidentsLast24h: number; lastEvent: LiveEvent | null; lastIncident: string }> = {};
    for (const cam of cameras) {
      const camIncidents = realIncidents.filter((i) => i.cameraId === cam.id);
      const lastInc = camIncidents[0];
      states[cam.id] = {
        riskLevel: lastInc ? (lastInc.severity as RiskLevel) : cam.riskLevel,
        incidentsLast24h: camIncidents.length,
        lastEvent: lastInc
          ? {
              id: lastInc.id,
              cameraId: lastInc.cameraId,
              cameraName: lastInc.cameraName,
              timestamp: lastInc.timestamp,
              severity: lastInc.severity as RiskLevel,
              description: lastInc.description,
              detections: lastInc.detections,
            }
          : null,
        lastIncident: lastInc ? 'just now' : cam.lastIncident ?? '-',
      };
    }
    return states;
  }, [cameras, realIncidents]);

  const recentEvents = useMemo(() => {
    return realIncidents.map((inc) => ({
      id: inc.id,
      cameraId: inc.cameraId,
      cameraName: inc.cameraName,
      timestamp: inc.timestamp,
      severity: inc.severity as RiskLevel,
      description: inc.description,
      detections: inc.detections,
    }));
  }, [realIncidents]);

  // Search bar triggers the agent
  function handleResults(results: GeoLocation[]) {
    if (results.length === 0) {
      setSelectedLocation(null);
      setSelectedCameraId(null);
      setAgentLocation(null);
      return;
    }
    const loc = results[0];
    setSelectedLocation(loc);
    setSelectedCameraId(null);
    setAgentLocation(loc);
  }

  function handleCameraClick(cameraId: string) {
    setSelectedCameraId((prev) => (prev === cameraId ? null : cameraId));
  }

  // Map click only pans the view — does NOT trigger the agent
  function handleMapClick(location: GeoLocation) {
    setSelectedLocation(location);
    setSelectedCameraId(null);
  }

  const [contextMenu, setContextMenu] = useState<CameraContextMenu | null>(null);

  function handleContextMenu(menu: CameraContextMenu | null) {
    setContextMenu(menu);
  }

  function handleContextSelect(cameraId: string) {
    setSelectedCameraId(cameraId);
    setContextMenu(null);
  }

  const selectedCamera = cameras.find((c) => c.id === selectedCameraId) ?? null;
  const [expandedCameraId, setExpandedCameraId] = useState<string | null>(null);
  const eventsExpanded = selectedCameraId !== null && expandedCameraId === selectedCameraId;

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-gray-950"
      onClick={() => contextMenu && setContextMenu(null)}
      onContextMenu={(e) => { if (!contextMenu) return; e.preventDefault(); setContextMenu(null); }}
    >

      {/* ── Map ── */}
      <div className="absolute inset-0">
        <SurveillanceMap
          cameras={cameras}
          selectedCameraId={selectedCameraId}
          selectedLocation={selectedLocation}
          onMapClick={handleMapClick}
          onCameraClick={handleCameraClick}
          onCameraContextMenu={handleContextMenu}
        />
      </div>

      {/* ── Top bar ── */}
      <div className="absolute inset-x-0 top-0 z-20 flex justify-center pt-6 px-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 select-none opacity-50 flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
            </svg>
            <span className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase">CareSight AI</span>
          </div>
          <div className="w-[min(560px,calc(100vw-2rem))]">
            <LocationSearch
              onResults={handleResults}
              agentLoading={!!agentLocation && cameras.length === 0}
            />
          </div>
        </div>
      </div>

      {/* ── Camera card ── */}
      {selectedCamera && (() => {
        const live = liveStates[selectedCamera.id];
        const risk = live?.riskLevel ?? selectedCamera.riskLevel;
        const flashKey = `${selectedCamera.id}:${live?.lastEvent?.id ?? 'idle'}`;
        const videoFeed = externalVideoEnabled(selectedCamera.id) ? videoFeeds[selectedCamera.id] : null;
        return (
          <div
            key={flashKey}
            className={`absolute right-4 top-24 z-30 w-[min(560px,calc(100vw-2rem))] max-h-[calc(100vh-7rem)] overflow-hidden rounded-2xl border border-white/10 bg-gray-950/95 shadow-2xl backdrop-blur-md ${live?.lastEvent ? 'alert-flash' : ''}`}
          >
            {/* Feed */}
            <div className="w-full aspect-video bg-black relative">
              {videoFeed ? (
                <iframe
                  src={`https://www.youtube.com/embed/${videoFeed.youtubeVideoId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0`}
                  title={videoFeed.title}
                  className="w-full h-full"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              ) : (
                <MockCctvFeed cameraName={selectedCamera.name} cameraId={selectedCamera.id} riskLevel={risk} />
              )}
              {/* Close */}
              <button
                onClick={() => setSelectedCameraId(null)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-gray-400 hover:text-white flex items-center justify-center text-xs transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Info */}
            <div className="max-h-64 space-y-2 overflow-y-auto px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${RISK_DOT[risk]}`} />
                <span className="text-sm font-semibold text-white flex-1 truncate">{selectedCamera.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${RISK_BADGE[risk]}`}>
                  {RISK_LABEL[risk]}
                </span>
              </div>

              <p className="text-xs text-gray-500 truncate">{selectedCamera.address}</p>

              {/* Latest event */}
              {live?.lastEvent ? (
                <div>
                  <p className="text-xs text-gray-300 leading-relaxed">{live.lastEvent.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {live.lastEvent.detections.map((d) => (
                      <span key={d} className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded">{d}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {selectedCamera.crimeTypes.map((t) => (
                    <span key={t} className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              )}

              {/* Stats + expand toggle */}
              <div
                className="flex items-center justify-between pt-1 border-t border-white/5 cursor-pointer select-none"
                onClick={() =>
                  setExpandedCameraId((prev) => (prev === selectedCamera.id ? null : selectedCamera.id))
                }
              >
                <span className="text-xs text-gray-500">
                  <span className="text-gray-200 font-semibold">{live?.incidentsLast24h ?? selectedCamera.incidentsLast24h}</span> incidents today
                </span>
                <span className="text-[11px] text-gray-500 flex items-center gap-1">
                  {eventsExpanded ? 'hide' : 'events'}
                  <svg className={`w-3 h-3 transition-transform ${eventsExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>

              {/* Event list */}
              {eventsExpanded && (() => {
                const cameraEvents = recentEvents.filter((e) => e.cameraId === selectedCamera.id);
                return (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto -mx-4 px-4 pb-1">
                    {cameraEvents.length === 0 ? (
                      <p className="text-[11px] text-gray-600 text-center py-2">No events yet</p>
                    ) : cameraEvents.map((evt) => (
                      <div key={evt.id} className="flex gap-2 items-start">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${RISK_DOT[evt.severity]}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-gray-300 leading-snug">{evt.description}</p>
                          <p className="text-[10px] text-gray-600 mt-0.5">
                            {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      {/* ── Right-click camera picker ── */}
      {contextMenu && (() => {
        const menuCameras = contextMenu.cameraIds
          .map((id) => cameras.find((c) => c.id === id))
          .filter(Boolean) as Camera[];
        if (menuCameras.length === 0) return null;
        return (
          <div
            className="fixed z-50"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="bg-gray-950/95 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl py-1 min-w-[200px]">
              <p className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                Select stream
              </p>
              {menuCameras.map((cam) => {
                const risk = liveStates[cam.id]?.riskLevel ?? cam.riskLevel;
                return (
                  <button
                    key={cam.id}
                    onClick={() => handleContextSelect(cam.id)}
                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/5 transition-colors text-left"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${RISK_DOT[risk]}`} />
                    <span className="text-xs text-gray-200 truncate flex-1">{cam.name}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${RISK_BADGE[risk]}`}>
                      {RISK_LABEL[risk]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Incident feed ── */}
      <IncidentFeed
        mockEvents={recentEvents}
        realIncidents={realIncidents}
        cameras={cameras}
      />

      <AgentConsole
        connected={connected}
        collaborations={collaborations}
        agentTasks={agentTasks}
        analyses={analyses}
        responsePlans={responsePlans}
      />

      {/* ── Agent log ── */}
      {agentLog.length > 0 && (
        <div className="absolute bottom-4 right-4 z-30 w-[min(560px,calc(100vw-2rem))]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/75 shadow-2xl backdrop-blur-md">
            {/* Latest message */}
            <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Agent Log</p>
                <p className="mt-0.5 truncate text-sm text-blue-200/90">{agentMessage}</p>
              </div>
            </div>
            {/* Scrollable log */}
            {agentLog.length > 1 && (
              <div className="max-h-56 space-y-1 overflow-y-auto px-4 py-3">
                {agentLog.slice(1).map((entry, i) => (
                  <p key={i} className="font-mono text-xs leading-relaxed text-gray-500">{entry}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
