import {
  decodeOptimizedResult,
  type OptimizedResult,
} from '@wbs/contracts/solver/optimized-result';
import {
  decodePlanInfeasible,
  type PlanInfeasibleResult,
} from '@wbs/contracts/solver/plan-infeasible';
import type { OptimizationVariantState } from '@wbs/core';

import { SOLVER_OBJECTIVES, type SolverFailureReason, type SolverObjectiveName } from './schema';

/**
 * What one stored row means to a reader, after the generation predicate and the
 * payload decode have both had their say.
 *
 * These are row states, not the plan read's `VariantState`: `pending`,
 * `retrying` and `idle` are decided by a live slot or queue entry, which this
 * layer does not read. Every member below maps into that union by adding that
 * one fact, and none of them is derivable from it — which is why the two are
 * separate types rather than one shared enum.
 */
export type CachedOutcome =
  | { readonly kind: 'miss' }
  | {
      readonly kind: 'ok';
      readonly result: OptimizedResult;
      readonly generation: number;
      readonly createdAt: number;
    }
  | {
      readonly kind: 'failed';
      readonly reason: SolverFailureReason;
      readonly generation: number;
      readonly createdAt: number;
    }
  | {
      readonly kind: 'plan-infeasible';
      readonly certificate: PlanInfeasibleResult;
      readonly generation: number;
      readonly createdAt: number;
    }
  | {
      readonly kind: 'corrupt';
      readonly reason: string;
      readonly generation: number;
      readonly createdAt: number;
    };

/**
 * Add the full-key liveness fact to one stored-row outcome.
 *
 * Proof: independently replacing the quantisation-floor, proven and incomplete
 * labels failed each corresponding `preserves ... proof` captured-reader DB case.
 */
export function optimizationVariantState(
  outcome: CachedOutcome,
  live: boolean,
): OptimizationVariantState {
  if (outcome.kind === 'ok') {
    if (outcome.result.publication === 'quantisation-floor') {
      return { state: 'ready', proof: 'quantisation-floor' };
    }
    const proven = Object.values(outcome.result.objectiveValues).every(
      ({ status }) => status === 'optimal',
    );
    return { state: 'ready', proof: proven ? 'proven' : 'incomplete' };
  }
  if (outcome.kind === 'miss') return { state: live ? 'pending' : 'idle' };
  if (outcome.kind === 'failed') {
    return live ? { state: 'retrying' } : { state: 'failed', reason: outcome.reason };
  }
  if (outcome.kind === 'corrupt') {
    return live ? { state: 'retrying' } : { state: 'corrupt', message: outcome.reason };
  }
  return { state: 'plan-infeasible', items: outcome.certificate.items };
}

/** Both objectives' outcomes for one key, which is what a plan read asks for. */
export type OptimizedPair = Readonly<Record<SolverObjectiveName, CachedOutcome>>;

/**
 * A decode failure as the reader reports it, never as a thrown error.
 *
 * The row is **left in place** (tasks.md 4.8, Sol r7 Important 13). Deleting it
 * and reporting a miss would turn corruption into a read-triggered solve — the
 * timer retry Dany rejected, arriving through the cache instead of the clock —
 * and would destroy the only evidence of the defect at the moment it was found.
 * Proof: reporting `miss` here failed `spawns nothing across ten reads of a
 * corrupt row, and one Retry asks once` through the production pair-read seam.
 *
 * `corrupt` never satisfies a read and never auto-spawns, exactly like `failed`;
 * an explicit Retry overwrites it through the ordinary admission path.
 */
function corrupt(reason: unknown, generation: number, createdAt: number): CachedOutcome {
  return {
    kind: 'corrupt',
    reason: reason instanceof Error ? reason.message : String(reason),
    generation,
    createdAt,
  };
}

/**
 * `JSON.parse` as an outcome rather than as a throw.
 *
 * A truncated payload fails here and a well-formed one that breaks the codec
 * fails a layer down; both are the same state to a reader, so both funnel into
 * {@link corrupt} and neither escapes this module.
 */
