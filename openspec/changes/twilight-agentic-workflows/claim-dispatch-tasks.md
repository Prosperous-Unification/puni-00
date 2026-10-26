# Prepared claim delivery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development with independent task review and later whole-packet review.

**Goal:** Construct one exact request for the prepared session and deliver/reconcile its coupled WBS claim without resending or silently refreshing local authority.

**Architecture:** Initial construction reads verified local history and a retained actual WBS target observation. Delivery accepts that fixed request and stable local identities. Existing stage/accept planners remain the atomic authority; current receiver state and opaque-session checks precede turns in the next unit.

**Tech Stack:** Bun, TypeScript, existing memory/SQLite stores, RuntimeClient and public canonical WBS encoder. No dependency or stored-format change.

**Spec:** runtime-dispatch-design.md section3, runtime-dispatch-intent.md, WBS bridge delta and /tmp/puni-agentic-claim-dispatch-audit-20261026.md.

## Global constraints

- Work only in /tmp/puni-agentic-runtime-dispatch-20261026, feat/agentic-runtime-dispatch. Plan starts at8119ea9fa8e4cedd329836f9b91a849cada698b4; Task2 uses the accepted Task1 checkpoint root supplies. Separate PR759 remains immutable while gated.
- Root owns tracked plans/spec/design/verify/checklists, review, commits, push and integration. Implementer owns only its declared source/tests and ignored artifacts. No commits or nested agents.
- Bun/Nx only for every command/helper/proof/report operation. Preserve original attempts, actual argv/exits, frozen tests and exact restoration. No setup/import/timeout credit.
- No credential/auth/tenant/MCP issuance, default transport/URL, ordinary claim/write fallback, executor invocation, outcome/release, CTT or other-owner changes. No schema/migration or stored format changes.
- Existing RunStore/history/planner/SQL/auth guards remain authoritative. Do not change them. A builder result or historical claim acknowledgement grants no current execution permission; uncertain work retains capacity.
- The local stage/acceptance IDs are stable and distinct. Receiver command identity is a separate namespace; equal lexical values across namespaces are not prohibited. Canonical request and exact state artifact never refresh on retry.
- Only fresh applied staging may send one conditional claim. Duplicates return verified original paired acknowledgement or perform exact receipt lookup, never another POST.404/refusal/cancellation/transport uncertainty cannot prove nonacceptance or clear pending.
- Fresh acceptance advances the submitted run/scope guard exactly once and uses the stage acknowledgement's attempt revision. Duplicate acceptance uses the independently submitted guard unchanged. No internal revision refresh, fabricated historical run revision or retry loop.
- Every new owned safety check/consumption edge needs a finite production-path negative, actual named failure and exact byte/mode restoration plus truthful Proof comment. Never disable inherited backstops to strengthen a claim.

### Task 1: Initial exact prepared-session request

**Files:** Create runs/build-claim-request.ts, runs/build-claim-request.test.ts, runs/testing/claim-request-contract.ts and runs/sqlite/build-claim-request.db.test.ts under apps/twilight-structure/twilight-dash/cli/src. Modify only a new exact builder-source consumer allowance in apps/twilight-structure/twilight-dash/eslint.product.mjs and its named effective-policy case in tools/tool-devsync/src/eslint-boundaries.test.ts. Existing tests/planners/codecs/history/SQL remain unchanged.

**Consumes:** Verified readExecutionHistory from claim-history.ts, readRuntimeHistory, readTargetObservation, existing scoped guard/record codecs, ArtifactStore and canonicalRuntimeRequest directly from @wbs/contracts. Reuse admitExecution/prepare-session fixtures and actual memory/SQLite adapters. Do not import a .test.ts module or forward the encoder through another allowlisted module.

**Produces:**

```ts
interface BuiltClaimRequest {
  readonly canonicalRequest: string;
  readonly stateEvidence: ArtifactRef;
}
type ClaimRequestReply =
  | { readonly kind: 'built'; readonly request: BuiltClaimRequest }
  | { readonly kind: 'refused'; readonly reason: StoreRefusal };
buildClaimRequest(
  runs: Pick<RunStore, 'readExecutionHistory' | 'readManifest' | 'readRuntimeScope'>,
  artifacts: ArtifactStore,
  guard: ScopedAttemptGuard,
  input: { readonly commandId: string; readonly stateEvidence: ArtifactRef },
): Promise<ClaimRequestReply>;
```

