import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { IMAGE_NAME, type Tier as ComposeTier } from '@tools/deploy-contract';
import {
  admitExportScratch,
  checkExportScratch,
  connectRegistryAuthority,
  inspectOciArchive,
  type ManagedRegistry,
  publishArtifacts,
  type RegistryArtifact,
  type RegistryEndpoint,
  uploadArtifact,
} from '@tools/registry-publication';

// Re-exported because this module's own callers take `Tier` from it. The image
// names came from a second copy here until 2026-09-02, and they are the pair
// that had to agree: `swap.js` refuses a ref that does not name the tier it was
// asked to swap, so a drift would have passed the build and failed the deploy
// on the server, mid-swap.
export type Tier = ComposeTier | 'mcp';

// Proof: routing mcp to wbs-gw-01 made "names the MCP release image by its own tier" fail
// on 2026-09-27; restoring this mapping passed.
const RELEASE_IMAGE_NAME: Record<Tier, string> = { ...IMAGE_NAME, mcp: 'wbs-mcp-01' };

const DIGEST_RE = /@(sha256:[0-9a-f]{64})\b/;

export interface ReleaseEntry {
  sha: string;
  digest: string;
  /** The tagged ref this was pushed to. Traceability only; nothing pulls it. */
  ref: string;
  /**
   * The digest-pinned ref the deploy pulls, registry address included.
   *
   * This is the single source of truth for the publish address, and it exists
   * because there previously wasn't one. `tool-dagger` and the server-side
   * `swap.js` each carried their own `REGISTRY` default and each rebuilt the
   * ref from it, while `tool-deploy` — the only thing that talks to both —
   * passed the bare digest across and no address at all. The two defaults were
   * free to disagree, and did: every live swap so far only worked because it
   * was hand-invoked with `REGISTRY=127.0.0.1:5000` on the server, so the
   * committed orchestrator would have rendered the public hostname and 401'd
   * at `docker compose up --pull always`. Recording the whole ref here, and
   * carrying it verbatim through `release.json` -> `tool-deploy` -> `swap.js`,
   * removes the second copy of the address rather than trying to keep two in
   * sync.
   */
  image: string;
}

export type ReleaseRecord = Partial<Record<Tier, ReleaseEntry>>;

export function imageRef(registry: string, tier: Tier, sha: string): string {
  if (sha.trim() === '') {
    throw new Error('refusing to build an image ref with an empty sha');
  }
  return `${registry}/${RELEASE_IMAGE_NAME[tier]}:${sha}`;
}

/**
 * The ref a deploy pulls: pinned by digest, never by tag (design decision 4 —
 * a rebuild on a different build host can move a tag but cannot move a
 * digest).
 */
export function digestRef(registry: string, tier: Tier, digest: string): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`not a well-formed sha256 digest: ${digest}`);
  }
  return `${registry}/${RELEASE_IMAGE_NAME[tier]}@${digest}`;
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

/** A managed receipt accompanies the legacy tier record without changing release.json consumers. */
export interface PublishedRelease {
  record: ReleaseRecord;
  publication?: Awaited<ReturnType<typeof publishArtifacts>>;
}

/**
 * Export every requested tier onto the independently enforced builder filesystem before admission.
 * The endpoint must exactly match the validated enrollment before any scratch or publication effect.
 * Enrollment supplies the required repository set; a subset cannot acknowledge a whole release.
 * The callback is the real Dagger export boundary; the shared writer uploads only frozen OCI bytes.
 */
export async function publishManagedRelease(
  enrollment: ManagedRegistry,
  endpoint: RegistryEndpoint,
  tiers: readonly Tier[],
  sha: string,
  exportTier: (tier: Tier, path: string) => Promise<unknown>,
): Promise<PublishedRelease> {
  // Proof: removing this bind reaches scratch admission on foreign, alternate-scheme and alternate-path targets in publish-endpoint.fixture.ts; the matching control still publishes through the owned HTTP fixture.
  if (endpoint.url !== enrollment.registryUrl)
    throw new Error('Managed publication endpoint differs from enrolled registry');
  const registry = new URL(endpoint.url).host;
  const repositories = tiers.map((tier) => RELEASE_IMAGE_NAME[tier]);
  if (
    new Set(repositories).size !== repositories.length ||
    repositories.length !== enrollment.requiredRepositories.length ||
    enrollment.requiredRepositories.some((repository) => !repositories.includes(repository))
  )
    throw new Error('Selected tiers do not contain all required product repositories');
  // Proof: removing scratch admission reached the real managed export callback with no enforced receipt.
  const scratch = await admitExportScratch(enrollment);
  const directory = await mkdtemp(join(enrollment.builder.path, 'publication-'));
  try {
    const artifacts: RegistryArtifact[] = [];
    for (const tier of tiers) {
      const path = join(directory, `${tier}.tar`);
      await exportTier(tier, path);
      await checkExportScratch(enrollment, scratch);
      artifacts.push(await inspectOciArchive(path, RELEASE_IMAGE_NAME[tier], sha));
    }
    const publication = await publishArtifacts(
      enrollment,
      artifacts,
      connectRegistryAuthority(enrollment),
      async (artifact, ownership) => {
        // Proof: dropping ownership makes the real HTTP caller fixture reject its first body (409, no durable write intent).
        await uploadArtifact(endpoint, artifact, ownership);
      },
    );
    const record: ReleaseRecord = {};
    for (const tier of tiers) {
      const artifact = artifacts.find(
        (candidate) => candidate.repository === RELEASE_IMAGE_NAME[tier],
      );
      if (artifact === undefined) throw new Error('Completed publication omitted a required tier');
      record[tier] = {
        sha,
        digest: artifact.digest,
        ref: imageRef(registry, tier, sha),
        image: digestRef(registry, tier, artifact.digest),
      };
    }
    return { record, publication };
  } finally {
    await rm(directory, { recursive: true });
  }
}
