import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

import { syntheticContainer } from '../../test/edge-init-fixture';
import { packetFixture } from '../../test/edge-init-observer-fixture';
import { fingerprint, parseNativeContainer } from './edge-init';
import {
  checkGraph,
  checkInheritedInitLocks,
  checkInitProcess,
  checkRouteCoverage,
  checkStoppedUnit,
  decodeInitPacket,
  INIT_NATIVE_READER,
  operationExpiry,
  probeHttp,
  resolveDefaultRoute,
  runProductionInitAdoption,
} from './edge-init-observer';
import { AUTHORITY_COLLECTOR } from './installed-authority-collector';
import { withCanonicalLock } from './lock';
import { SOLVER_UNIT_PROPERTIES } from './solver-unit-observation';

const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

test('production packet boundary rejects an unknown field without echoing private bytes', () => {
  expect(() => decodeInitPacket({ password: 'private-secret-marker' })).toThrow('packet-invalid');
});

test('closed packet decodes independent pins and rejects target, probe, graph and lock expansion', () => {
  const { packet } = packetFixture();
  expect(decodeInitPacket(packet).nonce).toBe('fixture');
  expect(() => decodeInitPacket({ ...packet, unknown: 'private-secret-marker' })).toThrow(
    'packet-invalid',
  );
  for (const mutate of [
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.targets.reverse();
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.targets[1].id = packet.targets[0].id;
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.public.probes[0].address.connectAddress = 'lookup.invalid';
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.public.probes[0].path = '//escape.invalid/';
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.public.probes.push(packet.public.probes[0]);
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.registry.repository = '../escape';
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.registry.credentials.mode = 0o644;
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.caddy.files[0].path = '/outside/Caddyfile';
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.quiescence.locks[1].descriptor = packet.quiescence.locks[0].descriptor;
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.quiescence.locks.reverse();
    },
    (packet: ReturnType<typeof packetFixture>['packet']) => {
      packet.quiescence.bootId = '87654321-1234-1234-1234-123456789abc';
    },
  ]) {
    const fault = structuredClone(packet);
    mutate(fault);
    expect(() => decodeInitPacket(fault)).toThrow();
  }
});

test('operation validity refuses future, expired, malformed and overlong authority without extending time', () => {
  const now = Date.now(),
    issued = new Date(now - 1000).toISOString(),
    expiry = new Date(now + 600000).toISOString();
  expect(operationExpiry(issued, expiry, now, 123)).toBe(600123);
  expect(() => operationExpiry(new Date(now + 1).toISOString(), expiry, now, 123)).toThrow();
  expect(() => operationExpiry(issued, new Date(now).toISOString(), now, 123)).toThrow();
  expect(() => operationExpiry(issued, 'malformed', now, 123)).toThrow();
  expect(() => operationExpiry(issued, new Date(now + 1800000).toISOString(), now, 123)).toThrow();
});

