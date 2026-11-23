import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { prepareWorkPackageBirth } from '@wbs/core/module/work-package/work-package-birth';
import { withinClaimFixture } from '@wbs/core/testing/current-claim-observation';
import * as sources from '@wbs/store-sqlite/source';
import type { CatalogueFixtureCustody } from '@wbs/store-sqlite/testing/catalogue-database';
import { seedCurrentProjectFixture } from '@wbs/store-sqlite/testing/current-project-fixture';
import { describe, expect, it, spyOn } from 'bun:test';

import { openConnection } from '../repository/db';
import { WriteCoordinator } from '../repository/gate';
import { bindSolverSlot, reserveSolverSlot } from '../repository/optimization-admission';
import { allocateGeneration } from '../repository/optimization-generation';
import { solverSlot, workPackage } from '../repository/schema';
import { WorkPackageRepository } from '../repository/work-package';

const IMAGE = process.env['WBS_SOLVER_ORPHAN_IMAGE'];
// This process-boundary proof owns a real migrated SQLite database.
const realProcessDescribe = IMAGE === undefined ? describe.skip : describe;
const REQUEST =
  '/app/libs/wbs/domain/contracts/solver/fixtures/request/valid-quantised-baseline.json';
const HOST = new URL(
  '../../../../../tools/tool-remote-scripts/src/fixtures/solver-supervisor-orphan-host.ts',
  import.meta.url,
).pathname;
// `scope:app` keeps this test from importing tool-remote-scripts' container bound helper, so
// it starts its callers through that helper's launcher by path, as it does the host.
const CALLER_LAUNCHER = new URL(
  '../../../../../tools/tool-remote-scripts/src/fixtures/host-job-docker-run.ts',
  import.meta.url,
).pathname;
const CLIENT = '/app/apps/wbs/be-01/scripts/solver-supervisor-orphan-client.ts';
const MIB = 1024 ** 2;
const WORK_PACKAGE = '11111111-1111-4111-8111-111111111111';
const PARENT_PROJECT = 'solver-orphan-project';
const ORGANIZATION = 'solver-orphan-legacy';
const CONTRACT = '7+0.1.0';

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function command(argv: readonly string[], allowFailure = false): Promise<CommandResult> {
  const child = Bun.spawn([...argv], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (!allowFailure && code !== 0) {
    throw new Error(`orphan process command ${argv.join(' ')} exited ${String(code)}: ${stderr}`);
  }
  return { code, stdout, stderr };
}

async function until(label: string, check: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (await check()) return;
    await Bun.sleep(50);
  }
  throw new Error(`solver orphan process condition did not arrive: ${label}`);
}

function startHost(
  image: string,
  socket: string,
  callerName: string,
  readyMarker: string,
): Bun.Subprocess {
  return Bun.spawn([process.execPath, HOST, image, socket, callerName, readyMarker], {
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'inherit',
  });
}

async function waitForHost(host: Bun.Subprocess, readyMarker: string): Promise<void> {
  await until('supervisor listen', () => {
    if (host.exitCode !== null) {
      throw new Error(`solver orphan host exited before listen: ${String(host.exitCode)}`);
    }
    return existsSync(readyMarker);
  });
}

async function stopHost(host: Bun.Subprocess): Promise<void> {
  if (host.exitCode === null) host.kill('SIGTERM');
  await host.exited;
}

async function startCaller(
  image: string,
  name: string,
  root: string,
  token: string,
  childDeadlineAt: number,
  markerName: string,
  decision: 'wait' | 'bound' | 'gate',
): Promise<void> {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === undefined || gid === undefined) throw new Error('solver orphan process: missing uid');
  await command([
    process.execPath,
    CALLER_LAUNCHER,
    '--detach',
    '--name',
    name,
    '--user',
    `${String(uid)}:${String(gid)}`,
    '--volume',
    `${root}:/proof`,
    '--entrypoint',
    'bun',
    image,
    CLIENT,
    '/proof/supervisor.sock',
    REQUEST,
    token,
    String(childDeadlineAt),
    `/proof/${markerName}`,
    decision,
  ]);
}

async function containerRunning(name: string): Promise<boolean> {
  const result = await command(['docker', 'inspect', '--format', '{{.State.Running}}', name], true);
  return result.code === 0 && result.stdout.trim() === 'true';
}

