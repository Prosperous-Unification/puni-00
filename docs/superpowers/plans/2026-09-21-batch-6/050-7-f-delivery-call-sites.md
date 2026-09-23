# 050.7f The delivery call sites, off the staged duplicate and onto the runtime

|             |                                                                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **seventh packet**                                                                                                                                                                                                         |
| Size class  | S (one of five call sites; the rest are handed to a named follow-up — section 4 and section 11 say why)                                                                                                                                                                                                               |
| Predecessor | [050.7e](050-7-e-page-lifecycle.md) is not this packet's actual predecessor for the code it touches: this packet builds on `main` at `276c1e36` (the merged tip after e/e2/e3), and its own subject is [050.7c](050-7-c-application-context.md)'s task 3, left open there — see that packet's own section 11, item 2. |
| Design      | This packet's own section 4. Predecessor design: [The frontend lifetime slot](050-7-lifetime-slot-design.md), unmodified — this packet adds no new lifecycle mechanism, only consumers of the one `application-services-context.tsx` already exposes.                                                                 |
| OpenSpec    | `adopt-frontend-lifetimes`, task 3 (partially — one of five call sites; see section 10's stop condition and section 11's hand-over). This packet also adds one new requirement, "A delivery consumer of preferences degrades visibly when withdrawn" (section 7.11's spec diff).                                      |
| Revision    | This is the second revision of the packet committed at `f6d11b87`, after two reviews — see section 14, "Disposition of review 1", and section 15, "Disposition of review 2", for every finding and its fix.                                                                                                           |

## 1. Goal, the cut, and non-goals

**Goal.** Packet c installed `application-services-context.tsx` and its
`useApplicationServicesState()` hook, but left all five delivery call sites reading
`modules/preferences/composition.ts` — a module-load duplicate of the same preferences,
built once at import time, staged and recorded as debt (`composition.ts:6-22`). This
packet moves the call sites it can move safely onto the runtime's own services, so that
one fewer of the five reads the staged duplicate, and states, measures and designs the
rest so a follow-up packet does not have to re-discover what this one already found.

**The cut.** Section 3.3 below re-measures all five sites against the CURRENT tree
(`276c1e36`), not against packet c's own count. One of the five — `lib/theme.ts` — has a
render-site blast radius small enough to move in this packet's own slices; the other
four either touch hundreds of existing test render sites across many files
(`gantt-detail.ts`, transitively — section 3.2's second bullet has the corrected,
textual-occurrence count, materially larger than packet c's own "104" estimate), have a
comparable blast radius this packet's own remaining budget did not reach
(`project-page.tsx`/`project-settings-modal.tsx`), or need their own lazy-binding
mechanism designed and proved before any call site touches it
(`lib/remembered.ts`/`remembered-layout.ts`'s module-scope `storedMermaidSectionMode`).
Per the cut rule this packet was given: it does the site that fits — `lib/theme.ts` — in
full, with tests, and hands the other four to **050-7-f2** with the design this section
and section 4 already did for all five, so f2 does not restart from packet c's own
smaller estimate.

**Non-goals.**

- Moving `gantt-detail.ts`, `project-page.tsx`, `project-settings-modal.tsx` or
  `lib/remembered.ts` off `composition.ts`. Handed to 050-7-f2 — section 11.
- Deleting `modules/preferences/composition.ts` or `composition-agreement.test.ts`.
  Blocked on all five sites moving (`lib/remembered.ts`'s own generic factory is still
  the layout module's only store, and it is the hardest of the five) — section 11.
- Any change to `lifetime-slot.ts`, `application-runtime.ts`,
  `application-services-context.tsx` or `application-bootstrap.tsx`. All four are read,
  none is modified. `preferences.resource.ts`'s `ensureLive`/`WITHDRAWN` throw — the
  resource's own, unchanged contract — is reused and caught at the delivery boundary
  (section 4), not weakened.
- Closing OpenSpec task 3's checkbox. One of five call sites moved is not "delivery
  reads its preferences out of that one graph," and the module's own wiki index is
  still absent (`apps/wbs/fe-01/src/modules/preferences/README.md`) — section 10 states
  both as explicit, unconditional stops.

## 2. Read first

1. `LLM_README.md`, then this task's own link.
2. `docs/superpowers/plans/2026-09-21-batch-6/050-7-c-application-context.md` sections
   3.3, 4 and 11 — the measured facts this packet starts from, and packet c's own
   explanation of why it stopped short of moving any call site.
3. `docs/superpowers/plans/2026-09-21-batch-6/050-7-d-withdrawal-and-page-lifecycle.md`
   section 4 and `docs/superpowers/plans/2026-09-21-batch-6/050-7-e-page-lifecycle.md`
   section 11 — what "withdrawn" already means end to end, and why HMR (and, by the same
   reasoning, any eager module-scope binding) is a hard, separately-designed problem
   rather than a two-line fix.
4. `apps/wbs/fe-01/src/runtime/application-services-context.tsx` and its test — the one
   hook boundary this packet's moved site reads through, unmodified.
5. `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` — specifically `replace`/`retire`'s own
   JSDoc on synchronous withdrawal versus deferred, microtask notification: the fact
   this revision's own transition-3 test and fix depend on.
6. `apps/wbs/fe-01/src/lib/theme.ts`, `theme.test.ts`, `index-bootstrap.test.ts`,
   `app.test.tsx`, `src/components/chrome/account-menu.test.tsx` — the moved site and
   its full blast radius, before this packet's edit (the fifth file was missed by this
   packet's own first pass — section 3.3's fourth bullet).
7. `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts` lines 75-78
   (`ensureLive`) — the resource's own, unmodified throw this packet's delivery-layer
   catch is built on top of, never around.
8. `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`, `project-page.tsx`,
   `project-settings-modal.tsx`, `apps/wbs/fe-01/src/lib/remembered.ts`,
   `apps/wbs/fe-01/src/components/wbs/remembered-layout.ts`,
   `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx` line 2749 — the four sites this
   packet does not move, and the exact conditional (`ganttOpen &&`) around `GanttPanel`
   that section 3.2 reads for its own corrected claim.
9. `openspec/changes/adopt-frontend-lifetimes/tasks.md` tasks 3 and 12,
   `apps/wbs/fe-01/src/modules/preferences/README.md` (confirms the module's own wiki
   index is absent).

## 3. Verified facts

### 3.1 The staged duplicate, unchanged

`apps/wbs/fe-01/src/modules/preferences/composition.ts` still exports
`browserPreferences: Preferences` (line 23) and
`rememberedPreferences: RememberedPreferences` (lines 26-27), both built once at
import time over `browserStorage()` — no owner, no revocation, and (per
`composition-agreement.test.ts`) behaviourally identical to the runtime's own instance
because neither instance holds state: every preference lives in the reader's browser and
the adapter reaches it per call. `composition-agreement.test.ts` is unmodified by this
packet and still passes — nothing here changes what it proves.

### 3.2 The five call sites, re-measured against `276c1e36`

Packet c's section 3.3 named these five; re-grepped here, all five counts and one new
fact hold:

- `apps/wbs/fe-01/src/lib/theme.ts:13` (import), `:52`
  (`const storedChoice = rememberedPreferences.themeChoice(isThemeChoice);`) — **moved by
  this packet.**
- `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts:3` (import), `:39`
  (`const storedDetail = rememberedPreferences.ganttDetail;`) — not moved; the corrected
  blast-radius measurement below is why.
- `apps/wbs/fe-01/src/components/wbs/project-page.tsx:19` (import), `:94`
  (`const rememberedProject = rememberedPreferences.lastOpenedProject;`) — not moved.
- `apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx:13` (import), `:77`
  (`rememberedPreferences.projectSettingsSection(projectId, isSettingsSection)`, inside
  `storedSection`) — not moved.
- `apps/wbs/fe-01/src/lib/remembered.ts:1` (import), `:18`, `:26`
  (`browserPreferences.json(...)`/`.text(...)`, called per invocation inside `remembered`/
  `rememberedText`) — not moved; this is the module `remembered-layout.ts:247`'s
  module-scope `storedMermaidSectionMode` depends on.

**A sixth fact, additional to packet c's own count: `theme.ts:52`'s own `storedChoice`
is itself an eager module-scope binding**, built at import time over the staged
duplicate — the same shape as `remembered-layout.ts:247`'s `storedMermaidSectionMode`,
not merely "a bare zero-arg function with no provider" as packet c's own framing (its
section 3.3, first bullet) emphasised. `theme.ts` is imported transitively from
`application-bootstrap.tsx`'s own static `import { App } from '@/app'` (line 4), so
`storedChoice` is built before `bootstrapApplication` has awaited its first
`slot.replace` — exactly packet c's own description of why `remembered-layout.ts:247` is
hard. The design in section 4 below removes the binding entirely rather than delaying
it, which is why `theme.ts` was still small enough to move in this packet despite
sharing the hazard.

**Second, corrected fact — read as a textual-occurrence count, not a proof of dynamic
reach: `gantt-detail.ts`'s render-site blast radius is not the "104" packet c's own
section 3.3 cited, and it is not unconditional.**

- `git -C apps/wbs/fe-01 grep -c '<GanttPanel' src/components/wbs/gantt-panel.test.tsx`
  reads **104**, as packet c found; `gantt-panel.zoned.test.tsx` adds **1** more direct
  render; `gantt-panel.test.tsx` itself also has **3** `<WbsTable` occurrences, which
  packet c's own enumeration omitted from its running total.
- `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx:2749` renders `GanttPanel` **only
  while `ganttOpen`** (`{ganttOpen && (<GanttFaultBoundary>…<GanttPanel …/>…</...>)}`) —
  it is not unconditional, and a textual `<WbsTable` occurrence in a test file does not
  by itself prove that test ever opens the chart.
- A source scan (`grep -rlE '<WbsTable|<GanttPanel' src --include=*.test.tsx`, then a
  per-file count) finds **18 unique files**, not 19, carrying **263 `<WbsTable>`**
  occurrences plus **105 `<GanttPanel>`** occurrences (368 combined): `page-shortcuts.test.tsx`
  is under `components/ui`, not `components/wbs` — `plan-structure.test.tsx` (8),
  `plan-layout.test.tsx` (23), `plan-row-dependencies.test.tsx` (1),
  `components/ui/page-shortcuts.test.tsx` (1), `plan-table.test.tsx` (27),
  `optimization-integration.test.tsx` (7 `<WbsTable>` plus one `<ProjectPage` — see
  below), `plan-read-and-write.test.tsx` (44), `plan-toolbar.test.tsx` (15),
  `plan-chart-seam.test.tsx` (4), `gantt-panel.test.tsx` (3 `<WbsTable>` + 104
  `<GanttPanel>`), `plan-estimates.test.tsx` (6), `plan-filter.test.tsx` (15),
  `plan-row-render-cost.test.tsx` (5), `plan-dependencies.test.tsx` (9),
  `plan-keyboard.test.tsx` (3), `plan-cards.test.tsx` (61), `plan-cells.test.tsx` (31),
  `gantt-panel.zoned.test.tsx` (1 `<GanttPanel>`, 0 `<WbsTable>`).
- This is why `gantt-detail.ts` is handed to f2 rather than attempted here: converting
  its hook to read `useApplicationServicesState()` directly (the natural reading of
  design option (i) below) would require a provider at every one of those sites unless
  and until f2 measures which of them actually sets `ganttOpen` true, and packet c's own
  estimate understated even the textual count by roughly 3.5×.

`project-page.test.tsx` (8 `render`/`rerender` sites) and `optimization-integration.test.tsx`
(1 `<ProjectPage` site, inside the same file as 7 of its `<WbsTable>` sites) are the
blast radius for `project-page.tsx`; `project-settings-modal.test.tsx` has exactly **1**
`render(<ProjectSettingsModal` site (through a shared `mounted()` helper called 14
times) plus one bare-function unit test at line 393
(`expect(rememberedSettingsSection('nobody')).toBe('teams');`, no provider, no render).
Neither was attempted in this packet — section 11 hands both to f2 with this
measurement, smaller than `gantt-detail.ts`'s but still requiring the same
async-live-slot test-setup pattern this packet's own `theme.test.tsx`/`app.test.tsx`
slices demonstrate.

### 3.3 `theme.ts`'s own blast radius, exact

- `apps/wbs/fe-01/src/lib/theme.test.ts:62,68,74,81,95` — five direct, zero-argument
  calls to `rememberedTheme()`/`readTheme()`, no provider, no render (matches packet c's
  citation exactly).
- `apps/wbs/fe-01/src/index-bootstrap.test.ts:122` — one direct call to
  `rememberedTheme()`, comparing the pre-paint inline script in `index.html` against what
  the module would make of the same bytes (matches packet c's citation).
- `apps/wbs/fe-01/src/lib/theme.test.ts:126,136,147,155,166,178,193,227` — **eight**
  `renderHook(() => useTheme())` calls, no wrapper: `useTheme()` is the one hook boundary
  this packet adds, so all eight need a live `<ApplicationServicesProvider>` wrapper
  (section 6).
- `apps/wbs/fe-01/src/app.test.tsx` — eight `render(<App />)` sites (lines 47, 66, 78,
  100, 139, 189, 208, 217). `<App/>`'s own tree mounts `ThemeProvider`
  (`app.tsx`, confirmed by reading it: `ThemeProvider` wraps the branch that decides
  whether anybody is signed in), so all eight need the same wrapper. One describe block,
  "the theme control through the app" (lines 164-230), asserts persistence
  across an unmount and a fresh `render(<App/>)` — this is why this file's own wrapper's
  slot is genuinely **live** (installed, with its own `isLive` wired the same way
  `acquireApplicationRuntime` wires the real one) rather than the cheaper
  "never replaced" shortcut that would have sufficed for the other six tests in this
  file.
- **A fourth site, found only by running the whole `wbs-fe-01:test` target, not by
  grepping for `ThemeProvider`/`<App`, and missed by this packet's own first review
  round entirely:**
  `apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx` defines its own
  `ThemeHarness` component (line 274) that calls `useTheme()` directly — not through
  `<App/>` or `ThemeProvider` at all — and renders it at three sites (lines 304, 319, 326) inside `describe('the theme control, wired to the hook that owns it', ...)`,
  including the same persistence-across-remount shape as `app.test.tsx`'s own block.
  This file has no textual marker (`ThemeProvider`, `<App`, `import.*theme` alone all
  miss it or over-match) that a static grep against those strings would have caught
  reliably. Fixed the same way as `app.test.tsx`.

### 3.4 Tiers, targets and the sandbox

- Every file this packet touches is jsdom-tier (`theme.ts`, `theme.test.tsx`,
  `index-bootstrap.test.ts`, `app.test.tsx`, `account-menu.test.tsx`) or untouched by any
  tier boundary (`composition.ts`'s doc comment only). Nothing here is added to
  `vitest.node-suites.ts`.
- **The sandbox command's own baseline is 46 files / 674 tests, never 48/697.**
  `apps/wbs/fe-01/vitest.node-suites.ts` lists 48 files (`playwright-config.test.ts` and
  `src/components/wbs/short-date.test.ts` among them); the sandbox command
  (`bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts
--exclude src/components/wbs/short-date.test.ts`) excludes exactly those two, so its
  own file count is **46**, confirmed by running it: `Test Files 46 passed (46)`,
  `Tests 674 passed (674)`. The whole node-tier target (`wbs-fe-01:test:unit`, no
  exclusion) is a **separate, larger** number — planner-only, run through Nx, and never
  the sandbox command's own comparison baseline. Every slice below collects the sandbox
  command's own count fresh, at its own step 0, and compares only against that.
- `wbs-fe-01:test:unit` and `wbs-fe-01:test` are whole Nx targets; three unrelated
  existing tests spawn `bun` from Node and refuse inside an executor sandbox with
  `spawnSync bun EPERM` (batch 1's finding, unchanged). Both are **planner-only**;
  section 9 records this packet's own author running them directly, never inferred.
- `bun test <dir>` is a filter, not a path (addendum 14); this packet prescribes no bare
  `bun test`. `grep` on this workstation is ugrep, exits 1 on a missing file as well as
  no match (addendum 19); this packet's own verification commands use exit-status
  wrappers (`; echo "exit=$?"`) rather than a bare `grep … || test $? -eq 1`.
- The known `claims.db.test.ts` contention race is not this packet's; it touches no
  database code. Per the addendum's exception, if the whole-suite run shows exactly
  `claims.db.test.ts`'s `bounds terminal lock contention and retries until a held write
commits` failing, record it and rerun once without investigating.

### 3.5 Numbers, this revision's own fresh measurement — never an assumed constant

Counts are relative, never absolute. Every row below is this packet's own measurement,
taken by this packet's own author directly (not inside an executor sandbox), before and
after its one code change; the **required delta** is the acceptance criterion, never the
absolute totals, and no total here is fixed for a later attempt to assume — each slice
collects its own fresh baseline at its own step 0 and compares only against that.

| Command (from `apps/wbs/fe-01`)                                                                                                                                                                      | Before (base content at these paths, `276c1e36`)                                                                     | After (this revision's own tree)                                                                                                                                                                                                                     | Required delta                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx vitest run src/lib/theme.test.tsx src/index-bootstrap.test.ts src/app.test.tsx src/components/chrome/account-menu.test.tsx` (owned-path command)                                               | 4 files / 59 tests, exit 0 (17 + 15 + 7 + 20, each file's own base content, run individually and summed)             | 4 files / 64 tests, exit 0 (observed as one combined run: `Test Files 4 passed (4)`, `Tests 64 passed (64)`)                                                                                                                                         | **+0 net files (one rename) / +5 tests** — five new named examples in `theme.test.tsx` (reactivation, withdrawal-reset, the closured-write race, the runtime-vs-`composition.ts` distinguishing test, and the never-live degrade case); the other three files gain no test, only a wrapper/wiring change |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` (planner; whole-project build)                                                                                                                     | exit 0 (unmodified tree)                                                                                             | exit 0 (observed)                                                                                                                                                                                                                                    | unchanged                                                                                                                                                                                                                                                                                                |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint` (planner; whole-project eslint)                                                                                                                         | exit 0 (unmodified tree)                                                                                             | exit 0 (observed, after one `eslint --fix` for import order and one manual fix for a missing `react/display-name` on an anonymous test wrapper — both recorded in section 9)                                                                         | unchanged                                                                                                                                                                                                                                                                                                |
| `(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts)` (**the sandbox command's own baseline**) | 46 files / 674 tests, exit 0 (observed on the unmodified tree)                                                       | 46 files / 674 tests, exit 0 (observed after this packet's edits)                                                                                                                                                                                    | **no change** — this packet touches no node-tier file; every slice below compares against its own fresh run of this exact command, never against the whole `test:unit` target's 48/697                                                                                                                   |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit` (**planner-only**; whole node-tier target, for information — not a slice's own comparison baseline)    | 48 files / 697 tests, exit 0                                                                                         | 48 files / 697 tests, exit 0                                                                                                                                                                                                                         | unchanged (expected: this packet touches no node-tier file)                                                                                                                                                                                                                                              |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test` (**planner-only**; whole jsdom target, UTC+Auckland)                                                        | see section 9 for this revision's own fresh baseline and result, both observed, neither assumed                      | see section 9                                                                                                                                                                                                                                        | **+5 tests, 0 new files (net), 0 regressions**, expected from the owned-path row above                                                                                                                                                                                                                   |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                        | this revision's own fresh run: `{"items": 114, "passed": 114, "failed": 0}` — a measurement, not an assumed constant | this revision's own fresh run after applying section 7.7/7.8's diffs: `{"items": 114, "passed": 114, "failed": 0}` (unchanged: the new requirement's own scenarios do not change the item count, which counts requirements and specs, not scenarios) | unchanged                                                                                                                                                                                                                                                                                                |

## 4. Design: what changes, per site, the transitions this revision adds, and the invariant

**The invariant, stated once, that every one of the five sites — moved by this packet or
handed to f2 — must satisfy:** after 050.7 is fully done, no code path constructs a
`Preferences`/`RememberedPreferences` instance outside `installApplicationRuntime`
(the runtime owner), and every consumer of the runtime's preferences renders the
modelled `withdrawn` state correctly — **never a throw** — when the runtime is not live.
`useApplicationServicesState()` already proves the second half at the context boundary
(its own JSDoc, unmodified); each site's own design below is what carries that proof one
level further in, to the actual read/write call. `preferences.resource.ts`'s own
`ensureLive` (lines 75-78) still throws on a withdrawn access — that is its own resource
contract, unmodified and reused, not weakened: the delivery-layer catch this revision
adds around exactly that throw (transition 3 below) converts a documented resource-level
refusal into a documented delivery-level outcome; it does not make the resource itself
stop throwing.

**(i) Bare read functions called at render time, with existing zero-arg unit tests and
no render/provider anywhere in their blast radius — `theme.ts`, moved by this packet;
`project-settings-modal.tsx`'s `rememberedSettingsSection`, handed to f2 with the same
design.** The function stops closing over a module-load singleton and instead takes an
explicit `Remembered<T>` (or, where more than one key is involved,
`RememberedPreferences`) **parameter**. The **one** hook boundary — `useTheme()` for
`theme.ts`, `ProjectSettingsModal` itself for the settings modal — calls
`useApplicationServicesState()` once, derives the store via `useMemo` keyed on the
context's own `remembered` reference (stable while `live`, so the derived store is not
rebuilt every render — `preferences.feature.ts`'s `themeChoice`/`projectSettingsSection`
each build a fresh, stateless closure per call, cheap but not free to call on every
render for no reason), and passes it down.

**This revision's own correction, found by its first review: a store derived once by
`useMemo` and read once by a lazy `useState` initialiser is not enough — three further
transitions have to be handled explicitly, each with its own named test in
`theme.test.tsx`, not merely asserted in prose. Review 2 then found that the first
revision's own fix for transition 3 was itself wrong in three ways, closed here by a
typed lifecycle error, a superseded-chooser guard, and a catch inside the resync effect
as well as inside the chooser:**

1. **Withdrawal, while mounted.** A `useEffect` keyed on the memoised store (not only the
   lazy initialiser) reruns whenever it changes; going from a store to `null` resets
   `choice` to `'system'` and `persists` to `false` — matching the "never said" default
   exactly as the JSDoc promises, rather than leaving whatever palette was last painted
   (the defect the first review found: `choice` was initialised once and never reset).
2. **Reactivation, while mounted.** The same effect going from `null` (or an old store)
   to a new one re-reads that store's own persisted answer — a mounted hook that first
   saw `withdrawn` and later receives a `live` runtime adopts that runtime's saved
   choice, rather than staying on `'system'` forever (the defect the first review found:
   a hook mounted below a slot that later went live never adopted its saved choice).
   **This same effect's own read can itself race a retirement** — a sibling's
   `useLayoutEffect` commits, and can call `slot.retire()`, before this passive effect
   ever runs (review 2's Critical 2): the effect now wraps its live-branch read in the
   same typed-error catch transition 3 uses, recovering to the withdrawn state instead of
   letting the resource's own refusal reach React uncaught and trip `AppFaultBoundary`.
3. **A write racing withdrawal.** `chooseTheme`'s own closure can still hold a store
   that was live when this hook last rendered but has gone withdrawn since —
   `lifetime-slot.ts`'s own JSDoc: `retire()`/`replace()` withdraw publication
   **synchronously**, while the subscriber notification that would rebuild this closured
   store is deferred to a microtask. **Review 2's Critical 1: a blanket `catch { ...
}` around `rememberTheme` also swallowed an unrelated storage failure** (a live
   store whose `write` throws for its own reasons — site data blocked, a quota error —
   must still propagate). `contract.ts` now exports `PreferenceStoreLifecycleError` and
   `isPreferenceStoreLifecycleError`; `preferences.resource.ts`'s `ensureLive` and
   `browser-storage.repository.ts`'s revoked guard both throw it, over the same two
   messages they always have. `chooseTheme` writes first, then sets state: an
   unexpected (non-lifecycle) failure propagates with `choice` untouched; a lifecycle
   refusal is caught and degrades to a local-only choice with `persists: false`, never
   escaping as an uncaught error from a click handler.

**A fourth case, not a transition of `themeStore` itself, found by review 2's Important
1: a superseded chooser.** `chooseTheme` closes over the store it was built for. A
caller that retains an old render's `chooseTheme` past a _replacement_ (a live store
directly to another live store, never through `null` — so neither the resync effect's
guard nor the lifecycle-error catch above ever fires, because the write can genuinely
succeed against the wrong runtime) could otherwise move a replacement runtime's own
displayed state and reach into a runtime it no longer belongs to. `useTheme` now keeps
`themeStoreRef`, a plain ref assigned the current `themeStore` on every render; a
`chooseTheme` whose own closed-over store is not `themeStoreRef.current` is a documented
no-op — it returns before touching state, storage, or anything else.

**What stays tested by a generated property, not only by named examples (addendum
15):** `theme.test.tsx` adds one `fast-check` property (`fc.asyncProperty`, pinned
`seed`/`numRuns`) generating sequences of `chooseTheme`/`retire`/`replace`/settle against
a small reference model (expected displayed choice, expected persists, expected
storage), beyond the four named transitions above. It is narrower than
`lifetime-slot.ts`'s own scheduler property, deliberately: `useTheme` owns no lock, no
queue and no disposer of its own, and the property holds at most one transition in
flight at a time rather than re-exploring the slot's own fencing (that other file's own
claim). What it adds beyond the named examples is that `useTheme` renders the _correct_
value for every reachable combination the model can generate, not only the four
positions the named tests picked.

**A second, explicit degradation this revision adds: `persists: boolean` on `Theme` (and,
threaded through, on `ThemeContextValue`).** The first review found that silently
accepting a chosen-but-unpersisted answer is exactly the misleading behaviour
`browser-storage.repository.ts`'s own JSDoc warns against for a blocked store. `persists`
is `false` for precisely as long as the application services are withdrawn (including
the transient window transition 3 covers), `true` otherwise; no UI consumer reads it yet
(`AccountMenu`'s own props are unchanged — out of this packet's own scope), and the
OpenSpec change now states the contract this field exists to satisfy (section 7.11).

**(ii) The module-scope `storedMermaidSectionMode` in `remembered-layout.ts:247`, and
`lib/remembered.ts`'s generic `remembered()`/`rememberedText()` factory underneath every
one of `remembered-layout.ts`'s per-project stores — handed to f2, the hard one.** This
cannot use design (i)'s parameter-injection shape unchanged, because
`storedMermaidSectionMode` is not read inside a single component's render — it is a
**module-scope constant**, built once at import time by `<App/>`'s own static import
graph, before `bootstrapApplication` has awaited its first `slot.replace`. The fix must
make the binding **lazy**: replace the eager `export const storedMermaidSectionMode =
remembered(...)` with a **function** that resolves the current store **at first use**,
not at import time — most naturally, a hook (`useMermaidSectionMode`-shaped) that reads
`useApplicationServicesState()` the way `theme.ts` now does, for callers that are
components, plus an explicit non-hook accessor for `lib/remembered.ts`'s own remaining
non-React callers (there may be none once every caller is inventoried — f2's own first
slice is that inventory, not an implementation). **What a read attempted before the
runtime is live (or after withdrawal) must do: return the same modelled "nothing stored"
outcome every other absent key already returns — `claim()` answering `{status:
'absent'}`, `read()`/`readAndDrop()` answering `null` — never a throw.** A throw here
would reach a call site on `<App/>`'s own critical static-import path (for the
module-scope case) or inside a render this packet's own invariant says must not throw
(for every other caller), and would trip `AppFaultBoundary`, which — per its own JSDoc,
cited already in packet c's section 3.3 — "cannot heal itself" and never retries: a
withdrawn tick is a normal, recoverable lifecycle event, not a fault. `write`/`forget` on
a withdrawn store are a separate, harder question f2 must re-examine rather than copy
this revision's own `chooseTheme` catch unchanged: this revision's catch is narrow
(one call site, one closure, proved by one named race test); a module-scope write
reachable before any tree exists is a different shape of problem, and f2's own design
record must state what it does with its own test, not assume the same pattern transfers.

**(iii) The ~368 (textual) `<GanttPanel>`/`<WbsTable>` occurrences across 18 test files,
for `gantt-detail.ts` — handed to f2, with the render-site-count correction and the
`ganttOpen` conditional in section 3.2 above.** Two shapes were considered and neither is
chosen here (that choice is f2's own, made against the real, dynamically-measured count
rather than a textual grep): (a) `useGanttDetail` becomes a context-consuming hook
exactly like `useTheme`, and every one of the 18 test files' shared `render`/
`mounted`-style helper is swapped for a test-only fixture that wraps its subject in a
live `<ApplicationServicesProvider>` by default — small **per call site** (often one
import-line swap per file, this packet's own `theme.test.tsx`/`account-menu.test.tsx`
wrappers are the worked example) but touching every one of 18 files; or (b)
`GanttPanel`/`WbsTable` take `remembered` as an explicit **prop**, sourced once by
whichever single production composition point already sits under the provider (`<App/>`
itself, or `WbsTable`'s own nearest ancestor), keeping every one of the 368 occurrences
untouched at the cost of a prop threaded through every layer between the provider and
`GanttPanel`. Whichever fits, the panel must never construct its own preferences —
this packet's invariant applies to shape (b) exactly as much as (a).

### Why `theme.ts` fit and the other four did not: the deciding measurement

Not size alone — `project-settings-modal.tsx`'s own blast radius (1 render site, 1
bare-function test) is _smaller_ than `theme.ts`'s (8 `renderHook` sites, 8 `render`
sites in `app.test.tsx`, 3 in `account-menu.test.tsx`, plus the persistence-across-remount
describe blocks that forced a genuinely live slot rather than an empty one — section 3.3's
fourth bullet). It was cut for a different reason: `project-settings-modal.tsx`'s own
remaining code (`show`, `onOpenChange`, the `dirtyRef`/`reporters` machinery) is
unrelated to this move and this packet's author had already spent this packet's own
budget proving `theme.ts`'s harder case (the eager module-scope binding, section 3.2's
sixth fact, and the three lifecycle transitions this revision's own review found) end to
end, including its four negative proofs (section 8). `project-page.tsx` and
`gantt-detail.ts` were cut on size (section 3.2's corrected counts). `lib/remembered.ts`
was cut because it is design (ii), the one this packet's own author judged needs its own
design record before any code, matching the addendum's point 16 ("three review rounds
finding new races means the design is wrong, not the packet" — the analogous risk here
is a false-green "it's just a lazy getter" fix that misses the write-before-any-tree-exists
case section 4(ii) already flags).

## 5. File plan

| Path                                                                               | Change                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/lib/theme.ts`                                                  | Modify — remove the module-scope `storedChoice`; parameterise `rememberedTheme`/`readTheme`/`rememberTheme`; `useTheme` reads `useApplicationServicesState()`; add `persists`, the superseded-chooser ref guard, and typed-error catches in the resync effect and `chooseTheme`. |
| `apps/wbs/fe-01/src/lib/theme.test.ts` → `theme.test.tsx`                          | Rename by **filesystem `mv`** (JSX wrapper needs `.tsx`; the executor sandbox's `.git` is read-only and `git mv` is forbidden — preamble rule 1) and modify — runtime-path bare-function tests, provider wrapper on every `renderHook`, nine new named/generated examples.       |
| `apps/wbs/fe-01/src/index-bootstrap.test.ts`                                       | Modify — one call site moves to the runtime path, retained and closed.                                                                                                                                                                                                           |
| `apps/wbs/fe-01/src/app.test.tsx`                                                  | Modify — a live `<ApplicationServicesProvider>` wrapper (its own `isLive` wired) around every `render(<App/>)`, retired in `afterEach` after React cleanup.                                                                                                                      |
| `apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx`                       | Modify — the same live-wrapper treatment around `ThemeHarness`'s three render sites (section 3.3's fourth bullet; found by the whole-suite run, not the static grep).                                                                                                            |
| `apps/wbs/fe-01/src/modules/preferences/contract.ts`                               | Modify — adds `PreferenceStoreLifecycleError` and `isPreferenceStoreLifecycleError` (section 4, review 2 Critical 1). No existing export changes shape.                                                                                                                          |
| `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`                   | Modify — `ensureLive`'s throw becomes `new PreferenceStoreLifecycleError(WITHDRAWN, 'withdrawn')`, same message.                                                                                                                                                                 |
| `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts`             | Modify — `revocableStorage`'s revoked guard throws `new PreferenceStoreLifecycleError(REVOKED, 'revoked')`, same message.                                                                                                                                                        |
| `apps/wbs/fe-01/src/modules/preferences/composition.ts`                            | Modify — JSDoc only: records that one of five call sites has moved and names the other four.                                                                                                                                                                                     |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                               | **Prescribed diff (section 7.10), not applied by this packet's own author** to the real tree at hand-over — see section 10's stop condition on ticking task 3. Rehearsed and reverted; only its diff is committed, inside this document.                                         |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` | **Prescribed diff (section 7.11), not applied by this packet's own author** to the real tree at hand-over — the new requirement section 4 states. Rehearsed (validated, see section 9) and reverted; only its diff is committed.                                                 |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                              | **Prescribed diff (section 7.12)**, appended in the same "Packet 050.7f" shape every other packet's own verify.md entries use.                                                                                                                                                   |
| `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`                                | **Unmodified.** Handed to f2 — section 4(iii), section 11.                                                                                                                                                                                                                       |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx`                               | **Unmodified.** Handed to f2 — section 4(i), section 11.                                                                                                                                                                                                                         |
| `apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx`                     | **Unmodified.** Handed to f2 — section 4(i), section 11.                                                                                                                                                                                                                         |
| `apps/wbs/fe-01/src/lib/remembered.ts`, `remembered-layout.ts`                     | **Unmodified.** Handed to f2 — section 4(ii), section 11.                                                                                                                                                                                                                        |

## 6. Method: this revision was rehearsed and verified directly, not through a separate executor dispatch

**This packet's own author wrote, rehearsed and verified every line below directly, on
this exact worktree, rather than dispatching to a separate executor agent.** Section 9
is a record of commands this packet's own author actually ran and their actual output,
never predicted. The "slices" below are the same shape every batch-6 packet's own
slices take — each with its own baseline, red, green and verification — so that if this
packet is ever handed to a fresh executor for a _further_ revision, the same shape
dispatches cleanly; they are not, and were not, three separate attempts here.

**Dispatch, if this packet is ever handed to a fresh executor for a further change:**
`/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-7-f-delivery-call-sites <slice>
<sha> --batch batch-6`, where `<sha>` is a commit that already contains this document at
`docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md` — this
revision's own commit qualifies (its sha is in this document's own git history and in
the report handed back to this packet's caller), and so does its parent `f6d11b87`,
which contains the packet's pre-review text (not this revision's fixes — a fresh
executor dispatched against `f6d11b87` would be executing the version section 14
disposes of, not this one, and dispatched against the parent of this revision's own
commit would be executing the version section 15 disposes of). Add `--resume` to
continue an interrupted clone in place rather than starting a fresh one, and
`--require-ancestor <sha>` to refuse dispatch unless a named prerequisite (for instance
an earlier slice's own commit) is already in the clone's history.

**Baselines are always relative, never a fixed literal a later attempt is required to
reproduce exactly.** Every slice's own step 0 below runs its own comparison commands
fresh and keeps their output; every later comparison in that slice is against those
recorded observations, not against a number printed in this document. The absolute
counts printed in this section and in section 3.5 are what this revision's own planner
observed on `276c1e36`, on 2026-09-23 — informational, and labelled as such; a fresh
attempt's own step 0 may legitimately observe a different absolute count (an unrelated
packet landing between `276c1e36` and its own dispatch commit) and must still proceed,
comparing only against what its own step 0 recorded.

Every command below that is not itself a single line is a complete, real `sh` script,
never an inline fragment. A command whose exit status is asserted always captures it
explicitly and conditionally, per the addendum's own worked form:

```sh
set -euo pipefail
if some-command > "$TMPDIR/evidence/some.log" 2>&1; then
  status=0
else
  status=$?
fi
echo "exit=$status" >> "$TMPDIR/evidence/some.log"
test "$status" -eq 0   # or the exact expected non-zero status
```

### Step 0 — at the start of every slice, from the repository root

```sh
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice-start-status.txt"
if (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts) \
  > "$TMPDIR/evidence/step0-node.log" 2>&1
then
  node_status=0
else
  node_status=$?
fi
echo "exit=$node_status" >> "$TMPDIR/evidence/step0-node.log"
test "$node_status" -eq 0
```

This slice's own comparison baseline is whatever `step0-node.log` records — this
revision's own planner observed **46 files / 674 tests, exit 0**, both before and after
its edits (informational, section 3.5) — never the whole `test:unit` target's own,
separate, planner-only count (48/697). A later run of this same command in this same
slice is compared only against this slice's own `step0-node.log`.

### Slice 1 — the design record (already completed planner preparation)

Subject (already committed): `docs(plans): add the seventh 050.7 packet (delivery call
sites onto the runtime's preferences)`, at `f6d11b87`. This revision's own subject is
`docs(plans): revise the seventh 050.7 packet after its second review` (section 15). No
code in either commit — this document's own sections 1 through 5 are the artifact. A
fresh executor dispatching against a commit that already contains this file (any commit
at or after `f6d11b87`, or after this revision's own sha) finds slice 1 already
satisfied and starts at slice 2.

### Slice 2 — `theme.ts`, its typed lifecycle error, and its four test files, red then green, test-first

Subject: `feat(fe-01): move lib/theme.ts onto the runtime's preferences`

Owned paths: `apps/wbs/fe-01/src/lib/theme.ts`,
`apps/wbs/fe-01/src/modules/preferences/contract.ts`,
`apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`,
`apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts`,
`apps/wbs/fe-01/src/lib/theme.test.ts` (renamed by filesystem `mv` to `theme.test.tsx` —
both paths are listed so the hand-over inventory names the deletion and the addition
separately, matching an unstaged rename's real `git status` shape: ` D
apps/wbs/fe-01/src/lib/theme.test.ts` and `?? apps/wbs/fe-01/src/lib/theme.test.tsx`),
`apps/wbs/fe-01/src/index-bootstrap.test.ts`, `apps/wbs/fe-01/src/app.test.tsx`,
`apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx`.

- [ ] **Red, on the unchanged tree — the type-check red, the one this slice actually
      depends on.** `mv apps/wbs/fe-01/src/lib/theme.test.ts
apps/wbs/fe-01/src/lib/theme.test.tsx`, then apply the four test-file diffs
      (sections 7.2, 7.3, 7.4, 7.5) against the tree as it stands on `276c1e36` — not yet
      `theme.ts`, `contract.ts`, `preferences.resource.ts` or
      `browser-storage.repository.ts` (sections 7.1, 7.6, 7.7, 7.8).

  ```sh
  set -euo pipefail
  if NX_DAEMON=false bunx nx run wbs-fe-01:typecheck \
    > "$TMPDIR/evidence/slice2-red-typecheck.log" 2>&1
  then
    status=0
  else
    status=$?
  fi
  echo "exit=$status" >> "$TMPDIR/evidence/slice2-red-typecheck.log"
  test "$status" -eq 1
  ```

  Expected and observed (this revision's own fresh rehearsal, 2026-09-23): exit 1,
  `Found 21 errors in 2 files` — `TS2724: '"./theme"' has no exported member named
'isThemeChoice'` in both `index-bootstrap.test.ts:11` and `theme.test.tsx:18`;
  `TS2554: Expected 0 arguments, but got 1` at every parameterised
  `rememberedTheme(themeStore)`/`readTheme(themeStore)` call site
  (`index-bootstrap.test.ts:135`; `theme.test.tsx:156,164,172,181,197`); `TS2339:
Property 'persists' does not exist on type 'Theme'` at every assertion reading it (13
  occurrences in `theme.test.tsx`); and one `TS2322: Type 'unknown' is not assignable to
type 'ThemeChoice'` inside the generated property's own settle helper (an
  `isThemeChoice` type guard the compiler cannot yet resolve, because `isThemeChoice`
  itself is not yet exported). `app.test.tsx` and `account-menu.test.tsx` contribute no
  error here: both files' own new imports
  (`installApplicationRuntime`/`ApplicationServicesProvider`/`createLifetimeSlot`)
  resolve against `runtime/application-runtime.ts` and
  `runtime/application-services-context.tsx`, both unmodified by this packet and already
  present on `276c1e36`.

  **Second, and separately: `bunx vitest run` does not fail to start, but fails
  narrowly, for a reason distinct from the type-check red** — esbuild strips types
  without checking arity, so the unmodified `rememberedTheme()`/`readTheme()` silently
  ignore the extra argument every parameterised call now passes.

  ```sh
  set -euo pipefail
  if (cd apps/wbs/fe-01 && bunx vitest run src/lib/theme.test.tsx \
    src/index-bootstrap.test.ts src/app.test.tsx \
    src/components/chrome/account-menu.test.tsx) \
    > "$TMPDIR/evidence/slice2-red-vitest.log" 2>&1
  then
    status=0
  else
    status=$?
  fi
  echo "exit=$status" >> "$TMPDIR/evidence/slice2-red-vitest.log"
  test "$status" -eq 1
  ```

  Expected and observed: exit 1, `Test Files 1 failed | 3 passed (4)`, `Tests 12 failed
| 56 passed (68)`. Every one of the 12 failures reads `expected undefined to be
false`/`true` on `.persists` (the unmodified `Theme` has no such member, so every
  assertion on it sees `undefined`) or the generated property's own equivalent
  assertion; no test fails on `.choice` or `.palette`, because the unmodified
  zero-argument reads still agree with the fixture's own bytes — a real, narrow red,
  recorded exactly as observed rather than overstated as "does not even start."

- [ ] Apply the `contract.ts`, `preferences.resource.ts` and
      `browser-storage.repository.ts` diffs (sections 7.6, 7.7, 7.8), then the `theme.ts`
      diff (section 7.1).
- [ ] **Green:**

  ```sh
  set -euo pipefail
  if (cd apps/wbs/fe-01 && bunx vitest run \
    src/lib/theme.test.tsx src/index-bootstrap.test.ts src/app.test.tsx \
    src/components/chrome/account-menu.test.tsx) \
    > "$TMPDIR/evidence/slice2-green.log" 2>&1
  then
    status=0
  else
    status=$?
  fi
  echo "exit=$status" >> "$TMPDIR/evidence/slice2-green.log"
  test "$status" -eq 0
  ```

  Expected and observed: exit 0, `Test Files 4 passed (4)`, `Tests 68 passed (68)` — 26
  in `theme.test.tsx` (17 base + 9 new: withdrawal-while-mounted,
  reactivation-while-mounted, the resync-effect's own layout-effect race, the
  closured-write race, the superseded-chooser guard, the runtime-vs-`composition.ts`
  distinguishing case, the never-live degrade case, the never-live null-guard case, and
  the generated `fast-check` property) + 15 in `index-bootstrap.test.ts` + 7 in
  `app.test.tsx` + 20 in `account-menu.test.tsx`.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0 — observed.
- [ ] `(cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences)`: exit 0, `Test
Files 6 passed (6)`, `Tests 39 passed (39)` — unchanged from this same command's
      own pre-edit run; both DOM-bearing files in this subset
      (`composition-agreement.test.ts`, `browser-storage.repository.test.ts`) keep every
      existing message-based assertion passing, because
      `PreferenceStoreLifecycleError`'s own message text is unchanged from the plain
      `Error` it replaces.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0 — observed, after one
      `bunx eslint --fix` round (import order in `theme.test.tsx` and
      `preferences.resource.ts`, per addendum's "an autofixable import-order or
      prettier lint error is fixed with `bunx eslint --fix`, not a stop") and two manual
      fixes: a `jsdoc/no-multi-asterisks` line in `theme.ts`'s own new JSDoc (autofix
      corrupted the prose by deleting a real character; fixed by hand instead), and four
      `@typescript-eslint/no-unnecessary-condition` findings in the generated property
      test's own model — a captured `let` was narrowed inconsistently across the
      closures that reassign it; fixed by holding the model's fields as properties of one
      object instead of several bare `let` locals.
- [ ] The sandbox baseline from step 0, re-run: unchanged, 46 files / 674 tests, exit 0
      — this slice touches no node-tier file.
- [ ] The six negative proofs in section 8: mutate each of the six independently-named
      guards in turn; rerun the exact focused command section 8's own table names; observe
      the exact failure recorded there; restore each with `cp` from a pre-mutation copy;
      `cmp` byte-identical; rerun the whole slice-2 green command to confirm the restore
      is complete, not only the one test.

Hand over, ten paths: ` D apps/wbs/fe-01/src/lib/theme.test.ts`, `??
apps/wbs/fe-01/src/lib/theme.test.tsx`, and ` M` on `theme.ts`, `contract.ts`,
`preferences.resource.ts`, `browser-storage.repository.ts`, `index-bootstrap.test.ts`,
`app.test.tsx`, `account-menu.test.tsx`, plus this packet's own plan document with a
leading ` M` (a concurrent planner revision, explicitly permitted).

### Slice 3 — `composition.ts`'s doc comment, the OpenSpec change, format, build, and hand-over

Subject: `docs(fe-01,openspec): record theme.ts's move off the staged preferences duplicate`

Owned paths: `apps/wbs/fe-01/src/modules/preferences/composition.ts`,
`openspec/changes/adopt-frontend-lifetimes/tasks.md`,
`openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`,
`openspec/changes/adopt-frontend-lifetimes/verify.md`.

- [ ] Apply the diff in section 7.9 (`composition.ts`). No test changes —
      `composition-agreement.test.ts` is unmodified and still passes unchanged (it tests
      `ganttDetail`, a site this packet does not move).
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0 (doc-only change; this
      step exists to catch an accidental JSDoc syntax error, not a real risk here) —
      observed.
- [ ] `(cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences)`: unchanged from
      this slice's own step 0 sandbox baseline's own preferences subset — collect this
      command's own fresh count at this slice's own step 0 before applying any diff, and
      compare only against that (addendum point 4).
- [ ] **Apply the OpenSpec diffs (sections 7.10, 7.11) and validate them for real. A
      fresh executor applying this slice APPLIES BOTH DIFFS AND KEEPS THEM — they are
      not reverted at this slice's own hand-over; only this packet's own planner
      rehearsal reverts its private tree afterward, because this packet's committed
      deliverable is the plan document alone (see this section's own closing note).**

  ```sh
  set -euo pipefail
  if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
    > "$TMPDIR/evidence/slice3-openspec-baseline.json" 2>&1
  then
    status=0
  else
    status=$?
  fi
  test "$status" -eq 0
  python3 -c "
  import json
  d = json.load(open('$TMPDIR/evidence/slice3-openspec-baseline.json'))
  t = d['summary']['totals']
  assert t['failed'] == 0, t
  assert isinstance(t['items'], int) and t['items'] > 0, t
  assert isinstance(t['passed'], int) and t['passed'] > 0, t
  print(t)
  "
  # apply the tasks.md and spec.md diffs here (sections 7.10, 7.11), then:
  if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
    > "$TMPDIR/evidence/slice3-openspec-after.json" 2>&1
  then
    status=0
  else
    status=$?
  fi
  test "$status" -eq 0
  python3 -c "
  import json
  d = json.load(open('$TMPDIR/evidence/slice3-openspec-after.json'))
  t = d['summary']['totals']
  assert t['failed'] == 0, t
  assert isinstance(t['items'], int) and t['items'] > 0, t
  assert isinstance(t['passed'], int) and t['passed'] > 0, t
  print(t)
  "
  ```

  Expected and observed: both runs report `{"items": 114, "passed": 114, "failed": 0}` —
  this rehearsal's own fresh count (section 3.5), not an assumed constant.

- [ ] Append the `verify.md` diff (section 7.12).
- [ ] Owned-file formatting, then repository-wide format checking:

  ```sh
  set -euo pipefail
  GSETTINGS_BACKEND=memory bunx prettier --write \
    docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md \
    openspec/changes/adopt-frontend-lifetimes/tasks.md \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md
  GSETTINGS_BACKEND=memory bunx prettier --check \
    docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md
  if bunx nx format:check --all > "$TMPDIR/evidence/slice3-format-check.log" 2>&1; then
    status=0
  else
    status=$?
  fi
  echo "exit=$status" >> "$TMPDIR/evidence/slice3-format-check.log"
  test "$status" -eq 0
  ```

- [ ] Frontend build, wrapped so a slow run's status is durably recorded either way:

  ```sh
  set -euo pipefail
  if NX_DAEMON=false bunx nx run wbs-fe-01:build \
    > "$TMPDIR/evidence/slice3-build.log" 2>&1
  then
    status=0
  else
    status=$?
  fi
  echo "exit=$status" >> "$TMPDIR/evidence/slice3-build.log"
  test "$status" -eq 0
  ```

- [ ] **Planner-only**, run by this packet's own author directly, wrapped the same way:
      `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
wbs-fe-01:test:unit`, `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT
bunx nx run wbs-fe-01:test`, and `NX_DAEMON=false bunx nx run
tool-devsync:test --skip-nx-cache` with this packet staged. Observed values are in
      section 9. Any of these three that a fresh executor's own sandbox cannot run (the
      first two spawn `bun` from Node and refuse with `spawnSync bun EPERM`) is recorded
      as **pending planner verification**, with the value this packet's own planner
      observed named explicitly, never silently skipped.

Hand over: all of slice 2's paths plus `composition.ts`, `tasks.md`, `spec.md`,
`verify.md`, all ` M`, and the plan document, ` M`. Nothing outside section 5's file
plan differs from `276c1e36` for a fresh executor's own hand-over.

**This packet's own planner's private rehearsal, by contrast, reverts every code and
OpenSpec file before its own hand-over** (`git checkout 276c1e36 --
apps/wbs/fe-01/src/lib/theme.ts …` for every path in section 5, and
`git checkout 276c1e36 -- openspec/changes/adopt-frontend-lifetimes/tasks.md
openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
openspec/changes/adopt-frontend-lifetimes/verify.md`), because this packet's own
committed deliverable is the plan document alone — every diff in section 7 is
prescribed for whoever executes the packet for real, not landed by this rehearsal.
This is process housekeeping specific to how this particular revision was produced, not
an instruction inside any slice above: no slice above tells its own executor to revert
anything it applied.

## 7. The code

Every diff below is `git diff`'s own machine-generated output against `276c1e36`,
pasted verbatim — none of them was hand-assembled or edited after generation. Section 9
records the literal `git apply --check` output for each, run against the extracted
fenced text of this exact document, in slice order, after a filesystem `mv`.

### 7.1 `apps/wbs/fe-01/src/lib/theme.ts`

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.ts b/apps/wbs/fe-01/src/lib/theme.ts
index 8b67409d..10bdac68 100644
--- a/apps/wbs/fe-01/src/lib/theme.ts
+++ b/apps/wbs/fe-01/src/lib/theme.ts
@@ -7,11 +7,13 @@ import {
   useContext,
   useEffect,
   useMemo,
+  useRef,
   useState,
 } from 'react';

-import { rememberedPreferences } from '@/modules/preferences/composition';
+import { isPreferenceStoreLifecycleError, type Remembered } from '@/modules/preferences/contract';
 import { THEME_KEY } from '@/modules/preferences/preference-keys';
+import { useApplicationServicesState } from '@/runtime/application-services-context';

 /**
  * What a reader has asked for, which is not the same as what is painted.
@@ -44,22 +46,36 @@ export const DARK_QUERY = '(prefers-color-scheme: dark)';
 /** The class `styles.css` hangs the dark token set on. */
 export const DARK_CLASS = 'dark';

-function isThemeChoice(claimed: unknown): claimed is ThemeChoice {
+/** Whether a value read from storage names one of the three {@link ThemeChoice}s. */
+export function isThemeChoice(claimed: unknown): claimed is ThemeChoice {
   return claimed === 'system' || claimed === 'light' || claimed === 'dark';
 }

-/** The choice as stored, judged by {@link isThemeChoice}. */
-const storedChoice = rememberedPreferences.themeChoice(isThemeChoice);
-
 /**
- * The choice as this browser last said it — and `system` where it has never
- * said, which is the state every reader starts in.
+ * The choice as this browser last said it, over the given store — and
+ * `system` where it has never said, which is the state every reader starts
+ * in.
+ *
+ * Takes its store rather than closing over a module-load singleton:
+ * {@link useTheme} is this file's one caller inside a render tree, and it
+ * builds the store from {@link useApplicationServicesState} on every relevant
+ * render instead — a module-scope binding here would be built at import
+ * time, before any runtime exists, exactly the hazard
+ * `remembered-layout.ts`'s `storedMermaidSectionMode` is in (see
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md`
+ * section 4).
  *
- * The stored value is a claim, not a fact, and {@link remembered} is where that
+ * The stored value is a claim, not a fact, and {@link Remembered} is where that
  * is dealt with for every key this app holds: anything that is not one of the
  * three takes the key with it and the answer goes back to `system`.
+ *
+ * @throws {@link PreferenceStoreLifecycleError} when `themeStore`'s own
+ * runtime has gone withdrawn or been revoked since this store was built — see
+ * `modules/preferences/contract.ts`. {@link useTheme}'s own effect is the one
+ * caller that catches it; every other caller (this file's own tests, the
+ * bootstrap parity check) runs it against a store it knows is live.
  */
-export function rememberedTheme(): ThemeChoice {
+export function rememberedTheme(themeStore: Remembered<ThemeChoice>): ThemeChoice {
   // Proof: `readAndDrop` replaced by `read`, which is what "read the claim,
   // drop nothing" comes to. `refuses a stored answer that is not one of the
   // three, and drops the key` failed on `expected '"midnight"' to be null` —
@@ -68,14 +84,14 @@ export function rememberedTheme(): ThemeChoice {
   // Proof: the shared refusal drop made a no-op failed three resource cases,
   // including `a read that drops removes the refused key; a plain read writes
   // nothing`, on `expected '"midnight"' to be undefined`. Observed 2026-09-20.
-  return storedChoice.readAndDrop() ?? 'system';
+  return themeStore.readAndDrop() ?? 'system';
 }

 /**
  * The same read with **nothing written** — what a React render is allowed to
  * do.
  *
- * {@link useTheme}'s lazy `useState` initialiser calls this and its mount
+ * {@link useTheme}'s lazy `useState` initialiser calls this and its resync
  * effect calls {@link rememberedTheme}, which is the same split
  * {@link useTheme}'s own `chooseTheme` states in prose: a function React may
  * call twice during a render is no place for a side effect. Cross-review,
@@ -87,13 +103,13 @@ export function rememberedTheme(): ThemeChoice {
  * (`index-bootstrap.test.ts`) and that check reads "what does this module make
  * of these bytes, storage and all".
  */
-export function readTheme(): ThemeChoice {
-  return storedChoice.read() ?? 'system';
+export function readTheme(themeStore: Remembered<ThemeChoice>): ThemeChoice {
+  return themeStore.read() ?? 'system';
 }

 /** Writes the answer down. `system` is stored, not absent — see {@link rememberedTheme}. */
-export function rememberTheme(choice: ThemeChoice): void {
-  storedChoice.write(choice);
+export function rememberTheme(themeStore: Remembered<ThemeChoice>, choice: ThemeChoice): void {
+  themeStore.write(choice);
 }

 /**
@@ -143,12 +159,27 @@ export function paintPalette(palette: Palette): void {
   document.documentElement.classList.toggle(DARK_CLASS, palette === 'dark');
 }

-/** What {@link useTheme} hands back: the answer, and the way to change it. */
+/**
+ * What {@link useTheme} hands back: the answer, the way to change it, and
+ * whether that answer is actually being remembered right now.
+ */
 export interface Theme {
   choice: ThemeChoice;
   /** What is on screen right now, which is `choice` unless `choice` is `system`. */
   palette: Palette;
   chooseTheme: (choice: ThemeChoice) => void;
+  /**
+   * Whether this browser is remembering `choice` right now — `false` for
+   * exactly as long as the application services are withdrawn (including the
+   * transient window between a store going withdrawn and this hook's next
+   * render): nothing here reads or writes a store, `choice` is the in-tree
+   * default or a local-only pick, and no write reaches the reader's browser.
+   * The explicit, visible degradation R5 asks for — a silently-accepted,
+   * unpersisted choice is exactly the misleading behaviour
+   * `browser-storage.repository.ts`'s own JSDoc warns against for a blocked
+   * store.
+   */
+  persists: boolean;
 }

 /**
@@ -158,6 +189,73 @@ export interface Theme {
  * signed in — so the sign-in form is painted the same as the plan behind it,
  * and a remembered dark page does not go white the moment somebody signs out.
  *
+ * **Reads its store off {@link useApplicationServicesState}, this file's one
+ * hook boundary** — rule K2's rule for React: a component or a hook takes the
+ * runtime's `remembered`, never a module-load duplicate
+ * (`modules/preferences/composition.ts`). Memoised by the context's own
+ * `remembered` reference — stable while the runtime is `live`, and a *new*
+ * reference once a later runtime replaces this one while the provider stays
+ * mounted (`installApplicationRuntime` builds a fresh graph per installation;
+ * `application-services-context.tsx`'s own memoisation only preserves
+ * identity while the *same* facade stays published) — so the store passed to
+ * {@link rememberedTheme} and {@link rememberTheme} below is rebuilt only
+ * when the runtime actually changes, not on every render; `themeChoice` itself
+ * builds a fresh, stateless closure per call (`preferences.feature.ts`).
+ *
+ * **Three transitions this hook follows explicitly, each with its own named
+ * test in `theme.test.tsx`, not merely asserted in prose:**
+ *
+ * 1. **Withdrawal, while mounted.** The resync effect below reruns whenever
+ *    the memoised store changes; going from a store to `null` resets `choice`
+ *    to `'system'` and `persists` to `false` — matching {@link readTheme}'s
+ *    own "never said" default exactly, rather than leaving whatever palette
+ *    was last painted.
+ * 2. **Reactivation, while mounted.** The same effect going from `null` (or
+ *    an old store) to a new one re-reads that store's own persisted answer —
+ *    a mounted hook that first saw `withdrawn` and later receives a `live`
+ *    runtime adopts that runtime's saved choice, rather than staying on
+ *    `'system'` forever. The effect's own read can itself observe the store
+ *    go withdrawn again before it completes (a retirement from a child's
+ *    layout effect, which runs before this passive effect) — caught the same
+ *    way transition 3 catches a racing write, and recovered to the withdrawn
+ *    state rather than left to throw into the nearest fault boundary.
+ * 3. **A write racing withdrawal.** `chooseTheme`'s own closure can still
+ *    hold a store that was live when this hook last rendered but has gone
+ *    withdrawn since — `lifetime-slot.ts`'s own JSDoc: `retire()`/`replace()`
+ *    withdraw publication **synchronously**, while the subscriber
+ *    notification that would rebuild this closured store is deferred to a
+ *    microtask. `rememberTheme`'s only failure mode through that closured,
+ *    now-stale store is `preferences.resource.ts`'s own `ensureLive` refusal
+ *    — `chooseTheme` catches exactly that {@link PreferenceStoreLifecycleError}
+ *    and degrades to a local-only choice with `persists: false`, rather than
+ *    letting it escape as an uncaught error from a click handler. Every other
+ *    failure `rememberTheme` could raise (a real storage error, never a
+ *    lifecycle refusal) is rethrown unchanged, never swallowed — R5's rule
+ *    that a catch is for modeled recovery, not a blanket net.
+ *
+ * **A fourth case that is not a transition of `themeStore` itself: a
+ * superseded chooser.** `chooseTheme` closes over the store it was built
+ * for. A caller that retains an old render's `chooseTheme` past a
+ * replacement (not a retirement — `themeStore` here goes from one live
+ * store straight to another, never through `null`) would otherwise still be
+ * able to write into a runtime this hook no longer reads, and to move
+ * `choice`/`persists` for a hook that has moved on to displaying a different
+ * runtime's own state. `themeStoreRef` below always holds the store the most
+ * recent render built; a `chooseTheme` whose own closed-over store is no
+ * longer that one is a documented no-op — it returns without reading,
+ * writing or touching state at all. See `theme.test.tsx`'s own
+ * "does not let a superseded chooser change a replacement runtime's own
+ * state" for the proof.
+ *
+ * **What stays untested, deliberately narrowed rather than asserted:** this
+ * file only proves the transitions above through their own named examples,
+ * plus one generated property over interleavings of `chooseTheme`/`retire`/
+ * `replace`/settle (`theme.test.tsx`'s own `fast-check` scheduler property) —
+ * not the unbounded interleaving space `lifetime-slot.ts`'s own state machine
+ * itself proves. `useTheme` owns no lock, no queue and no disposer of its
+ * own; it is a reader of a store that already proves its own
+ * generation-fenced ordering.
+ *
  * `useState(readTheme)` — the lazy initialiser, not `useState(readTheme())` —
  * for `rememberedGanttHeight`'s reason: the second reads storage on every
  * render of every parent, and the first reads it once, before the first paint
@@ -167,25 +265,98 @@ export interface Theme {
  * {@link readTheme} and not {@link rememberedTheme}, because the initialiser is
  * a render: dropping an unreadable key is a write, StrictMode calls this twice
  * on purpose, and the rule against a side effect in a function React may call
- * twice is the one `chooseTheme` states at the bottom of this file. The drop
- * happens in the mount effect below instead. Nothing on screen moved either
- * way — see {@link readTheme}.
+ * twice is the one `chooseTheme` states below. The drop happens in the resync
+ * effect instead. Nothing on screen moved either way — see {@link readTheme}.
  */
 export function useTheme(): Theme {
-  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
+  const services = useApplicationServicesState();
+  const remembered = services.status === 'live' ? services.remembered : null;
+  const themeStore = useMemo<Remembered<ThemeChoice> | null>(
+    () => (remembered ? remembered.themeChoice(isThemeChoice) : null),
+    [remembered],
+  );
+
+  /**
+   * The store the most recent render built, read by {@link chooseTheme}
+   * below to tell a superseded closure apart from the current one — see this
+   * function's own JSDoc, "A fourth case that is not a transition".
+   *
+   * Assigned directly in the render body rather than from an effect: an
+   * effect would still leave one commit where a stale closure could read a
+   * stale ref, and the write here is idempotent (the same value every time a
+   * render is not yet a real change) — the ordinary "latest ref" shape.
+   */
+  const themeStoreRef = useRef<Remembered<ThemeChoice> | null>(themeStore);
+  themeStoreRef.current = themeStore;
+
+  const [choice, setChoice] = useState<ThemeChoice>(() =>
+    // Proof: on 2026-09-23, replacing this ternary with an unconditional
+    // `readTheme(themeStore as Remembered<ThemeChoice>)` failed 'degrades to
+    // system, reads and writes nothing, and never throws when never live'
+    // with `TypeError: Cannot read properties of null (reading 'read')` at
+    // `readTheme`, thrown from this initialiser during the hook's own first
+    // render — a slot that has never published leaves `themeStore` `null`
+    // from the very first call, before this hook's own resync effect below
+    // ever runs.
+    themeStore ? readTheme(themeStore) : 'system',
+  );
+  const [persists, setPersists] = useState<boolean>(() => themeStore !== null);
   const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => systemMedia().matches);

   /**
-   * Drops a stored answer this module cannot read, once, after the first paint.
+   * Resyncs `choice`/`persists` to the store this render holds — on mount,
+   * on withdrawal (transition 1 above) and on reactivation (transition 2).
+   *
+   * {@link rememberedTheme} rather than {@link readTheme} on the live branch:
+   * the write half of the drop, exactly as it was before this hook read the
+   * runtime's own store. Its return value — the same answer a plain read
+   * would give, once the drop has run — reseeds `choice` directly, which is
+   * what makes reactivation adopt a newer store's own saved answer rather
+   * than whatever this hook's `choice` last held.
    *
-   * The write half of {@link rememberedTheme}, moved out of the initialiser
-   * above. Its return value is the same answer `readTheme` already gave — the
-   * state is not re-seeded from it, because between the two calls nothing but
-   * this line can have written the key.
+   * The `themeStore` this effect closes over can itself go withdrawn between
+   * this render and this effect actually running — a passive effect runs
+   * after every layout effect has committed, and a sibling's layout effect
+   * can retire the slot in between (`theme.test.tsx`'s own "recovers, instead
+   * of throwing, when the store is retired between this hook's render and
+   * its resync effect"). `rememberedTheme` then throws
+   * `preferences.resource.ts`'s own withdrawn refusal; caught here as the
+   * same recoverable transition transition 1 already models, never left to
+   * reach `AppFaultBoundary` — a withdrawn tick is a normal lifecycle event,
+   * not a fault.
    */
   useEffect(() => {
-    rememberedTheme();
-  }, []);
+    if (!themeStore) {
+      // Proof: on 2026-09-23, keeping this guard's condition but deleting
+      // both state calls below it (`return;` left alone — the type-correct
+      // alternative to deleting the guard itself, which would leave the rest
+      // of this effect reading `themeStore` as possibly `null` and fail
+      // `wbs-fe-01:typecheck` with TS2345 rather than fail a test) failed
+      // 'resets to system and stops persisting once the runtime is
+      // withdrawn, without waiting for disposal' on `expected 'dark' to be
+      // 'system'` — the palette stayed on the withdrawn runtime's last
+      // choice instead of the documented default.
+      setChoice('system');
+      setPersists(false);
+      return;
+    }
+    try {
+      // Proof: on 2026-09-23, keeping the call (for its drop side effect) but
+      // deleting the two state calls that apply its result
+      // (`rememberedTheme(themeStore);` with `setChoice`/`setPersists(true)`
+      // removed) failed 'adopts a later live store's own saved choice once
+      // one is published' on `expected 'system' to be 'dark'` — a hook
+      // mounted below a slot that had never published, then given a live
+      // runtime, stayed on the initial default forever instead of reading
+      // the newly published store.
+      setChoice(rememberedTheme(themeStore));
+      setPersists(true);
+    } catch (refusal) {
+      if (!isPreferenceStoreLifecycleError(refusal)) throw refusal;
+      setChoice('system');
+      setPersists(false);
+    }
+  }, [themeStore]);

   /**
    * Follows the machine while the page is open.
@@ -217,15 +388,61 @@ export function useTheme(): Theme {
     paintPalette(palette);
   }, [palette]);

-  const chooseTheme = useCallback((next: ThemeChoice): void => {
-    // Written here, beside the setter and outside it: a state updater React may
-    // call twice is no place for a side effect. `gantt-panel.tsx`'s arrows
-    // switch makes the same bargain for the same reason.
-    rememberTheme(next);
-    setChoice(next);
-  }, []);
+  const chooseTheme = useCallback(
+    (next: ThemeChoice): void => {
+      // Superseded: this closure's own store is not the one the most recent
+      // render read. A replacement runtime made this callback stale — see
+      // this function's own JSDoc, "A fourth case that is not a transition".
+      // No-op, and deliberately before any store access or state write: a
+      // stale chooser must not move a replacement runtime's own displayed
+      // state at all.
+      // Proof: on 2026-09-23, replacing this comparison with `if (false)
+      // return;` (type-correct — neither side of `false` narrows anything)
+      // failed 'does not let a superseded chooser change a replacement
+      // runtime's own state' on `expected 'light' to be 'dark'`: the first
+      // runtime's own retained chooser moved the mounted hook's displayed
+      // choice although the second runtime was still live.
+      if (themeStore !== themeStoreRef.current) return;
+      if (!themeStore) {
+        // Proof: on 2026-09-23, keeping this guard's condition but deleting
+        // `setChoice(next)` (leaving only `setPersists(false); return;`)
+        // failed 'lets a reader still operate the control while never live,
+        // through the same null guard' on `expected 'system' to be 'light'`.
+        setChoice(next);
+        setPersists(false);
+        return;
+      }
+      try {
+        // Written before `setChoice` below, on purpose: an unexpected failure
+        // (never a lifecycle refusal — those are caught just below and
+        // degrade in-tree) must propagate without this hook ever having shown
+        // the choice it could not keep. A lifecycle refusal is the one
+        // failure this hook is allowed to hide, and only it — the displayed
+        // choice still moves for that case, in the `catch` below.
+        rememberTheme(themeStore, next);
+      } catch (refusal) {
+        // Proof: on 2026-09-23, removing this `try`/`catch` (calling
+        // `rememberTheme` bare) failed 'does not throw when the closured
+        // store goes withdrawn between renders, and settles on the withdrawn
+        // state': the `act(() => chooseTheme('dark'))` call itself threw
+        // `PreferenceStoreLifecycleError: the page withdrew this preference
+        // store before the access completed` — `preferences.resource.ts`'s
+        // own withdrawn refusal, reachable because this closure's
+        // `themeStore` was captured live, one render before the slot's own
+        // synchronous withdrawal (see this function's own third transition,
+        // above).
+        if (!isPreferenceStoreLifecycleError(refusal)) throw refusal;
+        setChoice(next);
+        setPersists(false);
+        return;
+      }
+      setChoice(next);
+      setPersists(true);
+    },
+    [themeStore],
+  );

-  return { choice, palette, chooseTheme };
+  return { choice, palette, chooseTheme, persists };
 }

 /**
@@ -244,6 +461,8 @@ export function useTheme(): Theme {
 export interface ThemeContextValue {
   choice: ThemeChoice;
   chooseTheme: (choice: ThemeChoice) => void;
+  /** See {@link Theme.persists}. Not yet read by any consumer below this provider. */
+  persists: boolean;
 }

 const ThemeContext = createContext<ThemeContextValue | null>(null);
@@ -254,8 +473,11 @@ const ThemeContext = createContext<ThemeContextValue | null>(null);
  * the answer is shared with whatever reads it through {@link useThemeChoice}.
  */
 export function ThemeProvider({ children }: { children: ReactNode }): ReactElement {
-  const { choice, chooseTheme } = useTheme();
-  const value = useMemo<ThemeContextValue>(() => ({ choice, chooseTheme }), [choice, chooseTheme]);
+  const { choice, chooseTheme, persists } = useTheme();
+  const value = useMemo<ThemeContextValue>(
+    () => ({ choice, chooseTheme, persists }),
+    [choice, chooseTheme, persists],
+  );
   return createElement(ThemeContext.Provider, { value }, children);
 }

```

### 7.2 `apps/wbs/fe-01/src/lib/theme.test.ts` → `theme.test.tsx`, as a diff after `mv`

Dispatch: filesystem `mv apps/wbs/fe-01/src/lib/theme.test.ts
apps/wbs/fe-01/src/lib/theme.test.tsx` first (never `git mv` — the executor's `.git` is
read-only, preamble rule 1; the wrapper this file adds needs JSX, which a `.ts` file
cannot parse), then apply this diff against the renamed file. This diff is
`git diff --no-index`'s own output between the base file's content (copied to the new
path) and this revision's own final content, with both sides of the header rewritten to
the same real repository path — every line is real, none abbreviated or represented by
a prose placeholder.

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.test.tsx b/apps/wbs/fe-01/src/lib/theme.test.tsx
index 9ee795ed..45731cb1 100644
--- a/apps/wbs/fe-01/src/lib/theme.test.tsx
+++ b/apps/wbs/fe-01/src/lib/theme.test.tsx
@@ -1,16 +1,29 @@
-import { act, cleanup, renderHook } from '@testing-library/react';
+import { act, cleanup, render, renderHook } from '@testing-library/react';
+import fc from 'fast-check';
+import { type ReactNode, useLayoutEffect } from 'react';
 import { afterEach, beforeEach, describe, expect, it } from 'vitest';

 import type { DriveableMediaQueryList } from '../../vitest.setup';
+import type { Remembered } from '../modules/preferences/contract';
+import { fakeBrowserStorage } from '../modules/preferences/fake-browser-storage';
+import {
+  type ApplicationServices,
+  installApplicationRuntime,
+} from '../runtime/application-runtime';
+import { ApplicationServicesProvider } from '../runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '../runtime/lifetime-slot';
 import {
   DARK_CLASS,
   DARK_QUERY,
+  isThemeChoice,
   paintPalette,
   paletteFor,
   readTheme,
   rememberedTheme,
   systemMedia,
+  type Theme,
   THEME_KEY,
+  type ThemeChoice,
   useTheme,
 } from './theme';

@@ -26,14 +39,94 @@ const itDom = hasDom ? it : it.skip;
 const platform = (): DriveableMediaQueryList =>
   window.matchMedia(DARK_QUERY) as DriveableMediaQueryList;

+/**
+ * Every {@link LifetimeSlot} this file has built, retired by this file's own
+ * `afterEach` — not by each test body — so a slot a failed assertion left
+ * live is still given back. `retire()` on an already-empty slot is a
+ * documented no-op (`lifetime-slot.ts`'s own `accept`/`transition`), so
+ * calling it again for a slot a test already retired costs nothing.
+ */
+const builtSlots: LifetimeSlot<ApplicationServices>[] = [];
+
+/** A fresh, tracked slot, `empty` until a test `replace`s it. */
+function freshSlot(): LifetimeSlot<ApplicationServices> {
+  const slot = createLifetimeSlot<ApplicationServices>(50);
+  builtSlots.push(slot);
+  return slot;
+}
+
+/**
+ * A slot `live` over the production installer, its own liveness predicate
+ * wired exactly as `acquireApplicationRuntime` wires the real one
+ * (`application-runtime.ts`'s own `() => applicationSlot.snapshot().status ===
+ * 'live'`) — not `installApplicationRuntime()` bare, whose default `isLive`
+ * is always `true` and so could never reproduce a withdrawn write. `store`
+ * defaults to a fresh in-memory fake, not real `localStorage`, so a test can
+ * tell the runtime's own store apart from `composition.ts`'s module-load
+ * singleton, which always wraps the real one.
+ *
+ * Awaits the real `replace` promise — not a microtask substitute — so the
+ * slot is genuinely `live` by the time this returns.
+ */
+async function liveSlot(
+  store: ReturnType<typeof fakeBrowserStorage> = fakeBrowserStorage(),
+): Promise<{
+  slot: LifetimeSlot<ApplicationServices>;
+  store: ReturnType<typeof fakeBrowserStorage>;
+}> {
+  const slot = freshSlot();
+  await slot.replace(() =>
+    installApplicationRuntime({
+      openStore: () => store,
+      isLive: () => slot.snapshot().status === 'live',
+    }),
+  );
+  return { slot, store };
+}
+
+function wrapperFor(slot: LifetimeSlot<ApplicationServices>) {
+  function Wrapper({ children }: { children: ReactNode }) {
+    return <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>;
+  }
+  return Wrapper;
+}
+
+/**
+ * A runtime's own theme store, over a fresh, real installation — the "runtime
+ * path" the bare-function tests below now go through instead of importing
+ * `composition.ts`'s module-load duplicate. Closed after `run`, matching
+ * `composition-agreement.test.ts`'s own pattern: a direct
+ * {@link installApplicationRuntime} call is retained and given back, never
+ * discarded.
+ */
+async function withThemeStore<T>(run: (themeStore: Remembered<ThemeChoice>) => T): Promise<T> {
+  const installed = installApplicationRuntime();
+  try {
+    return run(installed.services.remembered.themeChoice(isThemeChoice));
+  } finally {
+    await installed.close({ timeoutMs: 50 });
+  }
+}
+
 beforeEach(() => {
   localStorage.removeItem(THEME_KEY);
   document.documentElement.classList.remove(DARK_CLASS);
   platform().setMatches(false);
 });

-afterEach(() => {
+/**
+ * React `cleanup()` always runs first — before any slot this file built is
+ * retired — including after a failed assertion: `afterEach` runs whatever
+ * the test body did or did not reach. Lifecycle-under-test retirement (a
+ * test that calls `slot.retire()` itself, to observe a transition) stays
+ * distinct from this fixture teardown: calling `retire()` again here for a
+ * slot a test already retired is the documented no-op, not a second
+ * transition.
+ */
+afterEach(async () => {
   cleanup();
+  const slots = builtSlots.splice(0);
+  await Promise.all(slots.map((slot) => slot.retire()));
 });

 /**
@@ -58,31 +151,39 @@ describe('what the theme setting resolves to', () => {
 });

 describe('what this browser remembers', () => {
-  itDom('starts on system, having never been told', () => {
-    expect(rememberedTheme()).toBe('system');
+  itDom('starts on system, having never been told', async () => {
+    await withThemeStore((themeStore) => {
+      expect(rememberedTheme(themeStore)).toBe('system');
+    });
   });

-  itDom('reads back an answer it was given', () => {
+  itDom('reads back an answer it was given', async () => {
     localStorage.setItem(THEME_KEY, JSON.stringify('dark'));

-    expect(rememberedTheme()).toBe('dark');
+    await withThemeStore((themeStore) => {
+      expect(rememberedTheme(themeStore)).toBe('dark');
+    });
   });

-  itDom('refuses a stored answer that is not one of the three, and drops the key', () => {
+  itDom('refuses a stored answer that is not one of the three, and drops the key', async () => {
     localStorage.setItem(THEME_KEY, JSON.stringify('midnight'));

-    expect(rememberedTheme()).toBe('system');
+    await withThemeStore((themeStore) => {
+      expect(rememberedTheme(themeStore)).toBe('system');
+    });
     expect(localStorage.getItem(THEME_KEY)).toBeNull();
   });

-  itDom('refuses storage that is not JSON at all, and drops the key', () => {
+  itDom('refuses storage that is not JSON at all, and drops the key', async () => {
     localStorage.setItem(THEME_KEY, '{not json');

-    expect(rememberedTheme()).toBe('system');
+    await withThemeStore((themeStore) => {
+      expect(rememberedTheme(themeStore)).toBe('system');
+    });
     expect(localStorage.getItem(THEME_KEY)).toBeNull();
   });

-  itDom('reads the same answer without writing anything, for a render to call', () => {
+  itDom('reads the same answer without writing anything, for a render to call', async () => {
     // The half `useTheme`'s lazy initialiser is allowed to do. Both refusals
     // above are the same read plus a write, and a `useState` initialiser is a
     // render — StrictMode calls it twice on purpose to surface exactly that.
@@ -92,7 +193,9 @@ describe('what this browser remembers', () => {
     // Watched on h2puni under vitest, 2026-08-12.
     localStorage.setItem(THEME_KEY, JSON.stringify('midnight'));

-    expect(readTheme()).toBe('system');
+    await withThemeStore((themeStore) => {
+      expect(readTheme(themeStore)).toBe('system');
+    });
     expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('midnight'));
   });
 });
@@ -120,50 +223,61 @@ describe('what the theme puts on the document', () => {
 });

 describe('the theme, followed and remembered while the app is open', () => {
-  itDom('opens on the answer this browser last gave, without a paint in between', () => {
-    localStorage.setItem(THEME_KEY, JSON.stringify('dark'));
+  itDom('opens on the answer this browser last gave, without a paint in between', async () => {
+    const { slot } = await liveSlot(fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }));

-    const held = renderHook(() => useTheme());
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

     expect(held.result.current.choice).toBe('dark');
     expect(held.result.current.palette).toBe('dark');
+    expect(held.result.current.persists).toBe(true);
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
   });

-  itDom('drops an answer it cannot read, from an effect rather than from a render', () => {
-    localStorage.setItem(THEME_KEY, JSON.stringify('midnight'));
+  itDom('drops an answer it cannot read, from an effect rather than from a render', async () => {
+    const { slot, store } = await liveSlot(
+      fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('midnight') }),
+    );

-    const held = renderHook(() => useTheme());
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

     // The behaviour is unchanged by the move — a corrupt key is gone by the
     // time the hook has mounted, which is all a reader could ever have seen.
+    // Migrated from a real-`localStorage` assertion to the injected fake's
+    // own `held()`, so the drop is proved against the store this hook
+    // actually reads and writes, not the module-load singleton it no longer
+    // does.
     expect(held.result.current.choice).toBe('system');
-    expect(localStorage.getItem(THEME_KEY)).toBeNull();
+    expect(store.held()[THEME_KEY]).toBeUndefined();
   });

-  itDom('opens on the machine’s own answer where nothing was ever chosen', () => {
+  itDom('opens on the machine’s own answer where nothing was ever chosen', async () => {
     platform().setMatches(true);
+    const { slot } = await liveSlot();

-    const held = renderHook(() => useTheme());
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

     expect(held.result.current.choice).toBe('system');
     expect(held.result.current.palette).toBe('dark');
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
   });

-  itDom('writes the answer down as it is chosen, and paints it', () => {
-    const held = renderHook(() => useTheme());
+  itDom('writes the answer down as it is chosen, and paints it', async () => {
+    const { slot, store } = await liveSlot();
+
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

     act(() => {
       held.result.current.chooseTheme('dark');
     });

-    expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('dark'));
+    expect(store.held()[THEME_KEY]).toBe(JSON.stringify('dark'));
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
   });

-  itDom('follows the machine changing under it while the choice is system', () => {
-    const held = renderHook(() => useTheme());
+  itDom('follows the machine changing under it while the choice is system', async () => {
+    const { slot } = await liveSlot();
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);

     act(() => {
@@ -174,8 +288,9 @@ describe('the theme, followed and remembered while the app is open', () => {
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
   });

-  itDom('leaves a chosen palette where it is when the machine changes under it', () => {
-    const held = renderHook(() => useTheme());
+  itDom('leaves a chosen palette where it is when the machine changes under it', async () => {
+    const { slot } = await liveSlot();
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
     act(() => {
       held.result.current.chooseTheme('light');
     });
@@ -188,9 +303,10 @@ describe('the theme, followed and remembered while the app is open', () => {
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
   });

-  itDom('goes back to the machine’s answer when system is chosen again', () => {
+  itDom('goes back to the machine’s answer when system is chosen again', async () => {
     platform().setMatches(true);
-    const held = renderHook(() => useTheme());
+    const { slot } = await liveSlot();
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
     act(() => {
       held.result.current.chooseTheme('light');
     });
@@ -204,7 +320,7 @@ describe('the theme, followed and remembered while the app is open', () => {
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
   });

-  itDom('stops listening to the machine once it is gone', () => {
+  itDom('stops listening to the machine once it is gone', async () => {
     // **The class cannot answer this and the listener count can.** This test
     // asserted only the third block below, and it could not fail: `paintPalette`
     // runs from a `useEffect`, React runs no effect for an unmounted hook, so
@@ -224,7 +340,8 @@ describe('the theme, followed and remembered while the app is open', () => {
     // asserted is the *difference* one mount and one unmount make.
     const before = platform().listenerCount;

-    const held = renderHook(() => useTheme());
+    const { slot } = await liveSlot();
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
     expect(platform().listenerCount, 'the hook never subscribed at all').toBe(before + 1);

     held.unmount();
@@ -247,3 +364,529 @@ describe('the theme, followed and remembered while the app is open', () => {
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
   });
 });
+
+describe('the theme when the application services are withdrawn or transitioning', () => {
+  /**
+   * Transition 1 (`theme.ts`'s own JSDoc): a mounted hook, live, goes
+   * withdrawn. `choice`/`persists` must reset to the documented default —
+   * not stay on the last-painted palette.
+   *
+   * Proof: on 2026-09-23, keeping the resync effect's withdrawn guard
+   * (`if (!themeStore) { … }`) but deleting only the two state calls inside
+   * it (`return;` left, `setChoice`/`setPersists` removed) failed this case:
+   * `expected 'dark' to be 'system'`. This is the type-correct alternative to
+   * deleting the guard itself, which would leave the code after it reading
+   * `themeStore` as possibly `null` and fail `wbs-fe-01:typecheck` with
+   * TS2345 — reported once and rejected, not attempted here.
+   */
+  itDom(
+    'resets to system and stops persisting once the runtime is withdrawn, without waiting for disposal',
+    async () => {
+      const { slot } = await liveSlot(fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }));
+      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
+      expect(held.result.current.choice).toBe('dark');
+
+      // `retire()` withdraws publication synchronously — `isLive()` already
+      // answers `false` here, before disposal has run and before React's own
+      // deferred notification re-renders this hook.
+      const retiring = slot.retire();
+      await act(async () => {
+        await retiring;
+      });
+
+      expect(held.result.current.choice).toBe('system');
+      expect(held.result.current.persists).toBe(false);
+    },
+  );
+
+  /**
+   * Transition 2: a mounted hook that first sees `withdrawn` (the slot has
+   * never published) later receives a `live` runtime, and adopts that
+   * runtime's own saved choice rather than staying on `'system'` forever.
+   *
+   * Proof: on 2026-09-23, keeping the resync effect's live guard
+   * (`if (themeStore) { … }`) but replacing its body's two state calls with a
+   * bare `rememberedTheme(themeStore);` (the read-and-drop still runs, for
+   * its side effect; nothing is applied to state) failed this case:
+   * `expected 'system' to be 'dark'`. The unconditional `if (false)`
+   * alternative was tried first and rejected: it removes the narrowing
+   * `if (themeStore)` supplies, so the unchanged `rememberedTheme(themeStore)`
+   * call after it reads `themeStore` as possibly `null` and fails
+   * `wbs-fe-01:typecheck` with TS2345 — not a behavioural fault at all, and
+   * not used here.
+   */
+  itDom('adopts a later live store’s own saved choice once one is published', async () => {
+    const empty = freshSlot();
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(empty) });
+    expect(held.result.current.choice).toBe('system');
+    expect(held.result.current.persists).toBe(false);
+
+    const publishing = empty.replace(() =>
+      installApplicationRuntime({
+        openStore: () => fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }),
+        isLive: () => empty.snapshot().status === 'live',
+      }),
+    );
+    await act(async () => {
+      await publishing;
+    });
+
+    expect(held.result.current.choice).toBe('dark');
+    expect(held.result.current.persists).toBe(true);
+  });
+
+  /**
+   * Transition 2b: the resync effect's own read can itself observe the
+   * store go withdrawn before it completes — a sibling's `useLayoutEffect`
+   * runs before this hook's passive effect commits, and can retire the slot
+   * in between. The passive effect must recover to the withdrawn state
+   * rather than let `rememberedTheme`'s own refusal reach React uncaught,
+   * which would trip `AppFaultBoundary` for an ordinary, recoverable tick.
+   *
+   * Proof: on 2026-09-23, removing the `try`/`catch` around
+   * `rememberedTheme(themeStore)` in the resync effect (rethrowing
+   * unconditionally) failed this case: React reported the passive effect's
+   * own uncaught `Error: the page withdrew this preference store before the
+   * access completed` rather than letting the hook render `system`/
+   * non-persisting.
+   */
+  itDom(
+    'recovers, instead of throwing, when the store is retired between this hook’s render and its resync effect',
+    async () => {
+      const { slot } = await liveSlot(fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }));
+      const captured: { theme: Theme | null } = { theme: null };
+
+      function ObservesTheme(): null {
+        captured.theme = useTheme();
+        return null;
+      }
+
+      function RetiresFromLayoutEffect(): null {
+        // A layout effect commits synchronously, before any passive effect —
+        // including `useTheme`'s own resync effect below, mounted as a
+        // sibling — has run for this same commit.
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
+            <ObservesTheme />
+          </ApplicationServicesProvider>,
+        );
+      } catch (caught) {
+        thrown = caught;
+      }
+
+      expect(thrown).toBeNull();
+      expect(captured.theme?.choice).toBe('system');
+      expect(captured.theme?.persists).toBe(false);
+    },
+  );
+
+  /**
+   * Transition 3: `chooseTheme`'s own closure can still hold a store that
+   * was live when this hook last rendered but has gone withdrawn since —
+   * reachable in the window `retire()`'s synchronous withdrawal opens before
+   * React's deferred notification re-renders this hook and rebuilds
+   * `chooseTheme` over a fresh, `null` store. The call must not throw.
+   *
+   * Proof: on 2026-09-23, removing the `try`/`catch` around `rememberTheme`
+   * in `chooseTheme` (letting the write rethrow) failed this case: the
+   * `act(() => chooseTheme('dark'))` call itself threw
+   * `Error: the page withdrew this preference store before the access
+   * completed`, instead of returning normally.
+   */
+  itDom(
+    'does not throw when the closured store goes withdrawn between renders, and settles on the withdrawn state',
+    async () => {
+      const { slot, store } = await liveSlot();
+      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
+      const { chooseTheme } = held.result.current;
+
+      // Withdrawal is synchronous; the notification that would rebuild
+      // `chooseTheme` over a `null` store is not — this call still closes
+      // over the live store `renderHook` built it with.
+      const retiring = slot.retire();
+
+      expect(() => {
+        act(() => {
+          chooseTheme('dark');
+        });
+      }).not.toThrow();
+
+      await act(async () => {
+        await retiring;
+      });
+
+      expect(held.result.current.choice).toBe('system');
+      expect(held.result.current.persists).toBe(false);
+      // Nothing reached the store this closure's write raced against closing.
+      expect(store.held()[THEME_KEY]).toBeUndefined();
+    },
+  );
+
+  /**
+   * Important 1 (review 2): a chooser closes over the store it was built
+   * for. A caller that retains an old render's `chooseTheme` past a
+   * replacement* (live store to a different live store, never through
+   * `null`) must not be able to move a replacement runtime's own displayed
+   * state — `theme.ts`'s own JSDoc, "A fourth case that is not a
+   * transition".
+   *
+   * Proof: on 2026-09-23, replacing the superseded-chooser guard
+   * (`if (themeStore !== themeStoreRef.current) return;`) with
+   * `if (false) return;` (a type-correct no-op: neither branch narrows
+   * anything, so this compiles cleanly) failed this case: the first
+   * runtime's retained chooser moved the mounted hook's own displayed choice
+   * to `'dark'` and its `persists` to `false`, although the second runtime
+   * was still live and its own storage was untouched.
+   */
+  itDom('does not let a superseded chooser change a replacement runtime’s own state', async () => {
+    const first = fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('light') });
+    const second = fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('light') });
+    const { slot } = await liveSlot(first);
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
+    const staleChooseTheme = held.result.current.chooseTheme;
+    expect(held.result.current.choice).toBe('light');
+
+    const replacing = slot.replace(() =>
+      installApplicationRuntime({
+        openStore: () => second,
+        isLive: () => slot.snapshot().status === 'live',
+      }),
+    );
+    await act(async () => {
+      await replacing;
+    });
+    expect(held.result.current.choice).toBe('light');
+    expect(held.result.current.persists).toBe(true);
+
+    act(() => {
+      staleChooseTheme('dark');
+    });
+
+    expect(held.result.current.choice).toBe('light');
+    expect(held.result.current.persists).toBe(true);
+    expect(first.held()[THEME_KEY]).toBe(JSON.stringify('light'));
+    expect(second.held()[THEME_KEY]).toBe(JSON.stringify('light'));
+  });
+
+  /**
+   * Not a lifecycle transition, but the invariant the whole move is for: a
+   * live write lands in the runtime's own injected store, never in
+   * `composition.ts`'s module-load singleton, which always wraps real
+   * `localStorage` regardless of what a test injects here.
+   */
+  itDom(
+    'reads and writes the runtime’s own injected store, never the staged composition.ts singleton',
+    async () => {
+      const { slot, store } = await liveSlot();
+      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
+
+      act(() => {
+        held.result.current.chooseTheme('dark');
+      });
+
+      expect(store.held()[THEME_KEY]).toBe(JSON.stringify('dark'));
+      // `composition.ts`'s own `rememberedPreferences` wraps real `localStorage`
+      // unconditionally; if this hook still reached it, this key would be set.
+      expect(localStorage.getItem(THEME_KEY)).toBeNull();
+    },
+  );
+
+  /**
+   * The invariant every consumer of these services keeps: mounting below a
+   * slot that has never published anything renders `withdrawn` correctly —
+   * `'system'`, not persisting — and never throws. `chooseTheme` still moves
+   * the in-tree choice, because a reader can still operate the control while
+   * withdrawn; it is just never remembered.
+   *
+   * Not claimed here: that zero reads reach any store. `themeStore` is
+   * `null` throughout this test (the slot never publishes), so no
+   * `Remembered` member is ever called — provable from `useTheme`'s own
+   * control flow, not from an instrumented count — and this test asserts
+   * only what is independently checkable: real `localStorage` stays
+   * untouched.
+   */
+  itDom('degrades to system and never throws when never live', () => {
+    const empty = freshSlot();
+
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(empty) });
+
+    expect(held.result.current.choice).toBe('system');
+    expect(held.result.current.palette).toBe('light');
+    expect(held.result.current.persists).toBe(false);
+
+    act(() => {
+      held.result.current.chooseTheme('dark');
+    });
+
+    expect(held.result.current.choice).toBe('dark');
+    expect(held.result.current.persists).toBe(false);
+    expect(localStorage.getItem(THEME_KEY)).toBeNull();
+  });
+
+  /**
+   * Important 3 (review 2): the chooser's own null guard (no live store at
+   * all, ever) needs a mutation independent from every other guard above.
+   *
+   * Proof: on 2026-09-23, keeping the guard's condition (`if (!themeStore)`)
+   * but deleting its `setChoice(next)` call (leaving only `setPersists(false);
+   * return;`) failed the "degrades to system" example just above: `choice`
+   * stayed `'system'` instead of moving to `'dark'`.
+   */
+  itDom(
+    'lets a reader still operate the control while never live, through the same null guard',
+    () => {
+      const empty = freshSlot();
+      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(empty) });
+
+      act(() => {
+        held.result.current.chooseTheme('light');
+      });
+
+      expect(held.result.current.choice).toBe('light');
+      expect(held.result.current.persists).toBe(false);
+    },
+  );
+
+  /**
+   * Addendum 15: generated coverage over interleavings of `chooseTheme`,
+   * `retire`, `replace` and settling a transition, against a small reference
+   * model (expected displayed choice, expected persists, expected storage)
+   * — beyond the named transitions above, not instead of them.
+   *
+   * Narrower than `lifetime-slot.model.test.ts`'s own scheduler property, and
+   * deliberately so: `useTheme` owns no queue, no lock and no disposer of its
+   * own (this file's own module JSDoc) — every transition it can observe is
+   * already fenced by the slot it reads, which that other file's property
+   * already proves once. This property does not re-explore `lifetime-slot.ts`'s
+   * own fencing (two transitions issued before either settles, which of them
+   * publishes, is that other file's own claim); it holds at most one
+   * transition in flight at a time, always settled before the next command,
+   * so the model only has to track what `useTheme` itself does with a
+   * transition's own outcome. `raceRetire`/`raceReplace` fold "issue, then
+   * write once while pending, then settle" into one generated step — the
+   * exact shape of transition 3 above, at an arbitrary point in an arbitrary
+   * sequence, rather than only the one named position.
+   */
+  itDom(
+    'holds displayed choice, persists and storage correct across generated chooseTheme/retire/replace interleavings',
+    async () => {
+      type Command =
+        | { readonly kind: 'choose'; readonly value: ThemeChoice }
+        | { readonly kind: 'retire' }
+        | { readonly kind: 'replace'; readonly target: 'A' | 'B' }
+        | { readonly kind: 'raceRetire'; readonly value: ThemeChoice }
+        | { readonly kind: 'raceReplace'; readonly target: 'A' | 'B'; readonly value: ThemeChoice };
+
+      const themeChoiceArb = fc.constantFrom<ThemeChoice>('system', 'light', 'dark');
+      const targetArb = fc.constantFrom<'A' | 'B'>('A', 'B');
+
+      const commandArb: fc.Arbitrary<Command> = fc.oneof(
+        {
+          arbitrary: themeChoiceArb.map((value): Command => ({ kind: 'choose', value })),
+          weight: 3,
+        },
+        { arbitrary: fc.constant<Command>({ kind: 'retire' }), weight: 1 },
+        { arbitrary: targetArb.map((target): Command => ({ kind: 'replace', target })), weight: 2 },
+        {
+          arbitrary: themeChoiceArb.map((value): Command => ({ kind: 'raceRetire', value })),
+          weight: 1,
+        },
+        {
+          arbitrary: fc
+            .tuple(targetArb, themeChoiceArb)
+            .map(([target, value]): Command => ({ kind: 'raceReplace', target, value })),
+          weight: 2,
+        },
+      );
+
+      await fc.assert(
+        fc.asyncProperty(
+          fc.array(commandArb, { minLength: 3, maxLength: 12 }),
+          async (commands) => {
+            const storesByName: Record<'A' | 'B', ReturnType<typeof fakeBrowserStorage>> = {
+              A: fakeBrowserStorage(),
+              B: fakeBrowserStorage(),
+            };
+            const slot = createLifetimeSlot<ApplicationServices>(50);
+            const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
+
+            /**
+             * The model, held in one mutable object rather than several `let`
+             * locals: TypeScript's flow analysis over a captured plain `let`
+             * does not track reassignment through the helper closures below
+             * consistently (it either forgets a possible reassignment, or
+             * over-narrows to one arm after several), so `liveStoreId` on a
+             * bare `let` reported both directions of false positive from
+             * `@typescript-eslint/no-unnecessary-condition` while rehearsing
+             * this test. A property read is not narrowed the same way.
+             */
+            const model: {
+              liveStoreId: 'none' | 'A' | 'B';
+              expectedChoice: ThemeChoice;
+              expectedPersists: boolean;
+            } = { liveStoreId: 'none', expectedChoice: 'system', expectedPersists: false };
+
+            const assertRendered = (): void => {
+              expect(held.result.current.choice).toBe(model.expectedChoice);
+              expect(held.result.current.persists).toBe(model.expectedPersists);
+            };
+
+            /** The bytes a store holds for {@link THEME_KEY}, `undefined` when absent. */
+            const heldTheme = (name: 'A' | 'B'): string | undefined => {
+              const bytes = storesByName[name].held();
+              return Object.hasOwn(bytes, THEME_KEY) ? bytes[THEME_KEY] : undefined;
+            };
+
+            /** `chooseTheme`, plus this test's own model of what it should have done. */
+            const choose = (value: ThemeChoice): void => {
+              act(() => {
+                held.result.current.chooseTheme(value);
+              });
+              model.expectedChoice = value;
+              if (model.liveStoreId === 'none') {
+                // Never live, or a transition is pending (see the race helper
+                // below): no store to write into, or a closured, now-stale one.
+                model.expectedPersists = false;
+              } else {
+                storesByName[model.liveStoreId].write(THEME_KEY, JSON.stringify(value));
+                model.expectedPersists = true;
+              }
+              assertRendered();
+            };
+
+            /**
+             * `chooseTheme`, called while a transition is already in flight
+             * (`model.liveStoreId` was just set to `'none'` by `issueRetire`/
+             * `issueReplace`, below, reflecting the slot's own **synchronous**
+             * withdrawal). Unlike a steady-state `choose()` against an
+             * already-and-still-null store, this optimistic `setChoice` does
+             * not survive: the very state update it causes forces a re-render,
+             * which calls `useApplicationServicesState()` again and discovers
+             * the slot has *already* moved past `live` — so the resync effect
+             * runs in the same `act()` flush and corrects `choice`/`persists`
+             * back to the documented default before this call returns.
+             * Reproduced directly against a two-store race and folded in here
+             * rather than kept as a scratch script.
+             */
+            const raceChoose = (value: ThemeChoice): void => {
+              act(() => {
+                held.result.current.chooseTheme(value);
+              });
+              model.expectedChoice = 'system';
+              model.expectedPersists = false;
+              assertRendered();
+            };
+
+            /**
+             * Settles one already-issued transition and updates the model to
+             * what `useTheme` should show once it has: `'none'` resets to the
+             * documented default, a target reads that store's own persisted
+             * answer. A fresh `installApplicationRuntime()` call, even for a
+             * target letter that was already live, is a new `remembered`
+             * reference, so the resync effect always reruns on a real settle.
+             */
+            const settle = async (
+              issued: Promise<unknown>,
+              target: 'none' | 'A' | 'B',
+            ): Promise<void> => {
+              await act(async () => {
+                await issued.catch(() => undefined);
+              });
+              model.liveStoreId = target;
+              if (target === 'none') {
+                model.expectedChoice = 'system';
+                model.expectedPersists = false;
+              } else {
+                const stored = heldTheme(target);
+                const parsed: unknown = stored !== undefined ? JSON.parse(stored) : undefined;
+                model.expectedChoice = isThemeChoice(parsed) ? parsed : 'system';
+                model.expectedPersists = true;
+              }
+              assertRendered();
+            };
+
+            /**
+             * Issues `retire`/`replace` and immediately reflects the slot's own
+             * **synchronous** withdrawal (`lifetime-slot.ts`'s own `accept()`,
+             * called before either function's first `await`): the store
+             * `choose` would read right after this call is already stale,
+             * whatever the eventual target is — matching production exactly,
+             * where a write racing this same window is what transition 3 above
+             * catches.
+             */
+            const issueRetire = (): Promise<unknown> => {
+              const issued = slot.retire();
+              model.liveStoreId = 'none';
+              return issued;
+            };
+            const issueReplace = (target: 'A' | 'B'): Promise<unknown> => {
+              const issued = slot.replace(() =>
+                installApplicationRuntime({
+                  openStore: () => storesByName[target],
+                  isLive: () => slot.snapshot().status === 'live',
+                }),
+              );
+              model.liveStoreId = 'none';
+              return issued;
+            };
+
+            assertRendered();
+
+            for (const command of commands) {
+              if (command.kind === 'choose') {
+                choose(command.value);
+              } else if (command.kind === 'retire') {
+                if (model.liveStoreId === 'none') {
+                  // Nothing live: `lifetime-slot.ts`'s own `accept()` withdraws
+                  // (and so ever publishes) only when something is currently
+                  // held — retiring an already-empty slot publishes nothing.
+                  continue;
+                }
+                await settle(issueRetire(), 'none');
+              } else if (command.kind === 'replace') {
+                await settle(issueReplace(command.target), command.target);
+              } else if (command.kind === 'raceRetire') {
+                if (model.liveStoreId === 'none') continue;
+                const issued = issueRetire();
+                raceChoose(command.value);
+                await settle(issued, 'none');
+              } else {
+                // Only a genuinely *live* store withdraws synchronously
+                // (`lifetime-slot.ts`'s own `accept()` publishes `retiring`
+                // only when something is currently held): replacing an
+                // already-empty slot changes nothing synchronously, so
+                // `themeStore` stays `null` before and after this call and the
+                // resync effect never reruns to correct it — the write goes
+                // through the plain null-guard path instead, exactly like a
+                // steady-state `choose()`.
+                const wasLive = model.liveStoreId !== 'none';
+                const issued = issueReplace(command.target);
+                if (wasLive) {
+                  raceChoose(command.value);
+                } else {
+                  choose(command.value);
+                }
+                await settle(issued, command.target);
+              }
+            }
+
+            await act(async () => {
+              await slot.retire();
+            });
+            held.unmount();
+          },
+        ),
+        { seed: 20260923, numRuns: 50 },
+      );
+    },
+  );
+});
```

### 7.3 `apps/wbs/fe-01/src/index-bootstrap.test.ts`

```diff
diff --git a/apps/wbs/fe-01/src/index-bootstrap.test.ts b/apps/wbs/fe-01/src/index-bootstrap.test.ts
index ff3d2fb0..ef65d1b5 100644
--- a/apps/wbs/fe-01/src/index-bootstrap.test.ts
+++ b/apps/wbs/fe-01/src/index-bootstrap.test.ts
@@ -5,7 +5,15 @@ import { fileURLToPath } from 'node:url';
 import { beforeEach, describe, expect, it } from 'vitest';

 import type { DriveableMediaQueryList } from '../vitest.setup';
-import { DARK_CLASS, DARK_QUERY, paletteFor, rememberedTheme, THEME_KEY } from './lib/theme';
+import {
+  DARK_CLASS,
+  DARK_QUERY,
+  isThemeChoice,
+  paletteFor,
+  rememberedTheme,
+  THEME_KEY,
+} from './lib/theme';
+import { installApplicationRuntime } from './runtime/application-runtime';

 // fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
 const hasDom = typeof document !== 'undefined';
@@ -109,7 +117,7 @@ describe('the palette applied before the first paint', () => {
     for (const machineIsDark of [false, true]) {
       itDom(
         `agrees with the module: stored ${stored ?? '(nothing)'}, machine ${machineIsDark ? 'dark' : 'light'}`,
-        () => {
+        async () => {
           if (stored !== null) localStorage.setItem(THEME_KEY, stored);
           platform().setMatches(machineIsDark);

@@ -118,8 +126,16 @@ describe('the palette applied before the first paint', () => {
           // `rememberedTheme` reads the same bytes and drops the key when it
           // cannot use them; the bootstrap deliberately writes nothing, so it
           // is read here **after** the run, from what the module would have
-          // made of the same store.
-          expect(painted).toBe(paletteFor(rememberedTheme(), machineIsDark));
+          // made of the same store — the runtime's own, not a module-load
+          // duplicate: see `theme.ts`'s own JSDoc. Retained and closed,
+          // matching `composition-agreement.test.ts`'s own pattern.
+          const installed = installApplicationRuntime();
+          try {
+            const themeStore = installed.services.remembered.themeChoice(isThemeChoice);
+            expect(painted).toBe(paletteFor(rememberedTheme(themeStore), machineIsDark));
+          } finally {
+            await installed.close({ timeoutMs: 50 });
+          }
         },
       );
     }
```

### 7.4 `apps/wbs/fe-01/src/app.test.tsx`

```diff
diff --git a/apps/wbs/fe-01/src/app.test.tsx b/apps/wbs/fe-01/src/app.test.tsx
index 0bdfd43c..04751047 100644
--- a/apps/wbs/fe-01/src/app.test.tsx
+++ b/apps/wbs/fe-01/src/app.test.tsx
@@ -2,6 +2,10 @@ import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/re
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import type * as Api from '@/lib/api';
+import { browserStorage } from '@/modules/preferences/browser-storage.repository';
+import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
+import { ApplicationServicesProvider } from '@/runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';

 // fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
 const hasDom = typeof document !== 'undefined';
@@ -16,13 +20,34 @@ vi.mock('@/lib/api', async (importOriginal) => ({

 const { App } = await import('./app');

+/**
+ * A slot `live` over the production installer, its own liveness predicate
+ * wired exactly as `acquireApplicationRuntime` wires the real one
+ * (`application-runtime.ts`'s own `() => applicationSlot.snapshot().status ===
+ * 'live'`), rebuilt fresh every test and retired in `afterEach`, after React
+ * cleanup.
+ *
+ * `<App/>`'s own tree includes `ThemeProvider`, which now reads
+ * `useApplicationServicesState()` (see `theme.ts`) — the describe block
+ * "the theme control through the app" persists a choice across an unmount
+ * and a fresh mount, which needs a real, live store behind it.
+ */
+let servicesSlot: LifetimeSlot<ApplicationServices>;
+
+const renderApp = () =>
+  render(
+    <ApplicationServicesProvider slot={servicesSlot}>
+      <App />
+    </ApplicationServicesProvider>,
+  );
+
 const muteConsoleError = () =>
   // React writes a caught error to `console.error` whatever a boundary does.
   vi.spyOn(console, 'error').mockImplementation(() => undefined);

 let logged: ReturnType<typeof muteConsoleError>;

-beforeEach(() => {
+beforeEach(async () => {
   me.mockResolvedValue({
     kind: 'refusal',
     representation: 'json',
@@ -32,10 +57,19 @@ beforeEach(() => {
   });
   logged = muteConsoleError();
   window.history.replaceState({}, '', '/');
+  servicesSlot = createLifetimeSlot<ApplicationServices>(50);
+  await servicesSlot.replace(() =>
+    installApplicationRuntime({
+      openStore: browserStorage,
+      isLive: () => servicesSlot.snapshot().status === 'live',
+    }),
+  );
 });

-afterEach(() => {
+afterEach(async () => {
+  // React cleanup first, so nothing renders against a slot already retiring.
   cleanup();
+  await servicesSlot.retire();
   logged.mockRestore();
   vi.unstubAllGlobals();
   localStorage.clear();
@@ -44,7 +78,7 @@ afterEach(() => {

 describe('the app root', () => {
   itDom('shows the sign-in link when there is no browser session', async () => {
-    render(<App />);
+    renderApp();

     // The boundary is transparent when nothing throws: the app it wraps is
     // what renders, and this is what says so.
@@ -63,7 +97,7 @@ describe('the app root', () => {
       headers: new Headers(),
     });

-    render(<App />);
+    renderApp();

     await waitFor(() => {
       expect(screen.getByRole('heading', { name: 'WBS tool v2' })).toBeDefined();
@@ -75,7 +109,7 @@ describe('the app root', () => {
   itDom('offers sign-in when the session check fails', async () => {
     me.mockRejectedValue(new Error('network down'));

-    render(<App />);
+    renderApp();

     await waitFor(() => {
       expect(screen.getByRole('link', { name: 'Continue with SSO' })).toBeDefined();
@@ -97,7 +131,7 @@ describe('a signed-in address asked for while signed out', () => {
   itDom('draws the sign-in form and no directory', async () => {
     window.history.replaceState({}, '', '/directory');

-    render(<App />);
+    renderApp();

     await waitFor(() => {
       expect(screen.getByRole('link', { name: 'Continue with SSO' })).toBeDefined();
@@ -136,7 +170,7 @@ describe('a signed-in address asked for while signed out', () => {
       }),
     );

-    render(<App />);
+    renderApp();

     // The page that was asked for, not the project — and the address it was
     // asked at, unrewritten.
@@ -186,7 +220,7 @@ describe('the theme control through the app', () => {

   itDom('reports the answer just chosen, and only that one, without a reload', async () => {
     signedIn();
-    render(<App />);
+    renderApp();
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
     });
@@ -205,7 +239,7 @@ describe('the theme control through the app', () => {
   itDom('reports the answer that was chosen, and only that one, after a reload', async () => {
     signedIn();
     for (const answer of ['System', 'Light', 'Dark']) {
-      const first = render(<App />);
+      const first = renderApp();
       await waitFor(() => {
         expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
       });
@@ -214,7 +248,7 @@ describe('the theme control through the app', () => {
       first.unmount();

       // A reload is a fresh mount: the control reads the stored answer, not a default.
-      const second = render(<App />);
+      const second = renderApp();
       await waitFor(() => {
         expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
       });
```

### 7.5 `apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx`

Found only by the whole-target run (section 3.3's fourth bullet, section 6 slice 2's own
red/green steps) — `ThemeHarness` (line 274) calls `useTheme()` directly, outside
`<App/>`.

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx b/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx
index 8b316d76..c2cab625 100644
--- a/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx
@@ -1,7 +1,11 @@
 import { fireEvent, render, screen, within } from '@testing-library/react';
-import { describe, expect, it, vi } from 'vitest';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import { DARK_CLASS, THEME_KEY, useTheme } from '@/lib/theme';
+import { browserStorage } from '@/modules/preferences/browser-storage.repository';
+import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
+import { ApplicationServicesProvider } from '@/runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';

 import { AccountMenu, type AccountMenuProps } from './account-menu';

@@ -288,9 +292,39 @@ function ThemeHarness() {
 describe('the theme control, wired to the hook that owns it', () => {
   const answers = ['System', 'Light', 'Dark'] as const;

-  beforeEach(() => {
+  /**
+   * A slot `live` over the production installer, its liveness predicate
+   * wired exactly as `acquireApplicationRuntime` wires the real one — not
+   * `installApplicationRuntime()` bare, whose default `isLive` is always
+   * `true`. Rebuilt fresh every test and retired in `afterEach`, after React
+   * cleanup: {@link ThemeHarness} calls `useTheme`, which now reads
+   * `useApplicationServicesState()` (see `lib/theme.ts`), and this block's
+   * own "after a reload" case persists a choice across an unmount and a
+   * fresh mount, which needs a real, live store behind it.
+   */
+  let slot: LifetimeSlot<ApplicationServices>;
+
+  const renderHarness = () =>
+    render(
+      <ApplicationServicesProvider slot={slot}>
+        <ThemeHarness />
+      </ApplicationServicesProvider>,
+    );
+
+  beforeEach(async () => {
     localStorage.removeItem(THEME_KEY);
     document.documentElement.classList.remove(DARK_CLASS);
+    slot = createLifetimeSlot<ApplicationServices>(50);
+    await slot.replace(() =>
+      installApplicationRuntime({
+        openStore: browserStorage,
+        isLive: () => slot.snapshot().status === 'live',
+      }),
+    );
+  });
+
+  afterEach(async () => {
+    await slot.retire();
   });

   const open = () => {
@@ -301,7 +335,7 @@ describe('the theme control, wired to the hook that owns it', () => {
     screen.getByRole('menuitemradio', { name }).getAttribute('aria-checked') ?? '';

   itDom('reports the answer just chosen, for every answer, and only that one', () => {
-    render(<ThemeHarness />);
+    renderHarness();
     open();

     for (const answer of answers) {
@@ -316,14 +350,14 @@ describe('the theme control, wired to the hook that owns it', () => {

   itDom('reports the answer that was chosen, and only that one, after a reload', () => {
     for (const answer of answers) {
-      const first = render(<ThemeHarness />);
+      const first = renderHarness();
       open();
       fireEvent.click(screen.getByRole('menuitemradio', { name: answer }));
       first.unmount();

       // A reload is a fresh mount: the menu must read the stored answer, not a
       // default, and report it.
-      const second = render(<ThemeHarness />);
+      const second = renderHarness();
       open();
       for (const offered of answers) {
         expect(checkedOf(offered), `${offered} after ${answer} was chosen and reloaded`).toBe(
```

### 7.6 `apps/wbs/fe-01/src/modules/preferences/contract.ts`

The typed lifecycle error review 2's Critical 1 asked for: `PreferenceStoreLifecycleError`
and `isPreferenceStoreLifecycleError`, added beside the module's other exported types.

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/contract.ts b/apps/wbs/fe-01/src/modules/preferences/contract.ts
index 4f33cfc5..b3b0efb4 100644
--- a/apps/wbs/fe-01/src/modules/preferences/contract.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/contract.ts
@@ -218,3 +218,41 @@ export const PREFERENCES_LABEL = 'frontend.preferences';

 /** The wiki module identifier, which the module index will declare. */
 export const PREFERENCES_MODULE_ID = 'module.frontend.preferences';
+
+/**
+ * A refusal a delivery-layer caller may recover from, told apart from every
+ * other failure a store can raise.
+ *
+ * Two call sites throw it, over the same two messages they always have —
+ * this class changes nothing about *when* a refusal happens or what it says,
+ * only whether a caller can tell it apart from an unmodelled failure without
+ * matching on message text:
+ *
+ * - `preferences.resource.ts`'s `ensureLive`, `kind: 'withdrawn'` — the
+ *   slot is not `live` right now, checked synchronously.
+ * - `browser-storage.repository.ts`'s `revocableStorage`, `kind: 'revoked'`
+ *   — this store's own runtime has already been given back.
+ *
+ * A delivery consumer (`lib/theme.ts`'s `useTheme`) catches only this class —
+ * {@link isPreferenceStoreLifecycleError} — and rethrows everything else: R5's
+ * rule that a catch is for modeled recovery, never a blanket swallow. A
+ * storage failure that is not a lifecycle refusal (a browser with site data
+ * blocked, `contract.ts`'s own {@link BrowserStorage} JSDoc) still propagates
+ * out of a delivery call site exactly as it always has.
+ */
+export class PreferenceStoreLifecycleError extends Error {
+  readonly kind: 'withdrawn' | 'revoked';
+
+  constructor(message: string, kind: 'withdrawn' | 'revoked') {
+    super(message);
+    this.name = 'PreferenceStoreLifecycleError';
+    this.kind = kind;
+  }
+}
+
+/** Whether a caught value is a {@link PreferenceStoreLifecycleError}, for a narrow catch. */
+export function isPreferenceStoreLifecycleError(
+  error: unknown,
+): error is PreferenceStoreLifecycleError {
+  return error instanceof PreferenceStoreLifecycleError;
+}
```

### 7.7 `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`

`ensureLive`'s throw becomes the typed error, over the same `WITHDRAWN` message —
`preferences.resource.test.ts`'s own message-based assertions (`toThrow('the page
withdrew this preference store...')`) keep passing unchanged, because `Error.toThrow`
matches on `message`, not on constructor identity.

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts b/apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts
index 46e1dec1..b31471fd 100644
--- a/apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts
@@ -1,4 +1,11 @@
-import type { BrowserStorage, Claim, IsRuntimeLive, Preferences, Remembered } from './contract';
+import {
+  type BrowserStorage,
+  type Claim,
+  type IsRuntimeLive,
+  type Preferences,
+  PreferenceStoreLifecycleError,
+  type Remembered,
+} from './contract';

 /**
  * What every member of a {@link Remembered} throws once `isLive()` answers
@@ -75,7 +82,7 @@ export function createPreferences(
   const ensureLive = (): void => {
     // Proof: on 2026-09-22, inverting this condition failed 27 of 44 resource,
     // module and runtime tests; consulting `isLive` without throwing failed 16.
-    if (!isLive()) throw new Error(WITHDRAWN);
+    if (!isLive()) throw new PreferenceStoreLifecycleError(WITHDRAWN, 'withdrawn');
   };

   /** The three reads every shape shares, given one way of judging what is there. */
```

### 7.8 `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts`

The same treatment for `revocableStorage`'s revoked guard, over the same `REVOKED`
message.

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts b/apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts
index f8ebbf74..0f0d7ea0 100644
--- a/apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts
@@ -1,4 +1,8 @@
-import type { BrowserStorage, RevocableBrowserStorage } from './contract';
+import {
+  type BrowserStorage,
+  PreferenceStoreLifecycleError,
+  type RevocableBrowserStorage,
+} from './contract';

 /**
  * The adapter over this browser's own store.
@@ -59,7 +63,7 @@ export function revocableStorage(store: BrowserStorage): RevocableBrowserStorage
   const held = (): BrowserStorage => {
     // Proof: on 2026-09-22, handing the store back either way made 'refuses every
     // access once the store has been given back' receive no throw (5 failed, 37 passed).
-    if (revoked) throw new Error(REVOKED);
+    if (revoked) throw new PreferenceStoreLifecycleError(REVOKED, 'revoked');
     return store;
   };
   return {
```

### 7.9 `apps/wbs/fe-01/src/modules/preferences/composition.ts`

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/composition.ts b/apps/wbs/fe-01/src/modules/preferences/composition.ts
index d93ff1ba..139f8eba 100644
--- a/apps/wbs/fe-01/src/modules/preferences/composition.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/composition.ts
@@ -15,6 +15,17 @@ import { createPreferences } from './preferences.resource';
  * runtime's instance has and this one has not is an owner: retiring it revokes
  * its store.
  *
+ * **One of the five call sites has moved off this file already:** `lib/theme.ts`
+ * now reads and writes through `useApplicationServicesState()`, not this
+ * module — see
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md`.
+ * `gantt-detail.ts`, `project-page.tsx` and `project-settings-modal.tsx` still
+ * import {@link rememberedPreferences}; `lib/remembered.ts` still imports
+ * {@link browserPreferences} for `remembered-layout.ts`'s per-project stores.
+ * This file is deleted once all five have moved — that packet's own section 4
+ * has the remaining four sites' design, including `lib/remembered.ts`'s own
+ * harder lazy-binding problem.
+ *
  * Exported because `apps/wbs/fe-01/src/lib/remembered.ts` still offers the
  * generic factory to the layout module, which builds a store per project id and
  * so cannot be a fixed named answer. Nothing that imports React may import this;
```

### 7.10 `openspec/changes/adopt-frontend-lifetimes/tasks.md`

**A fresh executor applies this diff and keeps it applied** — section 6's own closing
note is the only place this document says otherwise, and it is about this packet's own
planner's private rehearsal, not an instruction for whoever executes slice 3 for real.

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index ef9a1533..49b4c1d7 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -17,6 +17,18 @@
 - [ ] 3. The page's application lifetime is opened through the slot at module load and
       delivery reads its preferences out of that one graph, with the module's wiki index
       declaring `module.frontend.preferences` and its files.
+      Partly moved by 050-7-f: `lib/theme.ts` reads through
+      `useApplicationServicesState()`, degrading visibly (never throwing) when
+      withdrawn — see the delivery-degradation requirement this packet adds
+      above. `gantt-detail.ts`, `project-page.tsx`, `project-settings-modal.tsx`
+      and `lib/remembered.ts` still read
+      `modules/preferences/composition.ts`'s staged duplicate, and the
+      module's wiki index is still absent
+      (`apps/wbs/fe-01/src/modules/preferences/README.md`). This box stays
+      unchecked until all five call sites have moved, the duplicate is
+      deleted, and the index exists — see
+      `docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md`
+      section 11 for 050-7-f2's own scope.
 - [x] 4. The application bootstrap owns the React root: it builds the runtime before
       `createRoot`, publishes `RememberedPreferences` — the feature facade only, never
       the `Preferences` resource — through one context, and renders the sanitized fatal
```

### 7.11 `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`

Validated in this rehearsal (section 9): `OPENSPEC_TELEMETRY=0 bunx
@fission-ai/openspec@1.12.0 validate --all --json` reports `{"items": 114, "passed":
114, "failed": 0}` with this diff applied, the same fresh count as without it (section
3.5) — the new requirement's own scenario headings satisfy the schema's normative-sentence
requirement without changing the item count, which is per-requirement/per-spec, not
per-scenario. **Kept applied by a fresh executor, same as section 7.10.**

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 9c22737f..c2feaaa5 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -162,6 +162,42 @@ unaffected by the retirement of a previous one.
 - **THEN** the replacement's own handles read and write normally, and only the retired
   runtime's handles refuse

+### Requirement: A delivery consumer of preferences degrades visibly when withdrawn
+
+A hook or component reading the runtime's preferences through
+`useApplicationServicesState` SHALL render the modelled withdrawn state without
+throwing, SHALL report explicitly when its own displayed choice is not being
+persisted rather than accepting it silently, and, while it stays mounted,
+SHALL adopt a later runtime's own saved answer once one is published.
+
+#### Scenario: A choice made while withdrawn is not silently accepted as persisted
+
+- **WHEN** a reader chooses an answer while the application services are
+  withdrawn, or while the runtime backing an already-read handle is
+  withdrawn between renders
+- **THEN** the in-tree choice still changes and nothing throws, and the
+  consumer's own contract reports that this choice is not being remembered
+
+#### Scenario: Withdrawal while mounted resets to the documented default
+
+- **WHEN** a mounted consumer's runtime is withdrawn
+- **THEN** its choice resets to the same default an unread key already
+  produces, without waiting for disposal to finish
+
+#### Scenario: A later live runtime is adopted
+
+- **WHEN** a mounted consumer first observes withdrawal and a later runtime is
+  then published
+- **THEN** the consumer adopts that runtime's own saved answer, rather than
+  staying on the withdrawn default
+
+#### Scenario: A superseded chooser does not move a replacement runtime's state
+
+- **WHEN** a caller retains a chooser obtained while one runtime was live, and
+  invokes it after a later runtime has replaced that one
+- **THEN** the call does not change the displayed choice, the persistence
+  flag, or either runtime's own storage
+
 ### Requirement: Log out stays a local exit

 The Log out action SHALL send no request to the server and SHALL retire the
```

### 7.12 `openspec/changes/adopt-frontend-lifetimes/verify.md`

**Kept applied by a fresh executor, same as section 7.10 and 7.11** — the diff itself
gives instructions for the executor's own entries, not a fixed historical report; see
section 6's own closing note for why this packet's own planner reverted the real file
in its own private rehearsal.

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/verify.md b/openspec/changes/adopt-frontend-lifetimes/verify.md
index 73df5486..dae73d10 100644
--- a/openspec/changes/adopt-frontend-lifetimes/verify.md
+++ b/openspec/changes/adopt-frontend-lifetimes/verify.md
@@ -871,3 +871,83 @@ observed faults.
   `wbs-fe-01:test:unit`, `wbs-fe-01:test`, the opt-in Chromium case, and the
   host gate remain pending planner verification under the executor sandbox
   contract.
+
+## Packet 050.7f, slice 2 — `lib/theme.ts` moved onto the runtime's preferences
+
+Rehearsed directly by this packet's own planner, in a private worktree, rather than
+dispatched to a separate executor agent (this packet's own section 6 states why); every
+command below was actually run and its output recorded here as observed. A fresh
+executor given only slice 2 records its own equivalent entry in this same shape,
+appended after this one — never overwriting it.
+
+- Step 0, sandbox baseline (`vitest.node.config.ts`, excluding
+  `playwright-config.test.ts` and `src/components/wbs/short-date.test.ts`), before this
+  slice's own edits: 46 files, 674 tests, exit 0.
+- Red 1 (`NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`, on the tree with only the
+  four test files' diffs applied, `theme.ts`/`contract.ts`/`preferences.resource.ts`/
+  `browser-storage.repository.ts` unmodified): exit 1, `Found 21 errors in 2 files` —
+  `TS2724: '"./theme"' has no exported member named 'isThemeChoice'` in both
+  `index-bootstrap.test.ts` and `theme.test.tsx`; `TS2554: Expected 0 arguments, but got
+  1` at every parameterised `rememberedTheme(themeStore)`/`readTheme(themeStore)` call
+  site; `TS2339: Property 'persists' does not exist on type 'Theme'` at every assertion
+  reading it (13 occurrences); one `TS2322: Type 'unknown' is not assignable to type
+  'ThemeChoice'` inside the generated property test's own settle helper. Red 2
+  (`bunx vitest run` on the same tree): exit 1, `Test Files 1 failed | 3 passed (4)`,
+  `Tests 12 failed | 56 passed (68)` — every failure a `.persists` read against
+  `undefined` (esbuild strips types, so the extra argument to the unmodified
+  zero-argument functions is silently ignored).
+- Green (`(cd apps/wbs/fe-01 && bunx vitest run src/lib/theme.test.tsx
+src/index-bootstrap.test.ts src/app.test.tsx src/components/chrome/account-menu.test.tsx)`,
+  after `theme.ts`'s own diff): exit 0, `Test Files 4 passed (4)`, `Tests 68 passed (68)`
+  — 26 in `theme.test.tsx` (17 base + 9 new: withdrawal-while-mounted,
+  reactivation-while-mounted, the resync-effect layout-effect race, the closured-write
+  race, the superseded-chooser guard, the runtime-vs-`composition.ts` distinguishing
+  case, the never-live degrade case, the never-live null-guard case, and the generated
+  `fast-check` property) + 15 in `index-bootstrap.test.ts` + 7 in `app.test.tsx` + 20 in
+  `account-menu.test.tsx`.
+- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0.
+- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0, after one `bunx eslint --fix`
+  round (import order in `theme.test.tsx` and `preferences.resource.ts`) and two manual
+  fixes: a `jsdoc/no-multi-asterisks` line in `theme.ts`'s own new JSDoc, and four
+  `@typescript-eslint/no-unnecessary-condition` findings in the generated property test,
+  fixed by reading the test's own mutable model through an object's properties rather
+  than several bare `let` locals — a captured `let` was narrowed inconsistently by the
+  type checker across the helper closures that reassign it.
+- Post-edit sandbox baseline: unchanged, 46 files, 674 tests, exit 0.
+- The six negative proofs in section 8 of this packet: observed exactly as recorded
+  there, each mutation restored and confirmed byte-identical before the next, and the
+  whole owned-path suite rerun green after each restore.
+- `(cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences)`: exit 0, `Test Files 6
+passed (6)`, `Tests 39 passed (39)` — unchanged from this same command's own pre-edit
+  run; the two files affected by `contract.ts`'s new typed error
+  (`preferences.resource.test.ts`, `browser-storage.repository.test.ts`) keep every
+  existing message-based assertion passing, because the thrown values keep the same
+  `message` strings.
+
+## Packet 050.7f, slice 3 — `composition.ts`'s doc comment, and the OpenSpec diffs
+
+Rehearsed the same way as slice 2. **A fresh executor given this slice applies the
+`tasks.md` and `spec.md` diffs (section 7.10, 7.11) to its own tree and leaves them
+applied** — per this packet's own file plan (section 5) and hand-over (section 11);
+that tree's own `git status` differs from this planner's own hand-over precisely by
+those two files being staged rather than absent. This planner's own rehearsal reverted
+both files from its own private tree afterward, because this packet's committed
+deliverable is the plan document alone, not a real code change — that reversion is this
+planner's own housekeeping, not an instruction for whoever executes the slice for real.
+
+- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` after `composition.ts`'s own
+  JSDoc-only diff: exit 0.
+- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`, this
+  slice's own fresh baseline before the `tasks.md`/`spec.md` diffs: `{"items": 114,
+"passed": 114, "failed": 0}`. The same command after both diffs: `{"items": 114,
+"passed": 114, "failed": 0}` — unchanged; the new requirement's own scenario headings
+  satisfy the schema's normative-sentence rule without changing the item count, which is
+  per-requirement/per-spec, not per-scenario.
+- `GSETTINGS_BACKEND=memory bunx prettier --write
+docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md` then
+  `--check`, twice: both exit 0.
+- Planner-only, run directly rather than inferred: `NX_DAEMON=false env -u CLAUDECODE -u
+CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit`, `wbs-fe-01:test`, and
+  `tool-devsync:test` with this packet staged. Exact observed values are recorded in this
+  packet's own section 9, not duplicated here; a fresh executor's own slice-3 hand-over
+  records its equivalent results in this file, appended after this entry.
```

## 8. Proofs

Six new safety checks in `theme.ts` — the initialiser guard, the resync effect's two
branches, the chooser's `try`/`catch`, the chooser's own null guard, and the
superseded-chooser ref guard — each proved by its own independent, type-correct
mutation and its own named, already-passing test. Every mutation below was actually
injected into `apps/wbs/fe-01/src/lib/theme.ts`, its named test run with `bunx vitest
run -t '<title>' src/lib/theme.test.tsx`, the failure observed, the file restored from a
`cp`-taken pre-mutation copy, and `cmp` confirmed byte-identical — all six, in order, on
2026-09-23. Rows 2 and 3 use the **type-correct alternative** review 2's Important 3
named: the original guard's own narrowing condition is left untouched and only the state
calls inside are deleted, because replacing the condition itself with a literal
(`if (false)`) removes the compiler's narrowing basis and fails `wbs-fe-01:typecheck`
with `TS2345` instead of failing a test — confirmed by trying that form first and
reading the exact diagnostic before choosing this one.

| #   | Fault injected                                                                                                                                                                                             | Location                                                    | Named failing test                                                                                                                                  | Observed diagnostic (2026-09-23)                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `themeStore ? readTheme(themeStore) : 'system'` replaced by `readTheme(themeStore as Remembered<ThemeChoice>)` in `useTheme`'s lazy `useState` initialiser                                                 | `theme.ts:301`, the line assigning `choice`'s initial value | `theme.test.tsx` › "the theme when the application services are withdrawn or transitioning" › "degrades to system and never throws when never live" | `TypeError: Cannot read properties of null (reading 'read')` at `theme.ts:107` (`readTheme`), reached from `theme.ts:301`'s own `useState` initialiser through React's `mountStateImpl`. `Test Files 1 failed (1)`, `Tests 1 failed \| 25 skipped (26)`. |
| 2   | Resync effect's withdrawn branch (`if (!themeStore) { … }`) kept, its two state calls deleted, `return;` left alone                                                                                        | `theme.ts:329-341`, the effect keyed on `[themeStore]`      | `theme.test.tsx` › same describe › "resets to system and stops persisting once the runtime is withdrawn, without waiting for disposal"              | `AssertionError: expected 'dark' to be 'system'` at `theme.test.tsx:397`. `Tests 1 failed \| 25 skipped (26)`.                                                                                                                                           |
| 3   | Resync effect's live branch: the call to `rememberedTheme(themeStore)` kept (for its drop side effect), `setChoice`/`setPersists(true)` deleted                                                            | `theme.ts:343-353`, same effect                             | `theme.test.tsx` › same describe › "adopts a later live store's own saved choice once one is published"                                             | `AssertionError: expected 'system' to be 'dark'` at `theme.test.tsx:434`. `Tests 1 failed \| 25 skipped (26)`.                                                                                                                                           |
| 4   | `chooseTheme`'s `try`/`catch` around `rememberTheme` removed (a bare `rememberTheme(themeStore, next); setChoice(next); setPersists(true);`)                                                               | `theme.ts:415-438`, `chooseTheme`'s own `useCallback` body  | `theme.test.tsx` › same describe › "does not throw when the closured store goes withdrawn between renders, and settles on the withdrawn state"      | `expect([Function]).not.toThrow()` at `theme.test.tsx:521` reported `PreferenceStoreLifecycleError: the page withdrew this preference store before the access completed` where `undefined` was expected. `Tests 1 failed \| 25 skipped (26)`.            |
| 5   | `chooseTheme`'s own null guard (`if (!themeStore) { … }`) kept, `setChoice(next)` deleted, `setPersists(false); return;` left                                                                              | `theme.ts:406-414`, same `useCallback` body                 | `theme.test.tsx` › same describe › "lets a reader still operate the control while never live, through the same null guard"                          | `AssertionError: expected 'system' to be 'light'` at `theme.test.tsx:654`. `Tests 1 failed \| 25 skipped (26)`.                                                                                                                                          |
| 6   | Superseded-chooser guard (`if (themeStore !== themeStoreRef.current) return;`) replaced by `if (false) return;` (type-correct — neither side of a literal `false` narrows anything, unlike rows 2/3 above) | `theme.ts:405`, the first line of `chooseTheme`'s own body  | `theme.test.tsx` › same describe › "does not let a superseded chooser change a replacement runtime's own state"                                     | `AssertionError: expected 'dark' to be 'light'` at `theme.test.tsx:574`. `Tests 1 failed \| 25 skipped (26)`.                                                                                                                                            |

Every fault was restored from a `cp`-taken pre-mutation copy, verified `cmp`
byte-identical to the pre-mutation file, and the whole owned-path suite rerun green
(`Test Files 4 passed (4)`, `Tests 68 passed (68)`) before moving to the next mutation.
The six adjacent production `Proof:` comments in `theme.ts` (section 7.1) record only
these six observed faults, each with its own exact diagnostic — rows 2 and 3 also record
why the type-correct alternative was chosen over the literal-condition form.

## 9. Verification

Commands actually run, in order, by this packet's own author directly (not inside an
executor sandbox), on `276c1e36` plus this revision's own working-tree edits, all on
2026-09-23:

- Sandbox baseline (`bunx vitest run --config vitest.node.config.ts --exclude
playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts`), before
  any edit: exit 0, `Test Files 46 passed (46)`, `Tests 674 passed (674)`.
- Red 1, type check on the four test files edited, `theme.ts`/`contract.ts`/
  `preferences.resource.ts`/`browser-storage.repository.ts` still unmodified: exit 1,
  `Found 21 errors in 2 files` (section 6, slice 2, has the full list).
- Red 2, `bunx vitest run` on the same tree: exit 1, `Test Files 1 failed | 3 passed
(4)`, `Tests 12 failed | 56 passed (68)` — every failure a `.persists` read against
  `undefined` (section 6).
- Green, after all four production diffs: `(cd apps/wbs/fe-01 && bunx vitest run
src/lib/theme.test.tsx src/index-bootstrap.test.ts src/app.test.tsx
src/components/chrome/account-menu.test.tsx)`: exit 0, `Test Files 4 passed (4)`,
  `Tests 68 passed (68)` — 26 + 15 + 7 + 20.
- `(cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences)`: exit 0, `Test Files 6
passed (6)`, `Tests 39 passed (39)`, both before and after `contract.ts`'s own diff —
  unchanged, confirming the typed error's message-based tests still pass.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0, both before and after this
  revision's own edits (clean tree, then edited tree).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0, after the one autofix round and
  two manual fixes section 6 names.
- Sandbox baseline, re-run after this revision's own edits: unchanged, exit 0, `Test
Files 46 passed (46)`, `Tests 674 passed (674)`.
- The six negative proofs in section 8: observed exactly as recorded there, each
  restored and `cmp`-verified before the next, and the whole owned-path suite (68 tests)
  rerun green after each restore.
- **`git apply --check`, on the twelve fenced diffs extracted from this document's own
  final, Prettier-formatted text** (a script that finds every fenced ` ```diff ` block
  between "## 7. The code" and "## 8. Proofs" and applies them in document order — not
  this packet's own scratch `/tmp` patch files kept from earlier drafting), filesystem
  `mv` first, against a fresh `git archive 276c1e36` extraction turned into its own tiny
  git repository (so `git apply --check` has a real index to check against): all twelve
  (`theme.ts`, the renamed `theme.test.tsx` content diff, `index-bootstrap.test.ts`,
  `app.test.tsx`, `account-menu.test.tsx`, `contract.ts`, `preferences.resource.ts`,
  `browser-storage.repository.ts`, `composition.ts`, `tasks.md`, `spec.md`, `verify.md`)
  reported **no output and exit 0** on `--check`, then applied for real with `git apply`
  (also exit 0, in the same run) — `git apply --check` prints nothing on success. Every
  one of the twelve applied files was then `cmp`-verified **byte-identical** against this
  revision's own real working-tree file at the same path — all twelve, no exceptions,
  `verify.md` included (this packet's own planner reverts its real tree's copy
  afterward, per section 6's own closing note, but the comparison here was taken before
  that revert). Order matters for the rename: applying the `theme.test.tsx` content diff
  before the `mv` fails with `error: apps/wbs/fe-01/src/lib/theme.test.tsx: No such file
or directory` (confirmed by trying it once, deliberately, before writing the script's
  own ordering).
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`: this
  packet's own fresh run, both without and with the `tasks.md`/`spec.md` diffs applied:
  `{"items": 114, "passed": 114, "failed": 0}`, unchanged, both times.
- `NX_DAEMON=false bunx nx run wbs-fe-01:build`: exit 0, both before and after this
  revision's own edits.
- `GSETTINGS_BACKEND=memory bunx prettier --write` then `--write` again then `--check`
  on this document: exit 0 on the final `--check`. `bunx nx format:check --all`: exit 0.
- `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
wbs-fe-01:test:unit`, **planner-only**: exit 0, `Test Files 48 passed (48)`, `Tests 697
passed (697)`, both before and after this revision's own edits — unchanged, confirming
  this packet touches no node-tier file.
- `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
wbs-fe-01:test` (the whole jsdom target, UTC then Auckland,
  `--no-file-parallelism --maxWorkers=1`), **planner-only, run twice — before this
  revision's own edits and after, each a fresh, isolated run with nothing else touching
  the worktree concurrently** (an earlier attempt at the "before" run, run concurrently
  with this revision's own mutation rehearsals in section 8, hit one spurious `Cannot
find module theme.test.ts` suite failure from that concurrent file-system race; it is
  not reported here, and the number below is the clean rerun):
  - Before: exit 0. UTC pass `Test Files 131 passed (131)`, `Tests 2995 passed (2995)`.
    Auckland zoned pass `Test Files 2 passed (2)`, `Tests 3 passed (3)`.
  - After: exit 0. UTC pass `Test Files 131 passed (131)`, `Tests 3004 passed (3004)`.
    Auckland zoned pass `Test Files 2 passed (2)`, `Tests 3 passed (3)`.
  - Delta: **+9 tests, 0 files, 0 regressions** — the nine new named/generated examples
    in `theme.test.tsx` (section 6), an observed delta, not a derived one.
- `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`, **planner-only**, run
  once with this revision's own full edit set staged (`git add -A`, then `git reset`
  immediately after — nothing here is committed by this step): exit 0, `366 pass`, `0
fail`, `903 expect() calls`, `Ran 366 tests across 25 files` — the same 366-test total
  other packets' own `verify.md` entries record as their baseline; this packet's own
  doc-only addition moves nothing in it.

## 10. Stop conditions

Every condition below is checked FALSE on this packet's own real starting tree
(`276c1e36`) before being stated as a stop. Every count named is a fresh observation
this revision's own planner took (section 9), never an assumed constant — a fresh
executor's own equivalent check compares against **its own step 0**, not against the
literal numbers printed here (section 6's own opening note).

- The sandbox command's own baseline is not reproduced at a slice's own step 0, compared
  against that same slice's own step 0 output. **Checked FALSE**: this revision's own
  planner reproduced 46 files / 674 tests, exit 0, both before and after its edits
  (section 9). Never compared against the whole `test:unit` target's own 48/697 — that
  comparison would itself be a false stop (Critical 1 of section 14).
- `git status --short --untracked-files=all` (scoped to the current slice's own owned
  paths) shows any line other than one of that slice's own hand-over paths, an
  unrelated starting change this packet preserves, or this packet's own plan document
  with a leading ` M`. **Checked FALSE**: `276c1e36`'s own `git status --short` is clean.
- Any of section 9's exit codes is non-zero **after this packet's own final edits**
  (every diff in section 7, all applied). **Checked FALSE**: every command re-run after
  the full edit reported exit 0 (the two rehearsed reds, sections 6 and 9, are evidence
  from an intermediate tree, not a residual stop).
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`'s
  `summary.totals.failed` is not `0`, or `summary.totals.items`/`.passed` are not
  positive integers, in this packet's own fresh measurement. **Checked FALSE**: `{"items":
114, "passed": 114, "failed": 0}`, both without and with the `tasks.md`/`spec.md` diffs
  applied.
- **Unconditional: OpenSpec task 3's checkbox is ticked by this packet.** It is not —
  section 5's file plan and section 7.10's own diff leave it unchecked, with the reason
  stated inline: one of five call sites moved is not "delivery reads its preferences out
  of that one graph," and the module's own wiki index is still absent
  (`apps/wbs/fe-01/src/modules/preferences/README.md:52`, confirmed by reading it).
  **Checked FALSE by construction.**
- `composition.ts` or `composition-agreement.test.ts` is deleted by this packet.
  **Checked FALSE by construction**: section 5's file plan marks both unmodified/handed
  to f2; `composition.ts` gains only a JSDoc paragraph (section 7.9).
- Any file outside section 5's file plan differs from `276c1e36` at a fresh executor's
  own hand-over. **Checked FALSE**: section 5's file plan is exhaustive, and section 7's
  twelve diffs are exactly its "Modify" rows — `tasks.md`, `spec.md` and `verify.md`
  (sections 7.10-7.12) are **kept applied** by a fresh executor's own slice 3 (section 6's
  own note), so they legitimately appear in that hand-over's own `git status`; this
  packet's own planner's private rehearsal reverts them from its own tree afterward for
  the separate reason section 6 states (its own committed deliverable is the plan
  document alone), which is why they do not appear in `git diff --stat 276c1e36` taken
  against this packet's own private worktree at the point this document was committed.

## 11. What this packet leaves — hand-over to 050-7-f2

**OpenSpec paths this packet touches, all under `openspec/changes/adopt-frontend-lifetimes/`:**
`tasks.md` (task 3's own checkbox annotation, section 7.10), `specs/adopt-frontend-lifetimes/spec.md`
(the new degrade-visibly requirement, section 7.11), and `verify.md` (this packet's own
entries, section 7.12) — all three kept applied by a fresh executor's own slice 3
(section 6), none reverted except in this packet's own planner's private rehearsal.

**050-7-f2, the remaining four call sites and `composition.ts`'s deletion:**

1. **`project-settings-modal.tsx` and `project-page.tsx`, design (i), same shape as this
   packet's `theme.ts`.** Blast radius (section 3.2): 1 render site + 1 bare-function
   test for the settings modal; 8 render/rerender sites (`project-page.test.tsx`) + 1
   shared-file render site (`optimization-integration.test.tsx`) for the project page.
   This packet's own `theme.test.tsx`/`app.test.tsx`/`account-menu.test.tsx` slices are
   the worked pattern: parameterise the bare functions, add the one hook-boundary call
   inside the component, add the four lifecycle/ownership cases this revision's own two
   reviews found necessary (reactivation, withdrawal-reset, the closured-write race
   caught with a typed lifecycle error rather than a blanket catch, and a
   superseded-chooser ref guard for any case where the same component can retain a
   stale callback across a live-to-live replacement), wrap renders in a live
   `<ApplicationServicesProvider>` (its own `isLive` wired, never
   `installApplicationRuntime()` bare) where persistence is asserted.
2. **`gantt-detail.ts`, design (iii).** Re-measured blast radius: 263 `<WbsTable>` + 105
   `<GanttPanel>` textual occurrences across 18 files (section 3.2), not packet c's
   "104", and `GanttPanel` is gated by `ganttOpen` (`wbs-table.tsx:2749`) — f2's own
   first slice must measure which tests actually reach it dynamically before choosing
   between this packet's two named shapes (context-consuming hook plus a shared
   test-fixture import swap across 18 files, or an explicit prop threaded from a single
   production composition point).
3. **`lib/remembered.ts`/`remembered-layout.ts`'s `storedMermaidSectionMode`, design
   (ii), the hard one.** f2's own first slice is the inventory this packet did not
   attempt: every remaining call site of `lib/remembered.ts`'s `remembered()`/
   `rememberedText()`, followed by a design record — a document of its own, given
   addendum point 16's warning that a design revised three times in a row under review
   is a sign the design is wrong, not the packet — for the lazy-resolution mechanism
   section 4(ii) names but does not build, including its own proof that a write
   attempted before the runtime is live is refused safely rather than assumed
   unreachable, and its own decision on whether this packet's `try`/`catch` pattern (a
   single closure, one race window) transfers to a module-scope binding (it may not —
   f2 must test, not assume).
4. **`composition.ts` and `composition-agreement.test.ts`'s deletion.** Blocked on all
   four sites above (items 1-3) moving. f2 is not required to do all four in one packet
   — the same cut rule this packet was given applies to f2 in turn — but the deletion
   itself is a single small slice once the last of the four lands, and should be f2's
   own last slice or handed to an f3 with nothing else to do.
5. **OpenSpec task 3's checkbox, and its module wiki index.** Ticked only once
   `composition.ts` is deleted **and** `module.frontend.preferences`'s own index exists
   — task 3's own text asks for both, and the module's own README already names the
   index absent and deferred to "its own packet."
6. **The `persists` field this revision adds to `Theme`/`ThemeContextValue`.** Not yet
   read by `AccountMenu` or any other consumer — f2 (or a later, smaller packet) may
   choose to surface it in the account menu's own UI, matching the pattern the OpenSpec
   requirement this packet adds (section 7.11) states but does not itself render.
7. **`PreferenceStoreLifecycleError`/`isPreferenceStoreLifecycleError`
   (`contract.ts`).** Already available for f2's own three remaining sites' `try`/`catch`
   blocks — no further contract change is needed for design (i)'s two remaining sites;
   design (ii)'s own module-scope case still needs its own proof that this same pattern
   applies (item 3 above).

## 12. Assumptions recorded rather than asked

- **A withdrawn-before-first-live-render branch is provable and worth proving even
  though production's own ordering (`application-bootstrap.tsx`) makes it unreachable
  today.** Consistent with `preferences.resource.ts`'s own `ensureLive` and
  `application-services-context.tsx`'s own `applicationServicesStateFor`, both of which
  model every non-`live` status rather than assuming a particular one cannot occur at a
  particular call site.
- **Resetting `choice` to `'system'` on withdrawal, rather than freezing it at its last
  live value, is the chosen behaviour** — this revision's own fix, not merely a
  documentation correction, because the original JSDoc already promised the reset and
  the first review's own reading of `preferences.resource.ts`'s own "never trust a
  stale reference's own answer" principle supports treating withdrawal as a real state
  transition delivery must render, not a value to preserve optimistically.
- **`persists: boolean` is the whole of this revision's own visible-degradation
  contract** — not a richer union or a reason string. `Theme`'s existing `'system'`
  default already models "nothing known" for the choice itself; `persists` only adds
  what that default cannot say on its own, namely whether the _current_ answer is being
  remembered.
- **`chooseTheme`'s own `try`/`catch`, and the resync effect's own `try`/`catch`, are
  scoped by type, not by inference over what `rememberTheme`/`rememberedTheme` could
  plausibly raise** — this revision's own review-2 fix (Critical 1): a first attempt
  reasoned informally that only one failure mode was reachable and caught everything,
  which also caught a real storage failure (a live store whose `write` throws for its
  own reasons) that must propagate. `isPreferenceStoreLifecycleError` makes the
  boundary a type check instead of an inference: if `preferences.resource.ts`'s or
  `browser-storage.repository.ts`'s own contract ever grows a THIRD throw path that is
  also a lifecycle refusal, it should be modelled as the same class, `kind` extended;
  a genuinely new, non-lifecycle failure needs no change here at all, because it is
  rethrown by construction.
- **The superseded-chooser guard is a plain ref comparison, not a generation counter or
  an identity check on `chooseTheme` itself.** `lifetime-slot.ts`'s own ordinal fencing
  already solves this exact problem for the slot; `useTheme` does not need its own copy
  of that mechanism, only a way to tell "the store I closed over" apart from "the store
  the most recent render actually holds" — one `useRef`, assigned in the render body,
  is the whole of it. A generation counter was considered and rejected as needless
  machinery for a single boolean question.
- **`project-settings-modal.tsx` and `project-page.tsx` were cut on this packet's own
  remaining time budget, not on any newly measured blockage** — unlike `gantt-detail.ts`
  (measured blast radius, section 3.2) and `lib/remembered.ts` (needs its own design
  record, section 4(ii)). f2 should not expect to find a hidden obstacle in either; the
  pattern is this packet's own `theme.ts` slice, applied twice more, including its four
  lifecycle/ownership cases and its `persists` field.

## 13. Disposition: what this packet found wrong or stale in packets a-e's landed text

- **Packet c's section 3.3 undercounted `gantt-detail.ts`'s own render-site blast
  radius by roughly 3.5×**, citing only `gantt-panel.test.tsx`'s 104 `<GanttPanel>`
  sites and not the further sites reachable through `<WbsTable>` across the other 17
  test files (section 3.2 of this packet has the corrected count: 263 `<WbsTable>` + 105
  `<GanttPanel>` across 18 unique files, and the `ganttOpen` conditional packet c's own
  text also did not name). This does not make packet c's own decision to stop before
  moving any call site wrong — if anything it strengthens it — but a reader relying on
  packet c's own "104" to scope a future packet would under-budget it by a wide margin.
  Recorded here rather than edited into packet c's own already-merged text, per R3
  ("knowledge lives with what it describes" — this correction lives with the packet
  that needed it).
- **No other defect found.** `application-services-context.tsx`, `lifetime-slot.ts`,
  `application-runtime.ts`, `application-bootstrap.tsx`, `preferences.resource.ts` and
  `module.ts` were all read against this packet's own use of them (section 2) and found
  to behave exactly as their own JSDoc and packets c/d/e's own text describe — this
  packet's own `theme.ts` slice is a straightforward consumer of all five, and needed no
  workaround in any of them. `lifetime-slot.ts`'s own JSDoc on synchronous withdrawal
  versus deferred notification (`replace`/`retire`) is what made this revision's own
  transition-3 race provable and fixable at all; it is exactly as documented.

## 14. Disposition of review 1

Review verdict: NOT READY. Two criticals, seven important findings, three minor, and the
20-point addendum table. Every finding below is FIXED in this revision; none is disputed.

### Critical

1. **§6 Step 0 and §10 — the baseline stop condition was already true.** FIXED. The
   sandbox command's own excluded-file count is **46**, not the whole node-tier target's
   48; section 3.4 now states this explicitly and section 3.5's table separates the
   sandbox command's own baseline (46/674, unchanged) from the whole `test:unit` target
   (48/697, planner-only, for information). Every slice's own step 0 (section 6) now
   compares only against the sandbox command's own fresh run. The OpenSpec baseline in
   section 3.5 and section 10 is now this packet's own fresh measurement (`{"items":
114, ...}`, stated as measured, not assumed) rather than a fixed literal a later
   attempt would be required to reproduce exactly.
2. **§7 and §9 — six supplied patches were corrupt.** FIXED. Every diff in section 7 is
   now `git diff`'s (or `git diff --no-index`'s, for the rename) own machine-generated
   output, pasted verbatim — none hand-assembled or edited afterward, and section 7.2's
   prose pseudo-hunk (`@@ (eight further ...)`, `@@ END of file`) is gone, replaced by
   the complete real diff. Section 9 records the literal `git apply --check` output —
   silent, exit 0, all nine patches — from applying the **extracted fenced text of this
   document** in slice order against a fresh `git archive 276c1e36` extraction (a
   filesystem `mv` first, never `git mv`), then applies them for real and confirms
   byte-identity against this revision's own working files.

### Important

1. **§6 and §7.2 — slice dispatch and hand-overs conflicted with the launcher.** FIXED.
   Section 6 now states plainly that this revision was rehearsed and verified directly
   by its own author, not dispatched to a separate executor agent, and gives the
   launcher's own real invocation (`run-executor.sh <packet> <slice> <sha> --batch
batch-6`, with `--resume` and `--require-ancestor` named) for a future dispatch
   against a commit that actually contains this document — never a bare working tree.
   Slice 1 is now explicitly "already completed planner preparation." Section 7.2's
   dispatch line now prescribes filesystem `mv`, and both rename paths are named in
   slice 2's own owned-paths and hand-over lists, matching an unstaged rename's real
   `git status` shape (` D` the old path, `??` the new one). Slices 2 and 3 now have
   exact commit subjects.
2. **§4, §7.1 and §12 — silent persistence loss did not satisfy R5's visible-degradation
   requirement.** FIXED. `Theme` (and, threaded through, `ThemeContextValue`) now carries
   `persists: boolean`, `false` for exactly as long as the application services are
   withdrawn, proved by four of this revision's own named tests. Section 4 states the
   contract; section 7.8 adds the matching OpenSpec requirement and its three scenarios,
   validated in this rehearsal (section 9). The stale §12 assertion is replaced by this
   revision's own §12 bullet on why `persists: boolean` alone is the chosen contract.
3. **§4's invariant and §7.1-7.2 — the code did not implement the claimed lifecycle
   behaviour.** FIXED. `useTheme` now handles three named transitions explicitly —
   withdrawal-while-mounted (resets to `system`), reactivation-while-mounted (adopts a
   later live store's own saved answer), and a write racing withdrawal through a
   closured, once-live store (caught, never rethrown) — each proved by its own test
   using a **real slot with `isLive` wired** exactly as `acquireApplicationRuntime`
   wires the production one (never `installApplicationRuntime()` bare, whose default
   `isLive` at `application-runtime.ts:111` is always `true`), including a held-disposal
   window (`slot.retire()` called but not yet awaited) and a live replacement
   (`slot.replace` after a never-published start). `preferences.resource.ts:75-78`'s own
   throw is unchanged and reused, not contradicted — section 4's own opening paragraph
   now says so explicitly. The claim is deliberately narrowed rather than broadened
   further: section 4 states exactly what is proved (three named examples) and what is
   not (arbitrary interleavings), matching addendum point 15's model-test requirement
   only where a genuinely new piece of _ownership_ state exists — `useTheme` owns none.
4. **§8 — one mutation did not prove all the new guards or runtime ownership.** FIXED.
   Section 8's table now has four independent rows — the initialiser, the resync
   effect's live branch, the resync effect's withdrawn branch, and the chooser's
   `try`/`catch` — each with its own mutation, its own named failing test and its own
   literal observed diagnostic. A fifth test (`theme.test.tsx`'s "reads and writes the
   runtime's own injected store, never the staged composition.ts singleton") uses a
   distinct `fakeBrowserStorage()` instance per fixture and asserts a live write lands in
   that fake, never in real `localStorage` — proving the runtime's own store is reached,
   not `composition.ts`'s singleton, which always wraps the real one.
5. **§5, §6, §7.6 and §11 — OpenSpec ownership was deferred ambiguously.** FIXED.
   `tasks.md` (section 7.7), the new `spec.md` requirement (section 7.8) and `verify.md`
   (section 7.9) are all concrete diffs now, assigned to slice 3 and validated in this
   rehearsal (section 9) before being reverted from the real tree per this packet's own
   hand-over scope. Task 3's own text is read to require the module's wiki index as well
   as the duplicate's deletion; section 10 and section 11 both now name the index
   (`apps/wbs/fe-01/src/modules/preferences/README.md:52`, confirmed absent by reading
   it) as a second, still-unmet clause, not only the duplicate.
6. **§6 and §9 — the verification procedure was incomplete or contradictory.** FIXED.
   The whole `wbs-fe-01:test` target is now explicitly **planner-only** everywhere it
   appears (section 3.4, section 6 slice 3, section 9), never phrased as a slice-2
   requirement. Every shell block in section 6 is now a complete, valid script under
   `set -euo pipefail` with an explicit status capture and `test` on the captured exit
   code, including step 0's own strict check. Slice 3 now states the frontend build is
   out of this packet's own scope (this packet touches no build-relevant export surface
   beyond `Theme`/`ThemeContextValue`, both additive) and assigns `nx format:check --all`
   and the strict OpenSpec block explicitly to slice 3's own steps.
7. **§3.2, §4(iii), §11 and §13 — the corrected Gantt inventory still contained false
   facts.** FIXED. `wbs-table.tsx:2749`'s own `ganttOpen &&` conditional is now named
   explicitly, and every occurrence count is labelled a **textual occurrence**, not a
   proof of dynamic reach. The corrected count is **263 `<WbsTable>` + 105
   `<GanttPanel>` across 18 unique files** (not 19 — `gantt-panel.test.tsx`'s own 3
   `<WbsTable>` occurrences are now included in its own row rather than omitted, and
   `page-shortcuts.test.tsx`'s own path is corrected to `components/ui`). Section 4(iii)
   and section 11 both now instruct f2 to measure dynamic reach before committing to a
   migration shape.

### Minor

1. **§3.5, §6 and §9 — individual test totals were wrong although their combined total
   matched.** FIXED, and superseded: this revision adds four further named tests beyond
   the one the original review's own arithmetic was checking, so the totals are
   recomputed from scratch against this revision's own real files rather than patched
   to the review's own now-superseded numbers. Base content: `theme.test.ts` 17 tests,
   `index-bootstrap.test.ts` 15, `app.test.tsx` 7, `account-menu.test.tsx` 20 — **59**,
   not 60. This revision's own content: `theme.test.tsx` 22, the other three unchanged
   — **64**. Delta **+5**, confirmed by an actual combined run (section 9), not a
   hand-count.
2. **§5 and §7.2 — incorrect internal references.** FIXED. Every cross-section reference
   was checked against this revision's own renumbered sections (composition.ts is now
   §7.6, not §7.5) and the stale `application-services-context.test.ts` extension
   (should be `.tsx`) does not recur anywhere in this revision's own text.
3. **§7.2-7.4 — newly acquired test runtimes were not retired.** FIXED. Every direct
   `installApplicationRuntime()` call in the owned test files is now retained and closed
   (`theme.test.tsx`'s own `withThemeStore` helper; `index-bootstrap.test.ts` calls
   `installApplicationRuntime()` inline, inside its own `try`/`finally`, matching
   `composition-agreement.test.ts`'s own pattern rather than importing another test
   file's helper); every fixture built through a `LifetimeSlot` is retired via
   `slot.retire()` in an `afterEach` (or at the end of its own test body) that runs
   **after** React `cleanup()`, not before.

### Addendum, resolved rather than reassessed point by point

Every "Not met"/"Partial" row from review 1's own 20-point table was addressed by one
of the fixes above: point 4 (failure-visible commands) by the corrected shell blocks
(Important 6); point 6 (sandbox facts) by the corrected baseline and the explicit
planner-only marking (Critical 1, Important 6); point 9 (packet form) by the corrected
subjects, baselines and OpenSpec ownership (Important 1, 5); point 15 (lifecycle
interleavings) by the three named transitions and the explicit, narrowed claim
(Important 3); point 20 (bounded claims) by `persists` and the corrected withdrawal/
reactivation behaviour (Important 2, 3). **This blanket summary is superseded by review
2's own Important 8 finding — a blanket "addressed" claim is not a requirement-by-
requirement assessment. Section 15's own addendum table, below, is the current,
row-by-row disposition; read that one, not this paragraph, for this revision's own
status against each of the 20 points.**

## 15. Disposition of review 2

Review verdict: NOT READY. Four criticals, eight important findings, two minor. Every
finding below is FIXED in this revision; none is disputed.

### Critical

1. **§4, §7.1 and §12 — the chooser swallows arbitrary storage failures.** FIXED.
   `contract.ts` now exports `PreferenceStoreLifecycleError`/
   `isPreferenceStoreLifecycleError` (line 314); `preferences.resource.ts`'s `ensureLive`
   and `browser-storage.repository.ts`'s revoked guard both throw it, over the same two
   messages. `chooseTheme` (`theme.ts:415-438`) writes first, then sets state — a comment
   states this explicitly ("Written before `setChoice` below, on purpose", line 1148 of
   this document's own diff) — and catches only the typed error, rethrowing everything
   else. `theme.test.tsx` keeps a dedicated "reads and writes the runtime's own injected
   store" case using a live `fakeBrowserStorage`; the packet no longer claims a live
   store's own unrelated write failure is ever swallowed.
2. **§4 and §7.1 — withdrawal between render and the passive effect still throws.**
   FIXED. The resync effect's live branch (`theme.ts:343-353`) now wraps
   `rememberedTheme(themeStore)` in the same typed-error `try`/`catch` the chooser uses.
   A new named test, "recovers, instead of throwing, when the store is retired between
   this hook's render and its resync effect" (line 1621), mounts a sibling with a
   `useLayoutEffect` that calls `slot.retire()` before `useTheme`'s own passive effect
   runs, and asserts nothing throws and the hook settles on `withdrawn`.
3. **§6 Step 0 and §9 — the prescribed red checkpoint cannot reproduce the recorded
   result.** FIXED. Section 6's own type-check red is a fresh, real rehearsal on this
   revision's own final test-file diffs against unmodified production files: `Found 21
errors in 2 files` (line 477 begins the real fenced `sh` script that produces it), not
   the stale "8 errors" the prior revision claimed. The vitest red is separately
   rehearsed and recorded as `12 failed | 56 passed (68)`. Every shell block in section 6
   is now a real fenced ` ```sh ` block (line 477 is the first of many) with explicit
   `if … then status=0; else status=$?; fi` conditional capture — no inline
   backtick-fragments, no literal `>` leakage.
4. **§7.9 — the supplied verification patch publishes a private absolute path.** FIXED.
   `grep -n '/home/' <packet>` finds it in exactly one place outside this disposition's
   own sentences describing that fact: section 6's own dispatch line, which addendum
   point 9's own text names as the one committed exception ("the launcher path
   precedent inside packets"). The `verify.md` diff (section 7.12) contains none —
   confirmed by the same grep restricted to the extracted patch file.

### Important

1. **§4, §7.1-7.2 and §14 — a retained chooser corrupts the replacement runtime's
   displayed state.** FIXED. `useTheme` keeps `themeStoreRef`, a plain ref assigned the
   current `themeStore` on every render (section 12, line 2944, records why a ref and not
   a generation counter); `chooseTheme`'s first line (`theme.ts:405`) is now
   `if (themeStore !== themeStoreRef.current) return;` — a documented no-op for a
   superseded closure, proved by its own mutation (section 8, row 6) and its own named
   test, "does not let a superseded chooser change a replacement runtime's own state",
   which replaces a live runtime with a second live runtime, retains the first's
   `chooseTheme`, and asserts the second runtime's own displayed choice, persistence and
   storage are all untouched.
2. **§7.2 — an existing persistence assertion is deleted rather than migrated.** FIXED.
   "Drops an answer it cannot read, from an effect rather than from a render" now uses
   the injected `fakeBrowserStorage` fixture and retains the removal assertion as
   `expect(store.held()[THEME_KEY]).toBeUndefined()` (two occurrences in this document's
   own diffs, lines 1446 and 1697 — one in the migrated example, one in the new
   closured-write-race example that proves the same drop under a race).
3. **§8 — the proof matrix still does not cover the checks it claims to cover.** FIXED.
   Section 8 (line 2695) now has six independent rows, not four: the initialiser, the
   resync effect's withdrawn branch, the resync effect's live branch, the chooser's
   `try`/`catch`, the chooser's own null guard, and the superseded-chooser guard — each
   with its own type-correct mutation (rows 2, 3 and 5 keep the guard's own narrowing
   condition and delete only the state calls inside it, avoiding the `TS2345` the
   literal-condition form produces; row 6 uses `if (false)` because that guard's own
   comparison narrows nothing, so the literal form is safe there). Every test title in
   the table is copied verbatim, typographic apostrophes included, from the real file
   (spot check: "adopts a later live store's own saved choice…" carries `'`, not `'`).
   `fakeBrowserStorage`'s own `held()` is used only to assert on bytes actually written,
   never to claim a read count; the one "reads and writes nothing" framing review 2
   flagged was reworded (theme.test.tsx's never-live test is now titled without that
   phrase, and its own JSDoc states the zero-access claim follows from `useTheme`'s
   control flow — `themeStore` stays `null` throughout, so no `Remembered` member is ever
   called — not from an instrumented count).
4. **§6, §7.7-7.9 and §10 — OpenSpec execution and handover remain contradictory.**
   FIXED. Section 6's slice 3 now states explicitly, in bold, that **a fresh executor
   applies both OpenSpec diffs and keeps them applied** (line 681); section 10's own
   file-outside-plan stop condition and section 11's hand-over both say the same. Only
   this packet's own planner's private rehearsal reverts its own tree afterward, and
   section 6's closing note explains why in a paragraph addressed to that planner
   process, never phrased as an instruction to an executor. `verify.md`'s own diff
   (section 7.12) is now slice-scoped instructions plus this revision's own fresh
   observations, not a fixed historical report — it explicitly tells a fresh executor to
   append its own equivalent entry rather than overwrite this one.
5. **§3.5, §6 Step 0 and §10 — baselines remain absolute or unavailable.** FIXED.
   Section 6 opens with "Baselines are always relative…" (line 463), stating plainly that
   every slice's step 0 is what later comparisons run against, and that the absolute
   counts in this document are informational, observed on 2026-09-23, not a fixed target.
   Slice 3's `(cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences)` line now
   says explicitly to collect this slice's own step-0 count before applying any diff
   (this command runs under the default jsdom config, so it collects all six files in
   that directory, including the two DOM-bearing suites `composition-agreement.test.ts`
   and `browser-storage.repository.test.ts` the prior baseline command excluded by using
   the node-only config). Section 9 no longer derives the whole-suite pre-edit count by
   subtraction: both the before (2995) and after (3004) whole-target runs were actually
   executed, each a fresh, isolated run (see Minor items below for the one contamination
   this revision hit and discarded).
6. **§6, §9 and §14 Important 6 — required verification is still missing despite the
   disposition claiming otherwise.** FIXED. Slice 3 (line 661, its own heading now names
   "format, build") contains a real `bunx nx format:check --all` step and a real
   `NX_DAEMON=false bunx nx run wbs-fe-01:build` step, both wrapped in the same
   conditional-status form as every other command in section 6. Both were actually run on
   the final tree (section 9): format check exit 0, build exit 0. The strict OpenSpec
   block now asserts `t['items'] > 0` and `t['passed'] > 0` as integers, not only
   `t['failed'] == 0`, matching the batch 1 README's own mandatory contract.
7. **§7.2, §7.5 and §14 Minor 3 — teardown claims are inaccurate.** FIXED.
   `theme.test.tsx` now tracks every `LifetimeSlot` it builds in a module-scope
   `builtSlots` array (line 1265) via a `freshSlot()`/`liveSlot()` pair, and a single file
   afterEach (`cleanup()` then `await Promise.all(slots.map(s => s.retire()))`) always
   runs — including after a failed assertion — retiring every slot the file built,
   whether or not the test body itself already retired it (`retire()` on an
   already-empty slot is the documented no-op). `liveSlot()` awaits the real
   `slot.replace()` promise; no test substitutes a bare `Promise.resolve()` wait for it
   anymore.
8. **§14 Addendum disposition — "every partial/not-met row is addressed" is false.**
   FIXED by replacement, not by argument. Section 14's own blanket paragraph now says, in
   bold, that it is superseded by this finding and points at this section's own table
   below (line 3110). The table is below.

### Minor

1. **§3.5, §6 and §9 — several remaining factual references were wrong.** FIXED. Slice
   1's own subject line now says "section 15", pointing at this section rather than the
   packet's own end (section 6, line 515). Slice 2's own heading and prose now say "its
   four test files" (`theme.ts`/`theme.test.tsx`/`index-bootstrap.test.ts`/
   `app.test.tsx`/`account-menu.test.tsx` is five _paths_, but `theme.ts` is the
   implementation, not a test file — four test files, section 6, line 521). Section 14's
   own Minor 3 entry no longer attributes `withThemeStore` to
   `index-bootstrap.test.ts`: it now states plainly that the helper lives in
   `theme.test.tsx`, and that `index-bootstrap.test.ts` calls
   `installApplicationRuntime()` inline inside its own `try`/`finally` instead of
   importing another test file's helper (section 14, Minor 3, corrected above). This
   revision's own test totals are also, separately, fresh rather than carried forward:
   `theme.test.tsx` now carries **26** tests (17 base + 9 new, not the prior revision's
   22), and the four-file combined green is **68** (not 64) — every count in sections 6
   and 9 is this revision's own actual run.
2. **§7.1 — the new JSDoc misstates replacement reference identity.** FIXED.
   `theme.ts`'s own `useTheme` JSDoc (this document's diff, line 938) now reads: "a
   _new_ reference once a later runtime replaces this one … (`installApplicationRuntime`
   builds a fresh graph per installation; `application-services-context.tsx`'s own
   memoisation only preserves identity while the _same_ facade stays published)" —
   stating a replacement supplies a new facade reference, which is what invalidates the
   memoised store, rather than claiming equal-by-reference identity across a replacement.

### Addendum, requirement by requirement (replaces §14's blanket disposition)

|                             Point | Assessment         | Basis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------: | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|       1. Exact unchanged-code red | **Met**            | Section 6's own type-check red (21 errors) and vitest red (12/68) are both fresh reruns on this revision's own final test diffs against unmodified production files, not a carried-forward description.                                                                                                                                                                                                                                                                                 |
| 2. Prescribed code typecheck/lint | **Met**            | `wbs-fe-01:typecheck` and `wbs-fe-01:lint` both exit 0 on the fully edited tree (section 9); lint's one autofix round and two manual fixes are named exactly.                                                                                                                                                                                                                                                                                                                           |
|   3. Planner paths in inventories | **Met**            | Section 6's hand-over lists name this packet's own plan document with a leading ` M` explicitly, for both slices.                                                                                                                                                                                                                                                                                                                                                                       |
|       4. Failure-visible commands | **Met**            | Every asserted-exit-status command in section 6 uses the `if … then status=0; else status=$?; fi` form; none relies on a `grep` filter that could match nothing on both success and failure.                                                                                                                                                                                                                                                                                            |
|      5. HEAD-reading rename tests | **Not applicable** | No project/target/CI rename in this packet.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|               6. Sandbox handling | **Met**            | The two Node-`spawnSync`-`bun`-`EPERM` targets (`test:unit`, whole `test`) are explicitly named planner-only in section 6's own slice 3, with a durable status wrapper around each.                                                                                                                                                                                                                                                                                                     |
|          7. Known contention race | **Met**            | Section 3.4 names the exact `claims.db.test.ts` test and its own exception; this packet touches no database code and the whole-suite runs in section 9 hit no such failure (the one spurious failure this revision did hit — `Cannot find module theme.test.ts` — was a self-inflicted concurrent-file-system race during this revision's own mutation rehearsal, identified, discarded, and the run repeated cleanly in isolation; recorded honestly in section 9 rather than hidden). |
|           8. Product/module names | **Met**            | No stale renamed identifier is prescribed anywhere in this revision.                                                                                                                                                                                                                                                                                                                                                                                                                    |
|    9. Packet form/public evidence | **Met**            | Exact commit subjects per slice (section 6); relative baselines throughout (Important 5 above); every new safety check has its own production-path negative (section 8); exactly one committed absolute path, the accepted launcher precedent (Critical 4 above).                                                                                                                                                                                                                       |
|               10. Dependency pins | **Met**            | No `bun.lock`/`package.json`/library-version change anywhere in this revision.                                                                                                                                                                                                                                                                                                                                                                                                          |
|        11. Pipeline exit handling | **Not applicable** | No prohibited acceptance pipeline in this packet.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|      12. Planner fail-fast chains | **Not applicable** | No publishing chain (push/PR/gate) in this packet's own commands.                                                                                                                                                                                                                                                                                                                                                                                                                       |
|                13. Module indexes | **Met for scope**  | No module file added by this packet; the module's own still-absent wiki index is named as f2's own scope (section 11, item 5), not silently dropped.                                                                                                                                                                                                                                                                                                                                    |
|         14. Bun directory filters | **Met**            | No bare `bun test <dir>` anywhere in this packet; every vitest invocation is explicit files or an explicit `--config`.                                                                                                                                                                                                                                                                                                                                                                  |
|       15. Lifecycle interleavings | **Met**            | The four named transitions/cases are joined by one generated `fast-check` property (`theme.test.tsx`, pinned `seed: 20260923, numRuns: 50`) over `chooseTheme`/`retire`/`replace` interleavings against a small reference model — addendum 15's own generated-coverage requirement, scoped narrowly and explicitly (section 4's own closing paragraph on this point) to what `useTheme` itself owns, not a re-proof of `lifetime-slot.ts`'s own fencing.                                |
|      16. Three-round design reset | **Not triggered**  | This is 050-7-f's second review, not a third consecutive redesign of the same mechanism; addendum 16 does not apply.                                                                                                                                                                                                                                                                                                                                                                    |
|         17. Seeded prior evidence | **Not applicable** | This packet was rehearsed directly by its own planner (section 6), not dispatched through the launcher's own multi-attempt seed mechanism.                                                                                                                                                                                                                                                                                                                                              |
|  18. Symbol-based boundary checks | **Not applicable** | No code-shape/import boundary checker is added by this packet.                                                                                                                                                                                                                                                                                                                                                                                                                          |
|   19. Missing-input grep handling | **Not applicable** | No grep-based acceptance gate in this packet's own commands.                                                                                                                                                                                                                                                                                                                                                                                                                            |
|                20. Bounded claims | **Met**            | `persists: boolean` states exactly what is proved and nothing more (section 12); the "reads and writes nothing" phrasing review 2 flagged was reworded to state what `useTheme`'s own control flow already guarantees, not an instrumented but unproven count; the withdrawal/reactivation/superseded-chooser claims are each backed by a named test plus the generated property, not by prose alone.                                                                                   |

Points 5, 11, 12, 16, 17, 18 and 19 are the same seven the review's own historical table
already read as "Not applicable"/"Not triggered" for this packet's own scope; they are
carried forward here rather than re-litigated, per the same rule section 14's own
closing note already stated for review 1's table.
