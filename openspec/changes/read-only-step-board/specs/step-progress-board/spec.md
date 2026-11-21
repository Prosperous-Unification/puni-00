## ADDED Requirements

### Requirement: Cards represent every leaf step node

The board SHALL draw exactly one card for every leaf work item and project step
in the same delivered plan, keyed by the existing step-node ID. Parents SHALL
have no cards. Cards SHALL remain present for held, unestimated and unscheduled
leaves. Titles, numbers and step names SHALL be labels, never identity.
Within each column, cards SHALL preserve delivered work-item order, followed
by that delivered tree's step array order within each leaf.

#### Scenario: Held and unestimated work remains visible

- **WHEN** a delivered plan has two leaves, one held and one unestimated, and two steps
- **THEN** four cards appear even if the schedule contains no slices
- **AND** a parent of those leaves has no card

#### Scenario: Cards in one column preserve nonalphabetic delivered order

- **WHEN** the delivered leaves are `z-leaf` numbered `020`, then `a-leaf` numbered `010`, and the delivered steps are `qa` named QA, then `dev` named Development
- **AND** all four nodes have absent progress
- **THEN** Unknown contains exactly `sn1.z-leaf.qa`, `sn1.z-leaf.dev`, `sn1.a-leaf.qa`, `sn1.a-leaf.dev` in that order
- **WHEN** a later tree delivers the same leaves and reverses the step array
- **THEN** Unknown contains exactly `sn1.z-leaf.dev`, `sn1.z-leaf.qa`, `sn1.a-leaf.dev`, `sn1.a-leaf.qa` in that order, with the same card identities

#### Scenario: Rename and recreate have different identity effects

- **WHEN** a work item is renumbered or a step renamed
- **THEN** its card IDs remain unchanged and labels update
- **WHEN** the step is deleted and recreated with another ID
- **THEN** cards for the old step disappear and the recreated step has new card IDs

### Requirement: Columns state only step progress

The board SHALL contain Unknown, In progress and Done columns in that order.
Absent progress for an existing node SHALL mean Unknown; stored `in_progress`
and `done` SHALL map directly. Every card SHALL occupy exactly one column and
show the containing work item's server-derived status separately. Counts SHALL
count cards. The first board SHALL have no lanes, filters or aggregate parent cards.

#### Scenario: A done node belongs to held work

- **WHEN** a held leaf has one done step and one unstated step
- **THEN** one card is Done and one is Unknown, both separately show the work-item status
- **AND** the hold does not move either card to an invented column

### Requirement: The board shares the current authorized plan lifetime

The board SHALL consume the selected project runtime's delivered tree, including
that tree's own steps, work items, sequence and project revision. It SHALL NOT
combine separate step-list deliveries with an older tree or derive cards from
slices. It SHALL stop showing an old project's cards when its runtime is withdrawn.
Malformed progress, duplicate card identities and progress naming absent steps
SHALL reach a visible error boundary instead of manufacturing Unknown cards.

#### Scenario: A separate step delivery races the tree

- **WHEN** a newer steps resource arrives before its matching tree
- **THEN** the board continues to use the previous tree's steps until the tree is replaced
- **AND** it never draws hybrid cards from the two deliveries

#### Scenario: A prior project answers after switching

- **WHEN** a request from the previous project completes after its runtime was withdrawn
- **THEN** its cards cannot appear in the new project's board

#### Scenario: Trusted progress is malformed

- **WHEN** a production board projection receives a progress value outside the domain union
- **THEN** the error boundary shows a failure rather than counting an Unknown card

### Requirement: Loading empty and failed reads remain distinct

Before the first successful tree, the board SHALL render loading or the read
failure. A successful empty tree SHALL show no work items; nonempty work with no
steps SHALL show no project steps and a control to return to the Plan view.
A later failed read SHALL retain the last delivered cards with a visible stale
warning and Retry. A disconnected stream SHALL have a visible connection warning.
Retry SHALL use the existing runtime read boundary, never create a second feed.

#### Scenario: First read fails

- **WHEN** the first tree read fails
- **THEN** a failure with Retry appears and no empty or Unknown board is inferred

