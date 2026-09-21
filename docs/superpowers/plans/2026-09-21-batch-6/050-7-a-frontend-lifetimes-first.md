# 050.7a Three lifetimes on the WBS frontend: the page's own runtime, first

|                     |                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item           | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **first packet of several**                                                               |
| Size class          | M                                                                                                                                                                                    |
| Design it serves    | [Code organization design](../../specs/2026-09-19-code-organization-design.md): "Modules", "Module layout", the import matrix, rules F1 and F2, and the three-lifetimes table        |
| Reviewed source map | [050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md)                                                                                                  |
| Library research    | [DI Bag 0.4.0 React lifecycle guarantees](../../../research/2026-09-21-di-bag-0-4-lifecycle.md)                                                                                      |
| Execution contract  | [batch 1 README](../2026-09-19-batch-1/README.md): "Execution contract", "Rules for every executor", "Standard blocks every packet uses", "Hidden constraints every frontend packet" |
| Model of form       | [050.6 command services](../2026-09-21-batch-3/050-6-command-services.md)                                                                                                            |
| Planning head       | `40be90d3` (`origin/main`, the Burokrat rename merged)                                                                                                                               |
| Revision            | second, after review 1. Section 15 dispositions every finding.                                                                                                                       |

## 1. Goal and non-goals

**Goal.** Give fe-01 its first real lifetime owner, and make it the pattern every later 050.7 packet
copies. Three things land:

1. **`openspec/changes/adopt-frontend-lifetimes`**, covering the whole of 050.7's target shape — the
   three lifetimes, who owns each, the retirement rule, the superseded-transition rule and the fatal
   state — so that every later packet ticks a task instead of opening a change.
2. **One sealed, labelled DI Bag module** (`module.frontend.preferences`) whose browser store is
   private, installed by **one production installer** that hands delivery two named services, one
   bounded close and one strings-only diagnostic.
3. **One lifetime slot** — the runtime owner — with the repository's fail-closed transition: one
   transition at a time, a superseded replacement that never builds, and a retirement that rejects or
   outruns its bounded wait withdrawing the old services, **refusing the replacement**, and
   publishing the sanitized public failure report. DI Bag's own React recipe reports and continues;
   rule R5 refuses, so the owner is local source (see the research note).

**Non-goals**, each because it belongs to a later packet or to another change:

- No library version change. `di-bag` stays `0.4.0`; `package.json` and `bun.lock` are untouched.
- No backend, gateway or MCP work.
- No session runtime, no project runtime. This packet installs the **application** lifetime only.
- No React changes at all: no context, no provider, no `main.tsx` edit, no component edit. The
  fatal state is published as a slot state here and **rendered** by packet 050-7-b.
- No server-side sign-out, and no change to the local-exit behaviour of Log out.
- No new reader-visible behaviour. Everything a reader can see is unchanged, and the browser lane is
  what says so (section 10).
- No wiki module index for the preferences module: closing it needs a
  `docs/wiki-policy/modules.json` identity, which is out of this lane. Section 4.6 has the measured
  reason and the task that owns it.

## 2. Why the application lifetime and preferences go first, measured

The map's own ordering makes the project runtime **unbuildable today** (§"Required implementation
order"): `planFeedForReader` and `PlanWriterHost` still take React setters created inside
`usePlanRead`, and four extraction slices come before a project owner. The session runtime needs the
project catalog, which has no feature facade at all. So the first buildable lifetime is the
application one.

Of the application lifetime's four responsibilities in the map's table, three are **not extracted**:
the auth gateway is wired inside `app.tsx`, notices are a `useToasts()` instantiated twice, and the
stream connector is `lib/project-stream.ts`. Exactly one is extracted: preferences. Measured on
`40be90d3`:

| Candidate        | Files today                                                                  | What installing it costs                                                             |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Preferences**  | 6 sources in `apps/wbs/fe-01/src/modules/preferences`, 2 module-load exports | a `module.ts`, an installer, a slot holder, and a 6-line rewrite of `composition.ts` |
| Notices          | none; `useToasts()` in `project-page.tsx` and `wbs-table.tsx`                | extract a feature first, and decide which stack renders each message                 |
| Stream connector | `lib/project-stream.ts`, plus a second subscription path in saved plans      | own a repository whose subscriptions are project-scoped                              |
| Auth gateway     | `fetchMe` + `AuthForm` inside `app.tsx`                                      | extract a feature and change the signed-out gate                                     |

Preferences is also the only one whose delivery imports need **no change**: its two module-load
exports keep their names and their types, so the four delivery call sites (`lib/theme.ts:52`,
`components/wbs/gantt-detail.ts:39`, `components/wbs/project-page.tsx:94`,
`components/wbs/project-settings-modal.tsx:77`) and `lib/remembered.ts:1` are untouched and become
the regression oracle: they now read services resolved out of the page's DI Bag runtime, and slice
4's identity test is what proves it is the same graph and not a second one.

Its one wart is measured and recorded rather than hidden: `lib/remembered.ts` needs the **resource**
(`Preferences.json`/`.text`) because the layout module builds a store per project id, so the module
exports `preferences` as well as `rememberedPreferences`. That is preserved rule-K2 debt with one
caller, named in the module README and in task 12 of the change; the thing that must be unreachable —
and is — is the **repository**.

## 3. Read first

1. `AGENTS.md` (rules R1 to R5) and `LLM_README.md`.
2. The execution contract sections of the [batch 1 README](../2026-09-19-batch-1/README.md).
3. [The 050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md):
   "Authority and DI Bag facts", "Application owner", "Replacement and cleanup policy", and tests 1,
   4, 12 and 14 of "Exact lifecycle tests".
4. [DI Bag 0.4.0 React lifecycle guarantees](../../../research/2026-09-21-di-bag-0-4-lifecycle.md),
   "Durable implementation requirements" 1 to 5.
5. The design's "Modules", "Module layout" and "Frontend organization" sections.
6. `apps/wbs/fe-01/src/modules/preferences/` whole, and
   `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`.

## 4. Verified facts

Every claim below was read or run in a worktree off `40be90d3`. Line numbers are that tree's.

### 4.1 What DI Bag 0.4.0 actually prints

Probed with `bun` against the installed `node_modules/di-bag` (version `0.4.0`, pinned in
`tools/tool-devsync/src/toolchain-pins.test.ts:506`):

- `buildModule(keys, { label })` names each **private** binding `<label>/<key>` in
  `inspectGraph()`; a **public** export keeps its bare key. With the label removed, the private
  binding is listed as its bare key.
- resolving a private key by name from the host bag throws
  `DI_BAG_MISSING_REGISTRATION: Service "store" is not registered.` — no label in that message.
- a **private** binding with an unmet dependency throws, naming the label:
  `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "frontend.preferences/preferenceStore": dependency "absentStore" is not registered. Resolution path: preferences -> frontend.preferences/preferenceStore -> absentStore.`
  The same break on a **public** binding names only `"preferences"`. So does a cycle:
  `DI_BAG_CYCLE: cycle: preferences -> frontend.preferences/preferenceStore -> preferences` — which
  is the fault N6 uses, because it is type-correct where the unmet-dependency fault is not.
- a rejecting disposer makes `close()` reject with `DiBagCleanupError`:
  `DI_BAG_CLEANUP_FAILED: Failed to run 1 disposal callback(s);`
- a never-settling disposer under `close({ timeoutMs: 50 })` rejects with
  `DiBagCloseCancelledError`: `DI_BAG_CLOSE_TIMEOUT: Bag close timed out after 50ms; disposers still running: r;`
  whose `details` is `{"operation":"close","reason":"timeout","timeoutMs":50,"pending":["r"],"acquiring":[]}`
  and whose `cleanupPromise` is the shared shutdown the owner must keep observing. A disposer that
  settles **after** that rejection resolves that promise; one that rejects late rejects it with
  `DiBagCleanupError`. Both are exercised.
- `build()` and `resolve()` are **synchronous** for sync factories, so the browser graph needs no
  `await`. `apps/wbs/be-01/src/boot.ts:90` awaits only because that graph has async work.

### 4.2 The frontend as it stands

- `apps/wbs/fe-01/src/modules/` holds six module directories and **no `module.ts`**: composition is
  `composition.ts` files (`preferences`, `directory-management`, `plan-feed`, `calendar-markers`).
  `apps/wbs/fe-01/src/modules/preferences/README.md:44` says so in as many words — "There is no
  `module.ts` yet: DI Bag is not installed" — and slice 4 is what makes that sentence false, so it
  rewrites it.
- `di-bag` is imported today from `apps/wbs/be-01/src/boot.ts:4` and from the fe-01 browser probes
  `apps/wbs/fe-01/e2e/browser-packages-probe.ts:3`. **`di-bag` and not `di-bag/node`**:
  `apps/wbs/fe-01/browser-packages.test.ts:48` and `e2e/browser-packages.spec.ts:50` both carry
  observed proofs that the node entrypoint breaks the browser bundle.
- `apps/wbs/fe-01/src/modules/preferences/composition.ts` is 18 lines and builds two module-load
  constants; `browser-storage.repository.ts:20` reaches the browser store **per call**, with a
  recorded proof that capturing it at module load fails collection. That is what lets a DOM-free
  tier install this module at all.
- `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts` exports `discloseFault(thrown)` and
  `DisclosedFault`: the sanitized public sentence, the occurrence handle and what was lost. It
  imports `@shared/failures` and **no React**, so the lifetime owner may reuse it, and the map's
  requirement that the lifecycle-failure boundary use "the same sanitized public/diagnostic
  reporting … as the root fault path" is met by calling it rather than by a second policy.
- `apps/wbs/fe-01/vitest.node-suites.ts` is the DOM-free tier's `include` list and
  `apps/wbs/fe-01/src/test-tiers.test.ts` refuses any disagreement between that list and the
  evidence in the files. Its `DOM_EVIDENCE` regex (`src/test-tiers.test.ts:66`) is deliberately
  generous: a test file that merely writes the words `document`, `window`, `location` or
  `localStorage` is read as needing a browser. **All three new test files avoid those words** and
  belong in the node tier.

### 4.3 How the node tier selects files, and why a red must register its suite first

`apps/wbs/fe-01/vitest.node.config.ts` sets `include: [...NODE_SUITES]`. A path passed on the
command line is a **filter applied after** that include list, not an override: with the file absent
from `NODE_SUITES`, `bunx vitest run --config vitest.node.config.ts src/runtime/lifetime-slot.test.ts`
prints `No test files found, exiting with code 1` and lists the include set. Observed. Therefore
every slice below **adds its suite entry in the same step as the test file**, before any red run, and
adds only its own entry — a list naming a file that does not exist makes the tier collect nothing and
fails `test-tiers.test.ts` besides.

For the same reason a red here is never a missing-module collection error: each slice writes the test,
its suite entry, **and a skeleton of the unit under test whose body throws**, so the red selects every
test it is about and fails on one named message. The skeletons are in sections 8.5, 8.9 and 8.12 and
are replaced inside their own slice, before anything is committed.

### 4.4 Targets, tiers and the sandbox

- `apps/wbs/fe-01/project.json` has `test` (two vitest runs, jsdom then zoned), `test:unit` (the
  node tier), `lint`, `lint:fast`, `typecheck`, `build`, `e2e`, `e2e-packaged`. fe-01 has **no**
  `lint:source`; only the Burokrat project does.
- **The executor never runs `wbs-fe-01:test:unit` or `wbs-fe-01:test` through Nx**: three of their
  tests spawn `bun` from Node and the sandbox refuses with `spawnSync bun EPERM`. It runs the
  sandbox unit command in step 0 instead.
- **`bun test <dir>` is a filter, not a path.** From the repository root it also collects the
  compiled copies a typecheck leaves under `dist/out-tsc/<dir>`, which is how a green baseline turns
  red in a clone where an earlier slice ran `typecheck`. This packet prescribes **no** `bun test`
  command. Its vitest commands were re-rehearsed **after** running `wbs-fe-01:typecheck` in the same
  worktree, with `dist/out-tsc/apps/wbs/fe-01/*.test.js` present on disk: the node tier still
  selected exactly the same files and tests, because `include` is the explicit `NODE_SUITES` list and
  `dist` is outside it.
- The whole jsdom tier, the zoned tier, `wbs-fe-01:build`, `tool-devsync:test`,
  `twilight-burokrat:test`, `twib check` and every Chromium run are **planner-only**, with the
  planner's observed values in section 10.

### 4.5 The rehearsal, and its numbers

The whole of sections 8 and 9 was executed on `40be90d3` before this packet was revised.

