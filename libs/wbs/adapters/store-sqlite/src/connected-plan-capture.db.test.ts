import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type OptimizedScheduleRead, scheduleInputOfCaptured } from '@wbs/core';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { ChainSnapshotRepository, createChainSnapshotStore } from './chain-snapshot';
import { captureConnectedPlanIn } from './connected-plan-capture';
import { drizzleReadTransaction, openConnection, openDatabase, openReadOnlyConnection } from './db';
import { allocateGeneration } from './optimization-generation';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import { createReadSnapshotLifetime } from './read-snapshot-lifetime';
import { scheduleInputHash } from './schedule-input-hash';
import { optimizedScheduleCache } from './schema';
import { openSpaceDatabase } from './testing/space-database';
import { TypedDependencyRepository } from './typed-dependency';
import { WorkItemRepository } from './work-item';

let folder: string;
let path: string;
function write(statement: string): void {
  const client = openDatabase(path);
  try {
    client.run(statement);
  } finally {
    client.close();
  }
}
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'connected-capture-'));
  path = await openSpaceDatabase(folder);
  write("UPDATE organization_activation SET state = 'activated', activated_at = 1");
  write(
    "INSERT INTO organization_membership (organization_id,user_id,role,created_at) VALUES ('org-a','ada','member',1)",
  );
  for (const id of ['a1', 'a2', 'a3', 'a4'])
    write(
      `INSERT INTO work_item (id,project_id,position,name) VALUES ('${id}','${id}',10,'${id}')`,
    );
  write(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('edge','org-a','a2','a1','a2','a1','whole','whole','FS')",
  );
});
afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});
function snapshots() {
  return createChainSnapshotStore({
    dbPath: path,
    activeOrganizationOf: () => () => Promise.resolve('org-a'),
    now: () => 1,
    schedulerOf: () => ({
      supports: () => true,
      read: () => {
        throw new Error('capture admitted scheduler');
      },
    }),
  });
}
test('captures both incident directions once with local projection and own labels', async () => {
  await snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
    const captured = await snapshot.captureConnected('a1');
    const reverse = await snapshot.captureConnected('a2');
    expect(captured).toEqual(reverse);
    expect(captured.projects.map(({ projectId }) => projectId)).toEqual(['a1', 'a2']);
    expect(captured.projects.map(({ reads }) => reads.project.name)).toEqual(['a1', 'a2']);
    expect(captured.projects.every(({ reads }) => reads.typedDependencies.length === 0)).toBe(true);
    expect(captured.relationships.map(({ id }) => id)).toEqual(['edge']);
    return { kind: 'not_found' };
  });
});

test('shared closure alternates person bridges and incoming dependencies without rank cutoff', async () => {
  write("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  for (const person of ['p', 'q']) {
    write(`INSERT INTO person (id,name) VALUES ('${person}','${person}')`);
    write(
      `INSERT INTO person_organization (resource_id,organization_id,name) VALUES ('${person}','org-a','${person}')`,
    );
  }
  for (const [project, person] of [
    ['a2', 'p'],
    ['a3', 'p'],
    ['a4', 'q'],
  ]) {
    write(
      `INSERT INTO step (id,project_id,name,position) VALUES ('${project}-${person}','${project}','${person}',10)`,
    );
    write(
      `INSERT INTO assignment (work_item_id,step_id,person_id) VALUES ('${project}','${project}-${person}','${person}')`,
    );
  }
  write(
    "INSERT INTO external_dependency (id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('bridge-edge','org-a','a3','a4','a3','a4','whole','whole','FS')",
  );
  await snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
    expect(
      (await snapshot.captureConnected('a1')).projects.map(({ projectId }) => projectId),
    ).toEqual(['a1', 'a2', 'a3', 'a4']);
    return { kind: 'not_found' };
  });
});

