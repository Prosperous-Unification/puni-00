import type {
  AcceptedReferenceArtifacts,
  AcceptedReferenceLock,
  ActivePlanReference,
} from '@wbs/contracts';

export type AcceptedReferenceScope = Omit<AcceptedReferenceLock, 'version' | 'referenceDigest'>;
export type AcceptedReferenceSelector = Pick<AcceptedReferenceLock, 'version' | 'referenceDigest'>;

export type PlanReferenceSubject =
  | { readonly kind: 'first_party'; readonly accountId: string }
  | {
      readonly kind: 'upstream';
      readonly accountId: string;
      readonly issuer: string;
      readonly subject: string;
    };

export interface PlanReferencePolicy {
  readonly revision: number;
  readonly grants: readonly {
    readonly scope: AcceptedReferenceScope;
    readonly operation: 'accept_reference' | 'submit_assertion' | 'apply_assertion';
    readonly subject: PlanReferenceSubject;
  }[];
}

export interface RetainedPlanReference extends ActivePlanReference {
  readonly artifacts: AcceptedReferenceArtifacts;
  readonly subject: PlanReferenceSubject;
  readonly acceptedAt: number;
  readonly policyRevision: number;
}
