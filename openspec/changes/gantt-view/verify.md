# G `gantt-view` — verify

Slices 1–6. **Slice 7 (`e2e/gantt.spec.ts`) is not done**, so the claim this
change most needs a browser for — that a bar's scaled rect lines up with its own
axis label — is still unmade. Nothing below is evidence for it.

Every command was run on 2026-08-09 on Dany's Mac (darwin arm64, bun 1.3.14),
from `/Users/danylofedorov/wd/puni/wbs-tool-v1` on branch `change/gantt-view`,
head `97af9af`.

Slices 4–6 were finished by a second agent taking over a stopped run. It
re-observed **every** negative in the change, slices 1–3's included, rather than
inheriting the claim: see "Proof comments corrected" below for the three that
did not survive that.

## What landed

| file                                                                                | what                                                            |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/be-01/src/service/work-item.service.ts`                                       | `tree()` keeps `planned.slices` (slice 1)                       |
| `apps/fe-01/src/lib/wbs-api.ts`                                                     | `SliceView`, `slices` on the tree result (slice 2)              |
| `apps/fe-01/src/components/wbs/gantt-geometry.ts`                                   | new — `layOutGantt`, `GanttDataError` (slice 3)                 |
| `apps/fe-01/src/components/wbs/gantt-geometry.test.ts`                              | new — 23                                                        |
| `apps/fe-01/src/components/wbs/gantt-panel.tsx`                                     | new — the SVG, the sticky labels, the HTML axis (slices 4, 6)   |
| `apps/fe-01/src/components/wbs/gantt-panel.test.tsx`                                | new — 15, over the panel and over `WbsTable` with it open       |
| `apps/fe-01/src/components/wbs/wbs-table.tsx`                                       | the `Gantt` toggle, `ganttPlan`, `goToRow`, `notBeforeOffsetOf` |
| `tsconfig.base.json`, fe-01's three tsconfigs, `vite.config.ts`, `vitest.config.ts` | `@wbs/domain/workday`, the module and not the barrel            |

fe-01 counted 741 before slices 4–6 and **756** after: 15 in
`gantt-panel.test.tsx`. No existing test was edited.

## The gate

| command                                                      | result                       |
| ------------------------------------------------------------ | ---------------------------- |
| `bunx nx format:check --all`                                 | pass                         |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass, 21 projects            |
| `bunx nx test fe-01`                                         | **756 passed**, 37 files     |
| `bunx nx run fe-01:build`                                    | pass, 293 modules, 481.69 kB |
| `bunx openspec validate --all --json`                        | pass, 48 items               |

`bun run e2e` was **not** run: slice 7 has not been written, and this change's
browser claims are all in it.

## The import that is a module and not a barrel

`libs/domain`'s index re-exports `estimate.ts`, whose validators pull arktype
into anything importing it — which is why every wire type in `wbs-api.ts` is
declared by hand. `workday.ts` is pure, and the panel needs exactly the calendar
rule be-01 prints Start and End with. So the alias names the file:
`@wbs/domain/workday`, in `tsconfig.base.json`, in fe-01's three tsconfigs
(which _replace_ the base's `paths` rather than adding to them), and in both
vite configs.

`grep -c 'arktype\|ArkErrors' dist/apps/fe-01/assets/index-*.js` → **0**.

`tsconfig.app.json` traded `rootDir: "src"` for `noEmit: true` in the same
change, and all three of these were watched:

| config                         | what `nx typecheck fe-01` did                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `rootDir: "src"`               | failed: `wbs-table.tsx(9,33): error TS6059: File '…/libs/domain/src/workday.ts' is not under 'rootDir' '…/apps/fe-01/src'` |
| neither `rootDir` nor `noEmit` | passed, and wrote `workday.js` + `workday.js.map` into `libs/domain/src` — a build artefact in a source tree               |
| `noEmit: true`, as it stands   | passed; and see the row below                                                                                              |

The third needed its own proof, because a typecheck target that compiles nothing
is the one vacuous check ever found in this repo's **gate** (R5, 2026-08-06). A
deliberate `const deliberatelyWrong: number = 'not a number'` appended to
`gantt-panel.tsx` failed it on `gantt-panel.tsx(406,7): error TS2322: Type
'string' is not assignable to type 'number'`. `noEmit` did not make it vacuous.

## Failure proof

Every check was watched failing with the thing it guards broken, by the agent
writing this table, on 2026-08-09. Test counts are from
`gantt-panel.test.tsx` (15) and `gantt-geometry.test.ts` (23) run alone.

### Slices 4–6

| check                                     | fault injected                                                     | what failed                                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the SVG user space is workdays            | `x={bar.start * DAY_PX}`, `width={bar.duration * DAY_PX}`          | 1 — `puts a 3.5→6 slice at x=3.5…`, on `expected '98' to be '3.5'`; `data-start` went on saying 3.5 beside it                                                                                                  |
| the summary bracket is drawn              | the `chart.brackets.map` block deleted                             | 1 — `expected 'nothing on the chart at [data-gantt-b…' to contain 'L 5 0.5'`                                                                                                                                   |
| the dependency arrow is drawn             | the `chart.arrows.map` block deleted                               | 1 — `expected 'nothing on the chart at [data-gantt-a…' to contain 'M 3 1.5'`                                                                                                                                   |
| the person link is drawn, and dashed      | the `chart.personLinks.map` block deleted                          | 1 — `expected 'nothing on the chart at [data-gantt-p…' to contain '[stroke-dasharray:4_3]'`                                                                                                                    |
| the not-before flag is drawn              | the `chart.notBeforeFlags.map` block deleted                       | 1 — `expected 'nothing on the chart at [data-gantt-n…' to match /^M 4 /`                                                                                                                                       |
| the flag is at its workday                | the flag's `d` built from `flag.rowIndex` instead of `flag.offset` | 1 — `expected 'M 2 2.18 L 2.35 2.18 L 2 2.5 Z' to match /^M 4 /` — right row, wrong day                                                                                                                        |
| the panel mirrors the search              | `ganttPlan.rows` fed `table.getRowModel().rows`                    | 1 — `draws exactly the rows a search narrowed…`, `[ 'Hull', 'Sanding', 'Sealing', …(1) ]`; the collapse test still passed                                                                                      |
| the panel mirrors the expansion           | `ganttPlan.rows` fed `flat`                                        | **2** — the search test again, and `leaves a collapsed branch's children off the chart` on `to deeply equal [ 'Hull', 'Rigging' ]`                                                                             |
| click-to-row names a cell both faces draw | `cellIn(grid, { rowId, columnId: 'not-before' })`                  | **3** — bar and label clicks on `expected <input type="date" …(6)></input> to be <textarea …(5)></textarea>`; the cards face on `expected <body style><div>…(1)</div></body> to be <textarea …(5)></textarea>` |
| the axis follows the ceil−1 nudge         | `lastWorkdayOf` returns `Math.ceil(finish)`                        | 1 — `reads the same dates under a bar…`, on `expected '2026-08-17' to be '2026-08-14'`                                                                                                                         |
| a not-before date is counted in workdays  | `notBeforeOffsetOf` counting calendar days through `Date.parse`    | 1 — `holds a not-before flag at the workday its date is…`, on `expected 'M 7 3.18 L 7.35 3.18 L 7 3.5 Z' to match /^M 5 /`                                                                                     |
| the typecheck target is not vacuous       | `const deliberatelyWrong: number = 'not a number'`                 | `nx typecheck fe-01` — `gantt-panel.tsx(406,7): error TS2322`                                                                                                                                                  |

