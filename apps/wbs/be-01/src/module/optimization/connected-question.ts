import { buildConnectedSolverRequestPair } from '@wbs/contracts/solver/build-connected-request';
import {
  type ConnectedDigest,
  createConnectedQuestionIdentity,
  encodeBoundaryCertificate,
  encodeConnectedSuccess,
} from '@wbs/contracts/solver/connected-durable';
import {
  evaluateConnectedSolverOutcome,
  prepareConnectedBoundaryOutcome,
} from '@wbs/contracts/solver/connected-solver-outcome';
import type { SolverProcessOutcome } from '@wbs/contracts/solver/solver-exit-outcome';
import { dispositionOfPreflightFailure } from '@wbs/contracts/solver/solver-failure-disposition';
import {
  canonicalConnectedStageInput,
  type ConnectedOptimizationStage,
  type SolverObjectiveName,
} from '@wbs/domain';

/** Prepare both exact questions once from detached boundaries and the installed runtime. */
export function prepareConnectedQuestion(
  stage: ConnectedOptimizationStage,
  installed: { readonly solverVersion: string; readonly budgetMs: number },
  hash: ConnectedDigest,
) {
  const stageBytes = canonicalConnectedStageInput(stage);
  const question = (objective: SolverObjectiveName) => ({
    ...createConnectedQuestionIdentity(stage, objective, installed, hash),
    stageBytes,
  });
  const questions = { pri: question('pri'), time: question('time') };
  const requests = buildConnectedSolverRequestPair(
    stage,
    {
      inputHash: questions.pri.inputHash,
      questionHashes: { pri: questions.pri.questionHash, time: questions.time.questionHash },
    },
    installed,
  );
  return { stage, questions, requests };
}

/** Encode only independently validated evidence; preflight contradictions require no child. */
export function connectedOutcomeOf(
  prepared: ReturnType<typeof prepareConnectedQuestion>,
  objective: SolverObjectiveName,
  hash: ConnectedDigest,
  process?: SolverProcessOutcome,
) {
  const built = prepared.requests[objective];
  if (built.kind === 'failed')
    return { kind: 'failed' as const, reason: dispositionOfPreflightFailure(built.failure) };
  const outcome =
    built.kind === 'boundary-infeasible'
      ? prepareConnectedBoundaryOutcome(built)
      : evaluateConnectedSolverOutcome(prepared.stage, built.request, requireProcess(process));
  const { stageBytes: _stageBytes, ...identity } = prepared.questions[objective];
  if (outcome.kind === 'boundary-infeasible')
    return {
      kind: 'boundary-infeasible' as const,
      certificate: encodeBoundaryCertificate(
        prepared.stage,
        identity,
        built.request,
        outcome.certificate.evidence,
        hash,
      ),
    };
  if (outcome.kind !== 'ok') return outcome;
  const response = requireProcess(process);
  if (response.kind !== 'response') throw new Error('connected success lacks response');
  return {
    kind: 'ok' as const,
    success: encodeConnectedSuccess(prepared.stage, identity, built.request, response.stdout, hash),
  };
}
function requireProcess(process: SolverProcessOutcome | undefined): SolverProcessOutcome {
  if (process === undefined) throw new Error('connected request lacks child outcome');
  return process;
}
