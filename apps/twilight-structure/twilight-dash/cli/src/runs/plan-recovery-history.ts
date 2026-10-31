import type { RuntimeCatalog, RuntimeScopeRecord } from './plan-runtime';
import { addInteger, assertInteger, equalRecords } from './record-codecs';
import type { OwnershipStatus } from './records';
import { decodeRecoveryHistory } from './recovery-codecs';
import { deriveRecoveryClaimCommand } from './recovery-evidence';
import type {
  ClaimRecoveryDecision,
  RecoveryExchangeValue,
  RecoveryFence,
  RecoveryHistory,
  RecoveryIntent,
  RecoveryObservation,
} from './recovery-records';
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
  RuntimeGrant,
  RuntimeIntent,
  RuntimeScope,
  RuntimeScopeSnapshot2,
} from './runtime-records';

type AuthorityReceipt = Extract<
  RecoveryObservation,
  { kind: 'accepted' }
>['reply']['body']['value'];
type ClaimReceipt = Extract<ClaimRecoveryDecision, { kind: 'accepted' }>['lookup']['body']['value'];
export interface RecoveryBarrier {
  readonly recoveryId: string;
  readonly scope: RuntimeScope;
  readonly scopeBefore: number;
  readonly scopeAfter: number;
  readonly generationFloor: number;
}
export interface RecoveryCatalog {
  readonly histories: readonly RecoveryHistory[];
  readonly barriers: readonly RecoveryBarrier[];
  readonly active: readonly { readonly scope: RuntimeScope; readonly recoveryId: string }[];
  readonly counts: Readonly<{
    journals: number;
    fences: number;
    observations: number;
    closures: number;
    barriers: number;
    active: number;
  }>;
}
export type RuntimeScopeView2 = Omit<
  Extract<RuntimeScopeSnapshot2, { kind: 'pinned' }>,
  'activeRecoveryId' | 'recoveries'
>;

