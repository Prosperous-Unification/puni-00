import type {
  DependencyReach,
  EstimateMethod,
  EstimateRounding,
  IsoDate,
  PertWeights,
  ScheduleEngine,
  SolverObjectiveName,
} from '@wbs/domain';

export interface WorkPackage {
  id: string;
  name: string;
  /** Persisted organization-scoped address; edits preserve stable work package identity. */
  abbreviation: string;
  /** Explicit engagement parent; current ownership is resolved by the admitted writer. */
  projectId: string;
  restricted: boolean;
  /** How this work package turns its three-point estimates into one planning number. */
  estimateMethod: EstimateMethod;
  /**
   * How far into a predecessor this work package's dependencies reach — see
   * {@link DependencyReach}. Read by the scheduler and never supplied by a
   * client: the schedule is the server's answer, and a client-supplied
   * scheduling rule is one two clients can disagree about.
   */
  depReach: DependencyReach;
  /**
   * The coefficients this work package's PERT figure weighs its three points by, and
   * whose **sum** is the divisor — see {@link PertWeights}. 1/4/1 unless the
   * work package has said otherwise, which is the arithmetic every plan had before
   * the weights could be set.
   */
  pertWeights: PertWeights;
  /**
   * How one step's combined figure is charged as whole days — see
   * {@link EstimateRounding}. `ceil` unless the work package has said otherwise, and
   * applied per step before any sum is taken.
   */
  estimateRounding: EstimateRounding;
  /** The calendar day the plan begins, or null for a plan not yet on a calendar. */
  startDate: IsoDate | null;
  /** The external solution this plan implements, or null when it is standalone. */
  solutionRef: { slug: string; url: string } | null;
  /**
   * How many times this work package has been written to. Moves on its own stored
   * fields and on its steps; never on a work item beneath it, and never on
   * somebody opening it. See `schema.ts` for the rule and why it is bumped in
   * SQL rather than in this process.
   */
  revision: number;
  createdAt: number;
  /**
   * Whether this work package may spend solver time at all (tasks.md 3b.2).
   *
   * `false` for every work package that existed before the setting did, and for
   * every work package created without stating otherwise — the column default is
   * what makes that true retroactively, not a backfill.
   */
  optimizationEnabled: boolean;
  /**
   * Which engine this work package's schedule is produced by — the heuristic that
   * has always run, or the CP-SAT solver. Separate from
   * {@link WorkPackage.optimizationEnabled}: this is the engine the work package
   * wants, and a work package switched off keeps `optimized` recorded so it comes
   * back to it rather than to a default.
   */
  scheduleEngine: ScheduleEngine;
  /**
   * Which of the cached pair is the published one: priority order, or makespan.
   * The same two-member vocabulary the cache, the slot table and the queue
   * store under `objective`.
   */
  scheduleObjective: SolverObjectiveName;
  /**
   * What a derived budget multiplies the pessimistic point by
   * (`wbs-measure-budgets` design D38): 1 unless the work package has said
   * otherwise, finite, above 0 and at most {@link MOST_BUDGET_FACTOR}. Moves
   * no date.
   */
  budgetFactor: number;
}

/** The largest budget factor a work package may state: a bound, not a meaning. */
export const MOST_BUDGET_FACTOR = 1000;

/**
 * Whether `value` is a budget factor a work package may hold: finite, above 0 and
 * at most {@link MOST_BUDGET_FACTOR} (design D38).
 */
export function isBudgetFactor(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MOST_BUDGET_FACTOR;
}

/**
 * A work package as it is **written**: everything {@link WorkPackage} declares except the
 * abbreviation and three settings. The store allocates the address and fills
 * the settings from column defaults.
 *
 * The split exists because those three are read-published and default-written.
 * Requiring them on the create path would make every caller and fixture state
 * `false`/`fast`/`pri` — the same three literals, in twenty places, each of
 * which could disagree with the migration's defaults without anything noticing.
 * A caller that genuinely wants a work package created optimized states it; the rest
 * say nothing and get the OFF-by-default the migration guarantees.
 */
export type NewWorkPackage = Omit<
  WorkPackage,
  | 'abbreviation'
  | 'pertWeights'
  | 'optimizationEnabled'
  | 'scheduleEngine'
  | 'scheduleObjective'
  | 'budgetFactor'
> &
  Partial<
    Pick<
      WorkPackage,
      | 'abbreviation'
      | 'pertWeights'
      | 'optimizationEnabled'
      | 'scheduleEngine'
      | 'scheduleObjective'
    >
  >;

