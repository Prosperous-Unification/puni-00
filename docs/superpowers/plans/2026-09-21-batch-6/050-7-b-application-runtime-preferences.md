# 050.7b The page's runtime, preferences through it, and the sanitized fatal page

|                     |                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item           | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **second packet**                                                                         |
| Size class          | M                                                                                                                                                                                    |
| Predecessor         | [050.7a](050-7-a-frontend-lifetimes-first.md), merged: the lifetime slot, its model test and the change `adopt-frontend-lifetimes`. Section 12 of that packet scopes this one.       |
| Design              | [The frontend lifetime slot: states, events, invariants](050-7-lifetime-slot-design.md) — its "Consequences for the packets after this one" is this packet's contract                |
| Design it serves    | [Code organization design](../../specs/2026-09-19-code-organization-design.md): rules F1 to F3 and K2                                                                                |
| Reviewed source map | [050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md): the application owner, the K2 table, lifecycle tests 1 and 4                                    |
| Library research    | [DI Bag 0.4.0 React lifecycle guarantees](../../../research/2026-09-21-di-bag-0-4-lifecycle.md)                                                                                      |
| Backend precedent   | `libs/wbs/application/core/src/module/plan-history/` — the first sealed module, landed by 040.6a. This packet is its frontend twin and copies its proof shapes.                      |
| Execution contract  | [batch 1 README](../2026-09-19-batch-1/README.md): "Execution contract", "Rules for every executor", "Standard blocks every packet uses", "Hidden constraints every frontend packet" |
| Planning head       | `5085f6e6` (`origin/main`, packet a merged)                                                                                                                                          |

## 1. Goal and non-goals

