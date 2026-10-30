import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { afterEach, expect, test } from 'bun:test';

import { buildApp } from './app';
import { bootBe01 } from './boot';
import { BACKEND_DEPENDENCY_CAPABILITY } from './runtime/dependency-support';
import { TEST_JWT_KEY } from './testing/auth-fixture';
import { BootedBrowserProcess } from './testing/booted-browser-process';
import { TEST_MCP_SERVICE_SETTINGS } from './testing/machine-grant-fixture';
import { TEST_ORGANIZATION_DEFAULT_LIMITS } from './testing/organization-limits-fixture';

let backend: BootedBrowserProcess | undefined;
afterEach(async () => {
  await backend?.close();
  backend = undefined;
});

async function fixture() {
  backend = await BootedBrowserProcess.open('enabled');
  const running = backend;
  await running.register('ada');
  running.organization('org-a');
  running.member('org-a', 'ada', 'super_admin');
  running.activate();
  const selection = await running.app.handle(
    new Request('http://localhost/api/organization/active', {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        authorization: `Bearer ${running.token('ada')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ organizationId: 'org-a' }),
    }),
  );
  expect(selection.status).toBe(200);
  const cookie = selection.headers.get('set-cookie')?.split(';')[0];
  if (cookie === undefined) throw new Error('production browser selection cookie missing');
  const request = (
    path: string,
    body?: unknown,
    claim: string | null = 'cross-project-dependencies-v1',
    method = 'POST',
  ) =>
    running.app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          origin: 'http://localhost',
          authorization: `Bearer ${running.token('ada')}`,
          cookie,
          'X-WBS-Expected-Organization': 'org-a',
          'content-type': 'application/json',
          ...(claim === null ? {} : { 'X-WBS-Dependency-Semantics': claim }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const create = async (name: string) => {
    expect((await request('/api/projects', { name })).status).toBe(200);
    const project = running.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM project WHERE name=?')
      .get(name);
    if (project === null) throw new Error('production fixture project missing');
    expect(
      (
        await request(`/api/projects/${project.id}/commands`, {
          commands: [{ kind: 'createWorkItem', name: `${name} leaf` }],
        })
      ).status,
    ).toBe(200);
    const row = running.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_item WHERE project_id=?')
      .get(project.id);
    if (row === null) throw new Error('production fixture leaf missing');
    return { projectId: project.id, workItemId: row.id, scope: 'whole' as const };
  };
  const predecessor = await create('Predecessor');
  const successor = await create('Successor');
  seedDependencyAuthority(running.databasePath());
  return { running, request, predecessor, successor, cookie };
}

function snapshot(running: BootedBrowserProcess) {
  return running.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({
      name,
      rows: running.sqlite
        .query(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    }));
}

test('real backend descriptor admits external command identities history events and atomic rollback', async () => {
  const { running, request, predecessor, successor } = await fixture();
  const semantics: readonly string[] = BACKEND_DEPENDENCY_CAPABILITY.semantics;
  expect(semantics).toEqual(['cross-project-dependencies-v1']);
  const path = `/api/projects/${successor.projectId}`;
  const command = (commands: unknown[]) => request(`${path}/commands`, { commands });
  const before = snapshot(running);
  expect(
    (await command([{ kind: 'addTypedDependency', predecessor, successor, type: 'FS' }])).status,
  ).toBe(200);
  const stored = () =>
    running.sqlite
      .query<
        { id: string; type: string; predecessor_project_id: string; successor_project_id: string },
        []
      >('SELECT id,type,predecessor_project_id,successor_project_id FROM external_dependency')
      .all();
  const linked = stored().at(0);
  if (linked === undefined) throw new Error('production external command persisted no identity');
  expect(linked).toMatchObject({
    type: 'FS',
    predecessor_project_id: predecessor.projectId,
    successor_project_id: successor.projectId,
  });
  expect(
    (
      await command([
        {
          kind: 'updateTypedDependency',
          dependencyId: linked.id,
          predecessor,
          successor,
          type: 'SS',
        },
      ])
    ).status,
  ).toBe(200);
  expect(stored()).toEqual([{ ...linked, type: 'SS' }]);
  expect((await command([{ kind: 'removeTypedDependency', dependencyId: linked.id }])).status).toBe(
    200,
  );
  expect(stored()).toEqual([]);
  expect((await request(`${path}/undo`)).status).toBe(200);
  expect(stored()).toEqual([{ ...linked, type: 'SS' }]);
  expect((await request(`${path}/redo`)).status).toBe(200);
  expect(stored()).toEqual([]);
  expect((await request(`${path}/undo`)).status).toBe(200);
  expect(stored()).toEqual([{ ...linked, type: 'SS' }]);
  const journal = running.sqlite
    .query<{ count: number }, [string]>(
      'SELECT count(*) AS count FROM command_journal WHERE project_id=?',
    )
    .get(successor.projectId);
  expect(journal?.count).toBe(4);
  expect(snapshot(running).find(({ name }) => name === 'event_log')?.rows.length).toBeGreaterThan(
    before.find(({ name }) => name === 'event_log')?.rows.length ?? 0,
  );
  const rollback = snapshot(running);
  const refused = await command([
    { kind: 'patchWorkItem', workItemId: successor.workItemId, patch: { name: 'Must roll back' } },
    { kind: 'addTypedDependency', predecessor, successor, type: 'FF' },
    { kind: 'patchWorkItem', workItemId: 'absent', patch: { name: 'Never' } },
  ]);
  expect(refused.status).toBe(404);
  expect(snapshot(running)).toEqual(rollback);
});

test('real backend imports an external declaration through unchanged production composition', async () => {
  const { running, request, predecessor } = await fixture();
  const document = planDocumentFixture();
  const history = running.sqlite.query('SELECT * FROM command_journal').all();
  const imported = await request('/api/projects/import', {
    ...document,
    document: { ...document.document, version: 12 },
    workItems: document.workItems.map(({ attempts: _attempts, ...row }) => ({
      ...row,
      attempts: {},
    })),
    typedDependencies: [
      {
        id: 'downloaded-external',
        type: 'FS',
        predecessor: {
          kind: 'external',
          ...predecessor,
          display: {
            projectName: 'Predecessor',
            abbreviation: 'PRE',
            workItemName: 'Remote leaf',
            address: 'PRE.1',
          },
        },
        successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
      },
    ],
  });
  expect(imported.status).toBe(201);
  const summary = (await imported.json()) as { projectId: string };
  const external = running.sqlite
    .query<
      {
        id: string;
        predecessor_project_id: string;
        predecessor_work_item_id: string;
        successor_project_id: string;
        type: string;
      },
      []
    >(
      'SELECT id,predecessor_project_id,predecessor_work_item_id,successor_project_id,type FROM external_dependency',
    )
    .all();
  expect(external).toHaveLength(1);
  expect(external[0]).toMatchObject({
    predecessor_project_id: predecessor.projectId,
    predecessor_work_item_id: predecessor.workItemId,
    successor_project_id: summary.projectId,
    type: 'FS',
  });
  expect(external[0]?.id).toBeString();
  expect(running.sqlite.query('SELECT * FROM command_journal').all()).toEqual(history);
  running.sqlite.run(
    "CREATE TRIGGER refuse_test_external_import AFTER INSERT ON external_dependency BEGIN SELECT RAISE(ABORT,'injected production external import failure'); END",
  );
  const beforeFailure = snapshot(running);
  const refused = await request('/api/projects/import', {
    ...document,
    document: { ...document.document, version: 12 },
    workItems: document.workItems.map(({ attempts: _attempts, ...row }) => ({
      ...row,
      attempts: {},
    })),
    typedDependencies: [
      {
        id: 'later-external',
        type: 'FS',
        predecessor: {
          kind: 'external',
          ...predecessor,
          display: {
            projectName: 'Predecessor',
            abbreviation: 'PRE',
            workItemName: 'Remote leaf',
            address: 'PRE.1',
          },
        },
        successor: { kind: 'internal', scope: 'whole', workItem: 'row-1' },
      },
    ],
  });
  expect(refused.status).toBe(500);
  expect(snapshot(running)).toEqual(beforeFailure);
});

test('real enabled backend requires one exact resource claim and preserves effects for incompatible callers', async () => {
  const { running, request } = await fixture();
  const before = snapshot(running);
  for (const claim of [
    null,
    '',
    'old',
    'cross-project-dependencies-v1,cross-project-dependencies-v1',
    'cross-project-dependencies-v1, old',
  ]) {
    const response = await request('/api/projects', undefined, claim, 'GET');
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'client_dependency_incompatible',
      required: 'cross-project-dependencies-v1',
    });
    expect(snapshot(running)).toEqual(before);
  }
  expect(
    (await request('/api/projects', undefined, 'cross-project-dependencies-v1', 'GET')).status,
  ).toBe(200);
});

function restartOptions(dbPath: string) {
  return {
    appOrigin: 'http://localhost',
    dbPath,
    port: 0,
    logger: createLogger({ service: 'be-01', level: 'error' }),
    jwtKey: TEST_JWT_KEY,
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    mcpService: TEST_MCP_SERVICE_SETTINGS,
    browserSessionAuthority: 'enabled' as const,
    organizationDefaultLimits: TEST_ORGANIZATION_DEFAULT_LIMITS,
    organizationDomainProofScheduling: 'disabled' as const,
  };
}

test('real capable binary restarts on enabled empty authority and preserves its durable identities', async () => {
  const { running, cookie } = await fixture();
  const before = snapshot(running);
  let mounted: ReturnType<typeof buildApp> | undefined;
  const restarted = await bootBe01(restartOptions(running.databasePath()), {
    openSource: (configuration) => {
      expect(configuration.dependencyCapability).toBe(BACKEND_DEPENDENCY_CAPABILITY);
      return openSqliteSource(configuration);
    },
    makeApp: (configuration) => {
      const app = buildApp(configuration);
      mounted = app;
      app.stop = () => Promise.resolve(app);
      return app;
    },
    startListener: (_app, _port, ready) => {
      ready();
    },
  });
  try {
    if (mounted === undefined) throw new Error('restarted backend did not mount');
    expect((await mounted.handle(new Request('http://localhost/health'))).status).toBe(200);
    const headers = {
      authorization: `Bearer ${running.token('ada')}`,
      cookie,
      'X-WBS-Expected-Organization': 'org-a',
    };
    expect(
      (await mounted.handle(new Request('http://localhost/api/projects', { headers }))).status,
    ).toBe(409);
    expect(
      (
        await mounted.handle(
          new Request('http://localhost/api/projects', {
            headers: { ...headers, 'X-WBS-Dependency-Semantics': 'cross-project-dependencies-v1' },
          }),
        )
      ).status,
    ).toBe(200);
    expect(snapshot(running)).toEqual(before);
  } finally {
    await restarted.stop();
  }
});

test('boot source refuses a mismatched gateway descriptor before factories or writes', async () => {
  const { running } = await fixture();
  const before = snapshot(running);
  let factories = 0;
  const failure: unknown = await bootBe01(restartOptions(running.databasePath()), {
    openSource: (configuration) => {
      expect(configuration.dependencyCapability).toBe(BACKEND_DEPENDENCY_CAPABILITY);
      return openSqliteSource({
        ...configuration,
        dependencyCapability: { ...BACKEND_DEPENDENCY_CAPABILITY, role: 'gateway' },
      });
    },
    makeApp: (configuration) => {
      factories++;
      return buildApp(configuration);
    },
  }).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(factories).toBe(0);
  expect(snapshot(running)).toEqual(before);
});
