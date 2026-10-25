import {
  acquiredUnitsOf,
  askedUnitsOf,
  type BelowDeclaredDemand,
  type BelowHeldOccupancy,
  expandedUnitsOf,
  leafOccupancyOf,
  type OccupancyRow,
  refuseOccupancy,
  type ResourcesExhausted,
  type ResourceUnits,
} from './occupancy';
import type { ProgressStatus, WorkItemStatus } from './progress';
import type { ResourceCapacity } from './resource';

/**
 * Who occupies one step of a leaf now (`stepId` set), or reserves dispatch of a
 * non-leaf's subtree (`stepId` null) — a **Claim**, beside the assignment and
 * never instead of it (`openspec/changes/wbs-team-claims/design.md` D1).
 * `parentClaimId` makes it a **Delegated claim** under a subtree claim.
 * `accountId` is the account that wrote it: the record's `created_by`.
 */
export interface Claim {
  readonly id: string;
  readonly workItemId: string;
  readonly stepId: string | null;
  readonly personId: string;
  /** The harness's opaque **Agent run**; stored and shown, never parsed. */
  readonly runId: string | null;
  readonly parentClaimId: string | null;
  readonly accountId: string;
}

/** A claim the decision asks to write; the caller mints its id and stamps its account. */
export type ClaimDraft = Omit<Claim, 'id' | 'accountId'>;

/** The caller as the claim rules see it (D5, D6). */
export interface ClaimCaller {
  readonly accountId: string;
  /** Holds `admin` or `super_admin` in the project's organization. */
  readonly isAdmin: boolean;
  /** The person the caller's credential is pinned to, or null for an unpinned credential. */
  readonly pinnedPersonId: string | null;
}

/** The person named on the claim and the account bound to act as them, if any. */
export interface Claimant {
  readonly personId: string;
  readonly boundAccountId: string | null;
}

export interface ClaimTarget {
  readonly workItemId: string;
  readonly isLeaf: boolean;
  /** The derived status the table shows (`statusOf`, then `blockedByProxyOf`). */
  readonly status: WorkItemStatus;
  /** Every strict ancestor, in any order. */
  readonly ancestorIds: readonly string[];
  /** Every strict descendant, in any order. */
  readonly descendantIds: readonly string[];
  /** A leaf's steps in project order with their progress on it; empty for a non-leaf. */
  readonly steps: readonly { readonly stepId: string; readonly progress: ProgressStatus }[];
}

export interface ClaimRequest {
  readonly target: ClaimTarget;
  readonly caller: ClaimCaller;
  readonly claimant: Claimant;
  /** The steps named, or null for every step that is not done. */
  readonly stepIds: readonly string[] | null;
  readonly runId: string | null;
  readonly parentClaimId: string | null;
  /**
   * Also make the claimant the assignee of every step the claim writes
   * (`wbs-resources` R7): "claim = assign" is this flag, never a rule.
   */
  readonly assign: boolean;
  /** The claim `parentClaimId` names, read by id; null when absent or released. */
  readonly parentClaim: Claim | null;
  /**
   * Every claim in force on the target, its ancestors and its descendants. The
   * parent chain of `parentClaim` lies on ancestors, so it is among them.
   */
  readonly claims: readonly Claim[];
  /** The leaf's declared demand vector (`wbs-resources` R1); empty for a non-leaf. */
  readonly demand: readonly ResourceUnits[];
  /**
   * The claim's `resources`: what it asks to hold in place of the declared
   * demand, each entry at least the declared units (R4), or null to hold the
   * declared demand.
   */
  readonly resources: readonly ResourceUnits[] | null;
  /** The project's stated resource capacities; a resource with none is unstated. */
  readonly capacities: readonly ResourceCapacity[];
  /** Every occupancy row of the project's claims ({@link OccupancyRow}). */
  readonly occupancy: readonly OccupancyRow[];
  /**
   * The stated directory capacities of the resources the leaf may ask for
   * (`wbs-shared-occupancy` S1); a resource with none is counted within the
   * project alone.
   */
  readonly directoryCapacities: readonly ResourceCapacity[];
  /** The units every leaf of the organization holds of those resources ({@link refuseOccupancy}). */
  readonly organizationOccupied: readonly ResourceUnits[];
}

