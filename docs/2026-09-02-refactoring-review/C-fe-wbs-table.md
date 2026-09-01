# Sweep C — the fe-01 table cluster

Read-only architecture review of `apps/fe-01/src/components/wbs/wbs-table.tsx`
(12,183 LOC, read in full) and its 34 direct collaborators (9,128 LOC together).
Repo at `3346bb15` (merge of `feat/pointed-row-render-cost`). Nothing was changed.

Vocabulary: module / interface / implementation / seam / adapter / depth /
leverage / locality. Domain nouns are CONTEXT.md's.

## 0 · What grew, and a correction to the audit's figure

The brief says the file is 3,300 lines larger than the audit measured. That
compares two different things. At the audit's commit `5ec3b5f` the **file** was
**11,265** lines and the **`WbsTable` function** was 8,820 (`:2445–11265`).
Today the file is **12,183** and the function is **9,418** (`:2766–12183`).

- file: **+918** lines since 2026-08-30
- function: **+598** lines
- module scope (everything above `WbsTable`): **+321** lines (2,444 → 2,765)

Where the +918 went, by commit (`git log 5ec3b5f..HEAD -- wbs-table.tsx`):

| commit                | change                          | net effect on this file                                                                          |
| --------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `266324df`            | external refs                   | +262 (the whole `refs` column, `refsEditing` state, `setExternalRefsOf`, the modal mount)        |
| `13ee3d48`            | Start cell's own card           | +157–~120 (`startSentence`, `startCellProps`, `startCardId`, the `start` column rewrite)         |
| `82d13935`            | Mermaid lane control            | +151 (`MERMAID_SECTION_MODE_KEY` trio + the `<select>` in the Export menu)                       |
| `f81b32ef`            | hints are the page's own card   | +143 rewritten (`title` → `data-hint`/`data-fact` at ~90 sites)                                  |
| `a4740479`/`1827d631` | a step's figure at one x        | +108 each (the `ASSIGNEE_SLOT_PX` block, the rolled-trio span)                                   |
| `d5e74d98`/`21ddc048` | tool-hint wait, `+` toggles     | +80/+83                                                                                          |
| `3f458f66`            | chart `.svg` in the Export menu | +92                                                                                              |
| `623c36a7`            | pointed-row render cost         | 381 lines **moved** (net ≈ +40): three `useState`s → `pointed-row-store.ts`, `PlanRow` extracted |

Hook census inside `WbsTable` (`:2766–12183`), against the audit's numbers:
**49 `useState`** (audit 51 — three left for the store, one arrived), **82
`useCallback`** (78), **22 `useMemo`** (25 — three are now module-scope or gone),
**12 `useRef`** in the body plus 11 in module-scope components (23), **18
`useEffect`** + 1 `useLayoutEffect`. `live.current` is read at **159** sites and
carries **82** keys. The `columns` memo alone is **2,964 lines** (`:7238–10201`).

The pointed-row change is the only structural improvement since the audit: it
proves the seam works (a shell that subscribes, children handed in as
`children`, cells untouched). Everything else added mass to the same function.

## 1 · `wbs-table.tsx`, section by section

Sixteen separable concepts, up from the audit's ≥14 (external refs and the
hint-attribute split are the two new ones). Nine are browser memory, layout or
export — nothing to do with rendering a plan.

### Module scope (`:1–2765`, 2,765 LOC)

**`:1–227` | 227 | imports + props.** 60 imports, 45 of them siblings in this
directory. — reuse: none. — performance: none. — DDD: the import list is the
cheapest available map of the cluster and is the only one; there is no
`components/wbs/README.md` or index that says what the 45 siblings are for.

