# wbs-domain Specification

## Purpose

Define the work breakdown domain rules that planners observe: how estimated and unestimated
steps are scheduled and reported.

## Requirements

### Requirement: A leaf's status folds its progress, hold, readiness and predecessors

Every leaf SHALL report one `status` of `unknown`, `draft`, `ready`, `in_progress`,
`blocked_by_proxy`, `on_hold`, `blocked` or `done`, folded on every read, first match winning:
its progress fold `done` → `done`; its hold → `on_hold` or `blocked`; its progress fold
`in_progress` → `in_progress`; a predecessor reading `on_hold`, `blocked` or
`blocked_by_proxy` → `blocked_by_proxy`; its readiness → `draft` or `ready`; else `unknown`.
Progress SHALL stay per step node; readiness and hold SHALL be stored once per leaf and never
on a parent; `status` and `blocked_by_proxy` SHALL never be stored. A node SHALL keep a separately derived reading while its stored progress statement remains
`in_progress` or `done`. A leaf with no stored statements SHALL expose an empty progress object. The leaf progress fold SHALL use steps with an estimate, actual,
progress statement or attempt. A running attempt counts as `in_progress` on a node without
a progress statement. An ended attempt still makes the node work-bearing, so a silent
work-bearing node keeps a partially done leaf reading `in_progress`. With no progress or
attempt showing progress, the progress fold reports `unknown`. The wire uses `unknown` for
the former `not_started` value; the derived value requires no stored-value migration.

#### Scenario: a hold outranks a running step

- **GIVEN** a leaf whose `Dev` says `in_progress`, holding `hold: 'on_hold'`
- **WHEN** the plan is read
- **THEN** the leaf reports `on_hold`, and `in_progress` again once the hold is cleared

#### Scenario: done outranks a hold

- **GIVEN** a leaf done on every step and holding `hold: 'blocked'`
- **WHEN** the plan is read
- **THEN** the leaf reports `done`

#### Scenario: readiness yields to anything the steps or the graph say

- **GIVEN** a leaf with `readiness: 'ready'`, no progress, and no held or blocked predecessor
- **WHEN** the plan is read
- **THEN** it reports `ready`; with a blocked predecessor it reports `blocked_by_proxy`; with
  `Dev` in progress it reports `in_progress`

#### Scenario: nothing said is unknown

- **GIVEN** a leaf with no progress, readiness or hold, and no predecessor reading `on_hold`,
  `blocked` or `blocked_by_proxy`
- **WHEN** the plan is read
- **THEN** it reports `unknown`

### Requirement: Blocked by proxy is derived from the full dependency graph

A leaf SHALL read `blocked_by_proxy` exactly when it reads neither `done`, a hold nor
`in_progress`, and a chain of dependencies reaches it from a leaf holding `on_hold` or
`blocked` through unstarted or held leaves.
Predecessors SHALL come from every legacy and typed dependency, of every relationship type,
expanded to leaves, whether or not the predecessor takes part in the schedule. A leaf reading
`done` or `in_progress` SHALL stop the chain. No leaf SHALL read `blocked_by_proxy` without such
a chain, so a cycle of unstarted leaves with no hold behind it reads as their own statuses. A
leaf-level cycle permitted by an acyclic step-node graph SHALL NOT prevent the derivation.

#### Scenario: a successor two edges behind a held leaf is blocked by proxy

- **GIVEN** leaves `A → B → C`, A `on_hold`, B and C with nothing said
- **WHEN** the plan is read
- **THEN** B and C both report `blocked_by_proxy`

#### Scenario: running work stops the proxy

- **GIVEN** leaves `A → B → C`, A `blocked`, B's `Dev` `in_progress`, C with nothing said
- **WHEN** the plan is read
- **THEN** B reports `in_progress` and C reports `unknown`

#### Scenario: a parent's dependency blocks every leaf beneath the successor

- **GIVEN** a dependency from leaf A to a parent P with two leaves, A `blocked`
- **WHEN** the plan is read
- **THEN** both leaves under P report `blocked_by_proxy`

#### Scenario: a cycle of work items reads a hold only from outside it

- **GIVEN** leaves A and B with typed dependencies `A.dev → B.dev` and `B.qa → A.qa`, both with
  nothing said
- **WHEN** the plan is read
- **THEN** A and B report `unknown`; with a `blocked` leaf C and `C → A`, both report
  `blocked_by_proxy`

### Requirement: A parent folds its children's statuses the same way at every depth

A parent's status SHALL be, in order: `done` when every child reads `done`; `on_hold` when
every child reads `on_hold`; `blocked` when every child reads `blocked`; `in_progress` when
any child reads `done` or `in_progress`; `blocked_by_proxy` when every child reads `on_hold`,
`blocked` or `blocked_by_proxy`; otherwise, over the children reading none of those three,
`unknown` when any reads `unknown`, `draft` when any reads `draft`, else `ready`. The fold of
no children SHALL be `unknown`. Folding a parent's children and folding every leaf beneath
it SHALL give the same status for every partition of the leaves.

#### Scenario: a branch with one held and one ready leaf is ready

- **GIVEN** a parent with one leaf `on_hold` and one `ready`
- **WHEN** the plan is read
- **THEN** the parent reports `ready`

#### Scenario: a branch whose leaves are all stopped is blocked by proxy

- **GIVEN** a parent with one leaf `on_hold` and one `blocked`
- **WHEN** the plan is read
- **THEN** the parent reports `blocked_by_proxy`

#### Scenario: a subset fold agrees with the tree fold

- **GIVEN** any tree and any leaf statuses
- **WHEN** a parent is folded from its children and, separately, from all its leaves
- **THEN** both folds report the same status

### Requirement: An on-hold leaf takes no part in the schedule

Before Fast, the solver request builder or a saved plan's schedule reads the plan, every held
leaf and every ancestor whose leaves are all held SHALL be removed from the schedule input
together with their slices, every legacy and typed dependency touching them, and their
not-before and deadline entries. A held row SHALL report `schedule: null` and `dates: null`; a
parent's bracket SHALL span its unheld leaves and be `null` when it has none. This hold reduction SHALL change the canonical schedule input only for plans holding
something. Its introduction did not change the scheduler contract or solver wire version.

#### Scenario: a successor no longer waits for held work

- **GIVEN** leaves `A → B`, A estimated 5 days and `on_hold`
- **WHEN** the plan is scheduled
- **THEN** B starts on day zero, A reports `schedule: null`, and B reports `blocked_by_proxy`

#### Scenario: a held assignee frees its person

- **GIVEN** leaves A and B on the same person, A first in queue and `on_hold`
- **WHEN** the plan is scheduled
- **THEN** B starts on day zero

#### Scenario: a parent of held leaves leaves the plan with them

- **GIVEN** a parent whose every leaf is `on_hold`, with a deadline and an incoming dependency
- **WHEN** the plan is scheduled
- **THEN** the parent has no slice, no bracket and no dependency in the schedule input, and the
  schedule is computed without error

### Requirement: Blocked work, readiness and blocked by proxy change no schedule

A leaf reading `blocked`, `draft`, `ready` or `blocked_by_proxy` SHALL take part in the
schedule exactly as it would with nothing said: its nodes, dependencies, duration, person
queue, pool slots, floors and deadlines are unchanged, and its bar is where the forecast puts
it.

#### Scenario: the golden corpora stay byte-identical

- **GIVEN** every Fast and solver golden corpus case with any leaves marked `blocked`, `draft`
  or `ready`
- **WHEN** the schedules and canonical inputs are computed
- **THEN** both are byte-identical to the unmarked case

### Requirement: A work item's status is set by one act for every settable status

