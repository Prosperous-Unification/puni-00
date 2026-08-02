export type Tier = 'be' | 'gw' | 'fe';

const IMAGE_NAME: Record<Tier, string> = {
  be: 'wbs-be-01',
  gw: 'wbs-gw-01',
  fe: 'wbs-fe-01',
};

const DIGEST_RE = /@(sha256:[0-9a-f]{64})\b/;

export interface ReleaseEntry {
  sha: string;
  digest: string;
  ref: string;
}

export type ReleaseRecord = Partial<Record<Tier, ReleaseEntry>>;

export function imageRef(registry: string, tier: Tier, sha: string): string {
  if (sha.trim() === '') {
    throw new Error('refusing to build an image ref with an empty sha');
  }
  return `${registry}/${IMAGE_NAME[tier]}:${sha}`;
}

/**
 * Deploys pull by digest, never by tag — a rebuild on a different build host can
 * move a tag but cannot move a digest. A publish that reports no digest is a
 * hard failure rather than a silent downgrade to tag-based deploys.
 */
export function parseDigest(publishOutput: string): string {
  const m = DIGEST_RE.exec(publishOutput);
  if (!m?.[1]) {
    throw new Error(`no digest found in publish output: ${publishOutput}`);
  }
  return m[1];
}

export function renderRelease(rec: ReleaseRecord): string {
  return JSON.stringify(rec, null, 2) + '\n';
}
