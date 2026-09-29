# wbs-domain Specification

## Purpose

Define the work breakdown domain rules that planners observe: how estimated and unestimated
steps are scheduled and reported.

## Requirements

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
leaves and, for a parent, the parent itself — whose `factEnd` is `null` with `on`; `on`
absent, be-01 SHALL take the calendar day of the act's own write stamp in UTC. A stored fact
end SHALL NOT be overwritten by the fill. fe-01 SHALL always send `on` as the day the
completion prompt confirmed. Setting `unknown` SHALL set `factEnd` and `factStart` to `null` on every work
item in scope — the leaves and, for a parent, the parent itself — whose status read `done`
before the act (`status-from-the-menu` widened this from the fact end alone), and SHALL leave
the facts of every other row untouched. The fill and the clear SHALL
be part of the same journal entry as the statements, so one undo takes them away together.

#### Scenario: a typed fact end survives the mark

- **GIVEN** a leaf whose fact end reads `2026-09-10`
- **WHEN** it is marked `done` with `on: '2026-09-12'`
- **THEN** its fact end still reads `2026-09-10`

#### Scenario: be-01 supplies the day when the client does not

- **GIVEN** a clock whose act stamps `2026-09-12T23:30:00Z`
- **WHEN** a leaf with no fact end is marked `done` with no `on`
- **THEN** its fact end reads `2026-09-12`

#### Scenario: leaving done takes the fact end away, and undo puts it back

- **GIVEN** a done leaf whose fact end reads `2026-09-12` and whose fact start reads
  `2026-09-08`
- **WHEN** `setStatus` sets it `unknown`, then the actor undoes once
- **THEN** after the act its `progress` is empty and both facts are `null`; after the undo every
  statement and both days are back, from one journal entry

#### Scenario: a parent's unknown clears only what read done

- **GIVEN** an in-progress parent with a typed fact end `2026-09-12` over two leaves, one done
  with fact end `2026-09-11`, one in progress whose fact end was typed as `2026-09-09`
- **WHEN** `setStatus` sets the parent `unknown`
- **THEN** the done leaf's fact end is `null`, and the parent's `2026-09-12` and the other
  leaf's `2026-09-09` stand

#### Scenario: a done parent's unknown clears the parent and every leaf, and one undo restores them

- **GIVEN** a parent marked `done` on `2026-09-12`, so it and both leaves hold that fact end
- **WHEN** `setStatus` sets the parent `unknown`, then the actor undoes once
- **THEN** all three fact ends are `null` after the act and `2026-09-12` again after the undo,
  and the act added one journal entry

#### Scenario: unknown on a row that was not done leaves the facts

- **GIVEN** an in-progress leaf with a typed fact end
- **WHEN** `setStatus` sets it `unknown`
- **THEN** its `progress` is empty and its fact end is what it was

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

### Requirement: The table shows Status, Fact start and Fact end, and strikes a done row

The table SHALL offer three columns — `Status`, `Fact start`, `Fact end` — hidden by default
and offered in the Columns control in table order: `Status` after `Links`, the two facts after
`Deadline`. The Status cell SHALL show
the row's status as a glyph with the word in its fact card and offer the statuses of "The row
menu and Status cell offer every status the row does not read", on a parent as on a leaf;
`Blocked by proxy` SHALL be shown but never offered. The
two fact cells SHALL be date cells with the deadline cell's rest and edit states. A row whose
status is `done` SHALL carry `data-row-done` and its name and number SHALL read struck
through, on every stripe and under every row light.

#### Scenario: the Columns control offers the three in order

- **GIVEN** the Columns control open on a two-step plan
- **WHEN** its entries are read
- **THEN** `Status` follows `Links`, `Fact start` and `Fact end` follow `Deadline` in that order,
  and none of the three is on screen until chosen

#### Scenario: choosing Done marks the row and fills the fact end

- **GIVEN** a leaf reading `Unknown` with the three columns shown
- **WHEN** `Done` is chosen in its Status cell and the completion prompt confirmed unchanged
- **THEN** the row reads `Done`, its name is struck through, and its Fact end cell reads today

