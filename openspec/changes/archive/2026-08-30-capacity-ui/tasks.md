<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. fe-01 learns the word `capacity` — the deploy gate

- [x] 1.1 `ScheduleFloorView` gains `capacity`; `SliceView` gains `width`,
      `effort` and `capacityPredecessorIds`; `WorkItemView` gains `maxParallel`;
      `TeamView` gains `size`. Descriptions of what be-01 has sent since C1, not
      rules.
- [x] 1.2 `floorWordsOf`'s `case 'capacity':` — the pool's name, the slots the
      bar needed, the finish that freed them, and the rest of the blocking set
      counted rather than listed. **Negative (mandatory):** the arm struck so
      the `default:` catches `capacity` again, watched failing both tests of
      `the deploy gate: a plan a sized team is holding back` against four
      uncaught `GanttDataError: … is held by capacity, which this chart has no
words for` — the whole chart replaced by the fault boundary.
- [x] 1.3 Three refusals on a malformed capacity payload: no display referent,
      an empty blocking set, and a row naming no team. **Negative:** each throw
      replaced by a plausible fallback — `'Waits for a team'`,
      `Math.max(0, n - 1)`, `?? 'its team'` — and each watched failing its own
      test alone on `expected function to throw an error, but it didn't`.
- [x] 1.4 The pool wait, drawn from the display referent, and drawn to nothing
      when the freeing row is off the chart.
- [x] 1.5 `gantt-geometry.test.ts`'s invented sixth floor name. It said
      `'resourceCalendar'`, which is a **seventh** name nobody sends; the sixth
      be-01 has been sending since C1 is `capacity`. Now plainly invented
      (`phaseOfTheMoon`), with `capacity` tested above it. C2 cross-review P3-1.

## 2. The In-parallel column

- [x] 2.1 `table-frame.ts` gains `in-parallel` at 32px, and
      `DATE_COLUMN_WIDTH` comes down to 98 to pay for it — the re-measurement
      `spreadsheet-geometry` left open. **Negative:** the column set to 24,
      watched failing `the In-parallel column holds three digits at the grid's
own type` on `in-parallel declares 24px where "999" needs 30`; and the date
      column set to 94, watched failing `is as wide as the widest day the
formatter can print` on `start declares 94px where the widest day it can print,
"20 May 2027 ?", needs 95`. Both in Chromium on h2puni.
- [x] 2.2 The cell's three states — editable, printed-and-inert on a parent,
      muted where a named assignee makes it inert — each with a `title` saying
      which and why.
- [x] 2.3 `setParallelism`: an empty box is `maxParallel: null`, a reset to one
      at a time; everything else is sent and answered on. **Negative:** the
      `Number.isFinite` guard deleted, watched failing `refuses a draft JSON
cannot carry, rather than silently resetting the row` on `Unable to find an
element with the text: /People at once is a whole number from 1 to 1000./` —
      the typed `1e999` sent as `null`, which is the reset.
- [x] 2.4 The cell joins the keyboard grid: Tab order, the chords, and Enter
      saving without waiting for the blur.

## 3. The Service/team cell reads the effective team

- [x] 3.1 `effectiveTeamOf` over `flat` — the whole tree, not the rows on
      screen — feeding the cell, the bars, the cards and the export.
- [x] 3.2 An inherited label renders as `↳ Name` in the picker's placeholder
      ink, with the source row in the `title`. `CreatablePicker` gains a
      `title` prop for it.

## 4. The export

- [x] 4.1 `ExportRow` gains `parentId` and `maxParallel`; `PlanExport` gains
      `slices`. The Team column becomes the effective team and names where an
      inherited label was written. **Negative:** `teamsInForce` narrowed to
      `plan.rows.filter((r) => r.serviceTeamId !== null)`, watched failing two
      tests on `expected '' to be 'Billing, Ltd (inherited from 010 Root)'` —
      every inheriting row in the document reported teamless while its dates
      came out of the pool.
- [x] 4.2 `People at once` and `Ran at`, the second a **set** of the widths the
      row's slices ran at, empty on a plan with no placement and on an ordinary
      one-at-a-time row.
- [x] 4.3 A `People:` line in the header block saying the figures are effort.
- [x] 4.4 Nine assertions in `plan-export.test.ts` that had typed a column index
      converted to `columnAt(csv, header)` lookups. Not tidying: two columns
      inserted after Team moved every one of them onto its neighbour, which is
      the second time an inserted column has done that to this file.

## 5. The cards

- [x] 5.1 `teamName` becomes `teamLabel`, a `ServiceTeamLabel`, so a phone
      shows the inherited team it is drawn from. **Negative:** pointed back at
      the stored label (`teamLabelOf(row.serviceTeamId)`), watched failing
      `marks a team a row only inherits` on `expected undefined to be
'↳ Billing'` — the inheriting card drew no team line at all.
- [x] 5.2 A parallelism line, `3 at once` / `3 at once (not applied)`, read off
      the row rather than routed through a prop, so the two faces cannot drift.

## 6. The directory

- [x] 6.1 A size box per team, empty for _unstated_, with a `title` saying which
      state it is in. `DirectoryApi.resizeTeam` and its route.
- [x] 6.2 An emptied box is `size: null` — the clear — and not `Number('')`.
      **Negative:** the empty-box arm replaced by the plain `Number(typed)`,
      watched failing `clears to unstated when the box is emptied` on `expected
[ [ 't1', 4 ], [ 't1', +0 ] ] to deeply equal [ [ 't1', 4 ], [ 't1', null ] ]` —
      the page asking for a team of nobody.
- [x] 6.3 The size draft is its own record, so a name's Escape does not take it.
      **Negative:** the name's Escape pointed at the both-drafts `forgetDraft`,
      watched failing `keeps a half-typed size when the name beside it is
escaped` on `expected '' to be '7'`.
- [x] 6.4 `directoryRefusalSentence` gains be-01's two size codes, the ceiling
      read out of the code rather than copied as a literal.
- [x] 6.5 `DirectoryEffect` gains `capacity_released`, and the confirmation
      prints it — one sentence where the row carries the label, another naming
      the ancestor where it only inherits it.

## 7. The artifacts

- [x] 7.1 The delta spec, `proposal.md` and `design.md`, including why the 32px
      came out of the date columns and why validation stays at be-01's boundary.
- [x] 7.2 `verify.md`: the gate's actual output and the failure-proof table —
      one row per injected fault, all watched, with the deploy-gate red first.
- [x] 7.3 `LLM_README.md`: the deploy gate disarmed on merge, not before.
