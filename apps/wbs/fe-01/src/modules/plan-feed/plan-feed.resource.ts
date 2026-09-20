import { type PlanRefreshSnapshot, resourcesFor } from '@/lib/plan-refresh';
import type { ProjectStream } from '@/lib/project-stream';

import type {
  AppliedGenerations,
  PlanFeedDelivery,
  PlanReading,
  PlanReadingPorts,
} from './contract';

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

/**
 * Opens one project's reading and starts it at once.
 *
 * Reading begins inside this call, exactly where the effect it replaces began
 * it. So the caller stores what it gets back **after** the call returns, and the
 * first publication happens while nobody can look it up yet. That is safe and
 * measured: a publication reaches state setters and nothing that reads the feed
 * back, the refusals of the first read arrive in a later microtask, and the
 * whole plan table's suites are unchanged by the move.
 */
export function createPlanReading({
  openOwner,
  openStream,
  isLive,
  deliver,
  reportFailures,
  reportConnection,
}: PlanReadingPorts): PlanReading {
  // Proof: reusing the disposed owner left zero subscriptions instead of one
  // in `creates a live second owner after StrictMode cleans up its first setup`.
  const owner = openOwner();
  let applied: AppliedGenerations = { tree: 0, steps: 0, directory: 0, markers: 0 };
  let stream: ProjectStream | null = null;
  let streamSequence = -1;
  const apply = (): void => {
    if (!isLive()) return;
    const snapshot = owner.getSnapshot();
    const next = nextDelivery(snapshot, applied);
    applied = next.applied;
    deliver(next.delivery);
    if (openStream !== null && snapshot.baseline !== null && stream === null) {
      // The existing socket is already registered during recovery. Reopening
      // here would turn every refused resume into another read/socket cycle.
      // Proof: restoring epoch replacement opened two sockets instead of one
      // in both `recovers a persistent %s ...` production-page cases.
      streamSequence = snapshot.baseline.seq;
      stream = openStream(
        {
          onChange: (changed, seq) => {
            if (!isLive()) return;
            if (changed == null && seq === undefined) void owner.initialize();
            else void owner.invalidate({ resources: resourcesFor(changed), seq });
          },
          onConnectionChange: (connected) => {
            if (isLive()) reportConnection(connected);
          },
        },
        snapshot.baseline.seq,
      );
    }
    if (snapshot.acknowledged > streamSequence) {
      stream?.seen(snapshot.acknowledged);
      streamSequence = snapshot.acknowledged;
    }
  };
  const stop = owner.subscribe(apply);
  void owner.initialize().then((outcome) => {
    if (!isLive() || outcome.status !== 'failed') return;
    reportFailures(outcome.failures);
  });
  return {
    owner,
    // Rule F2, and the owner is the store: it rebuilds its snapshot object only
    // when something in it changed, which is the stability half of the contract.
    subscribe: (onChange) => owner.subscribe(onChange),
    snapshot: () => owner.getSnapshot(),
    rereadResources: async (resources) => {
      if (owner.getSnapshot().baseline === null && owner.getSnapshot().staleResources.length > 0)
        await owner.initialize();
      else await owner.invalidate({ resources });
    },
    close: () => {
      stop();
      owner.dispose();
      stream?.unsubscribe();
    },
  };
}
