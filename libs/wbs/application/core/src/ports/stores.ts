import type { ActualStore } from './actual-store';
import type { CalendarMarkerStore } from './calendar-marker-store';
import type { CapacityStore } from './capacity-store';
import type { LivePlanStore } from './chain-snapshot-store';
import type { CommandJournalStore } from './command-journal-store';
import type { DependencyStore } from './dependency-store';
import type { DirectoryStore } from './directory-store';
import type { EstimateStore } from './estimate-store';
import type { EventLogStore } from './event-log-store';
import type { MeasureStore } from './measure-store';
import type { PlanEventStore } from './plan-event-store';
import type { PriorityBandStore } from './priority-band-store';
import type { StepProgressStore } from './progress-store';
import type { ProjectRankStore } from './project-rank-store';
import type { ProjectStore } from './project-store';
import type { SavedPlanCaptureStore } from './saved-plan-capture-store';
import type { SavedPlanStore } from './saved-plan-store';
import type { StepStore } from './step-store';
import type { SubtreeStore } from './subtree-store';
import type { TypedDependencyStore } from './typed-dependency-store';
import type { OidcIdentityStore, UserStore } from './user-store';
import type { WorkItemStore } from './work-item-store';

/** Every store a command batch may use. Account and history stores are absent. */
export interface PlanTransactionalStores {
  /** Optional only for legacy fixture adapters; production SQLite installs it explicitly. */
  livePlans?: LivePlanStore;
  projects: ProjectStore;
  /** Borrowed SQLite rank writer; legacy in-memory sources need not install this capability. */
  projectRanks?: ProjectRankStore;
  directory: DirectoryStore;
  capacity: CapacityStore;
  priorityBands: PriorityBandStore;
  calendarMarkers: CalendarMarkerStore;
  eventLog: EventLogStore;
  planEvents: PlanEventStore;
  steps: StepStore;
  workItems: WorkItemStore;
  estimates: EstimateStore;
  actuals: ActualStore;
  measures: MeasureStore;
  progress: StepProgressStore;
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
