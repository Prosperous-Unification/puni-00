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

### Requirement: Move replay checks destination progress before clearing any recorded step

A move that clears destination progress SHALL journal a complete progress snapshot
for that owner in replay preconditions. Undo and redo SHALL compare the complete
current owner/step/state/stated-time set before applying any batch step. Changed,
added or removed progress SHALL refuse atomically even when owner revisions do not
change. Successful replay SHALL capture the actual restored timestamps for the
next direction. Neighboring replay SHALL refresh a destination snapshot only
where the existing revision-equality rebase condition holds. Snapshot owners and
steps SHALL participate in scope checks; malformed metadata SHALL refuse as
trusted-state corruption rather than default to absence.

#### Scenario: Redo preserves a changed recorded destination step

- **GIVEN** destination Dev was done before an unrelated move and undo restored it
- **WHEN** its state or stated time changes, or the fact is removed, without changing owner revisions
- **THEN** redo refuses before clearing Dev and preserves every current tree/fact/event row

#### Scenario: Neighboring progress replay restamps a valid destination snapshot

- **GIVEN** a progress command precedes a move that clears that destination
- **WHEN** both commands are undone and redone through matching owner revisions
- **THEN** the move uses the newly restored progress timestamp and replays successfully
- **AND** mismatched owner revisions retain the stale snapshot and refuse

### Requirement: Compose admits guarded move history only to capable images

The incoming image SHALL advertise `move_progress_v1` independently of command
discriminators. An independent database inventory SHALL require this capability
once per journal row containing `move.expectedProgress` in either direction or
`Preconditions.moveProgress`, including nested commands and empty arrays/maps.
Both the pre-migration and after-writer-stop Compose checks SHALL refuse images
lacking the capability. Malformed trusted preconditions SHALL refuse inventory.

#### Scenario: Prior blockage support cannot admit guarded move history

- **GIVEN** the database has only guarded move history and no blockage facts or replacement commands
- **WHEN** an image advertises no replay capabilities or only `replace_blockage`
- **THEN** Compose refuses before migration and stops the candidate

#### Scenario: Guarded move history appears before the outgoing writer stops

- **GIVEN** the first inventory is empty and the incoming image lacks `move_progress_v1`
- **WHEN** nested inverse or precondition snapshot history appears before the after-stop inventory
- **THEN** the swap refuses after the outgoing writer stops and never commits the candidate

### Requirement: Progress snapshot rebase follows exact replay writes

A guarded move snapshot SHALL refresh only for exact progress pairs written by the
actual selected replay command, recursively through batches and explicit
structural progress rows. Before replay, the system SHALL capture guarded owner
sets. Existing revision eligibility SHALL remain required. Captured and recorded
facts outside the replay's write pairs SHALL match completely, including absence;
a mismatch SHALL preserve the full stale snapshot. On a match, written pairs
SHALL use actual post-replay facts while unwritten pairs retain recorded facts.
The system SHALL NOT infer progress write permission from a row rename or a write
to another step on that owner.

#### Scenario: Rename cannot accept a silently changed destination fact

- **GIVEN** undo restored a guarded move destination and its Dev state/time then changed without an owner revision
- **WHEN** a neighboring rename is undone and redone
- **THEN** the move snapshot remains stale and move redo refuses without changing current facts

#### Scenario: Dev replay cannot accept unrelated QA changes

- **GIVEN** a guarded move snapshot records destination Dev and QA
- **WHEN** QA changes or disappears without a revision while a neighboring Dev progress command, optionally batched with rename, is undone and redone
- **THEN** the complete stale snapshot remains unchanged and move redo refuses atomically
- **AND** an added QA fact is equally refused even if no QA was originally recorded

#### Scenario: Unchanged QA survives a valid Dev timestamp chain

- **GIVEN** a guarded move destination's QA fact is unchanged
- **WHEN** the neighboring Dev progress command is undone and redone through matching revisions
- **THEN** only Dev's snapshot changes, QA's stored columns remain unchanged, and move redo succeeds

### Requirement: Work-item deletion preserves exact blockage and refuses stale replay

Deleting a root leaf or cascading a branch SHALL capture and conditionally clear every removed owner's direct blockage before removing owners. Undo SHALL recreate owners before conditionally restoring their exact owner, step and blocked time, including blockage retained under done progress. Redo SHALL refuse changed, missing or added blockage anywhere in the removed set. Deleting a parent by promotion SHALL preserve its surviving children's blockage.

When deletion removes the last child, the surviving parent SHALL receive blockage for a project step only when every former leaf held a direct fact for that step. Its blocked time SHALL be the maximum original timestamp, including negative times. Derived proxy blockage SHALL NOT count as agreement. The existing deletion progress fold SHALL remain in force. Undo SHALL restore the previous historical parent progress facts, including state and stated time.

