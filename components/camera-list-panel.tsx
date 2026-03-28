'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MockCamera, RiskLevel } from '@/data/mock-cameras';
import type { CameraLiveState, AgentEvent } from '@/hooks/use-mock-agent-events';
import { MockCctvFeed } from './mock-cctv-feed';

// Snap heights as vh fractions
const SNAP_POINTS = [0.18, 0.52, 0.82]; // peek, default, expanded
const SNAP_LABELS = ['peek', 'default', 'expanded'] as const;
type SnapPoint = typeof SNAP_LABELS[number];

function nearestSnap(heightFraction: number): number {
  return SNAP_POINTS.reduce((best, snap) =>
    Math.abs(snap - heightFraction) < Math.abs(best - heightFraction) ? snap : best
  );
}

function useBottomSheetDrag(initialSnap: SnapPoint = 'default') {
  const [snap, setSnap] = useState<number>(SNAP_POINTS[SNAP_LABELS.indexOf(initialSnap)]);
  const snapTo = useCallback((point: SnapPoint) => {
    setSnap(SNAP_POINTS[SNAP_LABELS.indexOf(point)]);
  }, []);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0); // px delta during drag
  const [startHeightPx, setStartHeightPx] = useState(0);
  const startYRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
    setStartHeightPx(window.innerHeight * snap);
    setDragging(true);
    setDragOffset(0);
  }, [snap]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const delta = startYRef.current - e.clientY; // positive = dragging up = taller
    setDragOffset(delta);
  }, [dragging]);

  const onPointerUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    const newHeightPx = startHeightPx + dragOffset;
    const newFraction = newHeightPx / window.innerHeight;
    setSnap(nearestSnap(Math.max(SNAP_POINTS[0], Math.min(SNAP_POINTS[SNAP_POINTS.length - 1], newFraction))));
    setDragOffset(0);
  }, [dragging, dragOffset, startHeightPx]);

  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const heightPx = dragging
    ? Math.max(vh * SNAP_POINTS[0], Math.min(vh * SNAP_POINTS[SNAP_POINTS.length - 1], startHeightPx + dragOffset))
    : vh * snap;

  return { sheetRef, heightPx, snap, dragging, snapTo, onPointerDown, onPointerMove, onPointerUp };
}


const RISK_LABEL: Record<RiskLevel, string> = { critical: 'CRITICAL', high: 'HIGH', medium: 'MED' };

const RISK_COLORS: Record<RiskLevel, { badge: string; dot: string; border: string; glow: string }> = {
  critical: {
    badge: 'bg-red-950 text-red-400 border-red-800',
    dot: 'bg-red-500',
    border: 'border-red-900/60',
    glow: 'shadow-[0_0_12px_rgba(239,68,68,0.25)]',
  },
  high: {
    badge: 'bg-orange-950 text-orange-400 border-orange-800',
    dot: 'bg-orange-400',
    border: 'border-orange-900/40',
    glow: '',
  },
  medium: {
    badge: 'bg-yellow-950 text-yellow-500 border-yellow-800',
    dot: 'bg-yellow-400',
    border: 'border-yellow-900/30',
    glow: '',
  },
};

interface Props {
  cameras: MockCamera[];
  liveStates: Record<string, CameraLiveState>;
  recentEvents: AgentEvent[];
  locationName: string;
  selectedId: string | null;
  onSelect: (camera: MockCamera) => void;
  visible: boolean;
}

