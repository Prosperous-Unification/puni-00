import { type } from 'arktype';

import {
  assessObservation,
  type ObservationEvidence,
  type ObservationHealth,
  type SignalEvidence,
} from './observation';
import type { PreviousObservationPort, ProbeObservation } from './probe';
import { readBounded } from './source';

const Document = type({
  '@timestamp': 'string | number',
  resource: { attributes: { 'deployment.environment.name': 'string', 'service.name': 'string' } },
  attributes: {
    'puni.target.environment': 'string',
    'puni.target.service': 'string',
    'puni.target.revision': 'string',
    'puni.observation.id': 'string',
    'puni.observation.timestamp_ms': 'number',
    'puni.source.kind': 'string',
    'puni.target.container': 'string',
    'puni.target.container.id': 'string',
    'puni.target.mount.source': 'string',
    'puni.probe.success': 'boolean',
    'transaction.root?': 'boolean',
  },
  trace_id: 'string',
  span_id: 'string',
  'parent_span_id?': 'string',
  'name?': 'string',
  'kind?': 'string',
  'body?': { text: 'string' },
  'status?': { code: 'string' },
});
const Search = type({
  timed_out: 'boolean',
  _shards: { failed: 'number' },
  hits: {
    total: { value: 'number', relation: 'string' },
    hits: type({ _source: 'unknown' }).array(),
  },
});
const Matrix = type({
  status: "'success'",
  'warnings?': 'unknown[]',
  'infos?': 'unknown[]',
  data: {
    resultType: "'matrix'",
    result: type({ metric: { '[string]': 'string' }, values: 'unknown[]' }).array(),
  },
});
const Sample = type(['number', 'string']);
const fields = [
  '@timestamp',
  'resource.attributes',
  'attributes',
  'trace_id',
  'span_id',
  'parent_span_id',
  'name',
  'kind',
  'body.text',
  'status.code',
];
const names = [
  'puni_dev_probe_observed_timestamp_seconds',
  'puni_dev_revision_info',
  'puni_dev_probe_success',
] as const;
class QueryFault extends Error {}