| What                                                                | Observed                                                                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Sandbox unit command, before any change                             | `42 passed (42)` files, `614 passed (614)` tests, exit 0                                            |
| Sandbox unit command, after all five slices                         | `45 passed (45)` files, `636 passed (636)` tests, exit 0                                            |
| The three new suites together                                       | `3 passed (3)` files, `22 passed (22)` tests                                                        |
| `wbs-fe-01:typecheck`                                               | exit 0, before and after, and for both mutations N4 and N6                                          |
| `wbs-fe-01:lint`                                                    | exit 0, after `bunx eslint --fix` sorted three import blocks                                        |
| Whole jsdom tier                                                    | exit 0, `124 passed (124)` files, `2918 passed (2918)` tests (rerun after the revision: section 10) |
| `tool-devsync:test`                                                 | exit 0, `366 pass`, `0 fail` — no inventory or digest pin moved                                     |
| `twilight-burokrat:test`, alone on the host                         | exit 0, `764 pass`, `0 fail`, 19m                                                                   |
| `twib check --rule MOD-LAYOUT` and `--rule MOD-INDEX`               | `allowed: true` both; six identical `debt` rows, unchanged by this packet (section 4.6)             |
| `openspec validate --all --json`                                    | exit 0, `113` items, `113` passed, `0` failed; this change `valid: true`, no issues                 |
| Chromium, `CI=1 E2E_PORT_SHIFT=2400`, three preference-driven specs | exit 0, `21 passed (1.2m)`                                                                          |
| Five real `git commit`s with lefthook on                            | exit 0 each; `tool-wiki`, `plaintext-secrets`, `format`, `lint` all ✔                               |

Absolute numbers are orientation only: every expectation in section 7 is relative to the baseline
that slice records itself.

### 4.6 The wiki module index, measured

The Burokrat index checker refuses an undeclared file — `unindexed candidate path in <README>: <file>`,
`apps/wiki/cli/src/indexes/check-indexes.ts:146` — but only inside a directory whose `README.md`
carries a `<!-- module-index … -->` comment. Eight READMEs do (`apps/wiki/cli`, `apps/wiki/consumer`,
`libs/wbs/domain/domain/src/saved-plan`, `libs/wbs/application/core/src/use-cases`,
`libs/wbs/adapters/store-memory/src`, `tools/tool-dagger/src/lib`, `docs/findings`,
`docs/refactoring/w4-4`) and **none is under `apps/wbs/fe-01`**.

Rehearsed on the staged tree, with a rule policy held outside the candidate and every registry rule
in `observe`:

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=<a node_modules outside the clone> \
  bun apps/wiki/cli/src/cli.ts check staged . HEAD <rule-policy>.json --rule MOD-LAYOUT
```

- **MOD-LAYOUT**: exit 0, `allowed: true`, six findings — one per frontend module, each
  `{"path":"apps/wbs/fe-01/src/modules/<name>","message":"module directory declares no wiki index","effect":"debt"}`.
  Adding `module.ts` changed no row and no verdict; the `contract.ts` half of the rule is satisfied.
- **MOD-INDEX**: exit 0, `allowed: true`, `findings: []`.

The rule policy needs a mode for **every** registry rule or it refuses: `F1`, `F7`, `INV-CLASSIFY`,
`K2` to `K6`, `MOD-DIRECT-ENTRIES`, `MOD-INDEX`, `MOD-LAYOUT`, `REL-EXTRACT`.

**Why this packet does not close that debt.** An index block is one half of a module identity; the
other half is a row in `docs/wiki-policy/modules.json`, whose `mappingId` is
`modules.radical-modularity-pilot.v1` and whose `sourceRevision` is a pinned commit, with
`memberships`, `indexPath` and `externalConsumers` per module. Declaring fe-01 a pilot boundary also
imports rules that **cannot be evaluated over this application at all**: `K2` to `K6` and `F1`
return `TypeScript import unresolved: apps/wbs/fe-01/src/main.tsx -> './styles.css'`
(`apps/wiki/cli/src/relationships/typescript.ts:349`), measured by packet 050.6 §4.5, which decided
in as many words not to add the comment for that reason. This packet keeps that decision, adds the
sixth `debt` row's subject without changing the row, and makes the closure explicit work in task 12
of the change. It is not a waiver by silence: it is the same accepted debt six modules already carry,
with the exact two artifacts that would close it named.

### 4.7 Which whole-suite pins this packet moves: none

`tool-devsync:test` passed with all new files committed. This packet adds no project, no target and
no CI path, so `apps/wiki/cli/src/policy/pilot-policy.test.ts` (which reads the repository at `HEAD`
through git) has nothing to disagree with. `docs/code-organization/kinds.json` gets no entry:
`tools/tool-devsync/src/service-kinds.ts:14` limits `SERVICE_ROOTS` to three backend and library
directories, and these files are outside all three.

Do not read the `tool-wiki` pre-commit tick as a wiki check: `bin/tool-wiki-lint.sh:14` prints
`{"schemaVersion":1,"status":"inactive",…}` and exits 0 when `TOOL_WIKI_ACTIVATION_ROOT` names
nothing, which is the sandbox's and the planner's state. Its ✔ means the launcher refused nothing.

## 5. The shape

Four new source files, one new module file and three edits. In dependency order:

- `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` — `RetirableRuntime<S>`, `LifetimeState<S>`,
  `LateCleanup`, `TransitionSupersededError`, `LifetimeSlot<S>`, `createLifetimeSlot<S>(budgetMs?)`,
  `RETIREMENT_BUDGET_MS`. Plain TypeScript, a store in the sense of rule F2, no React. Its interface
  members are **readonly function-valued properties**, not methods.
- `apps/wbs/fe-01/src/modules/preferences/module.ts` — the sealed module and `PREFERENCES_LABEL`.
- `apps/wbs/fe-01/src/runtime/application-runtime.ts` — `ApplicationServices`, `ApplicationRuntime`,
  `buildApplicationRuntime()`. **No module-load side effect**, so a test of the installer runs
  nothing but the installer.
- `apps/wbs/fe-01/src/runtime/application-lifetime.ts` — the page's `applicationLifetime` slot and
  the `applicationServices` it opens at module load.
- `apps/wbs/fe-01/src/modules/preferences/composition.ts` — the same two exported names, now read
  out of `applicationServices`.
- `apps/wbs/fe-01/src/modules/preferences/README.md` — two stale passages.
- `apps/wbs/fe-01/vitest.node-suites.ts` — one entry per new test file, one per slice.

**Identifiers.** The wiki module identifier is `module.frontend.preferences`; the DI Bag label drops
the `module.` prefix and is `frontend.preferences`, as the batch note fixes. The label is a constant,
`PREFERENCES_LABEL`, because a test asserts the exact string a failure prints.

## 6. File plan

| Path                                                                               | Slice | Create or modify | Note                                                     |
| ---------------------------------------------------------------------------------- | ----- | ---------------- | -------------------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/.openspec.yaml`                         | 1     | created by CLI   | written by `openspec new change`, never by hand          |
| `openspec/changes/adopt-frontend-lifetimes/proposal.md`                            | 1     | create           | 393 words, section 8.1                                   |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` | 1     | create           | **six** requirements, each with a normative SHALL        |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                               | 1     | create           | 13 tasks; this packet ticks 1, 2 and 3                   |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                              | 1–5   | create, append   | every slice appends its own observations                 |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`                                      | 2     | create           | 280 lines                                                |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts`                                 | 2     | create           | 329 lines, 14 tests                                      |
| `apps/wbs/fe-01/vitest.node-suites.ts`                                             | 2,3,4 | modify           | one entry per slice, never two at once                   |
| `apps/wbs/fe-01/src/modules/preferences/module.ts`                                 | 3     | create           | 49 lines                                                 |
| `apps/wbs/fe-01/src/runtime/application-runtime.ts`                                | 3     | create           | 62 lines                                                 |
| `apps/wbs/fe-01/src/runtime/application-runtime.test.ts`                           | 3     | create           | 75 lines, 6 tests                                        |
| `apps/wbs/fe-01/src/runtime/application-lifetime.ts`                               | 4     | create           | 29 lines                                                 |
| `apps/wbs/fe-01/src/runtime/application-lifetime.test.ts`                          | 4     | create           | 24 lines, 2 tests                                        |
| `apps/wbs/fe-01/src/modules/preferences/composition.ts`                            | 4     | modify           | 6 lines replaced by 6                                    |
| `apps/wbs/fe-01/src/modules/preferences/README.md`                                 | 4     | modify           | the "no `module.ts` yet" sentence and the Checks section |

**Fifteen paths.** Nothing else — in particular no file under `apps/wbs/fe-01/src/components/`, no
`main.tsx`, no `app.tsx`, no `package.json`, no `bun.lock`, no `docs/wiki-policy/`.

## 7. Slices

Five slices. Each is one attempt, ends in one planner commit with the exact subject given, and begins
with its own step 0.

**Dispatch.** The launcher is `/home/df/wd/puni/puni-plan/exec/run-executor.sh` and is not reachable
from inside the sandbox; the planner runs it:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-7-a-frontend-lifetimes-first <slice> <base> \
  --batch batch-6 --preserve evidence
```

`--batch batch-6` is enough for the directory: the launcher's `case` already defaults batch 6 to
`docs/superpowers/plans/2026-09-21-batch-6`. **No `--network`** is needed by any slice: nothing here
listens, dials or downloads, and the OpenSpec command is warmed by the launcher before the attempt
starts. `--preserve evidence` keeps each attempt's evidence directory; slice 5 is dispatched with
`--seed <the kept evidence directory of slices 1 to 4>` for each earlier slice, which the launcher
merges into `$TMPDIR/evidence`.

**Evidence.** Every log this packet asks for is written under `$TMPDIR/evidence` with a slice-specific
name (`slice2-red.log`, `slice2-green.log`, `slice2-N1.log`, …), because that directory is what the
launcher preserves. `verify.md` references those **basenames** and never an absolute clone, home or
temporary path: it is published.

### Step 0 — at the start of every slice

- [ ] Record the head and the working tree:

  ```sh
  git rev-parse HEAD; git status --short --untracked-files=all
  ```

- [ ] Record the **sandbox unit command** baseline. Call its two numbers **F0** and **T0** for this
      slice; every expectation below is relative to them:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts) \
    > "$TMPDIR/evidence/slice<N>-step0-unit.log" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0. **Never** run `wbs-fe-01:test:unit` or `wbs-fe-01:test`: three of their tests
  spawn `bun` from Node and the sandbox refuses that with `spawnSync bun EPERM`.

- [ ] Record the OpenSpec baseline, in slices 1 and 5 only:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
    > "$TMPDIR/evidence/slice<N>-step0-openspec.json" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0. Record `summary.totals.items` as **V0**.

### Slice 1 — the change, opened by the tool

Subject: `feat(fe-01): open the frontend lifetimes change`

Pre-edit check: `openspec/changes/adopt-frontend-lifetimes/` does not exist. If it does, stop and
read what is in it before writing anything.

- [ ] Create the change **with the CLI**, never by hand:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change adopt-frontend-lifetimes \
    --schema sdd-lean > "$TMPDIR/evidence/slice1-openspec-new.log" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0, `Created change 'adopt-frontend-lifetimes' at openspec/changes/adopt-frontend-lifetimes/`,
  and exactly one file created: `.openspec.yaml`, holding `schema: sdd-lean` and a `created:` date.

- [ ] Write `proposal.md`, `specs/adopt-frontend-lifetimes/spec.md` and `tasks.md` **exactly** as
      sections 8.1, 8.2 and 8.3 give them, then `verify.md` with a `## Slice 1` heading.

- [ ] Validate, and require one more valid item than the baseline:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
    > "$TMPDIR/evidence/slice1-openspec-after.json" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0; `summary.totals.failed` is `0`; `summary.totals.items` is **V0 + 1**; and the
  entry whose `id` is `adopt-frontend-lifetimes` has `"valid": true` and `"issues": []`. Read those
  fields out of the JSON — an exit code alone does not say the new change was seen.

- [ ] Format: `GSETTINGS_BACKEND=memory bunx prettier --check openspec/changes/adopt-frontend-lifetimes`
      (`--write` first if it refuses; exit 0 afterwards).

Hand over, five paths:

```text
?? openspec/changes/adopt-frontend-lifetimes/.openspec.yaml
?? openspec/changes/adopt-frontend-lifetimes/proposal.md
?? openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
?? openspec/changes/adopt-frontend-lifetimes/tasks.md
?? openspec/changes/adopt-frontend-lifetimes/verify.md
```

`F0`/`T0` must be unchanged by this slice.

### Slice 2 — the lifetime slot and its fail-closed gate

Subject: `feat(fe-01): own one lifetime with a fail-closed retirement gate`

Pre-edit check: `apps/wbs/fe-01/src/runtime/` does not exist, and
`openspec/changes/adopt-frontend-lifetimes/proposal.md` does — if the second is missing, this slice
was dispatched on the wrong base.

- [ ] Write, in one step and before any run: `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts`
      exactly as section 8.4; the **skeleton** `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` exactly
      as section 8.5; and **one** entry in `apps/wbs/fe-01/vitest.node-suites.ts`, in the list's
      sorted position between `src/modules/preferences/preferences.resource.test.ts` and
      `src/test-tiers.test.ts`, with the comment section 8.8 gives:

  ```ts
  'src/runtime/lifetime-slot.test.ts',
  ```

