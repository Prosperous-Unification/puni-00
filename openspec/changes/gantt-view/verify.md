# G `gantt-view` — verify

Slices 1–6, plus a polish pass over 3–6 (bar colours, on-bar labels, hover
density, axis rhythm). **Slice 7 (`e2e/gantt.spec.ts`) is not done**, so the
claim this change most needs a browser for — that a bar's scaled rect lines up
with its own axis label, and that the chart reads well at 1400 and 390 — is
still unmade. Nothing below is evidence for it.

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
| `apps/fe-01/src/components/wbs/gantt-geometry.test.ts`                              | new — 42                                                        |
| `apps/fe-01/src/components/wbs/gantt-panel.tsx`                                     | new — the SVG, the sticky labels, the HTML axis (slices 4, 6)   |
| `apps/fe-01/src/components/wbs/gantt-panel.test.tsx`                                | new — 15, over the panel and over `WbsTable` with it open       |
| `apps/fe-01/src/components/wbs/wbs-table.tsx`                                       | the `Gantt` toggle, `ganttPlan`, `goToRow`, `notBeforeOffsetOf` |
| `tsconfig.base.json`, fe-01's three tsconfigs, `vite.config.ts`, `vitest.config.ts` | `@wbs/domain/workday`, the module and not the barrel            |

fe-01 counted 741 before slices 4–6, **756** after, and **786** after the
polish pass: 42 in `gantt-geometry.test.ts` and 26 in `gantt-panel.test.tsx`.
Three of the panel's own tests were rewritten deliberately (see "What the polish
pass changed"); no test outside this change's two files was edited.

## The gate

Run again in full after the polish pass, on 2026-08-09, head `b9390a6`.

| command                                                      | result                           |
| ------------------------------------------------------------ | -------------------------------- |
| `bunx nx format:check --all`                                 | pass                             |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass, 21 projects                |
| `bunx nx test fe-01 --skip-nx-cache`                         | **786 passed**, 37 files         |
| `bunx openspec validate --all --json`                        | pass                             |
| `bunx tsc --build --force apps/fe-01/tsconfig.spec.json`     | 15 errors, **0 in a gantt file** |

The spec projects are still outside the gate — the 15 are the pre-existing set
named in `teams-and-assignees/verify.md`, none of them in a file this change
touches. Checked by name, not by count: `tsc … | grep -i gantt` prints nothing.

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

## The polish pass, 2026-08-09

The panel worked and was gated; it did not yet **read** as a schedule. Six
changes, each of them a decision rather than a coat of paint.

### What the polish pass changed

1. **A bar's fill is who is on it.** `tab10`, handed out in `gantt-geometry.ts`
   in order of first appearance walking the shown rows top-down, wrapping past
   ten; a slice nobody is on is `#94a3b8` grey and spends no colour. The mapping
   is computed in the pure module, not in the component, because "the same
   person is the same colour on every row" is a fact about the whole chart and a
   component deciding it per bar could not be asked whether it held.

   **The deliberate cost:** the colours are a property of _what is on screen_.
   Collapse the branch holding the person who was drawn first and everyone below
   shifts up the palette. The alternative — ordering by the payload's slice
   array — is stable and meaningless, because that array is the engine's
   placement order and would colour the top row by whatever the scheduler
   happened to reach first. Within one drawing every row agrees, which is the
   property a reader actually uses. Said in the JSDoc on `colorByPerson`.

2. **The critical path moved from the fill to the outline**, and the spec's
   "SHALL be tinted so" is now a 2px non-scaling ring rather than
   `fill-destructive`. Two reasons, and the second is the hard one: the fill is
   already saying who, and `#d62728` **is** the fourth person's colour — a red
   ring on a red bar is no ring at all. So the ring is `stroke-foreground`,
   which is distinct against all ten hues. The requirement is unchanged in
   substance — the mark is present on a critical bar and absent off one, and
   `rings the critical bar and leaves the other one alone` asserts both halves
   by class name, exactly as the old test did by fill name. `data-critical` is
   untouched, so slice 7's selectors still find the bar.

