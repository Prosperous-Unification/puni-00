# 050.7a The frontend's lifetime owner, held to a model

|                     |                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item           | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **first packet of several**                                                               |
| Size class          | M                                                                                                                                                                                    |
| Design              | **[The frontend lifetime slot: states, events, invariants](050-7-lifetime-slot-design.md)** — read it first; this packet executes it                                                 |
| Design it serves    | [Code organization design](../../specs/2026-09-19-code-organization-design.md): the three-lifetimes table, rules F1 and F2                                                           |
| Reviewed source map | [050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md)                                                                                                  |
| Library research    | [DI Bag 0.4.0 React lifecycle guarantees](../../../research/2026-09-21-di-bag-0-4-lifecycle.md)                                                                                      |
| Execution contract  | [batch 1 README](../2026-09-19-batch-1/README.md): "Execution contract", "Rules for every executor", "Standard blocks every packet uses", "Hidden constraints every frontend packet" |
| Planning head       | `40be90d3` (`origin/main`, the Burokrat rename merged)                                                                                                                               |
| Revision            | fourth. Three review rounds each found a new race; section 17 says what changed in method, and sections 15 to 17 disposition every finding.                                          |

## 1. Goal and non-goals

**Goal.** Land the design document's owner, and nothing else. Two things:

1. **`openspec/changes/adopt-frontend-lifetimes`**, covering the whole of 050.7's target shape, so
   later packets tick a task instead of opening a change.
2. **`apps/wbs/fe-01/src/runtime/lifetime-slot.ts`**: the five-state, single-queue owner of
   [the design document](050-7-lifetime-slot-design.md) — synchronous withdrawal, deferred
   notification so no subscriber ever runs inside a transition, the generation rechecked after the
   disposal **and** after the factory, a transactional construction that gives back what it acquired,
   and a disposal failure or bounded-wait expiry that refuses the replacement and is terminal. Proved
   by 24 named example tests **and** a model-based `fast-check` test whose teeth are shown by six
   sabotage runs.

**Non-goals**: no library version change (`di-bag` stays `0.4.0`); no DI module, installer or
page-level runtime; no `composition.ts` or README edit; no React at all; no session or project
runtime; nothing reachable from the running page — which is why the whole proof runs in the DOM-free
tier in under half a second.

## 2. Why this shape, and why a model test

Three rounds of review found three races, each between two steps of a transition: two same-tick
replacements abandoning a runtime; a replacement arriving _during_ a disposal and passing a fence
checked only before it; and a subscriber invoked synchronously by a state change, requesting another
replacement before the factory ran. The design document has the table.

Hand-written scenarios kept missing the next interval, so the ownership rule is written down and a
**model-based** test generates the interleavings, re-entrant requests included. Rehearsed against the
implementation the previous revision shipped, it fails on its second case:

```text
Counterexample: [schedulerFor()`
`,[{"kind":"settle"},{"kind":"replace","disposal":"settles","partial":false,"reentry":"listener"}]]
Shrunk 2 time(s)
Caused by: AssertionError: r1: 1 acquisitions, 0 close attempts, live=r2: expected +0 to be 1
```

That is round 3's Critical 1 — a runtime built and never closed, from a listener's re-entrant request —
found in 250 ms by a test nobody had to imagine.

## 3. Read first

1. [The lifetime slot design](050-7-lifetime-slot-design.md), whole. It is 165 lines and it is the
   contract.
2. `AGENTS.md` (rules R1 to R5) and `LLM_README.md`.
3. The execution contract sections of the [batch 1 README](../2026-09-19-batch-1/README.md).
4. [DI Bag 0.4.0 React lifecycle guarantees](../../../research/2026-09-21-di-bag-0-4-lifecycle.md),
   "Durable implementation requirements" 1 to 5.
5. `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`, the sanitized reporting this owner reuses.

## 4. Verified facts

Every claim below was read or run in a worktree off `40be90d3`. Line numbers are that tree's.

### 4.1 What DI Bag 0.4.0 actually does with a failure

Probed with `bun` against the installed `node_modules/di-bag` (`0.4.0`, pinned in
`tools/tool-devsync/src/toolchain-pins.test.ts:506`):

- a rejecting disposer makes `close()` reject with `DiBagCleanupError`:
  `DI_BAG_CLEANUP_FAILED: Failed to run 1 disposal callback(s);`
- a never-settling disposer under `close({ timeoutMs: 50 })` rejects with
  `DiBagCloseCancelledError`: `DI_BAG_CLOSE_TIMEOUT: Bag close timed out after 50ms; disposers still running: r;`
  whose `details` is `{"operation":"close","reason":"timeout","timeoutMs":50,"pending":["r"],"acquiring":[]}`
  and whose `cleanupPromise` is the shared shutdown. A disposer that settles after that rejection
  resolves it; one that rejects late rejects it with `DiBagCleanupError`. Both are exercised.
- **a partially acquired graph is released only by `close()` on its own bag.** Measured twice: after
  `bag.resolve('a')` succeeded and `bag.resolve('b')` threw, recorded disposals were `[]` and only
  `bag.close()` produced `["a"]`; and a factory that called `factoryCtx.pushDisposer(…)` and then threw
  left that disposer unrun until `bag.close()` — `[]` at the throw, `["pushed-first"]` after the close.
  `pushDisposer` needs `{ context: 'acquisition' }` as `fromSyncFactory`'s second argument, as
  `apps/wbs/be-01/src/boot.ts:201` uses it. That is why `PartialAcquisitionError` exists.
- `build()` and `resolve()` are **synchronous** for sync factories. `apps/wbs/be-01/src/boot.ts:89`
  awaits only because that graph has async work.

### 4.2 The frontend as it stands, and what this packet does not touch

- `apps/wbs/fe-01/src/modules/` holds six module directories and no `module.ts`. This packet adds no
  module and changes none of them.
- **`di-bag` and not `di-bag/node`**: `apps/wbs/fe-01/browser-packages.test.ts:48` and
  `e2e/browser-packages.spec.ts:50` carry observed proofs that the node entrypoint breaks the browser
  bundle. The slot imports `DiBagCloseCancelledError` from `di-bag`; its tests import `DiBag` from the
  same entrypoint.
- `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts` exports `discloseFault(thrown)` and
  `DisclosedFault` and imports `@shared/failures` and **no React**, so this owner may reuse it: the
  map's requirement that the lifecycle-failure boundary use the root fault path's sanitized reporting
  is met by calling it rather than by a second policy.
- `fast-check` is a root devDependency at `package.json:103` (`"fast-check": "^4.9.0"`, installed
  `4.9.0`); this packet adds no dependency. Two of its scheduler methods are **deprecated** and
  `wbs-fe-01:lint` refuses both (`@typescript-eslint/no-deprecated`, observed): `waitAll()` — use
  `waitIdle()` — and `waitOne()` — use `waitNext(1)`. The listings use the replacements.
- `apps/wbs/fe-01/src/test-tiers.test.ts:60` declares `DOM_EVIDENCE`, and it reads a test file that
  merely writes `document`, `window`, `location` or `localStorage` as needing a browser. Both new test
  files avoid those words and belong in the node tier.

### 4.3 How the node tier selects files, and what a red looks like here

`apps/wbs/fe-01/vitest.node.config.ts` sets `include: [...NODE_SUITES]`. A path on the command line is
a **filter applied after** that list, not an override: with the file absent from `NODE_SUITES`,
`bunx vitest run --config vitest.node.config.ts src/runtime/lifetime-slot.test.ts` prints
`No test files found, exiting with code 1`. Observed. So slice 2 adds both suite entries in the same
step as the test files, before any red run.

A red here is not a missing-module collection error: slice 2 writes the tests, their suite entries and
a **skeleton whose factory throws**, so the red selects every test it is about and fails on one
message. The skeleton's message carries no budget number, deliberately — tests that build a 50 ms slot
would otherwise produce a second diagnostic and an executor stop. Observed red: `Test Files 2 failed (2)`,
`Tests 25 failed (25)`, every one on `Error: the lifetime slot is not implemented`.

### 4.4 Targets, tiers and the sandbox

- fe-01 has `test`, `test:unit`, `lint`, `lint:fast`, `typecheck`, `build`, `e2e`, `e2e-packaged`, and
  **no** `lint:source`.
- **The executor never runs `wbs-fe-01:test:unit` or `wbs-fe-01:test` through Nx**: three of their
  tests spawn `bun` from Node and the sandbox refuses with `spawnSync bun EPERM`. It runs the sandbox
  unit command of step 0 instead.
- **`bun test <dir>` is a filter, not a path**: from the repository root it also collects the compiled
  copies a typecheck leaves under `dist/out-tsc/<dir>`. This packet prescribes no `bun test`, and its
  vitest commands were re-rehearsed after `wbs-fe-01:typecheck` had written
  `dist/out-tsc/apps/wbs/fe-01/*.test.js` into the same worktree: the tier selected exactly the same
  files and tests, because `include` is the explicit `NODE_SUITES` list and `dist` is outside it.
- The whole jsdom tier, the zoned tier, `wbs-fe-01:build`, `tool-devsync:test`,
  `twilight-burokrat:test` and every Chromium run are **planner-only**, with observed values in
  section 10.

### 4.5 The model test is deterministic, and fast

`{ seed: 20260923, numRuns: 300 }` is pinned, so the executor walks the interleavings the planner did.
Measured: the two runtime suites together run in **455 ms**; the model test's own file is about 350 ms.
Installed fast-check sets `endOnFailure` only when it is passed as `true`
(`node_modules/fast-check/lib/fast-check.js:1460`), and this packet does not pass it, so **shrinking is
on** — which is what produces the counterexamples in sections 2 and 9. The `endOnFailure: true` in a
failure message is fast-check printing how to reproduce that exact case, not what the run used.

### 4.6 The rehearsal, and its numbers

| What                                    | Observed                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Sandbox unit command, before any change | `42 passed (42)` files, `614 passed (614)` tests, exit 0                      |
| Sandbox unit command, after both slices | `44 passed (44)` files, `639 passed (639)` tests, exit 0                      |
| The two new suites together             | `2 passed (2)` files, `25 passed (25)` tests, 455 ms                          |
| The skeleton red                        | exit 1, `Tests 25 failed (25)`, all on `the lifetime slot is not implemented` |
| `wbs-fe-01:typecheck`                   | exit 0 — and exit 0 under every mutation in section 9                         |
| `wbs-fe-01:lint`                        | exit 0                                                                        |
| Six sabotages of the model test         | each fails; section 9.1 has the counterexamples                               |
| Eight per-check mutations               | each fails its named test; section 9.2                                        |
| `openspec validate --all --json`        | exit 0, `113` items, `113` passed, `0` failed; this change `valid: true`      |
| Two real `git commit`s with lefthook on | exit 0 each                                                                   |

