import { createHash } from 'node:crypto';

import {
  type ConnectedQuestionIdentity,
  createConnectedQuestionIdentity,
} from '@wbs/contracts/solver/connected-durable';
import {
  canonicalConnectedStageInput,
  type ConnectedOptimizationStage,
  type SolverObjectiveName,
} from '@wbs/domain';

/** SHA-256 of canonical UTF-8 bytes, shared by durable connected codecs and captured stage readers. */
export function hashConnectedBytes(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

/** Capture exact stage bytes together with the complete question tuple; runtime fences stay outside identity. */
export function captureConnectedQuestion(
  stage: ConnectedOptimizationStage,
  objective: SolverObjectiveName,
  installed: { readonly solverVersion: string; readonly budgetMs: number },
): ConnectedQuestionIdentity & { readonly stageBytes: string } {
  return {
    ...createConnectedQuestionIdentity(stage, objective, installed, hashConnectedBytes),
    stageBytes: canonicalConnectedStageInput(stage),
  };
}
