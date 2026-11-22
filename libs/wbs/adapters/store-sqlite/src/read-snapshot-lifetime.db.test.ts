import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  AccessTarget,
  ChainSnapshot,
  DirectoryCatalog,
  DirectoryCatalogRows,
  LivePlanStore,
  OptimizedScheduleAdapter,
  Scope,
  TransactionalStores,
} from '@wbs/core';
import { scheduleInputOfCaptured } from '@wbs/core';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { buildStores } from './build-stores';
import { readChainSnapshotIn } from './chain-snapshot';
import { ClaimRepository } from './claim';
import { openConnection, openDatabase } from './db';
import { DirectoryRepository } from './directory';
import { OPEN, WriteCoordinator } from './gate';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import * as settings from './settings';
import { openSqliteSource, openSqliteSourceWithCaptureReadSeam } from './source';
import { sqliteUnitOfWork } from './sqlite-unit-of-work';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { openSpaceDatabase } from './testing/space-database';
import { WorkItemRepository } from './work-item';
import { WorkPackageRepository } from './work-package';

let folder: string;
let path: string;
const access = {
  principal: { id: 'ada' },
  kind: 'scoped',
  scope: { cap: null, organizationId: 'org-a', userId: 'ada' },
} as const;
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'capture-lifetime-'));
  path = await openSpaceDatabase(folder);
  const client = openDatabase(path);
  try {
    client.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
    client.run(
      "INSERT INTO access_grant(id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at) VALUES('snapshot-ada','org-a','organization','org-a','user','ada','project-contributor','route',1)",
    );
  } finally {
    client.close();
  }
});
afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});
async function failureOf(reading: Promise<unknown>): Promise<Error> {
  try {
    await reading;
  } catch (failure) {
    if (failure instanceof Error) return failure;
    throw failure;
  }
  throw new Error('expected lifetime refusal');
}
function plansOf(scope: Scope<TransactionalStores>): LivePlanStore {
  const plans = scope.stores.livePlans;
  if (plans === undefined) throw new Error('missing borrowed plans');
  return plans;
}
function hold() {
  let release: () => void = () => {
    throw new Error('hold not initialized');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    release: () => {
      release();
    },
  };
}

test.each(['success', 'refusal', 'throw'] as const)(
  'source borrowed readers expire after %s and never revive in the next run',
  async (outcome) => {
    const queries: string[] = [];
    const sqlite = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
      logger: {
        logQuery: (query) => {
          queries.push(query);
        },
      },
    });
    const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
    let retained: LivePlanStore | undefined;
    let oldScope: Scope<TransactionalStores> | undefined;
    try {
      const first = source.uow.run(async (scope) => {
        oldScope = scope;
        retained = plansOf(scope);
        expect(await retained.readWorkPackage('a1')).toEqual({ kind: 'isolated' });
        if (outcome === 'throw') throw new Error('injected act failure');
        return { commit: outcome === 'success', value: undefined };
      });
      if (outcome === 'throw')
        expect((await failureOf(first)).message).toContain('injected act failure');
      else await first;
      if (retained === undefined) throw new Error('missing retained reader');
      const old = retained;
      async function refuses() {
        const before = queries.length;
        for (const reading of [
          old.read('a1', access),
          old.readWorkPackage('a1'),
          old.readAggregate('ada', access),
          old.readExport('a1', access),
          old.readExecution('a1', access, null),
        ])
          expect((await failureOf(reading)).message).toContain('closed');
        expect(queries.length).toBe(before);
      }
      await refuses();
      await source.uow.run(async (scope) => {
        expect(scope).not.toBe(oldScope);
        expect(plansOf(scope)).not.toBe(old);
        expect(await plansOf(scope).readWorkPackage('a1')).toEqual({ kind: 'isolated' });
        await refuses();
        sqlite.db.run(sql`UPDATE work_package SET name = 'still open' WHERE id = 'a1'`);
        return { commit: true, value: undefined };
      });
      expect(
        sqlite.db.get<{ name: string }>(sql`SELECT name FROM work_package WHERE id = 'a1'`).name,
      ).toBe('still open');
    } finally {
      await source.close();
    }
  },
);

