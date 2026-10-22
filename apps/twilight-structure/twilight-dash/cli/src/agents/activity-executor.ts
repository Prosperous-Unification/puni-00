import { parseOrThrow, type } from '@shared/validation';
import type { SelectedActivity } from '@twilight-burokrat/contracts';
import type { UIMessageChunk } from 'ai';

import {
  ActivityIdentityCodec,
  AgentRunIdCodec,
  AttemptIdCodec,
  DecisionIdCodec,
  LocatorCodec,
  OwnerIdCodec,
} from '../runs/record-codecs';
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
export interface ActivitySession {
  readonly locator: ExecutorLocator;
  // Opaque live identity: only the creating adapter instance accepts this object.
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
export type OpenReply =
  | { readonly kind: 'opened'; readonly session: ActivitySession }
  | { readonly kind: 'not_started'; readonly reason: 'cancelled_before_dispatch' }
  | {
      readonly kind: 'unresolved';
      readonly preparation: Preparation;
      readonly reason: Uncertainty;
    };
export type SessionLookup =
  | { readonly kind: 'located'; readonly locator: ExecutorLocator }
  | { readonly kind: 'absent'; readonly preparation: Preparation }
  | {
      readonly kind: 'unresolved';
      readonly preparation: Preparation;
      readonly reason: Uncertainty;
    };
export type ResumeReply =
  | { readonly kind: 'attached'; readonly session: ActivitySession }
  | {
      readonly kind: 'unresolved';
      readonly locator: ExecutorLocator;
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
export interface ActivityExecutor {
  readonly kind: ExecutorKind;
  readonly version: string;
  readonly capabilities: RecoveryCapabilities;
  open(preparation: Preparation, signal: AbortSignal): Promise<OpenReply>;
  turn(
    session: ActivitySession,
    request: TurnRequest,
    control: { readonly signal: AbortSignal; readonly onPart: (part: UIMessageChunk) => void },
  ): Promise<TurnReply>;
  lookupSession(preparation: Preparation, signal: AbortSignal): Promise<SessionLookup>;
  resumeSession(locator: ExecutorLocator, signal: AbortSignal): Promise<ResumeReply>;
  inspectEffect(identity: TurnIdentity, signal: AbortSignal): Promise<EffectReply>;
  cancel(
    session: ActivitySession,
  ): Promise<{ readonly kind: 'requested'; readonly locator: ExecutorLocator }>;
  observeQuiescence(locator: ExecutorLocator, signal: AbortSignal): Promise<QuiescenceReply>;
  close(session: ActivitySession): Promise<void>;
}

// Proof: relaxing empty/overlength keys failed the preparation and turn boundary rejection tests.
const Key = type('1 <= string <= 256');
// Proof: removing owner ID, positive/safe epoch or unknown-field checks failed the turn boundary rejection test.
const OwnerCodec = type({
  ownerId: OwnerIdCodec,
  epoch: type('number.integer >= 1').atMost(Number.MAX_SAFE_INTEGER),
}).onUndeclaredKey('reject');
// Proof: weakening version, extra-field or storage-identity codecs failed the preparation boundary rejection test.
const PreparationCodec = type({
  version: '1',
  identity: ActivityIdentityCodec,
  attemptId: AttemptIdCodec,
  creationKey: Key,
}).onUndeclaredKey('reject');
// Proof: allowing another version, extra fields, malformed decision/input or extra cause fields failed the turn boundary rejection test.
const TurnRequestCodec = type({
  version: '1',
  turnKey: Key,
  owner: OwnerCodec,
  cause: type({ kind: "'initial'" })
    .onUndeclaredKey('reject')
    .or(type({ kind: "'decision'", decisionId: DecisionIdCodec }).onUndeclaredKey('reject')),
  input: 'string',
}).onUndeclaredKey('reject');
// Proof: relaxing version/kind/selection/session codecs or extra-field rejection failed the locator boundary rejection test.
const ExecutorLocatorCodec = type({
  version: '1',
  executor: "'api-model' | 'cli-harness' | 'acp' | 'tool' | 'human'",
  executorVersion: 'string>=1',
  preparation: PreparationCodec,
  selection: type({
    bindingDigest: /^[0-9a-f]{64}$/,
    requestedType: 'string>=1',
    matchedType: 'string>=1',
    stepCode: 'string>=1',
    className: 'string>=1',
  }).onUndeclaredKey('reject'),
  session: LocatorCodec.and({ sessionId: AgentRunIdCodec }),
}).onUndeclaredKey('reject');

/** Validates a portable preparation and retains a detached immutable identity; never freezes caller records. */
export function snapshotPreparation(input: Preparation): Preparation {
  const preparation = parseOrThrow(PreparationCodec, input);
  // Proof: replacing the detached copy with freeze(input) failed the preparation caller-mutability test.
  return Object.freeze({ ...preparation, identity: Object.freeze({ ...preparation.identity }) });
}

/** Validates the serializable turn payload before dispatch and leaves live controls with the caller. */
export function snapshotTurnRequest(input: TurnRequest): TurnRequest {
  const request = parseOrThrow(TurnRequestCodec, input);
  // Proof: replacing the detached copy with freeze(input) failed the turn caller-mutability test.
  return Object.freeze({
    ...request,
    owner: Object.freeze({ ...request.owner }),
    cause: Object.freeze({ ...request.cause }),
  });
}

/** Rejects malformed locators or mismatched operations and snapshots only their serializable correlation. */
export function snapshotExecutorLocator(input: ExecutorLocator): ExecutorLocator {
  const locator = parseOrThrow(ExecutorLocatorCodec, input);
  // Proof: removing operation equality failed the mismatched-operation case in the locator boundary test.
  if (locator.session.operationKey !== locator.preparation.identity.operationKey)
    throw new Error('executor locator operation mismatch');
  // Proof: replacing this detached copy with freeze(input) let caller edits change retained locator correlation.
  return Object.freeze({
    ...locator,
    preparation: Object.freeze({
      ...locator.preparation,
      identity: Object.freeze({ ...locator.preparation.identity }),
    }),
    selection: Object.freeze({ ...locator.selection }),
    session: Object.freeze({ ...locator.session }),
  });
}

/** A post-dispatch exception retaining safe immutable correlation and the original private cause. */
export class ActivityDispatchError extends Error {
  readonly identity: TurnIdentity;

  constructor(identity: TurnIdentity, cause: unknown) {
    super('Activity dispatch failed', { cause });
    this.name = 'ActivityDispatchError';
    // Proof: retaining identity directly failed detached correlation; removing either codec failed the corrected void-callback corruption test.
    this.identity = Object.freeze({
      locator: snapshotExecutorLocator(identity.locator),
      turnKey: parseOrThrow(Key, identity.turnKey),
      owner: Object.freeze({ ...parseOrThrow(OwnerCodec, identity.owner) }),
    });
  }
}
