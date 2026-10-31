import { afterEach, expect, test } from 'bun:test';

import {
  type AcceptanceScope,
  assertElasticQueryAuthority,
  createBackendAcceptance,
  createScopedBackendAcceptance,
} from './acceptance';
import type { ProbeObservation } from './probe';

const revision = 'a'.repeat(40);
const observedAt = Date.now() - 35000;
const containerId = 'd'.repeat(64);
const observation: ProbeObservation = {
  source: { kind: 'ssh-dev-container', containerValidated: true, containerId },
  observationId: 'stored-observation',
  traceId: '1'.repeat(32),
  parentSpanId: '2'.repeat(16),
  childSpanId: '3'.repeat(16),
  environment: 'dev',
  service: 'be-01',
  producerVersion: 'test',
  revision,
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
const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) void server.stop(true);
});
function document(kind: 'log' | 'root' | 'child') {
  return {
    '@timestamp': String(observedAt - (kind === 'log' ? 0 : 10)) + '.0',
    resource: {
      attributes: { 'deployment.environment.name': 'dev', 'service.name': 'puni-dev-probe' },
    },
    attributes: {
      'puni.target.environment': 'dev',
      'puni.target.service': 'be-01',
      'puni.target.revision': revision,
      'puni.observation.id': observation.observationId,
      'puni.observation.timestamp_ms': observedAt,
      'puni.source.kind': 'ssh-dev-container',
      'puni.target.container': 'wbs-dev-src',
      'puni.target.container.id': containerId,
      'puni.target.mount.source': '/home/puni1/wbs-dev/src',
      'puni.probe.success': true,
      ...(kind === 'root' ? { 'transaction.root': true } : {}),
    },
    trace_id: observation.traceId,
    span_id: kind === 'child' ? observation.childSpanId : observation.parentSpanId,
    ...(kind === 'log'
      ? { body: { text: 'dev health observation' } }
      : {
          name: kind === 'root' ? 'dev health observation' : 'GET be-01 /health',
          kind: kind === 'root' ? 'Internal' : 'Client',
          status: { code: 'Ok' },
          ...(kind === 'child' ? { parent_span_id: observation.parentSpanId } : {}),
        }),
  };
}
function elastic(documents: unknown[]) {
  return {
    timed_out: false,
    _shards: { failed: 0 },
    hits: {
      total: { value: documents.length, relation: 'eq' },
      hits: documents.map((_source) => ({ _source })),
    },
  };
}
const scrape = Math.floor((observedAt + 5000) / 1000);
function series(name: string, value: string, labels: Record<string, string> = {}) {
  return {
    metric: { __name__: name, environment: 'dev', service: 'be-01', ...labels },
    values: [[scrape, value]],
  };
}
function prometheus() {
  return {
    status: 'success',
    data: {
      resultType: 'matrix',
      result: [
        series('puni_dev_probe_observed_timestamp_seconds', String(observedAt / 1000)),
        series('puni_dev_probe_success', '1'),
        series('puni_dev_revision_info', '1', { revision }),
      ],
    },
  };
}
function harness(
  change: {
    logs?: unknown;
    traces?: unknown;
    metrics?: unknown;
    status?: number;
    delay?: number;
  } = {},
) {
  const queries: { url: string; body: unknown }[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      queries.push({
        url: request.url,
        body: request.method === 'POST' ? await request.json() : null,
      });
      if (change.delay !== undefined) await Bun.sleep(change.delay);
      const path = new URL(request.url).pathname;
      return Response.json(
        path.includes('logs-')
          ? (change.logs ?? elastic([document('log')]))
          : path.includes('traces-')
            ? (change.traces ?? elastic([document('root'), document('child')]))
            : (change.metrics ?? prometheus()),
        { status: change.status ?? 200 },
      );
    },
  });
  servers.push(server);
  const endpoint = `http://127.0.0.1:${String(server.port)}`;
  return {
    queries,
    adapter: createBackendAcceptance({
      elastic: endpoint,
      prometheus: endpoint,
      freshnessMs: 180000,
      deadlineMs: 100,
    }),
  };
}