test('source borrowed shared reads include staged edits without closing their owner', async () => {
  const sqlite = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
  });
  sqlite.db.run(sql`UPDATE organization SET shared_people = 1 WHERE id = 'org-a'`);
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  try {
    await source.uow.run(async (scope) => {
      sqlite.db.run(sql`UPDATE work_package SET name = 'staged' WHERE id = 'a1'`);
      const observed = await plansOf(scope).readWorkPackage('a1');
      if (observed.kind !== 'shared') throw new Error('missing shared observation');
      expect(observed.workPackage.name).toBe('staged');
      return { commit: false, value: undefined };
    });
    expect(
      sqlite.db.get<{ name: string }>(sql`SELECT name FROM work_package WHERE id = 'a1'`).name,
    ).toBe('a1');
  } finally {
    await source.close();
  }
});

test('suspended first-plan-read refuses before further reads during a later transaction', async () => {
  const reached = hold();
  const released = hold();
  let pause = true;
  const sqlite = openSqliteSourceWithCaptureReadSeam(
    { dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY, dbPath: path },
    {
      afterFirstRead: async () => {
        if (!pause) return;
        pause = false;
        reached.release();
        await released.promise;
      },
    },
  );
  sqlite.db.run(sql`UPDATE organization SET shared_people = 1 WHERE id = 'org-a'`);
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  let pending: Promise<Error> | undefined;
  const reads = spyOn(WorkItemRepository.prototype, 'listByWorkPackage');
  try {
    await source.uow.run(async (scope) => {
      pending = failureOf(plansOf(scope).readWorkPackage('a1'));
      await reached.promise;
      return { commit: true, value: undefined };
    });
    await source.uow.run(async (scope) => {
      const count = reads.mock.calls.length;
      released.release();
      if (pending === undefined) throw new Error('missing paused observation');
      expect((await pending).message).toContain('closed');
      expect(reads.mock.calls.length).toBe(count);
      expect((await plansOf(scope).readWorkPackage('a1')).kind).toBe('shared');
      return { commit: true, value: undefined };
    });
  } finally {
    reads.mockRestore();
    await source.close();
  }
});

test('transaction snapshot and raw cache capability never revive after settlement', async () => {
  const queries: string[] = [];
  const connection = openConnection(path, {
    logQuery: (query) => {
      queries.push(query);
    },
  });
  const stores = buildStores(connection.db, OPEN);
  let admitted: ReadSnapshotLifetime | undefined;
  let retained: ChainSnapshot | undefined;
  let raw: OptimizedScheduleAdapter['readCaptured'] | undefined;
  let capturedInput: ReturnType<typeof scheduleInputOfCaptured> | undefined;
  const uow = sqliteUnitOfWork(connection.db, new WriteCoordinator(), {
    createScope: (lifetime) => {
      admitted = lifetime;
      return { stores };
    },
    createRepairScope: () => ({ stores }),
  });
  try {
    await uow.run(async () => {
      if (admitted === undefined) throw new Error('missing lifetime');
      const readable = await new WorkPackageRepository(connection.db, OPEN).listForInOrganization(
        'ada',
        'org-a',
      );
      retained = await readChainSnapshotIn(
        connection.db,
        access,
        readable,
        'a1',
        {
          schedulerOf: (readCaptured) => {
            raw = readCaptured;
            return fastScheduler;
          },
          optimization: { contractVersion: 'lifetime-test', budgetMs: 1000, now: () => 1 },
        },
        admitted,
      );
      const component = await retained.captureConnected('a1');
      const target = component.workPackages.find(({ workPackageId }) => workPackageId === 'a1');
      if (target === undefined) throw new Error('missing captured target');
      capturedInput = scheduleInputOfCaptured(target.reads);
      return { commit: true, value: undefined };
    });
    if (
      retained === undefined ||
      admitted === undefined ||
      raw === undefined ||
      capturedInput === undefined
    )
      throw new Error('missing retained capability');
    const snapshot = retained;
    const expired = admitted;
    const readCache = raw;
    const input = capturedInput;
    const ask = { workPackageId: 'a1', input, objective: 'pri', enabled: true } as const;
    async function refuses() {
      const before = queries.length;
      expect((await failureOf(snapshot.capturePlan('a1'))).message).toContain('closed');
      expect((await failureOf(snapshot.captureConnected('a1'))).message).toContain('closed');
      expect(() => snapshot.scheduler.supports('fast')).toThrow('closed');
      expect(() => snapshot.scheduler.read({ ...ask, mode: 'capture', engine: 'fast' })).toThrow(
        'closed',
      );
      expect(() => readCache(ask)).toThrow('closed');
      expect(
        (
          await failureOf(
            readChainSnapshotIn(
              connection.db,
              access,
              [],
              'a1',
              { schedulerOf: () => fastScheduler },
              expired,
            ),
          )
        ).message,
      ).toContain('closed');
      expect(queries.length).toBe(before);
    }
    await refuses();
    await uow.run(async () => {
      await refuses();
      return { commit: true, value: undefined };
    });
  } finally {
    connection.close();
  }
});

