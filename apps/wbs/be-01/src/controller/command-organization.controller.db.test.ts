import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * Project command batches, undo and redo under organization isolation (task
 * 3.4, part 1), over be-01's production composition and real SQLite; see
 * {@link OrganizationHarness.openComposed}. Directory commands are refused
 * under scoped access until part 2 gives them organization-local writes.
 *
 * Each organization owns one entry of every catalog, seeded as SQL with a
 * root name that differs from its local name.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
let ownStep: string;
let foreignStep: string;

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
  own = await create('ada', 'A plan');
  foreign = await create('grace', 'B plan');
  ownStep = await firstStep('ada', own);
  foreignStep = await firstStep('grace', foreign);
  seedCatalogs('a');
  seedCatalogs('b');
  await expectApplied(
    await batch('ada', own, [
      { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' },
    ]),
  );
  await expectApplied(
    await batch('grace', foreign, [
      { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Theirs' },
    ]),
  );
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

function batch(username: string, projectId: string, commands: unknown[]): Promise<Answer> {
  return h.call(username, 'POST', `/api/projects/${projectId}/commands`, { commands });
}

async function expectApplied(answer: Answer): Promise<void> {
  expect(answer.status).toBe(200);
  await Promise.resolve();
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

/** The one root work item of a project, by its name. */
function rowOf(projectId: string): { id: string; name: string } {
  const row = h.sqlite
    .query<{ id: string; name: string }, [string]>(
      'SELECT id, name FROM work_item WHERE project_id = ? AND parent_id IS NULL ORDER BY position LIMIT 1',
    )
    .get(projectId);
  if (row === null) throw new Error(`project ${projectId} has no root row`);
  return row;
}

/** Everything a refused batch must leave alone, in both organizations. */
function snapshot(): unknown {
  return [
    'work_item',
    'work_item_tag',
    'work_item_team',
    'work_item_service',
    'work_item_work_item_type',
    'work_item_external_ref',
    'assignment',
    'estimate',
    'dependency',
    'project_team_capacity',
    'tag',
    'command_journal',
  ].map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
}

describe('before activation', () => {
  it('runs any batch deployment-wide, directory commands included', async () => {
    h.close();
    h = OrganizationHarness.openComposed();
    for (const username of ['ada', 'grace']) await h.register(username);
    const theirs = await create('grace', 'Legacy plan');
    const answer = await batch('ada', theirs, [
      { kind: 'createTag', ref: 't', name: 'urgent' },
      { kind: 'createWorkItem', ref: 'w', parentId: null, afterId: null, name: 'Root' },
    ]);
    expect(answer.status).toBe(200);
    expect(
      await h.call('ada', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'createTag', name: 'later' }],
      }),
    ).toMatchObject({ status: 200 });
  });
});

