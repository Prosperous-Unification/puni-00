import {
  type Claim,
  readStoredAttempt,
  type StepAttemptRecord,
  type StoredAttempt,
} from '@wbs/core';
import type { ResourceUse } from '@wbs/domain';
import { sql } from 'drizzle-orm';

import type { Drizzle } from './db';
import { readStoredResourceUse } from './resource-use-history';

type Writer = Pick<Drizzle, 'all' | 'run'>;
type Location =
  | { readonly kind: 'unassociated' }
  | {
      readonly kind: 'associated';
      readonly claims: readonly string[];
      readonly attempt: string | null;
    };
type ClaimMatch = Pick<Claim, 'workItemId' | 'personId' | 'runId' | 'stepId'>;
type ClaimAddress = ClaimMatch & Pick<Claim, 'id'>;
export interface ResourceUseMove {
  readonly workPackageId: string;
  readonly fromWorkItemId: string;
  readonly toWorkItemId: string;
  readonly claimIds: readonly string[];
  readonly attempts: readonly Pick<
    StoredAttempt,
    'stepId' | 'attemptNumber' | 'executorPersonId'
  >[];
}

function readId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('resource use location has invalid ' + label);
  return value;
}

function readActiveUsesIn(db: Writer, workPackageId: string): ResourceUse[] {
  return db
    .all<{
      id: unknown;
      workPackageId: unknown;
      workItemId: unknown;
      personId: unknown;
      agentRun: unknown;
      stepId: unknown;
      attemptNumber: unknown;
      snapshot: unknown;
    }>(
      sql`SELECT id,work_package_id AS "workPackageId",work_item_id AS "workItemId",
    responsible_person_id AS "personId",agent_run AS "agentRun",step_id AS "stepId",
    attempt_number AS "attemptNumber",snapshot FROM resource_use
    WHERE work_package_id=${workPackageId} AND state='active'`,
    )
    .map((row) => {
      if (typeof row.snapshot !== 'string')
        throw new Error('resource use lifecycle snapshot is not stored JSON text');
      const snapshot: unknown = JSON.parse(row.snapshot);
      const use = readStoredResourceUse(snapshot);
      if (
        use.state !== 'active' ||
        use.id !== row.id ||
        use.workPackageId !== row.workPackageId ||
        use.workPackageId !== workPackageId ||
        use.workItemId !== row.workItemId ||
        use.responsiblePersonId !== row.personId ||
        use.agentRun !== row.agentRun ||
        use.stepId !== row.stepId ||
        use.attemptNumber !== row.attemptNumber
      )
        throw new Error(
          'resource use ' + use.id + ' projection differs from its retained snapshot',
        );
      return use;
    });
}

/** A missing relation is corrupted required state; only an explicit marker models an unassociated broad report. */
export function readResourceUseLocationIn(db: Writer, use: ResourceUse): Location {
  if ((use.stepId === null) !== (use.attemptNumber === null))
    throw new Error('resource use ' + use.id + ' has an incomplete attempt identity');
  const rows = db.all<{ kind: unknown; workPackageId: unknown; workItemId: unknown }>(sql`
    SELECT kind,work_package_id AS "workPackageId",work_item_id AS "workItemId"
    FROM resource_use_location WHERE use_id=${use.id}`);
  if (rows.length === 0)
    throw new Error('resource use ' + use.id + ' has no required lifecycle location');
  const claims: string[] = [],
    attempts: string[] = [];
  let isUnassociated = false;
  for (const row of rows) {
    if (row.workPackageId !== use.workPackageId)
      throw new Error('resource use ' + use.id + ' has a foreign lifecycle location');
    if (row.kind === 'unassociated') {
      if (isUnassociated || row.workItemId !== null)
        throw new Error('resource use ' + use.id + ' has malformed unassociated state');
      isUnassociated = true;
    } else if (row.kind === 'claim' || row.kind === 'attempt') {
      const id = readId(row.workItemId, 'work item');
      const stored = db.all<{ workPackageId: unknown }>(
        sql`SELECT work_package_id AS "workPackageId" FROM work_item WHERE id=${id}`,
      );
      if (stored.length > 1 || stored.some((work) => work.workPackageId !== use.workPackageId))
        throw new Error('resource use ' + use.id + ' lifecycle address names a foreign work item');
      const selected = row.kind === 'claim' ? claims : attempts;
      if (selected.includes(id))
        throw new Error('resource use ' + use.id + ' duplicates a lifecycle address');
      selected.push(id);
    } else throw new Error('resource use ' + use.id + ' has an unknown lifecycle location kind');
  }
  if (isUnassociated) {
    if (rows.length !== 1 || use.stepId !== null || use.attemptNumber !== null)
      throw new Error('resource use ' + use.id + ' has inconsistent unassociated state');
    return { kind: 'unassociated' };
  }
  if (claims.length === 0 || attempts.length !== (use.stepId === null ? 0 : 1))
    throw new Error('resource use ' + use.id + ' has incomplete lifecycle addresses');
  const attempt = attempts.at(0);
  if (use.stepId !== null && attempt === undefined)
    throw new Error('resource use ' + use.id + ' lost its attempt location');
  return { kind: 'associated', claims, attempt: attempt ?? null };
}

