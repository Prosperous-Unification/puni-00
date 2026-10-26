import { parseOrThrow, type } from '@shared/validation';

import {
  ExecutorLocatorCodec,
  PreparationCodec,
  TurnReplyCodec,
  TurnRequestCodec,
} from '../agents/execution-codecs';
import { acceptanceCodec, intentCodec, scopeCodec } from './runtime-codecs';
import {
  ActivityIdentityCodec,
  ArtifactDigestCodec,
  ArtifactRefCodec,
  AttemptIdCodec,
  CommandIdCodec,
  CorrelationKeyCodec,
  ExecutionCommandIdCodec,
  Integer,
  ManifestDigestCodec,
  OperationKeyCodec,
  OwnershipCodec,
  Positive,
  RunIdCodec,
  WorkItemIdCodec,
} from './value-codecs';

export const QuiescenceCodec = type({
  version: '1',
  operationKey: OperationKeyCodec,
  observedAt: Integer,
  evidence: ArtifactRefCodec,
  effect: "'absent' | 'succeeded' | 'failed' | 'unknown'",
}).onUndeclaredKey('reject');
export const HumanWaitCodec = type({
  version: '1',
  correlationKey: CorrelationKeyCodec,
  prompt: ArtifactRefCodec,
  // Proof: bypassing wait choice nonempty enforcement failed 'memory execution > waiting requires exact claim unique choices and determinate quiescence'.
  choices: type('string>=1').array().atLeastLength(1),
})
  .onUndeclaredKey('reject')
  .narrow(
    (wait, context) =>
      // Proof: bypassing wait choice unique enforcement failed 'memory execution > waiting requires exact claim unique choices and determinate quiescence'.
      new Set(wait.choices).size === wait.choices.length || context.mustBe('unique wait choices'),
  );
export const AttemptOutcomeCodec = type({
  version: '1',
  kind: "'succeeded' | 'failed' | 'cancelled'",
  artifacts: ArtifactRefCodec.array(),
  summary: 'string',
}).onUndeclaredKey('reject');

// Proof: F112 replaced this composition with unknown; 'local strict compositions' TargetObservationCodec lost rejection in 3 independent owned negatives while its retained positive passed. Exact restoration passed.
export const TargetObservationCodec = type({
  version: '1',
  evidence: ArtifactRefCodec,
  scope: scopeCodec,
  ledgerId: 'string>=1',
  basis: /^rb1:[0-9a-f]{64}$/,
  workItemId: WorkItemIdCodec,
  stepId: 'string>=1',
  stepCode: 'string>=1',
}).onUndeclaredKey('reject');
const ownerCodec = TurnRequestCodec.get('owner');
// Proof: F135 bypassed only the outer unknown-key rejection; 'PreparationIntentCodec rejects its own unknown key' lost rejection. Exact restoration passed.
// Proof: F136 bypassed only the owned version constraint; 'PreparationIntentCodec rejects owned version 2' lost rejection. Exact restoration passed.
// Proof: F137 bypassed only the required target; 'PreparationIntentCodec rejects its own missing target' lost rejection. Exact restoration passed.
export const PreparationIntentCodec = type({
  version: '1',
  preparation: PreparationCodec,
  manifestDigest: ManifestDigestCodec,
  selection: ExecutorLocatorCodec.get('selection'),
  executor: type({
    kind: "'api-model' | 'cli-harness' | 'acp' | 'tool' | 'human'",
    version: 'string>=1',
  }).onUndeclaredKey('reject'),
  target: type({
    observation: TargetObservationCodec,
    parentClaimId: 'string>=1 | null',
  }).onUndeclaredKey('reject'),
  owner: ownerCodec,
}).onUndeclaredKey('reject');
// Proof: F113 replaced this composition with unknown; 'local strict compositions' AttachmentCodec lost rejection in 3 independent owned negatives while its retained positive passed. Exact restoration passed.
export const AttachmentCodec = type({ version: '1', kind: "'opened'", owner: ownerCodec })
  .onUndeclaredKey('reject')
  .or(
    type({
      version: '1',
      kind: "'reattached'",
      owner: ownerCodec,
      evidence: ArtifactRefCodec,
    }).onUndeclaredKey('reject'),
  );
