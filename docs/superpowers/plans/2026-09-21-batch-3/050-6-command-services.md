# 050.6 Extract the frontend command services: the calendar markers first

|                                               |                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item                                     | 050.6 "Extract the frontend command services, one at a time"                                                                                                                                      |
| Size class                                    | M                                                                                                                                                                                                 |
| Planning tokens (top model, high effort)      | 4,000,000                                                                                                                                                                                         |
| Implementation tokens (mid model, mid effort) | 12,000,000                                                                                                                                                                                        |
| Review tokens (top model, high effort)        | 6,000,000                                                                                                                                                                                         |
| Design it serves                              | [Code organization design](../../specs/2026-09-19-code-organization-design.md), its frontend services table, rules F1, K2, K3, K4, K6                                                             |
| Architectural authority                       | `openspec/changes/service-taxonomy/specs/service-taxonomy/spec.md`, and the Twilight Bureaucrat rule registry at `apps/wiki/cli/src/rules/registry.ts`                                            |
| Predecessors, merged                          | 040.3 plan writer, 040.6 directory and preferences, 040.4 plan feed — `apps/wbs/fe-01/src/modules/{plan-writer,directory,directory-management,preferences,plan-feed}` all exist                   |
| Execution contract                            | [batch 1 README](../2026-09-19-batch-1/README.md): "Execution contract", "Rules for every executor", "Standard blocks every packet uses", "Hidden constraints every frontend packet must respect" |
| Planning head                                 | `da8be091` (batch-3/planning)                                                                                                                                                                     |

## 1. Goal and non-goals

**Goal.** Take the first of the plan page's command services out of `components/wbs/`: the four
calendar-marker writes and the write-runner policy around them become one module with the two kinds
the taxonomy requires — a resource-service that owns the routes and the knowledge of what a marker
edit dirties, and a feature-service that owns whose write it is and what happens to a refusal —
built by a composition site the plan read hook calls.

**Non-goals.** No behaviour change of any kind; an extraction that seems to need one is a stop
condition. No move of `stepStack`, of `refreshOrMarkStale`, of the plan feed, of the plan writer or
of anything under `plan-toolbar.tsx`: section 12 assigns those to later packets by name. No read of
the marker list here — it is the plan feed's `markers` resource and stays there. No DI Bag module:
DI Bag 0.4.0 is installed at the root, and composing these services through it is the rollout's
lifetimes task; until then `composition.ts` is a function, exactly as
`modules/plan-feed/composition.ts` is. No new Twilight Bureaucrat rule, no rule policy committed,
and no edit to `docs/code-organization/kinds.json` (section 4.6 says why none is owed).

## 2. Why the calendar markers go first

Thirteen files under `apps/wbs/fe-01/src/components/wbs/` still write through a client directly
(section 4.1 inventories every one); section 12 divides them into nine lanes. The markers go first
for four measured reasons.

1. **The narrowest seam.** The whole lane is one helper and four thin call sites: `runMarkerWrite`
   at `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts:689`, handed out at
   `use-plan-read.ts:795`, and its four consumers at `wbs-table.tsx:1694`, `:1702`, `:1710` and
   `:1718`. Nothing
   else in the repository calls `createCalendarMarker`, `renameCalendarMarker`,
   `recolorCalendarMarker` or `deleteCalendarMarker` outside tests.
2. **The best oracle that already exists.** `plan-chart-seam.test.tsx:848`'s
   `describe('the calendar markers the host owns')` drives the real table through all four
   gestures, the peer event and the refusal, in eight cases; `gantt-panel.test.tsx` adds five
   day-sheet and composer describes over the same props. Both were run before and after the
   rehearsed rewire and did not move (section 4.7).
3. **It answers the finding batch 1 left open.** The batch 1 README records that the design "lists
   the plan's command services as feature-services that call the HTTP client directly, which rule
   K3 forbids", and leaves the answer "for the command services' own Plan step". This is that step:
   the answer is a resource-service that owns the writes and the dirtied-resource knowledge, with
   the feature above it — and it generalizes to all five lanes that follow.
4. **No vocabulary of its own.** A marker refusal travels as its cause and the sentence stays in
   delivery, which is the plan feed's discipline rather than the plan writer's. Undo and redo, the
   other small lane, carry three sentences of their own and would drag the Notices question in.

## 3. Read first

| Read                                                                                      | Why                                                                                    |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                                               | Rules R1 to R5. R5 governs every `Proof:` comment this packet writes.                  |
| `LLM_README.md`                                                                           | R1: the index first, then only the link the task needs.                                |
| [batch 1 README](../2026-09-19-batch-1/README.md)                                         | The execution contract, the standard blocks, the node-tier word list, the K2 decision. |
| [040.4 plan feed packet](../2026-09-20-batch-2/040-4-plan-feed.md)                        | The slice shape this packet copies, and the module beside the one being built.         |
| `apps/wbs/fe-01/src/modules/plan-feed/`                                                   | The house pattern: contract, resource, feature, composition, README.                   |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`                                      | The source of `runMarkerWrite` and the hook's return object.                           |
| `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx`                                         | The four `*GanttMarker` callbacks and the props they feed.                             |
| `apps/wbs/fe-01/src/lib/wbs-api.ts`                                                       | `ProjectApi`'s four marker routes, `CalendarMarkerView`, `NewCalendarMarkerView`.      |
| `apps/wbs/fe-01/src/lib/plan-refresh.ts`                                                  | `PlanRefresh`, `RefreshResource`, and what `invalidate` means.                         |
| `apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx`                              | The oracle. `describe('the calendar markers the host owns')` is this lane's.           |
| `apps/wbs/fe-01/vitest.node-suites.ts`, `vitest.node.config.ts`, `src/test-tiers.test.ts` | How a suite joins the fast node tier — the config's `include` **is** the list.         |

## 4. Verified facts

Everything below was read or run by the planner on 2026-09-20 at `da8be091`. Line numbers are
given for orientation and are **not** edit targets: every anchor is also a symbol name or a quoted
line, because main will be merged before this packet runs.

### 4.1 What still writes through the API client inside `components/wbs/`

Counted with `grep -oE 'api\.[a-zA-Z]+\(' over every non-test file under
`apps/wbs/fe-01/src/components/wbs/`:

