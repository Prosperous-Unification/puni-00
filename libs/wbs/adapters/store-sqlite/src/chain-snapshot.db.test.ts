import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { encodeOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import { readChain, scheduleInputOfCaptured, SharedPeopleReader } from '@wbs/core';
import { SavedPlanResource } from '@wbs/core/module/saved-plans/saved-plan.resource';
import { SavedPlanService } from '@wbs/core/module/saved-plans/saved-plans.feature';
import { schedule, sliceKey } from '@wbs/domain';
import { canonicalScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { createScheduler } from '@wbs/runtime-portable';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { sql } from 'drizzle-orm';

import {
  ChainSnapshotRepository,
  createChainSnapshotStore,
  createLivePlanStore,
  readChainSnapshotIn,
} from './chain-snapshot';
import { drizzleReadTransaction, openConnection, openDatabase, openReadOnlyConnection } from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import { allocateGeneration } from './optimization-generation';
import { ProjectRepository } from './project';
import { ProjectRankRepository } from './project-rank';
import { SavedPlanRepository } from './saved-plan';
import { SavedPlanCaptureRepository } from './saved-plan-capture';
import { scheduleInputHash } from './schedule-input-hash';
import { optimizedScheduleCache } from './schema';
import { nodeDigest } from './testing/node-digest';
import { openSpaceDatabase } from './testing/space-database';

let dir: string;
let path: string;
let closed: number;
const principal = { id: 'ada' };
const admitted = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
} as const;
const fast = createScheduler(
  (rows, edges, slices, floors, pools, reach, deadlines, typed, elsewhere) =>
    schedule(rows, edges, slices, floors, pools, reach, deadlines, typed, undefined, elsewhere),
);

function write(statement: string): void {
  const client = openDatabase(path);
  try {
    client.run(statement);
  } finally {
    client.close();
  }
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-chain-'));
  path = await openSpaceDatabase(dir);
  closed = 0;
  write("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  write(
    "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'ada', 'member', 1)",
  );
  write("UPDATE organization_activation SET state = 'activated', activated_at = 1");
  for (const personId of ['ana', 'ben']) {
    write(`INSERT INTO person (id, name) VALUES ('${personId}', '${personId}')`);
    write(
      `INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('${personId}', 'org-a', '${personId}')`,
    );
  }
  for (const [projectId, people] of [
    ['a1', ['ana']],
    ['a2', ['ana', 'ben']],
    ['a3', ['ben']],
  ] as const) {
    write(
      `UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = '${projectId}'`,
    );
    write(
      `INSERT INTO work_item (id, project_id, position, name) VALUES ('${projectId}', '${projectId}', 10, '${projectId}')`,
    );
    for (const [index, personId] of people.entries()) {
      const stepId = `${projectId}-s${String(index)}`;
      write(
        `INSERT INTO step (id, project_id, name, position) VALUES ('${stepId}', '${projectId}', '${stepId}', ${String(index)})`,
      );
      write(
        `INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('${projectId}', '${stepId}', 1, 1, 1)`,
      );
      write(
        `INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('${projectId}', '${stepId}', '${personId}')`,
      );
    }
  }
  write("UPDATE work_item SET start_no_earlier_than = '2026-10-07' WHERE id = 'a3'");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function snapshots(
  afterFirstRead = () => Promise.resolve(),
  afterAuthority = () => Promise.resolve(),
): ChainSnapshotRepository {
  return new ChainSnapshotRepository(
    {
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
      activeOrganizationOf: () => async () => {
        await afterAuthority();
        return 'org-a';
      },
      optimization: { contractVersion: '15+0.2.0', budgetMs: 1000, now: () => 100 },
      schedulerOf: (readCaptured) =>
        createScheduler(
          (rows, edges, slices, floors, pools, reach, deadlines, typed, elsewhere) =>
            schedule(
              rows,
              edges,
              slices,
              floors,
              pools,
              reach,
              deadlines,
              typed,
              undefined,
              elsewhere,
            ),
          readCaptured === undefined
            ? undefined
            : {
                readCaptured,
                readLive: () => {
                  throw new Error('live read inside snapshot');
                },
              },
        ),
    },
    { afterFirstRead },
  );
}

async function start(reader = new SharedPeopleReader(snapshots())) {
  const answer = await reader.read('a3', principal);
  if (
    !answer.ok ||
    answer.value.kind !== 'scheduled' ||
    answer.value.scheduled.kind !== 'scheduled'
  )
    throw new Error('expected scheduled chain');
  return answer.value.scheduled.fast.slices.get(sliceKey('a3', 'a3-s0'))?.earliestStart;
}

function savedService(chain: SharedPeopleReader) {
  return new SavedPlanService({
    digest: nodeDigest,
    newId: () => 'saved-chain',
    now: () => 100,
    resource: new SavedPlanResource({
      digest: nodeDigest,
      capture: new SavedPlanCaptureRepository({ openConnection: () => openConnection(path) }),
      plans: new SavedPlanRepository({ openConnection: () => openConnection(path) }),
    }),
    scheduler: fast,
    captureSharedPlan: async (projectId) => {
      const answer = await chain.read(projectId, principal);
      if (!answer.ok) throw new Error(answer.refusal);
      return answer.value;
    },
  });
}

async function failureOf(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (failure) {
    if (!(failure instanceof Error)) throw failure;
    return failure;
  }
  throw new Error('expected operation to throw');
}

describe('the chain snapshot', () => {
  it('shared runtime selects mode within its authorized snapshot', async () => {
    expect(await start()).toBe(3);
    write("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
    const isolated = await new SharedPeopleReader(snapshots()).read('a3', principal);
    if (!isolated.ok || isolated.value.kind !== 'scheduled') throw new Error('expected isolated');
    expect(isolated.value.influencers).toEqual([]);
    expect(canonicalScheduleInput(isolated.value.input)).toBe(
      canonicalScheduleInput(scheduleInputOfCaptured(isolated.value.reads)),
    );
    expect(await start()).toBe(2);
    write("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    write('DROP TRIGGER organization_activation_no_revert');
    write("UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL");
    const legacy = await new SharedPeopleReader(snapshots()).read('a3', principal);
    if (!legacy.ok || legacy.value.kind !== 'scheduled') throw new Error('expected legacy');
    expect(legacy.value.influencers).toEqual([]);
    expect(canonicalScheduleInput(legacy.value.input)).toBe(
      canonicalScheduleInput(isolated.value.input),
    );
  });

  it('resolves background reads from actual ownership and activation', async () => {
    const reader = new SharedPeopleReader(snapshots());
    write("DELETE FROM organization_membership WHERE user_id = 'ada'");
    expect(await reader.read('a3', principal)).toEqual({ ok: false, refusal: 'not_a_member' });
    const shared = await reader.readProject('a3');
    if (shared.kind !== 'scheduled' || shared.scheduled.kind !== 'scheduled')
      throw new Error('expected shared');
    expect(shared.influencers.map((each) => each.projectId)).toEqual(['a1', 'a2']);
    expect(await reader.readProject('absent')).toEqual({ kind: 'not_found' });
    write('DROP TRIGGER project_organization_frozen_update');
    write("UPDATE project_organization SET organization_id = 'org-b' WHERE resource_id = 'a3'");
    expect((await failureOf(reader.readProject('a3'))).message).toContain(
      'references outside its organization',
    );
    write('DROP TRIGGER organization_activation_no_revert');
    write("UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL");
    const legacy = await reader.readProject('a3');
    if (legacy.kind !== 'scheduled') throw new Error('expected legacy');
    expect(legacy.influencers).toEqual([]);
    expect(canonicalScheduleInput(legacy.input)).toBe(
      canonicalScheduleInput(scheduleInputOfCaptured(legacy.reads)),
    );
  });

  it('refuses corrupt mode and broken background ownership', async () => {
    const reader = new SharedPeopleReader(snapshots());
    expect(await start(reader)).toBe(3);
    const client = openDatabase(path);
    try {
      client.run('PRAGMA ignore_check_constraints = ON');
      client.run("UPDATE organization SET shared_people = 7 WHERE id = 'org-a'");
    } finally {
      client.close();
    }
    expect((await failureOf(reader.read('a3', principal))).message).toContain(
      'invalid stored shared_people',
    );
    expect((await failureOf(reader.readProject('a3'))).message).toContain(
      'invalid stored shared_people',
    );
    write("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    write('DROP TRIGGER project_organization_frozen_delete');
    write("DELETE FROM project_organization WHERE resource_id = 'a3'");
    expect((await failureOf(reader.readProject('a3'))).message).toContain(
      'project ownership is absent',
    );
  });

  it('borrows staged mode without committing or closing the caller transaction', async () => {
    const connection = openConnection(path);
    const transaction = drizzleReadTransaction(connection.db);
    transaction.begin();
    try {
      connection.db.run(sql`UPDATE organization SET shared_people = 0 WHERE id = 'org-a'`);
      const readable = await new ProjectRepository(connection.db, OPEN).listForInOrganization(
        'ada',
        'org-a',
      );
      const snapshot = await readChainSnapshotIn(
        connection.db,
        { kind: 'scoped', scope: { organizationId: 'org-a' } },
        readable,
        'a3',
        { schedulerOf: () => fast },
      );
      const isolated = await readChain(snapshot, 'a3');
      if (isolated.kind !== 'scheduled') throw new Error('expected isolated staged read');
      expect(isolated.influencers).toEqual([]);
      expect(canonicalScheduleInput(isolated.input)).toBe(
        canonicalScheduleInput(scheduleInputOfCaptured(isolated.reads)),
      );
      transaction.rollback();
      expect(await start()).toBe(3);
    } finally {
      connection.close();
    }
  });

  it('refuses a broken project-owned readable dependency', async () => {
    const broken = spyOn(ProjectRepository.prototype, 'findInOrganization').mockResolvedValue(null);
    try {
      expect(
        (await failureOf(new SharedPeopleReader(snapshots()).readProject('a3'))).message,
      ).toContain('rank names an unreadable project');
      expect(closed).toBe(1);
    } finally {
      broken.mockRestore();
    }
  });

  it('never materializes upstream assignments for isolated or legacy targets', async () => {
    write("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
    const original = Object.getOwnPropertyDescriptor(
      DirectoryRepository.prototype,
      'assignmentsInProject',
    )?.value as DirectoryRepository['assignmentsInProject'];
    const blocked = spyOn(DirectoryRepository.prototype, 'assignmentsInProject').mockImplementation(
      function (this: DirectoryRepository, projectId) {
        if (projectId !== 'a3') throw new Error('upstream isolated assignment read');
        return original.call(this, projectId);
      },
    );
    try {
      expect(await start()).toBe(2);
      const background = await new SharedPeopleReader(snapshots()).readProject('a3');
      expect(background.kind).toBe('scheduled');
      write('DROP TRIGGER organization_activation_no_revert');
      write("UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL");
      expect(await start()).toBe(2);
      expect((await new SharedPeopleReader(snapshots()).readProject('a3')).kind).toBe('scheduled');
    } finally {
      blocked.mockRestore();
    }
  });

  it('never lists organization projects or ranks for isolated or legacy targets', async () => {
    write("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
    const blocked = ['list', 'listFor', 'listForInOrganization'].map((method) =>
      spyOn(ProjectRepository.prototype, method as 'list').mockImplementation(() => {
        throw new Error('isolated project list');
      }),
    );
    const rank = spyOn(ProjectRankRepository.prototype, 'orderIn').mockImplementation(() => {
      throw new Error('isolated rank list');
    });
    try {
      expect(await start()).toBe(2);
      expect((await new SharedPeopleReader(snapshots()).readProject('a3')).kind).toBe('scheduled');
      write('DROP TRIGGER organization_activation_no_revert');
      write("UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL");
      expect(await start()).toBe(2);
      expect((await new SharedPeopleReader(snapshots()).readProject('a3')).kind).toBe('scheduled');
    } finally {
      for (const blockedList of blocked) blockedList.mockRestore();
      rank.mockRestore();
    }
  });

  it('reads mode on the authorized connection before a concurrent authority-bound edit', async () => {
    let edited = false;
    const reader = new SharedPeopleReader(
      snapshots(undefined, () => {
        if (!edited) {
          edited = true;
          write("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
        }
        return Promise.resolve();
      }),
    );
    expect(await start(reader)).toBe(3);
    expect(await start()).toBe(2);
  });

  it('keeps background mode assignments and dates coherent and closes on throw', async () => {
    let edited = false;
    const reader = new SharedPeopleReader(
      snapshots(() => {
        if (!edited) {
          edited = true;
          write("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
          write("UPDATE assignment SET person_id = 'ben' WHERE work_item_id = 'a1'");
          write("UPDATE project SET start_date = '2026-10-12' WHERE id = 'a2'");
        }
        return Promise.resolve();
      }),
    );
    const shared = await reader.readProject('a3');
    if (shared.kind !== 'scheduled' || shared.scheduled.kind !== 'scheduled')
      throw new Error('expected shared background');
    expect(shared.scheduled.fast.slices.get(sliceKey('a3', 'a3-s0'))?.earliestStart).toBe(3);
    expect(closed).toBe(1);
    const broken = new SharedPeopleReader(
      snapshots(() => {
        throw new Error('background capture fault');
      }),
    );
    expect((await failureOf(broken.readProject('a3'))).message).toContain(
      'background capture fault',
    );
    expect(closed).toBe(2);
  });

  it('refuses writes through the production read-only factory', async () => {
    const store = createChainSnapshotStore({
      dbPath: path,
      schedulerOf: () => fast,
      activeOrganizationOf: (db) => async () => {
        db.run(sql`UPDATE project SET name = 'unsafe' WHERE id = 'a4'`);
        return Promise.resolve('org-a');
      },
    });
    expect(
      (await failureOf(store.withSnapshot(principal, 'a3', () => ({ kind: 'not_found' })))).cause,
    ).toMatchObject({ code: 'SQLITE_READONLY' });
    const client = openDatabase(path);
    try {
      expect(client.query("SELECT name FROM project WHERE id = 'a4'").get()).toEqual({
        name: 'a4',
      });
    } finally {
      client.close();
    }
  });

  it('refuses a borrowed capture capability outside its readable project list', async () => {
    expect(
      (
        await failureOf(
          snapshots().withSnapshot(principal, 'a3', (snapshot) =>
            snapshot.capturePlan('b1').then(() => ({ kind: 'not_found' as const })),
          ),
        )
      ).message,
    ).toContain('chain capture names an unreadable project');
    expect(closed).toBe(1);
  });

  it('throws when rank and its trusted readable-list dependency disagree', async () => {
    const broken = spyOn(ProjectRepository.prototype, 'listForInOrganization').mockResolvedValue(
      [],
    );
    try {
      expect(
        (await failureOf(snapshots().withSnapshot(principal, 'a3', () => ({ kind: 'not_found' }))))
          .message,
      ).toContain('rank names an unreadable project');
      expect(closed).toBe(1);
    } finally {
      broken.mockRestore();
    }
  });

  it('throws when its trusted capture dependency loses a ranked project', async () => {
    const broken = spyOn(ProjectRepository.prototype, 'findInOrganization').mockResolvedValue(null);
    try {
      expect(
        (await failureOf(new SharedPeopleReader(snapshots()).read('a3', principal))).message,
      ).toContain('ranked project disappeared inside its snapshot');
      expect(closed).toBe(1);
    } finally {
      broken.mockRestore();
    }
  });

  it('schedules transitive bookings and closes with no runtime writes', async () => {
    expect(await start()).toBe(3);
    expect(closed).toBe(1);
    const client = openDatabase(path);
    try {
      for (const table of ['optimization_generation', 'solver_slot', 'solver_queue', 'event_log'])
        expect(client.query(`SELECT * FROM ${table}`).all()).toEqual([]);
    } finally {
      client.close();
    }
  });

  it('keeps concurrent rank, assignment and date edits outside its snapshot', async () => {
    let edited = false;
    const reader = new SharedPeopleReader(
      snapshots(() => {
        if (edited) return Promise.resolve();
        edited = true;
        write("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
        write("UPDATE assignment SET person_id = 'ben' WHERE work_item_id = 'a1'");
        write("UPDATE project SET start_date = '2026-10-12' WHERE id = 'a2'");
        write(
          "INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES ('a3', 'org-a', 1, 1, 'ada')",
        );
        return Promise.resolve();
      }),
    );
    expect(await start(reader)).toBe(3);
    expect(await start()).toBe(2);
    expect(closed).toBe(2);
  });

  it('selects cache publication from the same snapshot and never calls live admission', async () => {
    write(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = 'a1'",
    );
    write("UPDATE work_item SET start_no_earlier_than = '2026-10-06' WHERE id = 'a2'");
    write("UPDATE work_item SET start_no_earlier_than = '2026-10-08' WHERE id = 'a3'");
    let published = false;
    const capture = new SavedPlanCaptureRepository({ openConnection: () => openConnection(path) });
    const reads = await capture.readPlanInput('a1');
    if (reads === null) throw new Error('missing influencer');
    const input = scheduleInputOfCaptured(reads);
    const planned = schedule(
      input.rows,
      input.edges,
      input.slices,
      new Map([['a1', 1]]),
      input.poolSizes,
      input.reach,
      input.deadlines,
      input.typed,
    );
    const reader = new SharedPeopleReader(
      snapshots(() => {
        if (published) return Promise.resolve();
        published = true;
        const connection = openConnection(path);
        try {
          const inputHash = scheduleInputHash(input);
          const generation = allocateGeneration(connection.db, 'a1', '15+0.2.0', inputHash, 1);
          connection.db
            .insert(optimizedScheduleCache)
            .values({
              projectId: 'a1',
              inputHash,
              generation,
              contractVersion: '15+0.2.0',
              budgetMs: 1000,
              objective: 'pri',
              status: 'ok',
              failureReason: null,
              createdAt: 1,
              resultJson: JSON.stringify(
                encodeOptimizedResult({
                  publication: 'solver',
                  objectiveValues: {
                    makespan: { value: 5, stageValue: 5, bound: 5, status: 'optimal' },
                    priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                    movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                  },
                  schedule: planned,
                }),
              ),
            })
            .run();
        } finally {
          connection.close();
        }
        return Promise.resolve();
      }),
    );
    expect(await start(reader)).toBe(3);
    expect(await start()).toBe(4);
    expect(closed).toBe(2);
    write(
      "UPDATE optimized_schedule_cache SET status = 'failed', failure_reason = 'timeout', result_json = NULL WHERE project_id = 'a1'",
    );
    expect(await start()).toBe(3);
  });

  it('refuses removed membership and foreign targets without naming them', async () => {
    const reader = new SharedPeopleReader(snapshots());
    expect(await reader.read('b1', principal)).toEqual({ ok: true, value: { kind: 'not_found' } });
    write("DELETE FROM organization_membership WHERE user_id = 'ada'");
    expect(await reader.read('a3', principal)).toEqual({ ok: false, refusal: 'not_a_member' });
    expect(closed).toBe(2);
  });

  it('keeps pending target optimization absent under the saved S4 policy', async () => {
    write(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = 'a3'",
    );
    const saved = savedService(new SharedPeopleReader(snapshots()));
    const written = await saved.save({
      projectId: 'a3',
      createdBy: 'Ada',
      createdById: 'ada',
      access: admitted,
    });
    expect(written.outcome).toBe('saved');
    if (written.outcome !== 'saved') throw new Error('expected saved target');
    expect(written.record.schedule).toEqual({ present: false, absentReason: 'pending' });
    const client = openDatabase(path);
    try {
      for (const table of ['optimization_generation', 'solver_slot', 'solver_queue', 'event_log'])
        expect(client.query(`SELECT * FROM ${table}`).all()).toEqual([]);
    } finally {
      client.close();
    }
  });

  it('keeps an unrepresentable shared target infeasible under the saved S4 policy', async () => {
    write(
      "UPDATE estimate SET optimistic = 80000000, realistic = 80000000, pessimistic = 80000000 WHERE work_item_id = 'a3'",
    );
    const written = await savedService(new SharedPeopleReader(snapshots())).save({
      projectId: 'a3',
      createdBy: 'Ada',
      createdById: 'ada',
      access: admitted,
    });
    if (written.outcome !== 'saved') throw new Error('expected saved target');
    expect(written.record.schedule).toEqual({ present: false, absentReason: 'infeasible' });
  });

  it('uses ranked ties before the unranked tail', async () => {
    write(
      "INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES ('a2', 'org-a', 10, 1, 'ada'), ('a1', 'org-a', 10, 1, 'ada')",
    );
    const answer = await new SharedPeopleReader(snapshots()).read('a3', principal);
    if (!answer.ok || answer.value.kind !== 'scheduled') throw new Error('expected target');
    expect(answer.value.influencers.map((each) => each.projectId)).toEqual(['a1', 'a2']);
    expect(await start()).toBe(3);
  });

  it('rejects a crossing assignee and captures only organization-local directory entries', async () => {
    write("INSERT INTO person (id, name) VALUES ('foreign', 'Foreign')");
    write(
      "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('foreign', 'org-b', 'Foreign')",
    );
    const reader = new SharedPeopleReader(snapshots());
    const answer = await reader.read('a3', principal);
    if (!answer.ok || answer.value.kind !== 'scheduled') throw new Error('expected target');
    expect(answer.value.reads.people.map((each) => each.id)).toEqual(['ana', 'ben']);
    write("UPDATE assignment SET person_id = 'foreign' WHERE work_item_id = 'a3'");
    expect((await failureOf(reader.read('a3', principal))).message).toContain(
      'references outside its organization',
    );
  });

  it('stores detached shared dates that survive upstream edits and deletion', async () => {
    const chain = new SharedPeopleReader(snapshots());
    const saved = savedService(chain);
    const written = await saved.save({
      projectId: 'a3',
      createdBy: 'Ada',
      createdById: 'ada',
      access: admitted,
    });
    expect(written.outcome).toBe('saved');
    if (written.outcome !== 'saved' || !written.record.schedule.present)
      throw new Error('expected saved dates');
    expect(written.record.schedule.body.bytes).toContain('"earliestStart":3');
    const current = await saved.projectCurrentPlan('a3', admitted);
    if (!current?.schedule.present) throw new Error('expected current dates');
    expect(JSON.stringify(current.schedule.body)).toContain('"earliestStart":3');
    const bytes = written.record.schedule.body.bytes;
    write("UPDATE estimate SET realistic = 9 WHERE work_item_id = 'a1'");
    write("DELETE FROM assignment WHERE work_item_id = 'a1'");
    write("DELETE FROM estimate WHERE work_item_id = 'a1'");
    write("DELETE FROM work_item WHERE project_id = 'a1'");
    write("DELETE FROM step WHERE project_id = 'a1'");
    write("DELETE FROM project WHERE id = 'a1'");
    const read = await saved.read('saved-chain');
    expect(read.outcome).toBe('read');
    if (read.outcome !== 'read' || !read.plan.schedule.present)
      throw new Error('expected historical dates');
    expect(read.plan.schedule.body.bytes).toBe(bytes);
  });

  it('closes and preserves a concurrent committed edit when capture throws', async () => {
    const reader = new SharedPeopleReader(
      snapshots(() => {
        write("UPDATE project SET name = 'survives' WHERE id = 'a4'");
        throw new Error('injected capture failure');
      }),
    );
    expect((await failureOf(reader.read('a3', principal))).message).toContain(
      'injected capture failure',
    );
    expect(closed).toBe(1);
    const client = openDatabase(path);
    try {
      expect(client.query("SELECT name FROM project WHERE id = 'a4'").get()).toEqual({
        name: 'survives',
      });
    } finally {
      client.close();
    }
  });
});

describe('detached live snapshot guards', () => {
  function livePlans() {
    return createLivePlanStore({
      kind: 'owned',
      openConnection: () => {
        const connection = openReadOnlyConnection(path);
        return {
          ...connection,
          close() {
            try {
              connection.db.run(sql`BEGIN`);
              connection.db.run(sql`ROLLBACK`);
              closed++;
            } finally {
              connection.close();
            }
          },
        };
      },
      schedulerOf: () => fast,
    });
  }
  const access = {
    kind: 'scoped',
    scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
  } as const;
  it('refuses a legacy aggregate read after activation', async () => {
    expect(await livePlans().readAggregate('ada', { kind: 'legacy' })).toEqual({
      kind: 'access_refused',
      refusal: 'no_active_organization',
    });
  });
  it('reuses captured scheduling across aggregate target closures', async () => {
    let schedules = 0;
    const store = createLivePlanStore({
      kind: 'owned',
      openConnection: () => openReadOnlyConnection(path),
      schedulerOf: () => ({
        supports: (engine) => fast.supports(engine),
        read: (ask) => {
          schedules++;
          return fast.read(ask);
        },
      }),
    });
    const observed = await store.readAggregate('ada', access);
    expect(observed.kind).toBe('shared');
    if (observed.kind !== 'shared') throw new Error('aggregate observation unavailable');
    expect(observed.entries.map(({ plan }) => plan.project.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(schedules).toBe(4);
  });
  it('keeps the incoming basis and full input identity across rename and unrelated rank changes', async () => {
    const store = livePlans();
    const target = async () => {
      const observed = await store.readAggregate('ada', access);
      if (observed.kind !== 'shared') throw new Error('aggregate observation unavailable');
      const entry = observed.entries.find(({ plan }) => plan.project.id === 'a3');
      if (entry?.plan.chain.kind !== 'scheduled') throw new Error('target schedule unavailable');
      return { basis: entry.basis, inputHash: scheduleInputHash(entry.plan.chain.input) };
    };
    const before = await target();
    write("UPDATE project SET name = 'Renamed A' WHERE id = 'a1'");
    write("UPDATE project_rank SET position = 25 WHERE project_id = 'a4'");
    expect(await target()).toEqual(before);
    write("UPDATE project SET start_date = '2026-10-06' WHERE id = 'a1'");
    const moved = await target();
    expect(moved.basis).not.toBe(before.basis);
    expect(moved.inputHash).not.toBe(before.inputHash);
  });
  it('closes its owned connection after successful detached projection', async () => {
    expect((await livePlans().read('a3', access)).kind).toBe('shared');
    expect(closed).toBe(1);
  });
  it('closes its owned connection after authorization refusal', async () => {
    write("DELETE FROM organization_membership WHERE user_id = 'ada'");
    expect(await livePlans().read('a3', access)).toEqual({
      kind: 'access_refused',
      refusal: 'not_a_member',
    });
    expect(closed).toBe(1);
  });
  it('closes its owned connection after dependency failure', async () => {
    const broken = spyOn(ProjectRankRepository.prototype, 'orderIn').mockImplementation(() =>
      Promise.reject(new Error('injected rank failure')),
    );
    try {
      expect((await failureOf(livePlans().read('a3', access))).message).toBe(
        'injected rank failure',
      );
      expect(closed).toBe(1);
    } finally {
      broken.mockRestore();
    }
  });
  it('rejects an unreadable ranked live project', async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- fault calls original with the actual repository receiver.
    const original = ProjectRepository.prototype.findInOrganization;
    const broken = spyOn(ProjectRepository.prototype, 'findInOrganization').mockImplementation(
      function (this: ProjectRepository, projectId, organizationId) {
        return projectId === 'a1'
          ? Promise.resolve(null)
          : original.call(this, projectId, organizationId);
      },
    );
    try {
      expect((await failureOf(livePlans().read('a3', access))).message).toBe(
        'rank names an unreadable project',
      );
    } finally {
      broken.mockRestore();
    }
  });
  it('rejects a live target omitted by its rank dependency', async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- fault calls original with the actual repository receiver.
    const original = ProjectRankRepository.prototype.orderIn;
    const broken = spyOn(ProjectRankRepository.prototype, 'orderIn').mockImplementation(
      async function (this: ProjectRankRepository, organizationId) {
        return (await original.call(this, organizationId)).filter(
          (ranked) => ranked.projectId !== 'a3',
        );
      },
    );
    try {
      expect((await failureOf(livePlans().read('a3', access))).message).toBe(
        'live target disappeared inside its snapshot',
      );
    } finally {
      broken.mockRestore();
    }
  });
});
