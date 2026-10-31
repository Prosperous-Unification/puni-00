import type { ArtifactStore } from './artifact-store';
import { decodeArtifactRef } from './record-codecs';
import type { ArtifactRef } from './records';

/** Verifies retained references using the provider's integrity checks. Does not establish authorization or factual worker quiescence. */
export async function verifyArtifacts(
  artifacts: ArtifactStore,
  references: readonly ArtifactRef[],
): Promise<void> {
  const snapshot = references.map((reference) => decodeArtifactRef(structuredClone(reference)));
  // Proof: bypassing verify delegation enforcement failed 'memory verified operations > verified completion rejects missing or inconsistent output before outcome and outbox'.
  for (const reference of snapshot) await artifacts.readArtifact(reference);
}
