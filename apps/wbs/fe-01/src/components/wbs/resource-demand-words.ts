import { unitsWords } from '@/lib/compute-provider-words';
import type { PlanRead } from '@/lib/wbs-api';

/** One resource a row's work item demands, with the units, as the tree read names it. */
export interface RowDemand {
  readonly resourceId: string;
  readonly name: string;
  readonly kind: 'exclusive' | 'divisible';
  readonly unitLabel: string;
  readonly units: number;
}

/**
 * Every row's own demands (`wbs-resources` 1.5), keyed by work item and
 * ordered by resource name, off one tree read's `demands` and
 * `demandedResources`. A read stating no demand answers an empty map.
 *
 * @throws when a demand names a resource the same read does not list: two
 * halves of one payload disagreeing is a broken read, not a row to drop.
 */
export function demandsByWorkItem(
  read: Pick<PlanRead, 'demands' | 'demandedResources'>,
): ReadonlyMap<string, RowDemand[]> {
  const named = new Map((read.demandedResources ?? []).map((each) => [each.id, each] as const));
  const byItem = new Map<string, RowDemand[]>();
  for (const { workItemId, resourceId, units } of read.demands ?? []) {
    const resource = named.get(resourceId);
    if (resource === undefined)
      throw new Error(`a demand names resource "${resourceId}", which the read does not list`);
    const row = byItem.get(workItemId) ?? [];
    row.push({
      resourceId,
      name: resource.name,
      kind: resource.kind,
      unitLabel: resource.unitLabel,
      units,
    });
    byItem.set(workItemId, row);
  }
  for (const row of byItem.values()) row.sort((left, right) => left.name.localeCompare(right.name));
  return byItem;
}

/** One demand in words: an exclusive resource by name, a divisible one with its units. */
export function demandWords(demand: RowDemand): string {
  return demand.kind === 'exclusive'
    ? demand.name
    : `${demand.name} ${unitsWords(demand.units, demand.unitLabel)}`;
}

/** A row's demands in one line, `RAM 6 GiB · staging`; empty for none. */
export function demandSummary(demands: readonly RowDemand[]): string {
  return demands.map(demandWords).join(' · ');
}
