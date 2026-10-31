import { createHash, randomUUID, X509Certificate } from 'node:crypto';

import { type } from 'arktype';

import {
  assertElasticQueryAuthority,
  createBackendAcceptance,
  QueryFault,
  selectRetainedDocuments,
} from './acceptance';
import { fingerprint, readRetainedObservation, type RetainedObservation } from './history';
import type { ProbeObservation } from './probe';
import { readBounded } from './source';
import {
  bindTransport,
  type BoundTransport,
  fetchTransport,
  type TransportEndpoint,
} from './transport';

const names = [
  'puni_dev_probe_observed_timestamp_seconds',
  'puni_dev_revision_info',
  'puni_dev_probe_success',
] as const;
const Snapshot = type({
  '+': 'reject',
  environment: "'dev'",
  service: "'be-01'",
  revision: /^[a-f0-9]{40}$/,
  observationId: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/,
  observedAt: 'number',
  startedAt: 'number',
  containerId: /^[a-f0-9]{64}$/,
  traceId: /^[a-f0-9]{32}$/,
  parentSpanId: /^[a-f0-9]{16}$/,
  childSpanId: /^[a-f0-9]{16}$/,
});
const ElasticReference = type({
  '+': 'reject',
  id: 'string',
  kind: "'log' | 'trace'",
  index: 'string',
  documentId: /^[A-Za-z0-9_-]{1,512}$/,
});
const MetricReference = type({
  '+': 'reject',
  id: 'string',
  kind: "'observed' | 'revision' | 'success'",
  series: fingerprint,
  time: 'number',
});
const Provider = type({
  '+': 'reject',
  version: '1',
  kind: "'legacy-elastic-prometheus'",
  observation: Snapshot,
  routes: { '+': 'reject', elastic: fingerprint, prometheus: fingerprint },
  elastic: ElasticReference.array(),
  prometheus: MetricReference.array(),
});
const Envelope = type({ '+': 'reject', version: '1', observation: 'unknown', provider: Provider });
export interface HistoryReceipt {
  version: 1;
  observation: RetainedObservation;
  provider: typeof Provider.infer;
}
/** Modeled failed or changed backend evidence; callers may publish an explicit noncomplete outcome. */
export class HistoryReadFault extends Error {}
export interface HistoryRoutes {
  elastic: TransportEndpoint;
  prometheus: TransportEndpoint;
}
const Search = type({
  timed_out: 'boolean',
  _shards: { failed: 'number' },
  hits: {
    total: { value: 'number', relation: "'eq'" },
    hits: type({ _index: 'string', _id: 'string', _source: 'unknown' }).array(),
  },
});
const Matrix = type({
  status: "'success'",
  'warnings?': 'unknown[]',
  'infos?': 'unknown[]',
  data: {
    resultType: "'matrix'",
    result: type({
      metric: { '[string]': 'string' },
      values: type(['number', 'string']).array(),
    }).array(),
  },
});
const metricKinds = ['observed', 'revision', 'success'] as const;

