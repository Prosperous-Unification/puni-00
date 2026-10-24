import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { fingerprint, InitRefusal, parseNativeContainer } from '../src/lib/edge-init';
import { EngineTransport, runInitAdoption } from '../src/lib/edge-init-operation';
import {
  createFixtureVolume,
  removeFixtureResource,
  requireUnusedFixtureNamespace,
  verifyFixtureFault,
  verifyFixtureOwnership,
  verifyFixtureStopDeadline,
} from './edge-init';
import { syntheticContainer } from './edge-init-fixture';

test('native fixture ownership rejects foreign names and invocation labels before any effect', () => {
  const raw = syntheticContainer();
  raw.Name = '/wbs-init-synthetic-registry-fixture';
  Object.assign(raw.Config.Labels, { 'club.bulletpoints.edge-init-fixture': 'synthetic' });
  expect(verifyFixtureOwnership(parseNativeContainer(raw), 'synthetic')).toBe(raw.Id);
  raw.Name = '/wbs-registry-1';
  expect(() => verifyFixtureOwnership(parseNativeContainer(raw), 'synthetic')).toThrow();
  raw.Name = '/wbs-init-synthetic-registry-fixture';
  Object.assign(raw.Config.Labels, { 'club.bulletpoints.edge-init-fixture': 'foreign' });
  expect(() => verifyFixtureOwnership(parseNativeContainer(raw), 'synthetic')).toThrow();
});

test.each(['collision', 'foreign-owner', 'wrong-create-name', 'wrong-readback-name', 'none'])(
  'volume seeding refuses %s before any seed write',
  async (fault) => {
    const commands: string[][] = [];
    const name = 'wbs-init-synthetic-registry';
    const run = (arguments_: readonly string[]) => {
      commands.push([...arguments_]);
      if (arguments_[0] === 'volume' && arguments_[1] === 'ls')
        return Promise.resolve(fault === 'collision' ? name : '');
      if (arguments_[0] === 'volume' && arguments_[1] === 'create')
        return Promise.resolve(fault === 'wrong-create-name' ? `${name}-foreign` : name);
      if (arguments_[0] === 'volume' && arguments_[1] === 'inspect')
        return Promise.resolve(
          JSON.stringify([
            {
              Name: fault === 'wrong-readback-name' ? 'wbs-init-synthetic-caddy-data' : name,
              Labels: {
                'club.bulletpoints.edge-init-fixture':
                  fault === 'foreign-owner' ? 'foreign' : 'synthetic',
              },
            },
          ]),
        );
      return Promise.resolve('');
    };
    const failure = await createFixtureVolume(
      name,
      'synthetic',
      `sha256:${'b'.repeat(64)}`,
      run,
    ).then(
      () => null,
      (cause: unknown) => cause,
    );
    if (fault === 'none') {
      expect(failure).toBeNull();
      expect(commands.map((command) => command[0])).toEqual(['volume', 'volume', 'volume', 'run']);
    } else {
      expect(failure).toBeInstanceOf(InitRefusal);
    }
    if (fault !== 'none') expect(commands.some((command) => command[0] === 'run')).toBe(false);
    if (fault === 'collision') expect(commands).toEqual([['volume', 'ls', '--quiet']]);
  },
);

