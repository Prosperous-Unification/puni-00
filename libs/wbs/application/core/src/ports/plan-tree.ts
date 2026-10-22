// Documentation boundary: these type-only names resolve JSDoc links and emit no JavaScript.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { DEFAULT_PRIORITY_BANDS, haveSameSliceOrder, sliceKey } from '@wbs/domain';
import type {
  DependencyEndpoint,
  DependencyReach,
  EstimateMethod,
  EstimateRounding,
  IsoDate,
  PertWeights,
  PriorityBand,
  ScheduledSlice,
} from '@wbs/domain';

import type { ConnectedTreeDependency } from '../service/connected-tree';
import type { NumberedWorkItem } from '../service/numbered-work-item';
import type { TeamCapacity } from './capacity-store';
// Documentation boundary: this type-only name resolves a JSDoc member and emits no JavaScript.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { DirectoryStore } from './directory-store';
import type { Project } from './project-store';
import type { OptimizationVariantState } from './scheduler';
import type { ElsewhereHolderLabel } from './shared-people-values';
import type { Step } from './step-store';

/**
 * One placed slice as a reader sees it: the engine's own output, under the key
 * the engine holds it by.
 *
 * `id` is that key — {@link sliceKey}'s string, and opaque on both sides of the
 * wire. It is what a slice's `resourcePredecessorId` names, so the person a
 * reader draws a link from is **looked up** among these ids rather than derived
 * from a work item and a step: reconstructing the key on the client would be a
 * second implementation of {@link sliceKey}, and the two would disagree the day
 * either changes.
 *
 * Everything else is {@link ScheduledSlice} unchanged. The numbers are the
 * engine's verbatim — a slice starting at 3.6666666666666665 leaves as that, so
 * a bar drawn from it and the Start column beside it cannot say different days.
 */
export interface IdentifiedSlice extends ScheduledSlice {
  id: string;
}

/** Why a project has no dates, when it has none. `null` is the ordinary case. */
export type ScheduleError = 'calendar_range' | 'cycle' | null;

export interface PlanOptimization {
  readonly enabled: boolean;
  readonly engine: Project['scheduleEngine'];
  readonly objective: Project['scheduleObjective'];
  readonly inputHash: string;
  readonly generation: number | null;
  readonly contractVersion: string;
  readonly budgetMs: number;
  readonly displayed: 'fast' | Project['scheduleObjective'];
  readonly variants: Readonly<Record<Project['scheduleObjective'], OptimizationVariantState>>;
  /**
   * The project finish each computed schedule reaches, in workdays from day
   * zero. `fast` always — it is the schedule this read had to compute anyway —
   * and a variant's only while this read materialized it.
   *
   * Absolute figures rather than the one delta this shipped as: the cue names
   * all three schedules at once, every difference is taken against Fast, and a
   * delta is that subtraction through the shared workday drift, which the client
   * already applies to decide "same project deadline". Sending the deltas
   * instead would put the same fact on the wire twice.
   */
  readonly finishDays: { readonly fast: number } & Readonly<
    Partial<Record<Project['scheduleObjective'], number>>
  >;
  /**
   * Whether a variant places the slices it shares with Fast in the same
   * relative order — {@link haveSameSliceOrder}, per variant, present exactly
   * where {@link PlanOptimization.finishDays} carries that variant's finish.
   *
   * Server-side per tasks.md 8.7, because it is the one half of the comparison
   * a client cannot derive from the numbers on the wire, and two implementations
   * would label the same pair differently.
   */
  readonly sameOrderAsFast: Readonly<Partial<Record<Project['scheduleObjective'], boolean>>>;
}