`setStatus` SHALL act on a leaf, or on every leaf beneath a parent, as one journal entry whose
inverse restores every prior progress statement, readiness, hold and fact date verbatim.
`done` SHALL write today's done statements on every project step of each target leaf and clear its hold. `in_progress` on a leaf not
reading `done` SHALL write `in_progress` on its first step in step order holding no statement,
fill an empty fact start with `on` or the day of the act, and clear that leaf's hold. On a
parent it SHALL start one leaf only: the first in tree order holding no progress statement,
preferring unheld leaves, and only when every such leaf is held the first held one; it SHALL
clear the hold of that leaf alone, and a parent already reading `in_progress` SHALL write
nothing. `in_progress` on a leaf reading `done` SHALL reopen it: its last step in step order
goes from `done` to `in_progress` and its fact end is cleared while its fact start stays; on a
parent reading `done` the same SHALL happen on its first leaf in tree order, and the parent's
own fact end SHALL be cleared too. In a project with no steps `in_progress` and `done` SHALL be
refused `409 no_steps`, and the menu SHALL NOT offer `in_progress` there. `ready` and `draft` SHALL set readiness and clear the hold, and SHALL
be refused `409 readiness_after_progress` when a leaf holds any progress statement. `on_hold`
and `blocked` SHALL set the hold and leave progress, readiness and facts untouched, and SHALL
be refused `409 cannot_hold_done` on a row reading `done`; beneath a parent, a leaf reading
`done` SHALL keep no hold. `unknown` SHALL clear progress,
readiness and hold. Any status other than a hold SHALL clear the hold of every leaf it acts on.
Steps already reading the requested state SHALL remain unchanged. A successful change
SHALL advance exactly the revisions of work items it writes and announce one tree change.
When nothing would change, nothing SHALL be written, journalled or announced.

#### Scenario: resuming returns the row to what it was

- **GIVEN** a `ready` leaf put `on_hold`
- **WHEN** `setStatus` sets it `ready`
- **THEN** the hold is cleared and the leaf reports `ready`

#### Scenario: in progress on a parent starts one leaf

- **GIVEN** a parent with three unstarted leaves
- **WHEN** `setStatus` sets it `in_progress` on `2026-10-01`
- **THEN** only the first leaf in tree order gains `in_progress` on its first step and fact start
  `2026-10-01`, and the parent reports `in_progress`

#### Scenario: in progress on a parent prefers an unheld leaf and clears only its hold

- **GIVEN** a parent whose leaves in tree order are L1 `on_hold`, L2 with nothing said and L3
  `blocked`
- **WHEN** `setStatus` sets the parent `in_progress`
- **THEN** only L2 gains `in_progress` on its first step; L1 stays `on_hold` and L3 stays
  `blocked`; had L2 been held too, L1 would start and lose its hold; a parent already reading
  `in_progress` writes nothing and journals nothing

#### Scenario: in progress reopens a done leaf

- **GIVEN** a leaf done on `Dev` and `QA` with fact start `2026-09-01` and fact end `2026-09-20`
- **WHEN** `setStatus` sets it `in_progress`
- **THEN** `QA` reads `in_progress`, `Dev` stays `done`, the fact end is `null`, the fact start is
  `2026-09-01`, and one undo restores `QA: done` and the fact end `2026-09-20`

#### Scenario: a project with no steps cannot be started or finished

- **GIVEN** a project holding no steps and one leaf
- **WHEN** `setStatus` sets the leaf `in_progress` or `done`
- **THEN** it is refused `409 no_steps`, nothing is written, and the row menu offers neither

#### Scenario: one undo restores a held branch

- **GIVEN** a parent whose leaves held `ready`, `blocked` and nothing before it was put `on_hold`
- **WHEN** the actor undoes once
- **THEN** each leaf holds exactly the readiness and hold it held before

### Requirement: Structural edits carry readiness and hold with the leaf

Duplicating a leaf SHALL copy its readiness and never its hold. When a leaf gains its first
child, its readiness and hold SHALL move to that child with its progress. When another row
moves under a leaf, that leaf's readiness and hold SHALL be cleared in the same journal entry,
since the moved row is other work. When a parent loses
its last child, the parent SHALL take a readiness or hold only when every former leaf agreed
on it, else none. A readiness or hold SHALL never be written on a row that has children, by any
command, undo or redo; the write itself SHALL refuse it.

#### Scenario: an undo never puts a statement on a parent

- **GIVEN** a leaf set `on_hold` then `unknown` by one actor, and a first child added under it by
  another
- **WHEN** the first actor undoes
- **THEN** the undo is refused, no readiness or hold is written on the parent, and the plan still
  reads

#### Scenario: a duplicate is not on hold

- **GIVEN** a `ready` leaf that is `on_hold`
- **WHEN** it is duplicated
- **THEN** the copy has readiness `ready` and no hold

### Requirement: The row menu and Status cell offer every status the row does not read

The row menu, on the table and on a card, SHALL open with a status section listing `Set status
to <word>` for each settable status the row does not read and whose write would change
something, in the order Draft, Ready, In progress, On hold, Blocked, Done, Unknown. Done SHALL
keep the completion prompt; In progress SHALL open it asking for `Started on` only. The Status
cell picker SHALL offer the same list. Each status SHALL have its own glyph, word and strip
colour; `blocked_by_proxy` SHALL be drawn muted and never offered. An unrecognised status word
from the API SHALL render the plan's query-failure state, not a blank glyph.

The centred row menu SHALL remain available on the table and card when the Status cell is
hidden. Selecting Done SHALL wait for completion-prompt confirmation before sending
`setStatus … done`. Selecting the offered Unknown SHALL send `setStatus … unknown` at once.

#### Scenario: a held row does not offer its own hold

- **GIVEN** a leaf reading `on_hold`
- **WHEN** its row menu opens
- **THEN** it offers every settable status but `On hold`, and `Draft` or `Ready` only if no step
  has spoken

### Requirement: The Gantt says each status on its bar

An on-hold row SHALL draw no bar and a muted `On hold` word in its row, and no dependency arrow
from it. A blocked row SHALL draw its bar with a blocked outline and `data-blocked`, and its
outgoing arrows in the blocked colour. A blocked-by-proxy row SHALL draw a hatched bar with
`data-blocked-by-proxy`, whose card names the held or blocked predecessor. A done bar SHALL be
unchanged.

#### Scenario: a held leaf draws no bar

- **GIVEN** a leaf `on_hold` with an estimate
- **WHEN** the Gantt renders
- **THEN** the row shows `On hold` and no bar, and its successor's bar is hatched

### Requirement: The notes editor closes on Escape and on Done, and both save

While a work item's Name box is being written in, Escape SHALL commit what is in the box through
the same blur path as leaving it does. A Done button SHALL stand in the Name cell's top-right, beside
the notes marker, and SHALL do the same on a pointer press. Both exits SHALL collapse the box to
its at-rest height and close the rendered-notes panel. Neither SHALL discard anything. Done SHALL
stay out of the tab order, and Escape SHALL remain the keyboard exit. The rendered editing and
hover previews SHALL match.

#### Scenario: Escape saves and closes

- **GIVEN** the Name box open with notes typed into it
- **WHEN** Escape is pressed
- **THEN** the notes SHALL be saved as typed
- **AND** the box SHALL be at its rested height and no longer focused
- **AND** the rendered-notes panel SHALL be gone

#### Scenario: Done saves and closes

- **GIVEN** the Name box open with notes typed into it
- **WHEN** the Done button beside the notes marker is pressed
- **THEN** the notes SHALL be saved as typed
- **AND** the box SHALL be at its rested height and the panel gone

#### Scenario: Done is what the pointer lands on

- **GIVEN** the Name box open with the rendered-notes panel visible
- **THEN** a hit test at the centre of the Done button in the Name cell SHALL answer the button
  rather than the underlying row

#### Scenario: Done stands by the notes marker and saves

- **GIVEN** the Name box open with notes typed into it
- **THEN** the Done button SHALL be beside the notes marker in the cell's top-right
- **AND** a hit test at its centre SHALL answer the button
- **WHEN** it is pressed
- **THEN** the notes SHALL be saved as typed and the editor closed

### Requirement: An unestimated slice takes an assumed duration in the schedule

The system SHALL schedule a slice nobody has estimated across two workdays,
called its **assumed duration**, rather than across no time at all.

