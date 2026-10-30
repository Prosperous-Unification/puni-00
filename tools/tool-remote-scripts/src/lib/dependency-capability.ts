/** Runtime role observed from an immutable binary; this does not identify a deployment participant. */
export type DependencyCapabilityRole = 'backend' | 'gateway' | 'mcp';

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

/** Backend-only transport wrapper; gateway and MCP observations cannot satisfy existing backend callers. */
export function decodeDependencyCapabilities(
  output: string,
): readonly 'cross-project-dependencies-v1'[] {
  return decodeRoleDependencyCapabilities(output, 'backend');
}

/** Closed wire boundary bound to the role the coordinator intended to invoke. */
export function decodeRoleDependencyCapabilities(
  output: string,
  expectedRole: DependencyCapabilityRole,
): readonly 'cross-project-dependencies-v1'[] {
  const capability: unknown = JSON.parse(output);
  // Proof: removing protocol/version/key/semantic/duplicate guards separately admitted malformed
  // subprocess payloads (2026-10-22); removing role equality admitted all six real
  // cross-role executable negatives and both backend wrapper negatives (2026-10-23).
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
    capability.role !== expectedRole ||
    !('semantics' in capability) ||
    !Array.isArray(capability.semantics) ||
    capability.semantics.some(
      (semantic: unknown) => semantic !== 'cross-project-dependencies-v1',
    ) ||
    new Set(capability.semantics).size !== capability.semantics.length
  )
    throw new Error(`invalid ${expectedRole} dependency capability`);
  return capability.semantics.map(() => 'cross-project-dependencies-v1');
}
