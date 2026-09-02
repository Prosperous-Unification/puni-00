# Sweep D — fe-01 outside the WbsTable cluster

Read-only. `main` working tree, 2026-09-02. Every file in scope opened; the four
2k+ files read section by section. Project-level findings already recorded in
`docs/2026-08-30-sustainability-audit.md` §1 R6 / §2 are **not** repeated — where
this sweep adds a data point to one, it says so and gives the new anchor.

Vocabulary per instruction: module, interface, implementation, seam, adapter,
depth, leverage, locality. Domain nouns from `CONTEXT.md ## Language`.

Format per entry: `file[:range] | LOC | role | reuse | performance | readability/DDD`.

---

## 1 · `src/lib/` — the wire and the socket

### `wbs-api.ts` — 2,204 LOC, section by section

`wbs-api.ts:1–10` | 10 | the one sanctioned deep subpath import (`DependencyReach`,
`PriorityBand` from `@wbs/domain/*`), with the argument for it |
reuse: **none** — this is the counter-example done right; it names why the other
303 lines are hand-written |
perf: none |
DDD: the head comment is the module's own decision record and belongs here (R3).

`wbs-api.ts:11–780` | ~770 | **the wire vocabulary**: `EstimateMethod`,
`PertWeightsView`, `ScheduleView`, `SliceView`, `WorkItemView`, `StepView`,
`TeamView`, `TagView`, `ServiceView`, `WorkItemTypeView`, `ExternalRefView`,
`ExternalSystemView`, `TeamCapacityView`, `PriorityBandView`, `PersonView`,
`DirectoryEffect`, `DirectoryUsage`, `UndoResult`, `StepRemoval` |
reuse: this is the 303 LOC the audit counts (R6), and the sweep confirms the
shape: every one of these is structurally a be-01 row or an `openapi.json`
schema, restated. The **generator seam is missing**, not the types. Note the
three "optional on the wire, required on a `TreeRow`" fields
(`tagIds` `:349`, `serviceIds` `:389`, `typeIds` `:419`) — each carries an
identical blue/green paragraph and each is folded to `[]` in one place
(`toTree`); that is one rule stated four times in prose and zero times in code |
perf: **none at runtime** — types erase. The cost is edit-time (see §Agentic) |
DDD: the vocabulary is excellent — `SliceView.width` vs `WorkItemView.maxParallel`
(`:157`), `effort` vs `duration` (`:170`), `capacityPredecessorIds` as the whole
**blocking set** with `resourcePredecessorId` as the **display referent**
(`:176`) all match `CONTEXT.md` exactly. `followableHref` (`:640`) is a domain
rule (the scheme guard) living correctly beside the type it guards.

`wbs-api.ts:781–1010` | 230 | `PersonPatch`, `TeamPatch`, `DirectoryApi` |
reuse: `DirectoryApi` and `ProjectApi` (`:1010–1470`) declare **overlapping
method sets** — `listTeams`, `listTags`, `listServices`, `listWorkItemTypes`,
`listExternalSystems`, `addTag`, `renameTag`, `removeTag`, `addTeam`,
`listPeople`, `addPerson`, `addService`, `addWorkItemType` are on both, and
`httpProjectApi` (`:2050–2075`) delegates all thirteen to `httpDirectoryApi`
one line each. That delegation block is a **pass-through that fails the deletion
test only because of the interface split**: a `ProjectApi extends DirectoryApi`
would delete 13 lines and 13 interface members. The doc on `DirectoryApi`
(`:846`) says the split exists "because it belongs to no project" — true of the
_module_, not of the _interface a plan page holds_ |
perf: none |
DDD: the audit's "`ProjectApi` methods are bare verbs" lands hardest here —
`tree`, `patch`, `move`, `create`, `remove`, `assign`, `freeze`, `unfreeze` are
verbs with no object, on an interface whose other half is `listWorkItemTypes`.
`patch(id, patch)` in particular takes a 15-field anonymous object literal
(`:1479–1600`) — the plan-command vocabulary R1 counts, in its sixth spelling.

`wbs-api.ts:1010–1600` | 590 | `ProjectApi`, the plan interface |
reuse: `tree()`'s return type (`:1305–1420`) is a 17-field inline object literal
that is **repeated verbatim** at the implementation (`:2016–2036`) — the same 17
fields, in the same order, twice in one file. Deletion test: extract
`interface TreeRead` and one of the two goes |
perf: `tree()` is the read-after-write; see the next entry |
DDD: the field JSDoc is the best domain writing in fe-01 — `undoable`/`redoable`
"carried on the tree rather than asked for separately" (`:1412`) is a decision,
not a description.

`wbs-api.ts:1601–1700` | 100 | `send`, `stepStack`, `removeStepAt`,
`stepRefusalSentence` |
reuse: **the 5-line "read `error` out of a non-2xx body, else `http_<status>`"
block appears four times** — `send` `:1616–1622`, `stepStack` `:1651–1657`,
`removeStepAt` `:1697–1703`, and `refusalCodeIn` `:1810–1817` which is exactly
that block already extracted. Three of the four could call `refusalCodeIn` and
do not; the comment "A proxy error page rather than our JSON" is copied four
times with it. Also `lib/api.ts:39–47` is a fifth copy with one extra arm |
perf: every one of these does `await res.text()` then `JSON.parse` — the plan
payload is parsed once here and once more nowhere, so this is correct; but
`send` reads the **whole** body to text before parsing, which for a 60-row plan
with slices is a double buffer. Immaterial at current sizes; named because it is
the one place plan-sized JSON is handled |
DDD: `stepRefusalSentence` (`:1725`) is one of the six refusal→sentence sites.

`wbs-api.ts:1700–1810` | 110 | the response guards `isRecord`, `isNamed`,
`isDirectoryEffect`, `isUsedWorkItem`, `isUsedProject`, `isDirectoryUsage` |
reuse: none — these are the one hand-written validator family and they exist
because `send` throws the `error` field and drops everything beside it |
perf: `isDirectoryUsage` walks every project × work item × effect on a 409. A
directory removal refusal on a large deployment is O(projects × rows); it is a
refusal path, so once per gesture |
DDD: the JSDoc on `isDirectoryEffect` (`:1745`) records a real defect (a guard
that knew three of five arms made a tag unremovable) — this is R3 done right and
is the strongest argument in the tree for deriving these from the schema.

`wbs-api.ts:1810–1990` | 180 | `capacityRefusalSentence`,
`priorityBandRefusalSentence`, `directoryRefusalSentence` + `SERVER_REFUSAL` |
reuse: **three near-identical implementations**: 5xx arm first, prefix arms,
`switch` on code, one fallback naming the code. `not_found`, `forbidden`,
`unexpected_response` appear in all three with three different wordings; the
5xx arm is `if (/^http_5\d\d$/.test(code)) return SERVER_REFUSAL;` twice
verbatim (`:1839`, `:1906`) and **absent from `directoryRefusalSentence`**
(`:1954`) — so a proxy 502 on a directory rename prints
`The directory could not be changed (http_502).` while the same 502 on a
capacity prints the sentence. That is the audit's "two different 5xx sentences"
with a third state found: _no_ 5xx arm. A fourth site,
`estimating-panel.tsx:139`, has no 5xx arm either. The shape wanted is a table:
`refusalSentence(code, { scope: 'plan' | 'directory' | 'ladder' | 'capacity' })` |
perf: none |
DDD: `SIZE_CEILING_CODE`/`BAND_COUNT_CODE`/`BAND_LABEL_CODE` as **prefixes**
whose tail carries be-01's own constant (`:1823–1836`) is a genuinely deep idea —
the number is never copied. It deserves to be the _general_ mechanism, not three
constants.

`wbs-api.ts:1990–2075` | 85 | `WireCommand`, `postBatch`, `onlyResult`,
`entryOf`, `directoryBatch`, `directoryWrite`, `directoryCreate`,
`directoryRemove`, `httpDirectoryApi` |
reuse: `type WireCommand = { kind: string } & Record<string, unknown>` (`:1992`)
is R1's punchline in one line — **the origin of every write on this client is
untyped**. 14 call sites in `httpDirectoryApi` and 15 in `httpProjectApi` build
one of these by hand |
perf: `directoryBatch` opens its own `fetch` rather than going through `send`,
so the 409-with-fields path duplicates the error-reading block a fifth time |
DDD: `directoryWrite`/`directoryCreate`/`directoryRemove` over one
`directoryBatch` is the right adapter shape — three outcomes, three narrowings,
one transport.

`wbs-api.ts:2075–2204` | 130 | `httpProjectApi` — the plan adapter |
reuse: the 13 delegation lines (above); `projectOf: Map<string, string>`
(`:2085`) is a genuine seam — the batch route is the project's and the write
methods take a work item id, so the client learns the mapping from every tree it
reads. Correct and undocumented as a _decision_ anywhere but here |
perf: **the read-after-write path, and the headline finding of this sweep.**
`tree()` is the only read; nothing in this module de-duplicates, caches or
debounces. Its caller is `wbs-table.tsx:3671 refresh()`, which fires
**eight parallel requests** on every write and every socket frame:
`api.tree` + `api.steps` + `listTeams` + `listTags` + `listServices` +
`listWorkItemTypes` + `listExternalSystems` + `listPeople`
(`wbs-table.tsx:3690–3711`). Five of those eight are the **global directory**,
which no plan write can change. `project-stream.ts:113` deliberately ignores the
socket payload and calls `onChange` — so a peer's keystroke-commit costs every
open browser eight requests and a whole-plan replacement
(`setWorkItems(toTree(tree.workItems))`, `wbs-table.tsx:3729`; the plan is
**replaced, never patched**, and the module says so at `:2762`). A held arrow key
"is a request and a refetch" per repeat (`wbs-table.tsx:5704`). There is no
TanStack Query in this app at all (`@tanstack/react-query` is not a dependency;
only `react-router` and `react-table` are) — no stale time, no dedupe, no
`IndexedDB`/`db/` cache. `src/db/config.ts` is a 28-line `DbConfig` factory that
**nothing imports** (see §5). No polling anywhere: the socket is the only push |
DDD: `httpProjectApi` is an adapter over the same `DirectoryApi` implementation,
which is the right layering; the interface duplication above is what obscures it.

`wbs-api.ts:2202–2204` | 3 | `depthOf(workItem)` — `number.split('.').length - 1` |
reuse: **work item number → depth is derived in at least three places**: here,
`gantt-geometry.ts` takes `depth` on `GanttRow` as a given, and
`work-item-words.ts`/`table-frame.ts` `hierarchyIndentFor(depth)` consume it.
The **Work item number** is a domain concept with a stated format (`010.1`);
its parser lives in a three-line unexported-in-spirit helper at the bottom of
the wire module |
perf: none |
DDD: this is the only _derivation_ in a module whose head comment says it is a
description of what comes back. It is in the wrong module.

### `api.ts` — 82 LOC

role: session and socket URL. |
reuse: `post`'s error block is the fifth copy of `refusalCodeIn`; `EDGE_UNAUTHORIZED`
and the `WWW-Authenticate` discriminator (`:29–37`) is a genuinely deep guard
with its incident written on it |
perf: none |
DDD: exemplary — `me()` "resolves the httpOnly browser session without exposing
its token", and the `x-wbs-token`-never-`Authorization` rule is stated once and
imported by `wbs-api.ts:1610`.

### `project-stream.ts` — 232 LOC

role: the resumable subscription to a project's edits. |
reuse: none — `browserDeps` is the only `WebSocket` construction that belongs to
the plan. But **`presence/presence-panel.tsx:14` opens a second socket to the
same gateway**, by hand, with no reconnect (see §4) |
perf: the design is right and the cost is in the caller: "the payload is
deliberately ignored … refetching is one request and always right" (`:96`).
That was true when a refetch _was_ one request; it is now eight
(`wbs-table.tsx:3690`). `settle()` on `resume_ack` rather than on `open` (`:170`)
correctly prevents a reconnect storm, and `seen(seq)` advancing only on a
landed read (`:157`) prevents resuming past an unseen edit |
DDD: the best-shaped module in the app. `ProjectStreamDeps` (openSocket /
schedule / cancel / random) is a real seam — the whole backoff is testable with
no `EventTarget`. The `unsubscribed = true` before `close()` carries its proof.

