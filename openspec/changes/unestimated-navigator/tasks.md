## 1. What the plan is short of, as a pure function

- [x] 1.1 Failing tests in `plan-completeness.test.ts`: a leaf with nothing
      estimated; a leaf costed for Dev and not QA; a parent never counted and
      its estimated child counted as nothing; an empty project; a fully
      estimated plan; the leaves kept in the order given; the missing roles in
      the role list's order; the per-role counts with a role nobody is missing
      left out; a project with no roles; a stored zero trio read as an answer.
- [x] 1.2 `findEstimateGaps` and `describeGaps` in `plan-completeness.ts`,
      returning leaves and per-role counts as two separate things.
      **Negative tests:** drop the leaf test and watch the parent test fail;
      reduce "missing" to "has any estimate at all" and watch the per-role test
      fail — five tests fell over, including the table's.

## 2. The readiness badge

- [x] 2.1 Failing tests in `wbs-table.test.tsx` under the block
      `what the plan is still missing`: the count and its title; nothing shown
      for a complete plan; nothing shown for an empty project.
- [x] 2.2 The badge in the toolbar, rendered only when there is a gap, titled
      by `describeGaps`. **Negative tests:** count the per-role gaps instead of
      the leaves and watch the count test fail; render it unconditionally and
      watch both "says nothing" tests fail.

## 3. The walk

- [x] 3.1 Failing tests: the focus lands in the first missing role's cell; a
      second click moves on and a third wraps; the walk restarts when the row
      it was on has been estimated; a collapsed ancestor is opened first; the
      optimistic box while the role is unfolded.
- [x] 3.2 `walkToNextGap` and the effect that lands the focus from the
      committed DOM, plus the ancestor expansion through the existing
      `expandBranch`. **Negative tests:** drop the expansion and watch the
      collapsed test fail; clamp instead of wrapping and watch the wrap test
      fail; fold the "not in the list" case up to the first entry and watch the
      restart test fail; hard-code the folded column and watch the unfolded
      test fail; remove the `focus()` and watch five tests fail.

## 4. Gate and verification

- [x] 4.1 `CONTEXT.md` gains **Estimate gap**.
- [x] 4.2 Format, the uncached run-many gate, `openspec validate --all --json`
      — recorded in `verify.md` with the fault table.
- [ ] 4.3 Deploy to dev and use the badge on a real plan in a browser. Whether
      `3 unestimated` reads as a warning or as decoration, whether the
      browser's own scroll-on-focus puts the walked-to row somewhere useful
      (jsdom lays nothing out, so no test here sees scrolling at all), and
      whether Enter on the badge behaves as this change claims are all
      browser-only.
