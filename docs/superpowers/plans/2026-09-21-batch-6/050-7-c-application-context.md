# 050.7c The application context, and why the five call sites do not move yet

|                     |                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item           | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **third packet**                                                                                                                                                        |
| Size class          | S                                                                                                                                                                                                                                                                  |
| Predecessor         | [050.7b](050-7-b-application-runtime-preferences.md), merged: the page's runtime, the preferences module installed through it, the bootstrap, the sanitized fatal page.                                                                                            |
| Design              | This packet's own section 4. **No change to** [The frontend lifetime slot: states, events, invariants](050-7-lifetime-slot-design.md) — two earlier revisions of this packet tried to extend it and both were withdrawn as failed attempts; section 4 records why. |
| Design it serves    | [Code organization design](../../specs/2026-09-19-code-organization-design.md): rules F1 to F3 and K2                                                                                                                                                              |
| Reviewed source map | [050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md): the Preferences/K2 table                                                                                                                                                      |
| Execution contract  | [batch 1 README](../2026-09-19-batch-1/README.md): "Execution contract", "Rules for every executor", "Standard blocks every packet uses", "Hidden constraints every frontend packet"                                                                               |
| Planning head       | `32ad6f7b` (`origin/batch-6/integration`, packet b merged)                                                                                                                                                                                                         |

## 1. Goal and non-goals

**Goal.** Finish OpenSpec task 4's one remaining clause: `bootstrapApplication` publishes
`RememberedPreferences` — the feature facade only, never the `Preferences` resource — through
one React context, fed by whichever runtime the page's lifetime slot is currently holding. Two
things, and **only** these two — this packet's lane is the context files, the bootstrap wiring,
the bootstrap tests, `verify.md` and `tasks.md`; it makes **no** change to `lifetime-slot.ts`, its
model test, the design record, or `application-runtime.ts`:

1. **`apps/wbs/fe-01/src/runtime/application-services-context.tsx`**: one context, one provider,
   one hook, `useApplicationServicesState()`, returning a typed union — `live` with the runtime's
   services as the slot published them, or `withdrawn`. **A pure selector, with no wrapper of any
   kind around what `live` carries.** Two earlier revisions of this packet each tried closing a
   render-lag window with a mechanism of its own — an access-time guard wrapping every
   `Remembered` member, then a source-level `withdraw` hook called from `lifetime-slot.ts`'s
   `accept()` — and both **failed attempts** were withdrawn. Section 4 states, precisely, what
   this revision proves and what it leaves open.
2. **The bootstrap wires it in**: `bootstrapApplication` wraps the tree it draws, once the runtime
   is live, in `ApplicationServicesProvider`, fed the **same** slot the bootstrap itself owns.
   Proved through the **production** render path: a component under the tree reads the exact
   runtime this bootstrap installed, on the slot it was given.

**Non-goals, each a measured finding rather than an assumption — section 3 has the evidence:**

- **The five delivery call sites do not move onto this context.** `theme.ts`, `gantt-detail.ts`,
  `project-page.tsx`, `project-settings-modal.tsx` and `lib/remembered.ts` all keep importing
  `modules/preferences/composition`. Moving any of them means every jsdom test that renders a
  component depending on them — measured, not estimated, at 104 direct `<GanttPanel` element uses
  in one file alone (section 3.3) — must be given a provider it does not have today. That is not
  "the smallest edit, stated"; it is a separate packet's work, not a slice inside this one.
- **`modules/preferences/composition.ts` is not deleted.** It is delivery's only working source for
  all five call sites above, so deleting it would remove the module-load duplicate without
  replacing what still reads it — a behaviour change, not a refactor.
- **The K2 debt on `preferences` (the resource, for `src/lib/remembered.ts`) is a scope deferral
  this packet measured, not a permanent architecture this packet declares.** OpenSpec task 12 is
  the place that decides whether the resource "moves behind a feature of its own" or is "recorded
  as accepted debt", and task 12 is not this packet's — it stays open.
- **Closing the render-lag window is not this packet's job, and this revision does not claim to
  do it, or claim that a particular redesign is the only way to.** Two mechanisms tried inside this
  packet's own lane were withdrawn as failed attempts (section 4); that establishes only that those
  two do not work, not that no context-side mechanism ever could — `preferences.resource.ts` calls
  a caller's validator synchronously, so a wrapper can in principle inspect slot identity again
  after that call returns and before answering, which this packet has not built, tried or ruled
  out. What this packet does require, leaving the implementation choice open, is that the read/write
  guarantee be closed before it is claimed — that requirement is recorded in section 11 and
  `verify.md`, owned by **050-7-d**, which supplies the production retirement trigger this window
  has no production path through yet (nothing in production calls `slot.replace`/`retire` a second
  time while the tree is live).
- No library version change. No session or project runtime, no page-hide, hot-reload or restoration
  trigger. No wiki index, no `docs/wiki-policy` registration — packet b's §3.5 already assigned
  those to 050-7-j, and nothing here disagrees.

## 2. Read first

1. [050.7b](050-7-b-application-runtime-preferences.md) sections 3.2, 3.3, 3.5, 4, 11, 12 — the five
   call sites, the staged-duplicate reasoning, the module-index correction, and what it left for
   this packet.
2. `apps/wbs/fe-01/src/runtime/application-runtime.ts`, whole — what this packet reads through, and
   **unmodified by this packet.** `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx`, whole —
   what this packet wraps; **this packet's own slice 2 modifies it** (section 7.3 has the diff), so
   read it first to see what it already had before this packet's own edit.
3. `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`, whole, current tree, **read-only**: `accept()`
   (lines 383-393) and `transition()`'s own `await disposeWithdrawn()` ordering (section 4 depends
   on exactly this ordering, and this packet does not change a line of this file).
4. `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`'s `storeOver` and
   `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts`'s `revocableStorage` —
   where and when a stored value is actually judged and a store actually revoked; section 4's
   residual table is built directly from rehearsing these.
5. `apps/wbs/fe-01/src/modules/preferences/contract.ts`'s `PreferencesExports` and
   `RememberedPreferences` — the K2 boundary this context enforces in React.
6. `apps/wbs/fe-01/src/components/chrome/app-fault.tsx`'s own JSDoc — why a boundary trip is not a
   recoverable outcome, and why this packet's hook must never throw for an ordinary transition.