test('source fanout capability and authority callbacks expire permanently', async () => {
  const sqlite = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
  });
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  let retained: Scope<TransactionalStores>['fanoutCapture'];
  let project: Extract<AccessTarget, { readonly kind: 'project' }> | undefined;
  try {
    await source.uow.run(async (scope) => {
      const addressed = await scope.stores.settings.readTarget(
        { level: 'work_package', id: 'a1' },
        'org-a',
      );
      if (addressed === null) throw new Error('lifetime fixture package target is absent');
      project = {
        kind: 'project',
        chain: {
          level: 'project',
          organizationId: addressed.chain.organizationId,
          spaceId: addressed.chain.spaceId,
          projectId: addressed.chain.projectId,
        },
      };
      retained = scope.fanoutCapture;
      if (retained === undefined) throw new Error('missing fanout capture');
      expect((await retained.capture('org-a')).observation.mode).toBe('isolated');
      return { commit: true, value: undefined };
    });
    if (retained === undefined) throw new Error('missing retained fanout');
    const old = retained;
    if (old.resolveLifecycleOwner === undefined || old.authorizeImport === undefined)
      throw new Error('missing fanout authority');
    const resolveOwner = old.resolveLifecycleOwner;
    const authorizeImport = old.authorizeImport;
    if (project === undefined) throw new Error('missing retained import project target');
    const target = project;
    async function refuses() {
      expect((await failureOf(old.capture('org-a'))).message).toContain('closed');
      expect((await failureOf(resolveOwner('a1'))).message).toContain('closed');
      expect((await failureOf(authorizeImport('ada', access, target))).message).toContain('closed');
    }
    await refuses();
    await source.uow.run(async (scope) => {
      await refuses();
      if (scope.fanoutCapture === undefined) throw new Error('missing new fanout');
      expect((await scope.fanoutCapture.capture('org-a')).observation.mode).toBe('isolated');
      return { commit: true, value: undefined };
    });
  } finally {
    await source.close();
  }
});

test.each(['discard', 'throw'] as const)(
  'refused command repair %s uses surviving journal state and expired old captures',
  async (repair) => {
    const sqlite = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
    });
    const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
    sqlite.db.run(
      sql`INSERT INTO command_journal (id,work_package_id,user_id,seq,kind,payload,inverse,preconditions,undone,created_at) VALUES ('stale','a1','ada',1,'rename','{}','{}','{}',0,1)`,
    );
    try {
      const reading = source.uow.run(async (scope) => {
        const old = plansOf(scope);
        expect(await old.readWorkPackage('a1')).toEqual({ kind: 'isolated' });
        sqlite.db.run(sql`UPDATE work_package SET name = 'rolled back' WHERE id = 'a1'`);
        return {
          commit: false,
          value: undefined,
          afterRollback: async (surviving: Scope<TransactionalStores>) => {
            expect(surviving).not.toBe(scope);
            expect(surviving.stores.livePlans).toBeUndefined();
            expect(surviving.fanoutCapture).toBeUndefined();
            expect((await failureOf(old.readWorkPackage('a1'))).message).toContain('closed');
            expect(
              sqlite.db.get<{ name: string }>(sql`SELECT name FROM work_package WHERE id = 'a1'`)
                .name,
            ).toBe('a1');
            await surviving.stores.journal.discard('stale');
            if (repair === 'throw') throw new Error('repair failed after durable discard');
          },
        };
      });
      if (repair === 'throw')
        expect((await failureOf(reading)).message).toBe('repair failed after durable discard');
      else await reading;
      expect(
        await source.stores.journal.entriesFor({
          workPackageId: 'a1',
          userId: 'ada',
          personId: null,
        }),
      ).toEqual([]);
      await source.uow.run(async () => {
        sqlite.db.run(sql`UPDATE work_package SET name = 'following run' WHERE id = 'a1'`);
        await Promise.resolve();
        return { commit: true, value: undefined };
      });
    } finally {
      await source.close();
    }
  },
);

