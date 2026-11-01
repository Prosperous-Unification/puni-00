import type { Database } from 'bun:sqlite';

import { FORMAT5_IDENTITY, FORMAT6_IDENTITY, MIGRATIONS } from './format';
import { type SqliteFormatTransition, transitionFormat } from './format-transition';
import { KEYED_TABLES } from './identity-key';
import type { SqliteOptions } from './open-stores';
import { FORMAT5, FORMAT6, type FormatDescriptor, WRITE_TABLES } from './schema';
import { readWriteUsage } from './write-usage';
const copies = [
  // Proof: copy-record broke “preserving write transition retains genuine queued”; exact source hash restored.
  [KEYED_TABLES.record, WRITE_TABLES.record],
  [KEYED_TABLES.attempt, WRITE_TABLES.attempt],
  [KEYED_TABLES.reservation, WRITE_TABLES.reservation],
  // Proof: copy-execution broke “preserving write transition retains genuine receipt_settled”; exact source hash restored.
  [KEYED_TABLES.execution, WRITE_TABLES.execution],
  [KEYED_TABLES.completion, WRITE_TABLES.completion],
  [KEYED_TABLES.outbox, WRITE_TABLES.outbox],
  // Proof: copy-decision broke “preserving write transition retains genuine decision_consumed”; exact source hash restored.
  [KEYED_TABLES.decision, WRITE_TABLES.decision],
  [KEYED_TABLES.consumption, WRITE_TABLES.consumption],
  // Proof: copy-receipt broke “preserving write transition retains genuine receipt_settled”; exact source hash restored.
  [KEYED_TABLES.receipt, WRITE_TABLES.receipt],
  [KEYED_TABLES.runtime_scope, WRITE_TABLES.runtime_scope],
  [KEYED_TABLES.runtime_intent, WRITE_TABLES.runtime_intent],
  // Proof: copy-runtime_acceptance broke “preserving write transition retains genuine authority_accepted”; exact source hash restored.
  [KEYED_TABLES.runtime_acceptance, WRITE_TABLES.runtime_acceptance],
  [KEYED_TABLES.recovery_journal, WRITE_TABLES.recovery_journal],
  [KEYED_TABLES.recovery_fence, WRITE_TABLES.recovery_fence],
  // Proof: copy-recovery_observation broke “preserving write transition retains genuine authority_recovery_closed”; exact source hash restored.
  [KEYED_TABLES.recovery_observation, WRITE_TABLES.recovery_observation],
  [KEYED_TABLES.recovery_closure, WRITE_TABLES.recovery_closure],
  [KEYED_TABLES.recovery_barrier, WRITE_TABLES.recovery_barrier],
  // Proof: copy-recovery_active broke “preserving write transition retains genuine authority_recovery_active”; exact source hash restored.
  [KEYED_TABLES.recovery_active, WRITE_TABLES.recovery_active],
] as const;
/** Finite compiled table pairs copy already canonical private keys and serialized payloads verbatim. The enclosing complete physical audits establish their identical column layouts. */
function copyWriteRows(database: Database): void {
  for (const [previous, next] of copies)
    database.run(`INSERT INTO ${next} SELECT * FROM ${previous}`);
  // Proof: copy-runtime-counts broke “preserving write transition retains genuine authority_accepted”; exact source hash restored.
  database.run(
    'UPDATE run6_runtime_format SET (scope_count,intent_count,acceptance_count)=(SELECT scope_count,intent_count,acceptance_count FROM run5_runtime_format WHERE singleton=1) WHERE singleton=1',
  );
  // Proof: copy-recovery-counts broke “preserving write transition retains genuine authority_recovery_closed”; exact source hash restored.
  database.run(
    'UPDATE run6_recovery_format SET (journal_count,fence_count,observation_count,closure_count,barrier_count,active_count)=(SELECT journal_count,fence_count,observation_count,closure_count,barrier_count,active_count FROM run5_recovery_format WHERE singleton=1) WHERE singleton=1',
  );
}
async function transitionWrites(
  options: SqliteOptions,
  before: FormatDescriptor,
  after: FormatDescriptor,
  kind: SqliteFormatTransition['kind'],
): Promise<SqliteFormatTransition> {
  return await transitionFormat(options, before, after, kind, (database) => ({
    assertUnused:
      kind === 'downgraded'
        ? () => {
            // Proof: usage-api-down-refusal broke “used successor refuses down and preserves the complete committed format”; exact source hash restored.
            if (readWriteUsage(database) !== 0) throw new Error('runtime writes are in use');
          }
        : undefined,
    // Proof: remaining-transition-rollback broke “late write up DDL abort rolls back the complete declaration set”; exact source hash restored.
    apply() {
      const migration = MIGRATIONS[5];
      const statements =
        kind === 'upgraded'
          ? migration.forwardStatements
          : migration.down
              .split('--> statement-breakpoint')
              .map((statement) => statement.trim())
              .filter((statement) => statement.length > 0);
      for (const statement of statements) database.run(statement);
      if (kind === 'upgraded') copyWriteRows(database);
      database
        .query('UPDATE run_meta SET schema_version=? WHERE singleton=1')
        .run(after.identity.version);
      database
        .query('UPDATE run_format SET bundle_hash=? WHERE singleton=1')
        // Proof: durable-identity-publication broke “genuine already-open format5 semantic writer is fenced by published6”; exact source hash restored.
        .run(after.identity.bundleHash);
    },
  }));
}
/** Explicit fully audited5→6 preserving transition. Ordinary open never invokes it. */
export async function upgradeSqliteWrites(options: SqliteOptions): Promise<SqliteFormatTransition> {
  return await transitionWrites(options, FORMAT5, FORMAT6, 'upgraded');
}
/** Refuses semantic successor use before destructive down; predecessor payloads and greatest refusal clock survive. */
export async function downgradeUnusedSqliteWrites(
  options: SqliteOptions,
): Promise<SqliteFormatTransition> {
  return await transitionWrites(options, FORMAT6, FORMAT5, 'downgraded');
}
export { FORMAT5_IDENTITY, FORMAT6_IDENTITY };
