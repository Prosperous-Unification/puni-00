# WBS Tool

The domain glossary for this repo. Terms only — one or two sentences each, defining what
a thing IS. Design decisions live in `docs/adr/`, behaviour lives in `openspec/`.

## Language

### WBS

**Project**:
One work breakdown structure and everything scoped to it — its work items, its roles and
its restriction. Nothing is shared between projects.
_Avoid_: workspace, board, plan

**Work item**:
One unit of work in a project. Holds a name, notes and a place in the tree; owns no
estimate directly once it has children. Never `item` alone — R2 forbids the bare noun.
_Avoid_: item, task, row, node

**Subtree**:
One work item and every work item beneath it, to any depth. The unit a deletion and a
duplication both address, because a branch is what a planner thinks in.
_Avoid_: branch, descendants, group

**Duplicate**:
Copying a subtree whole, in one operation, as the next sibling of the original. The copies
carry their originals' names, notes, estimates, labels, assignees and dates, and no frozen
numbers.
_Avoid_: clone, copy-paste, template

**Work item number**:
The label a work item is known by outside the tool, formed `010`, `020`, `010.1`,
`010.01`. Derived from position unless frozen. Zero-prefixed so it sorts lexicographically,
zero-suffixed so later work can be inserted between two numbers already in use.
_Avoid_: id, index, wbs code

**Position**:
An integer ordering a work item among its siblings, spaced in gaps of ten. The input a
client sends when it creates or moves a work item; the number is the output derived from
it. Never shown to the user.
_Avoid_: order, rank, sort key, sequence

**Freeze**:
The project-wide act of writing every derived work item number into storage, because those
numbers have left the tool and cannot change. Work items created after a freeze derive
their numbers as before, until the next freeze.
_Avoid_: lock, pin, publish

**Frozen number**:
A work item number that a freeze wrote down. It survives insertions, deletions and
repadding elsewhere in the project, and blocks the work item from moving until explicitly
unfrozen.
_Avoid_: fixed number, locked number

**Repadding**:
Widening every child number under one parent when that parent gains a tenth child, so
`010.1` becomes `010.01` and the tenth sorts last rather than second.
_Avoid_: renumbering, padding fix

**Role**:
A named kind of work a project estimates separately, unique by name within it. Every
project starts with `Dev` and `QA`, and may then be given others, renamed or emptied.
_Avoid_: discipline, type, category

**Role order**:
The order a project works its roles in — `Dev` before `QA` before whatever was added
after them. One order for the whole project, held per role, and the order every list of
them is read in.
_Avoid_: phase order, sequence, priority

**Assumed assignee**:
The person a work item with exactly one assignment is taken to be doing every role's work
for. Read from the assignments rather than stored, so a second one ends the assumption.
_Avoid_: default assignee, implicit owner, cover

**Role usage**:
What a role's removal would take with it: the estimates and assignments that hold it, and
the work items whose assumed assignee it would change.
_Avoid_: references, dependents, blast radius

**Estimate**:
Three durations in days — optimistic, realistic, pessimistic — held for one work item and
one role. A work item with children has no estimates of its own.
_Avoid_: points, effort, sizing

**Trio shorthand**:
One estimate written as one value — `2/3/8`, or `5` meaning all three are five. What a
folded role's cell takes, in place of three boxes.
_Avoid_: quick entry, inline estimate, compact form

**Estimate gap**:
One leaf work item and one role it holds no estimate for. A work item with children never
has one, because its figures are rolled up rather than typed.
_Avoid_: missing estimate, unestimated row, TBD

**Roll-up**:
The sum of a parent's descendants' estimates, per role, computed on read and never stored.
_Avoid_: aggregate, total, computed estimate

**Dependency**:
One work item waiting for another to finish before it starts. Either end may be a parent,
which means every leaf beneath it. Held once per pair, in one direction.
_Avoid_: link, blocker, edge (outside the graph code)

