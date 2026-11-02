import type { WriteReceipt as ReceiverWriteReceipt } from '@wbs/contracts';

import type { AttemptId, ExecutionCommandId, RunId } from './records';
import type {
  ClaimRecoveryTarget,
  RecoveryClosure1,
  RecoveryExchangeValue,
  RecoveryFence,
  RecoveryIntent1,
  RecoveryObservation,
  RecoveryReceiptAbsent,
} from './recovery-records';
import type { Attempt4, WriteAcceptAck, WriteAcceptCommand } from './write-records';
export interface WriteRecoveryTarget extends Omit<
  ClaimRecoveryTarget,
  'kind' | 'runId' | 'attemptId' | 'stageCommandId' | 'acceptanceCommandId'
> {
  readonly kind: 'write';
  readonly runId: RunId;
  readonly attemptId: AttemptId;
  readonly stageCommandId: ExecutionCommandId;
  readonly acceptanceCommandId: ExecutionCommandId;
}
export interface WriteRecoveryIntent extends Omit<RecoveryIntent1, 'version' | 'target'> {
  readonly version: 2;
  readonly target: WriteRecoveryTarget;
}
export type WriteRecoveryDecision =
  | {
      readonly kind: 'accepted';
      readonly lookup: RecoveryExchangeValue<ReceiverWriteReceipt>;
      readonly command: WriteAcceptCommand;
    }
  | {
      readonly kind: 'fenced_nonaccepted';
      readonly lookup: RecoveryExchangeValue<RecoveryReceiptAbsent>;
    };
export interface WriteRecoveryClosure extends Omit<
  RecoveryClosure1,
  'version' | 'decision' | 'originalReply' | 'attemptReply'
> {
  readonly version: 2;
  readonly decision: WriteRecoveryDecision;
  readonly originalReply: null | {
    readonly kind: 'write';
    readonly command: WriteAcceptCommand;
    readonly ack: WriteAcceptAck;
  };
  readonly attemptReply: Attempt4;
}
export interface WriteRecoveryHistory {
  readonly version: 2;
  readonly intent: WriteRecoveryIntent;
  readonly revision: number;
  readonly fences: readonly RecoveryFence[];
  readonly observations: readonly RecoveryObservation[];
  readonly closure: WriteRecoveryClosure | null;
}