export function CameraListPanel({
  cameras, liveStates, recentEvents, locationName, selectedId, onSelect, visible,
}: Props) {
  const selectedRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<'cameras' | 'events'>('cameras');
  const { sheetRef, heightPx, dragging, snapTo, onPointerDown, onPointerMove, onPointerUp } = useBottomSheetDrag('default');

  // Auto-expand sheet when a camera is selected so the embed is visible
  useEffect(() => {
    if (selectedId) snapTo('expanded');
  }, [selectedId, snapTo]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (selectedId) selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId]);

  const criticalCount = Object.values(liveStates).filter((s) => s.riskLevel === 'critical').length;
  const highCount = Object.values(liveStates).filter((s) => s.riskLevel === 'high').length;

  // Sort cameras by current live risk level
  const riskOrder: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2 };
  const sortedCameras = [...cameras].sort((a, b) => {
    const ra = liveStates[a.id]?.riskLevel ?? a.riskLevel;
    const rb = liveStates[b.id]?.riskLevel ?? b.riskLevel;
    return riskOrder[ra] - riskOrder[rb];
  });

  return (
    <div
      ref={sheetRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`
        absolute bottom-0 left-0 right-0 z-20 flex flex-col
        bg-gray-950/95 backdrop-blur-md border-t border-white/5
        ${!dragging ? 'transition-[height,transform] duration-300 ease-out' : ''}
        ${visible && mounted ? 'translate-y-0' : 'translate-y-full'}
      `}
      style={{ height: mounted ? heightPx : undefined }}
    >
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        className="flex justify-center pt-3 pb-2 flex-shrink-0 cursor-ns-resize touch-none select-none"
      >
        <div className="w-10 h-1 rounded-full bg-white/20 hover:bg-white/40 transition-colors" />
      </div>

      {/* Header */}
      <div className="px-4 pb-2 pt-1 flex items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {cameras.length} cameras
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            near <span className="text-gray-400">{locationName.split(',')[0]}</span>
            {criticalCount > 0 && <> · <span className="text-red-400">{criticalCount} critical</span></>}
            {highCount > 0 && <> · <span className="text-orange-400">{highCount} high</span></>}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex bg-white/5 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => setTab('cameras')}
            className={`px-3 py-1 rounded-md transition-colors ${tab === 'cameras' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Cameras
          </button>
          <button
            onClick={() => setTab('events')}
            className={`px-3 py-1 rounded-md transition-colors relative ${tab === 'events' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Events
            {recentEvents.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
          </button>
        </div>
      </div>

      <div className="h-px bg-white/5 flex-shrink-0" />

      {/* Camera list */}
      {tab === 'cameras' && (
        <div className="overflow-y-auto flex-1 px-3 py-3 space-y-2">
          {sortedCameras.map((cam) => {
            const live = liveStates[cam.id];
            const risk = live?.riskLevel ?? cam.riskLevel;
            const colors = RISK_COLORS[risk];
            const isSelected = cam.id === selectedId;
            const hasNewEvent = !!live?.lastEvent;

            return (
              <div
                key={cam.id}
                ref={isSelected ? selectedRef : null}
                className={`
                  w-full rounded-xl border transition-all duration-200
                  ${isSelected
                    ? `${colors.border} bg-white/5 ring-1 ring-white/10 ${colors.glow}`
                    : 'border-white/5 hover:border-white/10 hover:bg-white/[0.02]'
                  }
                `}
              >
                {/* Clickable header row */}
                <button
                  onClick={() => onSelect(cam)}
                  className="w-full text-left px-3.5 py-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <span className={`block w-2 h-2 rounded-full ${colors.dot} ${risk === 'critical' ? 'animate-pulse' : ''}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-100">{cam.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${colors.badge}`}>
                          {RISK_LABEL[risk]}
                        </span>
                        {live?.isLive && (
                          <span className="text-[10px] font-semibold text-green-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                            LIVE
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-500 mt-0.5 truncate">{cam.address}</p>

                      {/* Latest event description */}
                      {hasNewEvent ? (
                        <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-1">
                          {live.lastEvent!.description}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {cam.crimeTypes.map((t) => (
                            <span key={t} className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Detection tags from last event */}
                      {live?.lastEvent && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {live.lastEvent.detections.map((d) => (
                            <span key={d} className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded">
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-semibold text-gray-200">{live?.incidentsLast24h ?? cam.incidentsLast24h}</p>
                      <p className="text-[10px] text-gray-600 leading-tight">incidents</p>
                      <p className="text-[10px] text-gray-600 leading-tight">24h</p>
                      <p className="text-[10px] text-gray-500 mt-1">{live?.lastIncident ?? cam.lastIncident}</p>
                    </div>
                  </div>
                </button>

                {/* Live feed — only when selected */}
                {isSelected && (
                  <div className="px-3.5 pb-3.5">
                    <div className="w-full aspect-video rounded-lg overflow-hidden bg-black border border-white/5">
                      <MockCctvFeed
                        cameraName={cam.name}
                        cameraId={cam.id}
                        riskLevel={risk}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Events feed */}
      {tab === 'events' && (
        <div className="overflow-y-auto flex-1 px-3 py-3 space-y-2">
          {recentEvents.length === 0 && (
            <p className="text-xs text-gray-600 text-center mt-6">Waiting for events...</p>
          )}
          {recentEvents.map((evt) => {
            const colors = RISK_COLORS[evt.severity];
            return (
              <div key={evt.id} className={`rounded-xl border ${colors.border} bg-white/[0.02] px-3.5 py-3`}>
                <div className="flex items-start gap-3">
                  <span className={`block w-2 h-2 rounded-full flex-shrink-0 mt-1 ${colors.dot} ${evt.severity === 'critical' ? 'animate-pulse' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${colors.badge}`}>
                        {RISK_LABEL[evt.severity]}
                      </span>
                      <span className="text-[10px] text-gray-500">{evt.cameraName}</span>
                    </div>
                    <p className="text-xs text-gray-300">{evt.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {evt.detections.map((d) => (
                        <span key={d} className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded">{d}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-600 flex-shrink-0">
                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
