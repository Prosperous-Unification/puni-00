import {
  buildDependencyCapabilityCommand,
  decodeRoleDependencyCapabilities,
  type DependencyCapabilityObservation,
  type DependencyCapabilityRole,
} from './dependency-capability';
import { type RunDocker, runDockerBefore } from './docker-deadline';

export type { DependencyCapabilityObservation } from './dependency-capability';

/**
 * Independently invokes candidate and optional rollback CLI without a mount, DB_PATH or application boot.
 * Missing/failed/malformed CLI throws; explicit empty support is a valid observation only.
 * The pair shares a finite deadline. This neither inventories the store nor admits ENABLED authority.
 * Refusals before writer stop leave serving untouched; later refusals retain attended recovery evidence.
 * See docs/runbook-prod-deploy.md#backend-writer-barrier-recovery.
 */
export async function probeDependencyCapabilities(
  candidate: string,
  rollback: string | null,
  runDocker: RunDocker,
  deadline = performance.now() + 15000,
): Promise<readonly DependencyCapabilityObservation[]> {
  assertRoleImage(candidate, 'backend');
  if (rollback !== null) assertRoleImage(rollback, 'backend');
  const observations: DependencyCapabilityObservation[] = [];
  // Proof: omitting either probe or substituting candidate for rollback failed independent
  // image traces/asymmetric malformed-response tests (2026-10-22); deduplicating equal
  // images failed the two independently attributed observations assertion (2026-10-23).
  for (const image of rollback === null ? [candidate] : [candidate, rollback]) {
    try {
      observations.push(await observeDependencyCapabilities(image, 'backend', runDocker, deadline));
    } catch (cause) {
      // Proof: replacing refusal with empty support failed actual missing/unreadable/nonzero CLI
      // and malformed transport negatives (2026-10-22).
      throw new Error(
        `dependency capability probe failed for ${image}: ${cause instanceof Error ? cause.message : String(cause)}; candidate=${candidate}; rollback=${rollback ?? 'first-install'}; docs/runbook-prod-deploy.md#backend-writer-barrier-recovery`,
        { cause },
      );
    }
  }
  return observations;
}

/**
 * Observe one exact image's declared role without networking, mounts or configuration imports.
 * Explicit empty support is an observation only; this grants no participant exclusion or activation.
 * Throws on image/role mismatch and on absent, unreadable, malformed, failed or stalled executables.
 */
export async function observeDependencyCapabilities(
  image: string,
  role: DependencyCapabilityRole,
  runDocker: RunDocker,
  deadline = performance.now() + 15000,
): Promise<DependencyCapabilityObservation> {
  assertRoleImage(image, role);
  // Proof: adding a mount/DB_PATH changes the exact production command assertions; removing
  // the deadline lets the real stalled executable resolve instead of refusing (2026-10-23).
  try {
    const output = await runDockerBefore(
      [
        'run',
        '--rm',
        '--pull',
        'never',
        '--network',
        'none',
        '--entrypoint',
        buildDependencyCapabilityCommand()[0],
        image,
        ...buildDependencyCapabilityCommand().slice(1),
      ],
      runDocker,
      deadline,
    );
    // Proof: replacing image attribution with a foreign image failed actual per-role
    // observations and distinct/equal backend pair assertions (2026-10-23).
    return { image, semantics: decodeRoleDependencyCapabilities(output, role) };
  } catch (cause) {
    // Proof: manufacturing empty support admits missing/unreadable/malformed/nonzero
    // executables; each role's production-path negatives catch it (2026-10-23).
    throw new Error(
      `dependency capability observation failed for ${role} ${image}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

const ROLE_TIER = { backend: 'be', gateway: 'gw', mcp: 'mcp' } as const;

/** Validate before Docker; MCP observation does not add MCP to the deployable tier contract. */
function assertRoleImage(image: string, role: DependencyCapabilityRole): void {
  // Proof: removing digest or tier validation separately admitted the corresponding
  // production-path mutable/wrong-tier negatives before Docker (2026-10-23).
  const reference = /^[^/\s]+\/(?<name>[^@\s]+)@sha256:[0-9a-f]{64}$/.exec(image);
  if (!reference?.groups)
    throw new Error(`dependency capability image must be digest-pinned: ${image}`);
  const tier = ROLE_TIER[role];
  if (reference.groups['name'] !== `wbs-${tier}-01`)
    throw new Error(`dependency capability image does not match ${role} tier ${tier}: ${image}`);
}
