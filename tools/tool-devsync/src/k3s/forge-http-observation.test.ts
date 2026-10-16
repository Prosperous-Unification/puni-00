import { rejects } from 'node:assert/strict';

import { afterEach, expect, test } from 'bun:test';

import { observeConvergence, observeWeb } from './forge-http-observation';

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(async () => {
  await Promise.all(servers.map((server) => server.stop(true)));
  servers.length = 0;
});
function serve(fetch: (request: Request) => Response | Promise<Response>): string {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch });
  servers.push(server);
  return `http://localhost:${String(server.port)}`;
}

test('records response identity and root marker without retaining response content', async () => {
  const origin = serve(
    () =>
      new Response('<div id="root">private</div>', {
        headers: { 'content-type': 'text/html' },
      }),
  );
  const observation = await observeWeb(origin, 1000);
  expect(observation).toMatchObject({
    path: '/',
    status: 200,
    contentType: 'text/html',
    rootMarker: true,
    failure: null,
  });
  expect(observation.durationMs).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(observation)).not.toContain('private');
});

test('retains denial status and refuses a missing root marker', async () => {
  expect(
    await observeWeb(
      serve(() => new Response('<div id="root"></div>', { status: 403 })),
      1000,
    ),
  ).toMatchObject({ status: 403, rootMarker: true, failure: 'response' });
  expect(
    await observeWeb(
      serve(() => new Response('denied', { status: 403 })),
      1000,
    ),
  ).toMatchObject({ status: 403, rootMarker: false, failure: 'response' });
  expect(
    await observeWeb(
      serve(() => new Response('missing')),
      1000,
    ),
  ).toMatchObject({ status: 200, rootMarker: false, failure: 'response' });
});

test('bounds both missing headers and a response body that never ends', async () => {
  const waiting = serve(
    () =>
      new Promise<Response>(() => {
        /* Headers deliberately never arrive. */
      }),
  );
  const streaming = serve(
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('prefix'));
          },
        }),
      ),
  );
  for (const origin of [waiting, streaming]) {
    const started = Date.now();
    expect(await observeWeb(origin, 40)).toMatchObject({ failure: 'deadline' });
    expect(Date.now() - started).toBeLessThan(1000);
  }
});

test('refuses oversized and redirected responses', async () => {
  expect(
    await observeWeb(
      serve(() => new Response('x'.repeat(65537))),
      1000,
    ),
  ).toMatchObject({ failure: 'body-limit' });
  expect(
    await observeWeb(
      serve(() => new Response(null, { status: 302, headers: { location: 'http://example.org' } })),
      1000,
    ),
  ).toMatchObject({ status: 302, failure: 'response' });
});

test('convergence preserves immediate failure despite later success and uses GET only', async () => {
  let calls = 0;
  const origin = serve(() =>
    ++calls === 1 ? new Response('denied', { status: 403 }) : new Response('<div id="root"></div>'),
  );
  const report = await observeConvergence(origin, { windowMs: 100, intervalMs: 10, requestMs: 30 });
  expect(report.initial.failure).toBe('response');
  expect(report.initialPassed).toBe(false);
  expect(report.observations.some((observation) => observation.failure === null)).toBe(true);
  expect(report.initial.status).toBe(403);
});

test('permanent denial converges to bounded refusal', async () => {
  const started = Date.now();
  const report = await observeConvergence(
    serve(() => new Response('denied', { status: 403 })),
    { windowMs: 70, intervalMs: 10, requestMs: 20 },
  );
  expect(report.initialPassed).toBe(false);
  expect(report.observations.every((observation) => observation.failure === 'response')).toBe(true);
  expect(Date.now() - started).toBeLessThan(1000);
});

test('rejects external authority, credentials, non-root paths and invalid bounds before fetching', async () => {
  for (const origin of [
    'https://example.org',
    'http://user@localhost',
    'http://localhost/api',
    'http://localhost/?x=1',
    'ftp://localhost',
  ]) {
    await rejects(observeWeb(origin, 10), /loopback HTTP origin/);
  }
  for (const timeout of [0, -1, NaN, Infinity, 30001]) {
    await rejects(observeWeb('http://localhost', timeout), /deadline/);
  }
  await rejects(
    observeConvergence('http://localhost', { windowMs: 30001, requestMs: 10, intervalMs: 10 }),
    /window/,
  );
});

test('checker first failure emits evidence before any mutating phase', async () => {
  const methods: string[] = [];
  const origin = serve((request) => {
    methods.push(request.method);
    return new Response('denied', { status: 503, headers: { 'content-type': 'text/plain' } });
  });
  const child = Bun.spawn(
    [
      'bun',
      'tools/tool-devsync/src/k3s/dev-environment-check.ts',
      '--origin',
      origin.replace('localhost', 'test.localhost'),
      '--worktree',
      '/missing-worktree',
      '--kubeconfig',
      '/missing-kubeconfig',
      '--context',
      'unused',
      '--pod',
      'dev-test',
    ],
    { cwd: new URL('../../../../', import.meta.url).pathname, stdout: 'pipe', stderr: 'pipe' },
  );
  const output = await new Response(child.stderr).text();
  expect(await child.exited).not.toBe(0);
  expect(output).toContain('CHECK FAILED: web serves index.html');
  expect(output).toContain('"path":"/"');
  expect(output).toContain('"status":503');
  expect(output).toContain('"contentType":"text/plain"');
  expect(output).toContain('"rootMarker":false');
  expect(output).toContain('"durationMs":');
  expect(methods).toEqual(['GET']);
});

test('rejects credentials before opening the local fixture connection', async () => {
  let calls = 0;
  const origin = serve(() => {
    calls += 1;
    return new Response('<div id="root"></div>');
  });
  await rejects(observeWeb(origin.replace('http://', 'http://user@'), 50), /loopback HTTP origin/);
  expect(calls).toBe(0);
});

test('rejects invalid request deadline without fetching', async () => {
  const origin = serve(() => new Response('<div id="root"></div>'));
  await rejects(observeWeb(origin, 0), /deadline/);
});

test('read-only CLI refuses mutation arguments before opening a connection', async () => {
  const methods: string[] = [];
  const origin = serve((request) => {
    methods.push(request.method);
    return new Response('<div id="root"></div>');
  });
  const child = Bun.spawn(
    ['bun', 'tools/tool-devsync/src/k3s/forge-http-observation.ts', origin, '--kill'],
    { cwd: new URL('../../../../', import.meta.url).pathname, stdout: 'pipe', stderr: 'pipe' },
  );
  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
  }, 1000);
  try {
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(stderr).toContain('Usage: forge-http-observation.ts');
    expect(methods).toEqual([]);
  } finally {
    clearTimeout(timeout);
  }
});

test('records connection refusal with absent response evidence', async () => {
  const origin = serve(() => new Response('unused'));
  const server = servers.pop();
  if (server === undefined) throw new Error('fixture server missing');
  await server.stop(true);
  expect(await observeWeb(origin, 1000)).toMatchObject({
    status: null,
    contentType: null,
    rootMarker: false,
    failure: 'transport',
  });
});

test('read-only observer sends GET and refuses even a local redirect', async () => {
  const requests: string[] = [];
  const origin = serve((request) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
    if (new URL(request.url).pathname === '/') {
      return new Response(null, { status: 302, headers: { location: '/other' } });
    }
    return new Response('<div id="root"></div>');
  });
  expect(await observeWeb(origin, 1000)).toMatchObject({ status: 302, failure: 'response' });
  expect(requests).toEqual(['GET /']);
});
