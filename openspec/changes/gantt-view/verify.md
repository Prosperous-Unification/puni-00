# G `gantt-view` — verify

All eight slices. Slices 1–6 and a polish pass over 3–6 are below in the order
they were done; **slice 7 (`e2e/gantt.spec.ts`) and slice 8 (the three marks a
live Chrome found invisible) are at the end**, and they are the sections that
close every "nobody has looked at this in a browser" sentence this file used to
end on.

Every command was run on 2026-08-09 on Dany's Mac (darwin arm64, bun 1.3.14),
from `/Users/danylofedorov/wd/puni/wbs-tool-v1` on branch `change/gantt-view`,
head `97af9af` for slices 1–6, `73198ee` for slices 7–8.

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

`bun run e2e` had not been run at this point: slice 7 was not yet written, and this change's
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
and unproven in pixels — the exact shape of R5 faults #14 and #15. **Slice 7
exists now; see the last two sections of this file, and what the browser found
when it finally looked.**

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

**Somebody has now.** Three marks were invisible and are fixed; the two sections
at the end of this file are what was found and what holds it.

---

## Slice 8, 2026-08-09 — the three marks a live Chrome found invisible

Dany opened the panel in a real browser. Every mark on the chart was drawn, every
one of them was gated by a test reading its `d` attribute, and three of them
could not be seen:

1. **A dependency arrow was a 1px elbow with no head**, and when the successor
   started the workday its predecessor finished — `toStart === fromFinish`, the
   commonest shape in any plan — the elbow collapsed into a bare vertical line
   **on** the successor's own left edge, underneath its bar and, on a critical
   row, underneath a 2px ring as well.
2. **The not-before flag was drawn on the bar**, hanging off its top-left
   corner and painted over by it. Its commonest case is a bar that starts
   exactly on the constrained day, which is the case where it disappeared
   completely.
3. **The summary bracket was a hairline**, and upside down: the long line at the
   row's middle with its ends rising, which reads as a scratch rather than as a
   span.

All three are faults of **where** and **how heavy** — which is to say faults of
pixels, and the reason the jsdom layer's 26 green tests said nothing about any
of them.

### What changed

| mark             | now                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dependency arrow | a `<path data-gantt-arrow-head>` filled triangle at the successor's left edge; the elbow at `[stroke-width:1.5]` full-strength foreground; a jog when the two bars touch. `data-gantt-arrow` kept |
| not-before flag  | a filled caret in the clear band **above** the bar, `fill-foreground`, with a `<title>` reading `No earlier than 2026-08-13`. `data-gantt-not-before` kept                                        |
| summary bracket  | the same four points reordered so the legs **drop** from the line, at `[stroke-width:2]`. `data-gantt-bracket` kept                                                                               |

**The head is a path, not a `<marker>`** — the decision design §1 leaves open,
logged here as the plan asks. A marker's contents are laid out in its own
viewport but the element is placed by the referencing geometry's user space,
which here is `preserveAspectRatio="none"` over a viewBox of workdays by rows:
`markerUnits="userSpaceOnUse"` buys a triangle still stretched by whatever ratio
the panel happens to be sized at. A path in the chart's own units, with each
axis divided by its own scale — the arithmetic `BAR_RADIUS_PX` already
documents — is the only shape that stays a triangle, and it is an element a
test can find and a browser can measure the box of.

The arrow's approach (`ARROW_APPROACH_PX = 10`) and head (`7 × 3.5`) are
declared in **CSS pixels** and divided by `DAY_PX`/`ROW_PX` where they are used,
for the same reason the corner radius is: a mark's legibility is a decision made
in pixels and a workday is not a size. The engine's numbers still reach `x`,
`width` and `data-start` unconverted, which is the rule design §1 actually
states.

**One thing the browser changed after the fix.** The first jog crossed in the
inset above the _successor's_ row — which is exactly where the not-before caret
stands, and the screenshot showed a line running through an arrowhead-sized
triangle, making a puzzle of both marks. The crossing band moved to the clear
inset at the far side of the **predecessor's** row (`crossing` in `arrowRoute`).
Same air, no collision. That is a change nothing but a picture would have asked
for.

### Failure proof — slice 8, in jsdom

`the marks that had to be seen` in `gantt-panel.test.tsx`, five tests, asserting
the **relations between the paths' points** rather than path text: a head that
arrives left of the bar it points at, a caret whose whole box is above the bar's
`y`, a bracket whose ends fall from its line. Each fault injected on the
production path, run alone, reverted after.

