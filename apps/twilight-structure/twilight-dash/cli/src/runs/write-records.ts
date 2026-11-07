import type { RuntimeBasis, WriteReceipt as ReceiverWriteReceipt } from '@wbs/contracts';

import type { TargetObservation } from './claim-records';
import type { Attempt2, ScopeContext, TurnCheckpoint } from './execution-records';
import type {
  ArtifactRef,
  AttemptId,
  AttemptOutcome,
  ExecutionCommandId,
  Quiescence,
  RunId,
} from './records';
import type { RuntimeAcceptance, RuntimeIntent } from './runtime-records';

export interface WriteCompletion1 {
  readonly version: 1;
  readonly outcome: AttemptOutcome;
  readonly quiescence: Quiescence;
}
export type WriteCompletion = WriteCompletion1;
export interface WriteStageCommand1 {
  readonly version: 1;
  readonly kind: 'stage_write';
  readonly commandId: ExecutionCommandId;
  readonly completion: WriteCompletion;
  readonly canonicalRequest: string;
  readonly observation: TargetObservation;
}
export type WriteStageCommand = WriteStageCommand1;
export interface WriteProjection1 {
  readonly version: 1;
  readonly actorId: string;
  readonly basisAfter: RuntimeBasis;
  readonly applied: ReceiverWriteReceipt['acceptance']['applied'];
}
export type WriteProjection = WriteProjection1;
export interface WriteAcceptCommand1 {
  readonly version: 1;
  readonly kind: 'accept_write';
  readonly commandId: ExecutionCommandId;
  readonly stageCommandId: ExecutionCommandId;
  readonly intent: RuntimeIntent;
  readonly evidence: ArtifactRef;
  readonly projection: WriteProjection;
}
export type WriteAcceptCommand = WriteAcceptCommand1;
export interface WriteReceipt1 {
  readonly version: 1;
  readonly stageCommandId: ExecutionCommandId;
  readonly acceptance: RuntimeAcceptance;
  readonly projection: WriteProjection;
}
export type WriteReceipt = WriteReceipt1;
export interface WriteObligation1 {
  readonly version: 1;
  readonly stageCommandId: ExecutionCommandId;
  readonly intent: RuntimeIntent;
  readonly completion: WriteCompletion;
  readonly disposition:
    | { readonly kind: 'pending' }
    | { readonly kind: 'fenced_nonaccepted'; readonly recoveryId: string };
}
export type WriteObligation = WriteObligation1;
interface WriteCheckpoint {
  readonly checkpoint: TurnCheckpoint;
  readonly outcome: AttemptOutcome;
  readonly quiescence: Quiescence;
  readonly stageCommandId: ExecutionCommandId;
}
export type WriteState = WriteCheckpoint &
  (
    | { readonly kind: 'write_pending'; readonly intent: RuntimeIntent }
    | {
        readonly kind: 'write_nonaccepted';
        readonly intent: RuntimeIntent;
        readonly recoveryId: string;
      }
    | { readonly kind: 'write_terminal'; readonly receipt: WriteReceipt }
  );
export interface Attempt4 extends Omit<Attempt2, 'version' | 'state' | 'holdsCapacity'> {
  readonly version: 4;
  readonly state: WriteState;
  readonly holdsCapacity: false;
}
export interface WriteStageAck1 {
  readonly version: 1;
  readonly kind: 'write_staged';
  readonly intent: RuntimeIntent;
  readonly obligation: WriteObligation;
  readonly attempt: Attempt4;
}
export type WriteStageAck = WriteStageAck1;
export interface WriteAcceptAck1 {
  readonly version: 1;
  readonly kind: 'write_accepted';
  readonly receipt: WriteReceipt;
  readonly attempt: Attempt4;
}
export type WriteAcceptAck = WriteAcceptAck1;
interface WriteAssociation {
  readonly version: 1;
  readonly runId: RunId;
  readonly attemptId: AttemptId;
  readonly context: ScopeContext;
}
export interface RecordedWriteStage extends WriteAssociation {
  readonly kind: 'stage_write';
  readonly command: WriteStageCommand;
  readonly reply: WriteStageAck;
}
export interface RecordedWriteAcceptance extends WriteAssociation {
  readonly kind: 'accept_write';
  readonly command: WriteAcceptCommand;
  readonly reply: WriteAcceptAck;
}
export type RecordedWrite1 = RecordedWriteStage | RecordedWriteAcceptance;
export type RecordedWrite = RecordedWrite1;
