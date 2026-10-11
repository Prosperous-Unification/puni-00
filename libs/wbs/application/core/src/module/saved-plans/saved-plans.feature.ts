import {
  bodyBytesRefusal,
  buildScheduleBody,
  CalendarRangeError,
  canonicalisePlanInput,
  DEFAULT_SAVED_PLAN_QUOTA,
  defaultSavedPlanName,
  diffPlans,
  normalisePlanInputForward,
  PlanInputVersionError,
  type PlanScheduleValue,
  type PlanSide,
  type SavedPlanQuota,
  type SavedPlanQuotaRefusal,
  type Schedule,
  SCHEDULE_ALGORITHM_ID,
  ScheduleCycleError,
  serialiseCanonicalPlanInput,
  serialiseScheduleBody,
} from '@wbs/domain';

import type { ResourceAccess } from '../../ports/organization-access';
import type { Digest } from '../../ports/runtime';
import type { PlanInputReads } from '../../ports/saved-plan-capture-values';
import type {
  SavedPlanBodyWrite,
  SavedPlanScheduleWrite,
  SavedPlanWrite,
  ScopedSavedPlanWrite,
} from '../../ports/saved-plan-values';
import type { Scheduler } from '../../ports/scheduler';
import type { AccessRefused, SharedPeopleRead } from '../../ports/shared-people-values';
import { planInputRowsOf } from '../../service/saved-plan-input';
import type { SavedPlanResource } from './saved-plan.resource';
import { bodyByteLength } from './saved-plan-integrity';
import { scheduleInputOfCaptured } from './saved-plan-schedule';
import type {
  SavedPlanCompareOutcome,
  SavedPlanListEntry,
  SavedPlanRead,
  SavedPlanReadOutcome,
  SavedPlanSideOutcome,
  SavedPlanSideRef,
  SavedPlanTouchResult,
} from './saved-plan-values';

const representableScheduleBody = (
  planned: Schedule,
  startDate: Parameters<typeof buildScheduleBody>[1],
  algorithmId: string,
): ReturnType<typeof buildScheduleBody> | null => {
  try {
    return buildScheduleBody(planned, startDate, algorithmId);
  } catch (failure) {
    if (failure instanceof CalendarRangeError) return null;
    throw failure;
  }
};

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
  /**
   * Optional, per assumption A-1: "save writes immediately with the server
   * timestamp as the default name, and naming is an edit afterwards, not a
   * modal". Absent means {@link defaultSavedPlanName} over this save's
   * `created_at` — chosen **here** and never by a caller, because no clock but
   * the one that stamps the record may name it.
   *
   * `undefined` rather than `null`, and that is the narrower of the two on
   * purpose: `null` in this codebase means "no such thing" as a stored fact
   * (see {@link SavedPlanSaveRequest.createdById}), whereas an absent name is a
   * caller declining to choose one and getting a real name anyway. No saved
   * plan is ever nameless.
   */
  readonly name?: string;
  /** The saver's display name, stored by value — never a `users` reference. */
  readonly createdBy: string;
  /**
   * The saving account, by reference — what task 6.1's permission rule reads.
   *
   * Required and nullable, never optional: `null` says "no account is behind
   * this save", which is the same fact a deleted creator leaves and falls back
   * to the project owner. A caller that forgets the field must not compile into
   * that fallback silently. See {@link SavedPlanWrite.createdById}.
   */
  readonly createdById: string | null;
  /** Reclassified by the writer on its separate connection, after capture. */
  readonly scoped?: ScopedSavedPlanWrite;
  /** Human authority already admitted by the route; rechecked with a shared snapshot. */
  readonly access?: ResourceAccess;
}

/**
 * The save answers, including a scoped in-transaction permission refusal.
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
  | { readonly outcome: 'forbidden' }
  | { readonly outcome: 'refused'; readonly refusal: SavedPlanQuotaRefusal }
  | { readonly outcome: 'no_project' }
  /** Another connection held the write lock. Nothing was written; a retry may succeed. */
  | { readonly outcome: 'snapshot_busy' };

export { mayTouchSavedPlan } from './saved-plan.resource';
export type {
  SavedPlanCompareOutcome,
  SavedPlanListEntry,
  SavedPlanRead,
  SavedPlanReadBody,
  SavedPlanReadOutcome,
  SavedPlanReadSchedule,
  SavedPlanSideRef,
  SavedPlanTouchResult,
} from './saved-plan-values';

