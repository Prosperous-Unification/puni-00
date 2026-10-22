## ADDED Requirements

### Requirement: One port runs every executor kind behind one stream shape

Twilight Dash SHALL expose one ActivityExecutor port for api-model, cli-harness, acp, tool and human. Adapters SHALL use real conversation identities, stream AI SDK UIMessageChunk parts and report measured usage or named unknown usage without defaulting to zero. API-model execution SHALL consume accepted SelectedActivity and concrete model/tool capabilities; static selection grants no execution or spending authority.

#### Scenario: An API model turn is measured

- **WHEN** the real API-model adapter completes a turn through the installed mock language model with 120 input and 30 output tokens
- **THEN** usage is measured with those counts and every live text part reaches its listener in order

#### Scenario: An ACP turn reports unknown usage

- **WHEN** a future ACP adapter completes against its conformance backend without token reporting
- **THEN** usage is unknown with reason acp-v1-no-usage and the later coordinator does not issue a token_actual write: an absent measure stays absent and any prior measured value remains unchanged
- **AND** the adapter itself does not write the attempt or WBS

#### Scenario: Missing trusted model or tool configuration throws

- **WHEN** the adapter receives a bare model id, a missing named model capability or a missing selected tool capability
- **THEN** the accepted-binding or real registry boundary rejects the bare id, and missing trusted model/tool capabilities throw before dispatch rather than reporting fallback or expected unavailability
- **AND** no redundant adapter prefix guard is required merely to reproduce a mutation proof already enforced by those boundaries

#### Scenario: A harness session id becomes the agent run

- **WHEN** a future cli-harness adapter opens a session through its conformance backend
- **THEN** the later host records that real session id as the attempt's agent run and uses it on the WBS claim

#### Scenario: Accepted prompt bytes include a BOM

- **WHEN** Burokrat accepted original UTF-8 prompt bytes containing a BOM and selected the decoded prompt text
- **THEN** the adapter uses that retained text without reopening the path or comparing its re-encoded hash to the original-byte digest

#### Scenario: API-model composition uses explicit accepted capabilities

- **WHEN** an API-model adapter is constructed from accepted selection and injected model/tool capabilities
- **THEN** it uses retained prompt text and resolves the qualified model through the installed registry to a concrete model object without reopening prompt files or passing an ambient string model
- **AND** the adapter does not construct providers or resolve credentials and its selection does not authorize execution or spending

### Requirement: Executors declare recovery capabilities and uncertain outcomes

Each executor SHALL declare durable lookup, reattachment, preparation/turn deduplication, effect inspection, cancellation and quiescence capabilities. It SHALL return serializable locators and explicit uncertainty without mutating RunStore or WBS. Positive recovery assertions SHALL require backend evidence; completed output alone does not establish business completion.

#### Scenario: Session creation succeeds before its locator is saved

- **WHEN** the future coordinator dies after preparation creates a session but before locator persistence
- **THEN** recovery locates the session by the retained preparation identity or reports unresolved without blindly creating another session

#### Scenario: The first API-model adapter has only process-local sessions

- **WHEN** its recovery capabilities or lookup/resume/effect/quiescence methods are queried, including on a replacement adapter instance
- **THEN** capabilities are unsupported and the queries return explicit unresolved/unsupported
- **AND** an in-process exact-retry cache is not described as durable deduplication

#### Scenario: Cancellation does not prove physical exit

- **WHEN** a model or tool ignores cancellation while an API-model turn remains pending
- **THEN** cancellation acknowledges only the local request, another turn is not dispatched on that session, and quiescence remains unresolved

#### Scenario: Recovery evidence is unavailable

- **WHEN** an adapter has only a reusable PID, an empty process cache or a transport cancellation acknowledgement
- **THEN** it does not infer durable identity, authoritative absence or physical quiescence
- **AND** an authoritative absence assertion would require excluding delayed creation that could still materialize

### Requirement: API-model SDK dispatch preserves limits and uncertainty

The API-model adapter SHALL use selected tools, retained instructions, maxOutputTokens, maxSteps and zero automatic retries. It SHALL distinguish output truncation, step exhaustion, completion and uncertainty. Only complete valid per-step counts yield measured usage. Malformed trusted values and unexpected exceptions SHALL throw with immutable turn identity and original cause; modeled transport, observer and suspension outcomes remain named uncertainty.

#### Scenario: SDK aggregate usage hides a missing count

- **WHEN** one tool-loop step omits an input/output count and another supplies one
- **THEN** the real driver reports unknown usage even if SDK totalUsage contains a numeric aggregate

#### Scenario: Token truncation is not step exhaustion

- **WHEN** the model finishes with SDK length
- **THEN** the finish is output_truncated
- **AND** max_steps is reserved for an actually exercised step-budget stop at a tool-loop boundary

#### Scenario: A normal stop coincides with maxSteps

- **WHEN** the model finishes normally on the numerically last permitted step without a step-budget stop
- **THEN** the finish remains end_turn

#### Scenario: Retryable transport error does not repeat dispatch

- **WHEN** the installed mock model throws a retryable SDK API-call error after turn dispatch begins
- **THEN** the real SDK driver reports transport uncertainty and invokes the model only once

#### Scenario: Unexpected tool failure is not ordinary text completion

