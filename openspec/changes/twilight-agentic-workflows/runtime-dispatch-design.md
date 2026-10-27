# Durable receiver and turn dispatch

This packet implements [runtime dispatch intent](runtime-dispatch-intent.md), after
[preparation dispatch](preparation-dispatch-design.md). Existing semantic persistence and
shared receiver/executor contracts remain authoritative. No stored format changes.

## 1. Correlated receiver client

`bridge/runtime-client.ts` owns an injected `ClientTransport` from `@wbs/contracts`, with
no URL, credential lookup, token lifecycle, ordinary-command fallback or provider factory.
The caller supplies the configured and authenticated transport. The transport must return
an actual `Response`: a parsed `TransportReply` cannot supply original response bytes.
Missing callable configuration or a non-Response return is a `ClientConfigurationError`.

Export `createRuntimeClient(transport: ClientTransport): RuntimeClient`, plus:

```ts
interface RuntimeExchange<Reply> {
  readonly reply: Reply;
  readonly response: null | {
    readonly status: number;
    readonly bytes: Uint8Array;
  };
}
```

`RuntimeClient` has exactly `readState`, `acquireAuthority`, `applyCommands` and
`lookupReceipt`. Each input is the exact `ClientInput<typeof owningEndpoint>` and each
reply is `RuntimeExchange<ClientReply<typeof owningEndpoint>>`, using the four existing
runtime endpoint shapes. `applyCommands` remains the conditional runtime endpoint, not an
ordinary batch route; the host claim helper checks its claim operation before sending.

Each method call creates its own capture closure and `clientFromShapes` instance over the
existing `runtimeCommandShapes`. Its wrapped transport snapshots status, clones the actual
Response immediately, awaits the clone's arrayBuffer, detaches the bytes, then returns the
original Response to the shared client for normal request/response/refusal validation.
If cancellation is already visible when transport returns, pass the original Response
directly to the shared client for its existing discard/cancellation path, without cloning
or waiting for body capture. This exchange may have no capture. Once capture has begun,
body-abort behavior depends on the injected transport honoring its signal, as the shared
client's existing response.text path does; this unit adds no timeout or physical-stop claim.
Concurrent calls never share a last-response slot. Compatible unknown body fields, byte
order and whitespace remain in the capture. Headers are not retained in evidence. The
artifact media type `application/json` names the verified body representation, not the
whole HTTP envelope. A body-read failure follows the shared client's modeled transport
failure without reserialization, retry or fabricated bytes. Preflight failure may have no
response. No truncation/default policy or new automatic retry is introduced.

The client does not establish receipt correspondence, authority, durable acceptance or
eligibility. Those remain with the existing artifact/history owners and real receiver.
Tests must distinguish actual source bytes from parsed output and prove per-call isolation,
including reverse completion and a canceled/failed neighboring call.

## 2. Durable authority delivery

`runs/dispatch-authority.ts` exports `dispatchAuthority(runs, artifacts, client, guard,
canonicalRequest, signal)`. It consumes a `RuntimeGuard`, an already immutable canonical
authority request, existing RunStore methods and ArtifactStore. It snapshots input before
awaits and parses through the existing shared canonical owner. The request must be an
authority operation for the exact scope and already retained ledger pin. Initial discovery
and `pinRuntimeScope` remain explicit caller operations; existing pins never change.

Stage through `stageRuntimeRequest` before POST. Local refusal returns without POST. Only
fresh `applied` may invoke `acquireAuthority` once, after live ownership renewal and a
post-await cancellation check. Form the wire body from the retained parsed operation
without its canonical-only `kind`, adding `personId` from scope and project path from scope.
Do not rebuild immutable fields from a new observation.

Duplicate staging reads verified runtime history. If already accepted, return its original
verified acceptance/evidence as historical acknowledgement; do not issue another POST or
replace its artifact. If pending, call lookup only for the exact retained command/ledger.
Receipt404, receiver refusal, cancellation and transport uncertainty leave the slot pending.
Missing endpoint, malformed success, unknown refusal/status and invalid trusted request
remain explicit failures, never proof of nonacceptance or an executor/business outcome.

Successful receipt capture is detached, retained through ArtifactStore, then passed to
`acceptRuntimeReceipt`, which already verifies complete bytes/schema/correspondence. Read
back verified history when needed. If a concurrent winner already retained acceptance,
use that original artifact; never replace it with a compatible but byte-different lookup
response. A losing acceptance may re-read the winner once, without resending. An unrelated
identity/revision conflict stays a modeled refusal. Old-epoch acceptance never becomes the
new owner's current mapped grant.

