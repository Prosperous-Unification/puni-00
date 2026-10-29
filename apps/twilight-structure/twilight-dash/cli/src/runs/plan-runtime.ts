import {
  auditRecoveryCatalog,
  reconstructRuntimePrefix,
  type RecoveryCatalog,
} from './plan-recovery-history';
import { addInteger, equalRecords } from './record-codecs';
import type { OwnershipStatus } from './records';
import type { StoreReply } from './run-store';
import {
  decodeRuntimeAcceptance,
  decodeRuntimeIntent,
  decodeRuntimePin,
  digestRuntimeRequest,
  equalRuntimeScopes,
  readRuntimeRequest,
  runtimeScopeKey,
} from './runtime-codecs';
import type {
  RuntimeAcceptance,
  RuntimeAcceptanceInput,
  RuntimeGuard,
  RuntimeIntent,
  RuntimePin,
  RuntimeScope,
  RuntimeScopeSnapshot,
  RuntimeScopeSnapshot2,
} from './runtime-records';

export interface RuntimeScopeRecord {
  readonly pin: RuntimePin;
  readonly revision: number;
}
export interface RuntimeCatalog {
  readonly recovery: RecoveryCatalog;
  readonly scopes: readonly RuntimeScopeRecord[];
  readonly intents: readonly RuntimeIntent[];
  readonly acceptances: readonly RuntimeAcceptance[];
}

/** Publishes current activity only after complete recovery associations and index validation. */
export function reconstructRuntimeScope(
  retained: RuntimeScopeRecord,
  catalog: RuntimeCatalog,
  ownership: OwnershipStatus,
): Extract<RuntimeScopeSnapshot2, { kind: 'pinned' }> {
  auditRecoveryCatalog(catalog, ownership);
  const prefix = reconstructRuntimePrefix(retained, catalog, ownership, retained.revision);
  return {
    ...prefix,
    recoveries: catalog.recovery.histories.filter((history) =>
      equalRuntimeScopes(
        readRuntimeRequest(history.intent.target.original.canonicalRequest).scope,
        retained.pin.scope,
      ),
    ),
    activeRecoveryId:
      catalog.recovery.active.find((active) => equalRuntimeScopes(active.scope, retained.pin.scope))
        ?.recoveryId ?? null,
  };
}

/** Audits complete owned history before any target lookup or absence response. */
export function auditRuntimeCatalog(catalog: RuntimeCatalog, ownership: OwnershipStatus): void {
  const organizationId = ownership.organizationId;
  const scopes = new Map<string, RuntimeScopeRecord>();
  const commands = new Map<string, RuntimeIntent>();
  const accepted = new Set<string>();
  for (const scope of catalog.scopes) {
    const pin = decodeRuntimePin(scope.pin);
    const key = runtimeScopeKey(pin.scope);
    if (pin.scope.organizationId !== organizationId || scopes.has(key))
      throw new Error('corrupt runtime scope identity');
    scopes.set(key, scope);
  }
  for (const candidate of catalog.intents) {
    const intent = decodeRuntimeIntent(candidate);
    const request = readRuntimeRequest(intent.canonicalRequest);
    // Proof: F62 ignored an orphan intent after concealed scope loss; 'trusted runtime lost scope concealed' failed and exact restoration passed.
    if (!scopes.has(runtimeScopeKey(request.scope)) || commands.has(intent.commandId))
      throw new Error('corrupt runtime intent scope or command');
    commands.set(intent.commandId, intent);
  }
  for (const candidate of catalog.acceptances) {
    const acceptance = decodeRuntimeAcceptance(candidate);
    if (!commands.has(acceptance.commandId) || accepted.has(acceptance.commandId))
      throw new Error('corrupt runtime acceptance command');
    accepted.add(acceptance.commandId);
  }
  auditRecoveryCatalog(catalog, ownership);
  for (const retained of scopes.values()) reconstructRuntimeScope(retained, catalog, ownership);
}