export interface SavedPlanServiceOptions {
  /**
   * How a body's hash is taken and re-taken.
   *
   * Required, with no default: the hash a reader recomputes has to be the one
   * the writer took, and a service that reached for `node:crypto` would be
   * saying which runtime it is (D10).
   */
  readonly digest: Digest;
  readonly resource: SavedPlanResource;
  /** The saved plan's id. Injected so a test can name the row it then reads. */
  readonly newId: () => string;
  /** Epoch seconds. Injected for the same reason `createdAt` exists at all. */
  readonly now: () => number;
  /**
   * The three limits, **read once here** and not at the call site (task 4.7).
   * A literal at the call site is a limit each caller may spell differently.
   */
  readonly quota?: SavedPlanQuota;
  /** The installed scheduling capability used after captured reads detach. */
  readonly scheduler: Scheduler;
  /** Shared-mode capture keeps upstream selection coherent; omitted for isolated captures. */
  readonly captureSharedPlan?: (
    projectId: string,
    access: ResourceAccess,
  ) => Promise<SharedPeopleRead | AccessRefused | { readonly kind: 'isolated' }>;
}

/** A human whose admission expired before the shared read snapshot opened. */
export class SavedPlanCaptureRefusal extends Error {
  constructor(readonly refusal: AccessRefused['refusal']) {
    super(`Saved-plan capture refused: ${refusal}`);
    this.name = 'SavedPlanCaptureRefusal';
  }
}

/**
 * The scheduling attempt, as a union rather than a nullable `Schedule`.
 *
 * A cycle is not "no dates"; it is a reason there are none, and the two have to
 * be distinguishable at the type level or the writer will store the first as
 * the second.
 */
type CapturedSchedule =
  | { readonly present: true; readonly planned: Schedule; readonly algorithmId: string }
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
async function bodyWrite(
  digest: Digest,
  bytes: string,
  schemaVersion: number,
): Promise<SavedPlanBodyWrite> {
  return { schemaVersion, bytes, sha256: await digest.sha256(bytes) };
}

/**
 * Saves a plan: capture, schedule, serialize, hash, check, write.
 *
 * **Order is the design (design.md, "Write order").** Per-body byte checks
 * first, because they depend on nothing in the database. Then `BEGIN
 * IMMEDIATE`, and only inside it the count and total — read outside, two saves
 * at 99 of 100 both pass and both commit while "refused before any row is
 * written" stays technically true. {@link SavedPlanResource.writePlan} takes that
 * second check as a parameter for exactly this reason, so this class hands it
 * over rather than running it first.
 */
export class SavedPlanService {
  private readonly quota: SavedPlanQuota;

  constructor(private readonly opts: SavedPlanServiceOptions) {
    this.quota = opts.quota ?? DEFAULT_SAVED_PLAN_QUOTA;
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
    return this.opts.resource.readPlan(savedPlanId);
  }

  /**
   * The live plan as a comparison side. Writes nothing and consumes no quota.
   *
   * **It reuses {@link captureAndAttempt}, which is the save path's own
   * capture**, rather than reads of its own (task 7.3). Spec requires `current`
   * to come through the same canonical function the save uses, and the reason
   * is concrete: a `current` built from the projection's twelve awaited reads
   * lacks the registry and junction rows *by value*, so every saved-vs-current
   * comparison would report the saved side's tags, types and external systems
   * as removed. The diff's own completeness property never catches that — it
   * mutates `CanonicalPlanInput` values directly and never runs this path.
   *
   * Reuse also gives `current` the one `BEGIN DEFERRED` read snapshot. Without
   * it a torn `current` renders a comparison against a live plan that never
   * existed — the display-side twin of the defect the torn-read test (3.2)
   * exists to catch.
   *
   * **`current` carries a schedule, and it is not an absent one** (task 7.3a).
   * Spec's stored-schedule bound lawfully permits returning `unavailable` here,
   * and that would answer "no schedule was saved" about the live side of this
   * feature's primary direction. So the schedule is `schedule()`'s return over
   * the values just captured — computed outside the read snapshot under isolated
   * capture, or selected coherently within the shared chain snapshot by
   * {@link captureSharedPlan}, as {@link captureAndAttempt} arranges for the save path — labelled
   * with the algorithm identity currently in force, with a `ScheduleCycleError`
   * mapping to `infeasible` on the same derivation a save records.
   *
   * The body is round-tripped through {@link serialiseScheduleBody} rather than
   * handed over as the built object. The live side must compare against a
   * stored side on identical serialization terms; comparing a live object
   * against parsed stored bytes would report every difference the serializer
   * normalises away as a real one.
   */
  async projectCurrentPlan(projectId: string, access?: ResourceAccess): Promise<PlanSide | null> {
    const attempt = await this.captureAndAttempt(projectId, access);
    if (attempt === null) return null;
    const input = canonicalisePlanInput(planInputRowsOf(attempt.reads));
    if (!attempt.schedule.present) {
      return { input, schedule: { present: false, absentReason: attempt.schedule.absentReason } };
    }
    // The captured project's own start date, not today's — `scheduleWrite`'s
    // rule, for the same reason: re-rendering against a start that has since
    // moved would restate the plan.
    const built = representableScheduleBody(
      attempt.schedule.planned,
      attempt.reads.project.startDate,
      attempt.schedule.algorithmId,
    );
    // Proof: return the builder call directly and `maps a calendar-range plan
    // to infeasible` throws instead of returning a comparison side.
    if (built === null) {
      return { input, schedule: { present: false, absentReason: 'infeasible' } };
    }
    return {
      input,
      schedule: {
        present: true,
        algorithmId: built.algorithmId,
        body: JSON.parse(serialiseScheduleBody(built)) as PlanScheduleValue,
      },
    };
  }

