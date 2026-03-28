'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FramePlaceholder } from './incident-feed';
import type { NormalizedIncident } from './incident-feed';

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-950 text-red-400 border-red-800',
  high: 'bg-orange-950 text-orange-400 border-orange-800',
  medium: 'bg-yellow-950 text-yellow-500 border-yellow-800',
  low: 'bg-gray-800 text-gray-400 border-gray-600',
};
const SEV_LABEL: Record<string, string> = {
  critical: 'CRITICAL', high: 'HIGH', medium: 'MED', low: 'LOW',
};

interface Props {
  incident: NormalizedIncident;
  onClose: () => void;
  onDismiss: () => void;
}

export function IncidentDetailModal({ incident, onClose, onDismiss }: Props) {
  const [callState, setCallState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [callError, setCallError] = useState('');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleDispatch() {
    setCallState('loading');
    setCallError('');
    try {
      const res = await fetch('/api/dispatch-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: incident.description,
          severity: incident.severity,
          cameraName: incident.cameraName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCallState('success');
      } else {
        setCallState('error');
        setCallError(data.error || 'Dispatch failed');
      }
    } catch {
      setCallState('error');
      setCallError('Network error');
    }
  }

  const time = new Date(incident.timestamp).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal content */}
      <div
        className="relative bg-gray-950 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white flex items-center justify-center text-sm transition-colors"
        >
          ✕
        </button>

        {/* Image */}
        {incident.frameB64 ? (
          <img
            src={`data:image/jpeg;base64,${incident.frameB64}`}
            alt="Incident frame"
            className="w-full rounded-t-2xl object-cover"
          />
        ) : (
          <div className="rounded-t-2xl overflow-hidden">
            <FramePlaceholder severity={incident.severity} />
          </div>
        )}

        {/* Details */}
        <div className="px-5 py-4 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-100">{incident.cameraName}</h2>
              {incident.lat !== undefined && incident.lng !== undefined && (
                <span className="text-xs text-gray-500 font-mono">
                  {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-[10px] font-bold px-2 py-1 rounded border ${SEV_BADGE[incident.severity]}`}>
                {SEV_LABEL[incident.severity]}
              </span>
              {incident.isReal && (
                <span className="text-[10px] font-mono text-blue-400/60 px-1.5 py-0.5 rounded bg-blue-950/40 border border-blue-900/40">LIVE</span>
              )}
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-300 leading-relaxed">{incident.description}</p>

          {/* Detections */}
          {incident.detections.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {incident.detections.map((d) => (
                <span key={d} className="text-[10px] bg-white/5 text-gray-400 px-2 py-1 rounded font-mono">{d}</span>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <p className="text-xs text-gray-600 font-mono">{time}</p>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-white/5">
            <button
              onClick={onDismiss}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Dismiss Incident
            </button>

            <button
              onClick={handleDispatch}
              disabled={callState === 'loading' || callState === 'success'}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                callState === 'success'
                  ? 'bg-green-900/50 text-green-400 border border-green-800'
                  : callState === 'error'
                    ? 'bg-red-900/50 text-red-300 border border-red-800 hover:bg-red-900/70'
                    : 'bg-red-600 hover:bg-red-500 text-white'
              } disabled:opacity-50`}
            >
              {callState === 'loading' ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : callState === 'success' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
              )}
              {callState === 'success' ? 'Call Dispatched' : callState === 'error' ? 'Retry Dispatch' : 'Dispatch Call'}
            </button>
          </div>

          {callError && (
            <p className="text-xs text-red-400">{callError}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
