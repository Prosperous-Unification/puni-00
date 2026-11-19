import { expect, it } from 'bun:test';

import { type ControlEvent, createGateControl } from './gate-control';
import { createJobControl } from './job-control';
import { calibrateHostJob, type JobRunDependencies, runHostJob } from './job-run';
import { OpsRefusal } from './refusal';

it('borrows replay and retires only its own subscription', () => {
  const external = new AbortController(),
    reason = { opaque: true },
    parent = createGateControl(external.signal);
  external.abort(reason);
  const counts = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal));
  const lease = createJobControl(parent.subscribe);
  try {
    expect(lease.received()).toEqual({ kind: 'external', reason });
    expect(lease.signal.aborted).toBe(true);
    expect(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal))).toEqual(
      counts,
    );
    lease.close();
    expect(parent.readInterruption()).toEqual({ kind: 'external', reason });
    expect(parent.readStatus()).toBe(130);
  } finally {
    lease.close();
    parent.dispose();
  }
});
it('deduplicates replay by sequence and forwards each newer event to one current recipient', () => {
  let observe: ((event: ControlEvent) => void) | undefined;
  const lease = createJobControl((callback) => {
    observe = callback;
    return () => {
      observe = undefined;
    };
  });
  const first: string[] = [],
    current: string[] = [],
    reason = { opaque: true };
  try {
    lease.setRecipient((signal) => first.push(signal));
    const event: ControlEvent = { sequence: 1, kind: 'external', reason };
    observe?.(event);
    observe?.(event);
    lease.setRecipient((signal) => current.push(signal));
    observe?.({ sequence: 2, kind: 'native', signal: 'SIGINT' });
    observe?.({ sequence: 1, kind: 'external', reason });
    observe?.({ sequence: 3, kind: 'native', signal: 'SIGTERM' });
    expect(first).toEqual(['SIGTERM']);
    expect(current).toEqual(['SIGINT', 'SIGTERM']);
    expect(lease.received()).toEqual({ kind: 'external', reason });
    lease.throwIfFailed();
  } finally {
    lease.close();
  }
});
it('contains recipient failure until its operation explicitly surfaces it', () => {
  const parent = createGateControl(new AbortController().signal),
    failure = new Error('recipient reporting failed'),
    lease = createJobControl(parent.subscribe);
  try {
    lease.setRecipient(() => {
      throw failure;
    });
    expect(() => process.emit('SIGTERM')).not.toThrow();
    expect(parent.readStatus()).toBe(143);
    expect(() => {
      lease.throwIfFailed();
    }).toThrow('host job control delivery failed');
    lease.close();
    expect(() => process.emit('SIGINT')).not.toThrow();
  } finally {
    lease.close();
    parent.dispose();
  }
});
it('owns standalone INT TERM and HUP only until retirement', () => {
  const counts = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal)),
    lease = createJobControl();
  try {
    expect(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal))).toEqual(
      counts.map((count) => count + 1),
    );
    process.emit('SIGHUP');
    expect(lease.received()).toEqual({ kind: 'native', signal: 'SIGHUP' });
    expect(lease.signal.aborted).toBe(true);
  } finally {
    lease.close();
  }
  expect(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => process.listenerCount(signal))).toEqual(
    counts,
  );
});