export interface BackendConfiguration {
  elastic: string;
  prometheus: string;
  freshnessMs: number;
  deadlineMs?: number;
}
/** Provider provenance stays at this boundary; the shared model only receives semantic evidence. */
export interface AcceptanceReport {
  health: ObservationHealth;
  evidence: ObservationEvidence;
  provenance: {
    log: { provider: 'elastic' };
    trace: { provider: 'elastic' };
    metric: {
      provider: 'prometheus';
      correlation: 'exact-observation-time-and-unique-active-revision';
      scrapeTimestamp: number | null;
    };
  };
}
function endpoint(text: string): URL {
  const url = new URL(text);
  // Proof: bypassing loopback policy fails the unsafe query endpoint negatives.
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username !== '' ||
    url.password !== '' ||
    !['', '/'].includes(url.pathname) ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new Error('Invalid loopback query endpoint');
  return url;
}
function epoch(value: string | number): number {
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value))
    throw new QueryFault('invalid-time');
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new QueryFault('invalid-time');
  return milliseconds;
}
async function query(url: URL, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    redirect: 'manual',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  // Proof: raising this dependency cap accepts the oversized valid-JSON HTTP fixture.
  const text = await readBounded(response, 1048576);
  // Proof: removing status validation fails the valid-JSON HTTP503 negative.
  if (response.status !== 200) throw new QueryFault('http-status');
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) throw new QueryFault('malformed-json');
    throw error;
  }
}
function identity(previous: ProbeObservation) {
  if (previous.revision === null) throw new Error('Source revision is required for assessment');
  return {
    environment: previous.environment,
    service: previous.service,
    revision: previous.revision,
    observationId: previous.observationId,
  };
}
function validateDocument(wire: unknown, previous: ProbeObservation) {
  const document = Document(wire);
  if (document instanceof type.errors) throw new QueryFault('invalid-document');
  const attrs = document.attributes,
    resource = document.resource.attributes;
  // Proof: removing source-kind/container-ID checks independently fails stored wrong-source negatives.
  // Exact source binding is independent of the collector's resource environment admission.
  if (
    previous.source.kind !== 'ssh-dev-container' ||
    !previous.source.containerValidated ||
    resource['deployment.environment.name'] !== 'dev' ||
    resource['service.name'] !== 'puni-dev-probe' ||
    attrs['puni.source.kind'] !== 'ssh-dev-container' ||
    attrs['puni.target.container'] !== 'wbs-dev-src' ||
    attrs['puni.target.container.id'] !== previous.source.containerId ||
    attrs['puni.target.mount.source'] !== '/home/puni1/wbs-dev/src'
  )
    throw new QueryFault('source-mismatch');
  // Proof: removing each environment/service/revision/observation-ID comparison fails its stored identity negative.
  if (
    attrs['puni.target.environment'] !== previous.environment ||
    attrs['puni.target.service'] !== previous.service ||
    attrs['puni.target.revision'] !== previous.revision ||
    attrs['puni.observation.id'] !== previous.observationId
  )
    throw new QueryFault('identity-mismatch');
  if (
    attrs['puni.observation.timestamp_ms'] !== previous.observedAt ||
    attrs['puni.probe.success'] !== previous.success
  )
    throw new QueryFault('observation-mismatch');
  if (document.trace_id !== previous.traceId) throw new QueryFault('trace-mismatch');
  return document;
}
async function search(
  base: URL,
  kind: 'logs' | 'traces',
  previous: ProbeObservation,
  signal: AbortSignal,
) {
  const wire = await query(new URL(`/${kind}-*.otel-dev/_search`, base), signal, {
    size: 16,
    track_total_hits: true,
    timeout: '3s',
    _source: fields,
    query: {
      bool: {
        filter: [
          { term: { 'attributes.puni.observation.id': previous.observationId } },
          { term: { 'resource.attributes.service.name': 'puni-dev-probe' } },
          { term: { 'resource.attributes.deployment.environment.name': 'dev' } },
        ],
      },
    },
  });
  const checked = Search(wire);
  if (checked instanceof type.errors) throw new QueryFault('invalid-search');
  // Proof: removing timeout, failed-shard, relation, total or record-cap checks independently fails bounded-search negatives.
  // Successful HTTP does not imply a complete bounded search.
  if (
    checked.timed_out ||
    checked._shards.failed !== 0 ||
    checked.hits.total.relation !== 'eq' ||
    checked.hits.total.value !== checked.hits.hits.length ||
    checked.hits.hits.length > 16
  )
    throw new QueryFault('incomplete-search');
  return checked.hits.hits.map((hit) => validateDocument(hit._source, previous));
}
async function logEvidence(
  base: URL,
  previous: ProbeObservation,
  signal: AbortSignal,
): Promise<SignalEvidence> {
  const documents = await search(base, 'logs', previous, signal);
  if (documents.length === 0) return { state: 'missing' };
  for (const document of documents) {
    // Proof: removing stored log timestamp equality accepts the wrong-timestamp HTTP fixture.
    if (
      document.body?.text !== 'dev health observation' ||
      document.span_id !== previous.parentSpanId ||
      epoch(document['@timestamp']) !== previous.observedAt
    )
      throw new QueryFault('invalid-log');
  }
  return {
    state: 'found',
    identity: identity(previous),
    observedAt: previous.observedAt,
    proof: { kind: 'record' },
  };
}
async function traceEvidence(
  base: URL,
  previous: ProbeObservation,
  signal: AbortSignal,
): Promise<SignalEvidence> {
  const documents = await search(base, 'traces', previous, signal);
  if (documents.length === 0) return { state: 'missing' };
  const canonical = new Map<string, string>();
  for (const document of documents) {
    const time = epoch(document['@timestamp']);
    if (
      time < previous.startedAt ||
      time > previous.observedAt ||
      document.status?.code !== (previous.success ? 'Ok' : 'Error')
    )
      throw new QueryFault('invalid-span');
    // Proof: root-parent, root-flag and child-parent removals independently fail stored trace relationship negatives.
    const root = document.span_id === previous.parentSpanId;
    if (
      root
        ? document.kind !== 'Internal' ||
          document.name !== 'dev health observation' ||
          document.attributes['transaction.root'] !== true ||
          (document.parent_span_id !== undefined && document.parent_span_id !== '')
        : document.span_id !== previous.childSpanId ||
          document.kind !== 'Client' ||
          document.name !== 'GET be-01 /health' ||
          document.parent_span_id !== previous.parentSpanId
    )
      throw new QueryFault('incomplete-trace');
    const proof = JSON.stringify([
      document.trace_id,
      document.span_id,
      document.parent_span_id ?? '',
      document.kind,
      document.name,
      time,
      document.status.code,
      document.attributes['transaction.root'] ?? false,
    ]);
    const existing = canonical.get(document.span_id);
    // Proof: allowing conflicting duplicate identities fails the conflicting duplicate span fixture.
    if (existing !== undefined && existing !== proof) throw new QueryFault('conflicting-span');
    canonical.set(document.span_id, proof);
  }
  // Proof: accepting a single root fails the partial-trace HTTP fixture.
  if (canonical.size !== 2) throw new QueryFault('incomplete-trace');
  return {
    state: 'found',
    identity: identity(previous),
    observedAt: previous.observedAt,
    proof: {
      kind: 'trace',
      traceId: previous.traceId,
      parentSpanId: previous.parentSpanId,
      childSpanId: previous.childSpanId,
      childParentSpanId: previous.parentSpanId,
    },
  };
}
async function metricEvidence(
  base: URL,
  previous: ProbeObservation,
  now: number,
  signal: AbortSignal,
): Promise<{ evidence: SignalEvidence; scrapeTimestamp: number | null }> {
  const url = new URL('/api/v1/query', base);
  // A raw range selector retains actual scrape timestamps; query_range evaluation times do not.
  url.searchParams.set(
    'query',
    `{__name__=~"${names.join('|')}",environment="dev",service="be-01"}[180s]`,
  );
  url.searchParams.set('time', String(now / 1000));
  url.searchParams.set('timeout', '3s');
  // Proof: accepting vector results or ignoring warnings/infos independently fails partial-matrix negatives.
  const checked = Matrix(await query(url, signal));
  if (
    checked instanceof type.errors ||
    (checked.warnings !== undefined && checked.warnings.length !== 0) ||
    (checked.infos !== undefined && checked.infos.length !== 0)
  )
    throw new QueryFault('incomplete-matrix');
  if (checked.data.result.length === 0)
    return { evidence: { state: 'missing' }, scrapeTimestamp: null };
  // Proof: lifting series/sample caps fails their independent otherwise-valid matrix fixtures.
  if (checked.data.result.length > 16) throw new QueryFault('matrix-size');
  const samples: { name: string; revision: string | undefined; time: number; value: number }[] = [];
  for (const series of checked.data.result) {
    const name = series.metric['__name__'];
    if (
      !names.some((known) => known === name) ||
      series.metric['environment'] !== 'dev' ||
      series.metric['service'] !== 'be-01'
    )
      throw new QueryFault('metric-identity');
    for (const wire of series.values) {
      const sample = Sample(wire);
      if (sample instanceof type.errors) throw new QueryFault('invalid-sample');
      const [time, text] = sample;
      const value = Number(text);
      if (
        !Number.isFinite(time) ||
        time < now / 1000 - 180 ||
        time > now / 1000 ||
        !Number.isFinite(value) ||
        text.trim() === ''
      )
        throw new QueryFault('invalid-sample');
      samples.push({ name, revision: series.metric['revision'], time, value });
      if (samples.length > 512) throw new QueryFault('matrix-size');
    }
  }
  // Proof: ignoring exact gauge equality fails wrong stored timestamp independently of stored revision.
  const matches = samples.filter(
    (sample) => sample.name === names[0] && sample.value === previous.observedAt / 1000,
  );
  if (matches.length === 0) throw new QueryFault('metric-observation-time');
  for (const match of matches) {
    const revisions = samples.filter(
      (sample) => sample.name === names[1] && sample.time === match.time && sample.value === 1,
    );
    // Proof: ignoring active uniqueness, revision or scrape equality independently fails ambiguous/wrong-revision/wrong-scrape negatives.
    if (revisions.length !== 1 || revisions[0].revision !== previous.revision)
      throw new QueryFault('metric-revision');
    const successes = samples.filter(
      (sample) => sample.name === names[2] && sample.time === match.time,
    );
    // Proof: ignoring the stored measurement accepts the wrong-success gauge fixture.
    if (successes.length !== 1 || successes[0].value !== (previous.success ? 1 : 0))
      throw new QueryFault('metric-measurement');
  }
  // Only after stored time and stored revision validation may this adapter associate an observation ID.
  const match = matches[0];
  return {
    evidence: {
      state: 'found',
      identity: identity(previous),
      observedAt: match.value * 1000,
      proof: { kind: 'record' },
    },
    scrapeTimestamp: match.time,
  };
}
async function available(
  operation: () => Promise<SignalEvidence>,
  signal: AbortSignal,
): Promise<SignalEvidence> {
  try {
    return await operation();
  } catch (error) {
    if (signal.aborted) return { state: 'unavailable', reason: 'query-deadline' };
    if (error instanceof QueryFault) return { state: 'unavailable', reason: error.message };
    if (error instanceof RangeError) return { state: 'unavailable', reason: 'query-size' };
    if (
      error instanceof TypeError ||
      (error instanceof Error &&
        ['ConnectionRefused', 'ECONNREFUSED', 'ConnectionClosed'].includes(error.name))
    )
      return { state: 'unavailable', reason: 'query-unavailable' };
    throw error;
  }
}

