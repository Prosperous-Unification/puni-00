import { existsSync, fstatSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { mock } from 'bun:test';

import { monotonicClock, wallClock } from '../clock';
import { createHold } from './hold-token';
import { identifySelf } from './process-identity';

const mode = process.argv.at(2),
  rootOperand = process.argv.at(3);
if (mode === undefined || rootOperand === undefined)
  throw new Error('residual fixture operands absent');
const root = rootOperand,
  holdFile = join(root, 'hold'),
  mutex = join(root, 'mutex');
function save(name: string, value: unknown): void {
  writeFileSync(join(root, name), JSON.stringify(value, null, 2));
}
if (mode === 'race-writer') {
  if (!existsSync(holdFile + '.log')) throw new Error('writer did not enter physical reservation');
  createHold(holdFile, identifySelf());
  save('race-input.json', {
    path: holdFile,
    bytes: readFileSync(holdFile, 'utf8'),
    logExists: true,
  });
  process.exit(0);
}
async function until(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 7000;
  while (!predicate()) {
    if (performance.now() >= deadline)
      throw new Error('residual fixture observation did not converge');
    await Bun.sleep(10);
  }
}
function describe(cause: unknown): unknown {
  if (cause instanceof AggregateError)
    return { message: cause.message, errors: Array.from(cause.errors, describe) };
  return cause instanceof Error ? { message: cause.message } : { thrown: String(cause) };
}
let launches = 0,
  reservations = 0,
  unrefAttempted = false,
  descriptorClosed = false;
let originalDescriptor: number | undefined;
const observerFailure = new Error('controlled post-spawn observation getter failure'),
  unrefFailure = new Error('controlled post-spawn unref failure'),
  closeFailure = new Error('controlled post-spawn close failure');
const postSpawn = mode === 'post-spawn-failures';
if (['reservation-race', 'preexisting-token', 'post-spawn-failures'].includes(mode)) {
  const logs = await import('./hold-log'),
    reserve = logs.reserveLog;
  await mock.module('./hold-log', () => ({
    ...logs,
    reserveLog(path: string) {
      const log = reserve(path);
      reservations++;
      save('reservation-input.json', {
        path: log.path,
        descriptor: log.descriptor,
        inode: String(log.inode),
        existingHold: existsSync(holdFile),
      });
      if (mode === 'reservation-race') {
        const writer = Bun.spawnSync(
          [
            process.execPath,
            '--no-env-file',
            '--config=/dev/null',
            import.meta.path,
            'race-writer',
            root,
          ],
          { cwd: '/', stdout: 'pipe', stderr: 'pipe' },
        );
        if (writer.exitCode !== 0)
          throw new Error('owned race writer failed: ' + writer.stderr.toString());
      }
      if (!postSpawn) return log;
      originalDescriptor = log.descriptor;
      return {
        ...log,
        closeDescriptor() {
          log.closeDescriptor();
          descriptorClosed = true;
          throw closeFailure;
        },
      };
    },
  }));
}
if (mode === 'post-diagnostic-replacement') {
  const heavy = await import('@shared/heavy-lock'),
    read = heavy.readStatus;
  let replaced = false;
  await mock.module('@shared/heavy-lock', () => ({
    ...heavy,
    readStatus(...args: Parameters<typeof read>) {
      const status = read(...args);
      if (status.holder.kind === 'recorded' && !replaced) {
        replaced = true;
        save('diagnostic-gate.json', {
          holder: status.holder,
          ready: readFileSync(holdFile + '.ready', 'utf8'),
        });
        setTimeout(() => {
          const path = holdFile + '.ready',
            before = statSync(path, { bigint: true }),
            bytes = readFileSync(path, 'utf8');
          renameSync(path, path + '.original');
          writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
          save('replacement-input.json', {
            beforeInode: String(before.ino),
            afterInode: String(statSync(path, { bigint: true }).ino),
            sameBytes: readFileSync(path, 'utf8') === bytes,
          });
        }, 0);
      }
      return status;
    },
  }));
}
const { acquireHold, resolveHostLock } = await import('./host-lock');
if (mode === 'resolve-capture' || mode === 'invalid-resolve-prefix') {
  const prefix =
    mode === 'invalid-resolve-prefix' ? [] : ['selected-protected-bun', 'selected-entrypoint'];
  const clock = {
      read() {
        return 1234;
      },
    },
    monotonic = {
      now() {
        return 5678;
      },
    };
  const resolving = resolveHostLock(prefix, { clock, monotonic });
  prefix.splice(0, prefix.length, 'mutated-unprotected-prefix');
  clock.read = () => 99;
  monotonic.now = () => 88;
  try {
    const lock = await resolving;
    save('receipt.json', {
      phase: 'resolved',
      prefix: lock.helperPrefix,
      wall: lock.clock.read(),
      monotonic: lock.monotonic.now(),
    });
  } catch (cause) {
    save('receipt.json', { phase: 'failed', cause: describe(cause) });
  }
  process.exit(0);
}
const invalid = mode.startsWith('invalid-');
const helper = resolve(import.meta.dir, '../ops/testing/lock-owner.test.fixture.ts');
const clock = wallClock(),
  monotonic = monotonicClock(),
  prefix = [...createLaunch(process.execPath, helper), mutex];
const environment: Record<string, string | undefined> = {
  ...process.env,
  PUNI_OWNER_CAPTURE_VALUE: 'captured-parent-environment',
  PUNI_HOLDER_R5_CAPTURE: root,
};
if (mode === 'post-diagnostic-replacement')
  environment['PUNI_LOCK_FIXTURE_SILENT_OUTPUT'] = join(root, 'suppressed-output');
if (mode === 'withdrawal-bound')
  environment['PUNI_LOCK_FIXTURE_START_GATE'] = join(root, 'start-gate');
const request = {
  holdFile,
  label: mode === 'invalid-label' ? 'invalid\nlabel' : 'parent residual protected lane',
  waitSeconds: mode === 'invalid-budget' ? -1 : 0,
  pollSeconds: 5,
  claimGraceMs: mode === 'invalid-grace' ? -1 : mode === 'withdrawal-bound' ? 100 : 1300,
  signal: new AbortController().signal,
  report(_line: string) {
    /* Actual log consumption is allowed; no output authority is inferred. */
  },
};
if (mode === 'invalid-acquire-prefix') prefix.splice(0);
if (mode === 'preexisting-token') createHold(holdFile, identifySelf());
const spawn = Bun.spawn;
const intercepted = (argv: string[], options: Bun.Spawn.SpawnOptions<'ignore', number, number>) => {
  launches++;
  save('launch-input.json', { argv, captureValue: options.env?.['PUNI_OWNER_CAPTURE_VALUE'] });
  if (invalid) throw new Error('invalid parent input reached process creation');
  if (mode === 'acquire-capture') {
    environment['PUNI_OWNER_CAPTURE_VALUE'] = 'mutated-parent-environment';
    request.label = 'mutated-request-label';
    clock.read = () => {
      throw new Error('mutated parent wall clock method invoked');
    };
    monotonic.now = () => {
      throw new Error('mutated parent monotonic method invoked');
    };
  }
  const child = spawn(argv, options);
  save('spawned-input.json', { pid: child.pid, argv });
  if (['acquire-capture', 'post-spawn-failures', 'post-diagnostic-replacement'].includes(mode)) {
    const deadline = performance.now() + 5000;
    while (!existsSync(holdFile + '.ready')) {
      if (performance.now() >= deadline)
        throw new Error('native readiness publication gate missing');
      Bun.sleepSync(5);
    }
    // The producer finishes its owned draft unlink before parent observation starts; that unlink
    // legitimately changes the published inode ctime and is outside this port-capture oracle.
    Bun.sleepSync(25);
  }
  if (!postSpawn) return child;
  return new Proxy(child, {
    get(native, key) {
      if (key === 'exited') throw observerFailure;
      if (key === 'unref')
        return () => {
          unrefAttempted = true;
          throw unrefFailure;
        };
      const value: unknown = Reflect.get(native, key, native);
      return value;
    },
  });
};
// This fixture models the exact native-stdio launcher capability and faults only its observation ports.
Bun.spawn = intercepted as typeof Bun.spawn;
let phase: string, cause: unknown, refusal: unknown;
try {
  const outcome = await acquireHold(
    { lockPath: mutex, helperPrefix: prefix, clock, monotonic },
    request,
    environment,
  );
  phase = outcome.kind;
  if (outcome.kind === 'refused') refusal = outcome;
  if (outcome.kind === 'held' && !postSpawn && mode !== 'post-diagnostic-replacement') {
    outcome.hold.release();
    await outcome.hold.exited;
  }
} catch (failure) {
  phase = 'failed';
  cause = describe(failure);
}
if (postSpawn) {
  await until(() => existsSync(holdFile + '.ready'));
  if (originalDescriptor !== undefined) {
    try {
      fstatSync(originalDescriptor);
    } catch (failure) {
      if (!(failure instanceof Error) || !('code' in failure) || failure.code !== 'EBADF')
        throw failure;
      descriptorClosed = true;
    }
  }
}
save('receipt.json', {
  phase,
  cause,
  refusal,
  launches,
  reservations,
  unrefAttempted,
  descriptorClosed,
  logExists: existsSync(holdFile + '.log'),
  tokenExists: existsSync(holdFile),
});
process.exit(0);
