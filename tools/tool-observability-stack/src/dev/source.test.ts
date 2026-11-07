import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { readCheckpoint, writeCheckpoint } from './checkpoint';
import { encodeOtlp } from './otlp';
import { collectProbe } from './probe';
import { createSshHealthReader } from './source';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const revision = 'a'.repeat(40);
const publication = { publish: () => Promise.resolve({ state: 'acknowledged' as const }) };
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'puni-probe-source-'));
  directories.push(directory);
  const settings = join(directory, 'settings.json');
  const argumentsPath = join(directory, 'arguments.json');
  const measurementPath = join(directory, 'measurement.json');
  const executable = join(directory, 'ssh');
  const preloadPath = join(directory, 'fetch.preload.ts');
  const routePath = join(directory, 'route.json');
  const fetchAuditPath = join(directory, 'fetch-audit.json');
  const requests: string[] = [];
  // The fake SSH child executes the original production stdin. Only its fetch transport
  // crosses from container loopback to this fixture's independently allocated listener.
  writeFileSync(
    preloadPath,
    `import { readFileSync, writeFileSync } from 'node:fs';
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  writeFileSync(${JSON.stringify(fetchAuditPath)}, JSON.stringify({
    url: typeof input === 'string' ? input : 'non-string',
    redirect: options?.redirect,
    signal: options?.signal instanceof AbortSignal,
  }));
  if (input !== 'http://127.0.0.1:3100/health') throw new Error('fixture original health URL differs');
  const route = JSON.parse(readFileSync(${JSON.stringify(routePath)}, 'utf8'));
  if (typeof route !== 'string') throw new Error('fixture route differs');
  const endpoint = new URL(route);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' ||
      endpoint.port === '' || endpoint.pathname !== '/health' || endpoint.search !== '' ||
      endpoint.hash !== '' || endpoint.username !== '' || endpoint.password !== '')
    throw new Error('fixture route differs');
  return nativeFetch(route, options);
};
`,
  );
  function serveHealth(fetch: (request: Request) => Response | Promise<Response>) {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: (request) => {
        requests.push(new URL(request.url).pathname);
        return fetch(request);
      },
    });
    writeFileSync(routePath, JSON.stringify(`http://127.0.0.1:${String(server.port)}/health`));
    return server;
  }
  function assertRequests() {
    expect(JSON.parse(readFileSync(fetchAuditPath, 'utf8'))).toEqual({
      url: 'http://127.0.0.1:3100/health',
      redirect: 'manual',
      signal: true,
    });
    expect(requests).toEqual(['/health']);
  }
  const inspect = [
    {
      Id: 'd'.repeat(64),
      Name: '/wbs-dev-src',
      State: { Running: true },
      Config: { WorkingDir: '/src', Cmd: ['bun', 'run', 'dev'] },
      Mounts: [{ Type: 'bind', Source: '/home/puni1/wbs-dev/src', Destination: '/src' }],
      NetworkSettings: { Networks: { 'wbs-dev-net': {} } },
    },
  ];
  writeFileSync(settings, JSON.stringify({ inspect, mode: 'read' }));
  writeFileSync(
    executable,
    `#!${process.execPath}\nimport {readFileSync,writeFileSync} from 'node:fs';
 const settings=JSON.parse(readFileSync(${JSON.stringify(settings)},'utf8'));
 writeFileSync(${JSON.stringify(argumentsPath)},JSON.stringify(process.argv.slice(2)));
 if(settings.mode==='inspect-failure'&&process.argv.includes('inspect'))process.exit(1);
 else if(settings.mode==='blocked'){writeFileSync(${JSON.stringify(join(directory, 'pid'))},String(process.pid));await Bun.sleep(60000);}
 else if(process.argv.includes('inspect')){console.log(JSON.stringify(settings.inspect));if(settings.mode==='recreated'){settings.inspect[0].Id='e'.repeat(64);writeFileSync(${JSON.stringify(settings)},JSON.stringify(settings));}}
 else if(settings.mode==='recreated'&&process.argv.includes('wbs-dev-src')){const time=Date.now();console.log(JSON.stringify({success:true,revision:'b'.repeat(40),reason:null,startedAt:time,finishedAt:time,requestDurationMs:0,transportDurationMs:null}));}
 else if(settings.mode==='malformed')console.log('invalid-json');
 else if(settings.mode==='old'||settings.mode==='future'){
 const time=Date.now()+(settings.mode==='old'?-10000:10000);console.log(JSON.stringify({success:true,revision:'${revision}',reason:null,startedAt:time,finishedAt:time,requestDurationMs:0,transportDurationMs:null}));
 }else {const child=Bun.spawn([process.execPath,'run','--preload',${JSON.stringify(preloadPath)},'-'],{stdin:'inherit',stdout:'pipe',stderr:'inherit'});const measured=await new Response(child.stdout).text();writeFileSync(${JSON.stringify(measurementPath)},measured);process.stdout.write(measured);process.exitCode=await child.exited;}
 `,
  );
  chmodSync(executable, 0o700);
  return {
    directory,
    settings,
    argumentsPath,
    measurementPath,
    executable,
    inspect,
    preloadPath,
    routePath,
    fetchAuditPath,
    requests,
    serveHealth,
    assertRequests,
  };
}

