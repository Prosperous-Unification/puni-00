import { EstimateTrio, minuteTrioProblem } from '@wbs/domain';
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
// Proof: widening version to number failed the malformed-save CLI case at its named version refusal (2026-10-12).
const SavedUnits = type({
  format: "'estimate-unit-save'",
  version: '1',
  steps: SavedUnit.array(),
  rows: SavedEstimate.array(),
});

/** A verbatim save of minute steps and their trios for the guarded rollback (ADR 0042). */
export type SavedEstimateUnits = typeof SavedUnits.infer;

/** Validates saved minute figures before any recovery transaction can change units. */
function readSavedEstimateUnits(saved: unknown): SavedEstimateUnits {
  const held = parseOrThrow(SavedUnits, saved);
  for (const row of held.rows) {
    // Proof: bypassing structural parsing restored an unordered saved trio (migration-cli.db.test.ts minute recovery).
    const trio = parseOrThrow(EstimateTrio, {
      optimistic: row.optimistic,
      realistic: row.realistic,
      pessimistic: row.pessimistic,
    });
    const problem = minuteTrioProblem(trio);
    // Proof: bypassing this refusal restored fractional/above-max minute trios (migration-cli.db.test.ts minute recovery).
    if (problem !== null)
      throw new Error(`saved minute estimate ${row.work_item_id}/${row.step_id}: ${problem}`);
  }
  return held;
}

type Reader = Pick<Drizzle, 'all'>;

/** Refuses an unmigrated database rather than claiming an empty save. */
function assertUnitColumn(db: Reader): void {
  const columns = db.all<{ name: string }>(sql`PRAGMA table_info(step)`);
  // Proof: bypassing this guard failed the CLI unmigrated-database case: a raw missing-column error replaced the named refusal (2026-10-12).
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

/** Old images ignore journal bindings, so recovery refuses retained minute history intact. */
function assertWorkdayJournal(db: Reader): void {
  // Proof: removing the root-object arm let CLI remove accept null/array/scalar preconditions and change units/rows; migration-cli.db.test.ts failed (2026-10-13).
  const entries = db.all<{
    count: number;
  }>(sql`SELECT count(*) AS count FROM command_journal j WHERE CASE
    WHEN json_type(j.preconditions) IS NOT 'object' THEN 1
    WHEN json_type(j.preconditions, '$.estimateUnits') IS NULL THEN 0
    WHEN json_type(j.preconditions, '$.estimateUnits') != 'object' THEN 1
    ELSE EXISTS (SELECT 1 FROM json_each(j.preconditions, '$.estimateUnits') WHERE type != 'text' OR value != 'workdays') END`);
  if (entries.length !== 1 || entries[0]?.count !== 0)
    throw new Error(
      'minute journal entries exist: rollback refused; keep this image until supported journal recovery is available',
    );
}

/** Removes trios before changing their units; refuses any write made since the save. */
export function removeSavedEstimateUnits(
  db: Drizzle,
  saved: unknown,
): { steps: number; rows: number } {
  const held = readSavedEstimateUnits(saved);
  return db.transaction((tx) => {
    // Proof: bypassing this guard let CLI remove leave minute redo history for an old image (migration-cli.db.test.ts).
    assertWorkdayJournal(tx);
    // Proof: removing the comparison let remove erase an estimate edited after save; the stale-save CLI assertion failed (2026-10-12).
    if (JSON.stringify(saveEstimateUnits(tx)) !== JSON.stringify(held))
      throw new Error('estimate unit save does not match current steps and estimates');
    // Proof: leaving these rows failed the CLI roundtrip empty-store assertion with four minute trios left as days (2026-10-12).
    tx.run(
      sql`DELETE FROM estimate WHERE step_id IN (SELECT id FROM step WHERE estimate_unit = 'minutes')`,
    );
    tx.run(sql`UPDATE step SET estimate_unit = 'workdays' WHERE estimate_unit = 'minutes'`);
    return { steps: held.steps.length, rows: held.rows.length };
  });
}

/** Restores units and trios verbatim, all or none; preexisting rows refuse through their primary key. */
export function restoreEstimateUnits(db: Drizzle, saved: unknown): { steps: number; rows: number } {
  const held = readSavedEstimateUnits(saved);
  return db.transaction((tx) => {
    assertUnitColumn(tx);
    for (const step of held.steps) {
      const current = tx.get<{ estimate_unit: string } | undefined>(
        sql`SELECT estimate_unit FROM step WHERE id = ${step.id}`,
      );
      // Proof: bypassing this guard let a missing saved step restore successfully; CLI roundtrip negative failed (2026-10-12).
      if (current?.estimate_unit !== 'workdays')
        throw new Error(`saved minute step ${step.id} is missing or no longer workdays`);
      const estimates = tx.get<{ count: number } | undefined>(
        sql`SELECT count(*) AS count FROM estimate WHERE step_id = ${step.id}`,
      );
      // Proof: bypassing this guard reached a raw primary-key conflict instead of the named occupied-step refusal (2026-10-12).
      if (estimates?.count !== 0)
        throw new Error(`saved minute step ${step.id} holds new estimates`);
      tx.run(sql`UPDATE step SET estimate_unit = 'minutes' WHERE id = ${step.id}`);
    }
    for (const row of held.rows) {
      // Proof: bypassing this guard reached a raw foreign-key failure instead of the named orphan-row refusal (2026-10-12).
      if (!held.steps.some((step) => step.id === row.step_id))
        throw new Error(`saved estimate has no minute step: ${row.step_id}`);
      tx.run(
        sql`INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic, created_at, updated_at, created_by) VALUES (${row.work_item_id}, ${row.step_id}, ${row.optimistic}, ${row.realistic}, ${row.pessimistic}, ${row.created_at}, ${row.updated_at}, ${row.created_by})`,
      );
    }
    return { steps: held.steps.length, rows: held.rows.length };
  });
}
