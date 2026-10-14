import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { ROOT } from './lib/docker';
import { planSwap } from './lib/reconcile';
import { assertNoWriterBarrier } from './lib/writer-barrier';
import {
  assertContainerStopped,
  checkBackendRecovery,
  execute,
  inspectBackendWriters,
  prepareBackend,
  type SwapExecutionIo,
} from './swap';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
const outgoingId = 'a'.repeat(64);
const incomingId = 'b'.repeat(64);
const image = 'registry/wbs-be-01@sha256:' + 'c'.repeat(64);

async function fixture(
  fault:
    | 'none'
    | 'preflight'
    | 'running'
    | 'wrong-id'
    | 'missing'
    | 'start'
    | 'alias'
    | 'idle'
    | 'race'
    | 'unmanaged'
    | 'mount-missing' = 'none',
) {
  const root = await mkdtemp(join(tmpdir(), 'compose-writer-'));
  roots.push(root);
  const events: string[] = [];
  let blueRunning = true;
  let greenRunning = fault === 'idle';
  let inventoryReads = 0;
  let stoppedInspected = false;
  const io: SwapExecutionIo = {
    barrierStateDir: root,
    captureStateDir: root,
    prepareGreen: () => {
      events.push('preflight');
      if (fault === 'preflight') return Promise.reject(new Error('invalid env'));
      return Promise.resolve(() => {
        events.push('start');
        if (blueRunning || !stoppedInspected)
          throw new Error('candidate started alongside old writer');
        greenRunning = true;
        if (fault === 'start') return Promise.reject(new Error('candidate startup failed'));
        return Promise.resolve();
      });
    },
    readPhase: () => Promise.resolve('committed'),
    writePhase: () => Promise.resolve(),
    writeAtomic: () => Promise.resolve(),
    sh: async (args) => {
      if (args[0] === 'inspect' && args[2] === '{{.Id}}') return incomingId;
      if (args[0] === 'ps') {
        inventoryReads += 1;
        if (fault === 'race' && inventoryReads > 1) return incomingId;
        return fault === 'idle' || fault === 'unmanaged'
          ? `${outgoingId}\n${incomingId}`
          : outgoingId;
      }
      if (args[0] === 'inspect' && args[1] !== '--format')
        return JSON.stringify(
          args.slice(1).map((identity) => ({
            Id: identity,
            Name:
              identity === outgoingId || fault === 'race'
                ? '/be-01-blue'
                : fault === 'unmanaged'
                  ? '/unmanaged-be'
                  : '/be-01-green',
            ...(fault === 'mount-missing'
              ? {}
              : { Mounts: [{ Type: 'bind', Source: `${ROOT}/data`, RW: true }] }),
          })),
        );
      if (args[0] === 'stop') {
        if (args[1] === outgoingId) {
          events.push('stop-blue');
          const persisted: unknown = JSON.parse(
            await readFile(join(root, 'be-writer-stop.json'), 'utf8'),
          );
          expect(persisted).toMatchObject({ outgoingId });
          if (fault !== 'running') blueRunning = false;
        } else {
          events.push('stop-green');
          greenRunning = false;
        }
        return '';
      }
      if (args[0] === 'inspect') {
        const isBlue = args[3] === outgoingId;
        events.push(isBlue ? 'inspect-blue' : 'inspect-green');
        if (isBlue && fault === 'missing') throw new Error('No such container');
        if (isBlue) stoppedInspected = true;
        return JSON.stringify({
          Id: isBlue && fault !== 'wrong-id' ? outgoingId : incomingId,
          State: {
            Running: isBlue ? blueRunning : greenRunning,
            Paused: false,
            Restarting: false,
            Status: (isBlue ? blueRunning : greenRunning) ? 'running' : 'exited',
          },
        });
      }
      if (args[0] === 'network') {
        events.push('alias');
        expect(await readFile(join(root, 'be-writer-exposure.json'), 'utf8')).toContain(image);
        if (fault === 'alias') throw new Error('alias operation partly applied');
        return '';
      }
      throw new Error(`unexpected docker command ${args.join(' ')}`);
    },
  };
  const planned = planSwap('be', {
    routedColor: 'blue',
    recordedColor: 'blue',
    runningColors: ['blue'],
    phase: 'committed',
  });
  // Drive the real planned prefix; vocabulary/migration tests exercise their own real boundaries.
  const steps = planned.steps.slice(0, planned.steps.indexOf('stored-vocabularies'));
  return {
    root,
    io,
    events,
    plan: { ...planned, steps },
    isBlueRunning: () => blueRunning,
    isGreenRunning: () => greenRunning,
  };
}

