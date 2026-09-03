<!--
Ordered TDD slices for TASK-238. A slice is behavior plus its proof, not separate
red/green bookkeeping. Builds and autotests run on h2puni or CI, never h1claw.
-->

## 1. Separate first-visit and reset defaults

- [ ] 1.1 In `table-frame.ts`, rename the static baseline to
      `INITIAL_HIDDEN_COLUMNS`, add `refs`, and add pure
      `resetHiddenColumns(hasAnyExternalRefs)`. In `table-frame.test.ts`, prove
      first visit hides `refs`, reset true removes only `refs`, and reset false
      keeps it. **Watched red:** remove `refs` from the initial list; the
      first-visit-with-links case must render the column and fail.
- [ ] 1.2 Keep width and pinning derived from visible leaf ids. Assert a layout
      without `refs` makes both the folded minimum and Name's sticky left offset
      exactly 40px smaller, while the shown layout keeps `refs` at 40 between
      Number and Name. **Watched red:** put the absent `refs` width back into the
      pinned sum; the no-gap assertion must fail by 40px.

## 2. Persist the one-bit reset baseline

- [ ] 2.1 Add guarded `wbs.linksResetShown.<projectId>` memory beside the hidden
      list. Resolve state as explicit hidden list, then reset marker, then
      initial baseline; invalid values are removed. `plan-layout.test.tsx`
      covers all three states, reload and project switching. **Watched red:**
      derive an absent layout from live refs; first visit to a linked project
      must fail because Links appears.
- [ ] 2.2 Every explicit writer—Columns toggle and a saved view with
      `hiddenColumnIds`—clears the reset marker after writing the hide-list; an
      older view without a column set leaves both untouched. Tests prove the
      precedence and reload it. **Watched red:** leave the marker behind and
      then remove the explicit hide-list; the obsolete marker must incorrectly
      reappear and fail the test.

## 3. Reset against the whole successful tree

- [ ] 3.1 Derive `hasAnyExternalRefs` from `flat.some(row =>
      row.externalRefs.length > 0)`, never `shownRows`. Full-table Reset clears
      explicit hidden storage, sets the contextual target, and writes/removes
      the marker. Tests cover a linked filtered descendant under a collapsed
      branch, hierarchy depth, an empty array, and a deleted formerly-linked
      row. **Watched red:** compute from `shownRows`; the collapsed+filtered case
      must hide Links and fail.
- [ ] 3.2 Compare `columnsDiffer` with the current contextual reset target.
      Prove a first visit with refs hides Links but offers Reset; the click shows
      it and removes the button; adding/removing the first/last ref changes only
      whether Reset has work, never column visibility. **Watched red:** feed the
      target into a state effect; the stability assertion must fail on an
      unrequested column mount/unmount.
- [ ] 3.3 Use a controlled fake read to hold a ref mutation's refresh. Reset
      before it lands must use the prior tree; releasing the read must not alter
      the result; the next Reset must use the new tree. Repeat in the opposite
      direction for last-ref removal. **Watched red:** await a new `tree()` from
      Reset; the controlled promise must leave the click pending and fail.

## 4. Preserve the mobile and existing layout contracts

- [ ] 4.1 `plan-cards.test.tsx` and the existing 390×844 external-refs browser
      case prove cards gain no Links field and their Gantt-only reset leaves both
      column keys untouched. The Columns control remains an explicit local
      preference for a later table viewport.
- [ ] 4.2 On h2puni, run focused `table-frame` + `plan-layout` + `plan-cards`
      suites, fe-01 lint/typecheck, `bunx nx format:check --all`, and
      `openspec validate --all --json`; record exact counts and bun version.
      Then run CI `gate` and `pixels`, including the unchanged 1280px folded
      budget and the 390×844 no-card-field assertion.

## 5. Delivery

- [ ] 5.1 Record watched-red evidence in `verify.md`, open the dev-mode PR,
      merge on green CI, verify `/health`, and run lane-q Browser Use Cloud QA.
      TASK-237's reviewed design and Dany's one-correction approval are required
      before this implementation task starts.
