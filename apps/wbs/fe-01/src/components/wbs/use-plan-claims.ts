import { useCallback, useMemo } from 'react';

import type { InstalledClaims } from '@/lib/plan-refresh';
import type { ClaimView, StepView } from '@/lib/wbs-api';

import type { DrawnClaim } from './claim-chip';
import { assignInitials, initialsIn } from './initials';
import type { LeaseClock } from './lease-clock';
import { UNKNOWN_ASSIGNEE } from './use-reference-sets';
import type { TreeRow } from './wbs-rows';

/** Where the plan draws each claim, read once per claims read and tree. */
export interface PlanClaims {
  /** The step claim drawn in this row's step cell, or null. */
  stepClaimOn: (rowId: string, stepId: string) => DrawnClaim | null;
  /** The subtree claim drawn in this row's Name cell or card header, or null. */
  subtreeClaimOn: (rowId: string) => DrawnClaim | null;
  /** Whether some drawn row holds a claim on this step, so its folded column keeps the slot. */
  anyClaimOn: (stepId: string) => boolean;
  /**
   * Who holds a claim drawn on this row, by person id — its step claims on
   * every step, hidden columns included, and its subtree claim — for the row
   * menu's Claim or Release (`wbs-claim-display` C23).
   */
  holdersOn: (rowId: string) => string[];
  /**
   * The monotonic instant the plan's one ticker must run until: the latest
   * lease end among the claims drawn on `rows` (the rows on screen, not the
   * collapsed or filtered ones) and `steps` (the step columns not hidden), or
   * null when none of them holds a lease that is not revoked.
   */
  leaseDeadlineOn: (rows: ReadonlySet<string>, steps: ReadonlySet<string>) => number | null;
}

interface ClaimIndex {
  steps: ReadonlyMap<string, ReadonlyMap<string, DrawnClaim>>;
  subtrees: ReadonlyMap<string, DrawnClaim>;
  claimedSteps: ReadonlySet<string>;
  /** Claims with a lease nobody revoked, which a ticker may have to count down. */
  leased: readonly DrawnClaim[];
}

const NO_CLAIMS: ClaimIndex = {
  steps: new Map(),
  subtrees: new Map(),
  claimedSteps: new Set(),
  leased: [],
};

/**
 * Indexes the installed claims against the installed tree (`wbs-claim-display`
 * C11): a claim is drawn only where the tree holds its row and, for a step
 * claim, its step. The two resources install independently, so a claim may
 * name a row the tree does not hold yet, or no longer; that claim is not drawn
 * and is not an error, and the next covering read agrees.
 *
 * A claim is drawn on its own row and nowhere else (C8): a subtree claim does
 * not reach the leaves under it, and a collapsed row does not gather the claims
 * of the rows it hides.
 *
 * The read's own coherence (one claim per step, every parent listed) is checked
 * where it enters, in `httpProjectApi.readClaims`.
 */
export function indexClaims(
  installed: InstalledClaims | null,
  rows: readonly Pick<TreeRow, 'id'>[],
  steps: readonly Pick<StepView, 'id'>[],
  zone: string | null,
  leaseClock: LeaseClock,
  initials: ReadonlyMap<string, string>,
): ClaimIndex {
  if (installed === null || installed.claims.length === 0) return NO_CLAIMS;
  const rowIds = new Set(rows.map((row) => row.id));
  const stepIds = new Set(steps.map((step) => step.id));
  const byId = new Map(installed.claims.map((claim) => [claim.claimId, claim]));
  const clock = { readAt: installed.readAt, installedAt: installed.installedAt };
  const stepClaims = new Map<string, Map<string, DrawnClaim>>();
  const subtrees = new Map<string, DrawnClaim>();
  const claimedSteps = new Set<string>();
  const leased: DrawnClaim[] = [];
  for (const claim of installed.claims) {
    // Proof: a throwing lookup here (`no row w-not-yet`) made `draws nothing
    // for a claim on a row or step the tree lacks` find no row at all, the
    // table replaced by its fault; with either skip removed, the same case
    // failed on the absent claim's lease starting the ticker (`expected 1 to
    // be +0`). Watched 2026-10-24.
    if (!rowIds.has(claim.workItemId)) continue;
    if (claim.stepId !== null && !stepIds.has(claim.stepId)) continue;
    const drawn: DrawnClaim = {
      claim,
      initials: initialsIn(initials, claim.holder.name),
      parent: parentOf(claim, byId),
      clock,
      leaseClock,
      zone,
    };
    // Proof: counting a revoked lease as running made `runs no timer while no
    // drawn claim holds a lease in force` fail on `expected 1 to be +0`;
    // watched 2026-10-24.
    if (claim.leaseExpiresAt !== null && claim.leaseRevokedAt === null) leased.push(drawn);
    if (claim.stepId === null) {
      subtrees.set(claim.workItemId, drawn);
      continue;
    }
    const onRow = stepClaims.get(claim.workItemId) ?? new Map<string, DrawnClaim>();
    onRow.set(claim.stepId, drawn);
    stepClaims.set(claim.workItemId, onRow);
    claimedSteps.add(claim.stepId);
  }
  return { steps: stepClaims, subtrees, claimedSteps, leased };
}