test('preflight refusal leaves the outgoing writer serving and creates no stop intent', async () => {
  const attempt = await fixture('preflight');
  await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'invalid env');
  expect(attempt.events).toEqual(['preflight']);
  expect(attempt.isBlueRunning()).toBe(true);
  await assertNoWriterBarrier(attempt.root);
});

test('candidate starts only after exact outgoing ID was stopped and inspected', async () => {
  const attempt = await fixture();
  await execute(attempt.plan, image, 'deadbeef', attempt.io);
  expect(attempt.events).toEqual(['preflight', 'stop-blue', 'inspect-blue', 'start']);
  expect(attempt.isBlueRunning()).toBe(false);
  await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'explicit recovery');
  expect(attempt.events).toEqual(['preflight', 'stop-blue', 'inspect-blue', 'start']);
});

for (const fault of ['running', 'wrong-id', 'missing'] as const) {
  test(`a zero-exit stop with ${fault} inspection cannot start the candidate`, async () => {
    const attempt = await fixture(fault);
    await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'explicit recovery');
    expect(attempt.events).not.toContain('start');
    await refuses(assertNoWriterBarrier(attempt.root), 'explicit recovery');
  });
}

test('startup failure stops and verifies candidate while retaining old writer stop intent', async () => {
  const attempt = await fixture('start');
  await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'explicit recovery');
  expect(attempt.events).toEqual([
    'preflight',
    'stop-blue',
    'inspect-blue',
    'start',
    'stop-green',
    'inspect-green',
  ]);
  expect(attempt.isBlueRunning()).toBe(false);
  expect(attempt.isGreenRunning()).toBe(false);
  await refuses(assertNoWriterBarrier(attempt.root), 'explicit recovery');
});

test('possible alias exposure is persisted before an alias operation can partly fail', async () => {
  const attempt = await fixture('alias');
  const plan = {
    ...attempt.plan,
    steps: [...attempt.plan.steps, 'record-writer-exposure' as const, 'grant-alias' as const],
  };
  await refuses(execute(plan, image, 'deadbeef', attempt.io), 'explicit recovery');
  expect(attempt.events).toContain('alias');
  expect(attempt.events).not.toContain('stop-green');
  expect(attempt.isBlueRunning()).toBe(false);
  expect(await readFile(join(attempt.root, 'be-writer-exposure.json'), 'utf8')).toContain(image);
});

for (const state of [
  null,
  {},
  { Running: false, Paused: true, Restarting: false, Status: 'exited' },
  { Running: false, Paused: false, Restarting: true, Status: 'exited' },
]) {
  test(`malformed or active container state refuses stop proof ${JSON.stringify(state)}`, async () => {
    await refuses(
      assertContainerStopped(outgoingId, () =>
        Promise.resolve(JSON.stringify({ Id: outgoingId, State: state })),
      ),
    );
  });
}

for (const mounts of [
  [{ Type: 'bind', Source: `${ROOT}/data`, RW: true }],
  [{ Type: 'bind', Source: ROOT, RW: true }],
  [{ Type: 'bind', Source: `${ROOT}/data/wbs.db`, RW: true }],
]) {
  test(`an unmanaged container with writable database overlap refuses admission ${JSON.stringify(mounts)}`, async () => {
    await refuses(
      inspectBackendWriters((args) =>
        Promise.resolve(
          args[0] === 'ps'
            ? incomingId
            : JSON.stringify([{ Id: incomingId, Name: '/unmanaged-be', Mounts: mounts }]),
        ),
      ),
      'unmanaged database writer',
    );
  });
}

