import type { AuthorityReceipt, ClaimReceipt, RuntimeState } from '@wbs/contracts';

import type {
  Attempt as Attempt2,
  Checkpoint,
  ClaimAcceptAck,
  ClaimAcceptCommand,
} from './execution-records';
import type { ArtifactRef, Ownership } from './records';
import type { ScopedAttemptGuard } from './run-store';
import type {
  RuntimeAcceptance,
  RuntimeGuard,
  RuntimeIntent,
  RuntimeScope,
} from './runtime-records';

export interface AuthorityRecoveryTarget {
  readonly kind: 'authority';
  readonly original: RuntimeIntent;
}
export interface ClaimRecoveryTarget {
  readonly kind: 'claim';
  readonly original: RuntimeIntent;
  readonly runId: string;
  readonly attemptId: string;
  readonly stageCommandId: string;
  readonly acceptanceCommandId: string;
}
export type RecoveryTarget = AuthorityRecoveryTarget | ClaimRecoveryTarget;
export type AuthorityRecoveryGuard = RuntimeGuard & { readonly expectedRecoveryRevision: number };
export type ClaimRecoveryGuard = ScopedAttemptGuard & { readonly expectedRecoveryRevision: number };
export interface RecoveryIntent<T extends RecoveryTarget = RecoveryTarget> {
  readonly version: 1;
  readonly recoveryId: string;
  readonly target: T;
  readonly begunScopeRevision: number;
  readonly resolver: Pick<Ownership, 'ownerId' | 'epoch'>;
}
export type RecoveryContext =
  | { readonly kind: 'initial_state'; readonly recoveryId: string }
  | {
      readonly kind: 'fence_reply';
      readonly recoveryId: string;
      readonly ordinal: number;
      readonly requestDigest: string;
      readonly stagedRevision: number;
    }
  | {
      readonly kind: 'original_lookup';
      readonly recoveryId: string;
      readonly ordinal: number;
      readonly observationRevision: number;
      readonly fenceExchange: ArtifactRef;
      readonly fenceReceipt: ArtifactRef;
    }
  | {
      readonly kind: 'supersession_state';
      readonly recoveryId: string;
      readonly previousOrdinal: number;
      readonly previousRequestDigest: string;
    }
  | {
      readonly kind: 'supersession_lookup';
      readonly recoveryId: string;
      readonly previousOrdinal: number;
      readonly stateExchange: ArtifactRef;
    };
export interface RecoveryExchange {
  readonly version: 1;
  readonly context: RecoveryContext;
  readonly scope: RuntimeScope;
  readonly ledgerId: string;
  readonly request:
    | { readonly kind: 'state' }
    | { readonly kind: 'lookup'; readonly commandId: string }
    | { readonly kind: 'authority'; readonly canonicalRequest: string };
  readonly status: number;
  readonly body: ArtifactRef;
}
/** Detached trusted pair, not an authenticity brand. Verified readers independently reread the artifact. */
export interface RecoveryArtifactValue<T> {
  readonly artifact: ArtifactRef;
  readonly value: T;
}
export interface RecoveryExchangeValue<T> {
  readonly envelope: RecoveryArtifactValue<RecoveryExchange>;
  readonly body: RecoveryArtifactValue<T>;
}
export interface RecoveryReceiptAbsent {
  readonly error: 'runtime_receipt_not_found';
}
export interface RecoveryGenerationConflict {
  readonly error: 'runtime_generation_conflict';
}
export type RecoveryBasis =
  | { readonly kind: 'initial'; readonly state: RecoveryExchangeValue<RuntimeState> }
  | {
      readonly kind: 'superseding';
      readonly previousOrdinal: number;
      readonly state: RecoveryExchangeValue<RuntimeState>;
      readonly lookup: RecoveryExchangeValue<RecoveryReceiptAbsent>;
    };
export interface RecoveryFence {
  readonly version: 1;
  readonly recoveryId: string;
  readonly ordinal: number;
  readonly canonicalRequest: string;
  readonly requestDigest: string;
  readonly owner: Pick<Ownership, 'ownerId' | 'epoch'>;
  readonly stagedRevision: number;
  readonly basis: RecoveryBasis;
}
export interface RecoveryFenceInput {
  readonly fence: RecoveryFence;
}
export type RecoveryFenceReplyInput =
  | {
      readonly kind: 'accepted';
      readonly fence: RecoveryFence;
      readonly reply: RecoveryExchangeValue<AuthorityReceipt>;
    }
  | {
      readonly kind: 'generation_conflict';
      readonly fence: RecoveryFence;
      readonly reply: RecoveryExchangeValue<RecoveryGenerationConflict>;
    };
