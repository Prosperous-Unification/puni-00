import type { RuntimeAuthority, RuntimeScope } from '@wbs/contracts';

import type { ArtifactDigest, ArtifactRef, Ownership, Revision } from './records';
import type { RecoveryHistory } from './recovery-records';

export type { RuntimeAuthority, RuntimeScope };

/** Immutable receiver installation identity at a complete organization/project/person address. */
export interface RuntimePin {
  readonly version: 1;
  readonly scope: RuntimeScope;
  readonly ledgerId: string;
}
export interface RuntimeGuard {
  readonly ownership: Ownership;
  readonly scope: RuntimeScope;
  readonly expectedRevision: Revision;
}
/** Exact retained request and local provenance. Retention grants no dispatch permission or receiver authority. */
export interface RuntimeIntent {
  readonly version: 1;
  readonly commandId: string;
  readonly canonicalRequest: string;
  readonly requestDigest: ArtifactDigest;
  readonly localOwner: Pick<Ownership, 'ownerId' | 'epoch'>;
  readonly stagedRevision: Revision;
}
/** Trusted input: the exact complete receipt artifact has already been verified against this intent. */
export interface RuntimeAcceptanceInput {
  readonly intent: RuntimeIntent;
  readonly evidence: ArtifactRef;
}
/** Historical accepted content; matching bytes do not authenticate transport or assert a live receiver lease. */
export interface RuntimeAcceptance {
  readonly version: 1;
  readonly commandId: string;
  readonly requestDigest: ArtifactDigest;
  readonly evidence: ArtifactRef;
  readonly acceptedRevision: Revision;
}
/** Mapping derived only from an acceptance staged in this local epoch, independent of receiver generation. */
export interface RuntimeGrant {
  readonly localEpoch: number;
  readonly commandId: string;
  readonly authority: RuntimeAuthority;
}
/** Raw inspection validates local history; independent receipt artifacts require {@link readRuntimeHistory}. */
export type RuntimeScopeSnapshot = RuntimeScopeSnapshot1 | RuntimeScopeSnapshot2;
export type RuntimeScopeSnapshot2 =
  | (Omit<Extract<RuntimeScopeSnapshot1, { kind: 'uninitialized' }>, 'version'> & {
      readonly version: 2;
      readonly recoveries: readonly RecoveryHistory[];
      readonly activeRecoveryId: null;
      readonly generationFloor: null;
    })
  | (Omit<Extract<RuntimeScopeSnapshot1, { kind: 'pinned' }>, 'version'> & {
      readonly version: 2;
      readonly recoveries: readonly RecoveryHistory[];
      readonly activeRecoveryId: string | null;
      readonly generationFloor: number | null;
    });
export type RuntimeScopeSnapshot1 =
  | {
      readonly version: 1;
      readonly kind: 'uninitialized';
      readonly scope: RuntimeScope;
      readonly ownerEpoch: number;
    }
  | {
      readonly version: 1;
      readonly kind: 'pinned';
      readonly pin: RuntimePin;
      readonly revision: Revision;
      readonly ownerEpoch: number;
      readonly intents: readonly RuntimeIntent[];
      readonly acceptances: readonly RuntimeAcceptance[];
      readonly pendingCommandId: string | null;
      readonly grant: RuntimeGrant | null;
    };
