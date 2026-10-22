import {
  deriveNumbers,
  effectiveTeamsOf,
  type ExecutionPrerequisite,
  freeUnitsOf,
  indexTree,
  isStartableStatus,
  leafOccupancyOf,
  occupancyByResource,
  projectExecutionBlockers,
  refuseOccupancy,
  type Resource,
  type ResourceKind,
  sliceKey,
  treeOrder,
  type WorkItemStatus,
} from '@wbs/domain';

import type { StampedClaim } from '../../ports/claim-store';
import type { ExecutionReads as StartableReads } from '../../ports/execution-read-values';
import type { LabelledWorkItem } from '../../ports/work-item-store';

/** A person as the startable read names them: id and the caller's display name. */
export interface NamedPerson {
  readonly personId: string;
  readonly name: string;
}

/** A team in force on a leaf, and the row whose label puts it there. */
export interface TeamInForce {
  readonly teamId: string;
  readonly name: string;
  /** The leaf itself, or the nearest ancestor stating a team set (`effectiveTeamsOf`). */
  readonly fromId: string;
}

/** The subtree claim nearest above a leaf, and who holds it. */
export interface SubtreeClaimAbove {
  readonly claimId: string;
  readonly workItemId: string;
  readonly holder: NamedPerson;
  readonly runId: string | null;
  readonly parentClaimId: string | null;
}

/** How a work item is addressed: its frozen number, or the derived one when none is frozen. */
export interface WorkItemAddress {
  readonly workItemId: string;
  readonly number: string;
  readonly numberIsFrozen: boolean;
  readonly name: string;
}

/** One leaf with at least one **Startable** step, before its demand is weighed. */
export interface LeafSteps extends WorkItemAddress {
  /** In project step order. */
  readonly stepIds: string[];
  /** The assignee of each startable step that has one, in step order. */
  readonly assignees: (NamedPerson & { readonly stepId: string })[];
  readonly teams: TeamInForce[];
  /** Predecessor leaves, over every authored dependency, that are not `done`. */
  readonly unfinishedPredecessorIds: string[];
  readonly subtreeClaim: SubtreeClaimAbove | null;
}

/** A leaf whose startable steps fit now: its demand passes {@link refuseOccupancy}. */
export interface StartableLeaf extends LeafSteps {
  readonly fits: true;
}

/**
 * A leaf whose steps are otherwise startable but whose demand the project's
 * free units do not cover, listed apart from {@link StartableWork.leaves}.
 */
export interface UnfitLeaf extends LeafSteps {
  readonly fits: false;
  readonly exhausted: Shortfall;
}

/**
 * The first resource, in resource-id order, a leaf's demand does not fit:
 * `free` is the stated capacity minus what the project's other leaves hold,
 * and `shortfall` is `asked - free`.
 */
export interface Shortfall {
  readonly resourceId: string;
  readonly name: string;
  readonly unitLabel: string;
  readonly asked: number;
  readonly free: number;
  readonly shortfall: number;
}

/**
 * One resource the project states a capacity for, with the units its leaves'
 * claims hold and the units left. `free` reads below 0 when a capacity was
 * lowered under units already held. An unstated resource is not listed: it
 * constrains nothing (`docs/capacity.md`).
 */
export interface ResourceFree {
  readonly resourceId: string;
  readonly name: string;
  readonly unitLabel: string;
  readonly kind: ResourceKind;
  readonly capacity: number;
  readonly occupied: number;
  readonly free: number;
}

/** A claimed step of a leaf the read covers, so an operator sees silent claims. */
export interface ClaimedStep extends WorkItemAddress {
  readonly stepId: string;
  readonly claimId: string;
  readonly holder: NamedPerson;
  /** The step's assignee, shown beside the claim and never in its place (D1). */
  readonly assignee: NamedPerson | null;
  readonly runId: string | null;
  readonly parentClaimId: string | null;
  /** When the claim was written, epoch milliseconds. */
  readonly claimedAt: number;
}

/** A subtree claim in force anywhere in the project, so a silent one shows too. */
export interface HeldSubtree extends WorkItemAddress {
  readonly claimId: string;
  readonly holder: NamedPerson;
  readonly runId: string | null;
  readonly parentClaimId: string | null;
  /** When the claim was written, epoch milliseconds. */
  readonly claimedAt: number;
}

/** Current prerequisite truth for a target step; started work remains observable after upstream edits. */
export interface StepPrerequisites {
  readonly workItemId: string;
  readonly stepId: string;
  readonly started: boolean;
  readonly canStart: boolean;
  readonly canFinish: boolean;
  readonly startBlockers: ExecutionPrerequisite[];
  readonly finishBlockers: ExecutionPrerequisite[];
}

