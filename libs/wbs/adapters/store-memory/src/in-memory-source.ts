import { claimIdentityOf, type TransactionalStores } from '@wbs/core';

import { inMemoryActuals } from './actual-fixture';
import { inMemoryAttempts } from './attempt-fixture';
import { inMemoryUsers } from './auth-fixture';
import { inMemoryCalendarMarkers } from './calendar-marker-fixture';
import { inMemoryCapacity } from './capacity-fixture';
import { inMemoryClaims, memoryClaimTable } from './claim-fixture';
import { inMemoryCommandJournal } from './command-journal-fixture';
import { inMemoryDependencies } from './dependency-fixture';
import { inMemoryDirectory, memoryDirectoryTables } from './directory-fixture';
import { inMemoryEstimates, memoryEstimateTable } from './estimate-fixture';
import { inMemoryPlanEvents } from './history-fixture';
import { inMemoryMeasures } from './measure-fixture';
import { inMemoryWorkItems } from './memory-work-item-fixture';
import { inMemoryPriorityBands } from './priority-band-fixture';
import { inMemoryProgress, memoryProgressTable } from './progress-fixture';
import { inMemoryProjects } from './project-fixture';
import { inMemoryEventLog } from './replay-fixture';
import { inMemoryDemands, inMemoryResourceCapacity } from './resource-fixture';
import { inMemoryStepBlockages } from './step-blockage-fixture';
import { inMemorySteps } from './step-fixture';
import { inMemoryStepParallels, memoryStepParallelTable } from './step-parallel-fixture';
import { inMemorySubtrees } from './subtree-fixture';
import { inMemoryTypedDependencies } from './typed-dependency-fixture';

/**
 * The in-memory source's transactional stores, wired as
 * {@link inMemoryServices} wires the ones a work-item service needs and
 * completed with the rest.
 *
 * One function rather than seventeen constructions per suite: what the source
 * is* has to be one thing, or a kit run against it is a kit run against
 * whatever that suite happened to assemble.
 */
export function inMemoryStores(): TransactionalStores {
  const users = inMemoryUsers();
  const directoryTables = memoryDirectoryTables();
  const directory = inMemoryDirectory(
    (projectId): Promise<readonly { id: string }[]> => workItems.listByProject(projectId),
    directoryTables,
  );
  const workItems = inMemoryWorkItems(directory);
  const estimateTable = memoryEstimateTable();
  const parallelTable = memoryStepParallelTable();
  // Proof: a separate parallel table let legacy fixture removal erase the step; both cascade tests failed, 2026-10-17.
  const steps = inMemorySteps([], undefined, estimateTable, { table: parallelTable, workItems });
  const estimates = inMemoryEstimates(workItems, estimateTable, steps);
  const actuals = inMemoryActuals(workItems, undefined, steps);
  const measures = inMemoryMeasures(workItems, undefined, steps);
  const progressTable = memoryProgressTable();
  const progress = inMemoryProgress(workItems, progressTable, steps);
  const attempts = inMemoryAttempts(workItems, undefined, steps, progress);
  const projects = inMemoryProjects(users);
  const dependencies = inMemoryDependencies([], undefined, workItems);
  return {
    users,
    projects,
    directory,
    workItems,
    estimates,
    actuals,
    measures,
    progress,
    attempts,
    stepParallels: inMemoryStepParallels(workItems, steps, parallelTable),
    claims: inMemoryClaims(
      workItems,
      progressTable,
      memoryClaimTable(),
      claimIdentityOf(directory),
    ),
    blockages: inMemoryStepBlockages(workItems, {
      async findById(stepId) {
        const step = await steps.findById(stepId);
        if (step !== null) return step;
        for (const project of await projects.list()) {
          const seeded = (await projects.stepsOf(project.id)).find(
            (candidate) => candidate.id === stepId,
          );
          if (seeded !== undefined) return seeded;
        }
        return null;
      },
    }),
    dependencies,
    typedDependencies: inMemoryTypedDependencies(),
    capacity: inMemoryCapacity(),
    resourceCapacity: inMemoryResourceCapacity(
      directoryTables.resources,
      async (projectId) => (await projects.findById(projectId)) !== null,
    ),
    demands: inMemoryDemands(directoryTables.resources, workItems),
    priorityBands: inMemoryPriorityBands(),
    calendarMarkers: inMemoryCalendarMarkers(),
    steps,
    planEvents: inMemoryPlanEvents(),
    journal: inMemoryCommandJournal(),
    eventLog: inMemoryEventLog(),
    subtrees: inMemorySubtrees({
      workItems,
      estimates,
      actuals,
      measures,
      progress,
      dependencies,
      directory,
    }),
  };
}