Absolute numbers are orientation only: every expectation in section 7 is relative to the baseline that
slice records itself.

### 4.7 Pins, kinds and the wiki index

`tool-devsync:test` passed with the new files committed (`366 pass`, `0 fail`). This packet adds no
project, target or CI path, so `apps/wiki/cli/src/policy/pilot-policy.test.ts` — which reads the
repository at `HEAD` through git — has nothing to disagree with. `docs/code-organization/kinds.json`
gains nothing: `tools/tool-devsync/src/service-kinds.ts:15` limits `SERVICE_ROOTS` to three backend and
library directories, and `src/runtime/` is outside all three.

**The wiki module index belongs to the packet that creates a module.** Nine READMEs carry a
`<!-- module-index … -->` comment today, none under `apps/wbs/fe-01`, and this packet adds no module
directory. `checkIndexes` (`apps/wiki/cli/src/indexes/check-indexes.ts:409`) reads the index comment and
the candidate's own entries and loads **no** mapping; `apps/wiki/cli/src/policy/trust.ts:1248` requires
a `docs/wiki-policy/modules.json` mapping only for an index whose membership matches a _selected pilot
boundary_, its Proof comment naming `docs/findings` as one that stays outside; and
`apps/wiki/cli/src/rules/kinds.ts:137` checks a validated README index plus a `contract.ts`. An earlier
revision claimed an index needs a pilot mapping, and claimed the frontend's CSS import blocks the
extractor — `apps/wiki/cli/src/relationships/typescript.ts:401` classifies a compiler-supported ambient
import as `ambient-non-code`. **Both claims are withdrawn**, here and in task 12. Section 12 assigns
the index to 050-7-b with the checker command.

`bin/tool-wiki-lint.sh:21` prints `{"schemaVersion":1,"status":"inactive",…}` and exits 0 when
`TOOL_WIKI_ACTIVATION_ROOT` names nothing and `TOOL_WIKI_REQUIRE_CERTIFIED` is `0` (its default); with
that variable `1`, the same state exits 78 (`bin/tool-wiki-lint.sh:19`). A `tool-wiki` tick on a local
commit therefore means the launcher refused nothing, not that a validator ran.

## 5. The shape

[The design document](050-7-lifetime-slot-design.md) is the contract: five states, the event list, the
eight invariants, and the two decisions — **notify from a microtask so no subscriber runs inside a
transition**, and **recheck the generation after the disposal and after the factory**. Read it before
the listings. What the packet adds is the exact code, the model test and the proofs.

Two consequences worth stating twice, because they change the interface:

- **There is no `open`.** A lifetime's first runtime is a `replace` on an empty slot, awaited like any
  other, so initial acquisition is bounded, queued and transactional. An `open` beside the queue was
  how an initial partial acquisition leaked and how a queued replacement overwrote a live runtime.
- **A service value is never a sentinel.** The queued request is a tagged union and so is the
  transition's outcome (`{ kind: 'retired' } | { kind: 'published'; services: S }`), so `S` needs no
  constraint and `createLifetimeSlot<null>()` behaves — there is a test.

## 6. File plan

The design document is **already committed** by the planner and is not the executor's to write.

| Path                                                                               | Slice | Create or modify | Note                                            |
| ---------------------------------------------------------------------------------- | ----- | ---------------- | ----------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/.openspec.yaml`                         | 1     | created by CLI   | written by `openspec new change`, never by hand |
| `openspec/changes/adopt-frontend-lifetimes/proposal.md`                            | 1     | create           | 393 words, section 8.1                          |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` | 1     | create           | six requirements, each with a normative SHALL   |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                               | 1     | create           | 13 tasks; this packet ticks task 1              |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                              | 1–4   | create, append   | **every slice appends its own observations**    |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`                                      | 2     | create           | the state machine                               |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts`                                 | 2     | create           | 24 named tests                                  |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts`                           | 2     | create           | the model-based `fast-check` test               |
| `apps/wbs/fe-01/vitest.node-suites.ts`                                             | 2     | modify           | the two new entries, together                   |

**Nine paths.** Nothing else — no module, no installer, no component, no `main.tsx`, no manifest, no
`docs/wiki-policy/`.

## 7. Slices

Four slices. Each is one attempt, ends in one planner commit with the exact subject given, begins with
its own step 0, and **appends its own observations to `verify.md` before handing over**.

**Dispatch.** The launcher is `/home/df/wd/puni/puni-plan/exec/run-executor.sh`:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-7-a-frontend-lifetimes-first <slice> <base> \
  --batch batch-6 --preserve evidence
```

**No `--network`** is needed by any slice. Slice 4 is dispatched with `--seed <each earlier slice's
preserved evidence directory>`, which the launcher merges into `$TMPDIR/evidence`. Every log goes to
`$TMPDIR/evidence` with a slice-specific name; `verify.md` references basenames only, never an absolute
clone, home or temporary path, because it is published.

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

- [ ] In slices 1 and 4 only, record the OpenSpec baseline and call `summary.totals.items` **V0**:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
    > "$TMPDIR/evidence/slice<N>-step0-openspec.json" 2>&1; echo "exit=$?"
  ```

### Slice 1 — the change, opened by the tool

Subject: `feat(fe-01): open the frontend lifetimes change`

Pre-edit check: `openspec/changes/adopt-frontend-lifetimes/` does not exist.

- [ ] Create the change **with the CLI**, never by hand:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change adopt-frontend-lifetimes \
    --schema sdd-lean > "$TMPDIR/evidence/slice1-openspec-new.log" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0, `Created change 'adopt-frontend-lifetimes' at openspec/changes/adopt-frontend-lifetimes/`,
  and exactly one file created: `.openspec.yaml`.

- [ ] Write `proposal.md`, `specs/adopt-frontend-lifetimes/spec.md` and `tasks.md` **exactly** as
      sections 8.1, 8.2 and 8.3 give them, then `verify.md` with a `## Slice 1` heading holding this
      slice's commands and results.

- [ ] Validate:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
    > "$TMPDIR/evidence/slice1-openspec-after.json" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0; `summary.totals.failed` is `0`; `summary.totals.items` is **V0 + 1**; the entry
  whose `id` is `adopt-frontend-lifetimes` has `"valid": true` and `"issues": []`. Read those fields
  out of the JSON.

- [ ] `GSETTINGS_BACKEND=memory bunx prettier --check openspec/changes/adopt-frontend-lifetimes`.

Hand over, **five** paths: `.openspec.yaml`, `proposal.md`,
`specs/adopt-frontend-lifetimes/spec.md`, `tasks.md`, `verify.md`, all `??` under
`openspec/changes/adopt-frontend-lifetimes/`. `F0`/`T0` unchanged by this slice.

### Slice 2 — the state machine, red then green

Subject: `feat(fe-01): own one lifetime as a serialized state machine`

Pre-edit check: `apps/wbs/fe-01/src/runtime/` does not exist, and
`openspec/changes/adopt-frontend-lifetimes/proposal.md` does.

- [ ] **Read [the design document](050-7-lifetime-slot-design.md) first.** The listings implement it;
      a change that contradicts it is a stop, not a judgement call.

- [ ] Write, in one step and before any run: `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts` exactly
      as section 8.4; `apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts` exactly as section 8.5;
      the **skeleton** `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` exactly as section 8.6; and both
      entries in `apps/wbs/fe-01/vitest.node-suites.ts`, in the list's sorted position between
      `src/modules/preferences/preferences.resource.test.ts` and `src/test-tiers.test.ts`:

  ```ts
  // The page's own lifetime ownership: plain TypeScript over DI Bag, no browser
  // global and no component, which is the whole point of rule F1.
  'src/runtime/lifetime-slot.model.test.ts',
  'src/runtime/lifetime-slot.test.ts',
  ```

- [ ] Run the red and record it:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/runtime) \
    > "$TMPDIR/evidence/slice2-red.log" 2>&1; echo "exit=$?"
  ```

  Expected, observed by the planner: exit 1, `Test Files 2 failed (2)`, **`Tests 25 failed (25)`**,
  every one on `Error: the lifetime slot is not implemented`. `No test files found` means the suite
  entries are missing; `Tests no tests` means the skeleton is missing. Either is a stop, not a red.

- [ ] Replace the skeleton's body with section 8.7. Keep its one `eslint-disable` comment, inside
      `refuse`, together with the comment above it that names the boundary: a value DI Bag already
      threw is rethrown unchanged. Keep the `refusalSoFar()` accessor too, whose JSDoc says why the
      terminal check is not the impossible condition the linter would otherwise read it as.

- [ ] Green, twice — the directory, then the whole tier. Expected for the directory: exit 0,
      `Test Files 2 passed (2)`, `Tests 25 passed (25)`, about 450 ms. Then the sandbox unit command:
      exit 0, **F0 + 2** files and **T0 + 25** tests.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0. Required here: the interface is a
      generic whose members are readonly function-valued properties, and the scheduler's callbacks are
      where the planner's drafts failed twice, both times `TS2345`: once on a `then` callback returning
      a union of promises, and once on a disposal-mode parameter inferred as `never`.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0. Import order is autofixable with
      `bunx eslint --fix apps/wbs/fe-01/src/runtime`; the deprecated `waitAll`/`waitOne` are not, and
      the listings already use `waitIdle`/`waitNext(1)`.

- [ ] Append this slice's observations to `verify.md` under `## Slice 2`.

Hand over, **five** paths:

```text
?? apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
?? apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts
?? apps/wbs/fe-01/src/runtime/lifetime-slot.ts
 M apps/wbs/fe-01/vitest.node-suites.ts
 M openspec/changes/adopt-frontend-lifetimes/verify.md
```

### Slice 3 — the sabotages and the per-check mutations

Subject: `test(fe-01): prove the lifetime owner's checks and its model test`

Pre-edit check: `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` exists and the directory is green.

- [ ] Run the **six sabotages** of section 9.1 first: they are what says the model test has teeth. Each
      must fail; a sabotage that leaves the suite green is a stop.

- [ ] Then the **eight per-check mutations** of section 9.2, each alone.