**Slice**:
One leaf work item's work for one role — the unit a schedule is computed in. A leaf in a
project holding two roles is two slices, run one after the other in role order.
_Avoid_: task, bar, segment, phase, item×role

**Projection**:
A work item's own schedule, read off its slices: the earliest of their starts, the latest
of their finishes, the least of their slack. What leaves be-01 and what the table draws —
slices themselves never do.
_Avoid_: aggregate, summary, rollup (which is estimates, not time)

**Resource leveling**:
Placing every slice so that nobody is doing two at once. Always on, and invisible in a
plan with nobody assigned — which is what every plan was until it arrived.
_Avoid_: smoothing, balancing, allocation, capacity planning

**Eligible slice**:
One whose predecessors have all been placed — its dependencies and its work item's
earlier roles. The set of them is what the schedule takes its next slice from, highest
priority first.
_Avoid_: ready, available, unblocked, frontier

**Binding floor**:
The one thing a slice's start is set by, out of the day the project starts, a dependency,
its work item's earlier role, a manual date, and its assignee's last finish. A tie is
never the person: somebody free exactly when the dependency clears is holding nothing up.
_Avoid_: constraint, reason, blocker, driver

**Resource predecessor**:
The slice a person was busy with immediately before the one they were the binding floor
of. What a person-link on the Gantt is drawn between; absent when nobody waited.
_Avoid_: previous task, queue parent, resource link

**Refused dependency**:
A dependency be-01 will not write: onto the work item itself, onto an ancestor or a
descendant of it, or one that closes a loop once every dependency is expanded to the
leaves beneath its ends. be-01 decides; the picker predicts, to grey the row before it is
clicked.
_Avoid_: invalid dependency, illegal link, blocked edge

**Search**:
What is typed into the table's Find box, and the narrowing it causes: the work items whose
name contains it, the ancestors that place them and the descendants beneath them. Local to
one reader, and it changes nothing — nobody else's table moves.
_Avoid_: filter, query, lookup

**Match**:
A work item whose own name contains the search. Marked as such, because the rows kept
around it are on screen as context rather than as answers.
_Avoid_: hit, result, found row

**Expansion**:
Which branches of one project's tree are open, in one browser. Either every branch or a
named set of them; a branch not named is closed. Remembered per project, per browser, and
overridden on screen for as long as a search is running.
_Avoid_: collapse state, open rows, fold

**Key binding**:
One key or chord the table acts on, what it does, and where it applies. Held once, as
data, so the cheat sheet and the keyboard cannot disagree.
_Avoid_: shortcut, hotkey, accelerator

**Cheat sheet**:
The modal list of every key binding, opened by `?` from outside a text box. It reads the
keyboard out; it does not change it.
_Avoid_: help, shortcuts dialog, legend

**Name cell**:
The one box a work item's name and its notes are written in: the first line is the name,
everything under it is the notes. They stay two fields in storage — the cell is where they
are composed for reading and split again on the way out.
_Avoid_: title field, notes column, description

**Actions menu**:
The list of things one work item can be asked to do — duplicate it, delete it, unfreeze
its number — behind a single button on its row. One is open at a time, and it owns the
keyboard while it is.
_Avoid_: context menu, row menu, kebab, overflow menu

**Flexible column**:
The one column of the table with no declared width — the name — which takes whatever the
declared ones leave, down to a floor it does not shrink past. Not an unsized column: asking
for its width is an error, because the pinned offsets are sums of declared widths.
_Avoid_: auto column, fill column, stretch

**Table minimum width**:
The narrowest the table may be laid out for the columns it is currently showing: every
declared width plus each flexible column's floor. Above it nothing scrolls sideways; below
it the frame scrolls and the pinned columns hold the left edge.
_Avoid_: total width, table width, min size

**Plan renderer**:
Whichever of the two things is drawing the plan right now — the table or the outline cards.
Chosen by how wide the viewport is and by nothing else, and never both at once; the plan,
its cells and their unsaved state are the same under either.
_Avoid_: view, mode, layout, breakpoint

