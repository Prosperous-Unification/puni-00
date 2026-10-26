import { type } from 'arktype';

import type { ProbeObservation, Publication, PublicationPort } from './probe';
import { readBounded } from './source';
import { bindTransport, fetchTransport, type TransportEndpoint } from './transport';

function attribute(key: string, value: string | number | boolean) {
  return {
    key,
    value:
      typeof value === 'string'
        ? { stringValue: value }
        : typeof value === 'boolean'
          ? { boolValue: value }
          : { doubleValue: value },
  };
}
const Acknowledgement = type({
  '+': 'reject',
  'partialSuccess?': {
    '+': 'reject',
    'rejectedLogRecords?': "'0' | 0",
    'rejectedDataPoints?': "'0' | 0",
    'rejectedSpans?': "'0' | 0",
    'errorMessage?': "''",
  },
});

const nanos = (milliseconds: number) => String(BigInt(Math.trunc(milliseconds)) * 1000000n);

/** Standard OTLP JSON. Producer resource identity stays separate from the observed application. */
export function encodeOtlp(observation: ProbeObservation, previousRevision: string | null = null) {
  const resource = {
    attributes: [
      attribute('service.name', 'puni-dev-probe'),
      attribute('service.version', observation.producerVersion),
      attribute('deployment.environment.name', 'dev'),
      attribute('telemetry.sdk.name', 'puni-dev-probe'),
      attribute('telemetry.sdk.language', 'javascript'),
    ],
  };
  const scope = { name: 'puni-dev-probe', version: observation.producerVersion };
  const attributes = [
    attribute('puni.observation.id', observation.observationId),
    attribute('puni.observation.timestamp_ms', observation.observedAt),
    attribute('puni.target.environment', observation.environment),
    attribute('puni.target.service', observation.service),
    attribute('puni.source.kind', observation.source.kind),
    attribute('puni.probe.success', observation.success),
    attribute('puni.probe.kind', 'external-health'),
  ];
  // Proof: bypassing this guard makes local rehearsal claim inspected container provenance.
  if (observation.source.kind === 'ssh-dev-container' && observation.source.containerValidated) {
    attributes.push(
      attribute('puni.target.container', 'wbs-dev-src'),
      attribute('puni.target.container.id', observation.source.containerId),
      attribute('puni.target.mount.source', '/home/puni1/wbs-dev/src'),
    );
  }
  if (observation.revision !== null)
    attributes.push(attribute('puni.target.revision', observation.revision));
  if (observation.reason !== null) attributes.push(attribute('error.type', observation.reason));
  if (observation.requestDurationMs !== null)
    attributes.push(attribute('puni.request.duration_ms', observation.requestDurationMs));
  if (observation.transportDurationMs !== null)
    attributes.push(attribute('puni.transport.duration_ms', observation.transportDurationMs));
  const span = (name: string, spanId: string, start: number, end: number, kind: number) => ({
    traceId: observation.traceId,
    spanId,
    parentSpanId: '',
    name,
    kind,
    startTimeUnixNano: nanos(start),
    endTimeUnixNano: nanos(end),
    attributes,
    status: {
      code: observation.success ? 1 : 2,
      ...(observation.reason === null ? {} : { message: observation.reason }),
    },
  });
  const parent = span(
    'dev health observation',
    observation.parentSpanId,
    observation.startedAt,
    observation.finishedAt,
    1,
  );
  const child = {
    ...span(
      'GET be-01 /health',
      observation.childSpanId,
      observation.requestStartedAt,
      observation.requestFinishedAt,
      3,
    ),
    parentSpanId: observation.parentSpanId,
    attributes: [
      ...attributes,
      attribute('http.request.method', 'GET'),
      attribute('url.path', '/health'),
    ],
  };
  // Proof: forcing an HTTP child on failed actual inspection makes its no-unmeasured-request negative fail.
  const spans = observation.requestDurationMs === null ? [parent] : [parent, child];
  const dimensions = [attribute('environment', 'dev'), attribute('service', 'be-01')];
  const point = (value: number, labels = dimensions) => ({
    attributes: labels,
    timeUnixNano: nanos(observation.observedAt),
    asDouble: value,
  });
  const gauge = (name: string, value: number, labels = dimensions) => ({
    name,
    gauge: { dataPoints: [point(value, labels)] },
  });
  const metrics = [
    gauge('puni_dev_probe_success', observation.success ? 1 : 0),
    gauge('puni_dev_probe_observed_timestamp_seconds', observation.observedAt / 1000),
  ];
  if (observation.requestDurationMs !== null)
    metrics.push(gauge('puni_dev_probe_duration_seconds', observation.requestDurationMs / 1000));
  // Proof: suppressing old-revision zero makes bounded metric/revision replacement test fail.
  if (previousRevision !== null && previousRevision !== observation.revision)
    metrics.push(
      gauge('puni_dev_revision_info', 0, [...dimensions, attribute('revision', previousRevision)]),
    );
  if (observation.revision !== null)
    metrics.push(
      gauge('puni_dev_revision_info', 1, [
        ...dimensions,
        attribute('revision', observation.revision),
      ]),
    );
  return {
    logs: {
      resourceLogs: [
        {
          resource,
          scopeLogs: [
            {
              scope,
              logRecords: [
                {
                  timeUnixNano: nanos(observation.observedAt),
                  observedTimeUnixNano: nanos(observation.finishedAt),
                  severityNumber: observation.success ? 9 : 17,
                  severityText: observation.success ? 'INFO' : 'ERROR',
                  body: { stringValue: 'dev health observation' },
                  attributes,
                  traceId: observation.traceId,
                  spanId: observation.parentSpanId,
                },
              ],
            },
          ],
        },
      ],
    },
    traces: { resourceSpans: [{ resource, scopeSpans: [{ scope, spans }] }] },
    metrics: { resourceMetrics: [{ resource, scopeMetrics: [{ scope, metrics }] }] },
  };
}

