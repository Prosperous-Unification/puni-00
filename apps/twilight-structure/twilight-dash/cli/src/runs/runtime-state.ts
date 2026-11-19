import {
  readRuntimeStateView,
  type RetainedRuntimeState,
  retainedRuntimeStateSchema,
  validateSchema,
} from '@wbs/contracts';

import { verifyArtifactContent } from './artifact-integrity';
import type { ArtifactStore } from './artifact-store';
import type { ArtifactRef } from './records';

/** Snapshots an already validated reference before IO and reads full retained state. Dependency failures propagate unchanged; retained content establishes no freshness, authenticity or execution permission. */
export async function readRuntimeStateArtifact(
  artifacts: ArtifactStore,
  evidence: ArtifactRef,
): Promise<RetainedRuntimeState> {
  // Proof: P1 removed only this clone; 'retained state reader snapshots its reference before IO'
  // emitted its named doesNotReject assertion with artifact integrity mismatch. Exact restoration passed.
  const reference = structuredClone(evidence);
  // Inherited from record-preparation.ts readTargetObservation. Proof: Task2 F26 removed/broke this dependency; 'preparation requires JSON media type' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  // Proof: dash-state-media-type: omitting the retained-state JSON media-type check.
  // 'preparation requires JSON media type on otherwise valid retained state bytes' failed; exact restoration passed.
  if (reference.mediaType !== 'application/json')
    throw new Error('runtime state requires application/json');
  const content = new Uint8Array(await artifacts.readArtifact(reference));
  // Inherited from record-preparation.ts readTargetObservation. Proof: Task2 F27 removed/broke this dependency; 'preparation validates target and canonical bytes independently' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  // Proof: dash-state-artifact-integrity: omitting independent retained-state content verification.
  // 'preparation validates target and canonical bytes independently of artifact adapter' failed; exact restoration passed.
  verifyArtifactContent(content, reference);
  // Inherited from record-preparation.ts readTargetObservation. Proof: Task2 F28 removed/broke this dependency; 'preparation embedded invalid UTF8 remains parseable' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  // Proof: dash-state-fatal-utf8: permissively decoding invalid UTF-8 inside an otherwise schema-valid ledgerId string.
  // 'preparation embedded invalid UTF8 remains parseable JSON under a permissive decoder' failed; exact restoration passed.
  // The corrupted bytes are inside ledgerId, not an ignored extension.
  const wire: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
  // Inherited from record-preparation.ts readTargetObservation. Proof: Task2 F29 removed/broke this dependency; 'preparation refuses actual state schema' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  // Proof: dash-retained-artifact-schema-consumer: bypassing the grouped artifact schema call and issues refusal.
  // 'retained state2 validates full original ledger' failed; exact restoration passed.
  // One grouped consumer fault; malformed ledger2 resolves locally.
  const checked = await validateSchema(retainedRuntimeStateSchema, wire);
  if (checked.issues !== undefined) throw new Error('runtime state schema differs');
  return checked.value;
}

/** Reads byte-verified retained state into a separate unversioned current view; raw recovery bodies use readRuntimeStateArtifact instead. */
export async function readRuntimeStateObservation(artifacts: ArtifactStore, evidence: ArtifactRef) {
  return readRuntimeStateView(await readRuntimeStateArtifact(artifacts, evidence));
}
