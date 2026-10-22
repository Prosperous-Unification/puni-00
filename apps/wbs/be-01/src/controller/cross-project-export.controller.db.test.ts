import { PlanDocumentService } from '@wbs/core/module/plan-document/plan-document.resource';
import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { connectedTransferFixture } from '../testing/connected-transfer-fixture';
import { type ComposedHarnessOptions, OrganizationHarness } from '../testing/organization-harness';

const stringMatcher: unknown = expect.any(String);
const numberMatcher: unknown = expect.any(Number);
const contains = (values: unknown[]): unknown => expect.arrayContaining(values);
const matches = (pattern: RegExp): unknown => expect.stringMatching(pattern);

let harness: OrganizationHarness;
afterEach(async () => {
  await harness.closeComposed();
});

async function open(options: ComposedHarnessOptions = {}) {
  harness = OrganizationHarness.openComposedWith(options);
  await harness.register('ada');
  harness.organization('org-a');
  harness.member('org-a', 'ada', 'member');
  harness.bind('ada', 'org-a');
  harness.activate();
  seedDependencyAuthority(harness.databasePath());
  const endpoints: { projectId: string; workItemId: string; stepId: string }[] = [];
  for (const [name, start] of [
    ['Remote', '2026-10-19'],
    ['Target', '2026-10-20'],
  ]) {
    const created = await harness.call('ada', 'POST', '/api/projects', { name });
    expect(created.status).toBe(200);
    const project = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM project WHERE name=?')
      .get(name);
    if (project === null) throw new Error('missing fixture project');
    const added = await harness.call('ada', 'POST', `/api/projects/${project.id}/commands`, {
      commands: [{ kind: 'createWorkItem', name: `${name} row` }],
    });
    expect(added.status).toBe(200);
    const row = harness.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id=?')
      .get(project.id);
    const step = harness.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM step WHERE project_id=? ORDER BY position LIMIT 1',
      )
      .get(project.id);
    if (row === null || step === null) throw new Error('missing fixture endpoint');
    harness.sqlite
      .query(
        "UPDATE project SET start_date=?,estimate_method='realistic',estimate_rounding='exact' WHERE id=?",
      )
      .run(start, project.id);
    harness.sqlite
      .query(
        'INSERT INTO estimate(work_item_id,step_id,optimistic,realistic,pessimistic) VALUES (?,?,2.5,2.5,2.5)',
      )
      .run(row.id, step.id);
    endpoints.push({ projectId: project.id, workItemId: row.id, stepId: step.id });
  }
  harness.sqlite.query("UPDATE work_item SET readiness='ready'").run();
  const remote = endpoints.at(0);
  const target = endpoints.at(1);
  if (remote === undefined || target === undefined) throw new Error('missing fixture pair');
  harness.sqlite
    .query(
      "INSERT INTO external_dependency(id,organization_id,predecessor_project_id,successor_project_id,predecessor_work_item_id,successor_work_item_id,predecessor_scope,successor_scope,type) VALUES ('remote-fs','org-a',?,?,?,?, 'whole','whole','FS')",
    )
    .run(remote.projectId, target.projectId, remote.workItemId, target.workItemId);
  return { remote, target };
}

