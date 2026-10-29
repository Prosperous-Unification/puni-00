import { canonicalRuntimeRequest, type RuntimeState } from '@wbs/contracts';

import type { RuntimeClient, RuntimeExchange } from '../bridge/runtime-client';
import type { ArtifactStore } from './artifact-store';
import { readExecutionHistory } from './claim-history';
import { decodeScopedAttemptGuard } from './execution-codecs';
import { addInteger } from './record-codecs';
import { decodeRecoveryHistory } from './recovery-codecs';
import { RecoveryDispatchError } from './recovery-dispatch-error';
import {
  deriveRecoveryClaimCommand,
  readRecoveryExchange,
  type RecoveryEvidenceSubject,
} from './recovery-evidence';
import type {
  AcceptedRecoveryFence,
  AuthorityRecoveryGuard,
  ClaimRecoveryGuard,
  RecoveryBasis,
  RecoveryClosure,
  RecoveryContext,
  RecoveryExchange,
  RecoveryExchangeValue,
  RecoveryFence,
  RecoveryFenceReplyInput,
} from './recovery-records';
import type { RunStore, StoreRefusal } from './run-store';
import {
  decodeRuntimeGuard,
  decodeRuntimeIntent,
  digestRuntimeRequest,
  readRuntimeRequest,
} from './runtime-codecs';
import { readRuntimeHistory } from './runtime-history';
import type { RuntimeIntent } from './runtime-records';

export type RecoveryDispatchCall =
  | {
      readonly kind: 'authority';
      readonly guard: AuthorityRecoveryGuard;
      readonly recoveryId: string;
    }
  | { readonly kind: 'claim'; readonly guard: ClaimRecoveryGuard; readonly recoveryId: string };
type RecoveryClientReply =
  | Awaited<ReturnType<RuntimeClient['readState']>>['reply']
  | Awaited<ReturnType<RuntimeClient['lookupReceipt']>>['reply']
  | Awaited<ReturnType<RuntimeClient['acquireAuthority']>>['reply'];
export type RecoveryDispatchObservation =
  | Extract<RecoveryClientReply, { kind: 'refusal' }>
  | Extract<RecoveryClientReply, { kind: 'failure' }>
  | { readonly kind: 'cancelled_before_dispatch' }
  | { readonly kind: 'below_threshold'; readonly state: RecoveryExchangeValue<RuntimeState> };
export type RecoveryDispatchReply =
  | { readonly kind: 'resolved'; readonly closure: RecoveryClosure }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal }
  | {
      readonly kind: 'pending';
      readonly recoveryId: string;
      readonly reason: 'cancelled' | 'transport' | 'receiver_refused' | 'below_threshold';
      readonly observation: RecoveryDispatchObservation;
    };
export type RecoveryRuns = Pick<
  RunStore,
  | 'readRuntimeScope'
  | 'readExecutionHistory'
  | 'readRun'
  | 'readManifest'
  | 'renewOwnership'
  | 'stageRecoveryFence'
  | 'recordRecoveryFence'
  | 'resolveRecovery'
>;

/** Retains only the actual response bytes supplied by RuntimeClient; the private caller owns request and chronological context. */
async function captureRecoveryExchange(
  artifacts: ArtifactStore,
  actual: RuntimeExchange<RecoveryClientReply>,
  envelope: Omit<RecoveryExchange, 'version' | 'status' | 'body'>,
  subject: RecoveryEvidenceSubject,
) {
  const response = actual.response;
  if (
    response === null ||
    actual.reply.kind === 'failure' ||
    response.status !== actual.reply.status
  )
    throw new Error('recovery response capture missing or inconsistent');
  // Proof: T7A12 broke only these bytes; 'captured fence body retains exact actual response bytes' failed at the inherited schema reader (dependency proof).
  const bytes = new Uint8Array(response.bytes);
  const captured = structuredClone(envelope);
  const body = await artifacts.retainArtifact(bytes, 'application/json');
  if (body.kind !== 'retained') throw new Error('recovery body retention refused');
  const retained = await artifacts.retainArtifact(
    new TextEncoder().encode(
      JSON.stringify({ version: 1, ...captured, status: response.status, body: body.reference }),
    ),
    'application/json',
  );
  if (retained.kind !== 'retained') throw new Error('recovery envelope retention refused');
  // Proof: T7A17 bypassed this new delegation; 'helper capture dependency failures ... wrong-digest' lost required independent-byte rejection.
  return await readRecoveryExchange(artifacts, retained.reference, subject);
}

