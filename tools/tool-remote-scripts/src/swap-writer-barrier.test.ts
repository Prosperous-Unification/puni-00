import { rejects } from 'node:assert/strict';
import { chmod, link, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, spyOn, test } from 'bun:test';

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
const maintenanceId = 'd'.repeat(64);
const previousImage = `registry/wbs-be-01@sha256:${'e'.repeat(64)}`;
const image = 'registry/wbs-be-01@sha256:' + 'c'.repeat(64);

async function fixture(
  fault:
    | 'none'
    | 'dependency-before'
    | 'dependency-after'
    | 'first-install'
    | 'preflight'
    | 'running'
    | 'wrong-id'
    | 'missing'
    | 'start'
    | 'alias'
    | 'idle'
    | 'race'
    | 'unmanaged'
    | 'mount-missing'
    | 'database-file'
    | 'database-live'
    | 'database-alias'
    | 'database-destination'
    | 'database-env-missing'
    | 'idle-database'
    | 'preboot-replay'
    | 'outgoing-file-bind'
    | 'outgoing-wal-shadow'
    | 'maintenance-drift'
    | 'maintenance-running'
    | 'migration-failure' = 'none',
) {
  const root = await mkdtemp(join(tmpdir(), 'compose-writer-'));
  roots.push(root);
  const events: string[] = [];
  let blueRunning = fault !== 'first-install';
  let greenRunning = fault === 'idle';
  let inventoryReads = 0;
  let dependencyReads = 0;
  let stoppedInspected = fault === 'first-install';
  const io: SwapExecutionIo = {
    namespaceProof: () => Promise.resolve(),
    barrierStateDir: root,
    captureStateDir: root,
    resolveMount: (path) =>
      Promise.resolve(
        (fault === 'database-alias' && path === '/aliased-data/production.db') ||
          (fault === 'outgoing-file-bind' && path === `${ROOT}/data/other.db`)
          ? `${ROOT}/data/wbs.db`
          : path,
      ),
    prepareBackend: () => {
      events.push('preflight');
      if (fault === 'preflight') return Promise.reject(new Error('invalid env'));
      return Promise.resolve({
        databasePath: '/data/wbs.db',
        databaseHostPath: `${ROOT}/data/wbs.db`,
        imageId: `sha256:${'c'.repeat(64)}`,
        snapshots: {
          application: { path: '/application.json', sha256: 'e'.repeat(64) },
          maintenance: { path: '/maintenance.json', sha256: 'f'.repeat(64) },
        },
        startMaintenance: () => {
          events.push('maintenance');
          greenRunning = true;
          return Promise.resolve(maintenanceId);
        },
        verifyMaintenance: () =>
          fault === 'maintenance-drift'
            ? Promise.reject(new Error('maintenance identity drift'))
            : Promise.resolve(),
        start: async () => {
          expect(await readFile(join(root, 'be-writer-exposure.json'), 'utf8')).toContain(image);
          events.push('start');
          if (blueRunning || !stoppedInspected)
            throw new Error('candidate started alongside old writer');
          greenRunning = true;
          if (fault === 'start') return Promise.reject(new Error('candidate startup failed'));
          return Promise.resolve();
        },
      });
    },
    readPhase: () => Promise.resolve('committed'),
    writePhase: () => Promise.resolve(),
    writeAtomic: () => Promise.resolve(),
    sh: async (args) => {
      if (args.includes('src/dependency-capabilities-cli.ts'))
        return Promise.resolve(
          JSON.stringify({
            protocol: 'wbs-dependency-runtime',
            version: 1,
            role: 'backend',
            semantics: [],
          }),
        );
      if (args.includes('printenv')) return '/data/wbs.db';
      if (args.includes('src/backup-db-cli.ts'))
        return JSON.stringify({ path: args.at(-1), migrations: ['baseline'] });
      if (args.includes('src/migrate-status-cli.ts')) {
        const flag = (name: string) =>
          args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
        return JSON.stringify({
          format: 'applied-migration-set',
          version: 1,
          target: flag('target'),
          attempt: flag('attempt'),
          candidate: flag('candidate'),
          applied: [],
          pending: [],
        });
      }
      if (args.includes('src/migrate-cli.ts')) {
        expect(await readFile(join(root, 'be-writer-maintenance.json'), 'utf8')).toContain(
          maintenanceId,
        );
        expect(await readFile(join(root, 'be-writer-migration.json'), 'utf8')).toContain(image);
        if (fault === 'migration-failure') throw new Error('migration interrupted');
        return 'migrated';
      }
      if (args[0] === 'image' && args[3] === '{{json .}}')
        return JSON.stringify({
          Id: `sha256:${(args.at(-1) === previousImage ? 'e' : 'c').repeat(64)}`,
        });
      if (args[0] === 'image') return image;
      if (args[0] === 'run') {
        if (args.some((argument) => argument.includes('wbs-dependency-preservation'))) {
          dependencyReads += 1;
          if (
            fault === 'dependency-before' ||
            (fault === 'dependency-after' && events.includes('stop-green'))
          )
            throw new Error('dependency authority changed');
          return JSON.stringify({
            protocol: 'wbs-dependency-preservation',
            version: 1,
            state: 'DISABLED',
            externalRelationships: 0,
          });
        }
        expect(args).toContain('none');
        expect(args).toContain(
          `type=bind,source=${ROOT}/data,target=/data,readonly,bind-propagation=rprivate,bind-recursive=readonly`,
        );
        if (
          fault === 'preboot-replay' &&
          args.some((argument) => argument.includes('move_progress_v1'))
        )
          return '[{"kind":"move_progress_v1","count":1}]';
        return '[]';
      }
      if (args[0] === 'inspect' && args[2] === '{{.Id}}') return incomingId;
      if (args[0] === 'ps') {
        if (events.includes('maintenance'))
          return fault === 'first-install' ? maintenanceId : `${outgoingId}\n${maintenanceId}`;
        if (fault === 'first-install') return '';
        inventoryReads += 1;
        if (fault === 'race' && inventoryReads > 1) return incomingId;
        return fault === 'idle' || fault === 'idle-database' || fault === 'unmanaged'
          ? `${outgoingId}\n${incomingId}`
          : outgoingId;
      }
      if (args[0] === 'inspect' && args[1] !== '--format')
        return JSON.stringify(
          (args[1] === '--type' ? args.slice(3) : args.slice(1)).map((identity) => ({
            Id: identity,
            Image: `sha256:${(identity === maintenanceId ? 'c' : 'e').repeat(64)}`,
            Config: {
              Image: identity === maintenanceId ? image : previousImage,
              Env:
                fault === 'database-env-missing'
                  ? []
                  : [
                      fault === 'database-file' ||
                      fault === 'outgoing-file-bind' ||
                      (fault === 'idle-database' && identity === incomingId)
                        ? 'DB_PATH=/data/other.db'
                        : fault === 'database-live' || fault === 'database-alias'
                          ? 'DB_PATH=/live/production.db'
                          : 'DB_PATH=/data/wbs.db',
                    ],
            },
            Name:
              identity === outgoingId || fault === 'race'
                ? '/be-01-blue'
                : fault === 'unmanaged'
                  ? '/unmanaged-be'
                  : '/be-01-green',
            ...(fault === 'mount-missing'
              ? {}
              : {
                  Mounts:
                    fault === 'database-live' || fault === 'database-alias'
                      ? [
                          {
                            Type: 'bind',
                            Source: `${ROOT}/data`,
                            Destination: '/unused-backups',
                            RW: true,
                          },
                          {
                            Type: 'bind',
                            Source:
                              fault === 'database-alias' ? '/aliased-data' : '/actual-production',
                            Destination: '/live',
                            RW: true,
                          },
                        ]
                      : [
                          {
                            Type: 'bind',
                            Source: `${ROOT}/data`,
                            Destination:
                              fault === 'database-destination' ? '/unused-backups' : '/data',
                            RW: true,
                          },
                          ...(fault === 'outgoing-file-bind' || fault === 'outgoing-wal-shadow'
                            ? [
                                {
                                  Type: 'bind',
                                  Source: `${ROOT}/data/wbs.db${fault === 'outgoing-wal-shadow' ? '-wal' : ''}`,
                                  Destination:
                                    fault === 'outgoing-file-bind'
                                      ? '/data/other.db'
                                      : '/data/wbs.db-wal',
                                  RW: true,
                                },
                              ]
                            : []),
                        ],
                }),
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
          if (fault !== 'maintenance-running') greenRunning = false;
        }
        return '';
      }
      if (args[0] === 'inspect') {
        const isBlue = args[3] === outgoingId;
        events.push(isBlue ? 'inspect-blue' : 'inspect-green');
        if (isBlue && fault === 'missing') throw new Error('No such container');
        if (isBlue) stoppedInspected = true;
        return JSON.stringify({
          Id:
            args[3] === maintenanceId
              ? maintenanceId
              : isBlue && fault !== 'wrong-id'
                ? outgoingId
                : incomingId,
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
    routedColor: fault === 'first-install' ? null : 'blue',
    recordedColor: fault === 'first-install' ? null : 'blue',
    runningColors: fault === 'first-install' ? [] : ['blue'],
    phase: 'committed',
  });
  // Drive the real planned prefix; vocabulary/migration tests exercise their own real boundaries.
  const steps = planned.steps.slice(0, planned.steps.indexOf('stored-vocabularies'));
  return {
    root,
    io,
    events,
    dependencyReads: () => dependencyReads,
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
  expect(attempt.events).toEqual([
    'preflight',
    'stop-blue',
    'inspect-blue',
    'inspect-blue',
    'maintenance',
    'stop-green',
    'inspect-green',
    'inspect-blue',
    'inspect-green',
    'start',
  ]);
  expect(attempt.isBlueRunning()).toBe(false);
  await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'explicit recovery');
  expect(attempt.events).toEqual([
    'preflight',
    'stop-blue',
    'inspect-blue',
    'inspect-blue',
    'maintenance',
    'stop-green',
    'inspect-green',
    'inspect-blue',
    'inspect-green',
    'start',
  ]);
});

for (const fault of ['running', 'wrong-id', 'missing'] as const) {
  test(`a zero-exit stop with ${fault} inspection cannot start the candidate`, async () => {
    const attempt = await fixture(fault);
    await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'explicit recovery');
    expect(attempt.events).not.toContain('start');
    await refuses(assertNoWriterBarrier(attempt.root), 'explicit recovery');
  });
}

test('startup failure retains boot exposure and never authorizes schema recovery', async () => {
  const attempt = await fixture('start');
  await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'explicit recovery');
  expect(attempt.events).toEqual([
    'preflight',
    'stop-blue',
    'inspect-blue',
    'inspect-blue',
    'maintenance',
    'stop-green',
    'inspect-green',
    'inspect-blue',
    'inspect-green',
    'start',
  ]);
  expect(attempt.isBlueRunning()).toBe(false);
  expect(attempt.isGreenRunning()).toBe(true);
  await refuses(assertNoWriterBarrier(attempt.root), 'explicit recovery');
});

test('possible alias exposure is persisted before an alias operation can partly fail', async () => {
  const attempt = await fixture('alias');
  const plan = {
    ...attempt.plan,
    steps: [...attempt.plan.steps, 'grant-alias' as const],
  };
  await refuses(execute(plan, image, 'deadbeef', attempt.io), 'explicit recovery');
  expect(attempt.events).toContain('alias');
  expect(attempt.events.filter((event) => event === 'stop-green')).toHaveLength(1);
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
  [{ Type: 'bind', Source: `${ROOT}/data`, Destination: '/data', RW: true }],
  [{ Type: 'bind', Source: ROOT, Destination: '/data', RW: true }],
  [{ Type: 'bind', Source: `${ROOT}/data/wbs.db`, Destination: '/data', RW: true }],
]) {
  test(`an unmanaged container with writable database overlap refuses admission ${JSON.stringify(mounts)}`, async () => {
    await refuses(
      inspectWriters((args) =>
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
    inspectWriters((args) =>
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
  const writers = await inspectWriters((args) => {
    commands.push(args);
    return Promise.resolve(
      args[0] === 'ps'
        ? incomingId
        : JSON.stringify([
            {
              Id: incomingId,
              Name: '/backup-reader',
              Mounts: [{ Type: 'bind', Source: `${ROOT}/data`, Destination: '/data', RW: false }],
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
      if (args.some((argument) => argument.includes('wbs-dependency-preservation')))
        return Promise.resolve(
          JSON.stringify({
            protocol: 'wbs-dependency-preservation',
            version: 1,
            state: 'DISABLED',
            externalRelationships: 0,
          }),
        );
      if (args.includes('src/dependency-capabilities-cli.ts'))
        return Promise.resolve(
          JSON.stringify({
            protocol: 'wbs-dependency-runtime',
            version: 1,
            role: 'backend',
            semantics: [],
          }),
        );
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
  for (const args of commands.filter(
    (args) => args[0] === 'run' && !args.includes('src/dependency-capabilities-cli.ts'),
  )) {
    expect(args).toContain('none');
    expect(args).toContain(
      `type=bind,source=${ROOT}/data,target=/data,readonly,bind-propagation=rprivate,bind-recursive=readonly`,
    );
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
  expect(events).toEqual(['read', 'read', 'read', 'write', 'write', 'config', 'write', 'write']);
  await start.start();
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
      if (args.some((argument) => argument.includes('wbs-dependency-preservation')))
        return Promise.resolve(
          JSON.stringify({
            protocol: 'wbs-dependency-preservation',
            version: 1,
            state: 'DISABLED',
            externalRelationships: 0,
          }),
        );
      if (args.includes('src/dependency-capabilities-cli.ts'))
        return Promise.resolve(
          JSON.stringify({
            protocol: 'wbs-dependency-runtime',
            version: 1,
            role: 'backend',
            semantics: [],
          }),
        );
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
    inspectWriters(
      (args) =>
        Promise.resolve(
          args[0] === 'ps'
            ? incomingId
            : JSON.stringify([
                {
                  Id: incomingId,
                  Name: '/aliased-writer',
                  Mounts: [{ Type: 'bind', Source: '/aliased-db', Destination: '/data', RW: true }],
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
    'inspect-blue',
    'inspect-green',
    'maintenance',
    'stop-green',
    'inspect-green',
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
  {
    Id: outgoingId,
    Name: '/be-01-blue',
    Mounts: [{ Type: 'bind', Destination: '/data', RW: true }],
  },
  {
    Id: outgoingId,
    Name: '/be-01-blue',
    Mounts: [{ Source: `${ROOT}/data`, Destination: '/data', RW: true }],
  },
  {
    Id: outgoingId,
    Name: '/be-01-blue',
    Mounts: [{ Type: 'bind', Source: 'relative', Destination: '/data', RW: true }],
  },
  { Id: incomingId, Name: '/be-01-blue', Mounts: [] },
]) {
  test(`missing or malformed writer metadata refuses ${JSON.stringify(inspected)}`, async () => {
    await refuses(
      inspectWriters((args) =>
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
  const frozen = new Map<string, string>();
  return {
    databaseHostRoot: root,
    resolveMount: (path) => realpath(path.replace(ROOT, root)),
    oidcEnvPath: oidcPath,
    readText: (path) => {
      if (frozen.has(path)) return Promise.resolve(frozen.get(path)!);
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
    writeAtomicFile: (path, contents) => {
      frozen.set(path, contents);
      events.push('write');
      return Promise.resolve();
    },
    writePhaseFile: () => {
      events.push('phase');
      return Promise.resolve();
    },
    runDocker: (args) => {
      if (args[0] === 'image')
        return Promise.resolve(
          args[3] === '{{.Id}}'
            ? `sha256:${'c'.repeat(64)}`
            : JSON.stringify('/app/apps/wbs/be-01'),
        );
      events.push(
        args.includes('config')
          ? 'config'
          : `start:${args[args.indexOf('--pull') + 1] ?? 'unknown'}`,
      );
      return Promise.resolve(
        args.includes('config')
          ? JSON.stringify({
              name: 'wbs',
              services: {
                'be-01-green': {
                  init: true,
                  container_name: 'be-01-green',
                  image,
                  environment: { DB_PATH: '/data/wbs.db' },
                  networks: { 'wbs-net': { aliases: ['be-01-green'] } },
                  volumes: [{ type: 'bind', source: `${ROOT}/data`, target: '/data' }],
                },
              },
            })
          : '',
      );
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

function inspectWriters(
  runDocker: SwapExecutionIo['sh'],
  resolveMount: (path: string) => Promise<string> = (path) => Promise.resolve(path),
) {
  return inspectBackendWriters(runDocker, `${ROOT}/data/wbs.db`, resolveMount, image, () =>
    Promise.resolve(),
  );
}

for (const fault of [
  'database-file',
  'database-live',
  'database-destination',
  'database-env-missing',
] as const) {
  test(`effective outgoing ${fault} refuses before stop intent`, async () => {
    const attempt = await fixture(fault);
    await refuses(
      execute(attempt.plan, image, 'deadbeef', attempt.io),
      fault === 'database-env-missing' ? 'DB_PATH' : 'database',
    );
    expect(attempt.events).toEqual(['preflight']);
    expect(attempt.isBlueRunning()).toBe(true);
    await assertNoWriterBarrier(attempt.root);
  });
}

test('renamed outgoing main-file aliases refuse before writer stop', async () => {
  const attempt = await fixture('database-alias');
  await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'database family');
  expect(attempt.events).not.toContain('stop');
});

for (const fault of ['alias', 'ports', 'dependency'] as const) {
  test(`effective merged ${fault} refuses before candidate start or phase`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'merged-backend-refusal-'));
    roots.push(root);
    await mkdir(join(root, 'data'));
    const sqlite = new Database(join(root, 'data/wbs.db'));
    sqlite.run(
      'CREATE TABLE __drizzle_migrations (name text); INSERT INTO __drizzle_migrations VALUES ("baseline");',
    );
    sqlite.close();
    const events: string[] = [];
    const prepared = backendPreparation(root, events);
    await refuses(
      prepareBackend('be', 'green', image, '/fixture/be.phase', {
        ...prepared,
        runDocker: async (args) => {
          const output = await prepared.runDocker(args);
          const config = JSON.parse(output) as {
            services: { 'be-01-green': Record<string, unknown> };
          };
          if (fault === 'alias')
            config.services['be-01-green']['networks'] = {
              'wbs-net': { aliases: ['be-01-green', 'be-01.internal'] },
            };
          if (fault === 'ports')
            config.services['be-01-green']['ports'] = [{ target: 3100, published: '3100' }];
          if (fault === 'dependency')
            config.services['be-01-green']['depends_on'] = {
              'be-01-blue': { condition: 'service_started' },
            };
          return JSON.stringify(config);
        },
      }),
      'unsafe candidate',
    );
    expect(events).toEqual(['read', 'read', 'read', 'write', 'write', 'config']);
  });
}

test('backend startup force-recreates a private resolved snapshot and preserves literal environment dollars', async () => {
  const root = await mkdtemp(join(tmpdir(), 'snapshot-backend-'));
  roots.push(root);
  await mkdir(join(root, 'data'));
  const sqlite = new Database(join(root, 'data/wbs.db'));
  sqlite.run(
    'CREATE TABLE __drizzle_migrations (name text); INSERT INTO __drizzle_migrations VALUES ("baseline");',
  );
  sqlite.close();
  const events: string[] = [];
  const prepared = backendPreparation(root, events);
  const snapshots = new Map<string, string>();
  const started: string[][] = [];
  const candidate = await prepareBackend('be', 'green', image, '/fixture/be.phase', {
    ...prepared,
    writeAtomicFile: (path, contents, mode) => {
      if (path.endsWith('.compose.json')) {
        expect(mode).toBe(0o600);
        snapshots.set(path, contents);
      }
      return prepared.writeAtomicFile(path, contents, mode);
    },
    runDocker: async (args) => {
      if (args[0] === 'image') return prepared.runDocker(args);
      if (!args.includes('config')) {
        started.push(args);
        return '';
      }
      const output = await prepared.runDocker(args);
      const config = JSON.parse(output) as {
        services: { 'be-01-green': { environment: Record<string, string> } };
      };
      config.services['be-01-green'].environment['TEST_SECRET'] = 'literal$TOKEN';
      return JSON.stringify(config);
    },
  });
  expect(started).toEqual([]);
  await candidate.start();
  const command = started.at(0);
  if (command === undefined) throw new Error('startup command was absent');
  expect(command).toContain('--force-recreate');
  expect(command).toContain('--no-deps');
  expect(command[command.indexOf('--pull') + 1]).toBe('never');
  const snapshot = command.at(command.indexOf('-f') + 1);
  if (snapshot === undefined) throw new Error('startup snapshot was absent');
  expect(snapshots.get(snapshot)).toContain('literal$$TOKEN');
  expect(command.filter((argument) => argument === '-f')).toHaveLength(1);
});

test('an idle backend opening a different filename refuses before either writer stops', async () => {
  const attempt = await fixture('idle-database');
  await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'database identity differs');
  expect(attempt.events).toEqual(['preflight']);
  await assertNoWriterBarrier(attempt.root);
});

test('a candidate file-bind override cannot switch databases after app environment validation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'candidate-database-identity-'));
  roots.push(root);
  await mkdir(join(root, 'data'));
  for (const name of ['wbs.db', 'other.db']) {
    const sqlite = new Database(join(root, 'data', name));
    sqlite.run(
      'CREATE TABLE __drizzle_migrations (name text); INSERT INTO __drizzle_migrations VALUES ("baseline");',
    );
    sqlite.close();
  }
  const events: string[] = [];
  const prepared = backendPreparation(root, events);
  await refuses(
    prepareBackend('be', 'green', image, '/fixture/be.phase', {
      ...prepared,
      runDocker: async (args) => {
        const config = JSON.parse(await prepared.runDocker(args)) as {
          services: { 'be-01-green': { volumes: unknown[] } };
        };
        config.services['be-01-green'].volumes.push({
          type: 'bind',
          source: `${ROOT}/data/other.db`,
          target: '/data/wbs.db',
        });
        return JSON.stringify(config);
      },
    }),
    'database family',
  );
  expect(events).toEqual(['read', 'read', 'read', 'write', 'write', 'config']);
});

test('unsupported replay history refuses the incoming digest before boot exposure or candidate startup', async () => {
  const attempt = await fixture('preboot-replay');
  await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'move_progress_v1');
  expect(attempt.events).not.toContain('start');
  expect(await Bun.file(join(attempt.root, 'be-writer-exposure.json')).exists()).toBe(false);
  expect(await Bun.file(join(attempt.root, 'be-writer-stop.json')).exists()).toBe(true);
  expect(attempt.isBlueRunning()).toBe(false);
});

for (const fault of ['outgoing-file-bind', 'outgoing-wal-shadow'] as const) {
  test(`outgoing SQLite family ambiguity refuses before stop: ${fault}`, async () => {
    const attempt = await fixture(fault);
    await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'database family');
    expect(attempt.isBlueRunning()).toBe(true);
    expect(attempt.events).not.toContain('stop');
    expect(await Bun.file(join(attempt.root, 'be-writer-stop.json')).exists()).toBe(false);
  });
}

for (const suffix of ['-wal', '-shm']) {
  test(`candidate SQLite sidecar shadow refuses in preparation: ${suffix}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'candidate-sidecar-'));
    roots.push(root);
    await mkdir(join(root, 'data'));
    const sqlite = new Database(join(root, 'data', 'wbs.db'));
    sqlite.run(
      'CREATE TABLE __drizzle_migrations(name TEXT); INSERT INTO __drizzle_migrations VALUES ("baseline");',
    );
    sqlite.close();
    const events: string[] = [];
    const prepared = backendPreparation(root, events);
    await refuses(
      prepareBackend('be', 'green', image, '/fixture/be.phase', {
        ...prepared,
        runDocker: async (args) => {
          const config = JSON.parse(await prepared.runDocker(args)) as {
            services: { 'be-01-green': { volumes: unknown[] } };
          };
          config.services['be-01-green'].volumes.push({
            type: 'bind',
            source: `${ROOT}/data/wbs.db${suffix}`,
            target: `/data/wbs.db${suffix}`,
          });
          return JSON.stringify(config);
        },
      }),
      'database family',
    );
    expect(events).not.toContain('up');
  });
}

for (const kind of [
  'hardlink',
  'wal-hardlink',
  'shm-hardlink',
  'journal-hardlink',
  'directory',
  'absent',
  'unreadable',
  'absent-main',
  'nonregular-main',
] as const) {
  test(`unmanaged physical writer refuses ${kind} before any stop`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'physical-writer-'));
    roots.push(root);
    await mkdir(join(root, 'data'));
    await mkdir(join(root, 'external'));
    const path = join(root, 'data/wbs.db');
    await Bun.write(path, 'main');
    const alias = join(root, 'external/alias.db');
    if (kind.endsWith('hardlink')) {
      const suffix =
        kind === 'hardlink'
          ? ''
          : kind === 'wal-hardlink'
            ? '-wal'
            : kind === 'shm-hardlink'
              ? '-shm'
              : '-journal';
      if (suffix !== '') await Bun.write(`${path}${suffix}`, 'sidecar');
      await link(`${path}${suffix}`, alias);
    }
    if (kind === 'unreadable') {
      await Bun.write(alias, 'other');
      await chmod(join(root, 'external'), 0o000);
    }
    if (kind === 'absent-main') {
      await Bun.write(alias, 'other');
      await rm(path);
    }
    if (kind === 'nonregular-main') {
      await Bun.write(alias, 'other');
      await rm(path);
      await mkdir(path);
    }
    const source = kind === 'directory' ? join(root, 'external') : alias;
    const commands: string[][] = [];
    await refuses(
      inspectBackendWriters(
        (args) => {
          commands.push(args);
          if (args[0] === 'ps') return Promise.resolve(incomingId);
          return Promise.resolve(
            JSON.stringify([
              {
                Id: incomingId,
                Name: '/unmanaged-writer',
                Mounts: [{ Type: 'bind', Source: source, Destination: '/database', RW: true }],
              },
            ]),
          );
        },
        path,
        (host) => realpath(host.replace(`${ROOT}/data`, join(root, 'data'))),
      ),
    );
    if (kind === 'unreadable') await chmod(join(root, 'external'), 0o700);
    expect(commands.some((args) => args[0] === 'stop')).toBe(false);
  });
}

test('an unrelated writable regular file is accepted with distinct physical identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'physical-nonwriter-'));
  roots.push(root);
  await mkdir(join(root, 'data'));
  const path = join(root, 'data/wbs.db');
  const other = join(root, 'unrelated.log');
  await Bun.write(path, 'main');
  await Bun.write(other, 'other');
  const writers = await inspectBackendWriters(
    (args) =>
      Promise.resolve(
        args[0] === 'ps'
          ? incomingId
          : JSON.stringify([
              {
                Id: incomingId,
                Name: '/unrelated-writer',
                Mounts: [{ Type: 'bind', Source: other, Destination: '/log', RW: true }],
              },
            ]),
      ),
    path,
    (host) => realpath(host.replace(`${ROOT}/data`, join(root, 'data'))),
    image,
    () => Promise.resolve(),
  );
  expect(writers.size).toBe(0);
});

for (const fault of ['maintenance-drift', 'maintenance-running', 'migration-failure'] as const) {
  test(`maintenance ${fault} retains recovery authority without app exposure`, async () => {
    const attempt = await fixture(fault);
    await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'explicit recovery');
    expect(attempt.isBlueRunning()).toBe(false);
    expect(attempt.events).not.toContain('start');
    expect(await readFile(join(attempt.root, 'be-writer-maintenance.json'), 'utf8')).toContain(
      maintenanceId,
    );
    await refuses(readFile(join(attempt.root, 'be-writer-exposure.json'), 'utf8'), 'ENOENT');
    await refuses(assertNoWriterBarrier(attempt.root), 'explicit recovery');
  });
}

test('application exposure refuses a plan that omitted exact maintenance stop proof', async () => {
  const attempt = await fixture();
  await refuses(
    execute(
      { ...attempt.plan, steps: attempt.plan.steps.filter((step) => step !== 'stop-maintenance') },
      image,
      'deadbeef',
      attempt.io,
    ),
    'maintenance proof',
  );
  expect(attempt.events).not.toContain('start');
});

test('capture persistence failure retains inert maintenance and never starts app or forward migration', async () => {
  const attempt = await fixture();
  await refuses(
    execute(attempt.plan, image, 'deadbeef', {
      ...attempt.io,
      writeCapture: () => Promise.reject(new Error('capture disk failure')),
    }),
    'capture disk failure',
  );
  expect(attempt.isBlueRunning()).toBe(false);
  expect(attempt.events).not.toContain('start');
  await refuses(readFile(join(attempt.root, 'be-writer-migration.json'), 'utf8'), 'ENOENT');
  await refuses(readFile(join(attempt.root, 'be-writer-exposure.json'), 'utf8'), 'ENOENT');
});

test('failed app exposure publication keeps completed migration evidence and refuses app boot', async () => {
  const attempt = await fixture();
  const original = attempt.io.sh;
  await refuses(
    execute(attempt.plan, image, 'deadbeef', {
      ...attempt.io,
      sh: async (args) => {
        if (args.some((argument) => argument.includes('wbs-dependency-preservation')))
          return Promise.resolve(
            JSON.stringify({
              protocol: 'wbs-dependency-preservation',
              version: 1,
              state: 'DISABLED',
              externalRelationships: 0,
            }),
          );
        if (args.includes('src/dependency-capabilities-cli.ts'))
          return Promise.resolve(
            JSON.stringify({
              protocol: 'wbs-dependency-runtime',
              version: 1,
              role: 'backend',
              semantics: [],
            }),
          );
        const output = await original(args);
        if (args.includes('src/migrate-cli.ts'))
          await mkdir(join(attempt.root, 'be-writer-exposure.json'));
        return output;
      },
    }),
    'explicit recovery',
  );
  expect(attempt.events).not.toContain('start');
  expect(await readFile(join(attempt.root, 'be-writer-migration.json'), 'utf8')).toContain(image);
  expect(attempt.isBlueRunning()).toBe(false);
});

test('altered private maintenance snapshot refuses before container startup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'maintenance-snapshot-'));
  roots.push(root);
  await mkdir(join(root, 'data'));
  const sqlite = new Database(join(root, 'data/wbs.db'));
  sqlite.run(
    'CREATE TABLE __drizzle_migrations (name text); INSERT INTO __drizzle_migrations VALUES ("baseline");',
  );
  sqlite.close();
  const events: string[] = [];
  const prepared = backendPreparation(root, events);
  let tampered = false;
  const candidate = await prepareBackend('be', 'green', image, '/fixture/be.phase', {
    ...prepared,
    readText: (path) =>
      tampered && path.endsWith('.compose.json') ? Promise.resolve('{}') : prepared.readText(path),
  });
  tampered = true;
  await refuses(candidate.startMaintenance(), 'snapshot hash differs');
  expect(events).not.toContain('start:never');
});

for (const fault of ['none', 'id', 'image', 'entrypoint'] as const) {
  test(`prepared maintenance proves exact Docker receipt ${fault} before database CLI`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'maintenance-receipt-'));
    roots.push(root);
    await mkdir(join(root, 'data'));
    const sqlite = new Database(join(root, 'data/wbs.db'));
    sqlite.run(
      'CREATE TABLE __drizzle_migrations (name text); INSERT INTO __drizzle_migrations VALUES ("baseline");',
    );
    sqlite.close();
    const events: string[] = [];
    const prepared = backendPreparation(root, events);
    const commands: string[][] = [];
    const candidate = await prepareBackend('be', 'green', image, '/fixture/be.phase', {
      ...prepared,
      runDocker: async (args, signal) => {
        commands.push(args);
        if (signal?.aborted) throw new Error('observed maintenance abort');
        if (args[0] !== 'inspect') return prepared.runDocker(args);
        if (args[2] === '{{.Id}}') return maintenanceId;
        return JSON.stringify({
          Id: fault === 'id' ? incomingId : maintenanceId,
          Image: `sha256:${(fault === 'image' ? 'd' : 'c').repeat(64)}`,
          State: { Running: true, Paused: false, Restarting: false },
          Config: {
            Image: image,
            Entrypoint:
              fault === 'entrypoint'
                ? ['application']
                : ['bun', '-e', 'setInterval(() => {}, 60000)'],
            Cmd: null,
            WorkingDir: '/app/apps/wbs/be-01',
            Env: ['DB_PATH=/data/wbs.db'],
            Healthcheck: { Test: ['NONE'] },
          },
          HostConfig: {
            Init: true,
            Privileged: false,
            CapAdd: null,
            PidMode: '',
            RestartPolicy: { Name: 'no' },
            PortBindings: null,
          },
          Mounts: [{ Type: 'bind', Source: `${ROOT}/data`, Destination: '/data', RW: true }],
        });
      },
    });
    if (fault === 'none') {
      expect(await candidate.startMaintenance()).toBe(maintenanceId);
      await candidate.verifyMaintenance(maintenanceId);
      expect(commands.filter((args) => args[0] === 'inspect').map((args) => args[3])).toEqual([
        'be-01-green',
        maintenanceId,
        maintenanceId,
      ]);
      const controller = new AbortController();
      controller.abort();
      await refuses(
        candidate.verifyMaintenance(maintenanceId, controller.signal),
        'observed maintenance abort',
      );
    } else await refuses(candidate.startMaintenance(), 'maintenance');
    expect(commands.some((args) => args[0] === 'exec')).toBe(false);
  });
}

for (const fault of ['image-absent', 'image-malformed', 'working-directory-absent'] as const) {
  test(`candidate immutable image metadata ${fault} refuses during preflight`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'maintenance-image-'));
    roots.push(root);
    await mkdir(join(root, 'data'));
    const sqlite = new Database(join(root, 'data/wbs.db'));
    sqlite.run(
      'CREATE TABLE __drizzle_migrations (name text); INSERT INTO __drizzle_migrations VALUES ("baseline");',
    );
    sqlite.close();
    const events: string[] = [];
    const prepared = backendPreparation(root, events);
    await refuses(
      prepareBackend('be', 'green', image, '/fixture/be.phase', {
        ...prepared,
        runDocker: async (args) => {
          if (args[0] === 'image' && args[3] === '{{.Id}}' && fault.startsWith('image'))
            return fault === 'image-absent' ? '' : 'not-a-digest';
          if (args[0] === 'image' && args[3] !== '{{.Id}}' && fault === 'working-directory-absent')
            return 'null';
          const output = await prepared.runDocker(args);
          if (args.includes('config')) {
            const config = JSON.parse(output) as {
              services: Record<string, { working_dir?: string }>;
            };
            config.services['be-01-green'].working_dir = '/app/apps/wbs/be-01';
            return JSON.stringify(config);
          }
          return output;
        },
      }),
      fault.startsWith('image') ? 'image identity' : 'working directory',
    );
    expect(events).not.toContain('phase');
    expect(events).not.toContain('start:never');
  });
}

for (const incompatible of ['candidate', 'rollback'] as const) {
  test(`preserve-only recovery refuses enabled-empty ${incompatible} image incompatibility`, async () => {
    const previous = `registry/wbs-be-01@sha256:${'e'.repeat(64)}`;
    const commands: string[][] = [];
    await refuses(
      checkBackendRecovery(previous, image, '/data/wbs.db', (args) => {
        commands.push(args);
        if (args.some((argument) => argument.includes('wbs-dependency-preservation')))
          return Promise.resolve(
            JSON.stringify({
              protocol: 'wbs-dependency-preservation',
              version: 1,
              state: 'DISABLED',
              externalRelationships: 0,
            }),
          );
        if (args.includes('src/dependency-capabilities-cli.ts'))
          return Promise.resolve(
            JSON.stringify({
              protocol: 'wbs-dependency-runtime',
              version: 1,
              role: 'backend',
              semantics: [],
            }),
          );
        if (args[0] === 'ps') return Promise.resolve('');
        if (args.some((argument) => argument.includes('SELECT payload,inverse,preconditions')))
          return Promise.resolve('[{"kind":"step_blockage_activation_v1","count":1}]');
        if (args.some((argument) => argument.includes('src/step-blockage-replay-kinds-cli.ts'))) {
          return Promise.resolve(
            args.includes(incompatible === 'candidate' ? image : previous)
              ? '[]'
              : '["step_blockage_activation_v1"]',
          );
        }
        return Promise.resolve('[]');
      }),
      'step_blockage_activation_v1',
    );
    expect(commands.some((args) => ['start', 'stop'].includes(args[0]))).toBe(false);
    expect(commands.some((args) => args.includes('src/migrate-cli.ts'))).toBe(false);
  });
}

async function activationSwap(
  fault:
    | 'none'
    | 'incapable-outgoing'
    | 'mutable-ref'
    | 'bad-image-id'
    | 'wrong-image-container'
    | 'malformed-image-container'
    | 'malformed-image-output'
    | 'missing-image-container'
    | 'missing-ref'
    | 'missing-image-id'
    | 'wrong-pinned-id'
    | 'changed-ref'
    | 'changed-image-id'
    | 'false-first-install-same-color'
    | 'false-first-install'
    | 'first-install'
    | 'first-incapable'
    | 'first-late-writer'
    | 'first-enabled',
) {
  const isFirstInstall = [
    'first-install',
    'first-incapable',
    'first-enabled',
    'first-late-writer',
  ].includes(fault);
  const attempt = await fixture(isFirstInstall ? 'first-install' : 'none');
  const docker = attempt.io.sh;
  const commands: string[][] = [];
  let writerReads = 0;
  attempt.io.sh = async (args) => {
    commands.push(args);
    if (args[0] === 'ps' && fault === 'first-late-writer' && ++writerReads > 2) return outgoingId;
    if (
      args[0] === 'run' &&
      args.some((argument) => argument.includes('SELECT payload,inverse,preconditions'))
    )
      return isFirstInstall && fault !== 'first-enabled'
        ? '[]'
        : '[{"kind":"step_blockage_activation_v1","count":1}]';
    if (
      args[0] === 'run' &&
      args.some((argument) => argument.includes('src/step-blockage-replay-kinds-cli.ts'))
    )
      return fault === 'first-incapable' ||
        (fault === 'incapable-outgoing' && args.includes(previousImage))
        ? '[]'
        : '["step_blockage_activation_v1"]';
    const observed = await docker(args);
    if (
      args[0] === 'image' &&
      args[3] === '{{json .}}' &&
      fault === 'changed-image-id' &&
      !attempt.isBlueRunning()
    )
      return JSON.stringify({ Id: `sha256:${'f'.repeat(64)}` });
    if (args[0] === 'image' && args[3] === '{{json .}}' && fault === 'mutable-ref')
      return JSON.stringify({ Id: `sha256:${'e'.repeat(64)}` });
    if (args[0] === 'image' && args[3] === '{{json .}}' && fault === 'bad-image-id')
      return JSON.stringify({ Id: 'broken' });
    if (args[0] === 'image' && args[3] === '{{json .}}' && fault === 'wrong-pinned-id')
      return JSON.stringify({ Id: `sha256:${'f'.repeat(64)}` });
    if (args[0] === 'inspect' && args[1] === '--type' && args[3] === outgoingId) {
      const containers = JSON.parse(observed) as { Image?: string; Config: { Image?: string } }[];
      const container = containers.at(0);
      if (container === undefined) throw new Error('fixture container is missing');
      if (fault === 'mutable-ref') container.Config.Image = 'registry/wbs-be-01:latest';
      if (fault === 'bad-image-id') container.Image = 'broken';
      if (fault === 'wrong-image-container')
        return JSON.stringify([{ ...container, Id: incomingId }]);
      if (fault === 'malformed-image-container') return '[null]';
      if (fault === 'malformed-image-output') return JSON.stringify({ 0: container, length: 1 });
      if (fault === 'missing-image-container') return '[]';
      if (fault === 'missing-ref') delete container.Config.Image;
      if (fault === 'missing-image-id') delete container.Image;
      if (!attempt.isBlueRunning() && fault === 'changed-ref') {
        container.Config.Image = image;
        container.Image = `sha256:${'c'.repeat(64)}`;
      }
      if (!attempt.isBlueRunning() && fault === 'changed-image-id')
        container.Image = `sha256:${'f'.repeat(64)}`;
      return JSON.stringify(containers);
    }
    return observed;
  };
  if (fault === 'false-first-install' || fault === 'false-first-install-same-color')
    attempt.plan.from = null;
  if (fault === 'false-first-install-same-color') attempt.plan.to = 'blue';
  return { ...attempt, commands };
}

for (const fault of [
  'incapable-outgoing',
  'mutable-ref',
  'bad-image-id',
  'wrong-image-container',
  'malformed-image-container',
  'malformed-image-output',
  'missing-image-container',
  'missing-ref',
  'missing-image-id',
  'wrong-pinned-id',
  'changed-ref',
  'changed-image-id',
  'false-first-install',
  'false-first-install-same-color',
  'first-incapable',
  'first-enabled',
  'first-late-writer',
] as const) {
  test(`ordinary activation admission refuses ${fault} before maintenance`, async () => {
    const attempt = await activationSwap(fault);
    const diagnostic =
      fault === 'incapable-outgoing'
        ? 'recovery image cannot read'
        : fault.startsWith('false-first-install')
          ? 'unowned backend writer'
          : fault === 'first-late-writer'
            ? 'no existing backend writer'
            : fault === 'first-incapable'
              ? 'first backend install requires'
              : fault === 'first-enabled'
                ? 'requires a rollback image'
                : 'outgoing backend image';
    await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), diagnostic);
    expect(attempt.events).not.toContain('maintenance');
    expect(attempt.events).not.toContain('start');
    expect(attempt.commands.some((args) => args.includes('src/migrate-cli.ts'))).toBe(false);
    if (
      [
        'missing-ref',
        'missing-image-id',
        'mutable-ref',
        'bad-image-id',
        'wrong-image-container',
        'malformed-image-container',
        'malformed-image-output',
        'missing-image-container',
        'wrong-pinned-id',
        'false-first-install',
        'false-first-install-same-color',
      ].includes(fault)
    ) {
      expect(attempt.isBlueRunning()).toBe(true);
      await assertNoWriterBarrier(attempt.root);
    }
    if (['incapable-outgoing', 'changed-ref', 'changed-image-id'].includes(fault)) {
      expect(attempt.isBlueRunning()).toBe(false);
      const retained: unknown = JSON.parse(
        await readFile(join(attempt.root, 'be-writer-stop.json'), 'utf8'),
      );
      expect(retained).toMatchObject({
        rollback: {
          containerId: outgoingId,
          image: previousImage,
          imageId: `sha256:${'e'.repeat(64)}`,
        },
      });
    }
  });
}

test('ordinary activation admission retains outgoing association and observes its exact digest', async () => {
  const attempt = await activationSwap('none');
  await execute(attempt.plan, image, 'deadbeef', attempt.io);
  const intent: unknown = JSON.parse(
    await readFile(join(attempt.root, 'be-writer-stop.json'), 'utf8'),
  );
  expect(intent).toMatchObject({
    outgoingId,
    rollback: {
      containerId: outgoingId,
      image: previousImage,
      imageId: `sha256:${'e'.repeat(64)}`,
    },
  });
  const observed = attempt.commands.filter(
    (args) =>
      args[0] === 'run' &&
      args.some((argument) => argument.includes('src/step-blockage-replay-kinds-cli.ts')),
  );
  expect(observed.some((args) => args.includes(previousImage))).toBe(true);
  expect(observed.some((args) => args.includes(image))).toBe(true);
});

test('ordinary first install proves capable candidate and retains explicit absent predecessor', async () => {
  const attempt = await activationSwap('first-install');
  await execute(attempt.plan, image, 'deadbeef', attempt.io);
  const intent: unknown = JSON.parse(
    await readFile(join(attempt.root, 'be-writer-stop.json'), 'utf8'),
  );
  expect(intent).toMatchObject({ from: null, outgoingId: null, rollback: null });
  expect(attempt.events).toContain('start');
});

const storedVocabularies = [
  {
    kind: 'FF',
    key: 'type',
    cli: 'relationship-types',
    inventory: 'FROM typed_dependency GROUP BY type',
  },
  { kind: 'on_hold', key: 'kind', cli: 'hold-kinds', inventory: 'SELECT hold AS kind' },
  { kind: 'ready', key: 'kind', cli: 'readiness-kinds', inventory: 'SELECT readiness AS kind' },
  {
    kind: 'shared',
    key: 'mode',
    cli: 'capacity-modes',
    inventory: 'SELECT shared_people AS encoding',
  },
  {
    kind: 'succeeded',
    key: 'outcome',
    cli: 'attempt-outcomes',
    inventory: 'SELECT outcome, count(*) AS count',
  },
  {
    kind: 'blocked',
    key: 'kind',
    cli: 'step-blockage-kinds',
    inventory: "SELECT 'blocked' AS kind",
  },
  ...['replace_blockage', 'move_progress_v1', 'delete_state_v1', 'step_blockage_activation_v1'].map(
    (kind) => ({
      kind,
      key: 'kind',
      cli: 'step-blockage-replay-kinds',
      inventory: 'SELECT payload,inverse,preconditions FROM command_journal',
    }),
  ),
  {
    kind: 'minutes',
    key: 'unit',
    cli: 'estimate-units',
    inventory: 'SELECT estimate_unit AS unit',
  },
];

for (const vocabulary of storedVocabularies) {
  for (const incompatible of ['candidate', 'rollback', null] as const) {
    test(`ordinary complete vocabulary ${vocabulary.kind} with ${incompatible ?? 'both capable'} images`, async () => {
      const attempt = await fixture();
      const docker = attempt.io.sh;
      const commands: string[][] = [];
      attempt.io.sh = async (args) => {
        commands.push(args);
        if (args.some((argument) => argument.includes('wbs-dependency-preservation')))
          return Promise.resolve(
            JSON.stringify({
              protocol: 'wbs-dependency-preservation',
              version: 1,
              state: 'DISABLED',
              externalRelationships: 0,
            }),
          );
        if (args.includes('src/dependency-capabilities-cli.ts'))
          return Promise.resolve(
            JSON.stringify({
              protocol: 'wbs-dependency-runtime',
              version: 1,
              role: 'backend',
              semantics: [],
            }),
          );
        if (args[0] === 'run' && args.some((argument) => argument.includes(vocabulary.inventory)))
          return JSON.stringify([{ [vocabulary.key]: vocabulary.kind, count: 1 }]);
        if (
          args[0] === 'run' &&
          args.some((argument) => argument.includes(`src/${vocabulary.cli}-cli.ts`))
        )
          return JSON.stringify(
            incompatible !== null &&
              args.includes(incompatible === 'candidate' ? image : previousImage)
              ? []
              : [vocabulary.kind],
          );
        return docker(args);
      };
      if (incompatible === null) {
        await execute(attempt.plan, image, 'deadbeef', attempt.io);
        expect(attempt.events).toContain('start');
        const observations = commands.filter(
          (args) =>
            args[0] === 'run' &&
            args.some((argument) => argument.includes(`src/${vocabulary.cli}-cli.ts`)),
        );
        expect(observations.some((args) => args.includes(image))).toBe(true);
        expect(observations.some((args) => args.includes(previousImage))).toBe(true);
      } else {
        const failure = await execute(attempt.plan, image, 'deadbeef', attempt.io).then(
          () => '',
          (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)),
        );
        expect(failure).toContain(
          `${incompatible === 'candidate' ? 'candidate' : 'recovery'} image cannot read`,
        );
        expect(failure).toContain(`${vocabulary.kind} (1)`);
        expect(attempt.events).not.toContain('maintenance');
        expect(attempt.events).not.toContain('start');
        expect(commands.some((args) => args.includes('src/migrate-cli.ts'))).toBe(false);
      }
    });
  }
}

async function assertRefusal(pending: Promise<unknown>, message = '') {
  await rejects(pending, new RegExp(message));
}

async function activationFixture(fault = '') {
  const f = await fixture();
  let enterStall: () => void = () => {
    throw new Error('stall signal is not initialized');
  };
  const stalled = new Promise<void>((resolve) => {
    enterStall = resolve;
  });
  const original = f.io.sh;
  let attempted = false;
  let maintenanceStarted = false;
  let receipt: unknown;
  let capabilityProbes = 0;
  const verify = f.io.prepareBackend;
  if (verify === undefined) throw new Error('fixture missing preparation');
  f.io.prepareBackend = async (...args) => {
    const prepared = await verify(...args);
    const previous = prepared.verifyMaintenance;
    prepared.verifyMaintenance = (identity, signal) => {
      if (attempted && fault === 'maintenance-stall') {
        signal?.addEventListener('abort', () => f.events.push('aborted'));
        enterStall();
        return new Promise<string>(() => undefined).then(() => undefined);
      }
      if (maintenanceStarted && fault === 'maintenance-drift')
        return Promise.reject(new Error('activation maintenance drift'));
      return previous(identity);
    };
    return prepared;
  };
  f.io.resolveMount = (path) => {
    if (attempted && fault === 'resolve-stall') {
      enterStall();
      return new Promise<string>(() => undefined);
    }
    return Promise.resolve(
      maintenanceStarted && fault === 'database-drift' && path.endsWith('/wbs.db')
        ? '/replaced/wbs.db'
        : path,
    );
  };
  const namespaceProof = f.io.namespaceProof;
  if (namespaceProof === undefined) throw new Error('fixture missing namespace proof');
  f.io.namespaceProof = (...args) => {
    if (attempted && fault === 'namespace-stall') {
      enterStall();
      return new Promise<void>(() => undefined);
    }
    return namespaceProof(...args);
  };
  f.io.sh = async (args, signal) => {
    const stall = () => {
      signal?.addEventListener('abort', () => f.events.push('aborted'));
      enterStall();
      return new Promise<string>(() => undefined);
    };
    if (attempted && fault === 'stopped-stall' && args[0] === 'inspect' && args[3] === outgoingId)
      return stall();
    if (args[0] === 'ps' && maintenanceStarted)
      return fault === 'writer-drift' ? outgoingId : `${outgoingId}\n${maintenanceId}`;
    if (args[0] === 'inspect' && args[1] === outgoingId && args[2] === maintenanceId) {
      const observed = JSON.parse(await original(['inspect', outgoingId])) as Record<
        string,
        unknown
      >[];
      return JSON.stringify([
        ...observed,
        {
          ...observed[0],
          Id: maintenanceId,
          Name: '/be-01-green',
          Image: `sha256:${'c'.repeat(64)}`,
          Config: { Image: image, Env: ['DB_PATH=/data/wbs.db'] },
        },
      ]);
    }
    if (
      maintenanceStarted &&
      fault === 'rollback-running' &&
      args[0] === 'inspect' &&
      args[3] === outgoingId
    ) {
      const observed = JSON.parse(await original(args)) as { State: { Running: boolean } };
      observed.State.Running = true;
      return JSON.stringify(observed);
    }
    if (
      maintenanceStarted &&
      fault === 'rollback-drift' &&
      args[0] === 'inspect' &&
      args[1] === '--type'
    ) {
      const observed = JSON.parse(await original(args)) as [
        { Config: { Image: string }; Image: string },
      ];
      observed[0].Config.Image = image;
      observed[0].Image = `sha256:${'c'.repeat(64)}`;
      return JSON.stringify(observed);
    }
    if (args.includes('src/migrate-cli.ts')) maintenanceStarted = true;
    if (args[0] === 'run' && args.includes('src/step-blockage-replay-kinds-cli.ts')) {
      capabilityProbes += 1;
      if (fault === 'capability-stall' && capabilityProbes >= 1) return stall();
      const incapable =
        (fault === 'candidate-incapable' && args.includes(image)) ||
        (fault === 'rollback-incapable' && args.includes(previousImage));
      return incapable ? '[]' : '["step_blockage_activation_v1"]';
    }
    if (args[0] === 'run' && args.includes('src/step-blockage-activation-cli.ts')) {
      if (fault === 'inspect-stall') return stall();
      if (fault === 'missing-receipt-migration')
        throw new Error('missing step blockage receipt migration');
      return '{"state":"DISABLED","receipt":null}';
    }
    if (args[0] === 'exec' && args.includes('-e')) {
      receipt = (
        JSON.parse(await readFile(join(f.root, 'be-writer-activation.json'), 'utf8')) as {
          receipt: unknown;
        }
      ).receipt;
      return '';
    }
    if (args.includes('activate')) {
      attempted = true;
      expect(await readFile(join(f.root, 'be-writer-activation.json'), 'utf8')).toContain(
        previousImage,
      );
      if (fault === 'activate-stall') return stall();
      if (fault === 'commit-uncertain') throw new Error('transport lost after commit');
      return JSON.stringify({ state: 'ENABLED', receipt });
    }
    if (args[0] === 'exec' && args.includes('src/step-blockage-activation-cli.ts')) {
      if (fault === 'readback-stall') return stall();
      if (fault === 'readback-unavailable') throw new Error('readback unavailable');
      return JSON.stringify({
        state: 'ENABLED',
        receipt: fault === 'readback-mismatch' ? {} : receipt,
      });
    }
    return original(args);
  };
  return { ...f, stalled, attempted: () => attempted };
}

for (const fault of ['candidate-incapable', 'rollback-incapable', 'missing-receipt-migration']) {
  test(`explicit activation refuses ${fault} before maintenance or intent`, async () => {
    const f = await activationFixture(fault);
    await assertRefusal(execute(f.plan, image, 'release', f.io, true));
    expect(f.attempted()).toBe(false);
    expect(f.events).not.toContain('maintenance');
    expect(f.events).not.toContain('start');
    await assertRefusal(readFile(join(f.root, 'be-writer-activation.json')), 'ENOENT');
  });
}
for (const fault of [
  'maintenance-drift',
  'rollback-running',
  'rollback-drift',
  'database-drift',
  'writer-drift',
  'commit-uncertain',
  'readback-unavailable',
  'readback-mismatch',
]) {
  test(`explicit activation retains barriers and prevents exposure on ${fault}`, async () => {
    const f = await activationFixture(fault);
    const refusal: Record<string, string> = {
      'maintenance-drift': 'activation maintenance drift',
      'rollback-running': 'not proven stopped',
      'rollback-drift': 'activation rollback image association changed',
      'database-drift': 'activation database identity changed',
      'writer-drift': 'activation writer inventory changed',
      'commit-uncertain': 'transport lost after commit',
      'readback-unavailable': 'readback unavailable',
      'readback-mismatch': 'activation committed readback differs',
    };
    await assertRefusal(execute(f.plan, image, 'release', f.io, true), refusal[fault]);
    expect(f.isBlueRunning()).toBe(false);
    expect(f.events).not.toContain('start');
    expect(f.events).not.toContain('alias');
    for (const boundary of ['stop', 'maintenance', 'migration'])
      expect(await readFile(join(f.root, `be-writer-${boundary}.json`), 'utf8')).toContain(image);
    if (['commit-uncertain', 'readback-unavailable', 'readback-mismatch'].includes(fault)) {
      expect(f.attempted()).toBe(true);
      expect(await readFile(join(f.root, 'be-writer-activation.json'), 'utf8')).toContain(image);
    } else expect(f.attempted()).toBe(false);
    await assertRefusal(execute(f.plan, image, 'release', f.io), 'explicit recovery');
  });
}
test('explicit activation exposes the application only after exact separate committed readback', async () => {
  const f = await activationFixture();
  await execute(f.plan, image, 'release', f.io, true);
  expect(f.attempted()).toBe(true);
  expect(f.events).toContain('start');
  expect(await readFile(join(f.root, 'be-writer-exposure.json'), 'utf8')).toContain(image);
});

test('committed activation clears all five barriers after application exposure', async () => {
  const f = await activationFixture();
  f.plan.steps.push('commit');
  await execute(f.plan, image, 'release', f.io, true);
  await assertNoWriterBarrier(f.root);
  expect(f.events).toContain('start');
});

test('activation refuses a non-backend plan before preflight', async () => {
  const f = await activationFixture();
  await assertRefusal(
    execute({ ...f.plan, tier: 'gw' }, image, 'release', f.io, true),
    'activation requires only be',
  );
  expect(f.events).toEqual([]);
});

/** Control only the deadline clock; fixture filesystem work keeps its real asynchronous IO. */
function controlActivationClock() {
  let now = 0;
  const setTimer = globalThis.setTimeout;
  const clearTimer = globalThis.clearTimeout;
  const scheduled = new Map<ReturnType<typeof setTimeout>, { at: number; fire: () => void }>();
  const clock = spyOn(performance, 'now').mockImplementation(() => now);
  // Bun uses object tokens here; the unused DOM overload declares a numeric return.
  const timer = spyOn(globalThis, 'setTimeout').mockImplementation(
    Object.assign(
      (callback: unknown, milliseconds = 0, ...args: unknown[]) => {
        if (typeof callback !== 'function') throw new Error('deadline requires a callback');
        const token = setTimer(() => undefined, 2_147_483_647);
        scheduled.set(token, {
          at: now + milliseconds,
          fire: () => {
            Reflect.apply(callback, undefined, args);
          },
        });
        return token;
      },
      { __promisify__: setTimer.__promisify__ },
    ) as typeof setTimeout,
  );
  const cancellation = spyOn(globalThis, 'clearTimeout').mockImplementation((token) => {
    Reflect.apply(clearTimer, globalThis, [token]);
    for (const pending of scheduled.keys()) {
      if (pending === token) scheduled.delete(pending);
    }
  });
  return {
    elapse: (milliseconds: number) => {
      now += milliseconds;
    },
    advance: async (at: number) => {
      now = at;
      let fired = 0;
      for (;;) {
        const due = [...scheduled.entries()]
          .filter(([, pending]) => pending.at <= now)
          .sort(([, left], [, right]) => left.at - right.at)
          .at(0);
        if (due === undefined) break;
        if (fired >= 100) throw new Error('deadline clock did not converge');
        fired += 1;
        const [token, pending] = due;
        scheduled.delete(token);
        clearTimer(token);
        pending.fire();
        // A real event-loop turn lets promise continuations cancel another due timer.
        await new Promise<void>((resolve) => {
          setTimer(resolve, 0);
        });
      }
      await new Promise<void>((resolve) => {
        setTimer(resolve, 0);
      });
    },
    deadlines: () => [...scheduled.values()].map((pending) => pending.at),
    restore: () => {
      cancellation.mockRestore();
      timer.mockRestore();
      clock.mockRestore();
      for (const token of scheduled.keys()) clearTimer(token);
    },
  };
}

for (const fault of [
  'capability-stall',
  'inspect-stall',
  'activate-stall',
  'readback-stall',
  'maintenance-stall',
  'stopped-stall',
  'resolve-stall',
  'namespace-stall',
]) {
  test.serial(
    `activation total budget bounds production caller ${fault} and retains uncertainty`,
    async () => {
      const f = await activationFixture(fault);
      f.io.activationBudgetMs = 30;
      const setTimer = globalThis.setTimeout;
      const clearTimer = globalThis.clearTimeout;
      let watchdogToken: ReturnType<typeof setTimeout> | undefined;
      const watchdog = new Promise<never>((_, reject) => {
        watchdogToken = setTimer(() => {
          reject(new Error('activation deadline did not settle'));
        }, 4000);
      });
      const clock = controlActivationClock();
      try {
        if (fault === 'inspect-stall') {
          const runDocker = f.io.sh;
          let consumed = false;
          f.io.sh = async (args, signal) => {
            const output = await runDocker(args, signal);
            if (
              !consumed &&
              signal !== undefined &&
              args.includes('src/step-blockage-replay-kinds-cli.ts')
            ) {
              consumed = true;
              clock.elapse(10);
            }
            return output;
          };
        }
        let settled = false;
        const refusal = assertRefusal(
          execute(f.plan, image, 'release', f.io, true),
          'deadline exceeded',
        ).then(() => {
          settled = true;
        });
        await Promise.race([
          f.stalled,
          refusal.then(() => {
            throw new Error('activation refused before the named stall');
          }),
          watchdog,
        ]);
        // Stall entry happens inside the runner, before runDockerBefore registers its timer.
        await Promise.resolve();
        // Proof: resetting preparation deadlines per call failed here after the 10ms capability.
        expect(clock.deadlines().length).toBeGreaterThan(0);
        expect(clock.deadlines().every((deadline) => deadline === 30)).toBe(true);
        await clock.advance(29);
        expect(settled).toBe(false);
        expect(f.events).not.toContain('aborted');
        // Proof: suppressing the production timer callback hit the independent 4s watchdog.
        await clock.advance(30);
        await Promise.race([refusal, watchdog]);
      } finally {
        clock.restore();
        clearTimer(watchdogToken);
      }
      expect(f.events).not.toContain('start');
      expect(f.events).not.toContain('alias');
      // Proof: suppressing abort or removing preparation signal forwarding lost this event.
      if (fault !== 'resolve-stall' && fault !== 'namespace-stall')
        expect(f.events).toContain('aborted');
      expect(f.isBlueRunning()).toBe(false);
      expect(await readFile(join(f.root, 'be-writer-stop.json'), 'utf8')).toContain(image);
      if (fault === 'capability-stall' || fault === 'inspect-stall') {
        await assertRefusal(readFile(join(f.root, 'be-writer-activation.json')), 'ENOENT');
        expect(f.attempted()).toBe(false);
      } else {
        for (const boundary of ['maintenance', 'migration', 'activation'])
          expect(await readFile(join(f.root, `be-writer-${boundary}.json`), 'utf8')).toContain(
            image,
          );
      }
      await assertRefusal(execute(f.plan, image, 'release', f.io), 'explicit recovery');
    },
    5000,
  );
}

for (const badImage of [image, previousImage]) {
  test(`dependency capability refusal for ${badImage} precedes durable writer stop`, async () => {
    const f = await fixture();
    const commands: string[][] = [];
    const runDocker = f.io.sh;
    f.io.sh = async (args, signal) => {
      commands.push(args);
      if (args.some((argument) => argument.includes('wbs-dependency-preservation')))
        return Promise.resolve(
          JSON.stringify({
            protocol: 'wbs-dependency-preservation',
            version: 1,
            state: 'DISABLED',
            externalRelationships: 0,
          }),
        );
      if (args.includes('src/dependency-capabilities-cli.ts'))
        return JSON.stringify(
          args.includes(badImage)
            ? {}
            : {
                protocol: 'wbs-dependency-runtime',
                version: 1,
                role: 'backend',
                semantics: [],
              },
        );
      return runDocker(args, signal);
    };
    await refuses(execute(f.plan, image, 'capability', f.io), 'dependency capability');
    expect(commands.some((args) => args[0] === 'stop')).toBe(false);
    expect(f.isBlueRunning()).toBe(true);
    await rejects(readFile(join(f.root, 'be-writer-stop.json')), /ENOENT/);
  });
}

test('ordinary swap independently probes both exact backend images before stop and during admission', async () => {
  const f = await fixture();
  const commands: string[][] = [];
  const runDocker = f.io.sh;
  f.io.sh = (args, signal) => {
    commands.push(args);
    return runDocker(args, signal);
  };
  await execute(f.plan, image, 'capability', f.io);
  const probes = commands.filter((args) => args.includes('src/dependency-capabilities-cli.ts'));
  expect(probes.map((args) => args[8])).toEqual([image, previousImage, image, previousImage]);
  for (const args of probes) {
    expect(args).toEqual([
      'run',
      '--rm',
      '--pull',
      'never',
      '--network',
      'none',
      '--entrypoint',
      'bun',
      args[8],
      'run',
      'src/dependency-capabilities-cli.ts',
    ]);
  }
  expect(commands.indexOf(probes[1])).toBeLessThan(
    commands.findIndex((args) => args[0] === 'stop'),
  );
});

for (const badImage of [image, previousImage]) {
  test(`standalone recovery refuses malformed dependency capability from ${badImage} without writer mutation`, async () => {
    const commands: string[][] = [];
    await refuses(
      checkBackendRecovery(previousImage, image, '/data/wbs.db', (args) => {
        commands.push(args);
        if (args[0] === 'image') return Promise.resolve(image);
        if (!args.includes('src/dependency-capabilities-cli.ts'))
          throw new Error('unexpected subsequent command');
        return Promise.resolve(
          JSON.stringify(
            args.includes(badImage)
              ? {}
              : {
                  protocol: 'wbs-dependency-runtime',
                  version: 1,
                  role: 'backend',
                  semantics: [],
                },
          ),
        );
      }),
      'dependency capability',
    );
    expect(
      commands.every(
        (args) => args[0] === 'image' || args.includes('src/dependency-capabilities-cli.ts'),
      ),
    ).toBe(true);
  });
}

for (const fault of ['dependency-before', 'dependency-after'] as const)
  test(`ordinary swap refuses ${fault} authority before exposure`, async () => {
    const attempt = await fixture(fault);
    await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'explicit recovery');
    expect(attempt.events).not.toContain('start');
    expect(attempt.events).not.toContain('alias');
    if (fault === 'dependency-before') expect(attempt.events).not.toContain('maintenance');
    else {
      expect(attempt.events).toContain('stop-green');
      expect(attempt.dependencyReads()).toBe(2);
    }
    expect(attempt.isBlueRunning()).toBe(false);
    await refuses(assertNoWriterBarrier(attempt.root), 'explicit recovery');
  });

for (const fault of [
  'running-outgoing',
  'replaced-maintenance',
  'missing-outgoing',
  'database-drift',
  'rollback-drift',
] as const)
  test(`post-maintenance dependency admission refuses ${fault}`, async () => {
    const attempt = await fixture();
    const original = attempt.io.sh;
    attempt.io.resolveMount = (path) =>
      Promise.resolve(
        attempt.events.includes('stop-green') &&
          fault === 'database-drift' &&
          path.startsWith(`${ROOT}/data`)
          ? path.replace(`${ROOT}/data`, '/replaced')
          : path,
      );
    attempt.io.sh = async (args, signal) => {
      if (!attempt.events.includes('stop-green')) return original(args, signal);
      if (args[0] === 'ps' && fault === 'replaced-maintenance')
        return `${outgoingId}\n${incomingId}`;
      if (args[0] === 'ps' && fault === 'missing-outgoing') return maintenanceId;
      const output = await original(args, signal);
      if (
        fault === 'running-outgoing' &&
        args[0] === 'inspect' &&
        args[1] === '--format' &&
        args[3] === outgoingId
      ) {
        const observed = JSON.parse(output) as { State: { Running: boolean } };
        observed.State.Running = true;
        return JSON.stringify(observed);
      }
      if (fault === 'rollback-drift' && args[0] === 'inspect' && args[1] === '--type') {
        const observed = JSON.parse(output) as { Config: { Image: string }; Image: string }[];
        for (const container of observed) {
          container.Config.Image = image;
          container.Image = `sha256:${'c'.repeat(64)}`;
        }
        return JSON.stringify(observed);
      }
      return output;
    };
    await refuses(execute(attempt.plan, image, 'deadbeef', attempt.io), 'explicit recovery');
    expect(attempt.events).toContain('stop-green');
    expect(attempt.events).not.toContain('start');
    expect(attempt.dependencyReads()).toBe(1);
    expect(await readFile(join(attempt.root, 'be-writer-migration.json'), 'utf8')).toContain(image);
    await refuses(assertNoWriterBarrier(attempt.root), 'explicit recovery');
  });
test('first-install dependency admission replaces the idle set with stopped maintenance identity', async () => {
  const attempt = await fixture('first-install');
  const original = attempt.io.sh;
  attempt.io.sh = (args, signal) =>
    args.some((argument) => argument.includes('src/step-blockage-replay-kinds-cli.ts'))
      ? Promise.resolve('["step_blockage_activation_v1"]')
      : original(args, signal);
  await execute(attempt.plan, image, 'deadbeef', attempt.io);
  expect(attempt.dependencyReads()).toBe(2);
  expect(attempt.events).toContain('start');
});
