import type { SessionUpdate } from '@agentclientprotocol/sdk';

/** One ACP update, tagged with the graph node and task it belongs to. */
export interface HarnessEvent {
  node: string;
  task: string | null;
  sessionId: string;
  update: SessionUpdate;
}

/**
 * Renders one ACP update as a single log line, or `null` for updates that
 * carry nothing a reader of the run wants (command lists, mode changes).
 * Text chunks are printed as they arrive, so a long reply spans several lines.
 */
export function describeUpdate(update: SessionUpdate): string | null {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
      return update.content.type === 'text' ? `says  ${update.content.text.trim()}` : null;
    case 'agent_thought_chunk':
      return update.content.type === 'text' ? `think ${update.content.text.trim()}` : null;
    case 'user_message_chunk':
      return update.content.type === 'text' ? `user  ${update.content.text.trim()}` : null;
    case 'tool_call':
      return `tool  ${update.kind ?? 'other'} ${update.status ?? 'pending'}: ${update.title}`;
    case 'tool_call_update':
      return `tool  ${update.status ?? 'update'}: ${update.title ?? update.toolCallId}`;
    case 'plan':
      return `plan  ${update.entries.map((e) => `[${e.status}] ${e.content}`).join(' | ')}`;
    case 'plan_update':
      return 'plan  updated';
    case 'usage_update':
      return `usage ${String(update.used)}/${String(update.size)} context tokens`;
    default:
      return null;
  }
}

/** Formats one log line: elapsed time, node/task, session prefix, and the text. */
export function formatLine(
  event: Omit<HarnessEvent, 'update'>,
  elapsedMs: number,
  text: string,
): string {
  const where = `${event.node}${event.task ? `/${event.task}` : ''}`;
  const clipped = text.length > MAX_LINE ? `${text.slice(0, MAX_LINE - 1)}…` : text;
  return `${String(elapsedMs).padStart(6)}ms  ${where.padEnd(22)} ${event.sessionId.slice(0, 8)}  ${clipped}`;
}

const MAX_LINE = 160;

/**
 * Turns a stream of events into log lines, merging consecutive text chunks of
 * one node into a single `says` line. A real agent streams its reply a few
 * characters per `agent_message_chunk`; printing each chunk buries the tool
 * calls between them. The merged line is emitted when a different kind of
 * update arrives for that node, when the node finishes, or at `flushAll`.
 */
export class LineCoalescer {
  private readonly pending = new Map<
    string,
    { event: Omit<HarnessEvent, 'update'>; text: string; at: number }
  >();

  /** Returns the lines ready to print after this event. */
  push(event: HarnessEvent, elapsedMs: number): string[] {
    const key = `${event.node}/${event.task ?? ''}`;
    const { update } = event;
    if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
      const open = this.pending.get(key);
      if (open) open.text += update.content.text;
      else this.pending.set(key, { event, text: update.content.text, at: elapsedMs });
      return [];
    }
    const lines = this.flush(key);
    const line = describeUpdate(update);
    if (line !== null) lines.push(formatLine(event, elapsedMs, line));
    return lines;
  }

  /** Emits the pending text of one node, if any; called when that node completes. */
  flush(key: string): string[] {
    const open = this.pending.get(key);
    if (!open) return [];
    this.pending.delete(key);
    return [formatLine(open.event, open.at, `says  ${open.text.trim().replace(/\s+/g, ' ')}`)];
  }

  flushAll(): string[] {
    return [...this.pending.keys()].flatMap((key) => this.flush(key));
  }
}
