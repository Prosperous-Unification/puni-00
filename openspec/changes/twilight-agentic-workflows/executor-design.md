# Executor contract and first API-model adapter

This supplement defines the adopted executor contract and three bounded implementation slices. The source base is reviewed and exact-SHA-gated binding/storage `6f09b11fc638c36c3d90747b98a0eabd63147c0e`, with installed `ai@7.0.118`. Implementation and behavioral proof remain in [executor tasks](executor-tasks.md) and [verification](verify.md).

## Packet outcome and limits

Implement one genuine `api-model` ActivityExecutor using `ToolLoopAgent`, a caller-injected existing SDK registry capability and injected tool capabilities. Test its actual SDK call/stream path with installed `ai/test` mocks. Define the common five-kind port, but do not implement four other adapters, a fake host, a standalone fake backend, a provider registry, a model-provider factory or credentials. No live command is wired by this packet.

This is useful executable adapter behavior and honest recovery contracts, not completion of S0.03/S0.08 or S7a. The first adapter owns process-local sessions/conversation history and explicitly lacks backend session recovery, durable launch/turn dedup, remote-effect inspection and physical-quiescence proof. Successful model output is not business success. Static binding acceptance is not approval/budget/tool authority or a retained RunStore manifest.

## Actual accepted types to consume

Import `SelectedActivity`, `ApiModelClass`, `ValidatedBinding` and `selectWorkflowActivity` from the accepted `@twilight-burokrat/contracts` exports; positive tests must construct acceptance with `decodeWorkflowBinding → checkWorkflowBinding → acceptWorkflowBinding → selectWorkflowActivity`. Factory input is the real `SelectedActivity`, narrowed to api-model by the implementation, not a new settings schema or invented BindingPin.

Accepted API settings are precisely `{executor:'api-model',model,prompt,tools,limits:{maxSteps,maxOutputTokens}}`. Selection also supplies requestedType, matchedType, stepCode, className, bindingDigest and prompt `{path,sha256,text}`. Its objects are detached/frozen by Burokrat. Use retained text as SDK instructions; never reopen a prompt path. `prompt.sha256` hashes original bytes, possibly including BOM: **do not rehash decoded text and compare it to this digest**. `ValidatedBinding.prompts` retains original base64 bytes, while SelectedActivity intentionally does not. This adapter consumes the accepted selection; future ArtifactStore/manifest composition owns byte retention and original-byte verification.

Reuse storage `runs/records.ts` types: `ActivityIdentity`, `AttemptId`, `AgentRunId`, `DecisionId`, `Ownership`, and `Locator` (aliased `RunLocator`). Reuse their existing codecs for actual boundary identity parsing; no parallel brands for run/attempt/operation/session. Creation and turn keys are new semantic identifiers (nonempty, <=256 characters), **not** OperationKey or ExecutionCommandId. Creation keys are scoped to an adapter instance; turn keys are scoped to its session. Exact retry equality includes the original dispatch provenance, so retrying an existing intent does not rewrite its owner epoch. `ManifestDigest` is not `SelectedActivity.bindingDigest`; do not cast or equate them.

## Public contract

All identity/locator/request records are detached serializable values; callbacks, model/tool objects and AbortSignals remain live. Export in `agents/activity-executor.ts`; no unused generic validation facade. The kinds remain exactly `api-model | cli-harness | acp | tool | human`.

