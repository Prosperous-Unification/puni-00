import { createHash } from 'node:crypto';

import {
  canonicalisePlanInput,
  type Schedule,
  ScheduleCycleError,
  serialiseCanonicalPlanInput,
} from '@wbs/domain';

import type {
  SavedPlanBodyWrite,
  SavedPlanRepository,
  SavedPlanScheduleWrite,
  SavedPlanWrite,
  StoredSavedPlan,
} from '../repository/saved-plan';
import { bodyByteLength } from '../repository/saved-plan';
import type { PlanInputReads, SavedPlanCaptureRepository } from '../repository/saved-plan-capture';
import { planInputRowsOf } from './saved-plan-input';
import type { SavedPlanIntegrityRefusal } from './saved-plan-integrity';
import { verifyBody } from './saved-plan-integrity';
import type { SavedPlanQuota, SavedPlanQuotaRefusal } from './saved-plan-quota';
import { bodyBytesRefusal, DEFAULT_SAVED_PLAN_QUOTA, holdingRefusal } from './saved-plan-quota';
import { captureAndSchedulePlan, schedulePlanInput } from './saved-plan-schedule';
import { buildScheduleBody, serialiseScheduleBody } from './saved-plan-schedule-body';

/**
 * Why a saved plan has no schedule body.
 *
 * The three the spec names, and no fourth: `pending` while an optimization run
 * has not answered, `infeasible` for a plan whose dependencies form a cycle,
 * `unavailable` for a scheduling attempt that could not be made at all. Absence
 * always has a reason — `saved_plan`'s check constraint refuses a schedule-less
 * row without one, and a comparison renders it rather than borrowing the live
 * scheduler's dates for a side that never had any.
 */
export type SavedPlanScheduleAbsentReason = 'pending' | 'infeasible' | 'unavailable';

/** What one save asks for. The bodies are read, never passed in. */
export interface SavedPlanSaveRequest {
  readonly projectId: string;
  readonly name: string;
  /** The saver's display name, stored by value — never a `users` reference. */
  readonly createdBy: string;
}

/**
 * The four answers a save has, as a union.
 *
 * `refused` carries the quota refusal rather than a boolean because the caller
 * has to say *which* limit was hit; `no_project` is separate from `refused`
 * because a project that does not exist is not a project over its quota, and a
 * route maps them to different statuses.
 *
 * `snapshot_busy` is separate from `refused` for the same reason and a stronger
 * one: a quota refusal is a fact about the project that will still be true in a
 * second, and this one is a fact about *this instant* that a retry may find
 * gone. A surface that folded them together would offer "try again" for a
 * project at its hundredth plan, or fail to offer it here (task 8.5).
 */
export type SavedPlanSaveOutcome =
  | { readonly outcome: 'saved'; readonly record: SavedPlanWrite }
  | { readonly outcome: 'refused'; readonly refusal: SavedPlanQuotaRefusal }
  | { readonly outcome: 'no_project' }
  /** Another connection held the write lock. Nothing was written; a retry may succeed. */
  | { readonly outcome: 'snapshot_busy' };

/** One side of a saved plan, as it was read back and verified. */
export interface SavedPlanReadBody {
  /** The version those bytes were written under, off the header. */
  readonly schemaVersion: number;
  /** The stored bytes, unparsed and unmodified. */
  readonly bytes: string;
  /** The header's hash, which this read recomputed over {@link bytes} and matched. */
  readonly sha256: string;
}

/**
 * The schedule side of a read — present with its bytes, or absent with a reason.
 *
 * A union for the same reason {@link SavedPlanScheduleWrite} is one: the two
 * states have disjoint fields, and a caller that has to test five nullable
 * columns to learn which it holds is a caller that will get it wrong once.
 */
export type SavedPlanReadSchedule =
  | {
      readonly present: true;
      readonly body: SavedPlanReadBody;
      /** The `input_sha256` these dates were computed from, as stored. */
      readonly inputSha256: string;
      readonly algorithmId: string;
    }
  | { readonly present: false; readonly absentReason: string };

/** One saved plan, handed back as it was stored. */
export interface SavedPlanRead {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly input: SavedPlanReadBody;
  readonly schedule: SavedPlanReadSchedule;
}