The assumed duration SHALL be one constant shared by the schedule and the
drawing, so that a bar's width and the dates beside it cannot disagree.

The assumption SHALL apply to every constraint the schedule holds: dependencies,
not-before floors, resource leveling and team capacity. An unestimated slice
with an assignee SHALL occupy that assignee, and one on a team SHALL spend that
team's pool, for its assumed duration.

#### Scenario: an entirely unestimated predecessor delays its successor

- **GIVEN** a predecessor with two steps and no estimates, and a successor
  depending on it
- **WHEN** the plan is scheduled
- **THEN** the predecessor SHALL finish four workdays after it starts
- **AND** the successor SHALL start no earlier than that

#### Scenario: two unestimated slices for one person do not overlap

- **GIVEN** two unestimated slices assigned to the same person
- **WHEN** the plan is scheduled
- **THEN** they SHALL NOT be placed on the same workdays

#### Scenario: the drawing and the dates agree

- **GIVEN** an unestimated slice
- **WHEN** its bar is drawn and its dates are read
- **THEN** the bar's span SHALL be the same number of workdays as the schedule
  placed it across

### Requirement: An assumed duration is not an estimate

The system SHALL NOT write an estimate for a slice it has assumed a duration
for. Everything that reports whether work has been estimated SHALL continue to
report that it has not: the days column, the roll-up, the readiness badge and
its walk to the next gap, the export, the filter's estimated-steps facet, and
the anchor-slice reach's choice of first **estimated** slice.

An unestimated slice's bar SHALL continue to be painted as a guess — its dotted
outline, its translucent fill and its `?` unchanged.

#### Scenario: an unestimated item still reports no estimate

- **GIVEN** a work item with no estimates, scheduled after this change
- **THEN** its days column SHALL be blank
- **AND** it SHALL be counted as an estimate gap
- **AND** the export SHALL report it as unestimated

#### Scenario: the anchor reach still means first _estimated_

- **GIVEN** a project on the `anchor-slice` reach, and a predecessor whose first
  step is unestimated and whose second step is estimated
- **WHEN** the plan is scheduled
- **THEN** the successor SHALL wait for the **second** step's finish
- **AND** it SHALL NOT wait for the first step's assumed finish

#### Scenario: the bar still says it is a guess

- **GIVEN** an unestimated slice with detail shown
- **WHEN** its bar is drawn
- **THEN** it SHALL carry the assumed marking it carried before this change

### Requirement: A work item carries a fact start and a fact end, date-only, on any row

Every work item SHALL carry `factStart` and `factEnd`: nullable, date-only `IsoDate`, with no
time of day and no zone, stored as `work_item.fact_start` and `work_item.fact_end`. Both SHALL
join the work-item patch as nullable dates validated at the route — a non-date refused `400
fact_start_must_be_a_date` / `fact_end_must_be_a_date`, `null` clearing — on any work item,
leaf or parent, never handed down when a leaf gains a child and never folded. Both SHALL ride
the existing `patch` journal entry and its undo, with no new step kind. A duplicate SHALL copy
neither. Saved plans SHALL hold neither. The JSON export SHALL carry both and the status
through the shared work-item shape, and the table's spreadsheet export SHALL carry all three
as columns. Every work item existing before this change SHALL report both as `null`.

#### Scenario: a fact end is written, read and undone as an ordinary field

- **GIVEN** a leaf with `factEnd: null`
- **WHEN** it is patched with `factEnd: '2026-09-12'`, then the edit is undone
- **THEN** the read reports `'2026-09-12'` after the patch and `null` after the undo, through
  the same `patch` entry every other field uses

#### Scenario: a non-date is refused at the boundary

- **GIVEN** a patch with `factStart: 'yesterday'`
- **WHEN** it reaches the commands route
- **THEN** it is refused `400 fact_start_must_be_a_date` and no row is written

#### Scenario: a duplicate has not happened

- **GIVEN** a done leaf with both fact dates
- **WHEN** its subtree is duplicated
- **THEN** the copy reports `factStart: null`, `factEnd: null` and `status: 'unknown'`

#### Scenario: an undo of a delete puts the facts back

- **GIVEN** a leaf with both fact dates that is deleted
- **WHEN** the delete is undone
- **THEN** the restored row reports both dates as they were

### Requirement: Marking done fills an empty fact end with the day of the act

Marking a work item `done` SHALL fill the fact end of every work item the act writes — the
leaves and, for a parent, the parent itself — whose `factEnd` is `null` with `on`, and the
fact start of each whose `factStart` is `null` with `factStart` when the command carries one;
`on` absent, be-01 SHALL take the calendar day of the act's own write stamp in UTC. A stored
day SHALL NOT be overwritten by the fill. A `factStart` that is not an `IsoDate` SHALL be
refused `400 factStart_must_be_a_date` before any service runs. Setting `unknown` SHALL set
both `factEnd` and `factStart` to `null` on every work item in scope whose status read `done`
before the act, and SHALL leave the facts of every other row untouched. The fills and the
clears SHALL be part of the same journal entry as the statements, so one undo takes them away
or puts them back together.

#### Scenario: a typed fact end survives the mark

- **GIVEN** a leaf whose fact end reads `2026-09-10`
- **WHEN** it is marked `done` with `on: '2026-09-12'`
- **THEN** its fact end still reads `2026-09-10`

#### Scenario: be-01 supplies the day when the client does not

- **GIVEN** a clock whose act stamps `2026-09-12T23:30:00Z`
- **WHEN** a leaf with no fact end is marked `done` with no `on`
- **THEN** its fact end reads `2026-09-12`

#### Scenario: the reader's day wins over the server's

- **GIVEN** a browser whose local day is `2026-09-13` while UTC is still `2026-09-12`, and a
  leaf with no fact end whose forecast ends on or after `2026-09-13`
- **WHEN** the Status cell marks it done and the completion prompt is confirmed as offered
- **THEN** the command carries `on: '2026-09-13'` and the fact end reads `2026-09-13`

#### Scenario: the start is filled where empty and kept where typed

- **GIVEN** two leaves, one with no fact start and one with `2026-09-02`
- **WHEN** each is marked `done` with `on: '2026-09-12', factStart: '2026-09-08'`
- **THEN** the first's fact start reads `2026-09-08` and the second's still `2026-09-02`

#### Scenario: a non-date start is refused

- **GIVEN** a `setStatus` with `factStart: 'last week'`
- **WHEN** it reaches the commands route
- **THEN** it is refused `400 factStart_must_be_a_date` and no row is written

#### Scenario: unknown takes both days, and one undo brings both back

- **GIVEN** a parent marked `done` on `2026-09-12` from `2026-09-08`
- **WHEN** `setStatus` sets it `unknown`, then the actor undoes once
- **THEN** every fact start and fact end in scope is `null` after the act and back after the
  undo, from one journal entry

### Requirement: The table shows Status, Fact start and Fact end, and marks a done row

The table SHALL offer three columns — `Status`, `Fact start`, `Fact end` — hidden by default
and offered in the Columns control in table order after `Deadline`. The Status cell SHALL show
the row's status in words and offer `Unknown` and `Done` to choose, on a parent as on a leaf;
`In progress` SHALL be shown but not offered. The two fact cells SHALL be date cells with the
deadline cell's rest and edit states. A row whose status is `done` SHALL carry `data-row-done`,
and its number SHALL read struck through. DONE status SHALL add no strike or muted ink to its
name, which retains its own Markdown formatting, on every stripe and under every row light.

#### Scenario: the Columns control offers the three in order

- **GIVEN** the Columns control open on a two-step plan
- **WHEN** its entries are read
- **THEN** `Status`, `Fact start`, `Fact end` follow `Deadline` in that order, and none of the
  three is on screen until chosen

#### Scenario: choosing Done marks the row and fills the fact end

- **GIVEN** a leaf reading `Unknown` with the three columns shown
- **WHEN** `Done` is chosen in its Status cell
- **THEN** the row reads `Done`, its number is struck through, DONE status adds no strike to its
  name, and its Fact end cell reads today

