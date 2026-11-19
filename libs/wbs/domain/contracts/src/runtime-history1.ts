import type {
  RuntimeAuthority,
  RuntimeBasis,
  RuntimeClaim,
  RuntimeClaimInventory,
} from './runtime-command-values';

/** Published version1 scope, retained only for immutable historical identities. */
export type RuntimeScope1 = Readonly<{
  organizationId: string;
  projectId: string;
  personId: string;
}>;

/** Immutable success body stored atomically with its accepted command. */
export type RuntimeReceipt1 = Readonly<{
  schemaVersion: 1;
  ledgerId: string;
  scope: RuntimeScope1;
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

/** Complete published state1 evidence; later owner vocabulary never changes this retained wire shape. The shared authority, basis and claim-inventory types have unchanged published fields; future changes must preserve this state1 contract. Its runtime grammar is independently frozen. */
export type RuntimeState1 = Readonly<{
  schemaVersion: 1;
  ledgerId: string;
  scope: RuntimeScope1;
  basis: RuntimeBasis;
  facts: Readonly<{
    projectRevision: number;
    workItems: readonly Readonly<{
      id: string;
      parentId: string | null;
      revision: number;
      externalRefs: readonly Readonly<{
        id: string;
        systemId: string;
        url: string;
        name: string;
      }>[];
    }>[];
    steps: readonly Readonly<{ id: string; code: string | null; position: number }>[];
  }>;
  authority: Readonly<{ kind: 'uninitialized' }> | (Readonly<{ kind: 'held' }> & RuntimeAuthority);
  claims: readonly RuntimeClaimInventory[];
}>;