/**
 * The three answers a read has.
 *
 * `corrupt` is separate from `not_found` because they are different facts about
 * different things: one plan does not exist, the other exists and cannot be
 * trusted, and a surface that folded them would tell a user their saved plan
 * was never there.
 */
export type SavedPlanReadOutcome =
  | { readonly outcome: 'read'; readonly plan: SavedPlanRead }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'corrupt'; readonly refusal: SavedPlanIntegrityRefusal };

export interface SavedPlanServiceOptions {
  readonly capture: SavedPlanCaptureRepository;
  readonly plans: SavedPlanRepository;
  /** The saved plan's id. Injected so a test can name the row it then reads. */
  readonly newId: () => string;
  /** Epoch seconds. Injected for the same reason `createdAt` exists at all. */
  readonly now: () => number;
  /**
   * The three limits, **read once here** and not at the call site (task 4.7).
   * A literal at the call site is a limit each caller may spell differently.
   */
  readonly quota?: SavedPlanQuota;
  /**
   * The scheduler the **save** path runs over its detached reads.
   *
   * Injected for one reason, and it is the read path's (task 5.1): a reader
   * that re-derives dates from stored settings passes every comparison of dates
   * a test could make, because it computes the same answer the writer did. The
   * only observation that separates it from a reader returning stored bytes is
   * whether `schedule()` was *called*, and that needs a seam. Defaulted to
   * {@link schedulePlanInput}, so no production caller passes one.
   */
  readonly schedule?: (reads: PlanInputReads) => Schedule;
}

/**
 * The scheduling attempt, as a union rather than a nullable `Schedule`.
 *
 * A cycle is not "no dates"; it is a reason there are none, and the two have to
 * be distinguishable at the type level or the writer will store the first as
 * the second.
 */
type CapturedSchedule =
  | { readonly present: true; readonly planned: Schedule }
  | { readonly present: false; readonly absentReason: SavedPlanScheduleAbsentReason };

/** One capture's reads and the outcome of scheduling them. */
interface ScheduleAttempt {
  readonly reads: PlanInputReads;
  readonly schedule: CapturedSchedule;
}

/**
 * A body and the hash taken over the exact bytes that will be stored.
 *
 * Serialize, hash, store — in that order and over one string, so the hash a
 * reader recomputes is over the bytes it read and not over a second rendering
 * of the same value. Every `JSON.stringify` in this feature is upstream of this
 * function; nothing re-serializes after the digest is taken.
 */
function bodyWrite(bytes: string, schemaVersion: number): SavedPlanBodyWrite {
  return {
    schemaVersion,
    bytes,
    sha256: createHash('sha256').update(bytes, 'utf8').digest('hex'),
  };
}

/**
 * Saves a plan: capture, schedule, serialize, hash, check, write.
 *
 * **Order is the design (design.md, "Write order").** Per-body byte checks
 * first, because they depend on nothing in the database. Then `BEGIN
 * IMMEDIATE`, and only inside it the count and total — read outside, two saves
 * at 99 of 100 both pass and both commit while "refused before any row is
 * written" stays technically true. {@link SavedPlanRepository.write} takes that
 * second check as a parameter for exactly this reason, so this class hands it
 * over rather than running it first.
 */
export class SavedPlanService {
  private readonly quota: SavedPlanQuota;
  private readonly schedule: (reads: PlanInputReads) => Schedule;

  constructor(private readonly opts: SavedPlanServiceOptions) {
    this.quota = opts.quota ?? DEFAULT_SAVED_PLAN_QUOTA;
    this.schedule = opts.schedule ?? schedulePlanInput;
  }

  /**
   * Hands back one saved plan's stored bytes, or says why it will not.
   *
   * **Nothing is recomputed and nothing is parsed** (task 5.1). The bodies go
   * out as the bytes on disk, and this method holds no scheduler, no clock and
   * no plan input: the whole value of a saved plan is that it answers with what
   * was true when it was saved, and a reader that re-derived anything would
   * answer with what is true now while looking identical on every field a test
   * usually asserts.
   *
   * **What it does do is check** (task 5.1b). Every read recomputes SHA-256
   * over each body's stored bytes and compares it with the header, because a
   * hash nothing recomputes is a comment. 2.4's guard is a source scan — it
   * proves no `UPDATE` is written in this repository, and cannot see a disk
   * fault, a restored backup or a write from outside this process. A mismatch
   * is a typed refusal naming the plan and the body; it is never repaired and
   * never defaulted, because the bytes are the record and this code has no
   * standing to guess what they should have been.
   */
  async read(savedPlanId: string): Promise<SavedPlanReadOutcome> {
    const stored = await this.opts.plans.readOf(savedPlanId);
    if (stored === null) return { outcome: 'not_found' };
    return readOfStored(stored);
  }

