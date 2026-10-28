import { parseOrThrow, type } from '@shared/validation';

import type { RuntimeClient } from '../bridge/runtime-client';
import type { ArtifactStore } from './artifact-store';
import { acceptClaimReceipt, readExecutionHistory, stageClaimRequest } from './claim-history';
import { decodeScopedAttemptGuard } from './execution-codecs';
import type { ClaimAcceptAck } from './execution-records';
import { equalRecords } from './record-codecs';
import type { ArtifactRef, ExecutionCommandId } from './records';
import { retainRuntimeReceipt } from './retain-runtime-receipt';
import type { RunStore, ScopedAttemptGuard, StoreRefusal } from './run-store';
import { decodeRuntimeIntent, readRuntimeRequest } from './runtime-codecs';
import { RuntimeDispatchError } from './runtime-dispatch-error';
import type { RuntimeIntent } from './runtime-records';
import { addInteger, ArtifactRefCodec, ExecutionCommandIdCodec } from './value-codecs';

type ConditionalRequest = Extract<
  ReturnType<typeof readRuntimeRequest>['operation'],
  { action: unknown }
>;
type ClaimRequest = ConditionalRequest & {
  readonly action: Extract<ConditionalRequest['action'], { kind: 'claim' }>;
};

type ClaimExchange = Awaited<ReturnType<RuntimeClient['applyCommands']>>;
type LookupExchange = Awaited<ReturnType<RuntimeClient['lookupReceipt']>>;
type ReceiverReply = ClaimExchange['reply'] | LookupExchange['reply'];
type ReceiverRefusal = Extract<ReceiverReply, { kind: 'refusal' }>;
type ReceiverFailure = Extract<ReceiverReply, { kind: 'failure' }>['failure'];

/** Pending observations preserve uncertainty and never authorize another POST or release capacity. */
export type ClaimDispatchObservation =
  | { readonly kind: 'cancelled_before_dispatch' }
  | { readonly kind: 'local_refused'; readonly reason: StoreRefusal }
  | { readonly kind: 'receiver_refused'; readonly reply: ReceiverRefusal }
  | {
      readonly kind: 'unconfirmed';
      readonly failure: Extract<ReceiverFailure, { code: 'cancelled' | 'transport' }>;
    };

/** The complete original paired acknowledgement records historical acceptance, not current execution permission. */
export type ClaimDispatchReply =
  | { readonly kind: 'accepted'; readonly intent: RuntimeIntent; readonly ack: ClaimAcceptAck }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal }
  | {
      readonly kind: 'pending';
      readonly intent: RuntimeIntent;
      readonly observation: ClaimDispatchObservation;
    };

type ClaimRuns = Pick<
  RunStore,
  | 'readExecutionHistory'
  | 'readManifest'
  | 'stageClaim'
  | 'recordClaimAcceptance'
  | 'renewOwnership'
>;
const inputCodec = type({
  commandId: ExecutionCommandIdCodec,
  acceptanceCommandId: ExecutionCommandIdCodec,
  canonicalRequest: 'string>=1',
  stateEvidence: ArtifactRefCodec,
}).onDeepUndeclaredKey('reject');

/**
 * Stages fixed prepared claim bytes before electing one conditional POST. Duplicates
 * return a verified original paired acknowledgement or perform exact lookup only.
 * Fresh acceptance advances the submitted run/scope cut once; lookup uses the submitted
 * cut unchanged. Unexpected post-stage faults retain the complete original intent.
 */
