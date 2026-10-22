import type { MeasureAdded, MeasureRemoved, MeasureWritten, WriteStamp } from '@wbs/core';
import type { MeasureDefinition } from '@wbs/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { auditOnCreate, auditOnUpdate } from './audit';
import { isUniqueViolation, UNIQUE_INDEXES } from './constraint';
import { measure, organization } from './schema';

/** The columns a {@link MeasureDefinition} is read from, in its own field names. */
const MEASURE_COLUMNS = {
  id: measure.id,
  key: measure.key,
  name: measure.name,
  unit: measure.unit,
  kind: measure.kind,
  scale: measure.scale,
  threePoint: measure.threePoint,
  showByDefault: measure.showByDefault,
  schedulesWork: measure.schedulesWork,
  derived: measure.derived,
  order: measure.order,
  currency: measure.currency,
} as const;

/**
 * Translates the two unique indexes a definition write can meet into their
 * refusals, or rethrows. The key index is tested first: SQLite names the
 * scheduling index `measure.organization_id`, a prefix of the key index's
 * `measure.organization_id, measure.key`, so the scheduling test alone would
 * also match a taken key.
 *
 * Proof: with the two tests swapped, `directory.addMeasure:index-backstop` in
 * the SQLite certification answered `second_scheduling_measure` for a taken
 * key; watched 2026-10-23.
 */
function refusalOf(err: unknown): 'measure_key_taken' | 'second_scheduling_measure' {
  if (isUniqueViolation(err, UNIQUE_INDEXES.measureKeyInOrganization)) return 'measure_key_taken';
  if (isUniqueViolation(err, UNIQUE_INDEXES.schedulingMeasureInOrganization))
    return 'second_scheduling_measure';
  throw err;
}

/** The organization marked legacy, or null when none is. */
export function legacyOrganizationOf(db: SQLiteBunDatabase): string | null {
  return (
    db.select({ id: organization.id }).from(organization).where(eq(organization.legacy, true)).get()
      ?.id ?? null
  );
}

/** One organization's definitions by `order`, then `key`. */
export function listMeasuresIn(db: SQLiteBunDatabase, organizationId: string): MeasureDefinition[] {
  return db
    .select(MEASURE_COLUMNS)
    .from(measure)
    .where(eq(measure.organizationId, organizationId))
    .orderBy(asc(measure.order), asc(measure.key))
    .all();
}

/** Inserts one definition; the unique indexes answer as refusals. */
export function insertMeasure(
  db: SQLiteBunDatabase,
  organizationId: string,
  toAdd: MeasureDefinition,
  stamp: WriteStamp,
): MeasureAdded {
  try {
    db.insert(measure)
      .values({ ...toAdd, organizationId, ...auditOnCreate(stamp) })
      .run();
  } catch (err) {
    return { ok: false, reason: refusalOf(err) };
  }
  return { ok: true, measure: { ...toAdd } };
}

/**
 * Rewrites every field of one of the organization's definitions but its id
 * and key; the `measure_key_frozen` trigger refuses a key change underneath.
 * A row of another organization is not matched, so it answers `not_found`.
 *
 * Proof: with the organization condition dropped from the update, the SQLite
 * certification's `directory.patchMeasure:scoped-key-frozen` renamed B's
 * definition through A; watched 2026-10-23.
 */
export function updateMeasure(
  db: SQLiteBunDatabase,
  organizationId: string,
  next: MeasureDefinition,
  stamp: WriteStamp,
): MeasureWritten {
  const { id, key: _key, ...fields } = next;
  try {
    const written = db
      .update(measure)
      .set({ ...fields, ...auditOnUpdate(stamp) })
      .where(and(eq(measure.id, id), eq(measure.organizationId, organizationId)))
      .returning(MEASURE_COLUMNS)
      .all();
    const row = written.at(0);
    return row === undefined ? { ok: false, reason: 'not_found' } : { ok: true, measure: row };
  } catch (err) {
    const reason = refusalOf(err);
    // A patch never names a key, so only the scheduling index can refuse one.
    if (reason === 'measure_key_taken') throw err;
    return { ok: false, reason };
  }
}

/**
 * Deletes one of the organization's definitions; another organization's is `not_found`.
 *
 * Proof: with the organization condition dropped from the delete, the SQLite
 * certification's `directory.removeMeasure:scoped` removed B's definition
 * through A; watched 2026-10-23.
 */
export function deleteMeasure(
  db: SQLiteBunDatabase,
  organizationId: string,
  measureId: string,
): MeasureRemoved {
  const removed = db
    .delete(measure)
    .where(and(eq(measure.id, measureId), eq(measure.organizationId, organizationId)))
    .returning({ id: measure.id })
    .all();
  return removed.length === 0 ? { ok: false, reason: 'not_found' } : { ok: true };
}
