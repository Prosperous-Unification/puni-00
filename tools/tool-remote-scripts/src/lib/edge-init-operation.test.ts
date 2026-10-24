import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { syntheticContainer } from '../../test/edge-init-fixture';
import { describeInitRefusal } from '../adopt-edge-init';
import {
  constructCandidate,
  CREATED_PROFILE,
  fingerprint,
  InitRefusal,
  type InvariantContext,
  parseNativeContainer,
  projectInvariant,
} from './edge-init';
import {
  type CaddyReadBinding,
  Deadline,
  EngineTransport,
  observeNetworks,
  PrivateReceipts,
  readInitDiagnostic,
  runInitAdoption,
} from './edge-init-operation';

const roots: string[] = [];
afterEach(async () => {
  await Promise.resolve();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'edge-init-'));
  roots.push(root);
  return root;
}

test('private receipt publication is exclusive, chained, durable and hash only', async () => {
  await Promise.resolve();
  const root = await directory();
  const receipts = await PrivateReceipts.create(join(root, 'attempt'), 'synthetic');
  const first = await receipts.publish({
    stage: 'create-intended',
    target: 'registry',
    original: 'a'.repeat(64),
    remaining: 270000,
  });
  const second = await receipts.publish({
    stage: 'candidate-verified',
    target: 'registry',
    original: 'a'.repeat(64),
    candidate: 'b'.repeat(64),
    remaining: 260000,
  });
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(second).not.toBe(first);
  const files = (await readdir(join(root, 'attempt'))).sort();
  expect(files).toHaveLength(2);
  const secondReceipt: unknown = JSON.parse(
    await readFile(join(root, 'attempt', files[1]), 'utf8'),
  );
  expect(secondReceipt).toMatchObject({ previous: first });
  expect(PrivateReceipts.create(join(root, 'attempt'), 'synthetic')).rejects.toThrow();
});

test('deadline refuses a transition without its full budget and readback reserve', () => {
  let now = 0;
  const deadline = new Deadline(300000, () => now);
  expect(deadline.allocate(20000)).toBe(20000);
  now = 250001;
  expect(() => deadline.allocate(20000)).toThrow();
});