function parsePayload(
  payload: string,
): { ok: true; value: unknown } | { ok: false; error: unknown } {
  try {
    return { ok: true, value: JSON.parse(payload) };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * One row's payload, dispatched on the row's own `status`.
 *
 * **`plan-infeasible` is now decoded whole**, and the envelope-only read it
 * replaced was a stated hole rather than an oversight. Assumption A1
 * (schema.ts) says the row holds a versioned `PlanInfeasibleResult`
 * discriminated by `status`, and that a payload which fails to decode reads as
 * `corrupt` on exactly the rule an `ok` row obeys. Until the certificate's own
 * codec landed this layer could honestly check only the half A1 fixes — valid
 * JSON carrying a numeric `dtoVersion`, the read fence both other codecs use —
 * and the predicted falsification was written down: a payload whose offending
 * item list is malformed read `plan-infeasible` then and must read `corrupt`
 * once `decodePlanInfeasible` existed. It does, this call is it, and the
 * tightening was a change to this function and to no caller.
 */
function decodePayload(
  status: 'ok' | 'plan-infeasible',
  payload: string,
  generation: number,
  createdAt: number,
): CachedOutcome {
  // Proof: removing this parse guard failed `reads a truncated payload`; bypassing
  // either codec failed `reads a wrong dtoVersion` or `reads a malformed certificate item`.
  const parsed = parsePayload(payload);
  if (!parsed.ok) return corrupt(parsed.error, generation, createdAt);

  if (status === 'ok') {
    try {
      return { kind: 'ok', result: decodeOptimizedResult(parsed.value), generation, createdAt };
    } catch (error) {
      return corrupt(error, generation, createdAt);
    }
  }

  try {
    return {
      kind: 'plan-infeasible',
      certificate: decodePlanInfeasible(parsed.value),
      generation,
      createdAt,
    };
  } catch (error) {
    return corrupt(error, generation, createdAt);
  }
}

/**
 * One row read into its outcome.
 *
 * **A row that violates the payload `CHECK` reads `corrupt`, not a throw**, and
 * the divergence from 3.8's boundary rule is deliberate. `toOptimizedScheduleCacheRow`
 * throws on an *unknown enum value*, because there is no honest way to answer a
 * question about a token the release has never heard of. A missing payload is a
 * different defect: the value is absent rather than unrecognised, the constraint
 * that forbids it has existed since the table did, and a throw here would wedge
 * the plan read for **both** objectives on one bad row — precisely the outcome
 * 4.8 introduced `corrupt` to prevent. The row is still left in place and still
 * recoverable by Retry. **Falsified if** a `failed` row with no reason ever
 * needs to be distinguished from a decode failure by a caller; today nothing
 * renders them differently, both showing `Optimization unavailable · Retry`.
 */
export function outcomeOf(row: {
  status: 'ok' | 'failed' | 'plan-infeasible';
  resultJson: string | null;
  failureReason: SolverFailureReason | null;
  generation: number;
  createdAt: number;
}): CachedOutcome {
  const { status, resultJson, failureReason, generation, createdAt } = row;

  // Proof: independently bypassing the null guards failed `reads a failed row
  // with no reason` and both `row with no payload` production pair-read cases.
  if (status === 'failed') {
    return failureReason === null
      ? corrupt(
          new Error('stored row: a failed row carries no failure_reason'),
          generation,
          createdAt,
        )
      : { kind: 'failed', reason: failureReason, generation, createdAt };
  }

  return resultJson === null
    ? corrupt(
        new Error(`stored row: a ${status} row carries no result_json`),
        generation,
        createdAt,
      )
    : decodePayload(status, resultJson, generation, createdAt);
}

/**
 * Which objectives an *automatic* read asks a solver for.
 *
 * Pure, exported and separately tested, because it is the whole spawn policy
 * and every other arm of slice 4 is a claim about it: 4.4 is `failed` staying
 * out of this set, 4.8 is `corrupt` staying out of it, and 4.5/4.7 are watched
 * reds that put one of them back.
 *
 * **Only `miss` spawns.** Every other outcome is an answer this key already
 * has — `ok` is the answer, `failed` and `plan-infeasible` are answers about
 * the solve and the plan, and `corrupt` is a defect whose row is deliberately
 * left in place (4.8). Auto-spawning on any of the four would make every read
 * of a settled key a re-solve, which is the timer retry Dany rejected arriving
 * through the cache instead of the clock.
 *
 * Proof: independently including failed/corrupt failed the production
 * `spawns nothing across ten reads by three collaborators against a failed key`
 * and `spawns nothing across ten reads of a corrupt row, and one Retry asks once` cases.
 *
 * It iterates {@link SOLVER_OBJECTIVES} rather than naming `pri` and `time`, so
 * the order is the stored vocabulary's and a third objective would be covered
 * by construction rather than by remembering this line.
 */
export function objectivesToAutoSpawn(pair: OptimizedPair): readonly SolverObjectiveName[] {
  return SOLVER_OBJECTIVES.filter((objective) => pair[objective].kind === 'miss');
}

/**
 * Which objectives an **explicit Retry** asks a solver for (tasks.md 4.4).
 *
 * Only `failed` and `corrupt`, matching 7.11's explicit recovery contract.
 * `miss` is admitted by the cold read, `ok` already has an answer, and
 * `plan-infeasible` is a deterministic certificate that a same-input solve
 * cannot change. Keeping those three out also prevents this lower-level seam
 * from bypassing the route's `not-retryable` decision.
 */
export function objectivesToRetry(pair: OptimizedPair): readonly SolverObjectiveName[] {
  return SOLVER_OBJECTIVES.filter((objective) => {
    const kind = pair[objective].kind;
    return kind === 'failed' || kind === 'corrupt';
  });
}