// Proof: F114 replaced this composition with unknown; 'local strict compositions' ClaimProjectionCodec lost rejection in 4 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ClaimProjectionCodec = type({
  version: '1',
  claimId: 'string>=1',
  actorId: 'string>=1',
  basisAfter: /^rb1:[0-9a-f]{64}$/,
}).onUndeclaredKey('reject');
// Proof: F115 replaced this composition with unknown; 'local strict compositions' ClaimBindingCodec lost rejection in 3 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ClaimBindingCodec = type({
  version: '1',
  intent: intentCodec,
  acceptance: acceptanceCodec,
  projection: ClaimProjectionCodec,
}).onUndeclaredKey('reject');
// Proof: F116 replaced this composition with unknown; 'local strict compositions' ClaimRefCodec lost rejection in 3 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ClaimRefCodec = type({
  version: '1',
  commandId: 'string>=1',
  requestDigest: ArtifactDigestCodec,
  runId: RunIdCodec,
  attemptId: AttemptIdCodec,
}).onUndeclaredKey('reject');
// Proof: F117 replaced this composition with unknown; 'local strict compositions' TurnIntentCodec lost rejection in 3 independent owned negatives while its retained positive passed. Exact restoration passed.
export const TurnIntentCodec = type({
  version: '1',
  locator: ExecutorLocatorCodec,
  claim: ClaimRefCodec,
  grantCommandId: 'string>=1',
  request: TurnRequestCodec,
}).onUndeclaredKey('reject');
// Proof: F118 replaced this composition with unknown; 'local strict compositions' LocatedCodec lost rejection in 3 independent owned negatives while its retained positive passed. Exact restoration passed.
export const LocatedCodec = type({
  version: '1',
  preparation: PreparationIntentCodec,
  locator: ExecutorLocatorCodec,
  attachment: AttachmentCodec,
}).onUndeclaredKey('reject');
// Proof: F119 replaced this composition with unknown; 'local strict compositions' ClaimedCodec lost rejection in 3 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ClaimedCodec = type({
  version: '1',
  session: LocatedCodec,
  binding: ClaimBindingCodec,
}).onUndeclaredKey('reject');
// Proof: F138 replaced this composition with unknown; 'local strict compositions' ProgressIntentCodec lost rejection in 4 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ProgressIntentCodec = type({
  version: '2',
  commandId: CommandIdCodec,
  claim: ClaimRefCodec,
  expectedWbsRevision: 'string>=1',
  outcome: AttemptOutcomeCodec,
  commandDigest: ArtifactDigestCodec,
}).onUndeclaredKey('reject');
// Proof: F120 replaced this composition with unknown; 'local strict compositions' CommandReceiptCodec lost rejection in 4 independent owned negatives while its retained positive passed. Exact restoration passed.
export const CommandReceiptCodec = type({
  version: '2',
  commandId: CommandIdCodec,
  commandDigest: ArtifactDigestCodec,
  claim: ClaimRefCodec,
  acceptedWbsRevision: 'string>=1',
  evidence: ArtifactRefCodec,
}).onUndeclaredKey('reject');
// Proof: F121 replaced this composition with unknown; 'local strict compositions' CompletionCodec lost rejection in 4 independent owned negatives while its retained positive passed. Exact restoration passed.
export const CompletionCodec = type({
  version: '2',
  outcome: AttemptOutcomeCodec,
  intent: ProgressIntentCodec,
  quiescence: QuiescenceCodec,
}).onUndeclaredKey('reject');
const TurnCheckpointCodec = type({
  kind: "'turn_pending'",
  execution: ClaimedCodec,
  turn: TurnIntentCodec,
})
  .onUndeclaredKey('reject')
  .or(
    type({
      kind: "'turn_returned'",
      execution: ClaimedCodec,
      turn: TurnIntentCodec,
      reply: TurnReplyCodec.extract({ kind: "'completed'" }),
    }).onUndeclaredKey('reject'),
  );
// Proof: F122 replaced this composition with unknown; 'local strict compositions' CheckpointCodec lost rejection in 2 independent owned negatives while its retained positive passed. Exact restoration passed.
export const CheckpointCodec = type({ kind: "'queued'" })
  .onUndeclaredKey('reject')
  .or(type({ kind: "'preparing'", preparation: PreparationIntentCodec }).onUndeclaredKey('reject'))
  .or(type({ kind: "'prepared'", session: LocatedCodec }).onUndeclaredKey('reject'))
  .or(
    type({
      kind: "'claiming'",
      session: LocatedCodec,
      intent: intentCodec,
      observation: TargetObservationCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'ready'",
      execution: ClaimedCodec,
      cause: TurnRequestCodec.get('cause'),
    }).onUndeclaredKey('reject'),
  )
  .or(TurnCheckpointCodec);
const UnresolvedEvidenceCodec = type({
  kind: "'artifact'",
  reason: 'string>=1',
  evidence: ArtifactRefCodec,
})
  .onUndeclaredKey('reject')
  .or(
    type({
      kind: "'turn'",
      reply: TurnReplyCodec.extract({ kind: "'unresolved'" }),
    }).onUndeclaredKey('reject'),
  );
