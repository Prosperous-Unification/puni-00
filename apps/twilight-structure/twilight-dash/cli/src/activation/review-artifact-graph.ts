import { parseOrThrow } from '@shared/validation';
import {
  type ArtifactDecoderFiles,
  type ArtifactGraphLimits,
  buildArtifactGraph,
  type BuiltArtifactGraph,
  ClassificationPolicy,
  classifyEntries,
  hashCanonical,
  verifyArtifactGraph,
} from '@twilight-burokrat/judge';

import { readRetainedGraphProvenance, type RetainedCandidate } from './review-selection-objects';

export interface RetainedArtifactGraphInput {
  candidate: RetainedCandidate;
  snapshotIdentity: string;
  classificationPolicy: ClassificationPolicy;
  ruleBytes: Uint8Array;
  decoderFiles: ArtifactDecoderFiles;
  limits: ArtifactGraphLimits;
}

function openGraphSource(input: RetainedArtifactGraphInput) {
  const { candidate, limits } = input;
  const provenance = readRetainedGraphProvenance(candidate);
  // Proof: omitting this join accepted a different manifest pin in `snapshot provenance`.
  if (provenance.snapshotIdentity !== input.snapshotIdentity)
    throw new Error('retained artifact graph snapshot identity differs');
  // Proof: omitting grammar lost each named retained refusal for invalid installed limits.
  for (const [name, ceiling] of Object.entries(limits)) {
    if (!Number.isSafeInteger(ceiling) || ceiling < 1)
      throw new Error(`retained artifact graph ${name} must be a positive safe integer`);
  }
  // Proof: omitting this ceiling lost the preclassification retained-entry refusal at maximumEntries=1.
  if (candidate.snapshot.entries.length > limits.maximumEntries)
    throw new Error('retained artifact graph entry ceiling exceeded');
  let reads = 0;
  let readBytes = 0;
  const readBlob = (blob: string, path: string): Uint8Array => {
    // Proof: omitting this ceiling lost the retained shared-read refusal at maximumReads=1.
    if (reads >= limits.maximumReads)
      throw new Error('retained artifact graph read ceiling exceeded');
    const bytes = candidate.readBlob(blob, path);
    reads += 1;
    readBytes += bytes.length;
    // Proof: omitting this ceiling lost the retained shared-byte refusal at maximumReadBytes=1.
    if (!Number.isSafeInteger(readBytes) || readBytes > limits.maximumReadBytes)
      throw new Error('retained artifact graph read byte ceiling exceeded');
    return bytes;
  };
  const policy = parseOrThrow(ClassificationPolicy, input.classificationPolicy);
  // Proof: omitting this join accepted a valid alternative policy in `classification provenance`.
  if (hashCanonical(policy) !== provenance.classificationPolicyIdentity)
    throw new Error('retained artifact graph classification identity differs');
  const entries = classifyEntries(candidate.snapshot.entries, policy, readBlob);
  return {
    ...input,
    candidate: { ...candidate.snapshot, entries, policyId: policy.policyId },
    readBlob,
  };
}

/**
 * Builds from the complete retained snapshot under installed classification and graph policy.
 * Reads never access the original checkout or Git store. Source pin reconciliation leaves
 * runtime trust explicitly unverified until the independent runtime closure is installed.
 */
export function buildRetainedArtifactGraph(input: RetainedArtifactGraphInput): BuiltArtifactGraph {
  return buildArtifactGraph(openGraphSource(input));
}

/** Reclassifies and rederives the complete retained graph independently of producer output. */
export function verifyRetainedArtifactGraph(
  input: RetainedArtifactGraphInput,
  documentBytes: Uint8Array,
): BuiltArtifactGraph {
  return verifyArtifactGraph(openGraphSource(input), documentBytes);
}
