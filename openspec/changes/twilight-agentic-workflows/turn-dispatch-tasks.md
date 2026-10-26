# Fresh turn and receiver boot implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task.

**Goal:** Connect one newly retained turn to its original opaque executor session after exact local, receiver and claim-lease observations, then prove the composition over a real receiver boot.

**Architecture:** Semantic stores remain the only local transition owners. Separate authenticated runtime and project-claim observations precede fresh staging; historical retries return the original stage acknowledgement. A be-01 parent and Dash child prove HTTP and persistence without a cross-app production dependency.

**Tech stack:** Bun, Nx, existing shared endpoint client, ActivityExecutor, memory/SQLite semantic stores.

**Spec:** [run coordination](specs/twilight/run-coordination/spec.md), [activity execution](specs/twilight/activity-execution/spec.md), [runtime design sections4–5](runtime-dispatch-design.md).

## Global constraints

- Work only in /tmp/puni-agentic-runtime-dispatch-20261026, feat/agentic-runtime-dispatch, at the accepted claim-delivery checkpoint root supplies. Preserve all unrelated changes and completed proof archives.
- Root owns tracked metadata, independent reviews, commits, push and integration. Implementer owns only its task's declared source/tests and ignored evidence. No commits or nested agents.
- Bun/Nx only for every command/helper/edit/report/proof. Record exact argv, terminal outcomes, frozen tests and restoration; setup/import/timeout failures receive no proof credit.
- No credential issuance, auth/tenant/MCP policy, default URL/transport, ordinary claim/write fallback, outcome/release, CTT, provider/other-owner implementation or production deployment. No schema/migration or stored format change.
- Preserve existing history/planner/SQL/auth guards. Historical receipts and acknowledgements grant no current execution permission. Uncertainty retains capacity; no replacement or implicit retry.
- Portable inputs detach before awaits; use the original opaque session. Every new owned safety/consumption edge needs a finite production-path negative, named failure, exact byte/mode restoration and truthful adjacent Proof comment. Inherited backstops remain installed.
- Runtime inventory and project-claims are separate observations, not an atomic fence. Use server readAt, never Date.now; null expiry is explicitly unleased. No physical-stop, lease-survival or durable historical live-check claim.
- Full goal still requires heartbeat/local renewal lifecycle, WBS business-attempt mapping, exact outcomes/releases, supported recovery, other adapters and S7a acceptance. Controlled unleased test-principal boot does not certify these.

### Task 1: Guarded one-turn host and narrow claim reader

**Create under apps/twilight-structure/twilight-dash/cli/src:** bridge/claim-client.ts, bridge/claim-client.test.ts, runs/dispatch-turn.ts, runs/dispatch-turn.test.ts, runs/turn-dispatch-error.ts, runs/testing/turn-dispatch-contract.ts, runs/sqlite/dispatch-turn.db.test.ts. **Modify:** apps/twilight-structure/twilight-dash/eslint.product.mjs and tools/tool-devsync/src/eslint-boundaries.test.ts only for the exact legitimate new public-contract consumer paths and named effective-policy case. Do not expand wildcards or test exemptions.

**Consumes:** accepted claimActivity/BuiltClaimRequest and actual providers for fixtures; verified readExecutionHistory from claim-history.ts and readRuntimeHistory; TurnIntentCodec/decodeScopedAttemptGuard/decodeTurnStageCommand; RunStore.stageTurn/recordExecution/renewOwnership; recordExecution verified helper; ActivityExecutor/snapshotTurnReply/snapshotTurnRequest; complete runtime read and existing readProjectClaims shape.

**Produces narrow client:** createClaimClient(transport: ClientTransport): ClaimClient. ClaimClient exposes only readClaims(input: ClientInput<typeof readProjectClaims>): Promise<ClientReply<typeof readProjectClaims>>. Refuse a non-callable transport at construction with existing ClientConfigurationError, then compose clientFromShapes with the exact singleton readProjectClaims tuple; preserve its typed reply/failure behavior. No original-byte retention is needed for this live observation, no second auth configuration or alteration of the accepted four-method RuntimeClient. Shared client owns request/response boundary validation; do not duplicate it merely for proof. Successful shared-schema replies with nonfinite lease numbers still need the host's explicit numeric check.

**Produces host:**

