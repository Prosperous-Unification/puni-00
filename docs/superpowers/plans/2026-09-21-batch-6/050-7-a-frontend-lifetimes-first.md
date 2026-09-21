# 050.7a The frontend's lifetime owner: one serialized state machine

|                     |                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item           | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **first packet of several**                                                               |
| Size class          | M                                                                                                                                                                                    |
| Design it serves    | [Code organization design](../../specs/2026-09-19-code-organization-design.md): "Modules", the three-lifetimes table, rules F1 and F2                                                |
| Reviewed source map | [050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md)                                                                                                  |
| Library research    | [DI Bag 0.4.0 React lifecycle guarantees](../../../research/2026-09-21-di-bag-0-4-lifecycle.md)                                                                                      |
| Execution contract  | [batch 1 README](../2026-09-19-batch-1/README.md): "Execution contract", "Rules for every executor", "Standard blocks every packet uses", "Hidden constraints every frontend packet" |
| Model of form       | [050.6 command services](../2026-09-21-batch-3/050-6-command-services.md)                                                                                                            |
| Planning head       | `40be90d3` (`origin/main`, the Burokrat rename merged)                                                                                                                               |
| Revision            | third, after review 2. Sections 15 and 16 disposition both reviews. **The packet was split** — see section 1.                                                                        |

## 1. Goal, the split, and non-goals

**Goal.** Build the one thing every later 050.7 packet hangs off: the lifetime owner, as an explicit
serialized state machine whose races are proved absent by generated interleavings rather than by
hand-written scenarios. Two things land:

1. **`openspec/changes/adopt-frontend-lifetimes`**, covering the whole of 050.7's target shape — the
   three lifetimes, who owns each, the retirement rule, the superseded-transition rule and the fatal
   state — so that every later packet ticks a task instead of opening a change.
2. **`apps/wbs/fe-01/src/runtime/lifetime-slot.ts`**: one slot that owns one runtime, with
   synchronous withdrawal, one serialized transition queue, the generation rechecked after the only
   await that precedes construction, a transactional construction that releases what it acquired when
   it fails, and a disposal failure or bounded-wait expiry that refuses the replacement and is
   terminal. Proved by 19 named example tests **and** a `fast-check` scheduler property over
   generated interleavings, with twelve rehearsed mutations.

**The split, and why.** Two consecutive reviews found a race in this owner: round 1, two same-tick
replacements abandoned a live runtime; round 2, a replacement that arrived _while the old runtime was
being disposed_ passed a fence that was only checked before that disposal. Both were in code that also
carried a DI module, an installer, a page-level slot holder, a composition rewire and a README — and
the owner's own proofs were the smallest part of it. So the module work is now its own packet:

- **this packet (050-7-a)**: the change, and the lifetime owner with its property test.
- **050-7-b**: `module.frontend.preferences`, the transactional installer, the page's application
  lifetime, the composition seam, the README and the module's wiki index. Section 12 lists what it
  owes, including the two obligations review 2 was right about.

**Non-goals**, each because it belongs to a later packet or another change:

- No library version change. `di-bag` stays `0.4.0`; `package.json` and `bun.lock` are untouched.
- No DI module, no installer, no page-level runtime, no `composition.ts` edit, no README edit.
- No React at all: no context, no provider, no `main.tsx`, no component. The slot publishes states; a
  later packet renders them.
- No session runtime and no project runtime.
- No reader-visible behaviour: nothing in this packet is reachable from the running page yet, which is
  exactly why it can be proved in the DOM-free tier in under a second.

## 2. Why an owner with a property test, measured

`fc.scheduler()` is not decoration. Rehearsed on the code this packet replaced — the owner review 1
accepted — the property test failed on its second case:

```text
Counterexample: [schedulerFor()`
-> [task${1}] promise::issue 0 resolved
-> [task${2}] promise::issue 1 resolved
-> [task${3}] promise::dispose r0 resolved
-> [task${4}] promise::dispose r1 rejected with value new Error("r1 refused to dispose")`,[{"kind":"replace","settles":false},{"kind":"replace","settles":false}]]
Shrunk 2 time(s)
Caused by: AssertionError: a superseded request acquired a runtime: expected [ 'r1' ] to deeply equal []
```

That is round 2's defect, found in 250 ms by a test nobody had to think of. The hand-written tests
that shipped with that owner all passed, because every one of them made both requests before the first
disposal began — one interleaving out of the many the scheduler walks.

The same property also fails under six of this packet's twelve mutations, including two that no
example test reached until it was written. Interleaving coverage is therefore part of the contract
here, not an extra.

## 3. Read first

1. `AGENTS.md` (rules R1 to R5) and `LLM_README.md`.
2. The execution contract sections of the [batch 1 README](../2026-09-19-batch-1/README.md).
3. [The 050.7 frontend lifetime map](../2026-09-21-batch-4/050-7-frontend-lifetime-map.md):
   "Authority and DI Bag facts", "Replacement and cleanup policy", and tests 4, 12 and 14 of "Exact
   lifecycle tests".
4. [DI Bag 0.4.0 React lifecycle guarantees](../../../research/2026-09-21-di-bag-0-4-lifecycle.md),
   "Durable implementation requirements" 1 to 5.
5. `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts`, which is the sanitized reporting this
   owner reuses.

## 4. Verified facts

Every claim below was read or run in a worktree off `40be90d3`. Line numbers are that tree's.

### 4.1 What DI Bag 0.4.0 actually does with a failure

Probed with `bun` against the installed `node_modules/di-bag` (version `0.4.0`, pinned in
`tools/tool-devsync/src/toolchain-pins.test.ts:506`):

- a rejecting disposer makes `close()` reject with `DiBagCleanupError`:
  `DI_BAG_CLEANUP_FAILED: Failed to run 1 disposal callback(s);`
- a never-settling disposer under `close({ timeoutMs: 50 })` rejects with
  `DiBagCloseCancelledError`: `DI_BAG_CLOSE_TIMEOUT: Bag close timed out after 50ms; disposers still running: r;`
  whose `details` is `{"operation":"close","reason":"timeout","timeoutMs":50,"pending":["r"],"acquiring":[]}`
  and whose `cleanupPromise` is the shared shutdown. A disposer that settles **after** that rejection
  resolves that promise; one that rejects late rejects it with `DiBagCleanupError`. Both are exercised.
- **a partially acquired graph is released only by `close()` on its own bag.** Measured twice: after
  `bag.resolve('a')` succeeded and `bag.resolve('b')` threw, the recorded disposals were `[]` and only
  `bag.close()` produced `["a"]`; and a factory that called `factoryCtx.pushDisposer(…)` and then threw
  left that disposer unrun until `bag.close()` — `[]` at the throw, `["pushed-first"]` after the close.
  `pushDisposer` needs `{ context: 'acquisition' }` as `fromSyncFactory`'s second argument, as
  `apps/wbs/be-01/src/boot.ts:201` uses it; without it the second parameter is `undefined`.

  **That is why {@link PartialAcquisitionError} exists**: a builder that resolves services one by one
  has to keep its bag reachable, or a half-built graph is an orphan nobody can close. Marking the slot
  fatal disposes nothing.

- `build()` and `resolve()` are **synchronous** for sync factories, so the browser graph needs no
  `await`. `apps/wbs/be-01/src/boot.ts:89` awaits only because that graph has async work.

### 4.2 The frontend as it stands, and what this packet does not touch

- `apps/wbs/fe-01/src/modules/` holds six module directories and **no `module.ts`**: composition is
  `composition.ts` files. This packet adds no module and changes none of them.