- [ ] Run the red and record it:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
    src/runtime/lifetime-slot.test.ts) > "$TMPDIR/evidence/slice2-red.log" 2>&1; echo "exit=$?"
  ```

  Expected, observed by the planner: exit 1, `Test Files 1 failed (1)`, **`Tests 14 failed (14)`**,
  every one of them on `Error: the lifetime slot is not implemented (budget 5000ms)`. A run that says
  `No test files found` means the suite entry is missing; a run that says `Tests no tests` means the
  skeleton is missing. Either is a stop, not a red.

- [ ] Replace the skeleton's body with the implementation of section 8.6, keeping the
      `eslint-disable-next-line @typescript-eslint/only-throw-error` and the comment above it that
      names the boundary. Without that comment `lint` refuses it: rethrowing a caught `unknown` is
      `Expected an error object to be thrown`.

- [ ] Green, twice — the file alone, then the whole tier:

  Expected for the file: exit 0, `Test Files 1 passed (1)`, `Tests 14 passed (14)`. Then the sandbox
  unit command: exit 0, **F0 + 1** files and **T0 + 14** tests.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0. Required in this slice: it declares
      a generic interface whose members are function-valued properties, which is the shape batch 1's
      variance break had.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0. An import-order or Prettier complaint is
      autofixable: `bunx eslint --fix <the two files>` and rerun, which is what the planner did
      (`simple-import-sort/imports`).

- [ ] Run this slice's negatives — **N1, N2, N3, N7, N8, N9, N10, N11, N12, N13 and N14** of section
      9 — each alone, restoring between them, and append every observed diagnostic to `verify.md`.

- [ ] Add each fault's adjacent dated `Proof:` comment to `lifetime-slot.ts`, as section 9 says.

Hand over, three paths:

```text
?? apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts
?? apps/wbs/fe-01/src/runtime/lifetime-slot.ts
 M apps/wbs/fe-01/vitest.node-suites.ts
 M openspec/changes/adopt-frontend-lifetimes/verify.md
```

### Slice 3 — the sealed module and the page's installer

Subject: `feat(fe-01): seal the preferences module behind the page installer`

Pre-edit check: `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` exists (slice 2 landed) and
`apps/wbs/fe-01/src/modules/preferences/module.ts` does not.

- [ ] Write, in one step and before any run: `apps/wbs/fe-01/src/runtime/application-runtime.test.ts`
      exactly as section 8.10; `apps/wbs/fe-01/src/modules/preferences/module.ts` exactly as section
      8.7; the **skeleton** `apps/wbs/fe-01/src/runtime/application-runtime.ts` exactly as section
      8.9; and one entry in `vitest.node-suites.ts`, immediately before slice 2's:

  ```ts
  'src/runtime/application-runtime.test.ts',
  ```

- [ ] Run the red:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
    src/runtime/application-runtime.test.ts) > "$TMPDIR/evidence/slice3-red.log" 2>&1; echo "exit=$?"
  ```

  Expected, observed: exit 1, `Test Files 1 failed (1)`, **`Tests 6 failed (6)`**, every one on
  `Error: the application runtime installs no module yet`.

- [ ] Replace the skeleton's body with section 8.11's `buildApplicationRuntime`. Green: exit 0,
      `Tests 6 passed (6)`; then the sandbox unit command at **F0 + 1** and **T0 + 6**.

- [ ] `wbs-fe-01:typecheck` and `wbs-fe-01:lint` — exit 0 each.

- [ ] Run this slice's negatives — **N4, N5 and N6** — each alone, restoring between them, and append
      the observed diagnostics to `verify.md`. N4 and N6 are type-correct: run `typecheck` under each
      and record exit 0, which is what says the mutation is a real leak and not a compiler error.

- [ ] Add the `Proof:` comments for N4, N5 and N6 to `application-runtime.ts` and `module.ts`.

Hand over, four paths plus `verify.md`:

```text
?? apps/wbs/fe-01/src/modules/preferences/module.ts
?? apps/wbs/fe-01/src/runtime/application-runtime.test.ts
?? apps/wbs/fe-01/src/runtime/application-runtime.ts
 M apps/wbs/fe-01/vitest.node-suites.ts
 M openspec/changes/adopt-frontend-lifetimes/verify.md
```

### Slice 4 — the page's own lifetime, and the seam delivery already uses

Subject: `feat(fe-01): open the page's application lifetime at load`

Pre-edit check: `apps/wbs/fe-01/src/runtime/application-runtime.ts` exists and exports
`buildApplicationRuntime`; `apps/wbs/fe-01/src/modules/preferences/composition.ts` still exports
`browserPreferences` and `apps/wbs/fe-01/src/lib/remembered.ts` still imports it. If a neighbour has
moved that seam, stop.

- [ ] Write, in one step and before any run: `apps/wbs/fe-01/src/runtime/application-lifetime.test.ts`
      exactly as section 8.13; the **skeleton** `apps/wbs/fe-01/src/runtime/application-lifetime.ts`
      exactly as section 8.12; and one entry in `vitest.node-suites.ts`, immediately before slice 3's:

  ```ts
  'src/runtime/application-lifetime.test.ts',
  ```

- [ ] Run the red:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts \
    src/runtime/application-lifetime.test.ts) > "$TMPDIR/evidence/slice4-red.log" 2>&1; echo "exit=$?"
  ```

  Expected, observed: exit 1, **`Tests 2 failed (2)`** —
  `is live as soon as it is imported, above every component` on
  `AssertionError: expected 'empty' to be 'live'`, and
  `is the one graph delivery reads its preferences out of` on
  `AssertionError: expected { …(5) } to be { …(5) }`. Those are the two facts this slice installs:
  the slot does not hold the page's runtime yet, and delivery is still building its own.

- [ ] Replace the skeleton with section 8.14, and replace the body of
      `apps/wbs/fe-01/src/modules/preferences/composition.ts` with section 8.15. The two exported
      names and their types do not change; where the values come from does. Touch no importer.

- [ ] Green: exit 0, `Tests 2 passed (2)`; then the sandbox unit command at **F0 + 1** and **T0 + 2**.

- [ ] Rewrite the two stale passages of `apps/wbs/fe-01/src/modules/preferences/README.md` — the
      "Relationships" paragraph that says there is no `module.ts`, and the "Checks" paragraph — as
      section 8.16 gives them. A module whose README describes composition it no longer has is a
      rule-R3 failure, not a tidying matter.

- [ ] `wbs-fe-01:typecheck` and `wbs-fe-01:lint` — exit 0 each. Required here: this is where
      `composition.ts` stops constructing its own values and starts reading them out of a graph.

- [ ] Run this slice's negative — **N15** — and append its diagnostic to `verify.md`, with its
      `Proof:` comment in `composition.ts`.

Hand over, five paths plus `verify.md`:

```text
 M apps/wbs/fe-01/src/modules/preferences/README.md
 M apps/wbs/fe-01/src/modules/preferences/composition.ts
?? apps/wbs/fe-01/src/runtime/application-lifetime.test.ts
?? apps/wbs/fe-01/src/runtime/application-lifetime.ts
 M apps/wbs/fe-01/vitest.node-suites.ts
 M openspec/changes/adopt-frontend-lifetimes/verify.md
```

### Slice 5 — tick the change and hand over

Subject: `docs(fe-01): record the first three lifetime tasks as done`

Dispatched with `--seed` for each earlier slice's preserved evidence directory, so the four earlier
attempts' logs are under `$TMPDIR/evidence`.

- [ ] Tick tasks 1, 2 and 3 in `openspec/changes/adopt-frontend-lifetimes/tasks.md` — `- [x]` — and
      nothing else. Tasks 4 to 13 stay open and are the next packets' (section 12).

- [ ] Append a `## Slice 5` section to `verify.md` holding the failure-proof table of section 9 with
      **the diagnostics the earlier attempts observed**, each row naming the attempt and the evidence
      basename it came from. A check with no observed failure is not done. Do not claim any proof ran
      in this slice: slices 2, 3 and 4 ran them.

- [ ] Re-validate. Expected: exit 0, `failed: 0`, `adopt-frontend-lifetimes` still `valid: true`, and
      `summary.totals.items` equal to **this slice's own V0** — ticking a checkbox adds no item.

- [ ] `GSETTINGS_BACKEND=memory bunx prettier --check` over every path this packet owns; then
      `wbs-fe-01:lint` and `wbs-fe-01:typecheck` once more, both exit 0.

- [ ] Print the cumulative diff for review, **scoped to the paths this packet owns**, so a revised
      packet file committed by the planner cannot change the answer:

  ```sh
  git diff --name-only <slice-1 base> -- apps/wbs/fe-01 openspec/changes/adopt-frontend-lifetimes
  ```

  Expected: the fifteen paths of section 6, and nothing else.

Hand over: ` M openspec/changes/adopt-frontend-lifetimes/tasks.md` and
` M openspec/changes/adopt-frontend-lifetimes/verify.md`.

## 8. The code, rehearsed

Every listing is the post-Prettier text of a file that was written, run, type-checked, linted and
committed in the planner's worktree. Copy them exactly.

### 8.1 `openspec/changes/adopt-frontend-lifetimes/proposal.md`

```markdown
# Three lifetimes for the WBS frontend

## Problem

fe-01 has no lifetime ownership. Preferences are built when their module loads,
the directory management service is built inside a hook, and the plan feed,
writer and marker services are created and closed by effects under
`WbsTable`. Nothing owns the page, the signed-in identity or the open project,
so a replacement can overlap its predecessor: a project switch closes the old
feed from one effect while another publishes the new one, and a cleanup that
fails or hangs is invisible. The accepted design fixes three runtimes -
application, session, project - and this change installs them.

## Outcome

Each of the three lifetimes is one DI Bag runtime, built outside React by a
composition root, publishing narrow service contracts and nothing else. One
host owner holds the current runtime of each lifetime. Every close trigger for
one runtime joins one retirement, withdrawal happens before disposal starts,
and project retirement precedes session retirement, which precedes the
application's.

Required retirement gates replacement. A cleanup failure or an expired bounded
wait withdraws the old services, refuses the replacement, and shows the
sanitized public failure report the root fault path already discloses -
sentence, occurrence handle and what was lost - while the still-running
disposal stays observed. DI Bag's own React recipe reports and continues; rule
R5 refuses, so this repository implements its own owner.

Delivery keeps every behaviour it has: the stale-reader predicate, clearing the
feed reference before closing it, one socket per project, the remembered
selection, and the router instance that survives a session update.

## Non-goals

- No library version changes. `di-bag` stays at 0.4.0.
- No backend, gateway or MCP work.
- No server-side sign-out. The existing Log out stays a local exit that sends no
  request, so a reload can still restore the identity.
- No new reader-visible behaviour except the fatal state above.
- No credential rotation for one identity. No such event exists today.

## Constraints

- Feature, resource, store and geometry services import no React (rule F1).
- Contexts carry readonly service contracts, never a bag, a token, a broad HTTP
  client, a repository or a resource (rule K2).
- Module identifiers are `module.frontend.<name>`; DI Bag labels drop that
  prefix.
- Runtimes are built at module load or in an effect, never in render, `useMemo`
  or a lazy state initialiser.
```

### 8.2 `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md`

Six requirements. Validated as given: `valid: true`, no issues. Every `### Requirement:` carries a
normative SHALL sentence directly under it, and every scenario uses four hashtags with real WHEN and
THEN bullets.

