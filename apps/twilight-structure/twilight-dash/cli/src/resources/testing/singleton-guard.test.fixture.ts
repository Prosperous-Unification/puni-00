import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createLaunch } from '@shared/bun-startup';

import { monotonicClock, wallClock } from '../../clock';
import { ampleHost, hostPoolFixture, jobType } from '../host-pool.test.fixture';
import { loadResourceConfiguration, ResourceRuntime } from '../runtime';
import { SingletonGuard } from '../singleton-guard';

const mode = process.argv.at(2),
  operandRoot = process.argv.at(3),
  credential = process.argv.at(4);
if (mode === undefined || operandRoot === undefined || credential === undefined)
  throw new Error('guard fixture operands missing');
const root = operandRoot;
const config = join(root, 'config.json'),
  managed = join(root, 'managed');
if (!existsSync(config)) {
  mkdirSync(managed, { mode: 0o700 });
  const seed = hostPoolFixture(
    {
      cpuCores: 8,
      memoryGib: 16,
      headroom: { cpuCores: 0, memoryGib: 2 },
      gateTrees: 0,
      credential,
    },
    { root: managed, concurrencyEligible: ['fixture'] },
  );
  try {
    writeFileSync(config, readFileSync(seed.config), { flag: 'wx', mode: 0o600 });
  } finally {
    seed.remove();
  }
}
const clock = wallClock(),
  monotonic = monotonicClock(),
  configuration = loadResourceConfiguration(config);
const runtime = existsSync(join(managed, '.dash'))
  ? ResourceRuntime.open(configuration, clock)
  : ResourceRuntime.initialize(configuration, clock, ampleHost);
if (runtime.hostPoolTransition().mode === 'observe') {
  runtime.beginModeSwitch('concurrent', 'fixture');
  runtime.completeModeSwitch('concurrent', 'fixture', 'fixture', ['controlled fixture transition']);
}
const path = join(root, 'mutex'),
  helper = resolve(import.meta.dir, '../../ops/testing/lock-owner.test.fixture.ts');
const lock = {
  lockPath: path,
  helperPrefix: [...createLaunch(process.execPath, helper), path],
  clock,
  monotonic,
};
const environment =
  mode === 'stop-ready' || mode === 'preledger-ready'
    ? { ...process.env, PUNI_LOCK_FIXTURE_SILENT_OUTPUT: join(root, 'suppressed-output') }
    : process.env;
let protectedChild: Bun.Subprocess<'ignore', number, number> | undefined;
if (mode === 'replace-charged') {
  const spawn = Bun.spawn;
  const intercepted = (
    argv: string[],
    options: Bun.Spawn.SpawnOptions<'ignore', number, number>,
  ) => {
    const child = spawn(argv, options);
    protectedChild = child;
    return child;
  };
  // This owned fixture launches only the selected native-stdio helper overload; retain its exact native child capability.
  Bun.spawn = intercepted as typeof Bun.spawn;
}
let lastGuardReport = 'no guard progress reported';
const guard = new SingletonGuard(
  runtime,
  () => lock,
  environment,
  (line) => {
    lastGuardReport = line;
  },
);
function publish(phase: string, fields: Readonly<Record<string, unknown>> = {}): void {
  const draft = join(root, 'receipt.draft');
  writeFileSync(draft, JSON.stringify({ phase, ...fields }));
  renameSync(draft, join(root, 'receipt'));
}
async function until(test: () => boolean): Promise<void> {
  const end = performance.now() + 16000;
  while (!test()) {
    if (performance.now() >= end) throw new Error('guard fixture control did not converge');
    await Bun.sleep(10);
  }
}
try {
  if (mode === 'drain') {
    const file = join(managed, '.dash', 'legacy-holds', 'dash-singleton'),
      end = performance.now() + 10000;
    for (;;) {
      await guard.tick();
      if (
        !['', '.ready', '.log'].some((suffix) => existsSync(file + suffix)) &&
        runtime.guardObligation().holder === null
      )
        break;
      if (performance.now() >= end) throw new Error('guard drain did not converge');
      await Bun.sleep(20);
    }
    await guard.stop();
    runtime.close();
    publish('drained');
    process.exit(0);
  }
  const queued = runtime.enqueueHostJob(
    { descriptor: jobType('fixture', 1, 1), label: 'guard demand', waitSeconds: 30 },
    process.pid,
  );
  if (queued.kind !== 'queued') throw new Error(queued.reason);
  await guard.tick();
  if (mode === 'replace-charged') {
    const deadline = performance.now() + 8000;
    while (runtime.guardObligation().holder === null) {
      if (performance.now() >= deadline)
        throw new Error('initial charged guard did not converge: ' + lastGuardReport);
      await guard.tick();
      await Bun.sleep(20);
    }
    const old = runtime.guardObligation().holder;
    if (old === null) throw new Error('fixture original guard missing');
    const admitted = runtime.pollHostJob(queued.ticket, () => undefined);
    if (admitted.kind !== 'admitted') throw new Error('fixture compute was not admitted');
    const reserved = runtime.hostPoolStatus().reserved;
    publish('charged', { pid: old.pid, jobId: admitted.job.id });
    await until(() => existsSync(join(root, 'kill')));
    const child = protectedChild;
    if (child?.pid !== old.pid) throw new Error('fixture lost its original child capability');
    child.kill('SIGKILL');
    const end = performance.now() + 10000;
    for (;;) {
      await guard.tick();
      const holder = runtime.guardObligation().holder;
      if (
        holder !== null &&
        (holder.pid !== old.pid || holder.boot !== old.boot || holder.start !== old.start)
      ) {
        const job = runtime.inspectHostJob(admitted.job.id);
        publish('replaced', {
          oldPid: old.pid,
          pid: holder.pid,
          oldBirth: { pid: old.pid, boot: old.boot, start: old.start },
          birth: { pid: holder.pid, boot: holder.boot, start: holder.start },
          compute: job.compute.state,
          guardLost: job.guardLost,
          reservedBefore: reserved,
          reservedAfter: runtime.hostPoolStatus().reserved,
        });
        break;
      }
      if (performance.now() >= end) throw new Error('charged guard replacement did not converge');
      await Bun.sleep(20);
    }
  } else if (mode === 'adopt') {
    publish('adopting');
    const end = performance.now() + 16000;
    while (runtime.guardObligation().holder === null) {
      await guard.tick();
      if (performance.now() >= end) throw new Error('queued guard adoption did not converge');
      await Bun.sleep(20);
    }
    publish('adopted');
  } else publish('ticked');
  await until(() => existsSync(join(root, 'stop')));
  await guard.stop();
  runtime.close();
  publish('stopped');
  process.exit(0);
} catch (cause) {
  const failures: unknown[] = [cause];
  try {
    await guard.stop();
  } catch (cleanupFailure) {
    failures.push(cleanupFailure);
  }
  try {
    runtime.close();
  } catch (cleanupFailure) {
    failures.push(cleanupFailure);
  }
  if (failures.length === 1) throw cause;
  throw new AggregateError(failures, 'guard fixture operation and cleanup failed', { cause });
}