### `theme.ts` — 290 LOC

role: theme choice, palette resolution, the provider. |
reuse: **this module holds the canonical localStorage trio** —
`rememberedTheme()` (read + drop a refused value), `readTheme()` (pure read, safe
in a render), `claimedTheme()` (parse), `rememberTheme()` (write). It is copied
line-for-line into `gantt-panel.tsx:663–725` as
`rememberedDetail`/`readDetail`/`claimedDetail`, and a fourth, unparsed variant
lives in `project-settings-modal.tsx:63–73`. Counting the sweep's scope, the
trio now stands at **eleven sites**: eight in `wbs-table.tsx:726–1411`, the ninth
in `gantt-panel.tsx`, a tenth in `project-settings-modal.tsx`, an eleventh
(read/write only) in `project-page.tsx:65–67, 321`. `theme.ts` is the extraction
target that already exists |
perf: `useTheme` re-renders the whole provider subtree on a system-palette
change; correct and rare |
DDD: `paletteFor(choice, systemPrefersDark)` as a pure function with
`paintPalette` as the one writer is the right split. `systemMedia()` throwing
rather than defaulting (`:73`) is R5 kept.

### `utils.ts` — 6 LOC — `cn`. reuse/perf/DDD: none. Correct.

---

## 2 · The Gantt

### `gantt-geometry.ts` — 2,650 LOC, section by section

`gantt-geometry.ts:1–300` | 300 | `BindingFloor`, `PERSON_BAR_COLORS`,
`UNASSIGNED_BAR_COLOR`, `CAPACITY_LINK_COLOR`, `inkOn`, `ServiceTeamLabel`,
`TagLabel`, `ServiceLabel`, `EstimateTrio` |
reuse: `ServiceTeamLabel`, `TagLabel` and `ServiceLabel` are three discriminated
unions over the _same three states_ — `none` / stated / `inherited` with a
`fromRow` — differing only in singular-vs-plural naming (`name` vs `names`) and
in `TagLabel` accumulating rather than replacing. That third difference is real
and domain-correct (ADR 0008: an **Effective tag set** accumulates, an
**Effective team set** replaces), so the union should be
`EffectiveLabel<'replaced' | 'accumulated'>` rather than three types; the two
that _do_ behave alike (`ServiceTeamLabel`, `ServiceLabel`) are pure duplication.
This is the same triplication `directory-page.tsx:573–1234` shows one tier up
and `plan-cards.tsx` shows one tier down |
perf: `inkOn` is a lookup, called once per bar per render inside a memo |
DDD: `BarColor` as a union of the ten literals plus the unassigned grey is the
right depth — a bar's colour is who is on it, and the type says so.

`gantt-geometry.ts:300–860` | 560 | `GanttRow`, `GanttSlice`, `DependencyEdge`,
`GanttTreeRow`, `GanttStep`, `GanttPlan`, `GanttRowLabel`, `GanttBar`,
`GanttSummaryBracket`, `GanttDependencyArrow`, `GanttPersonLink`,
`GanttCapacityLink`, `GanttNotBeforeFlag`, `DroppedLinks`, `GanttGeometry` |
reuse: `GanttSlice` is `SliceView` minus three fields; `GanttRow` is `TreeRow`
projected. The projection is built in `wbs-table.tsx` (`ganttPlan`), so this
module's **input adapter lives in the 11k-line component**, not beside the types
it feeds |
perf: none (types) |
DDD: `GanttPersonLink` vs `GanttCapacityLink` — two structurally identical
interfaces (`fromSliceId`/`fromRowIndex`/`fromStart`/`fromFinish`/`toSliceId`/
`toRowIndex`/`toStart`, one with `personColor`) kept apart because a hand-off and
a pool wait are different facts. That is depth, not duplication, and the panel's
paint (`:3196` dashed 4/3 in the person's colour vs `:3222` dashed 8/4 in
`CAPACITY_LINK_COLOR`) proves it.

`gantt-geometry.ts:864–1185` | 320 | `CalendarScale`, `calendarScale`,
`PlacedBar`…`PlacedGantt`, `placeGantt`, `placeOnCalendar`, `placeOnWorkdays` |
reuse: `placeGantt` parameterised by two `ReadOffset`s, with `placeOnWorkdays`
passing identity, is the right shape — one placement, two scales |
perf: **the second headline finding.** `calendarScale.startOf` (`:936`) calls
`addWorkdays(origin, whole)` per invocation, and `addWorkdays`
(`libs/domain/src/workday.ts:246`) is a **day-by-day loop allocating a `Date`
per iteration**, wrapped in `toUtc` which runs `isIsoDate` — a regex, a
`Date.parse` and a `toISOString()` — on every call. `placeGantt` calls
`startOf`/`endOf` roughly **three times per bar** (`x`, and `stopOf`'s two arms)
plus once per bracket, twice per arrow, twice per person link, twice per
capacity link and once per flag. On a 90-workday plan with 120 bars that is
~360 `startOf` calls × ~90 loop iterations = **~32,000 `Date` allocations and
~130,000 regex/`toISOString` round trips per `placeOnCalendar`**, and
`placeOnCalendar` runs on every change of `plan` or `startDate` — i.e. on every
one of the eight-request refetches above. The fix is local and does not touch
the domain: memoise `startOf` on a `Map<number, number>`, or compute the
workday→calendar-day offsets **once** as a prefix array over the horizon and
index it. `calendarAxis` (`gantt-panel.tsx:1125`) pays the same tax more
cheaply, one `isWeekend` + one `isMonday` per cell, each a `toUtc` |
DDD: `ReadOffset = (workday: number) => number` is the whole abstraction in one
type alias. The comment on `endOf` about `snapWorkdays` before every discrete
step is the drift rule stated once.

`gantt-geometry.ts:1187–1436` | 250 | `routeArrow` and its helpers `rectOf`,
`runCrossesBar`, `frameOf`, `trimmed`, `elbowThrough`, `bandedThrough` |
reuse: none — this is a self-contained router |
perf: **`routeArrow` is O(B²) per arrow.** `obstacles` is every drawn bar
between the two rows (`:1382`); `columns` is `2 × obstacles + 2` candidates
(`:1400`); each candidate tries up to three routes and `isClear` tests every run
against every obstacle (`:1389`). For a dependency spanning most of a 60-row
plan with 120 bars: 242 columns × ~4 runs × 120 obstacles ≈ **116,000 crossing
tests for one arrow**. It is called once per arrow from
`gantt-panel.tsx:3172`, inside `marksOverLight`'s memo — and that memo's
dependency list includes `open?.sliceId` (`gantt-panel.tsx:3521`), so
**opening or closing a bar's hover card re-routes every arrow on the chart**.
That is a per-pointer geometry recomputation the `pointed-row-render-cost`
change did not cover, because it isolated the _pointed_ row and not the _open
surface_. Two independent fixes: hoist the bar-facts surface out of the mark
memo (it is read only by one `onClick`), and index obstacles by row before the
candidate loop |
DDD: `runCrossesBar`'s closed-box-against-open-rectangle reading, with the
argument for why touching is not crossing (`:1244`), is exactly the kind of
knowledge R3 wants on the symbol.

`gantt-geometry.ts:1438–1755` | 320 | the floor sentences — `FLOOR_SENTENCE`,
`spokenNameOf`, `predecessorFloorWords`, `notBeforeFloorWords`,
`personFloorWords`, `poolNameOf`, `capacityTeamLabelOf`, `capacityFloorWords`,
`personNameOf` |
reuse: this is a small sentence-building family that is _not_ duplicated
elsewhere — it is the one place the six `ScheduleFloorView` arms become words.
Contrast the four refusal-sentence functions in `wbs-api.ts`, which are the same
shape and are not shared |
perf: **every one of these runs at layout time for every bar**, whether or not
anybody hovers (`layOutGantt:1830`, `floorWords:` on the `GanttBar` literal).
A 120-bar plan builds 120 sentences per `layOutGantt` for a card that shows one
at a time. Making `floorWords` a thunk or resolving it on open would take a
whole string-building pass out of the refetch path |
DDD: `STALE_TEAM_WORDS = 'a team this plan has not loaded'` (`:1610`) — a
modeled unknown rather than a blank. Good.

`gantt-geometry.ts:1755–2115` | 360 | **`layOutGantt`** |
reuse: it builds five indexes at the top — `rowNames`, `placedRows`,
`sliceById`, `stepsById`, `slicesByWorkItem`, plus `leavesUnder` at `:1905` —
and **`startFloorByRow` (`:2361`) rebuilds four of the same five**, plus
`leavesUnder` again, plus a `predecessorsOf`. That is the missing seam: an
`indexPlan(plan)` returning the six maps, consumed by both. ~60 duplicated lines
and, more importantly, two places that must agree about how a plan is indexed |
perf: ten linear passes over rows/slices with map lookups — algorithmically
clean. The cost is the per-bar `floorWordsOf` above and the fact that it runs
once per `plan` identity change, which the panel memoises correctly
(`gantt-panel.tsx:2513`) |
DDD: `GanttDataError` thrown for a slice naming a predecessor the payload has
not got (`:1770`) is R5 — an invariant broken, not defaulted, and
`gantt-fault.tsx` is the boundary that catches it. Correct pairing.

`gantt-geometry.ts:2115–2361` | 245 | `inStepOrder`, `placeOf`, `floorWordsOf` |
reuse: `inStepOrder` and `inStepOrderSafely` (`:2640`) differ only by a
try/catch; the safe one is used by `startFloorByRow` alone |
perf: `inStepOrder` sorts per work item — O(slices log slices) total. Fine |
DDD: `PlacedSlice { slice, place, stepName }` is the right carrier for
**Step order**.

`gantt-geometry.ts:2361–2520` | 160 | **`startFloorByRow`** — the Start column's
"why is this waiting" sentences |
reuse: the index duplication above |
perf: **the third headline finding, and it is not in this file.**
`wbs-table.tsx:10617` calls `startFloorByRow(ganttPlan, …)` **unmemoised, in the
render body**, and it builds a fresh `new Date()` argument each time. So every
render of `WbsTable` — every keystroke in any cell — re-runs a full plan pass
that (a) rebuilds six indexes, (b) calls `addWorkdays(startDate, offset)` twice
per leaf row through `clearsOnOf`/`startsOnOf` (`:2405–2410`), each of which is
the O(offset) `Date` loop above. For a 60-leaf plan at workday 90 that is
~10,800 `Date` allocations **per keystroke**. `useMemo` on
`[ganttPlan, startDate, todayIso]` is the whole fix; the `new Date()` argument
is what currently makes memoising it look impossible, and
`gantt-panel.tsx:2540` already shows the pattern (`useMemo(() => new Date(),
[todayIso])`) |
DDD: the module correctly refuses to name a day on a plan with no start date —
`calendar: FloorCalendar | null`, "stated rather than defaulted into silence".

`gantt-geometry.ts:2520–2650` | 130 | `latestReachedAmong`, `leavesUnderOf`,
`reachedSliceOf`, `inStepOrderSafely` |
reuse: `reachedSliceOf` is called from both `layOutGantt` and
`startFloorByRow` — correctly shared |
perf: `leavesUnderOf` memoises its walk (`found` map) — linear. `reachedSliceOf`
calls `inStepOrder` per leaf per edge, so a dependency onto a wide parent
re-sorts that parent's leaves' slices once per edge; a cache keyed on leaf id
would make it once per leaf |
DDD: **Dependency reach** implemented exactly as `CONTEXT.md` states it —
`whole-item` takes `own.at(-1)`, `anchor-slice` takes the first estimated.

### `gantt-panel.tsx` — 4,376 LOC, section by section

`gantt-panel.tsx:1–540` | 540 | the scale ladder and every pixel constant —
`DAY_SCALES`, `DAY_SCALE_NAMES`, `isDayPx`, `DAY_PX`, `AXIS_NUMBER_PX`,
`axisNumberShown`, `ROW_PX`, `LABEL_COLUMN_PX`, `GANTT_MIN_PX`,
`GANTT_CEILING_PX`, `GANTT_EDGE_FADE`, `chartBelowTheFold`,
`clampedGanttHeight`, `ganttRoomInColumn`, `appliedGanttHeight`, `BAR_INSET`,
`NOT_BEFORE_LENGTH_PX`, `BAR_RADIUS_PX`, `PRIORITY_CAP_PX`, `ARROW_*`,
`CHART_PAD_PX` |
reuse: `ROW_PX`, `LABEL_COLUMN_PX` and the indent arithmetic sit here while
`table-frame.ts` holds the table's twins (`hierarchyIndentFor` is imported _from_
`table-frame` at `:42`, correctly). But `clampedGanttHeight` /
`ganttRoomInColumn` / `appliedGanttHeight` are **panel-height layout maths in a
render module** — they are pure, tested, and belong beside `table-frame.ts`'s
family, which is the app's one layout-arithmetic module |
perf: `ganttRoomInColumn` (`:317`) reads `getBoundingClientRect().height` on the
column **and on every child** in a loop. Its caller is in `wbs-table.tsx`
(height handle), so it runs during a drag — a forced layout per child per
pointer move |
DDD: `DAY_SCALES = [28, 12, 4]` with the arithmetic for each rung written out
(`:48–81`) is the model for how a magic number should be justified.

