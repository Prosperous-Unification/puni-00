import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * The agent person cap (`wbs-organization-limits` slice 2, L9) on every path
 * that makes an agent person, over be-01's production composition and real
 * SQLite, so a refused batch or import rolls back exactly as in production.
 * A's cap is written as a row directly: the operator CLI is slice 5.
 */
let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'admin');
  h.member('org-b', 'grace', 'admin');
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
});

afterEach(() => {
  h.close();
});

function capAgents(organizationId: string, maxAgentPersons: number): void {
  h.sqlite.run(
    `INSERT INTO organization_limits
       (organization_id, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, created_at)
     VALUES (?, ?, 200, 10000, 1)
     ON CONFLICT (organization_id) DO UPDATE SET max_agent_persons = excluded.max_agent_persons`,
    [organizationId, maxAgentPersons],
  );
}

function personIn(organizationId: string, id: string, kind: 'person' | 'agent'): void {
  h.sqlite.run('INSERT INTO person (id, name, kind) VALUES (?, ?, ?)', [id, `root-${id}`, kind]);
  h.sqlite.run(
    'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
    [id, organizationId, id],
  );
}

/** `count` agents of `organizationId`, named `<prefix>-1` and on. */
function agentsIn(organizationId: string, prefix: string, count: number): void {
  for (let n = 1; n <= count; n++) personIn(organizationId, `${prefix}-${String(n)}`, 'agent');
}

function kindOf(id: string): string | undefined {
  return h.sqlite.query<{ kind: string }, [string]>('SELECT kind FROM person WHERE id = ?').get(id)
    ?.kind;
}

function agentCount(organizationId: string): number {
  const row = h.sqlite
    .query<{ n: number }, [string]>(
      `SELECT count(*) AS n FROM person JOIN person_organization ON person_organization.resource_id = person.id
       WHERE person_organization.organization_id = ? AND person.kind = 'agent'`,
    )
    .get(organizationId);
  if (row === null) throw new Error('agent count answered no row');
  return row.n;
}

