import type { DirectoryRead, RefreshResource } from '@/lib/plan-refresh';
import type { CalendarMarkerView, PlanRead, StepView } from '@/lib/wbs-api';
import { createChannel } from '@/modules/channel';
import type { Store } from '@/modules/store';

import type { PlanFeedDelivery } from './contract';

/**
 * The plan as this reader has been given it: every publication of the feed,
 * folded into one value the screen selects from.
 *
 * The feed publishes **deltas** ({@link PlanFeedDelivery}: null means
 * "unchanged"); this is their sum, which is what a screen draws. The tree, the
 * directory and the markers are the newest ones delivered, or none before the
 * first; the steps are the newest list, kept as the **same array** when a later
 * one says the same thing, so that nothing drawn from them rebuilds; the stale
 * list and the tree failure are the last publication's, because they describe
 * the owner now and not a history.
 *
 * `connected` is whether the socket carrying other people's changes is up, as
 * the feed last reported it. It starts `true`: before any socket has said
 * otherwise there is nothing to warn about, and a table read without a socket
 * never warns.
 */
export interface DeliveredPlan {
  readonly staleResources: readonly RefreshResource[];
  /** The cause of the last tree read's failure, or null; words are built where they are said. */
  readonly treeFailure: { readonly cause: unknown } | null;
  readonly directory: DirectoryRead | null;
  readonly tree: { readonly value: PlanRead; readonly generation: number } | null;
  /**
   * This store's own copy, never the delivered array, so nothing outside it can
   * change what it compares against; typed mutable only because the table's
   * consumers take `StepView[]`, and nothing writes into it.
   */
  readonly steps: StepView[];
  readonly markers: readonly CalendarMarkerView[];
  readonly connected: boolean;
}

/**
 * One reader's delivered plan: the store a screen selects from, and the two
 * writes the plan feed makes into it.
 *
 * **The stability rule of {@link Store}, member by member.** A write that
 * changes no member leaves the snapshot the same object and tells nobody; a
 * write that changes one replaces the snapshot once and tells every listener
 * once, after the replacement. "Changes" is decided per member: by identity for
 * the tree, the directory and the markers (each delivery of them is a new
 * generation); by content for the steps (id and name, in order) and for the
 * stale list; by the identity of the **cause** for the tree failure, because
 * the feed builds a fresh wrapper around the same cause on every publication;
 * by value for `connected`.
 *
 * Plain TypeScript with no lifetime of its own (rule F1): nothing closes it and
 * no call on it ever throws a lifecycle refusal. Whether a publication may still
 * reach it is the feed's question, answered before it writes — see
 * `plan-feed.feature.ts`'s `isLive`. Its owner today is the table's mount; the
 * project runtime of OpenSpec task 10 takes it over.
 */
export interface DeliveredPlanStore extends Store<DeliveredPlan> {
  /** Folds one publication in. */
  readonly deliver: (delivery: PlanFeedDelivery) => void;
  /** Records whether the socket carrying other people's changes is up. */
  readonly reportConnection: (connected: boolean) => void;
}

/** The half of {@link DeliveredPlanStore} the plan feed writes through. */
export type DeliveredPlanWrites = Pick<DeliveredPlanStore, 'deliver' | 'reportConnection'>;

/** Nothing delivered yet: a fresh value for each store, so no two stores share an array. */
function nothingDelivered(): DeliveredPlan {
  return {
    staleResources: [],
    treeFailure: null,
    directory: null,
    tree: null,
    steps: [],
    markers: [],
    connected: true,
  };
}

/** Whether two step lists say the same thing, so an equal one can be discarded. */
export function sameSteps(a: readonly StepView[], b: readonly StepView[]): boolean {
  return (
    a.length === b.length && a.every((step, i) => step.id === b[i]?.id && step.name === b[i]?.name)
  );
}

function sameResources(a: readonly RefreshResource[], b: readonly RefreshResource[]): boolean {
  return a.length === b.length && a.every((resource, i) => resource === b[i]);
}

/** Builds one reader's delivered plan, with nothing delivered yet. */
export function createDeliveredPlan(): DeliveredPlanStore {
  const changes = createChannel<undefined>();
  let current = nothingDelivered();
  const replace = (next: DeliveredPlan): void => {
    // Proof: on 2026-09-24, publishing before this assignment failed `folds every publication
    // exactly as the model does, and changes only when it must` after 1 run on `listener 0:
    // markers: expected [] to be []`: the listener read the previous snapshot.
    current = next;
    changes.publish(undefined);
  };
  return {
    subscribe: (onChange) => changes.subscribe(onChange),
    snapshot: () => current,
    deliver: (delivery) => {
      const staleResources = sameResources(current.staleResources, delivery.staleResources)
        ? current.staleResources
        : [...delivery.staleResources];
      const treeFailure =
        delivery.treeFailure === null
          ? null
          : // Proof: on 2026-09-24, comparing the failure's wrapper instead of its cause here
            // failed `folds every publication exactly as the model does, and changes only when it
            // must` after 5 runs on `redeliver: a new snapshot exactly when something changed:
            // expected true to be false`.
            current.treeFailure !== null && current.treeFailure.cause === delivery.treeFailure.cause
            ? current.treeFailure
            : { cause: delivery.treeFailure.cause };
      const directory = delivery.directory ?? current.directory;
      // Proof: on 2026-09-24, taking `delivery.tree` without `?? current.tree` failed `folds every
      // publication exactly as the model does, and changes only when it must` after 1 run on
      // `deliverNow: a new snapshot exactly when something changed: expected true to be false`.
      const tree = delivery.tree ?? current.tree;
      const steps =
        // Proof: on 2026-09-24, dropping the `sameSteps` conjunct here failed `folds every
        // publication exactly as the model does, and changes only when it must` after 1 run on
        // `redeliver: a new snapshot exactly when something changed: expected true to be false`.
        delivery.steps === null || sameSteps(current.steps, delivery.steps)
          ? current.steps
          : // Proof: on 2026-09-24, keeping the delivered array here instead of a copy failed
            // `folds every publication exactly as the model does, and changes only when it must`
            // after 1 run on `deliverLater #0: steps are not the store’s own: expected true to be
            // false`.
            [...delivery.steps];
      const markers = delivery.markers ?? current.markers;
      if (
        staleResources === current.staleResources &&
        treeFailure === current.treeFailure &&
        directory === current.directory &&
        tree === current.tree &&
        steps === current.steps &&
        markers === current.markers
      )
        return;
      replace({ ...current, staleResources, treeFailure, directory, tree, steps, markers });
    },
    reportConnection: (connected) => {
      if (connected === current.connected) return;
      replace({ ...current, connected });
    },
  };
}