test('stored mapping correlates metric scrape and unique stored revision independently', async () => {
  const { adapter, queries } = harness();
  const report = await adapter.inspect(observation, new AbortController().signal);
  expect(report.health.state).toBe('complete');
  expect(report.provenance.metric).toEqual({
    provider: 'prometheus',
    correlation: 'exact-observation-time-and-unique-active-revision',
    scrapeTimestamp: scrape,
  });
  expect(queries.length).toBe(3);
  const metricQuery = queries.find((request) => request.url.includes('/api/v1/query'));
  expect(metricQuery?.url).toContain('%5B180s%5D');
  const query = queries.find((request) => request.url.includes('_search'))?.body as {
    size: number;
    track_total_hits: boolean;
  };
  expect(query.size).toBe(16);
  expect(query.track_total_hits).toBe(true);
});

test.each([
  [
    'empty',
    elastic([]),
    elastic([]),
    { status: 'success', data: { resultType: 'matrix', result: [] } },
    'missing',
  ],
  [
    'partial trace',
    elastic([document('log')]),
    elastic([document('root')]),
    prometheus(),
    'incomplete',
  ],
  ['timed out', { ...elastic([]), timed_out: true }, elastic([]), prometheus(), 'incomplete'],
  [
    'failed shard',
    { ...elastic([]), _shards: { failed: 1 } },
    elastic([]),
    prometheus(),
    'incomplete',
  ],
  [
    'truncated',
    { ...elastic([]), hits: { total: { value: 17, relation: 'gte' }, hits: [] } },
    elastic([]),
    prometheus(),
    'incomplete',
  ],
  [
    'prom failure',
    elastic([document('log')]),
    elastic([document('root'), document('child')]),
    { status: 'error', error: 'unavailable' },
    'incomplete',
  ],
  [
    'prom warning',
    elastic([document('log')]),
    elastic([document('root'), document('child')]),
    { ...prometheus(), warnings: ['partial'] },
    'incomplete',
  ],
  [
    'wrong result type',
    elastic([document('log')]),
    elastic([document('root'), document('child')]),
    { status: 'success', data: { resultType: 'vector', result: [] } },
    'incomplete',
  ],
] as const)(
  '%s never establishes complete storage',
  async (name, logs, traces, metrics, expected) => {
    const report = await harness({ logs, traces, metrics }).adapter.inspect(
      observation,
      new AbortController().signal,
    );
    expect(report.health.state).toBe(expected);
    if (['timed out', 'failed shard', 'truncated'].includes(name))
      expect(report.evidence.log.state).toBe('unavailable');
    if (['prom failure', 'prom warning', 'wrong result type'].includes(name))
      expect(report.evidence.metric.state).toBe('unavailable');
  },
);

test.each(['trace_id', 'parent_span_id', 'span_id', 'root-parent', 'kind', 'root-flag'] as const)(
  'stored invalid trace %s is rejected',
  async (field) => {
    const root = document('root'),
      child = document('child');
    if (field === 'root-parent') Object.assign(root, { parent_span_id: 'f'.repeat(16) });
    else if (field === 'root-flag') Object.assign(root.attributes, { 'transaction.root': false });
    else Object.assign(child, { [field]: 'wrong' });
    expect(
      (
        await harness({ traces: elastic([root, child]) }).adapter.assess(
          observation,
          new AbortController().signal,
        )
      ).state,
    ).toBe('incomplete');
  },
);

