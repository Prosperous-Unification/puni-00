## Why

The tool can describe work and cannot order it. A breakdown says what has to
happen and roughly how long each piece takes; it says nothing about what has to
happen _first_. So the estimates roll up into a total — 47 days of Dev — and a
total is not a plan. Nobody can read when anything starts, what is waiting on
what, or which of the forty rows is the one that will make the project late.

That last question is the whole reason three-point estimates were worth
collecting. They have been summed since the domain landed and never once used
for what they are for.

## What Changes

**Work items can depend on each other**

- From: nothing. The `id` was made immutable for this and the placeholder type
  was deleted rather than shipped against a guess.
- To: a finish-to-start edge between any two work items in one project — "020
  cannot start until 010 finishes". Added and removed through the table.
- Impact: one new table, additive. A cycle is refused, and so is an edge between
  a work item and its own ancestor or descendant.

**The estimates finally compute something**

- From: three numbers per role per row, summed up the tree into a total effort.
- To: a schedule. Each leaf gets a PERT expected duration — `(O + 4R + P) / 6`,
  summed across its roles — and a forward pass gives every work item an earliest
  start and finish, a backward pass gives the latest it could start without
  moving the end, and the difference is its float.
- Impact: computed on read like the numbering and the roll-up, never stored.

**The critical path is shown**

- From: nothing.
- To: the rows with zero float are marked. They are the chain that sets the
  project's length, and shortening anything else changes nothing.
- Impact: a column and a marker in fe-01.

## Non-Goals

- **A calendar.** The schedule is in whole days counted from the project's day
  zero. No dates, no weekends, no holidays, no working hours. Mapping day 12 to a
  Tuesday is a separate decision with its own timezone questions, and every one
  of them can be made later without changing anything here.
- **Resources and assignees.** Nobody is assigned, so nothing is levelled: two
  work items with no dependency between them may both start on day 0 even if one
  person would have to do both.
- **The other three relation types.** Start-to-start, finish-to-finish and
  start-to-finish are real and are roughly a tenth of real use between them. This
  ships finish-to-start; the table has room for a kind when one is wanted.
- **Lag and lead.** `FS+2 days` is not modelled. An explicit buffer work item
  says the same thing and shows up in the plan.
- **A Gantt chart.** The numbers are on the table. Drawing them is its own change.
