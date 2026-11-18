import type {
  AcceptedReferenceArtifacts,
  AcceptedReferenceLock,
  ActivePlanReference,
  HistoricalPlanReference,
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

/** Protected policy and immutable reference rows borrowed on the live WBS writer. */
export interface AcceptedPlanReferenceStore {
  /** @throws when required policy cannot be read or does not have its trusted shape. */
  readPolicy(): PlanReferencePolicy;
  readActive(scope: AcceptedReferenceScope): ActivePlanReference | null;
  readHistorical(
    scope: AcceptedReferenceScope,
    selector: AcceptedReferenceSelector,
  ): HistoricalPlanReference | null;
  insert(acceptance: RetainedPlanReference): void;
}