7. `docs/superpowers/specs/2026-09-19-code-organization-design.md`, rules F1 to F3 and K2.
8. `openspec/changes/adopt-frontend-lifetimes/tasks.md` task 4's exact wording and `verify.md`'s
   Slice 7 (packet b's own hand-over note on what tasks 3 and 4 still owed).

## 3. Verified facts

Every claim was read or run in this packet's own worktree off `32ad6f7b`. Line numbers are that
tree's, unchanged — this packet edits no line of `lifetime-slot.ts`. Every command below is run
from the repository root and names its own working directory — none of them assume a shell already
sitting in `apps/wbs/fe-01`, and none of them invoke a bare `vitest`: this checkout has no `vitest`
on `PATH` (`command -v vitest` fails), only `bunx vitest`.

### 3.1 The bootstrap's own contract, and what it already had

`application-bootstrap.tsx:26-30` (`PRODUCTION`) already builds the runtime before `createRoot`
(packet b), and the fatal branch already renders `LifetimeFault` for both a refused construction and
a failed retirement. The **one** gap task 4 states explicitly is the context: "publishes
`RememberedPreferences` — the feature facade only, never the `Preferences` resource — through one
context." Nothing in tasks 3 or 4's text, or in packet b's §3.5 correction, assigns the five call
sites to this packet; task 3's own clause about them ("delivery reads its preferences out of that
one graph") is what section 3.3 below found could not fit inside this packet's bound, and is
carried forward unticked with the evidence that put it there.

### 3.2 What `lifetime-slot.ts` already does, unmodified, and what it means for a consumer

`lifetime-slot.ts:126-128`: `LifetimeSlot<S>` is `{ subscribe: (listener: () => void) => () => void;
snapshot: () => LifetimeState<S> }` — exactly `useSyncExternalStore`'s `(subscribe, getSnapshot)`
shape, and its own JSDoc at line 115 already calls this "a store (rule F2)". No adaptation layer is
needed between the slot and React's own external-store hook.

`lifetime-slot.ts:383-393` (`accept()`), called synchronously at the top of both `replace` and
`retire`, publishes `{ status: 'retiring' }` **before returning**, and before that same
`transition()`'s own `await disposeWithdrawn()` call has resolved. **This packet found, by direct
rehearsal, three facts about what happens between that synchronous withdrawal and the point a
transition actually settles:**

1. **A mounted React consumer's rendered value lags one notification behind the slot, but converges
   to `withdrawn` once that notification is processed — independent of whether disposal has
   finished.** `useSyncExternalStore` re-renders a subscriber only once its subscription callback
   fires, and that notification is a microtask (this file's own JSDoc: "notifies from a microtask,
   coalescing"). Rehearsed directly, through a mounted `useApplicationServicesState()`, with
   disposal **deliberately held open on a gate this rehearsal alone controlled**, so the only thing
   that could make the hook read `withdrawn` was the notification itself, not a coincidentally
   finished disposal:
   ```text
   before retire: hook.status = live
   immediately after retire() (not awaited, not flushed): slot.status = retiring  hook.status = live
   after flushing React's own notification, disposal STILL held open: slot.status = retiring  hook.status = withdrawn
   after releasing the gate and awaiting settlement: slot.status = empty  hook.status = withdrawn
   ```
   This is claim (a) in section 4, checked on its own terms rather than inferred from a run where
   disposal happened to finish by the time anything was observed — see
   `application-services-context.test.tsx`'s own "holds a mounted consumer withdrawn once its
   notification is flushed, even while disposal is still pending" example, and the matching
   per-command observation point added to the generated property (7.2).
2. **Inside the window BEFORE that notification has been processed, a reference already captured
   still reads and writes its underlying store successfully**, because `lifetime-slot.ts`'s own
   `transition()` only revokes the outgoing runtime's store as a side effect of
   `disposeWithdrawn()` actually completing — `close()`, `module.ts`'s own `store.revoke()`
   disposer — not at `accept()`'s own synchronous withdrawal, and not at the moment React processes
   the notification either. Rehearsed again with a **re-entrant validator** — one that calls
   `slot.retire()` from inside its own `isValid`, mirroring exactly how `preferences.resource.ts`'s
   `storeOver` calls a caller's validator synchronously inside `claim()` — and that **accepts** the
   claimed value (`return true`):
   ```text
   read: "light" slot status: retiring
   readAndDrop: "light" slot status: retiring bytes still: {"wbs.theme":"\"light\""}
   ```
   **A value already read before its validator runs is returned regardless of what the validator
   itself does to the runtime**, because `storeOver`'s own `read`/`readAndDrop` call
   `storage.read(key)` and judge it with `isValid` _before_ deciding what to return, and nothing
   after that decision re-checks liveness. This packet's own two mechanisms (an access-time guard;
   a source-level withdrawal hook) both tried to close this and both were withdrawn as failed
   attempts (section 4) — that shows those two do not work, not that nothing could: a wrapper can,
   in principle, re-check slot identity synchronously after `isValid`'s own call returns, since the
   call is synchronous; this packet has not built or proved that, and does not claim the gap is
   categorically unclosable from inside a context.
3. **Once a transition has been fully awaited, the outgoing runtime's store has already been
   revoked**, because `transition()` awaits `disposeWithdrawn()` for the runtime it is replacing
   _before_ building or publishing the new one. Rehearsed directly: after `await
slot.replace(nextAcquire)` resolves, reading through the _first_ runtime's `remembered` throws
   `'the preferences store was revoked with its runtime'`. This is true with no change to
   `lifetime-slot.ts` at all — it is simply what packet a's own transition ordering already
   guarantees once a caller waits for it.

Section 4 is the design record built from exactly these three facts, and nothing else.

### 3.3 The five call sites, followed past packet b's map, with exact counts

Packet b's §3.2 named five call sites reading `modules/preferences/composition.ts`:

- `src/lib/theme.ts:13` (import), `:52` (`const storedChoice = rememberedPreferences.themeChoice(isThemeChoice);`)
- `src/components/wbs/gantt-detail.ts:3` (import), `:39` (`const storedDetail = rememberedPreferences.ganttDetail;`)
- `src/components/wbs/project-page.tsx:19` (import), `:94` (`const rememberedProject = rememberedPreferences.lastOpenedProject;`)
- `src/components/wbs/project-settings-modal.tsx:13` (import), `:77` (`rememberedPreferences.projectSettingsSection(projectId, isSettingsSection)`, inside `storedSection`, a per-call factory)
- `src/lib/remembered.ts:1` (import), `:18`, `:26` (`browserPreferences.json(...)` and `.text(...)`, called **inside** the exported `remembered()`/`rememberedText()` function bodies — per invocation, not once at import time; `project-settings-modal.tsx:76-77`'s `storedSection` factory is built the same way)

What blocks moving each file off `composition.ts` is specific, and different per file:

- **`theme.ts`'s `readTheme()` and `rememberedTheme()` are exported, plain, zero-argument functions,
  called as such — not as hooks — from two test files that never mount a component:**
  `apps/wbs/fe-01/src/lib/theme.test.ts:62,68,74,81,95` calls `rememberedTheme()` and `readTheme()`
  directly against `localStorage`, and `apps/wbs/fe-01/src/index-bootstrap.test.ts:122` calls
  `rememberedTheme()` to compare the pre-paint inline script in `index.html` against the module it
  duplicates. (`rememberTheme(choice)`, the write half, takes one argument and shares `theme.ts`'s
  module-load `storedChoice` binding, so it is not independently movable either.) A context can only
  supply a value to code running under a mounted `<ApplicationServicesProvider>`; these calls have
  no provider and are not React at all.
- **`project-settings-modal.tsx`'s `rememberedSettingsSection` is exported and unit-tested the same
  way:** `project-settings-modal.test.tsx:393`, `it('reads an absent key as the first section', ()
=> { expect(rememberedSettingsSection('nobody')).toBe('teams'); })` — no `itDom`, no render, no
  provider.
- **`gantt-detail.ts`'s `rememberedDetail`/`readDetail` and `project-page.tsx`'s `rememberProject`
  are not exported** — reachable only through `useGanttDetail()` and inside the component's own
  callbacks, proved by rendering. Moving only these two while the other three stay on
  `composition.ts` would leave the same runtime served through two disagreeing surfaces
  mid-migration, and the render call sites that would need a provider are not small:
  `git -C apps/wbs/fe-01 grep -c '<GanttPanel' src/components/wbs/gantt-panel.test.tsx` reads
  **104**. `git -C apps/wbs/fe-01 grep -n 'render(\|rerender(' src/components/wbs/project-page.test.tsx | wc -l`
  reads **8** matches: five initial `render(` calls and three `rerender(` calls on an existing
  instance.
- **`lib/remembered.ts`'s `remembered()`/`rememberedText()` feed `remembered-layout.ts`'s
  module-scope constants**, which is the real, narrower blocker for this fifth call site —
  `apps/wbs/fe-01/src/components/wbs/remembered-layout.ts:247`,
  `export const storedMermaidSectionMode = remembered(MERMAID_SECTION_MODE_KEY, isSectionMode);`
  — built at import time, in a file transitively imported by `<App/>`'s own static module graph,
  which loads before `bootstrapApplication` has awaited its first `slot.replace`. No provider exists
  yet when this line runs. Retiring this one instance cascades into every one of
  `remembered-layout.ts`'s further callers (gantt, table-frame, tree-search and more) — a second
  packet's blast radius, not five call sites, and exactly the work OpenSpec task 12 still owes.

### 3.4 Tiers, targets and the sandbox

- The context and its tests need `jsdom` (React rendering) and are not added to
  `vitest.node-suites.ts`; they run in the same jsdom tier `application-bootstrap.test.tsx` already
  runs in. Nothing in this packet touches the node tier at all.
- The executor never runs `wbs-fe-01:test:unit` or `wbs-fe-01:test` — three of their tests spawn
  `bun` from Node and the sandbox refuses with `spawnSync bun EPERM` (batch 1's finding, unchanged).
  Both are **planner-only**, run through Nx and recorded in section 9 with this rehearsal's own
  fresh numbers, never inferred, and never asked of the executor. The executor's own commands are
  the sandbox unit command (this packet touches no node-tier file, so its count is unchanged) and,
  for this packet's own jsdom paths, `(cd apps/wbs/fe-01 && bunx vitest run <owned path>)` — always
  `bunx vitest`, never a bare `vitest` this checkout does not have on `PATH`.
- `bun test <dir>` is a filter, not a path (addendum 14); this packet prescribes no `bun test`.
- `grep` on this workstation is ugrep, which exits 1 on a missing file as well as on no match
  (addendum 19); none of this packet's verification steps use a bare `grep … || test $? -eq 1`
  without a preceding `test -f`.
- **The known `claims.db.test.ts` contention race is not this packet's, and this packet never
  touches it.** Per the addendum's exception: if a slice's whole-suite run happens to show
  `claims.db.test.ts`'s `bounds terminal lock contention and retries until a held write commits`
  failing, record it and rerun once; do not investigate or fix it as part of this packet.

### 3.5 Numbers, rehearsed fresh in this response, collected per slice, informational only

**Counts are relative, never absolute (batch-1 README; batch-3 brief).** Acceptance is: node,
`tool-devsync:test` and OpenSpec counts unchanged from each slice's own recorded starting baseline,
and the frontend deltas below — **not** any of the absolute totals this table also states, which are
this rehearsal's own observations, recorded for a later attempt to compare against, not a number to
reproduce exactly.

| Slice                    | Before this slice's own edits (this rehearsal's own baseline, collected by this slice's own step 0) | After                                                            | Required delta          |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------- |
| 1 (the context)          | `src/runtime/` + `src/modules/preferences/`: 12 files / 68 tests, exit 0                            | 13 files / 80 tests, exit 0                                      | **+1 file / +12 tests** |
| 2 (the bootstrap wiring) | Same paths: 13 files / 80 tests, exit 0 (slice 1's own ending state)                                | 13 files / 81 tests, exit 0                                      | **+0 files / +1 test**  |
| 3 (tick task 4)          | Same paths: 13 files / 81 tests, exit 0                                                             | 13 files / 81 tests, exit 0 (only `tasks.md`/`verify.md` change) | **no change**           |

**On the reviewer's own "+1 file / +11 tests" figure for slice 1:** that count was computed against
this packet's own tree _before_ Important 2's own fix (below) added the pending-disposal example
test. With that test added, slice 1's context suite has 12 tests, not 11, so the fresh, rehearsed
delta is `+1` file / `+12` tests — stated as such, not silently reconciled to the reviewer's own
pre-fix number.

Every other check (node unit, `wbs-fe-01:typecheck`/`lint`/`build`, `nx format:check --all`, the
OpenSpec `jq` block, `tool-devsync:test`, the two planner-only whole-suite Nx targets) is collected
fresh at its own point of use in section 6 and reported again, with this rehearsal's own numbers, in
section 9 — none of those numbers is an acceptance criterion in its own right; unchanged node,
devsync and OpenSpec counts are.

## 4. Design: what this revision proves, what it does not, and why two mechanisms were withdrawn as failed attempts

**This section replaces two earlier revisions' designs outright**, rather than amending either.
Addendum lesson 16 — three review rounds finding a new hole in the same kind of mechanism means the
mechanism is wrong, not the coverage — applied first to an access-time guard (round 3's own
finding), and then, when this packet tried to fix it by moving revocation to the source instead
(a `withdraw` hook called from `lifetime-slot.ts`'s own `accept()`), the same lesson applied again:
the fourth review found that calling foreign code from inside `accept()`'s own bookkeeping — before
`held` is detached, before publication, before the request's ordinal is preserved — broke packet a's
own design record, which excludes exactly this. A callback that itself requested a newer replacement
leaked a runtime (built, never closed, never live); a throwing callback left the slot published as
`live` with zero close attempts. **Both mechanisms are failed attempts and are withdrawn.** This
packet's own worktree makes no change to `lifetime-slot.ts` at all; `RetirableRuntime` carries no
`withdraw` member. Neither withdrawal establishes that no context-side mechanism could ever close
the gap section 3.2's second fact describes — only that these two specific ones did not.

**What is left, once both mechanisms are withdrawn, is a narrower, bounded claim — proved, not
asserted:**

**(a) After the slot's own notification has committed, no consumer renders `live` for a runtime the
slot has moved past — independent of whether disposal has finished.** `useApplicationServicesState`
is `useSyncExternalStore(slot.subscribe, () => applicationServicesStateFor(slot))`, memoised only
for that hook's own reference-stability contract — no guard, no cache of anything beyond the
last-seen `remembered` reference, and no branch that re-serves a cached `live` state once the slot's
own snapshot has left `live`. Checked two ways, not one: a dedicated example that holds disposal
open on a gate so the observation can only be explained by the notification itself (section 3.2's
own fact 1), and a per-command observation point inside the generated property (7.2), both added by
this response to close the gap review 5 found in the prior round's own coverage.

**(b) A mounted consumer's rendered state can lag one notification behind the slot, and inside that
lag — BEFORE the notification is processed — a reference already captured can still reach the
runtime's store — because packet b's own `module.ts` revokes that store at **disposal**, when
`close()` actually runs, not at withdrawal, and not at the moment the notification is processed
either.** This is not new to this packet; it is what packet a and packet b already built, and this
packet's own residual table below is the first place it was rehearsed end to end for the preferences
case.

**(c) Consequently, both of these are true, and this packet neither hides nor "fixes" them:**

- a read through a stale-but-rendered facade, attempted before the notification is processed,
  succeeds;
- a validator that retires the runtime from inside its own `isValid` and then **accepts** the
  claimed value still has that value returned, because the resource already read and judged it
  before the validator's own side effect had any chance to matter.

**Residual limits table — every row is this packet's own rehearsed, observed output:**

| Limit                                                                                                      | Rehearsed observation                                                                                                                                                                                                                                                                                                                                               | Owner and required outcome, not a required design                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A mounted consumer's rendered value lags the slot by one notification, before converging to `withdrawn`.   | `before retire: hook.status = live` → `immediately after retire() (not awaited, not flushed): slot.status = retiring  hook.status = live` → `after flushing React's own notification, disposal STILL held open: slot.status = retiring  hook.status = withdrawn` → `after releasing the gate and awaiting settlement: slot.status = empty  hook.status = withdrawn` | Not a defect: React's own async notification contract, and claim (a) above is proved on its own terms, independent of disposal timing.                                                                                                                                                                                            |
| Before that notification is processed, a stale-but-rendered facade's `read` succeeds rather than throwing. | `read "light" slot retiring` — and `readAndDrop` returns the same value, bytes unchanged, with the slot already `retiring`.                                                                                                                                                                                                                                         | **050-7-d** owes the _outcome_ — reads and writes through a withdrawn runtime's facade refuse once withdrawal has been accepted — not a specific _mechanism_. This packet's own two attempts did not achieve it and are recorded as failed attempts, not as proof that no context-side mechanism can (section 3.2's second fact). |
| A validator that retires the runtime from inside `isValid` and accepts the value still gets it returned.   | `read: "light" slot status: retiring` / `readAndDrop: "light" slot status: retiring bytes still: {"wbs.theme":"\"light\""}` — the accepted case, not only the refused one.                                                                                                                                                                                          | **050-7-d**, evaluating whichever mechanism — a post-validator liveness re-check inside the resource, a wrapper that re-checks slot identity after the validator's own synchronous call returns, or something else — actually closes it; this packet establishes the requirement, not the design.                                 |

**Why `AppFaultBoundary` is the reason this hook never throws for an ordinary transition.**
`components/chrome/app-fault.tsx`'s own JSDoc: "It cannot heal itself, and says so rather than
pretending... React never retries a boundary on its own." A hook that threw on `withdrawn` would be
caught by whatever boundary sits above it and never offered another chance, turning a runtime
replacement — an accepted, modelled transition — into a permanent "the app stopped" page. The one
throw `useApplicationServicesState` keeps is for a state boundary logic cannot help with anyway:
reading it below no provider at all is a wiring defect, present from the first render.

## 5. File plan

| Path                                                                   | Slice | Create or modify | Note                                                                                                                             |
| ---------------------------------------------------------------------- | ----- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/runtime/application-services-context.tsx`          | 1     | create           | context, provider, `applicationServicesStateFor`, the unwrapped hook                                                             |
| `apps/wbs/fe-01/src/runtime/application-services-context.test.tsx`     | 1     | create           | 3 selector examples + 8 hook examples (including the pending-disposal example) + 1 mounted `fc.scheduler()` property, jsdom tier |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                  | 1     | modify           | slice 1's own observations, appended in slice 1's own commit                                                                     |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx`                 | 2     | modify           | `app` dependency; the tree render swaps to `dependencies.app`, then gets the provider wrap                                       |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx`            | 2     | modify           | `app: FakeApp` on 5 existing recording-root call sites; +1 production-path probe test                                            |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx`      | 2     | modify           | `app: FakeApp` on its 1 call site                                                                                                |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.strictmode.test.tsx` | 2     | modify           | `app: App` (real) on its 1 call site                                                                                             |
| `apps/wbs/fe-01/e2e/lifetime-fault-probe.ts`                           | 2     | modify           | `app: App` (real) on its 1 call site — planner-run only                                                                          |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                  | 2     | modify           | slice 2's own observations, appended in slice 2's own commit                                                                     |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                   | 3     | modify           | ticks task 4 only; task 3 stays open. Records the 050-7-d obligation from section 4.                                             |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                  | 3     | modify           | slice 3's own observations only — nothing re-recorded from 1 or 2                                                                |

**Nine distinct paths** (`verify.md` counted once; it is touched by all three slices, each
appending only its own section). No React context is added to any of the five call sites;
`modules/preferences/composition.ts` is not touched; no module index, no `kinds.json`, no lockfile.
**No path under `apps/wbs/fe-01/src/runtime/lifetime-slot*` appears in this table, and none is
touched by this packet.**

## 6. Slices

Three. Each ends in one planner commit with the exact subject given, and appends **its own**
`verify.md` section in that same commit.

**Dispatch.** The launcher is `/home/df/wd/puni/puni-plan/exec/run-executor.sh`:

```sh
run-executor.sh 050-7-c-application-context slice-1 <base> --batch batch-6 --preserve evidence
run-executor.sh 050-7-c-application-context slice-2 <base> --batch batch-6 --preserve evidence --resume
run-executor.sh 050-7-c-application-context slice-3 <base> --batch batch-6 --preserve evidence --resume
```

**`--resume` on slices 2 and 3**, or the launcher exits 67. **No `--network`** and no browser: this
packet needs neither. No slice cites another attempt's own evidence, so no slice needs `--seed`.

**Every independently executed verification block below — step 0, each slice's own red/green
checkpoints, the OpenSpec block, and the planner block — begins with `set -euo pipefail`.** A read-only
probe this round confirmed the gap that requires this: `bash -c 'test 1 = 0; test 0 = 0'` exits `0`
without it, meaning a failed baseline, assertion or staging command could silently be followed by an
unrelated success and the block would still report success overall. `set -e` does not defeat the
explicit `if cmd; then …; else …; fi` wrappers used for an intentionally-red checkpoint: a command
tested as an `if` condition is exempt from `set -e` by the shell's own semantics, so an expected red
still records its status without aborting the block. What `set -e` adds is that every subsequent
`test "$(cat "$status_file")" = "0"` — and every bare assertion such as the OpenSpec block's `jq`
call — now stops the block the instant it fails, rather than letting a later command run anyway. The
planner block additionally treats a failed staging (`git add`) command as a stop, not a step to run
past.

### Step 0 — at the start of every slice, from the repository root

```bash
set -euo pipefail
git rev-parse HEAD
git status --short --untracked-files=all > "$TMPDIR/evidence/slice-start-status.txt"
status_file="$TMPDIR/evidence/step0-unit.status"
log_file="$TMPDIR/evidence/step0-unit.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/step0-tsc.status"
log_file="$TMPDIR/evidence/step0-tsc.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/step0-owned.status"
log_file="$TMPDIR/evidence/step0-owned.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/ src/modules/preferences/) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

`git status --short --untracked-files=all`, captured to `slice-start-status.txt`, is this slice's
own recorded starting inventory — section 6's own "Ready to commit" comparisons below are made
against this file plus the slice's own owned-path list, not an unrestricted, unbaselined exact
listing. Both node baselines were `656 passed (656)` tests / `46 passed (46)` files and exit 0
typecheck at every slice's step 0 in this rehearsal — this packet touches no node-tier file at any
slice. The owned-path jsdom baseline (`src/runtime/` + `src/modules/preferences/`) is `12 files / 68
tests` before slice 1, `13 files / 80 tests` before slice 2, and `13 files / 81 tests` before slice
3 — section 3.5 states the deltas these numbers feed.

### Slice 1 — the context, specified before it is wired anywhere

**Prerequisite:** step 0.

**Step 1a — the selector, as a compiling skeleton first, red before it is implemented.** Write
`application-services-context.tsx`'s `ApplicationServicesProvider` and `WITHDRAWN` as the real code
(nothing to fake there); write `applicationServicesStateFor` as a skeleton that always returns
`WITHDRAWN`, ignoring its `slot` parameter; write `useApplicationServicesState` to throw `'not
implemented'` unconditionally. Write `application-services-context.test.tsx` in full: the three
`applicationServicesStateFor` examples, the eight `useApplicationServicesState` examples (including
the new pending-disposal example — 7.2 has the exact test), and the one mounted `fc.scheduler()`
property.

**Red, on the full skeleton:**

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice1-red-a.status"
log_file="$TMPDIR/evidence/slice1-red-a.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-services-context.test.tsx) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
```

— status `1`, `2 passed | 10 failed (12)`. The 2 that pass are the two `applicationServicesStateFor`
examples that expect `withdrawn` — true trivially against the always-`WITHDRAWN` skeleton, since
neither exercises the `live` branch. The "is live with the slot's own published remembered..."
selector example fails — the one selector test the skeleton cannot pass — along with all nine
`useApplicationServicesState`-dependent tests (eight examples plus the mounted property), each on
`Error: not implemented`.

**Step 1b — implement the selector for real** (one branch on `slot.snapshot()`, as in 7.1).

**Green on the selector alone, hook still a skeleton:**

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice1-red-b.status"
log_file="$TMPDIR/evidence/slice1-red-b.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-services-context.test.tsx) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
```

— status `1`, `3 passed | 9 failed (12)`: all three selector examples now pass; every
`useApplicationServicesState`-dependent test still fails on `Error: not implemented`, unchanged from
step 1a's own count for that half.

**Step 1c — implement the hook for real** (7.1): `useSyncExternalStore`, a memoised cache keyed by
`remembered`'s own reference (needed only for `useSyncExternalStore`'s reference-stability contract,
never for safety — section 4's own clause (a)).

**Green:**

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice1-green.status"
log_file="$TMPDIR/evidence/slice1-green.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-services-context.test.tsx) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— status `0`, 1 file / 12 tests. Observed in this rehearsal at 850–950 ms across repeated runs.

**Four faults against the finished tree, each watched failing — section 8.1 has the literal
diagnostics, the complete replacement code for each, and the shrunk counterexamples:** a permanently
cached initial snapshot; the selector remembering the last-seen live state forever; the reviewer's
own exact snapshot-callback mutation that re-serves the cached `live` state only while `retiring`;
and the missing-provider guard replaced by a silent fallback to `applicationSlot`.

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice1-tsc.status"
log_file="$TMPDIR/evidence/slice1-tsc.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice1-lint.status"
log_file="$TMPDIR/evidence/slice1-lint.log"
if NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— exit 0 each, no autofix needed this round.

**Ready to commit:** the two new source paths plus `verify.md`'s own slice-1 section, compared
against this slice's own step-0 `slice-start-status.txt` and its owned-path list below — not an
unrestricted `git status`. A concurrent planner revision to this packet's own `.md` file is
explicitly permitted and is not a stop condition.

```bash
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice1-end-status.txt"
# every line in slice1-end-status.txt must be one of:
#   ?? apps/wbs/fe-01/src/runtime/application-services-context.test.tsx
#   ?? apps/wbs/fe-01/src/runtime/application-services-context.tsx
#    M openspec/changes/adopt-frontend-lifetimes/verify.md
# or already present, verbatim, in slice-start-status.txt (an unrelated
# starting change this packet preserves), or the packet's own plan document
# with a leading " M " (a concurrent planner revision, explicitly permitted).
```

Subject: `feat(wbs-fe-01): add the application services context`.

### Slice 2 — the bootstrap draws under it, proved through the production path, test before implementation

**Prerequisite:** slice 1, committed. This slice's own step 0 baseline for the owned jsdom paths is
`13 files / 80 tests` — slice 1's own ending state.

**Step 2a-i — the seam alone, callers and the render body deliberately untouched.** Add
`app: ComponentType` to `BootstrapDependencies` and its `PRODUCTION` entry (`app: App`) only —
nothing else in this file changes yet, and no caller is given the field yet.

**Red, the field's own diagnostic in isolation, before any caller or the render body is touched:**

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice2-red-a.status"
log_file="$TMPDIR/evidence/slice2-red-a.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
```

— nonzero (this build mode's own reported-diagnostics exit code), `Found 8 errors in 4 files`: five
in `application-bootstrap.test.tsx`'s five `bootstrapApplication(…, { slot, mount: root.mount,
acquire… })` literals, one each in `application-bootstrap.strictmode.test.tsx`,
`application-bootstrap.model.test.tsx` and `e2e/lifetime-fault-probe.ts`. **The diagnostic this
rehearsal observed, eight times across five review rounds, with the exact prescribed edit, run from
both `apps/wbs/fe-01` and the repository root:** `TS2741: Property 'app' is missing in type '…' but
required in type 'BootstrapDependencies'`, one per call site, naming the object literal and `'app'
is declared here`. Two independent review rounds report `TS2345` for the same edit instead; this
packet's own eight reproductions, with raw, uncoloured `tsc --build --force` output each time, did
not reproduce that code. An executor hitting a different code than the one named here should trust
its own terminal over this document's prose and continue: either code identifies the same eight call
sites and the same fix.

**Step 2a-ii — callers and the render swap, together.** Add `app: FakeApp` / `app: App` to every
existing caller, **and** change the render body from the hardcoded `<App />` to `const Tree =
dependencies.app; …​ <Tree />` (still no provider wrap). Both belong to this one step: a version
that leaves the render body reading the hardcoded `<App />` while only fixing callers is a real
defect an earlier round's drafting found — a probe substituted through `app: Probe` in that state
never actually renders, and step 2b's missing-provider exception never fires. `FakeApp` (`(): null
=> null`) is added once per test file using a fake, recording root; `application-bootstrap.test.tsx`
has **five** such recording-root call sites, all receiving `app: FakeApp`.
`application-bootstrap.strictmode.test.tsx` and `e2e/lifetime-fault-probe.ts` use the real `App`,
because both really render.

**Green, callers fixed, render body swapped, still unwrapped — rehearsed fresh, separately from
step 2a-i's red:**

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice2-green-a.status"
log_file="$TMPDIR/evidence/slice2-green-a.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-green-a-tests.status"
log_file="$TMPDIR/evidence/slice2-green-a-tests.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-bootstrap.test.tsx \
    src/runtime/application-bootstrap.model.test.tsx \
    src/runtime/application-bootstrap.strictmode.test.tsx) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— exit 0, 3 files / **7** tests (5 + 1 + 1 — the exact pre-existing count; nothing added yet), every
pre-existing assertion unchanged.

**Step 2b — the probe test, red because there is still no provider, and this time genuinely
exercised.** Add `describe('the context this bootstrap publishes')`'s one test: a **real**
`createRoot` (as `.strictmode.test.tsx` uses — `recordingRoot` never actually renders, so it cannot
exercise a hook), a `Probe` substituted for `app` that calls `useApplicationServicesState()` and
records what it saw in a `useEffect` (recording during render itself is impure and this repository's
lint config refuses it — `react-hooks/globals`, observed rehearsing this exact line).

**Red, for the right reason, confirmed by the probe actually running this time:**

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice2-red-b.status"
log_file="$TMPDIR/evidence/slice2-red-b.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-bootstrap.test.tsx) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
```

— status `1`, 1 failed / 5 passed (6): only the new probe test fails, with `Error:
useApplicationServicesState must be read below ApplicationServicesProvider` thrown from `Probe`,
uncaught, exactly the missing-provider diagnostic and nothing else.

**Step 2c — the wrap.** Add `<ApplicationServicesProvider slot={dependencies.slot}>` around
`<Tree />` inside the existing `<StrictMode>`.

**Green:**

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice2-green-b.status"
log_file="$TMPDIR/evidence/slice2-green-b.log"
if (cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-bootstrap.test.tsx \
    src/runtime/application-bootstrap.model.test.tsx \
    src/runtime/application-bootstrap.strictmode.test.tsx) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— exit 0, 3 files / **8** tests (7 + the new probe).

**Two faults against the one probe test — section 8.2 has the literal diagnostics:** remove the
provider wrap entirely, and keep the wrap but pass `slot={applicationSlot}` (the module's own
production singleton already imported by this file) instead of `slot={dependencies.slot}` — this
mutation compiles.

```bash
set -euo pipefail
status_file="$TMPDIR/evidence/slice2-tsc.status"
log_file="$TMPDIR/evidence/slice2-tsc.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice2-lint.status"
log_file="$TMPDIR/evidence/slice2-lint.log"
if NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

— exit 0 each on the finished slice.

**Ready to commit:** the five modified source paths plus `verify.md`'s own slice-2 section, compared
against this slice's own step-0 starting inventory the same way slice 1's own comparison is, with
the same allowance for a concurrent planner revision of this packet's own `.md` file.

```bash
set -euo pipefail
git status --short --untracked-files=all > "$TMPDIR/evidence/slice2-end-status.txt"
# every line must be one of the five owned paths below, already present in
# this slice's own starting inventory, or this packet's own plan document:
#  M apps/wbs/fe-01/e2e/lifetime-fault-probe.ts
#  M apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx
#  M apps/wbs/fe-01/src/runtime/application-bootstrap.strictmode.test.tsx
#  M apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
#  M apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
#  M openspec/changes/adopt-frontend-lifetimes/verify.md
```

Subject: `feat(wbs-fe-01): wire the application services context into the bootstrap`.

### Slice 3 — tick task 4, and hand over

**Prerequisite:** slice 2, committed. This slice's own step 0 baseline for the owned jsdom paths is
`13 files / 81 tests` — slice 2's own ending state, and no code path changes in this slice, so this
number is also its own ending state.

Tick task 4 in `openspec/changes/adopt-frontend-lifetimes/tasks.md`. Task 3 stays unticked. Record
the 050-7-d obligation from section 4's residual table in the same edit — an outcome required, not a
design mandated.

Append **only** this slice's own section to `verify.md`, including section 4's residual table.

**Verify, all from the repository root — the README's own strict OpenSpec block, not a loose check,
`set -euo pipefail` at the top, status recorded durably before the `jq` assertion reads it:**

```bash
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
report=$(mktemp "$TMPDIR/evidence/openspec-validation.XXXXXX.json")
status_file="$TMPDIR/evidence/openspec-validation.status"
if OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json > "$report" 2>&1; then
  echo 0 > "$status_file"
else
  echo "$?" > "$status_file"
fi
test "$(cat "$status_file")" = "0"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
status_file="$TMPDIR/evidence/slice3-tsc.status"
log_file="$TMPDIR/evidence/slice3-tsc.log"
if (cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json) \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice3-lint.status"
log_file="$TMPDIR/evidence/slice3-lint.log"
if NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice3-build.status"
log_file="$TMPDIR/evidence/slice3-build.log"
if NX_DAEMON=false bunx nx run wbs-fe-01:build \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
status_file="$TMPDIR/evidence/slice3-format.status"
log_file="$TMPDIR/evidence/slice3-format.log"
if NX_DAEMON=false bunx nx format:check --all \
  > "$log_file" 2>&1; then echo 0 > "$status_file"; else echo "$?" > "$status_file"; fi
test "$(cat "$status_file")" = "0"
```

Observed in this rehearsal: status `0`, report `114`/`114`/`0`, `valid: true`, `jq` exits 0; exit 0;
exit 0; exit 0; exit 0 — every number fresh to this response, measured with task 4 both unticked and
ticked, no difference between the two (OpenSpec's own count is the one absolute figure that is also
an acceptance criterion: unchanged, per section 3.5).

**The following block is PLANNER-ONLY, and a failed staging command stops it rather than being run
past. The executor does not run this block; reaching this point, the executor reports each row below
as "pending planner verification" and stops.** Staging and whole-suite devsync execution are the
planner's own step, per the executor-preamble rules named in section 6's own opening note.

```bash
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
status_file="$TMPDIR/evidence/tool-devsync-test.status"
log_file="$TMPDIR/evidence/tool-devsync-test.log"
git add -A -- \
  apps/wbs/fe-01/src/runtime/application-services-context.tsx \
  apps/wbs/fe-01/src/runtime/application-services-context.test.tsx \
  apps/wbs/fe-01/src/runtime/application-bootstrap.tsx \
  apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx \
  apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx \
  apps/wbs/fe-01/src/runtime/application-bootstrap.strictmode.test.tsx \
  apps/wbs/fe-01/e2e/lifetime-fault-probe.ts
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache \
  > "$log_file" 2>&1; then
  echo 0 > "$status_file"
else
  echo "$?" > "$status_file"
fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/jsdom-whole-utc.status"
log_file="$TMPDIR/evidence/jsdom-whole-utc.log"
if (cd apps/wbs/fe-01 && TZ=UTC NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --no-file-parallelism --maxWorkers=1) > "$log_file" 2>&1; then
  echo 0 > "$status_file"
else
  echo "$?" > "$status_file"
fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/wbs-fe-01-test-unit.status"
log_file="$TMPDIR/evidence/wbs-fe-01-test-unit.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:test:unit --skip-nx-cache \
  > "$log_file" 2>&1; then
  echo 0 > "$status_file"
else
  echo "$?" > "$status_file"
fi
test "$(cat "$status_file")" = "0"

status_file="$TMPDIR/evidence/wbs-fe-01-test.status"
log_file="$TMPDIR/evidence/wbs-fe-01-test.log"
if NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run wbs-fe-01:test --skip-nx-cache \
  > "$log_file" 2>&1; then
  echo 0 > "$status_file"
else
  echo "$?" > "$status_file"
fi
test "$(cat "$status_file")" = "0"
```

Observed in this rehearsal, each fresh to this response: `tool-devsync:test` — status `0`, `366
pass`, `0 fail` (unchanged from this packet's own prior rounds — an acceptance criterion, per
section 3.5). `wbs-fe-01:test:unit` — status `0`, `48 passed (48)` files / `676 passed (676)` tests,
unchanged from any earlier round (this packet touches no node-tier file — also an acceptance
criterion). The whole jsdom tier and `wbs-fe-01:test` are recorded in section 9, informational only.

**Ready to commit:** `tasks.md` and `verify.md` only.

Subject: `docs(plans): tick task 4 for the application context`.

## 7. The code

### 7.1 `src/runtime/application-services-context.tsx`, whole

```tsx
import { createContext, type ReactNode, useContext, useRef, useSyncExternalStore } from 'react';

import type { RememberedPreferences } from '@/modules/preferences/contract';

import { type ApplicationServices, applicationSlot } from './application-runtime';
import type { LifetimeSlot } from './lifetime-slot';

/**
 * What a component under {@link ApplicationServicesProvider} may read: the slot
 * itself, never a snapshot taken once.
 *
 * The slot and not `ApplicationServices` directly, because rule F2 already made
 * the slot a store — `subscribe` and a `snapshot` stable until the next
 * transition — and {@link useApplicationServicesState} is what turns that store
 * into one React value through {@link applicationServicesStateFor}. Holding the
 * slot instead of a value means a runtime replaced after this provider mounted
 * is still followed: nothing here is fixed at provider-mount time.
 */
const ApplicationServicesContext = createContext<LifetimeSlot<ApplicationServices> | null>(null);

export interface ApplicationServicesProviderProps {
  /** Defaults to the page's one slot; a test passes its own, and nothing else does. */
  readonly slot?: LifetimeSlot<ApplicationServices>;
  readonly children: ReactNode;
}

/**
 * Publishes the page's runtime, through its slot, to the tree below.
 *
 * `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx` mounts this once,
 * above `<App />`, only once the first transition has settled — so a reader
 * below it is always below a slot that has published at least one runtime.
 * What it reads from that slot **right now** is
 * {@link useApplicationServicesState}'s.
 */
export function ApplicationServicesProvider({
  slot = applicationSlot,
  children,
}: ApplicationServicesProviderProps): ReactNode {
  return (
    <ApplicationServicesContext.Provider value={slot}>
      {children}
    </ApplicationServicesContext.Provider>
  );
}

/**
 * What a consumer below {@link ApplicationServicesProvider} sees, at every
 * instant a `live` runtime is not certainly published.
 *
 * `live` carries the runtime's own `remembered`, exactly as
 * {@link ApplicationServices} published it — no wrapper. Every other slot
 * status — `empty`, `retiring`, `constructing` and `fatal` alike — reads as
 * `withdrawn`. `fatal` is not a fifth member here: `application-bootstrap.tsx`
 * already subscribes to the slot and replaces this whole tree with
 * `LifetimeFault` before a consumer under it could act on `withdrawn`.
 *
 * **This packet stops at the pure selector, deliberately, and section 4 of its
 * own plan document records why:** an access-time guard was tried and
 * withdrawn, and a withdrawal-at-the-source hook was tried and withdrawn too
 * — see
 * `docs/superpowers/plans/2026-09-21-batch-6/050-7-c-application-context.md`,
 * section 4. What this type and this module guarantee is narrower than either
 * attempt claimed: after the slot's own notification has committed, no
 * consumer **renders** `live` for a runtime the slot has moved past. A
 * reference already captured before that commit can still read and write
 * successfully until the runtime's own disposal actually revokes its store —
 * that gap is not closed here.
 */
export type ApplicationServicesState =
  | { readonly status: 'live'; readonly remembered: RememberedPreferences }
  | { readonly status: 'withdrawn' };

/** The one instance every withdrawn read returns — see {@link applicationServicesStateFor}. */
const WITHDRAWN: ApplicationServicesState = { status: 'withdrawn' };

/**
 * The slot's own state, turned into what a consumer may read.
 *
 * A pure function of one snapshot and nothing else — no cache, no ref, no
 * wrapper. `live` only when the slot itself is `live` right now, and every
 * other status reads as {@link WITHDRAWN}. See this type's own JSDoc, and the
 * plan document's section 4, for exactly what this does and does not
 * guarantee about a reference captured before the slot moved on.
 */
export function applicationServicesStateFor(
  slot: LifetimeSlot<ApplicationServices>,
): ApplicationServicesState {
  const state = slot.snapshot();
  return state.status === 'live'
    ? { status: 'live', remembered: state.services.remembered }
    : WITHDRAWN;
}

/**
 * The page's runtime, as the slot is publishing it right now.
 *
 * Rule K2's boundary, in React: the only preferences surface a component or a
 * hook may import is this one, never `ApplicationServices` or the `Preferences`
 * resource beneath it — see `modules/preferences/contract.ts`'s
 * `PreferencesExports`. Subscribed through `useSyncExternalStore`, so a
 * runtime the slot replaces or retires while this stays mounted is followed
 * rather than read once at mount.
 *
 * **Memoised by `remembered`'s own reference, for `useSyncExternalStore`'s own
 * contract, and for nothing else.** `applicationServicesStateFor` builds a
 * fresh object literal on every call, which `useSyncExternalStore` cannot use
 * directly as `getSnapshot` — its own contract requires the same reference
 * back until something real changed, or React logs "the result of getSnapshot
 * should be cached" and can re-render in a loop. The cache below exists
 * **only** to satisfy that contract; it decides nothing about whether a value
 * is still safe to read, and it never re-serves a cached `live` state once the
 * slot's own snapshot has left `live` — see `applicationServicesStateFor`'s
 * own JSDoc.
 *
 * @throws only when read below no {@link ApplicationServicesProvider} — a
 * wiring defect present from the first render, not a lifecycle transition a
 * retry could ever clear. Every other state this hook can observe is a member
 * of {@link ApplicationServicesState} and is returned, never thrown: a hook
 * that threw on an ordinary `withdrawn` tick would trip `AppFaultBoundary`,
 * whose own JSDoc says it "cannot heal itself" and never retries.
 */
export function useApplicationServicesState(): ApplicationServicesState {
  // Proof: on 2026-09-29, falling back to `applicationSlot` here instead of
  // throwing made 'throws when read below no provider' receive `null`
  // (no exception reported) in place of this message (1 failed, 11 passed).
  const slot = useContext(ApplicationServicesContext);
  if (slot === null) {
    throw new Error('useApplicationServicesState must be read below ApplicationServicesProvider');
  }
  const cache = useRef<{
    readonly remembered: RememberedPreferences | null;
    readonly state: ApplicationServicesState;
  }>({ remembered: null, state: WITHDRAWN });
  return useSyncExternalStore(slot.subscribe, () => {
    const next = applicationServicesStateFor(slot);
    const nextRemembered = next.status === 'live' ? next.remembered : null;
    if (nextRemembered !== cache.current.remembered) {
      cache.current = { remembered: nextRemembered, state: next };
    }
    return cache.current.state;
  });
}
```

### 7.2 `src/runtime/application-services-context.test.tsx`, whole

```tsx
import { act, cleanup, renderHook } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';

import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';

import {
  type ApplicationServices,
  applicationSlot,
  installApplicationRuntime,
} from './application-runtime';
import {
  ApplicationServicesProvider,
  type ApplicationServicesState,
  applicationServicesStateFor,
  useApplicationServicesState,
} from './application-services-context';
import { createLifetimeSlot, type LifetimeSlot, TransitionSupersededError } from './lifetime-slot';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

afterEach(() => {
  cleanup();
});

/** A slot already `live` over the production installer and a fake store. */
function liveSlot(): LifetimeSlot<ApplicationServices> {
  const slot = createLifetimeSlot<ApplicationServices>(50);
  void slot.replace(() => installApplicationRuntime({ openStore: fakeBrowserStorage }));
  return slot;
}

/** A hook run that never throws, wrapped so a thrown message is comparable data. */
function safely<T>(read: () => T): { threw: string | null; value: T | null } {
  try {
    return { threw: null, value: read() };
  } catch (failure) {
    return { threw: failure instanceof Error ? failure.message : 'not an Error', value: null };
  }
}

const REVOKED = 'the preferences store was revoked with its runtime';

/**
 * Asserts `state` is `live` and hands back the narrowed value, as a function
 * boundary — not a repeated `if (x.status !== 'live') throw` inline, which
 * this checkout's installed TypeScript 7.0.2 sometimes misreads as
 * unreachable on a getter-backed ref's second access in one scope.
 */
function expectLive(
  state: ApplicationServicesState,
): Extract<ApplicationServicesState, { status: 'live' }> {
  if (state.status !== 'live') throw new Error('expected live');
  return state;
}

/**
 * Releases a disposal gate a test armed, or throws if it was never armed --
 * a function boundary for the same reason `expectLive` above is one: this
 * checkout's TypeScript 7.0.2 sometimes narrows a `let` reassigned only
 * inside a `Promise` executor back to its initializer's literal type at the
 * next read in the same scope.
 */
function releaseGate(release: (() => void) | null): void {
  if (release === null) throw new Error('setup: the gate was never armed');
  release();
}

describe('applicationServicesStateFor', () => {
  it('is withdrawn for every status but live', () => {
    const empty = createLifetimeSlot<ApplicationServices>(50);
    expect(applicationServicesStateFor(empty)).toEqual({ status: 'withdrawn' });
  });

  it("is live with the slot's own published remembered, by reference, once live", async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const acquire = () => installApplicationRuntime({ openStore: fakeBrowserStorage });
    await slot.replace(acquire);
    const state = slot.snapshot();
    if (state.status !== 'live') throw new Error('setup: expected live');
    expect(applicationServicesStateFor(slot)).toEqual({
      status: 'live',
      remembered: state.services.remembered,
    });
  });

  it('is withdrawn the instant a retirement is accepted, before any disposer runs', async () => {
    const slot = liveSlot();
    await Promise.resolve();
    if (slot.snapshot().status !== 'live') throw new Error('setup: expected live');
    const retiring = slot.retire();
    expect(applicationServicesStateFor(slot)).toEqual({ status: 'withdrawn' });
    await retiring;
  });
});

describe('useApplicationServicesState', () => {
  itDom('throws when read below no provider', () => {
    const { result: hook } = renderHook(() => safely(() => useApplicationServicesState()));
    expect(hook.current.threw).toBe(
      'useApplicationServicesState must be read below ApplicationServicesProvider',
    );
  });

  itDom('is withdrawn when the slot it reads has never published a runtime', () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const { result: hook } = renderHook(() => useApplicationServicesState(), {
      wrapper: ({ children }) => (
        <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
      ),
    });
    expect(hook.current).toEqual({ status: 'withdrawn' });
  });

  itDom(
    "is live with the slot's own remembered, by reference — no wrapper stands between them",
    async () => {
      const slot = liveSlot();
      await Promise.resolve();
      const state = slot.snapshot();
      if (state.status !== 'live') throw new Error('setup: expected live');
      const { result: hook } = renderHook(() => useApplicationServicesState(), {
        wrapper: ({ children }) => (
          <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
        ),
      });
      expect(expectLive(hook.current).remembered).toBe(state.services.remembered);
    },
  );

  itDom(
    'mounting during retirement reads withdrawn immediately, from the first render',
    async () => {
      const slot = liveSlot();
      await Promise.resolve();
      if (slot.snapshot().status !== 'live') throw new Error('setup: expected live');
      const retiring = slot.retire();
      const { result: hook } = renderHook(() => useApplicationServicesState(), {
        wrapper: ({ children }) => (
          <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
        ),
      });
      expect(hook.current).toEqual({ status: 'withdrawn' });
      await act(async () => {
        await retiring;
      });
      expect(hook.current).toEqual({ status: 'withdrawn' });
    },
  );

  itDom(
    'holds a mounted consumer withdrawn once its notification is flushed, even while disposal is still pending',
    async () => {
      // The gap review 5 found: the property (below) only checked the mounted
      // consumer once every transition had FULLY settled, which cannot tell
      // "renders withdrawn because the notification was processed" apart from
      // "renders withdrawn because disposal, coincidentally, also finished by
      // then." This test separates the two: disposal is held open on a gate
      // this test alone controls, so the only thing that can make the hook
      // read `withdrawn` at the observation point is React having processed
      // the slot's own notification -- claim (a) in this packet's own plan
      // document, section 4, checked on its own terms.
      const slot = createLifetimeSlot<ApplicationServices>(50);
      let releaseDisposal: (() => void) | null = null;
      const disposalGate = new Promise<void>((resolve) => {
        releaseDisposal = resolve;
      });
      await slot.replace(() => {
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        return {
          services: installed.services,
          close: async (options: { timeoutMs: number }) => {
            await disposalGate;
            await installed.close(options);
          },
        };
      });

      const { result: hook } = renderHook(() => useApplicationServicesState(), {
        wrapper: ({ children }) => (
          <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
        ),
      });

      const retiring = slot.retire();
      // Flush React's own microtask notification WITHOUT releasing the
      // disposal gate: `scheduler.waitIdle()`/`Promise.all(pending)`, which
      // the property below uses, would block on this same gate, so this
      // example is the only place this specific window is observed.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(slot.snapshot().status, 'setup: the retirement had not settled').toBe('retiring');
      expect(hook.current, 'the notification was processed; disposal has not run yet').toEqual({
        status: 'withdrawn',
      });

      releaseGate(releaseDisposal);
      await act(async () => {
        await retiring;
      });
    },
  );

  itDom(
    'once a replacement has fully settled, the old remembered throws -- disposal, not withdrawal, is what revokes it',
    async () => {
      // `lifetime-slot.ts`'s own `transition()` awaits `disposeWithdrawn()` for
      // the OUTGOING runtime before the incoming one is ever published
      // (`await disposeWithdrawn();`, ahead of the `ordinal !== newest` fence
      // and the `built = request.acquire()` call) -- so once `slot.replace()`
      // has been fully awaited, the first runtime's own disposer (packet b's
      // `module.ts`, `store.revoke()`) has already run. This is true with no
      // withdrawal-at-the-source hook at all: see this packet's own plan
      // document, section 4, for the narrower claim this packet makes and the
      // window (before a transition settles) where this is NOT yet true.
      const slot = liveSlot();
      await Promise.resolve();
      const first = slot.snapshot();
      if (first.status !== 'live') throw new Error('setup: expected live');
      const { result: hook } = renderHook(() => useApplicationServicesState(), {
        wrapper: ({ children }) => (
          <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
        ),
      });
      const firstRemembered = expectLive(hook.current).remembered;

      await act(async () => {
        await slot.replace(() => installApplicationRuntime({ openStore: fakeBrowserStorage }));
      });
      const second = slot.snapshot();
      if (second.status !== 'live') throw new Error('setup: expected live');
      const afterReplace = expectLive(hook.current);
      expect(afterReplace.remembered).not.toBe(firstRemembered);
      expect(() => firstRemembered.ganttDetail.read()).toThrow(REVOKED);
    },
  );

  itDom('a retirement that fails leaves the hook withdrawn, never live again', async () => {
    const slot = liveSlot();
    await Promise.resolve();
    if (slot.snapshot().status !== 'live') throw new Error('setup: expected live');
    const { result: hook } = renderHook(() => useApplicationServicesState(), {
      wrapper: ({ children }) => (
        <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
      ),
    });
    expectLive(hook.current);

    // A disposer that rejects makes the retirement -- and the slot -- terminal:
    // the same shape `application-bootstrap.test.tsx`'s own fatal-retirement
    // case uses. `applicationServicesStateFor` maps `fatal` to `withdrawn` the
    // same as any other non-live status.
    await act(async () => {
      await slot.replace(() => {
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        return {
          services: installed.services,
          close: async () => {
            await Promise.reject(new Error('disposal refused'));
          },
        };
      });
    });
    await act(async () => {
      await expect(slot.retire()).rejects.toThrow('disposal refused');
    });
    expect(slot.snapshot().status).toBe('fatal');
    expect(hook.current).toEqual({ status: 'withdrawn' });
  });

  itDom(
    'defaults to the page-wide slot: installs there, is read there, and is withdrawn again on cleanup',
    async () => {
      const installed = await applicationSlot.replace(() =>
        installApplicationRuntime({ openStore: fakeBrowserStorage }),
      );
      try {
        const { result: hook } = renderHook(() => useApplicationServicesState(), {
          wrapper: ({ children }) => (
            <ApplicationServicesProvider>{children}</ApplicationServicesProvider>
          ),
        });
        // No slot prop was passed: this identifies the default is really
        // `applicationSlot` and not merely "some slot with no provider error".
        expect(expectLive(hook.current).remembered).toBe(installed.remembered);
      } finally {
        await applicationSlot.retire();
      }
      expect(applicationSlot.snapshot().status).toBe('empty');
    },
  );
});

/**
 * A generated event against one slot under interleaving. `settle` steps the
 * scheduler by exactly one pending disposal tick; `replace` and `retire` are
 * issued without waiting for anything, so several can be in flight -- one's
 * disposal still pending when the next is requested.
 */
type Command =
  { readonly kind: 'replace' } | { readonly kind: 'retire' } | { readonly kind: 'settle' };

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  { arbitrary: fc.constant<Command>({ kind: 'replace' }), weight: 3 },
  { arbitrary: fc.constant<Command>({ kind: 'retire' }), weight: 2 },
  { arbitrary: fc.constant<Command>({ kind: 'settle' }), weight: 3 },
);

describe('the context, under generated interleavings', () => {
  /**
   * **Starts from an awaited `live` runtime, deliberately.** The slot's own
   * `accept()` only withdraws a runtime that is genuinely `held`; every
   * `replace`/`retire` issued before anything is held finds nothing to
   * withdraw and schedules no disposal.
   *
   * **Tests exactly what this packet's own plan document, section 4, claims
   * and nothing else, at TWO observation points per command, not only at the
   * end of a drained run:** immediately after each command is issued and
   * React's own notification has had a chance to flush (but disposal has
   * NOT been forced to finish -- `scheduler.waitNext` only steps a `settle`
   * command's own tick), the mounted consumer must already agree with the
   * slot's own status for `live`-vs-not; and, once every generated command
   * has fully drained, both consumer and identity are compared against
   * `slot.snapshot()` itself -- an independently maintained ground truth
   * this packet does not implement, not the selector under test. It does
   * **not** claim a withdrawn handle is refused before disposal: see the
   * dedicated example above for what is true once a transition has settled,
   * and this packet's own plan document, section 4, for the window before
   * it has.
   */
  itDom(
    "the mounted consumer never renders live once the slot has left live, and converges to the slot's own truth once notifications are flushed",
    async () => {
      let totalCloses = 0;
      let totalExecuted = 0;
      await fc.assert(
        fc.asyncProperty(
          fc.scheduler(),
          fc
            .array(commandArb, { minLength: 2, maxLength: 6 })
            .filter((commands) => commands.some((command) => command.kind !== 'settle')),
          async (scheduler, commands) => {
            const slot = createLifetimeSlot<ApplicationServices>(50);
            const pending: Promise<unknown>[] = [];
            let closes = 0;
            const acquire = () => {
              const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
              return {
                services: installed.services,
                close: async (options: { timeoutMs: number }) => {
                  closes += 1;
                  await scheduler.schedule(Promise.resolve(), 'dispose the runtime');
                  await installed.close(options);
                },
              };
            };

            await slot.replace(acquire);

            const { result: hook, unmount } = renderHook(() => useApplicationServicesState(), {
              wrapper: ({ children }) => (
                <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>
              ),
            });

            const expectOnlySuperseded = (failure: unknown): void => {
              expect(failure).toBeInstanceOf(TransitionSupersededError);
            };

            for (const command of commands) {
              if (command.kind === 'replace') {
                pending.push(slot.replace(acquire).then(() => undefined, expectOnlySuperseded));
              } else if (command.kind === 'retire') {
                pending.push(slot.retire().then(() => undefined, expectOnlySuperseded));
              } else if (scheduler.count() > 0) {
                await act(async () => {
                  await scheduler.waitNext(1);
                });
              }

              // Observation point 1, per command: flush React's own
              // microtask notification, without forcing any disposal to
              // complete, and require the mounted consumer to already agree
              // with the slot on whether it is live right now -- the exact
              // window review 5's own mutation and probe exposed.
              await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
              });
              expect(hook.current.status === 'live').toBe(slot.snapshot().status === 'live');
            }

            await act(async () => {
              await scheduler.waitIdle();
            });
            await Promise.all(pending);
            await act(async () => {
              await scheduler.waitIdle();
            });
            // One more flush for React's own microtask notification: every
            // transition above is settled, but `useSyncExternalStore`'s
            // subscriber still fires from a microtask (`lifetime-slot.ts`'s
            // own JSDoc, "notifies from a microtask, coalescing").
            await act(async () => {
              await Promise.resolve();
              await Promise.resolve();
            });

            // Observation point 2: the independently maintained expected
            // state, once everything has drained -- the slot's own
            // snapshot, read directly -- never through
            // `applicationServicesStateFor`, which is the selector this
            // property exists to check.
            const expected = slot.snapshot();
            if (expected.status === 'live') {
              const rendered = expectLive(hook.current);
              expect(rendered.remembered).toBe(expected.services.remembered);
              // Exercise the current handle successfully: a real write/read
              // round trip through the rendered facade, never inferred.
              rendered.remembered.ganttDetail.write(true);
              expect(rendered.remembered.ganttDetail.read()).toBe(true);
            } else {
              expect(hook.current).toEqual({ status: 'withdrawn' });
            }

            totalCloses += closes;
            totalExecuted += scheduler
              .report()
              .filter((task: { status: string }) => task.status === 'resolved').length;
            unmount();
          },
        ),
        { seed: 20260929, numRuns: 200 },
      );
      expect(totalCloses, 'no generated run scheduled a real disposal').toBeGreaterThan(0);
      expect(totalExecuted, 'the scheduler never executed a scheduled task').toBeGreaterThan(0);
    },
    60_000,
  );
});
```

### 7.3 `src/runtime/application-bootstrap.tsx`, as a diff

```diff
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
@@
-import { type ReactNode, StrictMode } from 'react';
+import { type ComponentType, type ReactNode, StrictMode } from 'react';
 import { createRoot, type RootOptions } from 'react-dom/client';

 import { App } from '@/app';
 import type { DisclosedFault } from '@/components/chrome/fault-disclosure';
 import { LifetimeFault } from '@/components/chrome/lifetime-fault';
 import { ROOT_FAULT_OPTIONS } from '@/components/chrome/root-fault-options';

 import {
   acquireApplicationRuntime,
   type ApplicationServices,
   applicationSlot,
 } from './application-runtime';
