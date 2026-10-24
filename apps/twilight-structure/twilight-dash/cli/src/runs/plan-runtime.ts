import { addInteger, assertInteger, equalRecords } from './record-codecs';
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
  RuntimeGrant,
  RuntimeGuard,
  RuntimeIntent,
  RuntimePin,
  RuntimeScope,
  RuntimeScopeSnapshot,
} from './runtime-records';

export interface RuntimeScopeRecord {
  readonly pin: RuntimePin;
  readonly revision: number;
}
export interface RuntimeCatalog {
  readonly scopes: readonly RuntimeScopeRecord[];
  readonly intents: readonly RuntimeIntent[];
  readonly acceptances: readonly RuntimeAcceptance[];
}

/** Replays every consecutive event from the immutable pin, rejecting missing links rather than repairing history. Staged local epochs must never decrease across the ordered history. The latest local epoch uses the same persisted ownership label even after expiry. Older labels have no independent owner ledger, and coherent metadata/history replacement is outside this audit. */
export function reconstructRuntimeScope(
  retained: RuntimeScopeRecord,
  intents: readonly RuntimeIntent[],
  acceptances: readonly RuntimeAcceptance[],
  ownership: OwnershipStatus,
): Extract<RuntimeScopeSnapshot, { kind: 'pinned' }> {
  const ownerEpoch = ownership.epoch;
  const pin = decodeRuntimePin(retained.pin);
  assertInteger(retained.revision);
  assertInteger(ownerEpoch);
  const events = [
    ...intents.map((intent) => ({ revision: intent.stagedRevision, intent, acceptance: null })),
    ...acceptances.map((acceptance) => ({
      revision: acceptance.acceptedRevision,
      intent: null,
      acceptance,
    })),
  ].sort((left, right) => left.revision - right.revision);
  let revision = 0;
  let stagedEpoch = 0;
  let pending: RuntimeIntent | null = null;
  let generation: number | null = null;
  let grant: RuntimeGrant | null = null;
  let latestAuthority: { readonly intent: RuntimeIntent; readonly grant: RuntimeGrant } | null =
    null;
  const orderedIntents: RuntimeIntent[] = [];
  const orderedAcceptances: RuntimeAcceptance[] = [];
  for (const event of events) {
    // Proof: F08 removed consecutive event validation; 'trusted runtime intent revision gap' failed and exact restoration passed.
    if (event.revision !== addInteger(revision, 1))
      throw new Error('corrupt runtime event revision');
    revision = event.revision;
    if (event.intent !== null) {
      const intent = decodeRuntimeIntent(event.intent);
      const { scope, operation } = readRuntimeRequest(intent.canonicalRequest);
      if (
        (!('kind' in operation) && operation.action.kind !== 'claim') ||
        !equalRuntimeScopes(scope, pin.scope) ||
        // Proof: F11 removed retained ledger correspondence; 'trusted runtime scope ledger' failed and exact restoration passed.
        operation.expectedLedgerId !== pin.ledgerId ||
        operation.commandId !== intent.commandId ||
        // Proof: F10 removed independent request digest verification; 'trusted runtime consistent false digest' failed and exact restoration passed.
        digestRuntimeRequest(intent.canonicalRequest) !== intent.requestDigest ||
        // Proof: F12 allowed provenance from a future local epoch; 'trusted runtime future local epoch' failed and exact restoration passed.
        intent.localOwner.epoch > ownerEpoch
      )
        throw new Error('corrupt runtime intent identity');
      if (
        intent.localOwner.epoch === ownerEpoch &&
        // Proof: F57 ignored the latest persisted local owner label; 'trusted runtime current local label' failed and exact restoration passed.
        intent.localOwner.ownerId !== ownership.owner?.ownerId
      )
        throw new Error('corrupt runtime current local owner');
      // Proof: R1F01 removing this guard admitted persisted [2,1] epochs; read, mutation and reopen missing-rejection tests failed, and exact restoration passed.
      if (intent.localOwner.epoch < stagedEpoch)
        throw new Error('corrupt runtime local epoch progression');
      stagedEpoch = intent.localOwner.epoch;
      // Proof: F13 allowed overlapping pending historical events; 'trusted runtime second pending event' failed and exact restoration passed.
      if (pending !== null) throw new Error('corrupt runtime pending command');
      if (
        // Proof: F14 removed historical receiver generation progression; 'retained generation progression' failed and exact restoration passed.
        'kind' in operation &&
        generation !== null &&
        (operation.expectedGeneration === null || operation.expectedGeneration < generation)
      )
        throw new Error('corrupt runtime generation progression');
      // Proof: F230 removed this compound check; all three 'review guard runtime claim reconstruction rejects' samples lost their expected throw after valid reconstruction. One owner/three samples; exact restoration passed.
      if (
        !('kind' in operation) &&
        (latestAuthority === null ||
          !equalRecords(latestAuthority.intent.localOwner, intent.localOwner) ||
          !equalRecords(operation.authority, latestAuthority.grant.authority))
      )
        throw new Error('corrupt runtime claim authority');
      pending = intent;
      orderedIntents.push(intent);
    } else {
      const acceptance = decodeRuntimeAcceptance(event.acceptance);
      if (
        acceptance.commandId !== pending?.commandId ||
        // Proof: F15 removed acceptance digest linkage; 'trusted runtime acceptance digest' failed and exact restoration passed.
        acceptance.requestDigest !== pending.requestDigest
      )
        throw new Error('corrupt runtime acceptance link');
      const { operation } = readRuntimeRequest(pending.canonicalRequest);
      if ('kind' in operation) {
        generation =
          operation.expectedGeneration === null ? 1 : addInteger(operation.expectedGeneration, 1);
        const acceptedGrant: RuntimeGrant = {
          localEpoch: pending.localOwner.epoch,
          commandId: pending.commandId,
          authority: { ownerId: operation.ownerId, generation },
        };
        latestAuthority = { intent: pending, grant: acceptedGrant };
        grant = pending.localOwner.epoch === ownerEpoch ? acceptedGrant : null;
      } else if (operation.action.kind !== 'claim')
        throw new Error('corrupt runtime unsupported acceptance');
      orderedAcceptances.push(acceptance);
      pending = null;
    }
  }
  // Proof: F09 removed final revision validation; 'trusted runtime final revision' failed and exact restoration passed.
  if (revision !== retained.revision) throw new Error('corrupt runtime final revision');
  return {
    version: 1,
    kind: 'pinned',
    pin,
    revision,
    ownerEpoch,
    intents: orderedIntents,
    acceptances: orderedAcceptances,
    pendingCommandId: pending?.commandId ?? null,
    grant,
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
  for (const retained of scopes.values()) {
    const intents = catalog.intents.filter((intent) =>
      equalRuntimeScopes(readRuntimeRequest(intent.canonicalRequest).scope, retained.pin.scope),
    );
    const identities = new Set(intents.map((intent) => intent.commandId));
    reconstructRuntimeScope(
      retained,
      intents,
      catalog.acceptances.filter((acceptance) => identities.has(acceptance.commandId)),
      ownership,
    );
  }
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
    return { version: 1, kind: 'uninitialized', scope: structuredClone(scope), ownerEpoch };
  const intents = catalog.intents.filter((intent) =>
    equalRuntimeScopes(readRuntimeRequest(intent.canonicalRequest).scope, scope),
  );
  const commands = new Set(intents.map((intent) => intent.commandId));
  return reconstructRuntimeScope(
    retained,
    intents,
    catalog.acceptances.filter((acceptance) => commands.has(acceptance.commandId)),
    ownership,
  );
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
  // Proof: F39 allowed unsupported claim/write staging; 'canonical bytes and supported authority' failed and exact restoration passed.
  if (!('kind' in operation)) return { kind: 'refused', reason: 'state_conflict' };
  // Proof: F04 removed staging revision comparison; 'one pending command' failed and exact restoration passed.
  if (snapshot.revision !== guard.expectedRevision)
    return { kind: 'refused', reason: 'revision_conflict' };
  // Proof: F03 removed pending serialization; 'one pending command' failed and exact restoration passed.
  if (snapshot.pendingCommandId !== null) return { kind: 'refused', reason: 'state_conflict' };
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