| check                                        | fault injected                                                                                    | what failed                                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the arrow does not run down the shared edge  | `arrowRoute` given back its old three points (`M fromFinish,fromY L toStart,fromY L toStart,toY`) | 1 — `leaves the successor’s left edge alone when the two bars touch`, `1 failed \| 30 passed`, on `the arrow arrives from above the successor’s left edge, not from outside it: expected 3 to be less than 3` |
| the arrow is drawn heavily enough to be seen | `[stroke-width:1.5]` struck from the elbow's class                                                | 1 — the same test, on `expected 'stroke-foreground fill-none' to contain '[stroke-width:1.5]'`                                                                                                                |
| the arrow has a head                         | the `<path data-gantt-arrow-head>` deleted                                                        | 1 — `points a filled head at the successor’s start`, on `Error: nothing on the chart at [data-gantt-arrow-head="strip->sand"]`                                                                                |
| the caret is clear of its bar                | the caret's old `d` restored — a triangle on the bar's top-left corner                            | 1 — `puts the not-before caret clear of the bar that starts on it`, on `the caret is not clear of the bar it belongs to: expected 2.18 to be less than 2.18`                                                  |
| the caret says which date                    | the `<title>` child deleted                                                                       | 1 — `says which date the caret is holding the row at`, on `expected undefined to be 'No earlier than 2026-08-13'`                                                                                             |
| the bracket's legs drop                      | the four points put back in their old order                                                       | 1 — `drops the summary bracket’s legs from its line, in a stroke that is seen`, on `the bracket’s legs do not drop from its line: expected 0.18 to be greater than 0.5`                                       |
| the bracket is 2px                           | `[stroke-width:2]` struck from its class                                                          | 1 — the same test, on `expected 'stroke-foreground fill-none' to contain '[stroke-width:2]'`                                                                                                                  |

`gantt-panel.test.tsx` 26 → **31**; fe-01 786 → **791**.

One assertion was _weakened_ rather than strengthened, deliberately. `draws every
other mark the geometry placed` asserted the bracket with
`toContain('L 5 0.5')`; the new shape contains that string too — as the end of a
leg rather than as a corner — so the segment is not what tells the two apart. It
stays as the mark's **existence** check, which is the fault it was written for
(the whole `map` block deleted), and the shape is asserted where the relations
are. Recorded because a reader of that line would otherwise think it pins the
drawing.

---

## Slice 7, 2026-08-09 — `e2e/gantt.spec.ts`, the browser layer

Six tests. Ports 3111/3211/4211 for the run, then the config reverted — checked
by `git diff apps/fe-01/playwright.config.ts` being empty, which it is. The
committed config is untouched and CI keeps 3100/3200/4200.

```
Running 6 tests using 1 worker
  ✓ draws a bar at the pixel its workday says, under its own axis cell (1.5s)
  ✓ draws the arrow head, the caret and the bracket where they can be seen (1.1s)
  ✓ holds the labels at the left edge with the chart scrolled fully right (1.0s)
  ✓ scrolls the plan back to the row whose bar was clicked, and lands the caret (1.9s)
  ✓ the chart on a phone › holds its labels and leaves the page still (1.0s)
  ✓ the chart on a phone › takes the cards face to a row when its bar is clicked (1.9s)
  6 passed (12.2s)
```

The whole browser gate, so the panel and its toggle are shown to have broken
nothing else: **60 passed (1.3m)** — `gantt` 6, `header` 5, `keyboard` 10,
`layout` 22, `mobile` 5, `phases` 6, `tailwind` 6. `layout.spec.ts`, the one
that matters most because it is the table's own geometry, is 22/22 with the
panel in the tree.

### Failure proof — slice 7

| check                                 | fault injected                                              | what failed                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| a bar is on its own row after scaling | the SVG's CSS `height` 20px taller than `rowCount × ROW_PX` | 1 — `draws a bar at the pixel…`, on `… is not on its own row: expected 7.866677246093751 to be <= 1`                      |
| a bar begins under its own axis cell  | an axis cell `style={{ width: DAY_PX + 1 }}`                | 1 — the same test, on `… does not begin under the axis cell for workday 4: expected 4 to be <= 1`                         |
| the arrow has a head, on screen       | the `<path data-gantt-arrow-head>` deleted                  | 1 — `draws the arrow head…`, on `nothing on the page at [data-gantt-arrow-head]`                                          |
| the caret's box is off the bar's box  | the caret's old `d` restored                                | 1 — the same test, on `the not-before caret is drawn over the bar it belongs to: expected true to be false`               |
| the bracket is 2px **as computed**    | `[stroke-width:2]` struck from its class                    | 1 — the same test, on `the summary bracket is a hairline: expected 1 to be >= 2`                                          |
| the label column holds the left edge  | `sticky left-0` dropped from `[data-gantt-labels]`          | **2** — both label tests, on `the label column went with the chart instead of holding the edge: expected 1048 to be <= 1` |
| the click scrolls the plan to the row | `goToRow` reduced to `cell.focus({ preventScroll: true })`  | **2** — both click tests, on `the plan did not scroll to the row the bar belongs to` and `the cards did not scroll…`      |