**Goal.** Make the landed lifetime slot the page's, and install one module through it. Four things,
which are the four measured obligations [packet a's section 12](050-7-a-frontend-lifetimes-first.md)
left:

1. **`apps/wbs/fe-01/src/runtime/application-runtime.ts`**: the owner that installs modules through a
   sealed DI Bag and hands the slot one bounded close. Construction is a **transaction**: what a
   failed read acquired is released through the bag that acquired it, raised as packet a's
   `PartialAcquisitionError`.
2. **`apps/wbs/fe-01/src/modules/preferences/module.ts`**: preferences as a sealed, labelled module —
   label `frontend.preferences`, identifier `module.frontend.preferences` — whose **one owned
   disposable** is a revocable store, so the module's close is a close something can observe.
3. **The bootstrap**: `bootstrapApplication` builds the runtime through `replace` on the empty slot
   and awaits it **before** anything renders, outside `<StrictMode>`.
4. **The sanitized fatal page**: when the slot ends `fatal` — a refused construction or a refused
   retirement — the page shows the fault boundary's generic sentence and its occurrence handle, and
   nothing raw reaches the DOM or the console.

**Non-goals.** No library version change (`di-bag` stays `0.4.0`, `application-exception` `0.5.0`,
`caught-object-report-json` `11.0.1`). No React context: delivery still imports
`modules/preferences/composition`, and moving it is the context packet's (section 12). No session or
project runtime, no page-hide, hot-reload or restoration trigger, no Log out change. **No wiki index
and no `docs/wiki-policy` registration** — see section 4.7. No change to the slot's own behaviour:
`lifetime-slot.ts` is not edited, only its model test is extended.

## 2. Read first

1. [The lifetime slot design](050-7-lifetime-slot-design.md), whole, and especially "Consequences for
   the packets after this one". 170 lines, and it is the contract this packet executes.
2. `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`, whole. Its JSDoc states the transaction
   (`Acquire`, `PartialAcquisitionError`), the five states and the two `fatal` flavours.
3. `AGENTS.md` (rules R1 to R5) and `LLM_README.md`.
4. The execution contract sections of the [batch 1 README](../2026-09-19-batch-1/README.md).
5. `libs/wbs/application/core/src/module/plan-history/{module,check,contract,module.test}.ts` — the
   sealed-module precedent this packet copies, including which DI failures carry a module label.
6. `apps/wbs/fe-01/src/modules/preferences/` whole, and its four delivery call sites (section 4.2).
7. `apps/wbs/fe-01/src/components/chrome/{fault-disclosure.ts,app-fault.tsx,root-fault-options.ts}`.

## 3. Verified facts

Every claim was read or run in a worktree off `5085f6e6`. Line numbers are that tree's.

### 3.1 DI Bag 0.4.0, probed for what this packet needs

Run with `bun` against the installed `node_modules/di-bag` (`0.4.0`, pinned in
`tools/tool-devsync/src/toolchain-pins.test.ts:506`):

- **a module's private disposer runs on the host's close.** A module built with
  `.buildModule(['prefs'], { label: 'frontend.preferences' })` over a private `withDisposal` binding
  recorded `[]` disposals before `bag.close({ timeoutMs: 100 })` and `["store"]` after it.
- **`inspectGraph()` labels the private binding and not the exports.** The same graph reported
  `["prefs", "frontend.preferences/store"]`.
- **`DI_BAG_MISSING_REGISTRATION` carries no label.** Resolving the private `store` from the host
  threw `DI_BAG_MISSING_REGISTRATION: Service "store" is not registered.; see https://…`, with
  `code` exactly `DI_BAG_MISSING_REGISTRATION` — the same message shape as a name nothing ever
  registered (`"nope"`). So the rule is: **a missing registration is anonymous; only a labelled
  binding's missing dependency names its module**, which is `DI_BAG_MISSING_DEPENDENCY`:
  `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "frontend.preferences/preferencesStore": dependency
"browserStore" is not registered. Resolution path: preferences -> frontend.preferences/preferencesStore -> browserStore.`
  (observed in this packet's own module test). That is why the browser store is a **host
  requirement** and not a module-private binding: a module whose every dependency is internal can
  never produce a labelled failure at all.
- **a partially acquired graph is released only by `close()` on its own bag** (packet a measured it
  twice; nothing here re-litigates it). That is the whole reason `acquireTransactionally` exists.
- `build()` and `resolve()` are **synchronous** for sync factories, which is what lets the page's
  whole installation satisfy the slot's synchronous `Acquire<S>`.

### 3.2 The preferences module as it stands, and its five call sites

- `src/modules/preferences/composition.ts:14` builds `browserPreferences` at module load over
  `browserStorage()`, and `:17` builds `rememberedPreferences` over it.
- **Four delivery call sites read the feature facade**, each at module load: `src/lib/theme.ts:13,52`,
  `src/components/wbs/gantt-detail.ts:3,39,85`, `src/components/wbs/project-page.tsx:19,94` and
  `src/components/wbs/project-settings-modal.tsx:13,77`. They are the oracle: this packet changes
  none of them, and the whole jsdom tier is what says so (section 9).
- **The fifth call site needs the resource**: `src/lib/remembered.ts:1` imports `browserPreferences`
  and `:18`/`:26` call `json` and `text` for a key built per project id. So the map's K2 sentence
  ("The generic non-React `lib/remembered.ts` compatibility factory is not a reason to expose that
  resource in React context", map "Narrow context and K2 resolution") is **half right**: it is not a
  reason to put the resource in a context, and it _is_ the reason the module exports it. This packet
  records that as K2 debt on `PreferencesExports` and in `verify.md`; it invents no facade for it.
- `browser-storage.repository.ts:20` reaches the store **per call** and never captures it, with an
  observed Proof comment saying what capturing it broke. This packet keeps that: the module wraps the
  adapter, it does not replace it.
- `fake-browser-storage.ts:10` already exists, so every new node-tier test has a store fixture.

### 3.3 Two instances of a stateless service, on purpose

Delivery keeps importing `composition.ts`; the page's runtime installs the same module for itself. A
reviewer should read that as staged, not sloppy, and it is measurable: `Preferences` holds **no
state** — every value lives in the reader's browser and the adapter reaches it per call — so the two
instances cannot disagree. `composition-agreement.test.ts` writes through one and reads through the
other, in both directions, and then closes the runtime and shows that only the runtime's own store is
revoked. Moving delivery onto the runtime's services means a React context, which is the packet
section 12 names; doing it here would change 2,944 jsdom assertions in a tier the executor cannot run.

### 3.4 Tiers, targets and the sandbox

- fe-01 has `test`, `test:unit`, `lint`, `lint:fast`, `typecheck`, `build`, `e2e`, `e2e-packaged`, and
  **no** `lint:source`.
- **The executor never runs `wbs-fe-01:test:unit` or `wbs-fe-01:test`**: three of their tests spawn
  `bun` from Node and the sandbox refuses with `spawnSync bun EPERM`. It runs the batch README's
  **sandbox unit command** and, for the three jsdom files this packet adds, `bunx vitest run <file>`
  — a focused jsdom run, measured at 759 ms for one file and 4.2 s for the bootstrap file, which
  spawns nothing.
- **`bun test <dir>` is a filter, not a path**, and also collects the compiled copies a typecheck
  leaves under `dist/out-tsc/`. This packet prescribes **no** `bun test`; its vitest commands name
  `--config vitest.node.config.ts` or a file path, and every baseline in section 6 was re-measured
  after `wbs-fe-01:typecheck` had written `dist/out-tsc/apps/wbs/fe-01/*` into the same worktree —
  same files, same counts, because the node tier's `include` is the explicit `NODE_SUITES` list.
- `src/test-tiers.test.ts:60`'s `DOM_EVIDENCE` reads the **name of a browser global anywhere in a
  file, prose included**, as proof that the file needs jsdom. It cost three rehearsal stops here: a
  node-tier test whose fixture threw Chromium's real wording for a blocked store
  (`Access is denied for this document.`), and then two rewrites of the comment explaining that,
  each of which still contained the word. Observed:
  `expected [ 'playwright-config.test.ts', …(47) ] to deeply equal [ …(46) ]` and
  `expected 130 to be 129`. The listings in section 7 are the wording that passes.
- The whole jsdom tier, the zoned tier, `wbs-fe-01:build`, `tool-devsync:test`, `twilight-burokrat:test`
  and every Chromium run are **planner-only**, with observed values in section 9.

### 3.6 The rehearsal, and its numbers

| What                                                       | Observed                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Sandbox unit command, finished tree                        | exit 0, `46 passed (46)` files, `656 passed (656)` tests                 |
| The two node-tier suites this packet adds, with the slot's | exit 0, `4 passed (4)` files, `42 passed (42)` tests, 435 ms             |
| The three jsdom files it adds, plus `main.test.tsx`        | exit 0, `4 passed (4)` files, `9 passed (9)` tests                       |
| Slice 1 red (module skeleton)                              | exit 1, `4 failed \| 4 passed (8)`                                       |
| Slice 2 red (runtime skeleton)                             | exit 1, `9 failed \| 8 passed (17)`                                      |
| Slice 3 red (bootstrap and page skeletons)                 | exit 1, `7 failed (7)`, all on `the page's bootstrap is not written yet` |
| The model test alone, with the production graph inside it  | exit 0, `1 passed (1)`, 355 ms, seed `20260923`, 300 runs                |
| Whole jsdom tier                                           | exit 0, `128 passed (128)` files, `2944 passed (2944)` tests             |
| `wbs-fe-01:typecheck`                                      | exit 0 — and exit 0 under every one of the fourteen faults in section 8  |
| `wbs-fe-01:lint`                                           | exit 0                                                                   |
| `wbs-fe-01:build`                                          | exit 0, `✓ built in 607ms`                                               |
| `tool-devsync:test` with every new file staged             | exit 0, `366 pass`, `0 fail`                                             |
| The new Chromium case                                      | exit 0, `1 passed (8.3s)` at `E2E_PORT_SHIFT=3000`                       |
| Three existing Chromium specs                              | exit 0, `25 passed (1.2m)`                                               |
| `openspec validate --all --json`                           | exit 0, `114` items, `114` passed, `0` failed                            |
| Four real `git commit`s with lefthook on                   | exit 0 each; two were refused first, on Prettier after `eslint --fix`    |

Absolute numbers are orientation only: every expectation in section 6 is relative to the baseline that
slice records itself.

### 3.5 Pins, kinds and the wiki index

`docs/code-organization/kinds.json` gains nothing: `tools/tool-devsync/src/service-kinds.ts:15` limits
`SERVICE_ROOTS` to three backend and library directories, and neither `src/runtime/` nor
`src/modules/` under an app is one. This packet adds no project, target or CI path, so
`apps/wiki/cli/src/policy/pilot-policy.test.ts`, which reads the repository at `HEAD` through git, has
nothing to disagree with.

**The module index and the `docs/wiki-policy` registration are not this packet's, and this is a
correction to packet a's section 12.** That section assigned the `<!-- module-index … -->` block to
this packet. It belongs with the registration, for the reason
`libs/wbs/application/core/src/module/plan-history/README.md` states in its first paragraph: the
trusted boundary for a new module identifier and the index that declares it land together, because
`apps/wiki/cli/src/policy/pilot-policy.test.ts` pins both the mapping length and the exact set of
discovered index identifiers. No README under `apps/wbs/fe-01` carries an index comment today, so
`checkIndexes` has no candidate to refuse and adding files to the preferences directory costs nothing
here — but it will the moment an index exists, which is why that packet adds both at once. This
packet's README edit says so in the module's own words, and nothing in it is a `module-index` block.

## 4. The shape, and the four decisions a reviewer should attack first

The design document is the contract; what follows is what this packet had to decide to execute it.

**The browser store is the host's requirement, not the module's private binding.** A module whose every
dependency is internal can never produce a labelled DI failure (section 3.1), so `frontend.preferences`
requires `browserStore: BrowserStorage` and the page's runtime registers it from the existing
`browserStorage()` adapter. What stays private is the **revocable** store built over it, which is also
the module's one owned disposable.

**The module's close has something to give back.** `Preferences` owns no socket and no timer, so a
disposer that did nothing would be a close nobody could prove, and packet a's section 12 asks for a
close that is provable "through a narrow typed seam registering one owned disposable". The seam is
real behaviour rather than a marker: after the runtime is retired, every read, write and forget on the
store it owned **throws**, so a component that outlived its runtime cannot reach the reader's browser
through a `Remembered` it captured. That is rule R5's direction — a write whose owner is gone is not
defaulted away — and it is what makes `N1`, `N2` and `N7` in section 8 fail three different named
tests.

**The transaction is one function, and it wraps every failure.** `acquireTransactionally(graph, read)`
reads the services and, on any throw, raises `PartialAcquisitionError` carrying that graph's bounded
close. It wraps a failure that acquired nothing too, deliberately: a `resolve` that throws cannot say
whether an earlier dependency of the same graph was already acquired, and closing a graph that took
nothing runs no disposer. Every later lifetime reuses this function, which is why it is not inlined.

**The fatal page is rendered from the slot's state, never from a caught value.** `bootstrapApplication`
catches the refusal **without binding it** and reads `slot.snapshot()` back; a refusal it could read is
a refusal it could render. It also subscribes to the slot, so a **retirement** that rejects or outruns
its wait reaches the same sanitized page — the map requires one reporting boundary for both — and the
page it renders is `LifetimeFault`, which takes a `DisclosedFault` and can therefore not disclose
anything else. The words differ from the root boundary's fallback on purpose: nothing was ever on
screen and no plan was open, and that is the one thing a reader needs told differently.

## 5. File plan

| Path                                                                   | Slice | Create or modify | Note                                                          |
| ---------------------------------------------------------------------- | ----- | ---------------- | ------------------------------------------------------------- |
| `apps/wbs/fe-01/src/modules/preferences/contract.ts`                   | 1     | modify           | append only: the label, the id, two shapes, the revocable one |
| `apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts` | 1     | modify           | append only: `revocableStorage`                               |
| `apps/wbs/fe-01/src/modules/preferences/module.ts`                     | 1     | create           | the sealed module                                             |
| `apps/wbs/fe-01/src/modules/preferences/module.test.ts`                | 1     | create           | 11 tests, node tier                                           |
| `apps/wbs/fe-01/vitest.node-suites.ts`                                 | 1, 2  | modify           | one entry in each slice, in sorted position                   |
| `apps/wbs/fe-01/src/runtime/application-runtime.ts`                    | 2     | create           | the owner, the transaction, the slot                          |
| `apps/wbs/fe-01/src/runtime/application-runtime.test.ts`               | 2     | create           | 7 tests, node tier                                            |
| `apps/wbs/fe-01/src/components/chrome/lifetime-fault.tsx`              | 3     | create           | the sanitized fatal page                                      |
| `apps/wbs/fe-01/src/components/chrome/lifetime-fault.test.tsx`         | 3     | create           | 3 tests, jsdom tier                                           |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.tsx`                 | 3     | create           | the bootstrap                                                 |
| `apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx`            | 3     | create           | 4 tests, jsdom tier                                           |
| `apps/wbs/fe-01/src/main.tsx`                                          | 3     | modify           | calls the bootstrap; keeps the `#root` throw                  |
| `apps/wbs/fe-01/e2e/lifetime-fault-probe.ts`                           | 3     | create           | Chromium probe, **planner runs it**                           |
| `apps/wbs/fe-01/e2e/lifetime-fault.spec.ts`                            | 3     | create           | Chromium case, **planner runs it**                            |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts`               | 4     | modify           | the production installer inside the interleavings             |
| `apps/wbs/fe-01/src/modules/preferences/composition.ts`                | 4     | modify           | JSDoc only: the staged duplicate                              |
| `apps/wbs/fe-01/src/modules/preferences/composition-agreement.test.ts` | 4     | create           | 1 test, jsdom tier                                            |
| `apps/wbs/fe-01/src/modules/preferences/README.md`                     | 4     | modify           | prose; **no `module-index` block**                            |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                   | 6     | modify           | ticks task 2 and nothing else                                 |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                  | 1–6   | modify           | **every slice appends its own observations**                  |

**Twenty paths.** Nothing else: no React context, no `docs/wiki-policy/`, no `kinds.json`, no manifest,
no lockfile, no `lifetime-slot.ts`, and none of the five preferences call sites.

## 6. Slices

Six. Each is one attempt, ends in one planner commit with the exact subject given, begins with its own
step 0, and **appends its own observations to `verify.md` before handing over**.

**Dispatch.** The launcher is `/home/df/wd/puni/puni-plan/exec/run-executor.sh`:

```sh
# slice 1, into a fresh clone
/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-7-b-application-runtime-preferences slice-1 <base> \
  --batch batch-6 --preserve evidence
# every later slice reuses that clone
/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-7-b-application-runtime-preferences slice-2 <base> \
  --batch batch-6 --preserve evidence --resume
# slice 6 also seeds the five earlier attempts' evidence
/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-7-b-application-runtime-preferences slice-6 <base> \
  --batch batch-6 --preserve evidence --resume \
  --seed <slice-1 evidence dir> --seed <slice-2 evidence dir> --seed <slice-3 evidence dir> \
  --seed <slice-4 evidence dir> --seed <slice-5 evidence dir>
```

**`--resume` on every slice after the first**, or the launcher exits 67. **No `--network`** and no
`--browser` is needed: every Chromium command here is the planner's. Slice 6 is the hand-over slice and
it **cites the five earlier attempts**, so it is dispatched with one `--seed` per preserved evidence
directory, which the launcher merges into `$TMPDIR/evidence`; a bare dispatch is a stop, as packet a's
slice 4 correctly was. `verify.md` references evidence **basenames** only, never a clone, home or
temporary path, because it is published.

### Step 0 — at the start of every slice

- [ ] Record the head and the working tree:

  ```sh
  git rev-parse HEAD; git status --short --untracked-files=all
  ```

- [ ] Record the **sandbox unit command** baseline, and call its two numbers **F0** and **T0**:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts) \
    > "$TMPDIR/evidence/slice<N>-step0-unit.log" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0. **Never** run `wbs-fe-01:test:unit` or `wbs-fe-01:test`.

- [ ] In slice 6 only, record the OpenSpec baseline and call `summary.totals.items` **V0**:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
    > "$TMPDIR/evidence/slice6-step0-openspec.json" 2>&1; echo "exit=$?"
  ```

### Slice 1 — preferences as a sealed, labelled module

Subject: `feat(fe-01): seal the preferences module behind one label`

Pre-edit check: `apps/wbs/fe-01/src/modules/preferences/module.ts` does not exist and
`apps/wbs/fe-01/src/runtime/lifetime-slot.ts` does.

- [ ] Append section 7.1 to `contract.ts` and section 7.2 to `browser-storage.repository.ts`. Both are
      **appends**: no existing line changes.
- [ ] Write `module.test.ts` exactly as section 7.4, the **skeleton** `module.ts` of section 7.3, and
      the `vitest.node-suites.ts` entry `'src/modules/preferences/module.test.ts'` in its sorted
      position, immediately after `'src/modules/preferences/composition.test.ts'`.

  The skeleton is what makes the red a red about this packet: the suite entry and the tests exist, so
  every test in the file is selected and fails on one message.

- [ ] Run the red:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
    src/modules/preferences/module.test.ts) > "$TMPDIR/evidence/slice1-red.log" 2>&1; echo "exit=$?"
  ```

  Expected, observed by the planner: exit 1, `Test Files 1 failed (1)`, `Tests 11 failed (11)`, every
  one on `Error: the preferences module is not built yet`. `No test files found` means the suite entry
  is missing and `Tests no tests` means the skeleton is missing; either is a stop, not a red.

- [ ] Replace the skeleton with section 7.3's whole module, and run the green: exit 0,
      `Tests 11 passed (11)`. Then the sandbox unit command: exit 0, **F0 + 1** files and **T0 + 11**
      tests.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0. Required in this slice: the module's
      three factories are generic DI Bag registrations whose dependency objects are written out, and
      `buildModule`'s export tuple is type-checked against them.
- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0. Import order is autofixable with
      `bunx eslint --fix apps/wbs/fe-01/src/modules/preferences`.
- [ ] Append this slice's observations to `verify.md` under `## Slice 1`.

Hand over, **six** paths:

```text
?? apps/wbs/fe-01/src/modules/preferences/module.test.ts
?? apps/wbs/fe-01/src/modules/preferences/module.ts
 M apps/wbs/fe-01/src/modules/preferences/browser-storage.repository.ts
 M apps/wbs/fe-01/src/modules/preferences/contract.ts
 M apps/wbs/fe-01/vitest.node-suites.ts
 M openspec/changes/adopt-frontend-lifetimes/verify.md
```

### Slice 2 — the page's runtime, installed transactionally

Subject: `feat(fe-01): own the page's runtime through the lifetime slot`

Pre-edit check: `apps/wbs/fe-01/src/modules/preferences/module.ts` exists and
`apps/wbs/fe-01/src/runtime/application-runtime.ts` does not.

- [ ] Write `application-runtime.test.ts` exactly as section 7.6, the **skeleton**
      `application-runtime.ts` of section 7.5 (its two exported functions throw), and the
      `vitest.node-suites.ts` entry `'src/runtime/application-runtime.test.ts'` in its sorted position,
      immediately before `'src/runtime/lifetime-slot.model.test.ts'` and under the same comment.
- [ ] Red: exit 1, `Tests 7 failed (7)` on `Error: the page's runtime is not installed yet`, plus the
      four module tests that install through it — **11 failed** in the two files together. Command:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
    src/runtime/application-runtime.test.ts src/modules/preferences/module.test.ts) \
    > "$TMPDIR/evidence/slice2-red.log" 2>&1; echo "exit=$?"
  ```

- [ ] Replace the skeleton with section 7.5's whole file. Green: the same command at exit 0 with
      `Tests 18 passed (18)`; then the sandbox unit command at **F0 + 1** files and **T0 + 7** tests.
- [ ] `wbs-fe-01:typecheck` and `wbs-fe-01:lint` — exit 0 each. Required here: `acquireTransactionally`
      is generic over the services it reads, and the slot's `RetirableRuntime<S>` members are readonly
      function-valued properties.
- [ ] Append `## Slice 2` to `verify.md`.

Hand over, four paths: `?? src/runtime/application-runtime.test.ts`, `?? src/runtime/application-runtime.ts`,
` M apps/wbs/fe-01/vitest.node-suites.ts`, ` M openspec/changes/adopt-frontend-lifetimes/verify.md`.

### Slice 3 — the bootstrap and the sanitized fatal page

Subject: `feat(fe-01): build the page's runtime before it renders, and say so when it cannot`

Pre-edit check: `apps/wbs/fe-01/src/runtime/application-runtime.ts` exists;
`src/components/chrome/lifetime-fault.tsx` does not.

These four files are in the **jsdom** tier, so they are run **by file** and never through
`wbs-fe-01:test`:

```sh
(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx \
  src/components/chrome/lifetime-fault.test.tsx) > "$TMPDIR/evidence/slice3-<phase>.log" 2>&1
echo "exit=$?"
```

- [ ] Write `lifetime-fault.test.tsx` (section 7.8), `application-bootstrap.test.tsx` (section 7.10),
      and the **skeletons** of `lifetime-fault.tsx` (7.7) and `application-bootstrap.tsx` (7.9).
- [ ] Red: exit 1, `Test Files 2 failed (2)`, `Tests 7 failed (7)`, every one on
      `Error: the page's bootstrap is not written yet`.
- [ ] Replace both skeletons with sections 7.7 and 7.9, and edit `src/main.tsx` to section 7.11
      exactly — five lines and a comment, keeping the `#root missing` throw where it is.
- [ ] Green: exit 0, `Tests 7 passed (7)`. Then `bunx vitest run src/main.test.tsx` — exit 0,
      `Tests 1 passed (1)`: that suite mocks `react-dom/client` and asserts the root is still created
      once with `ROOT_FAULT_OPTIONS`, which the new bootstrap has to keep true.
- [ ] Write `e2e/lifetime-fault-probe.ts` (7.12) and `e2e/lifetime-fault.spec.ts` (7.13). **Do not run
      them**: there is no browser in the sandbox. Say in `verify.md` that they are pending planner
      verification.
- [ ] `wbs-fe-01:typecheck` and `wbs-fe-01:lint` — exit 0 each. The typecheck is what covers the two
      e2e files, through `tsconfig.e2e.json`.
- [ ] The sandbox unit command: exit 0 and **unchanged** at F0/T0 — every file in this slice is in the
      jsdom tier. A change here is a stop.
- [ ] Append `## Slice 3` to `verify.md`.

Hand over, seven paths: the four new `src` files, the two new `e2e` files, ` M src/main.tsx`, and
` M openspec/changes/adopt-frontend-lifetimes/verify.md` — eight lines in all.

### Slice 4 — the production installer inside the generated interleavings, and the seam

Subject: `test(fe-01): drive the real application graph through the ownership model`

Pre-edit check: `src/runtime/application-runtime.ts` and `src/modules/preferences/module.ts` exist.

- [ ] Apply section 7.14's four edits to `src/runtime/lifetime-slot.model.test.ts`: the two new
      `Tracked` fields, the new invariant method, the new `graph` command field and its arbitrary, the
      `buildInstalled` builder, and the call in the factory. **Add commands; change no invariant that
      is already there.**
- [ ] Run the model test alone and record its duration:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
    src/runtime/lifetime-slot.model.test.ts) > "$TMPDIR/evidence/slice4-model.log" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0, `Tests 1 passed (1)`, about 1.2 s — the seed and run count are unchanged
  (`{ seed: 20260923, numRuns: 300 }`), so the executor walks the interleavings the planner did.

- [ ] Write `composition-agreement.test.ts` (section 7.15) and apply section 7.16's JSDoc to
      `composition.ts` and section 7.17's prose to the module's `README.md`. The README gains **no**
      `module-index` block: section 3.5.
- [ ] `bunx vitest run src/modules/preferences/composition-agreement.test.ts` — exit 0,
      `Tests 1 passed (1)`.
- [ ] The sandbox unit command: exit 0, F0 files and T0 tests — the model test file is already listed
      and the agreement test is jsdom.
