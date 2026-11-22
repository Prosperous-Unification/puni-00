## ADDED Requirements

### Requirement: The scoped chat continues after submission

After a versioned draft's request is submitted, the conversation on that draft SHALL remain usable on the same claim. New turns SHALL be stored on the same conversation. Every existing turn, spend, concurrency, rate and expiry check SHALL apply to them unchanged.

#### Scenario: A follow-up after submission is admitted on the same conversation

- **WHEN** a visitor submits the request and then sends a chat message under the same claim
- **THEN** the message is admitted, answered and stored on the draft's existing conversation
- **AND** `GET /conversation` returns every earlier turn followed by the new ones

#### Scenario: Allowances still close the chat after submission

- **WHEN** a submitted conversation reaches its visitor-turn or spend allowance
- **THEN** the next message is refused as exhausted with the existing reason
- **AND** Build replaces the composer with an exhaustion line that does not ask the visitor to send the request again

#### Scenario: Erasure fences close a submitted chat

- **WHEN** the submission's retention subject is fenced or erased
- **THEN** new conversation turns on its draft are refused as `draft_unavailable`

#### Scenario: Legacy drafts stay closed after submission

- **WHEN** a legacy (unversioned) draft is submitted
- **THEN** its conversation is no longer available under the claim

### Requirement: One submission per draft

A draft SHALL accept exactly one proposal submission. Replay of that submission's idempotency key with the same body SHALL keep returning its receipt.

#### Scenario: A second submission is refused

- **WHEN** a submitted draft's claim posts `/proposals` with a new idempotency key
- **THEN** the API answers `409` with `draft_submitted` and stores nothing

#### Scenario: A lost response is replayed after follow-up turns

- **WHEN** the browser repeats the original submission after sending follow-up messages
- **THEN** the API returns the original receipt without a new submission

### Requirement: The confirmation is a reply in the thread

When the request is recorded, Build SHALL show a checkmark, “Your request is recorded.” and “PUNI will contact you by email within 4 hours.” as a message in the conversation thread. It SHALL show no Chat more link, no second submission control and no Start over control. The composer SHALL stay open.

#### Scenario: Submitting keeps the composer open

- **WHEN** the server confirms the chat request was saved
- **THEN** the confirmation appears in the thread after the turns sent so far
- **AND** the message composer is available and no submission form or Chat more link is shown

#### Scenario: Reloading a submitted chat

- **WHEN** the visitor reloads Build after submitting and sending follow-ups
- **THEN** the confirmation appears between the turns before submission and the follow-up turns

### Requirement: The model and the operator know about the submission

Replies to follow-up turns SHALL be composed under `puni-scoping-v12` with the submitted state in the context and a hint not to invite another request. The operator inbox SHALL list the visitor's messages sent after submission with the submitted request.

#### Scenario: Follow-up turns reach the operator

- **WHEN** an operator lists submissions after the visitor sent follow-up messages
- **THEN** that submission lists those visitor messages in order

#### Scenario: The model is told the request is submitted

- **WHEN** a follow-up turn is priced and sent to the provider
- **THEN** the composed system text carries the submitted hint and the context says `submitted: true`

### Requirement: The approved response-time sentence passes the screens check

The fe-01 browser screens check SHALL allow exactly “PUNI will contact you by email within 4 hours.” and SHALL keep failing a page that states any other response time.

#### Scenario: A different response-time promise fails

- **WHEN** a captured screen states a response time other than the approved sentence
- **THEN** the W11 check fails