function readPackageIn(db: Writer, workItemId: string): string {
  const rows = db.all<{ workPackageId: unknown }>(
    sql`SELECT work_package_id AS "workPackageId" FROM work_item WHERE id=${workItemId}`,
  );
  const row = rows.at(0);
  if (rows.length !== 1 || row === undefined)
    throw new Error('resource lifecycle work item is absent: ' + workItemId);
  return readId(row.workPackageId, 'work package');
}

function readClaimsIn(db: Writer, workPackageId: string): ClaimAddress[] {
  return db
    .all<{ id: unknown; workItemId: unknown; personId: unknown; runId: unknown; stepId: unknown }>(
      sql`
    SELECT c.id,c.work_item_id AS "workItemId",c.person_id AS "personId",c.run_id AS "runId",c.step_id AS "stepId"
    FROM claim c JOIN work_item w ON w.id=c.work_item_id WHERE w.work_package_id=${workPackageId}`,
    )
    .map((row) => ({
      id: readId(row.id, 'claim'),
      workItemId: readId(row.workItemId, 'claim work item'),
      personId: readId(row.personId, 'claim person'),
      runId: row.runId === null ? null : readId(row.runId, 'claim run'),
      stepId: row.stepId === null ? null : readId(row.stepId, 'claim step'),
    }));
}

function matchesClaim(use: ResourceUse, claim: ClaimMatch): boolean {
  return (
    claim.runId !== null &&
    claim.personId === use.responsiblePersonId &&
    claim.runId === use.agentRun &&
    (use.stepId === null || claim.stepId === null || use.stepId === claim.stepId)
  );
}

/** Retired resource-use addresses may outlive their work item; they cannot enroll a new current claim. Cyclic or cross-package live ancestry throws. */
function coversIn(
  db: Writer,
  workPackageId: string,
  ancestor: string,
  descendant: string,
): boolean {
  const visited = new Set<string>();
  let current: string | null = descendant;
  while (current !== null) {
    if (visited.has(current)) throw new Error('resource lifecycle ancestry contains a cycle');
    visited.add(current);
    const row = db
      .all<{ parentId: unknown; workPackageId: unknown }>(
        sql`
      SELECT parent_id AS "parentId",work_package_id AS "workPackageId" FROM work_item WHERE id=${current}`,
      )
      .at(0);
    if (row === undefined) return false;
    if (row.workPackageId !== workPackageId)
      throw new Error('resource lifecycle ancestry crosses a work package');
    if (current === ancestor) return true;
    current = row.parentId === null ? null : readId(row.parentId, 'parent');
  }
  return false;
}

function addLocationIn(
  db: Writer,
  use: ResourceUse,
  kind: 'claim' | 'attempt',
  workItemId: string,
): void {
  db.run(sql`INSERT INTO resource_use_location(use_id,kind,work_package_id,work_item_id)
    SELECT ${use.id},${kind},${use.workPackageId},${workItemId}
    WHERE NOT EXISTS(SELECT 1 FROM resource_use_location WHERE use_id=${use.id} AND kind=${kind} AND work_item_id=${workItemId})`);
}

