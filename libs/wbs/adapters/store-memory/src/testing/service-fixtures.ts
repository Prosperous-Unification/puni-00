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
  ProjectStore,
  ResourceCapacityStore,
  StepStore,
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
  ProjectService,
  ReplayBuffer,
  ReplayOrchestrator,
  StepService,
} from '@wbs/core';
import { CREATOR_ADMISSION } from '@wbs/core';
import { DependencyGraphGuard } from '@wbs/core/service/dependency-graph';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { testClock } from '@wbs/core/testing/clock-fixture';
import { inMemoryServices } from '@wbs/core/testing/harness';

import { inMemoryCalendarMarkers } from '../calendar-marker-fixture';
import { inMemoryCapacity } from '../capacity-fixture';
import { inMemoryDirectory } from '../directory-fixture';
import { inMemoryPlanEvents } from '../history-fixture';
import { inMemoryStores } from '../in-memory-source';
import { inMemoryPriorityBands } from '../priority-band-fixture';
import { inMemoryProjects } from '../project-fixture';
import { inMemoryEventLog } from '../replay-fixture';
import {
  inMemoryDemands,
  inMemoryResourceCapacity,
  memoryResourceTables,
} from '../resource-fixture';
import { inMemorySteps } from '../step-fixture';

export function testProjectService(projects: ProjectStore = inMemoryProjects()): ProjectService {
  const stores = { ...inMemoryStores(), projects };
  return new ProjectService({
    clock: testClock,
    projects,
    broadcast: recordingBroadcaster(),
    dependencyGraph: new DependencyGraphGuard(stores),
  });
}

export function testStepService(
  projects: ProjectStore = inMemoryProjects(),
  steps: StepStore = inMemorySteps(),
): StepService {
  const stores = { ...inMemoryStores(), projects, steps };
  return new StepService({
    clock: testClock,
    projects,
    steps,
    broadcast: recordingBroadcaster(),
    dependencyGraph: new DependencyGraphGuard(stores),
  });
}

export function testDirectoryService(
  directory: DirectoryStore = inMemoryDirectory(),
  broadcast: Broadcaster = recordingBroadcaster(),
): DirectoryService {
  return new DirectoryService({ clock: testClock, directory, broadcast });
}

export function testCapacityService(
  projects: ProjectStore = inMemoryProjects(),
  capacity: CapacityStore = inMemoryCapacity(),
  broadcast: Broadcaster = recordingBroadcaster(),
  resourceCapacity: ResourceCapacityStore = inMemoryResourceCapacity(
    memoryResourceTables(),
    async (projectId) => (await projects.findById(projectId)) !== null,
  ),
): CapacityService {
  return new CapacityService({
    admission: CREATOR_ADMISSION,
    clock: testClock,
    projects,
    capacity,
    resourceCapacity,
    broadcast,
  });
}

export function testPriorityBandService(
  projects: ProjectStore = inMemoryProjects(),
  bands: PriorityBandStore = inMemoryPriorityBands(),
  broadcast: Broadcaster = recordingBroadcaster(),
): PriorityBandService {
  return new PriorityBandService({
    admission: CREATOR_ADMISSION,
    clock: testClock,
    projects,
    bands,
    broadcast,
  });
}

export function testCalendarMarkerService(
  projects: ProjectStore = inMemoryProjects(),
  markers: CalendarMarkerStore = inMemoryCalendarMarkers(),
  clock: Clock = testClock,
  broadcast?: Broadcaster,
): CalendarMarkerService {
  return new CalendarMarkerService({ projects, markers, clock, broadcast });
}

export function testHistoryService(
  projects: ProjectStore = inMemoryProjects(),
  events: PlanEventStore = inMemoryPlanEvents(),
): HistoryService {
  return new HistoryService({
    projects: testProjectService(projects),
    events: new PlanEventService(events),
  });
}

export function testWorkItemService(): WorkItemService {
  return inMemoryServices().service;
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
 * resources (`wbs-resources` R5) but whose cases state none. Every project is
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
