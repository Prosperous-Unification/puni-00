# Conditional Runtime Receiver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, with independent task review and final whole-branch review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver receiver-owned exact conditional WBS writes with coherent compact preconditions and permanent payload-bound acceptance under S0.05–S0.07.
**Architecture:** Six slices build real application/store boundaries before mounting the complete runtime API. Reuse the existing command UoW and current authorization; ledger continuity is explicit and independent of local RunStore epochs.
**Tech Stack:** TypeScript, Bun, Nx, ArkType/shared HTTP contracts, existing Digest adapter, memory/SQLite sources and existing migration runners; no new packages.
**Spec:** Read [receiver-design.md](receiver-design.md) and [the owning bridge requirements](specs/twilight/wbs-run-bridge/spec.md) together. The spec is binding.

## Global constraints

- Read LLM_README/AGENTS and the owning accepted requirements at dispatch; adoption baseline is `79f4dcdd97ba2111170558b71965899212171859`; read current callers and tests before behavior changes.
- Preserve ordinary API behavior, existing authorization and all excluded auth/credential/org-limit/provider/activation/cross-project/CTT ownership. No live credential, paid model or external service call.
- Receiver scope is organization/project/person; session ID is the existing claim run; local runtime attempt is not WBS business attemptNumber. Continuation/reattachment preserves the same runtime attempt/session/claim. A genuinely new attempt retains its logical operation but requires predecessor quiescence/effect reconciliation, guarded exact release, then a new claim under normal eligibility/current basis; it cannot rebind the old claim. Takeover never automatically releases claims or proves physical quiescence; another holder may win the release/reclaim gap.
- Expected refusals are typed. Trusted missing/malformed/unreadable state throws. Current authorization precedes receipt replay. Only accepted commands get durable receipts; exact replays do not reapply effects.
- Four transactional tables and expectedLedgerId are required. No missing-schema bootstrap at normal read/open, no reset/admin tool, no down after retained history, no cross-project snapshot guarantee.
- No mounted route until its complete guarantee exists. Application/store APIs may be useful intermediate deliveries; never expose fake uninitialized authority, fake receipts or exported throwing stubs.
- Every safety guard has a production-path negative and a watched fault-removal/dependency-break proof. Other guards must be valid so they cannot mask that proof. Record actual red/green/proof output in owning verify.md; these proposed snippets are not evidence.
- All commands below run from repository root. Every explicit Bun test path begins `./` to prevent discovery of generated dist tests. Nx commands use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` and `--skip-nx-cache`. Do not run raw full Nx gates on h2; the final exact-SHA gate remains `bin/h2puni-gate.sh <sha>` under its host lock.
- Test helpers may only construct real memory/SQLite sources, existing actor/person/project fixtures and requests; they must not implement admission, hashing, receipts or rollback. Use existing `claim-command.test.ts`, `claim-race.db.test.ts`, `claim-identity.controller.db.test.ts` and mounted contract tests as setup references.

## File ownership and interface convention

`domain/` = `libs/wbs/domain/domain/src/`; `contracts/` = `libs/wbs/domain/contracts/src/`; `core/` = `libs/wbs/application/core/src/`; `sqlite/` and `memory/` = corresponding adapter `src/` directories. Paths in commands are fully expanded.
Real SQLite/application integration tests live in the backend app, which can compose core and adapters without library-to-app imports or a core/SQLite dependency cycle. Pure descriptor/canonical-envelope tests stay in their owning domain/core library. These application tests do not imply mounted HTTP acceptance; Task6 owns that evidence.
Shared public semantic values live in `contracts/runtime-command-values.ts`; final endpoint validation lives in `contracts/http/runtime-command-shapes.ts`. Core trusted composition/context and store records stay in core. Use existing module exports and module-index/typecheck conventions where applicable; do not add a generic runtime engine.
`RuntimeContext` is `{projectId,personId,actor:AuthenticatedUser,access:ResourceAccess}` using existing types. All application methods return a declared success/refusal union and throw trusted faults. Wire status/body mapping uses existing refusal shapes; do not manufacture a second authorization system. Legacy access returns typed HTTP403 `runtime_scope_unavailable`; ordinary legacy APIs retain their behavior.

### Task 1: A coherent local observation and canonical basis — S0.05

**Files:** Create `domain/runtime-basis.ts`, `domain/runtime-basis.test.ts`, `core/module/plan-commands/runtime-state.ts`, `apps/wbs/be-01/src/controller/runtime-state.db.test.ts`, and the needed values in `contracts/runtime-command-values.ts`; update their existing export/module manifests. Modify admitted composition only to expose coherent local reads, not write/receipt capabilities. Extend `core/ports/fanout-capture-store.ts` with borrowed `resolveProjectWriteScope(projectId, organizationId, actorId)` returning current `OrganizationScope` or typed not_found/forbidden. Factor the existing pure SQLite project/membership decision in `sqlite/fanout-capture.ts` into that resolver, bind it in `sqlite/source.ts`, and preserve ordinary authorizeProjectUpdate behavior. Add focused SQLite regressions as needed. Existing legacy fixture sources may omit this capability; runtime consumption throws when absent.

**Interfaces:** Produce `RuntimeBasisInput = {ledgerId,organizationId,projectId,projectRevision,workItems:readonly {id,revision}[]}` and `describeRuntimeBasis(input:RuntimeBasisInput):string` in domain; `digestRuntimeBasis(input,digest:Digest):Promise<RuntimeBasis>` in core. Produce `captureRuntimeObservation(context:RuntimeContext):Promise<RuntimeObservation|RuntimeReadRefusal>`: observation contains server-derived scope, project revision, complete local rows `{id,parentId,revision,externalRefs}` and steps `{id,code,position}`. External refs retain `{id,systemId,url,name}`. Its authorization uses current scoped project/person rules. It has **no ledger-authority claim**: the separate descriptor accepts an explicit trusted ledgerId; actual ledger inspection arrives in Task2/3.

- [x] Write failing pure-byte and real admitted-read tests. Pin the exact `['wbs-runtime-basis',1,ledgerId,org,project,revision,pairs]` bytes; rows are sorted without mutating input. Reordering is stable, changing any covered identity/revision/membership is not. Duplicate IDs, absent values and unsafe/negative counters throw.
- [x] Run the focused command below and observe the intended missing implementation failure. Build the descriptor, digest composition and admitted raw observation. Consume borrowed `projects.findInOrganization`, `workItems.listByProject`, `steps.listByProject`; do not call the public tree scheduler/optimizer inside the transaction.
- [x] Prove a queued admin demoted to member cannot retain the old person-binding bypass: use the fresh resolved role inside admitted capture, not the incoming access role. Use actual configured SQLite for scoped application authorization; memory fixtures do not have a current membership authority and must not fabricate one.
- [x] Prove real claim/progress/ref/topology edits change the captured basis; a blocked transaction cannot expose partly written facts through this read. Use the real source coordinator, not a fake delayed snapshot.
- [x] Watch removal of a descriptor field and bypass of admitted capture fail their respective production-path tests, with all unrelated validation valid. Restore guards, add adjacent Proof comments, record evidence, rerun focused checks.

```ts
// Oracle excerpt; actual test uses the production descriptor and real Digest adapter.
expect(
  describeRuntimeBasis({
    ledgerId: 'ledger-a',
    organizationId: 'org-a',
    projectId: 'project-a',
    projectRevision: 2,
    workItems: [
      { id: 'b', revision: 4 },
      { id: 'a', revision: 3 },
    ],
  }),
).toBe('["wbs-runtime-basis",1,"ledger-a","org-a","project-a",2,[["a",3],["b",4]]]');
```

```sh
bun test ./libs/wbs/domain/domain/src/runtime-basis.test.ts ./apps/wbs/be-01/src/controller/runtime-state.db.test.ts --timeout=10000
bun test ./libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts ./apps/wbs/be-01/src/controller/command-organization.controller.db.test.ts --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-domain,wbs-contracts,wbs-core,wbs-store-sqlite,wbs-be-01 --skip-nx-cache
```

**Reviewable exit:** Genuine observation and canonical basis APIs; no runtime HTTP route, fake grant or receipt. Confirm basis coverage and planned field names in design before proceeding.

### Task 2: Durable ledger, bindings and accepted-record storage — S0.06/S0.07

**Files:** Create `core/ports/runtime-command-store.ts` and record types; `sqlite/runtime-command.ts`, `runtime-command.db.test.ts`, `runtime-ledger.db.test.ts`; `memory/runtime-command.ts` and tests. Modify `core/ports/stores.ts`, the explicit borrowed-store getters in `core/module/plan-commands/working-plan.resource.ts`, SQLite `build-stores.ts`, `schema.ts`, source composition, memory state/bindStores/source; add shared source conformance cases and the corresponding family/capability/opener registration in `libs/wbs/application/conformance/src/`. Add one uniquely timestamped `apps/wbs/be-01/drizzle/<allocated-at-implementation>_add_runtime_commands/migration.sql` and `down.sql`. Timestamp is allocated during this task; inspect the current migration list at implementation.

**Interfaces:** Produce `RuntimeLedger = {schemaVersion:1,ledgerId,authorityCount,bindingCount,receiptCount}`, `RuntimeScope`, `RuntimeAuthority`, `RuntimeClaim` and `StoredRuntimeAcceptance` exactly as design. `RuntimeCommandStore` methods: `inspectLedger():Promise<RuntimeLedger>`; `assertAbsentHistory():Promise<void>`; `readAuthority(scope):Promise<RuntimeAuthority|null>`; `compareAuthority(scope,expectedGeneration:number|null,ownerId:string):Promise<RuntimeAuthority|null>`; `readBinding(scope,claimId)` and `readAttemptBinding(scope,storeId,attemptId)` returning `RuntimeClaim|null`; `insertBinding(scope,claim):Promise<void>`; `readAcceptance(scope,commandId):Promise<StoredRuntimeAcceptance|null>`; `insertAcceptance(stored):Promise<void>`. Mutation methods atomically update retained-row counts under their existing borrowed UoW. This is trusted storage, not business admission.

- [x] Write failing real-source tests for CAS, unique command identity, unique runtime attempt binding, immutable retained rows, rollback and reopen. Type record variants now for authority/claim/write; no placeholder acceptance values escape production.
- [x] Implement four tables: `runtime_ledger` singleton plus `runtime_authority`, `runtime_claim_binding`, `runtime_command_receipt`. Migration alone creates a random ledgerId. No FK cascade may erase retained scope history on ordinary claim/project/person deletion. Register both real providers with existing UoWs.
- [x] Test runtime-capability opening and operation integrity (generic source construction currently precedes optional startup migration; inspection must follow that explicit migration): migration record, exact required constraints, singleton, counters and actual row counts. Missing/unreadable/malformed state throws; missing scope in a valid ledger is allowed. Recreated-empty record tables with retained counts fail; schema-cookie change triggers reinspection; authoritative absence rechecks counts even without DDL. Existing-file recovery does not create a missing database.
- [x] Implement down.sql's named SQL CHECK before any DROP: valid marker + zero counters + zero actual history rows. Test unused down/up/new ledgerId and refusal with any retained authority/binding/receipt, including released claims. Down failure preserves that migration's schema and name/hash; do not assert all newer already-reversed migrations are restored.
- [x] Watch constraint removal, transaction escape, counter-update omission, inspection removal and down-guard removal fail targeted real-source/CLI paths; restore and record evidence. No fake pre-call throw counts as a rollback proof.

```ts
// Actual rollback helper over an on-disk source containing a real accepted-record fixture.
expect(() => rollbackTo(dbPath, migrationFolder, previousMigration)).toThrow('runtime history');
expect(readAppliedMigration(dbPath, runtimeMigration)).toEqual(beforeAppliedMigration);
// readAppliedMigration is a test-only SELECT observation, not a replacement rollback implementation.
```

```sh
bun test ./libs/wbs/adapters/store-sqlite/src/runtime-command.db.test.ts ./libs/wbs/adapters/store-sqlite/src/runtime-ledger.db.test.ts ./libs/wbs/adapters/store-memory/src/runtime-command.test.ts --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-core,wbs-store-sqlite,wbs-store-memory --skip-nx-cache
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run wbs-store-sqlite:test:conformance --skip-nx-cache
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run wbs-store-memory:test:conformance --skip-nx-cache
```

**Reviewable exit:** Real persistent primitives/lifecycle. Task3 replaces storage fixtures with accepted application operations in lifecycle regression coverage; no public route or claim that raw insert proves business acceptance.

### Task 3: Receiver authority and authorized receipt lookup — S0.07

**Files:** Create `core/module/plan-commands/runtime-authority.ts`, `apps/wbs/be-01/src/controller/runtime-authority.db.test.ts`, `core/module/plan-commands/runtime-request.ts` and canonical-envelope tests; extend admitted-scope/composition with the narrow borrowed runtime capability. Extend SQLite runtime tests. Update shared semantic request/receipt values in `contracts/runtime-command-values.ts`.

**Interfaces:** Consume Task1 observation/digest and Task2 store. Produce `acquireRuntimeAuthority(context, request):Promise<RuntimeReply<AuthorityReceipt>>`, where request is `{schemaVersion:1,commandId,expectedLedgerId,ownerId,expectedGeneration:number|null}`; `lookupRuntimeReceipt(context,{commandId,expectedLedgerId}):Promise<RuntimeReply<RuntimeReceipt>>`; and `readRuntimeState(context,{expectedLedgerId?:string}):Promise<RuntimeReply<RuntimeState>>`. `RuntimeState` is `{schemaVersion:1,ledgerId,scope,basis,facts,authority:{kind:'uninitialized'}|{kind:'held',ownerId,generation},claims}` with explicit ordinary/runtime bindings. `RuntimeReply<T>` is `{ok:true,value:T}` or a closed runtime/existing refusal arm. `canonicalRuntimeRequest(scope,operation):string` emits a strict fixed-key canonical envelope; operations include the final authority/claim/write fields in design, with ordered arrays unchanged. No public transport yet.

- [x] Write failing application tests using real SQLite for scoped application authorization, actor/person bindings and existing access resolution; memory covers storage semantics only unless a genuine scoped authority capability is separately implemented. Unauthorized current actor fails before replay; acquisition also requires the verified actor’s write scope before admission/replay and preserves the existing `{ok:false,error:'insufficient_scope'}` arm rather than project-role `forbidden`. Snapshot request scope evidence synchronously; state/lookup keep Task1 project/person checks and Task6 supplies existing read-scope HTTP enforcement. Legacy context is explicitly refused under the adopted scoped-only contract. Missing capability/trusted ledger throws.
- [x] Implement ledger comparison, durable exact replay, current receiver CAS and receipt insertion inside one admitted transaction. Task2 stores canonical bytes opaquely; this layer checks their digest and stored receipt correspondence before using a retained acceptance, and throws on trusted corruption rather than returning an ordinary command conflict. `ownerId` is not authentication. `null` expected generation is only a valid absent scope after integrity checks. Missing receipt is checked under current authorization and count validation.
- [x] Prove racing acquisitions admit one; acquisition response lost then exact retry after later takeover returns historical generation without reacquiring. New ID plus stale generation refuses; same ID changed owner/payload/operation refuses. Takeover preserves existing WBS claims and bindings; these tests cannot establish executor quiescence or justify releasing local execution capacity.
- [x] On real SQLite, fail actual receipt INSERT after the generation/count writes, then assert generation, receipt and counters rolled back. Update Task2 down test to first accept through this service; released-all-claims still does not permit rollback.
- [x] Watch current-auth, ledger-pin, replay-payload and CAS guards each fail independently when removed. Old pin after unused down/up returns `runtime_ledger_mismatch`, never uninitialized/not-found. Record red/green and restored proofs.

```ts
const first = await receiver.acquireRuntimeAuthority(context, acquisition);
await receiver.acquireRuntimeAuthority(context, takeover);
expect(await receiver.acquireRuntimeAuthority(context, acquisition)).toEqual(first);
const state = await receiver.readRuntimeState(context, { expectedLedgerId });
if (!state.ok) throw new Error('Expected current runtime state');
expect(state.value.authority).toEqual({ kind: 'held', ownerId: takeover.ownerId, generation: 2 });
// Requests use the real ledger ID; acceptance and refusal paths are both asserted separately.
```

```sh
bun test ./apps/wbs/be-01/src/controller/runtime-authority.db.test.ts ./libs/wbs/application/core/src/module/plan-commands/runtime-request.test.ts ./libs/wbs/adapters/store-sqlite/src/runtime-command.db.test.ts ./libs/wbs/adapters/store-sqlite/src/runtime-ledger.db.test.ts --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-core,wbs-contracts,wbs-store-sqlite,wbs-store-memory,wbs-be-01 --skip-nx-cache
```

**Reviewable exit:** Genuine ownership, state and acceptance reconciliation application methods. No WBS runtime mutation yet and no historical receipt treated as a current grant.

### Task 4: Exact conditional claim acquisition — S0.06

**Files:** Extend `core/module/plan-commands/{plan-commands.feature,admitted-scope.resource,composition,runtime-authority,runtime-request}.ts`; create the narrow `core/module/plan-commands/runtime-claim.ts` capability and `apps/wbs/be-01/src/controller/runtime-claim.db.test.ts`; extend SQLite `runtime-command.db.test.ts` and semantic request/receipt values. Keep existing `runWithin/runAfterWithin` behavior intact.

**Interfaces:** Produce `claimRuntime(context, request):Promise<RuntimeReply<ClaimReceipt>>`. Request is `{schemaVersion:1,commandId,expectedLedgerId,authority,expectedBasis,action:{kind:'claim',workItemId,stepId,parentClaimId,execution}}`; exact execution is `{storeId,runId,attemptId,sessionId}`. Success acceptance is `{kind:'claim',authority,claim,basisAfter}` in the common receipt envelope. Consume real authority/replay/canonicalization from Task3 and ledger/digest from Tasks1–2. No generic write method returning a temporary unsupported stub.

- [x] Write failing production runner tests: current authority and basis required; existing unbound ordinary holding cannot be adopted through alreadyHeld; a prior binding of `(scope,storeId,attemptId)` refuses allocation of another claim. A different runtime attempt cannot reuse/overwrite an existing runtime-bound claim through alreadyHeld, including when person/session match. Session syntax and existing person/resource/domain refusals retain their semantics.
- [x] Extend the existing execute/UoW path with pre-admission and post-apply receipt work; reuse `applyAll`, journaling and committed fanout. Compile precisely one leaf/step claim with WBS run=session and optional parent. After applying, read the exact target claim in the same transaction rather than trusting the broad alreadyHeld claimIds reply. Persist its binding and final basis/receipt before commit.
- [x] Through the real runner, first bind attempt A; try attempt B against the still-held claim with a fresh basis/current grant and the same person/session: typed `runtime_claim_mismatch` leaves A’s claim/binding unchanged. After guarded exact release (Task5 integration case), B must acquire a newly minted claim ID; A’s immutable binding remains retained. This tests receiver identity behavior, not executor quiescence.
- [x] Test stale basis after a competing claim returns the explicit conditional conflict; ordinary claim path remains unchanged. Current-auth-before-replay holds after completion. Exact retry after later progress returns its original precise claim, no new journal/revision/fanout.
- [x] Fail actual receipt INSERT after claim and in-progress writes: claim, progress, binding, counters, revision, journal and captured fanout roll back. Suppressing post-commit reply leaves acceptance recoverable after reopening. Remove guards one at a time with all unrelated guards valid; restore and record proofs.

```ts
const accepted = await runner.claimRuntime(context, claimRequest);
await ordinaryCommands.runWithin(projectId, actorId, laterProgress, access, credential);
expect(await runner.claimRuntime(context, claimRequest)).toEqual(accepted);
expect(await readJournalCount()).toBe(journalCountAfterLaterProgress);
// The ordinary command call is the existing real runner, not a fixture mutation of state.
```

```sh
bun test ./apps/wbs/be-01/src/controller/runtime-claim.db.test.ts ./libs/wbs/application/core/src/module/plan-commands/claim-command.test.ts ./libs/wbs/adapters/store-sqlite/src/runtime-command.db.test.ts --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-core,wbs-contracts,wbs-store-sqlite,wbs-be-01 --skip-nx-cache
```

**Reviewable exit:** Real revision-bound, exact-identity claim admission plus durable acceptance; no ordinary release/progress contract silently changed.

### Task 5: Exact claimed mutation batches — S0.06

**Files:** Extend the same conditional runner and borrowed runtime composition/authority; extract shared claim/write preflight and receipt persistence into `core/module/plan-commands/runtime-command.ts`, retain claim-specific checks in `runtime-claim.ts`, and add exact write checks in `runtime-write.ts`. Create `apps/wbs/be-01/src/controller/runtime-write.db.test.ts`; extend SQLite `runtime-command.db.test.ts`, shared restricted command values and canonical-envelope coverage. Avoid unrelated command refactors.

**Interfaces:** Produce `writeRuntime(context, request):Promise<RuntimeReply<WriteReceipt>>`, request `{schemaVersion:1,commandId,expectedLedgerId,authority,expectedBasis,action:{kind:'write',claim,commands}}`. `commands` is the strict subset described in design: same-step setProgress, token_actual setMeasure, externalRefs-only patch, same-person/step release last. Success acceptance is `{kind:'write',authority,claim,basisAfter,applied:readonly {index,kind}[]}` in the immutable receipt. Consume Tasks1–4; no new engine/credential/pin persistence port.

- [x] Write failing tests for mismatched claim ID/target/person/parent/session/runtime identity, stale receiver generation and stale basis. Exact checks require the current live claim as well as immutable historical binding. A progress batch with no measure command leaves any prior measure unchanged; an explicit measured zero remains a valid value. Converting measured/unknown executor usage into commands is a later bridge responsibility, not something this receiver can infer.
- [x] Implement restricted batch validation and exact preconditions inside the existing transaction, then reuse business command execution/journal/fanout and final acceptance from Task4. Reject empty/unsupported/cross-target batches and commands after release. Whole-list ref replacement remains unchanged under the basis guard.
- [x] Prove stale same-person release of claim A leaves replacement B intact **with a fresh basis/current grant**. Prove g cannot mutate the same unchanged claim after g+1 with a fresh basis. Prove stale ref replacement preserves concurrent refs. Add a complete real-runner sequence: A is guarded-released, B acquires a new claim for a new runtime attempt, then a fresh-ID stale release naming A with a fresh basis/current grant cannot touch B. Preserve both immutable bindings. Separately insert a competing holder between release and retry and require the ordinary eligibility/holder refusal, without rollback or automatic reclamation of that holder. The test does not synthesize predecessor quiescence; establishing that before release remains the coordinator/executor obligation. Every guard-removal proof isolates that guard, not a different earlier refusal.
- [x] Exact retry after release/later state returns original receipt without another mutation/journal/revision/fanout; altered command order/content/authority/basis under the ID conflicts. Real receipt-INSERT abort rolls all mutation and marker counts back. Replay never updates counts. Restore removed checks and record evidence.

```ts
const before = await claimStore.findById(projectId, replacementClaim.claimId);
const refused = await runner.writeRuntime(context, staleReleaseWithFreshBasis);
expect(refused).toMatchObject({ ok: false, reason: 'runtime_claim_mismatch' });
expect(await claimStore.findById(projectId, replacementClaim.claimId)).toEqual(before);
```

```sh
bun test ./apps/wbs/be-01/src/controller/runtime-write.db.test.ts ./apps/wbs/be-01/src/controller/runtime-claim.db.test.ts ./libs/wbs/adapters/store-sqlite/src/runtime-command.db.test.ts ./libs/wbs/adapters/store-sqlite/src/external-ref.db.test.ts --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-core,wbs-contracts,wbs-store-sqlite,wbs-store-memory,wbs-be-01 --skip-nx-cache
```

**Reviewable exit:** Complete safe application-side runtime command contract. Ledger and current-auth checks remain before any accepted replay.

### Task 6: Complete routes, shared client and transport reconciliation — parent5/S0.06

**Files:** Create `contracts/http/runtime-command-shapes.ts` + shape/client type tests; `core/http/runtime-command.routes.ts`; `apps/wbs/be-01/src/controller/runtime-command.controller.db.test.ts`; update existing HTTP composition/export/OpenAPI registration, semantic shape/type correspondence and runtime readiness boot validation. Add `apps/wbs/be-01/src/runtime-command.boot.db.test.ts` and extend existing boot/lifecycle tests for the explicit asynchronous pre-listen readiness dependency, including retention ordering. Add `contracts/http/runtime-command-client.test.ts` for the existing `clientFromShapes/fetchTransport` path. Do not add speculative Dash credential or durable-pin interfaces in this receiver packet.

**Interfaces:** Mount all four final routes in design, backed by Tasks1–5. Define endpoint symbols `readRuntimeState`, `acquireRuntimeAuthority`, `applyRuntimeCommands`, `lookupRuntimeReceipt`; strict requests and versioned immutable success bodies. Public reads expose real authority/bindings and the rb1 basis. Explicit expectedLedgerId is mandatory for mutations/lookup and optional only for state discovery. Consume current OrganizationAccess and AuthenticatedUser exactly as ordinary mounted endpoints do, with admitted rechecks. Shared-client callers inject headers and an already durable expected pin; the packet does not invent its storage.

- [ ] Write failing mounted tests through real SQLite/boot fixtures for current authorization before replay, foreign project indistinguishability, legacy runtime refusal, malformed pin/basis/version/request keys and complete valid replies. No route is mounted with an unimplemented application method. Missing conditional routes fail closed; no fallback to ordinary commands.
- [ ] Mount/validate all routes and integrate awaited runtime ledger inspection after explicit migrations and before listener/background-resource startup, using an explicit boot-local readiness dependency and existing DI disposal. Prove the held asynchronous interval cannot serve requests or start retention/optimizer/proof workers. Preserve occupied-port ownership, cleanup after acquired-listener failure and shutdown ordering. Retain ordinary paths and responses. Tighten final type fixtures so missing required pin/claim fields cannot compile; never widen unknown JSON into a success union.
- [ ] Through the real shape-derived client and mounted app, commit then drop only the transport response; reopen and lookup/replay the original acceptance. Delay old-generation dispatch until takeover commits and prove it refuses. No paid/network backend is needed; in-process transport passes real requests to the app.
- [ ] Prove receipt absence before fencing is inconclusive; same-pinned intact ledger after fencing prevents delayed old writes and permits receiver nonacceptance classification. Missing/malformed ledger throws; unused down/up makes old pin mismatch before absence/replay. A fully reconstructed valid ledger must not inherit the old pin.
- [ ] Client cancellation/malformed JSON/unexpected status after dispatch remains failure/unknown, not a domain refusal or nonacceptance. Remove actual response/pin/auth guards and watch mounted/client negatives fail. Record proofs, fresh focused checks and proposed gate evidence; do not claim local durable intent retention or executor quiescence is proved by these client tests.

```ts
// The transport calls app.handle(request), awaits its real successful commit, then loses the reply.
const lost = await client.applyRuntimeCommands({ params, body, headers });
expect(lost.kind).toBe('failure');
const recovered = await reopenedClient.lookupRuntimeReceipt({
  params: receiptParams,
  query,
  headers,
});
expect(recovered.kind).toBe('success');
// Assert full stored acceptance and unchanged journal/revisions after an exact retry, not only status.
```

```sh
bun test ./libs/wbs/domain/contracts/src/http/runtime-command-shapes.test.ts ./libs/wbs/domain/contracts/src/http/runtime-command-client.test.ts ./apps/wbs/be-01/src/controller/runtime-command.controller.db.test.ts --timeout=10000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p wbs-contracts,wbs-core,wbs-be-01,wbs-store-sqlite,wbs-store-memory --skip-nx-cache
./node_modules/.bin/openspec validate twilight-agentic-workflows --json
```

**Reviewable exit:** Receiver HTTP/client contract and real lost-response acceptance evidence. Dash RunStore pin/grant mapping, credential acquisition, executor session ordering and CTT successor settlement remain explicitly separate integration prerequisites; parent5/6a.5–7 are not wholly complete. Future exact-SHA gate is required before a repository completion claim.

## Plan self-review and commands

The project target names/options above were read from actual project.json files. Commands are proposed and were not run. Do not use `openspec --strict` as an expected-green command: the current change had seven known long-requirement warnings; adoption must record current output without blanket cleanup. Keep aggregate contract/unit target discovery separate from these anchored focused file commands; existing target internals are not changed in this packet.

A reviewer may accept a slice's real internal contract without exposing unfinished HTTP behavior. Reject any change that returns fabricated ledger state, bypasses current auth on duplicate, treats a local epoch as a receiver grant, heals missing trusted schema, or claims fake backend/host conformance as production recovery proof. ADRs 0058 and 0059 record the adopted decisions. Task2 allocates the migration timestamp after inspecting current migration names.