  async save(request: SavedPlanSaveRequest): Promise<SavedPlanSaveOutcome> {
    // Stamped **before** the capture opens, never after it commits. The spec's
    // rule is that `created_at` labels when the plan was looked at, and a
    // capture is slow enough for the two to differ; taking it here can only be
    // earlier than the snapshot, never later, so the label never claims to
    // cover a write that happened after it.
    const createdAt = this.opts.now();
    const attempt = await this.captureAndAttempt(request.projectId);
    if (attempt === null) return { outcome: 'no_project' };

    // Folded once. The header's `input_schema_version` is read off **this**
    // value rather than from `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` a second
    // time, for the reason {@link scheduleWrite} states about the schedule
    // side: the version stored beside the bytes is the version those bytes
    // carry, not a constant that happened to agree with them.
    const canonical = canonicalisePlanInput(planInputRowsOf(attempt.reads));
    const input = bodyWrite(serialiseCanonicalPlanInput(canonical), canonical.schemaVersion);
    const schedule = scheduleWrite(attempt, input.sha256);

    const early = bodyBytesRefusal(
      {
        input: bodyByteLength(input.bytes),
        schedule: schedule.present ? bodyByteLength(schedule.body.bytes) : null,
      },
      this.quota,
    );
    if (early !== null) return { outcome: 'refused', refusal: early };

    const record: SavedPlanWrite = {
      id: this.opts.newId(),
      projectId: request.projectId,
      name: request.name,
      createdBy: request.createdBy,
      createdAt,
      input,
      schedule,
    };
    const written = await this.opts.plans.write<SavedPlanQuotaRefusal>(
      record,
      (holding, incoming) => Promise.resolve(holdingRefusal(holding, incoming, this.quota)),
    );
    // Switched over rather than tested for `null`, so a fourth repository
    // outcome would stop compiling here instead of being read as a save.
    switch (written.outcome) {
      case 'written':
        return { outcome: 'saved', record };
      case 'refused':
        return { outcome: 'refused', refusal: written.refusal };
      case 'snapshot_busy':
        return { outcome: 'snapshot_busy' };
    }
  }

  /**
   * The capture and its scheduling run, with a cycle recovered rather than lost.
   *
   * A plan whose dependencies form a cycle is still **saved** — with the reason
   * `infeasible` and no schedule body — so this needs the capture's reads on the
   * path where `schedule()` threw. `captureAndSchedulePlan` cannot return them:
   * it composes the two and a throw takes the whole call with it. So the
   * outcome is recorded in the injected scheduler, which is handed the reads,
   * and the `ScheduleCycleError` is **re-thrown** from there: the composition's
   * own return value is never made to lie about a schedule it does not have,
   * and every other caller of it sees the cycle exactly as before.
   *
   * The connection is already closed when the scheduler runs (task 3.3), so a
   * throw out of it leaks no handle.
   *
   * Collected into an array rather than assigned to a `ScheduleAttempt | null`:
   * an assignment inside a callback stays `null` to the narrowing, and the
   * length also distinguishes "the scheduler never ran" — a project that does
   * not exist — from "it ran and found nothing".
   */
  private async captureAndAttempt(projectId: string): Promise<ScheduleAttempt | null> {
    const attempts: ScheduleAttempt[] = [];
    try {
      await captureAndSchedulePlan(this.opts.capture, projectId, (reads: PlanInputReads) => {
        try {
          const planned = this.schedule(reads);
          attempts.push({ reads, schedule: { present: true, planned } });
          return planned;
        } catch (failure) {
          if (!(failure instanceof ScheduleCycleError)) throw failure;
          attempts.push({ reads, schedule: { present: false, absentReason: 'infeasible' } });
          throw failure;
        }
      });
    } catch (failure) {
      if (!(failure instanceof ScheduleCycleError)) throw failure;
    }
    return attempts.length === 0 ? null : attempts[0];
  }
}

