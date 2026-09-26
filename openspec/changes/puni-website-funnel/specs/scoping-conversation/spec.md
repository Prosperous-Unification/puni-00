## ADDED Requirements

### Requirement: Bounded prospect conversation

The API SHALL accept scoping turns only from the request owner after explicit send. Pilot admission SHALL enforce 4,000 characters per later message, at most 12 user turns per brief including the original description, one active inference per account, four site-wide, two active briefs per account, 1,024 completion tokens and a 30-second server deadline. The UI SHALL show remaining allowance and offer brief review or proposal request when a limit is reached.

#### Scenario: Explicit first send

- **WHEN** sign-in attaches the original description but the prospect has not selected Send
- **THEN** the description is visible as an unsent composer draft and no provider call occurs

#### Scenario: Turn, concurrency or active-brief limit

- **WHEN** a request crosses a configured turn, length, concurrency or active-brief limit
- **THEN** the API refuses inference before the provider call, preserves saved work and offers review/submission

### Requirement: Conservative paid admission and settlement

Before a paid call, the API MUST atomically reserve a conservative worst-case amount against proposed pilot allowances of $0.50 per brief including preview, $1 per account per UTC day and $10 site-wide per UTC day; the dedicated key SHALL have a $100 monthly ceiling. Missing key, price, allowance or compatible endpoint MUST disable inference visibly. Cancellation, timeout, stream failure or missing final usage MUST retain an unsettled reservation until bounded reconciliation; unresolved usage MUST block further spend. No ambiguous generation SHALL be automatically retried.

#### Scenario: Concurrent budget boundary

- **WHEN** parallel calls would exceed any allowance after reservations
- **THEN** at most the affordable calls reach OpenRouter and the others receive a visible limit response

#### Scenario: Missing configuration

- **WHEN** the key, model price or any required allowance is absent or malformed
- **THEN** inference remains disabled and the manual proposal path remains available

#### Scenario: Cancelled stream without usage

- **WHEN** a client disconnects after generation begins but before final usage arrives
- **THEN** the generation stays unsettled, its reservation remains held, and bounded reconciliation or an operator hold determines the next admission

### Requirement: Restricted scope and provider

The API SHALL use a server-selected vetted model/provider with verified ZDR and data-collection denial, no model tools or remote fetches, and no browser-selected model. It SHALL redirect unrelated questions, refuse harmful software requests, protect system instructions and secrets, and validate all structured output before persistence. Paid refusals SHALL consume recorded usage.

#### Scenario: Scope and injection corpus

- **WHEN** the prelaunch abuse corpus submits unrelated, harmful and instruction-override requests through the production conversation path
- **THEN** the responses stay within policy, expose no secrets, and count any provider usage against the prospect's allowance

#### Scenario: Provider error

- **WHEN** OpenRouter returns 402, 403, 429, 5xx or a mid-stream error
- **THEN** the UI reports a usable failure state while preserving saved turns and accounting uncertainty
