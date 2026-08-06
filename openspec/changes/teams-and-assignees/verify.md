# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      be-01 + libs (bun:test)   336 pass  0 fail
      fe-01 (vitest)            210 pass  0 fail

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
19 items, 0 invalid — teams-and-assignees valid
```

## The checks, and the faults that broke them

| Check                                                          | Fault injected                                                | What the run reported                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Adding an existing name gives it back (`directory.ts`)         | `onConflictDoNothing` removed from `addTeam`                  | `adds a team, and adding the same name again gives back the same row` failed on the UNIQUE constraint; restored, 6 pass      |
| Clearing one assignment clears one (`directory.ts`)            | the delete narrowed to `eq(assignment.roleId, roleId)` alone  | `clears one work item's role without touching the other role or anyone else's` failed; restored, 6 pass                      |
| The lone-assignee assumption ends at two (`work-item.service`) | `doesEveryPhase` made to report the first assignee regardless | `assumes one assignee does every phase, and stops assuming at two` failed; restored, 37 pass                                 |
| "Add" only when nothing matches exactly (`creatable-picker`)   | `canCreate` made true whenever anything was typed             | `offers an existing team rather than adding a second one` failed — `Add "Platform"` sat beside `Platform`; restored, 88 pass |
| The empty phase names who is covering it (`wbs-table.tsx`)     | `assumed` hard-coded to null                                  | `says the single assignee is doing the other phase too` failed; restored, 88 pass                                            |

**The second row is the one worth reading.** Its first version had a single
work item in it, so narrowing the delete to the role alone — which clears that
role on _every_ work item in the database — passed it. Both halves of the
condition needed their own survivor before the test could fail at all. That is
the repo's recurring failure mode caught in the act, on a test written the same
hour.

## A type that was lying

`assignees` was `Record<string, string>`, and a role nobody is assigned to is
absent. Indexing it therefore returns `undefined` while the type says `string`,
which is how the comparison against `null` came to read as impossible to the
linter. It is `Record<string, string | undefined>` now — the linter was right,
and the type was the bug.

## What is not watched here

The pickers on screen: whether the dropdown lands where it should, whether
`Add "…"` reads clearly, whether two comboboxes per row is too much table.
jsdom has no layout. Needs Dany's screen.

Removing a team or a person is not implemented, so nothing here says what
happens to assignments pointing at one. That is named as a non-goal rather
than left to be discovered.
