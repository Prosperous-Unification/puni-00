import { encodeOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import { readSharedPeople, scheduleInputOfCaptured } from '@wbs/core';
import { ProjectService } from '@wbs/core/module/project/project.resource';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { schedule } from '@wbs/domain';
import { openConnection, openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { allocateGeneration } from '@wbs/store-sqlite/optimization-generation';
import { enqueueSolverRequest } from '@wbs/store-sqlite/optimization-queue';
import { SavedPlanCaptureRepository } from '@wbs/store-sqlite/saved-plan-capture';
import { scheduleInputHash } from '@wbs/store-sqlite/schedule-input-hash';
import { optimizedScheduleCache } from '@wbs/store-sqlite/schema';
import { WorkItemRepository } from '@wbs/store-sqlite/work-item';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import type { ReservedSpawner, ReservedSpawnRequest } from '../module/optimization/contract';
import { OptimizationCoordinator } from '../module/optimization/optimization.feature';
import { fastScheduler } from '../service/optimizer-wiring';
import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The schedule read (`GET /api/projects/:id/work-items`) under organization
 * isolation (task 3.3), over real SQLite and the production organization
 * access; see {@link OrganizationHarness}.
 *
 * Dependent rows are seeded as SQL: the writes that would refuse them are
 * task 3.4's. A coherent project holds one row of every schedule relation
 * inside its organization; each crossing case adds one row that leaves it.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
let ownStep: string;
let foreignStep: string;

beforeEach(async () => {
  h = OrganizationHarness.open();
  for (const username of ['ada', 'grace', 'vic', 'nell']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-a', 'vic', 'viewer');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('vic', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
  own = await create('ada', 'A plan');
  foreign = await create('grace', 'B plan');
  ownStep = await firstStep('ada', own);
  foreignStep = await firstStep('grace', foreign);
  for (const [org, project] of [
    ['a', own],
    ['b', foreign],
  ] as const) {
    seedCatalogs(org);
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES (?, ?, NULL, 0, ?)',
      [`w-${org}`, project, 'Root'],
    );
    h.sqlite.run(
      'INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES (?, ?, ?, 0, ?)',
      [`w2-${org}`, project, `w-${org}`, 'Child'],
    );
  }
  seedCoherentLinks();
});

afterEach(() => {
  h.close();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

async function firstStep(username: string, projectId: string): Promise<string> {
  const answer = await h.call(username, 'GET', `/api/projects/${projectId}`);
  const step = (answer.body as { steps: { id: string }[] }).steps.at(0);
  if (step === undefined) throw new Error('the project started with no step');
  return step.id;
}

/** One entry of every catalog, owned by organization `org`. */
function seedCatalogs(org: 'a' | 'b'): void {
  for (const [root, side, id] of [
    ['person', 'person_organization', `pe-${org}`],
    ['service_team', 'service_team_organization', `tm-${org}`],
    ['service', 'service_organization', `sv-${org}`],
    ['tag', 'tag_organization', `tg-${org}`],
    ['work_item_type', 'work_item_type_organization', `ty-${org}`],
    ['external_system', 'external_system_organization', `es-${org}`],
  ] as const) {
    h.sqlite.run(`INSERT INTO ${root} (id, name) VALUES (?, ?)`, [id, `root-${id}`]);
    h.sqlite.run(`INSERT INTO ${side} (resource_id, organization_id, name) VALUES (?, ?, ?)`, [
      id,
      `org-${org}`,
      id,
    ]);
  }
}

/** Every schedule relation of the own project, inside its organization. */
function seedCoherentLinks(): void {
  for (const statement of [
    `INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('w2-a', '${ownStep}', 1, 2, 3)`,
    `INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('w2-a', '${ownStep}', 'pe-a')`,
    "INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w2-a', 'tg-a')",
    "INSERT INTO work_item_team (work_item_id, team_id) VALUES ('w2-a', 'tm-a')",
    "INSERT INTO work_item_work_item_type (work_item_id, type_id) VALUES ('w2-a', 'ty-a')",
    "INSERT INTO work_item_service (work_item_id, service_id) VALUES ('w2-a', 'sv-a')",
    "INSERT INTO work_item_external_ref (id, work_item_id, system_id, url, name, position) VALUES ('x-a', 'w2-a', 'es-a', 'https://x', 'X', 0)",
    "UPDATE work_item SET service_team_id = 'tm-a', service_id = 'sv-a' WHERE id = 'w2-a'",
    `INSERT INTO project_team_capacity (project_id, service_team_id, size) VALUES ('${own}', 'tm-a', 1)`,
  ]) {
    h.sqlite.run(statement);
  }
}

/** One crossing row per relation the schedule read follows, by the kind it is reported as. */
function crossings(): Record<string, string> {
  return {
    estimate_step: `INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('w-a', '${foreignStep}', 1, 2, 3)`,
    actual_step: `INSERT INTO actual (work_item_id, step_id, days, recorded_at) VALUES ('w2-a', '${foreignStep}', 1, 1)`,
    step_progress_step: `INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES ('w2-a', '${foreignStep}', 'done', 1)`,
    step_measure_step: `INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at) VALUES ('w2-a', '${foreignStep}', 'hours_actual', 1, 1)`,
    assignment_step: `INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('w-a', '${foreignStep}', 'pe-a')`,
    assignment_person: `INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('w-a', '${ownStep}', 'pe-b')`,
    work_item_tag: "INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w-a', 'tg-b')",
    work_item_team: "INSERT INTO work_item_team (work_item_id, team_id) VALUES ('w-a', 'tm-b')",
    work_item_type:
      "INSERT INTO work_item_work_item_type (work_item_id, type_id) VALUES ('w-a', 'ty-b')",
    work_item_service_link:
      "INSERT INTO work_item_service (work_item_id, service_id) VALUES ('w-a', 'sv-b')",
    work_item_external_ref:
      "INSERT INTO work_item_external_ref (id, work_item_id, system_id, url, name, position) VALUES ('x-b', 'w-a', 'es-b', 'https://x', 'X', 1)",
    work_item_service_team: "UPDATE work_item SET service_team_id = 'tm-b' WHERE id = 'w-a'",
    work_item_service: "UPDATE work_item SET service_id = 'sv-b' WHERE id = 'w-a'",
    work_item_parent: "UPDATE work_item SET parent_id = 'w-b' WHERE id = 'w2-a'",
    dependency_endpoint: `INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES ('d-x', '${own}', 'w-a', 'w-b')`,
    project_team_capacity: `INSERT INTO project_team_capacity (project_id, service_team_id, size) VALUES ('${own}', 'tm-b', 1)`,
  };
}

describe('before activation', () => {
  it('reads any project deployment-wide, crossing rows and all', async () => {
    h.close();
    h = OrganizationHarness.open();
    for (const username of ['ada', 'grace']) await h.register(username);
    const theirs = await create('ada', 'Legacy plan');
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-l', ?, NULL, 0, 'Root')",
      [theirs],
    );
    // A crossing row: a label no organization owns, which any scoped read
    // would refuse. (A per-step row on another project's step no longer
    // serves: since 010.4.5 the legacy read itself fails on a step it cannot
    // find an allowance for.)
    h.sqlite.run("INSERT INTO tag (id, name) VALUES ('t-l', 'unowned')");
    h.sqlite.run("INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w-l', 't-l')");
    expect((await h.call('grace', 'GET', `/api/projects/${theirs}/work-items`)).status).toBe(200);
  });
});

describe('after activation', () => {
  it('reads a coherent own project, to viewers too', async () => {
    const answer = await h.call('ada', 'GET', `/api/projects/${own}/work-items`);
    expect(answer.status).toBe(200);
    expect((await h.call('vic', 'GET', `/api/projects/${own}/work-items`)).status).toBe(200);
    expect((await h.call('ada', 'GET', `/api/projects/${own}/export?format=markdown`)).status).toBe(
      200,
    );
  });

  it("shows assignees under the organization's own names", async () => {
    const answer = await h.call('ada', 'GET', `/api/projects/${own}/work-items`);
    expect((answer.body as { assignedPeople: unknown }).assignedPeople).toEqual([
      { id: 'pe-a', name: 'pe-a' },
    ]);
  });

  it('answers 404 alike for a foreign and an absent project', async () => {
    for (const tail of ['work-items', 'step-references?reference=1.dev&revision=r']) {
      const toForeign = await h.call('ada', 'GET', `/api/projects/${foreign}/${tail}`);
      expect({ tail, ...toForeign }).toEqual({ tail, status: 404, body: { error: 'not_found' } });
      expect(await h.call('ada', 'GET', `/api/projects/missing/${tail}`)).toEqual(toForeign);
    }
  });

  it('refuses an unbound session and a removed member before any lookup', async () => {
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
    for (const path of [
      `/api/projects/${own}/work-items`,
      '/api/projects/missing/work-items',
      `/api/projects/${own}/step-references?reference=1.dev&revision=r`,
    ]) {
      expect(await h.call('ada', 'GET', path)).toEqual({
        status: 403,
        body: { error: 'not_a_member' },
      });
      expect(await h.call('nell', 'GET', path)).toEqual({
        status: 403,
        body: { error: 'no_active_organization' },
      });
    }
  });

  for (const [kind] of Object.entries(crossings()))
    it(`fails the schedule read closed over a crossing ${kind}`, async () => {
      // Read again inside the case: the ids it names are this case's own.
      const statement = new Map(Object.entries(crossings())).get(kind);
      if (statement === undefined) throw new Error(`no crossing seeded for ${kind}`);
      h.sqlite.run(statement);
      expect((await h.call('ada', 'GET', `/api/projects/${own}/work-items`)).status).toBe(500);
    });

  it('fails closed over a catalog entry the organization does not own at all', async () => {
    h.sqlite.run("INSERT INTO tag (id, name) VALUES ('tg-x', 'unowned')");
    h.sqlite.run("INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w-a', 'tg-x')");
    expect((await h.call('ada', 'GET', `/api/projects/${own}/work-items`)).status).toBe(500);
  });

  it('fails the export and the optimizer retry closed over a crossing row', async () => {
    h.sqlite.run(crossings()['estimate_step']);
    expect((await h.call('ada', 'GET', `/api/projects/${own}/export?format=markdown`)).status).toBe(
      500,
    );
    expect(
      (
        await h.call('ada', 'POST', `/api/projects/${own}/optimization/retry`, {
          objective: 'pri',
          inputHash: 'h',
        })
      ).status,
    ).toBe(500);
  });
});

describe('shared live projection', () => {
  it('installed saved capture and current comparison retain their own shared chain', async () => {
    const { higher, lower } = await seedSharedPlans();
    const saved = await h.call('ada', 'POST', `/api/projects/${lower}/saved-plans`, {
      name: 'Before upstream edit',
    });
    expect(saved.status).toBe(201);
    const savedId = (saved.body as { savedPlan: { id: string } }).savedPlan.id;
    const first = await h.call('ada', 'GET', `/api/saved-plans/${savedId}`);
    expect(first.status).toBe(200);
    const firstPlan = (
      first.body as {
        savedPlan: {
          input: { bytes: string; sha256: string };
          schedule: { present: true; body: { bytes: string; sha256: string } };
        };
      }
    ).savedPlan;
    expect(firstPlan.schedule.present).toBe(true);
    expect(
      (
        JSON.parse(firstPlan.schedule.body.bytes) as {
          workItems: { 'lower-work': { earliestStart: number } };
        }
      ).workItems['lower-work'].earliestStart,
    ).toBe(3);
    const same = await h.call(
      'ada',
      'GET',
      `/api/projects/${lower}/saved-plans/compare?left=${savedId}&right=current`,
    );
    expect(same).toEqual({ status: 200, body: { diff: { input: [], schedule: [] } } });

    h.sqlite.run(
      'UPDATE estimate SET optimistic = 4, realistic = 4, pessimistic = 4 WHERE work_item_id = ?',
      ['higher-work'],
    );
    const changed = await h.call(
      'ada',
      'GET',
      `/api/projects/${lower}/saved-plans/compare?left=${savedId}&right=current`,
    );
    expect(changed.status).toBe(200);
    expect((changed.body as { diff: { schedule: unknown[] } }).diff.schedule).not.toEqual([]);
    const historical = await h.call('ada', 'GET', `/api/saved-plans/${savedId}`);
    expect((historical.body as { savedPlan: unknown }).savedPlan).toEqual(firstPlan);
    h.sqlite.run("DELETE FROM assignment WHERE work_item_id = 'higher-work'");
    const removed = await h.call(
      'ada',
      'GET',
      `/api/projects/${lower}/saved-plans/compare?left=${savedId}&right=current`,
    );
    expect(removed.status).toBe(200);
    const removedSchedule = (
      removed.body as {
        diff: { schedule: { path: string; left: unknown; right: unknown }[] };
      }
    ).diff.schedule;
    const removedHolder = removedSchedule.find((difference) =>
      difference.path.includes('elsewhereHolder'),
    );
    expect(removedHolder?.left).toEqual({ projectId: higher, workItemId: 'higher-work' });
    expect(removedHolder?.right).toBeNull();
    expect(
      removedSchedule.some(
        (difference) => difference.path.includes('earliestStart') && difference.right === 0,
      ),
    ).toBe(true);
    const reversed = await h.call(
      'ada',
      'GET',
      `/api/projects/${lower}/saved-plans/compare?left=current&right=${savedId}`,
    );
    expect(reversed.status).toBe(200);
    const reversedHolder = (
      reversed.body as { diff: { schedule: { path: string; left: unknown }[] } }
    ).diff.schedule.find((difference) => difference.path.includes('elsewhereHolder'));
    expect(reversedHolder?.left).toBeNull();
    h.sqlite.run("UPDATE work_item SET notes = 'updated' WHERE id = 'lower-work'");
    h.sqlite.run('UPDATE project SET restricted = 1 WHERE id = ?', [lower]);
    h.sqlite.run("DELETE FROM assignment WHERE work_item_id = 'lower-work'");
    const inputRemoved = await h.call(
      'ada',
      'GET',
      `/api/projects/${lower}/saved-plans/compare?left=${savedId}&right=current`,
    );
    expect(inputRemoved.status).toBe(200);
    const inputDifferences = (
      inputRemoved.body as {
        diff: { input: { left: unknown; right: unknown }[] };
      }
    ).diff.input;
    expect(inputDifferences.some((difference) => difference.right === null)).toBe(true);
    expect(inputDifferences.some((difference) => difference.left === '')).toBe(true);
    expect(inputDifferences.some((difference) => difference.left === false)).toBe(true);
    const inputReversed = await h.call(
      'ada',
      'GET',
      `/api/projects/${lower}/saved-plans/compare?left=current&right=${savedId}`,
    );
    expect(inputReversed.status).toBe(200);
    expect(
      (inputReversed.body as { diff: { input: { left: unknown }[] } }).diff.input.some(
        (difference) => difference.left === null,
      ),
    ).toBe(true);
    expect((await h.call('ada', 'GET', `/api/saved-plans/${savedId}`)).body).toEqual(first.body);
    expect(h.sqlite.query('SELECT * FROM optimization_generation').all()).toEqual([]);
    expect(h.sqlite.query('SELECT * FROM solver_slot').all()).toEqual([]);
    expect(h.sqlite.query('SELECT * FROM solver_queue').all()).toEqual([]);
  });

  it.each(['save', 'compare'] as const)(
    'rechecks admitted human authority inside shared %s capture',
    async (operation) => {
      let revoke = false;
      const { lower } = await seedSharedPlans(false, () => {
        if (!revoke) return;
        revoke = false;
        h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
      });
      let savedId = '';
      if (operation === 'compare') {
        const saved = await h.call('ada', 'POST', `/api/projects/${lower}/saved-plans`, {
          name: 'Before revocation',
        });
        expect(saved.status).toBe(201);
        savedId = (saved.body as { savedPlan: { id: string } }).savedPlan.id;
      }
      const before = h.sqlite.query('SELECT * FROM saved_plan ORDER BY id').all();
      revoke = true;
      const refused =
        operation === 'save'
          ? await h.call('ada', 'POST', `/api/projects/${lower}/saved-plans`, { name: 'Denied' })
          : await h.call(
              'ada',
              'GET',
              `/api/projects/${lower}/saved-plans/compare?left=${savedId}&right=current`,
            );
      expect(refused).toEqual({ status: 403, body: { error: 'not_a_member' } });
      expect(h.sqlite.query('SELECT * FROM saved_plan ORDER BY id').all()).toEqual(before);
    },
  );

  it.each([
    ['pending', 'target'],
    ['unavailable', 'upstream'],
    ['infeasible', 'cycle'],
    ['infeasible', 'calendar_range'],
  ] as const)('stores shared S4 %s for %s without live admission', async (reason, setting) => {
    const { higher, lower } = await seedSharedPlans(setting !== 'upstream');
    if (setting === 'target')
      h.sqlite.run(
        "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
        [lower],
      );
    if (setting === 'upstream')
      h.sqlite.run(
        "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
        [higher],
      );
    if (setting === 'cycle')
      h.sqlite.run(
        "INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES ('saved-cycle', ?, 'lower-work', 'lower-work')",
        [lower],
      );
    if (setting === 'calendar_range')
      h.sqlite.run(
        'UPDATE estimate SET optimistic = 80000000, realistic = 80000000, pessimistic = 80000000 WHERE work_item_id = ?',
        ['lower-work'],
      );
    const tables = [
      'optimization_generation',
      'optimized_schedule_cache',
      'solver_slot',
      'solver_queue',
    ];
    const before = tables.map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all());
    const saved = await h.call('ada', 'POST', `/api/projects/${lower}/saved-plans`, {
      name: `Shared ${reason}`,
    });
    expect(saved.status).toBe(201);
    const savedId = (saved.body as { savedPlan: { id: string } }).savedPlan.id;
    const read = await h.call('ada', 'GET', `/api/saved-plans/${savedId}`);
    expect(read.status).toBe(200);
    expect((read.body as { savedPlan: { schedule: unknown } }).savedPlan.schedule).toEqual({
      present: false,
      absentReason: reason,
    });
    expect(
      await h.call(
        'ada',
        'GET',
        `/api/projects/${lower}/saved-plans/compare?left=${savedId}&right=current`,
      ),
    ).toEqual({ status: 200, body: { diff: { input: [], schedule: [] } } });
    expect(tables.map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all())).toEqual(before);
  });

  it('stores the selected ready optimized schedule without admitting live work', async () => {
    const { higher, lower } = await seedSharedPlans(true, undefined, undefined, '0.2.0');
    const capture = new SavedPlanCaptureRepository({
      openConnection: () => openConnection(h.databasePath()),
    });
    const higherReads = await capture.readPlanInput(higher);
    const lowerReads = await capture.readPlanInput(lower);
    if (higherReads === null || lowerReads === null) throw new Error('missing ranked project');
    const chain = readSharedPeople([higherReads, lowerReads], lower, fastScheduler);
    if (chain.kind !== 'scheduled') throw new Error('missing shared target input');
    const input = chain.input;
    const optimized = schedule(
      input.rows,
      input.edges,
      input.slices,
      new Map([['lower-work', 8]]),
      input.poolSizes,
      input.reach,
      input.deadlines,
      input.typed,
      undefined,
      input.elsewhere,
    );
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [lower],
    );
    const connection = openConnection(h.databasePath());
    try {
      const inputHash = scheduleInputHash(input);
      const generation = allocateGeneration(connection.db, lower, '15+0.2.0', inputHash, 1);
      connection.db
        .insert(optimizedScheduleCache)
        .values({
          projectId: lower,
          inputHash,
          generation,
          contractVersion: '15+0.2.0',
          budgetMs: 60000,
          objective: 'pri',
          status: 'ok',
          failureReason: null,
          createdAt: 1,
          resultJson: JSON.stringify(
            encodeOptimizedResult({
              publication: 'solver',
              objectiveValues: {
                makespan: { value: 9, stageValue: 9, bound: 9, status: 'optimal' },
                priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
              },
              schedule: optimized,
            }),
          ),
        })
        .run();
    } finally {
      connection.close();
    }
    const tables = [
      'optimization_generation',
      'optimized_schedule_cache',
      'solver_slot',
      'solver_queue',
    ];
    const before = tables.map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all());
    const saved = await h.call('ada', 'POST', `/api/projects/${lower}/saved-plans`, {
      name: 'Selected optimized',
    });
    expect(saved.status).toBe(201);
    const savedId = (saved.body as { savedPlan: { id: string } }).savedPlan.id;
    const read = await h.call('ada', 'GET', `/api/saved-plans/${savedId}`);
    expect(read.status).toBe(200);
    const stored = (
      read.body as {
        savedPlan: { schedule: { present: true; algorithmId: string; body: { bytes: string } } };
      }
    ).savedPlan.schedule;
    expect(stored.present).toBe(true);
    expect(stored.algorithmId).toBe('optimized:15+0.2.0:pri:60000');
    expect(
      (JSON.parse(stored.body.bytes) as { workItems: { 'lower-work': { earliestStart: number } } })
        .workItems['lower-work'].earliestStart,
    ).toBe(8);
    expect(
      await h.call(
        'ada',
        'GET',
        `/api/projects/${lower}/saved-plans/compare?left=${savedId}&right=current`,
      ),
    ).toEqual({ status: 200, body: { diff: { input: [], schedule: [] } } });
    expect(tables.map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all())).toEqual(before);
  });

  it.each(['failed', 'corrupt'] as const)(
    'stores selected %s optimization as unavailable through installed capture',
    async (state) => {
      const { higher, lower } = await seedSharedPlans(true, undefined, undefined, '0.2.0');
      const capture = new SavedPlanCaptureRepository({
        openConnection: () => openConnection(h.databasePath()),
      });
      const higherReads = await capture.readPlanInput(higher);
      const lowerReads = await capture.readPlanInput(lower);
      if (higherReads === null || lowerReads === null) throw new Error('missing ranked project');
      const chain = readSharedPeople([higherReads, lowerReads], lower, fastScheduler);
      if (chain.kind !== 'scheduled') throw new Error('missing shared target input');
      const inputHash = scheduleInputHash(chain.input);
      h.sqlite.run(
        "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
        [lower],
      );
      const connection = openConnection(h.databasePath());
      try {
        const generation = allocateGeneration(connection.db, lower, '15+0.2.0', inputHash, 1);
        connection.db
          .insert(optimizedScheduleCache)
          .values({
            projectId: lower,
            inputHash,
            generation,
            contractVersion: '15+0.2.0',
            budgetMs: 60000,
            objective: 'pri',
            status: state === 'failed' ? 'failed' : 'ok',
            failureReason: state === 'failed' ? 'timeout' : null,
            createdAt: 1,
            resultJson: state === 'failed' ? null : '{not-json',
          })
          .run();
      } finally {
        connection.close();
      }
      const tables = [
        'optimization_generation',
        'optimized_schedule_cache',
        'solver_slot',
        'solver_queue',
      ];
      const before = tables.map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all());
      const saved = await h.call('ada', 'POST', `/api/projects/${lower}/saved-plans`, {
        name: `Selected ${state}`,
      });
      expect(saved.status).toBe(201);
      const savedId = (saved.body as { savedPlan: { id: string } }).savedPlan.id;
      const read = await h.call('ada', 'GET', `/api/saved-plans/${savedId}`);
      expect(read.status).toBe(200);
      expect((read.body as { savedPlan: { schedule: unknown } }).savedPlan.schedule).toEqual({
        present: false,
        absentReason: 'unavailable',
      });
      expect(
        await h.call(
          'ada',
          'GET',
          `/api/projects/${lower}/saved-plans/compare?left=${savedId}&right=current`,
        ),
      ).toEqual({ status: 200, body: { diff: { input: [], schedule: [] } } });
      expect(tables.map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all())).toEqual(before);
    },
  );

  it('shared tree and export agree', async () => {
    const { higher, lower, lowerStep } = await seedSharedPlans();
    h.sqlite.run('UPDATE project SET revision = 7 WHERE id = ?', [lower]);
    h.sqlite.run('INSERT INTO event_sequencer (subscription, next_seq) VALUES (?, 12)', [
      `project:${lower}`,
    ]);
    h.sqlite.run(
      "INSERT INTO actual (work_item_id, step_id, days, recorded_at) VALUES ('lower-work', ?, 0.5, 1)",
      [lowerStep],
    );
    h.sqlite.run(
      "INSERT INTO step_progress (work_item_id, step_id, state, stated_at) VALUES ('lower-work', ?, 'in_progress', 1)",
      [lowerStep],
    );
    h.sqlite.run(
      "INSERT INTO step_measure (work_item_id, step_id, metric, value, recorded_at) VALUES ('lower-work', ?, 'hours_actual', 4, 1)",
      [lowerStep],
    );
    const tree = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
    expect(tree.status).toBe(200);
    const plan = tree.body as {
      workItems: { schedule: { earliestStart: number; earliestFinish: number } }[];
      slices: { elsewhereHolder?: { projectId: string; workItemId: string } }[];
      waitingElsewhere?: number;
      assignedPeople: { id: string; name: string }[];
    };
    expect(plan.workItems[0]?.schedule).toMatchObject({ earliestStart: 3, earliestFinish: 4 });
    expect(plan.slices[0]?.elsewhereHolder).toEqual({
      projectId: higher,
      workItemId: 'higher-work',
    });
    expect(plan.waitingElsewhere).toBe(1);
    expect(tree.body).toMatchObject({
      seq: 11,
      projectRevision: 7,
      workItems: [
        {
          actuals: { [lowerStep]: 0.5 },
          progress: { [lowerStep]: 'in_progress' },
          measures: { hours_actual: { [lowerStep]: 4 } },
        },
      ],
    });
    expect(plan.assignedPeople).toEqual([{ id: 'ana', name: 'Local Ana' }]);
    const exported = await h.call('ada', 'GET', `/api/projects/${lower}/export?format=markdown`);
    expect(exported.status).toBe(200);
    expect(exported.body).toContain('2026-10-08');
    for (const table of ['optimization_generation', 'solver_slot', 'solver_queue', 'event_log']) {
      expect(h.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
    }
  });
});