/** Same-writer fresh registration observation; unrelated claims do not veto a newly observed broad report. Historical backfill has a stricter evidence boundary. */
export function prepareResourceUseLocationIn(
  db: Writer,
  use: ResourceUse,
):
  | { readonly kind: 'unassociated' }
  | {
      readonly kind: 'associated';
      readonly claims: readonly string[];
      readonly attempt: string | null;
    } {
  if (readPackageIn(db, use.workItemId) !== use.workPackageId)
    throw new Error('resource registration location is foreign');
  const matching = readClaimsIn(db, use.workPackageId).filter((claim) => matchesClaim(use, claim));
  const claims = matching.filter(
    (claim) =>
      claim.workItemId === use.workItemId ||
      (claim.stepId === null && coversIn(db, use.workPackageId, claim.workItemId, use.workItemId)),
  );
  if (claims.length === 0 && use.stepId === null) {
    return { kind: 'unassociated' };
  }
  return {
    kind: 'associated',
    claims: [
      ...new Set([
        ...claims.map(({ workItemId }) => workItemId),
        ...(use.stepId === null ? [] : [use.workItemId]),
      ]),
    ],
    attempt: use.stepId === null ? null : use.workItemId,
  };
}

/** Publishes an immediately preceding synchronous registration observation in the same transaction as the use and event. */
export function registerResourceUseLocationIn(
  db: Writer,
  use: ResourceUse,
  location: ReturnType<typeof prepareResourceUseLocationIn>,
): void {
  if (location.kind === 'unassociated') {
    db.run(
      sql`INSERT INTO resource_use_location(use_id,kind,work_package_id,work_item_id) VALUES(${use.id},'unassociated',${use.workPackageId},NULL)`,
    );
  } else {
    for (const address of location.claims) addLocationIn(db, use, 'claim', address);
    if (location.attempt !== null) addLocationIn(db, use, 'attempt', location.attempt);
  }
  readResourceUseLocationIn(db, use);
}

/** A newly admitted claim enrolls current locations on its own writer; lease renewal alone does not change an address. */
export function enrollResourceUseClaimIn(db: Writer, claim: ClaimAddress): void {
  if (claim.runId === null) return;
  const workPackageId = readPackageIn(db, claim.workItemId);
  for (const use of readActiveUsesIn(db, workPackageId)) {
    if (!matchesClaim(use, claim)) continue;
    const location = readResourceUseLocationIn(db, use);
    const addresses =
      location.kind === 'unassociated'
        ? [use.workItemId]
        : location.attempt === null
          ? location.claims
          : [...location.claims, location.attempt];
    if (
      !addresses.some(
        (address) =>
          address === claim.workItemId ||
          (claim.stepId === null && coversIn(db, workPackageId, claim.workItemId, address)),
      )
    )
      continue;
    db.run(sql`DELETE FROM resource_use_location WHERE use_id=${use.id} AND kind='unassociated'`);
    addLocationIn(db, use, 'claim', claim.workItemId);
    readResourceUseLocationIn(db, use);
  }
}

/** Moves only explicitly retained live identities. Its caller has already admitted the structural destination on this writer. */
export function moveResourceUseLocationsIn(db: Writer, move: ResourceUseMove): void {
  if (
    readPackageIn(db, move.fromWorkItemId) !== move.workPackageId ||
    readPackageIn(db, move.toWorkItemId) !== move.workPackageId
  )
    throw new Error('resource lifecycle move is outside its work package');
  if (move.fromWorkItemId === move.toWorkItemId) return;
  const claims = readClaimsIn(db, move.workPackageId);
  const moved = new Set(move.claimIds);
  if (
    moved.size !== move.claimIds.length ||
    move.claimIds.some(
      (id) => !claims.some((claim) => claim.id === id && claim.workItemId === move.fromWorkItemId),
    )
  )
    throw new Error('resource lifecycle moved claim census differs');
  for (const use of readActiveUsesIn(db, move.workPackageId)) {
    const location = readResourceUseLocationIn(db, use);
    if (location.kind === 'unassociated') continue;
    const followsAttempt =
      location.attempt === move.fromWorkItemId &&
      move.attempts.some(
        (attempt) =>
          attempt.stepId === use.stepId &&
          attempt.attemptNumber === use.attemptNumber &&
          attempt.executorPersonId === use.responsiblePersonId,
      );
    const followsClaim =
      location.claims.includes(move.fromWorkItemId) &&
      claims.some((claim) => moved.has(claim.id) && matchesClaim(use, claim));
    if (!followsAttempt && !followsClaim) continue;
    addLocationIn(db, use, 'claim', move.toWorkItemId);
    const remains = claims.some(
      (claim) =>
        claim.workItemId === move.fromWorkItemId &&
        !moved.has(claim.id) &&
        matchesClaim(use, claim),
    );
    if (!remains)
      db.run(
        sql`DELETE FROM resource_use_location WHERE use_id=${use.id} AND kind='claim' AND work_item_id=${move.fromWorkItemId}`,
      );
    if (followsAttempt)
      db.run(
        sql`UPDATE resource_use_location SET work_item_id=${move.toWorkItemId} WHERE use_id=${use.id} AND kind='attempt' AND work_item_id=${move.fromWorkItemId}`,
      );
    readResourceUseLocationIn(db, use);
  }
}