```ts
type ExecutorKind = 'api-model' | 'cli-harness' | 'acp' | 'tool' | 'human';
type DispatchOwner = Pick<Ownership, 'ownerId' | 'epoch'>;
interface Preparation {
  readonly version: 1;
  readonly identity: ActivityIdentity;
  readonly attemptId: AttemptId;
  readonly creationKey: string;
}
interface ExecutorLocator {
  readonly version: 1;
  readonly executor: ExecutorKind;
  readonly executorVersion: string;
  readonly preparation: Preparation;
  readonly selection: Pick<
    SelectedActivity,
    'bindingDigest' | 'requestedType' | 'matchedType' | 'stepCode' | 'className'
  >;
  readonly session: RunLocator; // workerId is adapter incarnation; sessionId is real adapter session
}
interface ActivitySession {
  readonly locator: ExecutorLocator;
  // Opaque live identity: only the creating adapter instance accepts this object.
}
interface TurnRequest {
  readonly version: 1;
  readonly turnKey: string;
  readonly owner: DispatchOwner; // dispatch provenance, not executor authorization/fencing
  readonly cause:
    { readonly kind: 'initial' } | { readonly kind: 'decision'; readonly decisionId: DecisionId };
  readonly input: string;
}
interface TurnIdentity {
  readonly locator: ExecutorLocator;
  readonly turnKey: string;
  readonly owner: DispatchOwner;
}
type Usage =
  | { readonly kind: 'measured'; readonly inputTokens: number; readonly outputTokens: number }
  | {
      readonly kind: 'unknown';
      readonly reason:
        | 'provider-usage-unavailable'
        | 'interrupted-before-usage'
        | 'acp-v1-no-usage'
        | 'harness-usage-unavailable'
        | 'tool'
        | 'human';
    };
interface TurnOutcome {
  readonly text: string;
  readonly usage: Usage;
  readonly finish: 'end_turn' | 'max_steps' | 'output_truncated' | 'refused' | 'cancelled';
}
type Uncertainty =
  | 'unsupported'
  | 'transport_lost'
  | 'interrupted'
  | 'observer_failed'
  | 'approval_required'
  | 'tool_input_required'
  | 'provider_incomplete'
  | 'turn_in_flight'
  | 'recovery_required';
type TurnReply =
  | { readonly kind: 'completed'; readonly identity: TurnIdentity; readonly outcome: TurnOutcome }
  | {
      readonly kind: 'not_started';
      readonly identity: TurnIdentity;
      readonly reason: 'cancelled_before_dispatch' | 'session_busy';
    }
  | {
      readonly kind: 'unresolved';
      readonly identity: TurnIdentity;
      readonly reason: Uncertainty;
      readonly text: string;
      readonly usage: Usage;
    };
type OpenReply =
  | { readonly kind: 'opened'; readonly session: ActivitySession }
  | { readonly kind: 'not_started'; readonly reason: 'cancelled_before_dispatch' }
  | {
      readonly kind: 'unresolved';
      readonly preparation: Preparation;
      readonly reason: Uncertainty;
    };
type SessionLookup =
  | { readonly kind: 'located'; readonly locator: ExecutorLocator }
  | { readonly kind: 'absent'; readonly preparation: Preparation }
  | {
      readonly kind: 'unresolved';
      readonly preparation: Preparation;
      readonly reason: Uncertainty;
    };
type ResumeReply =
  | { readonly kind: 'attached'; readonly session: ActivitySession }
  | {
      readonly kind: 'unresolved';
      readonly locator: ExecutorLocator;
      readonly reason: Uncertainty;
    };
type EffectReply =
  | { readonly kind: 'succeeded' | 'failed' | 'absent'; readonly identity: TurnIdentity }
  | { readonly kind: 'unresolved'; readonly identity: TurnIdentity; readonly reason: Uncertainty };
type QuiescenceReply =
  | { readonly kind: 'quiescent' | 'active'; readonly locator: ExecutorLocator }
  | {
      readonly kind: 'unresolved';
      readonly locator: ExecutorLocator;
      readonly reason: Uncertainty;
    };
interface RecoveryCapabilities {
  readonly locateSession: 'durable' | 'unsupported';
  readonly resumeSession: 'durable' | 'unsupported';
  readonly deduplicatePreparation: 'durable' | 'unsupported';
  readonly deduplicateTurn: 'durable' | 'unsupported';
  readonly inspectEffect: 'authoritative' | 'unsupported';
  readonly cancelPhysicalWork: 'authoritative' | 'unsupported';
  readonly observeQuiescence: 'authoritative' | 'unsupported';
}
interface ActivityExecutor {
  readonly kind: ExecutorKind;
  readonly version: string;
  readonly capabilities: RecoveryCapabilities;
  open(preparation: Preparation, signal: AbortSignal): Promise<OpenReply>;
  turn(
    session: ActivitySession,
    request: TurnRequest,
    control: { readonly signal: AbortSignal; readonly onPart: (part: UIMessageChunk) => void },
  ): Promise<TurnReply>;
  lookupSession(preparation: Preparation, signal: AbortSignal): Promise<SessionLookup>;
  resumeSession(locator: ExecutorLocator, signal: AbortSignal): Promise<ResumeReply>;
  inspectEffect(identity: TurnIdentity, signal: AbortSignal): Promise<EffectReply>;
  cancel(
    session: ActivitySession,
  ): Promise<{ readonly kind: 'requested'; readonly locator: ExecutorLocator }>;
  observeQuiescence(locator: ExecutorLocator, signal: AbortSignal): Promise<QuiescenceReply>;
  close(session: ActivitySession): Promise<void>;
}
```