- [ ] `wbs-fe-01:typecheck` and `wbs-fe-01:lint` — exit 0 each.
- [ ] Append `## Slice 4` to `verify.md`.

Hand over, five paths: `?? src/modules/preferences/composition-agreement.test.ts`,
` M src/modules/preferences/README.md`, ` M src/modules/preferences/composition.ts`,
` M src/runtime/lifetime-slot.model.test.ts`, ` M openspec/changes/adopt-frontend-lifetimes/verify.md`.

### Slice 5 — every fault, alone

Subject: `test(fe-01): prove the module's seal, the transaction and the fatal page`

Pre-edit check: the four commands of section 9's executor table are green.

- [ ] For each of the fourteen faults in section 8, in order: copy the file to `$TMPDIR`, inject the
      fault **alone**, save the patch with the block in section 8, run the two suites the row names,
      run `wbs-fe-01:typecheck` (**every fault here compiles**; one that does not is a stop), restore
      with `cp`, prove the restore with `cmp`, and only then assert on the captured statuses.
- [ ] Compare each row's failing tests and message with the planner's. The `Proof:` comments are
      already in the listings and name these observations; a row that reports something else is
      recorded in `verify.md` **and** its comment is corrected to what this attempt saw.
- [ ] Green again after the restores: the two suites at their slice-4 counts, `wbs-fe-01:typecheck` and
      `wbs-fe-01:lint` at exit 0.
- [ ] Append `## Slice 5` to `verify.md`: one row per fault, with the evidence basenames.

Hand over: ` M openspec/changes/adopt-frontend-lifetimes/verify.md`, plus any source file whose
`Proof:` comment this attempt corrected.

### Slice 6 — tick the change and hand over

Subject: `docs(fe-01): record the page's runtime and its preferences module as done`

Dispatched with `--seed` for each of the five earlier slices' preserved evidence directories.

- [ ] Tick **task 2** in `tasks.md` — `- [x]` — and nothing else. Tasks 3 and 4 stay open on purpose:
      each has a clause this packet does not do (delivery reading out of the one graph, the module
      index, and the React context). `verify.md` says which clause of each is already true.
- [ ] Append `## Slice 6` to `verify.md`: the fault table of section 8 with the diagnostics **the
      earlier attempts observed**, each row naming the attempt and the evidence basename, and the
      planner-only rows of section 9 marked as such. Do not claim any proof ran in this slice.
- [ ] Re-validate:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
    > "$TMPDIR/evidence/slice6-openspec-after.json" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0, `summary.totals.failed` `0`, `summary.totals.items` equal to this slice's own
  **V0** — ticking a checkbox adds no item — and the `adopt-frontend-lifetimes` entry still
  `"valid": true` with `"issues": []`.

- [ ] `GSETTINGS_BACKEND=memory bunx prettier --check` every path this packet owns, then
      `wbs-fe-01:typecheck` and `wbs-fe-01:lint` — exit 0 each.
- [ ] Print the cumulative diff, scoped to the paths this packet owns:

  ```sh
  git diff --name-only <slice-1 base> -- apps/wbs/fe-01 openspec/changes/adopt-frontend-lifetimes
  ```

  Expected: exactly the twenty paths of section 5. The planner may have added a revised copy of this
  packet under `docs/`, which this command does not look at.

Hand over: ` M openspec/changes/adopt-frontend-lifetimes/tasks.md` and
` M openspec/changes/adopt-frontend-lifetimes/verify.md`.

## 7. The code, rehearsed

Every listing is the post-Prettier text of a file that was written, run, type-checked, linted and
**committed with lefthook on** in the planner's worktree. The `Proof:` comments are the planner's own
observations from section 8; slice 5 re-observes each and corrects any that differ.

### 7.1 Appended to `src/modules/preferences/contract.ts`

Nothing above it changes.

```ts
/**
 * The store this module owns for the lifetime of one installation.
 *
 * A {@link BrowserStorage} that can be **revoked**: the module's disposal calls
 * `revoke`, and every later access throws. That is the whole of what the module
 * owns, and the reason it has a disposer at all — a preference written by a
 * component that outlived its runtime would reach the reader's browser after the
 * page had given that runtime up, which is a write nobody owns.
 */
export interface RevocableBrowserStorage extends BrowserStorage {
  /** Refuses every later read, write and forget on this store. Idempotent. */
  readonly revoke: () => void;
}

/**
 * What a host graph must supply to install the preferences module.
 *
 * The raw store adapter and nothing else. It is the host's because reaching this
 * browser's own key-value store is the page's infrastructure, and it is a
 * requirement rather than a module-private binding so that a host which forgets
 * it is told **which module** asked: see {@link PREFERENCES_LABEL}.
 */
export interface PreferencesRequirements {
  readonly browserStore: BrowserStorage;
}

/**
 * What installing the preferences module adds to a host graph.
 *
 * `preferences`, the resource, is public and that is **recorded K2 debt, not
 * compliance**: delivery must take {@link RememberedPreferences}, and the only
 * reason the resource is exported is `apps/wbs/fe-01/src/lib/remembered.ts`,
 * which builds a store per project id for the layout module and so cannot be a
 * fixed named answer. The map's claim that the generic factory is "not a reason
 * to expose the resource" is half right: it is not a reason to put it in a React
 * context, and it is still the reason the module exports it.
 */
export interface PreferencesExports {
  readonly preferences: Preferences;
  readonly remembered: RememberedPreferences;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `frontend` is the ring by location: a module under an app carries the runtime
 * word, so the wiki module identifier is {@link PREFERENCES_MODULE_ID} and the
 * label drops the `module.` prefix, exactly as `application.plan-history` does.
 */
export const PREFERENCES_LABEL = 'frontend.preferences';

/** The wiki module identifier, which the module index will declare. */
export const PREFERENCES_MODULE_ID = 'module.frontend.preferences';
```

### 7.2 Appended to `src/modules/preferences/browser-storage.repository.ts`

Two edits: the import on line 1 becomes
`import type { BrowserStorage, RevocableBrowserStorage } from './contract';`, and this is appended
after `browserStorage`.

```ts
/**
 * What a revoked store answers: nothing, ever again.
 *
 * Thrown rather than ignored, and this is rule R5 rather than strictness for its
 * own sake: a preference written after the runtime that owned the store was
 * retired is a write whose owner is gone, and a silent no-op would leave the
 * screen showing a choice the browser never kept.
 */
const REVOKED = 'the preferences store was revoked with its runtime';

/**
 * The same store, until the runtime that owns it gives it back.
 *
 * The one owned disposable of the preferences module: {@link BrowserStorage} on
 * its own has nothing to close, and a module whose close did nothing would be a
 * close nobody could prove. After `revoke` every member throws, so a component
 * that outlived its runtime cannot reach the reader's browser through a
 * `Remembered` it captured.
 *
 * @throws once revoked, from `read`, `write` and `forget` alike.
 */
export function revocableStorage(store: BrowserStorage): RevocableBrowserStorage {
  let revoked = false;
  /** The one guard, so all three members refuse in the same place. */
  const held = (): BrowserStorage => {
    // Proof: on 2026-09-22, making this guard `if (false)` let
    // 'refuses every access once its runtime has given the store back' read 'dark'
    // instead of throwing (1 fail, 8 pass).
    // Proof: on 2026-09-22, making this guard hand the store back either way made
    // 'revokes the store it owns when the installation closes' read 'false' instead of
    // throwing (3 fail, 37 pass).
    if (revoked) throw new Error(REVOKED);
    return store;
  };
  return {
    read: (key) => held().read(key),
    write: (key, value) => {
      held().write(key, value);
    },
    forget: (key) => {
      held().forget(key);
    },
    revoke: () => {
      revoked = true;
    },
  };
}
```

### 7.3 `src/modules/preferences/module.ts`

The skeleton slice 1's red runs against first:

```ts
import { DiBag } from 'di-bag';

import type { Preferences, RememberedPreferences } from './contract';

/** The skeleton this slice's red runs against; section 7.3 replaces it whole. */
export const preferencesModule = DiBag.createBuilder()
  .register({
    preferences: DiBag.fromSyncFactory((): Preferences => {
      throw new Error('the preferences module is not built yet');
    }),
    remembered: DiBag.fromSyncFactory((): RememberedPreferences => {
      throw new Error('the preferences module is not built yet');
    }),
  })
  .buildModule(['preferences', 'remembered']);
```

And the whole file:

```ts
import { DiBag } from 'di-bag';

import { revocableStorage } from './browser-storage.repository';
import {
  type BrowserStorage,
  type Preferences,
  PREFERENCES_LABEL,
  type RememberedPreferences,
  type RevocableBrowserStorage,
} from './contract';
import { createRememberedPreferences } from './preferences.feature';
import { createPreferences } from './preferences.resource';

/**
 * Preferences as a sealed DI Bag module.
 *
 * Two exports, and the reasons differ: `remembered` is the feature-service
 * delivery is allowed to see, and `preferences` is the resource beneath it,
 * exported for one non-React caller and recorded as debt — see
 * {@link import('./contract').PreferencesExports}.
 *
 * `preferencesStore` stays private, so a host cannot name it — resolving it
 * answers `DI_BAG_MISSING_REGISTRATION` — and it is the module's **one owned
 * disposable**: the revocable store, given back when the installation closes.
 * The raw adapter it wraps is a host requirement rather than a private binding,
 * which is what makes a host that forgets it say which module asked:
 * `Cannot resolve "frontend.preferences/preferencesStore": dependency
 * "browserStore" is not registered.`
 */
export const preferencesModule = DiBag.createBuilder()
  .register({
    preferencesStore: DiBag.withDisposal(
      DiBag.fromSyncFactory(
        ({ browserStore }: { browserStore: BrowserStorage }): RevocableBrowserStorage =>
          revocableStorage(browserStore),
      ),
      // Proof: on 2026-09-22, dropping this disposal made 'revokes the store it owns when
      // the installation closes' read 'dark' back instead of throwing (1 fail, 8 pass).
      (store) => {
        store.revoke();
      },
    ),
  })
  .register({
    preferences: DiBag.fromSyncFactory(
      ({ preferencesStore }: { preferencesStore: RevocableBrowserStorage }): Preferences =>
        createPreferences(preferencesStore),
    ),
  })
  .register({
    remembered: DiBag.fromSyncFactory(
      ({ preferences }: { preferences: Preferences }): RememberedPreferences =>
        createRememberedPreferences(preferences),
    ),
  })
  // Proof: on 2026-09-22, exporting `preferencesStore` made 'keeps its owned store out of a
  // host graph' report "Received function did not throw" (1 fail, 8 pass).
  // Proof: on 2026-09-22, dropping the label made 'names itself when a host omits the
  // browser store' receive a message without `frontend.preferences/` (2 fail, 7 pass).
  .buildModule(['preferences', 'remembered'], { label: PREFERENCES_LABEL });
```

### 7.4 `src/modules/preferences/module.test.ts`

Eight tests, node tier. It imports **no** runtime module, which is what makes slice 1 dispatchable on
its own.

```ts
import { DiBag } from 'di-bag';
import { describe, expect, it } from 'vitest';

import { revocableStorage } from './browser-storage.repository';
import { PREFERENCES_LABEL, PREFERENCES_MODULE_ID } from './contract';
import { fakeBrowserStorage } from './fake-browser-storage';
import { preferencesModule } from './module';
import { GANTT_DETAIL_KEY } from './preference-keys';

/**
 * A host graph over the same requirement the page's runtime supplies.
 *
 * Written out here rather than imported from `runtime/application-runtime.ts`: this
 * suite is about the module's seal, and the installer has its own. Its assertions
 * are the ones no installer can make, because they reach the host graph the
 * installer keeps to itself.
 */
const hostOver = (store: ReturnType<typeof fakeBrowserStorage>) =>
  DiBag.createBuilder()
    .installModule(preferencesModule)
    .register({ browserStore: DiBag.fromSyncFactory(() => store) })
    .build();

describe('the preferences module', () => {
  it('publishes the answers delivery asks for, over the store its host supplied', () => {
    const store = fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'true' });
    const host = hostOver(store);

    expect(host.resolve('remembered').ganttDetail.read()).toBe(true);
    host.resolve('remembered').ganttDetail.write(false);
    expect(store.held()).toEqual({ [GANTT_DETAIL_KEY]: 'false' });
  });

  it('keeps its owned store out of a host graph', () => {
    const host = hostOver(fakeBrowserStorage());

    expect(() =>
      (host as unknown as { resolve: (key: string) => unknown }).resolve('preferencesStore'),
    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "preferencesStore" is not registered.');
  });

  it('labels its owned store with the module name', () => {
    const host = hostOver(fakeBrowserStorage());

    expect(host.inspectGraph().bindings.map((binding) => binding.label)).toContain(
      `${PREFERENCES_LABEL}/preferencesStore`,
    );
  });

  /**
   * The label reaches a real DI failure, and only this kind of one.
   *
   * A host that forgets the store is refused by the type checker, so the cast reaches
   * the runtime path an untyped or generated host reaches. The message has to say
   * which module asked, because `browserStore` alone would not.
   */
  it('names itself when a host omits the browser store', () => {
    const partial = DiBag.createBuilder().installModule(preferencesModule) as unknown as {
      build: () => { resolve: (key: string) => unknown };
    };
    const host = partial.build();

    expect(() => host.resolve('preferences')).toThrow(
      `Cannot resolve "${PREFERENCES_LABEL}/preferencesStore": dependency "browserStore" is not registered. Resolution path: preferences -> ${PREFERENCES_LABEL}/preferencesStore -> browserStore.`,
    );
  });

  /**
   * The rule as it is, not as it would be convenient: a missing **registration** is
   * answered without a module label, for a private binding and for a name nothing ever
   * registered alike. Only a missing **dependency** of a labelled binding carries the
   * label, which is the case above.
   */
  it('says nothing about itself when a host names a service that is not registered', () => {
    const host = hostOver(fakeBrowserStorage());
    const naming = (key: string): string => {
      try {
        (host as unknown as { resolve: (named: string) => unknown }).resolve(key);
      } catch (refusal) {
        return refusal instanceof Error ? refusal.message : String(refusal);
      }
      throw new Error(`resolving ${key} was expected to throw`);
    };

    expect(naming('preferencesStore')).not.toContain(PREFERENCES_LABEL);
    expect(naming('nothing-of-the-kind')).not.toContain(PREFERENCES_LABEL);
    expect(naming('preferencesStore')).toContain('DI_BAG_MISSING_REGISTRATION');
  });

  /**
   * The owned store, refusing on its own.
   *
   * Its own case as well as the module's, so that three different faults — the
   * module's disposal removed, this guard removed, and the installer's close replaced
   * by a no-op — are told apart by which tests fail rather than by inspection.
   */
  it('refuses every access once the store has been given back', () => {
    const store = revocableStorage(fakeBrowserStorage({ [GANTT_DETAIL_KEY]: 'true' }));

    expect(store.read(GANTT_DETAIL_KEY)).toBe('true');
    store.revoke();

    expect(() => store.read(GANTT_DETAIL_KEY)).toThrow(
      'the preferences store was revoked with its runtime',
    );
    expect(() => {
      store.write(GANTT_DETAIL_KEY, 'false');
    }).toThrow('was revoked with its runtime');
    expect(() => {
      store.forget(GANTT_DETAIL_KEY);
    }).toThrow('was revoked with its runtime');
  });

  /** The host graph's own close, which is the disposal the module registered. */
  it('gives the store back when its host graph closes', async () => {
    const host = hostOver(fakeBrowserStorage());
    const remembered = host.resolve('remembered');

    await host.close({ timeoutMs: 50 });

    expect(() => {
      remembered.ganttDetail.write(true);
    }).toThrow('the preferences store was revoked with its runtime');
  });

  it('declares the identifier its module index will carry', () => {
    expect(PREFERENCES_MODULE_ID).toBe(`module.${PREFERENCES_LABEL}`);
  });
});
```