/**
 * The startable read: leaves with startable steps that fit now, and apart the
 * leaves that do not fit, the claimed steps of those leaves and every subtree
 * claim of the project, with the project's free units per resource.
 */
export interface StartableWork {
  readonly prerequisites: StepPrerequisites[];
  readonly leaves: StartableLeaf[];
  /** Otherwise startable leaves whose demand exceeds the free units, each with its shortfall. */
  readonly doesNotFit: UnfitLeaf[];
  readonly claimed: ClaimedStep[];
  readonly subtreeClaims: HeldSubtree[];
  /** Every stated capacity of the project, in resource-id order. */
  readonly resources: ResourceFree[];
  /**
   * Occupancy is counted within this project only (`wbs-resources` R3): a
   * claim in another project on the same physical host is not subtracted.
   */
  readonly occupancyScope: 'project';
}

export type { ExecutionReads as StartableReads } from '../../ports/execution-read-values';

/**
 * Which steps may be started now, grouped by leaf in tree order
 * (`wbs-team-claims` spec `startable-work`).
 *
 * A step is startable when its leaf passes {@link isStartableStatus} — the
 * same test a claim applies — its stated progress is not `done`, and no claim
 * holds it. An unstarted step must also pass its resolved execution prerequisites;
 * prior actual start evidence keeps continuing work visible after upstream edits. With a team, only leaves whose effective team set holds it are
 * read: the team's **Allotment**. Leaves without a startable step are left out
 * of `leaves`; every claimed step of a leaf the filter keeps is in `claimed`,
 * whatever the leaf's status, so a claim on work that has since stopped shows.
 * A subtree claim never hides a step; the nearest one above the leaf is named,
 * and every subtree claim of the project is listed in `subtreeClaims`, team or
 * not, so one over work that has all stopped still shows. A claimed step carries
 * its assignee beside its holder.
 *
 * Fit (`wbs-resources` R6): a leaf with startable steps is in `leaves` when
 * what a claim on it would carry with no `resources` ask passes
 * {@link refuseOccupancy} against the project's stated capacities and
 * occupancy, and in `doesNotFit` with the first exhausted resource otherwise.
 * An unheld leaf carries its declared demand; a leaf some claim already holds
 * carries its standing copy, so it always fits. An unstated capacity never excludes; a stated 0 excludes any
 * demand on it. Occupancy is the project's only.
 *
 * @throws when required execution evidence, a status, a person name, a team name or a stated capacity's
 * resource is missing: each is read from the same observation as the rows, so
 * a miss is corrupt trusted state, never an empty answer.
 */