`located/absent/reattached/authoritative effect/quiescence` are trusted adapter assertions whose future implementation needs backend evidence, not merely a PID, HTTP404 or empty process cache. Absence requires settled/fenced creation such that it cannot materialize later. The API adapter never emits those positive recovery assertions; its lookup/resume/inspection/quiescence methods explicitly return unresolved/unsupported, including after constructing a new adapter instance. No fake implementation of those branches is a deliverable. Capability declarations describe recovery across client replacement, not an in-memory map.

## Concrete API-model dependencies and preparation

`createApiModelExecutor(options): ActivityExecutor` consumes:

- `selection: SelectedActivity`, obtained from the accepted selector. Wrong executor, missing prompt, invalid provider:model, missing tools/model capability or corrupted trusted settings throw before dispatch. Reuse accepted settings types; check only adapter-owned assumptions, not a second binding validator. Parent task 2.2's illustrative prefix-guard-removal proof is superseded by the actual accepted-binding/SDK-registry boundary: both already reject bare model IDs. Keep their real boundary negatives; do not add an adapter prefix guard whose removal is masked by registry validation. Only a meaningful newly owned guard requires a new adapter mutation proof.
- `models: Pick<ReturnType<typeof createProviderRegistry>, 'languageModel'>`, the installed SDK's already-constructed registry capability. Resolve the qualified selection model once to a concrete model object. Never pass a string model to ToolLoopAgent and trigger ambient gateway resolution. No production provider registry module, provider package imports, environment-key reads or credential resolver is added here. The final project-qualified TypeScript assignment must be checked during implementation; do not widen to any/string fallback if SDK generic variance requires an explicit typed forwarding closure.
- `tools: ToolSet`, explicit caller-supplied SDK live capabilities. Select exactly the named tools into a fresh dictionary; missing names throw. Extra supplied tools are never exposed to the model. Do not clone tool functions/schemas as JSON. These capabilities are not evidence of I1 approval/budget authority; real production composition must supply that separately.
- `instanceId: string` and `newSessionId: () => AgentRunId`, explicit composition-owned identity sources. Validate generated IDs with existing storage codecs; duplicate session IDs throw. Do not manufacture a WBS run from OperationKey or a provider response ID.

The first preparation allocates a real **adapter-owned in-process conversation session**, with no model/tool execution. It is not a durable provider conversation. Same preparation identity and exact contents within that adapter returns the same session; altered contents under its creation key throw. A new instance cannot prove preparation dedup and must not claim that capability. `RunLocator.workerId = instanceId`, `sessionId` is the generated real session identity, `operationKey` is the activity's existing OperationKey. Full ExecutorLocator keeps preparation/selection separate; no JSON smuggled into workerId.

Positive tests use real Burokrat acceptance, `createProviderRegistry({openai:new MockProviderV4({languageModels:{fixture:mockModel}})})`, and inert SDK tools. That registry is test dependency setup, not another production registry implementation. No fake retained manifest/approval/credential success is created. The factory's tool/model lookup is local composition; it is not a remote availability probe.

## Turn semantics and installed SDK path

