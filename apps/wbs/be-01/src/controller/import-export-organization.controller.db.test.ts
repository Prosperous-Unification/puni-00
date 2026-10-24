import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { StepParallelRepository } from '@wbs/store-sqlite/step-parallel';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { activateTestStepBlockages } from '@wbs/store-sqlite/testing/step-blockage-activation';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

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

/** A one-day dated import whose existing Ana assignment participates in shared capacity. */
function sharedAnaDocument(name: string) {
  const base = planDocumentFixture();
  return {
    ...base,
    settings: {
      ...base.settings,
      name,
      startDate: '2026-10-05',
      estimateRounding: 'exact' as const,
    },
    capacity: [],
    calendarMarkers: [],
    directory: {
      teams: [],
      people: [{ ...base.directory.people[0], name: 'Ana', teamIds: [] }],
      tags: [],
      services: [],
      types: [],
      externalSystems: [],
    },
    steps: [base.steps[0]],
    workItems: [
      {
        ...base.workItems[0],
        name: 'Earlier',
        startNoEarlierThan: null,
        startNoEarlierThanReason: null,
        deadline: null,
        serviceTeamId: null,
        serviceId: null,
        teamIds: [],
        tagIds: [],
        serviceIds: [],
        typeIds: [],
        externalRefs: [],
        estimates: { 'step-1': { optimistic: 1, realistic: 1, pessimistic: 1 } },
        actuals: {},
        progress: {},
        measures: {},
        assignees: { 'step-1': 'person-1' },
      },
    ],
  };
}

async function seedAssignedProject(name: string, rowId: string): Promise<string> {
  const projectId = await create('ada', name);
  const stepId = await firstStep('ada', projectId);
  h.sqlite.run(
    "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
    [projectId],
  );
  h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
    rowId,
    projectId,
    name,
  ]);
  h.sqlite.run(
    'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
    [rowId, stepId],
  );
  h.sqlite.run("INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, 'ana')", [
    rowId,
    stepId,
  ]);
  return projectId;
}

function sqliteState(): Record<string, unknown[]> {
  const names = h.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return Object.fromEntries(
    names.map(({ name }) => [name, h.sqlite.query(`SELECT * FROM "${name}" ORDER BY rowid`).all()]),
  );
}

for (const seeded of [false, true]) {
  it(`mounted v11 external import refuses before any SQLite write (seeded storage authority: ${String(seeded)})`, async () => {
    if (seeded) {
      const main = h.sqlite
        .query<{ name: string; file: string }, []>('PRAGMA database_list')
        .all()
        .find(({ name }) => name === 'main');
      if (main === undefined) throw new Error('mounted fixture lost its main database');
      seedDependencyAuthority(main.file);
    }
    const document = planDocumentFixture();
    document.document.version = 11;
    Reflect.set(document.workItems[0] ?? {}, 'attempts', {});
    document.typedDependencies = [
      {
        id: 'cross',
        type: 'FS',
        predecessor: {
          kind: 'external',
          scope: 'whole',
          projectId: 'source-project',
          workItemId: 'stable-row',
          display: {
            projectName: 'Source',
            abbreviation: 'SRC',
            workItemName: 'Prerequisite',
            address: 'SRC.1',
          },
        },
        successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
      },
    ];
    const before = sqliteState();
    const answer = await h.call('ada', 'POST', '/api/projects/import', document);
    expect(answer).toMatchObject(
      seeded
        ? {
            status: 400,
            body: { error: 'unknown_ref', path: 'typedDependencies[0].predecessor' },
          }
        : {
            status: 409,
            body: { error: 'external_dependencies_inactive', detail: 'typedDependencies[0]' },
          },
    );
    expect(sqliteState()).toEqual(before);
  });
}