  /**
   * A project's saved plans, newest first — headers only, and **unverified**.
   *
   * The asymmetry with {@link read} is the point and not an oversight. `read`
   * recomputes both digests because it is handing over bytes somebody will act
   * on; this hands over an index, and verifying it would mean reading every
   * stored body of every plan to draw a list of names. A plan whose bytes are
   * damaged is listed like any other and refuses when it is opened, which is
   * also the only behaviour under which a corrupt plan can be found and deleted
   * rather than becoming a row that occupies quota and cannot be reached.
   *
   * The absent reason is passed through as stored, not narrowed to the three
   * this build knows. That is {@link SavedPlanResource.readPlan}'s rule and this stays consistent
   * with it: refusing a list because one row's reason string is unfamiliar
   * would deny access to every other plan in the project over a label.
   */
  async list(projectId: string): Promise<SavedPlanListEntry[]> {
    return this.opts.resource.listPlans(projectId);
  }

  /**
   * Compares two sides of one project's plan (task 7.3b's service half).
   *
   * **Both sides are resolved against `projectId`, and a saved plan that
   * belongs elsewhere answers `not_found`.** The project id is not decoration
   * on this route the way it would be on {@link read}: `current` has no id of
   * its own and can only mean "the live plan of the project named in the path",
   * so the path's project is load-bearing here. Once it is, a side that names a
   * plan of some *other* project has to be refused rather than compared, or the
   * route quietly compares two projects and reports every work item of each as
   * added and removed — and, worse, a caller who may read project A's plans
   * could name one of them beside `current` on project B.
   *
   * `not_found` rather than a distinct "wrong project": the caller learns
   * exactly what a caller naming a plan id that does not exist learns, which is
   * the same rule {@link read}'s single-prefix URL enforces structurally.
   *
   * **The stored side is parsed here and normalised forward** (task 7.4), never
   * rewritten. {@link SavedPlanResource.readPlan} has already refused a version outside
   * `SUPPORTED_INPUT_BODY_VERSIONS`, so today's normalisation is the identity
   * and its three refusals are unreachable from this path — stated rather than
   * claimed as coverage. It is called anyway because the day a second version
   * exists is the day this call is the only thing standing between an old body
   * and a diff that reports a removed field as a change nobody made.
   */
  async compare(
    projectId: string,
    left: SavedPlanSideRef,
    right: SavedPlanSideRef,
    access?: ResourceAccess,
  ): Promise<SavedPlanCompareOutcome> {
    const leftSide = await this.sideOf(projectId, left, access);
    if (leftSide.outcome !== 'side') return leftSide;
    const rightSide = await this.sideOf(projectId, right, access);
    if (rightSide.outcome !== 'side') return rightSide;
    return { outcome: 'compared', diff: diffPlans(leftSide.side, rightSide.side) };
  }

