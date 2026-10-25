import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, it } from 'bun:test';
import { parse, parseDocument } from 'yaml';

import { renderObservability } from './observability';
import { validatePlatform } from './platform';

const root = join(import.meta.dir, '../../..');
it('rendered overlays retain common signal behavior', async () => {
  const files = await renderObservability(root);
  for (const environment of ['local', 'production']) {
    const collector = type({
      receivers: 'object',
      service: { pipelines: { traces: { exporters: 'string[]' } } },
    }).assert(parse(files[`observability/${environment}/collector.yaml`]));
    const gateway = type({ service: { pipelines: { traces: { exporters: 'string[]' } } } }).assert(
      parse(files[`observability/${environment}/gateway.yaml`]),
    );
    expect(files[`observability/${environment}/collector.yaml`]).toContain(
      environment === 'production' ? '"prod"' : '"dev"',
    );
    expect(collector.service.pipelines.traces.exporters).toEqual(['otlp']);
    expect(gateway.service.pipelines.traces.exporters).toEqual([
      'elasticapm',
      'elasticsearch/otel',
    ]);
    expect(collector.receivers).not.toHaveProperty('filelog');
    expect(collector.receivers).not.toHaveProperty('hostmetrics');
    expect(files[`observability/${environment}/retention.json`]).toContain('traces-otel@custom');
    expect(files[`observability/${environment}/retention.json`]).toContain('metrics-otel@custom');
  }
});

async function copyPlatform() {
  const directory = await scratchAsync('observability-parity-');
  await cp(join(root, 'infra'), join(directory, 'infra'), { recursive: true });
  await mkdir(join(directory, 'tools/tool-fleet/src'), { recursive: true });
  await cp(
    join(root, 'tools/tool-fleet/src/backup-sqlite.ts'),
    join(directory, 'tools/tool-fleet/src/backup-sqlite.ts'),
  );
  return directory;
}

it.each([
  ['gateway', 'observability/base/signals.yaml', 'name: signal-gateway', 'name: missing-gateway'],
  [
    'routing',
    'observability/production/collector.yaml',
    'exporters:\n        - otlp',
    'exporters: []',
  ],
  ['retention', 'observability/production/retention.json', 'traces-otel@custom', 'missing-traces'],
  [
    'unlocked image',
    'observability/base/signals.yaml',
    'elastic-agent:9.3.8@sha256:',
    'elastic-agent:9.3.9@sha256:',
  ],
  [
    'write authentication',
    'observability/base/metrics.yaml',
    'usersFile: /auth/write/users',
    'usersFile: /auth/query/users',
  ],
])('production path rejects removed %s', async (_fault, path, before, after) => {
  const directory = await copyPlatform();
  const absolute = join(directory, 'infra/platform', path);
  const source = await readFile(absolute, 'utf8');
  expect(source).toContain(before);
  await writeFile(absolute, source.replace(before, after));
  expect(validatePlatform(directory)).rejects.toThrow(/observability|toolchain lock/);
});

it.each([
  ['missing gateway lock', 'infra/versions/toolchain.json', '"elasticGateway"', '"missingGateway"'],
  [
    'missing service graph',
    'infra/platform/observability/base/kustomization.yaml',
    '  - signals.yaml\n',
    '',
  ],
  [
    'missing Flux prerequisite',
    'infra/clusters/platform/production/observability.yaml',
    '    - name: certificates\n',
    '',
  ],
  [
    'wrong local storage exception',
    'infra/platform/observability/local/kustomization.yaml',
    'value: "10Gi"',
    'value: "9Gi"',
  ],
  [
    'raw metrics bypass',
    'infra/platform/observability/base/metrics.yaml',
    'name: prometheus-private',
    'name: missing-private-policy',
  ],
])('production path still refuses %s', async (_fault, path, before, after) => {
  const directory = await copyPlatform();
  const absolute = join(directory, path);
  const source = await readFile(absolute, 'utf8');
  expect(source).toContain(before);
  await writeFile(absolute, source.replace(before, after));
  expect(validatePlatform(directory)).rejects.toThrow(
    /observability|Toolchain|dependency order|patches differ/,
  );
});

