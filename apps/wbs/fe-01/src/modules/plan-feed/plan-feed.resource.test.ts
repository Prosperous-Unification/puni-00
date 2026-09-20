import { describe, expect, it } from 'vitest';

import type {
  DirectoryRead,
  PlanRefresh,
  RefreshOutcome,
  RefreshResource,
} from '@/lib/plan-refresh';
import type { CalendarMarkerView, StepView } from '@/lib/wbs-api';
import { planRead } from '@/testing/views';

import type {
  AppliedGenerations,
  PlanFeedDelivery,
  PlanFeedStreamHandlers,
  PlanReadingPorts,
  PlanRefreshSnapshot,
} from './contract';
import { createPlanReading, nextDelivery } from './plan-feed.resource';

/** A resource nobody has read. */
const NOTHING_READ = { desired: 0, reading: false, installed: null, failure: null };

/** A resource whose newest read installed `value` at `generation`. */
function installedAt<T>(value: T, generation: number) {
  return { desired: generation, reading: false, installed: { generation, value }, failure: null };
}

/** An owner snapshot with nothing read, and the parts a case cares about laid over it. */
function snapshotOf(over: Partial<PlanRefreshSnapshot> = {}): PlanRefreshSnapshot {
  return {
    tree: NOTHING_READ,
    steps: NOTHING_READ,
    directory: NOTHING_READ,
    markers: NOTHING_READ,
    staleResources: [],
    baseline: null,
    acknowledged: -1,
    ...over,
  };
}

const ANCHORED = { seq: 7, epoch: 1 };
const NOTHING_APPLIED: AppliedGenerations = { tree: 0, steps: 0, directory: 0, markers: 0 };
const VOCABULARY: DirectoryRead = {
  teams: [],
  tags: [],
  services: [],
  workItemTypes: [],
  externalSystems: [],
  people: [],
};
const STEPS: readonly StepView[] = [{ id: 's1', name: 'Build' }];
/**
 * Empty, and that is enough: these cases are about **which** payload a delivery
 * carries and about the identity of the object it carries, never about what is
 * in it. A marker literal would also have to satisfy the colour and date fields
 * the view type requires, which prove nothing here.
 */
const MARKERS: readonly CalendarMarkerView[] = [];

describe('what the plan feed has to deliver', () => {
  it('carries no installed resource before an anchor exists', () => {
    const plan = planRead({ seq: 3 });
    const { delivery, applied } = nextDelivery(
      snapshotOf({ tree: installedAt(plan, 1), staleResources: ['steps'] }),
      NOTHING_APPLIED,
    );

    expect(delivery.tree).toBeNull();
    expect(delivery.staleResources).toEqual(['steps']);
    expect(applied).toEqual(NOTHING_APPLIED);
  });

  it('carries each generation exactly once', () => {
    const plan = planRead({ seq: 3 });
    const snapshot = snapshotOf({
      baseline: ANCHORED,
      tree: installedAt(plan, 1),
      steps: installedAt(STEPS, 1),
      directory: installedAt(VOCABULARY, 1),
      markers: installedAt(MARKERS, 1),
    });

    const first = nextDelivery(snapshot, NOTHING_APPLIED);
    expect(first.delivery.tree).toEqual({ value: plan, generation: 1 });
    expect(first.delivery.steps).toBe(STEPS);
    expect(first.delivery.directory).toBe(VOCABULARY);
    expect(first.delivery.markers).toBe(MARKERS);

    const second = nextDelivery(snapshot, first.applied);
    expect(second.delivery.tree).toBeNull();
    expect(second.delivery.steps).toBeNull();
    expect(second.delivery.directory).toBeNull();
    expect(second.delivery.markers).toBeNull();
    expect(second.applied).toEqual(first.applied);
  });

  it('carries a held read that landed after a newer neighbour installed', () => {
    const plan = planRead({ seq: 3 });
    const { delivery, applied } = nextDelivery(
      snapshotOf({
        baseline: ANCHORED,
        tree: installedAt(plan, 2),
        directory: installedAt(VOCABULARY, 1),
      }),
      { tree: 2, steps: 0, directory: 0, markers: 0 },
    );

    expect(delivery.tree).toBeNull();
    expect(delivery.directory).toBe(VOCABULARY);
    expect(applied).toEqual({ tree: 2, steps: 0, directory: 1, markers: 0 });
  });

  it('says which resources are stale and carries the failed tree read’s cause', () => {
    const cause = new Error('forbidden');
    const { delivery } = nextDelivery(
      snapshotOf({
        baseline: ANCHORED,
        staleResources: ['tree', 'markers'],
        tree: { desired: 2, reading: false, installed: null, failure: { generation: 2, cause } },
      }),
      NOTHING_APPLIED,
    );

    expect(delivery.staleResources).toEqual(['tree', 'markers']);
    expect(delivery.treeFailure).toEqual({ cause });
  });
});