| File                       | Calls                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wbs-table.tsx`            | the four marker routes (**this packet**), `arrangeBySchedule`, `removeDependency`, `retryOptimization`, `setOptimizationSettings`, `unfreezeWorkItem`, `exportPlan`                                 |
| `use-plan-read.ts`         | `undo`, `redo`                                                                                                                                                                                      |
| `use-plan-import.ts`       | `importPlan`                                                                                                                                                                                        |
| `plan-toolbar.tsx`         | `addStep`, `renameStep`, `removeStep`, `setDepReach`, `setEstimateArithmetic`, `setOptimizationSettings`, `setPriorityBands`, `setStartDate`, `setTeamCapacity`, `freezeProject`, `unfreezeProject` |
| `use-plan-fields.ts`       | `patchWorkItem`, `setStatus`                                                                                                                                                                        |
| `use-plan-structure.ts`    | `createWorkItem`, `duplicateWorkItem`, `moveWorkItem`, `patchWorkItem`, `removeWorkItem`                                                                                                            |
| `use-estimate-drafts.ts`   | `setEstimate`, `clearEstimate`                                                                                                                                                                      |
| `use-plan-dependencies.ts` | `addDependency`                                                                                                                                                                                     |
| `use-reference-sets.ts`    | `addPerson`, `addService`, `addTag`, `addTeam`, `addWorkItemType`, `assignPerson`, `patchWorkItem`, `setEstimateMethod`                                                                             |
| `plan-columns/actions.tsx` | `unfreezeWorkItem`                                                                                                                                                                                  |
| `plan-columns/depends.tsx` | `removeDependency`                                                                                                                                                                                  |
| `project-page.tsx`         | `listProjects`, `openProject`, `renameProject`                                                                                                                                                      |
| `saved-plans-panel.tsx`    | not `ProjectApi` at all: `httpSavedPlanApi()` from `src/lib/saved-plan-api.ts` (`saved-plans-panel.tsx:44`)                                                                                         |

Section 12 turns this into an ordered list of lanes with file ownership.

### 4.2 The whole of the marker lane, as it stands

`runMarkerWrite` (`use-plan-read.ts:689`) is a `useCallback` over
`[activeProject, api, projectId, pushToast]`. It reads `feedRef.current?.owner ?? null`, returns
when that is null, builds `isCurrent` from the owner's identity **and** the live project and API
refs, awaits the write, announces a refusal through `refusalSentence` when it is still current, and
finally — current or not-thrown — `await owner.invalidate({ resources: ['markers'] })`. It already
carries one `Proof:` comment naming
`rereads a marker refused because a peer already deleted it`.

The four callers at `wbs-table.tsx:1694`, `:1702`, `:1710`, `:1718` each wrap one API call in
`void runMarkerWrite(...)`, each with the dependency array `[api, projectId, runMarkerWrite]`, and
reach the chart as `onCreateMarker`, `onRenameMarker`, `onRecolorMarker` and `onDeleteMarker`
(`wbs-table.tsx:2787`–`:2790`).

**Rename and recolour are two routes and not one**, which is be-01's rule and is argued on
`ProjectApi.renameCalendarMarker` in `apps/wbs/fe-01/src/lib/wbs-api.ts`: a body naming both is
answered 422. The contract in section 5 keeps them as separate arms for that reason.

### 4.3 Identity churn is preserved, and that is what the render-cost test watches

The replacement is a `useMemo` with **the dependency array `runMarkerWrite` carried**, so the
gesture object changes identity on exactly the renders the callback changed on. The four table
callbacks then depend on that one object instead of `[api, projectId, runMarkerWrite]`, which is
the same churn or less, because the memo's dependencies are a superset of `{api, projectId}`.
`plan-row-render-cost.test.tsx` was run before and after and did not move (section 4.7).

### 4.4 Rules F1, K2, K3, K4 and K6, and where each is met

| Rule | Requirement                                                    | Where it is met                                                                                                            |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| F1   | A service file never imports React                             | The four module files import only `@/lib/*` and each other; both suites run under `--environment node`.                    |
| K2   | Delivery imports feature-services only                         | `use-plan-read.ts` imports one name, `calendarMarkersForReader` from `composition.ts`, and neither service implementation. |
| K3   | A feature imports resource-services, never a repository        | `calendar-markers.feature.ts` imports `calendar-markers.resource.ts` and nothing below it.                                 |
| K4   | A resource imports repository ports, never a feature           | `calendar-markers.resource.ts` imports `./contract` only; the four routes arrive as a port.                                |
| K6   | No kind imports a sibling of the same kind from another module | Nothing here imports `plan-feed.feature.ts`: the refresh owner arrives through `readRefreshOwner`, as a port.              |

### 4.5 What `twib check` actually says about the new module

Rehearsed on the staged tree with a rule policy held **outside** the candidate, every rule in
`observe`:

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=<a node_modules outside the clone> \
  bun apps/wiki/cli/src/cli.ts check staged . HEAD <policy>.json --rule <id>
```

- **MOD-LAYOUT**: `allowed: true`, six `debt` findings, one per frontend module —
  `{"path":"apps/wbs/fe-01/src/modules/calendar-markers","message":"module directory declares no wiki index"}`
  and the identical row for `directory`, `directory-management`, `plan-feed`, `plan-writer` and
  `preferences`. The **contract** half of MOD-LAYOUT is satisfied: no "declares no contract"
  finding, because `contract.ts` exists. The index half fails for every one of the six, because
  `moduleLayoutObservations` takes its index set from the **checked index report**, which skips a
  `README.md` carrying no `<!-- module-index … -->` comment
  (`apps/wiki/cli/src/rules/kinds.ts`, the JSDoc on `moduleLayoutObservations`). Packet 040.3
  decided deliberately not to write that comment, because a module identity needs
  `docs/wiki-policy/modules.json`, which is out of lane. **So this packet adds a sixth identical
  debt row and changes no verdict.** Do not add a `module-index` comment to close it.
- **MOD-INDEX**: `allowed: true`, `findings: []`.
- **F7** (size ratchet), measured over `apps/wbs/fe-01/src/modules` at a ceiling of 400:
  `allowed: true`, `findings: []`. The largest new file is 165 lines.
- **K2, K3, K4, K5, K6 and F1 cannot be evaluated over `apps/wbs/fe-01` today.** Every one of them
  returns
  `{"ruleId":"K6","reason":"TypeScript import unresolved: apps/wbs/fe-01/src/main.tsx -> './styles.css'"}`
  and the verdict is therefore `allowed: false`, whatever the module looks like. The refusal is
  `apps/wiki/cli/src/relationships/typescript.ts:349`, reached because `ts.resolveModuleName`
  cannot resolve a CSS specifier and the extractor refuses rather than inventing an external
  target. It is the **program** that is walked, not the entrypoint closure, so narrowing
  `publicEntrypoints` to the module does not avoid it.

  **This is a finding, not a defect of this packet**, and it is recorded here for the rules lane
  (010.7): no kind-direction rule can be enforced on this application until the extractor can
  resolve, or be told to ignore, the frontend's asset imports. Conformance to K2, K3, K4 and K6 is
  therefore established by reading the imports (section 4.4), exactly as 040.4 established its own.

### 4.6 `kinds.json` owes no entry, and this packet does not edit it

`tools/tool-devsync/src/service-kinds.ts:14` limits `SERVICE_ROOTS` to
`libs/wbs/application/core/src/service`, `libs/wbs/application/core/src/use-cases` and
`apps/wbs/be-01/src/service`; `KIND_SUFFIXES` there is `['.feature.ts', '.repository.ts',
'.resource.ts']`, and the test
`a file that declares its kind by suffix owes no policy entry, wherever it lives` is why. The new
files are outside every root **and** declare their kind by suffix, so `docs/code-organization/kinds.json`
gains nothing and loses nothing. Rehearsed: `bun test tools/tool-devsync/src/service-kinds.test.ts`
printed `17 pass`, `0 fail` on the rewired tree.

### 4.7 The extraction was rehearsed whole, and these are the numbers

The planner cut a private worktree from `da8be091`, wrote every file of sections 5 and 6 into it,
rewired the hook and the table exactly as slice 4 prescribes, ran the checks below and every
mutation of section 9, then reverted.

| Check                                                                                         | Observed                                                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                             | Exit 0                                                                          |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                                  | Exit 0, after one `eslint --fix` for import order                               |
| The module's two suites, node tier                                                            | `Test Files 2 passed (2)`, `Tests 13 passed (13)`                               |
| The sandbox unit command, with the module                                                     | `42 passed (42)` files, `614 passed (614)` tests                                |
| `plan-chart-seam.test.tsx` + `plan-read-and-write.test.tsx` + `plan-row-render-cost.test.tsx` | `3 passed (3)`, `116 passed (116)`                                              |
| `gantt-panel.test.tsx`                                                                        | `1 passed (1)`, `242 passed (242)`                                              |
| `bun test tools/tool-devsync/src/service-kinds.test.ts`                                       | `17 pass`, `0 fail`                                                             |
| `CI=1 E2E_PORT_SHIFT=3200 NX_DAEMON=false bunx nx run wbs-fe-01:e2e`, whole target            | **Exit 0**: `377 passed`, `40 skipped`, 19.7 minutes                            |
| A real `git commit` of slices 1, 2, 3 and 4 with lefthook enabled                             | Exit 0 each, once slice 4's destructuring was written in its post-Prettier form |

**Every slice was committed for real, in order, with hooks on** (2026-09-21): slice 1 two files,
slice 2 three files with the sandbox unit command at `41 passed (41)` / `607 passed (607)`, slice 3
four files at `42 passed (42)` / `614 passed (614)`, slice 4 two files. Slice 4's first attempt
exited 1 on lefthook's `format` command; the fix is inside slice 4's own checklist, not in a note.
Those absolute numbers are orientation only: the planner's own baseline before slice 1 was
`40 passed (40)` files and `601 passed (601)` tests, and the executor compares with its own step 0.

Line deltas, from `git diff --numstat`: `use-plan-read.ts` 21 added / 20 removed (864 → 865 lines),
`wbs-table.tsx` 9 added / 9 removed (2889 lines, unchanged), `vitest.node-suites.ts` 2 added.
The absolute test numbers are orientation only; every comparison the executor makes is against its
own step 0.

### 4.8 The two devsync pins, and why this packet moves neither

**The README literal is gone.** `grep -nE '^[[:space:]]*applicationLibraryToolReadmes: [0-9]+,$'`
over `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` prints **nothing** on this baseline:
110.6 landed, and its derived check
`the current-document sweep reaches every application, library and tool README` is at
`repo-namespacing-handoff.test.ts:483`. There is no number to re-pin, and this packet therefore
**does not edit that file at all**. Every earlier draft's "branch A" is withdrawn.

**The legacy-source check did not go with it.**
`every legacy source occurrence and relevant text family is pinned` is still at
`repo-namespacing-handoff.test.ts:553`, with its line-sensitive `digest` and occurrence count.
Both tests were run by name on this baseline: **`1 pass`, `0 fail`** each. A slice that finds
either one reporting `0 tests` has a tree this packet was not written against, and stops.

**Neither hand-moved pin moves.** `workspace-inventory.test.ts:110`–`:111` pin `167` rows over `84`
files, and the digest above pins the legacy-root contexts. This packet adds no Nx target, no
tsconfig path and no legacy-root occurrence. **Measured, not argued:** with the whole rehearsed
extraction staged — seven new files, three edited — the planner ran
`GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache` and saw
**`301 pass`, `0 fail`** across 24 files, exit 0. Both pinned files belong to work item **G2** in
this batch, which derives them; nothing here may edit either.

### 4.9 Targets, tiers and the node-tier word list

`apps/wbs/fe-01/project.json` lists `test`, `test:unit`, `lint`, `lint:fast`, `typecheck`, `build`,
`e2e`, `e2e-packaged`, `serve`, `serve-local-solver`. The `lint` target names `apps/wbs/fe-01/src`
and `tsconfig.app.json` includes `src/**/*.ts`, so new files under `src` are linted and type-checked
with **no project file edit**. This packet adds no Nx target.

`vitest.node.config.ts` sets `include: [...NODE_SUITES]`: a suite absent from
`vitest.node-suites.ts` **cannot be run** by the node tier even by naming it on the command line,
and `src/test-tiers.test.ts` refuses a list that names a missing file or disagrees with the
directory. Each test file and its list entry therefore land in the **same** slice. That guard also
refuses a node-tier suite whose text matches
`/@testing-library|\bdocument\b|\bwindow\b|\blocation\b|WebSocket|localStorage|matchMedia|getComputedStyle|HTMLElement|\bnavigator\b|jsdom/`,
and a node-tier suite must be `.ts`, not `.tsx`. Neither new suite says any of those words.

## 5. Interfaces

Every block in sections 5 and 6 was written into the private worktree, formatted with Prettier,
linted, type-checked and run. The executor transcribes rehearsed code; it drafts nothing.

### 5.1 The module

```text
apps/wbs/fe-01/src/modules/calendar-markers/
  README.md                            wiki index (no module-index comment: section 4.5)
  contract.ts                          the types both kinds and the host exchange
  calendar-markers.resource.ts         the four routes, and what a marker edit dirties
  calendar-markers.feature.ts          whose write it is, and where a refusal goes
  composition.ts                       the one place the HTTP client and the feature meet
  calendar-markers.resource.test.ts    6 tests, node tier
  calendar-markers.feature.test.ts     7 tests, node tier
```

### 5.2 `contract.ts`

This is the complete file, in its post-Prettier form.

```ts
import type { PlanRefresh, RefreshResource } from '@/lib/plan-refresh';
import type { CalendarMarkerView, NewCalendarMarkerView, ProjectApi } from '@/lib/wbs-api';

/**
 * Re-exported so delivery imports this module and no other: rule K2 says a
 * screen sees a feature-service and never the resource-service beneath it. The
 * same line stands in `modules/plan-feed/contract.ts`, for the same rule.
 */
export type { CalendarMarkerView, NewCalendarMarkerView };

/**
 * One edit to a project's calendar markers, as a value rather than a call.
 *
 * A value because the two kinds have to talk about the edit twice — the
 * resource sends it, the feature decides whether its answer still matters — and
 * a closure would let only one of them see what was asked for. Rename and
 * recolour are separate arms and not one `edit(name?, color?)`, because be-01
 * answers 422 to a body naming both; {@link ProjectApi.renameCalendarMarker}
 * argues it on the route.
 */
export type CalendarMarkerEdit =
  | { readonly kind: 'add'; readonly marker: NewCalendarMarkerView }
  | { readonly kind: 'rename'; readonly markerId: string; readonly name: string }
  | { readonly kind: 'recolor'; readonly markerId: string; readonly color: string | null }
  | { readonly kind: 'remove'; readonly markerId: string };

/**
 * The part of the HTTP client this resource writes through.
 *
 * Narrowed to the four routes rather than taken whole, so the module's surface
 * states what it can do to a project: nothing here can rename the project or
 * move a work item.
 */
export type CalendarMarkerRoutes = Pick<
  ProjectApi,
  'createCalendarMarker' | 'renameCalendarMarker' | 'recolorCalendarMarker' | 'deleteCalendarMarker'
>;

/** What the writing needs from whoever built it. */
export interface CalendarMarkerPorts {
  readonly projectId: string;
  readonly api: CalendarMarkerRoutes;
}

/**
 * One project's calendar markers, as this browser writes them.
 *
 * The **resource**-service: one aggregate — the markers of one project — the
 * four routes that change it, and the knowledge of what each change leaves out
 * of date. It owns no lifetime and says nothing to anybody; a refusal leaves it
 * as the thrown cause.
 */
export interface CalendarMarkerWrites {
  /**
   * The plan resources one marker edit leaves out of date, accepted or refused.
   *
   * Refused counts: a rename be-01 rejects because a peer already deleted the
   * marker means the list on screen is wrong, not that nothing happened.
   */
  readonly dirtied: readonly RefreshResource[];
  /** Sends one edit. Throws what be-01 refused, unchanged and unworded. */
  readonly send: (edit: CalendarMarkerEdit) => Promise<void>;
}

/** A refusal this module owes the reader, in the terms its words are built from. */
export interface CalendarMarkerRefusal {
  readonly cause: unknown;
}

/**
 * What the gestures need from whoever is hosting them.
 *
 * Every member is a function for {@link PlanWriterHost}'s reason: all of them
 * are read at the moment something happens, not at the moment the module is
 * built. A reader can leave for another project between a write starting and
 * its answer arriving.
 */
export interface CalendarMarkersHost extends CalendarMarkerPorts {
  /**
   * The refresh owner this reader is currently reading through, or `null`
   * before the first one exists.
   *
   * Its **identity** is what makes a write this reader's: the same object it
   * started against, still installed. {@link PlanFeed.owner} is what answers
   * this today.
   */
  readonly readRefreshOwner: () => PlanRefresh | null;
  /** Whether the screen still holds the project and API this reader opened. */
  readonly isActiveReader: () => boolean;
  /** Announces one refusal to whoever says things to the reader. */
  readonly announceRefusal: (refusal: CalendarMarkerRefusal) => void;
}

/**
 * The calendar markers a reader may put on the chart, for as long as it owns it.
 *
 * The **feature**-service, and the only thing delivery sees: one piece of
 * user-facing value — the dates a person marks on the chart stay the project's,
 * and a refused one leaves the chart showing what is really there — coordinated
 * over one resource-service. It imports no React (F1).
 *
 * Each gesture resolves when its write and the reread that covers it are done,
 * which is what lets a test await one. Today's caller does not: every one of the
 * four call sites in `wbs-table.tsx` is a `void`, because a chart click has
 * nowhere to await.
 */
