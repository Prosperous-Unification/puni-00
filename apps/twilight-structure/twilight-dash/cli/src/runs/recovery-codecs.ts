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

const identity = type('string>=1');
const owner = type({ ownerId: OwnerIdCodec, epoch: Positive });
const authorityTarget = type({ kind: "'authority'", original: intentCodec });
const claimTarget = type({
  kind: "'claim'",
  original: intentCodec,
  runId: identity,
  attemptId: identity,
  stageCommandId: identity,
  acceptanceCommandId: identity,
});
const intentFields = {
  version: '1',
  recoveryId: identity,
  begunScopeRevision: Integer,
  resolver: owner,
} as const;
const authorityIntent = type({ ...intentFields, target: authorityTarget });
const claimIntent = type({ ...intentFields, target: claimTarget });
const recoveryIntent = authorityIntent.or(claimIntent);
const authorityGuard = type({
  ownership: OwnershipCodec,
  scope: scopeCodec,
  expectedRevision: Integer,
  expectedRecoveryRevision: Integer,
});
const claimGuard = ScopedAttemptGuardCodec.merge({ expectedRecoveryRevision: Integer });
const context = type({ kind: "'initial_state'", recoveryId: identity })
  .or({
    kind: "'fence_reply'",
    recoveryId: identity,
    ordinal: Positive,
    requestDigest: ArtifactDigestCodec,
    stagedRevision: Positive,
  })
  .or({
    kind: "'original_lookup'",
    recoveryId: identity,
    ordinal: Positive,
    observationRevision: Positive,
    fenceExchange: ArtifactRefCodec,
    fenceReceipt: ArtifactRefCodec,
  })
  .or({
    kind: "'supersession_state'",
    recoveryId: identity,
    previousOrdinal: Positive,
    previousRequestDigest: ArtifactDigestCodec,
  })
  .or({
    kind: "'supersession_lookup'",
    recoveryId: identity,
    previousOrdinal: Positive,
    stateExchange: ArtifactRefCodec,
  });
const exchange = type({
  version: '1',
  context,
  scope: scopeCodec,
  ledgerId: identity,
  request: type({ kind: "'state'" })
    .or({ kind: "'lookup'", commandId: identity })
    .or({ kind: "'authority'", canonicalRequest: identity }),
  status: Integer,
  body: ArtifactRefCodec,
});
const envelope = type({ artifact: ArtifactRefCodec, value: exchange });

