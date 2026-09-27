import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * Directory commands under organization isolation (task 3.4, part 2), over
 * be-01's production composition and real SQLite; see
 * {@link OrganizationHarness.openComposed}.
 *
 * Each organization owns one entry of every catalog, seeded as SQL with a root
 * name (`root-…`) that differs from its organization-local name, so any answer
 * carrying a root name is visible as a leak.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  for (const username of ['ada', 'grace', 'vic']) await h.register(username);
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
  seedCatalogs('a');
  seedCatalogs('b');
});

afterEach(() => {
  h.close();
});

async function create(username: string, name: string): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  return (answer.body as { project: { id: string } }).project.id;
}

function directory(username: string, commands: unknown[]): Promise<Answer> {
  return h.call(username, 'POST', '/api/directory/commands', { commands });
}

/** One entry of every catalog, owned by organization `org`. */
function seedCatalogs(org: 'a' | 'b'): void {
  for (const [root, side, id] of [
    ['person', 'person_organization', `pe-${org}`],
    ['service_team', 'service_team_organization', `tm-${org}`],
    ['service', 'service_organization', `sv-${org}`],
    ['tag', 'tag_organization', `tg-${org}`],
    ['work_item_type', 'work_item_type_organization', `ty-${org}`],
  ] as const) {
    h.sqlite.run(`INSERT INTO ${root} (id, name) VALUES (?, ?)`, [id, `root-${id}`]);
    h.sqlite.run(`INSERT INTO ${side} (resource_id, organization_id, name) VALUES (?, ?, ?)`, [
      id,
      `org-${org}`,
      id,
    ]);
  }
}

/** Every directory row and ownership mapping, to show a refusal changed nothing. */
function snapshot(): unknown {
  return [
    'person',
    'person_organization',
    'project_team_capacity',
    'assignment',
    'person_team',
    'service_team',
    'service_team_organization',
    'team_service',
    'service',
    'service_organization',
    'tag',
    'tag_organization',
    'work_item_type',
    'work_item_type_organization',
    'work_item_tag',
    'work_item_team',
    'work_item_service',
    'work_item_work_item_type',
    'work_item',
  ].map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all().map(withoutAudit));
}

function withoutAudit(row: unknown): unknown {
  if (typeof row !== 'object' || row === null) return row;
  return Object.fromEntries(
    Object.entries(row).filter(([column]) => !['updated_at', 'created_at'].includes(column)),
  );
}

async function list(username: string, path: string, key: string): Promise<unknown> {
  const answer = await h.call(username, 'GET', path);
  return (answer.body as Record<string, unknown>)[key];
}

