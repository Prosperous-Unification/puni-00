## ADDED Requirements

### Requirement: Explicit blockage belongs to one step node and preserves progress

The system SHALL record an explicit step blockage independently from step progress, keyed to one leaf work item and one project step. Setting or clearing blockage SHALL be a journaled command with stale-safe undo and redo. Setting blockage on a step whose progress is `done` SHALL be refused with a typed conflict. Repeated equivalent writes SHALL be no-ops. Progress writes SHALL preserve the blockage fact; a `done` step SHALL read `done` while blockage remains recorded, and reopening the step SHALL reveal the retained blockage. The work-item status fold SHALL remain unchanged.

#### Scenario: Block one step without changing its progress or the work-item status

- **GIVEN** a leaf with `Dev: done`, `QA: in_progress` and no work-item hold
- **WHEN** QA is explicitly blocked
- **THEN** QA reads blocked, Dev remains done, and the work item keeps its existing `in_progress` status

#### Scenario: A completed step cannot be blocked

- **GIVEN** a step whose progress is `done`
- **WHEN** a command attempts to block it
- **THEN** the command returns the modeled conflict and writes no event or blockage fact

#### Scenario: Progress changes preserve the separate blockage fact

- **GIVEN** a blocked step
- **WHEN** its progress is set to `in_progress`, then `done`, then reopened
- **THEN** the blockage remains stored, `done` takes precedence while complete, and the reopened step reads blocked

#### Scenario: Equivalent blockage writes do not journal

- **GIVEN** a step already blocked
- **WHEN** it is blocked again
- **THEN** no event is appended and the working plan is unchanged

### Requirement: Step readings and proxy causes follow the resolved step graph

Every step node SHALL expose its stated blockage and its canonical node reading, retaining `skipped` and `waiting`. A skipped node SHALL read skipped. A done step SHALL read done; a work-item hold SHALL apply to its step nodes; otherwise a direct step blockage SHALL read blocked; otherwise step progress SHALL be read; otherwise a dependency from a blocked, on-hold or proxy-blocked node SHALL derive `blocked_by_proxy`; otherwise the existing waiting rule SHALL apply before unknown. Work-item readiness SHALL remain contextual and SHALL NOT be copied into a step fact or reading. Proxy readings SHALL use every directed FS/SS/FF edge of the complete resolved step graph from unreduced project state, stop at running or done nodes, and identify explicit blockage roots. They SHALL be informational and SHALL NOT claim temporal SS/FF constraints remain unsatisfied. Missing legacy endpoints SHALL be refused. Stepless boundaries MAY carry row holds internally but SHALL NOT appear as public steps or accept blockage writes. They SHALL NOT use the work-item-level leaf expansion for node-scoped relationships. The existing work-item status and proxy readings SHALL remain unchanged.

#### Scenario: A downstream chain names the originating blocked step

- **GIVEN** `A.dev → B.dev → C.dev`, A.dev is blocked, and B.dev and C.dev have no progress
- **WHEN** the plan is read
- **THEN** B.dev and C.dev read `blocked_by_proxy` and identify A.dev as the blockage cause

#### Scenario: A running step stops proxy propagation

- **GIVEN** `A.dev → B.dev → C.dev`, A.dev is blocked, and B.dev is in progress
- **WHEN** the plan is read
- **THEN** B.dev reads `in_progress` and C.dev reads `unknown`

#### Scenario: A different step on the predecessor does not cause a false node proxy

- **GIVEN** A.dev is done, A.qa is blocked, and `A.dev → B.dev`
- **WHEN** the plan is read
- **THEN** B.dev does not read `blocked_by_proxy` from A.qa

#### Scenario: A work-item hold remains visible on all of its step nodes

- **GIVEN** a leaf with `Dev: done`, `QA: unknown` and a work-item hold of `on_hold`
- **WHEN** the plan is read
- **THEN** Dev reads `done` and QA reads `on_hold`

