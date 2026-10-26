import { type } from 'arktype';

import type { Publication } from './probe';
import { createDevDockerCommand, executeBounded, validateDevContainer } from './source';

const Record = type({
  service: "'mcp-01'",
  time: 'number',
  level: "'debug' | 'info' | 'warn' | 'error' | 'fatal'",
  msg: 'string',
  'event?': 'string',
  'method?': 'string',
  'path?': 'string',
  'grant_type?': 'string',
  'status?': 'number',
});
export interface ApplicationRecord {
  time: number;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  body: string;
}
export interface LogWindow {
  containerId: string;
  since: number;
  until: number;
}
export interface ParsedLogs {
  state: 'complete' | 'incomplete';
  records: ApplicationRecord[];
  unsupported: number;
  invalid: number;
  truncated: boolean;
}
export interface ApplicationLogState {
  state: 'complete' | 'incomplete' | 'unavailable';
  reason:
    | 'collected'
    | 'unsupported'
    | 'invalid-records'
    | 'truncated'
    | 'source-unavailable'
    | 'publication-failed'
    | 'deadline';
  checkedAt: number;
  containerId: string | null;
  accepted: number;
  unsupported: number;
  invalid: number;
}

/** Supported producer is mcp-01. Untrusted text stays inside the collector-redacted body. */
export function parseApplicationLogs(text: string, window: LogWindow): ParsedLogs {
  // Proof: allowing a foreign container/window fails the invalid trusted log-window negatives.
  if (
    !/^[a-f0-9]{64}$/.test(window.containerId) ||
    !Number.isFinite(window.since) ||
    !Number.isFinite(window.until) ||
    window.since < 0 ||
    window.until < window.since ||
    window.until - window.since > 120000
  )
    throw new Error('Invalid application log window');
  const parsed: ParsedLogs = {
    state: 'complete',
    records: [],
    unsupported: 0,
    invalid: 0,
    truncated: false,
  };
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  // Proof: byte and tail cap removals independently fail explicit truncation assertions.
  if (Buffer.byteLength(text) > 32768 || lines.length >= 1000) {
    parsed.state = 'incomplete';
    parsed.truncated = true;
    return parsed;
  }
  for (const line of lines) {
    if (!line.trimStart().startsWith('{')) {
      parsed.unsupported++;
      continue;
    }
    let wire: unknown;
    try {
      wire = JSON.parse(line);
    } catch (error) {
      if (error instanceof SyntaxError) {
        parsed.invalid++;
        continue;
      }
      throw error;
    }
    // Proof: relaxing producer identity or either time bound independently exports invalid supported records.
    const checked = Record(wire);
    if (
      checked instanceof type.errors ||
      !Number.isInteger(checked.time) ||
      checked.time < window.since ||
      checked.time > window.until
    ) {
      parsed.invalid++;
      continue;
    }
    const { msg, event, method, path, grant_type, status } = checked;
    parsed.records.push({
      time: checked.time,
      level: checked.level,
      body: JSON.stringify({ msg, event, method, path, grant_type, status }),
    });
  }
  if (parsed.unsupported !== 0 || parsed.invalid !== 0) parsed.state = 'incomplete';
  return parsed;
}
function attribute(key: string, value: string) {
  return { key, value: { stringValue: value } };
}
/** No revision is synthesized from current health. No arbitrary source attribute bypasses body redaction. */
export function encodeApplicationLogs(records: ApplicationRecord[], containerId: string) {
  // Proof: accepting the container name fails the invalid source ID encoding negative.
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error('Invalid source container ID');
  const levels = { debug: 5, info: 9, warn: 13, error: 17, fatal: 21 };
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            attribute('service.name', 'mcp-01'),
            attribute('deployment.environment.name', 'dev'),
          ],
        },
        scopeLogs: [
          {
            scope: { name: 'puni-dev-application-log' },
            logRecords: records.map((record) => ({
              timeUnixNano: String(BigInt(record.time) * 1000000n),
              observedTimeUnixNano: String(BigInt(Date.now()) * 1000000n),
              severityNumber: levels[record.level],
              severityText: record.level.toUpperCase(),
              body: { stringValue: record.body },
              // Proof: copying record.body to an OTLP attribute fails the credential-shaped attribute bypass negative.
              attributes: [
                attribute('puni.source.kind', 'ssh-dev-container'),
                attribute('puni.target.container', 'wbs-dev-src'),
                attribute('puni.target.container.id', containerId),
                attribute('puni.target.mount.source', '/home/puni1/wbs-dev/src'),
                attribute('puni.revision.provenance', 'not-emitted'),
              ],
            })),
          },
        ],
      },
    ],
  };
}

/** A fresh inspect precedes every ID-pinned log read; a small in-memory window is not a telemetry store. */
export function createApplicationLogCollector(options: {
  sshExecutable?: string;
  publish(
    records: ApplicationRecord[],
    containerId: string,
    signal: AbortSignal,
  ): Promise<Publication>;
}): { collect(signal: AbortSignal): Promise<ApplicationLogState> } {
  const prefix = createDevDockerCommand(options.sshExecutable);
  let cursor: { containerId: string; until: number } | undefined;
  return {
    collect: async (parent) => {
      const signal = AbortSignal.any([parent, AbortSignal.timeout(10000)]),
        checkedAt = Date.now();
      const state: ApplicationLogState = {
        state: 'unavailable',
        reason: 'source-unavailable',
        checkedAt,
        containerId: null,
        accepted: 0,
        unsupported: 0,
        invalid: 0,
      };
      try {
        const inspected = await executeBounded([...prefix, 'inspect', 'wbs-dev-src'], '', signal);
        if (inspected.exitCode !== 0) return state;
        try {
          state.containerId = validateDevContainer(inspected.stdout);
        } catch (error) {
          // Docker inspection is an untrusted external boundary, never a fallback to another source.
          if (error instanceof Error) return state;
          throw error;
        }
        const until = Date.now();
        const since =
          cursor?.containerId === state.containerId
            ? Math.max(cursor.until, until - 120000)
            : until - 120000;
        // Proof: replacing the inspected ID with the name fails the actual SSH recreation fixture.
        const captured = await executeBounded(
          [
            ...prefix,
            'logs',
            '--since',
            new Date(since).toISOString(),
            '--until',
            new Date(until).toISOString(),
            '--tail',
            '1000',
            state.containerId,
            '2>&1',
          ],
          '',
          signal,
        );
        if (captured.exitCode !== 0) return state;
        const parsed = parseApplicationLogs(captured.stdout, {
          containerId: state.containerId,
          since,
          until,
        });
        state.unsupported = parsed.unsupported;
        state.invalid = parsed.invalid;
        if (parsed.records.length !== 0) {
          const publication = await options.publish(parsed.records, state.containerId, signal);
          // Proof: accepting failed publication fails the independent collection/retry checkpoint test.
          if (publication.state !== 'acknowledged')
            return { ...state, reason: 'publication-failed' };
          state.accepted = parsed.records.length;
        }
        cursor = { containerId: state.containerId, until };
        return {
          ...state,
          state: parsed.state,
          reason: parsed.truncated
            ? 'truncated'
            : parsed.invalid !== 0
              ? 'invalid-records'
              : parsed.unsupported !== 0
                ? 'unsupported'
                : 'collected',
        };
      } catch (error) {
        if (signal.aborted) return { ...state, reason: 'deadline' };
        if (error instanceof RangeError)
          return { ...state, state: 'incomplete', reason: 'truncated' };
        throw error;
      }
    },
  };
}
