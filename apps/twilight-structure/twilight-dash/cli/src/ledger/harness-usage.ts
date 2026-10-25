import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

/** Token categories every harness is normalized into; a provider without one leaves it zero. */
export const USAGE_CATEGORIES = [
  'input',
  'cacheWrite',
  'cacheWriteExtended',
  'cacheRead',
  'output',
] as const;
export type UsageCategory = (typeof USAGE_CATEGORIES)[number];
export type UsageTokens = Record<UsageCategory, number>;

export type Harness = 'claude-code' | 'codex';

/** One priced-later unit of measured consumption: a Claude request or a Codex turn count. */
export interface HarnessUsageRow {
  readonly harness: Harness;
  readonly harnessVersion: string;
  readonly sessionId: string;
  readonly requestId: string;
  readonly model: string;
  readonly instant: string;
  readonly branch: string | null;
  readonly tokens: UsageTokens;
  readonly source: { readonly path: string; readonly line: number };
}

/** What a session revealed about the work it served, read from its tool output. */
export interface SessionFacts {
  readonly harness: Harness;
  readonly sessionId: string;
  readonly pullRequestReferences: readonly number[];
}

/** A transcript line no JSON parser accepts; live sessions leave them, so they are counted, not fatal. */
export interface UnreadableLine {
  readonly path: string;
  readonly line: number;
}

export interface HarnessUsage {
  readonly rows: readonly HarnessUsageRow[];
  readonly sessions: readonly SessionFacts[];
  /** Explicit degradation: every line skipped as unparseable, so a report can show the gap. */
  readonly unreadableLines: readonly UnreadableLine[];
}

export interface UsagePeriod {
  /** Inclusive ISO instant. */
  readonly since: string;
  /** Exclusive ISO instant. */
  readonly until: string;
}

const NonNegativeInteger = type('number.integer>=0');

const ClaudeUsage = type({
  input_tokens: NonNegativeInteger,
  output_tokens: NonNegativeInteger,
  'cache_creation_input_tokens?': NonNegativeInteger,
  'cache_read_input_tokens?': NonNegativeInteger,
  'cache_creation?': type({
    'ephemeral_5m_input_tokens?': NonNegativeInteger,
    'ephemeral_1h_input_tokens?': NonNegativeInteger,
  }),
});

/** The subset of a Claude Code assistant transcript entry this reader depends on. */
const ClaudeAssistantEntry = type({
  type: "'assistant'",
  sessionId: 'string>=1',
  timestamp: 'string>=1',
  version: 'string>=1',
  'requestId?': 'string>=1',
  'gitBranch?': 'string',
  message: type({ model: 'string>=1', usage: ClaudeUsage }),
});

const CodexSessionMeta = type({
  type: "'session_meta'",
  payload: type({
    id: 'string>=1',
    cli_version: 'string>=1',
    'git?': type({ 'branch?': 'string' }),
  }),
});

const CodexTurnContext = type({
  type: "'turn_context'",
  payload: type({ model: 'string>=1' }),
});

const CodexTokenUsage = type({
  input_tokens: NonNegativeInteger,
  cached_input_tokens: NonNegativeInteger,
  cache_write_input_tokens: NonNegativeInteger,
  output_tokens: NonNegativeInteger,
  total_tokens: NonNegativeInteger,
});

const CodexTokenCount = type({
  type: "'event_msg'",
  timestamp: 'string>=1',
  payload: type({
    type: "'token_count'",
    info: type({ total_token_usage: CodexTokenUsage, last_token_usage: CodexTokenUsage }),
  }),
});

function zeroTokens(): UsageTokens {
  return { input: 0, cacheWrite: 0, cacheWriteExtended: 0, cacheRead: 0, output: 0 };
}

function isAllZero(tokens: UsageTokens): boolean {
  return USAGE_CATEGORIES.every((category) => tokens[category] === 0);
}

/** Input and cache counts of one request never change between its streamed lines. */
function sameInputs(left: UsageTokens, right: UsageTokens): boolean {
  return USAGE_CATEGORIES.filter((category) => category !== 'output').every(
    (category) => left[category] === right[category],
  );
}

