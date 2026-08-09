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
One work item and every work item beneath it, to any depth. The unit a duplication
addresses, because a branch is what a planner thinks in. A deletion takes the one row
and promotes its children a level, unless it is explicitly asked to take the subtree.
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

**Directory**:
The people and service teams every project draws from — one list for the whole
deployment, readable and writable by any signed-in account. Not a per-project list, and
not an account on this tool.
_Avoid_: roster, address book, org chart, users

**Service team**:
A team work can be labelled with. A label on the work, never a constraint on who may be
assigned it, and unique by name across the directory.
_Avoid_: department, squad, group, service

**Person**:
Somebody who does work, named in the directory and assigned to a work item's role. Not an
account: most of the people a plan names never sign in.
_Avoid_: user, resource, member, assignee (which is the assignment, not the person)

**Free agent**:
A person who belongs to no service team. The absence of memberships, never membership of
a "Free agents" row — a real row could be renamed, deleted or given work of its own.
_Avoid_: unassigned, independent, teamless

**Directory usage**:
What removing a person or a service team would take with it, named rather than counted:
the affected projects with their work items by number and name, each work item's effects,
and the people whose membership would be dropped. What a refusal carries so that the
second, confirming request is agreeing to something it has seen.
_Avoid_: references, impact, blast radius, dependents

**Membership chip**:
One team a person belongs to, drawn on the directory page as a token that removes that
one membership.
_Avoid_: tag, pill, badge

**Project owner**:
The account that created a project and the only one that may edit it while it is
restricted. An account, never a person from the directory.
_Avoid_: author, creator, user

**Entry meta**:
The muted parenthetical on a project entry in the picker: who owns the project and the
day it was created. Shown to tell same-named projects apart, never searched.
_Avoid_: subtitle, caption, details

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
of. What a person link on the Gantt is drawn between; absent when nobody waited.
_Avoid_: previous task, queue parent, resource link

**Gantt panel**:
The second drawing of the plan: every shown row as marks on a calendar axis, under the
plan renderer and mirroring its rows. Read-only — edits happen where they always did.
_Avoid_: chart, timeline, gantt view

**Calendar axis**:
The Gantt panel's horizontal scale on a plan that has a start date: one unit and one
cell per calendar day from the plan's first working day, weekends among them and greyed,
the heavy line on Mondays. Every mark the panel draws takes its horizontal coordinate
from it.
_Avoid_: date axis, timeline, time axis

**Calendar scale**:
What turns a workday offset into a place on the calendar axis, read two ways: where a
span that starts there stands, and where a span that finishes there stops. The two differ
by exactly the weekend between two workdays, which is what puts a gap between work that
ended on the Friday and work that begins on the Monday.
_Avoid_: converter, mapping, projection

**Workday axis**:
The Gantt panel's horizontal scale on a plan with **no** start date: one unit per workday,
printing the offset itself. Weekends are not on it — there is no calendar to have one on
— so a week is five cells rather than seven. A rendered state, not a fallback.
_Avoid_: time axis, date axis, offset axis

**Horizon**:
How far the drawing reaches: the furthest right edge of anything drawn, in the unit the
chart is in — calendar days on a calendar axis, workdays without one — and far enough to
hold every assumed span drawn past a slice's own finish. The width of the Gantt panel's
drawing space.
_Avoid_: extent, range, span

**Bar**:
The drawing of one slice on the Gantt panel — a rectangle from where its start stands to
where the span it is **drawn** across stops. A picture of a slice, never the slice itself:
its width is the days it is drawn over, weekends inside it included, while the workday
numbers it carries stay the engine's.
_Avoid_: segment, block, task bar

**Assumed span**:
The two workdays an unestimated slice's bar is drawn across, so that a slice nobody has
sized reads as work of unknown length rather than as nothing at all. A property of the
drawing and never of the schedule: the engine's numbers, the date columns and the arrows
between rows do not know about it, and the bar says it is a guess by how it is painted.
_Avoid_: default duration, placeholder estimate, assumed estimate