### Requirement: Step blockage never changes the schedule

Adding, clearing or deriving step blockage SHALL NOT change estimates, actuals, assignments, resources, deadlines, dependency inputs, schedule results, canonical schedule hashes, or solver wire contracts. For every plan, canonical schedule input and calculated schedule SHALL be byte-identical with or without step blockage facts.

#### Scenario: A blocked node keeps its forecast

- **GIVEN** a scheduled leaf with a typed step dependency and one step blocked
- **WHEN** canonical schedule input and the schedule are calculated
- **THEN** both are byte-identical to the same plan with no step blockage

### Requirement: Structural edits preserve only blockage that still belongs to the same work

Step blockage SHALL follow the step node when its leaf moves. A step on a parent SHALL never hold blockage. When a leaf gains a first child or another work item moves beneath it, blockage on the now-parent step SHALL be cleared in the same journaled command, handed to the first child only when that child represents the former work; unrelated moved work SHALL NOT inherit it. Duplicating a subtree SHALL NOT copy blockage. Deleting and undoing SHALL restore each blockage exactly. When a parent loses its last child, a step SHALL receive blockage only when every former leaf agreed on that blockage.

#### Scenario: A first child clears the former leaf's blockage

- **GIVEN** a blocked step on a leaf
- **WHEN** a child is created beneath it
- **THEN** the parent has no blockage and the step's prior blockage is handed to the child that represents the former work

#### Scenario: First-child history preserves exact blockage in one action

- **GIVEN** a leaf with blockage timestamps on multiple project steps and retained progress
- **WHEN** its first child is created, the create is undone once, and redone once
- **THEN** each blockage keeps its step and original timestamp, belongs only to the child after create and redo, and belongs only to the parent after undo
- **AND** progress follows the same work without changing its state
- **AND** a changed blockage refuses undo or redo atomically even when the owner revision is unchanged

#### Scenario: A failed first-child insert restores the parent blockage

- **GIVEN** a blocked leaf
- **WHEN** first-child creation clears its blockage and insertion then fails
- **THEN** the transaction restores the original tree, blockage, progress, revisions, journal and event rows

#### Scenario: A duplicate does not inherit blockage

- **GIVEN** a subtree containing a blocked step
- **WHEN** it is duplicated
- **THEN** the copied step is not blocked

#### Scenario: Undo restores deleted blockage facts

- **GIVEN** a blocked step that is deleted with its work item
- **WHEN** the deletion is undone
- **THEN** the restored step is blocked with the same owner and progress

### Requirement: Imports, exports, snapshots and saved plans preserve step blockage

New plan documents and saved-plan bodies SHALL export blockage by work-item and step identity. Import SHALL validate each referenced project, leaf and step, reject duplicate, malformed and parent-owned blockage facts, and write no partial plan on refusal. Older document and saved-plan versions SHALL upgrade with no step blockage. Saved-plan diffs SHALL report blockage changes. A retained working-plan read after a successful command SHALL expose direct blockage, derived step reading and causes; a refused command SHALL leave the read unchanged.

#### Scenario: New-format plan round-trips direct step blockage

- **GIVEN** an exported plan with one blocked step
- **WHEN** the plan is imported and read again
- **THEN** the same leaf and step are blocked and their progress is unchanged

#### Scenario: An older plan imports without step blockage

- **GIVEN** a valid plan document from before step blockage was introduced
- **WHEN** it is imported
- **THEN** it receives no blockage facts and keeps its prior meaning

#### Scenario: A parent-owned or missing-step blockage is refused atomically

- **GIVEN** an import whose blockage addresses a parent or a nonexistent step
- **WHEN** it is validated
- **THEN** import returns a typed invalid-body refusal and writes no partial plan

#### Scenario: Saved-plan comparison identifies blockage changes

- **GIVEN** two saved plans that differ only in a step blockage
- **WHEN** they are compared
- **THEN** the diff identifies the changed work-item and step

