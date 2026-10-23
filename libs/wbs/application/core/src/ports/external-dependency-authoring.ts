/** Explicit service capability; only lower-level semantic fixtures may admit it before activation. */
export interface ExternalDependencyAuthoring {
  readonly state: 'inactive' | 'active';
}

/**
 * An explicit fixture capability or a reader borrowing one admitted writer lifetime.
 * Composition validates reader wiring without executing it; operations resolve it
 * inside the writer transaction. A public catalog cannot supply writer authority.
 */
export type ExternalDependencyAuthoringSource =
  ExternalDependencyAuthoring | (() => ExternalDependencyAuthoring);

/** Validates explicit authority eagerly while leaving borrowed readers unopened. */
export function validateExternalDependencyAuthoring(
  authoring: ExternalDependencyAuthoringSource,
): void {
  if (typeof authoring !== 'function') permitsExternalDependencies(authoring);
}

/** Production remains dormant until connected live reads and durable fan-out are activated. */
// Proof: dormant-authoring bypass failed `mounted external authoring stays dormant`'s selected assertion
// (actual SQLite boundary; watched 2026-10-22).
export const INACTIVE_EXTERNAL_DEPENDENCIES: ExternalDependencyAuthoring = { state: 'inactive' };

/** A JavaScript callable remains untrusted until its returned capability is validated. */
function isAuthoringReader(authoring: unknown): authoring is () => unknown {
  return typeof authoring === 'function';
}

/** Unknown trusted capability state is a wiring fault, never an activation default. */
export function permitsExternalDependencies(authoring: unknown): boolean {
  // Proof: recursive resolution accepted a returned active reader and repeatedly invoked a self-returning reader in external-dependency-authoring.test.ts.
  const capability: unknown = isAuthoringReader(authoring) ? authoring() : authoring;
  if (typeof capability !== 'object' || capability === null || !('state' in capability))
    throw new Error('external dependency authoring capability is missing');
  switch (capability.state) {
    case 'inactive':
      return false;
    case 'active':
      return true;
    default:
      throw new Error('unknown external dependency authoring state');
  }
}