The stroke-width row is the one no test in this repository outside this file can
make: `[stroke-width:2]` in a `class` attribute is a string until a browser
computes it, and every jsdom assertion about it passes on a class that no rule
ever applied.

The last row's fault passed **all 31** of `gantt-panel.test.tsx` — jsdom takes
`focus`'s options bag and does nothing with it, and lays nothing out to scroll.

### The negative `tasks.md` asked for, and why it is not in the table

Slice 7 named "the click's `scrollIntoView` guard inverted". It was injected —
`if (typeof cell.scrollIntoView !== 'function')` — and **all six browser tests
passed**. Chromium scrolls a focused element into view of its own accord, so the
guarded call is belt-and-braces in a browser and load-bearing only in jsdom,
which has no `scrollIntoView` at all. A negative that cannot fail is the thing
R5 exists to stop, so it is recorded as refuted rather than quietly reworded,
and `cell.focus({ preventScroll: true })` — the scroll actually suppressed — is
the fault the row above watches. The guard stays: `scrollIntoView({ block:
'nearest' })` scrolls to the nearest edge where `focus()` scrolls to its own
default, and the jsdom tests would throw without it.

### A check of my own that could not fail, found and fixed mid-run

The first draft of `draws the arrow head, the caret and the bracket…` took the
successor's bar as `bars.at(1)`, reasoning that `010` is a parent and draws no
bar. A new project lists **two** roles and the fixture estimates Dev alone, so
index 1 is `010.1`'s unestimated QA slice — a rect of **no width**, at the same
workday as the bar that was wanted. Every assertion passed against it, the
arrowhead's included, and so did the run with the caret put back on top of the
real bar: a zero-height box cannot be overlapped. The bar is now found through
the caret's own row, and its width and height are asserted before anything is
measured against it. That is the sixteenth in this repository's tally and the
first one caught inside a browser test being written, by injecting the fault the
test was for and watching it pass.

### What only the browser saw

- **The three marks above**, all of which were green in jsdom.
- **The arrow crossing the caret**, which no assertion asked about and a
  screenshot did.
- **A bar at workday 8 with no axis cell to compare against.** The axis prints
  one cell per whole workday _inside_ the horizon, and a zero-day slice can sit
  exactly on the horizon. Not a fault — the alignment loop now compares only the
  bars the axis has a cell for, and says why.
- **A gap in the ported run, not in the product.** `mobile.spec.ts`'s peer-edit
  test failed once on this stack: be-01 was still publishing to `GW_URL=…:3200`,
  the live dev gateway, while the page was on 3211. The event reached a gateway
  nobody was listening to. Fixed by overriding `GW_URL` for the run; the
  committed config is unaffected, because there the three ports agree with the
  `.env` files. Recorded because a green suite on a ported stack is only as good
  as the ports.

### Two changes outside the spec file

- `apps/fe-01/tsconfig.e2e.json` gained the `@wbs/domain/workday` path. The spec
  imports `DAY_PX`/`ROW_PX` from the panel rather than repeating them — the way
  `layout.spec.ts` imports `table-frame`'s widths — and the panel imports that
  module. `nx typecheck fe-01` runs `tsc --build --force` over this project, and
  it now compiles the spec: watched passing after the alias, and it is the same
  target that caught the deliberate `const deliberatelyWrong` above.
- Nothing else. `wbs-table.tsx` is byte-identical to `73198ee` (`git diff` on it
  is empty after the injected faults were reverted).

## The gate, after slices 7 and 8

| command                                                      | result                                 |
| ------------------------------------------------------------ | -------------------------------------- |
| `bunx nx format:check --all`                                 | pass                                   |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass, 21 projects                      |
| `bunx nx test fe-01`                                         | **791 passed**, 37 files               |
| `bunx openspec validate --all --json`                        | 48 items, 48 passed, 0 failed          |
| `bunx tsc --build --force apps/fe-01/tsconfig.spec.json`     | 15 errors, **0 in a gantt file**       |
| `bunx playwright test` (the whole browser gate)              | **60 passed**, 1.3m                    |
| `git diff apps/fe-01/playwright.config.ts`                   | empty — the ported ports were reverted |

The 15 spec-project errors are the pre-existing set named in
`teams-and-assignees/verify.md`; `grep -ci gantt` over that output prints 0.

**This change is now proven in pixels as well as in numbers.** Every sentence
above that used to end "and until slice 7 exists…" is answered by
`e2e/gantt.spec.ts`, and the three things a person looking at the chart could
not see are the three things it measures first.