  /**
   * One side of {@link compare}, or the refusal that stands in for it.
   *
   * `current` answering `null` is `no_project`: {@link projectCurrentPlan}
   * returns it when the project is gone, which is the same fact the route's own
   * project read would have found a moment earlier.
   */
  private async sideOf(
    projectId: string,
    ref: SavedPlanSideRef,
    access?: ResourceAccess,
  ): Promise<SavedPlanSideOutcome> {
    if (ref.kind === 'current') {
      const side = await this.projectCurrentPlan(projectId, access);
      return side === null ? { outcome: 'no_project' } : { outcome: 'side', side };
    }
    /*
      **Scope before bytes**, and the order is the finding.

      This check used to sit *after* `read`, which verifies every stored byte
      and can answer `corrupt`. A corrupt saved plan belonging to **another**
      project therefore left here as 422 `corrupt` — naming the foreign id and
      its condition — where every foreign plan is promised the same
      indistinguishable 404 an unknown id gets. Sol's I2 on PR 202: the path's
      project id was authoritative on the healthy path and not on the error
      paths, which is where a prober would look.

      `principalsOf` is the right read for it and already exists for exactly
      this shape of question: one header row, no bodies parsed, no hashes
      recomputed. It is what the resource's touch methods authorize rename and
      delete off, and for the reason stated there — a plan too damaged to open
      must still be answerable *about*.

      No second scope check after the read: `project_id` is written once and
      never updated (`saved-plan.ts`: "No `UPDATE` is issued here, ever", and
      rename touches `name` alone), so the two reads cannot disagree about
      which project owns a plan.
    */
    const found = await this.opts.resource.readPlanForProject(projectId, ref.savedPlanId);
    if (found.outcome === 'not_found')
      return { outcome: 'not_found', savedPlanId: ref.savedPlanId };
    if (found.outcome === 'corrupt') {
      return { outcome: 'corrupt', savedPlanId: ref.savedPlanId, refusal: found.refusal };
    }
    /*
      `planSideOfRead` normalises the stored input forward, and that throws.

      `normalisePlanInputForward` refuses a version it cannot bring to this
      build's — unparseable, from the future, or with no upgrade step — by
      throwing `PlanInputVersionError`, and nothing caught it here. Elysia
      answered **500** for a database state the code anticipates by name, which
      R5 forbids: a plan this node cannot read is a modelled refusal, not a
      crash. Gemini's F-02 on PR 202. It joins the other three integrity
      refusals and leaves as the same 422 the route already sends for `corrupt`.
    */
    try {
      return { outcome: 'side', side: planSideOfRead(found.plan) };
    } catch (failure) {
      if (!(failure instanceof PlanInputVersionError)) throw failure;
      return {
        outcome: 'corrupt',
        savedPlanId: ref.savedPlanId,
        refusal: {
          reason: 'input_version_unreadable',
          savedPlanId: ref.savedPlanId,
          body: 'input',
          storedVersion: failure.storedVersion,
          readerVersion: failure.readerVersion,
          versionReason: failure.reason,
        },
      };
    }
  }

  /**
   * The project a saved plan belongs to, from its header alone, so a corrupt
   * plan still answers; null for a plan that is not there. Routes addressed by
   * a saved plan's id check that project against the caller's access.
   */
  projectOf(savedPlanId: string): Promise<string | null> {
    return this.opts.resource.projectOfPlan(savedPlanId);
  }

  /**
   * Renames a saved plan, if `actorId` may touch it. Writes `name` and nothing
   * else — the repository's one `UPDATE` is the whole of the write.
   *
   * **Authorised off `principalsOf`, never off {@link read}.** `read` verifies
   * every stored byte and can answer `corrupt`, and a corrupt plan must stay
   * renameable and deletable or it holds its project's quota forever with
   * nothing able to reach it. Routing the check through `read` would make "your
   * saved plan is damaged" and "you may not rename your damaged saved plan" the
   * same answer.
   *
   * **Not the project's ordinary write rule** (`canEdit`), and that is the point
   * of task 6.1: on an unrestricted project every authenticated account may
   * write, so the ordinary rule would let any account relabel anybody's
   * permanent record. A saved plan is not an editable row of the plan; it is
   * somebody's record of it.
   */
  async rename(
    savedPlanId: string,
    actorId: string,
    name: string,
    scoped?: ScopedSavedPlanWrite,
  ): Promise<SavedPlanTouchResult> {
    return this.opts.resource.renamePlan(savedPlanId, actorId, name, scoped);
  }

