import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  type AcceptanceScope,
  type BackendConfiguration,
  createScopedBackendAcceptance,
  type ScopedObservation,
} from '@tools/observability-acceptance';
import {
  bindTransport,
  fetchTransport,
  type VerifiedEndpoint,
} from '@tools/observability-transport';
import { afterAll, beforeAll, expect, test } from 'bun:test';

import { bindObservabilityAccess } from './observability-access';

const directory = process.env['PUNI_AUTH_ELASTIC_LAB'];
const lab = test.skipIf(directory === undefined);
let access: ReturnType<typeof bindObservabilityAccess>;
let admin: VerifiedEndpoint;
let observation: ScopedObservation;
let scope: AcceptanceScope;
let metrics: ReturnType<typeof Bun.serve>;
const pem = (name: string) => readFileSync(`${String(directory)}/${name}`, 'utf8');
async function exchange(endpoint: VerifiedEndpoint, path: string, method = 'GET', body?: unknown) {
  const bound = bindTransport(endpoint);
  return fetchTransport(new URL(path, bound.url), bound, {
    ...bound.options,
    signal: AbortSignal.timeout(5000),
    redirect: 'manual',
    method,
    headers: {
      ...Object.fromEntries(new Headers(bound.options.headers)),
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function document(kind: 'log' | 'root' | 'child') {
  const root = kind === 'root';
  return {
    '@timestamp': observation.observedAt - (kind === 'log' ? 0 : 10),
    resource: {
      attributes: {
        'deployment.environment.name': scope.environment,
        'service.name': scope.producer,
      },
    },
    attributes: {
      'puni.target.environment': observation.environment,
      'puni.target.service': observation.service,
      'puni.target.revision': observation.revision,
      'puni.observation.id': observation.observationId,
      'puni.observation.timestamp_ms': observation.observedAt,
      'puni.source.kind': 'component',
      'puni.source.identity': scope.sourceIdentity,
      'puni.probe.success': true,
      ...(root ? { 'transaction.root': true } : {}),
    },
    trace_id: observation.traceId,
    span_id: kind === 'child' ? observation.childSpanId : observation.parentSpanId,
    ...(kind === 'log'
      ? { body: { text: scope.logName } }
      : {
          name: root ? scope.logName : scope.childName,
          kind: root ? 'Internal' : 'Client',
          status: { code: 'Ok' },
          ...(root ? {} : { parent_span_id: observation.parentSpanId }),
        }),
  };
}
beforeAll(async () => {
  if (directory === undefined) return;
  const ownership = JSON.parse(pem('ownership.json')) as {
    id: string;
    port: string;
    image: string;
  };
  expect(ownership.image).toBe(
    'sha256:f96812864b81e62a9ce7562c4f4bbef1186bb4e8798f814bc6a5f2b84b51b540',
  );
  const identities = JSON.parse(pem('identities.json')) as { admin: string; reader: string };
  execFileSync(
    'openssl',
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      `${directory}/metrics.key`,
      '-out',
      `${directory}/metrics.csr`,
      '-subj',
      '/CN=signal-metrics.observability.svc',
      '-addext',
      'subjectAltName=DNS:signal-metrics.observability.svc',
    ],
    { stdio: 'pipe' },
  );
  execFileSync(
    'openssl',
    [
      'x509',
      '-req',
      '-in',
      `${directory}/metrics.csr`,
      '-CA',
      `${directory}/ca.crt`,
      '-CAkey',
      `${directory}/ca.key`,
      '-CAcreateserial',
      '-out',
      `${directory}/metrics.crt`,
      '-days',
      '1',
      '-copy_extensions',
      'copy',
    ],
    { stdio: 'pipe' },
  );
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      `${directory}/foreign-ca.key`,
      '-out',
      `${directory}/foreign-ca.crt`,
      '-subj',
      '/CN=Task5 Foreign CA',
      '-days',
      '1',
    ],
    { stdio: 'pipe' },
  );
  const observedAt = Date.now() - 1000;
  scope = {
    environment: 'prod',
    service: 'component-service',
    producer: 'component-probe',
    namespace: 'prod',
    sourceIdentity: ownership.id,
    provenance: 'component',
    metricNames: ['component_observed_seconds', 'component_revision', 'component_success'],
    logName: 'component health observation',
    childName: 'GET component /health',
  };
  observation = {
    source: { kind: 'scoped', identity: scope.sourceIdentity, provenance: 'component' },
    environment: scope.environment,
    service: scope.service,
    observationId: crypto.randomUUID(),
    traceId: '1'.repeat(32),
    parentSpanId: '2'.repeat(16),
    childSpanId: '3'.repeat(16),
    producerVersion: 'task5',
    revision: 'a'.repeat(40),
    success: true,
    reason: null,
    startedAt: observedAt - 20,
    finishedAt: observedAt,
    observedAt,
    requestStartedAt: observedAt - 10,
    requestFinishedAt: observedAt,
    requestDurationMs: 10,
    transportDurationMs: 20,
    publication: { state: 'acknowledged' },
  };
  metrics = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    tls: { cert: pem('metrics.crt'), key: pem('metrics.key') },
    fetch(request) {
      if (
        request.headers.get('authorization') !==
        `Basic ${btoa('metrics-reader:disposable-metrics')}`
      )
        return new Response('', { status: 401 });
      const scrape = Math.floor((observedAt + 100) / 1000);
      return Response.json({
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [
            {
              metric: {
                __name__: scope.metricNames[0],
                environment: scope.environment,
                service: scope.service,
              },
              values: [[scrape, String(observedAt / 1000)]],
            },
            {
              metric: {
                __name__: scope.metricNames[1],
                environment: scope.environment,
                service: scope.service,
                revision: observation.revision,
              },
              values: [[scrape, '1']],
            },
            {
              metric: {
                __name__: scope.metricNames[2],
                environment: scope.environment,
                service: scope.service,
              },
              values: [[scrape, '1']],
            },
          ],
        },
      });
    },
  });
  access = bindObservabilityAccess(
    { environment: 'prod', namespace: 'observability' },
    {
      ingest: {
        url: 'https://127.0.0.1:14318',
        ca: pem('ca.crt'),
        cert: pem('metrics.crt'),
        key: pem('metrics.key'),
      },
      elastic: {
        url: `https://127.0.0.1:${ownership.port}`,
        ca: pem('ca.crt'),
        username: 'task5-reader',
        password: identities.reader,
      },
      metrics: {
        url: `https://127.0.0.1:${String(metrics.port)}`,
        ca: pem('ca.crt'),
        username: 'metrics-reader',
        password: 'disposable-metrics',
      },
    },
  );
  admin = {
    ...access.elastic,
    authentication: { kind: 'basic', username: 'elastic', password: identities.admin },
  };
  expect(await (await exchange(admin, '/')).json()).toMatchObject({ version: { number: '9.3.8' } });
  for (const kind of ['log', 'root', 'child'] as const) {
    const response = await exchange(
      admin,
      `/${kind === 'log' ? 'logs' : 'traces'}-component.otel-prod/_doc?refresh=true`,
      'POST',
      document(kind),
    );
    expect({ status: response.status, body: (await response.json()) as unknown }).toMatchObject({
      status: 201,
    });
  }
});
afterAll(async () => {
  if (directory !== undefined) await metrics.stop(true);
});
lab(
  'authenticated backend queries produce complete health with distinct component provenance',
  async () => {
    const report = await createScopedBackendAcceptance(
      { elastic: access.elastic, prometheus: access.prometheus, freshnessMs: 120000 },
      scope,
    ).inspect(observation, AbortSignal.timeout(10000));
    expect(report.health).toMatchObject({ state: 'complete' });
    expect(report.provenance.elasticAuthority).toBe('verified-read-only');
    expect(report.provenance.source).toEqual(observation.source);
  },
);
lab('actual scoped query identity self-check proves read and denies mutation grants', async () => {
  const privileges = [
    'read',
    'all',
    'manage',
    'write',
    'create',
    'create_doc',
    'index',
    'delete',
    'delete_index',
    'create_index',
    'auto_configure',
  ];
  const response = await exchange(access.elastic, '/_security/user/_has_privileges', 'POST', {
    cluster: ['all', 'manage', 'manage_security'],
    index: [{ names: access.queryPatterns, privileges }],
  });
  expect(response.status).toBe(200);
  const rights = (await response.json()) as {
    has_all_requested: boolean;
    cluster: Record<string, boolean>;
    index: Record<string, Record<string, boolean>>;
  };
  expect(rights.has_all_requested).toBe(false);
  expect(Object.values(rights.cluster)).toEqual([false, false, false]);
  for (const pattern of access.queryPatterns)
    for (const privilege of privileges)
      expect(rights.index[pattern][privilege]).toBe(privilege === 'read');
});
lab(
  'query identity cannot mutate actual pinned backend with lab-admin positive controls',
  async () => {
    const path = '/logs-component.otel-prod/_doc?refresh=true';
    expect((await exchange(access.elastic, path, 'POST', document('log'))).status).toBe(403);
    expect((await exchange(admin, path, 'POST', document('log'))).status).toBe(201);
    const role = '/_security/role/task5-disposable-mutation-control';
    expect((await exchange(access.elastic, role, 'PUT', { cluster: [], indices: [] })).status).toBe(
      403,
    );
    expect((await exchange(admin, role, 'PUT', { cluster: [], indices: [] })).status).toBe(200);
    expect((await exchange(admin, role, 'DELETE')).status).toBe(200);
  },
);
lab('actual broader admin authority cannot certify read-only health', async () => {
  const report = await createScopedBackendAcceptance(
    { elastic: admin, prometheus: access.prometheus, freshnessMs: 120000 },
    scope,
  ).inspect(observation, AbortSignal.timeout(10000));
  expect(report.health.state).toBe('incomplete');
  expect(report.evidence.log).toEqual({ state: 'unavailable', reason: 'query-authority' });
  expect(report.provenance.elasticAuthority).toBe('unverified');
});
lab(
  'actual verified backend refuses untrusted CA wrong hostname and missing credential',
  async () => {
    for (const elastic of [
      { ...access.elastic, serverName: 'foreign.observability.svc' },
      { ...access.elastic, ca: pem('foreign-ca.crt') },
      {
        ...access.elastic,
        authentication: { kind: 'basic' as const, username: 'task5-reader', password: 'wrong' },
      },
    ]) {
      const report = await createScopedBackendAcceptance(
        { elastic, prometheus: access.prometheus, freshnessMs: 120000 },
        scope,
      ).inspect(observation, AbortSignal.timeout(10000));
      expect(report.health.state).toBe('incomplete');
      expect(report.provenance.elasticAuthority).toBe('unverified');
    }
  },
);