### 7.5 `src/runtime/application-runtime.ts`

The skeleton slice 2's red runs against first:

```ts
import type {
  BrowserStorage,
  Preferences,
  RememberedPreferences,
} from '@/modules/preferences/contract';

import {
  type Acquire,
  createLifetimeSlot,
  type LifetimeSlot,
  type RetirableRuntime,
} from './lifetime-slot';

/** The skeleton this slice's red runs against; section 7.5 replaces it whole. */
export interface ApplicationServices {
  readonly preferences: Preferences;
  readonly remembered: RememberedPreferences;
}

export interface ApplicationDependencies {
  readonly openStore: () => BrowserStorage;
}

interface ClosableGraph {
  readonly close: (options: { timeoutMs: number }) => Promise<void>;
}

export function acquireTransactionally<S>(
  _graph: ClosableGraph,
  _read: () => S,
): RetirableRuntime<S> {
  throw new Error("the page's runtime is not installed yet");
}

export function installApplicationRuntime(
  _dependencies?: ApplicationDependencies,
): RetirableRuntime<ApplicationServices> {
  throw new Error("the page's runtime is not installed yet");
}

export const applicationSlot: LifetimeSlot<ApplicationServices> =
  createLifetimeSlot<ApplicationServices>();

export const acquireApplicationRuntime: Acquire<ApplicationServices> = () =>
  installApplicationRuntime();
```

And the whole file:

```ts
import { DiBag } from 'di-bag';

import { browserStorage } from '@/modules/preferences/browser-storage.repository';
import type {
  BrowserStorage,
  Preferences,
  RememberedPreferences,
} from '@/modules/preferences/contract';
import { preferencesModule } from '@/modules/preferences/module';

import {
  type Acquire,
  createLifetimeSlot,
  type LifetimeSlot,
  PartialAcquisitionError,
  type RetirableRuntime,
} from './lifetime-slot';

/**
 * What the page's own runtime publishes, and the whole of it.
 *
 * `remembered` is the feature-service delivery takes. `preferences` is the
 * resource, carried here for `src/lib/remembered.ts` alone and **never for a
 * React context**: see `PreferencesExports`, which records why it is exported
 * and what closing it needs.
 *
 * No bag, no browser store, no repository. That is rule K2, and the runtime's own
 * test enumerates this surface rather than trusting the type — an object with an
 * extra property still satisfies an interface.
 */
export interface ApplicationServices {
  readonly preferences: Preferences;
  readonly remembered: RememberedPreferences;
}

/** What a built graph owes a transaction: one bounded close for everything it took. */
interface ClosableGraph {
  readonly close: (options: { timeoutMs: number }) => Promise<void>;
}

/**
 * Reads a built graph's services, or gives back everything the reading acquired.
 *
 * The transaction the lifetime slot's contract asks for, in one place because
 * every lifetime after this one needs the same shape. DI Bag releases a
 * partially acquired graph **only** through `close()` on the bag that acquired
 * it, so a read that throws halfway cannot release anything by itself: it raises
 * {@link PartialAcquisitionError} carrying that bag's bounded close, and the slot
 * awaits it before it publishes anything.
 *
 * Every failure is wrapped, including one that acquired nothing, and that is
 * deliberate rather than sloppy: a resolve that throws cannot say whether an
 * earlier dependency of the same graph was acquired first, and closing a graph
 * that took nothing runs no disposer.
 *
 * @throws {@link PartialAcquisitionError} for any failure of `read`, with the
 * original failure as its `cause`.
 */
export function acquireTransactionally<S>(
  graph: ClosableGraph,
  read: () => S,
): RetirableRuntime<S> {
  try {
    return { services: read(), close: (options) => graph.close(options) };
  } catch (failure) {
    // Proof: on 2026-09-22, rethrowing `failure` unwrapped made 'releases everything a
    // half-finished read acquired' record 0 disposals of the resource it took (1 fail, 9 pass).
    throw new PartialAcquisitionError(failure, (options) => graph.close(options));
  }
}

/** The one dependency of the page's runtime: how this browser's store is reached. */
export interface ApplicationDependencies {
  /** Defaults to the real adapter; a test passes a fake, and nothing else does. */
  readonly openStore: () => BrowserStorage;
}

/**
 * Installs the page's runtime: one bag, the preferences module, nothing else yet.
 *
 * Synchronous, because {@link Acquire} is and because every factory here is:
 * DI Bag's `build()` and `resolve()` run sync factories inline, and the slot's
 * two generation fences are sufficient only while construction cannot await.
 *
 * The bag is built here and nowhere else, so nothing outside this function can
 * reach a private binding or the graph itself — the returned surface is the two
 * public services, enumerated by a test.
 *
 * @throws {@link PartialAcquisitionError} when a service cannot be resolved,
 * carrying the bounded close for whatever was acquired first.
 */
export function installApplicationRuntime(
  dependencies: ApplicationDependencies = { openStore: browserStorage },
): RetirableRuntime<ApplicationServices> {
  const bag = DiBag.createBuilder()
    .installModule(preferencesModule)
    .register({ browserStore: DiBag.fromSyncFactory(() => dependencies.openStore()) })
    .build();
  // Proof: on 2026-09-22, returning `{ ...services, bag }` made 'publishes its two public
  // services and nothing else' receive the extra `bag` key (1 fail, 9 pass).
  return acquireTransactionally(bag, () => ({
    preferences: bag.resolve('preferences'),
    remembered: bag.resolve('remembered'),
  }));
}

/**
 * The one slot that owns the page's runtime.
 *
 * A module constant because there is exactly one page per document and because
 * the fatal state has to be readable by whatever renders it. It starts `empty`:
 * the first runtime is published by the bootstrap's `replace`, awaited like any
 * other transition.
 */
export const applicationSlot: LifetimeSlot<ApplicationServices> =
  createLifetimeSlot<ApplicationServices>();

/** The production acquisition, named so a caller passes a function and not a call. */
export const acquireApplicationRuntime: Acquire<ApplicationServices> = () =>
  installApplicationRuntime();
```

### 7.6 `src/runtime/application-runtime.test.ts`

Nine tests, node tier.

```ts
import { DiBag } from 'di-bag';
import { describe, expect, it } from 'vitest';

import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';
import { THEME_KEY } from '@/modules/preferences/preference-keys';

import {
  acquireTransactionally,
  type ApplicationServices,
  installApplicationRuntime,
} from './application-runtime';
import {
  createLifetimeSlot,
  type LifetimeSlot,
  PartialAcquisitionError,
  RETIREMENT_BUDGET_MS,
} from './lifetime-slot';

/** What a half-finished read of a real graph did, for the transaction assertions. */
interface HalfGraph {
  readonly read: () => { readonly first: string; readonly second: string };
  readonly graph: { readonly close: (options: { timeoutMs: number }) => Promise<void> };
  readonly disposals: () => readonly string[];
}

/**
 * A real DI Bag graph whose second read throws after the first was acquired.
 *
 * Not a hand-written pair of functions: what the transaction has to release is a
 * graph DI Bag owns, and DI Bag releases one only through `close()` on the bag
 * that acquired it — measured, and the reason
 * {@link PartialAcquisitionError} carries a close at all.
 */
function halfAcquiring(): HalfGraph {
  const disposals: string[] = [];
  const bag = DiBag.createBuilder()
    .register({
      first: DiBag.withDisposal(
        DiBag.fromSyncFactory((): string => 'the resource it took'),
        async () => {
          disposals.push('first');
          await Promise.resolve();
        },
      ),
      second: DiBag.fromSyncFactory((): string => {
        throw new Error('alice@example.com could not be composed');
      }),
    })
    .build();
  return {
    graph: bag,
    disposals: () => disposals,
    read: () => ({ first: bag.resolve('first'), second: bag.resolve('second') }),
  };
}

describe('the page’s runtime, installed transactionally', () => {
  /**
   * The installer hands out the contract's exports and nothing else.
   *
   * The assertion that makes the bag unreachable: an extra property on the returned
   * object still satisfies {@link ApplicationServices}, so the type checker refuses
   * nothing here. Enumerating the surface does.
   */
  it('publishes its two public services and nothing else', () => {
    const { services } = installApplicationRuntime({ openStore: fakeBrowserStorage });

    expect(Object.keys(services)).toEqual(['preferences', 'remembered']);
    expect(
      Object.values(services).every((value) => !(value instanceof Object && 'resolve' in value)),
    ).toBe(true);
  });

  it('revokes the store it owns when the installation closes', async () => {
    const store = fakeBrowserStorage();
    const installed = installApplicationRuntime({ openStore: () => store });
    const detail = installed.services.remembered.ganttDetail;

    await installed.close({ timeoutMs: 50 });

    expect(() => {
      detail.write(true);
    }).toThrow('the preferences store was revoked with its runtime');
    expect(() => detail.read()).toThrow('the preferences store was revoked with its runtime');
    expect(store.held()).toEqual({});
  });

  it('publishes the preferences the browser store already holds', () => {
    const store = fakeBrowserStorage({ [THEME_KEY]: '"dark"' });
    const isTheme = (claimed: unknown): claimed is 'dark' | 'light' =>
      claimed === 'dark' || claimed === 'light';

    const { services } = installApplicationRuntime({ openStore: () => store });

    expect(services.remembered.themeChoice(isTheme).read()).toBe('dark');
    expect(services.preferences.unchecked('wbs.demo.id').read()).toBe(null);
  });

  it('releases everything a half-finished read acquired', async () => {
    const half = halfAcquiring();

    const refusal = ((): unknown => {
      try {
        acquireTransactionally(half.graph, half.read);
      } catch (thrown: unknown) {
        return thrown;
      }
      throw new Error('the half-finished read was expected to throw');
    })();

    expect(refusal).toBeInstanceOf(PartialAcquisitionError);
    expect(half.disposals()).toEqual([]);
    await (refusal as PartialAcquisitionError).release({ timeoutMs: 50 });
    expect(half.disposals()).toEqual(['first']);
  });

  it('carries the original failure as the cause of a refused installation', () => {
    const half = halfAcquiring();

    try {
      acquireTransactionally(half.graph, half.read);
      throw new Error('the half-finished read was expected to throw');
    } catch (thrown: unknown) {
      expect(thrown).toBeInstanceOf(PartialAcquisitionError);
      expect((thrown as PartialAcquisitionError).cause).toBeInstanceOf(Error);
      expect(((thrown as PartialAcquisitionError).cause as Error).message).toContain(
        'could not be composed',
      );
    }
  });

  it('refuses the installation when this browser has no store to open', async () => {
    const refusal = ((): unknown => {
      try {
        installApplicationRuntime({
          openStore: () => {
            // Deliberately not a real browser's wording for a blocked store:
            // `DOM_EVIDENCE` in `src/test-tiers.test.ts` reads the names of browser
            // globals as evidence that a suite needs a browser, even in prose, and
            // the real message carries one. This suite stays in the fast tier.
            throw new Error('access to this store is denied');
          },
        });
      } catch (thrown: unknown) {
        return thrown;
      }
      throw new Error('opening no store was expected to throw');
    })();

    expect(refusal).toBeInstanceOf(PartialAcquisitionError);
    // Nothing was acquired, so its release has nothing to give back and must
    // still settle: the slot awaits it before it publishes the fatal state.
    await expect((refusal as PartialAcquisitionError).release({ timeoutMs: 50 })).resolves.toBe(
      undefined,
    );
  });

  /**
   * The production path a refused installation really takes: through the slot,
   * which publishes the sanitized fatal state and stays buildable.
   */
  it('leaves the slot fatal but buildable when the installation is refused', async () => {
    const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);

    await expect(
      slot.replace(() =>
        installApplicationRuntime({
          openStore: () => {
            throw new Error('alice@example.com is not allowed a store');
          },
        }),
      ),
    ).rejects.toBeInstanceOf(PartialAcquisitionError);

    const refused = slot.snapshot();
    expect(refused.status).toBe('fatal');
    if (refused.status !== 'fatal') throw new Error('the slot was expected to be fatal');
    expect(refused.terminal).toBe(false);
    expect(refused.fault.sentence).not.toContain('alice@example.com');
    expect(refused.fault.occurrenceId).not.toBe('');

    const services = await slot.replace(() =>
      installApplicationRuntime({ openStore: fakeBrowserStorage }),
    );
    expect(slot.snapshot().status).toBe('live');
    expect(typeof services.remembered.lastOpenedProject.read).toBe('function');
  });

  /** Retirement gives the store back, through the slot the page really uses. */
  it('revokes the store it owns when the slot retires it', async () => {
    const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>(50);
    const store = fakeBrowserStorage();
    const services = await slot.replace(() =>
      installApplicationRuntime({ openStore: () => store }),
    );
    const detail = services.remembered.ganttDetail;

    await slot.retire();

    expect(slot.snapshot().status).toBe('empty');
    expect(() => {
      detail.write(true);
    }).toThrow('the preferences store was revoked with its runtime');
  });

  it('gives its retirement the production budget when the slot is built with none', async () => {
    const budgets: number[] = [];
    const slot: LifetimeSlot<ApplicationServices> = createLifetimeSlot<ApplicationServices>();
    const store = fakeBrowserStorage();
    await slot.replace(() => {
      const installed = installApplicationRuntime({ openStore: () => store });
      return {
        services: installed.services,
        close: (options) => {
          budgets.push(options.timeoutMs);
          return installed.close(options);
        },
      };
    });

    await slot.retire();

    expect(budgets).toEqual([RETIREMENT_BUDGET_MS]);
  });
});
```

