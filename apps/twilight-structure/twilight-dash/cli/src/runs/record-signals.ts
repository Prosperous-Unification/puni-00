import type { ArtifactStore } from './artifact-store';
import {
  decodeAttemptGuard,
  decodeDecision,
  decodeOwnership,
  decodeReceipt,
} from './record-codecs';
import type { Attempt, CommandReceipt, Decision, Ownership } from './records';
import type { AttemptGuard, RunStore, StoreReply } from './run-store';
import { verifyArtifacts } from './verify-artifacts';

/** Snapshots authorization evidence and owner before asynchronous byte verification. Authentication remains the inbox caller's responsibility. */
export async function receiveDecision(
  runs: RunStore,
  artifacts: ArtifactStore,
  ownership: Ownership,
  decision: Decision,
): Promise<StoreReply<Decision>> {
  // Proof: injecting verified decision owner bypass failed `memory verified signals > verified decision snapshots authority target and payload before awaiting artifact reads` at its explicit assertion.
  const snapshotOwner = decodeOwnership(structuredClone(ownership));
  // Proof: injecting verified decision payload bypass failed `memory verified signals > verified decision snapshots authority target and payload before awaiting artifact reads` at its explicit assertion.
  const snapshot = decodeDecision(structuredClone(decision));
  // Proof: injecting verified decision evidence bypass failed `memory verified signals > verified decision rejects absent evidence before any mutation` at its explicit assertion.
  await verifyArtifacts(artifacts, [snapshot.authorizationEvidence]);
  return await runs.receiveDecision(snapshotOwner, snapshot);
}
/** Verifies immutable receipt evidence bytes for a snapshot of the complete request. This does not establish authenticated remote command acceptance. */
export async function reconcileReceipt(
  runs: RunStore,
  artifacts: ArtifactStore,
  guard: AttemptGuard,
  receipt: CommandReceipt,
): Promise<StoreReply<Attempt>> {
  // Proof: injecting verified receipt guard bypass failed `memory verified signals > verified receipt snapshots authority target and payload before awaiting artifact reads` at its explicit assertion.
  const snapshotGuard = decodeAttemptGuard(structuredClone(guard));
  // Proof: injecting verified receipt payload bypass failed `memory verified signals > verified receipt snapshots authority target and payload before awaiting artifact reads` at its explicit assertion.
  const snapshot = decodeReceipt(structuredClone(receipt));
  // Proof: injecting verified receipt evidence bypass failed `memory verified signals > verified receipt rejects absent evidence before any mutation` at its explicit assertion.
  await verifyArtifacts(artifacts, [snapshot.evidence]);
  return await runs.reconcileReceipt(snapshotGuard, snapshot);
}
