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
