import { type } from 'arktype';

import type { LeafStepOrder } from '../leaf-step-order';
import {
  assertStepBlockages,
  canonicalisePlanInput,
  type PlanInputRows,
  readStepParallels,
} from './canonical-plan-input';
import {
  compareHistoryKeys,
  detachHistory,
  type Historical,
  requireHistory,
  SavedHistoryError,
  serializeHistory,
} from './history-json';
import {
  assertSavedConnectedTargetInput,
  assertSavedMeasureFields,
  createInput12Grammar,
} from './input12';
import {
  indexCapturedLeafSteps,
  readLeafDependencyHistory,
  type SavedLeafDependencyHistory,
  serializeLeafDependencyHistory,
} from './leaf-dependency-history';

/** Original13 records complete own leaf inventories and the matching captured history grammar. */
export type CanonicalPlanInputV13 = Historical<
  Omit<ReturnType<typeof createInput13Grammar>['infer'], 'dependencyHistory'> & {
    readonly dependencyHistory: SavedLeafDependencyHistory;
  }
>;

/** Extends the closed common fields while retaining the independently selected original12 grammar. */
function createInput13Grammar() {
  return createInput12Grammar().merge({
    '+': 'reject',
    schemaVersion: '13',
    leafSteps: type({ '+': 'reject', workItemId: 'string', stepIds: 'string[]' }).array(),
  });
}
let compiledInput13: ReturnType<typeof createInput13Grammar> | undefined;

/**
 * Decodes declared input13 without consulting current bindings, directories or scheduling code.
 * Leaf inventories are mandatory, including empty lists; former parent points never become
 * current leaf facts. Older bodies retain their independent readers and original bytes.
 * @throws SavedHistoryError for malformed fields, incoherent inventories, facts or target history.
 */
export function readCurrentSavedPlanInput13(raw: unknown): CanonicalPlanInputV13 {
  const parsed = (compiledInput13 ??= createInput13Grammar())(raw);
  // Proof: bypassing this grammar lost the required-inventory shape refusal (input13-fault-strict-input-shape-v1); diagnostic proof only.
  if (parsed instanceof type.errors) throw new SavedHistoryError('shape', '$', { cause: parsed });
  assertSavedMeasureFields(parsed);
  const orders = indexCapturedLeafSteps(parsed.workItems, parsed.steps, parsed.leafSteps);
  assertLeafFacts(parsed, orders);
  try {
    assertStepBlockages(parsed);
    readStepParallels(parsed);
  } catch (cause) {
    throw new SavedHistoryError('local_facts', '$', { cause });
  }
  assertLocalRelationships(parsed, orders);
  const dependencyHistory = readLeafDependencyHistory(parsed.dependencyHistory);
  if (dependencyHistory.kind === 'connected') {
    const target = dependencyHistory.workPackages.find(
      (member) => member.workPackageId === parsed.workPackage.id,
    );
    // Proof: omission lost the modeled wrong-target refusal to a native absent-target error (input13-fault-target-identity-v2); diagnostic only.
    requireHistory(
      dependencyHistory.targetWorkPackageId === parsed.workPackage.id && target !== undefined,
      'target',
      '$.dependencyHistory.targetWorkPackageId',
    );
    assertSavedConnectedTargetInput(parsed, dependencyHistory);
    const ordered = (leaves: readonly LeafStepOrder[]) =>
      [...leaves].sort((left, right) => compareHistoryKeys(left.workItemId, right.workItemId));
    // Proof: omission admitted individually valid target captures with different own orders (input13-fault-target-orders-v1).
    requireHistory(
      serializeHistory(ordered(parsed.leafSteps)) === serializeHistory(ordered(target.leafSteps)),
      'target_leaf_steps',
      '$.leafSteps',
    );
  }
  return detachHistory({ ...parsed, dependencyHistory });
}

/**
 * Checks already decoded input13 against an already decoded local schedule's slice owners.
 * A null step is a boundary only for a recorded empty leaf; absent and parent owners refuse.
 * Held work can be absent from a schedule, so this does not invent missing placements.
 * @throws SavedHistoryError for a scheduled pair outside its recorded leaf inventory.
 */
