import { Buffer } from 'node:buffer';

import { parseOrThrow } from '@shared/validation';
import {
  type DeclarationSource,
  extractDeclaredRelationshipsFromSource,
  type ExtractorIdentity,
  hashBytes,
  identifyDeclarationExtractor,
  type NxRelationships,
  RelationshipRequest,
  serializeCanonical,
} from '@twilight-burokrat/judge';

import { extractRetainedNxRelationships, type RetainedNxLimits } from './review-nx';
import {
  deriveHistoricalSelections,
  hashGitObject,
  type HistoricalDiscoveryLimits,
  readRetainedCurrent,
} from './review-selection-history';
import type { RetainedCandidate } from './review-selection-objects';

export interface RetainedDeclarationLimits extends HistoricalDiscoveryLimits {
  readonly maximumReads: number;
  readonly maximumReadBytes: number;
  readonly maximumOutputBytes: number;
}

/**
 * Installed inputs contain bytes and explicit pins, never repository or workspace access.
 * The caller must verify extractor bytes against its protected runtime closure; extraction
 * reconciles their exact identity and keeps the format boundary unknown until validated.
 */
export interface RetainedDeclarationInput {
  readonly candidate: RetainedCandidate;
  readonly request: RelationshipRequest;
  readonly extractorBytes: Uint8Array;
  readonly extractor: ExtractorIdentity;
  readonly gitObjectFormat: unknown;
  readonly nx: NxRelationships;
  readonly limits: RetainedDeclarationLimits;
}

/**
 * Extracts declarations solely from retained current/history bytes using the shared selector core.
 * Requires complete history even when the declaration census is empty. Throws on changed
 * extractor identity, selector/provenance incompleteness or installed read/output ceilings.
 * {@link RetainedCandidate} revalidates retained Git object proofs before granting this capability.
 */
export function extractRetainedDeclarations(
  input: RetainedDeclarationInput,
): ReturnType<typeof extractDeclaredRelationshipsFromSource> {
  const { candidate, limits } = input;
  const request = parseOrThrow(RelationshipRequest, input.request);
  // Proof: each NaN and zero limit lost its named boundary under its independent validation omission.
  for (const [name, value] of Object.entries({
    maximumReads: limits.maximumReads,
    maximumReadBytes: limits.maximumReadBytes,
    maximumOutputBytes: limits.maximumOutputBytes,
  })) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`retained declarations ${name} must be a positive safe integer`);
  }
  // Proof: the invalid-format production test lost its named boundary under format omission.
  const format = input.gitObjectFormat;
  if (format !== 'sha1' && format !== 'sha256')
    throw new Error('retained declarations Git object format unsupported');
  const width = format === 'sha1' ? 40 : 64;
  const selection = candidate.snapshot.selection;
  const revision = selection.kind === 'committed' ? selection.revision : selection.base;
  // Proof: a SHA-256 capture under a SHA-1 pin lost its metadata-format refusal under omission.
  if (revision.length !== width) throw new Error('retained declarations Git object format differs');
  const extractorBytes = Uint8Array.from(input.extractorBytes);
  // Proof: independently changing bytes, extractor ID, version or blob lost its identity refusal.
  if (
    serializeCanonical(identifyDeclarationExtractor(extractorBytes)) !==
    serializeCanonical(input.extractor)
  )
    throw new Error('retained declaration extractor identity differs');
  // Proof: the legacy-null-history test lost its complete-history refusal when this guard was omitted.
  if (candidate.history === null) throw new Error('retained declarations require complete history');
  let readCount = 0;
  let readBytes = 0;
  const chargeRead = (read: () => Uint8Array): Uint8Array => {
    // Proof: maximumReads=1 returned extracted declarations with this ceiling omitted.
    if (readCount >= limits.maximumReads)
      throw new Error('retained declaration read count exceeded');
    const bytes = read();
    const nextBytes = readBytes + bytes.length;
    // Proof: maximumReadBytes=1 returned extracted declarations with this ceiling omitted.
    if (nextBytes > limits.maximumReadBytes)
      throw new Error('retained declaration read byte ceiling exceeded');
    readCount += 1;
    readBytes = nextBytes;
    return bytes;
  };
  const bounded: RetainedCandidate = {
    ...candidate,
    readBlob: (blob, path) => chargeRead(() => candidate.readBlob(blob, path)),
    readHistorical: (revision, path) => chargeRead(() => candidate.readHistorical(revision, path)),
  };
  const selections = deriveHistoricalSelections(bounded, request, limits);
  const history = candidate.history;
  // Proof: independent census, provenance, digest, proof-count and proof revision/path faults lost their refusal.
  if (
    serializeCanonical(selections) !== serializeCanonical(history.selections) ||
    hashBytes(serializeCanonical(selections)) !== history.historicalSelectionsIdentity ||
    history.proofs.length !== selections.length ||
    history.proofs.some(
      (proof, index) =>
        proof.revision !== selections.at(index)?.revision ||
        proof.path !== selections.at(index)?.path,
    )
  )
    throw new Error('retained declaration history census differs');
  const source: DeclarationSource = {
    currentBytes: (factId, path) => {
      const entry = candidate.snapshot.entries.find((selected) => selected.path === path);
      // Proof: omitting original-path membership admitted alias/.env.example through
      // a selected directory symlink in both Git-format production parity tests; separately
      // omitting Gitlink mode lost its named original-fact membership refusal.
      if (entry === undefined || entry.mode === '160000')
        throw new Error(`fact ${factId} authority outside selected candidate: ${path}`);
      return readRetainedCurrent(bounded, path);
    },
    historicalBytes: (_factId, revision, path) => bounded.readHistorical(revision, path),
    // Git symlink IDs identify link text; current selectors identify the resolved selected bytes.
    // Proof: substituting the selected symlink Git ID failed both SHA-1/SHA-256 source-removal parity tests.
    blobIdentity: (_fact, bytes) => hashGitObject('blob', bytes, format),
    readDeclarations: (paths) =>
      paths.map((path) => ({ path, bytes: readRetainedCurrent(bounded, path) })),
    extractorSource: () => chargeRead(() => extractorBytes),
  };
  const extracted = extractDeclaredRelationshipsFromSource(
    source,
    candidate.snapshot,
    request,
    input.nx,
  );
  // Proof: maximumOutputBytes=1 returned the full canonical declaration output under omission.
  if (Buffer.byteLength(serializeCanonical(extracted)) > limits.maximumOutputBytes)
    throw new Error('retained declaration output byte ceiling exceeded');
  return extracted;
}

/** Installed composition derives Nx target authority before evaluating retained declaration facts. */
export function extractRetainedNxDeclarations(
  input: Omit<RetainedDeclarationInput, 'nx'> & { readonly nxLimits: RetainedNxLimits },
): ReturnType<typeof extractDeclaredRelationshipsFromSource> {
  const nx = extractRetainedNxRelationships(input.candidate, input.nxLimits).relationships;
  return extractRetainedDeclarations({ ...input, nx });
}