function persistentState() {
  const tables = harness.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  return tables.map(({ name }) => [
    name,
    harness.sqlite.query(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all(),
  ]);
}
test('mounted JSON exports v11 required evidence and stable incoming UUIDs without durable admission', async () => {
  const { remote, target } = await open();
  const before = persistentState();
  const response = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/export?format=json`,
  );
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    document: { version: 11 },
    workItems: [{ id: target.workItemId, schedule: { earliestStart: 1.5, earliestFinish: 4 } }],
    typedDependencies: [
      {
        id: 'remote-fs',
        predecessor: {
          kind: 'external',
          scope: 'whole',
          projectId: remote.projectId,
          workItemId: remote.workItemId,
          display: { projectName: 'Remote', workItemName: 'Remote row' },
        },
        successor: { kind: 'internal', workItem: target.workItemId },
      },
    ],
    connected: {
      kind: 'connected',
      projectId: target.projectId,
      mode: 'isolated',
      projects: contains([
        {
          projectId: remote.projectId,
          name: 'Remote',
          abbreviation: stringMatcher,
          rank: numberMatcher,
          startDate: '2026-10-19',
          timezone: 'UTC',
          revision: numberMatcher,
          seq: numberMatcher,
        },
      ]),
      relationships: [{ id: 'remote-fs', projectId: target.projectId }],
      placement: {
        kind: 'scheduled',
        selected: contains([
          {
            projectId: target.projectId,
            workItemId: target.workItemId,
            stepId: target.stepId,
            start: 2.5,
            finish: 5,
          },
        ]),
        stages: contains([
          {
            projectId: target.projectId,
            engine: 'fast',
            objective: 'pri',
            boundary: { format: 'wbs-connected-stage', version: 1, canonical: stringMatcher },
            optimization: null,
            decisions: { pri: null, time: null },
            chosen: null,
          },
        ]),
      },
    },
  });
  expect(persistentState()).toEqual(before);
  const outgoing = await harness.call(
    'ada',
    'GET',
    `/api/projects/${remote.projectId}/export?format=json`,
  );
  expect(outgoing.status).toBe(200);
  expect(outgoing.body).toMatchObject({
    document: { version: 11 },
    typedDependencies: [],
    connected: { relationships: [{ id: 'remote-fs' }] },
  });
  const markdown = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/export?format=markdown`,
  );
  expect(markdown.status).toBe(200);
  expect(markdown.body).toContain('Target row');
  expect(persistentState()).toEqual(before);
});
test('mounted JSON preserves explicit unavailable outcomes and null dates', async () => {
  const { remote, target } = await open();
  harness.sqlite.query('UPDATE project SET start_date=NULL WHERE id=?').run(remote.projectId);
  const calendar = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/export?format=json`,
  );
  expect(calendar.status).toBe(200);
  expect(calendar.body).toMatchObject({
    document: { version: 11 },
    workItems: [{ dates: null, schedule: null }],
    connected: {
      placement: {
        kind: 'dependency_calendar_missing',
        projects: [{ projectId: remote.projectId, name: 'Remote', abbreviation: stringMatcher }],
      },
    },
  });
  harness.sqlite
    .query(
      "UPDATE project SET start_date='2026-10-19', schedule_engine='optimized', optimization_enabled=1 WHERE id=?",
    )
    .run(remote.projectId);
  const optimizer = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/export?format=json`,
  );
  expect(optimizer.status).toBe(200);
  expect(optimizer.body).toMatchObject({
    document: { version: 11 },
    workItems: [{ dates: null }],
    connected: {
      placement: {
        kind: 'engine_unavailable',
        engine: 'optimized',
        projects: [remote.projectId],
        reason: stringMatcher,
      },
    },
  });
});

