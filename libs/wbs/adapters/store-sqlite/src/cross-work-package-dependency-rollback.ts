import { drizzle } from 'drizzle-orm/bun-sqlite';

import { inspectDependencyActivation } from './cross-work-package-dependency-activation';
import type { openDatabase } from './db';
import { inspectLegacyDependencyActivation } from './legacy-dependency-activation';

const ACTIVATION = '20261022212000_add_cross_project_dependency_activation';
const RENAME = '20261110100000_rename_project_to_work_package';

/**
 * Admits the complete rollback selection before its first down statement.
 * Removing semantic authority requires verified dormant authority and no retained edges;
 * enabled or invalid authority requires attended compatible recovery (ADR 0060).
 * The applied rename ledger alone selects the strict current or frozen historical reader;
 * namespace membership validates that selection. Missing, mixed or unreadable state throws.
 * The caller retains its per-migration transactions and foreign-key rebuild policy.
 */
export function assertDependencyRollbackAdmitted(
  db: ReturnType<typeof openDatabase>,
  selectedNames: readonly string[],
): void {
  if (!selectedNames.includes(ACTIVATION)) return;
  const renames = db
    .query<{ name: unknown }, [string]>('SELECT name FROM __drizzle_migrations WHERE name=?')
    .all(RENAME);
  if (renames.length > 1) throw new Error('duplicate dependency activation rename migration');
  const isRenamed = renames.length === 1;
  const expected = isRenamed
    ? [
        'cross_work_package_dependency_activation',
        'cross_work_package_dependency_activation_receipt',
      ]
    : ['cross_project_dependency_activation', 'cross_project_dependency_activation_receipt'];
  const tables = db
    .query<{ name: unknown }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cross_project_dependency_activation','cross_project_dependency_activation_receipt','cross_work_package_dependency_activation','cross_work_package_dependency_activation_receipt') ORDER BY name",
    )
    .all();
  if (
    tables.length !== expected.length ||
    tables.some(({ name }, index) => name !== expected[index])
  )
    throw new Error('dependency activation layout differs from applied rename migration');
  // Proof: bypassing this inspector made all 12 corrupt-schema/marker/trigger/ledger
  // rollback cases fail their error or full schema/row certificate assertions (2026-10-23).
  const connection = drizzle({ client: db });
  const authority = isRenamed
    ? inspectDependencyActivation(connection)
    : inspectLegacyDependencyActivation(connection);
  // Proof: bypassing enabled refusal let newer downs commit before the SQL guard;
  // enabled-empty rollback failed its complete ledger certificate (2026-10-23).
  if (authority.state !== 'DISABLED')
    throw new Error('dependency activation requires compatible recovery');
  // Proof: bypassing retained-edge refusal let newer downs commit before the SQL
  // guard; retained-external-row rollback failed its ledger certificate (2026-10-23).
  if (db.query('SELECT 1 FROM external_dependency LIMIT 1').get() !== null)
    throw new Error('dependency activation requires compatible recovery');
}