test('legacy early reads expire while the reusable public owner keeps opening observations', async () => {
  const sqlite = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
  });
  sqlite.db.run(sql`DROP TRIGGER organization_activation_no_revert`);
  sqlite.db.run(
    sql`UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL`,
  );
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  let retained: LivePlanStore | undefined;
  try {
    await source.uow.run(async (scope) => {
      retained = plansOf(scope);
      expect(await retained.read('a1', { kind: 'legacy' })).toEqual({ kind: 'isolated' });
      return { commit: true, value: undefined };
    });
    if (retained === undefined) throw new Error('missing legacy reader');
    expect((await failureOf(retained.read('a1', { kind: 'legacy' }))).message).toContain('closed');
    expect((await failureOf(retained.readAggregate('ada', { kind: 'legacy' }))).message).toContain(
      'closed',
    );
    const publicPlans = source.stores.livePlans;
    if (publicPlans === undefined) throw new Error('missing public owner');
    expect(await publicPlans.readWorkPackage('a1')).toEqual({ kind: 'isolated' });
    expect(await publicPlans.readWorkPackage('a1')).toEqual({ kind: 'isolated' });
  } finally {
    await source.close();
  }
});

test('work package resources require agreement with the current activation mode', async () => {
  const sqlite = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
  });
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  const plans = source.stores.livePlans;
  if (plans === undefined) throw new Error('missing public plans');
  const legacy = { kind: 'legacy' } as const;
  const refused = { kind: 'access_refused', refusal: 'no_active_organization' } as const;
  try {
    expect(await plans.readWorkPackageResources('a1', legacy)).toEqual(refused);
    expect(await plans.readWorkPackageResources('a1', access)).toMatchObject({ kind: 'ready' });
    sqlite.db.run(sql`DROP TRIGGER organization_activation_no_revert`);
    sqlite.db.run(
      sql`UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL`,
    );
    expect(await plans.readWorkPackageResources('a1', access)).toEqual(refused);
    expect(await plans.readWorkPackageResources('a1', legacy)).toMatchObject({ kind: 'ready' });
  } finally {
    await source.close();
  }
});

test.each(['execution', 'resources'] as const)(
  'borrowed %s never dispatches an aggregate after its in-flight capacity read expires',
  async (surface) => {
    const sqlite = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
    });
    sqlite.db.run(
      sql`INSERT INTO resource (id,name,kind,unit_label) VALUES ('ram','RAM','divisible','GB')`,
    );
    sqlite.db.run(
      sql`INSERT INTO resource_organization (resource_id,organization_id,name) VALUES ('ram','org-a','RAM')`,
    );
    sqlite.db.run(
      sql`INSERT INTO resource_directory_capacity (resource_id,units) VALUES ('ram',16)`,
    );
    sqlite.db.run(
      sql`INSERT INTO work_package_resource_capacity (work_package_id,resource_id,units) VALUES ('a1','ram',12)`,
    );
    const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
    await source.uow.run(async (scope) => {
      sqlite.db.run(
        sql`UPDATE resource_directory_capacity SET units = 18 WHERE resource_id = 'ram'`,
      );
      const plans = plansOf(scope);
      if (surface === 'execution')
        expect(await plans.readExecution('a1', access, null)).toMatchObject({
          kind: 'ready',
          reads: { directoryCapacities: [{ resourceId: 'ram', units: 18 }] },
        });
      else
        expect(await plans.readWorkPackageResources('a1', access)).toMatchObject({
          kind: 'ready',
          value: { resources: [{ id: 'ram', directoryCapacity: 18 }] },
        });
      return { commit: false, value: undefined };
    });
    const entered = hold();
    const resume = hold();
    const descriptor = Object.getOwnPropertyDescriptor(
      DirectoryRepository.prototype,
      'directoryCapacitiesOf',
    );
    if (typeof descriptor?.value !== 'function') throw new Error('missing capacity read');
    const original = descriptor.value as DirectoryRepository['directoryCapacitiesOf'];
    const capacity = spyOn(
      DirectoryRepository.prototype,
      'directoryCapacitiesOf',
    ).mockImplementation(async function (this: DirectoryRepository, ids) {
      const captured = await original.call(this, ids);
      expect(captured).toEqual([{ resourceId: 'ram', units: 16 }]);
      entered.release();
      await resume.promise;
      return captured;
    });
    const aggregate = spyOn(ClaimRepository.prototype, 'organizationUnitsOf');
    let reading: Promise<Error> | undefined;
    try {
      await source.uow.run(async (scope) => {
        const plans = plansOf(scope);
        reading = failureOf(
          surface === 'execution'
            ? plans.readExecution('a1', access, null)
            : plans.readWorkPackageResources('a1', access),
        );
        // A premature failure settles instead of leaving this test waiting on the seam.
        await Promise.race([
          entered.promise,
          reading.then((failure) => {
            throw failure;
          }),
        ]);
        return { commit: true, value: undefined };
      });
      if (reading === undefined) throw new Error('the borrowed read did not start');
      resume.release();
      expect((await reading).message).toContain('read snapshot is closed');
      expect(capacity).toHaveBeenCalledTimes(1);
      expect(aggregate).not.toHaveBeenCalled();
    } finally {
      capacity.mockRestore();
      aggregate.mockRestore();
      await source.close();
    }
  },
);

