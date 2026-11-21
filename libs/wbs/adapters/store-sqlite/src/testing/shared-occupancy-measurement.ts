export const PAIRS = 200;

export type Arm = 'D' | 'U';

export interface ClaimTarget {
  projectId: string;
  workItemId: string;
  personId: string;
  steps: [string, string];
}

export interface ClaimRow {
  id: string;
  stepId: string | null;
  workItemId: string;
  personId: string;
  resourceId: string | null;
  units: number | null;
}

export interface ClaimReceipt {
  alreadyHeld: boolean;
  ids: string[];
  rows: ClaimRow[];
}

export interface MeasurementRow {
  phase: 'warmup' | 'measured';
  pair: number;
  order: number;
  arm: Arm;
  target: ClaimTarget;
  durationMs: number;
  claim: ClaimReceipt;
}

export function armsOf(pair: number): readonly [Arm, Arm] {
  return pair % 2 === 1 ? ['D', 'U'] : ['U', 'D'];
}

/** Requires both distinct step claims and both copies of one unit of leaf occupancy. */
export function assertClaim(target: ClaimTarget, resourceId: string, claim: ClaimReceipt): void {
  // Proof: omitting no-op refusal let the repeated-claim control pass an already-held receipt.
  if (claim.alreadyHeld) throw new Error('The claim was a no-op');
  // Proof: omitting the leaf identity check admitted the wrong-leaf control.
  if (
    claim.ids.length !== 2 ||
    new Set(claim.ids).size !== 2 ||
    claim.rows.length !== 2 ||
    new Set(claim.rows.map(({ id }) => id)).size !== 2 ||
    new Set(claim.rows.map(({ stepId }) => stepId)).size !== 2 ||
    claim.rows.some(
      (row) =>
        row.workItemId !== target.workItemId ||
        row.personId !== target.personId ||
        !claim.ids.includes(row.id) ||
        row.stepId === null ||
        !target.steps.includes(row.stepId) ||
        row.resourceId !== resourceId ||
        row.units !== 1,
    )
  )
    throw new Error(`Unexpected committed rows for ${target.workItemId}: ${JSON.stringify(claim)}`);
}

function percentile(sorted: readonly number[], quantile: number): number {
  // Proof: advancing the rank by one broke the third-largest control on a 200-row arm.
  const value = sorted.at(Math.ceil(quantile * sorted.length) - 1);
  if (value === undefined) throw new Error('The arm has no percentile');
  return value;
}

/** Reads all paired receipts in execution order and evaluates the two unrounded p99 bounds. */
export function readMeasurement(
  rows: readonly MeasurementRow[],
  targets: readonly ClaimTarget[],
  resourceId: string,
) {
  // Proof: omitting the row count admitted the incomplete-arm control.
  if (rows.length !== 2 * PAIRS || targets.length !== PAIRS)
    throw new Error('Expected 400 measured rows for 200 paired targets');
  if (
    new Set(targets.map(({ workItemId }) => workItemId)).size !== PAIRS ||
    new Set(targets.map(({ personId }) => personId)).size !== PAIRS
  )
    throw new Error('Measured targets reuse a leaf or person');

  const durations: Record<Arm, number[]> = { D: [], U: [] };
  const seen: Record<Arm, Set<string>> = { D: new Set(), U: new Set() };
  for (const [index, row] of rows.entries()) {
    const pair = Math.floor(index / 2) + 1;
    const order = index % 2;
    // Proof: omitting the slot and arm checks admitted the swapped-order control.
    if (
      row.phase !== 'measured' ||
      row.pair !== pair ||
      row.order !== order + 1 ||
      row.arm !== armsOf(pair)[order]
    )
      throw new Error(`Unexpected pair/order at measured row ${String(index + 1)}`);
    const target = targets.at(pair - 1);
    if (
      row.target.projectId !== target?.projectId ||
      row.target.workItemId !== target.workItemId ||
      row.target.personId !== target.personId ||
      row.target.steps.join() !== target.steps.join()
    )
      throw new Error(`Unexpected target in pair ${String(pair)}`);
    assertClaim(target, resourceId, row.claim);
    for (const id of row.claim.ids) {
      if (seen[row.arm].has(id)) throw new Error(`Repeated claim ID in arm ${row.arm}: ${id}`);
      seen[row.arm].add(id);
    }
    // Proof: omitting the duration check admitted zero, negative, infinite and NaN controls.
    if (!Number.isFinite(row.durationMs) || row.durationMs <= 0)
      throw new Error(`Invalid duration in pair ${String(pair)}`);
    durations[row.arm].push(row.durationMs);
  }

  const summarize = (arm: Arm) => {
    const sorted = durations[arm].sort((left, right) => left - right);
    return { p50: percentile(sorted, 0.5), p99: percentile(sorted, 0.99) };
  };
  const statedMs = summarize('D');
  const unstatedMs = summarize('U');
  const addedP99Ms = statedMs.p99 - unstatedMs.p99;
  const addedP99Percent = (addedP99Ms / unstatedMs.p99) * 100;
  // Proof: disabling either bound admitted its sole-breach control; using strict inequalities failed equality controls.
  const withinMilliseconds = addedP99Ms <= 5;
  const withinPercent = addedP99Ms <= 0.25 * unstatedMs.p99;
  return {
    statedMs,
    unstatedMs,
    addedP99Ms,
    addedP99Percent,
    withinMilliseconds,
    withinPercent,
    passes: withinMilliseconds && withinPercent,
  };
}
