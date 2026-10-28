import { parseOrThrow, type } from '@shared/validation';

import {
  AttemptCodec,
  CheckpointCodec,
  ClaimAcceptCommandCodec,
  RecordedExecutionCodec,
  ScopedAttemptGuardCodec,
} from './execution-codecs';
import type {
  RecoveryBeginCall,
  RecoveryCall,
  RecoveryExchange,
  RecoveryFenceInput,
  RecoveryFenceReplyInput,
  RecoveryHistory,
  RecoveryResolveCall,
} from './recovery-records';
import { acceptanceCodec, intentCodec, scopeCodec } from './runtime-codecs';
import {
  ArtifactDigestCodec,
  ArtifactRefCodec,
  Integer,
  OwnerIdCodec,
  OwnershipCodec,
  Positive,
} from './value-codecs';

/** Closes each owned schema literal without recursively overwriting public payload policies. */
// Proof: fix1-R1 changed this metadata to ignore; 26 owned-field negatives across all four codec paths lost rejection, while four inherited scope/ref controls stayed strict.
const closedRecord = { '+': 'reject' } as const;

const identity = type('string>=1');
const owner = type({ ...closedRecord, ownerId: OwnerIdCodec, epoch: Positive });
const authorityTarget = type({ ...closedRecord, kind: "'authority'", original: intentCodec });
const claimTarget = type({
  ...closedRecord,
  kind: "'claim'",
  original: intentCodec,
  runId: identity,
  attemptId: identity,
  stageCommandId: identity,
  acceptanceCommandId: identity,
});
const intentFields = {
  ...closedRecord,
  version: '1',
  recoveryId: identity,
  begunScopeRevision: Integer,
  resolver: owner,
} as const;
const authorityIntent = type({ ...closedRecord, ...intentFields, target: authorityTarget });
const claimIntent = type({ ...closedRecord, ...intentFields, target: claimTarget });
const recoveryIntent = authorityIntent.or(claimIntent);
const authorityGuard = type({
  ...closedRecord,
  ownership: OwnershipCodec,
  scope: scopeCodec,
  expectedRevision: Integer,
  expectedRecoveryRevision: Integer,
});
const claimGuard = ScopedAttemptGuardCodec.merge({
  ...closedRecord,
  expectedRecoveryRevision: Integer,
});
const context = type({ ...closedRecord, kind: "'initial_state'", recoveryId: identity })
  .or({
    ...closedRecord,
    kind: "'fence_reply'",
    recoveryId: identity,
    ordinal: Positive,
    requestDigest: ArtifactDigestCodec,
    stagedRevision: Positive,
  })
  .or({
    ...closedRecord,
    kind: "'original_lookup'",
    recoveryId: identity,
    ordinal: Positive,
    observationRevision: Positive,
    fenceExchange: ArtifactRefCodec,
    fenceReceipt: ArtifactRefCodec,
  })
  .or({
    ...closedRecord,
    kind: "'supersession_state'",
    recoveryId: identity,
    previousOrdinal: Positive,
    previousRequestDigest: ArtifactDigestCodec,
  })
  .or({
    ...closedRecord,
    kind: "'supersession_lookup'",
    recoveryId: identity,
    previousOrdinal: Positive,
    stateExchange: ArtifactRefCodec,
  });
const exchange = type({
  ...closedRecord,
  version: '1',
  context,
  scope: scopeCodec,
  ledgerId: identity,
  request: type({ ...closedRecord, kind: "'state'" })
    .or({ ...closedRecord, kind: "'lookup'", commandId: identity })
    .or({ ...closedRecord, kind: "'authority'", canonicalRequest: identity }),
  status: Integer,
  body: ArtifactRefCodec,
});
const envelope = type({ ...closedRecord, artifact: ArtifactRefCodec, value: exchange });

