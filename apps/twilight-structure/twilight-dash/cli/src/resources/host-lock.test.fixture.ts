import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { mock } from 'bun:test';

import { monotonicClock, wallClock } from '../clock';
import { readGeneration, removeGeneration } from './hold-log';
import {
  createDecision,
  formatIdentity,
  readDecision,
  readHold,
  releaseHold,
  verifyHold,
} from './hold-token';

function readOperands() {
  const mode = process.argv.at(2),
    root = process.argv.at(3);
  if (mode === undefined || root === undefined)
    throw new Error('host lock fixture operands missing');
  return { mode, root };
}
const { mode, root } = readOperands();
const residualCapture = process.env['PUNI_PARENT_RESIDUAL_CAPTURE'];
const modeCapture = residualCapture === undefined ? undefined : join(residualCapture, mode);
if (modeCapture !== undefined) {
  mkdirSync(modeCapture, { recursive: true });
  process.env['PUNI_HOLDER_R5_CAPTURE'] = modeCapture;
  writeFileSync(
    join(modeCapture, 'frontend-input.json'),
    JSON.stringify({ mode, root, argv: process.argv, pid: process.pid }, null, 2),
  );
}
if (
  mode === 'ready-log-unlink-failure' ||
  mode === 'cancel-log-unlink-failure' ||
  mode === 'crash-after-log'
) {
  const fs = await import('node:fs'),
    unlink = fs.unlinkSync;
  await mock.module('node:fs', () => ({
    ...fs,
    unlinkSync(path: Parameters<typeof unlink>[0]) {
      if (path === join(root, 'hold.log')) {
        if (mode === 'crash-after-log') {
          unlink(path);
          process.exit(0);
        }
        throw new Error('controlled generation log unlink failure');
      }
      unlink(path);
    },
  }));
}
if (mode.startsWith('overlap-')) {
  const tokens = await import('./hold-token'),
    read = tokens.readDecision;
  await mock.module('./hold-token', () => ({
    ...tokens,
    readDecision(path: string) {
      const decision = read(path);
      if (decision !== undefined)
        writeFileSync(join(root, 'parent-observed-decision'), decision.kind);
      return decision;
    },
  }));
}
const { acquireHold } = await import('./host-lock');
const holdFile = join(root, 'hold'),
  path = join(root, 'mutex'),
  controller = new AbortController();
