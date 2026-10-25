import { afterEach, expect, test } from 'bun:test';

import { createOtlpPublisher, encodeOtlp } from './otlp';
import { collectProbe, runProbe } from './probe';
import { createHttpHealthReader } from './source';

const revision = 'a'.repeat(40);
const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) void server.stop(true);
});
function serve(fetch: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch });
  servers.push(server);
  return `http://127.0.0.1:${String(server.port)}`;
}
const publication = { publish: () => Promise.resolve({ state: 'acknowledged' as const }) };
function reader(fetch: (request: Request) => Response | Promise<Response>) {
  return createHttpHealthReader(`${serve(fetch)}/health`);
}

test('actual request revision and request duration survive without response secrets', async () => {
  const readHealth = reader(async () => {
    await Bun.sleep(15);
    return Response.json({ status: 'ok', commit: revision, token: 'secret-credential' });
  });
  const observation = await collectProbe({ readHealth, publication, producerVersion: 'test' });
  expect(observation.success).toBe(true);
  expect(observation.revision).toBe(revision);
  expect(observation.requestDurationMs).toBeGreaterThanOrEqual(10);
  expect(JSON.stringify(encodeOtlp(observation))).not.toContain('secret-credential');
  const encoded = encodeOtlp(observation);
  const spans = encoded.traces.resourceSpans[0].scopeSpans[0].spans;
  expect(spans.length).toBe(2);
  expect(spans[1].parentSpanId).toBe(spans[0].spanId);
  expect(spans[1].traceId).toBe(spans[0].traceId);
});

test.each([
  ['malformed-health', () => new Response('not-json')],
  ['invalid-health', () => Response.json({ status: 'ok', commit: 'HEAD' })],
  ['http-status', () => new Response('private', { status: 503 })],
  ['response-size', () => new Response('x'.repeat(4097))],
] as const)('actual HTTP rejects %s', async (reason, fetch) => {
  const observation = await collectProbe({
    readHealth: reader(fetch),
    publication,
    producerVersion: 'test',
  });
  expect(observation.success).toBe(false);
  expect(observation.reason).toBe(reason);
  expect(observation.revision).toBeNull();
});

test('actual request deadline aborts slow health read', async () => {
  const started = performance.now();
  const observation = await collectProbe({
    readHealth: reader(async () => {
      await Bun.sleep(250);
      return Response.json({ status: 'ok', commit: revision });
    }),
    publication,
    producerVersion: 'test',
    deadlineMs: 30,
  });
  expect(observation.success).toBe(false);
  expect(observation.reason).toBe('deadline');
  expect(performance.now() - started).toBeLessThan(200);
});

test('revision mismatch never becomes a successful observation', async () => {
  const observation = await collectProbe({
    readHealth: reader(() => Response.json({ status: 'ok', commit: revision })),
    publication,
    producerVersion: 'test',
    expectedRevision: 'b'.repeat(40),
  });
  expect(observation.success).toBe(false);
  expect(observation.reason).toBe('revision-mismatch');
  expect(observation.revision).toBe(revision);
});

test('future health time is refused through actual HTTP reader', async () => {
  const readHealth = reader(() => Response.json({ status: 'ok', commit: revision }));
  const original = Date.now;
  let calls = 0;
  Date.now = () => original() + (++calls === 2 ? 10000 : 0);
  try {
    await expectFailure(collectProbe({ readHealth, publication, producerVersion: 'test' }), 'time');
  } finally {
    Date.now = original;
  }
});

test('actual OTLP HTTP publishes three signals and rejects backend errors', async () => {
  const requests: { path: string; body: unknown }[] = [];
  const base = serve(async (request) => {
    requests.push({ path: new URL(request.url).pathname, body: await request.json() });
    return Response.json({});
  });
  const observation = await collectProbe({
    readHealth: reader(() => Response.json({ status: 'ok', commit: revision })),
    publication: createOtlpPublisher(base),
    producerVersion: 'test',
  });
  expect(observation.publication.state).toBe('acknowledged');
  expect(requests.map((request) => request.path).sort()).toEqual([
    '/v1/logs',
    '/v1/metrics',
    '/v1/traces',
  ]);
  const failure = await collectProbe({
    readHealth: reader(() => Response.json({ status: 'ok', commit: revision })),
    publication: createOtlpPublisher(serve(() => Response.json({}, { status: 503 }))),
    producerVersion: 'test',
  });
  expect(failure.success).toBe(true);
  expect(failure.publication.state).toBe('failed');
});

