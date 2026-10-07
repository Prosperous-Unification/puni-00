import { buildSolverRequest, type BuiltSolverRequest } from '@wbs/contracts/solver/build-request';
import { quantisedFastBaseline } from '@wbs/contracts/solver/quantised-baseline';
import { sliceKey } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

/** The two independent solver questions prepared from one canonical plan. */
export interface SolverRequestPair {
  readonly pri: BuiltSolverRequest;
  readonly time: BuiltSolverRequest;
}

/**
 * Builds PRI and Time against one quantised Fast baseline.
 *
 * The baseline is deliberately evaluated once. It is both objectives' movement
 * origin and search hint, so recomputing it per objective would compare two
 * solvers against two separately observed schedules. Preflight refusals remain
 * values for the coordinator to persist without starting a process. A provisional
 * request with zero movement references proves compatibility and arithmetic
 * before the baseline scales estimates; both final requests are then checked
 * again against their actual shared baseline.
 */
export function buildSolverRequestPair(
  input: ScheduleInput,
  solverVersion: string,
  budgetMs: number,
): SolverRequestPair {
  const preflight = buildSolverRequest(input, 'pri', {
    baselineOffsets: Object.fromEntries(
      input.slices.map((slice) => [sliceKey(slice.workItemId, slice.stepId), 0]),
    ),
    solverVersion,
    budgetMs,
  });
  // Proof: bypassing this preflight let oversized baseline arithmetic throw
  // instead of returning typed refusals (0 pass / 1 fail in solver-request-pair.test.ts).
  if (!preflight.ok) return { pri: preflight, time: preflight };
  const baselineOffsets = quantisedFastBaseline(
    input.rows,
    input.edges,
    input.slices,
    input.notBefore,
    input.poolSizes,
    input.reach,
    input.typed,
    // Proof: dropping these bookings made the production pair hint at unit 0
    // instead of 49 (0 pass / 1 fail in solver-request-pair.test.ts).
    input.elsewhere,
  );
  const spawn = { baselineOffsets, solverVersion, budgetMs };

  return {
    pri: buildSolverRequest(input, 'pri', spawn),
    time: buildSolverRequest(input, 'time', spawn),
  };
}