The return type separates `accepted` historical acknowledgement, local `refused`, and
`pending` with retained intent plus the exact typed receiver refusal/client failure or
pre-dispatch cancellation. No accepted reply is called current execution permission.
Unexpected faults after staging throw a fixed-message correlated error with immutable
RuntimeIntent and original cause. Trusted-state failures are never defaulted or swallowed.

## 3. Exact prepared claim delivery

`runs/claim-activity.ts` composes `stageClaimRequest` and `acceptClaimReceipt` with the same
receiver client. Input carries stable distinct local stage/acceptance command IDs, the
final canonical claim request and its exact state artifact. Receiver command ID is a
separate namespace. Reject non-claim operations and reused local command IDs before any
external call. The original state artifact and canonical bytes survive retries unchanged.

For initial construction, a focused builder reads verified execution/runtime history and
actual retained fresh RuntimeState: match complete scope/ledger/target/parent and use the
prepared locator's actual session ID with store/run/attempt. The shared encoder produces
the final request. Only basis/evidence can refresh before staging; no target/session rebind.
The helper accepts the resulting fixed request, not an instruction to rebuild on retry.

Initial construction can use the existing full-schema target-artifact reader and the local
verified grant history. It establishes correspondence for request construction, not a live
receiver lease or admission permission; the receiver and atomic local stage retain those
checks. Claim and authority senders share only focused original-capture retention mechanics,
including a detached returned reference across the additional async boundary. Their receipt
verification, coupled revision checks and winner semantics remain with each host operation.

Existing stage atomically retains claiming state and scope intent. Only fresh applied sends
one conditional claim after owner/cancellation checks. Duplicate pending looks up; accepted
duplicates return the original verified claim binding and original paired acknowledgement.
Keep independently retained acceptance evidence when lookup returns a different compatible
representation. Acceptance remains coupled to exact run/attempt/scope revisions. Save
conflict or unknown acceptance never launches a turn, clears pending or frees capacity.

Fresh staging accepts under the submitted run/scope revisions advanced exactly once and
the staged acknowledgement's attempt revision. Duplicate staging uses the submitted guard
unchanged: its acknowledgement is historical and carries no original run revision. A retry
with the old pre-stage guard may look up but its acceptance revision-conflicts and stays
pending. The caller explicitly inspects/reconciles before supplying current run/attempt/scope
revisions on another call; the helper never refreshes that captured guard after lookup or
derives a duplicate run revision from an acknowledgement/current read. Existing acceptance
may resolve a claiming checkpoint inside reconciling/unresolved wrappers under that explicit
current guard, preserving original attachment provenance and granting no turn permission.
Recover a concurrent winner's exact original ClaimAcceptAck from verified execution history
using the same stable acceptance command ID and complete RuntimeIntent. A different local
acceptance ID remains an identity conflict; do not synthesize an acknowledgement from the
current Attempt or substitute another command's reply. The canonical builder imports the
existing shared encoder directly at an exactly admitted consumer path; no policy tunneling.

## 4. One fresh turn

`runs/dispatch-turn.ts` exports the host operation over semantic stores, the receiver client,
a separate exact project-claims observation client using the same configured transport,
injected ActivityExecutor, original opaque ActivitySession, ScopedAttemptGuard, stable
distinct stage/observation command IDs, TurnRequest and signal/onPart control. Snapshot
portable input and capture control callback before awaits. No reconstructed live session.

Read verified execution history first. If this stage command is already retained, use the
existing stageTurn replay route before fresh-state predicates and return its original
historical pending acknowledgement without remote reads or turn dispatch. A different
payload/family retains the store's identity refusal. Local history absence does not bypass
the store's global command identity check, and a staging race that returns duplicate never
dispatches. This includes exact retries after turn_pending/turn_returned or later state.

For a fresh command, read verified runtime history and require the complete retained direct ready
checkpoint, accepted exact claim, current-owner attachment and latest current-epoch grant.
Check actual executor kind/version and full live locator against retained locator. Read
actual pinned RuntimeState before dispatch: exact scope/ledger, held receiver grant, and
one matching runtime claim including claim/person/work/step/parent/session and full execution
binding. Ordinary claims and historical receipt acceptance are not current claim evidence.

