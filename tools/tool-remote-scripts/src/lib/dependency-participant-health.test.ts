import { expect, test } from 'bun:test';

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
test('product and source health use distinct exact identity contracts', () => {
  expect(inspectProductBackendHealth(json({ status: 'ok', commit: null })).commit).toBeNull();
  expect(inspectSourceBackendHealth(json({ status: 'ok', commit: sha }), sha).commit).toBe(sha);
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
  { status: 'ok', commit: sha },
  { status: 'failed', commit: null },
  { status: 'ok', commit: null, extra: true },
])
  test(`product health refuses unsupported body ${JSON.stringify(body)}`, () => {
    expect(() => inspectProductBackendHealth(json(body))).toThrow();
  });
for (const commit of [null, 'b'.repeat(40), '', 'short'])
  test(`source health refuses commit ${String(commit)}`, () => {
    expect(() => inspectSourceBackendHealth(json({ status: 'ok', commit }), sha)).toThrow();
  });
for (const response of [
  json({ status: 'ok', commit: null }, 503),
  { ...json({ status: 'ok', commit: null }), contentType: 'text/html' },
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