describe('shared transactional consumers', () => {
  it('shared command preflight sees staged writes and arrangement', async () => {
    const { lower, lowerStep } = await seedSharedPlans();

    h.sqlite.run("DELETE FROM assignment WHERE work_item_id = 'lower-work'");
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, position, name) VALUES ('other-work', ?, 20, 'other-work')",
      [lower],
    );
    h.sqlite.run(
      "INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('other-work', ?, 1, 1, 1)",
      [lowerStep],
    );
    const arranged = await h.call('ada', 'POST', `/api/projects/${lower}/commands`, {
      commands: [
        { kind: 'setAssignee', workItemId: 'lower-work', stepId: lowerStep, personId: 'ana' },
        {
          kind: 'setEstimate',
          workItemId: 'lower-work',
          stepId: lowerStep,
          days: { optimistic: 2, realistic: 2, pessimistic: 2 },
        },
        { kind: 'arrangeBySchedule' },
      ],
    });
    expect(arranged.status).toBe(200);
    expect(
      h.sqlite
        .query<{ id: string }, [string]>(
          'SELECT id FROM work_item WHERE project_id = ? ORDER BY position',
        )
        .all(lower)
        .map((row) => row.id),
    ).toEqual(['other-work', 'lower-work']);
    for (const workId of ['second-work', 'third-work']) {
      h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 100, ?)', [
        workId,
        lower,
        workId,
      ]);
      h.sqlite.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 30000000, 30000000, 30000000)',
        [workId, lowerStep],
      );
      h.sqlite.run(
        "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'ana')",
        [workId, lowerStep],
      );
    }
    const before = h.sqlite.query('SELECT * FROM estimate ORDER BY work_item_id, step_id').all();
    const refused = await h.call('ada', 'POST', `/api/projects/${lower}/commands`, {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: 'lower-work',
          stepId: lowerStep,
          days: { optimistic: 30000000, realistic: 30000000, pessimistic: 30000000 },
        },
      ],
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ error: 'calendar_range' });
    expect(h.sqlite.query('SELECT * FROM estimate ORDER BY work_item_id, step_id').all()).toEqual(
      before,
    );
    for (const table of ['optimization_generation', 'solver_slot', 'solver_queue'])
      expect(h.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
  });
});