Complete surviving-parent progress SHALL be checked before any replay batch step removes facts. Added, removed or changed progress SHALL refuse even with unchanged revisions. Parent blockage SHALL be compared as a complete set before undo clears handed-up facts and inserts children. Refusals SHALL preserve tree, facts and events while discarding the stale journal entry. Conditional replacements, deletion, restoration and journal/event writes SHALL share one transaction. Parent snapshot owners SHALL survive collection, flip and exact-pair attributed neighbor rebase.

#### Scenario: Exact root leaf restore includes a completed blocked node

- **GIVEN** a root leaf has Dev done and a direct blockage at -30
- **WHEN** deletion is undone and redone
- **THEN** undo restores the original progress and blockage facts and redo removes them together

#### Scenario: Last-child cascade requires direct agreement per step

- **GIVEN** a branch has two leaves blocked on Dev at -30 and -10, including a done leaf, and only one directly blocked on QA
- **WHEN** the branch is deleted as its parent's last child
- **THEN** the surviving parent receives Dev blockage at -10, no QA blockage, and the existing folded progress

#### Scenario: Stale parent facts survive deletion undo

- **GIVEN** deletion made a parent a leaf and a peer changed, removed or added progress, or added an unrecorded blockage, without changing revisions
- **WHEN** undo would remove handed-up facts and recreate children
- **THEN** replay refuses atomically before losing any fact and discards the stale entry

#### Scenario: An intermediate restore failure rolls back every write

- **GIVEN** deletion removed multiple blockage facts
- **WHEN** restoring a later fact fails after owners and an earlier fact were inserted
- **THEN** owners, facts, events and journal state match the pre-replay snapshot

### Requirement: Deletion replay metadata is validated and independently inventoried

Optional `deletionState` metadata on subtree deletion/restoration SHALL validate parent identity, owner-bound progress, blockage owner membership, unique owner/step pairs and safe-integer blocked times. Every referenced owner and step SHALL participate in replay authorization, including empty parent snapshots. A surviving deletion parent SHALL require a complete `Preconditions.moveProgress` snapshot; damaged modern history SHALL NOT fall back to legacy replay.

Images SHALL advertise `delete_state_v1` separately from command discriminators. Independent inventory SHALL require it once per journal row carrying an own `deletionState` property on `delete_subtree` or `restore_subtree`, walking both directions recursively through batches, including empty collections. Existing progress snapshot capability requirements remain cumulative. Both Compose swap checks SHALL refuse images lacking any required capability. Kubernetes build/cutover admission SHALL integrate the same independently computed marker before these histories enter its release path.

#### Scenario: Empty nested deletion history still prevents an older image

- **GIVEN** a nested forward or inverse subtree command carries empty deletion metadata and no live blockage facts
- **WHEN** an image advertises only prior blockage/move replay capabilities
- **THEN** release admission refuses `delete_state_v1` history before migration or reopening writes

### Requirement: Project-step deletion discloses and removes direct blockage facts atomically

Project-step deletion SHALL count direct blockage facts separately from progress, including facts retained beneath done progress. An unconfirmed deletion SHALL return typed `in_use` conflict with the direct blockage count before opening the deletion transaction when the fast read observes those facts. The transaction SHALL read fresh usage and refuse any blockage fact arriving after that read. Confirmed cascade SHALL explicitly remove only the deleted step's facts, bump every affected owner revision including blockage-only owners, and preserve unrelated facts. Failure SHALL restore facts, step, revisions and events together. Existing journal replay referring to the removed step SHALL refuse before restoring owners or facts.

#### Scenario: Blockage-only and retained done facts require confirmation

- **WHEN** a step holds direct blockage, whether or not its owner also states done progress
- **THEN** unconfirmed deletion returns 409 `in_use` with `blockages` equal to the number of direct facts and changes nothing

#### Scenario: Late blockage is counted transactionally

- **WHEN** direct blockage arrives after the deletion fast usage read
- **THEN** an unconfirmed deletion refuses using the fresh transactional count

#### Scenario: Confirmed cascade and failure preserve the transaction boundary

- **WHEN** a confirmed deletion succeeds
- **THEN** it explicitly removes that step's blockage, reports the count and bumps blockage-only owners while preserving other steps' facts
- **WHEN** a later transactional write fails
- **THEN** facts, step, owner/project revisions, events and journal remain as before deletion

#### Scenario: Historical commands cannot replay a removed step

