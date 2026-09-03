import { and, eq, sql } from 'drizzle-orm';

import type { Connection, Drizzle } from './db';
import { drizzleOuterTransaction } from './db';
import { savedPlan, savedPlanBody } from './schema';

/**
 * How the writer obtains the connection it takes the write lock on.
 *
 * A **new** connection each call, closed on every path — `openConnection`
 * injected exactly as {@link SavedPlanCaptureRepository} takes it, and for the
 * stronger of that class's two reasons. Obligation (i) of the topology
 * (design.md, "The three write-path requirements"): today be-01 opens one
 * process handle, so a save written against it would put two body writes inside
 * whatever the request path is doing, and the guarantee that a live edit
 * completes during a save would be void whatever `busy_timeout` says.
 */
export interface SavedPlanWriteOptions {
  readonly openConnection: () => Connection;
}

/** One side's stored bytes and the hash taken over them. */
export interface SavedPlanBodyWrite {
  /** `CanonicalPlanInput`'s (or the schedule body's) schema version. */
  readonly schemaVersion: number;
  /** The serialized body, exactly as hashed and exactly as stored. */
  readonly bytes: string;
  /** SHA-256 over those bytes, computed by the caller that serialized them. */
  readonly sha256: string;
}

/**
 * The schedule side, present or absent — **a union, not five nullable fields.**
 *
 * `saved_plan`'s `saved_plan_schedule_all_or_nothing` check refuses half a
 * schedule, and a record shaped as five optional columns can express one: five
 * fields that can disagree are five ways to store a state the reader would then
 * have to pick a belief about (`schema.ts`). Here the illegal states are
 * unconstructible, so the constraint is a second opinion rather than the only
 * one, and a caller cannot reach a `SQLITE_CONSTRAINT` from a type that
 * compiled.
 */
export type SavedPlanScheduleWrite =
  | {
      readonly present: true;
      readonly body: SavedPlanBodyWrite;
      /**
       * The `input_sha256` these dates were computed from — stored rather than
       * assumed so a reader can *check* it and refuse to render dates against
       * an input that did not produce them.
       */
      readonly inputSha256: string;
      /** Which scheduling algorithm produced the dates. */
      readonly algorithmId: string;
    }
  | {
      readonly present: false;
      /** Why there is no schedule. Never empty: absence still has a reason. */
      readonly absentReason: string;
    };

/** One save, as the service hands it over: a header and one or two bodies. */
export interface SavedPlanWrite {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  /** The display name at the instant of the save, by value — never a `users` reference. */
  readonly createdBy: string;
  /**
   * The instant the capture's read snapshot **opened**, not the instant this
   * transaction commits. A slow capture makes the two differ, and the honest
   * label on a comparison is when the plan was looked at.
   */
  readonly createdAt: number;
  readonly input: SavedPlanBodyWrite;
  readonly schedule: SavedPlanScheduleWrite;
}

/** What a project already holds, for the in-transaction quota check. */
export interface SavedPlanHoldingRow {
  readonly plans: number;
  readonly bytes: number;
}

/**
 * The byte length of a body, measured **once**, here.
 *
 * `String.length` counts UTF-16 code units and is not the number of bytes
 * SQLite stores: one emoji in a work item's name is two units and four bytes.
 * The header's `input_bytes` and the quota's arithmetic have to be the same
 * measurement as each other or the bound is on a number nobody stores, so both
 * come through this function and neither counts for itself.
 */
export function bodyByteLength(bytes: string): number {
  return Buffer.byteLength(bytes, 'utf8');
}

/**
 * Writes a saved plan's header and bodies, and reads what a project holds.
 *
 * **No `UPDATE` is issued here, ever.** That is the whole immutability property
 * of `saved_plan_body` and it is stated as one sentence a reader can check
 * against this file (`schema.ts`). A rename is a different route's business and
 * touches the header's `name` alone.
 */
export class SavedPlanRepository {
  constructor(private readonly opts: SavedPlanWriteOptions) {}

