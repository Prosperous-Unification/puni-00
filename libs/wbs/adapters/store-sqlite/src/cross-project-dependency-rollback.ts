import { drizzle } from 'drizzle-orm/bun-sqlite';

import { inspectDependencyActivation } from './cross-project-dependency-activation';
import type { openDatabase } from './db';

const ACTIVATION = '20261022212000_add_cross_project_dependency_activation';

/**
 * Admits the complete rollback selection before its first down statement.
 * Removing semantic authority requires verified dormant authority and no retained edges;
 * enabled or invalid authority requires attended compatible recovery (ADR 0057).
 * The caller retains its per-migration transactions and foreign-key rebuild policy.
 */
export function assertDependencyRollbackAdmitted(
  db: ReturnType<typeof openDatabase>,
  selectedNames: readonly string[],
): void {
  if (!selectedNames.includes(ACTIVATION)) return;
  // Proof: bypassing this inspector made all 12 corrupt-schema/marker/trigger/ledger
  // rollback cases fail their error or full schema/row certificate assertions (2026-10-23).
  const authority = inspectDependencyActivation(drizzle({ client: db }));
  // Proof: bypassing enabled refusal let newer downs commit before the SQL guard;
  // enabled-empty rollback failed its complete ledger certificate (2026-10-23).
  if (authority.state !== 'DISABLED')
    throw new Error('dependency activation requires compatible recovery');
  // Proof: bypassing retained-edge refusal let newer downs commit before the SQL
  // guard; retained-external-row rollback failed its ledger certificate (2026-10-23).
  if (db.query('SELECT 1 FROM external_dependency LIMIT 1').get() !== null)
    throw new Error('dependency activation requires compatible recovery');
}