/** Loopback tunnel destination only. An OTLP acknowledgement never claims backend storage. */
export function createOtlpPublisher(
  endpoint: TransportEndpoint,
  previousRevision: string | null = null,
): PublicationPort {
  // Proof: invalid previous revision is accepted if this guard is removed.
  if (previousRevision !== null && !/^[a-f0-9]{40}$/.test(previousRevision))
    throw new Error('Invalid previous revision');
  const send = createOtlpSender(endpoint);
  return {
    publish: async (observation, signal) => {
      const encoded = encodeOtlp(observation, previousRevision);
      for (const kind of ['logs', 'metrics', 'traces'] as const) {
        const publication = await send(kind, encoded[kind], signal);
        if (publication.state !== 'acknowledged') return publication;
      }
      if (observation.revision !== null) previousRevision = observation.revision;
      return { state: 'acknowledged' };
    },
  };
}

/** Reuses the pinned OTLP HTTP acknowledgement, size and target policy for bounded batches. */
export function createOtlpSender(endpoint: TransportEndpoint) {
  const transport = bindTransport(endpoint);
  const { url, options } = transport;
  return async (
    kind: 'logs' | 'metrics' | 'traces',
    payload: unknown,
    signal: AbortSignal,
  ): Promise<Publication> => {
    try {
      const response = await fetchTransport(new URL(`/v1/${kind}`, url), transport, {
        method: 'POST',
        ...options,
        headers: {
          ...Object.fromEntries(new Headers(options.headers)),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });
      const text = await readBounded(response, 4096);
      // Proof: actual HTTP 503 and partial-success tests fail with acknowledgement checks removed.
      if (response.status !== 200) return { state: 'failed', reason: `otlp-${kind}-http-status` };
      let acknowledgement: unknown;
      try {
        acknowledgement = JSON.parse(text);
      } catch (error) {
        if (error instanceof SyntaxError)
          return { state: 'failed', reason: 'otlp-malformed-acknowledgement' };
        throw error;
      }
      if (Acknowledgement(acknowledgement) instanceof type.errors)
        return { state: 'failed', reason: 'otlp-partial-or-invalid-acknowledgement' };
      return { state: 'acknowledged' };
    } catch (error) {
      if (signal.aborted) return { state: 'failed', reason: 'deadline' };
      if (error instanceof RangeError) return { state: 'failed', reason: 'otlp-response-size' };
      if (
        error instanceof TypeError ||
        (error instanceof Error &&
          ['ConnectionRefused', 'ECONNREFUSED', 'ConnectionClosed'].includes(error.name))
      )
        return { state: 'failed', reason: 'otlp-unavailable' };
      throw error;
    }
  };
}