```ts
dispatchTurn(
  runs: Pick<RunStore, 'readExecutionHistory' | 'readManifest' | 'readRuntimeScope' | 'stageTurn' | 'recordExecution' | 'renewOwnership'>,
  artifacts: ArtifactStore,
  runtime: Pick<RuntimeClient, 'readState'>,
  claims: ClaimClient,
  executor: ActivityExecutor,
  session: ActivitySession,
  guard: ScopedAttemptGuard,
  input: { readonly stageCommandId: ExecutionCommandId; readonly observedCommandId: ExecutionCommandId; readonly request: TurnRequest },
  control: { readonly signal: AbortSignal; readonly onPart: (part: UIMessageChunk) => void },
): Promise<TurnDispatchReply>;
```

TurnDispatchReply separates observed `{kind:'observed',intent,attempt:Attempt}`, pending `{kind:'pending',intent,ack:TurnStageAck,observation}`, local refused `{kind:'refused',reason:StoreRefusal}` and pre-stage unconfirmed endpoint observations `{kind:'unconfirmed',operation:'runtime_state'|'claim_lease',observation}`. Keep exact typed endpoint refusals and cancelled/transport failures correlated with operation. Invalid-request, invalid-response, unknown status/configuration and malformed successful trusted observations throw; they are not modeled uncertainty. Pending observation is duplicate, cancelled_before_dispatch or local_refused with actual StoreRefusal. Duplicate ack is the complete original historical TurnStageAck. Completed turn storage is only turn_returned, never business success.

TurnDispatchError retains detached deeply frozen TurnIntent and original cause with fixed public message `Turn dispatch failed`; never stringify private cause/session. Use existing strict codecs and a typed freeze strategy, no unchecked cast/any/non-null assertion outside an adjacent justified boundary.

- [ ] Write and observe focused RED through actual helper and both semantic providers. Validate/snapshot guard, stage command, distinct valid local IDs and portable request before awaits; capture signal/onPart. The receiver and local IDs remain separate namespaces.
- [ ] Read verified execution history. If this stage identity already occurs, delegate to existing stageTurn for complete replay/identity/ownership checks before direct-ready checks; return exact duplicate historical pending ack without runtime/claim reads, renewal, turn or observation write. A changed payload/family refuses; a retained key after returned/later state still replays. A fresh staging race that returns duplicate likewise never dispatches. Leave global identity collisions to the actual store.
- [ ] For fresh work require direct ready, exact submitted run/attempt revisions, original scope/organization, current attachment owner and request owner, executor kind/version and entire live locator. Use verified runtime history to require exact pin/ledger, submitted scope revision, no pending command and latest grant mapped to submitted local epoch/owner. Local revision mismatch returns revision_conflict; missing/nonmatching authority returns authority_conflict; non-ready state returns state_conflict; session/executor identity mismatch returns identity_conflict. Missing/malformed trusted histories/artifacts throw, not typed absence.
- [ ] Read runtime.readState for exact scope/project/person using the captured signal. Require successful full-schema reply, exact pinned ledger/scope, held receiver owner/generation equal to selected grant and exactly one runtime claim matching retained claim ID, holder, work, step, parent, session runId and complete store/run/attempt/session execution binding. Ordinary claims cannot qualify. Non-success returns its exact unconfirmed observation; mismatch returns authority_conflict without stage/turn.
- [ ] Read claims.readClaims for that project using the same signal. Require exactly one same claim ID and complete holder/work/step/parent/run correspondence; runId is sessionId, not local RunId. Require finite readAt and finite nonnull lease timestamps, leaseRevokedAt===null and leaseExpiresAt===null or leaseExpiresAt>readAt. Equality is expired. A valid revoked/expired/missing/ambiguous/mismatched observation returns authority_conflict. Malformed/nonfinite trusted successful payload throws. Preserve typed non-success as unconfirmed; never substitute local time or aggregate heartbeat.
- [ ] Stage the immutable turn through stageTurn under the original independently supplied guard only after fresh checks. Local refusal returns without turn. On fresh applied, detach full original ack/TurnIntent, renew ownership, check cancellation on both sides of await and recheck original opaque session's full locator and actual executor pin after all awaits immediately before executor.turn. Renewal refusal/cancellation preserves staged pending with exact observation. Unexpected post-stage faults throw TurnDispatchError without clearing or dispatching a replacement.
- [ ] Pass only retained immutable request and original session/control to turn. Snapshot/validate complete actual TurnReply, then verify identity locator/turnKey/owner against staged intent. Record turn_observed once using run revision submitted+1, stageAck.attempt.revision and original ownership; scope does not advance and observation uses AttemptGuard. Await persistence before observed reply. Do not refresh revisions after awaits. Refused/throwing observation persistence is correlated failure and leaves exact pending provenance; no automatic second turn.
- [ ] Cover measured zero and every unknown usage/finish discriminant, full text and unresolved details, not_started exact semantics; concurrent exact calls and duplicates after later facts; changed IDs/payload, mutable caller/control/locator during awaits; stale/revoked/expired/ambiguous lease with unswept inventory; held current-grant mismatch/old attachment; durable turn-intent observed by second SQLite reader at executor entry; held observation commit; wrong reply identity; intervening facts/recovery or ownership expiry during turn. Assert no claim/capacity release, business progress or successor settlement.
- [ ] Prove only genuinely new checks/consumption edges through finite Bun faults with frozen tests and exact restoration; keep inherited guards installed. Test actual narrow client request/response/refusal/cancellation through existing shared validation and exact consumer-policy protection. Run final new memory/SQLite/client/policy suites once, fresh graph-backed uncached Dash/tool-devsync lint/typecheck, touched format/diff and scoped OpenSpec. Full report/self-review includes warnings and every acceptance limit. Root independent review/checkpoint precedes Task2.