- [ ] For every one: copy the passing file to `$TMPDIR`, inject, run
      `(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/runtime)`, run
      `wbs-fe-01:typecheck` (every mutation here compiles — a mutation that does not is a stop), record
      the counts and the named test's diagnostic, restore with `cp`, and prove the restore with `cmp`
      before asserting on any captured status. Save each patch with the block in section 9.

- [ ] Write each mutation's adjacent dated `Proof:` comment into `lifetime-slot.ts`, naming the fault
      and the observed test — the format `apps/wbs/be-01/src/boot.ts:94` uses.

- [ ] Green again after the comments; `wbs-fe-01:lint` and `wbs-fe-01:typecheck` exit 0; append
      everything to `verify.md` under `## Slice 3`.

Hand over, two paths: ` M apps/wbs/fe-01/src/runtime/lifetime-slot.ts` and
` M openspec/changes/adopt-frontend-lifetimes/verify.md`.

### Slice 4 — tick the change and hand over

Subject: `docs(fe-01): record the lifetime owner as done`

Dispatched with `--seed` for each earlier slice's preserved evidence directory.

- [ ] Tick **task 1** in `tasks.md` — `- [x]` — and nothing else.

- [ ] Append `## Slice 4` to `verify.md`: the failure-proof tables of section 9 with the diagnostics
      **the earlier attempts observed**, each row naming the attempt and the evidence basename. Do not
      claim any proof ran in this slice.

- [ ] Re-validate: exit 0, `failed: 0`, this change still `valid: true`, and `summary.totals.items`
      equal to **this slice's own V0** — ticking a checkbox adds no item.

- [ ] `prettier --check` every owned path; `wbs-fe-01:lint` and `wbs-fe-01:typecheck` exit 0.

- [ ] Print the cumulative diff, scoped to the paths this packet owns:

  ```sh
  git diff --name-only <slice-1 base> -- apps/wbs/fe-01 openspec/changes/adopt-frontend-lifetimes
  ```

  Expected: the nine paths of section 6, and nothing else.

Hand over: ` M openspec/changes/adopt-frontend-lifetimes/tasks.md` and
` M openspec/changes/adopt-frontend-lifetimes/verify.md`.

## 8. The code, rehearsed

Every listing is the post-Prettier text of a file that was written, run, type-checked, linted and
committed in the planner's worktree.

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

Six requirements, validated as given: `valid: true`, no issues.

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
transition that overtook it. A request's generation SHALL be rechecked after
every asynchronous step of its transition, not only when it is accepted. When a
replacement's construction fails after its retirement succeeded, the owner SHALL
release everything that construction acquired, publish the sanitized fatal state,
hold no runtime, and remain able to build again — unlike a failed retirement, or
a release that itself fails or outruns its wait, either of which is terminal.

#### Scenario: Two replacements are requested in one tick

- **WHEN** two replacements of the same lifetime are requested before either has
  run
- **THEN** exactly one runtime is live afterwards, the superseded request never
  built one, and every runtime that was built other than the live one has been
  retired

#### Scenario: A newer request arrives while the old runtime is being disposed

- **WHEN** a replacement is requested while the disposal started by an earlier
  replacement has not finished
- **THEN** the earlier request builds nothing, is refused as superseded, and only
  the newer request's runtime is published

#### Scenario: A construction acquires something and then fails

- **WHEN** a construction acquires a resource and then throws
- **THEN** everything it acquired is released before the fatal state is
  published, and if that release rejects or outruns its wait the lifetime becomes
  terminal

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

- [ ] 1. The lifetime slot owns one runtime as a serialized state machine: withdrawal
      is synchronous, the request's generation is rechecked after every await, a
      superseded request acquires nothing, a construction that fails releases what it
      acquired, and a failed or timed-out disposal refuses replacement and is terminal.
      Proves: the named example tests, plus a `fast-check` scheduler property over
      generated interleavings. Negatives: each fence removed; the upstream
      report-and-continue policy; the retained late-cleanup promise dropped.
- [ ] 2. The preferences module is a sealed, labelled DI Bag module whose browser store
      is private, installed by one transactional installer: it retains the bag before
      resolving and releases partial acquisitions on failure. Proves: the module label
      names the private binding; the installed surface carries neither the store nor the
      bag; the installer's close really is the bag's close. Negatives: the label removed;
      a registered cycle; the bag leaked into the returned surface; the close delegation
      replaced by a resolved no-op.
- [ ] 3. The page's application lifetime is opened through the slot at module load and
      delivery reads its preferences out of that one graph, with the module's wiki index
      declaring `module.frontend.preferences` and its files.
- [ ] 4. The application bootstrap owns the React root: it builds the runtime before
      `createRoot`, publishes `RememberedPreferences` — the feature facade only, never
      the `Preferences` resource — through one context, and renders the sanitized fatal
      state when the slot is fatal, terminal or not.
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
- [ ] 12. Each module has its own isolated type check and its graph check, and every
      module directory carries a validated wiki index and a `contract.ts`. The
      preferences module's public `preferences` resource — kept only for
      `src/lib/remembered.ts`'s per-project layout stores — moves behind a feature of
      its own or is recorded as accepted debt with its one caller named. Existing
      trusted pilot mappings are preserved untouched.
- [ ] 13. No infrastructure escapes a context: the architecture checks refuse a
      bag, credential, broad client, repository or resource in delivery.
```

### 8.4 `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts`

Real DI Bag graphs with chosen disposers, not hand-written `close` functions that reject: the refusals
under test are `DiBagCleanupError` and `DiBagCloseCancelledError`. Each fixture records its close
count, the `timeoutMs` it was given, and the slot's status **as seen from inside its own disposer**;
the re-entrancy tests count **factory calls**, because a close count of zero does not say whether a
runtime was ever built.

```ts
import { DiBag } from 'di-bag';
import { describe, expect, it } from 'vitest';