`gantt-panel.tsx:540–620` | 80 | `arrowRoute` |
reuse: none |
perf: see `routeArrow` above — this is its one caller, and the doc at `:560–585`
already records that the detail switch makes a fallback route reachable that a
prior review proved dead. Honest, and it means the O(B²) worst case is _more_
reachable than the router's own comments assume |
DDD: the head-as-path-not-`<marker>` argument is a real geometry decision
recorded where it is made.

`gantt-panel.tsx:620–790` | 170 | `DETAIL_KEY`, `RETIRED_ARROWS_KEY`,
`rememberedDetail`, `readDetail`, `claimedDetail`, `ASSUMED_BAR_CLASSES`,
`barClasses` |
reuse: **the ninth localStorage trio**, copied from `theme.ts` (see §1). The
`RETIRED_ARROWS_KEY` drop is a one-off migration living permanently in a render
module |
perf: `readDetail` is called from a lazy `useState` initialiser — correct, no
write in a render |
DDD: the `readDetail` vs `rememberedDetail` split, with "a state updater React
may call twice is no place for a side effect" written on it, is the reason this
copy is _better_ than the ones in `wbs-table.tsx`. Extracting the trio must
preserve exactly this split.

`gantt-panel.tsx:786–1060` | 275 | the word builders — `monthWords`,
`axisDayWords`, `isoToday`, `todayOffset`, `barLabelFor`, `poolLabelFor`,
`barText`, `assumedLabelFor` |
reuse: `barLabelFor` / `poolLabelFor` / `assumedLabelFor` are three functions
with the identical shape `candidates.find(label => room >= label.length *
LABEL_CHAR_PX) ?? null` — three candidate ladders, one fitting rule. One
`fitLabel(candidates, room)` plus three candidate lists would collapse them |
perf: called once per drawn bar per `barWords` memo evaluation — memoised on
`[dayPx, drawnBars]`, so only on a refetch or a scale change. Correct |
DDD: `LABEL_CHAR_PX` "is an estimate and is allowed to be" — a stated tolerance.

`gantt-panel.tsx:1060–1490` | 430 | `AxisDay`, `workdayAxis`, `calendarAxis`,
`spanWords`, `daysNumber`, `dayWords`, `durationWords`, `teamWords`, `tagWords`,
`parallelWords`, `clampWords`, `trioWords`, **`barFacts`**, `notBeforeWords` |
reuse: `teamWords`/`tagWords` restate the label-union triplication from
`gantt-geometry.ts:176–283` at the sentence tier |
perf: **`barFacts` is called once per bar, per render, as an `aria-label`**
(`:3335`, inside `marksOverLight`). It joins up to a dozen sentences —
`spanWords` alone calls `addWorkdays` twice, i.e. the O(offset) `Date` loop
twice per bar. It is inside the memo, so it runs on refetch, scale change,
detail toggle **and on every bar-surface open/close** (`open?.sliceId` in the
deps). Same fix as the arrows: get `open?.sliceId` out of the mark memo |
DDD: `barFacts` is the chart's whole reading of a slice in one place, and the
hover card and the `aria-label` share it — the accessible name and the visible
card cannot disagree. That is the right depth.

`gantt-panel.tsx:1490–1930` | 440 | the standalone SVG export — `GanttSvgTheme`,
`FALLBACK_GANTT_THEME`, `resolvedGanttTheme`, `INLINE_STYLE_PROPS`,
`XML_INVALID_ATTR_CHARS`, `withInlineComputedStyle`, `svgRect`/`svgLine`/
`svgText`, `monthCaptionFor`, `measureLabelGutterPx`,
`buildStandaloneGanttSvg`, `serializeStandaloneGanttSvg`, `ganttSvgFileName` |
reuse: this is **a second renderer of the chart** — the label column, the axis
and the on-bar words are all rebuilt as `<text>` from the same pure functions
the live overlay calls. The head comment argues for it correctly (the live words
are HTML because the user space is non-uniformly scaled). But it is 440 lines of
DOM building inside a 4,376-line render module, sharing nothing with it but four
label functions and `hierarchyIndentFor`. It is the single most extractable
module in this sweep: `gantt-svg-export.ts`, taking
`{ chartSvg, labels, axis, drawnBars, dayPx, theme }` — an interface that
already exists as `StandaloneGanttSvgInput` |
perf: `withInlineComputedStyle` calls `window.getComputedStyle` **per element**
on a recursive clone of the whole chart SVG — for a 120-bar chart with
gridlines and row lines that is >500 forced style resolutions. `measureLabelGutterPx`
attaches a real `<svg>` to `document.body` and calls `getComputedTextLength` per
row label — N more forced layouts. Both are on the download gesture only, so the
cost is a one-off ~100ms, not a per-frame problem. Named because it is the only
place in fe-01 that measures text |
DDD: the `getComputedTextLength`-or-throw rule (`:1385`) with `vitest.setup.ts`
growing a deterministic ruler rather than the app growing a test branch is R5
kept properly.

`gantt-panel.tsx:1930–2185` | 255 | `GanttPanel` (the cycle gate) and `GanttProps` |
reuse: `GanttPanel` is a **pass-through to `GanttChart` with one early return**
and 13 props forwarded one-for-one (`:2062–2077`). Deletion test: it does not
delete — the cycle branch is what lets `GanttChart` hold its hooks
unconditionally, and the JSDoc says so (`:2043`). Keep, but the 13-prop forward
is a `props` spread away from being three lines |
perf: none |
DDD: 150 lines of JSDoc on `GanttPanel` covering the coordinate contract, the
detail rule, the words-are-not-marks rule, the colour rule and the cycle answer.
This is the chart's design document, and it is in the right place — but it is
also why nothing below it can be read without loading 4k lines.

`gantt-panel.tsx:2185–2520` | 335 | `GanttChart` state — `scrolledPx`,
`scrollport`, `moreBelow`, `chartSpanPx`, `pointedRow` (via
`useSyncExternalStore`), `measureTheFold`, the `ResizeObserver` effect,
`detailShown`, `fullScreen` + the focus trap, `open`, `openDay`, `opening`,
`pressedWithTouch`, `endTouchPress`, `chartSvgRef`, `cancelOpening`, `dismiss` |
reuse: the full-screen focus trap (`:2367–2447`, ~80 lines: `focusableSelector`,
`insideOverlay`, `visibleFocusables`, `keepFocusInside`, `containKeys`) is a
**hand-rolled dialog** sitting in the same app that vendors Radix Dialog in
`ui/modal.tsx`. It is not obviously wrong — the overlay must let portalled cards
and toasts take focus, which Radix's trap fights — but that is an argument for a
`useFocusTrap({ allowRoles })` hook, not for 80 lines inside a chart |
perf: **the per-pointer/per-scroll cost.** `onScroll` (`:3653`) does three things
per scroll event: `setScrolledPx`, `measureTheFold(port)` — which reads
`port.firstElementChild.getBoundingClientRect().width` and calls
`chartBelowTheFold(port)` (three more layout reads) and sets **two** more states
— and `dismiss()`. Unthrottled, no `requestAnimationFrame`. So one wheel tick
costs a forced layout and up to three React state updates that re-render the
`GanttChart` shell. The mark memos hold (that is the `pointed-row-render-cost`
win), but `todayAt` (`:2705`, an `axis.find`), `firstVisibleCell` (`:2733`) and
`openBar` (`:2611`, a `drawnBars.find`) all recompute per scroll frame, and the
sticky label column and axis restyle. This is the one hot path the design doc
explicitly left out ("Non-Goals: perf work on typing, drag, or refetch renders")
and scroll is a fourth |
DDD: `measureTheFold` throwing when the scroll box has no content row (`:2274`)
rather than defaulting a width — R5, and correct.

`gantt-panel.tsx:2510–2745` | 235 | the memo layer — `chart` (`layOutGantt`),
`droppedWords`, `today`, `placed`, `drawnBars`, `openBar`, `drawnLinks`,
`drawnPoolWaits`, `drawnFlags`, `axis`, `todayAt`, `days`, `pad`, `chartWidth`,
`rowIdAt`, `pointRow`, `firstVisibleCell` |
reuse: `drawnLinks` and `drawnPoolWaits` are **byte-for-byte the same filter**
over two different arrays (`:2638` and `:2652`) — `link => drawnBars.some(b =>
b.bar.sliceId === link.fromSliceId) && drawnBars.some(… toSliceId)`. One
`bothEndsDrawn(drawnSliceIds)` predicate serves both |
perf: both filters are **O(links × bars)** — 120 links × 120 bars × 2 `some`
calls × 2 arrays ≈ 58,000 comparisons per refetch or detail toggle. A
`new Set(drawnBars.map(b => b.bar.sliceId))` makes it linear; the same set also
serves `drawnFlags`. `openBar` (`:2611`) is a `drawnBars.find` **outside** any
memo, so it is O(bars) on every shell render, i.e. every scroll frame |
DDD: the memo layer is exactly what `pointed-row-render-cost` design.md D3
specified, and the panel implements it faithfully — `chart`, `placed`, `axis`
keyed on `plan`/`startDate`/`dayPx`, and the pointed row read through
`useSyncExternalStore`.

`gantt-panel.tsx:2745–2855` | 110 | `showSurface`, `showDaySurface`,
`downloadGanttSvg`, the two registration effects |
reuse: `downloadGanttSvg`'s blob-and-anchor-click is "exactly `wbs-table.tsx`'s
`downloadCsv`" by its own comment (`:2790`) — a **second copy** of the
save-a-generated-file gesture, named as such and not shared |
perf: `showSurface`/`showDaySurface` each read one `getBoundingClientRect` on
the pointer gesture, then snapshot it — the right trade (a live measurement
would follow the bar while the card stayed put) |
DDD: the two-effect split for `registerSvgDownload` (a ref kept current every
render, a registration once per host) is a genuinely subtle and correct pattern,
with its own proof.

