import {
  testCalendarMarkerService,
  testCapacityService,
  testDirectoryService,
  testPriorityBandService,
  testStepService,
  testWorkPackageService,
} from '@wbs/store-memory/testing/service-fixtures';
import { inMemoryTypedDependencies } from '@wbs/store-memory/typed-dependency-fixture';

import type { CalendarMarkerService } from '../module/calendar-marker/calendar-marker.resource';
import type { PlanCommandServices } from '../module/plan-commands/plan-commands.feature';
import type { ImportService } from '../module/plan-import/plan-import.feature';
import type { StepService } from '../module/step/step.resource';
import type { WorkPackageService } from '../module/work-package/work-package.resource';
import type { CommandAccess } from '../ports/command-access';
import type { TransactionalStores } from '../ports/stores';
import type { Scope, UnitOfWork } from '../ports/unit-of-work';
import type { Broadcaster } from '../ports/work-package-event';
import type { WorkPackageStore } from '../ports/work-package-store';
import type { CommittedFanoutDelivery } from '../service/committed-fanout';
import type { TestServices } from './harness';
import { localCommandAccess } from './organization-access-fixture';

export interface WritingServices extends PlanCommandServices {
  workPackages: WorkPackageService;
  steps: StepService;
  calendarMarkers: CalendarMarkerService;
}

/**
 * A {@link UnitOfWork} for tests whose stores are the in-memory fixtures.
 *
 * There is no connection to hold a transaction on, so it runs the act and
 * **counts**: `begin`, then `commit` or `rollback`. Atomicity itself is proven
 * on real SQLite by `sqlite-unit-of-work.db.test.ts`; what a test on the
 * fixtures can still assert is that the route opened one unit of work and which
 * way it settled.
 *
 * Its scope carries the typed-dependency incident capability required when a
 * command graph opens, plus the explicit participating work-package store when
 * an OPEN caller supplies it. Reaching for any omitted store throws by name rather than
 * answering an empty double. A batch that writes through `scope.stores` — which
 * is where D24's per-batch graph is going — must not silently write into a
 * store nothing in the test reads; on this fixture it should say so.
 */
export function countingUnitOfWork(
  workPackages?: Omit<WorkPackageStore, 'setStepUnit'>,
): UnitOfWork & {
  readonly calls: ('begin' | 'commit' | 'rollback')[];
} {
  const calls: ('begin' | 'commit' | 'rollback')[] = [];
  const typedDependencies = inMemoryTypedDependencies();
  // The proxy supplies typed dependencies and throws on every omitted catalog member.
  const stores = new Proxy(
    { typedDependencies },
    {
      get(_target, port: string | symbol) {
        if (port === 'typedDependencies') return typedDependencies;
        if (port === 'workPackages' && workPackages !== undefined) return workPackages;
        // Proof: replacing this throw with undefined failed the unexpected-store rollback test (2026-10-23).
        throw new Error(
          `the counting unit of work has no stores; something asked it for ${String(port)}`,
        );
      },
    },
  ) as unknown as TransactionalStores;
  return {
    calls,
    async run(act) {
      calls.push('begin');
      let decision;
      try {
        decision = await act({ stores });
      } catch (cause) {
        calls.push('rollback');
        throw cause;
      }
      calls.push(decision.commit ? 'commit' : 'rollback');
      if (!decision.commit && decision.afterRollback !== undefined) {
        await decision.afterRollback({ stores });
      }
      return decision.value;
    },
  };
}

/**
 * What `buildApp` needs to run command batches, for a test on the fixtures.
 *
 * `batch` is the service graph the runner writes through. A real source builds
 * it from each admitted scope (D20); these connectionless doubles have no store
 * graph or turn, so they deliberately ignore the scope while retaining the
 * production factory shape.
 */
export function testWrites(
  broadcast: Broadcaster = silentBroadcaster(),
  /**
   * The required work-item service is the actual caller-owned service; other omitted ports are the in-memory
   * doubles. A harness whose routes use a real service for one of these must
   * pass that same service here: a work package reach change and a step removal run
   * through this graph (`admitted-write.ts`), and a double beside a real route
   * service answers for a work package it has never seen.
   */
  given: Pick<WritingServices, 'workItems'> & Partial<WritingServices>,
  workPackages?: Omit<WorkPackageStore, 'setStepUnit'>,
): {
  commandAccess: CommandAccess;
  imports: Pick<ImportService, 'import'>;
  uow: ReturnType<typeof countingUnitOfWork>;
  batch: (scope: Scope, broadcast: Broadcaster) => WritingServices;
  announcements: Broadcaster;
  committedFanout: CommittedFanoutDelivery;
} {
  const services: WritingServices = {
    workItems: given.workItems,
    directory: given.directory ?? testDirectoryService(),
    capacity: given.capacity ?? testCapacityService(),
    priorityBands: given.priorityBands ?? testPriorityBandService(),
    workPackages: given.workPackages ?? testWorkPackageService(),
    steps: given.steps ?? testStepService(),
    calendarMarkers: given.calendarMarkers ?? testCalendarMarkerService(),
  };
  return {
    commandAccess: localCommandAccess,
    imports: {
      import: () =>
        Promise.resolve({
          ok: true,
          workPackageId: 'imported-work-package',
          rows: 0,
          created: {
            teams: [],
            people: [],
            tags: [],
            services: [],
            types: [],
            externalSystems: [],
          },
          solutionRef: 'none',
        }),
    },
    uow: countingUnitOfWork(workPackages),
    // The **same** services whatever collector is handed in, because these
    // doubles were built before the runner existed and there is no store under
    // them to rebuild. What a test on the fixtures can still see is which
    // events the runner drained and when; where they were collected is
    // `announcement-ownership.db.test.ts`'s, on real services.
    batch: () => services,
    announcements: broadcast,
    committedFanout: { now: () => 0, deliverCommitted: () => Promise.resolve() },
  };
}

/** A broadcaster for a test that does not read what was published. */
function silentBroadcaster(): Broadcaster {
  return {
    publish: () => Promise.resolve(),
    latestSeq: () => Promise.resolve(-1),
  };
}

/**
 * The batch's services over an {@link createTestServices} plan — the doubles a
 * runner test needs and nothing else.
 *
 * The directory is the plan's own store rather than a second double: a
 * `createPerson` command and the assignment that names them are one batch, and
 * two directories would make the person invisible to the assignment.
 */
export function batchServices(plan: TestServices): WritingServices {
  return {
    workItems: plan.service,
    directory: testDirectoryService(plan.stores.directory),
    capacity: testCapacityService(),
    priorityBands: testPriorityBandService(),
    workPackages: testWorkPackageService(),
    steps: testStepService(),
    calendarMarkers: testCalendarMarkerService(),
  };
}
