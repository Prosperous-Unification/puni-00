import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  ChainSnapshot,
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
import { openConnection, openDatabase } from './db';
import { OPEN, WriteCoordinator } from './gate';
import { ProjectRepository } from './project';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { openSqliteSource, openSqliteSourceWithCaptureReadSeam } from './source';
import { sqliteUnitOfWork } from './sqlite-unit-of-work';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { openSpaceDatabase } from './testing/space-database';
import { WorkItemRepository } from './work-item';

let folder: string;
let path: string;
const access = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'capture-lifetime-'));
  path = await openSpaceDatabase(folder);
  const client = openDatabase(path);
  try {
    client.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
    client.run(
      "INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a','ada','member',1)",
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
        expect(await retained.readProject('a1')).toEqual({ kind: 'isolated' });
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
          old.readProject('a1'),
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
        expect(await plansOf(scope).readProject('a1')).toEqual({ kind: 'isolated' });
        await refuses();
        sqlite.db.run(sql`UPDATE project SET name = 'still open' WHERE id = 'a1'`);
        return { commit: true, value: undefined };
      });
      expect(
        sqlite.db.get<{ name: string }>(sql`SELECT name FROM project WHERE id = 'a1'`).name,
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
      sqlite.db.run(sql`UPDATE project SET name = 'staged' WHERE id = 'a1'`);
      const observed = await plansOf(scope).readProject('a1');
      if (observed.kind !== 'shared') throw new Error('missing shared observation');
      expect(observed.project.name).toBe('staged');
      return { commit: false, value: undefined };
    });
    expect(
      sqlite.db.get<{ name: string }>(sql`SELECT name FROM project WHERE id = 'a1'`).name,
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
  const reads = spyOn(WorkItemRepository.prototype, 'listByProject');
  try {
    await source.uow.run(async (scope) => {
      pending = failureOf(plansOf(scope).readProject('a1'));
      await reached.promise;
      return { commit: true, value: undefined };
    });
    await source.uow.run(async (scope) => {
      const count = reads.mock.calls.length;
      released.release();
      if (pending === undefined) throw new Error('missing paused observation');
      expect((await pending).message).toContain('closed');
      expect(reads.mock.calls.length).toBe(count);
      expect((await plansOf(scope).readProject('a1')).kind).toBe('shared');
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
      const readable = await new ProjectRepository(connection.db, OPEN).listForInOrganization(
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
      const target = component.projects.find(({ projectId }) => projectId === 'a1');
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
    const ask = { projectId: 'a1', input, objective: 'pri', enabled: true } as const;
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
  try {
    await source.uow.run(async (scope) => {
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
    async function refuses() {
      expect((await failureOf(old.capture('org-a'))).message).toContain('closed');
      expect((await failureOf(resolveOwner('a1'))).message).toContain('closed');
      expect((await failureOf(authorizeImport('ada', access))).message).toContain('closed');
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
      sql`INSERT INTO command_journal (id,project_id,user_id,seq,kind,payload,inverse,preconditions,undone,created_at) VALUES ('stale','a1','ada',1,'rename','{}','{}','{}',0,1)`,
    );
    try {
      const reading = source.uow.run(async (scope) => {
        const old = plansOf(scope);
        expect(await old.readProject('a1')).toEqual({ kind: 'isolated' });
        sqlite.db.run(sql`UPDATE project SET name = 'rolled back' WHERE id = 'a1'`);
        return {
          commit: false,
          value: undefined,
          afterRollback: async (surviving: Scope<TransactionalStores>) => {
            expect(surviving).not.toBe(scope);
            expect(surviving.stores.livePlans).toBeUndefined();
            expect(surviving.fanoutCapture).toBeUndefined();
            expect((await failureOf(old.readProject('a1'))).message).toContain('closed');
            expect(
              sqlite.db.get<{ name: string }>(sql`SELECT name FROM project WHERE id = 'a1'`).name,
            ).toBe('a1');
            await surviving.stores.journal.discard('stale');
            if (repair === 'throw') throw new Error('repair failed after durable discard');
          },
        };
      });
      if (repair === 'throw')
        expect((await failureOf(reading)).message).toBe('repair failed after durable discard');
      else await reading;
      expect(await source.stores.journal.entriesFor('a1', 'ada')).toEqual([]);
      await source.uow.run(async () => {
        sqlite.db.run(sql`UPDATE project SET name = 'following run' WHERE id = 'a1'`);
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
    expect(await publicPlans.readProject('a1')).toEqual({ kind: 'isolated' });
    expect(await publicPlans.readProject('a1')).toEqual({ kind: 'isolated' });
  } finally {
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
    let retained: NonNullable<Scope['fanoutCapture']>['resolveProjectWriteScope'];
    try {
      const first = source.uow.run(async (scope) => {
        const resolver = scope.fanoutCapture?.resolveProjectWriteScope;
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
        const fresh = scope.fanoutCapture?.resolveProjectWriteScope;
        if (fresh === undefined) throw new Error('missing fresh runtime resolver');
        expect(await fresh('a1', 'org-a', 'ada', undefined)).toMatchObject({ ok: true });
        return { commit: true, value: undefined };
      });
    } finally {
      await source.close();
    }
  },
);

test('suspended runtime project resolution expires before membership SQL in a later writer', async () => {
  const queries: string[] = [];
  const reached = hold();
  const released = hold();
  const sqlite = openSqliteSource({
    dbPath: path,
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    logger: { logQuery: (query) => queries.push(query) },
  });
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  const projects = new ProjectRepository(sqlite.db, OPEN);
  const find = projects.findInOrganization.bind(projects);
  let pause = true;
  const lookup = spyOn(ProjectRepository.prototype, 'findInOrganization').mockImplementation(
    async (projectId, organizationId) => {
      const project = await find(projectId, organizationId);
      if (pause) {
        pause = false;
        reached.release();
        await released.promise;
      }
      return project;
    },
  );
  let pending: Promise<Error> | undefined;
  try {
    await source.uow.run(async (scope) => {
      const resolver = scope.fanoutCapture?.resolveProjectWriteScope;
      if (resolver === undefined) throw new Error('missing runtime resolver');
      pending = failureOf(resolver('a1', 'org-a', 'ada', undefined));
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
    if (pending !== undefined) await pending;
    lookup.mockRestore();
    await source.close();
  }
});