**Outline card**:
One work item as a phone reads it: its number at its own depth, its name and notes in one
box, its figures, its dates, and one line per phase. Read whole; edited one field at a time.
_Avoid_: tile, row, list item, mobile row

**Mention**:
A person looked up from inside another box, written as `@` and part of their name — in the
folded role cell, where `2/3/8@kat` is one gesture. Held apart from whatever the box is
otherwise for: the estimate never sees the mention and the mention never becomes an
estimate.
_Avoid_: at-mention, tag, autocomplete

**Toast**:
One message about something that just happened, shown in a corner of the screen. A failure
waits there until it is dismissed; a note takes itself off. Reports events only — a
condition that stays true is a banner.
_Avoid_: notification, snackbar, flash, alert

**Stale tree**:
The rows on screen after a refetch failed: the last ones that arrived, and possibly behind
what be-01 now holds. Ends at the next refetch that lands, whichever asked for it.
_Avoid_: out of date, dirty, unsynced, desynced

**Plan export**:
One project written out as a document somebody reads elsewhere — a Markdown table or a CSV
file — headed by what the table alone cannot say: the estimate method by name, whether the
dates are dates or day offsets, and when the figures were taken. Always the whole project,
never the view of it.
_Avoid_: report, download, dump, extract

**Revision**:
A count of how many times one work item or one project has been written to, starting at
zero and never going down. Moves on the entity's own stored fields and on its satellites,
and never on the number derived for it.
_Avoid_: version, etag, timestamp, sequence

**Satellite**:
A row that belongs to one entity, has no identity anyone holds, and is only ever read
through that entity — an estimate, an assignment, a role. Writing one moves the owner's
revision; a dependency has two owners and moves both.
_Avoid_: child row, detail, related record

**Command journal**:
The last fifty reversible commands one account ran on one project, held on the server in
the order they happened. One stack per account per project — undo is personal, and
reversing somebody else's change because it happened to be the newest is not undo.
_Avoid_: history, audit log, activity, event log

**Compensating command**:
The command that reverses another one, carrying the before-state it needs — the old field
value, the removed trio, the whole deleted subtree. Applied through the same paths any
mutation goes through, so it is an ordinary write that happens to restore.
_Avoid_: inverse operation, rollback, revert

**Precondition**:
The revisions a command left every entity it touched at, checked before that command is
reversed or re-applied. All of them must still hold; one that does not is a refusal, never
an overwrite.
_Avoid_: guard, expected version, if-match

**Stale undo**:
An undo or redo refused because something it touched has been written to since. The entry
is discarded — its preconditions can never hold again — and the reader is told which
change stood in the way.
_Avoid_: conflict, rejected undo, out of date undo

**Restricted project**:
A project only its owner may edit. Every authenticated account may still read it; an
unrestricted project may be edited by any of them.
_Avoid_: private, locked project

### Deployment

**Environment**:
One complete, independently deployable copy of the three tiers on a host, identified by
`WBS_ENV`. `prod` and `dev` are the two that exist.
_Avoid_: stage, instance, deployment (as a noun for this)

**Environment root**:
The directory on the remote host that holds one environment's compose files, rendered
Caddy site, tier state, secrets and data. `/home/puni1/wbs` for `prod` and
`/home/puni1/wbs-dev` for `dev` (ADR 0002). `/srv/wbs` is a stale rollback copy: reading it
shows an environment that has not moved since 2026-08-04.
_Avoid_: srv dir, deploy dir

**Deploy trigger**:
The unattended process on the build host that decides a commit should be deployed to an
environment and invokes the deploy. It never decides anything about `prod`.
_Avoid_: poller, watcher, CD runner

**Colour**:
Which of the two interchangeable slots (`blue`, `green`) a tier's current container
occupies. Each tier holds its colour independently of the others.
_Avoid_: slot, side, version

**Tier**:
One of the three deployable services: `be`, `gw`, `fe`.
_Avoid_: app, service, component