```markdown
## ADDED Requirements

### Requirement: Three runtimes own the frontend's services

fe-01 SHALL build one DI Bag runtime per accepted lifetime - application for the
page, session for one signed-in user identity, project for one open project -
outside the React tree, and SHALL publish to delivery only the narrow service
contracts each lifetime exports. A bag, a browser store, a credential, a broad
HTTP client, a repository port and a resource-service SHALL NOT be reachable
from delivery.

#### Scenario: The page's own runtime is built once, above the components

- **WHEN** the application runtime is built
- **THEN** it is built outside the Strict Mode subtree, acquires each owned
  service once, and exposes only its public service contracts

#### Scenario: A module's private bindings stay inside it

- **WHEN** the production installer returns the services of an installed module
- **THEN** the module's private bindings are absent from that surface, and a DI
  failure names them by the module's label

#### Scenario: The session runtime is keyed by identity

- **WHEN** a signed-in identity arrives from either startup identity restoration
  or a password login
- **THEN** the session runtime is keyed by the user id and the credential is
  only an adapter input

#### Scenario: The project runtime is keyed by the selected project

- **WHEN** a project is selected
- **THEN** a project runtime is created for that project id inside the current
  session, and its feed, writer, command and saved-plan services are published
  only while it is current

### Requirement: One retirement per runtime, ordered by lifetime

Every close trigger for one current runtime - route unmount, selection change,
identity change, local exit, page hide and hot-reload disposal - SHALL join one
retirement of that runtime. Publication SHALL be withdrawn before disposal
starts. A project's retirement SHALL begin before its session's, and the
application's SHALL begin only after both have been started and joined.

#### Scenario: Two triggers retire one runtime once

- **WHEN** two triggers ask to retire the same current runtime
- **THEN** its disposal runs once and both callers observe the same outcome

#### Scenario: Withdrawal precedes disposal

- **WHEN** a runtime is retired
- **THEN** delivery can no longer read its services before its first disposer
  runs, and a completion that arrives late changes nothing a reader sees

### Requirement: A failed or expired retirement refuses the replacement

When a required retirement rejects, or its bounded wait expires, the runtime
owner SHALL refuse the transition: it SHALL NOT build or publish the
replacement, SHALL NOT republish the withdrawn services, and SHALL publish a
fatal state carrying only the sanitized public failure report and its occurrence
handle. The owner SHALL keep observing the disposal that is still running, and
its eventual completion SHALL NOT publish the refused replacement.

#### Scenario: A disposer rejects during a replacement

- **WHEN** one disposer of the current runtime rejects while a replacement is
  requested
- **THEN** every other disposer is still attempted, the replacement is never
  built, and the fatal state carries the sanitized report and occurrence handle

#### Scenario: A disposal outruns the bounded wait

- **WHEN** a disposer has not settled when the retirement's bounded wait expires
- **THEN** the transition fails, the replacement is never built, and the owner
  still holds the shared disposal promise

#### Scenario: Late completion does not resume a refused transition

- **WHEN** the disposal behind an expired wait later settles
- **THEN** the refused replacement stays unpublished and the fatal state stays
  visible

#### Scenario: A further transition on a refused lifetime is refused

- **WHEN** a lifetime whose retirement failed is asked to transition again
- **THEN** it refuses with the same failure rather than starting over

### Requirement: A superseded or unbuildable transition acquires nothing

Transitions of one lifetime SHALL run one at a time, in request order. A request
for a replacement that a newer request has overtaken SHALL NOT build a runtime
and SHALL be refused as superseded, while a retirement request SHALL join the
transition that overtook it. When a replacement's construction fails after its
retirement succeeded, the owner SHALL publish the sanitized fatal state, hold no
runtime, and remain able to build again — unlike a failed retirement, which is
terminal.

#### Scenario: Two replacements are requested in one tick

- **WHEN** two replacements of the same lifetime are requested before either has
  run
- **THEN** exactly one runtime is live afterwards, the superseded request never
  built one, and every runtime that was built has been retired

#### Scenario: A retirement arrives with a replacement

- **WHEN** a retirement is requested while a replacement of the same runtime is
  pending
- **THEN** the retirement joins that transition instead of refusing, and no
  runtime is left without an owner

#### Scenario: The replacement cannot be built

- **WHEN** a replacement's construction throws after the old runtime retired
  successfully
- **THEN** the sanitized fatal state is published, nothing is held, and a later
  transition may build again

### Requirement: Log out stays a local exit

The Log out action SHALL send no request to the server and SHALL retire the
project runtime, then the session runtime, before the signed-out state renders.
If either retirement fails, the signed-out state SHALL NOT render and the fatal
state SHALL be shown instead.

#### Scenario: Log out revokes nothing remotely

- **WHEN** Log out is activated
- **THEN** no logout request is sent, the project and session runtimes are
  retired in that order, and a reload can still restore the same identity

#### Scenario: Log out with a failing retirement

- **WHEN** a project or session disposer rejects during Log out
- **THEN** the signed-out state does not render, no retired service is
  republished, and the fatal state is shown

### Requirement: A restored page rebuilds only after retirement succeeds

A persisted page-hide SHALL begin retirement of the project, session and
application runtimes. A persisted page restoration SHALL join that retirement
and SHALL run the whole bootstrap - runtimes, React root, listeners, identity
restoration - only after it succeeds, preserving the browser address. If it
fails, no bootstrap SHALL be attempted and the fatal state SHALL be shown.

#### Scenario: Restoration waits for the retirement it joined

- **WHEN** a page is restored while the retirement started by its persisted hide
  is still running
- **THEN** no runtime, root, listener or identity read happens until that
  retirement succeeds, and then the whole bootstrap runs once

#### Scenario: Restoration after a failed retirement

- **WHEN** the joined retirement rejects or outruns its wait
- **THEN** no bootstrap is attempted and the fatal state is shown
```

### 8.3 `openspec/changes/adopt-frontend-lifetimes/tasks.md`

```markdown
# Tasks

- [ ] 1. The preferences module is a sealed, labelled DI Bag module whose browser
      store is private. Proves: the module label names the private binding, the
      installed surface carries neither the store nor the bag. Negative: the
      label removed, and the private edge broken.
- [ ] 2. The lifetime slot owns one runtime, withdraws before disposal, joins
      every trigger into one retirement, and refuses a replacement after a
      rejected or expired retirement. Negative: the gate replaced by the
      upstream report-and-continue policy; the retained disposal dropped.
- [ ] 3. The application runtime is installed by a composition root and opened
      through the slot at page load; delivery keeps its current imports.
- [ ] 4. The application bootstrap owns the React root: it builds the runtime
      before `createRoot`, publishes narrow services through one context, and
      renders the sanitized fatal state when the slot is fatal.
- [ ] 5. Page hide, hot-reload disposal and persisted restoration join one
      application retirement; restoration rebuilds only after it succeeds.
- [ ] 6. The session runtime is keyed by user id and installs the directory
      module; the router instance and address survive a same-session update.
- [ ] 7. Log out is a coordinated local exit: no request, project then session
      retirement, and the fatal state when either fails.
- [ ] 8. The project prerequisites: plan snapshot, connection, roster and busy
      state move into project-owned stores, and the command register and refusal
      publication move behind narrow ports.
- [ ] 9. The broad project API moves behind the plan and command modules' private
      repository ports.
- [ ] 10. The project runtime owns feed, writer, markers and saved plans for one
      selected project, replacing the per-effect ownership under `WbsTable`.
- [ ] 11. Project switch, route unmount and Strict Mode re-entry each replace all
      project ownership; a stale completion changes nothing.
- [ ] 12. Each module has its own isolated type check and its graph check, and the
      preferences module's public `preferences` resource — kept only for
      `src/lib/remembered.ts`'s per-project layout stores — moves behind a feature of
      its own or is recorded as accepted debt with its one caller named. The wiki
      module index for the six frontend modules is closed here too: it needs a
      `docs/wiki-policy/modules.json` identity, which is why MOD-LAYOUT records
      `debt` for all six today.
- [ ] 13. No infrastructure escapes a context: the architecture checks refuse a
      bag, credential, broad client, repository or resource in delivery.
```

### 8.4 `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts`

The faulty collaborators are **real DI Bag graphs** with a chosen disposer, not a hand-written
`close` that rejects: the refusals under test are `DiBagCleanupError` and
`DiBagCloseCancelledError`, and a stub would prove the gate against a shape the library never
produces. The record each fixture keeps — close count, the `timeoutMs` it was given, and the slot's
status as seen **from inside the disposer** — is what makes the ordering and budget checks breakable.

```ts
import { DiBag } from 'di-bag';
import { describe, expect, it } from 'vitest';

import {
  createLifetimeSlot,
  type RetirableRuntime,
  RETIREMENT_BUDGET_MS,
  TransitionSupersededError,
} from './lifetime-slot';

/** What the tests publish: a name, so a snapshot says which runtime is current. */
interface NamedServices {
  readonly name: string;
}

/** A promise a test settles when it chooses, for the disposals that outlive their wait. */
interface Deferred {
  readonly promise: Promise<void>;
  readonly settle: () => void;
  readonly refuse: () => void;
}

function deferred(): Deferred {
  let settle = (): void => undefined;
  let refuse = (): void => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    settle = resolve;
    refuse = () => {
      reject(new Error('the late disposal failed'));
    };
  });
  return { promise, settle, refuse };
}

/** What a built runtime recorded about its own disposal, for the assertions below. */
interface RuntimeRecord {
  readonly runtime: RetirableRuntime<NamedServices>;
  readonly closes: () => number;
  readonly budgets: () => readonly number[];
  readonly seenWhileDisposing: () => readonly string[];
}

/**
 * A runtime built the way production builds one — a DI Bag graph with one owned
 * resource — whose disposer this test chooses.
 *
 * Not a stub `close`: the refusals under test are DI Bag's own
 * `DiBagCleanupError` and `DiBagCloseCancelledError`, and a hand-written
 * rejection would prove the slot against a shape the library never produces.
 * The record also keeps the `timeoutMs` each close was given, which is how the
 * production budget is asserted where it is actually used.
 */
function runtimeNamed(
  name: string,
  dispose: () => Promise<void>,
  watch?: () => string,
): RuntimeRecord {
  let closes = 0;
  const budgets: number[] = [];
  const seen: string[] = [];
  const bag = DiBag.createBuilder()
    .register({
      owned: DiBag.withDisposal(
        DiBag.fromSyncFactory((): NamedServices => ({ name })),
        async () => {
          closes += 1;
          if (watch !== undefined) seen.push(watch());
          await dispose();
        },
      ),
    })
    .build();
  const services = bag.resolve('owned');
  return {
    runtime: {
      services,
      close: (options) => {
        budgets.push(options.timeoutMs);
        return bag.close(options);
      },
    },
    closes: () => closes,
    budgets: () => budgets,
    seenWhileDisposing: () => seen,
  };
}

const settles = (): Promise<void> => Promise.resolve();
const refuses = (): Promise<void> => Promise.reject(new Error('the disposer refused'));
const neverSettles = (): Promise<void> => new Promise<void>(() => undefined);

describe('one lifetime’s ownership', () => {
  it('publishes the runtime it opened', () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);

    const services = slot.open(() => first.runtime);

    expect(services.name).toBe('first');
    expect(slot.snapshot()).toEqual({ status: 'live', services });
  });

  it('refuses a second open, because nothing would be left holding the first close', () => {
    const slot = createLifetimeSlot<NamedServices>();
    slot.open(() => runtimeNamed('first', settles).runtime);
    const second = runtimeNamed('second', settles);

    expect(() => slot.open(() => second.runtime)).toThrow(
      'a lifetime slot that is live cannot be opened again',
    );
    expect(second.closes()).toBe(0);
  });

  it('is still withdrawn while its disposer runs, so nothing late can be read', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles, () => slot.snapshot().status);
    slot.open(() => first.runtime);

    await slot.retire();

    // Asserted from inside the disposal, which is the only place the order can
    // be seen: a slot that withdrew after starting the close would say `live`.
    expect(first.seenWhileDisposing()).toEqual(['retiring']);
    expect(slot.snapshot()).toEqual({ status: 'empty' });
  });

  it('withdraws the old runtime before its disposal starts, then publishes the replacement', async () => {
    const seen: string[] = [];
    const slot = createLifetimeSlot<NamedServices>();
    slot.subscribe(() => {
      seen.push(slot.snapshot().status);
    });
    slot.open(() => runtimeNamed('first', settles).runtime);

    const replaced = await slot.replace(() => runtimeNamed('second', settles).runtime);

    // The `open` above is the first entry: what matters is that `retiring` is
    // published before the replacement, so no reader can see two live runtimes.
    expect(seen).toEqual(['live', 'retiring', 'live']);
    expect(replaced.name).toBe('second');
    expect(slot.snapshot()).toEqual({ status: 'live', services: replaced });
  });

  it('joins one retirement for every trigger of the same runtime', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const pending = deferred();
    const first = runtimeNamed('first', () => pending.promise);
    slot.open(() => first.runtime);

    const both = Promise.all([slot.retire(), slot.retire()]);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    // Both triggers are in flight against a disposal that has not finished, which
    // is what a route unmount racing a page hide really looks like.
    expect(first.closes()).toBe(1);
    expect(slot.snapshot().status).toBe('retiring');
    pending.settle();
    await both;

    expect(first.closes()).toBe(1);
    expect(slot.snapshot()).toEqual({ status: 'empty' });
  });

  it('gives the retirement the production budget when it is built with none', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    slot.open(() => first.runtime);

    await slot.retire();

    // The number as the close really received it, not as the constant reads: a
    // changed default would pass an assertion on the constant alone.
    expect(first.budgets()).toEqual([RETIREMENT_BUDGET_MS]);
    expect(RETIREMENT_BUDGET_MS).toBe(5_000);
  });

  it('leaves exactly one runtime live when two replacements arrive together', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    const second = runtimeNamed('second', settles);
    const third = runtimeNamed('third', settles);
    slot.open(() => first.runtime);

    const outcomes = await Promise.allSettled([
      slot.replace(() => second.runtime),
      slot.replace(() => third.runtime),
    ]);

    // The loser is told it lost. Handing it the winner's services would be worse
    // than throwing: a superseded project effect would publish another project's.
    expect(outcomes[0].status).toBe('rejected');
    expect(outcomes[0].status === 'rejected' ? outcomes[0].reason : null).toBeInstanceOf(
      TransitionSupersededError,
    );
    expect(outcomes[1].status).toBe('fulfilled');
    expect(slot.snapshot()).toEqual({ status: 'live', services: third.runtime.services });
    // The abandoned-ownership assertion: the superseded request never built, so
    // there is no acquired runtime with nobody holding its close.
    expect(second.closes()).toBe(0);
    expect(first.closes()).toBe(1);
    expect(third.closes()).toBe(0);
  });

  it('retires the runtime a replacement published when a later retirement arrives', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    const second = runtimeNamed('second', settles);
    slot.open(() => first.runtime);

    await slot.replace(() => second.runtime);
    await slot.retire();

    expect(first.closes()).toBe(1);
    expect(second.closes()).toBe(1);
    expect(slot.snapshot()).toEqual({ status: 'empty' });
  });

  it('refuses the replacement when the required retirement fails, and says so sanitized', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    slot.open(() => runtimeNamed('first', refuses).runtime);
    const second = runtimeNamed('second', settles);
    let built = 0;

    await expect(
      slot.replace(() => {
        built += 1;
        return second.runtime;
      }),
    ).rejects.toThrow('DI_BAG_CLEANUP_FAILED');

    expect(built).toBe(0);
    const fatal = slot.snapshot();
    expect(fatal.status).toBe('fatal');
    // The sanitized public report and nothing from the refusal itself: a cleanup
    // failure is a disclosure boundary exactly as a caught render fault is.
    expect(fatal.status === 'fatal' ? fatal.fault.sentence : '').not.toContain('DI_BAG');
    expect(fatal.status === 'fatal' ? fatal.fault.occurrenceId : '').not.toBe('');
    expect(fatal.status === 'fatal' ? fatal.terminal : false).toBe(true);
  });

  it('refuses every later transition of a slot whose retirement failed', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    slot.open(() => runtimeNamed('first', refuses).runtime);
    await expect(slot.replace(() => runtimeNamed('second', settles).runtime)).rejects.toThrow(
      'DI_BAG_CLEANUP_FAILED',
    );
    const third = runtimeNamed('third', settles);

    await expect(slot.replace(() => third.runtime)).rejects.toThrow('DI_BAG_CLEANUP_FAILED');

    expect(third.closes()).toBe(0);
    expect(slot.snapshot().status).toBe('fatal');
  });

  it('fails the transition when the retirement outruns its budget, and keeps watching the disposal', async () => {
    // 50ms and not the production budget: the fault is the disposer that never
    // settles, and waiting the real five seconds for it proves nothing more.
    const slot = createLifetimeSlot<NamedServices>(50);
    slot.open(() => runtimeNamed('first', neverSettles).runtime);
    let built = 0;

    await expect(
      slot.replace(() => {
        built += 1;
        return runtimeNamed('second', settles).runtime;
      }),
    ).rejects.toThrow('DI_BAG_CLOSE_TIMEOUT');

    expect(built).toBe(0);
    expect(slot.snapshot().status).toBe('fatal');
    // A timeout is not cancellation: the disposal is still running, and the slot
    // still holds the promise that says how it ends.
    expect(slot.lateCleanup()).toBeInstanceOf(Promise);
    expect(slot.lateOutcome()).toBe('pending');
  });

  it('observes a late disposal that finishes after the wait expired, without publishing anything', async () => {
    const slot = createLifetimeSlot<NamedServices>(50);
    const pending = deferred();
    slot.open(() => runtimeNamed('first', () => pending.promise).runtime);
    await expect(slot.replace(() => runtimeNamed('second', settles).runtime)).rejects.toThrow(
      'DI_BAG_CLOSE_TIMEOUT',
    );

    pending.settle();
    await slot.lateCleanup();

    expect(slot.lateOutcome()).toBe('settled');
    // Eventual completion is not permission to resume: the refused replacement
    // stays unbuilt and the reader stays on the fatal state.
    expect(slot.snapshot().status).toBe('fatal');
  });

  it('observes a late disposal that fails after the wait expired', async () => {
    const slot = createLifetimeSlot<NamedServices>(50);
    const pending = deferred();
    slot.open(() => runtimeNamed('first', () => pending.promise).runtime);
    await expect(slot.retire()).rejects.toThrow('DI_BAG_CLOSE_TIMEOUT');

    pending.refuse();
    await expect(slot.lateCleanup()).rejects.toThrow('DI_BAG_CLEANUP_FAILED');

    expect(slot.lateOutcome()).toBe('failed');
    expect(slot.snapshot().status).toBe('fatal');
  });

  it('is fatal but not terminal when the replacement’s construction throws', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    slot.open(() => first.runtime);

    await expect(
      slot.replace((): RetirableRuntime<NamedServices> => {
        throw new Error('the replacement could not be built');
      }),
    ).rejects.toThrow('the replacement could not be built');

    const fatal = slot.snapshot();
    expect(fatal.status).toBe('fatal');
    // Nothing is held: the old runtime was retired and the new one never existed.
    expect(first.closes()).toBe(1);
    expect(fatal.status === 'fatal' ? fatal.terminal : true).toBe(false);
    expect(fatal.status === 'fatal' ? fatal.fault.occurrenceId : '').not.toBe('');
    // So a later transition may build, unlike a failed retirement.
    const third = runtimeNamed('third', settles);
    await expect(slot.replace(() => third.runtime)).resolves.toEqual({ name: 'third' });
  });
});
```

