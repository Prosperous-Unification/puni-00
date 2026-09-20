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
  // Proof: replacing this expression with `snapshot.staleResources.slice(0,
  // 0)` hid the stale-tree banner in `raises the stale-tree banner when a
  // socket refetch fails`, and emptied both ledger stale lists (2026-09-20).
  const staleResources = snapshot.staleResources;
  // Proof: replacing this expression with null left the production failure
  // message generic in `keeps the installed plan and names an unavailable peer
  // refetch`, and the ledger received null instead of the cause (2026-09-20).
  const treeFailure =
    snapshot.tree.failure === null ? null : { cause: snapshot.tree.failure.cause };
  // Publish the first table with its column vocabulary. The tree anchor
  // alone would expose editors which the initial steps read then remounts.
  // Proof: deleting this early return exposed a textarea instead of null in
  // `does not expose a first editor before its held column vocabulary
  // installs`, and delivered a tree before an anchor in the ledger suite
  // (2026-09-20).
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
  // Proof: dropping the directory generation comparison redelivered the
  // vocabulary instead of null in `carries each generation exactly once`
  // (2026-09-20).
  const directory =
    snapshot.directory.installed !== null &&
    snapshot.directory.installed.generation > applied.directory
      ? snapshot.directory.installed
      : null;
  // Proof: dropping `&& snapshot.tree.installed.generation > applied.tree`
  // delivered an already-applied tree in `carries each generation exactly
  // once` and in the held-neighbour case (2026-09-20).
  const tree =
    snapshot.tree.installed !== null && snapshot.tree.installed.generation > applied.tree
      ? snapshot.tree.installed
      : null;
  // Proof: dropping the steps generation comparison redelivered the Build
  // step instead of null in `carries each generation exactly once`
  // (2026-09-20).
  const steps =
    snapshot.steps.installed !== null && snapshot.steps.installed.generation > applied.steps
      ? snapshot.steps.installed
      : null;
  // Proof: dropping the markers generation comparison redelivered the empty
  // marker list instead of null in `carries each generation exactly once`
  // (2026-09-20).
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
  // Proof: reusing `feedRef.current` and not clearing it in the hook's cleanup
  // left zero subscriptions instead of one in `creates a live second owner
  // after StrictMode cleans up its first setup` (2026-09-20).
  const owner = openOwner();
  let applied: AppliedGenerations = { tree: 0, steps: 0, directory: 0, markers: 0 };
  let stream: ProjectStream | null = null;
  let streamSequence = -1;
  const apply = (): void => {
    // Proof: deleting this guard delivered a snapshot in `delivers nothing
    // while it is not live`; both feature lifetime cases failed too
    // (2026-09-20).
    if (!isLive()) return;
    const snapshot = owner.getSnapshot();
    const next = nextDelivery(snapshot, applied);
    applied = next.applied;
    deliver(next.delivery);
    if (openStream !== null && snapshot.baseline !== null && stream === null) {
      // The existing socket is already registered during recovery. Reopening
      // here would turn every refused resume into another read/socket cycle.
      // Proof: dropping `&& stream === null` opened eight sockets instead of
      // one in `recovers a persistent resume_denied without replacing the
      // registered socket`, and two instead of one in the reading suite
      // (2026-09-20).
      streamSequence = snapshot.baseline.seq;
      stream = openStream(
        {
          onChange: (changed, seq) => {
            // Proof: deleting this guard invalidated tree at sequence 8 in
            // `ignores a change and a connection that arrive after it stops
            // being live` instead of ignoring the frame (2026-09-20).
            if (!isLive()) return;
            if (changed == null && seq === undefined) void owner.initialize();
            else void owner.invalidate({ resources: resourcesFor(changed), seq });
          },
          onConnectionChange: (connected) => {
            // Proof: calling `reportConnection(connected)` unguarded reported
            // [false] instead of [] in `ignores a change and a connection that
            // arrive after it stops being live` (2026-09-20).
            if (isLive()) reportConnection(connected);
          },
        },
        snapshot.baseline.seq,
      );
    }
    // Proof: deleting this block left the production stream at -1 instead of
    // 0 in `refetches when the subscription reports a change`, and left the
    // reading suite's acknowledged sequence empty instead of [11]. Changing
    // `>` to `>=` made that suite see [7, 7, 11] instead of [11]
    // (2026-09-20).
    if (snapshot.acknowledged > streamSequence) {
      stream?.seen(snapshot.acknowledged);
      streamSequence = snapshot.acknowledged;
    }
  };
  const stop = owner.subscribe(apply);
  void owner.initialize().then((outcome) => {
    // Proof: removing `!isLive()` from this guard reported Error: forbidden in
    // `reports no refusal of a first read that answers after it stops being
    // live`; the feature's closed-reader refusal case failed too (2026-09-20).
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
      // Proof: reducing this branch to `await owner.invalidate({ resources })`
      // left only one initialize call instead of two in `rereads by
      // invalidating, and resynchronizes when nothing is anchored and
      // something is stale` (2026-09-20).
      if (owner.getSnapshot().baseline === null && owner.getSnapshot().staleResources.length > 0)
        await owner.initialize();
      else await owner.invalidate({ resources });
    },
    close: () => {
      // Proof: deleting `stop()` omitted "stop" from the close call sequence
      // in `closes by stopping, disposing and dropping the stream`; the
      // feature close case failed on the same sequence (2026-09-20).
      stop();
      // Proof: deleting `owner.dispose()` omitted "dispose" from the close
      // call sequence in `closes by stopping, disposing and dropping the
      // stream`; the feature close case failed on the same sequence
      // (2026-09-20).
      owner.dispose();
      // Proof: deleting `stream?.unsubscribe()` left the production stream
      // subscribed in `refetches when the subscription reports a change`, and
      // left the reading suite's unsubscribe count at zero (2026-09-20).
      stream?.unsubscribe();
    },
  };
}
