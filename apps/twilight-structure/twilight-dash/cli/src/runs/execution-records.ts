import type {
  DispatchOwner,
  ExecutorLocator,
  TurnReply,
  TurnRequest,
} from '../agents/execution-records';
import type {
  ClaimBinding,
  Claimed,
  ClaimProjection,
  Located,
  PreparationIntent,
  TargetObservation,
  TurnIntent,
} from './claim-records';
import type {
  ActivityIdentity,
  ArtifactRef,
  AttemptId,
  AttemptOutcome,
  CommandId,
  CommandReceipt,
  Completion,
  Decision,
  DecisionId,
  Epoch,
  ExecutionCommandId,
  HumanWait,
  Ordinal,
  Quiescence,
  Revision,
  Run,
} from './records';
import type { Attempt3, RecoveryClosure } from './recovery-records';
import type { RuntimeAcceptance, RuntimeIntent } from './runtime-records';

/** Nonrecursive retained execution checkpoint; wrappers preserve it through uncertainty and settlement. */
export type Checkpoint =
  | { readonly kind: 'queued' }
  | { readonly kind: 'preparing'; readonly preparation: PreparationIntent }
  | { readonly kind: 'prepared'; readonly session: Located }
  | {
      readonly kind: 'claiming';
      readonly session: Located;
      readonly intent: RuntimeIntent;
      readonly observation: TargetObservation;
    }
  | { readonly kind: 'ready'; readonly execution: Claimed; readonly cause: TurnRequest['cause'] }
  | { readonly kind: 'turn_pending'; readonly execution: Claimed; readonly turn: TurnIntent }
  | {
      readonly kind: 'turn_returned';
      readonly execution: Claimed;
      readonly turn: TurnIntent;
      readonly reply: Extract<TurnReply, { kind: 'completed' }>;
    };
export type TurnCheckpoint = Extract<Checkpoint, { kind: 'turn_pending' | 'turn_returned' }>;
export type UnresolvedEvidence =
  | { readonly kind: 'artifact'; readonly reason: string; readonly evidence: ArtifactRef }
  | { readonly kind: 'turn'; readonly reply: Extract<TurnReply, { kind: 'unresolved' }> };
export type AttemptState =
  | Checkpoint
  | { readonly kind: 'reconciling'; readonly checkpoint: Checkpoint; readonly reason: string }
  | {
      readonly kind: 'unresolved';
      readonly checkpoint: Checkpoint;
      readonly observation: UnresolvedEvidence;
    }
  | {
      readonly kind: 'interrupted';
      readonly checkpoint: Checkpoint;
      readonly quiescence: Quiescence;
    }
  | {
      readonly kind: 'waiting_for_person';
      readonly checkpoint: TurnCheckpoint;
      readonly wait: HumanWait;
      readonly quiescence: Quiescence;
    }
  | {
      readonly kind: 'outcome_pending_progress';
      readonly checkpoint: TurnCheckpoint;
      readonly outcome: AttemptOutcome;
      readonly commandId: CommandId;
      readonly quiescence: Quiescence;
    }
  | {
      readonly kind: 'terminal';
      readonly checkpoint: TurnCheckpoint;
      readonly outcome: AttemptOutcome;
      readonly receipt: CommandReceipt;
      readonly quiescence: Quiescence;
    };
export type Attempt = Attempt2 | Attempt3;
export type { Attempt3 } from './recovery-records';
export interface Attempt2 {
  readonly version: 2;
  readonly attemptId: AttemptId;
  readonly identity: ActivityIdentity;
  readonly ordinal: Ordinal;
  readonly revision: Revision;
  readonly admittedEpoch: Epoch;
  readonly state: AttemptState;
  readonly holdsCapacity: boolean;
}
export type ExecutionFact =
  | { readonly kind: 'preparation_intended'; readonly intent: PreparationIntent }
  | {
      readonly kind: 'session_prepared';
      readonly locator: ExecutorLocator;
      readonly owner: DispatchOwner;
    }
  | {
      readonly kind: 'session_reattached';
      readonly locator: ExecutorLocator;
      readonly owner: DispatchOwner;
      readonly evidence: ArtifactRef;
    }
  | { readonly kind: 'turn_observed'; readonly reply: TurnReply }
  | { readonly kind: 'recovery_required'; readonly reason: string }
  | { readonly kind: 'unresolved'; readonly reason: string; readonly evidence: ArtifactRef }
  | { readonly kind: 'interrupted'; readonly quiescence: Quiescence }
  | { readonly kind: 'waiting'; readonly wait: HumanWait; readonly quiescence: Quiescence };
