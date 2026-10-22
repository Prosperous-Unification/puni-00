import { lookupRuntimeReceipt, matchesRuntimeReceipt, validateSchema } from '@wbs/contracts';

import { verifyArtifactContent } from './artifact-integrity';
import type { ArtifactStore } from './artifact-store';
import { decodeArtifactRef } from './record-codecs';
import type { ArtifactRef } from './records';
import type { RunStore, StoreReply } from './run-store';
import {
  decodeRuntimeGuard,
  decodeRuntimeIntent,
  decodeRuntimeScope,
  digestRuntimeRequest,
  readRuntimeRequest,
} from './runtime-codecs';
import type {
  RuntimeAcceptance,
  RuntimeGuard,
  RuntimeIntent,
  RuntimeScope,
  RuntimeScopeSnapshot,
} from './runtime-records';

/** Reads exact retained bytes and complete asynchronous public schema before correspondence. Extra receipt fields follow the public response schema's forward-readable policy. Content matching establishes no transport authenticity or current receiver authority. */
async function verifyRuntimeReceipt(
  artifacts: ArtifactStore,
  intent: RuntimeIntent,
  evidence: ArtifactRef,
): Promise<void> {
  // Proof: F25 ignored receipt media type; 'verified receipt rejects strict UTF8' failed and exact restoration passed.
  if (evidence.mediaType !== 'application/json')
    throw new Error('runtime receipt requires application/json');
  // Proof: F54 injected an unreadable artifact dependency on valid retained evidence; 'verified receipt retains actual matching artifact' failed and exact restoration passed.
  const content = await artifacts.readArtifact(evidence);
  // Proof: F27 omitted independent artifact byte verification; 'verified receipt rejects absent' failed and exact restoration passed.
  verifyArtifactContent(content, evidence);
  // Proof: F26 decoded invalid embedded UTF8 permissively; 'verified receipt refuses invalid UTF8 inside' failed and exact restoration passed.
  const wire: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
  // Proof: F28 used wire content without the asynchronous public schema; 'verified receipt rejects otherwise valid version' failed and exact restoration passed.
  const checked = await validateSchema(lookupRuntimeReceipt.responses[0].schema, wire);
  if (checked.issues !== undefined) throw new Error('runtime receipt schema differs');
  const { scope, operation } = readRuntimeRequest(intent.canonicalRequest);
  const digest = digestRuntimeRequest(intent.canonicalRequest);
  if (
    digest !== intent.requestDigest ||
    operation.commandId !== intent.commandId ||
    // Proof: F29 omitted public receipt correspondence; 'verified receipt rejects otherwise valid scope' failed and exact restoration passed.
    !matchesRuntimeReceipt(scope, operation, digest, checked.value)
  )
    throw new Error('runtime receipt correspondence differs');
}

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
