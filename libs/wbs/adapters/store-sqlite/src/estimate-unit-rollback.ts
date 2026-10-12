import { parseOrThrow, type } from '@wbs/validation';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';

const SavedEstimate = type({
  work_item_id: 'string',
  step_id: 'string',
  optimistic: 'number>=0',
  realistic: 'number>=0',
  pessimistic: 'number>=0',
  created_at: 'number | null',
  updated_at: 'number | null',
  created_by: 'string | null',
});
const SavedUnit = type({ id: 'string', estimate_unit: "'minutes'" });
const SavedUnits = type({
  format: "'estimate-unit-save'",
  version: '1',
  steps: SavedUnit.array(),
  rows: SavedEstimate.array(),
});

/** A verbatim save of minute steps and their trios for the guarded rollback (ADR 0042). */
export type SavedEstimateUnits = typeof SavedUnits.infer;

type Reader = Pick<Drizzle, 'all'>;

/** Refuses an unmigrated database rather than claiming an empty save. */
function assertUnitColumn(db: Reader): void {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(step)`);
  // Proof: CLI unmigrated-database case observes the named refusal rather than a missing-column query failure.
  if (!columns.some((column) => column.name === 'estimate_unit')) {
    throw new Error(
      'step.estimate_unit does not exist: database is not migrated to _add_step_estimate_unit',
    );
  }
}

/** Captures minute steps and all their estimate columns, ordered by primary key. */
export function saveEstimateUnits(db: Reader): SavedEstimateUnits {
  assertUnitColumn(db);
  return parseOrThrow(SavedUnits, {
    format: 'estimate-unit-save',
    version: 1,
    steps: db.all(
      sql`SELECT id, estimate_unit FROM step WHERE estimate_unit = 'minutes' ORDER BY id`,
    ),
    rows: db.all(
      sql`SELECT e.* FROM estimate e JOIN step s ON e.step_id = s.id WHERE s.estimate_unit = 'minutes' ORDER BY e.work_item_id, e.step_id`,
    ),
  });
}

/** Removes trios before changing their units; refuses any write made since the save. */
export function removeSavedEstimateUnits(
  db: Drizzle,
  saved: unknown,
): { steps: number; rows: number } {
  const held = parseOrThrow(SavedUnits, saved);
  return db.transaction((tx) => {
    if (JSON.stringify(saveEstimateUnits(tx)) !== JSON.stringify(held))
      throw new Error('estimate unit save does not match current steps and estimates');
    tx.run(
      sql`DELETE FROM estimate WHERE step_id IN (SELECT id FROM step WHERE estimate_unit = 'minutes')`,
    );
    tx.run(sql`UPDATE step SET estimate_unit = 'workdays' WHERE estimate_unit = 'minutes'`);
    return { steps: held.steps.length, rows: held.rows.length };
  });
}

/** Restores units and trios verbatim, all or none; preexisting rows refuse through their primary key. */
export function restoreEstimateUnits(db: Drizzle, saved: unknown): { steps: number; rows: number } {
  const held = parseOrThrow(SavedUnits, saved);
  return db.transaction((tx) => {
    assertUnitColumn(tx);
    for (const step of held.steps) {
      const current = tx.get<{ estimate_unit: string } | undefined>(
        sql`SELECT estimate_unit FROM step WHERE id = ${step.id}`,
      );
      if (current?.estimate_unit !== 'workdays')
        throw new Error(`saved minute step ${step.id} is missing or no longer workdays`);
      const estimates = tx.get<{ count: number } | undefined>(
        sql`SELECT count(*) AS count FROM estimate WHERE step_id = ${step.id}`,
      );
      if (estimates?.count !== 0)
        throw new Error(`saved minute step ${step.id} holds new estimates`);
      tx.run(sql`UPDATE step SET estimate_unit = 'minutes' WHERE id = ${step.id}`);
    }
    for (const row of held.rows) {
      if (!held.steps.some((step) => step.id === row.step_id))
        throw new Error(`saved estimate has no minute step: ${row.step_id}`);
      tx.run(
        sql`INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic, created_at, updated_at, created_by) VALUES (${row.work_item_id}, ${row.step_id}, ${row.optimistic}, ${row.realistic}, ${row.pessimistic}, ${row.created_at}, ${row.updated_at}, ${row.created_by})`,
      );
    }
    return { steps: held.steps.length, rows: held.rows.length };
  });
}
