import { randomBytes } from 'node:crypto';
import { chmod, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import { type } from 'arktype';

const sha256 = /^[0-9a-f]{64}$/;
const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const ObservationSchema = type({
  digest: 'string>0',
  targetIdentities: 'string[]',
  providerState: "'ready'|'pending-deletion'",
  'terraformState?': {
    lineage: 'string>0',
    serial: 'number.integer>=0',
    '+': 'reject',
  },
  '+': 'reject',
});

const CompletedStepSchema = type({
  stepId: 'string>0',
  effect: 'string>0',
  beforeObservationSha256: sha256,
  beforeObservation: ObservationSchema,
  afterObservationSha256: sha256,
  afterObservation: ObservationSchema,
  'externalResourceId?': 'string>0',
  '+': 'reject',
});

const ActiveStepSchema = type({
  stepId: 'string>0',
  effect: 'string>0',
  beforeObservationSha256: sha256,
  beforeObservation: ObservationSchema,
  '+': 'reject',
});

const OperationJournalSchema = type({
  schemaVersion: '1',
  operationId: sha256,
  planSha256: sha256,
  state: "'running'|'recoverable'|'complete'",
  leaseOwner: 'string>0',
  'activeStep?': ActiveStepSchema,
  completedSteps: CompletedStepSchema.array(),
  updatedAt: instant,
  '+': 'reject',
});

export type CompletedOperationStep = typeof CompletedStepSchema.infer;
export type OperationJournal = typeof OperationJournalSchema.infer;
export type JournalWriteFault = 'before-rename';

/** Read required durable operation state and reject missing, unreadable, malformed, or inexact bytes. */
export async function readOperationJournal(path: string): Promise<OperationJournal> {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    // Proof: chmod 000 and absent-file production-reader tests both fail here with journal context.
    throw new Error(`Cannot read required operation journal at ${path}`, { cause });
  }
  let input: unknown;
  try {
    input = JSON.parse(source) as unknown;
  } catch (cause) {
    // Proof: the truncated-JSON production-reader negative fails here before resume can mutate.
    throw new Error(`Malformed operation journal at ${path}`, { cause });
  }
  const journal = OperationJournalSchema(input);
  if (journal instanceof type.errors) {
    // Proof: an unknown completed field is rejected by the production reader before step replay.
    throw new Error(`Operation journal validation failed at ${path}: ${journal.summary}`, {
      cause: journal,
    });
  }
  return journal;
}

/** Atomically replace owner-only operation state after syncing the candidate bytes. */
export async function writeOperationJournal(
  path: string,
  journal: OperationJournal,
  fault?: JournalWriteFault,
): Promise<void> {
  const validated = OperationJournalSchema(journal);
  if (validated instanceof type.errors) {
    throw new Error(`Cannot persist invalid operation journal: ${validated.summary}`, {
      cause: validated,
    });
  }
  const candidatePath = `${path}.${randomBytes(8).toString('hex')}.new`;
  const candidate = await open(candidatePath, 'wx', 0o600);
  try {
    await candidate.writeFile(`${JSON.stringify(validated, undefined, 2)}\n`, 'utf8');
    await candidate.sync();
  } finally {
    await candidate.close();
  }
  try {
    if (fault === 'before-rename') {
      // Proof: this injected crash leaves the previous journal byte-for-byte intact.
      throw new Error('Injected journal failure before rename');
    }
    await rename(candidatePath, path);
    await chmod(path, 0o600);
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (cause) {
    try {
      await unlink(candidatePath);
    } catch (cleanupCause) {
      if (!(
        cleanupCause instanceof Error &&
        'code' in cleanupCause &&
        cleanupCause.code === 'ENOENT'
      )) {
        throw new AggregateError([cause, cleanupCause], `Cannot clean failed journal candidate`, {
          cause: cleanupCause,
        });
      }
    }
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Cannot replace operation journal: ${detail}`, { cause });
  }
}