// Proof: F123 replaced this composition with unknown; 'local strict compositions' AttemptStateCodec lost rejection in 3 independent owned negatives while its retained positive passed. Exact restoration passed.
export const AttemptStateCodec = CheckpointCodec.or(
  type({ kind: "'reconciling'", checkpoint: CheckpointCodec, reason: 'string>=1' }).onUndeclaredKey(
    'reject',
  ),
)
  .or(
    type({
      kind: "'unresolved'",
      checkpoint: CheckpointCodec,
      observation: UnresolvedEvidenceCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'interrupted'",
      checkpoint: CheckpointCodec,
      quiescence: QuiescenceCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'waiting_for_person'",
      checkpoint: TurnCheckpointCodec,
      wait: HumanWaitCodec,
      quiescence: QuiescenceCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'outcome_pending_progress'",
      checkpoint: TurnCheckpointCodec,
      outcome: AttemptOutcomeCodec,
      commandId: CommandIdCodec,
      quiescence: QuiescenceCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'terminal'",
      checkpoint: TurnCheckpointCodec,
      outcome: AttemptOutcomeCodec,
      receipt: CommandReceiptCodec,
      quiescence: QuiescenceCodec,
    }).onUndeclaredKey('reject'),
  );
// Proof: F124 replaced this composition with unknown; 'local strict compositions' AttemptCodec lost rejection in 4 independent owned negatives while its retained positive passed. Exact restoration passed.
export const AttemptCodec = type({
  version: '2',
  attemptId: AttemptIdCodec,
  identity: ActivityIdentityCodec,
  ordinal: Positive,
  revision: Integer,
  admittedEpoch: Positive,
  state: AttemptStateCodec,
  holdsCapacity: 'boolean',
}).onUndeclaredKey('reject');
// Proof: F125 replaced this composition with unknown; 'local strict compositions' ExecutionFactCodec lost rejection in 2 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ExecutionFactCodec = type({
  kind: "'preparation_intended'",
  intent: PreparationIntentCodec,
})
  .onUndeclaredKey('reject')
  .or(
    type({
      kind: "'session_prepared'",
      locator: ExecutorLocatorCodec,
      owner: ownerCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      kind: "'session_reattached'",
      locator: ExecutorLocatorCodec,
      owner: ownerCodec,
      evidence: ArtifactRefCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(type({ kind: "'turn_observed'", reply: TurnReplyCodec }).onUndeclaredKey('reject'))
  .or(type({ kind: "'recovery_required'", reason: 'string>=1' }).onUndeclaredKey('reject'))
  .or(
    type({ kind: "'unresolved'", reason: 'string>=1', evidence: ArtifactRefCodec }).onUndeclaredKey(
      'reject',
    ),
  )
  .or(type({ kind: "'interrupted'", quiescence: QuiescenceCodec }).onUndeclaredKey('reject'))
  .or(
    type({ kind: "'waiting'", wait: HumanWaitCodec, quiescence: QuiescenceCodec }).onUndeclaredKey(
      'reject',
    ),
  );
// Proof: F126 replaced this composition with unknown; 'local strict compositions' ExecutionCommandCodec lost rejection in 4 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ExecutionCommandCodec = type({
  version: '2',
  kind: "'execution'",
  commandId: ExecutionCommandIdCodec,
  fact: ExecutionFactCodec,
}).onUndeclaredKey('reject');
// Proof: F127 replaced this composition with unknown; 'local strict compositions' ClaimStageCommandCodec lost rejection in 4 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ClaimStageCommandCodec = type({
  version: '2',
  kind: "'stage_claim'",
  commandId: ExecutionCommandIdCodec,
  canonicalRequest: 'string>=1',
  observation: TargetObservationCodec,
}).onUndeclaredKey('reject');
// Proof: F128 replaced this composition with unknown; 'local strict compositions' ClaimAcceptCommandCodec lost rejection in 4 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ClaimAcceptCommandCodec = type({
  version: '2',
  kind: "'accept_claim'",
  commandId: ExecutionCommandIdCodec,
  intent: intentCodec,
  evidence: ArtifactRefCodec,
  projection: ClaimProjectionCodec,
}).onUndeclaredKey('reject');
// Proof: F129 replaced this composition with unknown; 'local strict compositions' TurnStageCommandCodec lost rejection in 4 independent owned negatives while its retained positive passed. Exact restoration passed.
export const TurnStageCommandCodec = type({
  version: '2',
  kind: "'stage_turn'",
  commandId: ExecutionCommandIdCodec,
  request: TurnRequestCodec,
}).onUndeclaredKey('reject');
// Proof: F130 replaced this composition with unknown; 'local strict compositions' ScopeContextCodec lost rejection in 6 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ScopeContextCodec = type({ version: '1', scopeRevision: Integer }).onUndeclaredKey(
  'reject',
);
const ExecutionAckCodec = type({
  version: '1',
  kind: "'execution'",
  attempt: AttemptCodec,
}).onUndeclaredKey('reject');
const ClaimStageAckCodec = type({
  version: '1',
  kind: "'claim_staged'",
  intent: intentCodec,
  attempt: AttemptCodec,
}).onUndeclaredKey('reject');
const ClaimAcceptAckCodec = type({
  version: '1',
  kind: "'claim_accepted'",
  acceptance: acceptanceCodec,
  binding: ClaimBindingCodec,
  attempt: AttemptCodec,
}).onUndeclaredKey('reject');
const TurnStageAckCodec = type({
  version: '1',
  kind: "'turn_staged'",
  intent: TurnIntentCodec,
  attempt: AttemptCodec,
}).onUndeclaredKey('reject');
// Proof: F131 replaced this composition with unknown; 'local strict compositions' ExecutionRecordCodec lost rejection in 5 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ExecutionRecordCodec = type({
  version: '1',
  command: ExecutionCommandCodec,
  context: 'null',
})
  .onUndeclaredKey('reject')
  .or(
    type({
      version: '1',
      command: ClaimStageCommandCodec,
      context: ScopeContextCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      version: '1',
      command: ClaimAcceptCommandCodec,
      context: ScopeContextCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      version: '1',
      command: TurnStageCommandCodec,
      context: ScopeContextCodec,
    }).onUndeclaredKey('reject'),
  );
