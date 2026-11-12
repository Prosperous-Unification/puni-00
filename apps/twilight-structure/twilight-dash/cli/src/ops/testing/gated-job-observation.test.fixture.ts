import * as childProcess from 'node:child_process';
import { once } from 'node:events';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';

import { createLaunch } from '@shared/bun-startup';
import { mock } from 'bun:test';

import { monotonicClock, wallClock } from '../../clock';
import { ampleHost } from '../../resources/host-pool.test.fixture';
import { privateLegacyLock } from '../../resources/legacy-lock.test.fixture';
import { loadResourceConfiguration, ResourceRuntime } from '../../resources/runtime';
import { fakeScopeTelemetry } from '../ops.test.fixture';
import { HostJobRunRecords } from '../run-records';

const [root, config, cwd, cgroupRoot, path, payload, scenario] = Array.from(
  { length: 7 },
  (_, index) => process.argv.at(index + 2),
);
if (
  root === undefined ||
  config === undefined ||
  cwd === undefined ||
  cgroupRoot === undefined ||
  path === undefined ||
  payload === undefined ||
  scenario === undefined
)
  throw new Error('missing job observer operands');
const original = { ...childProcess },
  nativeSpawn = childProcess.spawn;
let manager: childProcess.ChildProcess | undefined;
function readManager(): childProcess.ChildProcess | undefined {
  return manager;
}
const nativeEnded = Promise.withResolvers<undefined>(),
  held: [string | symbol, unknown[]][] = [],
  trace: string[] = [];
let fd4 = Buffer.alloc(0),
  fd4Ended = false,
  released = false;
await mock.module('node:child_process', () => ({
  ...original,
  spawn(...operands: Parameters<typeof childProcess.spawn>) {
    const child = nativeSpawn(...operands);
    if (operands[1].includes('payload-internal-v1')) {
      manager = child;
      child.once('exit', (code, signal) => {
        trace.push('native-exit:' + String(code) + ':' + String(signal));
        nativeEnded.resolve(undefined);
        if (scenario !== 'leader-error')
          writeFileSync(
            join(root, 'fd4-held.json'),
            JSON.stringify({ hex: fd4.toString('hex'), fd4Ended, signal, trace }),
          );
      });
      if (scenario.startsWith('control-')) {
        const control = child.stdio.at(3);
        if (!(control instanceof Writable)) throw new Error('actual control writable absent');
        const method = scenario.startsWith('control-start-callback') ? 'write' : 'end';
        const nativeOperation = control[method].bind(control);
        Object.defineProperty(control, method, {
          value(...arguments_: unknown[]) {
            const callback = arguments_.at(-1);
            if (typeof callback !== 'function') throw new Error('controlled callback absent');
            if (scenario === 'control-start-callback-after-status') {
              const status = child.stdio.at(4);
              if (!(status instanceof Readable)) throw new Error('actual status readable absent');
              const written = Promise.withResolvers<undefined>();
              arguments_[arguments_.length - 1] = (cause?: Error | null) => {
                if (cause) written.reject(cause);
                else written.resolve(undefined);
              };
              void once(status, 'end')
                .then(async () => {
                  await written.promise;
                  const ended = once(child, 'exit');
                  if (!child.kill('SIGKILL'))
                    throw new Error('cannot kill actual completed-status keeper');
                  await ended;
                  writeFileSync(join(root, 'control-callback-injected'), method);
                  Reflect.apply(callback, undefined, [
                    new Error('controlled actual control callback failure'),
                  ]);
                })
                .catch((cause: unknown) => {
                  process.stderr.write(String(cause));
                  process.exitCode = 1;
                });
              Reflect.apply(nativeOperation, undefined, arguments_);
              return control;
            }
            arguments_[arguments_.length - 1] = (cause?: Error | null) => {
              if (cause) throw new Error('unexpected actual control error', { cause });
              writeFileSync(join(root, 'control-callback-injected'), method);
              Reflect.apply(callback, undefined, [
                new Error('controlled actual control callback failure'),
              ]);
            };
            Reflect.apply(nativeOperation, undefined, arguments_);
            return control;
          },
        });
      } else if (scenario === 'leader-error') {
        void (async () => {
          while (!existsSync(join(root, 'leader-payload-ready'))) await Bun.sleep(1);
          child.emit('error', new Error('controlled leader observation error'));
          writeFileSync(join(root, 'leader-error-injected'), 'injected');
        })().catch((cause: unknown) => {
          process.stderr.write(String(cause));
          process.exitCode = 1;
        });
      } else {
        const status = child.stdio.at(4);
        if (!(status instanceof Readable)) throw new Error('missing actual status readable');
        const emit = status.emit.bind(status);
        status.emit = (event: string | symbol, ...operands: unknown[]) => {
          if (released) return emit(event, ...operands);
          if (event === 'data' || event === 'end' || event === 'close' || event === 'error') {
            if (event === 'data') {
              const chunk: unknown = operands[0];
              if (!(chunk instanceof Uint8Array)) throw new Error('unexpected native status chunk');
              fd4 = Buffer.concat([fd4, chunk]);
              trace.push('native-fd4-bytes');
            }
            if (event === 'end') {
              fd4Ended = true;
              trace.push('native-fd4-end');
              if (!child.kill('SIGKILL'))
                throw new Error('cannot kill actual keeper after FD4 end');
              trace.push('keeper-SIGKILL-requested');
            }
            held.push([event, operands]);
            return true;
          }
          if (event === 'close') writeFileSync(join(root, 'actual-fd4-close'), 'observed');
          return emit(event, ...operands);
        };
        void (async () => {
          while (!existsSync(join(root, 'release-fd4'))) await Bun.sleep(1);
          trace.push('release-parent-fd4-observation');
          released = true;
          if (scenario === 'fd4-read-error') {
            emit('error', new Error('controlled actual status observation failure'));
            const closing = held.find(([event]) => event === 'close');
            if (closing !== undefined) emit(closing[0], ...closing[1]);
          } else if (scenario === 'fd4-close-before-end') {
            const closing = held.find(([event]) => event === 'close');
            if (closing === undefined) throw new Error('actual native close was not observed');
            emit(closing[0], ...closing[1]);
          } else for (const [event, operands] of held) emit(event, ...operands);
        })().catch((cause: unknown) => {
          process.stderr.write(String(cause));
          process.exitCode = 1;
        });
      }
    }
    return child;
  },
}));
const { runHostJob } = await import('../job-run');
const faultMode = new Map([
  ['fd4-empty', 'missing'],
  ['fd4-partial', 'partial'],
  ['fd4-duplicate', 'duplicate'],
  ['fd4-malformed', 'leading-zero'],
]).get(scenario);
const helperPrefix =
  faultMode === undefined
    ? createLaunch(process.execPath, new URL('../../entrypoint.ts', import.meta.url).pathname)
    : [
        ...createLaunch(
          process.execPath,
          new URL('./gated-status.test.fixture.ts', import.meta.url).pathname,
        ),
        faultMode,
      ];