+import { ApplicationServicesProvider } from './application-services-context';
 import { type Acquire, type LifetimeSlot, TransitionSupersededError } from './lifetime-slot';

 /** What the page's bootstrap is wired from; production passes none of it. */
 export interface BootstrapDependencies {
   readonly acquire: Acquire<ApplicationServices>;
   readonly slot: LifetimeSlot<ApplicationServices>;
   readonly mount: (host: Element, options: RootOptions) => { render: (tree: ReactNode) => void };
+  /** The tree drawn once the runtime is live. Defaults to the real `App`. */
+  readonly app: ComponentType;
 }

 const PRODUCTION: BootstrapDependencies = {
   acquire: acquireApplicationRuntime,
   slot: applicationSlot,
   mount: (host, options) => createRoot(host, options),
+  app: App,
 };
@@
   if (dependencies.slot.snapshot().status !== 'live') return;
+  const Tree = dependencies.app;
   rootFor().render(
     <StrictMode>
       {/* Proof: on 2026-09-22, acquiring inside this tree made the Strict Mode
       runtime count 3 instead of 1 (1 failed, 11 passed). */}
-      <App />
+      <ApplicationServicesProvider slot={dependencies.slot}>
+        <Tree />
+      </ApplicationServicesProvider>
     </StrictMode>,
   );
 }
