import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { syntheticContainer } from '../../test/edge-init-fixture';
import { parseNativeContainer } from './edge-init';
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
      expect(operation).rejects.toThrow();
      expect(effects.some((effect) => effect.startsWith('remove:'))).toBe(false);
      expect(containers.has(original.Id)).toBe(true);
      if (fault === 'candidate-drift' || fault === 'receipt-failed')
        expect(effects.some((effect) => effect.startsWith('stop:'))).toBe(false);
      if (fault === 'stop-uncertain')
        expect(effects.some((effect) => effect.startsWith('rename:'))).toBe(false);
    }
  },
);
