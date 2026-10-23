# Durable Execution History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Retain complete preparation, session, exact claim and turn history in both RunStore providers.

**Architecture:** Extract cycle-free portable codec owners first. Then evolve the single attempt
state and shared planners together with atomic runtime claim associations, complete joined
history and the named SQLite format3. No external action is performed.

**Tech Stack:** Bun, Nx, TypeScript, shared ArkType validation and bun:sqlite.

**Spec:** [intent](execution-history-intent.md), [exact design](execution-history-design.md),
[run-coordination delta](specs/twilight/run-coordination/spec.md).

## Global Constraints

- Work only in /home/df/.codex/worktrees/de55/puni-00 on feat/agentic-durable-execution. Root owns tracked OpenSpec/glossary/verification edits and Git/index/HEAD/branch operations. Workers never stage, commit, checkout or spawn subagents. One implementation writer at a time.
- Bun/Nx only for ALL edits, scripts, capture, orchestration and child checks. No Python, npm, pnpm, yarn or second task runner. Shell uses login:false. Preserve original failures and raw evidence; never relabel history as compliant.
- Preserve accepted authority and binding semantics, original codec instance and constructor identities, and all 0001/0002 forward/down SQL bytes. No production credentials, provider construction, limits-policy change, other-session project work, live spend, transport, executor invocation, main merge, deployment or CTT adoption.
- One Attempt state and revision, existing scope pending slot, exact immutable original paired replies, current owner before replay, no legacy bypass, no fabricated recovery capability. Receiver-owned IDs remain unbounded nonempty strings; local identifiers keep their existing bounds.
- Validate boundary input once and throw on malformed or missing trusted state. No any, unchecked casts, non-null assertions or eslint-disable outside tests without an adjacent named boundary justification. No generic JSON/freezing framework.
- Every genuinely new/changed safety check and consumed dependency requires an observed production-path negative, exact original/mutant/restored identities and adjacent truthful Proof. Reused unchanged guards are not blanket recertified. Classification/order/dependency failures must be labeled by actual strength; masked/setup trials stay unproved.
- Own task evidence retains raw stdout/stderr, exact outer and child argv, exits/durations, tool versions and distinct .meta.json files. Editing/capture/fault drivers are part of this evidence. Protect originals, failures and exact restoration. No transcript-only gap may be concealed.
- Before each fault/final focused window request root source/index/HEAD hold. Capture complete tracked source+mode identities, new untracked source explicitly, full status/HEAD/branch, complete staged mode/blob/path identities and raw index hash separately before/after. Root releases hold only after explicit worker release and evidence audit.
- Focus affected tests once after final edits/proofs/formatting and relevant uncached static/policy checks. Never repeat a passing broad suite without a named new concern. No independent helper release/host gate; final cohesive review, printed-SHA canonical host gate and applicable CI remain open. All skipped/unavailable/unverified checks must be stated.

---

### Task 1: Extract cycle-free portable values and serialize complete turn replies

**Create production:** under apps/twilight-structure/twilight-dash/cli/src/:

- runs/value-codecs.ts: original scalar/brand instances, Integer/Positive, Ownership/OwnershipStatus, ArtifactRef, ActivityIdentity, Locator and their existing scalar parsers/arithmetic.
- agents/execution-records.ts: existing portable executor values, recovery capability/reply types and type-only aliases. Keep live session/port/UI controls and OpenReply/ResumeReply at the facade.
- agents/execution-codecs.ts: existing portable snapshot implementations and codec owners, complete TurnIdentity/Usage/TurnReply codecs and new snapshotTurnReply. ActivityDispatchError may move here and re-export unchanged constructor identity.

**Modify production:** runs/record-codecs.ts (import/re-export the exact moved instances and helpers), runs/runtime-codecs.ts (common imports from value leaf), agents/activity-executor.ts (live facade with original public exports), and exact Dash product policy as needed for agents/execution-records.ts's Burokrat type. Do not export runtime-local codecs unless consumed by a current owner. No other adapter behavior change.

**Create tests:** agents/execution-codecs.test.ts.

**Modify tests only as needed:** agents/activity-executor.test.ts (facade identity/portable reuse), runs/open-stores.test.ts (exact structural portable imports for new owners), tools/tool-devsync/src/eslint-boundaries.test.ts (exact new consumer with actual source lint). Existing test fixtures may move to agents/testing/execution-values.ts only if shared without importing another .test.ts.

**Interfaces and exact public exports:**

```ts
export function snapshotTurnReply(input: unknown): TurnReply;
// Existing signatures remain source-compatible.
export function snapshotPreparation(input: Preparation): Preparation;
export function snapshotTurnRequest(input: TurnRequest): TurnRequest;
export function snapshotExecutorLocator(input: ExecutorLocator): ExecutorLocator;
// Reusable codec instances from agents/execution-codecs.ts:
// PreparationCodec, ExecutorLocatorCodec, TurnRequestCodec, TurnIdentityCodec, UsageCodec, TurnReplyCodec.
```