/**
 * Docker's own record of a container's `puni.job` label, memory and CPU limits: inside a Dash
 * host job the label is the job's id and the CPU limit is the containers bound, outside one
 * neither is set (J16). `ownMemoryMib` is the limit the starter set itself, null for none, in
 * which case a job's 1 GiB bound applies.
 */
async function expectJobAttribution(name: string, ownMemoryMib: number | null): Promise<void> {
  const inspected = await command([
    'docker',
    'inspect',
    '--format',
    '{{index .Config.Labels "puni.job"}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}',
    name,
  ]);
  const jobId = process.env['DASH_JOB_ID'];
  expect(inspected.stdout.trim()).toBe(
    jobId === undefined || jobId === ''
      ? `<no value> ${String((ownMemoryMib ?? 0) * MIB)} 0`
      : `${jobId} ${String((ownMemoryMib ?? 1024) * MIB)} ${String(1e9)}`,
  );
}

async function containerExists(name: string): Promise<boolean> {
  return (await command(['docker', 'container', 'inspect', name], true)).code === 0;
}

/** The exact current database preparation shared by the SQL and enabled real-process owners. */
async function prepareDatabase(
  dbPath: string,
  directory: string,
  custody: CatalogueFixtureCustody,
) {
  const stamp = { at: 1, by: 'u-1' };
  // Proof: the shared SQL owner failed at pending117 before this atomic fixture replaced ordinary migration.
  await seedCurrentProjectFixture(
    {
      path: dbPath,
      directory,
      organizationId: ORGANIZATION,
      projectId: PARENT_PROJECT,
      stamp,
      definitions: [],
    },
    custody,
  );
  let connection: ReturnType<typeof openConnection>;
  try {
    connection = openConnection(dbPath);
  } catch (cause: unknown) {
    custody.hasUnknownOwner = true;
    throw cause;
  }
  try {
    const prepared = prepareWorkPackageBirth('Plan', PARENT_PROJECT, stamp, () => WORK_PACKAGE);
    const born = await new WorkPackageRepository(
      connection.db,
      new WriteCoordinator(),
    ).createWithSteps(
      {
        ...prepared.workPackage,
        optimizationEnabled: true,
        scheduleEngine: 'optimized',
        scheduleObjective: 'pri',
      },
      stamp,
      { kind: 'legacy' },
    );
    if (typeof born === 'string') throw new Error('orphan package birth refused: ' + born);
    expect(born.steps).toEqual([]);
    return connection;
  } catch (primary: unknown) {
    try {
      connection.close();
    } catch (cleanup: unknown) {
      custody.hasUnknownOwner = true;
      throw new AggregateError([primary, cleanup], 'orphan fixture birth and close failed', {
        cause: cleanup,
      });
    }
    throw primary;
  }
}

/** A failed lower owner retains this exclusively owned namespace for explicit settlement. */
function removeDatabaseFixture(directory: string, custody: CatalogueFixtureCustody): void {
  // Proof: the actual Source-close fault retains this namespace; a return-on-unknown copy
  // failed the same test's required throw (orphan-fixture-v171-custody-fault-copy).
  if (custody.hasUnknownOwner)
    throw new Error('orphan database fixture owner is unknown; retained ' + directory);
  rmSync(directory, { recursive: true });
}

it('prepares the current orphan process database and reserves its real solver slot', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-orphan-database-'));
  const path = join(directory, 'proof.db');
  const custody = { hasUnknownOwner: false };
  let connection: ReturnType<typeof openConnection> | undefined;
  try {
    connection = await prepareDatabase(path, directory, custody);
    expect(
      connection.db
        .select({
          id: workPackage.id,
          projectId: workPackage.projectId,
          createdBy: workPackage.createdBy,
          optimizationEnabled: workPackage.optimizationEnabled,
          scheduleEngine: workPackage.scheduleEngine,
          scheduleObjective: workPackage.scheduleObjective,
          restricted: workPackage.restricted,
          revision: workPackage.revision,
        })
        .from(workPackage)
        .all(),
    ).toEqual([
      {
        id: WORK_PACKAGE,
        projectId: PARENT_PROJECT,
        createdBy: 'u-1',
        optimizationEnabled: true,
        scheduleEngine: 'optimized',
        scheduleObjective: 'pri',
        restricted: false,
        revision: 0,
      },
    ]);
    const generation = allocateGeneration(connection.db, WORK_PACKAGE, CONTRACT, 'hash-1', 1);
    const admission = reserveSolverSlot(connection.db, {
      workPackageId: WORK_PACKAGE,
      contractVersion: CONTRACT,
      generation,
      objective: 'pri',
      budgetMs: 25_000,
      ownerId: 'coordinator-process',
      attemptToken: crypto.randomUUID(),
      now: Date.now(),
    });
    expect(admission.kind).toBe('reserved');
    expect(connection.db.select().from(solverSlot).all()).toHaveLength(1);
  } finally {
    connection?.close();
    removeDatabaseFixture(directory, custody);
  }
});

