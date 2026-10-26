import type { RuntimeClient } from '../bridge/runtime-client';
import type { ArtifactStore } from './artifact-store';
import { equalRecords } from './record-codecs';
import type { RunStore, StoreRefusal } from './run-store';
import { decodeRuntimeGuard, decodeRuntimeIntent, readRuntimeRequest } from './runtime-codecs';
import { RuntimeDispatchError } from './runtime-dispatch-error';
import { acceptRuntimeReceipt, readRuntimeHistory } from './runtime-history';
import type { RuntimeAcceptance, RuntimeGuard, RuntimeIntent } from './runtime-records';

type AuthorityExchange = Awaited<ReturnType<RuntimeClient['acquireAuthority']>>;
type LookupExchange = Awaited<ReturnType<RuntimeClient['lookupReceipt']>>;
type ReceiverReply = AuthorityExchange['reply'] | LookupExchange['reply'];
type ReceiverRefusal = Extract<ReceiverReply, { kind: 'refusal' }>;
type ReceiverFailure = Extract<ReceiverReply, { kind: 'failure' }>['failure'];

/** Pending observations never prove receiver nonacceptance or permit another POST. */
export type AuthorityDispatchObservation =
  | { readonly kind: 'cancelled_before_dispatch' }
  | { readonly kind: 'local_refused'; readonly reason: StoreRefusal }
  | { readonly kind: 'receiver_refused'; readonly reply: ReceiverRefusal }
  | {
      readonly kind: 'unconfirmed';
      readonly failure: Extract<ReceiverFailure, { code: 'cancelled' | 'transport' }>;
    };

/** Accepted acknowledges verified history; it grants no current execution permission. */
export type AuthorityDispatchReply =
  | {
      readonly kind: 'accepted';
      readonly intent: RuntimeIntent;
      readonly acceptance: RuntimeAcceptance;
    }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal }
  | {
      readonly kind: 'pending';
      readonly intent: RuntimeIntent;
      readonly observation: AuthorityDispatchObservation;
    };

type AuthorityRuns = Pick<
  RunStore,
  'stageRuntimeRequest' | 'readRuntimeScope' | 'recordRuntimeAcceptance' | 'renewOwnership'
>;

/**
 * Commits immutable authority intent before electing one POST. Duplicates reconcile by
 * verified history or exact lookup only. Unexpected post-stage faults retain correlation;
 * receipt absence and failed persistence leave the original pending slot untouched.
 */
