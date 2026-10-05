import { encodeOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import { scheduleInputOfCaptured } from '@wbs/core';
import { schedule } from '@wbs/domain';
import { openConnection } from '@wbs/store-sqlite/db';
import { allocateGeneration } from '@wbs/store-sqlite/optimization-generation';
import { SavedPlanCaptureRepository } from '@wbs/store-sqlite/saved-plan-capture';
import { scheduleInputHash } from '@wbs/store-sqlite/schedule-input-hash';
import { optimizedScheduleCache } from '@wbs/store-sqlite/schema';
import { WorkItemRepository } from '@wbs/store-sqlite/work-item';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { OptimizationCoordinator } from '../module/optimization/optimization.feature';
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

async function seedSharedPlans(withOptimizer = false, afterResolve?: () => void) {
  h.close();
  h = OrganizationHarness.openComposed(withOptimizer, afterResolve);
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
