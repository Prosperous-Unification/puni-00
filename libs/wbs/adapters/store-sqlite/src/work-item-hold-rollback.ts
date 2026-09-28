import { type Hold, isHold } from '@wbs/domain';
import { eq, isNotNull } from 'drizzle-orm';

import { auditOnUpdate } from './audit';
import type { Drizzle } from './db';
import { workItem } from './schema';

/** One held leaf as saved: which work item, and which hold. */
export interface SavedWorkItemHold {
  workItemId: string;
  hold: Hold;
}

/**
 * The file `work-item-hold-rollback-cli.ts save` writes before a rollback past
 * `20260928200000_add_work_item_status_facts`, whose `down.sql` refuses while
 * any hold is stored (docs/runbook-prod-deploy.md#work-item-hold-rollback).
 */
export interface SavedWorkItemHolds {
  format: 'work-item-hold-save';
  version: 1;
  rows: SavedWorkItemHold[];
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
function readSavedWorkItemHolds(saved: unknown): SavedWorkItemHolds {
  if (
    !isRecord(saved) ||
    saved['format'] !== 'work-item-hold-save' ||
    saved['version'] !== 1 ||
    Object.keys(saved).length !== 3 ||
    !Array.isArray(saved['rows'])
  ) {
    throw new Error('invalid work item hold save format or version');
  }
  const rows = saved['rows'].map((candidate: unknown): SavedWorkItemHold => {
    if (!isRecord(candidate) || Object.keys(candidate).length !== 2) {
      throw new Error('invalid work item hold save row');
    }
    const { workItemId, hold } = candidate;
    if (typeof workItemId !== 'string' || !isHold(hold)) {
      throw new Error('invalid work item hold save row');
    }
    return { workItemId, hold };
  });
  return { format: 'work-item-hold-save', version: 1, rows };
}

function currentHolds(db: Pick<Drizzle, 'select'>): SavedWorkItemHold[] {
  return db
    .select({ workItemId: workItem.id, hold: workItem.hold })
    .from(workItem)
    .where(isNotNull(workItem.hold))
    .orderBy(workItem.id)
    .all()
    .map(({ workItemId, hold }) => {
      // The column is CHECKed to `HOLDS`; a value outside it is a database
      // that was edited by hand, and saving it would restore a lie.
      if (!isHold(hold)) throw new Error(`work item ${workItemId} holds an unknown hold`);
      return { workItemId, hold };
    });
}

/** Captures every stored hold, in work item id order. */
export function saveWorkItemHolds(db: Drizzle): SavedWorkItemHolds {
  return { format: 'work-item-hold-save', version: 1, rows: currentHolds(db) };
}

/**
 * Clears exactly the saved holds in one transaction, refusing unless the save
 * still matches every hold stored: a hold written after the save would
 * otherwise be dropped with no copy anywhere.
 */
export function removeSavedWorkItemHolds(db: Drizzle, saved: unknown, at: number): number {
  const { rows } = readSavedWorkItemHolds(saved);
  return db.transaction((tx) => {
    const current = currentHolds(tx);
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
          row.workItemId !== expected[index]?.workItemId || row.hold !== expected[index].hold,
      )
    ) {
      throw new Error('work item hold save does not match current holds');
    }
    for (const row of current) {
      tx.update(workItem)
        .set({ hold: null, ...auditOnUpdate({ at }) })
        .where(eq(workItem.id, row.workItemId))
        .run();
    }
    return current.length;
  });
}

/**
 * Writes the saved holds back after a later forward migration, all or none.
 * A saved work item that is gone, or has gained a child since, refuses the
 * whole restore: holds are stored on leaves only. `at` stamps `updated_at`.
 */
export function restoreWorkItemHolds(db: Drizzle, saved: unknown, at: number): number {
  const { rows } = readSavedWorkItemHolds(saved);
  return db.transaction((tx) => {
    for (const { workItemId } of rows) {
      const found = tx
        .select({ id: workItem.id })
        .from(workItem)
        .where(eq(workItem.id, workItemId))
        .get();
      if (found === undefined) {
        throw new Error(`saved hold on ${workItemId}, which is no longer a work item`);
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
        throw new Error(`saved hold on ${workItemId}, which is no longer a leaf`);
      }
    }
    for (const { workItemId, hold } of rows) {
      tx.update(workItem)
        .set({ hold, ...auditOnUpdate({ at }) })
        .where(eq(workItem.id, workItemId))
        .run();
    }
    return rows.length;
  });
}
