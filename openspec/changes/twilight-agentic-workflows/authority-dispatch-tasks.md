# Durable authority delivery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan with task review and later whole-packet review.

**Goal:** Connect an immutable local authority intent to one actual receiver POST and receipt-only reconciliation.

**Architecture:** A focused host helper composes existing semantic RunStore, ArtifactStore, verified runtime history and the correlated RuntimeClient. Fresh staging alone elects POST; historical duplicate staging elects verified acknowledgement or lookup. Existing storage formats, canonical/schema owners and safety checks remain authoritative.

**Tech Stack:** Bun, TypeScript, existing memory/SQLite stores and public receiver contracts; no dependencies.

**Spec:** runtime-dispatch-design.md section2, runtime-dispatch-intent.md and specs/twilight/wbs-run-bridge/spec.md in this OpenSpec change.

## Global constraints

- Work only in /tmp/puni-agentic-runtime-dispatch-20261026, feat/agentic-runtime-dispatch. PR759 source/gate lives in a separate immutable worktree.
- Root owns plans/checklists/verify, reviews, commits and integration; implementer owns declared new source/tests and ignored reports. No nested subagents or commits.
- Bun/Nx only, including proof orchestration and diagnostic helpers. Preserve failed trials and all earlier artifacts.
- No credentials/auth issuer, URL/default-fetch policy, machine/MCP/tenant scope, ordinary-command fallback, executor, CTT, outcome/release/recovery-format, SQL/schema/migration or existing guard change.
- Inject RuntimeClient; source must not import WBS implementation or add a new foreign-contract allowance. Existing runtime-codecs/history own canonical parsing and receipt verification.
- Every new safety check needs a finite production-path negative, actual intended failure and exact source/mode restoration, with truthful adjacent Proof comment. Do not remove inherited guards or count setup/import/timeout failures.
- No receipt absence/refusal/cancellation/transport failure proves nonacceptance. Accepted history grants no live execution permission. No new POST, pending clear/rebase, capacity release or business outcome on retry.

### Task 1: Commit-first authority send and immutable receipt reconciliation

**Files:** Create runs/dispatch-authority.ts, runs/runtime-dispatch-error.ts, runs/dispatch-authority.test.ts, runs/testing/authority-dispatch-contract.ts and runs/sqlite/dispatch-authority.db.test.ts under apps/twilight-structure/twilight-dash/cli/src. Do not edit existing source/test/policy owners. New error file exists only for portable correlation shared by later claim dispatch; no generic dispatch state machine.

**Consumes:** RunStore.stageRuntimeRequest/readRuntimeScope/recordRuntimeAcceptance/renewOwnership, ArtifactStore, RuntimeGuard/Intent/Acceptance, readRuntimeRequest/decodeRuntimeGuard/decodeRuntimeIntent, readRuntimeHistory/acceptRuntimeReceipt, RuntimeClient from bridge/runtime-client. Existing testing/runtime-history-contract exports authorityRequest/authorityReceipt/runtimeScope/runtimePin; reuse those valid fixtures without importing a .test.ts module. Existing memory-stores, SQLite open-stores and FixtureClock supply actual persistence.

**Produces:**

```ts
export async function dispatchAuthority(
  runs: Pick<
    RunStore,
    'stageRuntimeRequest' | 'readRuntimeScope' | 'recordRuntimeAcceptance' | 'renewOwnership'
  >,
  artifacts: ArtifactStore,
  client: RuntimeClient,
  guard: RuntimeGuard,
  canonicalRequest: string,
  signal: AbortSignal,
): Promise<AuthorityDispatchReply>;
```

AuthorityDispatchReply distinguishes accepted `{kind:'accepted',intent,acceptance}`, pre-stage local `{kind:'refused',reason:StoreRefusal}`, and post-stage `{kind:'pending',intent,observation}`. Observation is a discriminated union for cancelled_before_dispatch, local_refused with StoreRefusal, receiver_refused with exact existing typed refusal reply, and unconfirmed with existing cancelled/transport ClientFailure. Derive reply/failure types from RuntimeClient method outputs rather than copying wire schemas or adding foreign imports. Accepted always means historical acknowledgement.

`RuntimeDispatchError` uses fixed public message `Runtime dispatch failed`, immutable detached RuntimeIntent and original private cause. All unexpected post-stage failures are correlated through it; malformed pre-stage trusted input throws normally. Freeze the complete detached intent including localOwner if exposing it as immutable. It must not interpolate private cause text into message.

