## ADDED Requirements

### Requirement: Cards represent every leaf step node

The board SHALL draw exactly one card for every leaf work item and project step
in the same delivered plan, keyed by the existing step-node ID. Parents SHALL
have no cards. Cards SHALL remain present for held, unestimated and unscheduled
leaves. Titles, numbers and step names SHALL be labels, never identity.

#### Scenario: Held and unestimated work remains visible

- **WHEN** a delivered plan has two leaves, one held and one unestimated, and two steps
- **THEN** four cards appear even if the schedule contains no slices
- **AND** a parent of those leaves has no card

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

### Requirement: Board interactions are read-only and accessible

The project page SHALL offer Plan and Board view buttons with a discernible
selected state. Plan SHALL remain the initial view. Board selection SHALL persist
only within the current mounted project page. Cards SHALL expose work-item number,
name, step name and separate work-item status as text, with no drag handles or
progress-edit controls. Pointer and keyboard interactions SHALL issue no plan
mutation. At narrow widths columns SHALL stack in the same order without clipping
card text or requiring hover to read it.

#### Scenario: Board selection and attempted dragging

- **WHEN** a user opens Board, navigates with the keyboard or drags a card
- **THEN** the selected state and all card text remain accessible and zero plan mutation requests occur
- **AND** returning to Plan preserves the existing plan surface's behavior
