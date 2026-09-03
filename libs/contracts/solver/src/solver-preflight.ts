import { SOLVER_HORIZON_UNITS_MAX, type SolverSlice } from './wire-types';

/**
 * The two arithmetic refusals that must happen **before a process is spawned**
 * (2.10), and the `horizonUnits` they are computed from.
 *
 * Both are about representability rather than about the plan being reasonable.
 * A request that fails either is one this builder must not send: the first
 * would exceed CP-SAT's own variable domain, and the second would leave an
 * objective coefficient that JSON, Bun, or the solver's 64-bit linear
 * expressions cannot carry exactly. Neither is recoverable by trying, so
 * neither is worth a process.
 *
 * They follow `parseSolverResponse`'s convention — a discriminated result, not
 * a throw — because a caller has a real answer to give the user in both cases,
 * and because the failure token is the thing the cached row records.
 */

export const SOLVER_PREFLIGHT_FAILURES = ['horizon-overflow', 'objective-overflow'] as const;
export type SolverPreflightFailure = (typeof SOLVER_PREFLIGHT_FAILURES)[number];

export type SolverPreflight =
  | { readonly ok: true; readonly horizonUnits: number }
  | {
      readonly ok: false;
      readonly failure: SolverPreflightFailure;
      readonly detail: string;
    };

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * `horizonUnits` and the two preflights, in the order they can be answered.
 *
 * **The horizon is the SERIAL bound** `max(0, ...notBeforeUnits) + Σ
 * durationUnits`: every slice placed after the latest floor, one after another,
 * with no overlap at all. Seeded with zero, because a plan with slices and no
 * manual floors is the ordinary state of nearly every project and an unseeded
 * `max` over an empty set has no value — `schedule.ts` writes `Math.max(0, ...)`
 * for the same shape.
 *
 * It is deliberately **not** the Fast makespan plus remaining effort. That
 * stops being an upper bound the moment the optimizer is allowed to idle a
 * slice, and an upper bound that is not one turns a solvable plan into a
 * spurious `infeasible`. Nor is it tightened to the latest deadline, which
 * would make a genuinely infeasible plan indistinguishable from a horizon
 * overflow — two states with different user-facing answers and only one of them
 * retryable.
 *
 * **Accumulated in `bigint` and converted only after comparing.** The sum of
 * safe integers is not a safe integer, so a `number` accumulator could pass a
 * `<= 2^31 − 1` check by having already lost precision above it — which is the
 * check silently failing open rather than closed.
 *
 * The objective preflight is second because it multiplies by the horizon. Its
 * worst case is `Σ w(s) × horizonUnits`: every slice's priority weight paid at
 * the last representable instant. Above `Number.MAX_SAFE_INTEGER` an integer
 * stops surviving the round trip through Bun and JSON, so the weight the solver
 * optimises would not be the weight this builder computed.
 *
 * **MOVEMENT's own worst case, `Σ |offset − baseline|`, is NOT checked here**
 * and is owed: it needs `baselineOffsets`, which is 2.11's quantised baseline
 * and does not exist yet. Recorded rather than silently skipped.
 */
export function preflightSolverRequest(slices: readonly SolverSlice[]): SolverPreflight {
  let latestFloor = 0n;
  let totalDuration = 0n;
  let totalWeight = 0n;
  for (const slice of slices) {
    const floor = BigInt(slice.notBeforeUnits);
    if (floor > latestFloor) latestFloor = floor;
    totalDuration += BigInt(slice.durationUnits);
    totalWeight += BigInt(slice.priorityWeight);
  }

  const horizon = latestFloor + totalDuration;
  if (horizon > BigInt(SOLVER_HORIZON_UNITS_MAX)) {
    return {
      ok: false,
      failure: 'horizon-overflow',
      detail: `serial bound ${horizon.toString()} units exceeds the solver's ${String(SOLVER_HORIZON_UNITS_MAX)}`,
    };
  }

  const objectiveWorstCase = totalWeight * horizon;
  if (objectiveWorstCase > MAX_SAFE) {
    return {
      ok: false,
      failure: 'objective-overflow',
      detail: `priority worst case ${objectiveWorstCase.toString()} exceeds Number.MAX_SAFE_INTEGER`,
    };
  }

  return { ok: true, horizonUnits: Number(horizon) };
}
