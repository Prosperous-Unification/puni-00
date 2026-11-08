import {
  type ConnectedOptimizationStage,
  type ConnectedPublicationDecision,
  guardConnectedPublication,
  replayConnectedStage,
  ScheduleInvalidOptimizedStartError,
} from '@wbs/domain';

import type { ConnectedPreparedRequest } from './build-connected-solver-request';
import { parseConnectedSolverResponse } from './parse-solver-response';
import { type PlanInfeasibleResult, planInfeasibleResultOf } from './plan-infeasible-dto';
import { revalidateConnectedSolverResult } from './revalidate-solver-result';
import type { SolverProcessOutcome } from './solver-exit-outcome';
import {
  dispositionOfParseFailure,
  dispositionOfRevalidationFailure,
  type SolverFailureReason,
} from './solver-failure-disposition';
import type {
  ConnectedSolverRequest,
  ConnectedSolverResponse,
  SolverObjectiveValues,
} from './wire-types';

export { SOLVER_WIRE_VERSION } from './wire-types';

type Contradiction = Extract<ConnectedPreparedRequest, { kind: 'boundary-infeasible' }>;

/** Detached in-memory evidence; storage must use its own strict versioned codec before persistence. */
export interface ConnectedBoundaryEvidence {
  readonly kind: 'boundary-infeasible';
  readonly stage: ConnectedOptimizationStage;
  readonly request: ConnectedSolverRequest;
  readonly evidence:
    | Contradiction['evidence']
    | {
        readonly kind: 'solver-proven-infeasible';
        readonly response: ConnectedSolverResponse;
      };
}

/** A connected answer owns only local starts and retains the exact fixed-boundary question. */
export type ConnectedSolverOutcome =
  | {
      readonly kind: 'ok';
      readonly starts: ReadonlyMap<string, number>;
      readonly decision: ConnectedPublicationDecision;
      readonly objectiveValues: SolverObjectiveValues;
    }
  | { readonly kind: 'failed'; readonly reason: SolverFailureReason }
  | { readonly kind: 'plan-infeasible'; readonly certificate: PlanInfeasibleResult }
  | { readonly kind: 'boundary-infeasible'; readonly certificate: ConnectedBoundaryEvidence };

/** Preserve a builder-validated direct contradiction without inventing a child response. */
export function prepareConnectedBoundaryOutcome(
  prepared: Contradiction,
): Extract<ConnectedSolverOutcome, { kind: 'boundary-infeasible' }> {
  replayConnectedStage(prepared.stage);
  return {
    kind: 'boundary-infeasible',
    // Proof: removing detachment exposed mutated C=999 in `boundary evidence detaches...`.
    certificate: structuredClone({
      kind: 'boundary-infeasible',
      stage: prepared.stage,
      request: prepared.request,
      evidence: prepared.evidence,
    }),
  };
}

/**
 * Validate the authoritative request before disposition, then replay the complete real
 * component with foreign pins. Unknown and OS failures cannot certify infeasibility.
 * Trusted broken captured evidence throws; a solver's invalid placement is modeled.
 */
export function evaluateConnectedSolverOutcome(
  stage: ConnectedOptimizationStage,
  request: ConnectedSolverRequest,
  outcome: SolverProcessOutcome,
): ConnectedSolverOutcome {
  // Proof: bypassing replay accepted the forged finish in `trusted broken stage evidence...`.
  replayConnectedStage(stage);
  if (outcome.kind === 'failed') return outcome;
  const parsed = parseConnectedSolverResponse(outcome.stdout, request);
  if (!parsed.ok) return { kind: 'failed', reason: dispositionOfParseFailure(parsed.failure) };
  const response = parsed.response;
  // Proof: bypassing this refusal certified a request with forged foreign starts in `unknown, malformed echo...`.
  const checked = revalidateConnectedSolverResult(stage, request, response);
  if (!checked.ok)
    return { kind: 'failed', reason: dispositionOfRevalidationFailure(checked.failure) };
  if (response.status === 'feasible') {
    const starts = new Map(
      Object.entries(response.offsets).map(([key, offset]) => [key, offset / request.quantum]),
    );
    const reference = new Map(
      Object.entries(request.movementReferenceOffsets).map(([key, offset]) => [
        key,
        offset / request.quantum,
      ]),
    );
    try {
      // Proof: removing foreign pins failed the real adapter selection test; removing both exact
      // foreign timing comparisons admitted the integer-valid fractional drift response.
      const decision = guardConnectedPublication(
        stage,
        starts,
        request.objective === 'pri' ? 'priority' : 'makespan',
        reference,
      );
      return { kind: 'ok', starts, decision, objectiveValues: response.objectiveValues };
    } catch (cause) {
      if (cause instanceof ScheduleInvalidOptimizedStartError)
        return { kind: 'failed', reason: 'invalid-output' };
      throw cause;
    }
  }
  if (response.status === 'unknown') return { kind: 'failed', reason: 'no-solution' };
  // Proof: mapping this arm to failed broke `boundary infeasible exit remains distinct...`.
  if (response.status === 'boundary-infeasible') {
    return {
      kind: 'boundary-infeasible',
      certificate: structuredClone({
        kind: 'boundary-infeasible',
        stage,
        request,
        evidence: { kind: 'solver-proven-infeasible', response },
      }),
    };
  }
  // Proof: bypassing the discriminator fabricated deadline evidence for the effective-boundary
  // fixture with deadline 10. Without a deadline, the later empty-certificate refusal is redundant.
  if (
    request.scope.boundaries.length > 0 ||
    Object.values(request.elsewhere).some((bookings) => bookings.length > 0)
  )
    return { kind: 'failed', reason: 'invalid-output' };
  const rows = stage.input.rows.filter(
    (row) =>
      stage.input.order.kind === 'connected' &&
      stage.input.order.projectIdByWorkItem.get(row.id) === stage.projectId,
  );
  const certificate = planInfeasibleResultOf({
    rows,
    slices: [],
    edges: [],
    typed: [],
    reach: 'whole-item',
    notBefore: stage.input.notBefore,
    deadlines: stage.input.deadlines,
    poolSizes: stage.input.poolSizes,
  });
  // Proof: bypassing emptiness fabricated a certificate in `ordinary infeasibility without a local deadline...`.
  return certificate.items.length === 0
    ? { kind: 'failed', reason: 'invalid-output' }
    : { kind: 'plan-infeasible', certificate };
}