#### Scenario: a partly done row reads In progress and can still be finished

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` says nothing
- **WHEN** its Status cell is read and then opened
- **THEN** it reads `In progress`, and the list offers `Unknown` and `Done` only

### Requirement: A done work item draws one done bar over its fact span

On the Gantt panel a leaf whose status is `done` SHALL draw one bar in place of its slices: it
SHALL stop at the end of its fact end's day and start at its fact start's day, or where its
first slice started when it has no fact start; a start at or after the stop SHALL be drawn as
the one day the fact end names. Absent a fact end, the done bar SHALL span the leaf's slices.
On a plan with no start date the done bar SHALL span the leaf's slices unclipped. The done bar
SHALL be marked as done in paint, in its `aria-label` and in `data-done`, SHALL NOT reuse the
assumed span's dotted translucent signature, SHALL answer for every slice id of its leaf so
person and capacity links still find it, and dependency arrows leaving the leaf SHALL leave the
done bar's stop. A parent's bracket SHALL stay be-01's projection.

#### Scenario: the estimate reaches past the fact and the bar does not

- **GIVEN** a done leaf whose slices run workdays 8→15 and whose fact end is the day of
  workday 11
- **WHEN** the chart is laid out
- **THEN** one bar is drawn for the leaf, starting at 8 and stopping at the end of workday 11,
  and no bar for the leaf reaches 15

#### Scenario: a plan that drifted past the fact still draws the fact

- **GIVEN** a done leaf whose slices run workdays 20→25 and whose fact end is the day of
  workday 11, with no fact start
- **WHEN** the chart is laid out
- **THEN** the leaf draws one bar covering exactly workday 11

#### Scenario: a fact start moves the bar's start

- **GIVEN** a done leaf whose slices run workdays 8→15, fact start on workday 6, fact end on
  workday 11
- **WHEN** the chart is laid out
- **THEN** the bar runs 6→12 (the stop of workday 11)

#### Scenario: the arrow leaves the done bar

- **GIVEN** a done leaf clipped to workday 11 with a successor waiting on it
- **WHEN** the arrows are laid out
- **THEN** the arrow's `fromFinish` is the done bar's stop, not the slice's 15

#### Scenario: a person link still finds the done bar

- **GIVEN** a done leaf whose `QA` slice was somebody's resource predecessor
- **WHEN** the person links are laid out
- **THEN** the link is drawn from the done bar and none is dropped

#### Scenario: the done bar is not the assumed span

- **GIVEN** a done leaf whose slices were unestimated
- **WHEN** its bar is painted
- **THEN** it carries `data-done="true"`, no `data-assumed`, a solid stroke and the done mark

### Requirement: Dependencies constrain scheduled slices

Legacy dependencies SHALL continue to use the project's dynamic `depReach`, including `anchor-slice`, until explicitly edited. Typed FS dependencies SHALL name a predecessor and a successor endpoint, each `{ scope: whole, workItemId }`, `{ scope: node, stepNodeId }` or `{ scope: descendant-step, workItemId, stepId }`, and SHALL constrain each resolved predecessor step node's finish to no later than each resolved successor step node's start. A whole leaf predecessor SHALL resolve to its last step node and a whole leaf successor to its first. A whole parent SHALL resolve to every descendant leaf, and a descendant-step endpoint to that step's node in every descendant leaf; every resolved predecessor/successor pair SHALL be constrained. A node endpoint SHALL name a leaf's step node; a descendant-step endpoint SHALL name a parent. A project without steps SHALL offer only whole scope, resolved to each leaf's work-item boundary. Unknown step nodes SHALL remain zero-duration graph nodes, irrespective of their visual placeholder width. Resolved typed edges SHALL carry `authored` provenance and their relationship ID beside `workflow` and `legacy` edges.

#### Scenario: Dev handoff overlaps QA

- **GIVEN** A and B each have Dev then QA, with A.Dev estimated and A.QA still running
- **WHEN** an FS dependency from node `A.dev` to node `B.dev` is scheduled
- **THEN** B.Dev may start when A.Dev finishes, subject to other real constraints
- **AND** it does not wait for A.QA solely because of this dependency

#### Scenario: A node predecessor and a whole successor

- **GIVEN** A and B each have Dev then QA
- **WHEN** node `A.dev` → whole B FS is scheduled
- **THEN** B.Dev waits for A.Dev's finish and B.QA follows B.Dev through its workflow edge

#### Scenario: A whole predecessor and a node successor

- **GIVEN** A and B each have Dev then QA
- **WHEN** whole A → node `B.qa` FS is scheduled
- **THEN** B.QA waits for A.QA's finish and B.Dev may start earlier

#### Scenario: A parent endpoint selects every leaf

- **GIVEN** parent A has two leaf descendants and B has one
- **WHEN** Whole A to Whole B FS is added
- **THEN** B's first step node waits for both A leaves' last step nodes
- **AND** the picker explains “All descendant work items” with the affected count

#### Scenario: A descendant-step endpoint selects one step in every leaf

- **GIVEN** parent A has two leaves, each with Dev then QA
- **WHEN** descendant-step A Dev → node `B.dev` FS is added
- **THEN** B.Dev waits for both leaves' Dev nodes and not for their QA nodes

#### Scenario: Legacy anchor remains dynamic

- **GIVEN** an existing dependency under `anchor-slice` reach
- **WHEN** the project's steps or estimates change without editing that dependency
- **THEN** it follows the current anchor rule, rather than a pinned explicit endpoint

### Requirement: Authored dependencies form an acyclic step-node graph

The system SHALL validate the resolved step-node graph, including workflow and legacy edges, before accepting typed or legacy dependency creation, update or removal; reparenting, step insertion, deletion or reordering; project `depReach` changes; estimate edits that move a dynamic legacy anchor; or undo/redo and batch replay. All relevant writes SHALL validate the combined graph atomically against their resulting tree, step order, estimates and links. A refusal SHALL preserve all earlier state. It SHALL reject directed cycles, self-node pairs and any selector expansion producing one, without silently omitting pairs. A valid step-node DAG SHALL NOT be refused merely because work-item IDs appear cyclic. Deleting a step referenced by a node or descendant-step endpoint SHALL be refused until its typed dependencies are removed or reassigned. When a leaf with node endpoints gains its first child, those endpoints SHALL move with the hand-down's step node mapping in the same transaction. Deleting a work item SHALL remove, in the same undoable entry, the typed relationships whose node or descendant-step endpoints lie in the deleted subtree; hand-up of facts SHALL carry no endpoints. A move or deletion that would leave a descendant-step endpoint naming a leaf SHALL be refused naming the affected dependencies. No structural edit SHALL broaden or narrow an endpoint's scope.

#### Scenario: Apparent work-item cycle is a valid step-node DAG

- **GIVEN** `A.dev` → `B.dev` and `B.qa` → `A.qa` with Dev then QA inside each item
- **WHEN** the second edge is validated
- **THEN** it is accepted if the resolved step-node graph is acyclic

#### Scenario: Parent expansion introduces a self-node pair

- **GIVEN** a proposed parent endpoint whose descendant expansion includes the successor step node
- **WHEN** the dependency is submitted
- **THEN** the entire write is refused with a modeled conflict and no edge is stored

#### Scenario: An estimate edit moves a legacy anchor into a cycle

- **GIVEN** typed `A.qa` → `B.qa` and legacy B → A with `anchor-slice` reach currently anchored at B.Dev
- **WHEN** B.Dev's estimate is cleared so B.QA becomes the legacy anchor
- **THEN** the combined-graph cycle is refused atomically and the estimate and anchor stay unchanged

#### Scenario: Changing dependency reach closes a cycle

- **GIVEN** typed `A.qa` → `B.qa` and legacy B → A with `anchor-slice` reach anchored at B.Dev
- **WHEN** a mounted project update changes `depReach` to `whole-item`
- **THEN** the resulting combined-graph cycle is refused atomically and `depReach` and links stay unchanged

#### Scenario: A legacy write bypasses a typed edge

- **GIVEN** an existing typed edge in a valid step-node DAG
- **WHEN** a mounted legacy `addDependency` or history replay would close a cycle
- **THEN** it is refused with no partial dependency or history write

#### Scenario: A descendant-step parent cannot silently become a leaf

- **GIVEN** descendant-step 020 Dev → node `030.dev` and 020 has one child
- **WHEN** that child is deleted
- **THEN** the deletion is refused naming the relationship and nothing is written

#### Scenario: A node endpoint follows hand-down

- **GIVEN** a typed dependency on node `010.dev`
- **WHEN** 010 gains its first child 010.1
- **THEN** the dependency names node `010.1.dev` and undo restores `010.dev`

### Requirement: Explicit dependencies are editable from the table and chart

The Depends on picker SHALL add Whole→Whole FS by clicking a search result after opening it. Opened from a leaf's step cell, it SHALL preselect the same step on both sides, resolved by step ID and replaced by any explicit choice; a predecessor lacking that step SHALL show the choice unavailable rather than substitute another. Its separate Customize action SHALL open endpoint editing without creating a dependency. Chips SHALL spell endpoints by step reference or work-item number, then type, then the successor's step code when not whole, e.g. `[010.dev FS → dev]` or `[010 FS]`; a descendant-step endpoint SHALL show its parent, step and leaf count and SHALL NOT be spelled as a single step reference. Chips SHALL expose full accessible labels naming both work items and steps. The editor SHALL preserve step order, explain parent expansion and show refusals. Keyboard and mobile users SHALL be able to create, inspect, edit and remove the same relationships without hover. Gantt FS arrows SHALL attach to the resolved step nodes' actual finish/start boundaries, highlight with their chips and cards, and summarize collapsed-parent relationships without misleading self-arrows.

#### Scenario: One-click default and separate customization

- **GIVEN** the dependency picker is open on B's row
- **WHEN** A's search result is clicked
- **THEN** one Whole A → Whole B FS dependency is committed
- **AND** activating A's `›` instead opens endpoint fields without a write

#### Scenario: Opening from a step cell preselects the same step

- **GIVEN** the dependency picker is opened from B's QA cell
- **WHEN** A is chosen in Customize
- **THEN** node `A.qa` → node `B.qa` FS is proposed and nothing is written until Save

#### Scenario: Unknown step node arrow uses scheduled time

- **GIVEN** an unestimated predecessor node with a two-day visual placeholder
- **WHEN** its FS arrow is drawn
- **THEN** the arrow starts at its zero-time scheduled finish tick
- **AND** the placeholder's right edge does not delay or anchor the relationship

#### Scenario: Collapsed relationships remain explainable

- **GIVEN** several leaf relationships under collapsed parents
- **WHEN** the Gantt is drawn
- **THEN** external connectors are grouped by visible ancestors, type and scope with a count
- **AND** internal relationships show an internal-dependencies count rather than a self-arrow

### Requirement: The completion prompt asks for both days, starting from the forecast

The completion prompt SHALL show `Started on` and `Finished on`. `Started on` SHALL open on the
row's held fact start, else the forecast start, else today. `Finished on` SHALL open on the
held fact end, else today while today is not after the forecast end, else the forecast end.
Beside each field the prompt SHALL say what the day is — the day already recorded, the same as
the forecast start or end, today, or a day the reader typed — read off the field's current
value. `Mark done` SHALL be held back while either field is not a calendar day. Confirming
SHALL send `setStatus` with `on` as the finish and `factStart` as the start; a held day the
reader changed SHALL follow as a `patch`.

#### Scenario: today before the forecast end

- **GIVEN** a leaf forecast `2026-09-01` → `2026-09-20`, no facts held, today `2026-09-13`
- **WHEN** the prompt opens
- **THEN** `Started on` reads `2026-09-01` with `Same as the forecast start.`, `Finished on`
  reads `2026-09-13` with `Today.`, and confirming sends `on: '2026-09-13', factStart:
