# 050.7 f1 — the theme hook's state machine, its model-based test, and the delivery call sites

|             |                                                                                                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **ninth packet**                                                                                                                                               |
| Size class  | L — three slices, each one executor attempt                                                                                                                                                                                                               |
| Predecessor | [050.7e](050-7-e-page-lifecycle.md), the runtime services of [050.7c](050-7-c-application-context.md), the withdrawal rules of [050.7d](050-7-d-withdrawal-and-page-lifecycle.md)                                                                         |
| Replaces    | [050.7f, held](050-7-f-delivery-call-sites.md). Lesson 16 of the batch addendum asked for a state-machine record and a model-based test before any call-site packet; this packet is that, and it carries the call sites the held packet had converged on. |
| Schema      | OpenSpec change `adopt-frontend-lifetimes`, already `sdd-lean`. Task 3 stays unchecked.                                                                                                                                                                   |

## 1. Goal, non-goals, and the cut

**Goal.** Move `apps/wbs/fe-01/src/lib/theme.ts` off the module-load preferences duplicate
(`modules/preferences/composition.ts`) and onto the page runtime's own preferences, through
`useApplicationServicesState()` — with the hook's lifecycle behaviour written down as a state
machine, executed against a reference model under generated interleavings, and proved to have
teeth by five sabotages of the implementation.

**Non-goals.**

- The other four delivery call sites (`components/wbs/gantt-detail.ts`, `pages/project-page.tsx`,
  `components/wbs/project-settings-modal.tsx`, and `lib/remembered.ts`'s module-scope
  `storedMermaidSectionMode`, which has to become lazy first). They wait on a later packet.
- Deleting `modules/preferences/composition.ts`. It still has four importers.
- The preferences module's wiki index (`module.frontend.preferences`). Task 3 of the change stays
  unchecked for both reasons.
- Any change to `lifetime-slot.ts`, `application-runtime.ts`, `application-services-context.tsx`
  or `application-bootstrap.tsx`. This packet only **reads** them.

**Why `theme.ts` and not the other four.** It is the only delivery site whose stores are all
built inside a React render — so a hook boundary is enough, and no module-scope binding has to
become lazy first. The other four each need a second decision this packet does not take.

## 2. Read first

| File                                                                   | Why                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                           | Rules R1–R5 and the routing index.                                                                   |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                  | "Execution contract", "Standard blocks every packet uses", and the exact strict OpenSpec `jq` block. |
| `apps/wbs/fe-01/src/lib/theme.ts`                                      | The file this packet changes. Its JSDoc is the design record after slice 2.                          |
| `apps/wbs/fe-01/src/modules/preferences/contract.ts`                   | `Remembered`, `Preferences`, `RememberedPreferences`, `IsRuntimeLive` and the two refusal messages.  |
| `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`       | `ensureLive` — the withdrawn refusal, and where every read rechecks liveness.                        |
| `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts` | `revocableStorage` — the revoked refusal.                                                            |
| `apps/wbs/fe-01/src/runtime/application-services-context.tsx`          | `useApplicationServicesState()`, the one hook boundary delivery may read.                            |
| `apps/wbs/fe-01/src/runtime/application-runtime.ts`                    | `installApplicationRuntime`, and how `acquireApplicationRuntime` wires the real `isLive`.            |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts`               | The precedent for a generated property over a real slot: reference model, scheduler, pinned seed.    |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx`      | The precedent for the same shape over a React tree, and for its coverage assertions.                 |
| `apps/wbs/fe-01/project.json`                                          | The exact Nx target names this packet runs.                                                          |

## 3. Design: the state machine this hook is

This section is the record lesson 16 asked for. After slice 2 it also lives as JSDoc on
`useTheme` (`theme.ts`), which is where a reader of the code will look; this section is where a
reviewer of the packet looks. `theme.model.test.tsx` is this record executed.

### 3.1 What the machine is over

`useTheme` owns no lock, no queue and no disposer. It is a **reader** of one value published by
a lifetime slot it does not own: `useApplicationServicesState()` returns `{ status: 'live',
remembered }` or `{ status: 'withdrawn' }`, and the hook turns the live case into one
`Remembered<ThemeChoice>` — its `themeStore`. Everything below is stated over that store.

### 3.2 States

| State         | `themeStore`                                  | What the hook shows                                              |
| ------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| **no store**  | `null`, and never anything else yet           | `choice` = `'system'`, `persists` = `false`                      |
| **live**      | a store built from the published `remembered` | `choice` = that store's own saved answer, `persists` = `true`    |
| **withdrawn** | `null`, after having been a store             | `choice` = `'system'`, `persists` = `false`                      |
| **replaced**  | a _different_ store from the previous one     | `choice` = the new store's own saved answer, `persists` = `true` |

`no store` and `withdrawn` are the same rendered state on purpose: the documented default an
unread key already produces. They are distinct states of the machine because the events that
reach them differ, and because a chooser retained in one of them is still the current chooser in
the other — the store reference is `null` in both, and `null === null`.

### 3.3 Events

| Event                 | Raised by                                                                   |
| --------------------- | --------------------------------------------------------------------------- |
| **render**            | React, for any reason; rebuilds `themeStore` only when `remembered` changed |
| **chooser call**      | a reader operating the control, or any caller holding a `chooseTheme`       |
| **slot notification** | the slot, from a microtask after it has already changed state synchronously |
| **passive effect**    | React, after every layout effect of the same commit has committed           |
| **disposal**          | the retired runtime's own bounded close, at whatever later instant it ends  |

The notification is deferred and the state change is not: `lifetime-slot.ts`'s `accept()`
withdraws publication **before** `retire()`/`replace()` returns, and notifies from a microtask.
Every hazard in this machine lives in that gap.

### 3.4 Invariants

1. **The displayed `choice` and `persists` are functions of the model alone** — of which store is
   published and what that store holds, never of what was painted last.
2. **A superseded chooser never changes the current runtime's state.** A `chooseTheme` whose own
   closured store is not the one the most recent render built reads nothing, writes nothing and
   sets no state.
3. **An unexpected storage failure propagates unchanged**, with the displayed state and the
   stored bytes unchanged. Only a `PreferenceStoreLifecycleError` is recovered from.
4. **Withdrawal is handled at the access boundary that observes it.** The chooser's own write and
   the resync effect's own read each catch the lifecycle refusal where it is raised, and nothing
   catches anything else.

### 3.5 The interleavings that must be covered

Named here because each one is a generated command in `theme.model.test.tsx`, not a hope:

- a chooser call issued **from inside a slot notification** (re-entrant: the slot has already
  withdrawn, React has not yet re-rendered);
- a chooser call while a transition has **only partially acquired** its graph (the factory has
  built the replacement and not yet returned it);
- a **controlled disposal held open** while the withdrawn state is read, so notification and
  disposal are told apart;
- a chooser **retained from a superseded runtime**, called after a replacement;
- a live store whose **write raises an ordinary storage failure**, which is not a lifecycle
  refusal;
- the slot **withdrawn from a layout effect** of the very commit that published it, so the
  passive resync effect reaches its own access boundary.

### 3.6 What this packet does not claim

The model does not simulate the slot's schedule. Which of two overtaking transitions publishes is
`lifetime-slot.ts`'s own claim and `lifetime-slot.model.test.ts` already proves it; this property
holds at most one transition in flight and asserts what `useTheme` does with its outcome. That
boundary is stated in the test's own JSDoc and is the reason the model stays small enough to be
an oracle rather than a second implementation.

## 4. Verified facts

Every number below is a **fresh observation from this packet's own rehearsal**, on
`8cc0f913` (main `5053fafb` plus the batch-6 planning documents), on 2026-09-23. None is carried
forward from the held packet. None is a stop condition for the executor: each slice records its
own baseline in its own step 0 and compares relatively.

| Fact                                                                                                                                                              | How it was observed                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `theme.ts` builds its store at module load: `const storedChoice = rememberedPreferences.themeChoice(isThemeChoice);`                                              | read at `apps/wbs/fe-01/src/lib/theme.ts`, in the unchanged file                              |
| `rememberedTheme`, `readTheme` and `rememberTheme` all close over that one binding, and `isThemeChoice` is module-private                                         | same file                                                                                     |
| `useApplicationServicesState()` returns `{ status: 'live', remembered } \| { status: 'withdrawn' }` and throws only below no provider                             | `src/runtime/application-services-context.tsx`                                                |
| `createPreferences`'s `ensureLive` throws `'the page withdrew this preference store before the access completed'`, and every claim thunk rechecks liveness        | `src/modules/preferences/preferences.resource.ts`                                             |
| `revocableStorage`'s guard throws `'the preferences store was revoked with its runtime'`                                                                          | `src/modules/preferences/browser-storage.repository.ts`                                       |
| both refusals were plain `Error`s before this packet, so a caller could only tell them apart by message text                                                      | same two files                                                                                |
| `createLifetimeSlot`'s `accept()` withdraws publication synchronously and notifies from a microtask; a disposal is awaited with `close({ timeoutMs })`            | `src/runtime/lifetime-slot.ts`, `publish` and `disposeWithdrawn`                              |
| the installed `fast-check` is **4.10.2**, and `fc.asyncModelRun`, `fc.commands` and `fc.scheduler` are all functions on the default export                        | `bun -e` against `node_modules/fast-check`, and `node_modules/fast-check/lib/fast-check.d.ts` |
| `fakeBrowserStorage` already exposes `held()`, the bytes a store holds                                                                                            | `src/modules/preferences/fake-browser-storage.ts`                                             |
| the frontend targets are `test`, `test:unit`, `lint`, `typecheck`, `build`                                                                                        | `apps/wbs/fe-01/project.json`                                                                 |
| `vitest.node-suites.ts` lists `src/modules/preferences/preferences.resource.test.ts` and **not** `browser-storage.repository.test.ts` (which uses `localStorage`) | `apps/wbs/fe-01/vitest.node-suites.ts`                                                        |
| `src/test-tiers.test.ts` asserts tier membership as a partition, with no absolute file count                                                                      | `apps/wbs/fe-01/src/test-tiers.test.ts`                                                       |

Planner observations on `8cc0f913`, **not stop conditions**:

- focused suite (`src/lib/theme.test.ts src/index-bootstrap.test.ts src/app.test.tsx
src/components/chrome/account-menu.test.tsx`): 4 files, 59 tests, exit 0.
- preferences suite (`src/modules/preferences`, default jsdom config): 6 files, 39 tests, exit 0.
- sandbox node suite (the README's own command): 46 files, 674 tests, exit 0.
- strict OpenSpec validation: `{"items": 114, "passed": 114, "failed": 0}`.

## 5. File plan

| File                                                                        | Slice | Create/modify | Responsibility                                                        |
| --------------------------------------------------------------------------- | ----- | ------------- | --------------------------------------------------------------------- |
| `apps/wbs/fe-01/src/modules/preferences/contract.ts`                        | 1     | modify        | `PreferenceStoreLifecycleError` and `isPreferenceStoreLifecycleError` |
| `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`            | 1     | modify        | the withdrawn refusal becomes that class, same message                |
| `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts`      | 1     | modify        | the revoked refusal becomes that class, same message                  |
| `apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts`       | 1     | modify        | classification of the withdrawn refusal                               |
| `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.test.ts` | 1     | modify        | classification of the revoked refusal                                 |
| `apps/wbs/fe-01/src/modules/preferences/fake-browser-storage.ts`            | 2     | modify        | `writeRefusingBrowserStorage`, the ordinary-storage-failure store     |
| `apps/wbs/fe-01/src/lib/theme.model.test.tsx`                               | 2     | **create**    | the state machine, run against a reference model                      |
| `apps/wbs/fe-01/src/lib/theme.ts`                                           | 2     | modify        | the hook over the runtime's store, and the design record as JSDoc     |
| `apps/wbs/fe-01/src/lib/theme.test.ts` → `theme.test.tsx`                   | 2     | **rename**    | every existing assertion, over the runtime's own store                |
| `apps/wbs/fe-01/src/index-bootstrap.test.ts`                                | 2     | modify        | parity check reads a runtime's store, retained and given back         |
| `apps/wbs/fe-01/src/app.test.tsx`                                           | 2     | modify        | `<App/>` rendered below a live slot                                   |
| `apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx`                | 2     | modify        | `ThemeHarness` rendered below a live slot                             |
| `openspec/changes/adopt-frontend-lifetimes/specs/.../spec.md`               | 2     | modify        | the behavioural requirement, **before** the implementation step       |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                       | 2, 3  | modify        | one fresh entry per slice, appended, never overwritten                |
| `apps/wbs/fe-01/src/lib/theme.test.tsx`                                     | 3     | modify        | the nine named transition examples                                    |
| `apps/wbs/fe-01/src/modules/preferences/composition.ts`                     | 3     | modify        | JSDoc: one of the five call sites has moved                           |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                        | 3     | modify        | task 3's note; the box stays **unchecked**                            |

Nothing else. In particular: no `project.json`, no `vitest.node-suites.ts` (the new file is a
`.tsx` under jsdom), no `bun.lock`, no `package.json`.

### Why the migration is in slice 2 and the example-level proofs in slice 3

A deliberate deviation from this packet's own commissioning brief, recorded rather than silent.
`theme.ts`'s three bare functions change signature, so the four test files that call them stop
**compiling** the moment `theme.ts` changes: the batch-3 brief's own rule is that "tests and the
implementation that makes them type-check land in the same slice", and the commit hook lints test
files under `strictTypeChecked` with no relaxation. Splitting them would produce a slice the
planner cannot commit. The nine named transition examples and their nine mutations therefore move
the other way, into slice 3 — the batch-3 brief's own "one dedicated negatives slice". Slice 2's
own red is real and test-first: the model test drives the behaviour.

## 6. Slices

Each slice is one executor attempt. Each ends at a checkpoint: the executor stops, reports, and
the planner reviews and commits before the next slice is dispatched.

### Step 0 — run this at the start of **every** slice, from the repository root

```sh
set -euo pipefail
mkdir -p "${TMPDIR:?}/evidence"
base=$(git rev-parse HEAD)
echo "base=$base" | tee "$TMPDIR/evidence/base.txt"
git status --porcelain | tee "$TMPDIR/evidence/status-before.txt"
```

Expected: `base=` one 40-character hash, and an empty or short status list. **Every ownership
check in this packet compares against this recorded `base`, never against a fixed historical
hash.** A pre-existing modification to a file this slice owns is a stop; a modification to any
other file is recorded and preserved.

Then, before any edit, the three comparison runs. Each is wrapped so a failure is visible and its
status is durable:

```sh
set -euo pipefail
cd apps/wbs/fe-01
if bunx vitest run src/lib/theme.test.ts src/index-bootstrap.test.ts src/app.test.tsx \
  src/components/chrome/account-menu.test.tsx > "$TMPDIR/evidence/base-focused.log" 2>&1
then status=0; else status=$?; fi
echo "status=$status" >> "$TMPDIR/evidence/base-focused.log"
if bunx vitest run src/modules/preferences > "$TMPDIR/evidence/base-preferences.log" 2>&1
then status=0; else status=$?; fi
echo "status=$status" >> "$TMPDIR/evidence/base-preferences.log"
if bunx vitest run --config vitest.node.config.ts --exclude playwright-config.test.ts \
  --exclude src/components/wbs/short-date.test.ts > "$TMPDIR/evidence/base-sandbox.log" 2>&1
then status=0; else status=$?; fi
echo "status=$status" >> "$TMPDIR/evidence/base-sandbox.log"
grep -E "Test Files|Tests |^status=" "$TMPDIR/evidence"/base-*.log
```

Expected: `status=0` in all three, and a `Test Files`/`Tests` line for each. **Record the three
numbers. Every later count in this slice is stated as those numbers plus this slice's own
additions.** From slice 2 onward the first command's path is `src/lib/theme.test.tsx`, because
slice 2 renames the file.

In the sandbox the executor never runs `wbs-fe-01:test` or `wbs-fe-01:test:unit` (three tests in
two files spawn `bun` from Node and the sandbox refuses it). Those, and `wbs-fe-01:build`, are
**planner-only**, named in section 9 with the expected relative delta.

### Slice 1 — one typed lifecycle refusal, at the two sites that already raise it

Owns: `contract.ts`, `preferences.resource.ts`, `browser-storage.repository.ts`,
`preferences.resource.test.ts`, `browser-storage.repository.test.ts`.

- [ ] 1. Step 0 above.
- [ ] 2. Apply section 7.1 (`contract.ts`): `PreferenceStoreLifecycleError` with
      `kind: 'withdrawn' | 'revoked'`, and `isPreferenceStoreLifecycleError`.
- [ ] 3. Apply section 7.4 and 7.5, the two classification tests. They assert the caught value's
      own type and `kind` and deliberately **not** its message: the message assertions already in
      these files, and in `module.test.ts`, would keep passing for a plain `Error`, which is
      exactly why they cannot establish the classification.
- [ ] 4. Apply sections 7.2 and 7.3: the two `throw new Error(...)` calls become
      `throw new PreferenceStoreLifecycleError(<same message constant>, '<kind>')`. Both message
      constants are untouched.
- [ ] 5. Run the preferences suite and compare with step 0's recorded number:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  if bunx vitest run src/modules/preferences > "$TMPDIR/evidence/s1-preferences.log" 2>&1
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/s1-preferences.log"
  grep -E "Test Files|Tests |^status=" "$TMPDIR/evidence/s1-preferences.log"
  ```

  Expected: `status=0`, the same file count as step 0, and **step 0's test count + 2**. Rehearsed:
  39 → 41.

- [ ] 6. Run the sandbox node suite the same way. Expected: `status=0`, the same file count, and
      step 0's test count **+ 1** — `preferences.resource.test.ts` is in the node tier and
      `browser-storage.repository.test.ts` is not. Rehearsed: 674 → 675.
- [ ] 7. Durable typecheck and lint:

  ```sh
  set -euo pipefail
  if NX_DAEMON=false bunx nx run wbs-fe-01:typecheck > "$TMPDIR/evidence/s1-typecheck.log" 2>&1
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/s1-typecheck.log"
  if NX_DAEMON=false bunx nx run wbs-fe-01:lint > "$TMPDIR/evidence/s1-lint.log" 2>&1
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/s1-lint.log"
  grep -E "^status=|error" "$TMPDIR/evidence"/s1-typecheck.log "$TMPDIR/evidence"/s1-lint.log
  ```

  Expected: `status=0` in both. An autofixable import-order or Prettier lint error is fixed with
  `bunx eslint --fix <file>`, not reported as a stop (preamble rule 17).

- [ ] 8. The two negative proofs of section 8.1, each with the README's restore-and-compare form.
      Add no `Proof:` comment before the failure has been observed; then add each one, with **the
      date the executor observed it**.
- [ ] 9. Owned-file Prettier, then hand over.

  ```sh
  set -euo pipefail
  GSETTINGS_BACKEND=memory bunx prettier --write \
    apps/wbs/fe-01/src/modules/preferences/contract.ts \
    apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts \
    apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts \
    apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts \
    apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.test.ts
  GSETTINGS_BACKEND=memory bunx prettier --check \
    apps/wbs/fe-01/src/modules/preferences/contract.ts \
    apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts \
    apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts \
    apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts \
    apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.test.ts
  git status --short --untracked-files=all
  ```

  Expected: `All matched files use Prettier code style!`, and exactly these five paths modified
  (plus any file a required `Proof:` comment touched — here, the same five).

Planner commit subject: `feat(preferences): type the store's lifecycle refusal`.

### Slice 2 — the model test, the hook, and the call sites that must compile with it

Owns: `fake-browser-storage.ts`, `theme.model.test.tsx` (new), `theme.ts`,
`theme.test.ts` → `theme.test.tsx`, `index-bootstrap.test.ts`, `app.test.tsx`,
`account-menu.test.tsx`, `specs/adopt-frontend-lifetimes/spec.md`, `verify.md`.

- [ ] 1. Step 0 above, with `src/lib/theme.test.ts` still at its old name in the focused command.
- [ ] 2. **OpenSpec first (R4).** Apply section 7.13, the behavioural requirement, and validate
      with the README's exact strict block (section 9 repeats it). Expected: the block exits 0,
      and `passed` is step 0's number, unchanged — the item count is per requirement-document, not
      per scenario.
- [ ] 3. Apply section 7.6 (`fake-browser-storage.ts`): `writeRefusingBrowserStorage`.
- [ ] 4. Create `src/lib/theme.model.test.tsx` from section 7.7, whole.
- [ ] 5. Rename and migrate the four call-site test files, **test-first, before `theme.ts`**:

  ```sh
  set -euo pipefail
  mv apps/wbs/fe-01/src/lib/theme.test.ts apps/wbs/fe-01/src/lib/theme.test.tsx
  test -f apps/wbs/fe-01/src/lib/theme.test.tsx
  test ! -e apps/wbs/fe-01/src/lib/theme.test.ts
  ```

  A filesystem `mv`, never `git mv`: the executor's `.git` is read-only (preamble rule 1). The
  wrapper these tests add needs JSX, which a `.ts` file cannot parse. Deleting the old path is
  authorised, and it is the only deletion this packet authorises. Then apply sections 7.9, 7.10,
  7.11 and 7.12.

- [ ] 6. **Red checkpoint**, with `theme.ts` still unchanged. Run both, and record what they
      really say:

  ```sh
  set -euo pipefail
  if NX_DAEMON=false bunx nx run wbs-fe-01:typecheck > "$TMPDIR/evidence/s2-red-typecheck.log" 2>&1
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/s2-red-typecheck.log"
  grep -E "error TS|Found [0-9]+ error|^status=" "$TMPDIR/evidence/s2-red-typecheck.log"
  cd apps/wbs/fe-01
  if bunx vitest run src/lib/theme.test.tsx src/lib/theme.model.test.tsx src/index-bootstrap.test.ts \
    src/app.test.tsx src/components/chrome/account-menu.test.tsx \
    > "$TMPDIR/evidence/s2-red-vitest.log" 2>&1
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/s2-red-vitest.log"
  grep -E "Test Files|Tests |^status=" "$TMPDIR/evidence/s2-red-vitest.log"
  ```

  Expected, and rehearsed exactly: typecheck `status=1`, `Found 12 errors in 3 files.` —

  | File                           | Diagnostics                                                                                                                                                   |
  | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `src/index-bootstrap.test.ts`  | `TS2724` `'"./lib/theme"' has no exported member named 'isThemeChoice'`; one `TS2554: Expected 0 arguments, but got 1.`                                       |
  | `src/lib/theme.model.test.tsx` | `TS2724` on `isThemeChoice`; `TS2339: Property 'persists' does not exist on type 'Theme'.`; `TS2322: Type 'unknown' is not assignable to type 'ThemeChoice'.` |
  | `src/lib/theme.test.tsx`       | `TS2724` on `isThemeChoice`; five `TS2554: Expected 0 arguments, but got 1.`; one `TS2339` on `persists`                                                      |

  `app.test.tsx` and `account-menu.test.tsx` produce **no** diagnostics: they never call the three
  bare functions. And Vitest `status=1`, `Test Files 2 failed | 3 passed (5)`,
  `Tests 4 failed | 56 passed (60)`, with these four failures and these reasons — esbuild strips
  types, so the extra argument to the still-zero-argument functions is simply ignored at runtime
  and the real failures are about **which store** the unchanged hook reads:

  | Failing test                                                               | Observed message                           | Why                                                                                       |
  | -------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
  | model test, `shows and persists exactly what the model says…`              | `persists: expected undefined to be false` | the unchanged `Theme` has no `persists`                                                   |
  | `opens on the answer this browser last gave, without a paint in between`   | `expected 'system' to be 'dark'`           | the old hook reads real `localStorage`, which `beforeEach` cleared, not the injected fake |
  | `drops an answer it cannot read, from an effect rather than from a render` | `expected '"midnight"' to be undefined`    | the drop went to real `localStorage`; the fake's corrupt key is still there               |
  | `writes the answer down as it is chosen, and paints it`                    | `expected undefined to be '"dark"'`        | the write went to real `localStorage`, not to the injected fake                           |

- [ ] 7. Apply section 7.8, `theme.ts`.
- [ ] 8. **Green checkpoint.** Rerun the two commands of step 6 into
      `s2-green-typecheck.log`/`s2-green-vitest.log`. Expected: `status=0` for both,
      `Test Files 5 passed (5)`, and **step 0's focused test count + 1** (the model test itself).
      Rehearsed: 59 → 60.
- [ ] 9. Durable lint (same wrapper as slice 1 step 7). Expected `status=0`. Two findings were
      rehearsed and are already fixed in section 7.7's listing — they are named here so a reviewer
      knows they were met, not avoided: `@typescript-eslint/no-unnecessary-condition` on reading a
      flag the type checker believes is still `true` (the counter is incremented inside the layout
      effect that clears it instead), and `@typescript-eslint/no-confusing-void-expression` on an
      arrow returning `unmount()` (braced).
- [ ] 10. Rerun the preferences suite and the sandbox node suite. Expected: both unchanged from
      slice 1's own numbers, `status=0`.
- [ ] 11. The five sabotage proofs of section 8.2, each restored and `cmp`-verified before the
      next. Add the adjacent `Proof:` comments to `theme.ts` only after observing each failure,
      each dated with the executor's own observed date.
- [ ] 12. Owned-file Prettier (`--write` then `--check`) over the eight owned code and document
      paths, then append this slice's own entry to
      `openspec/changes/adopt-frontend-lifetimes/verify.md` — its own observations, in this shape:

  - the three step-0 baselines, as numbers;
  - the red checkpoint's status, diagnostic count and the four runtime failures as printed;
  - the green checkpoint's status and counts;
  - typecheck, lint, preferences and sandbox statuses;
  - the five sabotages, each with its seed, run number, shrunk command sequence and message;
  - what stayed **pending planner verification**: `wbs-fe-01:test`, `wbs-fe-01:test:unit`,
    `wbs-fe-01:build`, `tool-devsync:test` and the host gate.

  Evidence references are basenames relative to this attempt's evidence directory — never an
  absolute path. Do not read, quote or restate any earlier entry in that file.

- [ ] 13. Hand over with `git status --short --untracked-files=all`. Expected exactly: the eight
      owned paths modified, `src/lib/theme.model.test.tsx` and `src/lib/theme.test.tsx` as new,
      and `src/lib/theme.test.ts` as deleted.

Planner commit subject: `feat(theme): read the palette off the page runtime's preferences`.

### Slice 3 — the named transition examples, their mutations, and the closing checks

Owns: `theme.test.tsx`, `composition.ts`, `tasks.md`, `verify.md`.

- [ ] 1. Step 0 above (the focused command now names `src/lib/theme.test.tsx`).
- [ ] 2. Apply section 7.14: the nine named transition examples. These are not test-first — the
      behaviour landed in slice 2, driven by the model test — and that is exactly why every one of
      them gets its own independent mutation in step 4. Expected on running
      `bunx vitest run src/lib/theme.test.tsx`: `status=0`, step 0's `theme.test.tsx` count **+ 9**.
      Rehearsed: 17 → 26.
- [ ] 3. Prove every proof filter selects exactly one test **before** injecting anything:

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  while IFS= read -r title; do
    out=$(bunx vitest run src/lib/theme.test.tsx -t "$title" --reporter=verbose 2>&1)
    n=$(printf '%s' "$out" | grep -cE "^ +✓ ")
    printf '%s matched %s\n' "$n" "$title"
    test "$n" -eq 1
  done < "$TMPDIR/evidence/proof-titles.txt"
  ```

  with `proof-titles.txt` holding section 8.3's nine titles, one per line, **copied byte for byte
  including the typographic apostrophes**. Expected: nine lines each beginning `1 matched`. A `0`
  is a stop, not a licence to guess a different filter.

- [ ] 4. The nine example-level mutations of section 8.3, in order, each restored and
      `cmp`-verified before the next. `Proof:` comments are added only after each observation.
- [ ] 5. Apply section 7.15 (`composition.ts`'s JSDoc) and 7.16 (`tasks.md`'s note; the box stays
      unchecked). Rerun the strict OpenSpec block. Expected: exits 0, `passed` unchanged.
- [ ] 6. Durable typecheck and lint (slice 1's wrapper). Expected `status=0` for both.
- [ ] 7. Repository-wide format check, after owned-file Prettier:

  ```sh
  set -euo pipefail
  GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/fe-01/src/lib/theme.test.tsx \
    apps/wbs/fe-01/src/modules/preferences/composition.ts \
    openspec/changes/adopt-frontend-lifetimes/tasks.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md
  GSETTINGS_BACKEND=memory bunx prettier --check apps/wbs/fe-01/src/lib/theme.test.tsx \
    apps/wbs/fe-01/src/modules/preferences/composition.ts \
    openspec/changes/adopt-frontend-lifetimes/tasks.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md
  if NX_DAEMON=false bunx nx format:check --all > "$TMPDIR/evidence/s3-format.log" 2>&1
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/s3-format.log"
  cat "$TMPDIR/evidence/s3-format.log"
  ```

  Expected: `status=0` and no listed file. Never a repository-wide format **write**.

- [ ] 8. Rerun the focused suite, the preferences suite and the sandbox node suite. Expected:
      focused = step 0's count + 9; the other two unchanged; `status=0` everywhere.
- [ ] 9. Append this slice's own fresh entry to `verify.md`, in the same shape as slice 2's, with
      its own observations and its own pending list. Do not restate slice 2's entry.
- [ ] 10. Hand over with `git status --short --untracked-files=all`. Expected exactly four paths.

Planner commit subject: `test(theme): name the hook's four lifecycle transitions`.

### Dispatch

Each slice is dispatched alone, from the reviewed packet, with no network and no `--seed`: no
slice here reads another attempt's evidence. The launcher line is the only place in this document
that carries an absolute path:

```
/home/df/wd/puni/puni-plan/exec/run-executor.sh <attempt-id> docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md --slice <1|2|3>
```

## 7. The code

Sixteen fenced diffs. Section 9 records the script that extracts them from this document's own
final, Prettier-formatted text and the exact output of `git apply --check` over all sixteen, in
slice order, with the `mv` in its place.

### 7.1 `apps/wbs/fe-01/src/modules/preferences/contract.ts` — the typed refusal

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/contract.ts b/apps/wbs/fe-01/src/modules/preferences/contract.ts
index 4f33cfc5..3b519754 100644
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
+ * Two call sites throw it, over the same two messages they always have — this
+ * class changes nothing about *when* a refusal happens or what it says, only
+ * whether a caller can tell it apart from an unmodelled failure without
+ * matching on message text:
+ *
+ * - `preferences.resource.ts`'s `ensureLive`, `kind: 'withdrawn'` — the slot is
+ *   not `live` right now, checked synchronously.
+ * - `browser-storage.repository.ts`'s `revocableStorage`, `kind: 'revoked'` —
+ *   this store's own runtime has already given it back.
+ *
+ * A delivery consumer (`lib/theme.ts`'s `useTheme`) catches only this class —
+ * {@link isPreferenceStoreLifecycleError} — and rethrows everything else: R5's
+ * rule that a catch is for modeled recovery, never a blanket swallow. A storage
+ * failure that is not a lifecycle refusal (a browser with site data blocked,
+ * {@link BrowserStorage}'s own JSDoc) still propagates out of a delivery call
+ * site exactly as it always has.
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

### 7.2 `apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts`

The `WITHDRAWN` message constant is untouched, so every `toThrow('the page withdrew this
preference store…')` assertion in this file's own test keeps passing — `toThrow` matches on
`message`, not on constructor identity.

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

### 7.3 `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts`

The same treatment, over the same `REVOKED` message constant. `module.test.ts`'s three
message-based assertions on this refusal are unaffected and are not edited.

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

### 7.4 `apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts`

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts b/apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts
index c75dbef7..402696bc 100644
--- a/apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/preferences.resource.test.ts
@@ -1,6 +1,7 @@
 import fc from 'fast-check';
 import { describe, expect, it, test } from 'vitest';

+import { isPreferenceStoreLifecycleError, PreferenceStoreLifecycleError } from './contract';
 import { fakeBrowserStorage } from './fake-browser-storage';
 import { createPreferences } from './preferences.resource';

@@ -404,4 +405,30 @@ describe('once the runtime that owns this store is no longer live', () => {
       { seed: 20260924, numRuns: 200 },
     );
   });
+
+  /**
+   * The refusal is **classified**, not only worded: a delivery consumer has to
+   * tell a lifecycle refusal apart from an unmodelled storage failure without
+   * matching on message text, which is what `lib/theme.ts`'s own narrow catch
+   * does. Asserted on the caught value's own type and `kind`, deliberately not
+   * on its message — the message assertions elsewhere in this file already
+   * cover the wording and would keep passing for a plain `Error`.
+   */
+  test('a withdrawn refusal is a lifecycle refusal of kind withdrawn', () => {
+    const store = fakeBrowserStorage();
+    const withdrawn = createLiveness();
+    const held = createPreferences(store, withdrawn.isLive).unchecked('wbs.demo.id');
+    withdrawn.live = false;
+
+    let caught: unknown = null;
+    try {
+      held.write('p1');
+    } catch (refusal) {
+      caught = refusal;
+    }
+
+    expect(isPreferenceStoreLifecycleError(caught)).toBe(true);
+    expect(caught).toBeInstanceOf(PreferenceStoreLifecycleError);
+    expect(caught instanceof PreferenceStoreLifecycleError ? caught.kind : null).toBe('withdrawn');
+  });
 });