Use the real `ToolLoopAgent`, fixed retained instructions, selected tool dictionary, `maxOutputTokens`, `maxRetries:0`, and `stopWhen` wrapping `isStepCount(maxSteps)` with a per-turn flag that records actual budget stopping. No fallback models, tool-call repair or retry callbacks. One turn adds its user input to session-local message history and calls `agent.stream` with explicit messages and the combined abort signal. Snapshot the serializable TurnRequest before the first await; caller-owned request objects remain mutable. Capture the originating callback and signal references at submission, without JSON-cloning live capabilities or rereading a mutable control object after awaits. The accepted selection already is frozen; do not claim an extra selection-copy guard that its caller-mutation test cannot break.

Stream **one** SDK `stream` through an observation TransformStream into installed `toUIMessageStream`, then invoke the originating live callback in order. Observe raw error/abort/finish-step/finish parts before UI conversion: the UI conversion's error text is not an exception classifier. Do not tee an unconsumed parallel stream or infer completion from iterator end. Text is the concatenation of live turn text deltas across steps; history uses the installed SDK `responseMessages` property, not `response.messages` or reconstructed UI strings. Commit history only for a successfully decoded terminal response; unresolved/throwing turns block further new turns in that session until external recovery (unsupported here).

A terminal SDK stop maps to end_turn; length maps to **output_truncated**, never max_steps; content-filter maps to refused. max_steps requires actual budget-stop evidence and a final tool-calls boundary; a normal stop at exactly maxSteps remains end_turn. Approval requests or unresolved tool input yield explicit uncertainty, not automatic approval or end_turn. Error/other or missing trustworthy terminal completion is unresolved/provider_incomplete. This adapter does not emit completed/cancelled merely because AbortSignal fired.

Inspect **each completed step's** input/output counts. All must be reported finite nonnegative safe integers, and sums must remain safe; reported zero is measured zero. Any absent count makes whole-turn usage unknown/provider-usage-unavailable; interruption before a complete terminal makes it unknown/interrupted-before-usage. Malformed reported counts throw. Installed `ai/src/types/usage.ts:addTokenCounts` treats one undefined operand as zero when the other exists: SDK totalUsage alone therefore cannot establish complete measurement. Test this actual mixed-known/unknown multi-step path.

Unexpected tool exceptions must not become ordinary completed text because SDK emits tool-error and can continue. Observe `onToolExecutionEnd.toolOutput` and the raw tool-error boundary; abort further dispatch and throw with validated TurnIdentity and original cause. Expected tool business outcomes belong in the supplied tool's typed output. Missing tool executors/approval-dependent calls can yield explicit tool_input_required/approval_required, never fabricated tool success. No approval policy or human-resume composition is implemented.

Known SDK transport/API-call failure after possible dispatch yields unresolved/transport_lost; abort after dispatch yields unresolved/interrupted. Missing configuration/tools/packages, malformed SDK payloads, impossible identities and unknown exceptions throw. A post-dispatch throw uses `ActivityDispatchError(identity: TurnIdentity, cause: unknown)` with a detached immutable identity, standard original cause and fixed non-sensitive message; it never loses known correlation. Recognize SDK errors by their actual exported classifiers; do not catch all errors as “unavailable.” This adapter has no positive unavailable admission endpoint, so its not_started reasons are only proven pre-dispatch cancellation or session_busy. Thrown post-dispatch errors do not erase the known locator/turn identity; durable intent retention is the host's later obligation.

Listener failure stops that listener, requests local abort, and yields unresolved/observer_failed; it is never quiescence. Cleanup errors remain attached/rethrown with the original cause rather than swallowed. No callback is invoked after close. Avoid leaking raw error messages through UI conversion; detailed exceptions stay with the caller, not UI chunks.

## Local concurrency, duplicate delivery and close

Only the creating adapter's known session objects are accepted. Foreign/deserialized attachments throw for every lifecycle method; closed owned attachments reject turn and same-creation-key reopen, while close/cancel remain idempotent as specified below. Creation keys are bound only by successful session creation; turn keys are bound at local dispatch admission, before entering the SDK driver. Pre-dispatch not_started does not bind, reserve or cache a fresh key, consume initial cause, allocate a session ID or add conversation history. A caller may explicitly resubmit that unbound key with the same or a changed payload; the adapter never retries it automatically.