#### Scenario: A later read fails

- **WHEN** cards exist and the next tree read fails
- **THEN** those cards remain visibly stale until a successful retry replaces them

#### Scenario: Empty project differs from missing steps

- **WHEN** a successful plan has no work items
- **THEN** the board explains that there are no work items
- **WHEN** it has leaves but no steps
- **THEN** it explains that no project steps exist and offers return to Plan

### Requirement: Visiting Board preserves unsent Plan edits without submission

Moving focus to the Board selector, activating Board and returning to Plan SHALL
NOT submit an unsent Plan field edit. A suspended unsent draft SHALL retain its
typed text and original baseline despite losing focus, later plan deliveries or
remounting its field face while its identity survives. Merely returning to Plan
SHALL NOT release or submit it. Refocusing the field SHALL resume existing Plan
commit, ordinary leave and abandon behavior. Untouched fields SHALL continue to
reflect delivered values, and Board SHALL show delivered values rather than drafts.
Already-issued requests SHALL retain their existing completion/refusal behavior
without duplication. Suspension SHALL remain local to the current project runtime;
withdrawal or authoritative deletion of its cell identity SHALL discard that hold
without submission or reuse for another identity. Ordinary Plan editing outside
this view handoff SHALL remain unchanged.

#### Scenario: Pointer and keyboard handoff do not submit

- **GIVEN** a Plan cell contains an unsubmitted edit
- **WHEN** pointer or keyboard focus moves to the Board selector, with or without activation
- **THEN** its switch-related blur submits no command and retains the draft
- **WHEN** Board is activated and Plan is subsequently selected
- **THEN** the draft is still present and no command was caused by either view change

#### Scenario: Later delivery cannot erase an unfocused draft

- **GIVEN** a suspended draft and an untouched field in the same plan
- **WHEN** a peer changes their server values while Board is selected or after Plan returns before the draft is refocused
- **THEN** the suspended text and original baseline survive, the untouched field updates, and Board uses delivered values
- **AND** refocusing and deliberately committing the draft uses the existing Plan write behavior exactly once

#### Scenario: A surviving field remounts while Board is selected

- **WHEN** a step-column or responsive-renderer change remounts a suspended field with the same identity
- **THEN** its draft and original baseline remain available on return to Plan without submission
- **WHEN** its row or step is actually deleted and recreated with another identity
- **THEN** the former draft is not restored into that replacement

#### Scenario: An already-issued command finishes during the visit

- **WHEN** a Plan command submitted before switching is acknowledged or refused while Board is selected
- **THEN** existing completion/refusal handling applies without resending or cancelling it
- **AND** an acknowledged update appears in Board through the existing plan delivery

#### Scenario: A suspended draft cannot cross runtime withdrawal

- **WHEN** the project runtime is withdrawn and another is opened, including the same project again
- **THEN** the suspended draft is discarded without submission and cannot appear in the new runtime

## Historical interaction provenance

The [original read-only interaction requirement](https://github.com/Prosperous-Unification/puni-00/blob/1b94e080b7b52c8babef77a8ff25d3acb9bb9d18/openspec/changes/read-only-step-board/specs/step-progress-board/spec.md#L146)
from `1b94e080b7b52c8babef77a8ff25d3acb9bb9d18` was superseded by
the [writable interaction requirement](https://github.com/Prosperous-Unification/puni-00/blob/3eb75e5dc77be331151a132825a5bdb7f4bc3ceb/openspec/specs/step-progress-board/spec.md#L152)
at `3eb75e5dc77be331151a132825a5bdb7f4bc3ceb`. The earlier rule is
historical and the canonical destination records the accepted behavior.

- Read-only delta Git blob `afef7680415455bf7f71f34ca7efa851b55a6fcd`
- Superseded requirement fragment SHA-256 `0de314a9221f19b89278c30f31cd6d30c664125f341048b86b9dcb144c5c402a`
- Canonical spec Git blob `cb9c06439a13dee663d16c0d5e14bbcbed401392`
- Accepted destination fragment SHA-256 `924f9480006c1b80edef3ac6d258db5c7db239e405d190f13fca0eb0b3e351c2`
