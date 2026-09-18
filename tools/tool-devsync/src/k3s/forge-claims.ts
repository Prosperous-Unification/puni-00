import { createHash } from 'node:crypto';

/**
 * One worktree, one slug, enforced by two Leases in `puni-forge`: `dev-<slug>` and
 * `dev-wt-<hash of the worktree>`. Creating an object is atomic in the API server, so the
 * second of two racing `up`s finds the first's Lease instead of both passing a check and then
 * both applying. A Lease that names the same pair is this environment's own claim.
 */
export interface EnvironmentClaim {
  readonly slug: string;
  readonly worktree: string;
}

const SLUG_LABEL = 'puni.dev/dev-slug';
const LAB_LABEL = 'puni.dev/lab-id';
const WORKTREE_ANNOTATION = 'puni.dev/worktree';

export function claimLeaseNames(claim: EnvironmentClaim): readonly [string, string] {
  const hash = createHash('sha256').update(claim.worktree).digest('hex').slice(0, 16);
  return [`dev-${claim.slug}`, `dev-wt-${hash}`];
}

export function claimLease(
  name: string,
  namespace: string,
  labId: string,
  claim: EnvironmentClaim,
): Record<string, unknown> {
  return {
    apiVersion: 'coordination.k8s.io/v1',
    kind: 'Lease',
    metadata: {
      name,
      namespace,
      labels: { [SLUG_LABEL]: claim.slug, [LAB_LABEL]: labId },
      annotations: { [WORKTREE_ANNOTATION]: claim.worktree },
    },
    spec: { holderIdentity: `${claim.slug}@${claim.worktree}` },
  };
}

function at(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (Object.getOwnPropertyDescriptor(value, key)?.value as unknown)
    : undefined;
}

/** Read the pair an existing claim Lease holds. */
export function decodeClaimLease(lease: unknown): EnvironmentClaim {
  const slug = at(at(at(lease, 'metadata'), 'labels'), SLUG_LABEL);
  const worktree = at(at(at(lease, 'metadata'), 'annotations'), WORKTREE_ANNOTATION);
  if (typeof slug !== 'string' || typeof worktree !== 'string') {
    throw new Error('a dev-env claim Lease lacks its slug or worktree');
  }
  return { slug, worktree };
}

/**
 * Accept an existing claim only when it names exactly the wanted pair.
 *
 * @throws When the slug serves another worktree or the worktree is served under another slug.
 */
export function requireOwnClaim(existing: EnvironmentClaim, wanted: EnvironmentClaim): void {
  // Proof: accepting any existing Lease failed `refuses a Lease another environment holds`. Live,
  // two concurrent `up --slug race` runs for different worktrees: with the claim, one served and
  // one refused; without it both passed the Pod check and built (k3s-platform verify.md).
  if (existing.slug === wanted.slug && existing.worktree === wanted.worktree) return;
  throw new Error(
    existing.slug === wanted.slug
      ? `slug ${wanted.slug} already serves ${existing.worktree}; choose another slug or run down first`
      : `${wanted.worktree} is already served as slug ${existing.slug}; one worktree has one environment`,
  );
}
