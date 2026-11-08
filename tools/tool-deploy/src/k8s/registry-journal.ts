import { closeSync, fsyncSync, openSync, renameSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { readRegistryOwnerFile } from '@tools/registry-publication';
import { parseRegistryHistory, type RegistryHistory } from '@tools/registry-publication';
import { type } from 'arktype';

import { type JournalProgress, parseJournalState } from './journal-state';
import { type ReleaseRegistryBinding, type ReleaseRequest } from './release';
import { assertReplayProgress } from './replay-receipt';

/** Bumped when a stored field changes meaning; an older coordinator refuses a newer journal. */
const JOURNAL_SCHEMA = 4;

/** Historical pre-controller progress only; a current controller record cannot become dormant registry authority. */
export type RegistryJournalProgress = JournalProgress & { controllers?: never };

/** One write of the journal: the request it binds and the state it reached. */
export interface RegistryJournalRecord {
  schemaVersion: typeof JOURNAL_SCHEMA | 3;
  /** Schema3 is legacy-only; schema4 always records null or its exact managed authority binding. */
  registry?: ReleaseRegistryBinding | null;
  registryHistory?: RegistryHistory | null;
  request: ReleaseRequest;
  state: RegistryJournalProgress;
  /** Every phase this journal has recorded, oldest first, with the time it was written. */
  history: readonly { phase: string; at: string }[];
}

/**
 * Where the coordinator records release progress, outside every Kubernetes Job and Pod so a
 * restarted coordinator can finish or undo what a dead one started.
 */
export interface RegistryReleaseJournal {
  /** Human-facing location, printed in every failure report. */
  readonly path: string;
  /** `null` only when no journal exists; unreadable or malformed journals throw. */
  read(): RegistryJournalRecord | null;
  /** Explicit initialized/inherited owner history; absence cannot initialize managed mode. */
  readHistory?(): RegistryHistory | null;
  write(record: RegistryJournalRecord): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a journal read from disk. It is trusted state the coordinator wrote itself, so a
 * shape it did not write means corruption or a newer schema, never "start over".
 */
export function parseRegistryJournal(path: string, text: string): RegistryJournalRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`release journal ${path} is not JSON`, { cause });
  }
  // Proof: bypassing this legacy-version route made `refuses a legacy in-flight journal`
  // report a generic unsupported schema instead of the required prior-executor procedure.
  if (isRecord(parsed) && (parsed['schemaVersion'] === 1 || parsed['schemaVersion'] === 2)) {
    throw new Error(
      `release journal ${path} has a legacy migration capture or replay progress; use the prior executor/manual recovery`,
    );
  }
  if (
    !isRecord(parsed) ||
    (parsed['schemaVersion'] !== JOURNAL_SCHEMA && parsed['schemaVersion'] !== 3)
  ) {
    throw new Error(`release journal ${path} has an unsupported schema version`);
  }
  const progress = parseJournalState(path, parsed);
  const state = progress.state;
  // Proof: omitting only controller-family refusal admits the injected controller record through registryFileJournal in the dormant journal family negative.
  if (Object.hasOwn(state, 'controllers'))
    throw new Error(`release journal ${path} has controller progress in a dormant registry family`);
  // Proof: skipping disk replay validation returns corrupted progress in the resume refusal fixtures.
  assertReplayProgress(state, progress.request);
  if (parsed['schemaVersion'] === JOURNAL_SCHEMA) {
    const binding = type.or('null', {
      registryId: 'string > 0',
      operationId: 'string > 0',
      references: type({ repository: 'string > 0', digest: /^sha256:[0-9a-f]{64}$/, '+': 'reject' })
        .array()
        .atLeastLength(1),
      '+': 'reject',
    })(parsed['registry']);
    if (
      binding instanceof type.errors ||
      // Proof: omitting operation equality accepts foreign schema4 binding in journal.test.
      (binding !== null && binding.operationId !== state.transactionId)
    )
      throw new Error(`release journal ${path} has an invalid registry binding`);
    if (binding === null) {
      if (parsed['registryHistory'] !== null)
        throw new Error('Unmanaged release carries registry history');
    } else {
      const registryHistory = parseRegistryHistory(parsed['registryHistory'], path);
      // Proof: comparison removal accepted foreign managed history authority in registry-journal.test.ts.
      if (registryHistory.registryId !== binding.registryId)
        throw new Error('Release history authority differs');
    }
  } else if (parsed['registry'] !== undefined || parsed['registryHistory'] !== undefined)
    throw new Error(`legacy release journal ${path} cannot carry a registry binding`);
  // Boundary: schema, binding/history, controller absence and shared request/state/replay fields were validated; original progress is retained verbatim.
  return parsed as unknown as RegistryJournalRecord;
}

/** Durable JSON file journal: whole-file replace via fsync'd temporary and rename. */
export function registryFileJournal(path: string): RegistryReleaseJournal {
  return {
    path,
    read() {
      let text: string;
      try {
        text = readRegistryOwnerFile(path);
      } catch (e: unknown) {
        if (isRecord(e) && e['code'] === 'ENOENT') return null;
        throw new Error(`release journal ${path} is unreadable`, { cause: e });
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch (cause) {
        throw new Error(`release journal ${path} is not JSON`, { cause });
      }
      if (parseReleaseInheritance(parsed, path) !== undefined) return null;
      return parseRegistryJournal(path, text);
    },
    readHistory() {
      const record = this.read();
      if (record !== null) return record.registryHistory ?? null;
      try {
        return (
          parseReleaseInheritance(JSON.parse(readRegistryOwnerFile(path)) as unknown, path) ?? null
        );
      } catch (cause) {
        if (isRecord(cause) && cause['code'] === 'ENOENT') return null;
        throw cause;
      }
    },
    write(record) {
      const serialized = `${JSON.stringify(record, null, 2)}\n`;
      // Proof: guard removal wrote oversized history instead of refusing before replacement.
      if (Buffer.byteLength(serialized) > 4 * 1024 ** 2)
        throw new Error('Release owner journal capacity exceeded');
      const temporary = join(dirname(path), `.${String(process.pid)}.journal.tmp`);
      const fd = openSync(temporary, 'w', 0o600);
      try {
        writeSync(fd, serialized);
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

/** Only an explicit populated first-start inheritance can seed the regular-release owner journal. */
export function parseReleaseInheritance(input: unknown, path: string): RegistryHistory | undefined {
  if (!isRecord(input) || input['kind'] !== 'registry-inheritance') return undefined;
  const envelope = type({
    schemaVersion: '4',
    kind: "'registry-inheritance'",
    registryHistory: 'unknown',
    '+': 'reject',
  })(input);
  if (envelope instanceof type.errors) throw new Error('Malformed release history inheritance');
  const history = parseRegistryHistory(envelope.registryHistory, path);
  if (
    history.releases.length === 0 ||
    history.promotion === null ||
    history.inheritance === undefined ||
    history.inheritance.source === path ||
    history.inheritance.operationId !== history.promotion.operationId
  )
    throw new Error('Release history inheritance lacks completed first-start evidence');
  return history;
}
