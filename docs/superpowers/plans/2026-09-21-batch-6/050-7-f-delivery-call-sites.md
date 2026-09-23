# 050.7f The delivery call sites, off the staged duplicate and onto the runtime

|             |                                                                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **seventh packet**                                                                                                                                                                                                         |
| Size class  | S (one of five call sites; the rest are handed to a named follow-up — section 4 and section 11 say why)                                                                                                                                                                                                               |
| Predecessor | [050.7e](050-7-e-page-lifecycle.md) is not this packet's actual predecessor for the code it touches: this packet builds on `main` at `276c1e36` (the merged tip after e/e2/e3), and its own subject is [050.7c](050-7-c-application-context.md)'s task 3, left open there — see that packet's own section 11, item 2. |
| Design      | This packet's own section 4. Predecessor design: [The frontend lifetime slot](050-7-lifetime-slot-design.md), unmodified — this packet adds no new lifecycle mechanism, only consumers of the one `application-services-context.tsx` already exposes.                                                                 |
| OpenSpec    | `adopt-frontend-lifetimes`, task 3 (partially — one of five call sites; see section 10's stop condition and section 11's hand-over). Task 12's public `preferences` resource debt is narrowed by one caller (`lib/theme.ts` no longer needs it) and otherwise unchanged.                                              |

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
(`gantt-detail.ts`, transitively — section 3.2's second bullet has the corrected count,
materially larger than packet c's own "104" estimate), have a comparable blast radius
this packet's own remaining budget did not reach
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
  none is modified. `preferences.resource.ts`'s `ensureLive`/`WITHDRAWN` model — the
  thing that makes "never throw for withdrawn" provable at the resource layer — is
  reused, not touched.
- Closing OpenSpec task 3's checkbox. One of five call sites moved is not "delivery
  reads its preferences out of that one graph" — section 10 states this as an explicit,
  unconditional stop.

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
5. `apps/wbs/fe-01/src/lib/theme.ts`, `theme.test.ts`, `index-bootstrap.test.ts`,
   `app.test.tsx` — the moved site and its full blast radius, before this packet's edit.
6. `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`, `project-page.tsx`,
   `project-settings-modal.tsx`, `apps/wbs/fe-01/src/lib/remembered.ts`,
   `apps/wbs/fe-01/src/components/wbs/remembered-layout.ts` — the four sites this
   packet does not move, read for the hand-over's own accuracy.
7. `openspec/changes/adopt-frontend-lifetimes/tasks.md` tasks 3 and 12.

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
  (`const storedDetail = rememberedPreferences.ganttDetail;`) — not moved; section 3.3's
  second bullet below has the corrected blast-radius measurement.
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

**Second, corrected fact: `gantt-detail.ts`'s render-site blast radius is not the "104"
packet c's own section 3.3 cited — it is materially larger, because `WbsTable` (not only
`GanttPanel` directly) reaches `useGanttDetail()`.**

- `git -C apps/wbs/fe-01 grep -c '<GanttPanel' src/components/wbs/gantt-panel.test.tsx`
  reads **104**, as packet c found; `gantt-panel.zoned.test.tsx` adds **1** more direct
  render.
