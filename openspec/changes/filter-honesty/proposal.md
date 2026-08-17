## Why

R10 **F3** and **F5** (`notes/wbs-brief-2026-08-17-r10-filtering.md` §7), built
to the eight answers Dany settled on 2026-08-17 (§9, `notes/decisions.md`). F1
shipped the seven-facet filter as #77; the brief's own ship note says F1 alone
hands somebody "a chart that silently deletes arrows", and that F1 without F3 is
the one combination it would refuse to ship.

Two silences, one theme. The chart draws its links from `shownRows`, so a filter
takes the other end of a wait away and three `continue`s drop the line with
nothing anywhere saying so — under a name search a momentary act, under a filter
somebody sits in for an hour a schedule diagram that looks complete and is not.
And a reader who wants to send somebody the rows they are looking at has no way
to, because the four exports deliberately take `flat` (Q3).

## What Changes

**F3 — the chart counts what it could not draw and says it.** `layOutGantt`
returns `droppedLinks` — dependencies, person hand-offs, waits for a team —
counted at the three places that already drop them, and only where one end *is*
drawn: a wait between two hidden rows costs the reader no mark. The panel prints
one sentence under the chart, outside its scroll box, while `narrowedByFilter`.
The plan's `dependencies` widen from the shown rows' own edges to every edge
the plan holds: the arrows drawn are identical, and the edge that leaves a shown
row for a hidden **successor** becomes countable for the first time.

**Dependencies still do not pull rows back** (Q7). Nothing new is drawn.

**F5 — a fifth export action, `Download what’s on screen`.** The Markdown table
of `shownRows`, with `PlanExport.scope`: a `Scope` header line naming the rows
kept out of the plan's total, what kept them (`filterWords`, the filter's own
account of itself), that the figures were **not** recomputed, and how many
`Depends on` references point outside the document. Filed as `-on-screen.md`.
The four existing buttons keep taking `flat` and are byte-for-byte unchanged;
the bundled Mermaid document drops its whole-plan `Scope` line when a scope is
present, so no document carries two accounts of itself.

## Non-goals

No pulling filtered-out rows back onto the chart. No sentence for a collapse
alone. No saved views (F4) and no filter control move (F2). No CSV or clipboard
variant of the on-screen export. No change to what the four whole-plan exports
write. **No be-01 change**: no migration, no route, no wire field, empty
`schedule.ts` diff.
