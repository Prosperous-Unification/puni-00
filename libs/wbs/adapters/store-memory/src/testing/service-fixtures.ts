import type {
  Broadcaster,
  CalendarMarkerStore,
  CapacityStore,
  Clock,
  DemandStore,
  DirectoryStore,
  Person,
  PersonAdded,
  PlanEventStore,
  PriorityBandStore,
  ResourceCapacityStore,
  StepStore,
  Source,
  TransactionalStores,
  WorkItemService,
  WorkItemStore,
} from '@wbs/core';
import {
  CalendarMarkerService,
  CapacityService,
  DirectoryService,
  EventLogService,
  HistoryService,
  PlanEventService,
  PriorityBandService,
  ReplayBuffer,
  ReplayOrchestrator,
  StepService,
  WorkPackageService,
} from '@wbs/core';
import { LEGACY_EDIT_ADMISSION } from '@wbs/core';
import { createLocalDependencyContext } from '@wbs/core/service/dependency-context';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { createTestServices } from '@wbs/core/testing/harness';

import { inMemoryCalendarMarkers } from '../calendar-marker-fixture';
import { inMemoryCapacity } from '../capacity-fixture';
import { inMemoryDirectory } from '../directory-fixture';
import { inMemoryPlanEvents } from '../history-fixture';
import { inMemoryStores } from '../in-memory-source';
import { inMemoryPriorityBands } from '../priority-band-fixture';
import { inMemoryEventLog } from '../replay-fixture';
import {
  inMemoryDemands,
  inMemoryResourceCapacity,
  memoryResourceTables,
} from '../resource-fixture';
import { inMemorySteps } from '../step-fixture';
import { inMemoryWorkPackages } from '../work-package-fixture';

export function testWorkPackageService(
  workPackages: ConstructorParameters<typeof WorkPackageService>[0]['workPackages'] = inMemoryWorkPackages(),
): WorkPackageService {
  const stores = { ...inMemoryStores(), workPackages };
  return new WorkPackageService({
    clock: testClock,
    workPackages,
    broadcast: recordingBroadcaster(),
    dependencyContext: createLocalDependencyContext(stores),
  });
}

/** Supplied current package values retain their actual writer; the default is an explicit legacy unit model over the same real StepStore. */
export function testStepService(
  workPackages: ConstructorParameters<typeof StepService>[0]['workPackages'] | undefined = undefined,
  steps: StepStore = inMemorySteps(),
): StepService {
  const packageValues = workPackages ?? {
    ...inMemoryWorkPackages(),
    setStepUnit: (...args: Parameters<StepStore['patchUnit']>) => steps.patchUnit(...args),
  };
  const stores = { ...inMemoryStores(), workPackages: packageValues, steps };
  return new StepService({
    clock: testClock,
    workPackages: packageValues,
    steps,
    broadcast: recordingBroadcaster(),
    dependencyContext: createLocalDependencyContext(stores),
  });
}

export function testDirectoryService(
  directory: DirectoryStore = inMemoryDirectory(),
  broadcast: Broadcaster = recordingBroadcaster(),
): DirectoryService {
  return new DirectoryService({ clock: testClock, directory, broadcast });
}

export function testCapacityService(
  workPackages: ConstructorParameters<typeof CapacityService>[0]['workPackages'] = inMemoryWorkPackages(),
  capacity: CapacityStore = inMemoryCapacity(),
  broadcast: Broadcaster = recordingBroadcaster(),
  resourceCapacity: ResourceCapacityStore = inMemoryResourceCapacity(
    memoryResourceTables(),
    async (workPackageId) => (await workPackages.findById(workPackageId)) !== null,
  ),
): CapacityService {
  return new CapacityService({
    admission: LEGACY_EDIT_ADMISSION,
    clock: testClock,
    workPackages,
    capacity,
    resourceCapacity,
    broadcast,
  });
}

export function testPriorityBandService(
  workPackages: ConstructorParameters<typeof PriorityBandService>[0]['workPackages'] = inMemoryWorkPackages(),
  bands: PriorityBandStore = inMemoryPriorityBands(),
  broadcast: Broadcaster = recordingBroadcaster(),
): PriorityBandService {
  return new PriorityBandService({
    admission: LEGACY_EDIT_ADMISSION,
    clock: testClock,
    workPackages,
    bands,
    broadcast,
  });
}

export function testCalendarMarkerService(
  workPackages: ConstructorParameters<typeof CalendarMarkerService>[0]['workPackages'] = inMemoryWorkPackages(),
  markers: CalendarMarkerStore = inMemoryCalendarMarkers(),
  clock: Clock = testClock,
  broadcast?: Broadcaster,
): CalendarMarkerService {
  return new CalendarMarkerService({ workPackages, markers, clock, broadcast });
}

export function testHistoryService(
  workPackages: ConstructorParameters<typeof WorkPackageService>[0]['workPackages'] = inMemoryWorkPackages(),
  events: PlanEventStore = inMemoryPlanEvents(),
): HistoryService {
  return new HistoryService({
    workPackages: testWorkPackageService(workPackages),
    events: new PlanEventService(events),
  });
}

export function testWorkItemService(source:Source<TransactionalStores>): WorkItemService {
  return createTestServices(source).service;
}

export function testReplay(maxEvents?: number) {
  const log = inMemoryEventLog();
  const buffer = new ReplayBuffer({
    maxPerSubscription: 100,
    maxAgeMs: 5 * 60_000,
    now: () => 1_000,
  });
  return {
    log,
    buffer,
    replay: new ReplayOrchestrator({ log: new EventLogService(log), buffer, maxEvents }),
  };
}

export async function personAdded(added: Promise<PersonAdded>): Promise<Person> {
  const written = await added;
  if (!written.ok) throw new Error(`the fixture person was refused: ${written.reason}`);
  return written.person;
}

export { labelledRow, workItemRow } from '@wbs/core/testing/work-item-fixture';

/** An explicit empty memory sparse store for compositions that author no overrides. */
export function testStepParallels() {
  return inMemoryStores().stepParallels;
}

/**
 * A demand store and a resource capacity store over one fresh table set that
 * states nothing, for a work-item service fixture whose plan reads must level
 * resources (`wbs-resources` R5) but whose cases state none. Every work package is
 * taken to exist, because these fixtures never write a capacity.
 */
export function testResourceStores(workItems: WorkItemStore): {
  demands: DemandStore;
  resourceCapacity: ResourceCapacityStore;
} {
  const tables = memoryResourceTables();
  return {
    demands: inMemoryDemands(tables, workItems),
    resourceCapacity: inMemoryResourceCapacity(tables, () => Promise.resolve(true)),
  };
}
