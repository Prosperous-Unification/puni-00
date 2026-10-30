import type { LivePlanStore } from '@wbs/core/ports/chain-snapshot-store';

import { ActualRepository } from './actual';
import { CalendarMarkerRepository } from './calendar-marker';
import { CapacityRepository } from './capacity';
import { ClaimRepository } from './claim';
import { CommandJournalRepository } from './command-journal';
import type { Connection, Drizzle } from './db';
import { DependencyRepository } from './dependency';
import { DirectoryRepository } from './directory';
import { EstimateRepository } from './estimate';
import { DrizzleEventLogStore } from './event-log';
import type { Gate } from './gate';
import { inertSqliteLateWriteSeam, type SqliteLateWriteSeam } from './late-write-seam';
import { MeasureEstimateRepository } from './measure-estimate';
import { PlanEventRepository } from './plan-event';
import { PriorityBandRepository } from './priority-band';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import { DemandRepository, ResourceCapacityRepository } from './resource';
import { RuntimeCommandRepository } from './runtime-command';
import { StepRepository } from './step';
import { StepBlockageRepository } from './step-blockage';
import { StepMeasureRepository } from './step-measure';
import { StepNodeAttemptRepository } from './step-node-attempt';
import { StepParallelRepository } from './step-parallel';
import { StepProgressRepository } from './step-progress';
import { TypedDependencyRepository } from './typed-dependency';
import { UserRepository } from './user';
import { SubtreeRepository, WorkItemRepository } from './work-item';
import { WorkItemBudgetRepository } from './work-item-budget';

/** Builds the complete transactional SQLite catalog over one write gate. */
export function buildStores(
  db: Drizzle,
  gate: Gate,
  lateWrite: SqliteLateWriteSeam = inertSqliteLateWriteSeam,
  livePlans?: LivePlanStore,
  /**
   * The connection the claims read observes committed state through; absent
   * for a batch's own catalog, whose reads must see its uncommitted writes.
   */
  claimObservation?: { readonly openConnection: () => Connection },
) {
  return {
    ...(livePlans === undefined ? {} : { livePlans }),
    // Proof: returning inactive admitted the public-catalog negative in writer-authority-binding.db.test.ts.
    externalDependencyAuthoring: () => {
      throw new Error('external dependency authority requires an admitted writer');
    },
    projects: new ProjectRepository(db, gate),
    projectRanks: new ProjectRankRepository(db, gate),
    users: new UserRepository(db, gate),
    directory: new DirectoryRepository(db, gate),
    capacity: new CapacityRepository(db, gate),
    resourceCapacity: new ResourceCapacityRepository(db, gate),
    priorityBands: new PriorityBandRepository(db, gate),
    calendarMarkers: new CalendarMarkerRepository(db, gate),
    eventLog: new DrizzleEventLogStore(db, gate),
    planEvents: new PlanEventRepository(db, gate),
    steps: new StepRepository(db, gate),
    workItems: new WorkItemRepository(db, gate),
    estimates: new EstimateRepository(db, gate),
    actuals: new ActualRepository(db, gate),
    measures: new StepMeasureRepository(db, gate),
    measureEstimates: new MeasureEstimateRepository(db, gate),
    budgets: new WorkItemBudgetRepository(db, gate),
    progress: new StepProgressRepository(db, gate),
    blockages: new StepBlockageRepository(db, gate),
    stepParallels: new StepParallelRepository(db, gate),
    claims: new ClaimRepository(db, gate, claimObservation),
    // Proof: P26 committed instead of rolling back the borrowed UoW; late duplicate receipt retained prior runtime writes.
    runtimeCommands: new RuntimeCommandRepository(db, gate),
    demands: new DemandRepository(db, gate),
    attempts: new StepNodeAttemptRepository(db, gate),
    dependencies: new DependencyRepository(db, gate),
    typedDependencies: new TypedDependencyRepository(db, gate),
    subtrees: new SubtreeRepository(db, gate, lateWrite),
    journal: new CommandJournalRepository(db, gate, lateWrite),
  };
}