test.each([
  'occupancy catalog',
  'occupancy capacity dispatch',
  'occupancy stamp dispatch',
  'occupancy name dispatch',
  'startable holders',
  'startable origin dispatch',
  'startable name dispatch',
] as const)('borrowed %s cannot issue SQL after settlement', async (read) => {
  const queries: string[] = [];
  const reached = hold();
  const resume = hold();
  const occupancy = read.startsWith('occupancy');
  const completion = { commit: occupancy, value: undefined };
  let settleOwner: (decision: typeof completion) => void = () => {
    throw new Error('owner decision not initialized');
  };
  const decision = new Promise<typeof completion>((resolve) => {
    settleOwner = resolve;
  });
  let entered = false;
  let armed = false;
  const enter = () => {
    if (!armed || entered) return;
    entered = true;
    reached.release();
    settleOwner(completion);
  };
  const sqlite = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
    logger: {
      logQuery: (query) => {
        queries.push(query);
      },
    },
  });
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  const restored: (() => void)[] = [];
  type ReadOutcome = { kind: 'reply' } | { kind: 'error'; failure: unknown };
  let pending: Promise<ReadOutcome> | undefined;
  try {
    if (occupancy) {
      sqlite.db.run(sql`INSERT INTO access_grant
        (id,organization_id,scope_kind,scope_id,subject_kind,subject_id,role_id,origin,created_at)
        VALUES ('snapshot-directory','org-a','organization','org-a','user','ada','org-admin','route',1)`);
    } else {
      sqlite.db.run(sql`DROP TRIGGER organization_activation_no_revert`);
      sqlite.db.run(
        sql`UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL`,
      );
    }
    sqlite.db.run(
      sql`INSERT INTO resource (id,name,kind,unit_label) VALUES ('ram','RAM','divisible','GB')`,
    );
    sqlite.db.run(
      sql`INSERT INTO resource_organization (resource_id,organization_id,name) VALUES ('ram','org-a','RAM')`,
    );
    sqlite.db.run(
      sql`INSERT INTO resource_directory_capacity (resource_id,units) VALUES ('ram',16)`,
    );
    sqlite.db.run(sql`INSERT INTO person (id,name,kind) VALUES ('holder','Holder','agent')`);
    sqlite.db.run(
      sql`INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('holder','org-a','Holder')`,
    );
    sqlite.db.run(
      sql`INSERT INTO work_item (id,work_package_id,position,name) VALUES ('ask','a1',10,'Ask'),('held','a2',10,'Held')`,
    );
    const binding = await source.stores.stepCatalogue.defineAndBindStep(
      'org-a',
      {
        id: 'do',
        code: 'do',
        name: 'Do',
        position: 10,
        defaultEstimateUnit: 'workdays',
        defaultAllowancePercent: 0,
      },
      {
        bindingId: 'do-parent',
        scopeKind: 'project',
        scopeId: 'fixture-parent-org-a',
        workItemTypeId: null,
        position: 10,
      },
      { by: 'ada', at: 1 },
    );
    expect(binding.ok).toBe(true);
    sqlite.db.run(
      sql`INSERT INTO work_item_resource_demand (work_item_id,resource_id,units) VALUES ('ask','ram',16)`,
    );
    sqlite.db.run(
      sql`INSERT INTO claim (id,work_item_id,person_id,created_at,created_by) VALUES ('hold','held','holder',1,'ada')`,
    );
    sqlite.db.run(
      sql`INSERT INTO claim_occupancy (claim_id,resource_id,units) VALUES ('hold','ram',16)`,
    );

    const readWithin = (plans: LivePlanStore) =>
      occupancy
        ? plans.readResourceOccupancyWithin('ram', 'ada', access)
        : plans.readStartableWithin('a1', 'ada', { kind: 'legacy' }, null);
    await source.uow.run(async (scope) => {
      expect(await readWithin(plansOf(scope))).toMatchObject(
        occupancy
          ? { ok: true, value: { workPackages: [{ claims: [{ personName: 'Holder' }] }] } }
          : {
              kind: 'ready',
              value: { doesNotFit: [{ exhausted: { holders: [{ name: 'Holder' }] } }] },
            },
      );
      return { commit: true, value: undefined };
    });

    if (read === 'occupancy catalog') {
      const original = Object.getOwnPropertyDescriptor(
        DirectoryRepository.prototype,
        'listInOrganization',
      )?.value as DirectoryRepository['listInOrganization'];
      const method = spyOn(DirectoryRepository.prototype, 'listInOrganization').mockImplementation(
        async function <Catalog extends DirectoryCatalog>(
          this: DirectoryRepository,
          catalog: Catalog,
          organizationId: string,
        ): Promise<DirectoryCatalogRows[Catalog]> {
          const captured = await original.bind(this)(catalog, organizationId);
          if (catalog === 'resources') {
            enter();
            await resume.promise;
          }
          return captured;
        },
      );
      restored.push(() => {
        method.mockRestore();
      });
    } else if (read === 'startable holders') {
      const original = Object.getOwnPropertyDescriptor(
        ClaimRepository.prototype,
        'organizationOccupancyOf',
      )?.value as ClaimRepository['organizationOccupancyOf'];
      const method = spyOn(ClaimRepository.prototype, 'organizationOccupancyOf').mockImplementation(
        async function (this: ClaimRepository, ids) {
          const captured = await original.call(this, ids);
          enter();
          await resume.promise;
          return captured;
        },
      );
      restored.push(() => {
        method.mockRestore();
      });
    } else if (read === 'occupancy capacity dispatch') {
      const original = Object.getOwnPropertyDescriptor(
        DirectoryRepository.prototype,
        'directoryCapacitiesOf',
      )?.value as DirectoryRepository['directoryCapacitiesOf'];
      const method = spyOn(
        DirectoryRepository.prototype,
        'directoryCapacitiesOf',
      ).mockImplementation(function (this: DirectoryRepository, ids) {
        enter();
        return original.call(this, ids);
      });
      restored.push(() => {
        method.mockRestore();
      });
    } else if (read === 'occupancy stamp dispatch') {
      const original = Object.getOwnPropertyDescriptor(
        ClaimRepository.prototype,
        'listStampedByIds',
      )?.value as ClaimRepository['listStampedByIds'];
      const method = spyOn(ClaimRepository.prototype, 'listStampedByIds').mockImplementation(
        function (this: ClaimRepository, workPackageId, ids) {
          enter();
          return original.call(this, workPackageId, ids);
        },
      );
      restored.push(() => {
        method.mockRestore();
      });
    } else if (read === 'occupancy name dispatch') {
      const original = Object.getOwnPropertyDescriptor(
        DirectoryRepository.prototype,
        'personNamesInOrganization',
      )?.value as DirectoryRepository['personNamesInOrganization'];
      const method = spyOn(
        DirectoryRepository.prototype,
        'personNamesInOrganization',
      ).mockImplementation(function (this: DirectoryRepository, organizationId, ids) {
        enter();
        return original.call(this, organizationId, ids);
      });
      restored.push(() => {
        method.mockRestore();
      });
    } else if (read === 'startable origin dispatch') {
      const original = Object.getOwnPropertyDescriptor(
        ClaimRepository.prototype,
        'mayReadWorkPackageWithin',
      )?.value as ClaimRepository['mayReadWorkPackageWithin'];
      const method = spyOn(
        ClaimRepository.prototype,
        'mayReadWorkPackageWithin',
      ).mockImplementation(function (this: ClaimRepository, ...args) {
        if (args[0].id === 'a2') enter();
        return original.call(this, ...args);
      });
      restored.push(() => {
        method.mockRestore();
      });
    } else {
      const original = Object.getOwnPropertyDescriptor(DirectoryRepository.prototype, 'namesOf')
        ?.value as DirectoryRepository['namesOf'];
      const method = spyOn(DirectoryRepository.prototype, 'namesOf').mockImplementation(function (
        this: DirectoryRepository,
        catalog,
        ids,
      ) {
        if (ids.includes('holder')) enter();
        return original.call(this, catalog, ids);
      });
      restored.push(() => {
        method.mockRestore();
      });
    }

    armed = true;
    // The repository's own first await lets this real owner's decision settle
    // if the implementation defers SQL. There is no synthetic lifetime token.
    const first = source.uow.run((scope) => {
      pending = readWithin(plansOf(scope))
        .then<ReadOutcome, ReadOutcome>(
          () => ({ kind: 'reply' }),
          (failure: unknown) => ({ kind: 'error', failure }),
        )
        .then((outcome) => {
          if (!entered) settleOwner(completion);
          return outcome;
        });
      return decision;
    });
    const reading = await Promise.race([
      reached.promise.then(() => {
        if (pending === undefined) throw new Error('missing borrowed read');
        return { pending };
      }),
      first.then(() => {
        throw new Error('unit settled before its selected read seam');
      }),
    ]);
    await first;
    resume.release();
    const outcome = await reading.pending;
    if (outcome.kind !== 'error' || !(outcome.failure instanceof Error))
      throw new Error('expected lifetime refusal');
    expect(outcome.failure.message).toContain('read snapshot is closed');
    const last = queries.lastIndexOf(occupancy ? 'COMMIT' : 'ROLLBACK');
    expect(last).toBeGreaterThan(0);
    expect(queries.slice(last + 1)).toEqual([]);
  } finally {
    settleOwner(completion);
    resume.release();
    await pending;
    for (const restore of restored) restore();
    await source.close();
  }
});