import {
  createLifetimeSlot,
  PartialAcquisitionError,
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
  readonly name: () => string;
  /** How many times a factory handed this runtime out; 0 means it never built. */
  readonly builds: () => number;
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
  let builds = 0;
  const budgets: number[] = [];
  const seen: string[] = [];
  const bag = DiBag.createBuilder()
    .register({
      owned: DiBag.withDisposal(
        DiBag.fromSyncFactory((): NamedServices => {
          builds += 1;
          return { name };
        }),
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
    name: () => name,
    builds: () => builds,
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

/** What a half-finished construction did, for the transaction assertions. */
interface PartialAcquisition {
  readonly acquire: () => RetirableRuntime<NamedServices>;
  readonly acquired: () => number;
  readonly released: () => number;
}

/**
 * A construction that acquires one owned resource and then throws.
 *
 * It is a real DI Bag graph, so the partial acquisition is owned exactly as
 * production's is: measured, DI Bag releases it only through `close()` on that
 * bag, which is why {@link PartialAcquisitionError} carries one.
 */
function acquiresThenThrows(dispose: () => Promise<void>): PartialAcquisition {
  let acquired = 0;
  let released = 0;
  return {
    acquired: () => acquired,
    released: () => released,
    acquire: () => {
      const bag = DiBag.createBuilder()
        .register({
          first: DiBag.withDisposal(
            DiBag.fromSyncFactory((): NamedServices => {
              acquired += 1;
              return { name: 'first resource' };
            }),
            async () => {
              released += 1;
              await dispose();
            },
          ),
        })
        .build();
      bag.resolve('first');
      throw new PartialAcquisitionError(new Error('the second resource refused'), (options) =>
        bag.close(options),
      );
    },
  };
}

const settles = (): Promise<void> => Promise.resolve();
const refuses = (): Promise<void> => Promise.reject(new Error('the disposer refused'));
const neverSettles = (): Promise<void> => new Promise<void>(() => undefined);

describe('one lifetime’s ownership', () => {
  it('publishes the first runtime through the same transaction as any other', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);

    const services = await slot.replace(() => first.runtime);

    // There is no synchronous `open`: the first publication is a replacement on
    // an empty slot, so initial acquisition is bounded, queued and transactional
    // like every other. An `open` beside the queue was how an initial partial
    // acquisition leaked and how a queued replacement overwrote a live runtime.
    expect(services.name).toBe('first');
    expect(slot.snapshot()).toEqual({ status: 'live', services });
  });

  it('releases a first construction that fails halfway, and stays buildable', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const partial = acquiresThenThrows(settles);

    await expect(slot.replace(partial.acquire)).rejects.toBeInstanceOf(PartialAcquisitionError);

    expect(partial.acquired()).toBe(1);
    expect(partial.released()).toBe(1);
    const fatal = slot.snapshot();
    expect(fatal.status === 'fatal' ? fatal.terminal : true).toBe(false);
    const second = runtimeNamed('second', settles);
    await expect(slot.replace(() => second.runtime)).resolves.toEqual({ name: 'second' });
  });

  it('never overwrites a runtime a queued request is about to publish', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    const second = runtimeNamed('second', settles);

    // Both requests reach an empty slot in the same tick. The queue is what makes
    // the second retire the first instead of replacing it in place.
    let firstFactoryCalls = 0;
    const outcomes = await Promise.allSettled([
      slot.replace(() => {
        firstFactoryCalls += 1;
        return first.runtime;
      }),
      slot.replace(() => second.runtime),
    ]);

    expect(outcomes[1].status).toBe('fulfilled');
    expect(slot.snapshot()).toEqual({ status: 'live', services: { name: 'second' } });
    // Either the first was never asked for, or it was given back: never both live.
    expect(first.closes()).toBe(firstFactoryCalls);
  });

  it('cannot be superseded by a subscriber running inside a transition', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    await slot.replace(() => runtimeNamed('first', settles).runtime);
    const second = runtimeNamed('second', settles);
    const third = runtimeNamed('third', settles);
    const handedOut = new Map<string, number>();
    const handOut = (record: RuntimeRecord) => () => {
      handedOut.set(record.name(), (handedOut.get(record.name()) ?? 0) + 1);
      return record.runtime;
    };
    // A holder, not a `let`: the compiler would otherwise narrow a variable only
    // assigned inside the listener to `null` and refuse the await below.
    const reentrant: { promise: Promise<NamedServices> | null } = { promise: null };
    let asked = false;
    slot.subscribe(() => {
      if (asked) return;
      asked = true;
      // The reentry round 3 found: a listener asking for another replacement from
      // inside a state change. It must arrive between steps, never inside one.
      reentrant.promise = slot.replace(handOut(third));
    });

    await slot.replace(handOut(second)).catch(() => undefined);
    if (reentrant.promise !== null) await reentrant.promise.catch(() => undefined);

    const live = slot.snapshot();
    expect(live.status).toBe('live');
    // Every runtime a factory handed out is either the live one or was closed
    // exactly once. That is the invariant the leak broke.
    for (const record of [second, third]) {
      const handed = handedOut.get(record.name()) ?? 0;
      if (handed === 0) continue;
      const isLive = live.status === 'live' && live.services.name === record.name();
      expect(record.closes(), `${record.name()} accounting`).toBe(isLive ? 0 : 1);
    }
  });

  it('gives back a runtime whose own factory asked for another replacement', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    await slot.replace(() => runtimeNamed('first', settles).runtime);
    const second = runtimeNamed('second', settles);
    const third = runtimeNamed('third', settles);
    const reentrant: { promise: Promise<NamedServices> | null } = { promise: null };

    let secondFactoryCalls = 0;
    const superseded = slot.replace(() => {
      secondFactoryCalls += 1;
      reentrant.promise = slot.replace(() => third.runtime);
      return second.runtime;
    });

    await expect(superseded).rejects.toBeInstanceOf(TransitionSupersededError);
    await expect(reentrant.promise).resolves.toEqual({ name: 'third' });
    // It was handed out — a factory cannot be stopped once it is running — so the
    // fence after the factory is what gives it back.
    expect(secondFactoryCalls).toBe(1);
    expect(second.closes()).toBe(1);
  });

  it('is still withdrawn while its disposer runs, so nothing late can be read', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles, () => slot.snapshot().status);
    await slot.replace(() => first.runtime);

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
    await slot.replace(() => runtimeNamed('first', settles).runtime);

    const replaced = await slot.replace(() => runtimeNamed('second', settles).runtime);

    // Three notifications, not four: notification is deferred to a microtask and
    // coalesced, so `constructing` is a state a `snapshot()` can read but not
    // necessarily one every subscriber is woken for. What matters is the order —
    // `retiring` is published before the replacement — and that no subscriber ever
    // runs inside a transition step. See {@link createLifetimeSlot}.
    expect(seen).toEqual(['live', 'retiring', 'live']);
    expect(replaced.name).toBe('second');
    expect(slot.snapshot()).toEqual({ status: 'live', services: replaced });
  });

  it('joins one retirement for every trigger of the same runtime', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const pending = deferred();
    const first = runtimeNamed('first', () => pending.promise);
    await slot.replace(() => first.runtime);

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
    await slot.replace(() => first.runtime);

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
    await slot.replace(() => first.runtime);

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
    await slot.replace(() => first.runtime);

    await slot.replace(() => second.runtime);
    await slot.retire();

    expect(first.closes()).toBe(1);
    expect(second.closes()).toBe(1);
    expect(slot.snapshot()).toEqual({ status: 'empty' });
  });

  it('refuses the replacement when the required retirement fails, and says so sanitized', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    await slot.replace(() => runtimeNamed('first', refuses).runtime);
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
    await slot.replace(() => runtimeNamed('first', refuses).runtime);
    await expect(slot.replace(() => runtimeNamed('second', settles).runtime)).rejects.toThrow(
      'DI_BAG_CLEANUP_FAILED',
    );
    const third = runtimeNamed('third', settles);

    await expect(slot.replace(() => third.runtime)).rejects.toThrow('DI_BAG_CLEANUP_FAILED');

    expect(third.closes()).toBe(0);
    expect(slot.snapshot().status).toBe('fatal');
  });

  it('refuses a request that was already queued when the disposal failed', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    await slot.replace(() => runtimeNamed('first', refuses).runtime);
    const second = runtimeNamed('second', settles);
    const third = runtimeNamed('third', settles);

    // Both are accepted before anything fails, so neither is refused at the door:
    // the first does the disposal and fails, and the second is already in the queue.
    const outcomes = await Promise.allSettled([
      slot.replace(() => second.runtime),
      slot.replace(() => third.runtime),
    ]);

    expect(outcomes.map(({ status }) => status)).toEqual(['rejected', 'rejected']);
    expect(second.closes()).toBe(0);
    expect(third.closes()).toBe(0);
    const fatal = slot.snapshot();
    expect(fatal.status).toBe('fatal');
    expect(fatal.status === 'fatal' ? fatal.terminal : false).toBe(true);
  });

  it('fails the transition when the retirement outruns its budget, and keeps watching the disposal', async () => {
    // 50ms and not the production budget: the fault is the disposer that never
    // settles, and waiting the real five seconds for it proves nothing more.
    const slot = createLifetimeSlot<NamedServices>(50);
    await slot.replace(() => runtimeNamed('first', neverSettles).runtime);
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
    await slot.replace(() => runtimeNamed('first', () => pending.promise).runtime);
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
    await slot.replace(() => runtimeNamed('first', () => pending.promise).runtime);
    await expect(slot.retire()).rejects.toThrow('DI_BAG_CLOSE_TIMEOUT');

    pending.refuse();
    await expect(slot.lateCleanup()).rejects.toThrow('DI_BAG_CLEANUP_FAILED');

    expect(slot.lateOutcome()).toBe('failed');
    expect(slot.snapshot().status).toBe('fatal');
  });

  it('is fatal but not terminal when the replacement’s construction throws', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    await slot.replace(() => first.runtime);

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

  it('withdraws publication synchronously, before the first await', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    await slot.replace(() => first.runtime);

    const replacing = slot.replace(() => runtimeNamed('second', settles).runtime);

    // Read before any await: the map requires withdrawal to be synchronous, and a
    // slot that withdrew inside its queued transition would still say `live` here.
    expect(slot.snapshot()).toEqual({ status: 'retiring' });
    await replacing;
  });

  it('does not build for a request that a newer one overtook during the disposal', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const pending = deferred();
    const first = runtimeNamed('first', () => pending.promise);
    await slot.replace(() => first.runtime);
    let secondBuilds = 0;
    let thirdBuilds = 0;

    const superseded = slot.replace(() => {
      secondBuilds += 1;
      return runtimeNamed('second', settles).runtime;
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    // The third request arrives while the first runtime is still letting go: the
    // interval a fence checked only at the top of a transition cannot see.
    const winner = slot.replace(() => {
      thirdBuilds += 1;
      return runtimeNamed('third', settles).runtime;
    });
    pending.settle();

    await expect(superseded).rejects.toBeInstanceOf(TransitionSupersededError);
    expect(await winner).toEqual({ name: 'third' });
    // Factory invocation counts, not close counts: a runtime that was never built
    // cannot leak, and a close count of zero does not prove it was never built.
    expect(secondBuilds).toBe(0);
    expect(thirdBuilds).toBe(1);
    expect(first.closes()).toBe(1);
  });

  it('releases what a half-finished construction acquired, and stays buildable', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    await slot.replace(() => first.runtime);
    const partial = acquiresThenThrows(settles);

    // The wrapper, not the cause: it is what says something was acquired, and the
    // real reason stays reachable through `cause` for the reporter.
    const refusal = await slot.replace(partial.acquire).catch((thrown: unknown) => thrown);
    expect(refusal).toBeInstanceOf(PartialAcquisitionError);
    expect(refusal instanceof PartialAcquisitionError ? (refusal.cause as Error).message : '').toBe(
      'the second resource refused',
    );

    // The first resource was acquired and is closed: a fatal state disposes
    // nothing by itself, and an orphan graph nobody can reach is the worse half.
    expect(partial.acquired()).toBe(1);
    expect(partial.released()).toBe(1);
    const fatal = slot.snapshot();
    expect(fatal.status).toBe('fatal');
    expect(fatal.status === 'fatal' ? fatal.terminal : true).toBe(false);
    const third = runtimeNamed('third', settles);
    await expect(slot.replace(() => third.runtime)).resolves.toEqual({ name: 'third' });
  });

  it('is terminal when the half-finished construction cannot be released', async () => {
    const slot = createLifetimeSlot<NamedServices>(50);
    await slot.replace(() => runtimeNamed('first', settles).runtime);
    const partial = acquiresThenThrows(refuses);

    await expect(slot.replace(partial.acquire)).rejects.toThrow('DI_BAG_CLEANUP_FAILED');

    const fatal = slot.snapshot();
    expect(fatal.status === 'fatal' ? fatal.terminal : false).toBe(true);
    const third = runtimeNamed('third', settles);
    await expect(slot.replace(() => third.runtime)).rejects.toThrow('DI_BAG_CLEANUP_FAILED');
    expect(third.closes()).toBe(0);
  });

  it('publishes a service contract that is itself null', async () => {
    // `S` is unconstrained, and no service value is ever a sentinel: the queued
    // request and the transition's outcome are both tagged, so a lifetime whose
    // published contract is literally `null` behaves like any other.
    const slot = createLifetimeSlot<null>();
    const bag = DiBag.createBuilder()
      .register({ owned: DiBag.fromSyncFactory((): null => null) })
      .build();

    await expect(
      slot.replace(() => ({
        services: bag.resolve('owned'),
        close: (options) => bag.close(options),
      })),
    ).resolves.toBe(null);
    expect(slot.snapshot()).toEqual({ status: 'live', services: null });
  });

  it('is terminal when a half-finished construction outruns its release budget', async () => {
    const slot = createLifetimeSlot<NamedServices>(50);
    await slot.replace(() => runtimeNamed('first', settles).runtime);
    const pending = deferred();
    const partial = acquiresThenThrows(() => pending.promise);

    await expect(slot.replace(partial.acquire)).rejects.toThrow('DI_BAG_CLOSE_TIMEOUT');

    const fatal = slot.snapshot();
    expect(fatal.status === 'fatal' ? fatal.terminal : false).toBe(true);
    // The release is still running, and the slot still holds the promise that
    // says how it ends — a timeout is not cancellation here either.
    expect(slot.lateOutcome()).toBe('pending');
    pending.settle();
    await slot.lateCleanup();
    expect(slot.lateOutcome()).toBe('settled');
    expect(slot.snapshot().status).toBe('fatal');
  });
});
```

### 8.5 `apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts`

```ts
import { DiBag } from 'di-bag';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createLifetimeSlot,
  type LifetimeSlot,
  PartialAcquisitionError,
  type RetirableRuntime,
} from './lifetime-slot';

/** What one generated runtime is, and what the world did to it. */
interface Tracked {
  readonly name: string;
  /** How many times a factory handed this runtime out. */
  acquisitions: number;
  /** How many times its bounded close was **invoked** — attempted, not completed. */
  closeCalls: number;
  /** How many of those completed, either way. */
  closeSettles: number;
}

