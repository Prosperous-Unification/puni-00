/** Binary support attributed to the image actually invoked; it grants no store or activation admission. */
export interface DependencyCapabilityObservation {
  readonly image: string;
  readonly semantics: readonly 'cross-project-dependencies-v1'[];
}

/** The backend capability executable is argument-free and never boots application storage. */
export function buildDependencyCapabilityCommand(): readonly [
  'bun',
  'run',
  'src/dependency-capabilities-cli.ts',
] {
  return ['bun', 'run', 'src/dependency-capabilities-cli.ts'];
}

/** Infrastructure-owned closed wire boundary; tools cannot import the product capability parser. */
export function decodeDependencyCapabilities(
  output: string,
): readonly 'cross-project-dependencies-v1'[] {
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
