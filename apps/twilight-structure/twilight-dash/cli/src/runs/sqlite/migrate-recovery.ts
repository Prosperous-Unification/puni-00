import { FORMAT3_IDENTITY, FORMAT4_IDENTITY, MIGRATIONS } from './format';
import { type SqliteFormatTransition, transitionFormat } from './format-transition';
import type { SqliteOptions } from './open-stores';
import { readHistoryForFormat } from './read-history';
import { FORMAT3, FORMAT4, type FormatDescriptor } from './schema';

/** Preserves recovery-specific read classification and publication statements within the shared transaction lifecycle. */
async function transitionRecovery(
  options: SqliteOptions,
  before: FormatDescriptor,
  after: FormatDescriptor,
  kind: SqliteFormatTransition['kind'],
): Promise<SqliteFormatTransition> {
  return await transitionFormat(options, before, after, kind, (database) => {
    const migration = MIGRATIONS[3];
    // Reading the catalog belongs to corruption inspection, before the unused-history phase.
    const history = kind === 'downgraded' ? readHistoryForFormat(database, before) : undefined;
    return {
      assertUnused:
        history === undefined
          ? undefined
          : () => {
              const { catalog } = history;
              const counts = catalog.runtime.recovery.counts;
              // Proof: T3M4API removing this precheck changed used_history to the later SQL CHECK failure; diagnostic-only, the down artifact retained refusal; exact restoration passed.
              if (
                Object.values(counts).some((count) => count !== 0) ||
                catalog.attempts.some(({ attempt }) => attempt.version !== 2)
              )
                throw new Error('recovery history is in use');
            },
      apply() {
        const statements =
          kind === 'upgraded'
            ? migration.forwardStatements
            : migration.down
                .split('--> statement-breakpoint')
                .map((statement) => statement.trim())
                .filter((statement) => statement.length > 0);
        for (const statement of statements) database.run(statement);
        // Proof: T8M2 supplied the predecessor hash only through this new format4 dependency; actual pinned BUSY and queued writers inserted one/two manifest rows on physical4 with inherited guards installed. Exact restoration refused and preserved all rows.
        database
          .query('UPDATE run_format SET bundle_hash=? WHERE singleton=1')
          .run(after.identity.bundleHash);
      },
    };
  });
}
/** Upgrades an existing genuine format3 store without acquiring ownership or rewriting legacy records. Ordinary open never calls this operator boundary. */
export async function upgradeSqliteStores(options: SqliteOptions): Promise<SqliteFormatTransition> {
  return await transitionRecovery(options, FORMAT3, FORMAT4, 'upgraded');
}
/** Reverses only an unused recovery schema, preserving populated old history. Any valid recovery use or corrupt successor state refuses before destructive statements. */
export async function downgradeUnusedSqliteStores(
  options: SqliteOptions,
): Promise<SqliteFormatTransition> {
  return await transitionRecovery(options, FORMAT4, FORMAT3, 'downgraded');
}
export { FORMAT3_IDENTITY, FORMAT4_IDENTITY };
export type { SqliteFormatIdentity, SqliteMigrationIdentity } from './format';
export type { SqliteFormatTransition, SqliteTransitionFailure } from './format-transition';
export { SqliteFormatTransitionError } from './format-transition';
