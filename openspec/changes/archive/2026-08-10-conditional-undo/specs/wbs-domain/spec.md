## ADDED Requirements

### Requirement: A reversible command is written down as it happens

Every mutation this API offers that can be reversed SHALL record a command
journal entry once it has been applied: what it did, the compensating command
that reverses it, the command a redo re-applies, and the revisions of every
entity it wrote to **as it left them**.

The reversible commands are: a work item's field patch, an estimate set or
cleared, an assignment set or cleared, a dependency added or removed, a move, a
create, a delete, a freeze, an unfreeze, and a duplication. Renaming a project,
restricting it, changing its estimate method and setting its start date SHALL
NOT be reversible.

A command that changed nothing SHALL NOT be recorded.

The entry SHALL be written on the mutation's success path. A mutation that
applies but cannot be recorded SHALL report failure rather than reporting
success for a command nothing can reverse.

#### Scenario: a rename is written down

- **WHEN** a work item is renamed
- **THEN** the account's newest journal entry for that project describes the
  rename, and expects that work item at the revision the rename left it at

#### Scenario: clearing an estimate that was not there records nothing

- **WHEN** an estimate is cleared for a role that held none
- **THEN** no entry is added, because there is nothing to put back

#### Scenario: a project rename is not reversible

- **WHEN** a project is renamed
- **THEN** nothing is added to any account's stack for it

### Requirement: The stack is one account's own, on the server

A command journal SHALL be kept per account per project. It SHALL survive a
reload, and no account's undo SHALL ever reach a command another account ran.

Each entry SHALL be ordered within its account's stack by a number the database
assigns from the pair's current maximum, inside the statement that inserts the
row.

At most 50 entries SHALL be kept per account per project; older ones SHALL be
dropped as newer ones arrive.

#### Scenario: one reader's change is not on another's stack

- **GIVEN** two accounts editing one project
- **WHEN** the second renames a work item
- **THEN** the first account's newest entry is still its own last command

#### Scenario: the stack is bounded

- **WHEN** an account runs 56 commands on one project
- **THEN** 50 entries remain and the oldest six are gone

### Requirement: An undo applies only if nothing it touched has moved

Undoing SHALL take the account's newest entry that has not been undone, compare
every revision it recorded against the entity's current revision, and apply the
compensating command only when every one of them matches. An entity that has
been deleted SHALL count as moved.

When they do not match, the request SHALL be refused with `stale_undo` and a
detail naming what changed, the plan SHALL be left exactly as it was, and the
entry SHALL be discarded — its preconditions can never hold again, and keeping
it would refuse every later step for a change nobody can reach.

An empty stack SHALL be refused with `nothing_to_undo`.

Applying a compensating command SHALL go through the same paths an ordinary
mutation goes through, so that revisions move, subscribers are told and every
invariant holds.

#### Scenario: a rename somebody else wrote over

- **GIVEN** a work item this account renamed and another account renamed after
- **WHEN** this account undoes
- **THEN** the request is refused, the detail names the other account's value,
  and the work item still holds it

#### Scenario: the refused entry does not jam the stack

- **GIVEN** an undo that was refused
- **WHEN** the account undoes again
- **THEN** the entry below is what is considered, not the refused one

#### Scenario: nothing left

- **WHEN** an account undoes on a project it has not changed
- **THEN** the request is refused with `nothing_to_undo`

### Requirement: Consecutive undos of one account's own changes walk the stack

Applying a compensating command SHALL be treated as the ordinary write it is: it
moves the revisions of everything it touches. An entry beneath the applied one
SHALL be carried forward to those new revisions **only where** the revision it
expects is exactly the one the applied command started from — which is true
when, and only when, nobody else wrote between the two commands.

#### Scenario: three of one account's own edits, walked back

- **GIVEN** a work item created and then renamed twice by one account
- **WHEN** that account undoes three times
- **THEN** each step applies: the second rename, then the first, then the create,
  which removes the work item

#### Scenario: the walk stops where somebody else wrote

- **GIVEN** a work item this account renamed, another account renamed, and this
  account renamed again
- **WHEN** this account undoes twice
- **THEN** the first step puts back the other account's name, and the second is
  refused rather than reaching past it

### Requirement: Undoing each kind of change restores exactly what it changed

An undo SHALL restore the before-state the command replaced, and nothing else.
A patch SHALL restore only the fields that patch named. An estimate SHALL come
back as the trio that was stored, or be removed when none was. An assignment
SHALL come back as the person who was named, or be cleared when nobody was. A
dependency added SHALL be removed and one removed SHALL be added back. A moved
work item SHALL return to the parent and the place among its siblings it had. A
freeze SHALL be lifted from exactly the work items it pinned and an unfreeze
SHALL put back the number it took away.

#### Scenario: only the fields the patch named

- **GIVEN** a work item whose notes were edited after its name was
- **WHEN** the rename is undone
- **THEN** the name is back and the later note is untouched

#### Scenario: an estimate that replaced another

- **WHEN** an estimate written over an earlier one is undone
- **THEN** the earlier trio is stored again

#### Scenario: a first estimate

- **WHEN** an estimate on a work item that held none is undone
- **THEN** the work item holds no estimate for that role, rather than zeroes

### Requirement: Undoing a create removes the work item only if nothing was built on it

