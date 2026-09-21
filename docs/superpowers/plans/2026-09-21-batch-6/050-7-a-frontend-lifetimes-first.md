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
| Rehearsed by        | the planner, in a private worktree off `40be90d3`, every slice committed with lefthook on and then reset away                                                                        |

## 1. Goal and non-goals

**Goal.** Give fe-01 its first real lifetime owner, and make it the pattern every later 050.7 packet
copies. Three things land:

1. **`openspec/changes/adopt-frontend-lifetimes`**, covering the whole of 050.7's target shape — the
   three lifetimes, who owns each, the retirement rule and the fatal state — so that every later
   packet ticks a task instead of opening a change.
2. **One sealed, labelled DI Bag module** (`module.frontend.preferences`) whose browser store is
   private, installed by **one production composition root** that hands delivery two named services
   and nothing else.
3. **One lifetime slot** — the runtime owner — with the repository's fail-closed transition: a
   retirement that rejects or outruns its bounded wait withdraws the old services, **refuses the
   replacement**, and publishes the sanitized public failure report. DI Bag's own React recipe
   reports and continues; rule R5 refuses, so the owner is local source (see the research note).

**Non-goals**, each because it belongs to a later packet or to another change:

- No library version change. `di-bag` stays `0.4.0`; `package.json` and `bun.lock` are untouched.
- No backend, gateway or MCP work.
- No session runtime, no project runtime. This packet installs the **application** lifetime only.
- No React changes at all: no context, no provider, no `main.tsx` edit, no component edit. The
  fatal state is published as a slot state here and **rendered** by packet 050-7-b.
- No server-side sign-out, and no change to the local-exit behaviour of Log out.
- No new reader-visible behaviour. Everything a reader can see is unchanged, and the browser lane is
  what says so (section 10).

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

| Candidate        | Files today                                                                  | What installing it costs                                                    |
| ---------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Preferences**  | 6 sources in `apps/wbs/fe-01/src/modules/preferences`, 2 module-load exports | a `module.ts`, a composition root, and a 6-line rewrite of `composition.ts` |
| Notices          | none; `useToasts()` in `project-page.tsx` and `wbs-table.tsx`                | extract a feature first, and decide which stack renders each message        |
| Stream connector | `lib/project-stream.ts`, plus a second subscription path in saved plans      | own a repository whose subscriptions are project-scoped                     |
| Auth gateway     | `fetchMe` + `AuthForm` inside `app.tsx`                                      | extract a feature and change the signed-out gate                            |

Preferences is also the only one whose delivery imports need **no change**: its two module-load
exports keep their names and their types, so the four delivery call sites
(`lib/theme.ts:52`, `components/wbs/gantt-detail.ts:39`, `components/wbs/project-page.tsx:94`,
`components/wbs/project-settings-modal.tsx:77`) and `lib/remembered.ts:1` are untouched and become
the regression oracle: they now read services resolved out of the page's DI Bag runtime.

Its one wart is measured and recorded rather than hidden: `lib/remembered.ts` needs the
**resource** (`Preferences.json`/`.text`) because the layout module builds a store per project id,
so the module exports `preferences` as well as `rememberedPreferences`. That is preserved rule-K2
debt with one caller, named in the module README and in task 12 of the change; the thing that must
be unreachable — and is — is the **repository**.

## 3. Read first

1. `AGENTS.md` (rules R1 to R5) and `LLM_README.md`.
2. The execution contract sections of the [batch 1 README](../2026-09-19-batch-1/README.md).
3. [The 050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md):
   "Authority and DI Bag facts", "Application owner", "Replacement and cleanup policy", and tests 1,
   4, 12 and 14 of "Exact lifecycle tests".
4. [DI Bag 0.4.0 React lifecycle guarantees](../../../research/2026-09-21-di-bag-0-4-lifecycle.md),
   "Durable implementation requirements" 1 to 5.
5. The design's "Modules", "Module layout" and "Frontend organization" sections.
6. `apps/wbs/fe-01/src/modules/preferences/` whole, and `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`.

## 4. Verified facts

Every claim below was read or run in a worktree off `40be90d3`. Line numbers are that tree's.

### 4.1 What DI Bag 0.4.0 actually prints

Probed with `bun` against the installed `node_modules/di-bag` (version `0.4.0`, pinned in
`tools/tool-devsync/src/toolchain-pins.test.ts:506`):

- `buildModule(keys, { label })` names each **private** binding `<label>/<key>` in
  `inspectGraph()`; a **public** export keeps its bare key. With the label removed, the private
  binding is listed as its bare key.
- resolving a private key by name from the host bag throws
  `DI_BAG_MISSING_REGISTRATION: Service "store" is not registered.`
- a private binding with an unmet dependency throws, **naming the label**:
  `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "frontend.preferences/preferenceStore": dependency "absentStore" is not registered. Resolution path: preferences -> frontend.preferences/preferenceStore -> absentStore.`
  The same break on a **public** binding names only `"preferences"` — which is why the label proof
  targets the private binding.
- a rejecting disposer makes `close()` reject with `DiBagCleanupError`:
  `DI_BAG_CLEANUP_FAILED: Failed to run 1 disposal callback(s);`
- a never-settling disposer under `close({ timeoutMs: 50 })` rejects with
  `DiBagCloseCancelledError`:
  `DI_BAG_CLOSE_TIMEOUT: Bag close timed out after 50ms; disposers still running: r;`
  whose `details` is `{"operation":"close","reason":"timeout","timeoutMs":50,"pending":["r"],"acquiring":[]}`
  and whose `cleanupPromise` is an object — the shared shutdown the owner must keep observing.
- `build()` and `resolve()` are **synchronous** for sync factories, so the browser graph needs no
  `await`. `apps/wbs/be-01/src/boot.ts:90` awaits only because that graph has async work.

### 4.2 The frontend as it stands

- `apps/wbs/fe-01/src/modules/` holds six module directories and **no `module.ts`**: composition is
  `composition.ts` files (`preferences`, `directory-management`, `plan-feed`, `calendar-markers`).
  `apps/wbs/fe-01/src/modules/preferences/README.md:44` says so in as many words — "There is no
  `module.ts` yet: DI Bag is not installed" — and slice 3 is what makes that sentence false, so it
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
  `localStorage` is read as needing a browser. **Both new test files are written to avoid those
  words** and belong in the node tier; a slice that adds one adds **only its own** entry, because an
  entry naming a file that does not exist yet makes the tier collect nothing.

