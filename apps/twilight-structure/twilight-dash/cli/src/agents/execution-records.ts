import type { SelectedActivity } from '@twilight-burokrat/contracts';

import type {
  ActivityIdentity,
  AttemptId,
  DecisionId,
  Locator as RunLocator,
  Ownership,
} from '../runs/records';

export type ExecutorKind = 'api-model' | 'cli-harness' | 'acp' | 'tool' | 'human';
export type DispatchOwner = Pick<Ownership, 'ownerId' | 'epoch'>;
export interface Preparation {
  readonly version: 1;
  readonly identity: ActivityIdentity;
  readonly attemptId: AttemptId;
  readonly creationKey: string;
}
export interface ExecutorLocator {
  readonly version: 1;
  readonly executor: ExecutorKind;
  readonly executorVersion: string;
  readonly preparation: Preparation;
  readonly selection: Pick<
    SelectedActivity,
    'bindingDigest' | 'requestedType' | 'matchedType' | 'stepCode' | 'className'
  >;
  readonly session: RunLocator; // workerId is adapter incarnation; sessionId is real adapter session
}
export interface TurnRequest {
  readonly version: 1;
  readonly turnKey: string;
  readonly owner: DispatchOwner; // dispatch provenance, not executor authorization/fencing
  readonly cause:
    { readonly kind: 'initial' } | { readonly kind: 'decision'; readonly decisionId: DecisionId };
  readonly input: string;
}
export interface TurnIdentity {
  readonly locator: ExecutorLocator;
  readonly turnKey: string;
  readonly owner: DispatchOwner;
}
export type Usage =
  | { readonly kind: 'measured'; readonly inputTokens: number; readonly outputTokens: number }
  | {
      readonly kind: 'unknown';
      readonly reason:
        | 'provider-usage-unavailable'
        | 'interrupted-before-usage'
        | 'acp-v1-no-usage'
        | 'harness-usage-unavailable'
        | 'tool'
        | 'human';
    };
export interface TurnOutcome {
  readonly text: string;
  readonly usage: Usage;
  readonly finish: 'end_turn' | 'max_steps' | 'output_truncated' | 'refused' | 'cancelled';
}
export type Uncertainty =
  | 'unsupported'
  | 'transport_lost'
  | 'interrupted'
  | 'observer_failed'
  | 'approval_required'
  | 'tool_input_required'
  | 'provider_incomplete'
  | 'turn_in_flight'
  | 'recovery_required';
export type TurnReply =
  | { readonly kind: 'completed'; readonly identity: TurnIdentity; readonly outcome: TurnOutcome }
  | {
      readonly kind: 'not_started';
      readonly identity: TurnIdentity;
      readonly reason: 'cancelled_before_dispatch' | 'session_busy';
    }
  | {
      readonly kind: 'unresolved';
      readonly identity: TurnIdentity;
      readonly reason: Uncertainty;
      readonly text: string;
      readonly usage: Usage;
    };
export type SessionLookup =
  | { readonly kind: 'located'; readonly locator: ExecutorLocator }
  | { readonly kind: 'absent'; readonly preparation: Preparation }
  | {
      readonly kind: 'unresolved';
      readonly preparation: Preparation;
      readonly reason: Uncertainty;
    };
export type EffectReply =
  | { readonly kind: 'succeeded' | 'failed' | 'absent'; readonly identity: TurnIdentity }
  | { readonly kind: 'unresolved'; readonly identity: TurnIdentity; readonly reason: Uncertainty };
export type QuiescenceReply =
  | { readonly kind: 'quiescent' | 'active'; readonly locator: ExecutorLocator }
  | {
      readonly kind: 'unresolved';
      readonly locator: ExecutorLocator;
      readonly reason: Uncertainty;
    };
export interface RecoveryCapabilities {
  readonly locateSession: 'durable' | 'unsupported';
  readonly resumeSession: 'durable' | 'unsupported';
  readonly deduplicatePreparation: 'durable' | 'unsupported';
  readonly deduplicateTurn: 'durable' | 'unsupported';
  readonly inspectEffect: 'authoritative' | 'unsupported';
  readonly cancelPhysicalWork: 'authoritative' | 'unsupported';
  readonly observeQuiescence: 'authoritative' | 'unsupported';
}