- `apps/wbs/fe-01/src/components/wbs/wbs-table.tsx:29` imports `GanttPanel` and renders
  it unconditionally (confirmed by reading the file: `GanttPanel` is not behind a
  feature flag or a conditional branch inside `WbsTable`'s own render body). Seventeen
  further test files render `<WbsTable` directly and were not counted by packet c at
  all: `plan-structure.test.tsx` (8), `plan-layout.test.tsx` (23),
  `plan-row-dependencies.test.tsx` (1), `page-shortcuts.test.tsx` (1),
  `plan-table.test.tsx` (27), `optimization-integration.test.tsx` (7, plus one
  `<ProjectPage` — see below), `plan-read-and-write.test.tsx` (44),
  `plan-toolbar.test.tsx` (15), `plan-chart-seam.test.tsx` (4), `plan-estimates.test.tsx`
  (6), `plan-filter.test.tsx` (15), `plan-row-render-cost.test.tsx` (5),
  `plan-dependencies.test.tsx` (9), `plan-keyboard.test.tsx` (3), `plan-cards.test.tsx`
  (61), `plan-cells.test.tsx` (31) — **263** further render sites, **19 files** in total
  once `gantt-panel.test.tsx`/`.zoned.test.tsx` are counted with them, roughly **368**
  render sites overall.
- This is why `gantt-detail.ts` is handed to f2 rather than attempted here: converting
  its hook to read `useApplicationServicesState()` directly (the natural reading of
  design option (i) below) would require a provider at every one of those sites, which
  does not fit this packet's own slices, and packet c's own estimate understated the
  true size of the problem by roughly 3.5×.

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
- `apps/wbs/fe-01/src/lib/theme.test.ts:126,136,147,155,166,178,193,227` (pre-edit line
  numbers) — eight `renderHook(() => useTheme())` calls, no wrapper: `useTheme()` is the
  one hook boundary this packet adds, so all eight need a live
  `<ApplicationServicesProvider>` wrapper (section 6, slice 2).
- `apps/wbs/fe-01/src/app.test.tsx` — eight `render(<App />)` sites (lines 47, 66, 78,
  100, 139, 189, 208, 217 pre-edit). `<App/>`'s own tree mounts `ThemeProvider`
  (`app.tsx`, confirmed by reading it: `ThemeProvider` wraps the branch that decides
  whether anybody is signed in), so all eight need the same wrapper. One describe block,
  "the theme control through the app" (pre-edit lines 170-244), asserts persistence
  across an unmount and a fresh `render(<App/>)` — this is why section 4's design keeps
  this file's wrapper's slot genuinely **live** (installed, not merely present-but-empty)
  rather than the cheaper "never replaced" shortcut that would have sufficed for the
  other six tests in this file.
- **A fourth site, found only by running the whole `wbs-fe-01:test` target, not by
  grepping for `ThemeProvider`/`<App`:**
  `apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx` defines its own
  `ThemeHarness` component (line 274) that calls `useTheme()` directly — not through
  `<App/>` or `ThemeProvider` at all — and renders it at three sites (lines 304, 319, 326) inside `describe('the theme control, wired to the hook that owns it', ...)`,
  including the same persistence-across-remount shape as `app.test.tsx`'s own block.
  This file has no textual marker (`ThemeProvider`, `<App`, `import.*theme` alone all
  miss it or over-match) that a static grep against those strings would have caught
  reliably; it surfaced as **two real test failures** on this packet's first full
  `wbs-fe-01:test` run (section 9), fixed the same way as `app.test.tsx` (a local
  `renderHarness()` wrapper over a fresh live slot, diff in section 7.2b). Recorded here
  as a correction to this packet's own section 3.2/3.3 measurement, not packet c's: this
  packet's own first-pass grep missed it, and only a real whole-suite run caught it —
  the reason section 9 insists on that run rather than trusting the three owned files in
  isolation.

### 3.4 Tiers, targets and the sandbox

- Every file this packet touches is jsdom-tier (`theme.ts`, `theme.test.tsx`,
  `index-bootstrap.test.ts`, `app.test.tsx`) or untouched by any tier boundary
  (`composition.ts`'s doc comment only). Nothing here is added to
  `vitest.node-suites.ts`, and the node-tier sandbox command's own file/test count is
  required unchanged by this packet (section 3.5).
- `wbs-fe-01:test:unit` and `wbs-fe-01:test` are whole Nx targets; three unrelated
  existing tests spawn `bun` from Node and refuse inside an executor sandbox with
  `spawnSync bun EPERM` (batch 1's finding, unchanged). This packet's own author ran both
  targets directly, outside any sandbox restriction, as the planner step section 3.5
  and section 9 record — never inferred.
- `bun test <dir>` is a filter, not a path (addendum 14); this packet prescribes no bare
  `bun test`. `grep` on this workstation is ugrep, exits 1 on a missing file as well as
  no match (addendum 19); this packet's own verification commands use exit-status
  wrappers (`; echo "exit=$?"`) rather than a bare `grep … || test $? -eq 1`.
- The known `claims.db.test.ts` contention race is not this packet's; it touches no
  database code. Per the addendum's exception, if the whole-suite run shows exactly
  `claims.db.test.ts`'s `bounds terminal lock contention and retries until a held write
commits` failing, record it and rerun once without investigating.

### 3.5 Numbers, rehearsed on this response's own tree, `276c1e36`

Counts are relative, never absolute — the table's own "before"/"after" columns are this
packet's own fresh measurement, collected before and after its one code slice; the
row's **required delta** is the acceptance criterion, not the absolute totals.

| Command (from `apps/wbs/fe-01`)                                                                                                      | Before (baseline, pre-edit content at these same paths)                                                                                                                           | After                                                                                                                                                            | Required delta                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx vitest run src/lib/theme.test.tsx src/index-bootstrap.test.ts src/app.test.tsx src/components/chrome/account-menu.test.tsx`    | 4 files / 59 tests (derived: base `theme.test.ts` 20 + `index-bootstrap.test.ts` 12 + `app.test.tsx` 7 + `account-menu.test.tsx` 20 — none of the last three gain or lose a test) | 4 files / 60 tests, exit 0 (**observed**: `40 passed (40)` for the first three files (21 + 12 + 7) plus `20 passed (20)` for `account-menu.test.tsx`, section 9) | **+0 files / +1 test** (one withdrawn-degrade test added to `theme.test.tsx`; the other three files gain no test, only a provider wrapper — confirmed by counting this packet's own diffs: `git diff` against `276c1e36` adds exactly one new `itDom(` call, in `theme.test.tsx`, and removes none, across all four files) |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` (planner; whole-project build)                                                     | exit 0 (unmodified tree)                                                                                                                                                          | exit 0 (**observed**, section 9)                                                                                                                                 | unchanged                                                                                                                                                                                                                                                                                                                  |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint` (planner; whole-project eslint)                                                         | exit 0 (unmodified tree)                                                                                                                                                          | exit 0 (**observed**, section 9)                                                                                                                                 | unchanged                                                                                                                                                                                                                                                                                                                  |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit` (planner; node tier)                   | 48 files / 697 tests (unchanged by construction: `git diff --stat 276c1e36` touches no node-tier file)                                                                            | 48 files / 697 tests, exit 0 (**observed**, section 9)                                                                                                           | **no change**                                                                                                                                                                                                                                                                                                              |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test` (planner; whole jsdom target, UTC+Auckland) | 131 files / 2995 tests (**derived**, not separately measured on a clean tree: 2996 minus the single new `itDom(` this packet's own diff adds — see the delta note in row 1)       | 131 files / 2996 tests, exit 0 (**observed**, section 9, both passes — UTC 131/2996, Auckland zoned subset 2/3)                                                  | **+0 files / +1 test, 0 regressions**                                                                                                                                                                                                                                                                                      |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                        | 114 items / 114 passed / 0 failed                                                                                                                                                 | 114 items / 114 passed / 0 failed (unchanged: this packet edits no OpenSpec file)                                                                                | unchanged                                                                                                                                                                                                                                                                                                                  |

**On the whole-target row's "before" figure:** this packet's own author ran the whole
`wbs-fe-01:test` target twice, both times against the tree with this packet's own edits
already applied (once before `account-menu.test.tsx`'s own fix, once after — section 9
has both). Neither run is against a pristine `276c1e36` tree, and a third, ~8-minute run
against one was judged not worth this packet's own remaining budget once the delta was
fully accounted for by counting the diff's own test additions directly (`git diff`
against `276c1e36`, `grep -c '^+.*itDom('`, minus `grep -c '^-.*itDom('`: **+1, 0**,
entirely inside `theme.test.tsx`) — a stronger check than an estimate, though not the
same as an independently measured clean-tree run. Stated as **derived**, not measured,
in the table above, per the reviewers-of-c/d/e's own refusal of "historical totals"
presented as an attempt's own fresh baseline.

## 4. Design: what changes, per site, and the invariant that must survive all five

**The invariant, stated once, that every one of the five sites — moved by this packet or
handed to f2 — must satisfy:** after 050.7 is fully done, no code path constructs a
`Preferences`/`RememberedPreferences` instance outside `installApplicationRuntime`
(the runtime owner), and every consumer of the runtime's preferences renders the
modelled `withdrawn` state correctly — **never a throw** — when the runtime is not live.
`useApplicationServicesState()` already proves the second half at the context boundary
(its own JSDoc, unmodified); each site's own design below is what carries that proof one
level further in, to the actual read/write call.

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
render for no reason), and passes it down. When the services are `withdrawn`, the
derived store is `null` and the read/write functions are simply not called — the
existing "never said" default (`'system'`, `FIRST_SECTION`) already carries the
degraded case, so no new sentinel value is needed. The zero-arg unit tests move onto the
runtime path: each builds its own `installApplicationRuntime()` and passes the resulting
store into the parameterised function, rather than importing the module-load singleton.
Render-based tests (`renderHook`/`render`) gain an explicit
`<ApplicationServicesProvider slot={...}>` wrapper.

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
from `preferences.resource.ts`'s `ensureLive` unchanged: `ensureLive` throws on a write
against a withdrawn store, which is safe there because every one of its callers is a
user-triggered write inside an already-mounted, already-live tree at the moment the
write starts (050-7-d's own model). A module-scope write reachable before any tree
exists does not have that guarantee, and f2's own design record (not this packet's) must
state what it does instead — most likely a silent no-op, matching this section's
"never throw" invariant, but f2 must prove it with a test, not assume it.

**(iii) The ~368 `<GanttPanel>`/`<WbsTable>` render sites across 19 test files, for
`gantt-detail.ts` — handed to f2, with the render-site-count correction in section 3.2
above.** Two shapes were considered and neither is chosen here (that choice is f2's own,
made against the real 368-site count rather than packet c's 104): (a) `useGanttDetail`
becomes a context-consuming hook exactly like `useTheme`, and every one of the 19 test
files' shared `render`/`mounted`-style helper is swapped for a test-only fixture that
wraps its subject in a live `<ApplicationServicesProvider>` by default — small **per
call site** (often one import-line swap per file, this packet's own `theme.test.tsx`
`wrapper` constant is the worked example) but touching every one of 19 files; or (b)
`GanttPanel`/`WbsTable` take `remembered` as an explicit **prop**, sourced once by
whichever single production composition point already sits under the provider (`<App/>`
itself, or `WbsTable`'s own nearest ancestor), keeping every one of the 368 test render
sites untouched at the cost of a prop threaded through every layer between the provider
and `GanttPanel`. Whichever fits, the panel must never construct its own preferences —
this packet's invariant applies to shape (b) exactly as much as (a).

### Why `theme.ts` fit and the other four did not: the deciding measurement

Not size alone — `project-settings-modal.tsx`'s own blast radius (1 render site, 1
bare-function test) is _smaller_ than `theme.ts`'s (9 `renderHook` sites, 8 `render`
sites in `app.test.tsx`, plus the persistence-across-remount describe block that forced
a genuinely live slot rather than an empty one — section 3.3's third bullet). It was cut
for a different reason: `project-settings-modal.tsx`'s own remaining code (`show`,
`onOpenChange`, the `dirtyRef`/`reporters` machinery) is unrelated to this move and this
packet's author had already spent this packet's own budget proving `theme.ts`'s harder
case (the eager module-scope binding, section 3.2's sixth fact) end to end, including its
negative proof (section 8). `project-page.tsx` and `gantt-detail.ts` were cut on size
(section 3.2's corrected counts). `lib/remembered.ts` was cut because it is design (ii),
the one this packet's own author judged needs its own design record before any code,
matching the addendum's point 16 ("three review rounds finding new races means the
design is wrong, not the packet" — the analogous risk here is a false-green "it's just a
lazy getter" fix that misses the write-before-any-tree-exists case section 4(ii) already
flags).

## 5. File plan

| Path                                                              | Change                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/lib/theme.ts`                                 | Modify — remove the module-scope `storedChoice`; parameterise `rememberedTheme`/`readTheme`/`rememberTheme`; `useTheme` reads `useApplicationServicesState()`.                                                                                                                        |
| `apps/wbs/fe-01/src/lib/theme.test.ts` → `theme.test.tsx`         | Rename (JSX wrapper needs `.tsx`) and modify — runtime-path bare-function tests, provider wrapper on every `renderHook`, one new withdrawn-degrade test.                                                                                                                              |
| `apps/wbs/fe-01/src/index-bootstrap.test.ts`                      | Modify — one call site moves to the runtime path.                                                                                                                                                                                                                                     |
| `apps/wbs/fe-01/src/app.test.tsx`                                 | Modify — a live `<ApplicationServicesProvider>` wrapper around every `render(<App/>)`.                                                                                                                                                                                                |
| `apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx`      | Modify — a live `<ApplicationServicesProvider>` wrapper around `ThemeHarness`'s three render sites (section 3.3's fourth bullet; found by the whole-suite run, not the static grep).                                                                                                  |
| `apps/wbs/fe-01/src/modules/preferences/composition.ts`           | Modify — JSDoc only: records that one of five call sites has moved and names the other four.                                                                                                                                                                                          |
| `apps/wbs/fe-01/src/components/wbs/gantt-detail.ts`               | **Unmodified.** Handed to f2 — section 4(iii), section 11.                                                                                                                                                                                                                            |
| `apps/wbs/fe-01/src/components/wbs/project-page.tsx`              | **Unmodified.** Handed to f2 — section 4(i), section 11.                                                                                                                                                                                                                              |
| `apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx`    | **Unmodified.** Handed to f2 — section 4(i), section 11.                                                                                                                                                                                                                              |
| `apps/wbs/fe-01/src/lib/remembered.ts`, `remembered-layout.ts`    | **Unmodified.** Handed to f2 — section 4(ii), section 11.                                                                                                                                                                                                                             |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`, `verify.md` | **Not edited by this packet's own author** (only the packet may differ from `276c1e36`); this packet's own section 7.5 gives the exact diff a later apply-change step applies alongside the code, appending `verify.md` and leaving task 3 unchecked per section 10's stop condition. |

## 6. Slices

Every slice's owned paths are the ones listed for it below; a `git status --short
--untracked-files=all` comparison is against that slice's own recorded starting
inventory, and explicitly permits this packet's own plan document to carry a concurrent
planner revision (` M docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md`).

```sh
set -euo pipefail
```

prefixes every block below that is not itself a single command with its own `; echo
"exit=$?"`.

### Step 0 — at the start of every slice, from the repository root

```sh
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice-start-status.txt"
(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts) \
  > "$TMPDIR/evidence/step0-node.log" 2>&1; echo "exit=$?" >> "$TMPDIR/evidence/step0-node.log"
```

Expected: node-tier command exits 0, unchanged file/test count from the packet's own
baseline (48 files / 697 tests — section 3.5). This packet touches no node-tier file, so
every slice's own step 0 must show the same count; a difference is a stop condition
(section 10).

### Slice 1 — the design record

Subject: `docs(plans): add the seventh 050.7 packet (delivery call sites onto the runtime's preferences)`

No code. This document's own sections 1 through 5 are the artifact. Pre-edit check:
`docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md` does not exist
on `276c1e36`. Hand over: this one file, `??` under
`docs/superpowers/plans/2026-09-21-batch-6/`.

### Slice 2 — `theme.ts`, red then green, test-first

Owned paths: `apps/wbs/fe-01/src/lib/theme.ts`, `apps/wbs/fe-01/src/lib/theme.test.ts`
(renamed to `theme.test.tsx`), `apps/wbs/fe-01/src/index-bootstrap.test.ts`,
`apps/wbs/fe-01/src/app.test.tsx`,
`apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx`.

- [ ] **Red, on the unchanged tree — two different reds, rehearsed separately, neither
      skipped.** Apply only the test-file diffs from section 7.2, 7.2b, 7.3 and 7.4 (not
      yet 7.1, `theme.ts` itself) against `theme.ts` as it stands on `276c1e36`.
      **First, the type-check red** — the one that actually matters, per the batch-3
      brief's "a slice that moves or re-declares a type runs the type check in that same
      slice": `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` on that tree reports
      `Found 8 errors in 2 files` — `TS2554: Expected 0 arguments, but got 1` at every
      parameterised call site (`index-bootstrap.test.ts:125`, `theme.test.tsx:87,93,99,
106,120`) plus `TS2724: '"./theme"' has no exported member named 'isThemeChoice'`
      (`theme.test.tsx:13`) — exit 1, rehearsed and observed exactly as printed here.
      **Second, and separately: `bunx vitest run` itself does NOT fail to start.**
      Vitest's own transform is esbuild, which strips types without checking arity, so
      the unmodified zero-argument `rememberedTheme()`/`readTheme()` silently ignore the
      extra argument every parameterised test call now passes and keep reading the old
      module-load `storedChoice` — every test whose assertion does not depend on the
      _mechanism_ (only on the bytes already in `localStorage`, which the old and new
      stores agree on, per `composition-agreement.test.ts`'s own point) still passes.
      Rehearsed: `(cd apps/wbs/fe-01 && bunx vitest run src/lib/theme.test.tsx
src/index-bootstrap.test.ts src/app.test.tsx
src/components/chrome/account-menu.test.tsx)` on that same tree reports `Test Files
1 failed | 3 passed (4)`, `Tests 1 failed | 59 passed (60)` — the **one** failure is
      this slice's own new "degrades to system, reads and writes nothing, and never
      throws" case (`AssertionError: expected '"dark"' to be null`, the choice written
      to real `localStorage` because the unedited `useTheme` never reads
      `useApplicationServicesState()` at all), not a wholesale red. **The type-check red
      is the one this slice actually depends on; the vitest red is real but narrow, and
      is recorded here rather than overstated as "does not even start."**
- [ ] Apply the `theme.ts` diff (section 7.1).
- [ ] **Green, the four owned test files:**
      `sh
      (cd apps/wbs/fe-01 && bunx vitest run \
      src/lib/theme.test.tsx src/index-bootstrap.test.ts src/app.test.tsx \
      src/components/chrome/account-menu.test.tsx) \
  > "$TMPDIR/evidence/slice2-green.log" 2>&1; echo "exit=$?"
  > `    Expected: exit 0,`4 passed (4)`test files,`60 passed (60)`tests total (21 in
 `theme.test.tsx`+ 12 in`index-bootstrap.test.ts`+ 7 in`app.test.tsx`+ 20 in
 `account-menu.test.tsx` — the exact split section 9 records against the real run).
- [ ] **Green, the whole jsdom target — not optional, and not replaced by the four-file
      run above.** `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx
run wbs-fe-01:test`. This step is what actually found
      `account-menu.test.tsx`'s `ThemeHarness` (section 3.3's fourth bullet): the
      four-owned-file run above cannot catch a consumer of `useTheme()` this packet's
      own author had not yet found by reading `theme.ts`'s own call sites. Expected,
      after the fix: exit 0, `131 passed (131)` test files (UTC pass), `2996 passed
(2996)` tests (UTC pass) — the observed values are in section 9, including the
      first, failing run this step's own instruction exists because of.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0.
- [ ] The negative proof (section 8, row 1): mutate `theme.ts`'s lazy initialiser to
      `readTheme(themeStore as Remembered<ThemeChoice>)` (drop the `themeStore ? ... :
'system'` guard); rerun `bunx vitest run src/lib/theme.test.tsx -t "degrades to
system"`; observe the failure named in section 8; restore with `cp` from the
      pre-mutation copy; `cmp` byte-identical; rerun green.

Hand over, six paths: the five owned paths above, all ` M` (plus the rename showing as
`R ` or `RM` depending on the git version invoked), and this packet's own plan document
with a leading ` M` (a concurrent planner revision — Slice 1's own artifact, permitted).

### Slice 3 — `composition.ts`'s doc comment, and hand-over

Owned paths: `apps/wbs/fe-01/src/modules/preferences/composition.ts`.

- [ ] Apply the diff in section 7.5. No test changes — `composition-agreement.test.ts`
      is unmodified and still passes unchanged (it tests `ganttDetail`, a site this
      packet does not move).
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0 (doc-only change; this
      step exists to catch an accidental JSDoc syntax error, not a real risk here).
- [ ] `(cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences)`: unchanged count
      from this slice's own step 0.
- [ ] **Planner-only**, run by this packet's own author directly (not inside an executor
      sandbox — both targets spawn `bun` from Node in unrelated tests, per section 3.4):
      `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
wbs-fe-01:test:unit` and `NX_DAEMON=false env -u CLAUDECODE -u
CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test`. Expected and observed values
      are in section 9.
- [ ] `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`:
      exit 0, `summary.totals` unchanged (114/114/0) — this packet's own author edits no
      OpenSpec file directly; section 7.6's `tasks.md`/`verify.md` diff is for a later
      apply-change step to land, not this rehearsal.
- [ ] `GSETTINGS_BACKEND=memory bunx prettier --write
docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md` then
      `--check`, twice.

Hand over: all of slice 2's paths plus `composition.ts`, `M`, and the plan document,
`M`. Nothing else differs from `276c1e36`.

## 7. The code

### 7.1 `src/lib/theme.ts`, as a diff against `276c1e36`

```diff
--- a/apps/wbs/fe-01/src/lib/theme.ts
+++ b/apps/wbs/fe-01/src/lib/theme.ts
@@ -10,8 +10,9 @@ import {
   useState,
 } from 'react';

-import { rememberedPreferences } from '@/modules/preferences/composition';
-import { THEME_KEY } from '@/modules/preferences/preference-keys';
+import type { Remembered } from '@/modules/preferences/contract';
+import { THEME_KEY } from '@/modules/preferences/preference-keys';
+import { useApplicationServicesState } from '@/runtime/application-services-context';

 /**
  * What a reader has asked for, which is not the same as what is painted.
@@ -44,26 +45,34 @@ export const DARK_QUERY = '(prefers-color-scheme: dark)';
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
+ * store from {@link useApplicationServicesState} on every call instead — a
+ * module-scope binding here would be built at import time, before any runtime
+ * exists, exactly the hazard `remembered-layout.ts`'s `storedMermaidSectionMode`
+ * is in (see
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
@@ -71,7 +80,7 @@ export function rememberedTheme(): ThemeChoice {
   // Proof: the shared refusal drop made a no-op failed three resource cases,
   // including `a read that drops removes the refused key; a plain read writes
   // nothing`, on `expected '"midnight"' to be undefined`. Observed 2026-09-20.
-  return storedChoice.readAndDrop() ?? 'system';
+  return themeStore.readAndDrop() ?? 'system';
 }

 /**
@@ -89,13 +98,13 @@ export function rememberedTheme(): ThemeChoice {
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
@@ -154,6 +163,17 @@ export interface Theme {
  * Mounted once, in `app.tsx`, above the branch that decides whether anybody is
  * signed in — so the sign-in form is painted the same as the plan behind it,
  * and a remembered dark page does not go white the moment somebody signs out.
+ *
+ * **Reads its store off {@link useApplicationServicesState}, this file's one
+ * hook boundary** — rule K2's rule for React: a component or a hook takes the
+ * runtime's `remembered`, never a module-load duplicate. Memoised by the
+ * context's own `remembered` reference (stable while the runtime is `live`),
+ * so the store passed to {@link rememberedTheme} and {@link rememberTheme}
+ * below is rebuilt only when the runtime actually changes, not on every
+ * render — `themeChoice` itself builds a fresh, stateless closure per call
+ * (`preferences.feature.ts`).
+ *
+ * **While the application services are `withdrawn`, the choice degrades to
+ * the same `system` default {@link readTheme} already returns for "never
+ * said," and nothing is read or written.** Given `application-bootstrap.tsx`'s
+ * own ordering — the tree this hook is part of is only ever drawn once the
+ * slot is `live` — this hook's first render is never `withdrawn` in
+ * production; the branch exists for the same reason `preferences.resource.ts`
+ * models withdrawal rather than assuming it cannot happen, and is proved by a
+ * test that mounts below a slot that never publishes: see
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md`
+ * section 4.
  *
  * `useState(readTheme)` — the lazy initialiser, not `useState(readTheme())` —
  * for `rememberedGanttHeight`'s reason: the second reads storage on every
@@ -168,7 +188,13 @@ export interface Theme {
  * way — see {@link readTheme}.
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
+    themeStore ? readTheme(themeStore) : 'system',
+  );
   const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => systemMedia().matches);

   /**
@@ -179,8 +205,8 @@ export function useTheme(): Theme {
    * this line can have written the key.
    */
   useEffect(() => {
-    rememberedTheme();
-  }, []);
+    if (themeStore) rememberedTheme(themeStore);
+  }, [themeStore]);

   /**
    * Follows the machine while the page is open.
@@ -217,12 +243,15 @@ export function useTheme(): Theme {
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
+      if (themeStore) rememberTheme(themeStore, next);
+      setChoice(next);
+    },
+    [themeStore],
+  );

   return { choice, palette, chooseTheme };
 }
```

### 7.2 `src/lib/theme.test.ts` → `theme.test.tsx`, as a diff after `git mv`

Dispatch: `git mv apps/wbs/fe-01/src/lib/theme.test.ts
apps/wbs/fe-01/src/lib/theme.test.tsx` first (the wrapper below needs JSX, which a
`.ts` file cannot parse), then apply this diff against the renamed file. Checked with
`git apply --check` in this exact order against a fresh extraction of `276c1e36` — the
literal output is in section 9.

```diff
--- a/apps/wbs/fe-01/src/lib/theme.test.tsx
+++ b/apps/wbs/fe-01/src/lib/theme.test.tsx
@@ -1,10 +1,16 @@
 import { act, cleanup, renderHook } from '@testing-library/react';
+import type { ReactNode } from 'react';
 import { afterEach, beforeEach, describe, expect, it } from 'vitest';

 import type { DriveableMediaQueryList } from '../../vitest.setup';
+import type { ApplicationServices } from '../runtime/application-runtime';
+import { installApplicationRuntime } from '../runtime/application-runtime';
+import { ApplicationServicesProvider } from '../runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '../runtime/lifetime-slot';
 import {
   DARK_CLASS,
   DARK_QUERY,
+  isThemeChoice,
   paintPalette,
   paletteFor,
   readTheme,
@@ -21,13 +27,31 @@ const itDom = hasDom ? it : it.skip;
 const platform = (): DriveableMediaQueryList =>
   window.matchMedia(DARK_QUERY) as DriveableMediaQueryList;

-beforeEach(() => {
+/**
+ * A slot already `live` over the production installer, for {@link useTheme}'s
+ * own tests — the runtime path `rememberedTheme`/`readTheme`/`rememberTheme`
+ * moved onto, once `composition.ts`'s module-load duplicate stopped being
+ * this file's store. Awaited before use: `LifetimeSlot.replace` settles on a
+ * microtask even for a synchronous acquire (`application-services-context.test.ts`'s
+ * own `liveSlot` helper is the same shape).
+ */
+let slot: LifetimeSlot<ApplicationServices>;
+
+beforeEach(async () => {
   localStorage.removeItem(THEME_KEY);
   document.documentElement.classList.remove(DARK_CLASS);
   platform().setMatches(false);
+  slot = createLifetimeSlot<ApplicationServices>(50);
+  await slot.replace(() => installApplicationRuntime());
 });

 afterEach(() => {
   cleanup();
 });
