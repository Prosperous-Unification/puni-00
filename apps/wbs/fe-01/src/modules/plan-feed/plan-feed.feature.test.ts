import { describe, expect, it } from 'vitest';

import type { PlanRefresh, RefreshOutcome } from '@/lib/plan-refresh';

import type {
  PlanFeedDelivery,
  PlanFeedHost,
  PlanFeedRefusal,
  PlanRefreshSnapshot,
} from './contract';
import { createPlanFeed } from './plan-feed.feature';

/** A snapshot with nothing read, and an anchored one to publish. */
const NOTHING_READ = { desired: 0, reading: false, installed: null, failure: null };
const EMPTY: PlanRefreshSnapshot = {
  tree: NOTHING_READ,
  steps: NOTHING_READ,
  directory: NOTHING_READ,
  markers: NOTHING_READ,
  staleResources: [],
  baseline: null,
  acknowledged: -1,
};
const ANCHORED: PlanRefreshSnapshot = { ...EMPTY, baseline: { seq: 7, epoch: 1 }, acknowledged: 7 };

/** An owner the feature drives through the reading it builds. */
function fakeOwner(): {
  owner: PlanRefresh;
  asked: string[];
  show: (next: PlanRefreshSnapshot) => void;
  firstRead: (outcome: RefreshOutcome) => void;
} {
  const asked: string[] = [];
  const listeners: (() => void)[] = [];
  let snapshot = EMPTY;
  let settleFirstRead: (outcome: RefreshOutcome) => void = () => undefined;
  return {
    owner: {
      initialize: () => {
        asked.push('initialize');
        return new Promise((resolve) => {
          settleFirstRead = resolve;
        });
      },
      invalidate: (invalidation) => {
        asked.push(`invalidate:${invalidation.resources.join(',')}`);
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
    },
    asked,
    show: (next) => {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
    firstRead: (outcome) => {
      settleFirstRead(outcome);
    },
  };
}

/** A host that records what reached the screen. */
function hostOver(
  owner: PlanRefresh,
  over: Partial<PlanFeedHost> = {},
): {
  host: PlanFeedHost;
  deliveries: PlanFeedDelivery[];
  refusals: PlanFeedRefusal[];
  connections: boolean[];
} {
  const deliveries: PlanFeedDelivery[] = [];
  const refusals: PlanFeedRefusal[] = [];
  const connections: boolean[] = [];
  return {
    deliveries,
    refusals,
    connections,
    host: {
      openOwner: () => owner,
      openStream: null,
      isActiveReader: () => true,
      publish: (delivery) => deliveries.push(delivery),
      announceRefusal: (refusal) => refusals.push(refusal),
      setConnected: (connected) => connections.push(connected),
      ...over,
    },
  };
}

describe('the plan feed', () => {
  it('hands the reader every publication while it owns the screen', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);

    createPlanFeed(recorded.host);
    fake.show(ANCHORED);

    expect(recorded.deliveries).toHaveLength(1);
  });

  it('hands nothing to a reader that has moved on', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner, { isActiveReader: () => false });

    createPlanFeed(recorded.host);
    fake.show(ANCHORED);

    expect(recorded.deliveries).toEqual([]);
  });

  it('hands nothing on once it is closed, though the owner still publishes', () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);
    const feed = createPlanFeed(recorded.host);

    feed.close();
    fake.show(ANCHORED);

    expect(recorded.deliveries).toEqual([]);
    expect(fake.asked).toEqual(['initialize', 'stop', 'dispose']);
  });

  it('announces the cause of every refusal of the first read', async () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);
    const cause = new Error('forbidden');

    createPlanFeed(recorded.host);
    fake.firstRead({ status: 'failed', failures: [{ resource: 'tree', cause }] });
    await Promise.resolve();

    expect(recorded.refusals).toEqual([{ cause }]);
  });

  it('announces no refusal of a first read that answers after the reader closed it', async () => {
    const fake = fakeOwner();
    const recorded = hostOver(fake.owner);
    const feed = createPlanFeed(recorded.host);

    feed.close();
    fake.firstRead({
      status: 'failed',
      failures: [{ resource: 'tree', cause: new Error('forbidden') }],
    });
    await Promise.resolve();

    expect(recorded.refusals).toEqual([]);
  });

  it('hands its reader the owner, the store and the reread it is built over', async () => {
    const fake = fakeOwner();
    const feed = createPlanFeed(hostOver(fake.owner).host);

    expect(feed.owner).toBe(fake.owner);
    expect(feed.snapshot()).toBe(EMPTY);
    const seen: number[] = [];
    const stop = feed.subscribe(() => seen.push(feed.snapshot().acknowledged));
    fake.show(ANCHORED);
    expect(seen).toEqual([7]);
    stop();
    await feed.rereadResources(['markers']);
    expect(fake.asked).toContain('invalidate:markers');
  });
});
