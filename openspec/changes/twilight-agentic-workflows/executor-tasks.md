# API-model Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with independent task and final whole-branch review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the shared executor contract and a real, locally testable API-model adapter without claiming durable dispatch integration or live authorization.

**Architecture:** Resolve accepted Burokrat selection against injected SDK capabilities, execute through a production SDK turn driver, and compose that driver with process-local conversation/session lifecycle. Recovery methods state unsupported; no fake backend or coordinator is a deliverable.

**Tech Stack:** Bun, TypeScript, existing `ai@7.0.118`, shipped `ai/test`, Burokrat contracts and Dash run identity codecs. No dependencies added.

**Spec:** [executor-design.md](executor-design.md) and the owning [activity-execution delta](specs/twilight/activity-execution/spec.md). Read both before implementing; the spec is binding.

## Global Constraints

- Adopted base is `6f09b11fc638c36c3d90747b98a0eabd63147c0e`, containing independently reviewed and exact-SHA-gated binding and storage. This plan records no implementation completion.
- Root owns commits, tracked planning/checklists/verify and final integration. Implementers own source/tests and ignored per-task reports/evidence; one implementer is active at a time.
- Exactly five port kinds; only api-model gets a concrete adapter. No network, paid prompts, missing-package imports, environment credential reads, provider factory/registry implementation, WBS/RunStore writes, CTT changes or tenant-policy work.
- Static selection is not retained-manifest or approval/budget authority. SDK automatic retries are zero; unknown usage is never zero. A close/cancel acknowledgement is not quiescence.
- New attempt requires a new exact WBS claim after predecessor reconciliation/quiescence and guarded release; continuation preserves attempt/session/claim. This packet does not implement that host sequence.
- Tests exercise production functions or the real adapter plus installed SDK mocks; a fake host trace or mocked adapter is not an R5 proof. Every newly added safety guard needs its own observed removal/dependency-fault negative and adjacent truthful `Proof:` comment. If the SDK or another guard rejects the injected fault first, that does not prove a redundant downstream guard; remove the redundancy or choose a real seam that reaches the guard. Never force a test with fabricated production-helper output.
- All commands below run from the repository root. Bun test operands begin `./`; Nx uses fresh output. Commands are proposed, not executed evidence.

## File ownership and validation

All implementation files below live under `apps/twilight-structure/twilight-dash/cli/src/agents/` (currently absent). `activity-executor.ts` owns the port/identity boundary; `api-model-settings.ts` owns selected live configuration; `api-model-turn.ts` owns one SDK dispatch; `api-model-adapter.ts` owns session lifecycle. Tests sit beside their production file. No public index/factory with a throwing placeholder is added in Tasks 1–2. The exact contract-consumer paths also receive scoped import-policy coverage in the existing Dash policy and tool-devsync effective-boundary tests, as assigned below.

Each task runs its focused command and these existing targets after its tests pass:

```bash
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run twilight-dash:typecheck --skip-nx-cache
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run twilight-dash:lint --skip-nx-cache
```

Record exact commands, changed guard/fault, named failing test, restoration and final pass in the owning `verify.md` only during implementation. Do not prewrite passing proof comments. The existing build target packages observation-service, so it is not evidence of a live executor entry point. Aggregate/gate orchestration remains with root; no raw full Nx gate on h2.

### Task 1: Shared identities and accepted API configuration

**Files:** Create `agents/activity-executor.ts`, `agents/activity-executor.test.ts`, `agents/api-model-settings.ts`, `agents/api-model-settings.test.ts` under the full directory above. No storage/binding source modifications. Extend `apps/twilight-structure/twilight-dash/eslint.product.mjs` and `tools/tool-devsync/src/eslint-boundaries.test.ts` only for these four exact contracts-consumer paths.

**Interfaces:**

