## ADDED Requirements

### Requirement: Claim-bound conversation access

The API SHALL expose `GET /conversation`, `POST /conversation/stream` and `POST /conversation/cancel` only to the exact configured app Origin, authorized by the live, unconsumed browser draft claim cookie; writes SHALL also require the draft CSRF header. No account, session or sign-in SHALL be required. A missing, expired, consumed or foreign claim SHALL answer 401 `draft_unavailable` without disclosing content. Responses SHALL be `Cache-Control: no-store` and SHALL never include the claim.

#### Scenario: Owner reads the conversation

- **WHEN** the browser that created the draft requests `GET /conversation` from the app origin
- **THEN** it receives the description, saved turns, stage, remaining visitor turns, provider availability and its CSRF token

#### Scenario: Foreign browser or origin

- **WHEN** a request carries another browser's cookie, no cookie, or an unconfigured Origin
- **THEN** the API answers 401 or 403 and no turn, operation or reservation is created

#### Scenario: Missing CSRF on stream

- **WHEN** `POST /conversation/stream` arrives with a valid claim but no draft CSRF header
- **THEN** the API answers 403 before any admission or provider call

### Requirement: Explicit, idempotent operations

`POST /conversation/stream` SHALL accept `{ idempotencyKey, initial: true }` or `{ idempotencyKey, message }`. The initial operation SHALL use the server key `initial:<draftId>` and the stored description, and SHALL be admitted at most once per conversation. A later message SHALL be 1 to 1,500 characters of text. A replay of a completed operation SHALL return the saved reply as a stream without a provider call; an in-flight or unknown operation SHALL answer 409; a changed body under the same key SHALL answer 409 `idempotency_conflict`. Nothing SHALL be sent to the provider until the operation row is persisted.

#### Scenario: Replay without a second call

- **WHEN** a completed operation's key is posted again
- **THEN** the saved reply streams back and the fake provider records no new request

#### Scenario: Second initial

- **WHEN** `initial: true` is posted after the initial operation completed and a later turn exists
- **THEN** the API answers 429 `turn_limit` without a provider call

### Requirement: Conversation allowance

Before any provider call the API SHALL enforce, atomically in one store transaction: at most 8 visitor turns per conversation including the Home request; 400 completion tokens per reply; one in-flight operation per conversation and four in-flight paid calls site-wide (operations settled at their ceiling never count); a $0.15 per-conversation spend ceiling; a $0.30 per-source UTC-day ceiling across at most 3 conversations per source; and the $10 site-wide UTC-day ceiling shared with account reservations in `provider_call`. Each operation SHALL record the source hash and UTC day it was admitted under, and the per-source ceilings SHALL sum those, so a conversation crossing midnight is charged to the new day's source. Spend SHALL count settled usage, the full reservation of an operation settled at its ceiling, and in-flight reservations. Usage above the reservation SHALL be recorded as the actual cost with an `overrun` flag. Reservations SHALL use the configured rates and a conservative byte-based input bound plus the 400-token output cap. A refusal SHALL be a typed 429 before the provider call, SHALL set the conversation to `exhausted` with its reason when the cause is the turn or spend ceiling, and SHALL preserve saved turns.

#### Scenario: Ninth visitor turn

- **WHEN** a conversation has 8 completed visitor turns and another message is posted
- **THEN** the API answers 429 `turn_limit`, the conversation state becomes `exhausted` with reason `turns`, and the provider is not called

#### Scenario: Site ceiling shared with accounts

- **WHEN** account reservations in `provider_call` and anonymous reservations for the same UTC day sum to the site ceiling less than one reservation
- **THEN** the next anonymous reservation is refused with 429 and the fake provider records no request

#### Scenario: Per-source ceiling

- **WHEN** one source has 3 open conversations today and a fourth draft from the same source posts its initial operation
- **THEN** the API answers 429 `source_limit` and the conversation is `exhausted` with reason `source_spend`

#### Scenario: Stopped replies do not hold concurrency

- **WHEN** four conversations each have one operation settled at its ceiling and a fifth posts its initial operation
- **THEN** the fifth is admitted and an account reservation is also admitted

#### Scenario: Midnight crossing

- **WHEN** a conversation started yesterday continues after UTC midnight from a source whose operations today already sum near $0.30
- **THEN** its new operation is charged to today's source hash and another conversation from that source is refused `source_spend`

