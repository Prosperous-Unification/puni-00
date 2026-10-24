import { useCallback, useMemo } from 'react';

import type { InstalledClaims } from '@/lib/plan-refresh';
import type { ClaimView, StepView } from '@/lib/wbs-api';

import type { DrawnClaim } from './claim-chip';
import type { LeaseClock } from './lease-clock';
import type { TreeRow } from './wbs-rows';

/** Where the plan draws each claim, read once per claims read and tree. */
export interface PlanClaims {
  /** The step claim drawn in this row's step cell, or null. */
  stepClaimOn: (rowId: string, stepId: string) => DrawnClaim | null;
  /** The subtree claim drawn in this row's Name cell or card header, or null. */
  subtreeClaimOn: (rowId: string) => DrawnClaim | null;
  /** Whether some drawn row holds a claim on this step, so its folded column keeps the slot. */
  anyClaimOn: (stepId: string) => boolean;
  /** Whether any drawn claim holds a lease in force, so the plan's one ticker must run. */
  leasesRunning: boolean;
}

interface ClaimIndex {
  steps: ReadonlyMap<string, ReadonlyMap<string, DrawnClaim>>;
  subtrees: ReadonlyMap<string, DrawnClaim>;
  claimedSteps: ReadonlySet<string>;
  leasesRunning: boolean;
}

const NO_CLAIMS: ClaimIndex = {
  steps: new Map(),
  subtrees: new Map(),
  claimedSteps: new Set(),
  leasesRunning: false,
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
): ClaimIndex {
  if (installed === null || installed.claims.length === 0) return NO_CLAIMS;
  const rowIds = new Set(rows.map((row) => row.id));
  const stepIds = new Set(steps.map((step) => step.id));
  const byId = new Map(installed.claims.map((claim) => [claim.claimId, claim]));
  const clock = { readAt: installed.readAt, installedAt: installed.installedAt };
  const stepClaims = new Map<string, Map<string, DrawnClaim>>();
  const subtrees = new Map<string, DrawnClaim>();
  const claimedSteps = new Set<string>();
  let leasesRunning = false;
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
      parent: parentOf(claim, byId),
      clock,
      leaseClock,
      zone,
    };
    // Proof: counting a revoked lease as running made `runs no timer while no
    // drawn claim holds a lease in force` fail on `expected 1 to be +0`;
    // watched 2026-10-24.
    if (claim.leaseExpiresAt !== null && claim.leaseRevokedAt === null) leasesRunning = true;
    if (claim.stepId === null) {
      subtrees.set(claim.workItemId, drawn);
      continue;
    }
    const onRow = stepClaims.get(claim.workItemId) ?? new Map<string, DrawnClaim>();
    onRow.set(claim.stepId, drawn);
    stepClaims.set(claim.workItemId, onRow);
    claimedSteps.add(claim.stepId);
  }
  return { steps: stepClaims, subtrees, claimedSteps, leasesRunning };
}

function parentOf(claim: ClaimView, byId: ReadonlyMap<string, ClaimView>): ClaimView | null {
  if (claim.parentClaimId === null) return null;
  const parent = byId.get(claim.parentClaimId);
  // `readClaims` refuses a read whose parent is not listed, so this is a read
  // that skipped its boundary.
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
}: {
  claims: InstalledClaims | null;
  rows: readonly TreeRow[];
  steps: readonly StepView[];
  zone: string | null;
  leaseClock: LeaseClock;
}): PlanClaims {
  const index = useMemo(
    () => indexClaims(claims, rows, steps, zone, leaseClock),
    [claims, rows, steps, zone, leaseClock],
  );
  const stepClaimOn = useCallback(
    (rowId: string, stepId: string) => index.steps.get(rowId)?.get(stepId) ?? null,
    [index],
  );
  const subtreeClaimOn = useCallback((rowId: string) => index.subtrees.get(rowId) ?? null, [index]);
  const anyClaimOn = useCallback((stepId: string) => index.claimedSteps.has(stepId), [index]);
  return { stepClaimOn, subtreeClaimOn, anyClaimOn, leasesRunning: index.leasesRunning };
}
