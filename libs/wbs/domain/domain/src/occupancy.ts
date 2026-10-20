import type { ResourceCapacity } from './resource';

/** Units of one resource: a demand vector's entry, a claim's ask, or what it holds. */
export interface ResourceUnits {
  readonly resourceId: string;
  readonly units: number;
}

/**
 * One claim row's copy of its leaf's **Occupancy** of one resource
 * (`wbs-resources` R3): the units the leaf holds while any claim on it stands.
 *
 * Every claim row on a leaf carries the leaf's whole vector, so releasing one
 * claim of two leaves the other's copy and the units stay held; releasing the
 * last takes the last copy. A leaf's units of a resource are therefore the
 * largest copy among its rows ({@link leafOccupancyOf}), never their sum.
 */
export interface OccupancyRow {
  readonly claimId: string;
  readonly workItemId: string;
  readonly personId: string;
  readonly runId: string | null;
  readonly resourceId: string;
  readonly units: number;
}

/** Who holds units of a resource: one claimant and run on one leaf. */
export interface OccupancyHolder {
  readonly personId: string;
  readonly runId: string | null;
  readonly workItemId: string;
}

/** One resource's occupancy across a project: the units its leaves hold, and who holds them. */
export interface ResourceOccupancy {
  readonly resourceId: string;
  readonly occupied: number;
  readonly holders: readonly OccupancyHolder[];
}

export interface BelowDeclaredDemand {
  readonly reason: 'below_declared_demand';
  readonly resourceId: string;
  readonly asked: number;
  readonly declared: number;
}

/**
 * A claim that would take more of a resource than the project has free.
 * `free` is the stated capacity minus what other leaves hold; it reads below
 * 0 when a capacity was lowered under units already held.
 */
export interface ResourcesExhausted {
  readonly reason: 'resources_exhausted';
  readonly resourceId: string;
  readonly asked: number;
  readonly free: number;
  readonly holders: readonly OccupancyHolder[];
}

function byResource(left: ResourceUnits, right: ResourceUnits): number {
  return left.resourceId < right.resourceId ? -1 : left.resourceId > right.resourceId ? 1 : 0;
}

/** The units one leaf holds of each resource, in resource-id order: the largest copy per resource. */
export function leafOccupancyOf(
  rows: readonly OccupancyRow[],
  workItemId: string,
): ResourceUnits[] {
  const held = new Map<string, number>();
  for (const row of rows) {
    if (row.workItemId !== workItemId) continue;
    held.set(row.resourceId, Math.max(held.get(row.resourceId) ?? 0, row.units));
  }
  return [...held].map(([resourceId, units]) => ({ resourceId, units })).sort(byResource);
}

/**
 * Each resource's occupancy across `rows`, in resource-id order: the sum over
 * leaves of what each leaf holds ({@link leafOccupancyOf}), and every distinct
 * claimant and run holding it, by work item then person.
 */
export function occupancyByResource(rows: readonly OccupancyRow[]): ResourceOccupancy[] {
  const perLeaf = new Map<string, Map<string, number>>();
  const holders = new Map<string, Map<string, OccupancyHolder>>();
  for (const row of rows) {
    const leaves = perLeaf.get(row.resourceId) ?? new Map<string, number>();
    leaves.set(row.workItemId, Math.max(leaves.get(row.workItemId) ?? 0, row.units));
    perLeaf.set(row.resourceId, leaves);
    const named = holders.get(row.resourceId) ?? new Map<string, OccupancyHolder>();
    const holder = { personId: row.personId, runId: row.runId, workItemId: row.workItemId };
    named.set(JSON.stringify([holder.workItemId, holder.personId, holder.runId]), holder);
    holders.set(row.resourceId, named);
  }
  return [...perLeaf]
    .map(([resourceId, leaves]) => ({
      resourceId,
      occupied: [...leaves.values()].reduce((sum, units) => sum + units, 0),
      holders: [...(holders.get(resourceId)?.values() ?? [])].sort(
        (left, right) =>
          compare(left.workItemId, right.workItemId) ||
          compare(left.personId, right.personId) ||
          compare(left.runId ?? '', right.runId ?? ''),
      ),
    }))
    .sort((left, right) => compare(left.resourceId, right.resourceId));
}