  /**
   * The count and the byte total, as one read.
   *
   * Public and separate from {@link write} because the quota check it feeds
   * must run **inside** the write transaction: read outside it, two saves at 99
   * of 100 both pass and both commit while "refused before any row is written"
   * stays technically true (design.md, "Write order"). So it takes a `Drizzle`
   * rather than opening its own connection — the caller is already inside a
   * transaction on one, and a second connection here would read a snapshot the
   * write lock does not cover.
   *
   * The total sums the **stored** `input_bytes`/`schedule_bytes` rather than
   * measuring the body rows, so it costs one row of the header index and never
   * reads a megabyte to learn its size.
   */
  async holdingOf(db: Drizzle, projectId: string): Promise<SavedPlanHoldingRow> {
    const rows = await db
      .select({
        plans: sql<number>`count(*)`,
        // `coalesce` twice: the outer one for a project with no rows at all,
        // the inner for a row whose schedule side is absent and therefore null.
        // Without the inner one SQLite's `sum` over any null makes the whole
        // total null, and a project holding one schedule-less plan would read
        // as holding no bytes.
        bytes: sql<number>`coalesce(sum(${savedPlan.inputBytes} + coalesce(${savedPlan.scheduleBytes}, 0)), 0)`,
      })
      .from(savedPlan)
      .where(eq(savedPlan.projectId, projectId));
    // An aggregate over no rows is still one row, so the empty case is the
    // `coalesce` above and not this line. It is written as a length check
    // rather than as `rows[0]?.plans ?? 0` because drizzle types the element
    // as present and the lint rule refuses a chain it can prove unnecessary.
    return rows.length === 0
      ? { plans: 0, bytes: 0 }
      : { plans: rows[0].plans, bytes: rows[0].bytes };
  }

  /**
   * Header, input body, schedule body, commit — on this class's own connection.
   *
   * `check` runs inside the transaction, after `BEGIN IMMEDIATE` and before any
   * insert, and returning a value from it refuses the save with nothing
   * written. It is a parameter rather than a step the caller takes first
   * because the only place the quota can be honestly read is in here, holding
   * the write lock; a caller that checked before calling would be checking a
   * number another save is free to change.
   *
   * The rollback is unconditional on failure and the connection is closed on
   * every path. A body write that throws leaves no header behind: that is 4.3's
   * subject, and it is a property of this ordering rather than of a later test.
   */
  async write<Refusal>(
    plan: SavedPlanWrite,
    check: (holding: SavedPlanHoldingRow, incomingBytes: number) => Promise<Refusal | null>,
  ): Promise<Refusal | null> {
    const inputBytes = bodyByteLength(plan.input.bytes);
    const scheduleBytes = plan.schedule.present
      ? bodyByteLength(plan.schedule.body.bytes)
      : null;
    const connection = this.opts.openConnection();
    try {
      const db = connection.db;
      const tx = drizzleOuterTransaction(db);
      tx.begin();
      try {
        const refusal = await check(
          await this.holdingOf(db, plan.projectId),
          inputBytes + (scheduleBytes ?? 0),
        );
        if (refusal !== null) {
          // Nothing has been written, so this releases the write lock rather
          // than undoing anything. `ROLLBACK` and not `COMMIT` all the same:
          // committing a transaction opened to write and then refused would
          // read, in a log, as a save that happened.
          tx.rollback();
          return refusal;
        }
        await db.insert(savedPlan).values({
          id: plan.id,
          projectId: plan.projectId,
          name: plan.name,
          createdBy: plan.createdBy,
          createdAt: plan.createdAt,
          inputSchemaVersion: plan.input.schemaVersion,
          inputBytes,
          inputSha256: plan.input.sha256,
          scheduleSchemaVersion: plan.schedule.present ? plan.schedule.body.schemaVersion : null,
          scheduleBytes,
          scheduleSha256: plan.schedule.present ? plan.schedule.body.sha256 : null,
          scheduleInputSha256: plan.schedule.present ? plan.schedule.inputSha256 : null,
          schedulerAlgorithmId: plan.schedule.present ? plan.schedule.algorithmId : null,
          scheduleAbsentReason: plan.schedule.present ? null : plan.schedule.absentReason,
        });
        await db
          .insert(savedPlanBody)
          .values({ savedPlanId: plan.id, kind: 'input', bytes: plan.input.bytes });
        if (plan.schedule.present) {
          await db
            .insert(savedPlanBody)
            .values({ savedPlanId: plan.id, kind: 'schedule', bytes: plan.schedule.body.bytes });
        }
        tx.commit();
        return null;
      } catch (failure) {
        tx.rollback();
        throw failure;
      }
    } finally {
      connection.close();
    }
  }

  /** One saved plan's stored body, or `null` when it has none of that kind. */
  async bodyOf(db: Drizzle, savedPlanId: string, kind: 'input' | 'schedule'): Promise<string | null> {
    const rows = await db
      .select({ bytes: savedPlanBody.bytes })
      .from(savedPlanBody)
      .where(and(eq(savedPlanBody.savedPlanId, savedPlanId), eq(savedPlanBody.kind, kind)));
    // Absent for real here, unlike the aggregate above: a schedule-less save
    // writes no `schedule` row at all, which is the point of the body table.
    return rows.length === 0 ? null : rows[0].bytes;
  }
}