/** Synchronous known public fields preserve the response schemas' root and nested additions. The actual-byte reader remains the asynchronous public-schema boundary. */
const authority = type({ ownerId: identity, generation: Positive });
const claim = type({
  claimId: identity,
  workItemId: identity,
  stepId: identity,
  parentClaimId: identity.or('null'),
  execution: {
    storeId: identity,
    runId: identity,
    attemptId: identity,
    sessionId: '0 < string <= 256',
  },
});
const basis = type(/^rb1:[0-9a-f]{64}$/);
const receiptFields = {
  schemaVersion: '1',
  ledgerId: identity,
  scope: scopeCodec,
  commandId: identity,
  requestDigest: ArtifactDigestCodec,
  actorId: identity,
} as const;
// Proof: fix1-R3/R6 rejected/deleted allowed public fields; authority root/nested preservation tests failed.
const authorityReceipt = type({
  ...receiptFields,
  acceptance: { kind: "'authority'", authority },
}).onDeepUndeclaredKey('ignore');
// Proof: fix1-R4/R7 rejected/deleted allowed public fields; claim root/nested preservation tests failed.
const claimReceipt = type({
  ...receiptFields,
  acceptance: { kind: "'claim'", authority, claim, basisAfter: basis },
}).onDeepUndeclaredKey('ignore');
const liveClaim = type({
  id: identity,
  workItemId: identity,
  stepId: identity.or('null'),
  personId: identity,
  runId: identity.or('null'),
  parentClaimId: identity.or('null'),
  accountId: identity,
});
// Proof: fix1-R2/R5 rejected/deleted allowed public fields; state root/nested preservation tests failed.
const state = type({
  schemaVersion: '1',
  ledgerId: identity,
  scope: scopeCodec,
  basis,
  facts: {
    projectRevision: Integer,
    workItems: type({
      id: identity,
      parentId: identity.or('null'),
      revision: Integer,
      externalRefs: type({
        id: identity,
        systemId: identity,
        url: 'string',
        name: 'string',
      }).array(),
    }).array(),
    steps: type({ id: identity, code: 'string | null', position: 'number' }).array(),
  },
  authority: type({ kind: "'uninitialized'" }).or({
    kind: "'held'",
    ownerId: identity,
    generation: Positive,
  }),
  claims: type({ kind: "'ordinary'", claim: liveClaim })
    .or({ kind: "'runtime'", claim: liveClaim, binding: claim })
    .array(),
}).onDeepUndeclaredKey('ignore');
const stateExchange = type({
  ...closedRecord,
  envelope,
  body: { ...closedRecord, artifact: ArtifactRefCodec, value: state },
});
const authorityExchange = type({
  ...closedRecord,
  envelope,
  body: { ...closedRecord, artifact: ArtifactRefCodec, value: authorityReceipt },
});
const claimExchange = type({
  ...closedRecord,
  envelope,
  body: { ...closedRecord, artifact: ArtifactRefCodec, value: claimReceipt },
});
const absentExchange = type({
  ...closedRecord,
  envelope,
  body: {
    ...closedRecord,
    artifact: ArtifactRefCodec,
    value: { ...closedRecord, error: "'runtime_receipt_not_found'" },
  },
});
const conflictExchange = type({
  ...closedRecord,
  envelope,
  body: {
    ...closedRecord,
    artifact: ArtifactRefCodec,
    value: { ...closedRecord, error: "'runtime_generation_conflict'" },
  },
});
const fence = type({
  ...closedRecord,
  version: '1',
  recoveryId: identity,
  ordinal: Positive,
  canonicalRequest: identity,
  requestDigest: ArtifactDigestCodec,
  owner,
  stagedRevision: Positive,
  basis: type({ ...closedRecord, kind: "'initial'", state: stateExchange }).or({
    ...closedRecord,
    kind: "'superseding'",
    previousOrdinal: Positive,
    state: stateExchange,
    lookup: absentExchange,
  }),
});
const acceptedReply = type({
  ...closedRecord,
  kind: "'accepted'",
  fence,
  reply: authorityExchange,
});
const conflictReply = type({
  ...closedRecord,
  kind: "'generation_conflict'",
  fence,
  reply: conflictExchange,
});
const acceptedObservation = acceptedReply.merge({
  ...closedRecord,
  version: '1',
  observedRevision: Positive,
});
const observation = acceptedObservation.or(
  conflictReply.merge({ ...closedRecord, version: '1', observedRevision: Positive }),
);
const acceptedFence = type({ ...closedRecord, fence, observation: acceptedObservation });
const nonacceptedDecision = type({
  ...closedRecord,
  kind: "'fenced_nonaccepted'",
  lookup: absentExchange,
});
const authorityDecision = type({
  ...closedRecord,
  kind: "'accepted'",
  lookup: authorityExchange,
}).or(nonacceptedDecision);
const claimDecision = type({
  ...closedRecord,
  kind: "'accepted'",
  lookup: claimExchange,
  command: ClaimAcceptCommandCodec,
}).or(nonacceptedDecision);
// Proof: C7/C8 widened each checkpoint independently; the opposite valid checkpoint was accepted for that hold cause.
const hold = type({
  ...closedRecord,
  kind: "'recovery_hold'",
  cause: "'claim_nonaccepted'",
  closureId: identity,
  checkpoint: CheckpointCodec.extract({ kind: "'claiming'" }),
}).or({
  ...closedRecord,
  kind: "'recovery_hold'",
  cause: "'claim_accepted_fenced'",
  closureId: identity,
  checkpoint: CheckpointCodec.extract({ kind: "'ready'" }),
});
const attempt = AttemptCodec.omit('version', 'state').merge({
  ...closedRecord,
  version: '3',
  state: hold,
});
const claimAck = RecordedExecutionCodec.extract({ command: { kind: "'accept_claim'" } }).get(
  'reply',
);
const closure = type({
  ...closedRecord,
  version: '1',
  recoveryId: identity,
  original: intentCodec,
  fence: acceptedFence,
  decision: authorityDecision.or(claimDecision),
  resolvedRevision: Positive,
  resolver: owner,
  scopeBefore: Integer,
  scopeAfter: Positive,
  originalReply: type({ ...closedRecord, kind: "'authority'", acceptance: acceptanceCodec })
    .or({ ...closedRecord, kind: "'claim'", command: ClaimAcceptCommandCodec, ack: claimAck })
    .or('null'),
  attemptReply: attempt.or('null'),
});
const history = type({
  ...closedRecord,
  version: '1',
  intent: recoveryIntent,
  revision: Integer,
  fences: fence.array(),
  observations: observation.array(),
  closure: closure.or('null'),
});
const begin = type({
  ...closedRecord,
  kind: "'authority'",
  guard: authorityGuard,
  intent: authorityIntent,
}).or({ ...closedRecord, kind: "'claim'", guard: claimGuard, intent: claimIntent });
const fenceCall = type({
  ...closedRecord,
  kind: "'authority'",
  guard: authorityGuard,
  recoveryId: identity,
  input: { ...closedRecord, fence },
}).or({
  ...closedRecord,
  kind: "'claim'",
  guard: claimGuard,
  recoveryId: identity,
  input: { ...closedRecord, fence },
});
const observationCall = type({
  ...closedRecord,
  kind: "'authority'",
  guard: authorityGuard,
  recoveryId: identity,
  input: acceptedReply.or(conflictReply),
}).or({
  ...closedRecord,
  kind: "'claim'",
  guard: claimGuard,
  recoveryId: identity,
  input: acceptedReply.or(conflictReply),
});
const resolve = type({
  ...closedRecord,
  kind: "'authority'",
  guard: authorityGuard,
  recoveryId: identity,
  fence: acceptedFence,
  decision: authorityDecision,
}).or({
  ...closedRecord,
  kind: "'claim'",
  guard: claimGuard,
  recoveryId: identity,
  fence: acceptedFence,
  decision: claimDecision,
});
const exchangeCodec = exchange;