**`:228–426` | 199 | refusal vocabulary (`REFUSAL_SENTENCES`, `refusalSentence`,
`failureText`, `GONE`, `INVALID_REQUEST`, the five toast sentences, `BOM`).**
— reuse: the second of the audit's "refusal → sentence in 5 fe-01 places"; the
twin is `wbs-api.ts:1493`'s `directoryRefusalSentence`, and `wbs-table.tsx:293`
says so in prose ("`wbs-api.ts`'s `directoryRefusalSentence` makes the same
bargain"). Two tables, one vocabulary, no shared type. — performance: none.
— DDD: this is a **refusal-vocabulary module** wearing a table's clothes; it
imports nothing from the component and is imported by nothing.

**`:428–581` | 154 | popover-clip policy (`POPOVER_COLUMNS`, `opensAPopover`,
`DEP_LIST_WIDTH`, `startCardId`, `DEP_EDGE_FADE`).** — reuse: `DEP_EDGE_FADE`
(`:581`) is already an alias of `REFERENCE_SET_EDGE_FADE`; the pattern is right
and unfinished — the set at `:432–477` is a per-column CSS fact that belongs
beside `CELL` in `table-frame.ts`, where every other per-column geometry fact
lives. — performance: `opensAPopover` runs per `<td>` per render (~500 calls);
a `Set.has` plus two `endsWith`. — DDD: 90 lines of comment for a 2-line
predicate. The comment is the design record for four separate changes; it should
be an ADR or a `table-frame.ts` neighbour, not a preamble.

**`:586–741` | 156 | draft-key algebra + placement + `hoveredCellAfterRefresh`.**
— reuse: `draftKey`/`combinedDraftKey`/`estimateDraftKeys`/`stepOfDraftKey`/
`stepOfCellKey`/`rowOfCellKey`/`dropDrafts` are a **draft-key module** with no
file. `stepOfCellKey` and `column-hints.ts:216–226` implement the same
suffix rule (`-final`, `-<point>`) from two sides. — performance: `placementsOf`
walks the whole tree per refresh — correct and cheap. — DDD: `placementsOf` +
`hoveredCellAfterRefresh` are the _card-survives-a-refetch_ rule, a real concept
with no name and no home.

**`:743–1412` | 670 | browser memory — eight localStorage key families.**
Expansion (`:743–811`), column widths (`:813–820, :1052–1162`), Gantt height
(`:822–872, :1040–1050`), day scale (`:874–926`), row labels (`:928–976`),
Mermaid lanes (`:978–1038`), hidden columns (`:1164–1237`), saved views
(`:1239–1412`). — **reuse: the audit's R6 confirmed, unchanged.** Eight
`<key>/remembered<X>/remember<X>/forget<X>` quartets, each with the same shape:
`getItem` → `parsedOrNothing` → a shape guard → `removeItem` on refusal →
default. Only `parsedOrNothing` (`:766`) is shared. A ninth lives in
`gantt-panel.tsx:657`. ~500 of these 670 lines collapse into one
`rememberedValue(key, isValid, fallback)` adapter with a per-key validator.
— performance: writes are per gesture, never per keystroke — correct. Eight
`JSON.stringify` calls, none in a dependency array. — DDD: this is the
**Remembered layout** concept (CONTEXT.md: Column width override, Panel height
override, Column set, Expansion, Saved view) and it is 5.5% of the file, in the
file that draws the plan.

**`:1414–1692` | 279 | two resize handles.** `ColumnResizeHandle` and
`GanttHeightHandle` are the same gesture on two axes: pointer capture,
from-value taken once at `pointerdown`, a measurement fallback for jsdom, a
`drag`/`commit`/`abandon` interface. — reuse: two implementations of one
gesture, ~250 lines, differing in axis and clamp. A `useCapturedDrag` hook or a
`ResizeHandle` with an axis adapter deletes one of them. — performance: both
write state per `pointermove` — `setWidthOverrides` (`:4815`) and
`setGanttHeightPx` (`:4837`) re-render the whole table, all ~500 cells, on every
pointer move of a drag. This is the second per-pointer channel after
`hoveredCell`. — DDD: the interfaces (`ColumnResize`, `GanttHeightResize`) are
good and are the seam the split should keep.

**`:1694–1841` | 148 | mismatch marks + arming constants.** — reuse: none.
— performance: none. — DDD: `MismatchMark`'s comment at `:1790` still says "The
`title` is the pointer's copy of the same sentence" while the code writes
`data-fact` (`:1793`) — stale since `f81b32ef`. Five more sites say `title` for
what is now `data-fact`/`data-hint`: `:8784`, `:9525`, `:9933`, `:10046`,
`:10473`. R3 drift, six sites.

**`:1843–1991` | 149 | caret reading, day printing, toolbar-sheet helpers.**
— reuse: `caretOf` is the DOM half of `cell-navigation.ts`'s `Caret` and lives
here rather than beside it; `editable-grid.ts` is where its siblings are.
— performance: none. — DDD: `closingControlIn` + `TAKES_THE_FOCUS` +
`busyAffordance` are the **toolbar sheet's** own rules, in a file whose sheet is
150 lines at `:11430–11517`.

**`:1993–2084` | 92 | `ChartRead` + column helper + `ColumnMeta` merge.**
— reuse: none. — performance: none. — DDD: `ChartRead` is the one piece of
domain modelling in the file that is doing real work — "these five facts arrived
in one payload and are held as one" — and it is exemplary.

**`:2086–2633` | 548 | three toolbar panels: `FilterFacets`, `ColumnsControl`,
`SavedViews`.** — reuse: three `<details>` with the same summary class, the same
panel class, the same `useClosedByPointerOutside()`; `FilterFacets`' `group()`
and `signal()` are local closures rebuilt per render. — performance: all three
are cheap and only render when the toolbar renders — which is every render of
`WbsTable`, i.e. per keystroke in any cell. `FilterFacets` re-runs `group()`
seven times per render. — DDD: these are three components in one file, each
with its own props interface; they are already extractable with no seam work.

**`:2635–2751` | 117 | `PlanRow`.** — reuse: none. — performance: **the one
piece of this file that is right about rendering.** The shell subscribes via
`useSyncExternalStore`, the `<td>`s arrive as `children`, React bails on the
unchanged child elements. — DDD: the JSDoc is the design record for the whole
`live.current` contract and is the best 50 lines in the file.

### `WbsTable` body (`:2766–12183`, 9,418 LOC)

**`:2766–3497` | 732 | state declarations (49 `useState`, 12 `useRef`) + four
project-swap effects.** — reuse: four near-identical swap effects
(`:2821–2832` expansion, `:2927–2935` widths/columns/gantt, `:2981–2985` saved
views) each holding a `useRef(projectId)` and comparing it. — performance: the
whole per-pointer/per-keystroke surface is declared here; see §3. — DDD: 732
lines of declarations before the first behaviour. Reading any one concept means
paging past 48 unrelated ones.

**`:3499–3604` | 106 | two layout effects (linked scroll, `ganttRoomPx`).**
— reuse: none. — performance: `useLayoutEffect` + `ResizeObserver` over the
column **and every child** (`:3600`); `measure()` runs `querySelector` +
`ganttRoomInColumn` per observation. Correctly batched (the observer, not a
render), and the no-loop argument at `:3561` is sound. — DDD: fine.

**`:3606–3912` | 307 | the read path — `refresh`, `refreshOrMarkStale`, the
first-read effect, the socket subscription, the window `?` listener, the drag
cancel, the focus-intent landing.** — reuse: none. — performance: `refresh`
issues 8 parallel requests and then fires **17 `setState` calls** (`:3723–3776`)
in one batch — one render, correct. `sameSteps` (`:3776`) is the guard that
keeps `columns` from rebuilding; load-bearing. — DDD: `refresh` is the
**Stale tree** and **generation** concept and is 110 lines of one function.

**`:3914–4147` | 234 | `run`, `stepStack`, the undo chord, the Ctrl+D arm
lifecycle.** — reuse: none. — performance: `setBusy(true)`/`setBusy(false)`
around every write = two full-table renders per write, before the refetch's own.
— DDD: `run` is the **command outcome** seam (`CommitOutcome`) and is the right
shape.

**`:4149–4340` | 192 | derived plan readings — `flat`, `refsEditingRow`,
`namedInTheTree`, the three effective-label memos, the two directory maps,
`mismatchByRow`.** — reuse: none (the three `effective*Of` calls are already
`libs/domain`'s). — performance: **`namedInTheTree` (`:4187`) is not memoized**
— a `new Map` over every row with a `rowWords` call each, rebuilt on every
render including every keystroke. Everything else here is memoized on `flat`.
— DDD: correct and well-argued.

**`:4342–4442` | 101 | `effectiveTeamLabelOf` / `effectiveTagLabelOf` /
`effectiveServiceLabelOf`.** — reuse: three shapes of one question; the tag and
service ones are now the same function with different nouns (`:4414` says so).
— performance: **none of the three is memoized and each does a linear
`teams.find` / `tags.find` / `services.find` per label**. They are called from
the Team/Tag/Service cells (once per row each) _and_ from `ganttPlan`
(`:10552–10557`, once per shown row) — so on a 60-row plan with a 100-entry tag
directory this is ~6 linear scans per row per render, on every keystroke.
— DDD: they are the **Effective team set / Effective tag set / Effective
service set** readings, named correctly, in the wrong module.

**`:4444–4730` | 287 | the filter — `gaps`, `unestimatedIds`, `narrowable`,
`criteria`, `search`, `filtering`, `filterLabels`, six facet-option memos.**
— reuse: `filterLabels` (`:4634–4651`) is six `X.find(...)?.name ?? 'a Y this
plan has not loaded'` clauses; the six facet memos (`:4653–4730`) are the same
`optionsFor(new Set(narrowable.flatMap(...)), picked, labelOf)` four times plus
two ordered variants. — performance: `filterLabels` is rebuilt per render (six
closures) and is a prop of `SavedViews`; `narrowable` is correctly memoized on
seven inputs. — DDD: this is the **Search / Match / facet** concept and it is
the cleanest large block in the body.

**`:4732–4907` | 176 | `addWorkItem` queue, `frameState`, the two resize
adapters, `resetGanttSettings`/`resetLayout`, `columnsDiffer`.** — reuse: none.
— performance: `frameState` (`:4801`) runs `flat.some(...)` per render and is
handed to `flexibleCellStyle` per cell; `addQueue.current` is **mutated during
render** (`:4760–4765`). — DDD: `resetLayout` is the **Layout reset** term, and
it is the one function that knows all eight memory families — the seam the
split has to preserve.

**`:4909–5121` | 213 | export — `planForExport`, `copyAsMarkdown`,
`copyAsMermaid`, `downloadCsv`, `downloadMermaidDocument`, `downloadChartSvg`.**
— reuse: `downloadCsv` (`:5047`), `downloadMermaidDocument` (`:5066`) and
`downloadOnScreen` (`:10666`) each write the same six lines — `new Blob`,
`createObjectURL`, `createElement('a')`, `href`, `download`, `click`,
`revokeObjectURL`. Three copies. `copyAsMarkdown` and `copyAsMermaid` share the
same three-outcome clipboard dance twice. — performance: `planForExport` is a
`useCallback` with **twelve dependencies including `flat` and
`chartRead.slices`** — its identity churns on every refetch, which churns
`copyAsMarkdown`, `copyAsMermaid`, `downloadCsv` and `downloadMermaidDocument`
with it. Harmless today (nothing memoizes on them) and exactly the kind of
churn a future `memo` would trip over. — DDD: **Plan export** is a whole
concept with a module (`plan-export.ts`, `plan-mermaid.ts`) and its _actions_
live here.

**`:5123–5224` | 102 | the readiness walk.** — reuse: none. — performance:
`ancestorsOf` (`:5131`) is `flat.find` **inside a while loop** — O(depth × n)
per call, called once per click. Acceptable; it is the same `flat.find` idiom
that appears 10 times in this file. — DDD: fine.

**`:5226–5497` | 272 | structural writes — `dropOn`, `addSibling`, `indent`,
`outdent`, `moveAmongSiblings`, `duplicateRow`, `deleteRow`, `commitNameCell`,
`removeEmptyRow`.** — reuse: `indent`/`outdent`/`moveAmongSiblings`/`deleteRow`/
`removeEmptyRow` all do `siblingsOf(...)` + `findIndex` + a neighbour lookup
with the same `index > 0 ? …` guard written four times (`:5286`, `:5346`,
`:5418`, `:5490`) — each with its own comment explaining why `.at(-1)` is
wrong. — performance: `deleteRow` and `removeEmptyRow` depend on `flat`, so
their identities churn per refetch; they are read through `live.current`, which
is why that costs nothing today. — DDD: this is the **Subtree / Position /
move** concept — the place where a plan's structure is edited — and it is
six callbacks deep inside a renderer.

**`:5499–5925` | 427 | the keyboard — `onKeyDown`, `onTabKey`, `onArrowKey`,
`onAltMove`, `moveByCommand`, `nextRowName`, `armOrDeleteRow`, `onCommandKey`.**
— reuse: `onArrowKey` (`:5638`) and `moveByCommand` (`:5741`) are the same
eight lines — `gridOf` → `editableGrid` → `nextCell`/`commandMove` → `find` →
`focusCellAt` — twice. — performance: `onArrowKey`, `moveByCommand` and
`nextRowName` each call `editableGrid(container)`, which is a
`querySelectorAll('[data-cell]…')` over the whole grid plus a `map`/`flatMap`
per keystroke. On a 60-row × 15-column plan that is ~900 nodes read and two
arrays allocated **per arrow key**. — DDD: these eight callbacks plus
`keyboard-bindings.ts`, `cell-navigation.ts` and `editable-grid.ts` are one
concept, and the three modules are the interface; what is left here is 427 lines
of glue that should be a `usePlanKeyboard(...)` returning the same eight
handlers.

**`:5927–6096` | 170 | dependencies — `dependenciesOf`, `dependOn`,
`depEntriesFor`, `pickDependency`, `moveDepHighlight`, the steps-change close.**
— reuse: none. — performance: `dependenciesOf` is `ids.flatMap(id =>
flat.find(...))` — O(deps × n), called **per row per render** from the Depends
cell (`:7707`) and **three more times per row** inside
`dependsCellHoverProps`'s two handlers (`:10360`, `:10383`, `:10395`). On a
60-row plan with 3 deps each that is ~10,800 comparisons per render, on every
keystroke anywhere in the table. A `Map<string, TreeRow>` off `flat` removes it
entirely. — DDD: the **Dependency** concept, correctly split into
`dep-graph.ts` / `dep-picker.ts` / `depends-input.ts` / `depends-card.tsx`,
with its state and its writes left here.

**`:6098–6334` | 237 | estimates — `typedTrio`, `estimateValue`,
`trioProblemFor`, `forgetEstimateDrafts`, `commitEstimate`, `combinedValue`,
`combinedProblem`, `commitCombinedEstimate`.** — reuse: `commitEstimate` and
`commitCombinedEstimate` share the same clear/send/forget tail twice.
— performance: `typedTrio` allocates an object per call and is called by
`estimateValue` (three times per unfolded step per row) and `trioProblemFor`.
— DDD: **Estimate / Trio shorthand / Final days**, split correctly into
`estimate-draft.ts`; the drafts record and the commit paths stay here.

**`:6336–6508` | 173 | field writes — `setNotBefore`, `setNotBeforeReason`,
`setPriority`, `setParallelism`.** — reuse: `setPriority` and `setParallelism`
are the same seven lines with a different field and a different sentence
(`:6482` says so out loud). — performance: none. — DDD: fine.

**`:6510–6578` | 69 | the earliest-start editor's state and focus effect.**
— reuse: none. — performance: none. — DDD: a `useState` declared 3,700 lines
below the other 48, next to the code that uses it — which is the right
locality and the proof that the other 48 are in the wrong place.

**`:6580–6733` | 154 | reference-set + assignment writes — `setTeamOf`,
`setServicesOf`, `setTagsOf`, `setTypesOf`, `setExternalRefsOf`,
`createTeamFor`, `createServiceFor`, `createTagFor`, `createTypeFor`,
`assignTo`, `createPersonFor`, `chooseEstimateMethod`.** — **reuse: the audit's
R6 second half, confirmed.** Four `set<X>Of` are `run(() => api.patch(id, {
<field>: [...ids] }))` with a different field name; three `create<X>For` are
`run(async () => { const x = await api.add<X>(name); await api.patch(id, {
<field>: [...current, x.id] }); })`. Seven functions, one shape, ~60 lines that
one `referenceSetWriter(kind)` factory replaces. — performance: none.
— DDD: **Tag set / Team set / Service set / type set** are four instances of
one interface (`ReferenceSetAdapter` already exists in
`reference-set-field.tsx:40`) and the writers are not built through it.

**`:6735–6864` | 130 | the `@` mention in a folded cell.** — reuse:
`mentionOptions` (`:6805`) rebuilds `CreatablePicker`'s ranking by hand —
matching, exact, `Add "…"`, `Remove …` — which is the rule
`creatable-picker.tsx:396–429` owns. Two implementations of "what a picker
offers". — performance: `mentionOptions` is called **per folded step cell per
render** (`:9020`) and filters `people` twice plus a `some` — O(rows × steps ×
people) per render whenever a mention is open. Guarded by an early return when
no mention is open (`:6808`), so it is cheap at rest. — DDD: the **Mention**
term, split into `mention.ts` for the parse and left here for the offer.

**`:6866–7067` | 202 | plan readings for the cells — `hasSchedule`,
`showSchedule`, `spanOf`, `teamNamesOn`, `nonOwnerNoteOf`, `assigneeOn`,
`anyAssigneeOn`, `waitsFor`, `goToRow`, `startFloor`.** — reuse: none.
— performance: **`spanOf` allocates a `new Date()` per call** (`:6886`) and is
called four times per row per render — twice from the `start` and `finish`
cells, twice more through `startSentence` (see below). `anyAssigneeOn` is
`flat.some(...)` **per step per row** (`:9430`) — O(rows² × steps) per render on
a staffed plan; on 60 rows × 2 steps that is 7,200 row visits per render.
— DDD: correct names, wrong home.

**`:7069–7236` | 168 | the `live` ref.** — **reuse: 82 keys written out twice,
byte-identical** (`:7070–7152` vs `:7154–7236`; `diff` reports one line, the
closing brace). The `useRef` initializer and the per-render assignment are the
same literal. Deletion test: build the object once into a local and pass it to
both — 83 lines go, and nothing can observe the difference because the ref's
initial value is only read on the mount render, where the assignment below it
runs anyway. — performance: an 82-property object allocated per render; and
this is the hidden coupling the pointed-row design names — every cell reads
state through `live.current` at render time, so **no row can ever be
memoized**. — DDD: `live` is an **anti-interface**: it exists because
`columns` may depend on `steps`/`unfoldedSteps`/`hiddenColumnIds` alone
(landmine #1), and it makes every cell's dependencies invisible. It is the
single biggest obstacle to any split, and the single biggest reason the split
is worth doing — 82 keys is 82 undeclared couplings.

**`:7238–10201` | 2,964 | the `columns` memo — 20 column definitions.**
Per column: `drag` `:7241–7276` (36) · `number` `:7277–7347` (71) · `refs`
`:7348–7458` (111) · `name` `:7459–7693` (235) · `depends` `:7694–8464`
(**771**) · `priority` `:8465–8510` (46) · `team` `:8511–8564` (54) · `tag`
`:8565–8625` (61) · `service` `:8626–8723` (98) · `type` `:8724–8773` (50) ·
`in-parallel` `:8774–8918` (145) · steps `:8919–9714` (**796**: folded
`:8922–9515`, three points `:9519–9617`, assignee `:9618–9711`) ·
`final-total` `:9715–9726` (12) · `not-before` `:9727–9997` (**271**) ·
`start` `:9998–10040` (43) · `finish` `:10041–10058` (18) · `float`
`:10059–10100` (42) · `actions` `:10101–10164` (64) · hidden-column filter
and deps `:10166–10201` (36).
— reuse: **the four reference-set columns (`team`, `tag`, `service`, `type`,
`:8511–8773`) are the audit's finding, still standing: 263 lines, four
`ReferenceSetStrip` calls with the same `gridCell` block written four times
(12 lines each) and the same `label`/`addLabel`/`removeLabel`/`placeholder`
shape.** One `<ReferenceColumn kind="tag" …>` deletes ~180 of them. The
`gridCell` block is also written a fifth time for the assignee picker
(`:9676–9687`). — performance: **89 arrow functions and 34 handler props are
created per cell per render inside this memo**; every one of them is a new
identity handed to a DOM node on every render of the table. `cellKey(...)` is
called 21 times in the memo, several of them twice for one cell (`:7474` and
`:7532` in `name`). The `depends` cell calls `dependenciesOf` (O(deps × n)) and
`depEntriesFor` (which builds a whole `DepGraph` via `indexDepGraph`) **per row
per render whenever its picker is open**. — DDD: 2,964 lines in one `useMemo`
whose deps are three values. The comment at `:10184–10199` is the best
statement of the landmine in the repo. Every cell reads `live.current.<x>` —
20 columns × ~8 reads each — so the memo's real dependency set is 82 values
declared nowhere.

**`:10203–10310` | 108 | table model, `shownRows`, `depLit`, `setShownRows`
effect, `pointChartRow`.** — reuse: none. — performance: **`shownRows`
(`:10233`) is a plain `.filter` — a new array identity every render**, which is
the key `GanttPanel`'s `useMemo(() => layOutGantt(plan), [plan])`
(`gantt-panel.tsx:2513`) hangs off, through `ganttPlan`. `depLit` (`:10276`) is
an IIFE with a `flat.find` per render. — DDD: `depLit`'s JSDoc is 30 lines of
proof for a 7-line derivation; correct and enormous.

**`:10312–10496` | 185 | `dependsCellHoverProps` + `startSentence` +
`startCellProps`.** — reuse: both are "props this `<td>` needs that the column
definition may not know" — the same seam, twice, with no shared shape.
— performance: **`startSentence(row)` is called twice per row per render** —
once from `startCellProps` (`:10461`) and once again in the `<td>` style
(`:11996`) — and each call runs `live.current.spanOf(row)` (a `new Date()`, two
`printedDay` calls) and a `startFloor.current.get`. Combined with the `start`
and `finish` cells' own calls, that is **four `spanOf` calls and four `Date`
allocations per row per render**. `dependsCellHoverProps` builds two closures
per row per render and calls `dependenciesOf` (O(deps × n)) up to three times
inside them. — DDD: these two are the strongest argument for a `PlanCell`
seam: the `<td>` needs per-column props and the memo may not supply them, so
the table grew a second, informal column registry.

**`:10498–10620` | 123 | `ganttPlan` + `startFloor.current = startFloorByRow(…)`.**
— reuse: none. — performance: **two findings, both material.**
(1) `ganttPlan` (`:10519`) is a plain object literal rebuilt on every render:
`shownRows.map` with a `new Map(Object.entries(row.estimates))` per row, plus
`flat.map` for the tree and `flat.flatMap` for every dependency. It is
`GanttPanel`'s `plan` prop, and the panel memoizes its whole layout on it —
so **every `WbsTable` render re-runs `layOutGantt` and every downstream memo in
the chart**. `pointed-row-render-cost/design.md` D3 says "`ganttPlan` and
`shownRows` become `useMemo` in `WbsTable` so those keys hold"; **that half did
not ship.** The pointed-row path is safe because it no longer renders
`WbsTable` at all — but a keystroke in the Find box, a hover card, a
`depHover`, a `busy` toggle each still pay the full chart layout.
(2) `startFloorByRow(ganttPlan, …)` (`:10617`) runs **unconditionally on every
render, chart open or closed** — it builds six `Map`s over the rows, slices,
steps and dependencies and walks every leaf (`gantt-geometry.ts:2361–2470`).
The `Start` cell's sentence is the only consumer, and it is a hover-card
sentence. — DDD: the assignment is a render side-effect on a ref, 200 lines
below the ref's declaration, and the comment at `:10609` says so.

**`:10622–10753` | 132 | `planOnScreen`, `downloadOnScreen`, `leafColumnIds`,
`layout`, `hintState`, `resizeHandleFor`.** — reuse: `downloadOnScreen` is the
third copy of the blob-and-anchor download. — performance: `frameLayout` runs
per render (cheap, ~20 columns); `resizeHandleFor` does a `layout.columns.find`
per header cell. — DDD: fine.

**`:10755–11395` | 641 | `toolbarControls`.** 21 controls in one JSX
expression: Freeze menu, Add work item, Collapse/Expand, Gantt, settings modal,
Find, Filters, Views, Columns, the filter count, the empty-answer sentence, the
readiness badge, Undo, Redo, cheat sheet, the Export `<details>` with six
actions and the Mermaid picker, the start-date field, the estimate-method
picker. — reuse: `busyAffordance(busy)` spread at six sites; the same
`variant="outline" size="sm" type="button"` on eleven buttons. — performance:
rebuilt on **every** render of the table — 21 controls and ~40 closures per
keystroke in any cell. It is a `const` in the render body, not a memo, and it
is rendered in one of two places. — DDD: this is the **plan toolbar** and it
is a component; it needs ~25 props, all of which the table already has.

**`:11397–12183` | 787 | the returned tree.** Shell `:11397–11429`, toolbar or
sheet `:11430–11565`, three banners `:11567–11621`, the cards branch
`:11623–11777` (**39 props to `PlanCards`**), the table branch `:11778–12033`
(colgroup, thead with `resizeHandleFor`, tbody with `PlanRow` and the `<td>`
loop), the chart `:12035–12126` (14 props to `GanttPanel`), toasts, cheat
sheet, refs modal `:12128–12180`. — reuse: none. — performance: the `<td>`
style at `:11987–12022` spreads **six objects per cell per render** (`CELL`,
the popover exemption, the start cursor, `flexibleCellStyle`, `pinnedCellStyle`,
the armed tint) — ~500 cells × 6 allocations, plus the two per-row props
builders. `startSentence(row.original)` is called here a second time
(`:11996`). — DDD: the cards branch's 39 props are the clearest statement of
what `WbsTable` actually is: a **plan editing session** object that two
renderers consume. `PlanCards` already proves the seam exists; nothing hands
the same object to the table.

## 2 · Collaborators, file by file

Format: `path` | LOC | role — reuse — performance — readability/DDD.

**`live-editing.ts`** | 632 | the **Edit exit** rule as a class (`LiveField`) plus
the durable refused-draft map and `FocusIntent`. — reuse: none; it is the
extraction that worked — two faces (`CellInput`, `PlanCards`) mount the same
field. — performance: none; the whole point is that a keystroke writes no React
state. `heldRefusals` is a module-level `Map` keyed by cell — bounded by
"refusals a person has not resolved", argued at `:80`. — DDD: the reference for
this cluster. Five numbered rules, each with an observed failure. `flushes` as a
`WeakMap<CellElement, …>` is the right call and says why (`:96–101`).

**`cell-input.tsx`** | 527 | the DOM face of a `LiveField`: which element, the
auto-size measurement, the at-rest rendered overlay. — reuse: `resize`'s
first-line measurement calls `splitNameCell` rather than re-implementing
`indexOf('\n')` (`:282`) — correct. — performance: `resize` writes
`node.style.height = 'auto'`, reads `drawnBoxHeight`/`scrollHeight`, then writes
again — a **forced synchronous layout per cell** on attach, on every keystroke
in that cell, on focus and on blur; plus a `window.resize` listener per clamped
cell (one per row) that re-measures without debounce (argued at `:386–393`).
`restText` state is written on attach/blur only, not per keystroke — correct.
— DDD: **no test file.** Its rules are proved through `wbs-table.test.tsx` and
`e2e/name-markdown.spec.ts`. The one seam in the cluster with no unit-level
oracle of its own.

**`cell-navigation.ts`** | 206 | pure: where an arrow or a chord moves the focus.
— reuse: `commandMove` is `nextCell` with a bypass caret constant (`:172`) —
the sharing is explicit and named. — performance: `nextCell` does a `findIndex`

- `filter`/`Set` over every editable cell per keystroke; the array is built by
  the caller. — DDD: exemplary — pure, total, `null` means "the browser's key".

**`editable-grid.ts`** | 160 | the committed-DOM reading of the grid.
— reuse: one `GRID_SELECTOR`, read by both renderers. — performance:
`editableGrid` is `querySelectorAll` + `map` + `flatMap` per call, and it is
called by `onArrowKey`, `moveByCommand`, `nextRowName`, `cellIn`,
`focusAdjacentCell` and `FocusIntent` — up to three times per keystroke.
— DDD: **no test file**; proved through the table's 585 cases. The
"committed DOM, never a ref written in render" argument (`:106–108`) is the
cluster's best-stated invariant.

**`keyboard-bindings.ts`** | 656 | the **Key binding** registry as data plus
seven predicates. — reuse: the registry is read by the cheat sheet and by
`page-shortcuts.ts`; `escapesAnOpenList` is read by three cell classes. This is
the leverage model the rest of the cluster should copy. — performance: none.
— DDD: **no test file of its own** — the cross-check lives in
`keyboard-cheat-sheet.test.tsx`'s `PROVEN_BY`, which is a good arrangement and
an odd address. 250 lines of the file are the 26 binding sentences.

**`keyboard-cheat-sheet.tsx`** | 267 | the **Cheat sheet** modal, hand-rolled.
— reuse: renders `bindingsFor(renderer)` and nothing of its own. — performance:
`groups` is rebuilt per render (5 filters over 26 bindings) — the sheet renders
rarely. — DDD: the focus trap and the capture-phase Escape are one effect with
one argument; good.

**`drag-drop.ts`** | 140 | pure: `zoneFor` and `planMove`. — reuse: `siblingsOf`
here and `siblingsOf` in `wbs-table.tsx:4732` are two functions with one name
and two shapes (`WorkItemView[]` vs `TreeRow[]`). — performance: `planMove`
does three `filter`s and an `isWithin` walk per drop — per gesture. — DDD:
pure, tested, the model for the rest of the drag concept — of which the state
(`dragging`, `dropHint`) and the handlers stay in the table.

**`date-field.tsx`** | 256 | the uncontrolled `<input type=date>` that saves the
day somebody typed. — reuse: none. — performance: none. — DDD: 85 lines of
class comment recording four measured browser faults; the `typedSinceFocus`
pick/typing discriminator is a genuinely deep piece of interface.

**`estimate-draft.ts`** | 212 | pure: `trioProblem`, `parseTrioShorthand`,
`showTrio`, `sendableTrio`, `isTrioEmpty`. — reuse: three shared message
constants (`:21–23`) so the boxes and the folded cell cannot disagree.
— performance: none. — DDD: **Trio shorthand** modelled exactly; the
parse/print round trip is asserted rather than assumed.

**`depends-input.ts`** | 54 | pure: parse a typed list of work item numbers.
— reuse: none. — performance: builds a `Map` per call. — DDD: fine.

**`depends-card.tsx`** | 273 | the **Hover card** for a Depends on cell, plus
the document pointer bridge. — reuse: `dependsLine` shared with the sr-only
description; `dependencyPointerRegion` shared with `entersThroughDependsCard`.
— performance: **a `document` `pointermove` listener that calls
`getBoundingClientRect` on the owner `<td>` and on every card line per pointer
move** (`:196–212`) — up to 8 layout reads per mouse move while a card is open,
unbatched and undebounced. `entersThroughDependsCard` does the same work again
from the cell's `mouseenter` (`:131–138`), including a
`document.querySelectorAll`. This is the heaviest per-pointer path left in the
cluster. — DDD: the bridge is the right answer to a real problem (passive card
padding) and is the only place in the cluster that reads geometry per pointer
move; it deserves a named module of its own.

**`dep-picker.ts`** | 96 | which rows a Depends on picker may offer, each with
the refusal be-01 would answer. — reuse: `REFUSAL_SUFFIX` moved here so the
table's list and the card's sheet share one wording (`:32–38`). — performance:
`indexDepGraph` is rebuilt **per call** (documented at `:85`) — and the call is
per row per render whenever a picker is open. — DDD: good; the "ported
judgement, be-01 still decides" argument is precise.

**`dep-graph.ts`** | 187 | the ported cycle/ancestor rule. — reuse: an explicit
port of `be-01/src/service/schedule.ts`'s `indexTree` + `expandToLeaves` — the
one deliberate duplication in the cluster, argued at `:45–54`. — performance:
`indexDepGraph` is O(rows + edges) with memoized `leavesUnder`; `refusalFor`
runs Kahn over the whole leaf graph **per candidate row**, so an open picker on
a 60-row plan is 60 topological sorts per render. — DDD: pure, tested, correct.

**`reference-set-field.tsx`** | 861 | the **Add button** / chips / picker /
hover-card strip shared by Teams, Tags, Services and Types, plus a phone sheet.
— reuse: the adapter (`ReferenceSetAdapter`) is exactly the interface the four
columns should be built through — and `wbs-table.tsx` builds four call sites by
hand instead. — performance: `own`, `offered` and `inherited` are recomputed per
render with `entries.find` per own id and a `filter` over the directory —
O(own × directory) per cell per render, four cells per row. `referenceSetLines`
allocates per render whether or not a card is open. — DDD: the strip carries
its own `pointed`/`editing` state locally and says why (`:279–288`) — the
correct counter-example to the table's central `hoveredCell`. 400 of its 861
lines are measured-fault commentary.

**`creatable-picker.tsx`** | 690 | the combobox that can create, plus
`PickerList`. — reuse: `PickerList` is shared by this, the folded cell's `@`
list and `PriorityCell` — three callers, one list. — performance: the ranking
(`ahead`/`behind`/`options`) is recomputed per render of every picker cell —
four reference cells + one assignee cell per row, each filtering the whole
directory. — DDD: the `readOnly`-not-`disabled` argument (`:476–503`) and the
"one `activeIndex` drives the highlight, Enter and `aria-activedescendant`"
rule are the two pieces of real depth here.

**`priority-cell.tsx`** | 288 | the Prio cell: box, band list, chevron.
— reuse: reads `priorityBandStyleOf` and `PickerList` rather than its own.
— performance: `priorityBandStyleOf` per render per row (a `find` over 5 bands
— trivial); `bandLine` calls it again per band per open list. — DDD: **no test
file** — proved through `wbs-table.test.tsx`'s `the priority cell` block. The
"list opens on click, not focus" argument (`:88–99`) records a real
`LiveField` interaction fault and is the kind of thing a missing unit test
makes expensive to re-derive.

**`priority-chevron.tsx`** | 174 | the rank glyph. — reuse: keyed on rank, like
the inks. — performance: none. — DDD: exemplary — geometry as data, tested on
the points rather than the names.

**`priority-band-style.ts`** | 116 | the one resolution of a **Priority band**
to a colour and words. — reuse: **the model for the whole cluster** — four
faces read it and none has a colour opinion. — performance: `.at(rank)`.
— DDD: exemplary.

**`hover-card.tsx`** | 505 | the one positioned surface: three placements
(cell-absolute, portalled-anchored, beside-a-list) and the scrolling variant.
— reuse: `surfacePlacement`, `besidePlacement` and `roomForCard` are pure and
separated **because jsdom measures zero** — the placement arithmetic is testable
and the wiring is a browser fact. That split is the cluster's best answer to the
jsdom/browser ledger. — performance: three `useLayoutEffect`s, each doing one
`getBoundingClientRect` per opening; `roomForCard` also reads the frame's rect.
One card is open at a time, so this is per-opening, not per-pointer. — DDD:
three placements in one component with three optional props that must not
co-occur (`anchor`/`beside` are "two placements of one card", `:149`) — the one
place a union type would say what the prose says.

**`hover-preview.tsx`** | 121 | the **Hover preview**: the name as an `<h1>` this
file writes, the notes as markdown under it. — reuse: reads `InlineMarkdown` and
`LinkFollowable` rather than its own. — performance: `react-markdown` parses the
notes per render of the preview — one card at a time. — DDD: "the heading is
structure this file writes; the emphasis inside it is content the parser made,
and the two never meet as a string" (`:29–34`) is the security argument stated
as a design rule.

**`hint.tsx`** | 555 | the **Tool hint** / **Project fact** layer: one card, one
listener set, the **Wait ring**, the **Press quiet**. — reuse: one layer for
~90 call sites, against a per-control hover pair — argued at `:206–215`.
— performance: six `document` listeners mounted once; `pointermove` is added
**only for the part of the wait the ring is drawn in** (`:358`) so a page at
rest pays nothing per move. `getBoundingClientRect` twice per opening (on
arrival and again when the timer fires, `:367` — deliberately). This is the
best-behaved per-pointer path in the cluster. — DDD: the `data-hint` /
`data-fact` split is a domain distinction (about the control vs about the plan)
carried by which attribute a call site writes — leverage with no second value to
fall out of step.

**`column-hints.ts`** | 228 | one sentence per column heading. — reuse: a lookup
beside the render rather than a field on the column definition, **because a
definition that changes remounts every cell** (`:16–23`) — landmine #1 shaping a
module boundary, correctly. — performance: `hintFor` per `<th>` per render (~20
calls). — DDD: `UnexplainedColumnError` makes "every rendered column carries a
sentence" enforceable rather than intended.

**`pointed-row-store.ts`** | 117 | the **Pointed row** as an external store.
— reuse: one store, three readings, two subscribers (`PlanRow`, `GanttPanel`).
— performance: the fix — a pointed change renders no part of `WbsTable`;
`resolve()` notifies only when the resolved row moves. Measured 75–120ms → 8–15ms.
— DDD: 48 lines of doc for 44 lines of code, and every line of the doc is a
decision with a proof. **The template for every remaining extraction.**

**`actions-menu.tsx`** | 461 | the **Actions menu** pattern, shared by a row's ⋯
and the toolbar's `Freeze #`. — reuse: one keyboard for two callers — written
after the R5 #14 fault, precisely so there is one copy of the item handler.
— performance: a `document` `mousedown` listener while open; one menu at a time.
— DDD: `refusedBecause` as one field carrying both the reason and the refusal
(`:19–37`) is the deepest small decision in the cluster.

**`name-notes.ts`** | 102 | compose/split the **Name cell**'s one text.
— reuse: called by `CellInput`, `commitNameCell` and `PlanCards`. — performance:
two `indexOf`/`slice`. — DDD: exemplary — the three "product semantics rather
than accidents" consequences are enumerated and each is pinned by a test.

**`mention.ts`** | 41 | split `2/3/8@ka`. — reuse: one split, two readers.
— performance: none. — DDD: exemplary.

**`inline-markdown.tsx`** | 290 | **Inline markdown** for all four faces.
— reuse: one component, four faces; `renderName` is a module constant
**because `columns` may not depend on anything rebuilt per render** (`:279–289`)
— landmine #1 shaping a module boundary again. — performance: `useMemo` on
`inlineComponents` keyed on the source, and `INLINE_PLUGINS` hoisted with the
reason stated (`:16–18`); still, `react-markdown` parses **every visible name on
every render of the table** — the Name cell renders `renderFirstLine(name)` per
row per render and the memo is inside `InlineMarkdown`, keyed on the string, so
the parse is repeated only when the name changes. Correct. — DDD:
`RENDERED_AS_SOURCE` written out rather than derived, with the reason ("a tag
this map forgets is a marker silently eaten") — the right trade.

**`external-ref-marks.ts`** | 238 | **Ref mark** families, counts, geometry.
— reuse: `refMarksSentence` built from the same marks the cell draws.
— performance: `refMarksOf` builds a `Map` of the system vocabulary **per row
per render** (`:131`) — a directory-sized allocation per row; hoisting the
`nameOf` map to the caller removes it. — DDD: family-by-prefix with the
growth argument stated (`:23–30`) is good modelling.

**`external-refs-card.tsx`** | 88 | the ref cell's hover card. — reuse: reads
`followableHref` from `wbs-api.ts` so one rule decides both surfaces.
— performance: `systems.find` per ref per render of the card. — DDD: **no test
file**; covered by `wbs-table.test.tsx`'s `the links column`.

**`external-refs-modal.tsx`** | 255 | the ref editor. — reuse: `derivedSystemId`
reads `systemOfUrl` from `libs/domain` — no second rule. — performance: every
act sends the whole list; `systems.find` per row per render. — DDD: **no test
file.** "Every act writes the whole list as it happens, rather than collecting
and saving on close" (`:98–102`) is a real decision recorded where it happens.

**`close-on-outside-pointer.ts`** | 51 | close a `<details>` on an outside press.
— reuse: one hook, four toolbar panels. — performance: one capture-phase
`pointerdown` per mounted panel — four listeners on the table page, each doing a
`node.contains` per press. — DDD: **no test file**; small enough that its
argument (capture, `pointerdown` not `click`, native `<select>` exemption) is
the whole of it.

**`box-geometry.ts`** | 78 | pure overlap/overrun readings for the browser gate.
— reuse: used by `e2e` only. — performance: none. — DDD: exemplary; the
tolerance is explained in layout units.

**`short-date.ts`** | 153 | **Short date** and `PrintedDay`. — reuse: one
formatter for the table, the cards, the chart and the export. — performance:
a regex + slices per call — but see `spanOf`: `printedDay` is called ~4× per row
per render through the table's `Date` allocations. — DDD: "the components are
read out of the string and the string is never parsed into a moment" (`:69–76`)
is the timezone bug prevented by a stated rule.

**`initials.ts`** | 50 | two characters for a folded step's assignee.
— reuse: one function, two faces. — performance: a split per assignee per
render. — DDD: exemplary, including the deleted `trim()` whose removal could
not be seen.

## 3 · Performance axis

### 3.1 Every `useState` in `WbsTable`, classified

**Nothing below `WbsTable` is memoized.** Any of these re-renders the component,
the `columns` memo's 20 cell functions run for every row, and ~500 `<td>`s
re-render. `PlanRow` is a shell, not a `memo`.

| kind                                   | state (line)                                                                                                                                                                                                                                                                                                                                                                                                                    | cost per event                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **per-keystroke**                      | `query` `:2944` · `depPicker` `:3261` · `mention` `:3359`                                                                                                                                                                                                                                                                                                                                                                       | full table render per character typed. `depPicker`'s also re-runs `depEntriesFor` (an `indexDepGraph` + a Kahn sort per candidate row) for the open cell.                                     |
| **per-pointer**                        | `hoveredCell` `:3038` · `depHover` `:3284` · `dropHint` `:3248` (per `dragover`) · `widthOverrides` `:2845` (per `pointermove` of a column drag) · `ganttHeightPx` `:2857` (per `pointermove` of the height drag)                                                                                                                                                                                                               | full table render per pointer event. `hoveredCell`/`openCard` is the known remaining hot channel; the four resize/drag ones are the same shape and are not in the pointed-row change's scope. |
| **per-focus**                          | `focusedCell` `:3056` · `depFocus` `:3309`                                                                                                                                                                                                                                                                                                                                                                                      | full table render per focus move — i.e. per Tab through the plan.                                                                                                                             |
| **per-write**                          | `workItems` `:2777` · `chartRead` `:2798` · `steps` `:2799` · `treeMayBeStale` `:3005` · `busy` `:3006` (twice per write) · `scheduleError` `:3008` · `estimateMethod` `:3009` · `drafts` `:3021` · `stack` `:3086` · `startDate` `:3190` · `teams` `:3197` · `tags` `:3199` · `services` `:3207` · `workItemTypes` `:3208` · `externalSystems` `:3217` · `teamCapacities` `:3234` · `priorityBands` `:3245` · `people` `:3246` | batched into one render by `refresh` (17 setters, `:3723–3776`), plus two more for `busy`.                                                                                                    |
| **per-click / per-gesture**            | `expanded` `:2807` · `ganttDayPx` `:2888` · `ganttLabelsShown` `:2900` · `mermaidSectionMode` `:2915` · `facets` `:2960` · `savedViews` `:2970` · `refsEditing` `:3225` · `dragging` `:3247` · `openMenuRowId` `:3385` · `freezeMenuOpen` `:3398` · `armedDelete` `:3412` · `gapVisit` `:3452` · `toolbarSheetOpen` `:3472` · `ganttOpen` `:3497` · `cheatSheetOpen` `:3076` · `editingNotBefore` `:6519`                       | one render each.                                                                                                                                                                              |
| **per-click, and remounts every cell** | `unfoldedSteps` `:3112` · `storedHiddenColumns` `:3118`                                                                                                                                                                                                                                                                                                                                                                         | both are `columns` dependencies — the two deliberate remounts, argued at `:10184–10200`.                                                                                                      |
| **per-mount / observer**               | `pointedRows` `:3347` (the store — renders nothing) · `ganttRoomPx` `:2877` (ResizeObserver) · `connected` `:3007` (socket)                                                                                                                                                                                                                                                                                                     | —                                                                                                                                                                                             |

### 3.2 Memos and callbacks whose dependency arrays include the whole tree

- `planForExport` `:4922` — 12 deps including `flat` and `chartRead.slices`;
  churns `copyAsMarkdown`, `copyAsMermaid`, `downloadCsv`,
  `downloadMermaidDocument`.
- `dropOn` `:5233` (`flat`), `outdent` `:5299` (`flat`), `deleteRow` `:5409`
  (`flat`), `removeEmptyRow` `:5484` (`flat`), `ancestorsOf` `:5131` (`flat`),
  `dependenciesOf` `:5953` (`flat`), `dependOn` `:5985` (`flat`),
  `depEntriesFor` `:6049` (`flat`), `anyAssigneeOn` `:7009` (`flat`),
  `siblingsOf` `:4732` (`flat`) — ten callbacks re-created on every refetch.
  Harmless **only** because they are read through `live.current`; the moment
  anything below is memoized they become the churn that voids it.
- `narrowable` `:4497` — 9 deps, correctly listed. `mismatchByRow` `:4325` — 5.
- No `JSON.stringify` appears in any dependency array (8 occurrences, all in
  localStorage writes). No `JSON.stringify` in an effect body except the
  expansion save `:2831`.

### 3.3 O(n²) and repeated passes in render

| where                                                                                            | pass                                                                                                                                                         | cost                                                            |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `dependenciesOf` `:5953` called from the `depends` cell `:7707`                                  | `ids.flatMap(id => flat.find(…))` **per row**                                                                                                                | O(rows × deps × rows)                                           |
| `dependsCellHoverProps` `:10360, :10383, :10395`                                                 | `dependenciesOf` up to 3 more times per row, inside handlers                                                                                                 | same again per pointer event                                    |
| `anyAssigneeOn` `:7009` called from the folded cell `:9430`                                      | `flat.some(…)` **per step per row**                                                                                                                          | O(rows² × steps)                                                |
| `effectiveTeamLabelOf` `:4351`, `effectiveTagLabelOf` `:4383`, `effectiveServiceLabelOf` `:4415` | `teams.find` / `tags.find` / `services.find` per label, per row, unmemoized; called from three cells **and** from `ganttPlan`                                | O(rows × labels × directory)                                    |
| `nameOf` in `refMarksOf` (`external-ref-marks.ts:131`) called from the `refs` cell `:7372`       | `new Map(systems.map(…))` **per row**                                                                                                                        | O(rows × systems)                                               |
| `spanOf` `:6882`                                                                                 | `new Date()` + 2 `printedDay` — called 4× per row per render (`start` `:10006`, `finish` `:10045`, `startSentence` `:10422` twice via `:10461` and `:11996`) | 4 Date allocations per row per render                           |
| `startFloorByRow` `:10617`                                                                       | six `Map`s over rows/slices/steps/deps + a walk of every leaf, **every render, chart closed or open**                                                        | O(rows + slices + deps) per render                              |
| `ganttPlan` `:10519`                                                                             | `shownRows.map` with a `new Map(Object.entries(estimates))` per row + `flat.map` + `flat.flatMap`                                                            | new identity per render → `layOutGantt` re-runs in `GanttPanel` |
| `editableGrid` (`editable-grid.ts:117`)                                                          | `querySelectorAll` + `map` + `flatMap` over the whole grid, 1–3× per keystroke                                                                               | ~900 nodes read per arrow key                                   |
| `depEntriesFor` → `pickerEntries` → `indexDepGraph` + `refusalFor`                               | a Kahn sort **per candidate row** while a picker is open, per render                                                                                         | O(rows × (rows + edges))                                        |
| `depLit` `:10276`                                                                                | `flat.find` per render                                                                                                                                       | O(rows)                                                         |
| `refsEditingRow` `:4170`                                                                         | memoized `flat.find`                                                                                                                                         | fine                                                            |

### 3.4 Sorting / filtering in render without a memo

- `shownRows` `:10233` — `.filter` per render (a `GanttPanel` memo key).
- `ganttPlan` `:10519` — built per render (the same key).
- `depLit` `:10276` — IIFE per render.
- `leafColumnIds` `:10683` / `layout` `:10696` / `frameState` `:4801` — per
  render; cheap but they feed ~500 `flexibleCellStyle`/`pinnedCellStyle` calls.
- `filterLabels` `:4634` — six closures per render.
- `toolbarControls` `:10763` — 21 controls and ~40 closures per render.
- `namedInTheTree` `:4187` — a `Map` over every row per render.
- The six facet memos `:4653–4730` **are** memoized — correctly.

### 3.5 Layout reads

- In render: **none** in `wbs-table.tsx` (the three `getBoundingClientRect`
  calls are in `ColumnResizeHandle` `:1519`, `GanttHeightHandle` `:1636` and the
  `dragover` handler `:11947` — all inside pointer handlers).
- In effects: `ganttRoomPx`'s `useLayoutEffect` `:3580` (batched by a
  `ResizeObserver`, no loop, argued at `:3561`); `HoverCard`'s three
  `useLayoutEffect`s (once per opening); `HintLayer`'s two reads per opening.
- **Unbatched and per-pointer:** `depends-card.tsx:196–212` reads the owner
  `<td>` and every card line's rect on **every `pointermove`** while a card is
  open, and `entersThroughDependsCard` (`:131–138`) repeats the whole thing —
  `querySelectorAll` included — from each cell `mouseenter`.
- `cell-input.tsx:248–298` forces a synchronous layout (`height='auto'` →
  `scrollHeight` → write) per keystroke in the Name cell, plus a `window.resize`
  listener per Name cell.

### 3.6 Handlers, strings and allocations per cell per render

- **89 arrow functions** and **34 handler props** inside the `columns` memo,
  every one a new identity per cell per render.
- `cellKey(…)` — 21 call sites in the memo, several twice per cell.
- The `<td>` style spreads **six** objects per cell (`:11987–12022`); the `<th>`
  four (`:11893–11898`).
- Class-name concatenation per cell: `${REFERENCE_SET_CHIP_CLASS} border-0`
  `:8032` per chip; `` `flex min-h-6 …${off ? 'text-muted-foreground' : ''}` ``
  `:2261` per facet; `` `facet-why-${label.toLowerCase().replace(…)}` `` `:2258`
  builds a regex-replaced id per facet per render. Small, but they are inside
  the per-row/per-render path.
- Template ids per row per render: `depends-${id}` `:7744`, `refs-${id}`
  `:7375`, `folded-${row}-${step}` `:9053`, `mention-${row}-${step}` `:9021`,
  `dep-options-${id}` `:8162`, `priority-bands-${rowId}`
  (`priority-cell.tsx:131`).

### 3.7 localStorage

No write is per keystroke. Every write is on a committed gesture: a drag release
(`:4820`, `:4841`), a control (`:11060`, `:11340`, `:12103`, `:12109`), a save or
delete (`:11050`, `:11067`), a column tick (`:3165`), or the expansion effect
(`:2831`, which fires per expand/collapse and once on mount). Eight
`JSON.stringify` calls, all in writers. This axis is clean.

### 3.8 The `live.current` pattern's cost

- 82 keys, allocated per render (`:7153–7236`), and the identical literal
  written a second time as the `useRef` initializer (`:7070–7152`).
- 159 read sites, all inside cell renderers — so **every cell's real dependency
  set is invisible**, and `memo(PlanRow)` is provably unsafe (the pointed-row
  design says exactly this, D2).
- The benefit is real and load-bearing: `columns` depends on three values, so a
  hover, a keystroke or a click **re-renders** every cell instead of
  **remounting** it. Landmine #1 is the reason the ref exists.
- The cost is that the only lever left for render cost is "do not render
  `WbsTable`", which is what the store did for one channel and what nothing
  does for `hoveredCell`, `depHover`, `dropHint`, `widthOverrides` or
  `ganttHeightPx`.

## 4 · Deepening candidates (this area)

Ordered by leverage per unit of effort. Every one respects the pointed-row
decision: **rows are never memoized**, and pointer-frequency state goes into an
external store read by the smallest possible subscriber.

### 1 — The `live` literal, written twice

**Files:** `wbs-table.tsx:7069–7236`.
**Problem:** the 82-key object is written out in full as the `useRef`
initializer and again as the per-render assignment. `diff` reports one differing
line (the closing brace). A key added to one and not the other is a cell reading
`undefined` on the mount render only — invisible in tests that render and then
act.
**Solution:** build the object once into a local, pass it to `useRef` and assign
it: `const now = {…}; const live = useRef(now); live.current = now;`.
**Deletion test:** delete the initializer literal and seed the ref from the
local — nothing can observe it, because the assignment below runs on the mount
render too. If a test fails, the ref is being read during the first render
before line 7153, which is itself worth knowing.
**Benefits:** −83 lines; one place to add a key. **Effort:** 15 minutes.
**Risk:** none.

### 2 — One remembered-value adapter for the eight browser-memory families

**Files:** `wbs-table.tsx:743–1412` (+ `gantt-panel.tsx:657`).
**Problem:** eight copies of `key/remembered/remember/forget`, each re-deriving
the same read → parse → validate → drop-the-key → default sequence. The audit's
R6, unchanged. It is also where two of R5's recorded vacuous checks came from
(the `Number.isFinite` line, the `SectionMode` guard) — the shape invites
lines whose removal cannot be seen.
**Solution:** a `remembered.ts` module: `rememberedValue<T>(key, isValid,
fallback)` returning `{ read, write, forget }`, plus the per-project key
builder. Each family becomes a validator and a default — the expansion's
`isExpansion`, the widths' two-round entry filter, the height's range, the
scale's `isDayPx`, the labels' `typeof`, the lanes' `isSectionMode`, the hidden
columns' `isStringArray`, the views' `isSavedView` + `everyFacetOf`.
**Deletion test:** the `forget*` functions for expansion, Mermaid lanes and
saved views do not exist today — that asymmetry is real (a Layout reset does not
forget them) and must be preserved as a per-family flag rather than a uniform
API.
**Benefits:** ~350 of 670 lines go; every future key is a validator; the two
`R5`-shaped traps are guarded in one place. **Effort:** ~1 day.
**Risk:** low — pure functions with 40+ existing cases in
`wbs-table.test.tsx`'s six storage `describe` blocks.

### 3 — `ReferenceColumn`: one column definition for Teams, Tags, Services, Types

**Files:** `wbs-table.tsx:8511–8773` (columns), `:6580–6699` (writers),
`:7126–7141` (the `live` keys), `reference-set-field.tsx`.
**Problem:** four copy-pasted columns (263 lines) feeding 8 writers and 12 `live`
keys — the audit's R6 second half. The `gridCell` block is written five times.
The four differ only in: the noun, the vocabulary state, the row's own id list,
what the inheritance reading is (a label, a list of entries, or nothing), and
whether a `MismatchMark` rides beside it.
**Solution:** a `referenceColumn(kind, {entries, ownIdsOf, inheritedOf, mark})`
factory building the definition, and a `referenceSetWriter(kind)` returning
`{replace, create}` — both driven by the `ReferenceSetAdapter` interface that
already exists. `type` passes no inheritance; `service` passes a mark.
**Benefits:** −180 lines of columns, −60 of writers, −8 `live` keys; a fifth
dimension becomes one registration. `reference-set-field.test.tsx` (590 LOC)
already covers the strip; the four columns' table tests
(`the tag cell` `:16019`, `the service cell` `:16106`) stay as they are.
**Effort:** ~1 day. **Risk:** low.

### 4 — Stop rebuilding the chart's input on every table render

**Files:** `wbs-table.tsx:10233` (`shownRows`), `:10519` (`ganttPlan`),
`:10617` (`startFloor`).
**Problem:** `pointed-row-render-cost/design.md` D3 states that `ganttPlan` and
`shownRows` become `useMemo`s "so those keys hold". They did not. `GanttPanel`
memoizes `layOutGantt` on `plan` (`gantt-panel.tsx:2513`), so every render of
`WbsTable` — every keystroke in the Find box, every hover card, every `busy`
toggle — re-lays-out the whole chart. Separately, `startFloorByRow` runs on
every render whether or not the chart is open, to supply one hover sentence.
**Solution:** `useMemo` `shownRows` on `[table.getRowModel().rows,
search.visibleIds]`, `ganttPlan` on its real inputs, and make `startFloor` a
memo gated on `ganttOpen || anyStartCardCouldOpen` — or simpler, on `ganttPlan`,
so it recomputes when the plan does rather than when anything does.
**Deletion test:** the D4 probe pattern is already in the repo — count
`layOutGantt` calls across a keystroke and assert it does not move.
**Benefits:** removes the largest per-render cost left on the typing path.
**Effort:** ~half a day including the probe. **Risk:** medium — memo dep churn
is exactly the "check that cannot fail" this repo has been bitten by; it needs
a render-count probe, not a green suite.

### 5 — `hoveredCell` / `openCard` into a `PointedCell` store

**Files:** `wbs-table.tsx:3038, :3056, :3067`, the seven cells that write it,
`pointed-row-store.ts` as the template.
**Problem:** the known remaining hot channel. Every pointer crossing between two
cardable cells re-renders all ~500 cells to move one absolutely-positioned box.
Same for `depHover` (`:3284`) and `depFocus` (`:3309`), which additionally light
rows through `depLit`.
**Solution:** `createPointedCell()` holding `hovered`/`focused` and resolving
`openCard`, subscribed by a thin per-cell shell exactly as `PlanRow`
subscribes — the cell's _card_ is what re-renders, not the cell. `depLit` moves
into the same store (its subscribers are the `<tr>`s, which already subscribe
for the row light) so a Depends hover renders the lit rows' shells and nothing
else. `reference-set-field.tsx:288` is the precedent for the simplest cases: a
card whose key is the cell it is a child of does not need central state at all.
**Deletion test:** `refsEditing` (`:3225`) is not a pass-through — it survives a
refetch through `refsEditingRow`. `focusedCell` **is** close to one: it exists
solely so a pointer wandering past does not close a focus-opened card
(`:3043–3049`); folding it into the store keeps the rule and removes a state.
**Benefits:** the last per-pointer channel through `WbsTable`; a hover card
becomes a two-element render. **Effort:** ~2 days with probes.
**Risk:** medium — the same "a reader outside the subscription goes dark" risk
the pointed-row change carried, bounded the same way (enumerate the sites; the
seven writers are all in this file).

### 6 — The concept-module split of `WbsTable`

The target is not "smaller files"; it is that touching one concept loads one
concept. Proposed modules, with the ranges that move and what each needs:

| module                   | moves from                                                                    | LOC       | needs                                                                   | gives back                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `remembered-layout.ts`   | `:743–1412`                                                                   | ~670→~320 | `projectId`                                                             | 8 `{read,write,forget}` triples                                                                                                                  |
| `use-plan-layout.ts`     | `:2845–2935`, `:4792–4907`, `:1414–1692`                                      | ~450      | `projectId`, `flat`, `leafColumnIds`                                    | `frameState`, `layout`, `resizeColumn`, `resizeGantt`, `resetLayout`, `columnsDiffer`, the two handles                                           |
| `use-column-set.ts`      | `:3112–3188`                                                                  | ~80       | `steps`, `projectId`                                                    | `hiddenColumnIds`, `offeredColumns`, `toggleColumn`, `unfoldedSteps`, `toggleStep`                                                               |
| `use-plan-read.ts`       | `:2777–2799`, `:3005–3009`, `:3086`, `:3190–3246`, `:3606–3868`, `:3914–4067` | ~700      | `api`, `projectId`, `subscribe`, `pushToast`                            | `plan` (rows + chartRead + directory), `refresh`, `run`, `stepStack`, `busy`, `stack`, `stale`                                                   |
| `use-plan-filter.ts`     | `:2944–2985`, `:4466–4730`                                                    | ~330      | `flat`, the three effective maps, `steps`, `priorityBands`, directories | `criteria`, `search`, `filtering`, `filterLabels`, six facet lists, `savedViews`                                                                 |
| `plan-toolbar.tsx`       | `:2086–2633`, `:10755–11395`                                                  | ~1,190    | ~25 props, all already resolved                                         | one `<PlanToolbar>` for both renderers                                                                                                           |
| `plan-export-actions.ts` | `:4909–5121`, `:10622–10675`                                                  | ~270      | `planForExport` inputs, `pushToast`                                     | seven actions, one blob helper                                                                                                                   |
| `use-plan-keyboard.ts`   | `:5499–5925`                                                                  | ~430      | `flat`, the structure writers, `busy`, `pushToast`                      | the eight handlers `live` carries                                                                                                                |
| `use-plan-structure.ts`  | `:5226–5497`, `:4732–4790`                                                    | ~330      | `api`, `run`, `flat`, `focusIntent`                                     | `addWorkItem`, `addSibling`, `indent`, `outdent`, `moveAmongSiblings`, `duplicateRow`, `deleteRow`, `removeEmptyRow`, `dropOn`, `commitNameCell` |
| `use-estimate-drafts.ts` | `:6098–6334`                                                                  | ~240      | `api`, `run`                                                            | `drafts`, the six estimate readers/writers                                                                                                       |
| `use-reference-sets.ts`  | `:6580–6733` + candidate 3                                                    | ~150      | `api`, `run`                                                            | four `{replace,create}` adapters + assignment                                                                                                    |
| `plan-columns/*.tsx`     | `:7238–10201`                                                                 | ~2,960    | `steps`, `unfoldedSteps`, `hiddenColumnIds`, `live`                     | one file per column family; `columns` becomes a 40-line registry                                                                                 |
| `plan-cell-props.ts`     | `:10312–10496`                                                                | ~185      | `live`, `startFloor`, the card store                                    | the two `<td>` props builders                                                                                                                    |
| `plan-chart-input.ts`    | `:10498–10620`                                                                | ~125      | `shownRows`, `flat`, `chartRead`, the label readers                     | memoized `ganttPlan`, `startFloor`                                                                                                               |

What is left in `wbs-table.tsx` is the composition: the hooks above, `live`, the
`columns` registry, and the returned tree — on the order of **900–1,100 lines**.
`live` stays; it is the contract the cells depend on and the split must not
touch it. `PlanRow`, the pointed store and the `columns` dep list stay exactly
as they are.

**How `wbs-table.test.tsx`'s 585 cases split.** The file is 16,855 LOC: **882
lines of shared fixture** (`fakeApi` at `:86–882` is 797 of them) and 63
top-level `describe` blocks. Every block already names a concept, and the
mapping is almost one-to-one:

- `the widths this browser has dragged` `:10442` · `the chart height…` `:11015`
  · `the day scale…` `:10898` · `the row names…` `:10953` · `the widths the
table is laid out by` `:9941` · `the frame the table scrolls inside` `:9786`
  · `the outline past the Number cap` `:10359` → **`plan-layout.test.tsx`**
  (~1,700 LOC)
- `narrowing the plan by facet` `:14656` · `…by service` `:14981` · `saved
views` `:15444` · `finding a work item` `:11409` · `what the filter says it
dropped` `:15791` → **`plan-filter.test.tsx`** (~1,900)
- `moving between cells` `:6696` · `arrow keys — cross-review` `:6850` · `Tab
moves between the fields` `:6985` · `moving rows with alt` `:7274` · `the
command chords` `:12852` · `the chords reach the picker cells` `:14089`
  → **`plan-keyboard.test.tsx`** (~2,000)
- `dependencies in the table` `:7562` · `picking dependencies from a list`
  `:8268` · `the picker marks what be-01 would refuse` `:8476` ·
  `…cross-review findings` `:8633` · `hovering a dependency lights the rows`
  `:8841` · `adding several dependencies at once` `:11181` →
  **`plan-dependencies.test.tsx`** (~1,900)
- `one cell for the whole trio` `:4953` · `estimates are never edited for you`
  `:5533` · `step columns fold away` `:4260` · `assigning… with @` `:4433` ·
  `what the plan is still missing` `:11262` → **`plan-estimates.test.tsx`**
  (~1,900)
- `the plan toolbar's controls` `:12018` · `sharing the plan` `:12169` · `the
lane the Mermaid exports…` `:12448` · `the columns a reader has hidden`
  `:16274` · `the order of the columns` `:9729` · `the project's settings`
  `:14409` → **`plan-toolbar.test.tsx`** (~1,300)
- `the priority cell` `:2782` · `the In-parallel cell` `:3159` · `the
earliest-start cell` `:3483` · `the tag cell` `:16019` · `the service cell`
  `:16106` · `the links column` `:16519` · `teams and assignees` `:1933` ·
  `names wrap and notes carry markdown` `:3659` · `a name and its notes in one
box` `:6390` → **`plan-cells.test.tsx`** (~3,000; splits again per cell later)
- `dragging a row` `:5929` · `the drag handle as assistive technology…` `:6024`
  · `what a drag shows` `:6055` · `a drag interrupted` `:6649` ·
  `duplicating a branch` `:1531` · `the row actions menu` `:1596` ·
  `collapsing a branch` `:1888` → **`plan-structure.test.tsx`** (~1,100)
- `live edits from other people` `:1798` · `someone else editing while you are
typing` `:6097` · `failures you can see` `:11641` · `a click made while a save
is in flight` `:11952` · `undo and redo` `:12714` · `a step changing` `:14444`
  → **`plan-read-and-write.test.tsx`** (~1,600)
- `the pointed row` `:9259` · `the chart under a plan` `:9558` · `holding the
chart to the row` `:9880` → **`plan-chart-seam.test.tsx`** (~700)
- `the WBS table` `:882` · `the plan on a calendar` `:2194` · `the keyboard
cheat sheet` `:12627` → **`plan-table.test.tsx`** (~1,300)

The 797-line `fakeApi` becomes `src/testing/fake-project-api.ts` — which is also
the audit's "six independent `ProjectApi` fakes totalling 1,500 LOC with no
`src/testing/`". Eleven files across four workers instead of 585 serial cases in
one; the audit measured 182s for this file alone and projected ~50s.
**Do this first**, exactly as the audit's L3 says: it is zero production change
and it makes every step of the split above verifiable in seconds.

**Effort:** ~4 days for the production split after ~half a day for the test
split. **Risk:** medium, and concentrated in three places: (a) the `columns`
dep list must not grow — every extracted hook must return values read through
`live`, never closed over in a cell; (b) `resetLayout` knows all eight memory
families and must keep knowing them; (c) the `<td>` props builders and the
`columns` memo must not be separated by a module edge that tempts someone to
pass state into the memo.

### 7 — Deletion tests on suspected pass-throughs

- `estimateValue` `:6129` — one line, `typedTrio(row, stepId)[point]`, one
  caller (`:9605`). Inline it; `typedTrio` is already on `live`. **Deletable.**
- `waitsFor` `:7023` — `dependenciesOf(row.dependsOn)`, one caller
  (`PlanCards`, `:11664`). **Deletable** — pass `dependenciesOf`.
- `hasSchedule` `:6866` / `showSchedule` `:6867` — two one-line closures over
  `scheduleError`; three call sites. Keep `showSchedule`, inline `hasSchedule`
  (one caller, `:10054`).
- `disarmDelete` `:5729` — `setArmedDelete(null)`, three callers. Keep; it names
  a domain act.
- `pointChartRow` `:10305` — a `useCallback` wrapper over `pointedRows.pointChart`.
  **Not** deletable: the stability is what keeps the chart's mark memos from
  churning, and `pointed-row-render-cost/verify.md` has the probe.
- `registerSvgDownload` `:5096` — a stable setter for a ref. Keep; the stability
  is the contract (`:5093`).
- `DEP_EDGE_FADE` `:581` — a re-export alias of `REFERENCE_SET_EDGE_FADE` with
  40 lines of comment. The comment is worth keeping, the alias is not: point the
  two call sites at the shared constant.
- `startCardId` `:551` — two callers, both in this file. Keep; the JSDoc's
  argument (two spellings of one id is a description referring to nothing) is
  exactly right.

## 5 · Agentic-workflow notes

**Tokens to load before touching one concept.** There is no unit of this cluster
smaller than a file, and the file is 12,183 lines ≈ **165k tokens**. Changing
one column means reading the `columns` memo (2,964 lines) to find it, plus
`live`'s 82 keys (168 lines) to learn what it may read, plus the `<td>` render
(`:11972–12026`) to learn what the cell may _not_ do, plus `table-frame.ts`
(1,481) for the width, plus `column-hints.ts` (228) for the sentence. Changing
one _state_ means reading `:2766–3497` (732 lines of declarations) to find out
whether it is per-pointer. The test file is another **16,855 lines ≈ 230k
tokens**, and its 797-line fixture is loaded whichever of the 63 blocks you are
in. An edit to the Tags cell and an edit to the Gantt height drag load the same
two files.

**Hidden coupling through `live.current`.** 82 keys, 159 read sites, no type
exported, no declaration of which cell reads which. Static analysis of "what
does this cell depend on" requires reading every cell. The three rules an agent
must infer and cannot look up:

1. `columns` may depend on `steps`, `unfoldedSteps`, `hiddenColumnIds` and
   nothing else (stated at `:10184–10200`, `:3324–3327`, `:7368–7371`,
   `:8480–8484`, `:10008–10010`, `:10108–10110`, `:10336–10338`,
   `:10515–10517`, `:10692–10694`, `:10702–10705` — **ten** restatements of one
   rule, which is itself the measure of how badly it needs a type).
2. Anything a cell reads at render time goes on `live`, and the literal must be
   updated **twice**.
3. Anything a `<td>` needs that the memo may not know goes in a props builder
   (`dependsCellHoverProps`, `startCellProps`) — an informal second column
   registry with no interface.
   An LLM that misses (1) ships a table that remounts every cell on the first
   hover and eats a half-typed name; the repo has that fault recorded twice
   (`:3338–3345`, `:7368–7371`) and the jsdom suite catches it only because
   somebody wrote a `points a row without remounting the cells under a half-typed
name` case for it.

**The jsdom/browser ledger makes verification expensive and non-local.** The
R5 tally names this cluster in seven entries: the `mousedown`-flush class
(#12, #14, #15, and again in `reference-set-field.tsx:643` and
`creatable-picker.tsx:476`), the `:hover` negative, the layout-measured-in-the-
wrong-layout family, the `toHaveCount(0)` retry. A change to any hover, any
`mousedown`, any absolutely positioned box, or any row height is **not
verifiable in jsdom** — the agent must run Chromium, and `LLM_README`'s landmine
says a filtered browser run against a reused dev server is itself a trap. So the
loop for a one-line style change in this cluster is: 12k-line read → edit →
2,000 jsdom tests (182s for this file) → whole browser gate (8.5m).

**Where the cluster is already cheap to edit, and why.** `pointed-row-store.ts`
(117), `priority-band-style.ts` (116), `initials.ts` (50), `mention.ts` (41),
`name-notes.ts` (102), `estimate-draft.ts` (212), `dep-graph.ts` (187),
`short-date.ts` (153): each is one concept, pure or nearly so, with its own test
file, and each names its own invariant in its JSDoc. Editing any of them loads
under 400 lines and is provable in under a second. The split proposed above is
the same move applied to fourteen more concepts that are currently addresses in
one function.

**The four modules with no test file** — `cell-input.tsx` (527),
`editable-grid.ts` (160), `keyboard-bindings.ts` (656), `priority-cell.tsx`
(288), plus `external-refs-card.tsx`, `external-refs-modal.tsx` and
`close-on-outside-pointer.ts` — are all proved through `wbs-table.test.tsx`.
That is 1,900 LOC of behaviour whose only oracle is the 16,855-line file. It is
also why the test split is the prerequisite rather than the tidy-up: until those
cases can be run in a second, every one of the fourteen extractions is verified
by a three-minute suite.
