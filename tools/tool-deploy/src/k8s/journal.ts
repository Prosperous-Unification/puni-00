import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { isReleasePhase, type ReleaseRequest, type ReleaseState, TERMINAL_PHASES } from './release';

/** Bumped when a stored field changes meaning; an older coordinator refuses a newer journal. */
const JOURNAL_SCHEMA = 1;

/** One write of the journal: the request it binds and the state it reached. */
export interface JournalRecord {
  schemaVersion: typeof JOURNAL_SCHEMA;
  request: ReleaseRequest;
  state: ReleaseState;
  /** Every phase this journal has recorded, oldest first, with the time it was written. */
  history: readonly { phase: string; at: string }[];
}

/**
 * Where the coordinator records release progress, outside every Kubernetes Job and Pod so a
 * restarted coordinator can finish or undo what a dead one started.
 */
export interface ReleaseJournal {
  /** Human-facing location, printed in every failure report. */
  readonly path: string;
  /** `null` only when no journal exists; unreadable or malformed journals throw. */
  read(): JournalRecord | null;
  write(record: JournalRecord): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a journal read from disk. It is trusted state the coordinator wrote itself, so a
 * shape it did not write means corruption or a newer schema, never "start over".
 */
export function parseJournal(path: string, text: string): JournalRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`release journal ${path} is not JSON`, { cause });
  }
  if (!isRecord(parsed) || parsed['schemaVersion'] !== JOURNAL_SCHEMA) {
    throw new Error(`release journal ${path} has an unsupported schema version`);
  }
  const state = parsed['state'];
  const request = parsed['request'];
  const history = parsed['history'];
  if (!isRecord(state) || !isRecord(request) || !Array.isArray(history)) {
    throw new Error(`release journal ${path} is missing its request, state or history`);
  }
  // Proof: `rejects an unknown phase` resumed from `half-migrated` as a forward phase until
  // this check refused it.
  if (!isReleasePhase(state['phase'])) {
    throw new Error(`release journal ${path} records unknown phase ${String(state['phase'])}`);
  }
  if (typeof state['releaseId'] !== 'string' || state['releaseId'] === '') {
    throw new Error(`release journal ${path} names no release`);
  }
  if (typeof state['transactionId'] !== 'string' || state['transactionId'] === '') {
    throw new Error(`release journal ${path} names no transaction`);
  }
  // Boundary: the record was produced by `JSON.stringify` of these same types in `write`, and
  // the discriminating fields above were checked; the rest is carried verbatim.
  return parsed as unknown as JournalRecord;
}

/** Durable JSON file journal: whole-file replace via fsync'd temporary and rename. */
export function fileJournal(path: string): ReleaseJournal {
  return {
    path,
    read() {
      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch (e: unknown) {
        if (isRecord(e) && e['code'] === 'ENOENT') return null;
        throw new Error(`release journal ${path} is unreadable`, { cause: e });
      }
      return parseJournal(path, text);
    },
    write(record) {
      const temporary = join(dirname(path), `.${String(process.pid)}.journal.tmp`);
      const fd = openSync(temporary, 'w', 0o600);
      try {
        writeSync(fd, `${JSON.stringify(record, null, 2)}\n`);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, path);
      const directory = openSync(dirname(path), 'r');
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    },
  };
}

export function isTerminal(state: ReleaseState): boolean {
  return (TERMINAL_PHASES as readonly string[]).includes(state.phase);
}
