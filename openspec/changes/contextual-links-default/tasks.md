<!--
Ordered TDD slices for TASK-238. A slice is behavior plus its proof, not separate
red/green bookkeeping. Builds and autotests run on h2puni or CI, never h1claw.
-->

## 1. Separate first-visit and reset defaults

- [x] 1.1 In `table-frame.ts`, rename the static baseline to
      `INITIAL_HIDDEN_COLUMNS`, add `refs`, and add pure
      `resetHiddenColumns(hasAnyExternalRefs)`. In `table-frame.test.ts`, prove
      first visit hides `refs`, reset true removes only `refs`, and reset false
      keeps it. **Watched red:** remove `refs` from the initial list; the
      first-visit-with-links case must render the column and fail.
- [x] 1.2 Keep width and pinning derived from visible leaf ids. Assert a layout
      without `refs` makes both the folded minimum and Name's sticky left offset
      exactly 40px smaller, while the shown layout keeps `refs` at 40 between
      Number and Name. **Watched red:** put the absent `refs` width back into the
      pinned sum; the no-gap assertion must fail by 40px.

## 2. Persist the one-bit reset baseline

- [x] 2.1 Add guarded `wbs.linksResetShown.<projectId>` memory beside the hidden
      list. Resolve state as explicit hidden list, then reset marker, then
      initial baseline. The marker guard accepts exactly JSON `true`; `false`,
      every other JSON type and malformed JSON are removed.
      `plan-layout.test.tsx` covers all three states, invalid values, reload and
      project switching. **Watched red:** derive an absent layout from live refs;
      first visit to a linked project must fail because Links appears.
- [x] 2.2 Every explicit writer—Columns toggle and a saved view with
      `hiddenColumnIds`—clears the reset marker after writing the hide-list; an
      older view without a column set leaves both untouched. Tests prove the
      precedence and reload it. **Watched red:** leave the marker behind and
      then remove the explicit hide-list; the obsolete marker must incorrectly
      reappear and fail the test.

## 3. Reset against the whole successful tree

- [x] 3.1 Derive `hasAnyExternalRefs` from the entire flat tree with
      `flat.some((row) => row.externalRefs.length > 0)`, never `shownRows`.
      Full-table Reset clears
      explicit hidden storage, sets the contextual target, and writes/removes
      the marker. Tests cover a linked filtered descendant under a collapsed
      branch, hierarchy depth, an empty array, and a deleted formerly-linked
      row. **Watched red:** compute from `shownRows`; the collapsed+filtered case
      must hide Links and fail.
- [x] 3.2 Track whether the selected project has completed a successful tree
      read. Full-table Reset is unavailable before the first success, a
      successful empty tree enables the hidden target, and a failed refresh
      after success retains the last successful target. **Watched red:** treat
      initial `[]` as loaded; a prior width override must expose Reset before
      the held first read succeeds and fail.
- [x] 3.3 Compare `columnsDiffer` with the current contextual reset target.
      Prove a first visit with refs hides Links but offers Reset; the click shows
      it and removes the button; adding/removing the first/last ref changes only
      whether Reset has work, never column visibility. **Watched red:** feed the
      target into a state effect; the stability assertion must fail on an
      unrequested column mount/unmount.
- [x] 3.4 Use a controlled fake read to hold a ref mutation's refresh. Reset
      before it lands must use the prior tree; releasing the read must not alter
      the result; the next Reset must use the new tree. Repeat in the opposite
      direction for last-ref removal. **Watched red:** await a new `tree()` from
      Reset; the controlled promise must leave the click pending and fail.

## 4. Preserve the mobile and existing layout contracts

- [x] 4.1 `plan-cards.test.tsx` and the existing 390×844 external-refs browser
      case prove cards gain no Links field and their Gantt-only reset leaves both
      column keys untouched. The Columns control remains an explicit local
      preference for a later table viewport.
- [x] 4.2 Migrate assertions that deliberately exercise visible Links. In
      `external-refs.spec.ts`, the desktop setup waits for the tree and uses the
      real full-table Reset so its cell, heading, count, hover and editor cases
      remain feature-level proofs. In `layout.spec.ts`, explicitly seed a
      refs-shown hidden-column list for refs pinned-offset, Name-left=169 and
      `Links for 020` tab-stop cases; keep new contextual-default cases on empty
      storage. Update unit imports of `DEFAULT_HIDDEN_COLUMNS`. The folded-width
      browser proof asserts both the 40px-narrower fresh-hidden state and the
      existing 1247/1248 refs-shown edge. **Watched red:** omit one setup path;
      its first visible-Links assertion or shown-width edge must fail.
- [x] 4.3 On h2puni, run focused `table-frame` + `plan-layout` + `plan-cards`
      suites, fe-01 lint/typecheck, `bunx nx format:check --all`, and
      `openspec validate --all --json`; record exact counts and bun version.
      Then run CI `gate` and `pixels`, including both 1280px folded-width states
      and the 390×844 no-card-field assertion.

## 5. Delivery

- [x] 5.1 Record watched-red evidence in `verify.md`, open the dev-mode PR,
      collect green exact-head CI, and attempt the required exact-head peer and
      Gemini terminal seats. TASK-237's reviewed design and Dany's
      one-correction approval are required before this implementation task
      starts.
- [ ] 5.2 Merge on green CI, verify the commit-bearing dev `/health`, and
      unblock the dependency-gated TASK-239 lane-q Browser Use Cloud QA.
