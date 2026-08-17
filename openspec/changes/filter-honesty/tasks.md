## 1. Counting what was dropped

- [x] 1.1 `DroppedLinks`, `droppedLinkCount` and `droppedLinkWords` in
      `gantt-geometry.ts`; the three `continue`s count the link they drop.
      Tests: each kind counted, every kind drawn counts nothing, the words per
      kind and in the singular. **Watched red 1** — the one-end guard struck for
      an unconditional count, `counts nothing for a link with neither end on
      screen` fails.
- [x] 1.2 `GanttPlan.dependencies` widens to every stored edge (`wbs-table.tsx`,
      `flat` not `shownRows`). Test: `counts the edge that leaves a shown row
      for a hidden successor`, and in the table `counts the wait that leaves a
      shown row for a hidden one`. **Watched red 3.**

## 2. Saying it

- [x] 2.1 `GanttPlan.narrowedByFilter`, set from `isFiltering`'s one answer, and
      the panel's `<p data-gantt-dropped-links>` **outside** the scrolling
      `<section>`. Tests: the sentence under a filter, its absence with the
      filter off, its absence when nothing was dropped, and that it is not
      inside `[data-gantt-panel]`. **Watched red 2.**

## 3. The document of what is on screen

- [x] 3.1 `filterWords` in `tree-search.ts` — one phrase per criterion, `or`
      within a facet, so the document's account of the narrowing is the filter's
      own. Tests: nothing asked, every criterion asked, a facet left alone.
- [x] 3.2 `PlanExport.scope` and the `Scope` header field in both formats, with
      `danglingDependencies` counting the document's own holes. Tests: the
      sentence, the CSV copy, the collapsed-branch wording, no holes said where
      there are none, and **no `Scope` at all on a whole-plan export**.
- [x] 3.3 `planFileName` files a scoped document under `-on-screen`, and
      `planToMermaidDocument` drops its whole-plan `Scope` line where a scope is
      present. **Watched red 4** — the guard struck, the document carries two
      `Scope` lines and the second claims every row.
- [x] 3.4 `planOnScreen` and the fifth toolbar button in `wbs-table.tsx`. Tests:
      the download's name and header, the rows it holds and the row it does not,
      and that `Download CSV` under the same filter is still the whole plan.

## 4. The record

- [x] 4.1 `proposal.md`, this file, the delta spec, `verify.md`. No `design.md`
      and no citation table — PoC mode, `notes/delivery-modes.md`.