### 8.5 The slice 2 skeleton, `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`

Everything down to and including `TransitionSupersededError` and the `LifetimeSlot` interface is
exactly as section 8.6 has it; the file ends here instead:

```ts
/**
 * Not implemented yet: the red checkpoint's subject.
 *
 * The declarations above are the contract the tests were written against; this
 * body is replaced in the same slice, before anything is committed.
 */
export function createLifetimeSlot<S>(budgetMs: number = RETIREMENT_BUDGET_MS): LifetimeSlot<S> {
  throw new Error(`the lifetime slot is not implemented (budget ${String(budgetMs)}ms)`);
}
```

Its imports are only `import type { DisclosedFault } from '@/components/chrome/fault-disclosure';` —
the skeleton uses neither `di-bag` nor `discloseFault`.

### 8.6 `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`, whole

```ts
import { DiBagCloseCancelledError } from 'di-bag';

import { type DisclosedFault, discloseFault } from '@/components/chrome/fault-disclosure';

/**
 * How long a required retirement is waited for before the transition fails.
 *
 * One deterministic number for every lifetime, because the budget is an
 * implementation choice and not a reader's: a page whose old project will not
 * let go has to say so rather than sit blank. Five seconds is the same order as
 * the reread this page already waits through, and it is long enough that a
 * socket close and an aborted fetch settle inside it.
 *
 * A timeout is **not** cancellation: DI Bag goes on disposing after the wait
 * expires, and {@link createLifetimeSlot} keeps observing that work.
 */
export const RETIREMENT_BUDGET_MS = 5_000;

/** A built lifetime: its narrow public services, and the close that gives them back. */
export interface RetirableRuntime<S> {
  readonly services: S;
  /** Bounded on purpose; the caller's wait ends, the disposal does not. */
  readonly close: (options: { timeoutMs: number }) => Promise<void>;
}

/**
 * What one lifetime slot holds, as one value delivery can select from.
 *
 * `fatal` is what a reader is shown: the sanitized public report — the same
 * sentence and occurrence handle the root fault path discloses — because a
 * cleanup failure is a disclosure boundary exactly as a render fault is.
 *
 * `terminal` says whether this slot may ever hold a runtime again, and the two
 * cases are genuinely different:
 *
 * - a **retirement** that failed or outran its wait may still be holding what it
 *   was asked to give back — a socket, a timer, a lock — so the slot refuses
 *   every later transition with that same refusal (`terminal: true`);
 * - a **construction** that threw after a successful retirement holds nothing at
 *   all: the old runtime is gone, no service is published, and nothing leaked.
 *   The slot is unavailable, not poisoned, so a later transition may build again
 *   (`terminal: false`).
 */
export type LifetimeState<S> =
  | { readonly status: 'empty' }
  | { readonly status: 'live'; readonly services: S }
  | { readonly status: 'retiring' }
  | { readonly status: 'fatal'; readonly fault: DisclosedFault; readonly terminal: boolean };

/** How the disposal that outlived its bounded wait ended, as far as the slot has seen. */
export type LateCleanup = 'none' | 'pending' | 'settled' | 'failed';

/**
 * A transition that a newer request replaced before it ran.
 *
 * Modelled and thrown rather than resolved with somebody else's services: three
 * project selections in one tick must leave one runtime live, and the two losers
 * are told they lost instead of being handed a runtime they do not own.
 */
export class TransitionSupersededError extends Error {
  constructor(requested: number, newest: number) {
    super(`lifetime transition ${String(requested)} was superseded by ${String(newest)}`);
    this.name = 'TransitionSupersededError';
  }
}

/**
 * The one slot that owns the current runtime of one lifetime.
 *
 * A store (rule F2): `subscribe` and a `snapshot` that is stable until the slot
 * changes. It imports no React and holds no component state.
 */
export interface LifetimeSlot<S> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => LifetimeState<S>;
  /**
   * Publish the first runtime of this lifetime.
   *
   * @throws when the slot is not empty. A second `open` would abandon a live
   * runtime with nobody left holding its close; replacement goes through
   * {@link LifetimeSlot.replace}, which retires first.
   */
  readonly open: (build: () => RetirableRuntime<S>) => S;
  /**
   * Retire what is current and publish the replacement **only if** that
   * retirement succeeded.
   *
   * Transitions are serialized and fenced: one runs at a time, in request order,
   * and a request that a newer one overtook before its turn never builds.
   *
   * @throws the retirement failure, leaving the slot terminally fatal and the
   * replacement never built — DI Bag's own React recipe reports and continues,
   * and rule R5 refuses. Throws {@link TransitionSupersededError} when a newer
   * request won, and the construction's own failure when `build` throws.
   */
  readonly replace: (build: () => RetirableRuntime<S>) => Promise<S>;
  /** Withdraw and retire, leaving the slot empty on success and fatal on failure. */
  readonly retire: () => Promise<void>;
  /**
   * The disposal that outlived its bounded wait, for the caller that wants to
   * know how it ended. `null` until a bounded wait has expired.
   */
  readonly lateCleanup: () => Promise<void> | null;
  /** How that late disposal ended, as far as this slot has observed it. */
  readonly lateOutcome: () => LateCleanup;
}

/**
 * The still-running disposal behind a bounded-wait rejection, or `null`.
 *
 * DI Bag's `DiBagCloseCancelledError` carries the shared shutdown promise; a
 * timeout that dropped it would leave the page unable to say whether the old
 * runtime ever let go, and would leave that promise unhandled.
 */
function lateCleanupOf(refusal: unknown): Promise<void> | null {
  if (!(refusal instanceof DiBagCloseCancelledError)) return null;
  return refusal.cleanupPromise;
}

/**
 * One lifetime's ownership, with the fail-closed transition this repository requires.
 *
 * Every trigger for the same current runtime joins **one** retirement promise: a
 * route unmount, a selection change and a page hide arriving together retire
 * once. Withdrawal is synchronous and happens before the close starts, so no
 * late completion of the old runtime can reach a reader through this slot. Two
 * replacements arriving together do not each build: they queue behind one
 * transition, and the one a newer request overtook is refused rather than
 * acquiring a runtime nobody would close.
 */
export function createLifetimeSlot<S>(
  /**
   * The bounded wait this slot gives a retirement, in milliseconds.
   *
   * Production takes {@link RETIREMENT_BUDGET_MS}; a test names a short one so
   * the never-settling-disposer proof does not sit for five seconds. There is no
   * other reason to pass it, and no lifetime here differs.
   */
  budgetMs: number = RETIREMENT_BUDGET_MS,
): LifetimeSlot<S> {
  let state: LifetimeState<S> = { status: 'empty' };
  let held: RetirableRuntime<S> | null = null;
  let late: Promise<void> | null = null;
  let lateEnded: LateCleanup = 'none';
  /** The refusal that made this slot terminally fatal, rethrown to every later trigger. */
  let refused: unknown = null;
  /** The transition currently running, so the next one queues behind it. */
  let running: Promise<unknown> | null = null;
  /** The newest request's number; an older one that has not run yet is superseded. */
  let newest = 0;
  const listeners = new Set<() => void>();

  const publish = (next: LifetimeState<S>): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  /**
   * Withdraws first, then waits out the bounded close.
   *
   * Every trigger reaches one retirement without a second dedupe of its own:
   * transitions are serialized, and the first one to arrive has already set
   * `held` to null, so the ones behind it find nothing left to retire. A
   * `retirement !== null` guard here would be a check no test could break.
   */
  const retireCurrent = async (): Promise<void> => {
    const retiring = held;
    if (retiring === null) return;
    held = null;
    publish({ status: 'retiring' });
    await (async () => {
      try {
        await retiring.close({ timeoutMs: budgetMs });
      } catch (refusal) {
        // Kept, not dropped: the wait ended and the disposal did not.
        late = lateCleanupOf(refusal);
        refused = refusal;
        if (late !== null) {
          lateEnded = 'pending';
          // Observed so an eventual rejection is not unhandled, and so the page
          // can say how the old runtime ended. Never a resumption of the
          // refused transition.
          void late.then(
            () => {
              lateEnded = 'settled';
              for (const listener of listeners) listener();
            },
            () => {
              lateEnded = 'failed';
              for (const listener of listeners) listener();
            },
          );
        }
        publish({ status: 'fatal', fault: discloseFault(refusal), terminal: true });
        throw refusal;
      }
    })();
  };

  /** One transition, in request order: retire what is current, then build if asked. */
  const transition = async (build: (() => RetirableRuntime<S>) | null): Promise<S | null> => {
    const mine = ++newest;
    const ahead = running;
    const mineDone = (async (): Promise<S | null> => {
      // Deferred by one microtask before anything else, as DI Bag's own React
      // recipe defers startup: it lets every request made in the same tick be
      // counted before the first one decides whether it is still the newest.
      // Without it a first-in-line replacement builds before its successor is
      // even registered, and the page acquires a runtime it immediately discards.
      await Promise.resolve();
      // A transition never overlaps another, whatever order the effects fire in.
      if (ahead !== null) await ahead.catch(() => undefined);
      // The boundary: `refused` is a value DI Bag already threw once, rethrown
      // unchanged so the caller sees the real cleanup failure rather than a
      // paraphrase of it. Nothing here constructs it, so its type is `unknown`.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (refused !== null) throw refused;
      // Only a **build** can be superseded. A retirement is every trigger's
      // shared intent — route unmount, page hide, local exit — so it joins the
      // transition that overtook it instead of refusing; that is the map's "all
      // triggers for the same current handle join one close".
      if (build !== null && mine !== newest) throw new TransitionSupersededError(mine, newest);
      await retireCurrent();
      if (build === null) {
        if (state.status === 'retiring') publish({ status: 'empty' });
        return null;
      }
      let opened: RetirableRuntime<S>;
      try {
        opened = build();
      } catch (failure) {
        // Nothing is held and nothing leaked: the old runtime was retired and
        // this one never existed. Fatal for the reader, not terminal for the
        // slot — see {@link LifetimeState}.
        publish({ status: 'fatal', fault: discloseFault(failure), terminal: false });
        throw failure;
      }
      held = opened;
      publish({ status: 'live', services: opened.services });
      return opened.services;
    })();
    running = mineDone;
    try {
      return await mineDone;
    } finally {
      if (running === mineDone) running = null;
    }
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => state,
    open: (build) => {
      if (state.status !== 'empty') {
        throw new Error(`a lifetime slot that is ${state.status} cannot be opened again`);
      }
      const opened = build();
      held = opened;
      publish({ status: 'live', services: opened.services });
      return opened.services;
    },
    replace: async (build) => {
      const published = await transition(build);
      if (published === null) {
        throw new Error('a replacement transition published nothing');
      }
      return published;
    },
    retire: async () => {
      await transition(null);
    },
    lateCleanup: () => late,
    lateOutcome: () => lateEnded,
  };
}
```

