import {
  lookupRuntimeReceipt,
  matchesRuntimeReceipt,
  type RuntimeReceipt,
  validateSchema,
} from '@wbs/contracts';

import { verifyArtifactContent } from './artifact-integrity';
import type { ArtifactStore } from './artifact-store';
import type { ArtifactRef } from './records';
import { digestRuntimeRequest, readRuntimeRequest } from './runtime-codecs';
import type { RuntimeIntent } from './runtime-records';
/** Reads exact retained bytes and complete asynchronous public schema before correspondence. Extra receipt fields follow the public response schema's forward-readable policy. Content matching establishes no transport authenticity or current receiver authority. */
export async function verifyRuntimeReceipt(
  artifacts: ArtifactStore,
  intent: RuntimeIntent,
  evidence: ArtifactRef,
): Promise<RuntimeReceipt> {
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
  return checked.value;
}
