import { Buffer } from 'node:buffer';

import { extractNxRelationshipsFromSource, serializeCanonical } from '@twilight-burokrat/judge';

import { readRetainedCurrent } from './review-selection-history';
import {
  readRetainedCandidateProvenance,
  type RetainedCandidate,
} from './review-selection-objects';

export interface RetainedNxLimits {
  readonly maximumEntries: number;
  readonly maximumReads: number;
  readonly maximumReadBytes: number;
  readonly maximumOutputBytes: number;
}

/** Derives static Nx selectors exclusively from the exact owned candidate's retained bytes. */
export function extractRetainedNxRelationships(
  candidate: RetainedCandidate,
  limits: RetainedNxLimits,
): ReturnType<typeof extractNxRelationshipsFromSource> {
  // Proof: omitting this join admitted copied false-empty census until the named ownership assertion failed.
  readRetainedCandidateProvenance(candidate);
  // Proof: pinning each limit to 1 independently lost its zero/NaN/undefined validation negative.
  for (const [name, value] of Object.entries({
    maximumEntries: limits.maximumEntries,
    maximumReads: limits.maximumReads,
    maximumReadBytes: limits.maximumReadBytes,
    maximumOutputBytes: limits.maximumOutputBytes,
  })) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`retained Nx ${name} must be a positive safe integer`);
  }
  const entries = candidate.snapshot.entries;
  // Proof: removing the entry ceiling made maximumEntries=1 return selectors.
  if (entries.length > limits.maximumEntries) throw new Error('retained Nx entry ceiling exceeded');
  const selected = entries.filter(
    (entry) =>
      entry.mode !== '120000' &&
      entry.mode !== '160000' &&
      !entry.path
        .split('/')
        .some((component) => component === '.git' || component === 'node_modules'),
  );
  const byPath = new Map(selected.map((entry) => [entry.path, entry]));
  let reads = 0;
  let readBytes = 0;
  const readBlob = (blob: string, path: string): Uint8Array => {
    // Proof: removing the count ceiling made maximumReads=1 return selectors.
    if (reads >= limits.maximumReads) throw new Error('retained Nx read count exceeded');
    // Proof: independently substituting a foreign path or zero blob broke both source-removal parity tests.
    const bytes = candidate.readBlob(blob, path);
    const nextBytes = readBytes + bytes.length;
    // Proof: removing this ceiling made maximumReadBytes=1 return selectors.
    if (!Number.isSafeInteger(nextBytes) || nextBytes > limits.maximumReadBytes)
      throw new Error('retained Nx read byte ceiling exceeded');
    reads += 1;
    readBytes = nextBytes;
    return bytes;
  };
  const bounded: RetainedCandidate = { ...candidate, readBlob };
  let selectorBytes = 0;
  const extracted = extractNxRelationshipsFromSource({
    acceptSelector: (selector) => {
      // Canonical bytes include LF; add identity/separator bytes after removing that LF.
      const nextBytes = selectorBytes + Buffer.byteLength(serializeCanonical(selector)) + 78;
      // Proof: omitting the pre-selector callback reached only final refusal in the amplification negative.
      if (!Number.isSafeInteger(nextBytes) || nextBytes > limits.maximumOutputBytes)
        throw new Error('retained Nx selector byte ceiling exceeded');
      selectorBytes = nextBytes;
    },
    projectPaths: () =>
      selected
        .filter((entry) => entry.path.split('/').at(-1) === 'project.json')
        .map((entry) => entry.path),
    read: (path) => {
      if (path === 'nx.json') {
        if (!entries.some((entry) => entry.path === path))
          throw new Error(`retained Nx configuration absent: ${path}`);
        return readRetainedCurrent(bounded, path);
      }
      const entry = byPath.get(path);
      if (entry === undefined) throw new Error(`retained Nx configuration absent: ${path}`);
      return readBlob(entry.blob, path);
    },
  });
  // Proof: removing this comparison returned an envelope one byte above its exact serialized ceiling.
  if (Buffer.byteLength(serializeCanonical(extracted)) > limits.maximumOutputBytes)
    throw new Error('retained Nx output byte ceiling exceeded');
  return extracted;
}
