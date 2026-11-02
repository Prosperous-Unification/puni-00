import { parseOrThrow, type } from '@shared/validation';

import type { RuntimeClient } from '../bridge/runtime-client';
import type { ArtifactStore } from './artifact-store';
import { readExecutionHistory } from './claim-history';
import { decodeScopedAttemptGuard } from './execution-codecs';
import { equalRecords } from './record-codecs';
import type { ArtifactRef, ExecutionCommandId } from './records';
import { retainRuntimeReceipt } from './retain-runtime-receipt';
import type { RunStore, ScopedAttemptGuard, StoreRefusal } from './run-store';
import { decodeRuntimeIntent, readRuntimeRequest } from './runtime-codecs';
import { RuntimeDispatchError } from './runtime-dispatch-error';
import type { RuntimeIntent } from './runtime-records';
import { addInteger, ArtifactRefCodec, ExecutionCommandIdCodec } from './value-codecs';
import { WriteCompletionCodec } from './write-codecs';
import { acceptWriteReceipt, stageWriteRequest } from './write-history';
import type { WriteAcceptAck, WriteCompletion } from './write-records';

type WriteExchange = Awaited<ReturnType<RuntimeClient['applyCommands']>>;
type LookupExchange = Awaited<ReturnType<RuntimeClient['lookupReceipt']>>;
type ReceiverReply = WriteExchange['reply'] | LookupExchange['reply'];
type ReceiverRefusal = Extract<ReceiverReply, { kind: 'refusal' }>;
type ReceiverFailure = Extract<ReceiverReply, { kind: 'failure' }>['failure'];

/** Pending observations preserve uncertainty and never authorize another POST or release capacity. */
export type WriteDispatchObservation =
  | { readonly kind: 'cancelled_before_dispatch' }
  | { readonly kind: 'local_refused'; readonly reason: StoreRefusal }
  | { readonly kind: 'receiver_refused'; readonly reply: ReceiverRefusal }
  | {
      readonly kind: 'unconfirmed';
      readonly failure: Extract<ReceiverFailure, { code: 'cancelled' | 'transport' }>;
    };

/** The complete original paired acknowledgement records historical acceptance, not current execution permission. */
export type WriteDispatchReply =
  | { readonly kind: 'accepted'; readonly intent: RuntimeIntent; readonly ack: WriteAcceptAck }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal }
  | {
      readonly kind: 'pending';
      readonly intent: RuntimeIntent;
      readonly observation: WriteDispatchObservation;
    };

type WriteRuns = Pick<
  RunStore,
  | 'readExecutionHistory'
  | 'readRuntimeScope'
  | 'readManifest'
  | 'stageWrite'
  | 'recordWriteAcceptance'
  | 'renewOwnership'
>;
const inputCodec = type({
  commandId: ExecutionCommandIdCodec,
  acceptanceCommandId: ExecutionCommandIdCodec,
  canonicalRequest: 'string>=1',
  completion: WriteCompletionCodec,
  stateEvidence: ArtifactRefCodec,
}).onDeepUndeclaredKey('reject');

/**
 * Stages fixed prepared write bytes before electing one conditional POST. Duplicates
 * return a verified original paired acknowledgement or perform exact lookup only.
 * Fresh acceptance advances the submitted run/scope cut once; lookup uses the submitted
 * cut unchanged. Unexpected post-stage faults retain the complete original intent.
 */