### Task 2: Real receiver boot, Dash worker and actual CI selection

**Create:** apps/wbs/be-01/src/runtime-dispatch.boot.db.test.ts; apps/twilight-structure/twilight-dash/cli/src/runs/testing/runtime-dispatch-worker.ts. **Modify:** apps/wbs/be-01/project.json test inputs; tools/tool-git-hooks/src/hooks/ci-runtime-selection.test.ts and only its existing CLI-fixture owner if required by the actual selection-test conventions. No production app dependency, new workflow job, auth change or cross-app source import.

**Consumes:** Task1 dispatchTurn/createClaimClient, accepted createRuntimeClient/dispatchAuthority/prepareActivity/buildClaimRequest/claimActivity, actual SQLite/ArtifactStore fixtures and existing configured authenticated transport; OrganizationHarness.stopForRecovery/bootBe01/RunningBe.port and established test-principal setup. Read the existing runtime-command controller and boot fixtures before changes.

**Produces:** be-01-owned process integration using a separate Dash worker over real loopback HTTP and local SQLite, and production-path Nx input-selection proof.

- [ ] Observe RED for a real boot composition. Parent builds actual organization/project/test principal using existing fixture, stops for recovery and boots same DB with real listener port0. Use actual RunningBe.port; no no-op listener or new issuer. Child imports only Dash and permitted public contracts. Pass credential/config privately through controlled pipe or owner-only file, never token logs.
- [ ] Bound child ready/go/observation/reply/exit phases and all fixture shutdowns; throw on malformed/nullish/unexpected process state, retain useful sanitized failure evidence and await owned cleanup. No orphan child, port race, unbounded wait or log-and-continue.
- [ ] Run actual conditional authority, preparation, exact prepared claim and one controlled turn through the new production hosts. Parent inspects actual receiver receipt/claim/journal; child inspects local SQLite histories at ordering barriers. Prove prep commit before open, locator commit before claim POST, claim acceptance before turn stage, turn stage before executor entry and observation commit before stored reply.
- [ ] Exercise a held original conditional POST, lost response, actual receipt404 while held and later actual acceptance; duplicate delivery is lookup-only and cannot send another POST. Use real barriers/receiver state, not a fabricated404. Verify original evidence and paired ack survive explicit reconciliation and local reopen with accurately bounded claims.
- [ ] Record WBS business state after claim but before turn and compare after turn. Ordinary claim can start progress/in-progress or implicit legacy bookkeeping; assert the turn adds no business start/end/progress write, release, capacity release or successor. Use controlled executor and legitimate unleased test principal: no paid model or pinned-machine heartbeat claim.
- [ ] Add scoped be-01 test.inputs for actually consumed Dash runs/bridge/agents and any actual fixture/clock families, preserving default/^production entries. Prove with real Nx/committed CI-selection regression that changed dispatch-turn.ts, runtime-client.ts and child worker select wbs-be-01 and Dash where appropriate. Observe named regression failure with new inputs removed and exact restoration; do not assume child argv creates an import edge.
- [ ] Freeze final tests and prove genuinely new ordering/consumption/selection checks with finite Bun faults; preserve existing guards/evidence. Run final boot/selection tests, graph-backed affected lint/typecheck, touched format/diff/OpenSpec. Root task review then broad whole-packet review, normal commit/push/PR, exact-SHA canonical gate and CI remain required. Keep host lifecycle/business mapping and full S0/S7a open.