Undoing a create SHALL remove the created work item only when the rows beneath
it are exactly the rows that were there when it was created. A work item
somebody has since added work under SHALL NOT be removed, and the request SHALL
be refused — a child is a row of its own and moves nothing on its parent, so no
revision would say so.

When the create handed a parent's estimates down to it, undoing SHALL hand them
back up.

#### Scenario: built on since

- **GIVEN** a work item created by this account, with a child added by another
- **WHEN** this account undoes the create
- **THEN** the request is refused and the work item and its child are still there

#### Scenario: the estimate handoff goes back

- **GIVEN** an estimated work item that gained its first child, taking the
  estimate with it
- **WHEN** the create is undone
- **THEN** the child is gone and the parent holds the estimate again

### Requirement: Undoing a delete restores the branch whole

Undoing a delete SHALL put back every work item that was removed, with the ids
they had, together with their estimates, their assignees and the dependencies
that had both ends inside the branch — in one write, so no reader sees a branch
half restored. A promotion SHALL be reversed with it: the children that were
promoted out SHALL go back beneath the restored work item. Estimates the
deletion handed up to a surviving parent SHALL be taken off it again.

Restored work items SHALL come back at revision 0.

A dependency with one end outside the branch SHALL be restored only where the
other end still exists and the ordinary dependency rules still allow it. Where
one cannot be, the branch SHALL still be restored and the answer SHALL say how
many were not.

If any id the branch owns is in use, the restore SHALL be refused rather than
writing over it or inventing new ids.

#### Scenario: rows, figures and people all come back

- **GIVEN** a branch with an estimated child, an assigned child and a dependency
  between them
- **WHEN** its deletion is undone
- **THEN** every row is back under the same parent, the estimate is on the same
  work item, the assignee is on the same work item, and the dependency joins the
  same two

#### Scenario: a promotion is reversed

- **GIVEN** a work item deleted with its children promoted
- **WHEN** the deletion is undone
- **THEN** the work item is back with those children beneath it, and its former
  siblings are where they were

#### Scenario: an outside dependency that cannot come back

- **GIVEN** a deleted branch that something outside it waited for, and that
  outside work item deleted since
- **WHEN** the deletion is undone
- **THEN** the branch is restored and the answer says one dependency could not be

#### Scenario: an id in use

- **GIVEN** a deleted work item whose id something else now holds
- **WHEN** the deletion is undone
- **THEN** the request is refused and the row holding the id is untouched

### Requirement: Undoing a duplication removes the copy only if it is untouched

Undoing a duplication SHALL remove the copied branch, and SHALL be refused when
any copied row has been written to or anything has been added inside it.

#### Scenario: somebody typed into the copy

- **GIVEN** a duplicated branch whose copy another account has renamed part of
- **WHEN** the duplication is undone
- **THEN** the request is refused and the copy is still there

### Requirement: A redo is conditional, and a forward change clears it

An undone entry SHALL become the account's redo material, and a redo SHALL
re-apply the original command under the same precondition rule as an undo.
Redoing SHALL walk back up the stack in the order the undoing happened.

Any reversible command an account runs on a project SHALL clear that account's
undone entries for it.

Undo and redo SHALL NOT themselves be recorded as commands.

#### Scenario: undone, then put back

- **WHEN** a rename is undone and then redone
- **THEN** the renamed value is on the work item again

#### Scenario: a forward change ends the redo branch

- **GIVEN** an undone rename
- **WHEN** the same account changes anything else on the project
- **THEN** there is nothing to redo

#### Scenario: a redo somebody else wrote over

- **GIVEN** an undone rename whose work item another account has since renamed
- **WHEN** the redo is asked for
- **THEN** it is refused and the other account's value stands

### Requirement: Undo and redo are writes, addressed as routes

`POST /api/projects/:id/undo` and `POST /api/projects/:id/redo` SHALL answer 401
without an account, 404 for a project that does not exist, and 403 for an account
that may read the project but not write to it. They SHALL answer 409 with
`nothing_to_undo` or with `stale_undo` and its detail, and on success SHALL
answer what was undone in words a screen can show, together with anything that
could not be restored exactly.

Reading a project's tree SHALL report whether the reading account has anything
to undo and anything to redo.

#### Scenario: a stranger on a restricted project

- **WHEN** an account that may not edit a restricted project asks to undo
- **THEN** the request is refused with 403

#### Scenario: the tree says what the buttons should show

- **GIVEN** one account that has changed the project and one that has not
- **WHEN** each reads the tree
- **THEN** the first is told it has something to undo and the second is not

### Requirement: The keyboard reaches undo, and never takes it from a text box

The table SHALL undo on Ctrl or Command with Z, and redo with Shift added. It
SHALL NOT handle either chord when the keystroke is aimed at an input, a
textarea or an editable element — there undo belongs to the browser.

A step that worked SHALL be reported on screen with what it undid. A refusal
SHALL be reported with why. Buttons for both SHALL be offered and SHALL be
disabled while the matching half of the account's stack is empty.

#### Scenario: the chord outside a cell

- **WHEN** Ctrl+Z is pressed with the table itself as the target
- **THEN** the undo is asked for and what it undid is shown

#### Scenario: the chord inside a name

- **WHEN** Ctrl+Z is pressed inside a name cell
- **THEN** nothing is asked for and the keystroke is left to the browser

#### Scenario: a refusal reaches the screen

- **WHEN** an undo is refused because something changed
- **THEN** the detail naming what changed is shown
