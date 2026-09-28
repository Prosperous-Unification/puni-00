import type { BuiltSolverRequest } from '@wbs/contracts/solver/build-request';
import { materialiseOptimized } from '@wbs/contracts/solver/materialise-optimized';
import { publishOptimizedResult } from '@wbs/contracts/solver/optimized-result';
import { parseSolverResponse } from '@wbs/contracts/solver/parse-solver-response';
import {
  revalidateOptimizedDeadlines,
  revalidateSolverResult,
} from '@wbs/contracts/solver/revalidate-solver-result';
import {
  dispositionOfParseFailure,
  dispositionOfRevalidationFailure,
  type SolverFailureReason,
} from '@wbs/contracts/solver/solver-failure-disposition';
import { guardRealPublication, SOLVER_QUANTUM } from '@wbs/domain';
import type { ScheduleInput } from '@wbs/domain/canonical-schedule-input';

import type { OptimizationOutcome } from '../module/optimization/contract';

type SolverRequest = Extract<BuiltSolverRequest, { readonly ok: true }>['request'];

/** The process supervisor classifies OS failures before this deterministic seam. */
export type SolverProcessOutcome =
  | { readonly kind: 'response'; readonly stdout: string }
  | { readonly kind: 'failed'; readonly reason: SolverFailureReason };

export type EvaluatedSolverOutcome = OptimizationOutcome;

/**
 * Turn one classified child outcome into the exact cache value it earned.
 *
 * Parsing and independent revalidation happen before materialisation, and
 * before the response status is dispositioned — so `infeasible` and `unknown`
 * are answers about a request that was proved usable first (TASK-329). A
 * feasible answer is then replayed through the domain scheduler and compared
 * with real Fast before it becomes an OptimizedResult. Nothing in this seam
 * knows the slot token; the caller stores its answer through
 * `storeOptimizedOutcome`, where that token is the final fence.
 */
export function evaluateSolverOutcome(
  input: ScheduleInput,
  request: SolverRequest,
  outcome: SolverProcessOutcome,
): EvaluatedSolverOutcome {
  if (outcome.kind === 'failed') return { kind: 'failed', reason: outcome.reason };

  const parsed = parseSolverResponse(outcome.stdout);
  if (!parsed.ok) {
    return { kind: 'failed', reason: dispositionOfParseFailure(parsed.failure) };
  }
  const response = parsed.response;
  // TASK-329 AC #1. Re-validation runs BEFORE the status is dispositioned, and
  // the ordering is the fix rather than a tidy-up. Most of what
  // `revalidateSolverResult` proves is about the REQUEST, and a request that
  // cannot support a verdict must not be given one. Ordered the other way — as
  // this was until TASK-329 — a schema-valid but arithmetically meaningless
  // request (a zero-duration slice with `notBeforeUnits: 1` and
  // `deadlineUnits: 1`) is genuinely infeasible to CP-SAT, and that answer was
  // stored as a `plan-infeasible` certificate having passed no
  // request-relative validation at all. `Retry` refuses to re-solve such a hit
  // and `inputHash` cannot distinguish a derived `deadlineUnits` that diverges
  // from the authored deadline it hashes, so the certificate is sticky: a
  // deterministic statement about the user's deadlines derived from a request
  // that does not mean anything.
  //
  // Nothing else moves. `revalidateSolverResult` returns
  // `{ ok: true, published: false }` for every non-feasible status before it
  // reads a single offset, so the only outcomes this ordering changes are the
  // ones that were malformed all along — and `unknown` now reports the
  // malformed request instead of `no-solution`, which is the more accurate of
  // the two.
  const checked = revalidateSolverResult(request, response, input.slices, input);
  if (!checked.ok) {
    return { kind: 'failed', reason: dispositionOfRevalidationFailure(checked.failure) };
  }
  if (response.status !== 'feasible') {
    if (response.status === 'unknown') return { kind: 'failed', reason: 'no-solution' };
    // Proof: removing this no-deadline refusal made the no-deadline
    // infeasible-response test receive no-solution instead of invalid-output
    // (2026-09-28, 3 pass / 1 fail in solver-exit-outcome.test.ts).
    if (input.deadlines.size === 0) return { kind: 'failed', reason: 'invalid-output' };
    // The integer model can be infeasible while the fractional plan is
    // feasible. Its verdict cannot justify a persistent real-plan certificate.
    // Proof: mapping this branch to plan-infeasible made the quantized-only
    // outcome test fail: expected no-solution, received plan-infeasible
    // (2026-09-28, 0 pass / 1 fail in the focused solver-exit-outcome test).
    return { kind: 'failed', reason: 'no-solution' };
  }

  // Proof: short-circuiting here when real Fast had a late slice made the
  // feasible-order test fail (expected ok, received failed; 0 pass / 1 fail,
  // 2026-09-28). The solver's valid order is still eligible for publication.
  try {
    const optimized = materialiseOptimized(
      input.rows,
      input.edges,
      input.slices,
      input.notBefore,
      input.poolSizes,
      input.reach,
      input.typed,
      response.offsets,
    );
    const deadlines = revalidateOptimizedDeadlines(request, optimized);
    if (!deadlines.ok) {
      return {
        kind: 'failed',
        reason: dispositionOfRevalidationFailure(deadlines.failure),
      };
    }
    const weights = new Map(request.slices.map((slice) => [slice.key, slice.priorityWeight]));
    const weightOf = (key: string): number => {
      const weight = weights.get(key);
      if (weight === undefined) throw new Error(`request has no priority weight for ${key}`);
      return weight;
    };
    const baselineStartOf = (key: string): number => {
      return request.baselineOffsets[key] / SOLVER_QUANTUM;
    };
    const decision = guardRealPublication(
      input,
      optimized,
      request.objective === 'pri' ? 'priority' : 'makespan',
      weightOf,
      baselineStartOf,
    );
    return {
      kind: 'ok',
      optimized: publishOptimizedResult(decision, response.objectiveValues),
    };
  } catch {
    return { kind: 'failed', reason: 'invalid-output' };
  }
}
