import { type Assignment, deriveNumbers, treeOrder } from '@wbs/domain';

import type { StampedClaim } from '../../ports/claim-store';
import type { LabelledWorkItem } from '../../ports/work-item-store';
import type { NamedPerson, WorkItemAddress } from './startable';

/** One step a person is assigned to: the plan of who does it. */
export interface AssignedStep extends WorkItemAddress {
  readonly stepId: string;
}

/**
 * One claim a person holds: a step of a leaf, or (`stepId` null) the subtree
 * of a non-leaf, with the run and the subtree claim it is delegated under.
 */
export interface HeldClaim extends WorkItemAddress {
  readonly stepId: string | null;
  readonly claimId: string;
  readonly runId: string | null;
  readonly parentClaimId: string | null;
  /** When the claim was written, epoch milliseconds. */
  readonly claimedAt: number;
  /** When its lease runs out, epoch milliseconds; null for a claim no agent renews. */
  readonly leaseExpiresAt: number | null;
}

/** What one person holds in one work package: assignments and claims, apart (D1). */
export interface PersonWork {
  readonly person: NamedPerson;
  readonly assignments: AssignedStep[];
  readonly claims: HeldClaim[];
}

/** Everything {@link findPersonWork} reads, gathered in one admitted read. */
export interface PersonWorkReads {
  readonly person: NamedPerson;
  readonly rows: readonly LabelledWorkItem[];
  /** Every actual leaf's resolved execution order, including explicit empty lists. */
  readonly leafSteps: ReadonlyMap<string, readonly string[]>;
  /** The work package's assignments; other people's are left out here. */
  readonly assignments: readonly Assignment[];
  /** The work package's claims; other people's are left out here. */
  readonly claims: readonly StampedClaim[];
}

/**
 * One person's assignments and claims in one work package
 * (`wbs-resources` spec `assignee-management`), each in tree order and then
 * the addressed leaf's step order, a subtree claim before its item's step claims. A claim
 * is listed whether or not the person is also assigned there, and the other
 * way round: the two are separate records.
 *
 * @throws when an assignment or a claim sits on a row, or names a step, this
 * read does not hold: both come from the same observation as the rows, so a
 * miss is corrupt trusted state.
 */
export function findPersonWork(reads: PersonWorkReads): PersonWork {
  const { person, rows } = reads;
  const numbers = deriveNumbers(rows);
  const order = treeOrder(rows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const stepPlaces = new Map(
    [...reads.leafSteps].map(([id, steps]) => [
      id,
      new Map(steps.map((stepId, index) => [stepId, index])),
    ]),
  );
  const addressOf = (workItemId: string): WorkItemAddress => {
    const row = byId.get(workItemId);
    const number = numbers.get(workItemId);
    if (row === undefined || number === undefined)
      throw new Error(`work item ${workItemId} is not a row of this read`);
    return { workItemId, number, numberIsFrozen: row.frozenNumber !== null, name: row.name };
  };
  /** Tree place, then step place (-1 for a subtree claim); throws on a row or step not read. */
  const placeOf = (workItemId: string, stepId: string | null): [number, number] => {
    const place = order.get(workItemId);
    if (place === undefined) throw new Error(`work item ${workItemId} is not a row of this read`);
    if (stepId === null) return [place, -1];
    const step = stepPlaces.get(workItemId)?.get(stepId);
    // Proof: current-execution-fault-person-membership-v1 displayed a package step absent from its addressed leaf when this refusal was removed.
    if (step === undefined)
      throw new Error(`step ${stepId} is not a step of this leaf ${workItemId}`);
    return [place, step];
  };
  const inOrder = <Row extends { workItemId: string; stepId: string | null }>(
    rowsOfPerson: readonly Row[],
  ): Row[] =>
    rowsOfPerson
      .map((each) => ({ each, place: placeOf(each.workItemId, each.stepId) }))
      .toSorted((left, right) => left.place[0] - right.place[0] || left.place[1] - right.place[1])
      .map(({ each }) => each);
  // Proof: with the person filter dropped, `lists one person's assignments and
  // claims, and no one else's` (person-work.test.ts) listed the other
  // assignee's step; watched 2026-10-20.
  const assignments = inOrder(
    reads.assignments.filter((each) => each.personId === person.personId),
  ).map(({ workItemId, stepId }) => ({ ...addressOf(workItemId), stepId }));
  const claims = inOrder(reads.claims.filter((each) => each.personId === person.personId)).map(
    (each) => ({
      ...addressOf(each.workItemId),
      stepId: each.stepId,
      claimId: each.id,
      runId: each.runId,
      parentClaimId: each.parentClaimId,
      claimedAt: each.claimedAt,
      leaseExpiresAt: each.leaseExpiresAt,
    }),
  );
  return { person, assignments, claims };
}