### 7.7 `src/components/chrome/lifetime-fault.tsx`

The skeleton first:

```tsx
import type { ReactNode } from 'react';

import type { DisclosedFault } from './fault-disclosure';

/** The skeleton this slice's red runs against; section 7.7 replaces it whole. */
export function LifetimeFault(_props: { fault: DisclosedFault }): ReactNode {
  throw new Error("the page's bootstrap is not written yet");
}
```

And the whole file:

```tsx
import type { ReactNode } from 'react';

import type { DisclosedFault } from './fault-disclosure';

/**
 * What a reader sees when the page's own runtime could not be built or retired.
 *
 * The lifecycle twin of {@link import('./app-fault').AppFaultBoundary}'s
 * fallback, and **not** that fallback reused: a cleanup or construction failure is
 * not a caught render fault, there is no boundary above it and no tree to lose,
 * so the words differ in the one way that matters — nothing was ever on screen,
 * and nothing a reader typed is at risk. The disclosure is identical, which is
 * the part that has to be: the sentence is whatever
 * {@link import('./fault-disclosure').discloseFault} selected, the line under it
 * is the occurrence handle both reports share, and the caught value reaches
 * neither.
 *
 * It takes a {@link DisclosedFault} and never the thrown value, for
 * `FaultBoundaryProps.fallback`'s reason: a component that could reach the
 * refusal could put it on screen.
 */
export function LifetimeFault({ fault }: { fault: DisclosedFault }): ReactNode {
  return (
    <main
      data-lifetime-fault
      className="bg-background text-foreground min-h-full p-8 font-sans"
      // `alert`, as the root fallback is: there is no page for a screen reader to
      // come back to, so waiting for a quiet moment would describe nothing.
      role="alert"
    >
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">WBS tool v2</h1>
      <p className="mb-4 text-sm">
        The page could not start: {fault.sentence}. Nothing here can put it back — reload to try
        again. Nothing was lost: no plan was open.
      </p>
      {/* Proof: on 2026-09-22, deleting this element left the logged handle absent from the
      page in 'shows the same reference it logged, and nothing of the refusal' (1 fail, 4 pass). */}
      <p className="text-muted-foreground mb-4 font-mono text-xs" data-lifetime-fault-reference>
        Reference {fault.occurrenceId}
      </p>
      <button
        type="button"
        className="border-border bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center rounded-md border px-3 text-sm"
        onClick={() => {
          window.location.reload();
        }}
      >
        Reload
      </button>
    </main>
  );
}
```

### 7.8 `src/components/chrome/lifetime-fault.test.tsx`

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { discloseFault } from './fault-disclosure';
import { LifetimeFault } from './lifetime-fault';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** A refusal carrying exactly what must never reach a reader. */
const refusal = (): Error =>
  new Error('saving plan p-7 for alice@example.com failed', {
    cause: new Error('token sk-live-4419'),
  });

afterEach(() => {
  cleanup();
});

describe('the page that could not start', () => {
  itDom('shows the same reference it logged, and nothing of the refusal', () => {
    const fault = discloseFault(refusal());

    render(<LifetimeFault fault={fault} />);

    const page = document.querySelector('[data-lifetime-fault]')?.textContent ?? null;
    expect(page).toContain(fault.sentence);
    const reference = document.querySelector('[data-lifetime-fault-reference]');
    expect(reference, 'the page disclosed no reference to quote').not.toBeNull();
    expect(reference?.textContent).toContain(fault.occurrenceId);
    // Proof: on 2026-09-22, rendering `String(thrown)` in place of the sentence put
    // 'alice@example.com' on the page and failed this case (1 fail, 4 pass).
    expect(page).not.toContain('alice@example.com');
    expect(page).not.toContain('sk-live-4419');
    expect(page).not.toContain('p-7');
  });

  itDom('offers the one thing that works, a fresh document', () => {
    render(<LifetimeFault fault={discloseFault(refusal())} />);

    expect(screen.getByRole('button', { name: 'Reload' })).toBeDefined();
  });

  itDom('tells a screen reader at once rather than waiting for a quiet moment', () => {
    render(<LifetimeFault fault={discloseFault(refusal())} />);

    expect(document.querySelector('[data-lifetime-fault]')?.getAttribute('role')).toBe('alert');
  });
});
```

### 7.9 `src/runtime/application-bootstrap.tsx`

The skeleton first:

```tsx
import type { ReactNode } from 'react';
import type { RootOptions } from 'react-dom/client';

import type { ApplicationServices } from './application-runtime';
import type { Acquire, LifetimeSlot } from './lifetime-slot';

/** The skeleton this slice's red runs against; section 7.9 replaces it whole. */
export interface BootstrapDependencies {
  readonly acquire: Acquire<ApplicationServices>;
  readonly slot: LifetimeSlot<ApplicationServices>;
  readonly mount: (host: Element, options: RootOptions) => { render: (tree: ReactNode) => void };
}

export function bootstrapApplication(
  _host: Element,
  _dependencies?: BootstrapDependencies,
): Promise<void> {
  throw new Error("the page's bootstrap is not written yet");
}
```

And the whole file:

```tsx
import { type ReactNode, StrictMode } from 'react';
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
import type { Acquire, LifetimeSlot } from './lifetime-slot';

/** What the page's bootstrap is wired from; production passes none of it. */
export interface BootstrapDependencies {
  /** How the page's runtime is built. Defaults to the production installation. */
  readonly acquire: Acquire<ApplicationServices>;
  /** The slot that owns it. Defaults to the page's one slot. */
  readonly slot: LifetimeSlot<ApplicationServices>;
  /** React's root factory, so a test can watch what this renders into it. */
  readonly mount: (host: Element, options: RootOptions) => { render: (tree: ReactNode) => void };
}

const PRODUCTION: BootstrapDependencies = {
  acquire: acquireApplicationRuntime,
  slot: applicationSlot,
  mount: (host, options) => createRoot(host, options),
};

/**
 * Everything between an empty document and a rendering page.
 *
 * The runtime is built **before** the React root renders anything and outside
 * `<StrictMode>`: a runtime created inside the tree is built twice in
 * development, and one created in a lazy initialiser is closed by Strict Mode's
 * first cleanup and reused by its second setup.
 *
 * The first publication is a `replace` on an empty slot, awaited like every later
 * transition, so the initial acquisition is bounded, queued and transactional —
 * see {@link import('./lifetime-slot').LifetimeSlot}.
 *
 * A refused transition is a **modelled outcome, not a fault**: the slot has
 * already turned the refusal into the sanitized public report, and this renders
 * that report instead of the app. It never reads the refusal itself, which is why
 * the state is read back from the slot rather than caught as a value.
 *
 * @throws when the slot refuses without becoming fatal, which its own contract
 * makes impossible: an unreachable union reaches nobody silently.
 */
export async function bootstrapApplication(
  host: Element,
  dependencies: BootstrapDependencies = PRODUCTION,
): Promise<void> {
  const root = dependencies.mount(host, ROOT_FAULT_OPTIONS);
  /** The fault already on screen, so one refusal is shown and logged once. */
  let shown: DisclosedFault | null = null;
  const showFatal = (fault: DisclosedFault): void => {
    if (shown === fault) return;
    shown = fault;
    // Proof: on 2026-09-22, logging the caught refusal instead made 'says nothing raw about a
    // refused start, on the page or in the console' find 'alice@example.com' in the console
    // line (1 fail, 5 pass).
    console.error('the page could not start', fault.sentence, fault.occurrenceId, fault.lost);
    // Proof: on 2026-09-22, dropping this render left the document empty and made 'renders the
    // sanitized fatal page when the first runtime cannot be built' receive null for the fatal
    // element (2 fail, 4 pass).
    root.render(<LifetimeFault fault={fault} />);
  };
  // Every later fatal state reaches the page through the slot rather than through a
  // second policy: a retirement that rejects or outruns its wait is a disclosure
  // boundary exactly as a refused construction is, and the map requires the same
  // sanitized report for both.
  // Proof: on 2026-09-22, dropping this subscription made 'shows the fatal page when a
  // retirement fails, without republishing anything' receive null for the fatal element
  // (1 fail, 5 pass).
  dependencies.slot.subscribe(() => {
    const state = dependencies.slot.snapshot();
    if (state.status === 'fatal') showFatal(state.fault);
  });
  try {
    await dependencies.slot.replace(dependencies.acquire);
  } catch {
    // The refusal is deliberately not bound: the slot disclosed it already, and a
    // value this function could read is a value it could render.
    const refused = dependencies.slot.snapshot();
    if (refused.status !== 'fatal') {
      throw new Error(`the page's runtime was refused and the slot is ${refused.status}`);
    }
    showFatal(refused.fault);
    return;
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
```

### 7.10 `src/runtime/application-bootstrap.test.tsx`

```tsx
import { DiBag } from 'di-bag';
import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LifetimeFault } from '@/components/chrome/lifetime-fault';
import { ROOT_FAULT_OPTIONS } from '@/components/chrome/root-fault-options';
import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';

import { bootstrapApplication, type BootstrapDependencies } from './application-bootstrap';
import { type ApplicationServices, installApplicationRuntime } from './application-runtime';
import {
  createLifetimeSlot,
  type LifetimeSlot,
  PartialAcquisitionError,
  type RetirableRuntime,
} from './lifetime-slot';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** What the recorded root was asked to render, and with which options it was made. */
interface RecordedRoot {
  readonly mount: BootstrapDependencies['mount'];
  readonly options: () => readonly unknown[];
  readonly trees: () => readonly ReactNode[];
  /** The status the slot held each time a tree was rendered, in order. */
  readonly statuses: () => readonly string[];
}

/**
 * A root that records instead of committing.
 *
 * The success path renders the whole `App`, whose first effect fetches the signed-in
 * identity; committing it here would test the app rather than the bootstrap. What is
 * under test is **which** tree is rendered and **when** — after the runtime is live,
 * never before.
 */
function recordingRoot(slot: LifetimeSlot<ApplicationServices>): RecordedRoot {
  const options: unknown[] = [];
  const trees: ReactNode[] = [];
  const statuses: string[] = [];
  return {
    options: () => options,
    trees: () => trees,
    statuses: () => statuses,
    mount: (_host, rootOptions) => {
      options.push(rootOptions);
      return {
        render: (tree) => {
          trees.push(tree);
          statuses.push(slot.snapshot().status);
        },
      };
    },
  };
}

/** The element a recorded render was given, as a typed element or null. */
const elementType = (tree: ReactNode): unknown => (isValidElement(tree) ? tree.type : null);

/** A refusal carrying exactly what must never reach a reader or a console. */
const SECRET = 'alice@example.com';

/** A construction that acquires one owned resource and then refuses, as DI Bag leaves it. */
function refusingAcquisition(): () => RetirableRuntime<ApplicationServices> {
  return () => {
    const bag = DiBag.createBuilder()
      .register({
        owned: DiBag.withDisposal(
          DiBag.fromSyncFactory((): string => 'the store it took'),
          async () => {
            await Promise.resolve();
          },
        ),
      })
      .build();
    bag.resolve('owned');
    throw new PartialAcquisitionError(
      new Error(`the page for ${SECRET} could not be composed`),
      (options) => bag.close(options),
    );
  };
}

/**
 * The console, muted and recorded.
 *
 * A named helper rather than `ReturnType<typeof vi.spyOn>`: that type is `any` for
 * a two-argument `spyOn`, and every read of `.mock` under it is an
 * `@typescript-eslint/no-unsafe-member-access` error (observed 2026-09-22).
 */
const muteConsoleError = () =>
  vi.spyOn(console, 'error').mockImplementation(() => {
    return undefined;
  });

let logged: ReturnType<typeof muteConsoleError>;

beforeEach(() => {
  logged = muteConsoleError();
});

afterEach(() => {
  logged.mockRestore();
});

describe('the page’s bootstrap', () => {
  itDom('renders the app only once its runtime is live, with the root fault options', async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const root = recordingRoot(slot);

    await bootstrapApplication(document.createElement('div'), {
      slot,
      mount: root.mount,
      acquire: () => installApplicationRuntime({ openStore: fakeBrowserStorage }),
    });

    expect(root.options()).toEqual([ROOT_FAULT_OPTIONS]);
    expect(root.trees()).toHaveLength(1);
    // Proof: on 2026-09-22, awaiting the replacement after the render made this case receive
    // 'constructing' instead of 'live' (1 fail, 5 pass).
    expect(root.statuses()).toEqual(['live']);
    expect(elementType(root.trees()[0])).not.toBe(LifetimeFault);
  });

  itDom('renders the sanitized fatal page when the first runtime cannot be built', async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const root = recordingRoot(slot);

    await bootstrapApplication(document.createElement('div'), {
      slot,
      mount: root.mount,
      acquire: refusingAcquisition(),
    });

    expect(root.trees()).toHaveLength(1);
    expect(elementType(root.trees()[0])).toBe(LifetimeFault);
    expect(slot.snapshot().status).toBe('fatal');
  });

  itDom('says nothing raw about a refused start, on the page or in the console', async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const root = recordingRoot(slot);

    await bootstrapApplication(document.createElement('div'), {
      slot,
      mount: root.mount,
      acquire: refusingAcquisition(),
    });

    // Every line, not only the one this code wrote, and the disclosure assertions
    // before the shape ones: a mutation that adds a second line must be read here as
    // what it is — the refusal reaching the console — and not as a count.
    const lines = logged.mock.calls;
    // Only disclosures reach the console, so every argument is a string this code
    // chose. A caught value logged instead is an object here, and `JSON.stringify`
    // would not show it: an `Error` serialises to `{}` and this refusal keeps the
    // marker on its `cause` (watched 2026-09-22, which is why the shape is asserted
    // and not only the text).
    expect(
      lines.flat().filter((argument) => typeof argument !== 'string'),
      'a console line carried a value instead of a disclosure',
    ).toEqual([]);
    expect(lines.flat().map(String).join(' ')).not.toContain(SECRET);
    const shown = root.trees()[0];
    expect(
      JSON.stringify(isValidElement<{ fault: unknown }>(shown) ? shown.props : null),
    ).not.toContain(SECRET);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(4);
  });

  itDom('shows the fatal page when a retirement fails, without republishing anything', async () => {
    const slot = createLifetimeSlot<ApplicationServices>(50);
    const root = recordingRoot(slot);
    await bootstrapApplication(document.createElement('div'), {
      slot,
      mount: root.mount,
      acquire: () => {
        const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
        return {
          services: installed.services,
          close: async () => {
            await Promise.reject(new Error(`the store of ${SECRET} would not let go`));
          },
        };
      },
    });

    await expect(slot.retire()).rejects.toThrow('would not let go');
    await Promise.resolve();

    expect(root.trees()).toHaveLength(2);
    expect(elementType(root.trees()[1])).toBe(LifetimeFault);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
  });
});
```

### 7.11 `src/main.tsx`, whole

```tsx
import './styles.css';

