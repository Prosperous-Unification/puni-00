## Historical interaction provenance

The [original rename pair](https://github.com/Prosperous-Unification/puni-00/blob/3eb75e5dc77be331151a132825a5bdb7f4bc3ceb/openspec/changes/writable-step-progress-board/specs/step-progress-board/spec.md#L1) from
`3eb75e5dc77be331151a132825a5bdb7f4bc3ceb` changed the earlier
[read-only interaction requirement](https://github.com/Prosperous-Unification/puni-00/blob/1b94e080b7b52c8babef77a8ff25d3acb9bb9d18/openspec/changes/read-only-step-board/specs/step-progress-board/spec.md#L146)
to “Board interactions are accessible”. The rename is already reflected
in the [canonical destination](https://github.com/Prosperous-Unification/puni-00/blob/3eb75e5dc77be331151a132825a5bdb7f4bc3ceb/openspec/specs/step-progress-board/spec.md#L152).

- Writable delta Git blob `64723bde2e05b4efc5e905ccba2e4884301ee776`
- Exact FROM and TO lines SHA-256 `2f3abdd54d3287fc5dce48716d504f7c9ce3fd63c04a794bd57a46737eed6cad`
- Historical rename section SHA-256 `f612a8396fc8e87acd9520152c0c498a86b1233c355abb5bbf7a2abc0fee5330`
- Canonical spec Git blob `cb9c06439a13dee663d16c0d5e14bbcbed401392`
- Accepted destination fragment SHA-256 `924f9480006c1b80edef3ac6d258db5c7db239e405d190f13fca0eb0b3e351c2`

## MODIFIED Requirements

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

## ADDED Requirements

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