export async function deliverOutcome(
  runs: WriteRuns,
  artifacts: ArtifactStore,
  client: RuntimeClient,
  guard: ScopedAttemptGuard,
  input: {
    readonly commandId: ExecutionCommandId;
    readonly acceptanceCommandId: ExecutionCommandId;
    readonly canonicalRequest: string;
    readonly completion: WriteCompletion;
    readonly stateEvidence: ArtifactRef;
  },
  signal: AbortSignal,
): Promise<WriteDispatchReply> {
  const isCancelled = () => signal.aborted;
  // Proof: S08 borrowing the submitted guard let nested mutation change delivery; the real provider snapshot test failed. Exact restoration passed.
  const snapshotGuard = decodeScopedAttemptGuard(guard);
  // Proof: S09 borrowing input lost nested ownership and allowed invalid acceptance identity past pre-IO validation. Exact restoration passed.
  const snapshot = structuredClone(parseOrThrow(inputCodec, input));
  // Proof: S11 removing this early identity check lost its pre-stage diagnostic; inherited strict store validation still rejects the collision. Exact restoration passed.
  if (snapshot.commandId === snapshot.acceptanceCommandId)
    throw new Error('write stage and acceptance command identities must differ');
  const { acceptanceCommandId, ...stageInput } = snapshot;
  // Proof: S01 posting before this awaited stage changed the real process-cut outcome from fenced nonacceptance to accepted effects; barrier assertions also failed. Exact restoration passed.
  const staged = await stageWriteRequest(runs, artifacts, snapshotGuard, stageInput);
  if (staged.kind === 'refused') return staged;
  const intent = decodeRuntimeIntent(staged.value.intent);
  const attemptRevision = staged.value.attempt.revision;
  try {
    // Proof: S05 advancing duplicate submitted cuts changed the lost-response lookup result. Exact restoration passed.
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
    const operation = request.operation;
    if ('kind' in operation || operation.action.kind !== 'write')
      throw new Error('staged write request kind differs');
    const scope = request.scope;
    async function readWinner(): Promise<WriteAcceptAck | undefined> {
      // Proof: S10 reading raw history bypassed unreadable original acceptance evidence; both actual providers lost the verified-winner rejection. Exact restoration passed.
      const history = await readExecutionHistory(
        runs,
        artifacts,
        snapshotGuard.runId,
        snapshotGuard.attemptId,
      );
      for (const entry of history.version === 3 ? history.writes : [])
        if (
          entry.command.kind === 'accept_write' &&
          entry.reply.kind === 'write_accepted' &&
          // Proof: S04 omitting only the local acceptance identity borrowed another winner in both providers. Exact restoration passed.
          entry.command.commandId === acceptanceCommandId &&
          equalRecords(entry.command.intent, intent)
        )
          return entry.reply;
      return undefined;
    }
    let exchange: WriteExchange | LookupExchange;
    // Proof: S03 electing duplicate POSTs failed bounded concurrency and lost-response traces; both calls drained and SQLite fixtures closed. The earlier timed-out observation is separate. Exact restoration passed.
    if (staged.kind === 'duplicate') {
      const winner = await readWinner();
      if (winner !== undefined) return { kind: 'accepted', intent, ack: winner };
      exchange = await client.lookupReceipt({
        params: { id: scope.projectId, commandId: intent.commandId },
        query: { personId: scope.personId, expectedLedgerId: operation.expectedLedgerId },
        signal,
      });
    } else {
      if (isCancelled())
        return { kind: 'pending', intent, observation: { kind: 'cancelled_before_dispatch' } };
      // Proof: S02 omitting await let POST occur before renewal release in both provider traces. Exact restoration passed.
      const renewed = await runs.renewOwnership(snapshotGuard.ownership);
      // Proof: S14 ignoring renewal refusal sent after local takeover. Exact restoration passed.
      if (renewed.kind === 'refused')
        return {
          kind: 'pending',
          intent,
          observation: { kind: 'local_refused', reason: renewed.reason },
        };
      if (isCancelled())
        return { kind: 'pending', intent, observation: { kind: 'cancelled_before_dispatch' } };
      exchange = await client.applyCommands({
        params: { id: scope.projectId },
        body: {
          ...operation,
          action: {
            ...operation.action,
            commands: operation.action.commands.map((command) =>
              command.kind === 'patchWorkItem'
                ? {
                    ...command,
                    patch: {
                      externalRefs: command.patch.externalRefs.map((reference) => ({
                        ...reference,
                      })),
                    },
                  }
                : command.kind === 'releaseWorkItem'
                  ? { ...command, steps: [...command.steps] }
                  : { ...command },
            ),
          },
          personId: scope.personId,
        },
        signal,
      });
    }
    const { reply, response } = exchange;
    if (reply.kind === 'refusal')
      return { kind: 'pending', intent, observation: { kind: 'receiver_refused', reply } };
    if (reply.kind === 'failure') {
      if (reply.failure.code === 'cancelled' || reply.failure.code === 'transport')
        return {
          kind: 'pending',
          intent,
          observation: { kind: 'unconfirmed', failure: reply.failure },
        };
      throw new Error('runtime client rejected exchange', { cause: reply.failure });
    }
    // Proof: S06 retaining parsed-reply reserialization lost the exact original raw bytes in both providers. Exact restoration passed.
    const evidence = await retainRuntimeReceipt(artifacts, response, reply.status);
    // Proof: S07 bypassing the verified wrapper admitted mismatched raw receipts, including an actual receiver response rewrite. Exact restoration passed.
    const accepted = await acceptWriteReceipt(runs, artifacts, acceptanceGuard, {
      commandId: acceptanceCommandId,
      intent,
      stageCommandId: snapshot.commandId,
      evidence,
    });
    if (accepted.kind !== 'refused') return { kind: 'accepted', intent, ack: accepted.value };
    // Proof: S12 omitting reconciliation lost the original winning bytes and complete acknowledgement under competing exact acceptance. Exact restoration passed.
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
    // Proof: S13 throwing the raw fault lost original-intent/cause correlation. This is an error-contract proof, not admission safety. Exact restoration passed.
    throw new RuntimeDispatchError(intent, cause);
  }
}