test.each([
  'wrong revision',
  'ambiguous revision',
  'wrong timestamp',
  'wrong scrape',
  'wrong success',
] as const)('metric %s is independently rejected', async (fault) => {
  const metrics = prometheus();
  if (fault === 'wrong revision')
    Object.assign(metrics.data.result[2].metric, { revision: 'b'.repeat(40) });
  if (fault === 'ambiguous revision')
    metrics.data.result.push(series('puni_dev_revision_info', '1', { revision: 'b'.repeat(40) }));
  if (fault === 'wrong timestamp')
    metrics.data.result[0].values[0][1] = String((observedAt + 1) / 1000);
  if (fault === 'wrong scrape') metrics.data.result[2].values[0][0] = scrape + 1;
  if (fault === 'wrong success') metrics.data.result[1].values[0][1] = '0';
  expect(
    (await harness({ metrics }).adapter.assess(observation, new AbortController().signal)).state,
  ).toBe('incomplete');
});

test('rehearsal and latest failed source cannot substitute previous successful telemetry', async () => {
  const { adapter, queries } = harness();
  for (const previous of [
    { ...observation, source: { kind: 'local-http-rehearsal' as const } },
    { ...observation, revision: null, success: false },
  ]) {
    const health = await adapter.assess(previous, new AbortController().signal);
    expect(health.state).toBe('incomplete');
    expect(queries.length).toBe(0);
  }
});

test('query status and total HTTP deadline remain visible unavailable evidence', async () => {
  for (const change of [{ status: 503 }, { delay: 250 }]) {
    const started = performance.now();
    const health = await harness(change).adapter.assess(observation, new AbortController().signal);
    expect(health.state).toBe('incomplete');
    expect(health.signals.log[0]).toContain('unavailable');
    expect(performance.now() - started).toBeLessThan(220);
  }
});

test.each([
  'http://example.com',
  'https://127.0.0.1',
  'http://user:secret@127.0.0.1',
  'http://127.0.0.1/foreign',
])('query endpoint refuses %s', (elastic) => {
  expect(() =>
    createBackendAcceptance({ elastic, prometheus: 'http://127.0.0.1:19090', freshnessMs: 180000 }),
  ).toThrow();
});

test('stored timestamp and malformed document cannot establish log evidence', async () => {
  const log = document('log');
  log['@timestamp'] = String(observedAt + 1);
  for (const logs of [elastic([log]), elastic([{ unsupported: true }])]) {
    const health = await harness({ logs }).adapter.assess(
      observation,
      new AbortController().signal,
    );
    expect(health.signals.log[0]).toContain('unavailable');
  }
});

test('stored spans outside observation window and conflicting duplicate span proofs fail', async () => {
  const root = document('root');
  root['@timestamp'] = String(observedAt + 1);
  const duplicate = document('child');
  duplicate['@timestamp'] = String(observedAt - 1);
  for (const traces of [
    elastic([root, document('child')]),
    elastic([document('root'), document('child'), duplicate]),
  ]) {
    expect(
      (await harness({ traces }).adapter.assess(observation, new AbortController().signal)).signals
        .trace[0],
    ).toContain('unavailable');
  }
});

test('successful valid JSON over the HTTP byte cap stays unavailable', async () => {
  const logs = { ...elastic([document('log')]), padding: 'x'.repeat(1048576) };
  expect(
    (await harness({ logs }).adapter.assess(observation, new AbortController().signal)).signals.log,
  ).toEqual(['unavailable: query-size']);
});

test('freshness is assessed from stored observation time even with successfully queried records', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      return Response.json(
        path.includes('logs-')
          ? elastic([document('log')])
          : path.includes('traces-')
            ? elastic([document('root'), document('child')])
            : prometheus(),
      );
    },
  });
  servers.push(server);
  const endpoint = `http://127.0.0.1:${String(server.port)}`;
  const adapter = createBackendAcceptance({
    elastic: endpoint,
    prometheus: endpoint,
    freshnessMs: 1000,
  });
  expect((await adapter.assess(observation, new AbortController().signal)).state).toBe('stale');
});