test('an incomplete Docker inspect inventory cannot establish exclusive writers', async () => {
  await refuses(
    inspectBackendWriters((args) =>
      Promise.resolve(args[0] === 'ps' ? `${outgoingId}\n${incomingId}` : '[]'),
    ),
    'incomplete',
  );
});

async function refuses(operation: Promise<unknown>, text?: string): Promise<void> {
  let failure = '';
  try {
    await operation;
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : String(cause);
  }
  expect(failure).not.toBe('');
  if (text !== undefined) expect(failure).toContain(text);
}

test('read-only unmanaged data mounts are permitted without stopping unrelated containers', async () => {
  const commands: string[][] = [];
  const writers = await inspectBackendWriters((args) => {
    commands.push(args);
    return Promise.resolve(
      args[0] === 'ps'
        ? incomingId
        : JSON.stringify([
            {
              Id: incomingId,
              Name: '/backup-reader',
              Mounts: [{ Type: 'bind', Source: `${ROOT}/data`, RW: false }],
            },
          ]),
    );
  });
  expect(writers.size).toBe(0);
  expect(commands.some((args) => args[0] === 'stop')).toBe(false);
});

test('recovery refuses old replay capability before any writer restart', async () => {
  const previousImage = `registry/wbs-be-01@sha256:${'d'.repeat(64)}`;
  const commands: string[][] = [];
  await refuses(
    checkBackendRecovery(previousImage, image, '/data/wbs.db', (args) => {
      commands.push(args);
      if (args[0] === 'ps') return Promise.resolve('');
      return Promise.resolve(
        args.some((argument) => argument.includes('move_progress_v1'))
          ? '[{"kind":"move_progress_v1","count":1}]'
          : '[]',
      );
    }),
    'recovery image cannot read',
  );
  expect(commands.some((args) => args[0] === 'start' || args[0] === 'stop')).toBe(false);
  for (const args of commands.filter((args) => args[0] === 'run')) {
    expect(args).toContain('none');
    expect(args).toContain(`type=bind,source=${ROOT}/data,target=/data,readonly`);
    expect(args.includes(image) || args.includes(previousImage)).toBe(true);
  }
});

test('backend preparation validates frozen Compose input before returning its no-pull start', async () => {
  const events: string[] = [];
  const root = await mkdtemp(join(tmpdir(), 'backend-preflight-'));
  roots.push(root);
  await mkdir(join(root, 'data'));
  const sqlite = new Database(join(root, 'data/wbs.db'));
  sqlite.run(
    'CREATE TABLE __drizzle_migrations (name text); INSERT INTO __drizzle_migrations VALUES ("baseline");',
  );
  sqlite.close();
  const start = await prepareBackend(
    'be',
    'green',
    image,
    '/fixture/be.phase',
    backendPreparation(root, events),
  );
  expect(events).toEqual(['read', 'read', 'read', 'write', 'write', 'config']);
  await start();
  expect(events.slice(-2)).toEqual(['phase', 'start:never']);
  expect(events.filter((event) => event === 'read')).toHaveLength(3);
});