- `di-bag` is imported today from `apps/wbs/be-01/src/boot.ts:4` and from the fe-01 browser probes
  `apps/wbs/fe-01/e2e/browser-packages-probe.ts:3`. **`di-bag` and not `di-bag/node`**:
  `apps/wbs/fe-01/browser-packages.test.ts:48` and `e2e/browser-packages.spec.ts:50` both carry
  observed proofs that the node entrypoint breaks the browser bundle. The slot imports
  `DiBagCloseCancelledError` from `di-bag`, and its tests import `DiBag` from the same entrypoint.
- `apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts` exports `discloseFault(thrown)` and
  `DisclosedFault`: the sanitized public sentence, the occurrence handle and what was lost. It imports
  `@shared/failures` and **no React**, so this owner may reuse it, and the map's requirement that the
  lifecycle-failure boundary use "the same sanitized public/diagnostic reporting … as the root fault
  path" is met by calling it rather than by a second policy.
- `fast-check` is a root devDependency at `package.json:103` (`"fast-check": "^4.9.0"`, installed
  `4.9.0`). It is already used elsewhere in the repository's test tiers, and this packet adds no
  dependency. `scheduler.waitAll()` is **deprecated** in 4.9.0 and `wbs-fe-01:lint` refuses it
  (`@typescript-eslint/no-deprecated`, observed twice); the listing uses `waitIdle()`.

### 4.3 How the node tier selects files, and what a red looks like here

`apps/wbs/fe-01/vitest.node.config.ts` sets `include: [...NODE_SUITES]`. A path passed on the command
line is a **filter applied after** that include list, not an override: with the file absent from
`NODE_SUITES`, `bunx vitest run --config vitest.node.config.ts src/runtime/lifetime-slot.test.ts`
prints `No test files found, exiting with code 1`. Observed. So slice 2 adds both suite entries in the
same step as the test files, before any red run.

A red here is therefore not a missing-module collection error: slice 2 writes the tests, their suite
entries **and a skeleton whose factory throws**, so the red selects every test it is about and fails
on one message. The skeleton's message carries **no budget number**, deliberately: three of the tests
build a slot with a 50 ms budget, and a message that interpolated the budget produced two different
diagnostics and an executor stop. Observed red: `Tests 20 failed (20)`, every one on
`Error: the lifetime slot is not implemented`.

`apps/wbs/fe-01/src/test-tiers.test.ts` refuses any disagreement between `NODE_SUITES` and the
evidence in the files; its `DOM_EVIDENCE` regex (`src/test-tiers.test.ts:66`) reads a file that merely
writes `document`, `window`, `location` or `localStorage` as needing a browser. **Both new test files
avoid those words** and belong in the node tier.

### 4.4 Targets, tiers and the sandbox

- `apps/wbs/fe-01/project.json` has `test` (two vitest runs, jsdom then zoned), `test:unit` (the node
  tier), `lint`, `lint:fast`, `typecheck`, `build`, `e2e`, `e2e-packaged`. fe-01 has **no**
  `lint:source`; only the Burokrat project does.
- **The executor never runs `wbs-fe-01:test:unit` or `wbs-fe-01:test` through Nx**: three of their
  tests spawn `bun` from Node and the sandbox refuses with `spawnSync bun EPERM`. It runs the sandbox
  unit command of step 0 instead.
- **`bun test <dir>` is a filter, not a path.** From the repository root it also collects the compiled
  copies a typecheck leaves under `dist/out-tsc/<dir>`, which is how a green baseline turns red in a
  clone where an earlier slice ran `typecheck`. This packet prescribes **no** `bun test` command, and
  its vitest commands were re-rehearsed after `wbs-fe-01:typecheck` had written
  `dist/out-tsc/apps/wbs/fe-01/*.test.js` into the same worktree: the node tier selected exactly the
  same files and tests, because `include` is the explicit `NODE_SUITES` list and `dist` is outside it.
- The whole jsdom tier, the zoned tier, `wbs-fe-01:build`, `tool-devsync:test`,
  `twilight-burokrat:test` and every Chromium run are **planner-only**, with observed values in
  section 10. This packet touches no component, so the browser lane has nothing new to show; the
  planner ran it anyway (section 10).

### 4.5 The property test is deterministic, and fast

`{ seed: 20260922, numRuns: 500 }` is pinned in the listing, so the executor walks the same 500
interleavings the planner did. Measured: the file runs in **245 ms** (`Duration 245ms`), and the two
runtime suites together in **386 ms**. The `endOnFailure: true` default means a failure prints one
shrunk counterexample and the seed, which is what section 9 quotes.

### 4.6 The rehearsal, and its numbers

| What                                    | Observed                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Sandbox unit command, before any change | `42 passed (42)` files, `614 passed (614)` tests, exit 0                      |
| Sandbox unit command, after both slices | `44 passed (44)` files, `634 passed (634)` tests, exit 0                      |
| The two new suites together             | `2 passed (2)` files, `20 passed (20)` tests, 386 ms                          |
| The skeleton red                        | exit 1, `Tests 20 failed (20)`, all on `the lifetime slot is not implemented` |
| `wbs-fe-01:typecheck`                   | exit 0                                                                        |
| `wbs-fe-01:lint`                        | exit 0, after `waitAll` was replaced and `eslint --fix` sorted imports        |
| Twelve mutations                        | each fails its named test; section 9 has the counts and diagnostics           |
| `openspec validate --all --json`        | exit 0, `113` items, `113` passed, `0` failed; this change `valid: true`      |
| Two real `git commit`s with lefthook on | exit 0 each; `tool-wiki`, `plaintext-secrets`, `format`, `lint` all ✔         |

Absolute numbers are orientation only: every expectation in section 7 is relative to the baseline that
slice records itself.

### 4.7 Pins, kinds and the wiki index

`tool-devsync:test` passed with the new files committed (`366 pass`, `0 fail`). This packet adds no
project, target or CI path, so `apps/wiki/cli/src/policy/pilot-policy.test.ts` — which reads the
repository at `HEAD` through git — has nothing to disagree with. `docs/code-organization/kinds.json`
gains nothing: `tools/tool-devsync/src/service-kinds.ts:15` limits `SERVICE_ROOTS` to three backend
and library directories, and `src/runtime/` is outside all three.

**The wiki module index is 050-7-b's, and for a corrected reason.** Nine READMEs carry a
`<!-- module-index … -->` comment today (`apps/wiki/cli`, `apps/wiki/consumer`,
`libs/wbs/domain/domain/src/saved-plan`, `libs/wbs/application/core/src/use-cases`,
`libs/wbs/adapters/store-memory/src`, `tools/tool-dagger/src/lib`, `docs/findings`,
`docs/refactoring/w4-4`, and `openspec/changes/archive/2026-09-08-bounded-replay-sweep`), none under
`apps/wbs/fe-01`. This packet adds no module directory and so owes no index. The **earlier claim that
an index needs a `docs/wiki-policy/modules.json` row is withdrawn**: `checkIndexes`
(`apps/wiki/cli/src/indexes/check-indexes.ts:409`) reads the index comment and the candidate's own
entries and loads no mapping, and `apps/wiki/cli/src/policy/trust.ts:1248` requires a mapping only for
an index whose membership hash matches a _selected pilot boundary_ — its own Proof comment says the
unrelated `docs/findings` index stays outside that coverage. The CSS-extractor rationale is withdrawn
too: `apps/wiki/cli/src/relationships/typescript.ts:401` now classifies a compiler-supported ambient
import as `ambient-non-code`, with a Proof comment naming the virtual-stylesheet production test.
Section 12 makes the index an explicit obligation of 050-7-b, where the module it indexes is created.