/**
 * The reference implementation of the ownership rule.
 *
 * Deliberately not a simulator of the slot's schedule: which of several
 * overtaking requests reaches its factory depends on timing, and a model that
 * predicted that would be the implementation twice. It records what happened
 * instead and states the rule as invariants that must hold at every observation
 * point, including inside callbacks.
 */
class Ownership {
  readonly runtimes: Tracked[] = [];
  /** Names published, in order. The last one is what a reader is looking at. */
  readonly published: string[] = [];
  /** How many disposals are running right now; serialization means never two. */
  disposing = 0;
  maxConcurrentDisposals = 0;
  /**
   * For each replace request: its ordinal, how many requests existed when its
   * factory ran, and what it ended up doing.
   *
   * A request whose factory ran while a newer request already existed must not
   * publish — it may have acquired something, because a factory that asks for
   * another replacement itself cannot be stopped before it runs, but then it has
   * to give that runtime back, which invariant 2 checks.
   */
  readonly builds: { readonly ordinal: number; readonly issuedWhenBuilt: number }[] = [];
  /** True once a disposal or a partial release failed: the slot is terminal from then on. */
  terminal = false;
  /** The outcome each issued request is still waiting for. */
  readonly outcomes: { readonly ordinal: number; outcome: 'pending' | 'done' | 'refused' }[] = [];

  track(name: string): Tracked {
    const record: Tracked = { name, acquisitions: 0, closeCalls: 0, closeSettles: 0 };
    this.runtimes.push(record);
    return record;
  }

  /** Every acquired runtime is either the live one or has had exactly one close attempt. */
  ownershipIsAccountedFor(live: string | null): void {
    for (const runtime of this.runtimes) {
      if (runtime.acquisitions === 0) continue;
      const expected = runtime.name === live ? 0 : 1;
      expect(
        runtime.closeCalls,
        `${runtime.name}: ${String(runtime.acquisitions)} acquisitions, ${String(runtime.closeCalls)} close attempts, live=${String(live)}`,
      ).toBe(expected);
      expect(runtime.acquisitions, `${runtime.name} was acquired twice`).toBe(1);
    }
  }
}

/** A generated request against the slot. */
type Command =
  | {
      readonly kind: 'replace';
      /** How this runtime's disposer behaves when it is eventually retired. */
      readonly disposal: 'settles' | 'rejects' | 'never';
      /** Whether its factory acquires one resource and then throws. */
      readonly partial: boolean;
      /** Whether it asks for another replacement from inside the factory or a listener. */
      readonly reentry: 'none' | 'factory' | 'listener';
    }
  | { readonly kind: 'retire' }
  | { readonly kind: 'settle' };

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  { arbitrary: fc.constant<Command>({ kind: 'retire' }), weight: 1 },
  { arbitrary: fc.constant<Command>({ kind: 'settle' }), weight: 2 },
  {
    arbitrary: fc.record({
      kind: fc.constant('replace' as const),
      disposal: fc.constantFrom('settles' as const, 'rejects' as const, 'never' as const),
      partial: fc.boolean(),
      reentry: fc.constantFrom('none' as const, 'factory' as const, 'listener' as const),
    }),
    weight: 4,
  },
);

/**
 * The ownership rule, under generated command sequences and scheduled promises.
 *
 * The budget is 1 ms and a `never` disposer therefore always times out: the
 * instant is not controlled, but the **outcome** is, and it is DI Bag's own
 * `DiBagCloseCancelledError` rather than a hand-made rejection. Everything else
 * that settles goes through `fc.scheduler()`, so the order of disposals,
 * re-entrant requests and notifications is fast-check's to choose.
 */
describe('the ownership rule, under generated interleavings', () => {
  it('holds every invariant it claims', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.array(commandArb, { minLength: 2, maxLength: 7 }),
        async (scheduler, commands) => {
          const world = new Ownership();
          const slot: LifetimeSlot<Tracked> = createLifetimeSlot<Tracked>(1);
          const pending: Promise<unknown>[] = [];
          let issued = 0;
          /** What a listener should do the next time it is notified, if anything. */
          let listenerRequest: (() => void) | null = null;
          slot.subscribe(() => {
            const asked = listenerRequest;
            if (asked === null) return;
            listenerRequest = null;
            asked();
          });

          /** A real DI Bag runtime whose disposal settles when the scheduler says so. */
          const buildRuntime = (
            record: Tracked,
            disposal: Extract<Command, { kind: 'replace' }>['disposal'],
          ): RetirableRuntime<Tracked> => {
            const bag = DiBag.createBuilder()
              .register({
                owned: DiBag.withDisposal(
                  DiBag.fromSyncFactory((): Tracked => {
                    record.acquisitions += 1;
                    return record;
                  }),
                  async () => {
                    if (disposal === 'never') return new Promise<void>(() => undefined);
                    await scheduler.schedule(
                      disposal === 'settles'
                        ? Promise.resolve()
                        : Promise.reject(new Error(`${record.name} refused to dispose`)),
                      `dispose ${record.name}`,
                    );
                    return undefined;
                  },
                ),
              })
              .build();
            const services = bag.resolve('owned');
            return {
              services,
              close: async (options) => {
                record.closeCalls += 1;
                world.disposing += 1;
                world.maxConcurrentDisposals = Math.max(
                  world.maxConcurrentDisposals,
                  world.disposing,
                );
                try {
                  await bag.close(options);
                } finally {
                  world.disposing -= 1;
                  record.closeSettles += 1;
                }
              },
            };
          };

          /** A construction that acquires one resource and then throws, transactionally. */
          const buildPartial = (record: Tracked): never => {
            const bag = DiBag.createBuilder()
              .register({
                owned: DiBag.withDisposal(
                  DiBag.fromSyncFactory((): Tracked => {
                    record.acquisitions += 1;
                    return record;
                  }),
                  async () => {
                    await scheduler.schedule(Promise.resolve(), `release ${record.name}`);
                    return undefined;
                  },
                ),
              })
              .build();
            bag.resolve('owned');
            throw new PartialAcquisitionError(
              new Error(`${record.name} could not finish building`),
              async (options) => {
                record.closeCalls += 1;
                world.disposing += 1;
                world.maxConcurrentDisposals = Math.max(
                  world.maxConcurrentDisposals,
                  world.disposing,
                );
                try {
                  await bag.close(options);
                } finally {
                  world.disposing -= 1;
                  record.closeSettles += 1;
                }
              },
            );
          };

          const issueReplace = (command: Extract<Command, { kind: 'replace' }>): void => {
            issued += 1;
            const ordinal = issued;
            const record = world.track(`r${String(ordinal)}`);
            const entry = { ordinal, outcome: 'pending' as 'pending' | 'done' | 'refused' };
            world.outcomes.push(entry);
            if (command.reentry === 'listener') {
              listenerRequest = () => {
                issueReplace({
                  kind: 'replace',
                  disposal: 'settles',
                  partial: false,
                  reentry: 'none',
                });
              };
            }
            pending.push(
              slot
                .replace(() => {
                  if (command.reentry === 'factory') {
                    issueReplace({
                      kind: 'replace',
                      disposal: 'settles',
                      partial: false,
                      reentry: 'none',
                    });
                  }
                  world.builds.push({ ordinal, issuedWhenBuilt: issued });
                  if (command.partial) return buildPartial(record);
                  return buildRuntime(record, command.disposal);
                })
                .then(
                  () => {
                    entry.outcome = 'done';
                    world.published.push(record.name);
                  },
                  () => {
                    entry.outcome = 'refused';
                  },
                ),
            );
          };

          for (const command of commands) {
            if (command.kind === 'replace') {
              issueReplace(command);
            } else if (command.kind === 'retire') {
              issued += 1;
              const entry = {
                ordinal: issued,
                outcome: 'pending' as 'pending' | 'done' | 'refused',
              };
              world.outcomes.push(entry);
              pending.push(
                slot.retire().then(
                  () => {
                    entry.outcome = 'done';
                  },
                  () => {
                    entry.outcome = 'refused';
                  },
                ),
              );
            } else if (scheduler.count() > 0) {
              await scheduler.waitNext(1);
            }
          }

          await scheduler.waitIdle();
          await Promise.all(pending);
          await scheduler.waitIdle();

          const held = slot.snapshot();
          const live = held.status === 'live' ? held.services.name : null;

          // 1. One live runtime at most, and it is the last thing published.
          if (live !== null) expect(world.published.at(-1)).toBe(live);
          // 2. Ownership is accounted for, in every state including fatal.
          world.ownershipIsAccountedFor(live);
          // 3. Disposals never overlap: that is what the queue is for.
          expect(world.maxConcurrentDisposals, 'two disposals overlapped').toBeLessThanOrEqual(1);
          // 4. A request that was already superseded when its factory ran never
          //    published. This is the fence, stated as an outcome.
          for (const { ordinal, issuedWhenBuilt } of world.builds) {
            if (issuedWhenBuilt <= ordinal) continue;
            const entry = world.outcomes.find((candidate) => candidate.ordinal === ordinal);
            expect(entry?.outcome, `request ${String(ordinal)} published while superseded`).toBe(
              'refused',
            );
          }
          // 5. The latest request wins: unless the slot is fatal, the last request
          //    issued got what it asked for, and no request is still pending.
          expect(
            world.outcomes.filter(({ outcome }) => outcome === 'pending'),
            'a request never settled',
          ).toEqual([]);
          const fatal = held.status === 'fatal';
          const last = world.outcomes.at(-1);
          if (!fatal && last !== undefined) {
            expect(last.outcome, 'the latest request did not win').not.toBe('refused');
          }
          // 6. A fatal slot holds nothing and publishes nothing after it.
          if (fatal) expect(live).toBe(null);
        },
      ),
      { seed: 20260923, numRuns: 300 },
    );
  }, 120_000);
});
```

### 8.6 The slice 2 skeleton, `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`

Everything down to and including the `LifetimeSlot` interface is exactly as section 8.7 has it, with
one import line instead of two and no `lateCleanupOf`; the file then ends:

```ts
/**
 * Not implemented yet: the red checkpoint's subject.
 *
 * The declarations above are the contract the tests were written against; this
 * body is replaced in the same slice, before anything is committed. Its message
 * carries no budget, so every test fails with the same one whatever budget it
 * asked for.
 */
export function createLifetimeSlot<S>(budgetMs: number = RETIREMENT_BUDGET_MS): LifetimeSlot<S> {
  void budgetMs;
  throw new Error('the lifetime slot is not implemented');
}
```

Its only import is
`import type { DisclosedFault } from '@/components/chrome/fault-disclosure';`.

### 8.7 `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`, whole

```ts
import { DiBagCloseCancelledError } from 'di-bag';