it('retains the orphan database namespace when the current seeding Source close fails', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-orphan-unknown-'));
  const path = join(directory, 'proof.db');
  const custody = { hasUnknownOwner: false };
  const closeFailure = new Error('injected orphan fixture Source close refusal');
  const open = sources.openSqliteSource;
  let source: sources.SqliteSource | undefined;
  let connection: ReturnType<typeof openConnection> | undefined;
  const intercepted = spyOn(sources, 'openSqliteSource').mockImplementation((options) => {
    source = open(options);
    return { ...source, close: () => Promise.reject(closeFailure) };
  });
  await withinClaimFixture(
    async () => {
      intercepted.mockRestore();
      connection?.close();
      if (source === undefined)
        throw new Error('injected orphan fixture Source was not acquired; retained ' + directory);
      await source.close();
      custody.hasUnknownOwner = false;
      removeDatabaseFixture(directory, custody);
    },
    async () => {
      const refusal: unknown = await prepareDatabase(path, directory, custody).then(
        (opened) => {
          connection = opened;
          return null;
        },
        (cause: unknown) => cause,
      );
      expect(refusal).toBe(closeFailure);
      expect(custody.hasUnknownOwner).toBe(true);
      expect(() => {
        removeDatabaseFixture(directory, custody);
      }).toThrow('orphan database fixture owner is unknown');
      expect(existsSync(path)).toBe(true);
    },
  );
});