it('coexistence budget includes gateway and preserved Docker services', async () => {
  const files = await renderObservability(root);
  const budget: unknown = JSON.parse(files['observability/base/coexistence.json']);
  expect(budget).toMatchObject({
    preservedDockerMiB: { mlflow: 512, grafana: 384, victoriaMetrics: 256 },
    applicationMiB: { collector: 512, gateway: 1024, metricsProxy: 128 },
    overlap: { admitted: false },
  });
});

it('production path rejects omitted coexistence usage', async () => {
  const directory = await copyPlatform();
  const path = join(directory, 'infra/platform/observability/base/coexistence.json');
  await writeFile(path, '{}');
  expect(validatePlatform(directory)).rejects.toThrow(/coexistence/);
});

it('production path rejects malformed memory quantities', async () => {
  const directory = await copyPlatform();
  const path = join(directory, 'infra/platform/observability/otel/collector.yaml');
  const source = await readFile(path, 'utf8');
  await writeFile(path, source.replace('memory: 128Mi', 'memory: unknown'));
  expect(validatePlatform(directory)).rejects.toThrow(/memory request must be explicit/);
});

it.each(['absent', 'unreadable'])(
  'production path refuses %s generated retention',
  async (fault) => {
    const directory = await copyPlatform();
    const path = join(directory, 'infra/platform/observability/production/traces-policy.json');
    if (fault === 'absent') await rm(path);
    else await chmod(path, 0);
    try {
      expect(validatePlatform(directory)).rejects.toThrow(fault === 'absent' ? /ENOENT/ : /EACCES/);
    } finally {
      if (fault === 'unreadable') await chmod(path, 0o600);
    }
  },
);

it('production path requires gateway lock presence', async () => {
  const directory = await copyPlatform();
  const path = join(directory, 'infra/versions/toolchain.json');
  const decoded = type({ runtimeImages: 'object' }).assert(
    JSON.parse(await readFile(path, 'utf8')),
  );
  Reflect.deleteProperty(decoded.runtimeImages, 'elasticGateway');
  await writeFile(path, JSON.stringify(decoded));
  expect(validatePlatform(directory)).rejects.toThrow(
    /Toolchain validation failed: runtimeImages.elasticGateway/,
  );
});

it('production path refuses an absent image role', async () => {
  const directory = await copyPlatform();
  const path = join(directory, 'infra/versions/toolchain.json');
  const source = await readFile(path, 'utf8');
  expect(source).toContain('"role": "collector"');
  await writeFile(path, source.replace('"role": "collector"', '"role": "missing"'));
  expect(validatePlatform(directory)).rejects.toThrow(
    /opentelemetryCollector image roles must be exactly: collector/,
  );
});

it.each(['logs', 'metrics'] as const)(
  'production platform %s refuses changed application exclusion',
  async (signal) => {
    const directory = await copyPlatform();
    const path = join(directory, 'infra/platform/observability/otel/collector.yaml');
    const document = parseDocument(await readFile(path, 'utf8'));
    document.setIn(['spec', 'values', 'alternateConfig', 'processors', 'filter/platform-only'], {
      error_mode: 'propagate',
      logs: {
        log_record:
          signal === 'logs' ? [] : ['resource.attributes["deployment.environment.name"] != nil'],
      },
      metrics: {
        datapoint:
          signal === 'metrics' ? [] : ['resource.attributes["deployment.environment.name"] != nil'],
      },
    });
    await writeFile(path, document.toString());
    expect(validatePlatform(directory)).rejects.toThrow(/platform-only/);
  },
);
it.each(['logs', 'metrics'] as const)(
  'production platform %s refuses bypassed application exclusion',
  async (signal) => {
    const directory = await copyPlatform();
    const path = join(directory, 'infra/platform/observability/otel/collector.yaml');
    const document = parseDocument(await readFile(path, 'utf8'));
    const location = [
      'spec',
      'values',
      'alternateConfig',
      'service',
      'pipelines',
      signal,
      'processors',
    ];
    const decoded = type({
      spec: {
        values: {
          alternateConfig: {
            service: {
              pipelines: { logs: { processors: 'string[]' }, metrics: { processors: 'string[]' } },
            },
          },
        },
      },
    }).assert(document.toJS());
    const processors = decoded.spec.values.alternateConfig.service.pipelines[signal].processors;
    document.setIn(
      location,
      processors.filter((processor) => processor !== 'filter/platform-only'),
    );
    await writeFile(path, document.toString());
    expect(validatePlatform(directory)).rejects.toThrow(/platform-only/);
  },
);