```

The diff above is the finished shape; section 6's slice 2 is deliberately staged across four steps
(2a-i: the field and `PRODUCTION` entry alone, red; 2a-ii: callers and the render swap to a bare
`<Tree />`, green; 2b: the probe test, red; 2c: the provider wrap, green) rather than applied as one
hunk, so each checkpoint's own red or green is genuinely produced by exactly what changed in that
step.

### 7.4 The production-path proof, appended to `application-bootstrap.test.tsx`

```tsx
/** Isolates the ganttDetail write behind a function boundary. */
function writeGanttDetail(remembered: RememberedPreferences, value: boolean): void {
  remembered.ganttDetail.write(value);
}

/** Isolates the ganttDetail read behind a function boundary. */
function readGanttDetail(remembered: RememberedPreferences): boolean | null {
  return remembered.ganttDetail.read();
}

describe('the context this bootstrap publishes', () => {
  itDom(
    'a component under the tree reads the runtime this bootstrap installed, on the slot it was given',
    async () => {
      const slot = createLifetimeSlot<ApplicationServices>(50);
      const host = document.createElement('div');
      const installed: { remembered: RememberedPreferences | null } = { remembered: null };
      const acquire = () => {
        const built = installApplicationRuntime({ openStore: fakeBrowserStorage });
        installed.remembered = built.services.remembered;
        return built;
      };
      const captured: { state: ApplicationServicesState | null } = { state: null };
      const Probe = (): null => {
        const state = useApplicationServicesState();
        // Recorded in an effect, not during render: reassigning an outer
        // variable while rendering is impure and this file's own lint config
        // refuses it (react-hooks/globals, observed 2026-09-22).
        useEffect(() => {
          captured.state = state;
        });
        return null;
      };

      await act(async () => {
        await bootstrapApplication(host, {
          slot,
          acquire,
          mount: (element, options) => createRoot(element, options),
          app: Probe,
        });
      });

      if (installed.remembered === null) throw new Error('setup: acquire never ran');
      const finalState = captured.state;
      if (finalState === null) throw new Error('probe never ran at all');
      if (finalState.status !== 'live') throw new Error('probe never saw a live state');
      writeGanttDetail(finalState.remembered, true);
      expect(readGanttDetail(installed.remembered)).toBe(true);
    },
  );
});
```

Plus, at the top of the file: `import { act, isValidElement, type ReactNode, useEffect } from
'react';`, `import { createRoot } from 'react-dom/client';`, `import type { RememberedPreferences }
from '@/modules/preferences/contract';`, and
`import { type ApplicationServicesState, useApplicationServicesState } from
'./application-services-context';`. `installed` and `captured` are plain mutable objects rather than
bare `let`s, because this checkout's TypeScript 7.0.2 narrows a bare `let` read after an intervening
`await` inconsistently; a property on a stable object does not trigger it.

### 7.5 The `app` additions to the other three call sites, as diffs

`application-bootstrap.test.tsx`, above its first test:

```diff
+/**
+ * The tree these tests draw. A recording root never actually mounts it — see
+ * {@link recordingRoot} — so this stands in for the real `App`, whose own auth
+ * and router machinery has no place in a bootstrap-only test.
+ */
+const FakeApp = (): null => null;
```

and, at each of its **five** `bootstrapApplication(…, { slot, mount: root.mount, … })` call sites:

```diff
     await bootstrapApplication(document.createElement('div'), {
       slot,
       mount: root.mount,
+      app: FakeApp,
       acquire: () => installApplicationRuntime({ openStore: fakeBrowserStorage }),
     });