The commandId here is the receiver identity, not either local execution command ID. The output is detached construction input for claimActivity, not an execution permission or live-lease assertion. This helper performs no network call, store mutation, ownership renewal or artifact retention. Caller supplies an already retained actual state artifact and independently observed local guard. It is called for initial construction only, not to regenerate a retry.

- [x] Write/run RED for real missing builder, preserving import/setup failure separately. Register the same semantic construction cases against actual memory/SQLite fixtures, using a genuinely prepared session. Assertions decode actual output with the existing canonical parser and independently compare complete expected operation fields.
- [x] Snapshot submitted guard and input before awaits. Read verified complete execution and runtime history. Missing/unreadable/corrupt trusted evidence throws. A non-prepared direct checkpoint returns state_conflict; mismatched independently submitted run/attempt/scope revisions return revision_conflict; missing pinned scope/current local-epoch grant or conflicting scope/ledger/provenance returns authority_conflict. Do not unwrap reconciling/claimed/ready into prepared construction. No automatic ownership acquisition or refresh.
- [x] Use readTargetObservation on the original detached stateEvidence and prepared immutable target, then compare observed ledger with the retained pin and prepared observation. Read only the refreshed basis/evidence from this artifact: work item, step/code, parent and actual session ID come from the verified prepared record. Select the retained grant belonging to the submitted local owner/epoch; this remains local historical evidence, and the receiver independently checks its live grant atomically. Build exactly schemaVersion1/commandId/expectedLedgerId/authority/expectedBasis/action.claim using canonicalRuntimeRequest. Execution binding is guard.ownership.storeId plus actual run/attempt and prepared locator.session.sessionId. No user-supplied replacement target/session, copied JSON encoder or legacy session placeholder.
- [x] Cover fresh valid construction, complete field correspondence, changed basis with identical prepared target, different work/step/code/scope/ledger rejection, absent/unreadable/malformed/invalid-UTF8 actual artifact, stale local revisions, no/current-other-epoch grant, non-prepared checkpoints and input mutation while history/artifact reads are held. Construction must leave all actual local histories/artifacts/capacity unchanged. A subsequent real stageClaimRequest must accept the valid output; its atomic guards remain the final mutation boundary.
- [x] Add only the exact new builder source path and anchored @wbs/contracts. Tests use existing fixture/publicly derived local types and need no new foreign allowance. Named effective-policy case must prove real builder admission; sibling/private/judge/relative denial; denial for the actual new builder test and an existing unlisted runs peer; inherited options unchanged. Run finite owned allowance-removal/alias/relative/path-widening faults without altering old policy rules.
- [x] Freeze final tests, then run finite Bun-only negatives for new construction/check/snapshot/encoder-consumption boundaries and new policy edge. Record actual argv, fault strength, raw logs, source/test hashes/modes and exact restoration. Keep inherited verifier negatives at their existing owner; do not duplicate or disable them merely to force proof.
- [x] After restoration/comments/format run full new memory+SQLite files once with scratch preload/--timeout=30000, named policy case, fresh cached Nx graph, uncached Dash/tool-devsync lint/typecheck, touched format/diff and scoped OpenSpec. Preserve all warnings/setup failures. Self-review and report in root-provided task workspace; root independently reviews/commits before Task2.

### Task 2: Fresh claim send and exact coupled acknowledgement reconciliation

**Files:** Create runs/claim-activity.ts, runs/claim-activity.test.ts, runs/testing/claim-dispatch-contract.ts, runs/sqlite/claim-activity.db.test.ts and runs/retain-runtime-receipt.ts under the same CLI src. Modify only the capture/retention call site in runs/dispatch-authority.ts to share that focused mechanics with the new claim sender. Preserve all existing checks, messages, ordering, original R5 artifacts and semantics; no generic state machine or other source/policy/SQL edits.

**Consumes:** stageClaimRequest/acceptClaimReceipt/readExecutionHistory from claim-history.ts, completed BuiltClaimRequest, RuntimeClient, RuntimeDispatchError, record/guard codecs, actual stores and accepted authority helper. Task1's canonical request is fixed input, never rebuilt inside this helper.

**Produces:**

```ts
claimActivity(
  runs: Pick<RunStore, 'readExecutionHistory' | 'readManifest' | 'stageClaim' | 'recordClaimAcceptance' | 'renewOwnership'>,
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
): Promise<ClaimDispatchReply>;
```

