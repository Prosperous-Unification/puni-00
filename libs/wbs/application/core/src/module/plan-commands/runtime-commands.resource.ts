import type { RuntimeAuthority, RuntimeClaim, RuntimeReceipt, RuntimeScope } from '@wbs/contracts';

import type { RuntimeCommandStore } from '../../ports/runtime-command-store';
import type { RuntimeLedger, StoredRuntimeAcceptance } from '../../ports/runtime-command-values';

/**
 * Persistence operations fixed to one admitted organization/project/person.
 * The borrowed store never escapes, and feature helpers retain all receiver guards.
 * Proof: exposing #store publicly made the unchanged production module audit reject RuntimeAdmission.commands.
 */
export class RuntimeCommands {
  readonly #store: RuntimeCommandStore;
  readonly #scope: RuntimeScope;

  constructor(store: RuntimeCommandStore, scope: RuntimeScope) {
    this.#store = store;
    this.#scope = { ...scope };
  }

  inspectLedger(): Promise<RuntimeLedger> {
    return this.#store.inspectLedger();
  }

  assertAbsentHistory(): Promise<void> {
    return this.#store.assertAbsentHistory();
  }

  readAuthority(): Promise<RuntimeAuthority | null> {
    return this.#store.readAuthority(this.#scope);
  }

  compareAuthority(
    expectedGeneration: number | null,
    ownerId: string,
  ): Promise<RuntimeAuthority | null> {
    return this.#store.compareAuthority(this.#scope, expectedGeneration, ownerId);
  }

  readBinding(claimId: string): Promise<RuntimeClaim | null> {
    return this.#store.readBinding(this.#scope, claimId);
  }

  readAttemptBinding(storeId: string, attemptId: string): Promise<RuntimeClaim | null> {
    return this.#store.readAttemptBinding(this.#scope, storeId, attemptId);
  }

  insertBinding(claim: RuntimeClaim): Promise<void> {
    return this.#store.insertBinding(this.#scope, claim);
  }

  readAcceptance(commandId: string): Promise<StoredRuntimeAcceptance | null> {
    return this.#store.readAcceptance(this.#scope, commandId);
  }

  insertAcceptance(
    accepted: Readonly<{
      schemaVersion: 1;
      commandId: string;
      canonicalRequest: string;
      requestDigest: string;
      receipt: RuntimeReceipt;
    }>,
  ): Promise<void> {
    return this.#store.insertAcceptance({ ...accepted, scope: this.#scope });
  }
}