export interface CalendarMarkers {
  readonly add: (marker: NewCalendarMarkerView) => Promise<void>;
  readonly rename: (markerId: string, name: string) => Promise<void>;
  readonly recolor: (markerId: string, color: string | null) => Promise<void>;
  readonly remove: (markerId: string) => Promise<void>;
}
```

### 5.3 What does not change

`usePlanRead`'s parameter object, `WbsTableProps`, `PlanReadScope`, `refreshOrMarkStale`,
`stepStack`, the plan writer's `useMemo`, `PlanRefresh`, `GanttPanel`'s four marker props, and
every export of `plan-feed/contract.ts`. The hook's return object changes in **one member only**:
`runMarkerWrite` becomes `markers`.

## 6. File plan

| File                                                                            | Action  | Responsibility                                                  |
| ------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------- |
| `apps/wbs/fe-01/src/modules/calendar-markers/README.md`                         | created | Wiki index: the two kinds, what each owns, its checks           |
| `apps/wbs/fe-01/src/modules/calendar-markers/contract.ts`                       | created | The types both kinds and the host exchange                      |
| `apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.resource.ts`      | created | The four routes and the dirtied-resource knowledge              |
| `apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts`       | created | Whose write it is, the refusal, the reread                      |
| `apps/wbs/fe-01/src/modules/calendar-markers/composition.ts`                    | created | The composition site delivery calls                             |
| `apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.resource.test.ts` | created | 6 tests                                                         |
| `apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.test.ts`  | created | 7 tests                                                         |
| `apps/wbs/fe-01/vitest.node-suites.ts`                                          | edited  | Two entries, each in the slice that creates its file            |
| `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`                            | edited  | `runMarkerWrite` becomes the `markers` memo; the return changes |
| `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx`                               | edited  | The destructuring and the four `*GanttMarker` callbacks         |

Ten files. No file outside `apps/wbs/fe-01` is created or edited.

**The other batch 3 lanes, and what each means for this one.** Batch 3 is 040.5, 050.4, 050.6,
G1, G2 and U2. None of them owns a file this packet edits, and two of them move totals this packet
reports.

| Lane                                            | Where it works                                                                              | What this packet owes it                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 040.5 observability serializer and log schema   | `libs/wbs/adapters/observability`, an OpenSpec delta                                        | Nothing. It is **not** a frontend toolbar lane; earlier drafts said so and were wrong.                     |
| 050.4 frontend fault boundary                   | `apps/wbs/fe-01/src` error boundaries, `apps/wbs/fe-01/e2e`, a browser fixture              | No shared file, but it adds frontend tests and at least one Chromium spec, so it moves `wbs-fe-01` totals. |
| G1 h2puni gate installs the locked dependencies | `bin/h2puni-gate*.sh`, `tools/tool-devsync/src/toolchain-pins.test.ts` and `poller.test.ts` | Nothing.                                                                                                   |
| G2 derive the two hand-moved devsync pins       | `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` and `workspace-inventory.test.ts` | **Both pinned files are G2's.** This packet reads them by name and never edits them (section 4.8).         |
| U2 staffed step cell clipping                   | `plan-columns/estimates.tsx`, `apps/wbs/fe-01/e2e/layout.spec.ts`                           | No shared file, but it too moves `wbs-fe-01` totals and the Chromium count.                                |

**Nothing in batch 3 owns `plan-toolbar.tsx` or `use-plan-dependencies.ts`.** They stay untouched
here because lanes 4 to 7 of section 12 own them later, not because another packet is editing them
now.

## 7. Slices

Six slices. Each is dispatched on its own, starts with step 0, ends green, and carries its own
commit subject and path list so the planner can commit it before the next begins.

**How the planner dispatches them.** The launcher lives outside this repository, at
`/home/df/wd/puni/puni-plan/exec/run-executor.sh`, and it is **not** reachable by a
repository-relative path. Its `case` now carries a `batch-3)` arm defaulting to
`docs/superpowers/plans/2026-09-21-batch-3`, so `--batch batch-3` resolves on its own; the explicit
`--batch-dir` below is kept because it states the directory the attempt reads its packet from and
costs nothing if that default ever moves. The first slice:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-6-command-services slice-1 \
  <integration-head-sha> --batch batch-3 \
  --batch-dir docs/superpowers/plans/2026-09-21-batch-3
```

and every slice after it, once the previous one is reviewed and committed:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-6-command-services slice-2 \
  <that-commit-sha> --batch batch-3 \
  --batch-dir docs/superpowers/plans/2026-09-21-batch-3 --resume
```

Four facts about that launcher, re-read from it on 2026-09-21 and each one a way an attempt fails
before the executor starts. An unknown **option** still exits 64, and so would an unknown batch —
but `batch-3` is no longer one:

- **The base commit is checked against `/home/df/wd/puni/puni-00`, not against the clone.**
  `git -C "$main" cat-file -e "$base^{commit}"` exits **65** with `base commit missing: <sha>` when
  the reviewed commit has not reached that repository yet. So each slice's commit is pushed or
  fetched into `/home/df/wd/puni/puni-00` before the next slice is dispatched.
- **`--resume` does not check anything out.** It only requires `$clone/.git` to exist (exit **66**,
  `nothing to resume`), and the attempt then runs on whatever HEAD the clone already has. The base
  argument is still validated as above but is otherwise unused. So the planner verifies the resumed
  HEAD itself: `git -C /home/df/wd/puni/batch-3/050-6-command-services rev-parse HEAD` must equal
  the commit just made.
- **A first dispatch refuses an existing clone** (exit **67**), and it is the first dispatch that
  runs `bun install --frozen-lockfile` and installs the hooks. The clone root is
  `/home/df/wd/puni/batch-3/050-6-command-services` and the branch is
  `batch-3/050-6-command-services`.
- **`--seed <dir>` merges into `$TMPDIR/$(basename <dir>)`**, so evidence preserved from slice 5 as
  `--preserve evidence` arrives in slice 6 as `$TMPDIR/evidence`, not `$TMPDIR/evidence/evidence`.
  This packet needs no seed: every slice's proofs are its own.

The attempt's temporary root is `/tmp/puni-batch3/<attempt>`. **No slice needs the network and none
binds a port**, so `--network` is never passed.

### Step 0 — Baseline, at the start of every slice

Nothing is edited in this step.

- [ ] `git rev-parse HEAD` and `git status --short --untracked-files=all`. Record both. This is
      **this slice's** starting status; slice 6 compares against it.
- [ ] Run the **sandbox unit command** and record its `Test Files` and `Tests` lines:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts)
  ```

  Expected: exit 0. Call the two numbers **F0** and **T0** for this slice. Every expectation below
  is relative to this slice's own F0 and T0. **Never** run `wbs-fe-01:test:unit` or
  `wbs-fe-01:test`: three of their tests spawn `bun` from Node and the sandbox refuses that with
  `spawnSync bun EPERM`.

- [ ] In slices 4, 5 and 6 only, also record the DOM oracle, which is what says the extraction
      changed nothing:

  ```sh
  (cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
    src/components/wbs/plan-chart-seam.test.tsx src/components/wbs/plan-read-and-write.test.tsx \
    src/components/wbs/plan-row-render-cost.test.tsx)
  (cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
    src/components/wbs/gantt-panel.test.tsx)
  ```

  Expected: exit 0 from both. Record both summaries; call them **D1** and **D2**. For orientation
  only, the planner saw 116 and 242 tests at the packet head.

### Slice 1 — The contract and the README

Commit subject: `feat(wbs-fe): add the calendar markers module's contract and index`. Paths:
`apps/wbs/fe-01/src/modules/calendar-markers/contract.ts`,
`apps/wbs/fe-01/src/modules/calendar-markers/README.md`.

- [ ] `mkdir -p apps/wbs/fe-01/src/modules/calendar-markers`
- [ ] Write `contract.ts` exactly as section 5.2 gives it.
- [ ] Write `README.md` with this content. Leave it free of Markdown links and give it **no**
      `module-index` comment, for 040.3's reason and section 4.5's measurement.

  ```markdown
  # Calendar markers

  The dates a person marks on one project's chart, and the four edits that change them: putting a
  marker on a day, renaming it, recolouring it, and taking it off.

  Two kinds in one module, because the feature exclusively owns the resource. Both are plain
  TypeScript and import no React, which is rule F1 of the code organization design in
  `docs/superpowers/specs/2026-09-19-code-organization-design.md`.

  - `calendar-markers.resource.ts` is the **resource**-service: one aggregate — this project's
    markers — the four routes that change it, and what each change leaves out of date.
  - `calendar-markers.feature.ts` is the **feature**-service: the markers a reader may put on the
    chart for as long as it owns the chart, which is what a screen asks for and the only thing
    delivery may import (rule K2).
  - `composition.ts` is where the HTTP client and the feature meet. A screen calls it.

  ## What the resource owns

  - The four calls on the project API, and nothing else it could do to a project.
  - The edit as a value, so the same edit can be sent once and reasoned about twice.
  - That every marker edit dirties the `markers` resource and no other — not the tree, because a
    marker moves nothing in the schedule.
  - That a refusal travels as the cause it was thrown as, unworded.

  ## What the feature owns

  Whether the write still belongs to whoever asked for it, at the two moments that question has
  different answers: the refresh owner being replaced under it, and the screen leaving the project
  or the API it was opened for. A refusal is said and the markers are read again only while both
  hold. A refused write rereads as an accepted one does, because the marker it named may have gone.

  ## What neither owns

  The read. The marker list on screen is the plan feed's `markers` resource, invalidated from here
  and never fetched here. The words a refusal is said in, which are built where they are said. The
  chart, the chips, the day sheet and the composer, which are the Gantt panel's.

  ## How it is read

  It is not read at all: this module answers no question. Four gestures go in, a reread of the
  feed's `markers` resource comes out, and every answer a person sees arrives through the plan feed.

  ## Relationships

  There is no `module.ts`: DI Bag 0.4.0 is installed but nothing in this application is composed
  through it yet, which is the rollout's lifetimes task, so `composition.ts` is a function, as
  `modules/plan-feed/composition.ts` is. Its one caller today is
  `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`, which hands it the refresh owner the plan
  feed beside it holds; the four chart gestures reach it through `wbs-table.tsx`.

  ## Checks

  The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suites are
  `calendar-markers.resource.test.ts` and `calendar-markers.feature.test.ts`. The behaviour this
  extraction preserves is proved by `plan-chart-seam.test.tsx`, which drives the real table through
  the four gestures, and by the Gantt panel's own day-sheet suites, which run in the `test` target
  of the same project.
  ```

- [ ] **Step 1.3, the README sweep.** The new README is an application README, so the derived
      sweep must cover it and still pass. Run that one test by name, never the whole file, which
      also holds the index checker:

  ```sh
  bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
    -t 'the current-document sweep reaches every application, library and tool README'
  ```

  Expected: `1 pass`, `0 fail`. **`0 tests` is a stop**, and so is a failure: there is no literal
  to re-pin on this baseline (section 4.8) and this packet has no authority to edit that file,
  which belongs to work item G2.

- [ ] **Step 1.4, the legacy-source pin is still there and still passes.** It did not leave with
      the README literal, and a slice that assumes it did would skip a check:

  ```sh
  bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
    -t 'every legacy source occurrence and relevant text family is pinned'
  ```

  Expected: `1 pass`, `0 fail`. The new files carry no legacy-root occurrence, so the digest and
  the occurrence count do not move. `0 tests` or a failure is a stop and is reported to the
  planner for reconciliation with G2, never fixed here.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0. A contract that does not compile
      wastes every slice after this one.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0. An import-order or Prettier diagnostic
      is not a stop: run `bunx eslint --fix` on the files you own and record both runs
      (preamble rule 17; the planner's rehearsal needed exactly that once).
- [ ] `bunx prettier --write` this slice's files, then `NX_DAEMON=false bunx nx format:check --all`
      → exit 0, or failures naming only files outside this packet.
- [ ] Run the sandbox unit command → **F0** and **T0**: this slice adds no test.

**Stop after slice 1.** Checkpoint A.

### Slice 2 — The resource: the four routes and what they dirty

Commit subject: `feat(wbs-fe): own the calendar marker routes in a resource service`. Paths:
`apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.resource.ts`,
`apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.resource.test.ts`,
`apps/wbs/fe-01/vitest.node-suites.ts`.

- [ ] Add `'src/modules/calendar-markers/calendar-markers.resource.test.ts'` to `NODE_SUITES` in
      `apps/wbs/fe-01/vitest.node-suites.ts`, in sorted position immediately **before**
      `'src/modules/directory-management/directory-management.feature.test.ts'`.
- [ ] Write `calendar-markers.resource.test.ts` exactly as section 8.1 gives it.
- [ ] Run the module's suite and expect a **failure**: `./calendar-markers.resource` does not
      resolve. Record the message.

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/modules/calendar-markers)
  ```

- [ ] Write `calendar-markers.resource.ts` exactly as section 8.2 gives it.
- [ ] Run the module's suite → exit 0, `Test Files 1 passed (1)`, `Tests 6 passed (6)`.
- [ ] Run the sandbox unit command → exit 0, **F0 + 1** files and **T0 + 6** tests.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0, and
      `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0; then `prettier --write` this slice's
      files and `NX_DAEMON=false bunx nx format:check --all` → exit 0.