import { bootstrapApplication } from './runtime/application-bootstrap';

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');
// The runtime is built before anything renders, so no component ever owns it, and
// the bootstrap models its own failure as the sanitized fatal page. Nothing is
// caught here: a rejection from this call is a defect in the bootstrap itself, and
// an unhandled rejection is louder than a handler nobody reads.
void bootstrapApplication(el);
```

### 7.12 `e2e/lifetime-fault-probe.ts`

Written by the executor, **run by the planner**.

```ts
import { DiBag } from 'di-bag';
import { createRoot } from 'react-dom/client';

import { bootstrapApplication } from '@/runtime/application-bootstrap';
import type { ApplicationServices } from '@/runtime/application-runtime';
import {
  createLifetimeSlot,
  PartialAcquisitionError,
  type RetirableRuntime,
} from '@/runtime/lifetime-slot';

/**
 * What one run of the page's real bootstrap, refused, put on the page.
 *
 * The console is not in here: Playwright listens to it from outside the page, which
 * is the only reading that includes React's own lines as well as the bootstrap's.
 */
export interface LifetimeFaultProof {
  /** Everything the fatal page rendered, as text. */
  readonly pageText: string;
  /** Everything it rendered, as markup: attributes as well as text. */
  readonly markup: string;
  /** The occurrence identifier it disclosed, or null if it disclosed none. */
  readonly reference: string | null;
}

/**
 * A construction that acquires one owned resource in a real bag and then refuses.
 *
 * Its literal strings are what `lifetime-fault.spec.ts` searches the document and the
 * console for: a personal identifier in the message, a credential and an internal
 * locator on the cause. String literals, because the shipped config builds this probe
 * minified and an identifier would not survive that.
 */
function refuseAfterAcquiring(): RetirableRuntime<ApplicationServices> {
  const bag = DiBag.createBuilder()
    .register({
      owned: DiBag.withDisposal(
        DiBag.fromSyncFactory((): string => 'the store it took'),
        async () => {
          await Promise.resolve();
        },
      ),
    })
    .build();
  bag.resolve('owned');
  throw new PartialAcquisitionError(
    new Error('saving plan p-7 for alice@example.com failed', {
      cause: { authorization: 'Bearer live-token', detail: 'row 42 of plan_steps' },
    }),
    (options) => bag.close(options),
  );
}

/**
 * Run the shipped bootstrap against a refused construction and read the page.
 *
 * Deliberately the production `bootstrapApplication` and the production
 * `createRoot` wiring from `src/`, through the deployed Vite config: a probe over
 * its own copy would keep passing while the page's grew a raw message. The slot is
 * a fresh one rather than the page's, so this proves the refusal path without
 * depending on what the document's own bootstrap did first.
 */
async function proveTheFatalPageDisclosesNothingRaw(): Promise<LifetimeFaultProof> {
  const host = document.createElement('div');
  document.body.append(host);
  await bootstrapApplication(host, {
    acquire: refuseAfterAcquiring,
    slot: createLifetimeSlot<ApplicationServices>(1_000),
    mount: (element, options) => createRoot(element, options),
  });
  const deadline = Date.now() + 10_000;
  while (host.querySelector('[data-lifetime-fault]') === null) {
    if (Date.now() > deadline) throw new Error('the fatal page never rendered');
    await new Promise((settle) => setTimeout(settle, 10));
  }
  const reference = host.querySelector('[data-lifetime-fault-reference]')?.textContent ?? null;
  return {
    pageText: host.textContent,
    markup: host.innerHTML,
    reference: reference === null ? null : reference.replace('Reference ', ''),
  };
}

// The cast names the one boundary this file has: a bundled module and the page that
// loads it share nothing but this global, and `globalThis` is typed without it.
(globalThis as unknown as { lifetimeFaultProof: Promise<LifetimeFaultProof> }).lifetimeFaultProof =
  proveTheFatalPageDisclosesNothingRaw();
```

### 7.13 `e2e/lifetime-fault.spec.ts`

```ts
import { expect, test } from '@playwright/test';

import { buildBrowserProbeBundle } from './browser-probe-bundle';
// A type-only import, and it has to stay one: Playwright loads a spec in Node, so a value
// imported from the probe would execute the probe here and fail before a browser existed.
import type { LifetimeFaultProof } from './lifetime-fault-probe';

/**
 * Strings that exist only inside the refused construction, and must exist nowhere else.
 *
 * Written out rather than derived: `lifetime-fault-probe.ts` throws exactly these.
 */
const RAW_MARKERS = ['alice@example.com', 'Bearer live-token', 'row 42 of plan_steps'];

/**
 * An origin nothing serves, fulfilled by the route below.
 *
 * `https`, so the page is a secure context and `crypto.getRandomValues` exists — which is
 * what every occurrence identifier needs. `fault-boundary.spec.ts` bootstraps its own
 * bundle the same way and for the same reason.
 */
const bootstrap = 'https://lifetime-fault-probe.invalid/';

test('a refused application runtime discloses a public report and nothing raw', async ({
  page,
}) => {
  // One budget for the whole case — the routed page, the Vite build of the probe and its
  // execution — rather than the config's 60 seconds.
  test.setTimeout(120_000);
  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (line) => {
    consoleLines.push(line.text());
  });
  page.on('pageerror', (thrown) => {
    pageErrors.push(String(thrown));
  });
  await page.route('**/*', async (route) => {
    if (route.request().url() === bootstrap) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><title>lifetime fault probe</title>',
      });
      return;
    }
    await route.abort('blockedbyclient');
  });
  await page.goto(bootstrap);

  const bundle = await buildBrowserProbeBundle('e2e/lifetime-fault-probe.ts');
  await page.addScriptTag({ content: bundle.code, type: 'module' });
  const proof = await page.evaluate(
    async () =>
      await (globalThis as unknown as { lifetimeFaultProof?: Promise<LifetimeFaultProof> })
        .lifetimeFaultProof,
  );

  // A refused construction is a modelled outcome: nothing escaped to the page's own
  // error handler, or every assertion below would be vacuous.
  expect(pageErrors).toEqual([]);
  expect(proof?.pageText).toContain('The page could not start: Something went wrong');
  expect(proof?.reference).toMatch(/^AE_[0-9A-Z]+$/);
  // The fatal page's own subtree, markup and all, and **not** `page.content()`: the probe
  // is injected with `addScriptTag`, so the whole document contains the probe's own source
  // and therefore every marker in it.
  expect(RAW_MARKERS.filter((marker) => proof?.markup.includes(marker) ?? true)).toEqual([]);

  // The console is a disclosure boundary too, and in a real browser it carries React's
  // lines as well as the bootstrap's. Every line is read, not only the one this code wrote.
  const whole = consoleLines.join('\n');
  expect(RAW_MARKERS.filter((marker) => whole.includes(marker))).toEqual([]);
  expect(consoleLines).toContain(
    `the page could not start Something went wrong ${String(proof?.reference)} nothing`,
  );
});
```

### 7.14 The model test's new commands, as a diff

Applied to `src/runtime/lifetime-slot.model.test.ts`. Nothing already there is weakened: two fields, one
invariant method, one command field with its arbitrary, one builder, and one call.

```diff
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
index db72d41a..9a72ebfb 100644
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
@@ -2,6 +2,9 @@ import { DiBag } from 'di-bag';
 import fc from 'fast-check';
 import { describe, expect, it } from 'vitest';

+import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';
+
+import { installApplicationRuntime } from './application-runtime';
 import {
   createLifetimeSlot,
   type LifetimeSlot,
@@ -18,6 +21,16 @@ interface Tracked {
   closeCalls: number;
   /** How many of those completed, either way. */
   closeSettles: number;
+  /**
+   * Whether the production graph behind this runtime was really closed.
+   *
+   * Only an `installed` runtime has one; `null` for the generated graphs. It is
+   * what the store-revocation invariant is stated against, because a close that
+   * was refused before it reached the bag revokes nothing.
+   */
+  graphClosed: boolean;
+  /** Answers whether the installed store has been revoked, or `null` when there is none. */
+  probeRevoked: (() => boolean) | null;
 }

 /**
@@ -52,7 +65,14 @@ class Ownership {
   readonly outcomes: { readonly ordinal: number; outcome: 'pending' | 'done' | 'refused' }[] = [];

   track(name: string): Tracked {
-    const record: Tracked = { name, acquisitions: 0, closeCalls: 0, closeSettles: 0 };
+    const record: Tracked = {
+      name,
+      acquisitions: 0,
+      closeCalls: 0,
+      closeSettles: 0,
+      graphClosed: false,
+      probeRevoked: null,
+    };
     this.runtimes.push(record);
     return record;
   }
@@ -69,6 +89,26 @@ class Ownership {
       expect(runtime.acquisitions, `${runtime.name} was acquired twice`).toBe(1);
     }
   }
+
+  /**
+   * An installed runtime's store is revoked exactly when its graph was closed.
+   *
+   * The production half of invariant 2: "the close was attempted" is what the
+   * owner controls, and "the store was given back" is what a reader's browser
+   * actually observes. A live runtime's store is never revoked, or the page would
+   * be holding services that refuse every preference.
+   */
+  storesFollowTheirGraphs(live: string | null): void {
+    for (const runtime of this.runtimes) {
+      const probe = runtime.probeRevoked;
+      if (probe === null || runtime.acquisitions === 0) continue;
+      expect(
+        probe(),
+        `${runtime.name}: revoked=${String(probe())}, graphClosed=${String(runtime.graphClosed)}, live=${String(live)}`,
+      ).toBe(runtime.graphClosed);
+      if (runtime.name === live) expect(probe(), `${runtime.name} is live and revoked`).toBe(false);
+    }
+  }
 }

 /** A generated request against the slot. */
@@ -81,6 +121,16 @@ type Command =
       readonly partial: boolean;
       /** Whether it asks for another replacement from inside the factory or a listener. */
       readonly reentry: 'none' | 'factory' | 'listener';
+      /**
+       * Which graph it publishes: a generated one, or the page's **real**
+       * application runtime over a fake browser store.
+       *
+       * The installed flavour is what puts the production installer — the sealed
+       * preferences module, its owned revocable store and the transaction around
+       * it — inside the generated interleavings, instead of only in named
+       * examples.
+       */
+      readonly graph: 'fake' | 'installed';
     }
   | { readonly kind: 'retire' }
   | { readonly kind: 'settle' };
@@ -94,6 +144,7 @@ const commandArb: fc.Arbitrary<Command> = fc.oneof(
       disposal: fc.constantFrom('settles' as const, 'rejects' as const, 'never' as const),
       partial: fc.boolean(),
       reentry: fc.constantFrom('none' as const, 'factory' as const, 'listener' as const),
+      graph: fc.constantFrom('fake' as const, 'installed' as const),
     }),
     weight: 4,
   },
@@ -173,6 +224,53 @@ describe('the ownership rule, under generated interleavings', () => {
             };
           };