test('mounted response rejects absent and malformed required v11 history independently', async () => {
  const { target } = await open();
  const serialize = Reflect.get(PlanDocumentService.prototype, 'exportConnectedCaptured');
  for (const fault of ['missing', 'malformed'] as const) {
    const altered = spyOn(
      PlanDocumentService.prototype,
      'exportConnectedCaptured',
    ).mockImplementation(function (this: PlanDocumentService, ...args) {
      const exported = serialize.apply(this, args);
      if (!exported.ok) throw new Error('fixture unexpectedly refused');
      if (fault === 'missing') Reflect.deleteProperty(exported.value, 'connected');
      else Reflect.set(exported.value, 'connected', { kind: 'connected' });
      return exported;
    });
    try {
      const response = await harness.call(
        'ada',
        'GET',
        `/api/projects/${target.projectId}/export?format=json`,
      );
      expect(response.status).toBe(500);
    } finally {
      altered.mockRestore();
    }
  }
});
test('mounted export serializes captured labels settings and markers after observation closure', async () => {
  const { remote, target } = await open();
  harness.sqlite
    .query(
      "INSERT INTO calendar_marker(id,project_id,date,name,created_at) VALUES('marker',?,'2026-10-22','Old marker',1)",
    )
    .run(target.projectId);
  const exportWithin = Reflect.get(WorkItemService.prototype, 'exportWithin');
  const afterCapture = spyOn(WorkItemService.prototype, 'exportWithin').mockImplementation(
    async function (this: WorkItemService, ...args) {
      const captured = await exportWithin.apply(this, args);
      harness.sqlite
        .query("UPDATE project SET name='Next remote' WHERE id=?")
        .run(remote.projectId);
      harness.sqlite
        .query("UPDATE work_item SET name='Next row',frozen_number='990' WHERE id=?")
        .run(remote.workItemId);
      harness.sqlite
        .query("UPDATE project SET estimate_rounding='ceil' WHERE id=?")
        .run(target.projectId);
      harness.sqlite.query("UPDATE calendar_marker SET name='Next marker' WHERE id='marker'").run();
      return captured;
    },
  );
  try {
    const before = await harness.call(
      'ada',
      'GET',
      `/api/projects/${target.projectId}/export?format=json`,
    );
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      settings: { estimateRounding: 'exact' },
      calendarMarkers: [{ name: 'Old marker' }],
      typedDependencies: [
        {
          predecessor: {
            display: {
              projectName: 'Remote',
              workItemName: 'Remote row',
              address: matches(/\.010$/),
            },
          },
        },
      ],
    });
  } finally {
    afterCapture.mockRestore();
  }
  const after = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/export?format=json`,
  );
  expect(after.status).toBe(200);
  expect(after.body).toMatchObject({
    settings: { estimateRounding: 'ceil' },
    calendarMarkers: [{ name: 'Next marker' }],
    typedDependencies: [
      {
        predecessor: {
          display: {
            projectName: 'Next remote',
            workItemName: 'Next row',
            address: matches(/\.990$/),
          },
        },
      },
    ],
  });
});

test('mounted connected JSON preserves sparse refusal and uncoded-step precedence', async () => {
  const { target } = await open();
  harness.sqlite
    .query('INSERT INTO step_parallel(work_item_id,step_id,max_parallel) VALUES(?,?,2)')
    .run(target.workItemId, target.stepId);
  const sparse = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/export?format=json`,
  );
  expect(sparse.status).toBe(409);
  expect(sparse.body).toEqual({ error: 'unsupported_step_parallelism' });
  harness.sqlite.query('UPDATE step SET code=NULL WHERE id=?').run(target.stepId);
  const uncoded = await harness.call(
    'ada',
    'GET',
    `/api/projects/${target.projectId}/export?format=json`,
  );
  expect(uncoded.status).toBe(409);
  expect(uncoded.body).toMatchObject({
    error: 'uncoded_steps',
    steps: [{ id: target.stepId }],
    command: 'bun run src/backfill-step-codes-cli.ts',
  });
});

test('mounted transfer fixture authors exactly successor-owned links and archives outgoing component links', async () => {
  harness = OrganizationHarness.openComposedWith({});
  const { source, downstream } = await connectedTransferFixture(harness);
  const before = persistentState();
  const response = await harness.call(
    'ada',
    'GET',
    `/api/projects/${source.projectId}/export?format=json`,
  );
  expect(response.status).toBe(200);
  const authored: unknown = Reflect.get(Object(response.body), 'typedDependencies');
  expect(authored).toHaveLength(6);
  expect(response.body).toMatchObject({
    document: { version: 11 },
    typedDependencies: contains([
      expect.objectContaining({ id: 'internal-node' }),
      expect.objectContaining({ id: 'incoming-node-a' }),
      expect.objectContaining({ id: 'incoming-node-b' }),
      expect.objectContaining({ id: 'incoming-descendant' }),
    ]),
    connected: {
      relationships: contains([
        expect.objectContaining({ id: 'outgoing', projectId: downstream.projectId }),
        expect.objectContaining({ id: 'component-other' }),
      ]),
    },
  });
  expect(persistentState()).toEqual(before);
});
