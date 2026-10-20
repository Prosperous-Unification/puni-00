import {
  type Assignment,
  type AuthoredDependencyGraph,
  deriveNumbers,
  effectiveTeamsOf,
  indexTree,
  isStartableStatus,
  predecessorLeavesOf,
  type StoredProgress,
  treeOrder,
  type WorkItemStatus,
} from '@wbs/domain';

import type { StampedClaim } from '../../ports/claim-store';
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

/** One leaf with at least one **Startable** step. */
export interface StartableLeaf extends WorkItemAddress {
  /** In project step order. */
  readonly stepIds: string[];
  /** The assignee of each startable step that has one, in step order. */
  readonly assignees: (NamedPerson & { readonly stepId: string })[];
  readonly teams: TeamInForce[];
  /** Predecessor leaves, over every authored dependency, that are not `done`. */
  readonly unfinishedPredecessorIds: string[];
  readonly subtreeClaim: SubtreeClaimAbove | null;
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

/**
 * The startable read: leaves with startable steps, and apart the claimed steps
 * of those leaves and every subtree claim of the project.
 */
export interface StartableWork {
  readonly leaves: StartableLeaf[];
  readonly claimed: ClaimedStep[];
  readonly subtreeClaims: HeldSubtree[];
}

/** Everything {@link findStartableWork} reads, gathered in one admitted read. */
export interface StartableReads {
  readonly rows: readonly LabelledWorkItem[];
  /** Every row's derived status: the folds the table shows (`workItemStatusesOf`). */
  readonly statuses: ReadonlyMap<string, WorkItemStatus>;
  /** The project's steps in project order. */
  readonly stepIds: readonly string[];
  readonly stated: readonly Pick<StoredProgress, 'workItemId' | 'stepId' | 'state'>[];
  readonly claims: readonly StampedClaim[];
  readonly assignments: readonly Assignment[];
  readonly dependencies: AuthoredDependencyGraph;
  /** Display names of every person an assignment or a claim names. */
  readonly personNames: ReadonlyMap<string, string>;
  /** Display names of every team a label names. */
  readonly teamNames: ReadonlyMap<string, string>;
  /** The team to filter by, or null for every leaf. */
  readonly teamId: string | null;
}

/**
 * Which steps may be started now, grouped by leaf in tree order
 * (`wbs-team-claims` spec `startable-work`).
 *
 * A step is startable when its leaf passes {@link isStartableStatus} — the
 * same test a claim applies — its stated progress is not `done`, and no claim
 * holds it. With a team, only leaves whose effective team set holds it are
 * read: the team's **Allotment**. Leaves without a startable step are left out
 * of `leaves`; every claimed step of a leaf the filter keeps is in `claimed`,
 * whatever the leaf's status, so a claim on work that has since stopped shows.
 * A subtree claim never hides a step; the nearest one above the leaf is named,
 * and every subtree claim of the project is listed in `subtreeClaims`, team or
 * not, so one over work that has all stopped still shows. A claimed step carries
 * its assignee beside its holder.
 *
 * @throws when a status, a person name or a team name is missing: each is
 * read from the same observation as the rows, so a miss is corrupt trusted
 * state, never an empty answer.
 */
export function findStartableWork(reads: StartableReads): StartableWork {
  const { rows, statuses, stepIds, teamId } = reads;
  const index = indexTree(rows);
  const order = treeOrder(rows);
  const numbers = deriveNumbers(rows);
  const teams = effectiveTeamsOf(rows);
  const predecessors = predecessorLeavesOf(index, reads.dependencies);
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
      .filter((each) => each.stepId !== null)
      .map((each) => [`${each.workItemId}\u0000${each.stepId ?? ''}`, each]),
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
  const leaves: StartableLeaf[] = [];
  const claimed: ClaimedStep[] = [];
  for (const leafId of leafIds) {
    const row = byId.get(leafId);
    if (row === undefined) throw new Error(`leaf ${leafId} is not a row of this read`);
    const inForce = teams.get(leafId);
    // Proof: with this filter replaced by `false`, `lists a team's allotment,
    // its claimed leaf apart, and omits the unlabelled leaf` and two more cases
    // of startable.test.ts failed; watched 2026-10-19.
    if (teamId !== null && inForce?.teamIds.includes(teamId) !== true) continue;
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
        // Proof: with `!done.has(key)` removed (a done step counted free),
        // `leaves a done step out and keeps the other` failed; watched 2026-10-20.
        free.push(stepId);
      }
    }
    // Proof: with `statusFor(leafId)` replaced by the stored readiness
    // (`row.readiness ?? 'unknown'`), `leaves a ready leaf behind an unfinished
    // held predecessor out` listed the blocked-by-proxy leaf; watched 2026-10-19.
    if (free.length === 0 || !isStartableStatus(statusFor(leafId))) continue;
    leaves.push({
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
      // Proof: with the `!== 'done'` filter removed, `names the unfinished
      // predecessors of a startable leaf, and drops finished ones` failed;
      // watched 2026-10-20.
      unfinishedPredecessorIds: [...(predecessors.get(leafId) ?? [])]
        .filter((each) => statusFor(each) !== 'done')
        .sort(byPlace),
      subtreeClaim: nearestSubtreeClaim(row.parentId, byId, subtreeClaims, personOf),
    });
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
  return { leaves, claimed, subtreeClaims: held };
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
