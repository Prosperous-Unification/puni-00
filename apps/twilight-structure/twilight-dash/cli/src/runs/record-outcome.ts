import type { ArtifactStore } from './artifact-store';
import { decodeAttemptGuard, decodeCompletion } from './record-codecs';
import type { Attempt, Completion } from './records';
import type { AttemptGuard, RunStore, StoreReply } from './run-store';
import { verifyArtifacts } from './verify-artifacts';

/** Snapshots the request before asynchronous verification, then atomically commits exactly that verified completion. Executor/coordinator observations remain trusted facts. */
export async function recordOutcome(
  runs: RunStore,
  artifacts: ArtifactStore,
  guard: AttemptGuard,
  completion: Completion,
): Promise<StoreReply<Attempt>> {
  // Proof: bypassing snapshot outcome guard enforcement failed 'memory verified operations > verified outcome commits the snapshot verified before asynchronous reads'.
  const snapshotGuard = decodeAttemptGuard(structuredClone(guard));
  // Proof: bypassing snapshot outcome enforcement failed 'memory verified operations > verified outcome commits the snapshot verified before asynchronous reads'.
  const snapshot = decodeCompletion(structuredClone(completion));
  // Proof: bypassing verify outcome enforcement failed 'memory verified operations > verified completion rejects missing or inconsistent output before outcome and outbox'.
  await verifyArtifacts(artifacts, [
    ...snapshot.outcome.artifacts,
    ...snapshot.intent.outcome.artifacts,
    snapshot.quiescence.evidence,
  ]);
  return await runs.commitOutcome(snapshotGuard, snapshot);
}