'2026-09-01'`

#### Scenario: today after the forecast end

- **GIVEN** a leaf forecast `2026-09-01` → `2026-09-10`, no facts held, today `2026-09-13`
- **WHEN** the prompt opens
- **THEN** `Finished on` reads `2026-09-10` with `Same as the forecast end.`

### Requirement: Slices cross the wire

The tree payload SHALL carry every scheduled slice: its engine id, work item,
role, person, duration, `estimated`, earliest/latest start and finish, float,
`critical`, its binding floor, and its resource predecessor's id or null. The
numbers SHALL be the engine's verbatim — never rounded, never recomputed. A
slice's `resourcePredecessorId` SHALL reference a slice present in the same
payload. The change SHALL be additive: every field the payload carried before
is unchanged.

The same payload SHALL carry the roles the slices were placed under, in the
order the engine used, and the name of every person its slices are assigned to.
A slice's `roleId` SHALL name a role in the same payload and its `personId`
somebody named in it — the chart is drawn from one read, and a role list or a
directory fetched separately describes another moment.

#### Scenario: two work items, one person

- **WHEN** `Strip` (3 days, Kat) and `Sand` (2 days, Kat) have no dependency
  and the tree is read
- **THEN** the payload holds both slices, `Sand`'s starts at 3 with binding
  floor `person` and `resourcePredecessorId` equal to `Strip`'s slice id

#### Scenario: a phase removed between two reads

- **WHEN** a peer removes a phase after the tree is read and before the role
  list is read
- **THEN** the tree payload still lists the phase its slices are under, and the
  panel drawn from it draws the chart

#### Scenario: nothing else moved

- **WHEN** the tree is read by a client that ignores `slices`
- **THEN** every other field is byte-identical to what it was before this
  change

### Requirement: The Gantt panel mirrors the shown rows

A toolbar control SHALL show and hide the Gantt panel under the plan. The
panel SHALL draw exactly the rows the plan renderer is showing, in the same
order — collapsed branches and rows narrowed away by a search SHALL be absent
— and SHALL do so under either renderer.

#### Scenario: a collapsed branch

- **WHEN** a branch with two children is collapsed and the panel is open
- **THEN** the panel draws the parent's row and neither child's

#### Scenario: a search narrows the plan

- **WHEN** a search leaves three rows on screen
- **THEN** the panel draws exactly those three, in the plan's order

### Requirement: The workday is the SVG unit

The chart SHALL be one SVG whose user-space x unit is one workday: a bar's `x`
SHALL equal its slice's earliest start and its `width` the span it is drawn
across, which is the slice's duration. Each bar SHALL carry `data-start` and
`data-finish` holding the engine numbers verbatim. The viewBox SHALL cover the
whole schedule, 0 through the horizon, and the band outside it the marks of
"The canvas holds every mark" are drawn in.

#### Scenario: user space equals engine numbers

- **WHEN** a slice runs 3.5 → 6 and the panel renders
- **THEN** its bar has `x` 3.5, `width` 2.5, `data-start` "3.5",
  `data-finish` "6", and the SVG viewBox holds 0 through the horizon

#### Scenario: a slice estimated at no days still says where it is

- **WHEN** an estimated slice sits at workday 3 with a duration of 0
- **THEN** a tick stands at workday 3 and `data-start` and `data-finish` both
  read "3"

### Requirement: Leaves draw bars for the work somebody costed, and the rest is behind the switch

A leaf's row SHALL hold one bar per **estimated** slice, in role order, whatever
the switch says. A bar on the critical path SHALL be tinted so, and a bar off it
SHALL not.

With the switch off, a parent's row SHALL draw no mark of its own — no bar, no
bracket, no tick, and no hover surface — and a slice nobody has estimated SHALL
draw no mark of its own: no bar, no tick, no on-bar label and no hover surface.
A leaf with some roles estimated draws those roles' bars alone; a leaf with none
draws an empty track.

With the switch on, a parent's row SHALL draw the translucent ghost of a bar
across its projection, or a tick where that projection has no days; and an
unestimated slice SHALL draw a bar two workdays wide,
translucent and dashed, carrying the `?` that says its width is nobody's
estimate, findable as `data-assumed`.

In **both** states the row SHALL stay on the chart at its own index and the row
height every other row has, so the chart's row `N` stands beside the plan's row
`N`, and the label rail SHALL go on naming it. The engine's numbers, the date
columns, the axis and the canvas SHALL be identical in the two states — the
switch decides what is painted and nothing about where anything is.

A not-before caret SHALL be drawn only on a row that draws at least one mark of
its own: with the switch off, only where a costed bar stands; with it on, on
every row holding a start date, because every such row now draws something for
the caret to stand over.

#### Scenario: a two-role leaf

- **WHEN** a leaf holds Dev 0→3 and QA 3→5, both estimated
- **THEN** its row holds two bars, Dev's before QA's, at those coordinates,
  whichever way the switch is set

#### Scenario: a leaf half estimated, at rest and asked for

- **WHEN** a leaf holds an estimated Dev slice and an unestimated QA slice
- **THEN** its row holds the Dev bar alone and no mark carries `data-assumed`;
  and once the switch is pressed the QA slice's assumed bar is drawn beside it,
  carrying `data-assumed`, with the Dev bar unmoved

#### Scenario: a parent over staggered children

- **WHEN** a parent's children run 0→3 and 2→6
- **THEN** the parent's row holds no `data-gantt-bracket` mark, its children's
  bars are drawn where they were, and every row keeps its index; and once the
  switch is pressed the bracket is drawn across the projection, with every row
  still at its own index

#### Scenario: a parent whose projection has no days

- **WHEN** every child of a parent is unestimated
- **THEN** the parent's row holds no mark at all, and the rows below it are not
  shifted; and once the switch is pressed the row holds the zero-span tick

#### Scenario: a start date held on a row that draws nothing

- **WHEN** a parent and an unestimated leaf each carry a start-no-earlier-than
  date, beside a leaf that carries one and draws a bar
- **THEN** only the drawn leaf's row holds a not-before caret, and both empty
  rows stay on the chart at their own index; and once the switch is pressed all
  three rows hold a caret

#### Scenario: the critical path is visible

- **WHEN** one leaf has float 0 and another float 2
- **THEN** the first row's bar carries the critical tint and the second's does
  not

### Requirement: Calendar labels agree with the date columns

The axis SHALL print calendar labels from the project start date through the
same workday mapping the date columns use, the finish label following the
ceil−1 rule, so a bar's labelled dates and its row's Start/End cells SHALL
never disagree. Without a project start date the axis SHALL print workday
offsets. Weekends SHALL NOT appear on the axis.

#### Scenario: the panel and the columns agree

- **WHEN** the project starts Monday 2026-08-10 and a slice runs 3 → 5
- **THEN** the axis places that bar under Thursday 2026-08-13 through Friday
  2026-08-14, exactly the row's Start and End cells

#### Scenario: no start date

- **WHEN** the project has no start date
- **THEN** the axis prints workday numbers and no calendar dates

### Requirement: One switch draws every mark the chart holds back

The panel SHALL show one labelled switch, `Detail`, that draws **every** mark
the chart holds back and takes them all away again: the dependency arrows —
elbows and heads both — a parent row's summary bracket, and an unestimated
slice's assumed bar with the marks that follow it. There SHALL be no second
control and no per-family answer: one press is the whole of the reader's say
over what the chart draws.

The switch SHALL open **off**, and a chart nobody has asked detail of SHALL hold
no `data-gantt-arrow`, no `data-gantt-arrow-head`, no `data-gantt-bracket` and
no `data-assumed` mark.

Pressed on, the chart SHALL draw each of the three families as it drew them
before `gantt-declutter`, and the marks that follow from them SHALL follow: a
hand-off line whose far end is an assumed bar, and a not-before caret on every
row holding a start date, parents and uncosted leaves among them.

The answer SHALL be remembered by the browser under `wbs.ganttDetail` and SHALL
survive a reload, a project switch and a remount of the panel. It is one
preference for this browser, not one per project, and be-01 SHALL never be told
about it. A stored answer that is not a boolean SHALL be dropped — the key
removed and the switch left off — rather than read as anything.

`wbs.ganttArrows`, the key the arrows-only switch wrote, SHALL be removed from
storage when the panel is opened and SHALL NOT be read as an answer. It answered
a narrower question, and a stored `true` carried across would draw two families
of mark nobody asked for.

Person links between two drawn bars, ticks on costed zero-day slices, the bars
of costed work, the row labels and the axis SHALL be untouched by the switch.

This supersedes, **by name**, `gantt-declutter`'s requirement "The arrows are
off until they are asked for" — replaced in full above — and the clauses of its
"Leaves draw bars for the work somebody costed, and nothing else does" that made
the two removals unconditional. Confirmed by Dany, 2026-08-12: "what i wanted is
for arrows toggle to also affect Unestimated QA ghost bars and Parent
transparent bars. i want to encompass all decluttering into one button."

#### Scenario: The chart opens with none of the three

- **WHEN** the chart is opened on a plan with stored dependencies, a parent row
  and an unestimated slice, and nobody has touched the switch
- **THEN** no `data-gantt-arrow`, `data-gantt-arrow-head`, `data-gantt-bracket`
  or `data-assumed` mark is in the document, and every costed bar, every on-bar
  label, every person link between two costed bars and every row label is drawn

#### Scenario: Asking for the detail

- **WHEN** the switch is pressed
- **THEN** every stored dependency's elbow and head, every parent's bracket and
  every unestimated slice's assumed bar is drawn, and pressing it again takes
  all three away

#### Scenario: The answer outlives the page

- **WHEN** the switch is pressed on and the page is reloaded
- **THEN** the chart opens with the arrows, the brackets and the assumed bars
  drawn, and `aria-pressed` reads `true`

#### Scenario: A stored answer that is not one

- **GIVEN** `wbs.ganttDetail` holding text that is not a boolean
- **WHEN** the chart is opened
- **THEN** the detail is off and the key is gone

#### Scenario: The key the old switch wrote

- **GIVEN** `wbs.ganttArrows` holding `true` and no `wbs.ganttDetail` at all
- **WHEN** the chart is opened
- **THEN** the switch is off, no arrow is drawn, and `wbs.ganttArrows` is gone
  from storage

### Requirement: A bar explains itself and finds its row

Hovering a bar SHALL name its slice's binding floor in words — for a person
floor, naming the person and the slice they were finishing. Clicking a bar or
its row label SHALL take the plan to that row: the row's name cell is scrolled
into view and focused, under either renderer. Rows with a manual start SHALL
carry a not-before flag at that date's workday offset.

#### Scenario: the reason is on the bar

- **WHEN** `Sand`'s slice is floored by Kat finishing `Strip`
- **THEN** its bar's hover text names Kat and `Strip`

#### Scenario: click lands on the row

- **WHEN** a bar of row `Sand` is clicked
- **THEN** `Sand`'s name cell is focused and scrolled into view

#### Scenario: a manual date is marked

- **WHEN** a row holds start-no-earlier-than at workday 4
- **THEN** its row carries a not-before flag at x = 4

### Requirement: Row labels hold the left edge

The panel's row labels SHALL stay visible at the left edge while the chart
scrolls horizontally, at phone width too. The panel SHALL NOT widen the page:
the chart scrolls inside the panel. Each label SHALL read `<number> - <name>`,
the same derived number the plan's Number column shows, so the two drawings of
one plan name their rows alike; a row with no name reads `<number> - (unnamed)`.
A bar's hover text SHALL open on the same words.

#### Scenario: a row is named the way the plan names it

- **WHEN** row `010.1` is called `Sanding` and the panel is open
- **THEN** its label reads `010.1 - Sanding` and its bar's hover text opens on
  the same line

#### Scenario: scrolled to the horizon on a phone

- **WHEN** the viewport is 390px wide and the chart is scrolled fully right
- **THEN** every row label is still visible and the page itself has not
  scrolled sideways

### Requirement: One pointed row, and each face lights the other's answer

The plan SHALL have at most one **pointed row** at a time. The pointer over any
**bar**, **row label** or any point on a Gantt row's own line SHALL point that
row's work item; the pointer over a plan renderer row SHALL point that row's
work item. Pointing SHALL be immediate — no delay on either face — and the
pointer leaving all pointable rows SHALL clear its contribution. A focused
bar SHALL continue to point its row when the pointer contribution clears.

A pointed row SHALL be lit in the Gantt panel, on its **row label** and as a band
across its row, whichever face pointed it.

A pointed row SHALL be lit in the plan renderer, whichever face pointed it. A row
the pointer is resting on there SHALL carry the row light like any other, and
that light SHALL NOT differ by whether the alternating band tints that row.

Every light SHALL be painted in the **row light**, the same tint a hovered Depends
on cell paints the rows it waits for. There SHALL be no second tint.

A pointed row SHALL move nothing: no face scrolls, and no row is brought into
view.

Pointing a Gantt row SHALL NOT open the surface a bar opens. A bar's own hover
SHALL be unchanged: it points its row as it always did, and still opens its
surface after its wait.

#### Scenario: hovering a bar lights its row label, its band and its table row

- **WHEN** the pointer rests on a bar on a plan whose rows are all shown
- **THEN** the row label for that bar's work item carries the row light, a band
  is drawn across that work item's Gantt row, and that work item's row in the
  plan renderer carries the row light

#### Scenario: hovering a table row lights its Gantt label and band, and itself

- **WHEN** the pointer rests on a row of the plan renderer
- **THEN** that work item's row label and Gantt row band carry the row light, and
  that row of the plan renderer carries it too

#### Scenario: an alternating row lights the same colour as an unbanded one

- **WHEN** the pointer rests on a row of the plan renderer that the alternating
  band tints, and then on one the band does not
- **THEN** both rows are painted the same colour while pointed

#### Scenario: the empty part of a Gantt row points that row

- **GIVEN** a Gantt row whose bar ends well short of the chart's right edge
- **WHEN** the pointer rests on that row's line past the end of its bar
- **THEN** that work item's row label, Gantt band and plan renderer row all carry
  the row light, and no bar surface is opened

#### Scenario: a row nobody has estimated still points

- **GIVEN** a work item with no estimate whose Gantt row may draw an assumed
  placeholder bar
- **WHEN** the pointer rests on that row's line in the chart
- **THEN** that work item is the pointed row on both faces

#### Scenario: the light moves rather than accumulating

- **WHEN** the pointer moves from one bar to a bar on a different row
- **THEN** exactly one row is lit, and it is the second bar's

#### Scenario: leaving clears the light

- **GIVEN** no bar holds keyboard focus
- **WHEN** the pointer leaves all pointable rows without arriving on another
  Gantt or plan renderer row
- **THEN** no row on either face is lit

#### Scenario: a bar's other roles are not lit

- **WHEN** a work item is estimated for two roles, so its row draws two bars, and
  the pointer rests on the first of them
- **THEN** the row is lit on both faces and the second bar is drawn exactly as it
  is drawn with nothing pointed

#### Scenario: pointing scrolls nothing

- **WHEN** the pointer rests on a bar whose work item's plan renderer row is
  scrolled out of view
- **THEN** neither face has scrolled, and the row label and band are lit

### Requirement: A bar's focus points its row, and the pointer outranks it

A bar holding the keyboard focus SHALL point its work item's row, by the three
lights above and with no delay. Where a bar holds the focus and the pointer rests
on a different row at the same time, the **pointer's** row SHALL be the pointed
one.

#### Scenario: focusing a bar lights its row

- **WHEN** a bar takes the keyboard focus with the pointer resting nowhere on
  either face
- **THEN** that bar's work item is the pointed row

#### Scenario: the pointer wins while both are live

- **WHEN** one bar holds the keyboard focus and the pointer rests on a different
  work item's bar
- **THEN** the pointer's work item is the pointed row and the focused bar's is
  not

#### Scenario: losing the pointer falls back to the focus

- **WHEN** a bar holds the focus, the pointer rests on a different work item's
  bar, and the pointer then leaves all pointable rows
- **THEN** the focused bar's work item is the pointed row

### Requirement: The row light outranks the alternating band

A pointed row SHALL be painted in the row light whether it is an odd or an even
row of the plan renderer. A row's alternating band SHALL NOT paint over the row
light, including where the pointer rests on the very row a focused bar has
pointed.

#### Scenario: an even row keeps the row light under the pointer

- **WHEN** a bar takes the keyboard focus and the pointer then rests on that same
  work item's row in the plan renderer, and that row is one the alternating band
  tints
- **THEN** that row is painted in the row light, and not in the banded hover
  colour

#### Scenario: both stripes are painted one colour

- **WHEN** the same is done to a row the alternating band does not tint
- **THEN** that row is painted the same colour as the banded row above

### Requirement: A row with no bars is still pointable

A work item the Gantt panel draws no bar for SHALL still be a pointable row.
An unestimated item may draw an assumed placeholder bar; an item with no role
may draw no bar at all. In either case its row label and Gantt row band SHALL
light from its plan renderer row, and its plan renderer row SHALL light from
its row label.

#### Scenario: an unestimated row lights across both faces

- **WHEN** the pointer rests on the plan renderer row of a work item no role has
  been estimated for
- **THEN** that work item's row label and Gantt row band carry the row light

#### Scenario: a row label points its own row

- **WHEN** the pointer rests on the row label of a work item the panel draws no
  bar for
- **THEN** that work item is the pointed row

### Requirement: Pointing a row never remounts a cell

Pointing a row MAY re-render only the plan renderer rows whose light changes,
and SHALL NOT remount any of its cells. A pointed row SHALL NOT take the focus
from, or discard the half-typed value in, a cell being edited. Pointing SHALL
NOT re-render the Gantt chart's marks — bars, gridlines, dependency links,
carets, alternating bands or axis. Only the rows gaining or losing the row light, the Gantt
light layer (the pointed band and label rail), and state-routing shells MAY
re-render.

#### Scenario: an open editor survives the pointer crossing the chart

- **WHEN** a cell is being edited with a value typed into it but not committed,
  and the pointer then crosses several bars on the Gantt panel
- **THEN** the cell still holds the focus and still holds the typed value

#### Scenario: pointing a row re-renders no unrelated row

- **WHEN** the chart points a row of a plan whose rows are all shown, and then
  points a different row
- **THEN** between the two pointings, plan renderer cells render only for the
  rows whose light changed — the row lit and the row unlit — and for no other
  row

#### Scenario: pointing a row re-renders no Gantt mark

- **WHEN** a plan renderer row is pointed, and then a different row is pointed
- **THEN** between the two pointings no bar, gridline, dependency link, caret,
  zebra band or axis cell of the Gantt chart renders again — only the pointed
  band and the label rail answer the change

#### Scenario: the light still lands after the isolation

- **WHEN** the pointer crosses from a plan renderer row onto the Gantt chart's
  line for a different row
- **THEN** the table's light moves off the left row, the chart's band and label
  light the row under the pointer, and the table row of that same work item
  carries the row light

### Requirement: A chart that cannot be drawn costs only the chart

When drawing the panel throws, the plan SHALL stay on screen and editable, and
the panel's place SHALL hold a sentence naming what could not be drawn and why
— the thrown error's own words. The next tree read SHALL clear it: a fault
caught while drawing one read SHALL NOT outlive that read.

#### Scenario: a payload the geometry refuses

- **WHEN** the payload carries a slice whose `resourcePredecessorId` names no
  slice in it
- **THEN** the chart is replaced by a sentence naming that slice, and every row
  of the plan is still on screen and editable

#### Scenario: the skew is over

- **WHEN** a later read carries a payload the geometry accepts
- **THEN** the chart is drawn again without the page being reloaded

### Requirement: The canvas holds every mark

The drawn canvas SHALL contain every mark the panel draws, including the parts
of a dependency arrow's route that fall outside the schedule and the assumed
span an unestimated bar is drawn across. A bar's `x` SHALL remain the engine's
number and its `data-start`/`data-finish` with it: the canvas's edges are not
the schedule's.

#### Scenario: an arrow into workday 0

- **WHEN** a successor starts at workday 0 and an arrow arrives at it
- **THEN** the arrow's head is painted, and its route is inside the canvas

#### Scenario: an arrow off the last bar

- **WHEN** a predecessor finishes at the horizon
- **THEN** the route out past it is inside the canvas

### Requirement: A plan that cannot be scheduled draws no chart

When the schedule is refused — a dependency cycle — the panel SHALL show the
same unscheduled state the table's date columns show, and SHALL NOT crash or
draw stale bars.

#### Scenario: a cycle

- **WHEN** the tree read reports a dependency cycle
- **THEN** the panel shows the plan cannot be scheduled and draws no bars

### Requirement: A bar names its work, not only its worker

A bar's on-bar label SHALL carry the assignee reading it carries today — full
name, initials, or nothing, decided by the bar's drawn width — followed by the
row's own words, `<number> - <name>`, separated by `·`. The row words SHALL be
cropped to the bar's drawn width by the label box itself (ellipsis), never by
dropping them from the string: a bar wide enough for three characters of its row
words shows three characters and `…`, not the assignee alone.

A bar with nobody on it SHALL still write its row words: the label used to be
the assignee alone, so an unassigned bar wrote nothing, and sixty grey bars with
no words is the fault this label removes.

The label font SHALL be one size smaller than the row labels beside the chart
(9px against their 10px), so the words sit inside the bar rather than on it.

#### Scenario: A wide assigned bar

- **WHEN** a 10-workday bar assigned to `Anna Adams` on row `010 - Strip` is drawn
- **THEN** its label reads `Anna Adams · 010 - Strip`, in 9px, cropped by its own box

#### Scenario: A narrow unassigned bar

- **WHEN** a 2-workday bar nobody is on is drawn for row `020 - Sand`
- **THEN** its label reads `020 - Sand` cropped to the bar, and not nothing

### Requirement: A parent draws as a virtual bar, behind the switch

With the switch on, a summary row's span SHALL be drawn as the ghost of a bar —
the same rounded shape a leaf gets, in the page's own ink at low opacity and
unstroked — across the projection `placeGantt` computed, carrying
`data-gantt-bracket`. A projection with no days SHALL be drawn as a tick at the
branch's own day rather than as a rect of no width, which paints nothing.

The mark SHALL NOT be drawn while the switch is off, which is the state every
reader starts in. `gantt-declutter` removed this requirement outright; it is
restored here as one of the three families the `Detail` switch draws.

#### Scenario: the ghost of a bar, and only when asked

- **WHEN** the switch is pressed on a plan whose parent spans workdays 0 → 7
- **THEN** the parent's row holds one `data-gantt-bracket` rect across that
  projection, painted at low opacity rather than in solid ink; and with the
  switch off the same plan holds none

### Requirement: Every hint is drawn by the page

A mark that has something to say beyond its own label SHALL carry those words in
one of two attributes, and SHALL NOT carry a `title`.

Words about **this project** — an inherited value and the row it came from, a
computed date, a row's slack, a link's target, a refusal's reason — SHALL be
carried in `data-fact`. Words about **what a control does** SHALL be carried in
`data-hint`. A mark SHALL carry one or the other, never both; where the words
themselves differ by state, the attribute written SHALL be the one the words
being shown belong to.

The application SHALL draw those words itself, in a card of its own, opened by a
mouse arriving over the mark and by the mark taking the keyboard focus.

A `data-fact` card SHALL open with no delay of the application's own. A
`data-hint` card SHALL open only after the pointer has rested on the control for
three seconds, and SHALL open with no delay when the control takes the keyboard
focus instead.

The card SHALL be placed against the mark it belongs to, and SHALL close when
the pointer moves to anything that is not that mark, when the focus leaves it,
and on Escape.

While the card is open the mark SHALL point `aria-describedby` at it, and SHALL
be left as it was found once the card closes.

A tap SHALL open no card, because a tap has no departure behind it.

Where a mark carrying either attribute is nested inside another, the **nearest**
SHALL be the one that answers.

#### Scenario: a fact the pointer arrives over

- **GIVEN** the plan page, and a mark carrying a `data-fact`
- **WHEN** the pointer moves onto it
- **THEN** the application's own card SHALL be on screen within 400ms, saying
  what the mark's `data-fact` says, placed below the mark and overlapping it
  horizontally

#### Scenario: a control the pointer arrives over

- **GIVEN** the plan page, and a toolbar control carrying a `data-hint`
- **WHEN** the pointer moves onto it and rests there
- **THEN** no card SHALL be on screen one second later
- **AND** the card SHALL be on screen three seconds after the pointer arrived,
  saying what the control's `data-hint` says

#### Scenario: a cursor crossing the toolbar

- **GIVEN** the plan toolbar, and a pointer moving across three hinted controls
  in under a second
- **WHEN** the pointer comes to rest past the last of them
- **THEN** no card SHALL have opened for any of them

#### Scenario: a fact nested inside a hinted control

- **GIVEN** a mark carrying a `data-fact` inside an element carrying a
  `data-hint`
- **WHEN** the pointer moves onto the inner mark
- **THEN** the card SHALL open at once, saying what the `data-fact` says

#### Scenario: no browser tooltip anywhere on the plan

- **GIVEN** the plan page with its toolbar, table and chart drawn
- **WHEN** every element in the document is examined
- **THEN** none SHALL carry a `title` attribute

#### Scenario: no mark carries both attributes

- **GIVEN** the plan page with its toolbar, table and chart drawn
- **WHEN** every element in the document is examined
- **THEN** none SHALL carry `data-hint` and `data-fact` at once

#### Scenario: the pointer moves on

- **GIVEN** an open card of either kind
- **WHEN** the pointer moves onto a mark that carries neither attribute
- **THEN** the card SHALL close

#### Scenario: the keyboard

- **GIVEN** a mark carrying either attribute
- **WHEN** it takes the focus
- **THEN** the same card SHALL open at once, with no wait of either kind, and
  the mark's `aria-describedby` SHALL name it
- **AND WHEN** the card closes, the mark SHALL carry no `aria-describedby` it
  did not have before

#### Scenario: a tap

- **GIVEN** a mark carrying either attribute
- **WHEN** a touch pointer arrives over it
- **THEN** no card SHALL open

#### Scenario: a mark with nothing to say today

- **GIVEN** a mark whose attribute is empty, because the value it is written
  from is absent
- **WHEN** the pointer moves onto it
- **THEN** no card SHALL open

### Requirement: A waiting tool hint shows a wait ring

While a `data-hint` card is waiting to open, the application SHALL draw a ring
beside the cursor, and SHALL draw nothing at all for the first 400ms of that
wait so that a pointer sweeping across a toolbar leaves no mark behind it.

The ring SHALL show how much of the wait is left, SHALL follow the cursor while
it is drawn, and SHALL take no pointer events of its own.

The ring SHALL go when the card opens, when the pointer moves onto anything that
is not the control it was waiting for, and when the pointer leaves the window.

No ring SHALL be drawn for a `data-fact`, for a keyboard focus, or for a touch
pointer.

#### Scenario: the ring appears during the wait

- **GIVEN** the plan toolbar
- **WHEN** the pointer comes to rest on a hinted control
- **THEN** no ring SHALL be on screen 200ms later
- **AND** a ring SHALL be on screen one second later, within 40px of the cursor
- **AND** no ring SHALL be on screen once the card has opened

#### Scenario: the ring goes with the pointer

- **GIVEN** a ring drawn beside the cursor on a hinted control
- **WHEN** the pointer moves off that control before the wait is out
- **THEN** the ring SHALL go, and no card SHALL open

#### Scenario: a fact draws no ring

- **GIVEN** a mark carrying a `data-fact`
- **WHEN** the pointer comes to rest on it
- **THEN** its card SHALL open at once and no ring SHALL ever be drawn