realProcessDescribe('solver supervisor orphan process boundaries', () => {
  it('keeps the slot through coordinator EOF and survives a timer-stopped restart orphan', async () => {
    if (IMAGE === undefined) throw new Error('real process test enabled without an image');
    const uid = process.getuid?.();
    if (uid === undefined) throw new Error('solver orphan process: missing uid');
    const root = mkdtempSync(`/run/user/${String(uid)}/wbs-solver-orphan.`);
    const socket = join(root, 'supervisor.sock');
    const databaseDirectory = join(root, 'database');
    mkdirSync(databaseDirectory);
    const dbPath = join(databaseDirectory, 'proof.db');
    const fixtureCustody = { hasUnknownOwner: false };
    const firstReady = join(root, 'first.ready');
    const secondReady = join(root, 'second.ready');
    const restartReady = join(root, 'restart.ready');
    const callerOne = `wbs-orphan-coordinator-${crypto.randomUUID()}`;
    const callerTwo = `wbs-orphan-restart-${crypto.randomUUID()}`;
    const tokenOne = crypto.randomUUID();
    const tokenTwo = crypto.randomUUID();
    const managedOne = `wbs-solver-${tokenOne}`;
    const managedTwo = `wbs-solver-${tokenTwo}`;
    const timerOne = `wbs-solver-deadline-${tokenOne}`;
    const timerTwo = `wbs-solver-deadline-${tokenTwo}`;
    const exactContainers = [callerOne, callerTwo, managedOne, managedTwo];
    let host: Bun.Subprocess | undefined;
    let closeDatabase: (() => void) | undefined;

    try {
      const connection = await prepareDatabase(dbPath, databaseDirectory, fixtureCustody);
      closeDatabase = connection.close;
      const generation = allocateGeneration(connection.db, WORK_PACKAGE, CONTRACT, 'hash-1', 1);
      const admission = reserveSolverSlot(connection.db, {
        workPackageId: WORK_PACKAGE,
        contractVersion: CONTRACT,
        generation,
        objective: 'pri',
        budgetMs: 25_000,
        ownerId: 'coordinator-process',
        attemptToken: tokenOne,
        now: Date.now(),
      });
      if (admission.kind !== 'reserved') throw new Error('orphan slot was not reserved');

      host = startHost(IMAGE, socket, callerOne, firstReady);
      await waitForHost(host, firstReady);
      await startCaller(
        IMAGE,
        callerOne,
        root,
        tokenOne,
        admission.childDeadlineAt,
        'first.started',
        'gate',
      );
      const firstMarker = join(root, 'first.started');
      await until('first managed child started', () => existsSync(firstMarker));
      const pid = Number(readFileSync(firstMarker, 'utf8'));
      expect(
        bindSolverSlot(connection.db, {
          workPackageId: WORK_PACKAGE,
          contractVersion: CONTRACT,
          generation,
          objective: 'pri',
          budgetMs: 25_000,
          attemptToken: tokenOne,
          pid,
        }),
      ).toBe(true);
      await Bun.write(`${firstMarker}.bound`, 'bound');
      await until('first bound verdict sent', () => existsSync(`${firstMarker}.bound-sent`));
      expect(await containerRunning(managedOne)).toBe(true);
      // The caller asks for no memory limit and takes the bound's 1 GiB inside a job; the
      // supervisor's managed child keeps its own 512 MiB.
      // Proof: run by solver-image-smoke.sh with DASH_JOB_ID=abc, dropping the flags from
      // host-job-docker-run.ts failed the caller on `Received: "<no value> 0 0"`, and dropping
      // hostJobAttributionFlags from buildManagedContainerArgs failed the managed child on
      // `Received: "<no value> 536870912 0"` (2026-11-12).
      await expectJobAttribution(callerOne, null);
      await expectJobAttribution(managedOne, 512);
      expect(connection.db.select().from(solverSlot).all()).toHaveLength(1);

      await command(['docker', 'kill', callerOne]);
      // Proof: without the supervisor's client-EOF kill, the following wait
      // timed out at "EOF child removal" because managedOne stayed live.
      await until('EOF child removal', async () => !(await containerExists(managedOne)));
      expect(Date.now()).toBeLessThan(admission.childDeadlineAt);
      const rowsAfterCoordinatorDeath = connection.db.select().from(solverSlot).all();
      // Proof: releasing the slot on client EOF made this receive zero rows.
      expect(rowsAfterCoordinatorDeath).toHaveLength(1);
      expect(rowsAfterCoordinatorDeath[0]?.lifecycle).toBe('running');
      await stopHost(host);
      host = undefined;

      const childDeadlineAt = Date.now() + 8_000;
      host = startHost(IMAGE, socket, callerTwo, secondReady);
      await waitForHost(host, secondReady);
      await startCaller(
        IMAGE,
        callerTwo,
        root,
        tokenTwo,
        childDeadlineAt,
        'second.started',
        'bound',
      );
      await until('second managed child started', () => existsSync(join(root, 'second.started')));
      expect(await containerRunning(managedTwo)).toBe(true);

      host.kill(9);
      await host.exited;
      host = undefined;
      expect(await containerRunning(managedTwo)).toBe(true);
      await until('persistent deadline timer fired', async () => {
        return !(await containerRunning(managedTwo));
      });
      expect(Date.now()).toBeGreaterThanOrEqual(childDeadlineAt);

      host = startHost(IMAGE, socket, callerTwo, restartReady);
      await waitForHost(host, restartReady);
      await until('restart orphan removal', async () => !(await containerExists(managedTwo)));
      expect(host.exitCode).toBeNull();
      // Proof: cancelling the timer with supervisor death leaves managedTwo
      // running; treating docker-kill's already-stopped error as fatal keeps
      // the restarted supervisor from creating its listener.
    } finally {
      if (host !== undefined) await stopHost(host);
      closeDatabase?.();
      for (const name of exactContainers) {
        await command(['docker', 'rm', '--force', name], true);
      }
      for (const timer of [timerOne, timerTwo]) {
        await command(['systemctl', '--user', 'stop', `${timer}.timer`, `${timer}.service`], true);
        await command(['systemctl', '--user', 'reset-failed', `${timer}.service`], true);
      }
      for (const file of [
        join(root, 'first.started'),
        join(root, 'first.started.bound'),
        join(root, 'first.started.bound-sent'),
        join(root, 'second.started'),
        firstReady,
        secondReady,
        restartReady,
        socket,
      ]) {
        if (existsSync(file)) unlinkSync(file);
      }
      removeDatabaseFixture(databaseDirectory, fixtureCustody);
      rmdirSync(root);
    }
  }, 60_000);
});