#### Scenario: a partly done row reads In progress and can still be finished

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` says nothing
- **WHEN** its Status cell is read and then opened
- **THEN** it shows `◐` with a fact beginning `Status: In progress.`, and the list offers
  `On hold`, `Blocked`, `Done` and `Unknown`, in that order

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

### Requirement: Every row says its status at its left edge

Every row of the table SHALL carry `data-row-status` holding its status, and SHALL draw a
status strip at its left edge, before the drag handle, whether or not the Status column is
shown: no strip for `unknown`, and for every other status the strip in that status's colour.
The strip SHALL be painted with `box-shadow` on the drag cell and SHALL move no
pixel of the layout. A row whose status is `done` SHALL additionally be tinted with the done
colour across every cell, pinned cells included, under the band, the hover, the dependency
light and the drop light rather than in place of them. Each status's colour SHALL be a
palette token defined for both themes. The drag cell SHALL also say the status in words to
assistive tech (`Status: <word>`), as the drag handle's description, so a reader who cannot
see the strip hears it with the Status column hidden.

#### Scenario: a done row wears the strip and the tint with its column hidden

- **GIVEN** a plan with the Status column hidden and one leaf whose every step says `done`
- **WHEN** the table is rendered
- **THEN** that row carries `data-row-status="done"`, its drag cell paints the strip, every
  cell of it paints the done tint, and the row above it carries `data-row-status="unknown"`
  with no strip and no tint

#### Scenario: an in-progress row wears the strip and no tint

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` says nothing
- **WHEN** the table is rendered
- **THEN** the row carries `data-row-status="in_progress"`, its drag cell paints the
  in-progress strip, and no cell of it paints the done tint

#### Scenario: the tint lets the lights through

- **GIVEN** a done row that some hovered Depends on cell waits for
- **WHEN** the row is painted
- **THEN** its cells carry the dependency light's `--cell-bg` and the done tint together, and
  the pinned cells paint the same pair as the unpinned ones

#### Scenario: a held row's strip is said in words

- **GIVEN** a leaf `010` on hold, with the Status column hidden
- **WHEN** its drag handle is read by assistive tech
- **THEN** the row carries `data-row-status="on_hold"`, its strip is the on-hold colour, and
  the handle `Reorder 010` is described as `Status: On hold`

### Requirement: Choosing Done opens the completion prompt before anything is written

Choosing `Done` in the Status cell of a row whose status is not `done` SHALL open the
completion prompt and SHALL send nothing until it is confirmed. The prompt SHALL name the
row, SHALL hold one date field prefilled with the row's fact end when it holds one and with
the reader's local calendar day otherwise, SHALL offer `Cancel` and `Mark done`, and SHALL
put focus in the date field; on close, confirmed or dismissed, focus SHALL return to the
Status cell that asked. Confirming SHALL send `setStatus` with the field's day as `on`;
when the row already held a fact end and the field's day differs, a `patch` of `factEnd` to
the field's day SHALL follow. Cancel, Escape and a click outside SHALL close the prompt with
nothing sent and the status unchanged. A field holding no day or a day that is not an
`IsoDate` SHALL disable `Mark done`. Choosing `Unknown` SHALL open no prompt.

#### Scenario: today is offered and sent

- **GIVEN** a leaf reading `Unknown` with no fact end, on a browser whose local day is
  `2026-09-13`
- **WHEN** `Done` is chosen and the prompt confirmed unchanged
- **THEN** exactly one command was sent, `setStatus` with `on: '2026-09-13'`, and the row reads
  `Done`

#### Scenario: another day is typed

- **GIVEN** the same leaf
- **WHEN** `Done` is chosen, the field changed to `2026-09-10`, and the prompt confirmed
- **THEN** `setStatus` carries `on: '2026-09-10'` and the Fact end cell reads that day

#### Scenario: a held fact end is offered, and a change to it follows as a patch

- **GIVEN** a leaf reading `In progress` whose fact end is `2026-09-10`
- **WHEN** `Done` is chosen, the field changed to `2026-09-11`, and the prompt confirmed
- **THEN** `setStatus` with `on: '2026-09-11'` is sent, then `patchWorkItem` with `factEnd:
'2026-09-11'`, in that order

#### Scenario: cancelling writes nothing

- **GIVEN** a leaf reading `Unknown`
- **WHEN** `Done` is chosen and the prompt dismissed by Cancel, by Escape, or by a click outside
- **THEN** no command is sent, the row still reads `Unknown`, and focus is back in the Status
  cell

