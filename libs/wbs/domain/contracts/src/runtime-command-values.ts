import type {
  CommandContext,
  CommandRefusalCode,
  CommandRefusalDetail,
  RefusalCode,
} from './http/refusal';

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

/** Explicit ordinary inventory; immutable runtime bindings never silently adopt ordinary claims. */
export type RuntimeClaimInventory = Readonly<{
  kind: 'ordinary' | 'runtime';
  claim: Readonly<{
    id: string;
    workItemId: string;
    stepId: string | null;
    personId: string;
    runId: string | null;
    parentClaimId: string | null;
    accountId: string;
  }>;
}> &
  (Readonly<{ kind: 'ordinary' }> | Readonly<{ kind: 'runtime'; binding: RuntimeClaim }>);

/** One coherent pinned observation, current grant and requested person's live claim inventory. */
export type RuntimeState = Readonly<{
  schemaVersion: 1;
  ledgerId: string;
  scope: RuntimeScope;
  basis: RuntimeBasis;
  facts: Omit<RuntimeObservation, 'scope'>;
  authority: Readonly<{ kind: 'uninitialized' }> | (Readonly<{ kind: 'held' }> & RuntimeAuthority);
  claims: readonly RuntimeClaimInventory[];
}>;

/** Expected runtime reconciliation refusals; trusted corruption always throws. */
export type RuntimeReply<T> =
  | Readonly<{ ok: true; value: T }>
  | RuntimeReadRefusal
  | RuntimeCommandRefusal
  | Readonly<{ ok: false; error: 'insufficient_scope' }>
  | Readonly<{
      ok: false;
      reason:
        | 'runtime_authority_stale'
        | 'runtime_revision_conflict'
        | 'runtime_claim_mismatch'
        | 'runtime_claim_unmanaged'
        | 'runtime_attempt_bound'
        | 'runtime_generation_conflict'
        | 'runtime_command_conflict'
        | 'runtime_ledger_mismatch'
        | 'runtime_receipt_not_found';
    }>;

export type AuthorityReceipt = RuntimeReceipt &
  Readonly<{
    acceptance: Readonly<{ kind: 'authority'; authority: RuntimeAuthority }>;
  }>;

export type RuntimeAuthorityRequest = Readonly<{
  schemaVersion: 1;
  commandId: string;
  expectedLedgerId: string;
  ownerId: string;
  expectedGeneration: number | null;
}>;

/** Restricted existing wire commands; the receiver additionally checks exact live claim targets. */
export type RuntimePlanCommand =
  | Readonly<{
      kind: 'setProgress';
      workItemId: string;
      stepId: string;
      state: 'in_progress' | 'done';
    }>
  | Readonly<{
      kind: 'setMeasure';
      workItemId: string;
      stepId: string;
      metric: 'token_actual';
      value: number;
    }>
  | Readonly<{
      kind: 'patchWorkItem';
      workItemId: string;
      patch: Readonly<{
        externalRefs: readonly Readonly<{ systemId: string; url: string; name?: string }>[];
      }>;
    }>
  | Readonly<{
      kind: 'releaseWorkItem';
      workItemId: string;
      personId: string;
      steps: readonly string[];
    }>;

export type RuntimeAction =
  | Readonly<{
      kind: 'claim';
      workItemId: string;
      stepId: string;
      parentClaimId: string | null;
      execution: ExecutionIdentity;
    }>
  | Readonly<{ kind: 'write'; claim: RuntimeClaim; commands: readonly RuntimePlanCommand[] }>;

export type RuntimeCommandRequest = Readonly<{
  schemaVersion: 1;
  commandId: string;
  expectedLedgerId: string;
  authority: RuntimeAuthority;
  expectedBasis: RuntimeBasis;
  action: RuntimeAction;
}>;

/** Authority has no action; claim/write retain the complete final conditional request. */
export type RuntimeOperation =
  (RuntimeAuthorityRequest & Readonly<{ kind: 'authority' }>) | RuntimeCommandRequest;

/** Existing command refusals retain their closed detail registry at the application boundary. */
type BareRuntimeCommandCode =
  | {
      [C in CommandRefusalCode]: keyof Omit<
        CommandRefusalDetail[C],
        keyof CommandContext
      > extends never
        ? C
        : never;
    }[CommandRefusalCode]
  | Extract<RefusalCode, 'engine_unavailable' | 'invalid_estimate'>;

export type RuntimeCommandRefusal =
  | (Readonly<{ ok: false; reason: BareRuntimeCommandCode; detail?: never }> & CommandContext)
  | {
      [C in Exclude<CommandRefusalCode, BareRuntimeCommandCode>]: Readonly<{
        ok: false;
        reason: C;
      }> &
        CommandContext & { detail: Omit<CommandRefusalDetail[C], keyof CommandContext> };
    }[Exclude<CommandRefusalCode, BareRuntimeCommandCode>];

export type ClaimReceipt = RuntimeReceipt &
  Readonly<{
    acceptance: Readonly<{
      kind: 'claim';
      authority: RuntimeAuthority;
      claim: RuntimeClaim;
      basisAfter: RuntimeBasis;
    }>;
  }>;

export type RuntimeClaimRequest = RuntimeCommandRequest &
  Readonly<{
    action: Extract<RuntimeAction, { kind: 'claim' }>;
  }>;
