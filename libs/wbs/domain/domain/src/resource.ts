import { RESOURCE_KINDS, type ResourceKind } from './stored-vocabularies';

/**
 * A claimable thing work can state a demand on, named in the directory like a
 * team (`wbs-resources` R1): unique by name, with a {@link ResourceKind} that
 * never changes and a free-text unit label shown beside every number of it.
 * Work package and directory capacity statements together define the scheduling pool
 * through {@link effectivePoolSizesOf}.
 */
export interface Resource {
  readonly id: string;
  readonly name: string;
  readonly kind: ResourceKind;
  readonly unitLabel: string;
}

/**
 * A stated work package or directory capacity. Absence leaves that scope unsized,
 * while 0 states that it offers no units.
 */
export interface ResourceCapacity {
  readonly resourceId: string;
  readonly units: number;
}

/**
 * The units of one resource one work item states it needs while any of its
 * steps runs. Always at least 1, exactly 1 on an `exclusive` resource, and never
 * inherited down the tree: a parent's demand charges nothing.
 */
export interface Demand {
  readonly workItemId: string;
  readonly resourceId: string;
  readonly units: number;
}

/**
 * The most units any capacity or demand may state. A product bound like
 * `MOST_PEOPLE_AT_ONCE`, wide enough for a host's RAM in megabytes; above it a
 * number is a typo rather than a plan.
 */
export const MOST_RESOURCE_UNITS = 1_000_000_000;

/** Whether `kind` names a {@link ResourceKind}; the narrowing every boundary uses. */
export function isResourceKind(kind: unknown): kind is ResourceKind {
  return (RESOURCE_KINDS as readonly unknown[]).includes(kind);
}

/**
 * Why a demand of `units` on a resource of `kind` cannot be stated, or null when
 * it can. `units` has already been bounded to a whole number from 1 at the
 * boundary; this is the one rule the kind adds: an exclusive unit is demanded
 * whole or not at all, so 2 is a refusal rather than a clamp.
 */
export function refuseDemand(kind: ResourceKind, units: number): 'exclusive_demand_is_one' | null {
  return kind === 'exclusive' && units !== 1 ? 'exclusive_demand_is_one' : null;
}

/**
 * The resources actually demanded by the work package's leaves, before hold reduction.
 * Parent demands and demands outside these rows never introduce a scheduling pool.
 */
export function leafDemandResourceIdsOf(
  rows: readonly { readonly id: string; readonly parentId: string | null }[],
  demands: readonly Demand[],
): Set<string> {
  const parents = new Set(rows.map(({ parentId }) => parentId));
  const leaves = new Set(rows.filter(({ id }) => !parents.has(id)).map(({ id }) => id));
  const resourceIds = new Set<string>();
  for (const { workItemId, resourceId } of demands) {
    // Proof: skipping the leaf check sent parent-only to the store in
    // resource-schedule.test.ts's batched statement and demand case.
    if (leaves.has(workItemId)) resourceIds.add(resourceId);
  }
  return resourceIds;
}

/** The batch of directory statements needed for one work package's schedule. */
export function scheduleResourceIdsOf(
  rows: Parameters<typeof leafDemandResourceIdsOf>[0],
  workPackageCapacities: readonly ResourceCapacity[],
  demands: readonly Demand[],
): string[] {
  return [
    ...new Set([
      ...workPackageCapacities.map(({ resourceId }) => resourceId),
      ...leafDemandResourceIdsOf(rows, demands),
    ]),
  ];
}

/**
 * Size the resource pools for both schedulers. A work package statement always
 * contributes a pool and a directory statement caps it, including at zero.
 * A directory statement alone contributes only when the work package's leaves
 * demand it. Occupancy is irrelevant to placement.
 */
export function effectivePoolSizesOf(
  workPackageCapacities: readonly ResourceCapacity[],
  directoryCapacities: readonly ResourceCapacity[],
  demandedResourceIds: ReadonlySet<string>,
): Map<string, number> {
  const pools = new Map(workPackageCapacities.map(({ resourceId, units }) => [resourceId, units]));
  for (const { resourceId, units } of directoryCapacities) {
    const workPackage = pools.get(resourceId);
    // Proof: returning the raw work package value made resource.test.ts's pool
    // table receive 32 at both a 16-unit ceiling and a zero ceiling.
    if (workPackage !== undefined) pools.set(resourceId, Math.min(workPackage, units));
    else if (demandedResourceIds.has(resourceId)) pools.set(resourceId, units);
  }
  return pools;
}

/**
 * Each leaf's demand vector as both engines charge it (`wbs-resources` R2 and
 * R5): its own demands on effective resource pools, each in resource-id
 * order with its units clamped to that pool.
 *
 * Three rules, the team pool's three (`poolsFor`) restated for units:
 *
 * 1. **Unstated constrains nothing.** A demand on a resource with no stated
 *    capacity is left out, so the engines' `no capacity for resource` throw
 *    stays a caller-fault assertion rather than ordinary control flow.
 * 2. **Clamped to the capacity**, as a width is clamped to its narrowest team:
 *    a block demanding more units than the plan may use could never be placed,
 *    so it holds the whole pool instead. A stated **0** therefore clamps every
 *    demand to nothing and constrains nothing in the schedule; "the plan may
 *    use none" is a claim-time refusal, and a block that may never start has no
 *    date to give.
 * 3. **A parent charges nothing.** The caller reads this map for leaves only,
 *    so a demand stated on a parent never reaches a slice.
 *
 * Keyed by work item id; a leaf with no charged demand has no entry.
 */
export function chargedDemandsOf(
  demands: readonly Demand[],
  capacities: ReadonlyMap<string, number>,
): Map<string, { resourceId: string; units: number }[]> {
  const byWorkItem = new Map<string, { resourceId: string; units: number }[]>();
  for (const { workItemId, resourceId, units } of demands) {
    const capacity = capacities.get(resourceId);
    // Proof: with this skip removed (the demand charged unclamped), `leaves a
    // demand on an unstated capacity unconstrained` (schedule-resources.test.ts)
    // received the staging demand too; watched 2026-10-20.
    if (capacity === undefined) continue;
    // Proof: the clamp removed (units charged as stated) made `clamps a demand
    // to its capacity, and a stated 0 charges nothing` (schedule-resources.test.ts)
    // receive 48 GB against 32 (13 pass / 1 fail); watched 2026-10-20.
    const charged = Math.min(units, capacity);
    if (charged === 0) continue;
    const vector = byWorkItem.get(workItemId) ?? [];
    vector.push({ resourceId, units: charged });
    byWorkItem.set(workItemId, vector);
  }
  for (const vector of byWorkItem.values()) {
    vector.sort((left, right) =>
      left.resourceId < right.resourceId ? -1 : left.resourceId > right.resourceId ? 1 : 0,
    );
  }
  return byWorkItem;
}
