import { readFileSync } from 'node:fs';

import { type } from 'arktype';
import { parse } from 'yaml';

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
/** Transitional dev admission remains exact for the compatibility renderer and its validator. */
export const legacyAdmission =
  'resource.attributes["deployment.environment.name"] != "dev" or resource.attributes["service.name"] == nil or resource.attributes["service.name"] == ""';

/** Reuses the platform credential-shape policy; absent/malformed trusted policy throws. */
export function createLegacyConfiguration(
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
    logs: { log_record: [legacyAdmission] },
    traces: { span: [legacyAdmission] },
    metrics: { datapoint: [legacyAdmission] },
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
        {
          // Proof: reverting to 30s fails the next-assessment capture timing test.
          job_name: 'dev-probe',
          scrape_interval: '5s',
          scrape_timeout: '3s',
          static_configs: [{ targets: ['collector:8889'] }],
        },
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