test('complete backend plan commits only after health, vocabulary recheck, and persisted exposure', async () => {
  const attempt = await fixture();
  const docker = attempt.io.sh;
  const order: string[] = [];
  let storedReads = 0;
  const io: SwapExecutionIo = {
    ...attempt.io,
    healthGate: () => {
      order.push('health');
      return Promise.resolve();
    },
    readRouting: () => Promise.resolve({ be: 'blue', gw: 'blue', fe: 'blue' }),
    readExposure: () => Promise.resolve(false),
    readSite: () => Promise.resolve('old site config'),
    reload: () => {
      order.push('reload');
      return Promise.resolve();
    },
    readCaddyConfig: () =>
      Promise.resolve(
        JSON.stringify({
          apps: {
            http: {
              servers: {
                main: {
                  routes: [
                    {
                      match: [{ host: ['wbs.bulletpoints.club'] }],
                      handle: [
                        { handler: 'reverse_proxy', upstreams: [{ dial: 'be-01-green:3100' }] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        }),
      ),
    writeAtomic: (path) => {
      if (path.endsWith('be.json')) order.push('commit');
      return Promise.resolve();
    },
    sh: (args) => {
      if (args.includes('printenv')) return Promise.resolve('/data/wbs.db');
      if (args.includes('src/migrate-status-cli.ts')) {
        const flag = (name: string) =>
          args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
        return Promise.resolve(
          JSON.stringify({
            format: 'applied-migration-set',
            version: 1,
            target: flag('target'),
            attempt: flag('attempt'),
            candidate: flag('candidate'),
            applied: [],
            pending: [],
          }),
        );
      }
      if (args.includes('src/backup-db-cli.ts'))
        return Promise.resolve(JSON.stringify({ path: args.at(-1), migrations: ['baseline'] }));
      if (args.includes('src/migrate-cli.ts')) {
        return readFile(join(attempt.root, 'be-writer-migration.json'), 'utf8').then((contents) => {
          const metadata: unknown = JSON.parse(contents);
          expect(metadata).toMatchObject({
            candidate: image,
            capture: { databasePath: '/data/wbs.db' },
          });
          order.push('migrate');
          return 'migrated';
        });
      }
      if (args.includes('src/backfill-step-codes-cli.ts')) {
        order.push('backfill');
        return Promise.resolve('step codes backfilled: 0');
      }
      if (args[0] === 'exec') {
        storedReads += 1;
        return Promise.resolve('[]');
      }
      if (args[0] === 'network') order.push('alias');
      return docker(args);
    },
  };
  const plan = planSwap('be', {
    routedColor: 'blue',
    recordedColor: 'blue',
    runningColors: ['blue'],
    phase: 'committed',
  });
  await execute(plan, image, 'deadbeef', io);
  expect(order).toEqual(['migrate', 'health', 'backfill', 'alias', 'alias', 'reload', 'commit']);
  expect(storedReads).toBe(32);
  await assertNoWriterBarrier(attempt.root);
});

test('a symlink alias to shared data is an unmanaged writer after realpath resolution', async () => {
  await refuses(
    inspectBackendWriters(
      (args) =>
        Promise.resolve(
          args[0] === 'ps'
            ? incomingId
            : JSON.stringify([
                {
                  Id: incomingId,
                  Name: '/aliased-writer',
                  Mounts: [{ Type: 'bind', Source: '/aliased-db', RW: true }],
                },
              ]),
        ),
      (path) => Promise.resolve(path === '/aliased-db' ? `${ROOT}/data` : path),
    ),
    'unmanaged database writer',
  );
});

test('a pre-existing idle backend is stopped and inspected before the new candidate starts', async () => {
  const attempt = await fixture('idle');
  await execute(attempt.plan, image, 'deadbeef', attempt.io);
  expect(attempt.events).toEqual([
    'preflight',
    'stop-blue',
    'stop-green',
    'inspect-blue',
    'inspect-green',
    'start',
  ]);
});

test('a replaced backend identity during the outage refuses candidate startup', async () => {
  const attempt = await fixture('race');
  await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'identities changed');
  expect(attempt.events).not.toContain('start');
  await refuses(assertNoWriterBarrier(attempt.root), 'explicit recovery');
});

for (const fault of ['unmanaged', 'mount-missing'] as const) {
  test(`${fault} writer inventory refuses without stopping any container`, async () => {
    const attempt = await fixture(fault);
    await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io));
    expect(attempt.events).toEqual(['preflight']);
    expect(attempt.isBlueRunning()).toBe(true);
    await assertNoWriterBarrier(attempt.root);
  });
}

for (const inspected of [
  null,
  { Id: outgoingId, Mounts: [] },
  { Id: outgoingId, Name: '/be-01-blue' },
  { Id: outgoingId, Name: '/be-01-blue', Mounts: [null] },
  { Id: outgoingId, Name: '/be-01-blue', Mounts: [{ Type: 'bind', Source: `${ROOT}/data` }] },
  { Id: outgoingId, Name: '/be-01-blue', Mounts: [{ Type: 'bind', RW: true }] },
  { Id: outgoingId, Name: '/be-01-blue', Mounts: [{ Source: `${ROOT}/data`, RW: true }] },
  { Id: outgoingId, Name: '/be-01-blue', Mounts: [{ Type: 'bind', Source: 'relative', RW: true }] },
  { Id: incomingId, Name: '/be-01-blue', Mounts: [] },
]) {
  test(`missing or malformed writer metadata refuses ${JSON.stringify(inspected)}`, async () => {
    await refuses(
      inspectBackendWriters((args) =>
        Promise.resolve(args[0] === 'ps' ? outgoingId : JSON.stringify([inspected])),
      ),
      JSON.stringify(inspected).includes('relative') ? 'absolute host source' : 'malformed',
    );
  });
}

function backendPreparation(
  root: string,
  events: string[],
): NonNullable<Parameters<typeof prepareBackend>[4]> {
  const oidcPath = '/fixture/oidc.env';
  return {
    databaseHostRoot: root,
    oidcEnvPath: oidcPath,
    readText: (path) => {
      events.push('read');
      if (path.endsWith('/be-01.env'))
        return Promise.resolve(
          'PORT=3100\nLOG_LEVEL=info\nGW_URL=http://gw-01:3200\nDB_PATH=/data/wbs.db\nAUTH_MODE=oidc\nAUTH_METHODS=none\nBROWSER_SESSION_AUTHORITY=disabled\n',
        );
      if (path === oidcPath)
        return Promise.resolve(
          'AUTH_ISSUER_DISCOVERY_URL=https://issuer.example/\nAUTH_CLIENT_ID=client\nAUTH_CLIENT_SECRET=client-secret-value\nAUTH_REDIRECT_URI=https://wbs.example/api/auth/okta/callback\nAUTH_AUDIENCE=https://api.example\n',
        );
      return Promise.resolve(
        'INTERNAL_AUTH_SECRET=shared-internal-secret-value-of-32-chars\nJWT_SIGNING_KEY_CURRENT=signing-key-value-at-least-32-characters\n',
      );
    },
    writeAtomicFile: () => {
      events.push('write');
      return Promise.resolve();
    },
    writePhaseFile: () => {
      events.push('phase');
      return Promise.resolve();
    },
    runDocker: (args) => {
      events.push(
        args.includes('config')
          ? 'config'
          : `start:${args[args.indexOf('--pull') + 1] ?? 'unknown'}`,
      );
      return Promise.resolve('');
    },
  };
}

for (const fault of ['absent', 'empty-ledger', 'corrupt'] as const) {
  test(`backend preflight refuses ${fault} database before phase or Compose writes`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'backend-preflight-fault-'));
    roots.push(root);
    await mkdir(join(root, 'data'));
    if (fault !== 'absent') {
      const sqlite = new Database(join(root, 'data/wbs.db'));
      if (fault === 'empty-ledger') sqlite.run('CREATE TABLE __drizzle_migrations (name text);');
      sqlite.close();
      if (fault === 'corrupt') await Bun.write(join(root, 'data/wbs.db'), 'not a SQLite file');
    }
    const events: string[] = [];
    await refuses(
      prepareBackend('be', 'green', image, '/fixture/be.phase', backendPreparation(root, events)),
    );
    expect(events).toEqual(['read', 'read', 'read']);
  });
}

test('backend preflight refuses a DB_PATH outside its mounted data directory', async () => {
  const attempt = await fixture();
  const events: string[] = [];
  const prepared = backendPreparation(attempt.root, events);
  await refuses(
    prepareBackend('be', 'green', image, '/fixture/be.phase', {
      ...prepared,
      readText: async (path) =>
        (await prepared.readText(path)).replace('DB_PATH=/data/wbs.db', 'DB_PATH=/outside/wbs.db'),
    }),
    'outside the mounted data directory',
  );
  expect(events).toEqual(['read', 'read', 'read']);
});
