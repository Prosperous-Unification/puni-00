import type {
  RuntimeAuthority,
  RuntimeClaim,
  RuntimeCommandStore,
  RuntimeLedger,
  RuntimeScope,
  StoredRuntimeAcceptance,
} from '@wbs/core';
import {
  parseRuntimeAuthority,
  parseRuntimeClaim,
  parseRuntimeLedger,
  parseRuntimeScope,
  parseStoredRuntimeAcceptance,
} from '@wbs/core/ports/runtime-command-records';

/** Cloneable permanent history owned by one memory source, separate from live claims. */
export interface MemoryRuntimeTable {
  ledger: RuntimeLedger;
  authorities: Map<string, RuntimeAuthority>;
  bindings: Map<string, RuntimeClaim>;
  acceptances: Map<string, StoredRuntimeAcceptance>;
}

/** Explicit installation of a new memory source, never invoked by a read. */
export function memoryRuntimeTable(): MemoryRuntimeTable {
  return {
    ledger: {
      schemaVersion: 1,
      ledgerId: crypto.randomUUID(),
      authorityCount: 0,
      bindingCount: 0,
      receiptCount: 0,
    },
    authorities: new Map(),
    bindings: new Map(),
    acceptances: new Map(),
  };
}
const keyScope = (scope: RuntimeScope) => {
  const scoped = parseRuntimeScope(scope);
  return JSON.stringify([scoped.organizationId, scoped.projectId, scoped.personId]);
};
const keyRecord = (scope: RuntimeScope, id: string) => JSON.stringify([keyScope(scope), id]);

/** Binds permanent history to the same cloned state as all other borrowed stores. */
export function inMemoryRuntimeCommands(table: MemoryRuntimeTable): RuntimeCommandStore {
  function inspectState(): RuntimeLedger {
    const ledger = parseRuntimeLedger(table.ledger);
    // Proof: P32 removed reconciliation; cleared retained memory history became scope/receipt absence.
    if (
      ledger.authorityCount !== table.authorities.size ||
      ledger.bindingCount !== table.bindings.size ||
      ledger.receiptCount !== table.acceptances.size
    )
      throw new Error('runtime retained history counts differ');
    for (const held of table.authorities.values()) parseRuntimeAuthority(held);
    for (const bound of table.bindings.values()) parseRuntimeClaim(bound);
    for (const accepted of table.acceptances.values()) parseStoredRuntimeAcceptance(accepted);
    return structuredClone(ledger);
  }
  function incrementCount(field: 'authorityCount' | 'bindingCount' | 'receiptCount'): void {
    table.ledger = parseRuntimeLedger({ ...table.ledger, [field]: table.ledger[field] + 1 });
  }
  function findAttempt(
    scope: RuntimeScope,
    storeId: string,
    attemptId: string,
  ): RuntimeClaim | null {
    const prefix = `[${JSON.stringify(keyScope(scope))},`;
    for (const [key, bound] of table.bindings) {
      if (
        key.startsWith(prefix) &&
        bound.execution.storeId === storeId &&
        bound.execution.attemptId === attemptId
      )
        return structuredClone(bound);
    }
    return null;
  }
  return {
    inspectLedger: () => Promise.resolve().then(inspectState),
    assertAbsentHistory: () =>
      Promise.resolve().then(() => {
        inspectState();
      }),
    readAuthority: (scope) =>
      Promise.resolve().then(() => {
        inspectState();
        return structuredClone(table.authorities.get(keyScope(scope)) ?? null);
      }),
    compareAuthority: (scope, expected, ownerId) =>
      Promise.resolve().then(() => {
        inspectState();
        const key = keyScope(scope);
        const held = table.authorities.get(key);
        if ((held?.generation ?? null) !== expected) return null;
        const grant = parseRuntimeAuthority({ ownerId, generation: (held?.generation ?? 0) + 1 });
        if (held === undefined) incrementCount('authorityCount');
        table.authorities.set(key, grant);
        return structuredClone(grant);
      }),
    readBinding: (scope, claimId) =>
      Promise.resolve().then(() => {
        inspectState();
        return structuredClone(table.bindings.get(keyRecord(scope, claimId)) ?? null);
      }),
    readAttemptBinding: (scope, storeId, attemptId) =>
      Promise.resolve().then(() => {
        inspectState();
        return findAttempt(scope, storeId, attemptId);
      }),
    insertBinding: (scope, bound) =>
      Promise.resolve().then(() => {
        inspectState();
        parseRuntimeClaim(bound);
        // Proof: P10 removed this check; a second claim for the same runtime attempt was inserted.
        if (
          table.bindings.has(keyRecord(scope, bound.claimId)) ||
          findAttempt(scope, bound.execution.storeId, bound.execution.attemptId) !== null
        )
          throw new Error('runtime binding uniqueness violated');
        // Proof: P09 omitted this increment; the real-source binding/count check failed.
        incrementCount('bindingCount');
        table.bindings.set(keyRecord(scope, bound.claimId), structuredClone(bound));
      }),
    readAcceptance: (scope, commandId) =>
      Promise.resolve().then(() => {
        inspectState();
        return structuredClone(table.acceptances.get(keyRecord(scope, commandId)) ?? null);
      }),
    insertAcceptance: (accepted) =>
      Promise.resolve().then(() => {
        inspectState();
        parseStoredRuntimeAcceptance(accepted);
        // Proof: P18 omitted the pin comparison; wrong-ledger accepted-record insertion resolved.
        if (accepted.receipt.ledgerId !== table.ledger.ledgerId)
          throw new Error('runtime acceptance ledger mismatch');
        const key = keyRecord(accepted.scope, accepted.commandId);
        // Proof: P11 removed uniqueness; a changed request replaced the immutable scoped command record.
        if (table.acceptances.has(key)) throw new Error('runtime command uniqueness violated');
        incrementCount('receiptCount');
        table.acceptances.set(key, structuredClone(accepted));
      }),
  };
}
