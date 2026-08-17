<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

R10 F1, the literal request: _"must filter by different fields in the table,
also must affect the gantt chart to only show what matches"_
(`notes/wbs-scope-2026-08-13-wave6.md:176-178`). All eight of the brief's open
questions were settled by Dany on 2026-08-17
(`notes/wbs-brief-2026-08-17-r10-filtering.md` §9, `notes/decisions.md`).

**The second half of that sentence is already true.** `searchTree`'s result
reaches `shownRows`, and `shownRows` is the one list the table, the Gantt and
the phone cards all render. What was missing was never the seam — it was the
predicate, which was one line: `row.name.toLowerCase().includes(wanted)`.

## What Changes

**`searchTree(rows, query)` becomes `narrowTree(rows, criteria)`.** Seven
fields, every one already on the wire: name substring, **effective** team
(`effectiveTeamsOf`, never `row.teamIds`), assignee on any phase, priority band
by its label, has-an-estimate-for-a-phase, unestimated (the readiness badge's
own `gaps.leaves`), critical. Within a facet the ticks are OR; across facets and
against the name they are AND.

**Rule 3 is now name-only.** A typed name still brings the matched row's
subtree — `Kitchen` is how somebody asks for a branch — but a ticked facet does
not: a parent naming Ada on one phase would otherwise drag in forty rows nobody
assigned to her, and the count beside the box would read `47 of 60` for three
real hits. R10 §4 and §9's Q2.

**A `<details>` panel of tick boxes beside the Find box**, offering the plan's
own values plus whatever is still ticked — so a tick outlives the row it was
aimed at, which the tree refetching on everybody's edit can remove. It is a
`<details>` and not a popover so it works unchanged inside the phone's `Plan
actions` sheet, where a `<summary>` is not the `<button>` that closes it.

**The `data-match` tint reaches the phone cards**, which is the only face some
readers have.

## Non-goals

No persistence of any kind — an ad-hoc filter is not remembered (Q6); saved
views are F4. No change to the export, which keeps taking `flat` (Q3). No
narrow-vs-highlight mode switch (Q1). No dropped-arrow count (F3). No phone
control move (F2). No tags (Q5). **No be-01 change at all**: no migration, no
route, no wire field, and `schedule.ts` has an empty diff.
