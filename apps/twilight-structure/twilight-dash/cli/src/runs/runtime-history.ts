import type { ArtifactStore } from './artifact-store';
import { decodeArtifactRef } from './record-codecs';
import type { ArtifactRef } from './records';
import type { RunStore, StoreReply } from './run-store';
import { decodeRuntimeGuard, decodeRuntimeIntent, decodeRuntimeScope } from './runtime-codecs';
import { verifyRuntimeReceipt } from './runtime-receipt';
import type {
  RuntimeAcceptance,
  RuntimeGuard,
  RuntimeIntent,
  RuntimeScope,
  RuntimeScopeSnapshot,
} from './runtime-records';

/** Snapshots all submitted identity before awaits, verifies actual artifacts, then invokes trusted synchronous persistence planning outside any SQLite transaction. */
export async function acceptRuntimeReceipt(
  runs: Pick<RunStore, 'recordRuntimeAcceptance'>,
  artifacts: ArtifactStore,
  guard: RuntimeGuard,
  intent: RuntimeIntent,
  evidence: ArtifactRef,
): Promise<StoreReply<RuntimeAcceptance>> {
  const snapshotGuard = decodeRuntimeGuard(guard);
  const snapshotIntent = decodeRuntimeIntent(intent);
  // Proof: F42 aliased the submitted evidence reference through an artifact await; 'verified operation snapshots' failed and exact restoration passed.
  const snapshotEvidence = decodeArtifactRef(structuredClone(evidence));
  await verifyRuntimeReceipt(artifacts, snapshotIntent, snapshotEvidence);
  return await runs.recordRuntimeAcceptance(snapshotGuard, {
    intent: snapshotIntent,
    evidence: snapshotEvidence,
  });
}

/** Validates every retained historical evidence link using independent artifact bytes. Raw provider inspection alone establishes no artifact integrity or authenticity. */
export async function readRuntimeHistory(
  runs: Pick<RunStore, 'readRuntimeScope'>,
  artifacts: ArtifactStore,
  scope: RuntimeScope,
): Promise<RuntimeScopeSnapshot> {
  const snapshotScope = decodeRuntimeScope(scope);
  const snapshot = structuredClone(await runs.readRuntimeScope(snapshotScope));
  if (snapshot.kind === 'pinned')
    for (const acceptance of snapshot.acceptances) {
      const intent = snapshot.intents.find(
        (candidate) => candidate.commandId === acceptance.commandId,
      );
      if (intent === undefined) throw new Error('runtime acceptance intent missing');
      if (intent.requestDigest !== acceptance.requestDigest)
        throw new Error('runtime acceptance digest differs');
      // Proof: F30 omitted historical artifact reads; 'verified history checks an older artifact' failed and exact restoration passed.
      await verifyRuntimeReceipt(
        artifacts,
        intent,
        decodeArtifactRef(structuredClone(acceptance.evidence)),
      );
    }
  return snapshot;
}
