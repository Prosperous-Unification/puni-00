import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Scope, TransactionalStores } from '@wbs/core';
import * as core from '@wbs/core';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { DirectoryRepository } from './directory';
import { DrizzleEventLogStore } from './event-log';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import { openSqliteSource, type SqliteSource } from './source';
import { StepBlockageRepository } from './step-blockage';
import { StepNodeAttemptRepository } from './step-node-attempt';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { openSpaceDatabase } from './testing/space-database';
import { WorkItemRepository } from './work-item';

let folder: string;
let sqlite: SqliteSource;
let queries: string[];
const access = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'read-continuation-'));
  const path = await openSpaceDatabase(folder);
  queries = [];
  sqlite = openSqliteSource({
    dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
    logger: {
      logQuery: (query) => {
        queries.push(query);
      },
    },
  });
  sqlite.db.run(sql`UPDATE organization_activation SET state = 'activated', activated_at = 1`);
  sqlite.db.run(
    sql`INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a','ada','member',1)`,
  );
});
afterEach(async () => {
  await sqlite.close();
  rmSync(folder, { recursive: true, force: true });
});
function hold() {
  let release: () => void = () => {
    throw new Error('uninitialized hold');
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
async function failureOf(reading: Promise<unknown>): Promise<Error> {
  try {
    await reading;
  } catch (failure) {
    if (failure instanceof Error) return failure;
    throw failure;
  }
  throw new Error('expected expired continuation');
}
async function crossesSettlement(
  outcome: 'success' | 'refusal' | 'throw',
  invoke: (scope: Scope<TransactionalStores>) => Promise<unknown>,
  reached: ReturnType<typeof hold>,
  released: ReturnType<typeof hold>,
) {
  const source = sqlite.bindLivePlans({ schedulerOf: () => fastScheduler });
  let pending: Promise<Error> | undefined;
  const first = source.uow.run(async (scope) => {
    pending = failureOf(invoke(scope));
    await reached.promise;
    if (outcome === 'throw') throw new Error('injected settlement throw');
    return { commit: outcome === 'success', value: undefined };
  });
  if (outcome === 'throw') expect((await failureOf(first)).message).toContain('settlement throw');
  else await first;
  await source.uow.run(async () => {
    const before = queries.length;
    released.release();
    if (pending === undefined) throw new Error('missing paused read');
    expect((await pending).message).toContain('closed');
    expect(queries.length - before).toBe(0);
    expect(queries.slice(before)).toEqual([]);
    return { commit: true, value: undefined };
  });
}
for (const outcome of ['success', 'refusal', 'throw'] as const) {
  test(`live project first response refuses before SQL after ${outcome}`, async () => {
    const reached = hold();
    const released = hold();
    let pause = true;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = ProjectRepository.prototype.findById;
    const reading = spyOn(ProjectRepository.prototype, 'findById').mockImplementation(
      async function (this: ProjectRepository, id) {
        const project = await original.call(this, id);
        if (pause) {
          pause = false;
          reached.release();
          await released.promise;
        }
        return project;
      },
    );
    try {
      await crossesSettlement(
        outcome,
        (scope) => {
          if (scope.stores.livePlans === undefined) throw new Error('missing live plans');
          return scope.stores.livePlans.readProject('a1');
        },
        reached,
        released,
      );
    } finally {
      reading.mockRestore();
    }
  });
  for (const method of ['authorizeProjectUpdate', 'authorizeStepRemoval'] as const) {
    test(`fanout ${method} refuses before membership SQL after ${outcome}`, async () => {
      const reached = hold();
      const released = hold();
      let pause = true;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const original = ProjectRepository.prototype.findInOrganization;
      const reading = spyOn(ProjectRepository.prototype, 'findInOrganization').mockImplementation(
        async function (this: ProjectRepository, id, organizationId) {
          const project = await original.call(this, id, organizationId);
          if (pause) {
            pause = false;
            reached.release();
            await released.promise;
          }
          return project;
        },
      );
      try {
        await crossesSettlement(
          outcome,
          (scope) => {
            const authorize = scope.fanoutCapture?.[method];
            if (authorize === undefined) throw new Error('missing fanout authorizer');
            return authorize('a1', 'ada', access);
          },
          reached,
          released,
        );
      } finally {
        reading.mockRestore();
      }
    });
  }
}

async function pauseResponse<Value>(
  reading: Promise<Value>,
  at: number,
  reached: ReturnType<typeof hold>,
  released: ReturnType<typeof hold>,
) {
  const value = await reading;
  if (at === 1) {
    reached.release();
    await released.promise;
  }
  return value;
}

for (const mode of ['project', 'aggregate', 'export'] as const) {
  for (const boundary of [
    'owned',
    'rank',
    'chain',
    'steps',
    'work-items',
    'attempts',
    'blockages',
    'sequence',
  ] as const) {
    test.each(['success', 'refusal', 'throw'] as const)(
      `${mode} ${boundary} continuation performs zero expired SQL after %s`,
      async (outcome) => {
        sqlite.db.run(sql`UPDATE organization SET shared_people = 1 WHERE id = 'org-a'`);
        const reached = hold();
        const released = hold();
        let calls = 0;
        const reading = (() => {
          if (boundary === 'owned') {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const original = ProjectRepository.prototype.findInOrganization;
            return spyOn(ProjectRepository.prototype, 'findInOrganization').mockImplementation(
              function (this: ProjectRepository, id, organizationId) {
                return pauseResponse(
                  original.call(this, id, organizationId),
                  ++calls,
                  reached,
                  released,
                );
              },
            );
          }
          if (boundary === 'rank') {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const original = ProjectRankRepository.prototype.orderIn;
            return spyOn(ProjectRankRepository.prototype, 'orderIn').mockImplementation(function (
              this: ProjectRankRepository,
              organizationId,
            ) {
              return pauseResponse(original.call(this, organizationId), ++calls, reached, released);
            });
          }
          if (boundary === 'chain') {
            const original = core.readChain;
            return spyOn(core, 'readChain').mockImplementation((snapshot, projectId) =>
              pauseResponse(original(snapshot, projectId), ++calls, reached, released),
            );
          }
          if (boundary === 'steps') {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const original = ProjectRepository.prototype.stepsOf;
            return spyOn(ProjectRepository.prototype, 'stepsOf').mockImplementation(function (
              this: ProjectRepository,
              id,
            ) {
              return pauseResponse(original.call(this, id), ++calls - 1, reached, released);
            });
          }
          if (boundary === 'work-items') {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const original = WorkItemRepository.prototype.listByProject;
            return spyOn(WorkItemRepository.prototype, 'listByProject').mockImplementation(
              function (this: WorkItemRepository, id) {
                return pauseResponse(original.call(this, id), ++calls - 1, reached, released);
              },
            );
          }
          if (boundary === 'attempts') {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const original = StepNodeAttemptRepository.prototype.listByProject;
            return spyOn(StepNodeAttemptRepository.prototype, 'listByProject').mockImplementation(
              function (this: StepNodeAttemptRepository, id) {
                return pauseResponse(original.call(this, id), ++calls, reached, released);
              },
            );
          }
          if (boundary === 'blockages') {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const original = StepBlockageRepository.prototype.listByProject;
            return spyOn(StepBlockageRepository.prototype, 'listByProject').mockImplementation(
              function (this: StepBlockageRepository, id) {
                return pauseResponse(original.call(this, id), ++calls - 1, reached, released);
              },
            );
          }
          // eslint-disable-next-line @typescript-eslint/unbound-method
          const original = DrizzleEventLogStore.prototype.latestSeq;
          return spyOn(DrizzleEventLogStore.prototype, 'latestSeq').mockImplementation(function (
            this: DrizzleEventLogStore,
            stream,
          ) {
            return pauseResponse(original.call(this, stream), ++calls, reached, released);
          });
        })();
        try {
          await crossesSettlement(
            outcome,
            (scope) => {
              const plans = scope.stores.livePlans;
              if (plans === undefined) throw new Error('missing plans');
              return mode === 'aggregate'
                ? plans.readAggregate('ada', access)
                : mode === 'export'
                  ? plans.readExport('a1', access)
                  : plans.readProject('a1');
            },
            reached,
            released,
          );
        } finally {
          reading.mockRestore();
        }
      },
    );
  }
}

test('aggregate cached schedule cannot escape a resumed expired chain', async () => {
  sqlite.db.run(sql`UPDATE organization SET shared_people = 1 WHERE id = 'org-a'`);
  sqlite.db.run(sql`UPDATE project SET start_date = '2026-10-05' WHERE id IN ('a1','a2')`);
  sqlite.db.run(sql`INSERT INTO person (id,name) VALUES ('p','p')`);
  sqlite.db.run(
    sql`INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('p','org-a','p')`,
  );
  for (const id of ['a1', 'a2']) {
    sqlite.db.run(
      sql`INSERT INTO work_item (id,project_id,position,name) VALUES (${id},${id},10,${id})`,
    );
    sqlite.db.run(
      sql`INSERT INTO step (id,project_id,position,name) VALUES (${id + '-s'},${id},10,'step')`,
    );
    sqlite.db.run(
      sql`INSERT INTO assignment (work_item_id,step_id,person_id) VALUES (${id},${id + '-s'},'p')`,
    );
  }
  const reached = hold();
  const released = hold();
  let escaped = 0;
  let resumed = false;
  const original = core.readChain;
  const reading = spyOn(core, 'readChain').mockImplementation((snapshot, projectId) => {
    if (projectId !== 'a2') return original(snapshot, projectId);
    return original(
      {
        ...snapshot,
        capturePlan: async (id) => {
          const captured = await snapshot.capturePlan(id);
          if (id === 'a2') {
            reached.release();
            await released.promise;
            resumed = true;
          }
          return captured;
        },
        scheduler: {
          ...snapshot.scheduler,
          read: (ask) => {
            const scheduled = snapshot.scheduler.read(ask);
            if (resumed) escaped++;
            return scheduled;
          },
        },
      },
      projectId,
    );
  });
  try {
    await crossesSettlement(
      'success',
      (scope) => {
        if (scope.stores.livePlans === undefined) throw new Error('missing plans');
        return scope.stores.livePlans.readAggregate('ada', access);
      },
      reached,
      released,
    );
    expect(escaped).toBe(0);
  } finally {
    reading.mockRestore();
  }
});

for (const outcome of ['success', 'refusal', 'throw'] as const) {
  test(`directory reference evidence refuses before classification after ${outcome}`, async () => {
    sqlite.db.run(sql`INSERT INTO tag (id,name) VALUES ('t','tag')`);
    sqlite.db.run(
      sql`INSERT INTO tag_organization (resource_id,organization_id,name) VALUES ('t','org-a','tag')`,
    );
    sqlite.db.run(
      sql`INSERT INTO work_item (id,project_id,position,name) VALUES ('foreign','b1',10,'foreign')`,
    );
    sqlite.db.run(sql`INSERT INTO work_item_tag (work_item_id,tag_id) VALUES ('foreign','t')`);
    const reached = hold();
    const released = hold();
    let calls = 0;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = DirectoryRepository.prototype.foreignReferencesTo;
    const reading = spyOn(DirectoryRepository.prototype, 'foreignReferencesTo').mockImplementation(
      function (this: DirectoryRepository, ...args) {
        return pauseResponse(original.apply(this, args), ++calls, reached, released);
      },
    );
    try {
      await crossesSettlement(
        outcome,
        (scope) => {
          const resolve = scope.fanoutCapture?.resolveDirectoryWrite;
          if (resolve === undefined) throw new Error('missing directory authority');
          return resolve({ kind: 'rename', catalog: 'tags', resourceId: 't', access });
        },
        reached,
        released,
      );
    } finally {
      reading.mockRestore();
    }
  });
}
