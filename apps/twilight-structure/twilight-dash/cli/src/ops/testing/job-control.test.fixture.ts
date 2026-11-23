import * as childProcess from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { createLaunch } from '@shared/bun-startup';
import { expect, mock } from 'bun:test';

import { monotonicClock, wallClock } from '../../clock';
import { ampleHost, hostPoolFixture } from '../../resources/host-pool.test.fixture';
import * as legacyLockModule from '../../resources/legacy-lock';
import {
  awaitLegacyRelease,
  holdLegacyLock,
  type LegacyHold,
  readLegacyQueue,
} from '../../resources/legacy-lock';
import { privateLegacyLock } from '../../resources/legacy-lock.test.fixture';
import { type HostJob, loadResourceConfiguration, ResourceRuntime } from '../../resources/runtime';
import { type ControlEvent, createGateControl } from '../gate-control';
import type { JobRunDependencies } from '../job-run';
import { catalogueCheckout, fakeScopeTelemetry, fakeSystemdRun } from '../ops.test.fixture';
import { OpsRefusal } from '../refusal';
import { HostJobRunRecords } from '../run-records';

const root = process.argv.at(2),
  scenario = process.argv.at(3);
if (root === undefined || scenario === undefined) throw new Error('missing job control operands');
const supplied: unknown = JSON.parse(readFileSync(join(root, 'setup-input.json'), 'utf8'));
if (
  typeof supplied !== 'object' ||
  supplied === null ||
  !('credential' in supplied) ||
  typeof supplied.credential !== 'string'
)
  throw new Error('missing job-control fixture credential');
