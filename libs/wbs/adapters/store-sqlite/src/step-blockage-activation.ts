import { StepBlockageInactive } from '@wbs/core';
import { sql } from 'drizzle-orm';

import { type Drizzle, SQLiteError } from './db';

export const STEP_BLOCKAGE_ACTIVATION_MIGRATION = '20261014140000_add_step_blockage_activation';
const SENTINEL = 'step_blockage_inactive';
const ACTIONS = ['insert', 'update', 'delete'] as const;
type Activation = 'DISABLED' | 'ENABLED';

function triggerSql(action: (typeof ACTIONS)[number]): string {
  return `CREATE TRIGGER step_blockage_admit_${action}
BEFORE ${action.toUpperCase()} ON step_blockage
WHEN (SELECT count(*) FROM step_blockage_activation) <> 1
  OR NOT EXISTS (SELECT 1 FROM step_blockage_activation WHERE id = 1 AND state = 'ENABLED')
BEGIN
  SELECT RAISE(ABORT, 'step_blockage_inactive');
END`;
}

function normalizeSql(statement: string): string {
  return statement.trim().replace(/;$/, '');
}

/**
 * Validates durable admission authority, including exact trigger bodies and its ledger.
 * Disabled is a valid boot state. Missing, malformed and unreadable state throws.
 */
export function readStepBlockageActivation(db: Drizzle): Activation {
  const ledger = db.all<{ name: unknown }>(
    sql`SELECT name FROM __drizzle_migrations WHERE name = ${STEP_BLOCKAGE_ACTIVATION_MIGRATION}`,
  );
  // Proof: ledger check omitted; wrong-migration readiness negative received no throw (2026-10-14).
  if (ledger.length !== 1) throw new Error('missing step blockage activation migration');
  const markers = db.all<{ id: unknown; state: unknown }>(
    sql`SELECT id,state FROM step_blockage_activation`,
  );
  const marker = markers.at(0);
  // Proof: each count/id/state predicate omitted; duplicate/wrong-id/malformed readiness negatives received no throw (2026-10-14).
  if (
    markers.length !== 1 ||
    marker?.id !== 1 ||
    (marker.state !== 'DISABLED' && marker.state !== 'ENABLED')
  ) {
    throw new Error('invalid step blockage activation marker');
  }
  const triggers = db.all<{ name: string; sql: string | null }>(
    sql`SELECT name,sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'step_blockage' AND name IN ('step_blockage_admit_insert','step_blockage_admit_update','step_blockage_admit_delete')`,
  );
  // Proof: definition check omitted; missing-trigger and changed-body readiness negatives received no throw (2026-10-14).
  if (
    triggers.length !== ACTIONS.length ||
    ACTIONS.some((action) => {
      const trigger = triggers.find(
        (candidate) => candidate.name === `step_blockage_admit_${action}`,
      );
      return (
        trigger?.sql === undefined ||
        trigger.sql === null ||
        normalizeSql(trigger.sql) !== normalizeSql(triggerSql(action))
      );
    })
  )
    throw new Error('invalid step blockage activation triggers');
  return marker.state;
}

/** Throws a typed refusal when a valid marker disables writes. */
export function requireStepBlockageActivation(db: Drizzle): void {
  // Proof: disabled predicate omitted; mounted empty structural undo committed instead of returning 409 (2026-10-14).
  if (readStepBlockageActivation(db) !== 'ENABLED') throw new StepBlockageInactive();
}

/**
 * Maps only the native SQLite trigger sentinel, including wrapped Drizzle causes.
 * Other errors keep their identity. Call after the transaction has rolled back.
 */
export function translateStepBlockageFailure(failure: unknown): unknown {
  let cause = failure;
  const visited = new Set<Error>();
  while (cause instanceof Error && !visited.has(cause)) {
    // Proof: native-class/code/exact-message checks omitted separately; impostor and nonexact native error negatives changed identity (2026-10-14).
    if (
      cause instanceof SQLiteError &&
      cause.message === SENTINEL &&
      cause.code === 'SQLITE_CONSTRAINT_TRIGGER'
    )
      return new StepBlockageInactive();
    visited.add(cause);
    // Proof: wrapped traversal omitted; real Drizzle repository write no longer rejected as StepBlockageInactive (2026-10-14).
    cause = cause.cause;
  }
  return failure;
}