**Stop after slice 2.** Checkpoint B. The hook is still untouched.

### Slice 3 — The feature and the composition site

Commit subject: `feat(wbs-fe): give the calendar marker writes a reader and a composition site`.
Paths: `apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts`,
`apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.test.ts`,
`apps/wbs/fe-01/src/modules/calendar-markers/composition.ts`,
`apps/wbs/fe-01/vitest.node-suites.ts`.

- [ ] Add `'src/modules/calendar-markers/calendar-markers.feature.test.ts'` to `NODE_SUITES`, in
      sorted position immediately **before** the resource suite added in slice 2.
- [ ] Write `calendar-markers.feature.test.ts` exactly as section 8.3 gives it.
- [ ] Run the module's suite and expect a **failure**: `./calendar-markers.feature` does not
      resolve. Record the message.
- [ ] Write `calendar-markers.feature.ts` exactly as section 8.4 gives it.
- [ ] Write `composition.ts` exactly as section 8.5 gives it.
- [ ] Run the module's suite → exit 0, `Test Files 2 passed (2)`, `Tests 13 passed (13)`.
- [ ] Run the sandbox unit command → exit 0, **F0 + 1** files and **T0 + 7** tests.
- [ ] `typecheck`, `lint`, `prettier --write`, `format:check --all` → exit 0 each.

**Stop after slice 3.** Checkpoint C.

### Slice 4 — Rewire the hook and the table

Commit subject: `refactor(wbs-fe): write calendar markers through the calendar markers module`.
Paths: `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`,
`apps/wbs/fe-01/src/components/wbs/wbs-table.tsx`.

**The first checkbox is a measurement, and it must be taken before anything is edited.** The scan
below is how this slice knows it found every call site, and once the callbacks are replaced there
is nothing left to count.

- [ ] **Step 4.0, before touching either file**, record what the scan finds:

  ```sh
  grep -rnE --include='*.ts' --include='*.tsx' \
    --exclude='*.test.ts' --exclude='*.test.tsx' \
    'api\.(create|rename|recolor|delete)CalendarMarker' apps/wbs/fe-01/src/components
  ```

  Expected: **exit 0** and exactly **four** lines, all in
  `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx` — the bodies of `createGanttMarker`,
  `renameGanttMarker`, `recolorGanttMarker` and `deleteGanttMarker`. Call that number **S0**. A
  different number is a stop **at this point only**: the tree is not the one this packet was
  written against. Once the edits below are made, four is the wrong answer and zero is expected, so
  never run this expectation again.

- [ ] In `use-plan-read.ts`, add this import in sorted position **immediately before**
      `import { planFeedForReader } from '@/modules/plan-feed/composition';`:

  ```ts
  import { calendarMarkersForReader } from '@/modules/calendar-markers/composition';
  ```

  Add **no** type import beside it: `usePlanRead` has no declared return type, so `CalendarMarkers`
  is never named in the hook and an unused type import fails lint.

- [ ] Replace the whole `runMarkerWrite` callback — its JSDoc line included — with:

  ```ts
  /**
   * This reader's calendar-marker gestures, rebuilt when the reader changes and
   * not otherwise.
   *
   * The dependency list is the one the callback it replaces carried, so the
   * four chart gestures built over it change identity on exactly the renders
   * they changed on before.
   */
  const markers = useMemo(
    () =>
      calendarMarkersForReader({
        projectId,
        api,
        readRefreshOwner: () => feedRef.current?.owner ?? null,
        isActiveReader: () => activeProject.current === projectId && activeApi.current === api,
        announceRefusal: ({ cause }) => {
          pushToast({ kind: 'error', text: refusalSentence(cause) });
        },
      }),
    [activeProject, api, projectId, pushToast],
  );
  ```

  The dependency array is `runMarkerWrite`'s, unchanged. The `Proof:` comment that sat above
  `owner.invalidate` inside `runMarkerWrite` does **not** stay here: it travels into the feature in
  slice 5, where its check now lives (section 9, row 11).

- [ ] Replace the return statement's last member:
      `return { refreshOrMarkStale, run: writer.run, stepStack, markers };`
- [ ] In `wbs-table.tsx`, rename the destructured member at the `usePlanRead({` call. **Write it
      in exactly this shape, which is the post-Prettier one:**

  ```ts
  const {
    refreshOrMarkStale,
    run,
    stepStack,
    markers: markerGestures,
  } = usePlanRead({
  ```

  **`markers` is already a name in that component** — the marker list state — so the gestures are
  bound to `markerGestures`. Binding them to `markers` is a stop condition.

  The five-line form is not taste. The one-line
  `const { refreshOrMarkStale, run, stepStack, markers: markerGestures } = usePlanRead({` is over
  the printer's width, and Prettier reflows it to the block above. Written on one line it survives
  every focused check and then fails the **commit**: the planner reproduced it, and lefthook's
  `format` command refused the staged file with
  `[warn] apps/wbs/fe-01/src/components/wbs/wbs-table.tsx`,
  `[warn] Code style issues found in the above file. Run Prettier with --write to fix.` and exit
  status 1, on 2026-09-21. It is the only line in this packet Prettier reflows.

- [ ] Replace the bodies and dependency arrays of the four marker callbacks. Each `useCallback`
      type annotation above them is unchanged; only these four two-line bodies and four arrays are:

  ```ts
      (marker) => {
        void markerGestures.add(marker);
      },
      [markerGestures],
  ```

  ```ts
      (markerId, name) => {
        void markerGestures.rename(markerId, name);
      },
      [markerGestures],
  ```

  ```ts
      (markerId, color) => {
        void markerGestures.recolor(markerId, color);
      },
      [markerGestures],
  ```

  ```ts
      (markerId) => {
        void markerGestures.remove(markerId);
      },
      [markerGestures],
  ```

  Each is identified by the callback it belongs to — `createGanttMarker`, `renameGanttMarker`,
  `recolorGanttMarker`, `deleteGanttMarker` — and by the `api.*CalendarMarker` line it replaces.
  The four are textually similar: edit them by their enclosing `const` name, never by matching the
  first `void runMarkerWrite(` in the file.

- [ ] Touch nothing else in either file: not `stepStack`, not `refreshOrMarkStale`, not the plan
      writer's `useMemo`, not `downloadJson`, not the `GanttPanel` props.
- [ ] Confirm the K2 boundary by reading `use-plan-read.ts`'s import list: no
      `calendar-markers.resource`, no `calendar-markers.feature`. If either is there, the rewire is
      wrong.
- [ ] **Step 4.9, after the edits**, run the identical command of step 4.0. Expected: **no output
      and exit 1**, which is what `grep` returns when nothing matched — `S0` has gone to zero. Exit 0 with any line left means a call site was
      missed. Any exit status other than 0 or 1 is an execution error — a bad pattern, a missing
      directory — and is neither a pass nor a fail: fix the invocation and rerun.

  **The two `--exclude` flags are load-bearing and the fixtures are not to be touched.** Without
  them the same scan prints **nineteen** lines on a correctly rewired tree — ten in
  `gantt-panel.test.tsx`, one in `gantt-panel.zoned.test.tsx` and eight in
  `plan-chart-seam.test.tsx`, for example `plan-chart-seam.test.tsx:877`, which creates a marker as
  test setup. The planner measured all nineteen on the rehearsed rewire. Those calls are how the
  oracle arranges its fixtures; editing any of them is stop condition 1.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0, no diagnostic.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0.
- [ ] `bunx prettier --write` both files, then `NX_DAEMON=false bunx nx format:check --all` → exit 0.
- [ ] Run the sandbox unit command → **F0** and **T0**: this slice adds no test.
- [ ] Run both DOM oracle commands → exit 0 with **D1** and **D2** exactly as this slice's step 0
      recorded them. A different count means a test was added, removed or skipped: stop and report.
      The planner measured this rewire and saw 116 of 116 and 242 of 242 before and after.

**Stop after slice 4.** Checkpoint D. This is the slice the planner runs the browser suite on
(section 11).

### Slice 5 — Negative proofs

Commit subject: `docs(wbs-fe): record the calendar markers module's observed negatives`. Paths:
`apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.resource.ts`,
`apps/wbs/fe-01/src/modules/calendar-markers/calendar-markers.feature.ts` (comments only).

- [ ] Perform every injection in section 9, one at a time, in the order given, each with the
      restore discipline that section states. Record the exact failure message for each **before**
      writing its `Proof:` comment.
- [ ] Only after watching a check fail, add its `Proof:` comment at the location the inventory
      names. Each names the fault injected and the test observed, with the date.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` → exit 0, and
      `NX_DAEMON=false bunx nx run wbs-fe-01:lint` → exit 0: a restored file that no longer
      compiles is the failure this catches.
- [ ] Run the sandbox unit command and both DOM oracle commands again, green: **F0**, **T0**,
      **D1**, **D2**, unchanged.
- [ ] `bunx prettier --write` the two files, then `NX_DAEMON=false bunx nx format:check --all`.

**Stop after slice 5.** Checkpoint E.

### Slice 6 — Whole-project checks and hand-over

No commit of its own unless a check forces a fix; this slice verifies and reports.

- [ ] Run the sandbox unit command → exit 0, **F0** and **T0**.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`, `...:lint`, `...:build` → exit 0 each.
- [ ] Do **not** run `wbs-fe-01:test:unit` or `wbs-fe-01:test`. Report both as pending planner
      verification, and state this packet's contribution as a **delta, not a total**: two files and
      thirteen tests in `test:unit` and in the `TZ=UTC` summary of `test`, with the
      `TZ=Pacific/Auckland` summary unchanged. The planner measures it against a baseline taken on
      the same integrated tree immediately before this packet's first commit.
- [ ] `bun test tools/tool-devsync/src/service-kinds.test.ts` → `17 pass`, `0 fail`. This is the
      check that says `docs/code-organization/kinds.json` owes nothing (section 4.6). It reads the
      tree through `git ls-files`, which is read-only, so it runs here. A count other than 17 is
      not a stop by itself — another packet may have added a case — but a **failure** naming a path
      this packet created is.
- [ ] Run the four filesystem-only devsync checks by name. Each reads the tree through
      `git ls-files`, so all four run here:

  ```sh
  for name in \
    'current documentation and active solver packets use namespaced roots' \
    'current Nx commands select existing qualified projects' \
    'every routed current document resolves its local links and anchors' \
    'every legacy source occurrence and relevant text family is pinned'
  do
    bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts -t "${name}"
  done
  ```

  Expected: each prints `1 pass`, `0 fail`. All four exist on this baseline and all four were run
  by the planner; **none of them is optional and none of them has been replaced**. A run reporting
  `0 tests` for any name is a stop: it means the file has changed under this packet, which is G2's
  lane. A failure naming a path this packet created is a stop condition; a failure naming only
  other packets' documents is pre-existing — record it verbatim and carry on.

- [ ] Add 110.6's derived sweep to that list, which is a fifth named test and not a substitute for
      any of the four:

  ```sh
  bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
    -t 'the current-document sweep reaches every application, library and tool README'
  ```

  Expected: `1 pass`, `0 fail`.