### 8.7 `apps/wbs/fe-01/src/modules/preferences/module.ts`

```ts
import { DiBag } from 'di-bag';

import { browserStorage } from './browser-storage.repository';
import type { BrowserStorage, Preferences, RememberedPreferences } from './contract';
import { createRememberedPreferences } from './preferences.feature';
import { createPreferences } from './preferences.resource';

/**
 * The label every private binding of this module is named by in a DI failure.
 *
 * `frontend.` and not `module.frontend.`: the wiki module identifier carries the
 * `module.` prefix, and a DI Bag label drops it because the label is already
 * read inside a bag. See the identifier grammar in the batch note.
 */
export const PREFERENCES_LABEL = 'frontend.preferences';

/**
 * The sealed preferences module: two public services over one private store.
 *
 * `preferenceStore` is private on purpose, and it is the one thing here that
 * must never be reachable: it is the repository, and a caller holding it can
 * write any key in this browser past every guard {@link Preferences} exists to
 * apply. Sealing it is what rule K2 asks of a module, and `inspectGraph()` names
 * it `frontend.preferences/preferenceStore` rather than `preferenceStore`.
 *
 * `preferences` is public and that is **recorded debt, not a pattern**:
 * `src/lib/remembered.ts` still hands the layout module a store per project id,
 * which no named answer can express, so the resource stays reachable until that
 * caller moves behind a feature of its own. Nothing that imports React may
 * resolve it; delivery takes `rememberedPreferences`.
 */
export function preferencesModule() {
  return DiBag.createBuilder()
    .register({
      // The store is reached per call inside the adapter, so building this
      // binding touches no browser global — which is what lets the DOM-free
      // tier install this module at all.
      preferenceStore: DiBag.fromSyncFactory((): BrowserStorage => browserStorage()),
      preferences: DiBag.fromSyncFactory(
        ({ preferenceStore }: { preferenceStore: BrowserStorage }): Preferences =>
          createPreferences(preferenceStore),
      ),
      rememberedPreferences: DiBag.fromSyncFactory(
        ({ preferences }: { preferences: Preferences }): RememberedPreferences =>
          createRememberedPreferences(preferences),
      ),
    })
    .buildModule(['preferences', 'rememberedPreferences'], { label: PREFERENCES_LABEL });
}
```

### 8.8 The three `vitest.node-suites.ts` entries

One per slice, each in the list's sorted position before `'src/test-tiers.test.ts'`. After slice 4
the three read:

```ts
  // The page's own lifetime ownership: plain TypeScript over DI Bag, no browser
  // global and no component, which is the whole point of rule F1.
  'src/runtime/application-lifetime.test.ts',
  'src/runtime/application-runtime.test.ts',
  'src/runtime/lifetime-slot.test.ts',
```

### 8.9 The slice 3 skeleton, `apps/wbs/fe-01/src/runtime/application-runtime.ts`

Everything down to and including the `ApplicationRuntime` interface is exactly as section 8.11 has
it, without the `di-bag` and `module` imports, and the file ends:

```ts
export function buildApplicationRuntime(): ApplicationRuntime {
  throw new Error('the application runtime installs no module yet');
}
```

### 8.10 `apps/wbs/fe-01/src/runtime/application-runtime.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import { type ApplicationServices, buildApplicationRuntime } from './application-runtime';

/** What the production installer is allowed to hand back, spelled as a type. */
type PublishedKeys = keyof ApplicationServices;

describe('the page’s application runtime', () => {
  it('publishes its two services and hands out nothing else', () => {
    const runtime = buildApplicationRuntime();

    // The whole of the encapsulation claim, against the production installer's
    // own return value rather than a graph a test built: an extra key here is a
    // reachable bag, store or client, whatever its type says.
    expect(Object.keys(runtime).sort()).toEqual(['close', 'labels', 'services']);
    expect(Object.keys(runtime.services).sort()).toEqual([
      'preferences',
      'rememberedPreferences',
    ] satisfies PublishedKeys[]);
  });

  it('resolves every published service through the installed module', () => {
    const { services } = buildApplicationRuntime();

    expect(typeof services.preferences.json).toBe('function');
    expect(typeof services.rememberedPreferences.lastOpenedProject.read).toBe('function');
  });

  it('names the private browser store by its module label, and by no other name', () => {
    // Read from the bag the production installer really built, not from a second
    // graph assembled the same way: a diagnostic that installs its own module
    // passes even when the installer stops installing it.
    const labels = buildApplicationRuntime().labels();

    // A DI failure names a private binding `<label>/<key>`, so this is the
    // message a reader of a broken graph would get.
    expect(labels).toContain('frontend.preferences/preferenceStore');
    expect(labels).not.toContain('preferenceStore');
  });

  it('keeps the two public services unlabelled by the module, because they are its exports', () => {
    const labels = buildApplicationRuntime().labels();

    expect(labels.filter((label) => !label.includes('/')).sort()).toEqual([
      'preferences',
      'rememberedPreferences',
    ]);
  });

  it('hands out no value that is the raw browser store', () => {
    const runtime = buildApplicationRuntime();

    // The store's whole shape is `read`, `write` and `forget`, so this asks the
    // published surface whether any value it carries is that adapter — the leak
    // a return type cannot refuse, because a wider object still satisfies it.
    const isRawStore = (published: unknown): boolean =>
      typeof published === 'object' &&
      published !== null &&
      'read' in published &&
      'write' in published &&
      'forget' in published;

    expect(Object.values(runtime.services).filter(isRawStore)).toEqual([]);
    expect(Object.values(runtime).filter(isRawStore)).toEqual([]);
    // The diagnostic seam is strings, and this is what keeps it one: a leak
    // through `labels()` would be a value, not a name.
    expect(runtime.labels().every((label) => typeof label === 'string')).toBe(true);
  });

  it('closes under the caller’s bounded wait', async () => {
    const runtime = buildApplicationRuntime();

    await expect(runtime.close({ timeoutMs: 100 })).resolves.toBeUndefined();
  });
});
```

### 8.11 `apps/wbs/fe-01/src/runtime/application-runtime.ts`, whole

```ts
import { DiBag } from 'di-bag';

import type { Preferences, RememberedPreferences } from '@/modules/preferences/contract';
import { preferencesModule } from '@/modules/preferences/module';

import type { RetirableRuntime } from './lifetime-slot';

/**
 * Everything the page's own lifetime publishes, and nothing else.
 *
 * The application runtime lives for one page: hot reload and page hide close it.
 * What is **not** here is the whole of the boundary — no bag, no browser store,
 * no HTTP client — because a caller holding any of those could reach past every
 * guard the modules above them exist to apply.
 *
 * `preferences` is the resource, and its presence is recorded debt:
 * `src/lib/remembered.ts` builds a store per project id for the layout module
 * and no named answer can express that. See {@link preferencesModule}.
 */
export interface ApplicationServices {
  readonly preferences: Preferences;
  readonly rememberedPreferences: RememberedPreferences;
}

/**
 * Install every application module and resolve the page's services.
 *
 * The production installer, and the only place that sees the bag. `build()` is
 * lazy in DI Bag, so this function is not startup: the `resolve` calls below are
 * what construct, which is why they are here and not left to the first reader.
 *
 * Called at module load rather than inside a component: development Strict Mode
 * runs component bodies and lazy initialisers twice, and a runtime acquired
 * there would be built twice and closed once.
 */
export interface ApplicationRuntime extends RetirableRuntime<ApplicationServices> {
  /**
   * Every binding of **this** graph, by the name a DI failure calls it.
   *
   * The module boundary's own evidence, taken from the bag this runtime was
   * built from rather than from a second graph assembled to look like it: a
   * private binding is named `<label>/<key>`, so
   * `frontend.preferences/preferenceStore` appearing here — and a bare
   * `preferenceStore` not appearing — says the browser store is reachable inside
   * its module and nowhere else. Strings, never services.
   */
  readonly labels: () => readonly string[];
}

export function buildApplicationRuntime(): ApplicationRuntime {
  const bag = DiBag.createBuilder().installModule(preferencesModule()).build();
  return {
    services: {
      preferences: bag.resolve('preferences'),
      rememberedPreferences: bag.resolve('rememberedPreferences'),
    },
    // Bounded by the caller: the slot passes its budget, and DI Bag goes on
    // disposing after that wait ends.
    close: (options) => bag.close(options),
    labels: () => bag.inspectGraph().bindings.map((binding) => binding.label),
  };
}
```

### 8.12 The slice 4 skeleton, `apps/wbs/fe-01/src/runtime/application-lifetime.ts`

```ts
import { type ApplicationServices, buildApplicationRuntime } from './application-runtime';
import { createLifetimeSlot, type LifetimeSlot } from './lifetime-slot';

/** Not yet the page's owner: built, but not held by the slot. */
export const applicationLifetime: LifetimeSlot<ApplicationServices> =
  createLifetimeSlot<ApplicationServices>();

export const applicationServices: ApplicationServices = buildApplicationRuntime().services;
```

### 8.13 `apps/wbs/fe-01/src/runtime/application-lifetime.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import { browserPreferences, rememberedPreferences } from '@/modules/preferences/composition';

import { applicationLifetime, applicationServices } from './application-lifetime';

