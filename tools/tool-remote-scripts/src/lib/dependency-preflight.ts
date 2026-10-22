import { assertDigestPinnedRef } from './docker';
import { type RunDocker, runDockerBefore } from './docker-deadline';

/** Binary support attributed to the image actually invoked; it grants no store or activation admission. */
export interface DependencyCapabilityObservation {
  readonly image: string;
  readonly semantics: readonly 'cross-project-dependencies-v1'[];
}

/** Infrastructure-owned closed wire boundary; tools cannot import the product capability parser. */
function decodeCapability(output: string): readonly 'cross-project-dependencies-v1'[] {
  const capability: unknown = JSON.parse(output);
  // Proof: removing protocol/version/backend-role/key/semantic/duplicate guards separately
  // admitted the corresponding malformed subprocess payload (2026-10-22).
  if (
    typeof capability !== 'object' ||
    capability === null ||
    Array.isArray(capability) ||
    Object.keys(capability).sort().join(',') !== 'protocol,role,semantics,version' ||
    !('protocol' in capability) ||
    capability.protocol !== 'wbs-dependency-runtime' ||
    !('version' in capability) ||
    capability.version !== 1 ||
    !('role' in capability) ||
    capability.role !== 'backend' ||
    !('semantics' in capability) ||
    !Array.isArray(capability.semantics) ||
    capability.semantics.some(
      (semantic: unknown) => semantic !== 'cross-project-dependencies-v1',
    ) ||
    new Set(capability.semantics).size !== capability.semantics.length
  )
    throw new Error('invalid backend dependency capability');
  return capability.semantics.map(() => 'cross-project-dependencies-v1');
}

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
          'bun',
          image,
          'run',
          'src/dependency-capabilities-cli.ts',
        ],
        runDocker,
        deadline,
      );
      observations.push({ image, semantics: decodeCapability(output) });
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