function publish(phase: string, pid?: number): void {
  const draft = join(root, 'receipt.draft');
  writeFileSync(draft, JSON.stringify({ phase, pid }));
  renameSync(draft, join(root, 'receipt'));
  if (modeCapture !== undefined)
    writeFileSync(
      join(modeCapture, phase + '.json'),
      JSON.stringify(
        {
          phase,
          pid,
          hold: existsSync(holdFile) ? readFileSync(holdFile, 'utf8') : null,
          decision: existsSync(holdFile + '.ready')
            ? readFileSync(holdFile + '.ready', 'utf8')
            : null,
          logExists: existsSync(holdFile + '.log'),
        },
        null,
        2,
      ),
    );
}
async function until(test: () => boolean): Promise<void> {
  const end = performance.now() + 12000;
  while (!test()) {
    if (performance.now() >= end) throw new Error('host lock fixture control missing');
    await Bun.sleep(10);
  }
}
const helper = resolve(import.meta.dir, '../ops/testing/lock-owner.test.fixture.ts');
if (mode === 'cancel-before') controller.abort();
if (
  [
    'overlap-ready-cleanup',
    'overlap-cancel-cleanup',
    'overlap-retired-cleanup',
    'fast-retired',
    'fast-refusal',
    'fast-refusal-report-failure',
    'ready-report-failure',
    'fast-refusal-replaced-log',
    'fast-refusal-wrong-boot',
    'fast-refusal-foreign-decision',
    'unconfirmed-ready',
    'unconfirmed-pid',
    'forged-live-birth',
    'reject-wait',
    'missing-callback',
    'false-status',
    'pending-status',
    'callback-error',
  ].includes(mode)
) {
  const spawn = Bun.spawn;
  const intercepted = (
    argv: string[],
    options: Bun.Spawn.SpawnOptions<'ignore', number, number>,
  ) => {
    const observe = options.onExit?.bind(options);
    if (observe === undefined) throw new Error('fixture native observer missing');
    const child = spawn(argv, {
        ...options,
        async onExit(native, code, signal, cause) {
          if (mode === 'missing-callback') return;
          const failures: unknown[] = [];
          try {
            if (
              mode === 'fast-refusal-wrong-boot' &&
              process.env['PUNI_PARENT_RESIDUAL_END_BIRTH_GATE'] === '1'
            ) {
              if (cause !== undefined || code !== 75 || signal !== null)
                throw new Error('ended foreign-birth native callback is not confirmed refusal75');
              renameSync(holdFile + '.end-gated', holdFile);
              if (modeCapture !== undefined)
                writeFileSync(
                  join(modeCapture, 'foreign-native-end-input.json'),
                  JSON.stringify(
                    { pid: native.pid, code, signal, hold: readFileSync(holdFile, 'utf8') },
                    null,
                    2,
                  ),
                );
            }
            if (mode === 'fast-retired') {
              if (cause !== undefined || code !== 0 || signal !== null)
                throw new Error('fast retired native callback is not confirmed zero');
              // This isolated cleanup-latch oracle delays the real file's visibility until the
              // actual native callback; a polling decision cannot independently seed the latch.
              renameSync(holdFile + '.ready.deferred', holdFile + '.ready');
              writeFileSync(join(root, 'retired-restored-at-native-callback'), 'confirmed');
              if (modeCapture !== undefined)
                writeFileSync(
                  join(modeCapture, 'native-end-input.json'),
                  JSON.stringify(
                    {
                      pid: native.pid,
                      code,
                      signal,
                      decision: readFileSync(holdFile + '.ready', 'utf8'),
                    },
                    null,
                    2,
                  ),
                );
            }
            await observe(
              native,
              code,
              signal,
              mode === 'callback-error'
                ? new Error('controlled holder native wait failure')
                : cause,
            );
          } catch (cause) {
            failures.push(cause);
          }
          try {
            if (mode.startsWith('overlap-')) {
              if (
                cause !== undefined ||
                code !== (mode === 'overlap-cancel-cleanup' ? 143 : 0) ||
                signal !== null
              )
                throw new Error('overlap helper native termination was not clean');
              writeFileSync(join(root, 'native-observed'), 'confirmed');
            }
            if (['fast-refusal-report-failure', 'ready-report-failure'].includes(mode)) {
              appendFileSync(
                holdFile + '.log',
                'after actual native terminal' + String.fromCharCode(10),
              );
              writeFileSync(join(root, 'native-observed'), 'confirmed');
            }
          } catch (cause) {
            failures.push(cause);
          }
          if (failures.length === 1) throw failures[0];
          if (failures.length > 1)
            throw new AggregateError(failures, 'native observer and proof recording failed');
        },
      }),
      end = performance.now() + 4000;
    const birth = mode.startsWith('overlap-')
      ? (() => {
          const source = readFileSync('/proc/' + String(child.pid) + '/stat', 'utf8'),
            start = source
              .slice(source.lastIndexOf(')') + 2)
              .split(' ')
              .at(19);
          if (start === undefined) throw new Error('fixture spawned helper birth absent');
          const identity = {
            pid: child.pid,
            boot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
            start,
          };
          formatIdentity(identity);
          return identity;
        })()
      : undefined;
    const reconciled = mode.startsWith('overlap-')
      ? child.exited.then(async (status) => {
          await until(() => existsSync(join(root, 'native-observed')));
          await Bun.sleep(30);
          const generation = readGeneration(holdFile),
            decision = readDecision(holdFile + '.ready'),
            token = readHold(holdFile);
          if (generation === undefined || decision === undefined)
            throw new Error('overlap generation evidence absent');
          const helper = decision.kind === 'cancelled' ? token?.identity : decision.identity;
          if (
            helper === undefined ||
            birth === undefined ||
            formatIdentity(helper) !== formatIdentity(birth)
          )
            throw new Error('overlap helper full birth changed');
          if (decision.kind === 'cancelled' && decision.identity.pid !== process.pid)
            throw new Error('overlap controller changed');
          removeGeneration(generation);
          if (decision.kind === 'cancelled') {
            releaseHold(decision);
            if (token === undefined) throw new Error('overlap cancelled child witness absent');
            releaseHold(token);
          } else {
            if (token !== undefined) releaseHold(token);
            releaseHold(decision);
          }
          writeFileSync(join(root, 'reconciled'), 'log-first, final witness last');
          await Bun.sleep(10);
          return status;
        })
      : undefined;
    while (
      mode.startsWith('fast-refusal') ||
      mode === 'fast-retired' ||
      mode === 'unconfirmed-ready' ||
      mode === 'unconfirmed-pid' ||
      mode === 'forged-live-birth'
    ) {
      const token = existsSync(holdFile),
        stat = '/proc/' + String(child.pid) + '/stat';
      const ended =
        !existsSync(stat) ||
        readFileSync(stat, 'utf8')
          .slice(readFileSync(stat, 'utf8').lastIndexOf(')') + 2)
          .startsWith('Z ');
      if (mode === 'fast-retired') {
        if (token && !existsSync(holdFile + '.ready')) {
          const own = readHold(holdFile);
          if (own === undefined) throw new Error('fast retired helper identity absent');
          createDecision(holdFile + '.ready', 'retired', own.identity);
          releaseHold(own);
        }
        if (ended) {
          if (readDecision(holdFile + '.ready')?.kind !== 'retired')
            throw new Error('fast retired real decision witness absent');
          renameSync(holdFile + '.ready', holdFile + '.ready.deferred');
          writeFileSync(join(root, 'ended-before-parent-observation'), 'confirmed');
          break;
        }
      }
      if (mode.startsWith('fast-refusal') && token && ended) {
        if (mode === 'fast-refusal-replaced-log') {
          renameSync(holdFile + '.log', holdFile + '.log.original');
          writeFileSync(holdFile + '.log', 'replacement', { flag: 'wx', mode: 0o600 });
        }
        if (mode === 'fast-refusal-wrong-boot') {
          const fields = readFileSync(holdFile, 'utf8').trim().split(' '),
            pid = fields.at(0),
            start = fields.at(2);
          if (pid === undefined || start === undefined)
            throw new Error('fixture birth token malformed');
          writeFileSync(
            holdFile,
            pid + ' 00000000-0000-0000-0000-000000000000 ' + start + String.fromCharCode(10),
          );
          if (modeCapture !== undefined)
            writeFileSync(
              join(modeCapture, 'foreign-birth-input.json'),
              JSON.stringify(
                {
                  hold: readFileSync(holdFile, 'utf8'),
                  actualBoot: readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
                  endedBeforeParentObservation: ended,
                },
                null,
                2,
              ),
            );
          if (process.env['PUNI_PARENT_RESIDUAL_END_BIRTH_GATE'] === '1')
            renameSync(holdFile, holdFile + '.end-gated');
        }
        if (mode === 'fast-refusal-foreign-decision') {
          const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
          writeFileSync(holdFile + '.ready', 'retired 1 ' + boot + ' 0' + String.fromCharCode(10), {
            flag: 'wx',
            mode: 0o600,
          });
        }
        writeFileSync(join(root, 'ended-before-parent-observation'), 'confirmed');
        break;
      }
      if (mode === 'forged-live-birth' && existsSync(holdFile + '.ready')) {
        const token = readHold(holdFile),
          decision = readDecision(holdFile + '.ready');
        if (
          token === undefined ||
          decision?.kind !== 'ready' ||
          formatIdentity(decision.identity) !== token.bytes
        )
          throw new Error('fixture original complete Ready birth absent');
        writeFileSync(join(root, 'actual-birth'), token.bytes, { flag: 'wx', mode: 0o600 });
        const forged = { ...token.identity, start: String(BigInt(token.identity.start) + 1n) };
        writeFileSync(holdFile, formatIdentity(forged));
        writeFileSync(holdFile + '.ready', 'ready ' + formatIdentity(forged));
        break;
      }
      if (
        (mode === 'unconfirmed-ready' || mode === 'unconfirmed-pid') &&
        existsSync(holdFile + '.ready')
      ) {
        if (mode === 'unconfirmed-pid')
          writeFileSync(path + '.d/holder', String(process.pid) + String.fromCharCode(10));
        else writeFileSync(path + '.d/label', 'different protected lane' + String.fromCharCode(10));
        break;
      }
      if (performance.now() >= end) throw new Error('native helper injection did not converge');
      Bun.sleepSync(5);
    }
    return new Proxy(child, {
      get(native, key) {
        if (key === 'unref') return native.unref.bind(native);
        if (key === 'exited') {
          if (reconciled !== undefined) return reconciled;
          if (mode === 'reject-wait')
            return Promise.reject(new Error('controlled holder numeric wait rejection'));
          if (mode === 'false-status') return Promise.resolve(37);
          if (mode === 'pending-status') return new Promise<number>(() => undefined);
        }
        const value: unknown = Reflect.get(native, key, native);
        return value;
      },
    });
  };
  // This fixture owns the one exact native-stdio overload; its process pauses only the parent observation.
  Bun.spawn = intercepted as typeof Bun.spawn;
}
const acquiring = acquireHold(
  {
    lockPath: path,
    helperPrefix: [...createLaunch(process.execPath, helper), path],
    clock: wallClock(),
    monotonic: monotonicClock(),
  },
  {
    holdFile,
    label: 'native supervisor',
    waitSeconds:
      mode.startsWith('fast-refusal') ||
      ['timeout-then-abort', 'missing-callback', 'unconfirmed-ready', 'unconfirmed-pid'].includes(
        mode,
      )
        ? 0
        : 10,
    pollSeconds: 5,
    claimGraceMs: ['unconfirmed-ready', 'unconfirmed-pid', 'timeout-then-abort'].includes(mode)
      ? 100
      : undefined,
    signal: controller.signal,
    report: (line) => {
      appendFileSync(join(root, 'reported'), line + String.fromCharCode(10));
      if (
        ['fast-refusal-report-failure', 'ready-report-failure'].includes(mode) &&
        existsSync(join(root, 'native-observed'))
      )
        throw new Error('controlled holder reporter failure');
    },
  },
  ['exit-before-holder-start', 'timeout-then-abort'].includes(mode)
    ? { ...process.env, PUNI_LOCK_FIXTURE_START_GATE: join(root, 'start-gate') }
    : mode === 'ready-report-failure'
      ? { ...process.env, PUNI_LOCK_FIXTURE_SILENT_OUTPUT: join(root, 'suppressed-output') }
      : process.env,
);
if (mode === 'exit-before-holder-start') {
  await until(() => existsSync(join(root, 'start-gate.spawned')));
  publish('startup-exit');
  process.exit(0);
}
if (
  mode === 'queued-cancel' ||
  mode === 'cancel-log-unlink-failure' ||
  mode === 'overlap-cancel-cleanup'
) {
  await until(() => existsSync(join(root, 'abort')));
  controller.abort();
}
if (mode === 'retired' || mode === 'overlap-retired-cleanup') {
  await until(() => existsSync(join(root, 'retire')));
  const token = readHold(holdFile);
  if (token === undefined) throw new Error('queued retirement helper absent');
  createDecision(holdFile + '.ready', 'retired', token.identity);
  releaseHold(token);
}
if (mode === 'exit-after-queue') {
  await until(
    () =>
      existsSync(holdFile) &&
      existsSync(path + '.queue') &&
      readdirSync(path + '.queue').some((name) => /^[0-9]{19}-[1-9][0-9]*$/u.test(name)),
  );
  publish('queued-exit');
  process.exit(0);
}
if (mode === 'timeout-then-abort') {
  await until(() => existsSync(holdFile + '.ready'));
  controller.abort();
  await Bun.sleep(50);
  writeFileSync(join(root, 'start-gate'), 'start');
}
if (mode === 'ready-report-failure') {
  await until(() => existsSync(holdFile + '.ready') && existsSync(join(root, 'suppressed-output')));
  await Bun.sleep(100);
  writeFileSync(join(root, 'authorized-release'), 'release');
  const { unlinkSync } = await import('node:fs');
  unlinkSync(holdFile);
}
let outcome: Awaited<typeof acquiring>;
try {
  outcome = await acquiring;
} catch (cause) {
  if (mode === 'cancel-log-unlink-failure') {
    if (!(cause instanceof Error) || cause.message !== 'controlled generation log unlink failure')
      throw cause;
    publish('cleanup-failed');
    process.exit(0);
  }
  if (
    [
      'fast-refusal-replaced-log',
      'fast-refusal-wrong-boot',
      'fast-refusal-foreign-decision',
      'forged-live-birth',
    ].includes(mode)
  ) {
    if (
      !(cause instanceof Error) ||
      !/birth|boot|log pathname was replaced|readiness|retirement|decision/u.test(cause.message)
    )
      throw cause;
    writeFileSync(join(root, 'generation-failure'), cause.message);
    publish('generation-refused');
    process.exit(0);
  }
  if (
    !['fast-refusal-report-failure', 'ready-report-failure'].includes(mode) ||
    !(cause instanceof Error) ||
    cause.message !== 'controlled holder reporter failure'
  )
    throw cause;
  publish('reporting-failed');
  process.exit(0);
}
if (outcome.kind !== 'held') {
  publish(outcome.kind);
  if (outcome.kind === 'refused') {
    writeFileSync(join(root, 'refusal'), JSON.stringify(outcome));
    if (mode === 'fast-refusal' && outcome.exitCode === 75) process.exit(0);
    if (mode === 'retired' || mode === 'fast-retired' || mode === 'overlap-retired-cleanup')
      process.exit(0);
    if (
      [
        'unconfirmed-ready',
        'unconfirmed-pid',
        'reject-wait',
        'missing-callback',
        'timeout-then-abort',
      ].includes(mode) &&
      outcome.exitCode === 70
    )
      process.exit(0);
    throw new Error(
      'native acquisition refused: ' + String(outcome.exitCode) + ' ' + outcome.reason,
    );
  }
  process.exit(0);
}
if (mode === 'hold') {
  const ready = readDecision(holdFile + '.ready');
  if (ready?.kind !== 'ready') throw new Error('admitted Ready absent');
  let refused = false;
  try {
    createDecision(ready.path, 'retired', ready.identity);
  } catch (cause) {
    if (!(cause instanceof Error) || !('code' in cause) || cause.code !== 'EEXIST') throw cause;
    refused = true;
  }
  if (!refused || verifyHold(ready) !== 'present')
    throw new Error('Ready retirement exclusivity failed');
  writeFileSync(join(root, 'ready-retirement-refused'), 'exclusive');
}
publish('held', outcome.hold.pid);
if (mode === 'diagnostics-loss') {
  await until(() => existsSync(join(root, 'probe')));
  const diagnostic = outcome.hold.diagnostics();
  if (diagnostic.kind !== 'unavailable')
    throw new Error('diagnostic loss was not modeled explicitly');
  publish('diagnostics-unavailable', outcome.hold.pid);
}
if (mode === 'acquire-then-exit') process.exit(0);
if (mode === 'hold-abort') {
  await until(() => existsSync(join(root, 'abort')));
  controller.abort();
  publish('aborted-held', outcome.hold.pid);
}
await until(() => existsSync(join(root, 'release')));
if (mode === 'ready-decision-mutation') {
  const { formatIdentity } = await import('./hold-token');
  writeFileSync(holdFile + '.ready', 'retired ' + formatIdentity(outcome.hold.identity));
}
outcome.hold.release();
let status: number;
try {
  status = await outcome.hold.exited;
} catch (cause) {
  if (mode === 'ready-log-unlink-failure') {
    if (!(cause instanceof Error) || cause.message !== 'controlled generation log unlink failure')
      throw cause;
    publish('cleanup-failed');
    process.exit(0);
  }
  if (
    !['false-status', 'pending-status', 'callback-error', 'ready-decision-mutation'].includes(mode)
  )
    throw cause;
  writeFileSync(
    join(root, 'observation-failure'),
    cause instanceof Error ? cause.message : String(cause),
  );
  publish('observation-failed', outcome.hold.pid);
  process.exit(0);
}
publish('finished', outcome.hold.pid);
process.exit(status);
