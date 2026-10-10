import {
  assertErasable,
  assertRetentionCoverage,
  attachJournal,
  compactAfterErasure,
  ErasureRefusedError,
  fenceSubject,
  initJournal,
  type JournalEventBody,
  listDueRetentionSubjects,
  openMaintenanceDatabase,
  openRetentionJournal,
  prepareErasureConnection,
  readS3JournalConfig,
  releaseFence,
  RetentionJournalError,
  type RetentionJournalOptions,
  type RetentionJournalRemote,
  RetentionJournalSession,
  RetentionPolicyBusyError,
  RetentionTransitionError,
  S3JournalRemote,
} from '@website/store-sqlite';
import type { Database } from 'bun:sqlite';

import { readRetentionErasure, readRetentionJournalSetting } from './runtime-config';

type Environment = Record<string, string | undefined>;

/** What the CLI prints and its exit code; output never carries content or credentials. */
export interface JournalCommandOutcome {
  output: unknown;
  exitCode: 0 | 1;
}

export interface JournalCommandContext {
  environment: Environment;
  now: number;
  /** Replaces the S3 remote built from the environment; tests pass a memory remote. */
  remote?: RetentionJournalRemote;
}

/** The retention journal commands of `request-retention-cli.js`. */
export const journalCommands = [
  'journal-init',
  'journal-attach',
  'journal-status',
  'journal-replay',
  'event',
  'erase-due',
] as const;

const usage =
  'Usage: journal-init DATABASE | journal-attach DATABASE | journal-status DATABASE | journal-replay DATABASE | event DATABASE TYPE KIND SUBJECT_ID EVIDENCE_REFERENCE ACTOR | erase-due DATABASE';
const purpose = 'Retention journal';
const writerPattern = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/;

function writer(environment: Environment) {
  const release = environment['RETENTION_WRITER_RELEASE'];
  const privateRevision = environment['RETENTION_WRITER_REVISION'];
  if (release === undefined || !writerPattern.test(release))
    throw new Error('RETENTION_WRITER_RELEASE is missing or malformed');
  if (privateRevision === undefined || !writerPattern.test(privateRevision))
    throw new Error('RETENTION_WRITER_REVISION is missing or malformed');
  return { release, privateRevision, process: 'cli' as const };
}

/** The journal binding every command but `journal-init` needs; `disabled` refuses. */
function journalBinding(context: JournalCommandContext, readOnly = false) {
  const setting = readRetentionJournalSetting(context.environment);
  // Proof: binding a journal regardless made `erase-due refuses without a journal` fail with a foreign-journal refusal instead.
  if (setting.mode !== 's3') throw new Error('This command requires RETENTION_JOURNAL=s3');
  const options: RetentionJournalOptions = {
    journalId: setting.journalId,
    writer: { release: setting.release, privateRevision: setting.privateRevision, process: 'cli' },
    now: Date.now,
    readOnly,
  };
  return { remote: context.remote ?? new S3JournalRemote(setting.s3), options };
}

function withDatabase<T>(databasePath: string, work: (database: Database) => Promise<T>) {
  const database = openMaintenanceDatabase(databasePath, purpose);
  return work(database).finally(() => {
    database.close();
  });
}

function parseEvent(type: string, evidenceReference: string, actor: string): JournalEventBody {
  const evidence = { evidenceReference, actor };
  if (type === 'designate_client' || type === 'place_hold' || type === 'release_hold')
    return { type, ...evidence };
  if (type === 'correct_classification') return { type, to: 'non_client', ...evidence };
  throw new Error(
    'TYPE must be designate_client, correct_classification, place_hold or release_hold',
  );
}

function parseKind(value: string): 'software_request' | 'proposal_submission' {
  if (value !== 'software_request' && value !== 'proposal_submission')
    throw new Error('KIND must be software_request or proposal_submission');
  return value;
}

/** The environment segment a prefix names: `retention-journal/website-dev/` is `website-dev`. */
function environmentOf(prefix: string): string {
  const segment = prefix
    .split('/')
    .filter((part) => part !== '')
    .at(-1);
  if (segment === undefined || !/^[a-z][a-z0-9-]{0,62}$/.test(segment))
    throw new Error('RETENTION_JOURNAL_PREFIX must end in an environment segment');
  return segment;
}

function countErasedIdentities(database: Database): number {
  const row = database
    .query<{ count: number }, []>(
      "SELECT count(*) AS count FROM prospect_account WHERE email = 'erased:' || id",
    )
    .get();
  if (!row) throw new Error('Identity count query returned no row');
  return row.count;
}

/**
 * Daily cleanup (design D§7, veto V11). Refuses unless the journal is `s3`, the database is in
 * sync with it and coverage is ready. `RETENTION_ERASURE=report` prints counts only; `erase`
 * fences, rehearses, journals and blanks each due `non_client` subject in deadline order. A
 * refused subject has its fence released (or keeps it when the journal already holds its
 * erasure, for replay), is counted as an exception, and makes the run exit 1 at the end.
 */
