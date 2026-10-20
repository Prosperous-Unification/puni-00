import { RESOURCE_KINDS, type ResourceKind } from './stored-vocabularies';

/**
 * A claimable thing work can state a demand on, named in the directory like a
 * team (`wbs-resources` R1): unique by name, with a {@link ResourceKind} that
 * never changes and a free-text unit label shown beside every number of it.
 * It has no global size; how many units a plan may use is a
 * {@link ResourceCapacity} of one project.
 */
export interface Resource {
  readonly id: string;
  readonly name: string;
  readonly kind: ResourceKind;
  readonly unitLabel: string;
}

/**
 * How many units of one resource one project's plan may use, when stated. An
 * unstated pair is the absence of one of these and constrains nothing; a stated
 * 0 means the plan may use none.
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
