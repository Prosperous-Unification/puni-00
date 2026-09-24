# 050.7 f2 — the four remaining delivery call sites, read at the moment of use

|             |                                                                                                                                                                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **tenth packet**                                                                                                                                                                                    |
| Size class  | L — five slices, each one executor attempt                                                                                                                                                                                                                                                     |
| Predecessor | [050.7f1](050-7-f1-theme-hook-model.md) — the theme hook's state machine, `PreferenceStoreLifecycleError`, `readRefusingBrowserStorage`/`writeRefusingBrowserStorage`, and the delivery-degradation requirement this change already carries                                                    |
| Closes      | The scope section 3 of the [held 050.7f record](050-7-f-delivery-call-sites.md) left over: the settings modal, the project page, `gantt-detail` through `WbsTable`, and the module-scope `storedMermaidSectionMode` behind `lib/remembered.ts` — then deletes the module-load duplicate itself |
| Revision    | Second. Round 1 said READY AFTER FIXES; section 16 disposes of its five findings.                                                                                                                                                                                                              |
| Schema      | OpenSpec change `adopt-frontend-lifetimes`, already `sdd-lean`. One new requirement; task 3 gets a dated note and **stays unchecked** for the wiki index alone (section 13, assumption 1).                                                                                                     |

## 1. Goal, non-goals, and the cut

**Goal.** Move the last four delivery call sites off `apps/wbs/fe-01/src/modules/preferences/composition.ts`
onto the page runtime's own preferences, delete that module-load duplicate and its two tests, and
record each site's lifecycle behaviour as a state machine whose every transition is a named test with
an independent mutation — and, for the one site that holds a handle for the life of the page, a
model-based test with rehearsed sabotages.

**Non-goals.**

- `lib/theme.ts`. Packet f1 moved it; this packet only reads it as the precedent.
- The preferences module's `module-index` block. Its README says adopting one is its own packet (the
  `docs/wiki-policy` registration lands with it). Task 3 of the change names that index, so task 3
  stays unchecked for it and for nothing else.
- The K2 debt on the public `preferences` resource. `lib/remembered.ts` still needs the generic
  factory for per-project layout keys; OpenSpec task 12 decides whether that resource moves behind a
  feature of its own. This packet **updates** the debt note in `contract.ts` to name the new caller
  shape and does not remove it — the export is still there, so removing the note would hide the debt.
- Any change to `lifetime-slot.ts`, `application-runtime.ts` or `application-bootstrap.tsx`.
  `application-services-context.tsx` gains one exported hook (slice 1) and nothing else changes in it.
- Any rendering of "not being remembered". Every site now reports it in its own return type
  (section 3.5); which reader-visible copy, if any, shows it is a chrome decision with its own copy
  and accessibility question, exactly as f1 left `Theme.persists`.

**The cut, and why five slices rather than three or four.** Measured, not assumed (section 4.2):

1. The settings modal is mounted inside every `WbsTable` toolbar, so the first site that reads a
   runtime through a React hook needs an `ApplicationServicesProvider` above **every** test that
   renders a table. A probe that only made the three component sites call
   `useApplicationServicesState()` failed **20** files of the default tier — 19 on
   `useApplicationServicesState must be read below ApplicationServicesProvider` itself and one on the
   fault boundary that caught it. So slice 1 lands the
   provider-and-runtime fixture in those files **before** any site moves, on unchanged production
   code, where it is provably behaviour-neutral (1204 tests before, 1204 after).
2. The modal and the page read and write only when something happens — a click, a list load landing
   — and render nothing derived from the store. `gantt-detail` keeps an answer on screen, like the
   theme. They are two different state machines (sections 3.2 and 3.3), so they are two slices.
3. `lib/remembered.ts` serves `remembered-layout.ts`, whose browser-wide `storedMermaidSectionMode`
   is a module-scope handle built before any runtime exists and kept for the life of the page. That
   is the one handle with a lifetime of its own, so it gets the model-based test (section 3.4).
4. Deleting the duplicate is last, when nothing imports it: the typecheck is the importer check.

## 2. Read first

| File                                                                                       | Why                                                                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, `LLM_README.md`                                                               | Rules R1–R5 and the routing index.                                                                                 |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                      | "Execution contract", "Standard blocks every packet uses" — the strict OpenSpec block and the mutation-patch form. |
| `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`, sections 3 and 8 | The machine the continuous consumer here repeats, and the proof discipline this packet keeps.                      |
| `apps/wbs/fe-01/src/lib/theme.ts`                                                          | The precedent: `useTheme`'s superseded guard, resync effect and `persists`.                                        |
| `apps/wbs/fe-01/src/runtime/application-services-context.tsx`                              | `useApplicationServicesState`, and the gap its type's JSDoc leaves open, which slice 1's reader closes.            |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`                                              | Withdrawal is synchronous and notification is a microtask; `snapshot()` is the slot's state right now.             |
| `apps/wbs/fe-01/src/runtime/application-runtime.ts`                                        | `ApplicationServices.preferences` — "carried here for `src/lib/remembered.ts` alone".                              |
| `apps/wbs/fe-01/src/modules/preferences/contract.ts`                                       | `Remembered`, `RememberedPreferences`, `PreferencesExports` and its K2 debt note, `PreferenceStoreLifecycleError`. |
| `apps/wbs/fe-01/src/modules/preferences/fake-browser-storage.ts`                           | `fakeBrowserStorage`, `writeRefusingBrowserStorage` — the stores every new test installs a runtime over.           |
| `apps/wbs/fe-01/src/lib/theme.model.test.tsx`                                              | The shape of the model test in slice 4: reference model, own byte oracle, scheduler, controlled expiry.            |
| `apps/wbs/fe-01/project.json`, `vitest.node-suites.ts`, `src/test-tiers.test.ts`           | Target names; the node tier list slice 5 edits and the check that keeps it honest.                                 |

## 3. Design: the state machines

This section is the record lesson 16 of the batch addendum asks for. After slice 4 the handle's part
of it is also JSDoc on `storedMermaidSectionMode` and `remembered()`, and
`remembered-layout.model.test.ts` executes it; `gantt-detail.ts`'s own JSDoc carries section 3.3.

### 3.1 One change of mechanism since f1: read the runtime at the moment of use

f1's `useTheme` holds a store built from the render's `remembered` and so has to catch the lifecycle
refusal a withdrawn store raises, and to compare its closured store against a ref to tell a superseded
chooser from a current one. The context's own JSDoc names the remaining gap: "a reference already
captured before that commit can still read and write successfully until the runtime's own disposal
actually revokes its store".

This packet adds one hook, `useApplicationServicesReader()`, which returns a stable function that
answers `applicationServicesStateFor(slot)` **at the instant it is called**. A handler, an effect or
an asynchronous continuation that calls it immediately before an access reaches the runtime that is
live at that access, or learns that none is. Because `lifetime-slot.ts` publishes a runtime only while
its store is unrevoked and its `isLive` answers `true`, and because every guard these sites pass the
store is a pure function that cannot re-enter the slot mid-access, an access made through the runtime
the reader just returned as `live` cannot meet a lifecycle refusal — so the three component sites need
**no** `catch` at all, and `lib/remembered.ts` gets the same property by reading `slot.snapshot()`
itself.
Every site still lets an ordinary storage failure through by identity, and each of those is a named
test with its own mutation.

### 3.2 The event-time consumers: the settings modal and the project page

Neither renders anything derived from the store, and neither re-renders when the slot moves (they call
only the reader, never `useApplicationServicesState`). The machine is over **what a callback reaches
when it runs**.

| State              | What a read answers                                                     | What a write does                                  |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------- |
| **no runtime yet** | the site's documented default, `persists: false`; nothing is read       | nothing anywhere; answers `false`; nothing throws  |
| **live R**         | R's stored answer (the modal drops a refused section), `persists: true` | writes into R first, then shows the answer; `true` |
| **withdrawn**      | as _no runtime yet_                                                     | as _no runtime yet_                                |
| **replaced by S**  | S's stored answer — never R's                                           | writes into S — never R                            |

Events: a render; a handler (open, choose a section, pick or create a project); an asynchronous
continuation (a list load or a create landing); a slot transition, whose notification this site never
listens to.

Invariants:

- **E1.** Every access resolves the runtime at the instant of the access, through the reader.
- **E2.** With no runtime live, nothing is read, dropped or written anywhere — not the page's own
  `localStorage` either — nothing throws, and the typed result says `persists: false`.
- **E3.** A callback bound under R that runs after S replaced R reaches S only. (For these two sites
  that is correct rather than superseded: the answer is what somebody chose at that instant, and the
  store it belongs in is the one live then. f1's no-op rule is for a site that keeps a store-derived
  answer on screen, section 3.3, and the new requirement says in so many words that such a site may
  make no access at all.)
- **E4.** A live store's own failure propagates by identity, and because the write happens before the
  state change, nothing is shown that the store did not keep.

### 3.3 The continuous consumer: `gantt-detail`

`useGanttDetail` keeps the detail switch's answer on screen for as long as the chart is open, exactly
as `useTheme` keeps the palette, so it satisfies the existing requirement "A delivery consumer of
preferences degrades visibly when withdrawn" in full — reset on withdrawal, adopt on replacement,
superseded chooser changes nothing — with the call-time reader in place of f1's catch and ref.

| State          | `shown`                                                                     | `persists` |
| -------------- | --------------------------------------------------------------------------- | ---------- |
| **no runtime** | the never-said default (`hasDependencyEdges`); `ask` still changes it       | `false`    |
| **live R**     | R's answer (refused reads as off); `ask` writes into R first, then shows it | `true`     |
| **withdrawn**  | back to the never-said default, without waiting for disposal                | `false`    |
| **replaced**   | S's own answer, with S's refused and retired keys dropped                   | `true`     |

Events: render (the lazy initialiser reads the render's runtime, writing nothing); `ask`; the slot's
notification, which re-renders; the resync effect, which runs after every layout effect of its commit.

Invariants:

- **C1.** `shown` and `persists` are functions of the model: which runtime is published, what its store
  holds, and what was asked since.
- **C2.** An `ask` whose render read runtime R, called while a different runtime S is live, changes
  nothing at all. An `ask` called after R was withdrawn but before the re-render changes the marks,
  writes nothing and reports `persists: false` — the spec's own "withdrawn between renders" scenario.
- **C3.** The resync effect reads the runtime **now**: a sibling's layout effect that retires the slot
  between this hook's render and its effect yields the withdrawn state, never a throw.
- **C4.** A live store's own write failure propagates by identity with `shown`, `persists` and the
  bytes unchanged.

### 3.4 The layout handle: `remembered()` and `storedMermaidSectionMode`

`remembered(key, isValid, slot = applicationSlot)` returns a `RuntimeRemembered<T>` whose three
members each read `slot.snapshot()` first and reach `state.services.preferences.json(key, isValid)`
only while it is `live`. `remembered-layout.ts` keeps `storedMermaidSectionMode` at module scope,
unchanged in spelling: it is built while the slot is still `empty` and must keep working through every
later transition.

States — the slot's own, as this handle sees them: **empty** (never published, or retired and
disposed); **constructing** (a replacement's factory is running: partially acquired); **live A / live
B / live denied**; **retiring** (withdrawn, disposal still running or held); **fatal** (a disposal
outran its budget; terminal).

Events: an access (`readAndDrop`, `write`); `replace(target, disposal)`; `retire`; the slot's
notification, delivered when the scheduler says; a disposal completing, when the scheduler says; a
disposal outrunning its budget (a real `DiBagCloseCancelledError` out of DI Bag's own bounded close); a
hand edit of one store's bytes.

Invariants, each asserted by the model test after every command:

- **H1.** An access while the slot is live X reads and writes X's store only; in every other state it
  touches no store — the page's own `localStorage` included — and answers `{ value: null, persists:
false }` or `false`.
- **H2.** The handle holds no store: a handle built before any runtime existed follows every later
  replacement, and never reaches a withdrawn, retiring, constructing or fatal runtime.
- **H3.** A value the live store holds that is no longer a mode is dropped from that store and read as
  `null`; nothing is dropped anywhere else.
- **H4.** A live store's own write failure propagates by identity with every store's bytes unchanged.
- **H5.** Every transition refuses exactly when the model says it must, and for the reason it says —
  a budget expiry is DI Bag's own class with `reason: 'timeout'` and a retained `cleanupPromise` — and
  teardown suppresses only refusals already verified by identity.

The interleavings the commands generate, each counted and asserted non-zero over the pinned run: an
access with nothing live; an access after a replacement; an access **while acquiring** (from inside the
replacement's factory); an access **while retiring** with the disposal held open; an access **from
inside the slot's notification**, delivered by the scheduler before or after the old runtime finished
letting go; a hand-edited value that must be dropped; a write into a store that refuses writes; a
disposal that outruns its budget, making the slot fatal.

### 3.5 Why a typed result, and not a throw or a default

With no runtime live, a layout read that threw would reach `AppFaultBoundary` for an ordinary lifecycle
tick, which that boundary's own JSDoc says it cannot heal; a read that answered the default silently
would be a default nobody can tell from a stored one. So every site's own result type carries the
answer to "is this being remembered": `Recalled<T> = { value, persists }` for reads (`lib/remembered.ts`),
`boolean` for writes, `GanttDetail.persists` for the switch. Every layout reader in
`remembered-layout.ts` now returns `Recalled<…>`, and its five callers read `.value` — the same shape
f1 chose for `Theme.persists`, and, like it, no consumer renders it yet (section 1).

### 3.6 What this packet does not claim

- The model does not re-explore `lifetime-slot.ts`'s own fencing of overtaking transitions; its own
  model test does. At most one transition is in flight per command here.
- The per-project layout stores (`storedExpansion`, `storedGanttHeight`, …) share `remembered()` with
  the Mermaid handle and so share its proof, but only the Mermaid key is driven by the model; the
  per-project keys are exercised through the existing `WbsTable` suites over the fixture's live runtime,
  and slice 4's fixture sabotage proves those suites really go through that runtime.
- The coverage assertions prove the pinned run reached each interleaving; they do not prove the space
  is exhausted.
- In production today the React tree is unmounted before the page's runtime is retired
  (`application-bootstrap.tsx`'s `onPageHide`), so the no-runtime rows above are reached in production
  only through a future replacement while mounted. They are modelled because they are reachable in
  every test and in the next lifetimes, not because a reader hits them today.

## 4. Verified facts

Every number is a **fresh observation from this packet's own rehearsal**, on `bff2b0af` (main
`0ad6f109` plus f1's three slices), on 2026-09-24. None is a stop condition: each slice records its own
baseline in step 0 and compares relatively. The dispatch base is later than the rehearsal base; the
Dispatch block and section 9.1 say what that changes and what was re-checked on it.

### 4.1 The code as it stands

| Fact                                                                                                                                                                                                 | Where                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| four production files import the composition: `project-settings-modal.tsx:13`, `project-page.tsx:19`, `gantt-detail.ts:3` (`rememberedPreferences`) and `lib/remembered.ts:1` (`browserPreferences`) | `git grep -n "preferences/composition" -- apps/wbs/fe-01/src`                      |
| the modal builds its handle per call, `project-settings-modal.tsx:76-77`; the page binds one at module scope, `project-page.tsx:94`; `gantt-detail.ts:39` binds `storedDetail` at module scope       | read                                                                               |
| `remembered-layout.ts:247` builds `storedMermaidSectionMode` at module scope; `:276` reads it (`readAndDrop`), `:287` writes it; every other layout store is built per call through `remembered()`   | read                                                                               |
| `lib/remembered.ts`'s `rememberedText` has **no** caller anywhere                                                                                                                                    | `git grep -n rememberedText -- apps/wbs/fe-01/src` prints only its own definition  |
| the composition's two tests test nothing but the composition: `composition.test.ts` (1 test, node tier, `vitest.node-suites.ts:71`) and `composition-agreement.test.ts` (1 test, jsdom tier)         | read                                                                               |
| `ApplicationServices.preferences` is the resource "carried here for `src/lib/remembered.ts` alone and **never for a React context**"                                                                 | `runtime/application-runtime.ts:24`, `:33`                                         |
| `useApplicationServicesState` is the only reader of the context, and its type's JSDoc says a captured reference's gap "is not closed here"                                                           | `runtime/application-services-context.tsx:68`, `:123`                              |
| `onPageHide` unmounts the React root before it starts the retirement                                                                                                                                 | `runtime/application-bootstrap.tsx:320-321`                                        |
| the bootstrap's slot defaults to `applicationSlot` and it renders `<App/>` below `ApplicationServicesProvider` over that slot, so the reader, the state hook and `lib/remembered.ts` read one slot   | `runtime/application-bootstrap.tsx:46`, `:270`; `main.tsx:11` passes no slot       |
| React **19.2.8**: an error thrown by a click handler is **not** rethrown by Testing Library's `fireEvent`; jsdom reports it as a window `error` event carrying the very object thrown                | probed with a throwing button; the handler's error arrived by identity on `window` |
| the installed `fast-check` is **4.9.0** (`bun.lock`, `node_modules/fast-check/package.json`)                                                                                                         | step 0 checks it; the model test asserts `fc.__version`                            |
| `react-hooks/rules-of-hooks` and `react/display-name` are enforced on test files; `@typescript-eslint/no-dynamic-delete` refuses `delete record[key]`                                                | each refused a first draft of this packet's tests during rehearsal                 |

### 4.2 The measured blast radius

Two probes on `bff2b0af`, each one edit, each a full run of the default jsdom tier (`TZ=UTC bunx vitest
run`), then reverted:

| Probe                                                                                 | Files failing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A: the modal, the page and `useGanttDetail` each call `useApplicationServicesState()` | **20** of the default tier (1069 of 3008 tests): 19 on `useApplicationServicesState must be read below ApplicationServicesProvider` itself, and `app-router` on the fault boundary that caught it — `app-router`, `page-shortcuts`, `gantt-panel`, `optimization-integration`, `plan-cards`, `plan-cells`, `plan-chart-seam`, `plan-dependencies`, `plan-estimates`, `plan-filter`, `plan-keyboard`, `plan-layout`, `plan-read-and-write`, `plan-row-dependencies`, `plan-row-render-cost`, `plan-structure`, `plan-table`, `plan-toolbar`, `project-page`, `project-settings-modal` |
| B: `lib/remembered.ts`'s stores throw unless `applicationSlot` is `live`              | the same set less `project-settings-modal`: 19 files, 926 tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Plus `gantt-panel.zoned.test.tsx`, which the zoned config runs and renders `<GanttPanel>` once. That is
the **twenty-one** files slice 1 adopts the fixture in — twenty in the default config and one in the
zoned one. `app.test.tsx` and `account-menu.test.tsx` already render below a provider of their own
(packet f1) and are not touched.

**The fixture, not twenty-one ad hoc edits.** `src/testing/live-application.tsx` exports
`publishApplicationRuntimeForEachTest()` — `beforeEach` awaits `applicationSlot.replace(acquireApplicationRuntime)`,
`afterEach` runs React's `cleanup()` first and awaits `applicationSlot.retire()` in a `finally` — and a
`render` that is Testing Library's own with `ApplicationServicesProvider` as its `wrapper`. Each file
changes one import (`render` moves from `@testing-library/react` to the fixture) and gains one line.
The production slot and the production acquisition over the real `localStorage` mean every existing
assertion on stored bytes keeps meaning what it meant; a file that needs its own slot renders its own
provider inside the fixture's, and the nearer one wins.

### 4.3 Planner observations on the base, not stop conditions

- The twenty adopted default-tier files, **serially** (`--no-file-parallelism --maxWorkers=1`, as the
  project's own `test` target runs): 20 files, 1204 tests, exit 0, 5 min 37 s. The same set with
  parallel workers on this loaded host failed `plan-chart-seam.test.tsx`'s pointer tests on
  `Test timed out in 5000ms` although that file passes alone (24 s, 23 tests, twice). That is why every
  multi-file run in this packet is serial.
- Preferences suite (`src/modules/preferences`, default config): 6 files, 41 tests. Sandbox node
  suite (the README's command): 46 files, 675 tests. Strict OpenSpec: `{"items":114,"passed":114,"failed":0}`.
- `wbs-fe-01:test`: UTC 132 files, 3008 tests; Auckland zoned 2 files, 3 tests.
  `wbs-fe-01:test:unit`: 48 files, 698 tests.
- **Not this packet's, recorded for the planner:** a parallel full run on this host failed f1's
  `theme.model.test.tsx` once — `Property failed after 271 tests`, `teardown retire refused … DiBagCloseCancelledError:
DI_BAG_CLOSE_TIMEOUT: Bag close timed out after 5ms` on a runtime whose disposal settles. Its 5 ms
  budget is too tight on a loaded host. The model test this packet adds uses 40 ms for that reason.

## 5. File plan

| File (under `apps/wbs/fe-01/` unless it starts with `openspec/`)                                 | Slice | Create/modify | Responsibility                                                                                |
| ------------------------------------------------------------------------------------------------ | ----- | ------------- | --------------------------------------------------------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`               | 1,2,4 | modify        | the new requirement, then one scenario per slice, each **before** that slice's implementation |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                                            | all   | modify        | one fresh entry per slice, appended                                                           |
| `src/runtime/application-services-context.test.tsx`                                              | 1     | modify        | four examples of the call-time reader                                                         |
| `src/runtime/application-services-context.tsx`                                                   | 1     | modify        | `useApplicationServicesReader`                                                                |
| `src/testing/live-application.tsx`                                                               | 1     | **create**    | the fixture                                                                                   |
| the twenty-one test files of section 4.2                                                         | 1     | modify        | adopt the fixture — one import and one call each                                              |
| `src/components/wbs/project-settings-modal.test.tsx`                                             | 2     | modify        | the five transition examples; **one named assertion edit** (section 6, slice 2 step 3)        |
| `src/components/wbs/project-page.test.tsx`                                                       | 2     | modify        | the five transition examples                                                                  |
| `src/lib/remembered.ts`                                                                          | 2, 4  | modify        | `Recalled<T>` (slice 2); the call-time `remembered()` and `RuntimeRemembered<T>` (slice 4)    |
| `src/components/wbs/project-settings-modal.tsx`                                                  | 2     | modify        | reads and writes through the reader, write before state                                       |
| `src/components/wbs/project-page.tsx`                                                            | 2     | modify        | `recallLastProject` / `rememberLastProject` over the reader                                   |
| `src/components/wbs/gantt-detail.test.tsx`                                                       | 3     | **create**    | the seven transition examples                                                                 |
| `src/components/wbs/gantt-detail.ts`                                                             | 3     | modify        | the continuous consumer of section 3.3                                                        |
| `src/components/wbs/remembered-layout.model.test.ts`                                             | 4     | **create**    | section 3.4, executed against a reference model                                               |
| `src/components/wbs/remembered-layout.ts`                                                        | 4     | modify        | typed `Recalled`/`boolean` results; the handle's JSDoc                                        |
| `src/components/wbs/use-column-set.ts`, `use-plan-filter.ts`, `use-plan-layout.tsx`              | 4     | modify        | read `.value`                                                                                 |
| `src/modules/preferences/composition.ts`, `composition.test.ts`, `composition-agreement.test.ts` | 5     | **delete**    | the duplicate and the two tests of it                                                         |
| `vitest.node-suites.ts`                                                                          | 5     | modify        | drop the deleted node suite                                                                   |
| `src/modules/preferences/README.md`, `src/modules/preferences/contract.ts`                       | 5     | modify        | say there is one instance; update — not remove — the K2 debt note                             |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                                             | 5     | modify        | task 3's dated note; the box stays unchecked                                                  |

Nothing else. In particular no `project.json`, no `bun.lock`, no `package.json`, no module README
`module-index` block, no `wbs-table.tsx` or `plan-toolbar.tsx` (their writes now return a `boolean` they
do not read, and nothing about them changes).

### Why the slices are cut where they are

A test file that calls a changed signature stops compiling the moment the production file changes, and
the commit hook lints test files under `strictTypeChecked`: so, as in f1, each slice lands its tests and
the implementation that makes them type-check together, with the tests applied **first** and a real red
observed in between. Slice 1's red is a compiler error plus four runtime failures; slices 2, 3 and 4 have
both a compiler and a behavioural red; slice 5's red is the test-tier check refusing a node suite that no
longer exists.

## 6. Slices

Each slice is one executor attempt and ends at a checkpoint: the executor stops and reports, and the
planner reviews and commits before the next slice is dispatched. Every block below is real `sh`, run
from the repository root unless it says `cd`.

### Step 0 — at the start of **every** slice

**0a. The starting state.**

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
test -f node_modules/fast-check/package.json
version=$(bun -e 'console.log(JSON.parse(await Bun.file("node_modules/fast-check/package.json").text()).version)')
echo "fast-check=$version" | tee "$TMPDIR/evidence/fast-check.txt"
test "$version" = 4.9.0
```

Expected: `base=` a 40-character hash equal to the slice note's, an **empty** `status-before.txt`, and
`fast-check=4.9.0`.

**0b. Two helpers and the patches**, written into `$TMPDIR` so that every later block — each its own
shell — can use them.

````sh
set -euo pipefail
cat > "$TMPDIR/run-check.sh" <<'EOF'
#!/usr/bin/env bash
# Runs one check into $TMPDIR/evidence/<name>.log, appends its own exit status,
# and prints the summary lines. Never fails itself: the status line is the result.
# The summary is orientation only: `tsc --build` under Nx without a TTY prints no
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
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-f2-delivery-call-sites.md
test -f "$packet"
mkdir -p "$TMPDIR/patches" "$TMPDIR/mutations"
# Section 7's fenced diffs, in document order, as 01.diff … 22.diff.
awk -v out="$TMPDIR/patches" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$TMPDIR/patches" -name '*.diff' | wc -l)
echo "patches=$count"
test "$count" -eq 22
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
test "$count" -eq 33
# The twenty default-tier files the fixture is adopted in (section 4.2), relative
# to apps/wbs/fe-01, for every slice's serial "adopted" run.
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

Expected: `patches=22` and `mutations=33`, exit 0, and `adopted.txt` holding twenty paths. **Applying section 7.N** below always means exactly
this, never a hand edit:

```sh
set -euo pipefail
git apply --check "$TMPDIR/patches/NN.diff"
git apply "$TMPDIR/patches/NN.diff"
```

`--check` and the apply are separate commands on purpose: joined with `&&` under `set -e`, a failed
check would not stop the shell (section 9.1 records the rehearsal of that). `git apply` without `--index`
writes only the working tree, which the read-only `.git` allows — rehearsed with `.git` made read-only.

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
what the slice itself adds or removes, never an absolute. Rehearsed values are given beside each
expectation for orientation only.

In the sandbox the executor never runs `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e` or `tool-devsync:test`; section 9.4 gives each to the planner with its expected
relative delta.

### Slice 1 — the call-time reader, and the fixture in the twenty-one files

Owns (26 paths): `spec.md`, `verify.md`, `src/runtime/application-services-context.tsx`,
`src/runtime/application-services-context.test.tsx`, `src/testing/live-application.tsx` (new), and the
twenty-one test files of section 4.2.

- [ ] 1. Step 0, then this slice's own baselines:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  # shellcheck disable=SC2046 # the list is twenty fixed paths without spaces
  bash "$TMPDIR/run-check.sh" s1-base-adopted env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")
  bash "$TMPDIR/run-check.sh" s1-base-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts
  bash "$TMPDIR/run-check.sh" s1-base-context env TZ=UTC bunx vitest run \
    src/runtime/application-services-context.test.tsx
  ```

  Expected: `status=0` for all three. Rehearsed: adopted 20 files, 1204 tests (5 min 37 s — the run
  outlives a tool wait; poll the log, it is still running); zoned 2 files, 3 tests; context 12 tests.

- [ ] 2. **The contract first (R4).** Apply section 7.1 and rerun the strict block. Expected: exit 0,
      `passed` equal to step 0's number (items are counted per document, not per requirement).
- [ ] 3. Apply section 7.2, the four reader examples, with the context itself unchanged. **Red
      checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s1-red-vitest env TZ=UTC bunx vitest run \
    src/runtime/application-services-context.test.tsx
  bash "$TMPDIR/expect-status.sh" s1-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s1-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1` with one diagnostic,

  ```text
  apps/wbs/fe-01/src/runtime/application-services-context.test.tsx:17:3 - error TS2724: '"./application-services-context"' has no exported member named 'useApplicationServicesReader'. Did you mean 'useApplicationServicesState'?
  ```

  and Vitest `status=1`, `Tests 4 failed | 12 passed (16)`. Three of the new examples fail on
  `TypeError: useApplicationServicesReader is not a function`. The fourth, `refuses to read below no
provider, naming itself`, fails on
  `AssertionError: expected '(0 , __vite_ssr_import_5__.useApplica…' to be 'useApplicationServicesReader must be …'`:
  the file's existing `safely()` helper catches that same `TypeError` and returns its message as
  `threw`, so the assertion sees the wrong message instead of a throw. Both shapes are the expected red.

- [ ] 4. Apply sections 7.3 (the reader), 7.4 (the fixture, a new file) and 7.5 (the twenty-one
      adoptions, one multi-file patch).
- [ ] 5. **Green checkpoint.** Rerun step 1's three commands and the red checkpoint's two, into
      `s1-green-*` logs. Expected `status=0` everywhere: typecheck clean; context = step 1's number
      **+ 4** (rehearsed 12 → 16); adopted and zoned **unchanged** (rehearsed 1204 and 3) — the fixture
      is behaviour-neutral while no site has moved.
- [ ] 6. Durable lint, from the repository root:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-lint env NX_DAEMON=false bunx nx run wbs-fe-01:lint
  bash "$TMPDIR/expect-status.sh" s1-lint 0
  ```

  An autofixable import-order or Prettier finding is fixed with `bunx eslint --fix <file>`, not
  reported as a stop (preamble rule 17).

- [ ] 7. The three proofs of section 8.1, with section 8's procedure. All three faults are in
      `application-services-context.tsx`; run all three before writing any `Proof:` comment, then add
      the three comments at the sites section 8.1 names.