test.each(['foreign-volume', 'unpinned-image'])(
  'seeding rejects %s input before any Docker request',
  async (fault) => {
    const calls: string[][] = [];
    const name = fault === 'foreign-volume' ? 'unrelated-volume' : 'wbs-init-synthetic-registry';
    const image = fault === 'unpinned-image' ? 'caddy:latest' : `sha256:${'b'.repeat(64)}`;
    const failure = await createFixtureVolume(name, 'synthetic', image, (arguments_) => {
      calls.push([...arguments_]);
      return Promise.resolve('');
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(InitRefusal);
    expect(calls).toEqual([]);
  },
);

test.each(['volume', 'retained-label', 'none'])(
  'fixture namespace refuses %s collision before setup or teardown authority',
  async (fault) => {
    const calls: string[][] = [];
    const failure = await requireUnusedFixtureNamespace('synthetic', (arguments_) => {
      calls.push([...arguments_]);
      return Promise.resolve(
        fault === 'volume' && calls.length === 1
          ? 'wbs-init-synthetic-registry'
          : fault === 'retained-label' && calls.length === 2
            ? 'a'.repeat(64)
            : '',
      );
    }).then(
      () => null,
      (cause: unknown) => cause,
    );
    if (fault === 'none') {
      expect(failure).toBeNull();
      expect(calls).toHaveLength(4);
    } else {
      expect(failure).toBeInstanceOf(InitRefusal);
      expect(calls.some((arguments_) => ['create', 'rm', 'run'].includes(arguments_[1]))).toBe(
        false,
      );
    }
  },
);

test.each(['none', 'foreign-name', 'foreign-owner', 'short-id', 'array-like', 'multiple-records'])(
  'network cleanup binds %s full identity and nonce name before delete',
  async (fault) => {
    const commands: string[][] = [];
    const full = 'c'.repeat(64);
    const run = (arguments_: readonly string[]) => {
      commands.push([...arguments_]);
      const observed = {
        Id: fault === 'short-id' ? full.slice(0, 12) : full,
        Name: fault === 'foreign-name' ? 'unrelated-network' : 'wbs-init-synthetic-net-0',
        Labels: {
          'club.bulletpoints.edge-init-fixture':
            fault === 'foreign-owner' ? 'foreign' : 'synthetic',
        },
      };
      return Promise.resolve(
        JSON.stringify(
          fault === 'array-like'
            ? { 0: observed, length: 1 }
            : fault === 'multiple-records'
              ? [observed, observed]
              : [observed],
        ),
      );
    };
    const failure = await removeFixtureResource(
      'network',
      full.slice(0, 12),
      'synthetic',
      run,
    ).then(
      () => null,
      (cause: unknown) => cause,
    );
    if (fault === 'none') {
      expect(failure).toBeNull();
      expect(commands).toEqual([
        ['network', 'inspect', full.slice(0, 12)],
        ['network', 'rm', full],
      ]);
    } else {
      expect(failure).toBeInstanceOf(Error);
      expect(commands.some((command) => command[1] === 'rm')).toBe(false);
    }
  },
);

test.each([
  'none',
  'status',
  'transport',
  'early-deadline',
  'late-deadline',
  'recycled-pid',
  'changed-pid',
  'changed-started-at',
  'foreign-id',
  'zero-pid',
])(
  'TERM proof refuses %s without a bounded actual deadline and unchanged kernel identity',
  async (fault) => {
    const raw = syntheticContainer();
    raw.Name = '/wbs-init-synthetic-term';
    Object.assign(raw.Config.Labels, { 'club.bulletpoints.edge-init-fixture': 'synthetic' });
    if (fault === 'zero-pid') raw.State.Pid = 0;
    const before = parseNativeContainer(raw);
    let time = 0;
    let reads = 0;
    const verify = verifyFixtureStopDeadline(
      {
        stop: (_id: string, timeout: number) => {
          expect(timeout).toBe(250);
          time = fault === 'early-deadline' ? 1 : fault === 'late-deadline' ? 1500 : 250;
          return Promise.reject(
            new InitRefusal(
              fault === 'status'
                ? 'engine-status-refused'
                : fault === 'transport'
                  ? 'engine-transport-uncertain'
                  : 'engine-deadline-uncertain',
            ),
          );
        },
        inspect: () => {
          const current = structuredClone(raw);
          if (fault === 'changed-pid') current.State.Pid++;
          if (fault === 'changed-started-at') current.State.StartedAt = '2026-01-02T00:00:00Z';
          if (fault === 'foreign-id') current.Id = 'e'.repeat(64);
          return Promise.resolve(parseNativeContainer(current));
        },
      },
      before,
      'synthetic',
      {
        now: () => time,
        observeProcess: (pid) =>
          Promise.resolve({
            pid,
            startTime: fault === 'recycled-pid' && ++reads === 2 ? '2' : '1',
            cgroup: '/fixture',
          }),
      },
    );
    const failure = await verify.then(
      () => null,
      (cause: unknown) => cause,
    );
    if (fault === 'none') expect(failure).toBeNull();
    else expect(failure).toBeInstanceOf(InitRefusal);
  },
);

test.each(['stall', 'status'])(
  'TERM oracle observes the real Unix-socket %s and exact t=-1 request',
  async (fault) => {
    const root = await mkdtemp(join(tmpdir(), 'edge-init-deadline-'));
    const socket = join(root, 'engine.sock');
    const raw = syntheticContainer();
    raw.Name = '/wbs-init-synthetic-term';
    Object.assign(raw.Config.Labels, { 'club.bulletpoints.edge-init-fixture': 'synthetic' });
    const transcript: string[] = [];
    const server = createServer((request, response) => {
      transcript.push(`${String(request.method)} ${String(request.url)}`);
      if (request.method === 'POST') {
        if (fault === 'status') {
          response.writeHead(500);
          response.end('PRIVATE_STATUS_SENTINEL');
        }
        return;
      }
      response.end(JSON.stringify(raw));
    });
    await new Promise<void>((resolve) => server.listen(socket, resolve));
    try {
      const engine = new EngineTransport(socket, [raw.Id], 'synthetic', 'owned-fixture');
      const failure = await verifyFixtureStopDeadline(
        engine,
        parseNativeContainer(raw),
        'synthetic',
        {
          now: () => performance.now(),
          observeProcess: (pid) => Promise.resolve({ pid, startTime: '1', cgroup: '/fixture' }),
        },
      ).then(
        () => null,
        (cause: unknown) => cause,
      );
      if (fault === 'stall') {
        expect(failure).toBeNull();
        expect(transcript).toEqual([
          `POST /v1.52/containers/${raw.Id}/stop?t=-1`,
          `GET /v1.52/containers/${raw.Id}/json`,
        ]);
      } else {
        expect(failure).toBeInstanceOf(InitRefusal);
        expect(String(failure)).not.toContain('PRIVATE_STATUS_SENTINEL');
        expect(transcript).toEqual([`POST /v1.52/containers/${raw.Id}/stop?t=-1`]);
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
      await rm(root, { recursive: true });
    }
  },
);

test.each([
  'none',
  'injection-omitted',
  'unrelated-caddy-refusal',
  'extra-mutation',
  'wrong-state',
  'wrong-phase',
  'wrong-status',
  'wrong-name',
])('native fault oracle rejects %s instead of accepting an arbitrary refusal', (fault) => {
  const original = syntheticContainer();
  original.Name = '/wbs-init-synthetic-registry-fixture';
  Object.assign(original.State, { Status: 'exited', Running: false, Pid: 0 });
  const candidate = syntheticContainer();
  candidate.Id = 'b'.repeat(64);
  candidate.Name = '/wbs-init-synthetic-registry';
  Object.assign(candidate.State, {
    Status: 'created',
    Running: false,
    Pid: 0,
    StartedAt: '0001-01-01T00:00:00Z',
  });
  if (fault === 'wrong-state') original.State.Running = true;
  if (fault === 'wrong-status') original.State.Status = 'running';
  if (fault === 'wrong-name') original.Name = '/wbs-init-synthetic-registry-original';
  const effects = [`create:registry`, `stop:${original.Id}`];
  if (fault === 'extra-mutation' || fault === 'unrelated-caddy-refusal')
    effects.push(
      `rename:${original.Id}:wbs-init-synthetic-registry-original`,
      `rename:${candidate.Id}:wbs-init-synthetic-registry-fixture`,
      `start:${candidate.Id}`,
      'create:caddy',
    );
  const assertion = () => {
    verifyFixtureFault('stop-ack-lost', {
      injected: fault !== 'injection-omitted',
      failure: new InitRefusal(
        fault === 'unrelated-caddy-refusal' || fault === 'wrong-phase'
          ? 'before-create'
          : 'stop-uncertain',
      ),
      effects,
      original: parseNativeContainer(original),
      candidate: parseNativeContainer(candidate),
      originalId: original.Id,
      candidateId: candidate.Id,
      nonce: 'synthetic',
      network: 'wbs-init-synthetic-net-0',
    });
  };
  if (fault === 'none') expect(assertion).not.toThrow();
  else expect(assertion).toThrow();
});

const originalId = 'a'.repeat(64);
const candidateId = 'b'.repeat(64);
const network = 'wbs-init-synthetic-net-0';
const create = 'create:registry';
const stop = `stop:${originalId}`;
const renameOriginal = `rename:${originalId}:wbs-init-synthetic-registry-original`;
const renameCandidate = `rename:${candidateId}:wbs-init-synthetic-registry-fixture`;
const start = `start:${candidateId}`;
for (const fixture of [
  {
    fault: 'alias-drift',
    phase: 'candidate-inert',
    stopped: false,
    renamed: false,
    started: false,
    effects: [create],
  },
  {
    fault: 'create-ack-lost',
    phase: 'before-create',
    stopped: false,
    renamed: false,
    started: false,
    effects: [create],
  },
  {
    fault: 'stop-ack-lost',
    phase: 'stop-uncertain',
    stopped: true,
    renamed: false,
    started: false,
    effects: [create, stop],
  },
  {
    fault: 'rename-ack-lost',
    phase: 'rename-uncertain',
    stopped: true,
    renamed: true,
    started: false,
    effects: [create, stop, renameOriginal],
  },
  {
    fault: 'start-ack-lost',
    phase: 'start-uncertain',
    stopped: true,
    renamed: true,
    started: true,
    effects: [create, stop, renameOriginal, renameCandidate, start],
  },
  {
    fault: 'route-loss',
    phase: 'candidate-running-unhealthy',
    stopped: true,
    renamed: true,
    started: true,
    effects: [
      create,
      stop,
      renameOriginal,
      renameCandidate,
      start,
      `disconnect:${network}:${candidateId}`,
    ],
  },
  {
    fault: 'public-probe-failed',
    phase: 'candidate-running-unhealthy',
    stopped: true,
    renamed: true,
    started: true,
    effects: [create, stop, renameOriginal, renameCandidate, start, `pause:${candidateId}`],
  },
  {
    fault: 'restart-after-health',
    phase: 'candidate-running-unhealthy',
    stopped: true,
    renamed: true,
    started: true,
    effects: [create, stop, renameOriginal, renameCandidate, start, `restart:${candidateId}`],
  },
] as const) {
  test(`native fault oracle admits only the exact ${fixture.fault} stage and state`, () => {
    const original = syntheticContainer();
    original.Name = `/wbs-init-synthetic-${fixture.renamed ? 'registry-original' : 'registry-fixture'}`;
    Object.assign(original.State, {
      Status: fixture.stopped ? 'exited' : 'running',
      Running: !fixture.stopped,
      Pid: fixture.stopped ? 0 : 123,
    });
    const candidate = syntheticContainer();
    candidate.Id = candidateId;
    candidate.Name = `/wbs-init-synthetic-${fixture.started ? 'registry-fixture' : 'registry'}`;
    Object.assign(candidate.State, {
      Status: !fixture.started
        ? 'created'
        : fixture.fault === 'public-probe-failed'
          ? 'paused'
          : 'running',
      Running: fixture.started,
      Pid: fixture.started ? 456 : 0,
      Paused: fixture.fault === 'public-probe-failed',
    });
    const endpoint = candidate.NetworkSettings.Networks.edge;
    Reflect.deleteProperty(candidate.NetworkSettings.Networks, 'edge');
    Object.assign(candidate.NetworkSettings.Networks, { [network]: endpoint });
    if (fixture.fault === 'alias-drift') endpoint.Aliases = ['unexpected-fixture-alias'];
    if (fixture.fault === 'route-loss')
      Reflect.deleteProperty(candidate.NetworkSettings.Networks, network);
    const evidence = {
      injected: true,
      failure: new InitRefusal(fixture.phase),
      effects: fixture.effects,
      original: parseNativeContainer(original),
      candidate: parseNativeContainer(candidate),
      originalId,
      candidateId,
      nonce: 'synthetic',
      network,
      beforeRestart: 'before-restart',
    };
    expect(() => {
      verifyFixtureFault(fixture.fault, evidence);
    }).not.toThrow();
    if (fixture.fault === 'alias-drift') {
      endpoint.Aliases = ['registry'];
      evidence.candidate = parseNativeContainer(candidate);
      expect(() => {
        verifyFixtureFault(fixture.fault, evidence);
      }).toThrow();
    }
    if (fixture.fault === 'route-loss') {
      Object.assign(candidate.NetworkSettings.Networks, { [network]: endpoint });
      evidence.candidate = parseNativeContainer(candidate);
      expect(() => {
        verifyFixtureFault(fixture.fault, evidence);
      }).toThrow();
    }
    if (fixture.fault === 'restart-after-health') {
      Reflect.deleteProperty(evidence, 'beforeRestart');
      expect(() => {
        verifyFixtureFault(fixture.fault, evidence);
      }).toThrow();
      evidence.beforeRestart = fingerprint({
        pid: evidence.candidate.state['Pid'],
        startedAt: evidence.candidate.state['StartedAt'],
      });
      expect(() => {
        verifyFixtureFault(fixture.fault, evidence);
      }).toThrow();
    }
  });
}

test('omitted stop acknowledgement fault cannot borrow an unrelated Caddy refusal as native proof', async () => {
  const original = syntheticContainer();
  original.Name = '/wbs-init-synthetic-registry-fixture';
  Object.assign(original.Config.Labels, { 'club.bulletpoints.edge-init-fixture': 'synthetic' });
  const caddy = structuredClone(original);
  caddy.Id = 'e'.repeat(64);
  caddy.Name = '/wbs-init-synthetic-caddy-fixture';
  const containers = new Map([original, caddy].map((container) => [container.Id, container]));
  const effects: string[] = [];
  const candidates: string[] = [];
  let time = 0;
  const read = (id: string) => {
    const container = containers.get(id);
    if (container === undefined) throw new Error('absent');
    return container;
  };
  const observe = () => Promise.resolve();
  const failure: unknown = await runInitAdoption(
    {
      nonce: 'synthetic',
      namespace: 'owned-fixture',
      targets: [
        { kind: 'registry', original: parseNativeContainer(original) },
        { kind: 'caddy', original: parseNativeContainer(caddy) },
      ],
    },
    {
      inspect: (id) => Promise.resolve(parseNativeContainer(read(id))),
      create: (kind) => {
        effects.push(`create:${kind}`);
        if (kind !== 'registry')
          return Promise.reject(new InitRefusal('native-fixture-fault-expanded-targets'));
        const replacement = structuredClone(original);
        replacement.Id = candidateId;
        replacement.Name = '/wbs-init-synthetic-registry';
        replacement.Config.Image = replacement.Image;
        replacement.HostConfig.Init = true;
        Object.assign(replacement.State, {
          Status: 'created',
          Running: false,
          Pid: 0,
          StartedAt: '0001-01-01T00:00:00Z',
        });
        containers.set(candidateId, replacement);
        candidates.push(candidateId);
        return Promise.resolve(candidateId);
      },
      stop: (id) => {
        effects.push(`stop:${id}`);
        Object.assign(read(id).State, { Status: 'exited', Running: false, Pid: 0 });
        return Promise.resolve();
      },
      rename: (id, name) => {
        effects.push(`rename:${id}:${name}`);
        read(id).Name = `/${name}`;
        return Promise.resolve();
      },
      start: (id) => {
        effects.push(`start:${id}`);
        Object.assign(read(id).State, {
          Status: 'running',
          Running: true,
          Pid: 567,
          StartedAt: '2026-01-02T00:00:00Z',
        });
        return Promise.resolve();
      },
      remove: (id) => {
        effects.push(`remove:${id}`);
        containers.delete(id);
        return Promise.resolve();
      },
    },
    {
      admit: observe,
      original: observe,
      inert: observe,
      stopped: observe,
      running: observe,
      health: observe,
      combined: observe,
      absent: observe,
    },
    { publish: () => Promise.resolve('0'.repeat(64)) },
    {
      now: () => time,
      sleep: (milliseconds) => {
        time += milliseconds;
        return Promise.resolve();
      },
    },
  ).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(InitRefusal);
  expect(failure).toMatchObject({ reason: 'before-create' });
  expect(candidates).toEqual([candidateId]);
  expect(effects).toEqual([create, stop, renameOriginal, renameCandidate, start, 'create:caddy']);
  expect(containers.has(originalId)).toBe(true);
  expect(() => {
    verifyFixtureFault('stop-ack-lost', {
      injected: false,
      failure,
      effects,
      original: parseNativeContainer(read(originalId)),
      candidate: parseNativeContainer(read(candidateId)),
      originalId,
      candidateId,
      nonce: 'synthetic',
      network,
    });
  }).toThrow();
  expect(() => {
    verifyFixtureFault('stop-ack-lost', {
      injected: true,
      failure,
      effects,
      original: parseNativeContainer(read(originalId)),
      candidate: parseNativeContainer(read(candidateId)),
      originalId,
      candidateId,
      nonce: 'synthetic',
      network,
    });
  }).toThrow();
});