#### Scenario: a parent's prompt speaks for its leaves

- **GIVEN** a parent reading `In progress`
- **WHEN** `Done` is chosen and the prompt confirmed with `2026-09-12`
- **THEN** one `setStatus` for the parent carries `on: '2026-09-12'`, and every leaf beneath
  it with no fact end reads that day

### Requirement: The Status column is one glyph, pinned after the number

The Status column SHALL sit after `#` and before Links, SHALL be a member of the pinned
block between them, and SHALL be 28px wide. Its heading SHALL be the `○` glyph with the
accessible name `Status`. Its cell SHALL show a glyph of its own for each status — `○`
unknown, `◌` draft, `◎` ready, `◐` in progress, `⊖` blocked by proxy, `‖` on hold, `⊘`
blocked, `✓` done — coloured as the strip is, its accessible name naming the row (`Status of
010`), its accessible description saying the status in words (`Status: <word>`), and its fact
card saying the status in words, with no browser `title`; the picker SHALL offer the statuses
in words. The status itself SHALL be readable off `data-status-value`. The column SHALL stay
hidden by default and SHALL be offered in the Columns control as `Status`, where it renders —
after `Links` (`status-polish` moved it there from after `Deadline`).

#### Scenario: the pinned block holds Status in its place

- **GIVEN** the Status column shown
- **WHEN** the frame is laid out
- **THEN** the pinned columns are `drag`, `number`, `status`, `refs`, `name` in that order, and
  the `refs` and `name` offsets are 28px further right than with Status hidden

#### Scenario: the cell reads as a glyph and says the word

- **GIVEN** a done leaf `010` with the Status column shown
- **WHEN** its Status cell is read
- **THEN** the cell shows `✓`, its fact begins `Status: Done.`, its accessible description is
  `Status: Done`, it has no `title`, `data-status-value` is `done`, and opening it lists
  `In progress` and `Unknown`

#### Scenario: blocked by proxy never reads as blocked

- **GIVEN** one leaf reading `blocked` and one reading `blocked_by_proxy`
- **WHEN** their Status cells are read
- **THEN** the first shows `⊘` and the second `⊖`, each in its own colour

### Requirement: The Status cell's fact names the status, and its card leaves when the list opens

The Status cell's fact SHALL begin with `Status: <word>.` — `Status: Unknown.`, `Status: In
progress.`, `Status: Done.` — before the sentence about the row. When a hinted mark that is a
combobox expands its list, by click or by keyboard, the hint layer SHALL close that mark's open
card; a click that leaves the mark collapsed SHALL leave the card where it was.

#### Scenario: the card says the word the glyph does not

- **GIVEN** a leaf reading unknown with the Status column shown
- **WHEN** its Status cell's fact is read
- **THEN** it begins `Status: Unknown. `, and `Status: Done. ` once the row is done

#### Scenario: opening the list takes the card down

- **GIVEN** the pointer resting on a Status cell with its fact card open
- **WHEN** the cell is clicked and its list opens
- **THEN** the card is gone while the list is on screen, and a click on a control that opens
  nothing had left the card up

### Requirement: A leaf's status folds its progress, hold, readiness and predecessors

Every leaf SHALL report one `status` of `unknown`, `draft`, `ready`, `in_progress`,
`blocked_by_proxy`, `on_hold`, `blocked` or `done`, folded on every read, first match winning:
its progress fold `done` → `done`; its hold → `on_hold` or `blocked`; its progress fold
`in_progress` → `in_progress`; a predecessor reading `on_hold`, `blocked` or
`blocked_by_proxy` → `blocked_by_proxy`; its readiness → `draft` or `ready`; else `unknown`.
Progress SHALL stay per step node; readiness and hold SHALL be stored once per leaf and never
on a parent; `status` and `blocked_by_proxy` SHALL never be stored. A step node's own status
SHALL remain its progress.

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
parent's bracket SHALL span its unheld leaves and be `null` when it has none. The scheduler
contract version and the solver wire version SHALL NOT change; the canonical schedule input
SHALL change only for plans holding something.

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
`done` SHALL write today's done statements and clear the hold. `in_progress` on a leaf not
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
When nothing would
change, nothing SHALL be written, journalled or announced.

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