describe('after activation', () => {
  it('applies an own batch and lets its undo and redo walk', async () => {
    const row = rowOf(own);
    const renamed = await batch('ada', own, [
      { kind: 'patchWorkItem', workItemId: row.id, patch: { name: 'Renamed', tagIds: ['tg-a'] } },
      { kind: 'setAssignee', workItemId: row.id, stepId: ownStep, personId: 'pe-a' },
      { kind: 'setCapacity', teamId: 'tm-a', size: 2 },
    ]);
    expect(renamed.status).toBe(200);
    expect(rowOf(own).name).toBe('Renamed');
    expect((await h.call('ada', 'POST', `/api/projects/${own}/undo`)).status).toBe(200);
    expect(rowOf(own).name).toBe('Root');
    expect((await h.call('ada', 'POST', `/api/projects/${own}/redo`)).status).toBe(200);
    expect(rowOf(own).name).toBe('Renamed');
  });

  it('refuses an unbound session and a removed member before any batch', async () => {
    const before = snapshot();
    expect(
      await batch('nell', own, [{ kind: 'patchWorkItem', workItemId: rowOf(own).id, patch: {} }]),
    ).toEqual({ status: 403, body: { error: 'no_active_organization' } });
    h.sqlite.run("DELETE FROM organization_membership WHERE organization_id = 'org-a'");
    const row = rowOf(own).id;
    expect(
      await batch('ada', own, [{ kind: 'patchWorkItem', workItemId: row, patch: { name: 'x' } }]),
    ).toEqual({ status: 403, body: { error: 'not_a_member' } });
    expect(await h.call('ada', 'POST', `/api/projects/${own}/undo`)).toEqual({
      status: 403,
      body: { error: 'not_a_member' },
    });
    expect(
      await h.call('ada', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'createTag', name: 'x' }],
      }),
    ).toEqual({ status: 403, body: { error: 'not_a_member' } });
    expect(snapshot()).toEqual(before);
  });

  it('answers 404 alike for a foreign and an absent project', async () => {
    const before = snapshot();
    const commands = [
      { kind: 'patchWorkItem', workItemId: rowOf(foreign).id, patch: { name: 'Seized' } },
    ];
    const foreignAnswer = await batch('ada', foreign, commands);
    expect(foreignAnswer).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(await batch('ada', 'no-such-project', commands)).toEqual(foreignAnswer);
    expect(await batch('ada', foreign, [])).toEqual(foreignAnswer);
    expect(snapshot()).toEqual(before);
  });

  it('refuses a viewer every batch, undo and redo', async () => {
    const before = snapshot();
    expect(
      await batch('vic', own, [
        { kind: 'patchWorkItem', workItemId: rowOf(own).id, patch: { name: 'Viewer' } },
      ]),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
    for (const walk of ['undo', 'redo']) {
      expect(await h.call('vic', 'POST', `/api/projects/${own}/${walk}`)).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
    }
    expect(
      await h.call('vic', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'createTag', name: 'x' }],
      }),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(snapshot()).toEqual(before);
  });

  it('refuses a foreign service, team, tag, type, person and predecessor, all or none', async () => {
    const row = rowOf(own).id;
    const theirs = rowOf(foreign).id;
    const cases: [unknown, string][] = [
      [
        { kind: 'patchWorkItem', workItemId: row, patch: { serviceIds: ['sv-b'] } },
        'unknown_service',
      ],
      [{ kind: 'patchWorkItem', workItemId: row, patch: { teamIds: ['tm-b'] } }, 'unknown_team'],
      [
        { kind: 'patchWorkItem', workItemId: row, patch: { serviceTeamId: 'tm-b' } },
        'unknown_team',
      ],
      [{ kind: 'patchWorkItem', workItemId: row, patch: { tagIds: ['tg-b'] } }, 'unknown_tag'],
      [{ kind: 'patchWorkItem', workItemId: row, patch: { typeIds: ['ty-b'] } }, 'unknown_type'],
      [
        {
          kind: 'patchWorkItem',
          workItemId: row,
          patch: { externalRefs: [{ systemId: 'es-b', url: 'https://x.example' }] },
        },
        'unknown_system',
      ],
      [
        { kind: 'setAssignee', workItemId: row, stepId: ownStep, personId: 'pe-b' },
        'unknown_person',
      ],
      [{ kind: 'setCapacity', teamId: 'tm-b', size: 3 }, 'not_found'],
      [{ kind: 'addDependency', workItemId: row, predecessorId: theirs }, 'not_found'],
    ];
    for (const [command, error] of cases) {
      const before = snapshot();
      const answer = await batch('ada', own, [
        { kind: 'patchWorkItem', workItemId: row, patch: { name: 'Kept?' } },
        command,
      ]);
      expect({ command, answer }).toMatchObject({
        command,
        answer: { status: 404, body: { error, at: 1 } },
      });
      expect(snapshot()).toEqual(before);
    }
  });

  it('refuses a foreign predecessor, parent, sibling and step even where the final state would not show it', async () => {
    const row = rowOf(own).id;
    const theirs = rowOf(foreign).id;
    const cases: [unknown, string][] = [
      [{ kind: 'removeDependency', workItemId: row, predecessorId: theirs }, 'not_found'],
      [{ kind: 'createWorkItem', parentId: theirs, afterId: null, name: 'Child' }, 'not_found'],
      [{ kind: 'createWorkItem', parentId: null, afterId: theirs, name: 'Next' }, 'not_found'],
      [{ kind: 'moveWorkItem', workItemId: row, parentId: null, afterId: theirs }, 'not_found'],
      [{ kind: 'clearEstimate', workItemId: row, stepId: foreignStep }, 'unknown_step'],
      [{ kind: 'clearActual', workItemId: row, stepId: foreignStep }, 'unknown_step'],
      [{ kind: 'clearProgress', workItemId: row, stepId: foreignStep }, 'unknown_step'],
      [
        {
          kind: 'setEstimate',
          workItemId: row,
          stepId: foreignStep,
          days: { optimistic: 1, realistic: 2, pessimistic: 3 },
        },
        'unknown_step',
      ],
      [{ kind: 'duplicateWorkItem', workItemId: theirs }, 'not_found'],
    ];
    for (const [command, error] of cases) {
      const before = snapshot();
      const answer = await batch('ada', own, [command]);
      expect({ command, answer }).toMatchObject({
        command,
        answer: { status: 404, body: { error, at: 0 } },
      });
      expect(snapshot()).toEqual(before);
    }
  });

  it('refuses every directory command until organization-local writes land', async () => {
    const before = snapshot();
    expect(
      await batch('ada', own, [
        { kind: 'createWorkItem', parentId: null, afterId: null, name: 'Kept?' },
        { kind: 'createTag', name: 'urgent' },
      ]),
    ).toMatchObject({ status: 403, body: { error: 'forbidden', at: 1, kind: 'createTag' } });
    expect(
      await h.call('ada', 'POST', '/api/directory/commands', {
        commands: [{ kind: 'patchTag', tagId: 'tg-a', name: 'renamed' }],
      }),
    ).toMatchObject({ status: 403, body: { error: 'forbidden', at: 0, kind: 'patchTag' } });
    expect(snapshot()).toEqual(before);
  });

  it('fails closed on a project that already crosses its organization', async () => {
    h.sqlite.run('INSERT INTO work_item_tag (work_item_id, tag_id) VALUES (?, ?)', [
      rowOf(own).id,
      'tg-b',
    ]);
    const answer = await batch('ada', own, [
      { kind: 'patchWorkItem', workItemId: rowOf(own).id, patch: { name: 'On corrupt state' } },
    ]);
    expect(answer.status).toBe(500);
    expect(rowOf(own).name).toBe('Root');
    expect((await h.call('ada', 'POST', `/api/projects/${own}/undo`)).status).toBe(500);
  });

  it('refuses undo and redo of a foreign project as of an absent one', async () => {
    const absent = await h.call('ada', 'POST', '/api/projects/no-such-project/undo');
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    for (const walk of ['undo', 'redo']) {
      expect(await h.call('ada', 'POST', `/api/projects/${foreign}/${walk}`)).toEqual(absent);
    }
  });

  it('rolls back an undo that would restore a foreign label', async () => {
    const row = rowOf(own).id;
    await expectApplied(
      await batch('ada', own, [{ kind: 'patchWorkItem', workItemId: row, patch: { tagIds: [] } }]),
    );
    // An entry journalled before activation: its inverse puts back B's tag.
    h.sqlite.run(
      'UPDATE command_journal SET inverse = replace(inverse, \'"tagIds":[]\', \'"tagIds":["tg-b"]\') WHERE project_id = ?',
      [own],
    );
    const before = snapshot();
    expect(await h.call('ada', 'POST', `/api/projects/${own}/undo`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(snapshot()).toEqual(before);
  });

  it("refuses an undo whose entry names another project's row, writing nothing", async () => {
    const row = rowOf(own).id;
    const theirs = rowOf(foreign);
    await expectApplied(
      await batch('ada', own, [
        { kind: 'patchWorkItem', workItemId: row, patch: { name: 'Mine' } },
      ]),
    );
    h.sqlite.run(
      'UPDATE command_journal SET inverse = replace(inverse, ?, ?) WHERE project_id = ?',
      [row, theirs.id, own],
    );
    const before = snapshot();
    expect(await h.call('ada', 'POST', `/api/projects/${own}/undo`)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect(rowOf(foreign).name).toBe(theirs.name);
    expect(snapshot()).toEqual(before);
  });

  it("refuses clearing a foreign team's capacity as it refuses an absent team's", async () => {
    const before = snapshot();
    const absent = await batch('ada', own, [
      { kind: 'setCapacity', teamId: 'no-team', size: null },
    ]);
    expect(absent).toMatchObject({ status: 404, body: { error: 'not_found', at: 0 } });
    expect(await batch('ada', own, [{ kind: 'setCapacity', teamId: 'tm-b', size: null }])).toEqual(
      absent,
    );
    expect(snapshot()).toEqual(before);
  });

  it('fails closed on a project another project reaches into, changing neither', async () => {
    const mine = rowOf(own).id;
    const theirs = rowOf(foreign).id;
    for (const [kind, statement, params] of [
      [
        'incoming_step_row',
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 2, 3)',
        [theirs, ownStep],
      ],
      [
        'incoming_parent',
        "INSERT INTO work_item (id, project_id, parent_id, position, name) VALUES ('w-in', ?, ?, 9, 'In')",
        [foreign, mine],
      ],
      [
        'incoming_dependency',
        "INSERT INTO dependency (id, project_id, predecessor_id, successor_id) VALUES ('d-in', ?, ?, ?)",
        [foreign, mine, theirs],
      ],
    ] as const) {
      h.sqlite.run(statement, [...params]);
      const before = snapshot();
      for (const command of [
        { kind: 'patchWorkItem', workItemId: mine, patch: { name: 'Renamed' } },
        { kind: 'deleteWorkItem', workItemId: mine },
      ]) {
        const answer = await batch('ada', own, [command]);
        expect({ kind, command, status: answer.status }).toEqual({ kind, command, status: 500 });
      }
      expect(snapshot()).toEqual(before);
      h.sqlite.run('DELETE FROM estimate WHERE step_id = ?', [ownStep]);
      h.sqlite.run("DELETE FROM work_item WHERE id = 'w-in'");
      h.sqlite.run("DELETE FROM dependency WHERE id = 'd-in'");
    }
  });
});