- **WHEN** an injected tool throws an unexpected exception in the real SDK loop
- **THEN** the driver requests abort, prevents another local model step and throws with the original cause and turn identity

#### Scenario: Invalid SDK output arrives after dispatch

- **WHEN** a dispatched turn returns malformed usage or another impossible trusted SDK record
- **THEN** it throws with its known locator/turn identity and the session refuses a new turn pending recovery
- **AND** the later host must retain the already persisted turn intent for reconciliation instead of treating the exception as non-dispatch

#### Scenario: Usage is explicit zero, incomplete or malformed

- **WHEN** every completed step reports finite nonnegative safe integer input/output counts and their sums are safe
- **THEN** the driver reports measured sums, including an explicit measured zero
- **AND** any missing count yields unknown/provider-usage-unavailable, incomplete interrupted usage stays unknown/interrupted-before-usage, and malformed counts or unsafe sums throw with turn correlation

#### Scenario: A listener or tool input cannot complete normally

- **WHEN** the originating listener throws, an approval/tool-input boundary suspends, or the stream lacks trustworthy terminal completion
- **THEN** the driver returns observer_failed, approval_required, tool_input_required or provider_incomplete uncertainty as appropriate
- **AND** listener failure stops its callbacks and requests abort, while unexpected exceptions retain their original cause instead of becoming expected unavailability

#### Scenario: Positive nondispatch requires a local admission fact

- **WHEN** a turn returns not_started
- **THEN** its reason is proven pre-dispatch cancellation or local session contention; missing trusted configuration instead throws

### Requirement: Session lifecycle separates exact retries from new turns

An owned session SHALL admit one active turn. Successful creation and turn admission SHALL bind immutable payloads to their scoped keys; fresh not_started requests leave keys unbound. Exact retries neither redispatch nor replay UI parts; changed recorded payloads throw. Only owning live attachments execute turns. Close detaches listeners and requests cancellation without proving physical exit. These local guarantees do not imply durable recovery.

#### Scenario: A duplicate arrives after local completion

- **WHEN** an open owned session receives the same completed turn key and exact request again
- **THEN** it returns the original immutable reply with no new model call or live chunks

#### Scenario: A different turn races an active turn

- **WHEN** a different key arrives while a turn is active on that session
- **THEN** it is not_started/session_busy with no second dispatch and its fresh key/payload are not retained
- **AND** an exact duplicate of the active key reports turn_in_flight without attaching another listener

#### Scenario: A fresh refused key has no local binding

- **WHEN** fresh open is pre-aborted, or a fresh turn is pre-aborted or refused because the session is busy
- **THEN** the key remains unbound, initial cause is not consumed, and open does not allocate a session id
- **AND** an explicit later resubmission may use that key with a changed valid payload; the adapter never retries or replaces automatically

#### Scenario: An existing key is retried with an aborted signal

- **WHEN** an open owned attachment has a recorded turn key and the caller retries it with an aborted signal
- **THEN** changed payload still throws, while an exact request returns the recorded reply/exception or active turn_in_flight uncertainty without a new dispatch

#### Scenario: Close and cancel are repeated on the known closed attachment

- **WHEN** the caller repeats close or cancel after closing its own attachment
- **THEN** close resolves void and cancel returns requested with the original locator without new session allocation, reattachment or dispatch
- **AND** turn and same-creation-key reopen still throw, foreign attachments still throw, and these acknowledgements do not prove quiescence

#### Scenario: Caller changes a request during asynchronous dispatch

- **WHEN** the caller mutates its original input/owner after turn submission
- **THEN** the caller-owned object remains mutable while the dispatched payload and returned correlation retain the original snapshot

#### Scenario: Close precedes a delayed stream part

- **WHEN** a real SDK dependency emits another part after the caller closes its session
- **THEN** the detached callback is not invoked and the adapter does not claim that the backend has quiesced

#### Scenario: A decision continues an existing conversation

- **WHEN** a caller submits a decision continuation on an open owned session
- **THEN** it uses a fresh turn key with the same attempt/session identity; initial cause is valid only for the first admitted turn
- **AND** a fresh pre-aborted signal precedes busy refusal, and unresolved or throwing dispatch quarantines new keys without binding them

### Requirement: Durable host integration precedes activity dispatch

The coordinator SHALL persist preparation intent, prepare without execution, persist the full locator, acquire/persist the exact WBS claim and persist immutable turn intent before dispatch. Continuation preserves attempt/session/claim. A new attempt requires predecessor reconciliation/quiescence, exact guarded release and a new claim under normal eligibility/basis checks; takeover never releases or rebinds the old claim.

#### Scenario: An activity cannot start from preparation alone

- **WHEN** the future host has prepared a session but has not retained its locator, exact claim and turn intent
- **THEN** it does not dispatch the turn
- **AND** a port-only or fake-host ordering test does not prove that durable production integration

#### Scenario: A new attempt competes for a new claim

- **WHEN** a predecessor has been reconciled/quiesced and its exact claim released for a new attempt of the same logical operation
- **THEN** another eligible holder may win before the new claim, and the retry cannot reuse the predecessor binding or release a replacement claim

#### Scenario: Preparation alone is not host authorization

- **WHEN** a local adapter accepts a preparation or a boolean authorization flag
- **THEN** that acceptance cannot certify durable host ordering; the release/reclaim gap gives no continuous reservation guarantee
