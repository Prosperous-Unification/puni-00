import type { CalendarMarker, CalendarMarkerStore, CalendarMarkerWritten } from '@wbs/core';
import { resolveSetting } from '@wbs/domain';
import { and, eq } from 'drizzle-orm';
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite';

import { type Connection, observeCommitted } from './db';
import type { Gate } from './gate';
import { OPEN } from './gate';
import { calendarMarker, workPackage } from './schema';
import { captureSettingsIn, readSettingTargetIn } from './settings';

/**
 * The columns a marker is read back as, named once.
 *
 * Spelled out rather than `select()`ing the table, so a column added to
 * `calendar_marker` later does not silently widen what every reader receives —
 * `PriorityBandRepository.listFor`'s shape, for its reason.
 */
const COLUMNS = {
  id: calendarMarker.id,
  workPackageId: calendarMarker.scopeId,
  date: calendarMarker.date,
  name: calendarMarker.name,
  color: calendarMarker.color,
  createdAt: calendarMarker.createdAt,
} as const;

/**
 * A work package's dated overlays, stored (task 4.1's storage half).
 *
 * Every method is scoped by `workPackageId` **in the `WHERE` clause and not by a
 * check in front of it**, which is what makes "a marker of another work package
 * answers `not_found`" a property of the query rather than of a caller
 * remembering to ask. A method that looked a marker up by id alone and then
 * compared its `workPackageId` would answer the same way only while every call site
 * kept doing so.
 */
/** Historical package-column proofs below retain their original observations; current predicates use own work_package scope. */
export class CalendarMarkerRepository implements CalendarMarkerStore {
  constructor(
    private readonly db: SQLiteBunDatabase,
    private readonly gate: Gate,
  ) {}

  /**
   * This work package's markers, totally ordered by `(date, createdAt, id)`.
   *
   * **The `id` key is the whole point of the ordering.** `(date, createdAt)`
   * alone ties whenever two markers are created inside the same millisecond,
   * and SQLite is free to answer a tie in either order between two reads of
   * unchanged data. A list that reordered itself under a reader would move a
   * chip in the axis for no reason they could see.
   *
   * Proof: `asc(calendarMarker.id)` struck from the `orderBy`, and
   * `orders a tie on (date, created_at) by id` went red on the first read
   * already — `Expected: ["b-…", "f-…"] / Received: ["f-…", "b-…"]` — because
   * the two ids are inserted in the reverse of their lexical order, so
   * insertion order and lexical order disagree and only the third key can
   * produce the asserted sequence. Watched 2026-09-05.
   */
  async listFor(workPackageId: string): Promise<CalendarMarker[]> {
    const target = readSettingTargetIn(this.db, { level: 'work_package', id: workPackageId }, null);
    if (target === null) return [];
    return Promise.resolve(
      resolveSetting(target.chain, 'calendarMarkers', captureSettingsIn(this.db, target)).map(
        ({ marker }) => ({ ...marker, workPackageId }),
      ),
    );
  }