test('concurrent predecessor edit yields one coherent state until next observation', async () => {
  await snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
    write("UPDATE project SET name = 'edited' WHERE id = 'a2'");
    const captured = await snapshot.captureConnected('a1');
    expect(captured.projects.find(({ projectId }) => projectId === 'a2')?.reads.project.name).toBe(
      'a2',
    );
    return { kind: 'not_found' };
  });
  await snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
    expect(
      (await snapshot.captureConnected('a1')).projects.find(({ projectId }) => projectId === 'a2')
        ?.reads.project.name,
    ).toBe('edited');
    return { kind: 'not_found' };
  });
});

test('refuses missing required ownership', async () => {
  write('DROP TRIGGER project_organization_frozen_delete');
  const corrupt = openDatabase(path);
  try {
    corrupt.run('PRAGMA foreign_keys = OFF');
    corrupt.run("DELETE FROM project_organization WHERE resource_id = 'a2'");
  } finally {
    corrupt.close();
  }
  expect(
    (
      await failureOf(
        snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
          await snapshot.captureConnected('a1');
          return { kind: 'not_found' };
        }),
      )
    ).message,
  ).toContain('organization ownership');
});

test('snapshot capability expires when callback closes', async () => {
  let retained: (() => Promise<unknown>) | undefined;
  await snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
    await snapshot.captureConnected('a1');
    retained = () => snapshot.captureConnected('a1');
    return { kind: 'not_found' };
  });
  if (retained === undefined) throw new Error('missing retained capability');
  expect((await failureOf(retained())).message).toContain('closed');
});

test('connected isolated cache publication stays invisible through sequential selections', async () => {
  // The production scheduler adapter selects only captured cache observations.
  const cacheStates: OptimizedScheduleRead[] = [];
  const observation = createChainSnapshotStore({
    dbPath: path,
    activeOrganizationOf: () => () => Promise.resolve('org-a'),
    now: () => 1,
    optimization: { contractVersion: 'capture-test', budgetMs: 1000, now: () => 1 },
    schedulerOf: (readCaptured) => ({
      supports: () => true,
      read: (ask) => {
        if (readCaptured === undefined) throw new Error('missing captured reader');
        cacheStates.push(readCaptured(ask));
        throw new Error('cache observed without schedule derivation');
      },
    }),
  });
  async function select(publish: boolean) {
    await observation.withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
      const captured = await snapshot.captureConnected('a1');
      const target = captured.projects.find(({ projectId }) => projectId === 'a1');
      if (target === undefined) throw new Error('missing target');
      const input = scheduleInputOfCaptured(target.reads);
      const ask = {
        mode: 'capture',
        projectId: 'a1',
        input,
        objective: 'pri',
        engine: 'optimized',
        enabled: true,
      } as const;
      expect(() => snapshot.scheduler.read(ask)).toThrow('cache observed');
      if (publish) {
        const connection = openConnection(path);
        try {
          const inputHash = scheduleInputHash(input);
          const allocated = allocateGeneration(connection.db, 'a1', 'capture-test', inputHash, 1);
          connection.db
            .insert(optimizedScheduleCache)
            .values({
              projectId: 'a1',
              inputHash,
              generation: allocated,
              contractVersion: 'capture-test',
              budgetMs: 1000,
              objective: 'pri',
              status: 'failed',
              failureReason: 'timeout',
              createdAt: 1,
              resultJson: null,
            })
            .run();
        } finally {
          connection.close();
        }
      }
      expect(() => snapshot.scheduler.read(ask)).toThrow('cache observed');
      return { kind: 'not_found' };
    });
  }
  await select(true);
  await select(false);
  expect(cacheStates.map((state) => state.variants.pri.state)).toEqual([
    'idle',
    'idle',
    'failed',
    'failed',
  ]);
});

test('borrowed capture sees staged writes and preserves owner transaction', async () => {
  const connection = openConnection(path);
  const transaction = drizzleReadTransaction(connection.db);
  transaction.begin();
  try {
    connection.db.run(sql`UPDATE project SET name = 'staged' WHERE id = 'a2'`);
    const captured = await captureConnectedPlanIn(
      connection.db,
      { kind: 'scoped', scope: { organizationId: 'org-a' } },
      'a1',
      createReadSnapshotLifetime(),
    );
    expect(captured.projects.find(({ projectId }) => projectId === 'a2')?.reads.project.name).toBe(
      'staged',
    );
    transaction.rollback();
    expect(
      connection.db.get<{ name: string }>(sql`SELECT name FROM project WHERE id = 'a2'`),
    ).toEqual({
      name: 'a2',
    });
  } finally {
    connection.close();
  }
});