For open, validate/snapshot first, then consult an existing creation key: changed payload throws, an exact open session returns its existing attachment even if the new signal is aborted, and an exact closed session throws without replacement. Only a fresh key is eligible for not_started/cancelled_before_dispatch; it remains unbound and does not call the session-ID source. Successful creation binds the key atomically to that session.

For turn, validate/snapshot and require an open owned attachment, then consult the existing turn key before checking a newly supplied abort signal: changed payload throws; exact active replay returns unresolved/turn_in_flight without another listener; exact settled replay returns the original reply or rethrows the recorded dispatch exception, without new parts or dispatch. For a fresh key, check pre-aborted signal first, then active-session contention: return not_started/cancelled_before_dispatch or not_started/session_busy respectively, retaining neither key nor request. A fresh key on a quarantined session returns unresolved/recovery_required and remains unbound. Otherwise validate the cause, bind the payload and start the sole local dispatch. Binding survives completed, unresolved and throwing dispatch; abort after admission does not turn it into an unbound pre-dispatch refusal. This is local duplicate protection, not advertised durable dedup.

A decision continuation keeps attempt/session/claim and uses a fresh turn key bound to its DecisionId; initial cause is accepted only for the first admitted turn. DecisionId is correlation, not proof of inbox consumption or approval; the later host owns those checks. Another session progresses independently. There is no stream-replay API; exact duplicate replies never replay live UI chunks.

cancel requests the local AbortController; it does not confirm that a provider or tool stopped or clear a busy slot before its actual call settles. On a known idle or closed attachment, cancel is an idempotent no-op returning requested with the original locator; repeated active cancellation has the same reply. close detaches/mutes the listener and requests abort once; repeated close on that known closed attachment resolves void without replacement, reattachment or another side effect. Neither no-op acknowledgement implies quiescence. A dependency ignoring abort may remain pending; later stream failures remain observed rather than becoming unhandled promises. Closed identity records remain recognizable for the adapter instance's lifetime.

## Required host ordering and receiver retry ruling

Required future production sequence: persist preparation intent → prepare/open without activity execution → persist full locator → acquire/persist exact WBS claim using the real session ID → persist immutable turn intent/key → turn. The executor never writes RunStore/WBS or certifies these steps by accepting a boolean “authorized” flag. No fake host trace is a production proof.

Reattachment/continuation preserves the SAME runtime attempt/session/claim. A genuinely new attempt preserves logical operation but requires predecessor quiescence/effect reconciliation, guarded exact release and a NEW exact WBS claim. No old claim rebinding or automatic release on takeover. Another holder can win the gap; retry rechecks normal eligibility/basis. A local model error/close is insufficient to justify that retry.

Storage at79f4 has queued state with nullable claim, Locator with only workerId/sessionId/operationKey, and ExecutionFact.launch_recorded requiring a claim. It cannot yet retain this full preparation locator before claim or a separate turn intent. Add/version that integration later; do not overload launch_recorded, ExecutionCommandId or OperationKey. Receiver ledger pin/grant mapping is another open integration field. Broader I1 approval/budget/tool-policy/credential-reference retention and RunStore Manifest construction remain separate accepted work; bindingDigest is only static acceptance identity.

## Source evidence and implementation boundary

Installed seams: `ai/test` MockLanguageModelV4/MockProviderV4 expose real doStreamCalls; ToolLoopAgent has maxRetries/stopWhen; `toUIMessageStream` converts actual stream parts; step results expose per-step usage; `ProviderRegistry` resolves qualified model handles. No imports from missing harness/provider packages are needed. Use primary installed source, not an unverified newer SDK example.

The adopted packet supplies an injected registry/tool capability and process-local conversation identity. It implements actual SDK execution without enabling a live entry point. The explicit output_truncated/uncertainty contract and unsupported durable recovery are part of this boundary; governance and durable dispatch composition remain separate prerequisites. No live prompt or provider configuration is authorized by static selection.