+          /**
+           * The page's real runtime, published as this generated runtime.
+           *
+           * `installApplicationRuntime` is the production function, over a fake
+           * browser store: real acquisition, the real sealed module and its real
+           * revocation on close, with the **timing** of that close left to the
+           * scheduler.
+           *
+           * The chosen disposal mode decides only when the close runs, never
+           * whether it fails, and that is a fact about the graph rather than a
+           * convenience: the page's application graph has exactly one disposer, a
+           * synchronous revocation that can neither reject nor hang. The rejecting
+           * and never-settling flavours therefore stay with the generated graphs
+           * above, which is where a socket or a timer will be modelled.
+           */
+          const buildInstalled = (record: Tracked): RetirableRuntime<Tracked> => {
+            const installed = installApplicationRuntime({ openStore: fakeBrowserStorage });
+            record.acquisitions += 1;
+            record.probeRevoked = () => {
+              try {
+                installed.services.remembered.ganttDetail.read();
+                return false;
+              } catch {
+                return true;
+              }
+            };
+            return {
+              services: record,
+              close: async (options) => {
+                record.closeCalls += 1;
+                world.disposing += 1;
+                world.maxConcurrentDisposals = Math.max(
+                  world.maxConcurrentDisposals,
+                  world.disposing,
+                );
+                try {
+                  await scheduler.schedule(Promise.resolve(), `dispose ${record.name}`);
+                  await installed.close(options);
+                  record.graphClosed = true;
+                } finally {
+                  world.disposing -= 1;
+                  record.closeSettles += 1;
+                }
+              },
+            };
+          };
+
           /** A construction that acquires one resource and then throws, transactionally. */
           const buildPartial = (record: Tracked): never => {
             const bag = DiBag.createBuilder()
@@ -222,6 +320,7 @@ describe('the ownership rule, under generated interleavings', () => {
                   disposal: 'settles',
                   partial: false,
                   reentry: 'none',
+                  graph: 'fake',
                 });
               };
             }
@@ -234,10 +333,12 @@ describe('the ownership rule, under generated interleavings', () => {
                       disposal: 'settles',
                       partial: false,
                       reentry: 'none',
+                      graph: 'fake',
                     });
                   }
                   world.builds.push({ ordinal, issuedWhenBuilt: issued });
                   if (command.partial) return buildPartial(record);
