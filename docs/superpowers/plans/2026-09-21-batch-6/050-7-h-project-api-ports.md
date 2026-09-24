# 050.7 h — the project API behind the plan modules' private repository ports

|             |                                                                                                                                                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **twelfth packet**                                                                                                                                                               |
| Size class  | M — three slices, each one executor attempt                                                                                                                                                                                                                                 |
| Predecessor | [050.7g](050-7-g-project-prerequisites.md) — the project-owned stores, the two channels, `useChannelListener`, `useSnapshotChanges`, and `PlanFeedForReader` / `PlanWriterHost` without React setters                                                                       |
| Closes      | OpenSpec task **9** of `adopt-frontend-lifetimes`, and item 3 of "Required implementation order" in the [frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md): the broad `ProjectApi` behind the plan and command modules' private repository ports |
| Revision    | First.                                                                                                                                                                                                                                                                      |
| Schema      | OpenSpec change `adopt-frontend-lifetimes`, already `sdd-lean`. One new requirement with three scenarios, one per slice; task 9 ticked with a dated note in slice 3.                                                                                                        |

## 1. Goal, non-goals, and the cut

**Goal.** No plan module, and nothing in the table, reaches the broad `ProjectApi` any more. Each of
the three plan modules is handed only its own **private repository port**, cut from the page's one
HTTP client by a **project composition root**: the plan feed reads through `PlanReadRoutes` (nine
read routes), the calendar markers write through the `CalendarMarkerRoutes` they already declare
(four), and a new `plan-commands` module writes through `PlanCommandRoutes` (thirty-four). The
table receives `ProjectServices` — factories of feature-services only — and its hooks, toolbar and
columns receive `PlanCommands`, the commands of one project with the project already bound. What a
reader sees does not change.

**Non-goals.**

- **The project runtime (tasks 10 and 11).** The table still opens its feed in an effect and builds
  its marker gestures, writer and commands in memos, per reader; the composition root is a plain
  function the page calls once per client. `readRefreshOwner`, `isActiveReader` and `rereadResources`
  stay closures over the table's refs, exactly as packet g left them.
- **The command services themselves.** The gesture policy — what each write dirties, which requests
  make one gesture, whether an answer still belongs to the reader — stays in the table's hooks and
  the plan writer. The design's eight command rows (fields, structure, dependencies, estimates,
  references, settings, scheduling, history) are extracted later, each over a port narrower than
  `PlanCommandRoutes`. `PlanCommands` is the K2 surface they will replace member by member.
- **The project catalog and the archival import.** `listProjects`, `createProject`, `openProject`,
  `renameProject` and `importPlan` are the session's catalog, not a plan module's; `ProjectPage` and
  `usePlanImport` keep calling them on the same client (section 3.1).
- **Any reader-visible change**, any new dependency, `project.json`, `bun.lock`, a DI Bag `module.ts`,
  or a module `module-index` block.
- **The architecture checks of task 13.** Nothing here adds a code-shape checker; the type system is
  what keeps `ProjectApi` out of the table (section 3.8).

**The cut, and why three slices.** Measured, not assumed (section 4.2):

1. The ports and the composition root are plain TypeScript with node-tier tests and no React: the
   new `plan-commands` module, the new `project` composition root, and the refresh owner reading
   through `PlanReadRoutes` instead of `ProjectApi` (the owner's one parameter renamed, its two
   suites' fixtures named). Nothing in the table changes but one property name.
2. Delivery below the table's props: every hook, the toolbar, the settings panels' closures and the
   two columns write through `PlanCommands`, and the read hook opens the feed and the markers through
   `ProjectServices`. The table still takes `api` and composes over it itself, so no test changes:
   a behaviour-neutral move measured against the twenty adopted table suites (1215 before, 1215
   after).
3. The table stops taking the client: `WbsTableProps.api` becomes `projectServices`, the page
   composes once per client, and the seventeen table suites draw the table over the same composition
   through one test helper — 256 prop sites, one named fixture edit, no assertion changed. The
   READMEs, the lifetime map's K2 note and task 9 close here.

## 2. Read first

| File                                                                                                 | Why                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                         | Rules R1–R5 and the routing index.                                                                              |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                                | "Execution contract", "Standard blocks every packet uses" — the strict OpenSpec block and the fault form.       |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`                           | "Required implementation order" item 3 and "Narrow context and K2 resolution": what this packet delivers.       |
| `docs/superpowers/plans/2026-09-21-batch-6/050-7-g-project-prerequisites.md`, sections 6 and 8       | The step-0, extraction and fault procedure this packet repeats.                                                 |
| `apps/wbs/fe-01/src/modules/calendar-markers/contract.ts`                                            | `CalendarMarkerRoutes`: the `Pick<ProjectApi, …>` port precedent every new port follows.                        |
| `apps/wbs/fe-01/src/lib/plan-refresh.ts:166-217`                                                     | The refresh owner's one `api` parameter and its nine reads.                                                     |
| `apps/wbs/fe-01/src/modules/plan-feed/composition.ts`                                                | `PlanFeedForReader.api`, which becomes `routes`.                                                                |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts:462-770`                                         | The feed effect, the markers memo, the writer memo, `stepStack`, and the `activeApi` guards.                    |
| `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx:614-1280`, `:1440-1470`, `:1730-1770`, `:1910-1925` | Every place the table hands `api` down or calls it.                                                             |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx:470-490`, `:1210-1240`                           | The one client and the table's render.                                                                          |
| `apps/wbs/fe-01/src/testing/record-calls.ts`, `fake-project-api.ts`                                  | Why every port must reach the client at the moment of the call: suites replace and record methods after render. |
| `apps/wbs/fe-01/vitest.node-suites.ts`, `src/test-tiers.test.ts`                                     | The two new DOM-free suites must be listed, or the tier test refuses them.                                      |

## 3. Design

### 3.1 The measured surface: every route, by the module that owns it now

`ProjectApi` (`apps/wbs/fe-01/src/lib/wbs-api.ts:1363-1751`) has fifty-four methods. Every call
outside `lib/wbs-api.ts` and the tests, on the base, grouped by the module that owns the route after
this packet (`git grep -nE "\bapi\.[a-zA-Z]+\(" <base> -- apps/wbs/fe-01/src ':!*.test.*'`, plus the
two calls split over two lines, `project-page.tsx:703` and `wbs-table.tsx:1735`):

| Owner after this packet                                                | Routes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Callers on the base                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plan feed — `PlanReadRoutes` (9)                                       | `tree`, `steps`, `listTeams`, `listTags`, `listServices`, `listWorkItemTypes`, `listExternalSystems`, `listPeople`, `listCalendarMarkers`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `lib/plan-refresh.ts:186-214`, reached through `modules/plan-feed/composition.ts:43`                                                                                                                                                                                                                                                                       |
| calendar markers — `CalendarMarkerRoutes` (4)                          | `createCalendarMarker`, `renameCalendarMarker`, `recolorCalendarMarker`, `deleteCalendarMarker`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `calendar-markers.resource.ts:32-46`; the port already exists (`contract.ts:34-37`), and the table passed it the whole client                                                                                                                                                                                                                              |
| plan commands — `PlanCommandRoutes` (34), 18 of them about the project | project: `undo`, `redo`, `exportPlan`, `setEstimateMethod`, `setEstimateArithmetic`, `setDepReach`, `setOptimizationSettings`, `retryOptimization`, `setStartDate`, `setTeamCapacity`, `setPriorityBands`, `addStep`, `renameStep`, `removeStep`, `createWorkItem`, `arrangeBySchedule`, `freezeProject`, `unfreezeProject`; work item or picker: `patchWorkItem`, `setStatus`, `assignPerson`, `moveWorkItem`, `duplicateWorkItem`, `removeWorkItem`, `setEstimate`, `clearEstimate`, `unfreezeWorkItem`, `addDependency`, `removeDependency`, `addTeam`, `addService`, `addWorkItemType`, `addTag`, `addPerson` | `use-plan-read.ts:731` (2), `wbs-table.tsx:1074`, `:1735`, `:2015`, `:2020`, `:2294`, `:2391`, `plan-toolbar.tsx` (11), `use-plan-structure.ts` (10), `use-plan-fields.ts` (10), `use-reference-sets.ts` (17), `use-estimate-drafts.ts` (4), `use-plan-dependencies.ts` (2), `plan-columns/actions.tsx:75`, `plan-columns/depends.tsx:464` — 64 call sites |
| stays with the page — the session's project catalog (5)                | `listProjects`, `createProject`, `openProject`, `renameProject`, `importPlan`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `project-page.tsx:639`, `:670`, `:703`, `:741`; `use-plan-import.ts:129`                                                                                                                                                                                                                                                                                   |
| called by nothing in the frontend (2)                                  | `renameTag`, `removeTag`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | — (the directory page writes through `DirectoryApi`)                                                                                                                                                                                                                                                                                                       |

9 + 4 + 34 + 5 + 2 = 54. The table's tree reached the client through eleven props and parameters:
`WbsTableProps.api`, `usePlanRead`, `useAddWorkItem`, `usePlanStructure`, `usePlanDependencies`,
`useEstimateDrafts`, `usePlanFields`, `useReferenceSets`, `PlanLiveValues.api` (the two columns),
`PlanToolbar`'s `api`, and `PlanFeedForReader.api`.

### 3.2 The three private ports

Each port is a `Pick<ProjectApi, …>` named after its module, exactly as
`CalendarMarkerRoutes` already is (`calendar-markers/contract.ts:34-37`). A `Pick` rather than a
hand-copied interface, because every route's contract is `ProjectApi`'s JSDoc and a second copy would
drift from it (R3); the client satisfies each port by construction, so the composition root narrows
by type and not by building wrapper objects.

- **`PlanReadRoutes`** — declared beside `createPlanRefresh` in `lib/plan-refresh.ts`, its only
  reader. `createPlanRefresh({ projectId, routes })` replaces `{ projectId, api }`, and
  `PlanFeedForReader.routes` replaces `.api`. The owner already looks each route up when it reads
  (`() => api.tree(projectId)`), and still does.
- **`CalendarMarkerRoutes`** — unchanged; its module is untouched but for one JSDoc and one README
  sentence naming its new caller.
- **`PlanCommandRoutes`** — the new `modules/plan-commands/contract.ts`, from two `as const` lists,
  `PROJECT_COMMAND_ROUTES` (18) and `WORK_ITEM_COMMAND_ROUTES` (16), so a test can walk them.

A port is **private**: only its own module and the composition root name it. Delivery imports none
of the three (rule K2), which slice 3's `git grep` in section 9.3 shows.

### 3.3 `PlanCommands` — the feature delivery sees instead of the client

`createPlanCommands({ projectId, routes })` (`plan-commands.feature.ts`) returns one member per route.
Three rules, each with its own example test and fault (section 8.1):

| Rule                                                                                                                                                                                    | Test                                                                                     | Faults     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| a project route is sent to the bound project, first, with the rest exactly as given, and the caller receives the route's own promise — a refusal arrives as the object the client threw | `sends every project command to the project it was bound to, with the rest as given`     | `p1`, `p4` |
| a work-item route is passed through unchanged, and an argument the caller left out stays out (`setStatus`'s optional `factStart`)                                                       | `passes every work-item command through unchanged, leaving out what the caller left out` | `p2`, `p5` |
| each member looks its route up when it is **called**, so a suite that replaces or records a client method after the table is drawn still sees every request                             | `reaches each route when it is called, not when the commands were built`                 | `p3`       |

The type is derived, not restated: `PlanCommands` maps each project route through `BoundToProject`
(the same function less its first parameter) and passes each work-item route's type through.
`plan-commands.feature.ts` carries `// @capability wbs-table-modules`, following the one precedent
(`calendar-markers.feature.ts` carries `// @capability plan-refresh`): `wbs-table-modules` is the
existing capability under `openspec/specs/` whose requirement "Concept modules preserve table
behavior" these commands serve. Keep it as written.

Binding the project is the one thing the module decides; the table no longer names the project in a
write, so a gesture cannot send to a project its commands were not built for.

### 3.4 The composition root — `modules/project/`

`projectServicesOver(client: ProjectApi): ProjectServices` is the one place in the frontend that
holds the client and cuts the three ports from it:

```ts
export interface ProjectServices {
  readonly planFeedFor: (reader: PlanFeedReader) => PlanFeed;
  readonly calendarMarkersFor: (reader: CalendarMarkersReader) => CalendarMarkers;
  readonly planCommandsFor: (projectId: string) => PlanCommands;
}
```

`PlanFeedReader` is `Omit<PlanFeedForReader, 'routes'>` and `CalendarMarkersReader` is
`Omit<CalendarMarkersHost, 'api'>`: a reader hands everything but the routes, and the root adds them.
**Factories, not instances**, because the table still owns when each service opens and closes; task
10's project runtime builds them once per selected project instead.

Its rules and tests (section 8.1):

| Rule                                                                                       | Test                                                                                | Fault |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----- |
| the feed reads the reader's project through the one client, and composing reads nothing    | `reads the reader’s project through the one client, and nothing before it is asked` | `k3`  |
| the marker gestures write through the one client                                           | `writes the reader’s calendar markers through the one client`                       | `k4`  |
| each `planCommandsFor(projectId)` binds that project, over the same client                 | `binds each project’s commands to that project, over the same client`               | `k1`  |
| every port reaches the client at the moment of each call, never a copy taken when composed | `reaches the client at the moment of each call, not when it was composed`           | `k2`  |

**Identity is the load-bearing property.** Every stale-owner guard that compared the client
(`activeApi.current === api` in `use-plan-read.ts`, `activeApi.current === owner` in
`use-plan-dependencies.ts`) now compares the composition (`activeServices.current ===
projectServices`) or the commands built from it. That is behaviour-neutral **only** because one client
always yields one composition: the page composes in `useMemo(…, [api])` (fault `q1` proves the memo
is load-bearing), and the table suites draw through `projectServicesOf`, a per-client `WeakMap` cache
in `src/testing/`, so a rerender with the same fake keeps its services and a new fake — the suites'
"API replacement" — is a new reader.

**No model test, and why.** Lessons 15 and 16 of the batch addendum ask for one wherever a port owns
a lifecycle, a queue or an interleaving. None of these does: the ports are types over the client,
`PlanCommands` is a table of pass-through functions, and `projectServicesOver` returns three factories
and holds no state. The feed's lifecycle is `PlanFeed`'s and the refresh owner's, both unchanged and
already proved; the only interleaving this packet touches — a late answer after the client changed —
is the table's guards, whose operand changes from the client to the composition, and those are
proved by existing examples (`d1`, `t2`) and recorded where they cannot be (section 3.8).

### 3.5 Delivery: who receives what

| Consumer                                                                                                              | Before (base)                      | After                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectPage`                                                                                                         | `api` (catalog, import, the table) | `api` for the catalog and import; `projectServicesOver(api)` in a memo for the table                                              |
| `WbsTable` (`WbsTableProps`)                                                                                          | `api: ProjectApi`                  | `projectServices: ProjectServices`; builds `commands` per `[projectServices, projectId]`                                          |
| `usePlanRead`                                                                                                         | `api`, `activeApi` ref             | `projectServices`, `commands`; `activeServices` ref                                                                               |
| `useAddWorkItem`, `usePlanStructure`, `usePlanFields`, `useEstimateDrafts`, `useReferenceSets`, `usePlanDependencies` | `api` (and `projectId` for writes) | `commands`; `projectId` dropped from `usePlanStructure` and `useReferenceSets`, which used it only to name the project in a write |
| `PlanToolbar` and the settings panels' closures                                                                       | `api`, `projectId`                 | `commands` (`projectId` stays for the toolbar's own remembered views)                                                             |
| `PlanLiveValues` (the actions and depends columns)                                                                    | `api`                              | `commands`                                                                                                                        |

Nothing in `components/` imports `ProjectApi` afterwards but `project-page.tsx` and
`use-plan-import.ts`, both for the catalog (section 9.3 records the `git grep`).

### 3.6 What moved, member by member

| Before (base)                                                                          | After                                                                                    |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `createPlanRefresh({ projectId, api: ProjectApi })`                                    | `createPlanRefresh({ projectId, routes: PlanReadRoutes })`                               |
| `PlanFeedForReader.api`                                                                | `PlanFeedForReader.routes`, supplied by `projectServicesOver`                            |
| `use-plan-read.ts` calls `planFeedForReader` and `calendarMarkersForReader` with `api` | `projectServices.planFeedFor(reader)`, `projectServices.calendarMarkersFor(reader)`      |
| `api.undo(projectId)` / `api.redo(projectId)` in `stepStack`                           | `commands.undo()` / `commands.redo()`                                                    |
| `api.<route>(projectId, …)` — eighteen project routes, in hooks, toolbar and table     | `commands.<route>(…)`                                                                    |
| `api.<route>(…)` — sixteen work-item and picker routes                                 | `commands.<route>(…)`, same arguments                                                    |
| `activeApi.current === api` (five guards in `use-plan-read.ts`)                        | `activeServices.current === projectServices`                                             |
| `activeApi.current === owner` with `owner = api` (`use-plan-dependencies.ts`)          | `activeCommands.current === owner` with `owner = commands`                               |
| `<WbsTable api={api} />` in the page and 256 suite sites                               | `<WbsTable projectServices={projectServices} />`; `projectServicesOf(api)` in the suites |

No existing `Proof:` comment is added, removed or edited by any of section 7's diffs:
`grep -nE '^[-+].*Proof'` over the nine extracted patches prints nothing. The ones beside edited
lines — `use-plan-dependencies.ts`'s "clearing without the API-owner guard", `wbs-table.tsx`'s two
JSON-download notes — describe checks this packet does not change.

### 3.7 Existing behaviour, and the tests that already hold it

Every one of these is in the twenty adopted files, which slices 2 and 3 run whole and expect
**unchanged** (1215 → 1215 → 1215 on the rehearsal). None is edited beyond slice 3's named prop edit.

| Behaviour                                   | Existing test(s)                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a write reaches the project the table shows | `plan-table.test.tsx` › `keeps an add burst and its refetch inside the project where it started` (one mount, `p1` then `p2`; fault `t1`)                                                                                                               |
| stale owner — an old client's success       | `plan-read-and-write.test.tsx` › `does not spend an old API success against its busy replacement`, `does not announce an old arrangement in its busy replacement`, `does not announce an arrangement after its covering read changes API owner` (`t2`) |
| stale owner — an old client's refusal       | `plan-read-and-write.test.tsx` › `does not toast an old API mutation refusal into its replacement`, `keeps an old dependency-list refusal out of its busy API replacement` (`d1`)                                                                      |
| stale owner — an old client's read          | `plan-read-and-write.test.tsx:1691`, the `it.each` `'ignores an old API read that settles by %s on the same project'`                                                                                                                                  |
| one feed and one socket per client          | `project-page.test.tsx:2503`, the `it.each` `'recovers a persistent %s without replacing the registered socket'` over `resume_ack` and `resume_denied` (`q1`)                                                                                          |
| StrictMode                                  | `plan-read-and-write.test.tsx` › `creates a live second owner after StrictMode cleans up its first setup`                                                                                                                                              |
| refusal, busy, focus                        | `says a refused rename in a toast, and puts nothing above the table`, `says the toolbar is busy, and marks the controls the wait holds back`, `plan-keyboard.test.tsx` › `Cmd+Enter on the last row makes one and lands in it`                         |
| markers                                     | `plan-chart-seam.test.tsx` › `rereads a marker refused because a peer already deleted it`                                                                                                                                                              |
| export                                      | `downloads JSON with collapsed and filtered-out rows`, `reports a rejected JSON download and creates no file`                                                                                                                                          |

### 3.8 What this packet does not claim

- **Four guards are carried, not re-proved.** The services comparison in the feed's
  `isActiveReader`, in `refreshResourcesOrMarkStale`, in the markers' `isActiveReader` and in
  `stepStack`'s `isCurrent` (`use-plan-read.ts`) replaces `activeApi.current === api` there, which
  had no `Proof:` on the base either. Removing the comparison at each of the four was rehearsed
  against all twenty adopted files and **no test failed** (section 9.3): each is reached only between
  a commit that installs new services and the passive effect that retires the old feed, a window
  React's synchronous test commits do not open. The same expression at the writer (`t2`) and the
  same identity at the dependency list (`d1`) are proved; task 11 ("a stale completion changes
  nothing") owns a test that opens that window.
- The composition root narrows by **type**: the object handed to each module is the client itself,
  typed as the port. Nothing but the compiler stops a cast; R5 forbids an unchecked cast, and task
  13's architecture checks are what will refuse one.
- `PlanCommands` owns no gesture policy; it is not the design's command services.
- `ProjectApi` is still the page's for the catalog and the import (section 3.1). A K2-clean catalog
  is its own prerequisite in the lifetime map.
- The table suites draw the table through `projectServicesOf`, a test cache, not through the page;
  `project-page.test.tsx` and `app-router.test.tsx` are what exercise the page's own composition.

## 4. Verified facts

Every number is a **fresh observation from this packet's own rehearsal** on 2026-09-24, on
`c79ec665` — the planning head `57f8c265` merged with packet g's final rehearsal tree `8e3aa727` —
and on three rehearsal commits laid over it, one per slice. None is a stop condition: each slice
records its own baseline in step 0 and compares relatively.

### 4.1 The code as it stands

| Fact                                                                                                                                                                                                                   | Where                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ProjectApi` has 54 methods; section 3.1 places each                                                                                                                                                                   | `lib/wbs-api.ts:1363-1751`                                                                     |
| the one client is built by the page, memoised on the token and the test override                                                                                                                                       | `project-page.tsx:481`                                                                         |
| the page hands it to the table, keyed by the selected project                                                                                                                                                          | `project-page.tsx:1216-1235` (`key={selected}`, `api={api}`)                                   |
| the refresh owner takes `{ projectId, api: ProjectApi }` and reads nine routes, each looked up at the moment of the read                                                                                               | `lib/plan-refresh.ts:166-217`                                                                  |
| `PlanFeedForReader.api: ProjectApi`, used only for `createPlanRefresh`                                                                                                                                                 | `modules/plan-feed/composition.ts:13`, `:43`                                                   |
| `CalendarMarkerRoutes` is already a `Pick` of four routes; the table passes the whole client as it                                                                                                                     | `calendar-markers/contract.ts:34-43`; `use-plan-read.ts:667-677`                               |
| five guards in `use-plan-read.ts` compare `activeApi.current === api`: the feed's `isActiveReader`, `refreshResourcesOrMarkStale`, the markers' and the writer's `isActiveReader`, and `stepStack`'s `isCurrent`       | `use-plan-read.ts:622`, `:640`, `:673`, `:689`, `:726`                                         |
| the typed dependency list's guard compares the client alone: `owner = api`, `isCurrent = () => activeApi.current === owner`                                                                                            | `use-plan-dependencies.ts:45-46`, `:123-124`                                                   |
| nothing but `wbs-table.tsx` calls the six hooks, the toolbar or `PlanLiveValues`'s owner, so their signatures are free to change                                                                                       | `git grep -n "usePlanFields(\|usePlanStructure(\|…" -- apps/wbs/fe-01/src`                     |
| suites replace client methods after rendering (`api.tree = …`, `replacement.patchWorkItem = …`) and wrap them with `recordCalls`, so any port that copied a method when it was built would hide requests from them     | `plan-read-and-write.test.tsx:2490`, `:2515`; `testing/record-calls.ts`                        |
| the suites render `<WbsTable … api={…} />` at 256 sites in 17 files (the other `<WbsTable` matches are prose); `project-page.test.tsx` and `directory-page.test.tsx`'s `api=` props are the page's and the directory's | slice 3's red checkpoint counts them: `Found 256 errors in 17 files.`, one per site            |
| `fe-01` modules carry no `module-index` block, so the two new module directories owe no index entry; their READMEs follow the existing ones                                                                            | `grep -l module-index apps/wbs/fe-01/src/modules/*/README.md` (only `preferences` mentions it) |
| `devsync`'s README sweep pins no count (`the current-document sweep reaches every application, library and tool README` asserts coverage, not a number)                                                                | `tools/tool-devsync/src/repo-namespacing-handoff.test.ts:542-556`                              |
| React **19.2.8**, Vitest **5.0.0**; `-t` is a regular expression, and none of this packet's proof titles holds a metacharacter but `’`, which matches itself                                                           | `node_modules/*/package.json`                                                                  |

### 4.2 The measured blast radius

`git diff --stat c79ec665 <slice 3 rehearsal>`: **50 files, 1381 insertions, 467 deletions** — 9 new
files and 41 modified; with `verify.md`, which only the executor writes, the three slices own 51
paths. By slice: slice 1 owns 16 (8 new), slice 2 owns 13, slice 3 owns 29 (1 new) —
`use-plan-read.ts` is in all three, `wbs-table.tsx` in 2 and 3, `spec.md` and `verify.md` in every
one.

| Tree                            | Adopted set (20 files, serial) |
| ------------------------------- | ------------------------------ |
| base `c79ec665`                 | 20 files, 1215 tests, exit 0   |
| after slice 1 (ports and root)  | not run — nothing wired        |
| after slice 2 (hooks, commands) | 20 files, 1215 tests, exit 0   |
| after slice 3 (table's prop)    | 20 files, 1215 tests, exit 0   |

### 4.3 Planner observations on the base, not stop conditions

- Sandbox node suite (the README's command): 49 files, 680 tests. Preferences suite: 4 files, 39
  tests. Zoned (Auckland): 2 files, 3 tests. Strict OpenSpec: `{"items":114,"passed":114,"failed":0}`.
- The feed-and-markers set slice 1 runs (`src/modules/plan-feed`, `src/modules/calendar-markers`,
  `src/lib/plan-refresh.test.ts`, `src/lib/plan-refresh-stream.test.ts`): 8 files, 58 tests.
- The adopted set takes about six minutes serially; every slice that runs it says so, and preamble
  rule 19 applies — poll the log, it is still running.

## 5. File plan

Paths under `apps/wbs/fe-01/` unless they start with `openspec/` or `docs/`.

| File                                                                                                                                                                                                | Slice | Create/modify | Responsibility                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------- | ---------------------------------------------------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`                                                                                                                  | 1–3   | modify        | the requirement (slice 1), then one scenario per slice, each before its code             |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                                                                                                                                               | all   | modify        | one fresh entry per slice, appended                                                      |
| `src/modules/plan-commands/{contract.ts,plan-commands.feature.ts,README.md}`                                                                                                                        | 1     | **create**    | section 3.3: the port and the feature                                                    |
| `src/modules/plan-commands/plan-commands.feature.test.ts`                                                                                                                                           | 1     | **create**    | three examples                                                                           |
| `src/modules/project/{contract.ts,composition.ts,README.md}`                                                                                                                                        | 1     | **create**    | section 3.4: the composition root                                                        |
| `src/modules/project/composition.test.ts`                                                                                                                                                           | 1     | **create**    | four examples                                                                            |
| `src/lib/plan-refresh.ts`                                                                                                                                                                           | 1     | modify        | `PlanReadRoutes`; `createPlanRefresh({ projectId, routes })`                             |
| `src/lib/plan-refresh.test.ts`, `src/lib/plan-refresh-stream.test.ts`                                                                                                                               | 1     | modify        | the named fixture edit: three `createPlanRefresh({ projectId: 'p1', api… })` → `routes`  |
| `src/modules/plan-feed/composition.ts`                                                                                                                                                              | 1     | modify        | `PlanFeedForReader.routes`                                                               |
| `vitest.node-suites.ts`                                                                                                                                                                             | 1     | modify        | list the two DOM-free suites                                                             |
| `src/components/wbs/use-plan-read.ts`                                                                                                                                                               | 1–3   | modify        | `routes: api` (1); services, commands, guards (2); `WbsTableProps` (3)                   |
| `src/components/wbs/wbs-table.tsx`                                                                                                                                                                  | 2, 3  | modify        | compose over `api` and pass `commands` (2); take `projectServices` (3)                   |
| `src/components/wbs/{use-plan-structure,use-plan-fields,use-estimate-drafts,use-reference-sets,use-plan-dependencies}.ts`, `plan-toolbar.tsx`, `plan-live.ts`, `plan-columns/{actions,depends}.tsx` | 2     | modify        | `commands` instead of `api`                                                              |
| `src/testing/project-services-of.ts`                                                                                                                                                                | 3     | **create**    | the suites' per-client composition cache                                                 |
| the 17 table suites listed in section 6, slice 3 step 3                                                                                                                                             | 3     | modify        | the named fixture edit: `api={X}` → `projectServices={projectServicesOf(X)}`, one import |
| `src/components/wbs/project-page.tsx`                                                                                                                                                               | 3     | modify        | compose once per client and hand the table the services                                  |
| `src/modules/{plan-feed,calendar-markers,plan-writer}/README.md`, `src/modules/calendar-markers/composition.ts`                                                                                     | 3     | modify        | name the composition root as the caller; JSDoc                                           |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`                                                                                                                          | 3     | modify        | the K2 note that names the broad client, and one resolution line                         |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                                                                                                                                                | 3     | modify        | task 9 ticked, with a dated note                                                         |

Nothing else. Not `calendar-markers/{contract,calendar-markers.feature,calendar-markers.resource}.ts`,
not `plan-feed/{contract,plan-feed.feature,plan-feed.resource}.ts` or packet g's stores and channel,
not `plan-writer/*.ts`, not `lib/wbs-api.ts`, not `project.json`, `bun.lock` or `package.json`.

### Why the slices are cut where they are

A test file that imports a module that does not exist yet stops compiling, and the commit hook lints
test files under `strictTypeChecked`, so each slice lands its tests and its implementation together,
the tests applied **first** and a real red observed in between (slices 1 and 3). Slice 2 changes no
test and adds none: it moves the client out of every hook while the table still composes over it,
so the twenty adopted suites are its oracle, unchanged, and its teeth are the fault `d1` on the one
guard whose operand it changes that an example can reach. Every file receives its `Proof:` comments
only in the last slice that patches it: `use-plan-read.ts` and `wbs-table.tsx` are patched again in
slice 3, so their faults (`t1`, `t2`) are slice 3's.

## 6. Slices

Each slice is one executor attempt and ends at a checkpoint: the executor stops and reports, and the
planner reviews and commits before the next slice is dispatched. Every block below is real `sh`, run
from the repository root unless it says `cd`. Every frontend command runs from `apps/wbs/fe-01`, one
at a time — never two Vitest runs at once, and every multi-file run with `--no-file-parallelism
--maxWorkers=1`, as the project's own `test` target runs.

### Step 0 — at the start of **every** slice

**0a. The starting state.** Before running this block, replace `<the SHA named in this attempt's
slice note>` with the 40-character hash the slice note gives (`reviewed base <sha>`); unreplaced, the
block dies on the unterminated quote. It compares that hash with `HEAD` and stops if they differ.

```sh
set -euo pipefail
mkdir -p "${TMPDIR:?}/evidence"
base=$(git rev-parse HEAD)
echo "base=$base" | tee "$TMPDIR/evidence/base.txt"
# The reviewed SHA reaches the executor through this attempt's own slice note
# (see Dispatch), not through the clone, so this comparison is independent of it.
reviewed=<the SHA named in this attempt's slice note>
test "$base" = "$reviewed"
# One snapshot, one emptiness test; --untracked-files=all lists a new file inside
# an untracked directory by itself rather than collapsing it into the directory.
git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-before.txt"
test ! -s "$TMPDIR/evidence/status-before.txt"
```

Expected: `base=` a 40-character hash equal to the slice note's, and an **empty** `status-before.txt`.

**0b. Two helpers, the patches, the one script and the adopted list**, written into `$TMPDIR` so
that every later block — each its own shell — can use them.

````sh
set -euo pipefail
cat > "$TMPDIR/run-check.sh" <<'EOF'
#!/usr/bin/env bash
# Runs one check into $TMPDIR/evidence/<name>.log, appends its own exit status,
# and prints the summary lines. Never fails itself: the status line is the result.
# The summary is orientation only: `tsc --build` under Nx without a TTY may print no
# "Found N errors" line, so a typecheck summary may show just its status.
set -uo pipefail
name=$1
shift
log="$TMPDIR/evidence/$name.log"
if "$@" > "$log" 2>&1; then status=0; else status=$?; fi
echo "status=$status" >> "$log"
test -f "$log"
if summary=$(grep -E "Test Files|Tests  |error TS|Found [0-9]+ error|^status=" "$log"); then
  printf '%s | %s\n' "$name" "$(printf '%s' "$summary" | tr '\n' ' ')"
else
  rc=$?
  test "$rc" -eq 1
fi
EOF
cat > "$TMPDIR/expect-status.sh" <<'EOF'
#!/usr/bin/env bash
# Fails unless the named check's recorded status is exactly the expected one.
set -euo pipefail
log="$TMPDIR/evidence/$1.log"
test -f "$log"
last=$(tail -n 1 "$log")
test "$last" = "status=$2"
EOF
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-h-project-api-ports.md
test -f "$packet"
mkdir -p "$TMPDIR/patches" "$TMPDIR/mutations"
# Section 7's fenced diffs, in document order, as 01.diff … 09.diff.
awk -v out="$TMPDIR/patches" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$TMPDIR/patches" -name '*.diff' | wc -l)
echo "patches=$count"
test "$count" -eq 9
# Section 7.6's one TypeScript block: the markers memo edit.
awk '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```ts$/ { capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print }
' "$packet" > "$TMPDIR/markers-memo.ts"
lines=$(wc -l < "$TMPDIR/markers-memo.ts")
echo "markers-memo.ts lines=$lines"
test "$lines" -eq 27
# Section 8's fault patches, each named by the heading "#### Proof <id>" above it.
awk -v out="$TMPDIR/mutations" '
  /^## 8\. Proofs$/ { inside=1; next }
  /^## 9\. Verification$/ { inside=0 }
  inside && /^#### Proof / { id=$3; next }
  inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$TMPDIR/mutations" -name '*.diff' | wc -l)
echo "mutations=$count"
test "$count" -eq 13
# The twenty default-tier files that render the table or the page (packet f2's
# adopted set), relative to apps/wbs/fe-01, for the serial "adopted" runs.
printf '%s\n' src/app-router.test.tsx src/components/ui/page-shortcuts.test.tsx \
  src/components/wbs/gantt-panel.test.tsx src/components/wbs/optimization-integration.test.tsx \
  src/components/wbs/plan-cards.test.tsx src/components/wbs/plan-cells.test.tsx \
  src/components/wbs/plan-chart-seam.test.tsx src/components/wbs/plan-dependencies.test.tsx \
  src/components/wbs/plan-estimates.test.tsx src/components/wbs/plan-filter.test.tsx \
  src/components/wbs/plan-keyboard.test.tsx src/components/wbs/plan-layout.test.tsx \
  src/components/wbs/plan-read-and-write.test.tsx src/components/wbs/plan-row-dependencies.test.tsx \
  src/components/wbs/plan-row-render-cost.test.tsx src/components/wbs/plan-structure.test.tsx \
  src/components/wbs/plan-table.test.tsx src/components/wbs/plan-toolbar.test.tsx \
  src/components/wbs/project-page.test.tsx src/components/wbs/project-settings-modal.test.tsx \
  > "$TMPDIR/adopted.txt"
test "$(wc -l < "$TMPDIR/adopted.txt")" -eq 20
````

Expected: `patches=9`, `markers-memo.ts lines=27`, `mutations=13`, exit 0, and
`adopted.txt` holding twenty paths. **Applying section 7.N** below always means exactly this, never a
hand edit:

```sh
set -euo pipefail
git apply --check "$TMPDIR/patches/NN.diff"
git apply "$TMPDIR/patches/NN.diff"
```

`--check` and the apply are separate commands on purpose: joined with `&&` under `set -e`, a failed
check would not stop the shell (packet g's section 9.1 records that rehearsal). `git apply` without
`--index` writes only the working tree, which the read-only `.git` allows. The nine diffs are
numbered in section order, skipping 7.6, which is the script: 7.1 is `01.diff`, 7.2 `02`, 7.3 `03`,
7.4 `04`, 7.5 `05`, 7.7 `06`, 7.8 `07`, 7.9 `08`, 7.10 `09`.

**0c. The baselines every slice records**, before any edit. The slice's own extra baselines follow in
its step 1.

```sh
set -euo pipefail
cd apps/wbs/fe-01
bash "$TMPDIR/run-check.sh" base-preferences env TZ=UTC bunx vitest run src/modules/preferences
bash "$TMPDIR/run-check.sh" base-sandbox bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
bash "$TMPDIR/expect-status.sh" base-preferences 0
bash "$TMPDIR/expect-status.sh" base-sandbox 0
```

And the OpenSpec baseline with the README's strict block (section 9.2):

```sh
set -euo pipefail
report=$(mktemp "$TMPDIR/evidence/openspec-base.XXXXXX.json")
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
jq -c '.summary.totals' "$report"
```

**Record every number.** Every later count in a slice is that slice's own step-0 number plus or minus
what the slice itself adds, never an absolute. Rehearsed values are given beside each expectation for
orientation only (section 9.3 has them per slice).

In the sandbox the executor never runs `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e` or `tool-devsync:test`; section 9.4 gives each to the planner with its expected
relative delta.

### Slice 1 — the ports, the plan commands and the composition root

Owns (16 paths): `spec.md`, `verify.md`, `apps/wbs/fe-01/vitest.node-suites.ts`, and under
`apps/wbs/fe-01/src/`: `lib/plan-refresh.ts`, `lib/plan-refresh.test.ts`,
`lib/plan-refresh-stream.test.ts`, `modules/plan-feed/composition.ts`,
`components/wbs/use-plan-read.ts`, and eight new files — `modules/plan-commands/{contract.ts,
plan-commands.feature.ts,plan-commands.feature.test.ts,README.md}` and `modules/project/{contract.ts,
composition.ts,composition.test.ts,README.md}`.

- [ ] 1. Step 0, then the feed-and-markers set and the read-and-write suite:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-base-feed env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/modules/plan-feed src/modules/calendar-markers \
    src/lib/plan-refresh.test.ts src/lib/plan-refresh-stream.test.ts
  bash "$TMPDIR/run-check.sh" s1-base-read env TZ=UTC bunx vitest run \
    src/components/wbs/plan-read-and-write.test.tsx
  bash "$TMPDIR/expect-status.sh" s1-base-feed 0
  bash "$TMPDIR/expect-status.sh" s1-base-read 0
  ```

  Expected `status=0` for both. Rehearsed: feed 8 files, 58 tests; read-and-write 88 tests.

- [ ] 2. **The contract first (R4).** Apply section 7.1 (the new requirement and its first scenario)
      and rerun the strict block. Expected: exit 0, `passed` equal to step 0's number (items are
      counted per document; rehearsed 114 → 114).
- [ ] 3. Apply section 7.2: the two new suites and the **one named fixture edit** of this slice, so
      it is not mistaken for drift — the three `createPlanRefresh({ projectId: 'p1', api… })` calls
      in `plan-refresh.test.ts` (lines 19 and 63) and `plan-refresh-stream.test.ts` (line 86) name
      their client `routes` instead of `api`. No `expect` line changes. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-red-vitest env TZ=UTC bunx vitest run \
    src/modules/plan-commands/plan-commands.feature.test.ts src/modules/project/composition.test.ts \
    src/lib/plan-refresh.test.ts
  bash "$TMPDIR/expect-status.sh" s1-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s1-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 47 errors in 4 files.` — per file and
  code: `plan-commands.feature.test.ts` 2 × TS2307, 6 × TS7006, 34 × TS7019 (the recording port's
  parameters, untyped while `PlanCommandRoutes` cannot be found); `project/composition.test.ts` 1 ×
  TS2307, 1 × TS7006; `plan-refresh.test.ts` 2 × TS2353; `plan-refresh-stream.test.ts` 1 × TS2353.
  The five that name the cause:

  ```text
  apps/wbs/fe-01/src/lib/plan-refresh-stream.test.ts:86:54 - error TS2353: Object literal may only specify known properties, and 'routes' does not exist in type '{ projectId: string; api: ProjectApi; }'.
  apps/wbs/fe-01/src/lib/plan-refresh.test.ts:19:54 - error TS2353: Object literal may only specify known properties, and 'routes' does not exist in type '{ projectId: string; api: ProjectApi; }'.
  apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.test.ts:7:8 - error TS2307: Cannot find module './contract' or its corresponding type declarations.
  apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.test.ts:8:36 - error TS2307: Cannot find module './plan-commands.feature' or its corresponding type declarations.
  apps/wbs/fe-01/src/modules/project/composition.test.ts:9:37 - error TS2307: Cannot find module './composition' or its corresponding type declarations.
  ```

  and Vitest `status=1`, `Test Files 3 failed (3)`, `Tests 14 failed (14)`: the two new files on
  `Failed to resolve import "./contract"` and `Failed to resolve import "./composition"`, and all
  fourteen tests of `plan-refresh.test.ts` on `expected 'failed' to be 'installed'` — the owner reads
  through an `api` it was never handed.

- [ ] 4. Apply section 7.3: the two modules, the two READMEs, `plan-refresh.ts`, the feed's
      composition, `use-plan-read.ts`'s one `routes: api`, and the two lines in `vitest.node-suites.ts`.
- [ ] 5. **Green checkpoint.**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-green-feed env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/modules/plan-commands src/modules/project src/modules/plan-feed \
    src/modules/calendar-markers src/lib/plan-refresh.test.ts src/lib/plan-refresh-stream.test.ts
  bash "$TMPDIR/run-check.sh" s1-green-read env TZ=UTC bunx vitest run \
    src/components/wbs/plan-read-and-write.test.tsx
  bash "$TMPDIR/run-check.sh" s1-green-tiers env TZ=UTC bunx vitest run src/test-tiers.test.ts
  bash "$TMPDIR/run-check.sh" s1-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s1-green-typecheck s1-green-feed s1-green-read s1-green-tiers s1-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: feed = step 1's **+ 2 files, + 7 tests** (rehearsed 8·58 → 10·65:
  three command examples, four composition examples); read-and-write unchanged from step 1 (88);
  tiers 5 tests; sandbox = step 0 **+ 2 files, + 7 tests** (rehearsed 49·680 → 51·687).

- [ ] 6. Durable lint, from the repository root:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-lint env NX_DAEMON=false bunx nx run wbs-fe-01:lint
  bash "$TMPDIR/expect-status.sh" s1-lint 0
  ```

  An autofixable import-order or Prettier finding is fixed with `bunx eslint --fix <file>`, not
  reported as a stop (preamble rule 17).

- [ ] 7. The nine proofs of section 8.1 (`p1`–`p5` on the commands, `k1`–`k4` on the composition
      root), with section 8's procedure: every fault observed first, then the `Proof:` comments at
      the sites the table names.
- [ ] 8. Rerun the two new suites as `s1-final-modules` — step 5's feed command with only
      `src/modules/plan-commands` and `src/modules/project`, expected 2 files, 7 tests — and step
      0c's preferences and sandbox commands (`s1-final-*`): preferences unchanged, sandbox as step 5.
- [ ] 9. Append this slice's `verify.md` entry (shape below), then owned-file Prettier over the
      sixteen paths, `--write` then `--check`, from this list, which step 10 reuses; then rerun the
      strict OpenSpec block — **after** the evidence edit, so the document it just changed is what
      was checked.

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/components/wbs/use-plan-read.ts \
    apps/wbs/fe-01/src/lib/plan-refresh-stream.test.ts \
    apps/wbs/fe-01/src/lib/plan-refresh.test.ts \
    apps/wbs/fe-01/src/lib/plan-refresh.ts \
    apps/wbs/fe-01/src/modules/plan-commands/README.md \
    apps/wbs/fe-01/src/modules/plan-commands/contract.ts \
    apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.test.ts \
    apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts \
    apps/wbs/fe-01/src/modules/plan-feed/composition.ts \
    apps/wbs/fe-01/src/modules/project/README.md \
    apps/wbs/fe-01/src/modules/project/composition.test.ts \
    apps/wbs/fe-01/src/modules/project/composition.ts \
    apps/wbs/fe-01/src/modules/project/contract.ts \
    apps/wbs/fe-01/vitest.node-suites.ts \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 16
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 10. Hand over — the working tree's changed paths compared with the owned list:

  ```sh
  set -euo pipefail
  git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  sort "$TMPDIR/owned.txt" > "$TMPDIR/evidence/owned-sorted.txt"
  diff "$TMPDIR/evidence/owned-sorted.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: the `diff` prints nothing and exits 0: exactly the sixteen owned paths — ` M` for `spec.md`, `verify.md`,
  `vitest.node-suites.ts`, `plan-refresh.ts`, `plan-refresh.test.ts`, `plan-refresh-stream.test.ts`,
  `plan-feed/composition.ts` and `use-plan-read.ts`, and `??` for the eight new files — and nothing
  else.

Planner commit subject: `feat(frontend): put the plan feed and the plan commands behind their own ports`.

### Slice 2 — the table's hooks, toolbar and columns write through the project's commands

Owns (13 paths): `spec.md`, `verify.md`, and under `apps/wbs/fe-01/src/components/wbs/`:
`use-plan-read.ts`, `wbs-table.tsx`, `use-plan-structure.ts`, `use-plan-fields.ts`,
`use-estimate-drafts.ts`, `use-reference-sets.ts`, `use-plan-dependencies.ts`, `plan-toolbar.tsx`,
`plan-live.ts`, `plan-columns/actions.tsx`, `plan-columns/depends.tsx`.

- [ ] 1. Step 0, then the adopted set and the zoned suite:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046 # the list is twenty fixed paths without spaces
  bash "$TMPDIR/run-check.sh" s2-base-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s2-base-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/expect-status.sh" s2-base-adopted 0
  bash "$TMPDIR/expect-status.sh" s2-base-zoned 0
  ```

  Expected `status=0` for both. Rehearsed: adopted 20 files, 1215 tests (about six minutes — the run
  outlives a tool wait; poll the log, it is still running); zoned 2 files, 3 tests.

- [ ] 2. **The contract first.** Apply section 7.4 (the scenario "The table's gestures write through
      the project's commands") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. **No red, by design.** This slice adds and edits no test: the table still takes `api` and
      composes over it itself, so every existing suite draws the same table and must see the same
      thing. The adopted set is the oracle — unchanged, not + anything — and the slice's teeth are
      fault `d1` (section 8.2).
- [ ] 4. Apply section 7.5 (eleven files), then run section 7.6, the markers memo edit, which is a
      script rather than a diff because packet g's slice 5 writes a `Proof:` comment inside that
      memo whose text no diff here can know (section 7.6 says why):

  ```sh
  set -euo pipefail
  file=apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
  test -f "$file"
  test -f "$TMPDIR/markers-memo.ts"
  bun "$TMPDIR/markers-memo.ts" "$file" | tee "$TMPDIR/evidence/s2-markers-memo.txt"
  ```

  Expected: one line, `markers memo rewritten, N comment lines kept`, exit 0 — `N` is however many
  `//` lines packet g left above that memo's `announceRefusal` (0 on this packet's rehearsal base;
  record the number). Any other output, or a non-zero exit, is a stop.

- [ ] 5. **Green checkpoint.**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s2-green-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s2-green-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s2-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s2-green-typecheck s2-green-adopted s2-green-zoned s2-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: adopted **unchanged** from step 1 (rehearsed 1215 → 1215) — the
  move is behaviour-neutral; zoned unchanged (2·3); sandbox unchanged from step 0 (51·687).

- [ ] 6. Durable lint (`s2-lint`), expected `status=0`.
- [ ] 7. The one proof of section 8.2 (`d1`); the comment afterwards, at the named site.
- [ ] 8. Rerun `plan-read-and-write.test.tsx` alone (`s2-final-read`, expected its step-1 share of the
      adopted set, rehearsed 88 tests) and step 0c's preferences and sandbox commands (`s2-final-*`):
      unchanged from step 5.
- [ ] 9. `verify.md` entry, then owned-file Prettier over the thirteen paths from this list (step 10
      reuses it), then the strict OpenSpec block:

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/components/wbs/plan-columns/actions.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-columns/depends.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-live.ts \
    apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx \
    apps/wbs/fe-01/src/components/wbs/use-estimate-drafts.ts \
    apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts \
    apps/wbs/fe-01/src/components/wbs/use-plan-fields.ts \
    apps/wbs/fe-01/src/components/wbs/use-plan-read.ts \
    apps/wbs/fe-01/src/components/wbs/use-plan-structure.ts \
    apps/wbs/fe-01/src/components/wbs/use-reference-sets.ts \
    apps/wbs/fe-01/src/components/wbs/wbs-table.tsx \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 13
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 10. Hand over, with slice 1 step 10's block unchanged (it reads this slice's `owned.txt`).
      Expected: the `diff` prints nothing and exits 0 — exactly thirteen ` M` paths, the list above,
      and nothing else.

Planner commit subject:
`refactor(frontend): hand the table's hooks the project's commands instead of the client`.

### Slice 3 — the table takes the project's services, the page composes them, and task 9 closes

Owns (29 paths): `spec.md`, `verify.md`, `tasks.md` (all three under
`openspec/changes/adopt-frontend-lifetimes/`), `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`,
and under `apps/wbs/fe-01/src/`: `testing/project-services-of.ts` (new),
`components/wbs/{use-plan-read.ts,wbs-table.tsx,project-page.tsx}`,
`modules/{plan-feed,calendar-markers,plan-writer}/README.md`, `modules/calendar-markers/composition.ts`,
and the seventeen table suites — `components/ui/page-shortcuts.test.tsx` and, under
`components/wbs/`, `gantt-panel`, `optimization-integration`, `plan-cards`, `plan-cells`,
`plan-chart-seam`, `plan-dependencies`, `plan-estimates`, `plan-filter`, `plan-keyboard`,
`plan-layout`, `plan-read-and-write`, `plan-row-dependencies`, `plan-row-render-cost`,
`plan-structure`, `plan-table` and `plan-toolbar` (each `.test.tsx`).

- [ ] 1. Step 0, then the adopted set, the zoned suite, and the page with the router that renders it:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s3-base-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s3-base-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s3-base-page env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/components/wbs/project-page.test.tsx src/app-router.test.tsx
  for check in s3-base-adopted s3-base-zoned s3-base-page; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` for all three. Rehearsed: adopted 1215; zoned 2·3; page and router 2 files, 78
  tests.

- [ ] 2. **The contract first.** Apply section 7.7 (the scenario "The page composes the table's
      services once per client") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.8: the new `src/testing/project-services-of.ts` and **the one named fixture
      edit** of this slice, so it is not mistaken for drift — in each of the seventeen suites every
      `<WbsTable … api={X} … />` becomes `<WbsTable … projectServices={projectServicesOf(X)} … />`
      (256 sites; `X` is whatever expression was there, unchanged), and one import line,
      `import { projectServicesOf } from '@/testing/project-services-of';`, is added after the
      `@/testing/live-application` import. No `expect` line, no other prop and no other statement
      changes; Prettier re-wraps a few of the longer elements. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s3-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s3-red-vitest env TZ=UTC bunx vitest run \
    src/components/wbs/plan-row-dependencies.test.tsx
  bash "$TMPDIR/expect-status.sh" s3-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s3-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 256 errors in 17 files.`, every one
  `TS2322` at a `<WbsTable` site — 1 in `page-shortcuts`, 3 `gantt-panel`, 7
  `optimization-integration`, 56 `plan-cards`, 31 `plan-cells`, 4 `plan-chart-seam`, 9
  `plan-dependencies`, 6 `plan-estimates`, 15 `plan-filter`, 3 `plan-keyboard`, 23 `plan-layout`, 44
  `plan-read-and-write`, 1 `plan-row-dependencies`, 5 `plan-row-render-cost`, 8 `plan-structure`, 25
  `plan-table`, 15 `plan-toolbar` — the first of them:

  ```text
  apps/wbs/fe-01/src/components/ui/page-shortcuts.test.tsx:155:34 - error TS2322: Type '{ projectId: string; projectServices: ProjectServices; }' is not assignable to type 'IntrinsicAttributes & WbsTableProps'.
  ```

  and Vitest `status=1`, `Test Files 1 failed (1)`, `Tests 5 failed (5)`, all five on
  `Unable to find a label with the text of: Name of 010` — the table, handed no client, draws no
  plan.

- [ ] 4. Apply sections 7.9 (`use-plan-read.ts`'s `WbsTableProps`, `wbs-table.tsx`,
      `project-page.tsx`) and 7.10 (the three READMEs, the markers composition's JSDoc, the lifetime
      map, `tasks.md`), then date the two notes by observation, never by copying a date from this
      packet:

  ```sh
  set -euo pipefail
  observed=$(date -u +%F)
  for note in openspec/changes/adopt-frontend-lifetimes/tasks.md \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md; do
    test -f "$note"
    test "$(grep -c '<observed-date>' "$note")" -eq 1
    sed -i "s/<observed-date>/$observed/" "$note"
    grep -n "observed $observed" "$note"
    if grep -n '<observed-date>' "$note"; then echo "placeholder left in $note" >&2; exit 1; else rc=$?; test "$rc" -eq 1; fi
  done
  ```

  Expected: one line printed per file, exit 0; task 9's box is `[x]`.

- [ ] 5. **Green checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s3-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  bash "$TMPDIR/run-check.sh" s3-format env NX_DAEMON=false bunx nx format:check --all
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046
  bash "$TMPDIR/run-check.sh" s3-green-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s3-green-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1
  bash "$TMPDIR/run-check.sh" s3-green-page env TZ=UTC bunx vitest run --no-file-parallelism \
    --maxWorkers=1 src/components/wbs/project-page.test.tsx src/app-router.test.tsx
  bash "$TMPDIR/run-check.sh" s3-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s3-green-typecheck s3-format s3-green-adopted s3-green-zoned s3-green-page \
    s3-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected `status=0` everywhere: adopted **unchanged** from step 1 (rehearsed 1215 → 1215); zoned
  unchanged; page and router unchanged (78); sandbox unchanged from step 0 (51·687).

  And the client is gone from delivery:

  ```sh
  set -euo pipefail
  git grep -lE "type ProjectApi\b|: ProjectApi\b" -- apps/wbs/fe-01/src/components \
    ':!*.test.ts' ':!*.test.tsx' | tee "$TMPDIR/evidence/s3-client-holders.txt"
  expected=$(printf '%s\n%s' apps/wbs/fe-01/src/components/wbs/project-page.tsx \
    apps/wbs/fe-01/src/components/wbs/use-plan-import.ts)
  test "$(cat "$TMPDIR/evidence/s3-client-holders.txt")" = "$expected"
  ```

  Expected: exactly those two paths — the page's catalog and its import — exit 0. On this slice's
  base the same command also lists `use-plan-read.ts` (`WbsTableProps.api`), and on packet g's tree it
  listed ten files: those three, `plan-live.ts`, `plan-toolbar.tsx` and five hooks.

- [ ] 6. Durable lint (`s3-lint`), expected `status=0`.
- [ ] 7. The three proofs of section 8.3 (`t1`, `t2` on the table, `q1` on the page); every fault
      first, then the comments at the named sites.
- [ ] 8. Rerun the page pair (`s3-final-page`) and step 0c's preferences and sandbox commands
      (`s3-final-*`): unchanged from step 5.
- [ ] 9. `verify.md` entry. Then owned-file Prettier over the twenty-nine paths from this list (step 10
      reuses it), `nx format:check --all` again (`s3-format-after`), and the strict OpenSpec block —
      all after the evidence edit. Never a repository-wide format **write**.

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/src/components/ui/page-shortcuts.test.tsx \
    apps/wbs/fe-01/src/components/wbs/gantt-panel.test.tsx \
    apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-cards.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-cells.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-dependencies.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-filter.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-keyboard.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-layout.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-row-dependencies.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-row-render-cost.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-structure.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx \
    apps/wbs/fe-01/src/components/wbs/plan-toolbar.test.tsx \
    apps/wbs/fe-01/src/components/wbs/project-page.tsx \
    apps/wbs/fe-01/src/components/wbs/use-plan-read.ts \
    apps/wbs/fe-01/src/components/wbs/wbs-table.tsx \
    apps/wbs/fe-01/src/modules/calendar-markers/README.md \
    apps/wbs/fe-01/src/modules/calendar-markers/composition.ts \
    apps/wbs/fe-01/src/modules/plan-feed/README.md \
    apps/wbs/fe-01/src/modules/plan-writer/README.md \
    apps/wbs/fe-01/src/testing/project-services-of.ts \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/tasks.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md \
    > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 29
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 10. Hand over, with slice 1 step 10's block unchanged (it reads this slice's `owned.txt`).
      Expected: the `diff` prints nothing and exits 0 — exactly twenty-eight ` M` paths and one `??`
      (`apps/wbs/fe-01/src/testing/project-services-of.ts`), the list above, and nothing else.

