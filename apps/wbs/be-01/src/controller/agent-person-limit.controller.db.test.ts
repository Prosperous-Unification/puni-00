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
  });
});