for (const version of [1, 2, 3] as const) {
  it(`mounted v${String(version)} refuses a disguised external prerequisite without writes or events`, async () => {
    const document = planDocumentFixture();
    document.document.version = version;
    if (version === 1)
      for (const step of document.steps) Reflect.deleteProperty(step, 'allowancePercent');
    document.typedDependencies = [
      {
        id: 'cross',
        type: 'FS',
        predecessor: {
          kind: 'external',
          scope: 'whole',
          projectId: 'source-project',
          workItemId: 'stable-row',
          display: {
            projectName: 'Source',
            abbreviation: 'SRC',
            workItemName: 'Prerequisite',
            address: 'SRC.1',
          },
        },
        successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
      },
    ];
    const before = sqliteState();
    const answer = await h.call('ada', 'POST', '/api/projects/import', document);
    expect(answer).toMatchObject({
      status: 400,
      body: { error: 'invalid_typed_dependency', path: 'typedDependencies[0]' },
    });
    expect(sqliteState()).toEqual(before);
  });
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

  it('keeps a slug only another organization holds', async () => {
    const held = await create('grace', 'B plan');
    h.sqlite.run(
      "UPDATE project SET solution_slug = 'shared', solution_url = 'https://x.example/shared' WHERE id = ?",
      [held],
    );
    const answers = [];
    for (const slug of ['shared', 'shared', 'free']) {
      const document = planDocumentFixture();
      const imported = await h.call('ada', 'POST', '/api/projects/import', {
        ...document,
        settings: { ...document.settings, solutionRef: { slug, url: `https://x.example/${slug}` } },
      });
      expect(imported.status).toBe(201);
      answers.push((imported.body as { solutionRef: string }).solutionRef);
    }
    expect(answers).toEqual(['kept', 'left-off', 'kept']);
    expect((await h.call('ada', 'GET', '/plans/by-solution/shared')).status).toBe(200);
    expect((await h.call('grace', 'GET', '/plans/by-solution/shared')).body).toMatchObject({
      project: { id: held },
    });
  });

  it('refuses an empty solution slug or url as input, importing nothing', async () => {
    const before = await h.call('ada', 'GET', '/api/projects');
    for (const solutionRef of [
      { slug: '', url: 'https://x.example/empty' },
      { slug: 'empty', url: '' },
    ]) {
      const document = planDocumentFixture();
      const refused = await h.call('ada', 'POST', '/api/projects/import', {
        ...document,
        settings: { ...document.settings, solutionRef },
      });
      expect(refused.status).toBe(400);
    }
    expect(await h.call('ada', 'GET', '/api/projects')).toEqual(before);
  });

  it("tells only the organization's projects that its directory changed", async () => {
    const mine = await create('ada', 'A plan');
    const theirs = await create('grace', 'B plan');
    expect(
      (await h.call('ada', 'POST', '/api/projects/import', planDocumentFixture())).status,
    ).toBe(201);
    const told = h.sqlite
      .query<{ subscription: string }, []>(
        "SELECT subscription FROM event_log WHERE message LIKE '%directory_changed%'",
      )
      .all()
      .map((row) => row.subscription);
    expect(told.some((subscription) => subscription.includes(mine))).toBe(true);
    expect(told.some((subscription) => subscription.includes(theirs))).toBe(false);
  });

  it('records the imported earlier project displacing a tied lower project', async () => {
    const originalNow = Date.now.bind(Date);
    const originalUuid = crypto.randomUUID.bind(crypto);
    const createdAt = Date.UTC(2026, 9, 5);
    let prefix = 'f';
    let nextId = 0;
    Date.now = () => createdAt;
    crypto.randomUUID = () =>
      `${prefix}0000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}`;
    try {
      entry('person', 'person_organization', 'ana', 'a', 'Ana');
      const lower = await create('ada', 'B lower');
      const lowerStep = await firstStep('ada', lower);
      h.sqlite.run(
        "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
        [lower],
      );
      h.sqlite.run(
        "INSERT INTO work_item (id, project_id, position, name) VALUES ('lower-row', ?, 10, 'Lower')",
        [lower],
      );
      h.sqlite.run(
        "INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('lower-row', ?, 1, 1, 1)",
        [lowerStep],
      );
      h.sqlite.run(
        "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('lower-row', ?, 'ana')",
        [lowerStep],
      );
      h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      const before = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
      expect(before.status).toBe(200);
      expect(before.body).toMatchObject({ workItems: [{ schedule: { earliestStart: 0 } }] });

      prefix = '0';
      nextId = 0;
      const imported = await h.call(
        'ada',
        'POST',
        '/api/projects/import',
        sharedAnaDocument('Earlier A'),
      );
      expect(imported.status).toBe(201);
      const earlier = (imported.body as { projectId: string }).projectId;
      expect(earlier < lower).toBe(true);
      const order = await h.call('ada', 'GET', '/api/organization/project-rank');
      expect(order.status).toBe(200);
      expect(
        (order.body as { projects: { projectId: string }[] }).projects.map(
          ({ projectId }) => projectId,
        ),
      ).toEqual([earlier, lower]);
      const after = await h.call('ada', 'GET', `/api/projects/${lower}/work-items`);
      expect(after.status).toBe(200);
      expect(after.body).toMatchObject({ workItems: [{ schedule: { earliestStart: 1 } }] });
      const events = h.sqlite
        .query<{ message: string }, [string]>(
          'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
        )
        .all(`project:${lower}`)
        .map(({ message }) => JSON.parse(message) as unknown)
        .filter((event) =>
          typeof event === 'object' && event !== null && 'type' in event
            ? event.type === 'elsewhere_changed'
            : false,
        );
      expect(events).toEqual([
        { type: 'elsewhere_changed', projectId: lower, causeProjectId: earlier },
      ]);
    } finally {
      Date.now = originalNow;
      crypto.randomUUID = originalUuid;
    }
  });

  it('records a shared-person tail import only for the new recipient', async () => {
    const originalNow = Date.now;
    try {
      Date.now = () => Date.UTC(2026, 9, 5);
      entry('person', 'person_organization', 'ana', 'a', 'Ana');
      const higher = await create('ada', 'Higher B');
      const step = await firstStep('ada', higher);
      h.sqlite.run(
        "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
        [higher],
      );
      h.sqlite.run(
        "INSERT INTO work_item (id, project_id, position, name) VALUES ('higher-row', ?, 10, 'Higher')",
        [higher],
      );
      h.sqlite.run(
        "INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES ('higher-row', ?, 1, 1, 1)",
        [step],
      );
      h.sqlite.run(
        "INSERT INTO assignment (work_item_id, step_id, person_id) VALUES ('higher-row', ?, 'ana')",
        [step],
      );
      h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      Date.now = () => Date.UTC(2026, 9, 6);
      const imported = await h.call(
        'ada',
        'POST',
        '/api/projects/import',
        sharedAnaDocument('Tail A'),
      );
      expect(imported.status).toBe(201);
      const tail = (imported.body as { projectId: string }).projectId;
      const order = await h.call('ada', 'GET', '/api/organization/project-rank');
      expect(
        (order.body as { projects: { projectId: string }[] }).projects.map(
          ({ projectId }) => projectId,
        ),
      ).toEqual([higher, tail]);
      const rows = h.sqlite
        .query<{ message: string }, []>('SELECT message FROM event_log ORDER BY subscription, seq')
        .all()
        .map(
          ({ message }) =>
            JSON.parse(message) as { type: string; projectId: string; causeProjectId?: string },
        )
        .filter(({ type }) => type === 'elsewhere_changed');
      expect(rows).toEqual([
        { type: 'elsewhere_changed', projectId: tail, causeProjectId: higher },
      ]);
    } finally {
      Date.now = originalNow;
    }
  });

  it('records two real displaced recipients for an earlier tied import', async () => {
    const originalNow = Date.now.bind(Date);
    const originalUuid = crypto.randomUUID.bind(crypto);
    let prefix = 'f';
    let nextId = 0;
    Date.now = () => Date.UTC(2026, 9, 5);
    crypto.randomUUID = () =>
      `${prefix}0000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}`;
    try {
      entry('person', 'person_organization', 'ana', 'a', 'Ana');
      const first = await seedAssignedProject('B lower', 'lower-b');
      const second = await seedAssignedProject('C lower', 'lower-c');
      h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      prefix = '0';
      nextId = 0;
      const imported = await h.call(
        'ada',
        'POST',
        '/api/projects/import',
        sharedAnaDocument('Earlier A'),
      );
      expect(imported.status).toBe(201);
      const earlier = (imported.body as { projectId: string }).projectId;
      const rows = h.sqlite
        .query<{ message: string }, []>('SELECT message FROM event_log ORDER BY subscription, seq')
        .all()
        .map(
          ({ message }) =>
            JSON.parse(message) as { type: string; projectId: string; causeProjectId?: string },
        )
        .filter(({ type }) => type === 'elsewhere_changed');
      expect(rows).toEqual([
        { type: 'elsewhere_changed', projectId: first, causeProjectId: earlier },
        { type: 'elsewhere_changed', projectId: second, causeProjectId: earlier },
        { type: 'elsewhere_changed', projectId: second, causeProjectId: first },
      ]);
    } finally {
      Date.now = originalNow;
      crypto.randomUUID = originalUuid;
    }
  });

  it('rolls back the whole import when a later real recipient event insert fails', async () => {
    h.close();
    let pushes = 0;
    h = OrganizationHarness.openComposed(false, undefined, undefined, undefined, undefined, () => {
      pushes += 1;
      return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
    });
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member');
    h.bind('ada', 'org-a');
    h.activate();
    const originalNow = Date.now.bind(Date);
    const originalUuid = crypto.randomUUID.bind(crypto);
    let prefix = 'f';
    let nextId = 0;
    Date.now = () => Date.UTC(2026, 9, 5);
    crypto.randomUUID = () =>
      `${prefix}0000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}`;
    try {
      entry('person', 'person_organization', 'ana', 'a', 'Ana');
      const first = await seedAssignedProject('B lower', 'lower-b');
      const second = await seedAssignedProject('C lower', 'lower-c');
      h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      h.sqlite.run(`CREATE TRIGGER fail_later_import_event BEFORE INSERT ON event_log
        WHEN NEW.subscription = 'project:${second}'
          AND (SELECT COUNT(*) FROM event_log WHERE subscription = 'project:${first}'
            AND message LIKE '%elsewhere_changed%') > 0
        BEGIN SELECT RAISE(ABORT, 'later recipient insert'); END`);
      const before = sqliteState();
      prefix = '0';
      nextId = 0;
      const refused = await h.call(
        'ada',
        'POST',
        '/api/projects/import',
        sharedAnaDocument('Earlier A'),
      );
      expect(refused.status).toBe(500);
      expect(sqliteState()).toEqual(before);
      expect(pushes).toBe(0);
    } finally {
      Date.now = originalNow;
      crypto.randomUUID = originalUuid;
    }
  });

  it('does not begin import writes or delivery when the borrowed before capture fails', async () => {
    h.close();
    let failCapture = false;
    let pushes = 0;
    h = OrganizationHarness.openComposed(
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      () => {
        pushes += 1;
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
      () => {
        if (failCapture) throw new Error('injected import capture failure');
      },
    );
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member');
    h.bind('ada', 'org-a');
    h.activate();
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const before = sqliteState();
    failCapture = true;
    expect(
      (await h.call('ada', 'POST', '/api/projects/import', sharedAnaDocument('Unwritten'))).status,
    ).toBe(500);
    expect(sqliteState()).toEqual(before);
    expect(pushes).toBe(0);
  });

  it('rolls back completed import writes when the borrowed after capture fails', async () => {
    h.close();
    let captures = 0;
    let pushes = 0;
    h = OrganizationHarness.openComposed(
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      () => {
        pushes += 1;
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
      () => {
        captures += 1;
        if (captures === 2) throw new Error('injected import after capture failure');
      },
    );
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member');
    h.bind('ada', 'org-a');
    h.activate();
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const before = sqliteState();
    expect(
      (await h.call('ada', 'POST', '/api/projects/import', planDocumentFixture())).status,
    ).toBe(500);
    expect(captures).toBe(2);
    expect(sqliteState()).toEqual(before);
    expect(pushes).toBe(0);
  });

  it('returns a typed late source refusal and rolls back the installed scoped import', async () => {
    h.close();
    let captures = 0;
    let pushes = 0;
    h = OrganizationHarness.openComposed(
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      () => {
        pushes += 1;
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
      () => {
        captures += 1;
      },
    );
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member');
    h.bind('ada', 'org-a');
    h.activate();
    h.sqlite.run(`CREATE TRIGGER lose_import_tag AFTER INSERT ON work_item
      BEGIN DELETE FROM tag; END`);
    const before = sqliteState();
    const refused = await h.call('ada', 'POST', '/api/projects/import', planDocumentFixture());
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      error: 'source_refused',
      path: 'workItems[0]',
      detail: 'unknown_tag',
    });
    expect(sqliteState()).toEqual(before);
    expect(captures).toBe(1);
    expect(pushes).toBe(0);
  });

  it('keeps committed import and event rows when the downstream push refuses delivery', async () => {
    h.close();
    let eventPushes = 0;
    h = OrganizationHarness.openComposed(
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      (_url, init) => {
        if (typeof init?.body !== 'string') throw new Error('push body is not serialized JSON');
        const pushed = JSON.parse(init.body) as { message: { type: string } };
        if (pushed.message.type === 'elsewhere_changed') {
          eventPushes += 1;
          return Promise.resolve(new Response('injected transport refusal', { status: 400 }));
        }
        return Promise.resolve(Response.json({ delivered_to_sockets: 0 }));
      },
    );
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member');
    h.bind('ada', 'org-a');
    h.activate();
    entry('person', 'person_organization', 'ana', 'a', 'Ana');
    const higher = await seedAssignedProject('Higher B', 'higher-row');
    h.sqlite.run('UPDATE project SET created_at = 1 WHERE id = ?', [higher]);
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const imported = await h.call(
      'ada',
      'POST',
      '/api/projects/import',
      sharedAnaDocument('Tail A'),
    );
    expect(imported.status).toBe(201);
    const tail = (imported.body as { projectId: string }).projectId;
    expect(h.sqlite.query('SELECT id FROM project WHERE id = ?').all(tail)).toHaveLength(1);
    const events = h.sqlite
      .query<{ message: string }, [string]>('SELECT message FROM event_log WHERE subscription = ?')
      .all(`project:${tail}`)
      .map(
        ({ message }) =>
          JSON.parse(message) as { type: string; projectId: string; causeProjectId?: string },
      );
    expect(events).toContainEqual({
      type: 'elsewhere_changed',
      projectId: tail,
      causeProjectId: higher,
    });
    expect(eventPushes).toBe(1);
  });

  it('keeps directory reconciliation inside its one borrowed import owner', async () => {
    h.close();
    let owners = 0;
    let captures = 0;
    h = OrganizationHarness.openComposed(
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      () => {
        captures += 1;
      },
      undefined,
      () => {
        owners += 1;
      },
    );
    await h.register('ada');
    h.organization('org-a');
    h.member('org-a', 'ada', 'member');
    h.bind('ada', 'org-a');
    h.activate();
    const overdue = Promise.withResolvers<never>();
    const deadline = setTimeout(() => {
      overdue.reject(new Error('borrowed import nested another owner'));
    }, 2000);
    let imported;
    try {
      imported = await Promise.race([
        h.call('ada', 'POST', '/api/projects/import', planDocumentFixture()),
        overdue.promise,
      ]);
    } finally {
      clearTimeout(deadline);
    }
    expect(imported.status).toBe(201);
    expect(owners).toBe(1);
    expect(captures).toBe(2);
  });

  it('keeps an unused-person import silent in the durable fan-out log', async () => {
    await create('ada', 'Existing without Ana');
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const imported = await h.call(
      'ada',
      'POST',
      '/api/projects/import',
      sharedAnaDocument('Unconnected'),
    );
    expect(imported.status).toBe(201);
    const events = h.sqlite
      .query<{ message: string }, []>('SELECT message FROM event_log')
      .all()
      .map(({ message }) => JSON.parse(message) as { type: string })
      .filter(({ type }) => type === 'elsewhere_changed');
    expect(events).toEqual([]);
  });

  for (const refusal of ['viewer', 'removed', 'corrupt'] as const)
    it(`refuses a queued import after membership becomes ${refusal} before capture`, async () => {
      h.close();
      let captures = 0;
      const enteredImport = Promise.withResolvers<undefined>();
      h = OrganizationHarness.openComposed(
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        () => {
          captures += 1;
        },
        undefined,
        () => {
          enteredImport.resolve(undefined);
        },
      );
      await h.register('ada');
      h.organization('org-a');
      h.member('org-a', 'ada', 'member');
      h.bind('ada', 'org-a');
      h.activate();
      const release = Promise.withResolvers<undefined>();
      const enteredTurn = Promise.withResolvers<undefined>();
      const held = h.holdWriteTurn(release.promise, () => {
        enteredTurn.resolve(undefined);
      });
      await enteredTurn.promise;
      const pending = h.call('ada', 'POST', '/api/projects/import', planDocumentFixture());
      await enteredImport.promise;
      if (refusal === 'removed')
        h.sqlite.run(
          "DELETE FROM organization_membership WHERE organization_id = 'org-a' AND user_id = ?",
          [h.userId('ada')],
        );
      else {
        if (refusal === 'corrupt') h.sqlite.run('PRAGMA ignore_check_constraints = ON');
        h.sqlite.run(
          "UPDATE organization_membership SET role = ? WHERE organization_id = 'org-a' AND user_id = ?",
          [refusal === 'corrupt' ? 'unreadable' : 'viewer', h.userId('ada')],
        );
        if (refusal === 'corrupt') h.sqlite.run('PRAGMA ignore_check_constraints = OFF');
      }
      release.resolve(undefined);
      await held;
      expect(await pending).toEqual(
        refusal === 'corrupt'
          ? { status: 500, body: 'Internal Server Error' }
          : { status: 403, body: { error: refusal === 'removed' ? 'not_a_member' : 'forbidden' } },
      );
      expect(captures).toBe(0);
      expect(h.sqlite.query('SELECT id FROM project').all()).toEqual([]);
      expect(h.sqlite.query('SELECT id FROM event_log').all()).toEqual([]);
    });

  it("refuses a viewer's import", async () => {
    expect(await h.call('vic', 'POST', '/api/projects/import', planDocumentFixture())).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(
      (await h.call('ada', 'GET', '/api/projects')).body as {
        projects: unknown[];
        nextCursor: string | null;
      },
    ).toEqual({
      projects: [],
      nextCursor: null,
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
  it('answers a foreign solution slug as an absent one, even when its row is unreadable', async () => {
    const held = await create('grace', 'B plan');
    h.sqlite.run(
      "UPDATE project SET solution_slug = 'broken', solution_url = 'https://x.example/broken', estimate_method = 'broken' WHERE id = ?",
      [held],
    );
    expect(await h.call('ada', 'GET', '/plans/by-solution/broken')).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    expect((await h.call('grace', 'GET', '/plans/by-solution/broken')).status).toBe(500);
  });

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

it('round-trips minute units through the composed import/export and refuses malformed minute documents atomically', async () => {
  const document = planDocumentFixture();
  document.document.version = 8;
  for (const row of document.workItems) Reflect.set(row, 'attempts', {});
  document.steps = document.steps.map((step) => ({ ...step, estimateUnit: 'minutes' }));
  for (const fault of ['missing-unit', 'unknown-unit', 'fractional', 'above-max']) {
    const damaged = structuredClone(document);
    const step = damaged.steps.at(0);
    const row = damaged.workItems.at(0);
    if (step === undefined || row === undefined) throw new Error('minute fixture is empty');
    if (fault === 'missing-unit') Reflect.deleteProperty(step, 'estimateUnit');
    else if (fault === 'unknown-unit') Reflect.set(step, 'estimateUnit', 'hours');
    else
      Reflect.set(
        row.estimates,
        step.id,
        fault === 'fractional'
          ? { optimistic: 1.5, realistic: 2, pessimistic: 3 }
          : { optimistic: 21_474_836_161, realistic: 21_474_836_161, pessimistic: 21_474_836_161 },
      );
    const before = h.sqlite.query('SELECT * FROM project').all();
    const refused = await h.call('ada', 'POST', '/api/projects/import', damaged);
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ error: 'invalid_body' });
    expect(h.sqlite.query('SELECT * FROM project').all()).toEqual(before);
  }
  const imported = await h.call('ada', 'POST', '/api/projects/import', document);
  if (imported.status !== 201)
    throw new Error(`minute import refused: ${JSON.stringify(imported.body)}`);
  expect(imported.status).toBe(201);
  const { projectId } = imported.body as { projectId: string };
  expect(
    h.sqlite.query('SELECT estimate_unit FROM step WHERE project_id = ?').all(projectId),
  ).toEqual([{ estimate_unit: 'minutes' }, { estimate_unit: 'minutes' }]);
  const exported = await h.call('ada', 'GET', `/api/projects/${projectId}/export?format=json`);
  expect(exported.status).toBe(200);
  expect(exported.body).toMatchObject({
    document: { version: 11 },
    steps: [{ estimateUnit: 'minutes' }, { estimateUnit: 'minutes' }],
  });
  const stepId = await firstStep('ada', projectId);
  const unitRefusal = await h.call('ada', 'PATCH', `/api/projects/${projectId}/steps/${stepId}`, {
    estimateUnit: 'workdays',
  });
  expect(unitRefusal.status).toBe(409);
});

describe('v9 direct blockage transfer', () => {
  it('refuses disabled nonempty v9 import atomically but permits empty import and export', async () => {
    const document = planDocumentFixture();
    document.document.version = 9;
    document.workItems.forEach((row) => Reflect.deleteProperty(row, 'attempts'));
    document.stepBlockages = [{ workItemId: 'row-1', stepId: 'step-1', blockedAt: -17 }];
    const before = sqliteState();
    const refused = await h.call('ada', 'POST', '/api/projects/import', document);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: 'step_blockage_inactive' });
    expect(sqliteState()).toEqual(before);
    document.stepBlockages = [];
    const imported = await h.call('ada', 'POST', '/api/projects/import', document);
    expect(imported.status).toBe(201);
    const projectId = (imported.body as { projectId: string }).projectId;
    const exported = await h.call('ada', 'GET', `/api/projects/${projectId}/export?format=json`);
    expect(exported.status).toBe(200);
    expect(exported.body).toMatchObject({ stepBlockages: [] });
  });

  it('imports remapped facts and captures them in the mounted export', async () => {
    activateTestStepBlockages(h.sqlite.filename);
    const document = planDocumentFixture();
    document.document.version = 9;
    document.workItems.forEach((row) => Reflect.deleteProperty(row, 'attempts'));
    document.stepBlockages = [{ workItemId: 'row-1', stepId: 'step-1', blockedAt: -17 }];
    const imported = await h.call('ada', 'POST', '/api/projects/import', document);
    expect(imported.status).toBe(201);
    const projectId = (imported.body as { projectId: string }).projectId;
    const exported = await h.call('ada', 'GET', `/api/projects/${projectId}/export?format=json`);
    expect(exported.status).toBe(200);
    const body = exported.body as {
      document: { version: number };
      stepBlockages: { workItemId: string; stepId: string; blockedAt: number }[];
      workItems: { id: string; name: string; blockages?: unknown; blockageCauses?: unknown }[];
      steps: { id: string; name: string }[];
    };
    expect(body.document.version).toBe(11);
    const owner = body.workItems.find(({ name }) => name === 'Ship');
    const step = body.steps.find(({ name }) => name === 'Build');
    if (owner === undefined || step === undefined)
      throw new Error('missing imported owner or step');
    expect(body.stepBlockages).toEqual([
      {
        workItemId: owner.id,
        stepId: step.id,
        blockedAt: -17,
      },
    ]);
    expect(body.workItems[0]).not.toHaveProperty('blockages');
    expect(body.workItems[0]).not.toHaveProperty('blockageCauses');
  });

  it('rolls back the entire scoped import after the first real blockage insert', async () => {
    activateTestStepBlockages(h.sqlite.filename);
    const document = planDocumentFixture();
    document.document.version = 9;
    document.workItems.forEach((row) => Reflect.deleteProperty(row, 'attempts'));
    document.stepBlockages = [
      { workItemId: 'row-1', stepId: 'step-1', blockedAt: -17 },
      { workItemId: 'row-1', stepId: 'step-2', blockedAt: 31 },
    ];
    h.sqlite.run(`CREATE TRIGGER fail_second_import_blockage BEFORE INSERT ON step_blockage
      WHEN (SELECT COUNT(*) FROM step_blockage) > 0
      BEGIN SELECT RAISE(ABORT, 'second blockage insert'); END`);
    const before = sqliteState();
    const refused = await h.call('ada', 'POST', '/api/projects/import', document);
    expect(refused.status).toBe(500);
    expect(sqliteState()).toEqual(before);
  });

  for (const [owner, step, path] of [
    ['missing', 'step-1', 'stepBlockages[0].workItemId'],
    ['row-1', 'missing', 'stepBlockages[0].stepId'],
  ] as const) {
    it(`refuses ${path} before scoped writes`, async () => {
      const document = planDocumentFixture();
      document.document.version = 9;
      document.workItems.forEach((row) => Reflect.deleteProperty(row, 'attempts'));
      document.stepBlockages = [{ workItemId: owner, stepId: step, blockedAt: 1 }];
      const before = sqliteState();
      const refused = await h.call('ada', 'POST', '/api/projects/import', document);
      expect(refused.status).toBe(400);
      expect(refused.body).toEqual({ error: 'invalid_body', path, detail: null });
      expect(sqliteState()).toEqual(before);
    });
  }
});

for (const mode of ['isolated', 'shared'] as const) {
  it(`v9 sparse export fence refuses authored equality without mutation (${mode})`, async () => {
    const projectId = await assignedProject();
    const stepId = await firstStep('ada', projectId);
    const owner = h.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id = ?')
      .get(projectId);
    if (owner === null) throw new Error('missing export owner');
    if (mode === 'shared') {
      h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    }
    const empty = await h.call('ada', 'GET', `/api/projects/${projectId}/export?format=json`);
    expect(empty.status).toBe(200);
    h.sqlite.run(
      'INSERT INTO step_parallel (work_item_id, step_id, max_parallel, created_at, updated_at) VALUES (?, ?, 1, 1, 1)',
      [owner.id, stepId],
    );
    const before = sqliteState();
    for (const actor of ['ada', 'vic']) {
      const answer = await h.call(actor, 'GET', `/api/projects/${projectId}/export?format=json`);
      expect(answer).toMatchObject({
        status: 409,
        body: { error: 'unsupported_step_parallelism' },
      });
      expect(answer.body).toEqual({ error: 'unsupported_step_parallelism' });
    }
    expect(
      (await h.call('ada', 'GET', `/api/projects/${projectId}/export?format=markdown`)).status,
    ).toBe(200);
    expect(sqliteState()).toEqual(before);
    h.sqlite.run('DELETE FROM step_parallel WHERE work_item_id = ? AND step_id = ?', [
      owner.id,
      stepId,
    ]);
    expect(
      (await h.call('ada', 'GET', `/api/projects/${projectId}/export?format=json`)).status,
    ).toBe(200);
  });
}

for (const mode of ['isolated', 'shared'] as const) {
  it(`v9 sparse export authorizes before reading sparse facts (${mode})`, async () => {
    const projectId = await assignedProject();
    if (mode === 'shared')
      h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    const unavailable = spyOn(StepParallelRepository.prototype, 'listByProject').mockRejectedValue(
      new Error('sparse authority must not be read'),
    );
    try {
      expect(
        (await h.call('grace', 'GET', `/api/projects/${projectId}/export?format=json`)).status,
      ).toBe(404);
      expect((await h.call('ada', 'GET', '/api/projects/missing/export?format=json')).status).toBe(
        404,
      );
      expect(
        (await h.call('nell', 'GET', `/api/projects/${projectId}/export?format=json`)).status,
      ).toBe(403);
      expect(
        (await h.call('ada', 'GET', `/api/projects/${projectId}/export?format=json`)).status,
      ).toBe(500);
    } finally {
      unavailable.mockRestore();
    }
  });
}

it('v9 sparse export retains uncoded refusal for valid shared evidence', async () => {
  const projectId = await assignedProject();
  const stepId = await firstStep('ada', projectId);
  const owner = h.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id = ?')
    .get(projectId);
  if (owner === null) throw new Error('missing export owner');
  h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
  h.sqlite.run('INSERT INTO step_parallel (work_item_id, step_id, max_parallel) VALUES (?, ?, 1)', [
    owner.id,
    stepId,
  ]);
  h.sqlite.run('UPDATE step SET code = NULL WHERE id = ?', [stepId]);
  const answer = await h.call('ada', 'GET', `/api/projects/${projectId}/export?format=json`);
  expect(answer).toMatchObject({
    status: 409,
    body: {
      error: 'uncoded_steps',
      steps: [{ id: stepId, name: 'Dev' }],
      command: 'bun run src/backfill-step-codes-cli.ts',
    },
  });
  const unreadable = spyOn(StepParallelRepository.prototype, 'listByProject').mockRejectedValue(
    new Error('unreadable sparse evidence'),
  );
  try {
    expect(
      (await h.call('ada', 'GET', `/api/projects/${projectId}/export?format=json`)).status,
    ).toBe(500);
  } finally {
    unreadable.mockRestore();
  }
});
