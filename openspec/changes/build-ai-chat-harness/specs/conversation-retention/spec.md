## ADDED Requirements

### Requirement: Conversation content is request content

Retention content predicates SHALL treat `conversation_turn.content` and `conversation_operation.message` and `reply` as request content of the subject whose `draft_id` owns the conversation, for both account-owned software requests and standalone proposal submissions. Erasure of a due non-client subject SHALL blank those columns in the same transaction as the rest of its content while retaining `reserved_micro_usd`, `settled_micro_usd`, `utc_day`, `prompt_version` and the salted source hash. The count-only report SHALL include conversation content in its coverage.

#### Scenario: Due subject with a conversation

- **WHEN** a due non-client proposal submission's draft owns a conversation with turns
- **THEN** erasure leaves no turn or operation text in the active database and keeps the accounting columns

#### Scenario: Anchor precedes conversation

- **WHEN** a software request is attached from a draft that already has conversation turns
- **THEN** the subject anchors to the draft's first content and is not reported ambiguous

### Requirement: Expired-draft conversations are purged

The explicit expired-draft purge SHALL delete a conversation and its turns and operations when their draft expired unconsumed and has no proposal submission, in the same transaction as the draft, after the count-only plan names the conversation counts. An operation in state `unknown`, and any operation whose UTC day is on or after the cutoff's UTC day, SHALL be retained with blanked text as an accounting row, so that day's spend stays in the ceilings.

#### Scenario: Purge with turns

- **WHEN** an expired, unconsumed draft owns a conversation with completed turns
- **THEN** the plan counts them, the apply removes the draft, conversation, turns and completed operations, and nothing references the draft afterwards

#### Scenario: Unknown usage survives purge

- **WHEN** an expired draft's conversation holds an `unknown` operation
- **THEN** the apply blanks its text, keeps the row and its ceiling settlement, and reports the retained count

#### Scenario: Same-day operations survive purge

- **WHEN** the cutoff falls on the UTC day of an expired draft's completed operations
- **THEN** the plan retains them, the apply blanks their text and the day's spend total is unchanged
