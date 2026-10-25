import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';
import { isNode, parseDocument } from 'yaml';

import { renderDevConfiguration } from '../dev/configuration';
import {
  createSignalConfiguration,
  renderSignalConfiguration,
  type SignalInputs,
  type SignalPolicyPaths,
} from './signals';

function expectDefinition(actual: unknown, expected: unknown): void {
  expect(actual).toEqual(expected);
}

function createInputs(environment = 'dev'): SignalInputs {
  return {
    deployment: { cluster: 'platform-production', namespace: `observability-${environment}` },
    source: {
      environment,
      admittedEnvironments: [environment],
      infrastructureClusters: ['platform-local'],
      filelogExcludes: [`/var/log/pods/observability-${environment}_otel-collector-*/*/*.log`],
    },
    endpoints: {
      collectorHttp: '0.0.0.0:4318',
      collectorPlatformGrpc: '0.0.0.0:14317',
      gatewayGrpc: '0.0.0.0:4317',
      gatewayUpstream: `gateway.observability-${environment}.svc:4317`,
      platformGrpc: '0.0.0.0:14317',
      platformUpstream: `gateway.observability-${environment}.svc:14317`,
      elasticsearch: `https://elasticsearch.observability-${environment}.svc:9200`,
      metricsRemoteWrite: `https://prometheus.observability-${environment}.svc/api/v1/write`,
    },
    trust: {
      collector: {
        certFile: '/etc/otel/server/tls.crt',
        keyFile: '/etc/otel/server/tls.key',
        clientCaFile: '/etc/otel/trust/ca.crt',
      },
      gateway: {
        certFile: '/etc/gateway/server/tls.crt',
        keyFile: '/etc/gateway/server/tls.key',
        clientCaFile: '/etc/gateway/trust/ca.crt',
      },
      upstream: {
        caFile: '/etc/otel/upstream/ca.crt',
        certFile: '/etc/otel/client/tls.crt',
        keyFile: '/etc/otel/client/tls.key',
        serverName: `gateway.observability-${environment}.svc`,
      },
      elasticsearch: {
        caFile: '/etc/elastic/ca.crt',
        username: 'ingest',
        passwordEnv: 'ELASTIC_INGEST_PASSWORD',
      },
      metrics: {
        caFile: '/etc/prometheus/ca.crt',
        username: 'writer',
        passwordFile: '/etc/prometheus/password',
      },
    },
    capacity: {
      queueBytes: 16777216,
      collectorMemoryMiB: 384,
      collectorSpikeMiB: 64,
      gatewayMemoryMiB: 768,
      gatewaySpikeMiB: 128,
    },
    retention: {
      logs: '7d',
      traces: '7d',
      aggregates: '1d',
      rolloverAge: '1d',
      rolloverSize: '1gb',
      replicas: 0,
      metricsTime: '7d',
      metricsSize: '1GB',
    },
  };
}

it('legacy dev rendering preserves validated behavior', () => {
  const files = renderDevConfiguration();
  const names = [
    'collector.yaml',
    'gateway.yaml',
    'elasticsearch.yaml',
    'kibana.yaml',
    'prometheus.yaml',
    'alertmanager.yaml',
  ];
  const settings = Object.fromEntries(
    Object.entries(files).filter(([name]) => names.includes(name)),
  );
  expect(createHash('sha256').update(JSON.stringify(settings)).digest('hex')).toBe(
    'c19542eb466fbe7d7115450d1f383abd1723440949921c09adf8b5b1f7555390',
  );
});

it.each(['local', 'dev', 'production'])(
  'all environments include APM enrichment and aggregation: %s',
  (environment) => {
    const inputs = createInputs(environment);
    const configuration = createSignalConfiguration(inputs);
    expect(configuration.gateway.service.pipelines.traces.processors).toContain('elasticapm');
    expect(configuration.gateway.service.pipelines.traces.exporters).toContain('elasticapm');
    expect(configuration.gateway.service.pipelines['metrics/apm'].receivers).toEqual([
      'elasticapm',
    ]);
    expect(configuration.gateway.connectors).toHaveProperty('elasticapm');
    expect(renderSignalConfiguration(inputs, configuration)['collector.yaml']).toContain(
      'client_ca_file_reload: true',
    );
    expect(configuration.retention.prometheus).toEqual([
      '--storage.tsdb.retention.time=7d',
      '--storage.tsdb.retention.size=1GB',
    ]);
  },
);

