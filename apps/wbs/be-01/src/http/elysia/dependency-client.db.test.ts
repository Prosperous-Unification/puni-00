import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  clientFromShapes,
  defineEndpointShape,
  fetchTransport,
  responseSchema,
} from '@wbs/contracts';
import { openConnection } from '@wbs/store-sqlite/db';
import { seedDependencyAuthority } from '@wbs/store-sqlite/testing/dependency-activation';
import { type } from 'arktype';
import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';

import { runMigrations } from '../../repository/migrate';
import { admitDependencyClient } from '../../runtime/dependency-client';
import { testApp } from '../../testing/app-fixture';
import { testAuthService } from '../../testing/auth-fixture';
import { bind } from '../endpoint';
import { mountEndpoints } from './mount';

const capable = {
  protocol: 'wbs-dependency-runtime',
  version: 1,
  role: 'backend',
  semantics: ['cross-project-dependencies-v1'],
} as const;
const shape = defineEndpointShape({
  method: 'GET',
  path: '/internal/resource',
  operationId: 'getResource',
  policies: [],
  responses: [{ kind: 'json', status: 200, schema: responseSchema(type({ value: 'string' })) }],
  refusals: [],
  document: { summary: 'Read resource' },
});
test('mounted resource freshly checks durable authority and exact claims without enabling authoring', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-client-'));
  const path = join(directory, 'plan.db');
  runMigrations(path, new URL('../../../drizzle', import.meta.url).pathname);
  const connection = openConnection(path);
  try {
    const failures: unknown[] = [];
    const app = new Elysia().use(
      mountEndpoints(
        [bind(shape, () => Promise.resolve({ ok: true, status: 200, body: { value: 'visible' } }))],
        {
          appOrigin: 'http://localhost',
          resolveIdentity: () => {
            throw new Error('unexpected identity');
          },
          reportUnexpectedFailure: (failure) => {
            failures.push(failure);
          },
          admitDependencyClient: (claim) => admitDependencyClient(connection.db, capable, claim),
        },
      ),
    );
    const request = (claim?: string) =>
      app.handle(
        new Request('http://localhost/internal/resource', {
          headers: claim === undefined ? {} : { 'X-WBS-Dependency-Semantics': claim },
        }),
      );
    for (const claim of [undefined, '', 'older-client', 'cross-project-dependencies-v1'])
      expect((await request(claim)).status).toBe(200);
    const auth = testAuthService();
    const registered = await auth.register('ada', 'lovelace99');
    if (!registered.ok) throw new Error('fixture registration refused');
    const productionApp = testApp({
      auth,
      admitDependencyClient: (claim) => admitDependencyClient(connection.db, capable, claim),
    });
    const resource = (claim?: string) =>
      productionApp.handle(
        new Request('http://localhost/api/projects', {
          headers: {
            authorization: `Bearer ${registered.value.token}`,
            ...(claim === undefined ? {} : { 'X-WBS-Dependency-Semantics': claim }),
          },
        }),
      );
    expect((await resource()).status).toBe(200);
    seedDependencyAuthority(path);
    const retained = ['project', 'command_journal', 'event_log', 'event_sequencer'].map((table) =>
      connection.db.all(`SELECT * FROM ${table}`),
    );
    expect((await resource()).status).toBe(409);
    expect(
      (
        await productionApp.handle(
          new Request('http://localhost/api/projects', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${registered.value.token}`,
              origin: 'http://localhost',
              'content-type': 'application/json',
            },
            body: '{',
          }),
        )
      ).status,
    ).toBe(409);
    expect((await resource('cross-project-dependencies-v1')).status).toBe(200);
    expect(
      ['project', 'command_journal', 'event_log', 'event_sequencer'].map((table) =>
        connection.db.all(`SELECT * FROM ${table}`),
      ),
    ).toEqual(retained);
    for (const claim of [
      undefined,
      '',
      'cross-project-dependencies-v2',
      'cross-project-dependencies-v1, cross-project-dependencies-v1',
    ]) {
      const response = await request(claim);
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: 'client_dependency_incompatible',
        required: 'cross-project-dependencies-v1',
      });
    }
    expect((await request('cross-project-dependencies-v1')).status).toBe(200);
    const transport = (semantics?: 'cross-project-dependencies-v1') =>
      fetchTransport(
        'http://localhost',
        (url, init) => app.handle(new Request(url, init)),
        semantics,
      );
    const admittedClient = clientFromShapes([shape], transport('cross-project-dependencies-v1'));
    expect(await admittedClient.getResource({})).toMatchObject({
      kind: 'success',
      body: { value: 'visible' },
    });
    const legacyClient = clientFromShapes([shape], transport());
    expect(await legacyClient.getResource({})).toMatchObject({
      kind: 'failure',
      failure: { code: 'dependency_incompatible', required: 'cross-project-dependencies-v1' },
    });

    const incapable = testApp({
      auth,
      admitDependencyClient: (claim) =>
        admitDependencyClient(connection.db, { ...capable, semantics: [] }, claim),
    });
    const incompatible = await incapable.handle(
      new Request('http://localhost/api/projects', {
        headers: {
          authorization: `Bearer ${registered.value.token}`,
          'X-WBS-Dependency-Semantics': 'cross-project-dependencies-v1',
        },
      }),
    );
    expect(incompatible.status).toBe(409);
    expect(await incompatible.json()).toEqual({
      error: 'client_dependency_incompatible',
      required: 'cross-project-dependencies-v1',
    });
    connection.db.run('PRAGMA ignore_check_constraints=ON');
    connection.db.run("UPDATE cross_project_dependency_activation SET state='UNKNOWN'");
    expect((await request('cross-project-dependencies-v1')).status).toBe(500);
    connection.db.run('DELETE FROM cross_project_dependency_activation');
    expect((await request('cross-project-dependencies-v1')).status).toBe(500);
    expect(failures).toHaveLength(2);
    connection.db.run('DROP TABLE cross_project_dependency_activation_receipt');
    expect((await request('cross-project-dependencies-v1')).status).toBe(500);
    connection.close();
    expect((await request('cross-project-dependencies-v1')).status).toBe(500);
  } finally {
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('origin and identity refusals precede dependency inspection', async () => {
  const guarded = defineEndpointShape({
    ...shape,
    policies: [
      { kind: 'origin', when: 'always' },
      { kind: 'identity', require: 'read-scope' },
    ],
    refusals: [
      { status: 403, schema: responseSchema(type({ error: "'invalid_origin'" })) },
      { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    ],
  });
  const app = new Elysia().use(
    mountEndpoints(
      [
        bind(guarded, () => {
          throw new Error('handler unexpectedly ran');
        }),
      ],
      {
        appOrigin: 'http://localhost',
        resolveIdentity: () =>
          Promise.resolve({ ok: false, status: 401, body: { error: 'unauthenticated' } }),
        reportUnexpectedFailure: (failure) => {
          throw failure;
        },
        admitDependencyClient: () => {
          throw new Error('authority read before authentication');
        },
      },
    ),
  );
  expect((await app.handle(new Request('http://localhost/internal/resource'))).status).toBe(403);
  expect(
    (
      await app.handle(
        new Request('http://localhost/internal/resource', {
          headers: { origin: 'http://localhost' },
        }),
      )
    ).status,
  ).toBe(401);
});

test('production app refuses omitted authority callback at composition', () => {
  expect(() => testApp({ admitDependencyClient: undefined })).toThrow(
    'Dependency client admission is required',
  );
});

test('request authority uses one coherent snapshot when another connection activates mid-inspection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-client-snapshot-'));
  const path = join(directory, 'plan.db');
  runMigrations(path, new URL('../../../drizzle', import.meta.url).pathname);
  let armed = true;
  const connection = openConnection(path, {
    logQuery(query) {
      if (armed && query.includes('sqlite_master')) {
        armed = false;
        seedDependencyAuthority(path);
      }
    },
  });
  try {
    const auth = testAuthService();
    const registered = await auth.register('ada', 'lovelace99');
    if (!registered.ok) throw new Error('fixture registration refused');
    const app = testApp({
      auth,
      admitDependencyClient: (claim) => admitDependencyClient(connection.db, capable, claim),
    });
    const request = () =>
      app.handle(
        new Request('http://localhost/api/projects', {
          headers: { authorization: `Bearer ${registered.value.token}` },
        }),
      );
    expect((await request()).status).toBe(200);
    expect(armed).toBe(false);
    expect((await request()).status).toBe(409);
  } finally {
    connection.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('health, immutable capability and OpenAPI never inspect dependency authority', async () => {
  const app = testApp({
    admitDependencyClient: () => {
      throw new Error('exempt request read authority');
    },
  });
  for (const path of ['/health', '/api/runtime/dependency-capability', '/api/openapi.json'])
    expect((await app.handle(new Request(`http://localhost${path}`))).status).toBe(200);
});