function inPeriod(instant: string, period: UsagePeriod): boolean {
  return instant >= period.since && instant < period.until;
}

/** Lists `*.jsonl` files under a directory recursively; the directory itself must be readable. */
function listTranscripts(directory: string): string[] {
  let entries: string[];
  try {
    // Proof: defaulting an absent directory to [] made `absent directory refuses` import nothing
    // instead of refusing (2026-10-22).
    entries = readdirSync(directory);
  } catch (cause) {
    throw new Error(
      `harness log directory is missing or unreadable: ${JSON.stringify(directory)}`,
      {
        cause,
      },
    );
  }
  const files: string[] = [];
  for (const entry of entries.sort()) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...listTranscripts(path));
    else if (entry.endsWith('.jsonl')) files.push(path);
  }
  return files;
}

const UNREADABLE = Symbol('unreadable');

/**
 * A line that is not JSON is recorded and skipped rather than refusing the run: a session that
 * is still writing leaves such lines (observed 2026-10-22 in a live subagent transcript), and a
 * run that refuses whenever any session is live would never complete. The skipped lines are part
 * of the result, never silent.
 */
function parseLine(
  path: string,
  line: number,
  bytes: string,
  unreadable: UnreadableLine[],
): unknown {
  try {
    return JSON.parse(bytes);
  } catch {
    // Proof: dropping this record made `a line that is not JSON is reported, not fatal` lose its
    // unreadable entry (2026-10-22).
    unreadable.push({ path, line });
    return UNREADABLE;
  }
}

function decodeEntry<Shape extends type.Any>(
  shape: Shape,
  input: unknown,
  path: string,
  line: number,
): Shape['infer'] {
  try {
    return parseOrThrow(shape, input);
  } catch (cause) {
    throw new Error(`harness log entry is malformed: ${JSON.stringify(path)}:${String(line)}`, {
      cause,
    });
  }
}

function pullRequestPattern(repositorySlug: string): RegExp {
  const escaped = repositorySlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`github\\.com/${escaped}/pull/(\\d+)`, 'g');
}

function collectReferences(raw: string, pattern: RegExp, into: Set<number>): void {
  if (!raw.includes('/pull/')) return;
  for (const match of raw.matchAll(pattern)) into.add(Number(match[1]));
}

/**
 * Reads Claude Code transcripts: one row per API request. A streamed response writes one
 * transcript line per content block with the same `requestId`; the input and cache counts are
 * fixed from the first line while `output_tokens` grows until the last, so the last line of a
 * request is its usage and a line whose input or cache counts differ refuses. Entries without a
 * request id are the harness's synthetic messages; they carry no usage and are dropped only
 * when every category is zero.
 */