#### Scenario: Usage above the reservation

- **WHEN** the final usage of a reply costs more than its reservation
- **THEN** the operation completes with the actual cost settled and `overrun` set

#### Scenario: Concurrent reservations

- **WHEN** two stream requests for different conversations race while the site-day ceiling allows only one
- **THEN** exactly one reaches the fake provider and the other receives 429

### Requirement: Source identification behind the gateway

The API SHALL derive the source from the client address: when `TRUSTED_PROXY_HOPS` is greater than zero, from the corresponding `X-Forwarded-For` hop, otherwise from the socket address. A request lacking the expected forwarded hop when hops are configured SHALL be refused with 400 `source_unavailable`, never attributed to the socket address. Startup SHALL refuse an `https` app origin without `TRUSTED_PROXY_HOPS`. An IPv6 address SHALL be identified by its /64 prefix and an IPv4-mapped address by its IPv4 address. The stored source SHALL be a hash under a random salt per UTC day that every API process on the database shares through the store, so restarts and blue/green pairs agree; salts older than the previous day SHALL be deleted; a missing or malformed stored salt SHALL throw. The source SHALL never be the raw address. Rate-limited routes SHALL count one-minute windows per hashed source (and per claim on `/conversation/stream`) under a larger global backstop, and a request counts against a window only when every window admits it.

#### Scenario: Missing forwarded hop

- **WHEN** `TRUSTED_PROXY_HOPS=1` and a stream request arrives without `X-Forwarded-For`
- **THEN** the API answers 400 and creates no conversation or reservation

#### Scenario: Shared daily salt

- **WHEN** two API processes on one database hash the same address on the same UTC day
- **THEN** both store the same source hash

#### Scenario: One source's window

- **WHEN** one source has used its intake window for the minute
- **THEN** its next intake answers 429 `rate_limited` and another source's intake is still accepted

#### Scenario: Startup without hops on https

- **WHEN** the API is constructed with an `https` app origin and no `trustedProxyHops`
- **THEN** the constructor throws naming the setting

### Requirement: Streaming with conservative settlement

The API SHALL stream the reply as an AI SDK UI message stream and SHALL emit the finish event only after the operation is completed with final provider usage. Cancellation, disconnect, timeout, stream failure, missing or malformed final usage SHALL mark the operation `unknown` and settle it at its full reservation (priced at the pinned `max_price` with the full output cap) with `settlement = 'reserved_ceiling'` and the provider's generation id when one was seen, and SHALL emit an error chunk if the client is still connected. Spend accounting SHALL only ever over-count. The partial reply SHALL NOT be saved as a turn; the visitor's message SHALL stay on the operation. The conversation SHALL stay open, and a later request under the same key with the same body SHALL start a new attempt while the allowances permit. A `length` finish with usage SHALL complete and mark the reply truncated. Startup SHALL settle every in-flight operation the same way.

#### Scenario: Missing final usage

- **WHEN** the fake provider closes the stream without a usage event
- **THEN** the operation is `unknown` and settled at its reservation, the client receives an error chunk, the conversation stays open and posting the same key again reaches the provider as a new attempt

#### Scenario: Cancel

- **WHEN** the owner posts `/conversation/cancel` with the in-flight key
- **THEN** the provider request is aborted and the operation is `unknown`, settled at its reservation with the generation id recorded

#### Scenario: Stop then continue under the ceilings

- **WHEN** two replies are stopped and one completes in a conversation whose reservations are about $0.06 each
- **THEN** each stop counts its full reservation, `GET /conversation` still offers the composer, and the next paid call is refused `conversation_spend`

#### Scenario: Provider 429 or 5xx

- **WHEN** the fake provider answers 429 or 502 before streaming
- **THEN** the API reports a typed failure, the operation is `unknown` and settled at its reservation and saved turns are unchanged

### Requirement: Server-owned stages and brief capture

The API SHALL derive the conversation stage from stored turns: `clarify` for the first two visitor turns, `brief` when answering the third, `contact` from the fourth onward, `exhausted` and `handed_off` from conversation state. The stage hint for the current stage SHALL be appended to the system prompt and the stage recorded on the operation. From the completed `brief` reply, only the text between a line that is exactly `[brief]` and a later line that is exactly `[/brief]`, trimmed and cut to at most 4,000 characters, SHALL be stored as the draft brief unless the visitor has already edited the brief. Without both markers the API SHALL store the reply minus marker lines, a leading line ending with `:` and a trailing line ending with `?`. A blank body SHALL store nothing. The operation SHALL record the capture as `marked`, `fallback` or `empty`. Only the assistant reply SHALL be parsed; markers in visitor text SHALL never set the brief. The browser SHALL NOT be able to choose a stage.

