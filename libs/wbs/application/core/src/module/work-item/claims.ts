import type {
  BelowDeclaredDemand,
  BelowHeldOccupancy,
  Claim,
  ClaimHolder,
  ClaimRefusal,
  OccupancyHolder,
  OrganizationRole,
  ReleaseRefusal,
  ResourcesExhausted,
  ResourceShortage,
  ResourceUnits,
  TreePlacement,
  WorkItemStatus,
} from '@wbs/domain';
import { byTreeOrder, treeOrder } from '@wbs/domain';

import type { ResourceAccess } from '../../ports/organization-access';
import type { WorkItem } from '../../ports/work-item-store';

/** What `claimWorkItem` asks of one work item once its refs are resolved. */
export interface ClaimInput {
  readonly personId: string;
  /** The steps named, or null for every step that is not done. */
  readonly stepIds: readonly string[] | null;
  readonly runId: string | null;
  readonly parentClaimId: string | null;
  /** Also assign the claimant to every step the claim writes (`wbs-resources` R7). */
  readonly assign: boolean;
  /**
   * What the claim asks to hold in place of the leaf's declared demand
   * (`wbs-resources` R4), or null for the declared demand.
   */
  readonly resources: readonly ResourceUnits[] | null;
}

/** What `releaseWorkItem` asks of one work item once its refs are resolved. */
export interface ReleaseInput {
  readonly personId: string;
  /** The steps named, or null for every claim of the person on the item. */
  readonly stepIds: readonly string[] | null;
}

/** A refusal's holder as the wire names it: the decision's holder and the person's name. */
export interface NamedClaimHolder extends ClaimHolder {
  readonly name: string;
}

/** An occupancy holder as the wire names it: the person's name beside the decision's holder. */
export interface NamedOccupancyHolder extends OccupancyHolder {
  readonly name: string;
}

/** A short resource as the wire names it: its holders named. */
export interface NamedResourceShortage extends Omit<ResourceShortage, 'holders'> {
  readonly holders: readonly NamedOccupancyHolder[];
}

/** Claim and release refusals that carry nothing beside their reason. */
export type PlainClaimReason =
  | 'resources_on_subtree'
  | 'person_not_bound'
  | 'credential_not_for_person'
  | 'parent_claim_unknown'
  | 'parent_claim_foreign'
  | 'parent_claim_not_ancestor'
  | 'item_done'
  | 'no_steps'
  | 'steps_on_subtree'
  | 'not_claimed_by';

/** Every refusal a claim or release answers beside the work-item service's own. */
export type ClaimRefusalOutcome =
  | { readonly ok: false; readonly reason: PlainClaimReason }
  | { readonly ok: false; readonly reason: 'not_startable'; readonly status: WorkItemStatus }
  | { readonly ok: false; readonly reason: 'step_done'; readonly stepIds: readonly string[] }
  | {
      readonly ok: false;
      readonly reason: 'already_claimed';
      readonly holders: readonly NamedClaimHolder[];
    }
  | {
      readonly ok: false;
      readonly reason: 'inside_subtree_claim' | 'overlaps_subtree_claim';
      readonly holder: NamedClaimHolder;
    }
  | ({ readonly ok: false } & BelowDeclaredDemand)
  | ({ readonly ok: false } & BelowHeldOccupancy)
  | ({ readonly ok: false } & Omit<ResourcesExhausted, 'holders' | 'resources'> & {
        readonly holders: readonly NamedOccupancyHolder[];
        readonly resources: readonly NamedResourceShortage[];
      })
  /**
   * The claim would add one more bound claim than the organization's cap
   * allows (`wbs-organization-limits` L9): the cap and the bound claims held,
   * read in the batch's transaction.
   */
  | {
      readonly ok: false;
      readonly reason: 'claim_limit';
      readonly cap: number;
      readonly current: number;
    };

/** What a successful claim answers: whether it wrote nothing, and the claims it holds. */
export interface Claimed {
  readonly alreadyHeld: boolean;
  /** The claims written, or for `alreadyHeld` the ones already holding every step. */
  readonly claimIds: readonly string[];
  /** The steps the claim made the claimant the assignee of; empty without `assign`. */
  readonly assignedStepIds: readonly string[];
  /**
   * The units this claim newly acquired (`wbs-resources` R3, R4): the leaf's
   * occupancy on its first claim, what a later claim's ask adds above the
   * standing copy, and empty for a subtree claim and `alreadyHeld`.
   */
  readonly acquired: readonly ResourceUnits[];
}

const ADMIN_ROLES: ReadonlySet<OrganizationRole> = new Set(['admin', 'super_admin']);

/**
 * Whether the caller holds `admin` or `super_admin` in the project's
 * organization: the `person_not_bound` bypass (D5). Legacy access has no
 * organization and therefore no role, so it never bypasses.
 */
export function isClaimAdmin(access: ResourceAccess): boolean {
  return access.kind === 'scoped' && ADMIN_ROLES.has(access.scope.role);
}

