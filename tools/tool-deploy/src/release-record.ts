import { type } from '@shared/validation';
import { IMAGE_NAME } from '@tools/deploy-contract';

import type { Tier } from './affected';
import { assertReleaseImages, type ReleaseImage } from './provenance';

// Proof: the original CLI executed unselected newline-optional-source claims;
// its production-path negative failed until this strict full-revision boundary.
const entrySchema = type({
  sha: /^[a-f0-9]{40}(?![\s\S])/,
  digest: 'string',
  ref: 'string',
  image: 'string',
  '+': 'reject',
});
const recordSchema = type({
  'be?': entrySchema,
  'gw?': entrySchema,
  'fe?': entrySchema,
  'mcp?': entrySchema,
  '+': 'reject',
});

export interface ReleaseEntry {
  sha: string;
  digest: string;
  /** Publisher's source-tagged reference, retained for claim consistency. */
  ref: string;
  /** Publisher's digest-pinned registry address, passed intact to the remote swap. */
  image: string;
}
export type ReleaseRecord = Partial<Record<Tier | 'mcp', ReleaseEntry>>;

/** Captures a publication claim without reopening the mutable release file. */
export function selectReleaseImage(role: string, entry: ReleaseEntry): ReleaseImage {
  return {
    role,
    revision: entry.sha,
    digest: entry.digest,
    reference: entry.image,
    taggedReference: entry.ref,
  };
}

/**
 * Parses the publisher's complete record at the file boundary, including optional publications.
 * Partial publication is allowed; planning requires the selected roles. Errors never echo
 * payloads or references, which can contain credentials when malformed.
 * @throws for missing/unreadable files, invalid JSON, unknown fields or inconsistent claims.
 */
export async function readReleaseRecord(path: string): Promise<ReleaseRecord> {
  // Proof: missing-release and unreadable-release exercise distinct actual filesystem faults
  // before any remote preflight/swap in provenance-cli.test.ts.
  const serialized = await Bun.file(path)
    .text()
    .catch(() => {
      throw new Error(`Cannot read release manifest at ${path}`);
    });
  let input: unknown;
  try {
    input = JSON.parse(serialized);
  } catch {
    throw new Error(`Malformed release manifest at ${path}`);
  }
  const record = recordSchema(input);
  // Proof: unknown-role, unknown-entry-key, missing-entry-field and short-release-source
  // negatives fail at this sanitized boundary in provenance-cli.test.ts.
  if (record instanceof type.errors) throw new Error(`Malformed release manifest at ${path}`);
  const repositories = { ...IMAGE_NAME, mcp: 'wbs-mcp-01' };
  for (const [role, entry] of Object.entries(record)) {
    // Proof: tag-only, shell-image, credentialed-image, inconsistent-digest and
    // bad-optional-publication refuse before rendering/executing unsafe release references.
    // Original CLI also executed all three newline-optional digest/tag/image negatives.
    assertReleaseImages(entry.sha, [selectReleaseImage(role, entry)], repositories);
  }
  return record;
}