export function findStartableWork(reads: StartableReads): StartableWork {
  const { rows, statuses, stepIds, teamId } = reads;
  const index = indexTree(rows);
  const order = treeOrder(rows);
  const numbers = deriveNumbers(rows);
  const teams = effectiveTeamsOf(rows);
  const predecessors = reads.predecessorIdsByLeaf;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const statusFor = (id: string): WorkItemStatus => {
    const status = statuses.get(id);
    if (status === undefined) throw new Error(`work item ${id} has no derived status`);
    return status;
  };
  const personOf = (personId: string): NamedPerson => {
    const name = reads.personNames.get(personId);
    if (name === undefined) throw new Error(`person ${personId} has no name in this read`);
    return { personId, name };
  };
  const addressOf = (row: LabelledWorkItem): WorkItemAddress => {
    const number = numbers.get(row.id);
    if (number === undefined) throw new Error(`work item ${row.id} has no number`);
    return {
      workItemId: row.id,
      number,
      numberIsFrozen: row.frozenNumber !== null,
      name: row.name,
    };
  };
  const done = new Set(
    reads.stated
      .filter((each) => each.state === 'done')
      .map((each) => `${each.workItemId}\u0000${each.stepId}`),
  );
  const stepClaims = new Map(
    reads.claims
      .filter((each): each is StampedClaim & { readonly stepId: string } => each.stepId !== null)
      .map((each) => [`${each.workItemId}\u0000${each.stepId}`, each]),
  );
  const subtreeClaims = new Map(
    reads.claims.filter((each) => each.stepId === null).map((each) => [each.workItemId, each]),
  );
  const assignees = new Map(
    reads.assignments.map((each) => [`${each.workItemId}\u0000${each.stepId}`, each.personId]),
  );

  const assigneeOf = (workItemId: string, stepId: string): NamedPerson | null => {
    const personId = assignees.get(`${workItemId}\u0000${stepId}`);
    return personId === undefined ? null : personOf(personId);
  };
  const placeOf = (id: string): number => {
    const place = order.get(id);
    if (place === undefined) throw new Error(`work item ${id} has no place in tree order`);
    return place;
  };
  const byPlace = (left: string, right: string): number => placeOf(left) - placeOf(right);
  const leafIds = [...index.leafIds].sort(byPlace);
  const resourceOf = (resourceId: string): Resource => {
    const resource = reads.resources.get(resourceId);
    if (resource === undefined) throw new Error(`resource ${resourceId} is not in this read`);
    return resource;
  };
  const demandOf = new Map<string, { resourceId: string; units: number }[]>();
  for (const { workItemId, resourceId, units } of reads.demands)
    demandOf.set(workItemId, [...(demandOf.get(workItemId) ?? []), { resourceId, units }]);
  const claimedLeafIds = new Set(reads.claims.map((each) => each.workItemId));
  const exhaustedOf = (workItemId: string): Shortfall | null => {
    const refusal = refuseOccupancy({
      workItemId,
      // As `decideClaim` carries it with no `resources` ask: a held leaf's
      // later claim carries its standing copy (`expandedUnitsOf(held, null)`),
      // so it always fits; an unheld leaf asks its declared demand.
      // Proof: with the declared demand asked of a held leaf too, `fits a
      // held leaf whose demand was raised past the free units`
      // (startable.test.ts) listed it apart; watched 2026-10-20.
      asked: claimedLeafIds.has(workItemId)
        ? leafOccupancyOf(reads.occupancy, workItemId)
        : (demandOf.get(workItemId) ?? []),
      capacities: reads.capacities,
      occupancy: reads.occupancy,
    });
    if (refusal === null) return null;
    const { name, unitLabel } = resourceOf(refusal.resourceId);
    return {
      resourceId: refusal.resourceId,
      name,
      unitLabel,
      asked: refusal.asked,
      free: refusal.free,
      shortfall: refusal.asked - refusal.free,
    };
  };
  const prerequisites: StepPrerequisites[] = [];
  const leaves: StartableLeaf[] = [];
  const doesNotFit: UnfitLeaf[] = [];
  const claimed: ClaimedStep[] = [];
  for (const leafId of leafIds) {
    const row = byId.get(leafId);
    if (row === undefined) throw new Error(`leaf ${leafId} is not a row of this read`);
    const inForce = teams.get(leafId);
    // Proof: with this filter replaced by `false`, `lists a team's allotment,
    // its claimed leaf apart, and omits the unlabelled leaf` and two more cases
    // of startable.test.ts failed; watched 2026-10-19.
    if (teamId !== null && inForce?.teamIds.includes(teamId) !== true) continue;
    for (const stepId of stepIds) {
      const key = sliceKey(leafId, stepId);
      const eligibility = reads.eligibilityByNode.get(key);
      const evidence = reads.evidenceByNode.get(key);
      if (eligibility === undefined || evidence === undefined)
        throw new Error(`missing execution reading ${key}`);
      // Proof: dropping finishBlockers failed mounted `FF permits start` (task-6-3-admission-proofs/finish-projection.log).
      prerequisites.push({
        workItemId: leafId,
        stepId,
        started: evidence.started,
        canStart: eligibility.canStart,
        canFinish: eligibility.canFinish,
        startBlockers: projectExecutionBlockers(eligibility.startBlockers),
        finishBlockers: projectExecutionBlockers(eligibility.finishBlockers),
      });
    }
    const address = addressOf(row);
    const free: string[] = [];
    for (const stepId of stepIds) {
      const key = `${leafId}\u0000${stepId}`;
      const holding = stepClaims.get(key);
      // Proof: with a held step also counted free, the allotment, no-team and
      // subtree cases of startable.test.ts failed; watched 2026-10-19.
      if (holding !== undefined) {
        claimed.push({
          ...address,
          stepId,
          claimId: holding.id,
          holder: personOf(holding.personId),
          // Proof: with `null` here, `shows a claimed step beside its assignee`
          // failed; watched 2026-10-20.
          assignee: assigneeOf(leafId, stepId),
          runId: holding.runId,
          parentClaimId: holding.parentClaimId,
          claimedAt: holding.claimedAt,
        });
      } else if (!done.has(key)) {
        const nodeKey = sliceKey(leafId, stepId);
        const eligibility = reads.eligibilityByNode.get(nodeKey);
        const evidence = reads.evidenceByNode.get(nodeKey);
        if (eligibility === undefined || evidence === undefined)
          throw new Error(`missing execution reading ${nodeKey}`);
        // Proof: bypassing this filter made mounted `remote unfinished FS` advertise the blocked step (task-6-3-admission-proofs/startable-filter.log).
        if (!evidence.started && !eligibility.canStart) continue;
        // Proof: with `!done.has(key)` removed (a done step counted free),
        // `leaves a done step out and keeps the other` failed; watched 2026-10-20.
        free.push(stepId);
      }
    }
    // Proof: with `statusFor(leafId)` replaced by the stored readiness
    // (`row.readiness ?? 'unknown'`), `leaves a ready leaf behind an unfinished
    // held predecessor out` listed the blocked-by-proxy leaf; watched 2026-10-19.
    if (free.length === 0 || !isStartableStatus(statusFor(leafId))) continue;
    const steps: LeafSteps = {
      ...address,
      stepIds: free,
      assignees: free.flatMap((stepId) => {
        const assignee = assigneeOf(leafId, stepId);
        return assignee === null ? [] : [{ stepId, ...assignee }];
      }),
      teams:
        inForce === undefined
          ? []
          : inForce.teamIds.map((each) => {
              const name = reads.teamNames.get(each);
              if (name === undefined) throw new Error(`team ${each} has no name in this read`);
              return { teamId: each, name, fromId: inForce.fromId };
            }),
      // A leaf with no authored predecessor is absent from the map: none.
      // Proof: with the `!== 'done'` filter removed, the predecessor listing
      // test (then named `names the unfinished predecessors...`) failed;
      // watched 2026-10-20.
      unfinishedPredecessorIds: [...(predecessors.get(leafId) ?? [])].filter(
        (each) => statusFor(each) !== 'done',
      ),
      subtreeClaim: nearestSubtreeClaim(row.parentId, byId, subtreeClaims, personOf),
    };
    const exhausted = exhaustedOf(leafId);
    // Proof: with `exhaustedOf` answering null, `lists a leaf whose demand
    // exceeds the free units apart, with its shortfall`, the stated-0 and the
    // team-filter fit cases (startable.test.ts) failed; watched 2026-10-20.
    if (exhausted === null) leaves.push({ ...steps, fits: true });
    else doesNotFit.push({ ...steps, fits: false, exhausted });
  }
  // Proof: answering `[]` in place of this list failed `lists a silent subtree
  // claim whose every leaf has stopped` and the subtree-holder case; watched 2026-10-20.
  const held: HeldSubtree[] = [...subtreeClaims.values()]
    .sort((left, right) => byPlace(left.workItemId, right.workItemId))
    .map((holding) => {
      const row = byId.get(holding.workItemId);
      if (row === undefined) throw new Error(`claim ${holding.id} is on no row of this read`);
      return {
        ...addressOf(row),
        claimId: holding.id,
        holder: personOf(holding.personId),
        runId: holding.runId,
        parentClaimId: holding.parentClaimId,
        claimedAt: holding.claimedAt,
      };
    });
  const occupied = new Map(
    occupancyByResource(reads.occupancy).map((each) => [each.resourceId, each.occupied]),
  );
  const capacityOf = new Map(reads.capacities.map((each) => [each.resourceId, each.units]));
  const resources = freeUnitsOf(reads.capacities, reads.occupancy).map(
    ({ resourceId, units }): ResourceFree => {
      const { name, unitLabel, kind } = resourceOf(resourceId);
      const capacity = capacityOf.get(resourceId);
      if (capacity === undefined) throw new Error(`resource ${resourceId} has no stated capacity`);
      return {
        resourceId,
        name,
        unitLabel,
        kind,
        capacity,
        occupied: occupied.get(resourceId) ?? 0,
        free: units,
      };
    },
  );
  return {
    prerequisites,
    leaves,
    doesNotFit,
    claimed,
    subtreeClaims: held,
    resources,
    occupancyScope: 'project',
  };
}

/** The subtree claim on the nearest ancestor holding one, walking up from `parentId`. */
function nearestSubtreeClaim(
  parentId: string | null,
  byId: ReadonlyMap<string, LabelledWorkItem>,
  subtreeClaims: ReadonlyMap<string, StampedClaim>,
  personOf: (personId: string) => NamedPerson,
): SubtreeClaimAbove | null {
  // No cycle guard: `deriveNumbers` has already thrown for a parent cycle or an
  // orphan, so this walk ends at a root.
  for (let at = parentId; at !== null;) {
    const row = byId.get(at);
    if (row === undefined) throw new Error(`work item ${at} is not a row of this read`);
    const holding = subtreeClaims.get(at);
    if (holding !== undefined) {
      return {
        claimId: holding.id,
        workItemId: at,
        holder: personOf(holding.personId),
        runId: holding.runId,
        parentClaimId: holding.parentClaimId,
      };
    }
    at = row.parentId;
  }
  return null;
}
