import type { RuntimeAuthority, RuntimeClaim, RuntimeReceipt, RuntimeScope } from '@wbs/contracts';

export type {
  ExecutionIdentity,
  RuntimeAuthority,
  RuntimeClaim,
  RuntimeReceipt,
  RuntimeScope,
} from '@wbs/contracts';

/** Permanent installation identity and retained-row witnesses, never a cache of current claims. */
export type RuntimeLedger = Readonly<{
  schemaVersion: 1;
  ledgerId: string;
  authorityCount: number;
  bindingCount: number;
  receiptCount: number;
}>;

/** Trusted accepted-record storage; canonical bytes remain authoritative alongside their digest. */
export type StoredRuntimeAcceptance = Readonly<{
  schemaVersion: 1;
  scope: RuntimeScope;
  commandId: string;
  canonicalRequest: string;
  requestDigest: string;
  receipt: RuntimeReceipt;
}>;

/**
 * Borrowed transactional persistence primitives, not application acceptance.
 * Mutations update rows and retained counts atomically; records have no delete API.
 * Reads throw for missing, malformed or inconsistent trusted installation state.
 * Public admission must inspect the ledger and compare the caller's pinned identity.
 */
export interface RuntimeCommandStore {
  /** Fully audits constrained schema, installation identity, retained counts and records. */
  inspectLedger(): Promise<RuntimeLedger>;
  /** Rechecks retained counts before a caller declares authoritative absence. */
  assertAbsentHistory(): Promise<void>;
  readAuthority(scope: RuntimeScope): Promise<RuntimeAuthority | null>;
  /** Null is a CAS mismatch; a successful initialization starts at generation 1. */
  compareAuthority(
    scope: RuntimeScope,
    expectedGeneration: number | null,
    ownerId: string,
  ): Promise<RuntimeAuthority | null>;
  readBinding(scope: RuntimeScope, claimId: string): Promise<RuntimeClaim | null>;
  readAttemptBinding(
    scope: RuntimeScope,
    storeId: string,
    attemptId: string,
  ): Promise<RuntimeClaim | null>;
  /** Throws for an unexpected duplicate claim or scope/store/attempt identity. */
  insertBinding(scope: RuntimeScope, claim: RuntimeClaim): Promise<void>;
  readAcceptance(scope: RuntimeScope, commandId: string): Promise<StoredRuntimeAcceptance | null>;
  /** Throws for an unexpected command collision; never overwrites its immutable reply. */
  insertAcceptance(stored: StoredRuntimeAcceptance): Promise<void>;
}