Full TurnReply variants, all allowed reason/finish sets and numeric bounds are exact in
design section2 and existing activity-executor.ts. Preserve complete locator operation
correspondence and nested detachment/deep freeze. No live values or broad alias exception.

- [x] 1.1 Read actual owners/callers/tests and record clean baseline for the four existing agent tests: activity-executor, api-model-settings, api-model-turn, api-model-adapter. Add semantic RED for new complete snapshot behavior, with a test-local valid locator and all three reply variants; distinguish absent-export/compile setup failure from semantic rejection.
- [x] 1.2 Move exact codec instances and portable types/snapshots; keep facade identity. Implement strict TurnReply snapshots for every finish/uncertainty/unknown-usage reason, measured zero and safe maximum. Test unknown keys at each nested branch, invalid variants/version/identity/operation/key/owner, negative/fractional/NaN/infinite/unsafe usage, and empty/partial text preservation. Test JSON round trips and every nested output branch frozen/detached while caller objects remain editable.
- [x] 1.3 Pin original facade exports with identity assertions (e.g. expect(legacy.RunIdCodec).toBe(leaf.RunIdCodec) and expect(facade.ActivityDispatchError).toBe(portable.ActivityDispatchError)). Extend structural import audit to all three new owners using exact path-specific allowances; aggregate Burokrat canonicalization remains outside value leaf. Add exact policy consumer positive and peer/judge/relative negatives without widening agents/** or runs/**.
- [x] 1.4 From green inject isolated production faults for genuinely new reply discriminant/unknown-key/usage/identity correspondence/snapshot/freeze and dependency/policy protections. Use valid-context cases that expose actual escapes; don't sweep unchanged moved guards. Restore exact bytes in finally and retain failed/masked trials. Add adjacent Proof with actual observed test and fault.
- [x] 1.5 Format changed files and run final new codec+four agent tests, runs/open-stores.test.ts, runs/run-store.test.ts, runs/sqlite/run-store.db.test.ts, runs/runtime-history.test.ts and runs/sqlite/runtime-history.db.test.ts once from exact source paths under final hold. Run the complete effective eslint-boundaries file plus module-labels/product-constraints when policy changes; run uncached Dash lint/typecheck and tool-devsync lint/typecheck if its sources change. Changed-file format/diff and normal scoped OpenSpec validate must pass. No full package/backend/browser/build/host/CI repeat.
- [x] 1.6 Write full own report with exact RED/GREEN, all commands/faults/restorations/capture identities, source hash and self-review; explicitly release hold. Root audits then commits normally and obtains both independent task verdicts before closing this task or dispatching Task2. No Attempt1/RunStore/schema2 change in this task.

**Concrete positive test pattern:** Build a valid locator from existing branded run/attempt/operation IDs and existing accepted selection fixture, then:

```ts
const reply = {
  kind: 'completed',
  identity,
  outcome: {
    text: '',
    usage: { kind: 'measured', inputTokens: 0, outputTokens: 0 },
    finish: 'end_turn',
  },
};
const snapshot = snapshotTurnReply(reply);
expect(snapshot).toEqual(reply);
expect(snapshotTurnReply(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
reply.outcome.text = 'caller remains mutable';
expect(snapshot).not.toEqual(reply);
expect(Object.isFrozen(reply.outcome)).toBe(false);
```

Run Bun tests with cwd at exact cli/src/agents or cli/src/runs using ./source.test.ts
paths to avoid collecting generated dist files. Use existing project targets, not a new runner.
Report .superpowers/sdd/execution-history-tasks/task-1-report.md and task-1-evidence/.

**Task1 bounded acceptance:** independent spec/quality review and R1 scoped re-review approved
the codec prerequisite. Combined storage/policy commands remain failed, with distinct
focused covering passes and original timeout causes unknown. This closes only Task1's
local source/evidence work; Task2, parent6a.5 and cohesive full gates remain open.

### Task 2: Compose one versioned execution history and atomic exact claims

**Consumes:** accepted Task1 portable codecs/facade and existing readManifestBinding,
selectWorkflowActivity, WBS canonical request/state/receipt owners, runtime authority ledger
and existing semantic storage providers. Exact contracts and API signatures are design
sections3–9. The public RunStore names retain their names with the specified new versions.

**Create production** under Dash cli/src/runs/: execution-records.ts, execution-codecs.ts,
claim-records.ts, plan-claims.ts, validate-history.ts, record-preparation.ts, claim-history.ts,
sqlite/read-history.ts and sqlite/migrations/0003-execution-history/{migration.sql,down.sql}.
A focused runtime-receipt.ts is allowed solely to move/reuse the existing receipt byte
verifier once if needed; no second schema decoder or matcher.

**Modify production:** records.ts, record-codecs.ts, run-store.ts, plan-admission.ts,
plan-execution.ts, plan-signals.ts, plan-outcome.ts, plan-receipt.ts, record-execution.ts,
record-outcome.ts, record-signals.ts, runtime-records.ts, runtime-codecs.ts, plan-runtime.ts,
runtime-history.ts, testing/memory-stores.ts; sqlite/{run-store,read-executions,row-codecs,
read-signals,read-outcomes,read-runtime,runtime-store,schema,format,open-stores}.ts.
Edit exact Dash policy/effective boundary tests for new actual Burokrat/WBS consumers only.

**Tests and fixtures:** create shared testing/execution-history-contract.ts and memory
execution-history.test.ts/SQLite execution-history.db.test.ts plus focused
record-preparation.test.ts and claim-history.test.ts. Modify testing/fixtures.ts and
shared execution-contract/execution-edge-contract/execution-command-contract,
outcomes-contract/outcome-collision-contract, signals-contract/signal-edge-contract,
receipts-contract, verified-operations-contract/verified-signals-contract and their
existing memory/SQLite entrypoints. Adapt exact fixture/schema/revision expectations
reached in open-stores.test.ts and sqlite/{execution-integrity,signal-integrity,
capacity-integrity,outcomes,signals-receipts,snapshot,admission-races,runtime-races,
open-stores,runtime-history}.db.test.ts. Preserve each existing invariant purpose.
Exact additional callers inspected before authorization: admission.test.ts changes only Attempt unsupported versions to1/3 and unknown state to {kind:'unknown'}; testing/run-store-contract.ts changes the two queued expectations to {kind:'queued'}. Actual final-run failure533 additionally authorizes sqlite/run-store.db.test.ts to update only the public-read and reopen expected capacity corruption message to the shared-history diagnostic, preserving both rejection assertions. Preserve all other version1 negatives, invariant purposes and returned-object detachment mutation.
Other caller edits need named actual evidence first. Never edit0001/0002 or WBS SQL.

- [ ] 2.1 Read shared planners/provider transactions/callers and preserve exact old SQL/protected identities. Add semantic RED in shared conformance for queued→preparing→prepared→claiming→ready→turn_pending→turn_returned with exact revision increments and missing/mismatched predecessor refusal. Build new accepted-binding+real WBS artifact fixtures through actual APIs, keeping generic createManifest unchanged.
- [ ] 2.2 Implement Attempt2/checkpoint/recovery and strict command/ack codecs, explicit version2 RunSnapshot/local delivery adaptations and complete history API. Preparation verifies retained binding/selection/exact kind pin and actual state target; full locator/owner correspondence is retained before claiming. No nullable side state, claim-first path or live executor calls.
- [ ] 2.3 Implement shared pure stageClaim/recordClaimAcceptance/stageTurn rules and both provider atomics. Guard current owner then audit then global local-command identity/replay, then fresh revisions. Preserve unbounded wire IDs, one local association per wire stage/accept, original paired replies, target/basis/parent/session correspondence, existing pending serialization and authority generation semantics. Actual abort triggers and separate-process before/after COMMIT prove both halves/counters/reservations/reopen; no power-loss assertion.
- [ ] 2.4 Implement verified recordPreparation/stageClaimRequest/acceptClaimReceipt/readExecutionHistory and adapt recordExecution to exclude preparation bypass. Snapshot before awaits; actual artifact bytes, fatal UTF-8/JSON, existing full state/receipt schema and matcher, independent digest and projection comparison. Test missing/unreadable/malformed state, wrong selected step/nullable code, duplicate target rows, compatible wire extras, coherently forged local generated IDs, mutable caller/Buffer replies and original cause. No async work inside SQL or authenticity claim.
- [ ] 2.5 Compose one nonrecursive cross-history audit for all public reads/replay/mutations/reopen. Fold scope first, attempts with immutable event index second, bidirectional links and final projection/reservation last. Merge consumption/completion/receipt by actual resulting revision and compare all original acknowledgements. Retain CompletionRecord1/original Attempt2 reply in existing completion JSON; expose it through history, validate from its true predecessor and preserve commitOutcome current-snapshot duplicate behavior. Cover stored reply tampering, later receipt/takeover and illegal post-settlement order. Test loss/gap/reorder/forged reply and indexed-history deletion behind reset projection; state explicit coherent all-evidence deletion limit. SQL reply revision uses $.attempt.revision. Store ExecutionRecord1 with provider-owned scope context independently from the reply; rebuild scoped acknowledgements against the exact complete historical prefix and derived per-attempt causal lower bound, never today's grant. Cover older same-epoch grant substitution, pending-prefix refusal, replay after scope advance/takeover, context-before-claim and backward continuation context. Retry identity excludes generated context and current guard revisions. Enforce preparation epoch >= admittedEpoch, stage epoch >= retained attachment epoch and same-epoch stage/reattachment label consistency. One independently seeded scope lower-bound guard owns both before-claim and later-backward cuts; use distinct nonpending valid-prefix negatives and isolated proofs, preserving predecessor checks and late old-owner observations.
- [ ] 2.6 Preserve session/claim through exact decision continuation, waits and settlement; not_started returns same cause but retains key/payload; unresolved retains pending turn. Late opened replies keep preparation owner, old attachment blocks new turn, fresh supported reattachment changes only attachment within precise checkpoint/wrapper, and late turn reply retains original owner. Exact actual opened observations resolve direct/wrapped preparing to prepared; exact acceptance resolves direct/wrapped claiming to ready(initial), preserving session/attachment provenance. Exact completed/not_started turn observations resolve direct/wrapped pending turns; unresolved retains the pending checkpoint. Reattachment alone preserves unresolved. Fresh staging remains direct prepared/ready only. Cover all three predecessor paths and wrong checkpoint/identity without inferring a live session. Claimed retries refuse pending future release; preclaim proven-absent retry remains. Test measured/unknown/partial turn reply history after later transitions and reopen.
- [ ] 2.7 Append complete named format3/0003 pair without changing old SQL. Genuine1/2 opens reject read-only before WAL/sidecars. Bootstrap/physical reference use complete fail-fast statements; metadata update is no-op on empty reference. Down under complete prevalidation/explicit transaction refuses any attempt/new execution or non-authority runtime history, restores exact known format2 bundle identity and allows compatible authority-only histories/generic runs. Test rollback first-error restoration and malformed required markers, not whole-script continued execution. Run actual migration lint for pair.
- [ ] 2.8 Inject actual isolated production faults for every genuinely new/changed guard and consumption edge: ordering/pin/target, scope+attempt one-sided atomics, pending/identity/replay/provenance/current grant, claim projection versus artifact, complete turn identity/payload/usage, continuation/capacity, cross-history links/original replies/independent scope context/prefix and causal bounds, old-format/read-only/down/physical format and exact policy. Preserve all attempts and observed strength, restore exactly and add truthful adjacent Proof.
- [ ] 2.9 Keep timer-sensitive RunStore tests, effective policy checks and static work in separate sequential groups on this host; Task1 timed out during overlap and once in isolation, so the original cause remains unknown and no limit is changed. Prepare real Nx graph, changed-file format/diff/normal scoped OpenSpec and relevant uncached Dash/tool-devsync static/policy checks. After final edits/proofs/format, run complete source RunStore tests once with cwd cli/src/runs, exact file inventory and full immutable hold capture; include four agent suites only if changed or a named dependency concern. For the two existing outcome SIGKILL cases, separate measured real child startup into per-case bounded beforeAll with existing15000ms phase bound, preserving5000ms crash-case limit/10000ms barrier/all assertions; record PID/lifecycle, clean failed setup and retain original timed-out runs. After failed533, separately bound admission startup at15000ms and snapshot startup at10000ms, preserving5000ms bodies and10000ms go/COMMIT/operation bounds. The snapshot writer must actually commit between catalog run-row and attempt-row reads; consume its atomically published real reply and preserve all exit/state assertions. Require finite helper failures and a separately bounded read-transaction dependency sample, with actual classification and original533 failures retained. No combined5000ms-path pass is inferred from setup separation. Report all outputs/counts/warnings/skips/unverified full gates; self-review and release hold. Root audits, commits normally and obtains both task verdicts, then whole-phase review before local checkbox closure.

**Exact operation call pattern (version names in design):**

```ts
const staged = await runs.stageClaim(scopedGuard, {
  version: 2,
  kind: 'stage_claim',
  commandId: localStageId,
  canonicalRequest,
  observation,
});
if (staged.kind === 'refused') throw new Error(staged.reason);
const accepted = await acceptClaimReceipt(runs, artifacts, currentScopedGuard, {
  commandId: localAcceptId,
  intent: staged.value.intent,
  evidence,
});
// Helpers construct guards from returned snapshots; tests narrow StoreReply before value access.
const turn = await runs.stageTurn(nextScopedGuard, {
  version: 2,
  kind: 'stage_turn',
  commandId: localTurnId,
  request,
});
// This retains intent only. No executor.turn or WBS sender is invoked.
```

Report .superpowers/sdd/execution-history-tasks/task-2-report.md and task-2-evidence/.
Root owns source acceptance, final cohesive review/exact-SHA gates and later publication.
No closure of either task certifies production host order, exact writes/releases, S0/S7a,
revocation/re-pinning, main integration or deployment.
