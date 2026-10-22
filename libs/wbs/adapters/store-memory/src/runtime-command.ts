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

/** Reads the canonical retained scope tuple; malformed or aliased keys throw before lookup absence. */
function parseScopeKey(key: string): RuntimeScope {
  const parts: unknown = JSON.parse(key);
  // Proof: F1-03 removed tuple validation; an extra scope-key position passed the count-preserving audit.
  if (!Array.isArray(parts) || parts.length !== 3) throw new Error('invalid runtime scope key');
  const slots: readonly unknown[] = parts;
  const [organizationId, projectId, personId] = slots;
  // Proof: F1-04 bypassed scoped-ID validation; a numeric retained organization ID passed inspection.
  const scope = parseRuntimeScope({ organizationId, projectId, personId });
  // Proof: F1-05 removed canonical matching; a whitespace alias passed audit and hid the original scope.
  if (JSON.stringify(parts) !== key) throw new Error('runtime scope key identity mismatch');
  return scope;
}

/** Reads a retained binding key and refuses a different claim identity or noncanonical lookup bytes. */
function parseBindingScope(key: string, claimId: string): RuntimeScope {
  const parts: unknown = JSON.parse(key);
  // Proof: F1-06 removed key shape validation; a three-position binding lookup passed inspection.
  if (!Array.isArray(parts) || parts.length !== 2 || typeof parts[0] !== 'string')
    throw new Error('invalid runtime binding key');
  // Proof: F1-07 removed canonical matching; an outer whitespace alias passed audit and hid the binding.
  if (JSON.stringify(parts) !== key) throw new Error('runtime binding key identity mismatch');
  // Proof: F1-08 removed claim matching; a different retained claim ID passed inspection.
  if (parts[1] !== claimId) throw new Error('runtime binding lookup identity mismatch');
  // Proof: F1-09 replaced scoped-key parsing with a valid invented scope; a malformed retained scope passed audit.
  return parseScopeKey(parts[0]);
}

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
    for (const [key, held] of table.authorities) {
      // Proof: F1-02 omitted authority-key inspection; malformed JSON keys passed the real memory audit.
      parseScopeKey(key);
      parseRuntimeAuthority(held);
    }
    const attempts = new Set<string>();
    for (const [key, bound] of table.bindings) {
      const claim = parseRuntimeClaim(bound);
      const scoped = parseBindingScope(key, claim.claimId);
      const attempt = JSON.stringify([
        keyScope(scoped),
        claim.execution.storeId,
        claim.execution.attemptId,
      ]);
      // Proof: F1-10 omitted uniqueness; two retained claims for one scoped store/attempt passed inspection.
      if (attempts.has(attempt)) throw new Error('runtime attempt binding uniqueness violated');
      attempts.add(attempt);
    }
    for (const [key, stored] of table.acceptances) {
      const accepted = parseStoredRuntimeAcceptance(stored);
      // Proof: F1-11 omitted lookup correspondence; a malformed acceptance key passed audit and became false absence.
      if (key !== keyRecord(accepted.scope, accepted.commandId))
        throw new Error('runtime acceptance lookup identity mismatch');
      // Proof: F1-12 omitted the installation comparison; a receipt for another ledger passed inspection.
      if (accepted.receipt.ledgerId !== ledger.ledgerId)
        throw new Error('runtime acceptance ledger mismatch');
    }
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
