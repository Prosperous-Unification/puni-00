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

## 1. The predicate

- [x] 1.1 `RowFacets`, `FilterCriteria`, `NO_FACETS`, `NO_FILTER` and `isFiltering` in `tree-search.ts`: the seven fields of §9's Q8 as a description the table fills in, because every one of them is already client-side. Tests: within-facet OR (`takes any of the values ticked within one facet`), across-facet AND (`takes only the rows answering every facet ticked`), a person on any phase, a band by its label, an unprioritised row matching no band, a phase's estimate, the readiness badge's leaves, the critical path. **Watched red 3** proves `isFiltering` has to know about facets and not only the query.
- [x] 1.2 `searchTree` → `narrowTree(rows, criteria)`. The ancestor walk, the empty-means-empty answer and the expansion overlay are unchanged and keep their 2026-08-06 `Proof:` comments.

## 2. Rule 3, restricted

- [x] 2.1 The descendant walk runs only while no facet is ticked — R10 §4, §9's Q2, Dany 2026-08-17. Tests: `keeps a facet match's ancestors, and not its subtree`, `stops bringing the subtree the name alone would have brought`, and in the table `does not bring the subtree a typed name would bring` (asked through an **assignee**, which does not inherit). **Watched red 1**: the guard removed, 9 tests fail across the two files.
- [x] 2.2 The pair to it, and the trap §8.5 names: `keeps the rows that inherit a ticked team, which is not rule 3`. A leaf drawing its slots from an ancestor's pool **is** that team's work, so it answers the facet itself. **Watched red 2**: `effectiveTeams.get(row.id)` swapped for `row.teamIds` and this one test — and only this one — fails.

## 3. The control

- [x] 3.1 `FilterFacets`: a `<details>` of tick boxes beside the Find box, one group per facet, each group absent where the plan offers no values. `<details>` and not a popover so it survives the phone's `Plan actions` sheet, where a `<summary>` and a checkbox are not the `<button>` `closingControlIn` watches for. Tests: the panel offers only the plan's teams and people (not the directory's), the count on the summary, `Clear filters` unticking without touching the Find box.
- [x] 3.2 `optionsFor`: the plan's values **plus whatever is still ticked**, by label. **Watched red 5** — the union dropped, `keeps offering a ticked team after the last row carrying it has gone` fails: the tree refetches on everybody's edit, so a tick can outlive its row, and dropping the box then narrows the plan to nothing with nothing on screen to untick.
- [x] 3.3 `narrowable` and the four option lists memoised on the tree, and the facets read through `search.matchIds`/`shownRows` exactly as the query already was. `columns` still reaches `matchIds` through the `live` ref and learns nothing new — §8.3's landmine, the one place this change could be built wrong and still pass in jsdom. Test: `stands the expansion controls down while a facet is on with nothing typed`.

## 4. The mark on a phone

- [x] 4.1 `CardRow.matched` and `data-match` on the card, tinted with the same `--grid-match` custom property the table's Name cell reads. **Watched red 4**: struck, `marks the card that answered the filter, and not the rows kept around it` and `narrows the cards, because they are the rows the table kept` fail.

## 5. The record

- [x] 5.1 `proposal.md`, this file, the delta spec, `verify.md`. **No `design.md`** and no citation table: PoC-mode contract, `notes/delivery-modes.md`.