function rowCount(table: 'person' | 'project'): number {
  const row = h.sqlite.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${table}`).get();
  if (row === null) throw new Error(`${table} count answered no row`);
  return row.n;
}

function directory(username: string, commands: unknown[]): Promise<Answer> {
  return h.call(username, 'POST', '/api/directory/commands', { commands });
}

const promote = (personId: string) => ({ kind: 'patchPerson', personId, patch: { kind: 'agent' } });

const createAgent = (name: string) => ({ kind: 'createPerson', name, personKind: 'agent' });

/** The kind of the organization's person of local name `name`, undefined when it holds none. */
function kindByName(organizationId: string, name: string): string | undefined {
  return h.sqlite
    .query<{ kind: string }, [string, string]>(
      `SELECT person.kind AS kind FROM person JOIN person_organization ON person_organization.resource_id = person.id
       WHERE person_organization.organization_id = ? AND person_organization.name = ?`,
    )
    .get(organizationId, name)?.kind;
}

/** A plan document whose directory holds exactly `agents` agent people and no one else. */
function documentWithAgents(agents: readonly string[]) {
  const base = planDocumentFixture();
  const [row] = base.workItems;
  return {
    ...base,
    capacity: [],
    directory: {
      ...base.directory,
      people: agents.map((name, at) => ({
        id: `file-agent-${String(at)}`,
        name,
        kind: 'agent' as const,
        teamIds: [],
      })),
    },
    workItems: [{ ...row, assignees: {} }],
  };
}

describe('the agent person cap, activated', () => {
  beforeEach(() => {
    h.activate();
  });

  it('refuses the ninth agent by patchPerson, naming the numbers and changing nothing', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 8);
    personIn('org-a', 'kat', 'person');

    expect(await directory('ada', [promote('kat')])).toEqual({
      status: 409,
      body: {
        at: 0,
        kind: 'patchPerson',
        error: 'agent_person_limit',
        cap: 8,
        current: 8,
        added: 1,
      },
    });
    expect(kindOf('kat')).toBe('person');
  });

  // Proof: with a cap of 0 read as no cap in `refuseAgentPersons`, this case
  // answered 200 and made the agent (12 pass, 1 fail); watched 2026-10-22.
  it('refuses the first agent under a cap of 0', async () => {
    capAgents('org-a', 0);
    personIn('org-a', 'kat', 'person');

    expect((await directory('ada', [promote('kat')])).body).toEqual({
      at: 0,
      kind: 'patchPerson',
      error: 'agent_person_limit',
      cap: 0,
      current: 0,
      added: 1,
    });
    expect(kindOf('kat')).toBe('person');
  });

  it('admits the agent that reaches the cap exactly', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 7);
    personIn('org-a', 'kat', 'person');

    expect((await directory('ada', [promote('kat')])).status).toBe(200);
    expect(agentCount('org-a')).toBe(8);
  });

  it('demotes an agent at the cap, after which the next promotion is applied', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 8);
    personIn('org-a', 'kat', 'person');

    expect(
      (
        await directory('ada', [
          { kind: 'patchPerson', personId: 'bot-1', patch: { kind: 'person' } },
        ])
      ).status,
    ).toBe(200);
    expect((await directory('ada', [promote('kat')])).status).toBe(200);
    expect(kindOf('bot-1')).toBe('person');
    expect(kindOf('kat')).toBe('agent');
  });

  it('renames an agent and re-teams it at the cap, restating its kind', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 8);

    const renamed = await directory('ada', [
      { kind: 'createTeam', ref: 'fleet', name: 'Fleet' },
      {
        kind: 'patchPerson',
        personId: 'bot-1',
        patch: { name: 'Bot one', kind: 'agent', teamIds: [] },
      },
      {
        kind: 'patchPerson',
        personId: 'bot-2',
        patch: { kind: 'agent' },
      },
    ]);

    expect(renamed.status).toBe(200);
    expect(agentCount('org-a')).toBe(8);
  });

  it('refuses a batch adding two agents where one is free, writing neither', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 7);
    personIn('org-a', 'kat', 'person');
    personIn('org-a', 'lee', 'person');

    expect(await directory('ada', [promote('kat'), promote('lee')])).toEqual({
      status: 409,
      body: {
        at: 1,
        kind: 'patchPerson',
        error: 'agent_person_limit',
        cap: 8,
        current: 8,
        added: 1,
      },
    });
    expect(kindOf('kat')).toBe('person');
    expect(kindOf('lee')).toBe('person');
  });

  // A project batch runs its directory commands over the working plan's
  // catalog, not the directory batch's: the path slice 2 left uncapped.
  // Proof: with the working plan's `organizationLimits` getter removed, the
  // promotion under the cap answered 500 "an agent person was added under
  // scoped access without organization limits" (13 pass, 1 fail); watched 2026-10-22.
  it('promotes inside a project batch under the cap and refuses it at the cap', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 7);
    personIn('org-a', 'kat', 'person');
    personIn('org-a', 'lee', 'person');
    const created = await h.call('ada', 'POST', '/api/projects', { name: 'Fleet' });
    if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
    const projectId = (created.body as { project: { id: string } }).project.id;
    const inProject = (commands: unknown[]) =>
      h.call('ada', 'POST', `/api/projects/${projectId}/commands`, { commands });

    expect((await inProject([promote('kat')])).status).toBe(200);
    expect(await inProject([promote('lee')])).toEqual({
      status: 409,
      body: {
        at: 0,
        kind: 'patchPerson',
        error: 'agent_person_limit',
        cap: 8,
        current: 8,
        added: 1,
      },
    });
    expect(kindOf('kat')).toBe('agent');
    expect(kindOf('lee')).toBe('person');
  });

  it('frees capacity by deleting an agent in the same batch', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 8);
    personIn('org-a', 'kat', 'person');

    const answer = await directory('ada', [
      { kind: 'deletePerson', personId: 'bot-1', cascade: true },
      promote('kat'),
    ]);

    expect(answer.status).toBe(200);
    expect(kindOf('kat')).toBe('agent');
    expect(agentCount('org-a')).toBe(8);
  });

  it('keeps every agent above a lowered cap and refuses only the next acquisition', async () => {
    agentsIn('org-a', 'bot', 8);
    personIn('org-a', 'kat', 'person');
    capAgents('org-a', 5);

    expect(agentCount('org-a')).toBe(8);
    expect((await directory('ada', [promote('kat')])).body).toEqual({
      at: 0,
      kind: 'patchPerson',
      error: 'agent_person_limit',
      cap: 5,
      current: 8,
      added: 1,
    });
    expect(
      (await directory('ada', [{ kind: 'patchPerson', personId: 'bot-1', patch: { name: 'Old' } }]))
        .status,
    ).toBe(200);
    expect(
      (
        await directory('ada', [
          { kind: 'patchPerson', personId: 'bot-2', patch: { kind: 'person' } },
        ])
      ).status,
    ).toBe(200);
    expect(agentCount('org-a')).toBe(7);
  });

  it("never counts another organization's agents", async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 7);
    agentsIn('org-b', 'other', 30);
    personIn('org-a', 'kat', 'person');

    expect((await directory('ada', [promote('kat')])).status).toBe(200);
  });

  // Scenario: An agent created directly.
  it('creates an agent directly with createPerson personKind agent', async () => {
    capAgents('org-a', 8);

    const created = await directory('ada', [createAgent('Scout')]);

    expect(created).toMatchObject({
      status: 200,
      body: { results: [{ entity: { name: 'Scout', kind: 'agent' } }] },
    });
    expect(kindByName('org-a', 'Scout')).toBe('agent');
    expect(agentCount('org-a')).toBe(1);
  });

  // Scenario: The fifth agent created directly.
  // Proof: with `addPersonWithin`'s agent check bypassed, this case and the
  // next were applied, A reading past its cap (18 pass, 2 fail); watched 2026-10-23.
  it('refuses the fifth agent created directly under a cap of 4, writing nothing', async () => {
    capAgents('org-a', 4);
    for (const name of ['A1', 'A2', 'A3', 'A4'])
      expect((await directory('ada', [createAgent(name)])).status).toBe(200);
    const people = rowCount('person');

    expect(await directory('ada', [createAgent('A5')])).toEqual({
      status: 409,
      body: {
        at: 0,
        kind: 'createPerson',
        error: 'agent_person_limit',
        cap: 4,
        current: 4,
        added: 1,
      },
    });
    expect(rowCount('person')).toBe(people);
    expect(kindByName('org-a', 'A5')).toBeUndefined();
    expect(agentCount('org-a')).toBe(4);
  });

  it('refuses a batch creating two agents where one is free, writing neither', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 7);
    const people = rowCount('person');

    expect((await directory('ada', [createAgent('Ann'), createAgent('Bea')])).body).toEqual({
      at: 1,
      kind: 'createPerson',
      error: 'agent_person_limit',
      cap: 8,
      current: 8,
      added: 1,
    });
    expect(rowCount('person')).toBe(people);
    expect(agentCount('org-a')).toBe(7);
  });

  it('creates a person by default, and a person kind explicitly, under a cap of 0', async () => {
    capAgents('org-a', 0);

    expect(
      (
        await directory('ada', [
          { kind: 'createPerson', name: 'Kat' },
          { kind: 'createPerson', name: 'Lee', personKind: 'person' },
        ])
      ).status,
    ).toBe(200);
    expect(kindByName('org-a', 'Kat')).toBe('person');
    expect(kindByName('org-a', 'Lee')).toBe('person');
  });

  it('refuses a kind outside the set, writing nothing', async () => {
    const people = rowCount('person');

    expect(
      await directory('ada', [{ kind: 'createPerson', name: 'Odd', personKind: 'robot' }]),
    ).toMatchObject({ status: 400, body: { at: 0, kind: 'createPerson', error: 'invalid_kind' } });
    expect(rowCount('person')).toBe(people);
  });

  it('joins a held name and keeps its kind, adding no agent at the cap', async () => {
    capAgents('org-a', 1);
    agentsIn('org-a', 'bot', 1);
    personIn('org-a', 'kat', 'person');

    expect(await directory('ada', [createAgent('kat')])).toMatchObject({
      status: 200,
      body: { results: [{ entity: { name: 'kat', kind: 'person' } }] },
    });
    expect(agentCount('org-a')).toBe(1);
  });

  it('refuses an import of three agents at 6 of 8, writing nothing', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 6);
    const people = rowCount('person');
    const projects = rowCount('project');

    expect(
      await h.call('ada', 'POST', '/api/projects/import', documentWithAgents(['Ann', 'Bea', 'Cy'])),
    ).toEqual({
      status: 409,
      body: { error: 'agent_person_limit', cap: 8, current: 6, added: 3 },
    });
    expect(rowCount('person')).toBe(people);
    expect(rowCount('project')).toBe(projects);
  });

  it('imports two agents at 6 of 8', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 6);

    const imported = await h.call(
      'ada',
      'POST',
      '/api/projects/import',
      documentWithAgents(['Ann', 'Bea']),
    );

    expect(imported.status).toBe(201);
    expect(agentCount('org-a')).toBe(8);
  });

  it('imports at the cap when every agent of the file is already held', async () => {
    capAgents('org-a', 8);
    agentsIn('org-a', 'bot', 8);

    const imported = await h.call(
      'ada',
      'POST',
      '/api/projects/import',
      documentWithAgents(['bot-1', 'bot-2']),
    );

    expect(imported.status).toBe(201);
    expect(agentCount('org-a')).toBe(8);
  });
});

describe('the agent person cap under legacy access', () => {
  it('admits a promotion and an import with no organization to own a cap', async () => {
    capAgents('org-a', 0);
    capAgents('org-b', 0);
    h.sqlite.run("INSERT INTO person (id, name, kind) VALUES ('kat', 'kat', 'person')");

    expect((await directory('ada', [promote('kat')])).status).toBe(200);
    expect(kindOf('kat')).toBe('agent');
    expect(
      (await h.call('ada', 'POST', '/api/projects/import', documentWithAgents(['Ann']))).status,
    ).toBe(201);
    expect((await directory('ada', [createAgent('Scout')])).status).toBe(200);
    expect(
      h.sqlite.query<{ kind: string }, []>("SELECT kind FROM person WHERE name = 'Scout'").get()
        ?.kind,
    ).toBe('agent');
  });
});