  /**
   * Stores one marker, or refuses.
   *
   * The work package's existence is read **inside** the transaction, which is
   * `CapacityRepository.set`'s rule and `PriorityBandRepository.replace`'s: the
   * read is the decision, not a report about it, and the foreign key would
   * otherwise answer an absent work package by throwing a `SQLiteError` out of a
   * `run` — an unknown at the service boundary where a modelled 404 is owed.
   *
   * **A plain insert, never an upsert.** A repeated id is refused with the
   * stored row left byte-identical, so a composer that retried a create it had
   * already made cannot destroy the marker it is retrying. An upsert would
   * answer the same status to the caller and would have overwritten the name,
   * the date and the colour on the way.
   *
   * Proof of the existence read: it was struck, leaving the foreign key as the
   * only guard, and `refuses a marker on a workPackage nothing holds, and writes
   * nothing` failed with an uncaught
   * `SQLiteError: FOREIGN KEY constraint failed` where a modelled `not_found`
   * was owed. Watched 2026-09-05.
   *
   * Proof of the id read: it was struck so the insert stood alone, and
   * `refuses a repeated id and leaves the stored marker untouched` failed with
   * an uncaught `SQLiteError: UNIQUE constraint failed: calendar_marker.id`.
   * Watched 2026-09-05.
   */
  async create(marker: CalendarMarker): Promise<CalendarMarkerWritten> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        const held = tx
          .select({ id: workPackage.id })
          .from(workPackage)
          .where(eq(workPackage.id, marker.workPackageId))
          .all();
        if (held.length === 0) return { ok: false, reason: 'not_found' };
        // By id alone and not by `(workPackageId, id)`: the id is the primary key of
        // the whole table, so a collision with another work package's marker is still
        // a collision and still has to be refused rather than thrown.
        const taken = tx
          .select({ id: calendarMarker.id })
          .from(calendarMarker)
          .where(eq(calendarMarker.id, marker.id))
          .all();
        if (taken.length > 0) return { ok: false, reason: 'taken' };
        const { workPackageId: scopeId, ...point } = marker;
        tx.insert(calendarMarker)
          .values({ ...point, scopeKind: 'work_package', scopeId })
          .run();
        return { ok: true, marker };
      });
    });
  }

  /**
   * Renames one marker of this work package.
   *
   * The date and the colour are untouched, which is the refusal table's
   * "SHALL NOT partially apply" read from the other side: a rename that also
   * normalised a colour would make a refused rename observable in a column
   * nobody named.
   */
  async rename(workPackageId: string, id: string, name: string): Promise<CalendarMarkerWritten> {
    return await this.gate.enter(async () => {
      return await this.touch(workPackageId, id, { name });
    });
  }

  /**
   * Sets one marker's fill, or clears it back to automatic on `null`.
   *
   * `null` is stored as `NULL` rather than as a resolved hex, because automatic
   * has one spelling and it is the absence of one — `schema.ts` has the
   * argument on the column, and `CapacityStore.set` makes the same call for the
   * same reason.
   */
  async recolor(
    workPackageId: string,
    id: string,
    color: string | null,
  ): Promise<CalendarMarkerWritten> {
    return await this.gate.enter(async () => {
      return await this.touch(workPackageId, id, { color });
    });
  }

  /**
   * Removes one marker of this work package.
   *
   * The row is read back **before** the delete so the answer can carry it: a
   * caller that has to announce what went away cannot re-read it afterwards.
   */
  async remove(workPackageId: string, id: string): Promise<CalendarMarkerWritten> {
    return await this.gate.enter(async () => {
      await Promise.resolve();
      return this.db.transaction((tx) => {
        const found = this.one(tx, workPackageId, id);
        if (found === undefined) return { ok: false, reason: 'not_found' };
        tx.delete(calendarMarker)
          .where(
            and(
              and(
                eq(calendarMarker.scopeKind, 'work_package'),
                eq(calendarMarker.scopeId, workPackageId),
              ),
              eq(calendarMarker.id, id),
            ),
          )
          .run();
        return { ok: true, marker: found };
      });
    });
  }

  /**
   * The half {@link rename} and {@link recolor} share: read the marker under
   * this work package, refuse an absent one, write the named columns, answer with
   * the row as it now stands.
   *
   * One method rather than two copies because the *refusal* is the part worth
   * having once — two copies is two places for "or another work package's" to be
   * forgotten, and the scoping is the only thing making a cross-work-package write
   * impossible.
   */
  private async touch(
    workPackageId: string,
    id: string,
    patch: Partial<Pick<CalendarMarker, 'name' | 'color'>>,
  ): Promise<CalendarMarkerWritten> {
    await Promise.resolve();
    return this.db.transaction((tx) => {
      const found = this.one(tx, workPackageId, id);
      if (found === undefined) return { ok: false, reason: 'not_found' };
      tx.update(calendarMarker)
        .set(patch)
        .where(
          and(
            and(
              eq(calendarMarker.scopeKind, 'work_package'),
              eq(calendarMarker.scopeId, workPackageId),
            ),
            eq(calendarMarker.id, id),
          ),
        )
        .run();
      return { ok: true, marker: { ...found, ...patch } };
    });
  }

  /** One marker of one work package, or `undefined`. Scoped in the `WHERE`. */
  private one(
    tx: Parameters<Parameters<SQLiteBunDatabase['transaction']>[0]>[0],
    workPackageId: string,
    id: string,
  ): CalendarMarker | undefined {
    return tx
      .select(COLUMNS)
      .from(calendarMarker)
      .where(
        and(
          and(
            eq(calendarMarker.scopeKind, 'work_package'),
            eq(calendarMarker.scopeId, workPackageId),
          ),
          eq(calendarMarker.id, id),
        ),
      )
      .all()
      .at(0);
  }
}

/** Public inherited-marker projections use the Source's existing committed loan; writes stay on its writer. */
export function ownCalendarMarkerReads(
  writer: CalendarMarkerStore,
  openConnection: () => Connection,
): CalendarMarkerStore {
  return {
    listFor: (id) =>
      observeCommitted(openConnection, (snapshot) =>
        new CalendarMarkerRepository(snapshot, OPEN).listFor(id),
      ),
    create: writer.create.bind(writer),
    rename: writer.rename.bind(writer),
    recolor: writer.recolor.bind(writer),
    remove: writer.remove.bind(writer),
  };
}