`bin/tool-wiki-lint.sh:21` prints `{"schemaVersion":1,"status":"inactive",…}` and exits 0 when
`TOOL_WIKI_ACTIVATION_ROOT` names nothing **and** `TOOL_WIKI_REQUIRE_CERTIFIED` is `0` (its default);
with that variable set to `1` the same state exits 78 (`bin/tool-wiki-lint.sh:19`). So the `tool-wiki`
tick on a local commit means the launcher refused nothing, not that a validator ran.

## 5. The state machine

Five states. The transition table is the contract, and it is repeated in the type's own JSDoc because
that is where a reader of the code will look:

| From               | Event                                                   | To                       |
| ------------------ | ------------------------------------------------------- | ------------------------ |
| `empty`            | `open`                                                  | `live`                   |
| `live`             | `replace` or `retire` accepted (**synchronously**)      | `retiring`               |
| `retiring`         | the withdrawn runtime's disposal succeeded, build asked | `constructing`           |
| `retiring`         | that disposal succeeded, `retire`                       | `empty`                  |
| `retiring`         | that disposal rejected or outran its budget             | `fatal`, terminal        |
| `retiring`         | the request was overtaken while the disposal ran        | refused as superseded    |
| `constructing`     | the build succeeded                                     | `live`                   |
| `constructing`     | the build failed; what it acquired was released         | `fatal`, not terminal    |
| `constructing`     | the build failed and that release rejected or timed out | `fatal`, terminal        |
| `fatal`, terminal  | any request                                             | refused with the refusal |
| `fatal`, not term. | `replace`                                               | `constructing`           |

Three properties hold it together, and each has its own mutation in section 9:

1. **Withdrawal is synchronous.** `replace` and `retire` withdraw publication and number the request
   before they return their promise, so a reader cannot see a runtime the page has already given up
   on, and a second trigger finds nothing current.
2. **One transition at a time.** Each queues behind the previous one, so two disposals never overlap.
3. **The generation is rechecked after the disposal**, which is the only await before construction.
   `Acquire<S>` is synchronous, so there is nothing to recheck after it; a lifetime that ever needs an
   asynchronous construction needs one more fence there, and the property test is what would say so.

**Three checks were deleted rather than shipped unprovable.** A pre-queue fence, a post-construction
fence and a microtask deferral all survived every mutation the planner could write, because ordinals
are assigned synchronously and construction is synchronous: the post-disposal fence already decides
every case they could. AGENTS.md R5 says a check that cannot fail is worse than none, so they are
gone, and the surviving fence's comment says why there is only one.

## 6. File plan

| Path                                                                               | Slice | Create or modify | Note                                            |
| ---------------------------------------------------------------------------------- | ----- | ---------------- | ----------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/.openspec.yaml`                         | 1     | created by CLI   | written by `openspec new change`, never by hand |
| `openspec/changes/adopt-frontend-lifetimes/proposal.md`                            | 1     | create           | 393 words, section 8.1                          |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` | 1     | create           | six requirements, each with a normative SHALL   |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                               | 1     | create           | 13 tasks; this packet ticks task 1              |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                              | 1–4   | create, append   | every slice appends its own observations        |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`                                      | 2     | create           | the state machine                               |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts`                                 | 2     | create           | 19 named tests                                  |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.interleavings.test.ts`                   | 2     | create           | the `fast-check` scheduler property             |
| `apps/wbs/fe-01/vitest.node-suites.ts`                                             | 2     | modify           | the two new entries, together                   |

**Nine paths.** Nothing else — no module, no installer, no component, no `main.tsx`, no
`package.json`, no `bun.lock`, no `docs/wiki-policy/`.

## 7. Slices

Four slices. Each is one attempt, ends in one planner commit with the exact subject given, and begins
with its own step 0.

**Dispatch.** The launcher is `/home/df/wd/puni/puni-plan/exec/run-executor.sh`; the planner runs it:

```sh
/home/df/wd/puni/puni-plan/exec/run-executor.sh 050-7-a-frontend-lifetimes-first <slice> <base> \
  --batch batch-6 --preserve evidence
```

`--batch batch-6` is enough for the directory. **No `--network`** is needed by any slice: nothing here
listens, dials or downloads, and the launcher warms the OpenSpec command before the attempt starts.
Slice 4 is dispatched with `--seed <each earlier slice's preserved evidence directory>`, which the
launcher merges into `$TMPDIR/evidence`.

**Evidence.** Every log goes to `$TMPDIR/evidence` with a slice-specific name
(`slice2-red.log`, `slice3-N4.log`, …), because that is the directory the launcher preserves.
`verify.md` references those **basenames** and never an absolute clone, home or temporary path: it is
published.

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

  Expected: exit 0. **Never** run `wbs-fe-01:test:unit` or `wbs-fe-01:test`: three of their tests spawn
  `bun` from Node and the sandbox refuses that with `spawnSync bun EPERM`.

- [ ] In slices 1 and 4 only, record the OpenSpec baseline and call `summary.totals.items` **V0**:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
    > "$TMPDIR/evidence/slice<N>-step0-openspec.json" 2>&1; echo "exit=$?"
  ```

### Slice 1 — the change, opened by the tool

Subject: `feat(fe-01): open the frontend lifetimes change`

Pre-edit check: `openspec/changes/adopt-frontend-lifetimes/` does not exist. If it does, stop and read
what is in it before writing anything.

- [ ] Create the change **with the CLI**, never by hand:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change adopt-frontend-lifetimes \
    --schema sdd-lean > "$TMPDIR/evidence/slice1-openspec-new.log" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0, `Created change 'adopt-frontend-lifetimes' at openspec/changes/adopt-frontend-lifetimes/`,
  and exactly one file created: `.openspec.yaml`, holding `schema: sdd-lean` and a `created:` date.

- [ ] Write `proposal.md`, `specs/adopt-frontend-lifetimes/spec.md` and `tasks.md` **exactly** as
      sections 8.1, 8.2 and 8.3 give them, then `verify.md` with a `## Slice 1` heading.

- [ ] Validate:

  ```sh
  OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json \
    > "$TMPDIR/evidence/slice1-openspec-after.json" 2>&1; echo "exit=$?"
  ```

  Expected: exit 0; `summary.totals.failed` is `0`; `summary.totals.items` is **V0 + 1**; and the entry
  whose `id` is `adopt-frontend-lifetimes` has `"valid": true` and `"issues": []`. Read those fields
  out of the JSON — an exit code alone does not say the new change was seen.

- [ ] Format: `GSETTINGS_BACKEND=memory bunx prettier --check openspec/changes/adopt-frontend-lifetimes`
      (`--write` first if it refuses; exit 0 afterwards).

Hand over, **five** paths:

```text
?? openspec/changes/adopt-frontend-lifetimes/.openspec.yaml
?? openspec/changes/adopt-frontend-lifetimes/proposal.md
?? openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
?? openspec/changes/adopt-frontend-lifetimes/tasks.md
?? openspec/changes/adopt-frontend-lifetimes/verify.md
```

`F0`/`T0` must be unchanged by this slice.

### Slice 2 — the state machine, red then green

Subject: `feat(fe-01): own one lifetime as a serialized state machine`