for (const [name, operate] of [
  ['run', runHostJob],
  ['calibration', calibrateHostJob],
] as const) {
  it(
    name + ' refuses prior external control before catalogue/toolchain/runtime IO and retires once',
    async () => {
      const external = new AbortController(),
        reason = { privateValue: 'never expose' },
        parent = createGateControl(external.signal);
      let retired = 0;
      external.abort(reason);
      const unavailable = () => {
        throw new Error('preflight dependency must not run');
      };
      const deps: JobRunDependencies = {
        helperPrefix: ['selected-protected-artifact'],
        clock: { read: unavailable },
        monotonic: { now: unavailable },
        environment: {},
        cwd: '/absent-catalogue-for-prior-control',
        report: unavailable,
        telemetry: { cgroupOf: unavailable, read: unavailable, members: unavailable },
        host: { cpuCores: unavailable, memoryGib: unavailable },
        sampleIntervalMs: 10000,
        settleBudgetMs: 2000,
        user: 'fixture',
        legacyLock: {
          lockPath: '/absent-lock',
          helperPrefix: ['selected-protected-artifact'],
          clock: { read: unavailable },
          monotonic: { now: unavailable },
        },
        control: {
          subscribe(observe) {
            const retire = parent.subscribe(observe);
            return () => {
              retired++;
              retire();
            };
          },
        },
      };
      try {
        const outcome = await operate(
          {
            config: '/absent-pool',
            type: 'not-read',
            label: 'private',
            waitSeconds: 0,
            pollSeconds: 1,
            argv: ['not-run'],
          },
          deps,
        ).then(
          () => {
            throw new Error('prior control must refuse');
          },
          (cause: unknown) => cause,
        );
        expect(outcome).toBeInstanceOf(OpsRefusal);
        if (!(outcome instanceof OpsRefusal)) throw outcome;
        expect(outcome.exitCode).toBe(130);
        expect(outcome.message).toBe('ops job run: externally cancelled before the gate opened');
        expect(outcome.message).not.toContain('never expose');
        expect(parent.readInterruption()).toEqual({ kind: 'external', reason });
        const first = parent.readInterruption();
        if (first.kind !== 'external') throw new Error('missing external provenance');
        expect(first.reason).toBe(reason);
        expect(retired).toBe(1);
      } finally {
        parent.dispose();
      }
    },
  );
  it(name + ' retires its borrowed registration after early catalogue failure', async () => {
    const parent = createGateControl(new AbortController().signal);
    let retired = 0;
    try {
      const unavailable = () => {
        throw new Error('unexpected later dependency');
      };
      const deps: JobRunDependencies = {
        helperPrefix: ['selected-protected-artifact'],
        clock: { read: unavailable },
        monotonic: { now: unavailable },
        environment: {},
        cwd: '/absent-catalogue-for-early-failure',
        report: unavailable,
        telemetry: { cgroupOf: unavailable, read: unavailable, members: unavailable },
        host: { cpuCores: unavailable, memoryGib: unavailable },
        sampleIntervalMs: 10000,
        settleBudgetMs: 2000,
        user: 'fixture',
        legacyLock: {
          lockPath: '/absent-lock',
          helperPrefix: ['selected-protected-artifact'],
          clock: { read: unavailable },
          monotonic: { now: unavailable },
        },
        control: {
          subscribe(observe) {
            const retire = parent.subscribe(observe);
            return () => {
              retired++;
              retire();
            };
          },
        },
      };
      const failure: unknown = await operate(
        {
          config: '/absent-pool',
          type: 'not-read',
          label: 'private',
          waitSeconds: 0,
          pollSeconds: 1,
          argv: ['not-run'],
        },
        deps,
      ).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(failure).toBeInstanceOf(OpsRefusal);
      expect(retired).toBe(1);
      expect(parent.signal.aborted).toBe(false);
    } finally {
      parent.dispose();
    }
  });
}

it('keeps deferred delivery causes after one throwing retirement attempt', () => {
  const external = new AbortController(),
    parent = createGateControl(external.signal),
    retirementFailure = new Error('retirement callback failure'),
    deliveryFailure = new Error('delivery callback failure');
  let attempts = 0,
    retirementAttempted = false;
  const lease = createJobControl((observe) => {
    const retire = parent.subscribe(observe);
    return () => {
      attempts++;
      retire();
      throw retirementFailure;
    };
  });
  try {
    lease.setRecipient(() => {
      throw deliveryFailure;
    });
    expect(() => {
      external.abort({ opaque: true });
    }).not.toThrow();
    let retirement: unknown;
    retirementAttempted = true;
    try {
      lease.close();
    } catch (cause) {
      retirement = cause;
    }
    expect(retirement).toBe(retirementFailure);
    expect(attempts).toBe(1);
    expect(() => {
      lease.close();
    }).not.toThrow();
    expect(attempts).toBe(1);
    let deferred: unknown;
    try {
      lease.throwIfFailed();
    } catch (cause) {
      deferred = cause;
    }
    expect(deferred).toBeInstanceOf(AggregateError);
    if (!(deferred instanceof AggregateError)) throw new Error('deferred delivery cause absent');
    expect(deferred.errors[0]).toBe(deliveryFailure);
    expect(parent.readStatus()).toBe(130);
  } finally {
    try {
      if (!retirementAttempted) lease.close();
    } finally {
      parent.dispose();
    }
  }
});

it('closed borrowed lease ignores observations after uncertain retirement dependency projection', () => {
  const external = new AbortController(),
    parent = createGateControl(external.signal),
    retirementFailure = new Error('retirement failed before registration removal');
  let attempts = 0;
  const lease = createJobControl((observe) => {
    parent.subscribe(observe);
    return () => {
      attempts++;
      throw retirementFailure;
    };
  });
  try {
    let failure: unknown;
    try {
      lease.close();
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBe(retirementFailure);
    const reason = { opaque: 'after failed retirement' };
    external.abort(reason);
    expect(
      lease.received(),
      'closed lease ignores still-registered source observations',
    ).toBeNull();
    expect(lease.signal.aborted).toBe(false);
    const first = parent.readInterruption();
    expect(first.kind).toBe('external');
    if (first.kind !== 'external')
      throw new Error('genuine parent missed projected retirement control');
    expect(first.reason).toBe(reason);
    expect(attempts).toBe(1);
  } finally {
    parent.dispose();
  }
});