test('periodic runner recovers next cycle and stops without overlap', async () => {
  const controller = new AbortController();
  let count = 0;
  let active = 0;
  let maximum = 0;
  const readHealth = reader(async () => {
    active++;
    maximum = Math.max(maximum, active);
    await Bun.sleep(10);
    active--;
    return ++count === 1
      ? new Response('', { status: 503 })
      : Response.json({ status: 'ok', commit: revision });
  });
  const completed: boolean[] = [];
  await runProbe({
    readHealth,
    publication,
    producerVersion: 'test',
    intervalMs: 15,
    deadlineMs: 100,
    signal: controller.signal,
    onCompleted: (observation) => {
      completed.push(observation.success);
      if (completed.length === 3) controller.abort();
      return Promise.resolve();
    },
  });
  expect(completed).toEqual([false, true, true]);
  expect(maximum).toBe(1);
});

test.each([
  ['partial-success', () => Response.json({ partialSuccess: { rejectedLogRecords: '1' } })],
  ['malformed-ack', () => new Response('invalid')],
  ['oversized-ack', () => new Response('x'.repeat(4097))],
  [
    'slow-ack',
    async () => {
      await Bun.sleep(300);
      return Response.json({});
    },
  ],
] as const)(
  'actual publication refuses %s independently of request health',
  async (_name, respond) => {
    const observation = await collectProbe({
      readHealth: reader(() => Response.json({ status: 'ok', commit: revision })),
      publication: createOtlpPublisher(serve(respond)),
      producerVersion: 'test',
      deadlineMs: 40,
    });
    expect(observation.success).toBe(true);
    expect(observation.publication.state).toBe('failed');
  },
);

test('chunked response cap refuses untrusted Content-Length absence', async () => {
  const observation = await collectProbe({
    readHealth: reader(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(3000));
              controller.enqueue(new Uint8Array(3000));
              controller.close();
            },
          }),
        ),
    ),
    publication,
    producerVersion: 'test',
  });
  expect(observation.reason).toBe('response-size');
});

test('SIGTERM cancels active request using actual CLI process', async () => {
  // Cancellation must traverse process signal handlers and the actual in-flight HTTP request.
  let started: (() => void) | undefined;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const endpoint = `${serve(async () => {
    started?.();
    await Bun.sleep(1000);
    return Response.json({ status: 'ok', commit: revision });
  })}/health`;
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./probe-cli.ts', import.meta.url).pathname,
      '--local',
      endpoint,
      '--otlp',
      serve(() => Response.json({})),
      '--version',
      'test',
      '--checkpoint',
      `/tmp/puni-probe-${crypto.randomUUID()}.json`,
      '--initialize',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  await requested;
  child.kill('SIGTERM');
  expect(await child.exited).toBe(0);
});

async function expectFailure(operation: Promise<unknown>, message?: string): Promise<void> {
  let rejected = false;
  try {
    await operation;
  } catch (error) {
    rejected = true;
    expect(error).toBeInstanceOf(Error);
    if (message !== undefined) expect(String(error)).toContain(message);
  }
  expect(rejected).toBe(true);
}

test('prior acceptance times out while current collection completes and reports unavailable', async () => {
  const readHealth = reader(() => Response.json({ status: 'ok', commit: revision }));
  const previous = await collectProbe({ readHealth, publication, producerVersion: 'test' });
  const controller = new AbortController();
  const states: string[] = [];
  const started = performance.now();
  await runProbe({
    readHealth,
    publication,
    producerVersion: 'test',
    deadlineMs: 30,
    intervalMs: 30,
    signal: controller.signal,
    previous,
    acceptance: {
      assess: () =>
        new Promise(() => {
          /* Deliberately stuck backend ignores its signal. */
        }),
    },
    onAssessed: (health) => {
      states.push(health.state, ...health.signals.log);
    },
    onCompleted: () => {
      controller.abort();
      return Promise.resolve();
    },
  });
  expect(states).toEqual(['incomplete', 'unavailable: deadline']);
  expect(performance.now() - started).toBeLessThan(200);
});

test('prior query failure is joined immediately and cancels current collection', async () => {
  const readHealth = reader(() => Response.json({ status: 'ok', commit: revision }));
  const previous = await collectProbe({ readHealth, publication, producerVersion: 'test' });
  const controller = new AbortController();
  await expectFailure(
    runProbe({
      readHealth: reader(async () => {
        await Bun.sleep(200);
        return Response.json({ status: 'ok', commit: revision });
      }),
      publication,
      producerVersion: 'test',
      signal: controller.signal,
      previous,
      acceptance: { assess: () => Promise.reject(new Error('unmodeled-query-failure')) },
      onCompleted: () => Promise.resolve(),
    }),
    'unmodeled-query-failure',
  );
});