export async function dispatchAuthority(
  runs: AuthorityRuns,
  artifacts: ArtifactStore,
  client: RuntimeClient,
  guard: RuntimeGuard,
  canonicalRequest: string,
  signal: AbortSignal,
): Promise<AuthorityDispatchReply> {
  const isCancelled = () => signal.aborted;
  // Proof: A07 aliased caller guard through staging; 'guard snapshot before stage await' refused instead of accepting. Inherited store guards remained; restoration passed.
  const snapshotGuard = decodeRuntimeGuard(guard);
  readRuntimeRequest(canonicalRequest);
  // Proof: A02 sent before stage resolved; 'stage await prevents precommit HTTP' observed one premature POST. Exact restoration passed.
  const staged = await runs.stageRuntimeRequest(snapshotGuard, canonicalRequest);
  // Proof: A25 dropped this return; 'changed canonical same ID is refused' threw instead of returning the store refusal. Diagnostic/typed-outcome proof; restoration passed.
  if (staged.kind === 'refused') return staged;
  // Proof: A08 aliased retained intent through renewal; 'retained intent snapshots before renewal await' failed correspondence. Inherited verification remained; restoration passed.
  const intent = decodeRuntimeIntent(staged.value);
  try {
    const { scope, operation } = readRuntimeRequest(intent.canonicalRequest);
    // Proof: A21 dropped this diagnostic; 'retained non-authority correspondence fault' saw the shared client's later rejection instead. Diagnostic only; exact restoration passed.
    if (!('kind' in operation)) throw new Error('retained runtime intent is not authority');

    async function readWinner(): Promise<RuntimeAcceptance | undefined> {
      // Proof: A29 bypassed verified history; 'duplicate accepted evidence is verified' acknowledged unreadable historical evidence. Exact restoration passed.
      const history = await readRuntimeHistory(runs, artifacts, scope);
      // Proof: A22 dropped this diagnostic; 'duplicate missing pin' saw a later missing-array fault. Diagnostic only; exact restoration passed.
      if (history.kind !== 'pinned') throw new Error('retained runtime scope is not pinned');
      // Proof: A11 omitted complete intent matching; 'winner reread requires the complete original intent' accepted another local provenance. Exact restoration passed.
      if (!history.intents.some((candidate) => equalRecords(candidate, intent))) return undefined;
      return history.acceptances.find(
        (acceptance) =>
          acceptance.commandId === intent.commandId &&
          acceptance.requestDigest === intent.requestDigest,
      );
    }
    let exchange: AuthorityExchange | LookupExchange;
    // Proof: A01 routed duplicate staging to POST; 'concurrent exact staging' failed its lookup-only observation. Exact restoration passed.
    if (staged.kind === 'duplicate') {
      const winner = await readWinner();
      // Proof: A26 omitted historical short-circuiting; 'duplicate accepted returns original evidence' hit forbidden artifact replacement after HTTP. Exact restoration passed.
      if (winner !== undefined) return { kind: 'accepted', intent, acceptance: winner };
      exchange = await client.lookupReceipt({
        params: { id: scope.projectId, commandId: intent.commandId },
        query: { personId: scope.personId, expectedLedgerId: operation.expectedLedgerId },
        signal,
      });
    } else {
      // Proof: A04 omitted pre-renewal cancellation; 'cancelled before renewal' observed an unwanted renewal. Exact restoration passed.
      if (isCancelled())
        return { kind: 'pending', intent, observation: { kind: 'cancelled_before_dispatch' } };
      // Proof: A03 bypassed renewal's await; 'renew await prevents send' observed one premature POST. Exact restoration passed.
      const renewed = await runs.renewOwnership(snapshotGuard.ownership);
      // Proof: A06 omitted renewal refusal; 'takeover during renewal' observed one stale POST. Inherited save fencing remained; restoration passed.
      if (renewed.kind === 'refused')
        return {
          kind: 'pending',
          intent,
          observation: { kind: 'local_refused', reason: renewed.reason },
        };
      // Proof: A05 omitted the live post-await check; 'cancelled during renewal' returned unconfirmed instead. The shared client still blocked HTTP; diagnostic/observation proof. Restoration passed.
      if (isCancelled())
        return { kind: 'pending', intent, observation: { kind: 'cancelled_before_dispatch' } };
      const { kind: _kind, ...body } = operation;
      exchange = await client.acquireAuthority({
        params: { id: scope.projectId },
        body: { ...body, personId: scope.personId },
        signal,
      });
    }
    const { reply, response } = exchange;
    // Proof: A27 dropped refusal classification; 'validated receiver refusal' threw during later receipt verification. Typed-outcome proof; restoration passed.
    if (reply.kind === 'refusal')
      return { kind: 'pending', intent, observation: { kind: 'receiver_refused', reply } };
    if (reply.kind === 'failure') {
      // Proof: A23 admitted invalid exchanges as pending; 'invalid reply status' failed. A28 excluded transport uncertainty; 'lost response' threw. Exact restorations passed.
      if (reply.failure.code === 'cancelled' || reply.failure.code === 'transport')
        return {
          kind: 'pending',
          intent,
          observation: { kind: 'unconfirmed', failure: reply.failure },
        };
      throw new Error('runtime client rejected exchange', { cause: reply.failure });
    }
    // Proof: A18 ignored capture status and 'success with status actual capture' accepted. A19 omitted absence diagnostics and saw a later null fault; diagnostic only for absence. Restorations passed.
    if (response?.status !== reply.status) throw new Error('runtime receipt capture differs');
    // Proof: A09r aliased captured bytes through retention; 'capture bytes detach' failed JSON parsing after injected mutation. Inherited integrity checks remained; restoration passed.
    const bytes = new Uint8Array(response.bytes);
    const retained = await artifacts.retainArtifact(bytes, 'application/json');
    // Proof: A20 dropped metadata diagnostics; 'artifact metadata fault' saw the later reference-codec rejection. Diagnostic only; exact restoration passed.
    if (retained.kind === 'refused') throw new Error('runtime receipt artifact metadata differs');
    // Proof: A12 bypassed verified receipt consumption and 'wrong correspondence' accepted. A13 submitted the old revision; 'unrelated revision conflict' failed. A24 omitted the await; 'artifact and local acceptance barriers' acknowledged before commit. Restorations passed.
    const accepted = await acceptRuntimeReceipt(
      runs,
      artifacts,
      { ...snapshotGuard, expectedRevision: intent.stagedRevision },
      intent,
      retained.reference,
    );
    if (accepted.kind !== 'refused')
      return { kind: 'accepted', intent, acceptance: accepted.value };
    // Proof: A10 omitted winner reconciliation; 'compatible representations racing acceptance' returned pending instead of the first artifact. Exact restoration passed.
    if (accepted.reason === 'revision_conflict' || accepted.reason === 'identity_conflict') {
      const winner = await readWinner();
      if (winner !== undefined) return { kind: 'accepted', intent, acceptance: winner };
    }
    return {
      kind: 'pending',
      intent,
      observation: { kind: 'local_refused', reason: accepted.reason },
    };
  } catch (cause) {
    // Proof: A14 rethrew the raw cause; 'unexpected persistence exception' lost fixed-message intent correlation. Exact restoration passed.
    throw new RuntimeDispatchError(intent, cause);
  }
}
