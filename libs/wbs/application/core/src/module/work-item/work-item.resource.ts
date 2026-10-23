import {
  addWorkdays,
  type AllowancePercent,
  assumedAssignee,
  type Attempt,
  type AttemptOutcome,
  byTreeOrder,
  CalendarRangeError,
  canDepend,
  canReparent,
  type ChargedEstimate,
  chargedWorkdays,
  type Claim,
  type Days,
  deadlineOffsetOf,
  decideClaim,
  decideRelease,
  type Demand,
  deriveNumbers,
  type EstimateRule,
  estimateUnitOf,
  firstWorkdayOf,
  formatScopedDependencyKey,
  formatStepNodeId,
  formatStepReference,
  freeUnitsOf,
  haveSameSliceOrder,
  type Hold,
  type IsoDate,
  isoDateOfInstantIn,
  isWithin,
  isWritableRelationshipType,
  lastWorkdayOf,
  type LimitCrossed,
  MAX_ESTIMATE_DAYS,
  MEASURE_METRICS,
  type MeasureMetric,
  minuteTrioProblem,
  nextWorkday,
  type NodeReading,
  nodeResourcesOf,
  occupancyByResource,
  type OccupancyRow,
  orderSteps,
  ORDINARY_BAND_RANK,
  parentIndexOf,
  placeAfter,
  POSITION_STEP,
  type PriorityBand,
  projectExecutionBlockers,
  type Readiness,
  refuseDemand,
  refuseLimit,
  refuseOccupancy,
  type Resource,
  type ResourceCapacity,
  type ResourceOccupancy,
  type ResourceUnits,
  rollUp,
  rollUpActuals,
  rollUpCharged,
  rollUpMeasures,
  rollUpProgress,
  rollUpWorkItemStatuses,
  type Schedule,
  ScheduleCycleError,
  type Scheduled,
  type ScopedDependencyEndpoint,
  type SettableStatus,
  type Sibling,
  sliceKey,
  SOLVER_OBJECTIVES,
  type SolverObjectiveName,
  type Span,
  spanOfAttempts,
  type StepNodeCycle,
  type StepNodeRef,
  type StepState,
  treeOrder,
  type TypedDependency,
  UNKNOWN,
  workedStepsOf,
  type WorkItemStatus,
} from '@wbs/domain';
import { arrangeBySchedule as arrangeSiblingsBySchedule } from '@wbs/domain/arrange-siblings';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type { ActualStore, StoredActual } from '../../ports/actual-store';
import type { CapacityStore } from '../../ports/capacity-store';
import type { LivePlanStore } from '../../ports/chain-snapshot-store';
import type {
  ClaimIdentity,
  ClaimOccupancy,
  ClaimStore,
  CredentialPin,
} from '../../ports/claim-store';
import type { Clock } from '../../ports/clock';
import type {
  CommandJournalStore,
  JournalEntry,
  UndoState,
} from '../../ports/command-journal-store';
import type { DemandStore } from '../../ports/demand-store';
import {
  type DependencyContext,
  type EndpointEvidence,
  type ScopedRevision,
  type ServiceDependencyContext,
  withDependencyContext,
} from '../../ports/dependency-context';
import type { DependencyStore, StoredDependency } from '../../ports/dependency-store';
import type { Assignment, DirectoryCatalog, DirectoryStore } from '../../ports/directory-store';
import type { EditAdmission } from '../../ports/edit-admission';
import type { EstimateStore, StoredEstimate } from '../../ports/estimate-store';
import {
  type ExternalDependencyAuthoring,
  permitsExternalDependencies,
} from '../../ports/external-dependency-authoring';
import type { MeasureStore, StoredMeasure } from '../../ports/measure-store';
import type {
  ConnectedOptimizationAdmission,
  OptimizationCapture,
  OptimizationInput,
} from '../../ports/optimization-input';
import {
  findProjectWithin,
  LEGACY_ACCESS,
  type ResourceAccess,
} from '../../ports/organization-access';
import type { OrganizationLimitGauge } from '../../ports/organization-limits';
import type {
  IdentifiedSlice,
  PlanOptimization,
  PlanTree,
  ScheduleError,
} from '../../ports/plan-tree';
import type { PriorityBandStore } from '../../ports/priority-band-store';
import type { StepProgressStore, StoredProgress } from '../../ports/progress-store';
import type { Broadcaster } from '../../ports/project-event';
import type { Project, ProjectStore } from '../../ports/project-store';
import type { ResourceCapacityStore } from '../../ports/resource-capacity-store';
import type {
  EngineUnavailable,
  OptimizedScheduleRead,
  Scheduler,
  ScheduleRead,
} from '../../ports/scheduler';
import type {
  AccessRefused,
  ElsewhereHolderLabel,
  LivePlanExportRead,
  LivePlanRead,
  PlanDocumentReads,
} from '../../ports/shared-people-values';
import type { StepBlockageStore, StoredStepBlockage } from '../../ports/step-blockage-store';
import type {
  RunningStoredAttempt,
  StepNodeAttemptStore,
  StoredAttempt,
} from '../../ports/step-node-attempt-store';
import type { StepParallelStore } from '../../ports/step-parallel-store';
import type { Step } from '../../ports/step-store';
import type { SubtreeStore } from '../../ports/subtree-store';
import type {
  StoredTypedDependency,
  TypedDependencyStore,
} from '../../ports/typed-dependency-store';
import type {
  LabelledWorkItem,
  Reparented,
  WorkItem,
  WorkItemPatch,
  WorkItemStore,
} from '../../ports/work-item-store';
import type { WriteStamp } from '../../ports/write-stamp';
import {
  boundEstimateUnits,
  type CompensatingCommand,
  type CompensatingReferences,
  type DeletionState,
  estimateStepsOf,
  expectedProgressOwnersOf,
  externalAddressesOf,
  type ExternalRevisionPreconditions,
  type Preconditions,
  progressKeysOf,
  quoteName,
  readCommand,
  readPayload,
  readPreconditions,
  referencesOf,
  requireExternalRevisions,
  requiresExternalAuthoring,
  restoredTypedAddressesOf,
  type Revisions,
  scopedRevisionKey,
  stepOfRevisionKey,
  stepRevisionKey,
  subjectOf,
  touchedBy,
} from '../../service/compensating';
import { resolveConnectedDependencyGraph } from '../../service/connected-dependency-graph';
import { deriveExecutionReadiness } from '../../service/connected-readiness';
import { type ConnectedTreeProjection, projectConnectedTree } from '../../service/connected-tree';
import { type DependencyGraphChange, resolveDependencyGraph } from '../../service/dependency-graph';
import { projectNodeReadings } from '../../service/node-readings';
import type { NumberedWorkItem } from '../../service/numbered-work-item';
import { prepareCapturedScheduleParts, prepareScheduleParts } from '../../service/schedule-parts';
import { workItemStatusesOf } from '../../service/work-item-statuses';
import {
  type Claimed,
  type ClaimInput,
  type ClaimRefusalOutcome,
  claimsAround,
  isClaimAdmin,
  lineageOf,
  type NamedClaimHolder,
  refusalOf,
  type ReleaseInput,
} from './claims';
import { remapCopiedDependency, selectCopiedDependencies } from './copy-typed-dependencies';
import { findPersonWork, type PersonWork } from './person-work';
import { findStartableWork, type StartableWork } from './startable';

/**
 * A row's folded status. Every row of the tree is folded, so a miss is a row
 * the fold was never handed — an invariant break, never "nobody has said".
 */
function statusOfRow(statuses: ReadonlyMap<string, WorkItemStatus>, id: string): WorkItemStatus {
  const status = statuses.get(id);
  if (status === undefined) throw new Error(`no status folded for ${id}`);
  return status;
}

/**
 * What a work item shows before any schedule could be computed for it.
 *
 * Reached only when a row is absent from the schedule, which cannot happen for a
 * row the schedule was given. It exists so the type has no optional field: an
 * absent schedule and a zero-day one look identical to a caller, and only one of
 * them is a plan.
 */
const UNSCHEDULED: Scheduled = {
  duration: 0,
  estimated: false,
  earliestStart: 0,
  earliestFinish: 0,
  latestStart: 0,
  latestFinish: 0,
  float: 0,
  critical: false,
};

export { NO_DEADLINES, slicesOf } from '../../service/schedule-slices';
export { poolsFor } from '@wbs/domain';

interface CanonicalScheduleParts {
  readonly input: ScheduleInput;
  readonly hasChildren: ReadonlySet<string>;
  readonly assigneesOf: ReadonlyMap<string, Record<string, string>>;
  readonly rule: EstimateRule;
}

/**
 * Which schedule a project is **drawn by**: Fast, or the ready optimized
 * variant the project selects.
 *
 * One rule, two callers with different answers to the same middle case. The
 * plan read draws Fast while a selected variant is still solving — the cue
 * beside it says so, and a chart that emptied itself for three seconds would be
 * worse. `arrangeBySchedule` refuses there instead, because an arrangement is a
 * write that leaves no mark saying which engine decided it, and a reader who
 * chose `pri` would find their rows in Fast's order with nothing on screen
 * admitting it.
 *
 * `awaitingSolve` is what separates them, so neither caller re-derives the
 * three conditions and they cannot drift apart.
 */
function selectedSchedule(
  project: Project,
  fast: Schedule,
  optimization: OptimizedScheduleRead | null,
): { schedule: Schedule; displayed: 'fast' | SolverObjectiveName; awaitingSolve: boolean } {
  const optimizedSelected = project.optimizationEnabled && project.scheduleEngine === 'optimized';
  if (!optimizedSelected || optimization === null) {
    return { schedule: fast, displayed: 'fast', awaitingSolve: false };
  }
  if (optimization.variants[project.scheduleObjective].state !== 'ready') {
    return { schedule: fast, displayed: 'fast', awaitingSolve: true };
  }
  const ready = optimization.schedules[project.scheduleObjective];
  if (ready === null) {
    throw new Error('optimized plan reader reported ready without a schedule');
  }
  // Proof: forcing Fast here made the mounted borrowed arrange/freeze command
  // order lower-work before lower-other despite the ready selected schedule.
  return { schedule: ready, displayed: project.scheduleObjective, awaitingSolve: false };
}

/**
 * Assemble the one canonical solver/Fast input from repository readings.
 *
 * Both the interactive tree read and the restart queue pump call this seam.
 * Keeping the slicing, assignments, calendar offsets, capacity and reach here
 * prevents a restarted solve from rebuilding a different hash than the plan
 * read that enqueued it.
 */
function canonicalScheduleParts(
  project: Project,
  rows: readonly LabelledWorkItem[],
  estimates: readonly StoredEstimate[],
  edges: readonly Pick<StoredDependency, 'predecessorId' | 'successorId'>[],
  typed: readonly TypedDependency[],
  assignments: readonly Assignment[],
  steps: readonly Step[],
  poolSizes: ReadonlyMap<string, number>,
  /** Every demand on a work item of the project; a parent's charges nothing. */
  demands: readonly Demand[],
  /** The project's stated resource capacities. */
  resourceCapacities: readonly ResourceCapacity[],
): CanonicalScheduleParts {
  return prepareScheduleParts(
    project,
    rows,
    estimates,
    edges,
    typed,
    assignments,
    steps,
    poolSizes,
    demands,
    resourceCapacities,
  );
}

/** One compensating command, or a `batch` of them when there are several. */
function oneCommandOf(commands: readonly CompensatingCommand[]): CompensatingCommand {
  const [only] = commands;
  if (commands.length === 0) throw new Error('a journal entry needs at least one command');
  return commands.length === 1 ? only : { do: 'batch', steps: [...commands] };
}

/**
 * A row's assignees, and who — if anyone — is assumed to be doing every step.
 *
 * The reading itself is {@link assumedAssignee}, shared with the step removal
 * that has to say whose answer it would change. Written out twice, the two
 * would drift, and the drift would show up as a confirmation naming the wrong
 * people.
 *
 * Named for what it returns rather than for the word `step`: it was `phasesOf`
 * until `steps-not-phases`, and `stepsOf` would have collided with
 * `ProjectRepository.stepsOf` in this same file, which answers something else
 * entirely — a project's steps, not one row's assignment fields.
 */
function assignmentFieldsOf(assignees: Record<string, string>): {
  assignees: Record<string, string>;
  doesEveryStep: string | null;
} {
  return { assignees, doesEveryStep: assumedAssignee(assignees) };
}

/**
 * What a leaf's attempts witness about when its work ran, as days in the
 * project's zone: the day its first attempt started, and the day its last
 * ended attempt ended, or none while no attempt has ended
 * (`step-node-attempts` D4, the fills `setStatus` writes).
 */
function attemptWitness(
  held: readonly StoredAttempt[],
  zone: string,
): ReadonlyMap<string, { startedOn: IsoDate; endedOn: IsoDate | undefined }> {
  const spans = new Map<string, { start: number; end: number | undefined }>();
  for (const attempt of held) {
    const span = spans.get(attempt.workItemId);
    const end =
      attempt.endedAt === null
        ? span?.end
        : Math.max(attempt.endedAt, span?.end ?? Number.NEGATIVE_INFINITY);
    spans.set(attempt.workItemId, {
      start: Math.min(attempt.startedAt, span?.start ?? Number.POSITIVE_INFINITY),
      end,
    });
  }
  return new Map(
    [...spans].map(([workItemId, { start, end }]) => [
      workItemId,
      {
        startedOn: isoDateOfInstantIn(zone, start),
        endedOn: end === undefined ? undefined : isoDateOfInstantIn(zone, end),
      },
    ]),
  );
}

/**
 * A row's attempts by step id, each list in ascending number, with the
 * {@link Span} of each node and of the row (`step-node-attempts` D4). Empty
 * when the row holds none, so the read carries no key at all: no attempts, no
 * span. Steps are walked in project order, so two reads of an unchanged plan
 * answer the same key order.
 */
function attemptFieldsOf(
  held: readonly StoredAttempt[],
  steps: readonly Step[],
): Pick<NumberedWorkItem, 'attempts' | 'spans' | 'span'> {
  if (held.length === 0) return {};
  const attempts: Record<string, Attempt[]> = {};
  const spans: Record<string, Span> = {};
  for (const step of steps) {
    const atStep = held
      .filter((attempt) => attempt.stepId === step.id)
      .sort((left, right) => left.attemptNumber - right.attemptNumber)
      .map(({ workItemId: _workItemId, stepId: _stepId, ...attempt }) => attempt);
    const span = spanOfAttempts(atStep);
    if (span === undefined) continue;
    attempts[step.id] = atStep;
    spans[step.id] = span;
  }
  const answered = Object.values(attempts).flat();
  // A step removal deletes its attempts in the same transaction, so an attempt
  // at a step this list lacks is trusted state that moved underneath the read,
  // never a history to answer with a hole in it.
  if (answered.length !== held.length) {
    throw new Error(`${String(held.length - answered.length)} attempts held at no project step`);
  }
  const span = spanOfAttempts(answered);
  if (span === undefined) throw new Error('attempts were held but none was answered');
  return { attempts, spans, span };
}

/** A leaf's `nodeReadings` field, or no key for a parent, which holds no step nodes. */
function readingFieldsOf(
  nodeReadings: Record<string, NodeReading> | undefined,
): Pick<NumberedWorkItem, 'nodeReadings'> {
  return nodeReadings === undefined ? {} : { nodeReadings };
}

/**
 * One row's span as calendar days, or null when it cannot have one.
 *
 * Null in two cases, both of them honest: the project is not on a calendar, or
 * the schedule could not be computed at all. Printing a date from a schedule
 * that failed would be the same confident lie as printing a page of zeroes,
 * which the banner above the table exists to prevent.
 *
 * The finish is nudged back inside the span: a task of any length occupies the
 * day it finishes on, so a one-day task starting Monday ends Monday rather
 * than Tuesday. A zero-length row — a parent with nothing under it, or an
 * unestimated leaf — starts and ends the same day.
 */
function datesOf(
  startDate: IsoDate | null,
  timing: Scheduled,
  failed: boolean,
): { startsOn: IsoDate; endsOn: IsoDate } | null {
  if (startDate === null || failed) return null;
  // Both readings are `@wbs/domain`'s, shared with fe-01's Gantt so the chart
  // and these dates cannot disagree on a drifted offset: `firstWorkdayOf` is
  // snap-then-floor, and `lastWorkdayOf` is snap-then-`ceil − 1` clamped to
  // the start's day — the day containing `earliestFinish`, minus the one it
  // would otherwise spill into. The history of that arithmetic — why `ceil −
  // 1` and not `finish - Number.EPSILON`, why the snap sits inside the
  // discrete step, and the faults watched — is on the helpers themselves.
  // Across a dependency chain the drifted bit survives on the wire by design
  // (see `schedule-shapes.test.ts`, 'accumulates PERT sixths…'); these two
  // boundaries are what keep it off the calendar.
  return {
    startsOn: addWorkdays(startDate, firstWorkdayOf(timing.earliestStart)),
    endsOn: addWorkdays(startDate, lastWorkdayOf(timing.earliestStart, timing.earliestFinish)),
  };
}

/**
 * One row's charged days per step, as the payload carries them, and their sum.
 *
 * Takes the figures {@link rollUpFinals} already charged rather than combining
 * anything itself: the rounding happens once, per step, where the estimate is
 * — and a second combine here would be a second answer to the question the
 * table prints twice, side by side.
 *
 * The sum is taken over whole days for the same reason, so `finalTotal` is
 * always the addition a reader can do in their head from the row's own step
 * figures.
 */
function finalsOf(charged: ReadonlyMap<string, ChargedEstimate>): {
  charged: Record<string, ChargedEstimate>;
  finalDays: Record<string, number>;
  finalTotal: number;
} {
  const perStep: Record<string, number> = {};
  let total = 0;
  for (const [stepId, figure] of charged) {
    const days = chargedWorkdays(figure);
    perStep[stepId] = days;
    total += days;
  }
  // Proof: omitting charged made the mounted native-minute read fail on missing charged (2026-10-12).
  return { charged: Object.fromEntries(charged), finalDays: perStep, finalTotal: total };
}

export type DeleteStrategy = 'cascade' | 'promote';

export type WorkItemRefusal =
  | 'project_deleting'
  | 'external_dependencies_inactive'
  | 'referenced_by_external_dependency'
  | 'not_found'
  | 'forbidden'
  | 'strategy_required'
  | 'cycle'
  /**
   * `arrangeBySchedule` on a project whose selected engine is `optimized` and
   * whose displayed variant has not settled.
   *
   * A refusal rather than a fall back to Fast: the rows would be put in the
   * order of a schedule the reader did not pick, and — unlike a *drawn* Fast
   * baseline, which the cue marks as Fast — an arrangement leaves no mark
   * behind saying which engine decided it. ADR 0022's reasoning, applied to a
   * write.
   */
  | 'calendar_range'
  | 'dependency_calendar_missing'
  | 'schedule_not_ready'
  /** The selected engine's adapter is not installed in this deployment. */
  | 'engine_unavailable'
  | 'rolled_up'
  /**
   * A parallelism written on a row that has children.
   *
   * Its own reason rather than `rolled_up`: nothing is rolled up here — a
   * parent's parallelism is not the sum of its children's — and a client
   * showing "this row's figures come from below" for a refusal that means "this
   * cell is not yours to type in" would be explaining the wrong thing.
   */
  | 'has_children'
  /** A dependency onto the work item's own ancestor, descendant, or itself. */
  | 'ancestor'
  /**
   * A typed dependency, alone or through a parent's expansion, joining a step
   * node to itself. Its own reason rather than `cycle`: the relationship is
   * wrong whatever else the plan holds.
   */
  | 'self_node'
  /** A descendant-step selector needs a parent with descendant leaves. */
  | 'not_a_parent'
  | 'node_on_parent'
  | 'descendant_step_on_leaf'
  /** The addressed typed relationship no longer exists in this project. */
  | 'unknown_dependency'
  /** Another relationship already names these endpoints and this type. */
  | 'duplicate_dependency'
  /** This release understands only the relationship types in RELATIONSHIP_TYPES. */
  | 'unsupported_relationship_type'
  /** A subtree past {@link MAX_DUPLICATED_ROWS}. */
  | 'too_large'
  /**
   * A step the project does not hold — usually one somebody removed while this
   * caller had it on screen. `estimate.step_id` and `assignment.step_id` are
   * foreign keys, so without this the write reaches the database and answers
   * 500 for a request whose only fault is being out of date.
   */
  | 'minutes_not_integer'
  | 'minutes_above_max'
  | 'invalid_estimate'
  | 'unknown_step'
  /**
   * A figure in a unit this release does not keep — anything outside
   * {@link MEASURE_METRICS}.
   *
   * A **404** and not a 400, which is the one refusal in `token-tracking` that
   * is not cloned from the actual pair. The metric is in the path, and it names
   * a thing: `/measures/tokens_estimate/step-dev` is a request for a figure that
   * does not exist in the same way a work item id nobody holds does not exist.
   * A 400 would say the request was malformed, and it is not — it is
   * well-formed about a unit this release has never heard of.
   */
  | 'unknown_metric'
  /**
   * A person the directory no longer holds, decided inside the write's own
   * transaction — see {@link AssignmentWritten}. Without it the same
   * out-of-date picker reaches `assignment.person_id` and answers 500.
   */
  | 'unknown_person'
  /**
   * A team the directory no longer holds, decided inside the write's own
   * transaction — see {@link WorkItemPatched}. Without it the same out-of-date
   * picker reaches `work_item.service_team_id` and answers 500: the column
   * **does** carry a foreign key, against what the comment here claimed until
   * `team-sets` measured it (2026-08-14). `unknown_team` is what turns that
   * constraint failure into a refusal somebody can read.
   */
  | 'unknown_team'
  /**
   * A tag the directory no longer holds, decided inside the write's own
   * transaction — see {@link WorkItemPatch.tagIds}. The same out-of-date picker
   * as `unknown_team`, and a separate reason from it deliberately: a reader
   * told a label is gone has to know **which** of the two pickers to reopen,
   * and the dimensions are independent everywhere else in this model.
   */
  | 'unknown_tag'
  /**
   * A service the directory no longer holds, decided inside the write's own
   * transaction — see {@link WorkItemPatch.serviceIds}. The third picker, and a
   * third reason on purpose: told only that "a label is gone", a reader has
   * three pickers to reopen and no way to choose.
   */
  | 'unknown_service'
  /**
   * A work item type the directory no longer holds, decided inside the write's
   * own transaction — see {@link WorkItemPatch.typeIds}. The fourth picker, and
   * a fourth reason for the third reason's argument: told only that "a label is
   * gone", a reader now has four pickers to reopen and no way to choose.
   */
  | 'unknown_type'
  /**
   * An authored patch whose `typeIds` name more than one distinct type
   * (WBS 010.4.10). Decided in {@link WorkItemService.patch}, the one path every
   * authored type write takes, and never on undo/redo restoration or copying,
   * which reproduce a stored type conflict exactly.
   *
   * 400 and not 409: the patch replaces the set whole, so the resulting set is
   * the patch's own and no state of the plan makes two types acceptable.
   */
  | 'work_item_takes_one_type'
  /**
   * An external system the directory no longer holds, decided inside the write's
   * own transaction — `unknown_service`'s rule, a fourth time and for the same
   * reason: told only that "a label is gone", a reader has four pickers to
   * reopen and no way to choose.
   */
  | 'unknown_system'
  /**
   * A resource the directory no longer holds, decided inside the write's own
   * transaction (`wbs-resources`). Its own reason for `unknown_tag`'s argument:
   * a reader has to know which picker to reopen.
   */
  | 'unknown_resource'
  /** `setDemand` of other than 1 unit on an `exclusive` resource. */
  | 'exclusive_demand_is_one'
  /**
   * A patch that would leave a work item holding a reason with no not-before
   * date for it to be a reason about, decided inside the write's own
   * transaction — see {@link WorkItemPatched}.
   *
   * 400 and not 409: the request is malformed against **any** tree, because
   * there is no state of the plan in which words about a floor that is not
   * there mean anything. The two ways to meet it are a reason sent on a row with
   * no date, and — much the commoner — a date cleared without clearing the words
   * beside it, which is `{ startNoEarlierThan: null }` where
   * `{ startNoEarlierThan: null, startNoEarlierThanReason: null }` was meant.
   *
   * Refused rather than tidied on the caller's behalf: the words are somebody's
   * sentence, and a write that silently deletes them is the worse of the two
   * answers.
   */
  | 'not_before_reason_needs_a_date'
  /**
   * A deadline that falls before the project's day zero, so no placement of
   * the work could ever meet it.
   *
   * **The only deadline-specific refusal** (`work-item-deadline` 6.1). The shape
   * of the value is the controller's — a non-`IsoDate` is a malformed payload —
   * and everything else about a deadline is legal here, including one in the
   * past relative to today and one earlier than an ancestor's.
   *
   * It refuses the **write** and nothing else. A project start later moved past
   * a deadline already stored does not become this: that is resolved at read
   * time and reported as late by the whole span, and the request that moved the
   * project is not rejected. See the column's JSDoc in `schema.ts`, which is
   * where that asymmetry is argued.
   */
  | 'deadline_before_project_start'
  /** `setStatus` `ready` or `draft` on a leaf whose steps have already spoken. */
  | 'readiness_after_progress'
  /** `setStatus` `on_hold` or `blocked` on a row reading done. */
  | 'cannot_hold_done'
  /** `setStatus` `in_progress` or `done` in a project with no steps to speak for. */
  | 'no_steps'
  /** `startAttempt` on a node stated `done`: reopen it first (`step-node-attempts` D2). */
  | 'node_done'
  /** `startAttempt` while the node's attempt runs: at most one runs per node. */
  | 'attempt_running'
  /** An attempt's `at` after the act's own write stamp. */
  | 'attempt_in_future'
  /** `endAttempt` on a node with nothing running. */
  | 'no_running_attempt'
  /** `endAttempt` at an instant before the running attempt began. */
  | 'attempt_ends_before_start'
  /** `removeAttempt` naming a number the node does not hold. */
  | 'unknown_attempt';

export type WorkItemOutcome<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: WorkItemRefusal;
      /**
       * Which row was refused, on `deadline_before_project_start` alone.
       *
       * Optional rather than a fourth arm of the union so that every existing
       * `{ ok: false, reason }` still assigns, and read by the batch runner's
       * `detailOf`, which spreads whatever a refusal carries beside its code
       * into the answer's `detail` — the same road `taken`'s `name` travels.
       */
      workItemId?: string;
      /**
       * The project's **day zero** — the first workday on or after its start
       * date, which is what `deadlineOffsetOf` compares against — so the client
       * can say what the earliest legal deadline is rather than only that this
       * one was wrong.
       */
      projectDayZero?: IsoDate;
      /** Relationships that prevent a structural change from changing endpoint scope. */
      dependencyIds?: string[];
    };

/** Orders relationship removal before a structural delete and restoration after it. */
function withRemovedTyped(
  structural: CompensatingCommand,
  removed: readonly StoredTypedDependency[],
  restore: boolean,
): CompensatingCommand {
  if (removed.length === 0) return structural;
  return {
    do: 'batch',
    steps: restore
      ? [
          structural,
          ...removed.map((dependency) => ({ do: 'add_typed_dependency' as const, dependency })),
        ]
      : [
          ...removed.map((dependency) => ({ do: 'remove_typed_dependency' as const, dependency })),
          structural,
        ],
  };
}

/**
 * The claims a delete took, as the step that puts them back after `restore`:
 * an `add_claims` stating nothing (the restore puts the statements back with
 * the rows) and carrying the occupancy, so the replay re-acquires the units as
 * the undo of a release does. `restore` alone when the delete took none.
 *
 * Proof: answering `restore` alone, `undo of a delete puts the claims and their
 * occupancy back`, `… resources_exhausted once another leaf took the units`
 * and `undo of a promoting delete puts back the subtree claim …`
 * (resource-occupancy.db.test.ts) failed on both stores; watched 2026-10-20.
 */
function withClaimsRestored(restore: CompensatingCommand, taken: ClaimsTaken): CompensatingCommand {
  if (taken.claims.length === 0) return restore;
  return {
    do: 'batch',
    steps: [
      restore,
      { do: 'add_claims', claims: taken.claims, stated: [], occupancy: taken.occupancy },
    ],
  };
}

/** The claims a delete takes, parents before the claims delegated under them, and their occupancy. */
interface ClaimsTaken {
  claims: Claim[];
  occupancy: ClaimOccupancy[];
}

/**
 * Whether this release keeps figures in the unit a caller named.
 *
 * A function rather than an inline `includes`, because both write methods ask
 * and both must answer the same way; and it narrows, so the `MeasureMetric`
 * reaching the store is checked rather than asserted. The value arrives from a
 * URL path, so it is genuinely `string` no matter what the signature says.
 */
function holdsMetric(metric: string): metric is MeasureMetric {
  return (MEASURE_METRICS as readonly string[]).includes(metric);
}

/**
 * What each metric is called in a sentence somebody reads in the plan's
 * history.
 *
 * "record 12000 tokens" is not what these say: the label names the **unit**,
 * never the figure, for {@link quoteName}'s reason turned to numbers — a
 * history row is read long after the write, and the figure it quoted may have
 * been corrected twice since. The row's own before-state carries the number for
 * anybody who wants it.
 */
const MEASURE_LABELS: Record<MeasureMetric, string> = {
  token_estimate: 'estimated tokens',
  token_actual: 'tokens spent',
  hours_actual: 'hours spent',
};

export interface CreateWorkItem {
  parentId: string | null;
  afterId: string | null;
  name?: string;
  notes?: string;
  /**
   * The priority to write, or `null` to create the row unprioritised.
   *
   * **Three states, and absent is not null.** Absent means "nobody said", and
   * {@link WorkItemService.create} stamps the project's own
   * {@link ORDINARY_BAND_RANK} band's default in its place. An explicit `null`
   * means "create this with no priority" and is what a caller wanting the
   * pre-2026-08-29 behaviour sends. The distinction is the one the patch path
   * already draws for `notes`, and `mcp-01` needs both halves of it: a batch
   * that sets priorities per item must not have them overwritten, and a batch
   * that deliberately leaves an item unprioritised must be able to say so.
   * `openspec/changes/priority-default-medium/design.md` D2.
   */
  priority?: number | null;
}

export interface MoveWorkItem {
  parentId: string | null;
  afterId: string | null;
}

export interface WorkItemServiceOptions {
  dependencyContext: ServiceDependencyContext;
  externalDependencyAuthoring: ExternalDependencyAuthoring;
  livePlans?: LivePlanStore;
  workItems: WorkItemStore;
  /** Required scope-bound evidence; create refuses retained facts before any writes. */
  stepParallels: Pick<StepParallelStore, 'listByWorkItems'>;
  projects: ProjectStore;
  estimates: EstimateStore;
  /**
   * Where the days actually spent are kept.
   *
   * Required rather than optional, for {@link WorkItemServiceOptions.journal}'s
   * reason turned around: a service built without one would answer every read
   * with no actuals at all, which is indistinguishable from a plan nobody has
   * recorded anything against — and that is the true answer for every plan on
   * the day this ships, so the mistake would be invisible for a week.
   */
  actuals: ActualStore;
  /**
   * Where the figures that are not days are kept — tokens estimated, tokens
   * spent, hours spent.
   *
   * Required rather than optional, for {@link WorkItemServiceOptions.actuals}'
   * reason exactly: a service built without one would answer every read with no
   * measures at all, which is the true answer for every plan on the day this
   * ships and therefore an invisible mistake for a week.
   */
  measures: MeasureStore;
  /**
   * Where each step says its work on a work item has got to.
   *
   * Required rather than optional, for {@link WorkItemServiceOptions.actuals}'
   * reason exactly: a service built without one would answer every read with
   * nothing stated anywhere, which is the true answer for every plan on the day
   * this ships and therefore an invisible mistake for a week.
   */
  progress: StepProgressStore;
  /**
   * The attempts at step nodes, required for {@link progress}'s reason: a
   * service built without one would leave a leaf's attempts behind on the
   * parent at the hand-down, invisible to every reader.
   */
  attempts: StepNodeAttemptStore;
  /** Direct node blockage facts used only by the live tree projection. */
  blockages: StepBlockageStore;
  /**
   * Who occupies a step or reserves a subtree now (`wbs-team-claims`).
   * Optional only for fixtures that predate claims: without it a claim, a
   * release, or the replay of either throws rather than answering.
   */
  claims?: ClaimStore;
  /**
   * The organization limits a claim consults (`wbs-organization-limits` L9),
   * read in the batch's own transaction. Absent from the public graph and
   * from legacy fixture graphs; a claim adding a bound claim under scoped
   * access without it throws rather than admitting uncapped.
   */
  organizationLimits?: OrganizationLimitGauge;
  /**
   * What each work item needs of each resource (`wbs-resources`). Required
   * since both engines level demands (R5): every plan read reads them.
   */
  demands: DemandStore;
  /**
   * The project's stated resource capacities, read by {@link WorkItemService.resourcesWithin}
   * and by every plan read, which levels demands against them.
   */
  resourceCapacity: ResourceCapacityStore;
  directory: DirectoryStore;
  /**
   * How many of each team this project may have at work at once — C1's `slotsOf`
   * seam with the per-project lookup behind it.
   *
   * A collaborator of its own rather than four methods on `directory`, because
   * the fact is a **project's** and the directory is what the global list is read
   * through. `capacity-per-project`'s design.md D3.
   */
  capacity: CapacityStore;
  /**
   * What this project calls its priority numbers, read on the plan's own payload.
   *
   * A read and never a write from here, and read by nothing that computes a date:
   * the leveller orders on `work_item.priority` alone. It is on this service
   * because a ladder has to arrive in the same payload as the numbers it names —
   * see {@link WorkItemService.tree}'s `priorityBands`.
   */
  priorityBands: PriorityBandStore;
  dependencies: DependencyStore;
  typedDependencies: TypedDependencyStore;
  subtrees: SubtreeStore;
  /**
   * Where every reversible command is written down.
   *
   * Required rather than optional. A service built without one would apply
   * every mutation and record none of them, and the only symptom would be an
   * undo key that quietly does nothing — the shape of failure `AGENTS.md` R5
   * exists to keep out of this repo.
   */
  journal: CommandJournalStore;
  broadcast: Broadcaster;
  /**
   * Who may write a project through this service: `CREATOR_ADMISSION`
   * outside a batch that established wider authority. See {@link EditAdmission}.
   */
  admission: EditAdmission;
  /** The installed scheduling capabilities for live plan reads. */
  scheduler: Scheduler;
  /** Required for enabled connected live reads; capture-only graphs omit admission. */
  admitConnectedOptimization?: ConnectedOptimizationAdmission;
  /** A borrowed command scope reads the captured cache on its own source connection. */
  schedulerMode?: 'capture';
  /** The instant every write is dated from and the ids it mints — see {@link Clock}. */
  clock: Clock;
}

/** Why an undo or a redo did not happen. */
export type UndoRefusal =
  | 'external_dependencies_inactive'
  | 'not_found'
  | 'forbidden'
  /** The account has nothing left in that half of its stack for this project. */
  | 'nothing_to_undo'
  /**
   * Something the command touched has been written to since, so reversing it
   * would overwrite a change nobody asked to lose. The entry is thrown away:
   * it can never apply again, and leaving it would refuse every later press of
   * the key for a change nobody can reach.
   */
  | 'stale_undo';

export interface UndoDone {
  /** What was reversed, as a sentence: `rename “Strip”`. */
  done: string;
  /** What could not be put back exactly, or null when everything was. */
  detail: string | null;
}

/**
 * What came of walking one step along the undo stack.
 *
 * **A refusal's `detail` is a finished sentence, full stop and all.** The client
 * shows it verbatim at the tail of its own — `That could not be undone: …` —
 * and every one of these used to stop mid-phrase: `“Roof it” has changed since`
 * reached a reader's screen on 2026-08-09, with no full stop and no answer to
 * "since *what*?". A clause is not a sentence just because something else
 * supplies its opening.
 */
export type UndoOutcome =
  | { ok: true; value: UndoDone }
  | {
      ok: false;
      reason: UndoRefusal;
      detail: string | null;
      /**
       * The journal entry a `stale_undo` discarded, so a caller that ran the
       * undo inside an outer transaction and rolled it back can discard it
       * again outside — the {@link Command batch} runner does. Null for the
       * refusals that name no entry.
       */
      entryId?: string;
    };

/** Whether applying one compensating command worked, and what it could not do. */
type ApplyOutcome = { ok: true; detail: string | null } | { ok: false; detail: string };

/**
 * The largest subtree one duplication will copy.
 *
 * A judgement rather than a measurement: well above any step somebody builds
 * by hand, well below anything that makes one transaction slow. It exists
 * because each duplication can double what the next one copies, and nothing
 * else in the tool bounds that.
 */
export const MAX_DUPLICATED_ROWS = 500;

/** What a duplicated root's name gains, so two identical siblings can be told apart in a picker. */
const COPY_SUFFIX = ' (copy)';

const asSibling = (workItem: WorkItem): Sibling => ({
  id: workItem.id,
  position: workItem.position,
});

/**
 * A command with one `patch` step joined to it, as one batch: after it on the
 * way forward, before it on the way back. `undefined` leaves the command alone.
 */
function withPatchStep(
  command: CompensatingCommand,
  step: CompensatingCommand | undefined,
  order: 'after' | 'before',
): CompensatingCommand {
  if (step === undefined) return command;
  return { do: 'batch', steps: order === 'after' ? [command, step] : [step, command] };
}

/** `command` with `steps` run after or before it in one batch; `command` alone when there are none. */
function withSteps(
  command: CompensatingCommand,
  steps: readonly CompensatingCommand[],
  order: 'after' | 'before',
): CompensatingCommand {
  if (steps.length === 0) return command;
  return { do: 'batch', steps: order === 'after' ? [command, ...steps] : [...steps, command] };
}

/** The readiness or hold every leaf agreed on, or null where any disagreed. */
function agreedOn<T>(values: readonly (T | null)[]): T | null {
  const [first] = values;
  return first !== undefined && values.every((value) => value === first) ? first : null;
}

/** The history sentence for one `setStatus`, the row named already quoted. */
function statusSentence(status: SettableStatus, name: string): string {
  switch (status) {
    case 'done':
      return `mark ${name} done`;
    case 'unknown':
      return `set ${name} back to unknown`;
    case 'ready':
      return `mark ${name} ready`;
    case 'draft':
      return `mark ${name} draft`;
    case 'in_progress':
      return `start ${name}`;
    case 'on_hold':
      return `put ${name} on hold`;
    case 'blocked':
      return `mark ${name} blocked`;
  }
}

/** The pair a statement is keyed by, as one map key. */
const progressKey = (workItemId: string, stepId: string): string => `${workItemId}\u0000${stepId}`;

/** Compares complete sparse progress sets without treating order as part of identity. */
function matchesProgress(
  current: readonly StoredProgress[],
  expected: readonly StoredProgress[],
): boolean {
  return (
    current.length === expected.length &&
    expected.every((before) =>
      current.some(
        (now) =>
          now.workItemId === before.workItemId &&
          now.stepId === before.stepId &&
          now.state === before.state &&
          now.statedAt === before.statedAt,
      ),
    )
  );
}

/** `rootId` and everything beneath it. */
function subtreeOf(rows: readonly WorkItem[], rootId: string): string[] {
  const childrenOf = new Map<string | null, WorkItem[]>();
  for (const row of rows) {
    const group = childrenOf.get(row.parentId) ?? [];
    group.push(row);
    childrenOf.set(row.parentId, group);
  }
  const collected: string[] = [];
  const visit = (id: string): void => {
    collected.push(id);
    for (const child of childrenOf.get(id) ?? []) visit(child.id);
  };
  visit(rootId);
  return collected;
}

/** One row of `rows`, or a throw: an id from the same read is not allowed to be missing. */
function rowOf<Row extends WorkItem>(rows: readonly Row[], id: string): Row {
  const found = rows.find((row) => row.id === id);
  if (found === undefined) throw new Error(`${id} is not a row of this project`);
  return found;
}

/** A work item's name for a sentence, or the empty string when the row has gone. */
function nameOf(rows: readonly WorkItem[], id: string): string {
  return rows.find((row) => row.id === id)?.name ?? '';
}

/** Which fields a patch actually names. An absent field and a null one mean different things. */
function fieldsOf(patch: WorkItemPatch): (keyof WorkItemPatch)[] {
  const named: (keyof WorkItemPatch)[] = [];
  if (patch.name !== undefined) named.push('name');
  if (patch.notes !== undefined) named.push('notes');
  if (patch.startNoEarlierThan !== undefined) named.push('startNoEarlierThan');
  // Proof: this line deleted, so a patch naming only the reason journals
  // nothing — **62 pass, 1 fail** — and `undoes a reason written beside a date
  // that was already there` failed at its `expectDone` on `refused: stale_undo
  // — “Strip” has changed since then`: the undo reached past the unjournalled
  // write to an entry that write had already made stale, so the words stay on
  // screen and the press is refused. The parallelism line's own red, one field
  // over. Watched 2026-08-18.
  if (patch.startNoEarlierThanReason !== undefined) named.push('startNoEarlierThanReason');
  // Proof: this line deleted, so a patch naming only the deadline journals
  // nothing, and `puts a cleared deadline back` failed at its `expectDone` on
  // `refused: stale_undo`: the undo reached past the unjournalled write to an
  // entry that write had already made stale. The reason line's own red, one
  // column over.
  if (patch.deadline !== undefined) named.push('deadline');
  // Proof: these two lines deleted, so a patch naming only a fact date journals
  // nothing, and `puts a cleared fact end back` failed at its `expectDone` on
  // `refused: stale_undo`: the undo reached past the unjournalled write to an
  // entry that write had already made stale. The deadline line's own red, two
  // columns over.
  if (patch.factStart !== undefined) named.push('factStart');
  if (patch.factEnd !== undefined) named.push('factEnd');
  if (patch.readiness !== undefined) named.push('readiness');
  if (patch.hold !== undefined) named.push('hold');
  // Proof: this line and the matching one in {@link revertTo} each deleted in
  // turn, and both `puts a replaced priority back, and leaves a priority a rename
  // did not name` and `takes a first priority away again, rather than leaving a
  // 1 behind` failed — the undo restored nothing and the work item kept the
  // priority the undone patch had written; watched 2026-08-11.
  if (patch.priority !== undefined) named.push('priority');
  if (patch.serviceTeamId !== undefined) named.push('serviceTeamId');
  if (patch.teamIds !== undefined) named.push('teamIds');
  // Proof: this line deleted, so a patch naming only the service journals
  // nothing, and `puts a replaced service back` failed at its `expectDone` on
  // `refused: stale_undo — “Strip the roof” has changed since then`: the undo
  // reached past the unjournalled write to an entry that write had already made
  // stale. The tag line's own red, one dimension over. Watched 2026-08-21.
  if (patch.serviceIds !== undefined) named.push('serviceIds');
  // Proof: this line deleted, so a patch naming only a parallelism journals
  // nothing at all, and all three parallelism undo tests — `puts a replaced
  // parallelism back, and leaves one a rename did not name`, `takes a first
  // parallelism away again, rather than leaving a 3 behind` and `puts a reset to
  // one at a time back to the number it replaced` — failed at their `expectDone`
  // (undo.test.ts:226, :245, :259) on
  // `refused: stale_undo — “Strip” has changed since then` — the undo reached
  // past the unjournalled write to an entry the same write had made stale.
  // Watched 2026-08-12; {@link revertTo}'s matching line fails differently and
  // carries its own.
  if (patch.maxParallel !== undefined) named.push('maxParallel');
  // Proof: this line deleted, so a patch naming only the tags journals nothing
  // — and `puts a replaced tag set back, whole` failed at its `expectDone` on
  // `refused: stale_undo — “Strip the roof” has changed since then`: the undo
  // reached past the unjournalled write to an entry that write had already made
  // stale. The parallelism line's own red, one dimension over. Watched
  // 2026-08-19.
  if (patch.tagIds !== undefined) named.push('tagIds');
  // The tag line's own reason, one dimension over: a patch naming only the types
  // journals nothing without it, and the next undo reaches past the unjournalled
  // write to an entry that write already made stale.
  //
  // Proof: this line deleted and `puts a replaced type set back, whole` fails at
  // its `expectDone` on `refused: stale_undo`. Watched 2026-08-30.
  if (patch.typeIds !== undefined) named.push('typeIds');
  // The tag line's reason, one dimension over: a patch naming only the refs
  // journals nothing without it, and the next undo reaches past the unjournalled
  // write to an entry that write already made stale.
  if (patch.externalRefs !== undefined) named.push('externalRefs');
  return named;
}

/**
 * The patch that puts `before` back, naming **only** the fields the forward
 * patch named.
 *
 * Naming every field would be a rename that also silently restored a note
 * somebody else edited in between — an undo that reverses more than the change
 * it is undoing.
 */
function revertTo(before: LabelledWorkItem, patch: WorkItemPatch): WorkItemPatch {
  const out: WorkItemPatch = {};
  if (patch.name !== undefined) out.name = before.name;
  if (patch.notes !== undefined) out.notes = before.notes;
  if (patch.startNoEarlierThan !== undefined) out.startNoEarlierThan = before.startNoEarlierThan;
  // The inverse of a pair patch names **both** halves of the pair the forward
  // patch named, which is what keeps every inverse legal against the rule that
  // refuses a reason with no date: naming only the fields the forward named
  // reconstructs `before`'s own pair for those fields and leaves the rest as
  // they are — and the rest are `before`'s too, because the forward did not
  // touch them. So an inverse can only ever land the row back on a pair it was
  // already in, and there is no undo this store refuses.
  //
  // Proof: this line deleted, so the inverse of `{ date: null, reason: null }`
  // names the date alone — **61 pass, 2 fail**. `puts the words back with the
  // date they explain` failed on `Expected: "waiting on client sign-off" /
  // Received: null`: a pressable undo that reports done, restores the floor and
  // drops the sentence saying why it is there. `undoes a reason written beside
  // a date that was already there` failed with it, on the words never coming
  // off. Watched 2026-08-18.
  if (patch.startNoEarlierThanReason !== undefined) {
    out.startNoEarlierThanReason = before.startNoEarlierThanReason;
  }
  // No pair to reconstruct — the deadline has no reason column beside it — so
  // this is the scalar rule the priority below it keeps: name the field the
  // forward named, restore the value it had, and leave every other field alone.
  // `before.deadline` is whichever of the two the row actually held, so the
  // inverse of a set is the prior date or `null` and the inverse of a clear is
  // the date. **Redo does not come through here at all** — it replays the
  // journalled `forward` patch — which is why 6.3's case presses both.
  if (patch.deadline !== undefined) out.deadline = before.deadline;
  // The deadline's scalar rule, twice: name the field the forward named, restore
  // the value it had, leave every other field alone. A `setStatus` fill is a
  // `patch` step too, so its inverse is `factEnd: null` through this same line.
  if (patch.factStart !== undefined) out.factStart = before.factStart;
  if (patch.factEnd !== undefined) out.factEnd = before.factEnd;
  if (patch.readiness !== undefined) out.readiness = before.readiness;
  if (patch.hold !== undefined) out.hold = before.hold;
  if (patch.priority !== undefined) out.priority = before.priority;
  if (patch.serviceTeamId !== undefined) out.serviceTeamId = before.serviceTeamId;
  if (patch.teamIds !== undefined) out.teamIds = before.teamIds;
  // **The whole prior set**, the rule below it and no longer its inverse. The
  // comment that stood here argued the opposite at length — a column has exactly
  // one prior value, so wrapping it in an array would journal a shape the patch
  // cannot take — and task 10.2 ended that argument by making the join table the
  // store. The patch takes a set now, so the undo restores a set.
  //
  // `[]` is a legal before-value and means the row stated no service of its own:
  // the inverse of labelling it is taking the label off, which is the empty set
  // rather than an absent field. Absent would leave behind the label the undo
  // exists to remove.
  //
  // The scalar habit is what this loses data to, and it is the *tags* fault one
  // dimension over rather than the throw the column used to give: journal one
  // member of a two-service row and the undo reports success while restoring
  // half the fact. This line arrived with 10.2's type change, which left no
  // compiling way to keep the scalar; **task 10.3 drove the red that makes it a
  // rule rather than a shape** — written as `before.serviceIds.slice(0, 1)`,
  // `puts a replaced service set back, whole` in `undo.test.ts` fails alone (76
  // pass, 1 fail over that file) on a restored set holding one of the row's two
  // services, while every one-service case beside it stays green. Watched
  // 2026-08-21.
  if (patch.serviceIds !== undefined) out.serviceIds = before.serviceIds;
  // **The whole prior set, and this is the seam a scalar habit loses data at.**
  // A set-valued field's inverse cannot be a member of the set or a delta
  // against it: undoing "these three tags" has to restore the two that were
  // there, and any spelling that carries one id restores one of them and drops
  // the rest — silently, reporting a successful undo.
  //
  // It is also why `before` here is a {@link LabelledWorkItem} rather than the
  // {@link WorkItem} every other line in this function reads: `work_item` has
  // no column for a tag, so the prior set exists only on the row the plan read
  // gave back. Reading the store's own row for it would be a second read with a
  // concurrent write's worth of gap in front of it.
  //
  // `[]` is a legal before-value and means the row had no tags: the inverse of
  // "tag it" is "take them off", which is the empty set rather than an absent
  // field. There is no null arm here for the same reason there is none on the
  // patch.
  //
  // Proof: written as `out.tagIds = before.tagIds.slice(0, 1)` — the scalar
  // habit, keeping "the tag" — and **68 pass, 1 fail**: `puts a replaced tag
  // set back, whole` failed on `expect(received).toEqual(expected)` with one of
  // the two restored ids missing from the array. A pressable undo that reports
  // **done** and leaves the row carrying one of the two labels it had, which is
  // the whole failure mode this field's design is about — nothing else in the
  // suite notices. Watched 2026-08-19, see verify.md.
  if (patch.tagIds !== undefined) out.tagIds = before.tagIds;
  // **The whole prior set**, for `tagIds`' reason exactly — a set-valued field's
  // inverse cannot be a member of the set or a delta against it, and any spelling
  // that carries one id restores one and drops the rest while reporting success.
  //
  // `[]` is a legal before-value and means the row carried no type. For the other
  // three dimensions that empty set also puts the row back to *inheriting*; here
  // it does not, because there is nothing to inherit
  // (`docs/adr/0009-a-work-item-type-does-not-inherit-at-all.md`). The undo is
  // written the same way and lands somewhere simpler.
  //
  // Proof: written as `out.typeIds = before.typeIds.slice(0, 1)` — the scalar
  // habit, keeping "the type" — and `puts a replaced type set back, whole` fails
  // on one of the two restored ids missing from the array: a pressable undo that
  // reports **done** and leaves the row carrying one of the two labels it had.
  // Watched 2026-08-30.
  if (patch.typeIds !== undefined) out.typeIds = before.typeIds;
  // **The whole prior list**, for `tagIds`' reason and with one more of its own:
  // the members are records, so the inverse has to restore the same refs in the
  // same order. The stored `id`s are dropped on the way back — the store mints
  // fresh ones, and an undo that tried to restore an id would be asserting an
  // identity the row no longer has.
  //
  // `[]` is a legal before-value and means the row carried no refs.
  if (patch.externalRefs !== undefined) {
    out.externalRefs = before.externalRefs.map((each) => ({
      systemId: each.systemId,
      url: each.url,
      // The name goes back with the link it belongs to. It is stated rather
      // than left off because the store's write is a **replacement**: an
      // inverse that named only the system and the URL would put the list back
      // and take every name off it, which reads as a successful undo that lost
      // a column.
      //
      // Proof: this line deleted and `puts a ref's name back, not just its
      // address` failed on `- "name": "SHED-9 Strip the walls" / + "name": ""`
      // — the link restored to the right address with nobody's words on it.
      // Watched 2026-09-09.
      name: each.name,
    }));
  }
  // `before.maxParallel` is a number and never null — the column is `NOT NULL`
  // — so the inverse of a reset to 1 is the stored number itself rather than a
  // second null.
  //
  // Proof: this line deleted, so the inverse of a parallelism patch is the
  // empty patch. The undo then reports **done** — an inverse naming no field
  // takes the store's no-field branch and writes nothing — and what fails is the
  // value each test reads back afterwards, in all three: `puts a replaced
  // parallelism back, and leaves one a rename did not name` on
  // `Expected: 3, Received: 5` (undo.test.ts:227), `takes a first parallelism
  // away again, rather than leaving a 3 behind` on `Expected: 1, Received: 3`
  // (:250), and `puts a reset to one at a time back to the number it replaced`
  // on `Expected: 4, Received: 1` (:261). That is the worse of the two failures
  // either line can produce: {@link fieldsOf}'s red at least refuses out loud,
  // where this one reports a successful undo that moved nothing.
  // Watched 2026-08-12.
  if (patch.maxParallel !== undefined) out.maxParallel = before.maxParallel;
  return out;
}

/** The revisions of `ids` as `rows` holds them, skipping ids `rows` does not have. */
function revisionsIn(rows: readonly WorkItem[], ids: readonly string[]): Revisions {
  const byId = new Map(rows.map((row) => [row.id, row.revision]));
  const out: Revisions = {};
  for (const id of new Set(ids)) {
    const revision = byId.get(id);
    if (revision !== undefined) out[id] = revision;
  }
  return out;
}

/** A journalled command, as the mutation that ran it hands it over. */
/**
 * One journalled step as a {@link Command batch} collects it: what `record`
 * would have written, held until the batch knows whether it is one step or
 * many. See {@link WorkItemService.collect}.
 */
export interface CollectedRecording {
  kind: string;
  label: string;
  recording: Recording;
}

/** What one `collect` call gathered, beside what the work returned. */
export interface Collected<T> {
  result: T;
  recordings: CollectedRecording[];
  /** Whether any step would have broadcast — the batch broadcasts once for all. */
  dirty: boolean;
}

function scheduleFinish(schedule: Schedule): number {
  return Math.max(
    0,
    ...[...schedule.workItems.values()].map(({ earliestFinish }) => earliestFinish),
  );
}

/**
 * The cue's figures: Fast's project finish, and for every variant this read
 * materialized, that variant's own finish and its order against Fast.
 *
 * Driven by the **schedules** rather than by `variants`, because a finish can
 * only be measured from a schedule that is in hand: the two agree by
 * construction (a `ready` variant is exactly an `ok` cache row, which is
 * exactly the row whose payload decoded into a schedule), and reading the
 * states here would be this function trusting a claim instead of measuring the
 * thing.
 *
 * Against Fast in both halves, whatever is displayed. That is what lets the
 * three schedules be read against one reference — see tasks.md 8b.4 — and it is
 * why the caller no longer decides whether to compute a comparison at all.
 */
function comparedWithFast(
  fast: Schedule,
  read: OptimizedScheduleRead,
): Pick<PlanOptimization, 'finishDays' | 'sameOrderAsFast'> {
  const finishDays: { fast: number } & Partial<Record<SolverObjectiveName, number>> = {
    fast: scheduleFinish(fast),
  };
  const sameOrderAsFast: Partial<Record<SolverObjectiveName, boolean>> = {};
  for (const objective of SOLVER_OBJECTIVES) {
    const optimized = read.schedules[objective];
    if (optimized === null) continue;
    finishDays[objective] = scheduleFinish(optimized);
    sameOrderAsFast[objective] = haveSameSliceOrder(fast.slices, optimized.slices);
  }
  return { finishDays, sameOrderAsFast };
}

interface BatchCollector {
  recordings: CollectedRecording[];
  dirty: boolean;
}

interface ReplayNeighbor {
  entry: JournalEntry;
  preconditions: Preconditions;
  progress: { owner: string; expected: StoredProgress[]; before: StoredProgress[] }[];
}

export interface Recording {
  externalBefore?: readonly ScopedRevision[];
  /** What a redo re-applies. */
  forward: CompensatingCommand;
  /** What an undo applies. */
  inverse: CompensatingCommand;
  /** Every work item the command wrote to, whose revisions become its preconditions. */
  touched: string[];
  /**
   * The project's rows as the mutation read them **before** writing.
   *
   * Every mutation already has this: it is what its own guards were decided
   * against. It is here so the entry can record where the entities it touched
   * started, which is what lets the entry below it survive this one's undo —
   * see `Preconditions` in `compensating.ts`.
   */
  before: readonly WorkItem[];
  /**
   * The allowance revision each step this command wrote held **before** it
   * wrote, under {@link stepRevisionKey} — the step half of `before`, which
   * `rebase` needs to carry the entry below past this one's undo. Absent for
   * a command that writes no step.
   */
  stepsBefore?: Revisions;
  /** Cleared move destinations whose complete progress needs a pre-batch replay guard. */
  moveProgressOwners?: string[];
}

export class WorkItemService {
  private readonly clock: Clock;

  /** The {@link Command batch} collecting this service's recordings, or none. */
  private collector: BatchCollector | null = null;

  constructor(private readonly opts: WorkItemServiceOptions) {
    this.clock = opts.clock;
    // Proof: required-authoring-construction bypass failed `actual typed service rejects an unknown`'s selected assertion
    // (actual service with memory stores; watched 2026-10-22).
    permitsExternalDependencies(opts.externalDependencyAuthoring);
  }

  /**
   * Reads current trusted authoring authority at each external operation's existing
   * admission point, after principal, owner and endpoint concealment checks.
   * Constructor validation still rejects missing or unknown initial authority;
   * later unreadability throws inside the caller's transaction instead of retaining
   * construction-time permission. Local commands do not require this capability.
   */
  private get externalDependenciesActive(): boolean {
    // Proof: restoring the construction cache failed current-capability add,
    // update in both directions, remove, undo and redo mounted SQLite refusals
    // (inactive and unreadable), watched 2026-10-23.
    // Proof: returning true here made `current capability inactive admits or
    // refuses remove atomically` receive ok:true instead of inactive refusal,
    // watched 2026-10-23 (other entry/replay guards were left installed).
    return permitsExternalDependencies(this.opts.externalDependencyAuthoring);
  }

  /** Checks changed typed endpoint lifecycle and shape before graph expansion or persistence. */
  private structuralRefusal(
    projectId: string,
    actorId: string,
    change: DependencyGraphChange,
  ): Promise<
    | { ok: false; reason: 'cycle' | 'self_node' | 'project_deleting' }
    | { ok: false; reason: 'node_on_parent' | 'descendant_step_on_leaf'; dependencyIds: string[] }
    | null
  > {
    return withDependencyContext(
      this.opts.dependencyContext,
      projectId,
      actorId,
      async (context) => {
        if (change.typed !== undefined) {
          const existing = await this.opts.typedDependencies.listByProject(projectId);
          for (const proposed of change.typed) {
            const previous = existing.find((relationship) => relationship.id === proposed.id);
            if (
              previous !== undefined &&
              formatScopedDependencyKey(previous) === formatScopedDependencyKey(proposed)
            )
              continue;
            // Proof: removing this preflight restored HTTP500 in mounted createWorkItem
            // and duplicateWorkItem implicit-write tests (2026-10-22).
            if (await this.opts.typedDependencies.hasDeletingEndpoint(proposed))
              return { ok: false, reason: 'project_deleting' };
          }
        }
        const conflict = await context.graph.findEndpointConflict(projectId, change);
        if (conflict !== null) return { ok: false, ...conflict };
        const cycle = await context.graph.findCycle(projectId, change);
        return cycle === null
          ? null
          : { ok: false, reason: cycle.kind === 'self_node' ? 'self_node' : 'cycle' };
      },
    );
  }

  /** Checks every doomed incident under current endpoint read authority before a structural delete. */
  private deletionIncidents(
    projectId: string,
    actorId: string,
    doomed: readonly string[],
  ): Promise<
    | { ok: true; externalBefore: readonly ScopedRevision[]; ownedIncomingIds: readonly string[] }
    | { ok: false; reason: WorkItemRefusal; dependencyIds?: string[] }
  > {
    return withDependencyContext(
      this.opts.dependencyContext,
      projectId,
      actorId,
      async (context) => {
        const inside = new Set(doomed);
        const incident = (await this.opts.typedDependencies.listIncident([projectId])).filter(
          (relationship) =>
            relationship.predecessor.projectId !== relationship.successor.projectId &&
            [relationship.predecessor, relationship.successor].some(
              (endpoint) => endpoint.projectId === projectId && inside.has(endpoint.workItemId),
            ),
        );
        const checked = await this.typedEvidence(context, projectId, incident);
        if (!checked.ok) return checked;
        const outgoing = incident
          .filter(
            (relationship) =>
              relationship.predecessor.projectId === projectId &&
              inside.has(relationship.predecessor.workItemId) &&
              !(
                relationship.successor.projectId === projectId &&
                inside.has(relationship.successor.workItemId)
              ),
          )
          .map((relationship) => relationship.id)
          .sort();
        // Proof: disabling this refusal made the admitted predecessor-delete test
        // throw at the later graph guard instead of returning its exact modeled
        // conflict; watched with the real SQLite UoW, 2026-10-22.
        // Proof: bypassing this refusal made mounted promote outgoing return 500 instead of typed 409 (2026-10-22).
        if (outgoing.length > 0)
          return {
            ok: false,
            reason: 'referenced_by_external_dependency',
            dependencyIds: outgoing,
          };
        const ownedIncomingIds = incident
          .filter(
            (relationship) =>
              relationship.projectId === projectId && inside.has(relationship.successor.workItemId),
          )
          .map((relationship) => relationship.id)
          .sort();
        return { ok: true, externalBefore: checked.externalBefore, ownedIncomingIds };
      },
    );
  }

  /**
   * The self-node pair or directed cycle the project's combined dependency
   * graph holds as the batch now stands, or `null`.
   *
   * The batch runner asks this after every command that can change the graph
   * and refuses at that command, which rolls the whole batch back: the check
   * sees the batch's own writes inside its transaction, so the state it judges
   * is the state that would be committed. See {@link DependencyGraphGuard}.
   */
  async findDependencyCycle(
    projectId: string,
    actorId: string,
    change: DependencyGraphChange = {},
  ): Promise<StepNodeCycle | null> {
    const project = await this.opts.projects.findById(projectId);
    // Proof: graph-helper-owner-admission bypass failed `runner-facing graph inspection requires`'s selected assertion
    // (actual service with memory stores; watched 2026-10-22).
    if (project === null || !this.opts.admission.admits(project, actorId))
      throw new Error('dependency graph owner is not admitted');
    return withDependencyContext(this.opts.dependencyContext, projectId, actorId, (context) =>
      context.graph.findCycle(projectId, change),
    );
  }

  /**
   * {@link scheduleInput} through the caller's access: null for a foreign
   * project, and under scoped access a project whose rows cross the project or
   * the organization fails closed rather than scheduling on them.
   */
  async scheduleInputWithin(
    projectId: string,
    access: ResourceAccess,
  ): Promise<ScheduleInput | null> {
    if (!(await this.admits(projectId, access))) return null;
    return this.scheduleInput(projectId);
  }

  /** Private detached observation for the connected coordinator integration; never admits work. */
  async optimizationCaptureWithin(
    projectId: string,
    access: ResourceAccess,
  ): Promise<OptimizationCapture | AccessRefused> {
    const captured = await this.opts.livePlans?.read(projectId, access);
    if (captured?.kind === 'access_refused') return captured;
    if (captured?.kind === 'not_found') return captured;
    if (captured?.kind === 'connected') return captureConnectedOptimization(captured, projectId);
    if (captured?.kind === 'shared') return captureSharedOptimization(captured);
    const input = await this.scheduleInputWithin(projectId, access);
    if (input === null) return { kind: 'not_found' };
    const project = await this.opts.projects.findById(projectId);
    if (project === null) throw new Error('optimizer project disappeared during input capture');
    return {
      kind: 'scheduled',
      input: { kind: 'local', input },
      enabled: project.optimizationEnabled,
    };
  }

  /** Private project-owned detached observation; no returned value borrows the snapshot. */
  async optimizationCapture(projectId: string): Promise<OptimizationCapture> {
    const captured = await this.opts.livePlans?.readProject(projectId);
    if (captured?.kind === 'not_found') return captured;
    if (captured?.kind === 'connected') return captureConnectedOptimization(captured, projectId);
    if (captured?.kind === 'shared') return captureSharedOptimization(captured);
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { kind: 'not_found' };
    const input = await this.scheduleInput(projectId);
    if (input === null) throw new Error('optimizer project disappeared during input capture');
    return {
      kind: 'scheduled',
      input: { kind: 'local', input },
      enabled: project.optimizationEnabled,
    };
  }

  /** Human-scoped Retry input; connected pre-selection boundaries and settings leave one closed authorized read. */
  async optimizationInputWithin(
    projectId: string,
    access: ResourceAccess,
  ): Promise<
    | {
        readonly kind: 'scheduled';
        readonly input: ScheduleInput | OptimizationInput;
        readonly enabled: boolean;
      }
    | { readonly kind: 'not_found' }
    | AccessRefused
    | Extract<OptimizationCapture, { readonly kind: 'idle' | 'dependency_calendar_missing' }>
    | {
        readonly kind: 'unavailable';
        readonly reason: 'engine_unavailable' | 'cycle' | 'calendar_range';
        readonly projectId: string;
      }
  > {
    const captured = await this.opts.livePlans?.read(projectId, access);
    if (captured?.kind === 'access_refused') return captured;
    if (captured?.kind === 'not_found') return { kind: 'not_found' };
    // Proof: restoring the connected refusal made mounted terminal/stale Retry return 500 instead of 409.
    if (captured?.kind === 'connected') {
      const observation = captureConnectedOptimization(captured, projectId);
      return observation.kind === 'unavailable' ? { ...observation, projectId } : observation;
    }
    if (captured?.kind === 'shared') {
      if (captured.chain.kind === 'engine_unavailable')
        return {
          kind: 'unavailable',
          reason: 'engine_unavailable',
          // Proof: replacing this with the target ID failed the mounted required-influencer Retry identity case.
          projectId: captured.chain.projectId,
        };
      if (captured.chain.kind === 'unavailable')
        return { kind: 'unavailable', reason: captured.chain.reason, projectId };
      // Proof: substituting local-only input failed the mounted upstream-only
      // Retry hash and wire-request holder assertions.
      return {
        kind: 'scheduled',
        input: captured.chain.input,
        enabled: captured.project.optimizationEnabled,
      };
    }
    const input = await this.scheduleInputWithin(projectId, access);
    if (input === null) return { kind: 'not_found' };
    const project = await this.opts.projects.findById(projectId);
    if (project === null) throw new Error('optimizer project disappeared during input capture');
    return { kind: 'scheduled', input, enabled: project.optimizationEnabled };
  }

  /** Project-owned optimizer capture; shared input and settings leave one closed read snapshot. */
  async optimizationInput(projectId: string): Promise<
    | { readonly kind: 'scheduled'; readonly input: ScheduleInput; readonly enabled: boolean }
    | { readonly kind: 'not_found' }
    | {
        readonly kind: 'unavailable';
        readonly reason: 'engine_unavailable' | 'cycle' | 'calendar_range';
      }
  > {
    const captured = await this.opts.livePlans?.readProject(projectId);
    if (captured?.kind === 'not_found') return { kind: 'not_found' };
    if (captured?.kind === 'connected')
      throw new Error('connected optimization input is unsupported');
    if (captured?.kind === 'shared') {
      if (captured.chain.kind === 'engine_unavailable')
        return { kind: 'unavailable', reason: 'engine_unavailable' };
      if (captured.chain.kind === 'unavailable')
        return { kind: 'unavailable', reason: captured.chain.reason };
      return {
        kind: 'scheduled',
        input: captured.chain.input,
        // Proof: rereading enablement after the snapshot made mounted concurrent
        // settings/input capture launch two children from the old booking.
        enabled: captured.project.optimizationEnabled,
      };
    }
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { kind: 'not_found' };
    const input = await this.scheduleInput(projectId);
    if (input === null) throw new Error('optimizer project disappeared during input capture');
    return { kind: 'scheduled', input, enabled: project.optimizationEnabled };
  }

  /**
   * Where the project's event stream has reached, as {@link tree} reads it
   * before its rows: every announced change that can move a date or a name
   * advances it. What a per-project read memo is keyed on.
   */
  latestSeq(projectId: string): Promise<number> {
    return this.opts.broadcast.latestSeq(projectId);
  }

  /** Internal detached export bundle from the same authorized observation as its catalogs and markers. */
  async exportWithin(
    projectId: string,
    access: ResourceAccess,
  ): Promise<
    | { kind: 'isolated' }
    | { kind: 'not_found' }
    | AccessRefused
    | EngineUnavailable
    | {
        kind: 'connected';
        project: Project & { timezone: string };
        tree: PlanTree;
        observation: Extract<LivePlanExportRead, { kind: 'connected' }>;
      }
    | {
        kind: 'shared';
        project: Project & { timezone: string };
        tree: PlanTree;
        document: PlanDocumentReads;
      }
  > {
    if (this.opts.livePlans === undefined) return { kind: 'isolated' };
    const captured = await this.opts.livePlans.readExport(projectId, access);
    if (captured.kind === 'connected') {
      const projection = projectConnectedTree(captured, projectId);
      return {
        kind: 'connected',
        project: { ...projection.metadata.project, timezone: projection.reads.project.timezone },
        tree: presentConnectedTree(projection),
        observation: captured,
      };
    }
    if (captured.kind !== 'shared') return captured;
    const tree = projectSharedTree(captured);
    if ('kind' in tree) return tree;
    return {
      kind: 'shared',
      // The zone from the same observation as the rows: the capture's own.
      project: { ...captured.project, timezone: captured.chain.reads.project.timezone },
      tree,
      document: captured.document,
    };
  }

  /**
   * Every work item's update instant ({@link WorkItemStore.listUpdateInstants})
   * through the caller's access: null for a project the caller cannot read.
   */
  async updateInstantsWithin(
    projectId: string,
    access: ResourceAccess,
  ): Promise<ReadonlyMap<string, number | null> | null> {
    if (!(await this.admits(projectId, access))) return null;
    return this.opts.workItems.listUpdateInstants(projectId);
  }

  /**
   * The **Startable** steps of a project through the caller's access, filtered
   * to one team's allotment when `teamId` is given ({@link findStartableWork}).
   * Statuses come from {@link statusReadsOf}, the fold the claim command uses.
   *
   * Names are the organization's own under scoped access, as {@link treeWithin}
   * names assignees. Under legacy access no directory-wide list is read: the
   * assignees' names come with the project's assignments and every other
   * person or team is read by id (`DirectoryStore.namesOf`).
   *
   * Fit (`wbs-resources` R6) reads the project's capacities, demands and
   * occupancy once each, whatever the number of leaves, and the resource
   * catalog only when a capacity is stated: the organization's under scoped
   * access, the root list under legacy access.
   *
   * Null for a project the caller cannot read, refused alike with an absent one;
   * `unknown_team` for a team the caller's directory does not hold.
   */
  async startableWithin(
    projectId: string,
    access: ResourceAccess,
    teamId: string | null,
  ): Promise<StartableWork | { readonly kind: 'unknown_team' } | null> {
    if (this.opts.livePlans !== undefined) {
      const observed = await this.opts.livePlans.readExecution(projectId, access, teamId);
      if (observed.kind === 'not_found' || observed.kind === 'access_refused') return null;
      if (observed.kind === 'unknown_team') return { kind: 'unknown_team' };
      return findStartableWork(observed.reads);
    }
    if (!(await this.admits(projectId, access))) return null;
    const { directory } = this.opts;
    const rows = await this.opts.workItems.listByProject(projectId);
    const claims = await this.claiming().claims.listStampedByProject(projectId);
    const { assignments, people: assigned } = await directory.assignmentsInProject(projectId);
    const unassigned = claims
      .map((each) => each.personId)
      .filter((id) => !assigned.some((person) => person.id === id));
    const labelled = [...rows.flatMap((row) => row.teamIds), ...(teamId === null ? [] : [teamId])];
    // Proof: reading the root catalogs under scoped access too made `answers a
    // member and a viewer alike, with the organization's own names` and
    // `refuses a team the caller's organization does not hold`
    // (startable-organization.controller.db.test.ts) fail; watched 2026-10-19.
    // Proof: `listPeople()` in place of the legacy `namesOf` made `materializes
    // only the assignee and the claim holder during a tiny startable read`
    // (startable-scope.db.test.ts) fail on a `SCAN person`; watched 2026-10-20.
    const [people, teams] =
      access.kind === 'scoped'
        ? await Promise.all([
            directory.listInOrganization('people', access.scope.organizationId),
            directory.listInOrganization('teams', access.scope.organizationId),
          ])
        : await Promise.all([
            directory.namesOf('people', unassigned).then((found) => [...assigned, ...found]),
            directory.namesOf('teams', labelled),
          ]);
    const teamNames = new Map(teams.map((team) => [team.id, team.name] as const));
    if (teamId !== null && !teamNames.has(teamId)) return { kind: 'unknown_team' };
    const {
      statuses,
      stated,
      dependencies,
      evidenceByNode,
      eligibilityByNode,
      predecessorIdsByLeaf,
    } = await this.statusReadsOf(projectId, rows);
    const capacities = await this.resourceCapacitiesOf(projectId);
    const resources =
      capacities.length === 0
        ? []
        : access.kind === 'scoped'
          ? await directory.listInOrganization('resources', access.scope.organizationId)
          : await directory.listResources();
    return findStartableWork({
      rows,
      statuses,
      stepIds: (await this.opts.projects.stepsOf(projectId)).map((step) => step.id),
      stated,
      claims,
      assignments,
      dependencies,
      evidenceByNode,
      eligibilityByNode,
      predecessorIdsByLeaf,
      personNames: new Map(people.map((person) => [person.id, person.name] as const)),
      teamNames,
      teamId,
      capacities,
      demands: await this.opts.demands.listByProject(projectId),
      occupancy: await this.claiming().claims.occupancyOf(projectId),
      resources: new Map(resources.map((resource) => [resource.id, resource] as const)),
    });
  }

  /**
   * One person's assignments and claims in one project
   * (`wbs-resources` R7, {@link findPersonWork}), admitted as the tree read is:
   * `null` for a project the caller may not read, `unknown_person` for a
   * person the caller's organization does not hold.
   *
   * Bounded (spec `project-assignment-reads`): the project's own assignments
   * and claims, and the one person's name — by primary key under legacy
   * access, from the caller's organization under scoped access, as
   * {@link startableWithin} reads its names.
   */
  async personWorkWithin(
    projectId: string,
    access: ResourceAccess,
    personId: string,
  ): Promise<PersonWork | { readonly kind: 'unknown_person' } | null> {
    // Proof: with this admission removed, `refuses a stranger exactly as the
    // tree read does` (person-work-organization.controller.db.test.ts) answered
    // 200 with the foreign project's empty lists instead of 404; watched 2026-10-20.
    if (!(await this.admits(projectId, access))) return null;
    const { directory } = this.opts;
    // Proof: with `namesOf` replaced by `listPeople()`, `materializes only the
    // person read during a tiny by-person read` (person-work-scope.db.test.ts)
    // failed on a `SCAN person`; watched 2026-10-20.
    const named =
      access.kind === 'scoped'
        ? await directory.listInOrganization('people', access.scope.organizationId)
        : await directory.namesOf('people', [personId]);
    const found = named.find((each) => each.id === personId);
    // Proof: with this refusal removed, `refuses a person the caller's
    // organization does not hold` (person-work-organization.controller.db.test.ts)
    // answered 500 instead of 404; watched 2026-10-20.
    if (found === undefined) return { kind: 'unknown_person' };
    const { assignments } = await directory.assignmentsInProject(projectId);
    return findPersonWork({
      person: { personId, name: found.name },
      rows: await this.opts.workItems.listByProject(projectId),
      stepIds: (await this.opts.projects.stepsOf(projectId)).map((step) => step.id),
      assignments,
      claims: await this.claiming().claims.listStampedByProject(projectId),
    });
  }

  /**
   * Read through caller access and admit a connected target only after its owned observation closes.
   * Capture mode never admits; the response retains the original captured projection.
   * Throws when an enabled scheduled connected live observation lacks installed admission.
   * See {@link tree} and {@link scheduleInputWithin}.
   */
  async treeWithin(
    projectId: string,
    access: ResourceAccess,
  ): Promise<Awaited<ReturnType<WorkItemService['tree']>> | AccessRefused> {
    if (this.opts.livePlans !== undefined) {
      const captured = await this.opts.livePlans.read(projectId, access);
      if (captured.kind === 'connected') {
        const tree = presentConnectedTree(projectConnectedTree(captured, projectId));
        // Proof: bypassing this capture guard made the borrowed mounted read enter admission.
        if (this.opts.schedulerMode !== 'capture') {
          const observation = captureConnectedOptimization(captured, projectId);
          // Proof: removing enablement failed the disabled read; bypassing scheduled kind failed the missing-calendar HTTP response.
          if (observation.kind === 'scheduled' && observation.enabled) {
            // Proof: removing this invariant made the configured missing-admission test resolve.
            if (this.opts.admitConnectedOptimization === undefined)
              throw new Error('connected optimizer admission is not installed');
            // The existing target stage belongs to the closed observation, before final projection.
            // Proof: omitting admission left cold mounted connected reads with zero launches.
            // Proof: reconstructing final positions here failed displaced mounted live stage bytes after C Pri selection.
            await this.opts.admitConnectedOptimization({
              projectId,
              input: observation.input,
              enabled: observation.enabled,
            });
          }
        }
        return tree;
      }
      if (captured.kind !== 'isolated') {
        const tree = projectSharedTree(captured);
        if (
          captured.kind === 'shared' &&
          captured.chain.kind === 'scheduled' &&
          captured.project.optimizationEnabled &&
          this.opts.scheduler.supports('optimized')
        ) {
          // The owned snapshot has closed before this live read may reserve a
          // solver seat. Keep `tree`'s captured display even if it starts work.
          // Proof: skipping this admission left the mounted shared tree with
          // zero holder-bearing requests and zero durable slots.
          await this.opts.scheduler.read({
            projectId,
            input: captured.chain.input,
            engine: captured.project.scheduleEngine,
            objective: captured.project.scheduleObjective,
            enabled: captured.project.optimizationEnabled,
            mode: 'live',
          });
        }
        return tree;
      }
    }
    if (!(await this.admits(projectId, access))) return null;
    // Proof: bypassing the public isolated fixture read failed mounted disappearance (200 vs 404) and malformed-core export (200 vs 500).
    const tree = await (this.opts.livePlans === undefined
      ? this.tree(projectId)
      : this.treeIsolated(projectId));
    if (access.kind === 'legacy' || tree === null || 'kind' in tree) return tree;
    // Assignees under their organization-local names, as the scoped people
    // list shows them; the tree read itself knows only the legacy name.
    // Proof: returning the tree's legacy names made `shows assignees under the
    // organization's own names` in `schedule-organization.controller.db.test.ts`
    // answer `root-pe-a` instead of `pe-a`; watched 2026-09-27.
    const local = new Map(
      (await this.opts.directory.listInOrganization('people', access.scope.organizationId)).map(
        (person) => [person.id, person.name] as const,
      ),
    );
    return {
      ...tree,
      assignedPeople: tree.assignedPeople.map((person) => {
        const name = local.get(person.id);
        // `admits` has already refused an assignee the organization does not own.
        if (name === undefined) throw new Error(`assignee "${person.id}" has no local name`);
        return { ...person, name };
      }),
      // The resources a bar waited for, under the organization's own names as
      // its directory shows them; the isolated read knows only the root rows.
      // Proof: returning the root labels made `levels a demanded resource
      // (isolated)` (resource-schedule.controller.db.test.ts) read the opaque
      // root name in place of `staging`; watched 2026-10-20.
      ...(tree.resourceLabels === undefined
        ? {}
        : {
            resourceLabels: withResourceLabels(
              tree,
              await this.opts.directory.listInOrganization(
                'resources',
                access.scope.organizationId,
              ),
            ).resourceLabels,
          }),
    };
  }

  /** Private aggregate projection for load and space cache admission. */
  async sharedTreesWithin(
    actorId: string,
    access: ResourceAccess,
  ): Promise<
    | AccessRefused
    | { readonly kind: 'isolated' }
    | {
        readonly kind: 'shared';
        readonly entries: readonly {
          readonly projectId: string;
          readonly name: string;
          readonly rank: number;
          readonly revision: number;
          readonly seq: number;
          readonly basis: string | null;
          readonly tree: PlanTree | EngineUnavailable;
        }[];
      }
  > {
    if (this.opts.livePlans === undefined) return { kind: 'isolated' };
    const captured = await this.opts.livePlans.readAggregate(actorId, access);
    if (captured.kind !== 'shared') return captured;
    return {
      kind: 'shared',
      entries: captured.entries.map(({ projectId, rank, basis, plan }) => {
        if (plan.kind === 'connected') {
          // Proof: selecting the component's first member failed mounted target identity and dates.
          const projection = projectConnectedTree(plan, projectId);
          return {
            projectId,
            name: projection.metadata.project.name,
            rank,
            revision: projection.metadata.project.revision,
            seq: projection.metadata.seq,
            basis,
            tree: presentConnectedTree(projection),
          };
        }
        return {
          projectId,
          name: plan.project.name,
          rank,
          revision: plan.project.revision,
          seq: plan.seq,
          basis,
          tree: projectSharedTree(plan),
        };
      }),
    };
  }

  /**
   * Whether the caller's access reaches the project, and, under scoped access,
   * that nothing the schedule read follows leaves the project or the
   * organization.
   *
   * @throws when a stored reference crosses: corrupt trusted state, which the
   * activation reconciliation should have refused, is never scheduled on.
   *
   * Proof: skipping the cross-reference check made `fails the schedule read
   * closed over a crossing estimate_step` in
   * `schedule-organization.controller.db.test.ts` answer 200 instead of 500,
   * and finding the project unscoped made `answers 404 alike for a foreign and
   * an absent project` read the foreign tree, and running the check under
   * legacy access too failed `reads any project deployment-wide, crossing rows
   * and all`; watched 2026-09-27.
   */
  private async admits(projectId: string, access: ResourceAccess): Promise<boolean> {
    const project = await findProjectWithin(this.opts.projects, projectId, access);
    if (project === null) return false;
    if (access.kind === 'scoped') {
      const crossing = await this.opts.projects.findCrossReferences(
        projectId,
        access.scope.organizationId,
      );
      if (crossing.length > 0) {
        const kinds = [...new Set(crossing.map((reference) => reference.kind))].sort();
        throw new Error(
          `project "${projectId}" holds references outside its organization: ${kinds.join(', ')}`,
        );
      }
    }
    return true;
  }

  /**
   * Whether a replay would name anything outside the project or its
   * organization: a row that exists in another project, a restored row or
   * dependency claiming another project, a step of another project, or a
   * directory entry the organization does not own. Checked whole, nested
   * batches included, before the replay writes anything, so no intermediate
   * step can cross and be cleared again before a later check.
   */
  private async namesOutside(
    projectId: string,
    organizationId: string,
    references: CompensatingReferences,
  ): Promise<boolean> {
    if (references.projects.some((each) => each !== projectId)) return true;
    for (const id of new Set(references.workItems)) {
      const row = await this.opts.workItems.findById(id);
      // Proof: ordinary-reference-partition bypass failed `mixed nested replay`'s selected assertion
      // (actual SQLite boundary; watched 2026-10-22).
      if (row !== null && row.projectId !== projectId) return true;
    }
    const steps = new Set((await this.opts.projects.stepsOf(projectId)).map((step) => step.id));
    // Proof: bypassing missing-step references changed removed-step first-child undo/redo from 404 to 409 (step-node-attempt.controller.db.test.ts, 2026-10-14).
    if (references.steps.some((id) => !steps.has(id))) return true;
    const catalogs: [DirectoryCatalog, readonly string[]][] = [
      ['people', references.people],
      ['teams', references.teams],
      ['services', references.services],
      ['tags', references.tags],
      ['workItemTypes', references.types],
      ['externalSystems', references.systems],
      ['resources', references.resources],
    ];
    for (const [catalog, ids] of catalogs) {
      if (ids.length === 0) continue;
      const owned = new Set(
        (await this.opts.directory.listInOrganization(catalog, organizationId)).map(
          (entry) => entry.id,
        ),
      );
      if (ids.some((id) => !owned.has(id))) return true;
    }
    return false;
  }

  /** Whether `stepId` names one of this project's steps. */
  async hasStepInProject(projectId: string, stepId: string): Promise<boolean> {
    return (await this.opts.projects.stepsOf(projectId)).some((step) => step.id === stepId);
  }

  /** Whether a batch target is currently a row of this project, including rows created earlier in the batch. */
  async hasWorkItemInProject(projectId: string, workItemId: string): Promise<boolean> {
    return (await this.opts.workItems.listByIds(projectId, [workItemId])).some(
      (row) => row.id === workItemId && row.projectId === projectId,
    );
  }

  /** Returns a refusal for a parent or a step outside the project; the caller has checked membership. */
  async validateStepNode(
    projectId: string,
    workItemId: string,
    stepId: string,
  ): Promise<'rolled_up' | 'unknown_step' | null> {
    const rows = await this.opts.workItems.listByProject(projectId);
    // The batch seam checks membership before calling this method.
    // Proof: bypassing node validation made the mounted parent clear return 200
    // instead of 409 (2026-09-27).
    if (rows.some((row) => row.parentId === workItemId)) return 'rolled_up';
    const steps = await this.opts.projects.stepsOf(projectId);
    // Proof: bypassing node validation made the mounted unknown-step clear return
    // 200 instead of 404 (2026-09-27).
    if (!steps.some((step) => step.id === stepId)) return 'unknown_step';
    return null;
  }

  /**
   * Reads only effective numbers and project steps for revision-bound
   * references — the numbers the tree read shows, without scheduling.
   *
   * @returns `null` for an unknown project.
   * @throws when the numbering misses a row.
   */
  /**
   * {@link readAddresses} through the caller's access: null for a foreign
   * project exactly as for an absent one, and under scoped access a project
   * whose rows cross the project or the organization fails closed.
   */
  async readAddressesWithin(
    projectId: string,
    access: ResourceAccess,
  ): ReturnType<WorkItemService['readAddresses']> {
    if (!(await this.admits(projectId, access))) return null;
    return this.readAddresses(projectId);
  }

  async readAddresses(projectId: string): Promise<{
    workItems: { id: string; parentId: string | null; number: string }[];
    steps: Step[];
  } | null> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return null;
    const rows = await this.opts.workItems.listByProject(projectId);
    const numbers = deriveNumbers(rows);
    return {
      workItems: rows.map((row) => {
        const number = numbers.get(row.id);
        // `deriveNumbers` numbers every reachable row and throws on the rest, so a
        // miss is a broken numbering, never a row to leave out of the addresses.
        // Proof: with the first row dropped from the numbering, the mounted
        // resolve cases failed `Expected: 409, Received: 500` naming `no effective
        // number for work item …` instead of resolving against a partial space;
        // watched 2026-09-27.
        if (number === undefined) throw new Error(`no effective number for work item ${row.id}`);
        return { id: row.id, parentId: row.parentId, number };
      }),
      steps: await this.opts.projects.stepsOf(projectId),
    };
  }

  /** Rebuild the canonical input a durable solver queue entry names. */
  async scheduleInput(projectId: string): Promise<ScheduleInput | null> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return null;
    const rows = await this.opts.workItems.listByProject(projectId);
    const estimates = await this.opts.estimates.listByProject(projectId);
    const edges = await this.opts.dependencies.listByProject(projectId);
    const typed = await this.opts.typedDependencies.listByProject(projectId);
    const assignments = await this.opts.directory.assignmentsOf(rows.map((row) => row.id));
    const steps = await this.opts.projects.stepsOf(projectId);
    const poolSizes = await this.opts.capacity.slotsFor(projectId);
    return canonicalScheduleParts(
      project,
      rows,
      estimates,
      edges,
      typed,
      assignments,
      steps,
      poolSizes,
      await this.opts.demands.listByProject(projectId),
      await this.opts.resourceCapacity.listFor(projectId),
    ).input;
  }

  /**
   * Every work item in the project, each carrying the number derived for it,
   * ordered as the tree reads.
   *
   * Sorting by the derived number rather than by position is what makes the
   * padding rules load-bearing: the numbers are built so that this one
   * lexicographic sort produces tree order across every level at once.
   */
  /**
   * The project's work items, and the event sequence the read happened at.
   *
   * The sequence is read *before* the rows rather than after. Reading it after
   * would let an event recorded mid-read be counted as already seen, and the
   * client would resume from a point past a change its rows do not contain. Read
   * first, the same event is replayed and the client refetches once too often —
   * the harmless direction.
   */
  async tree(projectId: string): Promise<PlanTree | EngineUnavailable | null> {
    if (this.opts.livePlans !== undefined) {
      const captured = await this.opts.livePlans.readProject(projectId);
      if (captured.kind === 'connected')
        return presentConnectedTree(projectConnectedTree(captured, projectId));
      if (captured.kind !== 'isolated') return projectSharedTree(captured);
    }
    return this.treeIsolated(projectId);
  }

  private async treeIsolated(projectId: string): Promise<PlanTree | EngineUnavailable | null> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return null;
    const seq = await this.opts.broadcast.latestSeq(projectId);
    const rows = await this.opts.workItems.listByProject(projectId);
    const stored = await this.opts.estimates.listByProject(projectId);
    // Read beside the estimates and used for nothing but the payload. It is
    // handed to no scheduling function — not `slicesOf`, not `schedule` — and
    // that absence is this change's whole claim about itself: R6 reports, it
    // does not plan. See `openspec/changes/actual-days/design.md` D3.
    const recorded = await this.opts.actuals.listByProject(projectId);
    // Read beside the actuals and, like them, handed to nothing that schedules.
    // What it is for is the tense of the number above it: 8 days against an
    // estimate of 5 is "overran by 3" or "is 3 over so far", and until this row
    // says which, a variance is a figure nobody can act on.
    const stated = await this.opts.progress.listByProject(projectId);
    // One read for all three metrics, filtered per metric inside the fold. The
    // store's `listByProject` takes no metric for exactly this call site — see
    // {@link MeasureStore}.
    const measured = await this.opts.measures.listByProject(projectId);
    const edges = await this.opts.dependencies.listByProject(projectId);
    const authored = await this.opts.typedDependencies.listByProject(projectId);
    // Proof: restoring listPeople() followed by the assigned-id filter made
    // `materializes only assigned project rows and names during a tiny tree read`
    // fail on 41 materialized people, expected at most 1, with the same payload.
    const { assignments: assigned, people: assignedPeople } =
      await this.opts.directory.assignmentsInProject(projectId);
    const steps = await this.opts.projects.stepsOf(projectId);
    const slotsOf = await this.opts.capacity.slotsFor(projectId);
    // Plan data both engines level (`wbs-resources` R5). Never a claim and never
    // an occupancy: a schedule reads what the plan states, not who holds what.
    // Proof: `[]` for both at the canonical call made `levels a demanded
    // resource (isolated)` (resource-schedule.controller.db.test.ts) schedule
    // overlapping blocks; watched 2026-10-20.
    const demands = await this.opts.demands.listByProject(projectId);
    const resourceCapacities = await this.opts.resourceCapacity.listFor(projectId);
    const priorityBands = await this.opts.priorityBands.listFor(projectId);
    const canonical = canonicalScheduleParts(
      project,
      // Proof: removing owners with a direct blockage from this Fast input made
      // `keeps the actual Fast request... (isolated)` fail; watched 2026-10-13.
      rows,
      stored,
      edges,
      authored,
      assigned,
      steps,
      slotsOf,
      demands,
      resourceCapacities,
    );
    let scheduling: TreeSchedule;
    try {
      scheduling = await this.opts.scheduler.read({
        projectId,
        input: canonical.input,
        engine: project.scheduleEngine,
        objective: project.scheduleObjective,
        enabled: project.optimizationEnabled,
        mode: this.opts.schedulerMode ?? 'live',
      });
    } catch (failure) {
      if (failure instanceof ScheduleCycleError)
        scheduling = { kind: 'unavailable', reason: 'cycle' };
      else if (failure instanceof CalendarRangeError)
        scheduling = { kind: 'unavailable', reason: 'calendar_range' };
      else throw failure;
    }
    const tree = projectTree(
      {
        project,
        rows,
        stored,
        recorded,
        stated,
        measured,
        edges,
        authored,
        assigned,
        assignedPeople,
        // Read for the payload alone, like the actuals above: no engine sees it.
        attempts: await this.opts.attempts.listByProject(projectId),
        // Proof: replacing this read with [] failed `reads a direct timestamp
        // and the exact downstream root (isolated)`; watched 2026-10-13.
        blockages: await this.opts.blockages.listByProject(projectId),
        seq,
        steps,
        slotsOf,
        demands,
        resourceCapacities,
        priorityBands,
        // An isolated input carries no bookings elsewhere, so no slice names a holder.
        elsewhereHolders: [],
      },
      scheduling,
    );
    // The resource labels are read only for a schedule that names a resource,
    // so a plan stating none reads no catalog and keeps its payload shape.
    if ('kind' in tree || !namesAResource(tree)) return tree;
    return withResourceLabels(tree, await this.opts.directory.listResources());
  }

  /**
   * Creates a work item. When a leaf gains its first child, moves its step facts
   * and assignments to that child and returns the node mapping in project step order.
   * Blockage keeps its original time through create, undo and redo; conditional
   * replacements refuse newer facts inside the structural command transaction.
   * Retained step parallel facts refuse a nonnull parent before stamping or
   * mutation until hand-down and history ownership exist (ADR 0031). The reader
   * validates selected existing-parent facts too; corrupt trusted state throws.
   * Command scopes own rollback; standalone calls gain no cross-call isolation.
   * The mapping is internal to the application; command responses still return
   * the created work item ID alone.
   */
  async create(
    projectId: string,
    actorId: string,
    input: CreateWorkItem,
  ): Promise<
    (
      | WorkItemOutcome<WorkItem>
      | { ok: false; reason: 'referenced_by_step_parallel'; nodes: readonly StepNodeRef[] }
    ) & { stepNodeMapping?: { from: string; to: string }[] }
  > {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(project, actorId)) return { ok: false, reason: 'forbidden' };

    const rows = await this.opts.workItems.listByProject(projectId);
    // `rows` is this project only, so a parent that is not among them belongs to
    // another project — or to none. The schema cannot catch it: `parent_id`
    // references `work_item.id` alone, not `(project_id, id)`. Accepting it
    // makes the row unreachable from any root here, and every later read of the
    // project throws instead of rendering.
    if (input.parentId !== null && !rows.some((row) => row.id === input.parentId)) {
      return { ok: false, reason: 'not_found' };
    }
    if (input.parentId !== null) {
      // Proof: omitting this read/refusal let both retained-pair negatives create
      // a child and clear parent statements; observed 2026-10-17.
      // Moving this below the first apply changed parent readiness/hold in the
      // snapshot (mutation-late-guard.txt); unconditional refusal blocked empty policy.
      const parallels = await this.opts.stepParallels.listByWorkItems(projectId, [input.parentId]);
      if (parallels.length > 0) {
        return {
          ok: false,
          reason: 'referenced_by_step_parallel',
          // Proof: aliasing the supplied facts failed exact detached-node assertions
          // (mutation-aliased-nodes.txt); wrong parent/project and project-wide reads
          // separately failed selected-policy tests, 2026-10-17.
          nodes: parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId })),
        };
      }
    }
    const placed = placeAfter(this.groupUnder(rows, input.parentId), input.afterId);
    // Read here, per create, against **this** project's ladder — not hoisted to
    // the caller and not carried in on the command. A default fetched by a
    // client is a number the server cannot tell from one somebody typed, and
    // undo/redo would replay it as an intentional priority. design.md D1.
    const priority =
      input.priority === undefined ? await this.ordinaryPriorityOf(projectId) : input.priority;
    // Past every refusal, so nothing is stamped for a request that wrote
    // nothing. One stamp for the row, for the four hand-downs below it and for
    // the journal entry: a create and the estimates it moves are one act.
    const stamp = this.clock.stampFor(actorId);
    // A leaf gaining its first child hands its readiness and hold down with its
    // progress: both describe the work, and the work is the child now.
    const firstChildOf =
      input.parentId !== null && !rows.some((row) => row.parentId === input.parentId)
        ? rows.find((row) => row.id === input.parentId)
        : undefined;
    const workItem: WorkItem = {
      id: this.clock.newId(),
      projectId,
      parentId: input.parentId,
      position: placed.position,
      name: input.name ?? '',
      notes: input.notes ?? '',
      frozenNumber: null,
      startNoEarlierThan: null,
      // No floor, so no words about one — the only pair a new row can be in.
      startNoEarlierThanReason: null,
      // No ceiling either. A new row states nothing about when it must finish,
      // and inheriting the parent's deadline would be the stored-versus-effective
      // bug the service comment below names: the fold over the ancestors is what
      // makes a parent's deadline bind its children, and it reads the stored
      // nulls to do it.
      deadline: null,
      factStart: null,
      factEnd: null,
      // Nothing said about a new row, unless it takes its parent's statements
      // as that parent's first child.
      readiness: firstChildOf?.readiness ?? null,
      hold: firstChildOf?.hold ?? null,
      priority,
      serviceTeamId: null,
      // Unlabelled, in the third dimension as in the other two: a new row states
      // nothing and therefore inherits whatever its parent is delivering. The
      // alternative — copying the parent's service down on create — is the
      // stored-versus-effective bug this repo has shipped twice.
      //
      // The **column**, which since task 10.2 is read by the outgoing release
      // alone; the set a reader of this release sees is the absence of any
      // `work_item_service` row, and a create writes none. Both spell the same
      // unlabelled row, which is the whole point of leaving the column standing.
      serviceId: null,
      // One at a time, which is what every work item has always done and what
      // the column's `DEFAULT 1` says for every row that predates it.
      maxParallel: 1,
      // A row that has never been changed since it came into existence. The
      // estimate handoff below is a real second write and leaves a first child
      // at 1 — see {@link NumberedWorkItem.revision}.
      revision: 0,
    };
    const construct = () =>
      this.insertWorkItem(projectId, actorId, input, rows, workItem, firstChildOf, placed, stamp);
    return withDependencyContext(
      this.opts.dependencyContext,
      projectId,
      actorId,
      async (context) => {
        const handDown =
          firstChildOf === undefined
            ? null
            : { fromWorkItemId: firstChildOf.id, toWorkItemId: workItem.id };
        const transition =
          handDown === null
            ? {
                ok: true as const,
                value: await construct(),
                evidence: { receipts: [], externalBefore: [] },
              }
            : await context.incidents.run(
                projectId,
                actorId,
                { kind: 'fresh', ...handDown },
                stamp,
                construct,
              );
        if (!transition.ok) {
          if (transition.reason === 'structure_refused') return transition.value;
          return {
            ok: false as const,
            reason: transition.reason === 'stale_undo' ? ('not_found' as const) : transition.reason,
          };
        }
        const built = transition.value;
        if (!built.ok) return built;
        const { receipts, externalBefore } = transition.evidence;
        const recording: Recording =
          receipts.length === 0 || handDown === null
            ? built.recording
            : {
                ...built.recording,
                forward: {
                  do: 'transition_incident_nodes',
                  projectId,
                  fromWorkItemId: handDown.fromWorkItemId,
                  toWorkItemId: workItem.id,
                  structural: built.recording.forward,
                  receipts,
                },
                inverse: {
                  do: 'transition_incident_nodes',
                  projectId,
                  fromWorkItemId: workItem.id,
                  toWorkItemId: handDown.fromWorkItemId,
                  structural: built.recording.inverse,
                  receipts: receipts.map(({ from, to }) => ({ from: to, to: from })),
                },
                externalBefore,
              };
        recording.touched = [
          ...new Set([
            ...built.recording.touched,
            ...touchedBy(recording.forward),
            ...touchedBy(recording.inverse),
          ]),
        ];
        await this.record(projectId, stamp, 'create', `add ${quoteName(workItem.name)}`, recording);
        await this.announceTree(projectId);
        return { ok: true as const, value: workItem, stepNodeMapping: built.stepNodeMapping };
      },
    );
  }

  /** Prepares the complete local recording inside its caller's admitted structural transition. */
  private async insertWorkItem(
    projectId: string,
    actorId: string,
    input: CreateWorkItem,
    rows: readonly WorkItem[],
    workItem: WorkItem,
    firstChildOf: WorkItem | undefined,
    placed: ReturnType<typeof placeAfter>,
    stamp: WriteStamp,
  ) {
    const statementsHandedDown =
      firstChildOf !== undefined && (firstChildOf.readiness !== null || firstChildOf.hold !== null)
        ? {
            forward: {
              do: 'patch' as const,
              workItemId: firstChildOf.id,
              patch: { readiness: null, hold: null },
            },
            inverse: {
              do: 'patch' as const,
              workItemId: firstChildOf.id,
              patch: { readiness: firstChildOf.readiness, hold: firstChildOf.hold },
            },
          }
        : undefined;
    // Cleared **before** the child is inserted, so no read between the two
    // writes sees a parent holding a statement (Fable review, I1).
    // Proof: this write skipped made `hands a leaf’s readiness and hold down
    // to its first child…` fail on `parent … holds a readiness or a hold`;
    // watched 2026-09-29. Moved after the insert, `no read sees a parent
    // holding a statement while a first child is created` failed on the read
    // taken between the two writes; watched 2026-09-29.
    if (statementsHandedDown !== undefined) {
      const handed = await this.apply(projectId, statementsHandedDown.forward, stamp);
      if (!handed.ok) throw new Error(`cannot hand statements down: ${handed.detail}`);
    }
    const blockedHandedDown =
      firstChildOf === undefined
        ? []
        : await this.opts.blockages.listByWorkItems(projectId, [firstChildOf.id]);
    const clearParentBlockages: CompensatingCommand[] = blockedHandedDown.map(
      ({ workItemId, stepId, blockedAt }) => ({
        do: 'replace_blockage',
        workItemId,
        stepId,
        expectedBlockedAt: blockedAt,
        replacementBlockedAt: null,
      }),
    );
    const restoreParentBlockages: CompensatingCommand[] = blockedHandedDown.map(
      ({ workItemId, stepId, blockedAt }) => ({
        do: 'replace_blockage',
        workItemId,
        stepId,
        expectedBlockedAt: null,
        replacementBlockedAt: blockedAt,
      }),
    );
    const setChildBlockages: CompensatingCommand[] = blockedHandedDown.map(
      ({ stepId, blockedAt }) => ({
        do: 'replace_blockage',
        workItemId: workItem.id,
        stepId,
        expectedBlockedAt: null,
        replacementBlockedAt: blockedAt,
      }),
    );
    const clearChildBlockages: CompensatingCommand[] = blockedHandedDown.map(
      ({ stepId, blockedAt }) => ({
        do: 'replace_blockage',
        workItemId: workItem.id,
        stepId,
        expectedBlockedAt: blockedAt,
        replacementBlockedAt: null,
      }),
    );
    const gainsFirstChild =
      input.parentId !== null && !rows.some((row) => row.parentId === input.parentId)
        ? input.parentId
        : null;
    const proposedTyped = (await this.opts.typedDependencies.listByProject(projectId)).map(
      (relationship) => ({
        ...relationship,
        predecessor:
          gainsFirstChild !== null &&
          relationship.successor.projectId === projectId &&
          relationship.predecessor.scope === 'node' &&
          relationship.predecessor.projectId === projectId &&
          relationship.predecessor.workItemId === gainsFirstChild
            ? { ...relationship.predecessor, workItemId: workItem.id }
            : relationship.predecessor,
        successor:
          gainsFirstChild !== null &&
          relationship.predecessor.projectId === projectId &&
          relationship.successor.scope === 'node' &&
          relationship.successor.projectId === projectId &&
          relationship.successor.workItemId === gainsFirstChild
            ? { ...relationship.successor, workItemId: workItem.id }
            : relationship.successor,
      }),
    );
    const proposedEstimates = (await this.opts.estimates.listByProject(projectId)).map(
      (estimate) =>
        gainsFirstChild !== null && estimate.workItemId === gainsFirstChild
          ? { ...estimate, workItemId: workItem.id }
          : estimate,
    );
    // Proof: bypassing this call failed `connected create refuses an injected failed graph read`
    // at the actual SQLite refusal assertion; unchanged tables also checked (2026-10-22).
    const structural = await this.structuralRefusal(projectId, actorId, {
      rows: [...rows, workItem],
      typed: proposedTyped,
      estimates: proposedEstimates,
    });
    if (structural !== null) return structural;
    // The repository validates leaf ownership even while clearing; capture and clear
    // before insertion, then restore only after undo has removed the child.
    for (const command of clearParentBlockages) {
      const cleared = await this.apply(projectId, command, stamp);
      // Proof: removing this guard failed the refused parent-clear test on its expected error; watched 2026-10-14.
      if (!cleared.ok) throw new Error(`cannot clear first-child blockage: ${cleared.detail}`);
    }
    await this.opts.workItems.insert(workItem, placed.renumbered, stamp);
    // Proof: skipping these writes failed exact blockage preservation in memory and mounted SQLite; watched 2026-10-14.
    for (const command of setChildBlockages) {
      const written = await this.apply(projectId, command, stamp);
      // Proof: removing this guard let the refused child write resolve; watched 2026-10-14.
      if (!written.ok) throw new Error(`cannot hand blockage to first child: ${written.detail}`);
    }
    // A work item that had an estimate and now has a child no longer holds one:
    // the estimate described the work, and the work is the child now. Moving it
    // down keeps the total identical, which is what makes this safe to do
    // silently — the plan's numbers do not shift under the user.
    // Read before the move, because afterwards they are the child's. This is
    // the whole before-state an undo of this create has to put back.
    const handedDown =
      gainsFirstChild === null
        ? []
        : (await this.opts.estimates.listByProject(projectId)).filter(
            (each) => each.workItemId === gainsFirstChild,
          );
    // The actuals go down with them, and for a sharper reason than the
    // estimates do. A parent's figures are the sum of its children's, so an
    // actual left behind on a row that has just gained a child is a row no
    // reader can see and no writer can reach — invisible rather than zero, and
    // back on screen the day somebody deletes the child. Read before the move,
    // like the estimates, because afterwards they are the child's.
    const recordedHandedDown =
      gainsFirstChild === null
        ? []
        : (await this.opts.actuals.listByProject(projectId)).filter(
            (each) => each.workItemId === gainsFirstChild,
          );
    // The statements go down with the figures, and the reason is the sharpest of
    // the three. A row that has just gained a child folds its state from below,
    // so a `done` left behind is not merely invisible — it is a claim that
    // reappears the day somebody deletes the child, over work the plan has since
    // moved on from. Read before the move, like the other two.
    const statedHandedDown =
      gainsFirstChild === null
        ? []
        : (await this.opts.progress.listByProject(projectId)).filter(
            (each) => each.workItemId === gainsFirstChild,
          );
    // The tokens and hours go down with the days, in every metric at once —
    // `moveAll` takes no metric because a leaf gaining a child stops holding
    // figures in all of them together. Read before the move, like the other
    // three; afterwards they are the child's.
    const measuredHandedDown =
      gainsFirstChild === null
        ? []
        : (await this.opts.measures.listByProject(projectId)).filter(
            (each) => each.workItemId === gainsFirstChild,
          );
    // The attempts go down with the statements, numbers kept. Read before the
    // move for the undo: the child's delete would cascade them away, so the
    // undo writes these back onto the parent verbatim.
    const attemptedHandedDown =
      gainsFirstChild === null
        ? []
        : [...(await this.opts.attempts.listOfWorkItem(gainsFirstChild)).values()].flat();
    // And the parent's attempt-number marks, which `moveAll` copies to the
    // child (A42). Read for the redo: undoing this create deletes the child and
    // its marks with it, and a number removed while it was the parent's highest
    // shows in no attempt the redo writes back.
    const issuedHandedDown =
      gainsFirstChild === null
        ? []
        : await this.opts.attempts.listIssued(projectId, [gainsFirstChild]);
    const assignedHandedDown =
      gainsFirstChild === null ? [] : await this.opts.directory.assignmentsFor(gainsFirstChild);
    // And the claims: left on a row that is no longer a leaf, a step claim is
    // one no release reaches, no claim on the child is fenced by and the
    // startable read never lists. Moved in place, ids kept, so a delegated
    // claim or any later satellite naming one moves with it. A fixture built
    // without a claim store holds no claims to move.
    const claimedHandedDown =
      gainsFirstChild === null || this.opts.claims === undefined
        ? []
        : (await this.opts.claims.listByProject(projectId)).filter(
            (each) => each.workItemId === gainsFirstChild,
          );
    // The leaf's resource demands go down with its step facts (`wbs-resources`):
    // a demand charges leaves' work, and the child now holds the work. The
    // occupancy stays on the claims, which move in place.
    const demandedHandedDown =
      gainsFirstChild === null
        ? []
        : (await this.opts.demands.listByProject(projectId)).filter(
            (each) => each.workItemId === gainsFirstChild,
          );
    const stepNodeMapping =
      gainsFirstChild === null
        ? []
        : (await this.opts.projects.stepsOf(projectId)).map((step) => ({
            from: formatStepNodeId({ workItemId: gainsFirstChild, stepId: step.id }),
            to: formatStepNodeId({ workItemId: workItem.id, stepId: step.id }),
          }));
    const nodeRemaps =
      gainsFirstChild === null
        ? []
        : (await this.opts.typedDependencies.listByProject(projectId))
            .filter((dependency) =>
              [dependency.predecessor, dependency.successor].some(
                (endpoint) =>
                  endpoint.scope === 'node' &&
                  endpoint.projectId === projectId &&
                  endpoint.workItemId === gainsFirstChild,
              ),
            )
            .map((original) => ({
              original,
              remapped: {
                ...original,
                predecessor:
                  original.predecessor.scope === 'node' &&
                  original.predecessor.projectId === projectId &&
                  original.predecessor.workItemId === gainsFirstChild
                    ? { ...original.predecessor, workItemId: workItem.id }
                    : original.predecessor,
                successor:
                  original.successor.scope === 'node' &&
                  original.successor.projectId === projectId &&
                  original.successor.workItemId === gainsFirstChild
                    ? { ...original.successor, workItemId: workItem.id }
                    : original.successor,
              },
            }));
    // Proof: skipping the remap made mounted first-child create return 500 instead of
    // preserving its node relationship; watched 2026-09-27.
    for (const { remapped } of nodeRemaps) {
      await this.opts.typedDependencies.update(remapped, stamp);
    }
    // Proof: the estimates' `moveAll` skipped, be-01's `hands the estimates
    // back up when it undoes the first child that took them` failed — the
    // path the row menu's Add child takes. Watched 2026-09-27.
    if (gainsFirstChild !== null) {
      await this.opts.estimates.moveAll(gainsFirstChild, workItem.id, stamp);
      await this.opts.actuals.moveAll(gainsFirstChild, workItem.id, stamp);
      await this.opts.progress.moveAll(gainsFirstChild, workItem.id, stamp);
      await this.opts.measures.moveAll(gainsFirstChild, workItem.id, stamp);
      // Proof: skipped, `hands a leaf’s attempts down to its first child,
      // numbers kept` read none on the child; watched 2026-10-12.
      await this.opts.attempts.moveAll(gainsFirstChild, workItem.id, stamp);
      // Proof: skipped, `releases the handed-down claim on the child`
      // (claim-command.test.ts) answered `not_claimed_by`; watched 2026-10-20.
      if (claimedHandedDown.length > 0)
        await this.claiming().claims.moveAll(gainsFirstChild, workItem.id, stamp);
      // Proof: skipped, `hands a leaf’s demand down to its first child, keeping
      // the occupancy, and back on undo` (resource-occupancy.db.test.ts) read
      // the demand on the parent, on both stores; watched 2026-10-20.
      for (const { resourceId, units } of demandedHandedDown) {
        for (const [owner, value] of [
          [workItem.id, units],
          [gainsFirstChild, null],
        ] as const) {
          const written = await this.opts.demands.set(owner, resourceId, value, stamp);
          // Both rows and the resource were read in this unit of work a moment ago.
          if (written !== 'written')
            throw new Error(`cannot hand demand on ${resourceId} to first child: ${written}`);
        }
      }
      // Proof: skipping these writes failed `hands a first child every Dev fact and Ann`
      // at `Expected: <Ann id>, Received: undefined` for child.assignees[Dev]; watched 2026-09-27.
      for (const assignment of assignedHandedDown) {
        const moved = await this.opts.directory.assign(
          workItem.id,
          assignment.stepId,
          assignment.personId,
          stamp,
        );
        // Proof: deleting this refusal check let a failed child assignment answer 200;
        // `reports a failed assignment hand-down` saw `Expected: 500, Received: 200`; watched 2026-09-27.
        if (!moved.ok) throw new Error(`cannot move assignment to first child: ${moved.reason}`);
        const cleared = await this.opts.directory.assign(
          gainsFirstChild,
          assignment.stepId,
          null,
          stamp,
        );
        // Proof: deleting this refusal check let a failed parent clear answer 200;
        // `reports a failed assignment hand-down` saw `Expected: 500, Received: 200`; watched 2026-09-27.
        if (!cleared.ok) throw new Error(`cannot clear parent assignment: ${cleared.reason}`);
      }
    }
    const forward: CompensatingCommand = {
      do: 'restore_subtree',
      rows: [workItem],
      rootPosition: workItem.position,
      reparented: [],
      estimates: handedDown.map((each) => ({ ...each, workItemId: workItem.id })),
      actuals: recordedHandedDown.map((each) => ({ ...each, workItemId: workItem.id })),
      progress: statedHandedDown.map((each) => ({ ...each, workItemId: workItem.id })),
      measures: measuredHandedDown.map((each) => ({ ...each, workItemId: workItem.id })),
      attempts: attemptedHandedDown.map((each) => ({ ...each, workItemId: workItem.id })),
      // Proof: left out, `skips a number removed before the first child, across
      // the create's undo and redo` in `step-node-attempt.controller.db.test.ts`
      // read the child's numbers `[1, 2]` where `[1, 3]` was owed; watched 2026-10-12.
      issuedAttemptNumbers: issuedHandedDown.map((each) => ({
        ...each,
        workItemId: workItem.id,
      })),
      assignments: assignedHandedDown.map((assignment) => ({
        ...assignment,
        workItemId: workItem.id,
      })),
      // Proof: removing this field failed `hands a first child every Dev fact and Ann`
      // at `expect(received).toMatchObject(expected)`: forward.stepNodeMapping absent; watched 2026-09-27.
      stepNodeMapping,
      internalDependencies: [],
      externalDependencies: [],
      removedEstimates: handedDown.map((each) => ({
        workItemId: each.workItemId,
        stepId: each.stepId,
      })),
      removedActuals: recordedHandedDown.map((each) => ({
        workItemId: each.workItemId,
        stepId: each.stepId,
      })),
      removedProgress: statedHandedDown.map((each) => ({
        workItemId: each.workItemId,
        stepId: each.stepId,
      })),
      // The metric rides along, unlike the three above: these keys are
      // triples, and a pair here would take every figure off the parent
      // rather than the ones this create handed down.
      removedMeasures: measuredHandedDown.map((each) => ({
        workItemId: each.workItemId,
        stepId: each.stepId,
        metric: each.metric,
      })),
      removedAttempts: attemptedHandedDown.map(({ workItemId, stepId, attemptNumber }) => ({
        workItemId,
        stepId,
        attemptNumber,
      })),
    };
    const inverse: CompensatingCommand = {
      do: 'delete_subtree',
      rootId: workItem.id,
      // Exactly this row and nothing else. A work item somebody has since
      // built under is not one this undo may take away, and its own revision
      // would not say so — a child is a row of its own.
      expectedSubtree: [workItem.id],
      remove: [workItem.id],
      reparented: [],
      setEstimates: handedDown,
      // Back to the row they came from, exactly as they were. Re-applying
      // this create's own undo is what runs it.
      setActuals: recordedHandedDown,
      // And the statements, back on the row they came from. Undoing this
      // create makes the parent a leaf again, and a leaf reports what it
      // holds — including whether its work is finished.
      setProgress: statedHandedDown,
      // And the figures that are not days, back on the row they came from.
      // Undoing this create makes the parent a leaf again, and a leaf reports
      // what it holds — in every unit, not the one the scheduler reads.
      setMeasures: measuredHandedDown,
      // And the attempts, verbatim with their numbers: the child's delete
      // cascades its copies, so without these an undo loses the history.
      // Proof: left out, `gives a leaf's attempts back when its first child's
      // create is undone` in `work-item.resource.test.ts` read `[]` on the
      // parent (`- Expected - 24 / + Received + 1`); watched 2026-10-12.
      setAttempts: attemptedHandedDown,
    };
    // The subtree commands remain readable by older binaries. Assignment changes
    // are ordinary journal steps, so their owners also enter undo/redo revisions.
    const forwardSteps: CompensatingCommand[] = [
      ...nodeRemaps.map(({ original }) => ({
        do: 'remove_typed_dependency' as const,
        dependency: original,
      })),
      ...(statementsHandedDown === undefined ? [] : [statementsHandedDown.forward]),
      ...clearParentBlockages,
      forward,
      // Proof: omitting these replay writes failed both exact blockage redo tests; watched 2026-10-14.
      ...setChildBlockages,
      // Proof: omitted, `hands a claimed leaf's claims to its first child and
      // back on undo` read the claim on the parent after the redo; watched 2026-10-20.
      ...(gainsFirstChild === null || claimedHandedDown.length === 0
        ? []
        : [
            {
              do: 'move_claims' as const,
              fromWorkItemId: gainsFirstChild,
              toWorkItemId: workItem.id,
              claims: claimedHandedDown,
            },
          ]),
      // Proof: omitted, the same test read the demand back on the parent after
      // the redo, on both stores; watched 2026-10-20.
      ...demandedHandedDown.flatMap(({ workItemId, resourceId, units }) => [
        { do: 'set_demand' as const, workItemId: workItem.id, resourceId, units },
        { do: 'set_demand' as const, workItemId, resourceId, units: null },
      ]),
      ...assignedHandedDown.map(({ workItemId, stepId }) => ({
        do: 'assign' as const,
        workItemId,
        stepId,
        personId: null,
      })),
      ...nodeRemaps.map(({ remapped }) => ({
        do: 'add_typed_dependency' as const,
        dependency: remapped,
      })),
    ];
    const inverseSteps: CompensatingCommand[] = [
      ...nodeRemaps.map(({ remapped }) => ({
        do: 'remove_typed_dependency' as const,
        dependency: remapped,
      })),
      ...clearChildBlockages,
      // Before the child's delete, which would cascade them away.
      // Proof: omitted, `hands a claimed leaf's claims to its first child and
      // back on undo` read no claim on the parent after the undo; watched 2026-10-20.
      ...(gainsFirstChild === null || claimedHandedDown.length === 0
        ? []
        : [
            {
              do: 'move_claims' as const,
              fromWorkItemId: workItem.id,
              toWorkItemId: gainsFirstChild,
              claims: claimedHandedDown.map((each) => ({ ...each, workItemId: workItem.id })),
            },
          ]),
      // Back on the parent; the child's own row goes with its delete.
      // Proof: omitted, `hands a leaf’s demand down to its first child, keeping
      // the occupancy, and back on undo` read no demand after the undo; watched 2026-10-20.
      ...demandedHandedDown.map(({ workItemId, resourceId, units }) => ({
        do: 'set_demand' as const,
        workItemId,
        resourceId,
        units,
      })),
      inverse,
      // Proof: omitting these replay writes failed both exact blockage undo tests; watched 2026-10-14.
      ...restoreParentBlockages,
      ...(statementsHandedDown === undefined ? [] : [statementsHandedDown.inverse]),
      ...assignedHandedDown.map(({ workItemId, stepId, personId }) => ({
        do: 'assign' as const,
        workItemId,
        stepId,
        personId,
      })),
      ...nodeRemaps.map(({ original }) => ({
        do: 'add_typed_dependency' as const,
        dependency: original,
      })),
    ];
    const forwardCommand: CompensatingCommand =
      forwardSteps.length === 1 ? forward : { do: 'batch', steps: forwardSteps };
    const inverseCommand: CompensatingCommand =
      inverseSteps.length === 1 ? inverse : { do: 'batch', steps: inverseSteps };
    const recording: Recording = {
      forward: forwardCommand,
      inverse: inverseCommand,
      // Both batches name every typed endpoint whose revision replay writes.
      // Proof: 2026-09-28, keeping only child and parent made both mounted
      // hand-down undo chains return 409 on their earlier entry.
      touched: [
        ...new Set([
          workItem.id,
          ...(gainsFirstChild === null ? [] : [gainsFirstChild]),
          ...touchedBy(forwardCommand),
          ...touchedBy(inverseCommand),
        ]),
      ],
      before: rows,
    };
    return { ok: true as const, value: workItem, stepNodeMapping, recording };
  }

  async patch(
    id: string,
    actorId: string,
    patch: WorkItemPatch,
  ): Promise<WorkItemOutcome<WorkItem>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    // The row as the **plan read** gave it, not as `findById` did: the tag set
    // has no column behind it, so it exists only here. Falling back to the bare
    // row with an empty set would make the inverse of a tag patch "take every
    // tag off" for a row that had some — an undo that loses exactly the data
    // this field's whole design is about — so a row the plan read cannot see is
    // `not_found` instead, which is what it is.
    const before = context.value.rows.find((row) => row.id === id);
    if (before === undefined) return { ok: false, reason: 'not_found' };
    // A row with children has no slices of its own — `slicesOf` skips it — so a
    // parallelism stored there would be a number on screen that decides
    // nothing. Refused rather than accepted-and-ignored, which is the same
    // refusal `setEstimate` makes about the same shape of row, decided against
    // the same read.
    //
    // A leaf that *later* gains a child keeps whatever it was given: the write
    // was legal when it was made, and rewriting it now would be this change
    // editing a row nobody asked it to.
    //
    // Proof: this check deleted and `refuses a parallelism on a row that has
    // children` failed on `Expected: 400, Received: 200` — the parent took the
    // write and came back carrying a number no slice of that plan reads;
    // watched 2026-08-12.
    if (patch.maxParallel !== undefined && context.value.rows.some((row) => row.parentId === id)) {
      return { ok: false, reason: 'has_children' };
    }
    // The one-type rule for every authored write, behind the parser's early
    // answer: `typeIds` and `typeRefs` are only joined here, after the batch has
    // bound its refs. The set a patch writes is the patch's own set (the store
    // replaces it whole), so this check against the patch decides the row as it
    // will stand. Undo/redo restoration writes through `apply`, never through
    // here, so a stored type conflict can still be put back exactly.
    //
    // Proof: this check deleted and three tests failed, watched 2026-09-27: the
    // mounted `refuses a batch whose third command binds two types, naming that
    // command` received 200; `refuses a third command binding two types and rolls
    // back the first two` (plan-commands.db) and `refuses an authored patch with
    // two types, writing and journalling nothing` (undo.db) received ok.
    //
    // Proof: an authored type patch routed through `apply` (the restoration
    // path) instead and five tests failed, watched 2026-09-27: the three above,
    // plus `puts a type conflict back, whole, after one type is kept` and `takes
    // a first type set off again` on `stale_undo` (nothing was journalled).
    if (patch.typeIds !== undefined && new Set(patch.typeIds).size > 1) {
      return { ok: false, reason: 'work_item_takes_one_type' };
    }
    // The one deadline-specific refusal, and it is here rather than at the
    // controller for the reason the not-before pair is decided in the store:
    // this is the first layer that has the **project** as well as the payload,
    // and day zero is the project's. `null` clears the deadline and is asked
    // nothing — there is no date to be before anything.
    //
    // `deadlineOffsetOf` is the same function the fold and Fast read, so the
    // boundary a write is refused at is by construction the boundary a plan
    // would have placed it against. Duplicating the comparison here with a
    // plain `<` is what would let the two drift.
    //
    // Proof: this refusal deleted, and `refuses a deadline before the project's
    // first working day, naming the row and day zero` fails on `Expected: 422,
    // Received: 200` — the
    // row takes a date that no placement of the work can meet and every later
    // read of the project reports it late by a span nobody asked for.
    //
    // A project with no start date is asked nothing, for the reason the plan
    // read gives one screen down about the not-before floors: there is nothing
    // to count from, so there is no day zero for a date to fall before. A plan
    // off the calendar takes any deadline and applies none of them.
    const projectStart = context.value.project.startDate;
    if (projectStart !== null && patch.deadline !== undefined && patch.deadline !== null) {
      const offset = deadlineOffsetOf(projectStart, patch.deadline);
      if (offset.kind === 'before-project-start') {
        return {
          ok: false,
          reason: 'deadline_before_project_start',
          workItemId: id,
          projectDayZero: nextWorkday(projectStart),
        };
      }
    }
    const stamp = this.clock.stampFor(actorId);
    const written = await this.opts.workItems.patch(id, patch, stamp);
    if (!written.ok) return { ok: false, reason: written.reason };
    const updated = written.workItem;
    await this.announceTree(updated.projectId);
    // A patch naming no field wrote nothing — the store returns the row it
    // found — so there is nothing to reverse. Journalling it would put an
    // entry on the stack whose undo is visibly a no-op.
    if (fieldsOf(patch).length > 0) {
      await this.record(
        updated.projectId,
        stamp,
        'patch',
        patch.name === undefined
          ? `edit ${quoteName(updated.name)}`
          : `rename ${quoteName(updated.name)}`,
        {
          forward: { do: 'patch', workItemId: id, patch },
          inverse: { do: 'patch', workItemId: id, patch: revertTo(before, patch) },
          touched: [id],
          before: context.value.rows,
        },
      );
    }
    return { ok: true, value: updated };
  }

  /**
   * Sets, replaces or clears who does one work item's work for one step.
   *
   * The person is deliberately **not** checked against the work item's
   * `serviceTeamId`: Dany's call, 2026-08-06 — "keep people and service/team
   * lists decoupled for the work item". A team labels the work, a person does
   * it, and a platform engineer picking up a piece of billing work is an
   * ordinary Tuesday rather than a mistake to refuse.
   */
  async assign(
    id: string,
    actorId: string,
    stepId: string,
    personId: string | null,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem } = context.value;
    if (!(await this.holdsStep(workItem.projectId, stepId)))
      return { ok: false, reason: 'unknown_step' };
    const before =
      (await this.opts.directory.assignmentsFor(id)).find((each) => each.stepId === stepId)
        ?.personId ?? null;
    const stamp = this.clock.stampFor(actorId);
    const assigned = await this.opts.directory.assign(id, stepId, personId, stamp);
    if (!assigned.ok) return { ok: false, reason: assigned.reason };
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      personId === null ? 'unassign' : 'assign',
      personId === null
        ? `clear who does ${quoteName(workItem.name)}`
        : `assign ${quoteName(workItem.name)}`,
      {
        forward: { do: 'assign', workItemId: id, stepId, personId },
        inverse: { do: 'assign', workItemId: id, stepId, personId: before },
        touched: [id],
        before: context.value.rows,
      },
    );
    return { ok: true, value: null };
  }

  /**
   * {@link assign} for one step on every leaf under `id` — `id` itself when it
   * is a leaf — journalled as one entry whose undo puts back exactly the
   * assignee each leaf had, `null` where it had none (`wbs-resources` R7).
   *
   * Like {@link assign} it reads neither team labels nor claims: labelling is
   * not assigning (Dany, 2026-08-06), and a claim is beside an assignment (D1).
   * `unknown_step` answers before any write; `unknown_person` comes from the
   * first write, inside its transaction, so nothing is written when it fires.
   */
  async assignSubtree(
    id: string,
    actorId: string,
    stepId: string,
    personId: string | null,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.value;
    // The batch refuses a foreign step first (command-references.ts), so this is
    // the direct caller's guard. Proof: removed, `answers unknown_step from the
    // service itself` (assignee-commands.db.test.ts) answered ok on the memory
    // store, which keeps no step check of its own; watched 2026-10-20.
    if (!(await this.holdsStep(workItem.projectId, stepId)))
      return { ok: false, reason: 'unknown_step' };
    const lineage = lineageOf(rows, id);
    const below = new Set(lineage.descendantIds);
    const leafIds = lineage.isLeaf
      ? [id]
      : rows
          .filter((row) => below.has(row.id) && !rows.some((each) => each.parentId === row.id))
          .map((row) => row.id);
    const previous = new Map(
      (await this.opts.directory.assignmentsOf(leafIds))
        .filter((each) => each.stepId === stepId)
        .map((each) => [each.workItemId, each.personId] as const),
    );
    const stamp = this.clock.stampFor(actorId);
    for (const leafId of leafIds) {
      const assigned = await this.opts.directory.assign(leafId, stepId, personId, stamp);
      // Every leaf names the same person and step, so only the first write can
      // refuse; the batch's unit of work rolls back anything before a refusal.
      if (!assigned.ok) return { ok: false, reason: assigned.reason };
    }
    await this.announceTree(workItem.projectId);
    const forward: CompensatingCommand[] = leafIds.map((leafId) => ({
      do: 'assign',
      workItemId: leafId,
      stepId,
      personId,
    }));
    const inverse: CompensatingCommand[] = leafIds.map((leafId) => ({
      do: 'assign',
      workItemId: leafId,
      stepId,
      // Proof: with `null` in place of the captured assignee, the three undo
      // cases of assignee-commands.db.test.ts failed on both stores: undo
      // cleared the leaves that had an assignee; watched 2026-10-20.
      personId: previous.get(leafId) ?? null,
    }));
    await this.record(
      workItem.projectId,
      stamp,
      personId === null ? 'unassign' : 'assign',
      personId === null
        ? `clear who does every leaf of ${quoteName(workItem.name)}`
        : `assign every leaf of ${quoteName(workItem.name)}`,
      {
        forward: oneCommandOf(forward),
        inverse: oneCommandOf(inverse),
        touched: leafIds,
        before: rows,
      },
    );
    return { ok: true, value: null };
  }

  /**
   * States one work item's demand on one resource, or removes it on `null`
   * (`wbs-resources` R1): a satellite write that moves the item's revision and
   * journals one undoable entry pinned to it. Any work item may carry one; a
   * parent's charges nothing, because a demand is never inherited. Units are
   * bounded at the boundary; the kind's rule is {@link refuseDemand}'s, read off
   * the resource here because a kind never changes.
   *
   * Proof: with the kind check removed, `refuses 2 units on an exclusive resource,
   * writing nothing` (resource-command.test.ts) stored the demand; watched 2026-10-20.
   */
  async setDemand(
    id: string,
    actorId: string,
    resourceId: string,
    units: number | null,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem } = context.value;
    const { demands } = this.opts;
    const resource = (await this.opts.directory.listResources()).find(
      (each) => each.id === resourceId,
    );
    if (resource === undefined) return { ok: false, reason: 'unknown_resource' };
    if (units !== null) {
      const refusal = refuseDemand(resource.kind, units);
      if (refusal !== null) return { ok: false, reason: refusal };
    }
    const before =
      (await demands.listByProject(workItem.projectId)).find(
        (each) => each.workItemId === id && each.resourceId === resourceId,
      )?.units ?? null;
    const stamp = this.clock.stampFor(actorId);
    const written = await demands.set(id, resourceId, units, stamp);
    if (written === 'unknown_resource') return { ok: false, reason: 'unknown_resource' };
    if (written === 'unknown_work_item') return { ok: false, reason: 'not_found' };
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      units === null ? 'clear_demand' : 'set_demand',
      units === null
        ? `clear what ${quoteName(workItem.name)} needs`
        : `state what ${quoteName(workItem.name)} needs`,
      {
        forward: { do: 'set_demand', workItemId: id, resourceId, units },
        inverse: { do: 'set_demand', workItemId: id, resourceId, units: before },
        touched: [id],
        before: context.value.rows,
      },
    );
    return { ok: true, value: null };
  }

  /** Every demand stated on a work item of the project, by work item then resource. */
  demandsOf(projectId: string): Promise<Demand[]> {
    return this.opts.demands.listByProject(projectId);
  }

  /**
   * The project's **Occupancy** (`wbs-resources` R3), per resource: the units
   * its leaves' claims hold with their holders, and the free units of every
   * resource it states a capacity for. Nothing that schedules reads it (R5).
   */
  async occupancyOf(
    projectId: string,
  ): Promise<{ occupied: ResourceOccupancy[]; free: ResourceUnits[] }> {
    const rows = await this.claiming().claims.occupancyOf(projectId);
    return {
      occupied: occupancyByResource(rows),
      free: freeUnitsOf(await this.resourceCapacitiesOf(projectId), rows),
    };
  }

  /** The project's stated resource capacities, in resource-id order. */
  resourceCapacitiesOf(projectId: string): Promise<ResourceCapacity[]> {
    const { resourceCapacity } = this.opts;
    return resourceCapacity.listFor(projectId);
  }

  /**
   * The project's resource read (`wbs-resources`): the resources the caller's
   * directory holds, the project's stated capacities and every demand on its
   * work items. Refused as the tree read refuses: null for a project the
   * caller cannot read, alike foreign and absent.
   *
   * Proof: with the scoped branch reading the root catalog, `creates the same
   * name in two organizations, each finding only its own`
   * (resource-organization.controller.db.test.ts) listed both organizations'
   * roots under their opaque names; watched 2026-10-20.
   */
  async resourcesWithin(
    projectId: string,
    access: ResourceAccess,
  ): Promise<{
    resources: Resource[];
    capacities: ResourceCapacity[];
    demands: Demand[];
  } | null> {
    if (!(await this.admits(projectId, access))) return null;
    const { resourceCapacity } = this.opts;
    const resources =
      access.kind === 'scoped'
        ? await this.opts.directory.listInOrganization('resources', access.scope.organizationId)
        : await this.opts.directory.listResources();
    return {
      resources,
      capacities: await resourceCapacity.listFor(projectId),
      demands: await this.opts.demands.listByProject(projectId),
    };
  }

  /**
   * Claims a leaf's steps, or a non-leaf's subtree, for one person under one
   * run: the pure decision is {@link decideClaim}; this reads its inputs, writes
   * the claims and the `in_progress` statements it asks for in one store call,
   * and journals one undoable entry whose undo removes exactly those. A claim
   * neither reads nor writes assignments (D1) unless `assign` asks it to
   * (`wbs-resources` R7): then the claimant becomes the assignee of every step
   * it writes, in the same entry, and undo puts the previous assignees back.
   *
   * `unknown_step` and `unknown_person` answer before the decision; everything
   * else is the decision's one refusal, holders named.
   */
  async claim(
    id: string,
    actorId: string,
    input: ClaimInput,
    access: ResourceAccess,
    credential: CredentialPin | null,
  ): Promise<WorkItemOutcome<Claimed> | ClaimRefusalOutcome> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.value;
    const { claims, identity } = this.claiming();
    const projectId = workItem.projectId;
    const steps = await this.opts.projects.stepsOf(projectId);
    if (input.stepIds?.some((stepId) => !steps.some((each) => each.id === stepId)) === true)
      return { ok: false, reason: 'unknown_step' };
    const lineage = lineageOf(rows, id);
    const near = claimsAround(await claims.listByProject(projectId), id, lineage);
    // Read inside the batch's transaction: the write coordinator admits one
    // batch at a time, so a concurrent claim's units are already here or not
    // yet written (claim-occupancy-race.db.test.ts).
    const occupancy = await claims.occupancyOf(projectId);
    // The holders a `resources_exhausted` names sit on other leaves, beyond `near`.
    const nameOf = await this.personNamesWithin(access, [
      input.personId,
      ...near.map(({ personId }) => personId),
      ...occupancy.map(({ personId }) => personId),
    ]);
    if (!nameOf.has(input.personId)) return { ok: false, reason: 'unknown_person' };
    if (input.resources !== null) {
      const kindOf = new Map(
        (await this.opts.directory.listResources()).map((each) => [each.id, each.kind]),
      );
      for (const asked of input.resources) {
        const kind = kindOf.get(asked.resourceId);
        // The batch refuses a foreign resource first (command-references.ts);
        // this is the legacy and direct caller's guard and the kind's rule, as
        // setDemand's. Proof: with both skipped, `refuses resources naming an
        // absent resource, or more than one unit of an exclusive one`
        // (resource-occupancy.db.test.ts) failed on both stores; watched 2026-10-20.
        if (kind === undefined) return { ok: false, reason: 'unknown_resource' };
        const refusal = refuseDemand(kind, asked.units);
        if (refusal !== null) return { ok: false, reason: refusal };
      }
    }
    const stated = new Map(
      (await this.opts.progress.listByWorkItems(projectId, [id])).map((each) => [
        each.stepId,
        each.state,
      ]),
    );
    const observed = await this.opts.livePlans?.readExecution(projectId, access, null);
    if (observed !== undefined && observed.kind !== 'ready')
      return { ok: false, reason: 'not_found' };
    const execution =
      observed === undefined ? await this.statusReadsOf(projectId, rows) : observed.reads;
    const status = execution.statuses.get(id);
    if (status === undefined) throw new Error(`work item ${id} has no derived status`);
    const admission = new Map(
      steps.map((step) => {
        const key = sliceKey(id, step.id);
        const evidence = execution.evidenceByNode.get(key);
        const eligibility = execution.eligibilityByNode.get(key);
        if (lineage.isLeaf && (evidence === undefined || eligibility === undefined))
          throw new Error(`missing execution reading ${key}`);
        return [
          step.id,
          {
            started: evidence?.started === true,
            canStart: eligibility?.canStart === true,
            blockers:
              eligibility === undefined ? [] : projectExecutionBlockers(eligibility.startBlockers),
          },
        ] as const;
      }),
    );
    const decided = decideClaim({
      admission,
      target: {
        workItemId: id,
        isLeaf: lineage.isLeaf,
        status,
        ancestorIds: lineage.ancestorIds,
        descendantIds: lineage.descendantIds,
        steps: lineage.isLeaf
          ? steps.map((step) => ({ stepId: step.id, progress: stated.get(step.id) ?? 'unknown' }))
          : [],
      },
      caller: {
        accountId: actorId,
        isAdmin: isClaimAdmin(access),
        pinnedPersonId: await identity.pinnedPersonOf(credential),
      },
      claimant: {
        personId: input.personId,
        boundAccountId: await identity.boundAccountOf(input.personId),
      },
      stepIds: input.stepIds,
      runId: input.runId,
      parentClaimId: input.parentClaimId,
      assign: input.assign,
      parentClaim:
        input.parentClaimId === null ? null : await claims.findById(projectId, input.parentClaimId),
      claims: near,
      demand: lineage.isLeaf
        ? (await this.opts.demands.listByProject(projectId))
            .filter((each) => each.workItemId === id)
            .map(({ resourceId, units }) => ({ resourceId, units }))
        : [],
      resources: input.resources,
      capacities: await this.resourceCapacitiesOf(projectId),
      occupancy,
    });
    if (decided.kind === 'refused') return refusalOf(decided.refusal, nameOf);
    if (decided.kind === 'alreadyHeld') {
      const held = near.filter(
        (each) =>
          each.workItemId === id && each.personId === input.personId && each.runId === input.runId,
      );
      return {
        ok: true,
        value: {
          alreadyHeld: true,
          claimIds: held.map((each) => each.id),
          assignedStepIds: [],
          acquired: [],
        },
      };
    }
    // Last of the refusal order (L9): every plan reason and every occupancy
    // refusal has cleared. Only a triple the item does not hold yet adds a
    // bound claim, so a second step under the same person and run adds none.
    // Proof, each watched 2026-10-22 in claim-limit.controller.db.test.ts:
    // with this check moved above `decideClaim`, `answers the plan’s reasons
    // before the cap` and `refuses inside another’s subtree first…` answered
    // claim_limit (10 pass, 3 fail); with every claim counted as adding one,
    // `claims a second step of a held leaf at the cap` was refused (12 pass,
    // 1 fail); with the check removed, `refuses the forty-first bound claim`
    // and five more were applied, the second run of one person among them
    // (7 pass, 6 fail).
    const addsBoundClaim = !near.some(
      (each) =>
        each.workItemId === id && each.personId === input.personId && each.runId === input.runId,
    );
    if (addsBoundClaim) {
      const crossed = await this.refuseBoundClaims(access, 1);
      if (crossed !== null)
        return { ok: false, reason: 'claim_limit', cap: crossed.cap, current: crossed.current };
    }
    const stamp = this.clock.stampFor(actorId);
    const written: Claim[] = decided.drafts.map((draft) => ({
      ...draft,
      id: this.clock.newId(),
      accountId: actorId,
    }));
    const statements = decided.stateInProgress.map((stepId) => ({ workItemId: id, stepId }));
    const copies = written.flatMap((each) =>
      decided.occupancy.map(({ resourceId, units }) => ({ claimId: each.id, resourceId, units })),
    );
    const outcome = await claims.add(written, statements, stamp, copies);
    // Read in this same unit of work a moment ago: a refusal here is the
    // write coordinator failing to serialize, not an outcome to model.
    if (outcome !== 'written') throw new Error(`claim of ${id} was refused at write: ${outcome}`);
    const previous = new Map(
      decided.assignStepIds.length === 0
        ? []
        : (await this.opts.directory.assignmentsFor(id)).map(
            (each) => [each.stepId, each.personId] as const,
          ),
    );
    for (const stepId of decided.assignStepIds) {
      const assigned = await this.opts.directory.assign(id, stepId, input.personId, stamp);
      // The person and the steps were read in this unit of work above.
      if (!assigned.ok)
        throw new Error(`claim of ${id} could not assign ${stepId}: ${assigned.reason}`);
    }
    await this.announceTree(projectId);
    const assigning: CompensatingCommand[] = decided.assignStepIds.map((stepId) => ({
      do: 'assign',
      workItemId: id,
      stepId,
      personId: input.personId,
    }));
    const unassigning: CompensatingCommand[] = decided.assignStepIds.map((stepId) => ({
      do: 'assign',
      workItemId: id,
      stepId,
      personId: previous.get(stepId) ?? null,
    }));
    await this.record(projectId, stamp, 'claim', `claim ${quoteName(workItem.name)}`, {
      forward: oneCommandOf([
        { do: 'add_claims', claims: written, stated: statements, occupancy: copies },
        ...assigning,
      ]),
      // Proof: with `unassigning` left out, `undo clears both the claim and the
      // assignment` (claim-command.test.ts) kept the claimant assigned; watched 2026-10-20.
      inverse: oneCommandOf([
        ...unassigning,
        { do: 'remove_claims', claims: written, cleared: statements },
      ]),
      touched: [id],
      before: rows,
    });
    return {
      ok: true,
      value: {
        alreadyHeld: false,
        claimIds: written.map((each) => each.id),
        assignedStepIds: [...decided.assignStepIds],
        acquired: [...decided.acquired],
      },
    };
  }

  /**
   * Releases one person's claims on a leaf's steps, or their subtree claim on
   * a non-leaf with every delegated claim under it, transitively
   * ({@link decideRelease}). Progress stays as it is; one undoable entry
   * puts every removed claim back verbatim.
   */
  async release(
    id: string,
    actorId: string,
    input: ReleaseInput,
    access: ResourceAccess,
    credential: CredentialPin | null,
  ): Promise<WorkItemOutcome<null> | ClaimRefusalOutcome> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.value;
    const { claims, identity } = this.claiming();
    const projectId = workItem.projectId;
    const steps = await this.opts.projects.stepsOf(projectId);
    if (input.stepIds?.some((stepId) => !steps.some((each) => each.id === stepId)) === true)
      return { ok: false, reason: 'unknown_step' };
    const lineage = lineageOf(rows, id);
    const near = claimsAround(await claims.listByProject(projectId), id, lineage);
    const nameOf = await this.claimantNamesWithin(access, input.personId, near);
    if (!nameOf.has(input.personId)) return { ok: false, reason: 'unknown_person' };
    const decided = decideRelease({
      target: { workItemId: id, isLeaf: lineage.isLeaf },
      caller: {
        accountId: actorId,
        isAdmin: isClaimAdmin(access),
        pinnedPersonId: await identity.pinnedPersonOf(credential),
      },
      claimant: {
        personId: input.personId,
        boundAccountId: await identity.boundAccountOf(input.personId),
      },
      stepIds: input.stepIds,
      claims: near,
    });
    if (decided.kind === 'refused') return refusalOf(decided.refusal, nameOf);
    const stamp = this.clock.stampFor(actorId);
    const removed = [...decided.claims];
    const ids = new Set(removed.map((each) => each.id));
    // What the removed claims held, so the undo puts it back with them; the
    // rows themselves go with their claims.
    // Proof: with `[]` in place of these rows, `undo of a release re-acquires
    // the units` (resource-occupancy.db.test.ts) put the claims back holding
    // nothing, on both stores; watched 2026-10-20.
    const occupancy = (await claims.occupancyOf(projectId))
      .filter((row) => ids.has(row.claimId))
      .map(({ claimId, resourceId, units }) => ({ claimId, resourceId, units }));
    await claims.remove(removed, [], stamp);
    await this.announceTree(projectId);
    await this.record(projectId, stamp, 'release', `release ${quoteName(workItem.name)}`, {
      forward: { do: 'remove_claims', claims: removed, cleared: [] },
      inverse: { do: 'add_claims', claims: removed, stated: [], occupancy },
      touched: [...new Set(removed.map((each) => each.workItemId))],
      before: rows,
    });
    return { ok: true, value: null };
  }

  /**
   * The display names a claim or release may answer with: the claimant's and
   * every holder's among `near`. Under scoped access they are the
   * organization's own names, from its person list, so a person outside the
   * organization reads as unknown; under legacy access they are the root
   * names, read by id. Neither scans the whole directory.
   */
  private claimantNamesWithin(
    access: ResourceAccess,
    claimantId: string,
    near: readonly Claim[],
  ): Promise<Map<string, string>> {
    return this.personNamesWithin(access, [claimantId, ...near.map(({ personId }) => personId)]);
  }

  /** {@link claimantNamesWithin} for any set of person ids. */
  private async personNamesWithin(
    access: ResourceAccess,
    personIds: readonly string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(personIds)];
    const { directory } = this.opts;
    // Proof: with the root `listPeople()` read back in place of both branches,
    // `names the holder by the organization's name` (claim-identity.controller.db.test.ts)
    // read `root-claire`, and `reads only the people a refused claim names`
    // (startable-scope.db.test.ts) saw a `SCAN person`; watched 2026-10-20.
    const people =
      access.kind === 'scoped'
        ? (await directory.listInOrganization('people', access.scope.organizationId)).filter(
            (person) => ids.includes(person.id),
          )
        : await directory.namesOf('people', ids);
    return new Map(people.map((person) => [person.id, person.name]));
  }

  /**
   * Whether `added` more bound claims would cross the organization's cap
   * (`wbs-organization-limits` L9): null when they fit, the cap and count when
   * they do not. Legacy access has no organization to own a cap, so nothing is
   * read and nothing is capped; that is the modeled optional case.
   *
   * The count is read through the gauge of the stores this graph was built
   * over, which for a batch is its own `BEGIN IMMEDIATE` under its write turn
   * (L10), so it includes a claim written earlier in the same batch and the
   * claim of any batch admitted before this one.
   *
   * Proof, each watched 2026-10-22: with legacy access answered as a cap of 0,
   * `claims past any cap with no organization to own one`
   * (claim-limit.controller.db.test.ts) was refused (12 pass, 1 fail); with the gauge answering
   * the count it read first for every later batch (a count read outside the
   * turn), `lands exactly one of two claims racing for the last place`
   * (claim-limit-race.db.test.ts) landed both, 41 of 40.
   *
   * @throws when this graph was composed without organization limits.
   */
  private async refuseBoundClaims(
    access: ResourceAccess,
    added: number,
  ): Promise<LimitCrossed | null> {
    if (access.kind === 'legacy') return null;
    const gauge = this.opts.organizationLimits;
    if (gauge === undefined)
      throw new Error('a bound claim was added under scoped access without organization limits');
    const reading = await gauge.readConcurrentClaimCap(access.scope.organizationId);
    return refuseLimit({ cap: reading.cap, current: reading.current, added });
  }

  /**
   * The bound claims putting `claims` back would add: distinct
   * `(work item, person, run)` triples among them that the project holds no
   * claim of now (L5).
   */
  private async boundClaimsAdded(projectId: string, claims: readonly Claim[]): Promise<number> {
    const tripleOf = (each: Pick<Claim, 'workItemId' | 'personId' | 'runId'>) =>
      JSON.stringify([each.workItemId, each.personId, each.runId]);
    const held = new Set((await this.claiming().claims.listByProject(projectId)).map(tripleOf));
    return new Set(claims.map(tripleOf).filter((triple) => !held.has(triple))).size;
  }

  /**
   * The claim store and the identity reads the claim rules take, or a loud
   * failure in a fixture built without them. Until `person.account_id` lands
   * (task 2.1) the claim store itself answers those reads, so both come from it.
   */
  /**
   * Why putting `command`'s claims back would take units the project no longer
   * has free, as a sentence, or null when it would not: the redo of a claim and
   * the undo of a release re-acquire, so they pass {@link refuseOccupancy} as a
   * fresh claim does (`wbs-resources` R3), leaf by leaf. A refusal reads as
   * `resources_exhausted` would, inside the replay's `stale_undo`.
   *
   * Proof: with this answering null, `redo of a claim is refused
   * resources_exhausted once another leaf took the units`
   * (resource-occupancy.db.test.ts) redid the claim over capacity, on both
   * stores; watched 2026-10-20.
   */
  private async refuseReacquiring(
    projectId: string,
    command: { claims: readonly Claim[]; occupancy?: readonly ClaimOccupancy[] },
    access: ResourceAccess,
  ): Promise<string | null> {
    const asked = command.occupancy ?? [];
    if (asked.length === 0) return null;
    const byId = new Map(command.claims.map((each) => [each.id, each]));
    const askedBy = new Map<string, Map<string, number>>();
    for (const { claimId, resourceId, units } of asked) {
      const leaf = byId.get(claimId)?.workItemId;
      // `readCommand` refused an occupancy naming a claim the entry lacks.
      if (leaf === undefined) throw new Error(`occupancy names claim ${claimId} not replayed`);
      const vector = askedBy.get(leaf) ?? new Map<string, number>();
      vector.set(resourceId, Math.max(vector.get(resourceId) ?? 0, units));
      askedBy.set(leaf, vector);
    }
    const capacities = await this.resourceCapacitiesOf(projectId);
    // Leaf by leaf, each admitted leaf's rows joining the snapshot before the
    // next is checked: one entry may put back several leaves (a cascading
    // release), and units the first re-takes are not free for the second.
    // Proof: with the admitted rows left out of the snapshot, `undo of a
    // cascading release re-acquires leaf by leaf, refused once the second leaf
    // no longer fits` (resource-occupancy.db.test.ts) answered the undo ok, over 8 GB
    // capacity, on both stores; watched 2026-10-20.
    const occupancy: OccupancyRow[] = [...(await this.claiming().claims.occupancyOf(projectId))];
    for (const [workItemId, units] of askedBy) {
      const exhausted = refuseOccupancy({
        workItemId,
        asked: [...units].map(([resourceId, each]) => ({ resourceId, units: each })),
        capacities,
        occupancy,
      });
      if (exhausted === null) {
        for (const row of asked) {
          const claim = byId.get(row.claimId);
          if (claim?.workItemId !== workItemId) continue;
          const { personId, runId } = claim;
          occupancy.push({ ...row, workItemId, personId, runId });
        }
        continue;
      }
      // Named as the caller's directory names it, as {@link resourcesWithin}
      // does: under scoped access the root catalog holds the opaque id.
      // Proof: with the root catalog read here, `names the organization's
      // resource in a refused undo's detail` (resource-organization.controller.db.test.ts)
      // read the opaque id; watched 2026-10-20.
      const catalog =
        access.kind === 'scoped'
          ? await this.opts.directory.listInOrganization('resources', access.scope.organizationId)
          : await this.opts.directory.listResources();
      const resource = catalog.find((each) => each.id === exhausted.resourceId);
      if (resource === undefined)
        throw new Error(`a stated capacity names absent resource ${exhausted.resourceId}`);
      const label = resource.unitLabel === '' ? '' : ` ${resource.unitLabel}`;
      return `resources_exhausted: that needs ${String(exhausted.asked)}${label} of ${quoteName(resource.name)} and ${String(Math.max(exhausted.free, 0))} are free now.`;
    }
    return null;
  }

  /**
   * The claims removing `removed` takes with it: every claim on one of those
   * work items, and every claim delegated under one of those, transitively
   * (the parent reference cascades). Ordered parents first, the order
   * {@link ClaimStore.add} must write them in. A service built without a claim
   * store holds no claims to take.
   */
  private async claimsGoingWith(
    projectId: string,
    removed: readonly string[],
  ): Promise<ClaimsTaken> {
    const { claims } = this.opts;
    if (claims === undefined) return { claims: [], occupancy: [] };
    const stored = await claims.listByProject(projectId);
    const owners = new Set(removed);
    const going = new Set(
      stored.filter(({ workItemId }) => owners.has(workItemId)).map(({ id }) => id),
    );
    // Proof: with this closure skipped, `undo of a promoting delete puts back
    // the subtree claim and the claims delegated under it`
    // (resource-occupancy.db.test.ts) lost the delegated claim on both stores;
    // watched 2026-10-20.
    let grew = true;
    while (grew) {
      grew = false;
      for (const each of stored) {
        if (going.has(each.id) || each.parentClaimId === null || !going.has(each.parentClaimId))
          continue;
        going.add(each.id);
        grew = true;
      }
    }
    const ordered: Claim[] = [];
    const placed = new Set<string>();
    const pending = stored.filter(({ id }) => going.has(id));
    while (pending.length > 0) {
      const ready = pending.findIndex(
        ({ parentClaimId }) =>
          parentClaimId === null || !going.has(parentClaimId) || placed.has(parentClaimId),
      );
      if (ready === -1) throw new Error('the stored claims delegate in a cycle');
      const [next] = pending.splice(ready, 1);
      ordered.push(next);
      placed.add(next.id);
    }
    const occupancy = (await claims.occupancyOf(projectId))
      .filter(({ claimId }) => going.has(claimId))
      .map(({ claimId, resourceId, units }) => ({ claimId, resourceId, units }));
    return { claims: ordered, occupancy };
  }

  /**
   * Refuses a replay naming a step the project no longer holds: every step
   * {@link referencesOf} reads off `command` (progress, assignments, attempts,
   * blockages, claims). Removing a step with `cascade` takes only the rows it
   * can see; the ones an undo is about to put back are in the journal.
   */
  private async stepRemovedSince(
    projectId: string,
    command: CompensatingCommand,
  ): Promise<ApplyOutcome | null> {
    const named = referencesOf(command).steps;
    if (named.length === 0) return null;
    const held = new Set((await this.opts.projects.stepsOf(projectId)).map(({ id }) => id));
    const gone = named.find((stepId) => !held.has(stepId));
    return gone === undefined
      ? null
      : { ok: false, detail: `step ${gone} has been removed from this project since.` };
  }

  private claiming(): { claims: ClaimStore; identity: ClaimIdentity } {
    const { claims } = this.opts;
    if (claims === undefined)
      throw new Error('this work-item service was built without a claim store');
    return { claims, identity: claims };
  }

  /**
   * Every work item's derived status, by the folds the plan read uses: progress
   * rolled up over worked steps and running attempts, then
   * {@link workItemStatusesOf} over the project's own dependency edges.
   */
  private async statusesOf(
    projectId: string,
    rows: readonly LabelledWorkItem[],
  ): Promise<Map<string, WorkItemStatus>> {
    return (await this.statusReadsOf(projectId, rows)).statuses;
  }

  /**
   * {@link statusesOf} with the reads it folded, so a caller that needs the
   * same progress statements and dependency edges reads them once.
   */
  private async statusReadsOf(projectId: string, rows: readonly LabelledWorkItem[]) {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) throw new Error(`execution project ${projectId} is missing`);
    const steps = await this.opts.projects.stepsOf(projectId);
    const stated = await this.opts.progress.listByProject(projectId);
    const attempted = await this.opts.attempts.listByProject(projectId);
    const estimates = await this.opts.estimates.listByProject(projectId);
    const actuals = await this.opts.actuals.listByProject(projectId);
    const blockages = await this.opts.blockages.listByProject(projectId);
    const dependencies = {
      edges: await this.opts.dependencies.listByProject(projectId),
      typed: await this.opts.typedDependencies.listByProject(projectId),
    };
    const authored = resolveConnectedDependencyGraph({
      projects: [
        {
          projectId,
          state: {
            rows,
            steps,
            estimates,
            legacy: dependencies.edges,
            typed: dependencies.typed,
            reach: project.depReach,
          },
        },
      ],
      external: [],
    });
    const readiness = deriveExecutionReadiness(
      [
        {
          projectId,
          reads: {
            workItems: rows,
            steps,
            progress: stated,
            stepBlockages: blockages,
            estimates,
            actuals,
            dependencies: dependencies.edges,
          },
        },
      ],
      dependencies.typed,
      authored,
      new Map([[projectId, attempted]]),
    );
    return { ...readiness, statuses: new Map(readiness.statuses), stated, dependencies };
  }

  /**
   * Reparents the subtree. Retained destination step parallel facts refuse before
   * stamping or mutation; selected corrupt facts throw even on existing parents.
   * Clears unrelated destination leaf statements and resource demands before
   * the store move; the moved row keeps its own demands. Incoming facts stay with their owners. A last-child departure
   * hands up direct blockage only when every former leaf has that step fact,
   * using the latest blocked time even when negative or retained beneath done.
   * Progress is never handed up. Exact preexisting old-parent progress remains
   * in place across replay; changed or missing snapshot facts refuse undo.
   * Undo restores destination progress through
   * the existing statement replay and restores blockage timestamps exactly.
   */
  async move(
    id: string,
    actorId: string,
    input: MoveWorkItem,
    access: ResourceAccess,
  ): Promise<
    | WorkItemOutcome<null>
    | { ok: false; reason: 'referenced_by_step_parallel'; nodes: readonly StepNodeRef[] }
    | { ok: false; reason: 'destination_claimed'; holders: readonly NamedClaimHolder[] }
  > {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.value;

    // A frozen work item moves like any other since ADR 0023. The refusal that
    // stood here read "a frozen number has left the tool — it is in someone's
    // ticket", which is true and is why the *number* travels with the row
    // unchanged; it was never a reason the row could not be somewhere else.
    // What the refusal actually protected was `deriveNumbers`' anchor walk,
    // which needed frozen labels to ascend along position — and that walk is
    // gone.

    // Same reason as in `create`: a parent outside this project detaches the row
    // from every root here.
    if (input.parentId !== null && !rows.some((row) => row.id === input.parentId)) {
      return { ok: false, reason: 'not_found' };
    }

    // Moving a work item beneath itself detaches its whole subtree from every
    // root: the rows survive, no number can be derived for them, and the project
    // reads as though the work vanished.
    if (input.parentId !== null && isWithin(parentIndexOf(rows), input.parentId, id)) {
      return { ok: false, reason: 'cycle' };
    }

    // The dependencies already drawn must survive the new parent. Decided
    // here, on rows and edges read inside this write's lock, because the drag
    // preview is a client's guess and a direct command skips it entirely.
    const edges = await this.opts.dependencies.listByProject(workItem.projectId);
    const broken = canReparent(rows, edges, id, input.parentId);
    // Proof: this return disabled, the mounted `answers 409 ancestor for a move
    // under its own predecessor…` and `answers 409 cycle for a move whose
    // expanded graph loops…` both failed on `Received: 200` — the direct
    // command reparented. Watched 2026-09-27.
    if (broken !== null) return { ok: false, reason: broken };
    if (input.parentId !== workItem.parentId) {
      const authored = await this.opts.typedDependencies.listByProject(workItem.projectId);
      const oldParent = workItem.parentId;
      const stranded =
        oldParent !== null && rows.filter((row) => row.parentId === oldParent).length === 1
          ? authored.filter((dependency) =>
              [dependency.predecessor, dependency.successor].some(
                (endpoint) =>
                  endpoint.scope === 'descendant-step' && endpoint.workItemId === oldParent,
              ),
            )
          : [];
      // Proof: skipping this refusal made mounted last-child move answer 500
      // instead of 409 with the relationship id; watched 2026-09-27.
      if (stranded.length > 0) {
        return {
          ok: false,
          reason: 'descendant_step_on_leaf',
          dependencyIds: stranded.map((row) => row.id),
        };
      }
      const newParent = input.parentId;
      const pinned =
        newParent !== null && !rows.some((row) => row.parentId === newParent)
          ? authored.filter((dependency) =>
              [dependency.predecessor, dependency.successor].some(
                (endpoint) => endpoint.scope === 'node' && endpoint.workItemId === newParent,
              ),
            )
          : [];
      // Proof: bypassing this check made mounted move onto a node-pinned leaf
      // answer 500 instead of 409 with its relationship id; watched 2026-09-27.
      if (pinned.length > 0) {
        return { ok: false, reason: 'node_on_parent', dependencyIds: pinned.map((row) => row.id) };
      }
    }

    // Proof: omitted guard/wrong moving owner accepted retained pairs; project-wide
    // selection refused incoming-subtree policy. Lookup before actor/membership
    // leaked the poisoned reader; swallowing it resolved the required failure.
    // Skipping existing parents missed selected corruption; lost nodes failed exact
    // mounted 409. Empty admitted reads committed the preceding patch. Moving this
    // below stamp allocation spent a stamp on refusal (all watched 2026-10-17).
    if (input.parentId !== null) {
      const parallels = await this.opts.stepParallels.listByWorkItems(workItem.projectId, [
        input.parentId,
      ]);
      if (parallels.length > 0) {
        return {
          ok: false,
          reason: 'referenced_by_step_parallel',
          nodes: parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId })),
        };
      }
    }

    // A leaf whose steps are claimed is somebody's work in progress; the moved
    // row is other work, so it does not take those claims over (they would be
    // stranded on a parent, where nothing reaches them) and the move is refused
    // until they are released (`wbs-team-claims` D3: a blocker is resolved, not
    // worked around). A fixture built without a claim store holds no claims.
    // Proof: with this refusal disabled, `refuses a move under a claimed leaf,
    // naming its holders, until they are released` (claim-command.test.ts)
    // answered ok: the move went through over the claim; watched 2026-10-20.
    if (
      input.parentId !== null &&
      this.opts.claims !== undefined &&
      !rows.some((row) => row.parentId === input.parentId)
    ) {
      const destinationId = input.parentId;
      const held = (await this.opts.claims.listByProject(workItem.projectId)).filter(
        (each) => each.workItemId === destinationId && each.stepId !== null,
      );
      if (held.length > 0) {
        const nameOf = await this.personNamesWithin(
          access,
          held.map(({ personId }) => personId),
        );
        return {
          ok: false,
          reason: 'destination_claimed',
          holders: held.map(({ id: claimId, personId, runId }) => {
            const name = nameOf.get(personId);
            if (name === undefined) throw new Error(`claim ${claimId} names an absent person`);
            return { claimId, personId, name, runId };
          }),
        };
      }
    }

    // Where it was, read before it leaves: the sibling it sat directly after,
    // or null when it was first. That is the shape `move` takes, so the
    // inverse is the same command with the arguments it had before.
    const wasAfter = this.groupUnder(rows, workItem.parentId)
      .filter((sibling) => sibling.id !== id && sibling.position < workItem.position)
      .sort((a, b) => a.position - b.position)
      .at(-1);

    const group = this.groupUnder(rows, input.parentId).filter((sibling) => sibling.id !== id);
    const placed = placeAfter(group, input.afterId);
    // Proof: bypassing this call failed `connected move refuses an injected failed graph read`
    // at the actual SQLite refusal assertion; unchanged tables also checked (2026-10-22).
    const structural = await this.structuralRefusal(workItem.projectId, actorId, {
      rows: rows.map((row) => (row.id === id ? { ...row, parentId: input.parentId } : row)),
    });
    if (structural !== null) return structural;
    const stamp = this.clock.stampFor(actorId);
    // A leaf another row moves under becomes a parent, and a parent holds no
    // readiness or hold: its status is folded from its children. The moved row
    // is other work, so the statements are cleared rather than handed to it.
    const becomesParent =
      input.parentId !== null &&
      workItem.parentId !== input.parentId &&
      !rows.some((row) => row.parentId === input.parentId && row.id !== id)
        ? rows.find((row) => row.id === input.parentId)
        : undefined;
    const statementsCleared =
      becomesParent !== undefined &&
      (becomesParent.readiness !== null || becomesParent.hold !== null)
        ? {
            forward: {
              do: 'patch' as const,
              workItemId: becomesParent.id,
              patch: { readiness: null, hold: null },
            },
            inverse: {
              do: 'patch' as const,
              workItemId: becomesParent.id,
              patch: { readiness: becomesParent.readiness, hold: becomesParent.hold },
            },
          }
        : undefined;
    // The parent the row leaves, when it was that parent's last child, becomes a
    // leaf again and takes the statements every leaf it held agreed on, as a
    // last-child delete does.
    const leftParentId =
      workItem.parentId !== null &&
      workItem.parentId !== input.parentId &&
      rows.filter((row) => row.parentId === workItem.parentId).length === 1
        ? workItem.parentId
        : null;
    const movedLeaves = subtreeOf(rows, id)
      .map((each) => rowOf(rows, each))
      .filter((row) => !rows.some((child) => child.parentId === row.id));
    const leftAgreed =
      leftParentId === null
        ? undefined
        : {
            readiness: agreedOn(movedLeaves.map((row) => row.readiness)),
            hold: agreedOn(movedLeaves.map((row) => row.hold)),
          };
    const statementsHandedUp =
      leftParentId !== null &&
      leftAgreed !== undefined &&
      (leftAgreed.readiness !== null || leftAgreed.hold !== null)
        ? {
            forward: { do: 'patch' as const, workItemId: leftParentId, patch: leftAgreed },
            inverse: {
              do: 'patch' as const,
              workItemId: leftParentId,
              patch: { readiness: null, hold: null },
            },
          }
        : undefined;
    // Proof: omitting the captured allowance refused immediate mounted historical undo; watched 2026-10-14.
    const leftProgress =
      leftParentId === null
        ? undefined
        : await this.opts.progress.listByWorkItems(workItem.projectId, [leftParentId]);
    const destinationProgress =
      becomesParent === undefined
        ? []
        : await this.opts.progress.listByWorkItems(workItem.projectId, [becomesParent.id]);
    const destinationBlockages =
      becomesParent === undefined
        ? []
        : await this.opts.blockages.listByWorkItems(workItem.projectId, [becomesParent.id]);
    // And its resource demands (`wbs-resources`): a parent's demand charges
    // nothing, and the moved row is other work that keeps its own demand and
    // never inherits this one. Cleared with the statements, put back on undo.
    // A claimed destination was refused above, so no occupancy rides on it.
    const destinationDemands =
      becomesParent === undefined
        ? []
        : (await this.opts.demands.listByProject(workItem.projectId)).filter(
            ({ workItemId }) => workItemId === becomesParent.id,
          );
    const clearDestinationDemands: CompensatingCommand[] = destinationDemands.map(
      ({ workItemId, resourceId }) => ({ do: 'set_demand', workItemId, resourceId, units: null }),
    );
    const restoreDestinationDemands: CompensatingCommand[] = destinationDemands.map(
      ({ workItemId, resourceId, units }) => ({ do: 'set_demand', workItemId, resourceId, units }),
    );
    const movedBlockages =
      leftParentId === null
        ? []
        : await this.opts.blockages.listByWorkItems(
            workItem.projectId,
            movedLeaves.map(({ id }) => id),
          );
    const handedBlockages: StoredStepBlockage[] = [];
    if (leftParentId !== null) {
      for (const step of await this.opts.projects.stepsOf(workItem.projectId)) {
        const facts = movedBlockages.filter(({ stepId }) => stepId === step.id);
        // Proof: accepting any direct fact failed the missing-former-leaf regression; watched 2026-10-14.
        if (movedLeaves.every((leaf) => facts.some(({ workItemId }) => workItemId === leaf.id))) {
          handedBlockages.push({
            workItemId: leftParentId,
            stepId: step.id,
            blockedAt: Math.max(...facts.map(({ blockedAt }) => blockedAt)),
          });
        }
      }
    }
    const clearDestinationProgress: CompensatingCommand[] = destinationProgress.map(
      ({ workItemId, stepId }) => ({ do: 'clear_progress', workItemId, stepId }),
    );
    const restoreDestinationProgress: CompensatingCommand[] = destinationProgress.map(
      ({ workItemId, stepId, state }) => ({ do: 'set_progress', workItemId, stepId, state }),
    );
    const planBlockageReplacements = (
      facts: readonly StoredStepBlockage[],
      isClear: boolean,
    ): CompensatingCommand[] =>
      facts.map(({ workItemId, stepId, blockedAt }) => ({
        do: 'replace_blockage',
        workItemId,
        stepId,
        expectedBlockedAt: isClear ? blockedAt : null,
        replacementBlockedAt: isClear ? null : blockedAt,
      }));
    const clearDestinationBlockages = planBlockageReplacements(destinationBlockages, true);
    const restoreDestinationBlockages = planBlockageReplacements(destinationBlockages, false);
    const setHandedBlockages = planBlockageReplacements(handedBlockages, false);
    const clearHandedBlockages = planBlockageReplacements(handedBlockages, true);
    // Cleared **before** the move, so no read between the two writes sees a
    // parent holding a statement (Fable review, I1). Moved after the move,
    // `no read sees a parent holding a statement while a row moves under a
    // leaf` failed on the read taken between the two writes; watched 2026-09-29.
    if (statementsCleared !== undefined) {
      // Proof: this write skipped made `clears the readiness and hold of a leaf
      // another row moves under…` fail on `parent … holds a readiness or a
      // hold`; watched 2026-09-29.
      const cleared = await this.apply(workItem.projectId, statementsCleared.forward, stamp);
      if (!cleared.ok) throw new Error(`cannot clear the new parent: ${cleared.detail}`);
    }
    // Proof: skipping clears failed the pre-store-move destination ownership assertions; watched 2026-10-14.
    // Proof: the demand clears skipped, `clears the demand of an unclaimed leaf
    // another row moves under…` (resource-occupancy.db.test.ts) read the demand
    // still on the new parent, on both stores; watched 2026-10-20.
    for (const command of [
      ...clearDestinationProgress,
      ...clearDestinationBlockages,
      ...clearDestinationDemands,
    ]) {
      const cleared = await this.apply(workItem.projectId, command, stamp);
      // Proof: removing this refusal failed `reports a refused move destination clear before reparenting`; watched 2026-10-14.
      if (!cleared.ok) throw new Error(`cannot clear move destination: ${cleared.detail}`);
    }
    await this.opts.workItems.move(id, input.parentId, placed.position, placed.renumbered, stamp);
    if (statementsHandedUp !== undefined) {
      // Proof: this write skipped made `gives the parent a moved last child
      // leaves the statements it agreed on` fail on `readiness: null` where
      // `ready` was owed; watched 2026-09-29.
      const handed = await this.apply(workItem.projectId, statementsHandedUp.forward, stamp);
      if (!handed.ok) throw new Error(`cannot hand statements up: ${handed.detail}`);
    }
    // Proof: skipping these writes failed unanimous hand-up, including negative timestamps and done facts; watched 2026-10-14.
    for (const command of setHandedBlockages) {
      const handed = await this.apply(workItem.projectId, command, stamp);
      // Proof: removing this refusal made `reports a refused move blockage hand-up` resolve; watched 2026-10-14.
      if (!handed.ok) throw new Error(`cannot hand move blockage up: ${handed.detail}`);
    }
    const forwardSteps: CompensatingCommand[] = [
      ...(statementsCleared === undefined ? [] : [statementsCleared.forward]),
      ...clearDestinationProgress,
      // Proof: omitting replay clears failed mounted exact move redo; watched 2026-10-14.
      ...clearDestinationBlockages,
      // Proof: omitted, the same test's read after the redo found a demand on
      // the parent again, on both stores; watched 2026-10-20.
      ...clearDestinationDemands,
      { do: 'move', workItemId: id, parentId: input.parentId, afterId: input.afterId },
      ...(statementsHandedUp === undefined ? [] : [statementsHandedUp.forward]),
      ...setHandedBlockages,
    ];
    // Proof: restoring destination statements before moving back refused undo;
    // clearing old-parent statements after moving back exposed a parent statement
    // in the intermediate read. Both ordering regressions were watched 2026-09-29.
    const inverseSteps: CompensatingCommand[] = [
      ...clearHandedBlockages,
      ...(statementsHandedUp === undefined ? [] : [statementsHandedUp.inverse]),
      {
        do: 'move',
        workItemId: id,
        parentId: workItem.parentId,
        afterId: wasAfter?.id ?? null,
        ...(leftProgress === undefined ? {} : { expectedProgress: leftProgress }),
      },
      ...restoreDestinationProgress,
      // Proof: omitting restoration failed mounted exact move undo; watched 2026-10-14.
      ...restoreDestinationBlockages,
      // Proof: omitted, the same test's undo read no demand on the leaf again,
      // on both stores; watched 2026-10-20.
      ...restoreDestinationDemands,
      ...(statementsCleared === undefined ? [] : [statementsCleared.inverse]),
    ];
    await this.announceTree(workItem.projectId);
    await this.record(workItem.projectId, stamp, 'move', `move ${quoteName(workItem.name)}`, {
      forward: { do: 'batch', steps: forwardSteps },
      inverse: { do: 'batch', steps: inverseSteps },
      touched: [
        id,
        ...(becomesParent === undefined ? [] : [becomesParent.id]),
        ...(leftParentId === null ? [] : [leftParentId]),
      ],
      moveProgressOwners: [...new Set(destinationProgress.map(({ workItemId }) => workItemId))],
      before: rows,
    });
    return { ok: true, value: null };
  }

  /**
   * Copies a work item and everything beneath it, as the next sibling of the
   * original.
   *
   * One write, on the server, because the alternative is the client replaying
   * a create and a patch per row: every intermediate state published to
   * everybody watching, a refetch each time, and copied dependencies still
   * pointing at the originals.
   *
   * What the copy carries, and what it deliberately does not, is in
   * `openspec/changes/duplicate-subtree/specs/wbs-domain/spec.md`. Two of
   * those rules are load-bearing enough to repeat here:
   *
   * - **No frozen numbers.** A frozen number is an identity that has left the
   *   tool — it is in somebody's ticket, which is why {@link move} refuses a
   *   frozen row. Two rows answering one ticket is the failure freezing
   *   exists to prevent. The original is untouched, so a frozen work item can
   *   still be duplicated: copying is not moving.
   * - Legacy dependencies copy only when both ends are inside. Typed prerequisites
   *   copy with their successor: internal endpoints remap, outside predecessors
   *   retain their authorized scoped identity, and every copied link has a new ID.
   *   Outgoing links to successors outside the subtree stay with their original.
   *
   * Direct step blockage belongs to the original work and is omitted from copies.
   * Proof: injecting copied facts failed the blocked leaf/descendant regression;
   * watched 2026-10-14.
   *
   * Refuses `too_large` past {@link MAX_DUPLICATED_ROWS}. Then reads all original
   * subtree owners through the required admitted sparse reader; retained policy
   * refuses with detached ordered nodes before IDs, stamps or writes. Malformed
   * or unreadable selected evidence throws; unrelated policy keeps its owners.
   */
  async duplicate(
    id: string,
    actorId: string,
  ): Promise<
    | WorkItemOutcome<{ id: string }>
    | { ok: false; reason: 'referenced_by_step_parallel'; nodes: readonly StepNodeRef[] }
  > {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.value;

    // Ancestors-first, which is the order the copies have to be written in:
    // `parent_id` references a row that must already be there.
    const originals = subtreeOf(rows, id);
    if (originals.length > MAX_DUPLICATED_ROWS) return { ok: false, reason: 'too_large' };

    // Proof: omitted/root-only/wrong-project/broad/leaves-only reads failed retained,
    // nested, parent-corruption and unrelated-policy production cases. Early reads
    // failed auth/size precedence; catch/optional defaults accepted required failures.
    // Late IDs/stamps/writes failed zero-allocation snapshots; reversed/lost nodes
    // and aliased facts failed exact detached refusal tests. Public graph selection
    // committed the admitted-policy mixed batch (all watched 2026-10-17).
    const parallels = await this.opts.stepParallels.listByWorkItems(workItem.projectId, originals);
    if (parallels.length > 0) {
      return {
        ok: false,
        reason: 'referenced_by_step_parallel',
        nodes: parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId })),
      };
    }

    const newIds = new Map(originals.map((originalId) => [originalId, this.clock.newId()]));
    /**
     * The copy of one original. Throws rather than defaulting: an id that was
     * not copied means the map and the subtree disagree, and carrying the
     * original's id through would wire the copy to the row it was copied from.
     */
    const copyOf = (originalId: string): string => {
      const copied = newIds.get(originalId);
      if (copied === undefined) throw new Error(`no copy was generated for ${originalId}`);
      return copied;
    };
    /**
     * A descendant's parent, which is always another row of the same subtree.
     * A null here would mean `subtreeOf` returned a second root.
     */
    const parentInside = (source: WorkItem): string => {
      if (source.parentId === null)
        throw new Error(`${source.id} is below the root but parentless`);
      return source.parentId;
    };
    const sourceOf = new Map(rows.map((row) => [row.id, row]));
    const inside = new Set(originals);

    const placed = placeAfter(this.groupUnder(rows, workItem.parentId), id);
    const copies = originals.map((originalId, index) => {
      const source = sourceOf.get(originalId);
      if (source === undefined) throw new Error(`${originalId} is not a row of this project`);
      const isRoot = index === 0;
      return {
        ...source,
        id: copyOf(originalId),
        // The root keeps the original's parent — it is its sibling. Everything
        // below hangs off the copy of its own parent, never the original's.
        parentId: isRoot ? source.parentId : copyOf(parentInside(source)),
        // Descendants keep their positions: their whole sibling group is
        // copied with them, so the order survives and stays distinct.
        position: isRoot ? placed.position : source.position,
        // Only the root is renamed. Its children are already told apart by the
        // parent above them, and suffixing every one of them would rewrite a
        // branch nobody asked to rename.
        name: isRoot ? `${source.name}${COPY_SUFFIX}` : source.name,
        frozenNumber: null,
        // A copy has not happened. The original's facts are a record of work
        // that was done once; the copy is new work with no start and no end, and
        // no statements either (`step_progress` is not copied, below). ADR 0024.
        factStart: null,
        factEnd: null,
        // A copy has a definition, not a history: it keeps the original's
        // readiness and never its hold (`add-work-item-statuses`).
        // Proof: this line removed made `copies a readiness and never a hold`
        // fail on `hold: "on_hold"`; watched 2026-09-29.
        hold: null,
        // Not the original's count. A copy is a new row that has never been
        // changed, and carrying the original's revision across would have a
        // reader's precondition on one row pass against the other.
        revision: 0,
      };
    });

    const stored = await this.opts.estimates.listByProject(workItem.projectId);
    const assigned = await this.opts.directory.assignmentsOf(originals);
    const edges = await this.opts.dependencies.listByProject(workItem.projectId);
    const typed = await this.opts.typedDependencies.listByProject(workItem.projectId);

    const copiedEstimates = stored
      .filter((each) => inside.has(each.workItemId))
      .map((each) => ({ ...each, workItemId: copyOf(each.workItemId) }));
    // **The one collection a duplicate filters by metric rather than taking
    // whole or leaving whole**, and the first place the single discriminated
    // table costs something rather than saving it. A `token_estimate` is a
    // description of the work, so it copies for the days estimate's reason: a
    // copy planned in days and not in tokens is half-planned, and the reader can
    // see the gap. `token_actual` and `hours_actual` are records of what one
    // particular piece of work cost, so they do not copy for the actuals'
    // reason. Every other structural rule in this file applies to a table;
    // this one applies to rows inside one. Design D1, D8.
    const copiedMeasures = (await this.opts.measures.listByProject(workItem.projectId))
      .filter((each) => inside.has(each.workItemId) && each.metric === 'token_estimate')
      .map((each) => ({ ...each, workItemId: copyOf(each.workItemId) }));
    const copiedAssignments = assigned.map((each) => ({
      ...each,
      workItemId: copyOf(each.workItemId),
    }));
    // A demand describes the work, so it copies for the estimates' reason: same
    // resources, same units. A claim and its occupancy do not: they are who is
    // doing the original, and nobody is doing the copy yet.
    // Proof: with the copy's list emptied, `duplicate copies the demands with
    // the subtree` (resource-occupancy.db.test.ts) read no copied demand on
    // both stores; watched 2026-10-20.
    const copiedDemands = (await this.opts.demands.listByProject(workItem.projectId))
      .filter((each) => inside.has(each.workItemId))
      .map((each) => ({ ...each, workItemId: copyOf(each.workItemId) }));
    const copiedEdges = edges
      .filter((edge) => inside.has(edge.predecessorId) && inside.has(edge.successorId))
      .map((edge) => ({
        id: this.clock.newId(),
        projectId: edge.projectId,
        predecessorId: copyOf(edge.predecessorId),
        successorId: copyOf(edge.successorId),
      }));
    const selection = {
      sourceProjectId: workItem.projectId,
      destinationProjectId: workItem.projectId,
      workItemIds: newIds,
      stepIds: new Map(
        (await this.opts.projects.stepsOf(workItem.projectId)).map((step) => [step.id, step.id]),
      ),
    };
    const selected = selectCopiedDependencies(typed, selection);
    const checked = await withDependencyContext(
      this.opts.dependencyContext,
      workItem.projectId,
      actorId,
      async (dependencyContext) => {
        // Proof: skipping source evidence changed the absent-row copy's modeled
        // refusal into a later recording throw; watched 2026-10-22.
        const evidence = await this.typedEvidence(dependencyContext, workItem.projectId, selected);
        if (!evidence.ok) return evidence;
        // Proof: bypassing current capability made the production mounted dormant
        // copy return 200 instead of 409 with zero expected changes, 2026-10-22.
        if (
          selected.some((dependency) => dependency.predecessor.projectId !== workItem.projectId) &&
          !permitsExternalDependencies(this.opts.externalDependencyAuthoring)
        )
          return { ok: false as const, reason: 'external_dependencies_inactive' as const };
        return evidence;
      },
    );
    if (!checked.ok) return checked;
    const copiedTyped = selected.map((dependency) =>
      remapCopiedDependency(dependency, selection, this.clock.newId()),
    );

    // Proof: bypassing this call failed `connected duplicate refuses an injected failed graph read`
    // at the actual SQLite refusal assertion; unchanged tables also checked (2026-10-22).
    const structural = await this.structuralRefusal(workItem.projectId, actorId, {
      rows: [...rows, ...copies],
      estimates: [...stored, ...copiedEstimates],
      legacy: [...edges, ...copiedEdges],
      typed: [...typed, ...copiedTyped],
    });
    if (structural !== null) return structural;
    // One stamp for the copy: it is one transaction and one act, so
    // every row it writes — work items, estimates, measures, assignments, dependencies
    // and the respacing of the originals' siblings — carries one instant.
    const stamp = this.clock.stampFor(actorId);
    await this.opts.subtrees.insertSubtree(
      {
        rows: copies,
        respaced: placed.renumbered,
        reparented: [],
        estimates: copiedEstimates,
        // **Deliberately empty.** A duplicate is work that has not been done:
        // copying the original's actuals would tell the plan a fortnight nobody
        // has worked was already spent, and the copy would appear with a variance
        // as though it were finished. Estimates copy because an estimate
        // describes work; actuals do not because an actual records a week. See
        // `openspec/changes/actual-days/design.md` D5.
        actuals: [],
        // **Deliberately empty, and for a stronger reason than the actuals.** A
        // copied `done` would hand the plan a branch that reports itself finished
        // the moment it appears — work nobody has started, drawn as work nobody
        // needs to do. See `design.md` P4.
        progress: [],
        // The token plan and neither record — see {@link copiedMeasures} above.
        measures: copiedMeasures,
        assignments: copiedAssignments,
        demands: copiedDemands,
        dependencies: copiedEdges,
        removedEstimates: [],
        removedActuals: [],
        removedProgress: [],
        removedMeasures: [],
      },
      stamp,
    );
    for (const dependency of copiedTyped) {
      await this.opts.typedDependencies.add(dependency, stamp);
    }
    // Once, at the end. The copy renumbers rows it never touched — every later
    // sibling of the original, at every level — so it is the whole tree rather
    // than the rows that were written.
    await this.announceTree(workItem.projectId);
    const copyIds = copies.map((copy) => copy.id);
    const restore: CompensatingCommand = {
      do: 'restore_subtree',
      rows: copies,
      rootPosition: placed.position,
      reparented: [],
      estimates: copiedEstimates,
      actuals: [],
      progress: [],
      measures: copiedMeasures,
      assignments: copiedAssignments,
      demands: copiedDemands,
      internalDependencies: copiedEdges,
      externalDependencies: [],
      removedEstimates: [],
      removedActuals: [],
      removedProgress: [],
      removedMeasures: [],
    };
    const deleteCopy: CompensatingCommand = {
      do: 'delete_subtree',
      rootId: copyOf(id),
      expectedSubtree: copyIds,
      remove: copyIds,
      reparented: [],
      setEstimates: [],
      setActuals: [],
      setProgress: [],
      setMeasures: [],
    };
    await this.record(
      workItem.projectId,
      stamp,
      'duplicate',
      `duplicate ${quoteName(workItem.name)}`,
      {
        forward:
          copiedTyped.length === 0
            ? restore
            : {
                do: 'batch',
                steps: [
                  restore,
                  ...copiedTyped.map((dependency) => ({
                    do: 'add_typed_dependency' as const,
                    dependency,
                  })),
                ],
              },
        inverse:
          copiedTyped.length === 0
            ? deleteCopy
            : {
                do: 'batch',
                steps: [
                  ...copiedTyped.map((dependency) => ({
                    do: 'remove_typed_dependency' as const,
                    dependency,
                  })),
                  deleteCopy,
                ],
              },
        // Proof: dropping retained local predecessors failed the mounted copy's
        // exact from[X] revision and touched-identity assertions, 2026-10-22.
        touched: [
          ...new Set([
            ...copyIds,
            ...copiedTyped
              .flatMap((dependency) => [dependency.predecessor, dependency.successor])
              .filter((endpoint) => endpoint.projectId === workItem.projectId)
              .map((endpoint) => endpoint.workItemId),
          ]),
        ],
        before: rows,
        // Proof: dropping this evidence made the admitted semantic copy throw
        // journal external revision coverage is not exact; watched 2026-10-22.
        externalBefore: checked.externalBefore,
      },
    );
    return { ok: true, value: { id: copyOf(id) } };
  }

  /**
   * Refuses retained sparse facts on the exact removed owners before stamping or
   * writes; promote retains child owners. Corrupt or unreadable facts throw.
   * Command scopes own atomic rollback until sparse snapshot/history support exists.
   *
   * A delete that promotes the parent back to a leaf hands the deleted leaf's
   * claims up with its other step facts (`wbs-team-claims`), ids, parents and
   * occupancy kept, and the undo hands them back down. It is refused
   * `children_claimed`, naming every holder, when claims sit on more than one
   * deleted row or on the parent itself: two leaves' step claims would clash on
   * the parent's (work item, step) key, a claim delegated under a deleted
   * subtree claim would go with it, and the undo could not tell a parent's own
   * subtree claim from the claims it was handed. `access` names the holders.
   */
  async remove(
    id: string,
    actorId: string,
    strategy: DeleteStrategy | null,
    access: ResourceAccess,
  ): Promise<
    | WorkItemOutcome<null>
    | { ok: false; reason: 'referenced_by_step_parallel'; nodes: readonly StepNodeRef[] }
    | { ok: false; reason: 'children_claimed'; holders: readonly NamedClaimHolder[] }
  > {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.value;

    const children = rows
      .filter((row) => row.parentId === id)
      .sort((a, b) => a.position - b.position);
    // A parent carries work below it that the caller may not have on screen, so
    // which of the two things they meant is theirs to say.
    if (children.length > 0 && strategy === null) return { ok: false, reason: 'strategy_required' };

    // Proof: omission/root-only/wrong-owner/project and broad selection each failed
    // exact leaf/cascade or promote-policy tests; early lookup broke missing/auth/
    // strategy precedence, and late lookup changed the statement snapshot, 2026-10-17.
    const doomed = children.length === 0 || strategy === 'cascade' ? subtreeOf(rows, id) : [id];
    const incidents = await this.deletionIncidents(workItem.projectId, actorId, doomed);
    if (!incidents.ok) return incidents;
    const parallels = await this.opts.stepParallels.listByWorkItems(workItem.projectId, doomed);
    if (parallels.length > 0) {
      return {
        ok: false,
        reason: 'referenced_by_step_parallel',
        // Proof: empty details and getter aliases independently failed detached
        // exact-node assertions; swallowed/absent readers failed before stamps, 2026-10-17.
        nodes: parallels.map(({ workItemId, stepId }) => ({ workItemId, stepId })),
      };
    }

    // Before the branch rather than inside each of them: whichever of the two a
    // delete takes, it is one act, and the hand-ups it writes on the surviving
    // parent belong to the same instant as the removal itself.
    const stamp = this.clock.stampFor(actorId);
    const label = `delete ${quoteName(workItem.name)}`;
    const storedEstimates = await this.opts.estimates.listByProject(workItem.projectId);
    // Read before anything is deleted, exactly like the estimates and the
    // assignments: `actual.work_item_id` cascades, so a moment later there is
    // nothing left to read and the restore would put the branch back with the
    // days nobody recorded again.
    const storedActuals = await this.opts.actuals.listByProject(workItem.projectId);
    // Read before anything is deleted, for the actuals' reason:
    // `step_progress.work_item_id` cascades, so a moment later there is nothing
    // left to read and the restore would put the branch back reading as work
    // nobody had started.
    const storedProgress = await this.opts.progress.listByProject(workItem.projectId);
    // Proof: omitting deletion capture left an orphaned fact and failed root-leaf delete/undo; watched 2026-10-14.
    const storedBlockages = await this.opts.blockages.listByProject(workItem.projectId);
    // Read before anything is deleted, for the same cascade the two above name,
    // and in every metric at once: one read feeds three folds, which is what
    // `listByProject` takes no metric for.
    const storedMeasures = await this.opts.measures.listByProject(workItem.projectId);
    // Read before anything is deleted, for the same cascade:
    // `step_node_attempt.work_item_id` cascades, and an undo must put the
    // branch back with the history of every attempt at it.
    const storedAttempts = await this.opts.attempts.listByProject(workItem.projectId);
    // Read before anything is deleted, for the same cascade:
    // `work_item_resource_demand.work_item_id` cascades, and an undo must put
    // the branch back with the units it states it needs.
    const storedDemands = await this.opts.demands.listByProject(workItem.projectId);
    // And the claims the delete takes, with their occupancy: those on the
    // removed rows and every claim delegated under one of them, which the
    // parent reference cascades (a promotion's children keep their rows and
    // lose theirs).
    const removedClaims = await this.claimsGoingWith(workItem.projectId, doomed);
    const allEdges = await this.opts.dependencies.listByProject(workItem.projectId);
    const authored = await this.opts.typedDependencies.listByProject(workItem.projectId);
    const survivor = workItem.parentId;
    const inside = new Set(doomed);
    const deletedBlockages = storedBlockages.filter((fact) => inside.has(fact.workItemId));
    const previousParentProgress = storedProgress.filter((fact) => fact.workItemId === survivor);
    const previousParentBlockages = storedBlockages.filter((fact) => fact.workItemId === survivor);
    const deletionState: DeletionState = {
      blockages: deletedBlockages,
      parentId: survivor,
      parentBlockages: previousParentBlockages,
      restoredParentProgress: previousParentProgress,
    };
    // Read before anything is deleted, for the attempts' cascade: the marks go
    // with their work items, and an undo that wrote back only the attempts
    // would let a number removed while it was a node's highest be issued again.
    const storedIssued = await this.opts.attempts.listIssued(workItem.projectId, doomed);
    if (
      survivor !== null &&
      (children.length === 0 || strategy === 'cascade') &&
      rows.filter((row) => row.parentId === survivor).length === 1
    ) {
      const stranded = authored.filter(
        (dependency) =>
          ![dependency.predecessor, dependency.successor].some((endpoint) =>
            inside.has(endpoint.workItemId),
          ) &&
          [dependency.predecessor, dependency.successor].some(
            (endpoint) => endpoint.scope === 'descendant-step' && endpoint.workItemId === survivor,
          ),
      );
      // Proof: including relationships removed with the subtree made mounted
      // last-child delete return 409 instead of 200; watched 2026-09-27.
      // Skipping the refusal made the surviving-relationship case return 500.
      if (stranded.length > 0) {
        return {
          ok: false,
          reason: 'descendant_step_on_leaf',
          dependencyIds: stranded.map((row) => row.id),
        };
      }
    }
    // The claims a promoting delete hands up: those of the one deleted row
    // holding any, when that row is a former leaf. Claims on more than one
    // deleted row, or on a parent that would receive some, are refused below;
    // a lone subtree claim on a deleted parent goes with it, as before.
    const promotes =
      survivor !== null &&
      (children.length === 0 || strategy === 'cascade') &&
      rows.filter((row) => row.parentId === survivor).length === 1;
    const claimedRows = promotes
      ? [
          ...new Set(
            removedClaims.claims
              .filter(({ workItemId }) => inside.has(workItemId))
              .map(({ workItemId }) => workItemId),
          ),
        ]
      : [];
    const claimedHandedUp = removedClaims.claims.filter(
      ({ workItemId }) =>
        claimedRows.includes(workItemId) && !rows.some((row) => row.parentId === workItemId),
    );
    const parentClaims =
      claimedHandedUp.length === 0 || this.opts.claims === undefined
        ? []
        : (await this.opts.claims.listByProject(workItem.projectId)).filter(
            ({ workItemId }) => workItemId === survivor,
          );
    // Proof: with this refusal disabled, `refuses a promoting delete whose
    // claims sit on two former leaves, naming every holder`
    // (resource-occupancy.db.test.ts) threw `already holds a claim` on memory
    // and a DrizzleQueryError on the `claim` update on SQLite (the unique
    // index), and `refuses a promoting delete handing claims up to a parent
    // that holds its own subtree claim` answered ok on both; watched 2026-10-20.
    if (claimedRows.length > 1 || parentClaims.length > 0) {
      const held = [
        ...parentClaims,
        ...removedClaims.claims.filter(({ workItemId }) => inside.has(workItemId)),
      ];
      const nameOf = await this.personNamesWithin(
        access,
        held.map(({ personId }) => personId),
      );
      return {
        ok: false,
        reason: 'children_claimed',
        holders: held.map(({ id: claimId, personId, runId }) => {
          const name = nameOf.get(personId);
          if (name === undefined) throw new Error(`claim ${claimId} names an absent person`);
          return { claimId, personId, name, runId };
        }),
      };
    }

    if (children.length === 0 || strategy === 'cascade') {
      // The mirror of the rule in `create`: a parent losing its last child takes
      // the estimates back, so the work is still described somewhere.
      //
      // The totals rather than the rows. `moveAll` alone was wrong whenever the
      // deleted child was itself a parent: its figures live on its descendants,
      // it holds no estimate rows of its own, so nothing moved and the whole
      // subtree's estimates were then deleted with it.
      const parentId = workItem.parentId;
      const handedUp: StoredEstimate[] = [];
      // The same rule, one table over: the parent is about to become a leaf
      // again, and a leaf reports what it holds. Without this the days the
      // branch recorded are simply gone the moment its last child is deleted —
      // the estimates would survive on the parent and the actuals beside them
      // would not, which is the drift this whole change is written not to have.
      //
      // The **totals**, not the rows, for the reason the estimates' comment
      // above gives: a deleted child that is itself a parent holds no rows of
      // its own, so moving rows would move nothing and the branch's figures
      // would go with it.
      //
      // `recordedAt` is the newest stamp in the branch — the parent's number is
      // now the whole branch's, and the day it was last added to is the honest
      // answer to "when was this recorded".
      const recordedHandedUp: StoredActual[] = [];
      // And the statements, folded rather than moved — the same argument the two
      // figures make, in the tense this change is about. The parent is becoming a
      // leaf, and a leaf that has just absorbed a finished branch's work reads as
      // not started unless the statement comes up with it.
      //
      // The **fold**, not the rows: a deleted child that is itself a parent holds
      // no rows of its own, so moving rows would move nothing and the branch's
      // reading would go with it. `unknown` is skipped rather than written,
      // because the absence of a row is how it is spelled everywhere.
      //
      // `statedAt` is the newest stamp in the branch, for `recordedAt`'s reason:
      // the parent's reading is now the whole branch's, and the day it was last
      // spoken about is the honest answer to "when was this said".
      const statedHandedUp: StoredProgress[] = [];
      const blockedHandedUp: StoredStepBlockage[] = [];
      const formerLeaves = doomed
        .map((owner) => rowOf(rows, owner))
        .filter((row) => !rows.some((child) => child.parentId === row.id));
      // And the figures that are not days, folded per metric — the same argument
      // the actuals make, three times, because `rollUpMeasures` takes one metric
      // at a time so that a token and an hour can never be added together. A
      // metric nobody recorded anywhere in the branch folds to nothing and is
      // written nowhere: absence is per metric, and the hand-up is not the place
      // that rule stops holding.
      const measuredHandedUp: StoredMeasure[] = [];
      // And the demands, the mirror of the split's hand-down (`wbs-resources`):
      // the parent becomes the leaf that holds the work, so it states what the
      // work needs. Per resource the **largest** units any former leaf
      // demanded, not the sum: a leaf's demand is held while one of its steps
      // runs, the branch's leaves need not run at once, and an `exclusive`
      // resource stays at its one unit. It overwrites whatever the parent
      // stated while it was a parent (that charged nothing); `previous` is
      // what the undo writes back.
      // Proof: summed instead, `hands up the largest units any former leaf of a
      // deleted last branch demanded` read 10 GB where 6 was owed; `previous`
      // written as null, the same test's undo read no demand on the parent where
      // its own 2 was owed; both stores, watched 2026-10-20.
      const demandedHandedUp: { resourceId: string; units: number; previous: number | null }[] = [];
      if (parentId !== null && rows.filter((row) => row.parentId === parentId).length === 1) {
        const leafIds = new Set(formerLeaves.map((row) => row.id));
        const largest = new Map<string, number>();
        for (const { workItemId, resourceId, units } of storedDemands) {
          if (leafIds.has(workItemId))
            largest.set(resourceId, Math.max(units, largest.get(resourceId) ?? 0));
        }
        for (const [resourceId, units] of [...largest].sort(([a], [b]) => a.localeCompare(b))) {
          const previous =
            storedDemands.find(
              (each) => each.workItemId === parentId && each.resourceId === resourceId,
            )?.units ?? null;
          demandedHandedUp.push({ resourceId, units, previous });
        }
        for (const step of await this.opts.projects.stepsOf(workItem.projectId)) {
          const facts = deletedBlockages.filter((fact) => fact.stepId === step.id);
          // Proof: changing every to some handed up partial QA agreement; mounted deletion fold failed, watched 2026-10-14.
          if (formerLeaves.every((leaf) => facts.some((fact) => fact.workItemId === leaf.id))) {
            blockedHandedUp.push({
              workItemId: parentId,
              stepId: step.id,
              // Proof: seeding with zero changed -10 to 0 in mounted deletion hand-up; watched 2026-10-14.
              blockedAt: Math.max(...facts.map((fact) => fact.blockedAt)),
            });
          }
        }
        const totals = rollUp(rows, storedEstimates);
        for (const [stepId, days] of totals.get(id) ?? []) {
          handedUp.push({ workItemId: parentId, stepId, ...days });
        }
        const recordedInside = storedActuals.filter((each) => inside.has(each.workItemId));
        for (const [stepId, days] of rollUpActuals(rows, storedActuals).get(id) ?? []) {
          const latest = recordedInside
            .filter((each) => each.stepId === stepId)
            .reduce((newest, each) => Math.max(newest, each.recordedAt), 0);
          recordedHandedUp.push({ workItemId: parentId, stepId, days, recordedAt: latest });
        }
        const statedInside = storedProgress.filter((each) => inside.has(each.workItemId));
        // Statements only, attempts left out on purpose: the hand-up writes
        // statements, and an attempt is not one (ADR 0045). A branch's
        // attempts go with it, so a running attempt must not come back as a
        // statement nobody made.
        const branchStates = rollUpProgress(
          rows,
          storedProgress,
          workedStepsOf(storedEstimates, storedActuals, storedProgress, []),
          [],
        ).get(id);
        for (const [stepId, state] of branchStates ?? []) {
          if (state === UNKNOWN) continue;
          const latest = statedInside
            .filter((each) => each.stepId === stepId)
            .reduce((newest, each) => Math.max(newest, each.statedAt), 0);
          statedHandedUp.push({ workItemId: parentId, stepId, state, statedAt: latest });
        }
        const measuredInside = storedMeasures.filter((each) => inside.has(each.workItemId));
        for (const metric of MEASURE_METRICS) {
          for (const [stepId, value] of rollUpMeasures(rows, storedMeasures, metric).get(id) ??
            []) {
            // The newest stamp **in this metric**, not the newest in the branch.
            // A pair whose hours were recorded this morning and whose tokens
            // were recorded a fortnight ago hands up two figures, and the token
            // one did not become a fortnight newer by being summed.
            const latest = measuredInside
              .filter((each) => each.stepId === stepId && each.metric === metric)
              .reduce((newest, each) => Math.max(newest, each.recordedAt), 0);
            measuredHandedUp.push({
              workItemId: parentId,
              stepId,
              metric,
              value,
              recordedAt: latest,
            });
          }
        }
      }
      // Proof: bypassing this call failed `connected cascade refuses an injected failed graph read`
      // at the actual SQLite refusal assertion; unchanged tables also checked (2026-10-22).
      const structural = await this.structuralRefusal(workItem.projectId, actorId, {
        rows: rows.filter((row) => !inside.has(row.id)),
        estimates: [
          ...storedEstimates.filter((estimate) => !inside.has(estimate.workItemId)),
          ...handedUp,
        ],
        legacy: allEdges.filter(
          (edge) => !inside.has(edge.predecessorId) && !inside.has(edge.successorId),
        ),
        typed: authored.filter(
          (relationship) =>
            ![relationship.predecessor, relationship.successor].some(
              (endpoint) =>
                endpoint.projectId === workItem.projectId && inside.has(endpoint.workItemId),
            ),
        ),
      });
      if (structural !== null) return structural;
      for (const each of handedUp) await this.opts.estimates.set(each, stamp);
      for (const each of recordedHandedUp) await this.opts.actuals.set(each, stamp);
      for (const each of statedHandedUp) await this.opts.progress.set(each, stamp);
      for (const each of measuredHandedUp) await this.opts.measures.set(each, stamp);
      // Proof: skipped, `hands the last child’s demand back up when its delete
      // promotes the parent, and back on undo` (resource-occupancy.db.test.ts)
      // read no demand on the parent, on both stores; watched 2026-10-20.
      for (const { resourceId, units } of demandedHandedUp) {
        // `parentId` is non-null whenever anything was handed up.
        if (parentId === null) throw new Error('a demand was handed up to no parent');
        const written = await this.opts.demands.set(parentId, resourceId, units, stamp);
        // The parent and the resource were read in this unit of work a moment ago.
        if (written !== 'written')
          throw new Error(`cannot hand demand on ${resourceId} up to the parent: ${written}`);
      }
      const demandHandUp = (pick: 'units' | 'previous'): CompensatingCommand[] =>
        parentId === null
          ? []
          : demandedHandedUp.map((each) => ({
              do: 'set_demand' as const,
              workItemId: parentId,
              resourceId: each.resourceId,
              units: each[pick],
            }));
      const cut = allEdges.filter(
        (edge) => inside.has(edge.predecessorId) || inside.has(edge.successorId),
      );
      // Read before the delete, not after. `assignment.work_item_id` cascades,
      // so a moment later there is nothing left to read and the restore would
      // put the branch back with nobody on it.
      const doomedAssignments = await this.opts.directory.assignmentsOf(doomed);
      // The claims up before the rows go, which would cascade them away; moved
      // in place, so their occupancy rows and the claims delegated under them
      // follow by id. What the delete then takes is read afresh.
      // Proof: skipped, `hands the only child’s claims and occupancy back up
      // when its delete promotes the parent, and back on undo` read no claim
      // and no occupancy after the delete, and `hands a delegated claim up with
      // its parent claim id …` lost the delegated claim (both in
      // resource-occupancy.db.test.ts, both stores), and the swarm rehearsal's
      // step 5b read `[]` on the parent; watched 2026-10-20.
      const claimsMovedUp: Extract<CompensatingCommand, { do: 'move_claims' }>[] = [];
      for (const fromWorkItemId of new Set(claimedHandedUp.map(({ workItemId }) => workItemId))) {
        // `promotes` holds whenever anything is handed up.
        if (parentId === null) throw new Error('a claim was handed up to no parent');
        await this.claiming().claims.moveAll(fromWorkItemId, parentId, stamp);
        claimsMovedUp.push({
          do: 'move_claims',
          fromWorkItemId,
          toWorkItemId: parentId,
          claims: claimedHandedUp.filter(({ workItemId }) => workItemId === fromWorkItemId),
        });
      }
      const claimsTaken =
        claimsMovedUp.length === 0
          ? removedClaims
          : await this.claimsGoingWith(workItem.projectId, doomed);
      // Edges first, and every one touching anything in the subtree. The
      // foreign keys refuse a delete that would orphan one, so this is not
      // tidiness: without it, deleting a work item anything depends on fails
      // with a constraint error the caller cannot act on.
      await this.opts.dependencies.removeAllFor(doomed, stamp);
      // Proof: skipping this removal let SQLite cascade the rows without a
      // journal record; mounted node-and-whole delete restored 0 instead of 2
      // relationships on undo, watched 2026-09-27.
      const removedTyped = await this.opts.typedDependencies.removeAllFor(doomed, stamp);
      await this.replaceDeletionBlockages(workItem.projectId, deletedBlockages, true, stamp);
      await this.opts.workItems.remove(doomed, [], stamp);
      await this.replaceDeletionBlockages(workItem.projectId, blockedHandedUp, false, stamp);
      // The parent becoming a leaf again takes a readiness or hold only where
      // every former leaf agreed on it (`add-work-item-statuses`).
      const statementsHandedUp =
        parentId !== null && rows.filter((row) => row.parentId === parentId).length === 1
          ? {
              readiness: agreedOn(formerLeaves.map((row) => row.readiness)),
              hold: agreedOn(formerLeaves.map((row) => row.hold)),
            }
          : undefined;
      const handUpStep =
        statementsHandedUp !== undefined &&
        parentId !== null &&
        (statementsHandedUp.readiness !== null || statementsHandedUp.hold !== null)
          ? {
              forward: {
                do: 'patch' as const,
                workItemId: parentId,
                patch: statementsHandedUp,
              },
              inverse: {
                do: 'patch' as const,
                workItemId: parentId,
                patch: { readiness: null, hold: null },
              },
            }
          : undefined;
      if (handUpStep !== undefined) {
        // Proof: this write skipped made `gives a parent losing its last child
        // the readiness and hold every former leaf agreed on` fail on
        // `readiness: null` where `draft` was owed; watched 2026-09-29.
        const handed = await this.apply(workItem.projectId, handUpStep.forward, stamp);
        if (!handed.ok) throw new Error(`cannot hand statements up: ${handed.detail}`);
      }
      await this.announceTree(workItem.projectId);
      await this.record(workItem.projectId, stamp, 'delete', label, {
        // Proof: replacing both delete before-images with [] made the admitted
        // successor delete fail exact journal coverage and roll back (2026-10-22).
        externalBefore: incidents.externalBefore,
        // Proof: the demand hand-up left out of the forward, `hands the last
        // child’s demand back up when its delete promotes the parent` read no
        // demand after the redo; left out of the inverse, its undo read the
        // demand on both rows; both stores, watched 2026-10-20.
        // Proof: the hand-up of claims left out of the forward, `hands the only
        // child’s claims …` and `hands a delegated claim up …` read them on the
        // restored child after the redo; left out of the inverse, their undo
        // read them on the parent; both stores, watched 2026-10-20.
        forward: withSteps(
          withSteps(
            withPatchStep(
              withRemovedTyped(
                {
                  do: 'delete_subtree',
                  deletionState: { ...deletionState, handedBlockages: blockedHandedUp },
                  rootId: id,
                  expectedSubtree: doomed,
                  remove: doomed,
                  reparented: [],
                  setEstimates: handedUp,
                  setActuals: recordedHandedUp,
                  setProgress: statedHandedUp,
                  setMeasures: measuredHandedUp,
                },
                removedTyped,
                false,
              ),
              handUpStep?.forward,
              'after',
            ),
            demandHandUp('units'),
            'after',
          ),
          claimsMovedUp,
          'before',
        ),
        inverse: withSteps(
          withSteps(
            withPatchStep(
              withRemovedTyped(
                withClaimsRestored(
                  {
                    do: 'restore_subtree',
                    deletionState: { ...deletionState, parentBlockages: blockedHandedUp },
                    rows: doomed.map((each) => rowOf(rows, each)),
                    rootPosition: workItem.position,
                    reparented: [],
                    estimates: storedEstimates.filter((each) => inside.has(each.workItemId)),
                    // Every day recorded anywhere in the branch, put back where it was
                    // recorded. Without this an undo of a delete answers `ok` and returns
                    // the branch with its estimates and none of its actuals — the plan
                    // looks whole and a week of somebody's record is gone.
                    actuals: storedActuals.filter((each) => inside.has(each.workItemId)),
                    // Every statement made anywhere in the branch, put back where it was
                    // made. Without this an undo of a delete answers `ok` and returns the
                    // branch reading as work nobody has started — the plan looks whole and
                    // a fortnight of finished work is unfinished again.
                    progress: storedProgress.filter((each) => inside.has(each.workItemId)),
                    // Every token and hour recorded anywhere in the branch, put back where
                    // it was recorded. Without this an undo of a delete answers `ok` and
                    // returns the branch with its days and none of its tokens — the plan
                    // looks whole and the record of what the work cost to run is gone.
                    measures: storedMeasures.filter((each) => inside.has(each.workItemId)),
                    // Every attempt at the branch's nodes, verbatim with its number.
                    attempts: storedAttempts.filter((each) => inside.has(each.workItemId)),
                    // Proof: left out, `puts a deleted leaf back still skipping its removed
                    // highest number` in `step-node-attempt.controller.db.test.ts` numbered
                    // `[1, 2]` where `[1, 3]` was owed; watched 2026-10-12.
                    issuedAttemptNumbers: storedIssued,
                    assignments: doomedAssignments,
                    // Every demand stated anywhere in the branch, put back where it was
                    // stated. Without this an undo of a delete answers `ok` and returns
                    // the branch needing nothing, and the engines level it as free.
                    // Proof: with this list emptied, `undo of a delete puts the demands
                    // back exactly` and `undo of a cascading delete puts every row’s
                    // demands back` (resource-occupancy.db.test.ts) read [] on both
                    // stores; watched 2026-10-20.
                    demands: storedDemands.filter((each) => inside.has(each.workItemId)),
                    internalDependencies: cut.filter(
                      (edge) => inside.has(edge.predecessorId) && inside.has(edge.successorId),
                    ),
                    externalDependencies: cut.filter(
                      (edge) => !inside.has(edge.predecessorId) || !inside.has(edge.successorId),
                    ),
                    removedEstimates: handedUp.map((each) => ({
                      workItemId: each.workItemId,
                      stepId: each.stepId,
                    })),
                    removedActuals: recordedHandedUp.map((each) => ({
                      workItemId: each.workItemId,
                      stepId: each.stepId,
                    })),
                    removedProgress: statedHandedUp.map((each) => ({
                      workItemId: each.workItemId,
                      stepId: each.stepId,
                    })),
                    removedMeasures: measuredHandedUp.map((each) => ({
                      workItemId: each.workItemId,
                      stepId: each.stepId,
                      metric: each.metric,
                    })),
                  },
                  claimsTaken,
                ),
                removedTyped,
                true,
              ),
              handUpStep?.inverse,
              'before',
            ),
            demandHandUp('previous'),
            'before',
          ),
          // After the restore, which puts back the rows they return to.
          claimsMovedUp.map(({ fromWorkItemId, toWorkItemId, claims }) => ({
            do: 'move_claims' as const,
            fromWorkItemId: toWorkItemId,
            toWorkItemId: fromWorkItemId,
            claims: claims.map((each) => ({ ...each, workItemId: toWorkItemId })),
          })),
          'after',
        ),
        // Two deliberate absences. The deleted rows are not here — nothing can
        // hold a revision of a row that is gone, and the restore's refusal to
        // write over an id that exists is what guards them. Neither are the
        // surviving ends of the edges that left with the branch: those edges
        // are best-effort by design, and refusing to put a whole branch back
        // because somebody renamed a neighbour would strand the work for a
        // reason that has nothing to do with it.
        // Proof: the hand-up parent left out made `guards the parent a last-child
        // delete hands statements up to` fail — its id was absent from the
        // entry's preconditions, so a later edit to it would not make the undo
        // stale; watched 2026-09-29.
        touched: [
          ...new Set([
            ...handedUp.map((each) => each.workItemId),
            ...(survivor === null ? [] : [survivor]),
            ...(handUpStep === undefined ? [] : [handUpStep.forward.workItemId]),
          ]),
        ],
        moveProgressOwners: survivor === null ? [] : [survivor],
        before: rows,
      });
      return { ok: true, value: null };
    }

    const formerGroup = rows
      .filter((row) => row.parentId === workItem.parentId)
      .sort((a, b) => a.position - b.position);
    const promoted: Reparented[] = formerGroup
      .flatMap((sibling) => (sibling.id === id ? children : [sibling]))
      .map((sibling, i) => ({
        id: sibling.id,
        parentId: workItem.parentId,
        position: (i + 1) * POSITION_STEP,
      }));
    const cut = allEdges.filter((edge) => edge.predecessorId === id || edge.successorId === id);
    // Read before the delete: the assignment rows cascade with the work item.
    const deletedAssignments = await this.opts.directory.assignmentsFor(id);
    // The same reason as the cascade branch above: an edge to a row that is
    // going has nothing to point at, and the foreign keys say so. Only this row
    // leaves here — its children are promoted, and their edges stay valid.
    // Proof: bypassing this call failed `connected promote refuses an injected failed graph read`
    // at the actual SQLite refusal assertion; unchanged tables also checked (2026-10-22).
    const structural = await this.structuralRefusal(workItem.projectId, actorId, {
      rows: rows
        .filter((row) => row.id !== id)
        .map((row) => (row.parentId === id ? { ...row, parentId: workItem.parentId } : row)),
      estimates: storedEstimates.filter((estimate) => estimate.workItemId !== id),
      legacy: allEdges.filter((edge) => edge.predecessorId !== id && edge.successorId !== id),
      typed: authored.filter(
        (relationship) =>
          ![relationship.predecessor, relationship.successor].some(
            (endpoint) => endpoint.projectId === workItem.projectId && endpoint.workItemId === id,
          ),
      ),
    });
    if (structural !== null) return structural;
    await this.opts.dependencies.removeAllFor([id], stamp);
    // Proof: broadening this promotion to subtreeOf(rows, id) made mounted promote replay return 500 instead of 200 (2026-10-22).
    const removedTyped = await this.opts.typedDependencies.removeAllFor([id], stamp);
    await this.opts.workItems.remove([id], promoted, stamp);
    await this.announceTree(workItem.projectId);
    await this.record(workItem.projectId, stamp, 'delete', label, {
      // Proof: replacing both delete before-images with [] made the admitted
      // successor delete fail exact journal coverage and roll back (2026-10-22).
      // Proof: omitting only the promotion before-image made mounted promote replay return 500 instead of 200 (2026-10-22).
      externalBefore: incidents.externalBefore,
      forward: withRemovedTyped(
        {
          do: 'delete_subtree',
          deletionState,
          rootId: id,
          expectedSubtree: subtreeOf(rows, id),
          remove: [id],
          reparented: promoted,
          setEstimates: [],
          // A promotion deletes one row and keeps its children, so the parent
          // below is not becoming a leaf and nothing is handed anywhere.
          setActuals: [],
          setProgress: [],
          setMeasures: [],
        },
        removedTyped,
        false,
      ),
      inverse: withRemovedTyped(
        withClaimsRestored(
          {
            do: 'restore_subtree',
            deletionState,
            rows: [workItem],
            rootPosition: workItem.position,
            // Everyone the promotion rewrote, back where they were: the children
            // under the row coming back, and the former siblings at the positions
            // the promotion took from them. Restoring only the children would
            // leave the group respaced around a gap that is no longer there.
            reparented: promoted.map((each) => {
              const was = rowOf(rows, each.id);
              return { id: was.id, parentId: was.parentId, position: was.position };
            }),
            estimates: storedEstimates.filter((each) => each.workItemId === id),
            // The promoted row's own recorded days — it had children, so it holds
            // none, and this is the empty list every time until a promotion of a
            // leaf becomes representable. Written from the same source as the
            // estimates beside it rather than hard-coded, so it stays true if that
            // ever changes.
            actuals: storedActuals.filter((each) => each.workItemId === id),
            // The promoted row's own statements — it had children, so it holds none,
            // and this is the empty list every time until a promotion of a leaf
            // becomes representable. Written from the same source as the two figures
            // beside it rather than hard-coded, so it stays true if that ever changes.
            progress: storedProgress.filter((each) => each.workItemId === id),
            // The promoted row's own tokens and hours — it had children, so it holds
            // none, and this is the empty list every time until a promotion of a
            // leaf becomes representable. Written from the same source as the three
            // beside it rather than hard-coded, so it stays true if that changes.
            measures: storedMeasures.filter((each) => each.workItemId === id),
            // The promoted row's own attempts: none on a row with children, read
            // from the same source for the figures' reason.
            attempts: storedAttempts.filter((each) => each.workItemId === id),
            issuedAttemptNumbers: storedIssued.filter((each) => each.workItemId === id),
            assignments: deletedAssignments,
            // The promoted row's own demands, for the cascade's reason above.
            demands: storedDemands.filter((each) => each.workItemId === id),
            internalDependencies: [],
            externalDependencies: cut,
            removedEstimates: [],
            removedActuals: [],
            removedProgress: [],
            removedMeasures: [],
          },
          removedClaims,
        ),
        // Proof: omitting promotion inverse typed links made mounted promote replay undo return 404 instead of 200 (2026-10-22).
        removedTyped,
        true,
      ),
      // The promoted rows are preconditions because putting them back under the
      // restored parent is part of the undo. The ends of the edges that left
      // are not, for the reason given in the cascade branch above.
      touched: [...promoted.map((each) => each.id), ...(survivor === null ? [] : [survivor])],
      moveProgressOwners: survivor === null ? [] : [survivor],
      before: rows,
    });
    return { ok: true, value: null };
  }

  /**
   * Puts every sibling group in the order its bars start — one press of
   * `Arrange by schedule`, as one act.
   *
   * **Computed here, inside the write, from the schedule the chart is drawing.**
   * The alternative a client could build — a batch of `moveWorkItem` steps — is
   * capped at 200, orders from a read that may already be stale, and makes every
   * `afterId` in it a second implementation of the arrangement. ADR 0023.
   *
   * **A project on the optimized engine whose variant is still solving is
   * refused**, never quietly arranged by Fast: the read draws Fast there and the
   * cue beside it says so, but an arrangement leaves no mark saying which engine
   * decided it. {@link selectedSchedule} holds both halves of that rule.
   *
   * A project already in schedule order writes nothing, journals nothing and
   * announces nothing — {@link freeze}'s precedent for a write that pinned
   * nothing, and what keeps a second press off the undo stack. Connected commands
   * borrow the final target placement; selected readiness comes from its retained
   * optimization stage. No command read admits optimizer work.
   */
  async arrangeBySchedule(projectId: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(project, actorId)) return { ok: false, reason: 'forbidden' };

    const captured = await this.opts.livePlans?.readProject(projectId);
    if (captured?.kind === 'not_found') return { ok: false, reason: 'not_found' };
    let rows: readonly LabelledWorkItem[];
    let arrangement: ReturnType<typeof arrangeSiblingsBySchedule>;
    // Proof: routing connected observations through the local scheduler made the mounted
    // connected arrangement fail with a foreign endpoint error (500); watched 2026-10-23.
    if (captured?.kind === 'connected') {
      const view = projectConnectedTree(captured, projectId);
      // Proof: removing calendar refusal changed all three mounted missing-calendar
      // cases from typed 409 to 500; prior collected edit still rolled back (2026-10-23).
      if (view.placement.kind === 'dependency_calendar_missing')
        return { ok: false, reason: 'dependency_calendar_missing' };
      // Proof: removing engine refusal made the captured engine-loss case throw
      // instead of returning engine_unavailable (2026-10-23).
      if (view.placement.kind === 'engine_unavailable')
        return { ok: false, reason: 'engine_unavailable' };
      // Proof: removing unavailable refusal made the captured calendar-range case
      // throw instead of returning calendar_range (2026-10-23).
      if (view.placement.kind === 'unavailable')
        return { ok: false, reason: view.placement.reason };
      const settings = view.reads.project;
      // Proof: bypassing readiness let pending and boundary-infeasible selected
      // objectives arrange successfully in connected-arrange.test.ts (2026-10-23).
      if (
        settings.optimizationEnabled &&
        settings.scheduleEngine === 'optimized' &&
        view.optimization !== null &&
        view.optimization.chosen === null
      )
        return { ok: false, reason: 'schedule_not_ready' };
      rows = view.metadata.workItems;
      arrangement = arrangeSiblingsBySchedule(
        // Proof: using all captured rows failed both mounted held-sibling cases
        // with a missing scheduled start (2026-10-23).
        prepareCapturedScheduleParts(view.reads).input.rows,
        // Proof: substituting component baseline failed all three selected ready/floor
        // final-placement consumer cases in connected-arrange.test.ts (2026-10-23).
        view.placement.schedule.workItems,
      );
    } else {
      rows = await this.opts.workItems.listByProject(projectId);
      const stored = await this.opts.estimates.listByProject(projectId);
      const edges = await this.opts.dependencies.listByProject(projectId);
      const assigned = await this.opts.directory.assignmentsOf(rows.map((row) => row.id));
      const steps = await this.opts.projects.stepsOf(projectId);
      const slotsOf = await this.opts.capacity.slotsFor(projectId);
      const canonical = canonicalScheduleParts(
        project,
        rows,
        stored,
        edges,
        await this.opts.typedDependencies.listByProject(projectId),
        assigned,
        steps,
        slotsOf,
        await this.opts.demands.listByProject(projectId),
        await this.opts.resourceCapacity.listFor(projectId),
      );

      const shared = captured?.kind === 'shared' ? captured.chain : undefined;
      if (shared?.kind === 'engine_unavailable') return { ok: false, reason: 'engine_unavailable' };
      if (shared?.kind === 'unavailable') return { ok: false, reason: shared.reason };
      const input = shared?.kind === 'scheduled' ? shared.input : canonical.input;
      let selected;
      try {
        const read =
          shared?.kind === 'scheduled'
            ? shared.scheduled
            : await this.opts.scheduler.read({
                projectId: project.id,
                input: canonical.input,
                engine: project.scheduleEngine,
                objective: project.scheduleObjective,
                enabled: project.optimizationEnabled,
                mode: this.opts.schedulerMode ?? 'live',
              });
        if (read.kind === 'engine_unavailable') return { ok: false, reason: 'engine_unavailable' };
        selected = selectedSchedule(project, read.fast, read.optimization);
      } catch (err) {
        // Only the modeled failure, for the plan read's reason exactly: an
        // unqualified catch would turn any future mistake in `slicesOf` into
        // "your dependencies run in a circle", which is a lie told confidently.
        if (!(err instanceof ScheduleCycleError)) throw err;
        return { ok: false, reason: 'cycle' };
      }
      if (selected.awaitingSolve) return { ok: false, reason: 'schedule_not_ready' };
      arrangement = arrangeSiblingsBySchedule(input.rows, selected.schedule.workItems);
    }
    // Nothing to arrange. Not an error and not a write: the project already
    // reads in the order it is drawn in.
    if (arrangement.placements.length === 0) return { ok: true, value: null };

    const before = new Map(rows.map((row) => [row.id, row]));
    const stamp = this.clock.stampFor(actorId);
    await this.opts.workItems.setPositions(arrangement.placements, arrangement.moved, stamp);
    await this.announceTree(projectId);
    await this.record(projectId, stamp, 'arrange', 'arrange the plan by schedule', {
      forward: {
        do: 'set_positions',
        placements: [...arrangement.placements],
        moved: [...arrangement.moved],
      },
      // The positions as they were, for exactly the work items this arrangement
      // writes — never re-derived later from an `afterId`, which goes stale the
      // moment somebody adds a sibling between the press and the undo.
      inverse: {
        do: 'set_positions',
        placements: arrangement.placements.map((placed) => {
          const was = before.get(placed.id);
          // `arrangeBySchedule` only ever names rows it was given, so this is a
          // broken caller rather than a row to guess a position for.
          if (was === undefined) throw new Error(`arranged an unknown work item ${placed.id}`);
          return { id: was.id, parentId: was.parentId, position: was.position };
        }),
        moved: [...arrangement.moved],
      },
      touched: [...arrangement.moved],
      before: rows,
    });
    return { ok: true, value: null };
  }

  /**
   * Sets a project step's estimate allowance: one journalled, undoable edit.
   *
   * Here rather than on `StepService` because an allowance changes what every
   * estimate of the step charges, and the journal that makes it one undo lives
   * here. HTTP (`PATCH` a step), the command batch and MCP all reach this one
   * method through the `setStepAllowance` command.
   *
   * `allowancePercent` has been validated by the command boundary. An edit that
   * leaves the allowance where it was writes and announces, but is not
   * journalled: there is nothing to reverse.
   *
   * Proof: with the `record` call skipped, `undoes an allowance edit in one
   * step` failed on `undone.ok` (`Expected: true, Received: false`), the undo
   * answering `nothing_to_undo` (2026-09-27).
   */
  async setStepAllowance(
    projectId: string,
    actorId: string,
    stepId: string,
    allowancePercent: AllowancePercent,
  ): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(project, actorId)) return { ok: false, reason: 'forbidden' };

    const stamp = this.clock.stampFor(actorId);
    const written = await this.opts.projects.setStepAllowance(
      projectId,
      stepId,
      allowancePercent,
      stamp,
    );
    if (!written.ok) return { ok: false, reason: 'not_found' };
    await this.opts.broadcast.publish(projectId, { type: 'step_updated', step: written.step });
    await this.announceTree(projectId);
    if (written.previousPercent !== allowancePercent) {
      const rows = await this.opts.workItems.listByProject(projectId);
      await this.record(
        projectId,
        stamp,
        'set_step_allowance',
        `set the ${written.step.name} allowance to +${String(allowancePercent)}%`,
        {
          forward: { do: 'set_step_allowance', stepId, allowancePercent },
          inverse: { do: 'set_step_allowance', stepId, allowancePercent: written.previousPercent },
          touched: [stepRevisionKey(stepId)],
          before: rows,
          // Every allowance write moves the revision by exactly one.
          stepsBefore: { [stepRevisionKey(stepId)]: written.revision - 1 },
        },
      );
    }
    return { ok: true, value: null };
  }

  /**
   * Writes the currently derived number of every work item that has none stored.
   *
   * Work items added afterwards keep deriving, so a project can be frozen,
   * planned into further, and frozen again — each freeze pinning only what was
   * unpinned at the time. Numbers already stored are not rewritten, which is the
   * whole point: they are what left the tool.
   */
  async freeze(projectId: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(project, actorId)) return { ok: false, reason: 'forbidden' };

    const rows = await this.opts.workItems.listByProject(projectId);
    const numbers = deriveNumbers(rows);
    const updates = rows
      .filter((row) => row.frozenNumber === null)
      .map((row) => ({ id: row.id, frozenNumber: numbers.get(row.id) ?? null }));
    const stamp = this.clock.stampFor(actorId);
    await this.opts.workItems.setFrozenNumbers(updates, stamp);
    await this.announceTree(projectId);
    // A freeze that pinned nothing — every number was already written down —
    // is not a change to reverse.
    if (updates.length > 0) {
      await this.record(projectId, stamp, 'freeze', 'freeze the numbers', {
        forward: { do: 'set_frozen', updates },
        inverse: {
          do: 'set_frozen',
          updates: updates.map((each) => ({ id: each.id, frozenNumber: null })),
        },
        touched: updates.map((each) => each.id),
        before: rows,
      });
    }
    return { ok: true, value: null };
  }

  /** Returns one work item to deriving, which is what lets it move again. */
  async unfreeze(id: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem } = context.value;
    const stamp = this.clock.stampFor(actorId);
    await this.opts.workItems.setFrozenNumbers([{ id, frozenNumber: null }], stamp);
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      'unfreeze',
      `unfreeze ${quoteName(workItem.name)}`,
      {
        forward: { do: 'set_frozen', updates: [{ id, frozenNumber: null }] },
        inverse: {
          do: 'set_frozen',
          updates: [{ id, frozenNumber: workItem.frozenNumber }],
        },
        touched: [id],
        before: context.value.rows,
      },
    );
    return { ok: true, value: null };
  }

  async unfreezeProject(projectId: string, actorId: string): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(project, actorId)) return { ok: false, reason: 'forbidden' };

    const rows = await this.opts.workItems.listByProject(projectId);
    const frozen = rows.filter((row) => row.frozenNumber !== null);
    const stamp = this.clock.stampFor(actorId);
    await this.opts.workItems.setFrozenNumbers(
      frozen.map((row) => ({
        id: row.id,
        frozenNumber: null,
        startNoEarlierThan: null,
        serviceTeamId: null,
      })),
      stamp,
    );
    await this.announceTree(projectId);
    if (frozen.length > 0) {
      await this.record(projectId, stamp, 'unfreeze', 'unfreeze the whole plan', {
        forward: {
          do: 'set_frozen',
          updates: frozen.map((row) => ({ id: row.id, frozenNumber: null })),
        },
        inverse: {
          do: 'set_frozen',
          updates: frozen.map((row) => ({ id: row.id, frozenNumber: row.frozenNumber })),
        },
        touched: frozen.map((row) => row.id),
        before: rows,
      });
    }
    return { ok: true, value: null };
  }

  /**
   * Writes one work item's estimate for one step.
   *
   * Refused for a work item that has children: its figures are the sum of what
   * is below it, and a stored estimate there would either be ignored or
   * double-counted. Neither is visible to whoever typed it.
   */
  async setEstimate(
    id: string,
    actorId: string,
    stepId: string,
    days: Days,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { rows, workItem } = context.value;
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    const step = (await this.opts.projects.stepsOf(workItem.projectId)).find(
      (each) => each.id === stepId,
    );
    if (step === undefined) return { ok: false, reason: 'unknown_step' };
    // Proof: skipping the unit branch admitted 1.5 minutes, 200 instead of 422 in the mounted estimate-unit boundary test (2026-10-12).
    if (step.estimateUnit === 'minutes') {
      const problem = minuteTrioProblem(days);
      if (problem !== null) return { ok: false, reason: problem };
    } else if (days.pessimistic > MAX_ESTIMATE_DAYS)
      return { ok: false, reason: 'invalid_estimate' };
    const before = await this.storedTrio(workItem.projectId, id, stepId);
    const estimates = await this.opts.estimates.listByProject(workItem.projectId);
    // Proof: bypassing this call failed `connected set-estimate refuses an injected failed graph read`
    // at the actual SQLite refusal assertion; unchanged tables also checked (2026-10-22).
    const structural = await this.structuralRefusal(workItem.projectId, actorId, {
      estimates: [
        ...estimates.filter((estimate) => estimate.workItemId !== id || estimate.stepId !== stepId),
        { workItemId: id, stepId },
      ],
    });
    if (structural !== null) return structural;
    const stamp = this.clock.stampFor(actorId);
    const written = await this.opts.estimates.set({ workItemId: id, stepId, ...days }, stamp);
    if (written === 'unknown_step') return { ok: false, reason: 'unknown_step' };
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      'estimate',
      `estimate ${quoteName(workItem.name)}`,
      {
        forward: { do: 'set_estimate', workItemId: id, stepId, days },
        inverse:
          before === null
            ? { do: 'clear_estimate', workItemId: id, stepId }
            : { do: 'set_estimate', workItemId: id, stepId, days: before },
        touched: [id],
        before: context.value.rows,
      },
    );
    return { ok: true, value: null };
  }

  /**
   * Takes one work item's estimate for one step back off.
   *
   * Idempotent: clearing a trio that is not stored is the state the caller
   * asked for, so it succeeds rather than reporting a 404 for an estimate.
   * A missing *work item* is still `not_found` — that is a different absence,
   * and the same one `removeDependency` reports.
   *
   * No roll-up work is needed: a parent's figures are summed on read, never
   * stored, so the announce below carries the recomputed ancestors with it.
   * Not refused for a rolled-up work item either — one cannot hold a stored
   * estimate to begin with, so the call is already a no-op there, and refusing
   * it would make "clear what is not there" an error in exactly one place.
   *
   * Proof: dropping the `estimates.remove` call fails four tests across
   * `estimate.test.ts` and `work-item.controller.test.ts`, including the
   * parent roll-up one; dropping the announce fails `tells the project's
   * subscribers, with the ancestors whose totals moved` alone. Both watched
   * 2026-08-06 — see `openspec/changes/clear-estimate/verify.md`.
   */
  async clearEstimate(id: string, actorId: string, stepId: string): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem } = context.value;
    const before = await this.storedTrio(workItem.projectId, id, stepId);
    const estimates = await this.opts.estimates.listByProject(workItem.projectId);
    // Proof: bypassing this call failed `connected clear-estimate refuses an injected failed graph read`
    // at the actual SQLite refusal assertion; unchanged tables also checked (2026-10-22).
    const structural = await this.structuralRefusal(workItem.projectId, actorId, {
      estimates: estimates.filter(
        (estimate) => estimate.workItemId !== id || estimate.stepId !== stepId,
      ),
    });
    if (structural !== null) return structural;
    // A delete has no column to stamp, so this stamp is the journal entry's
    // alone — built here rather than beside the {@link record} call because the
    // act begins at the write, not at the recording of it.
    const stamp = this.clock.stampFor(actorId);
    await this.opts.estimates.remove(id, stepId, stamp);
    await this.announceTree(workItem.projectId);
    // Clearing a trio that was not there changed nothing — the call is
    // idempotent by design — so there is nothing to put back.
    if (before !== null) {
      await this.record(
        workItem.projectId,
        stamp,
        'clear_estimate',
        `clear the estimate on ${quoteName(workItem.name)}`,
        {
          forward: { do: 'clear_estimate', workItemId: id, stepId },
          inverse: { do: 'set_estimate', workItemId: id, stepId, days: before },
          touched: [id],
          before: context.value.rows,
        },
      );
    }
    return { ok: true, value: null };
  }

  /**
   * Writes the days one step actually spent on one work item.
   *
   * Guarded exactly as {@link WorkItemService.setEstimate} is, and the two
   * refusals are the same two for the same reasons: a row with children is
   * `rolled_up`, because its figures are the sum of what is below it and a
   * stored number there would be ignored or double-counted; a `stepId` this
   * project does not hold is `unknown_step`.
   *
   * **Nothing about this reaches the schedule.** The engine's input map is built
   * from estimates in `slicesOf` and this number is not in it, so recording an
   * actual moves no date, no bar and no critical path. That is not a saving, it
   * is the only honest reading available: the model has no completion state, so
   * it cannot tell "took 8 days, finished" from "8 days so far", and the two
   * mean opposite things for every successor. See `design.md` D3.
   *
   * Journalled through the same {@link WorkItemService.record} seam as every
   * other command, which is what makes it undoable and what puts it in the
   * plan's history without a second write path — the ordering H1 called
   * non-negotiable.
   */
  async setActual(
    id: string,
    actorId: string,
    stepId: string,
    days: number,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { rows, workItem } = context.value;
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    if (!(await this.holdsStep(workItem.projectId, stepId)))
      return { ok: false, reason: 'unknown_step' };
    const before = await this.storedActual(workItem.projectId, id, stepId);
    const stamp = this.clock.stampFor(actorId);
    // `recordedAt` off the act's own stamp: the day this was recorded and the
    // day the row was written are the same day, and reading the clock twice
    // would let them differ.
    const written = await this.opts.actuals.set(
      { workItemId: id, stepId, days, recordedAt: stamp.at },
      stamp,
    );
    if (written === 'unknown_step') return { ok: false, reason: 'unknown_step' };
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      'actual',
      `record days on ${quoteName(workItem.name)}`,
      {
        forward: { do: 'set_actual', workItemId: id, stepId, days },
        // The number that was there, or its absence. A `clear_actual` inverse
        // is what makes undoing the first recording take the row away rather
        // than write a zero — the one thing this table must never hold as a
        // stand-in for "nobody said".
        inverse:
          before === null
            ? { do: 'clear_actual', workItemId: id, stepId }
            : { do: 'set_actual', workItemId: id, stepId, days: before },
        touched: [id],
        before: context.value.rows,
      },
    );
    return { ok: true, value: null };
  }

  /**
   * Takes the recorded days back off one work item for one step.
   *
   * Idempotent, and not refused on a rolled-up row, for exactly the reasons
   * {@link WorkItemService.clearEstimate} gives: clearing what is not stored is
   * the state the caller asked for, and a parent cannot hold a row to begin
   * with, so refusing there would make "clear what is not there" an error in
   * one place and a success everywhere else. A missing **work item** is still
   * `not_found`.
   */
  async clearActual(id: string, actorId: string, stepId: string): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem } = context.value;
    const before = await this.storedActual(workItem.projectId, id, stepId);
    const stamp = this.clock.stampFor(actorId);
    await this.opts.actuals.remove(id, stepId, stamp);
    await this.announceTree(workItem.projectId);
    // Nothing was stored, so nothing changed and there is nothing to put back —
    // the same skip `clearEstimate` makes, and the reason a plan does not gain
    // a history row every time somebody empties an empty box.
    if (before !== null) {
      await this.record(
        workItem.projectId,
        stamp,
        'clear_actual',
        `clear the recorded days on ${quoteName(workItem.name)}`,
        {
          forward: { do: 'clear_actual', workItemId: id, stepId },
          inverse: { do: 'set_actual', workItemId: id, stepId, days: before },
          touched: [id],
          before: context.value.rows,
        },
      );
    }
    return { ok: true, value: null };
  }

  /**
   * Writes one figure in one unit that is not days — tokens estimated, tokens
   * spent, hours spent — for one step on one work item.
   *
   * Guarded exactly as {@link WorkItemService.setActual} is, plus **one refusal
   * that pair does not have**: a `metric` outside {@link MEASURE_METRICS} is
   * `unknown_metric`, which the controller answers 404 to. See
   * {@link WorkItemRefusal} for why it is not a 400.
   *
   * The check is here rather than left to the database, even though the column
   * carries a `CHECK`: a constraint failure is a 500, and a client asking for a
   * unit this release does not keep is out of date rather than broken.
   *
   * **Nothing about this reaches the schedule**, for
   * {@link WorkItemService.setActual}'s reason and one more of its own: the
   * engine plans in days against team capacity, and tokens are not a
   * substitutable unit of it. `design.md` D3, watched by the empty-diff cases.
   *
   * **Nobody types these.** Dany, 2026-08-21: tokens are set by the LLM doing
   * the work, through this route and later through MCP — so this method is the
   * product surface, not a cell in a grid.
   */
  async setMeasure(
    id: string,
    actorId: string,
    stepId: string,
    /**
     * `string`, not {@link MeasureMetric}, and that is the honest type: this
     * value arrives as a path segment, so the caller genuinely has a string and
     * a narrower signature would only move the assertion to the route — where
     * `unknown_metric` would then be unreachable through the API it exists for.
     * {@link holdsMetric} narrows it here, once, for both methods.
     */
    metric: string,
    value: number,
  ): Promise<WorkItemOutcome<null>> {
    if (!holdsMetric(metric)) return { ok: false, reason: 'unknown_metric' };
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { rows, workItem } = context.value;
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    if (!(await this.holdsStep(workItem.projectId, stepId)))
      return { ok: false, reason: 'unknown_step' };
    const before = await this.storedMeasure(workItem.projectId, id, stepId, metric);
    const stamp = this.clock.stampFor(actorId);
    // `recordedAt` off the act's own stamp — {@link setActual}'s reading.
    const written = await this.opts.measures.set(
      { workItemId: id, stepId, metric, value, recordedAt: stamp.at },
      stamp,
    );
    if (written === 'unknown_step') return { ok: false, reason: 'unknown_step' };
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      'measure',
      `record ${MEASURE_LABELS[metric]} on ${quoteName(workItem.name)}`,
      {
        forward: { do: 'set_measure', workItemId: id, stepId, metric, value },
        // The figure that was there **in this metric**, or its absence. The
        // inverse of a first recording is `clear_measure` and never
        // `set_measure 0`, for the reason `set_actual` gives: zero is somebody
        // saying the work cost nothing, and this table must never hold it as a
        // stand-in for nobody having said. verify.md F7 watches it.
        inverse:
          before === null
            ? { do: 'clear_measure', workItemId: id, stepId, metric }
            : { do: 'set_measure', workItemId: id, stepId, metric, value: before },
        touched: [id],
        before: context.value.rows,
      },
    );
    return { ok: true, value: null };
  }

  /**
   * Takes one recorded figure back off one work item for one step, in one
   * metric, leaving that pair's other metrics alone.
   *
   * Idempotent and not refused on a rolled-up row, exactly as
   * {@link WorkItemService.clearActual} is and for its reasons. A missing
   * **work item** is still `not_found`, and a metric outside the set is still
   * `unknown_metric` — a clear of a unit that does not exist is not the state
   * the caller asked for, it is a caller who believes in a unit this release
   * has never kept.
   */
  async clearMeasure(
    id: string,
    actorId: string,
    stepId: string,
    /** `string` for {@link WorkItemService.setMeasure}'s reason. */
    metric: string,
  ): Promise<WorkItemOutcome<null>> {
    if (!holdsMetric(metric)) return { ok: false, reason: 'unknown_metric' };
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem } = context.value;
    const before = await this.storedMeasure(workItem.projectId, id, stepId, metric);
    const stamp = this.clock.stampFor(actorId);
    await this.opts.measures.remove(id, stepId, metric, stamp);
    await this.announceTree(workItem.projectId);
    // Nothing was stored in this metric, so nothing changed and there is
    // nothing to put back — `clearActual`'s skip, per metric.
    if (before !== null) {
      await this.record(
        workItem.projectId,
        stamp,
        'clear_measure',
        `clear the recorded ${MEASURE_LABELS[metric]} on ${quoteName(workItem.name)}`,
        {
          forward: { do: 'clear_measure', workItemId: id, stepId, metric },
          inverse: { do: 'set_measure', workItemId: id, stepId, metric, value: before },
          touched: [id],
          before: context.value.rows,
        },
      );
    }
    return { ok: true, value: null };
  }

  /**
   * States where one step's work on one work item has got to.
   *
   * Guarded exactly as {@link WorkItemService.setActual} is, and the two
   * refusals are the same two for the same reasons: a row with children is
   * `rolled_up`, because its reading is folded from what is below it and a
   * stored state there would be ignored by every reader; a `stepId` this project
   * does not hold is `unknown_step`.
   *
   * **Nothing about this reaches the schedule.** Recording that a step is done
   * moves no date, no bar and no critical path — `libs/wbs/domain/domain/src/schedule.ts` has an
   * empty diff in the change that adds this. What it buys is that the number
   * beside it becomes readable: 8 days spent against 5 estimated, **finished**,
   * is a variance somebody can act on, and 8 days spent against 5 estimated,
   * still running, is a different sentence about the same two numbers.
   *
   * **What `done` makes true, and it is a rule rather than a note:** an actual on
   * a step marked done is **final** — the whole of what that step spent, not a
   * running count. The change that lets the engine consume this reads exactly
   * that (finished steps freeze; in-progress steps get
   * `remaining = max(0, estimate − actual)`), and it must not have to
   * re-litigate the meaning of rows this method wrote.
   *
   * Journalled through the same {@link WorkItemService.record} seam as every
   * other command, which is what makes it undoable and what puts it in the
   * plan's history without a second write path.
   */
  async setProgress(
    id: string,
    actorId: string,
    stepId: string,
    state: StepState,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { rows, workItem } = context.value;
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    if (!(await this.holdsStep(workItem.projectId, stepId)))
      return { ok: false, reason: 'unknown_step' };
    const before = await this.storedProgress(workItem.projectId, id, stepId);
    const stamp = this.clock.stampFor(actorId);
    // `statedAt` off the act's own stamp — {@link setActual}'s reading of
    // `recordedAt`, in this method's tense.
    const written = await this.opts.progress.set(
      { workItemId: id, stepId, state, statedAt: stamp.at },
      stamp,
    );
    if (written === 'unknown_step') return { ok: false, reason: 'unknown_step' };
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      'progress',
      `${state === 'done' ? 'finish' : 'start'} work on ${quoteName(workItem.name)}`,
      {
        forward: { do: 'set_progress', workItemId: id, stepId, state },
        // What was said before, or that nothing was. A `clear_progress` inverse
        // is what makes undoing the first statement take the row away rather
        // than write a `unknown` — the one value this table must never hold,
        // because it is the absence of a row everywhere else.
        inverse:
          before === null
            ? { do: 'clear_progress', workItemId: id, stepId }
            : { do: 'set_progress', workItemId: id, stepId, state: before },
        touched: [id],
        before: context.value.rows,
      },
    );
    return { ok: true, value: null };
  }

  /**
   * Sets the independent direct blockage fact on a project leaf. Validates
   * ownership, leaf and step before equivalence; equivalent presence changes
   * no stamps, events or journal. New blockage on done is refused, while a
   * retained fact may be cleared. Conditional replay preserves its exact time,
   * including restoration beneath done, without changing progress or schedule.
   */
  async setStepBlocked(
    id: string,
    actorId: string,
    stepId: string,
    isBlocked: boolean,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    // Proof: removing refusal made direct ownership negative reject instead of returning its refusal; watched 2026-10-14.
    if (!context.ok) return context;
    const { rows, workItem } = context.value;
    // Proof: removing leaf guard let mounted absent-parent clear succeed; watched 2026-10-14.
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    // Proof: removing step guard let unknown-service-step clear succeed; watched 2026-10-14.
    if (!(await this.holdsStep(workItem.projectId, stepId)))
      return { ok: false, reason: 'unknown_step' };
    const before =
      (await this.opts.blockages.listByWorkItems(workItem.projectId, [id])).find(
        (fact) => fact.workItemId === id && fact.stepId === stepId,
      )?.blockedAt ?? null;
    // Proof: removing equivalence changed the mounted no-op full snapshot; watched 2026-10-14.
    if ((before !== null) === isBlocked) return { ok: true, value: null };
    // Proof: removing done guard committed the mounted forbidden batch; watched 2026-10-14.
    if (isBlocked && (await this.storedProgress(workItem.projectId, id, stepId)) === 'done')
      return { ok: false, reason: 'node_done' };
    const stamp = this.clock.stampFor(actorId);
    const after = isBlocked ? stamp.at : null;
    if (after === null) {
      await this.opts.blockages.remove(id, stepId, stamp);
    } else {
      const written = await this.opts.blockages.set(
        { workItemId: id, stepId, blockedAt: after },
        stamp,
      );
      // Proof: ignoring store refusal committed the memory batch's prior patch; watched 2026-10-14.
      if (written !== 'written') throw new Error(`cannot set step blockage: ${written}`);
    }
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      'step_blockage',
      `${isBlocked ? 'block' : 'unblock'} a step on ${quoteName(workItem.name)}`,
      {
        forward: {
          do: 'replace_blockage',
          workItemId: id,
          stepId,
          expectedBlockedAt: before,
          replacementBlockedAt: after,
        },
        inverse: {
          do: 'replace_blockage',
          workItemId: id,
          stepId,
          expectedBlockedAt: after,
          replacementBlockedAt: before,
        },
        touched: [id],
        before: rows,
      },
    );
    return { ok: true, value: null };
  }

  /**
   * Takes the statement back, leaving the step reading as not started.
   *
   * Idempotent, and not refused on a rolled-up row, for exactly the reasons
   * {@link WorkItemService.clearActual} gives: clearing what is not stored is
   * the state the caller asked for, and a parent cannot hold a row to begin
   * with. A missing **work item** is still `not_found`.
   *
   * Worth saying plainly, because it is the one place this table can lose
   * information a reader was relying on: clearing a `done` does not say the work
   * was undone, it says nobody has spoken about it. Those are different
   * sentences and this is the second one.
   */
  async clearProgress(id: string, actorId: string, stepId: string): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem } = context.value;
    const before = await this.storedProgress(workItem.projectId, id, stepId);
    const stamp = this.clock.stampFor(actorId);
    await this.opts.progress.remove(id, stepId, stamp);
    await this.announceTree(workItem.projectId);
    // Nothing was stated, so nothing changed and there is nothing to put back —
    // the same skip `clearEstimate` and `clearActual` make, and the reason a
    // plan does not gain a history row every time somebody clears an empty box.
    if (before !== null) {
      await this.record(
        workItem.projectId,
        stamp,
        'clear_progress',
        `clear the progress on ${quoteName(workItem.name)}`,
        {
          forward: { do: 'clear_progress', workItemId: id, stepId },
          inverse: { do: 'set_progress', workItemId: id, stepId, state: before },
          touched: [id],
          before: context.value.rows,
        },
      );
    }
    return { ok: true, value: null };
  }

  /**
   * Starts the next attempt at one step node (`step-node-attempts` D2): number
   * the node's highest plus one, assigned by the store inside the write.
   *
   * Refused in order: `rolled_up` on a parent and `unknown_step`, as
   * {@link setProgress}; `node_done` when the node's statement is `done` (it
   * must be reopened first); `attempt_running` while one runs, which the
   * store's unique partial index also refuses; `attempt_in_future` when `at` is
   * after this act's own write stamp — the server's clock, never the client's;
   * `unknown_person` for an executor the directory does not hold. `at` absent
   * is the stamp.
   *
   * Writes no statement: an attempt is history, and the progress a reader sees
   * stays whatever was said. One journal entry, whose inverse removes the
   * attempt by its number and whose forward writes it back verbatim.
   */
  async startAttempt(
    id: string,
    actorId: string,
    stepId: string,
    start: {
      at?: number;
      executorPersonId?: string;
      reference?: string;
      note?: string;
    },
  ): Promise<WorkItemOutcome<{ attemptNumber: number }>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { rows, workItem } = context.value;
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    if (!(await this.holdsStep(workItem.projectId, stepId)))
      return { ok: false, reason: 'unknown_step' };
    // The fast path only: the store reads the node's state again inside the
    // start's `BEGIN IMMEDIATE`, which is the refusal another process cannot
    // slip past. Proof, watched 2026-10-12: this refusal removed, `refuses
    // node_done, attempt_running and attempt_in_future at their command index`
    // in `step-node-attempt.controller.db.test.ts` still refused on the store's
    // read; with that removed as well the batch answered 200 (`- "error":
    // "node_done"` / `+ "results": [...]`).
    if ((await this.storedProgress(workItem.projectId, id, stepId)) === 'done')
      return { ok: false, reason: 'node_done' };
    // Proof: this refusal removed, the same case still passed on the store's
    // own `attempt_running` — the partial index's face, as D1 intends; with
    // the store's refusal also removed it answered 500, the index refusing
    // the row (never 200); watched 2026-10-12.
    if ((await this.runningAttempt(id, stepId)) !== null)
      return { ok: false, reason: 'attempt_running' };
    const stamp = this.clock.stampFor(actorId);
    const startedAt = start.at ?? stamp.at;
    // Proof: compared to `Date.now()` instead of the stamp, `takes the write
    // stamp as the start and refuses an at after it, never the client clock`
    // in `work-item.resource.test.ts` started the attempt (`- Expected - 2 /
    // + Received + 4`); removed, the mounted future case answered 200 where
    // 422 was owed; watched 2026-10-12.
    if (startedAt > stamp.at) return { ok: false, reason: 'attempt_in_future' };
    const executorPersonId = start.executorPersonId ?? null;
    if (executorPersonId !== null && !(await this.holdsPerson(executorPersonId)))
      return { ok: false, reason: 'unknown_person' };
    const started = await this.opts.attempts.start(
      {
        workItemId: id,
        stepId,
        startedAt,
        executorPersonId,
        reference: start.reference ?? null,
        note: start.note ?? null,
      },
      stamp,
    );
    if (!started.ok) return { ok: false, reason: started.reason };
    const { attempt } = started;
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      'start_attempt',
      `started attempt ${String(attempt.attemptNumber)} of ${await this.nodeLabel(rows, workItem, stepId)}`,
      {
        forward: { do: 'restore_attempt', attempt },
        inverse: {
          do: 'remove_attempt',
          workItemId: id,
          stepId,
          attemptNumber: attempt.attemptNumber,
        },
        touched: [id],
        before: rows,
      },
    );
    return { ok: true, value: { attemptNumber: attempt.attemptNumber } };
  }

  /**
   * Ends the node's running attempt with an outcome (`step-node-attempts` D2).
   *
   * Refused in order: `rolled_up`, `unknown_step`; `no_running_attempt`;
   * `attempt_in_future` when `at` is after the write stamp;
   * `attempt_ends_before_start` when `at` precedes the running attempt's start —
   * checked here because the database's order `CHECK` would otherwise throw. A
   * reference or note given replaces the stored one; absent keeps it.
   *
   * One journal entry whose inverse writes the running row back **verbatim** —
   * a patch of the prior values, never a delete — so one undo leaves the
   * attempt running with no outcome, as it was.
   */
  async endAttempt(
    id: string,
    actorId: string,
    stepId: string,
    end: { outcome: AttemptOutcome; at?: number; reference?: string; note?: string },
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { rows, workItem } = context.value;
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    if (!(await this.holdsStep(workItem.projectId, stepId)))
      return { ok: false, reason: 'unknown_step' };
    const running = await this.runningAttempt(id, stepId);
    // Proof: this refusal removed made `refuses no_running_attempt and
    // attempt_ends_before_start` in `step-node-attempt.controller.db.test.ts`
    // answer 500 (`null is not an object (evaluating 'running.startedAt')`)
    // where 409 was owed; watched 2026-10-12.
    if (running === null) return { ok: false, reason: 'no_running_attempt' };
    const stamp = this.clock.stampFor(actorId);
    const endedAt = end.at ?? stamp.at;
    if (endedAt > stamp.at) return { ok: false, reason: 'attempt_in_future' };
    // Proof: this refusal removed made the same case answer 500, `CHECK
    // constraint failed: step_node_attempt_order`, where 422 was owed;
    // watched 2026-10-12.
    if (endedAt < running.startedAt) return { ok: false, reason: 'attempt_ends_before_start' };
    const ended = await this.opts.attempts.end(
      {
        workItemId: id,
        stepId,
        endedAt,
        outcome: end.outcome,
        ...(end.reference === undefined ? {} : { reference: end.reference }),
        ...(end.note === undefined ? {} : { note: end.note }),
      },
      stamp,
    );
    if (!ended.ok) return { ok: false, reason: ended.reason };
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      'end_attempt',
      `ended attempt ${String(ended.attempt.attemptNumber)} of ${await this.nodeLabel(rows, workItem, stepId)} ${end.outcome}`,
      {
        forward: { do: 'restore_attempt', attempt: ended.attempt },
        // Proof: written as a `remove_attempt` (a delete), `one undo per
        // command restores the row verbatim` in `work-item.resource.test.ts`
        // read `[]` where the running attempt was owed (`- Expected - 13 /
        // + Received + 1`); watched 2026-10-12.
        inverse: { do: 'restore_attempt', attempt: ended.prior },
        touched: [id],
        before: rows,
      },
    );
    return { ok: true, value: null };
  }

  /**
   * Takes one attempt off a node by its number, as a correction
   * (`step-node-attempts` D2); `unknown_attempt` when the node holds no such
   * number. A later start takes the highest remaining plus one, so a removed
   * number below the highest is never reused.
   *
   * One journal entry whose inverse writes the row back verbatim, number and
   * all.
   */
  async removeAttempt(
    id: string,
    actorId: string,
    stepId: string,
    attemptNumber: number,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { rows, workItem } = context.value;
    if (rows.some((row) => row.parentId === id)) return { ok: false, reason: 'rolled_up' };
    if (!(await this.holdsStep(workItem.projectId, stepId)))
      return { ok: false, reason: 'unknown_step' };
    const stamp = this.clock.stampFor(actorId);
    const removed = await this.opts.attempts.remove(id, stepId, attemptNumber, stamp);
    // Proof: answered `ok` instead, `refuses unknown_attempt` in
    // `step-node-attempt.controller.db.test.ts` answered 200 where 404 was
    // owed; watched 2026-10-12.
    if (removed === null) return { ok: false, reason: 'unknown_attempt' };
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      'remove_attempt',
      `removed attempt ${String(attemptNumber)} of ${await this.nodeLabel(rows, workItem, stepId)}`,
      {
        forward: { do: 'remove_attempt', workItemId: id, stepId, attemptNumber },
        inverse: { do: 'restore_attempt', attempt: removed },
        touched: [id],
        before: rows,
      },
    );
    return { ok: true, value: null };
  }

  /**
   * Sets the row's **status** as one act — the row-level mark ADR 0024 gives a
   * face to — by writing the statements the status is folded from, never a
   * status of its own.
   *
   * `done` writes `done` on every step of the project for the leaf, or for
   * every leaf beneath a parent; a step already saying so is left alone. Every
   * work item the act speaks for — the leaves and, for a parent, the parent
   * itself — takes `on` as its fact end when it holds none, and `factStart`,
   * when given, as its fact start when it holds none; a typed day is never
   * overwritten. `on` absent, a leaf holding an ended attempt takes the day
   * its last attempt ended, and every other row the day of this act's own
   * stamp; `factStart` absent, `done` and `in_progress` give a leaf holding
   * any attempt the day its first attempt started (`step-node-attempts` D4).
   * Every such day is read in the project's timezone
   * ({@link isoDateOfInstantIn}), so a `UTC` project with no attempts fills
   * exactly what it always did: one clock read, never a second `now()`.
   *
   * @throws when the project has no stored timezone: trusted state.
   *
   * `unknown` takes every statement off every leaf in scope and, off every
   * in-scope work item that **read done** before the act — the leaves and the
   * row itself — takes both facts away too: a finish that is unmarked did not
   * happen, and the days it began and ended on go with it (`status-at-a-glance`,
   * then Dany on 2026-09-13: "when from done -> unknown clear fact start and
   * fact end"). Which rows read done is the read's own fold over the statements
   * as they stood, never a stored flag. The facts of a row that was in progress
   * or unknown stand: clearing a status says nobody has spoken, not that the
   * planner's records were wrong.
   *
   * **One journal entry.** Two or more steps are recorded as one `batch` whose
   * inverse walks them backwards, so one undo puts every prior statement back —
   * `set_progress(before)` or `clear_progress` — and empties every fact end this
   * act filled or restores every one it cleared. One step is recorded as itself. **Nothing changing writes
   * nothing**: no row, no journal entry, no tree change, which is
   * {@link arrangeBySchedule}'s rule. The forward steps run through
   * {@link apply}, the same arm an undo replays them through, so a mark and its
   * redo cannot write two different things.
   *
   * A parent is **not** `rolled_up` here, unlike {@link setProgress}: speaking
   * for the leaves beneath it is the point.
   *
   * **Readiness and holds** (`add-work-item-statuses`, ADR 0032). `done` also
   * clears each leaf's hold; `unknown` clears readiness and hold. `ready` and
   * `draft` set readiness and clear the hold, refused `readiness_after_progress`
   * once any leaf in scope holds a statement. `on_hold` and `blocked` set the
   * hold and nothing else, refused `cannot_hold_done` when the row reads done;
   * beneath a parent, a leaf reading done is left alone. `in_progress` writes
   * `in_progress` on a leaf's first silent step, fills its empty fact start and
   * clears its hold; on a leaf reading done it reopens the last step and clears
   * the fact end instead. On a parent it starts one leaf: the first in tree
   * order with no statement, unheld preferred; a parent reading done reopens
   * its first leaf and clears its own fact end; a parent already in progress
   * writes nothing. A project with no steps refuses `in_progress` and `done`
   * with `no_steps`.
   *
   * Proof: the `steps.length === 0` return deleted and `writes nothing when
   * nothing would change` fails on `Expected: 0 · Received: 1` journal entries —
   * an empty batch journalled; the `factEnd !== null` skip deleted and `keeps a
   * fact end somebody typed` fails on `Expected: "2026-09-10" / Received:
   * "2026-09-12"`. Both watched 2026-09-12.
   *
   * The inverse is reversed for {@link recordCollected}'s reason and not for a
   * fault this method can produce: every step it builds touches a different
   * (work item, step) pair or a different work item's fact end, so no order of
   * the inverses changes what they restore. Reversing it unreversed was
   * watched **passing** `one undo puts every statement back` — the order is a
   * convention here, and this paragraph is where that is said rather than a
   * `Proof:` that names a red nobody saw.
   */
  async setStatus(
    id: string,
    actorId: string,
    status: SettableStatus,
    on?: IsoDate,
    factStart?: IsoDate,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { rows, workItem } = context.value;
    const stamp = this.clock.stampFor(actorId);
    const zone = await this.opts.projects.timezoneOf(workItem.projectId);
    // `contextFor` has just read the project, so a missing zone is a store
    // that lost its row, never a project to read in some default zone.
    if (zone === null) throw new Error(`project ${workItem.projectId} has no timezone`);
    // Proof: `zone` replaced by 'UTC' here made `Kyiv at 23:30Z fills the
    // next day` read `factEnd: "2026-09-12"` for `"2026-09-13"`; watched
    // 2026-10-12.
    const day = on ?? isoDateOfInstantIn(zone, stamp.at);
    const hasChildren = new Set(rows.map((row) => row.parentId));
    const order = treeOrder(rows);
    const leaves = subtreeOf(rows, id)
      .filter((each) => !hasChildren.has(each))
      .sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
    const witness = attemptWitness(
      await this.opts.attempts.listByWorkItems(workItem.projectId, leaves),
      zone,
    );
    const projectSteps = await this.opts.projects.stepsOf(workItem.projectId);
    // Proof: this refusal removed made `refuses in progress and done with
    // no_steps` fail on `Expected: {ok: false, reason: "no_steps"}, Received:
    // {ok: true}` — a done mark with no step to write; watched 2026-09-29.
    if ((status === 'done' || status === 'in_progress') && projectSteps.length === 0) {
      return { ok: false, reason: 'no_steps' };
    }
    const stated = await this.opts.progress.listByProject(workItem.projectId);
    const statedOf = new Map(
      stated.map((each) => [progressKey(each.workItemId, each.stepId), each.state]),
    );
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const rowOf = (rowId: string): WorkItem => {
      const row = rowsById.get(rowId);
      if (row === undefined) throw new Error(`${rowId} is not a row of this project`);
      return row;
    };
    // What each row read before this act: the read's own progress fold, never
    // a stored flag, so the cell and this method agree about "was done".
    const attempted = await this.opts.attempts.listByProject(workItem.projectId);
    const wasDone = rollUpWorkItemStatuses(
      rows,
      rollUpProgress(
        rows,
        stated,
        workedStepsOf(
          await this.opts.estimates.listByProject(workItem.projectId),
          await this.opts.actuals.listByProject(workItem.projectId),
          stated,
          attempted,
        ),
        attempted.filter((attempt) => attempt.endedAt === null),
      ),
    );
    const readsDone = (rowId: string) => wasDone.get(rowId) === 'done';
    const steps: { forward: CompensatingCommand; inverse: CompensatingCommand }[] = [];
    /** One `patch` step naming only the fields that change, with its verbatim inverse. */
    const patchRow = (
      rowId: string,
      wanted: {
        readiness?: Readiness | null;
        hold?: Hold | null;
        factEnd?: IsoDate | null;
        factStart?: IsoDate | null;
      },
    ) => {
      const row = rowOf(rowId);
      const forward: WorkItemPatch = {};
      const inverse: WorkItemPatch = {};
      if (wanted.readiness !== undefined && wanted.readiness !== row.readiness) {
        forward.readiness = wanted.readiness;
        inverse.readiness = row.readiness;
      }
      if (wanted.hold !== undefined && wanted.hold !== row.hold) {
        forward.hold = wanted.hold;
        // Proof: this line removed made `holds every leaf beneath a parent,
        // and one undo restores each prior hold` fail — the undo left every
        // leaf on hold; watched 2026-09-29.
        inverse.hold = row.hold;
      }
      if (wanted.factEnd !== undefined && wanted.factEnd !== row.factEnd) {
        forward.factEnd = wanted.factEnd;
        inverse.factEnd = row.factEnd;
      }
      if (wanted.factStart !== undefined && wanted.factStart !== row.factStart) {
        forward.factStart = wanted.factStart;
        inverse.factStart = row.factStart;
      }
      if (Object.keys(forward).length === 0) return;
      steps.push({
        forward: { do: 'patch', workItemId: rowId, patch: forward },
        inverse: { do: 'patch', workItemId: rowId, patch: inverse },
      });
    };
    const setStep = (leafId: string, stepId: string, state: StepState) => {
      const before = statedOf.get(progressKey(leafId, stepId)) ?? null;
      if (before === state) return;
      steps.push({
        forward: { do: 'set_progress', workItemId: leafId, stepId, state },
        inverse:
          before === null
            ? { do: 'clear_progress', workItemId: leafId, stepId }
            : { do: 'set_progress', workItemId: leafId, stepId, state: before },
      });
    };
    const hasStatement = (leafId: string) =>
      projectSteps.some((step) => statedOf.has(progressKey(leafId, step.id)));
    /** Starts one leaf: reopen it when it reads done, else speak for its first silent step. */
    const startLeaf = (leafId: string) => {
      if (readsDone(leafId)) {
        const last = projectSteps.at(-1);
        if (last === undefined) throw new Error('no_steps was refused above');
        setStep(leafId, last.id, 'in_progress');
        patchRow(leafId, { factEnd: null, hold: null });
        return;
      }
      const silent = projectSteps.find((step) => !statedOf.has(progressKey(leafId, step.id)));
      if (silent !== undefined) setStep(leafId, silent.id, 'in_progress');
      patchRow(leafId, {
        hold: null,
        ...(rowOf(leafId).factStart === null
          ? { factStart: factStart ?? witness.get(leafId)?.startedOn ?? day }
          : {}),
      });
    };

    if (status === 'done') {
      for (const leafId of leaves) {
        for (const step of projectSteps) setStep(leafId, step.id, 'done');
        patchRow(leafId, { hold: null });
      }
      for (const spokenFor of new Set([...leaves, id])) {
        const row = rowOf(spokenFor);
        // A leaf's attempts are the better witness than the day of the mark:
        // the work ended when its last attempt did, and began with its first.
        // Proof: the witness skipped (`attempted` read as undefined) made
        // `done fills the fact end from the last attempt's end day in the
        // project zone` read the act's day — `factEnd: "2026-10-11"` for
        // `"2026-10-10"` and `factStart: null` for `"2026-10-08"`; watched
        // 2026-10-12.
        const attempted = witness.get(spokenFor);
        const startedOn = factStart ?? attempted?.startedOn;
        // The two fills, each only where the row holds nothing: a typed day is
        // the planner's record and is never overwritten by a mark.
        patchRow(spokenFor, {
          ...(row.factEnd === null ? { factEnd: on ?? attempted?.endedOn ?? day } : {}),
          ...(startedOn !== undefined && row.factStart === null ? { factStart: startedOn } : {}),
        });
      }
    } else if (status === 'unknown') {
      const inScope = new Set(leaves);
      for (const each of stated) {
        if (!inScope.has(each.workItemId)) continue;
        steps.push({
          forward: { do: 'clear_progress', workItemId: each.workItemId, stepId: each.stepId },
          inverse: {
            do: 'set_progress',
            workItemId: each.workItemId,
            stepId: each.stepId,
            state: each.state,
          },
        });
      }
      for (const leafId of leaves) patchRow(leafId, { readiness: null, hold: null });
      for (const spokenFor of new Set([...leaves, id])) {
        // Proof: this guard dropped, and `unknown on a row that was not done
        // leaves its typed fact end` fails on `Expected: "2026-09-10" /
        // Received: null` — an in-progress row's typed day taken as if the
        // finish it records had been unmarked; watched 2026-09-13.
        if (!readsDone(spokenFor)) continue;
        // Both facts go with the statements (Dany, 2026-09-13: "when from done
        // -> unknown clear fact start and fact end"): a finish that is unmarked
        // did not happen, and the days it began and ended on go with it.
        patchRow(spokenFor, { factEnd: null, factStart: null });
      }
    } else if (status === 'ready' || status === 'draft') {
      // Proof: this refusal removed made `refuses readiness once a step has
      // spoken, and writes nothing` fail on `Expected: {ok: false, reason:
      // "readiness_after_progress"}, Received: {ok: true}`; watched 2026-09-29.
      if (leaves.some(hasStatement)) return { ok: false, reason: 'readiness_after_progress' };
      for (const leafId of leaves) patchRow(leafId, { readiness: status, hold: null });
    } else if (status === 'on_hold' || status === 'blocked') {
      // Proof: this refusal removed made `refuses a hold on a leaf reading
      // done` fail on `Expected: {ok: false, reason: "cannot_hold_done"},
      // Received: {ok: true}`; watched 2026-09-29.
      if (readsDone(id)) return { ok: false, reason: 'cannot_hold_done' };
      for (const leafId of leaves) {
        // A done leaf keeps no hold: one held before it finished loses it here.
        // Proof: done leaves skipped outright made `takes the hold off a done
        // leaf when its branch is held` fail on `hold: "on_hold"`; watched
        // 2026-09-29.
        patchRow(leafId, { hold: readsDone(leafId) ? null : status });
      }
    } else if (!leaves.includes(id)) {
      // `in_progress` on a parent: one leaf starts, the rest are untouched.
      // The status the row reads, holds and the graph included: a held branch
      // whose progress fold says in progress is not already started.
      // Proof: the progress-only fold consulted here made `starts a held branch
      // whose progress fold reads in progress…` fail — nothing was written;
      // watched 2026-09-29.
      const reading = workItemStatusesOf(rows, wasDone, {
        edges: (await this.opts.dependencies.listByProject(workItem.projectId)).filter(
          (edge) => rowsById.has(edge.predecessorId) && rowsById.has(edge.successorId),
        ),
        typed: await this.opts.typedDependencies.listByProject(workItem.projectId),
      });
      if (reading.get(id) === 'in_progress') return { ok: true, value: null };
      if (readsDone(id)) {
        const first = leaves.at(0);
        if (first === undefined) throw new Error(`parent ${id} reads done with no leaf`);
        startLeaf(first);
        patchRow(id, { factEnd: null });
      } else {
        const silent = leaves.filter((leafId) => !hasStatement(leafId));
        const chosen = silent.find((leafId) => rowOf(leafId).hold === null) ?? silent.at(0) ?? null;
        if (chosen !== null) startLeaf(chosen);
      }
    } else {
      startLeaf(id);
    }

    if (steps.length === 0) return { ok: true, value: null };
    for (const { forward } of steps) {
      const applied = await this.apply(workItem.projectId, forward, stamp);
      // Every step was built from rows and steps read a moment ago in this same
      // act, so a refusal here is the world moving underneath a write — an
      // invariant break to report loudly, not an outcome to model.
      if (!applied.ok) throw new Error(`setStatus could not ${forward.do}: ${applied.detail}`);
    }
    await this.announceTree(workItem.projectId);
    const touched = [...new Set(steps.flatMap((each) => touchedBy(each.forward)))];
    const [only] = steps;
    await this.record(
      workItem.projectId,
      stamp,
      'status',
      statusSentence(status, quoteName(workItem.name)),
      steps.length === 1
        ? { forward: only.forward, inverse: only.inverse, touched, before: rows }
        : {
            forward: { do: 'batch', steps: steps.map((each) => each.forward) },
            inverse: { do: 'batch', steps: steps.map((each) => each.inverse).reverse() },
            touched,
            before: rows,
          },
    );
    return { ok: true, value: null };
  }

  /** Checked detached facts for every old/new endpoint, before labels or mutation. */
  private async typedEvidence(
    context: DependencyContext,
    projectId: string,
    relationships: readonly StoredTypedDependency[],
  ): Promise<
    | {
        ok: true;
        endpoints: Map<string, EndpointEvidence>;
        externalBefore: readonly ScopedRevision[];
      }
    | { ok: false; reason: WorkItemRefusal }
  > {
    const external = relationships.some(
      (relationship) =>
        relationship.predecessor.projectId !== projectId ||
        relationship.successor.projectId !== projectId,
    );
    const endpoints = new Map<string, EndpointEvidence>();
    for (const relationship of relationships)
      for (const endpoint of [relationship.predecessor, relationship.successor]) {
        const key = JSON.stringify(endpoint);
        if (endpoints.has(key)) continue;
        const read = await context.endpoints.readEndpoint(endpoint);
        // Proof: external-owner-step-concealment bypass failed `mounted owner-step`'s selected assertion
        // (actual SQLite boundary; watched 2026-10-22).
        if (!read.ok)
          return {
            ok: false,
            reason: external && read.reason === 'unknown_step' ? 'not_found' : read.reason,
          };
        const evidence = read.evidence;
        if (endpoint.scope === 'node' && !evidence.isLeaf)
          return { ok: false, reason: 'rolled_up' };
        if (endpoint.scope === 'descendant-step' && evidence.isLeaf)
          return { ok: false, reason: 'not_a_parent' };
        endpoints.set(key, evidence);
      }
    const remote = [...endpoints.values()]
      .filter((evidence) => evidence.endpoint.projectId !== projectId)
      .map((evidence) => ({
        projectId: evidence.endpoint.projectId,
        workItemId: evidence.endpoint.workItemId,
      }));
    const revisions = await context.endpoints.readRevisions(remote);
    if (!revisions.ok) return revisions;
    return { ok: true, endpoints, externalBefore: revisions.revisions };
  }

  /** Complete proposed owner set checked against the fresh connected graph. */
  private async typedRefusal(
    projectId: string,
    actorId: string,
    existing: readonly StoredTypedDependency[],
    proposed: StoredTypedDependency,
  ): Promise<WorkItemRefusal | null> {
    if (!isWritableRelationshipType(proposed.type)) return 'unsupported_relationship_type';
    // Proof: removing only this guard changed misowned resulting-relationship redo
    // from stale_undo/not_found to the working-plan owner throw, before storage
    // (admitted redo test, 2026-10-22); entry guards stayed installed.
    if (proposed.projectId !== projectId || proposed.successor.projectId !== projectId)
      return 'not_found';
    return withDependencyContext(
      this.opts.dependencyContext,
      projectId,
      actorId,
      async (context) => {
        const evidence = await this.typedEvidence(context, projectId, [proposed]);
        if (!evidence.ok) return evidence.reason;
        // Proof: bypassing this consumer restored mounted pending-endpoint add/update
        // HTTP500 instead of modeled HTTP409; all-table refusal snapshots pass (2026-10-22).
        if (await this.opts.typedDependencies.hasDeletingEndpoint(proposed))
          return 'project_deleting';
        if (proposed.predecessor.projectId !== projectId && !this.externalDependenciesActive)
          return 'external_dependencies_inactive';
        if (
          existing.some(
            (row) =>
              row.id !== proposed.id &&
              formatScopedDependencyKey(row) === formatScopedDependencyKey(proposed),
          )
        )
          return 'duplicate_dependency';
        // Proof: typed-complete-connected-cycle bypass failed `connected guard accepts step interleaving`'s selected assertion
        // (actual SQLite boundary; watched 2026-10-22).
        // Proof: bypassing this consumer failed `connected typed-add refuses`
        // at its real SQLite refusal assertion; zero partial effects also checked (2026-10-22).
        // Proof: bypassing this consumer failed `connected typed-update refuses`
        // at its real SQLite refusal assertion; zero partial effects also checked (2026-10-22).
        // Proof: suppressing this consumer changed both synthetic mounted compound remote-cycle
        // undo/redo details to the final cycle fallback; A/B revisions stayed unchanged (2026-10-23).
        const cycle = await context.graph.findCycle(projectId, {
          typed: [...existing.filter((row) => row.id !== proposed.id), proposed],
        });
        return cycle === null ? null : cycle.kind === 'self_node' ? 'self_node' : 'cycle';
      },
    );
  }

  /** Labels use only facts that have passed endpoint authority in this observation. */
  private endpointLabel(
    endpoint: ScopedDependencyEndpoint,
    evidence: ReadonlyMap<string, EndpointEvidence>,
    ownerId: string,
  ): string {
    const found = evidence.get(JSON.stringify(endpoint));
    if (found === undefined) throw new Error('checked typed endpoint evidence is missing');
    return endpoint.projectId === ownerId
      ? found.name
      : `${found.projectAbbreviation}.${found.workItemNumber} ${found.name}`;
  }

  /**
   * Compares a journalled relationship with the current stored row.
   * Proof: bypassing the endpoint/type key comparison made `refuses undo when only a
   * journalled relationship type changed outside history` receive 200 instead of 409;
   * watched 2026-09-28.
   */
  private sameTypedDependency(
    left: StoredTypedDependency | undefined,
    right: StoredTypedDependency,
  ): boolean {
    if (left === undefined) return false;
    return (
      left.id === right.id &&
      left.projectId === right.projectId &&
      // Proof: bypassing this consumer failed `corrupt scoped stored-row delivery`
      // at its real SQLite refusal assertion; zero partial effects also checked (2026-10-22).
      formatScopedDependencyKey(left) === formatScopedDependencyKey(right)
    );
  }

  /** Adds a scoped relationship; explicit endpoint projects are never overwritten. */
  async addTypedDependency(
    projectId: string,
    actorId: string,
    input: {
      predecessor: ScopedDependencyEndpoint;
      successor: ScopedDependencyEndpoint;
      type: string;
    },
  ): Promise<WorkItemOutcome<string>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(project, actorId)) return { ok: false, reason: 'forbidden' };
    if (!isWritableRelationshipType(input.type))
      return { ok: false, reason: 'unsupported_relationship_type' };
    // Proof: independently removing this entry guard read the protected second
    // successor in the corresponding add/update SQLite test (2026-10-22).
    if (input.successor.projectId !== projectId) return { ok: false, reason: 'not_found' };
    const dependency: StoredTypedDependency = {
      id: this.clock.newId(),
      projectId,
      ...input,
      type: input.type,
    };
    return withDependencyContext(
      this.opts.dependencyContext,
      projectId,
      actorId,
      async (context) => {
        const evidence = await this.typedEvidence(context, projectId, [dependency]);
        if (!evidence.ok) return evidence;
        if (input.predecessor.projectId !== projectId && !this.externalDependenciesActive)
          return { ok: false, reason: 'external_dependencies_inactive' };
        const rows = await this.opts.workItems.listByProject(projectId);
        const existing = await this.opts.typedDependencies.listByProject(projectId);
        const refusal = await this.typedRefusal(projectId, actorId, existing, dependency);
        if (refusal !== null) return { ok: false, reason: refusal };
        const stamp = this.clock.stampFor(actorId);
        context.assertUsable(projectId, actorId);
        await this.opts.typedDependencies.add(dependency, stamp);
        await this.announceTree(projectId);
        await this.record(
          projectId,
          stamp,
          'add_typed_dependency',
          `make ${quoteName(this.endpointLabel(input.successor, evidence.endpoints, projectId))} wait for ${quoteName(this.endpointLabel(input.predecessor, evidence.endpoints, projectId))}`,
          {
            forward: { do: 'add_typed_dependency', dependency },
            inverse: { do: 'remove_typed_dependency', dependency },
            touched: touchedBy({ do: 'add_typed_dependency', dependency }),
            before: rows,
            ...(evidence.externalBefore.length === 0
              ? {}
              : { externalBefore: evidence.externalBefore }),
          },
        );
        return { ok: true, value: dependency.id };
      },
    );
  }

  /** Updates an owned relationship, rechecking old and new endpoint authority first. */
  async updateTypedDependency(
    projectId: string,
    actorId: string,
    dependencyId: string,
    input: {
      predecessor: ScopedDependencyEndpoint;
      successor: ScopedDependencyEndpoint;
      type: string;
    },
  ): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(project, actorId)) return { ok: false, reason: 'forbidden' };
    if (!isWritableRelationshipType(input.type))
      return { ok: false, reason: 'unsupported_relationship_type' };
    // Proof: independently removing this entry guard read the protected second
    // successor in the corresponding add/update SQLite test (2026-10-22).
    if (input.successor.projectId !== projectId) return { ok: false, reason: 'not_found' };
    const existing = await this.opts.typedDependencies.listByProject(projectId);
    const from = existing.find((row) => row.id === dependencyId);
    if (from === undefined) return { ok: false, reason: 'unknown_dependency' };
    const to: StoredTypedDependency = { id: dependencyId, projectId, ...input, type: input.type };
    return withDependencyContext(
      this.opts.dependencyContext,
      projectId,
      actorId,
      async (context) => {
        // Proof: old-update-evidence bypass failed `update refuses an injected denial`'s selected assertion
        // (actual SQLite boundary; watched 2026-10-22).
        const evidence = await this.typedEvidence(context, projectId, [from, to]);
        if (!evidence.ok) return evidence;
        if (
          [from, to].some((dependency) => dependency.predecessor.projectId !== projectId) &&
          !this.externalDependenciesActive
        )
          return { ok: false, reason: 'external_dependencies_inactive' };
        const rows = await this.opts.workItems.listByProject(projectId);
        const refusal = await this.typedRefusal(projectId, actorId, existing, to);
        if (refusal !== null) return { ok: false, reason: refusal };
        const stamp = this.clock.stampFor(actorId);
        context.assertUsable(projectId, actorId);
        await this.opts.typedDependencies.update(to, stamp);
        await this.announceTree(projectId);
        await this.record(
          projectId,
          stamp,
          'update_typed_dependency',
          `change dependency from ${quoteName(this.endpointLabel(to.predecessor, evidence.endpoints, projectId))} to ${quoteName(this.endpointLabel(to.successor, evidence.endpoints, projectId))}`,
          {
            forward: { do: 'update_typed_dependency', from, to },
            inverse: { do: 'update_typed_dependency', from: to, to: from },
            touched: touchedBy({ do: 'update_typed_dependency', from, to }),
            before: rows,
            ...(evidence.externalBefore.length === 0
              ? {}
              : { externalBefore: evidence.externalBefore }),
          },
        );
        return { ok: true, value: null };
      },
    );
  }

  /** Removes an owned relationship only while both original endpoints remain readable. */
  async removeTypedDependency(
    projectId: string,
    actorId: string,
    dependencyId: string,
  ): Promise<WorkItemOutcome<null>> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(project, actorId)) return { ok: false, reason: 'forbidden' };
    const existing = await this.opts.typedDependencies.listByProject(projectId);
    const dependency = existing.find((row) => row.id === dependencyId);
    if (dependency === undefined) return { ok: false, reason: 'unknown_dependency' };
    return withDependencyContext(
      this.opts.dependencyContext,
      projectId,
      actorId,
      async (context) => {
        // Proof: old-remove-evidence bypass failed `remove refuses an injected denial`'s selected assertion
        // (actual SQLite boundary; watched 2026-10-22).
        const evidence = await this.typedEvidence(context, projectId, [dependency]);
        if (!evidence.ok) return evidence;
        if (dependency.predecessor.projectId !== projectId && !this.externalDependenciesActive)
          return { ok: false, reason: 'external_dependencies_inactive' };
        // Proof: bypassing this consumer failed `connected typed-remove refuses`
        // at its real SQLite refusal assertion; zero partial effects also checked (2026-10-22).
        const cycle = await context.graph.findCycle(projectId, {
          typed: existing.filter((row) => row.id !== dependencyId),
        });
        if (cycle !== null)
          return { ok: false, reason: cycle.kind === 'self_node' ? 'self_node' : 'cycle' };
        const rows = await this.opts.workItems.listByProject(projectId);
        const stamp = this.clock.stampFor(actorId);
        context.assertUsable(projectId, actorId);
        await this.opts.typedDependencies.remove(dependencyId, stamp);
        await this.announceTree(projectId);
        await this.record(
          projectId,
          stamp,
          'remove_typed_dependency',
          `remove dependency from ${quoteName(this.endpointLabel(dependency.predecessor, evidence.endpoints, projectId))} to ${quoteName(this.endpointLabel(dependency.successor, evidence.endpoints, projectId))}`,
          {
            forward: { do: 'remove_typed_dependency', dependency },
            inverse: { do: 'add_typed_dependency', dependency },
            touched: touchedBy({ do: 'remove_typed_dependency', dependency }),
            before: rows,
            ...(evidence.externalBefore.length === 0
              ? {}
              : { externalBefore: evidence.externalBefore }),
          },
        );
        return { ok: true, value: null };
      },
    );
  }

  /**
   * Records "`predecessorId`'s anchor — its first slice in step order — must
   * finish before this starts"; the predecessor's later steps run beside it.
   *
   * Broadcast as a whole-tree change, not a patch: one edge moves every date
   * downstream of it, and working out which rows those are is the schedule's
   * job, computed on read.
   */
  async addDependency(
    id: string,
    actorId: string,
    predecessorId: string,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.value;

    const existing = await this.opts.dependencies.listByProject(workItem.projectId);
    // `rows` is this project's only, so a predecessor from another project is
    // simply not among them and comes back `not_found` — the cross-project case
    // is unrepresentable rather than separately guarded.
    const refusal = canDepend(rows, existing, predecessorId, id);
    if (refusal !== null) return { ok: false, reason: refusal };

    // Proof: omitting the proposed legacy edge from the combined graph made
    // `refuses a direct legacy write that closes a typed SS cycle` receive
    // `{ ok: true, value: null }` instead of `cycle`; watched 2026-09-28.
    // Proof: bypassing this consumer failed `connected add-legacy refuses an injected failed graph read`
    // at the actual SQLite refusal assertion; unchanged tables also checked (2026-10-22).
    const cycle = await this.findDependencyCycle(workItem.projectId, actorId, {
      legacy: [
        ...existing,
        { id: 'proposed', projectId: workItem.projectId, predecessorId, successorId: id },
      ],
    });
    if (cycle !== null)
      return { ok: false, reason: cycle.kind === 'self_node' ? 'self_node' : 'cycle' };

    const stamp = this.clock.stampFor(actorId);
    await this.opts.dependencies.add(
      {
        id: this.clock.newId(),
        projectId: workItem.projectId,
        predecessorId,
        successorId: id,
      },
      stamp,
    );
    await this.announceTree(workItem.projectId);
    await this.record(
      workItem.projectId,
      stamp,
      'add_dependency',
      `make ${quoteName(workItem.name)} wait for ${quoteName(nameOf(rows, predecessorId))}`,
      {
        forward: { do: 'add_dependency', successorId: id, predecessorId },
        inverse: { do: 'remove_dependency', successorId: id, predecessorId },
        touched: [id, predecessorId],
        before: rows,
      },
    );
    return { ok: true, value: null };
  }

  /** Removing an edge that was not there is not an error; the state asked for is the state left. */
  async removeDependency(
    id: string,
    actorId: string,
    predecessorId: string,
  ): Promise<WorkItemOutcome<null>> {
    const context = await this.contextFor(id, actorId);
    if (!context.ok) return context;
    const { workItem, rows } = context.value;

    const existing = await this.opts.dependencies.listByProject(workItem.projectId);
    const existed = existing.some(
      (edge) => edge.predecessorId === predecessorId && edge.successorId === id,
    );
    // Proof: bypassing this consumer failed `connected remove-legacy refuses an injected failed graph read`
    // at the actual SQLite refusal assertion; unchanged tables also checked (2026-10-22).
    const cycle = await this.findDependencyCycle(workItem.projectId, actorId, {
      legacy: existing.filter(
        (edge) => edge.predecessorId !== predecessorId || edge.successorId !== id,
      ),
    });
    if (cycle !== null)
      return { ok: false, reason: cycle.kind === 'self_node' ? 'self_node' : 'cycle' };
    const stamp = this.clock.stampFor(actorId);
    await this.opts.dependencies.remove(predecessorId, id, stamp);
    await this.announceTree(workItem.projectId);
    // The removal is idempotent, so a request for an edge that was not there
    // changed nothing and there is nothing to put back.
    if (existed) {
      await this.record(
        workItem.projectId,
        stamp,
        'remove_dependency',
        `stop ${quoteName(workItem.name)} waiting for ${quoteName(nameOf(rows, predecessorId))}`,
        {
          forward: { do: 'remove_dependency', successorId: id, predecessorId },
          inverse: { do: 'add_dependency', successorId: id, predecessorId },
          touched: [id, predecessorId],
          before: rows,
        },
      );
    }
    return { ok: true, value: null };
  }

  /**
   * Whether this account has anything to undo or redo on this project.
   *
   * Read by the controller alongside the tree rather than from its own route.
   * The tree read is already the thing every client does after every change of
   * its own and after every event from anybody else, so the answer arrives
   * exactly when it can have changed — and {@link tree} itself stays free of
   * an account, which matters because the broadcast reuses it.
   */
  undoState(projectId: string, actorId: string): Promise<UndoState> {
    return this.opts.journal.stateOf(projectId, actorId);
  }

  /**
   * The project's IANA zone, which the tree read carries so a step card reads
   * attempt instants in it without a second request (`step-node-attempts` D7).
   *
   * @throws when the project has no zone row: the caller has just read its
   * tree, so a miss is a store that lost it, never a plan to draw without one.
   */
  async timezoneOf(projectId: string): Promise<string> {
    const timezone = await this.opts.projects.timezoneOf(projectId);
    if (timezone === null) throw new Error(`project ${projectId} has no timezone`);
    return timezone;
  }

  /**
   * Reverses this account's newest command on this project — **if nothing it
   * touched has moved since**.
   *
   * The condition is the whole design. An undo is a write computed from a
   * state that was read a while ago, so applying it blind is not "last writer
   * wins" by accident but by construction: it puts back a value nobody
   * currently on the plan asked for. Every entity the original command wrote
   * to is checked against the revision that command left it at, and a single
   * mismatch refuses the whole thing and says which row changed.
   *
   * A refused entry is **thrown away** under the stale-history policy. Unit
   * equality could hold again after another edit; replaying a refused entry
   * later would still conceal the conflict already reported, so keeping it would jam the stack,
   * refusing every later press of the key for a change nobody can reach.
   */
  undo(projectId: string, actorId: string): Promise<UndoOutcome> {
    return this.walkStack(projectId, actorId, 'undo', LEGACY_ACCESS);
  }

  /**
   * {@link undo} through the caller's access. Under scoped access the entry is
   * refused as `not_found` before anything is written when a row it would
   * write exists in another project: an entry journalled before activation
   * may name one, and the project's own closure would not show the write.
   * The caller owns the project check and the closure check around it.
   */
  undoWithin(projectId: string, actorId: string, access: ResourceAccess): Promise<UndoOutcome> {
    return this.walkStack(projectId, actorId, 'undo', access);
  }

  /** {@link redo} through the caller's access; see {@link undoWithin}. */
  redoWithin(projectId: string, actorId: string, access: ResourceAccess): Promise<UndoOutcome> {
    return this.walkStack(projectId, actorId, 'redo', access);
  }

  /**
   * Re-applies the command this account most recently undid on this project,
   * under exactly the same condition.
   *
   * A redo is as much a write from a stale read as an undo is, and the
   * asymmetry that would make it safe does not exist: between the undo and the
   * redo anybody may have edited the same row. The redo branch is cleared the
   * moment this account makes any forward change, because re-applying a
   * command on top of a plan that has moved on is a different command.
   */
  redo(projectId: string, actorId: string): Promise<UndoOutcome> {
    return this.walkStack(projectId, actorId, 'redo', LEGACY_ACCESS);
  }

  private async walkStack(
    projectId: string,
    actorId: string,
    direction: 'undo' | 'redo',
    access: ResourceAccess,
  ): Promise<UndoOutcome> {
    const project = await this.opts.projects.findById(projectId);
    if (project === null) return { ok: false, reason: 'not_found', detail: null };
    // An undo is a mutation. Being allowed to read a restricted project is not
    // being allowed to reverse somebody's work in it.
    if (!this.opts.admission.admits(project, actorId))
      return { ok: false, reason: 'forbidden', detail: null };

    return withDependencyContext(
      this.opts.dependencyContext,
      projectId,
      actorId,
      async (dependencyContext) => {
        // The whole stack, because applying one entry re-stamps its neighbours.
        // It is capped at fifty rows.
        const stack = await this.opts.journal.entriesFor(projectId, actorId);
        const entry: JournalEntry | undefined =
          direction === 'undo'
            ? [...stack].reverse().find((each) => !each.undone)
            : stack.find((each) => each.undone);
        if (entry === undefined) return { ok: false, reason: 'nothing_to_undo', detail: null };

        const payload = readPayload(entry.payload);
        const command = direction === 'undo' ? readCommand(entry.inverse) : payload.forward;
        const preconditions = readPreconditions(entry.preconditions);
        const bothDirections = [payload.forward, readCommand(entry.inverse)];
        const external = requireExternalRevisions(preconditions, projectId, bothDirections);
        const endpointKeys = new Set<string>();
        // Proof: scanning both directions changed the SQLite other-direction
        // not_found to application-time stale_undo (round1 ordering diagnostic).
        const restoredTyped = restoredTypedAddressesOf(command, projectId);
        let localEndpointDefect = false;
        for (const directionCommand of bothDirections)
          for (const endpoint of referencesOf(directionCommand).scopedEndpoints) {
            if (endpoint.projectId !== projectId && endpointKeys.has(JSON.stringify(endpoint)))
              continue;
            endpointKeys.add(JSON.stringify(endpoint));
            const checked = await dependencyContext.endpoints.readEndpoint(endpoint);
            if (!checked.ok) {
              // Proof: restoring the external-metadata blanket gate lost valid
              // SQLite redo. Exempting delivered forbidden/unknown_step outcomes
              // instead returned ok:true in their round1 refusal-fault regressions.
              if (
                endpoint.projectId === projectId &&
                checked.reason === 'not_found' &&
                restoredTyped.has(scopedRevisionKey(endpoint))
              )
                continue;
              if (
                external === null &&
                endpoint.projectId === projectId &&
                checked.reason !== 'forbidden'
              ) {
                localEndpointDefect = true;
              } else
                return {
                  ok: false,
                  reason: checked.reason === 'forbidden' ? 'forbidden' : 'not_found',
                  detail: null,
                };
            }
          }
        if (
          external !== null &&
          // Proof: reading authority before this predicate threw in mounted
          // `derived incident history does not require general external authoring`
          // instead of replaying the derived mapping (watched 2026-10-23).
          bothDirections.some(requiresExternalAuthoring) &&
          !this.externalDependenciesActive
        )
          return { ok: false, reason: 'external_dependencies_inactive', detail: null };
        if (external !== null) {
          const current = await dependencyContext.endpoints.readRevisions(external.expected);
          if (!current.ok) return { ok: false, reason: current.reason, detail: null };
          const revisions = new Map(
            current.revisions.map((revision) => [scopedRevisionKey(revision), revision.revision]),
          );
          // Proof: remote-revision-conflict bypass failed `external undo redo checks remote revisions`'s selected assertion
          // (actual SQLite boundary; watched 2026-10-22).
          // Proof: bypassing this comparison made mounted promote stale undo commit with 200 instead of 409 (2026-10-22).
          if (
            external.expected.some(
              (revision) => revisions.get(scopedRevisionKey(revision)) !== revision.revision,
            )
          ) {
            await this.opts.journal.discard(entry.id);
            return {
              ok: false,
              reason: 'stale_undo',
              detail: 'an external dependency endpoint changed since this command.',
              entryId: entry.id,
            };
          }
        }
        const bindings = boundEstimateUnits(preconditions, [
          payload.forward,
          readCommand(entry.inverse),
        ]);

        // Proof: removing required metadata validation accepted a deletion whose progress snapshot was removed (200 vs 500); watched 2026-10-14.
        for (const owner of deletionParentsOf([payload.forward, readCommand(entry.inverse)])) {
          if (
            preconditions.moveProgress === undefined ||
            !Object.hasOwn(preconditions.moveProgress, owner)
          )
            throw new Error(
              `journal deletion state has no complete progress snapshot for ${owner}`,
            );
        }

        const replayReferences = referencesOf(command);
        for (const endpoint of replayReferences.scopedEndpoints)
          if (endpoint.projectId === projectId) {
            replayReferences.workItems.push(endpoint.workItemId);
            if (endpoint.scope !== 'whole') replayReferences.steps.push(endpoint.stepId);
          }
        for (const [owner, facts] of Object.entries(preconditions.moveProgress ?? {})) {
          // Proof: omitting owners with empty snapshots admitted foreign-project metadata; watched 2026-10-14.
          replayReferences.workItems.push(owner);
          // Proof: omitting snapshot step references changed scoped metadata refusal from 404 to 409; watched 2026-10-14.
          replayReferences.steps.push(...facts.map(({ stepId }) => stepId));
        }
        // Proof: disabling this check made `command-organization.controller.db.test.ts`
        // answer 200 instead of 404 for `refuses an undo whose entry names another
        // project's row`, for the nested foreign label and for the restored row of
        // another project, and 409 `stale_undo` (discarding the entry) for a step
        // of another project; watched 2026-09-27.
        if (
          access.kind === 'scoped' &&
          (await this.namesOutside(projectId, access.scope.organizationId, replayReferences))
        ) {
          return { ok: false, reason: 'not_found', detail: null };
        }

        if (localEndpointDefect) {
          await this.opts.journal.discard(entry.id);
          return {
            ok: false,
            reason: 'stale_undo',
            detail: 'a local dependency endpoint changed or was removed.',
            entryId: entry.id,
          };
        }
        const steps = new Map(
          (await this.opts.projects.stepsOf(projectId)).map((step) => [step.id, step]),
        );
        for (const [stepId, unit] of Object.entries(bindings)) {
          const current = steps.get(stepId);
          // Proof: bypassing equality restored a day trio under minutes (200 vs 409); dropping absence returned 500 vs 409 for a removed step (mounted unit replay, 2026-10-12).
          if (current?.estimateUnit !== unit) {
            await this.opts.journal.discard(entry.id);
            return {
              ok: false,
              reason: 'stale_undo',
              detail: `the estimate unit of step ${stepId} changed or the step was removed.`,
              entryId: entry.id,
            };
          }
        }
        const moved = await this.staleness(projectId, preconditions.expected);
        if (moved !== null) {
          await this.opts.journal.discard(entry.id);
          return { ok: false, reason: 'stale_undo', detail: moved, entryId: entry.id };
        }

        for (const [owner, expected] of Object.entries(preconditions.moveProgress ?? {})) {
          const current = await this.opts.progress.listByWorkItems(projectId, [owner]);
          // Proof: bypassing this pre-batch comparison deleted changed recorded destination facts during mounted/memory redo; watched 2026-10-14.
          // Proof: bypassing this comparison lost peer deletion-parent progress (200 vs 409); watched 2026-10-14.
          if (!matchesProgress(current, expected)) {
            await this.opts.journal.discard(entry.id);
            return {
              ok: false,
              reason: 'stale_undo',
              detail: 'progress on a guarded work item changed since this command.',
              entryId: entry.id,
            };
          }
        }
        const neighbors = await this.captureReplayNeighbors(stack, entry, direction, projectId);
        // Proof: broadening these pairs to all owner facts accepted stale mounted/memory replay; watched 2026-10-14.
        const written = new Set(
          progressKeysOf(command).map(({ workItemId, stepId }) => progressKey(workItemId, stepId)),
        );
        // The act is the application, past every refusal above it: a stale entry is
        // discarded and never stamped. Nothing is appended to the journal here — an
        // undo is not itself journalled — so this stamp is spent only on the rows
        // {@link apply} rewrites.
        const stamp = this.clock.stampFor(actorId);
        const applied = await this.apply(projectId, command, stamp, access);
        if (!applied.ok) {
          await this.opts.journal.discard(entry.id);
          return { ok: false, reason: 'stale_undo', detail: applied.detail, entryId: entry.id };
        }
        // The state the application left, asked before anything commits: the
        // runner rolls this unit of work back on the refusal, so an undo or redo
        // that would close a step-node cycle writes nothing.
        // Proof: this check skipped made `refuses an undo that would close a
        // step-node cycle` fail on `Expected: 409, Received: 200`; watched
        // 2026-09-27.
        // Proof: bypassing it with an SS relationship present made the same mounted
        // undo test receive 200 instead of 409; watched 2026-09-28.
        // Proof: with typedRefusal suppressed, also suppressing this consumer made both
        // synthetic mounted compound remote-cycle walks commit HTTP 200, patch B and
        // restore A→B; domain, revision, event and journal rows changed (2026-10-23).
        const cycle = await this.findDependencyCycle(projectId, actorId);
        if (cycle !== null) {
          await this.opts.journal.discard(entry.id);
          return {
            ok: false,
            reason: 'stale_undo',
            detail: 'that would now close a dependency cycle between steps.',
            entryId: entry.id,
          };
        }

        // The entry now describes the other direction, so it checks the revisions
        // this application left and remembers the ones it started from. Nothing is
        // appended: an undo that was itself journalled would be undoable, and the
        // key would toggle one change forever instead of walking back through two.
        const now = await this.revisionsOf(projectId, [
          ...touchedBy(command),
          // Proof: omitting both direction owners let the second undo ignore a changed parent revision; watched 2026-10-14.
          ...expectedProgressOwnersOf(payload.forward),
          ...expectedProgressOwnersOf(readCommand(entry.inverse)),
        ]);
        let externalNow: readonly ScopedRevision[] = [];
        if (external !== null) {
          const current = await dependencyContext.endpoints.readRevisions(external.expected);
          if (!current.ok) throw new Error('replayed external revision evidence became unreadable');
          externalNow = current.revisions;
        }
        dependencyContext.assertUsable(projectId, actorId);
        await this.opts.journal.flip(entry.id, direction === 'undo', {
          ...(external === null
            ? {}
            : { externalRevisions: { expected: externalNow, from: external.expected } }),
          expected: now,
          from: preconditions.expected,
          // Proof: dropping flip snapshots made changed known-step redo succeed; watched 2026-10-14.
          ...(preconditions.moveProgress === undefined
            ? {}
            : {
                moveProgress: await this.captureMoveProgress(
                  projectId,
                  Object.keys(preconditions.moveProgress),
                ),
              }),
          // Proof: dropping this binding made chained minute redo refuse 409 instead of 200 (mounted unit replay, 2026-10-12).
          estimateUnits: bindings,
        });
        await this.rebase(
          neighbors,
          entry,
          preconditions.from,
          now,
          written,
          external?.from ?? [],
          externalNow,
        );
        await this.announceTree(projectId);
        return { ok: true, value: { done: payload.label, detail: applied.detail } };
      },
    );
  }

  /** Captures guarded neighbor facts before this replay can change any progress. */
  private async captureReplayNeighbors(
    stack: readonly JournalEntry[],
    selected: JournalEntry,
    direction: 'undo' | 'redo',
    projectId: string,
  ): Promise<ReplayNeighbor[]> {
    const neighbors: ReplayNeighbor[] = [];
    for (const entry of stack) {
      if (entry.id === selected.id) continue;
      const ahead = direction === 'undo' ? entry.seq < selected.seq : entry.seq > selected.seq;
      if (!ahead) continue;
      const preconditions = readPreconditions(entry.preconditions);
      requireExternalRevisions(preconditions, projectId, [
        readPayload(entry.payload).forward,
        readCommand(entry.inverse),
      ]);
      neighbors.push({
        entry,
        preconditions,
        progress: await Promise.all(
          Object.entries(preconditions.moveProgress ?? {}).map(async ([owner, expected]) => ({
            owner,
            expected,
            before: await this.opts.progress.listByWorkItems(projectId, [owner]),
          })),
        ),
      });
    }
    return neighbors;
  }

  /**
   * Carries the entries this one was stacked on top of past the write the
   * application just made.
   *
   * This is what lets somebody press the key twice. An undo is an ordinary
   * mutation, so it moves the revisions of everything it touched — and the
   * entry below, which recorded those entities as it left them, would then be
   * checking against a number this account's own undo has walked past.
   *
   * The condition is exact and it is the whole safety of it: a neighbour is
   * carried forward **only** where the revision it expects is the one the
   * just-applied command started from. That equality says nobody wrote between
   * the two commands, and therefore that the entity now holds precisely what
   * the neighbour left it holding. Where somebody did write in between, the
   * numbers do not match, nothing is re-stamped, and that entry refuses when
   * it is reached — which is the entire point of the feature.
   *
   * Guarded progress changes only for exact pairs this replay writes. Every
   * other fact and absence captured before replay must match the neighbor's
   * snapshot; a mismatch preserves the stale snapshot. Unwritten pairs retain
   * their recorded values rather than absorbing the owner's current whole set.
   *
   * Only the side being walked toward is touched: undoing carries the live
   * entries below, redoing carries the undone ones above.
   */
  private async rebase(
    neighbors: readonly ReplayNeighbor[],
    applied: JournalEntry,
    startedFrom: Revisions,
    now: Revisions,
    written: ReadonlySet<string>,
    externalFrom: readonly ScopedRevision[],
    externalNow: readonly ScopedRevision[],
  ): Promise<void> {
    for (const neighbor of neighbors) {
      const { entry: other, preconditions: their } = neighbor;
      let changed = false;
      const expected: Revisions = { ...their.expected };
      const moveProgress = their.moveProgress === undefined ? undefined : { ...their.moveProgress };
      for (const [id, reached] of Object.entries(now)) {
        // Only where this neighbour has an opinion about the entity at all,
        // and where that opinion is exactly the revision the applied command
        // started from. Both halves matter: the first keeps a precondition
        // from being invented for a row the neighbour never touched, and the
        // second is what somebody else's write in between fails.
        if (!Object.hasOwn(their.expected, id)) continue;
        // Proof: bypassing this equality refreshed a stale move destination snapshot in the neighboring-replay case; watched 2026-10-14.
        if (their.expected[id] !== startedFrom[id]) continue;
        expected[id] = reached;
        if (moveProgress !== undefined) {
          for (const captured of neighbor.progress) {
            if (captured.owner !== id) continue;
            const unchanged = captured.expected.filter(
              (fact) => !written.has(progressKey(fact.workItemId, fact.stepId)),
            );
            const before = captured.before.filter(
              (fact) => !written.has(progressKey(fact.workItemId, fact.stepId)),
            );
            // Proof: bypassing outside-pair equality changed stale QA snapshots through Dev replay; watched 2026-10-14.
            if (matchesProgress(before, unchanged)) {
              const after = await this.opts.progress.listByWorkItems(applied.projectId, [id]);
              // Proof: omitting refresh refused valid neighboring progress undo/redo after restamping; watched 2026-10-14.
              moveProgress[id] = [
                ...unchanged,
                // Proof: including unwritten post-replay rows duplicated QA and refused the valid Dev/QA chain; watched 2026-10-14.
                ...after.filter((fact) => written.has(progressKey(fact.workItemId, fact.stepId))),
              ];
            }
          }
        }
        changed = true;
      }
      let externalRevisions = their.externalRevisions;
      if (externalRevisions !== undefined) {
        const before = new Map(
          externalFrom.map((revision) => [scopedRevisionKey(revision), revision.revision]),
        );
        const reached = new Map(
          externalNow.map((revision) => [scopedRevisionKey(revision), revision]),
        );
        const revised = externalRevisions.expected.map((revision) => {
          const key = scopedRevisionKey(revision);
          const current = reached.get(key);
          // Proof: conditional-remote-neighbor bypass failed `external neighbor restamping preserves a genuine intervening edit`'s selected assertion
          // (actual SQLite boundary; watched 2026-10-22).
          if (current === undefined || revision.revision !== before.get(key)) return revision;
          changed = true;
          return current;
        });
        externalRevisions = { ...externalRevisions, expected: revised };
      }
      if (changed)
        await this.opts.journal.restamp(other.id, {
          ...their,
          ...(externalRevisions === undefined ? {} : { externalRevisions }),
          expected,
          ...(moveProgress === undefined ? {} : { moveProgress }),
        });
    }
  }

  /** Captures the current complete set for each destination, including empty sets after clearing. */
  private async captureMoveProgress(
    projectId: string,
    owners: readonly string[],
  ): Promise<Record<string, StoredProgress[]>> {
    return Object.fromEntries(
      await Promise.all(
        owners.map(async (owner): Promise<[string, StoredProgress[]]> => [
          owner,
          await this.opts.progress.listByWorkItems(projectId, [owner]),
        ]),
      ),
    );
  }

  /**
   * Which entity has moved since the command ran, said in words a reader can
   * act on — or null when every one of them is exactly where it was.
   *
   * A row that is **gone** counts as moved. Its revision cannot be compared to
   * anything, and the change that removed it is a change the undo would be
   * computed against.
   */
  private async staleness(projectId: string, expected: Revisions): Promise<string | null> {
    const rows = await this.opts.workItems.listByProject(projectId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const stepRevisions = await this.opts.projects.stepAllowanceRevisions(projectId);
    for (const [id, revision] of Object.entries(expected)) {
      const stepId = stepOfRevisionKey(id);
      if (stepId !== null) {
        const held = stepRevisions.get(stepId);
        if (held === undefined) return 'a step this change touched has been removed since then.';
        // Proof: with this comparison removed, `refuses an allowance undo
        // after somebody else changed it and changed it back` failed: the undo
        // answered ok and overwrote the peer's 30% (2026-09-27).
        if (held !== revision) return 'that step’s allowance has changed since then.';
        continue;
      }
      const row = byId.get(id);
      // "since then" rather than a bare "since": these are read out at the end
      // of the caller's own sentence — `That could not be undone: “Roof it” has
      // changed since` reached a reader on 2026-08-09 and stopped mid-phrase,
      // with no full stop and no answer to "since what?".
      if (row === undefined) {
        return 'a work item this change touched has been deleted since then.';
      }
      if (row.revision !== revision) return `${quoteName(row.name)} has changed since then.`;
    }
    return null;
  }

  /**
   * The current revisions of `ids`, skipping the ones that no longer exist.
   *
   * A row that is gone is deliberately absent rather than recorded as missing:
   * nobody can hold a revision for it, and the guard that matters for a row
   * that should stay gone is `restore_subtree` refusing to write over an id
   * that is there.
   */
  private async revisionsOf(projectId: string, ids: readonly string[]): Promise<Revisions> {
    const rows = await this.opts.workItems.listByProject(projectId);
    const out = revisionsIn(rows, ids);
    const stepIds = ids.flatMap((id) => stepOfRevisionKey(id) ?? []);
    if (stepIds.length === 0) return out;
    const stepRevisions = await this.opts.projects.stepAllowanceRevisions(projectId);
    for (const stepId of stepIds) {
      const revision = stepRevisions.get(stepId);
      if (revision !== undefined) out[stepRevisionKey(stepId)] = revision;
    }
    return out;
  }

  /**
   * Applies one compensating command through the same stores every ordinary
   * mutation writes through, so revisions move, satellites follow and the
   * invariants hold.
   *
   * It re-checks the handful of rules a revision cannot express — a sibling
   * that has to exist for a placement, a leaf that has become a parent, an id
   * that is supposed to still be free — and answers `ok: false` rather than
   * throwing. Those are conditions to report, not faults: the caller turns
   * them into the same refusal a moved revision produces.
   *
   * **A directory id the replay would put back is one of those rules.** Undo
   * never resurrects a person, a team or a membership, and the guard that says
   * so is the store's own — `patch` and `assign` each read the id inside the
   * transaction that writes it, and this switch reports what they answered
   * rather than replaying around them.
   *
   * Proof, both watched 2026-08-09: with `assign`'s refusal ignored here,
   * `refuses a redo whose person has since been removed, and writes nothing`
   * fails; with `patch`'s `unknown_team` treated as applied, `refuses an undo
   * that would put back a label whose team has gone` fails and the work item
   * carries the dead id.
   */
  private async apply(
    projectId: string,
    command: CompensatingCommand,
    stamp: WriteStamp,
    // The replay's access, which names what a refusal detail shows; absent on
    // a forward write, which never puts claims back.
    access?: ResourceAccess,
  ): Promise<ApplyOutcome> {
    switch (command.do) {
      case 'transition_incident_nodes': {
        if (command.projectId !== projectId)
          throw new Error('incident replay structural owner mismatch');
        return withDependencyContext(
          this.opts.dependencyContext,
          projectId,
          stamp.by,
          async (context) => {
            const transition = await context.incidents.run(
              projectId,
              stamp.by,
              {
                kind: 'replay',
                fromWorkItemId: command.fromWorkItemId,
                toWorkItemId: command.toWorkItemId,
                receipts: command.receipts,
              },
              stamp,
              () => this.apply(projectId, command.structural, stamp),
            );
            return transition.ok || transition.reason === 'structure_refused'
              ? transition.value
              : { ok: false, detail: `incident transition refused: ${transition.reason}.` };
          },
        );
      }
      case 'patch': {
        // A statement goes back only onto a row that is still a leaf: one that
        // has gained a child since is a parent, and the plan read refuses a
        // parent holding a readiness or hold (`add-work-item-statuses`, ADR
        // 0032). The store refuses the same write again in its own statement.
        // Proof: this check removed made `refuses an undo that would put a
        // hold back on a row that has since gained a child` fail — the refusal
        // came from the store's conditional write instead, `gained children as
        // this was written`, so this is the check that answers first; watched
        // 2026-09-29.
        if (
          (command.patch.readiness !== undefined && command.patch.readiness !== null) ||
          (command.patch.hold !== undefined && command.patch.hold !== null)
        ) {
          const rows = await this.opts.workItems.listByProject(projectId);
          if (rows.some((row) => row.parentId === command.workItemId)) {
            return {
              ok: false,
              detail: 'that work item has children now, so it takes no readiness or hold.',
            };
          }
        }
        // Straight to the store, never through the authored `patch`: restoration
        // puts back the exact prior type set, including a type conflict.
        //
        // Proof: routed through `this.patch` instead and `puts a type conflict
        // back, whole, after one type is kept` (undo.db) failed on `refused:
        // stale_undo`. Watched 2026-09-27.
        const written = await this.opts.workItems.patch(command.workItemId, command.patch, stamp);
        if (!written.ok) {
          // The label's team or service was removed after the command ran, or
          // the row was. Either way the state this entry describes is gone, and
          // putting the dead id back is exactly what the guarded path exists to
          // refuse.
          //
          // The service gets its own sentence for the reason it gets its own
          // reason code: three dimensions can each be the one that went, and
          // "the work item is no longer there" would be a false sentence about
          // a row still on screen.
          return {
            ok: false,
            detail:
              written.reason === 'has_children'
                ? 'that work item gained children as this was written, so it takes no readiness or hold.'
                : written.reason === 'unknown_team'
                  ? 'that service team is no longer in the directory.'
                  : written.reason === 'unknown_service'
                    ? 'that service is no longer in the directory.'
                    : 'the work item is no longer there.',
          };
        }
        return { ok: true, detail: null };
      }
      case 'set_estimate': {
        const rows = await this.opts.workItems.listByProject(projectId);
        if (rows.some((row) => row.parentId === command.workItemId)) {
          return { ok: false, detail: 'that work item has children now, so its figures are sums.' };
        }
        // The step the trio belonged to has been removed since. Putting the
        // figures back would be a foreign key error on a key somebody pressed
        // to be safe, so the entry is refused and discarded like any other
        // command the plan has moved past.
        if (!(await this.holdsStep(projectId, command.stepId))) {
          return { ok: false, detail: 'that step is no longer in this project.' };
        }
        const restored = await this.opts.estimates.set(
          {
            workItemId: command.workItemId,
            stepId: command.stepId,
            ...command.days,
          },
          stamp,
        );
        if (restored === 'unknown_step')
          return { ok: false, detail: 'that step is no longer in this project.' };
        return { ok: true, detail: null };
      }
      case 'clear_estimate':
        await this.opts.estimates.remove(command.workItemId, command.stepId, stamp);
        return { ok: true, detail: null };
      case 'set_actual': {
        const rows = await this.opts.workItems.listByProject(projectId);
        if (rows.some((row) => row.parentId === command.workItemId)) {
          return { ok: false, detail: 'that work item has children now, so its figures are sums.' };
        }
        // The step the days were recorded against has been removed since.
        // `actual.step_id` is a foreign key, so putting the number back would be
        // a constraint error on a key somebody pressed to be safe.
        if (!(await this.holdsStep(projectId, command.stepId))) {
          return { ok: false, detail: 'that step is no longer in this project.' };
        }
        const restored = await this.opts.actuals.set(
          {
            workItemId: command.workItemId,
            stepId: command.stepId,
            days: command.days,
            // Now, not the instant the row carried. An undo is somebody
            // recording the number again, and this column says when it was
            // recorded — see the `set_actual` command in `compensating.ts`.
            // "Now" is the undo's own stamp, so the row's recorded day and its
            // audit columns cannot disagree.
            recordedAt: stamp.at,
          },
          stamp,
        );
        if (restored === 'unknown_step')
          return { ok: false, detail: 'that step is no longer in this project.' };
        return { ok: true, detail: null };
      }
      case 'clear_actual':
        await this.opts.actuals.remove(command.workItemId, command.stepId, stamp);
        return { ok: true, detail: null };
      case 'set_measure': {
        const rows = await this.opts.workItems.listByProject(projectId);
        if (rows.some((row) => row.parentId === command.workItemId)) {
          return { ok: false, detail: 'that work item has children now, so its figures are sums.' };
        }
        // The step the figure was recorded against has been removed since.
        // `step_measure.step_id` is a foreign key, so putting the number back
        // would be a constraint error on a key somebody pressed to be safe.
        if (!(await this.holdsStep(projectId, command.stepId))) {
          return { ok: false, detail: 'that step is no longer in this project.' };
        }
        const restored = await this.opts.measures.set(
          {
            workItemId: command.workItemId,
            stepId: command.stepId,
            metric: command.metric,
            value: command.value,
            // Now, not the instant the row carried — `set_actual`'s reading of
            // `recordedAt`, and the same one `compensating.ts` states.
            recordedAt: stamp.at,
          },
          stamp,
        );
        if (restored === 'unknown_step')
          return { ok: false, detail: 'that step is no longer in this project.' };
        return { ok: true, detail: null };
      }
      case 'clear_measure':
        await this.opts.measures.remove(command.workItemId, command.stepId, command.metric, stamp);
        return { ok: true, detail: null };
      case 'set_progress': {
        const rows = await this.opts.workItems.listByProject(projectId);
        if (rows.some((row) => row.parentId === command.workItemId)) {
          return { ok: false, detail: 'that work item has children now, so its figures are sums.' };
        }
        // The step the statement was made about has been removed since.
        // `step_progress.step_id` is a foreign key, so putting the statement
        // back would be a constraint error on a key somebody pressed to be safe.
        if (!(await this.holdsStep(projectId, command.stepId))) {
          return { ok: false, detail: 'that step is no longer in this project.' };
        }
        const restored = await this.opts.progress.set(
          {
            workItemId: command.workItemId,
            stepId: command.stepId,
            state: command.state,
            // Now, not the instant the row carried. An undo is somebody saying
            // it again, and this column says when it was said — the same
            // reading `set_actual` takes of `recordedAt`.
            statedAt: stamp.at,
          },
          stamp,
        );
        if (restored === 'unknown_step')
          return { ok: false, detail: 'that step is no longer in this project.' };
        return { ok: true, detail: null };
      }
      case 'clear_progress':
        await this.opts.progress.remove(command.workItemId, command.stepId, stamp);
        return { ok: true, detail: null };
      case 'set_demand': {
        // A demand is a fact about one work item and one resource: the item's
        // revision precondition already refused a row that moved, so what is
        // left to refuse is a resource the directory no longer holds.
        const written = await this.opts.demands.set(
          command.workItemId,
          command.resourceId,
          command.units,
          stamp,
        );
        if (written === 'unknown_resource')
          return { ok: false, detail: 'that resource is no longer in the directory.' };
        if (written === 'unknown_work_item')
          return { ok: false, detail: 'that work item is no longer in this project.' };
        return { ok: true, detail: null };
      }
      case 'add_claims': {
        const { claims } = this.claiming();
        // A delegated claim goes back only under a parent that is still held:
        // the parent reference would otherwise name nothing.
        // Proof: with this refusal removed, `refuses an undo of a delete once the
        // claim it was delegated under was released` (resource-occupancy.db.test.ts)
        // threw a foreign key failure on SQLite and answered ok on memory;
        // watched 2026-10-20.
        // Proof: with this refusal and the restore's both removed, the same case
        // threw a FOREIGN KEY failure on SQLite and `progress for unknown step` on
        // memory; with the restore's alone removed, memory was refused here.
        // Watched 2026-10-20.
        const stepGone = await this.stepRemovedSince(projectId, command);
        if (stepGone !== null) return stepGone;
        const replayed = new Set(command.claims.map(({ id }) => id));
        const held = new Set((await claims.listByProject(projectId)).map(({ id }) => id));
        if (
          command.claims.some(
            ({ parentClaimId }) =>
              parentClaimId !== null && !replayed.has(parentClaimId) && !held.has(parentClaimId),
          )
        )
          return { ok: false, detail: 'the claim it was delegated under has been released since.' };
        // Proof: with this refusal removed, `refuses an undo of a delete once the
        // claimant was removed from the directory` (resource-occupancy.db.test.ts)
        // threw a foreign key failure on SQLite and answered ok on memory;
        // watched 2026-10-20.
        for (const personId of new Set(command.claims.map((each) => each.personId)))
          if (!(await this.holdsPerson(personId)))
            return { ok: false, detail: 'a person who held it is no longer in the directory.' };
        if (access === undefined)
          throw new Error('claims are put back only by a replay, which names its access');
        const exhausted = await this.refuseReacquiring(projectId, command, access);
        if (exhausted !== null) return { ok: false, detail: exhausted };
        // Only a recorded fresh progress statement recreates a governed start.
        // Release undo and historical structural restoration have no new statement.
        const newStarts = command.stated;
        if (newStarts.length > 0) {
          const observed = await this.opts.livePlans?.readExecution(projectId, access, null);
          if (observed !== undefined && observed.kind !== 'ready')
            return { ok: false, detail: 'execution evidence is no longer readable.' };
          const execution =
            observed === undefined
              ? await this.statusReadsOf(
                  projectId,
                  await this.opts.workItems.listByProject(projectId),
                )
              : observed.reads;
          for (const statement of newStarts) {
            const key = sliceKey(statement.workItemId, statement.stepId);
            const evidence = execution.evidenceByNode.get(key);
            const eligibility = execution.eligibilityByNode.get(key);
            if (evidence === undefined || eligibility === undefined)
              throw new Error(`missing replay execution reading ${key}`);
            // Proof: bypassing this predicate made mounted `local claim redo reevaluates` replay an unsafe start (task-6-3-admission-proofs/replay-filter.log).
            if (!evidence.started && !eligibility.canStart)
              return { ok: false, detail: 'execution prerequisites are no longer satisfied.' };
          }
        }
        // A redo of a claim, an undo of a release or of a delete puts bound
        // claims back, so it passes the organization's cap as a fresh claim
        // does (L9); a split's `move_claims` keeps its triples and is not here.
        // Proof, each watched 2026-10-22 in claim-limit.controller.db.test.ts:
        // with this re-check skipped, `refuses a redo of a claim once another
        // took the last place`, `refuses an undo of a release once another
        // took the freed place` and `refuses an undo of a delete once another
        // took the freed place` put the claim back over the cap (10 pass, 3 fail).
        const adding = await this.boundClaimsAdded(projectId, command.claims);
        if (adding > 0) {
          const crossed = await this.refuseBoundClaims(access, adding);
          if (crossed !== null)
            return {
              ok: false,
              detail: `claim_limit: cap ${String(crossed.cap)}, current ${String(crossed.current)}.`,
            };
        }
        const added = await claims.add(
          command.claims,
          command.stated,
          stamp,
          // Absent on an entry written before claim occupancy: its claims held nothing.
          command.occupancy ?? [],
        );
        // Proof: answering ok here made `refuses a redo of a claim once another
        // holder took the step` (claim-command.test.ts) answer the redo ok; watched 2026-10-19.
        if (added === 'taken')
          return { ok: false, detail: 'that step or subtree has been claimed since.' };
        if (added === 'progress_stated')
          return { ok: false, detail: 'that step has been spoken about since.' };
        if (added === 'unknown_resource')
          return { ok: false, detail: 'a resource it held is no longer in the directory.' };
        return { ok: true, detail: null };
      }
      case 'remove_claims': {
        const { claims } = this.claiming();
        const stored = await claims.listByProject(projectId);
        const held = new Set(stored.map(({ id }) => id));
        if (command.claims.some(({ id }) => !held.has(id)))
          return { ok: false, detail: 'that claim has been released since.' };
        // A claim handed down to a first child since (`move_claims`) is the
        // child's now; taking it back here would leave the child's statement.
        // Proof: with this refusal removed, `refuses an undo of a claim once
        // another actor split the leaf` (claim-command.test.ts, memory, which
        // keeps no revisions) answered the undo ok; watched 2026-10-20.
        const placedOn = new Map(stored.map(({ id, workItemId }) => [id, workItemId]));
        if (command.claims.some(({ id, workItemId }) => placedOn.get(id) !== workItemId))
          return { ok: false, detail: 'that claim has moved to another work item since.' };
        // A removed claim takes its delegated claims with it (the parent
        // reference cascades), so a delegated claim this entry did not write
        // would go with an undo that cannot put it back.
        // Proof: with this refusal removed, `refuses an undo of a subtree claim
        // that would take a delegated claim it never wrote` (claim-race.db.test.ts)
        // answered the second undo ok, taking the worker's delegated claim with
        // the subtree claim; watched 2026-10-19.
        const listed = new Set(command.claims.map(({ id }) => id));
        const delegatedSince = stored.some(
          ({ id, parentClaimId }) =>
            !listed.has(id) && parentClaimId !== null && listed.has(parentClaimId),
        );
        if (delegatedSince)
          return { ok: false, detail: 'a claim has been delegated under it since.' };
        await claims.remove(command.claims, command.cleared, stamp);
        return { ok: true, detail: null };
      }
      case 'move_claims': {
        const { claims } = this.claiming();
        const stored = await claims.listByProject(projectId);
        const onFrom = stored
          .filter(({ workItemId }) => workItemId === command.fromWorkItemId)
          .map(({ id }) => id)
          .sort();
        const listed = command.claims.map(({ id }) => id).sort();
        // Proof: with this refusal removed, `refuses an undo of a split once
        // the child's claims changed` (claim-command.test.ts, memory, which
        // keeps no revisions) answered the undo ok; watched 2026-10-20.
        if (onFrom.length !== listed.length || onFrom.some((id, at) => id !== listed[at]))
          return { ok: false, detail: 'the claims on that work item have changed since.' };
        await claims.moveAll(command.fromWorkItemId, command.toWorkItemId, stamp);
        return { ok: true, detail: null };
      }
      case 'replace_blockage': {
        const rows = await this.opts.workItems.listByProject(projectId);
        if (
          !rows.some(({ id }) => id === command.workItemId) ||
          rows.some(({ parentId }) => parentId === command.workItemId)
        ) {
          return { ok: false, detail: 'that work item is no longer a leaf in this project.' };
        }
        if (!(await this.holdsStep(projectId, command.stepId))) {
          return { ok: false, detail: 'that step is no longer in this project.' };
        }
        const current =
          (await this.opts.blockages.listByWorkItems(projectId, [command.workItemId])).find(
            ({ workItemId, stepId }) =>
              workItemId === command.workItemId && stepId === command.stepId,
          )?.blockedAt ?? null;
        if (current !== command.expectedBlockedAt) {
          return { ok: false, detail: 'that step blockage changed since this command.' };
        }
        if (command.replacementBlockedAt === null) {
          await this.opts.blockages.remove(command.workItemId, command.stepId, stamp);
          return { ok: true, detail: null };
        }
        const written = await this.opts.blockages.set(
          {
            workItemId: command.workItemId,
            stepId: command.stepId,
            blockedAt: command.replacementBlockedAt,
          },
          stamp,
        );
        return written === 'written'
          ? { ok: true, detail: null }
          : { ok: false, detail: 'that step is no longer in this project.' };
      }
      case 'assign':
        if (command.personId !== null && !(await this.holdsStep(projectId, command.stepId))) {
          return { ok: false, detail: 'that step is no longer in this project.' };
        }
        {
          const reassigned = await this.opts.directory.assign(
            command.workItemId,
            command.stepId,
            command.personId,
            stamp,
          );
          if (!reassigned.ok && reassigned.reason === 'unknown_step') {
            return { ok: false, detail: 'that step is no longer in this project.' };
          }
          // The person was removed after the command ran. Undo never
          // resurrects one, so the entry is refused and discarded like any
          // other the plan has moved past.
          if (!reassigned.ok) {
            return { ok: false, detail: 'that person is no longer in the directory.' };
          }
        }
        return { ok: true, detail: null };
      case 'restore_attempt':
        return this.applyRestoreAttempt(projectId, command.attempt, stamp);
      case 'remove_attempt': {
        const removed = await this.opts.attempts.remove(
          command.workItemId,
          command.stepId,
          command.attemptNumber,
          stamp,
        );
        return removed === null
          ? { ok: false, detail: 'that attempt is no longer there.' }
          : { ok: true, detail: null };
      }
      case 'add_dependency': {
        const rows = await this.opts.workItems.listByProject(projectId);
        const existing = await this.opts.dependencies.listByProject(projectId);
        const refusal = canDepend(rows, existing, command.predecessorId, command.successorId);
        if (refusal !== null) {
          return { ok: false, detail: `that dependency would now be refused: ${refusal}` };
        }
        await this.opts.dependencies.add(
          {
            id: this.clock.newId(),
            projectId,
            predecessorId: command.predecessorId,
            successorId: command.successorId,
          },
          stamp,
        );
        return { ok: true, detail: null };
      }
      case 'remove_dependency':
        await this.opts.dependencies.remove(command.predecessorId, command.successorId, stamp);
        return { ok: true, detail: null };
      case 'add_typed_dependency': {
        const existing = await this.opts.typedDependencies.listByProject(projectId);
        // Proof: bypassing this identity check made `refuses redo when its relationship
        // ID has been reused` receive 500 instead of 409; watched 2026-09-27.
        if (existing.some((row) => row.id === command.dependency.id))
          return { ok: false, detail: 'that relationship identity is already in use.' };
        const refusal = await this.typedRefusal(projectId, stamp.by, existing, command.dependency);
        if (refusal !== null)
          return { ok: false, detail: `that relationship would now be refused: ${refusal}.` };
        await this.opts.typedDependencies.add(command.dependency, stamp);
        return { ok: true, detail: null };
      }
      case 'remove_typed_dependency': {
        const existing = await this.opts.typedDependencies.listByProject(projectId);
        // Proof: bypassing this comparison made `refuses undo when the stored relationship
        // changed outside the journal` return 200 instead of 409; watched 2026-09-27.
        if (
          !this.sameTypedDependency(
            existing.find((row) => row.id === command.dependency.id),
            command.dependency,
          )
        )
          return { ok: false, detail: 'that relationship has changed since this command.' };
        await this.opts.typedDependencies.remove(command.dependency.id, stamp);
        return { ok: true, detail: null };
      }
      case 'update_typed_dependency': {
        const existing = await this.opts.typedDependencies.listByProject(projectId);
        // Proof: this comparison disabled made `refuses undo of an update when
        // the stored relationship changed outside the journal` fail on
        // `Expected: 409, Received: 200`; watched 2026-09-27.
        if (
          !this.sameTypedDependency(
            existing.find((row) => row.id === command.from.id),
            command.from,
          )
        )
          return { ok: false, detail: 'that relationship has changed since this command.' };
        const refusal = await this.typedRefusal(projectId, stamp.by, existing, command.to);
        if (refusal !== null)
          return { ok: false, detail: `that relationship would now be refused: ${refusal}.` };
        await this.opts.typedDependencies.update(command.to, stamp);
        return { ok: true, detail: null };
      }
      case 'move':
        return this.applyMove(
          projectId,
          command.workItemId,
          command.parentId,
          command.afterId,
          stamp,
          command.expectedProgress,
        );
      case 'set_positions':
        return this.applySetPositions(projectId, command.placements, command.moved, stamp);
      case 'set_frozen': {
        const rows = await this.opts.workItems.listByProject(projectId);
        const gone = command.updates.find((each) => !rows.some((row) => row.id === each.id));
        if (gone !== undefined) {
          return {
            ok: false,
            detail: 'a work item this change froze has been deleted since then.',
          };
        }
        await this.opts.workItems.setFrozenNumbers(command.updates, stamp);
        return { ok: true, detail: null };
      }
      case 'set_step_allowance': {
        // Unconditional here: `staleness` has already compared the step's
        // allowance revision, inside this same unit of work.
        const written = await this.opts.projects.setStepAllowance(
          projectId,
          command.stepId,
          command.allowancePercent,
          stamp,
        );
        if (!written.ok) return { ok: false, detail: 'that step is no longer in this project.' };
        await this.opts.broadcast.publish(projectId, { type: 'step_updated', step: written.step });
        return { ok: true, detail: null };
      }
      case 'delete_subtree':
        return this.applyDelete(projectId, command, stamp);
      case 'batch': {
        // The steps in the order the inverse holds them — reversed forwards for
        // an undo, forwards for a redo. A step that cannot apply refuses the
        // whole batch; the runner's outer transaction is what makes the steps
        // before it vanish (ADR 0007), which is why a batch is only ever
        // undone through the runner.
        // The batch's own stamp, passed down rather than one per step: undoing a
        // batch is one act, exactly as running it was one request.
        for (const step of command.steps) {
          const applied = await this.apply(projectId, step, stamp, access);
          if (!applied.ok) return applied;
        }
        return { ok: true, detail: null };
      }
      case 'restore_subtree':
        return this.applyRestore(projectId, command, stamp);
    }
  }

  private async applyMove(
    projectId: string,
    id: string,
    parentId: string | null,
    afterId: string | null,
    stamp: WriteStamp,
    expectedProgress: readonly StoredProgress[] = [],
  ): Promise<ApplyOutcome> {
    const rows = await this.opts.workItems.listByProject(projectId);
    const moving = rows.find((row) => row.id === id);
    if (moving === undefined) return { ok: false, detail: 'the work item is no longer there.' };
    if (parentId !== null && !rows.some((row) => row.id === parentId)) {
      return { ok: false, detail: 'the work item it sat under has been deleted since then.' };
    }
    // Proof: omitted guard accepted newly retained policy on undo/redo; project-wide
    // selection refused unrelated policy. Catching read/corruption as stale returned
    // 409 instead of 500 and discarded history. Real preceding replay patches roll
    // back before stale discard; thrown reads preserve history (watched 2026-10-17).
    if (parentId !== null) {
      const parallels = await this.opts.stepParallels.listByWorkItems(projectId, [parentId]);
      if (parallels.length > 0) {
        return {
          ok: false,
          detail: 'the destination has step parallelism stated since this move.',
        };
      }
    }
    const group = this.groupUnder(rows, parentId).filter((sibling) => sibling.id !== id);
    // `placeAfter` throws on a sibling that is not in the group, which is the
    // right answer for a caller that made the id up and the wrong one for a
    // row somebody deleted while this entry sat on the stack.
    if (afterId !== null && !group.some((sibling) => sibling.id === afterId)) {
      return { ok: false, detail: 'the work item it sat after has been deleted since then.' };
    }
    if (moving.parentId !== parentId) {
      if (parentId !== null && !rows.some((row) => row.parentId === parentId)) {
        // Proof: bypassing snapshot equality accepted changed state/time, extra and missing facts in mounted and memory runner cases; watched 2026-10-14.
        const currentProgress = await this.opts.progress.listByWorkItems(projectId, [parentId]);
        if (!matchesProgress(currentProgress, expectedProgress)) {
          return { ok: false, detail: 'the destination leaf progress changed since this move.' };
        }
        // Proof: bypassing this guard returned 500 in mounted other-step blockage undo/redo; watched 2026-10-14.
        if ((await this.opts.blockages.listByWorkItems(projectId, [parentId])).length > 0) {
          return { ok: false, detail: 'the destination leaf has blockage stated since this move.' };
        }
      }
      // Proof: bypassing this consumer failed `connected replay-move refuses`
      // at its real SQLite refusal assertion; zero partial effects also checked (2026-10-22).
      const structural = await this.structuralRefusal(projectId, stamp.by, {
        rows: rows.map((row) => (row.id === id ? { ...row, parentId } : row)),
      });
      if (structural !== null)
        return {
          ok: false,
          detail:
            'dependencyIds' in structural
              ? `relationship ${structural.dependencyIds.join(', ')} no longer fits this tree.`
              : 'that would now close a dependency cycle between steps.',
        };
    }
    const placed = placeAfter(group, afterId);
    await this.opts.workItems.move(id, parentId, placed.position, placed.renumbered, stamp);
    return { ok: true, detail: null };
  }

  /**
   * Re-applies an arrangement, forwards for a redo and backwards for an undo.
   *
   * Two guards, and between them they are what `applyMove`'s three are for. A
   * work item the entry names may have been deleted since; and one may have
   * been **moved to another parent** since, in which case writing its stored
   * position would put it at a place in a group it does not belong to, silently
   * — the arrangement was about the group it was in when the press happened.
   *
   * There is no frozen guard, and that is ADR 0023 rather than an omission: a
   * frozen work item moves like any other, so freezing a row between the press
   * and the undo takes nothing away.
   */
  private async applySetPositions(
    projectId: string,
    placements: readonly Reparented[],
    moved: readonly string[],
    stamp: WriteStamp,
  ): Promise<ApplyOutcome> {
    const rows = await this.opts.workItems.listByProject(projectId);
    const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
    for (const placed of placements) {
      if (!parentOf.has(placed.id)) {
        return { ok: false, detail: 'the work item is no longer there.' };
      }
      if (parentOf.get(placed.id) !== placed.parentId) {
        return { ok: false, detail: 'a work item this arrangement placed has moved since then.' };
      }
    }
    await this.opts.workItems.setPositions(placements, moved, stamp);
    return { ok: true, detail: null };
  }

  /** Replaces captured facts conditionally while each owner is a leaf; throws on store refusal. */
  private async replaceDeletionBlockages(
    projectId: string,
    facts: readonly StoredStepBlockage[],
    isClear: boolean,
    stamp: WriteStamp,
  ): Promise<void> {
    for (const fact of facts) {
      const replaced = await this.apply(
        projectId,
        {
          do: 'replace_blockage',
          ...fact,
          expectedBlockedAt: isClear ? fact.blockedAt : null,
          replacementBlockedAt: isClear ? null : fact.blockedAt,
        },
        stamp,
      );
      // Proof: removing this refusal resolved the refused deletion hand-up test; watched 2026-10-14.
      if (!replaced.ok) throw new Error(`cannot replace deletion blockage: ${replaced.detail}`);
    }
  }

  /** Refuses complete parent blockage drift before restore can clear facts or create children. */
  private async deletionRefusal(
    projectId: string,
    state: DeletionState,
  ): Promise<ApplyOutcome | null> {
    if (state.parentId === null) return null;
    // Proof: bypassing equality exposed an unrecorded parent fact during insertion (500 vs 409); watched 2026-10-14.
    if (
      !matchesBlockages(
        await this.opts.blockages.listByWorkItems(projectId, [state.parentId]),
        state.parentBlockages,
      )
    )
      return { ok: false, detail: 'the deletion parent blockage changed since this command.' };
    return null;
  }

  /**
   * Refuses deletion of retained sparse owners on every compensating path.
   * Trusted sparse read failures throw, preserving the journal on rollback;
   * valid retained policy follows the existing stale-history discard outcome.
   */
  private async applyDelete(
    projectId: string,
    command: Extract<CompensatingCommand, { do: 'delete_subtree' }>,
    stamp: WriteStamp,
  ): Promise<ApplyOutcome> {
    const rows = await this.opts.workItems.listByProject(projectId);
    if (!rows.some((row) => row.id === command.rootId)) {
      return { ok: false, detail: 'the work item is no longer there.' };
    }
    // The guard a revision cannot give. A child written under a work item is a
    // row of its own and moves nothing on its parent, so a created row that
    // has since been built on still reads at the revision it was created with
    // — and taking it away would take somebody else's work with it.
    const now = new Set(subtreeOf(rows, command.rootId));
    const then = new Set(command.expectedSubtree);
    if (now.size !== then.size || [...then].some((id) => !now.has(id))) {
      return { ok: false, detail: 'work has been added or removed under that row since then.' };
    }
    if (command.deletionState !== undefined) {
      const refused = await this.deletionRefusal(projectId, command.deletionState);
      if (refused !== null) return refused;
      // Proof: bypassing complete-set equality deleted an added subtree fact on redo (200 vs 409); watched 2026-10-14.
      if (
        !matchesBlockages(
          await this.opts.blockages.listByWorkItems(projectId, command.remove),
          command.deletionState.blockages,
        )
      )
        return { ok: false, detail: 'the deleted subtree blockage changed since this command.' };
    }
    const root = rows.find((row) => row.id === command.rootId);
    if (root === undefined) throw new Error('delete root disappeared after its existence check');
    // Proof: bypassing this replay admission made undo-create with a newly
    // linked predecessor throw at the later graph guard rather than return
    // stale_undo; watched against the admitted SQLite UoW, 2026-10-22.
    const incidents = await this.deletionIncidents(projectId, stamp.by, command.remove);
    if (!incidents.ok) {
      if (incidents.reason === 'referenced_by_external_dependency') {
        const dependencyIds = incidents.dependencyIds;
        if (dependencyIds === undefined)
          throw new Error('incident refusal is missing relationship ids');
        return {
          ok: false,
          detail: `relationship ${dependencyIds.join(', ')} now references a removed predecessor.`,
        };
      }
      return {
        ok: false,
        detail: `incident endpoint admission refused: ${incidents.reason}.`,
      };
    }
    // Proof: omitting this residual-set guard let undo-create delete a newly
    // authored incoming relationship absent from its journal; watched against
    // real SQLite with the create entry selected and local revision aligned.
    if (incidents.ownedIncomingIds.length > 0)
      return {
        ok: false,
        detail: `relationship ${incidents.ownedIncomingIds.join(', ')} was added after this command.`,
      };
    // Proof: removing this binding accepted persisted metadata naming a different removal parent (200 vs 500); watched 2026-10-14.
    if (command.deletionState !== undefined && command.deletionState.parentId !== root.parentId)
      throw new Error('journal deletion state names the wrong removal parent');
    const removed = new Set(command.remove);
    const reparented = new Map(command.reparented.map((row) => [row.id, row]));
    const projected = rows
      .filter((row) => !removed.has(row.id))
      .map((row) => {
        const moved = reparented.get(row.id);
        return moved === undefined ? row : { ...row, parentId: moved.parentId };
      });
    const authored = (await this.opts.typedDependencies.listByProject(projectId)).filter(
      (relationship) =>
        ![relationship.predecessor, relationship.successor].some((endpoint) =>
          removed.has(endpoint.workItemId),
        ),
    );
    const estimates = await this.opts.estimates.listByProject(projectId);
    const legacy = await this.opts.dependencies.listByProject(projectId);
    // Proof: bypassing this consumer failed `connected replay-delete refuses`
    // at its real SQLite refusal assertion; zero partial effects also checked (2026-10-22).
    const structural = await this.structuralRefusal(projectId, stamp.by, {
      rows: projected,
      typed: authored,
      estimates: [
        ...estimates.filter((estimate) => !removed.has(estimate.workItemId)),
        ...command.setEstimates,
      ],
      legacy: legacy.filter(
        (edge) => !removed.has(edge.predecessorId) && !removed.has(edge.successorId),
      ),
    });
    if (structural !== null)
      return {
        ok: false,
        detail:
          'dependencyIds' in structural
            ? `relationship ${structural.dependencyIds.join(', ')} no longer fits this tree.`
            : 'that would now close a dependency cycle between steps.',
      };
    const attemptsRefused = await this.attemptsRefusal(projectId, command.setAttempts ?? []);
    if (attemptsRefused !== null) return attemptsRefused;
    // Proof: omission, root-only and operation-restricted reads erased retained
    // owners on redo-delete/undo-create/undo-duplicate; broad reads blocked unrelated
    // and promoted facts. Catch-to-stale returned 409 rather than 500 and late lookup
    // failed owned-policy replay; observed preceding patches rolled back, 2026-10-17.
    const parallels = await this.opts.stepParallels.listByWorkItems(projectId, command.remove);
    if (parallels.length > 0)
      return {
        ok: false,
        detail: 'a removed work item has step parallelism stated since this command.',
      };
    await this.opts.dependencies.removeAllFor(command.remove, stamp);
    await this.opts.typedDependencies.removeAllFor(command.remove, stamp);
    if (command.deletionState !== undefined)
      await this.replaceDeletionBlockages(projectId, command.deletionState.blockages, true, stamp);
    await this.opts.workItems.remove(command.remove, command.reparented, stamp);
    for (const each of command.setEstimates) await this.opts.estimates.set(each, stamp);
    // The hand-up again, actuals with estimates. A re-applied delete that put
    // back only half of what the original handed to the surviving parent would
    // leave the plan reporting an estimate with no record beside it.
    for (const each of command.setActuals) await this.opts.actuals.set(each, stamp);
    // And the statements, for the same reason one line up: a re-applied delete
    // that put back the figures and not the reading would leave the surviving
    // parent reporting a finished branch's work as work nobody has started.
    for (const each of command.setProgress) await this.opts.progress.set(each, stamp);
    if (command.deletionState !== undefined)
      await this.replaceDeletionBlockages(
        projectId,
        command.deletionState.handedBlockages ?? [],
        false,
        stamp,
      );
    // And the figures that are not days, per metric as they were folded. A
    // re-applied delete that handed up the days and not the tokens would leave
    // the surviving parent reporting a fortnight of work that cost nothing.
    for (const each of command.setMeasures) await this.opts.measures.set(each, stamp);
    // And the attempts, verbatim with their numbers, onto the leaf they came
    // from: the undo of a first-child create, whose child's delete above has
    // already cascaded the child's copies away.
    for (const each of command.setAttempts ?? []) await this.opts.attempts.restore(each, stamp);
    return { ok: true, detail: null };
  }

  /**
   * Writes one attempt back verbatim, refusing as stale rather than letting a
   * foreign key or the running index answer 500: the step removed since, the
   * executor removed from the directory since, or another attempt running on
   * the node now.
   */
  private async applyRestoreAttempt(
    projectId: string,
    attempt: StoredAttempt,
    stamp: WriteStamp,
  ): Promise<ApplyOutcome> {
    const refused = await this.attemptsRefusal(projectId, [attempt]);
    if (refused !== null) return refused;
    const running = await this.runningAttempt(attempt.workItemId, attempt.stepId);
    if (
      attempt.endedAt === null &&
      running !== null &&
      running.attemptNumber !== attempt.attemptNumber
    ) {
      return { ok: false, detail: 'another attempt is running at that step now.' };
    }
    await this.opts.attempts.restore(attempt, stamp);
    return { ok: true, detail: null };
  }

  /**
   * Why these attempts cannot be written back, asked before any write of the
   * replay that carries them: a step removed since, or an executor the
   * directory no longer holds. Null when nothing stands in the way.
   */
  private async attemptsRefusal(
    projectId: string,
    attempts: readonly StoredAttempt[],
  ): Promise<ApplyOutcome | null> {
    for (const attempt of attempts) {
      if (!(await this.holdsStep(projectId, attempt.stepId))) {
        return { ok: false, detail: 'that step is no longer in this project.' };
      }
      if (
        attempt.executorPersonId !== null &&
        !(await this.holdsPerson(attempt.executorPersonId))
      ) {
        return { ok: false, detail: 'that person is no longer in the directory.' };
      }
    }
    return null;
  }

  /**
   * Replays historical rows under their surviving destination after existing refusals.
   * Retained destination policy refuses as stale history; trusted sparse failures throw
   * before any restore writes so the runner preserves the original journal.
   * Outside legacy edges are admitted against the projected tree in journal order;
   * the graph guard and writes share that selection and report omitted edges.
   */
  private async applyRestore(
    projectId: string,
    command: Extract<CompensatingCommand, { do: 'restore_subtree' }>,
    stamp: WriteStamp,
  ): Promise<ApplyOutcome> {
    const root = command.rows.at(0);
    if (root === undefined) throw new Error('a restore was journalled with no rows in it');
    const rows = await this.opts.workItems.listByProject(projectId);
    const taken = command.rows.find((row) => rows.some((each) => each.id === row.id));
    if (taken !== undefined) {
      // Nothing recreates an id, so this means something else is using one
      // this branch owns. Remapping to fresh ids would leave every reference
      // to the branch — journalled and otherwise — aimed at rows that are gone.
      return { ok: false, detail: 'something already exists where that work item was.' };
    }
    if (root.parentId !== null && !rows.some((each) => each.id === root.parentId)) {
      return { ok: false, detail: 'the work item it sat under has been deleted since then.' };
    }
    const reparented = new Map(command.reparented.map((row) => [row.id, row]));
    const projectedTree = [
      ...rows.map((row) => {
        const moved = reparented.get(row.id);
        return moved === undefined ? row : { ...row, parentId: moved.parentId };
      }),
      ...command.rows,
    ];
    const estimates = await this.opts.estimates.listByProject(projectId);
    const removedEstimateKeys = new Set(
      command.removedEstimates.map((estimate) =>
        JSON.stringify([estimate.workItemId, estimate.stepId]),
      ),
    );
    const legacy = await this.opts.dependencies.listByProject(projectId);
    const projectedLegacy = [...legacy, ...command.internalDependencies];
    const externalDependencies: StoredDependency[] = [];
    const skipped: string[] = [];
    for (const edge of command.externalDependencies) {
      const refusal = canDepend(
        projectedTree,
        projectedLegacy,
        edge.predecessorId,
        edge.successorId,
      );
      // Proof: bypassing this selection failed both missing-endpoint restores and
      // the newly cyclic outside-edge restore (1 pass / 3 fail, 2026-10-22).
      if (refusal !== null) {
        skipped.push(refusal);
        continue;
      }
      externalDependencies.push(edge);
      projectedLegacy.push(edge);
    }
    // Proof: bypassing this consumer failed `connected replay-restore refuses`
    // at its real SQLite refusal assertion; zero partial effects also checked (2026-10-22).
    const structural = await this.structuralRefusal(projectId, stamp.by, {
      rows: projectedTree,
      estimates: [
        ...estimates.filter(
          (estimate) =>
            !removedEstimateKeys.has(JSON.stringify([estimate.workItemId, estimate.stepId])),
        ),
        ...command.estimates,
      ],
      legacy: projectedLegacy,
    });
    if (structural !== null)
      return {
        ok: false,
        detail:
          'dependencyIds' in structural
            ? `relationship ${structural.dependencyIds.join(', ')} no longer fits this tree.`
            : 'that would now close a dependency cycle between steps.',
      };

    // The sibling group as it will be once the reparenting has happened: the
    // rows going back under this branch leave it, and the ones the deletion
    // respaced take their old positions again. Placing against the group as it
    // stands would put the branch beside rows that are about to move.
    const backById = new Map(command.reparented.map((each) => [each.id, each]));
    const projected = rows
      .map((row) => {
        const back = backById.get(row.id);
        return back === undefined
          ? row
          : { ...row, parentId: back.parentId, position: back.position };
      })
      .filter((row) => row.parentId === root.parentId)
      .map(asSibling);
    const wasAfter = projected
      .filter((sibling) => sibling.position < command.rootPosition)
      .sort((a, b) => a.position - b.position)
      .at(-1);
    const placed = placeAfter(projected, wasAfter?.id ?? null);
    // Proof: with this refusal removed, `refuses an undo of a delete once a step
    // its claims and progress name was removed` (resource-occupancy.db.test.ts)
    // threw a FOREIGN KEY failure on SQLite (memory was still refused by the
    // `add_claims` guard below); watched 2026-10-20.
    const stepGone = await this.stepRemovedSince(projectId, command);
    if (stepGone !== null) return stepGone;
    const attemptsRefused = await this.attemptsRefusal(projectId, command.attempts ?? []);
    if (attemptsRefused !== null) return attemptsRefused;
    const demands = command.demands ?? [];
    if (demands.length > 0) {
      const held = new Set((await this.opts.directory.listResources()).map(({ id }) => id));
      // Proof: with this refusal removed, `refuses an undo of a delete whose
      // demanded resource was deleted since` (resource-occupancy.db.test.ts)
      // threw a foreign key failure on SQLite and `unknown_resource` from the
      // memory subtree write; watched 2026-10-20.
      if (demands.some(({ resourceId }) => !held.has(resourceId)))
        return { ok: false, detail: 'a resource it demanded is no longer in the directory.' };
    }

    if (command.deletionState !== undefined) {
      const refused = await this.deletionRefusal(projectId, command.deletionState);
      if (refused !== null) return refused;
    }
    // Proof: omitted guard accepted redo-create/undo-delete and nested duplicate
    // destinations; overbroad reads refused unrelated policy. Swallowed failures
    // returned 409 instead of 500; parent-skip accepted corrupt parent ownership.
    // Early reads displaced deletion refusal; late reads cleared captured blockage
    // or inserted rows before refusal. Root reads and source rereads broke controls
    // (mounted restore-step-parallel cases, independently watched 2026-10-17).
    if (root.parentId !== null) {
      const parallels = await this.opts.stepParallels.listByWorkItems(projectId, [root.parentId]);
      if (parallels.length > 0)
        return {
          ok: false,
          detail: 'the destination has step parallelism stated since this restore.',
        };
    }
    if (command.deletionState !== undefined) {
      await this.replaceDeletionBlockages(
        projectId,
        command.deletionState.parentBlockages,
        true,
        stamp,
      );
    }
    await this.opts.subtrees.insertSubtree(
      {
        rows: command.rows.map((row) => ({
          ...row,
          position: row.id === root.id ? placed.position : row.position,
          // A row that has been away and come back is new to every reader
          // holding a number for it, so it starts again at 0 rather than
          // resuming the count it had. The consequence is deliberate: an older
          // entry on the stack that expected one of these rows at 4 now refuses,
          // which is the safe direction — see `design.md`.
          revision: 0,
        })),
        respaced: placed.renumbered,
        reparented: command.reparented,
        estimates: command.estimates,
        actuals: command.actuals,
        progress: command.progress,
        measures: command.measures,
        assignments: command.assignments,
        // Proof: with `[]` here, `undo of a delete puts the demands back exactly`
        // and the duplicate's redo (resource-occupancy.db.test.ts) read no
        // demands on both stores; watched 2026-10-20.
        demands,
        dependencies: command.internalDependencies,
        removedEstimates: command.removedEstimates,
        removedActuals: command.removedActuals,
        removedProgress: command.removedProgress,
        removedMeasures: command.removedMeasures,
      },
      stamp,
    );
    if (command.deletionState !== undefined) {
      // Proof: skipping these writes lost historical parent state/time in mounted deletion undo; watched 2026-10-14.
      for (const fact of command.deletionState.restoredParentProgress) {
        const written = await this.opts.progress.set(fact, stamp);
        // Proof: ignoring store refusal resolved the refused historical progress restoration test; watched 2026-10-14.
        if (written !== 'written')
          throw new Error(`cannot restore historical parent progress: ${written}`);
      }
      // Proof: skipping this restore lost the exact done-leaf blockage on mounted undo; watched 2026-10-14.
      await this.replaceDeletionBlockages(projectId, command.deletionState.blockages, false, stamp);
    }
    // The attempts after the rows they hang off: off the surviving parent
    // first (the redo of a first-child create), then onto the restored rows,
    // verbatim with their numbers.
    for (const key of command.removedAttempts ?? []) {
      await this.opts.attempts.remove(key.workItemId, key.stepId, key.attemptNumber, stamp);
    }
    for (const each of command.attempts ?? []) await this.opts.attempts.restore(each, stamp);
    // Then the marks, for numbers the attempts no longer show (A42). A mark on a
    // row outside the branch is a journal this process did not write; one on a
    // step removed since went with the step, as its node did.
    const marks = command.issuedAttemptNumbers ?? [];
    if (marks.length > 0) {
      const restoredIds = new Set(command.rows.map((row) => row.id));
      const stray = marks.find((mark) => !restoredIds.has(mark.workItemId));
      if (stray !== undefined) {
        throw new Error(`a restore carries a mark for ${stray.workItemId}, outside its branch`);
      }
      const held = new Set((await this.opts.projects.stepsOf(projectId)).map((each) => each.id));
      await this.opts.attempts.raiseIssued(marks.filter((mark) => held.has(mark.stepId)));
    }

    for (const edge of externalDependencies) {
      await this.opts.dependencies.add(
        {
          id: this.clock.newId(),
          projectId,
          predecessorId: edge.predecessorId,
          successorId: edge.successorId,
        },
        stamp,
      );
    }
    return {
      ok: true,
      detail:
        skipped.length === 0
          ? null
          : `put back without ${String(skipped.length)} dependenc${skipped.length === 1 ? 'y' : 'ies'} the plan no longer allows (${[...new Set(skipped)].join(', ')})`,
    };
  }

  /**
   * Writes one command down — to the account's undo stack and to the project's
   * history — after it has been applied and announced.
   *
   * **Ordering, and what it costs.** The change is applied and broadcast
   * first, then journalled. A journal write that throws therefore fails the
   * request for a change that has already happened — the client refetches and
   * sees it — while everybody else's view of the plan stays correct. The
   * alternative, journalling before the broadcast, would trade an accurate
   * error for a project full of readers sitting on a tree that has moved.
   * Neither swallows the failure: the one thing this must never do is report
   * success for a command it did not record, because the symptom would be an
   * undo key that quietly skips a change. See `design.md`.
   *
   * The preconditions are read **after** the mutation, and are the revisions
   * it left behind. Recording the revisions from before it would make an undo
   * of somebody's own second edit pass when it must refuse.
   *
   * **The history row is written from here and from nowhere else.** Every
   * journalled command — all fifteen kinds — becomes one `plan_event` row, per
   * project rather than per account and never pruned by anybody's undo, which is
   * the whole of R5's "examine the history of estimates changes". It is one extra
   * `INSERT` in the transaction the journal append already opens rather than a
   * second call, so a command cannot be undoable without also being recorded; see
   * {@link CommandJournalStore.append}. Adding a sixteenth journalled kind
   * therefore adds it to the history for free, which is why H2's actuals must go
   * through this seam and not around it.
   *
   * **What the history does not hold, stated because it will be asked.** Undo and
   * redo append nothing here — they flip an entry in place, by design — so an
   * estimate set to 8 and then undone leaves one event reading "set to 8" and no
   * event saying it was taken back. Every event is true about the moment it
   * records; the sequence is incomplete. Closing it means logging from the undo
   * path too, which is a second write site and R5's H5 question, not this change's.
   * See `openspec/changes/plan-history/design.md` D4.
   */
  /**
   * Runs `work` with this service's recordings **collected** rather than
   * written: every `record` inside it lands in the returned list and every
   * broadcast is folded into one `dirty` flag. The {@link Command batch} runner
   * is the one caller; it decides afterwards whether the list is one entry or
   * a batch ({@link recordCollected}) and broadcasts once.
   *
   * Never nested: a batch inside a batch is a shape nothing sends, and quietly
   * merging two collectors would hand the outer one steps it did not run.
   *
   * @throws when a collector is already installed.
   */
  async collect<T>(work: () => Promise<T>): Promise<Collected<T>> {
    if (this.collector !== null) throw new Error('a command batch is already collecting');
    const collector: BatchCollector = { recordings: [], dirty: false };
    this.collector = collector;
    try {
      const result = await work();
      return { result, recordings: collector.recordings, dirty: collector.dirty };
    } finally {
      this.collector = null;
    }
  }

  /**
   * Writes what {@link collect} gathered: nothing for nothing, the one step as
   * itself, and two or more as one `batch` compensating command whose inverse
   * walks the steps backwards — one journal entry, one plan event, one undo.
   * `plan-commands` D3.
   */
  async recordCollected(
    projectId: string,
    actorId: string,
    recordings: readonly CollectedRecording[],
  ): Promise<void> {
    if (recordings.length === 0) return;
    // The batch's own act, and its own stamp: the steps it gathered each dated
    // their rows when they ran, and this is the one entry and one event standing
    // for all of them.
    const stamp = this.clock.stampFor(actorId);
    const [only] = recordings;
    if (recordings.length === 1) {
      await this.record(projectId, stamp, only.kind, only.label, only.recording);
      return;
    }
    await this.record(projectId, stamp, 'batch', `${String(recordings.length)} changes`, {
      forward: { do: 'batch', steps: recordings.map((each) => each.recording.forward) },
      inverse: {
        do: 'batch',
        steps: recordings.map((each) => each.recording.inverse).reverse(),
      },
      touched: [...new Set(recordings.flatMap((each) => each.recording.touched))],
      // Proof: omitting collected owners let a collected move redo delete changed progress; watched 2026-10-14.
      moveProgressOwners: [
        // Proof: omitting collection owners made mounted collected deletion undo refuse damaged metadata (500 vs 200); watched 2026-10-14.
        ...new Set(recordings.flatMap((each) => each.recording.moveProgressOwners ?? [])),
      ],
      before: only.recording.before,
      externalBefore: [
        ...recordings
          .reduce((earliest, each) => {
            for (const revision of each.recording.externalBefore ?? []) {
              const key = scopedRevisionKey(revision);
              // Proof: earliest-batch-external-before bypass failed `collected history keeps an external endpoint first seen`'s selected assertion
              // (actual SQLite boundary; watched 2026-10-22).
              if (!earliest.has(key)) earliest.set(key, revision);
            }
            return earliest;
          }, new Map<string, ScopedRevision>())
          .values(),
      ],
      // The first step to write each step is the one whose before-state the
      // batch started from, so later steps never overwrite it.
      stepsBefore: recordings.reduceRight<Revisions>(
        (later, each) => ({ ...later, ...each.recording.stepsBefore }),
        {},
      ),
    });
  }

  /**
   * Discards one journal entry — the {@link Command batch} runner's second
   * discard of a stale entry, made outside the transaction it rolled back.
   */
  discardEntry(entryId: string): Promise<void> {
    return this.opts.journal.discard(entryId);
  }

  /** Broadcasts the whole tree now — what a batch does once, after its commit. */
  announceTreeNow(projectId: string): Promise<void> {
    return this.announceTree(projectId);
  }

  /**
   * Takes the act's {@link WriteStamp} rather than its actor and a clock of its
   * own: the journal entry, the plan event and the audit columns of every row
   * this act wrote then carry one instant and one author, which is the whole
   * point — the history is ordered by these columns.
   */
  private async record(
    projectId: string,
    stamp: WriteStamp,
    kind: string,
    label: string,
    recording: Recording,
  ): Promise<void> {
    if (this.collector !== null) {
      this.collector.recordings.push({ kind, label, recording });
      return;
    }
    const externalAddresses = externalAddressesOf(
      [recording.forward, recording.inverse],
      projectId,
    );
    let externalRevisions: ExternalRevisionPreconditions | null = null;
    if (externalAddresses.length > 0) {
      if (recording.externalBefore === undefined)
        throw new Error('recording external revision before-image is missing');
      const expected = await withDependencyContext(
        this.opts.dependencyContext,
        projectId,
        stamp.by,
        (context) => context.endpoints.readRevisions(externalAddresses),
      );
      if (!expected.ok)
        throw new Error('recording external revision evidence is no longer readable');
      externalRevisions = { expected: expected.revisions, from: recording.externalBefore };
      requireExternalRevisions({ expected: {}, from: {}, externalRevisions }, projectId, [
        recording.forward,
        recording.inverse,
      ]);
    }
    const units = new Map(
      (await this.opts.projects.stepsOf(projectId)).map((step) => [step.id, step.estimateUnit]),
    );
    const estimateUnits = Object.fromEntries(
      [...estimateStepsOf([recording.forward, recording.inverse])].map((stepId) => [
        stepId,
        estimateUnitOf(units, stepId),
      ]),
    );
    const subject = subjectOf(recording.forward);
    await this.opts.journal.append(
      {
        id: this.clock.newId(),
        projectId,
        userId: stamp.by,
        kind,
        payload: { label, forward: recording.forward },
        inverse: recording.inverse,
        preconditions: {
          ...(externalRevisions === null ? {} : { externalRevisions }),
          estimateUnits,
          ...((recording.moveProgressOwners?.length ?? 0) === 0
            ? {}
            : {
                moveProgress: await this.captureMoveProgress(
                  projectId,
                  recording.moveProgressOwners ?? [],
                ),
              }),
          expected: await this.revisionsOf(projectId, recording.touched),
          // The same entities as they were before the mutation, read off the row
          // list the mutation's own guard produced. Nothing is checked against
          // it — it is what tells a later undo whether the entry beneath this
          // one is still describing an unbroken chain. See `Preconditions`.
          from: { ...revisionsIn(recording.before, recording.touched), ...recording.stepsBefore },
        },
        createdAt: stamp.at,
      },
      {
        id: this.clock.newId(),
        projectId,
        userId: stamp.by,
        kind,
        label,
        workItemId: subject.workItemId,
        stepId: subject.stepId,
        // The compensating command, which is where the before-state lives: for
        // the estimate kinds it carries the trio that was stored, and for the
        // rest it is the only before-state that exists. See `plan_event`.
        before: recording.inverse,
        after: recording.forward,
        // The same instant as the journal entry and as every row this act wrote,
        // because all of them come off one {@link WriteStamp}. Two `now()` calls
        // would let one act carry two timestamps, and the history is ordered by
        // this column.
        createdAt: stamp.at,
      },
    );
  }

  /**
   * Whether the project still holds this step.
   *
   * Asked on every write that names one, because a step can be removed while a
   * client has it on screen — and both `estimate` and `assignment` reference it
   * by foreign key. Reading the project's steps rather than taking a step store
   * of its own: the answer is one column of a list this service already reads.
   *
   * Proof: with both calls removed, `refuses an estimate and an assignee for a
   * step that has gone, rather than 500ing` fails with two 500s, and `leaves an
   * undo whose step has gone refusing as stale, not writing` 500s too; watched
   * 2026-08-08.
   */
  private async holdsStep(projectId: string, stepId: string): Promise<boolean> {
    const steps = await this.opts.projects.stepsOf(projectId);
    return steps.some((each) => each.id === stepId);
  }

  /** One work item's stored trio for one step, or null when it holds none. */
  private async storedTrio(
    projectId: string,
    workItemId: string,
    stepId: string,
  ): Promise<Days | null> {
    const found = (await this.opts.estimates.listByProject(projectId)).find(
      (each) => each.workItemId === workItemId && each.stepId === stepId,
    );
    if (found === undefined) return null;
    return {
      optimistic: found.optimistic,
      realistic: found.realistic,
      pessimistic: found.pessimistic,
    };
  }

  /**
   * One work item's recorded days for one step, or null when it holds none.
   *
   * Null rather than 0, and every caller of this treats the two as different
   * answers: 0 is a person saying the work took no time, and null is nobody
   * having said anything. The absence is what an undo of the first recording
   * puts back.
   */
  private async storedActual(
    projectId: string,
    workItemId: string,
    stepId: string,
  ): Promise<number | null> {
    const found = (await this.opts.actuals.listByProject(projectId)).find(
      (each) => each.workItemId === workItemId && each.stepId === stepId,
    );
    return found?.days ?? null;
  }

  /**
   * One work item's recorded figure in one metric for one step, or null when it
   * holds none in that metric.
   *
   * Null rather than 0, on {@link WorkItemService.storedActual}'s reading and
   * per metric: a pair holding a token estimate and no hours has said one thing
   * and not the other, and an undo of the hours must put back the absence
   * rather than a zero beside a real figure.
   */
  private async storedMeasure(
    projectId: string,
    workItemId: string,
    stepId: string,
    metric: MeasureMetric,
  ): Promise<number | null> {
    const found = (await this.opts.measures.listByProject(projectId)).find(
      (each) => each.workItemId === workItemId && each.stepId === stepId && each.metric === metric,
    );
    return found?.value ?? null;
  }

  /**
   * What one work item's step currently says, or null when it has said nothing.
   *
   * Null rather than `unknown`, and every caller treats the two as one
   * answer with two spellings only in the direction that matters: null is what
   * an undo of the first statement puts back, and it puts it back by deleting
   * the row rather than by writing a third value into the column.
   */
  private async storedProgress(
    projectId: string,
    workItemId: string,
    stepId: string,
  ): Promise<StepState | null> {
    const found = (await this.opts.progress.listByProject(projectId)).find(
      (each) => each.workItemId === workItemId && each.stepId === stepId,
    );
    return found?.state ?? null;
  }

  /** The node's running attempt, or null when none runs. */
  private async runningAttempt(
    workItemId: string,
    stepId: string,
  ): Promise<RunningStoredAttempt | null> {
    const held = (await this.opts.attempts.listOfWorkItem(workItemId)).get(stepId) ?? [];
    const running = held.find((attempt) => attempt.endedAt === null);
    return running === undefined ? null : { ...running, endedAt: null, outcome: null };
  }

  /**
   * Whether the directory holds this person. Asked before an attempt names an
   * executor, for {@link holdsStep}'s reason: `executor_person_id` is a
   * foreign key, and an out-of-date picker must answer `unknown_person`, not 500.
   */
  private async holdsPerson(personId: string): Promise<boolean> {
    return (await this.opts.directory.listPeople()).some((person) => person.id === personId);
  }

  /**
   * The step node as a history sentence names it: its reference (`010.dev`),
   * or the step's name on the quoted work item when the step has no code.
   *
   * The number is the one derived at the write, so a later renumbering leaves
   * the sentence naming the node as it was then — the spec's wording
   * (`plan-command-registry`), at {@link quoteName}'s known cost.
   *
   * @throws when the step or the work item's number is missing: both were
   * checked by the caller in the same request.
   */
  private async nodeLabel(
    rows: readonly WorkItem[],
    workItem: WorkItem,
    stepId: string,
  ): Promise<string> {
    const ordered = orderSteps(await this.opts.projects.stepsOf(workItem.projectId));
    const stepAt = ordered.findIndex((each) => each.id === stepId);
    if (stepAt === -1) throw new Error(`step ${stepId} left the project mid-write`);
    const step = ordered[stepAt];
    if (step.code === null) return `${step.name} of ${quoteName(workItem.name)}`;
    const number = deriveNumbers(rows).get(workItem.id);
    if (number === undefined) throw new Error(`no effective number for work item ${workItem.id}`);
    // The canonical reference `readStepAddresses` writes: the displayed ordinal
    // padded to the project's step count, then the code.
    return formatStepReference(number, step.code, stepAt + 1, ordered.length);
  }

  private async announceTree(projectId: string): Promise<void> {
    if (this.collector !== null) {
      this.collector.dirty = true;
      return;
    }
    const tree = await this.tree(projectId);
    if (tree === null) return;
    if ('kind' in tree) {
      // Proof: publishing an empty `tree_replaced` here made the real-runner
      // test receive `{ type: 'tree_replaced', workItems: [] }` instead of the
      // durable `plan_unavailable` event after the mutation had committed.
      await this.opts.broadcast.publish(projectId, {
        type: 'plan_unavailable',
        error: tree.error,
        engine: tree.engine,
      });
      return;
    }
    await this.opts.broadcast.publish(projectId, {
      type: 'tree_replaced',
      workItems: tree.workItems,
    });
  }

  private groupUnder(rows: readonly WorkItem[], parentId: string | null): Sibling[] {
    return rows.filter((row) => row.parentId === parentId).map(asSibling);
  }

  /**
   * What a create stamps when the command names no priority: this project's
   * {@link ORDINARY_BAND_RANK} band's own default value.
   *
   * Read from the project being written to, every time — see the comment at its
   * one call site in {@link WorkItemService.create}.
   *
   * **Throws on a short ladder rather than falling back to the default one.**
   * `PriorityBandStore.listFor` answers five bands or the default five, and
   * `priorityLadderProblem` refuses a write of any other count, so a ladder with
   * no middle rung is a store that has stopped keeping its contract — and
   * quietly stamping 50 there would write a number from a ladder this project
   * does not use into a band it may not own (`AGENTS.md` R5: unknown is not OK).
   *
   * Proof: the throw replaced by `?? DEFAULT_PRIORITY_BANDS[ORDINARY_BAND_RANK]`,
   * and `refuses to create against a ladder with no middle rung` failed on
   * `expected "(resolved without throwing)" to match /no rank 2 rung/` — the
   * create returned `ok` having stored 50. Watched 2026-08-29,
   * `work-item.service.test.ts`.
   */
  private async ordinaryPriorityOf(projectId: string): Promise<number> {
    const bands = await this.opts.priorityBands.listFor(projectId);
    const ordinary = bands.at(ORDINARY_BAND_RANK);
    if (ordinary === undefined) {
      throw new Error(
        `project ${projectId} has a priority ladder of ${String(bands.length)} bands, ` +
          `so it has no rank ${String(ORDINARY_BAND_RANK)} rung to create work items at`,
      );
    }
    return ordinary.defaultValue;
  }

  /** The work item, its project and the project's rows — or the refusal that stops the caller. */
  private async contextFor(
    id: string,
    actorId: string,
  ): Promise<WorkItemOutcome<{ workItem: WorkItem; project: Project; rows: LabelledWorkItem[] }>> {
    const workItem = await this.opts.workItems.findById(id);
    if (workItem === null) return { ok: false, reason: 'not_found' };
    const project = await this.opts.projects.findById(workItem.projectId);
    if (project === null) return { ok: false, reason: 'not_found' };
    if (!this.opts.admission.admits(project, actorId)) return { ok: false, reason: 'forbidden' };
    const rows = await this.opts.workItems.listByProject(workItem.projectId);
    return { ok: true, value: { workItem, project, rows } };
  }
}
export type {
  IdentifiedSlice,
  PlanOptimization,
  PlanTree,
  ScheduleError,
} from '../../ports/plan-tree';
export type { NumberedWorkItem } from '../../service/numbered-work-item';

interface TreeReads {
  project: Project;
  rows: LabelledWorkItem[];
  stored: readonly StoredEstimate[];
  recorded: readonly StoredActual[];
  stated: readonly StoredProgress[];
  measured: readonly StoredMeasure[];
  edges: readonly Pick<StoredDependency, 'predecessorId' | 'successorId'>[];
  authored: readonly TypedDependency[];
  assigned: readonly Assignment[];
  assignedPeople: { id: string; name: string }[];
  /** Every attempt in the project, read beside the statements and handed to no engine. */
  attempts: readonly StoredAttempt[];
  blockages: readonly StoredStepBlockage[];
  seq: number;
  steps: Step[];
  slotsOf: ReadonlyMap<string, number>;
  /** The demands and resource capacities both engines level (`wbs-resources` R5). */
  demands: readonly Demand[];
  resourceCapacities: readonly ResourceCapacity[];
  priorityBands: PriorityBand[];
  /** The shared chain's holder labels; empty for an isolated read. */
  elsewhereHolders: readonly ElsewhereHolderLabel[];
}

/** Projects detached shared rows and captured schedules without reading stores or admitting work. */
function projectSharedTree(
  captured: Extract<LivePlanRead, { readonly kind: 'shared' }>,
): PlanTree | EngineUnavailable;
function projectSharedTree(
  captured: Exclude<LivePlanRead, { readonly kind: 'isolated' | 'access_refused' | 'connected' }>,
): PlanTree | EngineUnavailable | null;
function projectSharedTree(
  captured: Exclude<LivePlanRead, { readonly kind: 'isolated' | 'connected' }>,
): PlanTree | EngineUnavailable | AccessRefused | null;
function projectSharedTree(
  captured: Exclude<LivePlanRead, { readonly kind: 'isolated' | 'connected' }>,
): PlanTree | EngineUnavailable | AccessRefused | null {
  if (captured.kind === 'access_refused') return captured;
  if (captured.kind === 'not_found') return null;
  const { chain, project, workItems: rows, steps, seq } = captured;
  if (chain.kind === 'engine_unavailable') return chain;
  const reads = chain.reads;
  const people = new Set(reads.assignments.map((assignment) => assignment.personId));
  const tree = projectTree(
    {
      project,
      rows,
      steps,
      seq,
      stored: reads.estimates,
      recorded: reads.actuals,
      stated: reads.progress,
      measured: reads.measures,
      edges: reads.dependencies,
      authored: reads.typedDependencies,
      assigned: reads.assignments,
      assignedPeople: reads.people
        .filter((person) => people.has(person.id))
        .map(({ id, name }) => ({ id, name })),
      // Proof: `[]` here made `reads attempts ascending and derived spans per
      // node and leaf (shared)` read no attempts (`received value must be a
      // non-null object`) while the isolated case passed; watched 2026-10-12.
      attempts: captured.attempts,
      // Proof: forwarding [] failed `reads a direct timestamp and the exact
      // downstream root (shared)`; watched 2026-10-13.
      blockages: captured.blockages,
      slotsOf: reads.capacity,
      // The schedule itself was computed on the snapshot (`chain.scheduled`);
      // these reach the one canonical seam so it reads the snapshot's facts and
      // not a second, empty answer. Not a check: `[]` here schedules the same.
      demands: reads.demands,
      resourceCapacities: reads.resourceCapacities,
      priorityBands: [...reads.priorityBands],
      elsewhereHolders: chain.kind === 'scheduled' ? chain.holders : [],
    },
    chain.kind === 'scheduled' ? chain.scheduled : { kind: 'unavailable', reason: chain.reason },
  );
  // Labelled from the snapshot's own catalog, already under the organization's
  // names, so the label and the bar are one observation.
  // Proof: returning the tree unlabelled made `levels a demanded resource
  // (shared)` find no `resourceLabels`; watched 2026-10-20.
  return 'kind' in tree || !namesAResource(tree) ? tree : withResourceLabels(tree, reads.resources);
}

/** Present one captured connected member without local scheduling or further IO. */
export function presentConnectedTree(projection: ConnectedTreeProjection): PlanTree {
  // Proof: restoring the old nonscheduled refusal made the mounted calendar,
  // optimized-refusal and postcommit edit/claim cases return 500 (2026-10-22).
  const { reads, metadata } = projection;
  const people = new Set(reads.assignments.map((assignment) => assignment.personId));
  const tree = projectTree(
    {
      project: metadata.project,
      rows: [...metadata.workItems],
      steps: [...metadata.steps],
      seq: metadata.seq,
      stored: reads.estimates,
      recorded: reads.actuals,
      stated: reads.progress,
      measured: reads.measures,
      edges: reads.dependencies,
      authored: reads.typedDependencies,
      assigned: reads.assignments,
      assignedPeople: reads.people
        .filter((person) => people.has(person.id))
        .map(({ id, name }) => ({ id, name })),
      attempts: metadata.attempts,
      blockages: metadata.blockages,
      slotsOf: reads.capacity,
      demands: reads.demands,
      resourceCapacities: reads.resourceCapacities,
      priorityBands: [...reads.priorityBands],
      elsewhereHolders: [],
    },
    projection,
  );
  // Proof: removing this final-availability guard made the mounted shared
  // calendar-range case retain abandoned foreign holder labels (2026-10-22).
  // Proof: omitting the remote root catalog from both return arms failed the unavailable
  // hold/step and scheduled rename/clear mounted HTTP tests (2026-10-23).
  if (tree.scheduleError !== null)
    return {
      ...tree,
      connectedDependencies: [...projection.dependencies],
      remoteBlockageLabels: [...projection.remoteBlockageLabels],
    };
  // Proof: disabling this transfer reproduced the mounted visible-row Gantt
  // dangling-predecessor failure; removing only the catalog below reproduced
  // Gantt's missing-holder-label failure (2026-10-22).
  const slices = tree.slices.map((slice) => {
    const holder = projection.foreignPersonHolders.get(slice.id);
    return holder === undefined
      ? slice
      : {
          ...slice,
          boundBy: 'elsewhere' as const,
          resourcePredecessorId: null,
          elsewhereHolder: holder,
        };
  });
  const connected = {
    ...tree,
    // Proof: omitting this attachment returned undefined for all four public
    // connected producer/response/client fixture states (2026-10-22).
    ...(projection.optimizationView === null ? {} : { optimization: projection.optimizationView }),
    slices,
    connectedDependencies: [...projection.dependencies],
    remoteBlockageLabels: [...projection.remoteBlockageLabels],
    ...(projection.foreignPersonHolders.size === 0
      ? {}
      : {
          // Proof: keeping the numeric schedule's original person count
          // failed the mounted shared-person tree's 0/1 counts (2026-10-22).
          waitingForPerson: new Set(
            slices.filter((slice) => slice.boundBy === 'person').map((slice) => slice.workItemId),
          ).size,
          waitingElsewhere: new Set(
            slices
              .filter((slice) => slice.boundBy === 'elsewhere')
              .map((slice) => slice.workItemId),
          ).size,
          elsewhereHolders: [...projection.elsewhereHolders],
        }),
  };
  return namesAResource(connected) ? withResourceLabels(connected, reads.resources) : connected;
}

/** Whether any bar of the displayed schedule waited for a resource's pool. */
function namesAResource(tree: PlanTree): boolean {
  return tree.slices.some((slice) => slice.capacityResource !== undefined);
}

/**
 * The tree with one label per resource a bar's `capacityResource` names
 * (`wbs-resources` R5), so the chart says what a bar waited for in the same
 * read it draws the bar from — `elsewhereHolders`' shape.
 *
 * @throws when a named resource is absent from `catalog`: the schedule was
 * levelled against a resource this read cannot name, which is two trusted
 * reads disagreeing.
 */
function withResourceLabels(tree: PlanTree, catalog: readonly Resource[]): PlanTree {
  const byId = new Map(catalog.map((resource) => [resource.id, resource] as const));
  const named = [
    ...new Set(
      tree.slices.flatMap((slice) =>
        slice.capacityResource === undefined ? [] : [slice.capacityResource.resourceId],
      ),
    ),
  ].sort();
  return {
    ...tree,
    resourceLabels: named.map((resourceId) => {
      const resource = byId.get(resourceId);
      if (resource === undefined)
        throw new Error(`a bar waited for resource "${resourceId}", which this read cannot name`);
      return { id: resource.id, name: resource.name, unitLabel: resource.unitLabel };
    }),
  };
}

/** Pure live projection shared by isolated reads and coherent shared observations. */
type TreeSchedule =
  | ScheduleRead
  | ConnectedTreeProjection
  | { readonly kind: 'unavailable'; readonly reason: Exclude<ScheduleError, null> };

function projectTree(reads: TreeReads, scheduling: ConnectedTreeProjection): PlanTree;
function projectTree(reads: TreeReads, scheduling: TreeSchedule): PlanTree | EngineUnavailable;
function projectTree(reads: TreeReads, scheduling: TreeSchedule): PlanTree | EngineUnavailable {
  const {
    project,
    rows,
    stored,
    recorded,
    stated,
    measured,
    edges,
    authored,
    assigned,
    assignedPeople,
    attempts,
    blockages,
    seq,
    steps,
    slotsOf,
    demands,
    resourceCapacities,
    priorityBands,
  } = reads;
  const numbers = deriveNumbers(rows);
  const totals = rollUp(rows, stored);
  const recordedTotals = rollUpActuals(rows, recorded);
  // Three folds over a tree already in memory, one per metric, because adding
  // a token to an hour is the thing `rollUpMeasures` exists to make
  // impossible. Built as a map of metric to the whole fold rather than as a
  // per-row object here, so the recursion runs once per metric for the project
  // instead of once per metric per row.
  const measuredTotals = new Map(
    MEASURE_METRICS.map((metric) => [metric, rollUpMeasures(rows, measured, metric)] as const),
  );
  // Which steps have work on each leaf: the ones with an estimate, the ones
  // with a recorded day, and the ones somebody has already spoken about.
  //
  // This set is what makes `done` mean anything. A leaf where Dev says done
  // and QA holds an estimate nobody has spoken about is **in progress**, not
  // finished — and the only way the fold can know QA exists on that row is for
  // the estimate to put it here. See `rollUpProgress`.
  //
  // A node holding any attempt is in that set too, and a running attempt on a
  // node nobody has spoken about reads `in_progress` (`step-node-readings` D2).
  const running = attempts.filter((attempt) => attempt.endedAt === null);
  const statedTotals = rollUpProgress(
    rows,
    stated,
    workedStepsOf(stored, recorded, stated, attempts),
    running,
  );
  // The row's own reading, folded over its **children** rather than over its
  // rolled-up steps — see `rollUpWorkItemStatuses` for why the two differ and which
  // one is true.
  // Preserve the row proxy fold's leaf-level endpoint filter. The complete
  // node graph below separately refuses missing legacy endpoints as malformed
  // trusted state; its precise node projection never supplies this row status.
  const rowIds = new Set(rows.map((row) => row.id));
  // Proof: replacing component statuses with the target-only fold made the
  // mounted remote-held predecessor test read ready instead of blocked_by_proxy
  // (2026-10-22).
  const itemStatuses =
    scheduling.kind === 'connected'
      ? scheduling.readiness.statuses
      : workItemStatusesOf(rows, rollUpWorkItemStatuses(rows, statedTotals), {
          edges: edges.filter(
            (edge) => rowIds.has(edge.predecessorId) && rowIds.has(edge.successorId),
          ),
          typed: authored,
        });
  // Canonical readings use complete topology for blockage propagation and
  // workflow/authored predecessors for waiting (ADR 0053). Row proxy remains
  // independent; it cannot turn a sibling endpoint into a node predecessor.
  // Proof: recomputing these nodes from target-only topology made the mounted
  // remote blockage test lose blocked_by_proxy and its remote root (2026-10-22).
  const nodeProjection =
    scheduling.kind === 'connected'
      ? scheduling.readiness.nodes
      : projectNodeReadings({
          graph: resolveDependencyGraph({
            rows,
            steps,
            estimates: stored,
            legacy: edges,
            typed: authored,
            reach: project.depReach,
          }),
          holdOf: new Map(rows.map((row) => [row.id, row.hold] as const)),
          statusOf: itemStatuses,
          stated,
          running,
          blocked: blockages,
        });
  // The write path refuses an edge that would close a cycle, but two clients
  // drawing conflicting edges at the same instant are each checked against the
  // graph as they read it. If one ever lands, every read of this project must
  // still work: the rows are there, and a plan nobody can open is worse than
  // one with no dates in it. The dates go, the rows stay, and the reason is
  // reported rather than left as a page of zeroes.
  // Step order comes from the project, because the order the steps are read
  // in is the order the work runs in — see `ProjectRepository.stepsOf`.

  // How many slots this project may take of each team, read here rather than
  // inside `slicesOf` so the adapter stays a pure function of what it is
  // handed.
  //
  // `slotsOf` in name and in shape, and the seam C1 built is now doing the job
  // it was built for. C1's own comment here predicted "one additive table and a
  // first lookup, with this as the fallback"; `capacity-per-project` (Dany,
  // 2026-08-13) kept the first half and refused the second, so this is the one
  // lookup and there is **no fallback to `serviceTeam.size`** — a team this
  // project has stated nothing about is absent from the map, and an absent key
  // is unconstrained.
  //
  // Keyed on the team alone, not on the (project, team) pair: this is called
  // once per project, so a project component inside the map would be constant
  // for the whole call and every engine test would have to spell it. The pair
  // is the key in the **store**. design.md D3.

  // The ladder, read here and handed straight to the payload. It is passed to
  // nothing — not `slicesOf`, not `schedule` — and that is the change's whole
  // claim about itself: `git diff` on this file shows one read and one field.

  const canonical = canonicalScheduleParts(
    project,
    rows,
    stored,
    edges,
    authored,
    assigned,
    steps,
    slotsOf,
    demands,
    resourceCapacities,
  );
  const { assigneesOf, hasChildren, rule } = canonical;
  // Proof: passing canonical.input.rows dropped held leaf resources and
  // failed both mounted parity cases; full retained rows preserve inherited
  // labels before the page filter. Watched 2026-10-15.
  const resources = nodeResourcesOf(
    rows,
    steps.map((step) => step.id),
    assigneesOf,
    slotsOf,
  );
  const scheduledIds = new Set(canonical.input.rows.map((row) => row.id));
  // What each row is **charged**, per step: a leaf's own estimate uplifted by
  // its step's allowance and rounded, a parent's the sum of its descendants'
  // charged figures. Not `totals` put through the method — see `rollUpFinals`.
  const charged = rollUpCharged(
    rows,
    stored,
    rule,
    new Map(steps.map((step) => [step.id, step.allowancePercent])),
    new Map(steps.map((step) => [step.id, step.estimateUnit])),
  );
  let optimization: PlanOptimization | undefined;
  let timing = new Map<string, Scheduled>();
  const placement = scheduling.kind === 'connected' ? scheduling.placement : scheduling;
  let scheduleError: ScheduleError;
  switch (placement.kind) {
    case 'scheduled':
      scheduleError = null;
      break;
    case 'unavailable':
      scheduleError = placement.reason;
      break;
    case 'dependency_calendar_missing':
      scheduleError = placement;
      break;
    case 'engine_unavailable':
      scheduleError =
        scheduling.kind === 'connected' && scheduling.placement.kind === 'engine_unavailable'
          ? scheduling.placement
          : null;
      break;
  }
  /**
   * How many work items are waiting for a person rather than for the plan.
   *
   * Zero when there is no schedule at all, which is honest rather than
   * convenient: a plan that could not be computed has nobody queueing in it,
   * and the banner about the cycle is what that reader needs.
   */
  let waitingForPerson = 0;
  /**
   * How many work items are waiting for a slot of their team rather than for
   * the plan. Zero with no schedule, for {@link waitingForPerson}'s reason.
   */
  let waitingForCapacity = 0;
  let waitingElsewhere: number | undefined;
  /**
   * The engine's own output, kept: a plan that could not be scheduled leaves
   * this empty and the rows keep their {@link UNSCHEDULED} spans.
   */
  let scheduledSlices: IdentifiedSlice[] = [];
  try {
    if (
      scheduling.kind !== 'unavailable' &&
      (scheduling.kind !== 'connected' || scheduling.placement.kind === 'scheduled')
    ) {
      // Proof: replacing this selection with schedule(canonical.input's local
      // arguments) made the mounted full/paged/detail test read 0→2.5 instead
      // of 1.5→4 across distinct anchors (2026-10-22).
      const scheduleRead =
        scheduling.kind === 'connected'
          ? scheduling.placement.kind === 'scheduled'
            ? {
                kind: 'scheduled' as const,
                fast: scheduling.placement.schedule,
                optimization: null,
              }
            : (() => {
                throw new Error('connected scheduled placement missing');
              })()
          : scheduling;
      // The projection **and** the slices: a row's column shows its own span,
      // and a chart draws the slices the span is a projection of.
      // The reach comes off the project being scheduled, read beside the ladder
      // and the capacity above and handed straight to the engine. It is
      // deliberately **not** a request parameter: the schedule is the server's
      // answer, and a client-supplied scheduling rule is a rule two clients can
      // disagree about while looking at the same plan.
      //
      // Read from `project`, which is this call's own row, so two projects on
      // different reaches in one process each get their own.
      //
      // Proof: `project.depReach` replaced by a module-level `let heldReach`
      // memoised on the first plan read — the read hoisted out of the run — and
      // `each project is scheduled by its own reach` failed on `Expected: 5 /
      // Received: 3` for the second project's successor; watched 2026-08-29.
      if (scheduleRead.kind === 'engine_unavailable') return scheduleRead;
      const fast = scheduleRead.fast;
      const optimizationRead = scheduleRead.optimization;
      let optimized: Schedule | null = null;
      if (
        optimizationRead !== null &&
        project.optimizationEnabled &&
        project.scheduleEngine === 'optimized' &&
        optimizationRead.variants[project.scheduleObjective].state === 'ready'
      ) {
        const selected = optimizationRead.schedules[project.scheduleObjective];
        if (selected === null) {
          throw new Error('optimized plan reader reported ready without a schedule');
        }
        optimized = selected;
      }
      const planned = optimized ?? fast;
      // `selectedSchedule` states the same rule this block applies, and is what
      // `arrangeBySchedule` asks so a press can never arrange by a schedule the
      // chart is not drawing. Kept as an assertion rather than replacing the
      // lines above: this read builds `optimized` on its way to `displayed` and
      // the optimization payload, and rewriting it to call the helper would
      // move four more decisions for no gain.
      const selected = selectedSchedule(project, fast, optimizationRead);
      if (selected.schedule !== planned) {
        throw new Error('the plan read and `selectedSchedule` disagree about the drawn schedule');
      }
      if (optimizationRead !== null) {
        const displayed = optimized === null ? 'fast' : project.scheduleObjective;
        optimization = {
          enabled: project.optimizationEnabled,
          engine: project.scheduleEngine,
          objective: project.scheduleObjective,
          inputHash: optimizationRead.inputHash,
          generation: optimizationRead.generation,
          contractVersion: optimizationRead.contractVersion,
          budgetMs: optimizationRead.budgetMs,
          displayed,
          variants: optimizationRead.variants,
          // Unconditional, and that is the change: the figures used to be
          // computed only for the variant on screen, so a project sitting on
          // Fast — the state a project spends its first solve in, and the state
          // the toggle leaves it in — had nothing to compare and the indicator
          // drew nothing at all.
          ...comparedWithFast(fast, optimizationRead),
        };
      }
      // Scheduling uses dimensionless workday offsets and may remain valid
      // beyond the finite calendar ECMAScript can represent. Name that state
      // before any row calls `datesOf`, which would otherwise surface a 500.
      // Proof: remove this preflight and the mounted controller case
      // `models a plan beyond the calendar range without partial dates` fails
      // on the unhandled invalid-Date projection.
      if (project.startDate !== null) {
        let projectFinish = 0;
        for (const placed of planned.workItems.values()) {
          if (placed.earliestFinish > projectFinish) projectFinish = placed.earliestFinish;
        }
        addWorkdays(project.startDate, lastWorkdayOf(0, projectFinish));
      }
      timing = planned.workItems;
      waitingForPerson = planned.waitingForPerson;
      waitingForCapacity = planned.waitingForCapacity;
      // Proof: omitting this projection fails mounted shared tree/export waiting count.
      waitingElsewhere = planned.waitingElsewhere;
      // Spread rather than rebuilt field by field, and never put through any
      // arithmetic: the engine's numbers are the answer, and this is the layer
      // that would otherwise quietly round them.
      //
      // Proof: `({ id, ...placed })` mapped through `Math.round` on every
      // number and `reports the engine's fractional numbers verbatim` failed —
      // a slice of 3.6666666666666665 days came back as 4, a whole day of bar
      // against the same plan's Start column; watched 2026-08-09.
      //
      // Proof: `resourcePredecessorId` left out of the entry — the spread
      // replaced by the other twelve fields written out — and `names the slice
      // the person was finishing, under the engine's own id` failed on
      // `undefined`; the hand-off a person link is drawn from would have been
      // absent from the payload with nothing to say it ever existed; watched
      // 2026-08-09.
      // Proof: dropping every displayed slice only while a direct blockage exists
      // failed the mounted Fast byte comparison in both modes; watched 2026-10-13.
      scheduledSlices = [...planned.slices].map(([id, placed]) => ({ id, ...placed }));
    }
  } catch (err) {
    // Only the modeled failure. An unqualified catch here turned every
    // exception in this block — a stack overflow on a pathological tree, a
    // future mistake in `slicesOf` — into "your dependencies run in a
    // circle", which is a lie told confidently. R5: unknown is not OK.
    if (err instanceof ScheduleCycleError) scheduleError = 'cycle';
    else if (err instanceof CalendarRangeError) scheduleError = 'calendar_range';
    else throw err;
  }
  const connectedUnavailable = scheduling.kind === 'connected' && scheduleError !== null;
  const waitingFor = new Map<string, string[]>();
  for (const found of edges) {
    waitingFor.set(found.successorId, [
      ...(waitingFor.get(found.successorId) ?? []),
      found.predecessorId,
    ]);
  }
  // The project's own ids, once. `dependsOn` below filters every row's stored
  // predecessors down to the ones on this plan, and it did that with
  // `rows.some(...)` **inside** the map over `rows` — O(rows × edges × rows),
  // on the read every write and every socket frame performs.
  const idsOnThisPlan = new Set(rows.map((row) => row.id));
  const attemptsOf = new Map<string, StoredAttempt[]>();
  for (const attempt of attempts) {
    attemptsOf.set(attempt.workItemId, [...(attemptsOf.get(attempt.workItemId) ?? []), attempt]);
  }
  const workItems = rows
    .map((row) => ({
      ...row,
      number: numbers.get(row.id) ?? '',
      estimates: Object.fromEntries(totals.get(row.id) ?? []),
      // The days recorded against this row: its own if it is a leaf, the sum
      // of its descendants' if it is not — the same fold, one table over.
      //
      // A step nobody has recorded days for is **absent from this object**,
      // and an empty object means nobody has recorded anything on this row.
      // Neither is a zero, and a face that renders a missing key as `0` is
      // saying somebody stated the work took no time. See `actual` in
      // `schema.ts`.
      actuals: Object.fromEntries(recordedTotals.get(row.id) ?? []),
      // The figures that are not days, metric first. A metric with no steps
      // under this row is **struck from the object** rather than carried as
      // `{}`, which is the same absence rule one level up: an empty object
      // would say somebody looked at that unit on this row.
      measures: Object.fromEntries(
        [...measuredTotals]
          .map(([metric, byItem]) => [metric, byItem.get(row.id) ?? new Map()] as const)
          .filter(([, byStep]) => byStep.size > 0)
          .map(([metric, byStep]) => [metric, Object.fromEntries(byStep)]),
      ),
      // Where each step's work on this row has got to: its own if it is a
      // leaf, `agree` across its descendants' if it is not.
      //
      // **A step reading `unknown` is absent from this object**, exactly
      // as an unestimated step is absent from `estimates` — the absence of a
      // statement is how "nobody has said" is spelled everywhere in this tool,
      // including on the wire. So an empty object means nobody has said
      // anything about this row, and a step that is not a key has not been
      // spoken about.
      progress: Object.fromEntries(
        [...(statedTotals.get(row.id) ?? [])].filter(
          (entry): entry is [string, StepState] => entry[1] !== UNKNOWN,
        ),
      ),
      // The row's own reading, **derived and never stored**: a leaf's from
      // its steps' progress, its hold, its readiness and its predecessors, a
      // parent's from its children — `workItemStatusesOf`.
      status: statusOfRow(itemStatuses, row.id),
      // A parent's charged days are the **sum of its descendants' rounded
      // figures**, not its rolled-up triple put through the method once. The
      // two agreed while days were fractional and part company the moment a
      // step is rounded: two children holding half a day each are charged one
      // day apiece, and a parent computed from the triples would say one day
      // for the pair. `rollUpFinals` holds that decision and its proof.
      ...finalsOf(charged.get(row.id) ?? new Map()),
      rolledUp: hasChildren.has(row.id),
      // Only predecessors that are in this project. A stored edge naming a
      // work item from elsewhere — which the schema does not prevent — would
      // otherwise be reported as a dependency on a number nobody can see.
      dependsOn: (waitingFor.get(row.id) ?? []).filter((id) => idsOnThisPlan.has(id)),
      ...assignmentFieldsOf(assigneesOf.get(row.id) ?? {}),
      ...attemptFieldsOf(attemptsOf.get(row.id) ?? [], steps),
      // A leaf's node readings by step id; a parent has no nodes and no key.
      ...readingFieldsOf(nodeProjection.readings.get(row.id)),
      // Proof: serializing {} here failed both mounted resource readings
      // (missing per-step resource); watched 2026-10-15.
      ...(resources.has(row.id) ? { nodeResources: resources.get(row.id) } : {}),
      ...(nodeProjection.readings.has(row.id)
        ? {
            blockages: Object.fromEntries(
              blockages
                .filter((fact) => fact.workItemId === row.id)
                .map((fact) => [fact.stepId, { blockedAt: fact.blockedAt }]),
            ),
            // Proof: forwarding {} failed the exact downstream root assertion
            // in the isolated mounted read; watched 2026-10-13.
            blockageCauses: nodeProjection.causes.get(row.id) ?? {},
          }
        : {}),
      // A row the hold reduction took out has no schedule and no dates: it
      // takes no part in the plan, and a placeholder span would draw it.
      // Proof: the placeholder kept here made `lets a successor start at day
      // zero…` fail on a zero-length schedule where `null` was owed; watched
      // 2026-09-29.
      // Proof: removing connectedUnavailable from this guard made both mounted
      // unavailable tree cases expose a zero-offset placeholder (2026-10-22).
      schedule:
        !connectedUnavailable && scheduledIds.has(row.id)
          ? (timing.get(row.id) ?? UNSCHEDULED)
          : null,
      dates:
        !connectedUnavailable && scheduledIds.has(row.id)
          ? datesOf(project.startDate, timing.get(row.id) ?? UNSCHEDULED, scheduleError !== null)
          : null,
    }))
    // **Tree order, not the number string** (ADR 0023). The two agreed for as
    // long as a frozen work item could not move — `deriveNumbers` built
    // labels so a byte-wise sort equalled this walk — and a frozen number is
    // a name now, so a row frozen `030` and dragged to the top is drawn at
    // the top. Sorting by the label would draw it third, where its old name
    // says it used to be.
    .sort(byTreeOrder(treeOrder(rows)));
  return {
    workItems,
    typedDependencies: authored.map(({ id, predecessor, successor, type }) => ({
      id,
      predecessor:
        predecessor.scope === 'node'
          ? { ...predecessor, stepNodeId: formatStepNodeId(predecessor) }
          : predecessor,
      successor:
        successor.scope === 'node'
          ? { ...successor, stepNodeId: formatStepNodeId(successor) }
          : successor,
      type,
    })),
    seq,
    scheduleError,
    waitingForPerson,
    waitingForCapacity,
    // Present exactly with the engine's own count, so a plan nothing outranks
    // keeps its shape.
    // Proof: the labels left out made `names whom a slice waits for in the
    // project above` (`schedule-organization.controller.db.test.ts`) find no
    // `elsewhereHolders`; watched 2026-10-11.
    ...(waitingElsewhere === undefined
      ? {}
      : { waitingElsewhere, elsewhereHolders: [...reads.elsewhereHolders] }),
    slices: scheduledSlices,
    // The very array `slicesOf` was handed the ids of, so a slice's `stepId`
    // is a step this list has and its place in the list is the order the
    // engine placed the bars in. Neither is true of a step list fetched
    // separately.
    steps,
    assignedPeople,
    // Built from `slotsOf` rather than read a second time, so the numbers a
    // client renders and the numbers these dates came out of cannot be answers
    // to two different questions. Team-id order, as `listFor` gives, so the
    // array does not reshuffle between two reads of an unchanged plan.
    teamCapacities: [...slotsOf]
      .map(([serviceTeamId, size]) => ({ serviceTeamId, size }))
      .sort((a, b) => a.serviceTeamId.localeCompare(b.serviceTeamId)),
    priorityBands,
    estimateMethod: project.estimateMethod,
    pertWeights: project.pertWeights,
    estimateRounding: project.estimateRounding,
    depReach: project.depReach,
    startDate: project.startDate,
    projectRevision: project.revision,
    ...(optimization === undefined ? {} : { optimization }),
  };
}

/** Compares whole sparse blockage sets independently of repository order. */
function matchesBlockages(
  current: readonly StoredStepBlockage[],
  expected: readonly StoredStepBlockage[],
): boolean {
  return (
    current.length === expected.length &&
    expected.every((fact) =>
      current.some(
        (held) =>
          held.workItemId === fact.workItemId &&
          held.stepId === fact.stepId &&
          held.blockedAt === fact.blockedAt,
      ),
    )
  );
}

/** Parents whose deletion snapshots require complete pre-batch progress guards. */
function deletionParentsOf(commands: readonly CompensatingCommand[]): string[] {
  return commands.flatMap((command) =>
    command.do === 'batch'
      ? deletionParentsOf(command.steps)
      : command.do === 'transition_incident_nodes'
        ? deletionParentsOf([command.structural])
        : (command.do === 'delete_subtree' || command.do === 'restore_subtree') &&
            command.deletionState?.parentId != null
          ? [command.deletionState.parentId]
          : [],
  );
}

/** Select the target's existing immutable stage rather than rebuilding from final dates. */
function captureConnectedOptimization(
  captured: Extract<LivePlanRead, { kind: 'connected' }>,
  projectId: string,
):
  | Exclude<OptimizationCapture, { readonly kind: 'scheduled' }>
  | {
      readonly kind: 'scheduled';
      readonly input: Extract<OptimizationInput, { readonly kind: 'connected' }>;
      readonly enabled: boolean;
    } {
  const member = captured.projection.capture.projects.find(
    (project) => project.projectId === projectId,
  );
  // Invariant diagnostic: live capture already checks target membership before derivation.
  if (member === undefined) throw new Error(`uncaptured optimization project ${projectId}`);
  const placement = captured.projection.placement;
  if (placement.kind === 'dependency_calendar_missing') return placement;
  if (placement.kind === 'engine_unavailable')
    return { kind: 'unavailable', reason: 'engine_unavailable' };
  if (placement.kind === 'unavailable') return placement;
  const enabled = member.reads.project.optimizationEnabled;
  if (placement.idleProjects.includes(projectId)) return { kind: 'idle', enabled };
  const selection = placement.stages.find((stage) => stage.stage.projectId === projectId);
  // Invariant diagnostic: the selector partitions captured members into stages and idle projects.
  if (selection === undefined) throw new Error(`missing optimization stage ${projectId}`);
  // Proof: final maps failed displaced live bytes; Retry expected stale-input-hash but observed not-retryable idle.
  return { kind: 'scheduled', input: { kind: 'connected', stage: selection.stage }, enabled };
}

/** Shared local inputs and enablement come from the same observation. */
function captureSharedOptimization(
  captured: Extract<LivePlanRead, { kind: 'shared' }>,
): OptimizationCapture {
  if (captured.chain.kind === 'engine_unavailable')
    return { kind: 'unavailable', reason: 'engine_unavailable' };
  if (captured.chain.kind === 'unavailable') return captured.chain;
  return {
    kind: 'scheduled',
    input: { kind: 'local', input: captured.chain.input },
    enabled: captured.project.optimizationEnabled,
  };
}
