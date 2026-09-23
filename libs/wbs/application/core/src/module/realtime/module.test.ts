import { inMemoryEventLog } from '@wbs/store-memory/replay-fixture';
import { describe, expect, it } from 'bun:test';
import { DiBag } from 'di-bag';

import { clockOf } from '../../ports/clock';
import { type ProjectEvent, subscriptionFor } from '../../ports/project-event';
import type { PushTransport } from '../../ports/push-transport';
import { installRealtime } from './check';
import { REALTIME_LABEL } from './contract';
import { realtimeModule } from './module';

const EVENT: ProjectEvent = { type: 'tree_replaced', workItems: [] };

/** A push client that records what it was handed, borrowed from `gateway-broadcaster.test.ts`'s own fixture. */
function fakePush() {
  const pushed: { subscription: string; seq: number }[] = [];
  const client: PushTransport = {
    push(payload) {
      pushed.push({ subscription: payload.subscription, seq: payload.seq });
      return Promise.resolve({ delivered: 1 });
    },
  };
  return { pushed, client };
}

const requirements = () => ({
  eventLog: inMemoryEventLog(),
  clock: clockOf({ now: () => 1_000, newId: () => crypto.randomUUID() }),
  push: fakePush().client,
  maxPerSubscription: 100,
  maxAgeMs: 5 * 60_000,
  onPushFailed: () => undefined,
});

/**
 * A complete host graph over the same requirements.
 *
 * Written out rather than shared with the incomplete graph below: a helper
 * returning either registration object gives DI Bag's builder a union it
 * refuses at the type level, the same TS2345 Plan history's and Bounded
 * replay sweep's own `module.test.ts` record for their two graphs.
 */
const completeHost = () =>
  DiBag.createBuilder()
    .installModule(realtimeModule)
    .register({
      eventLog: DiBag.fromSyncFactory(() => inMemoryEventLog()),
      clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 1_000, newId: () => 'id' })),
      push: DiBag.fromSyncFactory(() => fakePush().client),
      maxPerSubscription: DiBag.fromSyncFactory(() => 100),
      maxAgeMs: DiBag.fromSyncFactory(() => 5 * 60_000),
      maxEvents: DiBag.fromSyncFactory(() => undefined),
      onPushFailed: DiBag.fromSyncFactory(() => undefined),
    })
    .build();

describe('the Realtime module', () => {
  it('builds a buffer, a broadcaster and a replay orchestrator over the same requirements', () => {
    const { replayBuffer, broadcaster, replay } = installRealtime(requirements());

    expect(replayBuffer.oldestSeq('project:p-1')).toBeNull();
    expect(typeof broadcaster.publish).toBe('function');
    expect(typeof replay.replay).toBe('function');
  });

  it('publishes through the broadcaster, fills the shared buffer, and replay reads it back', async () => {
    const { pushed, client } = fakePush();
    const { replayBuffer, broadcaster, replay } = installRealtime({
      ...requirements(),
      push: client,
    });

    await broadcaster.publish('p-1', EVENT);

    expect(replayBuffer.oldestSeq(subscriptionFor('p-1'))).toBe(0);
    expect(await replay.replay({ 'project:p-1': -1 })).toEqual({
      'project:p-1': { status: 'replaying', events: [{ seq: 0, message: EVENT }] },
    });
    expect(pushed).toEqual([{ subscription: 'project:p-1', seq: 0 }]);
  });

  /**
   * The production installer hands out the contract's exports and nothing
   * else. Same reasoning as Plan history's and Bounded replay sweep's own
   * installer tests: an object with an extra property still satisfies
   * `RealtimeExports`, so only enumerating the returned surface catches a
   * leak the type checker would not.
   */
  it('exposes only the contract exports from its installer', () => {
    const exposed: object = installRealtime(requirements());

    expect(Object.keys(exposed).sort()).toEqual(['broadcaster', 'replay', 'replayBuffer']);
    expect(
      Object.values(exposed).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  /**
   * A host that installs the module cannot name either private binding: not
   * `broadcasterOptions`, and not `replayOptions` independently of it. Two
   * assertions rather than one, because a fault that leaks only one of the
   * two would leave the other passing.
   */
  it('keeps its private bindings out of a host graph', () => {
    const host = completeHost();

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('broadcasterOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "broadcasterOptions" is not registered.');
    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('replayOptions'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "replayOptions" is not registered.');
  });

  /**
   * The label is what makes a private binding identifiable in any graph
   * report — for both private bindings, not only the one the installer
   * happens to build first.
   */
  it('labels its private bindings with the module name', () => {
    const host = completeHost();
    const labels = host.inspectGraph().bindings.map((binding) => binding.label);

    expect(labels).toContain(`${REALTIME_LABEL}/broadcasterOptions`);
    expect(labels).toContain(`${REALTIME_LABEL}/replayOptions`);
  });

  /**
   * The label reaches a real DI failure message.
   *
   * A host that forgets a requirement is refused by the type checker, so the
   * cast reaches the runtime path an untyped or generated host reaches.
   */
  it('names itself when a host omits a requirement', () => {
    const partial = DiBag.createBuilder()
      .installModule(realtimeModule)
      .register({
        eventLog: DiBag.fromSyncFactory(() => inMemoryEventLog()),
        clock: DiBag.fromSyncFactory(() => clockOf({ now: () => 1_000, newId: () => 'id' })),
        maxPerSubscription: DiBag.fromSyncFactory(() => 100),
        maxAgeMs: DiBag.fromSyncFactory(() => 5 * 60_000),
        maxEvents: DiBag.fromSyncFactory(() => undefined),
        onPushFailed: DiBag.fromSyncFactory(() => undefined),
      }) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('broadcaster')).toThrow(
      `Cannot resolve "${REALTIME_LABEL}/broadcasterOptions": dependency "push" is not registered. Resolution path: broadcaster -> ${REALTIME_LABEL}/broadcasterOptions -> push.`,
    );
  });
});