describe('the page’s application lifetime', () => {
  it('is live as soon as it is imported, above every component', () => {
    // The production wiring, not a rebuilt graph: importing this module is what
    // opens the page's runtime, and a slot that were still empty here would mean
    // the page has no owner at all.
    const held = applicationLifetime.snapshot();

    expect(held.status).toBe('live');
    expect(held.status === 'live' ? held.services : null).toBe(applicationServices);
  });

  it('is the one graph delivery reads its preferences out of', () => {
    // Identity, not shape: two graphs over the same browser store would behave
    // alike and own twice.
    expect(rememberedPreferences).toBe(applicationServices.rememberedPreferences);
    expect(browserPreferences).toBe(applicationServices.preferences);
  });
});
```

### 8.14 `apps/wbs/fe-01/src/runtime/application-lifetime.ts`, whole

```ts
import type { ApplicationServices } from './application-runtime';
import { buildApplicationRuntime } from './application-runtime';
import { createLifetimeSlot, type LifetimeSlot } from './lifetime-slot';

/**
 * The page's one application lifetime.
 *
 * Opened when this module loads, which is above every component and outside the
 * Strict Mode subtree: development runs component bodies and lazy initialisers
 * twice, and a runtime acquired in one of those would be built twice and closed
 * once. DI Bag's `build()` is lazy, so the construction is the `resolve` calls
 * inside {@link buildApplicationRuntime}, not this line.
 *
 * Retirement goes through the slot, so page hide, hot reload and the owners
 * above join one retirement promise, and a retirement that fails or outruns its
 * budget leaves this slot fatal rather than publishing a second graph beside the
 * first. The listeners that drive those triggers, and the React root that shows
 * the fatal state, are the next packet's.
 *
 * Separate from {@link buildApplicationRuntime} on purpose: the installer must be
 * importable without opening anything, or every test of it — and every graph
 * proof — would run this side effect first.
 */
export const applicationLifetime: LifetimeSlot<ApplicationServices> =
  createLifetimeSlot<ApplicationServices>();

/** The live page services, published once by this module's load. */
export const applicationServices: ApplicationServices =
  applicationLifetime.open(buildApplicationRuntime);
```

### 8.15 `apps/wbs/fe-01/src/modules/preferences/composition.ts`, whole

```ts
import { applicationServices } from '@/runtime/application-lifetime';

import type { Preferences, RememberedPreferences } from './contract';

/**
 * The one preferences resource this app runs on, resolved from the page's
 * application runtime.
 *
 * Exported because `apps/wbs/fe-01/src/lib/remembered.ts` still offers the
 * generic factory to the layout module, which builds a store per project id and
 * so cannot be a fixed named answer. Nothing that imports React may import this;
 * delivery takes {@link rememberedPreferences}.
 */
export const browserPreferences: Preferences = applicationServices.preferences;

/** The named answers, which is what delivery imports. */
export const rememberedPreferences: RememberedPreferences =
  applicationServices.rememberedPreferences;
```

### 8.16 The two README passages

Replace the "Relationships" paragraph with:

```markdown
The exported types are in `contract.ts`; the repository adapter is
`browser-storage.repository.ts`; the resource is `preferences.resource.ts`; the named answers are
`preferences.feature.ts`. `module.ts` is the sealed DI Bag module, labelled `frontend.preferences`,
and it keeps the adapter private: the page's application runtime in
`apps/wbs/fe-01/src/runtime/application-runtime.ts` installs it and `composition.ts` is now only
the two names delivery already imports. `preferences` stays a public export of the module for one
caller: `apps/wbs/fe-01/src/lib/remembered.ts` keeps the generic factory for the layout module,
which builds a store per project id and so cannot be a fixed named answer. That is recorded debt
against rule K2, not a pattern.
```

and append to the first sentence of "Checks":

```markdown
The
module's own boundary — the private adapter, the label a DI failure names it by — is proved by
`apps/wbs/fe-01/src/runtime/application-runtime.test.ts`, against the production installer.
```

## 9. Negative proofs

Fifteen faults, each injected **alone**, each with the counts and the diagnostic the planner really
observed on 2026-09-22. Copy the passing file to `$TMPDIR` first, save the mutation as a patch under
`$TMPDIR/evidence`, restore with `cp` and prove the restore with `cmp` **before** asserting on any
captured status. Never `rm` a scratch file.

Save a patch with one command and check its status directly — **never** through a pipeline, because
under `pipefail` Bash reports the rightmost status and a first command that exited 2 on a missing
input then reads as a clean diff:

```sh
if out=$(diff -u "$TMPDIR/<name>.passing" "<the file>"); then
  printf 'the mutation changed nothing\n' >&2; exit 1
else
  status=$?; test "$status" -eq 1; printf '%s\n' "$out" > "$TMPDIR/evidence/<name>.patch"