async function seedSharedPlans(
  withOptimizer = false,
  afterResolve?: () => void,
  spawn?: ReservedSpawner,
  solverVersion?: string,
  readConnection?: typeof openReadOnlyConnection,
) {
  h.close();
  h = OrganizationHarness.openComposed(
    withOptimizer,
    afterResolve,
    spawn,
    solverVersion,
    readConnection,
  );
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'admin');
  h.bind('ada', 'org-a');
  h.activate();
  const higher = await create('ada', 'Higher');
  const lower = await create('ada', 'Lower');
  const higherStep = await firstStep('ada', higher);
  const lowerStep = await firstStep('ada', lower);
  h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  h.sqlite.run("INSERT INTO person (id, name) VALUES ('ana', 'Root Ana')");
  h.sqlite.run(
    "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ana', 'org-a', 'Local Ana')",
  );
  h.sqlite.run(
    'INSERT INTO project_rank (project_id, organization_id, position, created_at, created_by) VALUES (?, ?, 1, 1, ?)',
    [higher, 'org-a', h.userId('ada')],
  );
  for (const [projectId, stepId, workId, days] of [
    [higher, higherStep, 'higher-work', 3],
    [lower, lowerStep, 'lower-work', 1],
  ] as const) {
    h.sqlite.run(
      "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
      [projectId],
    );
    h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
      workId,
      projectId,
      workId,
    ]);
    h.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, ?, ?, ?)',
      [workId, stepId, days, days, days],
    );
    h.sqlite.run("INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'ana')", [
      workId,
      stepId,
    ]);
  }
  return { higher, lower, higherStep, lowerStep };
}