export type RecoveryObservation = RecoveryFenceReplyInput & {
  readonly version: 1;
  readonly observedRevision: number;
};
export interface AcceptedRecoveryFence {
  readonly fence: RecoveryFence;
  readonly observation: Extract<RecoveryObservation, { kind: 'accepted' }>;
}
export type AuthorityRecoveryDecision =
  | { readonly kind: 'accepted'; readonly lookup: RecoveryExchangeValue<AuthorityReceipt> }
  | {
      readonly kind: 'fenced_nonaccepted';
      readonly lookup: RecoveryExchangeValue<RecoveryReceiptAbsent>;
    };
export type ClaimRecoveryDecision =
  | {
      readonly kind: 'accepted';
      readonly lookup: RecoveryExchangeValue<ClaimReceipt>;
      readonly command: ClaimAcceptCommand;
    }
  | {
      readonly kind: 'fenced_nonaccepted';
      readonly lookup: RecoveryExchangeValue<RecoveryReceiptAbsent>;
    };
export type RecoveryBeginCall =
  | {
      readonly kind: 'authority';
      readonly guard: AuthorityRecoveryGuard;
      readonly intent: RecoveryIntent<AuthorityRecoveryTarget>;
    }
  | {
      readonly kind: 'claim';
      readonly guard: ClaimRecoveryGuard;
      readonly intent: RecoveryIntent<ClaimRecoveryTarget>;
    };
export type RecoveryCall<P> =
  | {
      readonly kind: 'authority';
      readonly guard: AuthorityRecoveryGuard;
      readonly recoveryId: string;
      readonly input: P;
    }
  | {
      readonly kind: 'claim';
      readonly guard: ClaimRecoveryGuard;
      readonly recoveryId: string;
      readonly input: P;
    };
export type RecoveryResolveCall =
  | {
      readonly kind: 'authority';
      readonly guard: AuthorityRecoveryGuard;
      readonly recoveryId: string;
      readonly fence: AcceptedRecoveryFence;
      readonly decision: AuthorityRecoveryDecision;
    }
  | {
      readonly kind: 'claim';
      readonly guard: ClaimRecoveryGuard;
      readonly recoveryId: string;
      readonly fence: AcceptedRecoveryFence;
      readonly decision: ClaimRecoveryDecision;
    };
export type RecoveryHold =
  | {
      readonly kind: 'recovery_hold';
      readonly cause: 'claim_nonaccepted';
      readonly closureId: string;
      readonly checkpoint: Extract<Checkpoint, { kind: 'claiming' }>;
    }
  | {
      readonly kind: 'recovery_hold';
      readonly cause: 'claim_accepted_fenced';
      readonly closureId: string;
      readonly checkpoint: Extract<Checkpoint, { kind: 'ready' }>;
    };
export type Attempt3 = Omit<Attempt2, 'version' | 'state'> & {
  readonly version: 3;
  readonly state: RecoveryHold;
};
export interface RecoveryClosure {
  readonly version: 1;
  readonly recoveryId: string;
  readonly original: RuntimeIntent;
  readonly fence: AcceptedRecoveryFence;
  readonly decision: AuthorityRecoveryDecision | ClaimRecoveryDecision;
  readonly resolvedRevision: number;
  readonly resolver: Pick<Ownership, 'ownerId' | 'epoch'>;
  readonly scopeBefore: number;
  readonly scopeAfter: number;
  readonly originalReply:
    | null
    | { readonly kind: 'authority'; readonly acceptance: RuntimeAcceptance }
    | {
        readonly kind: 'claim';
        readonly command: ClaimAcceptCommand;
        readonly ack: ClaimAcceptAck;
      };
  readonly attemptReply: Attempt3 | null;
}
export interface RecoveryHistory {
  readonly version: 1;
  readonly intent: RecoveryIntent;
  readonly revision: number;
  readonly fences: readonly RecoveryFence[];
  readonly observations: readonly RecoveryObservation[];
  readonly closure: RecoveryClosure | null;
}
