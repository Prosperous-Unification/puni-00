# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)     300 pass  0 fail  (was 279; 21 new)
      be-01 (bun:test)   287 pass  0 fail  (unchanged — nothing server-side moved)
      libs/domain         22 pass  0 fail  (unchanged)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
26 items, 26 passed, 0 failed — unestimated-navigator valid
```

The 21 new tests: 13 in `plan-completeness.test.ts` for `findEstimateGaps` and
`describeGaps`, and 8 in `wbs-table.test.tsx` under `what the plan is still
missing`. The 279 baseline is 300 minus those 21; nothing existing changed.

## The shape chosen, and why

**Completeness, not a filter.** Codex's framing decided everything: the badge
answers "is this plan ready?", so it counts and it walks — it never hides a row,
never sorts, never marks one. Nothing in the tree moves when it is used, which
is what makes it safe to press in front of an audience the day before a review.

**Rows are counted; roles are named.** `2 unestimated` is the number of leaves
somebody has to visit. The per-role breakdown lives in the title
(`1 missing Dev, 2 missing QA`) because those numbers add up to more than there
are rows — a leaf missing both roles is one visit, not two — and a headline
number larger than the number of rows to fix is a number nobody can act on.
Both are kept, separately, in `EstimateGaps`.

**Nothing at all when the plan is complete.** The alternative was `✓ estimated`.
A tick that is always there is a tick that stops being read, and this badge's
whole value is being noticed on the day it appears. The absence is the signal.
Stated because it is a real choice and a reviewer may want the other one.

**Per required role, not per row.** A leaf costed for Dev and not for QA plans a
release with no testing in it, and the schedule under it reads as though that
work were free. `Object.hasOwn`, not a truthiness test: a stored `0 / 0 / 0` is
somebody saying this costs nothing, which is an answer and not a gap.

**The walk aims at the first missing role.** A row with Dev filled in and QA
empty is stood in front of its QA cell. Aiming at Dev would be the tool asking
for work that is already done.

**Which cell that is depends on the fold.** Folded, it is the combined
`o/r/p` cell `combined-trio-entry` landed — a leaf's folded cell is editable and
takes `2/3/8`, which is where an estimating session lives. Unfolded, that same
column is the read-only figure again, so the walk aims at the optimistic box
instead. Aiming at a column that is not an editable cell would have been a
button that silently did nothing.

**State is one row id, not an index.** The list of gaps is rebuilt by every edit
— including the edit the walk exists to prompt — so an index would point at
whichever row slid into the estimated one's place. Remembering the row means a
row that has left the list restarts the walk at the top, which is the only
position still true about the list as it now stands.

**A `useEffect`, not a `focus()` in the handler.** The click can open a
collapsed branch, and the row it names is not in this component's DOM until that
render commits. Both state updates happen in one handler, so they batch into one
render and the effect runs after it, reading the committed DOM through the same
`editableGrid` the arrow keys use.

## Failure proofs

Every row was watched. Faults were injected one at a time into the production
path and the whole fe-01 suite was run; the counts are from those runs.

| Check (file)                                               | Fault injected                                                         | Test that observed the failure                                                                                                                                                                                                          | Result                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Parents are never counted (`plan-completeness.ts`)         | `if (parentIds.has(workItem.id)) return []` replaced with `if (false)` | 3 failed: `never counts a parent, whose figures are rolled up from below`, `counts a parent whose children are all estimated as nothing at all`, and the table's `opens a collapsed branch…` (`2 unestimated` where one row is fixable) | 297 pass / 3 fail → restored, 300 pass |
| Missing is judged per role (`plan-completeness.ts`)        | reduced to "the work item has any estimate at all"                     | 5 failed, including `judges each role separately, so Dev alone is still incomplete` and the table's `lands the focus in the cell of the first role that leaf is missing`                                                                | 295 pass / 5 fail → restored, 300 pass |
| The badge counts leaves, not role gaps (`wbs-table.tsx`)   | `gaps.leaves.length` replaced with the sum of `perRole` counts         | 2 failed: `counts the leaves that are short, not the roles they are short of` (3 for 2) and `opens a collapsed branch…` (2 for 1)                                                                                                       | 140 pass / 2 fail → restored, 142 pass |
| The badge is absent when there is no gap (`wbs-table.tsx`) | the `length > 0` guard weakened to `length >= 0`                       | 2 failed: `says nothing at all about a plan that is complete`, `says nothing about a project with no work items in it`                                                                                                                  | 140 pass / 2 fail → restored, 142 pass |
| Collapsed ancestors are opened first (`wbs-table.tsx`)     | the `setExpanded(… expandBranch …)` line deleted                       | 1 failed: `opens a collapsed branch rather than focusing a cell nobody can see` — the child row stayed hidden and nothing took the focus                                                                                                | 141 pass / 1 fail → restored, 142 pass |
| The walk wraps (`wbs-table.tsx`)                           | the modulo replaced with a clamp to the last entry                     | 1 failed: `moves on to the next leaf on the next click, and wraps at the end` — the third click sat where it was                                                                                                                        | 141 pass / 1 fail → restored, 142 pass |
| A vanished row restarts the walk (`wbs-table.tsx`)         | the `-1` from `findIndex` folded up to `0`                             | 1 failed: `starts again from the top when the leaf it was on has been estimated` — it carried on one row further down than anybody asked for                                                                                            | 141 pass / 1 fail → restored, 142 pass |
| The fold decides which cell (`wbs-table.tsx`)              | the column hard-coded to `` `${roleId}-final` ``                       | 1 failed: `lands in the first box while the role is unfolded, where the trio is typed` — the focus stayed on the body, because that column is not an editable cell while unfolded                                                       | 141 pass / 1 fail → restored, 142 pass |
| The focus is actually landed (`wbs-table.tsx`)             | `arrived.input.focus()` deleted from the effect                        | 5 failed — every walk test, each on the focus the last created row had left behind                                                                                                                                                      | 137 pass / 5 fail → restored, 142 pass |

Two guards were written and then removed rather than proved: `next === undefined`
and `roleId === undefined` after the two index reads. `noUncheckedIndexedAccess`
is not on in `tsconfig.base.json`, and `@typescript-eslint/no-unnecessary-condition`
called both dead — which is precisely the R5 failure this repo keeps having. They
are gone, with a comment saying why the two reads are in range.

## What is not watched here

- **The browser.** Nobody has clicked this badge on a real plan. Whether
  `3 unestimated` reads as a warning or as toolbar decoration, and whether the
  browser's own scroll-on-focus lands the walked-to row somewhere readable
  inside the scrolling frame, are both invisible to jsdom — it lays nothing out,
  so no test here observes any scrolling at all. `tasks.md` 4.3 is open.
- **Enter and Space on the badge.** It is a native `<button>`, so activation is
  the browser's, and no key is bound for it. jsdom's `fireEvent` does not perform
  that activation and there is no `user-event` in this repo, so the test asserts
  the element is a `BUTTON` and stops there. Honest limit, not a covered case.
- **Two peers.** The badge writes nothing, so no announce path was exercised.
  The count follows the tree, which every peer edit refetches; that a peer's
  estimate makes the badge count down was not tested.
- **A frozen row.** Freezing blocks moving, not estimating, so the walk was not
  exercised against one.
- **Dev deploy.** Not deployed. Work stops at the gate, per the prod-phase rule.

## Decisions worth arguing with

1. **Nothing is shown when the plan is complete.** The simplest honest choice,
   and the reason is that a permanent badge is furniture. Someone may reasonably
   want `✓ estimated` before a review; that is a one-line change and a new test.
2. **The badge is not disabled while the table is busy**, unlike every button
   beside it. It writes nothing, and greying out during somebody else's refetch
   would read as broken.
3. **Every leaf needs every role.** There is no "QA not required here" and this
   change does not add one — the roles list is the project's statement of what it
   estimates. A project that genuinely does not QA some rows will report gaps it
   does not have, and the fix is a per-row requirement, which is its own change.
4. **The walk restarts rather than resuming after an edit.** Cheaper and honest:
   the list it was indexing into no longer exists. On a large plan this means
   re-walking from the top after each fix, which is a real cost and the reason it
   is stated here.