- **WHEN** first-child history still references a step removed by confirmed cascade
- **THEN** undo and redo refuse before recreating owners or facts even if revision evidence is bypassed

#### Scenario: The confirmation names blockage loss and unknown older-server counts

- **WHEN** a deletion refusal reports `blockages`
- **THEN** its confirmation states the direct blockage count, including zero
- **WHEN** an older server omits that wire field
- **THEN** the confirmation visibly states that the server did not report step blockages and does not represent absence as zero

### Requirement: Saved plans retain direct step blockage independently of the schedule

Saved-plan input schema7 SHALL require direct `stepBlockages` rows sorted by work-item and step identity. Capture SHALL detach facts from one snapshot, including retained facts on done nodes. Older schemas SHALL upgrade to empty without rewriting stored bytes. Capture and stored-body normalization for comparison SHALL refuse malformed facts. Comparison SHALL address owner/step pairs under progress. Facts SHALL change saved bytes and hashes while leaving schedule input and full Fast output identical.

#### Scenario: Direct blockage survives later edits to the live plan

- **GIVEN** a direct leaf-owned step blockage at time -123
- **WHEN** a saved input is captured and the live fact is cleared
- **THEN** the captured input still contains its exact owner, step and blocked time
- **AND** a later capture contains no direct fact

#### Scenario: Historical saved input has no direct facts

- **GIVEN** saved input written at schema6 without a blockage collection
- **WHEN** the reader normalises it to schema7
- **THEN** its direct blockage collection is empty and its stored bytes are unchanged

#### Scenario: Current saved input refuses a corrupt direct fact

- **GIVEN** current saved input with a duplicate pair, unknown owner or step, parent owner, missing or fractional blocked time, or absent collection
- **WHEN** it is captured or its stored body is normalized for comparison
- **THEN** it throws before returning a usable comparison input

#### Scenario: Comparison names the exact changed step blockage

- **GIVEN** two saved inputs with a direct fact on the same owner and step at different times
- **WHEN** the inputs are compared
- **THEN** one progress difference names that owner/step pair and the blocked-time field

### Requirement: Archival transfer preserves direct blockage statements

Plan-document version 9 SHALL require a root `stepBlockages` array of direct
`workItemId`, `stepId`, and safe-integer `blockedAt` facts, including negative times.
Export SHALL omit row blockage aliases and derived causes. Import SHALL validate
unique pairs, existing leaf owners and existing steps before writing, remap both
identities, and preserve exact timestamps within the import transaction.

#### Scenario: Older documents contain unsupported blockage statements

- **WHEN** a version 1–8 file has nonempty root blockage facts or row blockage aliases
- **THEN** import refuses `invalid_body` at the indexed collection path
- **AND** absent or empty collections normalize to no direct facts

#### Scenario: A later blockage write fails

- **WHEN** importing valid direct facts fails after one fact has been written
- **THEN** the project, directory, facts, events and journal remain exactly as before import

#### Scenario: Navigator reads its supported document versions

- **WHEN** Navigator receives external v7 or v8
- **THEN** it adapts to internal v9 with empty direct facts
- **AND** external v9 remains refused before output files are written

### Requirement: Compose backend transitions stop every prior database writer before candidate startup

Every Compose backend swap SHALL complete registry, local image pull, environment, Compose, Caddy, exposure-state and writable database mount inventory preflight before any writer outage. Unmanaged writable mounts, including canonical path aliases and overlapping ancestor/file binds, and malformed or unreadable inventory SHALL refuse without stopping unrelated containers. Read-only mounts MAY remain. The executor SHALL durably publish stop intent before stopping outgoing and pre-existing idle container exact identities. It SHALL inspect each identity stopped, unpaused and not restarting and revalidate the complete identity set. Independent digest-pinned, network-none, read-only candidate fact/replay admission SHALL pass before any candidate boot; post-boot admission SHALL remain a readback. Candidate migration, health, fact/replay compatibility and backfill SHALL precede the gateway shared alias and Caddy routing. The effective candidate configuration SHALL reject exposing aliases, published ports and dependencies, and startup SHALL force a new container from a private resolved configuration without dependency starts or image pulls.

#### Scenario: Old structural writers cannot overlap new blockage writers

- **GIVEN** an outgoing backend can insert a child without accounting for step blockage and an idle backend exists
- **WHEN** a Compose backend swap runs
- **THEN** both exact old container identities are stopped and independently inspected before the candidate starts
- **AND** a zero-exit stop whose inspection is running, missing, malformed, replaced, paused or restarting refuses startup

#### Scenario: Preflight cannot establish an exclusive writer set

