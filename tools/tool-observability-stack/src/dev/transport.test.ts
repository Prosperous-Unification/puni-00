import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, expect, test } from 'bun:test';

import { createOtlpSender } from './otlp';
import { bindTransport, fetchTransport, readTransportFile } from './transport';

const directory = mkdtempSync(join(tmpdir(), 'puni-task5-tls-'));
function openssl(...args: string[]) {
  execFileSync('openssl', args, { cwd: directory, stdio: 'pipe' });
}
openssl(
  'req',
  '-x509',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-keyout',
  'ca.key',
  '-out',
  'ca.crt',
  '-subj',
  '/CN=Task5 Disposable CA',
  '-days',
  '1',
);
for (const identity of ['server', 'client', 'foreign']) {
  openssl(
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    `${identity}.key`,
    '-out',
    `${identity}.csr`,
    '-subj',
    `/CN=${identity === 'server' ? 'service.task5.test' : identity}`,
  );
  openssl(
    'x509',
    '-req',
    '-in',
    `${identity}.csr`,
    '-CA',
    'ca.crt',
    '-CAkey',
    'ca.key',
    '-CAcreateserial',
    '-out',
    `${identity}.crt`,
    '-days',
    '1',
    ...(identity === 'server' ? ['-copy_extensions', 'copy'] : []),
  );
}
openssl(
  'req',
  '-x509',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-keyout',
  'foreign-ca.key',
  '-out',
  'foreign-ca.crt',
  '-subj',
  '/CN=Foreign CA',
  '-days',
  '1',
);
const pem = (name: string) => readFileSync(join(directory, name), 'utf8');
const requests: string[] = [];
let reply: (() => Response) | undefined;
afterEach(() => {
  reply = undefined;
});
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  tls: {
    cert: pem('server.crt'),
    key: pem('server.key'),
    ca: pem('ca.crt'),
    requestCert: true,
    rejectUnauthorized: true,
  },
  fetch(request) {
    requests.push(request.headers.get('host') ?? '');
    if (new URL(request.url).pathname === '/accepted') return Response.json({});
    return reply === undefined ? Response.json({}) : reply();
  },
});
const binding = () => ({
  url: `https://127.0.0.1:${String(server.port)}`,
  serverName: 'service.task5.test',
  ca: pem('ca.crt'),
  authentication: { kind: 'mtls' as const, cert: pem('client.crt'), key: pem('client.key') },
});
const basicServer = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  tls: { cert: pem('server.crt'), key: pem('server.key') },
  fetch(request) {
    requests.push(request.headers.get('host') ?? '');
    return request.headers.get('authorization') === `Basic ${btoa('reader:disposable')}`
      ? Response.json({})
      : new Response('', { status: 401 });
  },
});
const basicBinding = () => ({
  ...binding(),
  url: `https://127.0.0.1:${String(basicServer.port)}`,
  authentication: { kind: 'basic' as const, username: 'reader', password: 'disposable' },
});
afterAll(async () => {
  await basicServer.stop(true);
  await server.stop(true);
  rmSync(directory, { recursive: true });
});
test('pinned Bun verified hostname mTLS and credential positive reaches OTLP route', async () => {
  expect(await createOtlpSender(binding())('logs', {}, AbortSignal.timeout(3000))).toEqual({
    state: 'acknowledged',
  });
  expect(await createOtlpSender(basicBinding())('logs', {}, AbortSignal.timeout(3000))).toEqual({
    state: 'acknowledged',
  });
  expect(requests.at(-1)).toBe('service.task5.test');
});
test('wrong hostname and untrusted CA refuse through real TLS', async () => {
  for (const changed of [
    { ...binding(), serverName: 'wrong.task5.test' },
    { ...binding(), ca: pem('foreign-ca.crt') },
  ])
    expect((await createOtlpSender(changed)('logs', {}, AbortSignal.timeout(3000))).state).toBe(
      'failed',
    );
});
test('missing client identity and incorrect credentials refuse on same receiver', async () => {
  expect(
    (
      await createOtlpSender({
        ...binding(),
        authentication: { kind: 'basic' as const, username: 'reader', password: 'disposable' },
      })('logs', {}, AbortSignal.timeout(3000))
    ).state,
  ).toBe('failed');
  expect(
    (
      await createOtlpSender({
        ...basicBinding(),
        authentication: { kind: 'basic' as const, username: 'reader', password: 'wrong' },
      })('logs', {}, AbortSignal.timeout(3000))
    ).state,
  ).toBe('failed');
});
test('trusted binding rejects absent empty malformed credentials and partial client pair', () => {
  for (const changed of [
    { ...binding(), ca: '' },
    { ...binding(), ca: 'bad' },
    { ...binding(), serverName: '' },
    {
      ...basicBinding(),
      authentication: { kind: 'basic' as const, username: 'reader', password: '' },
    },
    { ...binding(), authentication: { kind: 'mtls' as const, cert: pem('client.crt'), key: '' } },
    { ...binding(), url: 'http://127.0.0.1:1' },
  ])
    expect(() => bindTransport(changed)).toThrow();
  expect(() => readTransportFile(join(directory, 'absent.json'))).toThrow();
  expect(() => readTransportFile(directory)).toThrow();
});