const pool = hostPoolFixture(
  {
    cpuCores: 4,
    memoryGib: 4,
    headroom: { cpuCores: 0, memoryGib: 1 },
    gateTrees: 0,
    credential: supplied.credential,
  },
  // The borrowed job requests one GiB. Calibration reserves both units through real disk admission.
  // Proof: with 16 units, eight calibrations expired. A queued calibration had 13,895,712,768
  // bytes free with 17,179,869,184 required. With two units all 28 native cases and the following
  // parent-isolation check passed at their original deadlines.
  { diskBudgetUnits: 2 },
);
writeFileSync(join(root, 'pool-path'), pool.base);
const runtime = ResourceRuntime.initialize(
    loadResourceConfiguration(pool.config),
    wallClock(),
    ampleHost,
  ),
  checkout = catalogueCheckout(join(pool.base, 'checkout'), [
    { id: 'test-queued', cpuCores: 1, memoryGib: 1, tmpDiskGib: 1 },
  ]),
  bin = fakeSystemdRun(join(pool.base, 'bin'), 'exec'),
  payload = join(pool.base, 'payload.mjs'),
  external = new AbortController(),
  control = createGateControl(external.signal),
  counts = () => ['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal)),
  ownedCounts = counts(),
  telemetry = fakeScopeTelemetry(join(pool.base, 'cgroup')),
  lock = privateLegacyLock(pool.base),
  reason = { opaque: 'never log this caller value' },
  reports: string[] = [],
  deliveries: ControlEvent[] = [];
const isMissingProvenance = scenario.startsWith('missing-provenance-'),
  isWithdrawalFailure = scenario.startsWith('missing-provenance-withdrawal-'),
  isRetirementFailure = scenario.startsWith('retirement-'),
  isOperationFailure =
    scenario.startsWith('retirement-operation-') || scenario.startsWith('operation-failure-'),
  isSoleRetirement = scenario.startsWith('retirement-only-'),
  isNativeUnknown = scenario.startsWith('native-unknown-'),
  isDeliveryFailure =
    scenario.startsWith('delivery-failure-') || scenario.startsWith('retirement-delivery-'),
  isSynchronousGate = scenario === 'synchronous-int',
  isHeldObservation = scenario.startsWith('fd4-'),
  isPoststart =
    isNativeUnknown || scenario === 'external-poststart' || scenario === 'replay-poststart',
  isStartup = scenario.startsWith('startup-') || scenario === 'standalone-hup',
  isStandalone = scenario === 'standalone-hup';
let subscriptions = 0,
  retirements = 0,
  finished = false,
  released = false;
const held: [string | symbol, unknown[]][] = [],
  nativeEnded = Promise.withResolvers<undefined>(),
  actualSpawn = childProcess.spawn;
let statusHex = '',
  statusEnded = false,
  managerPid: number | undefined;
const nativeKill = process.kill.bind(process),
  forwardingFailure = new Error('controlled transport dependency failure'),
  reportingFailure = new Error('controlled report dependency failure'),
  operationFailure = new Error('controlled operation clock failure'),
  retirementFailure = new Error('controlled retirement callback failure'),
  withdrawalFailure = new Error('controlled checked withdrawal failure');
// This trusted class-prototype lookup has ResourceRuntime's declared method signature;
// retaining the unbound function permits an explicit original receiver during fixture cleanup.
const checkedWithdrawal = Reflect.get(ResourceRuntime.prototype, 'withdrawUnlaunchedHostJob');
let mismatchedAdmission: HostJob | undefined,
  withdrawalAttempts = 0;
if (isMissingProvenance) {
  const originalLegacy = { ...legacyLockModule };
  await mock.module('../../resources/legacy-lock', () => ({
    ...originalLegacy,
    async holdLegacyLock(
      ...operands: Parameters<typeof holdLegacyLock>
    ): Promise<Awaited<ReturnType<typeof holdLegacyLock>>> {
      const request = operands[1];
      if (!request.label.endsWith(' borrowed')) return originalLegacy.holdLegacyLock(...operands);
      const admission = runtime.listHostJobs().find((job) => job.label === 'borrowed');
      if (admission === undefined)
        throw new Error('dependency mismatch did not reach admitted job');
      mismatchedAdmission = admission;
      writeFileSync(
        join(root, 'mismatch-boundary.json'),
        JSON.stringify({
          kind: 'cancelled',
          observedControl: control.readInterruption(),
          signalAborted: request.signal.aborted,
          nativeTargetSpawned: false,
          dependencyEmulation: true,
          admission,
        }),
      );
      return { kind: 'cancelled' };
    },
  }));
  ResourceRuntime.prototype.withdrawUnlaunchedHostJob = function (id, reason) {
    const job = this.inspectHostJob(id);
    if (job.label === 'borrowed') {
      withdrawalAttempts++;
      if (isWithdrawalFailure) throw withdrawalFailure;
    }
    return checkedWithdrawal.call(this, id, reason);
  };
}

if (isDeliveryFailure)
  process.kill = (pid: number, signal?: string | number) => {
    if (pid === -(managerPid ?? 0) && signal === 'SIGTERM') throw forwardingFailure;
    return nativeKill(pid, signal);
  };
if (isHeldObservation || isDeliveryFailure || isNativeUnknown) {
  await mock.module('node:child_process', () => ({
    ...childProcess,
    spawn(...operands: Parameters<typeof childProcess.spawn>) {
      const child = actualSpawn(...operands);
      if (operands[1].includes('payload-internal-v1')) {
        managerPid = child.pid;
        if (isNativeUnknown) {
          void (async () => {
            while (!existsSync(join(pool.base, 'payload-ready'))) await Bun.sleep(1);
            child.emit('error', new Error('controlled native callback observation projection'));
            writeFileSync(join(root, 'native-observation-injected'), 'emulated');
          })().catch((cause: unknown) => {
            process.stderr.write(String(cause));
            process.exitCode = 1;
          });
        }
        if (!isHeldObservation) return child;
        const status = child.stdio.at(4);
        if (!(status instanceof Readable)) throw new Error('actual FD4 stream absent');
        const emit = status.emit.bind(status);
        status.emit = (event: string | symbol, ...operands: unknown[]) => {
          if (released) return emit(event, ...operands);
          if (event === 'data' || event === 'end' || event === 'close' || event === 'error') {
            if (event === 'data') {
              const chunk = operands[0];
              if (!(chunk instanceof Uint8Array)) throw new Error('unexpected actual FD4 chunk');
              statusHex += Buffer.from(chunk).toString('hex');
            }
            if (event === 'end') {
              statusEnded = true;
              if (!child.kill('SIGKILL'))
                throw new Error('actual completed-status keeper did not accept SIGKILL');
            }
            held.push([event, operands]);
            return true;
          }
          return emit(event, ...operands);
        };
        child.once('exit', (code, signal) => {
          writeFileSync(
            join(root, 'keeper-native.json'),
            JSON.stringify({ code, signal, statusHex, statusEnded }),
          );
          nativeEnded.resolve(undefined);
        });
        void (async () => {
          while (!existsSync(join(root, 'release-fd4'))) await Bun.sleep(1);
          released = true;
          for (const [event, operands] of held) emit(event, ...operands);
        })().catch((cause: unknown) => {
          process.stderr.write(String(cause));
          process.exitCode = 1;
        });
      }
      return child;
    },
  }));
}
const { runHostJob, calibrateHostJob } = await import('../job-run');
writeFileSync(
  payload,
  '#!' +
    process.execPath +
    '\n' +
    (isPoststart
      ? 'let receipts=[]; for(const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>{receipts.push(signal); require("node:fs").writeFileSync(' +
        JSON.stringify(join(pool.base, 'payload-signals.json')) +
        ',JSON.stringify(receipts));});\n'
      : '') +
    'await Bun.write(' +
    JSON.stringify(join(pool.base, 'payload-ready')) +
    ',"ready");\n' +
    (isHeldObservation
      ? ''
      : 'while(!(await Bun.file(' +
        JSON.stringify(join(pool.base, 'release-payload')) +
        ').exists())) await Bun.sleep(1);\n') +
    'process.exitCode=' +
    String(isPoststart ? 143 : 37) +
    ';\n',
  { mode: 0o755 },
);
let observer: ((event: ControlEvent) => void) | undefined;
function readObserver(): ((event: ControlEvent) => void) | undefined {
  return observer;
}
function isFinished(): boolean {
  return finished;
}
function requiredPath(): string {
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('fixture PATH unavailable');
  return path;
}
function readSignals(): string[] {
  const signals: unknown = JSON.parse(
    readFileSync(join(pool.base, 'payload-signals.json'), 'utf8'),
  );
  if (!Array.isArray(signals) || !signals.every((signal: unknown) => typeof signal === 'string'))
    throw new Error('invalid payload receipts');
  return signals;
}
const deps: JobRunDependencies = {
  helperPrefix: createLaunch(
    process.execPath,
    new URL('../../entrypoint.ts', import.meta.url).pathname,
  ),
  clock: isOperationFailure
    ? {
        read() {
          throw operationFailure;
        },
      }
    : wallClock(),
  monotonic: monotonicClock(),
  environment: { ...process.env, PATH: bin + ':' + requiredPath() },
  cwd: checkout,
  report: (line) => {
    reports.push(line);
    if (isDeliveryFailure && line.includes('ops job: forwarding')) throw reportingFailure;
  },
  telemetry: {
    ...telemetry,
    read(cgroup) {
      if (isSynchronousGate && !existsSync(join(root, 'synchronous-delivered'))) {
        writeFileSync(join(root, 'synchronous-delivered'), 'sent');
        process.kill(process.pid, 'SIGINT');
        Bun.sleepSync(25);
      }
      return telemetry.read(cgroup);
    },
    cgroupOf(pid) {
      if (isStartup) {
        writeFileSync(join(root, 'startup-checkpoint'), 'observed');
        if (!existsSync(join(root, 'startup-delivered'))) {
          writeFileSync(join(root, 'startup-delivered'), 'sent');
          process.kill(
            process.pid,
            scenario === 'startup-int'
              ? 'SIGINT'
              : scenario === 'standalone-hup'
                ? 'SIGHUP'
                : 'SIGTERM',
          );
        }
        return '/fake/elsewhere';
      }
      return telemetry.cgroupOf(pid);
    },
  },
  host: ampleHost,
  sampleIntervalMs: 10000,
  settleBudgetMs: 2000,
  user: 'fixture',
  legacyLock: lock,
  ...(isStandalone
    ? {}
    : {
        control: {
          subscribe(observe: (event: ControlEvent) => void) {
            subscriptions++;
            observer = observe;
            const retire = control.subscribe((event) => {
              deliveries.push(event);
              observe(event);
            });
            return () => {
              retirements++;
              observer = undefined;
              retire();
              if (isRetirementFailure) throw retirementFailure;
            };
          },
        },
      }),
};
const operate = scenario.includes('calibration') ? calibrateHostJob : runHostJob;
let pending:
    Promise<{ kind: 'status'; status: number } | { kind: 'failed'; cause: unknown }> | undefined,
  contender: string | undefined,
  contenderBefore: HostJob | undefined,
  holder: LegacyHold | undefined;
async function waitFor(label: string, predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = performance.now() + 8000;
  while (!(await predicate())) {
    if (performance.now() >= deadline) throw new Error('missing ' + label);
    await Bun.sleep(1);
  }
}
try {
  if (scenario === 'pool-wait') {
    HostJobRunRecords.open(runtime.configuration.root, false).close();
    const queued = runtime.enqueueHostJob(
      {
        descriptor: {
          id: 'contender',
          envelope: { cpuCores: 4, memoryGib: 3, tmpDiskGib: 0, exclusive: [] },
          containers: 'none',
          enforcement: 'observe',
        },
        label: 'independent-contender',
        waitSeconds: 60,
      },
      process.pid,
    );
    if (queued.kind !== 'queued') throw new Error(queued.reason);
    const admitted = runtime.pollHostJob(queued.ticket, () => undefined);
    if (admitted.kind !== 'admitted') throw new Error('independent contender not admitted');
    contender = admitted.job.id;
    contenderBefore = runtime.inspectHostJob(contender);
  }
  if (scenario === 'legacy-wait' || isMissingProvenance) {
    const outcome = await holdLegacyLock(
      lock,
      {
        holdFile: join(pool.base, 'independent-hold'),
        label: 'independent-holder',
        waitSeconds: 0,
        pollSeconds: 1,
        signal: new AbortController().signal,
        report: () => undefined,
      },
      process.env,
    );
    if (outcome.kind !== 'held') throw new Error('independent native holder not acquired');
    holder = outcome.hold;
  }
  pending = operate(
    {
      config: pool.config,
      type: 'test-queued',
      label: 'borrowed',
      waitSeconds: 10,
      pollSeconds: 1,
      argv: [payload],
    },
    deps,
  ).then(
    (status) => {
      finished = true;
      return { kind: 'status' as const, status };
    },
    (cause: unknown) => {
      finished = true;
      return { kind: 'failed' as const, cause };
    },
  );
  if (isMissingProvenance) {
    const outcome = await pending;
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') throw new Error('missing-provenance failure absent');
    const admitted = mismatchedAdmission;
    if (admitted === undefined) throw new Error('admitted mismatch checkpoint absent');
    expect(admitted.state).toBe('starting');
    expect(admitted.dev).toBeNull();
    expect(admitted.process).toBeNull();
    const job = runtime.inspectHostJob(admitted.id);
    if (!isWithdrawalFailure)
      expect(job.state, 'known unlaunched reservation is withdrawn on missing provenance').toBe(
        'released',
      );
    expect(withdrawalAttempts).toBe(1);
    let missing: unknown = outcome.cause;
    if (isWithdrawalFailure) {
      expect(outcome.cause).toBeInstanceOf(AggregateError);
      if (!(outcome.cause instanceof AggregateError))
        throw new Error('withdrawal and provenance failures not aggregated');
      missing = outcome.cause.errors[0];
      expect(outcome.cause.errors[1]).toBe(withdrawalFailure);
      expect(job).toEqual(admitted);
    }
    expect(missing).toBeInstanceOf(Error);
    if (!(missing instanceof Error)) throw new Error('missing-control cause absent');
    expect(missing.message).toBe('host job cancellation lacks an observed control');
    const queue = await readLegacyQueue(lock);
    expect(queue.holder).toMatchObject({
      kind: 'held',
      pid: holder?.pid,
      label: 'independent-holder',
    });
    expect(queue.waiters).toEqual([]);
    expect(existsSync(join(pool.base, 'payload-ready'))).toBe(false);
    expect(existsSync(join(bin, 'launched'))).toBe(false);
    expect(control.readInterruption()).toEqual({ kind: 'none' });
    expect(control.signal.aborted).toBe(false);
    expect(retirements).toBe(1);
    writeFileSync(
      join(root, 'receipt.json'),
      JSON.stringify({
        scenario,
        dependencyEmulation: true,
        nativeTargetSpawned: false,
        subscriptions,
        retirements,
        withdrawalAttempts,
        missingControlMessage: missing.message,
        withdrawalCauseIdentity: isWithdrawalFailure,
        jobState: job.state,
        holderPreserved: true,
        payloadStarted: false,
      }),
    );
  } else if (isOperationFailure) {
    const outcome = await pending;
    expect(retirements).toBe(1);
    expect(subscriptions).toBe(1);
    expect(counts()).toEqual(ownedCounts);
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') throw new Error('operation clock failure absent');
    if (isRetirementFailure) {
      expect(outcome.cause, 'operation and retirement causes survive by identity').toBeInstanceOf(
        AggregateError,
      );
      if (!(outcome.cause instanceof AggregateError))
        throw new Error('concurrent finalization failures were not aggregated');
      expect(outcome.cause.errors).toEqual([operationFailure, retirementFailure]);
      expect(outcome.cause.errors[0]).toBe(operationFailure);
      expect(outcome.cause.errors[1]).toBe(retirementFailure);
    } else expect(outcome.cause).toBe(operationFailure);
    expect(runtime.listHostJobs()).toEqual([]);
    expect(existsSync(join(pool.base, 'payload-ready'))).toBe(false);
    external.abort(reason);
    const first = control.readInterruption();
    if (first.kind !== 'external') throw new Error('parent unusable after retirement failure');
    expect(first.reason).toBe(reason);
    writeFileSync(
      join(root, 'receipt.json'),
      JSON.stringify({
        scenario,
        subscriptions,
        retirements,
        dependencyEmulation: true,
        operationCauseIdentity: true,
        retirementCauseIdentity: isRetirementFailure,
        parentUsable: true,
        payloadStarted: false,
      }),
    );
  } else if (isSoleRetirement) {
    await waitFor(
      'actual payload entry',
      () => existsSync(join(pool.base, 'payload-ready')) || isFinished(),
    );
    expect(isFinished()).toBe(false);
    writeFileSync(join(pool.base, 'release-payload'), 'release');
    const outcome = await pending;
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed') throw new Error('sole retirement failure absent');
    expect(outcome.cause).toBe(retirementFailure);
    expect(retirements).toBe(1);
    expect(runtime.listHostJobs()[0]?.state).toBe('released');
    external.abort(reason);
    const first = control.readInterruption();
    if (first.kind !== 'external') throw new Error('parent unusable');
    expect(first.reason).toBe(reason);
    writeFileSync(
      join(root, 'receipt.json'),
      JSON.stringify({
        scenario,
        subscriptions,
        retirements,
        dependencyEmulation: true,
        soleRetirementCauseIdentity: true,
        parentUsable: true,
        jobState: runtime.listHostJobs()[0]?.state,
      }),
    );
  } else if (
    isStartup ||
    isSynchronousGate ||
    scenario === 'pool-wait' ||
    scenario === 'legacy-wait'
  ) {
    if (scenario === 'pool-wait') {
      await waitFor('actual pool ticket', () => {
        if (isFinished()) throw new Error('pool wait ended before ticket observation');
        return runtime.hostPoolStatus().waiters.some((waiter) => waiter.label === 'borrowed');
      });
      external.abort(reason);
    }
    if (scenario === 'legacy-wait') {
      await waitFor('actual native waiter', async () =>
        (await readLegacyQueue(lock)).waiters.some((waiter) => waiter.label.endsWith(' borrowed')),
      );
      external.abort(reason);
    }
    const outcome = await pending;
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed' || !(outcome.cause instanceof OpsRefusal))
      throw new Error('expected interruption refusal');
    const expected = scenario === 'standalone-hup' ? 129 : scenario === 'startup-term' ? 143 : 130;
    expect(outcome.cause.exitCode).toBe(expected);
    expect(existsSync(join(pool.base, 'payload-ready'))).toBe(false);
    if (scenario === 'pool-wait') {
      expect(runtime.hostPoolStatus().waiters).toEqual([]);
      if (contender === undefined || contenderBefore === undefined)
        throw new Error('independent contender identity absent');
      expect(runtime.listHostJobs().map((job) => job.id)).toEqual([contender]);
      expect(runtime.inspectHostJob(contender)).toEqual(contenderBefore);
      expect(outcome.cause.message).toContain('externally cancelled');
      expect(outcome.cause.message).not.toContain('never log this caller value');
    }
    if (scenario === 'legacy-wait') {
      expect(outcome.cause.message).toContain('externally cancelled');
      const queue = await readLegacyQueue(lock);
      expect(queue.waiters).toEqual([]);
      expect(queue.holder).toMatchObject({
        kind: 'held',
        pid: holder?.pid,
        label: 'independent-holder',
      });
      expect(runtime.listHostJobs()).toHaveLength(1);
      expect(runtime.listHostJobs()[0]?.state).toBe('released');
    }
    expect(subscriptions).toBe(isStandalone ? 0 : 1);
    expect(retirements).toBe(isStandalone ? 0 : 1);
    writeFileSync(
      join(root, 'receipt.json'),
      JSON.stringify({
        scenario,
        code: outcome.cause.exitCode,
        message: outcome.cause.message,
        subscriptions,
        retirements,
        ownedCounts,
        afterCounts: counts(),
        holderIntact: scenario === 'legacy-wait',
        contenderIntact: scenario === 'pool-wait',
      }),
    );
  } else if (isNativeUnknown) {
    await waitFor('native callback observation projection', () =>
      existsSync(join(root, 'native-observation-injected')),
    );
    expect(finished).toBe(false);
    expect(retirements).toBe(0);
    expect(() => {
      external.abort(reason);
    }).not.toThrow();
    await waitFor('TERM receipt during native observation uncertainty', () =>
      existsSync(join(pool.base, 'payload-signals.json')),
    );
    expect(readSignals()).toEqual(['SIGTERM']);
    expect(finished).toBe(false);
    expect(retirements).toBe(0);
    writeFileSync(
      join(root, 'pending.json'),
      JSON.stringify({
        finished,
        subscriptions,
        retirements,
        nativeCallbackEmulation: true,
        reports,
      }),
    );
    writeFileSync(join(pool.base, 'release-payload'), 'release');
    const outcome = await pending;
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed' || !(outcome.cause instanceof OpsRefusal))
      throw new Error('native observation failure not surfaced after settlement');
    expect(outcome.cause.exitCode).toBe(70);
    expect(retirements).toBe(1);
    const first = control.readInterruption();
    if (first.kind !== 'external') throw new Error('external first reason absent');
    expect(first.reason).toBe(reason);
    writeFileSync(
      join(root, 'receipt.json'),
      JSON.stringify({
        scenario,
        subscriptions,
        retirements,
        nativeCallbackEmulation: true,
        code: outcome.cause.exitCode,
        jobState: runtime.listHostJobs()[0]?.state,
        parentReasonIdentity: first.reason === reason,
      }),
    );
  } else if (isDeliveryFailure) {
    await waitFor(
      'actual payload entry',
      () => existsSync(join(pool.base, 'payload-ready')) || isFinished(),
    );
    if (isFinished()) throw new Error('operation ended before delivery failure');
    expect(() => {
      external.abort(reason);
    }).not.toThrow();
    expect(finished).toBe(false);
    expect(retirements).toBe(0);
    expect(reports.some((line) => line.includes('ops job: forwarding SIGTERM'))).toBe(true);
    writeFileSync(
      join(root, 'pending.json'),
      JSON.stringify({ finished, subscriptions, retirements, dependencyEmulation: true, reports }),
    );
    writeFileSync(join(pool.base, 'release-payload'), 'release');
    const outcome = await pending;
    expect(outcome.kind).toBe('failed');
    if (outcome.kind !== 'failed' || !(outcome.cause instanceof AggregateError))
      throw new Error('deferred delivery failure absent');
    let deliveryFailure: AggregateError = outcome.cause;
    if (isRetirementFailure) {
      expect(outcome.cause.errors[0]).toBe(retirementFailure);
      const deferred: unknown = outcome.cause.errors[1];
      expect(deferred).toBeInstanceOf(AggregateError);
      if (!(deferred instanceof AggregateError))
        throw new Error('deferred delivery failure lost during retirement');
      deliveryFailure = deferred;
    }
    expect(deliveryFailure.message).toBe('host job control delivery failed');
    const deliveryCause: unknown = deliveryFailure.errors[0];
    expect(deliveryCause).toBeInstanceOf(AggregateError);
    if (!(deliveryCause instanceof AggregateError))
      throw new Error('forward and report causes absent');
    expect(deliveryCause.errors).toEqual([forwardingFailure, reportingFailure]);
    expect(deliveryCause.errors[0]).toBe(forwardingFailure);
    expect(deliveryCause.errors[1]).toBe(reportingFailure);
    expect(retirements).toBe(1);
    expect(runtime.listHostJobs()[0]?.state).toBe('released');
    expect(control.readInterruption()).toEqual({ kind: 'external', reason });
    writeFileSync(
      join(root, 'receipt.json'),
      JSON.stringify({
        scenario,
        subscriptions,
        retirements,
        dependencyEmulation: true,
        message: outcome.cause.message,
        causes: deliveryCause.errors.map((cause) => String(cause)),
        retirementCauseIdentity: isRetirementFailure,
        jobState: runtime.listHostJobs()[0]?.state,
      }),
    );
  } else if (isHeldObservation) {
    await nativeEnded.promise;
    await waitFor('bounded unconfirmed FD4 report', () =>
      reports.some((line) => line.includes('FD4 observation remains unconfirmed')),
    );
    external.abort(reason);
    expect(finished).toBe(false);
    expect(subscriptions).toBe(1);
    expect(retirements).toBe(0);
    expect(control.readInterruption()).toEqual({ kind: 'external', reason });
    writeFileSync(
      join(root, 'pending.json'),
      JSON.stringify({
        finished,
        subscriptions,
        retirements,
        reports,
        statusHex,
        statusEnded,
        parent: control.readInterruption(),
      }),
    );
    writeFileSync(join(root, 'release-fd4'), 'release');
    const outcome = await pending;
    expect(outcome).toEqual({ kind: 'status', status: 37 });
    expect(retirements).toBe(1);
    writeFileSync(
      join(root, 'receipt.json'),
      JSON.stringify({
        scenario,
        outcome,
        subscriptions,
        retirements,
        statusHex,
        statusEnded,
        deliverySequences: deliveries.map((event) => event.sequence),
        parentReasonIdentity: control.readInterruption().kind === 'external',
      }),
    );
  } else {
    await waitFor(
      'actual payload entry',
      () => existsSync(join(pool.base, 'payload-ready')) || isFinished(),
    );
    if (isFinished()) {
      const early = await pending;
      if (early.kind === 'failed') throw early.cause;
      throw new Error('payload settled before observation');
    }
    expect(counts(), 'borrowed actual operation adds no native owners').toEqual(ownedCounts);
    if (isPoststart) {
      external.abort(reason);
      await waitFor('external TERM payload receipt', () =>
        existsSync(join(pool.base, 'payload-signals.json')),
      );
      expect(readSignals()).toEqual(['SIGTERM']);
      if (scenario === 'replay-poststart') {
        const first = deliveries.at(0),
          currentObserver = readObserver();
        if (first === undefined || currentObserver === undefined)
          throw new Error('missing actual borrowed event');
        currentObserver(first);
        process.kill(process.pid, 'SIGINT');
        await waitFor('new native INT receipt', () => readSignals().length === 2);
        expect(readSignals()).toEqual(['SIGTERM', 'SIGINT']);
        expect(deliveries.map((event) => event.sequence)).toEqual([1, 2]);
      }
    }
    writeFileSync(join(pool.base, 'release-payload'), 'release');
    const outcome = await pending;
    expect(outcome).toEqual({ kind: 'status', status: isPoststart ? 143 : 37 });
    expect(subscriptions).toBe(1);
    expect(retirements).toBe(1);
    expect(counts()).toEqual(ownedCounts);
    external.abort(reason);
    const first = control.readInterruption();
    expect(first.kind).toBe('external');
    if (first.kind !== 'external') throw new Error('missing external observation');
    expect(first.reason).toBe(reason);
    expect(control.readStatus()).toBe(130);
    writeFileSync(
      join(root, 'receipt.json'),
      JSON.stringify({
        scenario,
        outcome,
        subscriptions,
        retirements,
        ownedCounts,
        afterCounts: counts(),
        parentUsable: first.reason === reason,
        parentStatus: control.readStatus(),
        deliverySequences: deliveries.map((event) => event.sequence),
        payloadReceipts: existsSync(join(pool.base, 'payload-signals.json')) ? readSignals() : [],
      }),
    );
  }
} finally {
  writeFileSync(join(pool.base, 'release-payload'), 'release');
  writeFileSync(join(root, 'release-fd4'), 'release');
  if (pending !== undefined) await pending;
  ResourceRuntime.prototype.withdrawUnlaunchedHostJob = checkedWithdrawal;
  if (
    isMissingProvenance &&
    mismatchedAdmission !== undefined &&
    runtime.inspectHostJob(mismatchedAdmission.id).state === 'starting'
  )
    checkedWithdrawal.call(
      runtime,
      mismatchedAdmission.id,
      'fixture cleanup after dependency mismatch',
    );
  if (holder !== undefined) {
    holder.release();
    await awaitLegacyRelease(holder);
  }
  if (contender !== undefined) runtime.withdrawUnlaunchedHostJob(contender, 'fixture ended');
  runtime.close();
  process.kill = nativeKill;
  control.dispose();
}
