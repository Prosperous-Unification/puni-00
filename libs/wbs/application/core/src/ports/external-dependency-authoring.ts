/** Explicit service capability; only lower-level semantic fixtures may admit it before activation. */
export interface ExternalDependencyAuthoring {
  readonly state: 'inactive' | 'active';
}

/** Production remains dormant until connected live reads and durable fan-out are activated. */
// Proof: dormant-authoring bypass failed `mounted external authoring stays dormant`'s selected assertion
// (actual SQLite boundary; watched 2026-10-22).
export const INACTIVE_EXTERNAL_DEPENDENCIES: ExternalDependencyAuthoring = { state: 'inactive' };

/** Unknown trusted capability state is a wiring fault, never an activation default. */
export function permitsExternalDependencies(authoring: unknown): boolean {
  if (typeof authoring !== 'object' || authoring === null || !('state' in authoring))
    throw new Error('external dependency authoring capability is missing');
  switch (authoring.state) {
    case 'inactive':
      return false;
    case 'active':
      return true;
    default:
      throw new Error('unknown external dependency authoring state');
  }
}