/** A work item's place in its tree: whether it is a leaf, and every strict ancestor and descendant. */
export function lineageOf(
  rows: readonly Pick<WorkItem, 'id' | 'parentId'>[],
  id: string,
): { isLeaf: boolean; ancestorIds: string[]; descendantIds: string[] } {
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  const ancestorIds: string[] = [];
  for (let at = parentOf.get(id) ?? null; at !== null; at = parentOf.get(at) ?? null) {
    if (ancestorIds.includes(at)) throw new Error(`work item ${id} sits under a parent cycle`);
    ancestorIds.push(at);
  }
  const descendantIds: string[] = [];
  const frontier = [id];
  for (let next = frontier.pop(); next !== undefined; next = frontier.pop()) {
    for (const row of rows) {
      if (row.parentId === next) {
        descendantIds.push(row.id);
        frontier.push(row.id);
      }
    }
  }
  return {
    isLeaf: !rows.some((row) => row.parentId === id),
    ancestorIds,
    descendantIds,
  };
}

/**
 * One leaf step `assignSubtree` gave a new assignee while another person holds
 * the step's claim (issue #669 F6): reported, never refused.
 */
export interface ReassignedClaimedStep {
  readonly workItemId: string;
  readonly stepId: string;
  /** The assignee before the command, or null where the step had none. */
  readonly previousPersonId: string | null;
  /** The step's one claim (the `claim_step` unique index allows no second). */
  readonly holder: {
    readonly claimId: string;
    readonly personId: string;
    readonly runId: string | null;
  };
}

/**
 * The leaves among `leafIds`, in tree order over `rows`, whose `stepId`
 * assignee changed from `previous` to `personId` while a person other than
 * `personId` holds the claim on that very step. A subtree claim (`stepId` null)
 * or a claim on another step of the leaf never counts.
 *
 * Proof: without the tree-order sort, `lists reassigned claimed steps in tree
 * order…` (reassigned-claimed-steps.test.ts) listed `claim-a` first, and step 9
 * of swarm-end-to-end.db.test.ts failed in 4 of 8 runs; watched 2026-10-24.
 *
 * @throws when a leaf is not among `rows` ({@link byTreeOrder}).
 */
export function findReassignedClaimedSteps(input: {
  readonly rows: readonly TreePlacement[];
  readonly leafIds: readonly string[];
  readonly stepId: string;
  readonly personId: string | null;
  readonly previous: ReadonlyMap<string, string>;
  readonly claims: readonly Claim[];
}): ReassignedClaimedStep[] {
  const { stepId, personId } = input;
  const leaves = input.leafIds
    .map((id) => ({ id }))
    .toSorted(byTreeOrder(treeOrder(input.rows)))
    .map((leaf) => leaf.id);
  return leaves.flatMap((workItemId) => {
    const previousPersonId = input.previous.get(workItemId) ?? null;
    if (previousPersonId === personId) return [];
    const claim = input.claims.find(
      (each) => each.workItemId === workItemId && each.stepId === stepId,
    );
    if (claim === undefined || claim.personId === personId) return [];
    return [
      {
        workItemId,
        stepId,
        previousPersonId,
        holder: { claimId: claim.id, personId: claim.personId, runId: claim.runId },
      },
    ];
  });
}

/** The claims a decision reads: on the item, its ancestors and its descendants. */
export function claimsAround(
  claims: readonly Claim[],
  id: string,
  lineage: { ancestorIds: readonly string[]; descendantIds: readonly string[] },
): Claim[] {
  const near = new Set([id, ...lineage.ancestorIds, ...lineage.descendantIds]);
  return claims.filter((each) => near.has(each.workItemId));
}

/**
 * The decision's refusal as the service answers it, holders named.
 *
 * @throws when a holder names a person the directory does not hold: a claim's
 * person reference cascades on delete, so that is corrupt trusted state.
 */
export function refusalOf(
  refusal: ClaimRefusal | ReleaseRefusal,
  nameOf: ReadonlyMap<string, string>,
): ClaimRefusalOutcome {
  const named = (holder: ClaimHolder): NamedClaimHolder => {
    const name = nameOf.get(holder.personId);
    if (name === undefined) throw new Error(`claim ${holder.claimId} names an absent person`);
    return { ...holder, name };
  };
  const occupant = (holder: OccupancyHolder): NamedOccupancyHolder => {
    const name = nameOf.get(holder.personId);
    if (name === undefined)
      throw new Error(`a claim on ${holder.workItemId} names an absent person`);
    return { ...holder, name };
  };
  switch (refusal.reason) {
    case 'not_startable':
      return { ok: false, reason: refusal.reason, status: refusal.status };
    case 'step_done':
      return { ok: false, reason: refusal.reason, stepIds: [...refusal.stepIds] };
    case 'already_claimed':
      return { ok: false, reason: refusal.reason, holders: refusal.holders.map(named) };
    case 'inside_subtree_claim':
    case 'overlaps_subtree_claim':
      return { ok: false, reason: refusal.reason, holder: named(refusal.holder) };
    case 'below_declared_demand':
    case 'below_held_occupancy':
      return { ok: false, ...refusal };
    case 'resources_exhausted':
      return {
        ok: false,
        ...refusal,
        holders: refusal.holders.map(occupant),
        resources: refusal.resources.map((short) => ({
          ...short,
          holders: short.holders.map(occupant),
        })),
      };
    default:
      return { ok: false, reason: refusal.reason };
  }
}