function seedFailedRetry(projectId: string, inputHash: string, solverVersion = '0.2.0'): void {
  const contractVersion = `15+${solverVersion}`;
  h.sqlite.run(
    'INSERT INTO optimization_generation (project_id, contract_version, generation, input_hash, updated_at) VALUES (?, ?, 1, ?, 1)',
    [projectId, contractVersion, inputHash],
  );
  h.sqlite.run(
    "INSERT INTO optimized_schedule_cache (project_id, input_hash, objective, contract_version, budget_ms, generation, status, failure_reason, created_at) VALUES (?, ?, 'pri', ?, 60000, 1, 'failed', 'timeout', 2)",
    [projectId, inputHash, contractVersion],
  );
}

describe('shared detached evidence', () => {
  it('keeps live metadata and local names on the scheduling observation', async () => {
    const { higher, lower, lowerStep } = await seedSharedPlans();
    h.sqlite.run('INSERT INTO event_sequencer (subscription, next_seq) VALUES (?, 12)', [
      `project:${lower}`,
    ]);
    const beforeRevision = h.sqlite
      .query<{ revision: number }, [string]>('SELECT revision FROM project WHERE id = ?')
      .get(lower)?.revision;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- injected seam calls this method with its actual repository receiver.
    const original = WorkItemRepository.prototype.listByProject;
    let edited = false;
    const concurrent = spyOn(WorkItemRepository.prototype, 'listByProject').mockImplementation(
      async function (this: WorkItemRepository, projectId) {
        const rows = await original.call(this, projectId);
        if (projectId === higher && !edited) {
          edited = true;
          h.sqlite.run(
            "UPDATE project SET revision = revision + 1, start_date = '2026-10-12' WHERE id = ?",
            [lower],
          );
          h.sqlite.run("UPDATE estimate SET realistic = 9 WHERE work_item_id = 'higher-work'");
          h.sqlite.run(
            "UPDATE person_organization SET name = 'Changed Ana' WHERE resource_id = 'ana'",
          );
          h.sqlite.run('UPDATE event_sequencer SET next_seq = 20 WHERE subscription = ?', [
            `project:${lower}`,
          ]);
          h.sqlite.run(
            "INSERT INTO actual (work_item_id, step_id, days, recorded_at) VALUES ('lower-work', ?, 2, 1)",
            [lowerStep],
          );
        }
        return rows;
      },
    );
    try {
      const captured = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
      expect(captured.status).toBe(200);
      expect(captured.body).toMatchObject({
        seq: 11,
        projectRevision: beforeRevision,
        startDate: '2026-10-05',
        assignedPeople: [{ id: 'ana', name: 'Local Ana' }],
        workItems: [{ schedule: { earliestStart: 3 }, actuals: {} }],
      });
    } finally {
      concurrent.mockRestore();
    }
    const current = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
    expect(current.body).toMatchObject({
      seq: 19,
      projectRevision: beforeRevision! + 1,
      startDate: '2026-10-12',
      assignedPeople: [{ id: 'ana', name: 'Changed Ana' }],
    });
  });

  it('keeps isolated live responses without elsewhere and avoids directory materialization', async () => {
    const { lower } = await seedSharedPlans();
    h.sqlite.run("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
    const answer = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
    expect(answer.status).toBe(200);
    expect(answer.body).not.toHaveProperty('waitingElsewhere');
    expect(answer.body).toMatchObject({
      workItems: [{ schedule: { earliestStart: 0, earliestFinish: 1 } }],
    });
  });
});

describe('borrowed command evidence', () => {
  it('shared calendar preflight independently sees staged estimates', async () => {
    const { lower, lowerStep } = await seedSharedPlans();
    for (const workId of ['second-work', 'third-work']) {
      h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 100, ?)', [
        workId,
        lower,
        workId,
      ]);
      h.sqlite.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 30000000, 30000000, 30000000)',
        [workId, lowerStep],
      );
      h.sqlite.run(
        "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'ana')",
        [workId, lowerStep],
      );
    }
    const before = h.sqlite.query('SELECT * FROM estimate ORDER BY work_item_id, step_id').all();
    const refused = await h.call('ada', 'POST', `/api/projects/${lower}/commands`, {
      commands: [
        {
          kind: 'setEstimate',
          workItemId: 'lower-work',
          stepId: lowerStep,
          days: { optimistic: 30000000, realistic: 30000000, pessimistic: 30000000 },
        },
      ],
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ error: 'calendar_range' });
    expect(h.sqlite.query('SELECT * FROM estimate ORDER BY work_item_id, step_id').all()).toEqual(
      before,
    );
    for (const table of ['optimization_generation', 'solver_slot', 'solver_queue'])
      expect(h.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
  });

  it('shared arrangement sees staged work-item dates', async () => {
    const { lower, lowerStep } = await seedSharedPlans();
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, position, name) VALUES ('other-work', ?, 20, 'other-work')",
      [lower],
    );
    h.sqlite.run(
      "INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('other-work', ?, 1, 1, 1)",
      [lowerStep],
    );
    h.sqlite.run(
      "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('other-work', ?, 'ana')",
      [lowerStep],
    );
    const arranged = await h.call('ada', 'POST', `/api/projects/${lower}/commands`, {
      commands: [
        {
          kind: 'patchWorkItem',
          workItemId: 'lower-work',
          patch: { startNoEarlierThan: '2026-10-12' },
        },
        { kind: 'arrangeBySchedule' },
      ],
    });
    expect(arranged.status).toBe(200);
    expect(
      h.sqlite
        .query<{ id: string }, [string]>(
          'SELECT id FROM work_item WHERE project_id = ? ORDER BY position',
        )
        .all(lower)
        .map((row) => row.id),
    ).toEqual(['other-work', 'lower-work']);
  });
});