describe('after activation', () => {
  it('creates the same names in two organizations, each finding only its own', async () => {
    const mine = await directory('ada', [
      { kind: 'createTag', ref: 't', name: 'urgent' },
      { kind: 'createService', name: 'Billing' },
      { kind: 'createWorkItemType', name: 'Bug' },
      { kind: 'createTeam', ref: 'team', name: 'Platform' },
      { kind: 'createPerson', name: 'Kat', teamRefs: ['team'] },
    ]);
    expect(mine.status).toBe(200);
    const theirs = await directory('grace', [
      { kind: 'createTag', name: 'urgent' },
      { kind: 'createService', name: 'Billing' },
      { kind: 'createWorkItemType', name: 'Bug' },
      { kind: 'createTeam', name: 'Platform' },
      { kind: 'createPerson', name: 'Kat' },
    ]);
    expect(theirs.status).toBe(200);
    const ids = (answer: Answer) =>
      (answer.body as { results: { id: string; entity: { name: string } }[] }).results.map(
        (each) => [each.id, each.entity.name],
      );
    const a = ids(mine);
    const b = ids(theirs);
    expect(a.map(([, name]) => name)).toEqual(['urgent', 'Billing', 'Bug', 'Platform', 'Kat']);
    expect(b.map(([, name]) => name)).toEqual(a.map(([, name]) => name));
    for (const [index, [id]] of a.entries()) expect(b[index]?.[0]).not.toBe(id);
    // Idempotent by the organization-local name.
    const again = await directory('ada', [{ kind: 'createTag', name: 'urgent' }]);
    expect(ids(again)).toEqual([a[0]]);
    // The roots carry opaque names, never a display name two organizations share.
    const first = a.at(0);
    if (first === undefined) throw new Error('the tag create minted no id');
    const [urgent] = first;
    const tagRoot = h.sqlite
      .query<{ name: string }, [string]>('SELECT name FROM tag WHERE id = ?')
      .get(urgent);
    expect(tagRoot?.name).toBe(urgent);
    expect(await list('ada', '/api/tags', 'tags')).toEqual([
      { id: 'tg-a', name: 'tg-a' },
      { id: a[0]?.[0], name: 'urgent' },
    ]);
    expect(await list('grace', '/api/tags', 'tags')).toEqual([
      { id: 'tg-b', name: 'tg-b' },
      { id: b[0]?.[0], name: 'urgent' },
    ]);
  });

  it('answers a foreign entry exactly as an absent one, changing nothing', async () => {
    const pairs: [unknown, unknown][] = [
      [
        { kind: 'patchTag', tagId: 'tg-b', name: 'mine now' },
        { kind: 'patchTag', tagId: 'no-tag', name: 'mine now' },
      ],
      [
        { kind: 'patchService', serviceId: 'sv-b', name: 'mine now' },
        { kind: 'patchService', serviceId: 'no-service', name: 'mine now' },
      ],
      [
        { kind: 'patchWorkItemType', typeId: 'ty-b', name: 'mine now' },
        { kind: 'patchWorkItemType', typeId: 'no-type', name: 'mine now' },
      ],
      [
        { kind: 'patchTeam', teamId: 'tm-b', patch: { name: 'mine now' } },
        { kind: 'patchTeam', teamId: 'no-team', patch: { name: 'mine now' } },
      ],
      [
        { kind: 'patchPerson', personId: 'pe-b', patch: { name: 'mine now' } },
        { kind: 'patchPerson', personId: 'no-person', patch: { name: 'mine now' } },
      ],
      [
        { kind: 'patchTeam', teamId: 'tm-b', patch: { serviceIds: [] } },
        { kind: 'patchTeam', teamId: 'no-team', patch: { serviceIds: [] } },
      ],
      [
        { kind: 'patchPerson', personId: 'pe-b', patch: { kind: 'agent' } },
        { kind: 'patchPerson', personId: 'no-person', patch: { kind: 'agent' } },
      ],
      [
        { kind: 'deleteTag', tagId: 'tg-b', cascade: true },
        { kind: 'deleteTag', tagId: 'no-tag', cascade: true },
      ],
      [
        { kind: 'deleteService', serviceId: 'sv-b', cascade: true },
        { kind: 'deleteService', serviceId: 'no-service', cascade: true },
      ],
      [
        { kind: 'deleteWorkItemType', typeId: 'ty-b', cascade: true },
        { kind: 'deleteWorkItemType', typeId: 'no-type', cascade: true },
      ],
      [
        { kind: 'deleteTeam', teamId: 'tm-b', cascade: true },
        { kind: 'deleteTeam', teamId: 'no-team', cascade: true },
      ],
      [
        { kind: 'deletePerson', personId: 'pe-b', cascade: true },
        { kind: 'deletePerson', personId: 'no-person', cascade: true },
      ],
    ];
    for (const [foreignCommand, absentCommand] of pairs) {
      const before = snapshot();
      const foreignAnswer = await directory('ada', [
        { kind: 'createTag', name: 'kept?' },
        foreignCommand,
      ]);
      expect({ foreignCommand, answer: foreignAnswer }).toMatchObject({
        foreignCommand,
        answer: { status: 404, body: { error: 'not_found', at: 1 } },
      });
      expect(await directory('ada', [{ kind: 'createTag', name: 'kept?' }, absentCommand])).toEqual(
        foreignAnswer,
      );
      expect(snapshot()).toEqual(before);
    }
  });

  it('refuses a foreign service or team link exactly as an absent one', async () => {
    const pairs: [unknown, unknown, string][] = [
      [
        { kind: 'patchTeam', teamId: 'tm-a', patch: { serviceIds: ['sv-b'] } },
        { kind: 'patchTeam', teamId: 'tm-a', patch: { serviceIds: ['no-service'] } },
        'unknown_service',
      ],
      [
        { kind: 'patchPerson', personId: 'pe-a', patch: { teamIds: ['tm-b'] } },
        { kind: 'patchPerson', personId: 'pe-a', patch: { teamIds: ['no-team'] } },
        'unknown_team',
      ],
      [
        { kind: 'createPerson', name: 'Newcomer', teamIds: ['tm-b'] },
        { kind: 'createPerson', name: 'Newcomer', teamIds: ['no-team'] },
        'unknown_team',
      ],
      [
        { kind: 'createPerson', name: 'pe-a', teamIds: ['tm-b'] },
        { kind: 'createPerson', name: 'pe-a', teamIds: ['no-team'] },
        'unknown_team',
      ],
    ];
    for (const [foreignCommand, absentCommand, error] of pairs) {
      const before = snapshot();
      const foreignAnswer = await directory('ada', [foreignCommand]);
      expect({ foreignCommand, answer: foreignAnswer }).toMatchObject({
        foreignCommand,
        answer: { status: 404, body: { error, at: 0 } },
      });
      expect(await directory('ada', [absentCommand])).toEqual(foreignAnswer);
      expect(snapshot()).toEqual(before);
    }
  });

  it('renames only the organization-local name, refusing one another entry holds', async () => {
    h.sqlite.run("INSERT INTO tag (id, name) VALUES ('tg-a2', 'root-tg-a2')");
    h.sqlite.run(
      "INSERT INTO tag_organization (resource_id, organization_id, name) VALUES ('tg-a2', 'org-a', 'other')",
    );
    const before = snapshot();
    expect(await directory('ada', [{ kind: 'patchTag', tagId: 'tg-a', name: 'other' }])).toEqual({
      status: 409,
      body: { error: 'taken', at: 0, kind: 'patchTag', name: 'other' },
    });
    expect(snapshot()).toEqual(before);
    // B's name does not block A.
    const renamed = await directory('ada', [
      { kind: 'patchTag', tagId: 'tg-a', name: 'tg-b' },
      { kind: 'patchTeam', teamId: 'tm-a', patch: { name: 'Core', serviceIds: ['sv-a'] } },
      { kind: 'patchPerson', personId: 'pe-a', patch: { name: 'Ada L', teamIds: ['tm-a'] } },
    ]);
    expect(renamed).toMatchObject({
      status: 200,
      body: {
        results: [
          { entity: { id: 'tg-a', name: 'tg-b' } },
          { entity: { id: 'tm-a', name: 'Core', serviceIds: ['sv-a'] } },
          { entity: { id: 'pe-a', name: 'Ada L', teamIds: ['tm-a'] } },
        ],
      },
    });
    const roots = h.sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM tag WHERE id = 'tg-a' UNION ALL SELECT name FROM service_team WHERE id = 'tm-a' UNION ALL SELECT name FROM person WHERE id = 'pe-a'",
      )
      .all();
    expect(roots.map((row) => row.name)).toEqual(['root-tg-a', 'root-tm-a', 'root-pe-a']);
    expect(await list('grace', '/api/tags', 'tags')).toEqual([{ id: 'tg-b', name: 'tg-b' }]);
  });

  it('shows removal usage under organization-local names only', async () => {
    const step = (
      (await h.call('ada', 'GET', `/api/projects/${own}`)).body as { steps: { id: string }[] }
    ).steps[0]?.id;
    const created = await h.call('ada', 'POST', `/api/projects/${own}/commands`, {
      commands: [
        { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' },
        { kind: 'setAssignee', workItemRef: 'w', stepId: step, personId: 'pe-a' },
        { kind: 'patchWorkItem', workItemRef: 'w', patch: { teamIds: ['tm-a'] } },
      ],
    });
    expect(created.status).toBe(200);
    h.sqlite.run("INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-a', 'tm-a')");
    for (const command of [
      { kind: 'deletePerson', personId: 'pe-a' },
      { kind: 'deleteTeam', teamId: 'tm-a' },
    ]) {
      const refused = await directory('ada', [command]);
      expect(refused.status).toBe(409);
      expect(JSON.stringify(refused.body)).not.toContain('root-');
      expect(JSON.stringify(refused.body)).toContain('pe-a');
    }
    expect(
      (await directory('ada', [{ kind: 'deleteTeam', teamId: 'tm-a', cascade: true }])).status,
    ).toBe(200);
  });

  it('fails closed on a directory entry a foreign project names', async () => {
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-b', ?, NULL, 0, 'Theirs')",
      [foreign],
    );
    h.sqlite.run("INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w-b', 'tg-a')");
    const before = snapshot();
    for (const command of [
      { kind: 'deleteTag', tagId: 'tg-a' },
      { kind: 'deleteTag', tagId: 'tg-a', cascade: true },
      { kind: 'patchTag', tagId: 'tg-a', name: 'renamed' },
    ]) {
      const answer = await directory('ada', [command]);
      expect({ command, status: answer.status }).toEqual({ command, status: 500 });
    }
    expect(snapshot()).toEqual(before);
    expect(own).not.toBe(foreign);
  });

  it('fails closed on an entry another organization reaches, whatever the write', async () => {
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-b', ?, NULL, 0, 'Theirs')",
      [foreign],
    );
    const step = (
      (await h.call('grace', 'GET', `/api/projects/${foreign}`)).body as { steps: { id: string }[] }
    ).steps.at(0)?.id;
    if (step === undefined) throw new Error('the foreign project started with no step');
    const reaches: [string, [string, unknown[]][], unknown[]][] = [
      [
        "B's person in A's team",
        [["INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-b', 'tm-a')", []]],
        [
          { kind: 'deleteTeam', teamId: 'tm-a', cascade: true },
          { kind: 'patchTeam', teamId: 'tm-a', patch: { name: 'Renamed' } },
        ],
      ],
      [
        "B's capacity for A's team",
        [
          [
            'INSERT INTO project_team_capacity (project_id, service_team_id, size) VALUES (?, ?, 2)',
            [foreign, 'tm-a'],
          ],
        ],
        [{ kind: 'patchTeam', teamId: 'tm-a', patch: { serviceIds: [] } }],
      ],
      [
        "B's team owning A's service",
        [["INSERT INTO team_service (team_id, service_id) VALUES ('tm-b', 'sv-a')", []]],
        [{ kind: 'deleteService', serviceId: 'sv-a' }],
      ],
      [
        "B's assignment of A's person",
        [
          [
            'INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)',
            ['w-b', step, 'pe-a'],
          ],
        ],
        [
          { kind: 'patchPerson', personId: 'pe-a', patch: { kind: 'agent' } },
          { kind: 'createPerson', name: 'pe-a', teamIds: ['tm-a'] },
        ],
      ],
      [
        "A's person in B's team",
        [["INSERT INTO person_team (person_id, service_team_id) VALUES ('pe-a', 'tm-b')", []]],
        [{ kind: 'patchPerson', personId: 'pe-a', patch: { kind: 'agent' } }],
      ],
      [
        "A's team owning B's service",
        [["INSERT INTO team_service (team_id, service_id) VALUES ('tm-a', 'sv-b')", []]],
        [{ kind: 'patchTeam', teamId: 'tm-a', patch: { name: 'Renamed' } }],
      ],
      [
        "B's row labelled with A's team",
        [["INSERT INTO work_item_team (work_item_id, team_id) VALUES ('w-b', 'tm-a')", []]],
        [{ kind: 'patchTeam', teamId: 'tm-a', patch: { name: 'Renamed' } }],
      ],
      [
        "B's row led by A's team",
        [["UPDATE work_item SET service_team_id = 'tm-a' WHERE id = 'w-b'", []]],
        [{ kind: 'patchTeam', teamId: 'tm-a', patch: { name: 'Renamed' } }],
      ],
      [
        "B's row delivering A's service",
        [["INSERT INTO work_item_service (work_item_id, service_id) VALUES ('w-b', 'sv-a')", []]],
        [{ kind: 'patchService', serviceId: 'sv-a', name: 'Renamed' }],
      ],
      [
        "B's row's single service A's",
        [["UPDATE work_item SET service_id = 'sv-a' WHERE id = 'w-b'", []]],
        [{ kind: 'patchService', serviceId: 'sv-a', name: 'Renamed' }],
      ],
      [
        "B's row typed with A's type",
        [
          [
            "INSERT INTO work_item_work_item_type (work_item_id, type_id) VALUES ('w-b', 'ty-a')",
            [],
          ],
        ],
        [{ kind: 'patchWorkItemType', typeId: 'ty-a', name: 'Renamed' }],
      ],
      [
        "B's row tagged with A's tag",
        [["INSERT INTO work_item_tag (work_item_id, tag_id) VALUES ('w-b', 'tg-a')", []]],
        [{ kind: 'patchTag', tagId: 'tg-a', name: 'Renamed' }],
      ],
    ];
    for (const [reach, seeds, commands] of reaches) {
      for (const [statement, params] of seeds) h.sqlite.run(statement, params as string[]);
      const before = snapshot();
      for (const command of commands) {
        const answer = await directory('ada', [command]);
        expect({ reach, command, status: answer.status }).toEqual({ reach, command, status: 500 });
      }
      expect(snapshot()).toEqual(before);
      h.sqlite.run("DELETE FROM person_team WHERE person_id = 'pe-b'");
      h.sqlite.run('DELETE FROM project_team_capacity WHERE project_id = ?', [foreign]);
      h.sqlite.run("DELETE FROM team_service WHERE team_id = 'tm-b'");
      h.sqlite.run("DELETE FROM assignment WHERE work_item_id = 'w-b'");
      h.sqlite.run("DELETE FROM person_team WHERE person_id = 'pe-a'");
      h.sqlite.run("DELETE FROM team_service WHERE team_id = 'tm-a'");
      h.sqlite.run("DELETE FROM work_item_team WHERE work_item_id = 'w-b'");
      h.sqlite.run(
        "UPDATE work_item SET service_team_id = NULL, service_id = NULL WHERE id = 'w-b'",
      );
      h.sqlite.run("DELETE FROM work_item_service WHERE work_item_id = 'w-b'");
      h.sqlite.run("DELETE FROM work_item_work_item_type WHERE work_item_id = 'w-b'");
      h.sqlite.run("DELETE FROM work_item_tag WHERE work_item_id = 'w-b'");
    }
  });

  it('refuses a viewer every directory command', async () => {
    const before = snapshot();
    expect(await directory('vic', [{ kind: 'createTag', name: 'x' }])).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(snapshot()).toEqual(before);
  });
});