export interface ExecutionCommand {
  readonly version: 2;
  readonly kind: 'execution';
  readonly commandId: ExecutionCommandId;
  readonly fact: ExecutionFact;
}
export interface ClaimStageCommand {
  readonly version: 2;
  readonly kind: 'stage_claim';
  readonly commandId: ExecutionCommandId;
  readonly canonicalRequest: string;
  readonly observation: TargetObservation;
}
export interface ClaimAcceptCommand {
  readonly version: 2;
  readonly kind: 'accept_claim';
  readonly commandId: ExecutionCommandId;
  readonly intent: RuntimeIntent;
  readonly evidence: ArtifactRef;
  readonly projection: ClaimProjection;
}
export interface TurnStageCommand {
  readonly version: 2;
  readonly kind: 'stage_turn';
  readonly commandId: ExecutionCommandId;
  readonly request: TurnRequest;
}
export type ExecutionSubmission =
  ExecutionCommand | ClaimStageCommand | ClaimAcceptCommand | TurnStageCommand;
export interface ExecutionAck {
  readonly version: 1;
  readonly kind: 'execution';
  readonly attempt: Attempt2;
}
export interface ClaimStageAck {
  readonly version: 1;
  readonly kind: 'claim_staged';
  readonly intent: RuntimeIntent;
  readonly attempt: Attempt2;
}
export interface ClaimAcceptAck {
  readonly version: 1;
  readonly kind: 'claim_accepted';
  readonly acceptance: RuntimeAcceptance;
  readonly binding: ClaimBinding;
  readonly attempt: Attempt2;
}
export interface TurnStageAck {
  readonly version: 1;
  readonly kind: 'turn_staged';
  readonly intent: TurnIntent;
  readonly attempt: Attempt2;
}
export interface ScopeContext {
  readonly version: 1;
  readonly scopeRevision: Revision;
}
/** Provider-owned historical scope cut is independent of generated acknowledgements and excluded from retry identity. */
export type ExecutionRecord =
  | { readonly version: 1; readonly command: ExecutionCommand; readonly context: null }
  | { readonly version: 1; readonly command: ClaimStageCommand; readonly context: ScopeContext }
  | { readonly version: 1; readonly command: ClaimAcceptCommand; readonly context: ScopeContext }
  | { readonly version: 1; readonly command: TurnStageCommand; readonly context: ScopeContext };
export type RecordedExecution =
  | {
      readonly version: 1;
      readonly command: ExecutionCommand;
      readonly context: null;
      readonly reply: ExecutionAck;
    }
  | {
      readonly version: 1;
      readonly command: ClaimStageCommand;
      readonly context: ScopeContext;
      readonly reply: ClaimStageAck;
    }
  | {
      readonly version: 1;
      readonly command: ClaimAcceptCommand;
      readonly context: ScopeContext;
      readonly reply: ClaimAcceptAck;
    }
  | {
      readonly version: 1;
      readonly command: TurnStageCommand;
      readonly context: ScopeContext;
      readonly reply: TurnStageAck;
    };
export type ExecutionHistory = ExecutionHistory1 | ExecutionHistory2;
export interface ExecutionHistory2 extends Omit<ExecutionHistory1, 'version' | 'attempt'> {
  readonly version: 2;
  readonly attempt: Attempt;
  readonly recoveries: readonly RecoveryClosure[];
}
export interface ExecutionHistory1 {
  readonly version: 1;
  readonly run: Run;
  readonly attempt: Attempt2;
  readonly executions: readonly RecordedExecution[];
  readonly consumptions: readonly RecordedConsumption[];
  readonly decisions: readonly Decision[];
  readonly completion: RecordedCompletion | null;
  readonly receipt: RecordedReceipt | null;
}

export interface RecordedCompletion {
  readonly version: 1;
  readonly reply: Attempt2;
  readonly attemptId: AttemptId;
  readonly completion: Completion;
}

export interface RecordedReceipt {
  readonly receipt: CommandReceipt;
  readonly reply: Attempt2;
}

export interface RecordedConsumption {
  readonly decisionId: DecisionId;
  readonly wait: HumanWait;
  readonly reply: Attempt2;
}