- [ ] 8. Rerun the preferences suite and the sandbox node suite (step 0c's commands, `s1-final-*` logs).
      Expected: both unchanged from step 0.
- [ ] 9. Append this slice's own entry to `verify.md` (the shape is at the end of this section), then
      owned-file Prettier over all twenty-six paths, `--write` then `--check`, then rerun the strict
      OpenSpec block — **after** the evidence edit, so the document it just changed is what was checked.
- [ ] 10. Hand over:

  ```sh
  set -euo pipefail
  git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-after.txt"
  ```

  Expected: exactly the twenty-six owned paths — twenty-five as ` M` and
  `?? apps/wbs/fe-01/src/testing/live-application.tsx` — and nothing else. Step 0 required an empty
  status, so every line is one this slice put there.

Planner commit subject: `test(frontend): publish the page runtime to every table suite`.

### Slice 2 — the settings modal and the project page, read at the moment of use

Owns (7 paths): `spec.md`, `verify.md`, `src/components/wbs/project-settings-modal.test.tsx`,
`src/components/wbs/project-page.test.tsx`, `src/lib/remembered.ts`,
`src/components/wbs/project-settings-modal.tsx`, `src/components/wbs/project-page.tsx`.

- [ ] 1. Step 0, then this slice's own baselines — each file alone, plus the router file that renders
      the page:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s2-base-modal env TZ=UTC bunx vitest run \
    src/components/wbs/project-settings-modal.test.tsx
  bash "$TMPDIR/run-check.sh" s2-base-page env TZ=UTC bunx vitest run \
    src/components/wbs/project-page.test.tsx
  bash "$TMPDIR/run-check.sh" s2-base-router env TZ=UTC bunx vitest run src/app-router.test.tsx
  ```

  Expected `status=0` for all three. Rehearsed: 15, 67 and 5 tests.

- [ ] 2. **The contract first.** Apply section 7.6 (the scenario for "nothing live") and rerun the
      strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply sections 7.7 and 7.8, the two test files. Section 7.7 contains the **one existing
      assertion this packet edits**, named here so it is not mistaken for drift:
      `it('reads an absent key as the first section', …)` asserted
      `rememberedSettingsSection('nobody')` `toBe('teams')` and now asserts
      `rememberedSettingsSection(applicationServicesStateFor(applicationSlot), 'nobody')`
      `toEqual({ value: 'teams', persists: true })` — the same answer, over the runtime the fixture
      publishes, with the new "is it remembered" half. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s2-red-vitest env TZ=UTC bunx vitest run \
    src/components/wbs/project-settings-modal.test.tsx src/components/wbs/project-page.test.tsx
  bash "$TMPDIR/expect-status.sh" s2-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s2-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `Found 5 errors in 2 files.` — `project-page.test.tsx:38`
  two `TS2305` (`recallLastProject`, `rememberLastProject` not exported) and
  `project-settings-modal.test.tsx:427`, `:486` `TS2554: Expected 1 arguments, but got 2.` and `:507`
  `TS2554: Expected 2 arguments, but got 3.`; Vitest `Test Files 2 failed (2)`,
  `Tests 11 failed | 81 passed (92)` — the ten new examples and the edited one:

  | Failing test                                                                       | Observed message                                                      | Why, on the unchanged code                                      |
  | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
  | modal › `reads an absent key as the first section`                                 | `expected 'teams' to deeply equal { value: 'teams', persists: true }` | the old function returns a bare section                         |
  | modal › `opens on the first section and remembers nothing when no runtime is live` | `expected 'priorities' to be null`                                    | the old modal writes the page's own `localStorage`              |
  | modal › `stops remembering once its runtime is withdrawn, and never throws`        | `expected undefined to be false`                                      | the old write function answers nothing                          |
  | modal › `reopens on a replacement runtime’s own remembered section`                | `toHaveAttribute("aria-selected", "true")`                            | the old modal reads `localStorage`, not the replacement's store |
  | modal › `writes a section chosen after a replacement into the replacement, …`      | `expected undefined to be 'steps'`                                    | likewise, on the write side                                     |
  | modal › `lets a store’s own write failure through by identity, …`                  | `expected [] to have a length of 1 but got +0`                        | the refusing store is never reached                             |
  | page › `restores nothing and remembers nothing when no runtime is live`            | `expected 'p2' to be null`                                            | the old page writes the page's own `localStorage`               |
  | page › `stops remembering once its runtime is withdrawn, and never throws`         | `expected '' to be 'Paint the fence'`                                 | the old page never reads the runtime's store it was published   |
  | page › `restores the replacement runtime’s own project when a list load lands …`   | `expected '' to be 'Paint the fence'`                                 | likewise                                                        |
  | page › `writes a project chosen after a replacement into the replacement, …`       | `expected undefined to be 'p2'`                                       | the old page writes `localStorage`                              |
  | page › `lets a store’s own write failure through by identity, …`                   | `expected [] to have a length of 1 but got +0`                        | the refusing store is never reached                             |

- [ ] 4. Apply sections 7.9 (`Recalled<T>` in `lib/remembered.ts`), 7.10 (the modal) and 7.11 (the
      page).
- [ ] 5. **Green checkpoint.** Rerun step 3's two checks and step 1's router run into `s2-green-*` logs,
      and slice 1's adopted-set command (`--no-file-parallelism --maxWorkers=1 $(cat "$TMPDIR/adopted.txt")`,
      from `apps/wbs/fe-01`) into `s2-green-adopted`. Expected `status=0`
      everywhere: typecheck clean; the two files at step 1's numbers **+ 10** together (rehearsed
      82 → 92); router unchanged (5); adopted = its slice-1 green number **+ 10** (rehearsed
      1204 → 1214), because both files are in that set.
- [ ] 6. Durable lint (slice 1 step 6's form, `s2-lint`), expected `status=0`.
- [ ] 7. The twelve proofs of section 8.2 — six on the modal, six on the page — with section 8's
      procedure. Every fault is observed first; the `Proof:` comments are added afterwards, at the sites
      section 8.2 names.
- [ ] 8. Rerun the preferences and sandbox suites: unchanged from step 0.
- [ ] 9. `verify.md` entry, owned-file Prettier over the seven paths (`--write`, `--check`), then the
      strict OpenSpec block, in that order.
- [ ] 10. Hand over with slice 1 step 10's command. Expected exactly the seven owned paths, all ` M`.

Planner commit subject: `feat(frontend): read the settings section and last project at the moment of use`.

### Slice 3 — the detail switch, a continuous consumer

Owns (3 paths): `verify.md`, `src/components/wbs/gantt-detail.ts`,
`src/components/wbs/gantt-detail.test.tsx` (new).

This slice changes no OpenSpec text: the existing requirement "A delivery consumer of preferences
degrades visibly when withdrawn" already states every behaviour section 3.3 gives `useGanttDetail`.

- [ ] 1. Step 0, then:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s3-base-gantt env TZ=UTC bunx vitest run \
    src/components/wbs/gantt-panel.test.tsx
  bash "$TMPDIR/run-check.sh" s3-base-zoned env TZ=Pacific/Auckland bunx vitest run \
    --config vitest.zoned.config.ts
  ```

  Expected `status=0`. Rehearsed: 242 tests; zoned 2 files, 3 tests.

- [ ] 2. Apply section 7.12, the new test file, with `gantt-detail.ts` unchanged. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s3-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s3-red-vitest env TZ=UTC bunx vitest run \
    src/components/wbs/gantt-detail.test.tsx
  bash "$TMPDIR/expect-status.sh" s3-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s3-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `Found 9 errors in the same file` — nine
  `TS2339: Property 'persists' does not exist on type 'GanttDetail'.`; Vitest `Tests 7 failed (7)`:

  | Failing test                                                                                           | Observed message                                                |
  | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
  | `opens on the never-said default and remembers nothing when no runtime is live`                        | `expected undefined to be false` (no `persists`)                |
  | `returns to the never-said default and stops remembering once withdrawn, without waiting for disposal` | `expected true to be false` (the old hook reads `localStorage`) |
  | `changes the marks and remembers nothing when asked between a withdrawal and the next render`          | `expected false to be true`                                     |
  | `adopts a replacement runtime’s own remembered answer, and drops what it refuses`                      | `expected false to be true`                                     |
  | `does not let a superseded ask change the marks or any store`                                          | `expected false to be true`                                     |
  | `lets a store’s own write failure through by identity, showing nothing it could not keep`              | `expected null to be Error: write denied`                       |
  | `settles on the withdrawn state, without throwing, when retired between its render and its effect`     | `expected undefined to be false`                                |

- [ ] 3. Apply section 7.13, `gantt-detail.ts`.
- [ ] 4. **Green checkpoint.** Rerun step 2's checks and step 1's two into `s3-green-*`, plus the
      adopted set (`s3-green-adopted`). Expected `status=0` everywhere: typecheck clean; the new file
      7 tests; `gantt-panel.test.tsx` unchanged (242); zoned unchanged (3); adopted unchanged from its
      slice-2 green number (rehearsed 1214).
- [ ] 5. Durable lint (`s3-lint`), expected `status=0`.
- [ ] 6. The eight proofs of section 8.3; comments afterwards, at the named sites.
- [ ] 7. Rerun the preferences and sandbox suites: unchanged from step 0.
- [ ] 8. `verify.md` entry, owned-file Prettier over the three paths, the strict OpenSpec block.
- [ ] 9. Hand over. Expected exactly ` M` for `verify.md` and `gantt-detail.ts`, and
      `?? apps/wbs/fe-01/src/components/wbs/gantt-detail.test.tsx`.

Planner commit subject: `feat(frontend): follow the page runtime in the chart's detail switch`.

### Slice 4 — the layout handle, its model test, and the layout's typed results

Owns (9 paths): `spec.md`, `verify.md`, `src/components/wbs/remembered-layout.model.test.ts` (new),
`src/lib/remembered.ts`, `src/components/wbs/remembered-layout.ts`, `src/components/wbs/use-column-set.ts`,
`src/components/wbs/use-plan-filter.ts`, `src/components/wbs/use-plan-layout.tsx`, and
`src/testing/live-application.tsx` — for its `Proof:` comment only (section 8.4, fault `fx`).

- [ ] 1. Step 0, then the four layout suites that assert stored bytes, serially:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s4-base-layout env TZ=UTC bunx vitest run \
    --no-file-parallelism --maxWorkers=1 src/components/wbs/plan-layout.test.tsx \
    src/components/wbs/plan-filter.test.tsx src/components/wbs/plan-toolbar.test.tsx \
    src/components/wbs/plan-table.test.tsx
  ```

  Expected `status=0`. Rehearsed: 4 files, 218 tests.

- [ ] 2. **The contract first.** Apply section 7.14 (the layout-handle scenario) and rerun the strict
      block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.15, the model test, with `lib/remembered.ts` unchanged. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s4-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s4-red-vitest env TZ=UTC bunx vitest run \
    src/components/wbs/remembered-layout.model.test.ts
  bash "$TMPDIR/expect-status.sh" s4-red-typecheck 1
  bash "$TMPDIR/expect-status.sh" s4-red-vitest 1
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 2 errors in the same file`,

  ```text
  apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts:5:27 - error TS2305: Module '"@/lib/remembered"' has no exported member 'RuntimeRemembered'.
  apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts:627:71 - error TS2554: Expected 2 arguments, but got 3.
  ```

  and Vitest `status=1`, `Tests 1 failed (1)`:

  ```text
  Error: Property failed after 2 tests
  { seed: 20260924, path: "1:1:0", endOnFailure: true }
  Counterexample: [schedulerFor()`
  -> [task${1}] promise::dispose A resolved`,accessWhileAcquiring(A, write(outline)) /*replayPath="ADB:F"*/]
  Shrunk 2 time(s)
  Caused by: AssertionError: write(outline) while acquiring: what the handle answered: expected undefined to deeply equal false
  ```

  The unchanged `remembered()` ignores the run's slot and writes the page's own store through the
  module-load duplicate, answering nothing.

- [ ] 4. Apply sections 7.16 (`lib/remembered.ts`), 7.17 (`remembered-layout.ts`) and 7.18 (the three
      callers, one multi-file patch).
- [ ] 5. **Green checkpoint.** Rerun step 3's checks and step 1's into `s4-green-*`, plus the adopted
      set (`s4-green-adopted`) and the zoned run. Expected `status=0` everywhere: typecheck clean; the
      model test `Tests 1 passed (1)` (rehearsed in about 6 s); layout unchanged (218); adopted
      unchanged from slice 3 (1214); zoned unchanged (3).
- [ ] 6. Durable lint (`s4-lint`), expected `status=0`.
- [ ] 7. The nine proofs of section 8.4: six sabotages of `lib/remembered.ts`, two of the model test's
      own accounting, and one of the fixture. All observed first; then the nine `Proof:` comments at
      the named sites — the `fx` one in `src/testing/live-application.tsx`, which is why that file is
      in this slice's ownership, Prettier and hand-over lists.
- [ ] 8. Rerun the preferences and sandbox suites: unchanged from step 0.
- [ ] 9. `verify.md` entry — with each model fault's seed, run number and shrunk counterexample — then
      owned-file Prettier over the nine paths, then the strict OpenSpec block.
- [ ] 10. Hand over. Expected exactly eight ` M` paths (`spec.md`, `verify.md`, `lib/remembered.ts`,
      `remembered-layout.ts`, `use-column-set.ts`, `use-plan-filter.ts`, `use-plan-layout.tsx`,
      `testing/live-application.tsx`) and
      `?? apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts`.

Planner commit subject: `feat(frontend): resolve layout preferences from the page runtime at each call`.

### Slice 5 — the duplicate deleted, task 3's note, and the closing checks

Owns (8 paths): the three deleted files of section 7.19, `vitest.node-suites.ts`,
`src/modules/preferences/README.md`, `src/modules/preferences/contract.ts`, `tasks.md`, `verify.md`.

- [ ] 1. Step 0 — 0c's two suites and the OpenSpec block are this slice's baselines.
- [ ] 2. Apply section 7.19, the three deletions. This is the only deletion this packet authorises;
      `git apply` performs it, so no `rm` is typed. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s5-red-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s5-red-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  bash "$TMPDIR/expect-status.sh" s5-red-typecheck 0
  bash "$TMPDIR/expect-status.sh" s5-red-sandbox 1
  ```

  Expected, and rehearsed exactly: typecheck **exits 0** — nothing imports the deleted module any more,
  which is the importer check — and the sandbox suite `status=1`, `Test Files 1 failed | 44 passed (45)`,
  `Tests 3 failed | 671 passed (674)`, all three in `src/test-tiers.test.ts`, because
  `vitest.node-suites.ts` still lists the deleted suite:

  ```text
  FAIL  src/test-tiers.test.ts > fe-01’s test tiers > lists every DOM-free suite in the fast tier, and only those
  FAIL  src/test-tiers.test.ts > fe-01’s test tiers > partitions the suite — every file is in exactly one tier
  FAIL  src/test-tiers.test.ts > fe-01’s test tiers > names files that exist
  ```

- [ ] 3. Apply section 7.20 (`vitest.node-suites.ts`), 7.21 (the module README and `contract.ts`) and
      7.22 (`tasks.md`), then date the note by observation, never by copying a date from this packet:

  ```sh
  set -euo pipefail
  tasks=openspec/changes/adopt-frontend-lifetimes/tasks.md
  test -f "$tasks"
  test "$(grep -c '<observed-date>' "$tasks")" -eq 1
  observed=$(date -u +%F)
  sed -i "s/<observed-date>/$observed/" "$tasks"
  grep -n "observed $observed:" "$tasks"
  if grep -n '<observed-date>' "$tasks"; then echo "placeholder left" >&2; exit 1; else rc=$?; test "$rc" -eq 1; fi
  ```

  Expected: one line printed, exit 0. The box itself stays `[ ]` (section 13, assumption 1).

- [ ] 4. **Green checkpoint.**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s5-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck
  bash "$TMPDIR/run-check.sh" s5-lint env NX_DAEMON=false bunx nx run wbs-fe-01:lint
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s5-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  bash "$TMPDIR/run-check.sh" s5-green-preferences env TZ=UTC bunx vitest run src/modules/preferences
  bash "$TMPDIR/run-check.sh" s5-green-tiers env TZ=UTC bunx vitest run src/test-tiers.test.ts
  for check in s5-green-typecheck s5-lint s5-green-sandbox s5-green-preferences s5-green-tiers; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected: all `status=0`. The sandbox suite at step 0's numbers **− 1 file, − 1 test** (rehearsed
  46/675 → 45/674: `composition.test.ts` is gone); the preferences suite **− 2 files, − 2 tests**
  (rehearsed 6/41 → 4/39); the tier test 5 tests.

- [ ] 5. The one proof of section 8.5; its comment afterwards.
- [ ] 6. `verify.md` entry. Then owned-file Prettier over the five paths that still exist, and the
      repository-wide check, **after** the evidence edit:

  ```sh
  set -euo pipefail
  owned="apps/wbs/fe-01/vitest.node-suites.ts apps/wbs/fe-01/src/modules/preferences/README.md
    apps/wbs/fe-01/src/modules/preferences/contract.ts
    openspec/changes/adopt-frontend-lifetimes/tasks.md openspec/changes/adopt-frontend-lifetimes/verify.md"
  # shellcheck disable=SC2086 # five fixed paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $owned
  # shellcheck disable=SC2086
  GSETTINGS_BACKEND=memory bunx prettier --check $owned
  bash "$TMPDIR/run-check.sh" s5-format env NX_DAEMON=false bunx nx format:check --all
  bash "$TMPDIR/expect-status.sh" s5-format 0
  ```

  Expected: `status=0` and no file listed. Never a repository-wide format **write**.

- [ ] 7. The strict OpenSpec block: exit 0, `passed` equal to step 0's number.
- [ ] 8. Hand over. Expected exactly: ` D` for `composition.ts`, `composition.test.ts` and
      `composition-agreement.test.ts`; ` M` for `vitest.node-suites.ts`, the module `README.md`,
      `contract.ts`, `tasks.md` and `verify.md`; nothing else.

Planner commit subject: `refactor(preferences): delete the module-load duplicate delivery no longer reads`.

### Verification record entries

Each slice appends one entry to `openspec/changes/adopt-frontend-lifetimes/verify.md`, headed
`## Packet 050.7f2, slice N — <what the slice did>`, containing only its own observations: the attempt
id and starting hash; step 0's baselines as numbers; every command's status; the red checkpoint's own
diagnostics; the green counts; every proof of that slice with its observed message (and, for the model
faults, seed, run number and shrunk counterexample); and what stayed **pending planner verification** —
`wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`, `wbs-fe-01:e2e`, `tool-devsync:test` and the
host gate. Evidence references are basenames relative to that attempt's evidence directory, never
absolute paths. Do not read, quote or restate an earlier entry.

### Dispatch

One attempt per slice, from the reviewed packet, with no network. The base of slice 1 is main after
PR #48 — `a77c41e5` or later, which carries f1, E5 and the e2a amendment — not the rehearsal's
`bff2b0af`. `a77c41e5` rewrote `spec.md` (a new last requirement, "A document replacement starts
retirement…"), `tasks.md` (task 5 ticked and reworded) and `verify.md` (the e2a entry); sections 7.1,
7.6, 7.14 and 7.22 were re-checked against those versions on 2026-09-24 and apply cleanly, as do all
twenty-two patches and all thirty-three fault patches (section 9.1). The `index` lines in the diffs are
informational: `git apply` without `--index` or `--3way` ignores them. This block holds the only
absolute paths in this document.

```sh
# Slice 1, from the reviewed base.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-f2-delivery-call-sites 1 <reviewed-base-sha> \
  --batch batch-6 \
  --batch-dir docs/superpowers/plans/2026-09-21-batch-6 \
  --slice-note 'reviewed base <reviewed-base-sha>' \
  --preserve evidence

# Slices 2 to 5, each into the same clone once the previous slice is reviewed
# and committed; N is the slice, P the previous slice's planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-f2-delivery-call-sites N P \
  --batch batch-6 \
  --batch-dir docs/superpowers/plans/2026-09-21-batch-6 \
  --resume --require-ancestor P \
  --slice-note 'reviewed base P' \
  --preserve evidence
```

No `--seed`: no slice reads another attempt's evidence. No `--network`: nothing reaches a host.
`--slice-note` is load-bearing: it is the only channel by which the reviewed SHA reaches the executor
without passing through the clone, and step 0a reads it.

## 7. The code

Twenty-two fenced diffs, in slice order; step 0b extracts them as `01.diff` … `22.diff` in this order,
and section 9.1 records the script that applies all twenty-two to a copy of the base, with its output.
Each heading names the slice and the step that applies it.

### 7.1 `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` — slice 1, the new requirement

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 2961b112..56ded340 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -217,6 +217,28 @@ runtime's own saved answer once one is published.
 - **THEN** the retained chooser changes nothing at all, and the storage failure
   propagates unchanged with the displayed choice and the stored bytes untouched

+### Requirement: A preference used at an event reaches the runtime live at that event
+
+Delivery code that reads or writes a remembered answer from an event handler, an
+effect or an asynchronous continuation SHALL resolve the page's runtime at the
+instant of that access rather than at the render that preceded it, and SHALL
+reach no runtime other than the one live at that instant. When no runtime is
+live, the access SHALL read, drop and write nothing, SHALL NOT throw, and SHALL
+report through its own return type that the answer is not being remembered. A
+live store's own failure that is not a lifecycle refusal SHALL propagate
+unchanged, with nothing shown that the store did not keep. A consumer that
+keeps a remembered answer on screen through `useApplicationServicesState` MAY
+answer a callback bound under a runtime that has since been replaced by making
+no access at all, as the requirement on degrading visibly already states.
+
+#### Scenario: A callback kept from before a replacement reaches only the replacement
+
+- **WHEN** a handler or continuation that was bound while one runtime was live
+  runs after a later runtime has replaced it, before anything has re-rendered
+- **THEN** any access it makes reaches the replacement's own store and never the
+  replaced runtime's, and a reader kept from that earlier render answers the
+  replacement
+
 ### Requirement: Log out stays a local exit

 The Log out action SHALL send no request to the server and SHALL retire the
```

### 7.2 `apps/wbs/fe-01/src/runtime/application-services-context.test.tsx` — slice 1, the four reader examples

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-services-context.test.tsx b/apps/wbs/fe-01/src/runtime/application-services-context.test.tsx
index 9d1b911b..272d8e12 100644
--- a/apps/wbs/fe-01/src/runtime/application-services-context.test.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-services-context.test.tsx
@@ -1,5 +1,6 @@
 import { act, cleanup, renderHook } from '@testing-library/react';
 import fc from 'fast-check';
+import type { ReactNode } from 'react';
 import { afterEach, describe, expect, it } from 'vitest';

 import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';
@@ -13,6 +14,7 @@ import {
   ApplicationServicesProvider,
   type ApplicationServicesState,
   applicationServicesStateFor,
+  useApplicationServicesReader,
   useApplicationServicesState,
 } from './application-services-context';
 import { createLifetimeSlot, type LifetimeSlot, TransitionSupersededError } from './lifetime-slot';
@@ -295,6 +297,75 @@ describe('useApplicationServicesState', () => {
   );
 });

+describe('useApplicationServicesReader', () => {
+  /** The rendered state and the call-time reader, read from one render. */
+  function useRenderedAndReader() {
+    return { rendered: useApplicationServicesState(), read: useApplicationServicesReader() };
+  }
+
+  function wrapperFor(slot: LifetimeSlot<ApplicationServices>) {
+    function Wrapper({ children }: { children: ReactNode }) {
+      return <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>;
+    }
+    return Wrapper;
+  }
+
+  itDom('refuses to read below no provider, naming itself', () => {
+    const { result: hook } = renderHook(() => safely(() => useApplicationServicesReader()));
+    expect(hook.current.threw).toBe(
+      'useApplicationServicesReader must be read below ApplicationServicesProvider',
+    );
+  });
+
+  itDom(
+    'answers withdrawn the instant a retirement is accepted, while the render still says live',
+    async () => {
+      const slot = liveSlot();
+      await Promise.resolve();
+      const { result: hook } = renderHook(useRenderedAndReader, { wrapper: wrapperFor(slot) });
+      expectLive(hook.current.rendered);
+
+      const retiring = slot.retire();
+      expect(hook.current.read()).toEqual({ status: 'withdrawn' });
+      expect(hook.current.rendered.status, 'setup: React has not re-rendered yet').toBe('live');
+      await act(async () => {
+        await retiring;
+      });
+    },
+  );
+
+  itDom(
+    'a reader kept from before a replacement answers the replacement, never the runtime it was rendered under',
+    async () => {
+      const slot = liveSlot();
+      await Promise.resolve();
+      const { result: hook } = renderHook(useRenderedAndReader, { wrapper: wrapperFor(slot) });
+      const kept = hook.current.read;
+      const before = expectLive(kept()).remembered;
+
+      await act(async () => {
+        await slot.replace(() => installApplicationRuntime({ openStore: fakeBrowserStorage }));
+      });
+      const replacement = slot.snapshot();
+      if (replacement.status !== 'live') throw new Error('setup: expected live');
+      const answered = expectLive(kept()).remembered;
+      expect(answered).toBe(replacement.services.remembered);
+      expect(answered).not.toBe(before);
+    },
+  );
+
+  itDom('keeps its identity across renders of the same provider', async () => {
+    const slot = liveSlot();
+    await Promise.resolve();
+    const { result: hook, rerender } = renderHook(useRenderedAndReader, {
+      wrapper: wrapperFor(slot),
+    });
+    const first = hook.current.read;
+    rerender();
+    expect(hook.current.read).toBe(first);
+  });
+});
+
 /**
  * A generated event against one slot under interleaving. `settle` steps the
  * scheduler by exactly one pending disposal tick; `replace` and `retire` are
```

### 7.3 `apps/wbs/fe-01/src/runtime/application-services-context.tsx` — slice 1, the reader

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-services-context.tsx b/apps/wbs/fe-01/src/runtime/application-services-context.tsx
index 5ec13e9a..8ef3bb7b 100644
--- a/apps/wbs/fe-01/src/runtime/application-services-context.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-services-context.tsx
@@ -1,4 +1,11 @@
-import { createContext, type ReactNode, useContext, useRef, useSyncExternalStore } from 'react';
+import {
+  createContext,
+  type ReactNode,
+  useCallback,
+  useContext,
+  useRef,
+  useSyncExternalStore,
+} from 'react';

 import type { RememberedPreferences } from '@/modules/preferences/contract';

@@ -141,3 +148,34 @@ export function useApplicationServicesState(): ApplicationServicesState {
     return cache.current.state;
   });
 }
+
+/**
+ * Reads the page's runtime at the instant the returned function is called, not
+ * at the render that produced it.
+ *
+ * For an event handler, an effect or an asynchronous continuation that uses a
+ * remembered answer. By the time one of those runs, the slot may already have
+ * withdrawn or replaced the runtime the last render saw: `lifetime-slot.ts`
+ * withdraws publication synchronously and notifies from a microtask, so
+ * {@link useApplicationServicesState} still returns the old value until React
+ * has re-rendered. A `remembered` captured from that value can still reach a
+ * replaced runtime's store until its disposal revokes it — the gap
+ * {@link ApplicationServicesState}'s own JSDoc leaves open. The function this
+ * returns holds no `remembered` at all: every call answers exactly what
+ * {@link applicationServicesStateFor} answers for the provider's slot right
+ * then, so a caller that reads it immediately before an access reaches the
+ * runtime that is live at that access, or learns that none is.
+ *
+ * The function keeps its identity for as long as the provider's slot does, so
+ * an effect may list it as a dependency without re-running on every render.
+ *
+ * @throws only when read below no {@link ApplicationServicesProvider}, for the
+ * reason {@link useApplicationServicesState} gives.
+ */
+export function useApplicationServicesReader(): () => ApplicationServicesState {
+  const slot = useContext(ApplicationServicesContext);
+  if (slot === null) {
+    throw new Error('useApplicationServicesReader must be read below ApplicationServicesProvider');
+  }
+  return useCallback(() => applicationServicesStateFor(slot), [slot]);
+}
```

### 7.4 `apps/wbs/fe-01/src/testing/live-application.tsx` — slice 1, **new file**, the fixture

```diff
diff --git a/apps/wbs/fe-01/src/testing/live-application.tsx b/apps/wbs/fe-01/src/testing/live-application.tsx
new file mode 100644
index 00000000..7f411f9b
--- /dev/null
+++ b/apps/wbs/fe-01/src/testing/live-application.tsx
@@ -0,0 +1,61 @@
+import {
+  cleanup,
+  render as renderInTree,
+  type RenderOptions,
+  type RenderResult,
+} from '@testing-library/react';
+import type { ReactElement } from 'react';
+import { afterEach, beforeEach } from 'vitest';
+
+import { acquireApplicationRuntime, applicationSlot } from '@/runtime/application-runtime';
+import { ApplicationServicesProvider } from '@/runtime/application-services-context';
+
+/**
+ * Publishes the page's own runtime before every test of the calling file, and
+ * gives it back after that test — exactly as the page's own bootstrap does.
+ *
+ * The **production** slot and the **production** acquisition, over the
+ * browser's real store: a component under test reads its preferences from the
+ * runtime `applicationSlot` publishes (through {@link render}'s provider), and
+ * `lib/remembered.ts` resolves the same slot at every call, so a test that
+ * seeds `localStorage` and asserts on it afterwards keeps meaning what it
+ * meant before delivery moved off the module-load composition.
+ *
+ * Call it once, at the top level of a test file, before any `describe`.
+ *
+ * The acquisition is awaited, so the runtime is genuinely `live` when a test
+ * body starts. Teardown runs React's own `cleanup()` **first** — nothing may
+ * render against a runtime that is already retiring — and then awaits the
+ * retirement in a `finally`, so a cleanup that throws still gives the runtime
+ * back. A retirement that refuses is not caught: it fails the test that just
+ * ran, and the slot it leaves terminally fatal fails every later test in the
+ * file too, which is the loud answer a leaked or unclosable runtime deserves.
+ */
+export function publishApplicationRuntimeForEachTest(): void {
+  beforeEach(async () => {
+    await applicationSlot.replace(acquireApplicationRuntime);
+  });
+  afterEach(async () => {
+    try {
+      cleanup();
+    } finally {
+      await applicationSlot.retire();
+    }
+  });
+}
+
+/**
+ * Testing Library's `render`, below the page's own
+ * {@link ApplicationServicesProvider}.
+ *
+ * The provider is given no `slot`, so it publishes `applicationSlot` — the one
+ * {@link publishApplicationRuntimeForEachTest} makes live. A `rerender` from
+ * the result keeps the same wrapper. A test that needs its own slot renders its
+ * own provider inside this one; the nearer provider wins.
+ */
+export function render(
+  ui: ReactElement,
+  options: Omit<RenderOptions, 'wrapper'> = {},
+): RenderResult {
+  return renderInTree(ui, { ...options, wrapper: ApplicationServicesProvider });
+}
```

### 7.5 The twenty-one test files — slice 1, one import and one call each

```diff
diff --git a/apps/wbs/fe-01/src/app-router.test.tsx b/apps/wbs/fe-01/src/app-router.test.tsx
index 8f88af07..fe3cd5ff 100644
--- a/apps/wbs/fe-01/src/app-router.test.tsx
+++ b/apps/wbs/fe-01/src/app-router.test.tsx
@@ -1,8 +1,9 @@
 import { createMemoryHistory } from '@tanstack/react-router';
-import { cleanup, render, screen, waitFor } from '@testing-library/react';
+import { cleanup, screen, waitFor } from '@testing-library/react';
 import { afterEach, describe, expect, it } from 'vitest';

 import type { ProjectApi } from '@/lib/wbs-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { refusingApi } from '@/testing/refusing-api';

 import { AppRouter } from './app-router';
@@ -11,6 +12,8 @@ import { AppRouter } from './app-router';
 const hasDom = typeof document !== 'undefined';
 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * A `ProjectApi` with an empty deployment behind it.
  *
diff --git a/apps/wbs/fe-01/src/components/ui/page-shortcuts.test.tsx b/apps/wbs/fe-01/src/components/ui/page-shortcuts.test.tsx
index 5751f477..e51c4d92 100644
--- a/apps/wbs/fe-01/src/components/ui/page-shortcuts.test.tsx
+++ b/apps/wbs/fe-01/src/components/ui/page-shortcuts.test.tsx
@@ -1,10 +1,11 @@
-import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
 import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
 import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';

 import { KeyboardCheatSheet } from '@/components/wbs/keyboard-cheat-sheet';
 import { WbsTable } from '@/components/wbs/wbs-table';
 import type { ProjectApi, WorkItemView } from '@/lib/wbs-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { refusingApi } from '@/testing/refusing-api';
 import { personView, planRead, workItemView } from '@/testing/views';

@@ -14,6 +15,8 @@ import { Modal, ModalContent, ModalTitle } from './modal';
 const hasDom = typeof document !== 'undefined';
 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 afterEach(cleanup);

 /** The one row every test here works over, numbered the way be-01 numbers it. */
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-panel.test.tsx b/apps/wbs/fe-01/src/components/wbs/gantt-panel.test.tsx
index 7f0d0d99..a38cdd93 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-panel.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-panel.test.tsx
@@ -1,4 +1,4 @@
-import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
 import { automaticColor, labelInk, PALETTE, parseHex } from '@wbs/domain/marker-color';
 import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
 import type { IsoDate } from '@wbs/domain/workday';
