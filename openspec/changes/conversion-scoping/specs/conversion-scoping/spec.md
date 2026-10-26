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

### Requirement: Paid readiness requires verified effective pricing

Paid admission SHALL require explicit verified maximum effective input/output rates covering cache reads, cache writes and every applicable pricing tier, separately from base-price routing limits. Missing ceilings SHALL leave inference unconfigured with manual conversion available. Malformed rates SHALL fail at the configuration boundary. Missing metadata SHALL NOT imply free caching or a universal multiplier.

#### Scenario: Existing enabled configuration lacks verified ceilings

- **WHEN** a previously enabled configuration has only base input/output rates
- **THEN** paid admission refuses before a provider call, while the saved brief and manual submission remain available

### Requirement: Reservations cover cache and tier pricing

Reservations SHALL use the conservative serialized-input token bound and full configured completion cap at verified effective ceilings. Reservations SHALL be positive safe integer micro-USD; an unsafe amount SHALL refuse before paid transport.

#### Scenario: Base-price routing does not bound cache writes

- **WHEN** base input/output prices are USD0.11/0.55 per million and verified effective ceilings are USD0.275/0.825
- **THEN** reservation uses the effective ceilings while routing retains the base-price limits

### Requirement: Settlement preserves reported provider charges

Known settlement SHALL be the greater of the base-rate token estimate and validated provider charge, rounded upward to safe integer micro-USD. Reasoning SHALL remain included in completion once. Missing or malformed counts or charge SHALL retain the full reservation as unknown. An explicit zero charge SHALL preserve a nonzero token floor. Above-reservation charges SHALL remain recorded without clamping and preserve the existing overspend pause.

#### Scenario: Cache write costs more than base input pricing

- **WHEN** known tokens imply 401 micro-USD but the provider reports USD0.0004896925
- **THEN** the operation accounts for 490 micro-USD, and its reservation was calculated from explicit verified effective-rate ceilings

#### Scenario: Missing charge despite known token counts

- **WHEN** a final response has valid prompt/completion counts but absent, negative, nonfinite or unsafe provider charge
- **THEN** the operation follows the existing unknown/full-reservation path without claiming a zero or base-rate actual charge

### Requirement: Evaluation verifies complete pricing coverage

Bounded evaluation SHALL validate complete cache and tier pricing before inference, derive and record conservative ceilings without runtime configuration mutation, and account for final cumulative usage once. Missing or malformed pricing SHALL refuse instead of guessing a surcharge.

#### Scenario: Endpoint cache or tier evidence is incomplete

- **WHEN** a bounded evaluation prepares to call the pinned endpoint but cache or tier pricing is missing or malformed
- **THEN** host preflight refuses before any paid inference request

### Requirement: Evaluation distinguishes exploratory closure from a project brief

An explicitly exploratory scenario SHALL accept a committed structured ending without a question or brief only when it supplies meaningful exploratory guidance without inventing a project. Ordinary scenarios SHALL retain their brief or planned-answer expectations. Malformed or conflicting exploration settings SHALL fail before inference. Missing, invalid or uncommitted output SHALL NOT satisfy an exploratory ending.

#### Scenario: Curiosity concludes without a forced project

- **WHEN** an opted-in AI-curiosity scenario receives a committed browsing or example-oriented next step with neither question nor brief
- **THEN** evaluation terminates that scenario successfully while retaining stored-text equality and safety checks

#### Scenario: Ordinary scoping loses its next step

- **WHEN** the same response occurs in a scenario requiring a brief or another selected answer
- **THEN** evaluation fails instead of globally accepting null-question replies

### Requirement: The catalogue owns selected-question wording

The structured prompt SHALL instruct selected-question messages to be contextual declarative acknowledgements, without repeating or paraphrasing the catalogue question, listing its choices or adding a prose question. This prompt revision SHALL be recorded as `puni-scoping-v3`; protocol version1, historical prompt records and saved replay SHALL remain compatible. Legacy `puni-sales-v3` SHALL remain unchanged.

#### Scenario: Evaluation catches the observed paraphrased question

- **WHEN** a selected-question acknowledgement asks a prose question before the catalogue question is rendered
- **THEN** the evaluator quality assertion fails and paid mode stops before another turn; a declarative acknowledgement passes

#### Scenario: Historical structured output is replayed

- **WHEN** an existing `puni-scoping-v1` or `puni-scoping-v2` operation is replayed under the new runtime
- **THEN** its saved reply and recorded identity remain unchanged without another provider call, while new operations record `puni-scoping-v3`

### Requirement: Grounded judgment advances the conversation

The structured prompt SHALL connect supplied facts concisely when they support useful judgment, without forcing insight or repeating established caveats without new reason. At useful handoff it SHALL suggest a focused possible first review step, distinct from visitor requirements. Unknowns SHALL remain explicit; causes, evidence, technology, users and requirements SHALL NOT be invented, and outcomes SHALL NOT be promised.

#### Scenario: New context narrows the useful review

- **WHEN** recurring bugs are followed by a payments goal and a recent payment failure
- **THEN** the acknowledgement connects the new payment context without repeating a generic inspection caveat, and the handoff suggests a focused review of the reported payment path without claiming a cause or completed inspection

#### Scenario: A vague starter has no supported insight yet

- **WHEN** the visitor supplies only Improve my app
- **THEN** a short acknowledgement and the first relevant catalogue question suffice, without invented facts or a forced diagnosis

#### Scenario: Existing visitor choices retain their meaning

- **WHEN** the conversation follows any of the six routes, exploration, references, corrections, a concern, an early/immediate brief or declined email
- **THEN** the existing adaptive behavior and explicit optional human-review rules remain intact, and review suggestions do not become fabricated visitor requirements

#### Scenario: Qualitative acceptance remains separate

- **WHEN** deterministic prompt identity, replay and envelope checks pass
- **THEN** useful judgment and non-repetition remain unverified until complete actual synthetic conversations pass all five qualitative dimensions; the failed v2 pilot remains historical failure evidence