test('native inherited-lock admission refuses an independently opened descriptor and wrong inode', async () => {
  const root = await mkdtemp('/tmp/edge-init-lock-'),
    lock = join(root, 'lock');
  try {
    await writeFile(lock, '');
    await withCanonicalLock(lock, async (descriptor) => {
      const metadata = await lstat(lock, { bigint: true });
      const expected = {
        path: lock,
        descriptor,
        device: String(metadata.dev),
        inode: String(metadata.ino),
      };
      await checkInheritedInitLocks([expected]);
      const independent = await open(lock, 'r+');
      try {
        await rejects(checkInheritedInitLocks([{ ...expected, descriptor: independent.fd }]));
      } finally {
        await independent.close();
      }
      await rejects(checkInheritedInitLocks([{ ...expected, inode: '0' }]));
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('native init admission refuses changed executable, missing PID one and altered command', () => {
  const native = {
    executableSha256: 'a'.repeat(64),
    cmdline: '/sbin/docker-init\0--\0caddy\0run\0',
    status: 'Name:\tdocker-init\nNSpid:\t123\t1\n',
  };
  checkInitProcess(native, 'a'.repeat(64));
  expect(() => {
    checkInitProcess({ ...native, executableSha256: 'b'.repeat(64) }, 'a'.repeat(64));
  }).toThrow();
  expect(() => {
    checkInitProcess({ ...native, status: 'NSpid:\t123\t2\n' }, 'a'.repeat(64));
  }).toThrow();
  expect(() => {
    checkInitProcess({ ...native, cmdline: 'caddy\0run\0' }, 'a'.repeat(64));
  }).toThrow();
});

test('native stopped-unit projection refuses queued jobs, ControlPID, resumed unit and byte drift', () => {
  const fields = Object.fromEntries(SOLVER_UNIT_PROPERTIES.map((key) => [key, '']));
  Object.assign(fields, {
    MainPID: '0',
    ControlPID: '0',
    RestartPreventExitStatus: '78',
    ActiveState: 'inactive',
    SubState: 'dead',
  });
  const stdout = (fields: Record<string, string>) =>
    Object.entries(fields)
      .map(([key, value]) => key + '=' + value)
      .join('\n') + '\n';
  const digest = fingerprint(fields);
  checkStoppedUnit(stdout(fields), digest);
  const faults: Record<string, string>[] = [
    { Job: '123' },
    { ControlPID: '42' },
    { ActiveState: 'activating' },
    { ExecStart: 'changed legacy argv' },
  ];
  for (const fault of faults)
    expect(() => {
      checkStoppedUnit(stdout({ ...fields, ...fault }), digest);
    }).toThrow();
  const queued = { ...fields, Job: '123' };
  expect(() => {
    checkStoppedUnit(stdout(queued), fingerprint(queued));
  }).toThrow('solver-not-drained');
});

test('route coverage refuses omitted server/route, wrong host, cross-route probe and live-only changes', () => {
  const { packet, configuration } = packetFixture();
  const checked = decodeInitPacket(packet);
  checkRouteCoverage(configuration, checked.caddy.routeInventory, checked.public);
  expect(() => {
    checkRouteCoverage(configuration, [], checked.public);
  }).toThrow();
  expect(() => {
    checkRouteCoverage(
      { apps: { http: { servers: {} } } },
      checked.caddy.routeInventory,
      checked.public,
    );
  }).toThrow();
  expect(() => {
    checkRouteCoverage(
      configuration,
      [{ ...checked.caddy.routeInventory[0], hosts: [] }],
      checked.public,
    );
  }).toThrow();
  expect(() => {
    checkRouteCoverage(configuration, checked.caddy.routeInventory, {
      ...checked.public,
      probes: [{ ...checked.public.probes[0], routeId: '0'.repeat(64) }],
    });
  }).toThrow();
  const live = structuredClone(configuration);
  live.apps.http.servers.edge.routes[0].handle[0].body = 'changed';
  expect(() => {
    checkRouteCoverage(live, checked.caddy.routeInventory, checked.public);
  }).toThrow();
  const extraServer = {
    ...configuration.apps.http.servers,
    uncovered: {
      listen: [':80'],
      routes: [{ handle: [{ handler: 'static_response', body: 'uncovered' }] }],
    },
  };
  expect(() => {
    checkRouteCoverage({ apps: { http: { servers: extraServer } } }, checked.caddy.routeInventory, {
      ...checked.public,
      routesSha256: fingerprint({ servers: extraServer, inventory: checked.caddy.routeInventory }),
    });
  }).toThrow('route-coverage-incomplete');
});

test('kernel route admission refuses an absent or ambiguous native endpoint', () => {
  const container = syntheticContainer();
  container.NetworkSettings.Networks.edge.Gateway = '172.18.0.1';
  container.NetworkSettings.Networks.edge.IPAddress = '172.18.0.2';
  container.NetworkSettings.Networks.edge.IPPrefixLen = 16;
  const native = {
    route:
      'Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT\neth0 00000000 010012AC 0003 0 0 0 00000000 0 0 0\n',
    ipv6Route: '',
  };
  expect(resolveDefaultRoute(native, parseNativeContainer(container))).toBe('c'.repeat(64));
  expect(() =>
    resolveDefaultRoute(
      { ...native, route: native.route.split('\n')[0] + '\n' },
      parseNativeContainer(container),
    ),
  ).toThrow();
  const observed = parseNativeContainer(container);
  observed.networks['other'] = {
    ...container.NetworkSettings.Networks.edge,
    NetworkID: 'd'.repeat(64),
  };
  expect(() => resolveDefaultRoute(native, observed)).toThrow('default-route-ambiguous');
});

test('real graph IO rejects changed bytes, unknown member and unreadable configuration', async () => {
  const root = await mkdtemp('/tmp/edge-init-graph-');
  const file = join(root, 'Caddyfile');
  await writeFile(file, 'fixture.invalid { respond "fixed" }\n');
  const directory = await lstat(root, { bigint: true }),
    metadata = await lstat(file, { bigint: true });
  const graph = {
    ...decodeInitPacket(packetFixture().packet).caddy,
    root: file,
    directoryDevice: String(directory.dev),
    directoryInode: String(directory.ino),
    files: [
      {
        path: file,
        device: String(metadata.dev),
        inode: String(metadata.ino),
        mode: Number(metadata.mode & 0o7777n),
        uid: Number(metadata.uid),
        sha256: digest(await readFile(file, 'utf8')),
      },
    ],
    directoryEntriesSha256: fingerprint([{ name: 'Caddyfile', kind: 'file' }]),
  };
  graph.importGraphSha256 = fingerprint({
    root: file,
    files: graph.files.map(({ path, sha256 }) => ({ path, sha256 })),
  });
  try {
    await checkGraph(graph);
    await writeFile(file, 'changed');
    await rejects(checkGraph(graph), /caddy-graph-differs/);
    await writeFile(file, 'fixture.invalid { respond "fixed" }\n');
    await writeFile(join(root, 'unknown'), 'extra');
    await rejects(checkGraph(graph), /caddy-graph-differs/);
    await rm(join(root, 'unknown'));
    await chmod(file, 0);
    await rejects(checkGraph(graph));
  } finally {
    await chmod(file, 0o600);
    await rm(root, { recursive: true, force: true });
  }
});

test('actual native-reader process binds start ticks and refuses PID reuse during reading', async () => {
  const program =
    AUTHORITY_COLLECTOR +
    '\n' +
    INIT_NATIVE_READER +
    String.raw`
host=Host(time.monotonic()+5)
observed=init_proc(host,os.getpid())
require(observed['pid']==os.getpid() and observed['startTime'].isdigit(),'owned PID not observed')
class Recycled(Host):
    def __init__(self):super().__init__(time.monotonic()+5);self.reads=0
    def read(self,path,limit):
        content=super().read(path,limit)
        if path.endswith('/stat'):
            self.reads+=1
            if self.reads>1:
                end=content.rfind(b') ');fields=content[end+2:].split();fields[19]=str(int(fields[19])+1).encode();content=content[:end+2]+b' '.join(fields)
        return content
try:init_proc(Recycled(),os.getpid())
except Refusal:print('recycled-refused')
else:raise RuntimeError('recycled PID was admitted')
`;
  const child = Bun.spawn(['/usr/bin/python3', '-I', '-c', program], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe('');
  expect(code).toBe(0);
  expect(stdout).toBe('recycled-refused\n');
});

test('production factory rejects a non-private packet with redacted diagnostics', async () => {
  await rejects(runProductionInitAdoption('/no-such-private-secret-marker', 'prepare'), {
    message: 'edge Init adoption refused: preparation-failed',
  });
});

test('real HTTP probe binds raw body, status and exact redirect without following it', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/stall') return;
    if (request.url === '/large') {
      response.end(Buffer.alloc(5 * 1048576));
      return;
    }
    if (request.url === '/encoded') {
      response.setHeader('Content-Encoding', 'gzip');
      response.end('fixed body');
      return;
    }
    response.writeHead(302, { Location: '/next' });
    response.end('fixed body');
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('fixture port unavailable');
  const probe = {
    kind: 'http' as const,
    id: 'a',
    routeId: 'a'.repeat(64),
    scheme: 'http' as const,
    address: { host: 'fixture.invalid', connectAddress: '127.0.0.1', port: address.port },
    path: '/',
    expectedStatus: 302,
    expectedLocation: '/next',
    expectedContentType: null,
    expectedBodySha256: digest('fixed body'),
  };
  try {
    await probeHttp(probe, 1000);
    await rejects(
      probeHttp({ ...probe, expectedBodySha256: digest('changed') }, 1000),
      /probe-refused/,
    );
    await rejects(probeHttp({ ...probe, expectedLocation: null }, 1000), /probe-refused/);
    await rejects(probeHttp({ ...probe, expectedStatus: 200 }, 1000), /probe-refused/);
    await rejects(probeHttp({ ...probe, path: '/large' }, 1000), /probe-refused/);
    await rejects(probeHttp({ ...probe, path: '/encoded' }, 1000), /probe-refused/);
    await rejects(probeHttp({ ...probe, path: '/stall' }, 20), /probe-refused/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((cause) => {
        if (cause) reject(cause);
        else resolve();
      }),
    );
  }
});

test('real TLS, registry and WSS probes reject wrong name, connect IP, challenge, digest and upgrade accept', async () => {
  const root = await mkdtemp('/tmp/edge-init-tls-');
  const certificate = join(root, 'cert.pem'),
    key = join(root, 'key.pem'),
    privatePacket = join(root, 'packet.json');
  const generator = Bun.spawn(
    [
      '/usr/bin/openssl',
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=fixture.invalid',
      '-addext',
      'subjectAltName=DNS:fixture.invalid',
      '-keyout',
      key,
      '-out',
      certificate,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [, , generated] = await Promise.all([
    new Response(generator.stdout).text(),
    new Response(generator.stderr).text(),
    generator.exited,
  ]);
  expect(generated).toBe(0);
  let fault = '',
    observedSni: string | false | null = '',
    observedAuthorization = '';
  const sockets = new Set<Socket>();
  const manifest = '{"schemaVersion":2}',
    manifestDigest = 'sha256:' + digest(manifest);
  const server = createHttpsServer(
    { key: await readFile(key), cert: await readFile(certificate) },
    (request, response) => {
      observedAuthorization = String(request.headers.authorization);
      if (fault === 'challenge') {
        response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="private-secret-marker"' });
        response.end('private-secret-marker');
        return;
      }
      if (request.url === '/v2/') {
        response.setHeader('Docker-Distribution-Api-Version', 'registry/2.0');
        response.end('{}');
      } else if (request.url?.startsWith('/v2/')) {
        response.setHeader('Content-Type', 'application/vnd.oci.image.manifest.v1+json');
        response.setHeader(
          'Docker-Content-Digest',
          fault === 'digest' ? 'sha256:' + '0'.repeat(64) : manifestDigest,
        );
        response.end(fault === 'body' ? '{"schemaVersion":1}' : manifest);
      } else response.end('fixed');
    },
  );
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
    });
  });
  server.on('secureConnection', (socket) => {
    observedSni = socket.servername;
  });
  server.on('upgrade', (request, socket) => {
    const accept =
      fault === 'accept'
        ? 'wrong'
        : createHash('sha1')
            .update(
              String(request.headers['sec-websocket-key']) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
            )
            .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n',
    );
    socket.once('data', () => {
      socket.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture listener missing');
  const fixturePath = fileURLToPath(
    new URL('../../test/edge-init-observer-fixture.ts', import.meta.url),
  );
  const { packet } = packetFixture();
  packet.bundle.path = fixturePath;
  packet.public.probes[0].address.port = address.port;
  packet.public.probes[0].expectedBodySha256 = digest('fixed');
  packet.registry.address.port = address.port;
  packet.registry.manifestDigest = manifestDigest;
  packet.registry.v2BodySha256 = digest('{}');
  const credentialsPath = join(root, 'credentials.json');
  await writeFile(
    credentialsPath,
    JSON.stringify({ username: 'fixture', password: 'private-secret-marker' }),
    { mode: 0o600 },
  );
  const credentials = await lstat(credentialsPath, { bigint: true });
  packet.registry.credentials = {
    path: credentialsPath,
    sha256: digest(await readFile(credentialsPath, 'utf8')),
    device: String(credentials.dev),
    inode: String(credentials.ino),
    uid: Number(credentials.uid),
    mode: 0o600,
  };
  async function run(packet: unknown, mode = 'public', trusted = true) {
    await writeFile(privatePacket, JSON.stringify(packet), { mode: 0o600 });
    const child = Bun.spawn([process.execPath, fixturePath, privatePacket, mode], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, ...(trusted ? { NODE_EXTRA_CA_CERTS: certificate } : {}) },
      signal: AbortSignal.timeout(10000),
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  }
  try {
    expect((await run(packet)).code).toBe(0);
    expect(observedSni).toBe('fixture.invalid');
    expect((await run(packet, 'public', false)).code).not.toBe(0);
    const wrongName = structuredClone(packet);
    wrongName.public.probes[0].address.host = 'wrong.invalid';
    expect((await run(wrongName)).code).not.toBe(0);
    const wrongIp = structuredClone(packet);
    wrongIp.public.probes[0].address.connectAddress = '127.0.0.2';
    expect((await run(wrongIp)).code).not.toBe(0);
    expect((await run(packet, 'registry')).code).toBe(0);
    expect(observedAuthorization).toBe(
      'Basic ' + Buffer.from('fixture:private-secret-marker').toString('base64'),
    );
    await writeFile(
      credentialsPath,
      JSON.stringify({ username: 'fixture', password: 'substituted-private-marker' }),
    );
    const changedSource = await run(packet, 'registry');
    expect(changedSource.code).not.toBe(0);
    expect(changedSource.stderr).not.toContain('substituted-private-marker');
    await writeFile(
      credentialsPath,
      JSON.stringify({ username: 'fixture', password: 'private-secret-marker' }),
    );
    fault = 'challenge';
    const challenge = await run(packet, 'registry');
    expect(challenge.code).not.toBe(0);
    expect(challenge.stderr).not.toContain('private-secret-marker');
    fault = 'digest';
    expect((await run(packet, 'registry')).code).not.toBe(0);
    fault = 'body';
    expect((await run(packet, 'registry')).code).not.toBe(0);
    fault = '';
    const websocket = {
      ...packet,
      public: {
        ...packet.public,
        probes: [
          {
            kind: 'websocket',
            id: 'wss',
            routeId: 'c'.repeat(64),
            address: { host: 'fixture.invalid', connectAddress: '127.0.0.1', port: address.port },
            path: '/',
            origin: null,
            requestedProtocol: null,
            expectedProtocol: null,
          },
        ],
      },
    };
    expect((await run(websocket)).code).toBe(0);
    fault = 'accept';
    expect((await run(websocket)).code).not.toBe(0);
  } finally {
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((cause) => {
        if (cause) reject(cause);
        else resolve();
      }),
    );
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