/** One holder a refusal names; the command adds the person's name. */
export interface ClaimHolder {
  readonly claimId: string;
  readonly personId: string;
  readonly runId: string | null;
}

export type ClaimRefusal =
  | { readonly reason: 'person_not_bound' }
  | { readonly reason: 'credential_not_for_person' }
  | { readonly reason: 'parent_claim_unknown' }
  | { readonly reason: 'parent_claim_foreign' }
  | { readonly reason: 'parent_claim_not_ancestor' }
  | { readonly reason: 'steps_on_subtree' }
  | { readonly reason: 'resources_on_subtree' }
  | { readonly reason: 'item_done' }
  | { readonly reason: 'no_steps' }
  | { readonly reason: 'not_startable'; readonly status: WorkItemStatus }
  | { readonly reason: 'step_done'; readonly stepIds: readonly string[] }
  | { readonly reason: 'already_claimed'; readonly holders: readonly ClaimHolder[] }
  | BelowDeclaredDemand
  | BelowHeldOccupancy
  | ResourcesExhausted
  | { readonly reason: 'inside_subtree_claim'; readonly holder: ClaimHolder }
  | { readonly reason: 'overlaps_subtree_claim'; readonly holder: ClaimHolder };

export type ClaimDecision =
  | {
      readonly kind: 'claim';
      readonly drafts: readonly ClaimDraft[];
      /** Claimed steps whose progress is unstated, to be stated `in_progress`. */
      readonly stateInProgress: readonly string[];
      /**
       * The steps to assign the claimant to: with `assign`, exactly the steps
       * the drafts write, else none. A subtree claim writes no step, so it
       * assigns nothing.
       */
      readonly assignStepIds: readonly string[];
      /**
       * The leaf's occupancy every draft carries a copy of: what the first
       * claim on a leaf acquires, or the leaf's standing occupancy for any
       * later claim, which acquires nothing (`wbs-resources` R3). Empty for a
       * subtree claim.
       */
      readonly occupancy: readonly ResourceUnits[];
      /** The units this claim newly acquires: `occupancy` on a first claim, else none. */
      readonly acquired: readonly ResourceUnits[];
    }
  | { readonly kind: 'alreadyHeld' }
  | { readonly kind: 'refused'; readonly refusal: ClaimRefusal };

const NOT_STARTABLE: ReadonlySet<WorkItemStatus> = new Set([
  'blocked',
  'on_hold',
  'blocked_by_proxy',
]);

/**
 * Whether a leaf whose derived status is `status` may be started: none of
 * `blocked`, `on_hold`, `blocked_by_proxy` or `done` (D3). The one test both
 * {@link decideClaim} and the startable read apply, so a step the read lists is
 * never one a claim would refuse as `not_startable` or `item_done`.
 */
export function isStartableStatus(status: WorkItemStatus): boolean {
  return status !== 'done' && !NOT_STARTABLE.has(status);
}

function holderOf(claim: Claim): ClaimHolder {
  return { claimId: claim.id, personId: claim.personId, runId: claim.runId };
}

function refused(refusal: ClaimRefusal): ClaimDecision {
  return { kind: 'refused', refusal };
}

/**
 * The claim ids from `start` up its parent chain, `start` included. A chain
 * that names a claim not in `claims` stops there; a cycle cannot be stored
 * (each parent lies on a strict ancestor) and is cut by the visited set.
 */
function chainOf(start: Claim | null, claims: readonly Claim[]): Claim[] {
  const byId = new Map(claims.map((each) => [each.id, each]));
  const chain: Claim[] = [];
  const seen = new Set<string>();
  for (let at = start; at !== null && !seen.has(at.id);) {
    seen.add(at.id);
    chain.push(at);
    at = at.parentClaimId === null ? null : (byId.get(at.parentClaimId) ?? null);
  }
  return chain;
}