import { type DisclosedFault, discloseFault } from '@/components/chrome/fault-disclosure';

/**
 * How long a required disposal is waited for before the transition fails.
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
 * How a lifetime is built: synchronously, and **transactionally**.
 *
 * A construction that fails after acquiring anything must throw
 * {@link PartialAcquisitionError} carrying the close for what it took. DI Bag
 * releases a partially acquired graph only through `close()` on the bag that
 * acquired it (measured: a factory that pushed a disposer and then threw left it
 * unrun until `bag.close()`), so a builder that resolves services one by one has
 * to keep that bag reachable. A builder that throws anything else is taken at
 * its word: it acquired nothing.
 */
export type Acquire<S> = () => RetirableRuntime<S>;

/**
 * A construction that failed after acquiring something.
 *
 * `release` is the bounded close for whatever it took, and the slot awaits it
 * before publishing the fatal state — an orphan graph nobody can reach is worse
 * than a failed transition, and marking the slot fatal disposes nothing by
 * itself.
 */
export class PartialAcquisitionError extends Error {
  constructor(
    override readonly cause: unknown,
    readonly release: (options: { timeoutMs: number }) => Promise<void>,
  ) {
    super('the lifetime could not be built, and what it acquired must be released');
    this.name = 'PartialAcquisitionError';
  }
}

/**
 * A request that a newer one replaced before it could publish.
 *
 * Modelled and thrown rather than resolved with somebody else's services: three
 * project selections in one page still leave one runtime live, and the losers are
 * told they lost instead of being handed a runtime they do not own.
 */
export class TransitionSupersededError extends Error {
  constructor(requested: number, newest: number) {
    super(`lifetime transition ${String(requested)} was superseded by ${String(newest)}`);
    this.name = 'TransitionSupersededError';
  }
}

/**
 * What one lifetime slot holds, as one value delivery can select from.
 *
 * | From              | Event                                                  | To                       |
 * | ----------------- | ------------------------------------------------------ | ------------------------ |
 * | `empty`           | `replace` accepted                                     | `constructing`           |
 * | `live`            | `replace` or `retire` accepted (**synchronously**)      | `retiring`               |
 * | `retiring`        | the withdrawn runtime's disposal succeeded, build asked  | `constructing`           |
 * | `retiring`        | that disposal succeeded, `retire`                        | `empty`                  |
 * | `retiring`        | that disposal rejected or outran its budget              | `fatal`, terminal        |
 * | `retiring`        | the request was overtaken while that disposal ran        | refused as superseded    |
 * | `constructing`    | the build succeeded and is still the newest request      | `live`                   |
 * | `constructing`    | the build succeeded but a re-entrant request overtook it  | closed, then superseded  |
 * | `constructing`    | the build failed; what it acquired was released           | `fatal`, not terminal    |
 * | `constructing`    | the build failed and that release rejected or timed out   | `fatal`, terminal        |
 * | `fatal`, terminal | any request                                            | refused with the refusal |
 * | `fatal`, not t.   | `replace`                                              | `constructing`           |
 *
 * `fatal` is what a reader is shown: the sanitized public report — the same
 * sentence and occurrence handle the root fault path discloses — because a
 * cleanup failure is a disclosure boundary exactly as a render fault is.
 *
 * `terminal` says whether this slot may hold a runtime again, and the two cases
 * are genuinely different:
 *
 * - a **disposal** that failed or outran its wait may still be holding what it
 *   was asked to give back — a socket, a timer, a lock — so the slot refuses
 *   every later transition with that same refusal;
 * - a **construction** that failed, whose acquisitions were then released, holds
 *   nothing at all, so a later transition may build again.
 */
export type LifetimeState<S> =
  | { readonly status: 'empty' }
  | { readonly status: 'live'; readonly services: S }
  | { readonly status: 'retiring' }
  | { readonly status: 'constructing' }
  | { readonly status: 'fatal'; readonly fault: DisclosedFault; readonly terminal: boolean };

/** How the disposal that outlived its bounded wait ended, as far as the slot has seen. */
export type LateCleanup = 'none' | 'pending' | 'settled' | 'failed';

/**
 * The one slot that owns the current runtime of one lifetime.
 *
 * A store (rule F2): `subscribe` and a `snapshot` that is stable until the slot
 * changes. It imports no React and holds no component state.
 *
 * **There is no synchronous first publication.** A lifetime's first runtime is a
 * `replace` on an empty slot, which is awaited like any other: initial
 * acquisition is bounded, transactional and queued exactly as a replacement is,
 * because an `open` beside the queue was how an initial partial acquisition
 * leaked and how a queued replacement came to overwrite a runtime nobody closed.
 * The page's bootstrap awaits it before it creates the React root, which is what
 * DI Bag's own React guide prescribes anyway.
 */
export interface LifetimeSlot<S> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => LifetimeState<S>;
  /**
   * Retire what is current and publish the replacement **only if** that
   * disposal succeeded and no newer request arrived meanwhile.
   *
   * Publication is withdrawn **synchronously**, before this returns its promise.
   * Transitions then run one at a time, in request order, and the request's
   * generation is rechecked after every await and after the factory returns.
   *
   * @throws the disposal's failure, leaving the slot terminally fatal and the
   * replacement never built — DI Bag's own React recipe reports and continues,
   * and rule R5 refuses. Throws {@link TransitionSupersededError} when a newer
   * request won, and the construction's own failure when the build throws.
   */
  readonly replace: (acquire: Acquire<S>) => Promise<S>;
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

/** What one queued transition was asked for; a tagged request, never a nullable builder. */
type Request<S> =
  { readonly kind: 'retire' } | { readonly kind: 'replace'; readonly acquire: Acquire<S> };

/** What one transition did; a tagged outcome, so no service value is ever a sentinel. */
type Outcome<S> =
  { readonly kind: 'retired' } | { readonly kind: 'published'; readonly services: S };

/**
 * One lifetime's ownership, as a serialized state machine.
 *
 * Three rules hold the ownership invariant, and each has its own mutation:
 *
 * 1. **Withdrawal is synchronous.** `replace` and `retire` withdraw publication
 *    and number the request before they return, so a reader cannot see a runtime
 *    the page has given up on, and a second trigger finds nothing current.
 * 2. **One transition at a time**, so two disposals never overlap.
 * 3. **Subscribers never run inside a transition.** `publish` mutates the state
 *    synchronously — `snapshot()` is correct the instant a request is accepted —
 *    but notifies from a microtask, coalescing. A subscriber that asks for
 *    another replacement therefore always arrives *between* steps, where the
 *    generation checks can see it, instead of in the middle of one. The
 *    generation is rechecked after the disposal **and after the factory
 *    returns**, because a factory can re-enter too, and a runtime built for a
 *    request that lost while its factory ran is given back rather than published.
 */
export function createLifetimeSlot<S>(
  /**
   * The bounded wait this slot gives a disposal, in milliseconds.
   *
   * Production takes {@link RETIREMENT_BUDGET_MS}; a test names a short one so
   * the never-settling-disposer proofs do not sit for five seconds. There is no
   * other reason to pass it, and no lifetime here differs.
   */
  budgetMs: number = RETIREMENT_BUDGET_MS,
): LifetimeSlot<S> {
  let state: LifetimeState<S> = { status: 'empty' };
  /** The published runtime, while there is one. */
  let held: RetirableRuntime<S> | null = null;
  /** Withdrawn and awaiting disposal; whoever reaches it first disposes it. */
  let withdrawn: RetirableRuntime<S> | null = null;
  let late: Promise<void> | null = null;
  let lateEnded: LateCleanup = 'none';
  /**
   * The refusal that made this slot terminally fatal, rethrown to every later
   * trigger.
   *
   * A holder rather than a `let`, and that is load-bearing: `refuse()` assigns it
   * from another function, so the compiler narrows a plain variable to `null` for
   * the whole of `transition` and `no-unnecessary-condition` then refuses the
   * second check below as impossible — the very check whose removal let a queued
   * request publish into a terminal slot.
   */
  const terminal: { refusal: unknown } = { refusal: null };
  /**
   * The refusal so far, read through a call.
   *
   * Not `terminal.refusal` inline: the compiler narrows that property to `null`
   * for the whole of `transition` — `refuse()` assigns it from another function —
   * and `no-unnecessary-condition` then refuses the second check in `transition`
   * as impossible. It is not impossible: it is the check whose removal let a
   * request that was already queued publish into a terminal slot.
   */
  const refusalSoFar = (): unknown => terminal.refusal;
  /** The transition currently running, so the next one queues behind it. */
  let running: Promise<unknown> | null = null;
  /** The newest accepted request; an older one that has not published yet is superseded. */
  let newest = 0;
  /** True while a notification is already queued, so one microtask serves many changes. */
  let notifying = false;
  const listeners = new Set<() => void>();

  /**
   * Changes the state now and tells subscribers later.
   *
   * The deferral is the reentry rule, not an optimisation: a listener invoked
   * from inside a transition could request another replacement between the
   * generation check and the factory call, and the runtime the factory then
   * built would belong to nobody.
   */
  const publish = (next: LifetimeState<S>): void => {
    state = next;
    if (notifying) return;
    notifying = true;
    void Promise.resolve().then(() => {
      notifying = false;
      for (const listener of [...listeners]) listener();
    });
  };

  /** Records a bounded wait that expired, and keeps watching what it stopped waiting for. */
  const observeLate = (refusal: unknown): void => {
    late = lateCleanupOf(refusal);
    if (late === null) return;
    lateEnded = 'pending';
    void late.then(
      () => {
        lateEnded = 'settled';
        for (const listener of [...listeners]) listener();
      },
      () => {
        lateEnded = 'failed';
        for (const listener of [...listeners]) listener();
      },
    );
  };

  /** Makes this slot terminally fatal, and hands the refusal on. */
  const refuse = (refusal: unknown): never => {
    terminal.refusal = refusal;
    observeLate(refusal);
    publish({ status: 'fatal', fault: discloseFault(refusal), terminal: true });
    // The boundary: `refusal` is a value DI Bag already threw, rethrown unchanged
    // so the caller sees the real failure rather than a paraphrase of it.

    throw refusal;
  };

  /** Disposes the withdrawn runtime, once, under the slot's budget. */
  const disposeWithdrawn = async (): Promise<void> => {
    const disposing = withdrawn;
    if (disposing === null) return;
    withdrawn = null;
    try {
      await disposing.close({ timeoutMs: budgetMs });
    } catch (refusal) {
      refuse(refusal);
    }
  };

  /** One queued transition, generation-checked after every await and after the factory. */
  const transition = async (request: Request<S>, ordinal: number): Promise<Outcome<S>> => {
    const ahead = running;
    const mine = (async (): Promise<Outcome<S>> => {
      // One transition at a time, in request order: the queue is what keeps two
      // disposals from overlapping and what makes the fences below meaningful.
      if (ahead !== null) await ahead.catch(() => undefined);
      if (refusalSoFar() !== null) throw terminal.refusal;
      // A disposal that fails throws from here, through `refuse`, so a second
      // terminal check after it would be one no mutation could break.
      await disposeWithdrawn();
      if (request.kind === 'retire') {
        if (state.status === 'retiring') publish({ status: 'empty' });
        return { kind: 'retired' };
      }
      // Fence after the disposal: a request overtaken *while* the old runtime was
      // letting go must not build.
      if (ordinal !== newest) throw new TransitionSupersededError(ordinal, newest);
      publish({ status: 'constructing' });
      let built: RetirableRuntime<S>;
      try {
        built = request.acquire();
      } catch (failure) {
        if (failure instanceof PartialAcquisitionError) {
          try {
            await failure.release({ timeoutMs: budgetMs });
          } catch (releaseRefusal) {
            refuse(releaseRefusal);
          }
        }
        // Nothing is held now: the old runtime was disposed and everything this
        // construction acquired has been released. Fatal for the reader, not
        // terminal for the slot — see {@link LifetimeState}.
        publish({ status: 'fatal', fault: discloseFault(failure), terminal: false });

        throw failure;
      }
      // Fence after the factory: a factory may itself ask for another
      // replacement, so what it built is given back rather than published.
      if (ordinal !== newest) {
        withdrawn = built;
        publish({ status: 'retiring' });
        await disposeWithdrawn();
        throw new TransitionSupersededError(ordinal, newest);
      }
      held = built;
      publish({ status: 'live', services: built.services });
      return { kind: 'published', services: built.services };
    })();
    running = mine;
    try {
      return await mine;
    } finally {
      if (running === mine) running = null;
    }
  };

  /**
   * Accepts a request: withdraws publication **now** and numbers the request so
   * the fences can tell it from a newer one.
   */
  const accept = (): number => {
    newest += 1;
    if (held !== null) {
      withdrawn = held;
      held = null;
      publish({ status: 'retiring' });
    }
    return newest;
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => state,
    replace: async (acquire) => {
      const ordinal = accept();
      const outcome = await transition({ kind: 'replace', acquire }, ordinal);
      if (outcome.kind !== 'published') {
        throw new Error('a replacement transition retired instead of publishing');
      }
      return outcome.services;
    },
    retire: async () => {
      const ordinal = accept();
      await transition({ kind: 'retire' }, ordinal);
    },
    lateCleanup: () => late,
    lateOutcome: () => lateEnded,
  };
}
```

## 9. Proofs

Each fault is injected **alone**. Copy the passing file to `$TMPDIR` first, save the mutation as a
patch under `$TMPDIR/evidence`, restore with `cp`, and prove the restore with `cmp` **before**
asserting on any captured status. Never `rm` a scratch file. Save a patch with one command, and
**stop** if its status is anything but 1 — a `diff` that failed for another reason must never become
evidence:

```sh
if out=$(diff -u "$TMPDIR/<name>.passing" "<the file>"); then
  printf 'the mutation changed nothing\n' >&2; exit 1