test('Engine transport sends t=-1 once and forbids unrelated IDs and mutation routes', async () => {
  await Promise.resolve();
  const root = await directory();
  const socket = join(root, 'engine.sock');
  const transcript: string[] = [];
  const server = createServer((request, response) => {
    transcript.push(`${String(request.method)} ${String(request.url)}`);
    response.writeHead(204);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  try {
    const engine = new EngineTransport(socket, ['a'.repeat(64)], 'synthetic');
    await engine.stop('a'.repeat(64), 1000);
    expect(engine.stop('c'.repeat(64), 1000)).rejects.toThrow();
    const fixture = new EngineTransport(socket, ['a'.repeat(64)], 'synthetic', 'owned-fixture');
    expect(fixture.rename('a'.repeat(64), 'wbs-registry-1', 1000)).rejects.toThrow();
    expect(transcript).toEqual([`POST /v1.52/containers/${'a'.repeat(64)}/stop?t=-1`]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  }
});

test.each(['body', 'timeout'])(
  'Engine refuses %s without leaking an Engine secret or retrying',
  async (fault) => {
    await Promise.resolve();
    const root = await directory();
    const socket = join(root, 'engine.sock');
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      if (fault === 'timeout') return;
      response.writeHead(500);
      response.end('PRIVATE_ENGINE_SECRET_SENTINEL');
    });
    await new Promise<void>((resolve) => server.listen(socket, resolve));
    try {
      const engine = new EngineTransport(socket, ['a'.repeat(64)], 'synthetic');
      let observed: unknown;
      try {
        await engine.stop('a'.repeat(64), 30);
      } catch (cause) {
        observed = cause;
      }
      expect(observed).toBeInstanceOf(Error);
      expect(String(observed)).not.toContain('PRIVATE_ENGINE_SECRET_SENTINEL');
      expect(requests).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
    }
  },
);

test('Engine read discovery never authorizes a mutation and Caddy Exec is fixed and terminal', async () => {
  const root = await directory();
  const socket = join(root, 'engine.sock');
  const transcript: string[] = [];
  const execBodies: unknown[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on('end', () => {
      transcript.push(`${String(request.method)} ${String(request.url)}`);
      if (request.url?.endsWith('/exec') === true) {
        execBodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        response.writeHead(201);
        response.end(JSON.stringify({ Id: 'f'.repeat(64) }));
        return;
      }
      if (request.url?.endsWith('/start') === true) {
        const body = Buffer.from('{}');
        const header = Buffer.alloc(8);
        header[0] = 1;
        header.writeUInt32BE(body.length, 4);
        response.end(Buffer.concat([header, body]));
        return;
      }
      if (request.url?.includes('/exec/') === true) {
        response.end(
          JSON.stringify({
            ID: 'f'.repeat(64),
            ContainerID: 'b'.repeat(64),
            Running: false,
            ExitCode: 0,
          }),
        );
        return;
      }
      response.end(JSON.stringify([{ Id: 'c'.repeat(64) }]));
    });
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  try {
    const engine = new EngineTransport(socket, ['a'.repeat(64), 'b'.repeat(64)], 'synthetic');
    await engine.inventory(1000);
    expect(engine.stop('c'.repeat(64), 1000)).rejects.toThrow();
    expect(engine.execCaddy('a'.repeat(64), 'adapt', 1000)).rejects.toThrow();
    expect(await engine.execCaddy('b'.repeat(64), 'adapt', 1000)).toBe('{}');
    expect(execBodies).toEqual([
      {
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        Privileged: false,
        Cmd: ['caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
      },
    ]);
    expect(transcript.filter((entry) => entry.includes('/stop'))).toHaveLength(0);
    expect(transcript.some((entry) => entry.includes(`/containers/${'a'.repeat(64)}/exec`))).toBe(
      false,
    );
  } finally {
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  }
});

test.each(['stderr', 'nonterminal', 'foreign', 'truncated'])(
  'Caddy Exec refuses %s and exposes no private output',
  async (fault) => {
    const root = await directory();
    const socket = join(root, 'engine.sock');
    const server = createServer((request, response) => {
      if (request.url?.endsWith('/exec') === true) {
        response.writeHead(201);
        response.end(JSON.stringify({ Id: 'f'.repeat(64) }));
        return;
      }
      if (request.url?.endsWith('/start') === true) {
        const body = Buffer.from('PRIVATE_EXEC_SENTINEL');
        const header = Buffer.alloc(8);
        header[0] = fault === 'stderr' ? 2 : 1;
        header.writeUInt32BE(body.length + (fault === 'truncated' ? 1 : 0), 4);
        response.end(Buffer.concat([header, body]));
        return;
      }
      response.end(
        JSON.stringify({
          ID: 'f'.repeat(64),
          ContainerID: (fault === 'foreign' ? 'c' : 'b').repeat(64),
          Running: fault === 'nonterminal',
          ExitCode: 0,
        }),
      );
    });
    await new Promise<void>((resolve) => server.listen(socket, resolve));
    try {
      const engine = new EngineTransport(socket, ['a'.repeat(64), 'b'.repeat(64)], 'synthetic');
      const failure = await engine.execCaddy('b'.repeat(64), 'adapt', 1000).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(failure).toBeInstanceOf(InitRefusal);
      expect(String(failure)).not.toContain('PRIVATE_EXEC_SENTINEL');
    } finally {
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
    }
  },
);

test('create flattens complete observed Config and admits null warnings without a pull or new resource request', async () => {
  const root = await directory();
  const socket = join(root, 'engine.sock');
  let posted: unknown;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on('end', () => {
      posted = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(201);
      response.end(JSON.stringify({ Id: 'f'.repeat(64), Warnings: null }));
    });
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  try {
    const engine = new EngineTransport(socket, ['a'.repeat(64), 'b'.repeat(64)], 'synthetic');
    const candidate = constructCandidate(parseNativeContainer(syntheticContainer()));
    expect(await engine.create('registry', candidate, 1000)).toBe('f'.repeat(64));
    expect(posted).toEqual({
      ...syntheticContainer().Config,
      Image: `sha256:${'b'.repeat(64)}`,
      HostConfig: { ...syntheticContainer().HostConfig, Init: true },
      NetworkingConfig: {
        EndpointsConfig: {
          ['c'.repeat(64)]: {
            Aliases: ['registry'],
            IPAMConfig: null,
            Links: null,
            DriverOpts: null,
            GwPriority: 0,
          },
        },
      },
    });
  } finally {
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  }
});

test.each([
  'none',
  'candidate-drift',
  'stop-uncertain',
  'health-failed',
  'receipt-failed',
  'profile',
  'profile-running-false',
  'profile-source-false',
  'profile-other-field',
  'profile-inert-running',
  'profile-network-id',
  'profile-network-name',
  'profile-network-config',
  'profile-network-member',
  'profile-network-changed',
])(
  'finite sequence retains originals on %s and removes only after both health rounds',
  async (fault) => {
    await Promise.resolve();
    const original = syntheticContainer();
    if (fault.startsWith('profile'))
      Object.assign(original.HostConfig, {
        OomKillDisable: fault === 'profile-source-false' ? false : null,
      });
    const caddy = structuredClone(original);
    caddy.Id = 'e'.repeat(64);
    caddy.Name = '/wbs-caddy-1';
    const containers = new Map([original, caddy].map((entry) => [entry.Id, entry]));
    const effects: string[] = [];
    const stages: string[] = [];
    let clock = 0;
    let created = 0;
    const inspect = async (id: string) => {
      await Promise.resolve();
      const observed = containers.get(id);
      if (observed === undefined) throw new Error('absent');
      return parseNativeContainer(observed);
    };
    const networkReply = (byName: boolean) => {
      const fields: Record<string, unknown> = {
        Id: 'c'.repeat(64),
        Name: 'edge',
        Driver: 'bridge',
        Containers: {},
      };
      if (byName && fault === 'profile-network-id') fields['Id'] = 'f'.repeat(64);
      if (byName && fault === 'profile-network-name') fields['Name'] = 'foreign';
      if (byName && fault === 'profile-network-config') fields['Driver'] = 'changed';
      if (byName && fault === 'profile-network-member')
        fields['Containers'] = { ['b'.repeat(64)]: { Name: 'candidate' } };
      if (byName && fault === 'profile-network-changed')
        containers.get('b'.repeat(64))?.NetworkSettings.Networks.edge.Aliases.push('changed');
      return fields;
    };
    const engine = {
      inspect,
      network: () => Promise.resolve(networkReply(false)),
      networkByName: () => Promise.resolve(networkReply(true)),
      create: async (kind: string, request: ReturnType<typeof constructCandidate>) => {
        await Promise.resolve();
        effects.push(`create:${kind}`);
        if (fault.startsWith('profile')) expect(request.HostConfig['OomKillDisable']).toBe(null);
        const observed = structuredClone(kind === 'registry' ? original : caddy);
        observed.Id = (++created === 1 ? 'b' : 'f').repeat(64);
        observed.Name = `/wbs-init-synthetic-${kind}`;
        observed.Config.Image = observed.Image;
        observed.HostConfig.Init = true;
        Object.assign(observed.State, {
          Status: 'created',
          Running: false,
          Pid: 0,
          StartedAt: '0001-01-01T00:00:00Z',
        });
        if (fault.startsWith('profile')) {
          Object.assign(observed.HostConfig, { OomKillDisable: false });
          observed.NetworkSettings.Networks.edge.NetworkID = '';
        }
        if (fault === 'profile-inert-running') Object.assign(observed.State, { Running: true });
        if (fault === 'profile-other-field') observed.HostConfig.Init = false;
        if (fault === 'candidate-drift') observed.Config.Env.reverse();
        containers.set(observed.Id, observed);
        return observed.Id;
      },
      stop: async (id: string) => {
        await Promise.resolve();
        effects.push(`stop:${id}`);
        if (fault === 'stop-uncertain') throw new Error('SECRET');
        const observed = containers.get(id);
        if (observed === undefined) throw new Error('missing');
        Object.assign(observed.State, { Status: 'exited', Running: false, Pid: 0 });
      },
      rename: async (id: string, name: string) => {
        await Promise.resolve();
        effects.push(`rename:${id}`);
        const observed = containers.get(id);
        if (observed === undefined) throw new Error('missing');
        observed.Name = `/${name}`;
      },
      start: async (id: string) => {
        await Promise.resolve();
        effects.push(`start:${id}`);
        const observed = containers.get(id);
        if (observed === undefined) throw new Error('missing');
        if (fault.startsWith('profile')) {
          Object.assign(observed.HostConfig, {
            OomKillDisable: fault === 'profile-running-false' ? false : null,
          });
          observed.NetworkSettings.Networks.edge.NetworkID = 'c'.repeat(64);
        }
        Object.assign(observed.State, {
          Status: 'running',
          Running: true,
          Pid: 567,
          StartedAt: '2026-01-02T00:00:00Z',
        });
      },
      remove: async (id: string) => {
        await Promise.resolve();
        effects.push(`remove:${id}`);
        containers.delete(id);
      },
    };
    const verify = () => Promise.resolve();
    const observer = {
      admit: verify,
      original: verify,
      inert: verify,
      stopped: verify,
      running: verify,
      health: async () => {
        await Promise.resolve();
        if (fault === 'health-failed') throw new Error('SECRET');
      },
      combined: async () => {
        await Promise.resolve();
        stages.push('combined');
      },
      absent: async (id: string) => {
        await Promise.resolve();
        expect(containers.has(id)).toBe(false);
      },
    };
    const operation = runInitAdoption(
      {
        nonce: 'synthetic',
        ...(fault.startsWith('profile') ? { invariantProfile: CREATED_PROFILE } : {}),
        targets: [
          {
            kind: 'registry',
            original: parseNativeContainer(original),
            networks: [
              {
                name: 'edge',
                id: 'c'.repeat(64),
                sha256: fingerprint({ Id: 'c'.repeat(64), Name: 'edge', Driver: 'bridge' }),
              },
            ],
          },
          {
            kind: 'caddy',
            original: parseNativeContainer(caddy),
            networks: [
              {
                name: 'edge',
                id: 'c'.repeat(64),
                sha256: fingerprint({ Id: 'c'.repeat(64), Name: 'edge', Driver: 'bridge' }),
              },
            ],
          },
        ],
      },
      engine,
      observer,
      {
        publish: async (receipt) => {
          await Promise.resolve();
          stages.push(receipt.stage);
          if (fault === 'receipt-failed') throw new Error('SECRET');
          return '0'.repeat(64);
        },
      },
      {
        now: () => clock,
        sleep: async (milliseconds) => {
          await Promise.resolve();
          clock += milliseconds;
        },
      },
    );
    if (fault === 'none' || fault === 'profile') {
      await operation;
      expect(effects).toEqual([
        'create:registry',
        `stop:${original.Id}`,
        `rename:${original.Id}`,
        `rename:${'b'.repeat(64)}`,
        `start:${'b'.repeat(64)}`,
        'create:caddy',
        `stop:${caddy.Id}`,
        `rename:${caddy.Id}`,
        `rename:${'f'.repeat(64)}`,
        `start:${'f'.repeat(64)}`,
        `remove:${original.Id}`,
        `remove:${caddy.Id}`,
      ]);
      expect(stages.filter((stage) => stage === 'healthy')).toHaveLength(2);
      expect(stages.indexOf('combined')).toBeLessThan(stages.indexOf('remove-intended'));
    } else {
      const failure = await operation.then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(failure).toBeInstanceOf(InitRefusal);
      expect(String(failure)).not.toContain('SECRET');
      expect(effects.some((effect) => effect.startsWith('remove:'))).toBe(false);
      expect(containers.has(original.Id)).toBe(true);
      if (fault === 'profile-source-false') {
        expect(effects).toEqual([]);
        expect(readInitDiagnostic(failure)).toBeUndefined();
      }
      if (fault === 'receipt-failed') {
        expect(failure).toMatchObject({ reason: 'before-create-receipt-publication-failed' });
        expect(readInitDiagnostic(failure)).toBeUndefined();
        expect(Object.getOwnPropertySymbols(failure)).toEqual([]);
        expect(Reflect.ownKeys(failure as object)).not.toContain('cause');
      }
      if (fault.startsWith('profile-network')) expect(effects).toEqual(['create:registry']);
      if (
        fault === 'candidate-drift' ||
        fault === 'receipt-failed' ||
        fault === 'profile-other-field' ||
        fault === 'profile-inert-running'
      )
        expect(effects.some((effect) => effect.startsWith('stop:'))).toBe(false);
      if (fault === 'stop-uncertain')
        expect(effects.some((effect) => effect.startsWith('rename:'))).toBe(false);
    }
  },
);

for (const fault of [
  'none',
  'profile',
  'profile-unknown',
  'profile-running-false',
  'live',
  'original',
  'nonce',
  'original-id',
  'crossed-id',
  'candidate-id',
  'binding-name',
  'hash',
  'invalid-hash',
  'command',
  'extra-binding',
  'budget',
  'unlisted',
  'duplicate-id',
  'duplicate-name',
  'list-name',
  'inspect-id',
  'inspect-name',
  'registry-role',
  'env',
  'image',
  'init',
  'mount',
  'alias',
  'pid-zero',
  'paused',
  'restarting',
  'post-pid',
  'post-start',
  'post-env',
  'post-name',
  'post-inventory',
  'deadline',
]) {
  test(`read-only Caddy observation binds ${fault} without widening effect authority`, async () => {
    const root = await directory();
    const socket = join(root, 'engine.sock');
    const registryId = 'a'.repeat(64),
      originalId = 'e'.repeat(64),
      candidateId = 'd'.repeat(64);
    const raw = syntheticContainer();
    raw.Id = fault === 'original' ? originalId : candidateId;
    raw.Name = '/wbs-caddy-1';
    raw.Config.Labels['com.docker.compose.service'] = 'caddy';
    raw.Config.Image = raw.Image;
    raw.HostConfig.Init = fault !== 'original';
    if (fault.startsWith('profile')) Object.assign(raw.HostConfig, { OomKillDisable: null });
    const binding: CaddyReadBinding = {
      id: raw.Id,
      originalId,
      candidateId: fault === 'original' ? null : candidateId,
      nonce: 'synthetic',
      name: '/wbs-caddy-1' as const,
      invariantSha256: fingerprint(projectInvariant(parseNativeContainer(raw))),
      ...(fault.startsWith('profile')
        ? {
            invariantContext: {
              profile: CREATED_PROFILE,
              owner: {
                role: 'replacement' as const,
                id: raw.Id,
                originalId,
                phase: 'running' as const,
              },
              networks: [{ name: 'edge', id: 'c'.repeat(64), sha256: '0'.repeat(64) }],
            },
          }
        : {}),
    };
    if (fault === 'profile-unknown')
      Object.assign(binding.invariantContext ?? {}, { profile: 'unknown' });
    if (fault === 'profile-running-false') Object.assign(raw.HostConfig, { OomKillDisable: false });
    if (fault === 'nonce') binding.nonce = 'other';
    if (fault === 'original-id') binding.originalId = registryId;
    if (fault === 'crossed-id') {
      binding.id = registryId;
      binding.candidateId = registryId;
    }
    if (fault === 'candidate-id') binding.candidateId = 'b'.repeat(64);
    if (fault === 'binding-name') Object.assign(binding, { name: '/wbs-registry-1' });
    if (fault === 'hash') binding.invariantSha256 = '0'.repeat(64);
    if (fault === 'invalid-hash') binding.invariantSha256 = 'PRIVATE_BINDING_SENTINEL';
    if (fault === 'extra-binding')
      Object.assign(binding, { privateExtra: 'PRIVATE_BINDING_SENTINEL' });
    if (fault === 'inspect-id') raw.Id = 'b'.repeat(64);
    if (fault === 'inspect-name') raw.Name = '/unrelated';
    if (fault === 'registry-role') {
      raw.Config.Labels['com.docker.compose.service'] = 'registry';
      binding.invariantSha256 = fingerprint(projectInvariant(parseNativeContainer(raw)));
    }
    if (fault === 'env') raw.Config.Env.reverse();
    if (fault === 'image') raw.Image = `sha256:${'f'.repeat(64)}`;
    if (fault === 'init') raw.HostConfig.Init = false;
    if (fault === 'mount') raw.Mounts[0].Source = '/unrelated';
    if (fault === 'alias') raw.NetworkSettings.Networks.edge.Aliases = ['changed'];
    if (fault === 'pid-zero') raw.State.Pid = 0;
    if (fault === 'paused') raw.State.Paused = true;
    if (fault === 'restarting') raw.State.Restarting = true;
    const transcript: string[] = [],
      commands: unknown[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let inventories = 0,
      inspections = 0,
      execs = 0;
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      request.on('end', () => {
        transcript.push(`${String(request.method)} ${String(request.url)}`);
        const respond = () => {
          if (request.url === '/v1.52/containers/json?all=1') {
            inventories++;
            const rows = [
              { Id: registryId, Names: ['/wbs-registry-1'] },
              { Id: binding.id, Names: [fault === 'list-name' ? '/wrong' : '/wbs-caddy-1'] },
            ];
            if (fault === 'unlisted' || (fault === 'post-inventory' && inventories > 1)) rows.pop();
            if (fault === 'duplicate-id')
              rows.push({ Id: registryId, Names: ['/duplicate-registry-alias'] });
            if (fault === 'duplicate-name')
              rows.push({ Id: 'c'.repeat(64), Names: ['/wbs-caddy-1'] });
            response.end(JSON.stringify(rows));
            return;
          }
          if (request.method === 'GET' && request.url?.includes('/containers/') === true) {
            inspections++;
            const current = structuredClone(raw);
            if (inspections > 1) {
              if (fault === 'post-pid') current.State.Pid++;
              if (fault === 'post-start') current.State.StartedAt = '2026-01-02T00:00:00Z';
              if (fault === 'post-env') current.Config.Env.reverse();
              if (fault === 'post-name') current.Name = '/changed';
            }
            response.end(JSON.stringify(current));
            return;
          }
          if (request.url?.endsWith('/exec') === true) {
            execs++;
            commands.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            response.writeHead(201);
            response.end(JSON.stringify({ Id: 'f'.repeat(64) }));
            return;
          }
          if (request.url?.startsWith(`/v1.52/exec/${'f'.repeat(64)}/start`) === true) {
            const body = Buffer.from('{}'),
              header = Buffer.alloc(8);
            header[0] = 1;
            header.writeUInt32BE(body.length, 4);
            response.end(Buffer.concat([header, body]));
            return;
          }
          if (request.url?.startsWith(`/v1.52/exec/${'f'.repeat(64)}/json`) === true) {
            response.end(
              JSON.stringify({
                ID: 'f'.repeat(64),
                ContainerID: binding.id,
                Running: false,
                ExitCode: 0,
              }),
            );
            return;
          }
          response.writeHead(204);
          response.end();
        };
        if (fault === 'deadline') timers.push(setTimeout(respond, 30));
        else respond();
      });
    });
    await new Promise<void>((resolve) => server.listen(socket, resolve));
    const engine = new EngineTransport(socket, [registryId, originalId], 'synthetic');
    async function requireUnselected() {
      for (const action of [
        () => engine.stop(candidateId, 1000),
        () => engine.rename(candidateId, 'wbs-caddy-1', 1000),
        () => engine.start(candidateId, 1000),
        () => engine.remove(candidateId, 1000),
        () => engine.execCaddy(candidateId, 'adapt', 1000),
        () => engine.inspect(candidateId, 1000),
      ]) {
        const failure = await action().then(
          () => null,
          (cause: unknown) => cause,
        );
        expect(failure).toBeInstanceOf(Error);
      }
    }
    try {
      await requireUnselected();
      const command =
        fault === 'command' ? ('reload' as 'adapt') : fault === 'live' ? 'live' : 'adapt';
      const outcome = await engine
        .observeCaddyListed(
          binding,
          command,
          fault === 'deadline' ? 150 : fault === 'budget' ? 10001 : 1000,
        )
        .then(
          (value) => ({ value, failure: null }),
          (failure: unknown) => ({ value: null, failure }),
        );
      if (['none', 'live', 'original', 'profile'].includes(fault)) {
        expect(outcome).toEqual({ value: '{}', failure: null });
        expect(commands).toEqual([
          {
            AttachStdin: false,
            AttachStdout: true,
            AttachStderr: true,
            Tty: false,
            Privileged: false,
            Cmd:
              fault === 'live'
                ? ['wget', '-qO-', 'http://127.0.0.1:2019/config/']
                : ['caddy', 'adapt', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'],
          },
        ]);
      } else {
        expect(outcome.failure).toBeInstanceOf(Error);
        expect(String(outcome.failure)).not.toContain('PRIVATE_BINDING_SENTINEL');
      }
      if (
        ![
          'none',
          'live',
          'original',
          'profile',
          'post-pid',
          'post-start',
          'post-env',
          'post-name',
          'post-inventory',
          'deadline',
        ].includes(fault)
      )
        expect(execs).toBe(0);
      await requireUnselected();
      expect(
        transcript.some((entry) =>
          /DELETE|\/stop|\/rename|\/containers\/create|\/containers\/[a-f0-9]+\/start/.test(entry),
        ),
      ).toBe(false);
    } finally {
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections();
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
    }
  });
}

for (const kind of ['registry', 'caddy'] as const)
  for (const fault of [
    'none',
    'id-owner',
    'name-owner',
    'id-hash-consistent',
    'name-hash-consistent',
    'id-read-owner',
    'id-read-name',
    'id-read-config',
    'configuration',
    'missing',
    'ambiguous',
    'malformed',
    'members-malformed',
    'member-by-id',
    'member-by-name',
    'after-id',
    'after-name',
    'after-alias',
    'after-host',
    'after-pid',
    'after-start',
    'after-network',
    'deadline',
  ] as const) {
    test(`fresh network observation binds ${kind} ${fault}`, async () => {
      const root = await directory(),
        socket = join(root, 'network.sock'),
        id = 'd'.repeat(64);
      const definitions =
        kind === 'registry'
          ? [{ name: 'edge', id: 'c'.repeat(64) }]
          : [
              { name: 'edge', id: 'c'.repeat(64) },
              { name: 'other', id: '1'.repeat(64) },
              { name: 'third', id: '2'.repeat(64) },
            ];
      const pins = definitions.map((pin) => ({
        ...pin,
        sha256: fingerprint({
          Id: fault === 'id-hash-consistent' ? 'f'.repeat(64) : pin.id,
          Name: fault === 'name-hash-consistent' ? 'foreign' : pin.name,
          Driver: 'bridge',
        }),
      }));
      const raw = syntheticContainer();
      raw.Id = id;
      raw.Name = `/wbs-init-synthetic-${kind}`;
      raw.Config.Image = raw.Image;
      raw.HostConfig.Init = true;
      Object.assign(raw.HostConfig, { OomKillDisable: false });
      Object.assign(raw.State, {
        Status: 'created',
        Running: false,
        Pid: 0,
        StartedAt: '0001-01-01T00:00:00Z',
      });
      const endpoint = structuredClone(raw.NetworkSettings.Networks.edge);
      endpoint.NetworkID = '';
      Reflect.deleteProperty(raw.NetworkSettings.Networks, 'edge');
      for (const pin of definitions)
        Object.assign(raw.NetworkSettings.Networks, { [pin.name]: structuredClone(endpoint) });
      const context: InvariantContext = {
        profile: CREATED_PROFILE,
        owner: { role: 'replacement', id, originalId: 'a'.repeat(64), phase: 'never-started' },
        networks: pins,
      };
      const transcript: string[] = [];
      let ticks = 0;
      const server = createServer((incoming, response) => {
        const route = incoming.url ?? '';
        transcript.push(`${String(incoming.method)} ${route}`);
        if (route === `/v1.52/containers/${id}/json`) {
          const after = structuredClone(raw);
          if (fault === 'after-id') after.Id = 'f'.repeat(64);
          if (fault === 'after-name') after.Name = '/foreign';
          if (fault === 'after-alias') after.NetworkSettings.Networks.edge.Aliases.push('changed');
          if (fault === 'after-host') after.HostConfig.NetworkMode = 'other';
          if (fault === 'after-pid') after.State.Pid = 123;
          if (fault === 'after-start') after.State.StartedAt = '2026-01-01T00:00:00Z';
          if (fault === 'after-network')
            after.NetworkSettings.Networks.edge.NetworkID = 'f'.repeat(64);
          response.end(JSON.stringify(after));
          return;
        }
        const pin = pins.find(
          (pin) => route === `/v1.52/networks/${pin.id}` || route === `/v1.52/networks/${pin.name}`,
        );
        if (pin === undefined) {
          response.writeHead(404);
          response.end('{}');
          return;
        }
        const byName = route.endsWith('/' + pin.name);
        if (byName && (fault === 'missing' || fault === 'ambiguous')) {
          response.writeHead(fault === 'missing' ? 404 : 400);
          response.end('{}');
          return;
        }
        if (byName && fault === 'malformed') {
          response.end('[');
          return;
        }
        const network: Record<string, unknown> = {
          Id: pin.id,
          Name: pin.name,
          Driver: 'bridge',
          Containers: {},
        };
        if (
          (byName && fault === 'id-owner') ||
          (!byName && fault === 'id-read-owner') ||
          fault === 'id-hash-consistent'
        )
          network['Id'] = 'f'.repeat(64);
        if (
          (byName && fault === 'name-owner') ||
          (!byName && fault === 'id-read-name') ||
          fault === 'name-hash-consistent'
        )
          network['Name'] = 'foreign';
        if ((byName && fault === 'configuration') || (!byName && fault === 'id-read-config'))
          network['Driver'] = 'changed';
        if (byName && fault === 'members-malformed') network['Containers'] = null;
        if ((!byName && fault === 'member-by-id') || (byName && fault === 'member-by-name'))
          network['Containers'] = { [id]: { Name: raw.Name } };
        if (fault === 'deadline' && !byName) ticks = 2;
        response.end(JSON.stringify(network));
      });
      await new Promise<void>((resolve) => server.listen(socket, resolve));
      const engine = new EngineTransport(socket, [id], 'synthetic');
      try {
        const observed = parseNativeContainer(raw);
        const outcome = await observeNetworks(
          engine,
          observed,
          context,
          new Deadline(fault === 'deadline' ? 40001 : 120000, () => ticks),
        ).then(
          () => null,
          (cause: unknown) => cause,
        );
        if (fault === 'none') {
          expect(outcome).toBe(null);
          expect(transcript).toEqual([
            ...pins.flatMap((pin) => [
              `GET /v1.52/networks/${pin.id}`,
              `GET /v1.52/networks/${pin.name}`,
            ]),
            `GET /v1.52/containers/${id}/json`,
          ]);
          expect(observed.networks['edge']).toMatchObject({ NetworkID: '' });
        } else expect(outcome).toBeInstanceOf(fault === 'members-malformed' ? Error : InitRefusal);
        expect(transcript.every((entry) => entry.startsWith('GET '))).toBe(true);
        if (fault === 'deadline') expect(transcript).toHaveLength(1);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) =>
          server.close(() => {
            resolve();
          }),
        );
      }
    });
  }

test('network name read refuses non-Docker names before dispatch and keeps full-ID lookup strict', async () => {
  const engine = new EngineTransport('/never-accessed.sock', ['a'.repeat(64)], 'synthetic');
  for (const name of ['', '/foreign', 'name?query', 'name#fragment', 'a'.repeat(256), 'a b']) {
    const cause = await engine.networkByName(name, 1000).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(cause).toBeInstanceOf(InitRefusal);
    expect(String(cause)).toContain('network-name-invalid');
  }
  const invalid = await engine.network('', 1000).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(invalid).toBeInstanceOf(Error);
});

type DiagnosticCase = { kind: 'network' | 'context' } | { kind: 'cause'; cause: unknown };
async function runDiagnosticSequence(variant: DiagnosticCase) {
  const original = syntheticContainer();
  Object.assign(original.HostConfig, { OomKillDisable: null });
  const caddy = structuredClone(original);
  caddy.Id = 'e'.repeat(64);
  caddy.Name = '/wbs-caddy-1';
  const replacement = structuredClone(original);
  replacement.Id = 'd'.repeat(64);
  replacement.Name = '/wbs-init-synthetic-registry';
  replacement.Config.Image = replacement.Image;
  replacement.HostConfig.Init = true;
  Object.assign(replacement.HostConfig, { OomKillDisable: false });
  Object.assign(replacement.State, {
    Status: 'created',
    Running: false,
    Pid: 0,
    StartedAt: '0001-01-01T00:00:00Z',
  });
  replacement.NetworkSettings.Networks.edge.NetworkID = '';
  if (variant.kind === 'context') replacement.HostConfig.NetworkMode = 'foreign';
  const containers = new Map([original, caddy, replacement].map((raw) => [raw.Id, raw]));
  const effects: string[] = [],
    receipts: string[] = [];
  const network = { Id: 'c'.repeat(64), Name: 'edge', Driver: 'bridge', Containers: {} };
  const pins = [
    {
      name: 'edge',
      id: network.Id,
      sha256: fingerprint({ Id: network.Id, Name: network.Name, Driver: network.Driver }),
    },
  ];
  const verify = () => Promise.resolve();
  const refusal = await runInitAdoption(
    {
      nonce: 'synthetic',
      invariantProfile: CREATED_PROFILE,
      targets: [
        { kind: 'registry', original: parseNativeContainer(original), networks: pins },
        { kind: 'caddy', original: parseNativeContainer(caddy), networks: pins },
      ],
    },
    {
      inspect: (id) => {
        const raw = containers.get(id);
        if (raw === undefined) throw Error('missing diagnostic fixture');
        return Promise.resolve(parseNativeContainer(raw));
      },
      create: () => {
        effects.push('create');
        return Promise.resolve(replacement.Id);
      },
      network: () => Promise.resolve(network),
      networkByName: () =>
        Promise.resolve(variant.kind === 'network' ? { ...network, Id: 'f'.repeat(64) } : network),
      stop: () => {
        effects.push('stop');
        return verify();
      },
      rename: () => {
        effects.push('rename');
        return verify();
      },
      start: () => {
        effects.push('start');
        return verify();
      },
      remove: () => {
        effects.push('remove');
        return verify();
      },
    },
    {
      admit: verify,
      original: verify,
      inert: () => (variant.kind === 'cause' ? Promise.reject(variant.cause as Error) : verify()),
      stopped: verify,
      running: verify,
      health: verify,
      combined: verify,
      absent: verify,
    },
    {
      publish: (receipt) => {
        receipts.push(JSON.stringify(receipt));
        return Promise.resolve('0'.repeat(64));
      },
    },
  ).then(
    () => null,
    (cause: unknown) => cause,
  );
  if (!(refusal instanceof InitRefusal)) throw Error('expected sanitized diagnostic refusal');
  return { refusal, effects, receipts };
}
function expectedDiagnosticHash(
  reason: string,
  type: string,
  reasonSource: string,
  messageSource: string,
  message: string,
) {
  return createHash('sha256')
    .update(
      `init-diagnostic-v1\0${type}\0${reason}\0${reasonSource}\0${messageSource}\0${String(message.length)}\0${message.length > 8192 ? 'truncated' : 'complete'}\0`,
      'utf8',
    )
    .update(message.slice(0, 8192), 'utf16le')
    .digest('hex');
}

test('real candidate-inert catches retain distinct private network and context reasons under identical public errors', async () => {
  const [network, context] = await Promise.all([
    runDiagnosticSequence({ kind: 'network' }),
    runDiagnosticSequence({ kind: 'context' }),
  ]);
  for (const entry of [network, context]) {
    expect(entry.effects).toEqual(['create']);
    expect(entry.refusal.reason).toBe('candidate-inert');
    expect(entry.refusal.message).toBe(new InitRefusal('candidate-inert').message);
    expect(entry.refusal.name).toBe(new InitRefusal('candidate-inert').name);
    expect(Reflect.ownKeys(entry.refusal).sort()).toEqual(
      Reflect.ownKeys(new InitRefusal('candidate-inert')).sort(),
    );
    expect(Object.getPrototypeOf(entry.refusal)).toBe(InitRefusal.prototype);
    const diagnostic = readInitDiagnostic(entry.refusal);
    expect(Object.isFrozen(diagnostic)).toBe(true);
    expect(Reflect.ownKeys(diagnostic ?? {}).sort()).toEqual(['diagnosticSha256', 'reason']);
    expect(JSON.stringify(entry.refusal)).toBe(JSON.stringify(new InitRefusal('candidate-inert')));
  }
  expect(readInitDiagnostic(network.refusal)).toEqual({
    reason: 'network-pin-differs',
    diagnosticSha256: 'c6f78fed98628ac47a35112ff6e07cc87f777a40a25dd4fd42dfc0c6fd59a569',
  });
  expect(readInitDiagnostic(context.refusal)?.reason).toBe('network-mode-differs');
  expect(readInitDiagnostic(context.refusal)?.diagnosticSha256).not.toBe(
    readInitDiagnostic(network.refusal)?.diagnosticSha256,
  );
  for (const cause of [
    new InitRefusal('candidate-inert'),
    new Error('candidate-inert'),
    undefined,
    null,
    1,
    'candidate-inert',
    Symbol('candidate-inert'),
  ])
    expect(readInitDiagnostic(cause)).toBeUndefined();
  const third = await runDiagnosticSequence({
    kind: 'cause',
    cause: Object.assign(new InitRefusal('network-pin-differs'), {
      message: 'different bounded message',
    }),
  });
  expect(readInitDiagnostic(third.refusal)?.reason).toBe('network-pin-differs');
  expect(readInitDiagnostic(third.refusal)?.diagnosticSha256).not.toBe(
    readInitDiagnostic(network.refusal)?.diagnosticSha256,
  );
  expect(readInitDiagnostic(network.refusal)?.reason).toBe('network-pin-differs');
});

test('private diagnostics never attach or serialize arbitrary errors or refusal text', async () => {
  for (const cause of [
    new Error('PRIVATE_CAUSE_SENTINEL'),
    new InitRefusal('network-PRIVATE_CAUSE_SENTINEL'),
  ]) {
    const entry = await runDiagnosticSequence({ kind: 'cause', cause });
    const expected = cause instanceof InitRefusal ? 'unrecognized-refusal' : 'unexpected-failure';
    expect(readInitDiagnostic(entry.refusal)?.reason).toBe(expected);
    expect(JSON.stringify(readInitDiagnostic(entry.refusal))).not.toContain(
      'PRIVATE_CAUSE_SENTINEL',
    );
    expect(entry.effects).toEqual(['create']);
    expect(JSON.stringify(Object.getOwnPropertyDescriptors(entry.refusal))).not.toContain(
      'PRIVATE_CAUSE_SENTINEL',
    );
    expect(JSON.stringify(entry.refusal)).not.toContain('PRIVATE_CAUSE_SENTINEL');
    expect(JSON.stringify(describeInitRefusal(entry.refusal))).not.toContain(
      'PRIVATE_CAUSE_SENTINEL',
    );
    expect(entry.receipts.join('\n')).not.toContain('PRIVATE_CAUSE_SENTINEL');
    expect(Reflect.ownKeys(entry.refusal)).not.toContain('cause');
    expect(Object.getOwnPropertySymbols(entry.refusal)).toEqual([]);
  }
});

test('diagnostic hashing is getter-free and hostile values cannot replace the public phase', async () => {
  let getters = 0;
  const getter = new InitRefusal('network-pin-differs');
  Object.defineProperties(getter, {
    reason: {
      get() {
        getters++;
        throw Error('PRIVATE_GETTER');
      },
    },
    message: {
      get() {
        getters++;
        throw Error('PRIVATE_GETTER');
      },
    },
  });
  const hostile = new Proxy(
    {},
    {
      getOwnPropertyDescriptor() {
        getters++;
        throw Error('PRIVATE_TRAP');
      },
      getPrototypeOf() {
        getters++;
        throw Error('PRIVATE_TRAP');
      },
    },
  );
  for (const cause of [getter, hostile]) {
    const entry = await runDiagnosticSequence({ kind: 'cause', cause });
    expect(entry.refusal.reason).toBe('candidate-inert');
    expect(readInitDiagnostic(entry.refusal)?.reason).toBe(
      cause === getter ? 'unrecognized-refusal' : 'uninspectable-failure',
    );
    expect(JSON.stringify(readInitDiagnostic(entry.refusal))).not.toContain('PRIVATE_');
  }
  expect(readInitDiagnostic(hostile)).toBeUndefined();
  expect(getters).toBe(0);
});

test('diagnostic framing bounds raw UTF-16 message input with explicit original length and truncation', async () => {
  const message = 'x'.repeat(8192) + 'PRIVATE_SUFFIX';
  const cause = new Error(message);
  const entry = await runDiagnosticSequence({ kind: 'cause', cause });
  expect(readInitDiagnostic(entry.refusal)).toEqual({
    reason: 'unexpected-failure',
    diagnosticSha256: expectedDiagnosticHash(
      'unexpected-failure',
      'object',
      'not-refusal',
      'data-message',
      message,
    ),
  });
  const same = await runDiagnosticSequence({
    kind: 'cause',
    cause: new Error('x'.repeat(8192) + 'OTHER_SUFFIX__'),
  });
  expect(readInitDiagnostic(same.refusal)?.diagnosticSha256).toBe(
    readInitDiagnostic(entry.refusal)?.diagnosticSha256,
  );
  const longer = await runDiagnosticSequence({ kind: 'cause', cause: new Error(message + 'x') });
  expect(readInitDiagnostic(longer.refusal)?.diagnosticSha256).not.toBe(
    readInitDiagnostic(entry.refusal)?.diagnosticSha256,
  );
  const primitive = await runDiagnosticSequence({ kind: 'cause', cause: 'PRIVATE_STRING' });
  expect(readInitDiagnostic(primitive.refusal)?.diagnosticSha256).toBe(
    expectedDiagnosticHash(
      'unexpected-failure',
      'string',
      'not-refusal',
      'primitive-string',
      'PRIVATE_STRING',
    ),
  );
});

test('diagnostic framing marks accessor fields without invoking getters or serializers', async () => {
  let reads = 0;
  const messageGetter = new InitRefusal('network-pin-differs');
  Object.defineProperty(messageGetter, 'message', {
    get() {
      reads++;
      throw Error('PRIVATE_ACCESSOR');
    },
  });
  const reasonGetter = new InitRefusal('network-pin-differs');
  Object.defineProperty(reasonGetter, 'reason', {
    get() {
      reads++;
      throw Error('PRIVATE_ACCESSOR');
    },
  });
  const serialized = {
    message: 'PRIVATE_MESSAGE',
    get cause() {
      reads++;
      throw Error('PRIVATE_CAUSE');
    },
    toJSON() {
      reads++;
      throw Error('PRIVATE_JSON');
    },
    toString() {
      reads++;
      throw Error('PRIVATE_STRING');
    },
  };
  const message = await runDiagnosticSequence({ kind: 'cause', cause: messageGetter });
  expect(readInitDiagnostic(message.refusal)?.diagnosticSha256).toBe(
    expectedDiagnosticHash('network-pin-differs', 'object', 'data-reason', 'accessor-message', ''),
  );
  const reason = await runDiagnosticSequence({ kind: 'cause', cause: reasonGetter });
  expect(readInitDiagnostic(reason.refusal)?.diagnosticSha256).toBe(
    expectedDiagnosticHash(
      'unrecognized-refusal',
      'object',
      'accessor-reason',
      'data-message',
      'edge Init adoption refused: network-pin-differs',
    ),
  );
  const arbitrary = await runDiagnosticSequence({ kind: 'cause', cause: serialized });
  expect(readInitDiagnostic(arbitrary.refusal)?.reason).toBe('unexpected-failure');
  expect(reads).toBe(0);
});

test('diagnostic inspection remains bounded for deep prototypes and ignores non-string message conversion', async () => {
  let deep: object = {};
  for (let count = 0; count < 40; count++) deep = Object.create(deep) as object;
  const bounded = await runDiagnosticSequence({ kind: 'cause', cause: deep });
  expect(readInitDiagnostic(bounded.refusal)?.reason).toBe('uninspectable-failure');
  let conversions = 0;
  const cause = {
    message: {
      toString() {
        conversions++;
        throw Error('PRIVATE_CONVERSION');
      },
      toJSON() {
        conversions++;
        throw Error('PRIVATE_CONVERSION');
      },
    },
  };
  const ignored = await runDiagnosticSequence({ kind: 'cause', cause });
  expect(readInitDiagnostic(ignored.refusal)?.diagnosticSha256).toBe(
    expectedDiagnosticHash('unexpected-failure', 'object', 'not-refusal', 'non-string-message', ''),
  );
  expect(conversions).toBe(0);
});

for (const reason of ['deadline-reserve-exhausted', 'deadline-exhausted'] as const)
  test('private diagnostics admit fixed ' + reason, async () => {
    const entry = await runDiagnosticSequence({ kind: 'cause', cause: new InitRefusal(reason) });
    expect(entry.refusal.reason).toBe('candidate-inert');
    expect(readInitDiagnostic(entry.refusal)?.reason).toBe(reason);
    expect(entry.effects).toEqual(['create']);
  });

test('private diagnostic classification does not treat the class prototype as a refusal instance', async () => {
  const entry = await runDiagnosticSequence({ kind: 'cause', cause: InitRefusal.prototype });
  expect(readInitDiagnostic(entry.refusal)?.reason).toBe('unexpected-failure');
  expect(readInitDiagnostic(InitRefusal.prototype)).toBeUndefined();
});
