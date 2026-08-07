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

## Observed on dev, and the gate that could not fail

The first deploy of this change answered `/api/teams` with
`undefined is not an object (evaluating 'directory.addTeam')`. `boot.ts` never
passed the new service to `buildApp`, and `AppOptions.directory` is a required
field — so this was a **type error that shipped**.

It shipped because `bunx tsc --noEmit -p apps/be-01/tsconfig.json` compiles
nothing. That file is solution-style: `"files": []`, `"include": []`, and two
`references`. Without `--build`, `tsc` honours the empty include and exits 0.
Proven rather than reasoned about: a deliberate
`const x: number = 'not a number'` in `boot.ts` passed `nx typecheck be-01`.

Both apps' `typecheck` targets now run `tsc --build --force` against the
source project (`tsconfig.lib.json` / `tsconfig.app.json`), and the fix was
watched catching the real bug: with the `directory` line removed from
`boot.ts` again, `nx typecheck be-01` reports
`boot.ts(59,24): error TS2345 … not assignable to parameter of type 'AppOptions'`.

Turning it on found **seven real errors in this change's own code** — four in
fe-01 alone, including a `tree()` whose declared response omitted `startDate`
while the runtime one carried it — and three pre-existing ones in source:
`apps/be-01/src/index.ts` re-exported a `./lib/be-01` that has never existed
(deleted), `ValidationError.cause` needed `override`, and `brandedString`
passed a runtime string to an ArkType overload that takes literals.

It also revealed dead code that had been reading as configuration:
`health.test.ts` set `probeDatabase` twice in one literal, three times over,
so the first was silently discarded.

**Left open, deliberately: the test projects.** `tsc --build
apps/be-01/tsconfig.spec.json` still reports 10 errors, all pre-existing and
none in this change (`push-client.test`'s fetch stubs lack `preconnect`,
`retention-timer.test`'s timer casts, `boot.test`'s `ServiceName`). Fixing
them is its own change; wiring the gate to include them before they are fixed
would leave CI red for reasons nobody here caused. **This is the repo's
fourteenth "check that cannot fail", and the first one found in the gate
itself.**

## Observed on dev, against the real database

Deployed at `8e1c1bd`, all four tables and the `work_item` column migrated.

```
$ POST .../teams {"name":"Platform"}   → {"id":"97a81f46…","name":"Platform"}
$ POST .../teams {"name":"Platform"}   → the same id
$ POST .../teams {"name":"   "}        → 422
$ POST .../people Ada   in Platform    → created
$ POST .../people Grace with no teams  → created, teamIds []
$ PATCH work-item     serviceTeamId=Platform            → 200
$ PUT   .../assignees/<dev>  personId=Grace (free agent) → 200
$ GET   .../work-items  assignees {dev: Grace}, doesEveryPhase Grace
$ PUT   .../assignees/<qa>   personId=Ada                → 200
$ GET   .../work-items  2 assignees, doesEveryPhase null
$ PUT   .../assignees/<qa>   personId=null               → 200
$ GET   .../work-items  1 assignee, doesEveryPhase back
```

Two claims worth having from that run. A **free agent was assigned to work
labelled `Platform`** — the decoupling Dany asked for, against real rows
rather than a fixture. And the lone-assignee assumption **ended when the
second person arrived and came back when they left**, which is what "derived,
not stored" has to mean in practice.

Test data cleared afterwards; `Platform`, `Ada` and `Grace` remain in the
global directory, which is what a global directory does.