/** Bounded private-backend adapter. A failed latest source has no fabricated expected identity. */
export function createBackendAcceptance(
  configuration: BackendConfiguration,
): PreviousObservationPort & {
  inspect(previous: ProbeObservation, signal: AbortSignal): Promise<AcceptanceReport>;
} {
  const elastic = endpoint(configuration.elastic),
    prometheus = endpoint(configuration.prometheus);
  // Proof: invalid query-bound negatives fail with the configuration guard removed.
  const deadlineMs = configuration.deadlineMs ?? 5000;
  if (
    !Number.isFinite(configuration.freshnessMs) ||
    configuration.freshnessMs <= 0 ||
    configuration.freshnessMs > 180000 ||
    !Number.isFinite(deadlineMs) ||
    deadlineMs <= 0 ||
    deadlineMs > 10000
  )
    throw new Error('Invalid query bounds');
  const inspect = async (
    previous: ProbeObservation,
    parent: AbortSignal,
  ): Promise<AcceptanceReport> => {
    const provenance: AcceptanceReport['provenance'] = {
      log: { provider: 'elastic' },
      trace: { provider: 'elastic' },
      metric: {
        provider: 'prometheus',
        correlation: 'exact-observation-time-and-unique-active-revision',
        scrapeTimestamp: null,
      },
    };
    // Proof: bypassing rehearsal/failed-source preflight performs forbidden queries in their independent HTTP negatives.
    if (
      previous.revision === null ||
      !previous.success ||
      previous.source.kind !== 'ssh-dev-container' ||
      !previous.source.containerValidated
    ) {
      const evidence: SignalEvidence = { state: 'unavailable', reason: 'source-not-validated' };
      return {
        health: {
          state: 'incomplete',
          signals: {
            log: ['unavailable: source-not-validated'],
            metric: ['unavailable: source-not-validated'],
            trace: ['unavailable: source-not-validated'],
          },
        },
        evidence: { log: evidence, metric: evidence, trace: evidence },
        provenance,
      };
    }
    // Proof: extending this timeout fails the actual delayed-HTTP deadline negative.
    const signal = AbortSignal.any([parent, AbortSignal.timeout(deadlineMs)]),
      now = Date.now();
    const [log, trace, metric] = await Promise.all([
      available(() => logEvidence(elastic, previous, signal), signal),
      available(() => traceEvidence(elastic, previous, signal), signal),
      available(async () => {
        const measured = await metricEvidence(prometheus, previous, now, signal);
        provenance.metric.scrapeTimestamp = measured.scrapeTimestamp;
        return measured.evidence;
      }, signal),
    ]);
    const evidence = { log, metric, trace };
    return {
      health: assessObservation(identity(previous), evidence, now, configuration.freshnessMs),
      evidence,
      provenance,
    };
  };
  return { inspect, assess: async (previous, signal) => (await inspect(previous, signal)).health };
}