/** Synchronous snapshots close owned records and preserve public body additions; these do not authenticate supplied value/reference pairs. */
export function decodeRecoveryExchange(candidate: unknown): RecoveryExchange {
  // Proof: C1 bypassed this new parse dependency; owned malformed record negatives lost rejection.
  return structuredClone(parseOrThrow(exchangeCodec, candidate));
}
export function decodeRecoveryHistory(candidate: unknown): RecoveryHistory {
  // Proof: C2 bypassed this new parse dependency; owned malformed record negatives lost rejection.
  return structuredClone(parseOrThrow(history, candidate));
}
export function decodeRecoveryBeginCall(candidate: unknown): RecoveryBeginCall {
  // Proof: C3 bypassed this new parse dependency; owned malformed record negatives lost rejection.
  return structuredClone(parseOrThrow(begin, candidate));
}
export function decodeRecoveryFenceCall(candidate: unknown): RecoveryCall<RecoveryFenceInput> {
  // Proof: C4 bypassed this new parse dependency; owned malformed record negatives lost rejection.
  return structuredClone(parseOrThrow(fenceCall, candidate));
}
export function decodeRecoveryObservationCall(
  candidate: unknown,
): RecoveryCall<RecoveryFenceReplyInput> {
  // Proof: C5 bypassed this new parse dependency; owned malformed record negatives lost rejection.
  return structuredClone(parseOrThrow(observationCall, candidate));
}
export function decodeRecoveryResolveCall(candidate: unknown): RecoveryResolveCall {
  // Proof: C6 bypassed this new parse dependency; owned malformed record negatives lost rejection.
  return structuredClone(parseOrThrow(resolve, candidate));
}