/** Reads one already audited catalog; raw history has not independently read receipt artifacts. */
export function inspectRuntimeScope(
  catalog: RuntimeCatalog,
  scope: RuntimeScope,
  ownership: OwnershipStatus,
): RuntimeScopeSnapshot {
  const organizationId = ownership.organizationId;
  const ownerEpoch = ownership.epoch;
  // Proof: F60 allowed foreign organization inspection; 'owner fencing precedes corrupt or absent' failed and exact restoration passed.
  if (scope.organizationId !== organizationId)
    throw new Error('runtime scope organization differs');
  auditRuntimeCatalog(catalog, ownership);
  const retained = catalog.scopes.find((candidate) =>
    equalRuntimeScopes(candidate.pin.scope, scope),
  );
  if (retained === undefined)
    return {
      version: 2,
      kind: 'uninitialized',
      scope: structuredClone(scope),
      ownerEpoch,
      recoveries: [],
      activeRecoveryId: null,
      generationFloor: null,
    };
  return reconstructRuntimeScope(retained, catalog, ownership);
}

export function planRuntimePin(
  catalog: RuntimeCatalog,
  pin: RuntimePin,
  organizationId: string,
): StoreReply<RuntimePin> {
  // Proof: F59 allowed a foreign organization pin; 'owner fencing precedes corrupt or absent' failed and exact restoration passed.
  if (pin.scope.organizationId !== organizationId)
    return { kind: 'refused', reason: 'authority_conflict' };
  const retained = catalog.scopes.find((candidate) =>
    equalRuntimeScopes(candidate.pin.scope, pin.scope),
  );
  if (retained !== undefined)
    // Proof: F01 bypassed immutable pin equality; 'pin is immutable' failed and exact restoration passed.
    return equalRecords(retained.pin, pin)
      ? { kind: 'duplicate', value: retained.pin }
      : { kind: 'refused', reason: 'identity_conflict' };
  return { kind: 'applied', value: pin };
}

