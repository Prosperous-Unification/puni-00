import {
  buildConnectedSolverRequestPair,
  type ConnectedSolverRequestPair,
} from '@wbs/contracts/solver/build-connected-request';
import {
  type ConnectedSolverOutcome,
  evaluateConnectedSolverOutcome,
  prepareConnectedBoundaryOutcome,
  SOLVER_WIRE_VERSION,
} from '@wbs/contracts/solver/connected-solver-outcome';
import type { SolverProcessOutcome } from '@wbs/contracts/solver/solver-exit-outcome';
import { dispositionOfPreflightFailure } from '@wbs/contracts/solver/solver-failure-disposition';
import type {
  ConnectedOptimizationQuestion,
  ConnectedOptimizedCandidate,
  ConnectedOptimizedCapturedAdapter,
  ConnectedVariantState,
} from '@wbs/core/ports/scheduler';
import {
  type ConnectedOptimizationStage,
  contractVersionOf,
  SOLVER_QUANTUM,
  type SolverObjectiveName,
} from '@wbs/domain';

import { captureConnectedQuestion } from './connected-question-identity';

type CapturedEntry =
  | { readonly kind: 'durable'; readonly outcome: ConnectedSolverOutcome }
  | SolverProcessOutcome
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'retrying' }
  | { readonly kind: 'corrupt'; readonly message: string };

/** A coherent borrowed-snapshot lookup. It has no admission, mutation or child-process capability. */
export interface ConnectedOptimizationReaderOptions {
  readonly solverVersion: string;
  readonly budgetMs: number;
  readonly readPair: (ask: {
    readonly stage: ConnectedOptimizationStage;
    readonly questions: Readonly<Record<SolverObjectiveName, ConnectedOptimizationQuestion>>;
    readonly requests: ConnectedSolverRequestPair;
  }) => {
    readonly generation: number | null;
    readonly variants: Readonly<Record<SolverObjectiveName, CapturedEntry>>;
  };
}

function projectOutcome(
  question: ConnectedOptimizationQuestion,
  outcome: ConnectedSolverOutcome,
): {
  readonly state: ConnectedVariantState;
  readonly candidate: ConnectedOptimizedCandidate | null;
} {
  if (outcome.kind === 'failed')
    return { state: { state: 'failed', reason: outcome.reason }, candidate: null };
  if (outcome.kind === 'plan-infeasible')
    return {
      state: { state: 'plan-infeasible', items: outcome.certificate.items },
      candidate: null,
    };
  // Proof: relabeling this projection as failed broke the prepared fractional adapter selection case.
  if (outcome.kind === 'boundary-infeasible')
    return {
      state: {
        state: 'boundary-infeasible',
        certificate: {
          kind: 'boundary-infeasible',
          question,
          evidence:
            outcome.certificate.evidence.kind === 'contradictory-bounds'
              ? 'contradictory-bounds'
              : 'initial-model-infeasible',
        },
      },
      candidate: null,
    };
  const proof =
    outcome.decision.chosen === 'baseline'
      ? 'quantisation-floor'
      : Object.values(outcome.objectiveValues).every(({ status }) => status === 'optimal')
        ? 'proven'
        : 'incomplete';
  // Proof: using decision.schedule here changed the SQL quantisation-floor case in
  // `saved-plan-connected.test.ts` from baseline to optimized on the later selection replay.
  const starts = new Map(outcome.starts);
  return { state: { state: 'ready', proof }, candidate: { question, starts } };
}

/**
 * Hash and prepare an exact captured stage, then independently revalidate cached wire
 * responses. Construction alone does not install connected runtime support: the owner
 * must supply a durable, read-only source bound to the same snapshot as stage capture.
 * Missing source rows stay visible; this reader never admits work after or during capture.
 */
export function connectedOptimizationReaderOf(
  options: ConnectedOptimizationReaderOptions,
): ConnectedOptimizedCapturedAdapter {
  const contractVersion = contractVersionOf(options.solverVersion);
  return {
    readConnectedCaptured: ({ stage, enabled }) => {
      const questionOf = (objective: SolverObjectiveName): ConnectedOptimizationQuestion =>
        captureConnectedQuestion(stage, objective, options);
      const questions = { pri: questionOf('pri'), time: questionOf('time') };
      const inputHash = questions.pri.inputHash;
      const identity = {
        inputHash,
        contractVersion,
        budgetMs: options.budgetMs,
        quantum: SOLVER_QUANTUM,
        wireVersion: SOLVER_WIRE_VERSION,
      };
      if (!enabled)
        return {
          ...identity,
          generation: null,
          variants: { pri: { state: 'idle' }, time: { state: 'idle' } },
          candidates: { pri: null, time: null },
        };
      const requests = buildConnectedSolverRequestPair(
        stage,
        {
          inputHash,
          questionHashes: { pri: questions.pri.questionHash, time: questions.time.questionHash },
        },
        options,
      );
      const captured = options.readPair({ stage, questions, requests });
      const readVariant = (objective: SolverObjectiveName) => {
        const prepared = requests[objective];
        if (prepared.kind === 'failed')
          return {
            state: {
              state: 'failed' as const,
              reason: dispositionOfPreflightFailure(prepared.failure),
            },
            candidate: null,
          };
        if (prepared.kind === 'boundary-infeasible')
          return projectOutcome(questions[objective], prepareConnectedBoundaryOutcome(prepared));
        const entry = captured.variants[objective];
        if (entry.kind === 'durable') return projectOutcome(questions[objective], entry.outcome);
        if (entry.kind === 'idle' || entry.kind === 'pending' || entry.kind === 'retrying')
          return { state: { state: entry.kind }, candidate: null };
        if (entry.kind === 'corrupt')
          return { state: { state: 'corrupt' as const, message: entry.message }, candidate: null };
        return projectOutcome(
          questions[objective],
          evaluateConnectedSolverOutcome(stage, prepared.request, entry),
        );
      };
      const pri = readVariant('pri');
      const time = readVariant('time');
      return {
        ...identity,
        generation: captured.generation,
        variants: { pri: pri.state, time: time.state },
        candidates: { pri: pri.candidate, time: time.candidate },
      };
    },
  };
}
