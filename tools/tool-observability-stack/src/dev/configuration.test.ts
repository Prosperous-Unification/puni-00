import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  assertDevConfiguration,
  createDevConfiguration,
  renderDevConfiguration,
  renderQueueInitialization,
} from './configuration';
import { renderDevCompose } from './deployment';

describe('dev configuration', () => {
  it('renders executable inputs without replacing shared services', () => {
    const configuration = createDevConfiguration();
    expect(() => {
      assertDevConfiguration(configuration);
    }).not.toThrow();
    const files = renderDevConfiguration(configuration);
    expect(Object.keys(files)).toContain('rules.yaml');
    expect(Object.keys(files)).toContain('retention.sh');
    expect(files['collector.yaml']).toContain('AGE-SECRET-KEY-1');
    const compose = renderDevCompose();
    expect(Object.keys(compose.services)).toHaveLength(6);
    expect(Object.keys(compose.services)).not.toContain('grafana');
    expect(compose.services['gateway'].entrypoint).toEqual([
      '/usr/share/elastic-agent/elastic-agent',
    ]);
    expect(compose.services['gateway'].command).toEqual([
      'otel',
      '--config=/etc/puni/gateway.yaml',
    ]);
    expect(compose.services['prometheus'].command).toContain('--storage.tsdb.retention.size=1GB');
    expect(compose.services['collector'].volumes).toContain(
      './collector.yaml:/etc/puni/collector.yaml:ro',
    );
  });
  it('refuses absent platform redaction policy rather than silently replacing it', () => {
    expect(() => createDevConfiguration('/does-not-exist/platform-agent.yaml')).toThrow(/ENOENT/);
  });
  it('refuses missing persistent queue independently of finite queue capacity', () => {
    const configuration = createDevConfiguration();
    configuration.collector.exporters.otlp.sending_queue.storage = '';
    expect(() => {
      assertDevConfiguration(configuration);
    }).toThrow(/persistent/);
  });
  it.each([0, Infinity, NaN])('refuses unbounded queue %s', (queueSize) => {
    const configuration = createDevConfiguration();
    configuration.collector.exporters.otlp.sending_queue.queue_size = queueSize;
    expect(() => {
      assertDevConfiguration(configuration);
    }).toThrow(/queue/);
  });
  it.each(['0s', 'infinite', ''])('refuses unbounded request deadline %s', (timeout) => {
    const configuration = createDevConfiguration();
    configuration.collector.exporters.otlp.timeout = timeout;
    expect(() => {
      assertDevConfiguration(configuration);
    }).toThrow(/deadline/);
  });
  it('refuses indefinite collector retry', () => {
    const configuration = createDevConfiguration();
    configuration.collector.exporters.otlp.retry_on_failure.max_elapsed_time = '0s';
    expect(() => {
      assertDevConfiguration(configuration);
    }).toThrow(/retry/);
  });
  it('refuses indefinite gateway retry', () => {
    const configuration = createDevConfiguration();
    configuration.gateway.exporters['elasticsearch/otel'].retry.max_retries = Infinity;
    expect(() => {
      assertDevConfiguration(configuration);
    }).toThrow(/retry/);
  });
  it('refuses trace enrichment removal independently from connector', () => {
    const configuration = createDevConfiguration();
    configuration.gateway.service.pipelines.traces.processors = [
      'memory_limiter',
      'filter/dev',
      'batch',
    ];
    expect(() => {
      assertDevConfiguration(configuration);
    }).toThrow(/enrichment/);
  });
  it('refuses APM aggregate connector removal independently from enrichment', () => {
    const configuration = createDevConfiguration();
    configuration.gateway.service.pipelines.traces.exporters = ['elasticsearch/otel'];
    expect(() => {
      assertDevConfiguration(configuration);
    }).toThrow(/connector/);
  });
  it('refuses accepting unknown or production environment', () => {
    const configuration = createDevConfiguration();
    configuration.collector.processors['filter/dev'].logs.log_record = [];
    expect(() => {
      assertDevConfiguration(configuration);
    }).toThrow(/admission/);
  });
  it('refuses any receiver with an external notification destination', () => {
    const configuration = createDevConfiguration();
    Object.assign(configuration.alertmanager.receivers[0], {
      webhook_configs: [{ url: 'https://example.invalid' }],
    });
    expect(() => {
      assertDevConfiguration(configuration);
    }).toThrow(/recipient/);
  });
  it('initializes only the declared dev-owned queue volume using a pinned image', () => {
    expect(
      renderQueueInitialization('collector', 'puni-dev-observability_collector', '/queue'),
    ).toContain('10001:10001');
    expect(
      renderQueueInitialization('gateway', 'puni-dev-observability_gateway', '/queue'),
    ).toContain('1000:1000');
  });
  it.each([
    ['shared', '/queue'],
    ['puni-dev-observability_gateway', '/host'],
    ['/home/monitor', '/queue'],
  ])('refuses foreign volume or mount %s %s', (volume, mount) => {
    expect(() => renderQueueInitialization('gateway', volume, mount)).toThrow(/dev-owned/);
  });
});

it.each([
  ['malformed Elasticsearch', '{"status":"green"}', 'Elasticsearch health'],
  [
    'degraded Kibana',
    '{"cluster_name":"puni-dev-observability","status":"yellow","timed_out":false}',
    'Kibana health',
  ],
])('refuses %s despite HTTP 200', (_name, elasticsearch, diagnostic) => {
  const files = renderDevConfiguration();
  const kibana = JSON.stringify({ status: { overall: { level: 'degraded' } } });
  const check = Bun.spawnSync([
    'bun',
    '-e',
    `globalThis.fetch = async (url) => new Response(url.includes('elasticsearch') ? ${JSON.stringify(elasticsearch)} : ${JSON.stringify(kibana)}); ${files['health.mjs']}`,
  ]);
  expect(check.exitCode).toBe(1);
  expect(check.stderr.toString()).toContain(diagnostic);
});

it('refuses malformed platform redaction shape at the trusted boundary', () => {
  const directory = mkdtempSync(join(tmpdir(), 'puni-redaction-'));
  try {
    const path = join(directory, 'agent.yaml');
    writeFileSync(path, 'spec: {}');
    expect(() => createDevConfiguration(path)).toThrow(/spec.values must be an object/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
it('refuses bypassing the configured dev admission processor', () => {
  const configuration = createDevConfiguration();
  configuration.collector.service.pipelines.logs.processors = ['memory_limiter', 'batch'];
  expect(() => {
    assertDevConfiguration(configuration);
  }).toThrow(/admission/);
});

it('refuses unsuccessful endpoint status', () => {
  const files = renderDevConfiguration();
  const check = Bun.spawnSync([
    'bun',
    '-e',
    `globalThis.fetch = async () => new Response('', {status: 503}); ${files['health.mjs']}`,
  ]);
  expect(check.exitCode).toBe(1);
  expect(check.stderr.toString()).toContain('health HTTP 503');
});
it('supplies a deadline to every real endpoint request', () => {
  const files = renderDevConfiguration();
  const check = Bun.spawnSync([
    'bun',
    '-e',
    `globalThis.fetch = async (url, options) => {
    if (!(options.signal instanceof AbortSignal)) throw new Error('request deadline missing');
    return new Response(JSON.stringify(url.includes('elasticsearch') ? {cluster_name:'puni-dev-observability',status:'yellow',timed_out:false} : {status:{overall:{level:'available'}}}));
  }; ${files['health.mjs']}`,
  ]);
  expect(check.exitCode).toBe(0);
  expect(check.stdout.toString()).toContain('alertmanager: endpoint ready');
});