test('metric labels stay bounded and deployment revision replacement clears previous metadata', async () => {
  const batches: string[] = [];
  const publisher = createOtlpPublisher(
    serve(async (request) => {
      if (new URL(request.url).pathname === '/v1/metrics') batches.push(await request.text());
      return Response.json({});
    }),
    'b'.repeat(40),
  );
  const observation = await collectProbe({
    readHealth: reader(() => Response.json({ status: 'ok', commit: revision })),
    publication: publisher,
    producerVersion: 'test',
  });
  const encoded = encodeOtlp(observation, 'b'.repeat(40));
  const metrics = encoded.metrics.resourceMetrics[0].scopeMetrics[0].metrics;
  const success = metrics.find((metric) => metric.name === 'puni_dev_probe_success');
  expect(success?.gauge.dataPoints[0].attributes.map((attribute) => attribute.key)).toEqual([
    'environment',
    'service',
  ]);
  const revisions = metrics.filter((metric) => metric.name === 'puni_dev_revision_info');
  expect(revisions.map((metric) => metric.gauge.dataPoints[0].asDouble)).toEqual([0, 1]);
  expect(batches[0]).not.toContain(observation.observationId);
  expect(batches[0]).not.toContain(observation.traceId);
  expect(encoded.logs.resourceLogs[0].resource.attributes).toContainEqual({
    key: 'service.name',
    value: { stringValue: 'puni-dev-probe' },
  });
  expect(encoded.traces.resourceSpans[0].scopeSpans[0].spans[1].kind).toBe(3);
});

test.each([
  'https://127.0.0.1:3100/health',
  'http://example.com/health',
  'http://user:password@127.0.0.1/health',
  'http://127.0.0.1/api/health',
  'http://127.0.0.1/health?token=private',
])('unsafe health target throws: %s', (endpoint) => {
  expect(() => createHttpHealthReader(endpoint)).toThrow();
});

test.each(['http://example.com', 'http://user:password@127.0.0.1', 'http://127.0.0.1/foreign'])(
  'unsafe publication target throws: %s',
  (endpoint) => {
    expect(() => createOtlpPublisher(endpoint)).toThrow();
  },
);

test('standard collector empty partialSuccess acknowledges all signals', async () => {
  const observation = await collectProbe({
    readHealth: reader(() => Response.json({ status: 'ok', commit: revision })),
    publication: createOtlpPublisher(serve(() => Response.json({ partialSuccess: {} }))),
    producerVersion: 'test',
  });
  expect(observation.publication.state).toBe('acknowledged');
});

test('local rehearsal never claims inspected SSH container or mount provenance', async () => {
  const observation = await collectProbe({
    readHealth: reader(() => Response.json({ status: 'ok', commit: revision })),
    publication,
    producerVersion: 'test',
  });
  expect(observation.source).toEqual({ kind: 'local-http-rehearsal' });
  const payload = JSON.stringify(encodeOtlp(observation));
  expect(payload).not.toContain('puni.target.container');
  expect(payload).not.toContain('/home/puni1/wbs-dev/src');
  expect(payload).toContain('local-http-rehearsal');
});

test('shutdown cancels stuck prior acceptance without waiting for cycle deadline', async () => {
  const readHealth = reader(() => Response.json({ status: 'ok', commit: revision }));
  const previous = await collectProbe({ readHealth, publication, producerVersion: 'test' });
  const controller = new AbortController();
  const started = performance.now();
  const timer = setTimeout(() => {
    controller.abort();
  }, 10);
  try {
    await runProbe({
      readHealth,
      publication,
      producerVersion: 'test',
      deadlineMs: 1000,
      signal: controller.signal,
      previous,
      acceptance: {
        assess: () =>
          new Promise(() => {
            /* Deliberately stuck backend ignores its signal. */
          }),
      },
      onCompleted: () => Promise.resolve(),
    });
    expect(performance.now() - started).toBeLessThan(200);
  } finally {
    clearTimeout(timer);
  }
});

test('invalid trusted probe cadence, deadline and producer state throw', async () => {
  const readHealth = reader(() => Response.json({ status: 'ok', commit: revision }));
  for (const deadlineMs of [0, 20001, Number.NaN])
    await expectFailure(
      collectProbe({ readHealth, publication, producerVersion: 'test', deadlineMs }),
    );
  await expectFailure(collectProbe({ readHealth, publication, producerVersion: '' }));
  await expectFailure(
    collectProbe({ readHealth, publication, producerVersion: 'test', expectedRevision: 'HEAD' }),
  );
  const controller = new AbortController();
  controller.abort();
  await expectFailure(
    runProbe({
      readHealth,
      publication,
      producerVersion: 'test',
      signal: controller.signal,
      intervalMs: 0,
      onCompleted: () => Promise.resolve(),
    }),
  );
  expect(() => createOtlpPublisher('http://127.0.0.1:4318', 'HEAD')).toThrow();
});