ClaimDispatchReply is accepted `{kind:'accepted',intent,ack:ClaimAcceptAck}`, pre-stage local `{kind:'refused',reason:StoreRefusal}`, or post-stage pending `{kind:'pending',intent,observation}`. Observation preserves cancelled_before_dispatch, local_refused, exact typed receiver refusal, or cancelled/transport unconfirmed failure, derived from applyCommands/lookupReceipt replies. Accepted ack is the original complete historical paired reply, never current turn permission.

The focused shared primitive exports `retainRuntimeReceipt(artifacts: ArtifactStore, response: RuntimeExchange<unknown>['response'], expectedStatus: number): Promise<ArtifactRef>`. It preserves the existing capture/metadata diagnostics, detaches actual bytes before retention and detaches the returned artifact reference before its additional async return boundary. It does not validate receipt schema/correspondence, classify transport outcomes or accept local history; existing callers keep those responsibilities.

- [ ] Write/run focused RED against actual helper and both providers. Snapshot all input before awaits, validate distinct local IDs, then stageClaimRequest before any POST. Existing stage helper owns kind, actual artifact/target/prepared-session and coupled-transaction validation; do not duplicate guards solely for proof. Pre-stage refusal sends nothing. Snapshot the returned complete RuntimeIntent for all later correlation.
- [ ] Extract only actual receipt capture status/absence validation, detached byte copy, application/json retention and metadata refusal from dispatchAuthority into retain-runtime-receipt.ts; preserve exact behavior and original checks/messages. Both host helpers await it. Unexpected faults remain correlated by the outer known-intent RuntimeDispatchError. Add fresh consumption negatives at the shared path through real host calls; preserve earlier authority proof archives and run its affected91-case suite once with the final new claim suite. Do not change dispatch election, receipt verification, winner semantics or old planners.
- [ ] Only fresh applied claim stage may renew ownership, check live cancellation on both sides of await, then invoke applyCommands once with exact retained conditional claim body (personId/project path from scope). No ordinary claim route or replacement input. Duplicate stage reads verified execution history for original acceptance under the same acceptanceCommandId and complete RuntimeIntent; return its original ClaimAcceptAck without HTTP/artifact replacement when found. Otherwise lookup exact retained ledger/command only.
- [ ] Fresh acceptance guard advances submitted run and scope once and uses the stage ack's attempt revision. Duplicate acceptance uses submitted guard unchanged. Preserve old pre-stage duplicate guard as lookup-only followed by local revision_conflict; caller explicitly inspects/reconciles and submits current revisions in another call with identical fixed inputs. Never refresh after lookup, infer original runRevision from historical ack, or use a winner read to create a new acceptance guard.
- [ ] Retain actual successful receipt bytes through the shared focused helper, then call acceptClaimReceipt exactly once under the fixed guard and stable acceptance ID. The existing verifier owns complete schema/digest/scope/ledger/claim/execution correspondence and generated-field projection. For identity/revision save conflict allow one verified execution-history winner read for the same acceptance ID and complete intent, returning that exact original ack/evidence even if current attempt has advanced. Different local acceptance ID or no matching winner preserves the actual refusal as pending. Malformed incoming evidence never hides behind a later winner.
- [ ] Preserve receiver404/refusals/cancel/transport ambiguity as pending without clear/rebase/re-POST, turn, outcome, successor or capacity release. Unexpected post-stage schema/status/configuration/artifact/persistence faults throw RuntimeDispatchError with original intent/cause. New-owner late receipt acceptance may preserve the old attachment; it is not current execution permission or physical fencing.
- [ ] Cover commit/locator-before-send, one POST across concurrent exact calls, cancellation/renew refusal, immutable caller and retained snapshots, actual conditional body, lost response/lookup-only,404 while original request can still accept, wrong/missing/corrupt receipt bytes, acknowledgement barriers, same-ID byte-different winner, different acceptance ID conflict, stale old duplicate guard then explicit current-guard success, intervening facts during lookup refusal, preexisting recovery-wrapper reconciliation and new-owner late acceptance with old attachment/no turn. Exercise both providers and SQLite close/reopen with accurately bounded recovery claims. Test equal lexical receiver/local IDs as separate namespaces and reject reused local stage/accept IDs.
- [ ] Freeze final tests and prove each genuinely new owned safety/consumption edge through finite Bun mutations and exact restoration, keeping inherited guards installed. After comments/format run final claim memory/SQLite plus affected authority files once, fresh graph-backed uncached Dash lint/typecheck, touched format/diff and scoped OpenSpec. Report self-review, actual commands/identities/warnings/limits. Root task review/normal checkpoint, then fresh turn/real boot/full-packet review/exact-SHA gates remain required; full S0/S7a is not complete.