/** Stable canonical JSON for selected known projections; no unselected source fields are hashed. */
export function hashHistory(wire: unknown): string {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, entry]) => [key, canonical(entry)]),
      );
    return value;
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical(wire)))
    .digest('hex');
}
function routeCommitment(endpoint: TransportEndpoint): string {
  const bound = bindTransport(endpoint);
  return hashHistory(
    typeof endpoint === 'string'
      ? { url: bound.url.href, authentication: 'legacy-security-disabled' }
      : {
          url: bound.url.href,
          serverName: endpoint.serverName,
          authorities: Array.from(
            endpoint.ca.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g),
            (match) => new X509Certificate(match[0]).fingerprint256,
          ).sort(),
          principal:
            endpoint.authentication.kind === 'basic'
              ? { kind: 'basic', username: endpoint.authentication.username }
              : {
                  kind: 'mtls',
                  subject: new X509Certificate(endpoint.authentication.cert).subject,
                  issuer: new X509Certificate(endpoint.authentication.cert).issuer,
                },
        },
  );
}
function commitments(routes: HistoryRoutes) {
  return {
    elastic: routeCommitment(routes.elastic),
    prometheus: routeCommitment(routes.prometheus),
  };
}
function namespace(index: string, kind: 'log' | 'trace'): boolean {
  return new RegExp(
    `^(?:\\.ds-)?${kind === 'log' ? 'logs' : 'traces'}-[a-z0-9_.-]+\\.otel-dev(?:-[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}-[0-9]{6})?$`,
  ).test(index);
}
function frozen(snapshot: typeof Snapshot.infer): ProbeObservation {
  return {
    source: {
      kind: 'ssh-dev-container',
      containerValidated: true,
      containerId: snapshot.containerId,
    },
    environment: snapshot.environment,
    service: snapshot.service,
    revision: snapshot.revision,
    observationId: snapshot.observationId,
    traceId: snapshot.traceId,
    parentSpanId: snapshot.parentSpanId,
    childSpanId: snapshot.childSpanId,
    observedAt: snapshot.observedAt,
    startedAt: snapshot.startedAt,
    finishedAt: snapshot.observedAt,
    requestStartedAt: snapshot.startedAt,
    requestFinishedAt: snapshot.observedAt,
    producerVersion: 'retained',
    success: true,
    reason: null,
    requestDurationMs: null,
    transportDurationMs: null,
    publication: { state: 'acknowledged' },
  };
}
/** Closed provider/core closure is validated before any historical request; newer checkpoints are irrelevant. */
export function readHistoryReceipt(wire: unknown): HistoryReceipt {
  const checked = Envelope(wire);
  // Proof: bypassing Envelope validation made the CLI forged unknown-provider test accept provider version2.
  if (checked instanceof type.errors) throw new Error('history-envelope'); // guard: envelope
  const observation = readRetainedObservation(checked.observation),
    provider = checked.provider;
  const snapshot = provider.observation;
  // Proof: removing this guard made forged snapshot publish an unavailable outcome instead of refusing trusted state; boundary-only proof.
  if (
    snapshot.environment !== observation.identity.environment ||
    snapshot.service !== observation.identity.service ||
    snapshot.revision !== observation.identity.revision ||
    snapshot.observationId !== observation.identity.observationId ||
    snapshot.observedAt !== observation.observedAt ||
    !Number.isFinite(snapshot.startedAt) ||
    snapshot.startedAt < 0 ||
    snapshot.startedAt > snapshot.observedAt ||
    snapshot.parentSpanId === snapshot.childSpanId
  )
    throw new Error('history-snapshot'); // guard: snapshot
  const all = [...provider.elastic, ...provider.prometheus];
  const core = Object.values(observation.signals).flat();
  // Proof: removing this guard made forged closure reach backend verification and publish an outcome; boundary-only proof.
  if (
    all.length !== core.length ||
    new Set(all.map((reference) => reference.id)).size !== all.length ||
    provider.elastic.some(
      (reference) =>
        !namespace(reference.index, reference.kind) ||
        !observation.signals[reference.kind].some((entry) => entry.id === reference.id),
    ) ||
    provider.prometheus.some(
      (reference) =>
        !Number.isFinite(reference.time) ||
        reference.time < 0 ||
        reference.time > observation.capturedAt / 1000 ||
        !observation.signals.metric.some((entry) => entry.id === reference.id),
    ) ||
    new Set(provider.elastic.map((reference) => `${reference.index}/${reference.documentId}`))
      .size !== provider.elastic.length ||
    new Set(provider.prometheus.map((reference) => `${reference.series}/${String(reference.time)}`))
      .size !== provider.prometheus.length ||
    new Set(provider.prometheus.map((reference) => reference.kind)).size !== 3 ||
    provider.prometheus.length !== 3 ||
    new Set(provider.prometheus.map((reference) => reference.time)).size !== 1
  )
    throw new Error('history-closure'); // guard: closure
  return { version: 1, observation, provider };
}
async function query(
  base: BoundTransport,
  path: string,
  signal: AbortSignal,
  body?: unknown,
): Promise<unknown> {
  try {
    const response = await fetchTransport(new URL(path, base.url), base, {
      signal,
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: {
              ...Object.fromEntries(new Headers(base.options.headers)),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          }),
    });
    // Proof: raising this read cap made historical oversize accept valid oversized JSON; removing status validation made historical status accept HTTP503.
    const text = await readBounded(response, 1048576); // guard: response-bound
    if (response.status !== 200) throw new HistoryReadFault('history-http'); // guard: http
    return JSON.parse(text);
  } catch (error) {
    // Proof: bypassing this recovery made historical malformed lose its explicit noncomplete outcome; boundary-only proof.
    if (
      signal.aborted ||
      error instanceof SyntaxError ||
      error instanceof RangeError ||
      error instanceof TypeError ||
      (error instanceof Error &&
        ['ConnectionRefused', 'ECONNREFUSED', 'ConnectionClosed'].includes(error.name))
    )
      throw new HistoryReadFault('history-query-unavailable');
    throw error;
  }
}
async function records(
  base: BoundTransport,
  kind: 'log' | 'trace',
  previous: ProbeObservation,
  signal: AbortSignal,
  reference?: typeof ElasticReference.infer,
) {
  const path =
    reference === undefined
      ? `/${kind === 'log' ? 'logs' : 'traces'}-*.otel-dev/_search`
      : `/${encodeURIComponent(reference.index)}/_search`;
  const checked = Search(
    await query(base, path, signal, {
      size: 16,
      track_total_hits: true,
      timeout: '3s',
      query:
        reference === undefined
          ? {
              bool: {
                filter: [
                  { term: { 'attributes.puni.observation.id': previous.observationId } },
                  { term: { 'resource.attributes.service.name': 'puni-dev-probe' } },
                  { term: { 'resource.attributes.deployment.environment.name': 'dev' } },
                ],
              },
            }
          : { ids: { values: [reference.documentId] } },
    }),
  );
  // Proof: removing this guard made historical namespace accept a foreign physical index with unchanged source fields.
  if (
    checked instanceof type.errors ||
    checked.timed_out ||
    checked._shards.failed !== 0 ||
    checked.hits.total.value !== checked.hits.hits.length ||
    checked.hits.hits.length < 1 ||
    checked.hits.hits.length > 16 ||
    checked.hits.hits.some(
      (hit) =>
        !namespace(hit._index, kind) ||
        !/^[A-Za-z0-9_-]{1,512}$/.test(hit._id) ||
        (reference !== undefined &&
          (hit._index !== reference.index || hit._id !== reference.documentId)),
    ) ||
    new Set(checked.hits.hits.map((hit) => `${hit._index}/${hit._id}`)).size !==
      checked.hits.hits.length ||
    (reference !== undefined && checked.hits.hits.length !== 1)
  )
    throw new HistoryReadFault('history-records'); // guard: records
  return checked.hits.hits;
}
async function metricSamples(base: BoundTransport, now: number, signal: AbortSignal) {
  const url = new URL('/api/v1/query', base.url);
  url.searchParams.set(
    'query',
    `{__name__=~"${names.join('|')}",environment="dev",service="be-01"}[180s]`,
  );
  url.searchParams.set('time', String(now));
  url.searchParams.set('timeout', '3s');
  const checked = Matrix(await query(base, url.href, signal));
  // Proof: removing this guard made historical warning accept an explicitly partial matrix.
  if (
    checked instanceof type.errors ||
    (checked.warnings !== undefined && checked.warnings.length !== 0) ||
    (checked.infos !== undefined && checked.infos.length !== 0) ||
    checked.data.result.length > 16
  )
    throw new HistoryReadFault('history-matrix'); // guard: matrix
  const samples: {
    kind: (typeof metricKinds)[number];
    series: string;
    time: number;
    value: string;
    revision?: string;
  }[] = [];
  for (const series of checked.data.result) {
    const ordinal = names.findIndex((name) => name === series.metric['__name__']);
    if (
      ordinal < 0 ||
      series.metric['environment'] !== 'dev' ||
      series.metric['service'] !== 'be-01'
    )
      throw new HistoryReadFault('history-metric-identity'); // guard: metric-identity
    for (const [time, value] of series.values) {
      // Proof: removing this guard made capture second-samples accept more than512 stored samples.
      if (
        !Number.isFinite(time) ||
        time < now - 180 ||
        time > now ||
        value.trim() === '' ||
        !Number.isFinite(Number(value)) ||
        samples.length >= 512
      )
        throw new HistoryReadFault('history-samples'); // guard: samples
      samples.push({
        kind: metricKinds[ordinal],
        series: hashHistory(series.metric),
        time,
        value,
        ...(ordinal === 1 ? { revision: series.metric['revision'] } : {}),
      });
    }
  }
  return samples;
}
function selectedDocuments(
  previous: ProbeObservation,
  kind: 'log' | 'trace',
  wires: unknown[],
): unknown[] {
  try {
    return selectRetainedDocuments(previous, kind, wires);
  } catch (error) {
    // Proof: bypassing this recovery made historical trace lose its explicit noncomplete outcome; boundary-only proof.
    if (error instanceof QueryFault) throw new HistoryReadFault('history-document');
    throw error;
  }
}
async function authorize(routes: HistoryRoutes, elastic: BoundTransport, signal: AbortSignal) {
  // Proof: removing this authority check made authenticated history accept a principal with cluster-all rights.
  if (typeof routes.elastic !== 'string')
    assertElasticQueryAuthority(await query(elastic, '/_security/user/_privileges', signal), 'dev');
}
/** Capture accepts only the actual existing fresh correlated gate, then freezes exact validated physical witnesses. */
export async function captureHistory(
  routes: HistoryRoutes,
  previous: ProbeObservation,
): Promise<HistoryReceipt> {
  // Proof: removing the binding snapshot makes the actual authenticated caller-mutation capture test fail after acceptance.
  const boundRoutes = structuredClone(routes); // guard: capture-binding-snapshot
  // Proof: extending this to20s made capture total deadline succeed after12.6s; the20s test harness observed the intended assertion.
  const signal = AbortSignal.timeout(10000),
    started = Date.now(); // guard: deadline
  const routesCommitment = commitments(boundRoutes);
  const report = await createBackendAcceptance({
    ...boundRoutes,
    freshnessMs: 180000,
    deadlineMs: 10000,
  }).inspect(previous, signal);
  // Proof: removing this guard made coherent stale capture publish a receipt despite the actual fresh gate reporting stale.
  if (
    report.health.state !== 'complete' ||
    report.provenance.metric.scrapeTimestamp === null ||
    previous.revision === null ||
    previous.source.kind !== 'ssh-dev-container' ||
    !previous.source.containerValidated
  )
    throw new Error('history-acceptance'); // guard: acceptance
  const elastic = bindTransport(boundRoutes.elastic),
    prometheus = bindTransport(boundRoutes.prometheus);
  const log = await records(elastic, 'log', previous, signal),
    trace = await records(elastic, 'trace', previous, signal);
  const signals: RetainedObservation['signals'] = { log: [], trace: [], metric: [] };
  const elasticReferences: typeof Provider.infer.elastic = [];
  for (const [kind, hits] of [
    ['log', log],
    ['trace', trace],
  ] as const) {
    const projections = selectedDocuments(
      previous,
      kind,
      hits.map((hit) => hit._source),
    );
    for (const [ordinal, hit] of hits.entries()) {
      const id = `${kind}:${String(ordinal)}`;
      signals[kind].push({ id, fingerprint: hashHistory(projections[ordinal]) });
      elasticReferences.push({ id, kind, index: hit._index, documentId: hit._id });
    }
  }
  const samples = await metricSamples(prometheus, started / 1000, signal),
    scrape = report.provenance.metric.scrapeTimestamp;
  const prometheusReferences: typeof Provider.infer.prometheus = [];
  for (const [ordinal, kind] of metricKinds.entries()) {
    const selected = samples.filter((sample) => sample.kind === kind && sample.time === scrape);
    // Proof: removing this guard made capture second-revision retain a changed revision after the earlier actual acceptance succeeded.
    if (
      selected.length !== 1 ||
      (kind === 'revision' && selected[0].revision !== previous.revision) ||
      Number(selected[0].value) !== (kind === 'observed' ? previous.observedAt / 1000 : 1)
    )
      throw new HistoryReadFault('history-correlation'); // guard: correlation
    const sample = selected[0],
      id = `metric:${String(ordinal)}`;
    signals.metric.push({ id, fingerprint: hashHistory(sample) });
    prometheusReferences.push({ id, kind, series: sample.series, time: sample.time });
  }
  const snapshot = {
    environment: previous.environment,
    service: previous.service,
    revision: previous.revision,
    observationId: previous.observationId,
    observedAt: previous.observedAt,
    startedAt: previous.startedAt,
    containerId: previous.source.containerId,
    traceId: previous.traceId,
    parentSpanId: previous.parentSpanId,
    childSpanId: previous.childSpanId,
  };
  return readHistoryReceipt({
    version: 1,
    observation: {
      version: 1,
      operationId: randomUUID(),
      identity: {
        environment: previous.environment,
        service: previous.service,
        revision: previous.revision,
        observationId: previous.observationId,
      },
      observedAt: previous.observedAt,
      capturedAt: Date.now(),
      signals,
      authority: 'evidence-only',
    },
    provider: {
      version: 1,
      kind: 'legacy-elastic-prometheus',
      observation: snapshot,
      routes: routesCommitment,
      elastic: elasticReferences,
      prometheus: prometheusReferences,
    },
  });
}
/** Original exact scrape times and physical document locations are read without any current-health assessment. */
export async function verifyHistory(routes: HistoryRoutes, receipt: HistoryReceipt): Promise<void> {
  // Proof: removing this guard made forged route accept a mismatched committed read route.
  if (hashHistory(commitments(routes)) !== hashHistory(receipt.provider.routes))
    throw new Error('history-route'); // guard: route
  // Proof: extending this to20s made verification total deadline succeed after12.9s; the20s harness observed the intended assertion.
  const signal = AbortSignal.timeout(10000); // guard: verification-deadline
  const elastic = bindTransport(routes.elastic),
    prometheus = bindTransport(routes.prometheus),
    previous = frozen(receipt.provider.observation);
  await authorize(routes, elastic, signal);
  for (const kind of ['log', 'trace'] as const) {
    const references = receipt.provider.elastic.filter((reference) => reference.kind === kind);
    const hits = await Promise.all(
      references.map(
        async (reference) => (await records(elastic, kind, previous, signal, reference))[0],
      ),
    );
    const projections = selectedDocuments(
      previous,
      kind,
      hits.map((hit) => hit._source),
    );
    for (const [ordinal, reference] of references.entries()) {
      // Proof: removing this comparison made historical trace-time accept a changed but structurally valid stored span.
      if (
        receipt.observation.signals[kind].find((entry) => entry.id === reference.id)
          ?.fingerprint !== hashHistory(projections[ordinal])
      )
        throw new HistoryReadFault('history-changed'); // guard: record-fingerprint
    }
  }
  // A raw range selector evaluated at the original scrape preserves stored coordinates, including subsecond precision.
  const samples = await metricSamples(prometheus, receipt.provider.prometheus[0].time, signal);
  for (const reference of receipt.provider.prometheus) {
    const selected = samples.filter(
      (sample) =>
        sample.kind === reference.kind &&
        sample.series === reference.series &&
        sample.time === reference.time,
    );
    // Proof: removing this comparison made historical sample-changed accept a changed original sample.
    if (
      selected.length !== 1 ||
      receipt.observation.signals.metric.find((entry) => entry.id === reference.id)?.fingerprint !==
        hashHistory(selected[0])
    )
      throw new HistoryReadFault('history-sample-changed'); // guard: metric-fingerprint
  }
}