```

### 7.5 `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.test.ts`

`revocableStorage` had no test of its own in this file before — only `module.test.ts` reached it,
and only through its message. This adds the classification, and the import of
`revocableStorage` and `fakeBrowserStorage` it needs.

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.test.ts b/apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.test.ts
index a499c1c8..d2c11993 100644
--- a/apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.test.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.test.ts
@@ -1,6 +1,8 @@
 import { beforeEach, expect, test } from 'vitest';

-import { browserStorage } from './browser-storage.repository';
+import { browserStorage, revocableStorage } from './browser-storage.repository';
+import { isPreferenceStoreLifecycleError, PreferenceStoreLifecycleError } from './contract';
+import { fakeBrowserStorage } from './fake-browser-storage';

 beforeEach(() => {
   localStorage.clear();
@@ -26,3 +28,27 @@ test('forget removes a key', () => {
 test('an absent key reads null', () => {
   expect(browserStorage().read('wbs.absent')).toBeNull();
 });
+
+/**
+ * The revoked refusal is **classified**, not only worded — the same reason
+ * `preferences.resource.test.ts` asserts the withdrawn one's own `kind`: a
+ * delivery consumer narrows on the class, never on message text. `module.test.ts`
+ * already covers the wording of this same refusal and would keep passing for a
+ * plain `Error`, which is why this asserts the type and the `kind` and nothing
+ * about the message.
+ */
+test('a revoked store refuses with a lifecycle refusal of kind revoked', () => {
+  const store = revocableStorage(fakeBrowserStorage({ 'wbs.demo': 'held' }));
+  store.revoke();
+
+  let caught: unknown = null;
+  try {
+    store.read('wbs.demo');
+  } catch (refusal) {
+    caught = refusal;
+  }
+
+  expect(isPreferenceStoreLifecycleError(caught)).toBe(true);
+  expect(caught).toBeInstanceOf(PreferenceStoreLifecycleError);
+  expect(caught instanceof PreferenceStoreLifecycleError ? caught.kind : null).toBe('revoked');
+});
```

### 7.6 `apps/wbs/fe-01/src/modules/preferences/fake-browser-storage.ts`

The ordinary-storage-failure store both the model test and the named example need. It lives here
rather than in either test file because two files need it and R3 puts shared knowledge with what
it describes.

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/fake-browser-storage.ts b/apps/wbs/fe-01/src/modules/preferences/fake-browser-storage.ts
index 57108280..432aac5d 100644
--- a/apps/wbs/fe-01/src/modules/preferences/fake-browser-storage.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/fake-browser-storage.ts
@@ -20,3 +20,28 @@ export function fakeBrowserStorage(seed: Record<string, string> = {}): BrowserSt
     held: () => Object.fromEntries(held),
   };
 }