- [ ] Do **not** run `NX_DAEMON=false bunx nx run tool-devsync:test`: its index checker runs
      `git write-tree` and `git add --update` against this clone. Report it as pending planner
      verification.
- [ ] Run the batch README's standard OpenSpec validation block, the version that keeps its report
      under `$TMPDIR/evidence` and does not end in a removal. Expected: one JSON report printed and
      the block exits 0.
- [ ] `git status --short --untracked-files=all` → expect **this slice's** step 0 status,
      unchanged. Report the cumulative implementation paths from the five commit subjects above,
      not from the working tree.
- [ ] Do not run `git add`, `git commit`, `git checkout -b`, `git stash` or `git restore --staged`.
- [ ] Do **not** run `bin/h2puni-gate.sh`. Say in the report that the host gate was not run and why.

**Stop after slice 6.** Checkpoint F.

## 8. The code, rehearsed

### 8.1 `calendar-markers.resource.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import { createCalendarMarkerWrites } from './calendar-markers.resource';
import type { CalendarMarkerRoutes, CalendarMarkerView } from './contract';

const STORED: CalendarMarkerView = {
  id: 'launch',
  name: 'Launch',
  date: '2026-03-02',
  color: '#2563eb',
};

/** The four routes, recording what each was called with. */
function fakeRoutes(): { api: CalendarMarkerRoutes; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    api: {
      createCalendarMarker: (projectId, marker) => {
        asked.push(`create:${projectId}:${String(marker.markerId)}:${marker.date}:${marker.name}`);
        return Promise.resolve(STORED);
      },
      renameCalendarMarker: (projectId, markerId, name) => {
        asked.push(`rename:${projectId}:${markerId}:${name}`);
        return Promise.resolve(STORED);
      },
      recolorCalendarMarker: (projectId, markerId, color) => {
        asked.push(`recolor:${projectId}:${markerId}:${String(color)}`);
        return Promise.resolve(STORED);
      },
      deleteCalendarMarker: (projectId, markerId) => {
        asked.push(`delete:${projectId}:${markerId}`);
        return Promise.resolve();
      },
    },
  };
}

describe('the calendar markers of one project, as this browser writes them', () => {
  it('names the markers resource, and only it, as what a marker edit dirties', () => {
    const writes = createCalendarMarkerWrites({ projectId: 'p1', api: fakeRoutes().api });

    expect(writes.dirtied).toEqual(['markers']);
  });

  it('sends an add to the create route, on the project it was built for', async () => {
    const routes = fakeRoutes();
    const writes = createCalendarMarkerWrites({ projectId: 'p1', api: routes.api });

    await writes.send({
      kind: 'add',
      marker: { markerId: 'cutover', date: '2026-03-04', name: 'Cutover' },
    });

    expect(routes.asked).toEqual(['create:p1:cutover:2026-03-04:Cutover']);
  });

  it('sends a rename to the rename route, with the name and nothing else', async () => {
    const routes = fakeRoutes();
    const writes = createCalendarMarkerWrites({ projectId: 'p1', api: routes.api });

    await writes.send({ kind: 'rename', markerId: 'launch', name: 'Go live' });

    expect(routes.asked).toEqual(['rename:p1:launch:Go live']);
  });

  it('sends a recolour to the recolour route, a cleared colour included', async () => {
    const routes = fakeRoutes();
    const writes = createCalendarMarkerWrites({ projectId: 'p1', api: routes.api });

    await writes.send({ kind: 'recolor', markerId: 'launch', color: '#0386a5' });
    await writes.send({ kind: 'recolor', markerId: 'launch', color: null });

    expect(routes.asked).toEqual(['recolor:p1:launch:#0386a5', 'recolor:p1:launch:null']);
  });

  it('sends a removal to the delete route', async () => {
    const routes = fakeRoutes();
    const writes = createCalendarMarkerWrites({ projectId: 'p1', api: routes.api });

    await writes.send({ kind: 'remove', markerId: 'launch' });

    expect(routes.asked).toEqual(['delete:p1:launch']);
  });

  it('lets a refusal through unworded, because saying it is nobody here’s job', async () => {
    const routes = fakeRoutes();
    const refused = new Error('marker_not_found');
    const writes = createCalendarMarkerWrites({
      projectId: 'p1',
      api: {
        ...routes.api,
        renameCalendarMarker: () => Promise.reject(refused),
      },
    });

    const thrown = await writes
      .send({ kind: 'rename', markerId: 'launch', name: 'Go live' })
      .then(() => null)
      .catch((cause: unknown) => cause);

    expect(thrown).toBe(refused);
  });
});
```

The last case is written as a `.then/.catch` chain rather than
`await expect(promise).rejects.toThrow(...)`, which this repository's lint rejects (batch 1 README,
"Refusal tests and lint").

### 8.2 `calendar-markers.resource.ts`

Written **without** its `Proof:` comments, which slice 5 adds after watching each check fail.

```ts
import type { CalendarMarkerEdit, CalendarMarkerPorts, CalendarMarkerWrites } from './contract';

/**
 * Every marker edit leaves exactly this out of date.
 *
 * `markers` and not the tree: a marker moves nothing in the schedule, which is
 * why be-01 answers the list on a read of its own rather than inside
 * {@link PlanRead} — the argument is on {@link ProjectApi.listCalendarMarkers}.
 */
const DIRTIED = ['markers'] as const;

/**
 * The four routes that change one project's calendar markers.
 *
 * The **resource**-service (rule K4): it writes through the HTTP client and
 * knows what each write dirties, and it knows nothing about who asked, whether
 * they are still there, or what a refusal should be called. `projectId` is bound
 * once, because a resource is one aggregate's and not a catalogue of every
 * project's.
 */
export function createCalendarMarkerWrites({
  projectId,
  api,
}: CalendarMarkerPorts): CalendarMarkerWrites {
  return {
    dirtied: DIRTIED,
    send: async (edit: CalendarMarkerEdit): Promise<void> => {
      if (edit.kind === 'add') {
        await api.createCalendarMarker(projectId, edit.marker);
        return;
      }
      if (edit.kind === 'rename') {
        await api.renameCalendarMarker(projectId, edit.markerId, edit.name);
        return;
      }
      if (edit.kind === 'recolor') {
        await api.recolorCalendarMarker(projectId, edit.markerId, edit.color);
        return;
      }
      await api.deleteCalendarMarker(projectId, edit.markerId);
    },
  };
}
```

### 8.3 `calendar-markers.feature.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import type { PlanRefresh } from '@/lib/plan-refresh';

import { createCalendarMarkers } from './calendar-markers.feature';
import type { CalendarMarkerRoutes, CalendarMarkersHost, CalendarMarkerView } from './contract';

const STORED: CalendarMarkerView = {
  id: 'launch',
  name: 'Launch',
  date: '2026-03-02',
  color: '#2563eb',
};

/** An owner that records only what this module ever asks of it. */
function fakeOwner(asked: string[]): PlanRefresh {
  return {
    initialize: () => Promise.resolve({ status: 'installed' }),
    invalidate: (invalidation) => {
      asked.push(`invalidate:${invalidation.resources.join(',')}`);
      return Promise.resolve({ status: 'installed' });
    },
    getSnapshot: () => {
      throw new Error('the calendar markers never read a snapshot');
    },
    subscribe: () => () => undefined,
    dispose: () => undefined,
  };
}

interface Reader {
  readonly host: CalendarMarkersHost;
  readonly asked: string[];
  readonly refusals: unknown[];
  readonly owner: PlanRefresh;
  /** Puts a different owner in place, as a new project's effect does. */
  replaceOwner: (next: PlanRefresh | null) => void;
  /** Takes the screen away without replacing the owner, as a render does. */
  leave: () => void;
}

/** The four routes, recording what each was asked for into one list. */
function recordingRoutes(asked: string[]): CalendarMarkerRoutes {
  return {
    createCalendarMarker: (_projectId, marker) => {
      asked.push(`create:${String(marker.markerId)}`);
      return Promise.resolve(STORED);
    },
    renameCalendarMarker: (_projectId, markerId, name) => {
      asked.push(`rename:${markerId}:${name}`);
      return Promise.resolve(STORED);
    },
    recolorCalendarMarker: (_projectId, markerId, color) => {
      asked.push(`recolor:${markerId}:${String(color)}`);
      return Promise.resolve(STORED);
    },
    deleteCalendarMarker: (_projectId, markerId) => {
      asked.push(`delete:${markerId}`);
      return Promise.resolve();
    },
  };
}

function readerOver(routes: Partial<CalendarMarkerRoutes> = {}): Reader {
  const asked: string[] = [];
  const refusals: unknown[] = [];
  const owner = fakeOwner(asked);
  let installed: PlanRefresh | null = owner;
  let active = true;
  const api: CalendarMarkerRoutes = { ...recordingRoutes(asked), ...routes };
  return {
    asked,
    refusals,
    owner,
    replaceOwner: (next) => {
      installed = next;
    },
    leave: () => {
      active = false;
    },
    host: {
      projectId: 'p1',
      api,
      readRefreshOwner: () => installed,
      isActiveReader: () => active,
      announceRefusal: ({ cause }) => {
        refusals.push(cause);
      },
    },
  };
}

/** A route that refuses, and the cause it refuses with. */
const REFUSED = new Error('marker_not_found');
const refusingRename: Partial<CalendarMarkerRoutes> = {
  renameCalendarMarker: () => Promise.reject(REFUSED),
};

describe('the calendar markers a reader may put on the chart', () => {
  it('takes each of the four gestures to its own route', async () => {
    const reader = readerOver();
    const markers = createCalendarMarkers(reader.host);

    await markers.add({ markerId: 'cutover', date: '2026-03-04', name: 'Cutover' });
    await markers.rename('launch', 'Go live');
    await markers.recolor('launch', '#0386a5');
    await markers.remove('launch');

    expect(reader.asked.filter((one) => !one.startsWith('invalidate'))).toEqual([
      'create:cutover',
      'rename:launch:Go live',
      'recolor:launch:#0386a5',
      'delete:launch',
    ]);
  });

  it('reads the markers again after a write it accepted', async () => {
    const reader = readerOver();
    const markers = createCalendarMarkers(reader.host);

    await markers.remove('launch');

    expect(reader.asked).toEqual(['delete:launch', 'invalidate:markers']);
  });

  it('reads the markers again after a write it refused, and says what was refused', async () => {
    const reader = readerOver(refusingRename);
    const markers = createCalendarMarkers(reader.host);

    await markers.rename('launch', 'Go live');

    expect(reader.refusals).toEqual([REFUSED]);
    expect(reader.asked).toEqual(['invalidate:markers']);
  });

  it('writes nothing at all before a refresh owner exists', async () => {
    const reader = readerOver();
    reader.replaceOwner(null);
    const markers = createCalendarMarkers(reader.host);

    await markers.remove('launch');

    expect(reader.asked).toEqual([]);
  });

  it('says nothing and rereads nothing once another owner has taken its place', async () => {
    const reader = readerOver(refusingRename);
    const markers = createCalendarMarkers(reader.host);
    const started = markers.rename('launch', 'Go live');
    reader.replaceOwner(fakeOwner(reader.asked));

    await started;

    expect(reader.refusals).toEqual([]);
    expect(reader.asked).toEqual([]);
  });

  it('says nothing and rereads nothing once the reader has left the screen', async () => {
    const reader = readerOver(refusingRename);
    const markers = createCalendarMarkers(reader.host);
    const started = markers.rename('launch', 'Go live');
    reader.leave();

    await started;

    expect(reader.refusals).toEqual([]);
    expect(reader.asked).toEqual([]);
  });

  it('rereads nothing once another owner has taken its place, though the write was accepted', async () => {
    const asked: string[] = [];
    let installed: PlanRefresh | null = fakeOwner(asked);
    let acceptWrite!: () => void;
    const held = new Promise<void>((resolve) => {
      acceptWrite = resolve;
    });
    const markers = createCalendarMarkers({
      projectId: 'p1',
      api: {
        ...recordingRoutes(asked),
        deleteCalendarMarker: (_projectId, markerId) => {
          asked.push(`delete:${markerId}`);
          return held;
        },
      },
      readRefreshOwner: () => installed,
      isActiveReader: () => true,
      announceRefusal: () => undefined,
    });

    const started = markers.remove('launch');
    installed = fakeOwner(asked);
    acceptWrite();
    await started;

    expect(asked).toEqual(['delete:launch']);
  });
});
```

The **last case exists because the obvious mutation did not fail without it.** With
`if (isCurrent())` dropped from the reread and only the six cases above, the named test still
passed 1 of 1: every other departed-reader case refuses the write, and the catch's own guard
returns before the reread is reached. Two checks were sitting behind one test. The seventh case
holds an **accepted** write open until the owner has been replaced, and it is the only case that
separates them.

### 8.4 `calendar-markers.feature.ts`

Written **without** its `Proof:` comments, which slice 5 adds.

```ts
import { createCalendarMarkerWrites } from './calendar-markers.resource';
import type { CalendarMarkerEdit, CalendarMarkers, CalendarMarkersHost } from './contract';