it('producer environment is not deployment target identity', () => {
  const inputs = createInputs();
  const configuration = createSignalConfiguration(inputs);
  expect(configuration.collector.processors['filter/source'].logs.log_record[0]).toContain('"dev"');
  expect(JSON.stringify(configuration.collector)).not.toContain('platform-production');
  expect(JSON.stringify(configuration)).not.toContain('deployment.environment.name",');
  expect(configuration.gateway.processors['resource/stream'].attributes).toEqual([
    { key: 'data_stream.namespace', value: 'dev', action: 'upsert' },
  ]);
});

it('existing failure fields and infrastructure metrics remain routed', () => {
  const configuration = createSignalConfiguration(createInputs());
  const readDefinition = (path: string, symbols: string[]): unknown => {
    const definition = parseDocument(readFileSync(new URL(path, import.meta.url), 'utf8')).getIn(
      symbols,
    );
    if (!isNode(definition)) throw new Error('expected YAML definition');
    const value: unknown = definition.toJSON();
    return value;
  };
  expectDefinition(
    {
      ...configuration.collector.receivers.filelog,
      exclude: configuration.collector.receivers.filelog.exclude.filter(
        (path) => !path.includes('observability-dev'),
      ),
    },
    readDefinition('../../../../infra/platform/observability/otel/collector.yaml', [
      'spec',
      'values',
      'alternateConfig',
      'receivers',
      'filelog',
    ]),
  );
  expectDefinition(
    configuration.collector.receivers.hostmetrics,
    readDefinition('../../../../infra/platform/telemetry/agent/agent.yaml', [
      'spec',
      'values',
      'alternateConfig',
      'receivers',
      'hostmetrics',
    ]),
  );
  expectDefinition(
    configuration.collector.processors['transform/redact'],
    readDefinition('../../../../infra/platform/observability/otel/collector.yaml', [
      'spec',
      'values',
      'alternateConfig',
      'processors',
      'transform/redact',
    ]),
  );
  expect(configuration.collector.service.pipelines['logs/platform'].receivers).toEqual(['filelog']);
  expect(configuration.collector.service.pipelines['logs/platform'].processors).toContain(
    'transform/redact',
  );
  expect(configuration.collector.service.pipelines['metrics/platform'].receivers).toEqual([
    'hostmetrics',
  ]);
  expect(configuration.collector.service.pipelines['metrics/platform'].exporters).toEqual([
    'prometheusremotewrite',
  ]);
  expect(
    configuration.collector.exporters.prometheus.resource_to_telemetry_conversion.enabled,
  ).toBe(false);
  expect(
    configuration.collector.exporters.prometheusremotewrite.resource_to_telemetry_conversion
      .enabled,
  ).toBe(true);
  const failureFields: unknown = JSON.parse(
    readFileSync(
      new URL(
        '../../../../infra/platform/observability/elastic/settings/failure-fields.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  expectDefinition(configuration.failureFields, failureFields);
});

it.each(['collector', 'gateway'] as const)('render refuses missing %s trace pipeline', (role) => {
  const inputs = createInputs();
  const configuration = createSignalConfiguration(inputs);
  Reflect.deleteProperty(configuration[role].service.pipelines, 'traces');
  expect(() => renderSignalConfiguration(inputs, configuration)).toThrow(/trace pipeline/);
});
it('render refuses removed APM connector independently of trace enrichment', () => {
  const inputs = createInputs();
  const configuration = createSignalConfiguration(inputs);
  Reflect.deleteProperty(configuration.gateway.connectors, 'elasticapm');
  expect(() => renderSignalConfiguration(inputs, configuration)).toThrow(/APM connector/);
});
it('render refuses removed trace enrichment', () => {
  const inputs = createInputs();
  const configuration = createSignalConfiguration(inputs);
  configuration.gateway.service.pipelines.traces.processors =
    configuration.gateway.service.pipelines.traces.processors.filter(
      (processor) => processor !== 'elasticapm',
    );
  expect(() => renderSignalConfiguration(inputs, configuration)).toThrow(/enrichment/);
});
it('render refuses foreign source environment and attempted admission rewrite', () => {
  const inputs = createInputs();
  expect(() =>
    renderSignalConfiguration({
      ...inputs,
      source: { ...inputs.source, environment: 'production' },
    }),
  ).toThrow(/source environment/);
  const configuration = createSignalConfiguration(inputs);
  configuration.collector.processors['filter/source'].logs.log_record = ['false'];
  expect(() => renderSignalConfiguration(inputs, configuration)).toThrow(/admission/);
});
it('render refuses bypassed admission and source relabelling', () => {
  const inputs = createInputs();
  const configuration = createSignalConfiguration(inputs);
  configuration.collector.service.pipelines.logs.processors = ['memory_limiter', 'batch'];
  expect(() => renderSignalConfiguration(inputs, configuration)).toThrow(/admission/);
  const relabelled = createSignalConfiguration(inputs);
  relabelled.gateway.processors['resource/stream'].attributes.push({
    key: 'deployment.environment.name',
    value: 'dev',
    action: 'upsert',
  });
  expect(() => renderSignalConfiguration(inputs, relabelled)).toThrow(/source identity/);
});
it('render refuses removed redaction policy or processor', () => {
  const inputs = createInputs();
  const configuration = createSignalConfiguration(inputs);
  configuration.collector.processors['transform/redact'].log_statements = [];
  expect(() => renderSignalConfiguration(inputs, configuration)).toThrow(/redaction/);
  const bypassed = createSignalConfiguration(inputs);
  bypassed.collector.service.pipelines.logs.processors = [
    'memory_limiter',
    'filter/source',
    'batch',
  ];
  expect(() => renderSignalConfiguration(inputs, bypassed)).toThrow(/redaction/);
});
it('render refuses broken required trust inputs and rendered TLS downgrade', () => {
  const inputs = createInputs();
  inputs.trust.upstream.caFile = '';
  expect(() => renderSignalConfiguration(inputs)).toThrow(/trust/);
  const valid = createInputs();
  const configuration = createSignalConfiguration(valid);
  configuration.collector.exporters.otlp.tls.ca_file = '';
  expect(() => renderSignalConfiguration(valid, configuration)).toThrow(/trust/);
});
it('render refuses changed platform routing, retention and bounded recovery', () => {
  const inputs = createInputs();
  const configuration = createSignalConfiguration(inputs);
  configuration.collector.service.pipelines['metrics/platform'].exporters = ['prometheus'];
  expect(() => renderSignalConfiguration(inputs, configuration)).toThrow(/platform/);
  const retention = createSignalConfiguration(inputs);
  retention.retention.prometheus = [];
  expect(() => renderSignalConfiguration(inputs, retention)).toThrow(/retention/);
  const queue = createSignalConfiguration(inputs);
  queue.collector.exporters.otlp.sending_queue.enabled = false;
  expect(() => renderSignalConfiguration(inputs, queue)).toThrow(/persistent queue/);
});
it('platform logs reach a separate cluster-admitted gateway path without application relabelling', () => {
  const inputs = createInputs();
  const configuration = createSignalConfiguration(inputs);
  expect(configuration.collector.service.pipelines['logs/platform'].exporters).toEqual([
    'otlp/platform',
  ]);
  expect(configuration.gateway.service.pipelines['logs/platform'].receivers).toEqual([
    'otlp/platform',
  ]);
  expect(configuration.gateway.processors['filter/platform'].logs.log_record[0]).toContain(
    'puni.cluster',
  );
  expect(configuration.gateway.processors['filter/platform'].logs.log_record[0]).toContain(
    'deployment.environment.name',
  );
  expect(configuration.gateway.processors['resource/stream/platform'].attributes).toEqual([
    { key: 'data_stream.namespace', from_attribute: 'puni.cluster', action: 'upsert' },
  ]);
});
it('render refuses changed deadlines, retries, metric contracts and exporter credentials', () => {
  const inputs = createInputs();
  const retry = createSignalConfiguration(inputs);
  retry.collector.exporters.otlp.retry_on_failure.max_elapsed_time = '0s';
  expect(() => renderSignalConfiguration(inputs, retry)).toThrow(/recovery/);
  const metrics = createSignalConfiguration(inputs);
  metrics.collector.exporters.prometheus.resource_to_telemetry_conversion.enabled = true;
  expect(() => renderSignalConfiguration(inputs, metrics)).toThrow(/metrics/);
  const password = createSignalConfiguration(inputs);
  password.gateway.exporters['elasticsearch/otel'].password = '';
  expect(() => renderSignalConfiguration(inputs, password)).toThrow(/trust/);
});

it('metrics authentication uses a referenced mounted secret and platform stream uses the measured cluster', () => {
  const configuration = createSignalConfiguration(createInputs());
  expect(configuration.collector.extensions['basicauth/metrics'].client_auth).toEqual({
    username: 'writer',
    password_file: '/etc/prometheus/password',
  });
  expect(configuration.gateway.service.pipelines['logs/platform'].processors).toContain(
    'resource/stream/platform',
  );
});

function createPolicyPaths(): SignalPolicyPaths {
  return {
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
}
it.each(['agent', 'collector', 'failureFields'] as const)(
  'refuses absent, unreadable and malformed trusted %s definitions',
  (policy) => {
    const directory = mkdtempSync(join(tmpdir(), 'puni-signal-policy-'));
    const path = join(directory, 'policy');
    const paths = { ...createPolicyPaths(), [policy]: path };
    try {
      expect(() => createSignalConfiguration(createInputs(), paths)).toThrow(/ENOENT/);
      writeFileSync(path, readFileSync(createPolicyPaths()[policy]));
      chmodSync(path, 0);
      expect(() => createSignalConfiguration(createInputs(), paths)).toThrow(/EACCES/);
      chmodSync(path, 0o600);
      const text = readFileSync(path, 'utf8');
      const malformed =
        policy === 'collector'
          ? text.replace('include_file_path: true', 'include_file_path: falsehood')
          : policy === 'agent'
            ? text.replace('collection_interval: 30s', 'collection_interval: 30')
            : text.replace('"keyword"', '7');
      writeFileSync(path, malformed);
      expect(() => createSignalConfiguration(createInputs(), paths)).toThrow(
        policy === 'collector'
          ? /include_file_path/
          : policy === 'agent'
            ? /collection_interval/
            : /attributes.level/,
      );
    } finally {
      chmodSync(path, 0o600);
      rmSync(directory, { recursive: true });
    }
  },
);

it('forwarded platform telemetry retains cluster identity and remote-write routing', () => {
  const configuration = createSignalConfiguration(createInputs());
  expect(configuration.collector.receivers['otlp/platform'].protocols.grpc.endpoint).toBe(
    '0.0.0.0:14317',
  );
  expect(configuration.collector.service.pipelines['logs/forwarded'].receivers).toEqual([
    'otlp/platform',
  ]);
  expect(configuration.collector.service.pipelines['metrics/forwarded'].exporters).toEqual([
    'prometheusremotewrite',
  ]);
  expect(configuration.collector.service.pipelines['metrics/forwarded'].processors).not.toContain(
    'resource/cluster',
  );
  expect(configuration.collector.processors['filter/platform'].metrics.datapoint[0]).toContain(
    'puni.cluster',
  );
  expect(configuration.collector.receivers.filelog.exclude).toContain(
    '/var/log/pods/observability-dev_otel-collector-*/*/*.log',
  );
});
it('render refuses foreign platform admission and missing credential environment names', () => {
  const inputs = createInputs();
  const configuration = createSignalConfiguration(inputs);
  configuration.collector.processors['filter/platform'].metrics.datapoint = ['false'];
  expect(() => renderSignalConfiguration(inputs, configuration)).toThrow(/platform/);
  inputs.trust.elasticsearch.passwordEnv = '';
  expect(() => renderSignalConfiguration(inputs)).toThrow(/trust/);
});
it('render refuses absent queue registration and signal pipelines', () => {
  const inputs = createInputs();
  const storage = createSignalConfiguration(inputs);
  Reflect.deleteProperty(storage.collector.extensions, 'file_storage/queue');
  expect(() => renderSignalConfiguration(inputs, storage)).toThrow(/persistent queue/);
  const metrics = createSignalConfiguration(inputs);
  Reflect.deleteProperty(metrics.collector.service.pipelines, 'metrics');
  expect(() => renderSignalConfiguration(inputs, metrics)).toThrow(/signal pipelines/);
});