/**
 * The free units of every resource the project states a capacity for, in
 * resource-id order: capacity minus what the project's leaves hold. An
 * unstated resource has no entry, because it constrains nothing.
 */
export function freeUnitsOf(
  capacities: readonly ResourceCapacity[],
  rows: readonly OccupancyRow[],
): ResourceUnits[] {
  const occupied = new Map(occupancyByResource(rows).map((each) => [each.resourceId, each]));
  return capacities
    .map(({ resourceId, units }) => ({
      resourceId,
      units: units - (occupied.get(resourceId)?.occupied ?? 0),
    }))
    .sort(byResource);
}

/**
 * What a leaf's first claim asks to hold (`wbs-resources` R4): the declared
 * demand, each entry raised to the claim's `resources` entry for it, plus any
 * resource the claim adds. An entry below the declared units is refused
 * `below_declared_demand`, the first such in resource-id order: a claim may
 * correct the plan upward, never under-ask.
 *
 * @throws when `asked` names one resource twice: the command boundary refuses that.
 */
export function askedUnitsOf(
  declared: readonly ResourceUnits[],
  asked: readonly ResourceUnits[] | null,
): ResourceUnits[] | BelowDeclaredDemand {
  const units = new Map(declared.map((each) => [each.resourceId, each.units]));
  if (asked === null) return [...declared].sort(byResource);
  if (new Set(asked.map(({ resourceId }) => resourceId)).size !== asked.length)
    throw new Error('a claim asks for one resource twice');
  for (const each of [...asked].sort(byResource)) {
    const floor = units.get(each.resourceId);
    // Proof: with this refusal removed, `refuses below_declared_demand when the
    // claim asks less than the leaf declares` (claim-occupancy.test.ts) claimed
    // 1 GB of a 2 GB demand; watched 2026-10-20.
    if (floor !== undefined && each.units < floor) {
      return {
        reason: 'below_declared_demand',
        resourceId: each.resourceId,
        asked: each.units,
        declared: floor,
      };
    }
    units.set(each.resourceId, each.units);
  }
  return [...units].map(([resourceId, held]) => ({ resourceId, units: held })).sort(byResource);
}

/**
 * **The** occupancy check (`wbs-resources` R3), the one place a claim, a redo
 * of a claim and an undo of a release ask whether units are free: for each
 * resource of `asked` the project states a capacity for, in resource-id order,
 * the leaf may hold `units` when it already holds that many or more, or when
 * the capacity minus what the project's other leaves hold covers them.
 * Unstated capacity never refuses. Called inside the batch's transaction, so
 * the write coordinator orders two claims and the second reads the first's units.
 *
 * Proof: with the comparison answering null, `refuses the ninth of eight 4 GB
 * claims on 32 GB` (claim.test.ts) claimed, and `admits one of two concurrent
 * claims over capacity, the other refused resources_exhausted`
 * (claim-occupancy-race.db.test.ts) stored both claims, over 6 GB; watched 2026-10-20.
 */
export function refuseOccupancy(request: {
  readonly workItemId: string;
  readonly asked: readonly ResourceUnits[];
  readonly capacities: readonly ResourceCapacity[];
  readonly occupancy: readonly OccupancyRow[];
}): ResourcesExhausted | null {
  const capacityOf = new Map(request.capacities.map((each) => [each.resourceId, each.units]));
  const held = new Map(
    leafOccupancyOf(request.occupancy, request.workItemId).map((each) => [
      each.resourceId,
      each.units,
    ]),
  );
  const others = occupancyByResource(
    request.occupancy.filter((row) => row.workItemId !== request.workItemId),
  );
  for (const { resourceId, units } of [...request.asked].sort(byResource)) {
    const capacity = capacityOf.get(resourceId);
    // Proof: with the held comparison removed, `lets a leaf already holding
    // units keep them while the capacity sits below them` (claim-occupancy.test.ts)
    // refused the leaf its own units; watched 2026-10-20.
    if (capacity === undefined || units <= (held.get(resourceId) ?? 0)) continue;
    const taken = others.find((each) => each.resourceId === resourceId);
    const free = capacity - (taken?.occupied ?? 0);
    if (units > free) {
      return {
        reason: 'resources_exhausted',
        resourceId,
        asked: units,
        free,
        holders: taken?.holders ?? [],
      };
    }
  }
  return null;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