test.each(['absent', 'malformed', 'unreadable'] as const)(
  'refuses %s required project evidence',
  async (fault) => {
    const corrupt = openDatabase(path);
    try {
      if (fault === 'absent')
        corrupt.run("DELETE FROM project_abbreviation WHERE project_id = 'a2'");
      else if (fault === 'malformed') {
        corrupt.run('PRAGMA ignore_check_constraints = ON');
        corrupt.run(
          "UPDATE project_abbreviation SET abbreviation = 'bad.code' WHERE project_id = 'a2'",
        );
      } else corrupt.run('ALTER TABLE project_abbreviation RENAME TO unavailable_abbreviation');
    } finally {
      corrupt.close();
    }
    expect(
      (
        await failureOf(
          snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
            await snapshot.captureConnected('a1');
            return { kind: 'not_found' };
          }),
        )
      ).message,
    ).toContain(
      fault === 'absent'
        ? 'abbreviation is missing'
        : fault === 'malformed'
          ? 'abbreviation is malformed'
          : 'Failed query',
    );
  },
);

test('capture never admits solver work or writes events', async () => {
  function counts() {
    const client = openDatabase(path);
    try {
      return ['solver_queue', 'solver_slot', 'optimization_generation', 'event_log'].map((table) =>
        client.query(`SELECT count(*) AS count FROM ${table}`).get(),
      );
    } finally {
      client.close();
    }
  }
  const before = counts();
  await snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
    await snapshot.captureConnected('a1');
    return { kind: 'not_found' };
  });
  expect(counts()).toEqual(before);
});

test('requires existing admitted organization authority even for cached components', async () => {
  await snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
    expect((await failureOf(snapshot.captureConnected('b1'))).message).toContain(
      'readable organization ownership',
    );
    return { kind: 'not_found' };
  });
});

test('memoizes complete project capture across component targets', async () => {
  const reads = spyOn(WorkItemRepository.prototype, 'listByProject');
  try {
    await snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
      await snapshot.captureConnected('a1');
      await snapshot.captureConnected('a2');
      expect(reads.mock.calls.map(([projectId]) => projectId).sort()).toEqual(['a1', 'a2']);
      return { kind: 'not_found' };
    });
  } finally {
    reads.mockRestore();
  }
});

test.each(['success', 'refusal', 'throw'] as const)(
  'owned connected %s closes exactly once after ending transaction',
  async (outcome) => {
    let closed = 0;
    const store = new ChainSnapshotRepository({
      openConnection: () => {
        const connection = openReadOnlyConnection(path);
        return {
          db: connection.db,
          close: () => {
            connection.db.run(sql`BEGIN`);
            connection.db.run(sql`ROLLBACK`);
            closed++;
            connection.close();
          },
        };
      },
      activeOrganizationOf: () => () => Promise.resolve('org-a'),
      now: () => 1,
      schedulerOf: () => ({
        supports: () => true,
        read: () => {
          throw new Error('unexpected schedule');
        },
      }),
    });
    const reading = store.withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
      await snapshot.captureConnected('a1');
      if (outcome === 'throw') throw new Error('injected callback failure');
      return { kind: 'not_found' };
    });
    if (outcome === 'throw')
      expect((await failureOf(reading)).message).toContain('injected callback failure');
    else expect(await reading).toEqual({ ok: true, value: { kind: 'not_found' } });
    expect(closed).toBe(1);
  },
);

async function failureOf(reading: Promise<unknown>): Promise<Error> {
  try {
    await reading;
  } catch (failure) {
    if (failure instanceof Error) return failure;
    throw failure;
  }
  throw new Error('expected observation to refuse');
}

