import { createHash } from 'node:crypto';

import type { ParticipantHttpObservation } from './dependency-participant-health';

const DOCUMENT_SHA256 = '09ab3b528f1a147d34addea248fa08925801d66ee9f384bb634112b9abc30e2f';
const ENTRY_SHA256 = 'e990c7ae6b545d4177b27560878bd41d34843b32109a21af190794d73e45ee08';

function inspectEnvelope(observation: ParticipantHttpObservation, contentType: RegExp): void {
  // Proof: separate status and MIME omissions admitted exact-body unsupported envelopes; their owning negatives failed, then passed after restoration.
  if (observation.status !== 200 || !contentType.test(observation.contentType))
    throw new Error('source frontend HTTP envelope unsupported');
}
const digest = (body: string) => createHash('sha256').update(body).digest('hex');

/**
 * Recognizes only the complete reviewed Vite document transported text, including its client
 * insertion and theme bootstrap. The HTTP reader's fatal UTF-8 text boundary can remove a BOM;
 * this digest identifies its UTF-8 encoding, not universal raw wire bytes. Requires 200
 * text/html (optional parameters); unsupported status, MIME or complete text throws. No normalization or
 * browser execution occurs. This evidence alone grants no readiness or source-profile authority.
 */
export function inspectSourceFrontendDocument(observation: ParticipantHttpObservation): {
  readonly sha256: string;
} {
  inspectEnvelope(observation, /^text\/html(?:\s*;|$)/i);
  const sha256 = digest(observation.body);
  // Proof: omitting complete text equality admitted an injected-script actual HTTP response; the document refusal failed, then passed after restoration.
  if (sha256 !== DOCUMENT_SHA256) throw new Error('source frontend document unsupported');
  return { sha256 };
}

/**
 * Recognizes the complete reviewed entry transported text, including executable code and the
 * entire trailing inline map. Correct sourcesContent alone cannot authenticate executable text.
 * Requires 200 text/javascript (optional parameters); unsupported status, MIME or complete
 * text throws. No JavaScript is evaluated; this evidence does not establish browser bootstrap or readiness.
 */
export function inspectSourceFrontendEntry(observation: ParticipantHttpObservation): {
  readonly sha256: string;
} {
  inspectEnvelope(observation, /^text\/javascript(?:\s*;|$)/i);
  const sha256 = digest(observation.body);
  // Proof: omitting complete text equality independently admitted changed executable and changed-map HTTP responses; both refusals failed, then passed after restoration.
  if (sha256 !== ENTRY_SHA256) throw new Error('source frontend entry unsupported');
  return { sha256 };
}