@@ -17,6 +17,7 @@ import type {
 } from '@/lib/wbs-api';
 import { DEFAULT_PERT_WEIGHTS_VIEW } from '@/lib/wbs-api';
 import { fakeProjectApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';

 import { MONDAY_START, planOf, pointedAtRow, rowAt, sliceAt } from './gantt-fixtures';
@@ -64,6 +65,8 @@ import { type SubscriptionHandlers, WbsTable } from './wbs-table';
 const hasDom = typeof document !== 'undefined';
 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many times a bar has computed its assignee's initials — one
  * {@link initialsOf} call per assigned bar render ({@link barLabelFor}), so a
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-panel.zoned.test.tsx b/apps/wbs/fe-01/src/components/wbs/gantt-panel.zoned.test.tsx
index d3ed82ac..32edb8b3 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-panel.zoned.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-panel.zoned.test.tsx
@@ -1,12 +1,15 @@
-import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
 import { afterEach, describe, expect, it } from 'vitest';

 import { fakeProjectApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';

 import { MONDAY_START, planOf, pointedAtRow, rowAt, sliceAt } from './gantt-fixtures';
 import { GanttPanel } from './gantt-panel';

+publishApplicationRuntimeForEachTest();
+
 /**
  * Slice 4.3a — **no instant is converted on the client**, watched from the
  * only tier that can watch it.
diff --git a/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx b/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx
index 134d8268..2f294faf 100644
--- a/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/optimization-integration.test.tsx
@@ -1,10 +1,11 @@
-import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
 import { afterEach, describe, expect, it, vi } from 'vitest';

 import { ALL_RESOURCES, resourcesFor } from '@/lib/plan-refresh';
 import type { ProjectStreamDeps, SocketHandlers } from '@/lib/project-stream';
 import type { PlanOptimizationView } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

 import { ProjectPage } from './project-page';
 import type { SavedPlansPanelDeps } from './saved-plans-panel';
@@ -13,6 +14,8 @@ import { type SubscriptionHandlers, WbsTable } from './wbs-table';
 const hasDom = typeof document !== 'undefined';
 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 afterEach(cleanup);

 // A payload with no variant comparison in it: Fast's finish is always there,
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-cards.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-cards.test.tsx
index 6ac1aedb..e5cc22c5 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-cards.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-cards.test.tsx
@@ -1,4 +1,4 @@
-import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
+import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

@@ -40,6 +40,7 @@ import type {
   WorkItemView,
 } from '@/lib/wbs-api';
 import { DEFAULT_PERT_WEIGHTS_VIEW } from '@/lib/wbs-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';
 import { refusingApi } from '@/testing/refusing-api';
 import { planRead, sliceView } from '@/testing/views';
@@ -55,6 +56,8 @@ import { WbsTable } from './wbs-table';
 const hasDom = typeof document !== 'undefined';
 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /** jsdom's own default, and the width every other test in this app runs at. */
 const LAPTOP = 1024;
 /** jsdom's own default height, which clears `TABLE_NEEDS_HEIGHT` on its own. */
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-cells.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-cells.test.tsx
index 13baff7f..91b73688 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-cells.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-cells.test.tsx
@@ -1,8 +1,9 @@
-import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
+import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { beforeEach, describe, expect, it, vi } from 'vitest';

 import type { ProjectApi } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi as fakeApi, QA } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';

 import { isoToday } from './gantt-panel';
@@ -17,6 +18,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` renders the table has performed, counted through
  * {@link flexibleCellStyle} — every body cell and heading computes its flexible
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx
index 0c307642..b2ef57b3 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-chart-seam.test.tsx
@@ -1,10 +1,11 @@
-import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { act, fireEvent, screen, waitFor } from '@testing-library/react';
 import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
 import { beforeEach, describe, expect, it, vi } from 'vitest';

 import type { ProjectApi } from '@/lib/wbs-api';
 import { DEFAULT_PERT_WEIGHTS_VIEW } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { refusingApi } from '@/testing/refusing-api';
 import { planRead, projectListEntry, sliceView, workItemView } from '@/testing/views';

@@ -18,6 +19,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many times the chart has been laid out.
  *
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-dependencies.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-dependencies.test.tsx
index 581d1fd9..1bbbea54 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-dependencies.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-dependencies.test.tsx
@@ -1,10 +1,11 @@
-import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { act, createEvent, fireEvent, screen, waitFor } from '@testing-library/react';
 import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
 import { beforeEach, describe, expect, it, vi } from 'vitest';

 import type { ProjectApi, WorkItemView } from '@/lib/wbs-api';
 import { DEFAULT_PERT_WEIGHTS_VIEW } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';
 import { refusingApi } from '@/testing/refusing-api';
 import { planRead, projectListEntry, sliceView, workItemView } from '@/testing/views';
@@ -18,6 +19,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` renders the table has performed, counted through
  * {@link flexibleCellStyle} — every body cell and heading computes its flexible
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx
index 3a460597..2d3902e5 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-estimates.test.tsx
@@ -1,8 +1,9 @@
-import { fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { fireEvent, screen, waitFor } from '@testing-library/react';
 import { beforeEach, describe, expect, it, vi } from 'vitest';

 import type { ProjectApi } from '@/lib/wbs-api';
 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';

 import { STEP_FINAL_HINT } from './column-hints';
@@ -16,6 +17,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` renders the table has performed, counted through
  * {@link flexibleCellStyle} — every body cell and heading computes its flexible
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-filter.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-filter.test.tsx
index 3ab51510..d58180af 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-filter.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-filter.test.tsx
@@ -1,8 +1,9 @@
-import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
+import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import type { ProjectApi, WorkItemView } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi as fakeApi, QA } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

 import type * as TableFrameModule from './table-frame';
 import { type SubscriptionHandlers, WbsTable } from './wbs-table';
@@ -12,6 +13,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` renders the table has performed, counted through
  * {@link flexibleCellStyle} — every body cell and heading computes its flexible
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-keyboard.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-keyboard.test.tsx
index 934da1f2..c0f27368 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-keyboard.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-keyboard.test.tsx
@@ -1,8 +1,9 @@
-import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { act, createEvent, fireEvent, screen, waitFor } from '@testing-library/react';
 import { beforeEach, describe, expect, it, vi } from 'vitest';

 import type { ProjectApi } from '@/lib/wbs-api';
 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';

 import type * as TableFrameModule from './table-frame';
@@ -17,6 +18,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` renders the table has performed, counted through
  * {@link flexibleCellStyle} — every body cell and heading computes its flexible
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-layout.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-layout.test.tsx
index 8b56fda7..9ed74c9d 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-layout.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-layout.test.tsx
@@ -1,7 +1,8 @@
-import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
+import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { beforeEach, describe, expect, it, vi } from 'vitest';

 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

 import { DAY_PX } from './gantt-panel';
 import type * as TableFrameModule from './table-frame';
@@ -25,6 +26,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` renders the table has performed, counted through
  * {@link flexibleCellStyle} — every body cell and heading computes its flexible
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx
index fb309966..d428956b 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-read-and-write.test.tsx
@@ -1,9 +1,10 @@
-import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { act, fireEvent, screen, waitFor } from '@testing-library/react';
 import { StrictMode } from 'react';
 import { beforeEach, describe, expect, it, vi } from 'vitest';

 import { WbsRequestError, type WorkItemView } from '@/lib/wbs-api';
 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';

 import { refusedDraftFor } from './live-editing';
@@ -15,6 +16,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` renders the table has performed, counted through
  * {@link flexibleCellStyle} — every body cell and heading computes its flexible
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-row-dependencies.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-row-dependencies.test.tsx
index 5a429799..da22e1ba 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-row-dependencies.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-row-dependencies.test.tsx
@@ -1,7 +1,8 @@
-import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { act, fireEvent, screen, waitFor } from '@testing-library/react';
 import { beforeEach, describe, expect, it } from 'vitest';

 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

 import { shortIsoDate } from './short-date';
 import { type SubscriptionHandlers, WbsTable } from './wbs-table';
@@ -11,6 +12,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 // The table remembers each project's open branches and hidden columns in
 // localStorage, so one test's shape would arrive as the next test's start.
 beforeEach(() => {
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-row-render-cost.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-row-render-cost.test.tsx
index a36ad11f..ec9a477f 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-row-render-cost.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-row-render-cost.test.tsx
@@ -1,7 +1,8 @@
-import { fireEvent, render, screen } from '@testing-library/react';
+import { fireEvent, screen } from '@testing-library/react';
 import { beforeEach, describe, expect, it, vi } from 'vitest';

 import { DEV, fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

 import type * as InlineMarkdownModule from './inline-markdown';
 import type * as PlanCellPropsModule from './plan-cell-props';
@@ -15,6 +16,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` render boundaries performed their layout work,
  * counted through {@link flexibleCellStyle}. Heading styles are resolved only
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-structure.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-structure.test.tsx
index c9e0f564..a35ae383 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-structure.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-structure.test.tsx
@@ -1,8 +1,9 @@
-import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
+import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { beforeEach, describe, expect, it, vi } from 'vitest';

 import type { ProjectApi } from '@/lib/wbs-api';
 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';

 import type * as TableFrameModule from './table-frame';
@@ -17,6 +18,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` renders the table has performed, counted through
  * {@link flexibleCellStyle} — every body cell and heading computes its flexible
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx
index 85056730..78aa85c5 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-table.test.tsx
@@ -1,8 +1,9 @@
-import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
+import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
 import { beforeEach, describe, expect, it, vi } from 'vitest';

 import type { ProjectApi } from '@/lib/wbs-api';
 import { DEV, fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';

 import { hintFor } from './column-hints';
@@ -15,6 +16,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` renders the table has performed, counted through
  * {@link flexibleCellStyle} — every body cell and heading computes its flexible
diff --git a/apps/wbs/fe-01/src/components/wbs/plan-toolbar.test.tsx b/apps/wbs/fe-01/src/components/wbs/plan-toolbar.test.tsx
index e3f3a24f..dc3666b1 100644
--- a/apps/wbs/fe-01/src/components/wbs/plan-toolbar.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/plan-toolbar.test.tsx
@@ -1,7 +1,8 @@
-import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
+import { fireEvent, screen, waitFor, within } from '@testing-library/react';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

 import type * as TableFrameModule from './table-frame';
 import { WbsTable } from './wbs-table';
@@ -11,6 +12,8 @@ const hasDom = typeof document !== 'undefined';

 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * How many `<td>`/`<th>` renders the table has performed, counted through
  * {@link flexibleCellStyle} — every body cell and heading computes its flexible
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
index 71695345..3e4db2d9 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
@@ -1,4 +1,4 @@
-import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
+import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
 import type { PlanDocumentRequest } from '@wbs/contracts';
 import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
@@ -18,6 +18,7 @@ import type {
 } from '@/lib/wbs-api';
 import { DEFAULT_PERT_WEIGHTS_VIEW, PlanImportRefusalError } from '@/lib/wbs-api';
 import { fakeProjectApi } from '@/testing/fake-project-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';
 import { refusingApi } from '@/testing/refusing-api';
 import { planRead } from '@/testing/views';
@@ -29,6 +30,8 @@ import type { SavedPlansPanelDeps } from './saved-plans-panel';
 const hasDom = typeof document !== 'undefined';
 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 /**
  * A ProjectApi over an in-memory project list. The table's methods answer
  * emptily rather than throwing: selecting a project renders a real WbsTable,
diff --git a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx
index 305551fa..98e7d0cc 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx
@@ -1,8 +1,9 @@
-import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
+import { act, cleanup, fireEvent, screen } from '@testing-library/react';
 import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import { DEFAULT_PERT_WEIGHTS_VIEW, type PriorityBandView } from '@/lib/wbs-api';
+import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

 import {
   isSettingsSection,
@@ -16,6 +17,8 @@ import { INITIAL_HIDDEN_COLUMNS } from './table-frame';
 const hasDom = typeof document !== 'undefined';
 const itDom = hasDom ? it : it.skip;

+publishApplicationRuntimeForEachTest();
+
 afterEach(cleanup);
 beforeEach(() => {
   localStorage.clear();
```

### 7.6 `spec.md` — slice 2, the scenario for "nothing live"

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 56ded340..f390a4ca 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -239,6 +239,15 @@ no access at all, as the requirement on degrading visibly already states.
   replaced runtime's, and a reader kept from that earlier render answers the
   replacement

+#### Scenario: With no runtime live, the default is shown and reported as not remembered
+
+- **WHEN** a settings section or a last-opened project is read or written while
+  no runtime is live, whether none has been published yet or the one that was has
+  been withdrawn
+- **THEN** the caller's documented default is used, nothing is read, dropped or
+  written in any store, nothing throws, and the returned value says the answer
+  is not being remembered
+
 ### Requirement: Log out stays a local exit

 The Log out action SHALL send no request to the server and SHALL retire the
```

### 7.7 `apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx` — slice 2

The `mounted` helper gains an optional slot; the one existing assertion edit is the
`reads an absent key as the first section` hunk (section 6, slice 2 step 3).

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx
index 98e7d0cc..3ed04ace 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx
@@ -3,6 +3,22 @@ import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import { DEFAULT_PERT_WEIGHTS_VIEW, type PriorityBandView } from '@/lib/wbs-api';
+import type { BrowserStorage } from '@/modules/preferences/contract';
+import {
+  fakeBrowserStorage,
+  type HeldByFake,
+  writeRefusingBrowserStorage,
+} from '@/modules/preferences/fake-browser-storage';
+import {
+  type ApplicationServices,
+  applicationSlot,
+  installApplicationRuntime,
+} from '@/runtime/application-runtime';
+import {
+  ApplicationServicesProvider,
+  applicationServicesStateFor,
+} from '@/runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';

 import {
@@ -10,6 +26,7 @@ import {
   ProjectSettingsModal,
   type ProjectSettingsModalProps,
   rememberedSettingsSection,
+  rememberSettingsSection,
 } from './project-settings-modal';
 import { INITIAL_HIDDEN_COLUMNS } from './table-frame';

@@ -43,7 +60,10 @@ function held(): { promise: Promise<void>; land: () => void } {
  * recorded, opened through its own trigger — because the trigger is the
  * component's, for Radix's focus-restore reason.
  */
-function mounted(overrides: Partial<ProjectSettingsModalProps> = {}) {
+function mounted(
+  overrides: Partial<ProjectSettingsModalProps> = {},
+  slot: LifetimeSlot<ApplicationServices> | null = null,
+) {
   const setCapacity = vi.fn(() => Promise.resolve());
   const setBands = vi.fn<(bands: readonly PriorityBandView[]) => Promise<void>>(() =>
     Promise.resolve(),
@@ -98,7 +118,17 @@ function mounted(overrides: Partial<ProjectSettingsModalProps> = {}) {
     },
     ...overrides,
   };
-  render(<ProjectSettingsModal {...props} />);
+  // A test that owns its own slot renders its own provider inside the file's;
+  // the nearer provider is the one the modal reads.
+  render(
+    slot === null ? (
+      <ProjectSettingsModal {...props} />
+    ) : (
+      <ApplicationServicesProvider slot={slot}>
+        <ProjectSettingsModal {...props} />
+      </ApplicationServicesProvider>
+    ),
+  );
   return { setCapacity, setBands, addStep, renameStep, removeStep, setArithmetic, onChanged };
 }

@@ -393,8 +423,153 @@ describe('the section it reopens on', () => {
   });

   it('reads an absent key as the first section', () => {
-    expect(rememberedSettingsSection('nobody')).toBe('teams');
+    expect(
+      rememberedSettingsSection(applicationServicesStateFor(applicationSlot), 'nobody'),
+    ).toEqual({ value: 'teams', persists: true });
+  });
+});
+
+/**
+ * The four lifecycle transitions of `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`,
+ * for a modal that reads and writes its section only when a handler runs.
+ *
+ * The modal renders nothing derived from the store and does not re-render when
+ * the slot moves, so every transition here is about which runtime a handler
+ * reaches at the instant it runs.
+ */
+describe('the section it reopens on, over the runtime live when a handler runs', () => {
+  /** Every slot this block built, given back after React's own cleanup. */
+  const built: LifetimeSlot<ApplicationServices>[] = [];
+
+  afterEach(async () => {
+    try {
+      cleanup();
+    } finally {
+      for (const slot of built.splice(0)) await slot.retire();
+    }
+  });
+
+  function emptySlot(): LifetimeSlot<ApplicationServices> {
+    const slot = createLifetimeSlot<ApplicationServices>(50);
+    built.push(slot);
+    return slot;
+  }
+
+  /** The production installer over `store`, live when this resolves. */
+  async function publishOver(
+    slot: LifetimeSlot<ApplicationServices>,
+    store: BrowserStorage,
+  ): Promise<void> {
+    await act(async () => {
+      await slot.replace(() =>
+        installApplicationRuntime({
+          openStore: () => store,
+          isLive: () => slot.snapshot().status === 'live',
+        }),
+      );
+    });
+  }
+
+  const heldSection = (store: HeldByFake): string | undefined => store.held()[SECTION_KEY];
+
+  itDom('opens on the first section and remembers nothing when no runtime is live', () => {
+    const slot = emptySlot();
+    mounted({}, slot);
+    open();
+    expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');
+
+    fireEvent.click(tab('Priorities'));
+
+    expect(tab('Priorities')).toHaveAttribute('aria-selected', 'true');
+    // Not the page's own runtime either: nothing fell through to it.
+    expect(localStorage.getItem(SECTION_KEY)).toBeNull();
+    expect(rememberedSettingsSection(applicationServicesStateFor(slot), PROJECT)).toEqual({
+      value: 'teams',
+      persists: false,
+    });
+  });
+
+  itDom('stops remembering once its runtime is withdrawn, and never throws', async () => {
+    const store = fakeBrowserStorage({ [SECTION_KEY]: 'steps' });
+    const slot = emptySlot();
+    await publishOver(slot, store);
+    mounted({}, slot);
+    await act(async () => {
+      await slot.retire();
+    });
+
+    open();
+    expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');
+    fireEvent.click(tab('Estimating'));
+
+    expect(tab('Estimating')).toHaveAttribute('aria-selected', 'true');
+    expect(heldSection(store)).toBe('steps');
+    expect(rememberSettingsSection(applicationServicesStateFor(slot), PROJECT, 'teams')).toBe(
+      false,
+    );
+  });
+
+  itDom('reopens on a replacement runtime’s own remembered section', async () => {
+    const first = fakeBrowserStorage({ [SECTION_KEY]: 'steps' });
+    const second = fakeBrowserStorage({ [SECTION_KEY]: 'priorities' });
+    const slot = emptySlot();
+    await publishOver(slot, first);
+    mounted({}, slot);
+    await publishOver(slot, second);
+
+    open();
+
+    expect(tab('Priorities')).toHaveAttribute('aria-selected', 'true');
+    expect(heldSection(first)).toBe('steps');
   });
+
+  itDom(
+    'writes a section chosen after a replacement into the replacement, from a modal opened before it',
+    async () => {
+      const first = fakeBrowserStorage();
+      const second = fakeBrowserStorage();
+      const slot = emptySlot();
+      await publishOver(slot, first);
+      mounted({}, slot);
+      open();
+      await publishOver(slot, second);
+
+      fireEvent.click(tab('Steps'));
+
+      expect(tab('Steps')).toHaveAttribute('aria-selected', 'true');
+      expect(heldSection(second)).toBe('steps');
+      expect(heldSection(first)).toBeUndefined();
+    },
+  );
+
+  itDom(
+    'lets a store’s own write failure through by identity, showing no section it could not keep',
+    async () => {
+      const denied = new Error('write denied');
+      const store = writeRefusingBrowserStorage(denied);
+      const slot = emptySlot();
+      await publishOver(slot, store);
+      mounted({}, slot);
+      open();
+
+      const reported: unknown[] = [];
+      const report = (event: ErrorEvent): void => {
+        reported.push(event.error);
+        event.preventDefault();
+      };
+      window.addEventListener('error', report);
+      try {
+        fireEvent.click(tab('Priorities'));
+      } finally {
+        window.removeEventListener('error', report);
+      }
+
+      expect(reported).toHaveLength(1);
+      expect(reported[0]).toBe(denied);
+      expect(tab('Teams')).toHaveAttribute('aria-selected', 'true');
+      expect(heldSection(store)).toBeUndefined();
+    },
+  );
 });

 describe('the control that opens it', () => {
```

### 7.8 `apps/wbs/fe-01/src/components/wbs/project-page.test.tsx` — slice 2

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
index 3e4db2d9..11de2b96 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.test.tsx
@@ -17,13 +17,25 @@ import type {
   ProjectListEntry,
 } from '@/lib/wbs-api';
 import { DEFAULT_PERT_WEIGHTS_VIEW, PlanImportRefusalError } from '@/lib/wbs-api';
+import type { BrowserStorage } from '@/modules/preferences/contract';
+import {
+  fakeBrowserStorage,
+  type HeldByFake,
+  writeRefusingBrowserStorage,
+} from '@/modules/preferences/fake-browser-storage';
+import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
+import {
+  ApplicationServicesProvider,
+  applicationServicesStateFor,
+} from '@/runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';
 import { fakeProjectApi } from '@/testing/fake-project-api';
 import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
 import { recordCalls } from '@/testing/record-calls';
 import { refusingApi } from '@/testing/refusing-api';
 import { planRead } from '@/testing/views';

-import { ProjectPage } from './project-page';
+import { ProjectPage, recallLastProject, rememberLastProject } from './project-page';
 import type { SavedPlansPanelDeps } from './saved-plans-panel';

 // fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
@@ -1254,6 +1266,186 @@ describe('the chosen project survives a refresh', () => {
   });
 });

+/**
+ * The four lifecycle transitions of `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`,
+ * for a page that reads and writes the last-opened project only when a list load
+ * lands or a handler runs.
+ *
+ * The page renders nothing derived from that store and does not re-render when
+ * the slot moves, so every transition here is about which runtime a callback
+ * reaches at the instant it runs.
+ */
+describe('the remembered project, over the runtime live when it is used', () => {
+  const PROJECT_KEY = 'wbs.project';
+  /** Every slot this block built, given back after React's own cleanup. */
+  const built: LifetimeSlot<ApplicationServices>[] = [];
+
+  afterEach(async () => {
+    try {
+      cleanup();
+    } finally {
+      for (const slot of built.splice(0)) await slot.retire();
+    }
+  });
+
+  function emptySlot(): LifetimeSlot<ApplicationServices> {
+    const slot = createLifetimeSlot<ApplicationServices>(50);
+    built.push(slot);
+    return slot;
+  }
+
+  /** The production installer over `store`, live when this resolves. */
+  async function publishOver(
+    slot: LifetimeSlot<ApplicationServices>,
+    store: BrowserStorage,
+  ): Promise<void> {
+    await act(async () => {
+      await slot.replace(() =>
+        installApplicationRuntime({
+          openStore: () => store,
+          isLive: () => slot.snapshot().status === 'live',
+        }),
+      );
+    });
+  }
+
+  const pageUnder = (slot: LifetimeSlot<ApplicationServices>, api: ProjectApi) =>
+    render(
+      <ApplicationServicesProvider slot={slot}>
+        <ProjectPage token="t" api={api} savedPlansDeps={fakeSavedPlansDeps()} />
+      </ApplicationServicesProvider>,
+    );
+
+  const heldProject = (store: HeldByFake): string | undefined => store.held()[PROJECT_KEY];
+
+  itDom('restores nothing and remembers nothing when no runtime is live', async () => {
+    const slot = emptySlot();
+    pageUnder(slot, fakeProjects(TWO));
+
+    await selectProject('p2');
+
+    expect(picker().value).toBe('Paint the fence');
+    // Not the page's own runtime either: nothing fell through to it.
+    expect(localStorage.getItem(PROJECT_KEY)).toBeNull();
+    expect(recallLastProject(applicationServicesStateFor(slot))).toEqual({
+      value: null,
+      persists: false,
+    });
+  });
+
+  itDom('stops remembering once its runtime is withdrawn, and never throws', async () => {
+    const store = fakeBrowserStorage({ [PROJECT_KEY]: 'p2' });
+    const slot = emptySlot();
+    await publishOver(slot, store);
+    pageUnder(slot, fakeProjects(TWO));
+    await waitFor(() => {
+      expect(picker().value).toBe('Paint the fence');
+    });
+    await act(async () => {
+      await slot.retire();
+    });
+
+    await selectProject('p1');
+
+    expect(picker().value).toBe('Rewire the shed');
+    expect(heldProject(store)).toBe('p2');
+    expect(rememberLastProject(applicationServicesStateFor(slot), 'p1')).toBe(false);
+  });
+
+  itDom(
+    'restores the replacement runtime’s own project when a list load lands after a replacement',
+    async () => {
+      const first = fakeBrowserStorage({ [PROJECT_KEY]: 'p1' });
+      const second = fakeBrowserStorage({ [PROJECT_KEY]: 'p2' });
+      const slot = emptySlot();
+      await publishOver(slot, first);
+      const api = fakeProjects(TWO);
+      let land = (): void => {
+        throw new Error('the list was never asked for');
+      };
+      const listed = new Promise<void>((resolve) => {
+        land = resolve;
+      });
+      const listProjects = api.listProjects.bind(api);
+      api.listProjects = async () => {
+        await listed;
+        return listProjects();
+      };
+      pageUnder(slot, api);
+      await publishOver(slot, second);
+
+      await act(async () => {
+        land();
+        await listed;
+      });
+
+      await waitFor(() => {
+        expect(picker().value).toBe('Paint the fence');
+      });
+      expect(heldProject(first)).toBe('p1');
+    },
+  );
+
+  itDom(
+    'writes a project chosen after a replacement into the replacement, from a page drawn before it',
+    async () => {
+      const first = fakeBrowserStorage();
+      const second = fakeBrowserStorage();
+      const slot = emptySlot();
+      await publishOver(slot, first);
+      pageUnder(slot, fakeProjects(TWO));
+      await waitFor(() => {
+        expect(screen.getByLabelText('Project')).toBeDefined();
+      });
+      openPicker();
+      await waitFor(() => {
+        expect(document.getElementById('project-option-p2')).not.toBeNull();
+      });
+      // The option is on screen, drawn under the first runtime; nothing renders
+      // again before it is clicked.
+      await publishOver(slot, second);
+
+      const option = document.getElementById('project-option-p2');
+      if (option === null) throw new Error('setup: no option for p2');
+      fireEvent.click(option);
+
+      expect(picker().value).toBe('Paint the fence');
+      expect(heldProject(second)).toBe('p2');
+      expect(heldProject(first)).toBeUndefined();
+    },
+  );
+
+  itDom(
+    'lets a store’s own write failure through by identity, selecting nothing it could not keep',
+    async () => {
+      const denied = new Error('write denied');
+      const store = writeRefusingBrowserStorage(denied);
+      const slot = emptySlot();
+      await publishOver(slot, store);
+      const api = fakeProjects(TWO);
+      pageUnder(slot, api);
+
+      const reported: unknown[] = [];
+      const report = (event: ErrorEvent): void => {
+        reported.push(event.error);
+        event.preventDefault();
+      };
+      window.addEventListener('error', report);
+      try {
+        await selectProject('p2');
+      } finally {
+        window.removeEventListener('error', report);
+      }
+
+      expect(reported).toHaveLength(1);
+      expect(reported[0]).toBe(denied);
+      expect(screen.queryByRole('button', { name: 'Rename project' })).toBeNull();
+      expect(api.opened).toEqual([]);
+      expect(heldProject(store)).toBeUndefined();
+    },
+  );
+});
+
 describe('an entry says who owns it and when it was made', () => {
   itDom('tells two projects of one name apart by their owners', async () => {
     // The whole reason the meta exists. Two entries reading `Rewire the shed`
```

### 7.9 `apps/wbs/fe-01/src/lib/remembered.ts` — slice 2, `Recalled<T>`

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
index 92586119..17007be5 100644
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -3,6 +3,22 @@ import type { Claim, Remembered } from '@/modules/preferences/contract';

 export type { Claim, Remembered };

+/**
+ * A remembered answer as it stood at the instant it was asked for, and whether a
+ * live runtime was there to answer.
+ *
+ * `persists: false` is the visible degradation rule R5 asks for when the page
+ * has no live runtime: `value` is then the caller's own documented default —
+ * exactly what an unread key already produces — and nothing was read, dropped or
+ * written. A caller that shows `value` either way still has the answer to "is
+ * this being remembered" in its hands, rather than a default it cannot tell
+ * apart from a stored one.
+ */
+export interface Recalled<T> {
+  readonly value: T;
+  readonly persists: boolean;
+}
+
 /**
  * The store for one key, judged by one guard — the preferences service's now.
  *
```

### 7.10 `apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx` — slice 2

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
index d89a7e92..f07e8074 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
@@ -9,8 +9,12 @@ import {
   ModalTitle,
   ModalTrigger,
 } from '@/components/ui/modal';
-import type { Remembered } from '@/lib/remembered';
-import { rememberedPreferences } from '@/modules/preferences/composition';
+import type { Recalled, Remembered } from '@/lib/remembered';
+import type { RememberedPreferences } from '@/modules/preferences/contract';
+import {
+  type ApplicationServicesState,
+  useApplicationServicesReader,
+} from '@/runtime/application-services-context';

 import { EstimatingPanel, type EstimatingPanelProps } from './estimating-panel';
 import { OptimizationSettingsPanel, type OptimizationSettingsProps } from './optimization-settings';
@@ -44,6 +48,11 @@ export function isSettingsSection(claimed: unknown): claimed is SettingsSection
 /**
  * The section this browser last left open for `projectId`, or the first one.
  *
+ * Read from the runtime `services` names — which the modal reads at the instant
+ * it opens, through `useApplicationServicesReader`, never from a render it may
+ * have outlived. With no runtime live the first section is shown and
+ * `persists` says it is not remembered: nothing is read, and nothing throws.
+ *
  * The stored value is a claim, not a fact, read the way `rememberedHiddenColumns`
  * reads its key: anything that is not the id of a section this modal offers is
  * **dropped, key and all**, and the first section shown. Not the R5 throw — the
@@ -56,12 +65,35 @@ export function isSettingsSection(claimed: unknown): claimed is SettingsSection
  * `expect(element).toHaveAttribute("aria-selected", "true")` — a stored `7`
  * selecting no tab at all, with nothing on the surface. Watched 2026-08-30.
  */
-export function rememberedSettingsSection(projectId: string): SettingsSection {
-  return storedSection(projectId).readAndDrop() ?? FIRST_SECTION;
+export function rememberedSettingsSection(
+  services: ApplicationServicesState,
+  projectId: string,
+): Recalled<SettingsSection> {
+  if (services.status !== 'live') return { value: FIRST_SECTION, persists: false };
+  return {
+    value: storedSection(services.remembered, projectId).readAndDrop() ?? FIRST_SECTION,
+    persists: true,
+  };
 }

-export function rememberSettingsSection(projectId: string, section: SettingsSection): void {
-  storedSection(projectId).write(section);
+/**
+ * Writes the open section for `projectId` into the runtime `services` names.
+ *
+ * Answers whether one was live to take it: `false` writes nothing anywhere, and
+ * the section is simply not remembered — see {@link Recalled}.
+ *
+ * @throws whatever a live store throws on write — a browser with site data
+ * blocked — unchanged; that is not a lifecycle outcome and nothing here
+ * recovers from it.
+ */
+export function rememberSettingsSection(
+  services: ApplicationServicesState,
+  projectId: string,
+  section: SettingsSection,
+): boolean {
+  if (services.status !== 'live') return false;
+  storedSection(services.remembered, projectId).write(section);
+  return true;
 }

 /**
@@ -73,8 +105,10 @@ export function rememberSettingsSection(projectId: string, section: SettingsSect
  * One project's open section, stored as **bare text**, which cannot become JSON
  * without losing the section existing readers already hold.
  */
-const storedSection = (projectId: string): Remembered<SettingsSection> =>
-  rememberedPreferences.projectSettingsSection(projectId, isSettingsSection);
+const storedSection = (
+  remembered: RememberedPreferences,
+  projectId: string,
+): Remembered<SettingsSection> => remembered.projectSettingsSection(projectId, isSettingsSection);

 /** What each section gets from the plan, less what the modal itself supplies. */
 type SectionOwn<P> = Omit<P, 'onDirtyChange' | 'onDone'>;
@@ -213,12 +247,23 @@ export function ProjectSettingsModal({
     [reporterFor],
   );

+  /**
+   * The page's runtime as it is when a handler runs, not as it was when this
+   * modal last rendered: the modal does not re-render when the slot moves, so a
+   * handler bound under one runtime can run under the next — and must reach that
+   * one, or none.
+   */
+  const readServices = useApplicationServicesReader();
+
   const show = useCallback(
     (section: SettingsSection): void => {
+      // Written before `setShown`, on purpose: a store that refuses the write for
+      // a reason of its own propagates before this modal has shown a section it
+      // could not keep.
+      rememberSettingsSection(readServices(), projectId, section);
       setShown(section);
-      rememberSettingsSection(projectId, section);
     },
-    [projectId],
+    [projectId, readServices],
   );

   /**
@@ -268,7 +313,7 @@ export function ProjectSettingsModal({
       dirtyRef.current.clear();
       setDirtySections([]);
       setRefused(false);
-      setShown(rememberedSettingsSection(projectId));
+      setShown(rememberedSettingsSection(readServices(), projectId).value);
       setOpen(true);
       return;
     }
```

### 7.11 `apps/wbs/fe-01/src/components/wbs/project-page.tsx` — slice 2

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index 5fdc1b26..c10e715b 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -14,9 +14,13 @@ import type { Roster } from '@/components/presence/presence-panel';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { type ProjectStreamDeps, subscribeToProject } from '@/lib/project-stream';
+import type { Recalled } from '@/lib/remembered';
 import { cn } from '@/lib/utils';
 import { httpProjectApi, type ProjectApi, type ProjectListEntry } from '@/lib/wbs-api';
-import { rememberedPreferences } from '@/modules/preferences/composition';
+import {
+  type ApplicationServicesState,
+  useApplicationServicesReader,
+} from '@/runtime/application-services-context';

 import { useClosedByPointerOutside } from './close-on-outside-pointer';
 import { type BesideAnchorRect, HoverCard } from './hover-card';
@@ -80,18 +84,27 @@ export interface ProjectPageProps {
 }

 /**
- * Where this browser remembers which project was open.
+ * The project this browser was last in, over the runtime `services` names — or
+ * nothing, **not remembered**, when no runtime is live to ask.
  *
  * Reached through the preferences service like every other key, and **judged**
  * nowhere near it: its claim is tested against the project list this load just
  * fetched, not against a shape, so there is nothing to hand a guard built once
- * at module scope — `found.some(...)` is the whole validity rule and it is
- * different on every load. That is what the unchecked shape is for, and why the
- * empty string is held rather than refused: a held empty string still reaches
+ * — `found.some(...)` is the whole validity rule and it is different on every
+ * load. That is what the unchecked shape is for, and why the empty string is
+ * held rather than refused: a held empty string still reaches
  * `installProjects`, which drops the key, and a refusal would leave it in
  * storage for ever.
+ *
+ * `services` is read at the instant of the call — the page reads it through
+ * `useApplicationServicesReader` when a list load lands, which can be long after
+ * the render that started it — and with no runtime live nothing is read and
+ * nothing throws: the page simply restores no project. See {@link Recalled}.
  */
-const rememberedProject = rememberedPreferences.lastOpenedProject;
+export function recallLastProject(services: ApplicationServicesState): Recalled<string | null> {
+  if (services.status !== 'live') return { value: null, persists: false };
+  return { value: services.remembered.lastOpenedProject.read(), persists: true };
+}

 /**
  * The name be-01 writes for a project nobody has named yet.
@@ -103,7 +116,8 @@ const rememberedProject = rememberedPreferences.lastOpenedProject;
 const PLACEHOLDER_PROJECT_NAME = 'New project';

 /**
- * Writes, or forgets, which project this browser was last in.
+ * Writes, or forgets, which project this browser was last in — into the runtime
+ * `services` names, and answers whether one was live to take it.
  *
  * Deliberately **not** through `lib/remembered.ts`, and this is the one store
  * that stays hand-written: its claim is judged against the project list this
@@ -114,9 +128,15 @@ const PLACEHOLDER_PROJECT_NAME = 'New project';
  * rather than left to be re-offered; what it does not share is the part
  * `remembered` exists to hold.
  */
-function rememberProject(id: string | null): void {
-  if (id === null) rememberedProject.forget();
-  else rememberedProject.write(id);
+export function rememberLastProject(
+  services: ApplicationServicesState,
+  id: string | null,
+): boolean {
+  if (services.status !== 'live') return false;
+  const store = services.remembered.lastOpenedProject;
+  if (id === null) store.forget();
+  else store.write(id);
+  return true;
 }

 /**
@@ -570,26 +590,37 @@ export function ProjectPage({
     if (search === null) setHoveredId(null);
   }, [search]);

-  const installProjects = useCallback((found: ProjectListEntry[]) => {
-    setProjects(found);
-    setSelected((current) => {
-      // The current selection and the remembered id are both claims, honoured
-      // only while the list still contains them — a project deleted elsewhere
-      // must not stay "selected" into a table asking for its tree. Then,
-      // selecting the only project saves a click on the common path; with
-      // several, the choice is the user's and nothing is guessed.
-      if (current !== null && found.some((project) => project.id === current)) return current;
-      const remembered = rememberedProject.read();
-      if (remembered !== null && found.some((project) => project.id === remembered)) {
-        return remembered;
-      }
-      // A remembered id the list no longer holds is a claim that has been
-      // disproved, so it is dropped rather than left to be re-tested — and
-      // re-offered as a choice — on every future load.
-      if (remembered !== null) rememberProject(null);
-      return found.length === 1 ? (found[0]?.id ?? null) : null;
-    });
-  }, []);
+  /**
+   * The page's runtime as it is when a callback runs — a list load or a create
+   * lands long after the render that started it, and a click can arrive before
+   * React has re-rendered for a slot that has already moved on.
+   */
+  const readServices = useApplicationServicesReader();
+
+  const installProjects = useCallback(
+    (found: ProjectListEntry[]) => {
+      setProjects(found);
+      setSelected((current) => {
+        // The current selection and the remembered id are both claims, honoured
+        // only while the list still contains them — a project deleted elsewhere
+        // must not stay "selected" into a table asking for its tree. Then,
+        // selecting the only project saves a click on the common path; with
+        // several, the choice is the user's and nothing is guessed.
+        if (current !== null && found.some((project) => project.id === current)) return current;
+        const services = readServices();
+        const remembered = recallLastProject(services).value;
+        if (remembered !== null && found.some((project) => project.id === remembered)) {
+          return remembered;
+        }
+        // A remembered id the list no longer holds is a claim that has been
+        // disproved, so it is dropped rather than left to be re-tested — and
+        // re-offered as a choice — on every future load.
+        if (remembered !== null) rememberLastProject(services, null);
+        return found.length === 1 ? (found[0]?.id ?? null) : null;
+      });
+    },
+    [readServices],
+  );

   const fetchProjects = useCallback(() => api.listProjects(), [api]);

@@ -658,8 +689,11 @@ export function ProjectPage({
     void api
       .createProject(PLACEHOLDER_PROJECT_NAME)
       .then(async (project) => {
+        // Written before the selection moves: a store that refuses the write for
+        // a reason of its own propagates before the page has shown a choice it
+        // could not keep.
+        rememberLastProject(readServices(), project.id);
         setSelected(project.id);
-        rememberProject(project.id);
         await load();
         setRename({
           projectId: project.id,
@@ -752,8 +786,8 @@ export function ProjectPage({
    * Watched 2026-08-29.
    */
   const choose = (id: string) => {
+    rememberLastProject(readServices(), id);
     setSelected(id);
-    rememberProject(id);
     setSearch(null);
     pickerBox.current?.blur();
   };
```

### 7.12 `apps/wbs/fe-01/src/components/wbs/gantt-detail.test.tsx` — slice 3, **new file**

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-detail.test.tsx b/apps/wbs/fe-01/src/components/wbs/gantt-detail.test.tsx
new file mode 100644
index 00000000..4977bbb4
--- /dev/null
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-detail.test.tsx
@@ -0,0 +1,280 @@
+import { act, cleanup, render, renderHook } from '@testing-library/react';
+import { type ReactNode, useLayoutEffect } from 'react';
+import { afterEach, describe, expect, it } from 'vitest';
+
+import type { BrowserStorage } from '@/modules/preferences/contract';
+import {
+  fakeBrowserStorage,
+  type HeldByFake,
+  writeRefusingBrowserStorage,
+} from '@/modules/preferences/fake-browser-storage';
+import { GANTT_DETAIL_KEY, RETIRED_GANTT_ARROWS_KEY } from '@/modules/preferences/preference-keys';
+import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
+import { ApplicationServicesProvider } from '@/runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';
+
+import { type GanttDetail, useGanttDetail } from './gantt-detail';
+
+// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
+const hasDom = typeof document !== 'undefined';
+const itDom = hasDom ? it : it.skip;
+
+/** Every slot this file built, given back after React's own cleanup. */
+const built: LifetimeSlot<ApplicationServices>[] = [];
+
+afterEach(async () => {
+  try {
+    cleanup();
+  } finally {
+    for (const slot of built.splice(0)) await slot.retire();
+  }
+});
+
+function emptySlot(): LifetimeSlot<ApplicationServices> {
+  const slot = createLifetimeSlot<ApplicationServices>(50);
+  built.push(slot);
+  return slot;
+}
+
+/**
+ * The production installer over `store`, live when this resolves, whose disposal
+ * waits for `disposal` first — so a test can read the withdrawn state while the
+ * runtime is still letting go.
+ */
+async function publishOver(
+  slot: LifetimeSlot<ApplicationServices>,
+  store: BrowserStorage,
+  disposal: Promise<void> = Promise.resolve(),
+): Promise<void> {
+  await act(async () => {
+    await slot.replace(() => {
+      const installed = installApplicationRuntime({
+        openStore: () => store,
+        isLive: () => slot.snapshot().status === 'live',
+      });
+      return {
+        services: installed.services,
+        close: async (options) => {
+          await disposal;
+          await installed.close(options);
+        },
+      };
+    });
+  });
+}
+
+function wrapperFor(slot: LifetimeSlot<ApplicationServices>) {
+  function Wrapper({ children }: { children: ReactNode }) {
+    return <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>;
+  }
+  return Wrapper;
+}
+
+const storedDetail = (store: HeldByFake): string | undefined => store.held()[GANTT_DETAIL_KEY];
+
+/** Lets the slot's own microtask notification reach React, and nothing more. */
+async function deliverNotification(): Promise<void> {
+  await act(async () => {
+    await Promise.resolve();
+    await Promise.resolve();
+  });
+}
+
+/**
+ * The four lifecycle transitions of
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`, for
+ * the chart's detail switch — an answer the page keeps on screen, so it follows
+ * the same state machine `useTheme` does.
+ */
+describe('the detail switch, over the runtime the page publishes', () => {
+  itDom('opens on the never-said default and remembers nothing when no runtime is live', () => {
+    const slot = emptySlot();
+    const held = renderHook(() => useGanttDetail(true), { wrapper: wrapperFor(slot) });
+    expect(held.result.current.shown).toBe(true);
+    expect(held.result.current.persists).toBe(false);
+
+    act(() => {
+      held.result.current.ask(false);
+    });
+
+    expect(held.result.current.shown).toBe(false);
+    expect(held.result.current.persists).toBe(false);
+    // Not the page's own store either: nothing fell through to it.
+    expect(localStorage.getItem(GANTT_DETAIL_KEY)).toBeNull();
+  });
+
+  itDom(
+    'returns to the never-said default and stops remembering once withdrawn, without waiting for disposal',
+    async () => {
+      const store = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'false' });
+      let release = (): void => {
+        throw new Error('the disposal was never reached');
+      };
+      const disposal = new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      const slot = emptySlot();
+      await publishOver(slot, store, disposal);
+      // Released whatever the assertions below do, so the file's own teardown
+      // never waits on a disposal this test is still holding.
+      try {
+        const held = renderHook(() => useGanttDetail(true), { wrapper: wrapperFor(slot) });
+        expect(held.result.current.shown).toBe(false);
+        expect(held.result.current.persists).toBe(true);
+
+        const retiring = slot.retire();
+        await deliverNotification();
+
+        expect(slot.snapshot().status, 'setup: the disposal is still held').toBe('retiring');
+        expect(held.result.current.shown).toBe(true);
+        expect(held.result.current.persists).toBe(false);
+        expect(storedDetail(store)).toBe('false');
+        release();
+        await act(async () => {
+          await retiring;
+        });
+      } finally {
+        release();
+      }
+    },
+  );
+
+  itDom(
+    'changes the marks and remembers nothing when asked between a withdrawal and the next render',
+    async () => {
+      const store = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'true' });
+      const slot = emptySlot();
+      await publishOver(slot, store);
+      const held = renderHook(() => useGanttDetail(false), { wrapper: wrapperFor(slot) });
+      expect(held.result.current.shown).toBe(true);
+      const { ask } = held.result.current;
+
+      // Withdrawal is synchronous; the notification that re-renders the hook is
+      // not, so `ask` still belongs to the render that read the live runtime.
+      const retiring = slot.retire();
+      expect(() => {
+        act(() => {
+          ask(false);
+        });
+      }).not.toThrow();
+
+      expect(held.result.current.shown).toBe(false);
+      expect(held.result.current.persists).toBe(false);
+      expect(storedDetail(store)).toBe('true');
+      await act(async () => {
+        await retiring;
+      });
+    },
+  );
+
+  itDom(
+    'adopts a replacement runtime’s own remembered answer, and drops what it refuses',
+    async () => {
+      const first = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'false' });
+      const second = fakeBrowserStorage({
+        [GANTT_DETAIL_KEY]: 'true',
+        [RETIRED_GANTT_ARROWS_KEY]: 'true',
+      });
+      const slot = emptySlot();
+      await publishOver(slot, first);
+      const held = renderHook(() => useGanttDetail(false), { wrapper: wrapperFor(slot) });
+      expect(held.result.current.shown).toBe(false);
+
+      await publishOver(slot, second);
+
+      expect(held.result.current.shown).toBe(true);
+      expect(held.result.current.persists).toBe(true);
+      expect(second.held()[RETIRED_GANTT_ARROWS_KEY]).toBeUndefined();
+      expect(storedDetail(first)).toBe('false');
+    },
+  );
+
+  itDom('does not let a superseded ask change the marks or any store', async () => {
+    const first = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'false' });
+    const second = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'true' });
+    const slot = emptySlot();
+    await publishOver(slot, first);
+    const held = renderHook(() => useGanttDetail(false), { wrapper: wrapperFor(slot) });
+    const retained = held.result.current.ask;
+    await publishOver(slot, second);
+    expect(held.result.current.shown).toBe(true);
+
+    act(() => {
+      retained(false);
+    });
+
+    expect(held.result.current.shown).toBe(true);
+    expect(held.result.current.persists).toBe(true);
+    expect(storedDetail(second)).toBe('true');
+    expect(storedDetail(first)).toBe('false');
+  });
+
+  itDom(
+    'lets a store’s own write failure through by identity, showing nothing it could not keep',
+    async () => {
+      const denied = new Error('write denied');
+      const store = writeRefusingBrowserStorage(denied);
+      const slot = emptySlot();
+      await publishOver(slot, store);
+      const held = renderHook(() => useGanttDetail(false), { wrapper: wrapperFor(slot) });
+
+      let thrown: unknown = null;
+      try {
+        act(() => {
+          held.result.current.ask(true);
+        });
+      } catch (caught) {
+        thrown = caught;
+      }
+
+      // Anything the failed call queued is let through before reading it back.
+      await act(async () => {
+        await Promise.resolve();
+      });
+
+      expect(thrown).toBe(denied);
+      expect(held.result.current.shown).toBe(false);
+      expect(held.result.current.persists).toBe(true);
+      expect(storedDetail(store)).toBeUndefined();
+    },
+  );
+
+  itDom(
+    'settles on the withdrawn state, without throwing, when retired between its render and its effect',
+    async () => {
+      const slot = emptySlot();
+      await publishOver(slot, fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'false' }));
+      const captured: { detail: GanttDetail | null } = { detail: null };
+
+      function ObservesDetail(): null {
+        captured.detail = useGanttDetail(true);
+        return null;
+      }
+
+      function RetiresFromLayoutEffect(): null {
+        // A layout effect commits before every passive effect of the same
+        // commit — including the sibling hook's own resynchronisation effect.
+        useLayoutEffect(() => {
+          void slot.retire();
+        }, []);
+        return null;
+      }
+
+      let thrown: unknown = null;
+      try {
+        render(
+          <ApplicationServicesProvider slot={slot}>
+            <RetiresFromLayoutEffect />
+            <ObservesDetail />
+          </ApplicationServicesProvider>,
+        );
+      } catch (caught) {
+        thrown = caught;
+      }
+
+      expect(thrown).toBeNull();
+      expect(captured.detail?.shown).toBe(true);
+      expect(captured.detail?.persists).toBe(false);
+    },
+  );
+});
```

### 7.13 `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts` — slice 3

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
index f08a08dd..8fa6a9fe 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
@@ -1,6 +1,10 @@
-import { useEffect, useState } from 'react';
+import { useEffect, useRef, useState } from 'react';

-import { rememberedPreferences } from '@/modules/preferences/composition';
+import type { RememberedPreferences } from '@/modules/preferences/contract';
+import {
+  useApplicationServicesReader,
+  useApplicationServicesState,
+} from '@/runtime/application-services-context';

 /**
  * The chart's **detail** switch, whole: the key it remembers, the reading of
@@ -24,28 +28,22 @@ import { rememberedPreferences } from '@/modules/preferences/composition';
  */

 /**
- * Where this browser remembers whether it has asked for the chart's detail.
+ * Reads the remembered answer, then drops the two keys this panel refuses — over
+ * one runtime's `remembered`, `wbs.ganttDetail` and the retired key alike.
  *
- * One key for the browser, and that is where this parts from
+ * `wbs.ganttDetail` is one key for the browser, and that is where it parts from
  * `wbs.ganttHeight.<projectId>` beside it: a panel height is one plan's share of
  * one screen, while detail on or off is an answer about a **feature** — a reader
  * who has turned sixty elbows off has turned them off, and having to say so
- * again in the next project is the fault this remembers away.
- *
+ * again in the next project is the fault this remembers away. It is
  * `wbs.ganttDetail` and no longer `wbs.ganttArrows`, because the switch no
- * longer answers about the arrows alone. See the retired-key note in
- * {@link rememberedDetail}.
- */
-const storedDetail = rememberedPreferences.ganttDetail;
-
-/**
- * Drops the two keys this panel refuses, then reads the remembered answer.
+ * longer answers about the arrows alone; see the retired-key note below.
  *
- * The chart's own starting answer is {@link readDetail}'s, not this function's
- * return — `true` for a plan with dependency edges, `false` without, and a
- * stored answer wherever this browser has said. This function exists for the
- * mount-effect **write** half of the read: the drop is a side effect and the
- * return is ignored by its one caller.
+ * The answer is {@link readDetail}'s, read **before** the drop, which is exactly
+ * what the chart opened on: a refused answer reads as off, and dropping it must
+ * not turn it into the never-said default in the same breath. The drop is the
+ * **write** half of the read, so this runs from the resynchronisation effect in
+ * {@link useGanttDetail} and never from a render.
  *
  * The stored value is a claim, not a fact: user-editable storage read at a
  * boundary. Anything that is not a boolean takes the key with it and the switch
@@ -57,7 +55,8 @@ const storedDetail = rememberedPreferences.ganttDetail;
  * reason: the alternative is a chart nobody can open until they clear storage by
  * hand, over a preference about a mark.
  */
-function rememberedDetail(): boolean {
+function rememberedDetail(remembered: RememberedPreferences, hasEdges: boolean): boolean {
+  const answer = readDetail(remembered, hasEdges);
   /**
    * The key the arrows-only switch wrote, for one day, between `gantt-declutter`
    * and `declutter-one-button`.
@@ -82,7 +81,7 @@ function rememberedDetail(): boolean {
   // Proof: making the repository's `forget` a no-op failed its adapter case
   // and three chart-detail cases; this one failed on `expected 'true' to be
   // null`. Observed 2026-09-20.
-  rememberedPreferences.retiredGanttArrows.forget();
+  remembered.retiredGanttArrows.forget();
   // Proof: this refusal replaced by `claimed === true || (typeof claimed ===
   // 'string' && claimed !== '')`, which is what "read the claim, drop nothing"
   // comes to. `2 failed | 89 passed`: `refuses a stored answer that is not a
@@ -95,29 +94,28 @@ function rememberedDetail(): boolean {
   // The answer is thrown away and the **drop** is the point: `readAndDrop`
   // removes a key whose contents this panel refuses, and `readDetail` below
   // then reads the same three states without writing.
-  storedDetail.readAndDrop();
-  return readDetail();
+  remembered.ganttDetail.readAndDrop();
+  return answer;
 }

 /**
  * The same read with **nothing written** — what a React render is allowed to
  * do.
  *
- * `useState(() => readDetail(hasDependencyEdges))` below is a lazy initialiser,
- * which React calls during
- * a render and StrictMode calls **twice** on purpose to surface exactly this:
- * {@link rememberedDetail} drops two keys, and dropping a key is a write. The
- * rule is the one this file already states over the switch's own handler — "a
- * state updater React may call twice is no place for a side effect" — and it
- * was being kept eleven hundred lines below where it was being broken. The
- * drops happen in a mount effect instead.
+ * {@link useGanttDetail}'s `useState` lazy initialiser calls this, which React
+ * calls during a render and StrictMode calls **twice** on purpose to surface
+ * exactly this: {@link rememberedDetail} drops two keys, and dropping a key is a
+ * write. The rule is the one this file already states over the switch's own
+ * handler — "a state updater React may call twice is no place for a side
+ * effect" — and it was being kept eleven hundred lines below where it was being
+ * broken. The drops happen in the resynchronisation effect instead.
  *
  * Nothing anybody can observe changed: `removeItem` is idempotent, and the
  * `DETAIL_KEY` drop only ever fires on a stored value this panel refuses. It is
  * a rule kept, not a defect fixed. Cross-review, 2026-08-12.
  */
-function readDetail(hasEdges = false): boolean {
-  const claimed = storedDetail.claim();
+function readDetail(remembered: RememberedPreferences, hasEdges: boolean): boolean {
+  const claimed = remembered.ganttDetail.claim();
   if (claimed.status === 'held') return claimed.value;
   // Nothing stored: the chart opens with the detail on for a plan that has
   // dependency edges — a first-time reader sees the arrows without hunting for
@@ -138,9 +136,9 @@ function readDetail(hasEdges = false): boolean {
  *
  * The read is the **initial state** rather than an effect, exactly as the panel
  * height is: an effect would draw every mark for one frame and then take them
- * away. The drops are a mount effect, because dropping a key is a write and a
- * lazy initialiser is a render React may call twice — StrictMode
- * double-invokes it on purpose to surface exactly that.
+ * away. The drops are an effect, because dropping a key is a write and a lazy
+ * initialiser is a render React may call twice — StrictMode double-invokes it
+ * on purpose to surface exactly that.
  *
  * `hasDependencyEdges` decides only the **never-said** case: a plan carrying
  * edges opens with the detail on, so a first-time reader sees the arrows a WBS
@@ -150,20 +148,91 @@ function readDetail(hasEdges = false): boolean {
 export interface GanttDetail {
   /** Whether the three families of mark are drawn. */
   shown: boolean;
-  /** Asks for the next answer, and remembers it. */
+  /** Asks for the next answer, and remembers it where a runtime is live to. */
   ask: (next: boolean) => void;
+  /**
+   * Whether this browser is remembering `shown`, as of the render that produced
+   * this value.
+   *
+   * React state, corrected by `ask` within its own call and by the
+   * resynchronisation effect after the commit the slot's own deferred
+   * notification caused — so, exactly as `lib/theme.ts`'s `Theme.persists`, a
+   * reader can still see `true` for a runtime that has already gone, which is
+   * why `ask` reads the runtime at the instant it runs instead of trusting this.
+   * Once converged it is the visible degradation rule R5 asks for.
+   */
+  persists: boolean;
 }

+/**
+ * The detail switch over whichever runtime the page is publishing — the state
+ * machine `lib/theme.ts`'s `useTheme` records, for a second answer the page
+ * keeps on screen.
+ *
+ * - **No runtime yet**: the never-said default (`hasDependencyEdges`), not
+ *   remembered; `ask` still turns the marks on and off.
+ * - **Live**: the stored answer, remembered; `ask` writes it first and shows it
+ *   second, so a store that refuses the write for a reason of its own
+ *   propagates, by identity, before anything on screen has moved.
+ * - **Withdrawn after live**: back to the never-said default, not remembered —
+ *   the default an unread key already produces — as soon as the slot's own
+ *   notification has committed, without waiting for the disposal.
+ * - **Replaced**: the replacement's own stored answer, remembered, with its
+ *   refused keys dropped.
+ *
+ * `ask` is superseded once a runtime other than the one its render read is live:
+ * it then changes nothing at all, neither the marks nor any store. It reads the
+ * runtime at the instant it runs, through {@link useApplicationServicesReader},
+ * so it can tell that apart from a runtime that has merely been withdrawn — and
+ * it never reaches a withdrawn or replaced runtime's store, so there is no
+ * lifecycle refusal for it to catch. The resynchronisation effect reads the
+ * runtime the same way, for the same reason: a passive effect runs after every
+ * layout effect of its commit, and a layout effect can retire the slot first.
+ */
 export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
-  const [shown, setShown] = useState(() => readDetail(hasDependencyEdges));
-  // The retired key, and any stored answer this panel refuses, dropped once
-  // after the first paint. The write half of the read above.
+  const services = useApplicationServicesState();
+  const readServices = useApplicationServicesReader();
+  const rendered = services.status === 'live' ? services.remembered : null;
+  const [shown, setShown] = useState(() =>
+    rendered === null ? hasDependencyEdges : readDetail(rendered, hasDependencyEdges),
+  );
+  const [persists, setPersists] = useState(() => rendered !== null);
+  /**
+   * The never-said default as it stands now, for the effect below — which
+   * re-runs when the published runtime changes, not when the plan's edges do:
+   * a plan whose edges arrive after the chart opened keeps the answer it opened
+   * on, as it always has.
+   */
+  const hasEdges = useRef(hasDependencyEdges);
+  hasEdges.current = hasDependencyEdges;
+
+  // On mount, on withdrawal and on every newly published runtime: resync to the
+  // runtime live **now**, and drop the keys it refuses. The write half of the
+  // read above.
   useEffect(() => {
-    rememberedDetail();
-  }, []);
+    const now = readServices();
+    if (now.status !== 'live') {
+      setShown(hasEdges.current);
+      setPersists(false);
+      return;
+    }
+    setShown(rememberedDetail(now.remembered, hasEdges.current));
+    setPersists(true);
+  }, [rendered, readServices]);
+
   return {
     shown,
+    persists,
     ask: (next) => {
+      const now = readServices();
+      const live = now.status === 'live' ? now.remembered : null;
+      // Superseded: a runtime this render never read is live. Nothing changes.
+      if (live !== null && live !== rendered) return;
+      if (live === null) {
+        setShown(next);
+        setPersists(false);
+        return;
+      }
       // Written here and nowhere else, so opening a chart never changes what is
       // remembered about it — the same bargain `rememberGanttHeight` makes with
       // a drag that is let go of.
@@ -173,8 +242,9 @@ export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
       // | 90 passed`, on `expected 'false' to be 'true'` — the switch back off
       // on the next mount. Watched 2026-08-11 over the arrows key, and again
       // 2026-08-12 over this one.
-      storedDetail.write(next);
+      live.ganttDetail.write(next);
       setShown(next);
+      setPersists(true);
     },
   };
 }
```

### 7.14 `spec.md` — slice 4, the scenario for the layout handle

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index f390a4ca..a30accf6 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -248,6 +248,15 @@ no access at all, as the requirement on degrading visibly already states.
   written in any store, nothing throws, and the returned value says the answer
   is not being remembered

+#### Scenario: A layout handle built before any runtime follows every runtime
+
+- **WHEN** a layout preference handle built when the page's modules loaded, before
+  any runtime existed, is used after runtimes have been published, withdrawn,
+  replaced, or left terminally failed
+- **THEN** each access reaches only the runtime live at that instant, drops a
+  refused value only from that runtime's store, and while none is live answers
+  that nothing is remembered without touching any store
+
 ### Requirement: Log out stays a local exit

 The Log out action SHALL send no request to the server and SHALL retire the
```

### 7.15 `apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts` — slice 4, **new file**

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
new file mode 100644
index 00000000..24ab1bdd
--- /dev/null
+++ b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
@@ -0,0 +1,694 @@
+import { DiBag, DiBagCloseCancelledError } from 'di-bag';
+import fc from 'fast-check';
+import { describe, expect, it } from 'vitest';
+
+import { remembered, type RuntimeRemembered } from '@/lib/remembered';
+import type { BrowserStorage } from '@/modules/preferences/contract';
+import {
+  fakeBrowserStorage,
+  type HeldByFake,
+  writeRefusingBrowserStorage,
+} from '@/modules/preferences/fake-browser-storage';
+import { MERMAID_SECTION_MODE_KEY } from '@/modules/preferences/preference-keys';
+import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';
+
+import { isSectionMode, SECTION_MODES, type SectionMode } from './plan-mermaid';
+
+/**
+ * The bounded wait the generated slot gives a disposal, in milliseconds.
+ *
+ * Only a `'never'` disposal ever spends it: every controlled wait this file adds
+ * happens **before** `RetirableRuntime.close` forwards `options` to DI Bag, so the
+ * budget covers the bag's own close alone. Large enough that a disposal which
+ * does settle cannot outrun it on a loaded host.
+ */
+const DISPOSAL_BUDGET_MS = 40;
+
+/** The one storage failure the refusing store raises, retained so identity can be asserted. */
+const WRITE_DENIED = new Error('write denied');
+
+/** The three stores a generated runtime can be installed over. */
+type StoreName = 'A' | 'B' | 'denied';
+
+const STORE_NAMES: readonly StoreName[] = ['A', 'B', 'denied'];
+
+/** How a published runtime's own disposal behaves when something withdraws it. */
+type Disposal = 'settles' | 'never';
+
+/** What one access through the handle is asked to do. */
+type Access = { readonly kind: 'read' } | { readonly kind: 'write'; readonly mode: SectionMode };
+
+/**
+ * How many times each command actually ran, across the **whole pinned run** — a
+ * property whose commands were all skipped by their own preconditions proves
+ * nothing, so every counter is asserted non-zero once `fc.assert` returns.
+ */
+const ran: Record<string, number> = {};
+
+function note(kind: string): void {
+  ran[kind] = (ran[kind] ?? 0) + 1;
+}
+
+const COMMAND_KINDS: readonly string[] = [
+  'replace',
+  'retire',
+  'access',
+  'tamper',
+  'accessWhileRetiring',
+  'accessFromNotification',
+  'accessWhileAcquiring',
+];
+
+/** Counts, additionally, the interleavings the invariants are actually about. */
+const reached = {
+  droppedRefusal: 0,
+  deniedWrite: 0,
+  expiredDisposal: 0,
+  accessWithNothingLive: 0,
+  accessAfterReplacement: 0,
+};
+
+/**
+ * The handle's state machine as a reference implementation that shares nothing
+ * with the production stores.
+ *
+ * `bytes` is the model's **own** record of what each store holds for the one key.
+ * It is never read back out of the fakes, which is what makes the storage
+ * assertion an oracle rather than a tautology.
+ */
+interface HandleModel {
+  /** The store of the runtime the slot publishes, or `null` while none is live. */
+  live: StoreName | null;
+  liveDisposal: Disposal;
+  /** True once a disposal outran its budget: the slot is fatal and publishes nothing again. */
+  terminal: boolean;
+  /** How many runtimes have been published, so a replacement can be told from a first. */
+  published: number;
+  bytes: Map<StoreName, string>;
+}
+
+/** A disposal this run can hold open, independently of the scheduler. */
+interface DisposalGate {
+  armed: boolean;
+  wait: () => Promise<void>;
+  release: () => void;
+}
+
+function createDisposalGate(): DisposalGate {
+  let release = (): void => undefined;
+  let blocking: Promise<void> | null = null;
+  const gate: DisposalGate = {
+    armed: false,
+    wait: async () => {
+      if (!gate.armed) return;
+      blocking ??= new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      await blocking;
+    },
+    release: () => {
+      gate.armed = false;
+      release();
+      blocking = null;
+      release = (): void => undefined;
+    },
+  };
+  return gate;
+}
+
+/** What one generated run drives: one slot, three stores, and the one handle. */
+interface HandleWorld {
+  readonly slot: LifetimeSlot<ApplicationServices>;
+  readonly stores: Record<StoreName, BrowserStorage & HeldByFake>;
+  /**
+   * Built once, before any runtime is published, and kept for the whole run —
+   * exactly how `remembered-layout.ts` builds `storedMermaidSectionMode` when the
+   * module loads.
+   */
+  readonly handle: RuntimeRemembered<SectionMode>;
+  readonly issued: { readonly label: string; readonly outcome: Promise<unknown> }[];
+  readonly gate: DisposalGate;
+  readonly scheduler: fc.Scheduler;
+  /** Refusals already verified by identity; teardown suppresses only these. */
+  readonly verifiedRefusals: Set<unknown>;
+  /** Whether the runtime published now will outrun its budget when teardown retires it. */
+  readonly liveDisposalHangs: { yes: boolean };
+}
+
+/**
+ * The runtime a generated `replace` publishes: the **production** installer over
+ * one of this run's stores, with the liveness predicate `acquireApplicationRuntime`
+ * wires in production.
+ *
+ * Its close waits on {@link DisposalGate}, then on a scheduled task — so the
+ * instant a disposal completes is the scheduler's to order — and `'never'` adds a
+ * real DI Bag disposer that never settles, so the bag's own bounded close raises
+ * `DiBagCloseCancelledError`: a controlled timeout out of DI Bag's own budget.
+ */
+function acquireOver(world: HandleWorld, target: StoreName, disposal: Disposal) {
+  return () => {
+    const installed = installApplicationRuntime({
+      openStore: () => world.stores[target],
+      isLive: () => world.slot.snapshot().status === 'live',
+    });
+    const hanging =
+      disposal === 'never'
+        ? DiBag.createBuilder()
+            .register({
+              held: DiBag.withDisposal(
+                DiBag.fromSyncFactory(() => target),
+                async () => new Promise<void>(() => undefined),
+              ),
+            })
+            .build()
+        : null;
+    hanging?.resolve('held');
+    return {
+      services: installed.services,
+      close: async (options: { timeoutMs: number }) => {
+        await world.gate.wait();
+        await world.scheduler.schedule(Promise.resolve(), `dispose ${target}`);
+        if (hanging !== null) await hanging.close(options);
+        await installed.close(options);
+      },
+    };
+  };
+}
+
+/** What the model says one access returns, and what it does to the model's bytes. */
+function expectedAccess(model: HandleModel, access: Access): unknown {
+  if (model.live === null) {
+    return access.kind === 'read' ? { value: null, persists: false } : false;
+  }
+  const live = model.live;
+  if (access.kind === 'write') {
+    if (live === 'denied') return WRITE_DENIED;
+    model.bytes.set(live, JSON.stringify(access.mode));
+    return true;
+  }
+  const stored = model.bytes.get(live);
+  if (stored === undefined) return { value: null, persists: true };
+  let parsed: unknown = undefined;
+  try {
+    parsed = JSON.parse(stored);
+  } catch {
+    // A hand-edited value that is not JSON at all: refused, exactly as one that
+    // parses to something other than a mode is.
+  }
+  if (isSectionMode(parsed)) return { value: parsed, persists: true };
+  model.bytes.delete(live);
+  reached.droppedRefusal += 1;
+  return { value: null, persists: true };
+}
+
+/**
+ * Runs one access through the handle and reports what came back — a value, or
+ * the failure it threw. Nothing is caught and dropped: the thrown value is the
+ * outcome, compared by identity.
+ */
+function perform(world: HandleWorld, access: Access): unknown {
+  try {
+    return access.kind === 'read' ? world.handle.readAndDrop() : world.handle.write(access.mode);
+  } catch (thrown) {
+    return thrown;
+  }
+}
+
+/** Asserts one access's outcome against the model's, by identity for a failure. */
+function assertAccess(
+  model: HandleModel,
+  observed: unknown,
+  expected: unknown,
+  what: string,
+): void {
+  if (expected === WRITE_DENIED) {
+    reached.deniedWrite += 1;
+    expect(observed, `${what}: an ordinary storage failure did not propagate unchanged`).toBe(
+      WRITE_DENIED,
+    );
+    return;
+  }
+  if (model.live === null) reached.accessWithNothingLive += 1;
+  else if (model.published > 1) reached.accessAfterReplacement += 1;
+  expect(observed, `${what}: what the handle answered`).toEqual(expected);
+}
+
+/** What every store holds for the key, against the model's own record. */
+function assertBytes(model: HandleModel, world: HandleWorld): void {
+  for (const name of STORE_NAMES) {
+    expect(world.stores[name].held()[MERMAID_SECTION_MODE_KEY], `stored bytes in ${name}`).toBe(
+      model.bytes.get(name),
+    );
+  }
+  // The page's own store is never a fallback for a runtime that is not there.
+  expect(localStorage.getItem(MERMAID_SECTION_MODE_KEY), 'the page’s own store').toBeNull();
+}
+
+function expectsRefusal(model: HandleModel): boolean {
+  return model.terminal || (model.live !== null && model.liveDisposal === 'never');
+}
+
+/**
+ * Whether a refusal is the slot's own **budget expiry** and nothing else — the
+ * class, `reason: 'timeout'` and the retained cleanup promise that
+ * `lifetime-slot.ts`'s own `lateCleanupOf` reads.
+ */
+function isDisposalExpiry(refusal: unknown): refusal is DiBagCloseCancelledError {
+  return (
+    refusal instanceof DiBagCloseCancelledError &&
+    refusal.reason === 'timeout' &&
+    refusal.cleanupPromise instanceof Promise
+  );
+}
+
+/** Asserts a transition refused exactly when, and why, the model says it must. */
+function assertRefusal(
+  model: HandleModel,
+  world: HandleWorld,
+  refusal: unknown,
+  what: string,
+): void {
+  if (!expectsRefusal(model)) {
+    expect(refusal, `${what}: a transition refused unexpectedly`).toBeNull();
+    return;
+  }
+  expect(refusal, `${what}: an expiring or terminal transition did not refuse`).not.toBeNull();
+  if (model.terminal) {
+    expect(
+      world.verifiedRefusals.has(refusal),
+      `${what}: a terminal slot refused with a failure nothing had verified: ${String(refusal)}`,
+    ).toBe(true);
+    return;
+  }
+  expect(
+    isDisposalExpiry(refusal),
+    `${what}: the disposal did not expire the way the slot's budget expires; it failed some other way: ${String(refusal)}`,
+  ).toBe(true);
+  world.verifiedRefusals.add(refusal);
+  reached.expiredDisposal += 1;
+}
+
+/** Awaits one issued transition, through the scheduler, and returns what it refused with. */
+async function settle(
+  world: HandleWorld,
+  label: string,
+  outcome: Promise<unknown>,
+): Promise<unknown> {
+  world.issued.push({ label, outcome });
+  let refusal: unknown = null;
+  try {
+    await world.scheduler.waitFor(outcome);
+  } catch (caught) {
+    refusal = caught;
+  }
+  await world.scheduler.waitIdle();
+  return refusal;
+}
+
+function applyWithdrawn(model: HandleModel): void {
+  model.live = null;
+  model.liveDisposal = 'settles';
+}
+
+function applyPublished(model: HandleModel, target: StoreName, disposal: Disposal): void {
+  model.live = target;
+  model.liveDisposal = disposal;
+  model.published += 1;
+}
+
+type HandleCommand = fc.AsyncCommand<HandleModel, HandleWorld>;
+
+const describeAccess = (access: Access): string =>
+  access.kind === 'read' ? 'read' : `write(${access.mode})`;
+
+/** Replacement by a runtime over `target`, disposing the named way when withdrawn. */
+class Replace implements HandleCommand {
+  constructor(
+    readonly target: StoreName,
+    readonly disposal: Disposal,
+  ) {}
+  check(model: HandleModel): boolean {
+    return !model.terminal;
+  }
+  async run(model: HandleModel, world: HandleWorld): Promise<void> {
+    note('replace');
+    const expiring = expectsRefusal(model);
+    const refusal = await settle(
+      world,
+      `replace(${this.target})`,
+      world.slot.replace(acquireOver(world, this.target, this.disposal)),
+    );
+    assertRefusal(model, world, refusal, `replace(${this.target})`);
+    if (expiring) {
+      model.terminal = true;
+      applyWithdrawn(model);
+    } else {
+      applyPublished(model, this.target, this.disposal);
+    }
+    world.liveDisposalHangs.yes = model.live !== null && model.liveDisposal === 'never';
+    assertBytes(model, world);
+  }
+  toString(): string {
+    return `replace(${this.target}, ${this.disposal})`;
+  }
+}
+
+class Retire implements HandleCommand {
+  check(model: HandleModel): boolean {
+    return model.live !== null && !model.terminal;
+  }
+  async run(model: HandleModel, world: HandleWorld): Promise<void> {
+    note('retire');
+    const expiring = expectsRefusal(model);
+    const refusal = await settle(world, 'retire', world.slot.retire());
+    assertRefusal(model, world, refusal, 'retire');
+    if (expiring) model.terminal = true;
+    applyWithdrawn(model);
+    world.liveDisposalHangs.yes = false;
+    assertBytes(model, world);
+  }
+  toString(): string {
+    return 'retire';
+  }
+}
+
+/** One access through the handle, at whatever the slot is publishing now. */
+class AccessNow implements HandleCommand {
+  constructor(readonly access: Access) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: HandleModel, world: HandleWorld): Promise<void> {
+    note('access');
+    const observed = perform(world, this.access);
+    assertAccess(model, observed, expectedAccess(model, this.access), describeAccess(this.access));
+    await Promise.resolve();
+    assertBytes(model, world);
+  }
+  toString(): string {
+    return describeAccess(this.access);
+  }
+}
+
+/**
+ * A hand-edited value, written straight into one of the two ordinary stores —
+ * never through the handle. The refusing store takes no writes by design.
+ */
+class Tamper implements HandleCommand {
+  constructor(
+    readonly target: 'A' | 'B',
+    readonly raw: string,
+  ) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: HandleModel, world: HandleWorld): Promise<void> {
+    note('tamper');
+    world.stores[this.target].write(MERMAID_SECTION_MODE_KEY, this.raw);
+    model.bytes.set(this.target, this.raw);
+    await Promise.resolve();
+    assertBytes(model, world);
+  }
+  toString(): string {
+    return `tamper(${this.target}, ${this.raw})`;
+  }
+}
+
+/**
+ * An access while a retirement's **disposal is held open**: the slot has
+ * withdrawn publication and the runtime has not let go yet — the window a handle
+ * that remembered the last live store would still write into.
+ */
+class AccessWhileRetiring implements HandleCommand {
+  constructor(readonly access: Access) {}
+  check(model: HandleModel): boolean {
+    return model.live !== null && model.liveDisposal === 'settles' && !model.terminal;
+  }
+  async run(model: HandleModel, world: HandleWorld): Promise<void> {
+    note('accessWhileRetiring');
+    world.gate.armed = true;
+    const outcome = world.slot.retire();
+    world.issued.push({ label: 'retire holding disposal', outcome });
+    applyWithdrawn(model);
+    let refusal: unknown = null;
+    try {
+      const observed = perform(world, this.access);
+      assertAccess(
+        model,
+        observed,
+        expectedAccess(model, this.access),
+        `${describeAccess(this.access)} while retiring`,
+      );
+      assertBytes(model, world);
+    } finally {
+      world.gate.release();
+      try {
+        await world.scheduler.waitFor(outcome);
+      } catch (caught) {
+        refusal = caught;
+      }
+      await world.scheduler.waitIdle();
+    }
+    expect(refusal, 'a held-open retirement refused once released').toBeNull();
+    world.liveDisposalHangs.yes = false;
+    assertBytes(model, world);
+  }
+  toString(): string {
+    return `accessWhileRetiring(${describeAccess(this.access)})`;
+  }
+}
+
+/**
+ * An access issued from **inside** the slot's own notification of a retirement —
+ * re-entrant, and delivered when the scheduler says: before the old runtime has
+ * finished letting go, or after.
+ */
+class AccessFromNotification implements HandleCommand {
+  constructor(readonly access: Access) {}
+  check(model: HandleModel): boolean {
+    return model.live !== null && model.liveDisposal === 'settles' && !model.terminal;
+  }
+  async run(model: HandleModel, world: HandleWorld): Promise<void> {
+    note('accessFromNotification');
+    const heard: { observed: unknown; delivered: boolean } = { observed: null, delivered: false };
+    let armed = true;
+    const unsubscribe = world.slot.subscribe(() => {
+      if (!armed) return;
+      armed = false;
+      void world.scheduler.schedule(Promise.resolve(), 'deliver the slot notification').then(() => {
+        heard.delivered = true;
+        heard.observed = perform(world, this.access);
+      });
+    });
+    try {
+      const refusal = await settle(world, 'retire from notification', world.slot.retire());
+      assertRefusal(model, world, refusal, 'retire from notification');
+      applyWithdrawn(model);
+      world.liveDisposalHangs.yes = false;
+      expect(heard.delivered, 'the notification was never delivered').toBe(true);
+      assertAccess(
+        model,
+        heard.observed,
+        expectedAccess(model, this.access),
+        `${describeAccess(this.access)} from a notification`,
+      );
+      assertBytes(model, world);
+    } finally {
+      unsubscribe();
+    }
+  }
+  toString(): string {
+    return `accessFromNotification(${describeAccess(this.access)})`;
+  }
+}
+
+/**
+ * An access while a replacement has only **partially acquired** its graph: the
+ * factory has built the new runtime and not returned it, so nothing is live.
+ */
+class AccessWhileAcquiring implements HandleCommand {
+  constructor(
+    readonly target: StoreName,
+    readonly access: Access,
+  ) {}
+  check(model: HandleModel): boolean {
+    return !model.terminal && model.liveDisposal === 'settles';
+  }
+  async run(model: HandleModel, world: HandleWorld): Promise<void> {
+    note('accessWhileAcquiring');
+    const acquire = acquireOver(world, this.target, 'settles');
+    const inside: { observed: unknown } = { observed: null };
+    const refusal = await settle(
+      world,
+      `accessWhileAcquiring(${this.target})`,
+      world.slot.replace(() => {
+        const acquired = acquire();
+        inside.observed = perform(world, this.access);
+        return acquired;
+      }),
+    );
+    assertRefusal(model, world, refusal, `accessWhileAcquiring(${this.target})`);
+    applyWithdrawn(model);
+    assertAccess(
+      model,
+      inside.observed,
+      expectedAccess(model, this.access),
+      `${describeAccess(this.access)} while acquiring`,
+    );
+    applyPublished(model, this.target, 'settles');
+    world.liveDisposalHangs.yes = false;
+    assertBytes(model, world);
+  }
+  toString(): string {
+    return `accessWhileAcquiring(${this.target}, ${describeAccess(this.access)})`;
+  }
+}
+
+const modeArb = fc.constantFrom<SectionMode>(...SECTION_MODES);
+const accessArb: fc.Arbitrary<Access> = fc.oneof(
+  fc.constant<Access>({ kind: 'read' }),
+  modeArb.map((mode): Access => ({ kind: 'write', mode })),
+);
+const storeArb = fc.constantFrom<StoreName>('A', 'B', 'denied');
+const disposalArb = fc.constantFrom<Disposal>('settles', 'never');
+/** A stored value that is a mode, one that parses to something else, and one that does not parse. */
+const rawArb = fc.constantFrom('"step"', '"assignees"', '7', '{not json');
+
+const commandsArb = fc.commands<HandleModel, HandleWorld, false>(
+  [
+    fc.tuple(storeArb, disposalArb).map(([target, disposal]) => new Replace(target, disposal)),
+    fc.constant(new Retire()),
+    accessArb.map((access) => new AccessNow(access)),
+    fc
+      .tuple(fc.constantFrom<'A' | 'B'>('A', 'B'), rawArb)
+      .map(([target, raw]) => new Tamper(target, raw)),
+    accessArb.map((access) => new AccessWhileRetiring(access)),
+    accessArb.map((access) => new AccessFromNotification(access)),
+    fc
+      .tuple(storeArb, accessArb)
+      .map(([target, access]) => new AccessWhileAcquiring(target, access)),
+  ],
+  { maxCommands: 12 },
+);
+
+/**
+ * Gives every runtime back and **reports** what refused. Only a refusal this run
+ * already verified by identity, or the budget expiry of a runtime the commands
+ * knowingly left hanging, is suppressed; every other cleanup rejection is
+ * returned, because a cleanup failure nobody reported is a failure of this test.
+ */
+async function giveEverythingBack(world: HandleWorld): Promise<Error[]> {
+  const unreported: Error[] = [];
+  world.gate.release();
+  world.issued.push({ label: 'teardown retire', outcome: world.slot.retire() });
+  for (const { label, outcome } of [...world.issued]) {
+    try {
+      await world.scheduler.waitFor(outcome);
+    } catch (refusal) {
+      if (world.verifiedRefusals.has(refusal)) continue;
+      if (world.liveDisposalHangs.yes && isDisposalExpiry(refusal)) {
+        world.verifiedRefusals.add(refusal);
+        continue;
+      }
+      unreported.push(new Error(`${label} refused during teardown with: ${String(refusal)}`));
+    }
+  }
+  await world.scheduler.waitIdle();
+  return unreported;
+}
+
+/**
+ * The browser-wide Mermaid lane's handle, run against a reference model.
+ *
+ * The record this executes is section 3 of
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f2-delivery-call-sites.md`.
+ * The slot, the installer, the preferences module and `lib/remembered.ts` are the
+ * production ones; only the browser stores, the instant a disposal completes and
+ * the instant a notification is delivered are this file's — and the last two are
+ * the scheduler's to order.
+ */
+describe('the Mermaid lane’s handle, against a reference model', () => {
+  it('answers and stores exactly what the model says, under generated interleavings', async () => {
+    // The counterexamples this file's own packet records were observed under the
+    // frozen lockfile's fast-check; a different version reorders generation.
+    expect(fc.__version, 'the pinned counterexamples were recorded under 4.9.0').toBe('4.9.0');
+
+    await fc.assert(
+      fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
+        const slot = createLifetimeSlot<ApplicationServices>(DISPOSAL_BUDGET_MS);
+        const world: HandleWorld = {
+          slot,
+          stores: {
+            A: fakeBrowserStorage(),
+            B: fakeBrowserStorage(),
+            denied: writeRefusingBrowserStorage(WRITE_DENIED),
+          },
+          handle: remembered(MERMAID_SECTION_MODE_KEY, isSectionMode, slot),
+          issued: [],
+          gate: createDisposalGate(),
+          scheduler,
+          verifiedRefusals: new Set<unknown>(),
+          liveDisposalHangs: { yes: false },
+        };
+
+        let failure: Error | null = null;
+        try {
+          await fc.asyncModelRun<HandleModel, HandleWorld, false, HandleModel>(
+            () => ({
+              model: {
+                live: null,
+                liveDisposal: 'settles',
+                terminal: false,
+                published: 0,
+                bytes: new Map<StoreName, string>(),
+              },
+              real: world,
+            }),
+            commands,
+          );
+        } catch (caught) {
+          // Kept as an `Error` so it can be rethrown or carried as a `cause`
+          // without a cast; anything else is still reported rather than dropped.
+          failure = caught instanceof Error ? caught : new Error(String(caught));
+        }
+        // Teardown runs whatever happened, and its own refusals are aggregated with
+        // an assertion failure so neither hides the other.
+        const unreported = await giveEverythingBack(world);
+        if (unreported.length === 0) {
+          if (failure !== null) throw failure;
+          return;
+        }
+        const refusals = unreported.map((refusal) => String(refusal)).join(' | ');
+        if (failure === null) throw new Error(`teardown refused: ${refusals}`);
+        throw new Error(`the property failed and its teardown refused: ${refusals}`, {
+          cause: failure,
+        });
+      }),
+      { seed: 20260924, numRuns: 300 },
+    );
+
+    for (const kind of COMMAND_KINDS) {
+      expect(ran[kind] ?? 0, `the pinned run never executed ${kind}`).toBeGreaterThan(0);
+    }
+    expect(reached.droppedRefusal, 'the pinned run never dropped a refused value').toBeGreaterThan(
+      0,
+    );
+    expect(
+      reached.deniedWrite,
+      'the pinned run never wrote into a store that refuses writes',
+    ).toBeGreaterThan(0);
+    expect(
+      reached.expiredDisposal,
+      'the pinned run never let a disposal outrun its budget',
+    ).toBeGreaterThan(0);
+    expect(
+      reached.accessWithNothingLive,
+      'the pinned run never accessed the handle while nothing was live',
+    ).toBeGreaterThan(0);
+    expect(
+      reached.accessAfterReplacement,
+      'the pinned run never accessed the handle after a replacement',
+    ).toBeGreaterThan(0);
+  }, 300_000);
+});
```

### 7.16 `apps/wbs/fe-01/src/lib/remembered.ts` — slice 4, the call-time handle

`rememberedText` is removed with the composition import: it has no caller (section 4.1).

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
index 17007be5..a97bc1a1 100644
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -1,5 +1,6 @@
-import { browserPreferences } from '@/modules/preferences/composition';
 import type { Claim, Remembered } from '@/modules/preferences/contract';
+import { type ApplicationServices, applicationSlot } from '@/runtime/application-runtime';
+import type { LifetimeSlot } from '@/runtime/lifetime-slot';

 export type { Claim, Remembered };

@@ -20,24 +21,80 @@ export interface Recalled<T> {
 }

 /**
- * The store for one key, judged by one guard — the preferences service's now.
+ * One JSON-written key, resolved against the runtime the page's slot is
+ * publishing **at the instant of each call** — never at the instant the handle
+ * was built.
+ *
+ * Every member reads `slot.snapshot()` first and reaches that runtime's own
+ * preferences resource only while it is `live`. So a handle built at module
+ * load — `remembered-layout.ts`'s browser-wide `storedMermaidSectionMode`,
+ * before any runtime exists — and kept for the life of the page follows every
+ * replacement, and never reaches a runtime that has been withdrawn, retired or
+ * replaced: it holds no store to go stale.
+ */
+export interface RuntimeRemembered<T> {
+  /**
+   * The stored value, dropping a key whose contents are no longer a `T` — or
+   * `null` where none is stored. Not persisted, and nothing read or dropped,
+   * when no runtime is live.
+   */
+  readAndDrop(): Recalled<T | null>;
+  /** Writes `value`, answering whether a live runtime took it. */
+  write(value: T): boolean;
+  /** Removes the key, answering whether a live runtime was there to remove it from. */
+  forget(): boolean;
+}
+
+/**
+ * The store for one key, judged by one guard, over the page's own runtime — see
+ * {@link RuntimeRemembered} for when that runtime is resolved.
  *
  * Kept as a free function at this path because the layout module builds a store
  * per project id and imports it here, and an extraction that renamed every call
  * site would be a diff nobody can review against "no behaviour changed". The
  * knowledge moved; the spelling did not.
+ *
+ * It reads the runtime's `preferences` resource — the generic factory, which is
+ * the one reason that resource is a public export of the preferences module and
+ * of `ApplicationServices` (recorded K2 debt: see `PreferencesExports`). That is
+ * also why this is not a React hook: the per-project layout stores are called
+ * from effects, handlers and lazy initialisers alike, and the resource is never
+ * published into a React context.
+ *
+ * `slot` defaults to the page's one slot; a test passes its own, and nothing
+ * else does.
+ *
+ * @throws whatever a live runtime's store throws — a browser with site data
+ * blocked — unchanged. With no runtime live, nothing throws: the typed
+ * {@link Recalled} and the `false` a write answers are the outcome.
  */
 export function remembered<T>(
   key: string,
   isValid: (claimed: unknown) => claimed is T,
-): Remembered<T> {
-  return browserPreferences.json(key, isValid);
-}
-
-/** The same store for a key written as **bare text** rather than as JSON. */
-export function rememberedText<T extends string>(
-  key: string,
-  isValid: (stored: string) => stored is T,
-): Remembered<T> {
-  return browserPreferences.text(key, isValid);
+  slot: LifetimeSlot<ApplicationServices> = applicationSlot,
+): RuntimeRemembered<T> {
+  /** The live runtime's own store for this key, right now — or none. */
+  const storeNow = (): Remembered<T> | null => {
+    const state = slot.snapshot();
+    return state.status === 'live' ? state.services.preferences.json(key, isValid) : null;
+  };
+  return {
+    readAndDrop: () => {
+      const store = storeNow();
+      if (store === null) return { value: null, persists: false };
+      return { value: store.readAndDrop(), persists: true };
+    },
+    write: (value) => {
+      const store = storeNow();
+      if (store === null) return false;
+      store.write(value);
+      return true;
+    },
+    forget: () => {
+      const store = storeNow();
+      if (store === null) return false;
+      store.forget();
+      return true;
+    },
+  };
 }
```

