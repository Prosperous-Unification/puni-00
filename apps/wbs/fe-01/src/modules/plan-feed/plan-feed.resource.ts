import type { PlanRefreshSnapshot } from '@/lib/plan-refresh';

import type { AppliedGenerations, PlanFeedDelivery } from './contract';

/**
 * What of this snapshot the reader has not been given, and what it has been
 * given once this delivery is applied.
 *
 * Pure, and exported for its own suite: it is the whole of the generation
 * ledger, the four comparisons are the feed's most important decision, and no
 * suite that drives a page can separate them from the setters they feed.
 */
export function nextDelivery(
  snapshot: PlanRefreshSnapshot,
  applied: AppliedGenerations,
): { delivery: PlanFeedDelivery; applied: AppliedGenerations } {
  const staleResources = snapshot.staleResources;
  const treeFailure =
    snapshot.tree.failure === null ? null : { cause: snapshot.tree.failure.cause };
  // Publish the first table with its column vocabulary. The tree anchor
  // alone would expose editors which the initial steps read then remounts.
  // Proof: removing this gate exposed a textarea instead of null in
  // `does not expose a first editor before its held column vocabulary installs`.
  if (snapshot.baseline === null) {
    return {
      delivery: {
        staleResources,
        treeFailure,
        directory: null,
        tree: null,
        steps: null,
        markers: null,
      },
      applied,
    };
  }
  const directory =
    snapshot.directory.installed !== null &&
    snapshot.directory.installed.generation > applied.directory
      ? snapshot.directory.installed
      : null;
  const tree =
    snapshot.tree.installed !== null && snapshot.tree.installed.generation > applied.tree
      ? snapshot.tree.installed
      : null;
  const steps =
    snapshot.steps.installed !== null && snapshot.steps.installed.generation > applied.steps
      ? snapshot.steps.installed
      : null;
  const markers =
    snapshot.markers.installed !== null && snapshot.markers.installed.generation > applied.markers
      ? snapshot.markers.installed
      : null;
  return {
    delivery: {
      staleResources,
      treeFailure,
      directory: directory === null ? null : directory.value,
      tree: tree === null ? null : { value: tree.value, generation: tree.generation },
      steps: steps === null ? null : steps.value,
      markers: markers === null ? null : markers.value,
    },
    applied: {
      tree: tree?.generation ?? applied.tree,
      steps: steps?.generation ?? applied.steps,
      directory: directory?.generation ?? applied.directory,
      markers: markers?.generation ?? applied.markers,
    },
  };
}