Planner commit subject:
`refactor(frontend): hand the table the project's services, composed by the page, and close task 9`.

### Verification record entries

Each slice appends one entry to `openspec/changes/adopt-frontend-lifetimes/verify.md`, headed
`## Packet 050.7h, slice N — <what the slice did>`, containing only its own observations: the attempt
id and starting hash; step 0's baselines as numbers; every command's status; the red checkpoint's own
diagnostics (or, for slice 2, that it has none by design, and the markers script's printed line);
the green counts; every proof of that slice with its observed message; and what stayed **pending
planner verification** — `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`,
`tool-devsync:test` and the host gate. Evidence references are basenames relative to that attempt's
evidence directory, never absolute paths. Do not read, quote or restate an earlier entry.

### Dispatch

One attempt per slice, from the reviewed packet, with no network. The base of slice 1 is the planning
lineage that contains packet g's last slice **and** this packet — main after g's PR merged with this
packet's branch. That base holds packet g's real commits, which differ from the rehearsal tree this
packet was cut against (`c79ec665`) by g's `Proof:` comments and verification record: before the first
dispatch the planner reruns section 9.1's script on it with `git archive <base>` (section 9.1 also
records the run against a copy with every one of g's comment sites filled), and the `index` lines in
the diffs are informational (`git apply` without `--index` or `--3way` ignores them). This block holds
the only absolute paths in this document.

```sh
# Slice 1, from the reviewed base; G5 is packet g's slice-5 planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-h-project-api-ports 1 <reviewed-base-sha> \
  --batch batch-6 \
  --require-ancestor <G5> \
  --slice-note 'reviewed base <reviewed-base-sha>' \
  --preserve evidence

# Slices 2 and 3, each into the same clone once the previous slice is reviewed
# and committed; N is the slice, P the previous slice's planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-h-project-api-ports N P \
  --batch batch-6 \
  --require-ancestor <G5> \
  --resume --require-ancestor P \
  --slice-note 'reviewed base P' \
  --preserve evidence
```

No `--seed`: no slice reads another attempt's evidence. No `--network`: nothing reaches a host.
`--slice-note` is load-bearing: it is the only channel by which the reviewed SHA reaches the executor
without passing through the clone, and step 0a reads it.

## 7. The code

Nine fenced diffs and one TypeScript script, in slice order. Step 0b extracts the diffs as `01.diff`
… `09.diff` and the script as `markers-memo.ts`, and section 9.1 records the run that applies all of
them to a copy of the base, with its output. None carries a `Proof:` comment, and none edits one.

### 7.1 `spec.md` — slice 1, the new requirement

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 42e7a205..312078f2 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -392,3 +392,24 @@ stores and listen to the channels, and what a reader sees SHALL NOT change.
 - **WHEN** the project's stream reports who is here or whether it is connected
 - **THEN** the page's presence store holds it and the header's presence slot is
   handed it, starting from nobody and disconnected
+
+### Requirement: The plan's modules reach the HTTP client only through their own ports
+
+The plan feed, the calendar markers and the plan commands SHALL each be handed
+only its own private repository port, cut from one HTTP client by the project
+composition root: the plan feed the routes that read the plan, the calendar
+markers the four marker routes, and the plan commands the routes a plan gesture
+writes through. Delivery - the table, its hooks, its toolbar and its columns -
+SHALL receive the project's feature-services and SHALL NOT receive the HTTP
+client or a port. A plan command SHALL be bound to the project it was built for,
+SHALL reach its route at the moment it is called, and SHALL hand back that
+route's own promise. What a reader sees SHALL NOT change.
+
+#### Scenario: A command reaches its own project through its own route
+
+- **WHEN** a project's commands send a write about the whole project or about
+  one work item, or a route of the client is replaced after the commands were
+  built
+- **THEN** the write reaches that route with the project bound first and the
+  other arguments exactly as given, the caller receives the route's own promise,
+  and a replaced route is the one called
```

### 7.2 `plan-commands.feature.test.ts` and `composition.test.ts` (**new**), and the named fixture edit in `plan-refresh.test.ts` and `plan-refresh-stream.test.ts` — slice 1

The recording port answers every route with a promise of its own that never settles: what the
examples are about happens when a command is called, and whose promise comes back is asserted by
identity. The composition examples run the real feed over `fakeProjectApi()` and record the client
with `recordCalls`.

```diff
diff --git a/apps/wbs/fe-01/src/lib/plan-refresh-stream.test.ts b/apps/wbs/fe-01/src/lib/plan-refresh-stream.test.ts
index 399cff11..d4de9e60 100644
--- a/apps/wbs/fe-01/src/lib/plan-refresh-stream.test.ts
+++ b/apps/wbs/fe-01/src/lib/plan-refresh-stream.test.ts
@@ -83,7 +83,7 @@ function scenario(initialSeq = -1) {
       return Response.json({ [collection]: [] });
     }),
   );
-  const owner = createPlanRefresh({ projectId: 'p1', api: httpProjectApi('session') });
+  const owner = createPlanRefresh({ projectId: 'p1', routes: httpProjectApi('session') });
   const sockets: Socket[] = [];
   const timers: (() => void)[] = [];
   const pending: Promise<unknown>[] = [];