function readClaudeTranscript(
  path: string,
  period: UsagePeriod,
  pattern: RegExp,
  rows: HarnessUsageRow[],
  sessions: Map<string, Set<number>>,
  unreadable: UnreadableLine[],
): void {
  interface Pending {
    assistant: typeof ClaudeAssistantEntry.infer;
    tokens: UsageTokens;
    line: number;
  }
  const pending = new Map<string, Pending>();
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const [index, raw] of lines.entries()) {
    if (raw.length === 0) continue;
    const line = index + 1;
    const where = `${JSON.stringify(path)}:${String(line)}`;
    const entry = parseLine(path, line, raw, unreadable);
    if (typeof entry !== 'object' || entry === null) continue;
    const sessionIdOfLine = 'sessionId' in entry ? String(entry.sessionId) : null;
    if (sessionIdOfLine !== null) {
      const key = `claude-code:${sessionIdOfLine}`;
      const references = sessions.get(key) ?? new Set<number>();
      collectReferences(raw, pattern, references);
      sessions.set(key, references);
    }
    if ((entry as { type?: unknown }).type !== 'assistant') continue;
    const assistant = decodeEntry(ClaudeAssistantEntry, entry, path, line);
    const usage = assistant.message.usage;
    const extended = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const short = usage.cache_creation?.ephemeral_5m_input_tokens;
    const tokens: UsageTokens = {
      input: usage.input_tokens,
      cacheWrite: short ?? Math.max((usage.cache_creation_input_tokens ?? 0) - extended, 0),
      cacheWriteExtended: extended,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      output: usage.output_tokens,
    };
    if (assistant.requestId === undefined) {
      // Proof: dropping this check let a usage-bearing entry without a request id vanish in
      // `synthetic entries without a request id are dropped only when empty` (2026-10-22).
      if (!isAllZero(tokens)) {
        throw new Error(`harness log entry has usage but no request id: ${where}`);
      }
      continue;
    }
    const key = `${assistant.sessionId}:${assistant.requestId}`;
    const earlier = pending.get(key);
    if (earlier !== undefined) {
      // Proof: removing this comparison imported `a repeated request id that disagrees` silently.
      if (!sameInputs(earlier.tokens, tokens) || tokens.output < earlier.tokens.output) {
        throw new Error(`repeated request id with different usage: ${where}`);
      }
    }
    // Proof: pushing a row per line instead of per request tripled the row count in
    // `a streamed response repeats its usage and counts once` (2026-10-22).
    pending.set(key, { assistant, tokens, line });
  }
  for (const { assistant, tokens, line } of pending.values()) {
    if (isAllZero(tokens) || !inPeriod(assistant.timestamp, period)) continue;
    rows.push({
      harness: 'claude-code',
      harnessVersion: assistant.version,
      sessionId: assistant.sessionId,
      requestId: assistant.requestId ?? '',
      model: assistant.message.model,
      instant: assistant.timestamp,
      branch:
        assistant.gitBranch === undefined || assistant.gitBranch === ''
          ? null
          : assistant.gitBranch,
      tokens,
      source: { path, line },
    });
  }
}

/**
 * Reads one Codex rollout: the session's branch from `session_meta`, the model from the latest
 * `turn_context`, and one row per `token_count` event whose cumulative `total_token_usage`
 * advanced, the row being that advance per category. Rollouts repeat events and occasionally
 * restart the counter (observed 2026-10-22 across 4,808 rollouts: 11,021 repeats, 15 restarts),
 * so the advance, not `last_token_usage`, is the usage. OpenAI's `input_tokens` includes the
 * cached part, so the uncached input is the difference. A category that falls while the total
 * does not refuses the rollout.
 */
