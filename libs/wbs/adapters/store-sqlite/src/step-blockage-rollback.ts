import { parseOrThrow, type } from '@wbs/validation';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';

// Proof: safe-integer narrowing removed; unsafe timestamp decoder cases failed; watched 2026-10-13.
const SafeInteger = type('number.integer').narrow((value) => Number.isSafeInteger(value));
const SavedRow = type({
  work_item_id: 'string',
  step_id: 'string',
  blocked_at: SafeInteger,
  created_at: SafeInteger.or('null'),
  updated_at: SafeInteger.or('null'),
  created_by: 'string | null',
}).onUndeclaredKey('reject');
const SavedBlockages = type({
  format: "'step-blockage-save'",
  version: '1',
  rows: SavedRow.array(),
}).onUndeclaredKey('reject');

/** Every column of the sparse facts, with versioned recovery format (ADR 0053). */
export type SavedStepBlockages = typeof SavedBlockages.infer;

/** Validates a recovery file once before any recovery transaction begins. */
export function decodeSavedStepBlockages(candidate: unknown): SavedStepBlockages {
  // Proof: decoder bypassed; malformed envelope/row/timestamp negative failed; watched 2026-10-13.
  const saved = parseOrThrow(SavedBlockages, candidate);
  const identities = new Set<string>();
  for (const row of saved.rows) {
    const identity = JSON.stringify([row.work_item_id, row.step_id]);
    // Proof: duplicate guard removed; decoder duplicate-identity negative did not throw; watched 2026-10-13.
    if (identities.has(identity)) throw new Error('duplicate saved step blockage');
    identities.add(identity);
  }
  return saved;
}

/** Captures all audit columns in key order; an absent/unreadable table throws. */
export function saveStepBlockages(db: Pick<Drizzle, 'all'>): SavedStepBlockages {
  return decodeSavedStepBlockages({
    format: 'step-blockage-save',
    version: 1,
    rows: db.all(
      sql`SELECT work_item_id,step_id,blocked_at,created_at,updated_at,created_by FROM step_blockage ORDER BY work_item_id,step_id`,
    ),
  });
}

/** Removes only facts still identical to the captured backup, inside one transaction. */
export function removeSavedStepBlockages(db: Drizzle, candidate: unknown): number {
  const saved = decodeSavedStepBlockages(candidate);
  return db.transaction((transaction) => {
    const current = saveStepBlockages(transaction);
    // Proof: stale comparison removed; stale-save negative did not throw; watched 2026-10-13.
    if (JSON.stringify(current) !== JSON.stringify(saved))
      throw new Error('step blockage save does not match the current table');
    transaction.run(sql`DELETE FROM step_blockage`);
    return current.rows.length;
  });
}

/**
 * Restores every column verbatim into an empty table, atomically. Foreign keys
 * and the migration's ownership triggers refuse missing/cross-project steps,
 * missing owners and parent-owned facts before the transaction can commit.
 */
export function restoreStepBlockages(db: Drizzle, candidate: unknown): number {
  const saved = decodeSavedStepBlockages(candidate);
  return db.transaction((transaction) => {
    // Proof: nonempty guard removed; disjoint existing/saved restore negative did not throw; watched 2026-10-13.
    if (saveStepBlockages(transaction).rows.length !== 0)
      throw new Error('step blockage restore table is not empty');
    for (const row of saved.rows) {
      transaction.run(sql`INSERT INTO step_blockage (work_item_id,step_id,blocked_at,created_at,updated_at,created_by)
        VALUES (${row.work_item_id},${row.step_id},${row.blocked_at},${row.created_at},${row.updated_at},${row.created_by})`);
    }
    return saved.rows.length;
  });
}