### Slice 3, re-observed

Inherited `Proof:` comments, re-run rather than believed. All six agreed with
what they claimed.

| check                                        | fault injected                                       | what failed                                                                                                                                                              |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a dangling `resourcePredecessorId` throws    | the throw replaced by `continue`                     | **2** — both `throws when a resource predecessor names no slice…` and `…even where no bar would be drawn`                                                                |
| a person floor has a predecessor             | the throw replaced by `return 'Waits for a person'`  | 1 — `throws when a person floor names no resource predecessor`                                                                                                           |
| a person floor names a known person          | the throw replaced by `return 'somebody'`            | 1 — `throws when a person floor names somebody the plan does not`                                                                                                        |
| a slice's role is one the plan lists         | the throw replaced by `Number.MAX_SAFE_INTEGER`      | 1 — `throws when a slice is under a role the plan does not list`                                                                                                         |
| that check is reachable for a one-slice leaf | the role place looked up inside the sort comparator  | 1 — the same test; `sort` never calls a comparator for a list of one                                                                                                     |
| a bracket is a span, not a sum               | the projection replaced by a sum of what is under it | **3** — `spans a parent over staggered children`, `is a span and not the sum…` (`expected 7 not to be 7`), `reaches as far as the latest finish…` (`expected 3 to be 9`) |

## Proof comments corrected

The user's standing instruction was that some inherited `Proof:` comments
described a run nobody had watched. Three did not survive re-observation. All
three are now what the re-run printed.

1. **`lastWorkdayOf`'s JSDoc named a test that does not exist.** It credited
   "`the axis under a bar reads the same dates as the row's Start and End
cells`"; the test is called `reads the same dates under a bar as the row's
Start and End cells`. A `Proof:` whose observing test cannot be found by its
   name is a claim nobody can re-run. It now names the test, the message
   (`expected '2026-08-17' to be '2026-08-14'`) and the fact that one workday
   late is three calendar days late over a weekend.

2. **The click negative claimed two failures; three tests fail.** The comment
   named the table face and the cards face. `takes the plan to a row when its
label is clicked` fails too, on the same message as the bar click — the
   lookup is `goToRow`'s, and both entry points go through it. Corrected to
   name all three and to quote the run's `3 failed | 10 passed`.

3. **The cards-face JSDoc said the fault "would work on the table and quietly
   do nothing here".** It does not work on the table: pointed at `not-before`,
   the caret lands in the row's date input — the wrong cell of the right row —
   and the table-face test fails. Only the _cards_ face gets "nothing at all",
   because `cellIn` finds no such cell there. Corrected to say which face gets
   which failure, which is the whole reason the second test exists.

One more was tightened rather than corrected: the coordinate-contract negative
quoted `expected "98" to be "3.5"` where vitest prints single quotes.

Two assertions were also rewritten so their failures are about the chart. Four
of the marks above were first asserted as `expect(el?.getAttribute('d'))`, and
a deleted mark then failed on chai's _"the given combination of arguments
(undefined and string) is invalid for this assertion"_ — the check does break,
but on argument checking rather than on anything about the chart, and the
message names neither the mark nor the day it should have been on. They go
through `markAttribute`, which substitutes a sentence, and the failures in the
table above are what that prints. Both forms were watched.

## What this change's tests cannot see

The panel's whole point is a non-uniform scale: `preserveAspectRatio="none"`
over a viewBox measured in workdays. jsdom lays nothing out, so **every**
assertion here is about attributes — `x="3.5"`, `viewBox="0 0 6 2"`,
`d="M 4 …"`. That the bar's left edge lands under the axis cell printing its
start date, that the sticky label column holds at 390px with the chart scrolled
right, that the page never scrolls sideways: none of that is asserted anywhere
yet. It is slice 7, and until slice 7 exists this change is proven in numbers
and unproven in pixels — the exact shape of R5 faults #14 and #15.