Pre-edit check: `apps/wbs/fe-01/src/runtime/` does not exist, and
`openspec/changes/adopt-frontend-lifetimes/proposal.md` does — if the second is missing, this slice was
dispatched on the wrong base.

- [ ] Write, in one step and before any run: `apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts` exactly
      as section 8.4; `apps/wbs/fe-01/src/runtime/lifetime-slot.interleavings.test.ts` exactly as
      section 8.5; the **skeleton** `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` exactly as section
      8.6; and **both** entries in `apps/wbs/fe-01/vitest.node-suites.ts`, in the list's sorted position
      between `src/modules/preferences/preferences.resource.test.ts` and `src/test-tiers.test.ts`:

  ```ts
  // The page's own lifetime ownership: plain TypeScript over DI Bag, no browser
  // global and no component, which is the whole point of rule F1.
  'src/runtime/lifetime-slot.interleavings.test.ts',
  'src/runtime/lifetime-slot.test.ts',
  ```

- [ ] Run the red and record it:

  ```sh
  (cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/runtime) \
    > "$TMPDIR/evidence/slice2-red.log" 2>&1; echo "exit=$?"
  ```

  Expected, observed by the planner: exit 1, `Test Files 2 failed (2)`, **`Tests 20 failed (20)`**,
  every one of them on `Error: the lifetime slot is not implemented`. A run that says
  `No test files found` means the suite entries are missing; a run that says `Tests no tests` means the
  skeleton is missing. Either is a stop, not a red.

- [ ] Replace the skeleton's body with section 8.7, keeping every
      `eslint-disable-next-line @typescript-eslint/only-throw-error` and the comment above it that
      names the boundary. Without those comments `lint` refuses the file: rethrowing a caught `unknown`
      is `Expected an error object to be thrown`.

- [ ] Green, twice — the directory, then the whole tier:

  Expected for the directory: exit 0, `Test Files 2 passed (2)`, `Tests 20 passed (20)`, about 400 ms.
  Then the sandbox unit command: exit 0, **F0 + 2** files and **T0 + 20** tests.

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck` — exit 0. Required in this slice: it declares a
      generic interface whose members are readonly function-valued properties, which is the shape batch
      1's variance break had, and the scheduler's `then` callback is where the planner's first draft
      failed (`TS2345 … Type 'Promise<Tracked | undefined>' is not assignable`).

- [ ] `NX_DAEMON=false bunx nx run wbs-fe-01:lint` — exit 0. An import-order or Prettier complaint is
      autofixable: `bunx eslint --fix apps/wbs/fe-01/src/runtime` and rerun. **`scheduler.waitAll()` is
      not autofixable**: it is deprecated in fast-check 4.9.0 and the lint refuses it, which is why the
      listing uses `waitIdle()`.

Hand over, **four** paths:

```text
?? apps/wbs/fe-01/src/runtime/lifetime-slot.interleavings.test.ts
?? apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts
?? apps/wbs/fe-01/src/runtime/lifetime-slot.ts
 M apps/wbs/fe-01/vitest.node-suites.ts
```

### Slice 3 — the twelve negatives

Subject: `test(fe-01): prove every lifetime check with its own mutation`

Pre-edit check: `apps/wbs/fe-01/src/runtime/lifetime-slot.ts` exists and the directory is green.

- [ ] For each row of section 9, in order: copy the passing file to `$TMPDIR`, inject **that fault
      alone**, run `(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/runtime)`,
      record the counts and the named test's diagnostic, restore with `cp`, and prove the restore with
      `cmp` before asserting on any captured status.

- [ ] Write each fault's adjacent dated `Proof:` comment into `lifetime-slot.ts` on the line it was
      injected into, naming the fault and the observed test — the format
      `apps/wbs/be-01/src/boot.ts:94` uses.

- [ ] Green again after the comments: `Tests 20 passed (20)`, then `wbs-fe-01:lint` and
      `wbs-fe-01:typecheck`, exit 0 each.

- [ ] Append every observation to `verify.md` under `## Slice 3`.

Hand over, two paths: ` M apps/wbs/fe-01/src/runtime/lifetime-slot.ts` and
` M openspec/changes/adopt-frontend-lifetimes/verify.md`.

### Slice 4 — tick the change and hand over

Subject: `docs(fe-01): record the lifetime owner as done`

Dispatched with `--seed` for each earlier slice's preserved evidence directory.

- [ ] Tick **task 1** in `openspec/changes/adopt-frontend-lifetimes/tasks.md` — `- [x]` — and nothing
      else. Tasks 2 to 13 stay open and are the next packets' (section 12).

- [ ] Append a `## Slice 4` section to `verify.md` holding the failure-proof table of section 9 with
      **the diagnostics the earlier attempts observed**, each row naming the attempt and the evidence
      basename it came from. Do not claim any proof ran in this slice.

- [ ] Re-validate. Expected: exit 0, `failed: 0`, `adopt-frontend-lifetimes` still `valid: true`, and
      `summary.totals.items` equal to **this slice's own V0** — ticking a checkbox adds no item.

- [ ] `GSETTINGS_BACKEND=memory bunx prettier --check` over every path this packet owns; then
      `wbs-fe-01:lint` and `wbs-fe-01:typecheck` once more, both exit 0.

- [ ] Print the cumulative diff, **scoped to the paths this packet owns**, so a revised packet file
      committed by the planner cannot change the answer:

  ```sh
  git diff --name-only <slice-1 base> -- apps/wbs/fe-01 openspec/changes/adopt-frontend-lifetimes
  ```

  Expected: the nine paths of section 6, and nothing else.

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

The collaborators are **real DI Bag graphs** with chosen disposers, not hand-written `close` functions
that reject: the refusals under test are `DiBagCleanupError` and `DiBagCloseCancelledError`, and a stub
would prove the slot against a shape the library never produces. Each fixture records its close count,
the `timeoutMs` it was given, and the slot's status **as seen from inside its own disposer**, which is
what makes the ordering and budget checks breakable.

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

    // The `open` above is the first entry: what matters is that `retiring` and
    // then `constructing` come before the replacement, so no reader can ever see
    // two live runtimes, and the states say which half of the transition is running.
    expect(seen).toEqual(['live', 'retiring', 'constructing', 'live']);
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

  it('refuses a request that was already queued when the disposal failed', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    slot.open(() => runtimeNamed('first', refuses).runtime);
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

  it('withdraws publication synchronously, before the first await', () => {
    const slot = createLifetimeSlot<NamedServices>();
    const first = runtimeNamed('first', settles);
    slot.open(() => first.runtime);

    const replacing = slot.replace(() => runtimeNamed('second', settles).runtime);

    // Read before any await: the map requires withdrawal to be synchronous, and a
    // slot that withdrew inside its queued transition would still say `live` here.
    expect(slot.snapshot()).toEqual({ status: 'retiring' });
    return replacing.then(() => undefined);
  });

  it('does not build for a request that a newer one overtook during the disposal', async () => {
    const slot = createLifetimeSlot<NamedServices>();
    const pending = deferred();
    const first = runtimeNamed('first', () => pending.promise);
    slot.open(() => first.runtime);
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
    slot.open(() => first.runtime);
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
    slot.open(() => runtimeNamed('first', settles).runtime);
    const partial = acquiresThenThrows(refuses);

    await expect(slot.replace(partial.acquire)).rejects.toThrow('DI_BAG_CLEANUP_FAILED');

    const fatal = slot.snapshot();
    expect(fatal.status === 'fatal' ? fatal.terminal : false).toBe(true);
    const third = runtimeNamed('third', settles);
    await expect(slot.replace(() => third.runtime)).rejects.toThrow('DI_BAG_CLEANUP_FAILED');
    expect(third.closes()).toBe(0);
  });
});
```

### 8.5 `apps/wbs/fe-01/src/runtime/lifetime-slot.interleavings.test.ts`

```ts
import { DiBag } from 'di-bag';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createLifetimeSlot, type RetirableRuntime } from './lifetime-slot';