it('production path rejects a removed retention Job', async () => {
  const directory = await copyPlatform();
  await writeFile(
    join(directory, 'infra/platform/observability/elastic/settings/settings.yaml'),
    'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: removed-retention\n  namespace: observability\n',
  );
  expect(validatePlatform(directory)).rejects.toThrow(/observability generated artifact differs/);
});
it.each([
  ['retention: 15d', 'retention: 1d'],
  ['retentionSize: 8GB', 'retentionSize: 1GB'],
])('production path rejects disconnected Prometheus retention %s', async (before, after) => {
  const directory = await copyPlatform();
  const path = join(
    directory,
    'infra/platform/observability/prometheus/kube-prometheus-stack.yaml',
  );
  const source = await readFile(path, 'utf8');
  await writeFile(path, source.replace(before, after));
  expect(validatePlatform(directory)).rejects.toThrow(/shared Prometheus retention/);
});
it('production path requires the metrics write credential declaration', async () => {
  const directory = await copyPlatform();
  const path = join(
    directory,
    'infra/platform/secrets/platform-production/externally-provided.json',
  );
  const declared = type({ namespace: 'string', name: 'string', source: 'string' })
    .array()
    .assert(JSON.parse(await readFile(path, 'utf8')));
  await writeFile(
    path,
    JSON.stringify(declared.filter((secret) => secret.name !== 'signal-metrics-write-auth')),
  );
  expect(validatePlatform(directory)).rejects.toThrow(
    /consumes Secret observability\/signal-metrics-write-auth/,
  );
});

/** Execute the committed Job program; only network and CA material are fixture boundaries. */
async function runRetention(
  reply: string,
  at = 0,
  status = 200,
  password = 'fixture',
  environment = 'production',
) {
  const directory = await scratchAsync('observability-retention-');
  const receipts = join(directory, 'requests.json');
  const preload = join(directory, 'preload.js');
  await writeFile(
    preload,
    `
import { writeFileSync } from 'node:fs';
const requests = [];
const file = Bun.file;
Bun.file = (path, ...options) => path === '/es-ca/ca.crt' ? new Blob(['fixture-ca']) : file(path, ...options);
globalThis.fetch = async (url, options) => {
  requests.push({url: String(url), method: options.method, body: options.body, redirect: options.redirect,
    timeout: options.signal instanceof AbortSignal, ca: options.tls.ca, authorization: options.headers.authorization});
  const response = requests.length === ${String(at + 1)} ? ${JSON.stringify(reply)} :
    requests.length === 1 ? '{"status":"yellow","timed_out":false}' : '{"acknowledged":true}';
  return new Response(response, {status: requests.length === ${String(at + 1)} ? ${String(status)} : 200});
};
process.on('exit', () => writeFileSync(${JSON.stringify(receipts)}, JSON.stringify(requests)));
`,
  );
  const child = Bun.spawn(
    [
      process.execPath,
      '--preload',
      preload,
      join(root, `infra/platform/observability/${environment}/apply.js`),
    ],
    { env: { ...process.env, ELASTIC_PASSWORD: password }, stdout: 'pipe', stderr: 'pipe' },
  );
  const [exitCode, stderr, requests] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    child.exited.then(
      async () =>
        JSON.parse(await readFile(receipts, 'utf8')) as {
          url: string;
          method: string;
          body?: string;
          redirect: string;
          timeout: boolean;
          ca: string;
          authorization: string;
        }[],
    ),
  ]);
  return { exitCode, stderr, requests };
}

