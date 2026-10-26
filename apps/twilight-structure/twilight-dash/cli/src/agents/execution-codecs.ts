import { parseOrThrow, type } from '@shared/validation';

import {
  ActivityIdentityCodec,
  AgentRunIdCodec,
  AttemptIdCodec,
  DecisionIdCodec,
  Integer,
  LocatorCodec,
  OwnerIdCodec,
} from '../runs/value-codecs';
import type {
  ExecutorLocator,
  Preparation,
  TurnIdentity,
  TurnReply,
  TurnRequest,
} from './execution-records';

// Proof: relaxing empty/overlength keys failed the preparation and turn boundary rejection tests.
const Key = type('1 <= string <= 256');
// Proof: removing owner ID, positive/safe epoch or unknown-field checks failed the turn boundary rejection test.
const OwnerCodec = type({
  ownerId: OwnerIdCodec,
  epoch: type('number.integer >= 1').atMost(Number.MAX_SAFE_INTEGER),
}).onUndeclaredKey('reject');
// Proof: weakening version, extra-field or storage-identity codecs failed the preparation boundary rejection test.
export const PreparationCodec = type({
  version: '1',
  identity: ActivityIdentityCodec,
  attemptId: AttemptIdCodec,
  creationKey: Key,
}).onUndeclaredKey('reject');
// Proof: allowing another version, extra fields, malformed decision/input or extra cause fields failed the turn boundary rejection test.
export const TurnRequestCodec = type({
  version: '1',
  turnKey: Key,
  owner: OwnerCodec,
  cause: type({ kind: "'initial'" })
    .onUndeclaredKey('reject')
    .or(type({ kind: "'decision'", decisionId: DecisionIdCodec }).onUndeclaredKey('reject')),
  input: 'string',
}).onUndeclaredKey('reject');
// Proof: relaxing version/kind/selection/session codecs or extra-field rejection failed the locator boundary rejection test.
export const ExecutorLocatorCodec = type({
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
})
  .onUndeclaredKey('reject')
  // Proof: F22S bypassed equality; 'complete reply codecs reject malformed identity key owner versions and locator operation mismatch' failed.
  .narrow(
    (locator, context) =>
      locator.session.operationKey === locator.preparation.identity.operationKey ||
      context.mustBe('executor locator operation correspondence'),
  );

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
  return freezeLocator(locator);
}

/** Copies a validated portable locator and freezes every retained correlation branch. */
function freezeLocator(locator: ExecutorLocator): ExecutorLocator {
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

// Proof: F12S/F13S/F14S bypassed key/owner/locator dependencies; 'complete reply codecs reject malformed identity key owner versions and locator operation mismatch' failed.
// Proof: F15S allowed an extra identity field; 'complete reply codecs reject unknown keys in each portable branch' failed.
export const TurnIdentityCodec = type({
  locator: ExecutorLocatorCodec,
  turnKey: Key,
  owner: OwnerCodec,
}).onUndeclaredKey('reject');

// Proof: F04/F05R/F09 widened measured/unknown kinds or unknown reasons; 'complete reply codecs reject invalid discriminants finishes reasons and omitted variant fields' failed.
// Proof: F10/F11S replaced each Integer dependency with number; 'complete reply codecs reject negative fractional nonfinite and unsafe measured counts on either variant' failed on negative counts.
// Proof: F16S/F17S allowed extra measured/unknown fields; 'complete reply codecs reject unknown keys in each portable branch' failed.
export const UsageCodec = type({
  kind: "'measured'",
  inputTokens: Integer,
  outputTokens: Integer,
})
  .onUndeclaredKey('reject')
  .or(
    type({
      kind: "'unknown'",
      reason:
        "'provider-usage-unavailable' | 'interrupted-before-usage' | 'acp-v1-no-usage' | 'harness-usage-unavailable' | 'tool' | 'human'",
    }).onUndeclaredKey('reject'),
  );

// Proof: F08 admitted another uncertainty; 'complete reply codecs reject invalid discriminants finishes reasons and omitted variant fields' failed.
const UncertaintyCodec = type(
  "'unsupported' | 'transport_lost' | 'interrupted' | 'observer_failed' | 'approval_required' | 'tool_input_required' | 'provider_incomplete' | 'turn_in_flight' | 'recovery_required'",
);

// Proof: F01/F02/F03/F06/F07 widened reply kinds, finish or not-started reason; 'complete reply codecs reject invalid discriminants finishes reasons and omitted variant fields' failed.
// Proof: F18S/F19S/F20S/F21S allowed extras in outcome/completed/not-started/unresolved; 'complete reply codecs reject unknown keys in each portable branch' failed.
export const TurnReplyCodec = type({
  kind: "'completed'",
  identity: TurnIdentityCodec,
  outcome: type({
    text: 'string',
    usage: UsageCodec,
    finish: "'end_turn' | 'max_steps' | 'output_truncated' | 'refused' | 'cancelled'",
  }).onUndeclaredKey('reject'),
})
  .onUndeclaredKey('reject')
  .or(
    type({
      kind: "'not_started'",
      identity: TurnIdentityCodec,
      reason: "'cancelled_before_dispatch' | 'session_busy'",
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'unresolved'",
      identity: TurnIdentityCodec,
      reason: UncertaintyCodec,
      text: 'string',
      usage: UsageCodec,
    }).onUndeclaredKey('reject'),
  );

/** Copies already validated correlation, freezing each branch without freezing the caller. */
function freezeIdentity(identity: TurnIdentity): TurnIdentity {
  // Proof: F24S/F25S/F26S/F31S aliased locator/owner or removed owner/identity freeze; 'complete reply snapshots freeze and detach every branch while callers remain editable' failed.
  return Object.freeze({
    locator: freezeLocator(identity.locator),
    turnKey: identity.turnKey,
    owner: Object.freeze({ ...identity.owner }),
  });
}

/**
 * Validates the complete portable reply once and returns a detached deeply immutable snapshot.
 * Preserves empty/partial text and unknown usage; live sessions, controls and errors are rejected.
 */
export function snapshotTurnReply(input: unknown): TurnReply {
  // Proof: F23S bypassed the reply codec; 'complete reply codecs reject unknown keys in each portable branch' accepted an extra reply field and failed.
  const reply = parseOrThrow(TurnReplyCodec, input);
  const identity = freezeIdentity(reply.identity);
  switch (reply.kind) {
    case 'completed':
      // Proof: R1-F01 removed only the completed outer reply freeze; 'complete reply snapshots freeze and detach every branch while callers remain editable' failed its frozen-state assertion.
      // Proof: F27S/F28S removed outcome/usage freeze; 'complete reply snapshots freeze and detach every branch while callers remain editable' failed.
      return Object.freeze({
        ...reply,
        identity,
        outcome: Object.freeze({
          ...reply.outcome,
          usage: Object.freeze({ ...reply.outcome.usage }),
        }),
      });
    case 'not_started':
      // Proof: F29S removed reply freeze; the complete-reply caller-mutability test failed.
      return Object.freeze({ ...reply, identity });
    case 'unresolved':
      // Proof: R1-F02 removed only the unresolved outer reply freeze; 'complete reply snapshots freeze and detach every branch while callers remain editable' failed its frozen-state assertion.
      // Proof: F30S removed usage freeze; the complete-reply caller-mutability test failed.
      return Object.freeze({ ...reply, identity, usage: Object.freeze({ ...reply.usage }) });
  }
}
