## ADDED Requirements

### Requirement: Bounded prospect conversation

The API SHALL accept conversation turns only from the draft claim's browser after explicit Send. Admission SHALL enforce the conversation allowance of `anonymous-conversation`: 1,500 characters per later message, at most 8 visitor turns per conversation including the Home request, one in-flight operation per conversation, four in-flight paid calls site-wide, the configured completion cap and a 30-second server deadline. `GET /conversation` SHALL report `visitorTurnLimit` and `visitorTurnsRemaining`, and the UI SHALL render both from that response and offer brief review or a proposal request when a limit is reached.

#### Scenario: Explicit first send

- **WHEN** Build loads the saved Home request and the visitor has not pressed Send
- **THEN** the description is visible as an unsent composer draft and no provider call occurs

#### Scenario: Turn, concurrency or active-brief limit

- **WHEN** a request crosses a configured turn, length, concurrency or active-brief limit
- **THEN** the API refuses inference before the provider call, preserves saved work and offers review/submission

### Requirement: Conservative paid admission and settlement

Before a paid call, the API MUST atomically reserve the byte-bound input estimate plus the configured completion cap at the pinned rates against $0.15 per conversation, $0.30 and three conversations per source per UTC day and $10 site-wide per UTC day; the dedicated key SHALL have a $100 monthly ceiling. Missing key, price, allowance or compatible endpoint MUST disable inference visibly. Cancellation, disconnect, timeout, non-refusal stream failure or missing final usage MUST settle the operation at its full reservation, keep the conversation open and allow a new attempt under the same key; recorded spend MAY over-count and SHALL never under-count. The operator overview SHALL show the day's count and amount of ceiling-settled operations. No ambiguous generation SHALL be automatically retried.

#### Scenario: Concurrent budget boundary

- **WHEN** parallel calls would exceed any allowance after reservations
- **THEN** at most the affordable calls reach OpenRouter and the others receive a visible limit response

#### Scenario: Missing configuration

- **WHEN** the key, model price or any required allowance is absent or malformed
- **THEN** inference remains disabled and the manual proposal path remains available

#### Scenario: Cancelled stream without usage

- **WHEN** a client disconnects after generation begins but before final usage arrives
- **THEN** the operation is settled at its full reservation, the conversation stays open and the next admission counts that amount

### Requirement: Restricted scope and provider

The API SHALL use a server-selected vetted model/provider with verified ZDR and data-collection denial, no model tools or remote fetches, and no browser-selected model. It SHALL redirect unrelated questions, refuse harmful software requests, protect system instructions and secrets, and validate all structured output before persistence. Paid refusals SHALL consume recorded usage.

#### Scenario: Scope and injection corpus

- **WHEN** the prelaunch abuse corpus submits unrelated, harmful and instruction-override requests through the production conversation path
- **THEN** the responses stay within policy, expose no secrets, and count any provider usage against the prospect's allowance

#### Scenario: Provider error

- **WHEN** OpenRouter returns 402, 403, 429, 5xx or a mid-stream error
- **THEN** the UI reports a usable failure state while preserving saved turns and accounting uncertainty
