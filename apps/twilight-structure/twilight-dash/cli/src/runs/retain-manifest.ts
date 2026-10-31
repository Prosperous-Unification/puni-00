import type { ArtifactStore } from './artifact-store';
import { decodeManifest, decodeOwnership } from './record-codecs';
import type { Manifest, Ownership } from './records';
import type { RunStore, StoreReply } from './run-store';
import { verifyArtifacts } from './verify-artifacts';

/** Verifies the pinned prompt and policy bytes before retaining exactly the validated manifest snapshot. */
export async function retainManifest(
  runs: RunStore,
  artifacts: ArtifactStore,
  ownership: Ownership,
  manifest: Manifest,
): Promise<StoreReply<Manifest>> {
  // Proof: bypassing snapshot manifest owner enforcement failed 'memory verified operations > verified manifest commits the snapshot verified before asynchronous reads'.
  const snapshotOwnership = decodeOwnership(structuredClone(ownership));
  // Proof: bypassing snapshot manifest enforcement failed 'memory verified operations > verified manifest commits the snapshot verified before asynchronous reads'.
  const snapshot = decodeManifest(structuredClone(manifest));
  // Proof: bypassing verify manifest enforcement failed 'memory verified operations > verified manifest rejects missing or mismatched prompts before retention'.
  await verifyArtifacts(artifacts, [...snapshot.prompts, ...snapshot.toolPolicies]);
  return await runs.retainManifest(snapshotOwnership, snapshot);
}