test.each([
  { freshnessMs: 0 },
  { freshnessMs: 180001 },
  { freshnessMs: Number.NaN },
  { deadlineMs: 0 },
  { deadlineMs: 10001 },
])('invalid trusted query bounds throw %j', (fault) => {
  expect(() =>
    createBackendAcceptance({
      elastic: 'http://127.0.0.1',
      prometheus: 'http://127.0.0.1',
      freshnessMs: 180000,
      ...fault,
    }),
  ).toThrow();
});

test.each([
  { total: { value: 0, relation: 'gte' }, hits: [] },
  { total: { value: 1, relation: 'eq' }, hits: [] },
  {
    total: { value: 17, relation: 'eq' },
    hits: Array.from({ length: 17 }, () => ({ _source: document('log') })),
  },
])('each bounded search completeness clause is independent %j', async (hits) => {
  expect(
    (
      await harness({ logs: { ...elastic([]), hits } }).adapter.inspect(
        observation,
        new AbortController().signal,
      )
    ).evidence.log.state,
  ).toBe('unavailable');
});

test('failed latest request with known revision is independently incomplete', async () => {
  const { adapter, queries } = harness();
  expect(
    (
      await adapter.assess(
        { ...observation, success: false, reason: 'http-status' },
        new AbortController().signal,
      )
    ).state,
  ).toBe('incomplete');
  expect(queries.length).toBe(0);
});

test.each(['environment', 'service', 'sample', 'series-cap', 'sample-cap', 'infos'] as const)(
  'metric boundary refuses %s',
  async (fault) => {
    const metrics = prometheus();
    if (fault === 'environment') metrics.data.result[0].metric.environment = 'production';
    if (fault === 'service') metrics.data.result[0].metric.service = 'foreign';
    if (fault === 'sample')
      metrics.data.result.push(
        series('puni_dev_revision_info', 'NaN', { revision: 'b'.repeat(40) }),
      );
    if (fault === 'series-cap')
      metrics.data.result.push(
        ...Array.from({ length: 14 }, (_entry, index) =>
          series('puni_dev_revision_info', '0', { revision: String(index).padStart(40, 'b') }),
        ),
      );
    if (fault === 'sample-cap')
      metrics.data.result[0].values = Array.from({ length: 513 }, () => [
        scrape,
        String(observedAt / 1000),
      ]);
    if (fault === 'infos') Object.assign(metrics, { infos: ['partial'] });
    expect(
      (await harness({ metrics }).adapter.inspect(observation, new AbortController().signal))
        .evidence.metric.state,
    ).toBe('unavailable');
  },
);

test.each([
  'environment',
  'service',
  'revision',
  'observation.id',
  'source.kind',
  'container.id',
] as const)('stored wrong %s is rejected', async (field) => {
  const log = document('log');
  const keys = {
    environment: 'puni.target.environment',
    service: 'puni.target.service',
    revision: 'puni.target.revision',
    'observation.id': 'puni.observation.id',
    'source.kind': 'puni.source.kind',
    'container.id': 'puni.target.container.id',
  };
  Object.assign(log.attributes, { [keys[field]]: 'wrong' });
  expect(
    (
      await harness({ logs: elastic([log]) }).adapter.assess(
        observation,
        new AbortController().signal,
      )
    ).state,
  ).toBe('incomplete');
});