/**
 * What one generated runtime is: a name, and a record of what happened to it.
 *
 * The record is the whole point. The invariants below are about acquisition and
 * disposal counts, not about return values: a runtime that was built and never
 * closed is the defect two rounds of hand-written tests missed.
 */
interface Tracked {
  readonly name: string;
  acquisitions: number;
  disposals: number;
}

/** One generated request against the slot. */
type Command =
  { readonly kind: 'replace'; readonly settles: boolean } | { readonly kind: 'retire' };

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  fc.record({ kind: fc.constant('replace' as const), settles: fc.boolean() }),
  fc.record({ kind: fc.constant('retire' as const) }),
);

/**
 * The interleaving property: one serialized owner, whatever order promises settle in.
 *
 * `fc.scheduler()` owns two orderings at once — when each request is **issued**
 * and when each disposal **finishes** — so a request can arrive in the middle of
 * the previous runtime's disposal. That interval is what two rounds of
 * hand-written tests could not reach: a test that makes both requests before the
 * first disposal starts exercises one interleaving out of many, and the fence
 * that only runs before the first `await` passes it.
 *
 * Deterministic on purpose: `seed` and `numRuns` are pinned so the executor sees
 * the same interleavings the planner saw.
 */
describe('one lifetime’s ownership, under every interleaving fast-check can find', () => {
  it('never acquires a runtime for a superseded request, and abandons none it acquired', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.array(commandArb, { minLength: 2, maxLength: 5 }),
        async (scheduler, commands) => {
          const slot = createLifetimeSlot<Tracked>(50);
          const tracked: Tracked[] = [];
          /** The newest request issued so far; a factory may only run for this one. */
          let newest = 0;
          /** Requests whose factory ran while a newer request already existed. */
          const staleBuilds: string[] = [];

          const build = (name: string, settles: boolean): RetirableRuntime<Tracked> => {
            const record: Tracked = { name, acquisitions: 0, disposals: 0 };
            const bag = DiBag.createBuilder()
              .register({
                owned: DiBag.withDisposal(
                  DiBag.fromSyncFactory((): Tracked => {
                    record.acquisitions += 1;
                    return record;
                  }),
                  async () => {
                    await scheduler.schedule(
                      settles
                        ? Promise.resolve()
                        : Promise.reject(new Error(`${name} refused to dispose`)),
                      `dispose ${name}`,
                    );
                    record.disposals += 1;
                  },
                ),
              })
              .build();
            const services = bag.resolve('owned');
            tracked.push(record);
            return { services, close: (options) => bag.close(options) };
          };

          const opened = build('r0', true);
          slot.open(() => opened);

          const issued = commands.map((command, at) =>
            scheduler.schedule(Promise.resolve(), `issue ${String(at)}`).then(async () => {
              const ordinal = (newest += 1);
              if (command.kind === 'retire') {
                await slot.retire().catch(() => undefined);
                return;
              }
              await slot
                .replace(() => {
                  // The fence, asserted where it matters: a factory that runs for
                  // a request a newer one has already replaced is the defect.
                  if (ordinal !== newest) staleBuilds.push(`r${String(ordinal)}`);
                  return build(`r${String(ordinal)}`, command.settles);
                })
                .catch(() => undefined);
            }),
          );

          await scheduler.waitIdle();
          await Promise.all(issued);
          await scheduler.waitIdle();

          const held = slot.snapshot();
          const live = held.status === 'live' ? held.services : null;

          expect(staleBuilds, 'a superseded request acquired a runtime').toEqual([]);
          for (const record of tracked) {
            if (record === live) continue;
            if (record.acquisitions === 0) continue;
            // A fatal slot has stopped disposing on purpose: its refusal is the
            // reason, and the late-cleanup promise is what accounts for the rest.
            if (held.status === 'fatal') continue;
            expect(record.disposals, `${record.name} was acquired and never disposed`).toBe(1);
          }
        },
      ),
      { seed: 20260922, numRuns: 500 },
    );
  }, 60_000);
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
`import type { DisclosedFault } from '@/components/chrome/fault-disclosure';` — the skeleton uses
neither `di-bag` nor `discloseFault`.

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
 * unrun until `bag.close()`), so a builder that resolves services one by one
 * has to keep that bag reachable. A builder that throws anything else is taken
 * at its word: it acquired nothing.
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
 * A transition that a newer request replaced before it could acquire anything.
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
 * The five states and the transitions between them:
 *
 * | From           | Event                                                  | To                       |
 * | -------------- | ------------------------------------------------------ | ------------------------ |
 * | `empty`        | `open`                                                 | `live`                   |
 * | `live`         | `replace` or `retire` accepted (synchronously)          | `retiring`               |
 * | `retiring`     | the withdrawn runtime's disposal succeeded, build asked  | `constructing`           |
 * | `retiring`     | the withdrawn runtime's disposal succeeded, `retire`     | `empty`                  |
 * | `retiring`     | that disposal rejected or outran its budget              | `fatal`, terminal        |
 * | `constructing` | the build succeeded and is still the newest request      | `live`                   |
 * | `constructing` | the build succeeded but a newer request exists           | closed, `retiring` again |
 * | `constructing` | the build failed; what it acquired was released          | `fatal`, not terminal    |
 * | `constructing` | the build failed and that release rejected or timed out  | `fatal`, terminal        |
 * | `fatal` term.  | anything                                                | refused with the refusal |
 * | `fatal` not t. | `replace`                                               | `constructing`           |
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
  readonly open: (acquire: Acquire<S>) => S;
  /**
   * Retire what is current and publish the replacement **only if** that
   * retirement succeeded and no newer request has arrived meanwhile.
   *
   * Publication is withdrawn **synchronously**, before this returns its promise.
   * Transitions then run one at a time, in request order, and the request's
   * generation is rechecked after every await: after the queue, after the
   * disposal, and after the construction.
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

/**
 * One lifetime's ownership, as a serialized state machine.
 *
 * Every trigger reaches one disposal: withdrawal is synchronous, so the second
 * trigger finds nothing current, and the queue keeps the disposal itself
 * single. The generation is rechecked after every await, which is what stops a
 * request that was overtaken **during** a disposal from acquiring a runtime
 * nobody would close. The interleaving property test is what proves that;
 * `fc.scheduler()` reaches orders a hand-written test does not.
 */