describe('shared displayed cache evidence', () => {
  it('refuses Retry for a required unavailable engine with its readable influencer identity', async () => {
    const { higher, lower } = await seedSharedPlans();
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [higher],
    );
    const before = [
      'optimization_generation',
      'optimized_schedule_cache',
      'solver_slot',
      'solver_queue',
      'event_log',
    ].map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all());
    const refused = await h.call('ada', 'POST', `/api/projects/${lower}/optimization/retry`, {
      objective: 'pri',
      inputHash: 'old',
    });
    expect(refused).toEqual({
      status: 409,
      body: { code: 'schedule-input-unavailable', reason: 'engine_unavailable', projectId: higher },
    });
    expect(
      [
        'optimization_generation',
        'optimized_schedule_cache',
        'solver_slot',
        'solver_queue',
        'event_log',
      ].map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all()),
    ).toEqual(before);
  });

  it.each(['cycle', 'calendar_range'] as const)(
    'refuses Retry for a target %s without optimizer writes or launch',
    async (reason) => {
      const launched: ReservedSpawnRequest[] = [];
      const { lower, lowerStep } = await seedSharedPlans(
        true,
        undefined,
        (request) => {
          launched.push(request);
          return new Promise<never>(() => undefined);
        },
        '0.2.0',
      );
      h.sqlite.run('UPDATE project SET optimization_enabled = 1 WHERE id = ?', [lower]);
      if (reason === 'cycle')
        h.sqlite.run(
          "INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES ('retry-cycle', ?, 'lower-work', 'lower-work')",
          [lower],
        );
      else
        h.sqlite.run(
          'UPDATE estimate SET optimistic = 80000000, realistic = 80000000, pessimistic = 80000000 WHERE work_item_id = ? AND step_id = ?',
          ['lower-work', lowerStep],
        );
      const tables = [
        'optimization_generation',
        'optimized_schedule_cache',
        'solver_slot',
        'solver_queue',
        'event_log',
      ];
      const before = tables.map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all());
      expect(
        await h.call('ada', 'POST', `/api/projects/${lower}/optimization/retry`, {
          objective: 'pri',
          inputHash: 'old',
        }),
      ).toEqual({
        status: 409,
        body: { code: 'schedule-input-unavailable', reason, projectId: lower },
      });
      expect(tables.map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all())).toEqual(before);
      expect(launched).toEqual([]);
    },
  );

  it.each(['cycle', 'calendar_range'] as const)(
    'keeps a schedulable target when an upstream %s omits its bookings',
    async (reason) => {
      const { higher, lower, higherStep } = await seedSharedPlans(true);
      if (reason === 'cycle')
        h.sqlite.run(
          "INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES ('upstream-cycle', ?, 'higher-work', 'higher-work')",
          [higher],
        );
      else
        h.sqlite.run(
          'UPDATE estimate SET optimistic = 80000000, realistic = 80000000, pessimistic = 80000000 WHERE work_item_id = ? AND step_id = ?',
          ['higher-work', higherStep],
        );
      const tree = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
      expect(tree.status).toBe(200);
      const currentHash = (tree.body as { optimization: { inputHash: string } }).optimization
        .inputHash;
      const retry = await h.call('ada', 'POST', `/api/projects/${lower}/optimization/retry`, {
        objective: 'pri',
        inputHash: 'old',
      });
      expect(retry).toEqual({
        status: 409,
        body: { code: 'stale-input-hash', currentInputHash: currentHash },
      });
    },
  );

  it('rechecks human authority in the Retry capture after route write admission', async () => {
    const { lower } = await seedSharedPlans(true);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- spy preserves the repository receiver.
    const original = ProjectService.prototype.authorizeRetry;
    const admitted = spyOn(ProjectService.prototype, 'authorizeRetry').mockImplementation(
      async function (this: ProjectService, projectId, actorId, access) {
        const decision = await original.call(this, projectId, actorId, access);
        h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
        return decision;
      },
    );
    try {
      expect(
        await h.call('ada', 'POST', `/api/projects/${lower}/optimization/retry`, {
          objective: 'pri',
          inputHash: 'old',
        }),
      ).toEqual({ status: 403, body: { error: 'not_a_member' } });
      for (const table of ['optimization_generation', 'solver_slot', 'solver_queue'])
        expect(h.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
    } finally {
      admitted.mockRestore();
    }
  });

  it('closes the human Retry snapshot before a matching-hash launcher handoff', async () => {
    let openReads = 0;
    const admittedOpenReads: number[] = [];
    const { lower } = await seedSharedPlans(
      true,
      undefined,
      () => {
        admittedOpenReads.push(openReads);
        return new Promise<never>(() => undefined);
      },
      '0.2.0',
      (dbPath) => {
        const connection = openReadOnlyConnection(dbPath);
        openReads += 1;
        return {
          db: connection.db,
          close: () => {
            connection.close();
            openReads -= 1;
          },
        };
      },
    );
    const tree = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
    const inputHash = (tree.body as { optimization: { inputHash: string } }).optimization.inputHash;
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [lower],
    );
    seedFailedRetry(lower, inputHash);
    expect(
      (
        await h.call('ada', 'POST', `/api/projects/${lower}/optimization/retry`, {
          objective: 'pri',
          inputHash,
        })
      ).status,
    ).toBe(202);
    expect(admittedOpenReads).toEqual([0]);
    expect(openReads).toBe(0);
  });

  it('Retry rejects an upstream-only old hash and launches the matching holder-bearing input', async () => {
    const launched: ReservedSpawnRequest[] = [];
    const { higher, lower, higherStep } = await seedSharedPlans(
      true,
      undefined,
      (request) => {
        launched.push(request);
        return new Promise<never>(() => undefined);
      },
      '0.2.0',
    );
    const oldTree = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
    const oldHash = (oldTree.body as { optimization: { inputHash: string } }).optimization
      .inputHash;
    const localRevision = h.sqlite
      .query<{ revision: number }, [string]>('SELECT revision FROM project WHERE id = ?')
      .get(lower)?.revision;
    h.sqlite.run(
      'UPDATE estimate SET optimistic = 4, realistic = 4, pessimistic = 4 WHERE work_item_id = ? AND step_id = ?',
      ['higher-work', higherStep],
    );
    const currentTree = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
    const currentHash = (currentTree.body as { optimization: { inputHash: string } }).optimization
      .inputHash;
    expect(currentHash).not.toBe(oldHash);
    expect(
      h.sqlite
        .query<{ revision: number }, [string]>('SELECT revision FROM project WHERE id = ?')
        .get(lower)?.revision,
    ).toBe(localRevision);
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [lower],
    );
    seedFailedRetry(lower, currentHash);
    const path = `/api/projects/${lower}/optimization/retry`;
    const stale = await h.call('ada', 'POST', path, { objective: 'pri', inputHash: oldHash });
    expect(stale).toEqual({
      status: 409,
      body: { code: 'stale-input-hash', currentInputHash: currentHash },
    });
    expect(launched).toEqual([]);

    const accepted = await h.call('ada', 'POST', path, {
      objective: 'pri',
      inputHash: currentHash,
    });
    expect(accepted.status).toBe(202);
    expect(launched).toHaveLength(1);
    expect(launched[0]?.input.elsewhere?.get('ana')).toEqual([
      { start: 0, end: 4, projectId: higher, workItemId: 'higher-work' },
    ]);
    expect(launched[0]?.request.elsewhere).toEqual({ ana: [[0, 192]] });
    expect(launched[0]?.key.inputHash).toBe(scheduleInputHash(launched[0].input));
    expect(h.sqlite.query('SELECT project_id FROM solver_slot').all()).toEqual([
      { project_id: lower },
    ]);
  });

  it('rebuilds a queued shared request from the current upstream booking', async () => {
    const launched: ReservedSpawnRequest[] = [];
    const { higher, lower, higherStep } = await seedSharedPlans(
      true,
      undefined,
      (request) => {
        launched.push(request);
        return new Promise<never>(() => undefined);
      },
      '0.2.0',
    );
    const before = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
    const oldHash = (before.body as { optimization: { inputHash: string } }).optimization.inputHash;
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [lower],
    );
    const connection = openConnection(h.databasePath());
    try {
      const generation = allocateGeneration(connection.db, lower, '15+0.2.0', oldHash, 1);
      expect(
        enqueueSolverRequest(connection.db, {
          projectId: lower,
          contractVersion: '15+0.2.0',
          generation,
          objective: 'pri',
          budgetMs: 60_000,
          enqueuedAt: 2,
        }),
      ).toEqual({ kind: 'queued' });
    } finally {
      connection.close();
    }
    h.sqlite.run(
      'UPDATE estimate SET optimistic = 4, realistic = 4, pessimistic = 4 WHERE work_item_id = ? AND step_id = ?',
      ['higher-work', higherStep],
    );

    h.startOptimization();
    await Bun.sleep(50);

    expect(launched).toHaveLength(2);
    expect(launched[0]?.key.inputHash).not.toBe(oldHash);
    expect(launched[0]?.input.elsewhere?.get('ana')).toEqual([
      { start: 0, end: 4, projectId: higher, workItemId: 'higher-work' },
    ]);
    for (const request of launched) expect(request.request.elsewhere).toEqual({ ana: [[0, 192]] });
    expect(h.sqlite.query('SELECT project_id FROM solver_queue').all()).toEqual([]);
    expect(h.sqlite.query('SELECT project_id, generation FROM solver_slot').all()).toEqual([
      { project_id: lower, generation: 2 },
      { project_id: lower, generation: 2 },
    ]);
  });

  it('closes the shared observation before admitting while retaining its display', async () => {
    let openReads = 0;
    const admittedOpenReads: number[] = [];
    const { lower } = await seedSharedPlans(
      true,
      undefined,
      () => {
        admittedOpenReads.push(openReads);
        return new Promise<never>(() => undefined);
      },
      '0.2.0',
      (dbPath) => {
        const connection = openReadOnlyConnection(dbPath);
        openReads += 1;
        return {
          db: connection.db,
          close: () => {
            connection.close();
            openReads -= 1;
          },
        };
      },
    );
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [lower],
    );

    const answer = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ optimization: { variants: { pri: { state: 'idle' } } } });
    expect(admittedOpenReads).toEqual([0, 0]);
    expect(openReads).toBe(0);
    expect(h.sqlite.query('SELECT project_id FROM solver_slot').all()).toEqual([
      { project_id: lower },
      { project_id: lower },
    ]);
  });

  it('keeps optimizer enablement and upstream input on one observation', async () => {
    const launched: ReservedSpawnRequest[] = [];
    const { higher, lower, higherStep } = await seedSharedPlans(
      true,
      undefined,
      (request) => {
        launched.push(request);
        return new Promise<never>(() => undefined);
      },
      '0.2.0',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- injected seam calls the repository receiver.
    const original = WorkItemRepository.prototype.listByProject;
    let changed = false;
    const concurrent = spyOn(WorkItemRepository.prototype, 'listByProject').mockImplementation(
      async function (this: WorkItemRepository, projectId) {
        const rows = await original.call(this, projectId);
        if (projectId === higher && !changed) {
          changed = true;
          h.sqlite.run(
            "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
            [lower],
          );
          h.sqlite.run(
            'UPDATE estimate SET optimistic = 4, realistic = 4, pessimistic = 4 WHERE work_item_id = ? AND step_id = ?',
            ['higher-work', higherStep],
          );
        }
        return rows;
      },
    );
    try {
      h.triggerOptimization(lower);
      await Bun.sleep(300);
      expect(changed).toBe(true);
      expect(launched).toEqual([]);
      expect(h.sqlite.query('SELECT project_id FROM optimization_generation').all()).toEqual([]);

      h.triggerOptimization(lower);
      await Bun.sleep(300);
      expect(launched).toHaveLength(2);
      expect(launched[0]?.input.elsewhere?.get('ana')).toEqual([
        { start: 0, end: 4, projectId: higher, workItemId: 'higher-work' },
      ]);
    } finally {
      concurrent.mockRestore();
    }
  });

  it('export and borrowed arrangement do not admit a shared optimizer request', async () => {
    const launched: ReservedSpawnRequest[] = [];
    const { lower } = await seedSharedPlans(
      true,
      undefined,
      (request) => {
        launched.push(request);
        return new Promise<never>(() => undefined);
      },
      '0.2.0',
    );
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [lower],
    );

    expect(
      (await h.call('ada', 'GET', `/api/projects/${lower}/export?format=markdown`)).status,
    ).toBe(200);
    expect(
      (
        await h.call('ada', 'POST', `/api/projects/${lower}/commands`, {
          commands: [{ kind: 'arrangeBySchedule' }],
        })
      ).status,
    ).toBe(409);

    expect(launched).toEqual([]);
    for (const table of ['optimization_generation', 'solver_slot', 'solver_queue'])
      expect(h.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
  });

  it.each([true, false] as const)(
    'uses captured ready optimization for borrowed arrange and freeze (shared=%s)',
    async (shared) => {
      const { higher, lower, lowerStep } = await seedSharedPlans(
        true,
        undefined,
        undefined,
        '0.2.0',
      );
      if (!shared) h.sqlite.run("UPDATE organization SET shared_people = 0 WHERE id = 'org-a'");
      h.sqlite.run(
        "INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 20, 'other')",
        ['lower-other', lower],
      );
      h.sqlite.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
        ['lower-other', lowerStep],
      );
      h.sqlite.run(
        "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'ana')",
        ['lower-other', lowerStep],
      );
      const capture = new SavedPlanCaptureRepository({
        openConnection: () => openConnection(h.databasePath()),
      });
      const higherReads = await capture.readPlanInput(higher);
      const lowerReads = await capture.readPlanInput(lower);
      if (higherReads === null || lowerReads === null) throw new Error('missing command fixture');
      const chain = readSharedPeople([higherReads, lowerReads], lower, fastScheduler);
      if (chain.kind !== 'scheduled') throw new Error('missing shared command input');
      const input = shared ? chain.input : scheduleInputOfCaptured(lowerReads);
      const planned = schedule(
        input.rows,
        input.edges,
        input.slices,
        new Map([['lower-work', 8]]),
        input.poolSizes,
        input.reach,
        input.deadlines,
        input.typed,
        undefined,
        input.elsewhere,
      );
      const fast = schedule(
        input.rows,
        input.edges,
        input.slices,
        input.notBefore,
        input.poolSizes,
        input.reach,
        input.deadlines,
        input.typed,
        undefined,
        input.elsewhere,
      );
      expect(fast.workItems.get('lower-work')?.earliestStart).toBeLessThan(
        fast.workItems.get('lower-other')?.earliestStart ?? -1,
      );
      expect(planned.workItems.get('lower-other')?.earliestStart).toBeLessThan(
        planned.workItems.get('lower-work')?.earliestStart ?? -1,
      );
      h.sqlite.run(
        "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
        [lower],
      );
      const connection = openConnection(h.databasePath());
      try {
        const inputHash = scheduleInputHash(input);
        const generation = allocateGeneration(connection.db, lower, '15+0.2.0', inputHash, 1);
        for (const objective of ['pri', 'time'] as const) {
          connection.db
            .insert(optimizedScheduleCache)
            .values({
              projectId: lower,
              inputHash,
              generation,
              contractVersion: '15+0.2.0',
              budgetMs: 60000,
              objective,
              status: 'ok',
              failureReason: null,
              createdAt: 1,
              resultJson: JSON.stringify(
                encodeOptimizedResult({
                  publication: 'solver',
                  objectiveValues: {
                    makespan: { value: 9, stageValue: 9, bound: 9, status: 'optimal' },
                    priority: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                    movement: { value: 0, stageValue: 0, bound: 0, status: 'optimal' },
                  },
                  schedule: planned,
                }),
              ),
            })
            .run();
        }
      } finally {
        connection.close();
      }
      const before = [
        'optimization_generation',
        'optimized_schedule_cache',
        'solver_slot',
        'solver_queue',
      ].map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all());
      const optimizer = h.publicOptimizer();
      const originalRead = optimizer.readPlan;
      // Public post-commit tree publication may admit; only the borrowed graph is forbidden.
      let borrowed = true;
      let beforePublic: unknown[] | undefined;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- spy preserves the resource receiver.
      const announceNow = WorkItemService.prototype.announceTreeNow;
      const publication = spyOn(WorkItemService.prototype, 'announceTreeNow').mockImplementation(
        async function (this: WorkItemService, projectId) {
          borrowed = false;
          beforePublic = [
            'optimization_generation',
            'optimized_schedule_cache',
            'solver_slot',
            'solver_queue',
          ].map((table) => h.sqlite.query(`SELECT * FROM ${table}`).all());
          await announceNow.call(this, projectId);
        },
      );
      const live = spyOn(optimizer, 'readPlan').mockImplementation((ask) => {
        if (borrowed) throw new Error('borrowed command entered live optimizer');
        return originalRead(ask);
      });
      const background = spyOn(h.publicOptimizer(), 'inputChanged').mockImplementation(
        () => undefined,
      );
      try {
        const response = await h.call('ada', 'POST', `/api/projects/${lower}/commands`, {
          commands: [{ kind: 'arrangeBySchedule' }, { kind: 'freezeProject' }],
        });
        expect(response.status).toBe(200);
        expect(
          h.sqlite
            .query<{ id: string; position: number; frozen_number: string }, [string]>(
              'SELECT id, position, frozen_number FROM work_item WHERE project_id = ? ORDER BY position',
            )
            .all(lower),
        ).toEqual([
          { id: 'lower-other', position: 10, frozen_number: '010' },
          { id: 'lower-work', position: 20, frozen_number: '020' },
        ]);
        expect(beforePublic).toEqual(before);
      } finally {
        live.mockRestore();
        publication.mockRestore();
        background.mockRestore();
      }
    },
  );

  it('edit admission hashes the changed upstream booking with its holder', async () => {
    const launched: ReservedSpawnRequest[] = [];
    const { higher, lower, higherStep } = await seedSharedPlans(
      true,
      undefined,
      (request) => {
        launched.push(request);
        return new Promise<never>(() => undefined);
      },
      '0.2.0',
    );
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [lower],
    );
    h.sqlite.run(
      'UPDATE estimate SET optimistic = 4, realistic = 4, pessimistic = 4 WHERE work_item_id = ? AND step_id = ?',
      ['higher-work', higherStep],
    );

    h.triggerOptimization(lower);
    await Bun.sleep(300);

    expect(launched).toHaveLength(2);
    for (const request of launched) {
      expect(request.input.elsewhere?.get('ana')).toEqual([
        { start: 0, end: 4, projectId: higher, workItemId: 'higher-work' },
      ]);
      expect(request.request.elsewhere).toEqual({ ana: [[0, 192]] });
      expect(request.key.inputHash).toBe(scheduleInputHash(request.input));
    }
    expect(h.sqlite.query('SELECT project_id FROM solver_slot').all()).toEqual([
      { project_id: lower },
      { project_id: lower },
    ]);
  });

  it('admits a holder-bearing shared input after the captured tree closes', async () => {
    const launched: ReservedSpawnRequest[] = [];
    const { higher, lower } = await seedSharedPlans(
      true,
      undefined,
      (request) => {
        launched.push(request);
        return new Promise<never>(() => undefined);
      },
      '0.2.0',
    );
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [lower],
    );

    const answer = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      workItems: [{ schedule: { earliestStart: 3 } }],
      optimization: { variants: { pri: { state: 'idle' } } },
    });
    expect(launched).toHaveLength(2);
    for (const request of launched) {
      expect(request.key.projectId).toBe(lower);
      expect(request.input.elsewhere?.get('ana')).toEqual([
        { start: 0, end: 3, projectId: higher, workItemId: 'higher-work' },
      ]);
      expect(request.request.elsewhere).toEqual({ ana: [[0, 144]] });
      expect(request.key.inputHash).toBe(scheduleInputHash(request.input));
    }
    expect(h.sqlite.query('SELECT project_id FROM solver_slot').all()).toEqual([
      { project_id: lower },
      { project_id: lower },
    ]);
  });

  it('keeps publication after snapshot outside its captured display without live admission', async () => {
    const { higher, lower } = await seedSharedPlans(true);
    h.sqlite.run(
      "UPDATE project SET optimization_enabled = 1, schedule_engine = 'optimized' WHERE id = ?",
      [higher],
    );
    // The ready booking starts at 1; the target floor excludes the valid [0, 1) gap.
    h.sqlite.run(
      "UPDATE work_item SET start_no_earlier_than = '2026-10-06' WHERE id = 'lower-work'",
    );
    const reads = await new SavedPlanCaptureRepository({
      openConnection: () => openConnection(h.databasePath()),
    }).readPlanInput(higher);
    if (reads === null) throw new Error('missing higher input');
    const input = scheduleInputOfCaptured(reads);
    const planned = schedule(
      input.rows,
      input.edges,
      input.slices,
      new Map([['higher-work', 1]]),
      input.poolSizes,
      input.reach,
      input.deadlines,
      input.typed,
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- injected seam calls this method with its actual repository receiver.
    const original = WorkItemRepository.prototype.listByProject;
    let published = false;
    const concurrent = spyOn(WorkItemRepository.prototype, 'listByProject').mockImplementation(
      async function (this: WorkItemRepository, projectId) {
        const rows = await original.call(this, projectId);
        if (projectId === higher && !published) {
          published = true;
          const connection = openConnection(h.databasePath());
          try {
            const inputHash = scheduleInputHash(input);
            const generation = allocateGeneration(connection.db, higher, '15+0.1.0', inputHash, 1);
            connection.db
              .insert(optimizedScheduleCache)
              .values({
                projectId: higher,
                inputHash,
                generation,
                contractVersion: '15+0.1.0',
                budgetMs: 60000,
                objective: 'pri',
                status: 'ok',
                failureReason: null,
                createdAt: 1,
                resultJson: JSON.stringify(
                  encodeOptimizedResult({
                    publication: 'solver',
                    objectiveValues: {
                      makespan: { value: 4, stageValue: 4, bound: 4, status: 'optimal' },
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
        }
        return rows;
      },
    );
    const admission = spyOn(OptimizationCoordinator.prototype, 'readPlan').mockImplementation(
      () => {
        throw new Error('forbidden live admission');
      },
    );
    try {
      const first = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ workItems: [{ schedule: { earliestStart: 3 } }] });
      concurrent.mockRestore();
      const next = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
      expect(next.status).toBe(200);
      expect(next.body).toMatchObject({ workItems: [{ schedule: { earliestStart: 4 } }] });
      expect(admission).not.toHaveBeenCalled();
      for (const table of ['solver_slot', 'solver_queue', 'event_log'])
        expect(h.sqlite.query(`SELECT * FROM ${table}`).all()).toEqual([]);
      expect(h.sqlite.query('SELECT project_id FROM optimization_generation').all()).toEqual([
        { project_id: higher },
      ]);
    } finally {
      concurrent.mockRestore();
      admission.mockRestore();
    }
  });
});

describe('shared snapshot authority', () => {
  it('refuses revocation between route admission and shared snapshot', async () => {
    let revoke = false;
    const { lower } = await seedSharedPlans(false, () => {
      if (!revoke) return;
      revoke = false;
      h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
      h.sqlite.run("UPDATE estimate SET realistic = 9 WHERE work_item_id = 'higher-work'");
    });
    for (const path of [
      `/api/projects/${lower}/work-items`,
      `/api/projects/${lower}/export?format=markdown`,
      '/api/people/ana/load?from=2026-10-05&to=2026-10-09',
      '/api/people/load?from=2026-10-05&to=2026-10-09',
      `/api/spaces/all/roll-ups?projectIds=${lower}`,
      '/api/spaces/all/in-progress',
    ]) {
      revoke = true;
      const answer = await h.call('ada', 'GET', path);
      expect(answer).toEqual({ status: 403, body: { error: 'not_a_member' } });
      h.member('org-a', 'ada', 'admin');
    }
  });
});

describe('shared snapshot authorization observation', () => {
  it('retains authorization when membership is revoked after the snapshot authority read', async () => {
    const { higher, lower } = await seedSharedPlans();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- injected seam calls this method with its actual repository receiver.
    const original = WorkItemRepository.prototype.listByProject;
    let revoked = false;
    const capture = spyOn(WorkItemRepository.prototype, 'listByProject').mockImplementation(
      async function (this: WorkItemRepository, projectId) {
        const rows = await original.call(this, projectId);
        if (!revoked && projectId === higher) {
          revoked = true;
          h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
          h.sqlite.run("UPDATE estimate SET realistic = 9 WHERE work_item_id = 'higher-work'");
        }
        return rows;
      },
    );
    try {
      const answer = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
      expect(answer.status).toBe(200);
      expect(
        (answer.body as { workItems: { schedule: { earliestStart: number } }[] }).workItems[0]
          .schedule.earliestStart,
      ).toBe(3);
      expect((await h.call('ada', 'GET', `/api/projects/${lower}/work-items`)).status).toBe(403);
    } finally {
      capture.mockRestore();
    }
  });

  it('refuses activation between legacy admission and snapshot', async () => {
    h.close();
    let activate = false;
    h = OrganizationHarness.openComposed(false, () => {
      if (activate) {
        activate = false;
        h.activate();
      }
    });
    await h.register('ada');
    const projectId = await create('ada', 'Legacy');
    activate = true;
    expect(await h.call('ada', 'GET', `/api/projects/${projectId}/work-items`)).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
  });

  it.each([
    'missing marker',
    'unreadable marker',
    'malformed marker',
    'malformed membership',
    'reset marker',
  ])('fails closed for %s introduced after admission', async (fault) => {
    let corrupt = false;
    const { lower } = await seedSharedPlans(false, () => {
      if (!corrupt) return;
      corrupt = false;
      if (fault === 'missing marker') h.sqlite.run('DROP TABLE organization_activation');
      else if (fault === 'unreadable marker') {
        h.sqlite.run('DROP TABLE organization_activation');
        h.sqlite.run('CREATE TABLE organization_activation (broken TEXT)');
      } else if (fault === 'malformed marker') {
        h.sqlite.run('DROP TRIGGER organization_activation_no_revert');
        h.sqlite.run('PRAGMA ignore_check_constraints = ON');
        h.sqlite.run("UPDATE organization_activation SET state = 'broken'");
        h.sqlite.run('PRAGMA ignore_check_constraints = OFF');
      } else if (fault === 'reset marker') {
        h.sqlite.run('DROP TRIGGER organization_activation_no_revert');
        h.sqlite.run(
          "UPDATE organization_activation SET state = 'pre_activation', activated_at = NULL",
        );
      } else {
        h.sqlite.run('PRAGMA ignore_check_constraints = ON');
        h.sqlite.run("UPDATE organization_membership SET role = 'owner' WHERE user_id = ?", [
          h.userId('ada'),
        ]);
        h.sqlite.run('PRAGMA ignore_check_constraints = OFF');
      }
    });
    corrupt = true;
    expect((await h.call('ada', 'GET', `/api/projects/${lower}/work-items`)).status).toBe(
      fault === 'reset marker' ? 403 : 500,
    );
  });
});

describe('shared export observation', () => {
  it.each(['json', 'markdown'])(
    'keeps structured export project directory and markers on the captured observation (%s)',
    async (format) => {
      let admitted = false;
      const { higher, lower } = await seedSharedPlans(false, () => {
        if (!admitted) return;
        admitted = false;
        h.sqlite.run("UPDATE project SET name = 'Captured project', revision = 7 WHERE id = ?", [
          targetId,
        ]);
      });
      const targetId = lower;
      h.sqlite.run(
        "INSERT INTO calendar_marker (id, project_id, date, name, color, created_at) VALUES ('export-marker', ?, '2026-10-05', 'Captured marker', NULL, 1)",
        [lower],
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method -- seam invokes original with the actual repository receiver.
      const listWorkItems = WorkItemRepository.prototype.listByProject;
      let edited = false;
      const afterSnapshot = spyOn(WorkItemRepository.prototype, 'listByProject').mockImplementation(
        async function (this: WorkItemRepository, projectId) {
          const rows = await listWorkItems.call(this, projectId);
          if (!edited && projectId === higher) {
            edited = true;
            h.sqlite.run("UPDATE project SET name = 'Later project', revision = 8 WHERE id = ?", [
              lower,
            ]);
            h.sqlite.run(
              "UPDATE person_organization SET name = 'Later Ana' WHERE resource_id = 'ana'",
            );
            h.sqlite.run(
              "UPDATE calendar_marker SET name = 'Later marker' WHERE id = 'export-marker'",
            );
          }
          return rows;
        },
      );
      try {
        admitted = true;
        const answer = await h.call('ada', 'GET', `/api/projects/${lower}/export?format=${format}`);
        expect(answer.status).toBe(200);
        if (format === 'markdown') {
          expect(answer.body).toContain('Captured project');
          expect(answer.body).not.toContain('Later project');
          return;
        }
        expect(answer.body).toMatchObject({
          project: { name: 'Captured project', revision: 7 },
          settings: { name: 'Captured project' },
          projectRevision: 7,
          assignedPeople: [{ name: 'Local Ana' }],
          directory: { people: [{ name: 'Local Ana' }] },
          calendarMarkers: [{ name: 'Captured marker' }],
          workItems: [{ schedule: { earliestStart: 3 } }],
        });
      } finally {
        afterSnapshot.mockRestore();
      }
    },
  );
});
