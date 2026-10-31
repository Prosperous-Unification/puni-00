import type { Database } from 'bun:sqlite';

import { FORMAT4_IDENTITY, FORMAT5_IDENTITY, MIGRATIONS } from './format';
import { type SqliteFormatTransition, transitionFormat } from './format-transition';
import { encodeKey } from './identity-key';
import { readIdentityUsage } from './identity-usage';
import type { SqliteOptions } from './open-stores';
import { FORMAT4, FORMAT5, type FormatDescriptor } from './schema';

/** Preserves identity-specific usage validation, finite copying and metadata publication within the shared transaction lifecycle. */
async function transitionIdentities(
  options: SqliteOptions,
  before: FormatDescriptor,
  after: FormatDescriptor,
  kind: SqliteFormatTransition['kind'],
): Promise<SqliteFormatTransition> {
  return await transitionFormat(options, before, after, kind, (database) => {
    const migration = MIGRATIONS[4];
    return {
      assertUnused:
        kind === 'downgraded'
          ? () => {
              // Proof: Task3 050 omitted this check; direct SQL still refused used downgrade, but the API lost its used_history category. Diagnostic-only.
              if (readIdentityUsage(database) !== 0) throw new Error('identity keys are in use');
            }
          : undefined,
      apply() {
        const statements =
          kind === 'upgraded'
            ? migration.forwardStatements
            : migration.down
                .split('--> statement-breakpoint')
                .map((statement) => statement.trim())
                .filter((statement) => statement.length > 0);
        for (const statement of statements) database.run(statement);
        if (kind === 'upgraded') copyIdentityRows(database);
        database
          .query('UPDATE run_meta SET schema_version=? WHERE singleton=1')
          .run(after.identity.version);
        database
          .query('UPDATE run_format SET bundle_hash=? WHERE singleton=1')
          .run(after.identity.bundleHash);
      },
    };
  });
}
/** Upgrades a fully audited genuine format4 store by encoding physical keys and preserving payload bytes. Ordinary open never calls this operator boundary. */
export async function upgradeSqliteIdentityKeys(
  options: SqliteOptions,
): Promise<SqliteFormatTransition> {
  return await transitionIdentities(options, FORMAT4, FORMAT5, 'upgraded');
}
/** Removes only unused format5 structures, retaining predecessor records and the greatest observed clock. */
export async function downgradeUnusedSqliteIdentityKeys(
  options: SqliteOptions,
): Promise<SqliteFormatTransition> {
  return await transitionIdentities(options, FORMAT5, FORMAT4, 'downgraded');
}
export { FORMAT4_IDENTITY, FORMAT5_IDENTITY };
export type { SqliteFormatIdentity, SqliteMigrationIdentity } from './format';