### 7.17 `apps/wbs/fe-01/src/components/wbs/remembered-layout.ts` — slice 4

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/remembered-layout.ts b/apps/wbs/fe-01/src/components/wbs/remembered-layout.ts
index e4373e63..f424d830 100644
--- a/apps/wbs/fe-01/src/components/wbs/remembered-layout.ts
+++ b/apps/wbs/fe-01/src/components/wbs/remembered-layout.ts
@@ -1,6 +1,6 @@
 import { type ExpandedState } from '@tanstack/react-table';

-import { type Remembered, remembered } from '@/lib/remembered';
+import { type Recalled, remembered, type RuntimeRemembered } from '@/lib/remembered';
 import {
   expansionKey,
   ganttDayPxKey,
@@ -38,7 +38,7 @@ export {
 };

 /** One project's expansion, judged by {@link isExpansion} — see {@link remembered}. */
-export const storedExpansion = (projectId: string): Remembered<ExpandedState> =>
+export const storedExpansion = (projectId: string): RuntimeRemembered<ExpandedState> =>
   remembered(expansionKey(projectId), isExpansion);

 /**
@@ -77,12 +77,14 @@ export function isExpansion(value: unknown): value is ExpandedState {
  *   over: the alternative is a fourth state to keep in step with the other
  *   three.
  */
-export function rememberedExpansion(projectId: string): ExpandedState {
-  return storedExpansion(projectId).readAndDrop() ?? true;
+export function rememberedExpansion(projectId: string): Recalled<ExpandedState> {
+  const recalled = storedExpansion(projectId).readAndDrop();
+  return { value: recalled.value ?? true, persists: recalled.persists };
 }

-export function rememberExpansion(projectId: string, expanded: ExpandedState): void {
-  storedExpansion(projectId).write(expanded);
+/** Writes the expansion in force for `projectId`, answering whether a live runtime took it. */
+export function rememberExpansion(projectId: string, expanded: ExpandedState): boolean {
+  return storedExpansion(projectId).write(expanded);
 }

 /**
@@ -90,7 +92,9 @@ export function rememberExpansion(projectId: string, expanded: ExpandedState): v
  * table holds, because the two are different shapes and only one of them is
  * JSON. Per-entry sanitising is {@link rememberedWidthOverrides}'s.
  */
-export const storedWidthOverrides = (projectId: string): Remembered<Record<string, number>> =>
+export const storedWidthOverrides = (
+  projectId: string,
+): RuntimeRemembered<Record<string, number>> =>
   remembered(widthOverridesKey(projectId), isWidthOverrides);

 /**
@@ -101,7 +105,7 @@ export const storedWidthOverrides = (projectId: string): Remembered<Record<strin
  * not a height this app wrote, and `1e999` parses to an `Infinity` above every
  * ceiling.
  */
-export const storedGanttHeight = (projectId: string): Remembered<number> =>
+export const storedGanttHeight = (projectId: string): RuntimeRemembered<number> =>
   remembered(
     ganttHeightKey(projectId),
     (claimed): claimed is number =>
@@ -125,7 +129,7 @@ export const storedGanttHeight = (projectId: string): Remembered<number> =>
  * rememberedWidthOverrides}'s reason: the alternative is a chart nobody can
  * open until they clear storage by hand, over a preference about its height.
  */
-export function rememberedGanttHeight(projectId: string): number | null {
+export function rememberedGanttHeight(projectId: string): Recalled<number | null> {
   // Proof: the range dropped from `storedGanttHeight`'s guard, leaving
   // `typeof claimed === 'number'`. `refuses a height below the floor, and drops
   // the key` failed on `expected '10px' to be ''` and `refuses a height above
@@ -144,12 +148,12 @@ export function rememberedGanttHeight(projectId: string): number | null {
  * rememberWidthOverrides}'s reason: opening a project must not change what is
  * remembered about it.
  */
-export function rememberGanttHeight(projectId: string, heightPx: number): void {
-  storedGanttHeight(projectId).write(heightPx);
+export function rememberGanttHeight(projectId: string, heightPx: number): boolean {
+  return storedGanttHeight(projectId).write(heightPx);
 }

 /** One project's day scale, judged against the same `DAY_SCALES` the control offers. */
-export const storedGanttDayPx = (projectId: string): Remembered<DayPx> =>
+export const storedGanttDayPx = (projectId: string): RuntimeRemembered<DayPx> =>
   remembered(ganttDayPxKey(projectId), isDayPx);

 /**
@@ -167,7 +171,7 @@ export const storedGanttDayPx = (projectId: string): Remembered<DayPx> =>
  * {@link rememberedGanttHeight}'s reason: the alternative is a chart nobody can
  * open until they clear storage by hand, over a preference about its zoom.
  */
-export function rememberedGanttDayPx(projectId: string): DayPx | null {
+export function rememberedGanttDayPx(projectId: string): Recalled<DayPx | null> {
   return storedGanttDayPx(projectId).readAndDrop();
 }

@@ -178,13 +182,13 @@ export function rememberedGanttDayPx(projectId: string): DayPx | null {
  * {@link rememberGanttHeight}'s reason: opening a project must not change what
  * is remembered about it.
  */
-export function rememberGanttDayPx(projectId: string, dayPx: DayPx): void {
-  storedGanttDayPx(projectId).write(dayPx);
+export function rememberGanttDayPx(projectId: string, dayPx: DayPx): boolean {
+  return storedGanttDayPx(projectId).write(dayPx);
 }

 /** Forgets the remembered day scale for `projectId` — the third part of a {@link Layout reset}. */
-export function forgetGanttDayPx(projectId: string): void {
-  storedGanttDayPx(projectId).forget();
+export function forgetGanttDayPx(projectId: string): boolean {
+  return storedGanttDayPx(projectId).forget();
 }

 /**
@@ -194,7 +198,7 @@ export function forgetGanttDayPx(projectId: string): void {
  * `false` is a real stored answer that a `??` would eat — which is why the
  * caller keeps the `boolean | null` this answers with.
  */
-export const storedGanttLabels = (projectId: string): Remembered<boolean> =>
+export const storedGanttLabels = (projectId: string): RuntimeRemembered<boolean> =>
   remembered(
     ganttLabelsKey(projectId),
     (claimed): claimed is boolean => typeof claimed === 'boolean',
@@ -212,7 +216,7 @@ export const storedGanttLabels = (projectId: string): Remembered<boolean> =>
  * Deliberately not the "unknown is not OK" throw, for
  * {@link rememberedGanttHeight}'s reason.
  */
-export function rememberedGanttLabels(projectId: string): boolean | null {
+export function rememberedGanttLabels(projectId: string): Recalled<boolean | null> {
   return storedGanttLabels(projectId).readAndDrop();
 }

@@ -222,13 +226,13 @@ export function rememberedGanttLabels(projectId: string): boolean | null {
  * Called when the control is used and at no other time, for
  * {@link rememberGanttDayPx}'s reason.
  */
-export function rememberGanttLabels(projectId: string, labelsShown: boolean): void {
-  storedGanttLabels(projectId).write(labelsShown);
+export function rememberGanttLabels(projectId: string, labelsShown: boolean): boolean {
+  return storedGanttLabels(projectId).write(labelsShown);
 }

 /** Forgets the remembered name column for `projectId` — the fourth part of a {@link Layout reset}. */
-export function forgetGanttLabels(projectId: string): void {
-  storedGanttLabels(projectId).forget();
+export function forgetGanttLabels(projectId: string): boolean {
+  return storedGanttLabels(projectId).forget();
 }

 /**
@@ -243,7 +247,17 @@ export function forgetGanttLabels(projectId: string): void {
  * a status update wants them lane-coloured in every plan, and having to say so
  * again in the next one is the fault this remembers away.
  */
-/** The Mermaid lane, judged against the modes `sectionOf` has a branch for. */
+/**
+ * The Mermaid lane, judged against the modes `sectionOf` has a branch for.
+ *
+ * Built once, when this module loads — before the page has any runtime — and
+ * kept for the life of the page. That is safe only because {@link remembered}
+ * resolves the runtime at every call rather than at this line: the handle holds
+ * no store, so it follows each replacement and reaches nothing once the runtime
+ * is withdrawn. `docs/superpowers/plans/2026-09-21-batch-6/050-7-f2-delivery-call-sites.md`
+ * section 3 records the state machine, and `remembered-layout.model.test.ts` runs
+ * it against a reference model.
+ */
 export const storedMermaidSectionMode = remembered(MERMAID_SECTION_MODE_KEY, isSectionMode);

 /**
@@ -263,7 +277,7 @@ export const storedMermaidSectionMode = remembered(MERMAID_SECTION_MODE_KEY, isS
  * open until they clear storage by hand, over a preference about a `section`
  * line.
  */
-export function rememberedMermaidSectionMode(): SectionMode | null {
+export function rememberedMermaidSectionMode(): Recalled<SectionMode | null> {
   // Proof: `readAndDrop` replaced by `read`, which is what "read the claim,
   // drop nothing" comes to. `refuses a remembered lane this app does not offer,
   // and drops the key` failed on `expected '"assignees"' to be null` and
@@ -283,8 +297,8 @@ export function rememberedMermaidSectionMode(): SectionMode | null {
  * {@link rememberGanttLabels}'s reason: opening a plan must not write to what
  * is remembered about it.
  */
-export function rememberMermaidSectionMode(sectionMode: SectionMode): void {
-  storedMermaidSectionMode.write(sectionMode);
+export function rememberMermaidSectionMode(sectionMode: SectionMode): boolean {
+  return storedMermaidSectionMode.write(sectionMode);
 }

 /**
@@ -295,8 +309,8 @@ export function rememberMermaidSectionMode(sectionMode: SectionMode): void {
  * its default share as it stands then, exactly as the columns return to what
  * the frame layout resolves now.
  */
-export function forgetGanttHeight(projectId: string): void {
-  storedGanttHeight(projectId).forget();
+export function forgetGanttHeight(projectId: string): boolean {
+  return storedGanttHeight(projectId).forget();
 }

 /**
@@ -368,9 +382,10 @@ export function isWidthOverrides(value: unknown): value is Record<string, number
  * rememberedExpansion}'s reason: the alternative is a plan nobody can open
  * until they clear storage by hand, over a preference about a column.
  */
-export function rememberedWidthOverrides(projectId: string): Map<string, number> {
-  const claimed = storedWidthOverrides(projectId).readAndDrop();
-  if (claimed === null) return new Map();
+export function rememberedWidthOverrides(projectId: string): Recalled<Map<string, number>> {
+  const recalled = storedWidthOverrides(projectId).readAndDrop();
+  const claimed = recalled.value;
+  if (claimed === null) return { value: new Map(), persists: recalled.persists };
   const kept = new Map<string, number>();
   for (const [columnId, width] of Object.entries(claimed)) {
     if (!sizableColumn(columnId, STATE_AT_MOUNT)) continue;
@@ -385,7 +400,7 @@ export function rememberedWidthOverrides(projectId: string): Map<string, number>
     if (width < floorFor(columnId, STATE_AT_MOUNT) || width > WIDEST_COLUMN) continue;
     kept.set(columnId, width);
   }
-  return kept;
+  return { value: kept, persists: recalled.persists };
 }

 /**
@@ -399,8 +414,8 @@ export function rememberedWidthOverrides(projectId: string): Map<string, number>
 export function rememberWidthOverrides(
   projectId: string,
   overrides: ReadonlyMap<string, number>,
-): void {
-  storedWidthOverrides(projectId).write(Object.fromEntries(overrides));
+): boolean {
+  return storedWidthOverrides(projectId).write(Object.fromEntries(overrides));
 }

 /**
@@ -412,15 +427,15 @@ export function rememberWidthOverrides(
  * stored here is that promise broken: a column whose default has changed since
  * the drag would come back to the old one.
  */
-export function forgetWidthOverrides(projectId: string): void {
-  storedWidthOverrides(projectId).forget();
+export function forgetWidthOverrides(projectId: string): boolean {
+  return storedWidthOverrides(projectId).forget();
 }

 /** One project's hide-list, judged by {@link isStringArray}. */
-export const storedHiddenColumns = (projectId: string): Remembered<readonly string[]> =>
+export const storedHiddenColumns = (projectId: string): RuntimeRemembered<readonly string[]> =>
   remembered(hiddenColumnsKey(projectId), isStringArray);

-export const storedLinksResetShown = (projectId: string): Remembered<true> =>
+export const storedLinksResetShown = (projectId: string): RuntimeRemembered<true> =>
   remembered(linksResetShownKey(projectId), (value): value is true => value === true);

 /**
@@ -453,12 +468,14 @@ export const storedLinksResetShown = (projectId: string): Remembered<true> =>
  * component as a list; with only the `removeItem` deleted, on `expected '4' to
  * be null`. Watched, 2026-08-28.
  */
-export function rememberedHiddenColumns(projectId: string): readonly string[] {
+export function rememberedHiddenColumns(projectId: string): Recalled<readonly string[]> {
   const explicit = storedHiddenColumns(projectId).readAndDrop();
-  if (explicit !== null) return explicit;
-  return storedLinksResetShown(projectId).readAndDrop() === true
-    ? resetHiddenColumns(true)
-    : INITIAL_HIDDEN_COLUMNS;
+  if (explicit.value !== null) return { value: explicit.value, persists: explicit.persists };
+  const marker = storedLinksResetShown(projectId).readAndDrop();
+  return {
+    value: marker.value === true ? resetHiddenColumns(true) : INITIAL_HIDDEN_COLUMNS,
+    persists: explicit.persists && marker.persists,
+  };
 }

 /**
@@ -468,9 +485,10 @@ export function rememberedHiddenColumns(projectId: string): readonly string[] {
  * applies a saved view that carries a column set, and at no other time — see
  * {@link rememberedHiddenColumns} for why not on read.
  */
-export function rememberHiddenColumns(projectId: string, hidden: readonly string[]): void {
-  storedHiddenColumns(projectId).write(hidden);
+export function rememberHiddenColumns(projectId: string, hidden: readonly string[]): boolean {
+  const written = storedHiddenColumns(projectId).write(hidden);
   storedLinksResetShown(projectId).forget();
+  return written;
 }

 /**
@@ -481,15 +499,14 @@ export function rememberHiddenColumns(projectId: string, hidden: readonly string
  * is whatever {@link DEFAULT_HIDDEN_COLUMNS} says *now*, and a snapshot stored
  * here is that promise broken the day the default moves.
  */
-export function forgetHiddenColumns(projectId: string): void {
-  storedHiddenColumns(projectId).forget();
+export function forgetHiddenColumns(projectId: string): boolean {
+  return storedHiddenColumns(projectId).forget();
 }

 /** Remembers only the reset outcome that differs from the initial hidden-Links baseline. */
-export function rememberLinksResetTarget(projectId: string, hasAnyExternalRefs: boolean): void {
+export function rememberLinksResetTarget(projectId: string, hasAnyExternalRefs: boolean): boolean {
   const marker = storedLinksResetShown(projectId);
-  if (hasAnyExternalRefs) marker.write(true);
-  else marker.forget();
+  return hasAnyExternalRefs ? marker.write(true) : marker.forget();
 }

 /**
@@ -518,7 +535,7 @@ export interface SavedView {
  * by {@link isSavedView} in {@link rememberedSavedViews}, which keeps the ones
  * that are views rather than dropping the whole key over one bad entry.
  */
-export const storedSavedViews = (projectId: string): Remembered<readonly unknown[]> =>
+export const storedSavedViews = (projectId: string): RuntimeRemembered<readonly unknown[]> =>
   remembered(savedViewsKey(projectId), (claimed): claimed is unknown[] => Array.isArray(claimed));

 /** Whether a claimed value is a list of strings — a facet's chosen ids. */
@@ -640,12 +657,16 @@ export function isSavedView(value: unknown): value is SavedView {
  * facet with nothing left to match gets. Nothing here repairs or deletes the
  * view on the reader's behalf.
  */
-export function rememberedSavedViews(projectId: string): SavedView[] {
-  const claimed = storedSavedViews(projectId).readAndDrop();
-  if (claimed === null) return [];
-  return claimed
-    .filter(isSavedView)
-    .map((view) => ({ ...view, criteria: everyFacetOf(view.criteria) }));
+export function rememberedSavedViews(projectId: string): Recalled<SavedView[]> {
+  const recalled = storedSavedViews(projectId).readAndDrop();
+  const claimed = recalled.value;
+  if (claimed === null) return { value: [], persists: recalled.persists };
+  return {
+    value: claimed
+      .filter(isSavedView)
+      .map((view) => ({ ...view, criteria: everyFacetOf(view.criteria) })),
+    persists: recalled.persists,
+  };
 }

 /**
@@ -656,6 +677,6 @@ export function rememberedSavedViews(projectId: string): SavedView[] {
  * remembers about it, and the sanitized set from {@link rememberedSavedViews}
  * is never written back on a read.
  */
-export function rememberSavedViews(projectId: string, views: readonly SavedView[]): void {
-  storedSavedViews(projectId).write(views);
+export function rememberSavedViews(projectId: string, views: readonly SavedView[]): boolean {
+  return storedSavedViews(projectId).write(views);
 }
```

### 7.18 `use-column-set.ts`, `use-plan-filter.ts`, `use-plan-layout.tsx` — slice 4, read `.value`

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/use-column-set.ts b/apps/wbs/fe-01/src/components/wbs/use-column-set.ts
index b7cff3b4..8bda61e7 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-column-set.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-column-set.ts
@@ -45,8 +45,8 @@ export function useColumnSet({ projectId, steps }: { projectId: string; steps: S
    * The hide-list as this browser remembers it for this project, whole — see
    * {@link rememberedHiddenColumns} for why it is not judged on read.
    */
-  const [storedHiddenColumns, setStoredHiddenColumns] = useState<readonly string[]>(() =>
-    rememberedHiddenColumns(projectId),
+  const [storedHiddenColumns, setStoredHiddenColumns] = useState<readonly string[]>(
+    () => rememberedHiddenColumns(projectId).value,
   );

   /**
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-filter.ts b/apps/wbs/fe-01/src/components/wbs/use-plan-filter.ts
index ecbf07d5..92cdc581 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-filter.ts
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-filter.ts
@@ -161,7 +161,9 @@ export function usePlanFilterState({ projectId }: { projectId: string }) {
    * Read straight into the initial state for {@link rememberedExpansion}'s
    * reason: an effect would open the panel with nothing in it for one frame.
    */
-  const [savedViews, setSavedViews] = useState<SavedView[]>(() => rememberedSavedViews(projectId));
+  const [savedViews, setSavedViews] = useState<SavedView[]>(
+    () => rememberedSavedViews(projectId).value,
+  );

   /** Which project the saved views above belong to, so a save cannot pair it with another. */
   const savedViewsProject = useRef(projectId);
@@ -177,7 +179,7 @@ export function usePlanFilterState({ projectId }: { projectId: string }) {
   useEffect(() => {
     if (savedViewsProject.current === projectId) return;
     savedViewsProject.current = projectId;
-    setSavedViews(rememberedSavedViews(projectId));
+    setSavedViews(rememberedSavedViews(projectId).value);
   }, [projectId]);
   return { query, commitQuery, facets, setFacets, savedViews, setSavedViews };
 }
diff --git a/apps/wbs/fe-01/src/components/wbs/use-plan-layout.tsx b/apps/wbs/fe-01/src/components/wbs/use-plan-layout.tsx
index bae9a3c4..825efe89 100644
--- a/apps/wbs/fe-01/src/components/wbs/use-plan-layout.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/use-plan-layout.tsx
@@ -333,7 +333,9 @@ export function useRememberedPlanLayout({ projectId }: { projectId: string }) {
    * would render the default first and collapse the tree a frame later, which
    * is the plan visibly rearranging itself under the reader on every load.
    */
-  const [expanded, setExpanded] = useState<ExpandedState>(() => rememberedExpansion(projectId));
+  const [expanded, setExpanded] = useState<ExpandedState>(
+    () => rememberedExpansion(projectId).value,
+  );

   /** Which project the expansion above belongs to, so a save cannot pair it with another. */
   const expansionProject = useRef(projectId);
@@ -352,7 +354,7 @@ export function useRememberedPlanLayout({ projectId }: { projectId: string }) {
   useEffect(() => {
     if (expansionProject.current !== projectId) {
       expansionProject.current = projectId;
-      setExpanded(rememberedExpansion(projectId));
+      setExpanded(rememberedExpansion(projectId).value);
       return;
     }
     // Proof: removed, `remembers a collapsed branch across a remount` failed
@@ -374,8 +376,8 @@ export function useRememberedPlanLayout({ projectId }: { projectId: string }) {
    * reason: an effect would lay the table out at its defaults and move every
    * column one frame later.
    */
-  const [widthOverrides, setWidthOverrides] = useState<Map<string, number>>(() =>
-    rememberedWidthOverrides(projectId),
+  const [widthOverrides, setWidthOverrides] = useState<Map<string, number>>(
+    () => rememberedWidthOverrides(projectId).value,
   );

   /** Which project the widths above belong to, so a save cannot pair them with another. */
@@ -388,8 +390,8 @@ export function useRememberedPlanLayout({ projectId }: { projectId: string }) {
    * Read straight into the initial state for {@link widthOverrides}'s reason:
    * an effect would open the chart at its default and move it a frame later.
    */
-  const [ganttHeightPx, setGanttHeightPx] = useState<number | null>(() =>
-    rememberedGanttHeight(projectId),
+  const [ganttHeightPx, setGanttHeightPx] = useState<number | null>(
+    () => rememberedGanttHeight(projectId).value,
   );

   /**
@@ -423,7 +425,7 @@ export function useRememberedPlanLayout({ projectId }: { projectId: string }) {
    * {@link resetLayout}'s answer, and that is `DAY_PX` either way.
    */
   const [ganttDayPx, setGanttDayPx] = useState<DayPx>(
-    () => rememberedGanttDayPx(projectId) ?? DAY_PX,
+    () => rememberedGanttDayPx(projectId).value ?? DAY_PX,
   );

   /**
@@ -436,7 +438,7 @@ export function useRememberedPlanLayout({ projectId }: { projectId: string }) {
    * either way.
    */
   const [ganttLabelsShown, setGanttLabelsShown] = useState<boolean>(
-    () => rememberedGanttLabels(projectId) ?? true,
+    () => rememberedGanttLabels(projectId).value ?? true,
   );

   /**
@@ -452,7 +454,7 @@ export function useRememberedPlanLayout({ projectId }: { projectId: string }) {
    * there is nothing per project to swap in.
    */
   const [mermaidSectionMode, setMermaidSectionMode] = useState<SectionMode>(
-    () => rememberedMermaidSectionMode() ?? DEFAULT_SECTION_MODE,
+    () => rememberedMermaidSectionMode().value ?? DEFAULT_SECTION_MODE,
   );
   return {
     expanded,
@@ -511,11 +513,11 @@ export function usePlanLayoutSwap({
   useEffect(() => {
     if (widthProject.current === projectId) return;
     widthProject.current = projectId;
-    setWidthOverrides(rememberedWidthOverrides(projectId));
-    setStoredHiddenColumns(rememberedHiddenColumns(projectId));
-    setGanttHeightPx(rememberedGanttHeight(projectId));
-    setGanttDayPx(rememberedGanttDayPx(projectId) ?? DAY_PX);
-    setGanttLabelsShown(rememberedGanttLabels(projectId) ?? true);
+    setWidthOverrides(rememberedWidthOverrides(projectId).value);
+    setStoredHiddenColumns(rememberedHiddenColumns(projectId).value);
+    setGanttHeightPx(rememberedGanttHeight(projectId).value);
+    setGanttDayPx(rememberedGanttDayPx(projectId).value ?? DAY_PX);
+    setGanttLabelsShown(rememberedGanttLabels(projectId).value ?? true);
   }, [
     projectId,
     setGanttDayPx,
@@ -742,7 +744,7 @@ export function usePlanLayout({
       // render saw rather than a half-finished one. Re-read from storage
       // rather than remembered in a ref: the storage is the last committed
       // answer by construction.
-      setWidthOverrides(rememberedWidthOverrides(projectId));
+      setWidthOverrides(rememberedWidthOverrides(projectId).value);
     },
   };

@@ -761,7 +763,7 @@ export function usePlanLayout({
       // Re-read from storage rather than remembered in a ref, for
       // {@link resizeColumn}'s reason: the storage is the last committed
       // answer by construction.
-      setGanttHeightPx(rememberedGanttHeight(projectId));
+      setGanttHeightPx(rememberedGanttHeight(projectId).value);
     },
   };

```

### 7.19 The three deletions — slice 5

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/composition-agreement.test.ts b/apps/wbs/fe-01/src/modules/preferences/composition-agreement.test.ts
deleted file mode 100644
index 2be4ff55..00000000
--- a/apps/wbs/fe-01/src/modules/preferences/composition-agreement.test.ts
+++ /dev/null
@@ -1,41 +0,0 @@
-import { afterEach, expect, test } from 'vitest';
-
-import { installApplicationRuntime } from '@/runtime/application-runtime';
-
-import { rememberedPreferences } from './composition';
-import { GANTT_DETAIL_KEY } from './preference-keys';
-
-// Needs a browser: both surfaces under test reach this reader's own
-// `localStorage`, which is the whole point of the case.
-
-afterEach(() => {
-  localStorage.removeItem(GANTT_DETAIL_KEY);
-});
-
-/**
- * The staged duplicate is harmless, and this is what says so.
- *
- * Delivery still imports the module-load `rememberedPreferences`; the page's
- * runtime installs the same module for itself. Two instances, and no divided
- * state: every preference lives in the reader's browser, the adapter reaches it
- * **per call**, and neither instance holds a value. The duplicate therefore costs
- * two closures and nothing else — which is what makes moving delivery onto the
- * runtime's services a later packet's job rather than this one's risk.
- */
-test('the runtime-owned preferences and the module-load ones read the same bytes', async () => {
-  const installed = installApplicationRuntime();
-
-  installed.services.remembered.ganttDetail.write(true);
-  expect(rememberedPreferences.ganttDetail.read()).toBe(true);
-  rememberedPreferences.ganttDetail.write(false);
-  expect(installed.services.remembered.ganttDetail.read()).toBe(false);
-
-  await installed.close({ timeoutMs: 50 });
-
-  // Retiring the runtime revokes only the store it owned: the module-load surface
-  // is a different instance over the same browser, and delivery keeps working.
-  expect(() => installed.services.remembered.ganttDetail.read()).toThrow(
-    'the preferences store was revoked with its runtime',
-  );
-  expect(rememberedPreferences.ganttDetail.read()).toBe(false);
-});
diff --git a/apps/wbs/fe-01/src/modules/preferences/composition.test.ts b/apps/wbs/fe-01/src/modules/preferences/composition.test.ts
deleted file mode 100644
index eadd5b83..00000000
--- a/apps/wbs/fe-01/src/modules/preferences/composition.test.ts
+++ /dev/null
@@ -1,17 +0,0 @@
-import { expect, test } from 'vitest';
-
-import { browserPreferences, rememberedPreferences } from './composition';
-
-/**
- * The production instances must be importable where there is no browser store
- * at all, because that is this tier and because the shared setup installs its
- * stand-in after the module graph is built. Building a store for a key must
- * touch nothing either: only reading and writing may.
- */
-test('the production preferences can be built with no browser store present', () => {
-  expect(typeof browserPreferences.json).toBe('function');
-  expect(typeof browserPreferences.text).toBe('function');
-  expect(typeof browserPreferences.unchecked).toBe('function');
-  expect(() => browserPreferences.unchecked('wbs.demo.id')).not.toThrow();
-  expect(typeof rememberedPreferences.lastOpenedProject.read).toBe('function');
-});
diff --git a/apps/wbs/fe-01/src/modules/preferences/composition.ts b/apps/wbs/fe-01/src/modules/preferences/composition.ts
deleted file mode 100644
index 8e140b62..00000000
--- a/apps/wbs/fe-01/src/modules/preferences/composition.ts
+++ /dev/null
@@ -1,40 +0,0 @@
-import { browserStorage } from './browser-storage.repository';
-import type { Preferences, RememberedPreferences } from './contract';
-import { createRememberedPreferences } from './preferences.feature';
-import { createPreferences } from './preferences.resource';
-
-/**
- * The module-load preferences resource delivery still imports.
- *
- * **Staged, and recorded as debt.** The page's runtime now installs this same
- * module through `installApplicationRuntime`, which is where preferences will be
- * read from once delivery takes them out of a context. Until then there are two
- * instances of a service that holds **no state** — every preference lives in the
- * reader's browser and the adapter reaches it per call — so the two agree by
- * construction, and `composition-agreement.test.ts` is what says so. What the
- * runtime's instance has and this one has not is an owner: retiring it revokes
- * its store.
- *
- * **One of the five call sites has moved off this file already:** `lib/theme.ts`
- * reads and writes through `useApplicationServicesState()`, not this module —
- * see
- * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`.
- * `components/wbs/gantt-detail.ts`, `components/wbs/project-page.tsx` and
- * `components/wbs/project-settings-modal.tsx` still import
- * {@link rememberedPreferences}; `lib/remembered.ts` still imports
- * {@link browserPreferences} to offer its two factories to the layout module.
- * This file is deleted once all five have moved, and
- * `components/wbs/remembered-layout.ts`'s module-scope
- * `storedMermaidSectionMode` must become lazy first — a module-scope binding
- * cannot read a React context.
- *
- * Exported because `apps/wbs/fe-01/src/lib/remembered.ts` still offers the
- * generic factory to the layout module, which builds a store per project id and
- * so cannot be a fixed named answer. Nothing that imports React may import this;
- * delivery takes {@link rememberedPreferences}.
- */
-export const browserPreferences: Preferences = createPreferences(browserStorage());
-
-/** The named answers, which is what delivery imports. */
-export const rememberedPreferences: RememberedPreferences =
-  createRememberedPreferences(browserPreferences);
```

### 7.20 `apps/wbs/fe-01/vitest.node-suites.ts` — slice 5

```diff
diff --git a/apps/wbs/fe-01/vitest.node-suites.ts b/apps/wbs/fe-01/vitest.node-suites.ts
index bc20d7ce..944abbdd 100644
--- a/apps/wbs/fe-01/vitest.node-suites.ts
+++ b/apps/wbs/fe-01/vitest.node-suites.ts
@@ -68,7 +68,6 @@ export const NODE_SUITES: readonly string[] = [
   'src/modules/plan-feed/plan-feed.feature.test.ts',
   'src/modules/plan-feed/plan-feed.resource.test.ts',
   'src/modules/plan-writer/plan-writer.test.ts',
-  'src/modules/preferences/composition.test.ts',
   'src/modules/preferences/module.test.ts',
   'src/modules/preferences/preferences.feature.test.ts',
   'src/modules/preferences/preferences.resource.test.ts',
```

### 7.21 The preferences module's `README.md` and `contract.ts` — slice 5

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/README.md b/apps/wbs/fe-01/src/modules/preferences/README.md
index 71d7a150..ec7aa56e 100644
--- a/apps/wbs/fe-01/src/modules/preferences/README.md
+++ b/apps/wbs/fe-01/src/modules/preferences/README.md
@@ -43,11 +43,12 @@ The exported types are in `contract.ts`; the repository adapter is
 resource is `preferences.resource.ts`; the named answers are `preferences.feature.ts`.
 `module.ts` is the sealed DI Bag module — exports `preferences` and `remembered`, keeps
 `preferencesStore` private under the `frontend.preferences` label, and requires `browserStore`
-from its host, which is `apps/wbs/fe-01/src/runtime/application-runtime.ts`. `composition.ts`
-still builds the module-load instances delivery imports; that duplicate is staged debt and
-`composition-agreement.test.ts` proves it divides no state. `apps/wbs/fe-01/src/lib/remembered.ts`
-keeps the generic factory for the layout module, which builds a store per project id, and is the
-reason `preferences` is a public export at all.
+from its host, which is `apps/wbs/fe-01/src/runtime/application-runtime.ts`. That runtime is the
+only instance: delivery reads `remembered` through `useApplicationServicesState` or, at the instant
+of an event, `useApplicationServicesReader`, and there is no module-load duplicate any more.
+`apps/wbs/fe-01/src/lib/remembered.ts` keeps the generic factory for the layout module, which
+builds a store per project id, resolves the runtime's `preferences` from its lifetime slot at every
+call, and is the reason `preferences` is a public export at all.

 This module carries **no** `module-index` block yet, and adding one is its own packet: the
 `docs/wiki-policy` registration and the index that names these files land together, for the reason
@@ -56,8 +57,7 @@ This module carries **no** `module-index` block yet, and adding one is its own p
 ## Checks

 The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`, for
-`preferences.resource.test.ts`, `preferences.feature.test.ts`, `composition.test.ts` and
-`module.test.ts`. The adapter's own suite, `browser-storage.repository.test.ts`, and
-`composition-agreement.test.ts` name browser globals and therefore run in the `test` target
-instead. The behaviour this extraction preserves is proved by the theme,
+`preferences.resource.test.ts`, `preferences.feature.test.ts` and `module.test.ts`. The adapter's
+own suite, `browser-storage.repository.test.ts`, names browser globals and therefore runs in the
+`test` target instead. The behaviour this extraction preserves is proved by the theme,
 layout, chart, settings and project page suites in that same target.
diff --git a/apps/wbs/fe-01/src/modules/preferences/contract.ts b/apps/wbs/fe-01/src/modules/preferences/contract.ts
index 3b519754..23eef454 100644
--- a/apps/wbs/fe-01/src/modules/preferences/contract.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/contract.ts
@@ -199,6 +199,13 @@ export interface PreferencesRequirements {
  * fixed named answer. The map's claim that the generic factory is "not a reason
  * to expose the resource" is half right: it is not a reason to put it in a React
  * context, and it is still the reason the module exports it.
+ *
+ * Since the module-load duplicate was deleted, `lib/remembered.ts` reaches this
+ * export only through the page's own runtime, read from its lifetime slot at the
+ * instant of each access — never through a React context, and never through an
+ * instance of its own. Whether the resource then moves behind a feature of its
+ * own or stays as accepted debt with that one caller named is OpenSpec task 12
+ * of `adopt-frontend-lifetimes`.
  */
 export interface PreferencesExports {
   readonly preferences: Preferences;
```

### 7.22 `openspec/changes/adopt-frontend-lifetimes/tasks.md` — slice 5

`<observed-date>` is replaced by slice 5 step 3, by observation.

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index 8096d863..5e533cfb 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -20,12 +20,16 @@
       Partly moved by 050-7-f1: `lib/theme.ts` reads through
       `useApplicationServicesState()`, degrading visibly — never throwing — when
       withdrawn, per the delivery-degradation requirement this change now carries.
-      `gantt-detail.ts`, `project-page.tsx`, `project-settings-modal.tsx` and
-      `lib/remembered.ts` still read `modules/preferences/composition.ts`'s staged
-      duplicate, and the module's wiki index is still absent
-      (`apps/wbs/fe-01/src/modules/preferences/README.md`). This box stays
-      unchecked until all five call sites have moved, the duplicate is deleted and
-      the index exists.
+      The other four moved by 050-7-f2, observed <observed-date>:
+      `project-settings-modal.tsx` and `project-page.tsx` resolve the runtime at the
+      instant of each access through `useApplicationServicesReader()`;
+      `gantt-detail.ts` follows `useApplicationServicesState()` as `useTheme` does;
+      and `lib/remembered.ts` resolves the runtime's `preferences` from the slot at
+      every call, so `remembered-layout.ts`'s module-scope `storedMermaidSectionMode`
+      holds no store. `modules/preferences/composition.ts` and its two tests are
+      deleted. This box stays unchecked for the one outcome still owed: the module's
+      wiki index (`apps/wbs/fe-01/src/modules/preferences/README.md` says it carries
+      no `module-index` block yet, and that adopting one is its own packet).
 - [x] 4. The application bootstrap owns the React root: it builds the runtime before
       `createRoot`, publishes `RememberedPreferences` — the feature facade only, never
       the `Preferences` resource — through one context, and renders the sanitized fatal
```

## 8. Proofs

Every fault below was injected for real in the planner's rehearsal clone on 2026-09-24, slice by slice,
each on that slice's own committed tree: its named check watched failing, the file restored from a
`cp`-taken copy and `cmp`-verified byte-identical before the next fault. The executor repeats each one
and writes the adjacent `Proof:` comment **only after observing its own failure**, dated with its own
observed date (`date -u +%F`) — never 2026-09-24, never before the observation. Each slice runs **all**
of its faults first and writes its comments afterwards, so every fault patch below still applies: they
were extracted and `git apply --check`ed against the post-slice files (section 9.1).

**Each slice's faults are records of four lines** — id, file (from the repository root), suite (from
`apps/wbs/fe-01`) and the exact `-t` title — in the first `text` block of that slice's subsection
below. Extract them from this document rather than retyping them, so the titles keep their
typographic apostrophes byte for byte:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-f2-delivery-call-sites.md
section=8.1 # this slice's subsection: 8.1 for slice 1 … 8.5 for slice 5
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

Expected: 12 lines for slice 1, 48 for slice 2, 32 for slice 3, 36 for slice 4 and 4 for slice 5.

**First, prove every filter selects exactly one test**, before injecting anything:

```sh
set -euo pipefail
cd apps/wbs/fe-01
while IFS= read -r id && IFS= read -r file && IFS= read -r suite && IFS= read -r title; do
  config=""
  if [ "$suite" = src/test-tiers.test.ts ]; then config="--config vitest.node.config.ts"; fi
  # shellcheck disable=SC2086 # empty or one fixed option pair
  out=$(TZ=UTC bunx vitest run $config "$suite" -t "$title" --reporter=verbose 2>&1 < /dev/null)
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
  config=""
  if [ "$suite" = src/test-tiers.test.ts ]; then config="--config vitest.node.config.ts"; fi
  test -f "$file"
  cp "$file" "$TMPDIR/$id.passing"
  git apply --check "$TMPDIR/mutations/$id.diff" < /dev/null
  git apply "$TMPDIR/mutations/$id.diff" < /dev/null
  if diff -u "$TMPDIR/$id.passing" "$file" > "$TMPDIR/evidence/$id.patch"
  then echo "$id: nothing was injected" >&2; exit 1; else test $? -eq 1; fi
  # shellcheck disable=SC2086
  if (cd apps/wbs/fe-01 && TZ=UTC bunx vitest run $config "$suite" -t "$title") \
    > "$TMPDIR/evidence/$id.log" 2>&1 < /dev/null
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/$id.log"
  cp "$TMPDIR/$id.passing" "$file"
  cmp "$file" "$TMPDIR/$id.passing"
  test "$status" -eq 1
  # shellcheck disable=SC2086
  if (cd apps/wbs/fe-01 && TZ=UTC bunx vitest run $config "$suite" -t "$title") \
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
// Proof: on <observed date>, answering `persists: true` here failed `opens on the first section
// and remembers nothing when no runtime is live` on `expected { value: 'teams', persists: true }`.
```

Two faults that share a site share one comment block, one sentence each.

### 8.1 Slice 1 — the reader (`src/runtime/application-services-context.tsx`)

The records for `$TMPDIR/proofs.txt`:

```text
r1
apps/wbs/fe-01/src/runtime/application-services-context.tsx
src/runtime/application-services-context.test.tsx
answers withdrawn the instant a retirement is accepted, while the render still says live
r2
apps/wbs/fe-01/src/runtime/application-services-context.tsx
src/runtime/application-services-context.test.tsx
keeps its identity across renders of the same provider
r3
apps/wbs/fe-01/src/runtime/application-services-context.tsx
src/runtime/application-services-context.test.tsx
refuses to read below no provider, naming itself
```

Suite: `src/runtime/application-services-context.test.tsx`. Every fault rehearsed as
`Tests 1 failed | 15 skipped (16)`, exit 1.

| Id   | Fault                                                                  | `-t` title                                                                                 | Observed                                                                           | Comment above                                                                       |
| ---- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `r1` | the reader answers the state its render saw                            | `answers withdrawn the instant a retirement is accepted, while the render still says live` | `expected { Object (status, remembered) } to deeply equal { status: 'withdrawn' }` | `return useCallback(() => applicationServicesStateFor(slot), [slot]);`              |
| `r2` | the reader is a new function every render                              | `keeps its identity across renders of the same provider`                                   | `expected [Function] to be [Function]`                                             | the same line as `r1`                                                               |
| `r3` | below no provider it falls back to the page's slot instead of throwing | `refuses to read below no provider, naming itself`                                         | `expected null to be 'useApplicationServicesReader must be …'`                     | `if (slot === null) {` **inside `useApplicationServicesReader`** (the file has two) |

#### Proof r1 — the render's state instead of the instant's

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-services-context.tsx b/apps/wbs/fe-01/src/runtime/application-services-context.tsx
index 8ef3bb7b..ea908dd5 100644
--- a/apps/wbs/fe-01/src/runtime/application-services-context.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-services-context.tsx
@@ -177,5 +177,6 @@ export function useApplicationServicesReader(): () => ApplicationServicesState {
   if (slot === null) {
     throw new Error('useApplicationServicesReader must be read below ApplicationServicesProvider');
   }
-  return useCallback(() => applicationServicesStateFor(slot), [slot]);
+  const rendered = applicationServicesStateFor(slot);
+  return useCallback(() => rendered, [rendered]);
 }
```

#### Proof r2 — no stable identity

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-services-context.tsx b/apps/wbs/fe-01/src/runtime/application-services-context.tsx
index 8ef3bb7b..e10885b2 100644
--- a/apps/wbs/fe-01/src/runtime/application-services-context.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-services-context.tsx
@@ -177,5 +177,5 @@ export function useApplicationServicesReader(): () => ApplicationServicesState {
   if (slot === null) {
     throw new Error('useApplicationServicesReader must be read below ApplicationServicesProvider');
   }
-  return useCallback(() => applicationServicesStateFor(slot), [slot]);
+  return () => applicationServicesStateFor(slot);
 }
```

#### Proof r3 — a fallback instead of the wiring refusal

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-services-context.tsx b/apps/wbs/fe-01/src/runtime/application-services-context.tsx
index 8ef3bb7b..c3456309 100644
--- a/apps/wbs/fe-01/src/runtime/application-services-context.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-services-context.tsx
@@ -173,9 +173,6 @@ export function useApplicationServicesState(): ApplicationServicesState {
  * reason {@link useApplicationServicesState} gives.
  */
 export function useApplicationServicesReader(): () => ApplicationServicesState {
-  const slot = useContext(ApplicationServicesContext);
-  if (slot === null) {
-    throw new Error('useApplicationServicesReader must be read below ApplicationServicesProvider');
-  }
+  const slot = useContext(ApplicationServicesContext) ?? applicationSlot;
   return useCallback(() => applicationServicesStateFor(slot), [slot]);
 }
```

### 8.2 Slice 2 — the modal and the page

The records for `$TMPDIR/proofs.txt`:

```text
m1
apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
src/components/wbs/project-settings-modal.test.tsx
opens on the first section and remembers nothing when no runtime is live
m2
apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
src/components/wbs/project-settings-modal.test.tsx
stops remembering once its runtime is withdrawn, and never throws
m3
apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
src/components/wbs/project-settings-modal.test.tsx
writes a section chosen after a replacement into the replacement, from a modal opened before it
m4
apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
src/components/wbs/project-settings-modal.test.tsx
lets a store’s own write failure through by identity, showing no section it could not keep
m5
apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
src/components/wbs/project-settings-modal.test.tsx
lets a store’s own write failure through by identity, showing no section it could not keep
m6
apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
src/components/wbs/project-settings-modal.test.tsx
reopens on a replacement runtime’s own remembered section
p1
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
restores nothing and remembers nothing when no runtime is live
p2
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
stops remembering once its runtime is withdrawn, and never throws
p3
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
restores the replacement runtime’s own project when a list load lands after a replacement
p4
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
writes a project chosen after a replacement into the replacement, from a page drawn before it
p5
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
lets a store’s own write failure through by identity, selecting nothing it could not keep
p6
apps/wbs/fe-01/src/components/wbs/project-page.tsx
src/components/wbs/project-page.test.tsx
lets a store’s own write failure through by identity, selecting nothing it could not keep
```

Modal faults in `src/components/wbs/project-settings-modal.tsx`, suite
`src/components/wbs/project-settings-modal.test.tsx`, each rehearsed `Tests 1 failed | 19 skipped (20)`.
Page faults in `src/components/wbs/project-page.tsx`, suite `src/components/wbs/project-page.test.tsx`,
each rehearsed `Tests 1 failed | 71 skipped (72)`. All exit 1.

| Id   | Fault                                                          | `-t` title                                                                                        | Observed                                                                                                                                      | Comment above                                                                       |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `m1` | no runtime, yet the read claims `persists: true`               | `opens on the first section and remembers nothing when no runtime is live`                        | `expected { value: 'teams', persists: true } to deeply equal { value: 'teams', persists: false }`                                             | `if (services.status !== 'live') return { value: FIRST_SECTION, persists: false };` |
| `m2` | no runtime, yet the write answers `true`                       | `stops remembering once its runtime is withdrawn, and never throws`                               | `expected true to be false`                                                                                                                   | `if (services.status !== 'live') return false;` in `rememberSettingsSection`        |
| `m3` | `show` uses the runtime read at render, not at the click       | `writes a section chosen after a replacement into the replacement, from a modal opened before it` | `toHaveAttribute("aria-selected", "true")`, with `PreferenceStoreLifecycleError: the preferences store was revoked with its runtime` reported | `rememberSettingsSection(readServices(), projectId, section);` in `show`            |
| `m4` | `show` shows the section before writing it                     | `lets a store’s own write failure through by identity, showing no section it could not keep`      | `toHaveAttribute("aria-selected", "true")` — Priorities shown although the write failed                                                       | the same line as `m3`                                                               |
| `m5` | `show` swallows the write's failure                            | the same title as `m4`                                                                            | `expected [] to have a length of 1 but got +0`                                                                                                | the same line as `m3`                                                               |
| `m6` | opening shows the first section instead of reading the runtime | `reopens on a replacement runtime’s own remembered section`                                       | `toHaveAttribute("aria-selected", "true")`                                                                                                    | `setShown(rememberedSettingsSection(readServices(), projectId).value);`             |
| `p1` | no runtime, yet the read claims `persists: true`               | `restores nothing and remembers nothing when no runtime is live`                                  | `expected { value: null, persists: true } to deeply equal { value: null, persists: false }`                                                   | `if (services.status !== 'live') return { value: null, persists: false };`          |
| `p2` | no runtime, yet the write answers `true`                       | `stops remembering once its runtime is withdrawn, and never throws`                               | `expected true to be false`                                                                                                                   | `if (services.status !== 'live') return false;` in `rememberLastProject`            |
| `p3` | the list load reads the runtime once, at mount                 | `restores the replacement runtime’s own project when a list load lands after a replacement`       | `PreferenceStoreLifecycleError: the preferences store was revoked with its runtime`                                                           | `const services = readServices();` in `installProjects`                             |
| `p4` | `choose` uses the runtime read at render, not at the click     | `writes a project chosen after a replacement into the replacement, from a page drawn before it`   | `expected '' to be 'Paint the fence'`, with the revoked refusal reported                                                                      | `rememberLastProject(readServices(), id);` in `choose`                              |
| `p5` | `choose` selects before writing                                | `lets a store’s own write failure through by identity, selecting nothing it could not keep`       | `expected <button …(3)></button> to be null` — a project selected although the write failed                                                   | the same line as `p4`                                                               |
| `p6` | `choose` swallows the write's failure                          | the same title as `p5`                                                                            | `expected [] to have a length of 1 but got +0`                                                                                                | the same line as `p4`                                                               |

Twelve faults, twelve distinct checks: per site, the not-live branch of the read and of the write, the
instant each handler resolves the runtime, the write-before-state order, and the refusal to swallow.
`m4`/`m5` and `p5`/`p6` share a named test because the two halves of invariant E4 (propagate by
identity; show nothing unkept) are one example; each has its own fault, so neither hides the other.

#### Proof m1 — a silent default on read

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
index f07e8074..3a46cb43 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
@@ -69,7 +69,7 @@ export function rememberedSettingsSection(
   services: ApplicationServicesState,
   projectId: string,
 ): Recalled<SettingsSection> {
-  if (services.status !== 'live') return { value: FIRST_SECTION, persists: false };
+  if (services.status !== 'live') return { value: FIRST_SECTION, persists: true };
   return {
     value: storedSection(services.remembered, projectId).readAndDrop() ?? FIRST_SECTION,
     persists: true,
```

#### Proof m2 — a write that claims to have persisted

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
index f07e8074..f99297f8 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
@@ -91,7 +91,7 @@ export function rememberSettingsSection(
   projectId: string,
   section: SettingsSection,
 ): boolean {
-  if (services.status !== 'live') return false;
+  if (services.status !== 'live') return true;
   storedSection(services.remembered, projectId).write(section);
   return true;
 }
```

#### Proof m3 — the section written into the runtime of the render

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
index f07e8074..4e90972b 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
@@ -254,16 +254,17 @@ export function ProjectSettingsModal({
    * one, or none.
    */
   const readServices = useApplicationServicesReader();
+  const servicesAtRender = readServices();

   const show = useCallback(
     (section: SettingsSection): void => {
       // Written before `setShown`, on purpose: a store that refuses the write for
       // a reason of its own propagates before this modal has shown a section it
       // could not keep.
-      rememberSettingsSection(readServices(), projectId, section);
+      rememberSettingsSection(servicesAtRender, projectId, section);
       setShown(section);
     },
-    [projectId, readServices],
+    [projectId, servicesAtRender],
   );

   /**
```

#### Proof m4 — shown before written

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
index f07e8074..bbb0c72d 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
@@ -260,8 +260,8 @@ export function ProjectSettingsModal({
       // Written before `setShown`, on purpose: a store that refuses the write for
       // a reason of its own propagates before this modal has shown a section it
       // could not keep.
-      rememberSettingsSection(readServices(), projectId, section);
       setShown(section);
+      rememberSettingsSection(readServices(), projectId, section);
     },
     [projectId, readServices],
   );
```

#### Proof m5 — the failure swallowed

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
index f07e8074..dba2c500 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
@@ -260,7 +260,11 @@ export function ProjectSettingsModal({
       // Written before `setShown`, on purpose: a store that refuses the write for
       // a reason of its own propagates before this modal has shown a section it
       // could not keep.
-      rememberSettingsSection(readServices(), projectId, section);
+      try {
+        rememberSettingsSection(readServices(), projectId, section);
+      } catch {
+        // swallowed
+      }
       setShown(section);
     },
     [projectId, readServices],
```

#### Proof m6 — opening reads nothing

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
index f07e8074..2d41d7f5 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx
@@ -313,7 +313,7 @@ export function ProjectSettingsModal({
       dirtyRef.current.clear();
       setDirtySections([]);
       setRefused(false);
-      setShown(rememberedSettingsSection(readServices(), projectId).value);
+      setShown(FIRST_SECTION);
       setOpen(true);
       return;
     }
```

#### Proof p1 — a silent default on read

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index c10e715b..2aaa2bcd 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -102,7 +102,7 @@ export interface ProjectPageProps {
  * nothing throws: the page simply restores no project. See {@link Recalled}.
  */
 export function recallLastProject(services: ApplicationServicesState): Recalled<string | null> {
-  if (services.status !== 'live') return { value: null, persists: false };
+  if (services.status !== 'live') return { value: null, persists: true };
   return { value: services.remembered.lastOpenedProject.read(), persists: true };
 }

```

#### Proof p2 — a write that claims to have persisted

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index c10e715b..6f775bf5 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -132,7 +132,7 @@ export function rememberLastProject(
   services: ApplicationServicesState,
   id: string | null,
 ): boolean {
-  if (services.status !== 'live') return false;
+  if (services.status !== 'live') return true;
   const store = services.remembered.lastOpenedProject;
   if (id === null) store.forget();
   else store.write(id);
```

#### Proof p3 — the list load bound to the runtime of the mount

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index c10e715b..8f5f6888 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -596,6 +596,7 @@ export function ProjectPage({
    * React has re-rendered for a slot that has already moved on.
    */
   const readServices = useApplicationServicesReader();
+  const servicesAtMount = useMemo(readServices, [readServices]);

   const installProjects = useCallback(
     (found: ProjectListEntry[]) => {
@@ -607,7 +608,7 @@ export function ProjectPage({
         // selecting the only project saves a click on the common path; with
         // several, the choice is the user's and nothing is guessed.
         if (current !== null && found.some((project) => project.id === current)) return current;
-        const services = readServices();
+        const services = servicesAtMount;
         const remembered = recallLastProject(services).value;
         if (remembered !== null && found.some((project) => project.id === remembered)) {
           return remembered;
```

#### Proof p4 — the project written into the runtime of the render

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index c10e715b..9125f79d 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -596,6 +596,7 @@ export function ProjectPage({
    * React has re-rendered for a slot that has already moved on.
    */
   const readServices = useApplicationServicesReader();
+  const servicesAtRender = readServices();

   const installProjects = useCallback(
     (found: ProjectListEntry[]) => {
@@ -786,7 +787,7 @@ export function ProjectPage({
    * Watched 2026-08-29.
    */
   const choose = (id: string) => {
-    rememberLastProject(readServices(), id);
+    rememberLastProject(servicesAtRender, id);
     setSelected(id);
     setSearch(null);
     pickerBox.current?.blur();
```

#### Proof p5 — selected before written

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index c10e715b..7e116705 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -786,8 +786,8 @@ export function ProjectPage({
    * Watched 2026-08-29.
    */
   const choose = (id: string) => {
-    rememberLastProject(readServices(), id);
     setSelected(id);
+    rememberLastProject(readServices(), id);
     setSearch(null);
     pickerBox.current?.blur();
   };
```

#### Proof p6 — the failure swallowed

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/project-page.tsx b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
index c10e715b..e69bf53b 100644
--- a/apps/wbs/fe-01/src/components/wbs/project-page.tsx
+++ b/apps/wbs/fe-01/src/components/wbs/project-page.tsx
@@ -786,7 +786,11 @@ export function ProjectPage({
    * Watched 2026-08-29.
    */
   const choose = (id: string) => {
-    rememberLastProject(readServices(), id);
+    try {
+      rememberLastProject(readServices(), id);
+    } catch {
+      // swallowed
+    }
     setSelected(id);
     setSearch(null);
     pickerBox.current?.blur();
```

### 8.3 Slice 3 — the detail switch (`src/components/wbs/gantt-detail.ts`)

The records for `$TMPDIR/proofs.txt`:

```text
g1
apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
src/components/wbs/gantt-detail.test.tsx
opens on the never-said default and remembers nothing when no runtime is live
g2
apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
src/components/wbs/gantt-detail.test.tsx
returns to the never-said default and stops remembering once withdrawn, without waiting for disposal
g3
apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
src/components/wbs/gantt-detail.test.tsx
adopts a replacement runtime’s own remembered answer, and drops what it refuses
g4
apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
src/components/wbs/gantt-detail.test.tsx
does not let a superseded ask change the marks or any store
g5
apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
src/components/wbs/gantt-detail.test.tsx
lets a store’s own write failure through by identity, showing nothing it could not keep
g6
apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
src/components/wbs/gantt-detail.test.tsx
lets a store’s own write failure through by identity, showing nothing it could not keep
g7
apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
src/components/wbs/gantt-detail.test.tsx
settles on the withdrawn state, without throwing, when retired between its render and its effect
g8
apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
src/components/wbs/gantt-detail.test.tsx
changes the marks and remembers nothing when asked between a withdrawal and the next render
```

Suite: `src/components/wbs/gantt-detail.test.tsx`. Every fault rehearsed as
`Tests 1 failed | 6 skipped (7)`, exit 1.

| Id   | Fault                                                                           | `-t` title                                                                                             | Observed                                                                       | Comment above                                                               |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `g1` | `ask` with nothing live reports `persists: true`                                | `opens on the never-said default and remembers nothing when no runtime is live`                        | `expected true to be false`                                                    | `setPersists(false);` in `ask`'s `live === null` branch                     |
| `g2` | the resync effect's not-live branch no longer resets                            | `returns to the never-said default and stops remembering once withdrawn, without waiting for disposal` | `expected false to be true`                                                    | `if (now.status !== 'live') {` in the resync effect                         |
| `g3` | the resync effect drops keys without adopting the answer                        | `adopts a replacement runtime’s own remembered answer, and drops what it refuses`                      | `expected false to be true`                                                    | `setShown(rememberedDetail(now.remembered, hasEdges.current));`             |
| `g4` | the superseded guard deleted                                                    | `does not let a superseded ask change the marks or any store`                                          | `expected false to be true`                                                    | `if (live !== null && live !== rendered) return;`                           |
| `g5` | `ask` shows before writing                                                      | `lets a store’s own write failure through by identity, showing nothing it could not keep`              | `expected true to be false`                                                    | `live.ganttDetail.write(next);`, after the existing `Proof:` block above it |
| `g6` | `ask` swallows the write's failure                                              | the same title as `g5`                                                                                 | `expected null to be Error: write denied`                                      | the same line as `g5`                                                       |
| `g7` | the resync effect reads the render's runtime instead of the one live now        | `settles on the withdrawn state, without throwing, when retired between its render and its effect`     | `expected PreferenceStoreLifecycleError: the page w… { kind: '…' } to be null` | `const now = readServices();` **in the resync effect** (the file has two)   |
| `g8` | a runtime withdrawn since the render counts as superseded (`live !== rendered`) | `changes the marks and remembers nothing when asked between a withdrawal and the next render`          | `expected true to be false`                                                    | the same line as `g4`                                                       |

Eight faults, eight checks: `ask`'s three branches (nothing live, superseded, live) and its order and
refusal to swallow; the effect's two branches and the instant it reads. `g4` and `g8` both edit the
superseded guard, in opposite directions — `g4` removes it, `g8` widens it to swallow a withdrawal — and
fail different tests.

#### Proof g1 — `persists` claimed with nothing live

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
index 8fa6a9fe..68cb4a67 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
@@ -230,7 +230,7 @@ export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
       if (live !== null && live !== rendered) return;
       if (live === null) {
         setShown(next);
-        setPersists(false);
+        setPersists(true);
         return;
       }
       // Written here and nowhere else, so opening a chart never changes what is
```

#### Proof g2 — no reset on withdrawal

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
index 8fa6a9fe..2bf3f4e3 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
@@ -212,8 +212,6 @@ export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
   useEffect(() => {
     const now = readServices();
     if (now.status !== 'live') {
-      setShown(hasEdges.current);
-      setPersists(false);
       return;
     }
     setShown(rememberedDetail(now.remembered, hasEdges.current));
```

#### Proof g3 — the replacement's answer not adopted

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
index 8fa6a9fe..ed00e51f 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
@@ -216,7 +216,7 @@ export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
       setPersists(false);
       return;
     }
-    setShown(rememberedDetail(now.remembered, hasEdges.current));
+    rememberedDetail(now.remembered, hasEdges.current);
     setPersists(true);
   }, [rendered, readServices]);

```

#### Proof g4 — the superseded guard removed

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
index 8fa6a9fe..c5fad529 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
@@ -227,7 +227,6 @@ export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
       const now = readServices();
       const live = now.status === 'live' ? now.remembered : null;
       // Superseded: a runtime this render never read is live. Nothing changes.
-      if (live !== null && live !== rendered) return;
       if (live === null) {
         setShown(next);
         setPersists(false);
```

#### Proof g5 — shown before written

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
index 8fa6a9fe..5cddf2b4 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
@@ -242,9 +242,9 @@ export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
       // | 90 passed`, on `expected 'false' to be 'true'` — the switch back off
       // on the next mount. Watched 2026-08-11 over the arrows key, and again
       // 2026-08-12 over this one.
-      live.ganttDetail.write(next);
       setShown(next);
       setPersists(true);
+      live.ganttDetail.write(next);
     },
   };
 }
```

#### Proof g6 — the failure swallowed

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
index 8fa6a9fe..e13c282c 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
@@ -242,7 +242,11 @@ export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
       // | 90 passed`, on `expected 'false' to be 'true'` — the switch back off
       // on the next mount. Watched 2026-08-11 over the arrows key, and again
       // 2026-08-12 over this one.
-      live.ganttDetail.write(next);
+      try {
+        live.ganttDetail.write(next);
+      } catch {
+        // swallowed
+      }
       setShown(next);
       setPersists(true);
     },
```

#### Proof g7 — the effect reads the render's runtime

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
index 8fa6a9fe..438a7dd3 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
@@ -210,13 +210,12 @@ export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
   // runtime live **now**, and drop the keys it refuses. The write half of the
   // read above.
   useEffect(() => {
-    const now = readServices();
-    if (now.status !== 'live') {
+    if (rendered === null) {
       setShown(hasEdges.current);
       setPersists(false);
       return;
     }
-    setShown(rememberedDetail(now.remembered, hasEdges.current));
+    setShown(rememberedDetail(rendered, hasEdges.current));
     setPersists(true);
   }, [rendered, readServices]);

```

#### Proof g8 — a withdrawal mistaken for a supersession

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
index 8fa6a9fe..13c2e11d 100644
--- a/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
+++ b/apps/wbs/fe-01/src/components/wbs/gantt-detail.ts
@@ -227,7 +227,7 @@ export function useGanttDetail(hasDependencyEdges: boolean): GanttDetail {
       const now = readServices();
       const live = now.status === 'live' ? now.remembered : null;
       // Superseded: a runtime this render never read is live. Nothing changes.
-      if (live !== null && live !== rendered) return;
+      if (live !== rendered) return;
       if (live === null) {
         setShown(next);
         setPersists(false);
```

### 8.4 Slice 4 — the layout handle, the model test's accounting, and the fixture

The records for `$TMPDIR/proofs.txt`:

```text
ha
apps/wbs/fe-01/src/lib/remembered.ts
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
hb
apps/wbs/fe-01/src/lib/remembered.ts
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
hc
apps/wbs/fe-01/src/lib/remembered.ts
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
hd
apps/wbs/fe-01/src/lib/remembered.ts
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
he
apps/wbs/fe-01/src/lib/remembered.ts
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
hh
apps/wbs/fe-01/src/lib/remembered.ts
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
hf
apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
hg
apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
fx
apps/wbs/fe-01/src/testing/live-application.tsx
src/components/wbs/plan-layout.test.tsx
lays a remembered width out over the one it would have resolved
```

The model faults run `src/components/wbs/remembered-layout.model.test.ts` with its one title,
`answers and stores exactly what the model says, under generated interleavings`; each rehearsed
`Tests 1 failed (1)`, exit 1, under fast-check 4.9.0, seed `20260924`, `numRuns: 300`,
`maxCommands: 12`. "Run" is fast-check's own `Property failed after N tests`. The shrunk counterexamples
are pasted verbatim; `⏎` marks the newline fast-check prints inside its scheduler template literal.

| Id   | Fault in `src/lib/remembered.ts`                         | Run | Shrunk counterexample                                                                                                                                              | Assertion message                                                                                                                                    | Comment above                                                                   |
| ---- | -------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ha` | the runtime resolved **once**, when the handle is built  | 8   | ``[schedulerFor()`⏎-> [task${1}] promise::dispose A resolved`,replace(A, settles),write(outline) /*replayPath="O:B"*/]``, shrunk 4 times                           | `write(outline): what the handle answered: expected false to deeply equal true`                                                                      | `const storeNow = (): Remembered<T> \| null => {`                               |
| `hb` | the **last live** store kept for when nothing is live    | 13  | ``[schedulerFor()`⏎-> [task${1}] promise::dispose A resolved`,replace(A, settles),read,retire,read /*replayPath="CCABH:V"*/]``, shrunk 2 times                     | `read: what the handle answered: expected PreferenceStoreLifecycleError: the page w… { kind: '…' } to deeply equal { value: null, persists: false }` | the same line as `ha`                                                           |
| `hc` | a read with nothing live claims `persists: true`         | 2   | ``[schedulerFor()`⏎`,read /*replayPath="CBA:F"*/]``, shrunk 1 time                                                                                                 | `read: what the handle answered: expected { value: null, persists: true } to deeply equal { value: null, persists: false }`                          | `if (store === null) return { value: null, persists: false };`                  |
| `hd` | `readAndDrop` → `read`: a refused value is never dropped | 106 | ``[schedulerFor()`⏎-> [task${1}] promise::dispose B resolved`,tamper(B, 7),accessWhileAcquiring(B, write(outline)),read /*replayPath="AFCF:K"*/]``, shrunk 2 times | `stored bytes in B: expected '7' to be undefined`                                                                                                    | `return { value: store.readAndDrop(), persists: true };`                        |
| `he` | `write` swallows the store's own failure                 | 18  | ``[schedulerFor()`⏎-> [task${1}] promise::dispose denied resolved`,replace(denied, settles),write(outline) /*replayPath="BGB:F"*/]``, shrunk 1 time                | `write(outline): an ordinary storage failure did not propagate unchanged: expected false to be Error: write denied`                                  | `store.write(value);` in `write`                                                |
| `hh` | a write with nothing live answers `true`                 | 2   | ``[schedulerFor()`⏎-> [task${1}] promise::dispose A resolved`,accessWhileAcquiring(A, write(outline)) /*replayPath="ADB:F"*/]``, shrunk 2 times                    | `write(outline) while acquiring: what the handle answered: expected true to deeply equal false`                                                      | `if (store === null) return false;` **in `write`** (`forget` has the same line) |

Two faults sabotage the **model test's own accounting**, in `remembered-layout.model.test.ts` itself —
the two ways f1's earlier revision manufactured a green run:

| Id   | Fault in the model test                                                                                                                                | Run | Shrunk counterexample                                                                                                                       | Observed failure                                                                                                                                                                                                                                              | Comment beside                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `hf` | an ordinary error where the budget expiry belongs: `acquireOver`'s `await hanging.close(options)` → `throw new Error('unexpected cleanup corruption')` | 2   | ``[schedulerFor()`⏎-> [task${1}] promise::dispose A resolved`,replace(A, never),replace(A, settles) /*replayPath="L:B"*/]``, shrunk 3 times | `Error: the property failed and its teardown refused: … unexpected cleanup corruption`, caused by `AssertionError: replace(A): the disposal did not expire the way the slot's budget expires; it failed some other way: Error: unexpected cleanup corruption` | `refusal instanceof DiBagCloseCancelledError &&` in `isDisposalExpiry`       |
| `hg` | an unrelated teardown failure: `giveEverythingBack`'s final retirement rejects                                                                         | 1   | ``[schedulerFor()`⏎`, /*replayPath=":"*/]`` — the empty command list, shrunk 0 times: teardown runs even when no command did                | `Error: teardown refused: Error: teardown retire refused during teardown with: Error: unrelated teardown failure`                                                                                                                                             | `if (world.verifiedRefusals.has(refusal)) continue;` in `giveEverythingBack` |

And one sabotages the **fixture**, proving that the layout suites' stored-byte assertions really go
through the runtime it publishes — with no runtime, nothing falls back to a module-load store:

| Id   | Fault in `src/testing/live-application.tsx` | Suite and `-t` title                                                                                          | Observed                                                             | Comment above                                               |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `fx` | `beforeEach` publishes no runtime           | `src/components/wbs/plan-layout.test.tsx` › `lays a remembered width out over the one it would have resolved` | `expected '68px' to be '240px'`, `Tests 1 failed \| 77 skipped (78)` | `await applicationSlot.replace(acquireApplicationRuntime);` |

The model test's coverage assertions are the other half of the proof. Green, they establish that the
pinned run executed all seven command kinds and reached a dropped refusal, a write into the refusing
store, a budget expiry, an access with nothing live and an access after a replacement.

#### Proof ha — resolved once

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
index a97bc1a1..cec0892e 100644
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -74,10 +74,11 @@ export function remembered<T>(
   slot: LifetimeSlot<ApplicationServices> = applicationSlot,
 ): RuntimeRemembered<T> {
   /** The live runtime's own store for this key, right now — or none. */
-  const storeNow = (): Remembered<T> | null => {
+  const resolved = ((): Remembered<T> | null => {
     const state = slot.snapshot();
     return state.status === 'live' ? state.services.preferences.json(key, isValid) : null;
-  };
+  })();
+  const storeNow = (): Remembered<T> | null => resolved;
   return {
     readAndDrop: () => {
       const store = storeNow();
```

#### Proof hb — the last live store kept

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
index a97bc1a1..c887e0a2 100644
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -74,9 +74,11 @@ export function remembered<T>(
   slot: LifetimeSlot<ApplicationServices> = applicationSlot,
 ): RuntimeRemembered<T> {
   /** The live runtime's own store for this key, right now — or none. */
+  let lastLive: Remembered<T> | null = null;
   const storeNow = (): Remembered<T> | null => {
     const state = slot.snapshot();
-    return state.status === 'live' ? state.services.preferences.json(key, isValid) : null;
+    if (state.status === 'live') lastLive = state.services.preferences.json(key, isValid);
+    return lastLive;
   };
   return {
     readAndDrop: () => {
```

#### Proof hc — a silent default on read

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
index a97bc1a1..0f345cfd 100644
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -81,7 +81,7 @@ export function remembered<T>(
   return {
     readAndDrop: () => {
       const store = storeNow();
-      if (store === null) return { value: null, persists: false };
+      if (store === null) return { value: null, persists: true };
       return { value: store.readAndDrop(), persists: true };
     },
     write: (value) => {
```

#### Proof hd — nothing dropped

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
index a97bc1a1..b4f4223c 100644
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -82,7 +82,7 @@ export function remembered<T>(
     readAndDrop: () => {
       const store = storeNow();
       if (store === null) return { value: null, persists: false };
-      return { value: store.readAndDrop(), persists: true };
+      return { value: store.read(), persists: true };
     },
     write: (value) => {
       const store = storeNow();
```

#### Proof he — the failure swallowed

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
index a97bc1a1..e0b4ea6d 100644
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -87,7 +87,11 @@ export function remembered<T>(
     write: (value) => {
       const store = storeNow();
       if (store === null) return false;
-      store.write(value);
+      try {
+        store.write(value);
+      } catch {
+        return false;
+      }
       return true;
     },
     forget: () => {
```

#### Proof hh — a write that claims to have persisted

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
index a97bc1a1..1eeb51f4 100644
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -86,7 +86,7 @@ export function remembered<T>(
     },
     write: (value) => {
       const store = storeNow();
-      if (store === null) return false;
+      if (store === null) return true;
       store.write(value);
       return true;
     },
```

#### Proof hf — an ordinary error counted as an expiry

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
index 24ab1bdd..aa1b319d 100644
--- a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
+++ b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
@@ -169,7 +169,7 @@ function acquireOver(world: HandleWorld, target: StoreName, disposal: Disposal)
       close: async (options: { timeoutMs: number }) => {
         await world.gate.wait();
         await world.scheduler.schedule(Promise.resolve(), `dispose ${target}`);
-        if (hanging !== null) await hanging.close(options);
+        if (hanging !== null) throw new Error('unexpected cleanup corruption');
         await installed.close(options);
       },
     };
```

#### Proof hg — an unrelated teardown failure

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
index 24ab1bdd..ac11dfd6 100644
--- a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
+++ b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
@@ -581,7 +581,12 @@ const commandsArb = fc.commands<HandleModel, HandleWorld, false>(
 async function giveEverythingBack(world: HandleWorld): Promise<Error[]> {
   const unreported: Error[] = [];
   world.gate.release();
-  world.issued.push({ label: 'teardown retire', outcome: world.slot.retire() });
+  world.issued.push({
+    label: 'teardown retire',
+    outcome: world.slot.retire().then(() => {
+      throw new Error('unrelated teardown failure');
+    }),
+  });
   for (const { label, outcome } of [...world.issued]) {
     try {
       await world.scheduler.waitFor(outcome);
```

#### Proof fx — no runtime published

```diff
diff --git a/apps/wbs/fe-01/src/testing/live-application.tsx b/apps/wbs/fe-01/src/testing/live-application.tsx
index 7f411f9b..b97d1a05 100644
--- a/apps/wbs/fe-01/src/testing/live-application.tsx
+++ b/apps/wbs/fe-01/src/testing/live-application.tsx
@@ -33,7 +33,7 @@ import { ApplicationServicesProvider } from '@/runtime/application-services-cont
  */
 export function publishApplicationRuntimeForEachTest(): void {
   beforeEach(async () => {
-    await applicationSlot.replace(acquireApplicationRuntime);
+    await Promise.resolve();
   });
   afterEach(async () => {
     try {
```

### 8.5 Slice 5 — the node tier list (`vitest.node-suites.ts`)

The records for `$TMPDIR/proofs.txt`:

```text
n1
apps/wbs/fe-01/vitest.node-suites.ts
src/test-tiers.test.ts
names files that exist
```

| Id   | Fault                          | Suite and `-t` title                                              | Observed                                                                                                                                                                            | Comment above                               |
| ---- | ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `n1` | the deleted suite listed again | `src/test-tiers.test.ts` (node config) › `names files that exist` | `src/modules/preferences/composition.test.ts: expected [Function] to not throw an error but 'Error: ENOENT: no such file or direct…' was thrown`, `Tests 1 failed \| 4 skipped (5)` | `'src/modules/preferences/module.test.ts',` |

Slice 5's red checkpoint already watched the same check fail for the real reason; this fault re-observes
it after the fix, so the comment names a watched failure either way.

#### Proof n1 — a deleted suite still listed

```diff
diff --git a/apps/wbs/fe-01/vitest.node-suites.ts b/apps/wbs/fe-01/vitest.node-suites.ts
index 944abbdd..bc20d7ce 100644
--- a/apps/wbs/fe-01/vitest.node-suites.ts
+++ b/apps/wbs/fe-01/vitest.node-suites.ts
@@ -68,6 +68,7 @@ export const NODE_SUITES: readonly string[] = [
   'src/modules/plan-feed/plan-feed.feature.test.ts',
   'src/modules/plan-feed/plan-feed.resource.test.ts',
   'src/modules/plan-writer/plan-writer.test.ts',
+  'src/modules/preferences/composition.test.ts',
   'src/modules/preferences/module.test.ts',
   'src/modules/preferences/preferences.feature.test.ts',
   'src/modules/preferences/preferences.resource.test.ts',
```

## 9. Verification

### 9.1 Every fenced diff applies, extracted from this document, in slice order

The requirement is not "these diffs were once correct" but "these diffs, as this committed document
spells them, apply in slice order, and every fault patch applies to what they produce". The script
below proves both; it was run after the final Prettier `--check` of this document.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-f2-delivery-call-sites.md
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
echo "extracted=$count"
test "$count" -eq 22
awk -v out="$work/mutations" '
  /^## 8\. Proofs$/ { inside=1; next }
  /^## 9\. Verification$/ { inside=0 }
  inside && /^#### Proof / { id=$3; next }
  inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$work/mutations" -name '*.diff' | wc -l)
echo "fault-patches=$count"
test "$count" -eq 33
# A real repository holding exactly the base tree, so --check has something to check against.
git archive bff2b0af | tar -x -C "$work/tree"
git -C "$work/tree" init -q
git -C "$work/tree" add -A
git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
# --check and apply are SEPARATE commands: joined with && under set -e, a failed
# check does not stop the shell and a later iteration can still reach the end.
for p in "$work"/patches/*.diff; do
  git -C "$work/tree" apply --check "$p"
  git -C "$work/tree" apply "$p"
done
echo "all 22 applied"
for m in "$work"/mutations/*.diff; do
  git -C "$work/tree" apply --check "$m"
done
echo "all 33 fault patches check against the result"
git -C "$work/tree" status --porcelain --untracked-files=all | wc -l
````

Observed on 2026-09-24, after the final Prettier `--check`:

```
extracted=22
fault-patches=33
all 22 applied
all 33 fault patches check against the result
42
```

`git apply --check` prints nothing on success, which is why the script's own `echo` lines are the
evidence and why both counts are asserted rather than printed: a run that extracted twenty-one patches
would otherwise apply twenty-one and still say it had applied them all. Prettier removes the single
space `git diff` writes on a blank context line inside these fences; `git apply` reads the empty line as
a blank context line, and the run above extracted every patch from the formatted document, so that is
exactly what it exercised. The last line is the number of
paths the twenty-two patches change against the base: twenty-five in slice 1 (every owned path but
`verify.md`, which the executor writes), three more in slice 2 (its spec and its two test files are
already counted), two in slice 3, five in slice 4 (the spec and `lib/remembered.ts` already counted) and
seven in slice 5.

**That success line is unreachable when a check fails, and that was rehearsed:** one patch's context
line was rewritten to text the file does not contain, and both loop forms were run on the same tree.

| Loop form                                                                | Observed on 2026-09-24                                                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git apply --check "$p" && git apply "$p"`                               | printed `error: patch failed: apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx:9`, then `all 22 applied`, and **exited 0** — a false success |
| `git apply --check "$p"` then `git apply "$p"` on separate lines (above) | printed the same `error:` lines, **no** success line, and **exited 1**                                                                                   |

On the rehearsal base `bff2b0af` the applied tree was compared file by file with the rehearsal clone's
final commit: every path byte-identical apart from `verify.md` (the executor writes its entries) and
the one `<observed-date>` in `tasks.md` (slice 5 step 3 replaces it). On the real dispatch base
`a77c41e5` the same script, with `git archive a77c41e5`, also applies all twenty-two patches and checks
all thirty-three fault patches (42 paths), and the strict OpenSpec block on the result reports
`{"items":114,"passed":114,"failed":0}`; there `spec.md` and `tasks.md` differ from the rehearsal clone
by exactly what `a77c41e5` itself changed in them, and every other one of the 42 paths is unchanged
between the two bases. Every **intermediate** tree typechecks — rehearsed after
each slice's last patch, `wbs-fe-01:typecheck` exit 0 five times — and exactly four trees do not: the
red checkpoints of slices 1 to 4, each after that slice's contract and test patches and before its
implementation (section 6 gives each one's diagnostics). Slice 5's red tree typechecks by design.
A red is rebuilt only from the base plus that slice's prefix of patches, never by reverse-applying
patches on a later tree: reverting 7.13 or 7.16 on the final tree fails collection with
`Failed to resolve import "@/modules/preferences/composition"`, because slice 5 deleted it.

The `Proof:` comments each slice adds afterwards land only in files no later patch touches
(`application-services-context.tsx`; the modal and the page; `gantt-detail.ts`; `lib/remembered.ts`,
the model test and the fixture; `vitest.node-suites.ts` inside its own slice after its patch), so the
comments never break a later slice's patch.

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
Rehearsed before and after every slice: `{"items":114,"passed":114,"failed":0}` each time — the new
requirement and its three scenarios live in a document that already counted as one item.

### 9.3 Commands actually run, and what each reported

All on 2026-09-24, by this packet's author, in a rehearsal clone cut at `bff2b0af` where each slice was
applied from these very patches and then committed **with the hooks on** (lefthook's `lint`, `format`,
`plaintext-secrets` and `tool-wiki` passed for all five), not inside an executor sandbox. The new
requirement's wording was tightened after that rehearsal (its first scenario now says "any access it
makes"); each of its three stages was validated again with the strict block — 114 · 114 · 0 each time —
Prettier-checked, and committed to the same clone with the hooks on.

| Check                                              | Slice 1                                | Slice 2                             | Slice 3                                          | Slice 4                                    | Slice 5                                   |
| -------------------------------------------------- | -------------------------------------- | ----------------------------------- | ------------------------------------------------ | ------------------------------------------ | ----------------------------------------- |
| step-0 preferences / sandbox                       | 6·41 / 46·675                          | 6·41 / 46·675                       | 6·41 / 46·675                                    | 6·41 / 46·675                              | 6·41 / 46·675                             |
| slice baselines                                    | adopted 20·1204; zoned 2·3; context 12 | modal 15; page 67; router 5         | gantt-panel 242; zoned 2·3                       | layout 4·218                               | —                                         |
| red typecheck                                      | exit 1, `Found 1 error`                | exit 1, `Found 5 errors in 2 files` | exit 1, `Found 9 errors`                         | exit 1, `Found 2 errors`                   | **exit 0**                                |
| red Vitest                                         | `4 failed \| 12 passed (16)`           | `11 failed \| 81 passed (92)`       | `7 failed (7)`                                   | `1 failed (1)`, run 2                      | sandbox `3 failed \| 671 passed (674)`    |
| green focused                                      | context 16; adopted 1204; zoned 3      | 92; router 5; adopted 1214          | detail 7; gantt-panel 242; zoned 3; adopted 1214 | model 1; layout 218; adopted 1214; zoned 3 | sandbox 45·674; preferences 4·39; tiers 5 |
| typecheck / lint                                   | 0 / 0                                  | 0 / 0                               | 0 / 0                                            | 0 / 0                                      | 0 / 0; `format:check --all` 0             |
| faults observed failing, restored, `cmp`-identical | 3 of 3                                 | 12 of 12                            | 8 of 8                                           | 9 of 9                                     | 1 of 1                                    |
| strict OpenSpec after                              | 114 · 114 · 0                          | 114 · 114 · 0                       | 114 · 114 · 0                                    | 114 · 114 · 0                              | 114 · 114 · 0                             |

(`6·41` is 6 files, 41 tests.) Every proof filter was also run on its slice's green tree first and
matched exactly one test — thirty-three faults over twenty-three distinct titles.

The thirty-three faults were then run a **second** time through this document's own section 8 blocks —
step 0b's extraction, the records extracted per subsection, the filter check and the fault loop, all
copied out of the formatted packet — in the same clone at its last commit: every filter `1 matched`,
every fault `status=1` with its table's `Tests` line, every restore `cmp`-identical, every green rerun
`status=0`, the working tree clean afterwards, 4 min 42 s in all. The eight model counterexamples came
out byte-identical to the first run.

### 9.4 Planner-only, with the expected relative delta

The sandbox cannot run these: three tests in two files spawn `bun` from Node, there is no browser, a
build writes outside the attempt's lane, and devsync writes Git objects.

| Check                                                                                                                                                                                                       | Expected, relative to the base                                                                                                                                                                                                | Planner's own rehearsal                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit`                                                                                                               | slices 1–4 unchanged; slice 5 **− 1 file, − 1 test** (`composition.test.ts`)                                                                                                                                                  | base 48 files, 698 tests; after all five 47 files, 697 tests, exit 0 — on the rehearsal clone's slice-5 commit                  |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test`                                                                                                                    | UTC: slice 1 **+ 4** tests; slice 2 **+ 10**; slice 3 **+ 1 file, + 7**; slice 4 **+ 1 file, + 1**; slice 5 **− 2 files, − 2**. Net 0 files, **+ 20** tests. Auckland zoned unchanged                                         | base UTC 132 files, 3008 tests, zoned 2 · 3; after all five UTC 132 files, 3028 tests; zoned 2 · 3; exit 0 — on the same commit |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                               | exit 0 after each slice                                                                                                                                                                                                       | exit 0 on the same commit, `✓ built in 852ms`                                                                                   |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, with the slice staged                                                                                           | unchanged; no project target, no module README index, and the new files are a test fixture and three test files                                                                                                               | 366 tests, 0 failures, exit 0 both on the base and on the same commit                                                           |
| `CI=1 E2E_PORT_SHIFT=<a multiple of 300 clear of every live run, checked with ss -ltn> NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run wbs-fe-01:e2e -- <spec>`, per slice | exit 0, unchanged — slice 2: `e2e/project-settings.spec.ts` and `e2e/project-picker.spec.ts`; slice 3: `e2e/gantt-detail.spec.ts`; slice 4: `e2e/layout.spec.ts`; slices 1 and 5 touch no production behaviour a browser sees | **Pending planner verification.** Not run in this rehearsal. The executor never launches a browser.                             |
| the same target **unfiltered**, on its own shift, on the final integration commit                                                                                                                           | exit 0. The batch README's "Integration verification" requires the whole frontend browser suite once a frontend change lands; it overrides any narrower wording here                                                          | **Pending planner verification.** Not run, not waived.                                                                          |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                                  | exit 0 on the shared build host                                                                                                                                                                                               | **Not run**; reported as pending, never as passed.                                                                              |

`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is not decoration: `CLAUDECODE=1` changes Bun's test
output and fails thirteen unrelated tests in this repository.

### 9.5 What none of this proves

- No browser ran. The Chromium checks are the planner's and are pending, not waived.
- The model test drives the Mermaid key; the per-project layout keys share `remembered()` and are
  exercised only through the existing `WbsTable` suites over the fixture's runtime (section 3.6).
- The model does not re-explore `lifetime-slot.ts`'s own transition fencing.
- The coverage assertions prove the pinned run reached each interleaving, not that the space is
  exhausted.
- Nothing renders `persists` or `Recalled.persists` to a reader yet (section 1).

## 10. Stop conditions

Each is false on the real starting tree, checked on 2026-09-24.

1. Step 0a's status is not empty, or `base` differs from the slice note's SHA, or `fast-check` is not
   4.9.0. Stop: the clone is not the tree this packet was reviewed against, or the pinned
   counterexamples of section 8.4 were recorded under another generator.
2. Step 0b extracts other than 22 patches or 33 fault patches. Stop: this document is not the one
   reviewed.
3. A patch fails `git apply --check`. Stop and report the exact error; never hand-edit a file into shape.
4. A baseline (step 0c or a slice's step 1) exits non-zero. Stop, except for the two known cases below.
5. A red checkpoint shows **no** failure, or different diagnostics than section 6 names. Either means
   the tests did not land as written.
6. A proof filter matches zero tests, or more than one. Stop.
7. A fault leaves its named check passing. Restore, re-read the table, redo once; if it still passes,
   stop — the check may not be where this packet says it is.
8. The strict OpenSpec block exits non-zero, or `passed` falls below step 0's number.
9. At hand-over, the status shows any path outside the slice's own list. Stop.
10. Anything asks for a `git` state change in the clone, a network call, a browser, or `--no-verify`.
11. **Known, not this packet's:** `claims.db.test.ts` › `bounds terminal lock contention and retries
until a held write commits` failing; a single `Test timed out in 5000ms` in one of the twenty
    adopted files during a serial run on a loaded host; or a `DiBagCloseCancelledError`
    (`DI_BAG_CLOSE_TIMEOUT`) raised by a test file's own `afterEach` retirement of a
    `createLifetimeSlot<ApplicationServices>(50)` slot whose disposal settles — the modal, page and
    `gantt-detail` example blocks use a 50 ms budget, the same load-sensitive class as f1's 5 ms
    (section 4.3). Record it, rerun **that file alone once**, and stop only if it fails again. f1's `theme.model.test.tsx` is not in any run this packet prescribes.

## 11. Out of lane

- `lib/theme.ts` and its three test files; `app.test.tsx`; `account-menu.test.tsx`; `index-bootstrap.test.ts`.
  Their comments that name the deleted `composition.ts` and `composition-agreement.test.ts` stay as they
  are (section 13, assumption 5).
- `lifetime-slot.ts`, `application-runtime.ts`, `application-bootstrap.tsx`: read only.
- `wbs-table.tsx`, `plan-toolbar.tsx`: their layout writes now answer a `boolean` they do not read;
  nothing in them changes.
- `modules/preferences/module.ts`, `preferences.feature.ts`, `preferences.resource.ts`,
  `browser-storage.repository.ts`, `fake-browser-storage.ts` and their tests: untouched.
- `project.json`, `vitest.config.ts`, `vitest.node.config.ts`, `vitest.zoned.config.ts`, `bun.lock`,
  `package.json`: untouched. No dependency is added, removed or bumped.

## 12. Hand-over to the next packet

- `modules/preferences/composition.ts` is gone; every preference delivery reads comes from the page's
  runtime. Task 3 of `adopt-frontend-lifetimes` is unchecked **only** for the module's wiki index.
- `useApplicationServicesReader` is the runtime's call-time surface. A future site that reads a
  preference at an event should use it rather than capture `remembered` at render.
- `Recalled<T>`, `RuntimeRemembered<T>`, `GanttDetail.persists` and `Theme.persists` all publish "is
  this being remembered". None is rendered; a chrome packet can choose one surface for all of them.
- The K2 debt on `preferences` now has exactly one caller shape (`lib/remembered.ts`, through the
  slot) and is still OpenSpec task 12's to decide.
- `theme.model.test.tsx`'s 5 ms disposal budget failed once under parallel load (section 4.3); a
  one-line budget change there is the obvious fix and is not this packet's.

## 13. Assumptions recorded rather than asked

1. **Task 3 stays unchecked.** Its text requires "the module's wiki index declaring
   `module.frontend.preferences` and its files", and the module README says that index is its own
   packet. Ticking it would claim an outcome nobody delivered; the dated note says all five call sites
   moved and the duplicate is gone, and names the one outcome left.
2. **The K2 debt note is updated, not removed.** `preferences` is still exported and still read by
   `lib/remembered.ts`; removing the note would hide debt that still exists.
3. **Five slices, not three or four.** The modal is mounted in every table, so the fixture has to land
   before any site (section 1); the event-time and continuous consumers are different machines; the
   handle needs its own model test; the deletion must come last. Each slice was rehearsed as one
   attempt.
4. **The event-time sites act on the runtime live when a callback runs** (invariant E3), where
   `gantt-detail` and the theme treat a replaced runtime's chooser as superseded (C2). Section 3.2
   gives the reason; the existing requirement's "superseded chooser" scenario is about a consumer that
   keeps a store-derived answer on screen, and this packet's new requirement states E3 for the others.
5. **Comments in f1's tests that name the deleted files are left alone.** They record the pattern those
   tests were modelled on, one sits beside a test title f1's recorded proof filter names, and they are
   not this packet's files.
6. **40 ms disposal budget, seed `20260924`, 300 runs, 12 commands** for the model test: the whole run
   took about six seconds, every coverage counter was non-zero, and f1's 5 ms budget flaked on this
   host. The example blocks' 50 ms slots are the same class of load sensitivity; stop condition 11
   gives their one-rerun rule. A future author who changes the commands, seed or version re-rehearses and
   re-pins.
7. **Serial runs for the multi-file suites** (`--no-file-parallelism --maxWorkers=1`), as the project's
   own `test` target runs them: parallel runs on a loaded host time out pointer tests that pass alone.
8. **`fc.scheduler()` without React's `act`** in the model test: the handle has no React surface, so the
   scheduler orders disposal completions and notification deliveries, and there is nothing for `act` to
   flush.

## 14. The brief, point by point

### 14.1 The non-negotiables of the commissioning brief

| Requirement                                                                                              | Where this packet meets it                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| every fenced diff `git apply --check`s extracted in slice order; count asserted; output pasted           | §9.1: 22 patches and 33 fault patches, both counts asserted, separate `--check` and apply lines, output pasted, broken-patch rehearsal |
| intermediate trees typecheck                                                                             | §9.1: five green trees exit 0; the four red trees are the named red checkpoints                                                        |
| fresh, relative counts; empty status at step 0; owned-path hand-over                                     | §6 step 0a–0c; every expectation is "step 0's number ± the slice's own"; §6 hand-over lists                                            |
| real `sh` with `set -euo pipefail`, conditional status capture, durable wrappers                         | §6 `run-check.sh` and `expect-status.sh`; §8 procedure                                                                                 |
| no `Proof:` comments in listings; dated by observation                                                   | §7 listings carry none; §8 opening paragraph; slice 5 dates the task note with `date -u +%F`                                           |
| proof filters exact, typographic apostrophes, checked to match exactly one                               | §8 filter block; §9.3 last line                                                                                                        |
| recovery boundaries narrow; unexpected errors by identity; each rethrow mutated                          | §3.1: no site catches at all now; identity asserted by `m5`, `p6`, `g6`, `he`; order by `m4`, `p5`, `g5`                               |
| teardown: awaitable acquisition, `cleanup()` before awaited retirement, `try/finally`, nothing swallowed | §4.2 fixture; every new test file's `afterEach`; the model test's `giveEverythingBack` and faults `hf`, `hg`                           |
| the handle's modelled absent outcome is a typed return                                                   | §3.4–3.5: `Recalled<T>` and `boolean`; faults `hc`, `hh`                                                                               |
| its own design record and a model test with ≥ 4 rehearsed sabotages and pasted counterexamples           | §3.4, §7.15, §8.4: six implementation sabotages and two accounting sabotages, all eight counterexamples pasted                         |
| composition deleted with its tests, measured; debt note; task 3 dated                                    | §4.1, §7.19–7.22; §13 assumptions 1 and 2 record the two places this packet departs from the brief's wording, and why                  |
| no private absolute paths except the launcher; R2 names; no `any`/`!`/unchecked casts                    | the Dispatch block is the only one; no `any`, no `!`, and no cast outside the ones already in the files                                |
| never edit an existing assertion except where named                                                      | §6 slice 2 step 3 names the one edit                                                                                                   |

### 14.2 The batch-6 addendum's twenty points

| Point                       | Assessment                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reproduced red           | Met: four behavioural and compiler reds and slice 5's tier red, each rehearsed on the unchanged code with its diagnostics pasted (§6).                                     |
| 2. Typecheck and lint       | Met: both native, per slice, exit 0, and every slice committed with lefthook's lint and format on (§9.3).                                                                  |
| 3. Path counts              | Met: each hand-over lists the slice's exact paths; the planner's own commits add only this document (§6).                                                                  |
| 4. Failure-visible commands | Met: every check records its own status and `expect-status.sh` asserts it (§6 step 0b).                                                                                    |
| 5. HEAD-reading tests       | N/A: no project, target or CI path is renamed.                                                                                                                             |
| 6. Sandbox constraints      | Met: whole targets, build, devsync and Chromium are the planner's, with expected deltas (§9.4).                                                                            |
| 7. Known race               | Met: named, one rerun, no repair authority (§10.11).                                                                                                                       |
| 8. Names                    | Met: no product name appears in new identifiers; module ids untouched.                                                                                                     |
| 9. Packet form and evidence | Met: slices end in planner commits with exact subjects; per-slice relative baselines; production-path negatives with observed messages; nothing silently skipped.          |
| 10. Pins                    | Met: no pin touched; fast-check 4.9.0 checked at step 0 and asserted by the model test.                                                                                    |
| 11. Pipeline exit handling  | Met: the mutation `diff` form after one command; the filter count and the placeholder check use `if …; else rc=$?; test "$rc" -eq 1; fi` on single commands.               |
| 12. Planner chaining        | Met: the extraction script stops at the first failed check (§9.1).                                                                                                         |
| 13. Module index            | N/A: no file is added to a module directory; `src/testing/` is not one, and three files are deleted from the preferences module, which has no index block.                 |
| 14. Bun directory filters   | N/A: every suite runs through Vitest from `apps/wbs/fe-01`.                                                                                                                |
| 15. Interleaving property   | Met for the one site that owns a lifetime (the module-scope handle): §7.15, scheduler-ordered disposal and notification, pinned seed and runs.                             |
| 16. Model-based remedy      | Met for that site: reference model with its own byte oracle, re-entrant access from a notification, partial acquisition, controlled expiry, six plus two sabotages (§8.4). |
| 17. Seeded evidence         | N/A: no slice reads an earlier attempt's evidence.                                                                                                                         |
| 18. Symbol-based checks     | N/A: no code-shape checker is introduced.                                                                                                                                  |
| 19. Missing-file grep       | Met: every grep over a file follows a `test -f` or reads a variable, never a path that may be missing.                                                                     |
| 20. Honest limits           | Met: §3.6 and §9.5 state what the model and the rehearsal do not establish.                                                                                                |

## 15. Ready to commit

| Slice | Paths                                                                                                                                                                                                                                                                                                                                    | Subject                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1     | `spec.md`, `verify.md`, `apps/wbs/fe-01/src/runtime/application-services-context{,.test}.tsx`, the twenty-one test files of §4.2 — **25 modified**; `apps/wbs/fe-01/src/testing/live-application.tsx` — **1 new**                                                                                                                        | `test(frontend): publish the page runtime to every table suite`                    |
| 2     | `spec.md`, `verify.md`, `apps/wbs/fe-01/src/lib/remembered.ts`, `apps/wbs/fe-01/src/components/wbs/{project-settings-modal,project-page}{,.test}.tsx` — **7 modified**                                                                                                                                                                   | `feat(frontend): read the settings section and last project at the moment of use`  |
| 3     | `verify.md`, `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts` — **2 modified**; `apps/wbs/fe-01/src/components/wbs/gantt-detail.test.tsx` — **1 new**                                                                                                                                                                                 | `feat(frontend): follow the page runtime in the chart's detail switch`             |
| 4     | `spec.md`, `verify.md`, `apps/wbs/fe-01/src/lib/remembered.ts`, `apps/wbs/fe-01/src/components/wbs/{remembered-layout.ts,use-column-set.ts,use-plan-filter.ts,use-plan-layout.tsx}`, `apps/wbs/fe-01/src/testing/live-application.tsx` — **8 modified**; `apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts` — **1 new** | `feat(frontend): resolve layout preferences from the page runtime at each call`    |
| 5     | `apps/wbs/fe-01/src/modules/preferences/{composition.ts,composition.test.ts,composition-agreement.test.ts}` — **3 deleted**; `apps/wbs/fe-01/vitest.node-suites.ts`, `apps/wbs/fe-01/src/modules/preferences/{README.md,contract.ts}`, `tasks.md`, `verify.md` — **5 modified**                                                          | `refactor(preferences): delete the module-load duplicate delivery no longer reads` |

(`spec.md`, `verify.md` and `tasks.md` are under `openspec/changes/adopt-frontend-lifetimes/`.) After the
last commit the host gate runs on the shared build host with the committed hash, and its printed
running-hash line and exit status are recorded. Anywhere else it is reported as not run, with the
reason — never as passed. The Chromium runs of §9.4 are reported the same way until they have happened.

## 16. Disposition of review round 1

`puni-plan/reviews-batch-6/050-7-f2-delivery-call-sites.review1.md` — READY AFTER FIXES, no critical.
All five are applied.

| #           | Finding                                                                        | Disposition                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Important 1 | slice 1's fourth red example fails on an `AssertionError`, not the `TypeError` | **Applied.** Section 6, slice 1 step 3 names three examples on the `TypeError` and `refuses to read below no provider, naming itself` on the `AssertionError` the reviewer observed, with why (`safely()`); the count stays `4 failed \| 12 passed (16)`.                                                                                                                    |
| Important 2 | the base has moved to `a77c41e5`                                               | **Applied.** Dispatch names main after PR #48 as the base, lists what `a77c41e5` changed in `spec.md`, `tasks.md` and `verify.md`, and says `index` lines are informational. All 22 patches and 33 fault patches were re-applied and checked against `a77c41e5` by this author, OpenSpec 114 · 114 · 0 on the result; section 9.1 says what is byte-identical on which base. |
| Minor 1     | `Found N errors` never matches under Nx                                        | **Applied.** `run-check.sh` says its summary is orientation only; `expect-status.sh` reads the status line.                                                                                                                                                                                                                                                                  |
| Minor 2     | the 50 ms example budgets are load-sensitive too                               | **Applied.** Stop condition 11 gives a `DiBagCloseCancelledError` from a test file's own `afterEach` retirement the same one-rerun rule; assumption 6 points at it.                                                                                                                                                                                                          |
| Minor 3     | reds cannot be rebuilt by reverting on a later tree                            | **Applied.** Section 9.1 says reds are rebuilt from the base plus the slice's prefix of patches, and why reverting fails.                                                                                                                                                                                                                                                    |
