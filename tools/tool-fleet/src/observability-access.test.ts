import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { bindObservabilityAccess } from './observability-access';
import { declareObservabilityRoutes } from './observability-authority';

const directory = mkdtempSync(join(tmpdir(), 'puni-task5-binding-'));
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    join(directory, 'tls.key'),
    '-out',
    join(directory, 'tls.crt'),
    '-subj',
    '/CN=Task5 Binding CA',
    '-days',
    '1',
  ],
  { stdio: 'pipe' },
);
const ca = readFileSync(join(directory, 'tls.crt'), 'utf8');
const key = readFileSync(join(directory, 'tls.key'), 'utf8');
afterAll(() => {
  rmSync(directory, { recursive: true });
});
const material = () => ({
  ingest: { url: 'https://127.0.0.1:14318', ca, cert: ca, key },
  elastic: {
    url: 'https://127.0.0.1:19200',
    ca,
    username: 'health-reader',
    password: 'disposable-elastic',
  },
  metrics: {
    url: 'https://127.0.0.1:19090',
    ca,
    username: 'metrics-reader',
    password: 'disposable-metrics',
  },
});
test.each(['dev', 'prod'] as const)(
  'resolved %s material translates actual authority route descriptors without inverse dependency',
  (environment) => {
    const instance = {
      environment,
      namespace: environment === 'dev' ? 'observability-dev' : 'observability',
    };
    const access = bindObservabilityAccess(instance, material());
    const routes = declareObservabilityRoutes(instance);
    expect([
      access.otlp.serverName,
      access.elastic.serverName,
      access.prometheus.serverName,
    ]).toEqual(routes.map((route) => route.serverName));
    expect(access.queryPatterns).toEqual([
      `logs-*.otel-${environment}`,
      `traces-*.otel-${environment}`,
    ]);
    expect(access.otlp.authentication.kind).toBe('mtls');
    expect(access.elastic.authentication.kind).toBe('basic');
    expect(access.prometheus.authentication.kind).toBe('basic');
    expect(access.runtimeVerified).toBe(false);
  },
);
test('resolved material cannot select plaintext or omit a required client key', () => {
  expect(() =>
    bindObservabilityAccess(
      { environment: 'prod', namespace: 'observability' },
      { ...material(), ingest: { ...material().ingest, url: 'http://127.0.0.1:1' } },
    ),
  ).toThrow();
  expect(() =>
    bindObservabilityAccess(
      { environment: 'prod', namespace: 'observability' },
      { ...material(), ingest: { ...material().ingest, key: '' } },
    ),
  ).toThrow();
});