test('fixture transport refuses a wrong original URL before any real HTTP request', async () => {
  const source = fixture();
  const server = source.serveHealth(() => Response.json({ status: 'ok', commit: revision }));
  try {
    const child = Bun.spawn([process.execPath, 'run', '--preload', source.preloadPath, '-'], {
      stdin: new TextEncoder().encode(
        "await fetch('http://127.0.0.1:3100/foreign', {signal: AbortSignal.timeout(1000), redirect: 'manual'});",
      ),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).not.toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toContain('fixture original health URL differs');
    expect(JSON.parse(readFileSync(source.fetchAuditPath, 'utf8'))).toEqual({
      url: 'http://127.0.0.1:3100/foreign',
      redirect: 'manual',
      signal: true,
    });
    expect(source.requests).toEqual([]);
  } finally {
    await server.stop(true);
  }
});

test('fixture transport refuses missing routing state without a real HTTP request', async () => {
  const source = fixture();
  const server = source.serveHealth(() => Response.json({ status: 'ok', commit: revision }));
  rmSync(source.routePath);
  try {
    const observation = await collectProbe({
      readHealth: createSshHealthReader(source.executable),
      publication,
      producerVersion: 'test',
    });
    expect(observation.success).toBe(false);
    expect(observation.reason).toBe('source-unavailable');
    expect(source.requests).toEqual([]);
    expect(JSON.parse(readFileSync(source.fetchAuditPath, 'utf8'))).toMatchObject({
      url: 'http://127.0.0.1:3100/health',
    });
  } finally {
    await server.stop(true);
  }
});

test('fixed stdin reaches only its own ephemeral fixture listener', async () => {
  const first = fixture();
  const second = fixture();
  const firstServer = first.serveHealth(() =>
    Response.json({ status: 'ok', commit: 'a'.repeat(40) }),
  );
  const secondServer = second.serveHealth(() =>
    Response.json({ status: 'ok', commit: 'b'.repeat(40) }),
  );
  try {
    expect(firstServer.port).not.toBe(secondServer.port);
    const [firstObservation, secondObservation] = await Promise.all([
      collectProbe({
        readHealth: createSshHealthReader(first.executable),
        publication,
        producerVersion: 'test',
      }),
      collectProbe({
        readHealth: createSshHealthReader(second.executable),
        publication,
        producerVersion: 'test',
      }),
    ]);
    expect(firstObservation.revision).toBe('a'.repeat(40));
    expect(secondObservation.revision).toBe('b'.repeat(40));
    first.assertRequests();
    second.assertRequests();
  } finally {
    await Promise.all([firstServer.stop(true), secondServer.stop(true)]);
  }
});

test('fixed SSH argv executes fixed stdin source with actual HTTP timing', async () => {
  const source = fixture();
  const server = source.serveHealth(async () => {
    await Bun.sleep(10);
    return Response.json({ status: 'ok', commit: revision, cookie: 'never-export' });
  });
  try {
    const observation = await collectProbe({
      readHealth: createSshHealthReader(source.executable),
      publication,
      producerVersion: 'test',
    });
    expect(observation.success).toBe(true);
    expect(JSON.stringify(encodeOtlp(observation))).toContain('puni.target.container');
    expect(observation.revision).toBe(revision);
    expect(observation.requestDurationMs).toBeGreaterThanOrEqual(8);
    expect(observation.transportDurationMs).toBeGreaterThan(observation.requestDurationMs ?? 0);
    expect(readFileSync(source.argumentsPath, 'utf8')).toBe(
      JSON.stringify([
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=5',
        'h2puni',
        'sudo',
        '-n',
        'docker',
        'exec',
        '-i',
        'd'.repeat(64),
        'bun',
        'run',
        '-',
      ]),
    );
    expect(JSON.stringify(observation)).not.toContain('never-export');
    source.assertRequests();
  } finally {
    await server.stop(true);
  }
});

test.each(['name', 'stopped', 'mount', 'network', 'runtime', 'empty', 'malformed'] as const)(
  'actual source refuses %s container identity',
  async (fault) => {
    const source = fixture();
    const container = source.inspect[0];
    if (fault === 'name') container.Name = '/wbs-prod-src';
    if (fault === 'stopped') container.State.Running = false;
    if (fault === 'mount')
      container.Mounts = [
        { Type: 'bind', Source: '/home/puni1/wbs-prod/src', Destination: '/src' },
      ];
    if (fault === 'network')
      container.NetworkSettings.Networks = {
        production: {},
      } as unknown as typeof container.NetworkSettings.Networks;
    if (fault === 'runtime') container.Config.Cmd = ['bun', 'run', 'production'];
    writeFileSync(
      source.settings,
      JSON.stringify({
        inspect: fault === 'empty' ? [] : fault === 'malformed' ? {} : source.inspect,
      }),
    );
    await expectFailure(
      collectProbe({
        readHealth: createSshHealthReader(source.executable),
        publication,
        producerVersion: 'test',
      }),
    );
  },
);

test.each(['old', 'future', 'malformed'] as const)(
  'actual source refuses %s measurement',
  async (mode) => {
    const source = fixture();
    writeFileSync(source.settings, JSON.stringify({ inspect: source.inspect, mode }));
    await expectFailure(
      collectProbe({
        readHealth: createSshHealthReader(source.executable),
        publication,
        producerVersion: 'test',
      }),
    );
  },
);

test('actual process deadline kills blocked SSH child', async () => {
  const source = fixture();
  writeFileSync(source.settings, JSON.stringify({ inspect: source.inspect, mode: 'blocked' }));
  const observation = await collectProbe({
    readHealth: createSshHealthReader(source.executable),
    publication,
    producerVersion: 'test',
    deadlineMs: 100,
  });
  expect(observation.reason).toBe('deadline');
  const pid = Number(readFileSync(join(source.directory, 'pid'), 'utf8'));
  expect(() => process.kill(pid, 0)).toThrow();
});

test('missing SSH executable is required tool failure', async () => {
  await expectFailure(
    collectProbe({
      readHealth: createSshHealthReader('/does-not-exist/puni-ssh'),
      publication,
      producerVersion: 'test',
    }),
  );
});

test('checkpoint first start is explicit and missing/malformed state throws', () => {
  const source = fixture();
  const path = join(source.directory, 'checkpoint');
  expect(() => readCheckpoint(path)).toThrow();
  expect(readCheckpoint(path, true)).toBeUndefined();
  expect(() => readCheckpoint(path, true)).toThrow();
  writeFileSync(path, JSON.stringify({ state: 'corrupt' }));
  expect(() => readCheckpoint(path)).toThrow();
  writeFileSync(path, '{}');
  expect(() => readCheckpoint(path)).toThrow();
  writeFileSync(path, 'x'.repeat(8193));
  expect(() => readCheckpoint(path)).toThrow('size');
});

test('checkpoint roundtrips bounded observation and rejects future time', async () => {
  const source = fixture();
  const path = join(source.directory, 'checkpoint');
  const server = source.serveHealth(() => Response.json({ status: 'ok', commit: revision }));
  try {
    const observation = await collectProbe({
      readHealth: createSshHealthReader(source.executable),
      publication,
      producerVersion: 'test',
    });
    writeCheckpoint(path, observation);
    expect(readCheckpoint(path)).toEqual(observation);
    expect(() => {
      writeCheckpoint(path, { ...observation, producerVersion: 'x'.repeat(8193) });
    }).toThrow('size');
    expect(readCheckpoint(path)).toEqual(observation);
    const future = Date.now() + 10000;
    writeFileSync(
      path,
      JSON.stringify({
        ...observation,
        startedAt: future,
        finishedAt: future,
        observedAt: future,
        requestStartedAt: future,
        requestFinishedAt: future,
      }),
    );
    expect(() => readCheckpoint(path)).toThrow();
    source.assertRequests();
  } finally {
    await server.stop(true);
  }
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

test('unreadable checkpoint throws instead of starting empty', () => {
  const source = fixture();
  const path = join(source.directory, 'unreadable');
  writeFileSync(path, JSON.stringify({ state: 'empty' }));
  chmodSync(path, 0);
  try {
    expect(() => readCheckpoint(path)).toThrow();
  } finally {
    chmodSync(path, 0o600);
  }
});

test.each([
  ['invalid-health', () => Response.json({ status: 'ok', commit: 'HEAD' })],
  ['malformed-health', () => new Response('invalid')],
  ['response-size', () => new Response('x'.repeat(4097))],
  ['http-status', () => new Response('private-cookie', { status: 500 })],
] as const)('fixed remote stdin rejects actual %s response', async (reason, fetch) => {
  const source = fixture();
  const server = source.serveHealth(fetch);
  try {
    const observation = await collectProbe({
      readHealth: createSshHealthReader(source.executable),
      publication,
      producerVersion: 'test',
    });
    expect(observation.success).toBe(false);
    expect(observation.reason).toBe(reason);
    expect(JSON.stringify(encodeOtlp(observation))).not.toContain('private-cookie');
    source.assertRequests();
  } finally {
    await server.stop(true);
  }
});

test('fixed remote revision guard independently emits modeled invalid-health before translation', async () => {
  const source = fixture();
  const server = source.serveHealth(() => Response.json({ status: 'ok', commit: 'HEAD' }));
  try {
    const outcome = await collectProbe({
      readHealth: createSshHealthReader(source.executable),
      publication,
      producerVersion: 'test',
    }).then(
      () => 'completed',
      () => 'rejected',
    );
    // Observe actual fixed-stdin stdout even if its outer boundary correctly refuses the corrupted measurement.
    const measured: unknown = JSON.parse(readFileSync(source.measurementPath, 'utf8'));
    expect(measured).toMatchObject({ success: false, revision: null, reason: 'invalid-health' });
    expect(outcome).toBe('completed');
    source.assertRequests();
  } finally {
    await server.stop(true);
  }
});

test('recreated dev name cannot replace the already inspected container ID', async () => {
  const source = fixture();
  writeFileSync(source.settings, JSON.stringify({ inspect: source.inspect, mode: 'recreated' }));
  const server = source.serveHealth(() => Response.json({ status: 'ok', commit: revision }));
  try {
    const observation = await collectProbe({
      readHealth: createSshHealthReader(source.executable),
      publication,
      producerVersion: 'test',
    });
    expect(observation.revision).toBe(revision);
    expect(observation.source).toMatchObject({
      kind: 'ssh-dev-container',
      containerId: 'd'.repeat(64),
    });
    expect(readFileSync(source.argumentsPath, 'utf8')).toContain('d'.repeat(64));
    expect(readFileSync(source.settings, 'utf8')).toContain('e'.repeat(64));
    source.assertRequests();
  } finally {
    await server.stop(true);
  }
});

test('malformed Docker ID is refused before exec', async () => {
  const source = fixture();
  source.inspect[0].Id = 'not-an-id; foreign-command';
  writeFileSync(source.settings, JSON.stringify({ inspect: source.inspect }));
  await expectFailure(
    collectProbe({
      readHealth: createSshHealthReader(source.executable),
      publication,
      producerVersion: 'test',
    }),
  );
  expect(readFileSync(source.argumentsPath, 'utf8')).toContain('inspect');
});

test('failed actual inspection emits root failure without an unmeasured HTTP child', async () => {
  const source = fixture();
  writeFileSync(
    source.settings,
    JSON.stringify({ inspect: source.inspect, mode: 'inspect-failure' }),
  );
  const observation = await collectProbe({
    readHealth: createSshHealthReader(source.executable),
    publication,
    producerVersion: 'test',
  });
  expect(observation.reason).toBe('source-unavailable');
  expect(observation.requestDurationMs).toBeNull();
  const encoded = encodeOtlp(observation);
  const spans = encoded.traces.resourceSpans[0].scopeSpans[0].spans;
  expect(spans).toHaveLength(1);
  expect(spans[0]).toMatchObject({ name: 'dev health observation', kind: 1, status: { code: 2 } });
  expect(JSON.stringify(spans)).not.toContain('http.request.method');
  expect(JSON.stringify(spans)).not.toContain('url.path');
  expect(JSON.stringify(encoded.metrics)).not.toContain('puni_dev_probe_duration_seconds');
  expect(readFileSync(source.argumentsPath, 'utf8')).toContain('inspect');
});