- Consume real `SelectedActivity`/`ApiModelClass` from `@twilight-burokrat/contracts`, `ActivityIdentity`, `AttemptId`, `AgentRunId`, `DecisionId`, `Ownership`, `Locator` from `../runs/records`, and their existing codecs from `../runs/record-codecs`.
- Produce the complete `ActivityExecutor` and associated types exactly as in the design, without an implementation stub. Produce `snapshotPreparation(input: Preparation): Preparation`, `snapshotTurnRequest(input: TurnRequest): TurnRequest`, `snapshotExecutorLocator(input: ExecutorLocator): ExecutorLocator`; these validate/copy/freeze only the serializable values actually consumed by Task 3. Unknown versions/fields, unsafe epoch, malformed IDs/keys and mismatching locator OperationKey throw. Do not freeze caller objects in place.
- Produce `ActivityDispatchError extends Error` with constructor `(identity: TurnIdentity, cause: unknown)`, a detached immutable `identity`, standard `cause`, and fixed non-sensitive message. Task 2 uses it when a post-dispatch exception must throw while preserving correlation.
- Produce `type ApiModelRegistry = Pick<ReturnType<typeof createProviderRegistry>, 'languageModel'>` and `type ApiModel = ReturnType<ApiModelRegistry['languageModel']>` using installed SDK types. If generic assignment requires a forwarding closure, preserve the concrete model return type; no `any` or fallback to string models.
- Produce `interface ApiModelSettings { readonly selection: SelectedActivity; readonly model: ApiModel; readonly instructions: string; readonly tools: ToolSet; readonly maxSteps: number; readonly maxOutputTokens: number }` and `resolveApiModelSettings(options: {selection:SelectedActivity;models:ApiModelRegistry;tools:ToolSet}): ApiModelSettings`. This is a useful local composition function, not an availability/authorization endpoint.

- [x] **Write production-boundary tests using actual accepted selection.** A test-local fixture uses the real decoder/acceptance path, not a fabricated digest:

```ts
const binding = decodeWorkflowBinding({
  version: 1,
  types: { default: { build: { class: 'api' } } },
  classes: {
    api: {
      executor: 'api-model',
      model: 'openai:fixture',
      prompt: '.twilight/api.md',
      tools: [],
      limits: { maxSteps: 2, maxOutputTokens: 80 },
    },
  },
});
const checked = checkWorkflowBinding(binding, ['build']);
const accepted = acceptWorkflowBinding(checked, [
  { path: '.twilight/api.md', bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0x48, 0x69]) },
]);
const selection = selectWorkflowActivity(accepted, 'change', 'build');
const model = new MockLanguageModelV4();
const models = createProviderRegistry({
  openai: new MockProviderV4({ languageModels: { fixture: model } }),
});
const configured = resolveApiModelSettings({ selection, models, tools: {} });
expect(configured.model).toBe(model);
expect(configured.instructions).toBe('Hi');
expect(configured.selection.bindingDigest).toBe(accepted.bindingDigest);
expect(model.doStreamCalls).toHaveLength(0);
```

Import `decodeWorkflowBinding/checkWorkflowBinding/acceptWorkflowBinding/selectWorkflowActivity` from actual contracts, registry from `ai`, mocks from `ai/test`, and `expect/test` from Bun. Also test a selection naming `read` with no supplied `read` capability; a registry missing `fixture`; wrong executor; corrupted typed boundary values; selected-tool dictionary excludes supplied extras and inherited properties are not supplied tool capabilities. Prompt BOM success prevents a false decoded-text digest check. Codec tests mutate the original request after snapshot, assert mutation succeeds and the returned request remains unchanged; freeze-only aliasing must fail.

- [x] **Run the focused tests red**, then implement precise codecs/guards, local concrete model lookup and selected-tool dictionary. Do not add a second YAML/schema validator or read prompt files. Missing model/tool/config throws; no `unavailable` result. New snapshots validate once at their external boundary; internal callers retain precise types.

```bash
TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/node_modules" bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/agents/activity-executor.test.ts ./apps/twilight-structure/twilight-dash/cli/src/agents/api-model-settings.test.ts --timeout=60000
```

- [x] **Prove guards on these production functions.** Remove the required-tool guard and observe the missing-tool test fail; permit extra supplied tools and observe exact-dictionary test fail; allow an invalid request epoch/version and observe its boundary test fail; replace detached request copy with freeze(input) and observe caller-mutability test fail. Model lookup/bare-ID negatives use actual accepted-binding and installed registry boundaries. Parent 2.2's prefix-guard-removal example is not a mandate for a redundant adapter guard: do not add one when the registry masks its removal, and do not claim a new adapter R5 proof for an existing boundary. No separate byte-copy safety claim: accepted binding already owns snapshotting.
- [x] **Prove the exact contract import boundary.** Extend the existing effective-policy test pattern with a named Dash executor case: all four declared source/test paths admit only the anchored @twilight-burokrat/contracts alias; judge/sibling aliases, relative app imports and unlisted production/test peers remain refused. Preserve inherited constraints. Prepare the real Nx graph first; nonexistent-file parser errors or skipped rules are not policy evidence. Watch removal of this allowance and alias/relative/path widening fail their intended assertions with valid loaded configuration, then restore bytes and record results.