const reports: string[] = [];
let finished = false;
function isFinished(): boolean {
  return finished;
}
const operation = runHostJob(
  {
    config,
    type: 'test-queued',
    label: 'observation',
    waitSeconds: 0,
    pollSeconds: 1,
    argv: [payload],
  },
  {
    helperPrefix,
    clock: wallClock(),
    monotonic: monotonicClock(),
    environment: { ...process.env, PATH: path },
    cwd,
    report: (line) => {
      reports.push(line);
    },
    telemetry: fakeScopeTelemetry(cgroupRoot),
    host: ampleHost,
    sampleIntervalMs: 10000,
    settleBudgetMs: 2000,
    user: 'fixture',
    legacyLock: privateLegacyLock(join(cwd, '..')),
  },
).then(
  (status) => {
    finished = true;
    return { kind: 'status', status };
  },
  (cause: unknown) => {
    finished = true;
    return {
      kind: 'failed',
      code: cause instanceof Error && 'exitCode' in cause ? cause.exitCode : null,
      message: cause instanceof Error ? cause.message : 'unknown',
    };
  },
);
if (scenario.startsWith('control-')) {
  await operation;
} else if (scenario === 'leader-error') {
  while (!existsSync(join(root, 'leader-error-injected'))) await Bun.sleep(1);
  await Bun.sleep(30);
  writeFileSync(join(root, 'leader-observation.json'), JSON.stringify({ finished: isFinished() }));
  while (!existsSync(join(root, 'release-leader-payload'))) await Bun.sleep(1);
  const owned = readManager();
  if (isFinished() && owned !== undefined) {
    const control = owned.stdio.at(3);
    if (control instanceof Writable) control.destroy();
  }
} else {
  await nativeEnded.promise;
  await Bun.sleep(scenario === 'fd4-unconfirmed' ? 1300 : 30);
  writeFileSync(
    join(root, 'fd4-pending.json'),
    JSON.stringify({ finished: isFinished(), reports }),
  );
}
const outcome = await operation;
await nativeEnded.promise;
const runtime = ResourceRuntime.open(loadResourceConfiguration(config), wallClock()),
  jobs = runtime.listHostJobs();
runtime.close();
const records = HostJobRunRecords.openForReading(loadResourceConfiguration(config).root),
  runs = records.list();
records.close();
writeFileSync(
  join(root, 'job-observation-outcome.json'),
  JSON.stringify({ outcome, jobs, runs, reports, trace, fd4Hex: fd4.toString('hex'), fd4Ended }),
);