3. **The assignee is written on the bar, in HTML.** Design §1 forbids text in
   the SVG — the user space is non-uniformly scaled and would stretch every
   glyph — so the labels are absolutely-positioned spans over the chart,
   `left = start × DAY_PX`, the same arithmetic the axis row already makes. Full
   name, initials, or nothing, and the threshold is not a fourth constant: it
   falls out of the one measurement, `duration × DAY_PX` against the string's
   own length. `pointer-events-none`, so the span cannot swallow the click that
   takes the plan to a row.

   The ink is not one white. `inkOn` takes WCAG relative luminance of the fill
   and writes dark on `#bcbd22`, `#17becf` and `#ff7f0e`; white on the other
   seven. Its parameter is `BarColor` — a union of eleven hexes — which is what
   lets it parse a hex with no malformed-input branch to write and no branch
   that could never fire.

4. **The `<title>` is five lines**: work item, `role · person`, dates (or
   workday offsets when the plan is not on a calendar) with the duration, float
   or "on the critical path", and the binding floor **last**. The floor keeps
   the last line and `names what holds a bar where it is` was rewritten to
   assert the whole list rather than that one line, deliberately. The prose
   rounds to two decimals and nothing else does: PERT hands out
   `3.6666666666666665`, which is the right number to draw with and an
   unreadable thing to write in a sentence — `says a fraction in prose to two
places, and draws it whole` holds both halves of that at once.

5. **Axis rhythm.** The every-fifth gridline already existed and was untested;
   it now has `WEEK_DAYS`, a `data-gantt-gridline` handle, a test and a watched
   negative, and the axis label above a week boundary is `text-foreground`
   semibold over the lighter rest. Added with it: a `fill-muted/40` band behind
   every other row, so an eye tracking one row across a chart wider than the
   window does not land a row out.

6. **Corners and cohesion.** `rx = BAR_RADIUS_PX / DAY_PX`, `ry =
BAR_RADIUS_PX / ROW_PX` — a single number in user units comes out as an
   _ellipse_ under `preserveAspectRatio="none"`, so the radius is divided by
   each axis's own scale. This is **not** the pixel arithmetic design §1
   rejects: that rule is about the engine's numbers, which still reach `x` and
   `width` unconverted. A corner radius is a decision made in pixels and has no
   other honest unit. The label column gained a `border-r` and a muted uppercase
   header, and the axis row a `bg-muted/40`, to sit with the rest of the shadcn
   chrome.

Person links now carry the person's colour (`stroke={link.personColor}`, read
off the waiting **bar** so the line and its two ends cannot disagree), which is
the sixth item of the plan and what makes a hand-off read as one queue rather
than a third kind of edge.