test('runtime CLI carries verified transport into publisher and second metrics sender', async () => {
  const health = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.json({ status: 'ok', commit: 'a'.repeat(40) }),
  });
  const path = join(directory, 'runtime.json');
  writeFileSync(path, JSON.stringify(binding()), { mode: 0o600 });
  const before = requests.length;
  try {
    const child = Bun.spawn(
      [
        process.execPath,
        new URL('./probe-cli.ts', import.meta.url).pathname,
        '--once',
        '--local',
        `http://127.0.0.1:${String(health.port)}/health`,
        '--otlp-binding',
        path,
        '--version',
        'task5',
        '--checkpoint',
        join(directory, 'checkpoint.json'),
        '--initialize',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          http_proxy: '',
          https_proxy: 'http://127.0.0.1:9',
          HTTP_PROXY: '',
          HTTPS_PROXY: 'http://127.0.0.1:9',
          NO_PROXY: '',
          no_proxy: '',
        },
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ exit, stderr }).toEqual({ exit: 0, stderr: '' });
    expect(stdout).toContain('local-http-rehearsal');
    expect(requests.length - before).toBe(4);
  } finally {
    await health.stop(true);
  }
});
test('runtime binding absent unreadable and malformed files throw before network', () => {
  const path = join(directory, 'material.json');
  for (const content of [
    '{bad',
    '{}',
    JSON.stringify({ ...binding(), authentication: undefined }),
  ]) {
    writeFileSync(path, content);
    expect(() => readTransportFile(path)).toThrow();
  }
  writeFileSync(path, JSON.stringify(binding()));
  chmodSync(path, 0);
  try {
    expect(() => readTransportFile(path)).toThrow(/unreadable/);
  } finally {
    chmodSync(path, 0o600);
  }
});

test('trusted material rejects malformed trust suffix mismatched key and omitted authentication', () => {
  for (const changed of [
    { ...binding(), ca: pem('ca.crt') + 'garbage' },
    {
      ...binding(),
      authentication: { kind: 'mtls' as const, cert: pem('client.crt'), key: pem('foreign.key') },
    },
    { ...binding(), authentication: undefined },
    { ...binding(), url: 'https://user:secret@127.0.0.1:123' },
  ])
    expect(() => bindTransport(changed as ReturnType<typeof binding>)).toThrow();
});

test('runtime validation diagnostics never expose credential contents', async () => {
  const path = join(directory, 'private-invalid.json');
  for (const content of [
    '{"password":"must-never-log",',
    JSON.stringify({ ...basicBinding(), url: 'https://reader:must-never-log@' }),
  ]) {
    writeFileSync(path, content, { mode: 0o600 });
    const child = Bun.spawn(
      [
        process.execPath,
        new URL('./probe-cli.ts', import.meta.url).pathname,
        '--once',
        '--otlp-binding',
        path,
        '--version',
        'task5',
        '--checkpoint',
        join(directory, 'never-checkpoint.json'),
        '--initialize',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit).toBe(1);
    expect(stdout + stderr).not.toContain('must-never-log');
  }
});

test('TLS publication retains acknowledgement size partial redirect and deadline bounds', async () => {
  const send = createOtlpSender(binding());
  for (const response of [
    () =>
      new Response('{}', {
        status: 302,
        headers: { Location: `https://127.0.0.1:${String(server.port)}/accepted` },
      }),
    () => Response.json({ partialSuccess: { rejectedLogRecords: '1' } }),
    () => Response.json({ padding: 'x'.repeat(5000) }),
  ]) {
    reply = response;
    expect((await send('logs', {}, AbortSignal.timeout(1000))).state).toBe('failed');
  }
  reply = () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{'));
        },
      }),
    );
  const started = performance.now();
  expect((await send('logs', {}, AbortSignal.timeout(100))).state).toBe('failed');
  expect(performance.now() - started).toBeLessThan(1000);
});

