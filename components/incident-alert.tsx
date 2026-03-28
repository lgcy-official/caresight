'use client';

import { useEffect, useState } from 'react';
import type { Incident } from '@/lib/types';

const severityStyles: Record<Incident['severity'], string> = {
  low: 'border-yellow-600 bg-yellow-950/80',
  medium: 'border-orange-600 bg-orange-950/80',
  high: 'border-red-600 bg-red-950/80',
  critical: 'border-red-500 bg-red-900/90 animate-pulse',
};

interface Props {
  incidents: Incident[];
}

export function IncidentAlerts({ incidents }: Props) {
  const [visible, setVisible] = useState<Incident[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (incidents.length === 0) return;
    const latest = incidents[0];
    if (!dismissed.has(latest.id)) {
      setVisible((prev) => [latest, ...prev].slice(0, 3));
      const timer = setTimeout(() => {
        setVisible((prev) => prev.filter((i) => i.id !== latest.id));
      }, 8000);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents[0]?.id]);

  const dismiss = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    setVisible((prev) => prev.filter((i) => i.id !== id));
  };

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {visible.map((incident) => (
        <div
          key={incident.id}
          className={`border rounded-lg p-3 backdrop-blur-sm ${severityStyles[incident.severity]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase text-red-400">
                  {incident.severity} alert
                </span>
                <span className="text-xs text-gray-400">{incident.cameraName}</span>
              </div>
              <p className="text-sm text-gray-200 line-clamp-3">{incident.description}</p>
            </div>
            <button
              onClick={() => dismiss(incident.id)}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none flex-shrink-0"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
