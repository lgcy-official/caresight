import type { ModelMessage } from 'ai';

// ── Types ──────────────────────────────────────────────────────────────

export interface AgentMemory {
  agentId: string;
  agentType: 'main' | 'watcher';
  messages: ModelMessage[];
  state: Record<string, unknown>;
  lastActiveAt: number;
  restartCount: number;
}

// ── Message compaction ─────────────────────────────────────────────────

const MAX_SAVED_MESSAGES = 40;

/**
 * Returns true if a string looks like base64-encoded binary data.
 */
function looksLikeBase64(value: unknown): boolean {
  if (typeof value !== 'string' || value.length < 500) return false;
  return /^[A-Za-z0-9+/\n\r]{200,}={0,2}$/.test(value.slice(0, 300));
}

/**
 * Recursively strips large base64 blobs from an object tree.
 * Known binary field names (frameB64, image, data) are checked first.
 */
function stripBinaryData(obj: unknown): unknown {
  if (looksLikeBase64(obj)) return '[binary data stripped]';
  if (Array.isArray(obj)) return obj.map(stripBinaryData);
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      if ((key === 'frameB64' || key === 'image') && typeof val === 'string' && val.length > 500) {
        out[key] = '[binary data stripped]';
      } else {
        out[key] = stripBinaryData(val);
      }
    }
    return out;
  }
  return obj;
}

/**
 * Returns true if a message is "noise" — trivially short or boilerplate
 * monitoring chatter that doesn't carry meaningful state.
 */
function isNoise(msg: ModelMessage): boolean {
  if (msg.role !== 'assistant') return false;
  if (typeof msg.content !== 'string') return false;
  const text = msg.content.toLowerCase().trim();
  if (text.length < 10) return true;

  const noisePatterns = [
    'continuing to monitor',
    'resuming monitoring',
    'no suspicious activity detected',
    'everything appears normal',
    'continuing observation',
    'all clear',
    'nothing to report',
  ];
  return noisePatterns.some((p) => text.includes(p)) && text.length < 120;
}

/**
 * Compact a message array: strip binary data, remove noise, and enforce
 * a sliding window. Older messages beyond the window are summarised into
 * a single context-recovery user message.
 */
export function compactMessages(messages: ModelMessage[]): ModelMessage[] {
  const filtered: ModelMessage[] = [];

  for (const msg of messages) {
    if (isNoise(msg)) continue;

    // Deep-strip binary data from every message
    const cleaned = stripBinaryData(msg) as ModelMessage;

    // Strip file / image parts from user messages (e.g. video URLs, frames)
    if (cleaned.role === 'user' && Array.isArray(cleaned.content)) {
      const textParts = (cleaned.content as Array<{ type: string }>).filter(
        (p) => p.type === 'text'
      );
      if (textParts.length === 0) continue; // drop media-only messages
      filtered.push({ ...cleaned, content: textParts } as ModelMessage);
    } else {
      filtered.push(cleaned);
    }
  }

  if (filtered.length <= MAX_SAVED_MESSAGES) return filtered;

  // ── Sliding window with summary ────────────────────────────────────
  const older = filtered.slice(0, filtered.length - MAX_SAVED_MESSAGES);
  const recent = filtered.slice(-MAX_SAVED_MESSAGES);

  const incidents: string[] = [];
  let routineCount = 0;

  for (const msg of older) {
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content as Array<{ type: string; result?: unknown }>) {
        if (part.type === 'tool-result') {
          const r = part.result as Record<string, unknown> | undefined;
          if (r?.reported || r?.incidentId) {
            incidents.push((r.message as string) ?? 'Incident reported');
          }
        }
      }
    }
    if (msg.role === 'assistant' && typeof msg.content === 'string') {
      routineCount++;
    }
  }

  const summaryLines = [
    `[COMPACTED HISTORY — ${older.length} messages summarised]`,
    routineCount > 0 ? `${routineCount} routine observations compacted.` : null,
    incidents.length > 0
      ? `Previous incidents:\n${incidents.map((i) => `  - ${i}`).join('\n')}`
      : 'No incidents in compacted history.',
  ]
    .filter(Boolean)
    .join('\n');

  return [{ role: 'user' as const, content: summaryLines }, ...recent];
}

// ── Memory store singleton ─────────────────────────────────────────────

class AgentMemoryStore {
  private static instance: AgentMemoryStore;
  private memories = new Map<string, AgentMemory>();

  private constructor() {}

  static getInstance(): AgentMemoryStore {
    if (!AgentMemoryStore.instance) {
      AgentMemoryStore.instance = new AgentMemoryStore();
    }
    return AgentMemoryStore.instance;
  }

  /**
   * Save (or update) an agent's memory. Messages are compacted before
   * storage. State keys are merged with any previously saved state.
   */
  save(
    agentId: string,
    agentType: 'main' | 'watcher',
    messages: ModelMessage[],
    state: Record<string, unknown> = {}
  ): void {
    const existing = this.memories.get(agentId);
    this.memories.set(agentId, {
      agentId,
      agentType,
      messages: compactMessages(messages),
      state: { ...existing?.state, ...state },
      lastActiveAt: Date.now(),
      restartCount: (existing?.restartCount ?? 0) + 1,
    });
  }

  load(agentId: string): AgentMemory | null {
    return this.memories.get(agentId) ?? null;
  }

  delete(agentId: string): void {
    this.memories.delete(agentId);
  }

  getAllWatchers(): AgentMemory[] {
    return Array.from(this.memories.values()).filter((m) => m.agentType === 'watcher');
  }

  clear(): void {
    this.memories.clear();
  }
}

export const agentMemory = AgentMemoryStore.getInstance();