/**
 * Verifies one stored saved plan and shapes it, or refuses it.
 *
 * A free function over {@link StoredSavedPlan} rather than a method, so the
 * whole verification is testable by handing it bytes — including the states a
 * database cannot easily be made to produce — while the service method above
 * stays the one line that fetches.
 *
 * The header decides which sides exist and the bodies are checked against it:
 * `schedule_sha256` is null exactly when no schedule was saved (the
 * `saved_plan_schedule_all_or_nothing` check makes that an invariant of the
 * table, not a hope), so an absent schedule is read off the header rather than
 * inferred from a missing body row. Inferring it the other way would turn a
 * body a cascade half-deleted into a legitimately schedule-less plan.
 */
function readOfStored(stored: StoredSavedPlan): SavedPlanReadOutcome {
  const header = stored.header;
  const inputRefusal = verifyBody(header.id, 'input', stored.bodies.input, header.inputSha256);
  if (inputRefusal !== null) return { outcome: 'corrupt', refusal: inputRefusal };
  // Narrowed by the check above rather than asserted: `verifyBody` returns a
  // `body_missing` refusal for null, so reaching here means the bytes are there.
  const inputBytes = stored.bodies.input ?? '';

  const schedule = scheduleOfStored(stored);
  if (schedule.outcome === 'corrupt') return schedule;

  return {
    outcome: 'read',
    plan: {
      id: header.id,
      projectId: header.projectId,
      name: header.name,
      createdBy: header.createdBy,
      createdAt: header.createdAt,
      input: {
        schemaVersion: header.inputSchemaVersion,
        bytes: inputBytes,
        sha256: header.inputSha256,
      },
      schedule: schedule.schedule,
    },
  };
}

/** The schedule half of {@link readOfStored}, verified the same way. */
function scheduleOfStored(
  stored: StoredSavedPlan,
): { outcome: 'ok'; schedule: SavedPlanReadSchedule } | { outcome: 'corrupt'; refusal: SavedPlanIntegrityRefusal } {
  const header = stored.header;
  if (
    header.scheduleSha256 === null ||
    header.scheduleSchemaVersion === null ||
    header.scheduleInputSha256 === null ||
    header.schedulerAlgorithmId === null
  ) {
    return {
      outcome: 'ok',
      // The check constraint makes this non-null whenever the four above are
      // null. `?? 'unavailable'` is the one default in this file and it is for
      // a row that could not have been written by this code; a reader that
      // threw here would refuse a plan over a reason string rather than over
      // anything about the plan's own bytes.
      schedule: { present: false, absentReason: header.scheduleAbsentReason ?? 'unavailable' },
    };
  }
  const refusal = verifyBody(header.id, 'schedule', stored.bodies.schedule, header.scheduleSha256);
  if (refusal !== null) return { outcome: 'corrupt', refusal };
  return {
    outcome: 'ok',
    schedule: {
      present: true,
      body: {
        schemaVersion: header.scheduleSchemaVersion,
        bytes: stored.bodies.schedule ?? '',
        sha256: header.scheduleSha256,
      },
      inputSha256: header.scheduleInputSha256,
      algorithmId: header.schedulerAlgorithmId,
    },
  };
}

/**
 * The schedule side of the write, built from the attempt.
 *
 * The header's `schema_version` and `scheduler_algorithm_id` are read **off the
 * built body** rather than from the constants a second time. The body already
 * carries both, and two independent readings of one fact are two things that
 * can drift; a reader that checks the header against the body would then have
 * to decide which is right.
 *
 * `inputSha256` is this save's own input hash, stored so a reader can *check*
 * that these dates were computed from these rows and refuse to render them
 * against an input that did not produce them.
 */
function scheduleWrite(attempt: ScheduleAttempt, inputSha256: string): SavedPlanScheduleWrite {
  if (!attempt.schedule.present) {
    return { present: false, absentReason: attempt.schedule.absentReason };
  }
  // The captured project's own start date, not today's: re-rendering the dates
  // against a start that has since moved would restate the plan.
  const built = buildScheduleBody(attempt.schedule.planned, attempt.reads.project.startDate);
  return {
    present: true,
    body: bodyWrite(serialiseScheduleBody(built), built.version),
    inputSha256,
    algorithmId: built.algorithmId,
  };
}