// Proof: F132 replaced this composition with unknown; 'local strict compositions' RecordedExecutionCodec lost rejection in 8 independent owned negatives while its retained positive passed. Exact restoration passed.
export const RecordedExecutionCodec = type({
  version: '1',
  command: ExecutionCommandCodec,
  context: 'null',
  reply: ExecutionAckCodec,
})
  .onUndeclaredKey('reject')
  .or(
    type({
      version: '1',
      command: ClaimStageCommandCodec,
      context: ScopeContextCodec,
      reply: ClaimStageAckCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      version: '1',
      command: ClaimAcceptCommandCodec,
      context: ScopeContextCodec,
      reply: ClaimAcceptAckCodec,
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      version: '1',
      command: TurnStageCommandCodec,
      context: ScopeContextCodec,
      reply: TurnStageAckCodec,
    }).onUndeclaredKey('reject'),
  );
// Proof: F133 replaced this composition with unknown; 'local strict compositions' CompletionRecordCodec lost rejection in 3 independent owned negatives while its retained positive passed. Exact restoration passed.
export const CompletionRecordCodec = type({
  version: '1',
  completion: CompletionCodec,
  reply: AttemptCodec,
}).onUndeclaredKey('reject');
// Proof: F134 replaced this composition with unknown; 'local strict compositions' ScopedAttemptGuardCodec lost rejection in 2 independent owned negatives while its retained positive passed. Exact restoration passed.
export const ScopedAttemptGuardCodec = type({
  ownership: OwnershipCodec,
  runId: RunIdCodec,
  expectedRevision: Integer,
  attemptId: AttemptIdCodec,
  expectedAttemptRevision: Integer,
  scope: scopeCodec,
  expectedScopeRevision: Integer,
}).onUndeclaredKey('reject');
// Proof: F188 bypassed this shared parse dependency; unknown-key requests through all six coupled provider methods resolved instead of rejecting. Exact restoration passed all twelve cases; shared dependency/path proof only.
export const decodeScopedAttemptGuard = (input: unknown) =>
  structuredClone(parseOrThrow(ScopedAttemptGuardCodec, input));
// Proof: F189 bypassed this shared parse dependency; unknown-key requests through both stageClaim providers resolved instead of rejecting. Exact restoration passed all twelve cases; shared dependency/path proof only.
export const decodeClaimStageCommand = (input: unknown) =>
  structuredClone(parseOrThrow(ClaimStageCommandCodec, input));
// Proof: F190 bypassed this shared parse dependency; unknown-key requests through both recordClaimAcceptance providers resolved instead of rejecting. Exact restoration passed all twelve cases; shared dependency/path proof only.
export const decodeClaimAcceptCommand = (input: unknown) =>
  structuredClone(parseOrThrow(ClaimAcceptCommandCodec, input));
// Proof: F191 bypassed this shared parse dependency; unknown-key requests through both stageTurn providers resolved instead of rejecting. Exact restoration passed all twelve cases; shared dependency/path proof only.
export const decodeTurnStageCommand = (input: unknown) =>
  structuredClone(parseOrThrow(TurnStageCommandCodec, input));
export const decodeRecordedExecution = (input: unknown) =>
  structuredClone(parseOrThrow(RecordedExecutionCodec, input));