### Requirement: Step blockage has an accessible step-scoped control

The step cell and step card SHALL show whether blockage is direct or derived, keep the underlying progress visible, and identify the blocking step cause. A user SHALL be able to set or clear direct blockage from the step-scoped action. The control and reading SHALL be available to assistive technology without relying on color alone. The work-item Status control SHALL NOT present step blockage as a work-item hold.

#### Scenario: A blocked step is operable without confusing it with a row hold

- **GIVEN** a work item whose QA step is blocked
- **WHEN** the row and step controls are read or opened
- **THEN** the work-item status remains unchanged and the accessible QA action offers clearing its direct blockage

#### Scenario: A proxy-blocked step exposes its cause accessibly

- **GIVEN** a step blocked by a predecessor step
- **WHEN** its card is opened or focused
- **THEN** its accessible description names the predecessor step and says the blockage is derived

### Requirement: Deployment refuses to remove stored step blockage during rollback

The step blockage migration SHALL be additive and ship beside a guarded `down.sql`. The swap compatibility guard SHALL detect stored step blockage before removing its schema. The rollback save/remove/restore path SHALL preserve the facts exactly. Saving SHALL exclusively create its destination and refuse an existing path without changing its bytes; a failed guard or restore SHALL refuse deployment loudly with the manual completion command.

#### Scenario: Rollback preserves stored blockage facts

- **GIVEN** a database with step blockage facts and an older image without the new table
- **WHEN** rollback runs
- **THEN** it saves and removes the facts before the old image starts, and restore recreates the exact facts

#### Scenario: A recovery copy cannot be overwritten after removal

- **GIVEN** a recovery file saved before its database facts were removed
- **WHEN** another save targets the same path
- **THEN** it fails without changing the file bytes, and restore recovers every original column

#### Scenario: The schema is not removed when rollback preservation is bypassed

- **GIVEN** a database containing a step blockage fact
- **WHEN** the rollback guard finds no safe preservation path
- **THEN** rollback refuses before dropping the table and prints the manual completion command

### Requirement: Historical parent progress remains readable without becoming a step node

The system SHALL preserve historical parent-owned progress in storage and the existing row fold while excluding it from public leaf node readings. Unknown work-item and unknown step references SHALL still be refused. Deployment SHALL inventory historical parent progress and provide explicit repair without making compatible reads depend on repair.

#### Scenario: Migrated parent progress preserves the existing row fold

- **GIVEN** a migrated plan with progress on a known parent and a known project step
- **WHEN** isolated or shared live reads project its nodes
- **THEN** the row fold retains its existing meaning, parent progress remains stored, and only leaf nodes expose readings

#### Scenario: Unknown progress references remain invalid

- **GIVEN** progress referring to a missing work item or project step
- **WHEN** node readings are projected
- **THEN** the read refuses malformed trusted state rather than treating it as historical parent progress

### Requirement: Structural commands preserve progress ownership and refuse stale replay

Moving unrelated work beneath a leaf SHALL clear and journal the destination's progress before the store move, preserve incoming progress, restore destination progress after inverse movement, and clear it before redo. Last-child moves SHALL NOT add progress hand-up. Move and delete undo SHALL refuse atomically when the destination parent gained newer progress, preserving the newer facts and tree even if ordinary revision checks do not detect the change.

#### Scenario: Destination progress is cleared before move and restored after undo

- **GIVEN** destination Dev is done and incoming Dev is in progress, with or without retained blockage
- **WHEN** the incoming row moves beneath the destination, is undone, and is redone
- **THEN** destination progress is cleared before each forward move, restored after undo, and incoming progress is preserved throughout

#### Scenario: Blockage retained through completed progress survives structural replay

- **GIVEN** a blocked step later marked done on a leaf
- **WHEN** another row moves beneath it, then the move is undone and redone
- **THEN** the leaf facts are restored exactly on undo and cleared before redo without changing progress hand-up rules

