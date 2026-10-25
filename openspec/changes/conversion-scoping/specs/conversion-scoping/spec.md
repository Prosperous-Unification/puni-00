## ADDED Requirements

### Requirement: Starting choices and services agree

The landing page SHALL offer Launch an app or website, Improve my app, Build something similar, Get an AI assistant, Automate my work, and Help me choose, alongside free text. The services section SHALL explain the first five offers through outcomes and concrete examples, with each CTA selecting its matching starting choice. Help me choose SHALL remain a navigation aid rather than a sixth service.

#### Scenario: Service CTA starts the corresponding request

- **WHEN** a visitor chooses the existing-app service CTA after entering a description
- **THEN** the app receives Improve my app and the unchanged description, without a second category question or Send

#### Scenario: No writing is required to begin

- **WHEN** a visitor selects any of the six starting choices without typing
- **THEN** the app opens the corresponding conversation with that choice recorded

### Requirement: Landing intent authorizes one initial reply

A deliberate starting-choice click or typed-request submission SHALL authorize the initial model operation under the existing browser claim, CSRF, browser check and allowance. Reloads and concurrent tabs SHALL reuse its server identity. Ordinary visits SHALL NOT initiate inference. Legacy drafts without recorded start intent SHALL retain explicit Send.

#### Scenario: Reload does not purchase a second reply

- **WHEN** a newly started conversation is reloaded or opened in another tab
- **THEN** it resumes or replays the same initial operation, with at most one provider call for that operation

#### Scenario: Interrupted initial reply needs explicit retry

- **WHEN** the initial reply was stopped or ended with unknown usage
- **THEN** reopening shows the saved attempt and Retry rather than automatically generating another reply

### Requirement: Suggested answers are an accessible alternative to typing

Each scoping question SHALL offer relevant suggested answers and an uncertainty response alongside free text. Selection SHALL submit once. Prior answers SHALL be correctable without rewriting the transcript or resetting the allowance. Stale choices SHALL be refused before inference.

#### Scenario: Complete the existing-app route through choices

- **WHEN** a visitor selects Improve my app, recurring bugs, payments, and accept payments
- **THEN** they can reach an editable brief and human-review invitation without typing until the email field

#### Scenario: Correct an earlier answer

- **WHEN** the visitor corrects payments to sign-in
- **THEN** the updated brief reflects sign-in, preserves the correction history and does not replenish used turns

### Requirement: Progression follows the visitor's situation

The assistant SHALL reuse supplied information, answer relevant visitor questions, ask at most one scoping question per reply, and offer a specific starting point with uncertainty where inspection is needed. The server SHALL derive available actions from validated reply content and persisted state rather than a fixed turn number. A model response SHALL NOT submit a request or alter spending policy.

#### Scenario: Detailed opening skips redundant questions

- **WHEN** the visitor says checkout broke after a login change and they want to start charging customers
- **THEN** the assistant identifies the sign-in-to-payment journey as an inspection focus and does not ask for the already stated goal

#### Scenario: Missing facts remain missing

- **WHEN** the visitor only selects recurring bugs
- **THEN** neither the conversation nor brief invents payment failures, technology choices, revenue loss or inspection findings

#### Scenario: Invalid provider reply

- **WHEN** the provider returns malformed structured content, an unknown question identifier or a truncated envelope
- **THEN** the app shows an explicit interrupted-reply state with manual continuation, creates no fabricated question or brief, and accounts for the attempt

### Requirement: References remain optional and accurate

All service paths SHALL offer an optional place for multiple references and what to borrow, change or avoid. References SHALL survive reload, brief edits and submission. Supplied URLs SHALL NOT be fetched automatically or described as inspected.

#### Scenario: Add references after editing the brief

- **WHEN** a visitor edits their brief and then adds two links with descriptions
- **THEN** their edits and both references remain visible in the submitted request and operator inbox

#### Scenario: Skip references

- **WHEN** a visitor selects No references yet or I'll share it later
- **THEN** they proceed without a required reference field or repeated reference invitation

### Requirement: Human review is explicit and available early

The default email invitation SHALL follow a useful visible brief and explain the human-review offer. A visitor SHALL also be able to request review early or continue without email. Email presence in chat SHALL NOT submit or subscribe the visitor. Only explicit submission SHALL create a proposal request containing the reviewed brief and references.

#### Scenario: Decline contact

- **WHEN** a visitor chooses Keep exploring
- **THEN** their brief remains available, contact is not repeatedly requested, and any further inference stays within the same allowance

#### Scenario: Explicit submission and retry

- **WHEN** a visitor submits their edited brief and email and retries after a lost response
- **THEN** the same request is confirmed once and its receipt does not imply an email was sent unless delivery is actually implemented

### Requirement: Failure and spending limits preserve manual conversion

The system SHALL retain the documented conversation, source, site, concurrency and provider-policy controls. Disabled inference, provider failure, invalid replies and exhausted allowances SHALL leave the visible brief, reference editing and manual submission available. The final available reply SHALL prioritize a useful handoff over opening another question.

#### Scenario: Last allowed reply

- **WHEN** the eighth visitor turn is admitted
- **THEN** the assistant is instructed to summarize what is known, identify uncertainties and offer manual continuation without asking a new scoping question

#### Scenario: Concurrent reservations

- **WHEN** concurrent paid attempts would exceed the site ceiling
- **THEN** excess attempts are refused before calling the provider and admitted attempts remain included in reserved spend

### Requirement: Privacy copy describes the actual flow

The public privacy notice and contextual explanations SHALL describe anonymous claims, conversation and reference content, AI routing and hosting, human-review email use, abuse controls, and the verified retention/deletion process. They SHALL distinguish PUNI storage from provider retention. Submission SHALL NOT imply newsletter consent. Analytics disclosure SHALL match the separately implemented consent policy.

#### Scenario: Provider and retention evidence disagree with draft copy

- **WHEN** the deployed endpoint or cleanup mode differs from the proposed privacy text
- **THEN** release verification fails until the text and verified behavior agree; a draft expiry or report-only retention process is not described as completed deletion

#### Scenario: Anonymous visitor reads the notice

- **WHEN** the visitor opens Privacy from the landing page, chat or email card
- **THEN** the notice is accessible without sign-in and does not claim prospect accounts exist
