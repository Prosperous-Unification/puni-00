import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { type Answer, OrganizationHarness } from '../testing/organization-harness';

/**
 * Project command batches, undo and redo under organization isolation (task
 * 3.4, part 1), over be-01's production composition and real SQLite; see
 * {@link OrganizationHarness.openComposed}. Directory commands have their own
 * suite, `directory-command-organization.controller.db.test.ts`.
 *
 * Each organization owns one entry of every catalog, seeded as SQL with a
 * root name that differs from its local name.
 */
let h: OrganizationHarness;
let own: string;
let foreign: string;
let ownStep: string;
let foreignStep: string;
let changeAfterResolution: (() => void) | null;
let pushDuringTest: (() => Promise<Response>) | null;

beforeEach(async () => {
  changeAfterResolution = null;
  pushDuringTest = null;
  h = OrganizationHarness.openComposed(
    false,
    () => {
      const change = changeAfterResolution;
      changeAfterResolution = null;
      change?.();
    },
    undefined,
    undefined,
    undefined,
    () => pushDuringTest?.() ?? Promise.resolve(Response.json({ delivered_to_sockets: 0 })),
  );
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
  it('rolls back admitted project and scoped step capture failures before either write', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    h.sqlite.run('DROP TABLE project_rank');
    const tables = ['project', 'step', 'organization_audit', 'event_log', 'event_sequencer'];
    const before = tables.map((table) =>
      h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { startDate: '2026-10-06' })).status,
    ).toBe(500);
    expect(
      tables.map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    ).toEqual(before);
    expect(
      (await h.call('nell', 'DELETE', `/api/projects/${own}/steps/${ownStep}?cascade=true`)).status,
    ).toBe(500);
    expect(
      tables.map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all()),
    ).toEqual(before);
  });

  it('refuses a queued project demotion before shared observation', async () => {
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    h.sqlite.run('DROP TABLE project_rank');
    changeAfterResolution = () => {
      h.sqlite.run(
        "UPDATE organization_membership SET role = 'viewer' WHERE organization_id = 'org-a' AND user_id = ?",
        [h.userId('ada')],
      );
    };
    const before = ['project', 'organization_audit', 'event_log', 'event_sequencer'].map((table) =>
      h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
    expect(
      await h.call('ada', 'PATCH', `/api/projects/${own}`, { startDate: '2026-10-06' }),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(
      ['project', 'organization_audit', 'event_log', 'event_sequencer'].map((table) =>
        h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    ).toEqual(before);
  });

  it('refuses a queued scoped recovery demotion before shared observation', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    h.sqlite.run('DROP TABLE project_rank');
    changeAfterResolution = () => {
      h.sqlite.run(
        "UPDATE organization_membership SET role = 'admin' WHERE organization_id = 'org-a' AND user_id = ?",
        [h.userId('nell')],
      );
    };
    const before = ['step', 'organization_audit', 'event_log', 'event_sequencer'].map((table) =>
      h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    );
    expect(
      await h.call('nell', 'DELETE', `/api/projects/${own}/steps/${ownStep}?cascade=true`),
    ).toEqual({ status: 403, body: { error: 'forbidden' } });
    expect(
      ['step', 'organization_audit', 'event_log', 'event_sequencer'].map((table) =>
        h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    ).toEqual(before);
  });

  it('keeps one scoped step recovery audit and its downstream fan-out in the same turn', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    const downstream = [
      await create('ada', 'Recovery downstream B'),
      await create('ada', 'Recovery downstream C'),
    ];
    const upstreamRow = rowOf(own).id;
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    for (const projectId of [own, ...downstream])
      h.sqlite.run(
        "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
        [projectId],
      );
    const rows: [string, string][] = [[upstreamRow, ownStep]];
    for (const [index, projectId] of downstream.entries()) {
      const stepId = await firstStep('ada', projectId);
      const workItemId = `recovery-downstream-${String(index)}`;
      h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
        workItemId,
        projectId,
        workItemId,
      ]);
      rows.push([workItemId, stepId]);
    }
    for (const [workItemId, stepId] of rows) {
      h.sqlite.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
        [workItemId, stepId],
      );
      h.sqlite.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
        workItemId,
        stepId,
        'pe-a',
      ]);
    }
    const audits = () =>
      h.sqlite
        .query<{ detail: string }, []>('SELECT detail FROM organization_audit ORDER BY rowid')
        .all();
    const downstreamEvents = () =>
      h.sqlite
        .query<{ subscription: string; message: string }, []>(
          'SELECT subscription, message FROM event_log ORDER BY rowid',
        )
        .all()
        .filter(({ subscription }) =>
          downstream.some((projectId) => subscription === `project:${projectId}`),
        );
    expect(audits()).toEqual([]);
    expect(
      (await h.call('nell', 'PATCH', `/api/projects/${own}`, { startDate: '2026-10-06' })).status,
    ).toBe(200);
    expect(audits()).toEqual([{ detail: '{"fields":["startDate"]}' }]);
    expect(downstreamEvents()).toHaveLength(2);
    const before = [
      'step',
      'estimate',
      'assignment',
      'organization_audit',
      'event_log',
      'event_sequencer',
    ].map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    h.sqlite.run(
      "UPDATE organization_membership SET role = 'viewer' WHERE organization_id = 'org-a' AND user_id = ?",
      [h.userId('ada')],
    );
    expect(
      await h.removeBareStep(own, ownStep, h.userId('ada'), true, {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: h.userId('ada'), role: 'member' },
      }),
    ).toEqual({ ok: false, reason: 'forbidden' });
    h.sqlite.run(
      "UPDATE organization_membership SET role = 'member' WHERE organization_id = 'org-a' AND user_id = ?",
      [h.userId('ada')],
    );
    expect(
      await h.removeBareStep(own, ownStep, h.userId('nell'), true, {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: h.userId('nell'), role: 'super_admin' },
      }),
    ).toEqual({ ok: false, reason: 'forbidden' });
    expect(
      ['step', 'estimate', 'assignment', 'organization_audit', 'event_log', 'event_sequencer'].map(
        (table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    ).toEqual(before);
    const second = [...downstream].sort().at(1);
    if (second === undefined) throw new Error('second recovery recipient is absent');
    h.sqlite.run(
      `CREATE TRIGGER fail_recovery_fanout BEFORE INSERT ON event_log WHEN NEW.subscription = 'project:${second}' BEGIN SELECT RAISE(FAIL, 'injected recovery fan-out failure'); END`,
    );
    let bareFailure: unknown;
    try {
      await h.removeBareStep(own, ownStep, h.userId('ada'), true, {
        kind: 'scoped',
        scope: { organizationId: 'org-a', userId: h.userId('ada'), role: 'member' },
      });
    } catch (cause) {
      bareFailure = cause;
    }
    expect(bareFailure).toBeInstanceOf(Error);
    expect((bareFailure as Error).message).toContain('Failed query');
    expect(
      ['step', 'estimate', 'assignment', 'organization_audit', 'event_log', 'event_sequencer'].map(
        (table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    ).toEqual(before);
    expect(
      (await h.call('nell', 'DELETE', `/api/projects/${own}/steps/${ownStep}?cascade=true`)).status,
    ).toBe(500);
    expect(
      ['step', 'estimate', 'assignment', 'organization_audit', 'event_log', 'event_sequencer'].map(
        (table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    ).toEqual(before);
    h.sqlite.run('DROP TRIGGER fail_recovery_fanout');
    let enterPush!: () => void;
    let releasePush!: () => void;
    const pushEntered = new Promise<void>((resolve) => {
      enterPush = resolve;
    });
    const heldPush = new Promise<void>((resolve) => {
      releasePush = resolve;
    });
    pushDuringTest = async () => {
      enterPush();
      await heldPush;
      return Response.json({ delivered_to_sockets: 0 });
    };
    const removal = h.call('nell', 'DELETE', `/api/projects/${own}/steps/${ownStep}?cascade=true`);
    await pushEntered;
    // Proof: moving recovery delivery into its UoW blocked this independent
    // SQLite writer until the held gateway push timed out with SQLITE_BUSY.
    try {
      h.sqlite.run('UPDATE project SET name = ? WHERE id = ?', ['writer entered', own]);
    } finally {
      releasePush();
    }
    expect((await removal).status).toBe(204);
    expect(audits()).toEqual([
      { detail: '{"fields":["startDate"]}' },
      { detail: '{"step":"remove"}' },
    ]);
    const [bridgeRecipient, lastRecipient] = downstream;
    const changed = (projectId: string, causeProjectId: string) => ({
      type: 'elsewhere_changed',
      projectId,
      causeProjectId,
    });
    const order = (left: ReturnType<typeof changed>, right: ReturnType<typeof changed>) =>
      left.projectId.localeCompare(right.projectId) ||
      left.causeProjectId.localeCompare(right.causeProjectId);
    expect(downstreamEvents().map(({ message }) => JSON.parse(message) as unknown)).toEqual([
      ...downstream.map((projectId) => changed(projectId, own)).sort(order),
      ...[
        changed(bridgeRecipient, own),
        changed(lastRecipient, own),
        changed(lastRecipient, bridgeRecipient),
      ].sort(order),
    ]);
  });

  it('captures a scoped recovery step before removal on the mounted route', async () => {
    h.member('org-a', 'nell', 'super_admin');
    h.bind('nell', 'org-a');
    const downstream = await create('ada', 'Scoped recovery recipient');
    const downstreamStep = await firstStep('ada', downstream);
    const upstreamRow = rowOf(own).id;
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
    ).toBe(200);
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    for (const projectId of [own, downstream])
      h.sqlite.run(
        "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
        [projectId],
      );
    h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
      'scoped-recipient-row',
      downstream,
      'scoped-recipient-row',
    ]);
    for (const [workItemId, stepId] of [
      [upstreamRow, ownStep],
      ['scoped-recipient-row', downstreamStep],
    ]) {
      h.sqlite.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
        [workItemId, stepId],
      );
      h.sqlite.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
        workItemId,
        stepId,
        'pe-a',
      ]);
    }
    const removed = await h.call(
      'nell',
      'DELETE',
      `/api/projects/${own}/steps/${ownStep}?cascade=true`,
    );
    expect(removed.status).toBe(204);
    expect(
      h.sqlite
        .query<{ detail: string }, []>('SELECT detail FROM organization_audit ORDER BY rowid')
        .all(),
    ).toEqual([{ detail: '{"step":"remove"}' }]);
    const events = h.sqlite
      .query<{ message: string }, [string]>(
        'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
      )
      .all(`project:${downstream}`);
    // Proof: moving the recovery observation after steps.remove made this
    // mounted DELETE stay 204 but lose its old-step downstream event.
    expect(events.map(({ message }) => JSON.parse(message) as unknown)).toEqual([
      { type: 'elsewhere_changed', projectId: downstream, causeProjectId: own },
    ]);
  });

  it('rolls back the command, history and first recipient when the second fan-out row fails', async () => {
    const downstream = [await create('ada', 'B'), await create('ada', 'C')];
    const upstreamRow = rowOf(own).id;
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    for (const projectId of [own, ...downstream])
      h.sqlite.run(
        "UPDATE project SET start_date = '2026-10-05', estimate_rounding = 'exact' WHERE id = ?",
        [projectId],
      );
    for (const [index, projectId] of downstream.entries()) {
      const stepId = await firstStep('ada', projectId);
      const workItemId = `downstream-${String(index)}`;
      h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
        workItemId,
        projectId,
        workItemId,
      ]);
      h.sqlite.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
        [workItemId, stepId],
      );
      h.sqlite.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
        workItemId,
        stepId,
        'pe-a',
      ]);
    }
    h.sqlite.run(
      'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
      [upstreamRow, ownStep],
    );
    h.sqlite.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
      upstreamRow,
      ownStep,
      'pe-a',
    ]);
    const before = [
      'estimate',
      'command_journal',
      'plan_event',
      'event_log',
      'event_sequencer',
    ].map((table) => h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const second = [...downstream].sort().at(1);
    if (second === undefined) throw new Error('second recipient is absent');
    h.sqlite.run(
      `CREATE TRIGGER fail_second_fanout BEFORE INSERT ON event_log WHEN NEW.subscription = 'project:${second}' BEGIN SELECT RAISE(FAIL, 'injected second fan-out insert failure'); END`,
    );
    expect(
      (
        await batch('ada', own, [
          {
            kind: 'setEstimate',
            workItemId: upstreamRow,
            stepId: ownStep,
            days: { optimistic: 3, realistic: 3, pessimistic: 3 },
          },
        ])
      ).status,
    ).toBe(500);
    expect(
      ['estimate', 'command_journal', 'plan_event', 'event_log', 'event_sequencer'].map((table) =>
        h.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all(),
      ),
    ).toEqual(before);
  });

  it('records one downstream elsewhere event in the same successful command turn without a prior live read', async () => {
    const downstream = await create('ada', 'Downstream');
    const downstreamStep = await firstStep('ada', downstream);
    const upstreamRow = rowOf(own).id;
    h.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
    h.sqlite.run('UPDATE project SET start_date = ?, estimate_rounding = ? WHERE id IN (?, ?)', [
      '2026-10-05',
      'exact',
      own,
      downstream,
    ]);
    h.sqlite.run('INSERT INTO work_item (id, project_id, position, name) VALUES (?, ?, 10, ?)', [
      'downstream-row',
      downstream,
      'Downstream row',
    ]);
    for (const [workItemId, stepId] of [
      [upstreamRow, ownStep],
      ['downstream-row', downstreamStep],
    ]) {
      h.sqlite.run(
        'INSERT INTO estimate (work_item_id, step_id, optimistic, realistic, pessimistic) VALUES (?, ?, 1, 1, 1)',
        [workItemId, stepId],
      );
      h.sqlite.run('INSERT INTO assignment (work_item_id, step_id, person_id) VALUES (?, ?, ?)', [
        workItemId,
        stepId,
        'pe-a',
      ]);
    }
    const rows = () =>
      h.sqlite
        .query<{ message: string }, [string]>(
          'SELECT message FROM event_log WHERE subscription = ? ORDER BY seq',
        )
        .all(`project:${downstream}`);
    const before = rows();
    expect(
      (
        await batch('ada', own, [
          {
            kind: 'setEstimate',
            workItemId: upstreamRow,
            stepId: ownStep,
            days: { optimistic: 3, realistic: 3, pessimistic: 3 },
          },
        ])
      ).status,
    ).toBe(200);
    expect(
      rows()
        .slice(before.length)
        .map(({ message }) => JSON.parse(message) as unknown),
    ).toEqual([{ type: 'elsewhere_changed', projectId: downstream, causeProjectId: own }]);
    expect((await h.call('ada', 'POST', `/api/projects/${own}/undo`)).status).toBe(200);
    expect((await h.call('ada', 'POST', `/api/projects/${own}/redo`)).status).toBe(200);
    expect(
      rows()
        .slice(before.length)
        .map(({ message }) => JSON.parse(message) as unknown),
    ).toEqual(
      Array(3).fill({ type: 'elsewhere_changed', projectId: downstream, causeProjectId: own }),
    );
    expect(
      (await h.call('ada', 'PATCH', `/api/projects/${own}`, { startDate: '2026-10-06' })).status,
    ).toBe(200);
    expect(rows().slice(before.length)).toHaveLength(4);
    expect(
      (await h.call('ada', 'DELETE', `/api/projects/${own}/steps/${ownStep}?cascade=true`)).status,
    ).toBe(204);
    expect(rows().slice(before.length)).toHaveLength(5);
  });

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

  describe('super-admin recovery of a restricted project', () => {
    /** Every audit record, without its generated id and time. */
    const audits = () =>
      h.sqlite
        .query(
          'SELECT organization_id, actor_id, action, subject_kind, subject_id, detail FROM organization_audit ORDER BY rowid',
        )
        .all();
    const recovery = (username: string, detail: string) => ({
      organization_id: 'org-a',
      actor_id: h.userId(username),
      action: 'restricted_project_recovery',
      subject_kind: 'project',
      subject_id: own,
      detail,
    });

    beforeEach(async () => {
      // nell as the super-admin, vic promoted to admin: only a super-admin recovers.
      h.member('org-a', 'nell', 'super_admin');
      h.bind('nell', 'org-a');
      h.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
        h.userId('vic'),
      ]);
      expect(
        (await h.call('ada', 'PATCH', `/api/projects/${own}`, { restricted: true })).status,
      ).toBe(200);
    });

    it('recovers a restricted project through a batch, undo and redo, one record each', async () => {
      const row = rowOf(own);
      expect(
        (
          await batch('nell', own, [
            { kind: 'patchWorkItem', workItemId: row.id, patch: { name: 'Kept' } },
          ])
        ).status,
      ).toBe(200);
      expect(rowOf(own).name).toBe('Kept');
      expect((await h.call('nell', 'POST', `/api/projects/${own}/undo`)).status).toBe(200);
      expect((await h.call('nell', 'POST', `/api/projects/${own}/redo`)).status).toBe(200);
      expect(rowOf(own).name).toBe('Kept');
      expect(audits()).toEqual([
        recovery('nell', '{"commands":["patchWorkItem"]}'),
        recovery('nell', '{"journal":"undo"}'),
        recovery('nell', '{"journal":"redo"}'),
      ]);
      const creator = h.sqlite
        .query<{ owner_id: string }, [string]>('SELECT owner_id FROM project WHERE id = ?')
        .get(own);
      expect(creator).toEqual({ owner_id: h.userId('ada') });
    });

    it('keeps no record of a refused batch, and none of an ordinary one', async () => {
      const before = snapshot();
      expect(
        await batch('nell', own, [
          { kind: 'patchWorkItem', workItemId: rowOf(own).id, patch: { name: 'Half' } },
          { kind: 'patchWorkItem', workItemId: 'no-such-row', patch: { name: 'x' } },
        ]),
      ).toMatchObject({ status: 404 });
      expect(await batch('vic', own, [])).toEqual({ status: 403, body: { error: 'forbidden' } });
      // nell has nothing to undo: the walk fails and takes its record back.
      expect((await h.call('nell', 'POST', `/api/projects/${own}/undo`)).status).toBe(409);
      expect(snapshot()).toEqual(before);
      expect(audits()).toEqual([]);
      expect(
        (
          await batch('ada', own, [
            { kind: 'patchWorkItem', workItemId: rowOf(own).id, patch: { name: 'Mine' } },
          ])
        ).status,
      ).toBe(200);
      expect(audits()).toEqual([]);
    });

    it('refuses a super-admin removed or demoted before the batch', async () => {
      h.sqlite.run("UPDATE organization_membership SET role = 'admin' WHERE user_id = ?", [
        h.userId('nell'),
      ]);
      expect(await batch('nell', own, [])).toEqual({ status: 403, body: { error: 'forbidden' } });
      expect(await h.call('nell', 'POST', `/api/projects/${own}/undo`)).toEqual({
        status: 403,
        body: { error: 'forbidden' },
      });
      expect(audits()).toEqual([]);
    });
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

  it('refuses a foreign directory id exactly as an absent one, before anything is written', async () => {
    const row = rowOf(own).id;
    const pairs: [unknown, unknown][] = [
      [
        {
          kind: 'patchWorkItem',
          workItemId: row,
          patch: { teamIds: ['tm-b'], tagIds: ['no-tag'] },
        },
        {
          kind: 'patchWorkItem',
          workItemId: row,
          patch: { teamIds: ['no-team'], tagIds: ['no-tag'] },
        },
      ],
      [
        { kind: 'patchWorkItem', workItemId: row, patch: { serviceTeamId: 'tm-b', teamRefs: [] } },
        {
          kind: 'patchWorkItem',
          workItemId: row,
          patch: { serviceTeamId: 'no-team', teamRefs: [] },
        },
      ],
      [
        { kind: 'setAssignee', workItemId: row, stepId: ownStep, personId: 'pe-b' },
        { kind: 'setAssignee', workItemId: row, stepId: ownStep, personId: 'no-person' },
      ],
    ];
    for (const [foreignCommand, absentCommand] of pairs) {
      const before = snapshot();
      const foreignAnswer = await batch('ada', own, [foreignCommand]);
      expect({ foreignCommand, status: foreignAnswer.status }).toEqual({
        foreignCommand,
        status: 404,
      });
      expect(await batch('ada', own, [absentCommand])).toEqual(foreignAnswer);
      expect(snapshot()).toEqual(before);
    }
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
      'a restored row carrying a foreign type, cleared again in the same replay',
      () => ({
        do: 'batch',
        steps: [
          {
            do: 'restore_subtree',
            rows: [
              {
                id: 'w-typed',
                projectId: own,
                parentId: null,
                position: 5,
                name: 'Typed',
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
                typeIds: ['ty-b'],
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
          },
          { do: 'patch', workItemId: 'w-typed', patch: { typeIds: [] } },
        ],
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