```

`application-bootstrap.model.test.tsx`:

```diff
+const FakeApp = (): null => null;
+
 /** React writes nothing here, but the bootstrap logs every fatal state it shows. */
@@
                 bootstrapApplication(globalThis.document.createElement('div'), {
                   acquire,
                   slot,
                   mount,
+                  app: FakeApp,
                 }).then(
```

`application-bootstrap.strictmode.test.tsx`:

```diff
+import { App } from '@/app';
 import type { BrowserStorage } from '@/modules/preferences/contract';
@@
         await bootstrapApplication(host, {
           acquire: counted.acquire,
           slot,
           mount: (element, options) => createRoot(element, options),
+          app: App,
         });
```

`e2e/lifetime-fault-probe.ts`:

```diff
+import { App } from '@/app';
 import { bootstrapApplication } from '@/runtime/application-bootstrap';
@@
   await bootstrapApplication(host, {
     acquire: refuseAfterAcquiring,
     slot: createLifetimeSlot<ApplicationServices>(1_000),
     mount: (element, options) => createRoot(element, options),
+    app: App,
   });
```

## 8. Proofs

### 8.1 The context (`application-services-context.tsx`)

Four faults, each a complete replacement expression, each restored and rerun green (12 passed)
before the next.

**Fault 1 — a permanently cached initial snapshot**, replacing the hook's whole body from `const
cache = useRef` onward:

```tsx
const cache = useRef<ApplicationServicesState | null>(null);
if (cache.current === null) {
  cache.current = applicationServicesStateFor(slot);
}
useSyncExternalStore(slot.subscribe, () => cache.current);
return cache.current;
```

`(cd apps/wbs/fe-01 && bunx tsc --build --force tsconfig.json)`: exit 0. `(cd apps/wbs/fe-01 && bunx
vitest run src/runtime/application-services-context.test.tsx)`: **5 failed | 7 passed (12)**,
including the "a retirement that fails leaves the hook withdrawn" example (`expected { status:
'live', remembered: {...} } to deeply equal { status: 'withdrawn' }`) and the property, with a real
shrunk counterexample: `Property failed after 1 tests`, seed `20260929`,
`Counterexample: [schedulerFor()`-> [task${1}] promise::dispose the runtime pending`,[{"kind":"settle"},{"kind":"retire"}]]`,
`Shrunk 1 time(s)`, failing on `expect(hook.current.status === 'live').toBe(slot.snapshot().status === 'live')`
(`expected true to be false`) — the new per-command observation point (7.2).

**Fault 2 — the selector remembers the last-seen live state forever**, replacing
`applicationServicesStateFor`'s whole body and adding one module-level `let` above it:

```tsx
let lastLive: ApplicationServicesState | null = null;

export function applicationServicesStateFor(
  slot: LifetimeSlot<ApplicationServices>,
): ApplicationServicesState {
  const state = slot.snapshot();
  if (state.status === 'live') {
    lastLive = { status: 'live', remembered: state.services.remembered };
    return lastLive;
  }
  return lastLive ?? WITHDRAWN;
}
```

exit 0 typecheck. `bunx vitest run …`: **6 failed | 6 passed (12)** (the module-level `let` also
leaks across this file's own other examples, which is itself an observation about how wrong this
mutation is, not a test-isolation defect to fix), including the property, shrunk:
`Property failed after 3 tests`, seed `20260929`,
`Counterexample: [schedulerFor()`-> [task${1}] promise::dispose the runtime pending`,[{"kind":"replace"},{"kind":"retire"}]]`,
`Shrunk 1 time(s)`.

**Fault 3 — the reviewer's own exact snapshot-callback mutation**, re-serving the cached `live`
state only while the slot is `retiring`, added as the first statement inside the hook's own
`useSyncExternalStore` callback:

```tsx
if (slot.snapshot().status === 'retiring' && cache.current.state.status === 'live') {
  return cache.current.state;
}
```

exit 0 typecheck. `bunx vitest run …`: **2 failed | 10 passed (12)** — this is the fault Important 2
required: it passed **all 11 tests** in the prior round's own suite, and fails now, on exactly the
two checks added by this response — the pending-disposal example (`expected { status: 'live',
remembered: {...} } to deeply equal { status: 'withdrawn' }`) and the property's own new per-command
observation point, shrunk: `Property failed after 1 tests`, seed `20260929`,
`Counterexample: [schedulerFor()`-> [task${1}] promise::dispose the runtime pending`,[{"kind":"settle"},{"kind":"retire"}]]`,
`Shrunk 1 time(s)`, `expected true to be false`.

**Fault 4 — the missing-provider guard replaced by a silent fallback**, replacing the hook's own
first two statements:

```tsx
const slot = useContext(ApplicationServicesContext) ?? applicationSlot;
```

exit 0 typecheck (`applicationSlot` is a real `LifetimeSlot<ApplicationServices>`, so this compiles).
`bunx vitest run …`: **1 failed | 11 passed (12)**. Only `throws when read below no provider` fails:
`expected null to be 'useApplicationServicesState must be r…'` — `hook.current.threw` is `null`,
meaning no exception was reported at all, exactly the observation the fix's own adjacent `Proof:`
comment (7.1) names.

### 8.2 The bootstrap (`application-bootstrap.tsx`)

| Fault                                                                                                   |          `(cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json)`          | Failing observation                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | :-----------------------------------------------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove `<ApplicationServicesProvider>`, rendering a bare `<Tree />`                                     |                                              exit 0                                               | `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx)`: **1 failed \| 5 passed (6)**. Only the probe test fails: `Error: useApplicationServicesState must be read below ApplicationServicesProvider`.                               |
| Pass the wrong, but type-correct, slot: `slot={applicationSlot}` in place of `slot={dependencies.slot}` | exit 0 (`applicationSlot` really is `LifetimeSlot<ApplicationServices>` — this mutation compiles) | **1 failed \| 5 passed (6)**. `Error: probe never saw a live state`, from this test's own setup assertion: the probe reads the untouched, empty `applicationSlot` instead of the test's own local `slot`, so `finalState.status` is `'withdrawn'`, not `'live'`. |

Both faults are against the one probe test built for exactly this seam; every other test in the
file, including the **five** whose `app: FakeApp` never renders, stays green under either mutation.

### 8.3 The split compiler checkpoint and the disputed diagnostic, reproduced and reported as observed

Section 6's slice 2, step 2a-i, was rehearsed in isolation this round: `app: ComponentType` and its
`PRODUCTION` default added, **no caller and no render-body change**, and
`(cd apps/wbs/fe-01 && NX_DAEMON=false bunx tsc --build --force tsconfig.json)` run against exactly
that partial state — not against the finished slice. It reported `Found 8 errors in 4 files`, every
one `TS2741`. Step 2a-ii (callers plus the render swap) was then applied on top and the same command
rerun: exit 0. This packet does not assert `TS2741` because it is preferred; it asserts it because
eight independent runs of the identical command — across five review rounds — against the exact
published edit, from `apps/wbs/fe-01` and from the repository root, produced that code every time,
with a raw, uncoloured terminal capture each time:

```
src/runtime/application-bootstrap.test.tsx(126,63): error TS2741: Property 'app' is missing in type
'{ slot: LifetimeSlot<ApplicationServices>; mount: (host: Element, options: RootOptions) => { render:
(tree: ReactNode) => void; }; acquire: () => RetirableRuntime<...>; }' but required in type
'BootstrapDependencies'.
```

`bunx tsc --version` in this checkout reports `Version 7.0.2` — the new native TypeScript compiler.
Two independent review rounds each report `TS2345` for the identically-described edit, both citing
"the installed TypeScript solution builder" as their own tool. This packet's own repro is a real
`tsc --build --force` invocation, not an in-memory simulation, checked at every one of eight
attempts, and section 6's slice 2 already tells an executor to trust its own terminal over this
document's prose if a different code appears — both candidate codes identify the same eight call
sites and the same one-line fix.

## 9. Verification

### The commands run in this rehearsal — these are historical illustrations of what section 6's own durable blocks executed; they are not to be run bare, and never a bare `vitest`

```bash
(cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-services-context.test.tsx)   # section 6, slice 1, step 1c's own green block
(cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run src/runtime/application-bootstrap.test.tsx \
    src/runtime/application-bootstrap.model.test.tsx \
    src/runtime/application-bootstrap.strictmode.test.tsx)   # section 6, slice 2, step 2c's own green block
