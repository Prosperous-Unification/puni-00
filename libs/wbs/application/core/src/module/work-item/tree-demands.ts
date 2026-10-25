import type { Demand, Resource } from '@wbs/domain';

import type { PlanTree } from '../../ports/plan-tree';

/** The two fields the tree read adds for a plan that states demands. */
export type DemandFields = Pick<PlanTree, 'demands' | 'demandedResources'>;

/**
 * Every demand of a project's work items and one entry per resource those
 * demands name (`wbs-resources` 1.5), so a row's Resources cell reads the same
 * answer the table is drawn from. Empty when nothing is demanded, so a plan
 * stating none keeps its payload shape.
 *
 * @throws when a demanded resource is absent from `catalog`: two trusted reads
 * disagreeing, which {@link namedDemandFields} reads again once before it lets
 * this throw.
 */
export function withDemands(
  demands: readonly Demand[],
  catalog: readonly Resource[],
): Partial<DemandFields> {
  if (demands.length === 0) return {};
  const byId = new Map(catalog.map((resource) => [resource.id, resource] as const));
  const ordered = [...demands].sort(
    (left, right) =>
      left.workItemId.localeCompare(right.workItemId) ||
      left.resourceId.localeCompare(right.resourceId),
  );
  const named = [...new Set(ordered.map(({ resourceId }) => resourceId))].sort();
  return {
    demands: ordered.map(({ workItemId, resourceId, units }) => ({
      workItemId,
      resourceId,
      units,
    })),
    demandedResources: named.map((resourceId) => {
      const resource = byId.get(resourceId);
      if (resource === undefined)
        throw new Error(`a demand names resource "${resourceId}", which this read cannot name`);
      const { id, name, kind, unitLabel } = resource;
      return { id, name, kind, unitLabel };
    }),
  };
}

/** Whether every demand names a resource the catalog holds. */
function isNamed(demands: readonly Demand[], catalog: readonly Resource[]): boolean {
  const held = new Set(catalog.map(({ id }) => id));
  return demands.every(({ resourceId }) => held.has(resourceId));
}

/**
 * {@link withDemands} over two reads that are not one observation: the
 * isolated tree read takes the demands and the caller's catalog outside one
 * transaction, so a resource removed with its demands (`cascade`) between them
 * leaves a demand naming nothing. Bounded convergence: the catalog is read only
 * when something is demanded, a disagreeing pair is read once more, and a
 * second disagreement throws — that is no longer a race but a demand on a
 * resource the caller's directory never mapped, which is broken trusted state.
 *
 * @throws as {@link withDemands} when the second pair still disagrees.
 */
export async function namedDemandFields(
  readDemands: () => Promise<readonly Demand[]>,
  readCatalog: () => Promise<readonly Resource[]>,
): Promise<Partial<DemandFields>> {
  const demands = await readDemands();
  if (demands.length === 0) return {};
  const catalog = await readCatalog();
  if (isNamed(demands, catalog)) return withDemands(demands, catalog);
  const again = await readDemands();
  if (again.length === 0) return {};
  return withDemands(again, await readCatalog());
}