fi
status=$?
if [ "$status" -ne 1 ]; then printf 'diff failed: %s\n' "$status" >&2; exit "$status"; fi
printf '%s\n' "$out" > "$TMPDIR/evidence/<name>.patch"
```

Every fault below **compiles**: `wbs-fe-01:typecheck` exited 0 under each, rehearsed one at a time.

### 9.1 Six sabotages, which are what say the model test has teeth

| #      | Sabotage                                                                                              | Observed                                                                                                                                                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | delete the serialization wait `if (ahead !== null) await ahead.catch(() => undefined);`               | `3 failed \| 22 passed (25)`. Model test: `AssertionError: r3: 1 acquisitions, 0 close attempts, live=null`, counterexample `-> [task${1}] promise::dispose r2 rejected …`, commands `[{retire},{replace,rejects,factory}]`, `Shrunk 1 time(s)` |
| **A2** | make the post-disposal fence unconditional: `throw new TransitionSupersededError(ordinal, newest);`   | `25 failed (25)`. Model test: `AssertionError: the latest request did not win: expected 'refused' not to be 'refused'`, counterexample `[{replace,settles,none},{settle}]`, `Shrunk 3 time(s)`                                                  |
| **A3** | delete the `if (failure instanceof PartialAcquisitionError) { … }` release block                      | `5 failed \| 20 passed (25)`. Model test: `AssertionError: r1: 1 acquisitions, 0 close attempts, live=null`, counterexample `[{replace,settles,partial:true,none},{settle}]`, `Shrunk 2 time(s)`                                                |
| **A4** | delete the fence **after the factory** (`if (ordinal !== newest) { withdrawn = built; … }`)           | `2 failed \| 23 passed (25)`. Model test: `AssertionError: r2: 1 acquisitions, 0 close attempts, live=r3`, counterexample `[{retire},{replace,settles,factory}]`, `Shrunk 2 time(s)`                                                            |
| **A5** | delete the fence **after the disposal**                                                               | `2 failed \| 23 passed (25)`, both example tests, on `AssertionError: expected 1 to be +0` — a factory ran for a doomed request. **The model test stays green here**, and section 5 of the design says why                                      |
| **A6** | notify subscribers synchronously (`state = next; for (const listener of [...listeners]) listener();`) | `2 failed \| 23 passed (25)`: `third accounting: expected +0 to be 1` — round 3's leak — and the coalescing expectation. **The model test stays green on this implementation**, though it caught the same defect on the previous one            |

**One sabotage was withdrawn as vacuous**: "skip the disposal when the slot is already fatal" left all
300 cases green because the branch is unreachable — after a terminal failure nothing is published, so
nothing is ever withdrawn again. A3 is the reachable fatal-state ownership case that replaced it.

### 9.2 Eight per-check mutations

| #      | Fault, exactly                                                                                                      | Named test that must fail                                                                      | Observed                                                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** | in `refuse`, delete `terminal.refusal = refusal;`                                                                   | `refuses every later transition of a slot whose retirement failed`                             | `3 failed \| 22 passed (25)`; `AssertionError: promise resolved "{ name: 'third' }" instead of rejecting`                                                                                                                         |
| **B2** | in `transition`, delete the line `if (refusalSoFar() !== null) throw terminal.refusal;`                             | `refuses a request that was already queued when the disposal failed`                           | `3 failed \| 22 passed (25)`; `AssertionError: expected [ 'rejected', 'fulfilled' ] to deeply equal [ 'rejected', 'rejected' ]`                                                                                                   |
| **B3** | **inside `lateCleanupOf`**, replace `return refusal.cleanupPromise;` with `return null;`                            | `fails the transition when the retirement outruns its budget, and keeps watching the disposal` | `4 failed \| 21 passed (25)`; `AssertionError: expected null to be an instance of Promise`. Mutating the _call site_ instead would not compile (`Property 'then' does not exist on type 'never'`), which is why the fault is here |
| **B4** | in `observeLate`, delete the whole `void late.then( … );` block                                                     | `observes a late disposal that finishes after the wait expired, without publishing anything`   | `3 failed \| 22 passed (25)`; `AssertionError: expected 'pending' to be 'settled'`                                                                                                                                                |
| **B5** | change the default parameter to `budgetMs: number = 4_000`                                                          | `gives the retirement the production budget when it is built with none`                        | `1 failed \| 24 passed (25)`; `AssertionError: expected [ 4000 ] to deeply equal [ 5000 ]`                                                                                                                                        |
| **B6** | in `accept`, delete the `if (held !== null) { … }` withdrawal block, keeping `newest += 1;`                         | `withdraws publication synchronously, before the first await`                                  | `17 failed \| 8 passed (25)`; the model test on `r1: 1 acquisitions, 0 close attempts, live=r2`, and `expected [] to deeply equal [ 'retiring' ]`                                                                                 |
| **B7** | in the construction `catch`, delete `publish({ status: 'fatal', fault: discloseFault(failure), terminal: false });` | `is fatal but not terminal when the replacement’s construction throws`                         | `4 failed \| 21 passed (25)`; `AssertionError: expected 'constructing' to be 'fatal'`                                                                                                                                             |
| **B8** | in the release `catch`, replace `refuse(releaseRefusal);` with an empty `catch { }`                                 | `is terminal when the half-finished construction cannot be released`                           | `2 failed \| 23 passed (25)`; `AssertionError: expected [Function] to throw error including 'DI_BAG_CLEANUP_FAILED' but got 'the lifetime could not be built, and …'`                                                             |

**Two checks were deleted rather than shipped unprovable**, and the code says so where they were: a
second terminal check after the disposal (a failing disposal throws from `refuse` inside it, so nothing
could break it) and, in earlier revisions, a pre-queue fence and a microtask deferral that the
post-disposal fence already decided. AGENTS.md R5: a check that cannot fail is worse than none.

## 10. Verification

### The executor runs, per slice

| Command                                                                             | Expected                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| the sandbox unit command of step 0                                                  | exit 0, F0/T0 recorded, then the slice's relative delta |
| `(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/runtime)` | slice 2's red, then exit 0 with `Tests 25 passed (25)`  |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                   | exit 0, including under every mutation of section 9     |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                        | exit 0                                                  |
| `GSETTINGS_BACKEND=memory bunx prettier --check <the slice's files>`                | exit 0                                                  |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`       | slice 1: V0 + 1 items; slice 4: V0 items; `failed: 0`   |

Keep the status of every command (`cmd > log 2>&1; echo "exit=$?"`). Never read a status through a
`tee` or a pipeline.

### Planner-only, with the values the planner observed