+
+/**
+ * The same in-memory store, whose `write` raises an ordinary storage failure.
+ *
+ * The "site data blocked" case {@link BrowserStorage}'s own JSDoc describes:
+ * reads and forgets behave normally, so a runtime installed over this is live in
+ * every other respect, and only the write refuses. It is **not** a lifecycle
+ * refusal, so nothing above it may recover from it — which is what a delivery
+ * consumer's own negative proofs need a store for.
+ */
+export function writeRefusingBrowserStorage(
+  seed: Record<string, string> = {},
+): BrowserStorage & HeldByFake {
+  const held = fakeBrowserStorage(seed);
+  return {
+    read: (key) => held.read(key),
+    write: () => {
+      throw new Error('write denied');
+    },
+    forget: (key) => {
+      held.forget(key);
+    },
+    held: () => held.held(),
+  };
+}
```

### 7.7 `apps/wbs/fe-01/src/lib/theme.model.test.tsx` — **new file**

The state machine of section 3, executed. `fc.commands` generates the eight commands, `fc.scheduler`
holds every disposal open until a command releases it, and the reference model keeps its **own**
expected bytes per store — it never reads a production store for its oracle, which is the defect
that cost the held packet its third round. No `catch` swallows a transition's rejection. The seed
and run count are pinned (`seed: 20260925, numRuns: 300`, `maxCommands: 12`), and the coverage
assertions after `fc.assert` refuse a run in which any command kind, the superseded chooser, the
refusing write or the layout-effect withdrawal never actually happened.

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.model.test.tsx b/apps/wbs/fe-01/src/lib/theme.model.test.tsx
new file mode 100644
index 00000000..5a54fb81
--- /dev/null
+++ b/apps/wbs/fe-01/src/lib/theme.model.test.tsx
@@ -0,0 +1,592 @@
+import { act, cleanup, render } from '@testing-library/react';
+import fc from 'fast-check';
+import { type ReactNode, useLayoutEffect } from 'react';
+import { afterEach, describe, expect, it } from 'vitest';
+
+import type { BrowserStorage } from '../modules/preferences/contract';
+import {
+  fakeBrowserStorage,
+  type HeldByFake,
+  writeRefusingBrowserStorage,
+} from '../modules/preferences/fake-browser-storage';
+import {
+  type ApplicationServices,
+  installApplicationRuntime,
+} from '../runtime/application-runtime';
+import { ApplicationServicesProvider } from '../runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '../runtime/lifetime-slot';
+import { isThemeChoice, type Theme, THEME_KEY, type ThemeChoice, useTheme } from './theme';
+
+// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
+const hasDom = typeof document !== 'undefined';
+const itDom = hasDom ? it : it.skip;
+
+/** The three stores a generated runtime can be installed over. */
+type StoreName = 'A' | 'B' | 'denied';
+
+const STORE_NAMES: readonly StoreName[] = ['A', 'B', 'denied'];
+
+/**
+ * How many times each command actually ran, across the **whole pinned run**.
+ *
+ * A generated property whose commands are all skipped by their own `check`
+ * preconditions proves nothing, so every counter is asserted non-zero once
+ * `fc.assert` returns — the same guard `application-bootstrap.model.test.tsx`
+ * and `lifetime-slot.model.test.ts` both carry.
+ */
+const ran: Record<string, number> = {};
+
+/** Records that one command kind really executed. */
+function note(kind: string): void {
+  ran[kind] = (ran[kind] ?? 0) + 1;
+}
+
+/** Every command kind, so the coverage assertion below cannot silently miss one. */
+const COMMAND_KINDS: readonly string[] = [
+  'choose',
+  'retire',
+  'replace',
+  'chooseFromNotification',
+  'chooseWhileAcquiring',
+  'retainChooser',
+  'useRetainedChooser',
+  'replaceThenRetireFromLayoutEffect',
+];
+
+/** Counts, additionally, the interleavings the invariants are actually about. */
+const reached = { supersededChooser: 0, deniedWrite: 0, withdrawnFromLayoutEffect: 0 };
+
+/**
+ * What this hook's state machine is, as a reference implementation that shares
+ * nothing with the production stores.
+ *
+ * `bytes` is the model's **own** record of what each store should hold. It is
+ * never read back out of the fakes, which is what makes the storage assertion an
+ * oracle rather than a tautology: the first draft of this property derived its
+ * expected choice from the same stores the hook writes into, and a hook with no
+ * persistence at all passed every run of it (round 3, Critical 1).
+ *
+ * `storeIdentity` models the **reference** `chooseTheme`'s own superseded guard
+ * compares: a fresh number for every publication, and `null` while the hook
+ * holds no store. `null` therefore equals `null`, which is the behaviour a first
+ * draft of this model got wrong — it counted transitions instead, and so
+ * predicted that a chooser retained while withdrawn was superseded once the hook
+ * was withdrawn a second time. The implementation compares object identity, and
+ * `null === null`: a chooser retained while there was no store is the current
+ * chooser again whenever there is no store again.
+ */
+interface ThemeModel {
+  liveStore: StoreName | null;
+  storeIdentity: number | null;
+  /** How many store identities have been handed out, so the next one is fresh. */
+  identities: number;
+  choice: ThemeChoice;
+  persists: boolean;
+  bytes: Partial<Record<StoreName, string>>;
+  /** The store identity a chooser retained by {@link RetainChooser} closed over. */
+  retained: { readonly identity: number | null } | null;
+}
+
+/** What one generated run drives: one page, one slot, three stores. */
+interface ThemeWorld {
+  readonly slot: LifetimeSlot<ApplicationServices>;
+  readonly stores: Record<StoreName, BrowserStorage & HeldByFake>;
+  readonly captured: { theme: Theme | null };
+  /** Set to make the sibling below retire from its next layout effect. */
+  readonly armed: { layoutRetire: boolean };
+  /** Every transition this run issued, so teardown can await them all. */
+  readonly pending: Promise<unknown>[];
+  /** A chooser retained from an earlier render, once {@link RetainChooser} ran. */
+  retained: ((choice: ThemeChoice) => void) | null;
+  /** What a chooser called from inside a slot notification threw, if anything. */
+  notificationRefusal: { thrown: unknown };
+  readonly scheduler: fc.Scheduler;
+  readonly unmount: () => void;
+}
+
+/**
+ * The page under test: the hook, plus the layout effect that can withdraw the
+ * slot before the hook's own passive resync effect for the same commit runs.
+ *
+ * The layout effect lives in **this** component rather than in a sibling, and
+ * that is a measured decision, not a shortcut: React runs every layout effect of
+ * a commit before every passive effect of that commit, so the ordering is the
+ * same either way — but a sibling that renders no state of its own never
+ * re-renders when the slot publishes (`useSyncExternalStore` re-renders only the
+ * component that reads it), so its layout effect never ran on the publishing
+ * commit at all. A first draft did exactly that and the armed retirement was a
+ * no-op on every run.
+ */
+function ObservesTheme({ world }: { world: ThemeWorld }): null {
+  world.captured.theme = useTheme();
+  useLayoutEffect(() => {
+    if (!world.armed.layoutRetire) return;
+    if (world.slot.snapshot().status !== 'live') return;
+    world.armed.layoutRetire = false;
+    reached.withdrawnFromLayoutEffect += 1;
+    world.pending.push(world.slot.retire());
+  });
+  return null;
+}
+
+function Page({ world }: { world: ThemeWorld }): ReactNode {
+  return (
+    <ApplicationServicesProvider slot={world.slot}>
+      <ObservesTheme world={world} />
+    </ApplicationServicesProvider>
+  );
+}
+
+/**
+ * The runtime the generated `replace` commands publish: the **production**
+ * installer over one of this run's stores, with the same liveness predicate
+ * `acquireApplicationRuntime` wires in production.
+ *
+ * Its bounded close is held open behind `scheduler.schedule`, so a disposal only
+ * completes when a command releases it. That is what lets every withdrawal
+ * command assert the rendered state while the runtime is still letting go —
+ * notification and disposal are separate events, and only one of them is what
+ * `useTheme` reacts to.
+ */
+function acquireOver(world: ThemeWorld, target: StoreName) {
+  return () => {
+    const installed = installApplicationRuntime({
+      openStore: () => world.stores[target],
+      isLive: () => world.slot.snapshot().status === 'live',
+    });
+    return {
+      services: installed.services,
+      close: async (options: { timeoutMs: number }) => {
+        await world.scheduler.schedule(Promise.resolve(), `dispose ${target}`);
+        await installed.close(options);
+      },
+    };
+  };
+}
+
+/** What the model says the hook must be showing, and what each store must hold. */
+function assertAgrees(model: ThemeModel, world: ThemeWorld): void {
+  const theme = world.captured.theme;
+  expect(theme, 'the page rendered no theme at all').not.toBeNull();
+  if (theme === null) return;
+  expect(theme.choice, 'displayed choice').toBe(model.choice);
+  expect(theme.persists, 'persists').toBe(model.persists);
+  for (const name of STORE_NAMES) {
+    expect(world.stores[name].held()[THEME_KEY], `stored bytes in ${name}`).toBe(model.bytes[name]);
+  }
+  expect(
+    world.notificationRefusal.thrown,
+    'a chooser called from inside a slot notification threw',
+  ).toBeNull();
+}
+
+/** Lets React commit the slot's own deferred notification, releasing no disposal. */
+async function flushNotification(): Promise<void> {
+  await act(async () => {
+    await Promise.resolve();
+  });
+}
+
+/**
+ * Releases every scheduled disposal this transition needs and awaits it.
+ *
+ * No `catch` anywhere: a transition that rejects is a finding, not noise, and it
+ * propagates out of the property.
+ */
+async function settle(world: ThemeWorld, issued: Promise<unknown>): Promise<void> {
+  await act(async () => {
+    await world.scheduler.waitFor(issued);
+  });
+  await flushNotification();
+}
+
+/** What the model says the store this hook currently reads should now hold. */
+function applyLiveWrite(model: ThemeModel, value: ThemeChoice): void {
+  if (model.liveStore === null) {
+    model.choice = value;
+    model.persists = false;
+    return;
+  }
+  if (model.liveStore === 'denied') {
+    // The write raises an ordinary storage failure; invariant 3 says nothing
+    // moves and the failure propagates. The caller asserts the throw.
+    return;
+  }
+  model.bytes[model.liveStore] = JSON.stringify(value);
+  model.choice = value;
+  model.persists = true;
+}
+
+/** What the model says the hook shows once the store `target` is published. */
+function applyPublished(model: ThemeModel, target: StoreName): void {
+  model.liveStore = target;
+  model.identities += 1;
+  model.storeIdentity = model.identities;
+  const stored = model.bytes[target];
+  const parsed: unknown = stored === undefined ? undefined : JSON.parse(stored);
+  model.choice = isThemeChoice(parsed) ? parsed : 'system';
+  model.persists = true;
+}
+
+/** What the model says the hook shows once nothing is published any more. */
+function applyWithdrawn(model: ThemeModel): void {
+  model.liveStore = null;
+  model.storeIdentity = null;
+  model.choice = 'system';
+  model.persists = false;
+}
+
+type ThemeCommand = fc.AsyncCommand<ThemeModel, ThemeWorld>;
+
+/** A chooser call through the hook's own current return value. */
+class Choose implements ThemeCommand {
+  constructor(readonly value: ThemeChoice) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
+    note('choose');
+    const chooseTheme = world.captured.theme?.chooseTheme;
+    expect(chooseTheme, 'the page rendered no chooser').toBeDefined();
+    if (chooseTheme === undefined) return;
+    if (model.liveStore === 'denied') {
+      reached.deniedWrite += 1;
+      expect(() => {
+        act(() => {
+          chooseTheme(this.value);
+        });
+      }, 'an ordinary storage failure did not propagate').toThrow('write denied');
+    } else {
+      await act(async () => {
+        chooseTheme(this.value);
+        await Promise.resolve();
+      });
+    }
+    applyLiveWrite(model, this.value);
+    assertAgrees(model, world);
+  }
+  toString(): string {
+    return `choose(${this.value})`;
+  }
+}
+
+/** Retirement, with its disposal held open while the withdrawn state is read. */
+class Retire implements ThemeCommand {
+  check(model: ThemeModel): boolean {
+    return model.liveStore !== null;
+  }
+  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
+    note('retire');
+    const issued = world.slot.retire();
+    world.pending.push(issued);
+    await flushNotification();
+    applyWithdrawn(model);
+    // Read while the disposal is still pending: notification, not disposal, is
+    // what this hook follows.
+    assertAgrees(model, world);
+    await settle(world, issued);
+    assertAgrees(model, world);
+  }
+  toString(): string {
+    return 'retire';
+  }
+}
+
+/** Replacement by a runtime over `target`, with its disposal held open likewise. */
+class Replace implements ThemeCommand {
+  constructor(readonly target: StoreName) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
+    note('replace');
+    const wasLive = model.liveStore !== null;
+    const issued = world.slot.replace(acquireOver(world, this.target));
+    world.pending.push(issued);
+    if (wasLive) {
+      await flushNotification();
+      applyWithdrawn(model);
+      assertAgrees(model, world);
+    }
+    await settle(world, issued);
+    applyPublished(model, this.target);
+    assertAgrees(model, world);
+  }
+  toString(): string {
+    return `replace(${this.target})`;
+  }
+}
+
+/**
+ * A chooser call issued from **inside** a slot notification — re-entrancy, the
+ * shape lesson 16 names: the callback runs while the slot has already withdrawn
+ * publication synchronously but React has not yet re-rendered this hook.
+ */
+class ChooseFromNotification implements ThemeCommand {
+  constructor(readonly value: ThemeChoice) {}
+  check(model: ThemeModel): boolean {
+    return model.liveStore !== null;
+  }
+  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
+    note('chooseFromNotification');
+    let armed = true;
+    const unsubscribe = world.slot.subscribe(() => {
+      if (!armed) return;
+      armed = false;
+      try {
+        world.captured.theme?.chooseTheme(this.value);
+      } catch (refusal) {
+        world.notificationRefusal.thrown = refusal;
+      }
+    });
+    try {
+      const issued = world.slot.retire();
+      world.pending.push(issued);
+      await flushNotification();
+      await settle(world, issued);
+    } finally {
+      unsubscribe();
+    }
+    applyWithdrawn(model);
+    assertAgrees(model, world);
+  }
+  toString(): string {
+    return `chooseFromNotification(${this.value})`;
+  }
+}
+
+/**
+ * A chooser call while a transition has only **partially acquired** its graph:
+ * the factory has built the new runtime and not yet returned it, so the slot is
+ * mid-transition and the chooser's own closured store is the withdrawn one.
+ */
+class ChooseWhileAcquiring implements ThemeCommand {
+  constructor(
+    readonly target: StoreName,
+    readonly value: ThemeChoice,
+  ) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
+    note('chooseWhileAcquiring');
+    const acquire = acquireOver(world, this.target);
+    const issued = world.slot.replace(() => {
+      const acquired = acquire();
+      try {
+        world.captured.theme?.chooseTheme(this.value);
+      } catch (refusal) {
+        world.notificationRefusal.thrown = refusal;
+      }
+      return acquired;
+    });
+    world.pending.push(issued);
+    await settle(world, issued);
+    applyPublished(model, this.target);
+    assertAgrees(model, world);
+  }
+  toString(): string {
+    return `chooseWhileAcquiring(${this.target}, ${this.value})`;
+  }
+}
+
+/** Keeps the chooser this render offers, to call again after a later transition. */
+class RetainChooser implements ThemeCommand {
+  check(): boolean {
+    return true;
+  }
+  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
+    note('retainChooser');
+    const chooseTheme = world.captured.theme?.chooseTheme;
+    expect(chooseTheme, 'the page rendered no chooser to retain').toBeDefined();
+    if (chooseTheme === undefined) return;
+    world.retained = chooseTheme;
+    model.retained = { identity: model.storeIdentity };
+    await Promise.resolve();
+    assertAgrees(model, world);
+  }
+  toString(): string {
+    return 'retainChooser';
+  }
+}
+
+/**
+ * The retained chooser, called now. Superseded once the hook has moved to a
+ * different store, and then a documented no-op — invariant 2.
+ */
+class UseRetainedChooser implements ThemeCommand {
+  constructor(readonly value: ThemeChoice) {}
+  check(model: ThemeModel): boolean {
+    return model.retained !== null;
+  }
+  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
+    note('useRetainedChooser');
+    const retained = world.retained;
+    expect(retained, 'no chooser was retained').not.toBeNull();
+    if (retained === null) return;
+    const superseded = model.retained?.identity !== model.storeIdentity;
+    if (superseded) reached.supersededChooser += 1;
+    if (!superseded && model.liveStore === 'denied') {
+      expect(() => {
+        act(() => {
+          retained(this.value);
+        });
+      }, 'an ordinary storage failure did not propagate').toThrow('write denied');
+    } else {
+      await act(async () => {
+        retained(this.value);
+        await Promise.resolve();
+      });
+    }
+    if (!superseded) applyLiveWrite(model, this.value);
+    assertAgrees(model, world);
+  }
+  toString(): string {
+    return `useRetainedChooser(${this.value})`;
+  }
+}
+
+/**
+ * A replacement whose publishing commit is itself withdrawn again by a sibling's
+ * layout effect — the resync effect's own access boundary, reached for real.
+ */
+class ReplaceThenRetireFromLayoutEffect implements ThemeCommand {
+  constructor(readonly target: StoreName) {}
+  check(): boolean {
+    return true;
+  }
+  async run(model: ThemeModel, world: ThemeWorld): Promise<void> {
+    note('replaceThenRetireFromLayoutEffect');
+    const wasLive = model.liveStore !== null;
+    world.armed.layoutRetire = true;
+    const issued = world.slot.replace(acquireOver(world, this.target));
+    world.pending.push(issued);
+    if (wasLive) await flushNotification();
+    await settle(world, issued);
+    const pending = [...world.pending];
+    await act(async () => {
+      await world.scheduler.waitFor(Promise.all(pending));
+    });
+    await flushNotification();
+    world.armed.layoutRetire = false;
+    applyPublished(model, this.target);
+    applyWithdrawn(model);
+    assertAgrees(model, world);
+  }
+  toString(): string {
+    return `replaceThenRetireFromLayoutEffect(${this.target})`;
+  }
+}
+
+const choiceArb = fc.constantFrom<ThemeChoice>('system', 'light', 'dark');
+const storeArb = fc.constantFrom<StoreName>('A', 'B', 'denied');
+
+const commandsArb = fc.commands<ThemeModel, ThemeWorld, false>(
+  [
+    choiceArb.map((value) => new Choose(value)),
+    fc.constant(new Retire()),
+    storeArb.map((target) => new Replace(target)),
+    choiceArb.map((value) => new ChooseFromNotification(value)),
+    fc.tuple(storeArb, choiceArb).map(([target, value]) => new ChooseWhileAcquiring(target, value)),
+    fc.constant(new RetainChooser()),
+    choiceArb.map((value) => new UseRetainedChooser(value)),
+    storeArb.map((target) => new ReplaceThenRetireFromLayoutEffect(target)),
+  ],
+  { maxCommands: 12 },
+);
+
+afterEach(() => {
+  cleanup();
+});
+
+/**
+ * The theme hook's state machine, run against a reference model.
+ *
+ * The record this executes is section 4 of
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`, and
+ * `useTheme`'s own JSDoc names the same four invariants. The slot, the installer
+ * and the preferences module are the production ones; only the browser store and
+ * the timing of a disposal are this file's.
+ */
+describe("the theme hook's state machine, against a reference model", () => {
+  itDom(
+    'shows and persists exactly what the model says, under generated interleavings',
+    async () => {
+      await fc.assert(
+        fc.asyncProperty(fc.scheduler(), commandsArb, async (scheduler, commands) => {
+          const stores: Record<StoreName, BrowserStorage & HeldByFake> = {
+            A: fakeBrowserStorage(),
+            B: fakeBrowserStorage(),
+            denied: writeRefusingBrowserStorage(),
+          };
+          const world: ThemeWorld = {
+            slot: createLifetimeSlot<ApplicationServices>(30_000),
+            stores,
+            captured: { theme: null },
+            armed: { layoutRetire: false },
+            pending: [],
+            retained: null,
+            notificationRefusal: { thrown: null },
+            scheduler,
+            unmount: () => undefined,
+          };
+          const held = render(<Page world={world} />);
+          const real: ThemeWorld = {
+            ...world,
+            unmount: () => {
+              held.unmount();
+            },
+          };
+          try {
+            await fc.asyncModelRun<ThemeModel, ThemeWorld, false, ThemeModel>(
+              () => ({
+                model: {
+                  liveStore: null,
+                  storeIdentity: null,
+                  identities: 0,
+                  choice: 'system',
+                  persists: false,
+                  bytes: {},
+                  retained: null,
+                },
+                real,
+              }),
+              commands,
+            );
+          } finally {
+            // Unmount before the awaited retirement, so nothing renders against a
+            // slot that is already letting go, and run both whatever happened.
+            real.unmount();
+            const draining = Promise.all(
+              real.pending.map((issued) => issued.then(undefined, () => undefined)),
+            );
+            real.pending.push(real.slot.retire().then(undefined, () => undefined));
+            await scheduler.waitIdle();
+            await draining;
+            await Promise.all(
+              real.pending.map((issued) => issued.then(undefined, () => undefined)),
+            );
+          }
+        }),
+        { seed: 20260925, numRuns: 300 },
+      );
+
+      for (const kind of COMMAND_KINDS) {
+        expect(ran[kind] ?? 0, `the pinned run never executed ${kind}`).toBeGreaterThan(0);
+      }
+      expect(
+        reached.supersededChooser,
+        'the pinned run never called a superseded chooser',
+      ).toBeGreaterThan(0);
+      expect(
+        reached.deniedWrite,
+        'the pinned run never wrote into a store that refuses writes',
+      ).toBeGreaterThan(0);
+      expect(
+        reached.withdrawnFromLayoutEffect,
+        "the pinned run never withdrew the slot from a layout effect before the hook's own resync effect",
+      ).toBeGreaterThan(0);
+    },
+    300_000,
+  );
+});
```

### 7.8 `apps/wbs/fe-01/src/lib/theme.ts`

No `Proof:` comment appears in this listing. Slice 2 step 11 adds them, one per observed sabotage,
at the lines section 8.2 names, each dated with the executor's own observation date.

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.ts b/apps/wbs/fe-01/src/lib/theme.ts
index 8b67409d..194a67cc 100644
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
@@ -44,22 +46,31 @@ export const DARK_QUERY = '(prefers-color-scheme: dark)';
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
+ * The choice as this browser last said it, over the given store — and `system`
+ * where it has never said, which is the state every reader starts in.
+ *
+ * Takes its store rather than closing over a module-load singleton:
+ * {@link useTheme} is this file's one caller inside a render tree, and it builds
+ * the store from {@link useApplicationServicesState} instead — a module-scope
+ * binding here would be built at import time, before any runtime exists.
  *
- * The stored value is a claim, not a fact, and {@link remembered} is where that
+ * The stored value is a claim, not a fact, and {@link Remembered} is where that
  * is dealt with for every key this app holds: anything that is not one of the
  * three takes the key with it and the answer goes back to `system`.
+ *
+ * @throws `PreferenceStoreLifecycleError` when `themeStore`'s own runtime has
+ * gone withdrawn or been revoked since this store was built — see
+ * `modules/preferences/contract.ts`. {@link useTheme}'s own resync effect is the
+ * one caller that catches it; every other caller runs it against a store it
+ * knows is live.
  */
-export function rememberedTheme(): ThemeChoice {
+export function rememberedTheme(themeStore: Remembered<ThemeChoice>): ThemeChoice {
   // Proof: `readAndDrop` replaced by `read`, which is what "read the claim,
   // drop nothing" comes to. `refuses a stored answer that is not one of the
   // three, and drops the key` failed on `expected '"midnight"' to be null` —
