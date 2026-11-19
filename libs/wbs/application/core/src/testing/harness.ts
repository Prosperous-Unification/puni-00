import type { Source } from '../ports/source';
import type { TransactionalStores } from '../ports/stores';

import type { WorkItemServiceOptions } from '../module/work-item/work-item.resource';
import { LEGACY_EDIT_ADMISSION } from '../ports/edit-admission';
import { createLocalDependencyContext } from '../service/dependency-context';
import { AvailableWorkItemService } from './available-work-item-service';
import { type RecordingBroadcaster, recordingBroadcaster } from './broadcast-fixture';
import { testClock } from './clock-fixture';
import { fastScheduler } from './scheduler-fixture';

export interface TestServices {
  /** Actual coherent fixture graph; callers author catalogue metadata through its real ports. */
  source: Source<TransactionalStores>;
  service: AvailableWorkItemService;
  scheduler: WorkItemServiceOptions['scheduler'];
  /** The recording broadcaster, unless one was passed in. */
  broadcast: RecordingBroadcaster;
  stores: Required<
    Pick<
      WorkItemServiceOptions,
      | 'workItems'
      | 'workPackages'
      | 'estimates'
      | 'actuals'
      | 'measures'
      | 'measureEstimates'
      | 'budgets'
      | 'progress'
      | 'attempts'
      | 'blockages'
      | 'stepParallels'
      | 'dependencies'
      | 'typedDependencies'
      | 'directory'
      | 'capacity'
      | 'priorityBands'
      | 'journal'
      | 'subtrees'
      | 'demands'
      | 'resourceCapacity'
    >
  >;
}

/**
 * Test service over one required actual Source. Default writers/readers share
 * its committed or admitted graph; no Step DTO synthesizes catalogue identities.
 * Callers seed definitions/bindings/package values explicitly through that source.
 * Named overrides remain deliberate fault dependencies, not source-conformance
 * claims. Scoped authorization remains the caller's admission dependency.
 *
 * Historical harness demand-cascade/proxy proofs covered the removed independently
 * composed fixture graph. Their unchanged assertions remain required; this graph
 * delegates cascades to the actual Source owner and has not been rerun here.
 */
export function createTestServices(
  source: Source<TransactionalStores>,
  overrides: Partial<WorkItemServiceOptions> = {},
): TestServices {
  const defaults = source.stores;
  const stores = {
    workItems: overrides.workItems ?? defaults.workItems,
    workPackages: overrides.workPackages ?? defaults.workPackages,
    estimates: overrides.estimates ?? defaults.estimates,
    actuals: overrides.actuals ?? defaults.actuals,
    measures: overrides.measures ?? defaults.measures,
    measureEstimates: overrides.measureEstimates ?? defaults.measureEstimates,
    budgets: overrides.budgets ?? defaults.budgets,
    progress: overrides.progress ?? defaults.progress,
    attempts: overrides.attempts ?? defaults.attempts,
    blockages: overrides.blockages ?? defaults.blockages,
    stepParallels: overrides.stepParallels ?? defaults.stepParallels,
    dependencies: overrides.dependencies ?? defaults.dependencies,
    typedDependencies: overrides.typedDependencies ?? defaults.typedDependencies,
    directory: overrides.directory ?? defaults.directory,
    capacity: overrides.capacity ?? defaults.capacity,
    priorityBands: overrides.priorityBands ?? defaults.priorityBands,
    journal: overrides.journal ?? defaults.journal,
    subtrees: overrides.subtrees ?? defaults.subtrees,
    demands: overrides.demands ?? defaults.demands,
    resourceCapacity: overrides.resourceCapacity ?? defaults.resourceCapacity,
  };
  const broadcast = overrides.broadcast ?? recordingBroadcaster();
  const scheduler = overrides.scheduler ?? fastScheduler;
  return {
    source,
    service: new AvailableWorkItemService({
      admission: overrides.admission ?? LEGACY_EDIT_ADMISSION,
      clock: overrides.clock ?? testClock,
      ...stores,
      externalDependencyAuthoring: overrides.externalDependencyAuthoring ?? defaults.externalDependencyAuthoring,
      dependencyContext: overrides.dependencyContext ?? createLocalDependencyContext(stores),
      ...(overrides.livePlans === undefined ? {} : { livePlans: overrides.livePlans }),
      ...(overrides.claims === undefined ? {} : { claims: overrides.claims }),
      broadcast,
      scheduler,
    }),
    scheduler,
    // Existing test contract: callers asking for the recorder supply that recorder; custom broadcaster tests do not read its recordings.
    broadcast: broadcast as RecordingBroadcaster,
    stores,
  };
}