/** A refresh owner that records what it was asked and publishes when told to. */
function fakeOwner(): {
  owner: PlanRefresh;
  asked: string[];
  invalidations: { resources: readonly RefreshResource[]; seq?: number }[];
  listeners: (() => void)[];
  show: (next: PlanRefreshSnapshot) => void;
  firstRead: (outcome: RefreshOutcome) => void;
} {
  const asked: string[] = [];
  const invalidations: { resources: readonly RefreshResource[]; seq?: number }[] = [];
  const listeners: (() => void)[] = [];
  let snapshot = snapshotOf();
  let settleFirstRead: (outcome: RefreshOutcome) => void = () => undefined;
  const owner: PlanRefresh = {
    initialize: () => {
      asked.push('initialize');
      return new Promise((resolve) => {
        settleFirstRead = resolve;
      });
    },
    invalidate: (invalidation) => {
      asked.push('invalidate');
      invalidations.push(invalidation);
      return Promise.resolve({ status: 'installed' });
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        asked.push('stop');
      };
    },
    dispose: () => {
      asked.push('dispose');
    },
  };
  return {
    owner,
    asked,
    invalidations,
    listeners,
    show: (next) => {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
    firstRead: (outcome) => {
      settleFirstRead(outcome);
    },
  };
}

/** The ports over one fake owner, recording everything the reading asked for. */
function portsOver(
  owner: PlanRefresh,
  over: Partial<PlanReadingPorts> = {},
): {
  ports: PlanReadingPorts;
  deliveries: PlanFeedDelivery[];
  reported: unknown[];
  connections: boolean[];
  opened: { baseline: number; handlers: PlanFeedStreamHandlers }[];
  acknowledged: number[];
  unsubscribed: number;
} {
  const deliveries: PlanFeedDelivery[] = [];
  const reported: unknown[] = [];
  const connections: boolean[] = [];
  const opened: { baseline: number; handlers: PlanFeedStreamHandlers }[] = [];
  const acknowledged: number[] = [];
  const record = { unsubscribed: 0 };
  const ports: PlanReadingPorts = {
    openOwner: () => owner,
    isLive: () => true,
    openStream: (handlers, baseline) => {
      opened.push({ baseline, handlers });
      return {
        seen: (seq) => acknowledged.push(seq),
        unsubscribe: () => {
          record.unsubscribed += 1;
        },
      };
    },
    deliver: (delivery) => deliveries.push(delivery),
    reportFailures: (failures) => {
      for (const failure of failures) reported.push(failure.cause);
    },
    reportConnection: (connected) => connections.push(connected),
    ...over,
  };
  return {
    ports,
    deliveries,
    reported,
    connections,
    opened,
    acknowledged,
    get unsubscribed() {
      return record.unsubscribed;
    },
  };
}

/**
 * The handlers the anchor's stream was opened with, or a loud failure.
 *
 * `at(0)` and not `[0]`, because this repository does not enable
 * `noUncheckedIndexedAccess`: an index read is typed as present, so the guard
 * below would be an unnecessary condition and lint refuses it.
 */
function handlersOf(opened: { handlers: PlanFeedStreamHandlers }[]): PlanFeedStreamHandlers {
  const first = opened.at(0);
  if (first === undefined) throw new Error('the anchor opened no stream');
  return first.handlers;
}

const ANCHORED_SNAPSHOT = snapshotOf({ baseline: ANCHORED, acknowledged: 7 });

