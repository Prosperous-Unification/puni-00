import { tmpdir } from 'node:os';

import { afterEach, expect, it } from 'bun:test';

import { main } from '../entrypoint';

const servers: Bun.Server<undefined>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      await server.stop(true);
    }),
  );
});

function startBackend(body: unknown, status = 200) {
  const requests: {
    readonly url: string;
    readonly method: string;
    readonly authorization: string | null;
    readonly cookie: string | null;
  }[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      requests.push({
        url: request.url,
        method: request.method,
        authorization: request.headers.get('authorization'),
        cookie: request.headers.get('cookie'),
      });
      return Response.json(body, { status });
    },
  });
  servers.push(server);
  return { server, requests, origin: 'http://127.0.0.1:' + String(server.port) };
}

async function invoke(words: string[]) {
  const stdout: string[] = [],
    stderr: string[] = [];
  const completion = await main(words, {
    installation: {
      directory: '/absent PUNI installation',
      entrypoint: '/absent PUNI installation/puni.mjs',
    },
    lookup: { directory: '/absent lookup', path: '/absent tools' },
    callerDirectory: tmpdir(),
    runtime: process.execPath,
    temporaryDirectory: tmpdir(),
    environment: { AUTHORIZATION: 'must-not-be-sent', COOKIE: 'must-not-be-sent' },
    stdout: (chunk) => {
      stdout.push(Buffer.from(chunk).toString());
    },
    stderr: (chunk) => {
      stderr.push(Buffer.from(chunk).toString());
    },
  });
  return { completion, stdout: stdout.join(''), stderr: stderr.join('') };
}

for (const namespace of ['dash', 'd']) {
  for (const features of [
    { onboarding: false, organizations: false },
    { onboarding: true, organizations: false },
    { onboarding: true, organizations: true },
  ]) {
    it(
      namespace + ' probes the anonymous backend with features ' + JSON.stringify(features),
      async () => {
        const backend = startBackend({ user: null, features });
        const probe = await invoke([namespace, 'dev-probe', 'be', backend.origin + '/']);
        expect(probe.completion).toEqual({ kind: 'drain', status: 0 });
        expect(probe.stdout).toBe(
          '[dev-deploy] ' + 'be (auth routes mounted)'.padEnd(28) + ' ok\n',
        );
        expect(probe.stderr).toBe('');
        expect(backend.requests).toHaveLength(1);
        const request = backend.requests.at(0);
        if (request === undefined) throw new Error('Backend request was not captured');
        expect(new URL(request.url).pathname).toBe('/api/auth/me');
        expect(request.method).toBe('GET');
        expect(request.authorization).toBeNull();
        expect(request.cookie).toBeNull();
      },
    );
  }
}

for (const body of [
  null,
  [],
  { user: null },
  { user: { id: 'signed-in' }, features: { onboarding: false, organizations: false } },
  { user: null, features: null },
  { user: null, features: [] },
  { user: null, features: { onboarding: 'false', organizations: false } },
  { user: null, features: { onboarding: false, organizations: 'false' } },
  { user: null, features: { onboarding: true, organizations: 'false' } },
  { user: null, features: { onboarding: false } },
  { user: null, features: { onboarding: false, organizations: true } },
]) {
  it('backend probe refuses invalid identity ' + JSON.stringify(body), async () => {
    const backend = startBackend(body);
    const probe = await invoke(['dash', 'dev-probe', 'be', backend.origin]);
    expect(backend.requests).toHaveLength(1);
    expect(probe.completion).toEqual({ kind: 'drain', status: 1 });
    expect(probe.stdout).toBe('');
    expect(probe.stderr).toContain('backend probe:');
    expect(probe.stderr).toContain('FAIL');
  });
}

for (const status of [201, 401, 500]) {
  it(
    'backend probe refuses HTTP ' + String(status) + ' despite a valid identity body',
    async () => {
      const backend = startBackend(
        { user: null, features: { onboarding: false, organizations: false } },
        status,
      );
      const probe = await invoke(['d', 'dev-probe', 'be', backend.origin]);
      expect(backend.requests).toHaveLength(1);
      expect(probe.completion).toEqual({ kind: 'drain', status: 1 });
      expect(probe.stdout).toBe('');
      expect(probe.stderr).toContain('backend probe:');
      expect(probe.stderr).toContain('HTTP ' + String(status));
    },
  );
}