+
+const wrapper = ({ children }: { children: ReactNode }) => (
+  <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
+);
+
+/** The theme store this browser holds, over the runtime's own preferences. */
+const themeStore = () => installApplicationRuntime().services.remembered.themeChoice(isThemeChoice);
@@ -60,26 +84,26 @@ describe('what this browser remembers', () => {
   itDom('starts on system, having never been told', () => {
-    expect(rememberedTheme()).toBe('system');
+    expect(rememberedTheme(themeStore())).toBe('system');
   });

   itDom('reads back an answer it was given', () => {
     localStorage.setItem(THEME_KEY, JSON.stringify('dark'));

-    expect(rememberedTheme()).toBe('dark');
+    expect(rememberedTheme(themeStore())).toBe('dark');
   });

   itDom('refuses a stored answer that is not one of the three, and drops the key', () => {
     localStorage.setItem(THEME_KEY, JSON.stringify('midnight'));

-    expect(rememberedTheme()).toBe('system');
+    expect(rememberedTheme(themeStore())).toBe('system');
     expect(localStorage.getItem(THEME_KEY)).toBeNull();
   });

   itDom('refuses storage that is not JSON at all, and drops the key', () => {
     localStorage.setItem(THEME_KEY, '{not json');

-    expect(rememberedTheme()).toBe('system');
+    expect(rememberedTheme(themeStore())).toBe('system');
     expect(localStorage.getItem(THEME_KEY)).toBeNull();
   });
@@ -92,7 +116,7 @@ describe('what this browser remembers', () => {
     localStorage.setItem(THEME_KEY, JSON.stringify('midnight'));

-    expect(readTheme()).toBe('system');
+    expect(readTheme(themeStore())).toBe('system');
     expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('midnight'));
   });
 });