const scope = {
  environment: 'prod',
  service: 'example-service',
  producer: 'component-probe',
  namespace: 'prod',
  sourceIdentity: 'disposable-component-5',
  provenance: 'component' as const,
  metricNames: ['example_observed_seconds', 'example_revision', 'example_success'] as const,
  logName: 'component observation',
  childName: 'GET example /health',
};
function scopedDocument(kind: 'log' | 'root' | 'child') {
  const stored = document(kind);
  stored.resource.attributes = {
    'deployment.environment.name': 'prod',
    'service.name': 'component-probe',
  };
  return {
    ...stored,
    attributes: {
      ...stored.attributes,
      'puni.target.environment': 'prod',
      'puni.target.service': 'example-service',
      'puni.source.kind': 'component',
      'puni.source.identity': scope.sourceIdentity,
    },
    ...(kind === 'log'
      ? { body: { text: scope.logName } }
      : { name: kind === 'root' ? scope.logName : scope.childName }),
  };
}
function scopedHarness(
  change: Record<string, unknown> = {},
  expected: AcceptanceScope = scope,
  correlation: string | undefined = expected.metricObservationId,
) {
  const queries: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      queries.push(request.url);
      const path = new URL(request.url).pathname;
      const documents = path.includes('logs-')
        ? [scopedDocument('log')]
        : [scopedDocument('root'), scopedDocument('child')];
      return Response.json(
        path.includes('_search')
          ? elastic(
              documents.map((stored) => ({
                ...stored,
                attributes: { ...stored.attributes, ...change },
              })),
            )
          : {
              status: 'success',
              data: {
                resultType: 'matrix',
                result: [
                  [scope.metricNames[0], String(observedAt / 1000), {}],
                  [scope.metricNames[1], '1', { revision }],
                  [scope.metricNames[2], '1', {}],
                ].map(([name, value, labels]) => ({
                  metric: {
                    __name__: name,
                    environment: 'prod',
                    service: 'example-service',
                    ...(correlation === undefined ? {} : { puni_observation_id: correlation }),
                    ...(labels as object),
                  },
                  values: [[scrape, value]],
                })),
              },
            },
      );
    },
  });
  servers.push(server);
  const endpoint = `http://127.0.0.1:${String(server.port)}`;
  const configuration = { elastic: endpoint, prometheus: endpoint, freshnessMs: 180000 };
  return {
    queries,
    configuration,
    adapter: createScopedBackendAcceptance(configuration, expected),
  };
}
const scopedObservation = {
  ...observation,
  environment: 'prod',
  service: 'example-service',
  source: {
    kind: 'scoped' as const,
    identity: scope.sourceIdentity,
    provenance: 'component' as const,
  },
};
test('scoped component evidence is complete with its own explicit source and query scope', async () => {
  const { adapter, queries } = scopedHarness();
  const report = await adapter.inspect(scopedObservation, AbortSignal.timeout(1000));
  expect(report.health.state).toBe('complete');
  expect(report.provenance.source).toEqual({
    kind: 'scoped',
    identity: scope.sourceIdentity,
    provenance: 'component',
  });
  expect(queries.filter((url) => url.includes('.otel-prod/'))).toHaveLength(2);
});
test('canary metric correlation filters queries and refuses a foreign returned observation', async () => {
  const expected = { ...scope, metricObservationId: 'canary-observation' };
  const accepted = scopedHarness({}, expected);
  expect(
    (await accepted.adapter.inspect(scopedObservation, AbortSignal.timeout(1000))).health.state,
  ).toBe('complete');
  expect(
    accepted.queries.some((url) =>
      new URL(url).searchParams.get('query')?.includes('puni_observation_id="canary-observation"'),
    ),
  ).toBe(true);
  const foreign = scopedHarness({}, expected, 'foreign-observation');
  expect(
    (await foreign.adapter.inspect(scopedObservation, AbortSignal.timeout(1000))).health.state,
  ).toBe('incomplete');
});
test('scoped stored source cannot impersonate actual WBS source', async () => {
  const { adapter } = scopedHarness({ 'puni.source.kind': 'ssh-dev-container' });
  expect((await adapter.inspect(scopedObservation, AbortSignal.timeout(1000))).health.state).toBe(
    'incomplete',
  );
});
test('wrong scoped expected identity refuses before backend query', async () => {
  const { adapter, queries } = scopedHarness();
  expect(
    (
      await adapter.inspect(
        { ...scopedObservation, source: { ...scopedObservation.source, identity: 'foreign' } },
        AbortSignal.timeout(1000),
      )
    ).health.state,
  ).toBe('incomplete');
  expect(queries).toEqual([]);
});
test('scoped configuration rejects absent and malformed source scope', () => {
  const endpoints = {
    elastic: 'http://127.0.0.1:1',
    prometheus: 'http://127.0.0.1:2',
    freshnessMs: 1000,
  };
  for (const changed of [
    { ...scope, sourceIdentity: '' },
    { ...scope, namespace: 'prod/*' },
    { ...scope, metricNames: ['bad{', 'b', 'c'] },
    { ...scope, provenance: 'ssh-dev-container' },
  ])
    expect(() => createScopedBackendAcceptance(endpoints, changed as typeof scope)).toThrow();
});

