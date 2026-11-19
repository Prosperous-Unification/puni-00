import type { ScopeChain } from '../access-role';

/** The leaf's stated type; conflict never chooses one of its retained identities. */
export type StepTypeState =
  | { readonly kind: 'untyped' }
  | { readonly kind: 'typed'; readonly typeId: string }
  | { readonly kind: 'conflict'; readonly typeIds: readonly string[] };

/** A decoded binding joined to identity/display fields from its captured definition. */
export interface StepBinding {
  readonly bindingId: string;
  readonly organizationId: string;
  readonly scopeKind: 'organization' | 'space' | 'project';
  readonly scopeId: string;
  readonly workItemTypeId: string | null;
  readonly position: number;
  readonly step: { readonly id: string; readonly code: string; readonly name: string };
}

export interface StepProvenance {
  readonly bindingId: string;
  readonly scopeKind: StepBinding['scopeKind'];
  readonly scopeId: string;
  readonly workItemTypeId: string | null;
}

/** Identity/display and every matching binding, detached from the supplied capture. */
export interface ResolvedStep {
  readonly stepId: string;
  readonly code: string;
  readonly name: string;
  readonly via: readonly StepProvenance[];
}

const SCOPE_RANK = { organization: 0, space: 1, project: 2 } as const;

/** Binary UTF8 ordering agrees with SQLite BINARY for the capture's decoded valid text. */
function compareText(left: string, right: string): number {
  const encoder = new TextEncoder(),
    bytes = encoder.encode(left).values();
  for (const byte of encoder.encode(right)) {
    const next = bytes.next();
    if (next.done) return -1;
    if (next.value !== byte) return next.value - byte;
  }
  return bytes.next().done ? 0 : 1;
}

function reachesChain(chain: ScopeChain, binding: StepBinding): boolean {
  if (binding.organizationId !== chain.organizationId) return false;
  switch (binding.scopeKind) {
    case 'organization':
      return binding.scopeId === chain.organizationId;
    case 'space':
      return chain.level !== 'organization' && binding.scopeId === chain.spaceId;
    case 'project':
      return (
        (chain.level === 'project' || chain.level === 'work_package') &&
        binding.scopeId === chain.projectId
      );
  }
}

/** Checks only reached relational capture invariants; scalar decoding belongs to capture. */
function selectBindings(
  chain: ScopeChain,
  bindings: readonly StepBinding[],
): readonly StepBinding[] {
  const selected: StepBinding[] = [],
    identities = new Set<string>(),
    tuples = new Set<string>();
  const definitions = new Map<string, StepBinding['step']>();
  for (const binding of bindings) {
    // Proof: S04 omitting this filter admitted foreign/sibling steps in
    // 'filters sibling scopes and foreign organizations before deriving the union';
    // owning assertion failed, then restored GREEN (2026-11-13).
    if (!reachesChain(chain, binding)) continue;
    // Proof: S01 omitting binding identity refusal made 'rejects a repeated selected
    // binding identity before it can duplicate provenance' fail; restored GREEN (2026-11-13).
    if (identities.has(binding.bindingId))
      throw new Error('duplicate step binding ' + binding.bindingId);
    identities.add(binding.bindingId);
    const tuple = JSON.stringify([
      binding.scopeKind,
      binding.scopeId,
      binding.step.id,
      binding.workItemTypeId,
    ]);
    // Proof: S02 omitting tuple refusal made the first NULL-type case of 'rejects
    // duplicate every-type and typed binding tuples' fail; restored GREEN (2026-11-13).
    if (tuples.has(tuple)) throw new Error('duplicate step binding scope');
    tuples.add(tuple);
    const definition = definitions.get(binding.step.id);
    // Proof: S03 omitting consistency refusal admitted the first name-conflicting
    // capture in 'rejects contradictory selected definition metadata instead of
    // choosing by input order'; restored GREEN (2026-11-13).
    if (
      definition !== undefined &&
      (definition.code !== binding.step.code || definition.name !== binding.step.name)
    )
      throw new Error('inconsistent step definition ' + binding.step.id);
    definitions.set(binding.step.id, binding.step);
    selected.push(binding);
  }
  return selected;
}

function compareBindings(left: StepBinding, right: StepBinding): number {
  return (
    SCOPE_RANK[left.scopeKind] - SCOPE_RANK[right.scopeKind] ||
    left.position - right.position ||
    // Proof: S07 dropping this tie broke via order in 'orders provenance ties by
    // binary UTF8 binding identity under every permutation'; restored GREEN (2026-11-13).
    compareText(left.bindingId, right.bindingId)
  );
}

/**
 * Resolves the additive step union along the actual organization/space/project chain.
 * Capture owns scalar/type/definition/scope validation, organization membership and
 * snapshot/authority; this function validates reached binding identity, tuple and
 * definition consistency before filtering by leaf type, including a conflict leaf.
 * Every-type reaches typed and untyped leaves; conflict resolves no valid binding.
 * A step's least matching (scope rank, position, bindingId) chooses its order. Steps
 * then sort by that rank/position/code/stepId; provenance keeps every matching binding.
 * No work-package scope, exclusion, live lookup or mutation of the capture occurs.
 * @throws on contradictory reached capture; unrelated foreign/sibling rows are excluded.
 */
export function resolveSteps(
  chain: ScopeChain,
  typeState: StepTypeState,
  bindings: readonly StepBinding[],
): readonly ResolvedStep[] {
  const selected = selectBindings(chain, bindings);
  // Proof: S06 removing this return gave dev/qa to 'resolves the published conflict
  // leaf without inheriting a type'; owning assertion failed, restored GREEN (2026-11-13).
  if (typeState.kind === 'conflict') return [];
  // Proof: S05 replacing this selection with all reached bindings added research to
  // 'resolves the published typed story leaf without inheriting a type'; restored GREEN (2026-11-13).
  const matching = selected.filter(
    (binding) =>
      binding.workItemTypeId === null ||
      (typeState.kind === 'typed' && binding.workItemTypeId === typeState.typeId),
  );
  return projectSelectedSteps(matching);
}

function projectSelectedSteps(matching: StepBinding[]): readonly ResolvedStep[] {
  matching.sort(compareBindings);
  const groups = new Map<
    string,
    { readonly ordering: StepBinding; readonly via: StepProvenance[] }
  >();
  for (const binding of matching) {
    const provenance: StepProvenance = {
      bindingId: binding.bindingId,
      scopeKind: binding.scopeKind,
      scopeId: binding.scopeId,
      workItemTypeId: binding.workItemTypeId,
    };
    const group = groups.get(binding.step.id);
    if (group === undefined) groups.set(binding.step.id, { ordering: binding, via: [provenance] });
    else group.via.push(provenance);
  }
  return [...groups.values()]
    .sort(
      (left, right) =>
        SCOPE_RANK[left.ordering.scopeKind] - SCOPE_RANK[right.ordering.scopeKind] ||
        left.ordering.position - right.ordering.position ||
        compareText(left.ordering.step.code, right.ordering.step.code) ||
        compareText(left.ordering.step.id, right.ordering.step.id),
    )
    .map((group) => ({
      stepId: group.ordering.step.id,
      code: group.ordering.step.code,
      name: group.ordering.step.name,
      via: group.via,
    }));
}

/** Resolves the SC21 any-type project-chain union while retaining every reached binding in SC18 order. */
export function resolvePackageSteps(
  chain: Extract<ScopeChain, { readonly level: 'project' | 'work_package' }>,
  bindings: readonly StepBinding[],
): readonly ResolvedStep[] {
  return projectSelectedSteps([...selectBindings(chain, bindings)]);
}
