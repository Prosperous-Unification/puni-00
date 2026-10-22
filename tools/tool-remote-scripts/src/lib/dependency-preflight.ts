import {
  buildDependencyCapabilityCommand,
  decodeDependencyCapabilities,
  type DependencyCapabilityObservation,
} from './dependency-capability';
import { assertDigestPinnedRef } from './docker';
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
  // Proof: bypassing candidate pin validation failed the mutable-reference refusal (2026-10-22).
  assertDigestPinnedRef(candidate, 'be');
  if (rollback !== null) assertDigestPinnedRef(rollback, 'be');
  const observations: DependencyCapabilityObservation[] = [];
  // Proof: omitting either probe or substituting candidate for rollback failed independent
  // image traces/asymmetric malformed-response tests (2026-10-22).
  for (const image of rollback === null ? [candidate] : [candidate, rollback]) {
    try {
      // Proof: injecting a mount or DB_PATH failed the exact command assertion; bypassing
      // the shared deadline made the stalled subprocess resolve and failed its negative (2026-10-22).
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
      observations.push({ image, semantics: decodeDependencyCapabilities(output) });
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