fi
```

A proof succeeds when the **named** test fails. Extra failures are recorded, not a stop; where one
mutation fails several tests, the row says which and why.

| #       | Fault, exactly                                                                                                                                                      | Named test that must fail                                                                      | Observed                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N1**  | `lifetime-slot.ts`, in `transition`: wrap `await retireCurrent();` in `try { … } catch { }` — the upstream owner's report-and-continue policy                       | `refuses the replacement when the required retirement fails, and says so sanitized`            | `5 failed \| 9 passed (14)`; the named test on `AssertionError: promise resolved "{ name: 'second' }" instead of rejecting`. One gate, five consequences: the timeout and late-cleanup cases go with it. |
| **N2**  | `lifetime-slot.ts`, in `retireCurrent`'s catch: delete `refused = refusal;`                                                                                         | `refuses every later transition of a slot whose retirement failed`                             | `1 failed \| 13 passed (14)`; `AssertionError: promise resolved "{ name: 'third' }" instead of rejecting`                                                                                                |
| **N3**  | `lifetime-slot.ts`, in the same catch: replace `late = lateCleanupOf(refusal);` with `late = null;`                                                                 | `fails the transition when the retirement outruns its budget, and keeps watching the disposal` | `3 failed \| 11 passed (14)`; `AssertionError: expected null to be an instance of Promise`, and the two late-cleanup cases on `expected 'none' to be 'settled'` / `'failed'`                             |
| **N4**  | `application-runtime.ts`, in `buildApplicationRuntime`: add `...{ bag },` as the first property of the returned object — a spread, so it is **type-correct**        | `publishes its two services and hands out nothing else`                                        | `typecheck` exit 0; `1 failed \| 5 passed (6)`; `AssertionError: expected [ Array(4) ] to deeply equal [ 'close', 'labels', 'services' ]`                                                                |
| **N5**  | `module.ts`, in `buildModule`: delete the second argument `{ label: PREFERENCES_LABEL }`                                                                            | `names the private browser store by its module label, and by no other name`                    | `2 failed \| 4 passed (6)`; `AssertionError: expected [ 'rememberedPreferences', …(2) ] to include 'frontend.preferences/preferenceStore'`, and the exports-are-unlabelled case with it                  |
| **N6**  | `module.ts`: give `preferenceStore` a dependency on the module's own `preferences` — `({ preferences: _preferences }: { preferences: Preferences })` — a real cycle | `resolves every published service through the installed module`                                | `typecheck` exit 0; `6 failed (6)`, the file collected, each test on `Error: DI_BAG_CYCLE: cycle: preferences -> frontend.preferences/preferenceStore -> preferences`                                    |
| **N7**  | `lifetime-slot.ts`, in `open`: delete the `if (state.status !== 'empty') { throw … }` block                                                                         | `refuses a second open, because nothing would be left holding the first close`                 | `1 failed \| 13 passed (14)`; `AssertionError: expected [Function] to throw an error`                                                                                                                    |
| **N8**  | `lifetime-slot.ts`, in `transition`: delete `if (ahead !== null) await ahead.catch(() => undefined);`                                                               | `joins one retirement for every trigger of the same runtime`                                   | `1 failed \| 13 passed (14)`; `AssertionError: expected 'empty' to be 'retiring'` — the second trigger publishes `empty` while the first is still disposing                                              |
| **N9**  | `lifetime-slot.ts`, in `retireCurrent`: move `publish({ status: 'retiring' });` to **after** `await retiring.close(…)`                                              | `is still withdrawn while its disposer runs, so nothing late can be read`                      | `2 failed \| 12 passed (14)`; `AssertionError: expected [ 'live' ] to deeply equal [ 'retiring' ]` — the status the disposer itself saw                                                                  |
| **N10** | `lifetime-slot.ts`: change the default parameter to `budgetMs: number = 4_000`                                                                                      | `gives the retirement the production budget when it is built with none`                        | `1 failed \| 13 passed (14)`; `AssertionError: expected [ 4000 ] to deeply equal [ 5000 ]` — read off the close the runtime really received                                                              |
| **N11** | `lifetime-slot.ts`: delete the `void late.then( … );` block                                                                                                         | `observes a late disposal that finishes after the wait expired, without publishing anything`   | `2 failed \| 12 passed (14)`; `AssertionError: expected 'pending' to be 'settled'` and `… to be 'failed'`                                                                                                |
| **N12** | `lifetime-slot.ts`: delete the `if (build !== null && mine !== newest) throw new TransitionSupersededError(mine, newest);` line                                     | `leaves exactly one runtime live when two replacements arrive together`                        | `1 failed \| 13 passed (14)`; `AssertionError: expected 'fulfilled' to be 'rejected'` — the superseded request built a runtime                                                                           |
| **N13** | `lifetime-slot.ts`: delete the `await Promise.resolve();` that defers every transition by a microtask                                                               | `leaves exactly one runtime live when two replacements arrive together`                        | `1 failed \| 13 passed (14)`; the same diagnostic, for the other half of the fence: without the deferral the first request decides before its successor is counted                                       |
| **N14** | `lifetime-slot.ts`: make the `catch (failure)` around `build()` rethrow without publishing the fatal state                                                          | `is fatal but not terminal when the replacement’s construction throws`                         | `1 failed \| 13 passed (14)`; `AssertionError: expected 'retiring' to be 'fatal'` — the slot would sit in `retiring` for ever                                                                            |
| **N15** | `composition.ts`: import `buildApplicationRuntime` and build a second graph — `const applicationServices = buildApplicationRuntime().services;`                     | `is the one graph delivery reads its preferences out of`                                       | `1 failed \| 1 passed (2)`; `AssertionError: expected { …(5) } to be { …(5) }` — two graphs over one browser store, owning twice                                                                         |

**Two checks were deleted rather than left unprovable.** A `if (retirement !== null) return retirement;`
dedupe inside `retireCurrent` and a second-open guard duplicated in `transition` both survived every
mutation the planner could write: serialization plus `held = null` already provide the join. AGENTS.md
R5 says a check that cannot fail is worse than none, so the shipped `retireCurrent` has neither, and
its JSDoc says why.

Each fault gets an adjacent dated `Proof:` comment on the line it was injected into, naming the fault
and the observed test — the format `apps/wbs/be-01/src/boot.ts:94` uses. Those comments are part of
the slice's diff and are in its hand-over list.

## 10. Verification

### The executor runs, per slice

| Command                                                                                         | Expected                                                   |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| the sandbox unit command of step 0                                                              | exit 0, F0/T0 recorded, then the slice's relative delta    |
| `(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts <the slice's test file>)` | the red of the slice, then exit 0 after the implementation |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                               | exit 0, including under N4 and N6                          |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                                    | exit 0 (autofix import order with `bunx eslint --fix`)     |
| `GSETTINGS_BACKEND=memory bunx prettier --check <the slice's files>`                            | exit 0                                                     |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                   | slice 1: V0 + 1 items; slice 5: V0 items; `failed: 0` both |

Keep the status of every command (`cmd > log 2>&1; echo "exit=$?"`). Never read a status through a
`tee` or a pipeline.

### Planner-only, with the values the planner observed

| Command                                                                                                                                                                                        | Observed                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1` in `apps/wbs/fe-01` (the jsdom tier)                                                                                             | exit 0, `124 passed (124)` files, `2918 passed (2918)` tests                                                     |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                                | exit 0, `366 pass`, `0 fail` — no inventory or digest pin moved                                                  |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test`                                                                                                                                           | exit 0, `764 pass`, `0 fail`, 19m, run alone on the host                                                         |
| `bun apps/wiki/cli/src/cli.ts check staged . HEAD <rule-policy>.json --rule MOD-LAYOUT` / `--rule MOD-INDEX`                                                                                   | `allowed: true` both; six pre-existing `debt` rows, unchanged (section 4.6)                                      |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                  | pending planner verification; `typecheck` passed over the same graph and the tier's own bundle test is unchanged |
| `CI=1 E2E_PORT_SHIFT=2400 NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- apps/wbs/fe-01/e2e/dark-mode.spec.ts apps/wbs/fe-01/e2e/gantt-detail.spec.ts apps/wbs/fe-01/e2e/project-picker.spec.ts` | exit 0, `21 passed (1.2m)` — theme, chart detail and remembered project, the three preference-driven lanes       |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                     | the planner's, after the last slice                                                                              |

Chromium is the planner's: the executor has no browser. Pick `E2E_PORT_SHIFT` as a multiple of 300
away from every other live run, check the three ports (`+0`, `+100`, `+1100` from 3100/3200/4200)
with `ss -ltn` first, and never kill a process you cannot prove is yours (`ls -l /proc/<pid>/cwd`).

**Load-sensitive Burokrat tests, not this packet's.** `apps/wiki/cli` has CLI-spawning tests at Bun's
5000 ms default. The planner watched `finite evidence artifact validation production CLI > rejects missing dependency identities, self obligations and cycles without timing out`
exceed it by 30 ms while the jsdom tier and a Chromium lane shared the host, and Nx report the task
flaky; alone, the suite was `764 pass`, `0 fail`. Run it with no other heavy target, record the
result, and rerun once on exactly that failure. Do not edit that test.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails in a planner run,
record it and rerun once; it failed a host gate on 2026-09-21 for its own reason. Do not edit it or
any other unrelated test.

## 11. Stop conditions

Each is scoped to the slice that reads it, and each is **false** on that slice's real starting tree;
the per-slice pre-edit checks in section 7 carry them.

In any slice:

- `bunx eslint` reports an error that is not `simple-import-sort/imports` or a Prettier complaint and
  this packet does not name it.
- a red run prints `No test files found` (the suite entry is missing) or `Tests no tests` (the
  skeleton is missing) instead of the counts section 7 gives.
- a negative proof leaves its **named** test passing. That is first a location mistake: restore,
  check the location, redo once, and stop if it happens again.
- any command wants the network, or any file outside section 6 needs changing.

## 12. The next 050.7 packets, in dependency order

Each is a packet of its own, ticking tasks of the same change. The order is the dependency order, and
a later packet may not be dispatched before the ones it names.

1. **050-7-b, the bootstrap and the fatal state.** Move the opening of the application runtime into a
   `bootstrap()` function in `main.tsx`, before `createRoot` and outside `<StrictMode>`; publish the
   two services through one application context; render the sanitized fatal state from the slot's
   `fatal` status, both flavours of it. Ticks task 4. Its hazard is `main.test.tsx`'s single
   `await import('./main')` assertion. Needs: this packet.
2. **050-7-c, page hide, hot reload and restoration.** `pagehide`, `import.meta.hot.dispose` and a
   persisted `pageshow` joining one retirement; rebuild only after it succeeds; the address
   preserved. Ticks task 5. Map tests 2 and 3. Needs: 050-7-b.
3. **050-7-f and 050-7-g, the project prerequisites.** The plan snapshot, connection, roster and busy
   state into project-owned stores; the command register and refusal publication behind narrow ports;
   then the broad `ProjectApi` behind the plan and command modules' private repository ports. Ticks
   tasks 8 and 9. This is the map's blocking work and the largest of the remainder. Needs: this
   packet only.
4. **050-7-d, the session runtime.** Keyed on `session.user.id`, installing
   `module.frontend.directory-management`; the router instance and address unchanged. Ticks task 6.
   Needs: 050-7-b.
5. **050-7-h, the project runtime.** Feed, writer, markers and saved plans for one selected project,
   replacing the per-effect ownership under `WbsTable`; switch, unmount and Strict Mode re-entry.
   Ticks tasks 10 and 11. Needs: 050-7-f, 050-7-g, 050-7-d.
6. **050-7-e, Log out as a coordinated local exit.** No request, project retirement then session
   retirement, the fatal state when either fails. Ticks task 7. Needs: 050-7-d **and** 050-7-h,
   because the map requires project retirement before the session's.
7. **050-7-i, the boundary checks and the module index.** Per-module isolated type checks, the
   architecture checks that refuse a bag, credential, broad client, repository or resource in
   delivery, the `preferences` resource's remaining caller, and the `docs/wiki-policy/modules.json`
   identities that close MOD-LAYOUT's six `debt` rows. Ticks tasks 12 and 13.

## 13. Assumptions recorded rather than asked

- **The change is named `adopt-frontend-lifetimes`.** The adoption tail map names
  `adopt-di-composition` for the _backend_ DI work (MCP and gateway, its executable order item 1),
  and batch 6's sibling packet 040-6-a opens that change. Two packets opening one change would
  collide, so the frontend gets its own.
- **The retirement budget is 5000 ms for every lifetime**, named as `RETIREMENT_BUDGET_MS`, because
  the map calls the budget a routine implementation choice. The proof injects a never-settling
  disposer with a 50 ms budget so the test does not sit for five seconds, and N10 is what says the
  production default is the one a real close receives.
- **A failed retirement is terminal; a failed construction is not.** The map fixes the first. The
  second is a case it does not name, and the slot distinguishes them with `terminal` because the
  danger the terminal rule guards against is a runtime that may still hold a socket or a lock — and a
  construction that threw after a successful retirement holds nothing. Both publish the same
  sanitized fatal state, so a reader sees one thing; only the slot's own contract differs.
- **A superseded replacement is refused, not answered with the winner's services.** Returning them
  would let a superseded project effect publish another project's feed. `TransitionSupersededError`
  is modelled and named for that reason, and a retirement never suffers it.
- **`preferences` stays a public export of the module** for `lib/remembered.ts`'s per-project layout
  stores. Recorded as preserved rule-K2 debt in the README and in task 12. The **repository** is
  private, and that is what the encapsulation proof is about.
- **The application runtime is opened at module load, not in `bootstrap()`.** `build()` is lazy in DI
  Bag and the resolve calls are the construction, so module scope is above every component and
  outside the Strict Mode subtree — the two properties the map asks for — while keeping delivery's
  existing imports valid. 050-7-b moves the opening into the bootstrap function when the React root
  becomes the same slice's business. The installer is a **separate file** from the slot holder so
  that importing it opens nothing.
- **The fatal state is published, not rendered, in this packet.** Rendering it needs the provider and
  the root, which are 050-7-b's files. The slot publishes the state and a test asserts the sanitized
  sentence and occurrence handle, so the behaviour is proved before anything draws it.
- **No `check.ts` and no per-module `tsconfig.json`.** The design's module layout lists both, and no
  frontend module has either today. Introducing them for one module while five have none is a
  repository-wide decision; it is task 12.

## 14. Disposition of the defect classes the 040.6 review found

| Defect class in `040-6-a…review1`                       | How this packet avoids it                                                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop conditions that halt the packet's own later slices | Section 11 plus each slice's pre-edit check: creation is forbidden _before_ its slice and required _after_ it.                                                      |
| A command needing network under the default dispatch    | No slice needs `--network`; nothing here listens, dials or downloads, and the OpenSpec command is warmed by the launcher.                                           |
| An encapsulation proof that builds its own host         | N4 and the surface tests run against `buildApplicationRuntime()`, and the label proof reads that installer's **own** bag through `labels()`.                        |
| Implementation before tests                             | Every slice writes the test, its suite entry and a throwing skeleton, records a red with a nonzero test count, then implements.                                     |
| Recorded negatives that do not match the supplied tests | All fifteen rows of section 9 were injected alone against these listings; their counts and diagnostics are the run's own output.                                    |
| A handoff the prescribed workflow cannot produce        | Each slice lists the individual paths it changes as `--untracked-files=all` prints them; slice 5 uses a recorded-base `git diff --name-only` scoped to owned paths. |
| OpenSpec files created by hand                          | Slice 1 runs `openspec new change … --schema sdd-lean` first and expects exactly `.openspec.yaml` from it; that file is in the plan and the hand-over.              |

## 15. Disposition of review 1

Every finding was checked against the repository before acting, and every fix was settled by
rehearsal in the planner's worktree rather than by argument.

| Finding                                                 | Verdict      | Where, and what was observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** red runs select zero tests                       | **FIXED**    | Confirmed: with the file absent from `NODE_SUITES`, the prescribed run printed `No test files found, exiting with code 1`. §4.3 states the filter-after-include rule; every slice now registers its suite entry and writes a throwing skeleton with the test, and the three reds are `Tests 14 failed (14)`, `6 failed (6)` and `2 failed (2)`, all rehearsed.                                                                                                                                                                                                                                                                                                                            |
| **C2** concurrent replacements abandon a runtime        | **FIXED**    | Reproduced. §8.6 serializes transitions behind one chain, defers each by a microtask as DI Bag's own recipe does, and fences a superseded build with `TransitionSupersededError`; a superseded retirement joins instead. Test `leaves exactly one runtime live when two replacements arrive together` asserts `second.closes() === 0`. N12 and N13 break each half.                                                                                                                                                                                                                                                                                                                       |
| **C3** N4 and N6 are not type-correct; N6 has no slice  | **FIXED**    | Both confirmed. N4 is now a spread (`...{ bag }`) and N6 a registered cycle; `wbs-fe-01:typecheck` exits **0** under each, and N6 fails six named tests with the file collected, on `DI_BAG_CYCLE: cycle: preferences -> frontend.preferences/preferenceStore -> preferences`. Both are assigned to slice 3, which is also where the installer lands.                                                                                                                                                                                                                                                                                                                                     |
| **I4** three hand-over path expectations wrong          | **FIXED**    | `--untracked-files=all` does list files; §7 now lists each path individually per slice, the `Proof:` comments are attributed to the files they are written into, and the total is **fifteen**, matching §6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **I5** slice 5's OpenSpec expectation                   | **FIXED**    | Slice 5 now requires `summary.totals.items` equal to its **own** V0; only slice 1 requires V0 + 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **I6** safety checks without effective proofs           | **FIXED**    | N7 (second open), N8 (serialization), N9 (withdrawal, asserted from **inside** the disposer), N10 (the budget as the close really received it) are new and rehearsed. Two guards that survived every mutation — a `retirement !== null` dedupe and a duplicate second-open check — were **deleted**: R5 says a check that cannot fail is worse than none.                                                                                                                                                                                                                                                                                                                                 |
| **I7** the timeout proof cannot see late cleanup        | **FIXED**    | The fixtures now take a deferred disposer. Two new tests settle and reject it after the wait expired and assert `lateOutcome()` is `settled` / `failed` while the slot stays fatal and the replacement unbuilt; N11 deletes the observation and both fail on `expected 'pending' to be …`.                                                                                                                                                                                                                                                                                                                                                                                                |
| **I8** the label proof inspects a separate graph        | **FIXED**    | `applicationGraphLabels()` is gone. `buildApplicationRuntime()` returns `labels()`, read from **its own** bag, and the encapsulation test pins the surface to `['close', 'labels', 'services']` and asserts `labels()` returns strings only.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **I9** module index waived rather than implemented      | **REJECTED** | Settled by rehearsal, §4.6: `twib check --rule MOD-LAYOUT` is `allowed: true` with **six identical `debt` rows**, one per frontend module, unchanged by `module.ts`; `--rule MOD-INDEX` is `allowed: true`, no findings. Closing it needs a `docs/wiki-policy/modules.json` pilot identity, which also imports `K2`–`K6` and `F1`, and those cannot be evaluated over fe-01 at all (`TypeScript import unresolved: apps/wbs/fe-01/src/main.tsx -> './styles.css'`, `apps/wiki/cli/src/relationships/typescript.ts:349`). Packet 050.6 §4.5 measured the same thing and decided not to add the comment. The obligation is now explicit work in task 12 and in packet 050-7-i, not silence. |
| **I10** construction failure leaves `retiring` for ever | **FIXED**    | Reproduced. The slot now publishes `{ status: 'fatal', terminal: false }` and holds nothing, so a later transition may build; §13 says why that differs from a failed retirement. Test `is fatal but not terminal when the replacement’s construction throws`; N14 restores the old behaviour and it fails on `expected 'retiring' to be 'fatal'`.                                                                                                                                                                                                                                                                                                                                        |
| **I11** evidence handoff underspecified                 | **FIXED**    | Every log now goes to `$TMPDIR/evidence/slice<N>-*.log`, dispatch carries `--preserve evidence`, slice 5 is dispatched with `--seed` for each earlier attempt, and its `verify.md` rows name the attempt and evidence basename instead of claiming the proofs ran in slice 5.                                                                                                                                                                                                                                                                                                                                                                                                             |
| **I12** descriptions disagree with the artifacts        | **FIXED**    | The delta spec now has **six** requirements (the sixth states the superseded-transition and construction-failure contract, and validates); §5 says "readonly function-valued properties"; task 12's text now names the `preferences` resource debt and its one caller.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **I13** advertised order violates its own dependency    | **FIXED**    | §12 is a dependency order: the project prerequisites and the project runtime precede 050-7-e, and each entry names what it needs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Also folded in from the author brief addendum after review 1 was written:

- **point 11** — §9's patch recipe uses the `if out=$(diff …); then … else status=$?; …` form and says
  why: after a pipeline under `pipefail`, `|| test $? -eq 1` accepts a first command that exited 2.
- **point 13** — §4.6 states the index requirement, what would close it, and why it is task 12's.
- **point 14** — §4.4: this packet prescribes no `bun test` command at all, and its vitest commands
  were re-rehearsed **after** `wbs-fe-01:typecheck` had written `dist/out-tsc/apps/wbs/fe-01/*.test.js`
  into the same worktree. The node tier selected the same 45 files and 636 tests either way, because
  `include` is the explicit `NODE_SUITES` list and `dist` is outside it.