/** Synchronous stored projections only; external response schemas remain authoritative in readRecoveryExchange. */
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
const authorityReceipt = type({ ...receiptFields, acceptance: { kind: "'authority'", authority } });
const claimReceipt = type({
  ...receiptFields,
  acceptance: { kind: "'claim'", authority, claim, basisAfter: basis },
});
const liveClaim = type({
  id: identity,
  workItemId: identity,
  stepId: identity.or('null'),
  personId: identity,
  runId: identity.or('null'),
  parentClaimId: identity.or('null'),
  accountId: identity,
});
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
});
const stateExchange = type({ envelope, body: { artifact: ArtifactRefCodec, value: state } });
const authorityExchange = type({
  envelope,
  body: { artifact: ArtifactRefCodec, value: authorityReceipt },
});
const claimExchange = type({ envelope, body: { artifact: ArtifactRefCodec, value: claimReceipt } });
const absentExchange = type({
  envelope,
  body: { artifact: ArtifactRefCodec, value: { error: "'runtime_receipt_not_found'" } },
});
const conflictExchange = type({
  envelope,
  body: { artifact: ArtifactRefCodec, value: { error: "'runtime_generation_conflict'" } },
});
const fence = type({
  version: '1',
  recoveryId: identity,
  ordinal: Positive,
  canonicalRequest: identity,
  requestDigest: ArtifactDigestCodec,
  owner,
  stagedRevision: Positive,
  basis: type({ kind: "'initial'", state: stateExchange }).or({
    kind: "'superseding'",
    previousOrdinal: Positive,
    state: stateExchange,
    lookup: absentExchange,
  }),
});
const acceptedReply = type({ kind: "'accepted'", fence, reply: authorityExchange });
const conflictReply = type({ kind: "'generation_conflict'", fence, reply: conflictExchange });
const acceptedObservation = acceptedReply.merge({ version: '1', observedRevision: Positive });
const observation = acceptedObservation.or(
  conflictReply.merge({ version: '1', observedRevision: Positive }),
);
const acceptedFence = type({ fence, observation: acceptedObservation });
const nonacceptedDecision = type({ kind: "'fenced_nonaccepted'", lookup: absentExchange });
const authorityDecision = type({ kind: "'accepted'", lookup: authorityExchange }).or(
  nonacceptedDecision,
);
const claimDecision = type({
  kind: "'accepted'",
  lookup: claimExchange,
  command: ClaimAcceptCommandCodec,
}).or(nonacceptedDecision);
// Proof: C7/C8 widened each checkpoint independently; the opposite valid checkpoint was accepted for that hold cause.
const hold = type({
  kind: "'recovery_hold'",
  cause: "'claim_nonaccepted'",
  closureId: identity,
  checkpoint: CheckpointCodec.extract({ kind: "'claiming'" }),
}).or({
  kind: "'recovery_hold'",
  cause: "'claim_accepted_fenced'",
  closureId: identity,
  checkpoint: CheckpointCodec.extract({ kind: "'ready'" }),
});
const attempt = AttemptCodec.omit('version', 'state').merge({ version: '3', state: hold });
const claimAck = RecordedExecutionCodec.extract({ command: { kind: "'accept_claim'" } }).get(
  'reply',
);
const closure = type({
  version: '1',
  recoveryId: identity,
  original: intentCodec,
  fence: acceptedFence,
  decision: authorityDecision.or(claimDecision),
  resolvedRevision: Positive,
  resolver: owner,
  scopeBefore: Integer,
  scopeAfter: Positive,
  originalReply: type({ kind: "'authority'", acceptance: acceptanceCodec })
    .or({ kind: "'claim'", command: ClaimAcceptCommandCodec, ack: claimAck })
    .or('null'),
  attemptReply: attempt.or('null'),
});
const history = type({
  version: '1',
  intent: recoveryIntent,
  revision: Integer,
  fences: fence.array(),
  observations: observation.array(),
  closure: closure.or('null'),
}).onDeepUndeclaredKey('reject');
const begin = type({ kind: "'authority'", guard: authorityGuard, intent: authorityIntent })
  .or({ kind: "'claim'", guard: claimGuard, intent: claimIntent })
  .onDeepUndeclaredKey('reject');
const fenceCall = type({
  kind: "'authority'",
  guard: authorityGuard,
  recoveryId: identity,
  input: { fence },
})
  .or({ kind: "'claim'", guard: claimGuard, recoveryId: identity, input: { fence } })
  .onDeepUndeclaredKey('reject');
const observationCall = type({
  kind: "'authority'",
  guard: authorityGuard,
  recoveryId: identity,
  input: acceptedReply.or(conflictReply),
})
  .or({
    kind: "'claim'",
    guard: claimGuard,
    recoveryId: identity,
    input: acceptedReply.or(conflictReply),
  })
  .onDeepUndeclaredKey('reject');
const resolve = type({
  kind: "'authority'",
  guard: authorityGuard,
  recoveryId: identity,
  fence: acceptedFence,
  decision: authorityDecision,
})
  .or({
    kind: "'claim'",
    guard: claimGuard,
    recoveryId: identity,
    fence: acceptedFence,
    decision: claimDecision,
  })
  .onDeepUndeclaredKey('reject');
const exchangeCodec = exchange.onDeepUndeclaredKey('reject');

/** Strict synchronous snapshots for trusted persistence; these do not authenticate supplied value/reference pairs. */
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
