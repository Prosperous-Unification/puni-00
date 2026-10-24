import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { syntheticContainer } from '../../test/edge-init-fixture';
import {
  constructCandidate,
  fingerprint,
  InitRefusal,
  parseNativeContainer,
  projectInvariant,
} from './edge-init';
import { Deadline, EngineTransport, PrivateReceipts, runInitAdoption } from './edge-init-operation';

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

test.each(['none', 'candidate-drift', 'stop-uncertain', 'health-failed', 'receipt-failed'])(
  'finite sequence retains originals on %s and removes only after both health rounds',
  async (fault) => {
    await Promise.resolve();
    const original = syntheticContainer();
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
    const engine = {
      inspect,
      create: async (kind: string) => {
        await Promise.resolve();
        effects.push(`create:${kind}`);
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
        targets: [
          { kind: 'registry', original: parseNativeContainer(original) },
          { kind: 'caddy', original: parseNativeContainer(caddy) },
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
    if (fault === 'none') {
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
      if (fault === 'candidate-drift' || fault === 'receipt-failed')
        expect(effects.some((effect) => effect.startsWith('stop:'))).toBe(false);
      if (fault === 'stop-uncertain')
        expect(effects.some((effect) => effect.startsWith('rename:'))).toBe(false);
    }
  },
);

for (const fault of [
  'none',
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
    const binding = {
      id: raw.Id,
      originalId,
      candidateId: fault === 'original' ? null : candidateId,
      nonce: 'synthetic',
      name: '/wbs-caddy-1' as const,
      invariantSha256: fingerprint(projectInvariant(parseNativeContainer(raw))),
    };
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
      if (['none', 'live', 'original'].includes(fault)) {
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