it('backend probe refuses a redirect without requesting its target', async () => {
  const target = startBackend({
    user: null,
    features: { onboarding: false, organizations: false },
  });
  const redirect = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.redirect(target.origin),
  });
  servers.push(redirect);
  const probe = await invoke([
    'dash',
    'dev-probe',
    'be',
    'http://127.0.0.1:' + String(redirect.port),
  ]);
  expect(probe.completion).toEqual({ kind: 'drain', status: 1 });
  expect(probe.stderr).toContain('HTTP 302');
  expect(target.requests).toHaveLength(0);
});

it('backend probe refuses malformed JSON without echoing its body', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response('private-invalid-json'),
  });
  servers.push(server);
  const probe = await invoke([
    'dash',
    'dev-probe',
    'be',
    'http://127.0.0.1:' + String(server.port),
  ]);
  expect(probe.completion).toEqual({ kind: 'drain', status: 1 });
  expect(probe.stderr).toContain('backend probe:');
  expect(probe.stderr).not.toContain('private-invalid-json');
  expect(probe.stdout).toBe('');
});

it('backend probe refuses a closed native listener', async () => {
  const backend = startBackend({ user: null });
  await backend.server.stop(true);
  const index = servers.indexOf(backend.server);
  if (index < 0) throw new Error('Backend listener owner disappeared');
  servers.splice(index, 1);
  const probe = await invoke(['dash', 'dev-probe', 'be', backend.origin]);
  expect(probe.completion).toEqual({ kind: 'drain', status: 1 });
  expect(probe.stderr).toContain('backend probe:');
  expect(probe.stdout).toBe('');
});

it('backend probe aborts a real pending response within its fifteen-second request bound', async () => {
  const pending = Promise.withResolvers<Response>();
  let requestedAt: number | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let watchdogReached = false;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 30,
    fetch() {
      // Start the watchdog at request arrival, after CLI startup.
      // Proof: extending the real request deadline to 60 s let this watchdog
      // return a healthy response, so the refusal assertion received status 0.
      requestedAt = performance.now();
      watchdog = setTimeout(() => {
        watchdogReached = true;
        pending.resolve(
          Response.json({ user: null, features: { onboarding: false, organizations: false } }),
        );
      }, 21_000);
      return pending.promise;
    },
  });
  servers.push(server);
  try {
    const probe = await invoke([
      'dash',
      'dev-probe',
      'be',
      'http://127.0.0.1:' + String(server.port),
    ]);
    expect(probe.completion).toEqual({ kind: 'drain', status: 1 });
    expect(probe.stdout).toBe('');
    expect(probe.stderr).toContain('backend probe:');
    expect(watchdogReached).toBe(false);
    if (requestedAt === undefined) throw new Error('probe did not reach the real pending server');
    expect(performance.now() - requestedAt).toBeGreaterThanOrEqual(14_000);
  } finally {
    clearTimeout(watchdog);
    pending.resolve(new Response('fixture settled'));
  }
}, 27_000);

for (const words of [
  [],
  ['be'],
  ['unknown'],
  ['be', ''],
  ['be', '   '],
  ['be', '--unknown'],
  ['be', 'ORIGIN', 'extra'],
]) {
  it(
    'backend probe refuses malformed grammar ' + JSON.stringify(words) + ' before operation IO',
    async () => {
      const backend = startBackend({
        user: null,
        features: { onboarding: false, organizations: false },
      });
      const probe = await invoke([
        'dash',
        'dev-probe',
        ...words.map((word) => (word === 'ORIGIN' ? backend.origin : word)),
      ]);
      expect(probe.completion.status).toBe(1);
      expect(probe.stderr).toStartWith('error: usage: puni dash');
      expect(backend.requests).toHaveLength(0);
    },
  );
}

it('backend probe help names the origin without reading an installation', async () => {
  const probe = await invoke(['d', 'dev-probe', 'be', '--help']);
  expect(probe.completion).toEqual({ kind: 'drain', status: 0 });
  expect(probe.stderr).toBe('');
  expect(probe.stdout).toContain('ORIGIN');
});