  /**
   * Deletes a saved plan, if `actorId` may touch it. Both body rows go with the
   * header, by the schema's own cascade.
   *
   * The same rule as {@link rename} and deliberately the same one: deleting is
   * the only way a saved plan leaves, so anybody who may relabel a record may
   * also destroy it and nobody else may do either.
   */
  async delete(
    savedPlanId: string,
    actorId: string,
    scoped?: ScopedSavedPlanWrite,
  ): Promise<SavedPlanTouchResult> {
    return this.opts.resource.deletePlan(savedPlanId, actorId, scoped);
  }

  async save(request: SavedPlanSaveRequest): Promise<SavedPlanSaveOutcome> {
    // Stamped **before** the capture opens, never after it commits. The spec's
    // rule is that `created_at` labels when the plan was looked at, and a
    // capture is slow enough for the two to differ; taking it here can only be
    // earlier than the snapshot, never later, so the label never claims to
    // cover a write that happened after it.
    const createdAt = this.opts.now();
    const attempt = await this.captureAndAttempt(request.projectId, request.access);
    if (attempt === null) return { outcome: 'no_project' };

    // Folded once. The header's `input_schema_version` is read off **this**
    // value rather than from `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` a second
    // time, for the reason {@link scheduleWrite} states about the schedule
    // side: the version stored beside the bytes is the version those bytes
    // carry, not a constant that happened to agree with them.
    const canonical = canonicalisePlanInput(planInputRowsOf(attempt.reads));
    const input = await bodyWrite(
      this.opts.digest,
      serialiseCanonicalPlanInput(canonical),
      canonical.schemaVersion,
    );
    const schedule = await scheduleWrite(this.opts.digest, attempt, input.sha256);

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
      // A-1's default, off the `createdAt` above rather than a second clock
      // read: the name and the timestamp it claims to be are one value. `??`
      // and not `||`, so a caller who genuinely sends `''` is refused by the
      // route's `minLength: 1` instead of being quietly renamed here.
      name: request.name ?? defaultSavedPlanName(createdAt),
      createdBy: request.createdBy,
      createdById: request.createdById,
      createdAt,
      input,
      schedule,
    };
    const written = await this.opts.resource.writePlan(record, this.quota, request.scoped);
    // Switched over rather than tested for `null`, so a fourth repository
    // outcome would stop compiling here instead of being read as a save.
    switch (written.outcome) {
      case 'written':
        return { outcome: 'saved', record };
      case 'refused':
        return { outcome: 'refused', refusal: written.refusal };
      case 'snapshot_busy':
        return { outcome: 'snapshot_busy' };
      case 'forbidden':
        return { outcome: 'forbidden' };
      case 'not_found':
        return { outcome: 'no_project' };
    }
  }

  /**
   * Captures one detached input and asks the shared scheduler for that exact input.
   * Explicit shared capture borrows {@link SharedPeopleReader}'s coherent chain selection;
   * the same detached evidence feeds save and current comparison through the S4 policy below.
   *
   * Under isolated capture, {@link SavedPlanResource.capturePlan} closes its snapshot before it
   * returns, so both Fast scheduling and optimized-cache selection happen with
   * no capture connection held. The scheduler receives `mode: 'capture'`: it
   * may read an already-computed optimized answer, but it cannot mutate live
   * generations, slots or queues to create one for a historical record.
   *
   * The scheduler's closed state is mapped to the stored S4 policy here:
   * selected ready answers are stored with their exact algorithm identity;
   * work still converging is `pending`; failed or corrupt work is
   * `unavailable`; solver infeasibility and dependency cycles are
   * `infeasible`. A missing project remains distinct as `null`.
   */
  private async captureAndAttempt(
    projectId: string,
    access?: ResourceAccess,
  ): Promise<ScheduleAttempt | null> {
    // Proof: ignoring shared capture stored start 2 instead of 3 in the upstream-edit/delete negative.
    let observed:
      Awaited<ReturnType<NonNullable<SavedPlanServiceOptions['captureSharedPlan']>>> | undefined;
    if (this.opts.captureSharedPlan !== undefined) {
      // Proof: removing this guard made the installed feature's no-access save and
      // current test invoke the shared callback twice before any authorization.
      if (access === undefined)
        throw new Error('installed shared saved-plan capture requires admitted human access');
      observed = await this.opts.captureSharedPlan(projectId, access);
    }
    if (observed?.kind === 'access_refused') throw new SavedPlanCaptureRefusal(observed.refusal);
    const shared = observed?.kind === 'isolated' ? undefined : observed;
    if (shared?.kind === 'not_found') return null;
    const reads =
      shared === undefined ? await this.opts.resource.capturePlan(projectId) : shared.reads;
    if (reads === null) return null;
    if (shared?.kind === 'engine_unavailable')
      return { reads, schedule: { present: false, absentReason: 'unavailable' } };
    if (shared?.kind === 'unavailable')
      return {
        reads,
        schedule: {
          present: false,
          absentReason: 'infeasible',
        },
      };
    const input = shared?.input ?? scheduleInputOfCaptured(reads);
    try {
      const scheduled =
        shared?.scheduled ??
        this.opts.scheduler.read({
          projectId,
          input,
          engine: reads.project.scheduleEngine,
          objective: reads.project.scheduleObjective,
          enabled: reads.project.optimizationEnabled,
          mode: 'capture',
        });
      if (scheduled.kind === 'engine_unavailable')
        return { reads, schedule: { present: false, absentReason: 'unavailable' } };
      if (!reads.project.optimizationEnabled || reads.project.scheduleEngine === 'fast') {
        return {
          reads,
          schedule: {
            present: true,
            planned: scheduled.fast,
            algorithmId: SCHEDULE_ALGORITHM_ID,
          },
        };
      }
      const optimization = scheduled.optimization;
      if (optimization === null) {
        throw new Error('optimized capture returned no optimization state');
      }
      const objective = reads.project.scheduleObjective;
      const variant = optimization.variants[objective];
      switch (variant.state) {
        case 'ready': {
          const planned = optimization.schedules[objective];
          if (planned === null)
            throw new Error(`optimized capture reported ready without ${objective}`);
          return {
            reads,
            schedule: {
              present: true,
              // Proof: substituting `scheduled.fast` here stored
              // `waitingForCapacity: 0`; the selected ready schedule test expected 73.
              // Proof: mounted shared selected-ready save stored start 3 instead of 8.
              planned,
              algorithmId: `optimized:${optimization.contractVersion}:${objective}:${String(optimization.budgetMs)}`,
            },
          };
        }
        case 'idle':
        case 'pending':
        case 'retrying':
          return { reads, schedule: { present: false, absentReason: 'pending' } };
        case 'failed':
        case 'corrupt':
          return { reads, schedule: { present: false, absentReason: 'unavailable' } };
        case 'plan-infeasible':
          return { reads, schedule: { present: false, absentReason: 'infeasible' } };
      }
    } catch (failure) {
      if (!(failure instanceof ScheduleCycleError)) throw failure;
      return { reads, schedule: { present: false, absentReason: 'infeasible' } };
    }
  }
}