export async function claimActivity(
  runs: ClaimRuns,
  artifacts: ArtifactStore,
  client: RuntimeClient,
  guard: ScopedAttemptGuard,
  input: {
    readonly commandId: ExecutionCommandId;
    readonly acceptanceCommandId: ExecutionCommandId;
    readonly canonicalRequest: string;
    readonly stateEvidence: ArtifactRef;
  },
  signal: AbortSignal,
): Promise<ClaimDispatchReply> {
  const isCancelled = () => signal.aborted;
  // Proof: D02 aliased the submitted guard through staging; 'snapshots caller inputs' failed under caller mutation. Inherited guards remained; exact restoration passed.
  const snapshotGuard = decodeScopedAttemptGuard(guard);
  // Proof: D36 bypassed input-codec consumption; 'rejects invalid acceptance before history reads or HTTP' observed one read before inherited rejection. D03 reread the caller acceptance ID and 'snapshots caller inputs' failed. Exact restorations passed.
  const snapshot = structuredClone(parseOrThrow(inputCodec, input));
  // Proof: D01 omitted distinct local IDs; 'rejects same local IDs' reached the inherited conflict instead of rejecting before reads/HTTP. Exact restoration passed.
  if (snapshot.commandId === snapshot.acceptanceCommandId)
    throw new Error('claim stage and acceptance command identities must differ');
  const { acceptanceCommandId, ...stageInput } = snapshot;
  // Proof: D05 injected a conditional POST before stage completion; 'fresh stage commits locator' observed premature HTTP. Existing stage/provider checks stayed installed; exact restoration passed.
  const staged = await stageClaimRequest(runs, artifacts, snapshotGuard, stageInput);
  // Proof: D06 omitted the pre-stage refusal return; 'pre-stage revision refusal' received a downstream value fault. Typed-outcome proof; exact restoration passed.
  if (staged.kind === 'refused') return staged;
  // Proof: D04 aliased the returned intent through renewal; 'snapshots caller inputs' failed after retained provenance mutation. Inherited correspondence checks remained; exact restoration passed.
  const intent = decodeRuntimeIntent(staged.value.intent);
  const attemptRevision = staged.value.attempt.revision;
  try {
    // Proof: D07/D08/D09 independently consumed old run/attempt/scope cuts; 'fresh stage commits locator' returned pending. D10 advanced a duplicate cut; 'lost response uses old duplicate guard' accepted instead of refusing. Exact restorations passed.
    const acceptanceGuard =
      staged.kind === 'applied'
        ? {
            ...snapshotGuard,
            expectedRevision: addInteger(snapshotGuard.expectedRevision, 1),
            expectedAttemptRevision: attemptRevision,
            expectedScopeRevision: addInteger(snapshotGuard.expectedScopeRevision, 1),
          }
        : snapshotGuard;
    const request = readRuntimeRequest(intent.canonicalRequest);
    // stageClaimRequest verifies the claim operation before the provider stages this immutable intent.
    const operation = request.operation as ClaimRequest;
    const scope = request.scope;
    async function readWinner(): Promise<ClaimAcceptAck | undefined> {
      // Proof: D13 consumed raw provider history; 'duplicate historical evidence is verified' acknowledged unreadable evidence. Exact restoration passed.
      const history = await readExecutionHistory(
        runs,
        artifacts,
        snapshotGuard.runId,
        snapshotGuard.attemptId,
      );
      // Proof: D14 omitted acceptance-ID matching and 'different acceptance ID' borrowed a winner. D15 omitted complete-intent matching and 'winner requires the complete original intent' accepted changed provenance. Exact restorations passed.
      for (const entry of history.executions)
        if (
          entry.command.kind === 'accept_claim' &&
          entry.reply.kind === 'claim_accepted' &&
          entry.command.commandId === acceptanceCommandId &&
          equalRecords(entry.command.intent, intent)
        )
          // Proof: D27 substituted today's attempt for the paired reply; 'duplicate accepted returns original complete' observed changed history. Exact restoration passed.
          return entry.reply;
      return undefined;
    }
    let exchange: ClaimExchange | LookupExchange;
    // Proof: D11 elected POST for duplicate staging; 'lost response uses old duplicate guard' received another unconfirmed send. Exact restoration passed.
    if (staged.kind === 'duplicate') {
      const winner = await readWinner();
      // Proof: D12 omitted this historical return; 'duplicate accepted returns original complete' hit forbidden artifact replacement after HTTP. Exact restoration passed.
      if (winner !== undefined) return { kind: 'accepted', intent, ack: winner };
      // Proof: D38 replaced the retained ledger at lookup; 'concurrent exact calls elect one POST' observed a different query. Exact restoration passed.
      exchange = await client.lookupReceipt({
        params: { id: scope.projectId, commandId: intent.commandId },
        query: { personId: scope.personId, expectedLedgerId: operation.expectedLedgerId },
        signal,
      });
    } else {
      // Proof: D17 omitted pre-renewal cancellation; 'cancelled before renewal' observed an extra renewal. Exact restoration passed.
      if (isCancelled())
        return { kind: 'pending', intent, observation: { kind: 'cancelled_before_dispatch' } };
      // Proof: D16 bypassed renewal's await; 'fresh stage commits locator' observed a POST before renewal committed. Exact restoration passed.
      const renewed = await runs.renewOwnership(snapshotGuard.ownership);
      // Proof: D19 omitted renewal refusal; 'takeover during renewal refuses' observed a stale POST. Inherited persistence fencing remained; exact restoration passed.
      if (renewed.kind === 'refused')
        return {
          kind: 'pending',
          intent,
          observation: { kind: 'local_refused', reason: renewed.reason },
        };
      // Proof: D18 omitted the live post-renewal check; 'cancelled during renewal' returned unconfirmed. The shared client still blocked HTTP; observation-only proof. Exact restoration passed.
      if (isCancelled())
        return { kind: 'pending', intent, observation: { kind: 'cancelled_before_dispatch' } };
      // Proof: D37 replaced the retained conditional basis; 'fresh stage commits locator' observed a different actual POST body. Exact restoration passed.
      exchange = await client.applyCommands({
        params: { id: scope.projectId },
        body: { ...operation, personId: scope.personId },
        signal,
      });
    }
    const { reply, response } = exchange;
    // Proof: D20 omitted receiver-refusal classification; 'typed receiver refusal remains pending' threw during later receipt verification. Typed-outcome proof; exact restoration passed.
    if (reply.kind === 'refusal')
      return { kind: 'pending', intent, observation: { kind: 'receiver_refused', reply } };
    if (reply.kind === 'failure') {
      // Proof: D21 admitted invalid status as pending and 'correlates invalid status' failed. D22/D40 independently excluded transport/cancellation and the lost-response/cancellation-after-send tests threw. Exact restorations passed.
      if (reply.failure.code === 'cancelled' || reply.failure.code === 'transport')
        return {
          kind: 'pending',
          intent,
          observation: { kind: 'unconfirmed', failure: reply.failure },
        };
      throw new Error('runtime client rejected exchange', { cause: reply.failure });
    }
    // Proof: D23 omitted shared retention's await; 'fresh stage commits locator' failed when inherited receipt decoding received a promise. Exact restoration passed.
    const evidence = await retainRuntimeReceipt(artifacts, response, reply.status);
    // Proof: D24 bypassed verified receipt consumption at this call; 'correlates wrong command' accepted mismatched actual bytes. D25 omitted await and lost the paired ack; D35's held persistence barrier observed settled=true before commit. Inherited guards remained; exact restorations passed.
    const accepted = await acceptClaimReceipt(runs, artifacts, acceptanceGuard, {
      commandId: acceptanceCommandId,
      intent,
      evidence,
    });
    if (accepted.kind !== 'refused') return { kind: 'accepted', intent, ack: accepted.value };
    // Proof: D26 omitted conflict reconciliation; 'same-ID byte-different winner' returned pending instead of the original paired acknowledgement/evidence. Exact restoration passed.
    if (accepted.reason === 'revision_conflict' || accepted.reason === 'identity_conflict') {
      const winner = await readWinner();
      if (winner !== undefined) return { kind: 'accepted', intent, ack: winner };
    }
    return {
      kind: 'pending',
      intent,
      observation: { kind: 'local_refused', reason: accepted.reason },
    };
  } catch (cause) {
    // Proof: D28 rethrew the raw persistence cause; 'correlates persistence' lost fixed-message intent correlation. Exact restoration passed.
    throw new RuntimeDispatchError(intent, cause);
  }
}
