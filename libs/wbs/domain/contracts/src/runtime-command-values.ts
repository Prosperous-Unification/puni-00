/** Server-derived organization/project/person address of one runtime observation. */
export type RuntimeScope = Readonly<{
  organizationId: string;
  projectId: string;
  personId: string;
}>;

/** SHA-256 of the versioned runtime basis bytes, prefixed with `rb1:`. */
export type RuntimeBasis = string;

/** Detached local facts captured together; no ledger or runtime authority is asserted. */
export interface RuntimeObservation {
  readonly scope: RuntimeScope;
  readonly projectRevision: number;
  readonly workItems: readonly {
    readonly id: string;
    readonly parentId: string | null;
    readonly revision: number;
    readonly externalRefs: readonly {
      readonly id: string;
      readonly systemId: string;
      readonly url: string;
      readonly name: string;
    }[];
  }[];
  readonly steps: readonly {
    readonly id: string;
    readonly code: string | null;
    readonly position: number;
  }[];
}

/** Expected current project/person refusal of the internal raw observation. */
export type RuntimeReadRefusal = Readonly<{
  ok: false;
  reason:
    | 'runtime_scope_unavailable'
    | 'not_found'
    | 'forbidden'
    | 'unknown_person'
    | 'person_not_bound'
    | 'credential_not_for_person';
}>;

/** Receiver-owned grant; generations are positive safe integers within one scope. */
export type RuntimeAuthority = Readonly<{ ownerId: string; generation: number }>;

/** One local runtime attempt, distinct from WBS business attempt ordinals. */
export type ExecutionIdentity = Readonly<{
  storeId: string;
  runId: string;
  attemptId: string;
  sessionId: string;
}>;

/** Permanent exact target/session binding, retained after the live claim disappears. */
export type RuntimeClaim = Readonly<{
  claimId: string;
  workItemId: string;
  stepId: string;
  parentClaimId: string | null;
  execution: ExecutionIdentity;
}>;

/** Immutable success body stored atomically with its accepted command. */
export type RuntimeReceipt = Readonly<{
  schemaVersion: 1;
  ledgerId: string;
  scope: RuntimeScope;
  commandId: string;
  requestDigest: string;
  actorId: string;
  acceptance:
    | Readonly<{ kind: 'authority'; authority: RuntimeAuthority }>
    | Readonly<{
        kind: 'claim';
        authority: RuntimeAuthority;
        claim: RuntimeClaim;
        basisAfter: RuntimeBasis;
      }>
    | Readonly<{
        kind: 'write';
        authority: RuntimeAuthority;
        claim: RuntimeClaim;
        basisAfter: RuntimeBasis;
        applied: readonly Readonly<{
          index: number;
          kind: 'setProgress' | 'setMeasure' | 'patchWorkItem' | 'releaseWorkItem';
        }>[];
      }>;
}>;
