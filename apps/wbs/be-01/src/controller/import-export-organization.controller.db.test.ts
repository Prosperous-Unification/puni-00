import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Plan import, JSON export and solution lookup under organization isolation
 * (task 3.5, part 1), over be-01's production composition and real SQLite; see
 * {@link OrganizationHarness.openComposed}.
 *
 * Every catalog entry is seeded with a root name (`root-…`) that differs from
 * its organization-local name, so an answer carrying a root name is a leak.
 */
let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
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
});

afterEach(() => {
  h.close();
});

/** One catalog entry owned by `org`, with a root name that differs from its local one. */
function entry(root: string, side: string, id: string, org: 'a' | 'b', name: string): void {
  h.sqlite.run(`INSERT INTO ${root} (id, name) VALUES (?, ?)`, [id, `root-${id}`]);
  h.sqlite.run(`INSERT INTO ${side} (resource_id, organization_id, name) VALUES (?, ?, ?)`, [
    id,
    `org-${org}`,
    name,
  ]);
}

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

/** A's project whose one row is assigned A's person, a member of A's team that owns A's service. */
async function assignedProject(): Promise<string> {
  entry('person', 'person_organization', 'pe-a', 'a', 'Kat');
  entry('service_team', 'service_team_organization', 'tm-a', 'a', 'Billing');
  entry('service', 'service_organization', 'sv-a', 'a', 'Billing API');
  h.sqlite.run("INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-a', 'tm-a')");
  h.sqlite.run("INSERT INTO team_service (team_id, service_id) VALUES ('tm-a', 'sv-a')");
  const project = await create('ada', 'A plan');
  const step = await firstStep('ada', project);
  const answer = await h.call('ada', 'POST', `/api/projects/${project}/commands`, {
    commands: [
      { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' },
      { kind: 'setAssignee', workItemRef: 'w', stepId: step, personId: 'pe-a' },
    ],
  });
  if (answer.status !== 200) throw new Error(`batch refused: ${JSON.stringify(answer)}`);
  return project;
}

describe('the JSON export', () => {
  it("exports only the organization's own directory, under its local names", async () => {
    const project = await assignedProject();
    const exported = await h.call('ada', 'GET', `/api/projects/${project}/export?format=json`);
    expect(exported.status).toBe(200);
    const directory = (exported.body as { directory: unknown }).directory;
    expect(directory).toMatchObject({
      people: [{ id: 'pe-a', name: 'Kat', teamIds: ['tm-a'] }],
      teams: [{ id: 'tm-a', name: 'Billing', serviceIds: ['sv-a'] }],
      services: [{ id: 'sv-a', name: 'Billing API' }],
    });
    expect(JSON.stringify(exported.body)).not.toContain('root-');
  });

  it('fails the JSON export closed over a person in a foreign team', async () => {
    const project = await assignedProject();
    entry('service_team', 'service_team_organization', 'tm-b', 'b', 'Theirs');
    h.sqlite.run("INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-a', 'tm-b')");
    const exported = await h.call('ada', 'GET', `/api/projects/${project}/export?format=json`);
    expect(exported.status).toBe(500);
  });
});

describe('the import', () => {
  it('imports into the organization, resolving names among its own entries', async () => {
    // B holds every name the document carries; A holds only the tag.
    for (const [root, side, id, name] of [
      ['tag', 'tag_organization', 'tg-b', 'Release'],
      ['service_team', 'service_team_organization', 'tm-b', 'Billing'],
      ['service', 'service_organization', 'sv-b', 'Billing API'],
      ['person', 'person_organization', 'pe-b', 'Kat'],
      ['work_item_type', 'work_item_type_organization', 'ty-b', 'Milestone'],
      ['external_system', 'external_system_organization', 'es-b', 'Tracker'],
    ] as const) {
      entry(root, side, id, 'b', name);
    }
    entry('tag', 'tag_organization', 'tg-a', 'a', 'Release');
    const before = await h.call('grace', 'GET', '/api/tags');
    const imported = await h.call('ada', 'POST', '/api/projects/import', planDocumentFixture());
    expect(imported.status).toBe(201);
    const { projectId, created } = imported.body as {
      projectId: string;
      created: Record<string, string[]>;
    };
    expect(created).toEqual({
      teams: ['Billing'],
      people: ['Kat'],
      tags: [],
      services: ['Billing API'],
      types: ['Milestone'],
      externalSystems: ['Tracker'],
    });
    const listed = (await h.call('ada', 'GET', '/api/projects')).body as {
      projects: { id: string }[];
    };
    expect(listed.projects.map((each) => each.id)).toContain(projectId);
    const theirs = (await h.call('grace', 'GET', '/api/projects')).body as {
      projects: { id: string }[];
    };
    expect(theirs.projects.map((each) => each.id)).not.toContain(projectId);
    const tree = await h.call('ada', 'GET', `/api/projects/${projectId}/work-items`);
    expect(tree.status).toBe(200);
    const row = (
      tree.body as { workItems: { tagIds: string[]; teamIds: string[] }[] }
    ).workItems.at(0);
    if (row === undefined) throw new Error('the import wrote no row');
    expect(row.tagIds).toEqual(['tg-a']);
    expect(row.teamIds).not.toContain('tm-b');
    expect(await h.call('grace', 'GET', '/api/tags')).toEqual(before);
    expect(await h.call('grace', 'GET', `/api/projects/${projectId}`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
  });

  it('leaves a solution reference off, revealing nothing', async () => {
    const held = await create('grace', 'B plan');
    h.sqlite.run(
      "UPDATE project SET solution_slug = 'shared', solution_url = 'https://x.example/shared' WHERE id = ?",
      [held],
    );
    const answers = [];
    for (const slug of ['shared', 'free']) {
      const document = planDocumentFixture();
      const imported = await h.call('ada', 'POST', '/api/projects/import', {
        ...document,
        settings: { ...document.settings, solutionRef: { slug, url: `https://x.example/${slug}` } },
      });
      expect(imported.status).toBe(201);
      answers.push((imported.body as { solutionRef: string }).solutionRef);
    }
    expect(answers).toEqual(['left-off', 'left-off']);
  });

  it("refuses a viewer's import", async () => {
    expect(await h.call('vic', 'POST', '/api/projects/import', planDocumentFixture())).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect((await h.call('ada', 'GET', '/api/projects')).body as { projects: unknown[] }).toEqual({
      projects: [],
    });
  });

  it('refuses an unbound session and a removed member before any import', async () => {
    expect(await h.call('nell', 'POST', '/api/projects/import', planDocumentFixture())).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
    h.sqlite.run('DELETE FROM organization_membership WHERE user_id = ?', [h.userId('ada')]);
    expect(await h.call('ada', 'POST', '/api/projects/import', planDocumentFixture())).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
  });
});

describe('the solution lookup', () => {
  it('answers a foreign solution slug as an absent one', async () => {
    const held = await create('grace', 'B plan');
    h.sqlite.run(
      "UPDATE project SET solution_slug = 'theirs', solution_url = 'https://x.example/theirs' WHERE id = ?",
      [held],
    );
    const absent = await h.call('ada', 'GET', '/plans/by-solution/nobody');
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await h.call('ada', 'GET', '/plans/by-solution/theirs')).toEqual(absent);
    expect((await h.call('grace', 'GET', '/plans/by-solution/theirs')).status).toBe(200);
    expect(await h.call('nell', 'GET', '/plans/by-solution/theirs')).toEqual({
      status: 403,
      body: { error: 'no_active_organization' },
    });
  });
});
