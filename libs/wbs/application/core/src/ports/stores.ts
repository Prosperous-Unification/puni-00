import type { ActualStore } from './actual-store';
import type { BudgetStore } from './budget-store';
import type { CalendarMarkerStore } from './calendar-marker-store';
import type { CapacityStore } from './capacity-store';
import type { LivePlanStore } from './chain-snapshot-store';
import type { ClaimStore } from './claim-store';
import type { CommandJournalStore } from './command-journal-store';
import type { DemandStore } from './demand-store';
import type { DependencyStore } from './dependency-store';
import type { DirectoryStore } from './directory-store';
import type { EstimateStore } from './estimate-store';
import type { EventLogStore } from './event-log-store';
import type { ExternalDependencyAuthoringSource } from './external-dependency-authoring';
import type { MeasureEstimateStore } from './measure-estimate-store';
import type { MeasureStore } from './measure-store';
import type { OrganizationLimitGauge } from './organization-limits';
import type { PlanEventStore } from './plan-event-store';
import type { PriorityBandStore } from './priority-band-store';
import type { StepProgressStore } from './progress-store';
import type { ProjectRankStore, SharedPeopleStore } from './project-rank-store';
import type { ProjectStore } from './project-store';
import type { ResourceCapacityStore } from './resource-capacity-store';
import type { RuntimeCommandStore } from './runtime-command-store';
import type { SavedPlanCaptureStore } from './saved-plan-capture-store';
import type { SavedPlanStore } from './saved-plan-store';
import type { StepBlockageStore } from './step-blockage-store';
import type { StepNodeAttemptStore } from './step-node-attempt-store';
import type { StepParallelStore } from './step-parallel-store';
import type { StepStore } from './step-store';
import type { SubtreeStore } from './subtree-store';
import type { TypedDependencyStore } from './typed-dependency-store';
import type { OidcIdentityStore, UserStore } from './user-store';
import type { WorkItemStore } from './work-item-store';

/** Every store a command batch may use. Account and history stores are absent. */
export interface PlanTransactionalStores {
  /** Required authority, resolved only within the catalog owner's admitted writer lifetime. */
  readonly externalDependencyAuthoring: ExternalDependencyAuthoringSource;
  /** Optional only for legacy fixture adapters; production SQLite installs it explicitly. */
  livePlans?: LivePlanStore;
  projects: ProjectStore;
  /**
   * Borrowed SQLite rank and capacity-mode writer; legacy in-memory sources
   * need not install this capability.
   */
  projectRanks?: ProjectRankStore & SharedPeopleStore;
  directory: DirectoryStore;
  /**
   * The organization limits a write consults inside its own transaction
   * (`wbs-organization-limits`). Only the catalogs a unit of work admits
   * carry it: on SQLite when `openSqliteSource` is given the deployment
   * defaults, on memory only through `openMemorySourceFixture` given them
   * (`openMemorySource()` never carries it). Optional for the public catalogs
   * and for legacy fixture adapters; an acquisition under scoped access
   * through a graph without it throws rather than admitting uncapped.
   */
  organizationLimits?: OrganizationLimitGauge;
  capacity: CapacityStore;
  /** How many units of each resource a project's plan may use (`wbs-resources`). */
  resourceCapacity: ResourceCapacityStore;
  priorityBands: PriorityBandStore;
  calendarMarkers: CalendarMarkerStore;
  eventLog: EventLogStore;
  planEvents: PlanEventStore;
  steps: StepStore;
  workItems: WorkItemStore;
  estimates: EstimateStore;
  actuals: ActualStore;
  measures: MeasureStore;
  /** Three-point estimates in measures other than time (`wbs-measure-budgets` D3). */
  measureEstimates: MeasureEstimateStore;
  /** Stated budgets per work item and measure (`wbs-measure-budgets` D5). */
  budgets: BudgetStore;
  progress: StepProgressStore;
  /** Sparse direct blockage facts used by live node readings. */
  blockages: StepBlockageStore;
  /** Dormant sparse node parallelism facts, independent of live resource resolution. */
  stepParallels: StepParallelStore;
  /** The attempts at step nodes; moved with the other step facts at the hand-down. */
  attempts: StepNodeAttemptStore;
  /** Who occupies a step or reserves a subtree now (`wbs-team-claims`). */
  claims: ClaimStore;
  /** Permanent receiver identity, grants, exact bindings and accepted records. */
  runtimeCommands: RuntimeCommandStore;
  /** What each work item needs of each resource (`wbs-resources`). */
  demands: DemandStore;
  dependencies: DependencyStore;
  typedDependencies: TypedDependencyStore;
  subtrees: SubtreeStore;
  journal: CommandJournalStore;
}

/** Account persistence is admitted only by account-facing use cases. */
export interface AccountStores {
  users: UserStore & OidcIdentityStore;
}

/** The full transactional catalog implemented by the SQLite source. */
export interface TransactionalStores extends PlanTransactionalStores, AccountStores {}

/** Stores whose work is deliberately independent of every command batch. */
export interface HistoryStores {
  savedPlans: SavedPlanStore;
  savedPlanCapture: SavedPlanCaptureStore;
}

/** Everything a source offers. */
export type Stores = TransactionalStores & HistoryStores;

export type { MeasureMetric, PersonKind, ScheduleEngine, SolverObjectiveName } from '@wbs/domain';
