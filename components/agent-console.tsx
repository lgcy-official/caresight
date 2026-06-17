'use client';

import { useSyncExternalStore } from 'react';
import type { AgentAnalysisOutput, AgentCollaborationEvent, AgentTask, IncidentResponsePlan } from '@/lib/types';

interface Props {
  connected: boolean;
  collaborations: AgentCollaborationEvent[];
  agentTasks: AgentTask[];
  analyses: AgentAnalysisOutput[];
  responsePlans: IncidentResponsePlan[];
}

const AGENTS = [
  { name: 'Scout', role: 'Feed Discovery', accent: 'bg-cyan-400' },
  { name: 'Analyzer', role: 'Event Analysis', accent: 'bg-amber-400' },
  { name: 'Planner', role: 'Incident Response', accent: 'bg-blue-400' },
  { name: 'Audit', role: 'Governance', accent: 'bg-emerald-400' },
];

const STATUS_CLASS: Record<AgentTask['status'], string> = {
  queued: 'border-gray-700 bg-gray-900/80 text-gray-400',
  running: 'border-blue-700/70 bg-blue-950/50 text-blue-300',
  complete: 'border-emerald-700/70 bg-emerald-950/40 text-emerald-300',
  blocked: 'border-red-800/80 bg-red-950/50 text-red-300',
};

const STATUS_DOT: Record<AgentTask['status'], string> = {
  queued: 'bg-gray-600',
  running: 'bg-blue-400 animate-pulse',
  complete: 'bg-emerald-400',
  blocked: 'bg-red-400 animate-pulse',
};

const EMPTY_TASKS: AgentTask[] = [
  {
    id: 'queued-scout',
    owner: 'Scout',
    title: 'Waiting for location',
    detail: 'Search a city to start the crew run.',
    status: 'queued',
    timestamp: 0,
  },
  {
    id: 'queued-triage',
    owner: 'Analyzer',
    title: 'Analysis queue idle',
    detail: 'Event classifications appear here after Scout deploys feeds.',
    status: 'queued',
    timestamp: 0,
  },
];

const ANALYSIS_SEVERITY_CLASS: Record<AgentAnalysisOutput['severity'], string> = {
  low: 'border-gray-700 bg-gray-900/80 text-gray-300',
  medium: 'border-yellow-800/80 bg-yellow-950/40 text-yellow-200',
  high: 'border-orange-800/80 bg-orange-950/45 text-orange-200',
  critical: 'border-red-800/80 bg-red-950/55 text-red-200',
};

const RISK_BAR_CLASS: Record<AgentAnalysisOutput['severity'], string> = {
  low: 'bg-gray-500',
  medium: 'bg-yellow-400',
  high: 'bg-orange-400',
  critical: 'bg-red-500',
};

const PLAN_PRIORITY_CLASS: Record<IncidentResponsePlan['priority'], string> = {
  none: 'border-gray-700 bg-gray-900/80 text-gray-300',
  low: 'border-gray-700 bg-gray-900/80 text-gray-300',
  medium: 'border-yellow-800/80 bg-yellow-950/40 text-yellow-200',
  high: 'border-orange-800/80 bg-orange-950/45 text-orange-200',
  critical: 'border-red-800/80 bg-red-950/55 text-red-200',
};