test('scope construction failure expires acquired readers and rolls back its BEGIN', async () => {
  const connection = openConnection(path);
  const stores = buildStores(connection.db, OPEN);
  let retained: ReadSnapshotLifetime | undefined;
  const uow = sqliteUnitOfWork(connection.db, new WriteCoordinator(), {
    createScope: (lifetime) => {
      retained = lifetime;
      throw new Error('injected scope construction failure');
    },
    createRepairScope: () => ({ stores }),
  });
  try {
    expect(
      (await failureOf(uow.run(() => Promise.resolve({ commit: true, value: undefined })))).message,
    ).toBe('injected scope construction failure');
    if (retained === undefined) throw new Error('missing acquired lifetime');
    const lifetime = retained;
    expect(() => {
      lifetime.assertOpen();
    }).toThrow('closed');
    connection.db.run(sql`BEGIN`);
    connection.db.run(sql`ROLLBACK`);
  } finally {
    connection.close();
  }
});

test.each(['success', 'refusal', 'throw'] as const)(
  'runtime scope resolver expires after %s without querying in a later writer',
  async (outcome) => {
    const queries: string[] = [];
    const sqlite = openSqliteSource({
      dbPath: path,
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      logger: { logQuery: (query) => queries.push(query) },
    });
    const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
    let retained: NonNullable<Scope['fanoutCapture']>['resolveWorkPackageWriteScope'];
    try {
      const first = source.uow.run(async (scope) => {
        const resolver = scope.fanoutCapture?.resolveWorkPackageWriteScope;
        if (resolver === undefined) throw new Error('missing runtime resolver');
        retained = resolver;
        expect(await resolver('a1', 'org-a', 'ada', undefined)).toMatchObject({ ok: true });
        if (outcome === 'throw') throw new Error('injected runtime resolver owner failure');
        return { commit: outcome === 'success', value: undefined };
      });
      if (outcome === 'throw')
        expect((await failureOf(first)).message).toBe('injected runtime resolver owner failure');
      else await first;
      if (retained === undefined) throw new Error('missing retained runtime resolver');
      const resolver = retained;
      const refuses = async () => {
        const before = queries.length;
        expect((await failureOf(resolver('a1', 'org-a', 'ada', undefined))).message).toContain(
          'closed',
        );
        expect(queries.length).toBe(before);
      };
      await refuses();
      await source.uow.run(async (scope) => {
        await refuses();
        const fresh = scope.fanoutCapture?.resolveWorkPackageWriteScope;
        if (fresh === undefined) throw new Error('missing fresh runtime resolver');
        expect(await fresh('a1', 'org-a', 'ada', undefined)).toMatchObject({ ok: true });
        return { commit: true, value: undefined };
      });
    } finally {
      await source.close();
    }
  },
);

