import { readFileSync } from 'node:fs';

import { type } from 'arktype';
import { parse, stringify } from 'yaml';

import { renderDevCompose } from './deployment';

const PlatformRedaction = type({
  spec: {
    values: {
      alternateConfig: {
        processors: {
          'transform/redact': {
            log_statements: type({ context: 'string', statements: 'string[]' }).array(),
          },
        },
      },
    },
  },
});
const admission =
  'resource.attributes["deployment.environment.name"] != "dev" or resource.attributes["service.name"] == nil or resource.attributes["service.name"] == ""';

/** Reuses the platform credential-shape policy; absent/malformed trusted policy throws. */
export function createDevConfiguration(
  platformAgentPath: string | URL = new URL(
    '../../../../infra/platform/telemetry/agent/agent.yaml',
    import.meta.url,
  ),
) {
  // Proof: absent platform-agent dependency throws ENOENT in the missing-policy negative.
  const platform: unknown = parse(readFileSync(platformAgentPath, 'utf8'));
  // Proof: bypassing PlatformRedaction.assert failed the malformed-policy shape negative.
  const redaction =
    PlatformRedaction.assert(platform).spec.values.alternateConfig.processors['transform/redact'];
  const filter = () => ({
    error_mode: 'propagate',
    logs: { log_record: [admission] },
    traces: { span: [admission] },
    metrics: { datapoint: [admission] },
  });
  const storage = (directory: string) => ({ directory, create_directory: true, timeout: '5s' });
  const telemetry = () => ({
    metrics: {
      level: 'detailed',
      readers: [{ pull: { exporter: { prometheus: { host: '0.0.0.0', port: 8888 } } } }],
    },
  });
  const queue = () => ({
    enabled: true,
    storage: 'file_storage/queue',
    sizer: 'bytes',
    queue_size: 16777216,
    num_consumers: 2,
    block_on_overflow: false,
  });
  const collector = {
    extensions: {
      health_check: { endpoint: '0.0.0.0:13133' },
      'file_storage/queue': storage('/var/lib/otelcol/queue'),
    },
    receivers: {
      otlp: { protocols: { http: { endpoint: '0.0.0.0:4318', max_request_body_size: 1048576 } } },
    },
    processors: {
      memory_limiter: { check_interval: '1s', limit_mib: 384, spike_limit_mib: 64 },
      'filter/dev': filter(),
      'transform/redact': redaction,
      batch: { timeout: '1s', send_batch_size: 128, send_batch_max_size: 256 },
    },
    exporters: {
      otlp: {
        endpoint: 'gateway:4317',
        tls: { insecure: true },
        timeout: '10s',
        sending_queue: queue(),
        retry_on_failure: {
          enabled: true,
          initial_interval: '1s',
          max_interval: '5s',
          max_elapsed_time: '30s',
        },
      },
      prometheus: {
        endpoint: '0.0.0.0:8889',
        resource_to_telemetry_conversion: { enabled: false },
        metric_expiration: '2m',
      },
    },
    service: {
      extensions: ['health_check', 'file_storage/queue'],
      telemetry: telemetry(),
      pipelines: {
        logs: {
          receivers: ['otlp'],
          processors: ['memory_limiter', 'filter/dev', 'transform/redact', 'batch'],
          exporters: ['otlp'],
        },
        traces: {
          receivers: ['otlp'],
          processors: ['memory_limiter', 'filter/dev', 'batch'],
          exporters: ['otlp'],
        },
        metrics: {
          receivers: ['otlp'],
          processors: ['memory_limiter', 'filter/dev', 'batch'],
          exporters: ['prometheus'],
        },
      },
    },
  };
  const gateway = {
    extensions: {
      health_check: { endpoint: '0.0.0.0:13133' },
      'file_storage/queue': storage('/var/lib/elastic-agent/queue'),
    },
    receivers: {
      otlp: { protocols: { grpc: { endpoint: '0.0.0.0:4317', max_recv_msg_size_mib: 1 } } },
    },
    connectors: { elasticapm: {} },
    processors: {
      memory_limiter: { check_interval: '1s', limit_mib: 768, spike_limit_mib: 128 },
      'filter/dev': filter(),
      'resource/stream': {
        attributes: [{ key: 'data_stream.namespace', value: 'dev', action: 'upsert' }],
      },
      elasticapm: {},
      batch: { timeout: '1s', send_batch_size: 128, send_batch_max_size: 256 },
    },
    exporters: {
      'elasticsearch/otel': {
        endpoints: ['http://elasticsearch:9200'],
        mapping: { mode: 'otel' },
        timeout: '10s',
        sending_queue: queue(),
        retry: { enabled: true, max_retries: 2, initial_interval: '1s', max_interval: '5s' },
      },
    },
    service: {
      extensions: ['health_check', 'file_storage/queue'],
      telemetry: telemetry(),
      pipelines: {
        logs: {
          receivers: ['otlp'],
          processors: ['memory_limiter', 'filter/dev', 'resource/stream', 'batch'],
          exporters: ['elasticapm', 'elasticsearch/otel'],
        },
        traces: {
          receivers: ['otlp'],
          processors: ['memory_limiter', 'filter/dev', 'resource/stream', 'batch', 'elasticapm'],
          exporters: ['elasticapm', 'elasticsearch/otel'],
        },
        'metrics/apm': {
          receivers: ['elasticapm'],
          processors: ['memory_limiter', 'resource/stream'],
          exporters: ['elasticsearch/otel'],
        },
      },
    },
  };
  return {
    collector,
    gateway,
    elasticsearch: {
      'cluster.name': 'puni-dev-observability',
      'network.host': '0.0.0.0',
      'discovery.type': 'single-node',
      'xpack.security.enabled': false,
      'xpack.security.enrollment.enabled': false,
    },
    kibana: {
      'server.host': '0.0.0.0',
      'server.name': 'puni-dev-observability',
      'elasticsearch.hosts': ['http://elasticsearch:9200'],
      'telemetry.enabled': false,
    },
    prometheus: {
      global: {
        scrape_interval: '30s',
        scrape_timeout: '10s',
        evaluation_interval: '30s',
        external_labels: { environment: 'dev' },
      },
      rule_files: ['/etc/puni/rules.yaml'],
      alerting: {
        alertmanagers: [{ static_configs: [{ targets: ['alertmanager:9093'] }], timeout: '10s' }],
      },
      scrape_configs: [
        {
          job_name: 'dev-collector',
          static_configs: [{ targets: ['collector:8888', 'gateway:8888'] }],
        },
        { job_name: 'dev-probe', static_configs: [{ targets: ['collector:8889'] }] },
        { job_name: 'prometheus', static_configs: [{ targets: ['localhost:9090'] }] },
      ],
    },
    alertmanager: {
      global: { resolve_timeout: '1m' },
      route: {
        receiver: 'local-only',
        group_by: ['alertname', 'environment', 'service'],
        group_wait: '1s',
        group_interval: '30s',
        repeat_interval: '4h',
      },
      receivers: [{ name: 'local-only' }],
    },
  };
}
export type DevConfiguration = ReturnType<typeof createDevConfiguration>;