/** Exact redelivery precedes revision checks, while global command identities and one pending request are immutable. */
export function planRuntimeStage(
  catalog: RuntimeCatalog,
  guard: RuntimeGuard,
  canonicalRequest: string,
  ownership: OwnershipStatus,
): StoreReply<RuntimeIntent> {
  const { scope, operation } = readRuntimeRequest(canonicalRequest);
  if (
    guard.scope.organizationId !== guard.ownership.organizationId ||
    // Proof: F61 ignored complete request scope correspondence; 'owner fencing precedes corrupt or absent' failed and exact restoration passed.
    !equalRuntimeScopes(scope, guard.scope)
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: F228 removed this early refusal; 'review guard authority stage refuses coupled claim replay' returned duplicate instead of state_conflict. Replay-contract only; exact restoration passed.
  if (!('kind' in operation)) return { kind: 'refused', reason: 'state_conflict' };
  const previous = catalog.intents.find((intent) => intent.commandId === operation.commandId);
  if (previous !== undefined)
    // Proof: F02 bypassed canonical command equality; 'one pending command' failed and exact restoration passed.
    return previous.canonicalRequest === canonicalRequest
      ? { kind: 'duplicate', value: previous }
      : { kind: 'refused', reason: 'identity_conflict' };
  const snapshot = inspectRuntimeScope(catalog, scope, ownership);
  // Proof: F64 removed the named never-pinned diagnostic; 'authority history port exists' failed and exact restoration passed.
  if (snapshot.kind !== 'pinned') throw new Error('runtime scope is not pinned');
  // Proof: F52 ignored the pinned request ledger; 'canonical bytes and supported' failed and exact restoration passed.
  if (snapshot.pin.ledgerId !== operation.expectedLedgerId)
    return { kind: 'refused', reason: 'authority_conflict' };
  // Proof: I2-A removed the early authority refusal, then this late refusal; 'I2-A negative' received applied instead of state_conflict. Conditional late-barrier proof only; exact restoration passed.
  if (!('kind' in operation)) return { kind: 'refused', reason: 'state_conflict' };
  // Proof: F04 removed staging revision comparison; 'one pending command' failed and exact restoration passed.
  if (snapshot.revision !== guard.expectedRevision)
    return { kind: 'refused', reason: 'revision_conflict' };
  // Proof: F03 removed pending serialization; 'one pending command' failed and exact restoration passed.
  if (snapshot.pendingCommandId !== null) return { kind: 'refused', reason: 'state_conflict' };
  // Proof: R2F44 removed only floor comparison; expected3 staged behind barrier4 while exact original replay remained valid. Exact restoration passed.
  if (
    snapshot.version === 2 &&
    snapshot.generationFloor !== null &&
    (operation.expectedGeneration === null ||
      operation.expectedGeneration < snapshot.generationFloor)
  )
    return { kind: 'refused', reason: 'authority_conflict' };
  const latest = snapshot.acceptances.findLast((acceptance) => {
    const intent = snapshot.intents.find(
      (candidate) => candidate.commandId === acceptance.commandId,
    );
    if (intent === undefined) throw new Error('runtime acceptance intent missing');
    return 'kind' in readRuntimeRequest(intent.canonicalRequest).operation;
  });
  if (latest !== undefined) {
    const intent = snapshot.intents.find((candidate) => candidate.commandId === latest.commandId);
    if (intent === undefined) throw new Error('runtime acceptance intent missing');
    const accepted = readRuntimeRequest(intent.canonicalRequest).operation;
    if (!('kind' in accepted)) throw new Error('runtime accepted operation is not authority');
    const generation =
      accepted.expectedGeneration === null ? 1 : addInteger(accepted.expectedGeneration, 1);
    // Proof: F38 allowed a backward receiver generation request; 'one pending command' failed and exact restoration passed.
    if (operation.expectedGeneration === null || operation.expectedGeneration < generation)
      return { kind: 'refused', reason: 'authority_conflict' };
  }
  return {
    kind: 'applied',
    value: {
      version: 1,
      commandId: operation.commandId,
      canonicalRequest,
      requestDigest: digestRuntimeRequest(canonicalRequest),
      localOwner: { ownerId: guard.ownership.ownerId, epoch: guard.ownership.epoch },
      stagedRevision: addInteger(snapshot.revision, 1),
    },
  };
}

/** Trusted receipt persistence compares all immutable intent provenance and preserves the original acceptance reply. */
export function planRuntimeAcceptance(
  catalog: RuntimeCatalog,
  guard: RuntimeGuard,
  input: RuntimeAcceptanceInput,
  ownership: OwnershipStatus,
): StoreReply<RuntimeAcceptance> {
  if (guard.scope.organizationId !== guard.ownership.organizationId)
    return { kind: 'refused', reason: 'authority_conflict' };
  const retained = catalog.intents.find((intent) => intent.commandId === input.intent.commandId);
  if (
    retained === undefined ||
    // Proof: F05 bypassed complete immutable intent equality; 'one pending command' failed and exact restoration passed.
    !equalRecords(retained, input.intent) ||
    !equalRuntimeScopes(readRuntimeRequest(retained.canonicalRequest).scope, guard.scope)
  )
    return { kind: 'refused', reason: 'identity_conflict' };
  // Proof: F229 removed this early refusal; 'review guard authority acceptance refuses coupled claim replay' returned duplicate instead of state_conflict. Replay-contract only; exact restoration passed.
  if (!('kind' in readRuntimeRequest(retained.canonicalRequest).operation))
    return { kind: 'refused', reason: 'state_conflict' };
  const previous = catalog.acceptances.find(
    (acceptance) => acceptance.commandId === retained.commandId,
  );
  if (previous !== undefined)
    // Proof: F06 bypassed retained evidence equality; 'one pending command' failed and exact restoration passed.
    return equalRecords(previous.evidence, input.evidence)
      ? { kind: 'duplicate', value: previous }
      : { kind: 'refused', reason: 'identity_conflict' };
  const snapshot = inspectRuntimeScope(catalog, guard.scope, ownership);
  if (snapshot.kind !== 'pinned') throw new Error('runtime scope is not pinned');
  // Proof: F37 removed fresh acceptance revision comparison; 'one pending command' failed and exact restoration passed.
  if (snapshot.revision !== guard.expectedRevision)
    return { kind: 'refused', reason: 'revision_conflict' };
  if (snapshot.pendingCommandId !== retained.commandId)
    return { kind: 'refused', reason: 'state_conflict' };
  const { operation } = readRuntimeRequest(retained.canonicalRequest);
  // Proof: I2-G substituted a schema-valid claim only at this final authority decode, then removed this diagnostic; 'I2-G negative' received 'invalid run store integer' instead of 'runtime accepted operation is not authority'. Both threw with unchanged rows; exact restoration passed.
  if (!('kind' in operation)) throw new Error('runtime accepted operation is not authority');
  // Proof: F58 omitted checked receiver generation increment before persistence; 'receiver generation overflow' failed and exact restoration passed.
  if (operation.expectedGeneration !== null) addInteger(operation.expectedGeneration, 1);
  return {
    kind: 'applied',
    value: {
      version: 1,
      commandId: retained.commandId,
      requestDigest: retained.requestDigest,
      evidence: input.evidence,
      acceptedRevision: addInteger(snapshot.revision, 1),
    },
  };
}