/**
 * Resolves an explicitly begun journal through at most three POSTs, retransmitting only exact retained fences.
 * A pre-discovery Error names recovery/scope and retains its cause without inventing an original intent;
 * after discovery, unexpected failures are {@link RecoveryDispatchError}. Claim verification requires the
 * complete manifest/execution reader. Guards never refresh after IO; only this call's applied acknowledgements advance its recovery revision.
 * Inherited client clone/body failures remain transport observations; helper-owned capture/retention/verification faults throw.
 * Third-POST transport failure exhausts the invocation with its exact cause; cancellation stays controlled.
 * Three durable conflicts can leave the journal permanently unresolved. No result grants physical continuation.
 */
export async function dispatchRecovery(
  runs: RecoveryRuns,
  artifacts: ArtifactStore,
  client: RuntimeClient,
  call: RecoveryDispatchCall,
  signal: AbortSignal,
): Promise<RecoveryDispatchReply> {
  const isCancelled = () => signal.aborted;
  const { expectedRecoveryRevision, ...ordinary } = structuredClone(call.guard);
  const recoveryId = call.recoveryId;
  if (
    recoveryId.trim() === '' ||
    !Number.isSafeInteger(expectedRecoveryRevision) ||
    expectedRecoveryRevision < 0
  )
    throw new Error('invalid recovery dispatch identity or revision');
  const capturedCall: RecoveryDispatchCall =
    call.kind === 'authority'
      ? {
          kind: 'authority',
          recoveryId,
          guard: { ...decodeRuntimeGuard(ordinary), expectedRecoveryRevision },
        }
      : {
          kind: 'claim',
          recoveryId,
          guard: { ...decodeScopedAttemptGuard(ordinary), expectedRecoveryRevision },
        };
  const scope = capturedCall.guard.scope;
  const discovered = await (async () => {
    try {
      const snapshot = structuredClone(await runs.readRuntimeScope(scope));
      if (snapshot.version !== 2 || snapshot.kind !== 'pinned')
        throw new Error('recovery scope is not current and pinned');
      const retained = snapshot.recoveries.find((entry) => entry.intent.recoveryId === recoveryId);
      if (retained === undefined) throw new Error('recovery journal does not exist');
      return {
        snapshot,
        retained: structuredClone(retained),
        original: decodeRuntimeIntent(retained.intent.target.original),
      };
    } catch (cause) {
      // Proof: T7A16 rethrew the raw cause; 'discovery failures retain recovery identity and cause' lost contextual correlation.
      throw new Error(
        'Recovery discovery failed for ' + recoveryId + ' at ' + JSON.stringify(scope),
        { cause },
      );
    }
  })();
  const { snapshot, retained, original } = discovered;
  let fence: RecoveryFence | null = null;
  try {
    const history = decodeRecoveryHistory(retained);
    fence = history.fences.at(-1) ?? null;
    // Verify the captured complete scope, never silently refresh the submitted revisions after IO.
    // Proof: T7A06 bypassed this read; 'closed journal still independently verifies retained scope artifacts' lost rejection.
    await readRuntimeHistory(
      { readRuntimeScope: () => Promise.resolve(snapshot) },
      artifacts,
      scope,
    );
    if (capturedCall.kind !== history.intent.target.kind)
      return { kind: 'refused', reason: 'identity_conflict' };
    if (
      capturedCall.kind === 'claim' &&
      history.intent.target.kind === 'claim' &&
      (capturedCall.guard.runId !== history.intent.target.runId ||
        capturedCall.guard.attemptId !== history.intent.target.attemptId)
    )
      return { kind: 'refused', reason: 'identity_conflict' };
    // Proof: T7A07 bypassed this reader; all three 'claim verifies complete manifest artifacts before POST' cases lost rejection in both providers.
    if (capturedCall.kind === 'claim')
      await readExecutionHistory(
        runs,
        artifacts,
        capturedCall.guard.runId,
        capturedCall.guard.attemptId,
      );
    if (history.closure !== null) return { kind: 'resolved', closure: history.closure };
    const operation = readRuntimeRequest(original.canonicalRequest).operation;
    const ledgerId = operation.expectedLedgerId;
    const threshold =
      'kind' in operation ? operation.expectedGeneration : operation.authority.generation;
    let revision = expectedRecoveryRevision;
    let posts = 0;
    let observation = history.observations.find((entry) => entry.fence.ordinal === fence?.ordinal);
    const createCall = (): RecoveryDispatchCall =>
      capturedCall.kind === 'authority'
        ? { ...capturedCall, guard: { ...capturedCall.guard, expectedRecoveryRevision: revision } }
        : { ...capturedCall, guard: { ...capturedCall.guard, expectedRecoveryRevision: revision } };
    const createCancellationReply = (): RecoveryDispatchReply => ({
      kind: 'pending',
      recoveryId,
      reason: 'cancelled',
      observation: { kind: 'cancelled_before_dispatch' },
    });
    const classifyReply = (reply: RecoveryClientReply): RecoveryDispatchReply | undefined => {
      if (reply.kind === 'refusal')
        return { kind: 'pending', recoveryId, reason: 'receiver_refused', observation: reply };
      if (reply.kind === 'failure') {
        if (reply.failure.code === 'cancelled' || reply.failure.code === 'transport')
          return { kind: 'pending', recoveryId, reason: reply.failure.code, observation: reply };
        // Proof: T7A13 admitted invalid responses as pending; 'original lookup preserves precise failure invalid-response' lost rejection.
        throw new Error('recovery client rejected exchange', { cause: reply.failure });
      }
      return undefined;
    };
    const captureExchange = (
      actual: RuntimeExchange<RecoveryClientReply>,
      context: RecoveryContext,
      request: RecoveryExchange['request'],
      subject: RecoveryEvidenceSubject,
    ) => captureRecoveryExchange(artifacts, actual, { scope, ledgerId, context, request }, subject);
    const lookupReceipt = (commandId: string) =>
      client.lookupReceipt({
        params: { id: scope.projectId, commandId },
        query: { personId: scope.personId, expectedLedgerId: ledgerId },
        signal,
      });
    const readFenceIntent = (candidate: RecoveryFence): RuntimeIntent =>
      decodeRuntimeIntent({
        version: 1,
        commandId: readRuntimeRequest(candidate.canonicalRequest).operation.commandId,
        canonicalRequest: candidate.canonicalRequest,
        requestDigest: candidate.requestDigest,
        localOwner: candidate.owner,
        stagedRevision: candidate.stagedRevision,
      });
    const createFenceContext = (candidate: RecoveryFence): RecoveryContext => ({
      kind: 'fence_reply',
      recoveryId,
      ordinal: candidate.ordinal,
      requestDigest: candidate.requestDigest,
      stagedRevision: candidate.stagedRevision,
    });
    async function recordObservation(input: RecoveryFenceReplyInput) {
      // Proof: T7A02 bypassed this acknowledgement; 'stage acknowledgement precedes POST and observation acknowledgement precedes original lookup' observed actual premature original-lookup.
      const ack = await runs.recordRecoveryFence({ ...createCall(), input });
      if (ack.kind !== 'refused') {
        observation = structuredClone(ack.value);
        if (ack.kind === 'applied') revision = observation.observedRevision;
      }
      return ack;
    }
    function throwExhausted(): never {
      throw new RecoveryDispatchError(
        recoveryId,
        original,
        fence,
        'exhausted',
        new Error('recovery POST or identity budget exhausted'),
      );
    }
    for (;;) {
      if (isCancelled()) return createCancellationReply();
      if (observation?.kind === 'accepted' && fence !== null) {
        // Even resumed observations cross the awaited immutable acknowledgement before constructing dependent context.
        const ack = await recordObservation({ kind: 'accepted', fence, reply: observation.reply });
        if (ack.kind === 'refused') return ack;
        if (ack.value.kind !== 'accepted')
          throw new Error('accepted recovery acknowledgement differs');
        const accepted: AcceptedRecoveryFence = { fence, observation: ack.value };
        const context: RecoveryContext = {
          kind: 'original_lookup',
          recoveryId,
          ordinal: fence.ordinal,
          observationRevision: ack.value.observedRevision,
          fenceExchange: ack.value.reply.envelope.artifact,
          fenceReceipt: ack.value.reply.body.artifact,
        };
        if (isCancelled()) return createCancellationReply();
        const actual = await lookupReceipt(original.commandId);
        const subject: RecoveryEvidenceSubject =
          actual.reply.kind === 'refusal' && actual.reply.body.error === 'runtime_receipt_not_found'
            ? { kind: 'absent' }
            : { kind: history.intent.target.kind, intent: original };
        if (subject.kind !== 'absent') {
          const refusal = classifyReply(actual.reply);
          if (refusal !== undefined) return refusal;
        }
        const verified = await captureExchange(
          actual,
          context,
          { kind: 'lookup', commandId: original.commandId },
          subject,
        );
        // Proof: T7A11 refreshed these guards after IO; 'safe uncertainty evidence during original lookup' wrongly resolved instead of revision_conflict.
        const resolveCall = createCall();
        if (verified.kind === 'absent') {
          const closed = await runs.resolveRecovery({
            ...resolveCall,
            fence: accepted,
            decision: { kind: 'fenced_nonaccepted', lookup: verified.exchange },
          });
          return closed.kind === 'refused' ? closed : { kind: 'resolved', closure: closed.value };
        }
        if (resolveCall.kind === 'authority' && verified.kind === 'authority') {
          const closed = await runs.resolveRecovery({
            ...resolveCall,
            fence: accepted,
            decision: { kind: 'accepted', lookup: verified.exchange },
          });
          return closed.kind === 'refused' ? closed : { kind: 'resolved', closure: closed.value };
        }
        if (
          resolveCall.kind === 'claim' &&
          verified.kind === 'claim' &&
          history.intent.target.kind === 'claim'
        ) {
          const command = deriveRecoveryClaimCommand(
            { ...history.intent, target: history.intent.target },
            verified.exchange,
          );
          const closed = await runs.resolveRecovery({
            ...resolveCall,
            fence: accepted,
            decision: { kind: 'accepted', lookup: verified.exchange, command },
          });
          return closed.kind === 'refused' ? closed : { kind: 'resolved', closure: closed.value };
        }
        throw new Error('original recovery receipt kind differs');
      }
      // Proof: T7A04 removed this budget; 'three canonical identities and three POSTs ... lost=false' observed four actual recovery POST IDs, including the retained third twice.
      if (posts >= 3) throwExhausted();
      if (fence === null || observation?.kind === 'generation_conflict') {
        // Proof: T7A03 issued the dependent lookup here first; the real contention trace failed state-before-lookup order.
        const actual = await client.readState({
          params: { id: scope.projectId },
          query: { personId: scope.personId, expectedLedgerId: ledgerId },
          signal,
        });
        const refusal = classifyReply(actual.reply);
        if (refusal !== undefined) return refusal;
        const state = await captureExchange(
          actual,
          fence === null
            ? { kind: 'initial_state', recoveryId }
            : {
                kind: 'supersession_state',
                recoveryId,
                previousOrdinal: fence.ordinal,
                previousRequestDigest: fence.requestDigest,
              },
          { kind: 'state' },
          { kind: 'state' },
        );
        if (state.kind !== 'state') throw new Error('recovery state kind differs');
        const authority = state.exchange.body.value.authority;
        const generation = authority.kind === 'held' ? authority.generation : null;
        // Proof: T7A05 removed this early check; the weak-fence test lost below_threshold. The inherited store still refused; its separate actual weak control admits delayed original3 after fence2.
        if (threshold !== null && (generation === null || generation < threshold))
          return {
            kind: 'pending',
            recoveryId,
            reason: 'below_threshold',
            observation: { kind: 'below_threshold', state: state.exchange },
          };
        addInteger(generation ?? 0, 1);
        let basis: RecoveryBasis = { kind: 'initial', state: state.exchange };
        if (fence !== null) {
          const prior = fence;
          const intent = readFenceIntent(prior);
          const answer = await lookupReceipt(intent.commandId);
          if (answer.reply.kind === 'success') {
            const receipt = await captureExchange(
              answer,
              createFenceContext(prior),
              { kind: 'lookup', commandId: intent.commandId },
              { kind: 'authority', intent },
            );
            if (receipt.kind !== 'authority') throw new Error('recovery fence lookup kind differs');
            const ack = await recordObservation({
              kind: 'accepted',
              fence: prior,
              reply: receipt.exchange,
            });
            if (ack.kind === 'refused') return ack;
            continue;
          }
          if (!(
            answer.reply.kind === 'refusal' &&
            answer.reply.body.error === 'runtime_receipt_not_found'
          )) {
            const refused = classifyReply(answer.reply);
            if (refused !== undefined) return refused;
            throw new Error('recovery supersession lookup has no outcome');
          }
          const absent = await captureExchange(
            answer,
            {
              kind: 'supersession_lookup',
              recoveryId,
              previousOrdinal: prior.ordinal,
              stateExchange: state.exchange.envelope.artifact,
            },
            { kind: 'lookup', commandId: intent.commandId },
            { kind: 'absent' },
          );
          if (absent.kind !== 'absent') throw new Error('recovery supersession absence differs');
          basis = {
            kind: 'superseding',
            previousOrdinal: prior.ordinal,
            state: state.exchange,
            lookup: absent.exchange,
          };
        }
        // Proof: T7A15 removed this cap; the bounds test received the inherited fourth-identity refusal instead of exhaustion. No fourth identity was admitted.
        if (fence === null || fence.ordinal < 3) {
          const ordinal = fence === null ? 1 : fence.ordinal + 1;
          const canonicalRequest = canonicalRuntimeRequest(scope, {
            schemaVersion: 1,
            kind: 'authority',
            commandId: `${recoveryId}:fence:${String(ordinal)}`,
            expectedLedgerId: ledgerId,
            ownerId: capturedCall.guard.ownership.ownerId,
            expectedGeneration: generation,
          });
          const proposed: RecoveryFence = {
            version: 1,
            recoveryId,
            ordinal,
            canonicalRequest,
            requestDigest: digestRuntimeRequest(canonicalRequest),
            owner: {
              ownerId: capturedCall.guard.ownership.ownerId,
              epoch: capturedCall.guard.ownership.epoch,
            },
            stagedRevision: addInteger(revision, 1),
            basis,
          };
          // Proof: T7A01 bypassed this acknowledgement; the chronology test observed actual fence-post before the held stage acknowledgement.
          const staged = await runs.stageRecoveryFence({
            ...createCall(),
            input: { fence: proposed },
          });
          if (staged.kind === 'refused') return staged;
          fence = structuredClone(staged.value);
          if (staged.kind === 'applied') revision = fence.stagedRevision;
          observation = undefined;
        }
      }
      if (isCancelled()) return createCancellationReply();
      const renewed = await runs.renewOwnership(capturedCall.guard.ownership);
      // Proof: T7A08 ignored this refusal; 'owner takeover refuses before POST' observed a real stale-owner fence POST.
      if (renewed.kind === 'refused') return renewed;
      // Proof: T7A09 removed this live check; 'live cancellation ... renew' lost the precise cancellation observation. The inherited client still blocked HTTP.
      if (isCancelled()) return createCancellationReply();
      const request = readRuntimeRequest(fence.canonicalRequest).operation;
      if (!('kind' in request)) throw new Error('recovery fence request is not authority');
      const { kind: _kind, ...body } = request;
      posts += 1;
      const actual = await client.acquireAuthority({
        params: { id: scope.projectId },
        body: { ...body, personId: scope.personId },
        signal,
      });
      // Proof: T7A10 removed this boundary; 'three canonical identities ... lost=true' returned pending instead of exhausted with the actual transport cause.
      if (
        posts >= 3 &&
        actual.reply.kind === 'failure' &&
        actual.reply.failure.code === 'transport'
      )
        throw new RecoveryDispatchError(
          recoveryId,
          original,
          fence,
          'exhausted',
          actual.reply.failure.cause,
        );
      const conflict =
        actual.reply.kind === 'refusal' &&
        actual.reply.body.error === 'runtime_generation_conflict';
      if (!conflict) {
        const refusal = classifyReply(actual.reply);
        if (refusal !== undefined) return refusal;
      }
      const verified = await captureExchange(
        actual,
        createFenceContext(fence),
        { kind: 'authority', canonicalRequest: fence.canonicalRequest },
        conflict
          ? { kind: 'generation_conflict' }
          : { kind: 'authority', intent: readFenceIntent(fence) },
      );
      if (verified.kind !== 'authority' && verified.kind !== 'generation_conflict')
        throw new Error('recovery fence reply kind differs');
      const ack = await recordObservation(
        verified.kind === 'authority'
          ? { kind: 'accepted', fence, reply: verified.exchange }
          : { kind: 'generation_conflict', fence, reply: verified.exchange },
      );
      if (ack.kind === 'refused') return ack;
    }
  } catch (cause) {
    if (cause instanceof RecoveryDispatchError) throw cause;
    // Proof: T7A14 rethrew raw failure; 'unexpected error correlation is detached and recursively frozen' lost its correlated error.
    throw new RecoveryDispatchError(recoveryId, original, fence, 'unexpected', cause);
  }
}