test('trusted binding shape refuses unknown fields before transport', () => {
  expect(() =>
    bindTransport({ ...binding(), unexpected: 'private' } as ReturnType<typeof binding>),
  ).toThrow(/shape/);
});
test('trusted CA rejects a leaf certificate', () => {
  expect(() => bindTransport({ ...binding(), ca: pem('server.crt') })).toThrow(/not a CA/);
});
test.each([
  ['colon username', 'reader:name', 'secret'],
  ['newline username', 'reader\n', 'secret'],
  ['newline password', 'reader', 'secret\n'],
  ['empty username', '', 'secret'],
  ['empty password', 'reader', ''],
])('trusted basic credential syntax refuses %s', (_label, username, password) => {
  expect(() =>
    bindTransport({ ...basicBinding(), authentication: { kind: 'basic', username, password } }),
  ).toThrow(/credentials/);
});
test('runtime refuses simultaneous endpoint and binding before any network', async () => {
  const path = join(directory, 'ambiguous.json');
  writeFileSync(path, JSON.stringify(binding()));
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./probe-cli.ts', import.meta.url).pathname,
      '--once',
      '--local',
      'http://127.0.0.1:9/health',
      '--otlp',
      'http://127.0.0.1:9',
      '--otlp-binding',
      path,
      '--version',
      'task5',
      '--checkpoint',
      join(directory, 'ambiguous-checkpoint.json'),
      '--initialize',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [stderr, exit] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  expect(exit).toBe(1);
  expect(stderr).toContain('Use one endpoint or binding per route');
});

test.each(['elastic', 'prometheus'])(
  'runtime loads required %s binding before source collection',
  async (route) => {
    const path = join(directory, 'present-otlp.json');
    writeFileSync(path, JSON.stringify(binding()));
    const child = Bun.spawn(
      [
        process.execPath,
        new URL('./probe-cli.ts', import.meta.url).pathname,
        '--once',
        '--otlp-binding',
        path,
        `--${route}-binding`,
        join(directory, 'absent-query.json'),
        '--version',
        'task5',
        '--checkpoint',
        join(directory, 'unreached.json'),
        '--initialize',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('ENOENT');
  },
);

test('malformed binding JSON reports a fixed trusted-input diagnostic', () => {
  const path = join(directory, 'malformed-json.json');
  writeFileSync(path, '{bad');
  expect(() => readTransportFile(path)).toThrow(/Malformed transport binding JSON/);
});

test('pinned Bun sends service SNI over loopback and selects the matching certificate', async () => {
  const reserved = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data(socket) {
        socket.end();
      },
    },
  });
  const port = reserved.port;
  reserved.stop(true);
  const child = Bun.spawn(
    [
      'openssl',
      's_server',
      '-accept',
      `127.0.0.1:${String(port)}`,
      '-cert',
      join(directory, 'foreign.crt'),
      '-key',
      join(directory, 'foreign.key'),
      '-cert2',
      join(directory, 'server.crt'),
      '-key2',
      join(directory, 'server.key'),
      '-servername',
      'service.task5.test',
      '-servername_fatal',
      '-tlsextdebug',
      '-www',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  try {
    const bound = bindTransport({ ...basicBinding(), url: `https://127.0.0.1:${String(port)}` });
    let response: Response | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        response = await fetchTransport(bound.url, bound, { signal: AbortSignal.timeout(1000) });
        break;
      } catch (error) {
        if (!(error instanceof TypeError) || !('code' in error) || error.code !== 'ECONNREFUSED')
          throw error;
        await Bun.sleep(10);
      }
    }
    expect(response?.status).toBe(200);
    expect(await response?.text()).toContain('s_server');
    const wrong = bindTransport({
      ...basicBinding(),
      url: `https://127.0.0.1:${String(port)}`,
      serverName: 'wrong.task5.test',
    });
    const outcome = await fetchTransport(wrong.url, wrong, {
      signal: AbortSignal.timeout(1000),
    }).then(
      () => 'accepted',
      () => 'refused',
    );
    expect(outcome).toBe('refused');
  } finally {
    child.kill();
    await child.exited;
  }
  expect(await stdout).toContain('Hostname in TLS extension: "service.task5.test"');
  await stderr;
});

test('untrusted CA independently refuses verified TLS', async () => {
  expect(
    (
      await createOtlpSender({ ...binding(), ca: pem('foreign-ca.crt') })(
        'logs',
        {},
        AbortSignal.timeout(1000),
      )
    ).state,
  ).toBe('failed');
});