/**
 * Builds the calendar-marker gestures for one reader: one project, one API, one
 * refresh owner.
 *
 * The **feature**-service delivery sees (rule K2), and the only place that
 * knows **who** a write belongs to. Every gesture is the same three acts — send
 * it, say what was refused, read the dirtied resources again — and the two
 * guards below are what keep a departed reader out of all three.
 */
export function createCalendarMarkers({
  projectId,
  api,
  readRefreshOwner,
  isActiveReader,
  announceRefusal,
}: CalendarMarkersHost): CalendarMarkers {
  const writes = createCalendarMarkerWrites({ projectId, api });
  const run = async (edit: CalendarMarkerEdit): Promise<void> => {
    const owner = readRefreshOwner();
    if (owner === null) return;
    /**
     * Still this reader's write: the owner it started against is still the one
     * installed, and the screen still holds the project and API it opened.
     * Both, because they fail at different moments — the owner is replaced by
     * an effect, the project and API by a render before it.
     */
    const isCurrent = (): boolean => readRefreshOwner() === owner && isActiveReader();
    try {
      await writes.send(edit);
    } catch (cause) {
      if (!isCurrent()) return;
      announceRefusal({ cause });
    }
    // A refused write rereads too: the target may have disappeared under it.
    if (isCurrent()) await owner.invalidate({ resources: writes.dirtied });
  };
  return {
    add: (marker) => run({ kind: 'add', marker }),
    rename: (markerId, name) => run({ kind: 'rename', markerId, name }),
    recolor: (markerId, color) => run({ kind: 'recolor', markerId, color }),
    remove: (markerId) => run({ kind: 'remove', markerId }),
  };
}
```

### 8.5 `composition.ts`

```ts
import { createCalendarMarkers } from './calendar-markers.feature';
import type { CalendarMarkers, CalendarMarkersHost } from './contract';

/**
 * The one place that sees the HTTP client and the feature at once.
 *
 * A composition site, which the taxonomy lets see everything because it
 * installs and supplies and holds no logic. It is here rather than in the
 * screen because rule K2 says delivery imports a feature-service and nothing
 * beneath it — the same line `modules/plan-feed/composition.ts` carries. The
 * project lifetime of the rollout's last Task 6 row takes this over; until then
 * it is one call.
 */
export function calendarMarkersForReader(host: CalendarMarkersHost): CalendarMarkers {
  return createCalendarMarkers(host);
}
```

## 9. Negative proofs

Every check below is either new or has had its expression rewritten by the move, so R5 requires
each to be watched failing before its `Proof:` comment is trusted.

**Every one of these was performed by the planner on 2026-09-20**, in a private worktree cut from
`da8be091`, against the rehearsed implementation of section 8, and the "observed" column is what
Vitest 5.0.0 actually printed. The executor repeats each one and records what it sees.

**Restore discipline, for every entry.** Copy the passing file aside first
(`cp <file> "$TMPDIR/<name>.passing"`), inject, save the mutation as a patch under
`$TMPDIR/evidence` with the batch README's exact `if diff …; then …; else test $? -eq 1; fi` form,
run the named command, save the failing output beside the patch, restore the exact bytes, prove it
with `cmp`, and rerun green. Never `|| true`, and never read a test's status through `tee`.

**A proof succeeds when the NAMED test fails about the fact the row states.** A fault that also
fails other tests is recorded, not stopped on.

Two commands, each run from the repository root in a subshell:

```sh
# command C — the module's own suites
(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/modules/calendar-markers \
  -t '<the named test>')
# command A — the production oracle
(cd apps/wbs/fe-01 && TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
  src/components/wbs/plan-chart-seam.test.tsx -t '<the named test>')
```

Command C reported `Test Files 2 passed (2)`, `Tests 13 passed (13)` unmutated. A run reporting
`0 tests` is a failure to stop on.

### The inventory

`R` is `calendar-markers.resource.ts`, `F` is `calendar-markers.feature.ts`.

| #   | Check, and where its `Proof:` comment goes                                             | File | Mutation                                                                                           | Cmd | Named test                                                                              | Observed                                                                                            |
| --- | -------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | A marker edit dirties `markers` — above `const DIRTIED`                                | R    | `const DIRTIED = [] as const;`                                                                     | C   | `names the markers resource, and only it, as what a marker edit dirties`                | `AssertionError: expected [] to deeply equal [ 'markers' ]`                                         |
| 2   | The add arm carries the whole marker — above the `'add'` branch                        | R    | `await api.createCalendarMarker(projectId, { ...edit.marker, name: '' });`                         | C   | `sends an add to the create route, on the project it was built for`                     | `expected [ 'create:p1:cutover:2026-03-04:' ] to deeply equal [ Array(1) ]`                         |
| 3   | The rename arm carries the name — above the `'rename'` branch                          | R    | `await api.renameCalendarMarker(projectId, edit.markerId, '');`                                    | C   | `sends a rename to the rename route, with the name and nothing else`                    | `expected [ 'rename:p1:launch:' ] to deeply equal [ 'rename:p1:launch:Go live' ]`                   |
| 4   | The recolour arm carries the colour — above the `'recolor'` branch                     | R    | `await api.recolorCalendarMarker(projectId, edit.markerId, null);`                                 | C   | `sends a recolour to the recolour route, a cleared colour included`                     | `expected [ 'recolor:p1:launch:null', …(1) ] to deeply equal [ 'recolor:p1:launch:#0386a5', …(1) ]` |
| 5   | The removal reaches the delete route — above the final `await`                         | R    | `await Promise.resolve();` in place of `await api.deleteCalendarMarker(projectId, edit.markerId);` | C   | `sends a removal to the delete route`                                                   | `expected [] to deeply equal [ 'delete:p1:launch' ]`                                                |
| 5a  | The same fault, on the production path                                                 | R    | the same as row 5                                                                                  | A   | `deletes through the api, and the chip goes with it`                                    | `expected [ { id: 'launch', …(3) } ] to deeply equal []`                                            |
| 6   | No owner, no write — above `if (owner === null) return;`                               | F    | delete that line **and** make the reread `if (owner !== null && isCurrent())` so it compiles       | C   | `writes nothing at all before a refresh owner exists`                                   | `expected [ 'delete:launch' ] to deeply equal []`                                                   |
| 7   | A departed reader is told nothing — above `if (!isCurrent()) return;` in the `catch`   | F    | delete that line                                                                                   | C   | `says nothing and rereads nothing once another owner has taken its place`               | `expected [ Error: marker_not_found ] to deeply equal []`; the left-screen case failed too          |
| 8   | A departed reader triggers no reread — above `if (isCurrent()) await owner.invalidate` | F    | `await owner.invalidate({ resources: writes.dirtied });` unguarded                                 | C   | `rereads nothing once another owner has taken its place, though the write was accepted` | `expected [ 'delete:launch', …(1) ] to deeply equal [ 'delete:launch' ]`                            |
| 9   | Ownership is the owner's identity — on `isCurrent`                                     | F    | `const isCurrent = (): boolean => isActiveReader();`                                               | C   | `says nothing and rereads nothing once another owner has taken its place`               | `expected [ Error: marker_not_found ] to deeply equal []`                                           |
| 10  | Ownership is also the live screen — on `isCurrent`                                     | F    | `const isCurrent = (): boolean => readRefreshOwner() === owner;`                                   | C   | `says nothing and rereads nothing once the reader has left the screen`                  | `expected [ Error: marker_not_found ] to deeply equal []`                                           |
| 11  | A refused write rereads too — above the `if (isCurrent()) await owner.invalidate` line | F    | add `return;` after `announceRefusal({ cause });` inside the `catch`                               | C   | `reads the markers again after a write it refused, and says what was refused`           | `expected [] to deeply equal [ 'invalidate:markers' ]`                                              |
| 11a | The same fault, on the production path                                                 | F    | the same as row 11                                                                                 | A   | `rereads a marker refused because a peer already deleted it`                            | `expected <span …(4)></span> to be null`                                                            |

Eleven checks, thirteen observed failures counting the two rows proved twice.

**Rows 9 and 10 are one expression and two conjuncts, and each gets its own mutation**, because a
single mutation of `isCurrent` would hide whichever half the test did not separate. Row 8 exists
only because the seventh feature test was added: section 8.3 records that the mutation left the
named test passing until it was.

Row 11's comment replaces the one that stands in `use-plan-read.ts` today
(`// Proof: returning after the refusal left the deleted marker's span drawn in …`). That comment
is **deleted with the callback in slice 4** and re-established here, observed afresh, exactly as
R5 requires of a proof that moves.

## 10. Guard inventory

Confirm by reading that these are unchanged and still where they are, and say so in the report.

| Guard                                              | Where                    | Why it stays                                          |
| -------------------------------------------------- | ------------------------ | ----------------------------------------------------- |
| The opening guard of `refreshResourcesOrMarkStale` | the hook                 | 040.4 section 4.6: it is the departed caller's guard. |
| `stepStack`'s own `isCurrent`                      | the hook                 | The plan history service, a later lane (section 12).  |
| The plan writer's three identity checks            | `plan-writer.feature.ts` | 040.3 proved them; this packet does not touch them.   |
| The plan feed's lifetime and generation guards     | `plan-feed.resource.ts`  | 040.4 proved them.                                    |
| `publish`'s disposal and superseded-read checks    | `lib/plan-refresh.ts`    | The owner's, with their own proofs.                   |

No guard is deleted by this packet.

## 11. Verification

Every slice runs, in this order: the sandbox unit command, `wbs-fe-01:typecheck`,
`wbs-fe-01:lint`, a targeted `prettier --write`, and `nx format:check --all`. Slices 4, 5 and 6 add
the two DOM oracle commands. Slice 6 adds the build, the devsync checks and the OpenSpec block.