```bash
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx show project twilight-dash --json
TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/node_modules" bun test --preload ./tools/test/scratch/preload.ts ./tools/tool-devsync/src/eslint-boundaries.test.ts --test-name-pattern "Dash executor" --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run-many -t typecheck,lint -p twilight-dash,tool-devsync --skip-nx-cache
```

- [x] **Run focused tests, typecheck and lint green; record evidence for the root-owned bounded commit.** Port/configuration works independently; no adapter execution or durable recovery is claimed.

### Task 2: A real SDK turn driver with truthful outcomes

**Files:** Create `agents/api-model-turn.ts`, `agents/api-model-turn.test.ts`; consume Task 1 files. Extend the existing Dash import policy and effective-boundary case for the new test's direct accepted-binding import; source stays behind Task1 local interfaces. No adapter stub or fake-provider production module.

**Interfaces:**

- Consume Task 1 `ApiModelSettings`, `TurnIdentity`, `TurnRequest`, `TurnReply`, `ActivityDispatchError` and installed `ModelMessage`, `UIMessageChunk`.
- Produce `type ApiModelDispatch = (Extract<TurnReply,{kind:'completed'}> & {readonly responseMessages:readonly ModelMessage[]}) | Extract<TurnReply,{kind:'unresolved'}>`.
- Produce `runApiModelTurn(options: {settings:ApiModelSettings;identity:TurnIdentity;request:TurnRequest;history:readonly ModelMessage[];signal:AbortSignal;abort:()=>void;onPart:(part:UIMessageChunk)=>void}): Promise<ApiModelDispatch>`. Internal caller guarantees a validated immutable request and exclusive session dispatch; Task 3 enforces that. `abort` requests the caller's owned controller, enabling unexpected tool-error/listener failure to stop subsequent local dispatch. Driver does not create or claim sessions.
- completed.responseMessages are SDK-produced assistant/tool messages to append after the current user message; unresolved has no history append. Task 3 maps the completed reply to the public shape and privately retains messages. No messages/history escape through the public port.

- [ ] **Write SDK-path tests first.** Use actual Task 1 acceptance/configuration, concrete identity from its codecs, and installed MockLanguageModelV4. A real no-network stream response has this V4 shape:

```ts
const model = new MockLanguageModelV4({
  doStream: async () => ({
    stream: simulateReadableStream({
      initialDelayInMs: null,
      chunkDelayInMs: null,
      chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Hi' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 30, text: 30, reasoning: 0 },
          },
        },
      ],
    }),
  }),
});
const configured = resolveApiModelSettings({
  selection,
  tools: {},
  models: createProviderRegistry({
    openai: new MockProviderV4({ languageModels: { fixture: model } }),
  }),
});
const controller = new AbortController();
const parts: UIMessageChunk[] = [];
const dispatched = await runApiModelTurn({
  settings: configured,
  identity,
  request,
  history: [],
  signal: controller.signal,
  abort: () => controller.abort(),
  onPart: (part) => parts.push(part),
});
expect(dispatched).toMatchObject({
  kind: 'completed',
  outcome: {
    text: 'Hi',
    finish: 'end_turn',
    usage: { kind: 'measured', inputTokens: 120, outputTokens: 30 },
  },
});
expect(parts.filter((part) => part.type === 'text-delta').map((part) => part.delta)).toEqual([
  'Hi',
]);
expect(model.doStreamCalls).toHaveLength(1);
expect(model.doStreamCalls[0]?.maxOutputTokens).toBe(80);
```

Here selection is made by the actual acceptance snippet from Task 1; identity/request are valid snapshots of the exact design records, with storage IDs parsed using their existing codecs. Use installed V4 stream/types exactly and also assert retained system instructions in doStreamCalls. Add real two-step tool-loop scenarios with inert SDK `tool`/`jsonSchema`: all-known usage, one absent step count, explicit zero, malformed negative/unsafe count; normal stop at maxSteps, length truncation, and actual exhausted tool-loop budget. Do not drive a fake `ToolLoopAgent` or mock `runApiModelTurn`.

