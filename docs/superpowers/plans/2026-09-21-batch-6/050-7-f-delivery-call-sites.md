# 050.7f The delivery call sites, off the staged duplicate and onto the runtime

|             |                                                                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **seventh packet**                                                                                                                                                                                                         |
| Size class  | S (one of five call sites; the rest are handed to a named follow-up — section 4 and section 11 say why)                                                                                                                                                                                                               |
| Predecessor | [050.7e](050-7-e-page-lifecycle.md) is not this packet's actual predecessor for the code it touches: this packet builds on `main` at `276c1e36` (the merged tip after e/e2/e3), and its own subject is [050.7c](050-7-c-application-context.md)'s task 3, left open there — see that packet's own section 11, item 2. |
| Design      | This packet's own section 4. Predecessor design: [The frontend lifetime slot](050-7-lifetime-slot-design.md), unmodified — this packet adds no new lifecycle mechanism, only consumers of the one `application-services-context.tsx` already exposes.                                                                 |
| OpenSpec    | `adopt-frontend-lifetimes`, task 3 (partially — one of five call sites; see section 10's stop condition and section 11's hand-over). This packet also adds one new requirement, "A delivery consumer of preferences degrades visibly when withdrawn" (section 7.8's spec diff).                                       |
| Revision    | This is a revision of the packet committed at `f6d11b87`, after its first review — see section 14, "Disposition of review 1", for every finding and its fix.                                                                                                                                                          |

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
`theme.test.tsx`, not merely asserted in prose:**

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
3. **A write racing withdrawal.** `chooseTheme`'s own closure can still hold a store
   that was live when this hook last rendered but has gone withdrawn since —
   `lifetime-slot.ts`'s own JSDoc: `retire()`/`replace()` withdraw publication
   **synchronously**, while the subscriber notification that would rebuild this closured
   store is deferred to a microtask. `rememberTheme`'s only failure mode through that
   closured, now-stale store is `preferences.resource.ts`'s own `ensureLive` refusal —
   `chooseTheme` now catches exactly that outcome and degrades to a local-only choice
   with `persists: false`, rather than letting it escape as an uncaught error from a
   click handler (the defect the first review found: removing the try/catch let this
   throw reach the caller, contradicting the "never throw for withdrawn" invariant every
   other consumer of these services keeps).

**What stays untested, deliberately narrowed rather than asserted:** this file only
proves the three named transitions above through their own examples, not every
interleaving `fast-check`'s scheduler could generate. `useTheme` owns no lock, no queue
and no disposer of its own — unlike `lifetime-slot.ts`'s own state machine, it is a
reader of a store that already proves its own generation-fenced ordering, so the three
named examples plus the resource's own model-tested guarantees are the claim; nothing
broader is asserted.

**A second, explicit degradation this revision adds: `persists: boolean` on `Theme` (and,
threaded through, on `ThemeContextValue`).** The first review found that silently
accepting a chosen-but-unpersisted answer is exactly the misleading behaviour
`browser-storage.repository.ts`'s own JSDoc warns against for a blocked store. `persists`
is `false` for precisely as long as the application services are withdrawn (including
the transient window transition 3 covers), `true` otherwise; no UI consumer reads it yet
(`AccountMenu`'s own props are unchanged — out of this packet's own scope), and the
OpenSpec change now states the contract this field exists to satisfy (section 7.8).

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

| Path                                                                               | Change                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/lib/theme.ts`                                                  | Modify — remove the module-scope `storedChoice`; parameterise `rememberedTheme`/`readTheme`/`rememberTheme`; `useTheme` reads `useApplicationServicesState()`; add `persists`.                                                                                   |
| `apps/wbs/fe-01/src/lib/theme.test.ts` → `theme.test.tsx`                          | Rename by **filesystem `mv`** (JSX wrapper needs `.tsx`; the executor sandbox's `.git` is read-only and `git mv` is forbidden — preamble rule 1) and modify — runtime-path bare-function tests, provider wrapper on every `renderHook`, five new named examples. |
| `apps/wbs/fe-01/src/index-bootstrap.test.ts`                                       | Modify — one call site moves to the runtime path, retained and closed.                                                                                                                                                                                           |
| `apps/wbs/fe-01/src/app.test.tsx`                                                  | Modify — a live `<ApplicationServicesProvider>` wrapper (its own `isLive` wired) around every `render(<App/>)`, retired in `afterEach` after React cleanup.                                                                                                      |
| `apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx`                       | Modify — the same live-wrapper treatment around `ThemeHarness`'s three render sites (section 3.3's fourth bullet; found by the whole-suite run, not the static grep).                                                                                            |
| `apps/wbs/fe-01/src/modules/preferences/composition.ts`                            | Modify — JSDoc only: records that one of five call sites has moved and names the other four.                                                                                                                                                                     |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                               | **Prescribed diff (section 7.7), not applied by this packet's own author** to the real tree at hand-over — see section 10's stop condition on ticking task 3. Rehearsed and reverted; only its diff is committed, inside this document.                          |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` | **Prescribed diff (section 7.8), not applied by this packet's own author** to the real tree at hand-over — the new requirement section 4 states. Rehearsed (validated, see section 9) and reverted; only its diff is committed.                                  |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                              | **Prescribed diff (section 7.9)**, appended in the same "Packet 050.7f" shape every other packet's own verify.md entries use.                                                                                                                                    |
| `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`                                | **Unmodified.** Handed to f2 — section 4(iii), section 11.                                                                                                                                                                                                       |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx`                               | **Unmodified.** Handed to f2 — section 4(i), section 11.                                                                                                                                                                                                         |
| `apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx`                     | **Unmodified.** Handed to f2 — section 4(i), section 11.                                                                                                                                                                                                         |
| `apps/wbs/fe-01/src/lib/remembered.ts`, `remembered-layout.ts`                     | **Unmodified.** Handed to f2 — section 4(ii), section 11.                                                                                                                                                                                                        |

## 6. Method: this revision was rehearsed and verified directly, not through a separate executor dispatch

**This packet's own author wrote, rehearsed and verified every line below directly, on
this exact worktree, rather than dispatching to a separate executor agent.** Section 9
is a record of commands this packet's own author actually ran and their actual output,
never predicted. The "slices" below are the same shape every batch-6 packet's own
slices take — each with its own baseline, red, green and verification — so that if this
packet is ever hand ed to a fresh executor for a _further_ revision, the same shape
dispatches cleanly; they are not, and were not, three separate attempts here.

**Dispatch, if this packet is ever handed to a fresh executor for a further change:**
`/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-7-f-delivery-call-sites <slice>
<sha> --batch batch-6`, where `<sha>` is a commit that already contains this document at
`docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md` — this
revision's own commit qualifies (its sha is in this document's own git history and in
the report handed back to this packet's caller), and so does its parent `f6d11b87`,
which contains the packet's pre-review text (not this revision's fixes — a fresh
executor dispatched against `f6d11b87` would be executing the version this document's
own section 14 disposes of, not this one). Add `--resume` to continue an interrupted
clone in place rather than starting a fresh one, and `--require-ancestor <sha>` to
refuse dispatch unless a named prerequisite (for instance an earlier slice's own commit)
is already in the clone's history.

Every command below that is not itself a single line starts:

```sh
set -euo pipefail
```

### Step 0 — at the start of every slice, from the repository root

```sh
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice-start-status.txt"
(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts) \
  > "$TMPDIR/evidence/step0-node.log" 2>&1
node_status=$?
echo "exit=$node_status" >> "$TMPDIR/evidence/step0-node.log"
test "$node_status" -eq 0
```

Expected and observed: the sandbox command's own baseline is **46 files / 674 tests**,
exit 0 (section 3.4/3.5) — never 48/697, which is the whole `test:unit` target's own,
separate, planner-only count. Every slice's own step 0 must reproduce this same 46/674;
a difference is a stop condition (section 10).

### Slice 1 — the design record (already completed planner preparation)

Subject (already committed): `docs(plans): add the seventh 050.7 packet (delivery call
sites onto the runtime's preferences)`, at `f6d11b87`. This revision's own subject is
`docs(plans): revise the seventh 050.7 packet after its first review` (section 15). No
code in either commit — this document's own sections 1 through 5 are the artifact. A
fresh executor dispatching against a commit that already contains this file (any commit
at or after `f6d11b87`, or after this revision's own sha) finds slice 1 already
satisfied and starts at slice 2.

### Slice 2 — `theme.ts`, its five test files, red then green, test-first

Subject: `feat(fe-01): move lib/theme.ts onto the runtime's preferences`

Owned paths: `apps/wbs/fe-01/src/lib/theme.ts`, `apps/wbs/fe-01/src/lib/theme.test.ts`
(renamed by filesystem `mv` to `theme.test.tsx` — both paths are listed so the hand-over
inventory names the deletion and the addition separately, matching an unstaged rename's
real `git status` shape: ` D apps/wbs/fe-01/src/lib/theme.test.ts` and `??
apps/wbs/fe-01/src/lib/theme.test.tsx`), `apps/wbs/fe-01/src/index-bootstrap.test.ts`,
`apps/wbs/fe-01/src/app.test.tsx`, `apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx`.

- [ ] **Red, on the unchanged tree — two different reds, rehearsed separately, neither
      skipped.** `mv apps/wbs/fe-01/src/lib/theme.test.ts
apps/wbs/fe-01/src/lib/theme.test.tsx`, then apply the test-file diffs from
      sections 7.2, 7.3, 7.4 and 7.5 (not yet 7.1, `theme.ts` itself) against `theme.ts`
      as it stands on `276c1e36`.
      **First, the type-check red — the one that actually matters**, per the batch-3
      brief's "a slice that moves or re-declares a type runs the type check in that same
      slice":
      `sh
      NX_DAEMON=false bunx nx run wbs-fe-01:typecheck \
  > "$TMPDIR/evidence/slice2-red-typecheck.log" 2>&1
  status=$?
  > echo "exit=$status" >> "$TMPDIR/evidence/slice2-red-typecheck.log"
  > test "$status" -eq 1
  > `    Expected and observed: exit 1,`Found 8 errors in 2 files`—`TS2554: Expected 0
  > arguments, but got 1` at every parameterised call site
(`index-bootstrap.test.ts:125`, `theme.test.tsx:87,93,99,106,120`) plus `TS2724:
  > '"./theme"' has no exported member named 'isThemeChoice'` (`theme.test.tsx:13`).
**Second, and separately: `bunx vitest run`itself does not fail to start.**
Vitest's own transform is esbuild, which strips types without checking arity, so
the unmodified zero-argument`rememberedTheme()`/`readTheme()`silently ignore the
extra argument every parameterised test call now passes and keep reading the old
module-load`storedChoice`— every test whose assertion does not depend on the
_mechanism_ (only on the bytes already in`localStorage`, which the old and new
stores agree on per `composition-agreement.test.ts`'s own point) still passes.
Rehearsed and observed: `(cd apps/wbs/fe-01 && bunx vitest run src/lib/theme.test.tsx
  > src/index-bootstrap.test.ts src/app.test.tsx
  > src/components/chrome/account-menu.test.tsx)`on that same tree reports`Test Files
  > 1 failed | 3 passed (4)`, `Tests 1 failed | 59 passed (60)` — the **one** failure
is the new "degrades to system, reads and writes nothing, and never throws when
never live" case (`AssertionError: expected '"dark"' to be null`, the choice
written to real `localStorage`because the unedited`useTheme`never reads
 `useApplicationServicesState()` at all), not a wholesale red. **The type-check red
  > is the one this slice actually depends on; the vitest red is real but narrow, and
  > is recorded exactly as observed rather than overstated as "does not even start."**
- [ ] Apply the `theme.ts` diff (section 7.1).
- [ ] **Green:**
      `sh
      (cd apps/wbs/fe-01 && bunx vitest run \
      src/lib/theme.test.tsx src/index-bootstrap.test.ts src/app.test.tsx \
      src/components/chrome/account-menu.test.tsx) \
  > "$TMPDIR/evidence/slice2-green.log" 2>&1
  status=$?
  > echo "exit=$status" >> "$TMPDIR/evidence/slice2-green.log"
  > test "$status" -eq 0
  > `    Expected and observed: exit 0,`Test Files 4 passed (4)`, `Tests 64 passed (64)`    (22 in`theme.test.tsx`+ 15 in`index-bootstrap.test.ts`+ 7 in`app.test.tsx`+
20 in`account-menu.test.tsx`).
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0 — observed.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0 — observed, after one
      autofixable import-order finding on `theme.test.tsx` (`bunx eslint
apps/wbs/fe-01/src/lib/theme.test.tsx --fix`, per addendum's "an autofixable
      import-order or prettier lint error is fixed with `bunx eslint --fix`, not a
      stop") and one manual fix: the anonymous arrow-function component the wrapper
      helper returned needed a name (`react/display-name`) — replaced with a named
      `function Wrapper(...)`.
- [ ] The sandbox baseline from step 0, re-run: unchanged, 46 files / 674 tests, exit 0
      — this slice touches no node-tier file.
- [ ] The four negative proofs (section 8): mutate each of the four independently-named
      guards in turn; rerun the exact focused command section 8's own table names; observe
      the exact failure recorded there; restore each with `cp` from a pre-mutation copy;
      `cmp` byte-identical; rerun the whole slice-2 green command to confirm the restore
      is complete, not only the one test.

Hand over, seven paths: ` D apps/wbs/fe-01/src/lib/theme.test.ts`, `??
apps/wbs/fe-01/src/lib/theme.test.tsx`, and ` M` on `theme.ts`, `index-bootstrap.test.ts`,
`app.test.tsx`, `account-menu.test.tsx`, plus this packet's own plan document with a
leading ` M` (a concurrent planner revision, explicitly permitted).

### Slice 3 — `composition.ts`'s doc comment, the OpenSpec diffs, and hand-over

Subject: `docs(fe-01,openspec): record theme.ts's move off the staged preferences duplicate`

Owned paths: `apps/wbs/fe-01/src/modules/preferences/composition.ts`,
`openspec/changes/adopt-frontend-lifetimes/tasks.md`,
`openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`,
`openspec/changes/adopt-frontend-lifetimes/verify.md`.

- [ ] Apply the diff in section 7.6 (`composition.ts`). No test changes —
      `composition-agreement.test.ts` is unmodified and still passes unchanged (it tests
      `ganttDetail`, a site this packet does not move).
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0 (doc-only change; this
      step exists to catch an accidental JSDoc syntax error, not a real risk here) —
      observed.
- [ ] `(cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences)`: unchanged count
      from this slice's own step 0 sandbox baseline's own preferences subset.
- [ ] **Apply the OpenSpec diffs (sections 7.7, 7.8) and validate them for real, in this
      rehearsal, before deciding whether the real tree keeps them:**
      `sh
      OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
      > "$TMPDIR/evidence/slice3-openspec-baseline.json" 2>&1
    status=$?
      test "$status" -eq 0
    python3 -c "import json,sys; d=json.load(open('$TMPDIR/evidence/slice3-openspec-baseline.json')); t=d['summary']['totals']; assert t['failed']==0, t; print(t)"
  # apply the tasks.md and spec.md diffs here, then:
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
  > "$TMPDIR/evidence/slice3-openspec-after.json" 2>&1
    status=$?
  > test "$status" -eq 0
    python3 -c "import json,sys; d=json.load(open('$TMPDIR/evidence/slice3-openspec-after.json')); t=d['summary']['totals']; assert t['failed']==0, t; print(t)"
  > `    Expected and observed: both runs report`{"items": 114, "passed": 114, "failed":
  > 0}` — the fresh count this rehearsal took, not an assumed constant (section 3.5).
**This packet's own author then reverts both OpenSpec files** (`git checkout
  > 276c1e36 -- openspec/changes/adopt-frontend-lifetimes/tasks.md
  > openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`)
so only the packet document differs from `276c1e36` at hand-over (section 10) —
  > their diffs are prescribed for a later apply-change step (section 7.7, 7.8), not
  > landed here. A fresh executor given this slice applies them and leaves them
  > applied instead, per the file plan (section 5); this packet's own rehearsal
  > reverts them only because its own hand-over inventory is scoped to the packet
  > document alone.
- [ ] Append the `verify.md` diff (section 7.9) — for the same later apply-change step,
      not applied by this packet's own author for the same reason.
- [ ] `GSETTINGS_BACKEND=memory bunx prettier --write
docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md` then
      `--check`, twice.
- [ ] **Planner-only**, run by this packet's own author directly: `NX_DAEMON=false
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit` and
      `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
wbs-fe-01:test`, and `tool-devsync:test` with this packet staged. Expected and
      observed values are in section 9.

Hand over: all of slice 2's paths plus `composition.ts`, `M`, and the plan document,
`M`. Nothing else differs from `276c1e36` — `openspec/changes/...tasks.md` and
`...spec.md` are reverted to `276c1e36`'s own content before this slice's own hand-over,
per the bullet above.

## 7. The code

Every diff below is `git diff`'s own machine-generated output against `276c1e36`,
pasted verbatim — none of them was hand-assembled or edited after generation. Section 9
records the literal `git apply --check` output for each, run against the extracted
fenced text of this exact document, in slice order, after a filesystem `mv`.

### 7.1 `apps/wbs/fe-01/src/lib/theme.ts`

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.ts b/apps/wbs/fe-01/src/lib/theme.ts
index 8b67409d..ba9538b7 100644
--- a/apps/wbs/fe-01/src/lib/theme.ts
+++ b/apps/wbs/fe-01/src/lib/theme.ts
@@ -10,8 +10,9 @@ import {
   useState,
 } from 'react';

-import { rememberedPreferences } from '@/modules/preferences/composition';
+import type { Remembered } from '@/modules/preferences/contract';
 import { THEME_KEY } from '@/modules/preferences/preference-keys';
+import { useApplicationServicesState } from '@/runtime/application-services-context';

 /**
  * What a reader has asked for, which is not the same as what is painted.
@@ -44,22 +45,30 @@ export const DARK_QUERY = '(prefers-color-scheme: dark)';
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
+ * Takes its store rather than closing over a module-load singleton: {@link
+ * useTheme} is this file's one caller inside a render tree, and it builds the
+ * store from {@link useApplicationServicesState} on every relevant render
+ * instead — a module-scope binding here would be built at import time, before
+ * any runtime exists, exactly the hazard `remembered-layout.ts`'s
+ * `storedMermaidSectionMode` is in (see
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md`
+ * section 4).
  *
- * The stored value is a claim, not a fact, and {@link remembered} is where that
+ * The stored value is a claim, not a fact, and {@link Remembered} is where that
  * is dealt with for every key this app holds: anything that is not one of the
  * three takes the key with it and the answer goes back to `system`.
  */
-export function rememberedTheme(): ThemeChoice {
+export function rememberedTheme(themeStore: Remembered<ThemeChoice>): ThemeChoice {
   // Proof: `readAndDrop` replaced by `read`, which is what "read the claim,
   // drop nothing" comes to. `refuses a stored answer that is not one of the
   // three, and drops the key` failed on `expected '"midnight"' to be null` —
@@ -68,7 +77,7 @@ export function rememberedTheme(): ThemeChoice {
   // Proof: the shared refusal drop made a no-op failed three resource cases,
   // including `a read that drops removes the refused key; a plain read writes
   // nothing`, on `expected '"midnight"' to be undefined`. Observed 2026-09-20.
-  return storedChoice.readAndDrop() ?? 'system';
+  return themeStore.readAndDrop() ?? 'system';
 }

 /**
@@ -87,13 +96,13 @@ export function rememberedTheme(): ThemeChoice {
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
@@ -143,12 +152,26 @@ export function paintPalette(palette: Palette): void {
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
+   * exactly as long as the application services are `withdrawn`: nothing here
+   * reads or writes a store, `choice` is the in-tree `'system'` default, and a
+   * write `chooseTheme` is asked to make updates only the tree, never storage.
+   * The explicit, visible degradation R5 asks for — see this file's own
+   * revision note in
+   * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md`
+   * section 4 for why a silently-accepted, unpersisted choice is misleading.
+   */
+  persists: boolean;
 }

 /**
@@ -158,6 +181,53 @@ export interface Theme {
  * signed in — so the sign-in form is painted the same as the plan behind it,
  * and a remembered dark page does not go white the moment somebody signs out.
  *
+ * **Reads its store off {@link useApplicationServicesState}, this file's one
+ * hook boundary** — rule K2's rule for React: a component or a hook takes the
+ * runtime's `remembered`, never a module-load duplicate. Memoised by the
+ * context's own `remembered` reference (stable while the runtime is `live`,
+ * and equal-by-reference again if a later runtime replaces this one while the
+ * provider stays mounted — `application-services-context.tsx`'s own JSDoc),
+ * so the store passed to {@link rememberedTheme} and {@link rememberTheme}
+ * below is rebuilt only when the runtime actually changes, not on every
+ * render — `themeChoice` itself builds a fresh, stateless closure per call
+ * (`preferences.feature.ts`).
+ *
+ * **Three transitions this hook follows explicitly, each with its own named
+ * test in `theme.test.tsx`, not merely asserted in prose:**
+ *
+ * 1. **Withdrawal, while mounted.** The one `useEffect` below (not only the
+ *    lazy initialiser) reruns whenever the memoised store changes; going from
+ *    a store to `null` resets `choice` to `'system'` and `persists` to
+ *    `false` — matching {@link readTheme}'s own "never said" default, exactly
+ *    as promised, rather than leaving whatever palette was last painted.
+ * 2. **Reactivation, while mounted.** The same effect going from `null` (or
+ *    an old store) to a new one re-reads that store's own persisted answer —
+ *    a mounted hook that first saw `withdrawn` and later receives a `live`
+ *    runtime adopts that runtime's saved choice, rather than staying on
+ *    `'system'` forever.
+ * 3. **A write racing withdrawal.** `chooseTheme`'s own closure can still
+ *    hold a store that was live when this hook last rendered but has gone
+ *    withdrawn since — `application-services-context.tsx`'s own JSDoc: a
+ *    slot's `retire()`/`replace()` withdraw publication **synchronously**,
+ *    while the subscriber notification that would rebuild this closured store
+ *    is deferred to a microtask. `rememberTheme`'s only failure mode through
+ *    that closured, now-stale store is `preferences.resource.ts`'s own
+ *    `ensureLive` refusal; `chooseTheme` catches exactly that outcome and
+ *    degrades to a local-only choice with `persists: false`, rather than
+ *    letting it escape as an uncaught error from a click handler — the same
+ *    "never throw for withdrawn" invariant every other consumer of these
+ *    services keeps.
+ *
+ * **What stays untested, deliberately narrowed rather than asserted:** this
+ * file only proves the three named transitions above through their own
+ * examples, not every interleaving `fast-check`'s scheduler could generate —
+ * unlike `lifetime-slot.ts`'s own state machine, `useTheme` owns no lock, no
+ * queue and no disposer of its own; it is a reader of a store that already
+ * proves its own generation-fenced ordering. A caller that needs interleaving
+ * coverage for a *new* piece of ownership state should look at
+ * `application-bootstrap.model.test.tsx`'s own generated-command property
+ * instead of adding one here.
+ *
  * `useState(readTheme)` — the lazy initialiser, not `useState(readTheme())` —
  * for `rememberedGanttHeight`'s reason: the second reads storage on every
  * render of every parent, and the first reads it once, before the first paint
@@ -167,25 +237,63 @@ export interface Theme {
  * {@link readTheme} and not {@link rememberedTheme}, because the initialiser is
  * a render: dropping an unreadable key is a write, StrictMode calls this twice
  * on purpose, and the rule against a side effect in a function React may call
- * twice is the one `chooseTheme` states at the bottom of this file. The drop
- * happens in the mount effect below instead. Nothing on screen moved either
- * way — see {@link readTheme}.
+ * twice is the one `chooseTheme` states below. The drop happens in the mount
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
+   * on withdrawal (transition 1 above), and on reactivation (transition 2).
    *
-   * The write half of {@link rememberedTheme}, moved out of the initialiser
-   * above. Its return value is the same answer `readTheme` already gave — the
-   * state is not re-seeded from it, because between the two calls nothing but
-   * this line can have written the key.
+   * {@link rememberedTheme} rather than {@link readTheme} on the live branch:
+   * the write half of the drop, moved out of the initialiser above, exactly as
+   * it was before this hook read the runtime's own store. Its return value —
+   * the same answer a plain read would give, once the drop has run — reseeds
+   * `choice` directly, which is what makes reactivation adopt a newer store's
+   * own saved answer rather than whatever this hook's `choice` last held.
    */
   useEffect(() => {
-    rememberedTheme();
-  }, []);
+    if (themeStore) {
+      // Proof: on 2026-09-23, disabling this branch (`if (false)`, with
+      // `setChoice`/`setPersists` left dead below it) failed 'adopts a later
+      // live store's own saved choice once one is published' on `expected
+      // 'system' to be 'dark'` — a hook mounted below a slot that had never
+      // published, then given a live runtime, stayed on the initial default
+      // forever instead of reading the newly published store.
+      setChoice(rememberedTheme(themeStore));
+      setPersists(true);
+    } else {
+      // Proof: on 2026-09-23, dropping this branch entirely (leaving
+      // `choice`/`persists` unchanged when `themeStore` becomes `null`)
+      // failed 'resets to system and stops persisting once the runtime is
+      // withdrawn, without waiting for disposal' on `expected 'dark' to be
+      // 'system'` — the palette stayed on the withdrawn runtime's last
+      // choice instead of the documented default.
+      setChoice('system');
+      setPersists(false);
+    }
+  }, [themeStore]);

   /**
    * Follows the machine while the page is open.
@@ -217,15 +325,36 @@ export function useTheme(): Theme {
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
+      // Written here, beside the setter and outside it: a state updater React
+      // may call twice is no place for a side effect. `gantt-panel.tsx`'s
+      // arrows switch makes the same bargain for the same reason.
+      setChoice(next);
+      if (!themeStore) {
+        setPersists(false);
+        return;
+      }
+      try {
+        rememberTheme(themeStore, next);
+        setPersists(true);
+      } catch {
+        // Proof: on 2026-09-23, removing this `try`/`catch` (calling
+        // `rememberTheme` bare) failed 'does not throw when the closured
+        // store goes withdrawn between renders, and settles on the withdrawn
+        // state': the `act(() => chooseTheme('dark'))` call itself threw
+        // `Error: the page withdrew this preference store before the access
+        // completed` — `preferences.resource.ts`'s own withdrawn refusal,
+        // reachable because this closure's `themeStore` was captured live,
+        // one render before the slot's own synchronous withdrawal (see this
+        // function's own third transition, above).
+        setPersists(false);
+      }
+    },
+    [themeStore],
+  );

-  return { choice, palette, chooseTheme };
+  return { choice, palette, chooseTheme, persists };
 }

 /**
@@ -244,6 +373,8 @@ export function useTheme(): Theme {
 export interface ThemeContextValue {
   choice: ThemeChoice;
   chooseTheme: (choice: ThemeChoice) => void;
+  /** See {@link Theme.persists}. Not yet read by any consumer below this provider. */
+  persists: boolean;
 }

 const ThemeContext = createContext<ThemeContextValue | null>(null);
@@ -254,8 +385,11 @@ const ThemeContext = createContext<ThemeContextValue | null>(null);
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
path) and this revision's own final content — every line is real, none abbreviated or
represented by a prose placeholder.

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.test.tsx b/apps/wbs/fe-01/src/lib/theme.test.tsx
index 9ee795e..971393d 100644
--- a/apps/wbs/fe-01/src/lib/theme.test.tsx
+++ b/apps/wbs/fe-01/src/lib/theme.test.tsx
@@ -1,16 +1,27 @@
 import { act, cleanup, renderHook } from '@testing-library/react';