/** Finite audited predecessor projection: only key fields change; serialized values are bound verbatim. */
function copyIdentityRows(database: Database): void {
  for (const row of database
    .query<{ run_id: string; manifest_digest: string; record: string; initial_record: string }, []>(
      'SELECT run_id,manifest_digest,record,initial_record FROM run_record',
    )
    .all())
    database
      .query(
        'INSERT INTO run5_record(run_id,manifest_digest,record,initial_record) VALUES (?,?,?,?)',
      )
      .run(encodeKey(row.run_id), row.manifest_digest, row.record, row.initial_record);
  for (const row of database
    .query<
      {
        attempt_id: string;
        run_id: string;
        occurrence_id: string;
        ordinal: number;
        record: string;
        admission: string;
      },
      []
    >('SELECT attempt_id,run_id,occurrence_id,ordinal,record,admission FROM run_attempt')
    .all())
    database
      .query(
        'INSERT INTO run5_attempt(attempt_id,run_id,occurrence_id,ordinal,record,admission) VALUES (?,?,?,?,?,?)',
      )
      .run(
        encodeKey(row.attempt_id),
        encodeKey(row.run_id),
        encodeKey(row.occurrence_id),
        row.ordinal,
        row.record,
        row.admission,
      );
  for (const row of database
    .query<{ attempt_id: string }, []>('SELECT attempt_id FROM run_reservation')
    .all())
    database
      .query('INSERT INTO run5_reservation(attempt_id) VALUES (?)')
      .run(encodeKey(row.attempt_id));
  for (const row of database
    .query<{ command_id: string; attempt_id: string; record: string; reply: string }, []>(
      'SELECT command_id,attempt_id,record,reply FROM run_execution',
    )
    .all())
    database
      .query('INSERT INTO run5_execution(command_id,attempt_id,record,reply) VALUES (?,?,?,?)')
      .run(encodeKey(row.command_id), encodeKey(row.attempt_id), row.record, row.reply);
  for (const row of database
    .query<{ command_id: string; attempt_id: string; record: string }, []>(
      'SELECT command_id,attempt_id,record FROM run_completion',
    )
    .all())
    database
      .query('INSERT INTO run5_completion(command_id,attempt_id,record) VALUES (?,?,?)')
      .run(encodeKey(row.command_id), encodeKey(row.attempt_id), row.record);
  for (const row of database
    .query<{ command_id: string }, []>('SELECT command_id FROM run_outbox')
    .all())
    database.query('INSERT INTO run5_outbox(command_id) VALUES (?)').run(encodeKey(row.command_id));
  for (const row of database
    .query<{ decision_id: string; attempt_id: string; record: string }, []>(
      'SELECT decision_id,attempt_id,record FROM run_decision',
    )
    .all())
    database
      .query('INSERT INTO run5_decision(decision_id,attempt_id,record) VALUES (?,?,?)')
      .run(encodeKey(row.decision_id), encodeKey(row.attempt_id), row.record);
  for (const row of database
    .query<
      {
        decision_id: string;
        attempt_id: string;
        correlation_key: string;
        wait: string;
        reply: string;
      },
      []
    >('SELECT decision_id,attempt_id,correlation_key,wait,reply FROM run_consumption')
    .all())
    database
      .query(
        'INSERT INTO run5_consumption(decision_id,attempt_id,correlation_key,wait,reply) VALUES (?,?,?,?,?)',
      )
      .run(
        encodeKey(row.decision_id),
        encodeKey(row.attempt_id),
        encodeKey(row.correlation_key),
        row.wait,
        row.reply,
      );
  for (const row of database
    .query<{ command_id: string; attempt_id: string; record: string; reply: string }, []>(
      'SELECT command_id,attempt_id,record,reply FROM run_receipt',
    )
    .all())
    database
      .query('INSERT INTO run5_receipt(command_id,attempt_id,record,reply) VALUES (?,?,?,?)')
      .run(encodeKey(row.command_id), encodeKey(row.attempt_id), row.record, row.reply);
  for (const row of database
    .query<{ scope_key: string; pin: string; revision: number }, []>(
      'SELECT scope_key,pin,revision FROM run_runtime_scope',
    )
    .all())
    database
      .query('INSERT INTO run5_runtime_scope(scope_key,pin,revision) VALUES (?,?,?)')
      .run(row.scope_key, row.pin, row.revision);
  for (const row of database
    .query<{ command_id: string; scope_key: string; record: string }, []>(
      'SELECT command_id,scope_key,record FROM run_runtime_intent',
    )
    .all())
    database
      .query('INSERT INTO run5_runtime_intent(command_id,scope_key,record) VALUES (?,?,?)')
      .run(encodeKey(row.command_id), row.scope_key, row.record);
  for (const row of database
    .query<{ command_id: string; scope_key: string; record: string }, []>(
      'SELECT command_id,scope_key,record FROM run_runtime_acceptance',
    )
    .all())
    database
      .query('INSERT INTO run5_runtime_acceptance(command_id,scope_key,record) VALUES (?,?,?)')
      .run(encodeKey(row.command_id), row.scope_key, row.record);
  for (const row of database
    .query<
      {
        recovery_id: string;
        command_id: string;
        scope_key: string;
        revision: number;
        record: string;
      },
      []
    >('SELECT recovery_id,command_id,scope_key,revision,record FROM run_recovery_journal')
    .all())
    database
      .query(
        'INSERT INTO run5_recovery_journal(recovery_id,command_id,scope_key,revision,record) VALUES (?,?,?,?,?)',
      )
      .run(
        encodeKey(row.recovery_id),
        encodeKey(row.command_id),
        row.scope_key,
        row.revision,
        row.record,
      );
  for (const row of database
    .query<
      {
        recovery_id: string;
        ordinal: number;
        command_id: string;
        revision: number;
        record: string;
      },
      []
    >('SELECT recovery_id,ordinal,command_id,revision,record FROM run_recovery_fence')
    .all())
    database
      .query(
        'INSERT INTO run5_recovery_fence(recovery_id,ordinal,command_id,revision,record) VALUES (?,?,?,?,?)',
      )
      .run(
        encodeKey(row.recovery_id),
        row.ordinal,
        encodeKey(row.command_id),
        row.revision,
        row.record,
      );
  for (const row of database
    .query<{ recovery_id: string; ordinal: number; revision: number; record: string }, []>(
      'SELECT recovery_id,ordinal,revision,record FROM run_recovery_observation',
    )
    .all())
    database
      .query(
        'INSERT INTO run5_recovery_observation(recovery_id,ordinal,revision,record) VALUES (?,?,?,?)',
      )
      .run(encodeKey(row.recovery_id), row.ordinal, row.revision, row.record);
  for (const row of database
    .query<{ recovery_id: string; revision: number; record: string }, []>(
      'SELECT recovery_id,revision,record FROM run_recovery_closure',
    )
    .all())
    database
      .query('INSERT INTO run5_recovery_closure(recovery_id,revision,record) VALUES (?,?,?)')
      .run(encodeKey(row.recovery_id), row.revision, row.record);
  for (const row of database
    .query<{ scope_key: string; scope_after: number; recovery_id: string; record: string }, []>(
      'SELECT scope_key,scope_after,recovery_id,record FROM run_recovery_barrier',
    )
    .all())
    database
      .query(
        'INSERT INTO run5_recovery_barrier(scope_key,scope_after,recovery_id,record) VALUES (?,?,?,?)',
      )
      .run(row.scope_key, row.scope_after, encodeKey(row.recovery_id), row.record);
  for (const row of database
    .query<{ scope_key: string; recovery_id: string }, []>(
      'SELECT scope_key,recovery_id FROM run_recovery_active',
    )
    .all())
    database
      .query('INSERT INTO run5_recovery_active(scope_key,recovery_id) VALUES (?,?)')
      .run(row.scope_key, encodeKey(row.recovery_id));
  database.run(
    'UPDATE run5_runtime_format SET (scope_count,intent_count,acceptance_count)=(SELECT scope_count,intent_count,acceptance_count FROM run_format WHERE singleton=1) WHERE singleton=1',
  );
  database.run(
    'UPDATE run5_recovery_format SET (journal_count,fence_count,observation_count,closure_count,barrier_count,active_count)=(SELECT journal_count,fence_count,observation_count,closure_count,barrier_count,active_count FROM run_recovery_format WHERE singleton=1) WHERE singleton=1',
  );
}