it.each(['yellow', 'green'])(
  'retention Job accepts confirmed %s health and all six acknowledgements',
  async (status) => {
    const receipt = await runRetention(JSON.stringify({ status, timed_out: false }));
    expect(receipt.stderr).toBe('');
    expect(receipt.exitCode).toBe(0);
    expect(receipt.requests).toHaveLength(7);
    expect(receipt.requests[0].url).toBe(
      'https://elasticsearch-es-http.observability.svc:9200/_cluster/health?wait_for_status=yellow&timeout=120s&filter_path=status,timed_out',
    );
    expect(receipt.requests[0].method).toBe('GET');
    for (const request of receipt.requests) {
      expect(request.redirect).toBe('error');
      expect(request.timeout).toBe(true);
      expect(request.ca).toBe('fixture-ca');
      expect(request.authorization).toBe(
        `Basic ${Buffer.from('elastic:fixture').toString('base64')}`,
      );
    }
    for (const [index, signal] of ['logs', 'traces', 'metrics'].entries()) {
      for (const [offset, suffix] of ['policy', 'template'].entries()) {
        const request = receipt.requests[1 + index * 2 + offset];
        expect(request.method).toBe('PUT');
        expect(request.body).toBe(
          await readFile(
            join(root, `infra/platform/observability/production/${signal}-${suffix}.json`),
            'utf8',
          ),
        );
        expect(request.url).toContain(offset === 0 ? '/_ilm/policy/' : '/_component_template/');
      }
    }
  },
);

it.each([
  ['health malformed JSON', '{', 0, 200],
  ['health null', 'null', 0, 200],
  ['health array', '[]', 0, 200],
  ['health missing', '{}', 0, 200],
  ['health unknown field', '{"status":"green","timed_out":false,"unexpected":true}', 0, 200],
  ['health red', '{"status":"red","timed_out":false}', 0, 200],
  ['health unknown status', '{"status":"unknown","timed_out":false}', 0, 200],
  ['health timed out', '{"status":"yellow","timed_out":true}', 0, 200],
  ['health wrong boolean', '{"status":"yellow","timed_out":"false"}', 0, 200],
  ['health HTTP failure', '{"status":"green","timed_out":false}', 0, 503],
  ['health HTTP unknown', '{"status":"green","timed_out":false}', 0, 202],
  ...[1, 2].flatMap(
    (at) =>
      [
        [`mutation ${String(at)} false acknowledgement`, '{"acknowledged":false}', at, 200],
        [`mutation ${String(at)} missing acknowledgement`, '{}', at, 200],
        [
          `mutation ${String(at)} unknown field`,
          '{"acknowledged":true,"unexpected":true}',
          at,
          200,
        ],
        [`mutation ${String(at)} wrong boolean`, '{"acknowledged":"true"}', at, 200],
        [`mutation ${String(at)} null`, 'null', at, 200],
        [`mutation ${String(at)} malformed JSON`, '{', at, 200],
        [`mutation ${String(at)} HTTP failure`, '{"acknowledged":true}', at, 503],
        [`mutation ${String(at)} HTTP unknown`, '{"acknowledged":true}', at, 202],
      ] as const,
  ),
] as const)(
  'retention Job rejects %s before further requests',
  async (_fault, reply, at, status) => {
    const receipt = await runRetention(reply, at, status);
    expect(receipt.exitCode).not.toBe(0);
    expect(receipt.requests).toHaveLength(at + 1);
    expect(receipt.stderr).toMatch(/Invalid retention response|HTTP (503|202)|JSON Parse error/);
  },
);

it('retention Job refuses missing credentials before network access', async () => {
  const receipt = await runRetention('{"status":"yellow","timed_out":false}', 0, 200, '');
  expect(receipt.exitCode).not.toBe(0);
  expect(receipt.requests).toHaveLength(0);
  expect(receipt.stderr).toContain('ELASTIC_PASSWORD is required');
});

it('one retention executable consumes each candidate policy identity', async () => {
  const files = await renderObservability(root);
  expect(files['observability/local/apply.js']).toBe(files['observability/production/apply.js']);
  for (const [environment, source] of [
    ['local', 'dev'],
    ['production', 'prod'],
  ]) {
    const receipt = await runRetention(
      '{"status":"green","timed_out":false}',
      0,
      200,
      'fixture',
      environment,
    );
    expect(receipt.exitCode).toBe(0);
    expect(receipt.requests.slice(1).map((request) => request.url)).toEqual(
      ['logs', 'traces', 'metrics'].flatMap((signal) => [
        `https://elasticsearch-es-http.observability.svc:9200/_ilm/policy/puni-${source}-${signal}`,
        `https://elasticsearch-es-http.observability.svc:9200/_component_template/${signal}-otel@custom`,
      ]),
    );
  }
});