/** Selects by mutable current address, preserving exact person/run/step matching and immutable public address filtering elsewhere. */
export function resourceUsesForClaimIn(db: Writer, claim: ClaimMatch): readonly string[] {
  if (claim.runId === null) return [];
  const workPackageId = readPackageIn(db, claim.workItemId);
  return readActiveUsesIn(db, workPackageId)
    .filter((use) => {
      if (!matchesClaim(use, claim)) return false;
      const location = readResourceUseLocationIn(db, use);
      return location.kind === 'associated' && location.claims.includes(claim.workItemId);
    })
    .map(({ id }) => id);
}

/** The final matching claim is global across this use's retained split locations, never just its immutable registration address. */
export function hasRemainingResourceUseClaimIn(db: Writer, use: ResourceUse): boolean {
  const location = readResourceUseLocationIn(db, use);
  if (location.kind === 'unassociated') return false;
  return readClaimsIn(db, use.workPackageId).some(
    (claim) => location.claims.includes(claim.workItemId) && matchesClaim(use, claim),
  );
}

export function resourceUsesForAttemptIn(
  db: Writer,
  attempt: Pick<StoredAttempt, 'workItemId' | 'stepId' | 'attemptNumber' | 'executorPersonId'>,
): readonly string[] {
  if (attempt.executorPersonId === null) return [];
  const workPackageId = readPackageIn(db, attempt.workItemId);
  return readActiveUsesIn(db, workPackageId)
    .filter((use) => {
      if (
        use.stepId !== attempt.stepId ||
        use.attemptNumber !== attempt.attemptNumber ||
        use.responsiblePersonId !== attempt.executorPersonId
      )
        return false;
      const location = readResourceUseLocationIn(db, use);
      return location.kind === 'associated' && location.attempt === attempt.workItemId;
    })
    .map(({ id }) => id);
}

/** Retained raw ClaimStore moveAll has its own same-writer location transfer; it moves the exact claims that its following UPDATE moves. */
export function moveResourceUseClaimLocationsIn(
  db: Writer,
  fromWorkItemId: string,
  toWorkItemId: string,
): void {
  const workPackageId = readPackageIn(db, fromWorkItemId);
  const claimIds = readClaimsIn(db, workPackageId)
    .filter((claim) => claim.workItemId === fromWorkItemId)
    .map(({ id }) => id);
  moveResourceUseLocationsIn(db, {
    workPackageId,
    fromWorkItemId,
    toWorkItemId,
    claimIds,
    attempts: [],
  });
}

/** Retained raw attempt transfer moves actual numbered rows; this codec does not pretend the intermediate parent is a current leaf. */
export function moveResourceUseAttemptLocationsIn(
  db: Writer,
  fromWorkItemId: string,
  toWorkItemId: string,
): void {
  const workPackageId = readPackageIn(db, fromWorkItemId);
  const attempts = db
    .all<StepAttemptRecord>(
      sql`SELECT work_item_id AS "workItemId",step_id AS "stepId",
    attempt_number AS "attemptNumber",started_at AS "startedAt",ended_at AS "endedAt",outcome,
    executor_person_id AS "executorPersonId",reference,note FROM step_node_attempt WHERE work_item_id=${fromWorkItemId}`,
    )
    .map(readStoredAttempt);
  moveResourceUseLocationsIn(db, {
    workPackageId,
    fromWorkItemId,
    toWorkItemId,
    claimIds: [],
    attempts,
  });
}
