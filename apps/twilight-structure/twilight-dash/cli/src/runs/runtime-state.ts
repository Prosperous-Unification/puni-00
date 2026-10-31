import { readRuntimeState, type RuntimeState, validateSchema } from '@wbs/contracts';

import { verifyArtifactContent } from './artifact-integrity';
import type { ArtifactStore } from './artifact-store';
import type { ArtifactRef } from './records';

/** Snapshots an already validated reference before IO and reads full retained state. Dependency failures propagate unchanged; retained content establishes no freshness, authenticity or execution permission. */
export async function readRuntimeStateArtifact(
  artifacts: ArtifactStore,
  evidence: ArtifactRef,
): Promise<RuntimeState> {
  // Proof: P1 removed only this clone; 'retained state reader snapshots its reference before IO'
  // emitted its named doesNotReject assertion with artifact integrity mismatch. Exact restoration passed.
  const reference = structuredClone(evidence);
  // Inherited from record-preparation.ts readTargetObservation. Proof: Task2 F26 removed/broke this dependency; 'preparation requires JSON media type' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (reference.mediaType !== 'application/json')
    throw new Error('runtime state requires application/json');
  const content = new Uint8Array(await artifacts.readArtifact(reference));
  // Inherited from record-preparation.ts readTargetObservation. Proof: Task2 F27 removed/broke this dependency; 'preparation validates target and canonical bytes independently' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  verifyArtifactContent(content, reference);
  // Inherited from record-preparation.ts readTargetObservation. Proof: Task2 F28 removed/broke this dependency; 'preparation embedded invalid UTF8 remains parseable' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  const wire: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
  // Inherited from record-preparation.ts readTargetObservation. Proof: Task2 F29 removed/broke this dependency; 'preparation refuses actual state schema' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  const checked = await validateSchema(readRuntimeState.responses[0].schema, wire);
  if (checked.issues !== undefined) throw new Error('runtime state schema differs');
  return checked.value;
}