describe('one project’s reading', () => {
  it('reads the plan as soon as it is built', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);

    createPlanReading(recorded.ports);

    expect(fake.asked).toEqual(['initialize']);
    expect(fake.listeners).toHaveLength(1);
  });

  it('delivers nothing while it is not live', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner, { isLive: () => false });

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);

    expect(recorded.deliveries).toEqual([]);
    expect(recorded.opened).toEqual([]);
  });

  it('opens one stream when the anchor lands, and no more', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);
    fake.show(snapshotOf({ baseline: { seq: 9, epoch: 2 }, acknowledged: 9 }));

    expect(recorded.opened).toHaveLength(1);
    expect(recorded.opened.at(0)?.baseline).toBe(7);
  });

  it('opens nothing for a reader with no stream of its own', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner, { openStream: null });

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);

    expect(recorded.deliveries).toHaveLength(1);
    expect(recorded.opened).toEqual([]);
  });

  it('acknowledges a sequence only once it has moved forward', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);
    fake.show(snapshotOf({ baseline: ANCHORED, acknowledged: 7 }));
    fake.show(snapshotOf({ baseline: ANCHORED, acknowledged: 11 }));

    expect(recorded.acknowledged).toEqual([11]);
  });

  it('asks for a fresh anchor for an unsequenced change and for the named resources otherwise', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);
    const handlers = handlersOf(recorded.opened);
    handlers.onChange();
    handlers.onChange('tree_replaced', 8);

    expect(fake.asked).toEqual(['initialize', 'initialize', 'invalidate']);
    expect(fake.invalidations).toEqual([{ resources: ['tree'], seq: 8 }]);
  });

  it('ignores a change and a connection that arrive after it stops being live', () => {
    const fake = fakeOwner();
    let live = true;
    const recorded = portsOver(fake.owner, { isLive: () => live });

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);
    const handlers = handlersOf(recorded.opened);
    live = false;
    handlers.onChange('tree_replaced', 8);
    handlers.onConnectionChange(false);

    expect(fake.invalidations).toEqual([]);
    expect(recorded.connections).toEqual([]);
  });

  it('reports the connection while it is live', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);

    createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);
    handlersOf(recorded.opened).onConnectionChange(false);

    expect(recorded.connections).toEqual([false]);
  });

  it('reports every refusal of the first read', async () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);
    const cause = new Error('forbidden');

    createPlanReading(recorded.ports);
    fake.firstRead({ status: 'failed', failures: [{ resource: 'tree', cause }] });
    await Promise.resolve();

    expect(recorded.reported).toEqual([cause]);
  });

  it('reports no refusal of a first read that answers after it stops being live', async () => {
    const fake = fakeOwner();
    let live = true;
    const recorded = portsOver(fake.owner, { isLive: () => live });

    createPlanReading(recorded.ports);
    live = false;
    fake.firstRead({
      status: 'failed',
      failures: [{ resource: 'tree', cause: new Error('forbidden') }],
    });
    await Promise.resolve();

    expect(recorded.reported).toEqual([]);
  });

  it('rereads by invalidating, and resynchronizes when nothing is anchored and something is stale', async () => {
    const fake = fakeOwner();
    const reading = createPlanReading(portsOver(fake.owner).ports);

    fake.show(ANCHORED_SNAPSHOT);
    await reading.rereadResources(['markers']);
    expect(fake.invalidations).toEqual([{ resources: ['markers'] }]);

    fake.show(snapshotOf({ staleResources: ['tree'] }));
    void reading.rereadResources(['markers']);
    expect(fake.asked.filter((call) => call === 'initialize')).toHaveLength(2);
    expect(fake.invalidations).toHaveLength(1);
  });

  it('exposes the store contract over its own owner', () => {
    const fake = fakeOwner();
    const reading = createPlanReading(portsOver(fake.owner).ports);
    const seen: number[] = [];

    const stop = reading.subscribe(() => seen.push(reading.snapshot().acknowledged));
    const first = reading.snapshot();
    expect(reading.snapshot()).toBe(first);
    fake.show(ANCHORED_SNAPSHOT);
    expect(reading.snapshot()).not.toBe(first);
    expect(seen).toEqual([7]);
    stop();
  });

  it('closes by stopping, disposing and dropping the stream', () => {
    const fake = fakeOwner();
    const recorded = portsOver(fake.owner);
    const reading = createPlanReading(recorded.ports);
    fake.show(ANCHORED_SNAPSHOT);

    reading.close();

    expect(fake.asked).toEqual(['initialize', 'stop', 'dispose']);
    expect(recorded.unsubscribed).toBe(1);
  });
});