### 4.3 Targets, tiers and the sandbox

- `apps/wbs/fe-01/project.json` has `test` (two vitest runs, jsdom then zoned), `test:unit` (the
  node tier), `lint`, `lint:fast`, `typecheck`, `build`, `e2e`, `e2e-packaged`. fe-01 has **no**
  `lint:source`; only the Burokrat project does.
- **The executor never runs `wbs-fe-01:test:unit` or `wbs-fe-01:test` through Nx**: three of their
  tests spawn `bun` from Node and the sandbox refuses with `spawnSync bun EPERM`. It runs the
  sandbox unit command in section 7's step 0 instead.
- The whole jsdom tier, the zoned tier, `wbs-fe-01:build`, `tool-devsync:test`,
  `twilight-burokrat:test` and every Chromium run are **planner-only**, with the planner's observed
  values in section 10.

### 4.4 The rehearsal, and its numbers

The whole of sections 8 and 9 was executed on `40be90d3` before this packet was written.

| What                                                                             | Observed                                                                                           |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Sandbox unit command, before any change                                          | `42 passed (42)` files, `614 passed (614)` tests, exit 0                                           |
| Sandbox unit command, after all four slices                                      | `44 passed (44)` files, `628 passed (628)` tests, exit 0                                           |
| `wbs-fe-01:typecheck`                                                            | exit 0                                                                                             |
| `wbs-fe-01:lint`                                                                 | exit 0, after `bunx eslint --fix` sorted two import blocks                                         |
| Whole jsdom tier (`TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1`) | exit 0, `123 passed (123)` files, `2910 passed (2910)` tests, 432s                                 |
| `tool-devsync:test`                                                              | exit 0, `366 pass`, `0 fail`                                                                       |
| `openspec validate --all --json`                                                 | exit 0, `113` items, `113` passed, `0` failed; `adopt-frontend-lifetimes` `valid: true`, no issues |
| Chromium, `CI=1 E2E_PORT_SHIFT=2400`, three preference-driven specs              | exit 0, `21 passed (1.2m)`                                                                         |
| Four real `git commit`s with lefthook on                                         | exit 0 each; `tool-wiki`, `plaintext-secrets`, `format`, `lint` all ✔                              |

Absolute numbers are orientation only: every expectation in section 7 is relative to the baseline
that slice records itself.

### 4.5 Which whole-suite pins this packet moves: none

`tool-devsync:test` passed with all new files committed. This packet adds no project, no target and
no CI path, so `apps/wiki/cli/src/policy/pilot-policy.test.ts` (which reads the repository at `HEAD`
through git) has nothing to disagree with. `docs/code-organization/kinds.json` gets no entry: the
new files are a DI module definition and two composition-root files, not a fifth service kind.
No packaging, activation-policy or dependency-pin file is touched.

**The module index does not owe this module an entry.** The Burokrat index checker refuses an
undeclared file — `unindexed candidate path in <README>: <file>`, at
`apps/wiki/cli/src/indexes/check-indexes.ts:146` — but only for a directory whose `README.md`
carries a `module-index` block. Eight READMEs do (`apps/wiki/cli`, `apps/wiki/consumer`,
`libs/wbs/domain/domain/src/saved-plan`, `libs/wbs/application/core/src/use-cases`,
`libs/wbs/adapters/store-memory/src`, `tools/tool-dagger/src/lib`, `docs/findings`,
`docs/refactoring/w4-4`) and **none is under `apps/wbs/fe-01`**, so `module.ts` needs no index
entry. What it does need is the prose correction of slice 3.

**Do not read the `tool-wiki` pre-commit tick as a wiki check.** `bin/tool-wiki-lint.sh` prints
`{"schemaVersion":1,"status":"inactive",…}` and exits 0 when `TOOL_WIKI_ACTIVATION_ROOT` names
nothing (`bin/tool-wiki-lint.sh:14`), which is the sandbox's and the planner's state. Its ✔ on a
commit means the launcher refused nothing, not that a validator ran.

## 5. The shape

Three new files and two edits. In dependency order:

- `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` — `RetirableRuntime<S>`, `LifetimeState<S>`,
  `LifetimeSlot<S>`, `createLifetimeSlot<S>(budgetMs?)`, `RETIREMENT_BUDGET_MS`. Plain TypeScript, a
  store in the sense of rule F2, no React, no DI Bag graph of its own.
- `apps/wbs/fe-01/src/modules/preferences/module.ts` — the sealed module and `PREFERENCES_LABEL`.
- `apps/wbs/fe-01/src/runtime/application-runtime.ts` — `ApplicationServices`,
  `buildApplicationRuntime()`, `applicationGraphLabels()`, and the page's one
  `applicationLifetime` slot with `applicationServices` opened in it.
- `apps/wbs/fe-01/src/modules/preferences/composition.ts` — the same two exported names, now read
  out of `applicationServices`.
- `apps/wbs/fe-01/vitest.node-suites.ts` — one entry per new test file.

**Identifiers.** The wiki module identifier is `module.frontend.preferences`; the DI Bag label drops
the `module.` prefix and is `frontend.preferences`, as the batch note fixes. The label is a
constant, `PREFERENCES_LABEL`, because a test asserts the exact string a failure prints.

## 6. File plan

| Path                                                                               | Slice | Create or modify | Note                                                     |
| ---------------------------------------------------------------------------------- | ----- | ---------------- | -------------------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/.openspec.yaml`                         | 1     | created by CLI   | written by `openspec new change`, never by hand          |
| `openspec/changes/adopt-frontend-lifetimes/proposal.md`                            | 1     | create           | 393 words as given in section 8.1                        |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` | 1     | create           | six requirements, each with a normative SHALL sentence   |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                               | 1     | create           | 13 tasks; this packet ticks 1, 2 and 3                   |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                              | 1–4   | create, append   | every slice appends its own observations                 |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`                                      | 2     | create           | 182 lines                                                |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts`                                 | 2     | create           | 149 lines, 8 tests                                       |
| `apps/wbs/fe-01/vitest.node-suites.ts`                                             | 2, 3  | modify           | one entry in slice 2, one in slice 3, never both at once |
| `apps/wbs/fe-01/src/modules/preferences/module.ts`                                 | 3     | create           | 49 lines                                                 |
| `apps/wbs/fe-01/src/runtime/application-runtime.ts`                                | 3     | create           | 76 lines                                                 |
| `apps/wbs/fe-01/src/runtime/application-runtime.test.ts`                           | 3     | create           | 72 lines, 6 tests                                        |
| `apps/wbs/fe-01/src/modules/preferences/composition.ts`                            | 3     | modify           | 6 lines replaced by 6                                    |
| `apps/wbs/fe-01/src/modules/preferences/README.md`                                 | 3     | modify           | the "no `module.ts` yet" sentence and the Checks section |