function readCodexRollout(
  path: string,
  period: UsagePeriod,
  pattern: RegExp,
  rows: HarnessUsageRow[],
  sessions: Map<string, Set<number>>,
  unreadable: UnreadableLine[],
): void {
  const lines = readFileSync(path, 'utf8').split('\n');
  let sessionId: string | null = null;
  let version = '';
  let branch: string | null = null;
  let model: string | null = null;
  let previous: typeof CodexTokenUsage.infer | null = null;
  let events = 0;
  const references = new Set<number>();
  for (const [index, raw] of lines.entries()) {
    if (raw.length === 0) continue;
    const line = index + 1;
    const entry = parseLine(path, line, raw, unreadable);
    collectReferences(raw, pattern, references);
    if (typeof entry !== 'object' || entry === null) continue;
    const kind = (entry as { type?: unknown }).type;
    if (kind === 'session_meta') {
      const meta = decodeEntry(CodexSessionMeta, entry, path, line);
      sessionId = meta.payload.id;
      version = meta.payload.cli_version;
      const recorded = meta.payload.git?.branch;
      branch = recorded === undefined || recorded === '' ? null : recorded;
      continue;
    }
    if (kind === 'turn_context') {
      model = decodeEntry(CodexTurnContext, entry, path, line).payload.model;
      continue;
    }
    if (kind !== 'event_msg') continue;
    const payload = (entry as { payload?: { type?: unknown; info?: unknown } }).payload;
    if (payload?.type !== 'token_count' || payload.info === null || payload.info === undefined) {
      continue;
    }
    const count = decodeEntry(CodexTokenCount, entry, path, line);
    if (sessionId === null || model === null) {
      throw new Error(
        `token count precedes session or model identity: ${JSON.stringify(path)}:${String(line)}`,
      );
    }
    events += 1;
    const total = count.payload.info.total_token_usage;
    const restarted = previous !== null && total.total_tokens < previous.total_tokens;
    const base = previous === null || restarted ? null : previous;
    previous = total;
    const advance = (category: keyof typeof total): number =>
      total[category] - (base === null ? 0 : base[category]);
    const input = advance('input_tokens');
    const cached = advance('cached_input_tokens');
    const written = advance('cache_write_input_tokens');
    const output = advance('output_tokens');
    // Proof: dropping this check let a rollout whose cached count fell while its total held
    // import a negative row in `a Codex category that falls refuses` (2026-10-22).
    if (input < 0 || cached < 0 || written < 0 || output < 0) {
      throw new Error(
        `Codex cumulative usage fell without a restart: ${JSON.stringify(path)}:${String(line)}`,
      );
    }
    const tokens: UsageTokens = {
      input: Math.max(input - cached, 0),
      cacheWrite: written,
      cacheWriteExtended: 0,
      cacheRead: cached,
      output,
    };
    // Proof: counting `last_token_usage` instead of the advance doubled the repeated event in
    // `repeated Codex events count once` (2026-10-22).
    if (isAllZero(tokens) || !inPeriod(count.timestamp, period)) continue;
    rows.push({
      harness: 'codex',
      harnessVersion: version,
      sessionId,
      requestId: `token-count-${String(events)}`,
      model,
      instant: count.timestamp,
      branch,
      tokens,
      source: { path, line },
    });
  }
  if (sessionId !== null) {
    const key = `codex:${sessionId}`;
    const existing = sessions.get(key) ?? new Set<number>();
    for (const reference of references) existing.add(reference);
    sessions.set(key, existing);
  }
}

/**
 * Imports measured consumption from Claude Code project directories and Codex session
 * directories for one period, with the pull requests each session referenced in its output.
 *
 * @throws when a directory is absent or unreadable, an entry misses a field this reader depends
 * on, a repeated Claude request id disagrees with itself, or a Codex cumulative count falls without
 * a restart. A line that is not JSON is skipped and listed in `unreadableLines`. Rows whose categories
 * are all zero are dropped.
 */
export function importHarnessUsage(input: {
  readonly claudeProjects: readonly string[];
  readonly codexSessions: readonly string[];
  readonly period: UsagePeriod;
  readonly repositorySlug: string;
}): HarnessUsage {
  const pattern = pullRequestPattern(input.repositorySlug);
  const rows: HarnessUsageRow[] = [];
  const sessions = new Map<string, Set<number>>();
  const unreadable: UnreadableLine[] = [];
  for (const directory of input.claudeProjects) {
    for (const path of listTranscripts(directory)) {
      readClaudeTranscript(path, input.period, pattern, rows, sessions, unreadable);
    }
  }
  for (const directory of input.codexSessions) {
    for (const path of listTranscripts(directory)) {
      readCodexRollout(path, input.period, pattern, rows, sessions, unreadable);
    }
  }
  rows.sort((left, right) =>
    left.instant < right.instant ? -1 : left.instant > right.instant ? 1 : 0,
  );
  const facts: SessionFacts[] = [...sessions.entries()]
    .map(([key, references]) => {
      const separator = key.indexOf(':');
      return {
        harness: toHarness(key.slice(0, separator)),
        sessionId: key.slice(separator + 1),
        pullRequestReferences: [...references].sort((left, right) => left - right),
      };
    })
    .sort((left, right) => (left.sessionId < right.sessionId ? -1 : 1));
  return { rows, sessions: facts, unreadableLines: unreadable };
}

function toHarness(value: string): Harness {
  if (value === 'claude-code' || value === 'codex') return value;
  throw new Error(`unknown harness key: ${value}`);
}

export function emptyTokens(): UsageTokens {
  return zeroTokens();
}

export function addTokens(into: UsageTokens, more: UsageTokens): void {
  for (const category of USAGE_CATEGORIES) into[category] += more[category];
}