diff --git a/apps/wbs/fe-01/src/lib/plan-refresh.test.ts b/apps/wbs/fe-01/src/lib/plan-refresh.test.ts
index e6d443bb..40b7f87c 100644
--- a/apps/wbs/fe-01/src/lib/plan-refresh.test.ts
+++ b/apps/wbs/fe-01/src/lib/plan-refresh.test.ts
@@ -16,7 +16,7 @@ function held<T>() {

 async function setup() {
   const api = fakeProjectApi();
-  const owner = createPlanRefresh({ projectId: 'p1', api });
+  const owner = createPlanRefresh({ projectId: 'p1', routes: api });
   expect((await owner.initialize()).status).toBe('installed');
   return { api, owner };
 }
@@ -60,7 +60,7 @@ describe('plan refresh obligations', () => {
       markers += 1;
       return Promise.resolve([]);
     };
-    const owner = createPlanRefresh({ projectId: 'p1', api });
+    const owner = createPlanRefresh({ projectId: 'p1', routes: api });
     const ready = owner.initialize();
     expect(markers).toBe(0);
     anchor.resolve(before);
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.test.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.test.ts
new file mode 100644
index 00000000..2a781b07
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.test.ts
@@ -0,0 +1,186 @@
+import { describe, expect, it } from 'vitest';
+
+import {
+  type PlanCommandRoutes,
+  PROJECT_COMMAND_ROUTES,
+  WORK_ITEM_COMMAND_ROUTES,
+} from './contract';
+import { createPlanCommands } from './plan-commands.feature';
+
+/**
+ * The port, recording every call and answering each with a promise of its own
+ * that never settles: what these tests are about happens when a command is
+ * called, and whose promise comes back is asserted by identity.
+ */
+function recordingRoutes(): {
+  readonly routes: PlanCommandRoutes;
+  readonly calls: unknown[][];
+  readonly answers: Map<string, Promise<unknown>>;
+} {
+  const calls: unknown[][] = [];
+  const answers = new Map<string, Promise<unknown>>();
+  function answer<T>(route: string, args: readonly unknown[]): Promise<T> {
+    calls.push([route, ...args]);
+    const pending = new Promise<T>(() => undefined);
+    answers.set(route, pending);
+    return pending;
+  }
+  return {
+    calls,
+    answers,
+    routes: {
+      undo: (...args) => answer('undo', args),
+      redo: (...args) => answer('redo', args),
+      exportPlan: (...args) => answer('exportPlan', args),
+      setEstimateMethod: (...args) => answer('setEstimateMethod', args),
+      setEstimateArithmetic: (...args) => answer('setEstimateArithmetic', args),
+      setDepReach: (...args) => answer('setDepReach', args),
+      setOptimizationSettings: (...args) => answer('setOptimizationSettings', args),
+      retryOptimization: (...args) => answer('retryOptimization', args),
+      setStartDate: (...args) => answer('setStartDate', args),
+      setTeamCapacity: (...args) => answer('setTeamCapacity', args),
+      setPriorityBands: (...args) => answer('setPriorityBands', args),
+      addStep: (...args) => answer('addStep', args),
+      renameStep: (...args) => answer('renameStep', args),
+      removeStep: (...args) => answer('removeStep', args),
+      createWorkItem: (...args) => answer('createWorkItem', args),
+      arrangeBySchedule: (...args) => answer('arrangeBySchedule', args),
+      freezeProject: (...args) => answer('freezeProject', args),
+      unfreezeProject: (...args) => answer('unfreezeProject', args),
+      patchWorkItem: (...args) => answer('patchWorkItem', args),
+      setStatus: (...args) => answer('setStatus', args),
+      assignPerson: (...args) => answer('assignPerson', args),
+      moveWorkItem: (...args) => answer('moveWorkItem', args),
+      duplicateWorkItem: (...args) => answer('duplicateWorkItem', args),
+      removeWorkItem: (...args) => answer('removeWorkItem', args),
+      setEstimate: (...args) => answer('setEstimate', args),
+      clearEstimate: (...args) => answer('clearEstimate', args),
+      unfreezeWorkItem: (...args) => answer('unfreezeWorkItem', args),
+      addDependency: (...args) => answer('addDependency', args),
+      removeDependency: (...args) => answer('removeDependency', args),
+      addTeam: (...args) => answer('addTeam', args),
+      addService: (...args) => answer('addService', args),
+      addWorkItemType: (...args) => answer('addWorkItemType', args),
+      addTag: (...args) => answer('addTag', args),
+      addPerson: (...args) => answer('addPerson', args),
+    },
+  };
+}
+
+describe('the plan commands of one project', () => {
+  it('sends every project command to the project it was bound to, with the rest as given', () => {
+    const { routes, calls, answers } = recordingRoutes();
+    const commands = createPlanCommands({ projectId: 'p1', routes });
+    const sent = [
+      commands.undo(),
+      commands.redo(),
+      commands.exportPlan(),
+      commands.setEstimateMethod('realistic'),
+      commands.setEstimateArithmetic({ estimateRounding: 'ceil' }),
+      commands.setDepReach('anchor-slice'),
+      commands.setOptimizationSettings({ optimizationEnabled: true }),
+      commands.retryOptimization('time', 'hash-1'),
+      commands.setStartDate('2026-10-05'),
+      commands.setTeamCapacity('team-1', 3),
+      commands.setPriorityBands([{ startsAt: 1, label: 'Critical', defaultValue: 10 }]),
+      commands.addStep('Review'),
+      commands.renameStep('step-1', 'Build'),
+      commands.removeStep('step-1', true),
+      commands.createWorkItem({ parentId: null, afterId: 'w0', name: 'Paint' }),
+      commands.arrangeBySchedule(),
+      commands.freezeProject(),
+      commands.unfreezeProject(),
+    ];
+
+    expect(calls).toStrictEqual([
+      ['undo', 'p1'],
+      ['redo', 'p1'],
+      ['exportPlan', 'p1'],
+      ['setEstimateMethod', 'p1', 'realistic'],
+      ['setEstimateArithmetic', 'p1', { estimateRounding: 'ceil' }],
+      ['setDepReach', 'p1', 'anchor-slice'],
+      ['setOptimizationSettings', 'p1', { optimizationEnabled: true }],
+      ['retryOptimization', 'p1', 'time', 'hash-1'],
+      ['setStartDate', 'p1', '2026-10-05'],
+      ['setTeamCapacity', 'p1', 'team-1', 3],
+      ['setPriorityBands', 'p1', [{ startsAt: 1, label: 'Critical', defaultValue: 10 }]],
+      ['addStep', 'p1', 'Review'],
+      ['renameStep', 'p1', 'step-1', 'Build'],
+      ['removeStep', 'p1', 'step-1', true],
+      ['createWorkItem', 'p1', { parentId: null, afterId: 'w0', name: 'Paint' }],
+      ['arrangeBySchedule', 'p1'],
+      ['freezeProject', 'p1'],
+      ['unfreezeProject', 'p1'],
+    ]);
+    // The route's own promise, not a wrapper: a refusal reaches the gesture as
+    // the object be-01's client threw.
+    PROJECT_COMMAND_ROUTES.forEach((route, index) => {
+      expect(sent[index], route).toBe(answers.get(route));
+    });
+  });
+
+  it('passes every work-item command through unchanged, leaving out what the caller left out', () => {
+    const { routes, calls, answers } = recordingRoutes();
+    const commands = createPlanCommands({ projectId: 'p1', routes });
+    const sent = [
+      commands.patchWorkItem('w1', { name: 'Paint the fence' }),
+      commands.setStatus('w1', 'done', '2026-09-24'),
+      commands.assignPerson('w1', 'step-1', null),
+      commands.moveWorkItem('w1', null, 'w0'),
+      commands.duplicateWorkItem('w1'),
+      commands.removeWorkItem('w1'),
+      commands.setEstimate('w1', 'step-1', { optimistic: 1, realistic: 2, pessimistic: 3 }),
+      commands.clearEstimate('w1', 'step-1'),
+      commands.unfreezeWorkItem('w1'),
+      commands.addDependency('w2', 'w1'),
+      commands.removeDependency('w2', 'w1'),
+      commands.addTeam('Platform'),
+      commands.addService('Billing'),
+      commands.addWorkItemType('Spike'),
+      commands.addTag('urgent'),
+      commands.addPerson('Kat', ['team-1']),
+    ];
+
+    expect(calls).toStrictEqual([
+      ['patchWorkItem', 'w1', { name: 'Paint the fence' }],
+      ['setStatus', 'w1', 'done', '2026-09-24'],
+      ['assignPerson', 'w1', 'step-1', null],
+      ['moveWorkItem', 'w1', null, 'w0'],
+      ['duplicateWorkItem', 'w1'],
+      ['removeWorkItem', 'w1'],
+      ['setEstimate', 'w1', 'step-1', { optimistic: 1, realistic: 2, pessimistic: 3 }],
+      ['clearEstimate', 'w1', 'step-1'],
+      ['unfreezeWorkItem', 'w1'],
+      ['addDependency', 'w2', 'w1'],
+      ['removeDependency', 'w2', 'w1'],
+      ['addTeam', 'Platform'],
+      ['addService', 'Billing'],
+      ['addWorkItemType', 'Spike'],
+      ['addTag', 'urgent'],
+      ['addPerson', 'Kat', ['team-1']],
+    ]);
+    WORK_ITEM_COMMAND_ROUTES.forEach((route, index) => {
+      expect(sent[index], route).toBe(answers.get(route));
+    });
+  });
+
+  it('reaches each route when it is called, not when the commands were built', () => {
+    const { routes, calls } = recordingRoutes();
+    const commands = createPlanCommands({ projectId: 'p1', routes });
+    const later: string[] = [];
+    routes.freezeProject = (projectId) => {
+      later.push(`freeze:${projectId}`);
+      return Promise.resolve();
+    };
+    routes.patchWorkItem = (id) => {
+      later.push(`patch:${id}`);
+      return Promise.resolve();
+    };
+
+    void commands.freezeProject();
+    void commands.patchWorkItem('w1', { name: 'Paint' });
+
+    expect(later).toEqual(['freeze:p1', 'patch:w1']);
+    expect(calls).toEqual([]);
+  });
+});
diff --git a/apps/wbs/fe-01/src/modules/project/composition.test.ts b/apps/wbs/fe-01/src/modules/project/composition.test.ts
new file mode 100644
index 00000000..b73fab6b
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/project/composition.test.ts
@@ -0,0 +1,119 @@
+import { describe, expect, it, vi } from 'vitest';
+
+import { createChannel } from '@/modules/channel';
+import type { PlanFeedRefusal } from '@/modules/plan-feed/contract';
+import { createDeliveredPlan } from '@/modules/plan-feed/delivered-plan-store';
+import { fakeProjectApi } from '@/testing/fake-project-api';
+import { recordCalls } from '@/testing/record-calls';
+
+import { projectServicesOver } from './composition';
+
+/** The nine routes a refresh owner reads, as the client records them. */
+const READ_ROUTES = [
+  'tree',
+  'steps',
+  'listTeams',
+  'listTags',
+  'listServices',
+  'listWorkItemTypes',
+  'listExternalSystems',
+  'listPeople',
+  'listCalendarMarkers',
+] as const;
+
+/** A reader of `projectId` that is always on screen, with its own stores. */
+function readerOf(projectId: string) {
+  return {
+    projectId,
+    subscribe: undefined,
+    isActiveReader: () => true,
+    plan: createDeliveredPlan(),
+    refusals: createChannel<PlanFeedRefusal>(),
+  };
+}
+
+describe('the project composition root', () => {
+  it('reads the reader’s project through the one client, and nothing before it is asked', async () => {
+    const client = fakeProjectApi();
+    const reads: string[] = [];
+    for (const route of READ_ROUTES) {
+      recordCalls(client, route, (...args) => reads.push([route, ...args].join(':')));
+    }
+    const services = projectServicesOver(client);
+    expect(reads).toEqual([]);
+
+    const reader = readerOf('p1');
+    const feed = services.planFeedFor(reader);
+    await vi.waitFor(() => {
+      expect(reader.plan.snapshot().tree).not.toBeNull();
+    });
+    feed.close();
+
+    expect(reads.filter((read) => read.startsWith('tree:'))).toEqual(['tree:p1']);
+    expect(new Set(reads.map((read) => read.split(':')[0]))).toEqual(new Set(READ_ROUTES));
+  });
+
+  it('writes the reader’s calendar markers through the one client', async () => {
+    const client = fakeProjectApi();
+    const creates = recordCalls(client, 'createCalendarMarker', (projectId, marker) => [
+      projectId,
+      marker.name,
+    ]);
+    const services = projectServicesOver(client);
+    const reader = readerOf('p1');
+    const feed = services.planFeedFor(reader);
+    await vi.waitFor(() => {
+      expect(reader.plan.snapshot().tree).not.toBeNull();
+    });
+    const markers = services.calendarMarkersFor({
+      projectId: 'p1',
+      readRefreshOwner: () => feed.owner,
+      isActiveReader: () => true,
+      announceRefusal: (refusal) => {
+        throw new Error(`refused: ${String(refusal.cause)}`);
+      },
+    });
+
+    await markers.add({ markerId: 'cutover', date: '2026-10-05', name: 'Cutover' });
+    feed.close();
+
+    expect(creates).toEqual([['p1', 'Cutover']]);
+    expect(client.markers.map((marker) => marker.name)).toEqual(['Cutover']);
+  });
+
+  it('binds each project’s commands to that project, over the same client', () => {
+    const client = fakeProjectApi();
+    const freezes = recordCalls(client, 'freezeProject', (projectId) => projectId);
+    const services = projectServicesOver(client);
+
+    void services.planCommandsFor('p1').freezeProject();
+    void services.planCommandsFor('p2').freezeProject();
+
+    expect(freezes).toEqual(['p1', 'p2']);
+  });
+
+  it('reaches the client at the moment of each call, not when it was composed', async () => {
+    const client = fakeProjectApi();
+    const services = projectServicesOver(client);
+    const later: string[] = [];
+    const tree = client.tree.bind(client);
+    client.tree = (projectId) => {
+      later.push(`tree:${projectId}`);
+      return tree(projectId);
+    };
+    client.arrangeBySchedule = (projectId) => {
+      later.push(`arrange:${projectId}`);
+      return Promise.resolve();
+    };
+
+    const reader = readerOf('p1');
+    const feed = services.planFeedFor(reader);
+    await vi.waitFor(() => {
+      expect(reader.plan.snapshot().tree).not.toBeNull();
+    });
+    feed.close();
+    await services.planCommandsFor('p1').arrangeBySchedule();
+
+    expect(later).toEqual(['tree:p1', 'arrange:p1']);
+  });
+});
```

### 7.3 `modules/plan-commands/*`, `modules/project/*` (**new**), `plan-refresh.ts`, `plan-feed/composition.ts`, `use-plan-read.ts` and `vitest.node-suites.ts` — slice 1

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index b80c2dfd..ca11fa0d 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -617,7 +617,7 @@ export function usePlanRead({
   useEffect(() => {
     const feed = planFeedForReader({
       projectId,
-      api,
+      routes: api,
       subscribe,
       isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
       plan,
diff --git a/apps/wbs/fe-01/src/lib/plan-refresh.ts b/apps/wbs/fe-01/src/lib/plan-refresh.ts
index 2ec425ba..3ebedac9 100644
--- a/apps/wbs/fe-01/src/lib/plan-refresh.ts
+++ b/apps/wbs/fe-01/src/lib/plan-refresh.ts
@@ -158,17 +158,43 @@ export interface PlanRefresh {
   dispose(): void;
 }

+/**
+ * The part of the HTTP client a refresh owner reads through: the plan feed's
+ * private repository port.
+ *
+ * The four resources and nothing else — the tree, the steps, the six
+ * vocabularies of the grouped directory, and the calendar markers. A refresh
+ * owner can write nothing and cannot reach another project's catalogue entry.
+ * The project composition root (`modules/project/composition.ts`) supplies it
+ * from the one client; delivery never sees it (rule K2).
+ */
+export type PlanReadRoutes = Pick<
+  ProjectApi,
+  | 'tree'
+  | 'steps'
+  | 'listTeams'
+  | 'listTags'
+  | 'listServices'
+  | 'listWorkItemTypes'
+  | 'listExternalSystems'
+  | 'listPeople'
+  | 'listCalendarMarkers'
+>;
+
 /**
  * Owns reads for one project/API lifetime. React consumes installed generations;
  * no transport promise, URL cache or unrelated resource decides their authority.
  * See openspec/changes/plan-refresh/design.md for bootstrap and sequence coverage.
+ *
+ * Every read looks its route up when it is made, so a client whose method is
+ * replaced after the owner is built is read through the replacement.
  */
 export function createPlanRefresh({
   projectId,
-  api,
+  routes,
 }: {
   projectId: string;
-  api: ProjectApi;
+  routes: PlanReadRoutes;
 }): PlanRefresh {
   let disposed = false;
   const isDisposed = (): boolean => disposed;
@@ -183,13 +209,13 @@ export function createPlanRefresh({
   const waiters = new Set<Waiter>();
   const events = new Map<number, readonly Obligation[]>();
   const tree = resourceRead(
-    () => api.tree(projectId),
+    () => routes.tree(projectId),
     () => true,
     () => disposed,
     publish,
   );
   const steps = resourceRead(
-    () => api.steps(projectId),
+    () => routes.steps(projectId),
     () => unsequencedAllowed,
     () => disposed,
     publish,
@@ -197,12 +223,12 @@ export function createPlanRefresh({
   const directory = resourceRead(
     async (): Promise<DirectoryRead> => {
       const [teams, tags, services, workItemTypes, externalSystems, people] = await Promise.all([
-        api.listTeams(),
-        api.listTags(),
-        api.listServices(),
-        api.listWorkItemTypes(),
-        api.listExternalSystems(),
-        api.listPeople(),
+        routes.listTeams(),
+        routes.listTags(),
+        routes.listServices(),
+        routes.listWorkItemTypes(),
+        routes.listExternalSystems(),
+        routes.listPeople(),
       ]);
       return { teams, tags, services, workItemTypes, externalSystems, people };
     },
@@ -211,7 +237,7 @@ export function createPlanRefresh({
     publish,
   );
   const markers = resourceRead(
-    () => api.listCalendarMarkers(projectId),
+    () => routes.listCalendarMarkers(projectId),
     () => unsequencedAllowed,
     () => disposed,
     publish,
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/README.md b/apps/wbs/fe-01/src/modules/plan-commands/README.md
new file mode 100644
index 00000000..98238003
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-commands/README.md
@@ -0,0 +1,43 @@
+# Plan commands
+
+Every request a plan gesture sends to one open project: the edits to its work items, its steps,
+its settings and its schedule, undo and redo, the archival download, and the directory entries a
+picker creates on the way to attaching one.
+
+One kind, plain TypeScript, no React (rule F1 of the code organization design in
+`docs/superpowers/specs/2026-09-19-code-organization-design.md`).
+
+- `contract.ts` declares the module's **private repository port**, `PlanCommandRoutes` — the
+  thirty-four routes of the HTTP client these commands write through and nothing else — and the
+  **feature** surface delivery sees instead, `PlanCommands` (rule K2).
+- `plan-commands.feature.ts` binds the commands to one project over that port.
+
+## What it owns
+
+- Which routes a plan command may reach. Listing the projects, renaming or importing one, and
+  reading the plan are not among them: the first three are the project catalog's, the last the
+  plan feed's.
+- The project a command is about, bound once: a table cannot send a write to a project it did not
+  open.
+- Reaching each route at the moment of the call, and handing back the route's own promise, so a
+  refusal arrives as the object the client threw.
+
+## What it does not own
+
+The gesture policy. What each write leaves out of date, which several requests make one gesture,
+and whether the answer still belongs to the reader on screen stay with the table's hooks and the
+plan writer (`modules/plan-writer/`) until the command services of the design's frontend table —
+fields, structure, dependencies, estimates, references, settings, scheduling, history — are
+extracted one by one, each consuming its own narrower port.
+
+## Relationships
+
+There is no `module.ts`: nothing in this application is composed through DI Bag yet. The one
+composition site is `modules/project/composition.ts`, which hands this module the one HTTP client
+as its port; delivery receives `PlanCommands` through the table and never the port.
+
+## Checks
+
+The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suite is
+`plan-commands.feature.test.ts`. The behaviour the move preserves is proved by the plan table's
+own suites, which run in the `test` target of the same project.
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/contract.ts b/apps/wbs/fe-01/src/modules/plan-commands/contract.ts
new file mode 100644
index 00000000..9661e0ae
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-commands/contract.ts
@@ -0,0 +1,103 @@
+import type { ProjectApi } from '@/lib/wbs-api';
+
+/**
+ * The routes a plan command sends to one project as a whole, each taking that
+ * project's id first.
+ *
+ * A value and not only a type, so a test can walk the list and a command that
+ * forgot one is named rather than silently absent.
+ */
+export const PROJECT_COMMAND_ROUTES = [
+  'undo',
+  'redo',
+  'exportPlan',
+  'setEstimateMethod',
+  'setEstimateArithmetic',
+  'setDepReach',
+  'setOptimizationSettings',
+  'retryOptimization',
+  'setStartDate',
+  'setTeamCapacity',
+  'setPriorityBands',
+  'addStep',
+  'renameStep',
+  'removeStep',
+  'createWorkItem',
+  'arrangeBySchedule',
+  'freezeProject',
+  'unfreezeProject',
+] as const;
+
+/**
+ * The routes a plan command sends about one work item, or one directory entry a
+ * picker creates on the way to attaching it — none of them names the project.
+ */
+export const WORK_ITEM_COMMAND_ROUTES = [
+  'patchWorkItem',
+  'setStatus',
+  'assignPerson',
+  'moveWorkItem',
+  'duplicateWorkItem',
+  'removeWorkItem',
+  'setEstimate',
+  'clearEstimate',
+  'unfreezeWorkItem',
+  'addDependency',
+  'removeDependency',
+  'addTeam',
+  'addService',
+  'addWorkItemType',
+  'addTag',
+  'addPerson',
+] as const;
+
+export type ProjectCommandRoute = (typeof PROJECT_COMMAND_ROUTES)[number];
+export type WorkItemCommandRoute = (typeof WORK_ITEM_COMMAND_ROUTES)[number];
+
+/**
+ * The part of the HTTP client the plan's commands write through: this module's
+ * private repository port.
+ *
+ * Narrowed to these routes rather than taken whole, as
+ * `modules/calendar-markers/contract.ts`'s `CalendarMarkerRoutes` is, so the
+ * module's surface states what it can do to a project: nothing here lists the
+ * projects, renames one, imports one, or reads the plan. Only the project
+ * composition root (`modules/project/composition.ts`) supplies it; delivery
+ * never sees it (rule K2).
+ */
+export type PlanCommandRoutes = Pick<ProjectApi, ProjectCommandRoute | WorkItemCommandRoute>;
+
+/**
+ * A project route with the project it is about already bound: the same call,
+ * less its first argument.
+ */
+type BoundToProject<Route> = Route extends (projectId: string, ...rest: infer Rest) => infer Answer
+  ? (...rest: Rest) => Answer
+  : never;
+
+/**
+ * Every request a plan gesture sends, for one project.
+ *
+ * The **feature**-service delivery sees (rule K2) in place of the broad
+ * `ProjectApi`. The project is bound when it is built, so a table cannot send a
+ * write to a project it did not open; a work item's route is passed through as
+ * it is. Every member reaches its route at the moment it is called, never
+ * earlier, and hands back the route's own promise — answer or refusal —
+ * unchanged, because the plan writer and the gestures classify a refusal by
+ * the object thrown.
+ *
+ * The gesture policy — what each write dirties, which several requests make one
+ * gesture — stays with the table's hooks and the plan writer until the command
+ * services of the code organization design are extracted one by one.
+ */
+export type PlanCommands = {
+  readonly [Route in ProjectCommandRoute]: BoundToProject<ProjectApi[Route]>;
+} & {
+  readonly [Route in WorkItemCommandRoute]: ProjectApi[Route];
+};
+
+/** What the commands need from whoever built them. */
+export interface PlanCommandPorts {
+  readonly projectId: string;
+  readonly routes: PlanCommandRoutes;
+}
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
new file mode 100644
index 00000000..c75040c3
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
@@ -0,0 +1,49 @@
+import type { PlanCommandPorts, PlanCommands } from './contract';
+
+/**
+ * Binds the plan's commands to one project over the routes it was handed.
+ *
+ * Each member looks its route up **when it is called**: the routes object is
+ * the one HTTP client, and a suite that records or replaces one of its methods
+ * after the table is drawn must still see every request. Arguments are passed
+ * on as they came, so a call that leaves an optional one out leaves it out.
+ */
+// @capability wbs-table-modules
+export function createPlanCommands({ projectId, routes }: PlanCommandPorts): PlanCommands {
+  return {
+    undo: (...rest) => routes.undo(projectId, ...rest),
+    redo: (...rest) => routes.redo(projectId, ...rest),
+    exportPlan: (...rest) => routes.exportPlan(projectId, ...rest),
+    setEstimateMethod: (...rest) => routes.setEstimateMethod(projectId, ...rest),
+    setEstimateArithmetic: (...rest) => routes.setEstimateArithmetic(projectId, ...rest),
+    setDepReach: (...rest) => routes.setDepReach(projectId, ...rest),
+    setOptimizationSettings: (...rest) => routes.setOptimizationSettings(projectId, ...rest),
+    retryOptimization: (...rest) => routes.retryOptimization(projectId, ...rest),
+    setStartDate: (...rest) => routes.setStartDate(projectId, ...rest),
+    setTeamCapacity: (...rest) => routes.setTeamCapacity(projectId, ...rest),
+    setPriorityBands: (...rest) => routes.setPriorityBands(projectId, ...rest),
+    addStep: (...rest) => routes.addStep(projectId, ...rest),
+    renameStep: (...rest) => routes.renameStep(projectId, ...rest),
+    removeStep: (...rest) => routes.removeStep(projectId, ...rest),
+    createWorkItem: (...rest) => routes.createWorkItem(projectId, ...rest),
+    arrangeBySchedule: (...rest) => routes.arrangeBySchedule(projectId, ...rest),
+    freezeProject: (...rest) => routes.freezeProject(projectId, ...rest),
+    unfreezeProject: (...rest) => routes.unfreezeProject(projectId, ...rest),
+    patchWorkItem: (...args) => routes.patchWorkItem(...args),
+    setStatus: (...args) => routes.setStatus(...args),
+    assignPerson: (...args) => routes.assignPerson(...args),
+    moveWorkItem: (...args) => routes.moveWorkItem(...args),
+    duplicateWorkItem: (...args) => routes.duplicateWorkItem(...args),
+    removeWorkItem: (...args) => routes.removeWorkItem(...args),
+    setEstimate: (...args) => routes.setEstimate(...args),
+    clearEstimate: (...args) => routes.clearEstimate(...args),
+    unfreezeWorkItem: (...args) => routes.unfreezeWorkItem(...args),
+    addDependency: (...args) => routes.addDependency(...args),
+    removeDependency: (...args) => routes.removeDependency(...args),
+    addTeam: (...args) => routes.addTeam(...args),
+    addService: (...args) => routes.addService(...args),
+    addWorkItemType: (...args) => routes.addWorkItemType(...args),
+    addTag: (...args) => routes.addTag(...args),
+    addPerson: (...args) => routes.addPerson(...args),
+  };
+}
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/composition.ts b/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
index 1db2b4a0..49cda69a 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/composition.ts
@@ -1,16 +1,19 @@
-import { createPlanRefresh } from '@/lib/plan-refresh';
+import { createPlanRefresh, type PlanReadRoutes } from '@/lib/plan-refresh';
 import type { ProjectStream } from '@/lib/project-stream';
-import type { ProjectApi } from '@/lib/wbs-api';
 import type { Publisher } from '@/modules/channel';

 import type { PlanFeed, PlanFeedRefusal, PlanFeedStreamHandlers } from './contract';
 import type { DeliveredPlanWrites } from './delivered-plan-store';
 import { createPlanFeed } from './plan-feed.feature';

-/** What a screen hands the composition site: its identity and where its answers go. */
+/**
+ * What the composition site is handed: the reader's identity, where its answers
+ * go, and the routes its refresh owner reads through.
+ */
 export interface PlanFeedForReader {
   readonly projectId: string;
-  readonly api: ProjectApi;
+  /** This module's private repository port, supplied by the project composition root. */
+  readonly routes: PlanReadRoutes;
   readonly subscribe:
     | ((projectId: string, handlers: PlanFeedStreamHandlers, baseline: number) => ProjectStream)
     | undefined;
@@ -27,20 +30,21 @@ export interface PlanFeedForReader {
  * A composition site, which the design lets see everything because it installs
  * and supplies and holds no logic. It is here rather than in the screen because
  * rule K2 says delivery imports a feature-service and nothing beneath it — the
- * same line `modules/directory-management/composition.ts` carries. The project
- * lifetime of the rollout's last Task 6 row takes this over; until then it is
- * one call.
+ * same line `modules/directory-management/composition.ts` carries. Its one
+ * caller is the project composition root, `modules/project/composition.ts`,
+ * which hands it the routes; the project lifetime of the rollout's last Task 6
+ * row takes both over.
  */
 export function planFeedForReader({
   projectId,
-  api,
+  routes,
   subscribe,
   isActiveReader,
   plan,
   refusals,
 }: PlanFeedForReader): PlanFeed {
   return createPlanFeed({
-    openOwner: () => createPlanRefresh({ projectId, api }),
+    openOwner: () => createPlanRefresh({ projectId, routes }),
     openStream:
       subscribe === undefined
         ? null
diff --git a/apps/wbs/fe-01/src/modules/project/README.md b/apps/wbs/fe-01/src/modules/project/README.md
new file mode 100644
index 00000000..4ab19def
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/project/README.md
@@ -0,0 +1,39 @@
+# Project
+
+The project composition root: the one place in the frontend that holds the plan's HTTP client
+and cuts each plan module's private repository port from it.
+
+Plain TypeScript, no React (rule F1 of the code organization design in
+`docs/superpowers/specs/2026-09-19-code-organization-design.md`).
+
+- `contract.ts` declares `ProjectServices`, what a plan screen may build for the project it shows —
+  its feed, its calendar-marker gestures and its commands — as feature-services only (rule K2).
+- `composition.ts` is `projectServicesOver`, which builds that surface over one client: the plan
+  feed reads through `PlanReadRoutes` (`src/lib/plan-refresh.ts`), the calendar markers write
+  through `CalendarMarkerRoutes` (`modules/calendar-markers/contract.ts`), and the commands write
+  through `PlanCommandRoutes` (`modules/plan-commands/contract.ts`).
+
+## What it owns
+
+- That there is one client under all three ports, and that each module sees only its own port.
+- That nothing is built or called until a factory is asked, and every port reaches the client at
+  the moment of each call.
+
+## What it does not own
+
+When anything is opened or closed. The table still opens its feed in an effect and builds its
+markers and commands in memos, per reader; the project runtime of OpenSpec task 10 of
+`adopt-frontend-lifetimes` builds them once per selected project instead. The project catalog —
+listing, creating, opening, renaming and importing projects — is the page's, on the same client,
+and is not a plan module's.
+
+## Relationships
+
+There is no `module.ts`: nothing in this application is composed through DI Bag yet, so the
+composition is a function, as `modules/directory-management/composition.ts` is.
+
+## Checks
+
+The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suite is
+`composition.test.ts`. The behaviour it preserves is proved by the plan table's and the project
+page's own suites, which run in the `test` target of the same project.
diff --git a/apps/wbs/fe-01/src/modules/project/composition.ts b/apps/wbs/fe-01/src/modules/project/composition.ts
new file mode 100644
index 00000000..7df8ed7a
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/project/composition.ts
@@ -0,0 +1,30 @@
+import type { ProjectApi } from '@/lib/wbs-api';
+import { calendarMarkersForReader } from '@/modules/calendar-markers/composition';
+import { createPlanCommands } from '@/modules/plan-commands/plan-commands.feature';
+import { planFeedForReader } from '@/modules/plan-feed/composition';
+
+import type { ProjectServices } from './contract';
+
+/**
+ * The project composition root: the one place that holds the HTTP client and
+ * cuts each plan module's private repository port from it.
+ *
+ * A composition site, which the design lets see everything because it installs
+ * and supplies and holds no logic. The client is typed as the broad
+ * `ProjectApi` here and nowhere below: each module is handed it as its own
+ * narrow port — the plan feed as `PlanReadRoutes`, the calendar markers as
+ * `CalendarMarkerRoutes`, the commands as `PlanCommandRoutes` — and the
+ * services returned expose none of them.
+ *
+ * Builds nothing and calls nothing until a factory is asked, and every port
+ * reaches the client at the moment of each call. The project lifetime of the
+ * rollout's last Task 6 row turns this into the project runtime; until then the
+ * page calls it once per client.
+ */
+export function projectServicesOver(client: ProjectApi): ProjectServices {
+  return {
+    planFeedFor: (reader) => planFeedForReader({ ...reader, routes: client }),
+    calendarMarkersFor: (reader) => calendarMarkersForReader({ ...reader, api: client }),
+    planCommandsFor: (projectId) => createPlanCommands({ projectId, routes: client }),
+  };
+}
diff --git a/apps/wbs/fe-01/src/modules/project/contract.ts b/apps/wbs/fe-01/src/modules/project/contract.ts
new file mode 100644
index 00000000..ad7500c6
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/project/contract.ts
@@ -0,0 +1,33 @@
+import type { CalendarMarkers, CalendarMarkersHost } from '@/modules/calendar-markers/contract';
+import type { PlanCommands } from '@/modules/plan-commands/contract';
+import type { PlanFeedForReader } from '@/modules/plan-feed/composition';
+import type { PlanFeed } from '@/modules/plan-feed/contract';
+
+/** What a reader hands for its feed: everything the feed needs but the routes. */
+export type PlanFeedReader = Omit<PlanFeedForReader, 'routes'>;
+
+/** What a reader hands for its marker gestures: everything they need but the routes. */
+export type CalendarMarkersReader = Omit<CalendarMarkersHost, 'api'>;
+
+/**
+ * What a plan screen may build for the project it shows: its feed, its marker
+ * gestures and its commands — feature-services only (rule K2).
+ *
+ * Factories and not instances, because the table still owns when each is
+ * opened and closed: the feed per reader effect, the markers and the commands
+ * per reader memo. The project runtime of OpenSpec task 10 builds them once
+ * per selected project instead. The HTTP client and the three private ports
+ * cut from it are inside, and no member hands either out.
+ *
+ * Its **identity** is the reader's API identity: a table that is handed a
+ * different one has been handed a different client, and every stale-owner guard
+ * that compared the client before compares this now.
+ */
+export interface ProjectServices {
+  /** Opens one reader's live plan, reading through the plan feed's routes. */
+  readonly planFeedFor: (reader: PlanFeedReader) => PlanFeed;
+  /** One reader's calendar-marker gestures, writing through the markers' routes. */
+  readonly calendarMarkersFor: (reader: CalendarMarkersReader) => CalendarMarkers;
+  /** The commands of one project, bound to it, writing through the commands' routes. */
+  readonly planCommandsFor: (projectId: string) => PlanCommands;
+}
diff --git a/apps/wbs/fe-01/vitest.node-suites.ts b/apps/wbs/fe-01/vitest.node-suites.ts
index c3dd693f..35e31dd3 100644
--- a/apps/wbs/fe-01/vitest.node-suites.ts
+++ b/apps/wbs/fe-01/vitest.node-suites.ts
@@ -66,6 +66,7 @@ export const NODE_SUITES: readonly string[] = [
   'src/modules/channel.model.test.ts',
   'src/modules/directory-management/directory-management.feature.test.ts',
   'src/modules/directory/directory.resource.test.ts',
+  'src/modules/plan-commands/plan-commands.feature.test.ts',
   'src/modules/plan-feed/delivered-plan-store.model.test.ts',
   'src/modules/plan-feed/plan-feed.feature.test.ts',
   'src/modules/plan-feed/plan-feed.resource.test.ts',
@@ -78,6 +79,7 @@ export const NODE_SUITES: readonly string[] = [
   'src/modules/preferences/module.test.ts',
   'src/modules/preferences/preferences.feature.test.ts',
   'src/modules/preferences/preferences.resource.test.ts',
+  'src/modules/project/composition.test.ts',
   // The page's own lifetime ownership: plain TypeScript over DI Bag, no browser
   // global and no component, which is the whole point of rule F1.
   'src/runtime/application-runtime.test.ts',
```

### 7.4 `spec.md` — slice 2, the scenario for the table's gestures

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 312078f2..3226406d 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -413,3 +413,12 @@ route's own promise. What a reader sees SHALL NOT change.
 - **THEN** the write reaches that route with the project bound first and the
   other arguments exactly as given, the caller receives the route's own promise,
   and a replaced route is the one called
+
+#### Scenario: The table's gestures write through the project's commands
+
+- **WHEN** a gesture in the table, its toolbar, a settings panel or a column
+  writes to the plan, or the answer to a typed dependency list arrives after the
+  table was handed another client
+- **THEN** the write goes through the commands bound to the table's project and
+  the plan is read through the feed the composition root opened, and the late
+  answer lowers no busy state and announces nothing
```

### 7.5 `use-plan-read.ts`, `wbs-table.tsx`, the five hooks, `plan-toolbar.tsx`, `plan-live.ts` and the two columns — slice 2

`wbs-table.tsx` composes `projectServicesOver(api)` in a memo keyed on `api` and binds `commands` in
a memo keyed on `[projectServices, projectId]`; everything below receives one of the two. Every
dependency list that named `api` names `commands` or `projectServices` in its place, and `projectId`
leaves the lists (and the two hooks' parameters) whose callbacks no longer read it.

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-columns/actions.tsx b/apps/wbs/fe-01/src/components/wbs/plan-columns/actions.tsx
index d5b57436..671d397f 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-columns/actions.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-columns/actions.tsx
@@ -72,7 +72,7 @@ export function createActionsColumn({ live }: { live: PlanLive }) {
                   run: () => {
                     void live.current.run((write) =>
                       write.perform(['tree'], () =>
-                        live.current.api.unfreezeWorkItem(row.original.id),
+                        live.current.commands.unfreezeWorkItem(row.original.id),
                       ),
                     );
                   },
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-columns/depends.tsx b/apps/wbs/fe-01/src/components/wbs/plan-columns/depends.tsx
index bd539536..166d911e 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-columns/depends.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-columns/depends.tsx
@@ -461,7 +461,7 @@ export function createDependsColumn({ live }: { live: PlanLive }) {
                   );
                   void live.current.run((write) =>
                     write.perform(['tree'], () =>
-                      live.current.api.removeDependency(row.original.id, id),
+                      live.current.commands.removeDependency(row.original.id, id),
                     ),
                   );
                 }}
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-live.ts b/apps/wbs/fe-01/src/components/wbs/plan-live.ts
index 6ad2e354..74c5b403 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-live.ts
+++ b/apps/wbs/fe-01/src/components/wbs/plan-live.ts
@@ -3,7 +3,7 @@ import type { IsoDate } from '@wbs/domain/workday';
 import type * as React from 'react';

 import type { RunPlanWrite } from '@/lib/local-write';
-import { type ProjectApi } from '@/lib/wbs-api';
+import type { PlanCommands } from '@/modules/plan-commands/contract';

 import { type CellCards } from './cell-card-store';
 import { type DepLights } from './dep-light-store';
@@ -23,7 +23,7 @@ import { type TreeRow } from './wbs-rows';
 export interface PlanLiveValues {
   focusIntent: React.RefObject<FocusIntent>;
   gridElement: React.RefObject<HTMLElement | null>;
-  api: ProjectApi;
+  commands: PlanCommands;
   run: RunPlanWrite;
   duplicateRow: (id: string) => Promise<CommitOutcome>;
   deleteRow: (row: TreeRow) => Promise<CommitOutcome>;
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx b/apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx
index ae3345ed..178ad68b 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx
@@ -16,7 +16,8 @@ import { Button, buttonVariants } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import type { RunPlanWrite } from '@/lib/local-write';
 import type { PersonView, PriorityBandView, TeamCapacityView, TeamView } from '@/lib/wbs-api';
-import { isEstimateMethod, type ProjectApi, type StepView } from '@/lib/wbs-api';
+import { isEstimateMethod, type StepView } from '@/lib/wbs-api';
+import type { PlanCommands } from '@/modules/plan-commands/contract';

 import { MenuControl } from './actions-menu';
 import { useClosedByPointerOutside } from './close-on-outside-pointer';
@@ -539,7 +540,7 @@ export function PlanToolbar({
   setFreezeMenuOpen,
   busy,
   run,
-  api,
+  commands,
   projectId,
   addWorkItem,
   filtering,
@@ -603,7 +604,7 @@ export function PlanToolbar({
   setFreezeMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
   busy: boolean;
   run: RunPlanWrite;
-  api: ProjectApi;
+  commands: PlanCommands;
   projectId: string;
   addWorkItem: () => void;
   filtering: boolean;
@@ -728,14 +729,13 @@ export function PlanToolbar({
           {
             id: 'freeze',
             label: 'Freeze numbering',
-            run: () =>
-              void run((write) => write.perform(['tree'], () => api.freezeProject(projectId))),
+            run: () => void run((write) => write.perform(['tree'], () => commands.freezeProject())),
           },
           {
             id: 'unfreeze-all',
             label: 'Unfreeze all',
             run: () =>
-              void run((write) => write.perform(['tree'], () => api.unfreezeProject(projectId))),
+              void run((write) => write.perform(['tree'], () => commands.unfreezeProject())),
           },
         ]}
         trigger={{
@@ -929,13 +929,13 @@ export function PlanToolbar({
             teamCapacities,
             flat.flatMap((row) => effectiveTeams.get(row.id)?.teamIds ?? []),
           ),
-          setCapacity: (teamId, size) => api.setTeamCapacity(projectId, teamId, size),
+          setCapacity: (teamId, size) => commands.setTeamCapacity(teamId, size),
           onChanged: () => refreshOrMarkStale('tree'),
           onRefused: recoverAmbiguousSettingsChange,
         }}
         priorities={{
           bands: priorityBands,
-          setBands: (bands) => api.setPriorityBands(projectId, bands),
+          setBands: (bands) => commands.setPriorityBands(bands),
           onChanged: () => refreshOrMarkStale('tree'),
           onRefused: recoverAmbiguousSettingsChange,
         }}
@@ -945,16 +945,16 @@ export function PlanToolbar({
           frameState,
           numberOf: (workItemId) => flat.find((row) => row.id === workItemId)?.number ?? null,
           nameOf: (personId) => people.find((person) => person.id === personId)?.name ?? null,
-          addStep: (name) => api.addStep(projectId, name),
-          renameStep: (stepId, name) => api.renameStep(projectId, stepId, name),
-          removeStep: (stepId, cascade) => api.removeStep(projectId, stepId, cascade),
+          addStep: (name) => commands.addStep(name),
+          renameStep: (stepId, name) => commands.renameStep(stepId, name),
+          removeStep: (stepId, cascade) => commands.removeStep(stepId, cascade),
           // How far a dependency reaches, on the same surface as the steps it
           // is about: reordering them moves what an `anchor-slice` dependency
           // waits for. Off the chart read rather than a state of its own, so
           // the value ticked here and the reach the arrows were drawn with are
           // one fact.
           depReach: chartRead.depReach,
-          setDepReach: (reach: DependencyReach) => api.setDepReach(projectId, reach),
+          setDepReach: (reach: DependencyReach) => commands.setDepReach(reach),
           // The same reread every other change on this page makes, which is
           // what puts the new columns on the table and the new list in the
           // section.
@@ -973,7 +973,7 @@ export function PlanToolbar({
           // these are the weights the figures on screen were computed with.
           pertWeights: chartRead.pertWeights,
           estimateRounding: chartRead.estimateRounding,
-          setArithmetic: (arithmetic) => api.setEstimateArithmetic(projectId, arithmetic),
+          setArithmetic: (arithmetic) => commands.setEstimateArithmetic(arithmetic),
           onChanged: () => refreshOrMarkStale('tree'),
           onRefused: recoverAmbiguousSettingsChange,
         }}
@@ -982,7 +982,7 @@ export function PlanToolbar({
           : {
               optimization: {
                 value: chartRead.optimization,
-                setSettings: (patch) => api.setOptimizationSettings(projectId, patch),
+                setSettings: (patch) => commands.setOptimizationSettings(patch),
                 onChanged: () => refreshOrMarkStale('tree'),
                 onRefused: recoverAmbiguousSettingsChange,
               },
@@ -1407,9 +1407,7 @@ export function PlanToolbar({
           value={startDate ?? ''}
           commit={(typed) => {
             void run((write) =>
-              write.perform(['tree'], () =>
-                api.setStartDate(projectId, typed === '' ? null : typed),
-              ),
+              write.perform(['tree'], () => commands.setStartDate(typed === '' ? null : typed)),
             );
           }}
         />
diff --git a/apps/wbs/fe-01/src/components/wbs/use-estimate-drafts.ts b/apps/wbs/fe-01/src/components/wbs/use-estimate-drafts.ts
index 1baf4295..b9cb70fb 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-estimate-drafts.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-estimate-drafts.ts
@@ -3,7 +3,7 @@ import { useCallback, useRef, useState } from 'react';

 import type { RunPlanWrite } from '@/lib/local-write';
 import type { PersonView, TeamView } from '@/lib/wbs-api';
-import { type ProjectApi } from '@/lib/wbs-api';
+import type { PlanCommands } from '@/modules/plan-commands/contract';

 import { pickableLabel, type PickerOption } from './creatable-picker';
 import { type CellElement } from './editable-grid';
@@ -34,12 +34,12 @@ export function useEstimateDrafts({
   drafts,
   setDrafts,
   run,
-  api,
+  commands,
 }: {
   drafts: Record<string, string>;
   setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
   run: RunPlanWrite;
-  api: ProjectApi;
+  commands: PlanCommands;
 }) {
   /**
    * Whether the numbers in the schedule columns mean anything.
@@ -143,7 +143,7 @@ export function useEstimateDrafts({
         // `0 / 0 / 0` is one.
         if (isTrioEmpty(next) && Object.hasOwn(row.estimates, stepId)) {
           return run(async (write) => {
-            await write.perform(['tree'], () => api.clearEstimate(row.id, stepId));
+            await write.perform(['tree'], () => commands.clearEstimate(row.id, stepId));
             forgetEstimateDrafts(row.id, stepId);
           });
         }
@@ -152,11 +152,11 @@ export function useEstimateDrafts({
         return unsent();
       }
       return run(async (write) => {
-        await write.perform(['tree'], () => api.setEstimate(row.id, stepId, days));
+        await write.perform(['tree'], () => commands.setEstimate(row.id, stepId, days));
         forgetEstimateDrafts(row.id, stepId);
       });
     },
-    [api, forgetEstimateDrafts, run, setDrafts, typedTrio],
+    [commands, forgetEstimateDrafts, run, setDrafts, typedTrio],
   );

   /**
@@ -270,16 +270,16 @@ export function useEstimateDrafts({
         // Watched, 2026-08-06.
         if (!Object.hasOwn(row.estimates, stepId)) return unsent();
         return run(async (write) => {
-          await write.perform(['tree'], () => api.clearEstimate(row.id, stepId));
+          await write.perform(['tree'], () => commands.clearEstimate(row.id, stepId));
           forgetEstimateDrafts(row.id, stepId);
         });
       }
       return run(async (write) => {
-        await write.perform(['tree'], () => api.setEstimate(row.id, stepId, entry.days));
+        await write.perform(['tree'], () => commands.setEstimate(row.id, stepId, entry.days));
         forgetEstimateDrafts(row.id, stepId);
       });
     },
-    [api, forgetEstimateDrafts, run, setDrafts],
+    [commands, forgetEstimateDrafts, run, setDrafts],
   );
   return {
     estimateValue,
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts
index 5ba9095d..b34365e3 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts
@@ -2,7 +2,8 @@ import type * as React from 'react';
 import { useCallback, useEffect, useMemo, useRef } from 'react';

 import type { RunPlanWrite } from '@/lib/local-write';
-import type { ProjectApi, StepView } from '@/lib/wbs-api';
+import type { StepView } from '@/lib/wbs-api';
+import type { PlanCommands } from '@/modules/plan-commands/contract';
 import type { BusyWrites } from '@/modules/plan-writer/busy-store';

 import { pickerEntries } from './dep-picker';
@@ -25,7 +26,7 @@ export function usePlanDependencies({
   flat,
   pushToast,
   busy,
-  api,
+  commands,
   refreshOrMarkStale,
   setDepPicker,
   run,
@@ -34,7 +35,7 @@ export function usePlanDependencies({
   flat: TreeRow[];
   pushToast: (toast: Toast) => void;
   busy: BusyWrites;
-  api: ProjectApi;
+  commands: PlanCommands;
   refreshOrMarkStale: (scope?: PlanReadScope) => Promise<void>;
   setDepPicker: React.Dispatch<
     React.SetStateAction<{ rowId: string; typed: string; highlightId: string | null } | null>
@@ -42,8 +43,8 @@ export function usePlanDependencies({
   run: RunPlanWrite;
   steps: StepView[];
 }) {
-  const activeApi = useRef(api);
-  activeApi.current = api;
+  const activeCommands = useRef(commands);
+  activeCommands.current = commands;

   /**
    * The callbacks the cells use, read through a ref rather than closed over.
@@ -120,15 +121,15 @@ export function usePlanDependencies({
       // chips and the reasons have to survive. This loop therefore collects
       // every answer before choosing its aggregate recovery scope.
       void (async () => {
-        const owner = api;
-        const isCurrent = () => activeApi.current === owner;
+        const owner = commands;
+        const isCurrent = () => activeCommands.current === owner;
         busy.raise();
         const refused: string[] = [];
         let ambiguous = false;
         try {
           for (const predecessor of found) {
             try {
-              await api.addDependency(successorId, predecessor.id);
+              await commands.addDependency(successorId, predecessor.id);
             } catch (thrown: unknown) {
               // Collected rather than rethrown, so one refusal does not abandon
               // the numbers after it. The reason is be-01's own word — `cycle`,
@@ -166,13 +167,14 @@ export function usePlanDependencies({
         // Proof: split into one push per line, `reports every refused
         // dependency in one toast, not one each` failed with two. Watched,
         // 2026-08-06.
-        // The refusal belongs to the API that answered it, not merely the
-        // project id a replacement API may also serve.
+        // The refusal belongs to the commands that sent it — this client and
+        // this project — not merely the project id a replacement client may
+        // also serve.
         if (isCurrent() && problems.length > 0)
           pushToast({ kind: 'error', text: problems.join(' ') });
       })();
     },
-    [activeApi, api, busy, flat, pushToast, refreshOrMarkStale],
+    [activeCommands, busy, commands, flat, pushToast, refreshOrMarkStale],
   );

   /**
@@ -203,10 +205,10 @@ export function usePlanDependencies({
         current === null ? null : { ...current, typed: '', highlightId: null },
       );
       return run((write) =>
-        write.perform(['tree'], () => api.addDependency(successorId, predecessorId)),
+        write.perform(['tree'], () => commands.addDependency(successorId, predecessorId)),
       );
     },
-    [api, run, setDepPicker],
+    [commands, run, setDepPicker],
   );

   /** Moves the picker highlight by `delta` over `entryIds`, clamped. */
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-fields.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-fields.ts
index 81654719..954a43b9 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-fields.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-fields.ts
@@ -4,7 +4,8 @@ import type * as React from 'react';
 import { useCallback, useEffect, useRef, useState } from 'react';

 import type { RunPlanWrite } from '@/lib/local-write';
-import type { PriorityBandView, ProjectApi } from '@/lib/wbs-api';
+import type { PriorityBandView } from '@/lib/wbs-api';
+import type { PlanCommands } from '@/modules/plan-commands/contract';

 import { cellIn, focusCellAt } from './editable-grid';
 import { type CommitOutcome } from './live-editing';
@@ -62,13 +63,13 @@ function useDateCellEditor(
  */
 export function usePlanFields({
   run,
-  api,
+  commands,
   priorityBands,
   pushToast,
   gridElement,
 }: {
   run: RunPlanWrite;
-  api: ProjectApi;
+  commands: PlanCommands;
   priorityBands: PriorityBandView[];
   pushToast: (toast: Toast) => void;
   gridElement: React.RefObject<HTMLElement | null>;
@@ -115,7 +116,7 @@ export function usePlanFields({
     (id: string, day: string | null, reason?: string | null) => {
       void run((write) =>
         write.perform(['tree'], () =>
-          api.patchWorkItem(
+          commands.patchWorkItem(
             id,
             day === null
               ? { startNoEarlierThan: null, startNoEarlierThanReason: null }
@@ -133,7 +134,7 @@ export function usePlanFields({
         ),
       );
     },
-    [api, run],
+    [commands, run],
   );

   /**
@@ -158,11 +159,11 @@ export function usePlanFields({
       const said = typed.trim();
       void run((write) =>
         write.perform(['tree'], () =>
-          api.patchWorkItem(id, { startNoEarlierThanReason: said === '' ? null : said }),
+          commands.patchWorkItem(id, { startNoEarlierThanReason: said === '' ? null : said }),
         ),
       );
     },
-    [api, run],
+    [commands, run],
   );

   /**
@@ -190,9 +191,11 @@ export function usePlanFields({
    */
   const setDeadline = useCallback(
     (id: string, day: string | null) => {
-      void run((write) => write.perform(['tree'], () => api.patchWorkItem(id, { deadline: day })));
+      void run((write) =>
+        write.perform(['tree'], () => commands.patchWorkItem(id, { deadline: day })),
+      );
     },
-    [api, run],
+    [commands, run],
   );

   /**
@@ -203,15 +206,19 @@ export function usePlanFields({
    */
   const setFactStart = useCallback(
     (id: string, day: string | null) => {
-      void run((write) => write.perform(['tree'], () => api.patchWorkItem(id, { factStart: day })));
+      void run((write) =>
+        write.perform(['tree'], () => commands.patchWorkItem(id, { factStart: day })),
+      );
     },
-    [api, run],
+    [commands, run],
   );
   const setFactEnd = useCallback(
     (id: string, day: string | null) => {
-      void run((write) => write.perform(['tree'], () => api.patchWorkItem(id, { factEnd: day })));
+      void run((write) =>
+        write.perform(['tree'], () => commands.patchWorkItem(id, { factEnd: day })),
+      );
     },
-    [api, run],
+    [commands, run],
   );

   /**
@@ -229,8 +236,8 @@ export function usePlanFields({
    */
   const setStatus = useCallback(
     (id: string, status: SettableStatus, on: IsoDate, factStart?: IsoDate) =>
-      run((write) => write.perform(['tree'], () => api.setStatus(id, status, on, factStart))),
-    [api, run],
+      run((write) => write.perform(['tree'], () => commands.setStatus(id, status, on, factStart))),
+    [commands, run],
   );

   /**
@@ -259,7 +266,7 @@ export function usePlanFields({
       const trimmed = priorityTyped(priorityBands, typed).trim();
       if (trimmed === '')
         return run((write) =>
-          write.perform(['tree'], () => api.patchWorkItem(id, { priority: null })),
+          write.perform(['tree'], () => commands.patchWorkItem(id, { priority: null })),
         );
       // `Number` rather than `parseInt`: `parseInt('1.5')` is 1 and
       // `parseInt('2x')` is 2, so both would go out as priorities nobody typed.
@@ -287,10 +294,10 @@ export function usePlanFields({
         return Promise.resolve<CommitOutcome>('refused');
       }
       return run((write) =>
-        write.perform(['tree'], () => api.patchWorkItem(id, { priority: asNumber })),
+        write.perform(['tree'], () => commands.patchWorkItem(id, { priority: asNumber })),
       );
     },
-    [api, priorityBands, pushToast, run],
+    [commands, priorityBands, pushToast, run],
   );

   /**
@@ -313,7 +320,7 @@ export function usePlanFields({
       const trimmed = typed.trim();
       if (trimmed === '')
         return run((write) =>
-          write.perform(['tree'], () => api.patchWorkItem(id, { maxParallel: null })),
+          write.perform(['tree'], () => commands.patchWorkItem(id, { maxParallel: null })),
         );
       const asNumber = Number(trimmed);
       // {@link setPriority}'s refusal, for its reason: JSON has no literal for
@@ -325,10 +332,10 @@ export function usePlanFields({
         return Promise.resolve<CommitOutcome>('refused');
       }
       return run((write) =>
-        write.perform(['tree'], () => api.patchWorkItem(id, { maxParallel: asNumber })),
+        write.perform(['tree'], () => commands.patchWorkItem(id, { maxParallel: asNumber })),
       );
     },
-    [api, pushToast, run],
+    [commands, pushToast, run],
   );

   /**
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index ca11fa0d..b721f011 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -23,10 +23,9 @@ import {
   type SliceView,
   type StepView,
 } from '@/lib/wbs-api';
-import { calendarMarkersForReader } from '@/modules/calendar-markers/composition';
 import type { CalendarMarkerRefusal } from '@/modules/calendar-markers/contract';
 import { type Channel, createChannel } from '@/modules/channel';
-import { planFeedForReader } from '@/modules/plan-feed/composition';
+import type { PlanCommands } from '@/modules/plan-commands/contract';
 import type { PlanFeed, PlanFeedRefusal } from '@/modules/plan-feed/contract';
 import {
   createDeliveredPlan,
@@ -36,6 +35,7 @@ import {
 import { type BusyWrites, createBusy } from '@/modules/plan-writer/busy-store';
 import type { PlanWriteRefusal } from '@/modules/plan-writer/contract';
 import { createPlanWriter } from '@/modules/plan-writer/plan-writer.feature';
+import type { ProjectServices } from '@/modules/project/contract';

 import { type CellCards } from './cell-card-store';
 import type { FocusIntent } from './live-editing';
@@ -463,7 +463,8 @@ export function usePlanRead({
   setDrafts,
   projectId,
   activeProject,
-  api,
+  projectServices,
+  commands,
   plan,
   treeReadProject,
   rowPlacements,
@@ -478,7 +479,14 @@ export function usePlanRead({
   setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
   projectId: string;
   activeProject: React.RefObject<string>;
-  api: ProjectApi;
+  /**
+   * The project's services over the table's client. Its identity is the
+   * client's, and it is what every guard below compares where it compared the
+   * client before.
+   */
+  projectServices: ProjectServices;
+  /** This project's commands, bound to it. */
+  commands: PlanCommands;
   plan: DeliveredPlanStore;
   treeReadProject: React.RefObject<string | null>;
   rowPlacements: React.RefObject<ReadonlyMap<string, string>>;
@@ -493,8 +501,8 @@ export function usePlanRead({
   commandsIssued: Channel<undefined>;
 }) {
   const feedRef = useRef<PlanFeed | null>(null);
-  const activeApi = useRef(api);
-  activeApi.current = api;
+  const activeServices = useRef(projectServices);
+  activeServices.current = projectServices;

   // Joined before the feed below starts reading, which is a passive effect of
   // this same commit: see `useChannelListener`.
@@ -615,11 +623,11 @@ export function usePlanRead({
    * finds no owner rather than a disposed one.
    */
   useEffect(() => {
-    const feed = planFeedForReader({
+    const feed = projectServices.planFeedFor({
       projectId,
-      routes: api,
       subscribe,
-      isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
+      isActiveReader: () =>
+        activeProject.current === projectId && activeServices.current === projectServices,
       plan,
       refusals,
     });
@@ -628,7 +636,7 @@ export function usePlanRead({
       if (feedRef.current === feed) feedRef.current = null;
       feed.close();
     };
-  }, [activeProject, api, plan, projectId, refusals, subscribe]);
+  }, [activeProject, plan, projectId, projectServices, refusals, subscribe]);

   /** Awaits this invalidation's covering outcome; failures remain in the owner snapshot. */
   const refreshResourcesOrMarkStale = useCallback(
@@ -637,10 +645,15 @@ export function usePlanRead({
       // The reader this callback was built for, and not whoever is on screen
       // now: a reread issued from a project or an API this reader has left must
       // not be spent against the feed that replaced it.
-      if (feed === null || activeProject.current !== projectId || activeApi.current !== api) return;
+      if (
+        feed === null ||
+        activeProject.current !== projectId ||
+        activeServices.current !== projectServices
+      )
+        return;
       await feed.rereadResources(resources);
     },
-    [activeProject, api, projectId],
+    [activeProject, projectId, projectServices],
   );

   /** Awaits this invalidation's covering outcome; failures remain in the owner snapshot. */
@@ -686,7 +699,8 @@ export function usePlanRead({
     () =>
       createPlanWriter({
         readRefreshOwner: () => feedRef.current?.owner ?? null,
-        isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
+        isActiveReader: () =>
+          activeProject.current === projectId && activeServices.current === projectServices,
         rereadResources: refreshResourcesOrMarkStale,
         busy: busyWrites,
         commandsIssued,
@@ -694,10 +708,10 @@ export function usePlanRead({
       }),
     [
       activeProject,
-      api,
       busyWrites,
       commandsIssued,
       projectId,
+      projectServices,
       refreshResourcesOrMarkStale,
       refusals,
     ],
@@ -723,12 +737,12 @@ export function usePlanRead({
         owner !== null &&
         feedRef.current?.owner === owner &&
         activeProject.current === projectId &&
-        activeApi.current === api;
+        activeServices.current === projectServices;
       busyWrites.raise();
       try {
         let outcome;
         try {
-          outcome = direction === 'undo' ? await api.undo(projectId) : await api.redo(projectId);
+          outcome = direction === 'undo' ? await commands.undo() : await commands.redo();
         } catch (thrown: unknown) {
           if (!isCurrent()) return;
           // The same register as `run`: be-01's two *modeled* refusals are read
@@ -763,7 +777,15 @@ export function usePlanRead({
         if (isCurrent()) busyWrites.lower();
       }
     },
-    [activeProject, api, busyWrites, projectId, pushToast, refreshOrMarkStale],
+    [
+      activeProject,
+      busyWrites,
+      commands,
+      projectId,
+      projectServices,
+      pushToast,
+      refreshOrMarkStale,
+    ],
   );
   return { refreshOrMarkStale, run: writer.run, stepStack, markers };
 }
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-structure.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-structure.ts
index 88606e6c..c056418e 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-structure.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-structure.ts
@@ -3,7 +3,7 @@ import type * as React from 'react';
 import { useCallback, useEffect, useRef, useState } from 'react';

 import type { RunPlanWrite } from '@/lib/local-write';
-import { type ProjectApi } from '@/lib/wbs-api';
+import type { PlanCommands } from '@/modules/plan-commands/contract';

 import { type DropRefusal, type DropZone, planMove } from './drag-drop';
 import type { CellAttacher } from './editable-grid';
@@ -95,14 +95,14 @@ export function useAddWorkItem({
   projectId,
   activeProject,
   run,
-  api,
+  commands,
   focusIntent,
 }: {
   flat: TreeRow[];
   projectId: string;
   activeProject: React.RefObject<string>;
   run: RunPlanWrite;
-  api: ProjectApi;
+  commands: PlanCommands;
   focusIntent: React.RefObject<FocusIntent>;
 }) {
   const siblingsOf = useCallback(
@@ -153,7 +153,7 @@ export function useAddWorkItem({
           queue.queued -= 1;
           const outcome = await run(async (write) => {
             const created = await write.perform(['tree'], () =>
-              api.createWorkItem(projectId, {
+              commands.createWorkItem({
                 parentId: null,
                 afterId,
                 name: '',
@@ -171,7 +171,7 @@ export function useAddWorkItem({
         queue.draining = false;
       }
     })();
-  }, [activeProject, api, focusIntent, projectId, run, siblingsOf]);
+  }, [activeProject, commands, focusIntent, run, siblingsOf]);
   return { siblingsOf, addWorkItem };
 }

@@ -192,8 +192,7 @@ export function usePlanStructure({
   pushToast,
   setExpanded,
   run,
-  api,
-  projectId,
+  commands,
   focusIntent,
   siblingsOf,
 }: {
@@ -204,8 +203,7 @@ export function usePlanStructure({
   pushToast: (toast: Toast) => void;
   setExpanded: React.Dispatch<React.SetStateAction<ExpandedState>>;
   run: RunPlanWrite;
-  api: ProjectApi;
-  projectId: string;
+  commands: PlanCommands;
   focusIntent: React.RefObject<FocusIntent>;
   siblingsOf: (parentId: string | null) => TreeRow[];
 }) {
@@ -237,17 +235,19 @@ export function usePlanStructure({

       if (zone === 'into') setExpanded((current) => expandBranch(current, targetId));
       void run((write) =>
-        write.perform(['tree'], () => api.moveWorkItem(draggedId, plan.parentId, plan.afterId)),
+        write.perform(['tree'], () =>
+          commands.moveWorkItem(draggedId, plan.parentId, plan.afterId),
+        ),
       );
     },
-    [api, dragging, flat, pushToast, run, setDragging, setDropHint, setExpanded],
+    [commands, dragging, flat, pushToast, run, setDragging, setDropHint, setExpanded],
   );

   const addSibling = useCallback(
     (after: TreeRow) =>
       run(async (write) => {
         const created = await write.perform(['tree'], () =>
-          api.createWorkItem(projectId, {
+          commands.createWorkItem({
             parentId: after.parentId,
             afterId: after.id,
             name: '',
@@ -255,7 +255,7 @@ export function usePlanStructure({
         );
         focusIntent.current.wants({ rowId: created.id, columnId: 'name' });
       }),
-    [api, focusIntent, projectId, run],
+    [commands, focusIntent, run],
   );

   /**
@@ -277,14 +277,14 @@ export function usePlanStructure({
         if (newParent === undefined) return;
         const lastChild = newParent.subRows.at(-1) ?? null;
         await write.perform(['tree'], () =>
-          api.moveWorkItem(row.id, newParent.id, lastChild?.id ?? null),
+          commands.moveWorkItem(row.id, newParent.id, lastChild?.id ?? null),
         );
         // After the move, not before: a refused request then leaves the focus
         // where the person left it rather than sending it after a row that
         // never went anywhere.
         focusIntent.current.wants({ rowId: row.id, columnId: landOn });
       }),
-    [api, focusIntent, run, siblingsOf],
+    [commands, focusIntent, run, siblingsOf],
   );

   /** Outdent: the row becomes the next sibling of its own parent. */
@@ -294,11 +294,13 @@ export function usePlanStructure({
         if (row.parentId === null) return;
         const parent = flat.find((w) => w.id === row.parentId);
         if (parent === undefined) return;
-        await write.perform(['tree'], () => api.moveWorkItem(row.id, parent.parentId, parent.id));
+        await write.perform(['tree'], () =>
+          commands.moveWorkItem(row.id, parent.parentId, parent.id),
+        );
         // After the move, for the reason `indent` gives.
         focusIntent.current.wants({ rowId: row.id, columnId: landOn });
       }),
-    [api, flat, focusIntent, run],
+    [commands, flat, focusIntent, run],
   );

   /**
@@ -337,7 +339,7 @@ export function usePlanStructure({
           ? (siblings[swapWith]?.id ?? null)
           : (siblings[swapWith - 1]?.id ?? null);
       void run(async (write) => {
-        await write.perform(['tree'], () => api.moveWorkItem(row.id, row.parentId, afterId));
+        await write.perform(['tree'], () => commands.moveWorkItem(row.id, row.parentId, afterId));
         // Asked for only once be-01 has taken the move: a refused request leaves
         // the focus where the person left it rather than chasing a row that did
         // not go anywhere.
@@ -347,7 +349,7 @@ export function usePlanStructure({
         focusIntent.current.wants({ rowId: row.id, columnId: landOn });
       });
     },
-    [api, focusIntent, run, siblingsOf],
+    [commands, focusIntent, run, siblingsOf],
   );

   /**
@@ -363,10 +365,10 @@ export function usePlanStructure({
   const duplicateRow = useCallback(
     (id: string) =>
       run(async (write) => {
-        const copy = await write.perform(['tree'], () => api.duplicateWorkItem(id));
+        const copy = await write.perform(['tree'], () => commands.duplicateWorkItem(id));
         focusIntent.current.wants({ rowId: copy.id, columnId: 'name' });
       }),
-    [api, focusIntent, run],
+    [commands, focusIntent, run],
   );

   /**
@@ -410,7 +412,7 @@ export function usePlanStructure({
         const above = flatAt > 0 ? flat[flatAt - 1] : undefined;
         const landsOn = nextSibling ?? above;
         await write.perform(['tree'], () =>
-          api.removeWorkItem(row.id, {
+          commands.removeWorkItem(row.id, {
             strategy: row.subRows.length > 0 ? 'promote' : undefined,
           }),
         );
@@ -418,7 +420,7 @@ export function usePlanStructure({
           landsOn === undefined ? null : { rowId: landsOn.id, columnId: 'name' },
         );
       }),
-    [api, flat, focusIntent, run, siblingsOf],
+    [commands, flat, focusIntent, run, siblingsOf],
   );

   /**
@@ -469,9 +471,9 @@ export function usePlanStructure({
       // mean the same thing, so there is nothing unsaved for the cell to hold
       // and nothing for be-01 to have refused.
       if (Object.keys(patch).length === 0) return unsent();
-      return run((write) => write.perform(['tree'], () => api.patchWorkItem(rowId, patch)));
+      return run((write) => write.perform(['tree'], () => commands.patchWorkItem(rowId, patch)));
     },
-    [api, run],
+    [commands, run],
   );

   /** Removes a wholly empty row, landing the focus on the row above it. */
@@ -485,9 +487,9 @@ export function usePlanStructure({
         focusIntent.current.wants(
           above === undefined ? null : { rowId: above.id, columnId: 'name' },
         );
-        await write.perform(['tree'], () => api.removeWorkItem(row.id));
+        await write.perform(['tree'], () => commands.removeWorkItem(row.id));
       }),
-    [api, flat, focusIntent, run],
+    [commands, flat, focusIntent, run],
   );
   return {
     dropOn,
diff --git a/apps/wbs/fe-01/src/components/wbs/use-reference-sets.ts b/apps/wbs/fe-01/src/components/wbs/use-reference-sets.ts
index dd7b5415..4d85f6ff 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-reference-sets.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-reference-sets.ts
@@ -7,7 +7,8 @@ import { useCallback, useMemo } from 'react';

 import type { RunPlanWrite } from '@/lib/local-write';
 import type { PersonView, ServiceView, TagView, TeamView } from '@/lib/wbs-api';
-import { type EstimateMethod, type ProjectApi } from '@/lib/wbs-api';
+import { type EstimateMethod } from '@/lib/wbs-api';
+import type { PlanCommands } from '@/modules/plan-commands/contract';

 import { type ExternalRefDraft } from './external-refs-modal';
 import {
@@ -371,22 +372,14 @@ export function usePlanLabels({
  * reference cell does and they refuse differently — a replace can lose a race,
  * a create can collide on a name.
  */
-export function useReferenceSets({
-  run,
-  api,
-  projectId,
-}: {
-  run: RunPlanWrite;
-  api: ProjectApi;
-  projectId: string;
-}) {
+export function useReferenceSets({ run, commands }: { run: RunPlanWrite; commands: PlanCommands }) {
   /** Replaces a work item's own team set, whole. */
   const setTeamOf = useCallback(
     (id: string, teamIds: readonly string[]): Promise<CommitOutcome> =>
       run((write) =>
-        write.perform(['tree'], () => api.patchWorkItem(id, { teamIds: [...teamIds] })),
+        write.perform(['tree'], () => commands.patchWorkItem(id, { teamIds: [...teamIds] })),
       ),
-    [api, run],
+    [commands, run],
   );

   /**
@@ -408,9 +401,9 @@ export function useReferenceSets({
   const setServicesOf = useCallback(
     (id: string, serviceIds: readonly string[]): Promise<CommitOutcome> =>
       run((write) =>
-        write.perform(['tree'], () => api.patchWorkItem(id, { serviceIds: [...serviceIds] })),
+        write.perform(['tree'], () => commands.patchWorkItem(id, { serviceIds: [...serviceIds] })),
       ),
-    [api, run],
+    [commands, run],
   );

   /**
@@ -423,8 +416,10 @@ export function useReferenceSets({
    */
   const setTagsOf = useCallback(
     (id: string, tagIds: readonly string[]): Promise<CommitOutcome> =>
-      run((write) => write.perform(['tree'], () => api.patchWorkItem(id, { tagIds: [...tagIds] }))),
-    [api, run],
+      run((write) =>
+        write.perform(['tree'], () => commands.patchWorkItem(id, { tagIds: [...tagIds] })),
+      ),
+    [commands, run],
   );

   /** Adds a team nobody had yet and appends it to the work item's whole set. */
@@ -437,12 +432,12 @@ export function useReferenceSets({
         // left its mounted picker at one tree read instead of seven and hid
         // the created option after attachment refusal. Watched in `keeps a new
         // $name visible when its assignment refuses`, 2026-09-14.
-        const team = await write.perform(['tree', 'directory'], () => api.addTeam(name));
+        const team = await write.perform(['tree', 'directory'], () => commands.addTeam(name));
         await write.perform(['tree'], () =>
-          api.patchWorkItem(id, { teamIds: [...current, team.id] }),
+          commands.patchWorkItem(id, { teamIds: [...current, team.id] }),
         );
       }),
-    [api, run],
+    [commands, run],
   );

   /** Adds a service nobody had yet and labels the work item with it, in one go. */
@@ -450,12 +445,12 @@ export function useReferenceSets({
     (id: string, name: string, current: readonly string[]): Promise<CommitOutcome> =>
       run(async (write) => {
         // Proof: see the mounted five-family mutation at {@link createTeamFor}.
-        const service = await write.perform(['tree', 'directory'], () => api.addService(name));
+        const service = await write.perform(['tree', 'directory'], () => commands.addService(name));
         await write.perform(['tree'], () =>
-          api.patchWorkItem(id, { serviceIds: [...current, service.id] }),
+          commands.patchWorkItem(id, { serviceIds: [...current, service.id] }),
         );
       }),
-    [api, run],
+    [commands, run],
   );

   /**
@@ -476,19 +471,19 @@ export function useReferenceSets({
     (id: string, refs: readonly ExternalRefDraft[]): Promise<CommitOutcome> =>
       run((write) =>
         write.perform(['tree'], () =>
-          api.patchWorkItem(id, { externalRefs: refs.map((ref) => ({ ...ref })) }),
+          commands.patchWorkItem(id, { externalRefs: refs.map((ref) => ({ ...ref })) }),
         ),
       ),
-    [api, run],
+    [commands, run],
   );

   /** The whole type set, replaced — `setTagsOf`'s shape and signature. */
   const setTypesOf = useCallback(
     (id: string, typeIds: readonly string[]): Promise<CommitOutcome> =>
       run((write) =>
-        write.perform(['tree'], () => api.patchWorkItem(id, { typeIds: [...typeIds] })),
+        write.perform(['tree'], () => commands.patchWorkItem(id, { typeIds: [...typeIds] })),
       ),
-    [api, run],
+    [commands, run],
   );

   /**
@@ -506,13 +501,13 @@ export function useReferenceSets({
         // up on one type rather than two.
         // Proof: see the mounted five-family mutation at {@link createTeamFor}.
         const workItemType = await write.perform(['tree', 'directory'], () =>
-          api.addWorkItemType(name),
+          commands.addWorkItemType(name),
         );
         await write.perform(['tree'], () =>
-          api.patchWorkItem(id, { typeIds: [...current, workItemType.id] }),
+          commands.patchWorkItem(id, { typeIds: [...current, workItemType.id] }),
         );
       }),
-    [api, run],
+    [commands, run],
   );

   /** Adds a tag nobody had yet and labels the work item with it, in one go. */
@@ -520,19 +515,21 @@ export function useReferenceSets({
     (id: string, name: string, current: readonly string[]): Promise<CommitOutcome> =>
       run(async (write) => {
         // Proof: see the mounted five-family mutation at {@link createTeamFor}.
-        const tag = await write.perform(['tree', 'directory'], () => api.addTag(name));
+        const tag = await write.perform(['tree', 'directory'], () => commands.addTag(name));
         await write.perform(['tree'], () =>
-          api.patchWorkItem(id, { tagIds: [...current, tag.id] }),
+          commands.patchWorkItem(id, { tagIds: [...current, tag.id] }),
         );
       }),
-    [api, run],
+    [commands, run],
   );

   const assignTo = useCallback(
     (id: string, stepId: string, personId: string | null) => {
-      void run((write) => write.perform(['tree'], () => api.assignPerson(id, stepId, personId)));
+      void run((write) =>
+        write.perform(['tree'], () => commands.assignPerson(id, stepId, personId)),
+      );
     },
-    [api, run],
+    [commands, run],
   );

   /**
@@ -549,20 +546,20 @@ export function useReferenceSets({
       void run(async (write) => {
         // Proof: see the mounted five-family mutation at {@link createTeamFor}.
         const person = await write.perform(['tree', 'directory'], () =>
-          api.addPerson(name, row.teamIds),
+          commands.addPerson(name, row.teamIds),
         );
-        await write.perform(['tree'], () => api.assignPerson(row.id, stepId, person.id));
+        await write.perform(['tree'], () => commands.assignPerson(row.id, stepId, person.id));
       });
     },
-    [api, run],
+    [commands, run],
   );

   /** Changes how the project turns its trios into one number, for everybody. */
   const chooseEstimateMethod = useCallback(
     (method: EstimateMethod) => {
-      void run((write) => write.perform(['tree'], () => api.setEstimateMethod(projectId, method)));
+      void run((write) => write.perform(['tree'], () => commands.setEstimateMethod(method)));
     },
-    [api, projectId, run],
+    [commands, run],
   );
   return {
     setTeamOf,
diff --git a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
index 0bbe00c9..41cfb77f 100644
--- a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
@@ -16,6 +16,7 @@ import {
 } from 'react';

 import { Button } from '@/components/ui/button';
+import { projectServicesOver } from '@/modules/project/composition';

 import { type CellCards, createCellCards, useCardOpenOn } from './cell-card-store';
 import type { CellRef } from './cell-navigation';
@@ -621,6 +622,20 @@ export function WbsTable({
   savedPlansShelf,
 }: WbsTableProps) {
   const today = useToday();
+  /**
+   * The project's services over this table's client, composed once per client.
+   *
+   * Everything below receives these and never the client: the feed and the
+   * marker gestures are opened through it by the read hook, and every write
+   * goes through `commands`. Keyed on the client alone, so its identity is the
+   * client's, which is what the read hook's stale-owner guards compare.
+   */
+  const projectServices = useMemo(() => projectServicesOver(api), [api]);
+  /** This project's commands, bound to it; a new project or client binds anew. */
+  const commands = useMemo(
+    () => projectServices.planCommandsFor(projectId),
+    [projectServices, projectId],
+  );
   const {
     plan,
     activeProject,
@@ -937,7 +952,8 @@ export function WbsTable({
     setDrafts,
     projectId,
     activeProject,
-    api,
+    projectServices,
+    commands,
     plan,
     treeReadProject,
     rowPlacements,
@@ -1071,19 +1087,19 @@ export function WbsTable({
    * schedule order because be-01 wrote the positions.
    */
   const arrangeBySchedule = useCallback(() => {
-    void run((write) => write.perform(['tree'], () => api.arrangeBySchedule(projectId))).then(
+    void run((write) => write.perform(['tree'], () => commands.arrangeBySchedule())).then(
       (landed) => {
         if (landed === 'landed') pushToast({ kind: 'info', text: 'Arranged by schedule.' });
       },
     );
-  }, [api, projectId, pushToast, run]);
+  }, [commands, pushToast, run]);

   const { siblingsOf, addWorkItem } = useAddWorkItem({
     flat,
     projectId,
     activeProject,
     run,
-    api,
+    commands,
     focusIntent,
   });
   const { frameState, resizeColumn, resizeGantt, resetGanttSettings, resetLayout, columnsDiffer } =
@@ -1151,8 +1167,7 @@ export function WbsTable({
     pushToast,
     setExpanded,
     run,
-    api,
-    projectId,
+    commands,
     focusIntent,
     siblingsOf,
   });
@@ -1178,7 +1193,7 @@ export function WbsTable({
       flat,
       pushToast,
       busy: busyWrites,
-      api,
+      commands,
       refreshOrMarkStale,
       setDepPicker,
       run,
@@ -1191,7 +1206,7 @@ export function WbsTable({
     combinedValue,
     combinedProblem,
     commitCombinedEstimate,
-  } = useEstimateDrafts({ drafts, setDrafts, run, api });
+  } = useEstimateDrafts({ drafts, setDrafts, run, commands });
   const {
     setNotBefore,
     setNotBeforeReason,
@@ -1213,7 +1228,7 @@ export function WbsTable({
     editingFactEnd,
     openFactEnd,
     closeFactEnd,
-  } = usePlanFields({ run, api, priorityBands, pushToast, gridElement });
+  } = usePlanFields({ run, commands, priorityBands, pushToast, gridElement });
   /**
    * What confirming the completion prompt does: the mark, on the day confirmed,
    * and then — only when the row already held a fact end and the reader changed
@@ -1252,7 +1267,7 @@ export function WbsTable({
     assignTo,
     createPersonFor,
     chooseEstimateMethod,
-  } = useReferenceSets({ run, api, projectId });
+  } = useReferenceSets({ run, commands });
   const { enterFoldedCell, readFoldedCell, closeMention, leaveFoldedCell, mentionOptions } =
     useEstimateMentions({
       foldedBox,
@@ -1443,7 +1458,7 @@ export function WbsTable({
   const liveNow: PlanLiveValues = {
     focusIntent,
     gridElement,
-    api,
+    commands,
     run,
     duplicateRow,
     deleteRow,
@@ -1732,8 +1747,8 @@ export function WbsTable({
     filterLabels,
   });
   const downloadJson = useCallback(() => {
-    void api
-      .exportPlan(projectId)
+    void commands
+      .exportPlan()
       .then((document) => {
         // Proof: replacing the server document's workItems with `shownRows` made
         // `downloads JSON with collapsed and filtered-out rows` miss exact row
@@ -1762,7 +1777,7 @@ export function WbsTable({
           text: `Plan JSON download failed (${failureText(thrown, 'unknown')}).`,
         });
       });
-  }, [api, projectId, pushToast]);
+  }, [commands, pushToast]);
   /**
    * The columns this render puts on screen, in order — which is exactly what a
    * `<colgroup>` declares and what the table's own width adds up. Read from the
@@ -1917,7 +1932,7 @@ export function WbsTable({
       setFreezeMenuOpen={setFreezeMenuOpen}
       busy={busy}
       run={run}
-      api={api}
+      commands={commands}
       projectId={projectId}
       scheduleError={scheduleError}
       arrangeBySchedule={arrangeBySchedule}
@@ -2012,12 +2027,12 @@ export function WbsTable({
         // it comes back.
         onChoose={(patch) => {
           void run((write) =>
-            write.perform(['tree'], () => api.setOptimizationSettings(projectId, patch)),
+            write.perform(['tree'], () => commands.setOptimizationSettings(patch)),
           );
         }}
         onRetry={(objective, inputHash) => {
           void run((write) =>
-            write.perform(['tree'], () => api.retryOptimization(projectId, objective, inputHash)),
+            write.perform(['tree'], () => commands.retryOptimization(objective, inputHash)),
           );
         }}
       />
@@ -2291,7 +2306,7 @@ export function WbsTable({
               }}
               dropDependency={(row, predecessorId) => {
                 return run((write) =>
-                  write.perform(['tree'], () => api.removeDependency(row.id, predecessorId)),
+                  write.perform(['tree'], () => commands.removeDependency(row.id, predecessorId)),
                 );
               }}
               // The `Start` cell's own sentence, off the one map, handed to the
@@ -2388,7 +2403,9 @@ export function WbsTable({
                   void duplicateRow(rowId);
                 },
                 unfreeze: (rowId) => {
-                  void run((write) => write.perform(['tree'], () => api.unfreezeWorkItem(rowId)));
+                  void run((write) =>
+                    write.perform(['tree'], () => commands.unfreezeWorkItem(rowId)),
+                  );
                 },
                 remove: (row) => {
                   void deleteRow(row);
```

### 7.6 The markers memo in `use-plan-read.ts` — slice 2, a script

Packet g's slice 5 writes a `// Proof:` comment directly above this memo's `announceRefusal:
refusals.publish,` (its fault `m1`), dated and worded by its executor. This slice changes the lines on
both sides of it — the factory, the `api` member, the `isActiveReader` guard and the dependency list
— so no diff can carry context that matches both the rehearsal tree and the tree the executor gets.
The script matches the memo as slice 1 leaves it, with **any** run of `//` lines in that one position
captured and written back unchanged, requires exactly one match, and writes the result section 7.5's
diff was cut against. Section 9.1 runs it on the rehearsal base (0 comment lines) and on a copy with
g's comment sites filled (2 lines kept).

```ts
const file = Bun.argv[2];
if (file === undefined) throw new Error('usage: bun markers-memo.ts <path of use-plan-read.ts>');
const before = await Bun.file(file).text();
// The markers memo as slice 1 leaves it, with any `//` lines an earlier packet
// wrote above `announceRefusal` captured and kept.
const memo =
  /      calendarMarkersForReader\(\{\n        projectId,\n        api,\n        readRefreshOwner: \(\) => feedRef\.current\?\.owner \?\? null,\n        isActiveReader: \(\) => activeProject\.current === projectId && activeApi\.current === api,\n((?: {8}\/\/[^\n]*\n)*) {8}announceRefusal: refusals\.publish,\n      \}\),\n    \[activeProject, api, projectId, refusals\],\n/g;
const found = [...before.matchAll(memo)];
if (found.length !== 1) {
  throw new Error(`expected the markers memo once, found it ${String(found.length)} times`);
}
const after = before.replace(
  memo,
  (_whole: string, kept: string) =>
    '      projectServices.calendarMarkersFor({\n' +
    '        projectId,\n' +
    '        readRefreshOwner: () => feedRef.current?.owner ?? null,\n' +
    '        isActiveReader: () =>\n' +
    '          activeProject.current === projectId && activeServices.current === projectServices,\n' +
    kept +
    '        announceRefusal: refusals.publish,\n' +
    '      }),\n' +
    '    [activeProject, projectId, projectServices, refusals],\n',
);
await Bun.write(file, after);
const kept = found[0]?.[1] ?? '';
console.log(`markers memo rewritten, ${String(kept.split('\n').length - 1)} comment lines kept`);
```

### 7.7 `spec.md` — slice 3, the scenario for the page's composition

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 3226406d..d0c5be43 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -422,3 +422,11 @@ route's own promise. What a reader sees SHALL NOT change.
 - **THEN** the write goes through the commands bound to the table's project and
   the plan is read through the feed the composition root opened, and the late
   answer lowers no busy state and announces nothing
+
+#### Scenario: The page composes the table's services once per client
+
+- **WHEN** the page renders the table again over the same client, or over a new
+  one
+- **THEN** the table keeps its services, its feed and its socket across the
+  same client, a new client replaces all three, and the table is never handed
+  the client itself
```

### 7.8 `src/testing/project-services-of.ts` (**new**) and the seventeen table suites — slice 3, the named fixture edit

```diff
diff --git a/apps/wbs/fe-01/src/components/ui/page-shortcuts.test.tsx b/apps/wbs/fe-01/src/components/ui/page-shortcuts.test.tsx
index e51c4d92..1d4be9fe 100644
--- a/apps/wbs/fe-01/src/components/ui/page-shortcuts.test.tsx
+++ b/apps/wbs/fe-01/src/components/ui/page-shortcuts.test.tsx
@@ -6,6 +6,7 @@ import { KeyboardCheatSheet } from '@/components/wbs/keyboard-cheat-sheet';
 import { WbsTable } from '@/components/wbs/wbs-table';
 import type { ProjectApi, WorkItemView } from '@/lib/wbs-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { refusingApi } from '@/testing/refusing-api';
 import { personView, planRead, workItemView } from '@/testing/views';

@@ -151,7 +152,7 @@ function silentApi(): SilentApi {

 /** The table, on screen with its one row, and its window listeners registered. */
 async function renderTable(api: ProjectApi): Promise<void> {
-  render(<WbsTable projectId="p" api={api} />);
+  render(<WbsTable projectId="p" projectServices={projectServicesOf(api)} />);
   await waitFor(() => {
     expect(screen.getByLabelText('Name of 010')).toBeDefined();
   });
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-panel.test.tsx b/apps/wbs/fe-01/src/components/wbs/gantt-panel.test.tsx
index a38cdd93..d48e445e 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-panel.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-panel.test.tsx
@@ -18,6 +18,7 @@ import type {
 import { DEFAULT_PERT_WEIGHTS_VIEW } from '@/lib/wbs-api';
 import { fakeProjectApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { recordCalls } from '@/testing/record-calls';

 import { MONDAY_START, planOf, pointedAtRow, rowAt, sliceAt } from './gantt-fixtures';
@@ -3362,7 +3363,7 @@ function fakeApi(startDate: string | null, skew: ReadSkew = {}): ProjectApi {

 /** Puts the plan on screen and opens the chart under it. */
 async function showTheChart(startDate: string | null = MONDAY, skew: ReadSkew = {}): Promise<void> {
-  render(<WbsTable projectId="p1" api={fakeApi(startDate, skew)} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(fakeApi(startDate, skew))} />);
   await screen.findByDisplayValue('Hull');
   fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
   await screen.findByLabelText('Gantt chart');
@@ -3527,7 +3528,7 @@ describe('the chart mirrors the plan', () => {
    */
   itDom('takes the plan to a row on the cards face too', async () => {
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={fakeApi(MONDAY)} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(fakeApi(MONDAY))} />);
     await screen.findByLabelText('Name of 010');
     fireEvent.click(screen.getByRole('button', { name: 'Plan actions' }));
     fireEvent.click(await screen.findByRole('button', { name: 'Gantt' }));
@@ -3888,7 +3889,13 @@ describe('a chart that cannot be drawn', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={fakeApi(MONDAY, skew)} subscribe={subscribe} />);
+    render(
+      <WbsTable
+        projectId="p1"
+        projectServices={projectServicesOf(fakeApi(MONDAY, skew))}
+        subscribe={subscribe}
+      />,
+    );
     await screen.findByDisplayValue('Hull');
     fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
     await screen.findByLabelText('Gantt chart');
diff --git a/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx b/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx
index 2f294faf..9dd903ec 100644
--- a/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx
@@ -6,6 +6,7 @@ import type { ProjectStreamDeps, SocketHandlers } from '@/lib/project-stream';
 import type { PlanOptimizationView } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';

 import { ProjectPage } from './project-page';
 import type { SavedPlansPanelDeps } from './saved-plans-panel';
@@ -59,7 +60,7 @@ describe('project optimization in the plan', () => {
   itDom('persists a project-wide schedule choice across a remount', async () => {
     const api = fakeProjectApi();
     const setSettings = vi.spyOn(api, 'setOptimizationSettings');
-    const first = render(<WbsTable projectId="p1" api={api} />);
+    const first = render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await openOptimization();

     fireEvent.click(screen.getByRole('checkbox', { name: 'Optimize schedules' }));
@@ -89,7 +90,7 @@ describe('project optimization in the plan', () => {
     expect(document.querySelector('[data-cue-active]')?.textContent).toBe('Fast');

     first.unmount();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await openOptimization();
     expect(screen.getByRole('checkbox', { name: 'Optimize schedules' })).toBeChecked();
     expect(screen.getByRole('radio', { name: 'Time' })).toBeChecked();
@@ -104,7 +105,9 @@ describe('project optimization in the plan', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     await openOptimization();
     expect(screen.getByRole('checkbox', { name: 'Optimize schedules' })).not.toBeChecked();

@@ -138,7 +141,9 @@ describe('project optimization in the plan', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     expect(await screen.findByRole('status')).toHaveTextContent(
       'Earlier project deadline by 2 days',
     );
@@ -195,7 +200,7 @@ describe('project optimization in the plan', () => {
           },
         } satisfies PlanOptimizationView,
       });
-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

       await waitFor(() => {
         expect(screen.getByRole('status')).toHaveTextContent(
@@ -327,7 +332,9 @@ describe('project optimization in the plan', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     expect(await screen.findByRole('status')).toHaveTextContent('Optimizing…');

     // The solve finished and stored its certificate; the event is the only
@@ -535,7 +542,9 @@ describe('project optimization in the plan', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     expect(await screen.findByRole('status')).toHaveTextContent('Optimizing…');

     // The mount's own reads are not what this case is about.
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-cards.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-cards.test.tsx
index e5cc22c5..e2ac0b14 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-cards.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-cards.test.tsx
@@ -41,6 +41,7 @@ import type {
 } from '@/lib/wbs-api';
 import { DEFAULT_PERT_WEIGHTS_VIEW } from '@/lib/wbs-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { recordCalls } from '@/testing/record-calls';
 import { refusingApi } from '@/testing/refusing-api';
 import { planRead, sliceView } from '@/testing/views';
@@ -622,7 +623,7 @@ describe('the plan on a phone', () => {
       await api.createWorkItem('p1', { parentId: `w${String(parent)}` });
     }
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByRole('article', { name: 'Work item 080' });

     const cardMargin = (id: string): string => {
@@ -647,7 +648,7 @@ describe('the plan on a phone', () => {
   itDom('is cards below the breakpoint and the table above it', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     expect(screen.getByRole('article', { name: 'Work item 010' })).toBeInTheDocument();
@@ -679,7 +680,7 @@ describe('the plan on a phone', () => {
   itDom('renders no cell the table has not got one for', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const onCards = cellsOnScreen();
@@ -703,7 +704,7 @@ describe('the plan on a phone', () => {
   itDom('marks the card list as the grid, and it is no table', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const grid = document.querySelector('[data-grid]');
@@ -730,7 +731,7 @@ describe('the plan on a phone', () => {
   itDom('carries the caret to an unestimated card when the badge is taken', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     openTheSheet();
@@ -764,7 +765,7 @@ describe('the plan on a phone', () => {
   itDom('lands the focus in the card of a work item it just created', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     await waitFor(() => {
@@ -788,7 +789,7 @@ describe('the plan on a phone', () => {
    */
   itDom('keeps a draft be-01 refused when the window crosses the breakpoint', async () => {
     const api = fakeApi({ refusePatch: true });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     fireEvent.click(screen.getByRole('button', { name: 'Add work item' }));
     const onTheTable = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');

@@ -809,7 +810,7 @@ describe('the plan on a phone', () => {
   itDom('and carries it back to the table when the window widens again', async () => {
     const api = fakeApi({ refusePatch: true });
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const onACard = screen.getByLabelText<HTMLTextAreaElement>('Name of 010');
@@ -841,7 +842,7 @@ describe('the plan on a phone', () => {
   itDom('keeps a refused draft, and its cells, when the phone is turned', async () => {
     const api = fakeApi({ refusePatch: true });
     widthIs(PHONE, PHONE_TALL);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const inPortrait = screen.getByLabelText<HTMLTextAreaElement>('Name of 010');
@@ -865,7 +866,7 @@ describe('the plan on a phone', () => {
   itDom('sends a name typed on a card', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const box = screen.getByLabelText('Name of 010');
@@ -889,7 +890,7 @@ describe('the plan on a phone', () => {
       // failing, 2026-08-29, on `Error: the card for 010 draws no rendered name`.
       const api = fakeApi();
       widthIs(PHONE);
-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
       await addAWorkItem();

       const box = screen.getByLabelText<HTMLTextAreaElement>('Name of 010');
@@ -929,7 +930,7 @@ describe('the plan on a phone', () => {
     // nowhere else to show it. Watched, 2026-08-09.
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const box = screen.getByLabelText<HTMLTextAreaElement>('Name of 010');
@@ -951,7 +952,7 @@ describe('the plan on a phone', () => {
     // '2026-06-01 → 2026-06-03' to be '1 Jun → 3 Jun'`. Watched, 2026-08-09.
     const api = fakeApi({ dated: true });
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const onCard = document.querySelector('[data-card-span]');
@@ -971,7 +972,7 @@ describe('the plan on a phone', () => {
     // dates to shorten and both renderers count days from day zero.
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const onCard = document.querySelector('[data-card-span]');
@@ -988,7 +989,7 @@ describe('the plan on a phone', () => {
   itDom('offers nothing to drag a card by', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     expect(screen.queryByRole('button', { name: 'Reorder 010' })).toBeNull();
@@ -1010,7 +1011,7 @@ describe('a picker open on a card', () => {
   itDom('takes Enter for the list rather than the box under it', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const figure = screen.getByLabelText<HTMLInputElement>('Dev estimate for 010');
@@ -1039,7 +1040,7 @@ describe('a picker open on a card', () => {
   itDom('closes on Escape and leaves what was typed', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const figure = screen.getByLabelText<HTMLInputElement>('Dev estimate for 010');
@@ -1058,7 +1059,7 @@ describe('a picker open on a card', () => {
     // `aria-activedescendant` names — and both pointers go when the list goes.
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const figure = screen.getByLabelText<HTMLInputElement>('Dev estimate for 010');
@@ -1087,7 +1088,7 @@ describe('a picker open on a card', () => {
     // makes this the same box as the one above and a different branch of it.
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const figure = screen.getByLabelText<HTMLInputElement>('Dev estimate for 010');
@@ -1130,7 +1131,7 @@ describe('the toolbar sheet', () => {
     render(
       <WbsTable
         projectId="p1"
-        api={api}
+        projectServices={projectServicesOf(api)}
         savedPlansShelf={
           <details data-saved-plans open>
             <summary>Saved plans</summary>
@@ -1175,7 +1176,7 @@ describe('the toolbar sheet', () => {
       return Promise.resolve();
     };
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'Plan actions' })).toBeInTheDocument();
     });
@@ -1193,7 +1194,7 @@ describe('the toolbar sheet', () => {
   itDom('holds the toolbar, which is nowhere on the page until it is opened', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'Plan actions' })).toBeInTheDocument();
     });
@@ -1228,7 +1229,7 @@ describe('the toolbar sheet', () => {
   itDom('offers freezing once, as a menu that opens on the sheet', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'Plan actions' })).toBeInTheDocument();
     });
@@ -1269,7 +1270,7 @@ describe('the toolbar sheet', () => {
   itDom('closes when a control on it acts on the plan', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     expect(screen.queryByRole('button', { name: 'Add work item' })).toBeNull();
@@ -1293,7 +1294,7 @@ describe('the toolbar sheet', () => {
     // lists the control by its name rather than by a gear.
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'Plan actions' })).toBeInTheDocument();
     });
@@ -1331,7 +1332,7 @@ describe('the toolbar sheet', () => {
   itDom('closing project settings puts the focus back on its trigger', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'Plan actions' })).toBeInTheDocument();
     });
@@ -1369,7 +1370,7 @@ describe('the toolbar sheet', () => {
   itDom('adds a step from inside the sheet', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();
     openTheSheet();
     fireEvent.click(await screen.findByRole('button', { name: 'Project settings' }));
@@ -1423,7 +1424,7 @@ describe('the toolbar sheet', () => {
     async () => {
       const api = fakeApi();
       widthIs(PHONE);
-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
       await addAWorkItem();

       const trigger = screen.getByRole('button', { name: 'Plan actions' });
@@ -1453,7 +1454,7 @@ describe('the toolbar sheet', () => {
   itDom('leaves the focus on the cheat sheet the sheet opened', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'Plan actions' })).toBeInTheDocument();
     });
@@ -1493,7 +1494,7 @@ describe('the toolbar sheet', () => {
     localStorage.setItem('wbs.columnWidths.p1', JSON.stringify({ number: 240 }));
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'Plan actions' })).toBeInTheDocument();
     });
@@ -1521,7 +1522,7 @@ describe('the toolbar sheet', () => {
       localStorage.setItem('wbs.linksResetShown.p1', 'true');
       const api = fakeApi();
       widthIs(PHONE);
-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
       await waitFor(() => {
         expect(screen.getByRole('button', { name: 'Plan actions' })).toBeInTheDocument();
       });
@@ -1546,7 +1547,7 @@ describe('the toolbar sheet', () => {
   itDom('holds the page’s own shortcuts back while it is open', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'Plan actions' })).toBeInTheDocument();
     });
@@ -1574,7 +1575,7 @@ describe('what a card says about capacity', () => {
     for (let at = 0; at < howMany; at += 1) await api.createWorkItem('p1', { parentId: null });
     arrange(api.rows, api.teams, api);
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
   }

@@ -1956,7 +1957,7 @@ describe('what a card says about the schedule', () => {
     for (let at = 0; at < howMany; at += 1) await api.createWorkItem('p1', { parentId: null });
     arrange(api.rows);
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
   }

@@ -2082,7 +2083,7 @@ describe('the trio behind a step’s figure, on a card', () => {
   itDom('says nothing has been estimated, in the words the hover card already prints', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     expect(trioOnCard(DEV.id)?.textContent).toBe('No estimate yet');
@@ -2100,7 +2101,7 @@ describe('the trio behind a step’s figure, on a card', () => {
       const created = await api.createWorkItem('p1', { parentId: null });
       await api.setEstimate(created.id, DEV.id, { optimistic: 2, realistic: 3, pessimistic: 8 });
       widthIs(PHONE);
-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
       await screen.findByLabelText('Name of 010');

       expect(trioOnCard(DEV.id)?.textContent).toBe('optimistic 2 · realistic 3 · pessimistic 8');
@@ -2122,7 +2123,7 @@ describe('the trio behind a step’s figure, on a card', () => {
     const created = await api.createWorkItem('p1', { parentId: null });
     await api.setEstimate(created.id, DEV.id, { optimistic: 2, realistic: 3, pessimistic: 8 });
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');

     expect(screen.getByLabelText<HTMLInputElement>('Dev estimate for 010').value).toBe('2/3/8');
@@ -2136,7 +2137,7 @@ describe('the trio behind a step’s figure, on a card', () => {
     const created = await api.createWorkItem('p1', { parentId: null });
     await api.setEstimate(created.id, DEV.id, { optimistic: 5, realistic: 5, pessimistic: 5 });
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');

     expect(screen.getByLabelText<HTMLInputElement>('Dev estimate for 010').value).toBe('5');
@@ -2146,7 +2147,7 @@ describe('the trio behind a step’s figure, on a card', () => {
   itDom('opens on a tap and stays shut until one', async () => {
     const api = fakeApi();
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await addAWorkItem();

     const detail = detailOnCard(DEV.id);
@@ -2192,7 +2193,7 @@ describe('typing a trio on a card, where the keypad has no slash', () => {
     const created = await api.createWorkItem('p1', { parentId: null });
     if (days !== null) await api.setEstimate(created.id, DEV.id, days);
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     return api;
   };
@@ -2303,7 +2304,7 @@ describe('the ⋯ row-actions menu on a card in a running plan', () => {
     await api.createWorkItem('p1', { parentId: null });
     const sent = recordCalls(api, 'setStatus', (_id, status, on) => ({ status, on }));
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByRole('article', { name: 'Work item 010' });

     fireEvent.click(screen.getByRole('button', { name: 'Actions for 010' }));
@@ -2325,7 +2326,7 @@ describe('the ⋯ row-actions menu on a card in a running plan', () => {
     const api = fakeApi();
     await api.createWorkItem('p1', { parentId: null });
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByRole('article', { name: 'Work item 010' });

     fireEvent.click(screen.getByRole('button', { name: 'Actions for 010' }));
@@ -2344,7 +2345,7 @@ describe('the ⋯ row-actions menu on a card in a running plan', () => {
     await api.createWorkItem('p1', { parentId: null });
     await api.createWorkItem('p1', { parentId: null });
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByRole('article', { name: 'Work item 020' });

     fireEvent.click(screen.getByRole('button', { name: 'Actions for 010' }));
@@ -2368,7 +2369,7 @@ describe('the ⋯ row-actions menu on a card in a running plan', () => {
       // not how it came to be frozen.
       api.rows[0].frozenNumber = '010';
       widthIs(PHONE);
-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
       await screen.findByRole('article', { name: 'Work item 010' });

       fireEvent.click(screen.getByRole('button', { name: 'Actions for 010' }));
@@ -2786,7 +2787,7 @@ describe('a filter on a phone', () => {
     strip.serviceTeamId = 't1';
     strip.teamIds = ['t1'];
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
   }

@@ -2849,7 +2850,7 @@ describe('setting a card’s team', () => {
     for (let at = 0; at < howMany; at += 1) await api.createWorkItem('p1', { parentId: null });
     arrange(api.rows, api.teams);
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     return api;
   }
@@ -2931,7 +2932,7 @@ describe('setting a card’s team', () => {
       });
     };
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');

     fireEvent.click(teamFields()[0]);
@@ -3056,7 +3057,7 @@ describe('setting a card’s tags and services', () => {
     const api = fakeApi();
     await api.createWorkItem('p1', { parentId: null });
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');

     expect(document.querySelector('[data-card-tags-field]')).toBeNull();
@@ -3072,7 +3073,7 @@ describe('setting a card’s tags and services', () => {
     api.services.push({ id: 'service-seed', name: 'seed service' });
     arrange(api.rows);
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     return api;
   }
@@ -3146,7 +3147,7 @@ describe('setting a card’s earliest start', () => {
     await api.createWorkItem('p1', { parentId: null });
     arrange(api.rows);
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     return api;
   }
@@ -3248,7 +3249,7 @@ describe('setting a card’s earliest start', () => {
     const api = fakeApi();
     await api.createWorkItem('p1', { parentId: null });
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');

     const field = dateFields()[0];
@@ -3311,7 +3312,7 @@ describe('setting a card’s work item deadline', () => {
     await api.createWorkItem('p1', { parentId: null });
     arrange(api.rows);
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     return api;
   }
@@ -3458,7 +3459,7 @@ describe('setting a card’s work item deadline', () => {
     const api = fakeApi({ dated: false });
     await api.createWorkItem('p1', { parentId: null });
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');

     const field = deadlineFields()[0];
@@ -3483,7 +3484,7 @@ describe('setting a card’s priority', () => {
     for (let at = 0; at < howMany; at += 1) await api.createWorkItem('p1', { parentId: null });
     arrange(api.rows);
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     return api;
   }
@@ -3684,7 +3685,7 @@ describe('setting what a card waits for', () => {
     for (let at = 0; at < howMany; at += 1) await api.createWorkItem('p1', { parentId: null });
     arrange(api.rows);
     widthIs(PHONE);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     return api;
   }
@@ -3934,7 +3935,7 @@ describe('what a gesture over the plan costs the cards behind it', () => {
     const api = fakeApi();
     for (let at = 0; at < 5; at += 1) await api.createWorkItem('p1', { parentId: null });
     widthIs(PHONE, PHONE_TALL);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     expect(document.querySelectorAll('[data-card]')).toHaveLength(5);
   }
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-cells.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-cells.test.tsx
index 91b73688..17791ddd 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-cells.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-cells.test.tsx
@@ -4,6 +4,7 @@ import { beforeEach, describe, expect, it, vi } from 'vitest';
 import type { ProjectApi } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi as fakeApi, QA } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { recordCalls } from '@/testing/record-calls';

 import { isoToday } from './gantt-panel';
@@ -147,7 +148,7 @@ describe('teams and assignees', () => {
   async function oneRow(teamNames: readonly string[] = []) {
     const api = fakeApi();
     for (const teamName of teamNames) await api.addTeam(teamName);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     // Dev only, and QA deliberately left folded: the folded cell is where the
@@ -396,7 +397,7 @@ describe('the priority cell', () => {
   /** Two empty root rows, and the api the table is driving. */
   async function twoRows() {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     click('Add work item');
@@ -764,7 +765,7 @@ describe('the In-parallel cell', () => {
   /** Two empty root rows, and the api the table is driving. */
   async function twoRows() {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     click('Add work item');
@@ -868,7 +869,7 @@ describe('the In-parallel cell', () => {
     const perform = api.patchWorkItem.bind(api);
     api.patchWorkItem = (id: string, patch: Record<string, unknown>) =>
       'maxParallel' in patch ? Promise.reject(new Error(code)) : perform(id, patch);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
   }
@@ -1081,7 +1082,7 @@ describe('the earliest-start cell', () => {
   /** One empty root row on a plan that is on a calendar, so the cell will open. */
   async function datedPlan() {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     click('Add work item');
@@ -1152,7 +1153,7 @@ describe('the earliest-start cell', () => {
     // be-01 ignores the constraint entirely, so the cell is a rendered
     // disabled state that says why — not an editor that opens onto nothing.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');

@@ -1225,7 +1226,9 @@ describe('the earliest-start cell', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     typeIntoDate('Project start date', '2026-08-06');
@@ -1265,7 +1268,7 @@ describe('the work item deadline cell', () => {
   async function datedPlanWithDeadlineColumn() {
     showEveryColumn();
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     typeIntoDate('Project start date', '2026-08-06');
@@ -1626,7 +1629,7 @@ describe('the work item deadline cell', () => {
     // is the whole of this state rather than a disabled cell wearing a warning.
     showEveryColumn();
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     const row = api.rows.at(0);
@@ -1648,7 +1651,7 @@ describe('the work item deadline cell', () => {
     // onto nothing.
     showEveryColumn();
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     const patched = recordCalls(api, 'patchWorkItem', (_id, patch) => patch);
@@ -1685,7 +1688,7 @@ describe('names wrap and notes carry markdown', () => {
   /** One row, named `typed` and saved. */
   async function oneRowNamed(typed: string): Promise<HTMLTextAreaElement> {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const cell = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');
     fireEvent.change(cell, { target: { value: typed } });
@@ -1709,7 +1712,7 @@ describe('names wrap and notes carry markdown', () => {
    */
   async function oneRowWithNotes(notes: string) {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const cell = await screen.findByLabelText('Name of 010');
     fireEvent.change(cell, { target: { value: `Strip\n${notes}` } });
@@ -1783,7 +1786,7 @@ describe('names wrap and notes carry markdown', () => {
     // one-row textarea wraps and then hides everything past the first line,
     // which is the same crop with extra steps.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const name = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');

@@ -1812,7 +1815,7 @@ describe('names wrap and notes carry markdown', () => {
     // 'auto' to be 'hidden'`; and the cap left on with it — `expected '5.6em'
     // to be 'none'`. Watched, 2026-08-09.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const name = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');

@@ -1834,7 +1837,7 @@ describe('names wrap and notes carry markdown', () => {

   itDom('gives the name a box that wraps rather than one that scrolls', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010').catch(() => undefined);
     click('Add work item');

@@ -1851,7 +1854,7 @@ describe('names wrap and notes carry markdown', () => {
     // now. In the cell the box follows the text; the clamp is the other half
     // of this and only a browser can measure it.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const name = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');

@@ -1881,7 +1884,7 @@ describe('names wrap and notes carry markdown', () => {
     // sets this test up read the truncated box and deleted the note on the
     // way past. Watched, 2026-08-09.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const name = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');

@@ -2003,7 +2006,7 @@ describe('names wrap and notes carry markdown', () => {

   itDom('shows no popover over a row with no notes', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const name = await screen.findByLabelText('Name of 010');
     // A named row with no note: the hover has a cell and a name to find, and
@@ -2188,7 +2191,7 @@ describe('names wrap and notes carry markdown', () => {
     render(
       <WbsTable
         projectId="p1"
-        api={api}
+        projectServices={projectServicesOf(api)}
         subscribe={(_projectId, handlers) => {
           notify = handlers.onChange;
           return { seen: () => undefined, unsubscribe: () => undefined };
@@ -2250,7 +2253,7 @@ describe('names wrap and notes carry markdown', () => {
     render(
       <WbsTable
         projectId="p1"
-        api={api}
+        projectServices={projectServicesOf(api)}
         subscribe={(_projectId, handlers) => {
           notify = handlers.onChange;
           return { seen: () => undefined, unsubscribe: () => undefined };
@@ -2361,7 +2364,7 @@ describe('a name and its notes in one box', () => {
    */
   async function noted(name: string, notes: string) {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const cell = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');
     fireEvent.change(cell, { target: { value: notes === '' ? name : `${name}\n${notes}` } });
@@ -2385,7 +2388,7 @@ describe('a name and its notes in one box', () => {

   itDom('writes the first line as the name and the rest as the notes', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const cell = await screen.findByLabelText('Name of 010');

@@ -2446,7 +2449,9 @@ describe('a name and its notes in one box', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     click('Add work item');
     const cell = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');
     fireEvent.change(cell, { target: { value: 'Strip' } });
@@ -2640,7 +2645,7 @@ describe('the tag cell', () => {
     const ready = await api.addTag('Ready');
     api.labelWithTag(strip.id, [risk.id, review.id]);
     api.labelWithTag(sockets.id, [ready.id]);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '010.1']);
     });
@@ -2716,7 +2721,7 @@ describe('the service cell', () => {
   }

   const drawn = async (api: ProjectApi): Promise<void> => {
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '010.1']);
     });
@@ -2886,7 +2891,7 @@ describe('the links column', () => {
   }

   const drawn = async (api: ProjectApi): Promise<void> => {
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '020']);
     });
@@ -3433,7 +3438,7 @@ describe('the status cell and the two fact cells', () => {
   async function planWithStatusColumns() {
     showEveryColumn();
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     return api;
@@ -3613,7 +3618,7 @@ describe('the status cell and the two fact cells', () => {
     const api = fakeApi();
     const strip = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
     await api.patchWorkItem(strip.id, { factEnd: '2026-09-10' });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     const order: string[] = [];
     recordCalls(api, 'setStatus', (_id, status, on) => order.push(`setStatus ${status} ${on}`));
@@ -3642,7 +3647,7 @@ describe('the status cell and the two fact cells', () => {
     const api = fakeApi();
     await api.setStartDate('p1', '2026-09-01');
     await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     const sent = recordCalls(api, 'setStatus', (_id, status, on, factStart) => ({
       status,
@@ -3678,7 +3683,7 @@ describe('the status cell and the two fact cells', () => {
     const api = fakeApi();
     const strip = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
     await api.patchWorkItem(strip.id, { factEnd: '2026-09-10' });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     const order: string[] = [];
     recordCalls(api, 'setStatus', (_id, status, on) => order.push(`setStatus ${status} ${on}`));
@@ -3717,7 +3722,7 @@ describe('the status cell and the two fact cells', () => {
     const api = fakeApi();
     const strip = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
     await api.createWorkItem('p1', { parentId: strip.id, afterId: null, name: 'Sockets' });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010.1');
     const sent = recordCalls(api, 'setStatus', (id, status, on) => ({ id, status, on }));

diff --git a/apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx
index b2ef57b3..da494cb5 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx
@@ -6,6 +6,7 @@ import type { ProjectApi } from '@/lib/wbs-api';
 import { DEFAULT_PERT_WEIGHTS_VIEW } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { refusingApi } from '@/testing/refusing-api';
 import { planRead, projectListEntry, sliceView, workItemView } from '@/testing/views';

@@ -154,7 +155,9 @@ const rowFor = (number: string): HTMLElement => {
 async function threeRoots(api = fakeApi(), subscribe?: WbsTableProps['subscribe']) {
   // Dev's columns take part in the keyboard grid below, so they are open.

-  render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+  render(
+    <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+  );
   // Named, not left blank. Blank names made an ordering assertion compare three
   // empty strings against three empty strings, which passes for any order.
   for (const [number, name] of [
@@ -607,7 +610,7 @@ describe('the chart under a plan being edited', () => {
   };

   itDom('redraws the open chart when a not-before edit moves the schedule', async () => {
-    render(<WbsTable projectId="p1" api={apiWithMovableFloor()} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(apiWithMovableFloor())} />);
     await waitFor(() => rowFor('010'));

     fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
@@ -635,7 +638,7 @@ describe('the chart under a plan being edited', () => {
     // fails on `expected 'Strip. 1 person. Held by its start-no-earlier-than
     // date' to contain 'Held by its start-no-earlier-than date — waiting on
     // client sign-off'`. Watched, 2026-08-18.
-    render(<WbsTable projectId="p1" api={apiWithMovableFloor()} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(apiWithMovableFloor())} />);
     await waitFor(() => rowFor('010'));
     fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
     const bar = () => document.querySelector('[data-gantt-bar]');
@@ -800,7 +803,7 @@ describe('holding the chart to the row the table is showing', () => {
     // Proof: the axis guard in `wbs-table.tsx` dropped — this failed on
     // `expected [ 'Error: the Gantt panel has no calendar axis to measure its
     // content top from' ] to deeply equal []`. Watched on h2puni, 2026-08-13.
-    render(<WbsTable projectId="p1" api={circularApi()} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(circularApi())} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     click('Gantt');
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-dependencies.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-dependencies.test.tsx
index 1bbbea54..89649695 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-dependencies.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-dependencies.test.tsx
@@ -6,6 +6,7 @@ import type { ProjectApi, WorkItemView } from '@/lib/wbs-api';
 import { DEFAULT_PERT_WEIGHTS_VIEW } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { recordCalls } from '@/testing/record-calls';
 import { refusingApi } from '@/testing/refusing-api';
 import { planRead, projectListEntry, sliceView, workItemView } from '@/testing/views';
@@ -121,7 +122,7 @@ async function threeRoots() {
   // Dev's columns take part in the keyboard grid below, so they are open.

   const api = fakeApi();
-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   // Named, not left blank. Blank names made an ordering assertion compare three
   // empty strings against three empty strings, which passes for any order.
   for (const [number, name] of [
@@ -1083,7 +1084,9 @@ describe('picking dependencies from a list', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     const input = await screen.findByLabelText('Add a dependency to 020');

     // Highlight Paint by hand: Down to Strip, Down again to Paint.
@@ -1161,7 +1164,9 @@ describe('the picker marks what be-01 would refuse', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     await screen.findByLabelText('Add a dependency to 010.1');
     return {
       api,
@@ -1436,13 +1441,18 @@ describe('dependencies in the table — cross-review findings', () => {
   };

   itDom('shows the schedule be-01 sent, not one it worked out itself', async () => {
-    render(<WbsTable projectId="p1" api={apiReturning(null)} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(apiReturning(null))} />);

     expect(await cells()).toEqual({ start: '11', finish: '18', float: '2' });
   });

   itDom('names a critical row rather than printing its zero', async () => {
-    render(<WbsTable projectId="p1" api={apiReturning(null, { float: 0, critical: true })} />);
+    render(
+      <WbsTable
+        projectId="p1"
+        projectServices={projectServicesOf(apiReturning(null, { float: 0, critical: true }))}
+      />,
+    );

     // One word, which is what the 56px column can hold now that the word is a
     // tag rather than a figure — and what `plan-export.ts` has always printed.
@@ -1450,7 +1460,7 @@ describe('dependencies in the table — cross-review findings', () => {
   });

   itDom('explains a slack figure in its hover title', async () => {
-    render(<WbsTable projectId="p1" api={apiReturning(null)} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(apiReturning(null))} />);

     await cells();
     const row = screen
@@ -1462,7 +1472,12 @@ describe('dependencies in the table — cross-review findings', () => {
   });

   itDom('explains what critical means in the hover title', async () => {
-    render(<WbsTable projectId="p1" api={apiReturning(null, { float: 0, critical: true })} />);
+    render(
+      <WbsTable
+        projectId="p1"
+        projectServices={projectServicesOf(apiReturning(null, { float: 0, critical: true }))}
+      />,
+    );

     await cells();
     const row = screen
@@ -1477,7 +1492,7 @@ describe('dependencies in the table — cross-review findings', () => {
     // agy, medium. A cycle sends every row the same zeroed schedule, and
     // printing those reads as "everything happens on day zero" — a confident
     // wrong answer, next to a banner saying no dates could be worked out.
-    render(<WbsTable projectId="p1" api={apiReturning('cycle')} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(apiReturning('cycle'))} />);

     expect(await cells()).toEqual({ start: '—', finish: '—', float: '—' });
     expect(screen.getByRole('alert').textContent).toContain('run in a circle');
@@ -1763,7 +1778,7 @@ describe('hovering a dependency lights the rows it names', () => {

   itDom('a collapsed dependency has no row to light, and the card still names it', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     pressNewItem('010');
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx
index 2d3902e5..e9021e14 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx
@@ -4,6 +4,7 @@ import { beforeEach, describe, expect, it, vi } from 'vitest';
 import type { ProjectApi } from '@/lib/wbs-api';
 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { recordCalls } from '@/testing/record-calls';

 import { STEP_FINAL_HINT } from './column-hints';
@@ -140,7 +141,7 @@ const rowFor = (number: string): HTMLElement => {
 describe('step columns fold away', () => {
   async function oneRow() {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     return api;
@@ -316,7 +317,7 @@ describe('assigning from a folded step’s cell with @', () => {
   /** One row and two steps, both folded — where a person starts. */
   async function oneRow() {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     return api;
@@ -862,7 +863,7 @@ describe('one cell for the whole trio', () => {
   /** One row, steps left folded — which is where a person starts. */
   async function oneRow() {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     return api;
@@ -1570,7 +1571,7 @@ describe('estimates are never edited for you', () => {

   async function oneRow() {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     unfoldStep('Dev');
@@ -1780,7 +1781,7 @@ describe('what the plan is still missing', () => {
   /** Rows with nothing typed into them yet, steps left folded — where a person starts. */
   async function rows(count: number) {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     for (const number of ['010', '020', '030'].slice(0, count)) {
       click('Add work item');
       await screen.findByLabelText(`Name of ${number}`);
@@ -1831,7 +1832,7 @@ describe('what the plan is still missing', () => {

   itDom('says nothing about a project with no work items in it', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'Add work item' })).toBeDefined();
     });
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-filter.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-filter.test.tsx
index d58180af..8937fecb 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-filter.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-filter.test.tsx
@@ -4,6 +4,7 @@ import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import type { ProjectApi, WorkItemView } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi as fakeApi, QA } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';

 import type * as TableFrameModule from './table-frame';
 import { type SubscriptionHandlers, WbsTable } from './wbs-table';
@@ -142,7 +143,7 @@ describe('finding a work item in the tree', () => {
   /** Renders the plan above and waits for it to be on screen. */
   async function shownPlan(): Promise<ProjectApi & { rows: WorkItemView[] }> {
     const api = await decorating();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(EVERY_ROW);
     });
@@ -157,7 +158,7 @@ describe('finding a work item in the tree', () => {

   itDom('a project switch cannot show or apply the previous project’s query', async () => {
     const api = await decorating();
-    const view = render(<WbsTable projectId="p1" api={api} />);
+    const view = render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(EVERY_ROW);
     });
@@ -166,7 +167,7 @@ describe('finding a work item in the tree', () => {
       expect(numbersOnScreen()).toEqual(['010', '010.2']);
     });

-    view.rerender(<WbsTable projectId="p2" api={api} />);
+    view.rerender(<WbsTable projectId="p2" projectServices={projectServicesOf(api)} />);

     expect(findBox().value).toBe('');
     await waitFor(() => {
@@ -322,7 +323,7 @@ describe('finding a work item in the tree', () => {
     expect(numbersOnScreen()).toEqual(['010', '010.1', '010.2', '020', '020.1']);

     cleanup();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '010.1', '010.2', '020', '020.1']);
@@ -335,7 +336,7 @@ describe('finding a work item in the tree', () => {
     expect(numbersOnScreen()).toEqual(['010', '020']);

     cleanup();
-    render(<WbsTable projectId="p2" api={api} />);
+    render(<WbsTable projectId="p2" projectServices={projectServicesOf(api)} />);

     // A different project has its own memory, and no memory means everything
     // open — not the shape the last project was left in.
@@ -415,7 +416,7 @@ describe('narrowing the plan by facet', () => {
     await api.setEstimate(paint.id, DEV.id, { optimistic: 1, realistic: 2, pessimistic: 3 });
     await api.setEstimate(paint.id, QA.id, { optimistic: 1, realistic: 2, pessimistic: 3 });

-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '010.1', '010.1.1', '010.2', '020', '020.1']);
     });
@@ -516,7 +517,7 @@ describe('narrowing the plan by facet', () => {
     const ready = await api.addTag('Ready');
     api.labelWithTag(strip.id, [risk.id]);
     api.labelWithTag(sockets.id, [ready.id]);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
     });
@@ -679,7 +680,7 @@ describe('narrowing the plan by facet', () => {
     expect(numbersOnScreen()).toEqual(['010', '010.1', '010.1.1']);

     cleanup();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '010.1', '010.1.1', '010.2', '020', '020.1']);
@@ -779,7 +780,7 @@ describe('narrowing the plan by service, and by the two mismatch signals', () =>

   /** Draw it, and wait for the six rows the fixture builds. */
   async function shown(api: ProjectApi): Promise<void> {
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '010.1', '010.1.1', '010.2', '020', '020.1']);
     });
@@ -855,7 +856,7 @@ describe('narrowing the plan by service, and by the two mismatch signals', () =>
       // feature is broken.
       const api = fakeApi();
       await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip the walls' });
-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
       await waitFor(() => {
         expect(numbersOnScreen()).toEqual(['010']);
       });
@@ -1127,7 +1128,9 @@ describe('narrowing the plan by service, and by the two mismatch signals', () =>
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '010.1', '010.1.1', '010.2', '020', '020.1']);
     });
@@ -1188,7 +1191,7 @@ describe('saved views, per browser', () => {
     const billing = await api.addTeam('Billing');
     await api.patchWorkItem(strip.id, { serviceTeamId: billing.id });

-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '020']);
     });
@@ -1309,7 +1312,7 @@ describe('saved views, per browser', () => {
     find('');

     cleanup();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '020']);
     });
@@ -1369,7 +1372,7 @@ describe('saved views, per browser', () => {

     localStorage.removeItem(HIDDEN_KEY);
     cleanup();
-    render(<WbsTable projectId="p1" api={fakeApi()} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(fakeApi())} />);
     await waitFor(() => {
       expect(columnsOnScreen()).not.toContain('refs');
     });
@@ -1553,7 +1556,13 @@ describe('what the filter says it dropped, and what it exports', () => {
     await api.setEstimate(paint.id, DEV.id, { optimistic: 1, realistic: 2, pessimistic: 3 });
     await api.addDependency(paint.id, strip.id);

-    render(<WbsTable projectId="p1" api={api} projectName="Rewire the shed" />);
+    render(
+      <WbsTable
+        projectId="p1"
+        projectServices={projectServicesOf(api)}
+        projectName="Rewire the shed"
+      />,
+    );
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010', '020']);
     });
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-keyboard.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-keyboard.test.tsx
index c0f27368..9e290740 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-keyboard.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-keyboard.test.tsx
@@ -4,6 +4,7 @@ import { beforeEach, describe, expect, it, vi } from 'vitest';
 import type { ProjectApi } from '@/lib/wbs-api';
 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { recordCalls } from '@/testing/record-calls';

 import type * as TableFrameModule from './table-frame';
@@ -175,7 +176,7 @@ async function threeRoots() {
   // Dev's columns take part in the keyboard grid below, so they are open.

   const api = fakeApi();
-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   // Named, not left blank. Blank names made an ordering assertion compare three
   // empty strings against three empty strings, which passes for any order.
   for (const [number, name] of [
@@ -1214,7 +1215,7 @@ describe('the command chords', () => {
     // The whole of R1's second half: a note is typed under the name, which
     // needs Enter to mean what it means in every other text box in the world.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const cell = await screen.findByLabelText('Name of 010');

@@ -1843,7 +1844,7 @@ describe('the command chords', () => {
     render(
       <WbsTable
         projectId="p1"
-        api={api}
+        projectServices={projectServicesOf(api)}
         subscribe={(_projectId, handlers) => {
           notify = handlers.onChange;
           return { seen: () => undefined, unsubscribe: () => undefined };
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-layout.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-layout.test.tsx
index 9ed74c9d..214debd8 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-layout.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-layout.test.tsx
@@ -3,6 +3,7 @@ import { beforeEach, describe, expect, it, vi } from 'vitest';

 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';

 import { DAY_PX } from './gantt-panel';
 import type * as TableFrameModule from './table-frame';
@@ -191,7 +192,7 @@ async function threeRoots() {
   }

   const api = fakeApi();
-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   // Named, not left blank. Blank names made an ordering assertion compare three
   // empty strings against three empty strings, which passes for any order.
   for (const [number, name] of [
@@ -482,7 +483,9 @@ describe('the widths the table is laid out by', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     click('Add work item');
     const name = await screen.findByLabelText('Name of 010');
     const before = screen.getByRole('table').style.minWidth;
@@ -755,7 +758,7 @@ describe('the outline past the Number cap', () => {
    */
   itDom('hands the Name cell the share of the indent the Number cap withheld', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     pressNewItem('010');
@@ -857,7 +860,9 @@ describe('the widths this browser has dragged', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     return {
@@ -1185,7 +1190,7 @@ describe('the widths this browser has dragged', () => {
     const api = fakeApi();
     const root = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Root' });
     await api.createWorkItem('p1', { parentId: root.id, afterId: null, name: 'Child' });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010.1');

     expect(laidOut()['number']).toBe('68px');
@@ -1207,7 +1212,7 @@ describe('the widths this browser has dragged', () => {
       name: 'Child',
     });
     await api.createWorkItem('p1', { parentId: child.id, afterId: null, name: 'Grandchild' });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010.1.1');

     expect(laidOut()['number']).toBe('98px');
@@ -1289,7 +1294,7 @@ describe('the widths this browser has dragged', () => {
     // half-typed name gone with it. Watched, 2026-08-09.
     storedWidths({ number: 240 });
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const name = await screen.findByLabelText('Name of 010');
     name.focus();
@@ -1310,12 +1315,14 @@ describe('the widths this browser has dragged', () => {
     storedWidths({ number: 240 });
     localStorage.setItem('wbs.columnWidths.p2', JSON.stringify({ number: 300 }));
     const api = fakeApi();
-    const { rerender } = render(<WbsTable projectId="p1" api={api} />);
+    const { rerender } = render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} />,
+    );
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     expect(laidOut()['number']).toBe('240px');

-    rerender(<WbsTable projectId="p2" api={api} />);
+    rerender(<WbsTable projectId="p2" projectServices={projectServicesOf(api)} />);

     await waitFor(() => {
       expect(laidOut()['number']).toBe('300px');
@@ -1625,7 +1632,7 @@ describe('the columns a reader has hidden', () => {
   const stored = (): string | null => localStorage.getItem(KEY);

   async function oneRow(api = fakeApi()) {
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     return api;
@@ -1668,7 +1675,7 @@ describe('the columns a reader has hidden', () => {
       const api = fakeApi();
       const row = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Linked' });
       api.linkTo(row.id, [{ systemId: 'github', url: 'https://example.test/1' }]);
-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
       await screen.findByLabelText('Name of 010');
       expect(headerIds()).toEqual(DEFAULT_ON_SCREEN(['step-dev', 'step-qa']));
       expect(screen.getByRole('button', { name: 'Reset layout' })).toBeInTheDocument();
@@ -1679,7 +1686,7 @@ describe('the columns a reader has hidden', () => {
       expect(screen.queryByRole('button', { name: 'Reset layout' })).toBeNull();

       cleanup();
-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
       await screen.findByLabelText('Name of 010');
       expect(headerIds()).toContain('refs');
     },
@@ -1699,18 +1706,18 @@ describe('the columns a reader has hidden', () => {
     localStorage.setItem(RESET_MARKER, 'true');
     const api = fakeApi();
     await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'One row' });
-    const view = render(<WbsTable projectId="p1" api={api} />);
+    const view = render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     expect(headerIds()).toContain('refs');

-    view.rerender(<WbsTable projectId="p2" api={api} />);
+    view.rerender(<WbsTable projectId="p2" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(headerIds()).not.toContain('refs');
     });
     expect(localStorage.getItem(RESET_MARKER)).toBe('true');
     expect(localStorage.getItem('wbs.linksResetShown.p2')).toBeNull();

-    view.rerender(<WbsTable projectId="p1" api={api} />);
+    view.rerender(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(headerIds()).toContain('refs');
     });
@@ -1727,7 +1734,7 @@ describe('the columns a reader has hidden', () => {
     const read = vi.fn(() => held);
     api.tree = read;

-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(read).toHaveBeenCalledTimes(1);
     });
@@ -1745,7 +1752,7 @@ describe('the columns a reader has hidden', () => {
     const api = fakeApi();
     const row = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Linked' });
     api.linkTo(row.id, [{ systemId: 'github', url: 'https://example.test/held' }]);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     api.tree = () => Promise.reject(new Error('offline'));

@@ -1761,7 +1768,7 @@ describe('the columns a reader has hidden', () => {
     const api = fakeApi();
     const row = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Linked' });
     api.linkTo(row.id, [{ systemId: 'github', url: 'https://example.test/1' }]);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     click('Reset layout');
     expect(headerIds()).toContain('refs');
@@ -1795,7 +1802,7 @@ describe('the columns a reader has hidden', () => {
       linkedApi.linkTo(linkedRow.id, [
         { systemId: 'github', url: 'https://example.test/before-removal' },
       ]);
-      render(<WbsTable projectId="p1" api={linkedApi} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(linkedApi)} />);
       await screen.findByLabelText('Name of 010');

       const linkedTree = linkedApi.tree.bind(linkedApi);
@@ -1831,7 +1838,7 @@ describe('the columns a reader has hidden', () => {
         afterId: null,
         name: 'Unlinked',
       });
-      render(<WbsTable projectId="p1" api={emptyApi} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(emptyApi)} />);
       await screen.findByLabelText('Name of 010');
       fireEvent.click(within(openColumns()).getByLabelText('Links'));
       expect(headerIds()).toContain('refs');
@@ -1876,7 +1883,7 @@ describe('the columns a reader has hidden', () => {
       name: 'Linked child',
     });
     api.linkTo(child.id, [{ systemId: 'github', url: 'https://example.test/child' }]);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010.1');
     click('Collapse all');
     expect(screen.queryByLabelText('Name of 010.1')).toBeNull();
@@ -1965,7 +1972,7 @@ describe('the columns a reader has hidden', () => {
     const api = fakeApi();
     const row = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
     await api.setEstimate(row.id, 'step-qa', { optimistic: 2, realistic: 3, pessimistic: 4 });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010']);
     });
@@ -1977,7 +1984,7 @@ describe('the columns a reader has hidden', () => {
     cleanup();

     storedHidden(['step-qa']);
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual(['010']);
     });
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx
index d428956b..fbb42df9 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx
@@ -5,6 +5,7 @@ import { beforeEach, describe, expect, it, vi } from 'vitest';
 import { WbsRequestError, type WorkItemView } from '@/lib/wbs-api';
 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { recordCalls } from '@/testing/record-calls';

 import { refusedDraftFor } from './live-editing';
@@ -142,7 +143,7 @@ async function threeRoots() {
   // Dev's columns take part in the keyboard grid below, so they are open.

   const api = fakeApi();
-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   // Named, not left blank. Blank names made an ordering assertion compare three
   // empty strings against three empty strings, which passes for any order.
   for (const [number, name] of [
@@ -165,7 +166,7 @@ async function threeRoots() {
 describe('live edits from other people', () => {
   itDom('focuses a newly created row so the next keystroke lands in it', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     click('Add work item');
     const first = await screen.findByLabelText('Name of 010');
@@ -203,7 +204,9 @@ describe('live edits from other people', () => {
       };
     };

-    const view = render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    const view = render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     await waitFor(() => {
       expect(screen.getAllByRole('row')).toHaveLength(1);
     });
@@ -270,7 +273,9 @@ describe('live edits from other people', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     await waitFor(() => {
       expect(reads).toContain('listPeople');
     });
@@ -364,7 +369,9 @@ describe('live edits from other people', () => {
       return { seen: () => undefined, unsubscribe: () => undefined };
     };

-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     await waitFor(() => {
       expect(screen.getAllByRole('row')).toHaveLength(1);
     });
@@ -398,7 +405,9 @@ describe('someone else editing while you are typing', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );

     click('Add work item');
     const input = await screen.findByLabelText('Name of 010');
@@ -433,7 +442,9 @@ describe('someone else editing while you are typing', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );

     click('Add work item');
     const input = await screen.findByLabelText('Name of 010');
@@ -465,7 +476,9 @@ describe('someone else editing while you are typing', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );

     click('Add work item');
     const input = await screen.findByLabelText('Name of 010');
@@ -502,7 +515,9 @@ describe('someone else editing while you are typing', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );

     click('Add work item');
     const input = await screen.findByLabelText('Name of 010');
@@ -552,7 +567,9 @@ describe('someone else editing while you are typing', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );

     click('Add work item');
     const cell = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');
@@ -684,7 +701,7 @@ describe('failures you can see', () => {
           }),
         );

-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

       await waitFor(() => {
         expect(toastTexts()).toContain('Optimized scheduling is unavailable in this runtime.');
@@ -712,7 +729,9 @@ describe('failures you can see', () => {
       notify = handlers.onChange;
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
     await waitFor(() => {
       expect(numbersOnScreen()).toEqual([]);
@@ -1327,7 +1346,7 @@ describe('a step changing, and what the table does about it', () => {
   /** One empty root row, with both seeded steps still there. */
   async function oneRow() {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     return api;
@@ -1352,7 +1371,7 @@ describe('a step changing, and what the table does about it', () => {
     ] as const) {
       recordCalls(api, method, () => reads.push(method));
     }
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     await waitFor(() => {
       expect(reads).toContain('listCalendarMarkers');
@@ -1393,7 +1412,7 @@ describe('a step changing, and what the table does about it', () => {
       await removeStep(...args);
       throw new Error('unknown_step');
     };
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByRole('button', { name: 'Unfold QA estimates' });
     await waitFor(() => {
       expect(reads).toContain('listCalendarMarkers');
@@ -1578,7 +1597,7 @@ describe('overlapping resource invalidations', () => {
     render(
       <WbsTable
         projectId="p1"
-        api={api}
+        projectServices={projectServicesOf(api)}
         subscribe={(_project, handlers) => {
           notify = handlers.onChange;
           return { seen: () => undefined, unsubscribe: () => undefined };
@@ -1648,7 +1667,7 @@ describe('overlapping resource invalidations', () => {
       render(
         <WbsTable
           projectId="p1"
-          api={api}
+          projectServices={projectServicesOf(api)}
           subscribe={(_project, handlers) => {
             notify = handlers.onChange;
             return { seen: () => undefined, unsubscribe: () => undefined };
@@ -1698,7 +1717,9 @@ describe('refresh owner lifetimes', () => {
         notify = handlers.onChange;
         return { seen: () => undefined, unsubscribe: () => undefined };
       };
-      const view = render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+      const view = render(
+        <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+      );
       await waitFor(() => {
         expect(notify).toBeTypeOf('function');
       });
@@ -1718,7 +1739,13 @@ describe('refresh owner lifetimes', () => {
         name: 'Replacement owner',
       });
       replacement.rows[0].id = 'replacement-owner-row';
-      view.rerender(<WbsTable projectId="p1" api={replacement} subscribe={subscribe} />);
+      view.rerender(
+        <WbsTable
+          projectId="p1"
+          projectServices={projectServicesOf(replacement)}
+          subscribe={subscribe}
+        />,
+      );
       await waitFor(() => {
         expect(screen.getByLabelText('Name of 010')).toHaveProperty('value', 'Replacement owner');
       });
@@ -1743,7 +1770,7 @@ describe('refresh owner lifetimes', () => {
       <StrictMode>
         <WbsTable
           projectId="p1"
-          api={api}
+          projectServices={projectServicesOf(api)}
           subscribe={() => {
             opened += 1;
             return {
@@ -1768,7 +1795,7 @@ describe('refresh owner lifetimes', () => {
     const api = fakeApi();
     await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Old mutation' });
     api.rows[0].id = 'old-mutation-row';
-    const view = render(<WbsTable projectId="p1" api={api} />);
+    const view = render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     let reject!: (cause: unknown) => void;
     api.patchWorkItem = () =>
@@ -1788,7 +1815,7 @@ describe('refresh owner lifetimes', () => {
       name: 'New mutation owner',
     });
     replacement.rows[0].id = 'new-mutation-row';
-    view.rerender(<WbsTable projectId="p1" api={replacement} />);
+    view.rerender(<WbsTable projectId="p1" projectServices={projectServicesOf(replacement)} />);
     await waitFor(() => {
       expect(screen.getByLabelText('Name of 010')).toHaveProperty('value', 'New mutation owner');
     });
@@ -1810,7 +1837,7 @@ describe('refresh owner lifetimes', () => {
       new Promise((resolve) => {
         finishOld = resolve;
       });
-    const view = render(<WbsTable projectId="p1" api={api} />);
+    const view = render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     typeName('010', 'Departed write');
     fireEvent.blur(screen.getByLabelText('Name of 010'));
@@ -1846,7 +1873,7 @@ describe('refresh owner lifetimes', () => {
           void realReplacementPatch(...args).then(resolve);
         };
       });
-    view.rerender(<WbsTable projectId="p1" api={replacement} />);
+    view.rerender(<WbsTable projectId="p1" projectServices={projectServicesOf(replacement)} />);
     await waitFor(() => {
       expect(screen.getByLabelText('Name of 010')).toHaveProperty('value', 'Replacement owner');
       expect(replacementReads).toContain('listCalendarMarkers');
@@ -1886,7 +1913,7 @@ describe('refresh owner lifetimes', () => {
       new Promise((resolve) => {
         finishOld = resolve;
       });
-    const view = render(<WbsTable projectId="p1" api={api} />);
+    const view = render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     click('Arrange by schedule');
     await waitFor(() => {
@@ -1921,7 +1948,7 @@ describe('refresh owner lifetimes', () => {
           void patchReplacement(...args).then(resolve);
         };
       });
-    view.rerender(<WbsTable projectId="p1" api={replacement} />);
+    view.rerender(<WbsTable projectId="p1" projectServices={projectServicesOf(replacement)} />);
     await waitFor(() => {
       expect(screen.getByLabelText('Name of 010')).toHaveProperty(
         'value',
@@ -1968,7 +1995,7 @@ describe('refresh owner lifetimes', () => {
   it('does not announce an arrangement after its covering read changes API owner', async () => {
     const api = fakeApi();
     await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Old arrangement' });
-    const view = render(<WbsTable projectId="p1" api={api} />);
+    const view = render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');

     const readTree = api.tree.bind(api);
@@ -2011,7 +2038,7 @@ describe('refresh owner lifetimes', () => {
     ] as const) {
       recordCalls(replacement, method, () => replacementReads.push(method));
     }
-    view.rerender(<WbsTable projectId="p1" api={replacement} />);
+    view.rerender(<WbsTable projectId="p1" projectServices={projectServicesOf(replacement)} />);
     await waitFor(() => {
       expect(screen.getByLabelText('Name of 010')).toHaveProperty(
         'value',
@@ -2031,7 +2058,7 @@ describe('refresh owner lifetimes', () => {
   it('announces an arrangement after the same reader renews its subscription', async () => {
     const api = fakeApi();
     await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Same reader' });
-    const view = render(<WbsTable projectId="p1" api={api} />);
+    const view = render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');

     const readTree = api.tree.bind(api);
@@ -2059,7 +2086,7 @@ describe('refresh owner lifetimes', () => {
     view.rerender(
       <WbsTable
         projectId="p1"
-        api={api}
+        projectServices={projectServicesOf(api)}
         subscribe={() => {
           subscriptions += 1;
           return { seen: () => undefined, unsubscribe: () => undefined };
@@ -2177,7 +2204,7 @@ describe('write failure recovery scopes', () => {
       });
     };

-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     await waitFor(() => {
       expect(reads).toHaveLength(allReads.length);
@@ -2255,7 +2282,7 @@ describe('write failure recovery scopes', () => {
         rejectWrite = reject;
       });

-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     await waitFor(() => {
       expect(reads).toHaveLength(allReads.length);
@@ -2329,7 +2356,7 @@ describe('write failure recovery scopes', () => {
           });
       }

-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
       await screen.findByLabelText('Name of 010');
       await waitFor(() => {
         expect(reads).toHaveLength(allReads.length);
@@ -2398,7 +2425,7 @@ describe('write failure recovery scopes', () => {
       return Promise.reject(cause());
     };

-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 030');
     await waitFor(() => {
       expect(reads).toHaveLength(allReads.length);
@@ -2441,7 +2468,7 @@ describe('write failure recovery scopes', () => {
           );
     };

-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 030');
     await waitFor(() => {
       expect(reads).toHaveLength(allReads.length);
@@ -2466,7 +2493,7 @@ describe('write failure recovery scopes', () => {
     const reads: string[] = [];
     for (const method of allReads) recordCalls(api, method, () => reads.push(method));
     api.addDependency = () => Promise.reject(new Error('cycle'));
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 030');
     await waitFor(() => {
       expect(reads).toHaveLength(allReads.length);
@@ -2491,7 +2518,7 @@ describe('write failure recovery scopes', () => {
       new Promise((_resolve, reject) => {
         rejectOldDependency = reject;
       });
-    const view = render(<WbsTable projectId="p1" api={api} />);
+    const view = render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 030');
     const oldDependency = screen.getByLabelText('Add a dependency to 030');
     // A comma-separated gesture takes the dependency-list path rather than
@@ -2518,7 +2545,7 @@ describe('write failure recovery scopes', () => {
           void patchReplacement(...args).then(resolve);
         };
       });
-    view.rerender(<WbsTable projectId="p1" api={replacement} />);
+    view.rerender(<WbsTable projectId="p1" projectServices={projectServicesOf(replacement)} />);
     await waitFor(() => {
       expect(screen.getByLabelText('Name of 010')).toHaveValue('New first');
       expect(replacementReads).toHaveLength(allReads.length);
@@ -2566,7 +2593,7 @@ itDom('does not expose a first editor before its held column vocabulary installs
     requested = true;
     return held;
   };
-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   await waitFor(() => {
     expect(requested).toBe(true);
   });
@@ -2594,7 +2621,7 @@ itDom('installs held directory labels after a newer tree already installed', asy
   render(
     <WbsTable
       projectId="p1"
-      api={api}
+      projectServices={projectServicesOf(api)}
       subscribe={(_id, handlers) => {
         notify = handlers.onChange;
         return { seen: () => undefined, unsubscribe: () => undefined };
@@ -2655,7 +2682,7 @@ itDom('refreshes a created tag after its attachment refuses', async () => {
       }),
     );

-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   const box = await screen.findByRole('combobox', { name: 'Tags for 010' });
   expect(tagReads).toBe(1);
   fireEvent.focus(box);
@@ -2760,7 +2787,7 @@ describe('mounted reference creation after attachment refusal', () => {
     api.patchWorkItem = () => Promise.reject(new Error('attachment refused'));
     api.assignPerson = () => Promise.reject(new Error('assignment refused'));

-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
     await waitFor(() => {
       expect(reads).toHaveLength(9);
@@ -2825,7 +2852,7 @@ itDom('estimate refreshes only tree without a socket', async () => {
     recordCalls(api, method, () => reads.push(method));
   }

-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   await screen.findByLabelText('Dev estimate for 010');
   await waitFor(() => {
     expect(reads).toContain('listCalendarMarkers');
@@ -2890,7 +2917,7 @@ itDom('capacity setting refreshes only tree without a socket', async () => {
     recordCalls(api, method, () => reads.push(method));
   }

-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   await screen.findByLabelText('Name of 010');
   await waitFor(() => {
     expect(reads).toContain('listCalendarMarkers');
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-row-dependencies.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-row-dependencies.test.tsx
index da22e1ba..647a4d70 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-row-dependencies.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-row-dependencies.test.tsx
@@ -3,6 +3,7 @@ import { beforeEach, describe, expect, it } from 'vitest';

 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';

 import { shortIsoDate } from './short-date';
 import { type SubscriptionHandlers, WbsTable } from './wbs-table';
@@ -53,7 +54,9 @@ async function twoRowsAndAPeer() {
     notify = handlers.onChange;
     return { seen: () => undefined, unsubscribe: () => undefined };
   };
-  render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+  render(
+    <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+  );
   click('Add work item');
   await screen.findByLabelText('Name of 010');
   click('Add work item');
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-row-render-cost.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-row-render-cost.test.tsx
index ec9a477f..6c0a4ebe 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-row-render-cost.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-row-render-cost.test.tsx
@@ -3,6 +3,7 @@ import { beforeEach, describe, expect, it, vi } from 'vitest';

 import { DEV, fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';

 import type * as InlineMarkdownModule from './inline-markdown';
 import type * as PlanCellPropsModule from './plan-cell-props';
@@ -127,7 +128,7 @@ describe('what one row costs per render', () => {
     for (const name of ['Road', 'River', 'Rock']) {
       await api.createWorkItem('p1', { parentId: null, afterId: null, name });
     }
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 030');

     cellStyleCalls.count = 0;
@@ -147,7 +148,7 @@ describe('what one row costs per render', () => {
     // failed below on `expected 4 to be +0`: all four Name cells rendered for
     // a toolbar state change that altered no row input. Watched 2026-09-08.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     for (const number of ['010', '020', '030']) {
       click('Add work item');
       await screen.findByLabelText(`Name of ${number}`);
@@ -166,7 +167,7 @@ describe('what one row costs per render', () => {
     // Proof: with `WbsTable` subscribed to `cellCards` again, opening this one
     // card failed below on `expected 60 to be +0`. Watched 2026-09-08.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     for (const number of ['010', '020', '030']) {
       click('Add work item');
       await screen.findByLabelText(`Name of ${number}`);
@@ -199,7 +200,7 @@ describe('what one row costs per render', () => {
     // three sentences worked out per row where there is one. Watched
     // 2026-09-08.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     for (const number of ['010', '020', '030']) {
       click('Add work item');
       await screen.findByLabelText(`Name of ${number}`);
@@ -242,7 +243,7 @@ describe('what one row costs per render', () => {
     // per assignee on screen.
     showEveryColumn();
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     for (const number of ['010', '020', '030']) {
       click('Add work item');
       await screen.findByLabelText(`Name of ${number}`);
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-structure.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-structure.test.tsx
index a35ae383..65cad38b 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-structure.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-structure.test.tsx
@@ -4,6 +4,7 @@ import { beforeEach, describe, expect, it, vi } from 'vitest';
 import type { ProjectApi } from '@/lib/wbs-api';
 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { recordCalls } from '@/testing/record-calls';

 import type * as TableFrameModule from './table-frame';
@@ -177,7 +178,7 @@ async function threeRoots() {
   // Dev's columns take part in the keyboard grid below, so they are open.

   const api = fakeApi();
-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   // Named, not left blank. Blank names made an ordering assertion compare three
   // empty strings against three empty strings, which passes for any order.
   for (const [number, name] of [
@@ -214,7 +215,7 @@ describe('duplicating a branch', () => {
   /** A one-row project, already loaded, so the button has something to copy. */
   async function shownRow(api: ProjectApi): Promise<void> {
     await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Strip' });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');
   }

@@ -226,7 +227,7 @@ describe('duplicating a branch', () => {
       afterId: null,
       name: 'Sockets',
     });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');

     takeRowAction('010', 'Duplicate');
@@ -285,7 +286,7 @@ describe('the row actions menu', () => {
     for (const name of ['Strip', 'Sand', 'Paint']) {
       await api.createWorkItem('p1', { parentId: null, afterId: null, name });
     }
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 030');
   }

@@ -370,7 +371,7 @@ describe('the row actions menu', () => {
       name: 'Sand',
     });
     const removed = recordCalls(api, 'removeWorkItem');
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010.1');

     takeRowAction('010', 'Delete');
@@ -511,7 +512,7 @@ describe('the row actions menu', () => {
 describe('collapsing a branch', () => {
   itDom('hides the children of a collapsed parent and brings them back', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     click('Add work item');
     await screen.findByLabelText('Name of 010');
@@ -543,7 +544,7 @@ describe('collapsing a branch', () => {

   itDom('offers no expander on a leaf', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     click('Add work item');
     await screen.findByLabelText('Name of 010');
@@ -747,7 +748,9 @@ describe('a drag interrupted by someone else', () => {
       return { seen: () => undefined, unsubscribe: () => undefined };
     };
     // Re-render with a subscription so a peer edit can be delivered.
-    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
+    render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} subscribe={subscribe} />,
+    );
     await waitFor(() => {
       expect(screen.getAllByLabelText(/^Reorder 0/)).toHaveLength(6);
     });
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx
index 78aa85c5..6305bc2d 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx
@@ -4,6 +4,7 @@ import { beforeEach, describe, expect, it, vi } from 'vitest';
 import type { ProjectApi } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';
 import { recordCalls } from '@/testing/record-calls';

 import { hintFor } from './column-hints';
@@ -240,7 +241,7 @@ async function threeRoots() {
   // Dev's columns take part in the keyboard grid below, so they are open.

   const api = fakeApi();
-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   // Named, not left blank. Blank names made an ordering assertion compare three
   // empty strings against three empty strings, which passes for any order.
   for (const [number, name] of [
@@ -289,7 +290,7 @@ describe('the WBS table', () => {

   itDom('types a three-level breakdown without touching the mouse', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     click('Add work item');
     await screen.findByLabelText('Name of 010');
@@ -320,7 +321,7 @@ describe('the WBS table', () => {

   itDom('gives the number cell words only when the number does not fit', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     click('Add work item');
     await screen.findByLabelText('Name of 010');
@@ -401,7 +402,7 @@ describe('the WBS table', () => {
         return api.createWorkItem(projectId, input);
       },
     };
-    render(<WbsTable projectId="p1" api={slow} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(slow)} />);
     await screen.findByRole('button', { name: 'Add work item' });

     for (let i = 0; i < 6; i += 1) click('Add work item');
@@ -447,7 +448,9 @@ describe('the WBS table', () => {
         return forProject(projectId).createWorkItem(projectId, input);
       },
     };
-    const { rerender } = render(<WbsTable projectId="p1" api={api} />);
+    const { rerender } = render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} />,
+    );
     await screen.findByRole('button', { name: 'Add work item' });

     click('Add work item');
@@ -455,7 +458,7 @@ describe('the WBS table', () => {
       expect(calls).toEqual(['p1']);
     });

-    rerender(<WbsTable projectId="p2" api={api} />);
+    rerender(<WbsTable projectId="p2" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     releaseFirst?.();

@@ -471,7 +474,7 @@ describe('the WBS table', () => {

   itDom('abandons queued adds when unmounted during their covering read', async () => {
     const api = fakeApi();
-    const view = render(<WbsTable projectId="p1" api={api} />);
+    const view = render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await waitFor(() => {
       expect(document.querySelector('[data-export]')).not.toBeNull();
     });
@@ -504,7 +507,7 @@ describe('the WBS table', () => {

   itDom('outdents with shift-tab', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     click('Add work item');
     await screen.findByLabelText('Name of 010');
@@ -531,7 +534,9 @@ describe('the WBS table', () => {
     // opaque; what is asserted is that they are this read's and not the last
     // one's.
     const api = fakeApi();
-    const { container } = render(<WbsTable projectId="p1" api={api} />);
+    const { container } = render(
+      <WbsTable projectId="p1" projectServices={projectServicesOf(api)} />,
+    );
     const sliceCount = () =>
       container.querySelector('[data-slice-count]')?.getAttribute('data-slice-count');

@@ -565,7 +570,7 @@ describe('the WBS table', () => {
     // the hidden ones carry headers and hints of their own.
     showEveryColumn();
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     typeName('010', 'Strip');
@@ -618,7 +623,7 @@ describe('the WBS table', () => {

   itDom('backspace at the start of the name outdents the row', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     pressNewItem('010');
@@ -641,7 +646,7 @@ describe('the WBS table', () => {

   itDom('backspace anywhere else, or over a selection, stays a backspace', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     pressNewItem('010');
@@ -672,7 +677,7 @@ describe('the WBS table', () => {

   itDom('backspace in an empty root row removes it and puts the focus above', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     pressNewItem('010');
@@ -692,7 +697,7 @@ describe('the WBS table', () => {

   itDom('a nested empty row outdents on backspace, and is not removed', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     pressNewItem('010');
@@ -719,7 +724,7 @@ describe('the WBS table', () => {

   itDom('anything the item holds vetoes the backspace removal', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     // 010 gets its child first, so the numbering of everything after is settled.
@@ -787,7 +792,7 @@ describe('the WBS table', () => {
     // not happened — so the note is still there for everyone else, and a
     // keystroke reflex must not take the row it belongs to with it.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     const name = await screen.findByLabelText<HTMLInputElement>('Name of 010');
     fireEvent.change(name, { target: { value: '\nmeasure twice' } });
@@ -815,7 +820,7 @@ describe('the WBS table', () => {

   itDom('tab inside the text walks to the next cell instead of indenting', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     pressNewItem('010');
@@ -848,7 +853,7 @@ describe('the WBS table', () => {

   itDom('shift-tab inside the text walks backwards instead of outdenting', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     pressNewItem('010');
@@ -881,7 +886,7 @@ describe('the WBS table', () => {

   itDom('tab over a selection navigates rather than indenting', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     pressNewItem('010');
@@ -914,7 +919,7 @@ describe('the WBS table', () => {

   itDom('backspace at the start of a root row moves nothing', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');

@@ -933,7 +938,7 @@ describe('the WBS table', () => {

   itDom('shows a parent estimate cell as read-only and a leaf as editable', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     click('Add work item');
     await screen.findByLabelText('Name of 010');
@@ -953,7 +958,7 @@ describe('the WBS table', () => {

   itDom('locks a frozen row and offers to unfreeze it', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     click('Add work item');
     await screen.findByLabelText('Name of 010');
@@ -971,7 +976,7 @@ describe('the WBS table', () => {
 describe('the plan on a calendar', () => {
   async function oneRow() {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     return api;
@@ -1142,7 +1147,7 @@ describe('the plan on a calendar', () => {
       name: 'Parent',
     });
     await api.createWorkItem('p1', { parentId: parent.id, afterId: null, name: 'Child' });
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByLabelText('Name of 010');

     const cell = rowFor('010').querySelector<HTMLElement>('td[data-column="start"]');
@@ -1193,7 +1198,7 @@ describe('the plan on a calendar', () => {
     vi.useFakeTimers({ shouldAdvanceTime: true });
     vi.setSystemTime(new Date('2026-09-15T00:00:00Z'));
     try {
-      render(<WbsTable projectId="p1" api={api} />);
+      render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
       await screen.findByLabelText('Name of 020');

       // The whole title through the real call site, day and sentence, spelled out
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-toolbar.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-toolbar.test.tsx
index dc3666b1..e00ab750 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-toolbar.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-toolbar.test.tsx
@@ -3,6 +3,7 @@ import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
+import { projectServicesOf } from '@/testing/project-services-of';

 import type * as TableFrameModule from './table-frame';
 import { WbsTable } from './wbs-table';
@@ -111,7 +112,7 @@ async function threeRoots() {
   // Dev's columns take part in the keyboard grid below, so they are open.

   const api = fakeApi();
-  render(<WbsTable projectId="p1" api={api} />);
+  render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
   // Named, not left blank. Blank names made an ordering assertion compare three
   // empty strings against three empty strings, which passes for any order.
   for (const [number, name] of [
@@ -151,7 +152,7 @@ describe('the plan toolbar’s controls', () => {
     // the menu, this failed on `expected [ 'Freeze #', 'Unfreeze all' ] to
     // deeply equal [ 'Freeze #' ]`. Watched, 2026-08-29.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByRole('button', { name: 'Add work item' });

     expect(toolbarControlNames().filter((name) => /freeze/i.test(name))).toEqual(['Freeze #']);
@@ -183,7 +184,7 @@ describe('the plan toolbar’s controls', () => {
       asked.push('unfreeze-all');
       return Promise.resolve();
     };
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     await screen.findByRole('button', { name: 'Add work item' });

     takeFreezeAction('Freeze numbering');
@@ -265,7 +266,7 @@ describe('the plan toolbar’s controls', () => {
         scheduleError: 'calendar_range' as const,
         slices: [],
       }));
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);

     const arrange = await screen.findByRole('button', { name: 'Arrange by schedule' });

@@ -322,7 +323,7 @@ describe('the plan toolbar’s controls', () => {
     // with nothing typed`. Two more in `plan-cards.test.tsx`. Watched,
     // 2026-08-29.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     const collapse = await screen.findByRole('button', { name: 'Collapse all' });
     const expand = screen.getByRole('button', { name: 'Expand all' });

@@ -349,7 +350,7 @@ describe('the plan toolbar’s controls', () => {
     // Proof: `⌨` put back as the button's child beside the icon, this failed on
     // `expected '⌨' to be ''`. Watched, 2026-08-29.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     const control = await screen.findByRole('button', { name: 'Keyboard shortcuts' });

     expect(control.textContent).toBe('');
@@ -434,7 +435,13 @@ describe('sharing the plan', () => {
   /** One named, estimated row, so an export has something to disagree about. */
   const onePlannedRow = async (): Promise<ReturnType<typeof fakeApi>> => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} projectName="Rewire the shed" />);
+    render(
+      <WbsTable
+        projectId="p1"
+        projectServices={projectServicesOf(api)}
+        projectName="Rewire the shed"
+      />,
+    );
     click('Add work item');
     await screen.findByLabelText('Name of 010');
     typeName('010', 'Strip, sand & paint');
@@ -454,7 +461,13 @@ describe('sharing the plan', () => {
     // `<details>` hide its children, so what is asserted is where they live:
     // inside the menu, in this order, and nowhere else on the toolbar.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} projectName="Rewire the shed" />);
+    render(
+      <WbsTable
+        projectId="p1"
+        projectServices={projectServicesOf(api)}
+        projectName="Rewire the shed"
+      />,
+    );
     expect(await screen.findByRole('button', { name: 'Copy as Markdown' })).toBeInTheDocument();
     const menu = document.querySelector<HTMLElement>('[data-toolbar] details[data-export]');
     if (menu === null) throw new Error('no Export menu on the toolbar');
@@ -483,7 +496,7 @@ describe('sharing the plan', () => {
     render(
       <WbsTable
         projectId="p1"
-        api={api}
+        projectServices={projectServicesOf(api)}
         projectName="Rewire the shed"
         planImport={{ busy: true, chooseFile: vi.fn() }}
       />,
@@ -524,7 +537,13 @@ describe('sharing the plan', () => {
       ],
     } as unknown as Awaited<ReturnType<typeof model.exportPlan>>;
     const api = { ...model, exportPlan: () => Promise.resolve(exported) };
-    render(<WbsTable projectId="p1" api={api} projectName="Rewire the shed" />);
+    render(
+      <WbsTable
+        projectId="p1"
+        projectServices={projectServicesOf(api)}
+        projectName="Rewire the shed"
+      />,
+    );
     await screen.findByLabelText('Name of 010');

     click('Collapse all');
@@ -575,7 +594,13 @@ describe('sharing the plan', () => {
       ...model,
       exportPlan: () => Promise.reject(new Error('network unavailable exact')),
     };
-    render(<WbsTable projectId="p1" api={api} projectName="Rewire the shed" />);
+    render(
+      <WbsTable
+        projectId="p1"
+        projectServices={projectServicesOf(api)}
+        projectName="Rewire the shed"
+      />,
+    );
     await screen.findByRole('button', { name: 'Download JSON' });

     click('Download JSON');
@@ -592,7 +617,13 @@ describe('sharing the plan', () => {
     // already proved; the name stays on the control for a reader who cannot see
     // the glyph and for the tests that click it by name.
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} projectName="Rewire the shed" />);
+    render(
+      <WbsTable
+        projectId="p1"
+        projectServices={projectServicesOf(api)}
+        projectName="Rewire the shed"
+      />,
+    );
     const undo = await screen.findByRole('button', { name: 'Undo' });
     const redo = screen.getByRole('button', { name: 'Redo' });
     expect(undo.textContent).toBe('↶');
@@ -726,7 +757,13 @@ describe('sharing the plan', () => {
       name: 'Deadline row',
     });
     await api.patchWorkItem(row.id, { deadline: '2026-09-30' });
-    render(<WbsTable projectId="p1" api={api} projectName="Rewire the shed" />);
+    render(
+      <WbsTable
+        projectId="p1"
+        projectServices={projectServicesOf(api)}
+        projectName="Rewire the shed"
+      />,
+    );
     await screen.findByLabelText('Name of 010');

     click('Download CSV');
@@ -805,7 +842,13 @@ describe('sharing the plan', () => {

     itDom('offers the three lanes inside the Export menu, and opens on outline', async () => {
       const api = fakeApi();
-      render(<WbsTable projectId="p1" api={api} projectName="Rewire the shed" />);
+      render(
+        <WbsTable
+          projectId="p1"
+          projectServices={projectServicesOf(api)}
+          projectName="Rewire the shed"
+        />,
+      );
       // Proof: reading synchronously while the initial tree was still loading
       // failed here with `Unable to find a label with the text of: Mermaid lanes`.
       // Export becomes available only after the successful tree read it exports.
@@ -972,7 +1015,7 @@ describe('the project’s settings behind one control', () => {
    */
   itDom('one control opens every project setting, and no separate control remains', async () => {
     const api = fakeApi();
-    render(<WbsTable projectId="p1" api={api} />);
+    render(<WbsTable projectId="p1" projectServices={projectServicesOf(api)} />);
     click('Add work item');
     await screen.findByLabelText('Name of 010');

diff --git a/apps/wbs/fe-01/src/testing/project-services-of.ts b/apps/wbs/fe-01/src/testing/project-services-of.ts
new file mode 100644
index 00000000..aaa9a43e
--- /dev/null
+++ b/apps/wbs/fe-01/src/testing/project-services-of.ts
@@ -0,0 +1,24 @@
+import type { ProjectApi } from '@/lib/wbs-api';
+import { projectServicesOver } from '@/modules/project/composition';
+import type { ProjectServices } from '@/modules/project/contract';
+
+const composed = new WeakMap<ProjectApi, ProjectServices>();
+
+/**
+ * The table's services over a suite's fake client, composed once per client.
+ *
+ * What `ProjectPage`'s memo gives the table, for a suite that draws the table
+ * on its own: the same client always yields the same services, so a rerender
+ * with the client it already had keeps its reader, and a new client — the
+ * suites' way of saying "another API" — is a new reader. Composing afresh on
+ * every render instead would make every rerender a new reader and reopen the
+ * feed. A cache rather than a component, so the table under test is the
+ * table, with nothing drawn around it.
+ */
+export function projectServicesOf(client: ProjectApi): ProjectServices {
+  const known = composed.get(client);
+  if (known !== undefined) return known;
+  const services = projectServicesOver(client);
+  composed.set(client, services);
+  return services;
+}
```

### 7.9 `use-plan-read.ts` (`WbsTableProps`), `wbs-table.tsx` and `project-page.tsx` — slice 3

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index fe5d9931..d99f6b3e 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -19,6 +19,7 @@ import type { Recalled } from '@/lib/remembered';
 import { cn } from '@/lib/utils';
 import { httpProjectApi, type ProjectApi, type ProjectListEntry } from '@/lib/wbs-api';
 import { createPresence } from '@/modules/plan-feed/presence-store';
+import { projectServicesOver } from '@/modules/project/composition';
 import {
   type ApplicationServicesState,
   useApplicationServicesReader,
@@ -479,6 +480,14 @@ export function ProjectPage({
   streamDeps,
 }: ProjectPageProps) {
   const api = useMemo(() => apiOverride ?? httpProjectApi(token), [apiOverride, token]);
+  /**
+   * The table's services over that one client, composed once per client.
+   *
+   * The memo is load-bearing: the table treats a new composition as a new
+   * reader, so composing on every render would close and reopen its feed — and
+   * its socket — on every keystroke in the picker.
+   */
+  const projectServices = useMemo(() => projectServicesOver(api), [api]);
   /**
    * The shelf's wiring, memoised — and the memo is load-bearing rather than
    * tidy.
@@ -1223,7 +1232,7 @@ export function ProjectPage({
               // list rather than held twice: a rename lands in `projects` and the
               // next export says the new name.
               projectName={selectedProject?.name}
-              api={api}
+              projectServices={projectServices}
               planImport={planImport}
               // Proof: omitting this page-owned API left the remounted table's
               // toast list empty after a successful import. Observed 2026-09-14.
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index b721f011..ba9f6d27 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -19,7 +19,6 @@ import {
   type EstimateRoundingView,
   type PertWeightsView,
   type PlanOptimizationView,
-  type ProjectApi,
   type SliceView,
   type StepView,
 } from '@/lib/wbs-api';
@@ -50,7 +49,15 @@ import { toTree, type TreeRow } from './wbs-rows';

 export interface WbsTableProps {
   projectId: string;
-  api: ProjectApi;
+  /**
+   * The project's feed, marker gestures and commands, composed by the page over
+   * its one client — never the client itself (rule K2).
+   *
+   * Its identity is the client's: the page composes once per client, so the
+   * same services mean the same reader, and a new one is a new reader whose
+   * feed replaces the old one's.
+   */
+  projectServices: ProjectServices;
   /** Page-owned archival import lifecycle; absent in isolated table tests. */
   planImport?: PlanImportControl;
   /** Page-owned production toast lifetime; absent in isolated table tests. */
diff --git a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
index 41cfb77f..9683f6fb 100644
--- a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
@@ -16,7 +16,6 @@ import {
 } from 'react';

 import { Button } from '@/components/ui/button';
-import { projectServicesOver } from '@/modules/project/composition';

 import { type CellCards, createCellCards, useCardOpenOn } from './cell-card-store';
 import type { CellRef } from './cell-navigation';
@@ -615,7 +614,7 @@ export function useToday(): Date {
 export function WbsTable({
   projectId,
   projectName,
-  api,
+  projectServices,
   planImport,
   toastApi: toastApiOverride,
   subscribe,
@@ -623,15 +622,9 @@ export function WbsTable({
 }: WbsTableProps) {
   const today = useToday();
   /**
-   * The project's services over this table's client, composed once per client.
-   *
-   * Everything below receives these and never the client: the feed and the
-   * marker gestures are opened through it by the read hook, and every write
-   * goes through `commands`. Keyed on the client alone, so its identity is the
-   * client's, which is what the read hook's stale-owner guards compare.
+   * This project's commands, bound to it; a new project or new services bind
+   * anew. Everything below writes through these and never sees the client.
    */
-  const projectServices = useMemo(() => projectServicesOver(api), [api]);
-  /** This project's commands, bound to it; a new project or client binds anew. */
   const commands = useMemo(
     () => projectServices.planCommandsFor(projectId),
     [projectServices, projectId],
```

### 7.10 The three module READMEs, `calendar-markers/composition.ts`, the lifetime map and `tasks.md` — slice 3

```diff
diff --git a/apps/wbs/fe-01/src/modules/calendar-markers/README.md b/apps/wbs/fe-01/src/modules/calendar-markers/README.md
index d39968ea..f87c0591 100644
--- a/apps/wbs/fe-01/src/modules/calendar-markers/README.md
+++ b/apps/wbs/fe-01/src/modules/calendar-markers/README.md
@@ -12,7 +12,8 @@ TypeScript and import no React, which is rule F1 of the code organization design
 - `calendar-markers.feature.ts` is the **feature**-service: the markers a reader may put on the
   chart for as long as it owns the chart, which is what a screen asks for and the only thing
   delivery may import (rule K2).
-- `composition.ts` is where the HTTP client and the feature meet. A screen calls it.
+- `composition.ts` is where the feature meets its routes, `CalendarMarkerRoutes`, this module's
+  private repository port. The project composition root calls it; a screen does not.

 ## What the resource owns

@@ -44,9 +45,11 @@ feed's `markers` resource comes out, and every answer a person sees arrives thro

 There is no `module.ts`: DI Bag 0.4.0 is installed but nothing in this application is composed
 through it yet, which is the rollout's lifetimes task, so `composition.ts` is a function, as
-`modules/plan-feed/composition.ts` is. Its one caller today is
-`apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, which hands it the refresh owner the plan
-feed beside it holds; the four chart gestures reach it through `wbs-table.tsx`.
+`modules/plan-feed/composition.ts` is. Its one caller is the project composition root,
+`modules/project/composition.ts`, which hands it the page's one client as its routes. The plan read
+hook, `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, builds the gestures through the
+project's services and hands them the refresh owner the plan feed beside it holds; the four chart
+gestures reach it through `wbs-table.tsx`.

 ## Checks

diff --git a/apps/wbs/fe-01/src/modules/calendar-markers/composition.ts b/apps/wbs/fe-01/src/modules/calendar-markers/composition.ts
index 601e0a08..815124c6 100644
--- a/apps/wbs/fe-01/src/modules/calendar-markers/composition.ts
+++ b/apps/wbs/fe-01/src/modules/calendar-markers/composition.ts
@@ -2,14 +2,15 @@ import { createCalendarMarkers } from './calendar-markers.feature';
 import type { CalendarMarkers, CalendarMarkersHost } from './contract';

 /**
- * The one place that sees the HTTP client and the feature at once.
+ * The one place that sees this module's routes and its feature at once.
  *
  * A composition site, which the taxonomy lets see everything because it
  * installs and supplies and holds no logic. It is here rather than in the
  * screen because rule K2 says delivery imports a feature-service and nothing
- * beneath it — the same line `modules/plan-feed/composition.ts` carries. The
- * project lifetime of the rollout's last Task 6 row takes this over; until then
- * it is one call.
+ * beneath it — the same line `modules/plan-feed/composition.ts` carries. Its
+ * one caller is the project composition root, `modules/project/composition.ts`,
+ * which hands it the routes; the project lifetime of the rollout's last Task 6
+ * row takes both over.
  */
 export function calendarMarkersForReader(host: CalendarMarkersHost): CalendarMarkers {
   return createCalendarMarkers(host);
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/README.md b/apps/wbs/fe-01/src/modules/plan-feed/README.md
index 44e4cfad..f562e8ae 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/README.md
+++ b/apps/wbs/fe-01/src/modules/plan-feed/README.md
@@ -14,7 +14,9 @@ contract in `apps/wbs/fe-01/src/modules/store.ts`, which is rule F2.
 - `plan-feed.feature.ts` is the **feature**-service: the live plan on screen for as long as this
   reader owns it, which is what a screen asks for and the only thing delivery may import (rule
   K2).
-- `composition.ts` is where the refresh owner's factory and the feature meet. A screen calls it.
+- `composition.ts` is where the refresh owner's factory and the feature meet, over the routes the
+  refresh owner reads — `PlanReadRoutes` in `apps/wbs/fe-01/src/lib/plan-refresh.ts`, this
+  module's private repository port. The project composition root calls it; a screen does not.
 - `delivered-plan-store.ts` is the **store** the feed publishes into: every publication folded
   into the one snapshot a screen selects from, with the connection the stream last reported.
 - `presence-store.ts` is the **store** of who else has the project open and whether the socket
@@ -67,9 +69,10 @@ the delivered plan's own notification.

 There is no `module.ts`: DI Bag 0.4.0 is installed but nothing in this application is composed
 through it yet, which is the rollout's lifetimes task, so `composition.ts` is a function, as
-`modules/directory-management/composition.ts` is. Its one caller today is
-`apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, which also wires this feed to the plan writer
-module beside it: the writer compares the owner's identity and sends its rereads back through the
+`modules/directory-management/composition.ts` is. Its one caller is the project composition root,
+`modules/project/composition.ts`, which hands it the page's one client as its routes. The plan read
+hook, `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, opens the feed through the project's
+services and wires it to the plan writer module beside it: the writer compares the owner's identity and sends its rereads back through the
 hook. The same hook builds the delivered plan once per table mount, and `project-page.tsx` builds
 the presence store once per page mount; the project runtime of OpenSpec task 10 builds both
 instead.
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/README.md b/apps/wbs/fe-01/src/modules/plan-writer/README.md
index 701064f2..9d5b3374 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/README.md
+++ b/apps/wbs/fe-01/src/modules/plan-writer/README.md
@@ -32,7 +32,9 @@ work item 040.4.
 The exported types are in `contract.ts`; the service is `plan-writer.feature.ts`; the busy store is
 `busy-store.ts`. There is no
 `module.ts` yet: DI Bag is not installed, so the host builds the service with a plain factory
-call. Its one host today is `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`.
+call. Its one host today is `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`. The requests a
+gesture sends are not this module's: the table's hooks send them through the project's
+`PlanCommands` (`modules/plan-commands/`) inside the gesture this module runs.

 ## Checks

diff --git a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
index 11c66972..6d7d36d6 100644
--- a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
+++ b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
@@ -119,9 +119,12 @@ Existing K2 resolutions that should be retained:
 - `PlanFeed` wraps the plan refresh resource; delivery should subscribe/select through it rather than receive `PlanRefresh`.
 - `CalendarMarkers` is the feature facade for its exclusive private resource.
 - `PlanWriter` is already a feature interface.
+- `PlanCommands` is the delivery facade over the plan commands' private `PlanCommandRoutes`, and `ProjectServices` hands the table the feed, the marker gestures and the commands as factories of feature-services, over ports the project composition root cuts from one client (050.7h, OpenSpec task 9).

 Two gaps must be handled as extraction work, not bypassed by context: project catalog and saved plans currently have no feature facade, while React delivery directly coordinates their resource/API behavior. The broad `ProjectApi` also serves unfinished command extractions. Passing any of those through a new context would preserve the present K2 violation behind a provider.

+Update, observed <observed-date> (050.7h, OpenSpec task 9): the broad `ProjectApi` no longer serves the command extractions or any plan module. `ProjectPage` holds it for the project catalog and the archival import, which are the session's, and hands it to `projectServicesOver` (`apps/wbs/fe-01/src/modules/project/composition.ts`) only; the table, its hooks, its toolbar and its columns receive `ProjectServices` and `PlanCommands`. The command policy itself still lives in the table's hooks — the command services' extraction, each over a narrower port, remains a prerequisite of the final project surface.
+
 ## Replacement and cleanup policy

 Routine consequences already fixed by the accepted design:
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index a9f9ba2d..d810119f 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -88,8 +88,19 @@
       therefore not reset by a project switch, exactly as before — until task 10's
       project runtime builds them; the feed's owner reads and the broad
       `ProjectApi` are tasks 9 and 10's.
-- [ ] 9. The broad project API moves behind the plan and command modules' private
+- [x] 9. The broad project API moves behind the plan and command modules' private
       repository ports.
+      Closed by 050-7-h, observed <observed-date>: each plan module is handed only
+      its own port, cut from the page's one client by the project composition root
+      `apps/wbs/fe-01/src/modules/project/composition.ts` — the plan feed
+      `PlanReadRoutes` (`src/lib/plan-refresh.ts`), the calendar markers
+      `CalendarMarkerRoutes`, and the new `modules/plan-commands` module
+      `PlanCommandRoutes`. The table receives `ProjectServices`, which builds the
+      feed, the marker gestures and the project-bound `PlanCommands`, and its hooks,
+      toolbar and columns receive `PlanCommands`; none of them sees `ProjectApi`.
+      The page keeps the client for the project catalog and the archival import,
+      which are not plan modules. When each service is opened and closed, and the
+      feed's owner reads, stay task 10's.
 - [ ] 10. The project runtime owns feed, writer, markers and saved plans for one
       selected project, replacing the per-effect ownership under `WbsTable`.
 - [ ] 11. Project switch, route unmount and Strict Mode re-entry each replace all
```

## 8. Proofs

Every fault below was injected for real in the planner's rehearsal on 2026-09-24, on the final
rehearsal commit (the files each fault touches are the same bytes there as on the slice that owns
it): its named test watched failing, the file restored and compared, the test rerun green, before the
next fault. The executor repeats each one and writes the adjacent `Proof:` comment **only after
observing its own failure**, dated with its own observed date (`date -u +%F`) — never 2026-09-24,
never before the observation. Each slice runs **all** of its faults first and writes its comments
afterwards, so every fault patch below still applies.

**Where the comments may go.** A comment is written only into a file no later slice's patch touches:
`use-plan-read.ts` and `wbs-table.tsx` are patched again in slice 3, so their faults (`t1`, `t2`) are
slice 3's; `use-plan-dependencies.ts` (`d1`) is final after slice 2, and the two slice-1 modules
(`p1`–`p5`, `k1`–`k4`) after slice 1.

**Each slice's faults are records of four lines** — id, file (from the repository root), suite (from
`apps/wbs/fe-01`) and the exact `-t` pattern — in the first `text` block of that slice's subsection.
Vitest's `-t` is a regular expression; no title below holds a metacharacter, and the typographic
apostrophes in three of them match themselves. Extract the records from this document rather than
retyping them, so the titles keep those apostrophes byte for byte:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-h-project-api-ports.md
section=8.1 # this slice's subsection: 8.1 for slice 1, 8.2 for slice 2, 8.3 for slice 3
test -f "$packet"
awk -v want="### $section " '
  index($0, want) == 1 { s=1; next }
  s && /^```text$/ { c=1; next }
  c && /^```$/ { exit }
  c { print }
' "$packet" > "$TMPDIR/proofs.txt"
test -s "$TMPDIR/proofs.txt"
test $(( $(wc -l < "$TMPDIR/proofs.txt") % 4 )) -eq 0
wc -l < "$TMPDIR/proofs.txt"
````

Expected: 36 lines for slice 1, 4 for slice 2 and 12 for slice 3.

**First, prove every filter selects exactly one test**, before injecting anything:

```sh
set -euo pipefail
cd apps/wbs/fe-01
while IFS= read -r id && IFS= read -r file && IFS= read -r suite && IFS= read -r title; do
  out=$(TZ=UTC bunx vitest run "$suite" -t "$title" --reporter=verbose 2>&1 < /dev/null)
  # grep -c prints 0 and exits 1 when nothing matched; any other status is an error.
  if n=$(grep -cE '^ +✓ ' <<< "$out"); then :; else rc=$?; test "$rc" -eq 1; fi
  printf '%s %s matched | %s\n' "$id" "$n" "$title"
  test "$n" -eq 1
done < "$TMPDIR/proofs.txt"
```

Expected: one line per fault, each reading `<id> 1 matched`. A `0` is a stop, not a licence to guess
another filter. (`$file` is read and unused here; the next block uses it.)

**Then every fault, in order**, with the README's patch form — save the passing bytes, inject, write
the patch, run the named test, restore, compare, and only then assert; then rerun it green:

```sh
set -euo pipefail
while IFS= read -r id && IFS= read -r file && IFS= read -r suite && IFS= read -r title; do
  test -f "$file"
  cp "$file" "$TMPDIR/$id.passing"
  git apply --check "$TMPDIR/mutations/$id.diff" < /dev/null
  git apply "$TMPDIR/mutations/$id.diff" < /dev/null
  if diff -u "$TMPDIR/$id.passing" "$file" > "$TMPDIR/evidence/$id.patch"
  then echo "$id: nothing was injected" >&2; exit 1; else test $? -eq 1; fi
  if (cd apps/wbs/fe-01 && TZ=UTC bunx vitest run "$suite" -t "$title") \
    > "$TMPDIR/evidence/$id.log" 2>&1 < /dev/null
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/$id.log"
  cp "$TMPDIR/$id.passing" "$file"
  cmp "$file" "$TMPDIR/$id.passing"
  test "$status" -eq 1
  if (cd apps/wbs/fe-01 && TZ=UTC bunx vitest run "$suite" -t "$title") \
    > "$TMPDIR/evidence/$id.green.log" 2>&1 < /dev/null
  then status=0; else status=$?; fi
  test "$status" -eq 0
  printf '%s | %s\n' "$id" "$(grep -E '^ +Tests ' "$TMPDIR/evidence/$id.log")"
done < "$TMPDIR/proofs.txt"
```

Expected: one line per fault with the `Tests …` line its table gives, and exit 0. The loop stops at
the first fault whose named test passes (`test "$status" -eq 1`), **after** that file has been
restored and compared — then preamble rule 20 applies: re-read the table, redo that fault once by
hand, and stop if it still passes. Every command inside reads `/dev/null`, so nothing it runs can
consume the records the loop is reading. Extra failing tests are recorded, not a stop.

**The comment** names the injected fault and the observed failure, as a `//` line comment directly
above the line the table names, for example:

```ts
// Proof: on <observed date>, sending `freezeProject` to `unfreezeProject` here failed `sends every
// project command to the project it was bound to, with the rest as given` on the route received.
```

Two faults that share a site share one comment block, one sentence each (`p1` and `p3`). Where an
existing `Proof:` comment sits at the site, the new sentence is added below it as its own `// Proof:`
line and the existing lines are not edited; none of this packet's thirteen sites has one.

### 8.1 Slice 1 — the commands (`modules/plan-commands/plan-commands.feature.ts`) and the composition root (`modules/project/composition.ts`)

The records for `$TMPDIR/proofs.txt`:

```text
p1
apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
src/modules/plan-commands/plan-commands.feature.test.ts
sends every project command to the project it was bound to, with the rest as given
p2
apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
src/modules/plan-commands/plan-commands.feature.test.ts
passes every work-item command through unchanged, leaving out what the caller left out
p3
apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
src/modules/plan-commands/plan-commands.feature.test.ts
reaches each route when it is called, not when the commands were built
p4
apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
src/modules/plan-commands/plan-commands.feature.test.ts
sends every project command to the project it was bound to, with the rest as given
p5
apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
src/modules/plan-commands/plan-commands.feature.test.ts
passes every work-item command through unchanged, leaving out what the caller left out
k1
apps/wbs/fe-01/src/modules/project/composition.ts
src/modules/project/composition.test.ts
binds each project’s commands to that project, over the same client
k2
apps/wbs/fe-01/src/modules/project/composition.ts
src/modules/project/composition.test.ts
reaches the client at the moment of each call, not when it was composed
k3
apps/wbs/fe-01/src/modules/project/composition.ts
src/modules/project/composition.test.ts
reads the reader’s project through the one client, and nothing before it is asked
k4
apps/wbs/fe-01/src/modules/project/composition.ts
src/modules/project/composition.test.ts
writes the reader’s calendar markers through the one client
```

Every fault fails its named test, exit 1. Observed, as rehearsed:

| Id   | Fault                                                                 | Suite › test                                                                                                               | Observed (`Tests` line, and the fact)                                                                                                                             | Comment above                                                                           |
| ---- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `p1` | `freezeProject` sent to the `unfreezeProject` route                   | `plan-commands.feature.test.ts` › `sends every project command to the project it was bound to, with the rest as given`     | `1 failed \| 2 skipped (3)`; `expected [ [ 'undo', 'p1' ], …(17) ] to strictly equal […]`, whose diff has `- "freezeProject"` / `+ "unfreezeProject"`             | `freezeProject: (...rest) => routes.freezeProject(projectId, ...rest),`                 |
| `p2` | a work-item route handed the project in place of the work item        | `plan-commands.feature.test.ts` › `passes every work-item command through unchanged, leaving out what the caller left out` | `1 failed \| 2 skipped (3)`; `expected [ …(16) ] to strictly equal [ …(16) ]`, diff `- "w1"` / `+ "p1"`                                                           | `patchWorkItem: (...args) => routes.patchWorkItem(...args),`                            |
| `p3` | the route bound when the commands are built                           | `plan-commands.feature.test.ts` › `reaches each route when it is called, not when the commands were built`                 | `1 failed \| 2 skipped (3)`; `expected [ 'patch:w1' ] to deeply equal [ 'freeze:p1', 'patch:w1' ]` — the replaced route never heard the call                      | `freezeProject: (...rest) => routes.freezeProject(projectId, ...rest),` (with `p1`)     |
| `p4` | the route's promise wrapped in another                                | `plan-commands.feature.test.ts` › `sends every project command to the project it was bound to, with the rest as given`     | `1 failed \| 2 skipped (3)`; `exportPlan: expected Promise{…} to be Promise{…}`                                                                                   | `exportPlan: (...rest) => routes.exportPlan(projectId, ...rest),`                       |
| `p5` | `setStatus` passes its optional `factStart` even when it was left out | `plan-commands.feature.test.ts` › `passes every work-item command through unchanged, leaving out what the caller left out` | `1 failed \| 2 skipped (3)`; `expected [ …(16) ] to strictly equal [ …(16) ]`, diff `+ undefined,`                                                                | `setStatus: (...args) => routes.setStatus(...args),`                                    |
| `k1` | the first project's commands handed out for every project             | `composition.test.ts` › `binds each project’s commands to that project, over the same client`                              | `1 failed \| 3 skipped (4)`; `expected [ 'p1', 'p1' ] to deeply equal [ 'p1', 'p2' ]`                                                                             | `planCommandsFor: (projectId) => createPlanCommands({ projectId, routes: client }),`    |
| `k2` | the ports cut as a copy of the client taken when composed             | `composition.test.ts` › `reaches the client at the moment of each call, not when it was composed`                          | `1 failed \| 3 skipped (4)`; `expected [] to deeply equal [ 'tree:p1', 'arrange:p1' ]`                                                                            | `return {` in `projectServicesOver`                                                     |
| `k3` | the feed read through a second client                                 | `composition.test.ts` › `reads the reader’s project through the one client, and nothing before it is asked`                | `1 failed \| 3 skipped (4)`; `expected null not to be null` — no tree ever arrived (the wait gives up after a second)                                             | `planFeedFor: (reader) => planFeedForReader({ ...reader, routes: client }),`            |
| `k4` | the marker gestures written through a second client                   | `composition.test.ts` › `writes the reader’s calendar markers through the one client`                                      | `1 failed \| 3 skipped (4)`; `Error: refused: WbsRequestError: Failed to parse URL from /api/projects/p1/calendar-markers` — the second client's request, refused | `calendarMarkersFor: (reader) => calendarMarkersForReader({ ...reader, api: client }),` |

#### Proof p1 — `freezeProject` sent to the `unfreezeProject` route

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
index c75040c3..bbf186dd 100644
--- a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
@@ -27,7 +27,7 @@ export function createPlanCommands({ projectId, routes }: PlanCommandPorts): Pla
     removeStep: (...rest) => routes.removeStep(projectId, ...rest),
     createWorkItem: (...rest) => routes.createWorkItem(projectId, ...rest),
     arrangeBySchedule: (...rest) => routes.arrangeBySchedule(projectId, ...rest),
-    freezeProject: (...rest) => routes.freezeProject(projectId, ...rest),
+    freezeProject: (...rest) => routes.unfreezeProject(projectId, ...rest),
     unfreezeProject: (...rest) => routes.unfreezeProject(projectId, ...rest),
     patchWorkItem: (...args) => routes.patchWorkItem(...args),
     setStatus: (...args) => routes.setStatus(...args),
```

#### Proof p2 — a work-item route handed the project in place of the work item

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
index c75040c3..66039cdf 100644
--- a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
@@ -29,7 +29,7 @@ export function createPlanCommands({ projectId, routes }: PlanCommandPorts): Pla
     arrangeBySchedule: (...rest) => routes.arrangeBySchedule(projectId, ...rest),
     freezeProject: (...rest) => routes.freezeProject(projectId, ...rest),
     unfreezeProject: (...rest) => routes.unfreezeProject(projectId, ...rest),
-    patchWorkItem: (...args) => routes.patchWorkItem(...args),
+    patchWorkItem: (...args) => routes.patchWorkItem(projectId, args[1]),
     setStatus: (...args) => routes.setStatus(...args),
     assignPerson: (...args) => routes.assignPerson(...args),
     moveWorkItem: (...args) => routes.moveWorkItem(...args),
```

#### Proof p3 — the route bound when the commands are built

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
index c75040c3..9132ceab 100644
--- a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
@@ -27,7 +27,7 @@ export function createPlanCommands({ projectId, routes }: PlanCommandPorts): Pla
     removeStep: (...rest) => routes.removeStep(projectId, ...rest),
     createWorkItem: (...rest) => routes.createWorkItem(projectId, ...rest),
     arrangeBySchedule: (...rest) => routes.arrangeBySchedule(projectId, ...rest),
-    freezeProject: (...rest) => routes.freezeProject(projectId, ...rest),
+    freezeProject: routes.freezeProject.bind(routes, projectId),
     unfreezeProject: (...rest) => routes.unfreezeProject(projectId, ...rest),
     patchWorkItem: (...args) => routes.patchWorkItem(...args),
     setStatus: (...args) => routes.setStatus(...args),
```

#### Proof p4 — the route's promise wrapped in another

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
index c75040c3..49de9587 100644
--- a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
@@ -13,7 +13,7 @@ export function createPlanCommands({ projectId, routes }: PlanCommandPorts): Pla
   return {
     undo: (...rest) => routes.undo(projectId, ...rest),
     redo: (...rest) => routes.redo(projectId, ...rest),
-    exportPlan: (...rest) => routes.exportPlan(projectId, ...rest),
+    exportPlan: (...rest) => routes.exportPlan(projectId, ...rest).then((plan) => plan),
     setEstimateMethod: (...rest) => routes.setEstimateMethod(projectId, ...rest),
     setEstimateArithmetic: (...rest) => routes.setEstimateArithmetic(projectId, ...rest),
     setDepReach: (...rest) => routes.setDepReach(projectId, ...rest),
```

#### Proof p5 — `setStatus` passes its optional `factStart` even when it was left out

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
index c75040c3..6d9e64f9 100644
--- a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
@@ -30,7 +30,7 @@ export function createPlanCommands({ projectId, routes }: PlanCommandPorts): Pla
     freezeProject: (...rest) => routes.freezeProject(projectId, ...rest),
     unfreezeProject: (...rest) => routes.unfreezeProject(projectId, ...rest),
     patchWorkItem: (...args) => routes.patchWorkItem(...args),
-    setStatus: (...args) => routes.setStatus(...args),
+    setStatus: (id, status, on, factStart) => routes.setStatus(id, status, on, factStart),
     assignPerson: (...args) => routes.assignPerson(...args),
     moveWorkItem: (...args) => routes.moveWorkItem(...args),
     duplicateWorkItem: (...args) => routes.duplicateWorkItem(...args),
```

#### Proof k1 — the first project's commands handed out for every project

```diff
diff --git a/apps/wbs/fe-01/src/modules/project/composition.ts b/apps/wbs/fe-01/src/modules/project/composition.ts
index 7df8ed7a..dfae5e9d 100644
--- a/apps/wbs/fe-01/src/modules/project/composition.ts
+++ b/apps/wbs/fe-01/src/modules/project/composition.ts
@@ -22,9 +22,10 @@ import type { ProjectServices } from './contract';
  * page calls it once per client.
  */
 export function projectServicesOver(client: ProjectApi): ProjectServices {
+  let first: ReturnType<typeof createPlanCommands> | null = null;
   return {
     planFeedFor: (reader) => planFeedForReader({ ...reader, routes: client }),
     calendarMarkersFor: (reader) => calendarMarkersForReader({ ...reader, api: client }),
-    planCommandsFor: (projectId) => createPlanCommands({ projectId, routes: client }),
+    planCommandsFor: (projectId) => (first ??= createPlanCommands({ projectId, routes: client })),
   };
 }
```

#### Proof k2 — the ports cut as a copy of the client taken when composed

```diff
diff --git a/apps/wbs/fe-01/src/modules/project/composition.ts b/apps/wbs/fe-01/src/modules/project/composition.ts
index 7df8ed7a..b800297a 100644
--- a/apps/wbs/fe-01/src/modules/project/composition.ts
+++ b/apps/wbs/fe-01/src/modules/project/composition.ts
@@ -22,9 +22,10 @@ import type { ProjectServices } from './contract';
  * page calls it once per client.
  */
 export function projectServicesOver(client: ProjectApi): ProjectServices {
+  const routes = { ...client };
   return {
-    planFeedFor: (reader) => planFeedForReader({ ...reader, routes: client }),
-    calendarMarkersFor: (reader) => calendarMarkersForReader({ ...reader, api: client }),
-    planCommandsFor: (projectId) => createPlanCommands({ projectId, routes: client }),
+    planFeedFor: (reader) => planFeedForReader({ ...reader, routes }),
+    calendarMarkersFor: (reader) => calendarMarkersForReader({ ...reader, api: routes }),
+    planCommandsFor: (projectId) => createPlanCommands({ projectId, routes }),
   };
 }
```

#### Proof k3 — the feed read through a second client

```diff
diff --git a/apps/wbs/fe-01/src/modules/project/composition.ts b/apps/wbs/fe-01/src/modules/project/composition.ts
index 7df8ed7a..56c977ea 100644
--- a/apps/wbs/fe-01/src/modules/project/composition.ts
+++ b/apps/wbs/fe-01/src/modules/project/composition.ts
@@ -1,4 +1,4 @@
-import type { ProjectApi } from '@/lib/wbs-api';
+import { httpProjectApi, type ProjectApi } from '@/lib/wbs-api';
 import { calendarMarkersForReader } from '@/modules/calendar-markers/composition';
 import { createPlanCommands } from '@/modules/plan-commands/plan-commands.feature';
 import { planFeedForReader } from '@/modules/plan-feed/composition';
@@ -23,7 +23,7 @@ import type { ProjectServices } from './contract';
  */
 export function projectServicesOver(client: ProjectApi): ProjectServices {
   return {
-    planFeedFor: (reader) => planFeedForReader({ ...reader, routes: client }),
+    planFeedFor: (reader) => planFeedForReader({ ...reader, routes: httpProjectApi('') }),
     calendarMarkersFor: (reader) => calendarMarkersForReader({ ...reader, api: client }),
     planCommandsFor: (projectId) => createPlanCommands({ projectId, routes: client }),
   };
```

#### Proof k4 — the marker gestures written through a second client

```diff
diff --git a/apps/wbs/fe-01/src/modules/project/composition.ts b/apps/wbs/fe-01/src/modules/project/composition.ts
index 7df8ed7a..8d8f354e 100644
--- a/apps/wbs/fe-01/src/modules/project/composition.ts
+++ b/apps/wbs/fe-01/src/modules/project/composition.ts
@@ -1,4 +1,4 @@
-import type { ProjectApi } from '@/lib/wbs-api';
+import { httpProjectApi, type ProjectApi } from '@/lib/wbs-api';
 import { calendarMarkersForReader } from '@/modules/calendar-markers/composition';
 import { createPlanCommands } from '@/modules/plan-commands/plan-commands.feature';
 import { planFeedForReader } from '@/modules/plan-feed/composition';
@@ -24,7 +24,8 @@ import type { ProjectServices } from './contract';
 export function projectServicesOver(client: ProjectApi): ProjectServices {
   return {
     planFeedFor: (reader) => planFeedForReader({ ...reader, routes: client }),
-    calendarMarkersFor: (reader) => calendarMarkersForReader({ ...reader, api: client }),
+    calendarMarkersFor: (reader) =>
+      calendarMarkersForReader({ ...reader, api: httpProjectApi('') }),
     planCommandsFor: (projectId) => createPlanCommands({ projectId, routes: client }),
   };
 }
```

### 8.2 Slice 2 — the typed dependency list's guard (`components/wbs/use-plan-dependencies.ts`)

The records for `$TMPDIR/proofs.txt`:

```text
d1
apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts
src/components/wbs/plan-read-and-write.test.tsx
keeps an old dependency-list refusal out of its busy API replacement
```

| Id   | Fault                                                     | Suite › test                                                                                            | Observed (`Tests` line, and the fact)                                                                                                                | Comment above                                                             |
| ---- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `d1` | the list's answer counted as current whoever holds it now | `plan-read-and-write.test.tsx` › `keeps an old dependency-list refusal out of its busy API replacement` | `1 failed \| 87 skipped (88)`; `expect(element).toHaveAttribute("aria-busy", "true")` — the old client's answer lowered the replacement's busy state | `const isCurrent = () => activeCommands.current === owner;` in `dependOn` |

#### Proof d1 — the list's answer counted as current whoever holds it now

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts
index b34365e3..011bbaac 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts
@@ -122,7 +122,7 @@ export function usePlanDependencies({
       // every answer before choosing its aggregate recovery scope.
       void (async () => {
         const owner = commands;
-        const isCurrent = () => activeCommands.current === owner;
+        const isCurrent = () => true;
         busy.raise();
         const refused: string[] = [];
         let ambiguous = false;
```

### 8.3 Slice 3 — the table's commands and guard, and the page's composition

The records for `$TMPDIR/proofs.txt`:

```text
t1
apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
src/components/wbs/plan-table.test.tsx
keeps an add burst and its refetch inside the project where it started
t2
apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
src/components/wbs/plan-read-and-write.test.tsx
does not spend an old API success against its busy replacement
q1
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
recovers a persistent resume_ack without replacing the registered socket
```

| Id   | Fault                                                                | Suite › test                                                                                         | Observed (`Tests` line, and the fact)                                                                                                                          | Comment above                                                                                 |
| ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `t1` | the table's commands not rebound when its project changes            | `plan-table.test.tsx` › `keeps an add burst and its refetch inside the project where it started`     | `1 failed \| 46 skipped (47)`; `expected [ 'p1', 'p1' ] to deeply equal [ 'p1', 'p2' ]` — `p2`'s add went to `p1`                                              | `[projectServices, projectId],` in `WbsTable`'s `commands` memo                               |
| `t2` | the writer's reader test compares the project only, not the services | `plan-read-and-write.test.tsx` › `does not spend an old API success against its busy replacement`    | `1 failed \| 87 skipped (88)`; `expected 'false' to be 'true'` — the old client's success cleared the replacement's busy state                                 | the writer memo's `isActiveReader: () =>` (inside `createPlanWriter({`) in `use-plan-read.ts` |
| `q1` | the page composes on every render instead of once per client         | `project-page.test.tsx` › `recovers a persistent resume_ack without replacing the registered socket` | `1 failed \| 72 skipped (73)`; `expected 3 to be 2` — a third tree read: a render of the page composed new services, and the table opened a new feed over them | `const projectServices = useMemo(() => projectServicesOver(api), [api]);` in `ProjectPage`    |

#### Proof t1 — the table's commands not rebound when its project changes

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
index 9683f6fb..c8947f98 100644
--- a/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
@@ -627,7 +627,7 @@ export function WbsTable({
    */
   const commands = useMemo(
     () => projectServices.planCommandsFor(projectId),
-    [projectServices, projectId],
+    [projectServices],
   );
   const {
     plan,
```

#### Proof t2 — the writer's reader test compares the project only, not the services

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
index ba9f6d27..8b5be2b7 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
@@ -706,8 +706,7 @@ export function usePlanRead({
     () =>
       createPlanWriter({
         readRefreshOwner: () => feedRef.current?.owner ?? null,
-        isActiveReader: () =>
-          activeProject.current === projectId && activeServices.current === projectServices,
+        isActiveReader: () => activeProject.current === projectId,
         rereadResources: refreshResourcesOrMarkStale,
         busy: busyWrites,
         commandsIssued,
```

#### Proof q1 — the page composes on every render instead of once per client

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index d99f6b3e..f1be933d 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -487,7 +487,7 @@ export function ProjectPage({
    * reader, so composing on every render would close and reopen its feed — and
    * its socket — on every keystroke in the picker.
    */
-  const projectServices = useMemo(() => projectServicesOver(api), [api]);
+  const projectServices = projectServicesOver(api);
   /**
    * The shelf's wiring, memoised — and the memo is load-bearing rather than
    * tidy.
```

## 9. Verification

### 9.1 Every fenced diff applies, extracted from this document, in slice order

The requirement is not "these diffs were once correct" but "these diffs and the one script, as this
committed document spells them, apply in slice order, and every fault patch applies to what they
produce" — on the rehearsal base, **and** on that base with every comment site packet g's executor
writes into the files this packet patches already filled. The script below proves both; it was run
after the final Prettier `--check` of this document. `fill=1` inserts a two-line `// Proof:` comment
above each of those sites, anchored on the line packet g's section 8 names: in `use-plan-read.ts` its
`s5`, `s3`, `s1`, `s2`, `t3`, `t1`, `t2` and `m1`, in `plan-feed/composition.ts` its `f1` and `s4`, and
in `project-page.tsx` its `q1` and `q2` — twelve sites, twenty-four lines.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-h-project-api-ports.md
base=c79ec665995485dda82c9a5f517f5dd0ea483520
# Inserts a two-line comment above the first line whose trimmed text is exactly $2.
fill_above() {
  file=$1
  anchor=$2
  test -f "$file"
  awk -v a="$anchor" '
    { t = $0; sub(/^ +/, "", t) }
    !done && t == a {
      match($0, /^ */); ind = substr($0, 1, RLENGTH)
      print ind "// Proof: simulated, standing where packet g writes one; the words are"
      print ind "// not knowable from here."
      done = 1
    }
    { print }
  ' "$file" > "$file.filled"
  mv "$file.filled" "$file"
}
for fill in 0 1; do
  work=$(mktemp -d "${TMPDIR:?}/extract-XXXXXX")
  mkdir -p "$work/patches" "$work/mutations" "$work/tree"
  awk -v out="$work/patches" '
    /^## 7\. The code$/ { inside=1; next }
    /^## 8\. Proofs$/   { inside=0 }
    inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print >> f }
  ' "$packet"
  count=$(find "$work/patches" -name '*.diff' | wc -l)
  echo "fill=$fill extracted=$count"
  test "$count" -eq 9
  awk '
    /^## 7\. The code$/ { inside=1; next }
    /^## 8\. Proofs$/   { inside=0 }
    inside && /^```ts$/ { capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print }
  ' "$packet" > "$work/markers-memo.ts"
  awk -v out="$work/mutations" '
    /^## 8\. Proofs$/ { inside=1; next }
    /^## 9\. Verification$/ { inside=0 }
    inside && /^#### Proof / { id=$3; next }
    inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print >> f }
  ' "$packet"
  count=$(find "$work/mutations" -name '*.diff' | wc -l)
  echo "fill=$fill fault-patches=$count"
  test "$count" -eq 13
  # A real repository holding exactly the base tree, so --check has something to check against.
  git archive "$base" | tar -x -C "$work/tree"
  if [ "$fill" -eq 1 ]; then
    read_hook=apps/wbs/fe-01/src/components/wbs/use-plan-read.ts
    feed=apps/wbs/fe-01/src/modules/plan-feed/composition.ts
    page=apps/wbs/fe-01/src/components/wbs/project-page.tsx
    (
      cd "$work/tree"
      fill_above "$read_hook" "() => (treeFailure === null ? null : refusalSentence(treeFailure.cause)),"
      fill_above "$read_hook" "treeReadProject.current = projectId;"
      fill_above "$read_hook" "rowPlacements.current = placements;"
      fill_above "$read_hook" "if (next.steps !== previous.steps) settleAgainstSteps(next.steps);"
      fill_above "$read_hook" "pushToast({"
      fill_above "$read_hook" "text: 'sentence' in refusal ? refusal.sentence : refusalSentence(refusal.cause),"
      fill_above "$read_hook" "focusIntent.current.commandIssued();"
      fill_above "$read_hook" "announceRefusal: refusals.publish,"
      fill_above "$feed" "announceRefusal: refusals.publish,"
      fill_above "$feed" "setConnected: plan.reportConnection,"
      fill_above "$page" "onPresence: projectPresence.reportUsers,"
      fill_above "$page" "projectPresence.reportConnection(connected);"
      filled=$(cat "$read_hook" "$feed" "$page" | grep -c 'Proof: simulated')
      echo "fill=1 filled-sites=$filled"
      test "$filled" -eq 12
    )
  fi
  git -C "$work/tree" init -q
  git -C "$work/tree" add -A
  git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
  # --check and apply are SEPARATE commands: joined with && under set -e, a failed
  # check does not stop the shell and a later iteration can still reach the end.
  for n in 01 02 03 04 05; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
  (cd "$work/tree" && bun "$work/markers-memo.ts" apps/wbs/fe-01/src/components/wbs/use-plan-read.ts)
  for n in 06 07 08 09; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
  echo "fill=$fill all 9 applied, the script between 05 and 06"
  for m in "$work"/mutations/*.diff; do
    git -C "$work/tree" apply --check "$m"
  done
  echo "fill=$fill all 13 fault patches check against the result"
  git -C "$work/tree" status --porcelain --untracked-files=all | wc -l
done
````

Observed on 2026-09-24, after the final Prettier `--check`:

```text
fill=0 extracted=9
fill=0 fault-patches=13
markers memo rewritten, 0 comment lines kept
fill=0 all 9 applied, the script between 05 and 06
fill=0 all 13 fault patches check against the result
50
fill=1 extracted=9
fill=1 fault-patches=13
fill=1 filled-sites=12
markers memo rewritten, 2 comment lines kept
fill=1 all 9 applied, the script between 05 and 06
fill=1 all 13 fault patches check against the result
50
```

`git apply --check` prints nothing on success, which is why the script's own `echo` lines are the
evidence and why every count is asserted rather than printed. The last line of each run is the number
of paths the patches and the script change against the base: fifty — every owned path of the three
slices but `verify.md`, which the executor writes. The `fill=0` tree was then compared file by file
with the rehearsal's final commit: all fifty byte-identical (that commit holds the same two
`<observed-date>` placeholders, in `tasks.md` and the lifetime map, that slice 3 step 4 replaces). In
the `fill=1` run the script printed `2 comment lines kept`, the simulated lines survived every patch
in place — the markers memo reads `isActiveReader`, the two kept lines, then `announceRefusal` — and
the fault patches still check.

**Replayed on the real packet g tree.** The round-1 reviewer reran this script with
`base=03f81a6f` — packet g's real lane merged, its real `Proof:` comments at all twelve sites: all
nine patches applied in order, the script printed `markers memo rewritten, 3 comment lines kept`, all
thirteen fault patches checked clean, fifty paths; so the `fill=1` simulation's caveat (section 9.5)
is discharged for that tree. The planner still reruns it on the dispatch base itself.

**A failed check stops the run**: the same form is packet g's section 9.1, where the `&&` variant was
rehearsed printing its success line after `error: patch failed` and exiting 0, and the two-line form
exiting 1 before any success line.

Every **intermediate** tree typechecks: `wbs-fe-01:typecheck` exit 0 on each of the three rehearsal
commits, before it was made, and each was committed with the hooks on. Exactly two trees do not: the
red checkpoints of slices 1 and 3, each after that slice's contract and test patches and before its
implementation (section 6 gives each one's diagnostics). A red is rebuilt only from the previous
slice's tree plus that slice's test patch, never by reverse-applying patches on a later tree.

### 9.2 The strict OpenSpec block, reproduced

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
report=$(mktemp "$TMPDIR/evidence/openspec-validation.XXXXXX.json")
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

Expected: one JSON report, exit 0. `failed` that is `false` rather than `0` is refused by
`type == "number"`. The report stays under `$TMPDIR/evidence`; the command guard rejects `rm -f`.
Rehearsed on the base and after every slice: `{"items":114,"passed":114,"failed":0}` each time — the
new requirement and its three scenarios live in a document that already counted as one item.

### 9.3 Commands actually run, and what each reported

All on 2026-09-24, by this packet's author, on a rehearsal branch cut at `c79ec665` where each slice
was laid down from exactly the files these patches produce and then committed **with the hooks on**
(lefthook passed for all three commits), not inside an executor sandbox: `1dc96558` (slice 1),
`c668a636` (slice 2) and `3d620a6b` (slice 3), on the throwaway branch `rehearse/050-7-h`. Each red was rebuilt from
the previous slice's commit plus that slice's contract and test patches only; each fault was injected
into the final commit, whose bytes in every faulted file equal the owning slice's.

| Check                                  | Base `c79ec665` | Slice 1                         | Slice 2        | Slice 3                        |
| -------------------------------------- | --------------- | ------------------------------- | -------------- | ------------------------------ |
| sandbox node suite (files·tests)       | 49·680          | 51·687                          | 51·687         | 51·687                         |
| preferences suite                      | 4·39            | 4·39                            | 4·39           | 4·39                           |
| zoned (Auckland)                       | 2·3             | 2·3                             | 2·3            | 2·3                            |
| feed set (slice 1's `s1-*-feed`)       | 8·58            | 10·65                           | 10·65          | 10·65                          |
| adopted set, serial                    | 20·1215         | —                               | 20·1215        | 20·1215                        |
| red typecheck                          | —               | exit 1, 47 errors in 4 files    | none by design | exit 1, 256 errors in 17 files |
| red Vitest                             | —               | `Tests 14 failed (14)`, 3 files | none by design | `Tests 5 failed (5)`, 1 file   |
| typecheck on the slice's commit        | 0               | 0                               | 0              | 0                              |
| faults observed failing, file restored | —               | 9 of 9                          | 1 of 1         | 3 of 3                         |
| strict OpenSpec                        | 114 · 114 · 0   | 114 · 114 · 0                   | 114 · 114 · 0  | 114 · 114 · 0                  |

(`49·680` is 49 files, 680 tests.) Every proof filter was run on the final tree first and matched
exactly one test — thirteen faults over eleven distinct titles — and the thirteen faults were then run
through section 8's own loop, extracted from this document, each `status=1` with its table's `Tests`
line, each restore `cmp`-identical, each green rerun `status=0`, the working tree clean afterwards.

**The four guards section 3.8 carries.** Each services comparison removed in turn — the feed's
`isActiveReader`, `refreshResourcesOrMarkStale`'s guard, `stepStack`'s `isCurrent`, and the markers'
`isActiveReader` — and the twenty adopted files run serially against each of the first three (the
fourth against `plan-chart-seam.test.tsx` and `gantt-panel.test.tsx`, the two suites that drive the
markers): `Tests 1215 passed (1215)` three times and `265 passed (265)` once. Not proved; recorded.

On the final commit: `git grep -lE "type ProjectApi\b|: ProjectApi\b" -- apps/wbs/fe-01/src/components
':!*.test.ts' ':!*.test.tsx'` lists `project-page.tsx` and `use-plan-import.ts` only (ten files on the
base); `wbs-fe-01:lint` exit 0; `nx format:check --all` exit 0; `wbs-fe-01:build` exit 0 (`✓ built in 885ms`); `tool-devsync:test` 366 pass, 0 fail; `wbs-fe-01:test:unit` 53 files, 710 tests and `wbs-fe-01:test` UTC 140 files, 3054 tests, zoned 2 · 3 — against the base's 51·703 and 138·3047, each exit 0 (section 9.4).

### 9.4 Planner-only, with the expected relative delta

The sandbox cannot run these: three tests in two files spawn `bun` from Node, there is no browser, a
build writes outside the attempt's lane, and devsync writes Git objects.

| Check                                                                                                                                                                                            | Expected, relative to the base                                                                                                                                  | Planner's own rehearsal                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit`                                                                                                    | slice 1 **+ 2 files, + 7 tests**; slices 2 and 3 unchanged                                                                                                      | base 51 files, 703 tests; final commit 53 files, 710 tests; exit 0 both                                       |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test`                                                                                                         | UTC: slice 1 **+ 2 files, + 7 tests**; slices 2 and 3 unchanged. Auckland zoned unchanged                                                                       | base UTC 138 files, 3047 tests, zoned 2 · 3; final commit UTC 140 files, 3054 tests, zoned 2 · 3; exit 0 both |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                    | exit 0 after each slice                                                                                                                                         | exit 0 on the final commit, `✓ built in 885ms`                                                                |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, with the slice committed or staged                                                                   | unchanged; no project target, no module index block; the two new module READMEs are swept as current documents, which pins coverage and no count                | 366 pass, 0 fail, exit 0 on the final commit, the slices committed                                            |
| `CI=1 E2E_PORT_SHIFT=<a multiple of 300 clear of every live run, checked with ss -ltn> NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run wbs-fe-01:e2e -- <spec>` | exit 0, unchanged, after slices 2 and 3 — every spec that edits a plan, since every write now goes through `PlanCommands`; slice 1 wires nothing a browser sees | **Pending planner verification.** Not run in this rehearsal.                                                  |
| the same target **unfiltered**, on its own shift, on the final integration commit                                                                                                                | exit 0. The batch README's "Integration verification" requires the whole frontend browser suite once a frontend change lands                                    | **Pending planner verification.** Not run, not waived.                                                        |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                       | exit 0 on the shared build host                                                                                                                                 | **Not run**; reported as pending, never as passed.                                                            |

`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is not decoration: `CLAUDECODE=1` changes Bun's test
output and fails thirteen unrelated tests in this repository.

### 9.5 What none of this proves

- No browser ran. The Chromium checks are the planner's and are pending, not waived.
- Four of the table's guards changed operand without a test that can reach their window (section
  3.8); the rehearsal shows no existing test notices their removal.
- The composition root narrows by type only; nothing at run time stops a module that casts its port
  back to the client (task 13's checks).
- The `fill=1` run proves the patches survive comments **at** packet g's twelve named sites; it cannot
  prove anything about a comment g's executor wrote somewhere else, or about a Prettier re-wrap of a
  line this packet uses as context. The planner's rerun of section 9.1 on the real base is what
  proves that.
- The table suites reach the composition through a test cache, not through the page; only the two
  page suites exercise the page's memo.

## 10. Stop conditions

Each is false on the real starting tree, checked on 2026-09-24.

1. Step 0a's status is not empty, or `base` differs from the slice note's SHA. Stop: the clone is not
   the tree this packet was reviewed against.
2. Step 0b extracts other than 9 patches, a `markers-memo.ts` of other than 27 lines, or other
   than 13 fault patches. Stop: this document is not the one reviewed.
3. A patch fails `git apply --check`, or section 7.6's script prints anything but its one line or
   exits non-zero. Stop and report the exact error; never hand-edit a file into shape.
4. A baseline (step 0c or a slice's step 1) exits non-zero. Stop, except for the known cases in 11.
5. A red checkpoint shows **no** failure, or different diagnostics than section 6 names. Either means
   the tests did not land as written.
6. An adopted-set green run differs from its step-1 number by anything at all, in slice 2 or 3. Stop:
   a "behaviour-neutral" move changed behaviour.
7. A proof filter matches zero tests, or more than one. Stop.
8. A fault leaves its named test passing. Restore, re-read the table, redo once; if it still passes,
   stop — the check may not be where this packet says it is.
9. The strict OpenSpec block exits non-zero, or `passed` falls below step 0's number.
10. Slice 3's client-holder check lists anything but its two paths. Stop: delivery still reaches the
    client somewhere.
11. **Known, not this packet's:** in `claims.db.test.ts`, the test
    `bounds terminal lock contention and retries until a held write commits` failing; a single
    `Test timed out in 5000ms` in one of the twenty
    adopted files during a serial run on a loaded host; or a `DiBagCloseCancelledError`
    (`DI_BAG_CLOSE_TIMEOUT`) from the `live-application` fixture's own `afterEach` retirement. Record
    it, rerun **that file alone once**, and stop only if it fails again.
12. At hand-over, the status shows any path outside the slice's own list. Stop.
13. Anything asks for a `git` state change in the clone, a network call, a browser, or `--no-verify`.

## 11. Out of lane

- Packet g's files and what it fixed: `modules/channel.ts`, `plan-writer/busy-store.ts`,
  `plan-feed/delivered-plan-store.ts`, `plan-feed/presence-store.ts`, their model tests,
  `use-channel-listener.ts`, `use-snapshot-changes.ts`, the store-and-port members of
  `PlanFeedForReader` (`plan`, `refusals`) and `PlanWriterHost` (`busy`, `commandsIssued`,
  `refusals`), packet g's rows of `vitest.node-suites.ts`, and its requirement in `spec.md`.
  `use-plan-read.ts` and `plan-feed/composition.ts` are edited here only where section 7 says, and
  every `Proof:` comment packet g wrote in them is left as it is — the reason section 7.6 is a script.
- `modules/plan-feed/{contract,plan-feed.feature,plan-feed.resource}.ts`,
  `modules/calendar-markers/{contract,calendar-markers.feature,calendar-markers.resource}.ts`,
  `modules/plan-writer/*.ts`, `modules/directory*/*`, `modules/preferences/*`: untouched.
- `lib/wbs-api.ts`, `lib/project-stream.ts`, `use-plan-import.ts`, `app-router.tsx`, `runtime/*`,
  `src/testing/*` but the one new file: read only.
- Every existing test file except the three of slice 1's named edit and the seventeen of slice 3's.
- `project.json`, `vitest.config.ts`, `vitest.node.config.ts`, `vitest.zoned.config.ts`, `bun.lock`,
  `package.json`: untouched. No dependency is added, removed or bumped.

## 12. Hand-over to the next packet

- **Task 10 (the project runtime)** builds, per selected project, what the table builds per reader
  today — the feed (`projectServices.planFeedFor`), the marker gestures
  (`projectServices.calendarMarkersFor`), the writer (`createPlanWriter`), the commands
  (`projectServices.planCommandsFor`) and packet g's stores and channels — over the ports
  `projectServicesOver` cuts, and publishes the features through the project context. What it
  inherits:
  - `ProjectServices` is the seam: a DI Bag project module can register the three factories' results
    instead of the factories, and `WbsTable` then receives instances rather than `projectServices`.
    Its identity rule (one composition per client) becomes "one runtime per selected project within
    one session generation".
  - The five `activeServices.current === projectServices` guards in `use-plan-read.ts` and the
    `activeCommands` guard in `use-plan-dependencies.ts` are where "the reader is still current"
    lives until the runtime's withdrawal replaces them; four of them are unproved (section 3.8) and
    its task 11 test should open their window.
  - `readRefreshOwner` and `isActiveReader` remain closures over the table's refs; `PlanFeed.owner`
    is still exposed for the writer's identity check and the markers' invalidation.
  - The catalog (`listProjects`, `createProject`, `openProject`, `renameProject`) and the import
    (`importPlan`) are the session's and still reach `ProjectApi` directly in `ProjectPage`; the
    lifetime map lists them as the project-catalog prerequisite.
- **The command services** (the design's eight rows) each take a slice of `PlanCommandRoutes` as their
  own port and replace the matching `PlanCommands` members in the hooks; `PlanCommands` shrinks as
  they land.
- **Task 13's architecture checks** can now state the rule by **symbol identity**: no module under
  `components/` but the page and its import resolves a reference to the `ProjectApi` symbol, whatever
  spelling reaches it (`Pick<ProjectApi, …>`, `ProjectApi[…]`, a namespace import). Slice 3's `git grep`
  is a regex verification command for this packet, not that rule (batch-6 addendum point 18).

## 13. Assumptions recorded rather than asked

1. **One `plan-commands` module, not the design's eight.** Splitting the thirty-four routes into the
   design table's eight command features is the command extraction, and it moves gesture policy,
   which task 9 does not ask for. One module with one port and one project-bound feature is the
   smallest K2-clean surface that takes the client out of the hooks.
2. **Ports are `Pick<ProjectApi, …>`**, as `CalendarMarkerRoutes` already is, rather than hand-written
   interfaces or runtime wrapper objects: one source of truth for every route's contract (R3), and the
   client satisfies each port without an adapter. Runtime narrowing would add objects that forward
   and nothing a cast-free codebase can observe.
3. **The project is bound in `PlanCommands`**, because it is the one decision the module can own
   today, and it is what lets a hook stop naming the project in a write. Work-item routes, which name
   no project, pass through with their arity preserved.
4. **The dependency list's guard now compares the commands**, which change with the project as well
   as the client; before, it compared the client alone. The two differ only when one table mount is
   handed another project and the same client — which production never does (`key={selected}`
   remounts the table) — and there the new guard is the stricter, consistent with every other guard
   in the table. The adopted set is unchanged.
5. **The composition root is a module directory (`modules/project/`)** named after the lifetime whose
   runtime will replace it, with a README like its neighbours'; it is not a feature or a resource and
   carries no kind suffix.
6. **The suites compose through a per-client `WeakMap` cache** rather than through a wrapper component
   (which would put a component of the suites' own between every suite and the table it asserts on) or through `projectServicesOver`
   directly (which would make every rerender a new reader). The prop edit is mechanical and each suite
   keeps its own `WbsTable` import.
7. **Section 7.6 is a script** because packet g's slice-5 comment sits between two lines this packet
   must change; every other hunk was checked against g's twelve comment sites (section 9.1, `fill=1`).
8. **Serial runs for the multi-file suites** (`--no-file-parallelism --maxWorkers=1`), as the
   project's own `test` target runs them.

## 14. The brief, point by point

### 14.1 The non-negotiables of the commissioning brief

| Requirement                                                                                                                         | Where this packet meets it                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| measure every `api.` call by method and group by owning module                                                                      | §3.1: 54 methods, every call site on the base, five owners                                                                                                |
| narrow port interfaces, R2 names, no `any`                                                                                          | §3.2: `PlanReadRoutes`, `CalendarMarkerRoutes`, `PlanCommandRoutes`; `PlanCommands` derived by a mapped type; no `any`, `!` or cast in production code    |
| composition root supplies the ports from the one client; `WbsTable` and the hooks receive only feature/store interfaces             | §3.4, §3.5; slice 3's client-holder check (§6)                                                                                                            |
| `AuthenticatedUser` / identity handling unchanged                                                                                   | untouched: the page's token and its `httpProjectApi(token)` memo are unchanged (§4.1)                                                                     |
| test-first with real reds; every fake-`ProjectApi` fixture edit named; no assertion weakened                                        | §6 slices 1 and 3 (47 and 256 compiler errors, 14 and 5 failing tests); the two named edits (§6 slice 1 step 3, slice 3 step 3); `expect` lines untouched |
| stale-owner, refusal, busy, focus cited by title                                                                                    | §3.7                                                                                                                                                      |
| a model test for any port with lifecycle or interleaving, otherwise examples with independent mutations and exact `-t` filters      | §3.4 says why none of these ports has one; 13 faults over 11 distinct titles, each filter checked to match one test (§8, §9.3)                            |
| 3–5 slices, one attempt each, planner commit each; frontend serially; whole tiers, build, Chromium, devsync planner-only            | §6, §9.4                                                                                                                                                  |
| task 9 ticked with a dated note; `verify.md` per slice; the K2 note updated                                                         | §7.10 (`tasks.md`, the lifetime map's K2 note and resolution list), slice 3 step 4; §6 "Verification record entries"                                      |
| every fenced diff extracted and applied in slice order, separate check and apply under `set -e`, counts asserted, output pasted     | §9.1, on the base and on a copy with packet g's comment sites filled                                                                                      |
| intermediate trees typecheck; reds rebuilt from base + slice prefix                                                                 | §9.1 last paragraph; §6 red checkpoints                                                                                                                   |
| fresh counts, relative baselines, empty status at step 0, owned-path hand-over                                                      | §6 step 0a–0c; every expectation is "step 0's number ± the slice's own"; §6 hand-over lists                                                               |
| real `sh`, `set -euo pipefail`, conditional status capture, durable wrappers, escaped pipes in table code spans                     | §6 `run-check.sh`, `expect-status.sh`; §8 procedure; every `\|` inside a table cell escaped                                                               |
| proof filters exact and checked; no `Proof:` in listings; executor dates by observation; no private absolute paths but the launcher | §8; §7's diffs add no `Proof:`; slice 3 step 4 and §8's opening; the Dispatch block is the only one                                                       |
| teardown and slots                                                                                                                  | N/A: no slot, no owner and no retirement is introduced; the composition test closes every feed it opens                                                   |

### 14.2 The batch-6 addendum's twenty points

| Point                       | Assessment                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reproduced red           | Met for slices 1 and 3: compiler and runtime reds rebuilt from the previous slice + its test patch, diagnostics pasted (§6). Slice 2 has none by design and says so; its teeth are `d1`. |
| 2. Typecheck and lint       | Met: both native per slice, exit 0 on each rehearsed commit, every slice committed with lefthook on (§9.3).                                                                              |
| 3. Path counts              | Met: each hand-over lists the slice's exact paths; the planner's own commits add only this document.                                                                                     |
| 4. Failure-visible commands | Met: every check records its own status and `expect-status.sh` asserts it.                                                                                                               |
| 5. HEAD-reading tests       | N/A: no project, target or CI path is renamed.                                                                                                                                           |
| 6. Sandbox constraints      | Met: whole targets, build, devsync and Chromium are the planner's, with expected deltas (§9.4).                                                                                          |
| 7. Known race               | Met: named, one rerun, no repair authority (§10.11).                                                                                                                                     |
| 8. Names                    | Met: no product name in an identifier; no module id added (no `module.ts`).                                                                                                              |
| 9. Packet form and evidence | Met: three slices, each ending in a planner commit with its exact subject; relative baselines; production-path negatives with observed messages; nothing silently skipped.               |
| 10. Pins                    | Met: no pin touched.                                                                                                                                                                     |
| 11. Pipeline exit handling  | Met: the fault `diff` form after one command; the filter count, the placeholder check and the client-holder check read single commands or captured output.                               |
| 12. Planner chaining        | Met: the extraction stops at the first failed check (§9.1).                                                                                                                              |
| 13. Module index            | N/A with reason: no `fe-01` module carries a `module-index` block (§4.1); devsync on the committed slices raised no unindexed-path refusal (§9.4).                                       |
| 14. Bun directory filters   | N/A: every suite runs through Vitest from `apps/wbs/fe-01`.                                                                                                                              |
| 15. Interleaving property   | N/A with reason (§3.4): no port here owns a lifecycle, a queue or a retry; the one interleaving touched — a late answer after the client changed — is proved by examples or recorded.    |
| 16. Model-based remedy      | N/A for the same reason; no review round has found a race here.                                                                                                                          |
| 17. Seeded evidence         | N/A: no slice reads an earlier attempt's evidence.                                                                                                                                       |
| 18. Symbol-based checks     | N/A: no code-shape checker is introduced; slice 3's `git grep` is a verification command, not a check the repository keeps, and task 13 owns the symbol-based rule.                      |
| 19. Missing-file grep       | Met: every grep over a file follows a `test -f` or reads captured output.                                                                                                                |
| 20. Honest limits           | Met: §3.8 and §9.5 state the four unproved guards, the type-only narrowing and the limits of the `fill=1` rehearsal.                                                                     |

## 15. Ready to commit

| Slice | Paths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Subject                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1     | `spec.md`, `verify.md`, `apps/wbs/fe-01/vitest.node-suites.ts`, `apps/wbs/fe-01/src/lib/{plan-refresh.ts,plan-refresh.test.ts,plan-refresh-stream.test.ts}`, `apps/wbs/fe-01/src/modules/plan-feed/composition.ts`, `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts` — **8 modified**; `apps/wbs/fe-01/src/modules/plan-commands/{contract.ts,plan-commands.feature.ts,plan-commands.feature.test.ts,README.md}`, `apps/wbs/fe-01/src/modules/project/{contract.ts,composition.ts,composition.test.ts,README.md}` — **8 new** | `feat(frontend): put the plan feed and the plan commands behind their own ports`                    |
| 2     | `spec.md`, `verify.md`, `apps/wbs/fe-01/src/components/wbs/{use-plan-read.ts,wbs-table.tsx,use-plan-structure.ts,use-plan-fields.ts,use-estimate-drafts.ts,use-reference-sets.ts,use-plan-dependencies.ts,plan-toolbar.tsx,plan-live.ts,plan-columns/actions.tsx,plan-columns/depends.tsx}` — **13 modified**                                                                                                                                                                                                                     | `refactor(frontend): hand the table's hooks the project's commands instead of the client`           |
| 3     | `spec.md`, `verify.md`, `tasks.md`, `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, `apps/wbs/fe-01/src/components/wbs/{use-plan-read.ts,wbs-table.tsx,project-page.tsx}`, `apps/wbs/fe-01/src/modules/{plan-feed,calendar-markers,plan-writer}/README.md`, `apps/wbs/fe-01/src/modules/calendar-markers/composition.ts`, the seventeen suites of §6 slice 3 — **28 modified**; `apps/wbs/fe-01/src/testing/project-services-of.ts` — **1 new**                                                       | `refactor(frontend): hand the table the project's services, composed by the page, and close task 9` |

(`spec.md`, `verify.md` and `tasks.md` are under `openspec/changes/adopt-frontend-lifetimes/`.) After the
last commit the host gate runs on the shared build host with the committed hash, and its printed
running-hash line and exit status are recorded. Anywhere else it is reported as not run, with the
reason — never as passed. The Chromium runs of §9.4 are reported the same way until they have happened.