Nothing else. In particular **no** file under `apps/wbs/fe-01/src/components/`, no `main.tsx`, no
`app.tsx`, no `package.json`, no `bun.lock`.

## 7. Slices

Four slices. Each is one attempt, ends in one planner commit with the exact subject given, and
begins with its own step 0.

**Dispatch.** The launcher is `/home/df/wd/puni/puni-plan/exec/run-executor.sh` and is not reachable
from inside the sandbox; the planner runs it:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-7-a-frontend-lifetimes-first <slice> <base> --batch batch-6
```

`--batch batch-6` is enough: the launcher's `case` already defaults batch 6 to
`docs/superpowers/plans/2026-09-21-batch-6`. **No `--network`** is needed by any slice: nothing here
listens, dials or downloads, and the OpenSpec command is warmed by the launcher before the attempt
starts. Slices run in order, each on the previous slice's commit; later slices take
`--seed <kept evidence dir>` when an earlier slice's evidence is wanted.

### Step 0 — at the start of every slice

- [ ] Record the head and the working tree:

  ```sh
  git rev-parse HEAD; git status --short --untracked-files=all
  ```

- [ ] Record the **sandbox unit command** baseline. Call its two numbers **F0** and **T0** for this
      slice; every expectation below is relative to them:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts     --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts)     > "$TMPDIR/step0-unit.log" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0. **Never** run `wbs-fe-01:test:unit` or `wbs-fe-01:test`: three of their tests
  spawn `bun` from Node and the sandbox refuses that with `spawnSync bun EPERM`.

- [ ] Record the OpenSpec baseline, in slices 1 and 4 only:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json     > "$TMPDIR/step0-openspec.json" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0. Record `summary.totals.items` as **V0**.

### Slice 1 — the change, opened by the tool

Subject: `feat(fe-01): open the frontend lifetimes change`

- [ ] Create the change **with the CLI**, never by hand:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change adopt-frontend-lifetimes     --schema sdd-lean > "$TMPDIR/openspec-new.log" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0, `Created change 'adopt-frontend-lifetimes' at openspec/changes/adopt-frontend-lifetimes/`,
  and exactly one file created: `openspec/changes/adopt-frontend-lifetimes/.openspec.yaml`, holding
  `schema: sdd-lean` and a `created:` date. If the directory already exists, **stop**: an earlier
  attempt left it, and its artifacts have to be read before they are rewritten.

- [ ] Write `proposal.md`, `specs/adopt-frontend-lifetimes/spec.md` and `tasks.md` **exactly** as
      section 8.1, 8.2 and 8.3 give them.

- [ ] Create `verify.md` with a `## Slice 1` heading and this slice's observations. Evidence
      references are **basenames** relative to the attempt's evidence directory; never an absolute
      clone, home or temporary path, because this file is published.

- [ ] Validate, and require one more valid item than the baseline:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json     > "$TMPDIR/openspec-after.json" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0; `summary.totals.failed` is `0`; `summary.totals.items` is **V0 + 1**; and the
  entry whose `id` is `adopt-frontend-lifetimes` has `"valid": true` and `"issues": []`. Read those
  fields out of the JSON — an exit code alone does not say the new change was seen.

- [ ] Format: `GSETTINGS_BACKEND=memory bunx prettier --check openspec/changes/adopt-frontend-lifetimes`
      (run `--write` first if it refuses; expected exit 0 afterwards).

Hand over: `openspec/changes/adopt-frontend-lifetimes/.openspec.yaml`, `proposal.md`,
`specs/adopt-frontend-lifetimes/spec.md`, `tasks.md`, `verify.md`. No source file changes in this
slice, and `F0`/`T0` must be unchanged by it.

### Slice 2 — the lifetime slot and its fail-closed gate

Subject: `feat(fe-01): own one lifetime with a fail-closed retirement gate`

- [ ] Write **the test first**: `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts`, exactly as
      section 8.5.

- [ ] Run it and record the red:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts     src/runtime/lifetime-slot.test.ts) > "$TMPDIR/red-slice2.log" 2>&1; echo "exit=$?"
  ```

  Expected, observed by the planner: exit 1, one `FAIL src/runtime/lifetime-slot.test.ts` whose
  reason is `Error: Cannot find module './lifetime-slot' imported from …` — the slot does not exist
  yet. The file is not in the tier's `include` list yet, so pass it as a path argument as above.

- [ ] Write `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`, exactly as section 8.4, including the
      `eslint-disable-next-line @typescript-eslint/only-throw-error` and the comment above it that
      names the boundary. Without that comment `lint` refuses it: rethrowing a caught `unknown` is
      `Expected an error object to be thrown`.

- [ ] Add **one** entry to `apps/wbs/fe-01/vitest.node-suites.ts`, in the list's sorted position
      between `src/modules/preferences/preferences.resource.test.ts` and `src/test-tiers.test.ts`,
      with the comment section 8.6 gives:

  ```ts
  'src/runtime/lifetime-slot.test.ts',
  ```

  Do **not** add slice 3's entry here: the tier's guard walks the directory, and a list naming a
  file that does not exist makes the tier collect nothing.

- [ ] Green, twice — the file alone, then the whole tier:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts     src/runtime/lifetime-slot.test.ts) > "$TMPDIR/green-slice2.log" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0, `Test Files 1 passed (1)`, `Tests 8 passed (8)`. Then the sandbox unit command:
  exit 0, **F0 + 1** files and **T0 + 8** tests.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0. This slice declares a generic
      interface with method-shaped members, which is exactly the shape batch 1's variance break had,
      so the type check runs in the slice that introduces it.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0. An import-order or Prettier complaint
      is autofixable: run `bunx eslint --fix <the two files>` and rerun, which is what the planner
      did (`simple-import-sort/imports` on both files).

- [ ] Run this slice's two negatives, N1 and N2 from section 9, restoring between them, and append
      the observed diagnostics to `verify.md`.

Hand over, by `git status --short --untracked-files=all`:
`?? apps/wbs/fe-01/src/runtime/`, ` M apps/wbs/fe-01/vitest.node-suites.ts`, ` M openspec/changes/adopt-frontend-lifetimes/verify.md`.
The planner's commit is what makes the directory two named files in the next slice's status.

### Slice 3 — the module, the composition root, and the page's slot

Subject: `feat(fe-01): install the preferences module through the page runtime`

- [ ] Write **the test first**: `apps/wbs/fe-01/src/runtime/application-runtime.test.ts`, exactly as
      section 8.9.

- [ ] Run it and record the red:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts     src/runtime/application-runtime.test.ts) > "$TMPDIR/red-slice3.log" 2>&1; echo "exit=$?"
  ```

  Expected, observed by the planner: exit 1, `Error: Cannot find module './application-runtime' imported from …`.