+                  if (command.graph === 'installed') return buildInstalled(record);
                   return buildRuntime(record, command.disposal);
                 })
                 .then(
@@ -286,8 +387,10 @@ describe('the ownership rule, under generated interleavings', () => {

           // 1. One live runtime at most, and it is the last thing published.
           if (live !== null) expect(world.published.at(-1)).toBe(live);
-          // 2. Ownership is accounted for, in every state including fatal.
+          // 2. Ownership is accounted for, in every state including fatal, and an
+          //    installed runtime's store followed its own graph.
           world.ownershipIsAccountedFor(live);
+          world.storesFollowTheirGraphs(live);
           // 3. Disposals never overlap: that is what the queue is for.
           expect(world.maxConcurrentDisposals, 'two disposals overlapped').toBeLessThanOrEqual(1);
           // 4. A request that was already superseded when its factory ran never
```

### 7.15 `src/modules/preferences/composition-agreement.test.ts`

```ts
import { afterEach, expect, test } from 'vitest';

import { installApplicationRuntime } from '@/runtime/application-runtime';

import { rememberedPreferences } from './composition';
import { GANTT_DETAIL_KEY } from './preference-keys';

// Needs a browser: both surfaces under test reach this reader's own
// `localStorage`, which is the whole point of the case.

afterEach(() => {
  localStorage.removeItem(GANTT_DETAIL_KEY);
});

/**
 * The staged duplicate is harmless, and this is what says so.
 *
 * Delivery still imports the module-load `rememberedPreferences`; the page's
 * runtime installs the same module for itself. Two instances, and no divided
 * state: every preference lives in the reader's browser, the adapter reaches it
 * **per call**, and neither instance holds a value. The duplicate therefore costs
 * two closures and nothing else — which is what makes moving delivery onto the
 * runtime's services a later packet's job rather than this one's risk.
 */
test('the runtime-owned preferences and the module-load ones read the same bytes', async () => {
  const installed = installApplicationRuntime();

  installed.services.remembered.ganttDetail.write(true);
  expect(rememberedPreferences.ganttDetail.read()).toBe(true);
  rememberedPreferences.ganttDetail.write(false);
  expect(installed.services.remembered.ganttDetail.read()).toBe(false);

  await installed.close({ timeoutMs: 50 });

  // Retiring the runtime revokes only the store it owned: the module-load surface
  // is a different instance over the same browser, and delivery keeps working.
  expect(() => installed.services.remembered.ganttDetail.read()).toThrow(
    'the preferences store was revoked with its runtime',
  );
  expect(rememberedPreferences.ganttDetail.read()).toBe(false);
});
```

### 7.16 `src/modules/preferences/composition.ts`, as a diff

```diff
--- a/composition.ts
+++ b/composition.ts
@@ -4,7 +4,16 @@
 import { createPreferences } from './preferences.resource';

 /**
- * The one preferences resource this app runs on.
+ * The module-load preferences resource delivery still imports.
+ *
+ * **Staged, and recorded as debt.** The page's runtime now installs this same
+ * module through `installApplicationRuntime`, which is where preferences will be
+ * read from once delivery takes them out of a context. Until then there are two
+ * instances of a service that holds **no state** — every preference lives in the
+ * reader's browser and the adapter reaches it per call — so the two agree by
+ * construction, and `composition-agreement.test.ts` is what says so. What the
+ * runtime's instance has and this one has not is an owner: retiring it revokes
+ * its store.
  *
  * Exported because `apps/wbs/fe-01/src/lib/remembered.ts` still offers the
  * generic factory to the layout module, which builds a store per project id and
```

### 7.17 `src/modules/preferences/README.md`, as a diff

```diff
--- a/README.md
+++ b/README.md
@@ -39,15 +39,25 @@
 ## Relationships

 The exported types are in `contract.ts`; the repository adapter is
-`browser-storage.repository.ts`; the resource is `preferences.resource.ts`; the named answers are
-`preferences.feature.ts`; `composition.ts` builds both instances over the real adapter. There is
-no `module.ts` yet: DI Bag is not installed. `apps/wbs/fe-01/src/lib/remembered.ts` keeps the
-generic factory for the layout module, which builds a store per project id.
+`browser-storage.repository.ts`, which also holds the revocable store the module owns; the
+resource is `preferences.resource.ts`; the named answers are `preferences.feature.ts`.
+`module.ts` is the sealed DI Bag module — exports `preferences` and `remembered`, keeps
+`preferencesStore` private under the `frontend.preferences` label, and requires `browserStore`
+from its host, which is `apps/wbs/fe-01/src/runtime/application-runtime.ts`. `composition.ts`
+still builds the module-load instances delivery imports; that duplicate is staged debt and
+`composition-agreement.test.ts` proves it divides no state. `apps/wbs/fe-01/src/lib/remembered.ts`
+keeps the generic factory for the layout module, which builds a store per project id, and is the
+reason `preferences` is a public export at all.
+
+This module carries **no** `module-index` block yet, and adding one is its own packet: the
+`docs/wiki-policy` registration and the index that names these files land together, for the reason
+`libs/wbs/application/core/src/module/plan-history/README.md` gives.

 ## Checks

 The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`, for
-`preferences.resource.test.ts`, `preferences.feature.test.ts` and `composition.test.ts`. The
-adapter's own suite, `browser-storage.repository.test.ts`, names browser globals and therefore
-runs in the `test` target instead. The behaviour this extraction preserves is proved by the theme,
+`preferences.resource.test.ts`, `preferences.feature.test.ts`, `composition.test.ts` and
+`module.test.ts`. The adapter's own suite, `browser-storage.repository.test.ts`, and
+`composition-agreement.test.ts` name browser globals and therefore run in the `test` target
+instead. The behaviour this extraction preserves is proved by the theme,
 layout, chart, settings and project page suites in that same target.
```

## 8. Proofs

Fourteen faults, each injected **alone**, each at `wbs-fe-01:typecheck` exit 0. Copy the file to
`$TMPDIR` first, save the mutation as a patch, restore with `cp`, and prove the restore with `cmp`
**before** asserting on any captured status. Never `rm` a scratch file. Save a patch with this block
exactly, `status=$?` **inside** the `else` — after a completed `if` it would read the `if`'s own status,
which is 0:

```sh
if out=$(diff -u "$TMPDIR/<name>.passing" "<the file>"); then
  printf 'the mutation changed nothing\n' >&2
  exit 1
else
  status=$?
  if [ "$status" -ne 1 ]; then
    printf 'diff failed: %s\n' "$status" >&2
    exit "$status"
  fi
fi
printf '%s\n' "$out" > "$TMPDIR/evidence/<name>.patch"
```

Two commands read the faults. **Node** is
`(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/runtime src/modules/preferences/module.test.ts)`,
green at `Tests 42 passed (42)`. **Jsdom** is
`(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx src/components/chrome/lifetime-fault.test.tsx src/modules/preferences/composition-agreement.test.ts)`,
green at `Tests 8 passed (8)`. Keep each status (`cmd > log 2>&1; echo "exit=$?"`).

### 8.1 The module, its seal and its owned store

| #       | Fault, exactly                                                                                                                          | Named test that must fail                                                   | Observed                                                                                                                                                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N1**  | in `module.ts`, replace the `preferencesStore` `DiBag.withDisposal(…)` with its inner `DiBag.fromSyncFactory(…)` alone                  | `gives the store back when its host graph closes`                           | node `4 failed \| 38 passed (42)`, jsdom `1 failed \| 7 passed (8)`: `AssertionError: expected [Function] to throw an error`, and the model test on `r2: revoked=false, graphClosed=true, live=r3`                                                      |
| **N2**  | in `revocableStorage`'s `held`, replace `if (revoked) throw new Error(REVOKED); return store;` with `return revoked ? store : store;`   | `refuses every access once the store has been given back`                   | node `5 failed \| 37 passed (42)`, jsdom `1 failed \| 7 passed (8)`: the same `to throw an error` on five named tests — N1's four **plus** this one, which is how the two faults are told apart                                                         |
| **N3**  | in `module.ts`, add `'preferencesStore'` to the `buildModule` export tuple                                                              | `keeps its owned store out of a host graph`                                 | node `4 failed \| 38 passed (42)`: `expected [Function] to throw an error`, and `expected [ 'preferences', …(3) ] to include 'frontend.preferences/preferencesStore'`                                                                                   |
| **N4**  | in `module.ts`, drop `{ label: PREFERENCES_LABEL }` from `buildModule`                                                                  | `labels its owned store with the module name`                               | node `2 failed \| 40 passed (42)`: `expected [ 'preferences', 'remembered', …(2) ] to include 'frontend.preferences/preferencesStore'`, and the omitted-requirement message without the label prefix                                                    |
| **N14** | in `module.ts`, make the `preferencesStore` factory take `remembered` too and call `remembered.ganttDetail.read()` — a registered cycle | `publishes the answers delivery asks for, over the store its host supplied` | node `8 failed \| 34 passed (42)`, jsdom `3 failed \| 5 passed (8)`: `Error: DI_BAG_CYCLE: cycle: preferences -> frontend.preferences/preferencesStore -> remembered -> preferences`, so the label reaches a cycle path as well as a missing dependency |

### 8.2 The runtime, its transaction and its close

| #      | Fault, exactly                                                                                                              | Named test that must fail                                | Observed                                                                                                                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N5** | in `acquireTransactionally`'s `catch`, replace the `throw new PartialAcquisitionError(…)` with `throw failure;`             | `releases everything a half-finished read acquired`      | node `4 failed \| 38 passed (42)`: `AssertionError: expected Error: alice@example.com could not be com… to be an instance of PartialAcquisitionError`, on all four transaction tests                                                                      |
| **N6** | in `installApplicationRuntime`, add `bag,` to the object the `read` closure returns                                         | `publishes its two public services and nothing else`     | node `1 failed \| 41 passed (42)`: `expected [ 'preferences', 'remembered', 'bag' ] to deeply equal [ 'preferences', 'remembered' ]`                                                                                                                      |
| **N7** | in `acquireTransactionally`, replace `close: (options) => graph.close(options)` with `close: async () => Promise.resolve()` | `revokes the store it owns when the installation closes` | node `3 failed \| 39 passed (42)`, jsdom `1 failed \| 7 passed (8)`: `expected [Function] to throw an error`, and the model test on `r2: revoked=false, graphClosed=true, live=r3`. It does **not** fail N1's or N2's own tests, which is the distinction |

### 8.3 The bootstrap and the fatal page

| #       | Fault, exactly                                                                                                  | Named test that must fail                                                     | Observed                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **N8**  | in `showFatal`, delete `root.render(<LifetimeFault fault={fault} />);`                                          | `renders the sanitized fatal page when the first runtime cannot be built`     | jsdom `2 failed \| 6 passed (8)`: `AssertionError: expected [] to have a length of 1 but got +0`                                                 |
| **N9**  | bind the refusal and log it: `} catch (refusal: unknown) { console.error('the page could not start', refusal);` | `says nothing raw about a refused start, on the page or in the console`       | jsdom `1 failed \| 7 passed (8)`: `AssertionError: a console line carried a value instead of a disclosure: expected [ …(1) ] to deeply equal []` |
| **N10** | delete the `dependencies.slot.subscribe(…)` block                                                               | `shows the fatal page when a retirement fails, without republishing anything` | jsdom `1 failed \| 7 passed (8)`: `AssertionError: expected [ { …(10) } ] to have a length of 2 but got 1`                                       |
| **N11** | move the `root.render(<StrictMode><App /></StrictMode>)` above the `try` and delete the one at the end          | `renders the app only once its runtime is live, with the root fault options`  | jsdom `2 failed \| 6 passed (8)`: `AssertionError: expected [ 'empty' ] to deeply equal [ 'live' ]`                                              |
| **N12** | in `showFatal`, render `fault={{ ...fault, sentence: \`alice@example.com: ${fault.sentence}\` }}`               | `says nothing raw about a refused start, on the page or in the console`       | jsdom `1 failed \| 7 passed (8)`: `AssertionError: expected '{"fault":{"sentence":"alice@example.c…' not to contain 'alice@example.com'`         |
| **N13** | in `lifetime-fault.tsx`, delete the `<p … data-lifetime-fault-reference>` element                               | `shows the same reference it logged, and nothing of the refusal`              | jsdom `1 failed \| 7 passed (8)`: `AssertionError: the page disclosed no reference to quote: expected null not to be null`                       |

N9 and N12 share a named test and are still separate checks: one puts a **value** in the console and the
other puts a **string** on the page, and the test's two assertions fail one each — the shape assertion
for N9, the DOM-props assertion for N12. That is the "two checks behind one test" rule satisfied by two
assertions with their own messages, and the Chromium case of section 7.13 reads both in a real browser.

### 8.4 What the model test's new commands are worth

The extension is only worth what it catches. Rehearsed three ways:

- with **N1** injected, the model test fails: `Error: Property failed after 27 tests`,
  `{ seed: 20260923, path: "26:0:0", endOnFailure: true }`, counterexample
  ``[schedulerFor()`\n-> [task${1}] promise::dispose r2 resolved`,[{"kind":"retire"},{"kind":"replace","disposal":"settles","partial":false,"reentry":"factory","graph":"installed"}]]``,
  `Shrunk 2 time(s)`, on `AssertionError: r2: revoked=false, graphClosed=true, live=r3: expected false to be true`.
- with **N1 injected and the `graph` arbitrary forced to `fc.constant('fake')`**, the same model test
  **passes** (`Tests 1 passed (1)`). So it is the new `installed` commands, and not the old ones, that
  reach this fault: the extension earns its place rather than decorating the file.
- **N7** moves it too, identically — the production close being a no-op is indistinguishable from the
  module having no disposer, as far as ownership is concerned, and the example tests of section 8.2 are
  what separate them.

`{ seed: 20260923, numRuns: 300 }` is unchanged, so the executor walks the interleavings the planner
did, and the file runs in **355 ms** measured.

## 9. Verification

### The executor runs, per slice

| Command                                                                                                                                                | Expected                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| the sandbox unit command of step 0                                                                                                                     | exit 0; F0/T0 recorded, then the slice's own relative delta     |
| `(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/modules/preferences/module.test.ts)`                                         | slice 1: red `4 failed \| 4 passed (8)`, then `8 passed (8)`    |
| `(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/runtime/application-runtime.test.ts src/modules/preferences/module.test.ts)` | slice 2: red `9 failed \| 8 passed (17)`, then `17 passed (17)` |
| `(cd apps/wbs/fe-01 && bunx vitest run src/runtime/application-bootstrap.test.tsx src/components/chrome/lifetime-fault.test.tsx)`                      | slice 3: red `7 failed (7)`, then `7 passed (7)`                |
| `(cd apps/wbs/fe-01 && bunx vitest run src/main.test.tsx)`                                                                                             | slice 3: exit 0, `Tests 1 passed (1)`                           |
| `(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/runtime/lifetime-slot.model.test.ts)`                                        | slice 4: exit 0, `Tests 1 passed (1)`, about 355 ms             |
| `(cd apps/wbs/fe-01 && bunx vitest run src/modules/preferences/composition-agreement.test.ts)`                                                         | slice 4: exit 0, `Tests 1 passed (1)`                           |
| the two fault commands of section 8                                                                                                                    | slice 5: green at `42 passed (42)` and `8 passed (8)`           |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                                                                                      | exit 0, including under every one of the fourteen faults        |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                                                                                           | exit 0                                                          |
| `GSETTINGS_BACKEND=memory bunx prettier --check <the slice's files>`                                                                                   | exit 0                                                          |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                          | slice 6: `items` = V0, `failed: 0`, this change `valid: true`   |

The whole-tree sandbox unit command ends at **F0 + 2** files and **T0 + 17** tests across slices 1 and 2
and does not move in slices 3 to 6. Measured on the finished tree: `46 passed (46)` files,
`656 passed (656)` tests — absolute numbers as orientation only.

**Order matters once.** Run each slice's baseline **after** that slice's first `wbs-fe-01:typecheck`,
never before: a typecheck writes `dist/out-tsc/apps/wbs/fe-01/*`, and although the node tier's explicit
`include` list ignores it (re-measured here: same files, same counts), a `bun test <dir>` anywhere near
this tree would collect it. This packet prescribes no `bun test`.

### Planner-only, with the values the planner observed

| Command                                                                                                     | Observed                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1` in `apps/wbs/fe-01` (the whole jsdom tier)    | exit 0, `128 passed (128)` files, `2944 passed (2944)` tests, 434 s — packet a's tier was `123`/`2921`, so this packet adds 5 files and 23 tests and **changes no existing assertion**                                                   |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                               | exit 0, `✓ built in 607ms` — `main.tsx` uses no top-level `await`, so no build target question arises                                                                                                                                    |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run tool-devsync:test --skip-nx-cache` | exit 0, `366 pass`, `0 fail`, with every new file **staged** — same count as packet a, so no pin moves                                                                                                                                   |
| `CI=1 E2E_PORT_SHIFT=3000 NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- e2e/lifetime-fault.spec.ts`          | exit 0, `1 passed (8.3s)`                                                                                                                                                                                                                |
| the same command with fault **N12** injected                                                                | `1 failed`; the page read `The page could not start: alice@example.com: Something went wrong` and the case failed on `expect(proof?.pageText).toContain('The page could not start: Something went wrong')` — the Chromium case has teeth |
| `CI=1 E2E_PORT_SHIFT=3000 … -- e2e/dark-mode.spec.ts e2e/gantt-detail.spec.ts e2e/header.spec.ts`           | exit 0, `25 passed (1.2m)` — the page still boots through the asynchronous bootstrap, with the theme, chart-detail and header behaviour unchanged                                                                                        |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test`                                                        | not run for this packet; it adds no file under `apps/wiki/cli` and registers no rule                                                                                                                                                     |
| four real `git commit`s with lefthook on, one per code slice                                                | exit 0 each, after two refusals this rehearsal caught — see below                                                                                                                                                                        |
| `bin/h2puni-gate.sh <sha>`                                                                                  | the planner's, after the last slice                                                                                                                                                                                                      |

**What the commit rehearsal caught, and the executor will too.** `bunx eslint --fix` sorts imports and
leaves the file **not** Prettier-clean, so two of the four commits were refused by lefthook's `format`
command with `[warn] apps/wbs/fe-01/src/…/<file>` and `exit status 1`. After `--fix`, run
`GSETTINGS_BACKEND=memory bunx prettier --write` on the same files and then `--check`; the executor does
not commit, so it must run both itself before handing over. Never `--no-verify`.

**Chromium.** Pick `E2E_PORT_SHIFT` as a multiple of 300 away from every other live run and check the
three ports — `+0`, `+100` and `+1100` from 3100/3200/4200 — with `ss -ltn` first. This rehearsal used
3000, so 6100, 6200 and 7200. Never kill a process you cannot prove is yours (`ls -l /proc/<pid>/cwd`).

**What could not be rehearsed here.** The page's own document cannot reach the fatal path today: no
input a shipped page receives can fail this installation, because the store adapter touches the browser
only per call and nothing in the graph reads it at construction. The Chromium case therefore drives the
**production** `bootstrapApplication` through an injected probe bundle, exactly as
`e2e/fault-boundary.spec.ts` drives the production boundary. A case driven by the page itself needs a
production retirement trigger, which is 050-7-d's; section 11 says so.

## 10. Stop conditions

Each is scoped to the slice that reads it, and each is false on that slice's real starting tree.

- a red run prints `No test files found` or `Tests no tests` instead of the count the slice names.
- the model test fails on the finished tree. Record the counterexample and the seed it prints and
  stop: seed and run count are pinned, so a failure is a real race and not a flake.
- a fault in section 8 leaves its **named** test passing. Restore, check the location, redo once, and
  stop if it happens again.
- a fault does not compile. Restore and stop: all fourteen were rehearsed at `wbs-fe-01:typecheck`
  exit 0.
- `src/test-tiers.test.ts` fails on the tier partition. That means a file this packet put in the
  DOM-free list names a browser global **somewhere in its text, comments included** — section 3.4 —
  and the fix is the wording, never the list.
- the sandbox unit command's count moves in slice 3 or 4, where every new file is in the jsdom tier.
- `bunx eslint` reports an error this packet does not name and `--fix` does not remove.
- any command wants the network, or any file outside section 5 needs changing.
- the five preferences call sites (`src/lib/theme.ts`, `src/lib/remembered.ts`,
  `src/components/wbs/gantt-detail.ts`, `src/components/wbs/project-page.tsx`,
  `src/components/wbs/project-settings-modal.tsx`) need an edit. They are the oracle; an edit there is
  this packet exceeding its scope.

## 11. What this packet leaves, in dependency order

1. **050-7-c, the application context.** The rest of packet a's tasks 3 and 4: one context exposing
   `RememberedPreferences` from the runtime's services, the five call sites moved off
   `modules/preferences/composition`, and that file deleted with the staged duplicate. It is the packet
   that makes section 3.3 history.
2. **050-7-d, page hide, hot reload and restoration.** Task 5, map tests 2 and 3. It supplies the
   production **trigger** for a retirement, which is what gives the fatal page a Chromium case driven
   by the page itself rather than by a probe.
3. **050-7-e and 050-7-f**, the project prerequisites (tasks 8 and 9); **050-7-g**, the session runtime
   (task 6); **050-7-h**, the project runtime (tasks 10 and 11); **050-7-i**, Log out (task 7).
4. **050-7-j, the boundary checks and the module indexes** (tasks 12 and 13), which is where
   `module.frontend.preferences` gets its `<!-- module-index … -->` block and its `docs/wiki-policy`
   registration, both together — section 3.5.

## 12. Assumptions recorded rather than asked

- **The browser store is a host requirement.** Without one external requirement the module's label can
  never reach a failure message (section 3.1), and the map already calls the browser store the
  application runtime's infrastructure.
- **Revocation is the module's disposal.** `Preferences` owns nothing else that can be given back, and
  a disposer that did nothing would be a check no mutation could break. The reader-visible consequence
  is deliberate: a preference written after its runtime was retired throws.
- **Delivery keeps its module-load import in this packet**, because moving it means a React context and
  2,944 jsdom assertions the executor cannot run. The duplicate is stateless and proved so.
- **`preferences` stays a public export** for `src/lib/remembered.ts`, recorded as K2 debt on
  `PreferencesExports` rather than hidden behind an invented facade.
- **Every installation failure is wrapped in `PartialAcquisitionError`**, including one that acquired
  nothing: a `resolve` that throws cannot say what was acquired first, and closing an empty graph runs
  no disposer.
- **The bootstrap takes its dependencies as one object with production defaults**, as
  `apps/wbs/be-01/src/boot.ts:83` does. That is what lets a test refuse an installation through the
  production function instead of a copy of it.
- **`main.tsx` does not await.** It calls the bootstrap and does not handle the promise: the modelled
  failure is already the fatal page, and what is left is a defect in the bootstrap itself, where an
  unhandled rejection is louder than a handler nobody reads. Top-level `await` was not used, so no
  build-target question arises.

## 13. Disposition of what packet a's three review rounds asked for

The reviews of packet a are the best description of what this reviewer looks for. Each row is what they
found there and what this packet does about it.

| What the reviews insisted on                                                                       | Where it is here                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **An encapsulation proof must not build its own host** (040.6 review, carried into packet a §14)   | The seal is proved through the module's real host graph and through the production installer: `keeps its owned store out of a host graph`, `publishes its two public services and nothing else`, and N3/N6 break them. No fixture host is invented.               |
| **A check with no effective negative is deleted** (review 2 I6)                                    | Every check added here has a fault in section 8, and all fourteen were watched failing. Nothing was kept that no mutation could break; the revocation exists _because_ a no-op disposer could not be broken.                                                      |
| **The property must state its invariants, and its teeth must be shown** (review 2 I5, review 3 I5) | The model test gains one invariant with the production graph inside it, and section 8.4 shows both that N1 breaks it and that the **old** commands do not — the `graph: 'fake'` run passes.                                                                       |
| **Concurrency gets generated interleavings, not examples** (addendum 15 and 16)                    | The new ownership work is the owner's install and retire, and it is added to the existing model test as commands rather than as new hand-written cases. Seed and run count unchanged.                                                                             |
| **Mutations must compile, and never be a bare `throw`** (review 3 C3, §9's stop)                   | All fourteen at `wbs-fe-01:typecheck` exit 0; N11 moves a render instead of removing a branch; N2 keeps the condition and changes what it returns.                                                                                                                |
| **One mutation must not hide a second check**                                                      | N1, N2 and N7 are three faults with three distinguishable failure sets — that is why `refuses every access once the store has been given back` and `gives the store back when its host graph closes` exist. N9 and N12 fail two different assertions of one test. |
| **Say what the test cannot see** (review 3's "the model test's claim was too strong")              | Section 8.4 says the model test cannot tell N1 from N7; section 9 says the page's own document cannot reach the fatal path and why; section 3.3 says the duplicate is staged and what would remove it.                                                            |
| **A handover the workflow can produce, `verify.md` included** (review 2 Minor 9, review 3 I7)      | Every slice lists its paths with the count stated, `verify.md` in each.                                                                                                                                                                                           |
| **The patch block must not turn a failed `diff` into evidence** (dispatch review, blocking)        | Section 8 carries that block verbatim, `status=$?` inside the `else`.                                                                                                                                                                                             |
| **A hand-over slice that cites earlier attempts is dispatched with `--seed`** (addendum 17)        | Section 6's dispatch block shows slice 6 with one `--seed` per earlier attempt.                                                                                                                                                                                   |
| **Withdrawn claims must be withdrawn everywhere** (review 2 I9 / review 3 8)                       | Two corrections to inherited documents are stated as such: the module index is not this packet's (§3.5, against packet a §12) and the map's Preferences/K2 sentence is half right (§3.2), with the file and line that show it.                                    |

**A boundary check by symbol identity is not prescribed here, and that is deliberate** (addendum 18).
Nothing in this packet scans source text for a forbidden import: the two encapsulation claims are made
at **run time** over the values a host and an installer really hand out, which no spelling
(`ns['name']`, `import type * as x`, a re-exported alias) can bypass. The source-shape checks belong to
050-7-j, which is where the architecture rule over delivery's imports lives.
