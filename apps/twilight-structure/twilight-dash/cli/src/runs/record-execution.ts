import type { ArtifactStore } from './artifact-store';
import { decodeAttemptGuard, decodeExecutionCommand } from './record-codecs';
import type { ArtifactRef, Attempt, ExecutionCommand } from './records';
import type { AttemptGuard, RunStore, StoreReply } from './run-store';
import { verifyArtifacts } from './verify-artifacts';

/** Verifies all evidence in the snapshotted fact before changing revisions or held capacity; retained bytes alone do not prove the executor stopped. */
export async function recordExecution(
  runs: RunStore,
  artifacts: ArtifactStore,
  guard: AttemptGuard,
  command: ExecutionCommand,
): Promise<StoreReply<Attempt>> {
  // Proof: bypassing snapshot execution guard enforcement failed 'memory verified operations > verified execution commits the snapshot verified before asynchronous reads'.
  const snapshotGuard = decodeAttemptGuard(structuredClone(guard));
  // Proof: bypassing snapshot execution enforcement failed 'memory verified operations > verified execution commits the snapshot verified before asynchronous reads'.
  const snapshot = decodeExecutionCommand(structuredClone(command));
  const fact = snapshot.fact;
  const references: readonly ArtifactRef[] =
    fact.kind === 'waiting'
      ? [fact.wait.prompt, fact.quiescence.evidence]
      : fact.kind === 'interrupted'
        ? [fact.quiescence.evidence]
        : fact.kind === 'unresolved'
          ? [fact.evidence]
          : [];
  // Proof: bypassing verify execution enforcement failed 'memory verified operations > verified interrupted rejects missing evidence before changing revision or capacity'.
  await verifyArtifacts(artifacts, references);
  return await runs.recordExecution(snapshotGuard, snapshot);
}