const subscribeToClient = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function formatTime(timestamp: number) {
  if (!timestamp) return '--:--';
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatEventType(eventType: string) {
  return eventType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

export function AgentConsole({
  connected,
  collaborations,
  agentTasks,
  analyses = [],
  responsePlans = [],
}: Props) {
  const isClient = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);

  if (!isClient) return null;

  const tasks = agentTasks.length > 0 ? agentTasks : EMPTY_TASKS;
  const latestHandoffs = collaborations.slice(0, 4);
  const latestAnalyses = analyses.slice(0, 3);
  const latestPlan = responsePlans[0] ?? null;

  return (
    <section className="absolute bottom-4 left-16 z-30 w-[min(620px,calc(100vw-5rem))] overflow-hidden rounded-2xl border border-white/10 bg-gray-950/90 shadow-2xl backdrop-blur-md">
      <div className="border-b border-white/8 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
              <h2 className="truncate text-lg font-semibold text-gray-100">Agent Console</h2>
            </div>
            <p className="mt-1 truncate text-sm text-gray-500">Collaborative operations crew</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Live
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-px border-b border-white/8 bg-white/8">
        {AGENTS.map((agent) => (
          <div key={agent.name} className="bg-gray-950/95 px-3.5 py-3.5">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${agent.accent}`} />
              <span className="truncate text-sm font-semibold text-gray-200">{agent.name}</span>
            </div>
            <p className="mt-1.5 truncate text-xs text-gray-600">{agent.role}</p>
          </div>
        ))}
      </div>

      <div className="grid max-h-[min(62vh,560px)] gap-4 overflow-y-auto p-5">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Analyzer Output</span>
            <span className="text-xs text-gray-600">{analyses.length}</span>
          </div>
          {latestAnalyses.length === 0 ? (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-gray-600">
              Analyzer will classify traffic collision, smoke, fire, crowd, and medical candidates after Scout deploys feeds.
            </div>
          ) : (
            <div className="space-y-2.5">
              {latestAnalyses.map((analysis) => (
                <div key={analysis.id} className={`rounded-xl border px-4 py-3.5 ${ANALYSIS_SEVERITY_CLASS[analysis.severity]}`}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-gray-100">
                          {formatEventType(analysis.eventType)}
                        </span>
                        <span className="rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          {analysis.severity}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-500">{analysis.cameraName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-100">{analysis.riskScore}</p>
                      <p className="text-[10px] uppercase tracking-wide text-gray-600">risk</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
                      <div
                        className={`h-full rounded-full ${RISK_BAR_CLASS[analysis.severity]}`}
                        style={{ width: `${Math.max(4, Math.min(100, analysis.riskScore))}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-300">{formatConfidence(analysis.confidence)}</span>
                  </div>

                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-gray-400">{analysis.explanation}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {analysis.evidence.slice(0, 3).map((item) => (
                      <span key={item} className="rounded-md bg-black/20 px-2 py-1 text-[10px] leading-tight text-gray-500">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Response Planner</span>
            <span className="text-xs text-gray-600">{responsePlans.length}</span>
          </div>
          {!latestPlan ? (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-gray-600">
              Planner waits for Analyzer risk score, then compares it against the responder threshold.
            </div>
          ) : (
            <div className={`rounded-xl border px-4 py-3.5 ${PLAN_PRIORITY_CLASS[latestPlan.priority]}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-gray-100">{latestPlan.incidentTitle}</span>
                    <span className="rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {latestPlan.priority}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Threshold {latestPlan.threshold} / Risk {latestPlan.riskScore}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                  latestPlan.responderActionRecommended
                    ? 'bg-red-500/15 text-red-200'
                    : 'bg-emerald-500/15 text-emerald-200'
                }`}>
                  {latestPlan.responderActionRecommended ? 'Action' : 'No Action'}
                </span>
              </div>

              <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-gray-400">{latestPlan.executiveSummary}</p>
              <div className="mt-3 grid gap-2 text-xs text-gray-500">
                <div className="flex gap-2">
                  <span className="w-20 shrink-0 uppercase tracking-wide text-gray-600">Location</span>
                  <span className="line-clamp-1">{latestPlan.location}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-20 shrink-0 uppercase tracking-wide text-gray-600">Event</span>
                  <span className="line-clamp-1">{latestPlan.event}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-20 shrink-0 uppercase tracking-wide text-gray-600">Urgency</span>
                  <span className="line-clamp-1">{latestPlan.estimatedUrgency}</span>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-black/20 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">Recommended Action</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-400">{latestPlan.recommendedAction}</p>
              </div>
              {latestPlan.informationMissing.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {latestPlan.informationMissing.slice(0, 3).map((item) => (
                    <span key={item} className="rounded-md bg-black/20 px-2 py-1 text-[10px] leading-tight text-gray-500">
                      Missing: {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tasks</span>
            <span className="text-xs text-gray-600">{tasks.length}</span>
          </div>
          <div className="space-y-2.5">
            {tasks.slice(0, 4).map((task) => (
              <div key={task.id} className={`rounded-xl border px-4 py-3 ${STATUS_CLASS[task.status]}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[task.status]}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-200">
                    {task.owner}: {task.title}
                  </span>
                  <span className="text-xs uppercase tracking-wide opacity-70">{task.status}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-500">{task.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Agent Handoffs</span>
            <span className="text-xs text-gray-600">{collaborations.length}</span>
          </div>
          {latestHandoffs.length === 0 ? (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-gray-600">
              The crew will start talking after the first search.
            </div>
          ) : (
            <div className="space-y-2.5">
              {latestHandoffs.map((event) => (
                <div key={event.id} className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3.5">
                  <div className="flex items-center gap-2.5 text-xs">
                    <span className="font-semibold text-gray-200">{event.fromAgent}</span>
                    <span className="text-gray-700">-&gt;</span>
                    <span className="font-semibold text-gray-300">{event.toAgent}</span>
                    <span className="ml-auto text-gray-600">{formatTime(event.timestamp)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-blue-200/80">{event.action}</p>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">{event.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