- [x] Write focused RED cases against the real missing helper. Use actual memory+SQLite stores and createRuntimeClient over a finite controlled actual-Response transport. Capture initial import/setup absence separately; it is not a semantic safety proof. Reuse shared contract registration for provider parity, plus a SQLite close/reopen case.
- [x] Snapshot guard/canonical input before awaits with existing codecs. Existing stageRuntimeRequest owns rejection of non-authority operations, scope mismatch, immutable ledger pin and stage identity; reuse its actual refusals rather than duplicate safety checks solely for proof. Await it. Local stage refusal returns typed refusal and sends nothing. Preserve malformed/unpinned trusted failures rather than inventing defaults. Only `applied` may POST; use the returned retained intent and exact operation, never refreshed request bytes. A retained non-authority operation violates trusted correspondence and throws before HTTP.
- [x] For fresh stage, check cancellation before renewal, await renewOwnership, retain pending on refusal, recheck live signal after await, then invoke acquireAuthority once. Wire params.id and personId derive from retained scope; body omits canonical-only kind and preserves schemaVersion/commandId/expectedLedgerId/ownerId/expectedGeneration. No initial network discovery, pin mutation or implicit headers/auth changes.
- [x] For duplicate stage, read verified history. Return original matched acceptance if present, without lookup/POST/artifact replacement. Otherwise lookup exact retained scope/ledger/command only; never call acquireAuthority from duplicate branch. A newer current local owner may reconcile an older epoch intent, but accepted metadata never gives that new epoch a mapped grant. Old guard refusal remains the actual store contract.
- [x] Classify validated refusal (including lookup404), cancelled and transport failure as pending observations with retained original intent. Invalid request/response, unknown status/refusal, missing actual capture, mismatched capture status, artifact failure and verification faults throw correlated RuntimeDispatchError after stage. Never clear pending, retry a POST, return accepted, free capacity or invent fallback bytes. Shared client validates schema; existing acceptRuntimeReceipt validates raw artifact integrity and complete correspondence.
- [x] On validated success, snapshot actual captured bytes before artifact await, retain as application/json, reject metadata conflict, await acceptRuntimeReceipt with exact intent.stagedRevision (not a refreshed revision). If save refuses revision_conflict or identity_conflict, read verified history once and accept only a matching complete original intent and its retained acceptance winner. Return winner's original artifact even if this compatible lookup body differs byte-for-byte. No retry loop, unrelated conflict blessing or new dispatch. Other save refusal stays pending local_refused. Concurrent winner detection may precede retaining new evidence after the response; preserve original acceptance identity either way.
- [x] Cover finite commit/renew/transport/artifact barriers: no POST before committed intent; one fresh POST across concurrent exact calls; changed canonical same ID refused; cancelled-before/while-renew zero send; takeover during renewal zero send; input mutation during stage cannot rebind wire scope/owner/generation. Complete retained raw bytes preserve whitespace/order/additive fields and acceptance is not returned before artifact+local receipt commit.
- [x] Cover lost response after simulated receiver commit followed by lookup-only acceptance; lookup404 while original POST remains delayed and may subsequently succeed; typed receiver refusals; invalid JSON/schema/correspondence/status; unreadable/corrupt evidence; no clear/rebase/second POST; acceptance race with two different compatible raw representations returns first persisted artifact; unrelated revision conflict remains pending. Every case checks relevant actual history/pending state, and no fabricated receiver nonacceptance assertion follows from404.
- [x] Cover duplicate accepted acknowledgement without HTTP and without replacing original artifact; historical acceptance under new local epoch keeps actual grant null. SQLite close/reopen retains pending original bytes and lookup-only reconciliation under the original still-live guard; explicitly distinguish close/reopen from process-kill/power-loss recovery. Neither test claims automatic fencing/replacement recovery.
- [x] Run Bun-only mutations against frozen final tests for genuinely new send-election/await/cancel/snapshot/receipt-consumption/winner/correlation checks. Record actual argv, source+test hashes/modes, actual mutant, finite intended fail, exact restoration and same-selector pass for every trial. Label diagnostic-only proofs honestly where inherited guards still reject; do not add redundant checks solely to create a proof.
- [x] After restoration/comments/format, run the complete new memory+SQLite test files once with `bun test --preload ./tools/test/scratch/preload.ts ... --timeout=30000`. Prepare fresh cached Nx graph with NX_DAEMON=false, then graph-backed uncached `twilight-dash:lint` and `twilight-dash:typecheck`; run touched-file format, git diff --check and scoped OpenSpec. Do not rerun unrelated provider/backend/browser suites or full host gate at unit level. Retain warnings/setup failures and exact final hashes.
- [x] Self-review and report all source paths, RED/GREEN/proof commands/raw outputs, guard strength, restoration, final identities and remaining limits in the task-specific ignored report. Root requires independent task review and a normal checkpoint commit before acceptance. Claim/turn/real boot/full-packet review/exact-SHA gates and full S0/S7a remain required.