| Command                                                 | Expected                                                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| The sandbox unit command                                | Exit 0. Slice 2: **F0 + 1**/**T0 + 6**. Slice 3: **F0 + 1**/**T0 + 7**. Slices 1, 4, 5, 6: **F0**/**T0**. |
| The two DOM oracle commands, slices 4 to 6              | Exit 0, **D1** and **D2** unchanged from that slice's step 0.                                             |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`       | Exit 0, no diagnostic. Every slice.                                                                       |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`            | Exit 0. Every slice; an autofixable ordering diagnostic is fixed with `eslint --fix`, not stopped on.     |
| `NX_DAEMON=false bunx nx format:check --all`            | Exit 0, or failures naming only files outside this packet. Every slice.                                   |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`           | Exit 0. Slice 6.                                                                                          |
| `bun test tools/tool-devsync/src/service-kinds.test.ts` | `17 pass`, `0 fail`. Slice 6.                                                                             |
| The five named devsync checks                           | Each `1 pass`, `0 fail`. All five exist on this baseline; none replaces another. Slice 6.                 |
| The standard OpenSpec block                             | One JSON report printed, block exits 0. Slice 6.                                                          |

### What the planner runs afterwards

| Command                                                                                                                  | Why the executor cannot run it                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git add` of each slice's paths, then its commit                                                                         | The clone's Git directory is read-only.                                                                                                                                                                                                                         |
| `NX_DAEMON=false bunx nx run tool-devsync:test`                                                                          | Its index checker writes Git objects into the clone.                                                                                                                                                                                                            |
| `wbs-fe-01:test:unit` and `wbs-fe-01:test`, outside the sandbox                                                          | Three of their tests spawn `bun` from Node. Contribution: two files, thirteen tests in the UTC summary.                                                                                                                                                         |
| `wbs-fe-01:e2e`                                                                                                          | Needs a browser and the real stack. Run after slice 4 — see below.                                                                                                                                                                                              |
| `twib check` with a rule policy                                                                                          | Needs a `node_modules` outside the clone for `TOOL_WIKI_TRUSTED_NODE_MODULES`. Section 4.5 records the planner's results.                                                                                                                                       |
| `GSETTINGS_BACKEND=memory NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`, with every new file **staged** | The index checker writes Git objects, and the inventory reads the index rather than untracked files. The planner measured **`301 pass`, `0 fail`** with the whole extraction staged: neither hand-moved pin moved (section 4.8, and the per-slice table below). |
| `bin/h2puni-gate.sh <sha>`                                                                                               | The host gate cannot run on this machine.                                                                                                                                                                                                                       |

**The two hand-moved devsync pins, per slice.** G2 owns both files; this packet never edits
either. The planner checks the whole target after each commit and expects no movement anywhere:

| Slice | What it adds to the tree                                | `workspace-inventory` 167/84 | Legacy digest and 257 occurrences |
| ----- | ------------------------------------------------------- | ---------------------------- | --------------------------------- |
| 1     | `contract.ts`, `README.md`                              | unchanged                    | unchanged                         |
| 2     | the resource, its suite, one `NODE_SUITES` line         | unchanged                    | unchanged                         |
| 3     | the feature, its suite, `composition.ts`, one more line | unchanged                    | unchanged                         |
| 4     | edits inside two existing `components/wbs` files        | unchanged                    | unchanged                         |
| 5     | `Proof:` comments inside the two module source files    | unchanged                    | unchanged                         |
| 6     | nothing                                                 | unchanged                    | unchanged                         |

Why nothing moves: the inventory counts parent-relative paths declared in **app and library
configuration**, and this packet adds no Nx target, no tsconfig path and no project file; the
digest counts **legacy-root occurrences** in scanned sources, and none of the seven new files
contains one. The planner staged the whole extraction and measured it: `301 pass`, `0 fail`,
exit 0. **If a slice does move a pin, that is a finding for G2 and a stop, never a re-pin here.**

**One test in that target is load-sensitive, and a timeout there is not this packet's.**
`the production index checker resolves current Markdown links and anchors` in
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` walks the tree through Git under Bun's
30-second limit. On a loaded workstation the planner saw it time out at **30181.86 ms** —
`^ this test timed out after 30000ms.`, 300 pass / 1 fail — on a run that took 90 seconds overall,
and pass on the immediate rerun (`301 pass`, `0 fail`, 54 seconds). It asserts nothing about this
packet's files, and `every routed current document resolves its local links and anchors`, which
does, passed in both runs. Treat a timeout there as load: rerun once, and only a reproducible
failure is a finding.

**The browser suite, and which specs cover this service.** Exactly one e2e spec drives the
production marker write: `apps/wbs/fe-01/e2e/live-caret.spec.ts`, the test
`a peer marker appears without disturbing the editor`, which opens the composer in a second browser
context, waits on the `POST .../calendar-markers` response, and then asserts the chip reaches the
first session. It already carries a `Proof:` comment about routing `calendar_markers_changed` to
the wrong resource. Run it first:

```sh
CI=1 E2E_PORT_SHIFT=<n> NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- e2e/live-caret.spec.ts
```

then the whole target. `apps/wbs/fe-01/e2e/gantt.spec.ts` and `gantt-detail.spec.ts` exercise the
chart the markers are drawn on but never write one; no other spec mentions a calendar marker.

**The planner already ran the whole target once against the rehearsed rewire**, on 2026-09-20, in
its private worktree, isolated and through the Nx target: `377 passed`, `40 skipped`, 19.7 minutes,
exit 0, with `live-caret.spec.ts`'s marker case among the passes. So this packet's browser risk is
measured, not assumed. Run it again after slice 4 all the same, because the executor's tree is not
this one.

**Choosing `E2E_PORT_SHIFT`, which is arithmetic and not taste.**
`apps/wbs/fe-01/playwright.config.ts` puts the three tiers at `3100 + S`, `3200 + S` and
`4200 + S`, so two live runs at shifts `S1` and `S2` collide whenever `|S1 - S2|` is **100, 1000 or
1100** — 100 puts one run's be-01 on the other's gw-01, 1000 puts a gw-01 on an fe-01, and 1100
puts a be-01 on an fe-01. Shifts 2100 and 3100 both occupy 6300. So:

1. Compute the three ports for the shift you intend and for every run already alive.
2. Run `ss -ltn` and confirm all three are free. A shift is a proposal about a host and the host
   has the last word: `CI=1` makes Playwright refuse a used port rather than measure somebody
   else's stack.
3. Follow the batch's coordinated **300-spaced** assignments, which clear all three distances.
4. Never kill a process you cannot prove is yours: read `/proc/<pid>/cwd` and check it is your
   clone before signalling anything.

**Two more facts about that run, both paid for on 2026-09-20.** The people directory is global to
an e2e run, so a spec that adds a person is visible to every other. And Playwright's `check()`
fails on a prop-driven radio, so a marker-composer assertion must read the element's state rather
than click through `check()`.

**What none of it proves.** Nothing here proves K2, K3, K4 or K6 mechanically: section 4.5 shows
those rules cannot be evaluated over this application at all today, and the rollout's ESLint task
does not exist yet. Conformance is established by reading the imports and by the structure.

## 12. The remaining extractions, in order, with the files each owns

One packet per lane, in this order. **Three of them edit `wbs-table.tsx` and two edit
`plan-toolbar.tsx`**, so ownership is by _region_ rather than by file: each row names the exact
call sites it takes, no two rows claim the same one, and where two rows touch one file they run in
the order given, with a commit between them. The later packet cites this table rather than
rediscovering the boundary.

`wbs-table.tsx`'s five `api.` call sites divide as follows, with the marker writes already gone in
lane 1: `arrangeBySchedule` at `:1101`, `setOptimizationSettings` at `:2042` and `retryOptimization`
at `:2047` go to lane 5; `removeDependency` at `:2321` and `unfreezeWorkItem` at `:2418` go to
lane 7; and `downloadJson`'s `api.exportPlan` goes to lane 3. `api.unfreezeProject` is **not** in
this file — it is `plan-toolbar.tsx:738`, which is lane 5's.

| Order | Lane                 | Module directory              | Files it owns outside the module                                                                                                                                                                                                                          | Why here                                                                                                                                                                           |
| ----- | -------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Calendar markers** | `modules/calendar-markers/`   | the `markers` memo in `use-plan-read.ts`; the four `*GanttMarker` callbacks and the `usePlanRead` destructuring in `wbs-table.tsx`                                                                                                                        | **This packet.** The narrowest seam and the best oracle.                                                                                                                           |
| 2     | Plan history         | `modules/plan-history/`       | `stepStack` in `use-plan-read.ts` only                                                                                                                                                                                                                    | One callback in one file, and no other file at all. It owns three sentences, so it settles how a command lane words its own outcomes.                                              |
| 3     | Plan transfer        | `modules/plan-transfer/`      | `use-plan-import.ts` whole; `downloadJson` in `wbs-table.tsx`                                                                                                                                                                                             | Import and export are one lane: one archival document, two directions. Its two `Proof:` comments move with it.                                                                     |
| 4     | Plan steps           | `modules/plan-steps/`         | the `steps={{…}}` adapter object in `plan-toolbar.tsx`                                                                                                                                                                                                    | First of the toolbar lanes. Waits for nothing: `plan-toolbar.tsx` is unowned, and 040.5 is the observability serializer in `libs/wbs/adapters/observability`.                      |
| 5     | Project settings     | `modules/project-settings/`   | the rest of `plan-toolbar.tsx`'s adapters, `api.freezeProject` and `api.unfreezeProject` among them (`plan-toolbar.tsx:732`, `:738`); `arrangeBySchedule` (`wbs-table.tsx:1101`), `setOptimizationSettings` (`:2042`) and `retryOptimization` (`:2047`)   | The remaining toolbar and chart-wide settings. After lane 4, same file.                                                                                                            |
| 6     | Plan vocabulary      | `modules/plan-vocabulary/`    | `use-reference-sets.ts` whole                                                                                                                                                                                                                             | The plan cells' additions to the global directory. It reads through the merged `directory` resource-service.                                                                       |
| 7     | Work item commands   | `modules/work-item-commands/` | `use-plan-fields.ts`, `use-plan-structure.ts`, `use-estimate-drafts.ts`, `use-plan-dependencies.ts`, `plan-columns/actions.tsx`, `plan-columns/depends.tsx`, and in `wbs-table.tsx` exactly `removeDependency` (`:2321`) and `unfreezeWorkItem` (`:2418`) | The largest lane: 28 of the 67 non-test `api.*` call sites under `components/wbs/`, plus two in `wbs-table.tsx`. **Split further at its own Plan step**; do not dispatch it whole. |
| 8     | Projects             | `modules/projects/`           | `project-page.tsx`'s `listProjects`, `openProject`, `renameProject`                                                                                                                                                                                       | The page above the table, not the table.                                                                                                                                           |
| 9     | Saved plans          | `modules/saved-plans/`        | `saved-plans-panel.tsx`, `saved-plan-list.tsx`, `saved-plan-compare.tsx`, and `src/lib/saved-plan-*.ts`                                                                                                                                                   | A different client (`SavedPlanApi`, not `ProjectApi`) and a different lifetime. Last, and independent of 2 to 8.                                                                   |

Lanes 2 and 3 are dispatchable immediately after this one. Lanes 4 and 5 wait only on each other,
because nothing in batch 3 owns `plan-toolbar.tsx`. Lanes 3, 5 and 7 each edit a different region
of `wbs-table.tsx` and so run one after another with a commit between. Lanes 6, 8 and 9 are
independent of everything above them.

## 13. Stop conditions

Each is false on the tree this packet starts from.

1. Any assertion in an existing test has to change to make a suite pass. There is **no**
   exception: this packet edits no file outside `apps/wbs/fe-01`, and the two hand-moved devsync
   pins belong to work item G2.
2. A `Proof:` comment has no home, or the test it names no longer exists.
3. The DOM oracle's counts differ from that slice's step 0, or a test outside this packet's files
   fails.
4. A named test in section 9's inventory passes under its mutation, fails about a different fact,
   or the mutation does not compile. Extra failing tests are recorded and are **not** a stop. A
   mutation that leaves the named test passing is first a location mistake: restore, check the
   location once against the expression the row names, redo once, and report both runs.
5. `plan-toolbar.tsx`, `use-plan-dependencies.ts`, `project-page.tsx`, `use-plan-import.ts` or any
   file under `modules/plan-feed/`, `modules/plan-writer/`, `modules/directory*/` or
   `modules/preferences/` appears to need an edit.
6. The gestures appear to need the name `markers` inside `wbs-table.tsx` (it is taken).
7. `stepStack`, `refreshOrMarkStale` or `PlanReadScope` appears to need to move.
8. A suite fails in the node tier with a reference error naming a browser global, or
   `src/test-tiers.test.ts` refuses either new entry.
9. Step 1.3's derived sweep or step 1.4's legacy-source pin reports `0 tests`, or either fails.
10. `use-plan-read.ts` still imports `calendar-markers.resource` or `calendar-markers.feature`
    after slice 4, or slice 4's post-edit scan — the one with both `--exclude` flags — exits 0 with
    a line left in a **non-test** file under `components/`. Matches in `*.test.ts` and `*.test.tsx`
    are the oracle's fixtures and are **not** a stop; the pre-edit `S0` of four and the post-edit
    exit 1 are the whole of this condition.
11. `NX_DAEMON=false bunx nx format:check --all` names one of this packet's own files after the
    targeted write.
12. Any step seems to need `git add`, `git commit`, the network, a bound port or the host gate.

## 14. Out of lane

| Path                                                                                        | Owner                                                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/lib/wbs-api.ts` and `lib/plan-refresh.ts`                               | Nobody; imported, not edited.                                                                   |
| `apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx`                                        | Unowned today. Future lanes 4 then 5 of section 12, sequentially, with a commit between them.   |
| `apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts`                                | Unowned today. Future lane 7 of section 12.                                                     |
| `apps/wbs/fe-01/src/components/wbs/gantt-panel.tsx`                                         | Nobody; its four marker props are unchanged.                                                    |
| `apps/wbs/fe-01/src/components/wbs/plan-refusal.ts`                                         | The Notices module; this packet does not need it.                                               |
| `apps/wbs/fe-01/src/modules/plan-feed/**`, `plan-writer/**`                                 | 040.4 and 040.3, merged.                                                                        |
| `docs/code-organization/kinds.json`                                                         | Nobody here: section 4.6 shows no entry is owed.                                                |
| `apps/wiki/cli/**` and any rule policy file                                                 | 010.7. This packet reports what `check` says; it registers no rule and commits no policy.       |
| `apps/wbs/fe-01/e2e/` and `apps/wbs/fe-01/tsconfig.spec.json`                               | Work items **050.4** and **U2** in this batch. This packet adds no spec and no test config.     |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` and `workspace-inventory.test.ts` | Work item **G2**, which derives both hand-moved pins. Read by name, never edited (section 4.8). |
| `eslint.config.js`                                                                          | Task 3 of the rollout.                                                                          |

## 15. OpenSpec

**No OpenSpec change is created**, and no architectural exception is taken. R4 requires a change
for observable behaviour, contracts, migrations, deploy safety or architecture, and skips it for
mechanical refactors. This packet moves code without changing behaviour — measured, section 4.7 —
and conforms to the architecture the proposed `service-taxonomy` change states rather than amending
it. Nothing in that change is edited. `openspec/specs/wbs-table-modules/spec.md`, requirement
"Concept modules preserve table behavior", covers adding a module the table composes while
behaviour holds, so it needs no delta. The validation command is the batch's standard OpenSpec
block, run in slice 6.

## 16. Assumptions recorded rather than asked

1. **The calendar markers go first.** Section 2 gives the four reasons. The owner can reorder
   section 12 without changing anything in sections 5 to 11.
2. **The order of the remaining eight lanes** is the planner's, from the call-site inventory in
   section 4.1 and the file ownership in section 12. Nothing in batch 3 blocks any of them: 040.5
   is the observability serializer, not a toolbar lane, and `plan-toolbar.tsx` is unowned today.
   Lanes 4 and 5 follow each other only because they edit the same file.
3. **The refusal stays a cause, and the sentence stays in delivery**, which is 040.4's discipline
   rather than 040.3's. The consequence is that this module imports nothing from `components/`.
4. **The module keeps a resource-service even though it performs no read.** The alternative — a
   feature that calls the HTTP client — is what rule K3 forbids and what the batch 1 README left
   open. The dirtied-resource knowledge is what makes the resource more than a pass-through, and
   the same shape answers all eight remaining lanes.
5. **No `module-index` comment in the README**, so MOD-LAYOUT keeps reporting the same debt row for
   this module as for the five that already exist (section 4.5). Closing it for one module and not
   the others would make the debt list lie about what is adopted.
6. **`kinds.json` gains no entry** (section 4.6), because the file's own roots and suffix rule say
   none is owed. If the owner wants the frontend classified, that is an extension of
   `SERVICE_ROOTS` and a packet of its own.
7. **The gestures object is bound to `markerGestures` in `wbs-table.tsx`**, because `markers` is
   already the marker-list state there. A rename of the state would touch the chart props.
8. **The four gestures keep returning promises** even though every caller `void`s them, because
   that is what lets the module's own tests await one without a timer.
9. **`E2E_PORT_SHIFT` is the planner's to choose, not the packet's, and "more than 100 apart" is
   not the rule.** The rehearsal's first whole run was lost to a collision: a peer session held
   shift 2600 and this run asked for 2700, so this run's be-01 landed on that run's gw-01; be-01
   took a SIGTERM eleven seconds in and every navigation then failed `ECONNREFUSED`. The rerun used
   3200 and passed. But 100 is only one of three collision distances — **1000 and 1100 collide
   too**, because the tiers sit 100 and 1100 apart. The rule recorded in section 11 is therefore
   disjoint calculated three-port sets, an `ss -ltn` check before launch, the batch's 300-spaced
   assignments, and `/proc/<pid>/cwd` before signalling any process.

## 17. Disposition of review 1

First high-effort review (Codex `gpt-6-astra`): NOT READY. Revised 2026-09-21. Every finding was
checked against the repository, and each fix was settled by rehearsal in the planner's private
worktree, then reverted.

| Finding                                                    | Disposition | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical 1 — the launcher cannot run as written            | FIXED       | Confirmed at `/home/df/wd/puni/puni-plan/exec/run-executor.sh`: at the time of review 1 its `case` had arms for `batch-1` and `batch-2` only, so `batch-3` exited 64. **Superseded on 2026-09-21**, when a `batch-3)` arm was added defaulting to this packet's own directory — see review 2's Minor 3. Section 7 now gives the absolute launcher path and `--batch batch-3 --batch-dir docs/superpowers/plans/2026-09-21-batch-3`, plus the four failure modes read from the script: exits 64, 65, 66 and 67. |
| Critical 2 — the scan includes tests and necessarily fails | FIXED       | Rehearsed. On the rewired tree the packet's original scan printed **19** lines — 10 in `gantt-panel.test.tsx`, 1 in `gantt-panel.zoned.test.tsx`, 8 in `plan-chart-seam.test.tsx`, exactly as the review counted. The corrected scan carries `--exclude='*.test.ts' --exclude='*.test.tsx'` and was measured at **4 lines / exit 0** before the edits and **no output / exit 1** after.                                                                                                                        |
| Important 3 — branch B wrongly replaces a required check   | FIXED       | Confirmed: `applicationLibraryToolReadmes` is absent, the derived sweep is at `repo-namespacing-handoff.test.ts:483` and the legacy-source pin is still at `:553`; both were run by name and printed `1 pass`, `0 fail`. Branch A is withdrawn entirely, step 1.3 is split into 1.3 and 1.4, and slice 6 now runs five named checks of which none replaces another.                                                                                                                                            |
| Important 4 — ownership and pin instructions are stale     | FIXED       | Batch 3's lanes are 040.5, 050.4, 050.6, G1, G2 and U2, read from the work-item files. Both pinned devsync files are **G2's** and are now out of lane. Section 4.8 is rewritten with the measured evidence, and section 11 carries a per-slice pin table. Measured: the whole extraction staged, `tool-devsync:test --skip-nx-cache` → **`301 pass`, `0 fail`**, exit 0; neither pin moved.                                                                                                                    |
| Important 5 — "more than 100" does not prevent collisions  | FIXED       | Confirmed from `playwright.config.ts`'s `3100 + S`, `3200 + S`, `4200 + S`: 100, 1000 and 1100 all collide. Section 11 now requires disjoint calculated three-port sets, an `ss -ltn` check, the batch's 300-spaced assignments, and `/proc/<pid>/cwd` before signalling anything. Assumption 9 is rewritten.                                                                                                                                                                                                  |
| Minor 6 — two factual claims in section 12 are wrong       | FIXED       | Confirmed: `wbs-table.tsx:2418` is `api.unfreezeWorkItem(rowId)` and `api.unfreezeProject` is `plan-toolbar.tsx:738`. Lane 5 no longer claims it. Section 12 now divides `wbs-table.tsx` by call site with line numbers and says ownership is by region, with sequencing where two lanes touch one file.                                                                                                                                                                                                       |

**Nothing in the prescribed code changed.** The review confirmed zero TypeScript diagnostics, all
13 supplied test bodies passing and all 11 mutations failing their named assertions; the revision
re-ran the module from the packet's own code blocks and saw the same numbers — `42 passed (42)`
files and `614 passed (614)` tests on the sandbox unit command, `wbs-fe-01:typecheck` exit 0. Every
defect was in the instructions around it.

**Batch 2's `RESULTS.md` is indeed absent from this tree** (the worktree is cut from `da8be091`,
which predates it). Its lessons reached this packet through the batch 3 brief, which the planner
read in full before writing it.

## 18. Disposition of review 2

Second high-effort review (Codex `gpt-6-astra`): READY AFTER FIXES. Revised 2026-09-21. It carried
round one's six findings forward as five FIXED and one PARTLY; the PARTLY is closed below, with
this round's own findings. Every fix was settled by rehearsal — including four real `git commit`
runs with lefthook enabled — then reverted.

| Finding                                                      | Disposition | What changed                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Round 1, Important 4 — PARTLY: 040.5 survives in §12 and §14 | FIXED       | Section 12's Plan steps row no longer waits for 040.5, and section 14 assigns `plan-toolbar.tsx` to future lanes 4 then 5 and `use-plan-dependencies.ts` to future lane 7, both marked unowned today. Section 6's lane table and assumption 2 already said so; the three now agree.                                                                                          |
| Important 1 — the pre-edit scan appears after the edits      | FIXED       | Confirmed: the S0 scan sat below all four replacements, so the listed order stopped on a correct extraction. It is now **step 4.0**, the first checkbox of slice 4, and the post-edit run is **step 4.9**. Rehearsed in the prescribed order: step 4.0 printed four lines at `wbs-table.tsx:1698`, `:1706`, `:1714`, `:1722` and exited 0; step 4.9 printed nothing, exit 1. |
| Important 2 — obsolete 040.5 ownership in §12 and §14        | FIXED       | The same edits as the row above.                                                                                                                                                                                                                                                                                                                                             |
| Minor 3 — the launcher description is no longer factual      | FIXED       | Confirmed: `run-executor.sh` now has a `batch-3)` arm defaulting to this packet's directory, so omitting `--batch-dir` does **not** exit 64. Section 7 says so and keeps the explicit flag; the exit-64 claim now attaches only to an unknown option or an unknown batch. Section 17's Critical 1 row carries the correction.                                                |
| Minor 4 — the K2 row claims a `contract.ts` import           | FIXED       | Confirmed against slice 4, which adds one import and forbids the type import. Section 4.4's K2 row now reads "imports one name, `calendarMarkersForReader` from `composition.ts`, and neither service implementation".                                                                                                                                                       |

**One real defect came out of the commit rehearsal, and it is fixed in the instructions.** Slice 4
prescribed the destructuring on one line. That line is over Prettier's width, so it passes every
focused check and then fails the commit: lefthook's `format` command refused the staged file with
`[warn] apps/wbs/fe-01/src/components/wbs/wbs-table.tsx` and exit status 1 (observed 2026-09-21).
Slice 4 now prescribes the five-line post-Prettier form, and the re-run commit exited 0. This is
batch 1's "slice could not be committed with hooks" defect class, caught here by reproducing the
hook rather than reasoning about it.

**Slices 1, 2, 3 and 4 are dispatchable.** Each was created from this packet's own code blocks,
checked, and committed with hooks on, in order, in the planner's private worktree: slice 1 two
files, slice 2 three files (`41 passed (41)` / `607 passed (607)`), slice 3 four files
(`42 passed (42)` / `614 passed (614)`), slice 4 two files. Slices 5 and 6 add no new file and rest
on the same evidence: section 9's eleven mutations were all watched failing and restored, and
section 11's checks were all run.

**A devsync timeout was investigated and is not this packet's.** With the packet staged,
`tool-devsync:test --skip-nx-cache` failed once at 300 pass / 1 fail — the index checker timing out
at 30181.86 ms on a loaded machine — and passed on the immediate rerun at `301 pass`, `0 fail`. The
fact and the instruction to rerun once are recorded in section 11 rather than only here.

**No prescribed code changed** other than the destructuring's line breaks. The review's in-memory
run of the 13 test bodies and 11 mutations agrees with the planner's on-disk run.