/**
 * `person_not_bound` and `credential_not_for_person`, shared by claim and
 * release. Only the first has the admin bypass (D5); a pinned credential may
 * act for another person only beneath a claim of its own person (D6).
 */
function refuseIdentity(
  caller: ClaimCaller,
  claimant: Claimant,
  isUnderPinned: (pinned: string) => boolean,
): { readonly reason: 'person_not_bound' | 'credential_not_for_person' } | null {
  // Proof: with `!caller.isAdmin` removed, `lets an admin claim for an unbound
  // person` answered person_not_bound; with the account comparison removed,
  // `person_not_bound: the person is bound to another account` claimed; watched 2026-10-19.
  if (claimant.boundAccountId !== caller.accountId && !caller.isAdmin) {
    return { reason: 'person_not_bound' };
  }
  const pinned = caller.pinnedPersonId;
  // Proof: with this check removed, `credential_not_for_person: a pinned
  // credential names another person` claimed; watched 2026-10-19.
  if (pinned !== null && pinned !== claimant.personId && !isUnderPinned(pinned)) {
    return { reason: 'credential_not_for_person' };
  }
  return null;
}

/**
 * Decides one `claimWorkItem`: the rows to write and the progress to state,
 * `alreadyHeld`, or exactly one refusal, checked in the spec's order
 * (`specs/plan-command-registry/spec.md`, first requirement).
 *
 * A leaf claims the named steps, or every step that is not done; a non-leaf
 * writes one subtree claim with no step and is refused on `done` alone (D3).
 * Steps the same person and run already hold are skipped, and a claim whose
 * every step is so held answers `alreadyHeld` (and so assigns nothing, even
 * with `assign`). All or none otherwise: one step
 * held by anybody else refuses the whole claim.
 *
 * `inside_subtree_claim` precedes `overlaps_subtree_claim`, so an ancestor's
 * foreign subtree claim answers the former on a non-leaf as well; the latter
 * fires for descendants.
 *
 * Occupancy (`wbs-resources` R3, R4) comes after `already_claimed` and before
 * `inside_subtree_claim`, in this order: `below_declared_demand` when
 * `resources` asks less than the leaf declares, `below_held_occupancy` when it
 * asks less than the leaf's standing occupancy, then `resources_exhausted` from
 * {@link refuseOccupancy}. A leaf's first claim acquires its whole vector. A
 * claim on a leaf some claim already holds copies the standing occupancy and
 * acquires nothing more unless `resources` asks more: the units above the
 * standing copy are acquired through the same check, or the claim is refused
 * `resources_exhausted`; the leaf then holds its largest standing copy.
 *
 * Beyond the spec's list: steps named on a non-leaf answer `steps_on_subtree`
 * (a subtree claim has no step), `resources` named on a non-leaf answer
 * `resources_on_subtree` (a subtree claim acquires nothing), and a leaf of a
 * project with no steps answers `no_steps`. The same holder repeating its claim under another parent answers
 * `already_claimed` naming itself, as another run does: the chain it asks for
 * is not the one held.
 *
 * @throws when a named step is not one of the target's steps, or no step is
 * named in an empty list: the command validates both before deciding.
 */