| Command                                                                                            | Observed                                                                         |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1` in `apps/wbs/fe-01` (the jsdom tier) | exit 0, `123 passed (123)` files, `2921 passed (2921)` tests                     |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`                                    | exit 0, `366 pass`, `0 fail`                                                     |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test`                                               | exit 0, `764 pass`, `0 fail`, 19m, run alone on the host                         |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                      | pending planner verification; nothing in the page's bundle imports this file yet |
| `CI=1 E2E_PORT_SHIFT=2400 … wbs-fe-01:e2e -- <three preference specs>`                             | exit 0, `21 passed (1.2m)`; this packet touches no component                     |
| `bin/h2puni-gate.sh <sha>`                                                                         | the planner's, after the last slice                                              |

Chromium is the planner's. Pick `E2E_PORT_SHIFT` as a multiple of 300 away from every other live run,
check the three ports (`+0`, `+100`, `+1100` from 3100/3200/4200) with `ss -ltn` first, and never kill
a process you cannot prove is yours (`ls -l /proc/<pid>/cwd`).

**Load-sensitive Burokrat tests, not this packet's.** `apps/wiki/cli` has CLI-spawning tests at Bun's
5000 ms default; the planner watched one exceed it by 30 ms under concurrent load and Nx report the
task flaky, while alone the suite was `764 pass`. Run it with no other heavy target. **Known race, not
this packet's**: `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` — record and rerun once.

## 11. Stop conditions

Each is scoped to the slice that reads it, and each is false on that slice's real starting tree.

In any slice:

- a red run prints `No test files found` or `Tests no tests` instead of `Tests 25 failed (25)`.
- the model test fails on the finished implementation. Record the counterexample and the seed it
  prints and stop: it is deterministic, so a failure is a real race, not a flake.
- a sabotage in section 9.1 leaves the suite green, or a mutation in 9.2 leaves its **named** test
  passing. Restore, check the location, redo once, and stop if it happens again.
- a mutation does not compile. Restore and stop: every one here was rehearsed at `typecheck` exit 0.
- `bunx eslint` reports an error this packet does not name and `--fix` does not remove.
- any command wants the network, or any file outside section 6 needs changing.

## 12. The next 050.7 packets, in dependency order

1. **050-7-b, the preferences module through the runtime owner.** Ticks tasks 2 and 3. Owns
   `modules/preferences/module.ts` (sealed, labelled `frontend.preferences`, browser store private),
   the installer, the page's `application-lifetime.ts`, the `composition.ts` seam and the README. Four
   measured obligations: the installer is **transactional** (retain the bag, then resolve, and raise
   `PartialAcquisitionError` carrying that bag's bounded close); its close must be **provable** through
   a narrow typed seam registering one owned disposable, with a mutation replacing the delegation by a
   resolved no-op; the module's **wiki index** is written there — a `<!-- module-index … -->` comment
   declaring `module.frontend.preferences`, `module.ts` and every owned file, verified with
   `bun apps/wiki/cli/src/cli.ts check staged . HEAD <rule-policy>.json --rule MOD-INDEX` and
   `--rule MOD-LAYOUT`, and **no** `docs/wiki-policy/modules.json` edit (section 4.7); and
   `preferences`, the resource, stays a public module export only for `src/lib/remembered.ts`, recorded
   as rule-K2 debt and never put into a React context.
2. **050-7-c, the bootstrap and the fatal state.** Ticks task 4. `bootstrap()` **awaits** the first
   `replace` before `createRoot`, outside `<StrictMode>`; one application context exposing
   `RememberedPreferences` only; the sanitized fatal state rendered for both flavours.
3. **050-7-d, page hide, hot reload and restoration.** Ticks task 5. Map tests 2 and 3.
4. **050-7-e and 050-7-f, the project prerequisites.** Ticks tasks 8 and 9.
5. **050-7-g, the session runtime.** Ticks task 6. Needs 050-7-c.
6. **050-7-h, the project runtime.** Ticks tasks 10 and 11. Needs 050-7-e, 050-7-f, 050-7-g.
7. **050-7-i, Log out as a coordinated local exit.** Ticks task 7. Needs 050-7-g and 050-7-h.
8. **050-7-j, the boundary checks.** Ticks tasks 12 and 13.

## 13. Assumptions recorded rather than asked

- **The change is named `adopt-frontend-lifetimes`**: the adoption tail map's `adopt-di-composition` is
  the backend's, and batch 6's sibling packet opens it.
- **The retirement budget is 5000 ms for every lifetime**, named `RETIREMENT_BUDGET_MS`. Tests pass a
  short one; B5 is what says the production default is the one a real close receives.
- **A failed disposal is terminal; a failed construction whose acquisitions were released is not**, and
  a release that itself fails is terminal again. The design document argues it.
- **A superseded request is refused, not answered with the winner's services**, and a retirement never
  suffers supersession: every trigger's shared intent is to let go.
- **`Acquire<S>` is synchronous, and that is a contract**: it is what makes two fences sufficient. A
  lifetime needing asynchronous construction changes the type, adds a fence and adds a command to the
  model test.
- **The model test records rather than simulates.** Which of two overtaking requests reaches its
  factory is a timing fact; a model that predicted it would be the implementation twice.
- **Nothing in this packet is reachable from the running page.** The owner is proved in the fast tier
  before anything depends on it; 050-7-b is what makes it the page's.

## 14. Disposition of the defect classes the 040.6 review found

| Defect class                                            | How this packet avoids it                                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Stop conditions that halt the packet's own later slices | Section 11 plus each slice's pre-edit check.                                                                                  |
| A command needing network under the default dispatch    | No slice needs `--network`.                                                                                                   |
| An encapsulation proof that builds its own host         | This packet ships no installer; section 12 names 050-7-b's production-path seam and its mutation.                             |
| Implementation before tests                             | Slice 2 writes both test files, their suite entries and a throwing skeleton, records `Tests 25 failed (25)`, then implements. |
| Recorded negatives that do not match the supplied tests | All fourteen rows of section 9 were injected alone against these listings, after Prettier, at `typecheck` exit 0.             |
| A handoff the prescribed workflow cannot produce        | Each slice lists the paths it changes with the count stated and matching, `verify.md` included.                               |
| OpenSpec files created by hand                          | Slice 1 runs `openspec new change … --schema sdd-lean` first.                                                                 |

## 15. Disposition of reviews 1 and 2

Reviews 1 and 2 are dispositioned in full in the previous revisions; review 3 confirmed C1, C3, I4, I6,
I8 and Minor 10 of review 2 as FIXED, and this revision closes the rest:

| Finding                                        | Verdict       | Where                                                                                                                                                                 |
| ---------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| review 2 C2 — construction acquires nothing    | **FIXED**     | `open()` is gone; **every** acquisition, the first included, runs through the transaction. §5, §8.7, and the test `releases a first construction that fails halfway`. |
| review 2 I5 — the property proves nothing      | **FIXED**     | The hand-written property is deleted. The model test of §8.5 replaces it, and §9.1's six sabotages are what say it has teeth.                                         |
| review 2 I7 — the `null` sentinel              | **FIXED**     | Tagged request **and** tagged outcome; `transition` returns `Outcome<S>`; `publishes a service contract that is itself null` is the test.                             |
| review 2 I9 / review 3 8 — the index rationale | **WITHDRAWN** | §4.7 and task 12 both corrected, with the three anchors that disprove the old claim.                                                                                  |
| review 2 Minor 9 — handover counts             | **FIXED**     | Five paths in slices 1 and 2, `verify.md` included.                                                                                                                   |

## 16. Disposition of review 3

| Finding                                                       | Verdict   | Where, and what was observed                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** synchronous callbacks can supersede construction       | **FIXED** | Reproduced by the new model test on the old code (§2). Two decisions close it: notification is deferred to a microtask so no subscriber runs inside a transition, and the generation is rechecked **after the factory** as well. Tests `cannot be superseded by a subscriber running inside a transition` and `gives back a runtime whose own factory asked for another replacement`; sabotages A4 and A6. |
| **C2** `open` bypasses the transaction and the queue          | **FIXED** | `open` is deleted. The first publication is a `replace` on an empty slot — bounded, queued, transactional — and the bootstrap awaits it (§5, §12). Tests `publishes the first runtime through the same transaction as any other`, `releases a first construction that fails halfway, and stays buildable`, `never overwrites a runtime a queued request is about to publish`.                              |
| **C3** N3 does not type-check                                 | **FIXED** | Confirmed. The mutation is now **inside `lateCleanupOf`** (B3), rehearsed at `typecheck` exit 0, and §9 requires a typecheck under every mutation with a stop if one does not compile.                                                                                                                                                                                                                     |
| **I4** the `null` sentinel is still there                     | **FIXED** | Confirmed from the listing. `Outcome<S>` is tagged; the impossible guard is gone; a `null` service contract has its own test.                                                                                                                                                                                                                                                                              |
| **I5** the property does not establish its invariants         | **FIXED** | The property is replaced by the model test, whose recorded outcomes cover request results, disposal **attempts**, overlap, supersession and fatal states, and which generates partial acquisition and both kinds of reentry. §9.1 proves each claim by sabotage, and says plainly which two checks the model test does **not** catch.                                                                      |
| **I6** a surviving check has no effective negative            | **FIXED** | The redundant `accept()` terminal guard is **deleted** — with it removed the suite stayed green, so R5 says it goes — and so is a second terminal check after the disposal. What remains has B1 to B8, and the partial-release timeout and late success/rejection now have their own tests.                                                                                                                |
| **I7** slice 2's handover omits `verify.md`                   | **FIXED** | Slice 2 has an explicit append step and lists five paths.                                                                                                                                                                                                                                                                                                                                                  |
| **I8** task 12 keeps the withdrawn rationale                  | **FIXED** | Task 12 now requires validated module indexes and contracts, preserves existing pilot mappings, and names no `modules.json` obligation.                                                                                                                                                                                                                                                                    |
| **I9** the patch block can turn a failed `diff` into evidence | **FIXED** | §9's block exits with the captured status when it is not 1, before writing anything.                                                                                                                                                                                                                                                                                                                       |
| **Minor 10** three factual corrections                        | **FIXED** | `DOM_EVIDENCE` at `src/test-tiers.test.ts:60` (§4.2); `endOnFailure` is set only when passed `true` (`fast-check.js:1460`) so shrinking is on and the message's `endOnFailure: true` is reproduction advice (§4.5); and the mutation-to-property matrix is §9.1 and §9.2, from a fresh native rehearsal — six of the fourteen faults move the model test, and the rows say which.                          |

## 17. What changed in method, after three rounds

Three reviews each found a race the previous round's tests could not reach. The change is not another
fence: it is that the **rule is written down first** — [the design document](050-7-lifetime-slot-design.md),
with five states, the event list including reentry, and eight invariants that hold inside callbacks —
and that the interleavings are **generated against a reference recorder** instead of imagined, with the
generator's own teeth proved by six sabotage runs before the implementation was trusted. Two checks
that no sabotage could break were deleted rather than shipped. Where the generator is blind, §9.1 says
so in the same table instead of claiming coverage.