lab(
  'authenticated authority phase retains total deadline body and exact status bounds',
  async () => {
    const effective = (await (
      await exchange(access.elastic, '/_security/user/_privileges')
    ).json()) as unknown;
    for (const fault of ['status', 'size', 'partial', 'stall'] as const) {
      let searches = 0;
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        tls: { cert: pem('server.crt'), key: pem('server.key') },
        fetch(request) {
          if (new URL(request.url).pathname.includes('_search')) searches++;
          return fault === 'stall'
            ? new Response(
                new ReadableStream({
                  start(controller) {
                    controller.enqueue(new TextEncoder().encode('{'));
                  },
                }),
              )
            : Response.json(
                fault === 'size'
                  ? { padding: 'x'.repeat(1048576) }
                  : fault === 'partial'
                    ? {}
                    : effective,
                { status: fault === 'status' ? 503 : 200 },
              );
        },
      });
      try {
        const started = performance.now();
        const report = await createScopedBackendAcceptance(
          {
            elastic: { ...access.elastic, url: `https://127.0.0.1:${String(server.port)}` },
            prometheus: access.prometheus,
            freshnessMs: 120000,
            deadlineMs: 100,
          },
          scope,
        ).inspect(observation, AbortSignal.timeout(1000));
        expect(report.health.state).toBe('incomplete');
        expect(searches).toBe(0);
        expect(performance.now() - started).toBeLessThan(1000);
        expect(report.provenance.elasticAuthority).toBe('unverified');
      } finally {
        await server.stop(true);
      }
    }
  },
);

lab('caller mutation cannot bypass the authority of an already bound credential', async () => {
  const configuration: BackendConfiguration = {
    elastic: admin,
    prometheus: access.prometheus,
    freshnessMs: 120000,
  };
  const adapter = createScopedBackendAcceptance(configuration, scope);
  configuration.elastic = 'http://127.0.0.1:9';
  const report = await adapter.inspect(observation, AbortSignal.timeout(10000));
  expect(report.health.state).toBe('incomplete');
  expect(report.evidence.log).toEqual({ state: 'unavailable', reason: 'query-authority' });
});