export function decideClaim(request: ClaimRequest): ClaimDecision {
  const { target, caller, claimant, claims } = request;
  if (request.stepIds?.length === 0) throw new Error('a claim names no steps');
  const parentChain = chainOf(request.parentClaim, claims);
  const identity = refuseIdentity(caller, claimant, (pinned) =>
    parentChain.some((each) => each.personId === pinned),
  );
  if (identity !== null) return refused(identity);

  if (request.parentClaimId !== null) {
    const parent = request.parentClaim;
    if (parent?.id !== request.parentClaimId) return refused({ reason: 'parent_claim_unknown' });
    // Proof: with this account check removed, `parent_claim_foreign: the parent
    // was written by another account` claimed; watched 2026-10-19.
    if (parent.accountId !== caller.accountId) return refused({ reason: 'parent_claim_foreign' });
    if (!target.ancestorIds.includes(parent.workItemId)) {
      return refused({ reason: 'parent_claim_not_ancestor' });
    }
  }

  if (!target.isLeaf && request.stepIds !== null) return refused({ reason: 'steps_on_subtree' });
  // Proof: with this refusal removed, `acquires nothing on a subtree claim and
  // refuses resources named on one` (claim-occupancy.test.ts) claimed the
  // subtree and dropped the ask; watched 2026-10-20.
  if (!target.isLeaf && request.resources !== null) {
    return refused({ reason: 'resources_on_subtree' });
  }
  if (target.status === 'done') return refused({ reason: 'item_done' });
  if (target.isLeaf && target.steps.length === 0) return refused({ reason: 'no_steps' });
  if (target.isLeaf && !isStartableStatus(target.status)) {
    return refused({ reason: 'not_startable', status: target.status });
  }

  const sameHolder = (each: Claim): boolean =>
    each.personId === claimant.personId &&
    each.runId === request.runId &&
    each.parentClaimId === request.parentClaimId;
  const onTarget = claims.filter((each) => each.workItemId === target.workItemId);

  let wanted: (string | null)[];
  if (target.isLeaf) {
    const progressOf = new Map(target.steps.map((each) => [each.stepId, each.progress]));
    if (request.stepIds === null) {
      wanted = target.steps.filter((each) => each.progress !== 'done').map((each) => each.stepId);
      if (wanted.length === 0) return refused({ reason: 'item_done' });
    } else {
      for (const stepId of request.stepIds) {
        if (!progressOf.has(stepId)) throw new Error(`step ${stepId} is not a step of this leaf`);
      }
      const done = request.stepIds.filter((stepId) => progressOf.get(stepId) === 'done');
      if (done.length > 0) return refused({ reason: 'step_done', stepIds: done });
      wanted = [...new Set(request.stepIds)];
    }
  } else {
    wanted = [null];
  }

  const holding = (stepId: string | null): Claim | undefined =>
    onTarget.find((each) => each.stepId === stepId);
  const others = wanted
    .map(holding)
    .filter((each): each is Claim => each !== undefined && !sameHolder(each));
  // Proof: with this check moved below the subtree check, `orders
  // already_claimed before inside_subtree_claim` answered inside_subtree_claim;
  // watched 2026-10-19.
  if (others.length > 0) {
    return refused({ reason: 'already_claimed', holders: others.map(holderOf) });
  }
  const free = wanted.filter((stepId) => holding(stepId) === undefined);
  if (free.length === 0) return { kind: 'alreadyHeld' };

  let occupancy: readonly ResourceUnits[] = [];
  let acquired: readonly ResourceUnits[] = [];
  if (target.isLeaf) {
    const asked = askedUnitsOf(request.demand, request.resources);
    if (!Array.isArray(asked)) return refused(asked);
    // A held leaf's later claim starts from the standing copy, not the
    // declared demand, and acquires only what its ask adds above it.
    // Proof: with `onTarget.length > 0` replaced by `false`, `a second claim on
    // another step of the leaf acquires nothing` (claim-occupancy.test.ts)
    // answered the demand as acquired again; watched 2026-10-20.
    const held = onTarget.length > 0 ? leafOccupancyOf(request.occupancy, target.workItemId) : [];
    const carried = onTarget.length > 0 ? expandedUnitsOf(held, request.resources) : asked;
    if (!Array.isArray(carried)) return refused(carried);
    const exhausted = refuseOccupancy({
      workItemId: target.workItemId,
      asked: carried,
      capacities: request.capacities,
      occupancy: request.occupancy,
      directoryCapacities: request.directoryCapacities,
      organizationOccupied: request.organizationOccupied,
    });
    if (exhausted !== null) return refused(exhausted);
    occupancy = carried;
    acquired = acquiredUnitsOf(held, carried);
  }

  const delegatedFrom = new Set(parentChain.map((each) => each.id));
  const foreignSubtree = (each: Claim): boolean =>
    each.stepId === null && each.personId !== claimant.personId && !delegatedFrom.has(each.id);
  const ancestors = new Set(target.ancestorIds);
  const above = claims.find((each) => ancestors.has(each.workItemId) && foreignSubtree(each));
  // Proof: with this check removed, `inside_subtree_claim: a stranger claims
  // inside a claimed subtree` claimed; watched 2026-10-19.
  if (above !== undefined)
    return refused({ reason: 'inside_subtree_claim', holder: holderOf(above) });
  if (!target.isLeaf) {
    const descendants = new Set(target.descendantIds);
    const below = claims.find((each) => descendants.has(each.workItemId) && foreignSubtree(each));
    if (below !== undefined) {
      return refused({ reason: 'overlaps_subtree_claim', holder: holderOf(below) });
    }
  }

  const progressOf = new Map(target.steps.map((each) => [each.stepId, each.progress]));
  return {
    kind: 'claim',
    drafts: free.map((stepId) => ({
      workItemId: target.workItemId,
      stepId,
      personId: claimant.personId,
      runId: request.runId,
      parentClaimId: request.parentClaimId,
    })),
    stateInProgress: free.filter(
      (stepId): stepId is string => stepId !== null && progressOf.get(stepId) === 'unknown',
    ),
    // Proof: with `free` replaced by `[]` here, `assigns exactly the steps it
    // claims` and the claim-and-assign property in claim.test.ts failed; watched 2026-10-20.
    assignStepIds: request.assign ? free.filter((stepId): stepId is string => stepId !== null) : [],
    occupancy,
    acquired,
  };
}

