import {
  SOLVER_HORIZON_UNITS_MAX,
  type SolverEdge,
  type SolverOffsetMap,
  type SolverSlice,
} from './wire-types';

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
 * **The horizon is a constructive serial bound**: latest floor plus every
 * duration plus every positive FF start-weight excess over its predecessor's
 * duration. Place slices in topological order, starting no earlier than the
 * serial cursor and all predecessor bounds. An FS bound is paid by the
 * predecessor duration; SS costs no extra time; an FF bound can advance the
 * cursor by at most `max(0, startWeightUnits - predecessor duration)`.
 * Charging that excess for every FF edge therefore bounds every such advance,
 * even when several edges converge. The final cursor bounds every start and
 * finish. This gives CP-SAT a feasible placement within its start domain when
 * the plan has no conflicting deadline. It does not bound arbitrarily idled
 * schedules, which need no representation for feasibility. The latest floor is
 * seeded with zero for plans without manual floors.
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
 * worst case is `Σ w(s) × (horizonUnits + durationUnits(s))`: every slice's
 * priority weight paid at the last instant that slice can *finish*. Above
 * `Number.MAX_SAFE_INTEGER` an integer stops surviving the round trip through
 * Bun and JSON, so the weight the solver optimises would not be the weight this
 * builder computed.
 *
 * **It is the FINISH, not the horizon, and the difference is load-bearing.**
 * `horizonUnits` bounds a slice's *start* (`solver-wire.v2.json` clause 1, and
 * `model.py` builds the start domain from it); PRIORITY is `Σ w(s) · finish(s)`
 * and a finish past the horizon is legal — the makespan's business, not an
 * error. So the true ceiling exceeds `Σ w(s) × horizonUnits` by exactly
 * `Σ w(s) × durationUnits(s)`, and a bound that omitted that term admitted
 * requests the solver can answer with a `priority.value` the response schema's
 * own `safeInteger` refuses. Measured rather than reasoned (TASK-219 run 20):
 * at `horizonUnits = 2³¹ − 1` and weight `2²²` the old bound is 9007199250546688
 * and passes, while CP-SAT proves OPTIMAL a placement whose PRIORITY is
 * 9007199254740992 — `Number.MAX_SAFE_INTEGER + 1`, one unit into the range
 * that does not round-trip. Bun would have refused the response it asked for.
 *
 * **MOVEMENT's worst case is third**, and it is checked here now that 2.11's
 * quantised baseline exists to check it against. `Σ |offset − baseline|` is
 * maximised term by term: an offset lives in `[0, horizonUnits]`, so the
 * furthest any slice can be dragged from its baseline `b` is
 * `max(b, horizonUnits − b)` — one end of the axis or the other, never both,
 * which is why this is a max and not a sum of the two. It is last because it
 * needs the horizon the first check produces, and it is the same
 * `objective-overflow` token as PRIORITY's because it is the same fault: a term
 * the solver would optimise that Bun could not have computed exactly.
 *
 * A slice with no baseline entry **throws** rather than returning a failure.
 * The key sets of `slices[]`, `baselineOffsets` and `fastHint` are equal by
 * construction — one grouping produces all three — so a gap is this package's
 * own bug and not a state of the user's plan, and every failure token here is a
 * sentence a client shows somebody.
 */
export function preflightSolverRequest(
  slices: readonly SolverSlice[],
  baselineOffsets: SolverOffsetMap,
  edges: readonly SolverEdge[],
): SolverPreflight {
  let latestFloor = 0n;
  let totalDuration = 0n;
  let totalWeight = 0n;
  let weightedDuration = 0n;
  const durationByKey = new Map(slices.map((slice) => [slice.key, slice.durationUnits]));
  for (const slice of slices) {
    const floor = BigInt(slice.notBeforeUnits);
    if (floor > latestFloor) latestFloor = floor;
    const duration = BigInt(slice.durationUnits);
    const weight = BigInt(slice.priorityWeight);
    totalDuration += duration;
    totalWeight += weight;
    // The `Σ w(s) × durationUnits(s)` half of the objective bound below,
    // accumulated here because the other half needs the horizon this loop is
    // still computing. In `bigint` for the same reason everything else is: the
    // product of two safe integers is routinely not one.
    weightedDuration += weight * duration;
  }

  let placementGaps = 0n;
  for (const edge of edges) {
    if (edge.type !== 'FF') continue;
    const duration = durationByKey.get(edge.predecessorKey);
    if (duration === undefined) throw new Error(`no predecessor slice ${edge.predecessorKey}`);
    const gap = BigInt(edge.startWeightUnits) - BigInt(duration);
    if (gap > 0n) placementGaps += gap;
  }
  // Proof: removing placementGaps made the A=1/48+1e-12, B=0 FF request
  // test fail: B's baseline finish was 2 while horizonUnits was 1.
  const horizon = latestFloor + totalDuration + placementGaps;
  if (horizon > BigInt(SOLVER_HORIZON_UNITS_MAX)) {
    return {
      ok: false,
      failure: 'horizon-overflow',
      detail: `serial bound ${horizon.toString()} units exceeds the solver's ${String(SOLVER_HORIZON_UNITS_MAX)}`,
    };
  }

  const objectiveWorstCase = totalWeight * horizon + weightedDuration;
  if (objectiveWorstCase > MAX_SAFE) {
    return {
      ok: false,
      failure: 'objective-overflow',
      detail: `priority worst case ${objectiveWorstCase.toString()} exceeds Number.MAX_SAFE_INTEGER`,
    };
  }

  let movementWorstCase = 0n;
  for (const slice of slices) {
    // `Object.hasOwn` rather than `=== undefined`: `SolverOffsetMap` indexes to
    // `number`, so the narrowing form is dead to the type checker and eslint
    // deletes it — a missing key would otherwise be read as `undefined`,
    // `BigInt(undefined)` would throw somewhere with nothing to name, and the
    // gap in the key set would never be reported as the gap it is.
    if (!Object.hasOwn(baselineOffsets, slice.key)) {
      throw new Error(`no baseline offset for slice ${slice.key.replace('\u0000', '/')}`);
    }
    const baseline = BigInt(baselineOffsets[slice.key]);
    const away = baseline > horizon - baseline ? baseline : horizon - baseline;
    movementWorstCase += away;
  }
  if (movementWorstCase > MAX_SAFE) {
    return {
      ok: false,
      failure: 'objective-overflow',
      detail: `movement worst case ${movementWorstCase.toString()} exceeds Number.MAX_SAFE_INTEGER`,
    };
  }

  return { ok: true, horizonUnits: Number(horizon) };
}
