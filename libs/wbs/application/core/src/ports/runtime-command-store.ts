import type { RuntimeAuthority, RuntimeClaim, RuntimeScope } from '@wbs/contracts';

import type { RuntimeLedger, StoredRuntimeAcceptance } from './runtime-command-values';

export type { RuntimeLedger, StoredRuntimeAcceptance } from './runtime-command-values';
export type {
  ExecutionIdentity,
  RuntimeAuthority,
  RuntimeClaim,
  RuntimeReceipt,
  RuntimeScope,
} from '@wbs/contracts';

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