/** Replays every consecutive event from the immutable pin, rejecting missing links rather than repairing history. Staged local epochs must never decrease across the ordered history. The latest local epoch uses the same persisted ownership label even after expiry. Older labels have no independent owner ledger, and coherent metadata/history replacement is outside this audit. */
export function reconstructRuntimePrefix(
  retained: RuntimeScopeRecord,
  catalog: RuntimeCatalog,
  ownership: OwnershipStatus,
  requestedRevision: number,
): RuntimeScopeView2 {
  auditRecoveryAssociations(catalog, ownership);
  assertInteger(requestedRevision);
  if (requestedRevision > retained.revision)
    // Proof: R2F41 removed only this check; 'runtime prefix cannot fold future events beyond the retained scope cut' lost its required rejection. Exact restoration passed.
    throw new Error('runtime prefix exceeds retained revision');
  const intents = catalog.intents.filter(
    (intent) =>
      intent.stagedRevision <= requestedRevision &&
      equalRuntimeScopes(readRuntimeRequest(intent.canonicalRequest).scope, retained.pin.scope),
  );
  const commands = new Set(intents.map((intent) => intent.commandId));
  const acceptances = catalog.acceptances.filter(
    (acceptance) =>
      acceptance.acceptedRevision <= requestedRevision && commands.has(acceptance.commandId),
  );
  const barriers = catalog.recovery.barriers.filter(
    (barrier) =>
      barrier.scopeAfter <= requestedRevision &&
      equalRuntimeScopes(barrier.scope, retained.pin.scope),
  );
  const ownerEpoch = ownership.epoch;
  const pin = decodeRuntimePin(retained.pin);
  assertInteger(retained.revision);
  assertInteger(ownerEpoch);
  const events = [
    ...intents.map((intent) => ({
      revision: intent.stagedRevision,
      intent,
      acceptance: null,
      barrier: null,
    })),
    ...acceptances.map((acceptance) => ({
      revision: acceptance.acceptedRevision,
      intent: null,
      acceptance,
      barrier: null,
    })),
    ...barriers.map((barrier) => ({
      revision: barrier.scopeAfter,
      intent: null,
      acceptance: null,
      barrier,
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
    if (event.barrier !== null) {
      const barrier = event.barrier;
      // Proof: R2F04 removed only the floor update; 'applied barrier removes latest authority' returned the stale acquisition. Exact restoration passed.
      generation = barrier.generationFloor;
      grant = null;
      latestAuthority = null;
      pending = null;
    } else if (event.intent !== null) {
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
  if (revision !== requestedRevision) throw new Error('corrupt runtime final revision');
  return {
    version: 2,
    generationFloor: generation,
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

/** Checks purpose-bound detached projections; actual byte verification belongs to verifyRecoveryHistory. */
function checkExchange(
  pair: RecoveryExchangeValue<unknown>,
  intent: RecoveryIntent,
  context: unknown,
  request: unknown,
  status: number,
): void {
  const original = readRuntimeRequest(intent.target.original.canonicalRequest);
  const exchange = pair.envelope.value;
  if (
    !equalRecords(exchange.body, pair.body.artifact) ||
    !equalRuntimeScopes(exchange.scope, original.scope) ||
    exchange.ledgerId !== original.operation.expectedLedgerId ||
    !equalRecords(exchange.context, context) ||
    !equalRecords(exchange.request, request) ||
    exchange.status !== status
  )
    // Proof: R2F15 removed only this check; 'recovery audit rejects independent state_context' lost its required rejection. Exact restoration passed.
    throw new Error('corrupt recovery exchange association');
}
function checkReceipt(receipt: AuthorityReceipt | ClaimReceipt, original: RuntimeIntent): void {
  const { scope, operation } = readRuntimeRequest(original.canonicalRequest);
  if (
    !equalRuntimeScopes(receipt.scope, scope) ||
    receipt.ledgerId !== operation.expectedLedgerId ||
    receipt.commandId !== original.commandId ||
    receipt.requestDigest !== original.requestDigest
  )
    // Proof: R2F16 removed only this check; 'coherent recovery witness rejects receipt_identity' lost its required rejection. Exact restoration passed.
    throw new Error('corrupt recovery receipt identity');
  if ('kind' in operation) {
    const generation =
      operation.expectedGeneration === null ? 1 : addInteger(operation.expectedGeneration, 1);
    if (
      receipt.acceptance.kind !== 'authority' ||
      receipt.acceptance.authority.ownerId !== operation.ownerId ||
      receipt.acceptance.authority.generation !== generation
    )
      // Proof: R2F17 removed only this check; 'coherent recovery witness rejects authority_receipt' lost its required rejection. Exact restoration passed.
      throw new Error('corrupt recovery authority receipt');
  } else {
    if (operation.action.kind !== 'claim' || receipt.acceptance.kind !== 'claim')
      // Proof: R2D01 removed this refinement; 'recovery claim kind retains its precise refinement diagnostic' received a later TypeError. Diagnostic-only; exact restoration passed.
      throw new Error('corrupt recovery claim receipt kind');
    const claim = receipt.acceptance.claim;
    if (
      claim.workItemId !== operation.action.workItemId ||
      claim.stepId !== operation.action.stepId ||
      claim.parentClaimId !== operation.action.parentClaimId ||
      claim.execution.storeId !== operation.action.execution.storeId ||
      claim.execution.runId !== operation.action.execution.runId ||
      claim.execution.attemptId !== operation.action.execution.attemptId ||
      claim.execution.sessionId !== operation.action.execution.sessionId ||
      receipt.acceptance.authority.ownerId !== operation.authority.ownerId ||
      receipt.acceptance.authority.generation !== operation.authority.generation
    )
      // Proof: R2F19 removed only this check; 'coherent recovery claim receipt cannot replace original claim target' lost its required rejection. Exact restoration passed.
      throw new Error('corrupt recovery claim receipt');
  }
}
function fenceIntent(fence: RecoveryFence): RuntimeIntent {
  return decodeRuntimeIntent({
    version: 1,
    commandId: readRuntimeRequest(fence.canonicalRequest).operation.commandId,
    canonicalRequest: fence.canonicalRequest,
    requestDigest: fence.requestDigest,
    localOwner: fence.owner,
    stagedRevision: fence.stagedRevision,
  });
}
function checkOwner(
  owner: RecoveryIntent['resolver'],
  ownership: OwnershipStatus,
  minimum: number,
): void {
  if (
    owner.epoch < minimum ||
    owner.epoch > ownership.epoch ||
    (owner.epoch === ownership.epoch && owner.ownerId !== ownership.owner?.ownerId)
  )
    // Proof: R2F20 removed only this check; 'recovery audit rejects independent resolver' lost its required rejection. Exact restoration passed.
    throw new Error('corrupt recovery resolver provenance');
}
/** Audits all retained associations without inferring current activity from a historical prefix. */
function auditRecoveryAssociations(catalog: RuntimeCatalog, ownership: OwnershipStatus): void {
  const recovery = catalog.recovery;
  const counts = {
    journals: recovery.histories.length,
    fences: recovery.histories.reduce((sum, history) => sum + history.fences.length, 0),
    observations: recovery.histories.reduce((sum, history) => sum + history.observations.length, 0),
    closures: recovery.histories.filter((history) => history.closure !== null).length,
    barriers: recovery.barriers.length,
    active: recovery.active.length,
  };
  // Proof: R2F01 removed only this check; 'complete recovery catalog rejects count' lost its required rejection. Exact restoration passed.
  if (!equalRecords(counts, recovery.counts)) throw new Error('corrupt recovery counts');
  const identities = new Set<string>();
  const commands = new Set(catalog.intents.map((intent) => intent.commandId));
  const targets = new Set<string>();
  for (const candidate of recovery.histories) {
    const history = decodeRecoveryHistory(candidate);
    const { intent, fences, observations, closure } = history;
    const { recoveryId, target } = intent;
    const original = target.original;
    const request = readRuntimeRequest(original.canonicalRequest);
    const retained = catalog.scopes.find((scope) =>
      equalRuntimeScopes(scope.pin.scope, request.scope),
    );
    if (
      identities.has(recoveryId) ||
      targets.has(original.commandId) ||
      commands.has(recoveryId) ||
      retained === undefined ||
      request.scope.organizationId !== ownership.organizationId ||
      !catalog.intents.some((entry) => equalRecords(entry, original)) ||
      retained.pin.ledgerId !== request.operation.expectedLedgerId ||
      intent.begunScopeRevision !== original.stagedRevision ||
      (target.kind === 'authority') !== 'kind' in request.operation
    )
      // Proof: R2F21 removed only this check; 'coherent recovery witness rejects journal_target' lost its required rejection. Exact restoration passed.
      throw new Error('corrupt recovery journal target');
    identities.add(recoveryId);
    targets.add(original.commandId);
    commands.add(recoveryId);
    checkOwner(intent.resolver, ownership, original.localOwner.epoch);
    let revision = 0;
    let epoch = intent.resolver.epoch;
    let previous: RecoveryFence | undefined;
    const threshold =
      'kind' in request.operation
        ? request.operation.expectedGeneration
        : request.operation.authority.generation;
    for (const fence of fences) {
      if (
        fence.recoveryId !== recoveryId ||
        fence.ordinal !== (previous?.ordinal ?? 0) + 1 ||
        fence.stagedRevision !== addInteger(revision, 1)
      )
        // Proof: R2F22 removed only this check; 'coherent recovery witness rejects fence_sequence' lost its required rejection. Exact restoration passed.
        throw new Error('corrupt recovery fence sequence');
      const wire = fenceIntent(fence);
      const parsed = readRuntimeRequest(fence.canonicalRequest);
      if (
        commands.has(wire.commandId) ||
        wire.requestDigest !== digestRuntimeRequest(wire.canonicalRequest) ||
        !equalRuntimeScopes(parsed.scope, request.scope) ||
        parsed.operation.expectedLedgerId !== retained.pin.ledgerId ||
        !('kind' in parsed.operation)
      )
        // Proof: R2F23 removed only this check; 'coherent recovery witness rejects fence_identity' lost its required rejection. Exact restoration passed.
        throw new Error('corrupt recovery fence identity');
      commands.add(wire.commandId);
      checkOwner(fence.owner, ownership, epoch);
      epoch = fence.owner.epoch;
      const basis = fence.basis;
      const state = basis.state.body.value;
      const generation = state.authority.kind === 'held' ? state.authority.generation : null;
      if (
        !equalRuntimeScopes(state.scope, request.scope) ||
        state.ledgerId !== retained.pin.ledgerId ||
        parsed.operation.expectedGeneration !== generation ||
        (threshold !== null && (generation === null || generation < threshold))
      )
        // Proof: R2F24 removed only this check; 'recovery audit rejects independent fence_basis' lost its required rejection. Exact restoration passed.
        throw new Error('corrupt recovery fence basis');
      if (previous === undefined) {
        // Proof: R2F25 removed only this check; 'coherent recovery witness rejects initial_basis' lost its required rejection. Exact restoration passed.
        if (basis.kind !== 'initial') throw new Error('corrupt recovery initial basis');
        checkExchange(
          basis.state,
          intent,
          { kind: 'initial_state', recoveryId },
          { kind: 'state' },
          200,
        );
      } else {
        const previousRequest = readRuntimeRequest(previous.canonicalRequest).operation;
        if (
          basis.kind !== 'superseding' ||
          basis.previousOrdinal !== previous.ordinal ||
          !('kind' in previousRequest) ||
          generation === null ||
          (previousRequest.expectedGeneration !== null &&
            generation <= previousRequest.expectedGeneration)
        )
          // Proof: R2F26 removed only this check; 'recovery supersession rejects prior ordinal substitution' lost its required rejection. Exact restoration passed.
          throw new Error('corrupt recovery supersession basis');
        checkExchange(
          basis.state,
          intent,
          {
            kind: 'supersession_state',
            recoveryId,
            previousOrdinal: previous.ordinal,
            previousRequestDigest: previous.requestDigest,
          },
          { kind: 'state' },
          200,
        );
        checkExchange(
          basis.lookup,
          intent,
          {
            kind: 'supersession_lookup',
            recoveryId,
            previousOrdinal: previous.ordinal,
            stateExchange: basis.state.envelope.artifact,
          },
          { kind: 'lookup', commandId: previousRequest.commandId },
          404,
        );
        if (
          observations.some(
            (entry) => entry.fence.ordinal === previous?.ordinal && entry.kind === 'accepted',
          )
        )
          // Proof: R2F27 removed only this check; 'recovery supersession rejects an already accepted prior fence' lost its required rejection. Exact restoration passed.
          throw new Error('corrupt recovery accepted supersession');
      }
      revision = fence.stagedRevision;
      const observed = observations.filter((entry) => entry.fence.ordinal === fence.ordinal);
      // Proof: R2F28 removed only this check; 'coherent recovery witness rejects duplicate_observation' lost its required rejection. Exact restoration passed.
      if (observed.length > 1) throw new Error('corrupt recovery duplicate observation');
      const observation = observed.at(0);
      if (observation !== undefined) {
        if (
          !equalRecords(observation.fence, fence) ||
          observation.observedRevision !== addInteger(revision, 1)
        )
          // Proof: R2F29 removed only this check; 'coherent recovery witness rejects observation_sequence' lost its required rejection. Exact restoration passed.
          throw new Error('corrupt recovery observation sequence');
        const context = {
          kind: 'fence_reply',
          recoveryId,
          ordinal: fence.ordinal,
          requestDigest: fence.requestDigest,
          stagedRevision: fence.stagedRevision,
        };
        const exchangeRequest = observation.reply.envelope.value.request;
        if (exchangeRequest.kind === 'lookup' && observation.kind === 'accepted') {
          checkExchange(
            observation.reply,
            intent,
            context,
            { kind: 'lookup', commandId: wire.commandId },
            200,
          );
        } else
          checkExchange(
            observation.reply,
            intent,
            context,
            { kind: 'authority', canonicalRequest: fence.canonicalRequest },
            observation.kind === 'accepted' ? 200 : 409,
          );
        if (observation.kind === 'accepted') checkReceipt(observation.reply.body.value, wire);
        revision = observation.observedRevision;
      }
      previous = fence;
    }
    if (observations.some((entry) => !fences.some((fence) => equalRecords(fence, entry.fence))))
      // Proof: R2F30 removed only this check; 'coherent recovery witness rejects orphan_observation' lost its required rejection. Exact restoration passed.
      throw new Error('corrupt recovery orphan observation');
    if (closure !== null) {
      const accepted = closure.fence;
      const observation = observations.find((entry) => equalRecords(entry, accepted.observation));
      if (
        closure.recoveryId !== recoveryId ||
        !equalRecords(closure.original, original) ||
        observation?.kind !== 'accepted' ||
        !equalRecords(accepted.fence, observation.fence) ||
        !equalRecords(previous, accepted.fence) ||
        closure.resolvedRevision !== addInteger(revision, 1) ||
        closure.scopeBefore !== intent.begunScopeRevision ||
        closure.scopeAfter !==
          addInteger(closure.scopeBefore, closure.decision.kind === 'accepted' ? 2 : 1) ||
        closure.scopeAfter > retained.revision
      )
        // Proof: R2F31 removed only this check; 'coherent recovery witness rejects closure_revision' lost its required rejection. Exact restoration passed.
        throw new Error('corrupt recovery closure association');
      checkOwner(closure.resolver, ownership, epoch);
      const lookup = closure.decision.lookup;
      checkExchange(
        lookup,
        intent,
        {
          kind: 'original_lookup',
          recoveryId,
          ordinal: accepted.fence.ordinal,
          observationRevision: observation.observedRevision,
          fenceExchange: observation.reply.envelope.artifact,
          fenceReceipt: observation.reply.body.artifact,
        },
        { kind: 'lookup', commandId: original.commandId },
        closure.decision.kind === 'accepted' ? 200 : 404,
      );
      const floor = observation.reply.body.value.acceptance.authority.generation;
      if (
        (threshold !== null && floor <= threshold) ||
        !equalRecords(
          recovery.barriers.filter((barrier) => barrier.recoveryId === recoveryId),
          [
            {
              recoveryId,
              scope: request.scope,
              scopeBefore: closure.scopeBefore,
              scopeAfter: closure.scopeAfter,
              generationFloor: floor,
            },
          ],
        )
      )
        // Proof: R2F32 removed only this check; 'complete recovery catalog rejects barrier' lost its required rejection. Exact restoration passed.
        throw new Error('corrupt recovery barrier');
      const acceptance = catalog.acceptances.find(
        (entry) => entry.commandId === original.commandId,
      );
      if (closure.decision.kind === 'accepted') {
        checkReceipt(closure.decision.lookup.body.value, original);
        if (
          acceptance?.acceptedRevision !== addInteger(closure.scopeBefore, 1) ||
          !equalRecords(acceptance.evidence, lookup.body.artifact) ||
          closure.originalReply === null
        )
          // Proof: R2F33 removed only this check; 'coherent recovery witness rejects original_acceptance' lost its required rejection. Exact restoration passed.
          throw new Error('corrupt recovery original acknowledgement');
        if (target.kind === 'authority') {
          const receipt = closure.decision.lookup.body.value;
          if (
            'command' in closure.decision ||
            closure.originalReply.kind !== 'authority' ||
            !equalRecords(closure.originalReply.acceptance, acceptance) ||
            receipt.acceptance.kind !== 'authority' ||
            floor <= receipt.acceptance.authority.generation
          )
            // Proof: R2F34 removed only this check; 'complete recovery catalog rejects original' lost its required rejection. Exact restoration passed.
            throw new Error('corrupt recovery authority closure');
        } else {
          if (
            !('command' in closure.decision) ||
            closure.originalReply.kind !== 'claim' ||
            !equalRecords(
              closure.decision.command,
              deriveRecoveryClaimCommand({ ...intent, target }, closure.decision.lookup),
            ) ||
            !equalRecords(closure.originalReply.command, closure.decision.command) ||
            !equalRecords(closure.originalReply.ack.acceptance, acceptance)
          )
            // Proof: R2F35 removed only this check; 'coherent recovery claim value cannot replace receipt-derived command projection' lost its required rejection. Exact restoration passed.
            throw new Error('corrupt recovery claim closure');
        }
      } else if (acceptance !== undefined || closure.originalReply !== null)
        // Proof: R2F36 removed only this check; 'recovery nonacceptance cannot publish an original claim acknowledgement' lost its required rejection. Exact restoration passed.
        throw new Error('corrupt recovery absent acknowledgement');
      if (
        target.kind === 'authority'
          ? closure.attemptReply !== null
          : closure.attemptReply?.attemptId !== target.attemptId ||
            closure.attemptReply.identity.runId !== target.runId ||
            !closure.attemptReply.holdsCapacity ||
            closure.attemptReply.state.closureId !== recoveryId ||
            closure.attemptReply.state.cause !==
              (closure.decision.kind === 'accepted' ? 'claim_accepted_fenced' : 'claim_nonaccepted')
      )
        // Proof: R2F03 removed only this check; 'raw runtime audit rejects a hold linked to another closure' lost its required rejection. Exact restoration passed.
        throw new Error('corrupt recovery hold closure');
      revision = closure.resolvedRevision;
    } else if (recovery.barriers.some((barrier) => barrier.recoveryId === recoveryId))
      // Proof: R2F52 disabled only this check; 'open recovery cannot retain a future closure barrier' accepted the corrupt catalog. Exact restoration passed.
      throw new Error('corrupt open recovery barrier');
    // Proof: R2F37 removed only this check; 'coherent recovery witness rejects final_revision' lost its required rejection. Exact restoration passed.
    if (revision !== history.revision) throw new Error('corrupt recovery final revision');
  }
  if (recovery.barriers.some((barrier) => !identities.has(barrier.recoveryId)))
    // Proof: R2F38 removed only this check; 'coherent recovery witness rejects orphan_barrier' lost its required rejection. Exact restoration passed.
    throw new Error('corrupt recovery orphan barrier');
}
/** Current-publication audit is distinct from historical association validation. */
export function auditRecoveryCatalog(catalog: RuntimeCatalog, ownership: OwnershipStatus): void {
  auditRecoveryAssociations(catalog, ownership);
  const expected = catalog.recovery.histories
    .filter((history) => history.closure === null)
    .map((history) => ({
      scope: readRuntimeRequest(history.intent.target.original.canonicalRequest).scope,
      recoveryId: history.intent.recoveryId,
    }));
  const sorted = (
    entries: readonly { readonly scope: RuntimeScope; readonly recoveryId: string }[],
  ) =>
    [...entries].sort((left, right) =>
      runtimeScopeKey(left.scope).localeCompare(runtimeScopeKey(right.scope)),
    );
  if (
    !equalRecords(sorted(expected), sorted(catalog.recovery.active)) ||
    new Set(expected.map((entry) => runtimeScopeKey(entry.scope))).size !== expected.length
  )
    // Proof: R2F02 removed only this check; 'complete recovery catalog rejects active' lost its required rejection. Exact restoration passed.
    throw new Error('corrupt recovery active index');
  for (const history of catalog.recovery.histories) {
    if (history.closure !== null) continue;
    const scope = readRuntimeRequest(history.intent.target.original.canonicalRequest).scope;
    const retained = catalog.scopes.find((entry) => equalRuntimeScopes(entry.pin.scope, scope));
    // Proof: R2D02 removed this refinement; 'recovery active scope retains its diagnostic after the association lookup dependency changes' received a later TypeError. Diagnostic-only; exact restoration passed.
    if (retained === undefined) throw new Error('corrupt recovery target scope');
    const current = reconstructRuntimePrefix(retained, catalog, ownership, retained.revision);
    if (
      current.pendingCommandId !== history.intent.target.original.commandId ||
      current.revision !== history.intent.begunScopeRevision
    )
      // Proof: R2F40 removed only this check; 'coherent recovery active target cannot already be accepted' lost its required rejection. Exact restoration passed.
      throw new Error('corrupt recovery active target');
  }
}

/** Finds a retained recovery command reservation across journal, wire-fence and future claim-acceptance domains. Ordinary run/session/artifact identities are outside this namespace. */
export function findRecoveryCommand(
  recovery: RecoveryCatalog,
  commandId: string,
): RecoveryHistory | undefined {
  // Proof: T3N1 removed only this lookup; all six public command families plus reserved acceptance-ID execution admitted collisions in both providers. Exact restoration passed.
  return recovery.histories.find(
    (history) =>
      history.intent.recoveryId === commandId ||
      history.fences.some(
        (fence) => readRuntimeRequest(fence.canonicalRequest).operation.commandId === commandId,
      ) ||
      (history.intent.target.kind === 'claim' &&
        history.intent.target.acceptanceCommandId === commandId),
  );
}