const effective = {
  cluster: [],
  global: [],
  indices: [
    {
      names: ['logs-*.otel-prod', 'traces-*.otel-prod'],
      privileges: ['read'],
      allow_restricted_indices: false,
    },
  ],
  applications: [],
  run_as: [],
};
test('effective query authority requires exact scope and read only grants', () => {
  expect(() => {
    assertElasticQueryAuthority(effective, 'prod');
  }).not.toThrow();
  for (const changed of [
    { ...effective, cluster: ['monitor'] },
    { ...effective, run_as: ['elastic'] },
    { ...effective, applications: [{ application: '*' }] },
    { ...effective, remote_indices: [{}] },
    { ...effective, global: [{}] },
    { ...effective, unknown: true },
    { ...effective, indices: [{ ...effective.indices[0], names: ['*'] }] },
    { ...effective, indices: [{ ...effective.indices[0], privileges: ['read', 'write'] }] },
    { ...effective, indices: [{ ...effective.indices[0], names: ['logs-*.otel-prod'] }] },
    { ...effective, indices: [{ ...effective.indices[0], allow_restricted_indices: true }] },
  ])
    expect(() => {
      assertElasticQueryAuthority(changed, 'prod');
    }).toThrow(/query-authority/);
});

test.each([
  ['stored source identity', { 'puni.source.identity': 'foreign' }],
  ['stored source provenance', { 'puni.source.kind': 'measured' }],
])('scoped %s refuses independently', async (_label, change) => {
  const { adapter } = scopedHarness(change);
  expect((await adapter.inspect(scopedObservation, AbortSignal.timeout(1000))).health.state).toBe(
    'incomplete',
  );
});
test.each([
  ['environment', { ...scopedObservation, environment: 'dev' }],
  ['service', { ...scopedObservation, service: 'other' }],
  [
    'provenance',
    {
      ...scopedObservation,
      source: { ...scopedObservation.source, provenance: 'measured' as const },
    },
  ],
])('scoped expected %s refuses before any network', async (_label, previous) => {
  const { adapter, queries } = scopedHarness();
  expect((await adapter.inspect(previous, AbortSignal.timeout(1000))).health.state).toBe(
    'incomplete',
  );
  expect(queries).toEqual([]);
});
test('scoped metric names must be distinct', () => {
  expect(() =>
    createScopedBackendAcceptance(
      { elastic: 'http://127.0.0.1:1', prometheus: 'http://127.0.0.1:1', freshnessMs: 1000 },
      { ...scope, metricNames: ['same', 'same', 'same'] },
    ),
  ).toThrow(/scope/);
});

test('scoped construction snapshots the validated expected source', async () => {
  const expected = { ...scope, metricNames: [...scope.metricNames] as [string, string, string] };
  const { adapter } = scopedHarness({}, expected);
  expected.environment = 'foreign';
  expected.sourceIdentity = 'foreign';
  expected.metricNames[0] = 'foreign_observed_seconds';
  const report = await adapter.inspect(scopedObservation, AbortSignal.timeout(1000));
  expect(report.health.state).toBe('complete');
});

test('scoped construction snapshots validated freshness bounds', async () => {
  const { adapter, configuration } = scopedHarness();
  configuration.freshnessMs = 1;
  expect((await adapter.inspect(scopedObservation, AbortSignal.timeout(1000))).health.state).toBe(
    'complete',
  );
});