/**
 * The marks the plan prints people by (`wbs-claim-display` C22): one
 * {@link assignInitials} over everyone the directory holds, every claim
 * holder (a holder the directory read has not caught up with included) and
 * {@link UNKNOWN_ASSIGNEE}, so a chip and an assignee slot never read alike
 * for two people. The directory rather than only the people on screen, so a
 * mark does not move when somebody is assigned elsewhere in the plan.
 */
export function planInitialsOf(
  people: readonly { name: string }[],
  claims: InstalledClaims | null,
): ReadonlyMap<string, string> {
  return assignInitials([
    ...people.map((person) => person.name),
    ...(claims?.claims ?? []).map((claim) => claim.holder.name),
    UNKNOWN_ASSIGNEE,
  ]);
}

/**
 * The latest monotonic instant at which a lease drawn on `rows` and `steps`
 * ends, or null when none is drawn: `installedAt + (leaseExpiresAt − readAt)`,
 * the instant `leaseViewOf` turns it to releasing.
 */
export function leaseDeadline(
  leased: readonly DrawnClaim[],
  rows: ReadonlySet<string>,
  steps: ReadonlySet<string>,
): number | null {
  let latest: number | null = null;
  for (const { claim, clock } of leased) {
    // Proof: counting claims on rows off screen made `runs no timer for a lease
    // drawn on no row on screen` fail on `expected 1 to be +0`; watched 2026-10-24.
    if (!rows.has(claim.workItemId)) continue;
    if (claim.stepId !== null && !steps.has(claim.stepId)) continue;
    if (claim.leaseExpiresAt === null) continue;
    const ends = clock.installedAt + (claim.leaseExpiresAt - clock.readAt);
    if (latest === null || ends > latest) latest = ends;
  }
  return latest;
}

function parentOf(claim: ClaimView, byId: ReadonlyMap<string, ClaimView>): ClaimView | null {
  if (claim.parentClaimId === null) return null;
  const parent = byId.get(claim.parentClaimId);
  // Unreachable from production: `checkClaimsRead` refuses, at the read's
  // boundary, a read whose parent is not listed, so this names a read that
  // skipped it. Proof: with this throw never taken, `refuses to index a delegated
  // claim whose parent its read does not list` failed on `expected [Function]
  // to throw an error`; watched 2026-10-24.
  if (parent === undefined) {
    throw new Error(`claim ${claim.claimId} names parent ${claim.parentClaimId}, not in its read`);
  }
  return parent;
}

/**
 * The plan's claims, drawn against `rows` — every row of the installed tree,
 * collapsed or not, the `anyAssigneeOn` rule — so a step column keeps its claim
 * slot exactly while some row of the plan holds a claim on it.
 */
export function usePlanClaims({
  claims,
  rows,
  steps,
  zone,
  leaseClock,
  initials,
}: {
  claims: InstalledClaims | null;
  rows: readonly TreeRow[];
  steps: readonly StepView[];
  zone: string | null;
  leaseClock: LeaseClock;
  /** The plan's {@link planInitialsOf}. */
  initials: ReadonlyMap<string, string>;
}): PlanClaims {
  const index = useMemo(
    () => indexClaims(claims, rows, steps, zone, leaseClock, initials),
    [claims, rows, steps, zone, leaseClock, initials],
  );
  const stepClaimOn = useCallback(
    (rowId: string, stepId: string) => index.steps.get(rowId)?.get(stepId) ?? null,
    [index],
  );
  const subtreeClaimOn = useCallback((rowId: string) => index.subtrees.get(rowId) ?? null, [index]);
  const anyClaimOn = useCallback((stepId: string) => index.claimedSteps.has(stepId), [index]);
  // Proof: answering nobody here made `offers Release my claim on a row the
  // person holds` fail on `expected [ 'Set status to Draft', …(12) ] to include
  // 'Release my claim'`; watched 2026-10-27.
  const holdersOn = useCallback(
    (rowId: string) =>
      [...(index.steps.get(rowId)?.values() ?? []), index.subtrees.get(rowId) ?? null].flatMap(
        (drawn) => (drawn === null ? [] : [drawn.claim.holder.personId]),
      ),
    [index],
  );
  const leaseDeadlineOn = useCallback(
    (rows: ReadonlySet<string>, steps: ReadonlySet<string>) =>
      leaseDeadline(index.leased, rows, steps),
    [index],
  );
  return { stepClaimOn, subtreeClaimOn, anyClaimOn, holdersOn, leaseDeadlineOn };
}
