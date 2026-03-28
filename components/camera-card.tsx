'use client';

import type { CameraStatus } from '@/lib/types';

const statusColors: Record<CameraStatus['status'], string> = {
  connecting: 'bg-yellow-500',
  active: 'bg-green-500',
  error: 'bg-red-500',
  stopped: 'bg-gray-500',
};

interface Props {
  camera: CameraStatus;
}

export function CameraCard({ camera }: Props) {
  return (
    <div className="rounded-xl overflow-hidden bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors">
      {/* Frame */}
      <div className="relative w-full aspect-video bg-black">
        {camera.latestFrameB64 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/jpeg;base64,${camera.latestFrameB64}`}
            alt={camera.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-700">
            {/* Camera icon */}
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
            </svg>
            <span className="text-xs">
              {camera.status === 'connecting' ? 'Connecting...' : 'No feed'}
            </span>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-1">
          <span className={`w-1.5 h-1.5 rounded-full ${statusColors[camera.status]} ${camera.status === 'active' ? 'animate-pulse' : ''}`} />
          <span className="text-xs text-white/80">{camera.status}</span>
        </div>

        {/* Alert badge */}
        {camera.incidentCount > 0 && (
          <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
            {camera.incidentCount}⚠
          </div>
        )}

        {/* YOLO detection tags */}
        {camera.latestDetections && camera.latestDetections.length > 0 && (
          <div className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-1">
            {camera.latestDetections.slice(0, 3).map((d, i) => (
              <span key={i} className="text-[10px] bg-blue-950/80 text-blue-300 px-1.5 py-0.5 rounded">
                {d.class}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2">
        <p className="text-sm font-medium text-gray-200 truncate">{camera.name}</p>
        {camera.lastActivity && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
            {camera.lastActivity}
          </p>
        )}
      </div>
    </div>
  );
}