`d3-scale` was **not** brought in (design §4's condition): nothing here needed a
scale beyond `× DAY_PX`.

### The chart-forming tests

`gantt-geometry.test.ts` 23 → 42. The ten shapes the plan asked for: a
same-person hand-off whose link endpoints are asserted against the two bars'
own coordinates; a two-predecessor join, one arrow per **stored** edge, both
landing on the max of the finishes; dep-later-than-person and
person-later-than-dep as separate tests; a not-before floor at a fractional
offset with the bar standing on it; a three-slice PERT chain carried through
verbatim; tree order preserved with the starts out of it (the anti-reference
test); parent and grandparent brackets nesting; the four colour rules; a
zero-day slice kept as a bar of no width that moves the horizon nowhere; and an
empty plan asserted whole — `toEqual` over every field, so a mark appearing from
nowhere fails too.

### Failure proof — the polish pass

Every one watched failing on 2026-08-09, by the agent writing this section, with
the fault injected on the production path and reverted after the run. Counts are
from the two files run together or alone as noted.

| check                                  | fault injected                                                         | what failed                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a bar's fill is its person             | `fill="currentColor"`                                                  | **3** — `paints a bar in its person's colour…` and `rings the critical bar…` on `expected 'currentColor' to be '#1f77b4'`, and `draws an unestimated slice hollow…` on `to be 'none'`                     |
| the critical ring is drawn             | `barClasses` returning `''` for a critical bar                         | 1 — `rings the critical bar and leaves the other one alone`, `expected false to be true`; `data-critical` still on the bar                                                                                |
| a person keeps one colour              | `colorByPerson.set(personId, next)` removed                            | **3** — `gives one person one colour…` on `expected '#1f77b4' not to be '#1f77b4'`, plus the order and wrap tests                                                                                         |
| the order is the rows', top-down       | the map pre-seeded from `[...new Set(…personId)].sort()`               | **2** — `hands the palette out in the order people first appear…` on `[ '#ff7f0e', '#1f77b4' ]`; `gives one person one colour…` went on passing, which is why the order has its own test                  |
| the eleventh person wraps              | `PERSON_BAR_COLORS[colorByPerson.size]`, the `%` dropped               | 1 — `wraps the eleventh person…` on `expected undefined to be '#1f77b4'`                                                                                                                                  |
| unassigned is not a person             | `return PERSON_BAR_COLORS[0]` for a null personId                      | 1 — `paints a slice nobody is on grey…` on `expected '#1f77b4' to be '#94a3b8'`                                                                                                                           |
| the label ink follows the fill         | the luminance threshold raised to 99 — one white for every bar         | 1 — `writes the label in ink the bar can be read through`, `expected '#ffffff' to be '#0f172a'`                                                                                                           |
| the panel uses that ink                | `color: '#ffffff'` in the overlay                                      | 1 — `writes the label in ink the bar it sits on can be read through`, `expected 'rgb(255, 255, 255)' to be 'rgb(15, 23, 42)'`                                                                             |
| the label sits where the bar is        | `left: bar.rowIndex * DAY_PX`                                          | 1 — `puts the person's name where the bar is…` on `expected '28px' to be '84px'`                                                                                                                          |
| those pixels are the SVG's box         | `relative` dropped from the overlay's wrapper                          | 1 — the same test, `expected false to be true` — jsdom lays nothing out, but it can see the arrangement that decides the answer                                                                           |
| a too-narrow bar writes nothing        | the `if (shown === null) return null` guard removed                    | 1 — `writes nothing at all on a bar too narrow to hold a letter`, `expected <span …(4)></span> to be null`                                                                                                |
| the hover sentence ends on the floor   | `bar.floorWords` moved to the first line                               | 1 — `says everything it knows in a title nothing scales, floor last`                                                                                                                                      |
| the person link is the person's colour | the link's `stroke` left off                                           | 1 — `draws every other mark…` on `expected 'nothing on the chart at [data-gantt-p…' to be '#1f77b4'`                                                                                                      |
| the week gridline is five workdays     | `day.workday % 7 === 0` — a calendar week on a weekend-free axis       | 1 — `draws every fifth gridline heavier…` on `expected 'stroke-border/40' to be 'stroke-border'` at day 5                                                                                                 |
| the row bands are drawn                | the band block's filter turned off                                     | 1 — `bands every other row…` on `expected [] to deeply equal [ '1' ]`                                                                                                                                     |
| a zero-day slice is marked             | the tick block's filter turned off                                     | 1 — `marks a zero-day slice with a tick where it starts`, `expected 'nothing on the chart at [data-gantt-t…' to be '3'`                                                                                   |
| an assigned slice names a known person | `return name ?? slice.personId`                                        | **2** — `throws when a slice is assigned to somebody the plan does not name` and `throws when a person floor names somebody the plan does not`, both `expected function to throw an error, but it didn't` |
| a person floor names somebody          | `personFloorWords(personName ?? 'somebody', …)`                        | 1 — `throws when a person floor names nobody at all`                                                                                                                                                      |
| a slice's role is one the plan lists   | the throw replaced by `place: Number.MAX_SAFE_INTEGER, roleName: null` | 1 — `throws when a slice is under a role the plan does not list`; re-watched in the restructured `placeOf`                                                                                                |

The unknown-person check **moved**: it used to live in `personFloorWords` and
fire only for a person-floored slice; it is now `personNameOf`, on every bar,
because the fill and the on-bar label are both that name. There is exactly one
such throw — a second one left behind in `personFloorWords` would have been a
check nothing could ever reach, which is the shape R5 exists to stop.

### What the polish pass still cannot see

The same hole as before, and it is now wider, because more of this change is
about how it **looks**. jsdom lays nothing out: that the on-bar label lands over
its own rect after `preserveAspectRatio="none"` has scaled the rect and not the
span, that `#bcbd22` with dark ink is actually legible at 10px, that the row
bands line up with the rows, that rounded corners survive a 28px-per-day scale
without going oval — none of it is asserted. Every position assertion here is
`style.left` against `start × DAY_PX`, which is the same arithmetic the
component ran. **Nobody has looked at this chart in a browser.** That is slice 7,
and until slice 7 exists the pretty half of this change is argued and not shown.