RuntimeState inventory does not sweep or expose lease expiry. Also read the existing
readProjectClaims endpoint and match exactly one claim ID, holder, work, step, parent and
legacy runId against that same runtime binding (the live claim runId is the session ID,
not the local RunStore run ID). Require leaseRevokedAt null and leaseExpiresAt null or
strictly greater than that response's server readAt; equality is expired. Null explicitly
means an unleased claim. Reject malformed/nonfinite timing rather than using caller time.
These are separate authenticated observations of inventory/grant and lease status, not an
atomic cross-endpoint guarantee or evidence the lease survives through the turn.

Stage through the existing `stageTurn` with exact independently observed revisions. Only a
fresh applied reply may call turn; duplicate returns historical pending without dispatch.
Renew local ownership and recheck cancellation, then recheck the full live locator against
the stored turn locator after all awaits immediately before calling `executor.turn`. Use
the stored immutable TurnRequest and the original opaque session. A finite pre-dispatch
read cannot atomically fence later local/receiver takeover or physical work; pending state
and no replacement are the safety boundary. Current TurnIntent has no link for this new
remote-state artifact, so this packet proves performed ordering without claiming a durable
historical audit of that live check.

Validate/snapshot the complete TurnReply and record `turn_observed` under exact post-stage
revisions with the distinct observation ID. Fresh stage advances the submitted run revision
once and uses the staged attempt revision; it does not advance scope revision. Observation
persistence uses those exact values across awaits without refreshing for intervening facts.
After historical stage replay has priority, a fresh stage refuses an observation ID already
present in verified local execution history. An applied or duplicate observation reply must
acknowledge this staged run/attempt at the staged attempt revision advanced once. An older
identical not_started reply cannot acknowledge a newer pending stage; mismatch throws with
the actual store reply as diagnostic cause. A concurrent original winner for this same stage
may return its exact historical acknowledgement without another turn.
Preserve complete text, measured zero/unknown reason, finish and unresolved variants.
Not_started, unresolved and completed preserve
their current storage meanings. Completed means turn_returned, not accepted business
success, released claim/capacity or successor settlement. Expected observation-store refusal
returns typed pending/local_refused with its actual reason and original intent/ack. Unexpected
dispatch/persistence throws or mismatched stored acknowledgement throw TurnDispatchError
with correlation and original cause. Neither outcome clears pending or automatically redispatches.

## 5. Integration and remaining recovery

Real integration is a be-01-owned boot test and Dash-owned test worker. The parent reuses
existing OrganizationHarness/bootBe01 fixture and an already-issued test principal; no new
auth issuer/policy. The child imports only Dash and public contracts, receives private test
configuration through a controlled pipe/file, and calls real loopback HTTP through injected
transport. Bound ready/go/reply/exit, await cleanup, never log credential headers. Parent
checks actual receiver receipts/journal/claim; child checks durable local history/barriers.
Declare an explicit target/CI dependency because process argv is not an Nx import edge.
The be-01 test target declares scoped Dash runs/bridge/agents inputs actually consumed by
the child, preserving default inputs without introducing a production app dependency.
A real Nx/CI selection regression proves those changed paths select be-01's boot test.

Conformance covers commit-before-send, locator-before-claim, lost reply followed by lookup
without second POST,404 while an original request can still commit, mismatched/invalid-byte
receipt, concurrent raw capture, stale grant/claim/live locator, duplicate turn election,
and no WBS progress/capacity release from turn completion. New owned checks require finite
production-path negatives and exact restoration; existing guards and SQL stay installed.

The one-pending scope rule currently prevents local fencing acquisition while a claim is
unresolved. This remains a visible operator/reconciliation condition, not a bypass. A later
accepted semantic extension must supply fence-before-nonacceptance recovery. API-model
durable lookup/resume/effect/quiescence remains unsupported. Exact outcome/write/release,
operator operations, other adapters and CTT S7a remain required parts of the full objective.
Remote claim heartbeat, repeated local lease renewal/cancellation/reconciliation and the
one-to-one WBS business-attempt mapping remain mandatory host-lifecycle work before long
live turns, deployment or dogfood. Aggregate heartbeat success is not exact-claim evidence
and cannot revive expired/revoked claims. This packet's controlled unleased-principal boot
test is not pinned-machine heartbeat or physical-stop proof.