export function assertSavedLeafSchedule(
  input: CanonicalPlanInputV13,
  slices: Readonly<Record<string, { readonly workItemId: string; readonly stepId: string | null }>>,
): void {
  const orders = new Map(input.leafSteps.map((leaf) => [leaf.workItemId, leaf.stepIds]));
  for (const slice of Object.values(slices)) {
    const steps = orders.get(slice.workItemId);
    // Proof: omission admitted foreign-policy, false-boundary and parent slices through the integrity reader (input13-fault-plain-placement-v1).
    requireHistory(
      steps !== undefined &&
        (slice.stepId === null ? steps.length === 0 : steps.includes(slice.stepId)),
      'placement_step',
      '$.slices',
    );
  }
}

/** Point facts belong only to a declared leaf occurrence; package membership alone is insufficient. */
function assertLeafFacts(
  input: Omit<CanonicalPlanInputV13, 'dependencyHistory'>,
  orders: ReadonlyMap<string, readonly string[]>,
): void {
  for (const [field, facts] of [
    ['stepValues', input.stepValues],
    ['stepBlockages', input.stepBlockages],
    ['stepParallels', input.stepParallels],
    ['measures', input.measures],
    ['measureEstimates', input.measureEstimates],
    ['assignments', input.assignments],
  ] as const)
    // Proof: omission failed eighteen parent/nonmatching/foreign pair negatives across six serialized collections (input13-fault-point-facts-v1); some older secondary checks retain later refusals.
    for (const fact of facts)
      requireHistory(
        orders.get(fact.workItemId)?.includes(fact.stepId) === true,
        'leaf_fact',
        `$.${field}`,
      );
}

/** Captured local selectors resolve only through their declared tree and own inventories. */
function assertLocalRelationships(
  input: Omit<CanonicalPlanInputV13, 'dependencyHistory'>,
  orders: ReadonlyMap<string, readonly string[]>,
): void {
  const rowIds = new Set(input.workItems.map((row) => row.id));
  const parents = new Set(input.workItems.map((row) => row.parentId));
  const isBeneath = (leafId: string, ownerId: string): boolean =>
    input.workItems.some(
      (row) => row.parentId === ownerId && (row.id === leafId || isBeneath(leafId, row.id)),
    );
  // Proof: omission admitted a whole dependency with an absent owner (input13-fault-whole-owner-v1).
  for (const dependency of input.dependencies)
    requireHistory(
      rowIds.has(dependency.predecessorId) && rowIds.has(dependency.successorId),
      'dependency_owner',
      '$.dependencies',
    );
  for (const dependency of input.typedDependencies)
    for (const endpoint of [dependency.predecessor, dependency.successor]) {
      // Proof: omission admitted a typed whole endpoint with an absent owner (input13-fault-typed-owner-v1).
      requireHistory(rowIds.has(endpoint.workItemId), 'dependency_owner', '$.typedDependencies');
      if (endpoint.scope === 'whole') continue;
      // Proof: omission admitted a node selecting a policy outside its leaf (input13-fault-typed-leaf-v1).
      requireHistory(
        endpoint.scope === 'node'
          ? !parents.has(endpoint.workItemId) &&
              orders.get(endpoint.workItemId)?.includes(endpoint.stepId) === true
          : parents.has(endpoint.workItemId) &&
              [...orders].some(
                ([leafId, ordered]) =>
                  ordered.includes(endpoint.stepId) && isBeneath(leafId, endpoint.workItemId),
              ),
        'leaf_dependency',
        '$.typedDependencies',
      );
    }
}

/**
 * Writes explicit13 values deterministically; callers supply actual captured own orders.
 * Only identity sets are sorted. A leaf's execution order remains exactly as captured.
 */
export function canonicalisePlanInputV13(
  rows: PlanInputRows,
  leafSteps: readonly LeafStepOrder[],
  history: SavedLeafDependencyHistory,
): CanonicalPlanInputV13 {
  const dependencyHistory: unknown = JSON.parse(serializeLeafDependencyHistory(history));
  return readCurrentSavedPlanInput13({
    schemaVersion: 13,
    ...canonicalisePlanInput(rows),
    leafSteps: [...leafSteps]
      .sort((left, right) => compareHistoryKeys(left.workItemId, right.workItemId))
      .map((leaf) => ({ workItemId: leaf.workItemId, stepIds: [...leaf.stepIds] })),
    dependencyHistory,
  });
}
