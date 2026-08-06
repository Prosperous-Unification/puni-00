# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   218 pass  0 fail (4 new)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
21 items, 0 invalid — role-columns-fold valid
```

## The checks, and the faults that broke them

| Check                                                   | Fault injected                                      | What the run reported                                                                                               |
| ------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A draft survives the fold (`wbs-table.tsx`)             | the `setDrafts` write removed from `commitEstimate` | 10 tests failed, including `keeps a typed estimate draft across a fold and back`; restored, 96 pass                 |
| A folded role cannot hide a complaint (`wbs-table.tsx`) | the marker's `trioProblemFor` hard-coded to null    | `a folded role cannot hide a complaint` failed — the figure showed clean over an unsaveable trio; restored, 96 pass |

## What the migration of the tests proved

Every existing estimate, assignee and keyboard test now unfolds the role
first, as a person would — folded is the default and 23 tests failed until
they did. The three Tab-walk tests additionally have to unfold **before**
typing a name: the fold rebuilds the column set, the rebuild remounts every
cell, and an uncommitted name is reset to the server's value by the remount.
That cost is real, deliberate, and written down in the proposal rather than
discovered later.

## What is not watched here

Whether the fold actually rescues the width — jsdom has no layout. With both
roles folded the role area is 2 columns instead of 10, and Not before, Starts,
Ends, Slack, Notes and Delete should fit back on Dany's screen. His screen is
the test.