/** Refuses unsafe renderer changes before serializing inputs; binary validation remains separate. */
export function assertDevConfiguration(configuration: DevConfiguration): void {
  const collector = configuration.collector.exporters.otlp;
  const gateway = configuration.gateway.exporters['elasticsearch/otel'];
  for (const exporter of [collector, gateway]) {
    // Proof: removing this throw independently failed disabled collector and gateway renderer negatives.
    if (!Object.is(exporter.sending_queue.enabled, true))
      throw new Error('enabled persistent queue required');
    // Proof: removing this throw failed the independent missing-persistent-storage negative.
    if (exporter.sending_queue.storage !== 'file_storage/queue')
      throw new Error('persistent queue storage required');
    // Proof: removing this throw failed all zero/Infinity/NaN queue negatives.
    if (
      !Number.isFinite(exporter.sending_queue.queue_size) ||
      exporter.sending_queue.queue_size <= 0 ||
      exporter.sending_queue.queue_size > 16777216
    )
      throw new Error('finite bounded queue required');
    // Proof: removing this throw failed zero/infinite/empty deadline negatives.
    if (!/^[1-9][0-9]?s$/.test(exporter.timeout))
      throw new Error('finite request deadline required');
  }
  // Proof: removing this throw failed both collector and gateway indefinite-retry negatives.
  if (
    !/^[1-9][0-9]?s$/.test(collector.retry_on_failure.max_elapsed_time) ||
    !Number.isSafeInteger(gateway.retry.max_retries) ||
    gateway.retry.max_retries < 1 ||
    gateway.retry.max_retries > 3
  )
    throw new Error('finite retry required');
  // Proof: removing this throw failed trace-enrichment removal with the connector retained.
  if (!configuration.gateway.service.pipelines.traces.processors.includes('elasticapm'))
    throw new Error('trace enrichment required');
  // Proof: removing this throw failed connector removal with trace enrichment retained.
  if (
    !configuration.gateway.service.pipelines.traces.exporters.includes('elasticapm') ||
    configuration.gateway.service.pipelines['metrics/apm'].receivers.join() !== 'elasticapm'
  )
    throw new Error('APM connector required');
  for (const pipeline of [configuration.collector, configuration.gateway]) {
    const predicates = pipeline.processors['filter/dev'];
    for (const stream of Object.values(pipeline.service.pipelines)) {
      // Proof: removing this throw failed the admission-processor bypass negative.
      if (stream.receivers.includes('otlp') && !stream.processors.includes('filter/dev'))
        throw new Error('dev admission processor must remain in each input pipeline');
    }
    // Proof: removing this throw failed the changed dev-admission predicate negative.
    if (
      [predicates.logs.log_record, predicates.traces.span, predicates.metrics.datapoint].some(
        (conditions) => conditions.join() !== admission,
      )
    )
      throw new Error('dev admission must reject unknown or production environment');
  }
  // Proof: removing this throw failed the external webhook-recipient negative.
  if (
    configuration.alertmanager.receivers.length !== 1 ||
    Object.keys(configuration.alertmanager.receivers[0]).join() !== 'name' ||
    configuration.alertmanager.route.receiver !== configuration.alertmanager.receivers[0].name
  )
    throw new Error('external recipient refused');
}