@@ -68,14 +79,14 @@ export function rememberedTheme(): ThemeChoice {
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
@@ -87,13 +98,13 @@ export function rememberedTheme(): ThemeChoice {
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
@@ -143,12 +154,28 @@ export function paintPalette(palette: Palette): void {
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
+   * Whether this browser is remembering `choice` right now — `false` for exactly
+   * as long as the application services are withdrawn, including the transient
+   * window between a store going withdrawn and this hook's next render: nothing
+   * here reads or writes a store, `choice` is the in-tree default or a
+   * local-only pick, and no write reaches the reader's browser.
+   *
+   * The explicit, visible degradation R5 asks for — a silently-accepted,
+   * unpersisted choice is exactly the misleading behaviour
+   * `browser-storage.repository.ts`'s own JSDoc warns against for a blocked
+   * store.
+   */
+  persists: boolean;
 }

 /**
@@ -167,25 +194,83 @@ export interface Theme {
  * {@link readTheme} and not {@link rememberedTheme}, because the initialiser is
  * a render: dropping an unreadable key is a write, StrictMode calls this twice
  * on purpose, and the rule against a side effect in a function React may call
- * twice is the one `chooseTheme` states at the bottom of this file. The drop
- * happens in the mount effect below instead. Nothing on screen moved either
- * way — see {@link readTheme}.
+ * twice is the one `chooseTheme` states below. The drop happens in the resync
+ * effect instead. Nothing on screen moved either way — see {@link readTheme}.
+ *
+ * ## The state machine
+ *
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`
+ * section 4 is the record, and `theme.model.test.tsx` is that record executed
+ * against this hook. In short: four states of the store this hook reads (no
+ * store; live; withdrawn after live; replaced by another live one), five events
+ * (render, chooser call, slot notification, this effect, disposal), and four
+ * invariants —
+ *
+ * 1. the displayed `choice` and `persists` are functions of the model alone,
+ * 2. a superseded chooser never changes the current runtime's state,
+ * 3. an unexpected storage failure propagates unchanged, with the displayed
+ *    state and the stored bytes unchanged, and
+ * 4. withdrawal is handled at the access boundary that observes it — the
+ *    chooser's own write and this effect's own read each catch the lifecycle
+ *    refusal where it is raised, and nothing else.
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
+   * The store the most recent render built, read by `chooseTheme` below to tell
+   * a superseded closure apart from the current one — invariant 2.
+   *
+   * Assigned in the render body rather than from an effect: an effect would
+   * leave one commit where a stale closure could read a stale ref, and the write
+   * here is idempotent.
+   */
+  const themeStoreRef = useRef<Remembered<ThemeChoice> | null>(themeStore);
+  themeStoreRef.current = themeStore;
+
+  const [choice, setChoice] = useState<ThemeChoice>(() =>
+    themeStore ? readTheme(themeStore) : 'system',
+  );
+  const [persists, setPersists] = useState<boolean>(() => themeStore !== null);
   const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => systemMedia().matches);

   /**
-   * Drops a stored answer this module cannot read, once, after the first paint.
+   * Resyncs `choice`/`persists` to the store this render holds — on mount, on
+   * withdrawal, and on reactivation or replacement.
+   *
+   * {@link rememberedTheme} rather than {@link readTheme} on the live branch:
+   * the write half of the drop, exactly as it was before this hook read the
+   * runtime's own store. Its return value reseeds `choice` directly, which is
+   * what makes a newly published runtime's own saved answer the displayed one.
    *
-   * The write half of {@link rememberedTheme}, moved out of the initialiser
-   * above. Its return value is the same answer `readTheme` already gave — the
-   * state is not re-seeded from it, because between the two calls nothing but
-   * this line can have written the key.
+   * The `themeStore` this effect closes over can itself go withdrawn between
+   * this render and this effect actually running — a passive effect runs after
+   * every layout effect has committed, and a sibling's layout effect can retire
+   * the slot in between. `rememberedTheme` then raises the lifecycle refusal;
+   * caught here as the same recoverable transition the withdrawn branch already
+   * models, never left to reach `AppFaultBoundary`, because a withdrawn tick is
+   * a normal lifecycle event and not a fault. Anything else is rethrown.
    */
   useEffect(() => {
-    rememberedTheme();
-  }, []);
+    if (!themeStore) {
+      setChoice('system');
+      setPersists(false);
+      return;
+    }
+    try {
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
@@ -217,15 +302,36 @@ export function useTheme(): Theme {
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
+      // render read, so a replacement runtime made this callback stale
+      // (invariant 2). A no-op, before any store access or state write at all.
+      if (themeStore !== themeStoreRef.current) return;
+      if (!themeStore) {
+        setChoice(next);
+        setPersists(false);
+        return;
+      }
+      try {
+        // Written before `setChoice` below, on purpose: an unexpected failure —
+        // never a lifecycle refusal, which is caught just below — must
+        // propagate without this hook ever having shown a choice it could not
+        // keep (invariant 3).
+        rememberTheme(themeStore, next);
+      } catch (refusal) {
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
@@ -244,6 +350,8 @@ export function useTheme(): Theme {
 export interface ThemeContextValue {
   choice: ThemeChoice;
   chooseTheme: (choice: ThemeChoice) => void;
+  /** See {@link Theme.persists}. Not yet read by any consumer below this provider. */
+  persists: boolean;
 }

 const ThemeContext = createContext<ThemeContextValue | null>(null);
@@ -254,8 +362,11 @@ const ThemeContext = createContext<ThemeContextValue | null>(null);
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

### 7.9 `apps/wbs/fe-01/src/lib/theme.test.ts` → `theme.test.tsx`, as a diff after the `mv`

Apply this **after** the `mv` of slice 2 step 5. Both sides of the header name the new path, so
`git apply` checks it against the moved file; applying it before the `mv` fails with
`error: apps/wbs/fe-01/src/lib/theme.test.tsx: No such file or directory`.

Every existing assertion survives. Three move from real `localStorage` to the injected fake's own
`held()`, because that is the store the hook now reads and writes: the corrupt-key removal, the
chosen-answer write, and the stored-answer open. The bare-function cases go through a real
`installApplicationRuntime`, retained and given back.

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.test.tsx b/apps/wbs/fe-01/src/lib/theme.test.tsx
index 9ee795e..d6af811 100644
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

@@ -26,14 +37,85 @@ const itDom = hasDom ? it : it.skip;
 const platform = (): DriveableMediaQueryList =>
   window.matchMedia(DARK_QUERY) as DriveableMediaQueryList;

+/**
+ * Every {@link LifetimeSlot} this file built, retired by this file's own
+ * `afterEach` rather than by each test body — so a slot a failed assertion left
+ * live is still given back. `retire()` on an already-empty slot is a documented
+ * no-op, so retiring one a test retired itself costs nothing, and lifecycle under
+ * test stays distinct from fixture teardown.
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
+ * A slot `live` over the production installer, its liveness predicate wired
+ * exactly as `acquireApplicationRuntime` wires the real one — not
+ * `installApplicationRuntime()` bare, whose default `isLive` is always `true` and
+ * so could never reproduce a withdrawn access. `store` defaults to a fresh
+ * in-memory fake rather than real `localStorage`, so a test can tell the
+ * runtime's own store apart from `composition.ts`'s module-load singleton, which
+ * always wraps the real one.
+ *
+ * Awaits the real `replace` promise, so the slot is genuinely `live` on return.
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
+ * A runtime's own theme store, over a fresh, real installation — the runtime path
+ * the bare-function cases below now take instead of importing `composition.ts`'s
+ * module-load duplicate. Retained and given back after `run`, matching
+ * `composition-agreement.test.ts`'s own pattern.
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
+ * React `cleanup()` first, before any slot this file built is retired, including
+ * after a failed assertion: `afterEach` runs whatever the test body reached.
+ */
+afterEach(async () => {
   cleanup();
+  const slots = builtSlots.splice(0);
+  await Promise.all(slots.map((slot) => slot.retire()));
 });

 /**
@@ -58,31 +140,39 @@ describe('what the theme setting resolves to', () => {
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
@@ -92,7 +182,9 @@ describe('what this browser remembers', () => {
     // Watched on h2puni under vitest, 2026-08-12.
     localStorage.setItem(THEME_KEY, JSON.stringify('midnight'));

-    expect(readTheme()).toBe('system');
+    await withThemeStore((themeStore) => {
+      expect(readTheme(themeStore)).toBe('system');
+    });
     expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify('midnight'));
   });
 });
@@ -120,50 +212,60 @@ describe('what the theme puts on the document', () => {
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
+    // The removal is now asserted against the store this hook really reads and
+    // writes, through the injected fake's own `held()`, rather than against the
+    // module-load singleton it no longer touches.
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
@@ -174,8 +276,9 @@ describe('the theme, followed and remembered while the app is open', () => {
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
@@ -188,9 +291,10 @@ describe('the theme, followed and remembered while the app is open', () => {
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
@@ -204,7 +308,7 @@ describe('the theme, followed and remembered while the app is open', () => {
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
   });

-  itDom('stops listening to the machine once it is gone', () => {
+  itDom('stops listening to the machine once it is gone', async () => {
     // **The class cannot answer this and the listener count can.** This test
     // asserted only the third block below, and it could not fail: `paintPalette`
     // runs from a `useEffect`, React runs no effect for an unmounted hook, so
@@ -224,7 +328,8 @@ describe('the theme, followed and remembered while the app is open', () => {
     // asserted is the *difference* one mount and one unmount make.
     const before = platform().listenerCount;

-    const held = renderHook(() => useTheme());
+    const { slot } = await liveSlot();
+    const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
     expect(platform().listenerCount, 'the hook never subscribed at all').toBe(before + 1);

     held.unmount();
```

### 7.10 `apps/wbs/fe-01/src/index-bootstrap.test.ts`

```diff
diff --git a/apps/wbs/fe-01/src/index-bootstrap.test.ts b/apps/wbs/fe-01/src/index-bootstrap.test.ts
index ff3d2fb0..be388b55 100644
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
+          // duplicate. Retained and given back, matching
+          // `composition-agreement.test.ts`'s own pattern.
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

### 7.11 `apps/wbs/fe-01/src/app.test.tsx`

`afterEach` does React `cleanup()` **first** and then awaits the slot's retirement, so nothing
renders against a slot that is already letting go.

```diff
diff --git a/apps/wbs/fe-01/src/app.test.tsx b/apps/wbs/fe-01/src/app.test.tsx
index 0bdfd43c..f259378d 100644
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
@@ -16,13 +20,32 @@ vi.mock('@/lib/api', async (importOriginal) => ({

 const { App } = await import('./app');

+/**
+ * A slot `live` over the production installer, its liveness predicate wired
+ * exactly as `acquireApplicationRuntime` wires the real one, rebuilt fresh every
+ * test and retired in `afterEach` **after** React cleanup.
+ *
+ * `<App/>`'s own tree includes `ThemeProvider`, which reads
+ * `useApplicationServicesState()` (see `lib/theme.ts`), and the theme-control
+ * block below persists a choice across an unmount and a fresh mount — which
+ * needs a real, live store behind it.
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
@@ -32,10 +55,19 @@ beforeEach(() => {
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
@@ -44,7 +76,7 @@ afterEach(() => {

 describe('the app root', () => {
   itDom('shows the sign-in link when there is no browser session', async () => {
-    render(<App />);
+    renderApp();

     // The boundary is transparent when nothing throws: the app it wraps is
     // what renders, and this is what says so.
@@ -63,7 +95,7 @@ describe('the app root', () => {
       headers: new Headers(),
     });

-    render(<App />);
+    renderApp();

     await waitFor(() => {
       expect(screen.getByRole('heading', { name: 'WBS tool v2' })).toBeDefined();
@@ -75,7 +107,7 @@ describe('the app root', () => {
   itDom('offers sign-in when the session check fails', async () => {
     me.mockRejectedValue(new Error('network down'));

-    render(<App />);
+    renderApp();

     await waitFor(() => {
       expect(screen.getByRole('link', { name: 'Continue with SSO' })).toBeDefined();
@@ -97,7 +129,7 @@ describe('a signed-in address asked for while signed out', () => {
   itDom('draws the sign-in form and no directory', async () => {
     window.history.replaceState({}, '', '/directory');

-    render(<App />);
+    renderApp();

     await waitFor(() => {
       expect(screen.getByRole('link', { name: 'Continue with SSO' })).toBeDefined();
@@ -136,7 +168,7 @@ describe('a signed-in address asked for while signed out', () => {
       }),
     );

-    render(<App />);
+    renderApp();

     // The page that was asked for, not the project — and the address it was
     // asked at, unrewritten.
@@ -186,7 +218,7 @@ describe('the theme control through the app', () => {

   itDom('reports the answer just chosen, and only that one, without a reload', async () => {
     signedIn();
-    render(<App />);
+    renderApp();
     await waitFor(() => {
       expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
     });
@@ -205,7 +237,7 @@ describe('the theme control through the app', () => {
   itDom('reports the answer that was chosen, and only that one, after a reload', async () => {
     signedIn();
     for (const answer of ['System', 'Light', 'Dark']) {
-      const first = render(<App />);
+      const first = renderApp();
       await waitFor(() => {
         expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
       });
@@ -214,7 +246,7 @@ describe('the theme control through the app', () => {
       first.unmount();

       // A reload is a fresh mount: the control reads the stored answer, not a default.
-      const second = render(<App />);
+      const second = renderApp();
       await waitFor(() => {
         expect(screen.getByRole('button', { name: 'kat' })).toBeDefined();
       });
```

### 7.12 `apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx`

This file had no `afterEach` at all and relied on the global auto-cleanup. It now calls
`cleanup()` explicitly before awaiting retirement, for the same ordering reason as 7.11.

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx b/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx
index 8b316d76..db2fa6b1 100644
--- a/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx
@@ -1,7 +1,11 @@
-import { fireEvent, render, screen, within } from '@testing-library/react';
-import { describe, expect, it, vi } from 'vitest';
+import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

 import { DARK_CLASS, THEME_KEY, useTheme } from '@/lib/theme';
+import { browserStorage } from '@/modules/preferences/browser-storage.repository';
+import { type ApplicationServices, installApplicationRuntime } from '@/runtime/application-runtime';
+import { ApplicationServicesProvider } from '@/runtime/application-services-context';
+import { createLifetimeSlot, type LifetimeSlot } from '@/runtime/lifetime-slot';

 import { AccountMenu, type AccountMenuProps } from './account-menu';

@@ -288,9 +292,40 @@ function ThemeHarness() {
 describe('the theme control, wired to the hook that owns it', () => {
   const answers = ['System', 'Light', 'Dark'] as const;

-  beforeEach(() => {
+  /**
+   * A slot `live` over the production installer, its liveness predicate wired
+   * exactly as `acquireApplicationRuntime` wires the real one — not
+   * `installApplicationRuntime()` bare, whose default `isLive` is always `true`.
+   * Rebuilt fresh every test and retired in `afterEach` **after** an explicit
+   * React `cleanup()`: {@link ThemeHarness} calls `useTheme`, which reads
+   * `useApplicationServicesState()` (see `lib/theme.ts`), and this block's own
+   * "after a reload" case persists a choice across an unmount and a fresh mount.
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
+    // React cleanup first, so nothing renders against a slot already retiring.
+    cleanup();
+    await slot.retire();
   });

   const open = () => {
@@ -301,7 +336,7 @@ describe('the theme control, wired to the hook that owns it', () => {
     screen.getByRole('menuitemradio', { name }).getAttribute('aria-checked') ?? '';

   itDom('reports the answer just chosen, for every answer, and only that one', () => {
-    render(<ThemeHarness />);
+    renderHarness();
     open();

     for (const answer of answers) {
@@ -316,14 +351,14 @@ describe('the theme control, wired to the hook that owns it', () => {

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

### 7.13 `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`

Applied in **slice 2, before the implementation step** (R4). The requirement carries a normative
SHALL sentence directly under its heading and three scenarios with real WHEN/THEN bullets.

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 9c22737f..0aad992f 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -162,6 +162,38 @@ unaffected by the retirement of a previous one.
 - **THEN** the replacement's own handles read and write normally, and only the retired
   runtime's handles refuse

+### Requirement: A delivery consumer of preferences degrades visibly when withdrawn
+
+A hook or component reading the runtime's preferences through
+`useApplicationServicesState` SHALL render the modelled withdrawn state without
+throwing, SHALL report explicitly when its own displayed choice is not being
+persisted rather than accepting it silently, SHALL let an unexpected storage
+failure propagate unchanged, and, while it stays mounted, SHALL adopt a later
+runtime's own saved answer once one is published.
+
+#### Scenario: A choice made while withdrawn is not silently accepted as persisted
+
+- **WHEN** a reader chooses an answer while the application services are
+  withdrawn, or while the runtime backing an already-read handle is withdrawn
+  between renders
+- **THEN** the in-tree choice still changes and nothing throws, and the
+  consumer's own contract reports that this choice is not being remembered
+
+#### Scenario: Withdrawal while mounted resets to the documented default
+
+- **WHEN** a mounted consumer's runtime is withdrawn
+- **THEN** its choice resets to the same default an unread key already produces,
+  without waiting for disposal to finish, and a later published runtime's own
+  saved answer is adopted once one arrives
+
+#### Scenario: A superseded chooser and an unexpected storage failure
+
+- **WHEN** a caller retains a chooser obtained while one runtime was live and
+  invokes it after a later runtime replaced that one, or a live store's own write
+  fails for a reason that is not a lifecycle refusal
+- **THEN** the retained chooser changes nothing at all, and the storage failure
+  propagates unchanged with the displayed choice and the stored bytes untouched
+
 ### Requirement: Log out stays a local exit

 The Log out action SHALL send no request to the server and SHALL retire the
```

### 7.14 `apps/wbs/fe-01/src/lib/theme.test.tsx` — slice 3's nine named examples

Applies on top of 7.9. The withdrawal example holds its runtime's disposal open behind a
controlled promise and asserts the reset **while that disposal is still pending**, then releases
it in a `finally` — notification and disposal are different events, and only one of them is what
the hook reacts to.

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.test.tsx b/apps/wbs/fe-01/src/lib/theme.test.tsx
index d6af811..feeb10c 100644
--- a/apps/wbs/fe-01/src/lib/theme.test.tsx
+++ b/apps/wbs/fe-01/src/lib/theme.test.tsx
@@ -1,10 +1,13 @@
-import { act, cleanup, renderHook } from '@testing-library/react';
-import type { ReactNode } from 'react';
+import { act, cleanup, render, renderHook } from '@testing-library/react';
+import { type ReactNode, useLayoutEffect } from 'react';
 import { afterEach, beforeEach, describe, expect, it } from 'vitest';

 import type { DriveableMediaQueryList } from '../../vitest.setup';
 import type { Remembered } from '../modules/preferences/contract';
-import { fakeBrowserStorage } from '../modules/preferences/fake-browser-storage';
+import {
+  fakeBrowserStorage,
+  writeRefusingBrowserStorage,
+} from '../modules/preferences/fake-browser-storage';
 import {
   type ApplicationServices,
   installApplicationRuntime,
@@ -20,6 +23,7 @@ import {
   readTheme,
   rememberedTheme,
   systemMedia,
+  type Theme,
   THEME_KEY,
   type ThemeChoice,
   useTheme,
@@ -80,6 +84,47 @@ async function liveSlot(
   return { slot, store };
 }

+/**
+ * The same live slot, with its runtime's own disposal **held open** until the
+ * returned `release` is called.
+ *
+ * What it separates is notification from disposal: `retire()` withdraws
+ * publication synchronously and notifies from a microtask, and the disposal is a
+ * different event that can take as long as it likes. A test that awaits the
+ * retirement promise before asserting cannot tell which of the two the hook
+ * actually reacted to.
+ *
+ * The slot's own budget is not at risk: it is passed into DI Bag's `close`, and
+ * the wait below happens before that call is ever made.
+ */
+async function liveSlotHoldingDisposal(
+  store: ReturnType<typeof fakeBrowserStorage> = fakeBrowserStorage(),
+): Promise<{
+  slot: LifetimeSlot<ApplicationServices>;
+  store: ReturnType<typeof fakeBrowserStorage>;
+  release: () => void;
+}> {
+  const slot = freshSlot();
+  let release = (): void => undefined;
+  const disposalGate = new Promise<void>((resolve) => {
+    release = resolve;
+  });
+  await slot.replace(() => {
+    const installed = installApplicationRuntime({
+      openStore: () => store,
+      isLive: () => slot.snapshot().status === 'live',
+    });
+    return {
+      services: installed.services,
+      close: async (options) => {
+        await disposalGate;
+        await installed.close(options);
+      },
+    };
+  });
+  return { slot, store, release };
+}
+
 function wrapperFor(slot: LifetimeSlot<ApplicationServices>) {
   function Wrapper({ children }: { children: ReactNode }) {
     return <ApplicationServicesProvider slot={slot}>{children}</ApplicationServicesProvider>;
@@ -352,3 +397,230 @@ describe('the theme, followed and remembered while the app is open', () => {
     expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
   });
 });
+
+/**
+ * The four transitions `useTheme`'s own state machine names, one named example
+ * each, plus the three cases its invariants are stated over.
+ *
+ * `theme.model.test.tsx` is where the same machine is run against a reference
+ * model under generated interleavings; these are the readable statements of what
+ * each transition is for, and each has its own independent mutation.
+ */
+describe('the theme when the application services are withdrawn or transitioning', () => {
+  itDom(
+    'resets to system and stops persisting once the runtime is withdrawn, without waiting for disposal',
+    async () => {
+      const { slot, release } = await liveSlotHoldingDisposal(
+        fakeBrowserStorage({ [THEME_KEY]: JSON.stringify('dark') }),
+      );
+      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
+      expect(held.result.current.choice).toBe('dark');
+
+      // `retire()` withdraws publication synchronously; the disposal behind it is
+      // still waiting for `release` below while these assertions run.
+      const retiring = slot.retire();
+      try {
+        await act(async () => {
+          await Promise.resolve();
+        });
+
+        expect(held.result.current.choice).toBe('system');
+        expect(held.result.current.persists).toBe(false);
+      } finally {
+        release();
+        await act(async () => {
+          await retiring;
+        });
+      }
+    },
+  );
+
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
+        // A layout effect commits before every passive effect of the same
+        // commit — including the sibling hook's own resync effect below.
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
+  itDom(
+    'does not throw when the closured store goes withdrawn between renders, and settles on the withdrawn state',
+    async () => {
+      const { slot, store } = await liveSlot();
+      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
+      const { chooseTheme } = held.result.current;
+
+      // Withdrawal is synchronous; the notification that would rebuild
+      // `chooseTheme` over a `null` store is not — this call still closes over
+      // the live store `renderHook` built it with.
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
+  itDom(
+    'propagates an ordinary storage failure unchanged, showing no choice it could not keep',
+    async () => {
+      const { slot, store } = await liveSlot(writeRefusingBrowserStorage());
+      const held = renderHook(() => useTheme(), { wrapper: wrapperFor(slot) });
+      expect(held.result.current.choice).toBe('system');
+      expect(held.result.current.persists).toBe(true);
+
+      expect(() => {
+        act(() => {
+          held.result.current.chooseTheme('dark');
+        });
+      }).toThrow('write denied');
+
+      // Neither the displayed choice nor the stored bytes moved: this failure is
+      // not a lifecycle refusal, so nothing above the store recovers from it.
+      expect(held.result.current.choice).toBe('system');
+      expect(held.result.current.persists).toBe(true);
+      expect(store.held()[THEME_KEY]).toBeUndefined();
+    },
+  );
+
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
+});
```

### 7.15 `apps/wbs/fe-01/src/modules/preferences/composition.ts`

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/composition.ts b/apps/wbs/fe-01/src/modules/preferences/composition.ts
index d93ff1ba..2d549bb1 100644
--- a/apps/wbs/fe-01/src/modules/preferences/composition.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/composition.ts
@@ -15,6 +15,16 @@ import { createPreferences } from './preferences.resource';
  * runtime's instance has and this one has not is an owner: retiring it revokes
  * its store.
  *
+ * **One of the five call sites has moved off this file already:** `lib/theme.ts`
+ * reads and writes through `useApplicationServicesState()`, not this module —
+ * see
+ * `docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md`.
+ * `gantt-detail.ts`, `project-page.tsx` and `project-settings-modal.tsx` still
+ * import {@link rememberedPreferences}; `lib/remembered.ts` still imports
+ * {@link browserPreferences} for `remembered-layout.ts`'s per-project stores.
+ * This file is deleted once all five have moved, and the module-scope
+ * `storedMermaidSectionMode` in `lib/remembered.ts` must become lazy first.
+ *
  * Exported because `apps/wbs/fe-01/src/lib/remembered.ts` still offers the
  * generic factory to the layout module, which builds a store per project id and
  * so cannot be a fixed named answer. Nothing that imports React may import this;
```

### 7.16 `openspec/changes/adopt-frontend-lifetimes/tasks.md`

The box stays `[ ]`. Four call sites and the wiki index are still outstanding.

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index ef9a1533..8096d863 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -17,6 +17,15 @@
 - [ ] 3. The page's application lifetime is opened through the slot at module load and
       delivery reads its preferences out of that one graph, with the module's wiki index
       declaring `module.frontend.preferences` and its files.
+      Partly moved by 050-7-f1: `lib/theme.ts` reads through
+      `useApplicationServicesState()`, degrading visibly — never throwing — when
+      withdrawn, per the delivery-degradation requirement this change now carries.
+      `gantt-detail.ts`, `project-page.tsx`, `project-settings-modal.tsx` and
+      `lib/remembered.ts` still read `modules/preferences/composition.ts`'s staged
+      duplicate, and the module's wiki index is still absent
+      (`apps/wbs/fe-01/src/modules/preferences/README.md`). This box stays
+      unchecked until all five call sites have moved, the duplicate is deleted and
+      the index exists.
 - [x] 4. The application bootstrap owns the React root: it builds the runtime before
       `createRoot`, publishes `RememberedPreferences` — the feature facade only, never
       the `Preferences` resource — through one context, and renders the sanitized fatal
```

## 8. Proofs

Every fault below was injected for real in the planner's private worktree on 2026-09-23, its named
check watched failing, the file restored from a `cp`-taken pre-mutation copy and `cmp`-verified
byte-identical, and the owning suite rerun green before the next fault. The executor repeats each
one and writes the adjacent `Proof:` comment **only after observing its own failure**, dated with
its own observed date — never with 2026-09-23, and never before the observation.

Use the README's exact patch form for every injection:

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
cp <file> "$TMPDIR/<basename>.passing"
# …edit <file>…
if diff -u "$TMPDIR/<basename>.passing" <file> > "$TMPDIR/evidence/<name>.patch"
then echo "nothing was injected" >&2; exit 1; else test $? -eq 1; fi
if <the named check> > "$TMPDIR/evidence/<name>.log" 2>&1; then status=0; else status=$?; fi
echo "status=$status" >> "$TMPDIR/evidence/<name>.log"
cp "$TMPDIR/<basename>.passing" <file>
cmp <file> "$TMPDIR/<basename>.passing"
```

Restore **before** asserting on the captured status. `status=0` on a negative voids the proof: a
mutation that leaves the named check passing is first a location mistake — restore, re-read the
location, redo once (preamble rule 20).

### 8.1 Slice 1 — the typed refusal

| #   | Fault injected                                                                                                                            | Named failing test                                                                                        | Observed (2026-09-23)                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | `preferences.resource.ts`, `ensureLive`: `throw new PreferenceStoreLifecycleError(WITHDRAWN, 'withdrawn')` → `throw new Error(WITHDRAWN)` | `preferences.resource.test.ts` › `a withdrawn refusal is a lifecycle refusal of kind withdrawn`           | `AssertionError: expected false to be true`, `Tests 1 failed \| 22 skipped (23)` |
| 2   | `browser-storage.repository.ts`, `held`: `throw new PreferenceStoreLifecycleError(REVOKED, 'revoked')` → `throw new Error(REVOKED)`       | `browser-storage.repository.test.ts` › `a revoked store refuses with a lifecycle refusal of kind revoked` | `AssertionError: expected false to be true`, `Tests 1 failed \| 3 skipped (4)`   |

Commands, exactly:

```sh
cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences/preferences.resource.test.ts \
  -t 'a withdrawn refusal is a lifecycle refusal of kind withdrawn'
cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences/browser-storage.repository.test.ts \
  -t 'a revoked store refuses with a lifecycle refusal of kind revoked'
```

Each must report `1 failed`. Neither mutation touches the other's message, so neither hides the
other's check.

### 8.2 Slice 2 — five sabotages of the implementation, against the model test

The one command for all five:

```sh
cd apps/wbs/fe-01 && bunx vitest run src/lib/theme.model.test.tsx
```

Rehearsed on 2026-09-23. Seed `20260925` throughout; "run" is fast-check's own
`Property failed after N tests`. The shrunk counterexamples are pasted verbatim.

| #   | Fault injected in `theme.ts`                                                                                             | Run | Shrunk counterexample                                                                                                                                                                 | Assertion message                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | **persistence removed**: `rememberTheme`'s `themeStore.write(choice)` → `themeStore.read()`                              | 1   | ``[schedulerFor()`\n-> [task${1}] promise::dispose A resolved`,chooseWhileAcquiring(A, system),choose(system) /*replayPath="BAU:F"*/]``, shrunk 5 time(s)                             | `stored bytes in A: expected undefined to be '"system"'`                                                                                      |
| b   | **superseded-chooser guard removed**: `if (themeStore !== themeStoreRef.current) return;` → `if (false) return;`         | 14  | ``[schedulerFor()`\n-> [task${1}] promise::dispose A resolved`,retainChooser,chooseWhileAcquiring(A, system),useRetainedChooser(system) /*replayPath="BBBBF:V"*/]``, shrunk 2 time(s) | `persists: expected false to be true`                                                                                                         |
| c   | **non-lifecycle errors swallowed**: both `if (!isPreferenceStoreLifecycleError(refusal)) throw refusal;` lines deleted   | 36  | ``[schedulerFor()`\n-> [task${1}] promise::dispose denied resolved`,replace(denied),choose(system) /*replayPath="CBBBG:V"*/]``, shrunk 3 time(s)                                      | `an ordinary storage failure did not propagate: expected [Function] to throw an error`                                                        |
| d   | **the resync effect's withdrawal catch removed**: its `try`/`catch` replaced by the two bare state calls                 | 1   | ``[schedulerFor()`\n-> [task${1}] promise::dispose A resolved`,replaceThenRetireFromLayoutEffect(A) /*replayPath="BAEBB:V"*/]``, shrunk 2 time(s)                                     | `PreferenceStoreLifecycleError: the page withdrew this preference store before the access completed` — the refusal escaped the passive effect |
| e   | **the resync effect's withdrawn branch emptied**: its `setChoice('system'); setPersists(false);` deleted, `return;` left | 8   | ``[schedulerFor()`\n-> [task${1}] promise::dispose A resolved`,replace(A),replace(A) /*replayPath="DABBM:V"*/]``, shrunk 5 time(s)                                                    | `persists: expected true to be false`                                                                                                         |

Rows d and e are the two halves of "the effect's withdrawal handling", proved independently
because one mutation must not hide a second check: d removes the recovery from a refusal raised
_during_ the effect, e removes the reset for a store that was already gone _before_ it. Row e's
form — the guard's condition kept, only the state calls deleted — is the type-correct alternative:
replacing the condition with a literal removes the narrowing the rest of the effect relies on and
fails `wbs-fe-01:typecheck` with `TS2345` instead of failing a test.

The model test's own coverage assertions are the second half of this proof. With the property
green they establish that the pinned run really did execute all eight command kinds, really did
call a superseded chooser, really did write into a store that refuses writes, and really did
withdraw the slot from a layout effect before the hook's own resync effect ran. A property that
generated none of those would be green for the wrong reason, which is what the held packet's own
property was.

### 8.3 Slice 3 — nine example-level mutations, one per named example

Command form, for every row (`cd` included, and the titles carry **typographic** apostrophes
exactly as the test file writes them):

```sh
cd apps/wbs/fe-01 && bunx vitest run src/lib/theme.test.tsx -t '<title from the table>'
```

Slice 3 step 3 proves each filter selects exactly one test before any injection. Rehearsed on
2026-09-23: all nine reported `1 matched`, and every mutation below reported
`Tests 1 failed | 25 skipped (26)`.

| #   | Fault injected in `theme.ts`                                                                                                 | `-t` title                                                                                                  | Observed message                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | the lazy initialiser's ternary → `readTheme(themeStore as Remembered<ThemeChoice>)`                                          | `degrades to system and never throws when never live`                                                       | `TypeError: Cannot read properties of null (reading 'read')`                                                        |
| 2   | resync effect's withdrawn branch: its two state calls deleted, `return;` left                                                | `resets to system and stops persisting once the runtime is withdrawn, without waiting for disposal`         | `AssertionError: expected 'dark' to be 'system'`                                                                    |
| 3   | resync effect's live branch: `setChoice(rememberedTheme(themeStore)); setPersists(true);` → `rememberedTheme(themeStore);`   | `adopts a later live store’s own saved choice once one is published`                                        | `AssertionError: expected 'system' to be 'dark'`                                                                    |
| 4   | `chooseTheme`'s `try`/`catch` around `rememberTheme` removed                                                                 | `does not throw when the closured store goes withdrawn between renders, and settles on the withdrawn state` | `AssertionError: expected [Function] to not throw an error but 'PreferenceStoreLifecycleError: the pa…' was thrown` |
| 5   | `chooseTheme`'s null guard: `setChoice(next)` deleted, `setPersists(false); return;` left                                    | `lets a reader still operate the control while never live, through the same null guard`                     | `AssertionError: expected 'system' to be 'light'`                                                                   |
| 6   | the superseded-chooser guard → `if (false) return;`                                                                          | `does not let a superseded chooser change a replacement runtime’s own state`                                | `AssertionError: expected 'dark' to be 'light'`                                                                     |
| 7   | the resync effect's `try`/`catch` removed (bare state calls)                                                                 | `recovers, instead of throwing, when the store is retired between this hook’s render and its resync effect` | `AssertionError: expected PreferenceStoreLifecycleError: the page w… { kind: '…' } to be null`                      |
| 8   | `chooseTheme`'s `catch (refusal) { if (!isPreferenceStoreLifecycleError(refusal)) throw refusal; …}` → a bare `catch {}` arm | `propagates an ordinary storage failure unchanged, showing no choice it could not keep`                     | `AssertionError: expected [Function] to throw an error`                                                             |
| 9   | resync effect's live branch: `rememberedTheme(themeStore)` → `readTheme(themeStore)` — the drop stops happening              | `drops an answer it cannot read, from an effect rather than from a render`                                  | `AssertionError: expected '"midnight"' to be undefined`                                                             |

Nine faults, nine named tests, nine distinct checks: the lazy initialiser's guard, the resync
effect's two branches and its catch, the chooser's null guard, its catch, its rethrow and its
superseded guard, and the read-and-drop the effect performs. Row 8 mutates only the chooser's
rethrow while row 4 removes the whole `try`/`catch`, so neither hides the other; row 7 and row 2
do the same for the effect. Row 9 is the independent mutation round 3 asked for on the restored
hook-level corrupt-key removal.

## 9. Verification

### 9.1 Every fenced diff applies, extracted from this document

The requirement is not "these diffs were once correct" but "these diffs, as this committed
document spells them, apply in slice order". The script below is what proves it. It was written,
run, and rerun after the final Prettier pass; its exact output is below.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-f1-theme-hook-model.md
work=$(mktemp -d "${TMPDIR:?}/extract-XXXXXX")
mkdir -p "$work/patches" "$work/tree"
# 1. Every fenced ```diff block between "## 7. The code" and "## 8. Proofs", in document order.
awk -v out="$work/patches" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
ls "$work/patches" | wc -l
# 2. A real git repository holding exactly the base tree, so --check has an index.
git archive HEAD | tar -x -C "$work/tree"
git -C "$work/tree" init -q
git -C "$work/tree" add -A
git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
# 3. Apply in slice order, with the rename in its place.
for p in "$work"/patches/0[1-6].diff "$work"/patches/0[78].diff; do
  git -C "$work/tree" apply --check "$p" && git -C "$work/tree" apply "$p"
done
mv "$work/tree/apps/wbs/fe-01/src/lib/theme.test.ts" \
   "$work/tree/apps/wbs/fe-01/src/lib/theme.test.tsx"
for p in "$work"/patches/09.diff "$work"/patches/1[0-6].diff; do
  git -C "$work/tree" apply --check "$p" && git -C "$work/tree" apply "$p"
done
echo "all patches applied"
````

Observed on 2026-09-23, after the final Prettier `--check`:

```
16
all patches applied
```

`git apply --check` prints nothing on success, which is why the script's own `echo` is the
evidence. The applied tree was then compared file by file against the planner's rehearsed working
tree: all **fifteen** paths byte-identical — sixteen patches over fifteen paths, because
`theme.test.tsx` takes one in slice 2 and one in slice 3 — `theme.model.test.tsx` included, and the
old `theme.test.ts` path gone.
Applying `09.diff` before the `mv` was tried once deliberately and fails with
`error: apps/wbs/fe-01/src/lib/theme.test.tsx: No such file or directory`, which is why the
ordering above is not cosmetic.

Intermediate trees typecheck: `wbs-fe-01:typecheck` exits 0 after slice 1's six diffs alone, and
again after slice 2's, and again after slice 3's. The one tree that does **not** is the deliberate
red checkpoint inside slice 2 (patches 01–06 and 09–12 applied, 07/08 not), which is the point of
it.

### 9.2 Commands actually run, and what each reported

All on 2026-09-23, by this packet's author, in a private worktree at `8cc0f913`, not inside an
executor sandbox. Statuses are the shell's, captured with the wrappers of section 6.

| Command                                                                           | Before this packet's edits                       | After                                      |
| --------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| focused suite (four, then five files)                                             | exit 0, `4 files`, `59 tests`                    | exit 0, `5 files`, `69 tests`              |
| `bunx vitest run src/lib/theme.test.tsx`                                          | exit 0, `17 tests` (as `.ts`)                    | exit 0, `26 tests`                         |
| `bunx vitest run src/lib/theme.model.test.tsx`                                    | —                                                | exit 0, `1 test`, 300 pinned runs          |
| `bunx vitest run src/modules/preferences`                                         | exit 0, `6 files`, `39 tests`                    | exit 0, `6 files`, `41 tests`              |
| sandbox node suite (README's command)                                             | exit 0, `46 files`, `674 tests`                  | exit 0, `46 files`, `675 tests`            |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                 | exit 0                                           | exit 0                                     |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                      | exit 0                                           | exit 0                                     |
| `NX_DAEMON=false bunx nx format:check --all`                                      | exit 0                                           | exit 0, nothing listed                     |
| strict OpenSpec block (README's exact `jq` contract)                              | exits 0, `{"items":114,"passed":114,"failed":0}` | exits 0, same totals                       |
| slice-2 red typecheck (test files applied, `theme.ts` not)                        | —                                                | exit 1, `Found 12 errors in 3 files.`      |
| slice-2 red Vitest (same tree)                                                    | —                                                | exit 1, `Tests 4 failed \| 56 passed (60)` |
| the two slice-1 negatives, the five slice-2 sabotages, the nine slice-3 mutations | —                                                | every one observed, restored, `cmp` clean  |

The strict block, verbatim from the batch README, is the one this packet uses; the loose
`grep`-for-success form is not acceptable and a `failed` field that is `false` rather than `0`
must be rejected, which is exactly what `type == "number"` in that block does.

### 9.3 Planner-only, with the expected relative delta

The sandbox cannot run these: three tests in two files spawn `bun` from Node and the sandbox
refuses it, and a build writes outside the attempt's lane.

| Check                                                                                         | Expectation                                                                                   | Planner's own rehearsal (2026-09-23)                                                                                                    |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit` | the node tier's baseline **+ 1** test (the withdrawn-classification case), 0 file change      | exit 0; before `48 files`, `697 tests`; after `48 files`, `698 tests`                                                                   |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test`      | the jsdom tier's baseline **+ 12** tests (2 classification, 1 model, 9 named) in **+ 1** file | exit 0; UTC pass before `131 files`, `2995 tests`, after `132 files`, `3007 tests`; Auckland zoned pass `2 files`, `3 tests` both times |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                 | exit 0                                                                                        | exit 0, `✓ built in 976ms`                                                                                                              |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`, staged                       | unchanged; this packet adds no module README and no project target                            | run by the planner's own commit helper while committing this document                                                                   |
| `bin/h2puni-gate.sh <sha>`                                                                    | exit 0 on the shared build host                                                               | **not run**; reported as pending, never as passed                                                                                       |

`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is not decoration: `CLAUDECODE=1` changes Bun's test
output and fails 13 unrelated tests in this repository.

### 9.4 What none of this proves

- No browser ran. `wbs-fe-01:e2e` was not run and is not required by this packet: nothing here
  changes a rendered string, a route or a selector. If a reviewer disagrees, that is a finding for
  the planner and a Chromium run, not something an executor can do — the executor has no browser.
- The model test's own boundary is section 3.6: it does not re-explore `lifetime-slot.ts`'s
  fencing of two overtaking transitions.
- The coverage assertions prove the pinned run reached each interleaving; they do not prove the
  space is exhausted. That is what a property is, and the honest claim is the one made.

## 10. Stop conditions

Each is false on the real starting tree, checked on 2026-09-23.

1. Step 0's `git status --porcelain` shows a modification to a file **this slice owns**. Stop.
   A modification to any other file is recorded and preserved, not a stop — the recorded `base` is
   the comparison, never a fixed historical hash.
2. A fenced diff in section 7 fails `git apply --check` against the tree with this slice's earlier
   diffs applied. Stop and report the exact error; do not hand-edit the file into shape.
3. Any `-t` filter in section 8.3 matches zero tests, or more than one. Stop.
4. A negative proof leaves its named check passing. Restore, re-read the location, redo once; if it
   still passes, stop and report — the check may not be where this packet says it is.
5. The strict OpenSpec block exits non-zero, or `passed` falls below step 0's recorded number.
6. A slice ends with a `git status --short --untracked-files=all` that does not match its
   hand-over list exactly.
7. Slice 2's red checkpoint produces **no** failures, or a different count than section 6 names.
   Either means the test files did not land as written.
8. Anything asks for a `git` state change in the clone, a network call, a browser, or `--no-verify`.
   Stop; the contract forbids all four.
9. `claims.db.test.ts` › `bounds terminal lock contention and retries until a held write commits`
   fails. That is a known racy test with its own recorded cause and is not this packet's. Record it
   and rerun **once**; do not touch it.

## 11. Out of lane

- `lifetime-slot.ts`, `application-runtime.ts`, `application-services-context.tsx`,
  `application-bootstrap.tsx`: read only.
- `components/wbs/gantt-detail.ts`, `pages/project-page.tsx`,
  `components/wbs/project-settings-modal.tsx`, `lib/remembered.ts`: the next packet's.
- `modules/preferences/module.ts`, `preferences.feature.ts`, `README.md`,
  `composition-agreement.test.ts`, `module.test.ts`: untouched. `module.test.ts`'s three
  message-based assertions on the revoked refusal keep passing unchanged and are **not** edited to
  assert the new class; slice 1's own new test does that, beside the code it is about.
- `project.json`, `vitest.node-suites.ts`, `vitest.config.ts`, `bun.lock`, `package.json`: untouched.
  The new file is a `.tsx` under jsdom, so it needs no node-tier registration, and
  `src/test-tiers.test.ts` asserts the tiers as a partition with no absolute count.
- No dependency is added, removed or bumped. `fast-check` is already a dev dependency at 4.10.2
  and is already imported by three test files in this project.

## 12. Hand-over to the next packet

- Task 3 of `adopt-frontend-lifetimes` stays unchecked, with the reason written into it.
- Four call sites remain on `modules/preferences/composition.ts`, and `lib/remembered.ts`'s
  module-scope `storedMermaidSectionMode` must become lazy before its own site can move. That is
  the next packet's first decision, and it is a real one: a module-scope binding cannot read a
  React context.
- `ThemeContextValue.persists` is published and no consumer reads it yet. The account menu is the
  obvious first reader — "not being remembered" is a thing a reader should be able to see — but
  that is a design decision about the chrome, with its own copy and its own accessibility
  question, and this packet does not take it.
- `PreferenceStoreLifecycleError` is now the one typed refusal of the preferences module. The other
  three delivery sites should narrow on it rather than on message text when they move.

## 13. Assumptions recorded rather than asked

1. **`persists` is the visible degradation R5 asks for**, and publishing it through the context
   without a reader yet is acceptable for one packet. The alternative — refusing to render while
   withdrawn — would trip `AppFaultBoundary` for an ordinary lifecycle tick, which that boundary's
   own JSDoc says it cannot heal.
2. **A chooser retained while nothing was live is the current chooser again whenever nothing is
   live.** That follows from comparing store references (`null === null`) and is the behaviour the
   model encodes. It is not a defect: there is no runtime to supersede.
3. **Seed `20260925` and 300 runs** are enough for this property. Measured: the run takes about two
   seconds and the coverage assertions confirm every interleaving is reached. A future author who
   changes the commands must re-pin and re-rehearse.
4. **The migration belongs to slice 2** (section 5's own subsection). Recorded as a deviation from
   the commissioning brief, with the reason.
5. **`writeRefusingBrowserStorage` belongs in `fake-browser-storage.ts`**, not duplicated in two
   test files.
6. **`wbs-fe-01:e2e` is not required.** Nothing rendered changes. Recorded so a reviewer can
   disagree with a reason rather than a silence.

## 14. Disposition of the held packet's round-3 review

`puni-plan/reviews-batch-6/050-7-f-delivery-call-sites.round3.md`, finding by finding. Every
"resolved" claim below names the section of **this** document that establishes it.

### Critical

| #   | Finding                                                                                        | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The generated property contaminated its own oracle and lacked the required scheduling coverage | **Resolved.** The property is gone; section 7.7 is a model-based test whose reference model keeps its **own** expected bytes per store and never reads a production store for its oracle. `fc.scheduler()` holds every disposal open; `fc.commands` generates the re-entrant, partial-acquisition, retained-chooser, refusing-write and layout-effect-withdrawal interleavings named in section 3.5. Nothing is `.catch`ed. Both the rendered state **and** the stored bytes are asserted after every command (section 7.7's `assertAgrees`). Section 8.2 pastes five sabotages with seed, run number, shrunk counterexample and message — including the exact two the review said the old property passed: persistence removed, and the superseded guard removed. |
| 2   | Two supplied test titles matched zero tests (ASCII apostrophes, and no `cd`)                   | **Resolved.** Section 8.3's commands all begin `cd apps/wbs/fe-01` and every title is copied from the test file, typographic apostrophes included. Slice 3 step 3 **executes** a filter-count check over all nine before any injection and stops on anything other than `1 matched`; the planner ran it and all nine matched exactly one.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | The final ownership check rejected the actual dispatch base                                    | **Resolved.** Section 6's step 0 records `base=$(git rev-parse HEAD)` and `git status --porcelain` per slice, and every ownership check and stop condition compares against those records (stop condition 1). No historical hash appears as a stop condition anywhere; `8cc0f913` appears only as the provenance label on planner observations (section 4).                                                                                                                                                                                                                                                                                                                                                                                                        |

### Important

| #   | Finding                                                                                                                                                                                     | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The new recovery boundaries lacked negative proofs: the effect's catch, both rethrows, the typed revoked refusal, the hook's read-and-drop; and no test injected a live-store write failure | **Resolved.** A live store whose write fails is now a first-class fixture (`writeRefusingBrowserStorage`, section 7.6), a named example (section 7.14, `propagates an ordinary storage failure unchanged…`) and a generated command. The effect's catch is proved twice — sabotage d and mutation 7; the chooser's rethrow by sabotage c and mutation 8; the effect's withdrawn branch by sabotage e and mutation 2; the revoked classification by slice 1 negative 2; the hook-level corrupt-key drop by mutation 9. `Proof:` comments are added only after each observation (section 8's preamble).            |
| 2   | The runtime-red diagnostics contradicted the supplied fixtures; the stated reasons were wrong                                                                                               | **Resolved.** Section 6 slice 2 step 6 records the **rerun** red: 12 diagnostics in 3 files, listed by file and code, and four runtime failures each with its printed message and its **real** reason — the unchanged hook reads real `localStorage` while the fixtures inject a fake. Choice, removal and persistence failures are recorded separately, as asked.                                                                                                                                                                                                                                               |
| 3   | OpenSpec sequencing and evidence ownership were contradictory                                                                                                                               | **Resolved.** `spec.md` is applied in **slice 2, step 2, before the implementation step** (R4). `verify.md` is in both slice 2's and slice 3's ownership lists (section 5) and each slice appends its own fresh entry with its own observations (steps 12 and 9). No planner history appears in either instruction, and neither slice is told to restate the other's entry.                                                                                                                                                                                                                                      |
| 4   | Verification fell short of the execution contract: missing baselines, bare commands, Markdown-only formatting, a hand-written OpenSpec parser                                               | **Resolved.** Step 0 collects all three comparison runs **before** any edit, in every slice, with durable wrappers. Every slow target — typecheck, lint, tests, build — runs under the `if … then status=0; else status=$?; fi` wrapper writing both output and status to an evidence file. Owned-file Prettier covers changed **code** as well as documents (slice 1 step 9, slice 2 step 12, slice 3 step 7), and the repository-wide check is `NX_DAEMON=false bunx nx format:check --all`. OpenSpec validation is the README's exact `jq` block, quoted in section 9.2; there is no hand-written parser.     |
| 5   | Teardown was not consistently guaranteed or ordered                                                                                                                                         | **Resolved.** The model test wraps its whole run in `try`/`finally`, unmounts **before** awaiting retirement, and awaits every transition it issued (section 7.7). `theme.test.tsx` retires every slot it built from `afterEach`, after React `cleanup()`, through a tracked list so a failed assertion still gives the slot back (section 7.9). `account-menu.test.tsx` calls `cleanup()` explicitly before awaiting retirement (section 7.12), and `app.test.tsx` likewise (7.11). Retirement **under test** stays distinct from fixture teardown, and retiring an already-empty slot is the documented no-op. |
| 6   | "Without waiting for disposal" was specified but not established: the test awaited the retirement promise first                                                                             | **Resolved.** `liveSlotHoldingDisposal` (section 7.14) holds the runtime's own close behind a controlled promise; the named example flushes only the notification, asserts `system`/`false` **while the disposal is still pending**, and releases and awaits it in a `finally`. The model test does the same for every withdrawal command, through `fc.scheduler()`.                                                                                                                                                                                                                                             |
| 7   | The addendum assessment was inaccurate                                                                                                                                                      | **Resolved.** Section 15 assesses all 20 points, each with the section that establishes it, and says Not met where it is not met.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Minor

| #   | Finding                                                 | Disposition                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Stale counts and section references in the dispositions | **Resolved by construction.** This is a new document; every count in it is a fresh observation from this rehearsal (section 4's own preamble), and every cross-reference is to a section name in this document, never to a line number. The held packet's numbers are not carried forward anywhere. |

## 15. Batch-6 addendum, point by point

The addendum has 20 points. Honest assessment, each with the section that establishes it.

| Point                                                                | Assessment | Where                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Fixture reproduces the failure on unchanged code                  | **Met**    | §6 slice 2 step 6: the red was rerun on the unchanged `theme.ts` and its 12 diagnostics and four runtime failures are recorded with their real reasons.                                                                                 |
| 2. Prescribed test code passes typecheck and lint                    | **Met**    | §9.2: both exit 0 on the rehearsed tree. §6 slice 2 step 9 names the two lint findings that were hit and how §7.7's listing already fixes them.                                                                                         |
| 3. Cumulative path counts not broken by the planner                  | **Met**    | §5 and each slice's hand-over scope the expectation to the slice's own owned paths; no cumulative repository-wide count is asserted.                                                                                                    |
| 4. A verification command can show a failure                         | **Met**    | §6 step 0 and §8's patch form: every command keeps its status in an evidence file, and no `grep` stands in for an exit status.                                                                                                          |
| 5. Tests that read the repository at `HEAD`                          | **N/A**    | No project, target or CI path is renamed. The one rename is a test file, which no HEAD-reading test pins.                                                                                                                               |
| 6. Sandbox facts                                                     | **Met**    | §6 step 0 and §9.3: the two whole targets and the build are planner-only with their expected relative deltas, and every slow target runs under a status wrapper.                                                                        |
| 7. Known racy test                                                   | **Met**    | Stop condition 9 names it and permits exactly one rerun.                                                                                                                                                                                |
| 8. Names                                                             | **Met**    | No product identifier appears. The new symbols are `PreferenceStoreLifecycleError`, `isPreferenceStoreLifecycleError`, `writeRefusingBrowserStorage`, `themeStore`, `persists` — no `data`, `result`, `obj`, `tmp`, `item` or `handle`. |
| 9. Packet form, public evidence                                      | **Met**    | Every slice has its own baselines, its own commit subject and its own negatives. §12 names what is pending. The only `/home` path in this document is the launcher line at the end of §6, which is the documented precedent.            |
| 10. Dependency pins                                                  | **Met**    | §11: nothing is added or bumped; `fast-check` 4.10.2 is already installed and already used by three test files here.                                                                                                                    |
| 11. `\|\| test $? -eq 1` after a pipeline                            | **Met**    | No such construct. The only accepted-nonzero command is `diff` in §8's patch form, the README's own `if diff …; then …; else test $? -eq 1; fi`, after a single command.                                                                |
| 12. A chained planner command stops at the first failure             | **Met**    | Every shell block is `set -euo pipefail` and no block chains a push, a PR or a gate after a `;`. The planner commits through the helper, which checks its own `rc`.                                                                     |
| 13. A new file in a module directory is declared in its index README | **N/A**    | The new file is `src/lib/theme.model.test.tsx`, not under a module directory; `src/lib` has no `module-index` block. `fake-browser-storage.ts` already exists and is already indexed.                                                   |
| 14. `bun test some/dir` is a filter, not a path                      | **N/A**    | No command here uses `bun test` with a directory. Every test run is `bunx vitest run <explicit files>` or a named config, from `apps/wbs/fe-01`.                                                                                        |
| 15. Interleaving property for lifecycle code                         | **Met**    | §7.7 is exactly that, with `fc.scheduler()`, a pinned seed and run count, five rehearsed sabotages and their shrunk counterexamples pasted in §8.2, plus coverage assertions that refuse a vacuous run.                                 |
| 16. Three rounds of new races means the design is wrong              | **Met**    | This packet **is** the remedy: the state machine is written down first (§3), the model-based test is built against it (§7.7), the implementation is sabotaged five ways (§8.2), and only then do the call sites move.                   |
| 17. A hand-over slice citing earlier evidence needs `--seed`         | **N/A**    | No slice reads another attempt's evidence; §6's dispatch line says so explicitly.                                                                                                                                                       |
| 18. A code-shape boundary check is never a regex                     | **N/A**    | This packet prescribes no boundary check. Its checks are behavioural tests.                                                                                                                                                             |
| 19. `grep` exits 1 for a missing file too                            | **Met**    | No check in this packet is gated on a `grep` exit status. The one `grep -c` (slice 3 step 3) counts lines of a command's captured output and its result is compared with `test "$n" -eq 1`, which distinguishes 0 from 1.               |
| 20. Promise only what a check can keep                               | **Met**    | §9.4 and §3.6 state the residual limits: no browser ran, the model does not re-explore the slot's own fencing, and the coverage assertions prove the pinned run reached each interleaving rather than that the space is exhausted.      |

## 16. Ready to commit

| Slice | Paths                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Subject                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1     | `apps/wbs/fe-01/src/modules/preferences/{contract.ts,preferences.resource.ts,browser-storage.repository.ts,preferences.resource.test.ts,browser-storage.repository.test.ts}`                                                                                                                                                                                                                                                                                      | `feat(preferences): type the store's lifecycle refusal`            |
| 2     | `apps/wbs/fe-01/src/modules/preferences/fake-browser-storage.ts`, `apps/wbs/fe-01/src/lib/{theme.ts,theme.model.test.tsx,theme.test.tsx}` (and `theme.test.ts` deleted), `apps/wbs/fe-01/src/index-bootstrap.test.ts`, `apps/wbs/fe-01/src/app.test.tsx`, `apps/wbs/fe-01/src/components/chrome/account-menu.test.tsx`, `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`, `openspec/changes/adopt-frontend-lifetimes/verify.md` | `feat(theme): read the palette off the page runtime's preferences` |
| 3     | `apps/wbs/fe-01/src/lib/theme.test.tsx`, `apps/wbs/fe-01/src/modules/preferences/composition.ts`, `openspec/changes/adopt-frontend-lifetimes/tasks.md`, `openspec/changes/adopt-frontend-lifetimes/verify.md`                                                                                                                                                                                                                                                     | `test(theme): name the hook's four lifecycle transitions`          |

After the last commit the host gate is run on the shared build host with the committed hash, and
its printed running-hash line and exit status recorded. On any other machine it is reported as not
run, with the reason — never treated as passed.