/** Replaces the inverse of `own`'s newest journal entry, as a pre-activation entry could hold. */
function plantInverse(inverse: unknown): void {
  h.sqlite.run(
    'UPDATE command_journal SET inverse = ? WHERE id = (SELECT id FROM command_journal WHERE project_id = ? ORDER BY seq DESC LIMIT 1)',
    [JSON.stringify(inverse), own],
  );
}

describe('a replayed entry that names anything outside the organization', () => {
  let row: string;

  beforeEach(async () => {
    row = rowOf(own).id;
    await expectApplied(
      await batch('ada', own, [
        { kind: 'patchWorkItem', workItemId: row, patch: { name: 'Mine' } },
      ]),
    );
  });

  const planted: [string, () => unknown][] = [
    [
      'a step of another project',
      () => ({
        do: 'set_estimate',
        workItemId: row,
        stepId: foreignStep,
        days: { optimistic: 1, realistic: 2, pessimistic: 3 },
      }),
    ],
    [
      'a foreign label added and cleared again in one nested batch',
      () => ({
        do: 'batch',
        steps: [
          { do: 'patch', workItemId: row, patch: { tagIds: ['tg-b'] } },
          { do: 'patch', workItemId: row, patch: { tagIds: [] } },
        ],
      }),
    ],
    [
      'a restored row of another project',
      () => ({
        do: 'restore_subtree',
        rows: [
          {
            id: 'w-planted',
            projectId: foreign,
            parentId: null,
            position: 5,
            name: 'Planted',
            notes: '',
            frozenNumber: null,
            startNoEarlierThan: null,
            startNoEarlierThanReason: null,
            deadline: null,
            factStart: null,
            factEnd: null,
            priority: null,
            serviceTeamId: null,
            serviceId: null,
            maxParallel: 1,
            revision: 1,
          },
        ],
        rootPosition: 5,
        reparented: [],
        estimates: [],
        actuals: [],
        progress: [],
        measures: [],
        assignments: [],
        internalDependencies: [],
        externalDependencies: [],
        removedEstimates: [],
        removedActuals: [],
        removedProgress: [],
        removedMeasures: [],
      }),
    ],
    [
      'a foreign assignee',
      () => ({ do: 'assign', workItemId: row, stepId: ownStep, personId: 'pe-b' }),
    ],
  ];
  for (const [what, inverse] of planted) {
    it(`is refused as not found, keeping the entry: ${what}`, async () => {
      plantInverse(inverse());
      const before = snapshot();
      expect(await h.call('ada', 'POST', `/api/projects/${own}/undo`)).toEqual({
        status: 404,
        body: { error: 'not_found' },
      });
      expect(snapshot()).toEqual(before);
    });
  }
});