- [ ] **Run the focused test red**, then implement the real ToolLoopAgent path. Set `maxRetries:0`; wrap `isStepCount` to capture an actually invoked positive stopping decision. Consume one observed SDK stream through `toUIMessageStream`. Aggregate per-step counts only when all counts are present and valid. Observe raw errors before UI conversion; use exported SDK classifiers such as APICallError, never raw message matching. Missing terminal/error/other is unresolved; malformed trusted SDK records and unexpected tool exceptions throw ActivityDispatchError with original cause/identity. Observer failure requests abort and returns uncertainty; it is not normal completion.

```bash
TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/node_modules" bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/agents/api-model-turn.test.ts --timeout=60000
```

- [ ] **Exercise production fault oracles.** A retryable APICallError from mock doStream must yield transport uncertainty and exactly one SDK call; remove maxRetries:0 and observe the count test fail (allow the actual SDK retry schedule within the focused timeout). Replace per-step completeness with SDK totalUsage and observe mixed-known/unknown test fail. Remove safe-integer check and observe malformed-usage rejection fail. Map length to max_steps and observe distinct-limit test fail. Remove tool-error abort/throw and observe an unexpected throwing tool become a forbidden extra dispatch/completed outcome. Remove raw terminal check and observe an empty/incomplete stream become forbidden completion. Throw from the listener and prove later live callbacks stop and its reason is observer_failed. Post-dispatch malformed usage must reject with the original known TurnIdentity; preserving a fake host trace is not proof of durable retention.
- [ ] **Run focused tests, typecheck and lint green; record exact observed negatives for the root-owned commit.** This driver materially executes a real SDK loop with controlled backend seams; it does not prove real backend cancellation, dedup or durability.

### Task 3: Compose the API-model executor and session lifecycle

**Files:** Create `agents/api-model-adapter.ts`, `agents/api-model-adapter.test.ts`; update only the earlier agent files if a reviewed interface correction is necessary. Extend the same exact-path import policy/effective-boundary case for these direct contract consumers, with fresh removal/widening proofs. No CLI/main wiring, provider factory, coordinator or RunStore migration.

**Interfaces:**

- Consume `resolveApiModelSettings`, `runApiModelTurn`, shared snapshot functions/types and actual storage ID codecs.
- Produce `createApiModelExecutor(options: {selection:SelectedActivity;models:ApiModelRegistry;tools:ToolSet;instanceId:string;newSessionId:()=>AgentRunId}): ActivityExecutor` exactly as the design. This is the first published concrete adapter factory; all port methods have honest implemented behavior.
- `open` creates an adapter-owned conversation with injected real session ID, serializable ExecutorLocator and no SDK dispatch. All recovery capabilities are unsupported and all recovery queries return unresolved/unsupported. Local exact-key caches never advertise durable dedup. Instance/session objects are checked by actual ownership, not structural resemblance.

- [ ] **Write public-port tests before composition.** Reuse real acceptance/SDK fixtures as test-local helpers; no stand-in executor or mocked turn driver. A deferred mock stream barrier is a genuine SDK dependency seam: wait until doStream has been entered, invoke a second public turn/cancel/close, then release the stream. Assert the actual model's doStreamCalls and returned public replies.

```ts
const opened = await executor.open(preparation, new AbortController().signal);
expect(opened.kind).toBe('opened');
if (opened.kind !== 'opened') throw new Error('expected local session');
expect(opened.session.locator.session.sessionId).toBe('session-1');
expect(model.doStreamCalls).toHaveLength(0);
const request = { ...initialRequest, turnKey: 'turn-1' };
const parts: UIMessageChunk[] = [];
const first = await executor.turn(opened.session, request, {
  signal: new AbortController().signal,
  onPart: (part) => parts.push(part),
});
const duplicateParts: UIMessageChunk[] = [];
const duplicate = await executor.turn(opened.session, request, {
  signal: new AbortController().signal,
  onPart: (part) => duplicateParts.push(part),
});
expect(duplicate).toEqual(first);
expect(duplicateParts).toEqual([]);
expect(model.doStreamCalls).toHaveLength(1);
```

