import { inMemoryPlanEvents } from '@wbs/store-memory/history-fixture';
import { inMemoryEventLog } from '@wbs/store-memory/replay-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import type { Intervals } from '../../ports/timers';
import { installBoundedReplaySweep } from './check';
import { BOUNDED_REPLAY_SWEEP_LABEL } from './contract';
import { boundedReplaySweepModule } from './module';

/** Never fires on its own; the one test that needs a tick uses {@link fakeSchedule}. */
const noopIntervals: Intervals = {
  every: () => () => undefined,
};

/**
 * A schedule a test advances by hand, borrowed from `retention-timer.test.ts`'s
 * own fixture: real `setInterval` would make this file flaky under load, and
 * the thing under test is the sweep the module wires, not the clock.
 */
function fakeSchedule(): { every: Intervals['every']; advance: () => void } {
  let tick: (() => void) | null = null;
  return {
    every: (_milliseconds, fire) => {
      tick = fire;
      return () => {
        tick = null;
      };
    },
    advance: () => {
      if (tick === null) throw new Error('the timer never scheduled');
      tick();
    },
  };
}

const requirements = () => ({
  eventLog: inMemoryEventLog(),
  planEvents: inMemoryPlanEvents(),
  intervals: noopIntervals,
  now: () => 0,
  maxPerSubscription: 10,
  planEventRetentionDays: 365,
  intervalMs: 1_000,
  onError: () => undefined,
});

/**
 * A complete host graph over the same requirements.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 Plan history's own module.test.ts
 * records for its two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .installModule(boundedReplaySweepModule)
    .register({
      eventLog: DiBag.fromSyncFactory(() => inMemoryEventLog()),
      planEvents: DiBag.fromSyncFactory(() => inMemoryPlanEvents()),
      intervals: DiBag.fromSyncFactory((): Intervals => noopIntervals),
      now: DiBag.fromSyncFactory(() => () => 0),
      maxPerSubscription: DiBag.fromSyncFactory(() => 10),
      planEventRetentionDays: DiBag.fromSyncFactory(() => 365),
      intervalMs: DiBag.fromSyncFactory(() => 1_000),
      onSweep: DiBag.fromSyncFactory(() => undefined),
      onError: DiBag.fromSyncFactory(() => () => undefined),
    })
    .build();

describe('the Bounded replay sweep module', () => {
  it('builds a timer that is not running until started', () => {
    const { retention } = installBoundedReplaySweep(requirements());

    expect(retention.isRunning()).toBe(false);
  });

  it('starts, sweeps on the borrowed schedule and stops', async () => {
    const schedule = fakeSchedule();
    const eventLog = inMemoryEventLog();
    await eventLog.record('project:a', {});
    await eventLog.record('project:a', {});
    const { retention } = installBoundedReplaySweep({
      ...requirements(),
      eventLog,
      intervals: { every: schedule.every },
      maxPerSubscription: 1,
    });

    retention.start();
    expect(retention.isRunning()).toBe(true);
    schedule.advance();
    await retention.stop();

    expect(retention.isRunning()).toBe(false);
    expect(await eventLog.rangeSince('project:a', -1)).toHaveLength(1);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as Plan history's own installer test: an object with
   * an extra property still satisfies `BoundedReplaySweepExports`, so only
   * enumerating the returned surface catches a leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installBoundedReplaySweep(requirements());

    expect(Object.keys(exposed)).toEqual(['retention']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /** A host that installs the module cannot name what the module did not export. */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('retentionOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "retentionOptions" is not registered.');
  });

  /** The label is what makes a private binding identifiable in any graph report. */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${BOUNDED_REPLAY_SWEEP_LABEL}/retentionOptions`,
    );
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .installModule(boundedReplaySweepModule)
      .register({
        eventLog: DiBag.fromSyncFactory(() => inMemoryEventLog()),
        intervals: DiBag.fromSyncFactory((): Intervals => noopIntervals),
        now: DiBag.fromSyncFactory(() => () => 0),
        maxPerSubscription: DiBag.fromSyncFactory(() => 10),
        planEventRetentionDays: DiBag.fromSyncFactory(() => 365),
        intervalMs: DiBag.fromSyncFactory(() => 1_000),
        onSweep: DiBag.fromSyncFactory(() => undefined),
        onError: DiBag.fromSyncFactory(() => () => undefined),
      }) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('retention')).toThrow(
      `Cannot resolve "${BOUNDED_REPLAY_SWEEP_LABEL}/retentionOptions": dependency "planEvents" is not registered. Resolution path: retention -> ${BOUNDED_REPLAY_SWEEP_LABEL}/retentionOptions -> planEvents.`,
    );
  });
});