- [ ] Write `apps/wbs/fe-01/src/modules/preferences/module.ts` exactly as section 8.7 and
      `apps/wbs/fe-01/src/runtime/application-runtime.ts` exactly as section 8.8.

- [ ] Replace the body of `apps/wbs/fe-01/src/modules/preferences/composition.ts` with section 8.10.
      The two exported names and their types do not change; what changes is where the values come
      from. Do not touch any importer of those names.

- [ ] Add **one** entry to `vitest.node-suites.ts`, immediately before slice 2's:

  ```ts
  'src/runtime/application-runtime.test.ts',
  ```

- [ ] Rewrite the two stale passages of `apps/wbs/fe-01/src/modules/preferences/README.md` — the
      "Relationships" paragraph that says there is no `module.ts`, and the "Checks" paragraph — as
      section 8.11 gives them. A module whose README describes the composition it no longer has is a
      rule-R3 failure, not a tidying matter.

- [ ] Green, twice — the file, then the whole tier:

  Expected for the file: exit 0, `Test Files 1 passed (1)`, `Tests 6 passed (6)`. Then the sandbox
  unit command: exit 0, **F0 + 1** files, **T0 + 6** tests (F0/T0 being _this_ slice's baseline,
  which already contains slice 2's eight).

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0. Required here and not deferred:
      this slice is where `composition.ts` stops constructing its own values and starts reading
      them out of a DI Bag graph, and the resolved types are what must still satisfy every importer.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0.

- [ ] Run this slice's three negatives, N3, N4 and N5 from section 9, restoring between them, and
      append the observed diagnostics to `verify.md`.

Hand over: ` M apps/wbs/fe-01/src/modules/preferences/README.md`,
` M apps/wbs/fe-01/src/modules/preferences/composition.ts`,
`?? apps/wbs/fe-01/src/modules/preferences/module.ts`,
`?? apps/wbs/fe-01/src/runtime/application-runtime.test.ts`,
`?? apps/wbs/fe-01/src/runtime/application-runtime.ts`,
` M apps/wbs/fe-01/vitest.node-suites.ts`,
` M openspec/changes/adopt-frontend-lifetimes/verify.md`.

### Slice 4 — tick the change and hand over

Subject: `docs(fe-01): record the first three lifetime tasks as done`

- [ ] Tick tasks 1, 2 and 3 in `openspec/changes/adopt-frontend-lifetimes/tasks.md` — `- [x]` — and
      nothing else. Tasks 4 to 13 stay open and are the next packets' (section 12).

- [ ] Append a `## Slice 4` section to `verify.md` holding the failure-proof table of section 9 with
      **the diagnostics this attempt observed**, not the ones printed here, plus the commands and
      results of every slice. A check with no observed failure is not done.

- [ ] Re-validate: exit 0, `failed: 0`, `adopt-frontend-lifetimes` still `valid: true`.

- [ ] `GSETTINGS_BACKEND=memory bunx prettier --check` over every path this packet owns; then
      `NX_DAEMON=false bunx nx run wbs-fe-01:lint` and `…:typecheck` once more, both exit 0.

- [ ] Print the cumulative diff for review, **scoped to the paths this packet owns**, so that a
      revised packet file committed by the planner cannot change the answer:

  ```sh
  git diff --name-only <slice-1 base> -- apps/wbs/fe-01 openspec/changes/adopt-frontend-lifetimes
  ```

  Expected: the twelve paths of section 6, and nothing else.

## 8. The code, rehearsed

Every listing below is the post-Prettier text of a file that was written, run, type-checked, linted
and committed in the planner's worktree. Copy them exactly.

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

Validated as given: `valid: true`, no issues. Every `### Requirement:` carries a normative SHALL
sentence directly under it, and every scenario uses four hashtags with real WHEN and THEN bullets.

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
- [ ] 12. Each module has its own isolated type check and its graph check.
- [ ] 13. No infrastructure escapes a context: the architecture checks refuse a
      bag, credential, broad client, repository or resource in delivery.
```

### 8.4 `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`

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
 * `fatal` is terminal for this slot: a retirement that failed or outran its
 * budget refuses the replacement, so there is nothing live to publish and the
 * page may not pretend otherwise. The report is the sanitized public one — the
 * same sentence and occurrence handle the root fault path discloses — because a
 * cleanup failure is a disclosure boundary exactly as a render fault is.
 */
export type LifetimeState<S> =
  | { readonly status: 'empty' }
  | { readonly status: 'live'; readonly services: S }
  | { readonly status: 'retiring' }
  | { readonly status: 'fatal'; readonly fault: DisclosedFault };

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
   * Withdraw the current runtime, retire it, and publish the replacement **only
   * if that retirement succeeded**.
   *
   * @throws the retirement failure, with the slot left fatal and the
   * replacement never built. This is the transition gate: DI Bag's own React
   * recipe reports and continues, and this repository's R5 rule refuses.
   */
  readonly replace: (build: () => RetirableRuntime<S>) => Promise<S>;
  /** Withdraw and retire, leaving the slot empty on success and fatal on failure. */
  readonly retire: () => Promise<void>;
  /**
   * The disposal that outlived its bounded wait, for the caller that wants to
   * know how it ended. `null` until a bounded wait has expired.
   */
  readonly lateCleanup: () => Promise<void> | null;
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
 * Every trigger for the same current runtime joins **one** retirement promise:
 * a route unmount, a selection change and a page hide arriving together retire
 * once. Withdrawal is synchronous and happens before the close starts, so no
 * late completion of the old runtime can reach a reader through this slot.
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
  let retirement: Promise<void> | null = null;
  let late: Promise<void> | null = null;
  /** The refusal that made this slot fatal, kept so every later trigger refuses with it. */
  let refused: unknown = null;
  const listeners = new Set<() => void>();

  const publish = (next: LifetimeState<S>): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  /** Withdraws first, then waits out the bounded close; shared by every trigger. */
  const retireCurrent = async (): Promise<void> => {
    // Fatal is terminal: a slot whose required retirement failed refuses every
    // later transition with the same refusal rather than quietly starting over.
    // The boundary: `refused` is a value DI Bag already threw once, rethrown
    // unchanged so the caller sees the real cleanup failure rather than a
    // paraphrase of it. Nothing here constructs it, so its type is `unknown`.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (refused !== null) throw refused;
    if (retirement !== null) return retirement;
    const retiring = held;
    if (retiring === null) return;
    held = null;
    publish({ status: 'retiring' });
    retirement = (async () => {
      try {
        await retiring.close({ timeoutMs: budgetMs });
      } catch (refusal) {
        // Kept, not dropped: the wait ended and the disposal did not.
        late = lateCleanupOf(refusal);
        refused = refusal;
        // Observed so an eventual rejection is not unhandled, and never turned
        // into a resumption of the refused transition.
        if (late !== null) late.catch(() => undefined);
        publish({ status: 'fatal', fault: discloseFault(refusal) });
        throw refusal;
      } finally {
        retirement = null;
      }
    })();
    return retirement;
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
      await retireCurrent();
      const opened = build();
      held = opened;
      publish({ status: 'live', services: opened.services });
      return opened.services;
    },
    retire: async () => {
      await retireCurrent();
      if (state.status === 'retiring') publish({ status: 'empty' });
    },
    lateCleanup: () => late,
  };
}
```

### 8.5 `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts`

The faulty collaborators are **real DI Bag graphs** with a chosen disposer, not a hand-written
`close` that rejects: the refusals under test are `DiBagCleanupError` and
`DiBagCloseCancelledError`, and a stub would prove the gate against a shape the library never
produces.

```ts
import { DiBag } from 'di-bag';
import { describe, expect, it } from 'vitest';

import { createLifetimeSlot, type RetirableRuntime, RETIREMENT_BUDGET_MS } from './lifetime-slot';

/** What the tests publish: a name, so a snapshot says which runtime is current. */
interface NamedServices {
  readonly name: string;
}

/**
 * A runtime built the way production builds one — a DI Bag graph with one owned
 * resource — whose disposer this test chooses.
 *
 * Not a stub `close`: the refusals under test are DI Bag's own
 * `DiBagCleanupError` and `DiBagCloseCancelledError`, and a hand-written
 * rejection would prove the slot against a shape the library never produces.
 */
function runtimeNamed(name: string, dispose: () => Promise<void>): RetirableRuntime<NamedServices> {
  const bag = DiBag.createBuilder()
    .register({
      owned: DiBag.withDisposal(
        DiBag.fromSyncFactory((): NamedServices => ({ name })),
        dispose,
      ),
    })
    .build();
  const services = bag.resolve('owned');
  return { services, close: (options) => bag.close(options) };
}

const settles = (): Promise<void> => Promise.resolve();
const refuses = (): Promise<void> => Promise.reject(new Error('the disposer refused'));
const neverSettles = (): Promise<void> => new Promise<void>(() => undefined);

describe('one lifetime’s ownership', () => {
  it('publishes the runtime it opened', () => {
    const slot = createLifetimeSlot<NamedServices>();

    const services = slot.open(() => runtimeNamed('first', settles));

    expect(services.name).toBe('first');
    expect(slot.snapshot()).toEqual({ status: 'live', services });
  });

  it('refuses a second open, because nothing would be left holding the first close', () => {
    const slot = createLifetimeSlot<NamedServices>();
    slot.open(() => runtimeNamed('first', settles));

    expect(() => slot.open(() => runtimeNamed('second', settles))).toThrow(
      'a lifetime slot that is live cannot be opened again',
    );
  });

  it('withdraws the old runtime before its disposal starts, then publishes the replacement', async () => {
    const seen: string[] = [];
    const slot = createLifetimeSlot<NamedServices>();
    slot.subscribe(() => {
      seen.push(slot.snapshot().status);
    });
    slot.open(() => runtimeNamed('first', settles));

    const replaced = await slot.replace(() => runtimeNamed('second', settles));

    // The `open` above is the first entry: what matters is that `retiring` is
    // published before the replacement, so no reader can see two live runtimes.
    expect(seen).toEqual(['live', 'retiring', 'live']);
    expect(replaced.name).toBe('second');
    expect(slot.snapshot()).toEqual({ status: 'live', services: replaced });
  });

  it('joins one retirement for every trigger of the same runtime', async () => {
    let closes = 0;
    const slot = createLifetimeSlot<NamedServices>();
    slot.open(() =>
      runtimeNamed('first', async () => {
        closes += 1;
        await Promise.resolve();
      }),
    );

    await Promise.all([slot.retire(), slot.retire()]);

    expect(closes).toBe(1);
    expect(slot.snapshot()).toEqual({ status: 'empty' });
  });

  it('refuses the replacement when the required retirement fails, and says so sanitized', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    slot.open(() => runtimeNamed('first', refuses));
    let built = 0;

    await expect(
      slot.replace(() => {
        built += 1;
        return runtimeNamed('second', settles);
      }),
    ).rejects.toThrow('DI_BAG_CLEANUP_FAILED');

    expect(built).toBe(0);
    const fatal = slot.snapshot();
    expect(fatal.status).toBe('fatal');
    // The sanitized public report and nothing from the refusal itself: a cleanup
    // failure is a disclosure boundary exactly as a caught render fault is.
    expect(fatal.status === 'fatal' ? fatal.fault.sentence : '').not.toContain('DI_BAG');
    expect(fatal.status === 'fatal' ? fatal.fault.occurrenceId : '').not.toBe('');
  });

  it('refuses every later transition of a slot whose retirement failed', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    slot.open(() => runtimeNamed('first', refuses));
    await expect(slot.replace(() => runtimeNamed('second', settles))).rejects.toThrow(
      'DI_BAG_CLEANUP_FAILED',
    );

    await expect(slot.replace(() => runtimeNamed('third', settles))).rejects.toThrow(
      'DI_BAG_CLEANUP_FAILED',
    );

    expect(slot.snapshot().status).toBe('fatal');
  });

  it('fails the transition when the retirement outruns its budget, and keeps watching the disposal', async () => {
    // 50ms and not the production budget: the fault is the disposer that never
    // settles, and waiting the real five seconds for it proves nothing more.
    const slot = createLifetimeSlot<NamedServices>(50);
    slot.open(() => runtimeNamed('first', neverSettles));
    let built = 0;

    await expect(
      slot.replace(() => {
        built += 1;
        return runtimeNamed('second', settles);
      }),
    ).rejects.toThrow('DI_BAG_CLOSE_TIMEOUT');

    expect(built).toBe(0);
    expect(slot.snapshot().status).toBe('fatal');
    // A timeout is not cancellation: the disposal is still running, and the slot
    // still holds the promise that says how it ends.
    expect(slot.lateCleanup()).toBeInstanceOf(Promise);
  });

  it('gives production one deterministic budget', () => {
    // Named here because the number is a policy, not a tuning knob: a slot built
    // with no argument is what every lifetime in production gets.
    expect(RETIREMENT_BUDGET_MS).toBe(5_000);
  });
});
```

### 8.6 The two `vitest.node-suites.ts` entries

Slice 2 adds the second line, slice 3 the first, both with this comment, in the list's sorted
position before `'src/test-tiers.test.ts'`:

```ts
  // The page's own lifetime ownership: plain TypeScript over DI Bag, no browser
  // global and no component, which is the whole point of rule F1.
  'src/runtime/application-runtime.test.ts',
  'src/runtime/lifetime-slot.test.ts',
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

### 8.8 `apps/wbs/fe-01/src/runtime/application-runtime.ts`

```ts
import { DiBag } from 'di-bag';

import type { Preferences, RememberedPreferences } from '@/modules/preferences/contract';
import { preferencesModule } from '@/modules/preferences/module';

import { createLifetimeSlot, type LifetimeSlot, type RetirableRuntime } from './lifetime-slot';

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
export function buildApplicationRuntime(): RetirableRuntime<ApplicationServices> {
  const bag = DiBag.createBuilder().installModule(preferencesModule()).build();
  return {
    services: {
      preferences: bag.resolve('preferences'),
      rememberedPreferences: bag.resolve('rememberedPreferences'),
    },
    // Bounded by the caller: the slot passes its budget, and DI Bag goes on
    // disposing after that wait ends.
    close: (options) => bag.close(options),
  };
}

/**
 * Every binding of the page's graph, by the name a DI failure calls it.
 *
 * A production diagnostic and the module boundary's own evidence: a private
 * binding is named `<label>/<key>`, so `frontend.preferences/preferenceStore`
 * appearing here — and a bare `preferenceStore` not appearing — is what says the
 * browser store is reachable from inside its module and nowhere else.
 */
export function applicationGraphLabels(): readonly string[] {
  const bag = DiBag.createBuilder().installModule(preferencesModule()).build();
  return bag.inspectGraph().bindings.map((binding) => binding.label);
}

/**
 * The page's one application lifetime.
 *
 * Opened at module load, above every component and outside the Strict Mode
 * subtree, and retired through the slot: page hide, hot reload and the session
 * owner above it all join one retirement promise, and a retirement that fails or
 * outruns its budget leaves this slot fatal rather than publishing a second
 * graph beside the first.
 */
export const applicationLifetime: LifetimeSlot<ApplicationServices> =
  createLifetimeSlot<ApplicationServices>();

/** The live page services, published once by the page's own module load. */
export const applicationServices: ApplicationServices =
  applicationLifetime.open(buildApplicationRuntime);
```

### 8.9 `apps/wbs/fe-01/src/runtime/application-runtime.test.ts`

```ts
import { describe, expect, it } from 'vitest';

import {
  applicationGraphLabels,
  type ApplicationServices,
  buildApplicationRuntime,
} from './application-runtime';

/** What the production installer is allowed to hand back, spelled as a type. */
type PublishedKeys = keyof ApplicationServices;

describe('the page’s application runtime', () => {
  it('publishes its two services and hands out nothing else', () => {
    const runtime = buildApplicationRuntime();

    // The whole of the encapsulation claim, against the production installer's
    // own return value rather than a graph a test built: an extra key here is a
    // reachable bag, store or client, whatever its type says.
    expect(Object.keys(runtime).sort()).toEqual(['close', 'services']);
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
    const labels = applicationGraphLabels();

    // A DI failure names a private binding `<label>/<key>`, so this is the
    // message a reader of a broken graph would get.
    expect(labels).toContain('frontend.preferences/preferenceStore');
    expect(labels).not.toContain('preferenceStore');
  });

  it('keeps the two public services unlabelled by the module, because they are its exports', () => {
    expect(
      applicationGraphLabels()
        .filter((label) => !label.includes('/'))
        .sort(),
    ).toEqual(['preferences', 'rememberedPreferences']);
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
  });

  it('closes under the caller’s bounded wait', async () => {
    const runtime = buildApplicationRuntime();

    await expect(runtime.close({ timeoutMs: 100 })).resolves.toBeUndefined();
  });
});
```

### 8.10 `apps/wbs/fe-01/src/modules/preferences/composition.ts`, whole

```ts
import { applicationServices } from '@/runtime/application-runtime';

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

### 8.11 The two README passages

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

Five faults, each injected **alone**, each with the diagnostic the planner really observed on
2026-09-21/22. Copy the passing file to `$TMPDIR` first, save the mutation as a patch under
`$TMPDIR/evidence` with the batch README's exact `if diff …; then …; else test $? -eq 1; fi` form,
restore with `cp` and prove the restore with `cmp` **before** asserting on any captured status.
Never `rm` a scratch file. A proof succeeds when the **named** test fails; extra failures are
recorded, not a stop.

| #      | Fault, exactly                                                                                                                             | Named test that must fail                                                                      | Observed                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N1** | In `lifetime-slot.ts`, `replace`: wrap `await retireCurrent();` in `try { … } catch { }` — the upstream owner's report-and-continue policy | `refuses the replacement when the required retirement fails, and says so sanitized`            | `3 failed \| 5 passed (8)`; the named test: `AssertionError: promise resolved "{ name: 'second' }" instead of rejecting`. The timeout and later-transition cases fail with the same line, which is the point: one gate, three consequences. |
| **N2** | In `lifetime-slot.ts`, `retireCurrent`'s catch: delete the line `refused = refusal;`                                                       | `refuses every later transition of a slot whose retirement failed`                             | `1 failed \| 7 passed (8)`; `AssertionError: promise resolved "{ name: 'third' }" instead of rejecting`                                                                                                                                     |
| **N3** | In `lifetime-slot.ts`, `retireCurrent`'s catch: replace `late = lateCleanupOf(refusal);` with `late = null;`                               | `fails the transition when the retirement outruns its budget, and keeps watching the disposal` | `1 failed \| 7 passed (8)`; `AssertionError: expected null to be an instance of Promise`                                                                                                                                                    |
| **N4** | In `application-runtime.ts`, `buildApplicationRuntime`: add `bag,` as the first property of the returned object                            | `publishes its two services and hands out nothing else`                                        | `1 failed \| 5 passed (6)`; `AssertionError: expected [ 'bag', 'close', 'services' ] to deeply equal [ 'close', 'services' ]`                                                                                                               |
| **N5** | In `module.ts`, `buildModule`: delete the second argument `{ label: PREFERENCES_LABEL }`                                                   | `names the private browser store by its module label, and by no other name`                    | `2 failed \| 4 passed (6)`; the named test: `AssertionError: expected [ 'rememberedPreferences', …(2) ] to include 'frontend.preferences/preferenceStore'`. The exports-are-unlabelled test fails too, and both are recorded.               |

**N6, the label inside a real DI failure.** The label proof above reads `inspectGraph()`, which is
what a production diagnostic can call. To watch the label in a thrown message, break the private
binding's own edge: in `module.ts`, replace the `preferenceStore` registration with

```ts
      preferenceStore: DiBag.fromSyncFactory(
        ({ absentStore }: { absentStore: BrowserStorage }): BrowserStorage => absentStore,
      ),
```

Observed: the whole test file fails to collect — `Tests no tests` — on

```text
Error: DI_BAG_MISSING_DEPENDENCY: Cannot resolve "frontend.preferences/preferenceStore": dependency "absentStore" is not registered. Resolution path: preferences -> frontend.preferences/preferenceStore -> absentStore.
```

Record that message. Breaking a **public** binding's edge the same way prints only
`Cannot resolve "preferences"`, with no label, which is why the label is worth setting and why the
private binding is the one the proof names.

Each fault gets an adjacent dated `Proof:` comment on the line it was injected into, naming the
fault and the observed test — the format `apps/wbs/be-01/src/boot.ts:94` uses. Those comments are
part of the slice's diff and are in its hand-over list.

## 10. Verification

### The executor runs, per slice

| Command                                                                                         | Expected                                                |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| the sandbox unit command of step 0                                                              | exit 0, F0/T0 recorded, then the slice's relative delta |
| `(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts <the slice's test file>)` | exit 0 after the implementation; the red before it      |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                               | exit 0                                                  |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                                    | exit 0 (autofix import order with `bunx eslint --fix`)  |
| `GSETTINGS_BACKEND=memory bunx prettier --check <the slice's files>`                            | exit 0                                                  |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`                   | slices 1 and 4: exit 0, `failed: 0`, V0 + 1 items       |

Keep the status of every command (`cmd > log 2>&1; echo "exit=$?"`). Do not read a status through a
`tee` or through a pipeline: under `pipefail` Bash reports the rightmost status, so a filter that
matches nothing on failure reads as a pass.

### Planner-only, with the values the planner observed on this tree

| Command                                                                                                                                                                                        | Observed                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1` in `apps/wbs/fe-01` (the jsdom tier)                                                                                             | exit 0, `123 passed (123)` files, `2910 passed (2910)` tests                                                                                                                                                                                                                                                                                                                             |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                                | exit 0, `366 pass`, `0 fail` — no inventory or digest pin moved                                                                                                                                                                                                                                                                                                                          |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test`                                                                                                                                           | 19m 14s, exit 1 on `finite evidence artifact validation production CLI > rejects missing dependency identities, self obligations and cycles without timing out [5030.05ms]` — Bun's 5000 ms default, overrun by 30 ms while the jsdom tier and a Chromium lane shared the host, and **Nx itself reported the task flaky**. It reads no fe-01 source. Rerun it alone; see the note below. |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                  | pending planner verification; `typecheck` passed over the same graph                                                                                                                                                                                                                                                                                                                     |
| `CI=1 E2E_PORT_SHIFT=2400 NX_DAEMON=false bunx nx run wbs-fe-01:e2e -- apps/wbs/fe-01/e2e/dark-mode.spec.ts apps/wbs/fe-01/e2e/gantt-detail.spec.ts apps/wbs/fe-01/e2e/project-picker.spec.ts` | exit 0, `21 passed (1.2m)` — the three preference-driven lanes: theme, chart detail, remembered project                                                                                                                                                                                                                                                                                  |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                     | the planner's, after the last slice                                                                                                                                                                                                                                                                                                                                                      |

Chromium is the planner's: the executor has no browser. Pick `E2E_PORT_SHIFT` as a multiple of 300
away from every other live run and check the three ports (`+0`, `+100`, `+1100` from 3100/3200/4200)
with `ss -ltn` first; never kill a process you cannot prove is yours.

**The Burokrat suite's 5-second tests are load-sensitive, and that is not this packet's either.**
`apps/wiki/cli` has CLI-spawning tests at Bun's 5000 ms default; the planner watched one exceed it
by 30 ms under concurrent load and Nx mark the task flaky. Run `twilight-burokrat:test` with no
other heavy target on the host, record the result, and rerun once on exactly that failure. Do not
edit that test: giving it headroom is its own change.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails in a planner run,
record it and rerun once; it failed a host gate on 2026-09-21 for its own reason. Do not edit it or
any other unrelated test.

## 11. Stop conditions

Each is scoped to the slice that reads it, and each is **false** on that slice's real starting tree.

Before slice 1:

- `openspec/changes/adopt-frontend-lifetimes/` exists. (It does not on `40be90d3`.)

Before slice 2:

- `apps/wbs/fe-01/src/runtime/` exists, or `apps/wbs/fe-01/src/modules/preferences/module.ts` exists.
- `openspec/changes/adopt-frontend-lifetimes/proposal.md` does **not** exist — slice 1's commit is
  missing, so this slice was dispatched on the wrong base.

Before slice 3:

- `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` does **not** exist, or
  `apps/wbs/fe-01/src/modules/preferences/module.ts` already does.
- `apps/wbs/fe-01/src/modules/preferences/composition.ts` does not contain the exported name
  `browserPreferences`, or `apps/wbs/fe-01/src/lib/remembered.ts` no longer imports it: a neighbour
  has moved the very seam this slice preserves.

In any slice:

- `bunx eslint` reports an error that is not `simple-import-sort/imports` or a Prettier complaint
  and the packet does not name it.
- a negative proof leaves its **named** test passing. That is first a location mistake: restore,
  check the location, redo once, and stop if it happens again.
- any command wants the network, or any file outside section 6 needs changing.

## 12. The next 050.7 packets, in order

Each one is a packet of its own, ticking tasks of the same change.

1. **050-7-b, the bootstrap and the fatal state.** Move the application runtime's opening into a
   `bootstrap()` function in `main.tsx`, before `createRoot` and outside `<StrictMode>`; publish the
   two services through one application context; render the sanitized fatal state from the slot's
   `fatal` status. Ticks task 4. Owns `main.tsx`, `main.test.tsx`, a new provider, and the fatal
   view. Its hazard is `main.test.tsx`'s single `await import('./main')` assertion.
2. **050-7-c, page hide, hot reload and restoration.** `pagehide`, `import.meta.hot.dispose` and a
   persisted `pageshow` joining one retirement; rebuild only after it succeeds; the address
   preserved. Ticks task 5. Map tests 2 and 3.
3. **050-7-d, the session runtime.** Keyed on `session.user.id`, installing
   `module.frontend.directory-management`; the router instance and address unchanged. Ticks task 6.
4. **050-7-e, Log out as a coordinated local exit.** No request, project then session retirement,
   the fatal state when either fails. Ticks task 7. Needs 050-7-d and the project owner.
5. **050-7-f and 050-7-g, the project prerequisites.** The plan snapshot, connection, roster and
   busy state into project-owned stores; the command register and refusal publication behind narrow
   ports; then the broad `ProjectApi` behind the plan and command modules' private repository ports.
   Ticks tasks 8 and 9. This is the map's blocking work and the largest of the remainder.
6. **050-7-h, the project runtime.** Feed, writer, markers and saved plans for one selected project,
   replacing the per-effect ownership under `WbsTable`; switch, unmount and Strict Mode re-entry.
   Ticks tasks 10 and 11.
7. **050-7-i, the boundary checks.** Per-module isolated type checks and the architecture checks
   that refuse a bag, credential, broad client, repository or resource in delivery. Ticks 12 and 13.

## 13. Assumptions recorded rather than asked

- **The change is named `adopt-frontend-lifetimes`.** The adoption tail map names
  `adopt-di-composition` for the _backend_ DI work (MCP and gateway, its executable order item 1),
  and batch 6's sibling packet 040-6-a opens that change. Two packets opening one change would
  collide, and the frontend's requirements are not the backend's, so the frontend gets its own
  change under the name the batch task gave as the fallback.
- **The retirement budget is 5000 ms for every lifetime.** One number, named as
  `RETIREMENT_BUDGET_MS`, because the map calls the budget a routine implementation choice; no
  lifetime is given a different one until one is measured to need it. The proof injects a
  never-settling disposer and uses a 50 ms budget so the test does not sit for five seconds.
- **`preferences` stays a public export of the module.** One caller needs the resource
  (`lib/remembered.ts` for the layout module's per-project stores). Recorded as preserved rule-K2
  debt in the README and in task 12, not taught as a pattern. The **repository** is private, and
  that is what the encapsulation proof is about.
- **The application runtime is opened at module load, not in `bootstrap()`.** `build()` is lazy in
  DI Bag and the resolve calls are the construction, so module scope is above every component and
  outside the Strict Mode subtree — the two properties the map asks for — while keeping delivery's
  existing imports valid. 050-7-b moves the opening into the bootstrap function when the React root
  becomes the same slice's business.
- **The fatal state is published, not rendered, in this packet.** The map requires the sanitized
  fatal state; rendering it needs the provider and the root, which are 050-7-b's files. The slot
  publishes `{ status: 'fatal', fault }` and a test asserts the sanitized sentence and occurrence
  handle, so the behaviour is proved before anything draws it.
- **No `check.ts` and no per-module `tsconfig.json`.** The design's module layout lists both, and no
  frontend module has either today. Introducing them for one module while five have none is a
  repository-wide decision; it is task 12 of the change.

## 14. Disposition of the defect classes the 040.6 review found

| Defect class in `040-6-a…review1`                       | How this packet avoids it                                                                                                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop conditions that halt the packet's own later slices | Section 11 is per-slice: creation is forbidden _before_ its slice and required _after_ it.                                                                                                      |
| A command needing network under the default dispatch    | Section 7 states no slice needs `--network`, and nothing here listens, dials or downloads; the OpenSpec command is warmed by the launcher.                                                      |
| An encapsulation proof that builds its own host         | N4 and the two surface tests run against `buildApplicationRuntime()`, the production installer, and the injected leak is the exact `bag`-in-the-return-value mutation.                          |
| Implementation before tests                             | Slices 2 and 3 each write the test, run it, record the observed red, then write the implementation, inside one commit.                                                                          |
| Recorded negatives that do not match the supplied tests | Every row of section 9 was injected alone against these listings, and its counts and diagnostics are the run's own output, including the two faults that fail two tests.                        |
| A handoff the prescribed workflow cannot produce        | Each slice's hand-over lists the paths _that slice_ changes, as `--untracked-files=all` prints them, and section 7's slice 4 uses a recorded-base `git diff --name-only` scoped to owned paths. |
| OpenSpec files created by hand                          | Slice 1 runs `openspec new change … --schema sdd-lean` first and expects exactly `.openspec.yaml` from it; `.openspec.yaml` is in the file plan and the hand-over.                              |