`executor`, `model`, `preparation` and `initialRequest` are test-local values made through the actual factory, registry/acceptance and snapshot codecs defined by Tasks 1–2; do not introduce a generic fixture host to create them. Cover same preparation exact replay, changed creation/turn payload rejection, duplicate generated session IDs, foreign/deserialized/closed attachments, no turn before open, fresh pre-aborted open without session-ID allocation or key binding, fresh pre-aborted turn without key binding, busy fresh turn key not retained, explicit resubmission of those unbound keys with changed payload, existing-key duplicate/conflict precedence over an aborted replay signal, idempotent close/cancel on a known closed attachment, one active turn, same-active-key uncertainty, different-session independence, decision continuation with prior SDK history and unchanged attempt/session identity, and new instance recovery uncertainty.

- [ ] **Run the focused tests red**, then implement session state/cache and actual driver composition. Snapshot requests and capture originating callback/signal references before the first await. Bind creation keys only on successful creation and turn keys only on local dispatch admission, before the driver; never retain a fresh pre-aborted/busy key or consume initial cause for not_started. Follow the design's explicit order: existing-key replay/conflict before fresh signal/refusal checks; pre-aborted fresh turn before busy; quarantine before fresh admission. Exact settled retries return frozen detached replies or rethrow the recorded dispatch exception without live UI replay. Only the first admitted turn may use initial cause; decisions use fresh turn keys. Unresolved/throwing dispatch quarantines that session against new keys, which remain unbound. A closed session rejects turn/open reattachment; duplicate terminal replies require an open owned attachment. Repeated close resolves void; cancel on a known idle/closed attachment returns requested with the original locator as a no-op. Neither recreates anything or claims quiescence. Do not auto-open a replacement after uncertainty.

```bash
TOOL_WIKI_TRUSTED_NODE_MODULES="$PWD/node_modules" bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/agents/api-model-adapter.test.ts --timeout=60000
```

- [ ] **Prove lifecycle guards through public methods.** Remove active-session guard and observe two actual mock-model dispatches; remove key payload comparison and observe changed input incorrectly replay; permit a foreign live object and observe rejection fail; remove retained-request detachment, complete a turn, mutate the caller input/owner successfully, then submit an unchanged copy of the original request under the same key: it must still return the original reply. Retaining a mutable alias breaks that cache comparison; freeze-only aliasing breaks the caller-mutability assertion. Do not claim an input-copy proof from a mutation scheduled after the SDK has already synchronously copied its prompt. Remove quarantine and observe a new turn execute after malformed post-dispatch usage. Remove listener detachment and close during an active real SDK stream, observing a forbidden later UI callback from a delayed or abort/finish part that the real conversion path actually emits. If the SDK itself suppresses the chosen part, use its real subsequent UI part or remove a redundant check; a masked producer fault does not prove the guard. Remove the closed-session check and observe reuse accepted. Cancel a dependency that ignores abort: acknowledge requested, keep existing call active until its controlled settlement, and reject another turn; do not assert physical quiescence. Complete cached duplicate while open must cause no further SDK call. Bind a pre-aborted/busy fresh key incorrectly and observe that explicit changed-payload resubmission is wrongly rejected; move new-signal cancellation ahead of existing-key replay and observe a cached reply incorrectly replaced by not_started. Repeated close/cancel must retain the locator and session-ID allocation count, with no SDK calls or reopened attachment. Capability tests prove the actual adapter returns unsupported, not that a backend lacks capabilities.
- [ ] **Run focused tests for all three slices, typecheck and lint green.** Run the existing project test target once when integration scope warrants it, not repeatedly for cosmetic edits:

```bash
NX_DAEMON=false NX_ISOLATE_PLUGINS=false ./node_modules/.bin/nx run twilight-dash:test --skip-nx-cache
./node_modules/.bin/openspec validate twilight-agentic-workflows --json
```

- [ ] **Record bounded completion for the root-owned commit.** Do not check off S0.03/S0.08/S7a as complete: other executors, backend recovery and durable prepare/claim/turn-intent host integration remain open. No live provider/credential/gateway entry point is enabled. Root owns the exact-SHA aggregate gates and parent task updates. Record fresh OpenSpec output, including existing long-requirement warnings; do not prescribe `--strict` or blanket cleanup.