/** A successful project-tree read, excluding absence and engine refusal. */
export interface PlanTree {
  workItems: NumberedWorkItem[];
  /** Authored incident connected links with captured endpoint navigation evidence. */
  connectedDependencies?: ConnectedTreeDependency[];
  seq: number;
  scheduleError: ScheduleError;
  /**
   * How many work items hold a slice a person is the reason for — the
   * schedule header's "N tasks wait for a person".
   *
   * A count rather than the slices themselves: what the reader is told here
   * is that people are the constraint and how much of the plan they hold up.
   * Which slice waits for whom is in {@link IdentifiedSlice.boundBy} beside
   * it, and is a Gantt bar rather than a sentence.
   */
  waitingForPerson: number;
  /**
   * How many work items hold a slice a **team's capacity** is the reason for.
   *
   * Beside `waitingForPerson` rather than folded into it: a planner reads a
   * queue and a headcount differently, and `boundBy` names exactly one of the
   * two for any slice.
   */
  waitingForCapacity: number;
  /**
   * How many work items hold a slice whose person is held by another project.
   * Present for ranked bookings (ADR 0034) or checked foreign person
   * predecessors in a connected tree, with {@link elsewhereHolders}.
   */
  waitingElsewhere?: number;
  /**
   * One label per work item in another project that a slice's
   * `elsewhereHolder` names, so a reader is told whom a bar waits for
   * without reading that project. Present exactly with `waitingElsewhere`.
   */
  elsewhereHolders?: ElsewhereHolderLabel[];
  /**
   * One label per resource a slice's `capacityResource` names (`wbs-resources`
   * R5), so a reader is told which resource a bar waited for and in what unit.
   * Present exactly when a displayed slice names one.
   */
  resourceLabels?: { id: string; name: string; unitLabel: string }[];
  /**
   * Every slice the schedule placed, in the order the engine placed them.
   *
   * The projection in each row's `schedule` is what a table column shows; this
   * is what it is a projection **of**, and it is what a chart draws — one bar
   * per entry, and the person links from `resourcePredecessorId`. Both are
   * carried because they answer different questions, and neither is derivable
   * from the other: a row's span does not say which step ran when, and a
   * slice does not know its parent's bracket.
   *
   * Empty when there is no schedule at all, exactly as the row schedules
   * degrade to unscheduled spans — a cycle leaves the rows on screen and
   * takes the dates away, and bars left over from a plan that no longer
   * computes would be the same confident lie in a different shape.
   */
  slices: IdentifiedSlice[];
  /**
   * The project's steps, in the order the engine ran the slices in.
   *
   * The same array `slicesOf` was given, carried on the read that produced
   * the slices rather than left to `/api/projects/:id` — which is a second
   * request at a second moment. A chart reads a slice's `stepId` to place its
   * bar and to name its step, and a peer removing a step between the two
   * reads left a client holding slices under a step its own step list no
   * longer had. Within one payload that skew cannot exist.
   *
   * Read **after** the rows and before the schedule, so a step added between
   * them is at worst a step nothing points at, never a slice with no step.
   */
  steps: Step[];
  /**
   * Every person an assignment on these rows names, by id and name.
   *
   * The names, not the whole directory: a chart paints a bar in its
   * assignee's colour and writes their name on it, and both are facts about
   * the slices in this very payload. `/api/people` answers a different question — who
   * could be assigned — and is still what the pickers read.
   *
   * Read together with assignments through {@link DirectoryStore.assignmentsInProject},
   * so the names and assignments share one project-scoped database statement.
   *
   * Typed as the two columns it is, not as a `Person`. The builder has always
   * mapped to `{ id, name }` — "the names, not the whole directory" above is
   * that decision — and while `Person.kind` was optional, TypeScript accepted
   * a projection where a whole person was declared. Narrowing `kind` made the
   * mismatch a compile error, which is the type telling the truth rather than
   * a new rule: a chart that wanted to paint agents differently would read
   * `kind` off `/api/people`, the payload that answers who exists.
   */
  assignedPeople: { id: string; name: string }[];
  /**
   * How many of each team this project may have at work at once, for the teams
   * it has stated a number about.
   *
   * The same map `slotsOf` was built from, carried on the read that produced
   * the slices rather than left to a route of its own — the argument
   * {@link steps} makes, and it is stronger here: the dates in this payload were
   * computed **from** these numbers, and a second request at a second moment
   * could hand a client a number that does not explain the bars beside it.
   *
   * A team the project has stated nothing about is **absent** rather than
   * present as `null`, exactly as it is absent from `slotsOf`: unstated
   * constrains nothing, and one spelling of it is the rule the column is shaped
   * by. Every team on the plan is in `/api/teams`; this says which of them this
   * plan bounds.
   */
  teamCapacities: TeamCapacity[];
  /**
   * What this project calls its priority numbers — five bands in rank order.
   *
   * Carried on the read that produced the rows rather than left to a route of
   * its own, which is the argument {@link steps} and {@link teamCapacities}
   * make. The reason is weaker here in one way and stronger in another: no date
   * in this payload was computed from the ladder, so a stale one cannot
   * contradict a bar the way a stale capacity can — but *every* face draws
   * every priority through it, so a client holding a ladder from one moment
   * over numbers from another paints the wrong label on every row of the plan
   * rather than on one.
   *
   * Never absent and never empty: a project holding no rows reads as
   * {@link DEFAULT_PRIORITY_BANDS}, so a client can resolve every priority
   * without a fallback of its own.
   * `openspec/changes/priority-bands/design.md` D2.
   */
  priorityBands: PriorityBand[];
  estimateMethod: EstimateMethod;
  /**
   * The coefficients the PERT figures above were weighed by, and the rounding
   * they were charged at.
   *
   * On the wire for {@link depReach}'s reason: a client that guessed would
   * describe the numbers in front of it with an arithmetic they did not come
   * from. Both are reported and set through the project patch, never sent per
   * read.
   */
  pertWeights: PertWeights;
  estimateRounding: EstimateRounding;
  /**
   * How far into a predecessor this project's dependencies reach.
   *
   * On the wire so that the **drawing** and the schedule cannot disagree: the
   * chart routes a dependency arrow out of the slice the reach names, and a
   * client that guessed would draw an arrow leaving a slice the engine never
   * joined the edge to. It is reported, never accepted — see
   * `docs/adr/0010-a-dependencys-reach-is-a-projects-choice.md`.
   */
  depReach: DependencyReach;
  startDate: IsoDate | null;
  /**
   * The project row's own revision, which moves on its name, restriction,
   * estimate method, start date and steps — and on none of the work items
   * below it, each of which carries its own.
   */
  projectRevision: number;
  /** Authored relationships, with stable node addresses for readers. */
  typedDependencies: {
    id: string;
    predecessor: DependencyEndpoint & { stepNodeId?: string };
    successor: DependencyEndpoint & { stepNodeId?: string };
    type: string;
  }[];
  /** Present when this process has the optimizer runtime wired. */
  optimization?: PlanOptimization;
}
