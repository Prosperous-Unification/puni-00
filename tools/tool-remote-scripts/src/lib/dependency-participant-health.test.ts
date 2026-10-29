import { expect, test } from 'bun:test';

// Contract fixture invokes the actual backend producer; production tools do not import the app.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { infrastructureEndpoints } from '../../../../apps/wbs/be-01/src/controller/infrastructure-endpoints';
import {
  inspectBackendCapability,
  inspectListenerHealth,
  inspectProductBackendHealth,
  inspectSourceBackendHealth,
} from './dependency-participant-health';

const sha = 'a'.repeat(40);
const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});
async function produceHealth(commit: string | null, bootCommit: string | null) {
  const endpoint = infrastructureEndpoints({
    migrationsApplied: true,
    probeDatabase: () => 'ok',
    deployedCommit: () => commit,
    bootCommit,
    logger: {
      error: () => {
        throw new Error('healthy producer unexpectedly logged');
      },
    },
    scrapeMetrics: () => {
      throw new Error('health unexpectedly scraped metrics');
    },
  })[1];
  const reply = await endpoint.handle({
    params: {},
    query: undefined,
    body: undefined,
    request: {
      url: new URL('http://127.0.0.1/health'),
      method: 'GET',
      headers: new Headers(),
      signal: new AbortController().signal,
    },
  });
  expect(reply.status).toBe(200);
  return json(reply.body, reply.status);
}

test('actual backend producer product health is accepted with both identities absent', async () => {
  expect(inspectProductBackendHealth(await produceHealth(null, null))).toMatchObject({
    commit: null,
    bootCommit: null,
  });
});
test('actual backend producer source health binds disk and running identities', async () => {
  expect(inspectSourceBackendHealth(await produceHealth(sha, sha), sha)).toMatchObject({
    commit: sha,
    bootCommit: sha,
  });
});
test('actual backend producer product health refuses a running checkout identity', async () => {
  const response = await produceHealth(null, sha);
  expect(() => inspectProductBackendHealth(response)).toThrow(
    'participant product backend health refused',
  );
});
test('actual backend producer source health refuses stale running code at the expected disk commit', async () => {
  const response = await produceHealth(sha, 'b'.repeat(40));
  expect(() => inspectSourceBackendHealth(response, sha)).toThrow(
    'participant source backend health refused',
  );
});

test('product and source health use distinct exact identity contracts', () => {
  expect(
    inspectProductBackendHealth(json({ status: 'ok', commit: null, bootCommit: null })).commit,
  ).toBeNull();
  expect(
    inspectSourceBackendHealth(json({ status: 'ok', commit: sha, bootCommit: sha }), sha).commit,
  ).toBe(sha);
  expect(inspectListenerHealth(json({ status: 'ok' })).sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(
    inspectBackendCapability(
      json({
        protocol: 'wbs-dependency-runtime',
        version: 1,
        role: 'backend',
        semantics: ['cross-project-dependencies-v1'],
      }),
    ).sha256,
  ).toMatch(/^[a-f0-9]{64}$/);
});
for (const body of [
  { status: 'ok' },
  { status: 'ok', commit: sha, bootCommit: null },
  { status: 'ok', commit: null },
  { status: 'failed', commit: null, bootCommit: null },
  { status: 'ok', commit: null, bootCommit: null, extra: true },
])
  test(`product health refuses unsupported body ${JSON.stringify(body)}`, () => {
    expect(() => inspectProductBackendHealth(json(body))).toThrow();
  });
for (const commit of [null, 'b'.repeat(40), '', 'short'])
  test(`source health refuses commit ${String(commit)}`, () => {
    expect(() =>
      inspectSourceBackendHealth(json({ status: 'ok', commit, bootCommit: sha }), sha),
    ).toThrow();
  });
for (const body of [
  { status: 'ok', commit: sha },
  { status: 'failed', commit: sha, bootCommit: sha },
  { status: 'ok', commit: sha, bootCommit: sha, extra: true },
])
  test(`source health refuses unsupported body ${JSON.stringify(body)}`, () => {
    expect(() => inspectSourceBackendHealth(json(body), sha)).toThrow();
  });
for (const response of [
  json({ status: 'ok', commit: null, bootCommit: null }, 503),
  { ...json({ status: 'ok', commit: null, bootCommit: null }), contentType: 'text/html' },
  { status: 200, contentType: 'application/json', body: 'PRIVATE_HEALTH_SENTINEL' },
])
  test('health transport failure discards private parser excerpts and causes', () => {
    let refusal: unknown;
    try {
      inspectProductBackendHealth(response);
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal).toBeInstanceOf(Error);
    if (!(refusal instanceof Error)) throw new Error('health refusal absent');
    expect(refusal.message).not.toContain('PRIVATE_HEALTH_SENTINEL');
    expect(refusal.cause).toBeUndefined();
  });
for (const body of [
  {
    protocol: 'wbs-dependency-runtime',
    version: 1,
    role: 'gateway',
    semantics: ['cross-project-dependencies-v1'],
  },
  { protocol: 'wbs-dependency-runtime', version: 1, role: 'backend', semantics: [] },
])
  test('bound backend HTTP capability keeps independent role and semantic validation', () => {
    expect(() => inspectBackendCapability(json(body))).toThrow();
  });