async function eraseDue(databasePath: string, context: JournalCommandContext) {
  const { remote, options } = journalBinding(context);
  const erasure = readRetentionErasure(
    context.environment,
    readRetentionJournalSetting(context.environment),
  );
  return withDatabase(databasePath, async (database) => {
    const session = await openRetentionJournal(database, remote, options);
    // Proof: skipping this gate made `cleanup refuses while coverage is incomplete` erase the due subject beside the ambiguous one.
    assertRetentionCoverage(database.filename, context.now);
    const due = listDueRetentionSubjects(database, context.now);
    const counts = {
      mode: erasure,
      asOf: context.now,
      due: due.filter((subject) => subject.classification === 'non_client').length,
      held: due.filter((subject) => subject.classification === 'hold').length,
      client: due.filter((subject) => subject.classification === 'client').length,
      erased: 0,
      identitiesErased: 0,
      exceptions: {} as Record<string, number>,
    };
    // Proof: removing this gate made `erase-due in report mode changes nothing` erase the due subject.
    if (erasure !== 'erase') return { output: counts, exitCode: 0 as const };
    prepareErasureConnection(database);
    const identitiesBefore = countErasedIdentities(database);
    for (const subject of due.filter((candidate) => candidate.classification === 'non_client')) {
      try {
        // Proof: skipping this rehearsal let `erase-due erases due subjects, reports exceptions and exits non-zero on a refused one`
        // journal an erase that replay cannot apply, so the run aborted instead of counting the exception.
        assertErasable(database, subject);
        if (subject.erasureState === 'none') fenceSubject(database, subject);
        await session.append(subject, {
          type: 'erase',
          reason: 'due_non_client',
          deadlineAt: subject.deadlineAt,
        });
        counts.erased += 1;
      } catch (error) {
        const reason =
          error instanceof ErasureRefusedError
            ? error.reason
            : error instanceof RetentionTransitionError
              ? error.reason
              : error instanceof RetentionJournalError
                ? `journal_${error.reason}`
                : error instanceof RetentionPolicyBusyError
                  ? 'policy_busy'
                  : null;
        if (reason === null) throw error;
        counts.exceptions[reason] = (counts.exceptions[reason] ?? 0) + 1;
        // The remote may hold the erasure although the local apply failed; replay decides.
        await session.synchronise();
        releaseFence(database, subject);
      }
    }
    compactAfterErasure(database);
    counts.identitiesErased = countErasedIdentities(database) - identitiesBefore;
    return {
      output: counts,
      exitCode: Object.keys(counts.exceptions).length > 0 ? (1 as const) : (0 as const),
    };
  });
}

/**
 * Runs one retention journal command against an existing, migrated database. Every command
 * but `journal-init` requires `RETENTION_JOURNAL=s3` with its id; `journal-init` reads only the
 * bucket settings and the writer identity, creates a new journal and attaches the database.
 *
 * @throws for malformed arguments or environment, and for every journal refusal.
 */
export async function runRetentionJournalCommand(
  arguments_: string[],
  context: JournalCommandContext,
): Promise<JournalCommandOutcome> {
  const [command, databasePath, ...rest] = arguments_;
  if (!databasePath || (command !== 'event' && rest.length > 0)) throw new Error(usage);
  if (command === 'journal-init') {
    const s3 = readS3JournalConfig(context.environment);
    const journalId = crypto.randomUUID();
    const remote = context.remote ?? new S3JournalRemote(s3);
    return withDatabase(databasePath, async (database) => {
      attachJournal(database, journalId);
      try {
        await initJournal(remote, {
          journalId,
          environment: environmentOf(s3.prefix),
          writer: writer(context.environment),
          now: context.now,
        });
      } catch (error) {
        database.run(
          "UPDATE retention_journal_position SET journal_id = NULL, state = 'detached' WHERE singleton = 1",
        );
        throw error;
      }
      return { output: { journalId }, exitCode: 0 };
    });
  }
  if (command === 'journal-attach') {
    const { options } = journalBinding(context);
    return withDatabase(databasePath, (database) => {
      attachJournal(database, options.journalId);
      return Promise.resolve({ output: { attached: options.journalId }, exitCode: 0 as const });
    });
  }
  if (command === 'journal-status') {
    const { remote, options } = journalBinding(context, true);
    return withDatabase(databasePath, async (database) => ({
      output: await new RetentionJournalSession(database, remote, options).status(),
      exitCode: 0,
    }));
  }
  if (command === 'journal-replay') {
    const { remote, options } = journalBinding(context, true);
    return withDatabase(databasePath, async (database) => ({
      output: await (await openRetentionJournal(database, remote, options)).status(),
      exitCode: 0,
    }));
  }
  if (command === 'event') {
    const [type, kind, subjectId, evidenceReference, actor] = rest;
    if (rest.length !== 5 || !type || !kind || !subjectId || !evidenceReference || !actor)
      throw new Error(usage);
    const body = parseEvent(type, evidenceReference, actor);
    const { remote, options } = journalBinding(context);
    return withDatabase(databasePath, async (database) => {
      const session = await openRetentionJournal(database, remote, options);
      const event = await session.append({ kind: parseKind(kind), id: subjectId }, body);
      return { output: { sequence: event.sequence }, exitCode: 0 };
    });
  }
  if (command === 'erase-due') return eraseDue(databasePath, context);
  throw new Error(usage);
}