**Summary bracket**:
The drawing of a parent on the Gantt panel: a bracket over its projection. A span,
never a sum, exactly as the projection is.
_Avoid_: parent bar, group bar, rollup bar

**Person link**:
The line from a resource predecessor to the slice that waited for it — one person's
hand-off, drawn unlike a dependency arrow. Exists only where the binding floor is the
person.
_Avoid_: resource arrow, queue line, assignment link

**Not-before flag**:
The mark standing on the day a row's manual start date holds it at, on rows that have one.
Where it stands is that date's place on the axis; what it says on hover is the date itself.
_Avoid_: constraint marker, lock, milestone

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
everything under it is the notes. At rest the cell shows the name alone, whole and wrapped;
the notes appear while it is edited and in its hover preview. They stay two fields in
storage — the cell is where they are composed for reading and split again on the way out.
_Avoid_: title field, notes column, description

**Hover preview**:
The rendered reading of one work item, opened over its Name cell from the notes marker on
that cell: the name as a level-one heading, the notes as markdown under it. The only place
notes render; nowhere does raw HTML in either field become markup.
_Avoid_: tooltip, popover, notes preview

**Notes marker**:
The small mark at the right edge of a Name cell whose work item has notes, and the only
thing that opens that cell's hover preview. It says a row has notes; it is not a control —
nothing to click, no focus, no place in the keyboard grid.
_Avoid_: notes icon, badge, indicator, button

**Hover card**:
The instant answer a cell gives to the mouse resting on it: the whole of what its at-rest
face folds away — a folded role's three points and assignee, a depends chip's names. Opens
on enter with no delay, one at a time; the Name cell's hover preview is one.
_Avoid_: tooltip, title attribute, hint

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

**Frame layout**:
Every width one drawing of the table declares, resolved together from the columns on
screen and the plan being drawn: each column's declared width, the table minimum, and the
offset each pinned column is held at. One resolution, read by every consumer — a width
that changes changes all of them, because there is only one of them. What a width may
depend on is one object, so a new fact is a field rather than an argument somebody forgets
to pass.
_Avoid_: width table, column config, geometry, sizing

**Display envelope**:
The widest content a column undertakes to show whole, where there is no widest content to
size it to. The Number column's is eleven characters at the deepest indent, beside the
row's expander and its frozen-number lock; a number past it is clipped and kept whole in
the cell's title. Measured by a browser, never chosen by reading the markup.
_Avoid_: max width, longest value, cap

**Column width override**:
One column's width as this browser was told it by a drag, replacing the width the frame
layout would otherwise resolve. Held per project, per browser, and never seen by anyone
else.
_Avoid_: resize, custom width, preference

**Width reset**:
Forgetting every override for one project, so each column returns to the width the frame
layout resolves for it now rather than to the width it had when the override was made.
_Avoid_: restore defaults, revert, clear

**Short date**:
A calendar day as somebody reads one — `1 Jun`, and `1 Jun 2027` when the year is not the
current one — with the whole `YYYY-MM-DD` still in the cell's title. Read out of the
day's own components, never parsed into a moment: a moment has a zone and a calendar day
has none. An instant printed this way is a different question and a different formatter.
_Avoid_: formatted date, pretty date, display date

**Edit exit**:
How an edit in a field ends, as one of two answers: committed, or abandoned. Leaving and
Enter commit; Escape abandons and puts back what the server agreed, so nothing is left for
the blur it causes to send. Closing returns the focus to the cell that was being edited.
_Avoid_: cancel, dismiss, close, blur handling

**Hover preview**:
The one positioned surface a mark shows on hover or focus, wherever the plan is drawn;
the Name cell's and a Gantt bar's are the same surface with different bodies.
_Avoid_: tooltip, popover, hovercard

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