/**
 * A work package as one account sees it: null when that account has never opened it.
 *
 * `createdByName` is the {@link User.username} behind the persisted creation actor,
 * joined in the listing query rather than looked up per work package. It is not
 * nullable: a work package whose creation actor names no account is malformed stored data,
 * and {@link WorkPackageStore.listFor} throws rather than answering a blank creator.
 */
export interface WorkPackageWithAccess extends WorkPackage {
  lastOpenedAt: number | null;
  createdByName: string;
  /**
   * The work package's update instant, deliberately broader than its own column:
   * the newest of the work package row's `updated_at`, its work items' `updated_at`
   * and its plan events' `created_at`, so it answers "when did this plan last
   * change" (spec `list-reads`, design D3). `null` when every one of them
   * predates the audit columns. Calendar markers carry no instant and do not
   * move it.
   */
  updatedAt: number | null;
}

export interface WorkPackagePatch {
  /** Validated IANA zone written atomically with all other settings. */
  timezone?: string;
  abbreviation?: string;
  name?: string;
  restricted?: boolean;
  estimateMethod?: EstimateMethod;
  depReach?: DependencyReach;
  /** All three at once: a weight is only meaningful against the other two. */
  pertWeights?: PertWeights;
  estimateRounding?: EstimateRounding;
  /** `null` takes the plan back off the calendar. */
  startDate?: IsoDate | null;
  /** `null` detaches the plan from its external solution. */
  solutionRef?: { slug: string; url: string } | null;
  /**
   * The three work package settings (tasks.md 3b.2). Each moves on its own: a
   * work package may be switched off without forgetting which engine and objective
   * it was on, which is the whole reason they are three columns rather than
   * one nullable engine.
   */
  optimizationEnabled?: boolean;
  scheduleEngine?: ScheduleEngine;
  scheduleObjective?: SolverObjectiveName;
  /** The derived budgets' factor (design D38); checked by `isBudgetFactor`. */
  budgetFactor?: number;
}

/**
 * Every relation {@link WorkPackageStore.findCrossReferences} follows, as the
 * reconciliation names it. Closed, so a consumer that maps each kind to a
 * refusal cannot silently miss one.
 */
export const WORK_PACKAGE_CROSS_REFERENCE_KINDS = [
  'estimate_step',
  'actual_step',
  'step_progress_step',
  'step_measure_step',
  'measure_estimate_step',
  'step_node_attempt_step',
  'step_node_attempt_issued_step',
  'step_node_attempt_person',
  'assignment_step',
  'claim_step',
  'step_blockage_step',
  'step_parallel_step',
  'typed_dependency_step',
  'external_dependency_step',
  'assignment_person',
  'claim_person',
  'work_item_tag',
  'work_item_team',
  'work_item_type',
  'work_item_service_link',
  'work_item_external_ref',
  'work_item_service_team',
  'work_item_service',
  'work_item_parent',
  'dependency_endpoint',
  'work_package_team_capacity',
  'work_package_resource_capacity',
  'work_item_resource_demand',
  'claim_occupancy_resource',
  'incoming_step_row',
  'incoming_parent',
  'incoming_dependency',
] as const;

export type WorkPackageCrossReferenceKind = (typeof WORK_PACKAGE_CROSS_REFERENCE_KINDS)[number];

/**
 * What an audited recovery records about the edit: a work package PATCH's fields,
 * sorted; a command batch's command kinds, in order; a journal direction; or
 * the operation in a dependent write family, including current package step
 * values under settings authority. The detail always names one
 * successful operation on one work package.
 */
export type RecoveryAuditDetail =
  | { readonly fields: readonly string[] }
  | { readonly commands: readonly string[] }
  | { readonly journal: 'undo' | 'redo' }
  | { readonly step: 'add' | 'rename' | 'remove' | 'values' }
  | { readonly marker: 'create' | 'rename' | 'recolor' | 'remove' }
  | { readonly savedPlan: 'save' | 'rename' | 'delete' }
  | { readonly optimizer: 'retry' };

/** One reference that leaves the work package or its organization; see {@link WorkPackageStore.findCrossReferences}. */
export interface WorkPackageCrossReference {
  /** Which relation it is. */
  readonly kind: WorkPackageCrossReferenceKind;
  /** The referring row, as the reconciliation identifies it. */
  readonly id: string;
}
