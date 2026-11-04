/** Internal diagnostic vocabulary; never accepts request fields or serializes provider/error content. */
export const registryBackupStages = [
  'raw-census',
  'repository-verification',
  'reservation',
  'ciphertext-inspection',
  'lock-schema',
  'origin-exclusion',
  'exact-removal',
  'post-census',
  'final-verification',
] as const;
type RegistryBackupStage = (typeof registryBackupStages)[number];
const failures = new WeakMap<Error, RegistryBackupStage>();

/**
 * Preserve the exact failure and control flow while retaining only its innermost fixed boundary.
 * The weak association adds no serialized fields and cannot retain errors after their lifetime.
 * Proof: nested failures preserve identity/descriptors and expose only the fixed stage in diagnostics tests.
 */
export async function observeRegistryBackupStage<T>(
  stage: RegistryBackupStage,
  run: () => T | Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof Error && !failures.has(cause)) failures.set(cause, stage);
    throw cause;
  }
}

/** Fixture diagnostics may read this fixed stage; public protocol failure frames and raw errors remain unchanged. */
export function findRegistryBackupStage(failure: unknown): RegistryBackupStage | null {
  return failure instanceof Error ? (failures.get(failure) ?? null) : null;
}