`gantt-panel.tsx:2855–3540` | 685 | `marksUnderLight` and `marksOverLight` |
reuse: none — this is one render, split in two |
perf: **the SVG node count per row.** Per row: 1 zebra band (odd rows only),
1 row-line hit surface, up to 2 bracket marks, N bar rects + N ticks, plus
per-chart: 1 gridline per axis cell, 1 weekend rect per weekend cell, 2 paths
per arrow, 1 path per link, 1 path + 1 `<title>` per flag, and 1 `<span>` per
bar in `barWords`. For a 60-row, 90-day, 120-bar plan with 40 edges: ~90
gridlines + ~26 weekend rects + 30 bands + 60 row lines + 240 bar marks + 80
arrow paths + ~40 link paths + 120 label spans ≈ **690 elements**, all
re-created whenever the memo invalidates. `marksOverLight`'s deps (`:3504–3527`)
are **23 entries** including `fullScreen`, `open?.sliceId`, `plan`, `today`,
`pad` — the memo is therefore invalidated by opening a hover card and by
entering full screen, neither of which changes a mark |
DDD: the split _is_ the design doc's D3 and each half carries the probe that
proves it ("`pointedRow` added to this memo's dependencies … failed on
`expected 4 to be +0`"). Exemplary R5. The gap is that the enumeration covered
`pointedRow` and not the other two per-gesture deps.

`gantt-panel.tsx:3540–3620` | 80 | `barWords` |
reuse/perf/DDD: memoised on `[dayPx, drawnBars]` — the tightest dep list in the
file, and the right one.

`gantt-panel.tsx:3620–4376` | 756 | the JSX shell — scrollport, label rail, axis
row, the `<svg>` with the pointed band between the two mark memos, the fade cue,
the two hover cards, the controls strip, the scale ladder, full-screen layer |
reuse: the label rail's `<button>` (`:3752`) duplicates the pointing contract
the row-line rect implements in SVG (`:3011`) — `onPointerEnter`/`Leave`/
`onFocus`/`onBlur` writing `onPointRow`, four handlers each, two places |
perf: `chart.labels.filter(l => l.id === pointedRow)` (`:3960`) is an O(rows)
scan on every pointed change to draw one band — a `find` on an id→index map
would be O(1), and the map already exists inside `layOutGantt` |
DDD: the controls strip being a **sibling** of the scroll box, with the
five-`pixels`-cases proof of what happened when it was welded between the handle
and the panel (`:4180–4230`), is knowledge that could only live here.

### `gantt-fault.tsx` — 116 LOC

role: the error boundary that catches `GanttDataError` and resets on a new read. |
reuse: **`faultWords` and `NO_MESSAGE` are byte-identical to
`chrome/app-fault.tsx:3–7`.** Two class boundaries with the same three lifecycle
methods, differing in the fallback element and in this one's
`getDerivedStateFromProps` generation reset. Deletion test: `faultWords` deletes
outright into `lib/fault-words.ts`; the boundaries collapse into one
`FaultBoundary({ resetKey, fallback })` at ~80 LOC saved |
perf: none |
DDD: the generation reset ("the next read of it draws the chart again") is the
right coupling to `GanttProps.generation`.

---

## 3 · The mobile face and the plan modules

### `plan-cards.tsx` — 2,557 LOC, section by section

`plan-cards.tsx:1–110` | 110 | imports, `CardRow`, `CardAssignee`,
`DependencyEntry`, `PlanCardsProps` |
reuse: `PlanCardsProps` takes **39 props**, of which 20 are per-row reader
functions (`waitsFor`, `startFloor`, `teamLabel`, `tagLabel`, `serviceLabel`,
`spanOf`, `showDay`, `assigneeOn`, `nonOwner`, `estimateValue`,
`estimateProblem`, `mentionOptions`, `dependencyOptions`, …). Every one of them
is a closure built in `WbsTable`. That is the **card renderer's whole interface
to the plan**, and it is 39 positional facts rather than one `PlanReading`
adapter — the same 20 readers the table's own cells use |
perf: none (types) |
DDD: `CardRow` carries `matched` and `toggleBranch` — the row model and its
narrowing state travel together, which is right.

`plan-cards.tsx:392–570` | 178 | `cardRowActions`, `cardSpanTitle`,
`inertParallel`, `cardSlackOf`, `cardMismatchesOf`, `trioPoint`, `trioFinal`,
`cardTrioOf`, `TAP`, `MATCH_TINT` |
reuse: `cardTrioOf`'s "points, then `estimated`, then the `· `-joined line"
(`:554`) is re-derived inside `CardTrioField` (`:1842–1844`) and again in
`folded-step-card.tsx:44–46`. **Three copies of "how a trio reads as words"** |
perf: `cardMismatchesOf` builds a `Set` per row per render over `steps` |
DDD: `cardSlackOf` returning `{ text, critical, hint }` — the reading and its
explanation in one value — is the right shape.

`plan-cards.tsx:615–1130` | 515 | `CardTeamField`, `CardServiceField`,
`CardTagsField`, `CardNotBeforeField` |
reuse: **the triplication, confirmed at the card tier.** `CardTeamField`
(`:615–697`), `CardServiceField` (`:724–800`) and `CardTagsField` (`:816–915`)
are the same 80 lines three times: `useState(open)`, `useTriggerAboveSheet`, an
inherited-note string, a `<button>` with `${TAP} text-muted-foreground
inline-flex max-w-full min-w-0 …` and a `↳` prefix for the inherited state, and
a `<ReferenceSetSheet>` with a `{ kind, entries, ownIds, inheritedLabel,
replace, create }` adapter. They differ in three attribute names, one singular
vs plural, and the wording. `ReferenceSetSheet`'s adapter is **already the
generalisation** — the three components are the missing last step
(`<CardReferenceField kind="team" …>`). This is the same finding as
`directory-page.tsx:573–1234` and `gantt-geometry.ts:176–283`, at a third tier |
perf: three `useState` per row per dimension — 3 extra components per card |
DDD: the one real difference — a tag's set **accumulates** and a team's
**replaces** — is not what the three components encode; it is encoded upstream in
the label types. So the split buys nothing the domain asked for.

`plan-cards.tsx:1130–1320` | 190 | `useTriggerAboveSheet` |
reuse: none |
perf: **a `requestAnimationFrame` spin loop of up to 600 frames** (`:1237–1244`),
each iteration running `document.querySelectorAll('[data-modal-surface=bottom]')`
plus a `getBoundingClientRect` per candidate, then a second rect read, waiting
for two consecutive frames to agree. Once settled, `place()` re-runs on every
`ResizeObserver` tick and on `window`/`visualViewport` resize, reading two more
rects and writing `container.scrollTop`. On a phone opening a sheet with the
soft keyboard animating, that is ten seconds of budgeted per-frame forced
layout. It is the heaviest layout-thrash site in the sweep. A `transitionend` on
the sheet, or Radix's own `onOpenAutoFocus`, would replace the spin |
DDD: the 60-line JSDoc explains _why_ a `ResizeObserver` alone cannot see the
sheet's first geometry. The knowledge is right; the mechanism is a poll.

`plan-cards.tsx:1321–1990` | 670 | `CardPriorityField`, `CardDependsField`,
`CardTrioField` |
reuse: three more copies of the `useState(open)` + `useTriggerAboveSheet` +
trigger-button + `Modal` shell — five in total with the three above |
perf: `CardDependsField` holds `adding`/`removing` id sets per row |
DDD: `CardPriorityField` reading its colour through
`priorityBandStyleOf` (the one resolution) rather than a local map is correct.

`plan-cards.tsx:1988–2557` | 570 | **`PlanCards`** |
reuse: none new |
perf: **the mobile counterpart of the pointed-row problem, and it is unaddressed.**
`PlanCards` is not `memo`ised, holds `openActionsRowId` at the top (`:2034`), and
its body is one `rows.map` (`:2049`) that calls **eight per-row reader props**
(`waitsFor`, `startFloor`, `teamLabel`, `tagLabel`, `serviceLabel`, `spanOf`,
`cardSlackOf`, `cardMismatchesOf`) and then a nested `steps.map` (`:2161`)
calling **five more per step** (`estimateProblem`, `mentionOptions`,
`assigneeOn`, `cardTrioOf`, `showTrio`). For 60 rows × 2 steps that is
480 + 600 = **1,080 reader calls per render**, and every render of `WbsTable`
re-renders every card — including opening one row's `⋯` menu, which sets state
at the top of this component. `startFloor(row)` in particular is a lookup into
the map `startFloorByRow` rebuilds unmemoised per `WbsTable` render (see §2).
There is no row-level shell equivalent to `PlanRow`; the cards face got none of
`pointed-row-render-cost`'s benefit |
DDD: `data-grid` on the card list so `editable-grid.ts` finds it (`:2040`) — the
two renderers share one focus/readiness contract. That is the deep part, and it
is why a `memo(PlanCard)` needs the same `live.current` argument D2 makes for
the table.

### `table-frame.ts` — 1,481 LOC

role: **all** the plan's layout arithmetic — column widths, floors, clamps,
pinned offsets, indents, and the `CSSProperties` constants both renderers use. |
reuse: this is the shared module the two renderers agree through
(`hierarchyIndentFor` used by the table _and_ `gantt-panel.tsx:3757`,
`cardIndentFor` by `plan-cards.tsx:2054`). The gap noted in §2 is the other
direction: `gantt-panel.tsx`'s `clampedGanttHeight`/`ganttRoomInColumn`/
`appliedGanttHeight` are the same kind of arithmetic and live elsewhere |
perf: **the module reads no DOM at all** — no `getBoundingClientRect`, no
`ResizeObserver`, no scroll handler, no `getComputedStyle`. Every width is
declared. That is the deepest single decision in fe-01's rendering: the table
never measures. The cost that remains is allocation —
`flexibleCellStyle(columnId, state)` and `pinnedCellStyle(layout, columnId, kind)`
each return a **fresh object literal** and are called **per cell per render**
(`wbs-table.tsx:11999–12000`), so a 60×20 grid allocates 2,400 style objects per
render and hands React a new `style` prop identity for every `<td>`. Interning
them on a `Map` keyed by `(columnId, kind, stateHash)` would make the `style`
prop referentially stable, which is what lets React skip the attribute diff.
`flexibleCellStyle` is also the function `pointed-row-render-cost`'s D4 probe
counts, so the probe and the fix meet at the same symbol |
DDD: `FrameLayoutState`, `ResolvedColumn`, `PinnedGeometry`, `FrameLayout` is a
clean four-type vocabulary. `pinnedGeometryFor` **throwing** when a flexible
column precedes a pinned one (`:916`) — "a sticky offset is a sum of the widths
in front of it" — is an invariant that cannot be defaulted, stated as a throw.
`DAY_ENVELOPE = '20 May 2027 ?'` (`:142`) is a width justified by the widest
string it must hold. The only smell is size: 1,481 lines is three concerns
(widths, pinning, CSS constants) that would read as three files.

### `plan-export.ts` — 841 LOC

role: `PlanExport`/`ExportRow` and the Markdown + CSV writers. |
reuse: `nameOf(entries, id)` (`:323`) is **line-for-line identical** to
`plan-mermaid.ts:151`. `markdownCell` (`:315`) is the escaper the audit pairs
with be-01's `project.controller.ts:41` — this sweep confirms the fe-01 side and
adds that `csvField` (`:301`) has a **formula-injection guard**
(`FORMULA_LEADERS`) that the Markdown writer has no equivalent of and does not
need, so the two escapers are correctly different **from each other** and wrongly
different from be-01's |
perf: `nameOf` is `entries.find` — O(vocabulary) per cell. `labelCell` (`:489`)
additionally does `plan.rows.find(each => each.id === effective.fromId)` —
O(rows) per labelled cell, over three dimensions. A 500-row plan with inherited
labels is ~750,000 comparisons per export. Two `Map`s built once in `columnsOf`
make it linear. Export is a gesture, so this is a "fix while you are there" |
DDD: `FilteredScope` and the `Scope` header line, so a narrowed export says what
it is rather than silently shipping a plan with rows missing, is the right
answer to a real hazard.

### `plan-mermaid.ts` — 556 LOC

role: the plan as a Mermaid gantt, plus the Markdown document around it. |
reuse: `nameOf` duplicated from `plan-export.ts` (above); `mermaidPhrase` and
`mermaidComment` are a **third and fourth escaper** beside `csvField` and
`markdownCell` — four escapers in two files, each correct for its target |
perf: `tasksOf`'s sort comparator (`:325–338`) calls
`sectionOf(...)` **twice per comparison**, and `sectionOf` in `outline` mode
walks `outermost(row, byId)` up the tree. For N slices that is
2 × O(N log N) tree walks where one pass computing the section per slice would
do. Concretely: 120 slices ≈ 1,660 comparisons ≈ 3,320 tree walks per export |
perf (2): `scale.startOf` per slice (`:342`) — the `addWorkdays` loop again |
DDD: `fenceFor` (`:494`) — the fence is as long as the longest backtick run
plus one, so a plan whose notes contain a fence cannot break the document. Small
and exactly right. `NOT_ON_A_CALENDAR`/`NO_SCHEDULE_TO_DRAW`/`NOTHING_PLACED`
as three named refusals rather than one empty string is good modelling.

### `plan-renderer.ts` — 108 LOC

role: which face the viewport gets. |
reuse: none |
perf: `useSyncExternalStore` over `window.resize` with a `getSnapshot` that
reads `innerWidth`/`innerHeight` — **two layout reads per resize event per
subscriber**, and the snapshot returns a new value only when the bucket flips,
so React bails. Clean |
DDD: `rendererForViewport(width, height)` pure and separately testable, with
`CARDS_BELOW` and `TABLE_NEEDS_HEIGHT` named — the two thresholds are also
written in `styles.css:1382` as `767.98px` / `499.98px`, which is one fact in
two languages. `styles.css` says so; a generated custom property would close it.

### `plan-scroll-link.ts` — 296 LOC

role: keeps the table and the chart on the same row while either scrolls. |
reuse: `rendererFace` and `panelFace` are two adapters onto one `PlanFace`
interface — the right shape |
perf: **the second-hottest scroll path.** `linkPlanScroll`'s `follow` builds
**both faces on every scroll event**: two `querySelector` + two `querySelectorAll`
over the live DOM, then `alignmentMove` runs a binary search calling
`face.at(mid)` — a `getBoundingClientRect` per probe, ~6 for 60 rows — on the
driver, plus one more on the driver and one on the follower. So one wheel tick
costs ~2 `querySelectorAll` + ~10 forced layout reads, then writes
`followerPort.scrollTop` and **reads it back** (`:283`) to detect the echo,
which forces layout again. Unthrottled, no `rAF`. The listeners are `passive`,
so the input thread is not blocked, but the main thread pays per event. Caching
the node lists per layout generation and batching into a `rAF` would make this
~1 read per frame |
DDD: `firstShownIndex` as a **binary search** rather than a scan (`:52`) is the
one place the sweep found deliberate algorithmic care, and `alignmentMove`
returning `null` for "already settled" rather than `0` is the right modelling of
"nothing to do".

### `plan-completeness.ts` — 101 LOC

role: **Estimate gaps** — which leaves miss which steps. |
reuse: `parentIds` is computed here from `workItems`, and the same
"which rows are leaves" question is answered in `gantt-geometry.ts`
(`row.leaf`), in `plan-export.ts`, and in `wbs-rows.ts`. Four readings of one
domain fact |
perf: `perStep` (`:47`) is `steps.flatMap(step => leaves.filter(l =>
l.missingStepIds.includes(step.id)).length)` — O(steps² × leaves) in the worst
case. A single counting pass over `leaves` incrementing a `Map<stepId, count>`
is linear. Small plans hide it |
DDD: `LeafGap` / `StepGap` / `EstimateGaps` names the domain exactly
(`CONTEXT.md`: "**Estimate gap**: One leaf work item and one step it holds no
estimate for"). `describeGaps` separate from `findEstimateGaps` — the reading
and its words apart. Model file.

### `tree-search.ts` — 475 LOC

role: the filter's criteria, its words, and the narrowing. |
reuse: `RowFacets` and `FilterCriteria` are the same eleven dimensions twice —
one as "what this row carries", one as "what is being asked for". They are
genuinely different (`priorityBand: string | null` vs `priorityBands: string[]`),
so this is a defensible pair, but `carriesAnyChosen` being called eight times
with hand-matched field pairs (`:262–275`) is where a drift will happen: adding a
twelfth facet means editing five places (`RowFacets`, `FilterCriteria`,
`NO_FACETS`, `anyFacetChosen`, `matches`, `filterWords`) — six, in fact |
perf: `carriesAnyChosen` uses `chosen.includes(each)` — O(chosen × carried) per
facet per row, so `narrowTree` is O(rows × facets × chosen × carried). With
chosen sets of ≤5 that is fine; a `Set` per facet built once would make it
O(rows × facets). The ancestor walk (`:290`) is O(matches × depth) with a
`steppedOn` cycle guard, and the descendant flood is a proper BFS with a `walked`
set. `expandedOverlay: Object.fromEntries([...visibleIds].map(…))` allocates an
object of every visible id **per keystroke** — for a 500-row plan that is a
500-key object per character typed |
DDD: `NO_FACETS`/`NO_FILTER` as named empty values, and the `isFiltering`
predicate, are right. `TreeNarrowing { visibleIds, matchIds, expandedOverlay }`
distinguishes _matched_ from _shown-because-an-ancestor-matched_ — the
distinction the tint depends on.

### `project-picker.ts` — 121 LOC

role: **Project entry** / **Entry meta** and the picker's match. |
reuse: `matchingProjects` is a lowercase `includes` filter; `directory-page.tsx`
and the creatable pickers each have their own. Small |
perf: `matchingProjects` runs per keystroke over the project list — linear,
correct |
DDD: `entryMeta` and `projectCardMeta` map exactly onto `CONTEXT.md`'s
**Entry meta**; `shortInstant` for an epoch and `shortIsoDate` for a plan day,
with the zone rule stated. Clean small module.

### `project-page.tsx` — 799 LOC

role: picks a project, remembers it, renames it, hands it to `WbsTable`. |
reuse: `PROJECT_KEY` + `rememberProject` is the eleventh localStorage site
(read at `:321`, write/remove at `:66`) — the trio's simplest form, with no
claim-validation, because the claim is validated against the fetched list
instead. Defensible and worth keeping as the shape the extraction must support |
perf: `load()` (`:311`) re-reads the whole project list after a rename and after
a create — correct, small. `const now = new Date()` per render (`:446`) with a
comment saying why. `ProjectOptionCard` isolated so its scroll listener does not
re-render the table (`:112`, with the two regressions named) — a deliberate,
proven render boundary and the model for what `PlanCards` needs. `entries`,
`highlighted`, `cardEntry` are recomputed per render (three `find`s over a
project list) — immaterial |
DDD: the rename state carrying `projectId` rather than trusting the selection
(`:263`, "arming a rename and then creating a project sent the old draft to the
new project") and `openProject` firing on the **selection** rather than the click
(`:354`) are two real domain decisions with their incidents attached. The
`readOnly`-not-`disabled` combobox argument (`:527`) is the third. Excellent
module; its only structural cost is that the header, the picker, the rename and
the page shell are one 570-line function.

### `project-settings-modal.tsx` — 433 LOC

role: the four settings sections, the dirty-section gate, the remembered tab. |
reuse: `rememberedSettingsSection`/`rememberSettingsSection` (`:63–73`) is the
**tenth** localStorage site, and the one variant that stores a **bare string**
rather than JSON — so its `claimed` step is `isSettingsSection(stored)` with no
parse. That inconsistency is exactly what a shared
`remembered<T>(key, isT, fallback)` would settle |
perf: `reporterFor` memoised so each panel's `useEffect([onDirtyChange])` runs
once (`:182–210`) — a correct and non-obvious stabilisation |
DDD: `dirtyRef` (a `Set`, for the close check that must be synchronous) beside
`dirtySections` (state, for the render) is two representations of one fact, and
the module says why. Acceptable; a `useSyncExternalStore` store would be one.

### `steps-panel.tsx` — 571 LOC | `teams-panel.tsx` — 398 | `priorities-panel.tsx` — 298 | `estimating-panel.tsx` — 281

role: the four settings sections. |
reuse: **four copies of the same panel skeleton.** Each holds
`busy` + `problem` state, computes a `dirty` boolean, and writes the identical
pair of effects:
`useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange])` plus
`useEffect(() => () => { onDirtyChange(false); }, [onDirtyChange])` —
`teams-panel.tsx:162–171`, `priorities-panel.tsx:157–166`,
`steps-panel.tsx:207–216`, `estimating-panel.tsx:124–133`, byte-identical.
Each then has an `attempt`/`write`/`save` that is `setBusy(true)` →
`setProblem(null)` → `await change()` → `await onChanged()` → catch → sentence →
`finally setBusy(false)`. Two hooks —
`useSectionDirty(dirty, onDirtyChange)` and `useSectionWrite(onChanged,
sentenceFor)` — delete ~60 lines and make a fifth section a 3-line skeleton.
Additionally `steps-panel.tsx` (`renamed` + `forgetRename` `:220`) and
`directory-page.tsx` (`renamed` + `forgetDraft` **and** `forgetNameDraft`,
`:363–370` — two identical functions) and `teams-panel.tsx` (`typed` + `forget`
`:145`) are three copies of the rename-draft record |
perf: `priorities-panel.tsx:135` computes `draftsOf(bands)` **inside** a
`.some()` over five drafts — five fresh 5-element arrays per render. Same in
`estimating-panel.tsx:120` (`Object.entries(draftOfWeights(pertWeights))` per
render). Loop-invariant, trivially hoisted |
DDD: `estimating-panel.tsx:139` invents its own refusal sentences inline
(`'That change did not land. Try again.'`) with **no 5xx arm**, making it the
sixth refusal→sentence site and the third distinct 5xx behaviour — the audit
recorded five sites and two sentences; this is the third state.
`teams-panel.tsx`'s `inFlight` map keyed by team with a landing promise (`:132`)
is a real concurrency seam and the only one of the four with one.
`weightsOfDraft` / `ladderOfDrafts` returning `null` for "this draft is not a
value yet" is the right modelling of a half-typed box.

### `folded-step-card.tsx` — 129 LOC

role: the folded step cell's hover card. |
reuse: the trio-as-words line (`:44–46`) is the third copy (see `cardTrioOf`) |
perf: none |
DDD: `SHORTHAND_HELP` exported and shared with the cell — one help string. The
comment on why the assignee note is muted and the complaint is `--destructive`
("colouring them alike would make one of the two a lie") is domain reasoning
about ink.

### `toasts.tsx` — 215 LOC

role: the toast stack and its hook. |
reuse: none — it is the app's one notification seam |
perf: `toastKey(toast)` is `${kind}:${text}`, so pushing the same message twice
replaces rather than stacks (`:38`) — a dedupe that matters precisely because
the eight-request refetch can raise the same failure repeatedly |
DDD: `useToasts` returning `{ toasts, pushToast, dismissToast }` and
`ToastStack` taking them as props — state and render apart, both testable.
`VISIBLE_TOASTS` with a `+N more` rather than an unbounded column. Model module.

---

## 4 · `directory/`, `auth/`, `chrome/`, `presence/`, `smoke/`, `ui/`

### `directory/directory-page.tsx` — 1,406 LOC

role: the whole **Directory** — people, teams, tags, work item types, services,
memberships, the ownership map, and the usage confirmation. |
reuse: the Tag/Service/Work-item-type triplication at `:1079`, `:1160`, `:1246`
is the audit's R2 and is not re-argued. Two additions this sweep found:
(a) `forgetDraft` and `forgetNameDraft` (`:365–370`) are **the same function
body twice**, both called — a pure deletion test, one goes;
(b) `writesFor` (`:290–340`) is already the **table** the five list cards want —
a `Record<DirectoryKind, { rename, remove }>` — so the generalisation exists and
the JSX above it does not use it. A `<DirectoryCard kind entries writes>` driven
by `writesFor` collapses the three copies |
perf: **whole-page re-render per keystroke, confirmed.** `renamed:
Record<string, string>` (`:220`) is one page-level state holding **every**
in-flight rename draft, so typing one character in any name box re-renders all
five lists. Inside that render, each person row runs
`teamsOf(person) = teams.filter(…)` (`:513`) and an
`entries={teams.filter(t => !person.teamIds.includes(t.id))}` (`:827`) —
O(people × teams) — and each team row runs `servicesOf(team)` (`:691`) and
`people.filter(p => p.teamIds.includes(team.id)).length` (`:694`) —
O(teams × (services + people)). For 200 people × 20 teams that is ~8,000
comparisons **per character**. Lifting the draft into each row's own component
(the `ProjectOptionCard` pattern from `project-page.tsx:112`) fixes it outright.
Second: `attempt()` (`:342`) re-reads the **whole directory in five parallel
requests** after every write — no patching, same shape as the plan's eight.
Third: `read()` is re-fired on **`window.focus` and every `visibilitychange`**
(`:297–320`), so alt-tabbing back to the tab costs five requests every time,
with no staleness check |
DDD: `effectSentence(effect, on)` (`:121`) is the one place a `DirectoryEffect`
becomes words, and it answers all five arms — the counterpart to
`wbs-api.ts`'s `isDirectoryEffect`, and the two are the reason the tag-removal
defect was found. `Confirming` carrying the usage it was refused with, so the
second ask agrees to something it has seen, is `CONTEXT.md`'s **Directory
usage** implemented literally.

### `auth/auth-form.tsx` — 78 LOC

role: password sign-in plus the SSO link. |
reuse: reads `FormData` rather than holding two controlled `useState`s —
the only uncontrolled form in the app, and the right call for two fields |
perf: none |
DDD: the catch flattens every failure to `'Username or password is incorrect.'`,
which discards `EDGE_UNAUTHORIZED` — the exact code `lib/api.ts:29–37` goes to
some length to distinguish, with an incident written on it. So the edge-vs-app
401 distinction is computed and then thrown away at its only consumer.
**A real defect, one line.**

### `chrome/app-fault.tsx` — 109 LOC

role: the outermost boundary. |
reuse: `faultWords` + `NO_MESSAGE` duplicated with `gantt-fault.tsx` (see §2) |
perf: none |
DDD: `App` split so the boundary is outermost with nothing above it that can
throw (`app.tsx:14–30`) is the right structure, argued in place. Reload-not-retry
is a decision, stated.

### `chrome/account-menu.tsx` — 260 LOC

role: the account menu — roving tabindex, outside-press close, Escape/Tab. |
reuse: a **fourth** popup-dismissal mechanism in the app, beside
`ui/modal.tsx` (Radix Dialog), `close-on-outside-pointer.ts`
(`pointerdown`, capture, `<details>`-specific, one caller) and
`gantt-panel.tsx`'s full-screen `focusin` trap. This one uses `mousedown`
without capture (`:34`). Four surfaces, four contracts for "the pointer went
somewhere else" |
perf: none |
DDD: `SIGN_OUT_AT`/`ITEM_COUNT` derived from `THEME_CHOICES.length` so adding a
fourth theme does not desync the roving index — a small, real invariant.

### `chrome/app-header.tsx` — 73 | `chrome/page-nav.tsx` — 52 | `chrome/theme-choice.tsx` — 109

role: the bar's four slots; the two links; the theme radio group. |
reuse: none; `AppHeader` is a pure slot layout and `ThemeChoiceItems` takes an
`itemProps(at)` adapter so the menu owns the roving index — the right seam |
perf: none |
DDD: `AppHeader` taking `nav`/`project`/`presence`/`account` as `ReactNode` is
what lets the picker's state stay in `ProjectPage`. Clean.

### `presence/presence-panel.tsx` — 113 LOC

role: who else is in the project. |
reuse: **it opens its own `WebSocket` by hand** (`:16`) to the same gateway
`project-stream.ts` already manages — so every browser holds **two** sockets per
project, subscribes twice, and this one has **no reconnect at all**: a dropped
connection sets `status: 'closed'` and stays there until the project changes.
`project-stream.ts` has the backoff, the jitter, the resume and the settle-on-ack
logic; this has none of it. The seam to reuse is `ProjectStreamDeps.openSocket`
plus a `presence` frame handler |
perf: two sockets, two subscriptions, one gateway |
DDD: `Status = 'connecting' | 'open' | 'closed'` shown to the reader in the
heading is honest; it is just permanently wrong after the first drop.

### `smoke/d3-smoke.tsx` — 12 LOC | `smoke/table-smoke.tsx` — 44 LOC

role: framework tracers from the spike. |
reuse: **both are dead** — nothing outside `src/components/smoke/` imports
`D3Smoke` or `TableSmoke`, and neither has a test. `d3-smoke.tsx` is the only
importer of `d3-scale` in the app, and `d3` + `@types/d3` are still
`devDependencies` (`package.json:68, 77`). Deletion test: both delete, and two
dependencies go with them |
perf: none (unreachable) |
DDD: they document that the spike happened; `docs/` is where that belongs.

### `ui/modal.tsx` — 197 LOC

role: the Radix Dialog vendoring, four sides, the shortcut suspension. |
reuse: `ModalClose` and `ModalOverlay` are exported and used **nowhere** outside
this file; `ModalFooter` has exactly one caller (`directory-page.tsx`) |
perf: `PageShortcutsHeld` renders `null` purely to run a hook inside the portal
(`:37`) — a component as an effect-scoping device. Correct and cheap |
DDD: `data-modal-surface={side}` is what `plan-cards.tsx`'s
`useTriggerAboveSheet` finds the sheet by — an undeclared contract between two
modules, discoverable only by grep. Worth a line of JSDoc naming the consumer.

### `ui/page-shortcuts.ts` — 132 LOC

role: suspends the page's keyboard while a surface owns it. |
reuse: `KEYBOARD_OWNING_SURFACE` is the app's one definition of "a surface that
owns the keyboard" — the right place for it |
perf: one capture-phase `keydown` listener while open |
DDD: `isWindowShortcut` vs `isPageShortcut` — a modal still honours the window's
keys and swallows the page's. That distinction is the whole module.

### `ui/button.tsx` — 87 | `ui/card.tsx` — 66 | `ui/input.tsx` — 35 | `ui/label.tsx` — 36

role: the shadcn primitives. |
reuse: `CardDescription` and `CardFooter` have **no callers** — deletion test,
both go |
perf: `cn(buttonVariants({variant,size}), className)` runs `clsx` +
`twMerge` **per render per button**; `twMerge` is the expensive half and is
uncached here. On the plan page with an `⋯` button and a caret per row that is
~120 `twMerge` calls per render. `tailwind-merge` ships an LRU that a
module-level `extendTailwindMerge` would enable; or the row-level buttons could
take a precomputed class string |
DDD: `Hintable`/`Factable` mixed into `ButtonProps` and `InputProps` so every
control can carry `data-hint`/`data-fact` — the hint layer's contract in the
type system rather than in prose. Good.

---

## 5 · `src/db/`, entry points, config, stylesheet

### `db/config.ts` — 28 LOC (+ `db/config.test.ts` 26)

role: `DbMode`, `DbConfig`, `createDbConfig`. |
reuse: **nothing in `src/` imports it** — `grep` finds only its own test. It is
the shell of a local-first/server-sync design (`getJwt`, `wsUrl`, `httpBaseUrl`)
that the app did not take: the real client is `httpProjectApi(token)` with a
`x-wbs-token` header and same-origin paths, and the socket URL comes from
`lib/api.ts:websocketUrl()`. So `db/` is a **third, dead, source of truth about
how this client reaches the server** |
perf: none (unreachable) |
DDD: a `src/db/` directory with no database in it is the most misleading
signpost in the tree — an agent asked to "look at the client cache" will find
this, read `mode: 'local'`, and reason about a store that does not exist.
Deletion test: it deletes; its test deletes with it.

### `app.tsx` — 167 LOC

role: the auth gate, the theme provider, the fault boundary, the two session slots. |
reuse: none |
perf: **the first paint waits on `fetchMe()`** and renders `Loading…` until it
resolves (`:88`) — with no code splitting below it (see `app-router.tsx`), the
whole bundle including `WbsTable`, `GanttPanel`, `plan-cards`, Radix and
`react-markdown` is parsed before the sign-in form can be shown |
DDD: `ThemedAccountMenu` reading the theme through `useThemeChoice` rather than
a prop, because the router freezes context elements (`:32–45`), is a real
framework hazard caught and documented.

### `app-router.tsx` — 124 LOC

role: two routes under the gate, context-carried session. |
reuse: none |
perf: **no code splitting at all.** `DirectoryPage` and `ProjectPage` are static
imports (`:11–12`); there is no `lazy`/`React.lazy`/dynamic `import()` anywhere
in `src/`. `vite.config.ts` sets no `build.rollupOptions.output.manualChunks`
and no `chunkSizeWarningLimit`, so the output is one app chunk containing the
11k-line `WbsTable`, the 4.4k-line `GanttPanel`, the 2.5k-line `PlanCards`, the
1.4k-line `DirectoryPage`, Radix Dialog, `react-markdown` + `remark-gfm`, and
`@tanstack/react-table`. Three cheap, independent splits:
`/directory` as a lazy route; `GanttPanel` + `gantt-geometry` behind a
`lazy()` (the chart is closed by default); `PlanCards` behind the
`useRendererForViewport` branch, which already knows which face is needed |
DDD: mounting the router **below** the gate so a signed-out `/directory` is the
form with the address left alone (ADR 0004) is stated and tested. Route
components taking no props and reading context is the right shape.

### `main.tsx` — 14 LOC. Correct. `StrictMode` on, which is what makes the

render-count probes measure deltas rather than absolutes (design.md).

### `vite.config.ts` — 190 LOC

role: dev proxy, the ten `@wbs/domain/*` module aliases, server, build. |
reuse: the alias map is **duplicated in `vitest.config.ts`** — ten entries,
twice. The duplication is _guarded_ (`vite-config.test.ts` compares the two as
sets, after it silently drifted three times), which is R5 done right, but a
shared `domain-aliases.ts` imported by both would make the guard unnecessary |
perf (build): no `manualChunks`, no `target`, no `cssCodeSplit` tuning, no
`rollupOptions`. `build: { outDir, emptyOutDir }` and nothing else |
DDD: the module-not-barrel rule with the arktype argument, and the three watched
`rootDir`/`noEmit` outcomes (`:100–130`), is the best build-config JSDoc in the
repo. The `'^/api/'`-as-regex-not-prefix note (`apiary`) is a real trap
documented.

### `vitest.config.ts` — 105 LOC

role: jsdom, globals, setup, includes. |
reuse: the ten-alias duplication above |
perf: **no pool or worker configuration at all** — no `poolOptions`,
no `maxWorkers`, no `isolate: false`, no `test.pool`. The audit's 185-second run
is 552 serial tests in one file plus the rest; nothing here would let the other
files spread. Adding `poolOptions.threads.singleThread: false` changes nothing
while one file dominates, which is why the audit's L3 (split
`wbs-table.test.tsx`) is correctly ordered before any config change |
DDD: the comment recording that the alias list drifted **three times**, each
time producing "N files failed to collect, 8xx tests still passed" — "the count
is the tell, not the colour" — is the single most useful sentence in the repo's
test infrastructure.

### `vitest.setup.ts` — 157 LOC

role: four environment stand-ins — `localStorage`, `matchMedia`,
`window.scrollTo`, `getComputedTextLength`. |
reuse: none |
perf: none |
DDD: every stand-in is installed **only when missing**, each carries the date it
was probed, and `DriveableMediaQueryList.listenerCount` exists specifically
because "driving the list proves a subscription arrived; nothing a driven list
does can prove one left". That is R5 applied to the test environment itself.

### `playwright.config.ts` — 310 LOC | `playwright.packaged.config.ts` — 85

role: the browser gate (three servers) and the packaged gate (Caddy in Docker). |
reuse: the two configs share the run-from-root guard shape and nothing else;
fine |
perf: **`fullyParallel: false, workers: 1`** for 18 specs. The reason is
structural, not a setting: the three servers share one SQLite file and the
**Directory** is global to a deployment, so two specs adding a tag race. The
seam that would unlock parallelism is a per-worker database (`DB_PATH` is
already parameterised at `:96`) plus per-worker name prefixes — which is also
what the audit's "e2e has 18 specs and one shared helper" wants. `E2E_PORT_SHIFT`
already proves the ports can move |
DDD: the port-collision refusal (`:26–34`) explains _why_ 100/1000/1100 are
forbidden shifts, and the run-from-root throw names the exact command to use.
`reuseExistingServer: !isCi` is the documented landmine, and it is documented.

### `styles.css` — 1,476 LOC (82 rule blocks)

role: the tokens, the scoped grid reset, the cell/row painting, the mobile
tap-target floor. |
reuse: `--cell-bg` as "the join between the two systems" (`:469–474`) — inline
styles from `table-frame.ts` write `background: var(--cell-bg, …)` and this file
re-points `--cell-bg` on the `<tr>` — is a genuinely deep seam: one custom
property lets the cascade paint pinned cells that no `tr:hover` selector could
reach. `--grid-dep-lit` / `--card-dep-lit` name the same light on two surfaces |
perf: **no `*` selector rules and no universal transition** — the only `*` is
Tailwind preflight, and `:7–24` documents that the reset is scoped by
`[data-grid]` and that inheritance still crosses. What _is_ there:
(a) `[data-grid] th, [data-grid] td { transition: background-color 100ms ease; }`
(`:601–607`) — a transition on **every cell in the plan**. `background-color` is
a paint property, not compositable, so a pointed-row change repaints ~20 cells
for 100ms on the row entered _and_ the row left. Combined with the `--cell-bg`
mechanism, a pointed change invalidates the computed style of every `<td>` in
two rows and animates them. `pointed-row-render-cost` measured and fixed the JS
(75–120ms); this is the style-recalc-and-paint half it did not touch, and it is
the cheapest remaining win on that gesture (shorten to ~60ms, or drop the
transition on the pinned columns);
(b) five `[data-grid] tbody tr:hover td[data-column='…'] …` descendant rules
(`:1006`, `:1014`, `:1207`, `:1211`) that force a style recalc over the row's
subtree per pointer move;
(c) `.wait-ring-fill` is a **CSS animation** explicitly chosen over per-frame
React state (`:1298–1311`) with the reason written on it — the right instinct,
and the counter-example to (a);
(d) `@media (prefers-reduced-motion: reduce)` honoured for the ring (`:1325`)
but **not** for the cell transition |
DDD: `--grid-match`, `--grid-band`, `--grid-hover`, `--grid-drop`,
`--grid-dep-lit` — each light in the plan is a named token, and the specificity
chain that decides which wins (`:663–748`, with `data-row-lit` walking into the
`:hover` chain twice and the guard that stopped it) is documented at the exact
selector. The `767.98px` / `499.98px` breakpoints (`:1382`) restate
`plan-renderer.ts`'s `CARDS_BELOW` / `TABLE_NEEDS_HEIGHT` — one fact, two
languages, no guard.

---

## Deepening candidates (this area)

### 1 · Stop refetching the world after every write

**Files** `lib/wbs-api.ts:2016` (`tree`), `lib/project-stream.ts:113`,
`components/wbs/wbs-table.tsx:3671–3775` (`refresh`),
`components/directory/directory-page.tsx:256, 342`.
**Problem** Every write and every socket frame from any peer fires eight
parallel HTTP requests, five of which are the global **Directory** that no plan
write can change; the answer replaces the whole plan in state. A held arrow key
is one request and one eight-request refetch per repeat. The directory page does
the same with five, and additionally re-reads on every `window.focus` and
`visibilitychange`. There is no request de-duplication, no stale time and no
cache anywhere in the app.
**Solution** Give `wbs-api.ts` a small read seam: an in-flight map so two
concurrent asks for the same URL share one promise, and a stated freshness for
the five directory vocabularies (they change on the order of days, not
keystrokes) so a plan refetch reads the plan and reuses the vocabularies. Leave
"the plan is replaced, never patched" exactly as it is — that decision is right
and `project-stream.ts` argues it well.
**Benefits** _Locality_: "how fresh is a vocabulary" becomes one answer in the
adapter instead of an implicit consequence of `Promise.all` in a component.
_Leverage_: every write path, every socket frame and both pages get it at once.
_Tests_: the seam is a counter — "a peer edit costs one request, not eight" is a
check that fails today, which is what R5 asks for.
**Effort** ~1 day. **Risk** low — no change to what is read, only to how often.

### 2 · One `remembered<T>` seam for the eleven localStorage sites

**Files** `lib/theme.ts:60–120` (the canonical trio),
`components/wbs/gantt-panel.tsx:663–725` (a line-for-line copy),
`components/wbs/project-settings-modal.tsx:63–73` (an unparsed variant),
`components/wbs/project-page.tsx:65–67`, and the eight in
`wbs-table.tsx:726–1411` the audit already counted.
**Problem** The audit found eight copies plus a ninth; this sweep found a tenth
and an eleventh, and — more usefully — found that `theme.ts` already holds the
_correct_ shape: a read-and-drop for effects, a pure read for render (so a lazy
`useState` initialiser is not a write), a parse step, and a write. Two of the
eleven get that split right; the rest vary.
**Solution** `lib/remembered.ts` exporting
`remembered<T>(key, isT, fallback)` → `{ read(), readAndDrop(), write(v),
forget() }`. Migrate `theme.ts` first (it is the reference), then `gantt-panel`,
then the settings modal, then the eight.
**Benefits** _Locality_: the "a stored value is a claim, not a fact" rule is
stated once. _Leverage_: eleven sites, ~250 LOC, and the next preference is four
lines. _Tests_: one suite covering "refuses a non-`T` and drops the key" replaces
eleven partial ones — and the `readAndDrop`-vs-`read` split becomes a property
the type enforces rather than a comment.
**Effort** ~half a day for the seam plus `theme`/`gantt-panel`/`settings`;
the eight in `WbsTable` ride along with the audit's L5.
**Risk** low. Pair with L5 so `wbs-table.tsx` is touched once.

### 3 · Get the per-gesture dependencies out of the Gantt's mark memos

**Files** `components/wbs/gantt-panel.tsx:3504–3527` (`marksOverLight` deps),
`:2611` (`openBar`), `:2638`/`:2652` (`drawnLinks`/`drawnPoolWaits`),
`components/wbs/gantt-geometry.ts:1372` (`routeArrow`).
**Problem** `pointed-row-render-cost` isolated the _pointed row_ correctly and
its probes prove it. Two other per-gesture values are still in the mark memo's
23-entry dependency list: `open?.sliceId` (a bar's hover card) and `fullScreen`.
So opening a hover card on a bar re-creates every gridline, band, bracket, link
and bar, and re-runs `routeArrow` for every dependency — which is O(bars²) per
arrow. On top of that, `drawnLinks` and `drawnPoolWaits` are O(links × bars)
`some` scans, and `openBar` is an O(bars) `find` outside any memo, so it runs on
every scroll frame.
**Solution** Three local moves, no architecture change: (a) read `open?.sliceId`
through a ref in the bar's `onClick` (it decides tap-vs-navigate in full screen
only) so it leaves the deps, and hoist `fullScreen` the same way; (b) build
`new Set(drawnBars.map(b => b.bar.sliceId))` once and use it for the two link
filters, the flag filter and `openBar`; (c) index `routeArrow`'s obstacles by
row before the candidate loop.
**Benefits** _Locality_: the mark layer's dependencies become "what is drawn",
which is what the design doc says it should be. _Leverage_: the same three
values feed five consumers. _Tests_: extend D4's existing probes — "opening a
bar's facts re-renders no Gantt mark" is the same probe with a different gesture,
and it fails today.
**Effort** ~1 day. **Risk** low; the probes make the boundary breakable.

### 4 · Memoise `startFloorByRow` and cache the calendar scale

**Files** `components/wbs/wbs-table.tsx:10617`,
`components/wbs/gantt-geometry.ts:2361` and `:936` (`calendarScale`),
`libs/domain/src/workday.ts:246` (`addWorkdays`).
**Problem** `startFloorByRow` runs **unmemoised in `WbsTable`'s render body**,
so it re-runs on every keystroke in every cell; it rebuilds six plan indexes and
calls `addWorkdays` twice per leaf. `addWorkdays` is a day-by-day loop
allocating a `Date` per iteration inside a `toUtc` that runs a regex and a
`toISOString` per call. Separately `calendarScale.startOf` calls it once per
mark placement, so `placeOnCalendar` costs tens of thousands of `Date`
allocations per refetch.
**Solution** Two independent fixes. (a) `useMemo(() => startFloorByRow(ganttPlan,
calendar), [ganttPlan, startDate, todayIso])`, taking `todayIso` the way
`gantt-panel.tsx:2540` already does — the `new Date()` argument is the only
thing making it look unmemoisable. (b) Memoise `startOf` on a
`Map<number, number>` inside `calendarScale`, or precompute the workday→calendar
offsets once over the horizon. Neither touches `libs/domain`, so the drift
proofs on `snapWorkdays` stay green.
**Benefits** _Locality_: "the calendar scale is a lookup, not a walk" becomes a
property of `calendarScale` rather than of every caller. _Leverage_: `placeGantt`,
`startFloorByRow`, `plan-mermaid.tsx:tasksOf` and `spanWords` all pay this tax.
_Tests_: a call-count spy on `addWorkdays` is a probe that cannot pass
vacuously.
**Effort** ~half a day. **Risk** low — pure functions, existing suites.

### 5 · Extract the reference-set field, at all three tiers

**Files** `components/wbs/plan-cards.tsx:615–915` (Team/Service/Tags),
`components/directory/directory-page.tsx:1079–1330` (Tag/Type/Service cards),
`components/wbs/gantt-geometry.ts:176–283` (`ServiceTeamLabel`/`TagLabel`/
`ServiceLabel`), `components/wbs/reference-set-field.tsx` (the existing adapter).
**Problem** The same three-dimensional triplication appears at three tiers, and
the audit recorded only the directory one. The generalisation already exists in
two places — `ReferenceSetSheet`'s `{ kind, entries, ownIds, inheritedLabel,
replace, create }` adapter and `directory-page.tsx:290`'s `writesFor` table —
and neither is used by the components above it.
**Solution** One `<ReferenceField kind>` for the cards driven by the adapter that
already exists, one `<DirectoryCard kind>` driven by `writesFor`, and one
`EffectiveLabel<'replaced' | 'accumulated'>` type replacing the three unions.
Keep the tag-accumulates-vs-team-replaces distinction where it belongs — in the
mode, per ADR 0008 — instead of in three copies of the same component.
**Benefits** _Locality_: adding a fifth dimension is a table entry, not three
files. _Leverage_: ~450 LOC in the directory (audit's figure) plus ~200 in the
cards plus ~100 of types. _Tests_: the three copies currently need three test
sets that drift; one parameterised suite over the four kinds replaces them, and
"a tag accumulates where a team replaces" becomes one assertion instead of an
absence.
**Effort** ~2 days. **Risk** medium — three surfaces with e2e coverage; do the
cards first (smallest, newest).

### 6 · Row-level render boundary for the cards face

**Files** `components/wbs/plan-cards.tsx:1988–2557`,
`openspec/changes/pointed-row-render-cost/design.md` (D2).
**Problem** `PlanCards` is unmemoised, holds `openActionsRowId` at the top, and
its body makes ~1,080 per-row/per-step reader calls per render for a 60-row
plan. Every `WbsTable` render re-renders every card; opening one row's `⋯` menu
re-renders all of them. The table got `PlanRow`; the phone face got nothing.
**Solution** Apply D2's shell-and-children split: a `PlanCard` shell owning the
`<article>`, its own actions-menu state and its own subscription, with the fields
arriving as `children`. D2's argument for _not_ memoising rows (cells read ~80
live values through `live.current`) applies here too, so the same shape is the
right one.
**Benefits** _Locality_: a card's open menu is the card's. _Leverage_: the phone
is where the render cost hurts most and where it has never been measured.
_Tests_: reuse D4's probe technique — a spy in `cardTrioOf`, asserting the delta
when one menu opens.
**Effort** ~1.5 days. **Risk** low; identical to a change already shipped.

### 7 · Split the four bundles the router does not split

**Files** `app-router.tsx:11–12`, `vite.config.ts:186`,
`components/wbs/plan-renderer.ts`.
**Problem** No `lazy()` anywhere in `src/`, no `manualChunks`, so one chunk
carries `WbsTable` (11k), `GanttPanel` (4.4k), `PlanCards` (2.5k),
`DirectoryPage` (1.4k), Radix, `react-markdown` and `@tanstack/react-table` —
all parsed before the sign-in form can paint, because `app.tsx:88` blocks the
first render on `fetchMe()`.
**Solution** Three splits the code already justifies: `/directory` as a lazy
route (a second page nobody on the plan page needs); `GanttPanel` +
`gantt-geometry` behind `lazy()` (the chart is closed by default and
`gantt-fault.tsx` is already the boundary around it); `PlanCards` behind the
`useRendererForViewport` branch, which is already a runtime decision. Optionally
`manualChunks` for the vendor half.
**Benefits** _Locality_: each face's cost is its own. _Leverage_: the sign-in
paint, the phone's first load, and the directory page all improve from one
change. _Tests_: `e2e-packaged` already serves the real build through Caddy — a
chunk-count or transfer-size assertion there is a check that can fail.
**Effort** ~half a day. **Risk** low — `Suspense` boundaries, and the two fault
boundaries are already in place.

### 8 · One fault boundary, one refusal table

**Files** `chrome/app-fault.tsx:3–7`, `wbs/gantt-fault.tsx:3–7` (identical
`faultWords` + `NO_MESSAGE`); `lib/wbs-api.ts:1839, 1906, 1954`,
`wbs/estimating-panel.tsx:139`, `wbs/steps-panel.tsx` (via
`stepRefusalSentence`), `wbs-table.tsx:294`.
**Problem** Two boundaries share a duplicated helper and differ only in their
fallback. Six refusal→sentence sites share a shape; three of them have a 5xx arm
with the same sentence, one (`directoryRefusalSentence`) has none, and
`estimating-panel.tsx` has neither a 5xx arm nor a shared table — so the same
proxy 502 reads three different ways. The audit found five sites and two
sentences; this is the sixth site and the third behaviour.
**Solution** (a) `lib/fault-words.ts` + one `FaultBoundary({ resetKey,
fallback })`. (b) One `refusalSentence(code, scope)` where `scope` picks the
noun ("this plan" / "the directory" / "those priority bands"), the shared arms
(`not_found`, `forbidden`, `unexpected_response`, 5xx) live once, and the
prefix-code mechanism (`SIZE_CEILING_CODE` and friends, which read be-01's own
constant out of the code and are the best idea in that file) becomes general.
**Benefits** _Locality_: a new refusal code is one row. _Leverage_: six sites,
two boundaries, ~200 LOC. _Tests_: one table-driven suite; "every refusal a 5xx
can be" becomes a single assertion rather than an absence in four files.
**Effort** ~1 day. **Risk** low; the sentences are user-visible, so pin the
current strings first.

### 9 · Deletion tests — take the dead weight out

**Files** `src/db/config.ts` + `config.test.ts` (nothing imports either);
`components/smoke/d3-smoke.tsx`, `components/smoke/table-smoke.tsx` (dead; the
only importers of `d3-scale`, and `d3`/`@types/d3` are still devDependencies);
`ui/card.tsx` `CardDescription`, `CardFooter`; `ui/modal.tsx` `ModalClose`,
`ModalOverlay` (exported, no external callers);
`directory-page.tsx:365–370` `forgetDraft` **and** `forgetNameDraft` (identical
bodies, both called); `wbs-api.ts:2050–2075` (13 delegation lines that
`ProjectApi extends DirectoryApi` deletes); `wbs-api.ts:1305–1420` vs `:2016–2036`
(the 17-field `tree` shape written twice).
**Problem** `src/db/` is the worst of these: a directory named for a client
database, containing a `DbConfig` with `mode: 'local'` and a `getJwt`, that the
app does not use and whose design it did not take. An agent told to "look at the
client cache" finds it and reasons about a store that does not exist.
**Benefits** _Locality_: the tree stops advertising a design it does not have.
_Leverage_: two dependencies go with the smoke components. _Tests_: `config.test.ts`
is 26 lines testing a function nothing calls.
**Effort** ~1 hour. **Risk** none for the dead code; low for the interface
merge.

### 10 · Take the layout reads off the scroll and sheet paths

**Files** `components/wbs/plan-scroll-link.ts:243–290`,
`components/wbs/gantt-panel.tsx:2266–2280, 3653`,
`components/wbs/plan-cards.tsx:1237–1250`.
**Problem** Three unthrottled forced-layout paths. (a) `linkPlanScroll` rebuilds
both faces per scroll event — two `querySelectorAll` plus ~10
`getBoundingClientRect` plus a `scrollTop` write and read-back. (b) the Gantt's
`onScroll` runs `measureTheFold` (four layout reads) and up to three state
updates per event. (c) `useTriggerAboveSheet` runs a 600-frame `rAF` poll doing
a `querySelectorAll` and two rect reads per frame until a bottom sheet settles —
on a phone, with the soft keyboard animating.
**Solution** Batch (a) and (b) into one `requestAnimationFrame` per frame and
cache the node lists per layout generation; replace (c)'s poll with the sheet's
`transitionend` (or Radix's `onOpenAutoFocus`), keeping the `ResizeObserver` for
subsequent changes. Nothing about what is measured changes.
**Benefits** _Locality_: "when do we measure" becomes one answer per surface.
_Leverage_: the linked scroll is the gesture a planner makes most. _Tests_:
Chromium is the only honest oracle here (`e2e/gantt.spec.ts` already measures
the linked scroll); a `getBoundingClientRect` call-count spy works in jsdom.
**Effort** ~1 day. **Risk** medium — scroll linking is fiddly and its current
echo-suppression is correct; keep `alignmentMove` untouched and change only the
scheduling.

### 11 · Cheap wins, no design needed

**Files/fixes**, each independent and under an hour:
`plan-export.ts:323` and `plan-mermaid.ts:151` — `nameOf` is
`entries.find`, called per cell; build a `Map` once (also removes the duplicate
function). `plan-export.ts:497` — `plan.rows.find` per labelled cell makes
export O(rows²). `plan-mermaid.ts:325` — the sort comparator calls `sectionOf`
twice per comparison over a tree walk; precompute one section per slice.
`plan-completeness.ts:47` — `perStep` is O(steps² × leaves); one counting pass.
`priorities-panel.tsx:135` and `estimating-panel.tsx:120` — `draftsOf(bands)` /
`draftOfWeights(pertWeights)` computed inside a `.some()`; hoist.
`gantt-panel.tsx:3960` — an O(rows) `filter` to draw one pointed band.
`table-frame.ts:1320, 1284` — intern the per-cell style objects so the `style`
prop is referentially stable. `styles.css:601–607` — the 100ms
`background-color` transition on every `<td>`; shorten it, drop it on the pinned
columns, and honour `prefers-reduced-motion` as the wait ring already does.
`auth-form.tsx:26` — the catch discards `EDGE_UNAUTHORIZED`, which
`lib/api.ts:29–37` computes precisely so a person is not sent hunting for a
fault one layer above the app.
**Risk** none to low each. **Effort** ~1 day for all of them.

### 12 · One socket per browser

**Files** `components/presence/presence-panel.tsx:14–47`,
`lib/project-stream.ts`.
**Problem** The presence panel opens a second `WebSocket` to the gateway by
hand, subscribes to the same `project:<id>` a `ProjectStream` is already
subscribed to, and has **no reconnect** — one drop and the roster reads
`(closed)` until the project changes. `project-stream.ts` has the backoff, the
jitter, the resume and the settle-on-ack, all tested through `ProjectStreamDeps`.
**Solution** Give `subscribeToProject` a `onPresence(users)` option (the frames
already arrive on the same socket, and `receive` already ignores them) and let
`ProjectPage` pass it through the `presence` slot it already owns.
**Benefits** _Locality_: "how this browser talks to gw-01" is one module.
_Leverage_: the roster inherits the reconnect for free. _Tests_:
`project-stream.test.ts`'s fake socket already drives frames; a presence frame is
one more case.
**Effort** ~half a day. **Risk** low — the panel is small and separately tested.

---

## Agentic-workflow notes

What makes this area expensive for an LLM to edit safely, with evidence.

**1 · Four files carry more than half the area and none can be partially loaded.**
`gantt-panel.tsx` (4,376), `gantt-geometry.ts` (2,650), `plan-cards.tsx` (2,557),
`wbs-api.ts` (2,204), `table-frame.ts` (1,481), `directory-page.tsx` (1,406) —
~14.7k LOC in six files out of ~29.6k in scope. Changing the Gantt's detail
switch means loading `gantt-panel.tsx` whole, because the constant
(`DETAIL_KEY:628`), the storage trio (`:663`), the state (`:2332`), the mark
gates (`:3104`, `:3140`, `:3172`) and the control (`:4204`) are 3,500 lines
apart. There is no `gantt-detail.ts`.

**2 · Comment-to-code ratio inverts the usual reading cost.** Sampling by
stripping comment-only lines: `gantt-panel.tsx:2960–3550` is 590 lines of which
~300 are prose; `wbs-api.ts:11–780` is ~770 lines of which the great majority is
JSDoc. The prose is _excellent_ and is why the domain is legible — but an agent
paying by the token loads 4× the code it needs to change one attribute, and a
`grep` for a symbol returns as many hits in comments as in code (`arrowsShown`,
`rowCount`, `placed.bars` all appear only in proof narratives now).

**3 · The proofs are load-bearing and unindexed.** Dozens of JSDoc blocks carry
"Proof: X deleted, test Y failed on Z, watched DATE" — e.g.
`gantt-panel.tsx:2578–2596` (six failing tests enumerated for one filter),
`plan-cards.tsx:1136–1152`, `table-frame.ts:916`, `project-page.tsx:85–93`.
This is the repo's strongest R5 practice and it means **an agent that changes
one line must find and re-watch a named test it cannot discover from the code**.
There is no index from proof to test name; the only way to know a change
invalidates a proof is to read the comment above it.

**4 · Cross-file contracts discoverable only by grep.**
`data-modal-surface="bottom"` is written in `ui/modal.tsx:60` and read by
`plan-cards.tsx:1174` with a `querySelectorAll`; `data-grid` is written by both
renderers and read by `editable-grid.ts`; `--cell-bg` is written by
`styles.css:648` and read by an inline style in `table-frame.ts:1228`;
`data-plan-cards` is written at `plan-cards.tsx:2043` and `closest`-ed at
`:1219`. None of the writers names its reader. An agent editing `ui/modal.tsx`
has no signal that a chart-sheet placement depends on that attribute.

**5 · The same concept is spelled three ways, so a grep finds a third of it.**
Tag/Service/Team/Type: three label unions (`gantt-geometry.ts:176–283`), three
card components (`plan-cards.tsx:615–915`), three directory cards
(`directory-page.tsx:1079–1330`), three patch fields (`wbs-api.ts:1520–1600`).
An agent asked to "add a fifth dimension" must find twelve sites and will find
the four the word "tag" appears in.

**6 · Two dead signposts actively mislead.** `src/db/config.ts` describes a
local/server client store with `getJwt` and `wsUrl` that nothing imports and the
app did not build; `components/smoke/` holds two framework tracers from the
spike. Both look like architecture. An agent asked about caching finds `db/`
first — before it finds that there is no query library in the dependency list at
all.

**7 · Duplication _with_ the argument for it attached is the hardest kind to
resolve.** `wbs-api.ts:11–30` argues at length for hand-writing the wire types
(arktype must not reach the browser) and is right about the constraint while
being wrong about the conclusion (mcp-01 already derives from `openapi.json`).
`gantt-panel.tsx:663` copies `theme.ts`'s trio and improves it. `estimating-panel`
writes a fresh refusal sentence beside four shared ones. An agent reading each
site finds a defensible local justification and no signal that ten others exist —
which is exactly how eleven copies of one trio accumulate.

**8 · Memo dependency lists are the app's most fragile invariant and are only
partly guarded.** `gantt-panel.tsx:3504–3527` is a 23-entry array; two entries
(`open?.sliceId`, `fullScreen`) silently void the memo on gestures nobody
intended. `pointed-row-render-cost` D4 built exactly the right instrument for
this — a render probe that fails when a boundary is voided — but it probes one
gesture. An agent adding a value to a mark's closure gets no failure and no
warning; the eslint `exhaustive-deps` rule will _add_ the dependency for it and
call the job done.

**9 · The four settings panels are a template with no template.** Adding a fifth
section means copying `estimating-panel.tsx` and remembering: the two
`onDirtyChange` effects, the `busy`/`problem` pair, the `attempt` shape, the
refusal sentence with a 5xx arm (which three of the four have and one does not),
and registering a reporter in `project-settings-modal.tsx:198`. Every one of
those is discoverable only by reading a sibling.

**10 · The one place an agent can move fast.** `plan-completeness.ts`,
`project-picker.ts`, `plan-renderer.ts`, `plan-scroll-link.ts`, `toasts.tsx`,
`lib/project-stream.ts` and `table-frame.ts` are pure, small, named after their
domain concept, and separately tested. Every change in the "cheap wins"
candidate lands in one of them. That contrast is the argument for the splits
above: the modules that were extracted are the ones an agent can edit in one
read.
