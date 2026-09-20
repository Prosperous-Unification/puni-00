import { describe, expect, it } from 'vitest';

import type { DirectoryRead } from '@/lib/plan-refresh';
import type { CalendarMarkerView, StepView } from '@/lib/wbs-api';
import { planRead } from '@/testing/views';

import type { AppliedGenerations, PlanRefreshSnapshot } from './contract';
import { nextDelivery } from './plan-feed.resource';

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
