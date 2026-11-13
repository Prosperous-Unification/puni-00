# Step Progress Board Specification

## Purpose

Show every leaf step node's delivered progress in a project Board while preserving its identity, project lifetime and Plan editing handoff.

## Requirements

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

### Requirement: Board interactions are accessible

The project page SHALL offer Plan and Board view buttons with a discernible selected state. Plan SHALL remain the initial view. Board selection SHALL persist only within the current mounted project page. Cards SHALL expose work-item number, name, step name and separate work-item status as text. Each card SHALL offer a labeled progress control usable by keyboard and touch, and a card SHALL be draggable to another progress column. Both interactions SHALL send the same existing step-progress command for that card's stable work-item and step pair. At narrow widths columns SHALL stack in the same order without clipping card text or requiring hover to read it.
The hidden Plan SHALL NOT handle global undo/redo or open its interaction controls while Board is selected; hiding or making its DOM inert alone is insufficient. Passive navigation, selection, cancelled or outside drops, same-column drops and view changes SHALL issue no plan mutation.

#### Scenario: Board selection and attempted dragging

- **WHEN** a user opens Board, navigates its cards with keyboard or pointer, cancels a drag, drops outside its columns or returns to Plan
- **THEN** the selected state and card text remain accessible and zero plan mutation requests or journal entries result from those interactions
- **AND** returning to Plan preserves its existing editing and undo behavior

#### Scenario: Deliberate progress change by keyboard or touch

- **WHEN** a user activates a card's labeled progress control for another column
- **THEN** it submits the same command and shows the same delivered card state as dragging that card to that column
- **AND** focus remains usable after the delivered card changes columns

### Requirement: Card movement writes only existing step progress

A deliberate move SHALL send exactly one existing step-progress command for the card's stable work-item and step pair. Unknown SHALL clear the statement. The move SHALL NOT directly write work-item status, attempts, other independent facts or node readings. Other stored facts SHALL retain their values; server-derived status and node readings SHALL recompute and render from the delivered tree. Cards SHALL move only after delivery.

#### Scenario: Set one node's progress

- **WHEN** an Unknown card for a leaf's first step moves to In progress or Done while its second step has progress
- **THEN** exactly one `setProgress` command names the first step's work-item ID, step ID and destination state
- **AND** the second step's progress and other work-item facts are unchanged
- **AND** the card changes column only when a covering tree is delivered

#### Scenario: Clear one node's progress

- **WHEN** a Done or In progress card moves to Unknown
- **THEN** exactly one `clearProgress` command names that card's work-item ID and step ID
- **AND** the next delivered tree with absent progress places the same card identity in Unknown

#### Scenario: Correct progress independently of status

- **WHEN** a Done card on a held work item moves to In progress
- **THEN** the step's progress changes through `setProgress` and the work item remains held
- **AND** no attempt or work-item status command is sent

#### Scenario: Derived status follows delivered progress

- **WHEN** a leaf's sole step moves from Unknown to Done and its covering tree reports the leaf's derived status as Done
- **THEN** the card appears in Done with the newly delivered Done work-item status label
- **AND** the Board sent no separate status or node-reading write

### Requirement: A Board gesture is bound to its current delivered subject

The Board SHALL bind a move to the selected runtime, stable work-item ID, step ID and observed progress. Before dispatch it SHALL require a current runtime, usable latest tree and the same leaf step node with unchanged progress. The destination SHALL come from the Board's target, never external drag payload text. A pending action SHALL block duplicate requests.

#### Scenario: Rename during drag

- **WHEN** a dragged card's work item or step is renamed before drop but its stable pair and progress remain
- **THEN** the drop still targets that pair and the latest labels render
- **WHEN** an unrelated tree delivery arrives before drop
- **THEN** the still-current subject can move normally

#### Scenario: Peer changes the dragged node

- **WHEN** a newer delivered tree changes the dragged step node's progress before drop
- **THEN** the Board cancels the gesture, reports that the card changed and sends no request

#### Scenario: Subject disappears or runtime is withdrawn

- **WHEN** the captured step is deleted and recreated with a different ID, its work item becomes a parent, or the captured project runtime is withdrawn before dispatch
- **THEN** the Board sends no command and never retargets by label or replacement identity

#### Scenario: Unusable tree or repeated activation

- **WHEN** the first tree has failed or the current tree is marked stale at activation
- **THEN** the Board offers Retry and sends no move command
- **WHEN** a move is pending and the user activates the same or another target again
- **THEN** no second request is sent until the first action settles

### Requirement: Board writes share Plan recovery and undo

A Board progress command SHALL use the current runtime's writer, refresh, refusal reporting and server journal. The Board SHALL keep delivered card placement through refusals and failed covering reads, with read-only Retry. Returning to Plan SHALL expose the existing undo and redo. A withdrawn runtime's late completion SHALL NOT affect another project.

#### Scenario: Refusal and failed covering read

- **WHEN** a Board progress command is refused
- **THEN** no optimistic card relocation occurs and one readable refusal appears using existing recovery reads
- **WHEN** a command succeeds but its covering read fails
- **THEN** the last delivered card stays visibly stale and Retry never resubmits the command

#### Scenario: Undo and redo after a Board move

- **WHEN** one Board move is delivered and the user returns to Plan
- **THEN** one normal undo entry reverses that step's previous progress or absence and redo restores the move
- **AND** view switching adds no undo entry
- **WHEN** that undo is stale
- **THEN** the existing refusal is shown and the tree is reread

#### Scenario: An old project answers late

- **WHEN** an old runtime's Board command completes after another project is selected
- **THEN** its response cannot move the new project's card or show an old-project refusal

### Requirement: Board progress writes preserve suspended Plan drafts

A Board command SHALL not submit, recreate or erase an unsent Plan draft suspended for the current runtime. Its text and original baseline SHALL survive Board delivery and remain available on return to Plan while the field identity exists.

#### Scenario: Peer delivery during a Board visit

- **GIVEN** a suspended unsent Plan draft
- **WHEN** a Board move and a later tree delivery occur
- **THEN** the Board shows delivered progress and returning to Plan shows the draft's text and original baseline without a draft command
