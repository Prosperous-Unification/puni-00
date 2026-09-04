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
} from '../repository/saved-plan';
import { bodyByteLength } from '../repository/saved-plan';
import type { PlanInputReads, SavedPlanCaptureRepository } from '../repository/saved-plan-capture';
import { planInputRowsOf } from './saved-plan-input';
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

  constructor(private readonly opts: SavedPlanServiceOptions) {
    this.quota = opts.quota ?? DEFAULT_SAVED_PLAN_QUOTA;
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
          const planned = schedulePlanInput(reads);
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