export interface ReleaseRequest {
  readonly target: { readonly workItemId: string; readonly isLeaf: boolean };
  readonly caller: ClaimCaller;
  readonly claimant: Claimant;
  /** The steps named, or null for every claim of the person on the target. */
  readonly stepIds: readonly string[] | null;
  /** Every claim in force on the target, its ancestors and its descendants. */
  readonly claims: readonly Claim[];
}

export type ReleaseRefusal =
  | { readonly reason: 'steps_on_subtree' }
  | { readonly reason: 'person_not_bound' }
  | { readonly reason: 'credential_not_for_person' }
  | { readonly reason: 'not_claimed_by' };

export type ReleaseDecision =
  | { readonly kind: 'release'; readonly claims: readonly Claim[] }
  | { readonly kind: 'refused'; readonly refusal: ReleaseRefusal };

/**
 * Decides one `releaseWorkItem`: the claims to remove, whole, so the journal
 * can put them back. On a leaf, the person's claims on the named steps or on
 * every step; on a non-leaf, the person's subtree claim and every claim that
 * names it as parent, transitively (D8). Progress is not the decision's: a
 * release never changes it.
 */
export function decideRelease(request: ReleaseRequest): ReleaseDecision {
  const { target, claimant, claims } = request;
  const own = claims.filter(
    (each) =>
      each.workItemId === target.workItemId &&
      each.personId === claimant.personId &&
      (target.isLeaf
        ? each.stepId !== null &&
          (request.stepIds === null || request.stepIds.includes(each.stepId))
        : each.stepId === null),
  );
  const removed = [...own];
  const taken = new Set(own.map((each) => each.id));
  // Proof: with the cascade loop removed, `cascades a subtree release through
  // delegated claims, transitively` released the subtree claim alone; watched 2026-10-19.
  for (let grew = !target.isLeaf; grew;) {
    grew = false;
    for (const each of claims) {
      if (!taken.has(each.id) && each.parentClaimId !== null && taken.has(each.parentClaimId)) {
        taken.add(each.id);
        removed.push(each);
        grew = true;
      }
    }
  }
  const identity = refuseIdentity(
    request.caller,
    claimant,
    (pinned) =>
      removed.length > 0 &&
      removed.every((each) => chainOf(each, claims).some((link) => link.personId === pinned)),
  );
  if (identity !== null) return { kind: 'refused', refusal: identity };
  if (!target.isLeaf && request.stepIds !== null) {
    return { kind: 'refused', refusal: { reason: 'steps_on_subtree' } };
  }
  if (removed.length === 0) return { kind: 'refused', refusal: { reason: 'not_claimed_by' } };
  return { kind: 'release', claims: removed };
}
