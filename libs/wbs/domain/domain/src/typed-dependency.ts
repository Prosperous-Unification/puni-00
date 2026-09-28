/**
 * The relationship types a typed dependency may carry.
 *
 * Readers understand all three lower-bound relationships. Writes remain FS
 * until the commands change opens that gate. A stored type outside this list
 * is a row this release did not write, and a read that meets one must refuse it through
 * {@link isRelationshipType} rather than schedule it as FS.
 */
export const RELATIONSHIP_TYPES = ['FS', 'SS', 'FF'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** Relationship types the current command and import write paths may persist. */
export const WRITABLE_RELATIONSHIP_TYPES = ['FS'] as const;

/** Whether a new relationship may be written by this release. */
export function isWritableRelationshipType(value: unknown): value is 'FS' {
  return (
    typeof value === 'string' && (WRITABLE_RELATIONSHIP_TYPES as readonly string[]).includes(value)
  );
}

/** Whether `value` is a relationship type this release schedules. */
export function isRelationshipType(value: unknown): value is RelationshipType {
  return typeof value === 'string' && (RELATIONSHIP_TYPES as readonly string[]).includes(value);
}

/** What one end of a typed dependency addresses. See `CONTEXT.md`, Dependency endpoint. */
export const DEPENDENCY_ENDPOINT_SCOPES = ['whole', 'node', 'descendant-step'] as const;
export type DependencyEndpointScope = (typeof DEPENDENCY_ENDPOINT_SCOPES)[number];

/** Whether `value` is one of the three endpoint scopes. */
export function isDependencyEndpointScope(value: unknown): value is DependencyEndpointScope {
  return (
    typeof value === 'string' && (DEPENDENCY_ENDPOINT_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * One end of a typed dependency.
 *
 * - `whole`: a work item. A leaf predecessor is left at its last step node and a
 *   leaf successor entered at its first; a parent means every descendant leaf.
 * - `node`: one leaf's step node, held as the pair the store keys it by. The
 *   wire spells it as a step node ID (`formatStepNodeId`).
 * - `descendant-step`: one project step in every leaf beneath a parent.
 *
 * Whether the work item is a leaf or a parent is the tree's answer, not this
 * value's; {@link findTypedEndpointDefect} asks it at the write boundary.
 */
export type DependencyEndpoint =
  | { readonly scope: 'whole'; readonly workItemId: string }
  | { readonly scope: 'node'; readonly workItemId: string; readonly stepId: string }
  | { readonly scope: 'descendant-step'; readonly workItemId: string; readonly stepId: string };

/** A typed dependency: a stable identity, two endpoints and a relationship type. */
export interface TypedDependency {
  readonly id: string;
  readonly predecessor: DependencyEndpoint;
  readonly successor: DependencyEndpoint;
  readonly type: RelationshipType;
}

/** Why an endpoint cannot be written against a project's tree and steps. */
export type TypedEndpointDefect =
  'not_found' | 'unknown_step' | 'node_on_parent' | 'descendant_step_on_leaf';

/**
 * The tree and step facts an endpoint is checked against: whether a work item
 * of this project exists and is a leaf, and whether a step belongs to it.
 */
export interface EndpointContext {
  /** `undefined` for a work item outside this project. */
  readonly isLeaf: (workItemId: string) => boolean | undefined;
  readonly hasStep: (stepId: string) => boolean;
}

/**
 * Why `endpoint` cannot be stored in this project, or `null` when it can.
 *
 * Leafhood and project-step membership need the tree, so a caller writing a
 * typed dependency asks this at its validated write boundary before
 * persisting. A stepless project has no step to name, so every step-scoped
 * endpoint in it is `unknown_step` and only `whole` remains.
 *
 * Proof: the `not_found` line deleted made `refuses an unknown work item and a
 * step outside the project` fail on `Expected: "not_found", Received: null`,
 * and the `unknown_step` line deleted failed it on `Expected: "unknown_step",
 * Received: null`; watched 2026-09-27.
 *
 * Proof: the `node_on_parent` line deleted made `refuses a node on a parent and
 * a descendant-step on a leaf` fail on `Expected: "node_on_parent", Received:
 * null`, and the `descendant_step_on_leaf` line deleted failed it on the
 * second assertion; watched 2026-09-27.
 */
export function findTypedEndpointDefect(
  endpoint: DependencyEndpoint,
  context: EndpointContext,
): TypedEndpointDefect | null {
  const isLeaf = context.isLeaf(endpoint.workItemId);
  if (isLeaf === undefined) return 'not_found';
  if (endpoint.scope === 'whole') return null;
  if (!context.hasStep(endpoint.stepId)) return 'unknown_step';
  if (endpoint.scope === 'node' && !isLeaf) return 'node_on_parent';
  if (endpoint.scope === 'descendant-step' && isLeaf) return 'descendant_step_on_leaf';
  return null;
}

/**
 * The spelling two relationships are duplicates under: both endpoints, scope
 * included, and the type. A `whole` and a `node` endpoint on one work item are
 * different endpoints, which is why the scope is part of the key rather than
 * inferred from a nullable step column.
 */
export function formatTypedDependencyKey(
  dependency: Pick<TypedDependency, 'predecessor' | 'successor' | 'type'>,
): string {
  const endpointKey = (endpoint: DependencyEndpoint): string[] =>
    endpoint.scope === 'whole'
      ? [endpoint.scope, endpoint.workItemId]
      : [endpoint.scope, endpoint.workItemId, endpoint.stepId];
  // Proof (2026-09-28): restoring delimiter concatenation made the import source
  // contract's "delimiter spelling" test refuse its second distinct link as duplicate.
  return JSON.stringify([
    endpointKey(dependency.predecessor),
    endpointKey(dependency.successor),
    dependency.type,
  ]);
}
