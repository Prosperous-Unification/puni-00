import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

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