/** Only the two fixed new project queue volumes may be initialized; no host mount is accepted. */
export function renderQueueInitialization(
  role: 'collector' | 'gateway',
  volume: string,
  mount: string,
): string[] {
  // Proof: removing this throw failed foreign-volume, host-directory and foreign-mount negatives.
  if (volume !== `puni-dev-observability_${role}` || mount !== '/queue')
    throw new Error('initializer requires exact dev-owned queue volume and mount');
  const owner = role === 'collector' ? '10001:10001' : '1000:1000';
  return [
    'docker',
    'run',
    '--rm',
    '--network',
    'none',
    '--user',
    '0:0',
    '--mount',
    `type=volume,source=${volume},target=/queue`,
    '--entrypoint',
    '/bin/sh',
    renderDevCompose().services['gateway'].image,
    '-ec',
    'chown "$1" /queue',
    'queue-init',
    owner,
  ];
}

/** Emits deployable inputs; retention setup must run before ingestion, then be queried on actual streams. */
export function renderDevConfiguration(
  configuration: DevConfiguration = createDevConfiguration(),
): Record<string, string> {
  assertDevConfiguration(configuration);
  const files: Record<string, string> = {};
  for (const [name, settings] of Object.entries(configuration))
    files[`${name}.yaml`] = stringify(settings);
  files['rules.yaml'] = readFileSync(new URL('./rules.yaml', import.meta.url), 'utf8');
  files['rollback.json'] = JSON.stringify({
    environment: 'dev',
    host: 'h3mon',
    project: 'puni-dev-observability',
    preserveVolumes: true,
  });
  files['health.mjs'] = readFileSync(new URL('./health.mjs', import.meta.url), 'utf8');
  files['retention.sh'] = readFileSync(new URL('./retention.sh', import.meta.url), 'utf8');
  return files;
}