test('suspended runtime work package resolution expires before membership SQL in a later writer', async () => {
  const queries: string[] = [];
  const reached = hold();
  const released = hold();
  const sqlite = openSqliteSource({
    dbPath: path,
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    logger: { logQuery: (query) => queries.push(query) },
  });
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  const resolvePromise = Promise.resolve.bind(Promise);
  const readTarget = settings.readSettingTargetIn;
  let targetReads = 0;
  let pauses = 0;
  let isAwaitSpyActive = false;
  let restoreAwait: (() => void) | undefined;
  let restoreLookup: (() => void) | undefined;
  let pending: Promise<Error> | undefined;
  try {
    const lookup = spyOn(settings, 'readSettingTargetIn');
    restoreLookup = () => {
      lookup.mockRestore();
    };
    type TargetScope = Parameters<typeof readTarget>[1];
    type PackageTarget = Extract<
      NonNullable<ReturnType<typeof readTarget>>,
      { kind: 'work_package' }
    >;
    /**
     * Pauses only the real selected target read's next empty await.
     * Proof: snapshot-expiry-v239 removed only the resolver's post-await guard:
     * its final guard still answered closed, but membership SQL broke the empty
     * query assertion; exact restoration passed. Promise restores before pause.
     */
    function pauseAfterTarget(
      db: Parameters<typeof readTarget>[0],
      targetScope: Exclude<TargetScope, { level: 'work_package' }>,
      organizationId: string | null,
    ): never;
    function pauseAfterTarget(
      db: Parameters<typeof readTarget>[0],
      targetScope: TargetScope,
      organizationId: string | null,
    ): PackageTarget;
    function pauseAfterTarget(
      db: Parameters<typeof readTarget>[0],
      targetScope: TargetScope,
      organizationId: string | null,
    ): PackageTarget {
      const target = readTarget(db, targetScope, organizationId);
      if (
        targetScope.level !== 'work_package' ||
        targetScope.id !== 'a1' ||
        organizationId !== 'org-a'
      )
        throw new Error('unexpected settings read in runtime suspension fixture');
      if (target?.kind !== 'work_package' || targetReads !== 0 || pauses !== 0 || isAwaitSpyActive)
        throw new Error('selected runtime target read did not occur exactly once');
      targetReads += 1;
      const yielding = spyOn(Promise, 'resolve');
      isAwaitSpyActive = true;
      restoreAwait = () => {
        if (isAwaitSpyActive) {
          yielding.mockRestore();
          isAwaitSpyActive = false;
        }
      };
      function pauseAtNextAwait(): Promise<void>;
      function pauseAtNextAwait<Value>(value: Value): Promise<Awaited<Value>>;
      function pauseAtNextAwait<Value>(value: Value | PromiseLike<Value>): Promise<Awaited<Value>>;
      function pauseAtNextAwait<Value>(
        value?: Value | PromiseLike<Value>,
      ): Promise<Awaited<Value> | undefined> {
        if (arguments.length !== 0 || targetReads !== 1 || pauses !== 0 || !isAwaitSpyActive)
          throw new Error('selected runtime read did not reach its exact next empty await');
        pauses += 1;
        yielding.mockRestore();
        isAwaitSpyActive = false;
        reached.release();
        return released.promise.then(() => resolvePromise(value));
      }
      yielding.mockImplementation(pauseAtNextAwait);
      return target;
    }
    lookup.mockImplementation(pauseAfterTarget);
    await source.uow.run(async (scope) => {
      const resolver = scope.fanoutCapture?.resolveWorkPackageWriteScope;
      if (resolver === undefined) throw new Error('missing runtime resolver');
      pending = failureOf(resolver('a1', 'org-a', 'ada', undefined));
      if (targetReads !== 1 || pauses !== 1 || isAwaitSpyActive)
        throw new Error('actual selected runtime await was not paused exactly once');
      await reached.promise;
      return { commit: true, value: undefined };
    });
    await source.uow.run(async () => {
      const before = queries.length;
      released.release();
      if (pending === undefined) throw new Error('missing suspended runtime resolution');
      expect((await pending).message).toContain('closed');
      expect(queries.slice(before)).toEqual([]);
      return { commit: true, value: undefined };
    });
  } finally {
    released.release();
    try {
      if (pending !== undefined) await pending;
    } finally {
      try {
        restoreAwait?.();
      } finally {
        try {
          restoreLookup?.();
        } finally {
          await source.close();
        }
      }
    }
  }
});