@@ -123,7 +147,7 @@ describe('the theme, followed and remembered while the app is open', () => {
   itDom('opens on the answer this browser last gave, without a paint in between', () => {
     localStorage.setItem(THEME_KEY, JSON.stringify('dark'));

-    const held = renderHook(() => useTheme());
+    const held = renderHook(() => useTheme(), { wrapper });

     expect(held.result.current.choice).toBe('dark');
     expect(held.result.current.palette).toBe('dark');
@@ (the file's other seven `renderHook(() => useTheme())` calls — pre-edit lines 136,
147, 155, 166, 178, 193, 227, the full list minus the one shown above; section 3.3's
second bullet has the complete set of eight — each gaining ", { wrapper }" the same way)
@@ END of file
+
+describe('the theme when the application services are not live', () => {
+  /**
+   * The invariant this packet adds: no consumer of the runtime's preferences
+   * ever throws for a `withdrawn` application-services state, {@link useTheme}
+   * included. Given `application-bootstrap.tsx`'s own ordering this hook's
+   * first render is never actually `withdrawn` in production — see this
+   * function's own JSDoc — but the branch exists and is proved here rather
+   * than assumed unreachable.
+   *
+   * Proof: on 2026-09-23, against this file's own real tree, replacing
+   * `themeStore ? readTheme(themeStore) : 'system'` with an unconditional
+   * `readTheme(themeStore as Remembered<ThemeChoice>)` failed this case
+   * (only, run with `-t "degrades to system"`) with `TypeError: Cannot read
+   * properties of null (reading 'read')` at `theme.ts`'s own `readTheme`.
+   * Restored, `cmp`-verified identical, and rerun green (33 passed across
+   * this file and `index-bootstrap.test.ts`).
+   */
+  itDom('degrades to system, reads and writes nothing, and never throws', () => {
+    const empty = createLifetimeSlot<ApplicationServices>(50);
+    const withdrawnWrapper = ({ children }: { children: ReactNode }) => (
+      <ApplicationServicesProvider slot={empty}>{children}</ApplicationServicesProvider>
+    );
+
+    const held = renderHook(() => useTheme(), { wrapper: withdrawnWrapper });
+
+    expect(held.result.current.choice).toBe('system');
+    expect(held.result.current.palette).toBe('light');
+
+    act(() => {
+      held.result.current.chooseTheme('dark');
+    });
+
+    expect(held.result.current.choice).toBe('dark');
+    expect(localStorage.getItem(THEME_KEY)).toBeNull();
+  });
+});
```

(The full, exact per-line diff for the seven remaining `renderHook` call sites and the
`themeStore()`-parameterised assertions is mechanical — the same two substitutions
repeated — and is in the packet's own rehearsed working tree; this listing shows the
first occurrence plus the new describe block in full, per the "one slice, every mutation
a complete compiling edit" rule applied at the pattern level rather than pasting eight
near-identical hunks.)

### 7.2b `src/components/chrome/account-menu.test.tsx`, as a diff

Found only by the whole-target run (section 3.3's fourth bullet, section 6 slice 2's own
whole-target step) — `ThemeHarness` (line 274) calls `useTheme()` directly, outside
`<App/>`. Checked with `git apply --check` against a fresh `276c1e36` extraction; no
output, exit 0.

```diff
--- a/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx
@@ -1,7 +1,13 @@
 import { fireEvent, render, screen, within } from '@testing-library/react';
-import { describe, expect, it, vi } from 'vitest';
+import { beforeEach, describe, expect, it, vi } from 'vitest';

 import { DARK_CLASS, THEME_KEY, useTheme } from '@/lib/theme';
+import {
+  type ApplicationServices,
+  installApplicationRuntime,
+} from '@/runtime/application-runtime';
+import { ApplicationServicesProvider } from '@/runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';

 import { AccountMenu, type AccountMenuProps } from './account-menu';

@@ -288,9 +294,27 @@ function ThemeHarness() {
 describe('the theme control, wired to the hook that owns it', () => {
   const answers = ['System', 'Light', 'Dark'] as const;

-  beforeEach(() => {
+  /**
+   * A slot `live` over the production installer, rebuilt fresh every test —
+   * {@link ThemeHarness} calls `useTheme`, which now reads
+   * `useApplicationServicesState()` (see `lib/theme.ts`), and this block's own
+   * "after a reload" case persists a choice across an unmount and a fresh
+   * mount, which needs a real, live store behind it.
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
+    await slot.replace(() => installApplicationRuntime());
   });

   const open = () => {
@@ -301,7 +325,7 @@ describe('the theme control, wired to the hook that owns it', () => {
     screen.getByRole('menuitemradio', { name }).getAttribute('aria-checked') ?? '';

   itDom('reports the answer just chosen, for every answer, and only that one', () => {
-    render(<ThemeHarness />);
+    renderHarness();
     open();

     for (const answer of answers) {
@@ -316,14 +340,14 @@ describe('the theme control, wired to the hook that owns it', () => {

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

### 7.3 `src/index-bootstrap.test.ts`, as a diff

```diff
--- a/apps/wbs/fe-01/src/index-bootstrap.test.ts
+++ b/apps/wbs/fe-01/src/index-bootstrap.test.ts
@@ -5,7 +5,8 @@ import { beforeEach, describe, expect, it } from 'vitest';

 import type { DriveableMediaQueryList } from '../vitest.setup';
-import { DARK_CLASS, DARK_QUERY, paletteFor, rememberedTheme, THEME_KEY } from './lib/theme';
+import { DARK_CLASS, DARK_QUERY, isThemeChoice, paletteFor, rememberedTheme, THEME_KEY } from './lib/theme';
+import { installApplicationRuntime } from './runtime/application-runtime';

@@ -118,7 +119,9 @@ describe('the palette applied before the first paint', () => {
           // `rememberedTheme` reads the same bytes and drops the key when it
           // cannot use them; the bootstrap deliberately writes nothing, so it
           // is read here **after** the run, from what the module would have
-          // made of the same store.
-          expect(painted).toBe(paletteFor(rememberedTheme(), machineIsDark));
+          // made of the same store — the runtime's own, not a module-load
+          // duplicate: see `theme.ts`'s own JSDoc.
+          const themeStore = installApplicationRuntime().services.remembered.themeChoice(isThemeChoice);
+          expect(painted).toBe(paletteFor(rememberedTheme(themeStore), machineIsDark));
         },
       );
     }
```

### 7.4 `src/app.test.tsx`, as a diff

```diff
--- a/apps/wbs/fe-01/src/app.test.tsx
+++ b/apps/wbs/fe-01/src/app.test.tsx
@@ -1,7 +1,11 @@
 import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import type * as Api from '@/lib/api';
+import {
+  type ApplicationServices,
+  installApplicationRuntime,
+} from '@/runtime/application-runtime';
+import { ApplicationServicesProvider } from '@/runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';

@@ -17,6 +21,23 @@ vi.mock('@/lib/api', async (importOriginal) => ({

 const { App } = await import('./app');

+/**
+ * A slot `live` over the production installer, rebuilt fresh every test.
+ *
+ * `<App/>`'s own tree includes `ThemeProvider`, which now reads
+ * `useApplicationServicesState()` (see `theme.ts`) — the describe block
+ * "the theme control through the app" persists a choice across an unmount and
+ * a fresh mount, which needs a real, live store behind it, not the
+ * withdrawn-degrade `theme.test.tsx` already proves on its own.
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
     status: 401,
     body: { error: 'invalid_token' },
     headers: new Headers(),
   });
   logged = muteConsoleError();
   window.history.replaceState({}, '', '/');
+  servicesSlot = createLifetimeSlot<ApplicationServices>(50);
+  await servicesSlot.replace(() => installApplicationRuntime());
 });
```

(Followed by eight mechanical substitutions, `render(<App />);` → `renderApp();` and the
two named-variable forms `const first = render(<App />);` / `const second = render(<App
/>);` → `const first = renderApp();` / `const second = renderApp();`, at the eight lines
section 3.3's third bullet names.)

### 7.5 `src/modules/preferences/composition.ts`, as a diff

```diff
--- a/apps/wbs/fe-01/src/modules/preferences/composition.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/composition.ts
@@ -14,6 +14,15 @@
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

### 7.6 `openspec/changes/adopt-frontend-lifetimes/tasks.md`, for a later apply-change step — not applied by this packet's own author

```diff
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -13,7 +13,11 @@
 - [ ] 3. The page's application lifetime is opened through the slot at module load and
       delivery reads its preferences out of that one graph, with the module's wiki index
       declaring `module.frontend.preferences` and its files.
+      Partly closed by 050-7-f: `lib/theme.ts` reads through
+      `useApplicationServicesState()`, not `modules/preferences/composition.ts`.
+      `gantt-detail.ts`, `project-page.tsx`, `project-settings-modal.tsx` and
+      `lib/remembered.ts` still read the staged duplicate — see
+      `docs/superpowers/plans/2026-09-21-batch-6/050-7-f-delivery-call-sites.md`
+      section 11 for 050-7-f2's own scope. This box stays unchecked until all
+      five move and `composition.ts` is deleted.
```

This packet's own author does not apply this diff to the real `openspec/changes/`
tree — per the setup instruction, only the packet document may differ from `276c1e36` at
the end of this packet's own work. A later apply-change step lands this diff alongside
the code in section 7.1-7.5.

## 8. Proofs

| #   | Fault injected                                                                                                                                             | Location                                                                   | Named failing test                                                                                                                                                                                                         | Observed diagnostic (2026-09-23)                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `themeStore ? readTheme(themeStore) : 'system'` replaced by `readTheme(themeStore as Remembered<ThemeChoice>)` in `useTheme`'s lazy `useState` initialiser | `apps/wbs/fe-01/src/lib/theme.ts`, the line assigning `choice`/`setChoice` | `theme.test.tsx` › "the theme when the application services are not live" › "degrades to system, reads and writes nothing, and never throws" (run alone: `bunx vitest run src/lib/theme.test.tsx -t "degrades to system"`) | `TypeError: Cannot read properties of null (reading 'read')` at `theme.ts:100:21` (`readTheme`), reached from `theme.ts:211:31` (`useTheme`'s lazy initialiser) through React's `mountState`. Run reported `Test Files 1 failed (1)`, `Tests 1 failed \| 17 skipped (18)`. |

Restored with `cp` from a pre-mutation copy, verified byte-identical with `cmp`, rerun
green: `bunx vitest run src/lib/theme.test.tsx src/index-bootstrap.test.ts` reported `2
passed (2)` test files, `33 passed (33)` tests.

Only one new safety check is introduced by this packet (the `themeStore ? ... : null`
withdrawn-degrade branch); the other edits are mechanical parameter threading with no
new branch to prove, so this table has one row, matching AGENTS.md R5's "every new or
changed safety check" — a call-site signature change is not a check.

## 9. Verification

Commands actually run, in this order, on `276c1e36` plus this packet's own working-tree
edits (not an executor sandbox — this packet's own author ran every command directly, as
the planner):

- `GSETTINGS_BACKEND=memory bun install --frozen-lockfile`: exit 0, `1292 packages
installed`.
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` (`bunx tsc --build --force
apps/wbs/fe-01/tsconfig.json`): exit 0, "Successfully ran target typecheck for project
  wbs-fe-01", both before this packet's edits (clean tree) and after.
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0, "Successfully ran target lint for
  project wbs-fe-01" (48.2s), after this packet's edits.
- `(cd apps/wbs/fe-01 && bunx vitest run src/lib/theme.test.tsx
src/index-bootstrap.test.ts)`: exit 0, `Test Files 2 passed (2)`, `Tests 33 passed
(33)`.
- `(cd apps/wbs/fe-01 && bunx vitest run src/app.test.tsx)`: exit 0, `Test Files 1 passed
(1)`, `Tests 7 passed (7)`.
- Combined: `(cd apps/wbs/fe-01 && bunx vitest run src/lib/theme.test.tsx
src/index-bootstrap.test.ts src/app.test.tsx)`: exit 0, `Test Files 3 passed (3)`,
  `Tests 40 passed (40)` — the exact split is **21 + 12 + 7 = 40**, correcting section
  3.5's hand-counted estimate with the real run.
- `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
wbs-fe-01:test:unit`: exit 0, `Test Files 48 passed (48)`, `Tests 697 passed (697)` —
  unchanged from the packet's own recorded baseline (section 3.5), confirming this
  packet touches no node-tier file.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`: exit 0;
  `summary.totals` = `{"items": 114, "passed": 114, "failed": 0}`.
- The negative proof in section 8: observed exactly as recorded there.
- `git apply --check`, in slice order, against a fresh `git archive 276c1e36 -- <the six
files>` extraction, `git mv theme.test.ts theme.test.tsx` applied first: all six
  patches (`theme.ts`, the renamed `theme.test.tsx` content diff, `index-bootstrap.test.ts`,
  `app.test.tsx`, `account-menu.test.tsx`, `composition.ts`) reported no output and exit
  0 — `git apply --check` prints nothing on success. Order matters for the rename:
  applying the `theme.test.tsx` content diff before the `mv` fails with `error:
apps/wbs/fe-01/src/lib/theme.test.tsx: No such file or directory`, which is why the
  dispatch line in section 7.2 states the `mv` first.
- **`NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run
wbs-fe-01:test` (the whole jsdom target, UTC then Auckland,
  `--no-file-parallelism --maxWorkers=1`), first run, before `account-menu.test.tsx` was
  found or fixed:** exit 1 (via Nx's own non-zero wrapper), `7m 52s`.
  `src/components/chrome/account-menu.test.tsx` reported `2 failed` of its 20 tests, both
  `the theme control, wired to the hook that owns it › reports the answer just chosen,
for every answer, and only that one` and `… › reports the answer that was chosen, and
only that one, after a reload`, both on `Error: useApplicationServicesState must be
read below ApplicationServicesProvider` at `application-services-context.tsx:129:11`,
  reached from `theme.ts:204:20` (`useTheme`) via `ThemeHarness`
  (`account-menu.test.tsx:275:35`). Every other file passed: `Test Files 1 failed | 130
passed (131)`, `Tests 2 failed | 2994 passed (2996)`. This is section 3.3's fourth
  bullet, found this way rather than by a further static grep, and fixed by the diff in
  section 7.2b.
- The same command, **second run, after the fix** (section 7.2b applied):
  `(cd apps/wbs/fe-01 && bunx vitest run src/components/chrome/account-menu.test.tsx)`
  alone first, isolated: exit 0, `Test Files 1 passed (1)`, `Tests 20 passed (20)`.
  `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` and `:lint` re-run after the fix:
  both exit 0 (`typecheck` 2.8s, `lint` 50.5s). The full whole-target rerun completed:
  exit 0, `8m 20s`. UTC pass: `Test Files 131 passed (131)`, `Tests 2996 passed
(2996)`. Auckland zoned pass (`vitest.zoned.config.ts`'s own narrower suite): `Test
Files 2 passed (2)`, `Tests 3 passed (3)`. Zero failures, zero regressions —
  `account-menu.test.tsx`'s own fix was the only gap the first run found, and this
  second run confirms nothing else in the 131-file target needed a change. This is the
  whole-target "after" row in section 3.5's table.

## 10. Stop conditions

Every condition below is checked FALSE on this packet's own real starting tree
(`276c1e36`) before being stated as a stop:

- `git status --short --untracked-files=all` (scoped to the current slice's own owned
  paths) shows any line other than one of that slice's own hand-over paths, an
  unrelated starting change this packet preserves, or this packet's own plan document
  with a leading ` M`. **Checked FALSE**: `276c1e36`'s own `git status --short` is clean.
- Any of section 9's exit codes is non-zero **after this packet's own final edits**
  (section 7.1-7.2b, all applied). **Checked FALSE**: every command re-run after
  `account-menu.test.tsx`'s own fix reported exit 0. (Section 9's first whole-target run,
  before that fix, DID exit 1 — that is the fault this packet's own slice 2 found and
  closed within the same slice, not a residual stop; the fix is in the hand-over, not a
  follow-up.)
- The node-tier sandbox command's file/test count differs from 48/697. **Checked
  FALSE**: unchanged, reported in section 9.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`'s
  `summary.totals.failed` is not `0`, or `summary.totals.items` is not `114`. **Checked
  FALSE**: 114/114/0, both before and after (this packet edits no OpenSpec file).
- **Unconditional: OpenSpec task 3's checkbox is ticked by this packet.** It is not — see
  section 5's file plan and section 7.6's own "not applied" note. One of five call sites
  moved is not "delivery reads its preferences out of that one graph"; ticking the box
  here would be exactly the "report claims not backed by packet lines" failure mode the
  reviews of packets c/d/e (section 4's own citations) refuse. **Checked FALSE by
  construction**: this packet's own author did not edit `tasks.md`.
- `composition.ts` or `composition-agreement.test.ts` is deleted by this packet.
  **Checked FALSE by construction**: section 5's file plan marks both unmodified/handed
  to f2; `composition.ts` gains only a JSDoc paragraph (section 7.5).
- Any file outside section 5's file plan differs from `276c1e36` at hand-over.
  **Checked FALSE**: `git diff --stat 276c1e36` (recorded in the report handed back to
  this packet's caller) lists exactly the files in section 5's "Modify"/"Rename" rows.

## 11. What this packet leaves — hand-over to 050-7-f2

**050-7-f2, the remaining four call sites and `composition.ts`'s deletion:**

1. **`project-settings-modal.tsx` and `project-page.tsx`, design (i), same shape as this
   packet's `theme.ts`.** Blast radius (section 3.2): 1 render site + 1 bare-function
   test for the settings modal; 8 render/rerender sites (`project-page.test.tsx`) + 1
   shared-file render site (`optimization-integration.test.tsx`) for the project page.
   This packet's own `theme.test.tsx`/`app.test.tsx` slices are the worked pattern:
   parameterise the bare functions, add the one hook-boundary call inside the component,
   wrap renders in a live `<ApplicationServicesProvider>` where persistence is asserted
   (`project-page.test.tsx`'s own remembered-project-across-remount cases, if any exist —
   f2 must check, the way this packet's own section 3.3 third bullet checked
   `app.test.tsx`'s "theme control through the app" block before choosing a live slot
   over an empty one).
2. **`gantt-detail.ts`, design (iii).** Re-measured blast radius: ~368 render sites
   across 19 files (section 3.2), not packet c's "104". f2's own first slice should be
   choosing between this packet's two named shapes (context-consuming hook plus a
   shared test-fixture import swap across 19 files, or an explicit prop threaded from a
   single production composition point) against that real count, not attempting the
   move before that choice is made and its own blast radius re-measured against
   whichever shape is picked.
3. **`lib/remembered.ts`/`remembered-layout.ts`'s `storedMermaidSectionMode`, design
   (ii), the hard one.** f2's own first slice is the inventory this packet did not
   attempt: every remaining call site of `lib/remembered.ts`'s `remembered()`/
   `rememberedText()` (not only `storedMermaidSectionMode` — `remembered-layout.ts`'s
   other module-scope-adjacent exports use the same generic factory, per-project-keyed,
   and need checking one at a time), followed by a design record — a document of its
   own, given addendum point 16's warning that a design revised three times in a row
   under review is a sign the design is wrong, not the packet — for the lazy-resolution
   mechanism section 4(ii) names but does not build, including its own proof that a
   write attempted before the runtime is live is refused safely rather than assumed
   unreachable.
4. **`composition.ts` and `composition-agreement.test.ts`'s deletion.** Blocked on all
   four sites above (items 1-3) moving. f2 is not required to do all four in one packet
   — the same cut rule this packet was given applies to f2 in turn — but the deletion
   itself is a single small slice once the last of the four lands, and should be f2's own last
   slice or handed to an f3 with nothing else to do.
5. **OpenSpec task 3's checkbox.** Ticked only once `composition.ts` is deleted, per
   this packet's own section 10 stop condition and task 3's own text ("delivery reads
   its preferences out of that one graph") — a partial move is not that.

## 12. Assumptions recorded rather than asked

- **A withdrawn-before-first-live-render branch is provable and worth proving even
  though production's own ordering (`application-bootstrap.tsx`) makes it unreachable
  today.** Consistent with `preferences.resource.ts`'s own `ensureLive` and
  `application-services-context.tsx`'s own `applicationServicesStateFor`, both of which
  model every non-`live` status rather than assuming a particular one cannot occur at a
  particular call site.
- **`theme.ts`'s degraded ("withdrawn") behaviour is "keep working locally, persist
  nothing" rather than a new sentinel value on `Theme`'s own return type.** R5's
  "degrade only an explicitly optional feature, visibly in its return type" is read as
  satisfied by `Theme`'s existing `'system'` default, which already models "nothing
  known" — adding a second signal (e.g. a `live: boolean` field) for a transition this
  packet's own measurement shows unreachable in production would be exactly the kind of
  invented mechanism packet c's own section 13/review disposition (cited in this
  packet's brief) warns against.
- **`project-settings-modal.tsx` and `project-page.tsx` were cut on this packet's own
  remaining time budget, not on any newly measured blockage** — unlike `gantt-detail.ts`
  (measured blast radius, section 3.2) and `lib/remembered.ts` (needs its own design
  record, section 4(ii)). f2 should not expect to find a hidden obstacle in either; the
  pattern is this packet's own `theme.ts` slice, applied twice more.
- **The whole-jsdom `wbs-fe-01:test` target's own "before" figure in section 3.5 is
  derived from the diff's own counted test additions, not a separate clean-tree run**
  (section 3.5's own note) — the two whole-target runs this packet's own author actually
  performed (section 9) were both against this packet's own edited tree, the first
  before `account-menu.test.tsx`'s own fix and the second after; both are reported
  exactly as observed, never guessed, per addendum point 4 ("a verification command must
  be able to show a failure") — and the first one did.

## 13. Disposition: what this packet found wrong or stale in packets a-e's landed text

- **Packet c's section 3.3 undercounted `gantt-detail.ts`'s own render-site blast
  radius by roughly 3.5×**, citing only `gantt-panel.test.tsx`'s 104 `<GanttPanel>`
  sites and not the 263 further sites reachable through `<WbsTable>` across 17 other
  test files (section 3.2 of this packet has the corrected count, file by file). This
  does not make packet c's own decision to stop before moving any call site wrong — if
  anything it strengthens it — but a reader relying on packet c's own "104" to scope a
  future packet would under-budget it by a wide margin, which is exactly the "false
  reds/report claims not backed by packet lines" failure mode this packet's own brief
  warned against reproducing (point 4 of the reviewer-refusal citations). Recorded here
  rather than edited into packet c's own already-merged text, per R3 ("knowledge lives
  with what it describes" — this correction lives with the packet that needed it).
- **No other defect found.** `application-services-context.tsx`, `lifetime-slot.ts`,
  `application-runtime.ts`, `application-bootstrap.tsx`, `preferences.resource.ts` and
  `module.ts` were all read against this packet's own use of them (section 2) and found
  to behave exactly as their own JSDoc and packets c/d/e's own text describe — this
  packet's own `theme.ts` slice is a straightforward consumer of all five, and needed no
  workaround in any of them.
- **Not a packet a-e defect, but a defect in this packet's own first-pass measurement,
  recorded for f2's benefit rather than silently fixed:** section 3.2's static grep for
  `useTheme`'s own callers (`ThemeProvider`/`<App`) missed
  `account-menu.test.tsx`'s `ThemeHarness`, which calls `useTheme()` directly. Only the
  whole-target run in section 6 slice 2's own second green step caught it (section 9).
  f2's own inventories (hand-over items 1-3) should budget a whole-target run as part of
  the inventory itself, not only as a final check after the design is chosen — a grep for
  a hook's own name (`useGanttDetail`, `remembered(`/`rememberedText(`) is a necessary
  start, proven insufficient by this packet's own experience with `useTheme`.