#### Scenario: Stale last-child move and delete undo preserve newer progress

- **GIVEN** moving or deleting the last child makes a parent a leaf and another actor then states progress on it
- **WHEN** the original actor undoes the move or deletion
- **THEN** replay refuses without changing the tree or overwriting the newer progress

### Requirement: Stored cycles preserve readable unscheduled plans

A stored dependency cycle SHALL preserve the existing readable plan and modeled schedule error. Node roots SHALL converge over the complete graph without inventing roots or dropping edges, while progress and running barriers retain precedence. Write-time dependency cycle refusal SHALL remain unchanged. A missing legacy endpoint SHALL still be refused as malformed trusted state.

#### Scenario: A stored cycle remains readable

- **GIVEN** a stored dependency cycle that cannot be scheduled
- **WHEN** isolated or shared plan reads project canonical node readings
- **THEN** the plan remains readable with `scheduleError: 'cycle'`, and silent nodes without roots remain unknown

#### Scenario: An explicit root converges around a stored cycle

- **GIVEN** a cycle containing one directly blocked node
- **WHEN** node roots are projected
- **THEN** each reachable silent node names that root exactly once, and running or done nodes stop incoming propagation

### Requirement: Move closure preserves direct blockage facts in one undo unit

When unrelated work moves beneath a current leaf, the system SHALL clear that
leaf's direct blockage before the store move, preserve all incoming subtree
facts, and restore the destination's exact owner, step and blocked time after
inverse movement. Redo SHALL conditionally clear those destination facts before
moving. Same-parent reorder SHALL preserve existing parent history.

When a move removes a parent's last child, the parent SHALL receive a direct
blockage for a step only if every former leaf has a direct fact for that step.
Its blocked time SHALL be the maximum original blocked time, including negative
timestamps and facts retained beneath done progress. Such a move SHALL NOT hand
up progress. Replay SHALL allow historical destination progress only when its complete set
exactly matches the predeparture snapshot by owner, step, state and stated time,
independently of order. These historical rows SHALL remain unchanged in place.
Absent snapshot SHALL require empty destination progress. Replay SHALL refuse
atomically for added, removed or changed progress and for any residual blockage,
including another project step, even if revisions remain unchanged. Captured
historical owners SHALL remain revision-tracked across undo, redo and subsequent
undo without adding unrelated owners.

#### Scenario: Last-child move hands up only complete direct agreement

- **GIVEN** a branch has two former leaves with direct Dev facts at -30 and -10, including a done leaf, and only one has a QA fact
- **WHEN** that branch moves away as its parent's last child
- **THEN** the parent receives Dev blockage at -10, receives no QA blockage and no progress, and the incoming facts remain unchanged

#### Scenario: Move replay refuses residual facts atomically

- **GIVEN** a move made a parent into a leaf and a peer added progress or another-step blockage without changing its revision
- **WHEN** undo would move the subtree beneath that leaf again
- **THEN** replay refuses and preserves the full tree and facts, including earlier conditional clears in the same batch

#### Scenario: Duplicate blockage is not inherited

- **GIVEN** a blocked leaf or a subtree containing blocked descendants
- **WHEN** that leaf or subtree is duplicated
- **THEN** the originals retain their exact facts and the copies have no blockage

#### Scenario: Historical parent progress survives an immediate move undo

- **GIVEN** a known parent holds historical Dev done progress at stated time 123 and has one child
- **WHEN** that child moves to a root, the move is undone and redone
- **THEN** the historical progress and every stored column remain unchanged, and immediate undo succeeds

#### Scenario: Historical move replay refuses a changed complete snapshot

- **GIVEN** an inverse move captured the old parent's historical progress
- **WHEN** a fact changes state or stated time, a different step is added, or a captured fact is removed without changing owner revisions
- **THEN** undo refuses atomically and preserves the current tree and all current facts