/**
 * A verified read, as a comparison side (task 7.3b).
 *
 * The bytes are parsed here and **nowhere else**: {@link SavedPlanService.read}
 * hands over the stored bytes unparsed on purpose, so the one place that turns
 * them into values is the one place that also runs them forward through
 * {@link normalisePlanInputForward}. Splitting those two apart is how a body
 * comes to be diffed at its stored shape against a reader that has moved on.
 */
function planSideOfRead(plan: SavedPlanRead): PlanSide {
  return {
    input: normalisePlanInputForward(JSON.parse(plan.input.bytes), plan.input.schemaVersion),
    schedule: plan.schedule.present
      ? {
          present: true,
          algorithmId: plan.schedule.algorithmId,
          body: JSON.parse(plan.schedule.body.bytes) as PlanScheduleValue,
        }
      : { present: false, absentReason: plan.schedule.absentReason },
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
 * that this historical display was saved beside these target rows and refuse
 * to render it against another captured target. Shared-mode dates also reflect
 * detached upstream bookings, whose durable replay provenance is out of scope.
 */
async function scheduleWrite(
  digest: Digest,
  attempt: ScheduleAttempt,
  inputSha256: string,
): Promise<SavedPlanScheduleWrite> {
  if (!attempt.schedule.present) {
    return { present: false, absentReason: attempt.schedule.absentReason };
  }
  // The captured project's own start date, not today's: re-rendering the dates
  // against a start that has since moved would restate the plan.
  const built = representableScheduleBody(
    attempt.schedule.planned,
    attempt.reads.project.startDate,
    attempt.schedule.algorithmId,
  );
  // A dimensionless schedule can be valid while its saved calendar body is
  // not representable. Save the input and name the absent schedule, as cycles do.
  if (built === null) return { present: false, absentReason: 'infeasible' };
  return {
    present: true,
    body: await bodyWrite(digest, serialiseScheduleBody(built), built.version),
    inputSha256,
    algorithmId: built.algorithmId,
  };
}