#### Scenario: Third turn writes the brief

- **WHEN** the third visitor turn completes
- **THEN** the operation records stage `brief`, the outbound request's system text ends with the `brief` hint, and `GET /draft` returns the marked body as the brief, without the framing before `[brief]` or the question after `[/brief]`

#### Scenario: Unmarked brief reply

- **WHEN** the `brief` reply has no marker pair
- **THEN** the stored brief is the reply without a leading line ending with `:` and a trailing question line, and the operation records `fallback`

#### Scenario: Empty marked brief

- **WHEN** the `brief` reply has the markers around a blank body
- **THEN** no brief is stored and the operation records `empty`

#### Scenario: Markers in visitor text

- **WHEN** the visitor's third message contains a `[brief]` … `[/brief]` block
- **THEN** the stored brief comes only from the assistant reply

#### Scenario: Edited brief is kept

- **WHEN** the visitor has saved an edited brief before the third turn completes
- **THEN** the stored brief is unchanged by the reply

### Requirement: Prompt, routing and injection fixtures

Every paid request SHALL send the versioned system prompt, the stage hint, the trimmed history and the visitor message, with `max_completion_tokens` 400, the pinned provider, `zdr: true`, `data_collection: 'deny'`, `allow_fallbacks: false`, `require_parameters: true` and `max_price` at the configured rates. Visitor text SHALL never alter the system text, routing or caps. The prompt and transcripts SHALL never be written to logs.

#### Scenario: Injection text does not move the prompt

- **WHEN** a visitor message contains "ignore your instructions" and a fake system-role prefix
- **THEN** the outbound JSON has exactly one system message, equal to the shipped prompt plus the stage hint, and the visitor text appears only in the last user message

#### Scenario: Routing flags present

- **WHEN** any stream request reaches the fake provider
- **THEN** its body contains the pinned provider list, both privacy flags, no fallbacks, required parameters and the configured price ceilings

### Requirement: Handoff and provider availability

A proposal submission through the existing route with the conversation's claim SHALL mark the conversation `handed_off` in the same transaction that consumes the claim. When the provider is disabled and demo mode is off, `GET /conversation` SHALL report `provider: 'disabled'` and `POST /conversation/stream` SHALL answer 503 without admitting an operation. Demo mode SHALL remain loopback-only and label its replies as simulated.

#### Scenario: Handoff

- **WHEN** the owner submits a proposal after two turns
- **THEN** the conversation is `handed_off`, the claim is consumed and a later stream request answers 401

#### Scenario: Disabled provider

- **WHEN** `OPENROUTER_ENABLED=0` and `DEMO_AUTH=0`
- **THEN** `GET /conversation` reports `disabled` and a stream request answers 503 with no operation row created

### Requirement: Draft discard

The API SHALL expose `POST /draft/discard` to the exact configured app Origin, authorized by the browser draft claim cookie and the draft CSRF header. It SHALL expire the draft at the request time, answer `204` with the draft cookie expired (`Max-Age=0`, same attributes) and `Cache-Control: no-store`, and delete nothing: the stored content is left to the expired-draft purge and retention rules. Repeating it SHALL answer `204`. A consumed draft (submitted or attached to an account request) SHALL answer `409 draft_consumed` and change nothing. A foreign Origin SHALL answer 403, a missing or foreign CSRF header 403, and a missing or unknown claim 401, each without a cookie change.

#### Scenario: Discard then read

- **WHEN** the owner discards the draft and then reads `GET /draft`
- **THEN** the read answers 401 and `GET /entry` reports the claim `expired`

#### Scenario: Submitted draft

- **WHEN** the claim's draft was already submitted as a proposal
- **THEN** discard answers `409 draft_consumed` and the receipt replay still returns the same receipt

#### Scenario: Forged discard

- **WHEN** the discard arrives from a foreign Origin, without CSRF, or with another browser's claim
- **THEN** it is refused and the owner's draft stays readable