test('refuses missing component rank rather than synthesizing priority', async () => {
  // The fault injection reapplies the original with the intercepted repository instance.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = ProjectRankRepository.prototype.orderIn;
  const ranks = spyOn(ProjectRankRepository.prototype, 'orderIn').mockImplementation(
    async function (this: ProjectRankRepository, organizationId) {
      return (await original.call(this, organizationId)).filter(
        ({ projectId }) => projectId !== 'a2',
      );
    },
  );
  try {
    expect(
      (
        await failureOf(
          snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
            await snapshot.captureConnected('a1');
            return { kind: 'not_found' };
          }),
        )
      ).message,
    ).toContain('rank is absent');
  } finally {
    ranks.mockRestore();
  }
});

test('refuses a project lost by the full-input reader after topology admission', async () => {
  // The fault injection reapplies the original with the intercepted repository instance.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = ProjectRepository.prototype.findInOrganization;
  let observed = 0;
  const projects = spyOn(ProjectRepository.prototype, 'findInOrganization').mockImplementation(
    async function (this: ProjectRepository, projectId, organizationId) {
      if (projectId === 'a2' && ++observed === 2) return null;
      return original.call(this, projectId, organizationId);
    },
  );
  try {
    expect(
      (
        await failureOf(
          snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
            await snapshot.captureConnected('a1');
            return { kind: 'not_found' };
          }),
        )
      ).message,
    ).toContain('disappeared inside snapshot');
  } finally {
    projects.mockRestore();
  }
});

test.each(['identity', 'local-projection'] as const)(
  'refuses inconsistent %s evidence inside production capture',
  async (fault) => {
    if (fault === 'local-projection')
      write(
        "INSERT INTO typed_dependency (id,project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('local','a1','a1','a1','whole','whole','FS')",
      );
    // The fault injection reapplies the original with the intercepted repository instance.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = TypedDependencyRepository.prototype.listIncident;
    let calls = 0;
    const relationships = spyOn(
      TypedDependencyRepository.prototype,
      'listIncident',
    ).mockImplementation(async function (this: TypedDependencyRepository, projectIds) {
      const held = await original.call(this, projectIds);
      calls++;
      if (fault === 'identity' && calls === 2)
        return held.map((relationship) => ({ ...relationship, type: 'SS' as const }));
      if (fault === 'local-projection' && calls === 3)
        return held.filter(({ id }) => id !== 'local');
      return held;
    });
    try {
      expect(
        (
          await failureOf(
            snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
              await snapshot.captureConnected('a1');
              return { kind: 'not_found' };
            }),
          )
        ).message,
      ).toContain(
        fault === 'identity' ? 'identity disagrees' : 'local relationship projection disagrees',
      );
    } finally {
      relationships.mockRestore();
    }
  },
);

test('borrowed live reader refuses acquisition and reads after its one-way scope expires', async () => {
  const { createLivePlanStore } = await import('./chain-snapshot');
  const connection = openConnection(path);
  let open = true;
  const lifetime = {
    assertOpen: () => {
      if (!open) throw new Error('scope is closed');
    },
  };
  const options = {
    kind: 'borrowed',
    db: connection.db,
    lifetime,
    schedulerOf: () => ({
      supports: () => true,
      read: () => {
        throw new Error('unexpected schedule');
      },
    }),
  } as const;
  try {
    const reader = createLivePlanStore(options);
    open = false;
    expect((await failureOf(reader.readProject('a1'))).message).toContain('scope is closed');
    expect(() => createLivePlanStore(options)).toThrow('scope is closed');
  } finally {
    connection.close();
  }
});

test('concurrent component requests read every full project input once', async () => {
  const reads = spyOn(WorkItemRepository.prototype, 'listByProject');
  try {
    await snapshots().withSnapshot({ id: 'ada' }, 'a1', async (snapshot) => {
      const [first, second] = await Promise.all([
        snapshot.captureConnected('a1'),
        snapshot.captureConnected('a2'),
      ]);
      expect(first).toEqual(second);
      expect(reads.mock.calls.map(([projectId]) => projectId).sort()).toEqual(['a1', 'a2']);
      return { kind: 'not_found' };
    });
  } finally {
    reads.mockRestore();
  }
});