- **GIVEN** a malformed inventory or an unmanaged writable mount overlapping the shared database
- **WHEN** backend preflight runs
- **THEN** it refuses before stop intent or any container stop
- **AND** read-only unrelated mounts are accepted without receiving stop commands

### Requirement: Interrupted backend transitions retain explicit recovery authority boundaries

Stop, migration-capture identity and possible-exposure intent SHALL be exclusively published and synced before their corresponding actions. Possible writer exposure SHALL be durable before candidate startup, because boot can write or listen without a shared alias. Ordinary retries SHALL refuse retained markers, malformed/unreadable markers and missing trusted state directories. Phase writes SHALL NOT erase those markers. Possible-exposure intent SHALL precede the first alias-grant attempt. Only recorded candidate commit SHALL remove markers. Failure SHALL retain captures and never automatically reverse schema, restore a snapshot or restart the older writer. Before boot exposure, any managed cleanup SHALL prove exact stopped identities. After candidate startup, failure SHALL retain boot exposure and SHALL NOT authorize down recovery or old snapshot restore; the candidate MAY remain available while the older writer remains stopped.

#### Scenario: Alias grant partly applies before throwing

- **WHEN** a backend alias operation partly applies and then fails
- **THEN** exposure intent already exists, ordinary retry refuses, and no older writer restarts or schema/snapshot rollback runs

#### Scenario: A booted candidate fails after migration

- **WHEN** the candidate starts and later fails health before shared-alias admission
- **THEN** boot exposure was already durable, the outgoing writer remains stopped, and the migrated database and original capture remain
- **AND** no down recovery or old snapshot restore is authorized merely because health or alias admission has not completed

#### Scenario: Attended old-image recovery encounters retained replay history

- **GIVEN** all backend writers are stopped and the proposed previous image lacks a stored fact or nested journal replay capability
- **WHEN** read-only attended recovery admission runs
- **THEN** it refuses before any restart and retains interruption state
- **AND** schema recovery must prove the captured applied ledger exactly before a compatible older image may restart

#### Scenario: Socket frames cannot grant mutation or activation authority

- **WHEN** an authenticated internal forward contains setter, import or activation-shaped frames
- **THEN** it only acknowledges and creates no command event or write authority

#### Scenario: An unchanged idle container retained the shared backend alias

- **GIVEN** a stopped idle container retains `be-01.internal` from its previous deployment
- **WHEN** the candidate starts from the checked private Compose snapshot
- **THEN** forced recreation produces a new container identity without that alias and no dependency starts
- **AND** possible boot exposure was durable before any startup callback

#### Scenario: Incidental database mounts conceal another live database

- **GIVEN** an outgoing backend opens `/live/production.db` through `/actual-production:/live` and also mounts the configured data root at `/unused-backups`
- **WHEN** preflight compares it with the candidate's effective database file
- **THEN** mismatch refuses before stop intent, including different filenames and more-specific file-bind overrides
- **AND** canonical path aliases are accepted only when they identify the same actual host database

#### Scenario: Incoming code cannot read guarded history

- **GIVEN** stopped previous writers and stored move/deletion replay metadata or direct blockage unsupported by the incoming digest
- **WHEN** pre-boot candidate admission runs in read-only one-offs
- **THEN** it refuses before candidate boot or possible-exposure publication, retains stop intent and starts no writer

### Requirement: Compose admission reads the complete stopped SQLite family without source mutation

Stored fact/replay admission SHALL keep the production directory mounted read-only and run independent production query commands against a private writable copy of the quiescent main database and retained WAL/journal. It SHALL exclude source SHM and refuse required-file absence or unreadability. Candidate/outgoing/idle identity SHALL prove the canonical directory, basename and sidecar mappings together before stop intent. Main-file binds, sidecar shadow mounts, renamed main-file aliases and redirected or dangling sidecar links SHALL refuse before any writer outage.

#### Scenario: Clean WAL close leaves no sidecars

- **GIVEN** every database writer is stopped and clean WAL closure left only the main database in a read-only directory
- **WHEN** the exact production stored relationship query runs through pre-boot admission
- **THEN** it succeeds through private scratch SHM creation and the production filenames and bytes remain unchanged

#### Scenario: Retained WAL contains a newer relationship

- **GIVEN** a killed writer left a committed relationship only in WAL, with or without retained SHM
- **WHEN** independent stored relationship admission runs
- **THEN** the retained relationship is inventoried and no production file is created, deleted or changed

#### Scenario: Main-file equality conceals different sidecars

- **GIVEN** an outgoing renamed file bind resolves to the candidate main file or a candidate mount shadows only WAL or SHM
- **WHEN** preflight resolves the database family
- **THEN** it refuses without stopping blue or publishing stop intent
