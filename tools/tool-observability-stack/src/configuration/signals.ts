import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parse, stringify } from 'yaml';

import { createLegacyConfiguration } from './legacy';

const pathReference = type(/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*$/);
const name = type(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const endpoint = type(/^(?:[A-Za-z0-9_.-]+|\[[0-9a-fA-F:]+\]):[1-9][0-9]{0,4}$/);
const httpsEndpoint = type(
  /^https:\/\/[A-Za-z0-9_.-]+(?::[1-9][0-9]{0,4})?(?:\/[A-Za-z0-9_/-]*)?$/,
);
const serverTrust = type({
  certFile: pathReference,
  keyFile: pathReference,
  clientCaFile: pathReference,
});
const inputsShape = type({
  deployment: { cluster: name, namespace: name },
  source: {
    environment: name,
    admittedEnvironments: name.array().atLeastLength(1),
    infrastructureClusters: name.array().atLeastLength(1),
    filelogExcludes: type(/^\/var\/log\/pods\/[A-Za-z0-9_.*/-]+$/)
      .array()
      .atLeastLength(1),
  },
  endpoints: {
    collectorHttp: endpoint,
    collectorPlatformGrpc: endpoint,
    gatewayGrpc: endpoint,
    gatewayUpstream: endpoint,
    platformGrpc: endpoint,
    platformUpstream: endpoint,
    elasticsearch: httpsEndpoint,
    metricsRemoteWrite: httpsEndpoint,
  },
  trust: {
    collector: serverTrust,
    gateway: serverTrust,
    upstream: {
      caFile: pathReference,
      certFile: pathReference,
      keyFile: pathReference,
      serverName: name,
    },
    elasticsearch: { caFile: pathReference, username: name, passwordEnv: /^[A-Z][A-Z0-9_]*$/ },
    metrics: { caFile: pathReference, username: name, passwordFile: pathReference },
  },
  capacity: {
    queueBytes: 'number.integer > 0 & number <= 16777216',
    collectorMemoryMiB: 'number.integer > 0',
    collectorSpikeMiB: 'number.integer > 0',
    gatewayMemoryMiB: 'number.integer > 0',
    gatewaySpikeMiB: 'number.integer > 0',
  },
  retention: {
    logs: /^[1-9][0-9]*d$/,
    traces: /^[1-9][0-9]*d$/,
    aggregates: /^[1-9][0-9]*d$/,
    rolloverAge: /^[1-9][0-9]*d$/,
    rolloverSize: /^[1-9][0-9]*(?:mb|gb)$/,
    replicas: 'number.integer >= 0',
    metricsTime: /^[1-9][0-9]*d$/,
    metricsSize: /^[1-9][0-9]*(?:MB|GB)$/,
  },
});

/** Persistent profiles require explicit deployment, admitted producer identity, bounded capacity and mounted trust references. No secret material is accepted. */
export type SignalInputs = typeof inputsShape.infer;

const redactionShape = type({
  log_statements: type({ context: 'string', statements: 'string[]' }).array(),
});
const platformShape = type({
  spec: {
    values: {
      alternateConfig: {
        receivers: {
          filelog: {
            include: 'string[]',
            exclude: 'string[]',
            start_at: 'string',
            include_file_path: 'boolean',
            storage: 'string',
            operators: type({
              type: 'string',
              'id?': 'string',
              'if?': 'string',
              'from?': 'string',
              'to?': 'string',
              'field?': 'string',
              'parse_to?': 'string',
              'on_error?': 'string',
            }).array(),
          },
        },
        processors: { 'transform/redact': redactionShape },
      },
    },
  },
});
const agentShape = type({
  spec: {
    values: {
      alternateConfig: {
        receivers: {
          hostmetrics: {
            root_path: 'string',
            collection_interval: 'string',
            scrapers: { '[string]': 'object' },
          },
        },
        processors: {
          'resource/cluster': {
            attributes: type({ key: 'string', value: 'string', action: 'string' }).array(),
          },
          'resource/host-namespace': {
            attributes: type({ key: 'string', value: 'string', action: 'string' }).array(),
          },
        },
      },
    },
  },
});
const failureShape = type({
  properties: {
    'attributes.level': { type: 'string' },
    'attributes.service': { type: 'string' },
    'attributes.msg': { type: 'string' },
    'attributes.time': { type: 'string', format: 'string' },
    'attributes.failure.occurrence_id': { type: 'string' },
    'attributes.failure.fingerprint': { type: 'string' },
    'attributes.failure.v': { type: 'string' },
  },
});

/** Trusted repository policy locations; missing, unreadable and malformed policy fail at this boundary. */
export interface SignalPolicyPaths {
  agent: string | URL;
  collector: string | URL;
  failureFields: string | URL;
}
const policyPaths: SignalPolicyPaths = {
  agent: new URL('../../../../infra/platform/telemetry/agent/agent.yaml', import.meta.url),
  collector: new URL(
    '../../../../infra/platform/observability/otel/collector.yaml',
    import.meta.url,
  ),
  failureFields: new URL(
    '../../../../infra/platform/observability/elastic/settings/failure-fields.json',
    import.meta.url,
  ),
};

function readPolicies(paths: SignalPolicyPaths) {
  // Proof: missing ENOENT and unreadable EACCES dependencies reject every policy role in signals.test.ts.
  const collector: unknown = parse(readFileSync(paths.collector, 'utf8'));
  const agent: unknown = parse(readFileSync(paths.agent, 'utf8'));
  const failureFields: unknown = JSON.parse(readFileSync(paths.failureFields, 'utf8'));
  return {
    // Proof: bypassing platformShape.assert accepts malformed include_file_path in the collector-policy negative.
    collector: platformShape.assert(collector).spec.values.alternateConfig,
    // Proof: bypassing agentShape.assert accepts malformed hostmetrics collection_interval in the agent-policy negative.
    agent: agentShape.assert(agent).spec.values.alternateConfig,
    // Proof: bypassing failureShape.assert accepts numeric failure-field mapping type in the failure-policy negative.
    failureFields: failureShape.assert(failureFields),
  };
}

function assertInputs(inputs: SignalInputs): void {
  // Proof: bypassing inputsShape.assert makes broken-required-trust-input render negative fail.
  inputsShape.assert(inputs);
  // Proof: removing this branch accepts the foreign-source-environment render negative.
  if (!inputs.source.admittedEnvironments.includes(inputs.source.environment))
    throw new Error('source environment is not admitted');
}

function createAdmission(inputs: SignalInputs) {
  const environments = inputs.source.admittedEnvironments
    .map(
      (environment) =>
        `resource.attributes["deployment.environment.name"] != ${JSON.stringify(environment)}`,
    )
    .join(' and ');
  const admission = `(${environments}) or resource.attributes["service.name"] == nil or resource.attributes["service.name"] == ""`;
  return {
    error_mode: 'propagate',
    logs: { log_record: [admission] },
    traces: { span: [admission] },
    metrics: { datapoint: [admission] },
  };
}

function createServerTrust(trust: SignalInputs['trust']['collector']) {
  return {
    cert_file: trust.certFile,
    key_file: trust.keyFile,
    client_ca_file: trust.clientCaFile,
    client_ca_file_reload: true,
    min_version: '1.3',
    reload_interval: '1m',
  };
}

/** Builds common three-signal behavior. Producer resource environment/revision are never overwritten by deployment cluster or namespace. */
export function createSignalConfiguration(
  inputs: SignalInputs,
  paths: SignalPolicyPaths = policyPaths,
) {
  assertInputs(inputs);
  const policies = readPolicies(paths);
  const legacy = createLegacyConfiguration(paths.agent);
  const collectorProcessors = {
    memory_limiter: legacy.collector.processors.memory_limiter,
    batch: legacy.collector.processors.batch,
  };
  const gatewayProcessors = {
    memory_limiter: legacy.gateway.processors.memory_limiter,
    elasticapm: legacy.gateway.processors.elasticapm,
    batch: legacy.gateway.processors.batch,
  };
  const renameAdmission = (processors: string[]) =>
    processors.map((processor) => (processor === 'filter/dev' ? 'filter/source' : processor));
  const platformCondition = `(${inputs.source.infrastructureClusters.map((cluster) => `resource.attributes["puni.cluster"] != ${JSON.stringify(cluster)}`).join(' and ')}) or resource.attributes["deployment.environment.name"] != nil`;
  const platformAdmission = {
    error_mode: 'propagate',
    logs: { log_record: [platformCondition] },
    traces: { span: [platformCondition] },
    metrics: { datapoint: [platformCondition] },
  };
  const queue = {
    ...legacy.collector.exporters.otlp.sending_queue,
    queue_size: inputs.capacity.queueBytes,
  };
  const collector = {
    ...legacy.collector,
    extensions: {
      ...legacy.collector.extensions,
      'file_storage/checkpoints': {
        directory: '/var/lib/otelcol/checkpoints',
        create_directory: true,
      },
    },
    receivers: {
      otlp: {
        protocols: {
          http: {
            ...legacy.collector.receivers.otlp.protocols.http,
            endpoint: inputs.endpoints.collectorHttp,
            tls: createServerTrust(inputs.trust.collector),
          },
        },
      },
      'otlp/platform': {
        protocols: {
          grpc: {
            endpoint: inputs.endpoints.collectorPlatformGrpc,
            max_recv_msg_size_mib: 1,
            tls: createServerTrust(inputs.trust.collector),
          },
        },
      },
      filelog: {
        ...policies.collector.receivers.filelog,
        exclude: [
          ...policies.collector.receivers.filelog.exclude,
          ...inputs.source.filelogExcludes,
        ],
      },
      hostmetrics: policies.agent.receivers.hostmetrics,
    },
    processors: {
      ...collectorProcessors,
      memory_limiter: {
        check_interval: '1s',
        limit_mib: inputs.capacity.collectorMemoryMiB,
        spike_limit_mib: inputs.capacity.collectorSpikeMiB,
      },
      'filter/source': createAdmission(inputs),
      'filter/platform': platformAdmission,
      'transform/redact': policies.collector.processors['transform/redact'],
      'resource/cluster': policies.agent.processors['resource/cluster'],
      'resource/host-namespace': policies.agent.processors['resource/host-namespace'],
    },
    exporters: {
      ...legacy.collector.exporters,
      otlp: {
        ...legacy.collector.exporters.otlp,
        endpoint: inputs.endpoints.gatewayUpstream,
        sending_queue: { ...queue },
        tls: {
          ca_file: inputs.trust.upstream.caFile,
          cert_file: inputs.trust.upstream.certFile,
          key_file: inputs.trust.upstream.keyFile,
          server_name_override: inputs.trust.upstream.serverName,
          min_version: '1.3',
          reload_interval: '1m',
        },
      },
      prometheusremotewrite: {
        endpoint: inputs.endpoints.metricsRemoteWrite,
        resource_to_telemetry_conversion: { enabled: true },
        tls: { ca_file: inputs.trust.metrics.caFile, min_version: '1.3' },
        auth: { authenticator: 'basicauth/metrics' },
        timeout: '10s',
        retry_on_failure: {
          enabled: true,
          initial_interval: '1s',
          max_interval: '5s',
          max_elapsed_time: '30s',
        },
        remote_write_queue: { enabled: true, queue_size: 256, num_consumers: 2 },
        wal: {
          directory: '/var/lib/otelcol/prometheus',
          buffer_size: 100,
          truncate_frequency: '1m',
        },
      },
    },
    service: {
      ...legacy.collector.service,
      extensions: [
        ...legacy.collector.service.extensions,
        'file_storage/checkpoints',
        'basicauth/metrics',
      ],
      pipelines: {
        logs: {
          ...legacy.collector.service.pipelines.logs,
          processors: renameAdmission(legacy.collector.service.pipelines.logs.processors),
        },
        traces: {
          ...legacy.collector.service.pipelines.traces,
          processors: renameAdmission(legacy.collector.service.pipelines.traces.processors),
        },
        metrics: {
          ...legacy.collector.service.pipelines.metrics,
          processors: renameAdmission(legacy.collector.service.pipelines.metrics.processors),
        },
        'logs/forwarded': {
          receivers: ['otlp/platform'],
          processors: ['memory_limiter', 'filter/platform', 'transform/redact', 'batch'],
          exporters: ['otlp/platform'],
        },
        'metrics/forwarded': {
          receivers: ['otlp/platform'],
          processors: ['memory_limiter', 'filter/platform', 'batch'],
          exporters: ['prometheusremotewrite'],
        },
        'logs/platform': {
          receivers: ['filelog'],
          processors: ['memory_limiter', 'transform/redact', 'resource/cluster', 'batch'],
          exporters: ['otlp/platform'],
        },
        'metrics/platform': {
          receivers: ['hostmetrics'],
          processors: ['memory_limiter', 'resource/cluster', 'resource/host-namespace', 'batch'],
          exporters: ['prometheusremotewrite'],
        },
      },
    },
  };
  const collectorWithAuth = {
    ...collector,
    exporters: {
      ...collector.exporters,
      'otlp/platform': { ...collector.exporters.otlp, endpoint: inputs.endpoints.platformUpstream },
    },
    extensions: {
      ...collector.extensions,
      'basicauth/metrics': {
        client_auth: {
          username: inputs.trust.metrics.username,
          password_file: inputs.trust.metrics.passwordFile,
        },
      },
    },
  };
  const gateway = {
    ...legacy.gateway,
    receivers: {
      otlp: {
        protocols: {
          grpc: {
            ...legacy.gateway.receivers.otlp.protocols.grpc,
            endpoint: inputs.endpoints.gatewayGrpc,
            tls: createServerTrust(inputs.trust.gateway),
          },
        },
      },
      'otlp/platform': {
        protocols: {
          grpc: {
            ...legacy.gateway.receivers.otlp.protocols.grpc,
            endpoint: inputs.endpoints.platformGrpc,
            tls: createServerTrust(inputs.trust.gateway),
          },
        },
      },
    },
    processors: {
      ...gatewayProcessors,
      memory_limiter: {
        check_interval: '1s',
        limit_mib: inputs.capacity.gatewayMemoryMiB,
        spike_limit_mib: inputs.capacity.gatewaySpikeMiB,
      },
      'filter/source': createAdmission(inputs),
      'filter/platform': platformAdmission,
      'resource/stream/platform': {
        attributes: [
          { key: 'data_stream.namespace', from_attribute: 'puni.cluster', action: 'upsert' },
        ],
      },
      'resource/stream': {
        attributes: [
          { key: 'data_stream.namespace', value: inputs.source.environment, action: 'upsert' },
        ],
      },
    },
    exporters: {
      'elasticsearch/otel': {
        ...legacy.gateway.exporters['elasticsearch/otel'],
        endpoints: [inputs.endpoints.elasticsearch],
        sending_queue: { ...queue },
        user: inputs.trust.elasticsearch.username,
        password: `\${env:${inputs.trust.elasticsearch.passwordEnv}}`,
        tls: { ca_file: inputs.trust.elasticsearch.caFile, min_version: '1.3' },
      },
    },
    service: {
      ...legacy.gateway.service,
      pipelines: {
        logs: {
          ...legacy.gateway.service.pipelines.logs,
          processors: renameAdmission(legacy.gateway.service.pipelines.logs.processors),
        },
        traces: {
          ...legacy.gateway.service.pipelines.traces,
          processors: renameAdmission(legacy.gateway.service.pipelines.traces.processors),
        },
        'metrics/apm': legacy.gateway.service.pipelines['metrics/apm'],
        'logs/platform': {
          receivers: ['otlp/platform'],
          processors: ['memory_limiter', 'filter/platform', 'resource/stream/platform', 'batch'],
          exporters: ['elasticsearch/otel'],
        },
      },
    },
  };
  const elastic = Object.fromEntries(
    (['logs', 'traces', 'metrics'] as const).map((signal) => {
      const age = signal === 'metrics' ? inputs.retention.aggregates : inputs.retention[signal];
      const policy = `puni-${inputs.source.environment}-${signal}`;
      return [
        signal,
        {
          policyName: policy,
          policy: {
            policy: {
              phases: {
                hot: {
                  actions: {
                    rollover: {
                      max_age: inputs.retention.rolloverAge,
                      max_primary_shard_size: inputs.retention.rolloverSize,
                    },
                  },
                },
                delete: { min_age: age, actions: { delete: {} } },
              },
            },
          },
          templateName: `${signal}-otel@custom`,
          template: {
            template: {
              settings: {
                'index.lifecycle.name': policy,
                'index.lifecycle.prefer_ilm': true,
                'index.number_of_replicas': inputs.retention.replicas,
                'index.mapping.total_fields.limit': 500,
                'index.mapping.total_fields.ignore_dynamic_beyond_limit': true,
              },
              ...(signal === 'logs' ? { mappings: policies.failureFields } : {}),
            },
          },
        },
      ];
    }),
  );
  return {
    collector: collectorWithAuth,
    gateway,
    failureFields: policies.failureFields,
    retention: {
      elastic,
      prometheus: [
        `--storage.tsdb.retention.time=${inputs.retention.metricsTime}`,
        `--storage.tsdb.retention.size=${inputs.retention.metricsSize}`,
      ],
    },
  };
}

/** Shared collector/gateway configs and store setup payloads; deployment adapters own workloads and mounted references. */
export type SignalConfiguration = ReturnType<typeof createSignalConfiguration>;

/** Refuses malformed or weakened rendered candidates before serialization; runtime binary checks remain a separate acceptance layer. */
export function assertSignalConfiguration(
  inputs: SignalInputs,
  configuration: SignalConfiguration,
  paths: SignalPolicyPaths = policyPaths,
): void {
  const expected = createSignalConfiguration(inputs, paths);
  // Proof: removing this branch lets both missing collector/gateway trace-pipeline render negatives pass.
  if (
    !Object.hasOwn(configuration.collector.service.pipelines, 'traces') ||
    !Object.hasOwn(configuration.gateway.service.pipelines, 'traces')
  )
    throw new Error('trace pipeline required');
  // Proof: removing this branch changes the missing-metrics production-render negative from an explicit rejection to an unrelated exception.
  if (
    !Object.hasOwn(configuration.collector.service.pipelines, 'logs') ||
    !Object.hasOwn(configuration.collector.service.pipelines, 'metrics') ||
    !Object.hasOwn(configuration.gateway.service.pipelines, 'logs')
  )
    throw new Error('all signal pipelines required');
  // Proof: removing this branch accepts removed APM connector independently of trace enrichment.
  if (
    !Object.hasOwn(configuration.gateway.connectors, 'elasticapm') ||
    !isDeepStrictEqual(
      configuration.gateway.service.pipelines['metrics/apm'],
      expected.gateway.service.pipelines['metrics/apm'],
    ) ||
    !configuration.gateway.service.pipelines.traces.exporters.includes('elasticapm')
  )
    throw new Error('APM connector required');
  // Proof: removing this branch lets missing collector trace forwarding or its receiver reach the production renderer without rejection.
  if (
    !isDeepStrictEqual(
      configuration.collector.service.pipelines.traces.exporters,
      expected.collector.service.pipelines.traces.exporters,
    ) ||
    !isDeepStrictEqual(
      configuration.collector.service.pipelines.traces.receivers,
      expected.collector.service.pipelines.traces.receivers,
    )
  )
    throw new Error('collector trace forwarding required');
  // Proof: removing this branch lets gateway APM-only export or a disconnected receiver discard raw traces without production-render rejection.
  if (
    !isDeepStrictEqual(
      configuration.gateway.service.pipelines.traces.exporters,
      expected.gateway.service.pipelines.traces.exporters,
    ) ||
    !isDeepStrictEqual(
      configuration.gateway.service.pipelines.traces.receivers,
      expected.gateway.service.pipelines.traces.receivers,
    )
  )
    throw new Error('gateway raw trace export required');
  // Proof: removing this branch accepts trace-enrichment removal with the connector retained.
  if (!configuration.gateway.service.pipelines.traces.processors.includes('elasticapm'))
    throw new Error('trace enrichment required');
  for (const role of ['collector', 'gateway'] as const) {
    // Proof: removing this branch accepts the rewritten admission predicate and input-pipeline bypass negatives.
    if (
      !isDeepStrictEqual(
        configuration[role].processors['filter/source'],
        expected[role].processors['filter/source'],
      ) ||
      !configuration[role].service.pipelines.logs.processors.includes('filter/source') ||
      !configuration[role].service.pipelines.traces.processors.includes('filter/source') ||
      !configuration.collector.service.pipelines.metrics.processors.includes('filter/source')
    )
      throw new Error('source admission required in each application pipeline');
  }
  // Proof: removing this branch accepts source-environment relabelling in resource/stream.
  if (
    !isDeepStrictEqual(
      configuration.gateway.processors['resource/stream'],
      expected.gateway.processors['resource/stream'],
    )
  )
    throw new Error('source identity must not be rewritten');
  // Proof: removing this branch accepts removed redaction statements or log-pipeline redaction bypass.
  if (
    !isDeepStrictEqual(
      configuration.collector.processors['transform/redact'],
      expected.collector.processors['transform/redact'],
    ) ||
    !configuration.collector.service.pipelines.logs.processors.includes('transform/redact')
  )
    throw new Error('platform redaction required');
  // Proof: removing this branch accepts rendered upstream TLS trust removal.
  if (
    !isDeepStrictEqual(configuration.collector.receivers.otlp, expected.collector.receivers.otlp) ||
    !isDeepStrictEqual(configuration.gateway.receivers.otlp, expected.gateway.receivers.otlp) ||
    !isDeepStrictEqual(
      configuration.collector.receivers['otlp/platform'],
      expected.collector.receivers['otlp/platform'],
    ) ||
    !isDeepStrictEqual(
      configuration.collector.exporters.otlp.tls,
      expected.collector.exporters.otlp.tls,
    ) ||
    !isDeepStrictEqual(
      configuration.gateway.exporters['elasticsearch/otel'].tls,
      expected.gateway.exporters['elasticsearch/otel'].tls,
    ) ||
    !isDeepStrictEqual(
      configuration.collector.extensions['basicauth/metrics'],
      expected.collector.extensions['basicauth/metrics'],
    ) ||
    configuration.gateway.exporters['elasticsearch/otel'].password !==
      expected.gateway.exporters['elasticsearch/otel'].password ||
    configuration.gateway.exporters['elasticsearch/otel'].user !==
      expected.gateway.exporters['elasticsearch/otel'].user ||
    !isDeepStrictEqual(
      configuration.gateway.exporters['elasticsearch/otel'].endpoints,
      expected.gateway.exporters['elasticsearch/otel'].endpoints,
    ) ||
    configuration.collector.exporters.otlp.endpoint !==
      expected.collector.exporters.otlp.endpoint ||
    !isDeepStrictEqual(
      configuration.gateway.receivers['otlp/platform'],
      expected.gateway.receivers['otlp/platform'],
    ) ||
    !isDeepStrictEqual(
      configuration.collector.exporters['otlp/platform'].tls,
      expected.collector.exporters['otlp/platform'].tls,
    ) ||
    configuration.collector.exporters['otlp/platform'].endpoint !==
      expected.collector.exporters['otlp/platform'].endpoint
  )
    throw new Error('authenticated TLS trust required');
  // Proof: removing this branch accepts modified platform-metrics routing.
  if (
    !isDeepStrictEqual(
      configuration.collector.service.pipelines['logs/platform'],
      expected.collector.service.pipelines['logs/platform'],
    ) ||
    !isDeepStrictEqual(
      configuration.collector.service.pipelines['metrics/platform'],
      expected.collector.service.pipelines['metrics/platform'],
    ) ||
    !isDeepStrictEqual(
      configuration.collector.receivers.filelog,
      expected.collector.receivers.filelog,
    ) ||
    !isDeepStrictEqual(
      configuration.collector.receivers.hostmetrics,
      expected.collector.receivers.hostmetrics,
    ) ||
    !isDeepStrictEqual(configuration.failureFields, expected.failureFields) ||
    !isDeepStrictEqual(
      configuration.collector.processors['filter/platform'],
      expected.collector.processors['filter/platform'],
    ) ||
    !isDeepStrictEqual(
      configuration.collector.service.pipelines['logs/forwarded'],
      expected.collector.service.pipelines['logs/forwarded'],
    ) ||
    !isDeepStrictEqual(
      configuration.collector.service.pipelines['metrics/forwarded'],
      expected.collector.service.pipelines['metrics/forwarded'],
    ) ||
    !isDeepStrictEqual(
      configuration.gateway.processors['filter/platform'],
      expected.gateway.processors['filter/platform'],
    ) ||
    !isDeepStrictEqual(
      configuration.gateway.processors['resource/stream/platform'],
      expected.gateway.processors['resource/stream/platform'],
    ) ||
    !isDeepStrictEqual(
      configuration.gateway.service.pipelines['logs/platform'],
      expected.gateway.service.pipelines['logs/platform'],
    ) ||
    !isDeepStrictEqual(
      configuration.collector.processors['resource/cluster'],
      expected.collector.processors['resource/cluster'],
    ) ||
    !isDeepStrictEqual(
      configuration.collector.processors['resource/host-namespace'],
      expected.collector.processors['resource/host-namespace'],
    )
  )
    throw new Error('platform failure fields and infrastructure routing required');
  // Proof: removing this branch accepts altered retention payloads.
  if (!isDeepStrictEqual(configuration.retention, expected.retention))
    throw new Error('explicit retention required');
  // Proof: removing this branch accepts changed probe metric conversion.
  if (
    !isDeepStrictEqual(
      configuration.collector.exporters.prometheus,
      expected.collector.exporters.prometheus,
    ) ||
    !isDeepStrictEqual(
      configuration.collector.exporters.prometheusremotewrite,
      expected.collector.exporters.prometheusremotewrite,
    )
  )
    throw new Error('metrics transport and producer contracts required');
  // Proof: removing this branch accepts indefinite retry in the bounded recovery render negative.
  if (
    !isDeepStrictEqual(
      configuration.collector.exporters.otlp.retry_on_failure,
      expected.collector.exporters.otlp.retry_on_failure,
    ) ||
    !isDeepStrictEqual(
      configuration.collector.exporters['otlp/platform'].retry_on_failure,
      expected.collector.exporters['otlp/platform'].retry_on_failure,
    ) ||
    !isDeepStrictEqual(
      configuration.gateway.exporters['elasticsearch/otel'].retry,
      expected.gateway.exporters['elasticsearch/otel'].retry,
    ) ||
    configuration.collector.exporters.otlp.timeout !== expected.collector.exporters.otlp.timeout ||
    configuration.collector.exporters['otlp/platform'].timeout !==
      expected.collector.exporters['otlp/platform'].timeout ||
    configuration.gateway.exporters['elasticsearch/otel'].timeout !==
      expected.gateway.exporters['elasticsearch/otel'].timeout
  )
    throw new Error('bounded recovery required');
  for (const [exporter, canonical] of [
    [configuration.collector.exporters.otlp, expected.collector.exporters.otlp],
    [
      configuration.collector.exporters['otlp/platform'],
      expected.collector.exporters['otlp/platform'],
    ],
    [
      configuration.gateway.exporters['elasticsearch/otel'],
      expected.gateway.exporters['elasticsearch/otel'],
    ],
  ] as const) {
    // Proof: removing this branch accepts the disabled-persistent-queue and missing-storage-registration render negatives.
    if (
      !isDeepStrictEqual(exporter.sending_queue, canonical.sending_queue) ||
      !isDeepStrictEqual(
        configuration.collector.extensions['file_storage/queue'],
        expected.collector.extensions['file_storage/queue'],
      ) ||
      !isDeepStrictEqual(
        configuration.gateway.extensions['file_storage/queue'],
        expected.gateway.extensions['file_storage/queue'],
      ) ||
      !isDeepStrictEqual(
        configuration.collector.service.extensions,
        expected.collector.service.extensions,
      ) ||
      !isDeepStrictEqual(
        configuration.gateway.service.extensions,
        expected.gateway.service.extensions,
      )
    )
      throw new Error('bounded enabled persistent queue required');
  }
}

/** Emits deterministic service configs and retention payloads after production-path validation. */
export function renderSignalConfiguration(
  inputs: SignalInputs,
  configuration?: SignalConfiguration,
  paths: SignalPolicyPaths = policyPaths,
): Record<string, string> {
  if (configuration === undefined)
    return renderSignalConfiguration(inputs, createSignalConfiguration(inputs, paths), paths);
  assertSignalConfiguration(inputs, configuration, paths);
  return {
    'collector.yaml': stringify(configuration.collector),
    'gateway.yaml': stringify(configuration.gateway),
    'failure-fields.json': JSON.stringify(configuration.failureFields),
    'retention.json': JSON.stringify(configuration.retention),
  };
}
