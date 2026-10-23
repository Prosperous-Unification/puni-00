import { clientFromShapes, documentFromShapes, fetchTransport, httpShapes } from '@wbs/contracts';
import { afterEach, expect, test } from 'bun:test';

import { BACKEND_DEPENDENCY_CAPABILITY } from '../runtime/dependency-support';
import { testApp } from '../testing/app-fixture';

const environment = {
  CROSS_PROJECT_DEPENDENCIES: process.env['CROSS_PROJECT_DEPENDENCIES'],
  DEPENDENCY_ACTIVATION: process.env['DEPENDENCY_ACTIVATION'],
};
afterEach(() => {
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = value;
  }
});

const path = '/api/runtime/dependency-capability';
const cli = new URL('../dependency-capabilities-cli.ts', import.meta.url).pathname;

test('mounted dependency capability equals DB-free CLI and ignores readiness configuration', async () => {
  const execution = Bun.spawnSync([process.execPath, cli], {
    env: {
      PATH: process.env['PATH'],
      CROSS_PROJECT_DEPENDENCIES: 'enabled',
      DEPENDENCY_ACTIVATION: 'ENABLED',
    },
  });
  expect(execution.exitCode).toBe(0);
  expect(execution.stderr.toString()).toBe('');
  process.env['CROSS_PROJECT_DEPENDENCIES'] = 'enabled';
  process.env['DEPENDENCY_ACTIVATION'] = 'ENABLED';
  const app = testApp({
    migrationsApplied: false,
    admitDependencyClient: () => null,
    probeDatabase: () => {
      throw new Error('capability must not probe storage');
    },
  });
  const response = await app.handle(new Request(`http://localhost${path}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(JSON.parse(execution.stdout.toString()));
  expect(JSON.parse(execution.stdout.toString())).toEqual({
    protocol: 'wbs-dependency-runtime',
    version: 1,
    role: 'backend',
    semantics: ['cross-project-dependencies-v1'],
  });
  expect(Object.isFrozen(BACKEND_DEPENDENCY_CAPABILITY)).toBe(true);
  expect(Object.isFrozen(BACKEND_DEPENDENCY_CAPABILITY.semantics)).toBe(true);
});

test('registered capability generates OpenAPI and client decoding of explicit V1 support', async () => {
  const shape = httpShapes.find((shape) => shape.path === path);
  expect(shape).toBeDefined();
  if (shape === undefined) throw new Error('capability contract registration missing');
  expect(shape.policies).toEqual([{ kind: 'organization-control' }]);
  expect(documentFromShapes(httpShapes).paths[path]?.['get']?.operationId).toBe(
    'getDependencyCapability',
  );
  const app = testApp();
  const client = clientFromShapes(
    httpShapes,
    fetchTransport('http://localhost', (url, init) => app.handle(new Request(url, init))),
  );
  expect(await client.getDependencyCapability({})).toMatchObject({
    kind: 'success',
    status: 200,
    body: {
      protocol: 'wbs-dependency-runtime',
      version: 1,
      role: 'backend',
      semantics: ['cross-project-dependencies-v1'],
    },
  });
});

test('capability refuses GET input bodies through the mounted infrastructure policy', async () => {
  const response = await testApp().handle(
    new Request(`http://localhost${path}`, {
      method: 'GET',
      headers: { 'content-length': '2' },
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_body' });
});