+import type { ReactNode } from 'react';
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
   THEME_KEY,
+  type ThemeChoice,
   useTheme,
 } from './theme';

@@ -37,12 +48,55 @@ afterEach(() => {
 });

 /**
- * The setting behind the theme control: three answers, one of which is "ask the
- * machine".
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
+/**
+ * A slot `live` over the production installer, with its own liveness
+ * predicate wired exactly as `acquireApplicationRuntime` wires the real one
+ * (`application-runtime.ts`'s own `() => applicationSlot.snapshot().status ===
+ * 'live'`) — not `installApplicationRuntime()` bare, whose default `isLive`
+ * (`application-runtime.ts:111`) is always `true` and so could never
+ * reproduce a withdrawn write. `store` defaults to a fresh in-memory fake, not
+ * real `localStorage`, so a test can tell the runtime's own store apart from
+ * `composition.ts`'s module-load singleton, which always wraps the real one.
  *
- * Watched failures for every test here are in
- * `openspec/changes/dark-mode/verify.md`.
+ * Retired by the caller — every test below either awaits `slot.retire()` or
+ * lets a replacement supersede it before the test ends.
  */
+function liveSlot(
+  store = fakeBrowserStorage(),
+): { slot: LifetimeSlot<ApplicationServices>; store: ReturnType<typeof fakeBrowserStorage> } {
+  const slot = createLifetimeSlot<ApplicationServices>(50);
+  void slot.replace(() =>
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
 describe('what the theme setting resolves to', () => {
   itDom('follows the machine, both ways, while the choice is system', () => {
     expect(paletteFor('system', true)).toBe('dark');
@@ -58,31 +112,39 @@ describe('what the theme setting resolves to', () => {
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
@@ -92,7 +154,9 @@ describe('what this browser remembers', () => {
     // Watched on h2puni under vitest, 2026-08-12.
     localStorage.setItem(THEME_KEY, JSON.stringify('midnight'));

-    expect(readTheme()).toBe('system');
+    await withThemeStore((themeStore) => {
+      expect(readTheme(themeStore)).toBe('system');
+    });
     expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('midnight'));
   });
 });
@@ -120,50 +184,78 @@ describe('what the theme puts on the document', () => {
 });

 describe('the theme, followed and remembered while the app is open', () => {
-  itDom('opens on the answer this browser last gave, without a paint in between', () => {
+  itDom('opens on the answer this browser last gave, without a paint in between', async () => {
     localStorage.setItem(THEME_KEY, JSON.stringify('dark'));
+    const { slot } = liveSlot(fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }));
+    await act(async () => {
+      await Promise.resolve();
+    });

-    const held = renderHook(() => useTheme());
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

     expect(held.result.current.choice).toBe('dark');
     expect(held.result.current.palette).toBe('dark');
+    expect(held.result.current.persists).toBe(true);
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
+
+    await slot.retire();
   });

-  itDom('drops an answer it cannot read, from an effect rather than from a render', () => {
-    localStorage.setItem(THEME_KEY, JSON.stringify('midnight'));
+  itDom('drops an answer it cannot read, from an effect rather than from a render', async () => {
+    const { slot } = liveSlot(fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('midnight') }));
+    await act(async () => {
+      await Promise.resolve();
+    });

-    const held = renderHook(() => useTheme());
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

     // The behaviour is unchanged by the move — a corrupt key is gone by the
     // time the hook has mounted, which is all a reader could ever have seen.
     expect(held.result.current.choice).toBe('system');
-    expect(localStorage.getItem(THEME_KEY)).toBeNull();
+
+    await slot.retire();
   });

-  itDom('opens on the machine’s own answer where nothing was ever chosen', () => {
+  itDom('opens on the machine’s own answer where nothing was ever chosen', async () => {
     platform().setMatches(true);
+    const { slot } = liveSlot();
+    await act(async () => {
+      await Promise.resolve();
+    });

-    const held = renderHook(() => useTheme());
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

     expect(held.result.current.choice).toBe('system');
     expect(held.result.current.palette).toBe('dark');
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
+
+    await slot.retire();
   });

-  itDom('writes the answer down as it is chosen, and paints it', () => {
-    const held = renderHook(() => useTheme());
+  itDom('writes the answer down as it is chosen, and paints it', async () => {
+    const { slot, store } = liveSlot();
+    await act(async () => {
+      await Promise.resolve();
+    });
+
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });

     act(() => {
       held.result.current.chooseTheme('dark');
     });

-    expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('dark'));
+    expect(store.held()[THEME_KEY]).toBe(JSON.stringify('dark'));
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
+
+    await slot.retire();
   });

-  itDom('follows the machine changing under it while the choice is system', () => {
-    const held = renderHook(() => useTheme());
+  itDom('follows the machine changing under it while the choice is system', async () => {
+    const { slot } = liveSlot();
+    await act(async () => {
+      await Promise.resolve();
+    });
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);

     act(() => {
@@ -172,10 +264,16 @@ describe('the theme, followed and remembered while the app is open', () => {

     expect(held.result.current.palette).toBe('dark');
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
+
+    await slot.retire();
   });

-  itDom('leaves a chosen palette where it is when the machine changes under it', () => {
-    const held = renderHook(() => useTheme());
+  itDom('leaves a chosen palette where it is when the machine changes under it', async () => {
+    const { slot } = liveSlot();
+    await act(async () => {
+      await Promise.resolve();
+    });
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
     act(() => {
       held.result.current.chooseTheme('light');
     });
@@ -186,11 +284,17 @@ describe('the theme, followed and remembered while the app is open', () => {

     expect(held.result.current.palette).toBe('light');
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
+
+    await slot.retire();
   });

-  itDom('goes back to the machine’s answer when system is chosen again', () => {
+  itDom('goes back to the machine’s answer when system is chosen again', async () => {
     platform().setMatches(true);
-    const held = renderHook(() => useTheme());
+    const { slot } = liveSlot();
+    await act(async () => {
+      await Promise.resolve();
+    });
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
     act(() => {
       held.result.current.chooseTheme('light');
     });
@@ -202,9 +306,11 @@ describe('the theme, followed and remembered while the app is open', () => {

     expect(held.result.current.palette).toBe('dark');
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
+
+    await slot.retire();
   });

-  itDom('stops listening to the machine once it is gone', () => {
+  itDom('stops listening to the machine once it is gone', async () => {
     // **The class cannot answer this and the listener count can.** This test
     // asserted only the third block below, and it could not fail: `paintPalette`
     // runs from a `useEffect`, React runs no effect for an unmounted hook, so
@@ -224,7 +330,11 @@ describe('the theme, followed and remembered while the app is open', () => {
     // asserted is the *difference* one mount and one unmount make.
     const before = platform().listenerCount;

-    const held = renderHook(() => useTheme());
+    const { slot } = liveSlot();
+    await act(async () => {
+      await Promise.resolve();
+    });
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
     expect(platform().listenerCount, 'the hook never subscribed at all').toBe(before + 1);

     held.unmount();
@@ -245,5 +355,174 @@ describe('the theme, followed and remembered while the app is open', () => {
     // — it is what a reader would see — rather than as the proof, which is the
     // count above.
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
+
+    await slot.retire();
+  });
+});
+
+describe('the theme when the application services are withdrawn or transitioning', () => {
+  /**
+   * Transition 1 (`theme.ts`'s own JSDoc): a mounted hook, live, goes
+   * withdrawn. `choice`/`persists` must reset to the documented default —
+   * not stay on the last-painted palette, which the JSDoc promised and the
+   * pre-revision code did not do.
+   *
+   * Proof: on 2026-09-23, dropping the `else` branch of the resync effect (so
+   * `choice`/`persists` are left unchanged when `themeStore` becomes `null`)
+   * failed this case: `expected 'dark' to be 'system'`.
+   */
+  itDom(
+    'resets to system and stops persisting once the runtime is withdrawn, without waiting for disposal',
+    async () => {
+      const { slot } = liveSlot(fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }));
+      await act(async () => {
+        await Promise.resolve();
+      });
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
+   * Proof: on 2026-09-23, reading `themeStore` only inside the `useState`
+   * lazy initialiser (the pre-revision shape, with no resync effect) failed
+   * this case: `expected 'system' to be 'dark'`.
+   */
+  itDom('adopts a later live store’s own saved choice once one is published', async () => {
+    const empty = createLifetimeSlot<ApplicationServices>(50);
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
+
+    await empty.retire();
+  });
+
+  /**
+   * Transition 3: `chooseTheme`'s own closure can still hold a store that
+   * was live when this hook last rendered but has gone withdrawn since —
+   * reachable in the window `retire()`'s synchronous withdrawal opens before
+   * React's deferred notification re-renders this hook and rebuilds
+   * `chooseTheme` over a fresh, `null` store. The call must not throw; the
+   * state it and the subsequent resync effect leave behind, once React has
+   * fully caught up, is the same `system`/non-persisting state the plain
+   * withdrawal transition (above) already produces — this closure's own
+   * optimistic `setChoice('dark')` is real but transient, superseded by the
+   * resync effect the instant `themeStore` itself recomputes to `null`.
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
+      const { slot, store } = liveSlot();
+      await act(async () => {
+        await Promise.resolve();
+      });
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
+   * Not a lifecycle transition, but the invariant the whole move is for: a
+   * live write lands in the runtime's own injected store, never in
+   * `composition.ts`'s module-load singleton, which always wraps real
+   * `localStorage` regardless of what a test injects here.
+   */
+  itDom(
+    'reads and writes the runtime’s own injected store, never the staged composition.ts singleton',
+    async () => {
+      const { slot, store } = liveSlot();
+      await act(async () => {
+        await Promise.resolve();
+      });
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
+
+      await slot.retire();
+    },
+  );
+
+  /**
+   * The invariant every consumer of these services keeps: mounting below a
+   * slot that has never published anything renders `withdrawn` correctly —
+   * `'system'`, not persisting — and never throws.
+   */
+  itDom('degrades to system, reads and writes nothing, and never throws when never live', () => {
+    const empty = createLifetimeSlot<ApplicationServices>(50);
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
   });
 });
```

### 7.3 `apps/wbs/fe-01/src/index-bootstrap.test.ts`

```diff
diff --git a/apps/wbs/fe-01/src/index-bootstrap.test.ts b/apps/wbs/fe-01/src/index-bootstrap.test.ts
index ff3d2fb0..ebbf7397 100644
--- a/apps/wbs/fe-01/src/index-bootstrap.test.ts
+++ b/apps/wbs/fe-01/src/index-bootstrap.test.ts
@@ -5,7 +5,8 @@ import { fileURLToPath } from 'node:url';
 import { beforeEach, describe, expect, it } from 'vitest';

 import type { DriveableMediaQueryList } from '../vitest.setup';
-import { DARK_CLASS, DARK_QUERY, paletteFor, rememberedTheme, THEME_KEY } from './lib/theme';
+import { DARK_CLASS, DARK_QUERY, isThemeChoice, paletteFor, rememberedTheme, THEME_KEY } from './lib/theme';
+import { installApplicationRuntime } from './runtime/application-runtime';

 // fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
 const hasDom = typeof document !== 'undefined';
@@ -109,7 +110,7 @@ describe('the palette applied before the first paint', () => {
     for (const machineIsDark of [false, true]) {
       itDom(
         `agrees with the module: stored ${stored ?? '(nothing)'}, machine ${machineIsDark ? 'dark' : 'light'}`,
-        () => {
+        async () => {
           if (stored !== null) localStorage.setItem(THEME_KEY, stored);
           platform().setMatches(machineIsDark);

@@ -118,8 +119,16 @@ describe('the palette applied before the first paint', () => {
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
index 0bdfd43c..5dddaf61 100644
--- a/apps/wbs/fe-01/src/app.test.tsx
+++ b/apps/wbs/fe-01/src/app.test.tsx
@@ -2,6 +2,13 @@ import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/re
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import type * as Api from '@/lib/api';
+import { browserStorage } from '@/modules/preferences/browser-storage.repository';
+import {
+  type ApplicationServices,
+  installApplicationRuntime,
+} from '@/runtime/application-runtime';
+import { ApplicationServicesProvider } from '@/runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';

 // fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
 const hasDom = typeof document !== 'undefined';
@@ -16,13 +23,34 @@ vi.mock('@/lib/api', async (importOriginal) => ({

 const { App } = await import('./app');

+/**
+ * A slot `live` over the production installer, its liveness predicate wired
+ * exactly as `acquireApplicationRuntime` wires the real one
+ * (`application-runtime.ts`'s own `() => applicationSlot.snapshot().status ===
+ * 'live'`), rebuilt fresh every test and retired in `afterEach`, after React
+ * cleanup.
+ *
+ * `<App/>`'s own tree includes `ThemeProvider`, which now reads
+ * `useApplicationServicesState()` (see `theme.ts`) — the describe block
+ * "the theme control through the app" persists a choice across an unmount and
+ * a fresh mount, which needs a real, live store behind it.
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
@@ -32,10 +60,19 @@ beforeEach(() => {
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
@@ -44,7 +81,7 @@ afterEach(() => {

 describe('the app root', () => {
   itDom('shows the sign-in link when there is no browser session', async () => {
-    render(<App />);
+    renderApp();

     // The boundary is transparent when nothing throws: the app it wraps is
     // what renders, and this is what says so.
@@ -63,7 +100,7 @@ describe('the app root', () => {
       headers: new Headers(),
     });

-    render(<App />);
+    renderApp();

     await waitFor(() => {
       expect(screen.getByRole('heading', { name: 'WBS tool v2' })).toBeDefined();
@@ -75,7 +112,7 @@ describe('the app root', () => {
   itDom('offers sign-in when the session check fails', async () => {
     me.mockRejectedValue(new Error('network down'));

-    render(<App />);
+    renderApp();

     await waitFor(() => {
       expect(screen.getByRole('link', { name: 'Continue with SSO' })).toBeDefined();
@@ -97,7 +134,7 @@ describe('a signed-in address asked for while signed out', () => {
   itDom('draws the sign-in form and no directory', async () => {
     window.history.replaceState({}, '', '/directory');

-    render(<App />);
+    renderApp();

     await waitFor(() => {
       expect(screen.getByRole('link', { name: 'Continue with SSO' })).toBeDefined();
@@ -136,7 +173,7 @@ describe('a signed-in address asked for while signed out', () => {
       }),
     );

-    render(<App />);
+    renderApp();

     // The page that was asked for, not the project — and the address it was
     // asked at, unrewritten.
@@ -186,7 +223,7 @@ describe('the theme control through the app', () => {

   itDom('reports the answer just chosen, and only that one, without a reload', async () => {
     signedIn();
-    render(<App />);
+    renderApp();
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
     });
@@ -205,7 +242,7 @@ describe('the theme control through the app', () => {
   itDom('reports the answer that was chosen, and only that one, after a reload', async () => {
     signedIn();
     for (const answer of ['System', 'Light', 'Dark']) {
-      const first = render(<App />);
+      const first = renderApp();
       await waitFor(() => {
         expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
       });
@@ -214,7 +251,7 @@ describe('the theme control through the app', () => {
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
index 8b316d76..c0c0d14d 100644
--- a/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx
@@ -1,7 +1,14 @@
 import { fireEvent, render, screen, within } from '@testing-library/react';
-import { describe, expect, it, vi } from 'vitest';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import { DARK_CLASS, THEME_KEY, useTheme } from '@/lib/theme';
+import { browserStorage } from '@/modules/preferences/browser-storage.repository';
+import {
+  type ApplicationServices,
+  installApplicationRuntime,
+} from '@/runtime/application-runtime';
+import { ApplicationServicesProvider } from '@/runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';

 import { AccountMenu, type AccountMenuProps } from './account-menu';

@@ -288,9 +295,40 @@ function ThemeHarness() {
 describe('the theme control, wired to the hook that owns it', () => {
   const answers = ['System', 'Light', 'Dark'] as const;

-  beforeEach(() => {
+  /**
+   * A slot `live` over the production installer, its liveness predicate
+   * wired exactly as `acquireApplicationRuntime` wires the real one — not
+   * `installApplicationRuntime()` bare, whose default `isLive`
+   * (`application-runtime.ts:111`) is always `true`. Rebuilt fresh every
+   * test and retired in `afterEach`, after React cleanup: {@link
+   * ThemeHarness} calls `useTheme`, which now reads
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
@@ -301,7 +339,7 @@ describe('the theme control, wired to the hook that owns it', () => {
     screen.getByRole('menuitemradio', { name }).getAttribute('aria-checked') ?? '';

   itDom('reports the answer just chosen, for every answer, and only that one', () => {
-    render(<ThemeHarness />);
+    renderHarness();
     open();

     for (const answer of answers) {
@@ -316,14 +354,14 @@ describe('the theme control, wired to the hook that owns it', () => {

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

### 7.6 `apps/wbs/fe-01/src/modules/preferences/composition.ts`

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

### 7.7 `openspec/changes/adopt-frontend-lifetimes/tasks.md`, for a later apply-change step — not applied by this packet's own author at hand-over

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

### 7.8 `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`, for the same later apply-change step

Validated in this rehearsal (section 9): `OPENSPEC_TELEMETRY=0 bunx
@fission-ai/openspec@1.12.0 validate --all --json` reports `{"items": 114, "passed":
114, "failed": 0}` with this diff applied, the same fresh count as without it (section
3.5) — the new requirement's own scenario headings satisfy the schema's normative-sentence
requirement without changing the item count, which is per-requirement/per-spec, not
per-scenario.

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 9c22737f..7b9873f9 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -162,6 +162,35 @@ unaffected by the retirement of a previous one.
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
 ### Requirement: Log out stays a local exit

 The Log out action SHALL send no request to the server and SHALL retire the
```

### 7.9 `openspec/changes/adopt-frontend-lifetimes/verify.md`, for the same later apply-change step

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/verify.md b/openspec/changes/adopt-frontend-lifetimes/verify.md
index 73df5486..11e71c41 100644
--- a/openspec/changes/adopt-frontend-lifetimes/verify.md
+++ b/openspec/changes/adopt-frontend-lifetimes/verify.md
@@ -871,3 +871,73 @@ observed faults.
   `wbs-fe-01:test:unit`, `wbs-fe-01:test`, the opt-in Chromium case, and the
   host gate remain pending planner verification under the executor sandbox
   contract.
+
+## Packet 050.7f — delivery call sites, `lib/theme.ts` onto the runtime
+
+Rehearsed and verified directly by this packet's own author, on the private worktree
+`/home/df/wd/puni/batch-6-plan-050-7-f`, not dispatched to a separate executor agent —
+every command below was actually run and its output recorded here as observed, never
+predicted.
+
+### Slice 2 — `theme.ts` and its five test files
+
+- Pre-edit sandbox baseline (`vitest.node.config.ts`, excluding
+  `playwright-config.test.ts` and `src/components/wbs/short-date.test.ts`): 46 files,
+  674 tests, exit 0.
+- Red 1 (type check, on the tree with only the four test files edited): exit 1, `Found 8
+  errors in 2 files` — `TS2554: Expected 0 arguments, but got 1` at
+  `index-bootstrap.test.ts:125` and `theme.test.tsx:87,93,99,106,120`; `TS2724:
+  '"./theme"' has no exported member named 'isThemeChoice'` at `theme.test.tsx:13`.
+- Red 2 (`bunx vitest run` on the same tree, recorded as observed rather than assumed to
+  fail outright): exit 1, `Test Files 1 failed | 3 passed (4)`, `Tests 1 failed | 59
+  passed (60)` — only the new withdrawn-degrade example failed.
+- Green (after applying `theme.ts`'s own diff): exit 0, `Test Files 4 passed (4)`,
+  `Tests 64 passed (64)` (22 + 15 + 7 + 20).
+- Post-edit sandbox baseline: unchanged, 46 files, 674 tests, exit 0.
+- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0.
+- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0, after one `eslint --fix`
+  (import order in `theme.test.tsx`) and one manual fix (`react/display-name` on the
+  test-only provider wrapper, given a name).
+
+### Negative-proof observations
+
+Every fault below was rehearsed on the real file, observed, restored with `cp` from a
+pre-mutation copy, `cmp`-verified byte-identical, then rerun green.
+
+| Fault                                                                 | Observed failure                                                                                                                     |
+| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
+| Lazy `useState` initialiser made unconditional (`readTheme(themeStore as Remembered<ThemeChoice>)`) | `TypeError: Cannot read properties of null (reading 'read')` at `theme.ts`'s own `readTheme`, thrown from the hook's first render; `Test Files 1 failed (1)`, `Tests 1 failed \| 21 skipped (22)`. |
+| Resync effect's live branch disabled (`if (false)`)                      | `expected 'system' to be 'dark'` on "adopts a later live store's own saved choice once one is published"; `1 failed \| 21 skipped (22)`. |
+| Resync effect's withdrawn branch (the `else`) removed                    | `expected 'dark' to be 'system'` on "resets to system and stops persisting once the runtime is withdrawn, without waiting for disposal"; `1 failed \| 21 skipped (22)`. |
+| `chooseTheme`'s `try`/`catch` around `rememberTheme` removed              | The `act(() => chooseTheme('dark'))` call itself threw `Error: the page withdrew this preference store before the access completed`, caught by `expect(...).not.toThrow()`; `1 failed \| 21 skipped (22)`. |
+
+The four adjacent production `Proof:` comments in `theme.ts` record only these observed
+faults, each with its own exact diagnostic.
+
+### Slice 3 — `composition.ts`'s doc comment, and the OpenSpec diffs
+
+- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` after `composition.ts`'s own diff:
+  exit 0.
+- `(cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences)`: unchanged from this
+  slice's own sandbox-baseline subset.
+- Strict OpenSpec validation, this rehearsal's own fresh baseline before the `tasks.md`/
+  `spec.md` diffs: exit 0, `{"items": 114, "passed": 114, "failed": 0}`. The same
+  command after both diffs: exit 0, `{"items": 114, "passed": 114, "failed": 0}` —
+  unchanged; both files were then reverted to `276c1e36`'s own content, per this
+  packet's own hand-over scope (section 10).
+- Prettier write over the one owned document: exit 0, unchanged on the second `--write`;
+  `--check` twice: both exit 0.
+- Planner-only, run directly by this packet's own author:
+  `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
+  wbs-fe-01:test:unit`: exit 0, `Test Files 48 passed (48)`, `Tests 697 passed (697)`,
+  unchanged from this packet's own recorded whole-node-tier count (section 3.5).
+  `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
+  wbs-fe-01:test`: exit 0, `8m 13s`. UTC pass: `Test Files 131 passed (131)`, `Tests
+  3000 passed (3000)`. Auckland zoned pass: `Test Files 2 passed (2)`, `Tests 3 passed
+  (3)`. Zero failures — the base whole-target total this packet derives (section 3.5) is
+  2995 (3000 minus this revision's own five new tests, all in `theme.test.tsx`), and no
+  file this packet did not already own moved.
+- `NX_DAEMON=false bunx nx run tool-devsync:test`, planner-only, run once with this
+  revision's own packet document staged: see this packet's own report for the observed
+  result (run after this file's own final `git add`, per the coordinator's own
+  instruction).
```

## 8. Proofs

Four new safety checks in `theme.ts` (the initialiser guard, the resync effect's two
branches, and the chooser's `try`/`catch`), each proved by its own independent mutation
and its own named, already-passing test — no mutation masks another, per this document's
own revision (section 14, Important 4).

| #   | Fault injected                                                                                                                                                                       | Location                                            | Named failing test                                                                                                                                                             | Observed diagnostic (2026-09-23)                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `themeStore ? readTheme(themeStore) : 'system'` replaced by `readTheme(themeStore as Remembered<ThemeChoice>)` in `useTheme`'s lazy `useState` initialiser                           | `theme.ts`, the line assigning `choice`/`setChoice` | `theme.test.tsx` › "the theme when the application services are withdrawn or transitioning" › "degrades to system, reads and writes nothing, and never throws when never live" | `TypeError: Cannot read properties of null (reading 'read')` at `theme.ts:100` (`readTheme`), reached from `theme.ts`'s own `useTheme` through React's `mountState`. `Test Files 1 failed (1)`, `Tests 1 failed \| 21 skipped (22)`.                                                                         |
| 2   | Resync effect's live branch disabled: `if (themeStore) { … }` replaced by `if (false) { … }` (dead `setChoice`/`setPersists` left below it)                                          | `theme.ts`, the effect keyed on `[themeStore]`      | `theme.test.tsx` › same describe › "adopts a later live store's own saved choice once one is published"                                                                        | `AssertionError: expected 'system' to be 'dark'`. `Tests 1 failed \| 21 skipped (22)`.                                                                                                                                                                                                                       |
| 3   | Resync effect's withdrawn branch removed: the `else { setChoice('system'); setPersists(false); }` deleted                                                                            | `theme.ts`, same effect                             | `theme.test.tsx` › same describe › "resets to system and stops persisting once the runtime is withdrawn, without waiting for disposal"                                         | `AssertionError: expected 'dark' to be 'system'`. `Tests 1 failed \| 21 skipped (22)`.                                                                                                                                                                                                                       |
| 4   | `chooseTheme`'s `try { rememberTheme(themeStore, next); setPersists(true); } catch { setPersists(false); }` replaced by a bare `rememberTheme(themeStore, next); setPersists(true);` | `theme.ts`, `chooseTheme`'s own `useCallback` body  | `theme.test.tsx` › same describe › "does not throw when the closured store goes withdrawn between renders, and settles on the withdrawn state"                                 | The `act(() => chooseTheme('dark'))` call inside `expect(() => { act(...) }).not.toThrow()` itself threw `Error: the page withdrew this preference store before the access completed` — the assertion reported it as the received value where `undefined` was expected. `Tests 1 failed \| 21 skipped (22)`. |

Every fault was restored from a `cp`-taken pre-mutation copy, verified `cmp`
byte-identical to the pre-mutation file, and the whole owned-path suite rerun green
(`Test Files 4 passed (4)`, `Tests 64 passed (64)`) before moving to the next mutation.

## 9. Verification

Commands actually run, in order, by this packet's own author directly (not inside an
executor sandbox), on `276c1e36` plus this revision's own working-tree edits:

- `GSETTINGS_BACKEND=memory bun install --frozen-lockfile`: exit 0.
- Sandbox baseline (`bunx vitest run --config vitest.node.config.ts --exclude
playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts`), before
  any edit: exit 0, `Test Files 46 passed (46)`, `Tests 674 passed (674)`.
- Red 1, type check on the four test files edited, `theme.ts` still unmodified: exit 1,
  `Found 8 errors in 2 files` (section 6, slice 2).
- Red 2, `bunx vitest run` on the same tree: exit 1, `Test Files 1 failed | 3 passed
(4)`, `Tests 1 failed | 59 passed (60)`.
- Green, after `theme.ts`'s own diff: `(cd apps/wbs/fe-01 && bunx vitest run
src/lib/theme.test.tsx src/index-bootstrap.test.ts src/app.test.tsx
src/components/chrome/account-menu.test.tsx)`: exit 0, `Test Files 4 passed (4)`,
  `Tests 64 passed (64)` — 22 + 15 + 7 + 20.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0, both before and after this
  revision's own edits (clean tree, then edited tree).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0, after the one autofix and one
  manual fix section 6 names.
- Sandbox baseline, re-run after this revision's own edits: unchanged, exit 0, `Test
Files 46 passed (46)`, `Tests 674 passed (674)`.
- The four negative proofs in section 8: observed exactly as recorded there, each
  restored and `cmp`-verified before the next.
- **`git apply --check`, on the nine fenced diffs extracted from this document's own
  final, Prettier-formatted text** (not this packet's own scratch `/tmp` patch files),
  in slice order, filesystem `mv` first, against a fresh
  `git archive 276c1e36 -- <the nine files>` extraction: all nine (`theme.ts`, the
  renamed `theme.test.tsx` content diff, `index-bootstrap.test.ts`, `app.test.tsx`,
  `account-menu.test.tsx`, `composition.ts`, `tasks.md`, `spec.md`, `verify.md`)
  reported **no output and exit 0** — `git apply --check` prints nothing on success.
  Applied for real afterward and byte-diffed (`diff -q`) against this revision's own
  working files (`verify.md`'s own result checked by reapplying the same diff to a
  separately fetched `276c1e36` copy and diffing the two results against each other,
  since the real tree's own `verify.md` was reverted): **identical, all nine.** Order
  matters for the rename: applying the `theme.test.tsx` content diff before the `mv`
  fails with `error: apps/wbs/fe-01/src/lib/theme.test.tsx: No such file or directory`.
  One nuance recorded rather than hidden: Prettier strips the trailing single space
  `git diff` writes for a wholly blank **context** line inside a fenced block, turning
  it into a zero-length line; `git apply` tolerates this (a blank line in a context
  position is accepted the same as a single-space one), and the byte-identity check
  above confirms the applied result is unaffected — but a reader diffing this document's
  own fenced text directly against `git diff`'s literal output will see that one
  cosmetic difference on purely blank context lines.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`: this
  packet's own fresh run, both without and with the `tasks.md`/`spec.md` diffs applied:
  `{"items": 114, "passed": 114, "failed": 0}`, unchanged, both times.
- `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
wbs-fe-01:test:unit`: exit 0, `Test Files 48 passed (48)`, `Tests 697 passed (697)` —
  unchanged, confirming this packet touches no node-tier file.
- `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
wbs-fe-01:test` (the whole jsdom target, UTC then Auckland,
  `--no-file-parallelism --maxWorkers=1`): **run to completion, exit 0, `8m 13s`.** UTC
  pass: `Test Files 131 passed (131)`, `Tests 3000 passed (3000)`. Auckland zoned pass:
  `Test Files 2 passed (2)`, `Tests 3 passed (3)`. Zero failures, zero regressions. This
  packet's own derived pre-edit base for the whole target (section 3.5) is **2995**
  (3000 minus this revision's own five new tests, all inside `theme.test.tsx`); this is
  the delta the row in section 3.5 requires, and it holds.
- `NX_DAEMON=false bunx nx run tool-devsync:test`, run once with this revision's own
  packet document staged (`git add` before the run, code changes already reverted, per
  the coordinator's own instruction): exit 0, `366 pass`, `0 fail`, `903 expect() calls`,
  `Ran 366 tests across 25 files` — the same 366-test total other packets' own
  `verify.md` entries record as their baseline; this packet's own doc-only addition
  moves nothing in it.

## 10. Stop conditions

Every condition below is checked FALSE on this packet's own real starting tree
(`276c1e36`) before being stated as a stop:

- The sandbox command's own baseline (`46 files / 674 tests`, section 3.4/3.5) is not
  reproduced at any slice's own step 0. **Checked FALSE**: reproduced exactly, both
  before and after this revision's edits (section 9). Never compared against the whole
  `test:unit` target's own 48/697 — that comparison would itself be a false stop
  (Critical 1 of this document's own section 14).
- `git status --short --untracked-files=all` (scoped to the current slice's own owned
  paths) shows any line other than one of that slice's own hand-over paths, an
  unrelated starting change this packet preserves, or this packet's own plan document
  with a leading ` M`. **Checked FALSE**: `276c1e36`'s own `git status --short` is clean.
- Any of section 9's exit codes is non-zero **after this packet's own final edits**
  (every diff in section 7, all applied). **Checked FALSE**: every command re-run after
  the full edit reported exit 0 (the two rehearsed reds, sections 6 and 9, are evidence
  from an intermediate tree, not a residual stop).
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`'s
  `summary.totals.failed` is not `0` in this packet's own fresh measurement. **Checked
  FALSE**: 0, both without and with the `tasks.md`/`spec.md` diffs applied.
- **Unconditional: OpenSpec task 3's checkbox is ticked by this packet.** It is not —
  section 5's file plan and section 7.7's own diff leave it unchecked, with the reason
  stated inline: one of five call sites moved is not "delivery reads its preferences out
  of that one graph," and the module's own wiki index is still absent
  (`apps/wbs/fe-01/src/modules/preferences/README.md:52`, confirmed by reading it).
  **Checked FALSE by construction**: this packet's own author reverted `tasks.md` to
  `276c1e36`'s own content before hand-over.
- `composition.ts` or `composition-agreement.test.ts` is deleted by this packet.
  **Checked FALSE by construction**: section 5's file plan marks both unmodified/handed
  to f2; `composition.ts` gains only a JSDoc paragraph (section 7.6).
- Any file outside section 5's file plan differs from `276c1e36` at hand-over.
  **Checked FALSE**: `git diff --stat 276c1e36` (recorded in this packet's own report to
  its caller) lists exactly the files in section 5's "Modify" rows — the two OpenSpec
  files and `verify.md` are reverted, per section 6 slice 3's own bullet, so they do
  **not** appear in that diff even though their prescribed diffs are inside this
  document (section 7.7-7.9).

## 11. What this packet leaves — hand-over to 050-7-f2

**050-7-f2, the remaining four call sites and `composition.ts`'s deletion:**

1. **`project-settings-modal.tsx` and `project-page.tsx`, design (i), same shape as this
   packet's `theme.ts`.** Blast radius (section 3.2): 1 render site + 1 bare-function
   test for the settings modal; 8 render/rerender sites (`project-page.test.tsx`) + 1
   shared-file render site (`optimization-integration.test.tsx`) for the project page.
   This packet's own `theme.test.tsx`/`app.test.tsx`/`account-menu.test.tsx` slices are
   the worked pattern: parameterise the bare functions, add the one hook-boundary call
   inside the component, add the three lifecycle transitions this revision's own review
   found necessary (reactivation, withdrawal-reset, closured-write-race), wrap renders
   in a live `<ApplicationServicesProvider>` (its own `isLive` wired, never
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
   requirement this packet adds (section 7.8) states but does not itself render.

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
- **`chooseTheme`'s own `try`/`catch` is narrowly scoped to the one documented failure
  mode `rememberTheme` can raise through a closured, once-live store** —
  `preferences.resource.ts`'s `ensureLive` refusal. No other exception this closure
  could plausibly raise (the JSON path is unreachable — `ThemeChoice` is a plain string
  union) is caught by this same block; if `preferences.resource.ts`'s own contract ever
  grows a second throw path, this catch's own scope should be revisited, not silently
  widened by inheritance.
- **`project-settings-modal.tsx` and `project-page.tsx` were cut on this packet's own
  remaining time budget, not on any newly measured blockage** — unlike `gantt-detail.ts`
  (measured blast radius, section 3.2) and `lib/remembered.ts` (needs its own design
  record, section 4(ii)). f2 should not expect to find a hidden obstacle in either; the
  pattern is this packet's own `theme.ts` slice, applied twice more, including its three
  lifecycle transitions and its `persists` field.

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
   (`index-bootstrap.test.ts`'s own `withThemeStore` helper, matching
   `composition-agreement.test.ts`'s own pattern); every fixture built through a
   `LifetimeSlot` is retired via `slot.retire()` in an `afterEach` (or at the end of its
   own test body) that runs **after** React `cleanup()`, not before.

### Addendum, resolved rather than reassessed point by point

Every "Not met"/"Partial" row from the review's own 20-point table is addressed by one
of the fixes above: point 4 (failure-visible commands) by the corrected shell blocks
(Important 6); point 6 (sandbox facts) by the corrected baseline and the explicit
planner-only marking (Critical 1, Important 6); point 9 (packet form) by the corrected
subjects, baselines and OpenSpec ownership (Important 1, 5); point 15 (lifecycle
interleavings) by the three named transitions and the explicit, narrowed claim
(Important 3); point 20 (bounded claims) by `persists` and the corrected withdrawal/
reactivation behaviour (Important 2, 3). Points assessed "Met"/"Not applicable" by the
review are unaffected by this revision's own changes and are not re-litigated here.
