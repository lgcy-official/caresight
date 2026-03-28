'use client';

import type { CameraStatus } from '@/lib/types';
import { CameraCard } from './camera-card';

interface Props {
  cameras: Record<string, CameraStatus>;
  visible: boolean;
  onClose: () => void;
}

export function CameraSidebar({ cameras, visible, onClose }: Props) {
  const list = Object.values(cameras);

  return (
    <div
      className={`
        absolute top-0 right-0 bottom-0 z-10
        w-72 bg-gray-950/95 backdrop-blur-sm border-l border-gray-800
        flex flex-col
        transition-transform duration-300 ease-in-out
        ${visible ? 'translate-x-0' : 'translate-x-full'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">Active Cameras</h2>
          <p className="text-xs text-gray-500 mt-0.5">{list.length} deployed</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded"
          aria-label="Close sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Camera list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center pb-8">
            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
              </svg>
            </div>
            <p className="text-xs text-gray-600">
              Cameras will appear here<br />as agents deploy them
            </p>
          </div>
        ) : (
          list.map((cam) => <CameraCard key={cam.id} camera={cam} />)
        )}
      </div>
    </div>
  );
}