export function createLifetimeSlot<S>(
  /**
   * The bounded wait this slot gives a disposal, in milliseconds.
   *
   * Production takes {@link RETIREMENT_BUDGET_MS}; a test names a short one so
   * the never-settling-disposer proof does not sit for five seconds. There is no
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
  /** The refusal that made this slot terminally fatal, rethrown to every later trigger. */
  let refused: unknown = null;
  /** The transition currently running, so the next one queues behind it. */
  let running: Promise<unknown> | null = null;
  /** The newest accepted request; an older one that has not published yet is superseded. */
  let newest = 0;
  const listeners = new Set<() => void>();

  const publish = (next: LifetimeState<S>): void => {
    state = next;
    for (const listener of listeners) listener();
  };

  /** Records a bounded wait that expired, and keeps watching what it stopped waiting for. */
  const observeLate = (refusal: unknown): void => {
    late = lateCleanupOf(refusal);
    if (late === null) return;
    lateEnded = 'pending';
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
  };

  /** Makes this slot terminally fatal, and hands the refusal on. */
  const refuse = (refusal: unknown): never => {
    refused = refusal;
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

  /** One queued transition, generation-checked after every await. */
  const transition = async (request: Request<S>, ordinal: number): Promise<S | null> => {
    const ahead = running;
    const mine = (async (): Promise<S | null> => {
      // One transition at a time, in request order: the queue is what keeps two
      // disposals from overlapping and what makes the fence below meaningful.
      if (ahead !== null) await ahead.catch(() => undefined);
      await disposeWithdrawn();
      // **The fence**, after the only await that precedes construction. A request
      // overtaken *while* the old runtime was letting go must not build: that
      // interval is where a fence checked once at the top of a transition fails,
      // and where a superseded request acquired a runtime nobody would close.
      //
      // Ordinals are assigned synchronously in `accept`, so a same-tick successor
      // is already counted here and needs no extra deferral; and `Acquire<S>` is
      // synchronous, so there is no await between this check and publication. A
      // lifetime that ever needs asynchronous construction needs one more fence
      // after it, and the interleaving property test is what would say so.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (refused !== null) throw refused;
      if (request.kind === 'retire') {
        if (state.status === 'retiring') publish({ status: 'empty' });
        return null;
      }
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
      held = built;
      publish({ status: 'live', services: built.services });
      return built.services;
    })();
    running = mine;
    try {
      return await mine;
    } finally {
      if (running === mine) running = null;
    }
  };

  /**
   * Accepts a request: refuses a terminal slot, withdraws publication **now**,
   * and numbers the request so the fences can tell it from a newer one.
   */
  const accept = (): number => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (refused !== null) throw refused;
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
    open: (acquire) => {
      if (state.status !== 'empty') {
        throw new Error(`a lifetime slot that is ${state.status} cannot be opened again`);
      }
      const opened = acquire();
      held = opened;
      publish({ status: 'live', services: opened.services });
      return opened.services;
    },
    replace: async (acquire) => {
      const ordinal = accept();
      const published = await transition({ kind: 'replace', acquire }, ordinal);
      if (published === null) {
        throw new Error('a replacement transition published nothing');
      }
      return published;
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

## 9. Negative proofs

Twelve faults, each injected **alone**, each with the counts and the diagnostic the planner really
observed on 2026-09-22 against the listings above. Copy the passing file to `$TMPDIR` first, save the
mutation as a patch under `$TMPDIR/evidence`, restore with `cp` and prove the restore with `cmp`
**before** asserting on any captured status. Never `rm` a scratch file.

Save a patch with one command and check its status directly — **never** through a pipeline, because
under `pipefail` Bash reports the rightmost status and a first command that exited 2 on a missing input
then reads as a clean diff:

```sh
if out=$(diff -u "$TMPDIR/<name>.passing" "<the file>"); then
  printf 'the mutation changed nothing\n' >&2; exit 1
else
  status=$?; test "$status" -eq 1; printf '%s\n' "$out" > "$TMPDIR/evidence/<name>.patch"
fi
```

A proof succeeds when the **named** test fails. Extra failures are recorded, not a stop; where one
mutation fails several tests the row says which. Six of the twelve also fail the interleaving property,
which is quoted where it does.

| #       | Fault, exactly                                                                                                                                             | Named test that must fail                                                                      | Observed                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **N1**  | delete the `if (refused !== null) throw refused;` line (and its `eslint-disable` comment) that stands **after** `await disposeWithdrawn()`                 | `refuses a request that was already queued when the disposal failed`                           | `2 failed \| 18 passed (20)`; `AssertionError: expected [ 'rejected', 'fulfilled' ] to deeply equal [ 'rejected', 'rejected' ]`; the property fails too, on `r1 was acquired and never disposed` |
| **N2**  | in `refuse`, delete `refused = refusal;`                                                                                                                   | `refuses every later transition of a slot whose retirement failed`                             | `4 failed \| 16 passed (20)`; `AssertionError: promise resolved "{ name: 'third' }" instead of rejecting`                                                                                        |
| **N3**  | in `observeLate`, replace `late = lateCleanupOf(refusal);` with `late = null;`                                                                             | `fails the transition when the retirement outruns its budget, and keeps watching the disposal` | `3 failed \| 17 passed (20)`; `AssertionError: expected null to be an instance of Promise`                                                                                                       |
| **N4**  | in `observeLate`, delete the whole `void late.then( … );` block                                                                                            | `observes a late disposal that finishes after the wait expired, without publishing anything`   | `2 failed \| 18 passed (20)`; `AssertionError: expected 'pending' to be 'settled'`, and the rejection case on `… to be 'failed'`                                                                 |
| **N5**  | in `open`, delete the `if (state.status !== 'empty') { throw … }` block                                                                                    | `refuses a second open, because nothing would be left holding the first close`                 | `1 failed \| 19 passed (20)`; `AssertionError: expected [Function] to throw an error`                                                                                                            |
| **N6**  | in `transition`, delete `if (ahead !== null) await ahead.catch(() => undefined);`                                                                          | `joins one retirement for every trigger of the same runtime`                                   | `2 failed \| 18 passed (20)`; `AssertionError: expected 'empty' to be 'retiring'` — the second trigger publishes `empty` while the first is still disposing                                      |
| **N7**  | in `accept`, delete the `if (held !== null) { withdrawn = held; held = null; publish({ status: 'retiring' }); }` block, keeping `newest += 1;`             | `withdraws publication synchronously, before the first await`                                  | `16 failed \| 4 passed (20)`; the property fails on `r0 was acquired and never disposed`, and the synchronous-withdrawal case on the immediate snapshot                                          |
| **N8**  | change the default parameter to `budgetMs: number = 4_000`                                                                                                 | `gives the retirement the production budget when it is built with none`                        | `1 failed \| 19 passed (20)`; `AssertionError: expected [ 4000 ] to deeply equal [ 5000 ]` — read off the close the runtime really received                                                      |
| **N9**  | delete the fence: `if (ordinal !== newest) throw new TransitionSupersededError(ordinal, newest);` immediately before `publish({ status: 'constructing' })` | `does not build for a request that a newer one overtook during the disposal`                   | `3 failed \| 17 passed (20)`; `AssertionError: expected [ 'r1' ] to deeply equal []` from the property, with the counterexample of section 2, and `expected 'fulfilled' to be 'rejected'`        |
| **N10** | in the construction `catch`, delete `publish({ status: 'fatal', fault: discloseFault(failure), terminal: false });`                                        | `is fatal but not terminal when the replacement’s construction throws`                         | `2 failed \| 18 passed (20)`; `AssertionError: expected 'constructing' to be 'fatal'`                                                                                                            |
| **N11** | in the construction `catch`, delete the whole `if (failure instanceof PartialAcquisitionError) { … }` block                                                | `releases what a half-finished construction acquired, and stays buildable`                     | `2 failed \| 18 passed (20)`; `AssertionError: expected +0 to be 1` — the resource it acquired was never released                                                                                |
| **N12** | in that block, replace `catch (releaseRefusal) { refuse(releaseRefusal); }` with an empty `catch { }`                                                      | `is terminal when the half-finished construction cannot be released`                           | `1 failed \| 19 passed (20)`; `AssertionError: expected [Function] to throw error including 'DI_BAG_CLEANUP_FAILED' but got 'the lifetime could not be built, and …'`                            |

## 10. Verification

### The executor runs, per slice

| Command                                                                             | Expected                                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| the sandbox unit command of step 0                                                  | exit 0, F0/T0 recorded, then the slice's relative delta    |
| `(cd apps/wbs/fe-01 && bunx vitest run --config vitest.node.config.ts src/runtime)` | slice 2's red, then exit 0 with `Tests 20 passed (20)`     |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`                                   | exit 0                                                     |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint`                                        | exit 0 (autofix import order; never reinstate `waitAll`)   |
| `GSETTINGS_BACKEND=memory bunx prettier --check <the slice's files>`                | exit 0                                                     |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`       | slice 1: V0 + 1 items; slice 4: V0 items; `failed: 0` both |

Keep the status of every command (`cmd > log 2>&1; echo "exit=$?"`). Never read a status through a
`tee` or a pipeline.

### Planner-only, with the values the planner observed

| Command                                                                                            | Observed                                                                         |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1` in `apps/wbs/fe-01` (the jsdom tier) | exit 0, `124 passed (124)` files, `2918 passed (2918)` tests                     |
| `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`                                    | exit 0, `366 pass`, `0 fail` — no inventory or digest pin moved                  |
| `NX_DAEMON=false bunx nx run twilight-burokrat:test`                                               | exit 0, `764 pass`, `0 fail`, 19m, run alone on the host                         |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                      | pending planner verification; nothing in the page's bundle imports this file yet |
| `CI=1 E2E_PORT_SHIFT=2400 … wbs-fe-01:e2e -- <three preference specs>`                             | exit 0, `21 passed (1.2m)` — unchanged, and this packet touches no component     |
| `bin/h2puni-gate.sh <sha>`                                                                         | the planner's, after the last slice                                              |

Chromium is the planner's: the executor has no browser. Pick `E2E_PORT_SHIFT` as a multiple of 300 away
from every other live run, check the three ports (`+0`, `+100`, `+1100` from 3100/3200/4200) with
`ss -ltn` first, and never kill a process you cannot prove is yours (`ls -l /proc/<pid>/cwd`).

**Load-sensitive Burokrat tests, not this packet's.** `apps/wiki/cli` has CLI-spawning tests at Bun's
5000 ms default. The planner watched
`finite evidence artifact validation production CLI > rejects missing dependency identities, self obligations and cycles without timing out`
exceed it by 30 ms while the jsdom tier and a Chromium lane shared the host, and Nx report the task
flaky; alone, the suite was `764 pass`, `0 fail`. Run it with no other heavy target, record the result,
and rerun once on exactly that failure. Do not edit that test.

**Known race, not this packet's.** If `apps/wiki/cli/src/admission/claims.db.test.ts` ›
`bounds terminal lock contention and retries until a held write commits` fails in a planner run, record
it and rerun once. Do not edit it or any other unrelated test.

## 11. Stop conditions

Each is scoped to the slice that reads it, and each is **false** on that slice's real starting tree; the
per-slice pre-edit checks in section 7 carry them.

In any slice:

- a red run prints `No test files found` (the suite entries are missing) or `Tests no tests` (the
  skeleton is missing) instead of `Tests 20 failed (20)`.
- `bunx eslint` reports an error this packet does not name and that `--fix` does not remove.
- a negative proof leaves its **named** test passing. That is first a location mistake: restore, check
  the location, redo once, and stop if it happens again.
- the interleaving property fails on the finished implementation. Record the counterexample and the
  seed it prints and stop: a failing property here is a real race, not a flake — it is deterministic.
- any command wants the network, or any file outside section 6 needs changing.

## 12. The next 050.7 packets, in dependency order

Each is a packet of its own, ticking tasks of the same change.

1. **050-7-b, the preferences module through the runtime owner.** Ticks tasks 2 and 3. It owns
   `apps/wbs/fe-01/src/modules/preferences/module.ts` (sealed, labelled `frontend.preferences`, browser
   store private), the installer `src/runtime/application-runtime.ts`, the page's
   `src/runtime/application-lifetime.ts`, the `composition.ts` seam and the module README. Four
   obligations are already known and measured:
   - the installer is **transactional**: it retains the bag before resolving and, when a resolve
     throws, raises `PartialAcquisitionError` carrying that bag's bounded close — measured, DI Bag
     releases a partial acquisition only that way (section 4.1);
   - its close must be **provable**: a graph whose modules own no disposer cannot show that
     `close: (options) => bag.close(options)` forwards anything, so the installer takes a narrow typed
     seam — the shape `bootBe01`'s `BootDependencies` uses — registering one owned disposable for the
     boundary test, with a mutation replacing the delegation by a resolved no-op;
   - the module's **wiki index** is written in that packet: a `<!-- module-index … -->` comment in
     `apps/wbs/fe-01/src/modules/preferences/README.md` declaring `module.frontend.preferences`,
     `module.ts` and every owned file, verified through the production checker
     (`bun apps/wiki/cli/src/cli.ts check staged . HEAD <rule-policy>.json --rule MOD-INDEX`, and
     `--rule MOD-LAYOUT` to watch that module's `debt` row disappear). No
     `docs/wiki-policy/modules.json` edit is needed — section 4.7 has the corrected reason;
   - `preferences`, the resource, stays a public module export only for `src/lib/remembered.ts`'s
     per-project layout stores, recorded as rule-K2 debt with its one caller; it is **not** put into
     any React context.
2. **050-7-c, the bootstrap and the fatal state.** Ticks task 4. `bootstrap()` in `main.tsx` before
   `createRoot` and outside `<StrictMode>`; one application context exposing `RememberedPreferences`
   only, never the resource; the sanitized fatal state rendered for both flavours, terminal and not.
3. **050-7-d, page hide, hot reload and restoration.** Ticks task 5. Map tests 2 and 3.
4. **050-7-e and 050-7-f, the project prerequisites.** Ticks tasks 8 and 9: project-owned stores for
   the plan snapshot, connection, roster and busy state; the command register and refusal publication
   behind narrow ports; then the broad `ProjectApi` behind private repository ports.
5. **050-7-g, the session runtime.** Ticks task 6. Needs 050-7-c.
6. **050-7-h, the project runtime.** Ticks tasks 10 and 11. Needs 050-7-e, 050-7-f and 050-7-g.
7. **050-7-i, Log out as a coordinated local exit.** Ticks task 7. Needs 050-7-g **and** 050-7-h,
   because the map requires project retirement before the session's.
8. **050-7-j, the boundary checks.** Ticks tasks 12 and 13: per-module isolated type checks, the
   architecture checks that refuse a bag, credential, broad client, repository or resource in delivery,
   and the `preferences` resource's remaining caller.

## 13. Assumptions recorded rather than asked

- **The change is named `adopt-frontend-lifetimes`.** The adoption tail map names
  `adopt-di-composition` for the _backend_ DI work, and batch 6's sibling packet 040-6-a opens that
  change; two packets opening one change would collide.
- **The retirement budget is 5000 ms for every lifetime**, named `RETIREMENT_BUDGET_MS`, because the
  map calls the budget a routine implementation choice. Tests pass 50 ms so the never-settling-disposer
  proofs do not sit for five seconds, and N8 is what says the production default is the one a real
  close receives.
- **A failed disposal is terminal; a failed construction whose acquisitions were released is not.** The
  map fixes the first. The second is a case it does not name, and the slot distinguishes them because
  the danger the terminal rule guards against is a runtime that may still hold a socket or a lock — and
  a construction whose partials were released holds nothing. A release that itself fails is terminal
  again. Both flavours publish the same sanitized fatal state, so a reader sees one thing.
- **A superseded replacement is refused, not answered with the winner's services.** Returning them
  would let a superseded project effect publish another project's feed. `TransitionSupersededError` is
  modelled for that reason, and a retirement never suffers it: every trigger's shared intent is to let
  go, so a retirement joins the transition that overtook it.
- **`Acquire<S>` is synchronous, and that is a contract, not an oversight.** It is what makes one fence
  sufficient; a lifetime needing asynchronous construction changes this type and adds a fence, and the
  interleaving property is what would fail without it.
- **The slot is generic over `S` with no constraint**, and `replace` never publishes a sentinel: the
  queued request is a tagged union (`{ kind: 'retire' }` or `{ kind: 'replace', acquire }`), so
  `createLifetimeSlot<null>()` is legal and behaves. There is no `null`-means-retirement path left to
  get wrong.
- **Nothing in this packet is reachable from the running page.** That is deliberate: the owner is
  proved in the fast tier before anything depends on it, and 050-7-b is what makes it the page's.

## 14. Disposition of the defect classes the 040.6 review found

| Defect class in `040-6-a…review1`                       | How this packet avoids it                                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop conditions that halt the packet's own later slices | Section 11 plus each slice's pre-edit check: creation is forbidden _before_ its slice and required _after_ it.                                      |
| A command needing network under the default dispatch    | No slice needs `--network`; nothing here listens, dials or downloads.                                                                               |
| An encapsulation proof that builds its own host         | This packet ships no installer; 050-7-b's obligations in section 12 name the production-path seam and its mutation.                                 |
| Implementation before tests                             | Slice 2 writes both test files, their suite entries and a throwing skeleton, records `Tests 20 failed (20)`, then implements.                       |
| Recorded negatives that do not match the supplied tests | All twelve rows of section 9 were injected alone against these listings, after Prettier, and their counts and diagnostics are the run's own output. |
| A handoff the prescribed workflow cannot produce        | Each slice lists the individual paths it changes, with the count stated and matching; slice 4 uses a recorded-base `git diff --name-only`.          |
| OpenSpec files created by hand                          | Slice 1 runs `openspec new change … --schema sdd-lean` first and expects exactly `.openspec.yaml` from it.                                          |

## 15. Disposition of review 1

Review 1's thirteen findings were dispositioned in the previous revision; review 2 confirmed eight of
them FIXED. The rest are carried here:

| Finding                                      | Verdict                | Where                                                                                                                                                |
| -------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 red runs select zero tests                | **FIXED** (§4.3, §7)   | suite entries are written with the tests; the red is a throwing skeleton with `Tests 20 failed (20)` and one budget-free message.                    |
| C2 concurrent replacements abandon a runtime | **FIXED** (§5, §8.7)   | closed properly this round: one queue, synchronous withdrawal, the fence after the disposal, and the interleaving property that found what was left. |
| C3, I5, I7, I8, I11, I12, I13                | **FIXED**              | confirmed by review 2.                                                                                                                               |
| I4 hand-over path counts                     | **FIXED** (§7)         | every slice states its count and lists that many paths; slice 2's is four.                                                                           |
| I6 unproved lifecycle claims                 | **FIXED** (§9)         | twelve mutations, one per surviving check, plus three checks deleted for being unprovable (§5).                                                      |
| I9 module index                              | **WITHDRAWN** (§4.7)   | review 2 was right that the rationale was false; the corrected facts are in §4.7 and the work is 050-7-b's in §12.                                   |
| I10 construction failure leaks               | **FIXED** (§4.1, §8.7) | `PartialAcquisitionError` plus the release-then-publish path; N11 and N12 prove both halves.                                                         |

## 16. Disposition of review 2

Every finding was checked against the repository before acting, and every fix was settled by rehearsal.
The method changed too: the owner is now a state machine with one queue, and the interleavings are
generated rather than imagined.

| Finding                                                       | Verdict      | Where, and what was observed                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** the fence never runs after the asynchronous retirement | **FIXED**    | Reproduced by the new property test on the old code, with the shrunk counterexample quoted in §2. §8.7 recheck­s after the disposal — the only await before construction — and §5 says why one fence suffices while `Acquire<S>` is synchronous. N9 removes it: three tests fail, property included.                                                                                                                         |
| **C2** failed construction acquires nothing                   | **FIXED**    | Probed: after a failed resolve, disposals were `[]` and only `bag.close()` produced `["a"]`; a factory that pushed a disposer and threw left it unrun until the close (§4.1). `PartialAcquisitionError` now carries that bounded close, the slot awaits it before publishing fatal, and a release that fails is terminal. Tests `releases what a half-finished construction acquired…` and `is terminal when…`; N11 and N12. |
| **C3** the prescribed red is false and trips the stop rule    | **FIXED**    | Confirmed: three tests build a 50 ms slot, so the interpolated message produced two diagnostics. The skeleton's message no longer names the budget; rehearsed red is `Tests 20 failed (20)`, all on `the lifetime slot is not implemented`, and §11's stop rule names exactly that.                                                                                                                                          |
| **I4** withdrawal is not synchronous                          | **FIXED**    | Confirmed. `accept()` withdraws and numbers the request before `replace`/`retire` return; the microtask deferral that delayed it is gone. Test `withdraws publication synchronously, before the first await` reads the snapshot with no await; N7 breaks it — `16 failed \| 4 passed (20)`.                                                                                                                                  |
| **I5** the module-index rejection rests on false claims       | **ACCEPTED** | Verified all three: `check-indexes.ts:409` loads no mapping; `trust.ts:1248` requires one only for an index matching a selected pilot boundary, and its own Proof says `docs/findings` stays outside; `typescript.ts:401` classifies a compiler-supported ambient import as `ambient-non-code`. §4.7 withdraws both rationales, and §12 makes the index 050-7-b's stated obligation with the checker command.                |
| **I6** the production close test proves nothing               | **MOVED**    | Accepted, and it belongs to the installer, which is now 050-7-b's. §12 states the narrow typed seam, the owned disposable, and the no-op-delegation mutation it must show.                                                                                                                                                                                                                                                   |
| **I7** `null` is both a value and a sentinel                  | **FIXED**    | Confirmed from the listing. The queued request is a tagged union (`{ kind: 'retire' }` / `{ kind: 'replace', acquire }`), `transition` no longer returns `S                                                                                                                                                                                                                                                                  | null`, and the impossible guard is gone, so `createLifetimeSlot<null>()` behaves (§13). |
| **I8** requirements contradict the lifecycle and the boundary | **FIXED**    | The same-tick scenario now says "every runtime that was built other than the live one has been retired", and two scenarios were added for the disposal interval and for partial acquisition. Task 4 now says the context exposes `RememberedPreferences` only, never the resource (§8.3).                                                                                                                                    |
| **Minor 9** slice 2's hand-over count                         | **FIXED**    | Every slice states its count and lists that many paths.                                                                                                                                                                                                                                                                                                                                                                      |
| **Minor 10** stale anchors                                    | **FIXED**    | Verified each: **nine** indexed READMEs including `openspec/changes/archive/2026-09-08-bounded-replay-sweep` (§4.7); `boot.ts:89`; `service-kinds.ts:15`; and the inactive JSON at `bin/tool-wiki-lint.sh:21` with `exit 0` on the next line, qualified by `TOOL_WIKI_REQUIRE_CERTIFIED=0` and the 78 at line 19.                                                                                                            |