(cd apps/wbs/fe-01 && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT \
  bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts)   # section 6, step 0
NX_DAEMON=false bunx nx run wbs-fe-01:typecheck   # section 6, slice 3's own verify block
NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache   # section 6, every slice's own lint step
NX_DAEMON=false bunx nx run wbs-fe-01:build   # section 6, slice 3's own verify block
NX_DAEMON=false bunx nx format:check --all   # section 6, slice 3's own verify block
# the README's strict OpenSpec block -- section 6, slice 3 has it verbatim, with its own status wrapper
```

Observed, from each command's own durable status file cited above: `12 passed (12)`; `8 passed (8)`;
`46 passed (46)` files / `656 passed (656)` tests; exit 0; exit 0; exit 0; exit 0; the `jq` predicate
exits 0 against `114`/`114`/`0`, measured twice (task 4 unticked and ticked), no delta. All exit 0.

### Planner-only, with the values this packet's own planner observed in this rehearsal, logged durably under `$TMPDIR/evidence`

| Planner-only check                                                                                                                                                                                                                                                                              | Status                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tool-devsync:test`, packet's paths staged                                                                                                                                                                                                                                                      | Executed in this rehearsal: status `0`, `366 pass`, `0 fail` — unchanged, an acceptance criterion (section 3.5). Log saved to `$TMPDIR/evidence/tool-devsync-test.log`.                                                                                                                                                                              |
| `wbs-fe-01:test:unit` (Nx target; the sandbox cannot run this — addendum finding, unchanged)                                                                                                                                                                                                    | Executed in this rehearsal: status `0`, `48 passed (48)` files / `676 passed (676)` tests — unchanged, an acceptance criterion (this packet touches no node-tier file). Log saved to `$TMPDIR/evidence/wbs-fe-01-test-unit.log`.                                                                                                                     |
| `wbs-fe-01:test` (Nx target; UTC whole jsdom tier plus the Pacific/Auckland zoned tier)                                                                                                                                                                                                         | Executed in this rehearsal, run to completion in the background (exceeded this session's own 120-second foreground window): informational, not an acceptance criterion — status `0`, combined `133 passed (133)` files / `2966 passed (2966)` tests (UTC half `131`/`2963`, zoned half `2`/`3`), log saved to `$TMPDIR/evidence/wbs-fe-01-test.log`. |
| Whole jsdom tier, `TZ=UTC`, `(cd apps/wbs/fe-01 && bunx vitest run --no-file-parallelism --maxWorkers=1)`                                                                                                                                                                                       | Executed in this rehearsal, run to completion in the background: informational, not an acceptance criterion — status `0`, `131 passed (131)` files / `2963 passed (2963)` tests, log saved to `$TMPDIR/evidence/jsdom-whole-utc.log`.                                                                                                                |
| Pacific/Auckland zoned tier, standalone (`TZ=Pacific/Auckland bunx vitest run --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1`)                                                                                                                                            | Covered by `wbs-fe-01:test` above, which runs it as its own second half; not run standalone in this rehearsal.                                                                                                                                                                                                                                       |
| `wbs-fe-01:e2e` (`e2e/lifetime-fault-probe.ts`'s consumer, `lifetime-fault.spec.ts`), with `CI=1 E2E_PORT_SHIFT=<multiple of 300 away from anything in `ss -ltn`> NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT bunx nx run wbs-fe-01:e2e -- e2e/lifetime-fault.spec.ts` | **Pending planner verification.** Not run in this rehearsal; this packet's one edit to the probe file (`app: App`) is on the fatal-construction path, which `bootstrapApplication`'s `catch` block never reads `dependencies.app` from at all — a structural reason to expect no change, stated rather than substituted for the run.                 |
| `twilight-burokrat:test`                                                                                                                                                                                                                                                                        | Not run: this packet adds no Burokrat source or rule.                                                                                                                                                                                                                                                                                                |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                                                                                                                      | Not run in this environment; pending verification on the host, per repository policy (`CLAUDE.md`'s Gate section) — required before this packet is claimed done.                                                                                                                                                                                     |
| The known `claims.db.test.ts` contention race                                                                                                                                                                                                                                                   | Not encountered in this rehearsal's own runs. If a future whole-suite run shows it, the addendum's own exception applies: record it and rerun once, without treating it as this packet's own defect.                                                                                                                                                 |

## 10. Stop conditions

None of these were true on this packet's own starting tree (`32ad6f7b`), and each is checked against
**each slice's own recorded starting inventory or baseline** (section 3.5 and section 6's own step 0
blocks), never against an absolute number carried forward from an earlier round's response, and
never against an unrestricted `git status` unscoped to owned paths.

- `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-services-context.test.tsx)` exits
  non-zero on the tree as committed, once slice 1 is complete. (False after slice 1: exit 0, `12
passed (12)`.)
- `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx
src/runtime/application-bootstrap.model.test.tsx src/runtime/application-bootstrap.strictmode.test.tsx)`
  exits non-zero, or any of its pre-existing assertions changed, once slice 2 is complete. (False:
  exit 0, `8 passed (8)`, and the diff against packet b's landed file touches only the `app:` field
  additions, the render-body swap, the provider wrap, and the one new `describe` block.)
- `wbs-fe-01:typecheck`, `wbs-fe-01:lint`, `wbs-fe-01:build` or `nx format:check --all` exits
  non-zero on the tree as committed. (False for all four, on this rehearsal's final tree.)
- The sandbox unit command's file or test count differs from **the step-0 baseline that slice
  recorded** (46 files / 656 tests, unchanged at every slice's own step 0). (False: unchanged,
  because this packet touches no node-tier file.)
- The README's strict OpenSpec block's `jq` predicate exits non-zero, or its `passed`/`items` figure
  differs between this rehearsal's own two measurements (task 4 unticked, then ticked). (False:
  `114`/`114`/`0` both times, exit 0.)
- `tool-devsync:test`, with this packet's own exact paths staged, reports any failure, or a pass
  count lower than **this packet's own prior-round baseline** (`366`). (False: `366 pass`, `0 fail`.)
- `wbs-fe-01:test:unit`, run as a planner-only Nx target, exits non-zero or reports a file/test count
  lower than **this packet's own prior-round baseline** (`48`/`676`). (False: exit 0, unchanged in
  this rehearsal.)
- A slice's owned-path jsdom count falls below **that slice's own recorded step-0 baseline plus its
  own required delta** (section 3.5: slice 1 `+1`/`+12`; slice 2 `+0`/`+1`; slice 3 no change).
  (False at every slice in this rehearsal.)
- The whole jsdom tier, or `wbs-fe-01:test`, exits non-zero. (Informational counts only; see section
  9 for this rehearsal's own recorded values.)

## 11. What this packet leaves, in dependency order

1. **050-7-d, page hide, hot reload and restoration** (task 5) — the production trigger for a
   runtime replacement while `<App/>` stays mounted. Section 4's residual table names it the owner
   of **two required outcomes**, both required before the render-lag window this packet measured
   but did not close can be considered closed: (a) reads and writes through a withdrawn runtime's
   facade refuse once withdrawal has been accepted, not only once disposal finishes; (b) a
   validator that retires the runtime from inside its own `isValid` cannot still have its own
   return value trusted. **Neither obligation names a required mechanism.** This packet's own two
   attempts — an access-time guard; a source-level withdrawal hook inside `lifetime-slot.ts`'s
   `accept()` — are recorded as failed attempts, not as proof that no context-side mechanism could
   ever close the gap: section 3.2's own second fact notes that a wrapper could, in principle,
   re-check slot identity synchronously after a validator's own call returns, which this packet has
   not built or ruled out. 050-7-d evaluates whichever mechanism actually closes it — an explicit
   slot-level withdrawal transition, a post-validator liveness check inside the preferences
   resource, a context-side re-check, or something else — against `lifetime-slot.ts`'s own design
   record and packet a's own invariants, and proves it through that file's own model test before
   shipping it.
2. **The five call sites, `modules/preferences/composition.ts`'s deletion, and OpenSpec task 12's
   own disposition of the K2 debt.** Section 3.3 is the measurement; the work itself needs its own
   packet, scoped around the real blast radius (at minimum: a shared test-rendering helper that
   wraps `ApplicationServicesProvider` by default, adopted by every one of
   `gantt-panel.test.tsx`'s 104 `<GanttPanel` uses, `project-page.test.tsx`'s eight `render`/
   `rerender` call sites, `project-settings-modal.test.tsx`'s and `theme.test.ts`'s bare-function
   tests re-pointed at an explicit fixture instead of the module-load singleton) — and
   `remembered-layout.ts`'s module-scope bindings, which are a further, separate escalation past
   that.
3. **050-7-j, the boundary checks and module indexes** (tasks 12 and 13) — where
   `module.frontend.preferences` gets its wiki index, and where task 12's "moves behind a feature of
   its own or is recorded as accepted debt" is formally closed.
4. **050-7-e through 050-7-i** — the session and project runtimes, and log out — unchanged from
   packet b's own section 11 ordering.

## 12. Assumptions recorded rather than asked

- **A bounded, honestly limited claim is worth landing on its own, ahead of the mechanism that would
  close its own residual window, and without asserting that mechanism must take a particular
  shape.** Two attempts at closing the window inside this packet's lane were tried and withdrawn as
  failed attempts (section 4); the context and the bootstrap wiring are real, useful, tested work
  independent of that window, and OpenSpec task 4's own text does not ask this packet to close it.
- **`app` is a required field of `BootstrapDependencies`, not optional with a production default
  merged in.** `dependencies: BootstrapDependencies = PRODUCTION` already only applies when the
  whole parameter is omitted; a test that builds its own object must supply every field or get a
  compile error naming exactly what is missing.
- **The wrong-slot fault is real and type-correct, and this document says so rather than claiming
  otherwise.** `application-bootstrap.tsx` already imports `applicationSlot` for its own
  `PRODUCTION` default, which makes the swap both meaningful and type-correct.
- **The disputed `TS2741`/`TS2345` diagnostic is reported as observed, not resolved by assertion.**
  Section 8.3 and section 6's slice 2 both tell an executor to trust its own terminal.
- **No two-slot identity test is included, because the claim it would prove does not survive this
  round's cut.** The withdrawal hook (and its `hostStore`) that made a cross-runtime identity
  concern meaningful is withdrawn along with the rest of that mechanism; `application-runtime.ts`
  is unmodified, and there is no shared mutable state between two installations to test at all.
- **Status comparisons throughout section 6 are scoped to each slice's own recorded starting
  inventory and owned-path list, and explicitly permit a concurrent planner revision of this
  packet's own plan document.** An unrestricted, unbaselined `git status` comparison would break the
  moment the planner revises this file for any reason unrelated to a slice's own edits.

## 13. Disposition: what this packet found wrong or stale in packet b's landed text

- **Packet b's §11 item 1 undersold this packet's own difficulty.** It described "the five call
  sites moved off `modules/preferences/composition`, and that file deleted with the staged
  duplicate" as this packet's scope. Section 3.3 is the correction.
- **Nothing else was found wrong.** `application-runtime.ts`, `module.ts`, `application-bootstrap.tsx`
  (before this packet's own edit), `lifetime-fault.tsx` and `main.tsx` all read and behaved exactly
  as packet b's own document described them.

## Disposition of review 1

See the original disposition, unchanged by later rounds except where a later round's own opening
table says otherwise.

## Disposition of review 2

Every finding was checked against the repository at the time, and each real defect was fixed in the
prescription then current. Superseded in full by review 3's, review 4's and review 5's own
dispositions below, where this packet's design itself changed twice more since.

## Disposition of review 3

**Corrected here, not merely carried forward: review 3's own findings did not include a "Critical 3"
authorizing an extension to `lifetime-slot.ts`, and no such authorization exists.** The prior
response to review 3 stated one anyway, attributing to review 3 an "explicit authorization,
conditioned on a documented reconciliation," to extend `RetirableRuntime`'s own contract. Review 4
read the actual `review3.md` and found it has exactly two Critical findings, neither of which
authorizes that extension; Critical 1 asked for **post-validator liveness checks**, not a withdrawal
hook inside `accept()`. That invented authorization, and the "Critical 3" disposition entry built on
it, are both wrong and are removed by this response, not merely superseded. What review 3 actually
asked for — closing the re-entrant-validator hole — was attempted anyway (the withdrawal hook), found
to violate `lifetime-slot.ts`'s own design record on a different, independent ground (foreign
callbacks during bookkeeping), and is now withdrawn along with the mechanism review 3 itself asked to
be replaced (the access-time guard). Section 4 states plainly that both were tried and withdrawn as
failed attempts, and why.

## Disposition of review 4

Every finding was checked against the repository, the mandated cut was carried out in full, and every
claim this response makes was rehearsed fresh rather than carried forward. Superseded where review
5's own findings overlap; see review 5's own opening table for what it found each disposition still
lacking, addressed below.

## Disposition of review 5

Every finding was checked against the repository, and every fix was rehearsed fresh: the pending-
disposal test and property observation point were built and confirmed to fail under the reviewer's
own exact mutation before this response; every mutation in section 8.1 is a complete replacement
expression, rehearsed and restored; every verification block in section 6 was re-run after adding
`set -euo pipefail`.

### The pending-disposal test's observed failure under the reviewer's exact mutation

With the reviewer's own snapshot-callback mutation applied (fault 3, section 8.1), and disposal held
open on this test's own gate: `slot.snapshot().status` reads `retiring`; `hook.current` reads
`{status:'live', remembered:{...}}` where `{status:'withdrawn'}` was required — the same
`slot: retiring, hook: live` shape review 5's own probe reported against the mutated tree. Against
the finished (unmutated) implementation, the same probe reports `slot: retiring, hook: withdrawn`.
Both the new example test and the property's new per-command observation point catch the mutation;
full suite result under it: **2 failed | 10 passed (12)**.

### Critical

| Finding                                                                                    | Verdict   | Where, and what changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** failed checks in a verification block do not necessarily fail the block; no `set -e` | **FIXED** | Every independently executed block in section 6 (step 0, each slice's own red/green checkpoints, the OpenSpec block, the planner block) now opens with `set -euo pipefail`. The explicit `if cmd; then …; else …; fi` wrappers for intentionally-red checkpoints are unaffected, since a command tested as an `if` condition is exempt from `set -e` by the shell's own semantics — confirmed against the read-only probe review 5 itself supplied (`bash -c 'test 1 = 0; test 0 = 0'` exits `0` without `-e`, nonzero with it, for the trailing unconditional form). §9's bare slow-command lines are now explicitly labelled historical illustrations, each pointing at the durable block in section 6 that actually ran it, not commands to run bare. |

### Important

| Finding                                                                                        | Verdict   | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** acceptance still uses the author's totals; step 0 collects only node/compiler output     | **FIXED** | Section 3.5 is rewritten around per-slice baselines, each collected by that slice's own step 0 (now including the owned-path jsdom count, not only node+tsc). Acceptance is unchanged node/devsync/OpenSpec counts plus the frontend deltas **slice 1: +1 file/+12 tests** (corrected from the reviewer's own pre-fix +11, explained in section 3.5), **slice 2: +0/+1**, **slice 3: no change**. Every other absolute total in this document is explicitly labelled informational, not an acceptance criterion (section 3.5, section 9, section 10). |
| **2** the tests miss stale rendering after a retirement notification, before disposal finishes | **FIXED** | A new example test, "holds a mounted consumer withdrawn once its notification is flushed, even while disposal is still pending" (7.2), holds disposal open on a gate this test alone controls and asserts `withdrawn` while `slot.snapshot().status` is still `retiring`. A matching per-command observation point was added inside the generated property. The reviewer's exact mutation was rehearsed against both and produces the pasted failure above (section 8.1, fault 3).                                                                    |
| **3** context mutations require invention; the missing-provider guard has no negative proof    | **FIXED** | Section 8.1 now gives all four faults as complete, literal replacement expressions or diffs, restored and rerun green between each. A fourth fault, `useContext(ApplicationServicesContext) ?? applicationSlot`, was added, rehearsed (**1 failed \| 11 passed (12)**, `hook.current.threw` is `null` — no exception reported), restored, and the adjacent `Proof:` comment (7.1) added after confirming the restored tree stays green.                                                                                                               |
| **4** the selector is implemented before its own tests                                         | **FIXED** | Section 6's slice 1 is now staged in three steps: 1a writes a compiling selector skeleton (always `WITHDRAWN`) plus the full test file and observes `2 passed \| 10 failed (12)`; 1b implements the selector for real and observes `3 passed \| 9 failed (12)` (the live-selector test now passes, every hook test still fails on `Error: not implemented`); 1c implements the hook and observes the full green (`12 passed`). All three checkpoints were rehearsed fresh this round.                                                                 |
| **5** the promised status scoping is not implemented; an unrestricted `git status` is demanded | **FIXED** | Each slice's own step 0 now captures `git status --short --untracked-files=all` to a recorded starting-inventory file; each slice's "Ready to commit" comparison is stated against that file plus the slice's own owned-path list, with an explicit line permitting a concurrent planner revision of this packet's own `.md` file (section 6, section 12).                                                                                                                                                                                            |

### Minor

| Finding                                                                                                  | Verdict   | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** "unmodified" wrongly applied to `application-bootstrap.tsx`; "four" should be "five" FakeApp cases | **FIXED** | Section 2 item 2 now applies "unmodified by this packet" only to `application-runtime.ts`, and states plainly that this packet's own slice 2 modifies `application-bootstrap.tsx`. Section 8.2 and section 6's slice 2 now say "five" recording-root `app: FakeApp` cases, matching `application-bootstrap.test.tsx`'s own actual count.                                                                                                                                                 |
| **2** the deferred fix is presented as technically necessary when only its requirement is established    | **FIXED** | Sections 1, 3.2 and 4 now describe both mechanisms as failed attempts, not as proof that no context-side mechanism can close the gap — `preferences.resource.ts`'s synchronous validator call means a wrapper could, in principle, re-check slot identity after that call returns, which this packet has not built or ruled out. 050-7-d's obligation is stated as a required _outcome_, with the implementation choice left open, throughout section 4's residual table and section 11. |

**Nothing was rejected this round.**
