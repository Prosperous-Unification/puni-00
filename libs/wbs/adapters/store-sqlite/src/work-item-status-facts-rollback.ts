import { type Hold, isHold, isReadiness, type Readiness } from '@wbs/domain';
import { eq, isNotNull, or } from 'drizzle-orm';

import { auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import { workItem } from './schema';

/** One leaf's statements as saved: which work item, its readiness and its hold. */
export interface SavedStatusFacts {
  workItemId: string;
  readiness: Readiness | null;
  hold: Hold | null;
}

/**
 * The file `work-item-status-facts-rollback-cli.ts save` writes before a code
 * rollback to a release that cannot read readiness or holds, or a schema
 * rollback past `20260928200000_add_work_item_status_facts`, whose `down.sql`
 * refuses while any hold is stored
 * (docs/runbook-prod-deploy.md#work-item-status-facts-rollback).
 */
export interface SavedWorkItemStatusFacts {
  format: 'work-item-status-facts-save';
  version: 1;
  rows: SavedStatusFacts[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the versioned file at the CLI boundary before a transaction starts.
 *
 * Proof: the version check dropped made `refuses a malformed save` fail on
 * `Received function did not throw` for the version 2 file; watched 2026-09-29.
 */
function readSavedStatusFacts(saved: unknown): SavedWorkItemStatusFacts {
  if (
    !isRecord(saved) ||
    saved['format'] !== 'work-item-status-facts-save' ||
    saved['version'] !== 1 ||
    Object.keys(saved).length !== 3 ||
    !Array.isArray(saved['rows'])
  ) {
    throw new Error('invalid work item status facts save format or version');
  }
  const rows = saved['rows'].map((candidate: unknown): SavedStatusFacts => {
    if (!isRecord(candidate) || Object.keys(candidate).length !== 3) {
      throw new Error('invalid work item status facts save row');
    }
    const { workItemId, readiness, hold } = candidate;
    if (
      typeof workItemId !== 'string' ||
      (readiness !== null && !isReadiness(readiness)) ||
      (hold !== null && !isHold(hold)) ||
      (readiness === null && hold === null)
    ) {
      throw new Error('invalid work item status facts save row');
    }
    return { workItemId, readiness, hold };
  });
  return { format: 'work-item-status-facts-save', version: 1, rows };
}

function currentStatusFacts(db: Pick<Drizzle, 'select'>): SavedStatusFacts[] {
  return db
    .select({ workItemId: workItem.id, readiness: workItem.readiness, hold: workItem.hold })
    .from(workItem)
    .where(or(isNotNull(workItem.readiness), isNotNull(workItem.hold)))
    .orderBy(workItem.id)
    .all()
    .map(({ workItemId, readiness, hold }) => {
      // Both columns are CHECKed to their vocabularies; a value outside one is
      // a database edited by hand, and saving it would restore a lie.
      if (readiness !== null && !isReadiness(readiness)) {
        throw new Error(`work item ${workItemId} holds an unknown readiness`);
      }
      if (hold !== null && !isHold(hold)) {
        throw new Error(`work item ${workItemId} holds an unknown hold`);
      }
      return { workItemId, readiness, hold };
    });
}

/** Captures every stored readiness and hold, in work item id order. */
export function saveWorkItemStatusFacts(db: Drizzle): SavedWorkItemStatusFacts {
  return { format: 'work-item-status-facts-save', version: 1, rows: currentStatusFacts(db) };
}

/**
 * Clears exactly the saved statements in one transaction, refusing unless the
 * save still matches every statement stored: one written after the save would
 * otherwise be dropped with no copy anywhere. `at` stamps `updated_at`.
 */
export function removeSavedWorkItemStatusFacts(db: Drizzle, saved: unknown, at: number): number {
  const { rows } = readSavedStatusFacts(saved);
  return db.transaction((tx) => {
    const current = currentStatusFacts(tx);
    const expected = [...rows].sort((left, right) =>
      left.workItemId < right.workItemId ? -1 : left.workItemId > right.workItemId ? 1 : 0,
    );
    // Proof: this comparison reduced to the lengths alone made `refuses to
    // remove a save that no longer matches the table` fail on `Received
    // function did not throw`; watched 2026-09-29.
    if (
      current.length !== expected.length ||
      current.some(
        (row, index) =>
          row.workItemId !== expected[index]?.workItemId ||
          row.readiness !== expected[index].readiness ||
          row.hold !== expected[index].hold,
      )
    ) {
      throw new Error('work item status facts save does not match current statements');
    }
    for (const row of current) {
      tx.update(workItem)
        .set({ readiness: null, hold: null, ...auditOnUpdate({ at }) })
        .where(eq(workItem.id, row.workItemId))
        .run();
    }
    return current.length;
  });
}

/**
 * Writes the saved statements back after a later forward migration or
 * redeploy, all or none. A saved work item that is gone, or has gained a child
 * since, refuses the whole restore: statements are stored on leaves only.
 * `at` stamps `updated_at`.
 */
export function restoreWorkItemStatusFacts(db: Drizzle, saved: unknown, at: number): number {
  const { rows } = readSavedStatusFacts(saved);
  return db.transaction((tx) => {
    for (const { workItemId } of rows) {
      const found = tx
        .select({ id: workItem.id })
        .from(workItem)
        .where(eq(workItem.id, workItemId))
        .get();
      if (found === undefined) {
        throw new Error(`saved statements on ${workItemId}, which is no longer a work item`);
      }
      const child = tx
        .select({ id: workItem.id })
        .from(workItem)
        .where(eq(workItem.parentId, workItemId))
        .get();
      // Proof: this check skipped made `refuses the whole restore when a saved
      // work item is gone or has become a parent` fail on `Received function
      // did not throw`; watched 2026-09-29.
      if (child !== undefined) {
        throw new Error(`saved statements on ${workItemId}, which is no longer a leaf`);
      }
    }
    for (const { workItemId, readiness, hold } of rows) {
      tx.update(workItem)
        .set({ readiness, hold, ...auditOnUpdate({ at }) })
        .where(eq(workItem.id, workItemId))
        .run();
    }
    return rows.length;
  });
}
