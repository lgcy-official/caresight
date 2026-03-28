'use client';

interface Props {
  status: string;
  phase: 'idle' | 'searching' | 'monitoring';
}

export function AgentStatusBar({ status, phase }: Props) {
  if (phase === 'idle') return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 bg-gray-950/90 backdrop-blur-sm border-t border-gray-800 px-4 py-2.5 flex items-center gap-3">
      {/* Animated indicator */}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        {phase === 'searching' ? (
          <>
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
          </>
        ) : (
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        )}
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-shrink-0">
          CareSight
        </span>
        <span className="text-xs text-gray-300 truncate">{status || 'Initializing...'}</span>
      </div>
    </div>
  );
}
