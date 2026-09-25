# 140.3 — di-bag 0.4.0 to 0.5.0

|             |                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item   | 140.3 "di-bag 0.4.0 to 0.5.0 (breaking)" (WBS `163e836d-0c1d-47b0-ae0e-2f82b1b2a6d1`). WBS 040.13 "di-bag label surface" (`cc9361f6-c33f-4838-9567-bedab0bd3fca`) is **taken out of this item by the planner on 2026-09-25** (section 1.1) |
| Size class  | L — five slices, each one executor attempt, plus one planner-only Chromium block                                                                                                                                                           |
| Moves       | `di-bag` 0.4.0 → **0.5.0** (published 2026-09-25 17:07 UTC), in one lockfile edit. `application-exception` 0.7.0 and `caught-object-report-json` 13.0.0 stay.                                                                              |
| Method      | The library's own codemod, `di-bag-codemod@0.1.0`, run by the executor through `bunx`, then a fenced residual diff, then a content hash of every owned path that must equal the rehearsal's (planner decision, 2026-09-25)                 |
| Schema      | New OpenSpec change `migrate-di-bag` (`sdd-lean`): one new capability, `di-bag-library`, two requirements and four scenarios; four tasks, each ticked by the slice that meets it                                                           |
| Authored on | Base `e93a564a0` (main after PR #63). The planner reruns section 9.1 with `REAL_BASE=<planning sha>` before the first dispatch.                                                                                                            |
| Rehearsal   | `rehearse/140-3-r1`: `a0f8b9cef` (slice 1), `83ebf251f` (slice 2), `709f4346b` (slice 3), `fcb45dbf5` (slice 4), `9c364d0c8` (slice 5), each committed with the hooks on.                                                                  |

## 1. Goal, non-goals, and the cut

**Goal.** The repository runs `di-bag` 0.5.0 everywhere it composes: the eighteen sealed backend and
core modules, the backend's composition root, the frontend's two modules, the three frontend
runtimes and the lifetime slot. Every existing R5 proof whose fault or outcome passes through the
library is observed again on 0.5.0, every fast-check model test passes at its pinned seed, and every
recorded model sabotage fails it again. The one behaviour that moves on purpose is the library's own:
error codes and close options renamed, `di-bag/node` gone.

### 1.1 Intent, and what was taken out

The breaking release renames almost every public name (section 3.1). The library ships a
type-aware codemod that must run while 0.4.0 is still installed; it moves 77 files and reports 62
places it will not decide. The planner decided on 2026-09-25 that the executor runs the codemod
itself, then applies a residual diff for what it leaves, and proves the result byte-equal to the
rehearsal with a content hash — rather than applying one embedded diff of every file.

**The label-agreement check (WBS 040.13, `cc9361f6`) is not in this packet.** Its own WBS note makes
it conditional: "do this with the di-bag migration once the new version exposes labels directly".
0.5.0 does not. Observed on 2026-09-25 in the published tarball and at tag `v0.5.0`:

- `Module` stores its description, label included, in a module-private `WeakMap`
  (`dist/module.js`: `const descriptions = new WeakMap()`, set in the constructor, which then
  freezes the instance). Its only public members are `withRenamedExport` and
  `withRenamedRequirement`; `Object.keys(module)` is empty and `'moduleLabel' in module` is false.
- `buildModule({ moduleLabel })` is write-only: the option was renamed from 0.4.0's `label`, and
  the label is still readable only as the prefix of each private binding's `bindingLabel`.
- Both forgeries packet I recorded still read as labelled. Probed with Bun 1.4.2: a module with
  no label that registers the private key `'backend.capacity/secret'`, and a module with no label
  that installs an inner module sealed under `backend.capacity`, each give the same
  `graphSnapshot()` bindings as a genuinely labelled module — `answer|1,backend.capacity/secret|0`
  (label, number of public keys).

**Planner decision (2026-09-25):** option (a). 040.13 stays open until di-bag exposes a module label
accessor (the planner raises it with Dany as a possible 0.5.1). This packet updates only the known
limit's wording in `module-labels.test.ts` (section 7.4) and the design's dated sentence (section
7.6); the check itself is unchanged and observed again on 0.5.0 (section 8.2, `ml1`, `ml2`, the
`g-*` records).

### 1.2 Non-goals

- No label-agreement change (section 1.1).
- No change to any lifetime's own contract: the lifetime slot, `RetirableRuntime` and
  `PartialAcquisitionError` keep `{ timeoutMs }` (section 3.3).
- No `di-bag-codemod` dependency. It is run once through `bunx` at an exact version and is not
  added to any manifest.
- No `application-exception` or `caught-object-report-json` move.
- Historical `Proof:` comments that quote observed 0.4.0 text (`DI_BAG_CLEANUP_FAILED`,
  `DiBagCleanupError`, `inspectGraph()`, `DI_BAG_INVALID_CONFIGURATION`, `di-bag/node`) stay as
  written: they are dated records. Where their fault is re-observed on 0.5.0 the new observation is
  recorded in `verify.md` (slices 4 and 5), and where the old fault no longer exists (the three
  `di-bag/node` proofs) a new dated `Proof:` stands beside the old one (slice 3).
- Historical packets under `docs/superpowers/plans/2026-09-*` stay as written.

### 1.3 The cut, and why five slices

1. **Intent** — the OpenSpec change, documents only.
2. **The move** — the registry probe, the codemod, the pin, one install, Prettier over the codemod's
   output, the residual test side (red), the residual production side (green), the content hash,
   and the compiler probe. One commit, green. Network: the registry, the codemod's package and the
   0.5.0 tarball.
3. **The new negatives** — the budget translation's two sites, the browser entry point, the moved
   pin; each clause with its clause-disabled twin. The planner adds the two Chromium faults
   (section 8.4) to the same commit.
4. **The recorded example faults, observed again, and the records** — 75 offline faults whose outcome is
   decided by the library (module sealing and labels, the boot graph's disposal, the preferences
   module, the transaction, the lifetime slot's disposal refusals, the label check, the compile
   negative, the delivery boundary's bag rule), then the dated amendments.
5. **The model tests** — all eleven at their pinned seeds, then every recorded model sabotage (74)
   observed again with its run number.

## 2. Read first

| File                                                                                               | Why                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, `LLM_README.md`                                                                       | Rules R1–R5 and the routing index.                                                                           |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                              | "Execution contract" and "Standard blocks every packet uses".                                                |
| `docs/superpowers/plans/2026-09-25-batch-7/140-1-2-report-libraries-migration.md`                  | The migration packet this one follows in shape; its section 8.1 is the standard for touching `node_modules`. |
| `openspec/changes/adopt-di-composition/{design.md,specs/di-composition/spec.md}`                   | The sealed-module contract every backend and core module keeps; slice 4 amends two library names in it.      |
| `openspec/changes/adopt-frontend-lifetimes/{proposal.md,specs/adopt-frontend-lifetimes/spec.md}`   | The lifetime contract the frontend runtimes keep; none of its requirements changes.                          |
| `apps/wbs/fe-01/src/runtime/lifetime-slot.ts`, `apps/wbs/fe-01/src/runtime/application-runtime.ts` | The slot's close budget and the one transaction that owns a built graph.                                     |
| `tools/tool-devsync/src/module-labels.test.ts`, `tools/tool-devsync/src/toolchain-pins.test.ts`    | The label check and the pins this packet keeps.                                                              |

## 3. Design

### 3.1 The release, read in full

The tarball ships no changelog; the repository's `CHANGELOG.md` and
`docs/guides/migrating-to-0.5.md` at tag `v0.5.0` do (commit `57e305b`, "Merge pull request #41"),
and `dist/` of both tarballs was diffed beside them. 0.5.0 has no `dependencies`, no
`peerDependencies` and no `engines`; its `exports` map is `{ ".": … }` only.

| Breaking change                                                                                                                                                                                                                                                             | What it touches here                                                                                                                                       | Handled by                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Builder names: `register` → `withServices`, `installModule(m)` → `withInstalledModules([m])`, `build` → `buildContainer`, `buildAndStart(keys)` → `buildContainer().ensureServicesReady(keys)`, `verifyGraph` → `verifyGraphAtCompileTime`                                  | 147 `.register(`, 61 `.installModule(`, 79 `.build(`, 1 `.buildAndStart(` across 77 files                                                                  | The codemod (slice 2 step 4), except calls behind `as unknown as` casts, which it cannot see: 20 module tests and `module-labels.test.ts` (section 7.3)                    |
| `buildModule({ exports, label })` → `buildModule({ exportedServiceKeys, moduleLabel })`                                                                                                                                                                                     | All 20 sealed modules                                                                                                                                      | The codemod                                                                                                                                                                |
| Providers: `fromSyncFactory(f)` → `createProvider(f, { factoryReturnKind: 'sync-value' })`, `fromAsyncFactory` → `'native-promise'`, `context: 'acquisition'` → `factoryReceivesContext: true`; `withDisposal(p, d)` → `providerWithDisposal({ provider, disposeService })` | 319 `fromSyncFactory`, 1 `fromAsyncFactory`, 24 `withDisposal`                                                                                             | The codemod. It moves a comment that sat between `withDisposal`'s arguments to after `disposeService:`; three such splits in `boot.ts` are put back together (section 7.4) |
| Container: `Bag` → `Container`, `inspectGraph()` → `graphSnapshot()`, binding `keys` → `serviceKeys`, `label` → `bindingLabel`                                                                                                                                              | 20 `inspectGraph` calls; the label check                                                                                                                   | The codemod; the label check's cast by hand (section 7.3)                                                                                                                  |
| `close({ signal, timeoutMs })` → `close({ abortSignal, waitTimeoutMs })`; a 0.4.0 option is refused `DI_BAG_INVALID_ARGUMENT: invalid close options`                                                                                                                        | Every place a lifetime's `{ timeoutMs }` reaches a DI Bag close: 15 in tests and one probe, 2 in `acquireTransactionally`                                  | Section 3.3                                                                                                                                                                |
| Errors: `DiBagCleanupError` → `DiBagDisposalError` (`DI_BAG_DISPOSAL_FAILED`), `cleanupPromise` → `disposalPromise`, `DiBagCloseCancelledError.timeoutMs` → `details.waitTimeoutMs`                                                                                         | `boot.db.test.ts`, `lifetime-slot.ts`'s `lateCleanupOf`, the theme and remembered-layout model tests' `isDisposalExpiry`, `application-bootstrap.test.tsx` | The codemod; two JSDoc mentions by hand (section 7.4)                                                                                                                      |
| 42 codes → 32: `DI_BAG_MISSING_REGISTRATION` → `DI_BAG_UNKNOWN_SERVICE_KEY`; every message now ends `; see https://dany-fedorov.github.io/di-bag/agent/errors.html#…`                                                                                                       | 22 test assertions and 20 JSDoc mentions                                                                                                                   | Section 7.3 and 7.4; assertions are substring matches, so the suffix changes none of them                                                                                  |
| `di-bag/node` removed                                                                                                                                                                                                                                                       | Nothing imports it; three `Proof:` comments name it as their injected fault                                                                                | Slice 3: new faults `b1`, and the planner's `e1`, `e2` (section 3.4)                                                                                                       |
| A child container replaces only scoped and transient services; tokens split into service and collection kinds; lifetimes renamed                                                                                                                                            | Nothing: no `createScope`, `fork`, `DiBag.token`, `all`, `withLifetime`                                                                                    | —                                                                                                                                                                          |

Unchanged and relied on: `DI_BAG_MISSING_DEPENDENCY` and its `Cannot resolve "<label>/<key>":
dependency "<key>" is not registered. Resolution path: …` text; `pushDisposer` and
`DisposerContext.reason`; `ensureServicesReady`; `DiBagCloseCancelledError` itself and its
`disposalPromise`; the `DI_BAG_CLASSIFIER_REQUIRED` string the browser bundle test uses as a marker.

### 3.2 The codemod, its report, and the 62 items it leaves

`di-bag-codemod@0.1.0` (published 2026-09-25 17:06 UTC; one dependency, `typescript` ^6.0.3; bin
`di-bag-codemod`) rewrites a call only when the TypeScript checker resolves it to a `di-bag`
declaration, so it runs **before** the pin moves, with 0.4.0 installed. It runs once per tsconfig,
in this order, each with `--write`: the core library's `tsconfig.spec.json` and `tsconfig.lib.json`,
the backend's `tsconfig.spec.json` and `tsconfig.lib.json`, the frontend's `tsconfig.spec.json`,
`tsconfig.app.json` and `tsconfig.e2e.json`, and devsync's `tsconfig.spec.json`. The order matters
only for what each pass reports: a later pass reads files an earlier one already moved. Rehearsed
twice, in two clones, with byte-identical output (section 9.3).

Its dry run, before any write, reported 62 distinct items (file, line, column) across the eight
tsconfigs. How each is resolved:

| Items | What the codemod reports                                                                                                    | Resolution                                                                                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 22    | `DI_BAG_MISSING_REGISTRATION appears outside a plain string` in module tests (20 backend and core, 2 frontend)              | Section 7.3: `DI_BAG_UNKNOWN_SERVICE_KEY` (observed message: `DI_BAG_UNKNOWN_SERVICE_KEY: Service "capacityOptions" is not registered.; see …`)                                |
| 19    | the same in the modules' JSDoc                                                                                              | Section 7.4, the same code                                                                                                                                                     |
| 1     | the same in `apps/wbs/fe-01/src/modules/preferences/contract.ts`'s JSDoc                                                    | Section 7.4                                                                                                                                                                    |
| 15    | `argument 1 of close is not a literal; where it is built, apply: key signal to abortSignal; key timeoutMs to waitTimeoutMs` | Section 7.3: each `bag.close(options)` → `bag.close({ waitTimeoutMs: options.timeoutMs })` — every one passes a lifetime's `{ timeoutMs }` to a DI Bag container (section 3.3) |
| 3     | `DI_BAG_CLEANUP_FAILED appears outside a plain string` in `project-runtime.ts` (2) and `session-runtime.ts` (1)             | Dated `Proof:` comments, kept; their faults `j-o2`, `j-o4`, `i-o2`, `i-o3` are observed again in slice 4 (the code is now `DI_BAG_DISPOSAL_FAILED`)                            |
| 2     | `DI_BAG_INVALID_CONFIGURATION appears outside a plain string` in `browser-packages.spec.ts` and `fault-boundary.spec.ts`    | Dated `Proof:` comments of a fault that no longer exists, kept; slice 3's new faults `e1` and `e2` stand beside them                                                           |

The write passes also report 20 items `the receiver of buildModule has type any` in the modules'
`module.ts`: the lib passes read files the spec passes had already moved to 0.5.0 names while 0.4.0
types were still installed. `buildModule` keeps its name, and the spec pass had already reshaped
every argument (every module ends with `exportedServiceKeys` and `moduleLabel`, checked by the green
typecheck), so nothing is missed. The executor keeps all eight reports as evidence.

**What the codemod cannot see and does not report** (all in section 7.3 or 7.4): the calls behind
`as unknown as` casts in 20 module tests (`partial.build()`), the frontend modules' two
`partial.build()` casts and the label check's `installModule(…).build().inspectGraph()` cast (each
fails at run time with `DI_BAG_REMOVED_API: build was removed in 0.5.0; use
builder.buildContainer`); JSDoc naming `fromSyncFactory`, `withDisposal` and `DiBagCleanupError`;
the pin in `toolchain-pins.test.ts`; and `ClosableGraph`, which is not a di-bag type.

### 3.3 The close budget: one translation, proved

DI Bag 0.5.0 refuses `close({ timeoutMs })`. The lifetime slot's contract (`RetirableRuntime`,
`PartialAcquisitionError`) is the repository's own and keeps `timeoutMs`: renaming it would move
every lifetime, owner and model test for a library's word. Instead `acquireTransactionally`, the
one function that turns a built DI Bag graph into a lifetime, translates: its `ClosableGraph` takes
`{ waitTimeoutMs }` and both its close and its partial release hand `options.timeoutMs` over.

That translation is a changed safety path — a dropped or wrong budget would let a retirement wait
forever or expire at once — so slice 2 adds two tests against a real graph whose disposer never
settles, where only DI Bag's own wait can end the close: `hands DI Bag the budget of a runtime’s own
close` and `hands DI Bag the budget of a half-finished read’s release`. Each asserts the refusal is
`DiBagCloseCancelledError` whose `details.waitTimeoutMs` is the budget handed in. Slice 3 proves
each site with its own fault and its clause-disabled twin (`t1`, `t1c`, `t2`, `t2c`, `t3`, `t3c`).

The 14 test-file sites and one probe that close a DI Bag container directly with a lifetime's options get the same
translation inline (section 7.3). Rehearsed red without it: 35 failures read `Error:
DI_BAG_INVALID_ARGUMENT: invalid close options`.

### 3.4 `di-bag/node` and the three browser proofs

Three existing proofs name `import 'di-bag/node'` as their fault: `browser-packages.test.ts`
(`externalizes no Node built-in for the browser`), and in Chromium `browser-packages.spec.ts` and
`fault-boundary.spec.ts` (`pageErrors`). On 0.5.0 that import no longer resolves, so the fault is a
build error, not the failure those checks exist for. Each gets a new fault that fails its check for
the stated reason — a Node built-in reaching the browser graph — with a twin that weakens only that
assertion:

- `b1`: `import 'node:util/types';` as the probe's first line fails `externalizes no Node built-in`
  with `expected [ 'node:util/types' ] to deeply equal []`; `b1c` weakens it to an array check and
  the file passes (3 tests). Executor.
- `e1`, `e2`: a namespace import of `node:util/types` and a microtask calling `isPromise` —
  appended **after** the probe's global is assigned, and in `fault-disclosure.ts` respectively — so
  the page still produces its proof and only `pageErrors` sees the built-in:
  `"TypeError: he.isPromise is not a function"` (the minified name varies). `e1c`, `e2c` weaken only
  `pageErrors` and the spec passes. A first-line import would also leave the proof global unset and
  fail the next assertion, so it could not isolate the clause. Planner, in Chromium (section 8.4).

### 3.5 OpenSpec: required, and why

R4 requires OpenSpec for observable behaviour and contracts. This move changes the codes an operator
reads in logs (`DI_BAG_UNKNOWN_SERVICE_KEY`, `DiBagDisposalError`), removes an entry point, and adds
a guarantee — the close budget reaches the library. So: a new `sdd-lean` change, `migrate-di-bag`,
with one new capability, `di-bag-library`. It does **not** modify `di-composition` or
`adopt-frontend-lifetimes`: both are open changes whose requirements hold. Two library names inside
`di-composition`'s requirement "A module's label names its private bindings in failures" (`label`,
`inspectGraph()`) are respelled in place with a dated design sentence (section 7.6): the requirement
itself — every private binding appears as `<label>/<key>` — is unchanged and observed again. No
CONTEXT.md term and no ADR: a pin moves back, and the one real alternative (renaming the lifetime
contract's `timeoutMs`) is recorded in section 3.3.

### 3.6 Decisions

- **The codemod runs in the executor's clone; its output is checked by content, not by a diff.**
  Section 6, slice 2 step 7: the sorted list of owned paths must equal section 6's list, and the
  SHA-256 over their contents must equal the rehearsal's. A mismatch is a stop.
- **Prettier over exactly the codemod's paths**, before the residual, because the codemod's own
  formatting fails `prettier/prettier`; the residual diffs are written against Prettier's output.
- **The two new budget tests land in slice 2's test side**, so they are red on the unmigrated
  transaction (`expected Error: DI_BAG_INVALID_ARGUMENT: invalid c… to be 25` and a typecheck
  error) and green after it, and slice 3 proves them.
- **Model sabotages are rebuilt, not replayed from old evidence.** Every fault patch in section 8.3
  is re-expressed against this tree (`--unidiff-zero`): the packets of 050.7 f2, g, i, j and k carried
  diffs, converted mechanically; 050.7 a, b, e and f1 described theirs in prose, written here from
  those descriptions. Each record names the model test and the property title.

## 4. Verified facts

### 4.1 Inventory on the base (`e93a564a0`)

78 tracked files import `di-bag` (`git grep -l "from 'di-bag'" -- apps libs tools`):

| Area                                                          | Files | What                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core sealed modules, `libs/wbs/application/core/src/module/*` | 45    | 15 modules × `module.ts`, `module.test.ts`, `check.ts`: authentication, bounded-replay-sweep, calendar-marker, capacity, directory, plan-commands, plan-document, plan-history, plan-import, priority-band, project, realtime, saved-plans, step, work-item |
| Backend sealed modules, `apps/wbs/be-01/src/module/*`         | 9     | optimization, solver-launcher, solver-supervisor × the same three files                                                                                                                                                                                     |
| Backend composition root                                      | 2     | `apps/wbs/be-01/src/boot.ts` (one graph: source, services, retention, server; `ensureServicesReady`, `pushDisposer`), `boot.db.test.ts`                                                                                                                     |
| Frontend runtimes, `apps/wbs/fe-01/src/runtime`               | 11    | `lifetime-slot.ts` (`DiBagCloseCancelledError`), `application-runtime.ts` (`acquireTransactionally`), `session-runtime.ts`, `project-runtime.ts`, and seven tests, four of them model tests                                                                 |
| Frontend modules, `apps/wbs/fe-01/src/modules`                | 4     | `preferences/module.ts`, `directory-management/module.ts`, their tests                                                                                                                                                                                      |
| Frontend elsewhere                                            | 4     | `lib/theme.model.test.tsx`, `components/wbs/remembered-layout.model.test.ts`, `app.test.tsx`, `delivery-boundaries.test.ts`                                                                                                                                 |
| Frontend browser probes, `apps/wbs/fe-01/e2e`                 | 2     | `browser-packages-probe.ts`, `lifetime-fault-probe.ts`                                                                                                                                                                                                      |
| Label check, `tools/tool-devsync/src/module-labels.test.ts`   | 1     | Installs every sealed module through a cast and reads its private bindings' labels                                                                                                                                                                          |

- **Sealed modules: 20** — the 18 backend and core modules the label check reads, and the
  frontend's `frontend.preferences` and `frontend.directory-management`.
- **`compose.ts`** (`libs/wbs/application/core/src/compose.ts`) imports no `di-bag`: it composes
  through the 15 core installers (`check.ts`), each of which builds its module's graph.
- **`acquireTransactionally`**: defined once (`application-runtime.ts:60` on the base), called by
  `installApplicationRuntime`, `session-runtime.ts` and `project-runtime.ts`, and twice by its own
  test.
- **Calls the codemod moves**: 319 `DiBag.fromSyncFactory`, 147 `.register(`, 131 `.replace(`
  (some of them `String.prototype.replace`, which the codemod leaves), 100 `DiBag.createBuilder`,
  79 `.build(`, 61 `.installModule(`, 24 `DiBag.withDisposal`, 20 `.inspectGraph(`, 20
  `.buildModule(`, 1 `DiBag.fromAsyncFactory`, 1 `.buildAndStart(`.
- **Names only, no change**: `LLM_README.md:126`, `bin/h2puni-gate-steps.sh:10`,
  `bin/h2puni-gate.test.sh:716-718`, `docs/findings/checks-that-cannot-fail-puni-00.md:53,58`,
  `openspec/changes/host-gate-locked-install/proposal.md`, `docs/research/2026-09-21-di-bag-0-4-lifecycle.md`
  (dated research), `openspec/changes/backend-startup-ownership/design.md:16,18` (dated design;
  names `withDisposal` for its own historical reasoning).
- **Compile negatives**: no `check.ts` carries `@ts-expect-error` (all twenty are installers whose
  negatives are the enumerated-surface tests). The one module fixture with a directive is
  `libs/wbs/application/core/src/module/authentication/module.test.ts:101`, and its type is the
  repository's own `AuthenticationRequirements`; slice 4 observes it again (`ts1`, `ts2`).

### 4.2 Probed library behaviour (Bun 1.4.2, 2026-09-25)

Every claim in section 3 was probed on the installed 0.5.0: the renamed builder and provider calls
compile and run; a sealed module's private key answers `DI_BAG_UNKNOWN_SERVICE_KEY`; its binding
reads `backend.probe/secret` in `graphSnapshot()`; a close past its budget rejects with
`DiBagCloseCancelledError` whose `details.waitTimeoutMs` is the budget and whose `disposalPromise`
is a `Promise`; a 0.4.0 option is refused `DI_BAG_INVALID_ARGUMENT`; a rejecting disposer gives
`DiBagDisposalError` with `DI_BAG_DISPOSAL_FAILED`; the installed manifest's `exports` has the root
entry only. Slice 2 step 9 reruns the core of it on Bun and both compilers (TypeScript 7.0.2, 6.0.3),
with `skipLibCheck: false` so the library's own declarations are checked too.

## 5. File plan

| Slice | Path                                                                                                                                               | Change                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1     | `openspec/changes/migrate-di-bag/.openspec.yaml`                                                                                                   | Create, by the OpenSpec command                                                      |
| 1     | `openspec/changes/migrate-di-bag/{proposal.md,specs/di-bag-library/spec.md,tasks.md,verify.md}`                                                    | Create (7.1)                                                                         |
| 2     | 77 files the codemod rewrites                                                                                                                      | The codemod, then Prettier (slice 2 steps 4 and 6)                                   |
| 2     | `package.json`, `bun.lock`                                                                                                                         | The pin (7.2)                                                                        |
| 2     | 33 test files and probes, one of them (`toolchain-pins.test.ts`) not touched by the codemod                                                        | The residual test side (7.3)                                                         |
| 2     | 24 production files, one of them (`preferences/contract.ts`) not touched by the codemod, and the change's `tasks.md`                               | The residual production side (7.4)                                                   |
| 2     | —                                                                                                                                                  | 82 owned paths in all, listed in slice 2's hand-over, plus `verify.md`               |
| 3     | `apps/wbs/fe-01/src/runtime/application-runtime.ts`, `apps/wbs/fe-01/browser-packages.test.ts`, `tools/tool-devsync/src/toolchain-pins.test.ts`    | `Proof:` comments only, written by the executor                                      |
| 3     | `apps/wbs/fe-01/e2e/browser-packages.spec.ts`, `apps/wbs/fe-01/e2e/fault-boundary.spec.ts`                                                         | `Proof:` comments only, written by the **planner** after section 8.4's Chromium runs |
| 3     | the change's `tasks.md`, `verify.md`                                                                                                               | Tick 3.1 (7.5); the slice's entry                                                    |
| 4     | `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`, `openspec/changes/adopt-di-composition/{design.md,specs/di-composition/spec.md}` | One dated amendment, one dated sentence, two library names respelled (7.6)           |
| 4     | the change's `tasks.md`, `verify.md`                                                                                                               | Tick 3.2 (7.6); the slice's entry                                                    |
| 5     | the change's `tasks.md`, `verify.md`                                                                                                               | Tick 3.3 (7.7); the slice's entry                                                    |

No new source file under `apps/wiki/cli`, so the Twilight Burokrat validator identity does not move.
No module README with a `module-index` block is touched. The whole devsync suite ran green on the
rehearsal's slice 2 and final commits with the same count as the base (section 9.3), so no devsync
pin or digest moves.

**Collision with the suite directory move** (`apps/wiki` → `apps/twilight-structure/twilight-burokrat`,
in review in parallel): this packet touches no path under `apps/wiki` or `docs/wiki-policy`, and no
devsync pin. The two devsync files it edits are `tools/tool-devsync/src/toolchain-pins.test.ts`
(the `OWNER_PACKAGES` di-bag line and a `Proof:` above the manifest assertion) and
`tools/tool-devsync/src/module-labels.test.ts` (the cast and its JSDoc). The first also asserts on
`ci.yml` text the suite move may edit; check both against the suite-move packet before dispatch.

## 6. Slices

Each slice is one executor attempt and ends at a checkpoint: the executor stops and reports, and
the planner reviews and commits before the next slice is dispatched. Every block below is real
`sh`, run from the repository root unless it says `cd`. Bun commands run under `env -u CLAUDECODE
-u AGENT`, Vitest under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT`, multi-file Vitest
serially, and lint and typecheck with `--skip-nx-cache`. **Strip the two-space list indent** from a
block before running it; an indented `EOF` does not end a heredoc.

### Step 0 — at the start of **every** slice

**0a. The starting state.** Replace `<the SHA named in this attempt's slice note>` with the
40-character hash the slice note gives (`reviewed base <sha>`); unreplaced, the block dies on the
unterminated quote.

```sh
set -euo pipefail
mkdir -p "${TMPDIR:?}/evidence"
base=$(git rev-parse HEAD)
echo "base=$base" | tee "$TMPDIR/evidence/base.txt"
reviewed=<the SHA named in this attempt's slice note>
test "$base" = "$reviewed"
git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-before.txt"
test ! -s "$TMPDIR/evidence/status-before.txt"
```

Expected: `base=` equal to the slice note's hash, and an **empty** `status-before.txt`.

**0b. Five helpers, the patches and the fault patches**, written into `$TMPDIR` with `>` so a rerun
in the same `$TMPDIR` rewrites rather than doubles them.

````sh
set -euo pipefail
cat > "$TMPDIR/run-check.sh" <<'EOF'
#!/usr/bin/env bash
# Runs one check into $TMPDIR/evidence/<name>.log, appends its own exit status,
# and prints the summary lines. Never fails itself: the status line is the result.
set -uo pipefail
name=$1
shift
log="$TMPDIR/evidence/$name.log"
if "$@" > "$log" 2>&1; then status=0; else status=$?; fi
echo "status=$status" >> "$log"
test -f "$log"
if summary=$(grep -E "^ *[0-9]+ (pass|fail)$|Test Files|Tests  |Successfully ran|Failed tasks|^status=" "$log"); then
  printf '%s | %s\n' "$name" "$(printf '%s' "$summary" | tr '\n' ' ')"
else
  rc=$?
  test "$rc" -eq 1
fi
EOF
cat > "$TMPDIR/expect-status.sh" <<'EOF'
#!/usr/bin/env bash
# Fails unless the named check's recorded status is exactly the expected one.
set -euo pipefail
log="$TMPDIR/evidence/$1.log"
test -f "$log"
last=$(tail -n 1 "$log")
test "$last" = "status=$2"
EOF
cat > "$TMPDIR/suites.sh" <<'EOF'
#!/usr/bin/env bash
# Runs the four socket-free focused suites this packet reads, each into its own evidence log named
# <prefix>-<suite>, and prints one summary line per suite. Statuses are asserted by the caller.
set -euo pipefail
prefix=$1
run="$TMPDIR/run-check.sh"
test -f "$run"
bash "$run" "$prefix-devsync" env -u CLAUDECODE -u AGENT bash -c \
  'cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts ./src/toolchain-pins.test.ts ./src/module-labels.test.ts'
bash "$run" "$prefix-core" env -u CLAUDECODE -u AGENT bash -c \
  'cd libs/wbs/application/core && bun test ./src'
bash "$run" "$prefix-backend" env -u CLAUDECODE -u AGENT bash -c \
  'cd apps/wbs/be-01 && bun test ./src/module ./src/production-entrypoint.test.ts'
bash "$run" "$prefix-frontend" env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT TZ=UTC bash -c \
  'cd apps/wbs/fe-01 && bunx vitest run --no-file-parallelism --maxWorkers=1 browser-packages.test.ts src/app.test.tsx src/delivery-boundaries.test.ts src/index-bootstrap.test.ts src/components/wbs/remembered-layout.model.test.ts src/lib/theme.model.test.tsx src/lib/theme.test.tsx src/modules/directory-management/directory-management.feature.test.ts src/modules/directory-management/module.test.ts src/modules/preferences/browser-storage.repository.test.ts src/modules/preferences/module.test.ts src/modules/preferences/preferences.feature.test.ts src/modules/preferences/preferences.resource.test.ts src/runtime/application-bootstrap.model.test.tsx src/runtime/application-bootstrap.strictmode.test.tsx src/runtime/application-bootstrap.test.tsx src/runtime/application-runtime.test.ts src/runtime/application-services-context.test.tsx src/runtime/lifetime-slot.model.test.ts src/runtime/lifetime-slot.test.ts src/runtime/project-runtime.model.test.ts src/runtime/project-runtime.test.ts src/runtime/session-exit.model.test.ts src/runtime/session-runtime.model.test.ts src/runtime/session-runtime.test.ts'
EOF
cat > "$TMPDIR/codemod.sh" <<'EOF'
#!/usr/bin/env bash
# Runs di-bag-codemod 0.1.0 once per tsconfig, in this order, each writing its report and its
# log to the evidence directory. Prints each run's summary line. Stops at the first failure.
set -euo pipefail
for project in \
  libs/wbs/application/core/tsconfig.spec.json \
  libs/wbs/application/core/tsconfig.lib.json \
  apps/wbs/be-01/tsconfig.spec.json \
  apps/wbs/be-01/tsconfig.lib.json \
  apps/wbs/fe-01/tsconfig.spec.json \
  apps/wbs/fe-01/tsconfig.app.json \
  apps/wbs/fe-01/tsconfig.e2e.json \
  tools/tool-devsync/tsconfig.spec.json; do
  test -f "$project"
  name=$(printf '%s' "$project" | tr '/' '_')
  env -u CLAUDECODE -u AGENT bunx di-bag-codemod@0.1.0 --project "$project" --write \
    --report "$TMPDIR/evidence/codemod-$name.json" > "$TMPDIR/evidence/codemod-$name.log" 2>&1 < /dev/null
  printf '%s | %s\n' "$project" "$(tail -n 1 "$TMPDIR/evidence/codemod-$name.log")"
done
EOF
cat > "$TMPDIR/fault-loop.sh" <<'EOF'
#!/usr/bin/env bash
# Runs every fault record in $1 (six lines each: id, expected outcome, runner, directory,
# test file, named test; for the tsc-core runner the named test is a diagnostic substring) against the patch "$TMPDIR/mutations/<id>.diff": saves each touched
# file, applies the patch, runs the test file, restores and compares the saved bytes, and only
# then asserts. "fail" requires exit 1 and the named test among the failures; "pass" requires
# exit 0 (a clause-disabled twin). Prints one summary line per record.
set -euo pipefail
records=$1
test -f "$records"
run_file() {
  local runner=$1 dir=$2 file=$3
  case "$runner" in
    bun) (cd "$dir" && env -u CLAUDECODE -u AGENT bun test "./$file") ;;
    bun-devsync) (cd "$dir" && env -u CLAUDECODE -u AGENT bun test --preload ../test/scratch/preload.ts "./$file") ;;
    vitest) (cd "$dir" && env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 "$file") ;;
    tsc-core) env -u CLAUDECODE -u AGENT bunx tsc --build --force libs/wbs/application/core/tsconfig.json ;;
    *) echo "unknown runner $runner" >&2; return 2 ;;
  esac
}
while IFS= read -r id && IFS= read -r expect && IFS= read -r runner && IFS= read -r dir \
  && IFS= read -r file && IFS= read -r title; do
  patch="$TMPDIR/mutations/$id.diff"
  test -f "$patch"
  mapfile -t touched < <(sed -n 's#^+++ b/##p' "$patch")
  test "${#touched[@]}" -gt 0
  mkdir -p "$TMPDIR/passing/$id"
  for path in "${touched[@]}"; do
    test -f "$path"
    mkdir -p "$TMPDIR/passing/$id/$(dirname "$path")"
    cp "$path" "$TMPDIR/passing/$id/$path"
  done
  cp "$patch" "$TMPDIR/evidence/$id.diff"
  git apply --unidiff-zero --check "$patch" < /dev/null
  git apply --unidiff-zero "$patch" < /dev/null
  if run_file "$runner" "$dir" "$file" > "$TMPDIR/evidence/$id.log" 2>&1 < /dev/null
  then status=0; else status=$?; fi
  echo "status=$status" >> "$TMPDIR/evidence/$id.log"
  for path in "${touched[@]}"; do
    cp "$TMPDIR/passing/$id/$path" "$path"
    cmp "$path" "$TMPDIR/passing/$id/$path"
  done
  if run_file "$runner" "$dir" "$file" > "$TMPDIR/evidence/$id-restored.log" 2>&1 < /dev/null; then restored=0; else restored=$?; fi
  echo "status=$restored" >> "$TMPDIR/evidence/$id-restored.log"
  test "$restored" -eq 0
  plain=$(sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/evidence/$id.log")
  if [ "$expect" = fail ]; then
    # tsc reports diagnostics with exit 2; the test runners with exit 1.
    if [ "$runner" = tsc-core ]; then test "$status" -eq 2; else test "$status" -eq 1; fi
    if hits=$(grep -F -- "$title" <<< "$plain"); then :; else rc=$?; test "$rc" -eq 1; hits=''; fi
    if named=$(grep -cE '^\(fail\) |×| FAIL |error TS' <<< "$hits"); then :; else rc=$?; test "$rc" -eq 1; fi
    test "$named" -gt 0
  else
    test "$status" -eq 0
  fi
  if counts=$(grep -E '^ *[0-9]+ (pass|fail)$|Tests  ' <<< "$plain"); then :; else rc=$?; test "$rc" -eq 1; fi
  counts=$(tr -s ' ' <<< "$counts" | tr '\n' ' ')
  printf '%s | %s | status=%s | %s\n' "$id" "$expect" "$status" "$counts"
done < "$records"
EOF
packet=docs/superpowers/plans/2026-09-25-batch-7/140-3-di-bag-migration.md
test -f "$packet"
mkdir -p "$TMPDIR/patches" "$TMPDIR/mutations"
# Section 7's fenced diffs, in document order, as 01.diff … 07.diff. awk's `>` empties each file
# the first time this run writes it and appends after that.
awk -v out="$TMPDIR/patches" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print > f }
' "$packet"
count=$(find "$TMPDIR/patches" -name '*.diff' | wc -l)
echo "patches=$count"
test "$count" -eq 7
# Section 8's fault patches, each named by the heading "#### Proof <id>" above it.
awk -v out="$TMPDIR/mutations" '
  /^## 8\. Proofs$/ { inside=1; next }
  /^## 9\. Verification$/ { inside=0 }
  inside && /^#### Proof / { id=$3; next }
  inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print > f }
' "$packet"
count=$(find "$TMPDIR/mutations" -name '*.diff' | wc -l)
echo "mutations=$count"
test "$count" -eq 169
bash -n "$TMPDIR/fault-loop.sh"
````

Expected: `patches=7`, `mutations=169`, exit 0, on a first run and on any rerun in the
same `$TMPDIR`. **Applying section 7.N** always means exactly this, never a hand edit:

```sh
set -euo pipefail
git apply --check "$TMPDIR/patches/NN.diff"
git apply "$TMPDIR/patches/NN.diff"
```

`git apply` without `--index` writes only the working tree. 7.1 is `01.diff` … 7.7 is `07.diff`.

**0c. The strict OpenSpec baseline**, in every slice, with the README's block (section 9.2), plus
the totals line:

```sh
set -euo pipefail
report=$(mktemp "$TMPDIR/evidence/openspec-base.XXXXXX.json")
env -u CLAUDECODE -u AGENT OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json > "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
jq -c '.summary.totals' "$report" | tee "$TMPDIR/evidence/openspec-base-totals.txt"
```

Record `items` as **O**. Rehearsed: 115 before slice 1, 116 from slice 1 on.

### Slice 1 — the intent

Owns (5 paths), all under `openspec/changes/migrate-di-bag/`: `.openspec.yaml`, `proposal.md`,
`specs/di-bag-library/spec.md`, `tasks.md`, `verify.md`.

- [ ] 1. Step 0 (0a, 0b, 0c). Stop if `openspec/changes/migrate-di-bag` already exists.
- [ ] 2. Create the change with the README's standard block:

  ```sh
  set -euo pipefail
  test ! -e openspec/changes/migrate-di-bag
  env -u CLAUDECODE -u AGENT OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 new change migrate-di-bag --schema sdd-lean
  grep -n "schema: sdd-lean" openspec/changes/migrate-di-bag/.openspec.yaml
  ```

  Expected: `Created change 'migrate-di-bag'`, then `1:schema: sdd-lean`. The file's second line is
  `created: <the observed date>`; leave it as the command wrote it.

- [ ] 3. Apply section 7.1.
- [ ] 4. The strict OpenSpec block again, as step 0c with `openspec-s1` for `openspec-base`.
      Expected: exit 0, `items` = **O + 1**, `passed` = `items`, `failed` 0; and
      `jq -c '.items[] | select(.id == "migrate-di-bag") | .valid'` on the report prints `true`.
      Rehearsed: `{"items":116,"passed":116,"failed":0}`.
- [ ] 5. Append this slice's `verify.md` entry (section "Verification record entries"), then
      Prettier over the five owned paths and the hand-over:

  ```sh
  set -euo pipefail
  d=openspec/changes/migrate-di-bag
  printf '%s\n' "$d/.openspec.yaml" "$d/proposal.md" "$d/specs/di-bag-library/spec.md" \
    "$d/tasks.md" "$d/verify.md" > "$TMPDIR/owned.txt"
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  sort "$TMPDIR/owned.txt" > "$TMPDIR/evidence/owned-sorted.txt"
  diff "$TMPDIR/evidence/owned-sorted.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: `All matched files use Prettier code style!`, and the `diff` prints nothing: five `??`
  paths.

Planner commit subject: `docs(openspec): intent and spec for moving di-bag to 0.5.0`.

### Slice 2 — the codemod, the pin, the residual; one green commit

Owns (83 paths): the 82 paths of section 6's list "The owned paths of slice 2" below, and the
change's `verify.md`.

**Network: on**, restricted to `registry.npmjs.org` — step 2 reads package metadata, step 4's
`bunx` fetches `di-bag-codemod@0.1.0` and its `typescript` if the Bun cache lacks them, and step 5's
install fetches the `di-bag@0.5.0` tarball if the cache lacks it. Nx may attempt its analytics host;
the network policy denies that request. Nothing else needs network access.

- [ ] 1. Step 0, then the baselines, before any edit:

  ```sh
  set -euo pipefail
  grep -h '"version"' node_modules/di-bag/package.json | tee "$TMPDIR/evidence/di-bag-before.txt"
  grep -q '"version": "0.4.0"' node_modules/di-bag/package.json
  bash "$TMPDIR/suites.sh" base
  bash "$TMPDIR/run-check.sh" base-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t typecheck \
    -p wbs-core wbs-be-01 wbs-fe-01 tool-devsync --skip-nx-cache
  for check in base-devsync base-core base-backend base-frontend base-typecheck; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected: `"version": "0.4.0",`, each `status=0`; rehearsed: devsync `25 pass`, core `626 pass`,
  backend `61 pass`, frontend `Test Files 25 passed (25)` `Tests 222 passed (222)`, typecheck
  `Successfully ran target typecheck for 4 projects and 1 task they depend on`. Record each as that
  suite's **N**. The codemod needs 0.4.0 installed: any other version is a stop (section 10).

- [ ] 2. **The registry, read again** (network):

  ```sh
  set -euo pipefail
  env -u CLAUDECODE -u AGENT bun -e '
  const bag = await (await fetch("https://registry.npmjs.org/di-bag")).json();
  console.log("di-bag latest", bag["dist-tags"].latest);
  for (const v of ["0.4.0", "0.5.0"]) {
    const m = bag.versions[v];
    console.log("di-bag", v, bag.time[v], JSON.stringify({ dependencies: m.dependencies ?? null, peerDependencies: m.peerDependencies ?? null, engines: m.engines ?? null, exports: Object.keys(m.exports) }));
  }
  const mod = await (await fetch("https://registry.npmjs.org/di-bag-codemod")).json();
  const cm = mod.versions["0.1.0"];
  console.log("di-bag-codemod latest", mod["dist-tags"].latest, JSON.stringify({ dependencies: cm.dependencies, bin: Object.keys(cm.bin) }));
  ' | tee "$TMPDIR/evidence/registry.txt"
  ```

  Expected, exactly these four lines (observed 2026-09-25):

  ```text
  di-bag latest 0.5.0
  di-bag 0.4.0 2026-09-19T07:24:07.081Z {"dependencies":null,"peerDependencies":null,"engines":null,"exports":[".","./node"]}
  di-bag 0.5.0 2026-09-25T17:07:39.729Z {"dependencies":null,"peerDependencies":null,"engines":null,"exports":["."]}
  di-bag-codemod latest 0.1.0 {"dependencies":{"typescript":"^6.0.3"},"bin":["di-bag-codemod"]}
  ```

  A newer `latest` of either package, or any dependency, peer or engine on 0.5.0, is a stop.

- [ ] 3. Nothing to do here: the codemod runs against the tree exactly as step 0 found it.
- [ ] 4. **The codemod** (network), with 0.4.0 still installed, then the paths it wrote:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/codemod.sh" | tee "$TMPDIR/evidence/codemod-summary.txt"
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/codemod-status.txt"
  if other=$(grep -v '^ M ' "$TMPDIR/evidence/codemod-status.txt"); then
    printf 'not a modification: %s\n' "$other" >&2
    exit 1
  else
    rc=$?
    test "$rc" -eq 1
  fi
  cut -c4- "$TMPDIR/evidence/codemod-status.txt" | sort > "$TMPDIR/evidence/codemod-paths.txt"
  wc -l < "$TMPDIR/evidence/codemod-paths.txt"
  sha256sum < "$TMPDIR/evidence/codemod-paths.txt"
  ```

  Expected, exactly (rehearsed twice, in two clones):

  ```text
  libs/wbs/application/core/tsconfig.spec.json | 45 files, 434 rewrites, 31 manual items (TypeScript 6.0.3, project)
  libs/wbs/application/core/tsconfig.lib.json | 0 files, 0 rewrites, 29 manual items (TypeScript 6.0.3, project)
  apps/wbs/be-01/tsconfig.spec.json | 11 files, 113 rewrites, 35 manual items (TypeScript 6.0.3, project)
  apps/wbs/be-01/tsconfig.lib.json | 0 files, 0 rewrites, 35 manual items (TypeScript 6.0.3, project)
  apps/wbs/fe-01/tsconfig.spec.json | 18 files, 149 rewrites, 22 manual items (TypeScript 6.0.3, project)
  apps/wbs/fe-01/tsconfig.app.json | 0 files, 0 rewrites, 8 manual items (TypeScript 6.0.3, project)
  apps/wbs/fe-01/tsconfig.e2e.json | 2 files, 11 rewrites, 11 manual items (TypeScript 6.0.3, project)
  tools/tool-devsync/tsconfig.spec.json | 1 files, 2 rewrites, 0 manual items (TypeScript 6.0.3, project)
  77
  900a70bbaf29c7a62721a11c29eaa082c73cc0c5d896e5ba2e0b9dcc32471590  -
  ```

  Any other line is a stop: the codemod's output is what every later diff is written against.

- [ ] 5. Apply section 7.2 (the pin), then **install** and prove what it installed:

  ```sh
  set -euo pipefail
  git apply --check "$TMPDIR/patches/02.diff"
  git apply "$TMPDIR/patches/02.diff"
  bash "$TMPDIR/run-check.sh" install env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory \
    bun install --frozen-lockfile
  bash "$TMPDIR/expect-status.sh" install 0
  grep -h '"version"' node_modules/di-bag/package.json | tee "$TMPDIR/evidence/di-bag-after.txt"
  grep -q '"version": "0.5.0"' node_modules/di-bag/package.json
  git diff --stat -- package.json bun.lock
  ```

  Expected: `install | … status=0` (rehearsed `1 package installed`), `"version": "0.5.0",`, then
  `2 files changed, 3 insertions(+), 3 deletions(-)`.

- [ ] 6. **Prettier over exactly the codemod's paths**, then the residual test side:

  ```sh
  set -euo pipefail
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/evidence/codemod-paths.txt") > "$TMPDIR/evidence/codemod-prettier.log"
  git apply --check "$TMPDIR/patches/03.diff"
  git apply "$TMPDIR/patches/03.diff"
  ```

  Expected: exit 0. A `git apply --check` refusal here means the codemod or Prettier produced other
  bytes than the rehearsal's: a stop.

- [ ] 7. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/suites.sh" red
  bash "$TMPDIR/run-check.sh" red-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t typecheck \
    -p wbs-core wbs-be-01 wbs-fe-01 tool-devsync --skip-nx-cache
  for check in red-devsync red-core red-backend; do bash "$TMPDIR/expect-status.sh" "$check" 0; done
  bash "$TMPDIR/expect-status.sh" red-frontend 1
  log="$TMPDIR/evidence/red-typecheck.log"
  test -f "$log"
  test "$(tail -n 1 "$log")" != "status=0"
  sed 's/\x1b\[[0-9;]*m//g' "$log" > "$TMPDIR/evidence/red-typecheck.plain.log"
  grep -oE '^apps/wbs/fe-01/src/runtime/[a-z-]+\.(test\.)?ts:[0-9]+:[0-9]+ - error TS[0-9]+' \
    "$TMPDIR/evidence/red-typecheck.plain.log" | sort -u | tee "$TMPDIR/evidence/red-typecheck.errors.txt"
  test "$(wc -l < "$TMPDIR/evidence/red-typecheck.errors.txt")" -eq 7
  # tsc reports a production file once per tsconfig that includes it; every report must be in the
  # four named files.
  if grep ' - error TS' "$TMPDIR/evidence/red-typecheck.plain.log" > "$TMPDIR/evidence/red-typecheck.all.txt"; then :; else rc=$?; test "$rc" -eq 1; fi
  test -s "$TMPDIR/evidence/red-typecheck.all.txt"
  if outside=$(grep -vE '^apps/wbs/fe-01/src/runtime/(application-runtime|application-runtime\.test|project-runtime|session-runtime)\.ts:' "$TMPDIR/evidence/red-typecheck.all.txt"); then
    printf 'a diagnostic outside the four files: %s\n' "$outside" >&2
    exit 1
  else
    rc=$?
    test "$rc" -eq 1
  fi
  if dicaught=$(grep -c 'DI_BAG_INVALID_ARGUMENT: invalid close options' "$TMPDIR/evidence/red-frontend.log"); then :; else rc=$?; test "$rc" -eq 1; fi
  echo "invalid-close-options lines: $dicaught"
  test "$dicaught" -gt 0
  ```

  Expected, and rehearsed:

  | Suite     | Red                                                                                  | The fact it fails on                                                                                                                                                                                                                                                                                                                                                                           |
  | --------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | devsync   | `status=0`, N (25)                                                                   | — the pin and the label cast are already 0.5.0 on both sides                                                                                                                                                                                                                                                                                                                                   |
  | core      | `status=0`, N (626)                                                                  | — the core's production side changes only JSDoc                                                                                                                                                                                                                                                                                                                                                |
  | backend   | `status=0`, N (61)                                                                   | — the same                                                                                                                                                                                                                                                                                                                                                                                     |
  | frontend  | `status=1`; rehearsed `14 failed \| 11 passed (25)`, `94 failed \| 130 passed (224)` | `acquireTransactionally` still hands DI Bag the lifetime's `{ timeoutMs }`: 35 failures read `Error: DI_BAG_INVALID_ARGUMENT: invalid close options`, the rest are their downstream (`expected 'fatal' to be 'empty'`, a model property failing after 1 or 2 tests)                                                                                                                            |
  | typecheck | non-zero, `Failed tasks: - wbs-fe-01:typecheck`                                      | seven distinct `TS2345` diagnostics (13 lines: each production file is reported once per tsconfig that includes it), all passing a DI Bag `Container` (or the test's `{ close(options: { waitTimeoutMs }) }` graph) where `ClosableGraph` still wants `{ timeoutMs }`: four in `application-runtime.test.ts`, one each in `application-runtime.ts`, `project-runtime.ts`, `session-runtime.ts` |

  The exact frontend counts may move by a few between runs of a timing-sensitive file; what is a
  stop is a frontend `status=0`, a typecheck that passes, a typecheck error outside those four files,
  or no `invalid close options` line.

- [ ] 8. Apply section 7.4 (the production side, task 2.1 ticked), then **the content hash**:

  ````sh
  set -euo pipefail
  git apply --check "$TMPDIR/patches/04.diff"
  git apply "$TMPDIR/patches/04.diff"
  packet=docs/superpowers/plans/2026-09-25-batch-7/140-3-di-bag-migration.md
  awk '
    /^#### The owned paths of slice 2$/ { s=1; next }
    s && /^```text$/ { c=1; next }
    c && /^```$/ { exit }
    c { print }
  ' "$packet" > "$TMPDIR/evidence/owned-expected.txt"
  test "$(wc -l < "$TMPDIR/evidence/owned-expected.txt")" -eq 82
  git status --porcelain --untracked-files=all | cut -c4- | sort > "$TMPDIR/evidence/owned-hashed.txt"
  diff "$TMPDIR/evidence/owned-expected.txt" "$TMPDIR/evidence/owned-hashed.txt"
  while IFS= read -r path; do
    test -f "$path"
    sha256sum "$path"
  done < "$TMPDIR/evidence/owned-hashed.txt" > "$TMPDIR/evidence/owned-sha256.txt"
  sha256sum < "$TMPDIR/evidence/owned-sha256.txt" | tee "$TMPDIR/evidence/tree-hash.txt"
  grep -q '^e80d38d714be97fc5b698cfeb6fb16fddc7eff44aa6c5567b877166a828c4f46 ' "$TMPDIR/evidence/tree-hash.txt"
  ````

  Expected: exit 0, `diff` silent (`verify.md` has no entry yet, so the 82 paths are exactly the
  list), and `e80d38d714be97fc5b698cfeb6fb16fddc7eff44aa6c5567b877166a828c4f46  -`. **A different
  hash is a stop** (section 10): report `owned-sha256.txt`, and the planner compares it with the
  rehearsal's per-file hashes.

- [ ] 9. **Green checkpoint**, then **the registry probe on Bun and both compilers.** The probe
      lives under `$TMPDIR`, beside a symbolic link to this clone's `node_modules`, so it resolves
      exactly what the repository installed and adds nothing to the working tree. The link is read
      only: nothing is installed through it.

  ```sh
  set -euo pipefail
  bash "$TMPDIR/suites.sh" green
  bash "$TMPDIR/run-check.sh" green-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t typecheck \
    -p wbs-core wbs-be-01 wbs-fe-01 tool-devsync --skip-nx-cache
  bash "$TMPDIR/run-check.sh" green-lint env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t lint \
    -p wbs-core wbs-be-01 wbs-fe-01 tool-devsync --skip-nx-cache
  bash "$TMPDIR/run-check.sh" green-modules env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run wbs-fe-01:typecheck:module --skip-nx-cache
  for check in green-devsync green-core green-backend green-frontend green-typecheck green-lint green-modules; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  probe="$TMPDIR/registry-probe"
  mkdir -p "$probe"
  ln -sfn "$PWD/node_modules" "$probe/node_modules"
  cat > "$probe/tsconfig.json" <<'EOF'
  {
    "compilerOptions": {
      "strict": true,
      "noEmit": true,
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "lib": ["ES2022", "DOM"],
      "types": [],
      "skipLibCheck": false
    },
    "files": ["registry-probe.ts"]
  }
  EOF
  cat > "$probe/registry-probe.ts" <<'EOF'
  import { DiBag, DiBagCloseCancelledError, DiBagDisposalError } from 'di-bag';

  function check(fact: string, holds: boolean): void {
    if (!holds) throw new Error(`probe: ${fact} does not hold`);
    console.log(`ok ${fact}`);
  }

  async function refusalOf(pending: Promise<unknown>): Promise<unknown> {
    return await pending.then(
      () => null,
      (thrown: unknown) => thrown,
    );
  }

  const inner = DiBag.createBuilder()
    .withServices({ secret: DiBag.createProvider(() => 41, { factoryReturnKind: 'sync-value' }) })
    .withServices({
      answer: DiBag.createProvider(({ secret }: { secret: number }) => secret + 1, {
        factoryReturnKind: 'sync-value',
      }),
    })
    .buildModule({ exportedServiceKeys: ['answer'], moduleLabel: 'backend.probe' });
  const host = DiBag.createBuilder().withInstalledModules([inner]).buildContainer();
  check('a sealed module resolves its export', host.resolve('answer') === 42);
  const labels = host.graphSnapshot().bindings.map((binding) => binding.bindingLabel);
  check('a private binding carries the module label', labels.includes('backend.probe/secret'));
  const unknown = (() => {
    try {
      (host as unknown as { resolve: (key: string) => unknown }).resolve('secret');
      return '';
    } catch (thrown: unknown) {
      return String(thrown);
    }
  })();
  check('a private key answers DI_BAG_UNKNOWN_SERVICE_KEY', unknown.includes('DI_BAG_UNKNOWN_SERVICE_KEY'));
  check('the module keeps no public label', !Object.keys(inner).includes('label') && !('moduleLabel' in inner));

  const stuck = DiBag.createBuilder()
    .withServices({
      held: DiBag.providerWithDisposal({
        provider: DiBag.createProvider(() => 'held', { factoryReturnKind: 'sync-value' }),
        disposeService: () => new Promise<void>(() => undefined),
      }),
    })
    .buildContainer();
  stuck.resolve('held');
  const expiry = await refusalOf(stuck.close({ waitTimeoutMs: 20 }));
  check('a close past its budget is DiBagCloseCancelledError', expiry instanceof DiBagCloseCancelledError);
  check(
    'the refusal names its wait budget and keeps the disposal promise',
    expiry instanceof DiBagCloseCancelledError &&
      expiry.details.waitTimeoutMs === 20 &&
      expiry.disposalPromise instanceof Promise,
  );
  const legacy = await refusalOf(
    (stuck as unknown as { close: (options: object) => Promise<void> }).close({ timeoutMs: 20 }),
  );
  check('a 0.4.0 close option is refused', String(legacy).includes('DI_BAG_INVALID_ARGUMENT'));

  const failing = DiBag.createBuilder()
    .withServices({
      held: DiBag.providerWithDisposal({
        provider: DiBag.createProvider(() => 'held', { factoryReturnKind: 'sync-value' }),
        disposeService: () => Promise.reject(new Error('will not let go')),
      }),
    })
    .buildContainer();
  failing.resolve('held');
  const disposal = await refusalOf(failing.close());
  check('a failed disposal is DiBagDisposalError', disposal instanceof DiBagDisposalError);
  check('its code is DI_BAG_DISPOSAL_FAILED', String(disposal).includes('DI_BAG_DISPOSAL_FAILED'));
  const manifest = (await import('di-bag/package.json' as string, { with: { type: 'json' } })) as {
    default: { version: string; exports: Record<string, unknown> };
  };
  check('the installed release is 0.5.0', manifest.default.version === '0.5.0');
  check('the root is the only entry point', Object.keys(manifest.default.exports).join() === '.');
  EOF
  test "$(tail -n 1 "$probe/registry-probe.ts")" = "check('the root is the only entry point', Object.keys(manifest.default.exports).join() === '.');"
  bash "$TMPDIR/run-check.sh" probe-bun env -u CLAUDECODE -u AGENT bun "$probe/registry-probe.ts"
  bash "$TMPDIR/run-check.sh" probe-tsc7 node_modules/.bin/tsc -p "$probe/tsconfig.json"
  bash "$TMPDIR/run-check.sh" probe-tsc6 node_modules/.bin/tsc6 -p "$probe/tsconfig.json"
  node_modules/.bin/tsc --version
  node_modules/.bin/tsc6 --version
  for check in probe-bun probe-tsc7 probe-tsc6; do bash "$TMPDIR/expect-status.sh" "$check" 0; done
  grep -v '^status=' "$TMPDIR/evidence/probe-bun.log"
  ```

  Expected `status=0` everywhere, with devsync, core and backend = **N** (25, 626, 61), frontend
  `Test Files 25 passed (25)` and `Tests` = **N + 2** (224: the two budget tests), typecheck
  `Successfully ran target typecheck for 4 projects and 1 task they depend on`, lint `Successfully
ran target lint for 4 projects`; `Version 7.0.2` and `Version 6.0.3`; both compilers silent; and
  the Bun run prints exactly (rehearsed 2026-09-25):

  ```text
  ok a sealed module resolves its export
  ok a private binding carries the module label
  ok a private key answers DI_BAG_UNKNOWN_SERVICE_KEY
  ok the module keeps no public label
  ok a close past its budget is DiBagCloseCancelledError
  ok the refusal names its wait budget and keeps the disposal promise
  ok a 0.4.0 close option is refused
  ok a failed disposal is DiBagDisposalError
  ok its code is DI_BAG_DISPOSAL_FAILED
  ok the installed release is 0.5.0
  ok the root is the only entry point
  ```

  A lint finding that is only `simple-import-sort` or `prettier/prettier` is fixed with
  `bunx eslint --fix <file>` (preamble rule 17) — then step 8's hash no longer matches, which is a
  stop: report it rather than fix it, because the rehearsal's tree passed lint as it stands.

- [ ] 10. The strict OpenSpec block (step 0c, named `openspec-s2`): `items` = **O**, all passed.
- [ ] 11. Append this slice's `verify.md` entry, then Prettier and the hand-over. `bun.lock` has no
      Prettier parser and is left out of the Prettier list, not out of the path list:

  ```sh
  set -euo pipefail
  { cat "$TMPDIR/evidence/owned-expected.txt"; echo openspec/changes/migrate-di-bag/verify.md; } \
    | sort > "$TMPDIR/owned.txt"
  grep -vx 'bun.lock' "$TMPDIR/owned.txt" > "$TMPDIR/prettier.txt"
  test "$(wc -l < "$TMPDIR/prettier.txt")" -eq 82
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/prettier.txt")
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  diff "$TMPDIR/owned.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: `All matched files use Prettier code style!` (a `--check`, not a `--write`: a write
  would move the hash; if `verify.md` alone needs formatting, run `--write` on it only and rerun), and
  the `diff` prints nothing: 83 ` M` paths.

Planner commit subject: `build(deps): move di-bag to 0.5.0 through its codemod and a residual edit`.

#### The owned paths of slice 2

Slice 2 step 8 extracts this block; slice 2's hand-over adds `verify.md` to it.

```text
apps/wbs/be-01/src/boot.db.test.ts
apps/wbs/be-01/src/boot.ts
apps/wbs/be-01/src/module/optimization/check.ts
apps/wbs/be-01/src/module/optimization/module.test.ts
apps/wbs/be-01/src/module/optimization/module.ts
apps/wbs/be-01/src/module/solver-launcher/check.ts
apps/wbs/be-01/src/module/solver-launcher/module.test.ts
apps/wbs/be-01/src/module/solver-launcher/module.ts
apps/wbs/be-01/src/module/solver-supervisor/check.ts
apps/wbs/be-01/src/module/solver-supervisor/module.test.ts
apps/wbs/be-01/src/module/solver-supervisor/module.ts
apps/wbs/fe-01/e2e/browser-packages-probe.ts
apps/wbs/fe-01/e2e/lifetime-fault-probe.ts
apps/wbs/fe-01/src/app.test.tsx
apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
apps/wbs/fe-01/src/lib/theme.model.test.tsx
apps/wbs/fe-01/src/modules/directory-management/module.test.ts
apps/wbs/fe-01/src/modules/directory-management/module.ts
apps/wbs/fe-01/src/modules/preferences/contract.ts
apps/wbs/fe-01/src/modules/preferences/module.test.ts
apps/wbs/fe-01/src/modules/preferences/module.ts
apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx
apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
apps/wbs/fe-01/src/runtime/application-runtime.test.ts
apps/wbs/fe-01/src/runtime/application-runtime.ts
apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts
apps/wbs/fe-01/src/runtime/lifetime-slot.ts
apps/wbs/fe-01/src/runtime/project-runtime.ts
apps/wbs/fe-01/src/runtime/session-exit.model.test.ts
apps/wbs/fe-01/src/runtime/session-runtime.test.ts
apps/wbs/fe-01/src/runtime/session-runtime.ts
bun.lock
libs/wbs/application/core/src/module/authentication/check.ts
libs/wbs/application/core/src/module/authentication/module.test.ts
libs/wbs/application/core/src/module/authentication/module.ts
libs/wbs/application/core/src/module/bounded-replay-sweep/check.ts
libs/wbs/application/core/src/module/bounded-replay-sweep/module.test.ts
libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
libs/wbs/application/core/src/module/calendar-marker/check.ts
libs/wbs/application/core/src/module/calendar-marker/module.test.ts
libs/wbs/application/core/src/module/calendar-marker/module.ts
libs/wbs/application/core/src/module/capacity/check.ts
libs/wbs/application/core/src/module/capacity/module.test.ts
libs/wbs/application/core/src/module/capacity/module.ts
libs/wbs/application/core/src/module/directory/check.ts
libs/wbs/application/core/src/module/directory/module.test.ts
libs/wbs/application/core/src/module/directory/module.ts
libs/wbs/application/core/src/module/plan-commands/check.ts
libs/wbs/application/core/src/module/plan-commands/module.test.ts
libs/wbs/application/core/src/module/plan-commands/module.ts
libs/wbs/application/core/src/module/plan-document/check.ts
libs/wbs/application/core/src/module/plan-document/module.test.ts
libs/wbs/application/core/src/module/plan-document/module.ts
libs/wbs/application/core/src/module/plan-history/check.ts
libs/wbs/application/core/src/module/plan-history/module.test.ts
libs/wbs/application/core/src/module/plan-history/module.ts
libs/wbs/application/core/src/module/plan-import/check.ts
libs/wbs/application/core/src/module/plan-import/module.test.ts
libs/wbs/application/core/src/module/plan-import/module.ts
libs/wbs/application/core/src/module/priority-band/check.ts
libs/wbs/application/core/src/module/priority-band/module.test.ts
libs/wbs/application/core/src/module/priority-band/module.ts
libs/wbs/application/core/src/module/project/check.ts
libs/wbs/application/core/src/module/project/module.test.ts
libs/wbs/application/core/src/module/project/module.ts
libs/wbs/application/core/src/module/realtime/check.ts
libs/wbs/application/core/src/module/realtime/module.test.ts
libs/wbs/application/core/src/module/realtime/module.ts
libs/wbs/application/core/src/module/saved-plans/check.ts
libs/wbs/application/core/src/module/saved-plans/module.test.ts
libs/wbs/application/core/src/module/saved-plans/module.ts
libs/wbs/application/core/src/module/step/check.ts
libs/wbs/application/core/src/module/step/module.test.ts
libs/wbs/application/core/src/module/step/module.ts
libs/wbs/application/core/src/module/work-item/check.ts
libs/wbs/application/core/src/module/work-item/module.test.ts
libs/wbs/application/core/src/module/work-item/module.ts
openspec/changes/migrate-di-bag/tasks.md
package.json
tools/tool-devsync/src/module-labels.test.ts
tools/tool-devsync/src/toolchain-pins.test.ts
```

### Slice 3 — the new negatives

Owns (5 paths): `apps/wbs/fe-01/src/runtime/application-runtime.ts`,
`apps/wbs/fe-01/browser-packages.test.ts`, `tools/tool-devsync/src/toolchain-pins.test.ts` (all
three `Proof:` comments only), and the change's `tasks.md` and `verify.md`. The planner adds two more
in the same commit after section 8.4: `apps/wbs/fe-01/e2e/browser-packages.spec.ts` and
`apps/wbs/fe-01/e2e/fault-boundary.spec.ts` (`Proof:` comments only).

- [ ] 1. Step 0, then the baselines:

  ```sh
  set -euo pipefail
  grep -q '"version": "0.5.0"' node_modules/di-bag/package.json
  bash "$TMPDIR/suites.sh" base
  for check in base-devsync base-core base-backend base-frontend; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected every suite `status=0` at slice 2's green counts (rehearsed 25, 626, 61, 25·224). **A
  clone whose `node_modules` still holds 0.4.0** (the attempt was resumed without an install) fails
  the first line: run `env -u CLAUDECODE -u AGENT bun install --frozen-lockfile` once, record it,
  and rerun this step. The install must succeed offline from the Bun cache (slice 3 has no
  network); needing the network is a stop.

- [ ] 2. Section 8.1's faults with section 8's procedure: every fault observed first, each restored
      and compared, then the `Proof:` comments at the sites 8.1 names.
- [ ] 3. Apply section 7.5 (task 3.1 ticked).
- [ ] 4. Rerun the suites and the lint and typecheck of the two touched projects:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/suites.sh" final
  bash "$TMPDIR/run-check.sh" s3-lint env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t lint \
    -p wbs-fe-01 tool-devsync --skip-nx-cache
  bash "$TMPDIR/run-check.sh" s3-typecheck env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t typecheck \
    -p wbs-fe-01 tool-devsync --skip-nx-cache
  for check in final-devsync final-core final-backend final-frontend s3-lint s3-typecheck; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  ```

  Expected: every suite at its step-1 count, lint and typecheck `status=0`.

- [ ] 5. Append this slice's `verify.md` entry; Prettier over the five owned paths; the hand-over:

  ```sh
  set -euo pipefail
  printf '%s\n' \
    apps/wbs/fe-01/browser-packages.test.ts \
    apps/wbs/fe-01/src/runtime/application-runtime.ts \
    openspec/changes/migrate-di-bag/tasks.md \
    openspec/changes/migrate-di-bag/verify.md \
    tools/tool-devsync/src/toolchain-pins.test.ts \
    > "$TMPDIR/owned.txt"
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  sort "$TMPDIR/owned.txt" > "$TMPDIR/evidence/owned-sorted.txt"
  diff "$TMPDIR/evidence/owned-sorted.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: five ` M` paths, the `diff` silent.

Planner, before committing: section 8.4 in Chromium, then its two `Proof:` comments, then
`prettier --check` on the two spec files. Planner commit subject:
`test(runtime): prove the close budget reaches di-bag and the browser entry holds on 0.5.0`.

### Slice 4 — the recorded example faults, observed again, and the records

Owns (5 paths): `docs/superpowers/plans/2026-09-17-personal-package-adoption.md`,
`openspec/changes/adopt-di-composition/design.md`,
`openspec/changes/adopt-di-composition/specs/di-composition/spec.md`, and the change's `tasks.md`
and `verify.md`… and nothing else: **no `Proof:` comment is written or changed in this slice.**
Each fault's observation goes into `verify.md`, dated with the observed date.

- [ ] 1. Step 0, then the baselines as slice 3 step 1 (the same four suites, `status=0`, rehearsed
      25, 626, 61, 25·224).
- [ ] 2. Section 8.2's offline faults with section 8's procedure (75 records). Rehearsed wall time:
      about 13 minutes; the loop prints one line per fault as it goes.
- [ ] 3. Apply section 7.6 (the records, task 3.2 ticked).
- [ ] 4. The strict OpenSpec block (named `openspec-s4`): `items` = **O**, all passed.
- [ ] 5. Append this slice's `verify.md` entry; Prettier over the five owned paths; the hand-over as
      slice 3 step 5 with this list:

  ```sh
  set -euo pipefail
  printf '%s\n' \
    docs/superpowers/plans/2026-09-17-personal-package-adoption.md \
    openspec/changes/adopt-di-composition/design.md \
    openspec/changes/adopt-di-composition/specs/di-composition/spec.md \
    openspec/changes/migrate-di-bag/tasks.md \
    openspec/changes/migrate-di-bag/verify.md \
    > "$TMPDIR/owned.txt"
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  sort "$TMPDIR/owned.txt" > "$TMPDIR/evidence/owned-sorted.txt"
  diff "$TMPDIR/evidence/owned-sorted.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: five ` M` paths, the `diff` silent.

Planner commit subject:
`docs(plans): record the di-bag move and observe its recorded faults again on 0.5.0`.

### Slice 5 — the model tests, at their pinned seeds, and every recorded model sabotage

Owns (2 paths): the change's `tasks.md` and `verify.md`.

- [ ] 1. Step 0, then **every model test at its pinned seed**:

  ```sh
  set -euo pipefail
  grep -q '"version": "0.5.0"' node_modules/di-bag/package.json
  (cd apps/wbs/fe-01 && git ls-files 'src/*.model.test.*') > "$TMPDIR/evidence/model-files.txt"
  test "$(wc -l < "$TMPDIR/evidence/model-files.txt")" -eq 11
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  bash "$TMPDIR/run-check.sh" models env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT TZ=UTC bash -c \
    "cd apps/wbs/fe-01 && bunx vitest run --no-file-parallelism --maxWorkers=1 $(tr '\n' ' ' < "$TMPDIR/evidence/model-files.txt")"
  bash "$TMPDIR/expect-status.sh" models 0
  for file in $(cat "$TMPDIR/evidence/model-files.txt"); do
    printf '%s seed=%s runs=%s\n' "$file" \
      "$(grep -oE 'seed: [0-9]+' "apps/wbs/fe-01/$file" | tr '\n' ' ')" \
      "$(grep -oE 'numRuns: [0-9_]+' "apps/wbs/fe-01/$file" | tr '\n' ' ')"
  done | tee "$TMPDIR/evidence/model-seeds.txt"
  ```

  Expected: `models | Test Files 11 passed (11) Tests 12 passed (12) status=0`, and the eleven seed
  lines of section 8.3's first table (every file pins `numRuns: 300`; the seeds are 20260923 for the
  lifetime slot, 20260925 for the theme, 20260924 for the other nine).

- [ ] 2. Section 8.3's faults with section 8's procedure (74 records). Rehearsed wall time:
      about 25 minutes. Then extract every run number:

  ```sh
  set -euo pipefail
  packet=docs/superpowers/plans/2026-09-25-batch-7/140-3-di-bag-migration.md
  while IFS= read -r id && IFS= read -r _ && IFS= read -r _ && IFS= read -r _ && IFS= read -r _ \
    && IFS= read -r _; do
    log="$TMPDIR/evidence/$id.log"
    test -f "$log"
    plain=$(sed 's/\x1b\[[0-9;]*m//g' "$log")
    if run=$(grep -oE 'Property failed after [0-9]+ tests?' <<< "$plain"); then :; else rc=$?; test "$rc" -eq 1; run='example'; fi
    if shrunk=$(grep -oE 'Shrunk [0-9]+ time' <<< "$plain"); then :; else rc=$?; test "$rc" -eq 1; shrunk='-'; fi
    printf '%s | %s | %s\n' "$id" "$run" "$shrunk"
  done < "$TMPDIR/proofs.txt" | tee "$TMPDIR/evidence/model-runs.txt"
  ```

  Expected: one line per record whose run and shrink count equal section 8.3's table. A different run
  number is **not** by itself a stop — the model or its subject may have moved since the sabotage was
  first recorded, which the table's "recorded" column shows where it did — but the fault must fail
  the named property; a green property is a stop.

- [ ] 3. Apply section 7.7 (task 3.3 ticked).
- [ ] 4. Append this slice's `verify.md` entry (every line of `model-runs.txt` and
      `model-seeds.txt`); Prettier over the two owned paths; the hand-over as slice 3 step 5 with
      `openspec/changes/migrate-di-bag/tasks.md` and `openspec/changes/migrate-di-bag/verify.md`.
      Expected: two ` M` paths, the `diff` silent.

Planner commit subject: `test(frontend): observe every model sabotage again on di-bag 0.5.0`.

### Verification record entries

Each slice appends one entry to `openspec/changes/migrate-di-bag/verify.md`, headed
`## Packet 140.3, slice N — <what the slice did>`, containing only its own observations: the
attempt id and starting hash; step 0's baselines as numbers; every command's status; the registry
lines, the codemod's eight summary lines, the red checkpoint's diagnostics, the tree hash and the
probe's output (slice 2); every fault of that slice with its observed diagnostic, and for slice 3
both runs of each clause-disabled pair; the model runs (slice 5); and what stayed **pending planner
verification** (section 9.4). Evidence references are basenames relative to that attempt's evidence
directory, never absolute paths. Dates are the executor's own observed dates.

### Dispatch

One attempt per slice, from the reviewed packet, driven by Codex gpt-6-sol at medium effort in a workspace-write sandbox. The base of slice 1
is planning with this plan branch's commits since `e93a564a0` **cherry-picked in order** (never
the rehearsal branch). Before the first dispatch the planner runs section 9.1's script with
`REAL_BASE=<reviewed-base-sha>`; its `fill=real` output is the dispatch evidence. This block holds
the only absolute paths in this document.

```sh
# Slice 1, from the reviewed base.
EXEC_MODEL=gpt-6-sol EXEC_EFFORT=medium \
  /home/df/wd/puni/puni-plan/exec/run-executor.sh \
  140-3-di-bag-migration 1 <reviewed-base-sha> \
  --driver codex \
  --batch batch-7 --batch-dir docs/superpowers/plans/2026-09-25-batch-7 \
  --slice-note 'reviewed base <reviewed-base-sha>' \
  --preserve evidence

# Slice 2, into the same clone once slice 1 is committed as P1. Network for the registry only.
EXEC_MODEL=gpt-6-sol EXEC_EFFORT=medium \
  /home/df/wd/puni/puni-plan/exec/run-executor.sh \
  140-3-di-bag-migration 2 P1 \
  --driver codex \
  --batch batch-7 --batch-dir docs/superpowers/plans/2026-09-25-batch-7 \
  --resume --require-ancestor P1 --network \
  --slice-note 'reviewed base P1' \
  --preserve evidence

# Slices 3, 4 and 5 the same way from P2, P3 and P4, without --network.
```

**A `fill=real` failure is a planner stop**, never a waiver: rebase the rehearsal on the new base
and re-rehearse the affected slices before dispatch. If main moved any of slice 2's 82 paths, the
hash in slice 2 step 8 and every diff after the codemod must be re-rehearsed too.

No `--seed`: no slice reads another attempt's evidence. `--slice-note` is load-bearing: step 0a
reads the reviewed SHA from it. Slice 2's install changes the clone's `node_modules`, which
`--resume` keeps for slices 3 to 5 (their step 1 checks it). Slice 2's `bunx` warms
`di-bag-codemod` into the attempt's `TMPDIR`; no later slice needs it.

## 7. The code

Seven fenced diffs, in slice order. Step 0b extracts them as `01.diff` … `07.diff`, and section 9.1
applies all of them, in order, with the codemod run between the first and the second, to a tree
extracted from the base, and proves the result equal to the rehearsal's final commit. No diff adds a
`Proof:` comment; the executor writes those after observing its own faults. `bun.lock`'s hunk is
Bun's own output of `bun add --exact di-bag@0.5.0`, including the integrity hash. 7.3 and 7.4 are
written against the codemod's output **after** slice 2 step 6's Prettier pass. The dates in 7.4
(the label check's JSDoc names no date) and 7.6 ("Amendment, 2026-09-25", "Amended 2026-09-25") are
the planner's decision date for this move, not observed dates: the executor keeps them as written.

### 7.1 The OpenSpec change — slice 1

```diff
diff --git a/openspec/changes/migrate-di-bag/proposal.md b/openspec/changes/migrate-di-bag/proposal.md
new file mode 100644
index 000000000..c450e30a0
--- /dev/null
+++ b/openspec/changes/migrate-di-bag/proposal.md
@@ -0,0 +1,68 @@
+## Why
+
+The repository pins `di-bag` 0.4.0; the registry carries 0.5.0, a breaking release that renames
+almost every public name, removes the `di-bag/node` entry, renames the close options
+(`waitTimeoutMs`, `abortSignal`) and the disposal fields (`disposalPromise`), and replaces 42
+runtime error codes with 32. Twenty sealed modules, the backend's composition root, the frontend's
+three runtimes and the lifetime slot all compose through it.
+
+## What Changes
+
+**Composition library**
+
+- From: `di-bag` 0.4.0, its builder, provider and module names, and `di-bag/node`.
+- To: `di-bag` 0.5.0, every caller moved by the library's own codemod plus a residual edit for
+  what the codemod cannot see (calls behind casts, message assertions, non-literal close options).
+- Impact: internal. No HTTP, WebSocket or MCP response changes.
+
+**Operator-visible failures**
+
+- From: a module that is missing a requirement or resolved from outside answers
+  `DI_BAG_MISSING_REGISTRATION`; a failed disposal is `DiBagCleanupError`.
+- To: `DI_BAG_UNKNOWN_SERVICE_KEY` and `DiBagDisposalError`, each message ending in a link to the
+  library's errors page. `DI_BAG_MISSING_DEPENDENCY` and the module labels are unchanged.
+- Impact: contractual for anything that matches di-bag's codes in logs.
+
+**Lifetime budgets**
+
+- From: the lifetime slot's `{ timeoutMs }` passed straight to a DI Bag close.
+- To: the slot keeps `timeoutMs`; the one transaction that owns a built graph hands it to DI Bag
+  as `waitTimeoutMs`, and a test proves the budget arrives.
+
+## Non-Goals
+
+No label-agreement change: 0.5.0 still exposes a module's label only as the prefix of its private
+bindings' names, so WBS 040.13 stays open. No new module, lifetime or runtime. No
+`di-bag-codemod` dependency: it runs once through `bunx` and is not pinned in the manifest.
+
+## Constraints
+
+Exact pin through Bun, one lockfile edit, one green commit for the move. Every changed safety
+check carries a watched production-path negative under R5, and the recorded sabotages of the
+modules, the lifetimes and the model tests are observed again on 0.5.0.
+
+## Capabilities
+
+### New Capabilities
+
+- `di-bag-library`: The composition library is one exact release, reached from one entry point,
+  and a lifetime's close budget reaches the library's own wait.
+
+### Modified Capabilities
+
+None.
+
+## Domain Terms
+
+None.
+
+## Decisions Recorded
+
+None.
+
+## Impact
+
+`package.json`, `bun.lock`, the sealed modules under `libs/wbs/application/core/src/module` and
+`apps/wbs/be-01/src/module`, `apps/wbs/be-01/src/boot.ts`, the frontend runtimes and modules
+under `apps/wbs/fe-01/src`, the browser probes, and the pins and label suites in
+`tools/tool-devsync`.
diff --git a/openspec/changes/migrate-di-bag/specs/di-bag-library/spec.md b/openspec/changes/migrate-di-bag/specs/di-bag-library/spec.md
new file mode 100644
index 000000000..30acc7feb
--- /dev/null
+++ b/openspec/changes/migrate-di-bag/specs/di-bag-library/spec.md
@@ -0,0 +1,31 @@
+## ADDED Requirements
+
+### Requirement: One composition library release, from one entry point
+
+The root manifest SHALL pin `di-bag` to one exact release, and browser code SHALL reach the
+library only through its root entry, so that no Node built-in is bundled for the browser.
+
+#### Scenario: The pin is exact
+
+- **WHEN** the pins suite reads the root manifest
+- **THEN** `di-bag` is pinned to `0.5.0` with no range
+
+#### Scenario: A Node built-in reaches the browser probe
+
+- **WHEN** the browser package probe imports a Node built-in
+- **THEN** the browser build test reports it as externalized for the browser
+
+### Requirement: A lifetime's close budget reaches the library's wait
+
+A runtime acquired transactionally SHALL hand the lifetime slot's close budget to DI Bag as the
+container's wait budget, both when the runtime closes and when a half-finished read is released.
+
+#### Scenario: A runtime whose disposal never settles is closed
+
+- **WHEN** the runtime is closed with a budget of 25 milliseconds
+- **THEN** DI Bag refuses the close with `DiBagCloseCancelledError` naming a 25 millisecond wait
+
+#### Scenario: A half-finished read is released
+
+- **WHEN** the refused read's release is given a budget of 30 milliseconds
+- **THEN** DI Bag refuses the release with `DiBagCloseCancelledError` naming a 30 millisecond wait
diff --git a/openspec/changes/migrate-di-bag/tasks.md b/openspec/changes/migrate-di-bag/tasks.md
new file mode 100644
index 000000000..ee4123858
--- /dev/null
+++ b/openspec/changes/migrate-di-bag/tasks.md
@@ -0,0 +1,21 @@
+## 1. Intent
+
+- [x] 1.1 Record the intent and the delta spec — test: strict `openspec validate --all --json`
+
+## 2. Move the composition library
+
+- [ ] 2.1 Move `di-bag` to 0.5.0 in one lockfile edit, run the library's codemod, apply the
+      residual edit and prove the tree equals the rehearsed one — test: the pins and label
+      suites, `wbs-core`, `wbs-be-01`, the frontend runtime, module and model suites, the browser
+      build test, the two budget tests, and the registry probe on Bun, TypeScript 7 and
+      TypeScript 6
+
+## 3. Negatives
+
+- [ ] 3.1 Prove the budget translation and the browser entry point — test: the named tests;
+      negative: each close site's budget altered and the probe given a Node built-in, each also
+      run with its clause disabled
+- [ ] 3.2 Observe again, on 0.5.0, the recorded faults whose outcome passes through the library —
+      test: each proof's named test; negative: each proof's own fault
+- [ ] 3.3 Rerun every fast-check model test at its pinned seed and observe again every recorded
+      model sabotage at its recorded run — test: the model suites; negative: each sabotage
diff --git a/openspec/changes/migrate-di-bag/verify.md b/openspec/changes/migrate-di-bag/verify.md
new file mode 100644
index 000000000..0ae4938e9
--- /dev/null
+++ b/openspec/changes/migrate-di-bag/verify.md
@@ -0,0 +1,7 @@
+# Verification Report
+
+**Change**: `migrate-di-bag`
+
+Each slice of packet 140.3 appends its own entry below: the attempt, its starting hash, its
+baselines, every command's status, the red and green counts, every fault observed, and what stayed
+pending planner verification.
```

### 7.2 The pin — slice 2 step 5

```diff
diff --git a/bun.lock b/bun.lock
index b20f8f60d..e8d74a116 100644
--- a/bun.lock
+++ b/bun.lock
@@ -22,7 +22,7 @@
         "application-exception": "0.7.0",
         "arktype": "^2.2.3",
         "caught-object-report-json": "13.0.0",
-        "di-bag": "0.4.0",
+        "di-bag": "0.5.0",
         "drizzle-orm": "1.0.0-rc.4",
         "elysia": "^1.4.30",
         "jose": "^6.2.12",
@@ -1400,7 +1400,7 @@

     "devlop": ["devlop@1.1.0", "", { "dependencies": { "dequal": "^2.0.0" } }, "sha512-RWmIqhcFf1lRYBvNmr7qTNuyCt/7/ns2jbpp1+PalgE/rDQcBT0fioSMUpJ93irlUhC5hrg4cYqe6U+0ImW0rA=="],

-    "di-bag": ["di-bag@0.4.0", "", {}, "sha512-nkM7sossJKvxw6cLsuEuYXDxg+S63AQD8TUMqElfSdiOG5WLVDvd0aZgk7l7+24xefGYXFqqoXbpBoN38gjOLw=="],
+    "di-bag": ["di-bag@0.5.0", "", {}, "sha512-Pk1yvfJpWTTv/IcDKnu8m7FX9Ovu8Do2cJsFcR8V0lvfVAyuZjP/7YYXW/VdynQUcLVaGPPNaEpQGJdCPXQxXw=="],

     "doctrine": ["doctrine@2.1.0", "", { "dependencies": { "esutils": "^2.0.2" } }, "sha512-35mSku4ZXK0vfCuHEDAwt55dg2jNajHZ1odvF+8SSr82EsZY4QmXfuWso8oEd8zRhVObSN18aM0CjSdoBX7zIw=="],

diff --git a/package.json b/package.json
index 150f2683d..6b09f1f0b 100644
--- a/package.json
+++ b/package.json
@@ -46,7 +46,7 @@
     "application-exception": "0.7.0",
     "arktype": "^2.2.3",
     "caught-object-report-json": "13.0.0",
-    "di-bag": "0.4.0",
+    "di-bag": "0.5.0",
     "drizzle-orm": "1.0.0-rc.4",
     "elysia": "^1.4.30",
     "jose": "^6.2.12",
```

### 7.3 The residual, test side — slice 2 step 6

What the codemod leaves in tests (section 3.2): the 22 `DI_BAG_MISSING_REGISTRATION` assertions,
the 20 `partial.build()` casts and the label check's cast, the 14 test-file non-literal closes and one probe close, the pin, the
`HalfGraph` type, the label check's JSDoc, and the two new budget tests with their helpers.

```diff
diff --git a/apps/wbs/be-01/src/module/optimization/module.test.ts b/apps/wbs/be-01/src/module/optimization/module.test.ts
index fdbf2be32..10e267006 100644
--- a/apps/wbs/be-01/src/module/optimization/module.test.ts
+++ b/apps/wbs/be-01/src/module/optimization/module.test.ts
@@ -196,7 +196,7 @@ describe('the Optimization module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('optimizationOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "optimizationOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "optimizationOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -218,9 +218,9 @@ describe('the Optimization module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([optimizationModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('optimizer')).toThrow(
       `Cannot resolve "${OPTIMIZATION_LABEL}/optimizationOptions": dependency "onChildError" is not registered. Resolution path: optimizer -> ${OPTIMIZATION_LABEL}/optimizationOptions -> onChildError.`,
diff --git a/apps/wbs/be-01/src/module/solver-launcher/module.test.ts b/apps/wbs/be-01/src/module/solver-launcher/module.test.ts
index fae51381c..6cdb59aeb 100644
--- a/apps/wbs/be-01/src/module/solver-launcher/module.test.ts
+++ b/apps/wbs/be-01/src/module/solver-launcher/module.test.ts
@@ -136,7 +136,7 @@ describe('the Solver launcher module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('launcherSeams'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "launcherSeams" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "launcherSeams" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -158,9 +158,9 @@ describe('the Solver launcher module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([solverLauncherModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('solverLauncher')).toThrow(
       `Cannot resolve "${SOLVER_LAUNCHER_LABEL}/launcherSeams": dependency "spawn" is not registered. Resolution path: solverLauncher -> ${SOLVER_LAUNCHER_LABEL}/launcherSeams -> spawn.`,
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/module.test.ts b/apps/wbs/be-01/src/module/solver-supervisor/module.test.ts
index d1c8d04cb..3a0efd798 100644
--- a/apps/wbs/be-01/src/module/solver-supervisor/module.test.ts
+++ b/apps/wbs/be-01/src/module/solver-supervisor/module.test.ts
@@ -167,7 +167,7 @@ describe('the Solver supervisor module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('supervisorOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "supervisorOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "supervisorOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -189,9 +189,9 @@ describe('the Solver supervisor module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([solverSupervisorModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('spawner')).toThrow(
       `Cannot resolve "${SOLVER_SUPERVISOR_LABEL}/supervisorOptions": dependency "memoryLimitMb" is not registered. Resolution path: spawner -> ${SOLVER_SUPERVISOR_LABEL}/supervisorOptions -> memoryLimitMb.`,
diff --git a/apps/wbs/fe-01/e2e/lifetime-fault-probe.ts b/apps/wbs/fe-01/e2e/lifetime-fault-probe.ts
index 8f4a99ba9..d00e2c4ef 100644
--- a/apps/wbs/fe-01/e2e/lifetime-fault-probe.ts
+++ b/apps/wbs/fe-01/e2e/lifetime-fault-probe.ts
@@ -51,7 +51,7 @@ function refuseAfterAcquiring(): RetirableRuntime<ApplicationServices> {
     new Error('saving plan p-7 for alice@example.com failed', {
       cause: { authorization: 'Bearer live-token', detail: 'row 42 of plan_steps' },
     }),
-    (options) => bag.close(options),
+    (options) => bag.close({ waitTimeoutMs: options.timeoutMs }),
   );
 }

diff --git a/apps/wbs/fe-01/src/app.test.tsx b/apps/wbs/fe-01/src/app.test.tsx
index 2aa577a56..04c20a9b0 100644
--- a/apps/wbs/fe-01/src/app.test.tsx
+++ b/apps/wbs/fe-01/src/app.test.tsx
@@ -607,7 +607,11 @@ describe('log out', () => {
       })
       .buildContainer();
     socket.resolve('socket');
-    const owner = recordingOwner(events, (options) => socket.close(options), 50);
+    const owner = recordingOwner(
+      events,
+      (options) => socket.close({ waitTimeoutMs: options.timeoutMs }),
+      50,
+    );
     await signedInWithProject(owner, () => events.push('signed out'));

     logOut();
diff --git a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
index 8882b2d04..c40ecfaf2 100644
--- a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
+++ b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
@@ -169,7 +169,7 @@ function acquireOver(world: HandleWorld, target: StoreName, disposal: Disposal)
       close: async (options: { timeoutMs: number }) => {
         await world.gate.wait();
         await world.scheduler.schedule(Promise.resolve(), `dispose ${target}`);
-        if (hanging !== null) await hanging.close(options);
+        if (hanging !== null) await hanging.close({ waitTimeoutMs: options.timeoutMs });
         await installed.close(options);
       },
     };
diff --git a/apps/wbs/fe-01/src/lib/theme.model.test.tsx b/apps/wbs/fe-01/src/lib/theme.model.test.tsx
index 60b707ca0..5cad0a62c 100644
--- a/apps/wbs/fe-01/src/lib/theme.model.test.tsx
+++ b/apps/wbs/fe-01/src/lib/theme.model.test.tsx
@@ -277,7 +277,7 @@ function acquireOver(world: ThemeWorld, target: StoreName, disposal: Disposal) {
       close: async (options: { timeoutMs: number }) => {
         await world.gate.wait();
         await world.scheduler.schedule(Promise.resolve(), `dispose ${target}`);
-        if (hanging !== null) await hanging.close(options);
+        if (hanging !== null) await hanging.close({ waitTimeoutMs: options.timeoutMs });
         await installed.close(options);
       },
     };
diff --git a/apps/wbs/fe-01/src/modules/directory-management/module.test.ts b/apps/wbs/fe-01/src/modules/directory-management/module.test.ts
index 81716819b..33cb82de0 100644
--- a/apps/wbs/fe-01/src/modules/directory-management/module.test.ts
+++ b/apps/wbs/fe-01/src/modules/directory-management/module.test.ts
@@ -39,7 +39,7 @@ describe('the directory-management module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('directory'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "directory" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "directory" is not registered.');
   });

   it('names itself when a host omits the client', () => {
@@ -49,8 +49,8 @@ describe('the directory-management module', () => {
         isActiveReader: DiBag.createProvider((): (() => boolean) => () => true, {
           factoryReturnKind: 'sync-value',
         }),
-      }) as unknown as { build: () => { resolve: (key: string) => unknown } };
-    const host = partial.build();
+      }) as unknown as { buildContainer: () => { resolve: (key: string) => unknown } };
+    const host = partial.buildContainer();

     expect(() => host.resolve('directoryManagement')).toThrow(
       `Cannot resolve "${DIRECTORY_MANAGEMENT_LABEL}/directory": dependency "directoryApi" is not registered.`,
diff --git a/apps/wbs/fe-01/src/modules/preferences/module.test.ts b/apps/wbs/fe-01/src/modules/preferences/module.test.ts
index f07913134..53126e917 100644
--- a/apps/wbs/fe-01/src/modules/preferences/module.test.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/module.test.ts
@@ -43,7 +43,7 @@ describe('the preferences module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('preferencesStore'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "preferencesStore" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "preferencesStore" is not registered.');
   });

   it('labels its owned store with the module name', () => {
@@ -66,9 +66,9 @@ describe('the preferences module', () => {
    */
   it('names itself when a host omits the browser store', () => {
     const partial = DiBag.createBuilder().withInstalledModules([preferencesModule]) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('preferences')).toThrow(
       `Cannot resolve "${PREFERENCES_LABEL}/preferencesStore": dependency "browserStore" is not registered. Resolution path: preferences -> ${PREFERENCES_LABEL}/preferencesStore -> browserStore.`,
diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx
index 4951ab014..904bc5e15 100644
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.model.test.tsx
@@ -209,7 +209,10 @@ describe("the page's bootstrap, under generated interleavings", () => {
                 })
                 .buildContainer();
               const services = bag.resolve('owned');
-              return { services, close: (options) => bag.close(options) };
+              return {
+                services,
+                close: (options) => bag.close({ waitTimeoutMs: options.timeoutMs }),
+              };
             };
           };

diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
index c5281082e..2851ae47f 100644
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.test.tsx
@@ -117,7 +117,7 @@ function refusingAcquisition(): () => RetirableRuntime<ApplicationServices> {
     bag.resolve('owned');
     throw new PartialAcquisitionError(
       new Error(`the page for ${SECRET} could not be composed`),
-      (options) => bag.close(options),
+      (options) => bag.close({ waitTimeoutMs: options.timeoutMs }),
     );
   };
 }
@@ -639,7 +639,7 @@ describe('the page-lifecycle retirement trigger', () => {
           })
           .buildContainer();
         const services = bag.resolve('owned');
-        return { services, close: (options) => bag.close(options) };
+        return { services, close: (options) => bag.close({ waitTimeoutMs: options.timeoutMs }) };
       };

       await bootstrapApplication(document.createElement('div'), {
@@ -740,7 +740,7 @@ describe('the page-lifecycle retirement trigger', () => {
           // second, parallel call to `bag.close()`, which would run the
           // disposers twice.
           close: (options) => {
-            const outcome = bag.close(options);
+            const outcome = bag.close({ waitTimeoutMs: options.timeoutMs });
             closeOutcome.current = outcome;
             return outcome;
           },
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.test.ts b/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
index 74b6eac5a..ae726b639 100644
--- a/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
@@ -1,4 +1,4 @@
-import { DiBag } from 'di-bag';
+import { DiBag, DiBagCloseCancelledError } from 'di-bag';
 import { describe, expect, it } from 'vitest';

 import { fakeBrowserStorage } from '@/modules/preferences/fake-browser-storage';
@@ -21,7 +21,7 @@ import {
 /** What a half-finished read of a real graph did, for the transaction assertions. */
 interface HalfGraph {
   readonly read: () => { readonly first: string; readonly second: string };
-  readonly graph: { readonly close: (options: { timeoutMs: number }) => Promise<void> };
+  readonly graph: { readonly close: (options: { waitTimeoutMs: number }) => Promise<void> };
   readonly disposals: () => readonly string[];
 }

@@ -61,6 +61,34 @@ function halfAcquiring(): HalfGraph {
   };
 }

+/**
+ * A real DI Bag graph whose one owned service never finishes disposing.
+ *
+ * Only DI Bag's own wait budget can end a close of it, so the budget the
+ * transaction handed DI Bag is what the refusal reports: the one place the
+ * slot's `timeoutMs` becomes the library's `waitTimeoutMs`.
+ */
+function neverDisposing() {
+  return DiBag.createBuilder()
+    .withServices({
+      owned: DiBag.providerWithDisposal({
+        provider: DiBag.createProvider((): string => 'held', { factoryReturnKind: 'sync-value' }),
+        disposeService: () => new Promise<void>(() => undefined),
+      }),
+    })
+    .buildContainer();
+}
+
+/** The wait budget in DI Bag's cancelled-close refusal. */
+async function budgetOfRefusedClose(closing: Promise<void>): Promise<number> {
+  const refusal = await closing.then(
+    () => new Error('the close was expected to outrun its budget'),
+    (thrown: unknown) => thrown,
+  );
+  if (!(refusal instanceof DiBagCloseCancelledError)) throw refusal;
+  return refusal.details.waitTimeoutMs;
+}
+
 describe('the page’s runtime, installed transactionally', () => {
   /**
    * The installer hands out the contract's exports and nothing else.
@@ -121,6 +149,34 @@ describe('the page’s runtime, installed transactionally', () => {
     expect(half.disposals()).toEqual(['first']);
   });

+  it('hands DI Bag the budget of a runtime’s own close', async () => {
+    const graph = neverDisposing();
+    const runtime = acquireTransactionally(graph, () => ({ owned: graph.resolve('owned') }));
+
+    expect(await budgetOfRefusedClose(runtime.close({ timeoutMs: 25 }))).toBe(25);
+  });
+
+  it('hands DI Bag the budget of a half-finished read’s release', async () => {
+    const graph = neverDisposing();
+
+    const refusal = ((): unknown => {
+      try {
+        acquireTransactionally(graph, () => {
+          graph.resolve('owned');
+          throw new Error('the second resource refused');
+        });
+      } catch (thrown: unknown) {
+        return thrown;
+      }
+      throw new Error('the half-finished read was expected to throw');
+    })();
+
+    expect(refusal).toBeInstanceOf(PartialAcquisitionError);
+    expect(
+      await budgetOfRefusedClose((refusal as PartialAcquisitionError).release({ timeoutMs: 30 })),
+    ).toBe(30);
+  });
+
   it('carries the original failure as the cause of a refused installation', () => {
     const half = halfAcquiring();

diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
index d3189c8a2..0f0acd29b 100644
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.model.test.ts
@@ -281,7 +281,7 @@ describe('the ownership rule, under generated interleavings', () => {
                   world.disposing,
                 );
                 try {
-                  await bag.close(options);
+                  await bag.close({ waitTimeoutMs: options.timeoutMs });
                 } finally {
                   world.disposing -= 1;
                   record.closeSettles += 1;
@@ -382,7 +382,7 @@ describe('the ownership rule, under generated interleavings', () => {
                   world.disposing,
                 );
                 try {
-                  await bag.close(options);
+                  await bag.close({ waitTimeoutMs: options.timeoutMs });
                 } finally {
                   world.disposing -= 1;
                   record.closeSettles += 1;
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts
index c6f795523..b74b875e3 100644
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.test.ts
@@ -49,7 +49,7 @@ interface RuntimeRecord {
  * resource — whose disposer this test chooses.
  *
  * Not a stub `close`: the refusals under test are DI Bag's own
- * `DiBagCleanupError` and `DiBagCloseCancelledError`, and a hand-written
+ * `DiBagDisposalError` and `DiBagCloseCancelledError`, and a hand-written
  * rejection would prove the slot against a shape the library never produces.
  * The record also keeps the `timeoutMs` each close was given, which is how the
  * production budget is asserted where it is actually used.
@@ -89,7 +89,7 @@ function runtimeNamed(
       services,
       close: (options) => {
         budgets.push(options.timeoutMs);
-        return bag.close(options);
+        return bag.close({ waitTimeoutMs: options.timeoutMs });
       },
     },
     closes: () => closes,
@@ -138,7 +138,7 @@ function acquiresThenThrows(dispose: () => Promise<void>): PartialAcquisition {
         .buildContainer();
       bag.resolve('first');
       throw new PartialAcquisitionError(new Error('the second resource refused'), (options) =>
-        bag.close(options),
+        bag.close({ waitTimeoutMs: options.timeoutMs }),
       );
     },
   };
@@ -596,7 +596,7 @@ describe('one lifetime’s ownership', () => {
     await expect(
       slot.replace(() => ({
         services: bag.resolve('owned'),
-        close: (options) => bag.close(options),
+        close: (options) => bag.close({ waitTimeoutMs: options.timeoutMs }),
       })),
     ).resolves.toBe(null);
     expect(slot.snapshot()).toEqual({ status: 'live', services: null });
diff --git a/apps/wbs/fe-01/src/runtime/session-exit.model.test.ts b/apps/wbs/fe-01/src/runtime/session-exit.model.test.ts
index f238386d2..a533df60d 100644
--- a/apps/wbs/fe-01/src/runtime/session-exit.model.test.ts
+++ b/apps/wbs/fe-01/src/runtime/session-exit.model.test.ts
@@ -664,7 +664,9 @@ describe('log out, against a reference model', () => {
                             throw new Error(`${project.name}'s socket would not close`);
                           }
                           if (project.mode === 'hangs')
-                            await socketThatNeverCloses().close(options);
+                            await socketThatNeverCloses().close({
+                              waitTimeoutMs: options.timeoutMs,
+                            });
                         } catch (refusal: unknown) {
                           if (refusal instanceof DiBagCloseCancelledError)
                             reached.projectTimedOut += 1;
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.test.ts b/apps/wbs/fe-01/src/runtime/session-runtime.test.ts
index 6337b92a6..d11c8c762 100644
--- a/apps/wbs/fe-01/src/runtime/session-runtime.test.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.test.ts
@@ -286,7 +286,7 @@ describe('log out', () => {
             services: installed.services,
             close: async (options) => {
               await installed.close(options);
-              await socket.close(options);
+              await socket.close({ waitTimeoutMs: options.timeoutMs });
             },
           };
         },
diff --git a/libs/wbs/application/core/src/module/authentication/module.test.ts b/libs/wbs/application/core/src/module/authentication/module.test.ts
index d0278b7f5..544bca1db 100644
--- a/libs/wbs/application/core/src/module/authentication/module.test.ts
+++ b/libs/wbs/application/core/src/module/authentication/module.test.ts
@@ -178,7 +178,7 @@ describe('the Authentication module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('authOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "authOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "authOptions" is not registered.');
   });

   /** A host that installs the module cannot name what the module did not export. */
@@ -187,7 +187,7 @@ describe('the Authentication module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('throttleOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "throttleOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "throttleOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -215,9 +215,9 @@ describe('the Authentication module', () => {
         }),
         now: DiBag.createProvider(() => requirements().now, { factoryReturnKind: 'sync-value' }),
       }) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('loginThrottle')).toThrow(
       `Cannot resolve "${AUTHENTICATION_LABEL}/throttleOptions": dependency "maxConcurrentLogins" is not registered. Resolution path: loginThrottle -> ${AUTHENTICATION_LABEL}/throttleOptions -> maxConcurrentLogins.`,
diff --git a/libs/wbs/application/core/src/module/bounded-replay-sweep/module.test.ts b/libs/wbs/application/core/src/module/bounded-replay-sweep/module.test.ts
index 4087149b3..69da2212f 100644
--- a/libs/wbs/application/core/src/module/bounded-replay-sweep/module.test.ts
+++ b/libs/wbs/application/core/src/module/bounded-replay-sweep/module.test.ts
@@ -122,7 +122,7 @@ describe('the Bounded replay sweep module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('retentionOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "retentionOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "retentionOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -159,9 +159,9 @@ describe('the Bounded replay sweep module', () => {
         onSweep: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
         onError: DiBag.createProvider(() => () => undefined, { factoryReturnKind: 'sync-value' }),
       }) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('retention')).toThrow(
       `Cannot resolve "${BOUNDED_REPLAY_SWEEP_LABEL}/retentionOptions": dependency "planEvents" is not registered. Resolution path: retention -> ${BOUNDED_REPLAY_SWEEP_LABEL}/retentionOptions -> planEvents.`,
diff --git a/libs/wbs/application/core/src/module/calendar-marker/module.test.ts b/libs/wbs/application/core/src/module/calendar-marker/module.test.ts
index b5b8dfc6e..51ad066b6 100644
--- a/libs/wbs/application/core/src/module/calendar-marker/module.test.ts
+++ b/libs/wbs/application/core/src/module/calendar-marker/module.test.ts
@@ -115,7 +115,7 @@ describe('the Calendar marker module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('calendarMarkerOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "calendarMarkerOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "calendarMarkerOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -137,9 +137,9 @@ describe('the Calendar marker module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([calendarMarkerModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('calendarMarkers')).toThrow(
       `Cannot resolve "${CALENDAR_MARKER_LABEL}/calendarMarkerOptions": dependency "clock" is not registered. Resolution path: calendarMarkers -> ${CALENDAR_MARKER_LABEL}/calendarMarkerOptions -> clock.`,
diff --git a/libs/wbs/application/core/src/module/capacity/module.test.ts b/libs/wbs/application/core/src/module/capacity/module.test.ts
index e3fc61c58..02e97cd73 100644
--- a/libs/wbs/application/core/src/module/capacity/module.test.ts
+++ b/libs/wbs/application/core/src/module/capacity/module.test.ts
@@ -102,7 +102,7 @@ describe('the Capacity module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('capacityOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "capacityOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "capacityOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -124,9 +124,9 @@ describe('the Capacity module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([capacityModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('capacity')).toThrow(
       `Cannot resolve "${CAPACITY_LABEL}/capacityOptions": dependency "clock" is not registered. Resolution path: capacity -> ${CAPACITY_LABEL}/capacityOptions -> clock.`,
diff --git a/libs/wbs/application/core/src/module/directory/module.test.ts b/libs/wbs/application/core/src/module/directory/module.test.ts
index b7fda3241..58b04070a 100644
--- a/libs/wbs/application/core/src/module/directory/module.test.ts
+++ b/libs/wbs/application/core/src/module/directory/module.test.ts
@@ -89,7 +89,7 @@ describe('the Directory module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('directoryOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "directoryOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "directoryOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -111,9 +111,9 @@ describe('the Directory module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([directoryModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('directory')).toThrow(
       `Cannot resolve "${DIRECTORY_LABEL}/directoryOptions": dependency "clock" is not registered. Resolution path: directory -> ${DIRECTORY_LABEL}/directoryOptions -> clock.`,
diff --git a/libs/wbs/application/core/src/module/plan-commands/module.test.ts b/libs/wbs/application/core/src/module/plan-commands/module.test.ts
index 5fe914fd9..01685db7a 100644
--- a/libs/wbs/application/core/src/module/plan-commands/module.test.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/module.test.ts
@@ -141,7 +141,7 @@ describe('the Plan commands module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('planCommandOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "planCommandOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "planCommandOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -163,9 +163,9 @@ describe('the Plan commands module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([planCommandsModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('commands')).toThrow(
       `Cannot resolve "${PLAN_COMMANDS_LABEL}/planCommandOptions": dependency "announcements" is not registered. Resolution path: commands -> ${PLAN_COMMANDS_LABEL}/planCommandOptions -> announcements.`,
diff --git a/libs/wbs/application/core/src/module/plan-document/module.test.ts b/libs/wbs/application/core/src/module/plan-document/module.test.ts
index 841f18246..03d7d4310 100644
--- a/libs/wbs/application/core/src/module/plan-document/module.test.ts
+++ b/libs/wbs/application/core/src/module/plan-document/module.test.ts
@@ -125,7 +125,7 @@ describe('the Plan document module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('planDocumentOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "planDocumentOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "planDocumentOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -147,9 +147,9 @@ describe('the Plan document module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([planDocumentModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('planDocuments')).toThrow(
       `Cannot resolve "${PLAN_DOCUMENT_LABEL}/planDocumentOptions": dependency "clock" is not registered. Resolution path: planDocuments -> ${PLAN_DOCUMENT_LABEL}/planDocumentOptions -> clock.`,
diff --git a/libs/wbs/application/core/src/module/plan-history/module.test.ts b/libs/wbs/application/core/src/module/plan-history/module.test.ts
index 2f00c394e..ca3ea1f98 100644
--- a/libs/wbs/application/core/src/module/plan-history/module.test.ts
+++ b/libs/wbs/application/core/src/module/plan-history/module.test.ts
@@ -78,7 +78,7 @@ describe('the Plan history module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('historySettings'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "historySettings" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "historySettings" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -105,9 +105,9 @@ describe('the Plan history module', () => {
           factoryReturnKind: 'sync-value',
         }),
       }) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('history')).toThrow(
       `Cannot resolve "${PLAN_HISTORY_LABEL}/historySettings": dependency "planEventStore" is not registered. Resolution path: history -> ${PLAN_HISTORY_LABEL}/historySettings -> planEventStore.`,
diff --git a/libs/wbs/application/core/src/module/plan-import/module.test.ts b/libs/wbs/application/core/src/module/plan-import/module.test.ts
index a306f993a..32f87a716 100644
--- a/libs/wbs/application/core/src/module/plan-import/module.test.ts
+++ b/libs/wbs/application/core/src/module/plan-import/module.test.ts
@@ -110,7 +110,7 @@ describe('the Plan import module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('importOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "importOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "importOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -143,9 +143,9 @@ describe('the Plan import module', () => {
           factoryReturnKind: 'sync-value',
         }),
       }) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('imports')).toThrow(
       `Cannot resolve "${PLAN_IMPORT_LABEL}/importOptions": dependency "batchServices" is not registered. Resolution path: imports -> ${PLAN_IMPORT_LABEL}/importOptions -> batchServices.`,
diff --git a/libs/wbs/application/core/src/module/priority-band/module.test.ts b/libs/wbs/application/core/src/module/priority-band/module.test.ts
index 17b88d056..27a99ebb8 100644
--- a/libs/wbs/application/core/src/module/priority-band/module.test.ts
+++ b/libs/wbs/application/core/src/module/priority-band/module.test.ts
@@ -103,7 +103,7 @@ describe('the Priority band module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('priorityBandOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "priorityBandOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "priorityBandOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -125,9 +125,9 @@ describe('the Priority band module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([priorityBandModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('priorityBands')).toThrow(
       `Cannot resolve "${PRIORITY_BAND_LABEL}/priorityBandOptions": dependency "clock" is not registered. Resolution path: priorityBands -> ${PRIORITY_BAND_LABEL}/priorityBandOptions -> clock.`,
diff --git a/libs/wbs/application/core/src/module/project/module.test.ts b/libs/wbs/application/core/src/module/project/module.test.ts
index 528748cb9..dad169820 100644
--- a/libs/wbs/application/core/src/module/project/module.test.ts
+++ b/libs/wbs/application/core/src/module/project/module.test.ts
@@ -101,7 +101,7 @@ describe('the Project module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('projectOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "projectOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "projectOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -123,9 +123,9 @@ describe('the Project module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([projectModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('projects')).toThrow(
       `Cannot resolve "${PROJECT_LABEL}/projectOptions": dependency "clock" is not registered. Resolution path: projects -> ${PROJECT_LABEL}/projectOptions -> clock.`,
diff --git a/libs/wbs/application/core/src/module/realtime/module.test.ts b/libs/wbs/application/core/src/module/realtime/module.test.ts
index 94dc66d78..76c131ad9 100644
--- a/libs/wbs/application/core/src/module/realtime/module.test.ts
+++ b/libs/wbs/application/core/src/module/realtime/module.test.ts
@@ -108,10 +108,10 @@ describe('the Realtime module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('broadcasterOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "broadcasterOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "broadcasterOptions" is not registered.');
     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('replayOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "replayOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "replayOptions" is not registered.');
   });

   /**
@@ -148,9 +148,9 @@ describe('the Realtime module', () => {
         maxEvents: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
         onPushFailed: DiBag.createProvider(() => undefined, { factoryReturnKind: 'sync-value' }),
       }) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('broadcaster')).toThrow(
       `Cannot resolve "${REALTIME_LABEL}/broadcasterOptions": dependency "push" is not registered. Resolution path: broadcaster -> ${REALTIME_LABEL}/broadcasterOptions -> push.`,
diff --git a/libs/wbs/application/core/src/module/saved-plans/module.test.ts b/libs/wbs/application/core/src/module/saved-plans/module.test.ts
index eceb3531f..ba81f699e 100644
--- a/libs/wbs/application/core/src/module/saved-plans/module.test.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/module.test.ts
@@ -150,7 +150,7 @@ describe('the Saved plans module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('savedPlanOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "savedPlanOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "savedPlanOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -172,9 +172,9 @@ describe('the Saved plans module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([savedPlansModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('savedPlans')).toThrow(
       `Cannot resolve "${SAVED_PLANS_LABEL}/savedPlanOptions": dependency "quota" is not registered. Resolution path: savedPlans -> ${SAVED_PLANS_LABEL}/savedPlanOptions -> quota.`,
diff --git a/libs/wbs/application/core/src/module/step/module.test.ts b/libs/wbs/application/core/src/module/step/module.test.ts
index 30be50155..d25d6a74e 100644
--- a/libs/wbs/application/core/src/module/step/module.test.ts
+++ b/libs/wbs/application/core/src/module/step/module.test.ts
@@ -100,7 +100,7 @@ describe('the Step module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('stepOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "stepOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "stepOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -122,9 +122,9 @@ describe('the Step module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([stepModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('steps')).toThrow(
       `Cannot resolve "${STEP_LABEL}/stepOptions": dependency "clock" is not registered. Resolution path: steps -> ${STEP_LABEL}/stepOptions -> clock.`,
diff --git a/libs/wbs/application/core/src/module/work-item/module.test.ts b/libs/wbs/application/core/src/module/work-item/module.test.ts
index 559ea4810..4c2fb230d 100644
--- a/libs/wbs/application/core/src/module/work-item/module.test.ts
+++ b/libs/wbs/application/core/src/module/work-item/module.test.ts
@@ -137,7 +137,7 @@ describe('the Work item module', () => {

     expect(() =>
       (host as unknown as { resolve: (key: string) => unknown }).resolve('workItemOptions'),
-    ).toThrow('DI_BAG_MISSING_REGISTRATION: Service "workItemOptions" is not registered.');
+    ).toThrow('DI_BAG_UNKNOWN_SERVICE_KEY: Service "workItemOptions" is not registered.');
   });

   /** The label is what makes a private binding identifiable in any graph report. */
@@ -159,9 +159,9 @@ describe('the Work item module', () => {
     const partial = DiBag.createBuilder()
       .withInstalledModules([workItemModule])
       .withServices(hostRequirements()) as unknown as {
-      build: () => { resolve: (key: string) => unknown };
+      buildContainer: () => { resolve: (key: string) => unknown };
     };
-    const host = partial.build();
+    const host = partial.buildContainer();

     expect(() => host.resolve('workItems')).toThrow(
       `Cannot resolve "${WORK_ITEM_LABEL}/workItemOptions": dependency "clock" is not registered. Resolution path: workItems -> ${WORK_ITEM_LABEL}/workItemOptions -> clock.`,
diff --git a/tools/tool-devsync/src/module-labels.test.ts b/tools/tool-devsync/src/module-labels.test.ts
index a425cf334..71afb8ea9 100644
--- a/tools/tool-devsync/src/module-labels.test.ts
+++ b/tools/tool-devsync/src/module-labels.test.ts
@@ -102,15 +102,16 @@ async function exportedValues(path: string): Promise<readonly unknown[]> {
  * The labels di-bag gives the private bindings of one installation of the module `module.ts`
  * exports, read from the running library rather than from any spelling in the source.
  *
- * Exported bindings keep their bare key and carry their public names in `keys`, so only a binding
- * with no key is read: an exported key that merely contains a slash cannot pass for a label. The
+ * Exported bindings keep their bare key and carry their public names in `serviceKeys`, so only a
+ * binding with no key is read: an exported key that merely contains a slash cannot pass for a label. The
  * label is observable only this way, so every sealed module keeps at least one private binding by
  * convention; one that exports every binding is refused as sealing none.
  *
- * Known limit: di-bag 0.4.0 exposes a label only as the prefix of private binding names, so a
- * module that drops its label and either spells `<label>/<key>` into a private key or installs an
- * inner module sealed under that label reads as labelled. Closing that needs a label the library
- * exposes itself, which is the di-bag migration's (packet D's route 1).
+ * Known limit: di-bag exposes a label only as the prefix of private binding names — 0.5.0 keeps
+ * `moduleLabel` write-only, held in a private `WeakMap` — so a module that drops its label and
+ * either spells `<label>/<key>` into a private key or installs an inner module sealed under that
+ * label reads as labelled. Closing that needs a label accessor the library does not have yet (WBS
+ * 040.13, left open by the 0.5.0 migration).
  *
  * @throws When `module.ts` exports anything but exactly one value, or when di-bag refuses it as a
  *   module.
@@ -126,15 +127,17 @@ async function privateBindingLabels(directory: string): Promise<readonly string[
   // The host below supplies none of the module's requirements, which the type checker refuses;
   // the runtime still builds the graph, and describing it resolves nothing.
   const builder = DiBag.createBuilder() as unknown as {
-    installModule: (module: unknown) => { build: () => { inspectGraph: () => GraphSnapshot } };
+    withInstalledModules: (modules: readonly unknown[]) => {
+      buildContainer: () => { graphSnapshot: () => GraphSnapshot };
+    };
   };
-  const graph = builder.installModule(values[0]).build().inspectGraph();
+  const graph = builder.withInstalledModules([values[0]]).buildContainer().graphSnapshot();
   // Proof (2026-09-24): reading no binding as private reported every one of the eighteen modules
   // as `seals no private binding` in "seals every module under the label its location implies"
   // (4 pass, 1 fail).
   return graph.bindings
     .filter((binding) => binding.serviceKeys.length === 0)
-    .map(({ bindingLabel: label }) => label);
+    .map((binding) => binding.bindingLabel);
 }

 /**
diff --git a/tools/tool-devsync/src/toolchain-pins.test.ts b/tools/tool-devsync/src/toolchain-pins.test.ts
index 51f14d9ae..336500ebb 100644
--- a/tools/tool-devsync/src/toolchain-pins.test.ts
+++ b/tools/tool-devsync/src/toolchain-pins.test.ts
@@ -503,7 +503,7 @@ describe('the CI gate scope', () => {
  * runtime is a different claim, proved by the resolution probe in the task's verification.
  */
 const OWNER_PACKAGES = {
-  'di-bag': '0.4.0',
+  'di-bag': '0.5.0',
   'application-exception': '0.7.0',
   'caught-object-report-json': '13.0.0',
 } as const;
```

### 7.4 The residual, production side, and task 2.1 — slice 2 step 8

`ClosableGraph` and `acquireTransactionally`'s translation (section 3.3); the JSDoc that names a
removed code or call; the three comments the codemod split around `disposeService:` in `boot.ts`,
put back together above it.

```diff
diff --git a/apps/wbs/be-01/src/boot.ts b/apps/wbs/be-01/src/boot.ts
--- a/apps/wbs/be-01/src/boot.ts
+++ b/apps/wbs/be-01/src/boot.ts
@@ -98,9 +98,8 @@
           { factoryReturnKind: 'sync-value' },
         ),
         // Proof: on 2026-09-20, swallowing this refusal produced no cleanup
-        disposeService:
-          // error: expected `DiBagCleanupError`, received `undefined`.
-          (source) => source.close(),
+        // error: expected `DiBagCleanupError`, received `undefined`.
+        disposeService: (source) => source.close(),
       }),
       services: DiBag.createProvider(
         ({ source }: { source: OwnedSource }): BeServices =>
@@ -133,15 +132,14 @@
           { factoryReturnKind: 'sync-value' },
         ),
         // Proof: on 2026-09-20, dropping this disposal made the refused-release
-        disposeService:
-          // test report `Expected: false`, `Received: true` for timer activity.
-          (retention) => retention.stop(),
+        // test report `Expected: false`, `Received: true` for timer activity.
+        disposeService: (retention) => retention.stop(),
       }),
       // The listener is the last thing acquired and the first thing released.
-      // `withDisposal` owns the app this returns; the pushed disposers own what
+      // `providerWithDisposal` owns the app this returns; the pushed disposers own what
       // the factory took on the way, so a failure between `listen` and the
       // optimizer releases both at once instead of leaving a bound socket.
-      // Pushed disposers run last first, after the `withDisposal` one: app.stop,
+      // Pushed disposers run last first, after the `providerWithDisposal` one: app.stop,
       // optimizer.stop, retention.stop, source.close — the order this process
       // has always shut down in.
       server: DiBag.providerWithDisposal({
@@ -206,7 +204,7 @@
               version: opts.version,
             });
             // Pushed before `listen`, because from here on there is something
-            // to give back. On the clean path the `withDisposal` below stops the
+            // to give back. On the clean path the `providerWithDisposal` below stops the
             // app and this sees `service-disposed` and does nothing.
             // Proof: on 2026-09-20, deleting this push made startup rollback
             // report `Expected: true`, `Received: false` for a refused port.
@@ -262,13 +260,12 @@
           { factoryReturnKind: 'sync-value', factoryReceivesContext: true },
         ),
         // A block body, not `(app) => app.stop()`: Elysia's `stop()` resolves to
-        disposeService:
-          // the application, and a disposer must resolve to nothing.
-          // Proof: on 2026-09-20, replacing `app.stop()` with a resolved promise
-          // made source close observe `Expected: true`, `Received: false`.
-          async (app) => {
-            await app.stop();
-          },
+        // the application, and a disposer must resolve to nothing.
+        // Proof: on 2026-09-20, replacing `app.stop()` with a resolved promise
+        // made source close observe `Expected: true`, `Received: false`.
+        disposeService: async (app) => {
+          await app.stop();
+        },
       }),
     })
     .buildContainer()
@@ -289,7 +286,7 @@
      * `optimizerRunning: true` and `retentionRunning: true` at source close
      * (0 pass, 1 fail, 14 filtered, 1 assertion).
      *
-     * A disposer that rejects makes this reject with `DiBagCleanupError`, whose
+     * A disposer that rejects makes this reject with `DiBagDisposalError`, whose
      * `failures` name the resource; every other release is still attempted.
      * Repeated calls do not rerun disposers. They replay the first close's
      * outcome, including its cleanup error.
diff --git a/apps/wbs/be-01/src/module/optimization/module.ts b/apps/wbs/be-01/src/module/optimization/module.ts
--- a/apps/wbs/be-01/src/module/optimization/module.ts
+++ b/apps/wbs/be-01/src/module/optimization/module.ts
@@ -14,7 +14,7 @@
  *
  * Only `optimizer` is exported. `optimizationOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `backend.optimization/optimizationOptions` rather than
  * against an anonymous binding. The five optional seams (`runChild`,
  * `editDebounceMs`, `sleep`, `setInterval`, `clearInterval`) are registered
diff --git a/apps/wbs/be-01/src/module/solver-launcher/module.ts b/apps/wbs/be-01/src/module/solver-launcher/module.ts
--- a/apps/wbs/be-01/src/module/solver-launcher/module.ts
+++ b/apps/wbs/be-01/src/module/solver-launcher/module.ts
@@ -18,7 +18,7 @@
  *
  * Only `solverLauncher` is exported. `launcherSeams` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `backend.solver-launcher/launcherSeams` rather than
  * against an anonymous binding. Both seams are registered even when absent,
  * as `undefined`, the way Saved plans registers its optional quota.
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/module.ts b/apps/wbs/be-01/src/module/solver-supervisor/module.ts
--- a/apps/wbs/be-01/src/module/solver-supervisor/module.ts
+++ b/apps/wbs/be-01/src/module/solver-supervisor/module.ts
@@ -16,7 +16,7 @@
  * `connectSolverSupervisor` stays a TypeScript diagnostic and test surface of
  * `solver-supervisor.repository.ts`, not a second DI service.
  * `supervisorOptions` stays private to each installation, so a host cannot
- * name it — resolving it answers `DI_BAG_MISSING_REGISTRATION` — and a
+ * name it — resolving it answers `DI_BAG_UNKNOWN_SERVICE_KEY` — and a
  * requirement the host forgot is reported against
  * `backend.solver-supervisor/supervisorOptions` rather than against an
  * anonymous binding. The optional connector is registered even when absent,
diff --git a/apps/wbs/fe-01/e2e/browser-packages-probe.ts b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
--- a/apps/wbs/fe-01/e2e/browser-packages-probe.ts
+++ b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
@@ -35,8 +35,8 @@
  * and report one typed failure twice.
  *
  * Every call here is one the adoption plan says browser code must be able to make:
- * `fromSyncFactory` and `fromAsyncFactory` fix the acquisition mode by name, so the
- * graph needs no `process.getBuiltinModule` classifier — a browser has none — and one
+ * `createProvider` with `factoryReturnKind: 'sync-value'` or `'native-promise'` fixes
+ * each provider's return kind by name, so the graph needs no `process.getBuiltinModule` classifier — a browser has none — and one
  * `makeReportPair` call correlates the operator's report with the disclosed one under a
  * single occurrence identifier.
  *
diff --git a/apps/wbs/fe-01/src/modules/directory-management/module.ts b/apps/wbs/fe-01/src/modules/directory-management/module.ts
--- a/apps/wbs/fe-01/src/modules/directory-management/module.ts
+++ b/apps/wbs/fe-01/src/modules/directory-management/module.ts
@@ -12,7 +12,7 @@
  * allowed to see, over a directory resource no host can name.
  *
  * `directory` stays private, so rule K2 holds by construction: resolving it
- * from a host answers `DI_BAG_MISSING_REGISTRATION`, and the page reaches the
+ * from a host answers `DI_BAG_UNKNOWN_SERVICE_KEY`, and the page reaches the
  * snapshot, the reads and the writes only through {@link DirectoryManagement}.
  * Its two host requirements are named in `DirectoryManagementRequirements`; a
  * host that forgets one is told which module asked, under
diff --git a/apps/wbs/fe-01/src/modules/preferences/contract.ts b/apps/wbs/fe-01/src/modules/preferences/contract.ts
--- a/apps/wbs/fe-01/src/modules/preferences/contract.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/contract.ts
@@ -174,7 +174,7 @@
  * dependency the same way it declares `preferencesStore`): a host that omits
  * `isLive` gets `DI_BAG_MISSING_DEPENDENCY: Cannot resolve "preferences":
  * dependency "isLive" is not registered.` — not a silent default, and not the
- * `DI_BAG_MISSING_REGISTRATION` code, which is what resolving a name nobody
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` code, which is what resolving a name nobody
  * ever registered (`preferencesStore` itself, from outside the module)
  * answers instead; see `module.ts`'s own JSDoc for that distinct case.
  * `createPreferences`'s own always-`true` default (`preferences.resource.ts`)
diff --git a/apps/wbs/fe-01/src/modules/preferences/module.ts b/apps/wbs/fe-01/src/modules/preferences/module.ts
--- a/apps/wbs/fe-01/src/modules/preferences/module.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/module.ts
@@ -21,7 +21,7 @@
  * {@link import('./contract').PreferencesExports}.
  *
  * `preferencesStore` stays private, so a host cannot name it — resolving it
- * answers `DI_BAG_MISSING_REGISTRATION` — and it is the module's **one owned
+ * answers `DI_BAG_UNKNOWN_SERVICE_KEY` — and it is the module's **one owned
  * disposable**: the revocable store, given back when the installation closes.
  * The raw adapter it wraps is a host requirement rather than a private binding,
  * which is what makes a host that forgets it say which module asked:
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.ts b/apps/wbs/fe-01/src/runtime/application-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -34,9 +34,14 @@
   readonly remembered: RememberedPreferences;
 }

-/** What a built graph owes a transaction: one bounded close for everything it took. */
+/**
+ * What a built graph owes a transaction: one bounded close for everything it took.
+ *
+ * DI Bag names the bound `waitTimeoutMs`; the lifetime slot's own contract keeps
+ * `timeoutMs`, and {@link acquireTransactionally} is the one place that translates.
+ */
 interface ClosableGraph {
-  readonly close: (options: { timeoutMs: number }) => Promise<void>;
+  readonly close: (options: { waitTimeoutMs: number }) => Promise<void>;
 }

 /**
@@ -64,13 +69,18 @@
   try {
     // Proof: on 2026-09-22, a resolved no-op close left the store readable after
     // 'revokes the store it owns when the installation closes' (3 failed, 39 passed).
-    return { services: read(), close: (options) => graph.close(options) };
+    return {
+      services: read(),
+      close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs }),
+    };
   } catch (failure) {
     // Proof: on 2026-09-22, rethrowing this unwrapped made 'releases everything a
     // half-finished read acquired' receive Error instead of PartialAcquisitionError.
     // Proof: on 2026-09-22, a resolved no-op release made that test record []
     // instead of ['first']; the graph's disposer never ran (1 failed, 41 passed).
-    throw new PartialAcquisitionError(failure, (options) => graph.close(options));
+    throw new PartialAcquisitionError(failure, (options) =>
+      graph.close({ waitTimeoutMs: options.timeoutMs }),
+    );
   }
 }

diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -52,7 +52,7 @@
  * table's effect used to start it.
  *
  * **The feed is the graph's one owned disposable**, given back through
- * `DiBag.withDisposal` when the runtime's close runs: its refresh owner is
+ * `DiBag.providerWithDisposal` when the runtime's close runs: its refresh owner is
  * disposed and its stream unsubscribed then, once. The stores and channels hold
  * nothing that needs giving back.
  *
diff --git a/libs/wbs/application/core/src/module/authentication/module.ts b/libs/wbs/application/core/src/module/authentication/module.ts
--- a/libs/wbs/application/core/src/module/authentication/module.ts
+++ b/libs/wbs/application/core/src/module/authentication/module.ts
@@ -15,7 +15,7 @@
  * module seals the two existing collaborators rather than inventing one.
  *
  * `throttleOptions` stays private to each installation, so a host cannot name
- * it — resolving it answers `DI_BAG_MISSING_REGISTRATION`, and a requirement
+ * it — resolving it answers `DI_BAG_UNKNOWN_SERVICE_KEY`, and a requirement
  * the host forgot is reported against `application.authentication/throttleOptions`
  * rather than against an anonymous binding. `authOptions` is also private:
  * it is the one place `account.users` is spread into both `users` and
diff --git a/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts b/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
--- a/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
+++ b/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
@@ -11,7 +11,7 @@
  *
  * Only `retention` is exported. `retentionOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.bounded-replay-sweep/retentionOptions` rather
  * than against an anonymous binding.
  *
diff --git a/libs/wbs/application/core/src/module/calendar-marker/module.ts b/libs/wbs/application/core/src/module/calendar-marker/module.ts
--- a/libs/wbs/application/core/src/module/calendar-marker/module.ts
+++ b/libs/wbs/application/core/src/module/calendar-marker/module.ts
@@ -15,7 +15,7 @@
  *
  * Only `calendarMarkers` is exported. `calendarMarkerOptions` stays private to
  * each installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.calendar-marker/calendarMarkerOptions` rather
  * than against an anonymous binding. The two stores are required as
  * `projectStore` and `calendarMarkerStore` because the host graph's
diff --git a/libs/wbs/application/core/src/module/capacity/module.ts b/libs/wbs/application/core/src/module/capacity/module.ts
--- a/libs/wbs/application/core/src/module/capacity/module.ts
+++ b/libs/wbs/application/core/src/module/capacity/module.ts
@@ -12,7 +12,7 @@
  *
  * Only `capacity` is exported. `capacityOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.capacity/capacityOptions` rather than against
  * an anonymous binding. The two stores are required as `projectStore` and
  * `capacityStore` because the host graph's `capacity` key is this module's
diff --git a/libs/wbs/application/core/src/module/directory/module.ts b/libs/wbs/application/core/src/module/directory/module.ts
--- a/libs/wbs/application/core/src/module/directory/module.ts
+++ b/libs/wbs/application/core/src/module/directory/module.ts
@@ -11,7 +11,7 @@
  *
  * Only `directory` is exported. `directoryOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.directory/directoryOptions` rather than
  * against an anonymous binding. The store is required as `directoryStore`
  * because the host graph's `directory` key is this module's export.
diff --git a/libs/wbs/application/core/src/module/plan-commands/module.ts b/libs/wbs/application/core/src/module/plan-commands/module.ts
--- a/libs/wbs/application/core/src/module/plan-commands/module.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/module.ts
@@ -14,7 +14,7 @@
  *
  * Only `commands` is exported. `planCommandOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.plan-commands/planCommandOptions` rather than
  * against an anonymous binding.
  *
diff --git a/libs/wbs/application/core/src/module/plan-document/module.ts b/libs/wbs/application/core/src/module/plan-document/module.ts
--- a/libs/wbs/application/core/src/module/plan-document/module.ts
+++ b/libs/wbs/application/core/src/module/plan-document/module.ts
@@ -10,7 +10,7 @@
  *
  * Only `planDocuments` is exported. `planDocumentOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.plan-document/planDocumentOptions` rather
  * than against an anonymous binding.
  *
diff --git a/libs/wbs/application/core/src/module/plan-history/module.ts b/libs/wbs/application/core/src/module/plan-history/module.ts
--- a/libs/wbs/application/core/src/module/plan-history/module.ts
+++ b/libs/wbs/application/core/src/module/plan-history/module.ts
@@ -10,7 +10,7 @@
  *
  * Only `history` is exported. `historySettings` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is reported
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is reported
  * against `application.plan-history/historySettings` rather than against an
  * anonymous binding.
  *
diff --git a/libs/wbs/application/core/src/module/plan-import/module.ts b/libs/wbs/application/core/src/module/plan-import/module.ts
--- a/libs/wbs/application/core/src/module/plan-import/module.ts
+++ b/libs/wbs/application/core/src/module/plan-import/module.ts
@@ -12,7 +12,7 @@
  *
  * Only `imports` is exported. `importOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is reported
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is reported
  * against `application.plan-import/importOptions` rather than against an
  * anonymous binding.
  *
diff --git a/libs/wbs/application/core/src/module/priority-band/module.ts b/libs/wbs/application/core/src/module/priority-band/module.ts
--- a/libs/wbs/application/core/src/module/priority-band/module.ts
+++ b/libs/wbs/application/core/src/module/priority-band/module.ts
@@ -12,7 +12,7 @@
  *
  * Only `priorityBands` is exported. `priorityBandOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.priority-band/priorityBandOptions` rather than
  * against an anonymous binding. The two stores are required as `projectStore`
  * and `priorityBandStore`, the naming every resource module here shares so
diff --git a/libs/wbs/application/core/src/module/project/module.ts b/libs/wbs/application/core/src/module/project/module.ts
--- a/libs/wbs/application/core/src/module/project/module.ts
+++ b/libs/wbs/application/core/src/module/project/module.ts
@@ -12,7 +12,7 @@
  *
  * Only `projects` is exported. `projectOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.project/projectOptions` rather than against
  * an anonymous binding. The store is required as `projectStore` because the
  * host graph's `projects` key is this module's export. `optimizerAvailable`
diff --git a/libs/wbs/application/core/src/module/saved-plans/module.ts b/libs/wbs/application/core/src/module/saved-plans/module.ts
--- a/libs/wbs/application/core/src/module/saved-plans/module.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/module.ts
@@ -13,7 +13,7 @@
  *
  * Only `savedPlans` is exported. `savedPlanOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.saved-plans/savedPlanOptions` rather than
  * against an anonymous binding. `quota` is registered even when absent, as
  * `undefined`, the way Realtime registers its optional `maxEvents`: the
diff --git a/libs/wbs/application/core/src/module/step/module.ts b/libs/wbs/application/core/src/module/step/module.ts
--- a/libs/wbs/application/core/src/module/step/module.ts
+++ b/libs/wbs/application/core/src/module/step/module.ts
@@ -12,7 +12,7 @@
  *
  * Only `steps` is exported. `stepOptions` stays private to each installation,
  * so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.step/stepOptions` rather than against an
  * anonymous binding. The two stores are required as `projectStore` and
  * `stepStore` because the host graph's `steps` key is this module's export.
diff --git a/libs/wbs/application/core/src/module/work-item/module.ts b/libs/wbs/application/core/src/module/work-item/module.ts
--- a/libs/wbs/application/core/src/module/work-item/module.ts
+++ b/libs/wbs/application/core/src/module/work-item/module.ts
@@ -23,7 +23,7 @@
  *
  * Only `workItems` is exported. `workItemOptions` stays private to each
  * installation, so a host cannot name it — resolving it answers
- * `DI_BAG_MISSING_REGISTRATION` — and a requirement the host forgot is
+ * `DI_BAG_UNKNOWN_SERVICE_KEY` — and a requirement the host forgot is
  * reported against `application.work-item/workItemOptions` rather than against
  * an anonymous binding. Every store is required under a `<name>Store` host key
  * because five of them (`workItems`, `projects`, `directory`, `capacity`,
diff --git a/openspec/changes/migrate-di-bag/tasks.md b/openspec/changes/migrate-di-bag/tasks.md
--- a/openspec/changes/migrate-di-bag/tasks.md
+++ b/openspec/changes/migrate-di-bag/tasks.md
@@ -4,7 +4,7 @@

 ## 2. Move the composition library

-- [ ] 2.1 Move `di-bag` to 0.5.0 in one lockfile edit, run the library's codemod, apply the
+- [x] 2.1 Move `di-bag` to 0.5.0 in one lockfile edit, run the library's codemod, apply the
       residual edit and prove the tree equals the rehearsed one — test: the pins and label
       suites, `wbs-core`, `wbs-be-01`, the frontend runtime, module and model suites, the browser
       build test, the two budget tests, and the registry probe on Bun, TypeScript 7 and
```

### 7.5 Task 3.1 — slice 3

```diff
diff --git a/openspec/changes/migrate-di-bag/tasks.md b/openspec/changes/migrate-di-bag/tasks.md
index 8626a70a3..5f61b809d 100644
--- a/openspec/changes/migrate-di-bag/tasks.md
+++ b/openspec/changes/migrate-di-bag/tasks.md
@@ -12,7 +12,7 @@

 ## 3. Negatives

-- [ ] 3.1 Prove the budget translation and the browser entry point — test: the named tests;
+- [x] 3.1 Prove the budget translation and the browser entry point — test: the named tests;
       negative: each close site's budget altered and the probe given a Node built-in, each also
       run with its clause disabled
 - [ ] 3.2 Observe again, on 0.5.0, the recorded faults whose outcome passes through the library —
```

### 7.6 The records and task 3.2 — slice 4

```diff
diff --git a/docs/superpowers/plans/2026-09-17-personal-package-adoption.md b/docs/superpowers/plans/2026-09-17-personal-package-adoption.md
index 16955f813..014f375f5 100644
--- a/docs/superpowers/plans/2026-09-17-personal-package-adoption.md
+++ b/docs/superpowers/plans/2026-09-17-personal-package-adoption.md
@@ -12,6 +12,29 @@

 **Status:** Proposed plan, requested on 2026-09-17; implementation has not started. “All projects” means complete coverage by role, including explicit dispositions where a package does not apply. User scope amendment: do not adopt DI Bag in the React frontend for now; retain frontend reporting work. Other proposed designs remain subject to review.

+## Amendment, 2026-09-25: di-bag moved to 0.5.0
+
+Work item 140.3 (OpenSpec change `migrate-di-bag`) moved `di-bag` from 0.4.0 to 0.5.0. Where this
+and the amendments below disagree, this one holds.
+
+- **Renamed API, moved by the library's codemod.** `register` is `withServices`,
+  `installModule(m)` is `withInstalledModules([m])`, `buildModule({ exports, label })` is
+  `buildModule({ exportedServiceKeys, moduleLabel })`, `build` is `buildContainer`,
+  `buildAndStart(keys)` is `buildContainer().ensureServicesReady(keys)`, `fromSyncFactory(f)` is
+  `createProvider(f, { factoryReturnKind: 'sync-value' })`, `withDisposal(p, d)` is
+  `providerWithDisposal({ provider, disposeService })`, and `inspectGraph()` is
+  `graphSnapshot()`, whose bindings name `serviceKeys` and `bindingLabel`.
+- **One entry point.** `di-bag/node` is gone; the browser rules below hold with `di-bag` alone.
+- **Close options.** `close({ waitTimeoutMs, abortSignal })`. The lifetime slot keeps its own
+  `timeoutMs`; `acquireTransactionally` is the one place that hands it to DI Bag, and a test
+  proves the budget arrives. A 0.4.0 option is refused with `DI_BAG_INVALID_ARGUMENT`.
+- **Codes and errors.** A key nobody registered answers `DI_BAG_UNKNOWN_SERVICE_KEY` (was
+  `DI_BAG_MISSING_REGISTRATION`); a failed disposal is `DiBagDisposalError` with
+  `DI_BAG_DISPOSAL_FAILED`; `DiBagCloseCancelledError` keeps its class and carries
+  `disposalPromise`. Messages end with a link to the library's errors page.
+- **Labels are still write-only.** 0.5.0 exposes a module's label only as the prefix of its
+  private bindings' names, so the label check's known limit stands (WBS 040.13).
+
 ## Amendment, 2026-09-25: the report libraries moved together

 Work item 140.1–140.2 (OpenSpec change `migrate-report-libraries`) moved
diff --git a/openspec/changes/adopt-di-composition/design.md b/openspec/changes/adopt-di-composition/design.md
index 300c6aba6..ed4e13e71 100644
--- a/openspec/changes/adopt-di-composition/design.md
+++ b/openspec/changes/adopt-di-composition/design.md
@@ -104,6 +104,11 @@ or `@wbs/runtime-portable directly` form is skipped until forwarding rows are co
 against the library's index; the kind rules own the wording. The frontend's
 `apps/wbs/fe-01/src/modules` is outside this change and carries no index block yet.

+Amended 2026-09-25 by `migrate-di-bag`: di-bag 0.5.0 still exposes a label only as that prefix —
+`buildModule`'s `moduleLabel` (0.4.0's `label`) is write-only, held in a private `WeakMap` — so the
+first limit stands, tracked as WBS 040.13; `inspectGraph()` is now `graphSnapshot()`, whose private
+bindings carry an empty `serviceKeys` and a `bindingLabel`.
+
 ## Layering debt ledger

 Task 7.4, per module: the obligations sealing leaves open, each stated in that module's
diff --git a/openspec/changes/adopt-di-composition/specs/di-composition/spec.md b/openspec/changes/adopt-di-composition/specs/di-composition/spec.md
index 57242deae..180f92da2 100644
--- a/openspec/changes/adopt-di-composition/specs/di-composition/spec.md
+++ b/openspec/changes/adopt-di-composition/specs/di-composition/spec.md
@@ -21,9 +21,9 @@ contract's services.

 ### Requirement: A module's label names its private bindings in failures

-Every sealed module SHALL be built with a `label` that is its module identifier with only the
+Every sealed module SHALL be built with a `moduleLabel` that is its module identifier with only the
 `module.` prefix dropped, so that its private bindings appear as `<label>/<key>` in DI failure
-messages and in `inspectGraph()`. A module that lives in a library SHALL be identified as
+messages and in `graphSnapshot()`. A module that lives in a library SHALL be identified as
 `module.<ring>.<name>`; a module that lives under an app SHALL be identified as
 `module.<runtime>.<name>`, where the runtime is `backend`, `frontend`, `gateway` or `mcp` by the app
 it lives under. The nine existing identifiers SHALL NOT change.
diff --git a/openspec/changes/migrate-di-bag/tasks.md b/openspec/changes/migrate-di-bag/tasks.md
index 5f61b809d..50e8c82f4 100644
--- a/openspec/changes/migrate-di-bag/tasks.md
+++ b/openspec/changes/migrate-di-bag/tasks.md
@@ -15,7 +15,7 @@
 - [x] 3.1 Prove the budget translation and the browser entry point — test: the named tests;
       negative: each close site's budget altered and the probe given a Node built-in, each also
       run with its clause disabled
-- [ ] 3.2 Observe again, on 0.5.0, the recorded faults whose outcome passes through the library —
+- [x] 3.2 Observe again, on 0.5.0, the recorded faults whose outcome passes through the library —
       test: each proof's named test; negative: each proof's own fault
 - [ ] 3.3 Rerun every fast-check model test at its pinned seed and observe again every recorded
       model sabotage at its recorded run — test: the model suites; negative: each sabotage
```

### 7.7 Task 3.3 — slice 5

```diff
diff --git a/openspec/changes/migrate-di-bag/tasks.md b/openspec/changes/migrate-di-bag/tasks.md
index 50e8c82f4..b76db9219 100644
--- a/openspec/changes/migrate-di-bag/tasks.md
+++ b/openspec/changes/migrate-di-bag/tasks.md
@@ -17,5 +17,5 @@
       run with its clause disabled
 - [x] 3.2 Observe again, on 0.5.0, the recorded faults whose outcome passes through the library —
       test: each proof's named test; negative: each proof's own fault
-- [ ] 3.3 Rerun every fast-check model test at its pinned seed and observe again every recorded
+- [x] 3.3 Rerun every fast-check model test at its pinned seed and observe again every recorded
       model sabotage at its recorded run — test: the model suites; negative: each sabotage
```

## 8. Proofs

Every fault below was injected for real in the rehearsal on 2026-09-25, on the rehearsal commit of
the slice before the one that owns it, the whole test file run, the file restored and compared,
before the next fault. The executor repeats each; in slice 3 it writes a `Proof:` comment **only
after observing its own failure**, dated with its own observed date (`date -u +%F`), and it runs
**all** of a slice's faults first and writes its comments afterwards, so every fault patch still
applies. Slices 4 and 5 write no comment: their observations go into `verify.md`.

**Applying a fault patch** always uses `git apply --unidiff-zero`: each hunk replaces whole lines it
names, and `git apply` finds them at an offset when a comment of unknown length sits above them. A
hunk that only **adds** lines (`@@ -N,0 …`) has nothing to find and lands at line N: every such hunk
here sits in a file no earlier slice of this packet edits, so N holds on the reviewed tree (section
9.1's `fill=1` proves it).

**Each slice's faults are records of six lines** — id; `fail` or `pass`; the runner (`bun`,
`bun-devsync`, `vitest` or `tsc-core`); the directory the test runs in; the test file, relative to
that directory; the named test (for `tsc-core`, a diagnostic substring; for a `pass` twin, `-`) — in
the first `text` block of that slice's subsection. A `fail` record requires exit 1 (2 for `tsc-core`)
and the named test among the failures; a `pass` record is a clause-disabled twin and requires exit 0.
Extract them:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-25-batch-7/140-3-di-bag-migration.md
section=8.1 # 8.1 for slice 3, 8.2 for slice 4, 8.3 for slice 5
test -f "$packet"
awk -v want="### $section " '
  index($0, want) == 1 { s=1; next }
  s && /^```text$/ { c=1; next }
  c && /^```$/ { exit }
  c { print }
' "$packet" > "$TMPDIR/proofs.txt"
test -s "$TMPDIR/proofs.txt"
test $(( $(wc -l < "$TMPDIR/proofs.txt") % 6 )) -eq 0
echo "records=$(( $(wc -l < "$TMPDIR/proofs.txt") / 6 ))"
````

Expected: `records=10` for slice 3, `records=75` for slice 4, `records=74` for slice 5.

**First, prove every named test exists** in its file, so no record can pass vacuously:

```sh
set -euo pipefail
while IFS= read -r id && IFS= read -r expect && IFS= read -r runner && IFS= read -r dir \
  && IFS= read -r file && IFS= read -r title; do
  if [ "$runner" = tsc-core ] || [ "$expect" = pass ]; then continue; fi
  test -f "$dir/$file"
  grep -qF -- "$title" "$dir/$file"
done < "$TMPDIR/proofs.txt"
echo "every named test found"
```

**Then every fault, in order**, with the loop step 0b wrote:

```sh
set -euo pipefail
bash "$TMPDIR/fault-loop.sh" "$TMPDIR/proofs.txt" | tee "$TMPDIR/evidence/fault-loop.txt"
```

Expected: one line per record, `<id> | fail | status=1 | …` (or `status=2` for `tsc-core`, `pass |
status=0` for a twin), with the counts its table gives, and exit 0. The loop stops at the first record
whose outcome differs, **after** that file was restored and compared — then preamble rule 20 applies.
Every command reads `/dev/null`. Extra failing tests are recorded, not a stop.

### 8.1 Slice 3 — the budget translation, the browser entry point and the pin

The records for `$TMPDIR/proofs.txt`:

```text
t1
fail
vitest
apps/wbs/fe-01
src/runtime/application-runtime.test.ts
hands DI Bag the budget of a runtime’s own close
t1c
pass
vitest
apps/wbs/fe-01
src/runtime/application-runtime.test.ts
-
t2
fail
vitest
apps/wbs/fe-01
src/runtime/application-runtime.test.ts
hands DI Bag the budget of a half-finished read’s release
t2c
pass
vitest
apps/wbs/fe-01
src/runtime/application-runtime.test.ts
-
t3
fail
vitest
apps/wbs/fe-01
src/runtime/application-runtime.test.ts
hands DI Bag the budget of a runtime’s own close
t3c
pass
vitest
apps/wbs/fe-01
src/runtime/application-runtime.test.ts
-
b1
fail
vitest
apps/wbs/fe-01
browser-packages.test.ts
externalizes no Node built-in for the browser
b1c
pass
vitest
apps/wbs/fe-01
browser-packages.test.ts
-
p1
fail
bun-devsync
tools/tool-devsync
src/toolchain-pins.test.ts
are pinned to exact versions in the root manifest
p1c
pass
bun-devsync
tools/tool-devsync
src/toolchain-pins.test.ts
-
```

Rehearsed on `83ebf251f` (slice 2), 2026-09-25:

| Id    | Fault                                                                 | Expect | Whole file                   | Observed                                                          |
| ----- | --------------------------------------------------------------------- | ------ | ---------------------------- | ----------------------------------------------------------------- |
| `t1`  | `acquireTransactionally`'s close hands DI Bag `options.timeoutMs + 1` | fail   | `1 failed \| 15 passed (16)` | AssertionError: expected 26 to be 25                              |
| `t1c` | `t1`, with that test's `toBe(25)` weakened to `toBeTypeOf('number')`  | pass   | `16 passed (16)`             | no other clause catches the fault                                 |
| `t2`  | the partial release hands DI Bag `options.timeoutMs + 1`              | fail   | `1 failed \| 15 passed (16)` | AssertionError: expected 31 to be 30                              |
| `t2c` | `t2`, with that test's `toBe(30)` weakened to `toBeTypeOf('number')`  | pass   | `16 passed (16)`             | no other clause catches the fault                                 |
| `t3`  | both close calls reject the numeric budget directly                   | fail   | `2 failed \| 14 passed (16)` | rejection is not a DI Bag close cancellation                      |
| `t3c` | `t3` with the error-type check removed                                | pass   | `16 passed (16)`             | the type check alone rejects the bypass                           |
| `b1`  | `import 'node:util/types';` as the browser probe's first line         | fail   | `1 failed \| 2 passed (3)`   | AssertionError: expected [ 'node:util/types' ] to deeply equal [] |
| `b1c` | `b1`, with that assertion weakened to `toBeInstanceOf(Array)`         | pass   | `3 passed (3)`               | no other clause catches the fault                                 |
| `p1`  | `package.json` pins `"di-bag": "0.4.0"`                               | fail   | `19 pass`, `1 fail`          | error: expect(received).toEqual(expected)                         |
| `p1c` | `p1`, with the manifest assertion weakened to `toBeTypeOf('object')`  | pass   | `20 pass`, `0 fail`          | no other clause catches the fault                                 |

**The comments.** Written after all eight runs, as `//` lines directly above the named line, dated
with the observed date, naming the fault and the fact observed, and the twin's outcome:

| Id pair    | Comment above                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `t1`/`t1c` | `close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs }),` in `acquireTransactionally` |
| `t2`/`t2c` | `graph.close({ waitTimeoutMs: options.timeoutMs }),` inside `new PartialAcquisitionError(…)`         |
| `t3`/`t3c` | Both close sites, with the type guard in `budgetOfRefusedClose`                                      |
| `b1`/`b1c` | `expect((await theBundle()).externalizedForBrowser).toEqual([]);`, below the 2026-09-20 comment      |
| `p1`/`p1c` | `expect(pinned).toEqual({ ...OWNER_PACKAGES });`                                                     |

For example, as rehearsed:

```ts
// Proof: on <observed-date-t1>, handing DI Bag `options.timeoutMs + 1` here failed 'hands DI Bag the
// budget of a runtime’s own close' with `expected 26 to be 25`; with that assertion
// weakened to a type check the same fault passed the whole file.
```

#### Proof t1

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.ts b/apps/wbs/fe-01/src/runtime/application-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -74,1 +74,1 @@
-      close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs }),
+      close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs + 1 }),
```

#### Proof t1c

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.ts b/apps/wbs/fe-01/src/runtime/application-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -74,1 +74,1 @@
-      close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs }),
+      close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs + 1 }),
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.test.ts b/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
@@ -156,1 +156,1 @@
-    expect(await budgetOfRefusedClose(runtime.close({ timeoutMs: 25 }))).toBe(25);
+    expect(await budgetOfRefusedClose(runtime.close({ timeoutMs: 25 }))).toBeTypeOf('number');
```

#### Proof t2

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.ts b/apps/wbs/fe-01/src/runtime/application-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -82,1 +82,1 @@
-      graph.close({ waitTimeoutMs: options.timeoutMs }),
+      graph.close({ waitTimeoutMs: options.timeoutMs + 1 }),
```

#### Proof t2c

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.ts b/apps/wbs/fe-01/src/runtime/application-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -82,1 +82,1 @@
-      graph.close({ waitTimeoutMs: options.timeoutMs }),
+      graph.close({ waitTimeoutMs: options.timeoutMs + 1 }),
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.test.ts b/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
@@ -177,1 +177,1 @@
-    ).toBe(30);
+    ).toBeTypeOf('number');
```

#### Proof t3

The production bypass below rejects with the requested number without calling DI Bag at either
close site. Both budget tests must fail because the refusal is not a
`DiBagCloseCancelledError`.

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.ts b/apps/wbs/fe-01/src/runtime/application-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -74,1 +74,1 @@
-      close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs }),
+      close: (options) => Promise.reject(options.timeoutMs),
@@ -82,1 +82,1 @@
-      graph.close({ waitTimeoutMs: options.timeoutMs }),
+      Promise.reject(options.timeoutMs),
```

#### Proof t3c

The same bypass with the helper's error-type check removed must pass both tests, isolating
that check as the reason the negative fails.

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.ts b/apps/wbs/fe-01/src/runtime/application-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -74,1 +74,1 @@
-      close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs }),
+      close: (options) => Promise.reject(options.timeoutMs),
@@ -82,1 +82,1 @@
-      graph.close({ waitTimeoutMs: options.timeoutMs }),
+      Promise.reject(options.timeoutMs),
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.test.ts b/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.test.ts
@@ -88,1 +88,1 @@
-  if (!(refusal instanceof DiBagCloseCancelledError)) throw refusal;
+  if (!(refusal instanceof DiBagCloseCancelledError)) return Number(refusal);
```

#### Proof b1

```diff
diff --git a/apps/wbs/fe-01/e2e/browser-packages-probe.ts b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
--- a/apps/wbs/fe-01/e2e/browser-packages-probe.ts
+++ b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
@@ -0,0 +1,1 @@
+import 'node:util/types';
```

#### Proof b1c

```diff
diff --git a/apps/wbs/fe-01/e2e/browser-packages-probe.ts b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
--- a/apps/wbs/fe-01/e2e/browser-packages-probe.ts
+++ b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
@@ -0,0 +1,1 @@
+import 'node:util/types';
diff --git a/apps/wbs/fe-01/browser-packages.test.ts b/apps/wbs/fe-01/browser-packages.test.ts
--- a/apps/wbs/fe-01/browser-packages.test.ts
+++ b/apps/wbs/fe-01/browser-packages.test.ts
@@ -50,1 +50,1 @@
-      expect((await theBundle()).externalizedForBrowser).toEqual([]);
+      expect((await theBundle()).externalizedForBrowser).toBeInstanceOf(Array);
```

#### Proof p1

```diff
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -49,1 +49,1 @@
-    "di-bag": "0.5.0",
+    "di-bag": "0.4.0",
```

#### Proof p1c

```diff
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -49,1 +49,1 @@
-    "di-bag": "0.5.0",
+    "di-bag": "0.4.0",
diff --git a/tools/tool-devsync/src/toolchain-pins.test.ts b/tools/tool-devsync/src/toolchain-pins.test.ts
--- a/tools/tool-devsync/src/toolchain-pins.test.ts
+++ b/tools/tool-devsync/src/toolchain-pins.test.ts
@@ -528,1 +528,1 @@
-    expect(pinned).toEqual({ ...OWNER_PACKAGES });
+    expect(pinned).toBeTypeOf('object');
```

### 8.2 Slice 4 — the recorded example faults whose outcome the library decides

What is in, and why: the two sealing facts of every one of the 20 modules (`w-*`: a private key
exported; `l-*`: the label dropped), the same label fault against the label check for the 18 it reads
(`g-*`); the boot graph's disposal and edges (`bs1`–`bs6`, assigned to the planner); the preferences module's disposal and
resolution order (`pf1`, `pf2`); the transaction (`ar1`–`ar3`); the lifetime slot's reading of DI
Bag's close refusal (`ls1`–`ls3`); the label check's own two (`ml1`, `ml2`); the one compile negative
of a module fixture (`ts1`, `ts2`); the delivery rule that `di-bag` is a bag (`d9`); and the four owner
faults whose recorded cause is the library's disposal code (`j-o2`, `j-o4`, `i-o2`, `i-o3`). What is
out: the other `Proof:` comments in the same files, whose fault and assertion are both the
repository's own with no library call deciding the outcome (the installers' enumerated surfaces in
every `check.ts`, a module's service wiring, the owners' generation fences) — the green suites of
slice 2 carry them unchanged. Model sabotages are section 8.3's.

The 75 offline executor records for `$TMPDIR/proofs.txt`:

```text
w-auth
fail
bun
libs/wbs/application/core
src/module/authentication/module.test.ts
keeps its authOptions binding out of a host graph
l-auth
fail
bun
libs/wbs/application/core
src/module/authentication/module.test.ts
labels its private bindings with the module name
g-auth
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-brs
fail
bun
libs/wbs/application/core
src/module/bounded-replay-sweep/module.test.ts
keeps its private bindings out of a host graph
l-brs
fail
bun
libs/wbs/application/core
src/module/bounded-replay-sweep/module.test.ts
labels its private bindings with the module name
g-brs
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-cal
fail
bun
libs/wbs/application/core
src/module/calendar-marker/module.test.ts
keeps its private bindings out of a host graph
l-cal
fail
bun
libs/wbs/application/core
src/module/calendar-marker/module.test.ts
labels its private bindings with the module name
g-cal
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-cap
fail
bun
libs/wbs/application/core
src/module/capacity/module.test.ts
keeps its private bindings out of a host graph
l-cap
fail
bun
libs/wbs/application/core
src/module/capacity/module.test.ts
labels its private bindings with the module name
g-cap
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-dir
fail
bun
libs/wbs/application/core
src/module/directory/module.test.ts
keeps its private bindings out of a host graph
l-dir
fail
bun
libs/wbs/application/core
src/module/directory/module.test.ts
labels its private bindings with the module name
g-dir
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-pcm
fail
bun
libs/wbs/application/core
src/module/plan-commands/module.test.ts
keeps its private bindings out of a host graph
l-pcm
fail
bun
libs/wbs/application/core
src/module/plan-commands/module.test.ts
labels its private bindings with the module name
g-pcm
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-pdoc
fail
bun
libs/wbs/application/core
src/module/plan-document/module.test.ts
keeps its private bindings out of a host graph
l-pdoc
fail
bun
libs/wbs/application/core
src/module/plan-document/module.test.ts
labels its private bindings with the module name
g-pdoc
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-phist
fail
bun
libs/wbs/application/core
src/module/plan-history/module.test.ts
keeps its private bindings out of a host graph
l-phist
fail
bun
libs/wbs/application/core
src/module/plan-history/module.test.ts
labels its private bindings with the module name
g-phist
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-pimp
fail
bun
libs/wbs/application/core
src/module/plan-import/module.test.ts
keeps its private bindings out of a host graph
l-pimp
fail
bun
libs/wbs/application/core
src/module/plan-import/module.test.ts
labels its private bindings with the module name
g-pimp
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-pband
fail
bun
libs/wbs/application/core
src/module/priority-band/module.test.ts
keeps its private bindings out of a host graph
l-pband
fail
bun
libs/wbs/application/core
src/module/priority-band/module.test.ts
labels its private bindings with the module name
g-pband
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-proj
fail
bun
libs/wbs/application/core
src/module/project/module.test.ts
keeps its private bindings out of a host graph
l-proj
fail
bun
libs/wbs/application/core
src/module/project/module.test.ts
labels its private bindings with the module name
g-proj
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-rt
fail
bun
libs/wbs/application/core
src/module/realtime/module.test.ts
keeps its private bindings out of a host graph
l-rt
fail
bun
libs/wbs/application/core
src/module/realtime/module.test.ts
labels its private bindings with the module name
g-rt
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-saved
fail
bun
libs/wbs/application/core
src/module/saved-plans/module.test.ts
keeps its private bindings out of a host graph
l-saved
fail
bun
libs/wbs/application/core
src/module/saved-plans/module.test.ts
labels its private bindings with the module name
g-saved
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-step
fail
bun
libs/wbs/application/core
src/module/step/module.test.ts
keeps its private bindings out of a host graph
l-step
fail
bun
libs/wbs/application/core
src/module/step/module.test.ts
labels its private bindings with the module name
g-step
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-witem
fail
bun
libs/wbs/application/core
src/module/work-item/module.test.ts
keeps its private bindings out of a host graph
l-witem
fail
bun
libs/wbs/application/core
src/module/work-item/module.test.ts
labels its private bindings with the module name
g-witem
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-opt
fail
bun
apps/wbs/be-01
src/module/optimization/module.test.ts
keeps its private bindings out of a host graph
l-opt
fail
bun
apps/wbs/be-01
src/module/optimization/module.test.ts
labels its private bindings with the module name
g-opt
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-slaunch
fail
bun
apps/wbs/be-01
src/module/solver-launcher/module.test.ts
keeps its private bindings out of a host graph
l-slaunch
fail
bun
apps/wbs/be-01
src/module/solver-launcher/module.test.ts
labels its private bindings with the module name
g-slaunch
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-ssup
fail
bun
apps/wbs/be-01
src/module/solver-supervisor/module.test.ts
keeps its private bindings out of a host graph
l-ssup
fail
bun
apps/wbs/be-01
src/module/solver-supervisor/module.test.ts
labels its private bindings with the module name
g-ssup
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
w-dmgmt
fail
vitest
apps/wbs/fe-01
src/modules/directory-management/module.test.ts
keeps its directory resource out of a host graph
l-dmgmt
fail
vitest
apps/wbs/fe-01
src/modules/directory-management/module.test.ts
names itself when a host omits the client
w-prefs
fail
vitest
apps/wbs/fe-01
src/modules/preferences/module.test.ts
keeps its owned store out of a host graph
l-prefs
fail
vitest
apps/wbs/fe-01
src/modules/preferences/module.test.ts
labels its owned store with the module name
pf1
fail
vitest
apps/wbs/fe-01
src/modules/preferences/module.test.ts
gives the store back when its host graph closes
pf2
fail
vitest
apps/wbs/fe-01
src/modules/preferences/module.test.ts
names itself when a host omits the browser store
ar1
fail
vitest
apps/wbs/fe-01
src/runtime/application-runtime.test.ts
revokes the store it owns when the installation closes
ar2
fail
vitest
apps/wbs/fe-01
src/runtime/application-runtime.test.ts
releases everything a half-finished read acquired
ar3
fail
vitest
apps/wbs/fe-01
src/runtime/application-runtime.test.ts
releases everything a half-finished read acquired
ls1
fail
vitest
apps/wbs/fe-01
src/runtime/lifetime-slot.test.ts
fails the transition when the retirement outruns its budget, and keeps watching the disposal
ls2
fail
vitest
apps/wbs/fe-01
src/runtime/lifetime-slot.test.ts
observes a late disposal that finishes after the wait expired, without publishing anything
ls3
fail
vitest
apps/wbs/fe-01
src/runtime/lifetime-slot.test.ts
is terminal when the half-finished construction cannot be released
ml1
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
ml2
fail
bun-devsync
tools/tool-devsync
src/module-labels.test.ts
seals every module under the label its location implies
ts1
fail
tsc-core
.
-
module.test.ts(101,3): error TS2322: Type 'UserStore' is not assignable to type 'UserStore & OidcIdentityStore'.
ts2
fail
tsc-core
.
-
error TS2578: Unused '@ts-expect-error' directive.
d9
fail
vitest
apps/wbs/fe-01
src/delivery-boundaries.test.ts
refuses every route but the ones still owed
j-o2
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.test.ts
shows a retirement that fails as the fatal state, and refuses the next project
j-o4
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.test.ts
is terminal, and still settles, when a half-built runtime cannot be released
i-o2
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.test.ts
fails the session’s retirement when its project will not let go
i-o3
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.test.ts
settles a half-built session that cannot be released, and leaves the owner terminally fatal
```

Rehearsed on `709f4346b` (slice 3), 2026-09-25, every record `status=1` (`status=2` for `ts1`,
`ts2`), restored and `cmp`-identical:

| Id          | Fault                                                                                       | Named test                                                                                   | Whole file                   | Observed                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `w-auth`    | authentication: `'authOptions'` added to `exportedServiceKeys`                              | keeps its authOptions binding out of a host graph                                            | `7 pass`, `2 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"authOptions\" is not registered."                                                           |
| `l-auth`    | authentication: `moduleLabel` dropped                                                       | labels its private bindings with the module name                                             | `7 pass`, `2 fail`           | Expected to contain: "application.authentication/authOptions"                                                                                          |
| `g-auth`    | authentication: `moduleLabel` dropped, against the label check                              | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-brs`     | bounded-replay-sweep: `'retentionOptions'` added to `exportedServiceKeys`                   | keeps its private bindings out of a host graph                                               | `3 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"retentionOptions\" is not registered."                                                      |
| `l-brs`     | bounded-replay-sweep: `moduleLabel` dropped                                                 | labels its private bindings with the module name                                             | `4 pass`, `2 fail`           | Expected to contain: "application.bounded-replay-sweep/retentionOptions"                                                                               |
| `g-brs`     | bounded-replay-sweep: `moduleLabel` dropped, against the label check                        | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-cal`     | calendar-marker: `'calendarMarkerOptions'` added to `exportedServiceKeys`                   | keeps its private bindings out of a host graph                                               | `2 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"calendarMarkerOptions\" is not registered."                                                 |
| `l-cal`     | calendar-marker: `moduleLabel` dropped                                                      | labels its private bindings with the module name                                             | `3 pass`, `2 fail`           | Expected to contain: "application.calendar-marker/calendarMarkerOptions"                                                                               |
| `g-cal`     | calendar-marker: `moduleLabel` dropped, against the label check                             | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-cap`     | capacity: `'capacityOptions'` added to `exportedServiceKeys`                                | keeps its private bindings out of a host graph                                               | `2 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"capacityOptions\" is not registered."                                                       |
| `l-cap`     | capacity: `moduleLabel` dropped                                                             | labels its private bindings with the module name                                             | `3 pass`, `2 fail`           | Expected to contain: "application.capacity/capacityOptions"                                                                                            |
| `g-cap`     | capacity: `moduleLabel` dropped, against the label check                                    | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-dir`     | directory: `'directoryOptions'` added to `exportedServiceKeys`                              | keeps its private bindings out of a host graph                                               | `2 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"directoryOptions\" is not registered."                                                      |
| `l-dir`     | directory: `moduleLabel` dropped                                                            | labels its private bindings with the module name                                             | `3 pass`, `2 fail`           | Expected to contain: "application.directory/directoryOptions"                                                                                          |
| `g-dir`     | directory: `moduleLabel` dropped, against the label check                                   | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-pcm`     | plan-commands: `'planCommandOptions'` added to `exportedServiceKeys`                        | keeps its private bindings out of a host graph                                               | `3 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"planCommandOptions\" is not registered."                                                    |
| `l-pcm`     | plan-commands: `moduleLabel` dropped                                                        | labels its private bindings with the module name                                             | `4 pass`, `2 fail`           | Expected to contain: "application.plan-commands/planCommandOptions"                                                                                    |
| `g-pcm`     | plan-commands: `moduleLabel` dropped, against the label check                               | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-pdoc`    | plan-document: `'planDocumentOptions'` added to `exportedServiceKeys`                       | keeps its private bindings out of a host graph                                               | `2 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"planDocumentOptions\" is not registered."                                                   |
| `l-pdoc`    | plan-document: `moduleLabel` dropped                                                        | labels its private bindings with the module name                                             | `3 pass`, `2 fail`           | Expected to contain: "application.plan-document/planDocumentOptions"                                                                                   |
| `g-pdoc`    | plan-document: `moduleLabel` dropped, against the label check                               | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-phist`   | plan-history: `'historySettings'` added to `exportedServiceKeys`                            | keeps its private bindings out of a host graph                                               | `3 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"historySettings\" is not registered."                                                       |
| `l-phist`   | plan-history: `moduleLabel` dropped                                                         | labels its private bindings with the module name                                             | `4 pass`, `2 fail`           | Expected to contain: "application.plan-history/historySettings"                                                                                        |
| `g-phist`   | plan-history: `moduleLabel` dropped, against the label check                                | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-pimp`    | plan-import: `'importOptions'` added to `exportedServiceKeys`                               | keeps its private bindings out of a host graph                                               | `3 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"importOptions\" is not registered."                                                         |
| `l-pimp`    | plan-import: `moduleLabel` dropped                                                          | labels its private bindings with the module name                                             | `4 pass`, `2 fail`           | Expected to contain: "application.plan-import/importOptions"                                                                                           |
| `g-pimp`    | plan-import: `moduleLabel` dropped, against the label check                                 | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-pband`   | priority-band: `'priorityBandOptions'` added to `exportedServiceKeys`                       | keeps its private bindings out of a host graph                                               | `2 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"priorityBandOptions\" is not registered."                                                   |
| `l-pband`   | priority-band: `moduleLabel` dropped                                                        | labels its private bindings with the module name                                             | `3 pass`, `2 fail`           | Expected to contain: "application.priority-band/priorityBandOptions"                                                                                   |
| `g-pband`   | priority-band: `moduleLabel` dropped, against the label check                               | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-proj`    | project: `'projectOptions'` added to `exportedServiceKeys`                                  | keeps its private bindings out of a host graph                                               | `2 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"projectOptions\" is not registered."                                                        |
| `l-proj`    | project: `moduleLabel` dropped                                                              | labels its private bindings with the module name                                             | `3 pass`, `2 fail`           | Expected to contain: "application.project/projectOptions"                                                                                              |
| `g-proj`    | project: `moduleLabel` dropped, against the label check                                     | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-rt`      | realtime: `'broadcasterOptions'` added to `exportedServiceKeys`                             | keeps its private bindings out of a host graph                                               | `3 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"broadcasterOptions\" is not registered."                                                    |
| `l-rt`      | realtime: `moduleLabel` dropped                                                             | labels its private bindings with the module name                                             | `4 pass`, `2 fail`           | Expected to contain: "application.realtime/broadcasterOptions"                                                                                         |
| `g-rt`      | realtime: `moduleLabel` dropped, against the label check                                    | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-saved`   | saved-plans: `'savedPlanOptions'` added to `exportedServiceKeys`                            | keeps its private bindings out of a host graph                                               | `4 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"savedPlanOptions\" is not registered."                                                      |
| `l-saved`   | saved-plans: `moduleLabel` dropped                                                          | labels its private bindings with the module name                                             | `5 pass`, `2 fail`           | Expected to contain: "application.saved-plans/savedPlanOptions"                                                                                        |
| `g-saved`   | saved-plans: `moduleLabel` dropped, against the label check                                 | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-step`    | step: `'stepOptions'` added to `exportedServiceKeys`                                        | keeps its private bindings out of a host graph                                               | `2 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"stepOptions\" is not registered."                                                           |
| `l-step`    | step: `moduleLabel` dropped                                                                 | labels its private bindings with the module name                                             | `3 pass`, `2 fail`           | Expected to contain: "application.step/stepOptions"                                                                                                    |
| `g-step`    | step: `moduleLabel` dropped, against the label check                                        | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-witem`   | work-item: `'workItemOptions'` added to `exportedServiceKeys`                               | keeps its private bindings out of a host graph                                               | `2 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"workItemOptions\" is not registered."                                                       |
| `l-witem`   | work-item: `moduleLabel` dropped                                                            | labels its private bindings with the module name                                             | `3 pass`, `2 fail`           | Expected to contain: "application.work-item/workItemOptions"                                                                                           |
| `g-witem`   | work-item: `moduleLabel` dropped, against the label check                                   | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-opt`     | optimization: `'optimizationOptions'` added to `exportedServiceKeys`                        | keeps its private bindings out of a host graph                                               | `4 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"optimizationOptions\" is not registered."                                                   |
| `l-opt`     | optimization: `moduleLabel` dropped                                                         | labels its private bindings with the module name                                             | `5 pass`, `2 fail`           | Expected to contain: "backend.optimization/optimizationOptions"                                                                                        |
| `g-opt`     | optimization: `moduleLabel` dropped, against the label check                                | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-slaunch` | solver-launcher: `'launcherSeams'` added to `exportedServiceKeys`                           | keeps its private bindings out of a host graph                                               | `4 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"launcherSeams\" is not registered."                                                         |
| `l-slaunch` | solver-launcher: `moduleLabel` dropped                                                      | labels its private bindings with the module name                                             | `5 pass`, `2 fail`           | Expected to contain: "backend.solver-launcher/launcherSeams"                                                                                           |
| `g-slaunch` | solver-launcher: `moduleLabel` dropped, against the label check                             | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-ssup`    | solver-supervisor: `'supervisorOptions'` added to `exportedServiceKeys`                     | keeps its private bindings out of a host graph                                               | `2 pass`, `3 fail`           | Expected substring: "DI_BAG_UNKNOWN_SERVICE_KEY: Service \"supervisorOptions\" is not registered."                                                     |
| `l-ssup`    | solver-supervisor: `moduleLabel` dropped                                                    | labels its private bindings with the module name                                             | `3 pass`, `2 fail`           | Expected to contain: "backend.solver-supervisor/supervisorOptions"                                                                                     |
| `g-ssup`    | solver-supervisor: `moduleLabel` dropped, against the label check                           | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `w-dmgmt`   | directory-management: `'directory'` added to `exportedServiceKeys`                          | keeps its directory resource out of a host graph                                             | `2 failed \| 3 passed (5)`   | AssertionError: expected [Function] to throw an error                                                                                                  |
| `l-dmgmt`   | directory-management: `moduleLabel` dropped                                                 | names itself when a host omits the client                                                    | `1 failed \| 4 passed (5)`   | AssertionError: expected [Function] to throw error including 'Cannot resolve "frontend.directory-ma…' but got 'DI_BAG_MISSING_DEPENDENCY: Cannot res…' |
| `w-prefs`   | preferences: `'preferencesStore'` added to `exportedServiceKeys`                            | keeps its owned store out of a host graph                                                    | `4 failed \| 4 passed (8)`   | AssertionError: expected [Function] to throw an error                                                                                                  |
| `l-prefs`   | preferences: `moduleLabel` dropped                                                          | labels its owned store with the module name                                                  | `2 failed \| 6 passed (8)`   | AssertionError: expected [ 'preferences', 'remembered', …(3) ] to include 'frontend.preferences/preferencesStore'                                      |
| `bs1`       | `boot.ts`: the source's `disposeService` → `() => Promise.resolve()`                        | releases the source when the port it was given is already taken                              | `18 pass`, `7 fail`          | Expected: 1                                                                                                                                            |
| `bs2`       | `boot.ts`: the source's disposer swallows its refusal (`.catch(() => undefined)`)           | refuses to report a clean stop when a release is refused                                     | `24 pass`, `1 fail`          | error: expect(received).toBeInstanceOf(expected)                                                                                                       |
| `bs3`       | `boot.ts`: the retention timer's `disposeService` → `() => Promise.resolve()`               | refuses to report a clean stop when a release is refused                                     | `20 pass`, `5 fail`          | Expected: false                                                                                                                                        |
| `bs4`       | `boot.ts`: the server factory's `retention: _retention,` edge deleted                       | starts the retention timer                                                                   | `24 pass`, `1 fail`          | Expected: true                                                                                                                                         |
| `bs5`       | `boot.ts`: the pushed disposer before `listen` deleted                                      | releases the source and the port when a step after the listener fails                        | `24 pass`, `1 fail`          | Expected: true                                                                                                                                         |
| `bs6`       | `boot.ts`: the server's `await app.stop();` → `await Promise.resolve(app);`                 | stops accepting before it closes the source it opened                                        | `24 pass`, `1 fail`          | Expected: true                                                                                                                                         |
| `pf1`       | `preferences/module.ts`: `disposeService: () => undefined` (store never revoked)            | gives the store back when its host graph closes                                              | `1 failed \| 7 passed (8)`   | AssertionError: expected [Function] to throw an error                                                                                                  |
| `pf2`       | `preferences/module.ts`: `isLive` destructured before `preferencesStore`                    | names itself when a host omits the browser store                                             | `1 failed \| 7 passed (8)`   | AssertionError: expected [Function] to throw error including 'Cannot resolve "frontend.preferences/…' but got 'DI_BAG_MISSING_DEPENDENCY: Cannot res…' |
| `ar1`       | `acquireTransactionally`: `close: () => Promise.resolve()`                                  | revokes the store it owns when the installation closes                                       | `5 failed \| 11 passed (16)` | AssertionError: expected [Function] to throw an error                                                                                                  |
| `ar2`       | `acquireTransactionally`: the failure rethrown unwrapped                                    | releases everything a half-finished read acquired                                            | `5 failed \| 11 passed (16)` | AssertionError: expected Error: alice@example.com could not be com… to be an instance of PartialAcquisitionError                                       |
| `ar3`       | `acquireTransactionally`: the partial release → `Promise.resolve()`                         | releases everything a half-finished read acquired                                            | `2 failed \| 14 passed (16)` | AssertionError: expected [] to deeply equal [ 'first' ]                                                                                                |
| `ls1`       | `lifetime-slot.ts`'s `lateCleanupOf` returns `null`                                         | fails the transition when the retirement outruns its budget, and keeps watching the disposal | `4 failed \| 20 passed (24)` | AssertionError: expected null to be an instance of Promise                                                                                             |
| `ls2`       | `lifetime-slot.ts`: the late disposal's settled branch observes nothing                     | observes a late disposal that finishes after the wait expired, without publishing anything   | `2 failed \| 22 passed (24)` | AssertionError: expected 'pending' to be 'settled'                                                                                                     |
| `ls3`       | `lifetime-slot.ts`: the release refusal swallowed (`void releaseRefusal;`)                  | is terminal when the half-finished construction cannot be released                           | `2 failed \| 22 passed (24)` | AssertionError: expected [Function] to throw error including 'DI_BAG_DISPOSAL_FAILED' but got 'the lifetime could not be built, and …'                 |
| `ml1`       | Capacity's `module.ts` also exports `decoy`                                                 | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: libs/wbs/application/core/src/module/capacity/module.ts exports 2 values, expected 1                                                            |
| `ml2`       | the label check reads no binding as private (`serviceKeys.length < 0`)                      | seals every module under the label its location implies                                      | `4 pass`, `1 fail`           | error: expect(received).toEqual(expected)                                                                                                              |
| `ts1`       | the `@ts-expect-error` above `users: userStoreOnly()` deleted                               |                                                                                              | tsc exit 2                   | `module.test.ts(101,3): error TS2322: Type 'UserStore' is not assignable to type 'UserStore & OidcIdentityStore'.`                                     |
| `ts2`       | `AuthenticationRequirements['account']['users']` loses its `OidcIdentityStore` intersection |                                                                                              | tsc exit 2                   | `error TS2578: Unused '@ts-expect-error' directive.`                                                                                                   |
| `d9`        | `page-nav.tsx` imports `DiBag` from `di-bag` and exports `createBuilder`                    | refuses every route but the ones still owed                                                  | `1 failed (1)`               | AssertionError: expected [ …(24) ] to deeply equal [ …(21) ]                                                                                           |
| `j-o2`      | `project-runtime.ts`: the refused close no longer recorded                                  | shows a retirement that fails as the fatal state, and refuses the next project               | `2 failed \| 5 passed (7)`   | AssertionError: promise rejected "Error: a project transition was refused b…" instead of resolving                                                     |
| `j-o4`      | `project-runtime.ts`: the half-built failure rethrown unwrapped                             | is terminal, and still settles, when a half-built runtime cannot be released                 | `1 failed \| 6 passed (7)`   | AssertionError: promise rejected "Error: a project transition was refused b…" instead of resolving                                                     |
| `i-o2`      | `session-runtime.ts`: the refused close no longer recorded                                  | fails the session’s retirement when its project will not let go                              | `3 failed \| 8 passed (11)`  | AssertionError: promise rejected "Error: a session transition was refused b…" instead of resolving                                                     |
| `i-o3`      | `session-runtime.ts`: the half-built failure rethrown unwrapped                             | settles a half-built session that cannot be released, and leaves the owner terminally fatal  | `1 failed \| 10 passed (11)` | AssertionError: promise rejected "Error: a session transition was refused b…" instead of resolving                                                     |

#### Proof w-auth

```diff
diff --git a/libs/wbs/application/core/src/module/authentication/module.ts b/libs/wbs/application/core/src/module/authentication/module.ts
--- a/libs/wbs/application/core/src/module/authentication/module.ts
+++ b/libs/wbs/application/core/src/module/authentication/module.ts
@@ -72,1 +72,1 @@
-    exportedServiceKeys: ['auth', 'loginThrottle'],
+    exportedServiceKeys: ['auth', 'loginThrottle', 'authOptions'],
```

#### Proof l-auth

```diff
diff --git a/libs/wbs/application/core/src/module/authentication/module.ts b/libs/wbs/application/core/src/module/authentication/module.ts
--- a/libs/wbs/application/core/src/module/authentication/module.ts
+++ b/libs/wbs/application/core/src/module/authentication/module.ts
@@ -73,1 +72,0 @@
-    moduleLabel: AUTHENTICATION_LABEL,
```

#### Proof g-auth

```diff
diff --git a/libs/wbs/application/core/src/module/authentication/module.ts b/libs/wbs/application/core/src/module/authentication/module.ts
--- a/libs/wbs/application/core/src/module/authentication/module.ts
+++ b/libs/wbs/application/core/src/module/authentication/module.ts
@@ -73,1 +72,0 @@
-    moduleLabel: AUTHENTICATION_LABEL,
```

#### Proof w-brs

```diff
diff --git a/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts b/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
--- a/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
+++ b/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
@@ -82,1 +82,1 @@
-  .buildModule({ exportedServiceKeys: ['retention'], moduleLabel: BOUNDED_REPLAY_SWEEP_LABEL });
+  .buildModule({ exportedServiceKeys: ['retention', 'retentionOptions'], moduleLabel: BOUNDED_REPLAY_SWEEP_LABEL });
```

#### Proof l-brs

```diff
diff --git a/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts b/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
--- a/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
+++ b/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
@@ -82,1 +82,1 @@
-  .buildModule({ exportedServiceKeys: ['retention'], moduleLabel: BOUNDED_REPLAY_SWEEP_LABEL });
+  .buildModule({ exportedServiceKeys: ['retention'] });
```

#### Proof g-brs

```diff
diff --git a/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts b/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
--- a/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
+++ b/libs/wbs/application/core/src/module/bounded-replay-sweep/module.ts
@@ -82,1 +82,1 @@
-  .buildModule({ exportedServiceKeys: ['retention'], moduleLabel: BOUNDED_REPLAY_SWEEP_LABEL });
+  .buildModule({ exportedServiceKeys: ['retention'] });
```

#### Proof w-cal

```diff
diff --git a/libs/wbs/application/core/src/module/calendar-marker/module.ts b/libs/wbs/application/core/src/module/calendar-marker/module.ts
--- a/libs/wbs/application/core/src/module/calendar-marker/module.ts
+++ b/libs/wbs/application/core/src/module/calendar-marker/module.ts
@@ -72,1 +72,1 @@
-  .buildModule({ exportedServiceKeys: ['calendarMarkers'], moduleLabel: CALENDAR_MARKER_LABEL });
+  .buildModule({ exportedServiceKeys: ['calendarMarkers', 'calendarMarkerOptions'], moduleLabel: CALENDAR_MARKER_LABEL });
```

#### Proof l-cal

```diff
diff --git a/libs/wbs/application/core/src/module/calendar-marker/module.ts b/libs/wbs/application/core/src/module/calendar-marker/module.ts
--- a/libs/wbs/application/core/src/module/calendar-marker/module.ts
+++ b/libs/wbs/application/core/src/module/calendar-marker/module.ts
@@ -72,1 +72,1 @@
-  .buildModule({ exportedServiceKeys: ['calendarMarkers'], moduleLabel: CALENDAR_MARKER_LABEL });
+  .buildModule({ exportedServiceKeys: ['calendarMarkers'] });
```

#### Proof g-cal

```diff
diff --git a/libs/wbs/application/core/src/module/calendar-marker/module.ts b/libs/wbs/application/core/src/module/calendar-marker/module.ts
--- a/libs/wbs/application/core/src/module/calendar-marker/module.ts
+++ b/libs/wbs/application/core/src/module/calendar-marker/module.ts
@@ -72,1 +72,1 @@
-  .buildModule({ exportedServiceKeys: ['calendarMarkers'], moduleLabel: CALENDAR_MARKER_LABEL });
+  .buildModule({ exportedServiceKeys: ['calendarMarkers'] });
```

#### Proof w-cap

```diff
diff --git a/libs/wbs/application/core/src/module/capacity/module.ts b/libs/wbs/application/core/src/module/capacity/module.ts
--- a/libs/wbs/application/core/src/module/capacity/module.ts
+++ b/libs/wbs/application/core/src/module/capacity/module.ts
@@ -65,1 +65,1 @@
-  .buildModule({ exportedServiceKeys: ['capacity'], moduleLabel: CAPACITY_LABEL });
+  .buildModule({ exportedServiceKeys: ['capacity', 'capacityOptions'], moduleLabel: CAPACITY_LABEL });
```

#### Proof l-cap

```diff
diff --git a/libs/wbs/application/core/src/module/capacity/module.ts b/libs/wbs/application/core/src/module/capacity/module.ts
--- a/libs/wbs/application/core/src/module/capacity/module.ts
+++ b/libs/wbs/application/core/src/module/capacity/module.ts
@@ -65,1 +65,1 @@
-  .buildModule({ exportedServiceKeys: ['capacity'], moduleLabel: CAPACITY_LABEL });
+  .buildModule({ exportedServiceKeys: ['capacity'] });
```

#### Proof g-cap

```diff
diff --git a/libs/wbs/application/core/src/module/capacity/module.ts b/libs/wbs/application/core/src/module/capacity/module.ts
--- a/libs/wbs/application/core/src/module/capacity/module.ts
+++ b/libs/wbs/application/core/src/module/capacity/module.ts
@@ -65,1 +65,1 @@
-  .buildModule({ exportedServiceKeys: ['capacity'], moduleLabel: CAPACITY_LABEL });
+  .buildModule({ exportedServiceKeys: ['capacity'] });
```

#### Proof w-dir

```diff
diff --git a/libs/wbs/application/core/src/module/directory/module.ts b/libs/wbs/application/core/src/module/directory/module.ts
--- a/libs/wbs/application/core/src/module/directory/module.ts
+++ b/libs/wbs/application/core/src/module/directory/module.ts
@@ -55,1 +55,1 @@
-  .buildModule({ exportedServiceKeys: ['directory'], moduleLabel: DIRECTORY_LABEL });
+  .buildModule({ exportedServiceKeys: ['directory', 'directoryOptions'], moduleLabel: DIRECTORY_LABEL });
```

#### Proof l-dir

```diff
diff --git a/libs/wbs/application/core/src/module/directory/module.ts b/libs/wbs/application/core/src/module/directory/module.ts
--- a/libs/wbs/application/core/src/module/directory/module.ts
+++ b/libs/wbs/application/core/src/module/directory/module.ts
@@ -55,1 +55,1 @@
-  .buildModule({ exportedServiceKeys: ['directory'], moduleLabel: DIRECTORY_LABEL });
+  .buildModule({ exportedServiceKeys: ['directory'] });
```

#### Proof g-dir

```diff
diff --git a/libs/wbs/application/core/src/module/directory/module.ts b/libs/wbs/application/core/src/module/directory/module.ts
--- a/libs/wbs/application/core/src/module/directory/module.ts
+++ b/libs/wbs/application/core/src/module/directory/module.ts
@@ -55,1 +55,1 @@
-  .buildModule({ exportedServiceKeys: ['directory'], moduleLabel: DIRECTORY_LABEL });
+  .buildModule({ exportedServiceKeys: ['directory'] });
```

#### Proof w-pcm

```diff
diff --git a/libs/wbs/application/core/src/module/plan-commands/module.ts b/libs/wbs/application/core/src/module/plan-commands/module.ts
--- a/libs/wbs/application/core/src/module/plan-commands/module.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/module.ts
@@ -74,1 +74,1 @@
-  .buildModule({ exportedServiceKeys: ['commands'], moduleLabel: PLAN_COMMANDS_LABEL });
+  .buildModule({ exportedServiceKeys: ['commands', 'planCommandOptions'], moduleLabel: PLAN_COMMANDS_LABEL });
```

#### Proof l-pcm

```diff
diff --git a/libs/wbs/application/core/src/module/plan-commands/module.ts b/libs/wbs/application/core/src/module/plan-commands/module.ts
--- a/libs/wbs/application/core/src/module/plan-commands/module.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/module.ts
@@ -74,1 +74,1 @@
-  .buildModule({ exportedServiceKeys: ['commands'], moduleLabel: PLAN_COMMANDS_LABEL });
+  .buildModule({ exportedServiceKeys: ['commands'] });
```

#### Proof g-pcm

```diff
diff --git a/libs/wbs/application/core/src/module/plan-commands/module.ts b/libs/wbs/application/core/src/module/plan-commands/module.ts
--- a/libs/wbs/application/core/src/module/plan-commands/module.ts
+++ b/libs/wbs/application/core/src/module/plan-commands/module.ts
@@ -74,1 +74,1 @@
-  .buildModule({ exportedServiceKeys: ['commands'], moduleLabel: PLAN_COMMANDS_LABEL });
+  .buildModule({ exportedServiceKeys: ['commands'] });
```

#### Proof w-pdoc

```diff
diff --git a/libs/wbs/application/core/src/module/plan-document/module.ts b/libs/wbs/application/core/src/module/plan-document/module.ts
--- a/libs/wbs/application/core/src/module/plan-document/module.ts
+++ b/libs/wbs/application/core/src/module/plan-document/module.ts
@@ -56,1 +56,1 @@
-  .buildModule({ exportedServiceKeys: ['planDocuments'], moduleLabel: PLAN_DOCUMENT_LABEL });
+  .buildModule({ exportedServiceKeys: ['planDocuments', 'planDocumentOptions'], moduleLabel: PLAN_DOCUMENT_LABEL });
```

#### Proof l-pdoc

```diff
diff --git a/libs/wbs/application/core/src/module/plan-document/module.ts b/libs/wbs/application/core/src/module/plan-document/module.ts
--- a/libs/wbs/application/core/src/module/plan-document/module.ts
+++ b/libs/wbs/application/core/src/module/plan-document/module.ts
@@ -56,1 +56,1 @@
-  .buildModule({ exportedServiceKeys: ['planDocuments'], moduleLabel: PLAN_DOCUMENT_LABEL });
+  .buildModule({ exportedServiceKeys: ['planDocuments'] });
```

#### Proof g-pdoc

```diff
diff --git a/libs/wbs/application/core/src/module/plan-document/module.ts b/libs/wbs/application/core/src/module/plan-document/module.ts
--- a/libs/wbs/application/core/src/module/plan-document/module.ts
+++ b/libs/wbs/application/core/src/module/plan-document/module.ts
@@ -56,1 +56,1 @@
-  .buildModule({ exportedServiceKeys: ['planDocuments'], moduleLabel: PLAN_DOCUMENT_LABEL });
+  .buildModule({ exportedServiceKeys: ['planDocuments'] });
```

#### Proof w-phist

```diff
diff --git a/libs/wbs/application/core/src/module/plan-history/module.ts b/libs/wbs/application/core/src/module/plan-history/module.ts
--- a/libs/wbs/application/core/src/module/plan-history/module.ts
+++ b/libs/wbs/application/core/src/module/plan-history/module.ts
@@ -46,1 +46,1 @@
-  .buildModule({ exportedServiceKeys: ['history'], moduleLabel: PLAN_HISTORY_LABEL });
+  .buildModule({ exportedServiceKeys: ['history', 'historySettings'], moduleLabel: PLAN_HISTORY_LABEL });
```

#### Proof l-phist

```diff
diff --git a/libs/wbs/application/core/src/module/plan-history/module.ts b/libs/wbs/application/core/src/module/plan-history/module.ts
--- a/libs/wbs/application/core/src/module/plan-history/module.ts
+++ b/libs/wbs/application/core/src/module/plan-history/module.ts
@@ -46,1 +46,1 @@
-  .buildModule({ exportedServiceKeys: ['history'], moduleLabel: PLAN_HISTORY_LABEL });
+  .buildModule({ exportedServiceKeys: ['history'] });
```

#### Proof g-phist

```diff
diff --git a/libs/wbs/application/core/src/module/plan-history/module.ts b/libs/wbs/application/core/src/module/plan-history/module.ts
--- a/libs/wbs/application/core/src/module/plan-history/module.ts
+++ b/libs/wbs/application/core/src/module/plan-history/module.ts
@@ -46,1 +46,1 @@
-  .buildModule({ exportedServiceKeys: ['history'], moduleLabel: PLAN_HISTORY_LABEL });
+  .buildModule({ exportedServiceKeys: ['history'] });
```

#### Proof w-pimp

```diff
diff --git a/libs/wbs/application/core/src/module/plan-import/module.ts b/libs/wbs/application/core/src/module/plan-import/module.ts
--- a/libs/wbs/application/core/src/module/plan-import/module.ts
+++ b/libs/wbs/application/core/src/module/plan-import/module.ts
@@ -58,1 +58,1 @@
-  .buildModule({ exportedServiceKeys: ['imports'], moduleLabel: PLAN_IMPORT_LABEL });
+  .buildModule({ exportedServiceKeys: ['imports', 'importOptions'], moduleLabel: PLAN_IMPORT_LABEL });
```

#### Proof l-pimp

```diff
diff --git a/libs/wbs/application/core/src/module/plan-import/module.ts b/libs/wbs/application/core/src/module/plan-import/module.ts
--- a/libs/wbs/application/core/src/module/plan-import/module.ts
+++ b/libs/wbs/application/core/src/module/plan-import/module.ts
@@ -58,1 +58,1 @@
-  .buildModule({ exportedServiceKeys: ['imports'], moduleLabel: PLAN_IMPORT_LABEL });
+  .buildModule({ exportedServiceKeys: ['imports'] });
```

#### Proof g-pimp

```diff
diff --git a/libs/wbs/application/core/src/module/plan-import/module.ts b/libs/wbs/application/core/src/module/plan-import/module.ts
--- a/libs/wbs/application/core/src/module/plan-import/module.ts
+++ b/libs/wbs/application/core/src/module/plan-import/module.ts
@@ -58,1 +58,1 @@
-  .buildModule({ exportedServiceKeys: ['imports'], moduleLabel: PLAN_IMPORT_LABEL });
+  .buildModule({ exportedServiceKeys: ['imports'] });
```

#### Proof w-pband

```diff
diff --git a/libs/wbs/application/core/src/module/priority-band/module.ts b/libs/wbs/application/core/src/module/priority-band/module.ts
--- a/libs/wbs/application/core/src/module/priority-band/module.ts
+++ b/libs/wbs/application/core/src/module/priority-band/module.ts
@@ -68,1 +68,1 @@
-  .buildModule({ exportedServiceKeys: ['priorityBands'], moduleLabel: PRIORITY_BAND_LABEL });
+  .buildModule({ exportedServiceKeys: ['priorityBands', 'priorityBandOptions'], moduleLabel: PRIORITY_BAND_LABEL });
```

#### Proof l-pband

```diff
diff --git a/libs/wbs/application/core/src/module/priority-band/module.ts b/libs/wbs/application/core/src/module/priority-band/module.ts
--- a/libs/wbs/application/core/src/module/priority-band/module.ts
+++ b/libs/wbs/application/core/src/module/priority-band/module.ts
@@ -68,1 +68,1 @@
-  .buildModule({ exportedServiceKeys: ['priorityBands'], moduleLabel: PRIORITY_BAND_LABEL });
+  .buildModule({ exportedServiceKeys: ['priorityBands'] });
```

#### Proof g-pband

```diff
diff --git a/libs/wbs/application/core/src/module/priority-band/module.ts b/libs/wbs/application/core/src/module/priority-band/module.ts
--- a/libs/wbs/application/core/src/module/priority-band/module.ts
+++ b/libs/wbs/application/core/src/module/priority-band/module.ts
@@ -68,1 +68,1 @@
-  .buildModule({ exportedServiceKeys: ['priorityBands'], moduleLabel: PRIORITY_BAND_LABEL });
+  .buildModule({ exportedServiceKeys: ['priorityBands'] });
```

#### Proof w-proj

```diff
diff --git a/libs/wbs/application/core/src/module/project/module.ts b/libs/wbs/application/core/src/module/project/module.ts
--- a/libs/wbs/application/core/src/module/project/module.ts
+++ b/libs/wbs/application/core/src/module/project/module.ts
@@ -67,1 +67,1 @@
-  .buildModule({ exportedServiceKeys: ['projects'], moduleLabel: PROJECT_LABEL });
+  .buildModule({ exportedServiceKeys: ['projects', 'projectOptions'], moduleLabel: PROJECT_LABEL });
```

#### Proof l-proj

```diff
diff --git a/libs/wbs/application/core/src/module/project/module.ts b/libs/wbs/application/core/src/module/project/module.ts
--- a/libs/wbs/application/core/src/module/project/module.ts
+++ b/libs/wbs/application/core/src/module/project/module.ts
@@ -67,1 +67,1 @@
-  .buildModule({ exportedServiceKeys: ['projects'], moduleLabel: PROJECT_LABEL });
+  .buildModule({ exportedServiceKeys: ['projects'] });
```

#### Proof g-proj

```diff
diff --git a/libs/wbs/application/core/src/module/project/module.ts b/libs/wbs/application/core/src/module/project/module.ts
--- a/libs/wbs/application/core/src/module/project/module.ts
+++ b/libs/wbs/application/core/src/module/project/module.ts
@@ -67,1 +67,1 @@
-  .buildModule({ exportedServiceKeys: ['projects'], moduleLabel: PROJECT_LABEL });
+  .buildModule({ exportedServiceKeys: ['projects'] });
```

#### Proof w-rt

```diff
diff --git a/libs/wbs/application/core/src/module/realtime/module.ts b/libs/wbs/application/core/src/module/realtime/module.ts
--- a/libs/wbs/application/core/src/module/realtime/module.ts
+++ b/libs/wbs/application/core/src/module/realtime/module.ts
@@ -114,1 +114,1 @@
-    exportedServiceKeys: ['replayBuffer', 'broadcaster', 'replay'],
+    exportedServiceKeys: ['replayBuffer', 'broadcaster', 'replay', 'broadcasterOptions'],
```

#### Proof l-rt

```diff
diff --git a/libs/wbs/application/core/src/module/realtime/module.ts b/libs/wbs/application/core/src/module/realtime/module.ts
--- a/libs/wbs/application/core/src/module/realtime/module.ts
+++ b/libs/wbs/application/core/src/module/realtime/module.ts
@@ -115,1 +114,0 @@
-    moduleLabel: REALTIME_LABEL,
```

#### Proof g-rt

```diff
diff --git a/libs/wbs/application/core/src/module/realtime/module.ts b/libs/wbs/application/core/src/module/realtime/module.ts
--- a/libs/wbs/application/core/src/module/realtime/module.ts
+++ b/libs/wbs/application/core/src/module/realtime/module.ts
@@ -115,1 +114,0 @@
-    moduleLabel: REALTIME_LABEL,
```

#### Proof w-saved

```diff
diff --git a/libs/wbs/application/core/src/module/saved-plans/module.ts b/libs/wbs/application/core/src/module/saved-plans/module.ts
--- a/libs/wbs/application/core/src/module/saved-plans/module.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/module.ts
@@ -74,1 +74,1 @@
-  .buildModule({ exportedServiceKeys: ['savedPlans'], moduleLabel: SAVED_PLANS_LABEL });
+  .buildModule({ exportedServiceKeys: ['savedPlans', 'savedPlanOptions'], moduleLabel: SAVED_PLANS_LABEL });
```

#### Proof l-saved

```diff
diff --git a/libs/wbs/application/core/src/module/saved-plans/module.ts b/libs/wbs/application/core/src/module/saved-plans/module.ts
--- a/libs/wbs/application/core/src/module/saved-plans/module.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/module.ts
@@ -74,1 +74,1 @@
-  .buildModule({ exportedServiceKeys: ['savedPlans'], moduleLabel: SAVED_PLANS_LABEL });
+  .buildModule({ exportedServiceKeys: ['savedPlans'] });
```

#### Proof g-saved

```diff
diff --git a/libs/wbs/application/core/src/module/saved-plans/module.ts b/libs/wbs/application/core/src/module/saved-plans/module.ts
--- a/libs/wbs/application/core/src/module/saved-plans/module.ts
+++ b/libs/wbs/application/core/src/module/saved-plans/module.ts
@@ -74,1 +74,1 @@
-  .buildModule({ exportedServiceKeys: ['savedPlans'], moduleLabel: SAVED_PLANS_LABEL });
+  .buildModule({ exportedServiceKeys: ['savedPlans'] });
```

#### Proof w-step

```diff
diff --git a/libs/wbs/application/core/src/module/step/module.ts b/libs/wbs/application/core/src/module/step/module.ts
--- a/libs/wbs/application/core/src/module/step/module.ts
+++ b/libs/wbs/application/core/src/module/step/module.ts
@@ -64,1 +64,1 @@
-  .buildModule({ exportedServiceKeys: ['steps'], moduleLabel: STEP_LABEL });
+  .buildModule({ exportedServiceKeys: ['steps', 'stepOptions'], moduleLabel: STEP_LABEL });
```

#### Proof l-step

```diff
diff --git a/libs/wbs/application/core/src/module/step/module.ts b/libs/wbs/application/core/src/module/step/module.ts
--- a/libs/wbs/application/core/src/module/step/module.ts
+++ b/libs/wbs/application/core/src/module/step/module.ts
@@ -64,1 +64,1 @@
-  .buildModule({ exportedServiceKeys: ['steps'], moduleLabel: STEP_LABEL });
+  .buildModule({ exportedServiceKeys: ['steps'] });
```

#### Proof g-step

```diff
diff --git a/libs/wbs/application/core/src/module/step/module.ts b/libs/wbs/application/core/src/module/step/module.ts
--- a/libs/wbs/application/core/src/module/step/module.ts
+++ b/libs/wbs/application/core/src/module/step/module.ts
@@ -64,1 +64,1 @@
-  .buildModule({ exportedServiceKeys: ['steps'], moduleLabel: STEP_LABEL });
+  .buildModule({ exportedServiceKeys: ['steps'] });
```

#### Proof w-witem

```diff
diff --git a/libs/wbs/application/core/src/module/work-item/module.ts b/libs/wbs/application/core/src/module/work-item/module.ts
--- a/libs/wbs/application/core/src/module/work-item/module.ts
+++ b/libs/wbs/application/core/src/module/work-item/module.ts
@@ -111,1 +111,1 @@
-  .buildModule({ exportedServiceKeys: ['workItems'], moduleLabel: WORK_ITEM_LABEL });
+  .buildModule({ exportedServiceKeys: ['workItems', 'workItemOptions'], moduleLabel: WORK_ITEM_LABEL });
```

#### Proof l-witem

```diff
diff --git a/libs/wbs/application/core/src/module/work-item/module.ts b/libs/wbs/application/core/src/module/work-item/module.ts
--- a/libs/wbs/application/core/src/module/work-item/module.ts
+++ b/libs/wbs/application/core/src/module/work-item/module.ts
@@ -111,1 +111,1 @@
-  .buildModule({ exportedServiceKeys: ['workItems'], moduleLabel: WORK_ITEM_LABEL });
+  .buildModule({ exportedServiceKeys: ['workItems'] });
```

#### Proof g-witem

```diff
diff --git a/libs/wbs/application/core/src/module/work-item/module.ts b/libs/wbs/application/core/src/module/work-item/module.ts
--- a/libs/wbs/application/core/src/module/work-item/module.ts
+++ b/libs/wbs/application/core/src/module/work-item/module.ts
@@ -111,1 +111,1 @@
-  .buildModule({ exportedServiceKeys: ['workItems'], moduleLabel: WORK_ITEM_LABEL });
+  .buildModule({ exportedServiceKeys: ['workItems'] });
```

#### Proof w-opt

```diff
diff --git a/apps/wbs/be-01/src/module/optimization/module.ts b/apps/wbs/be-01/src/module/optimization/module.ts
--- a/apps/wbs/be-01/src/module/optimization/module.ts
+++ b/apps/wbs/be-01/src/module/optimization/module.ts
@@ -124,1 +124,1 @@
-  .buildModule({ exportedServiceKeys: ['optimizer'], moduleLabel: OPTIMIZATION_LABEL });
+  .buildModule({ exportedServiceKeys: ['optimizer', 'optimizationOptions'], moduleLabel: OPTIMIZATION_LABEL });
```

#### Proof l-opt

```diff
diff --git a/apps/wbs/be-01/src/module/optimization/module.ts b/apps/wbs/be-01/src/module/optimization/module.ts
--- a/apps/wbs/be-01/src/module/optimization/module.ts
+++ b/apps/wbs/be-01/src/module/optimization/module.ts
@@ -124,1 +124,1 @@
-  .buildModule({ exportedServiceKeys: ['optimizer'], moduleLabel: OPTIMIZATION_LABEL });
+  .buildModule({ exportedServiceKeys: ['optimizer'] });
```

#### Proof g-opt

```diff
diff --git a/apps/wbs/be-01/src/module/optimization/module.ts b/apps/wbs/be-01/src/module/optimization/module.ts
--- a/apps/wbs/be-01/src/module/optimization/module.ts
+++ b/apps/wbs/be-01/src/module/optimization/module.ts
@@ -124,1 +124,1 @@
-  .buildModule({ exportedServiceKeys: ['optimizer'], moduleLabel: OPTIMIZATION_LABEL });
+  .buildModule({ exportedServiceKeys: ['optimizer'] });
```

#### Proof w-slaunch

```diff
diff --git a/apps/wbs/be-01/src/module/solver-launcher/module.ts b/apps/wbs/be-01/src/module/solver-launcher/module.ts
--- a/apps/wbs/be-01/src/module/solver-launcher/module.ts
+++ b/apps/wbs/be-01/src/module/solver-launcher/module.ts
@@ -66,1 +66,1 @@
-  .buildModule({ exportedServiceKeys: ['solverLauncher'], moduleLabel: SOLVER_LAUNCHER_LABEL });
+  .buildModule({ exportedServiceKeys: ['solverLauncher', 'launcherSeams'], moduleLabel: SOLVER_LAUNCHER_LABEL });
```

#### Proof l-slaunch

```diff
diff --git a/apps/wbs/be-01/src/module/solver-launcher/module.ts b/apps/wbs/be-01/src/module/solver-launcher/module.ts
--- a/apps/wbs/be-01/src/module/solver-launcher/module.ts
+++ b/apps/wbs/be-01/src/module/solver-launcher/module.ts
@@ -66,1 +66,1 @@
-  .buildModule({ exportedServiceKeys: ['solverLauncher'], moduleLabel: SOLVER_LAUNCHER_LABEL });
+  .buildModule({ exportedServiceKeys: ['solverLauncher'] });
```

#### Proof g-slaunch

```diff
diff --git a/apps/wbs/be-01/src/module/solver-launcher/module.ts b/apps/wbs/be-01/src/module/solver-launcher/module.ts
--- a/apps/wbs/be-01/src/module/solver-launcher/module.ts
+++ b/apps/wbs/be-01/src/module/solver-launcher/module.ts
@@ -66,1 +66,1 @@
-  .buildModule({ exportedServiceKeys: ['solverLauncher'], moduleLabel: SOLVER_LAUNCHER_LABEL });
+  .buildModule({ exportedServiceKeys: ['solverLauncher'] });
```

#### Proof w-ssup

```diff
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/module.ts b/apps/wbs/be-01/src/module/solver-supervisor/module.ts
--- a/apps/wbs/be-01/src/module/solver-supervisor/module.ts
+++ b/apps/wbs/be-01/src/module/solver-supervisor/module.ts
@@ -74,1 +74,1 @@
-  .buildModule({ exportedServiceKeys: ['spawner'], moduleLabel: SOLVER_SUPERVISOR_LABEL });
+  .buildModule({ exportedServiceKeys: ['spawner', 'supervisorOptions'], moduleLabel: SOLVER_SUPERVISOR_LABEL });
```

#### Proof l-ssup

```diff
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/module.ts b/apps/wbs/be-01/src/module/solver-supervisor/module.ts
--- a/apps/wbs/be-01/src/module/solver-supervisor/module.ts
+++ b/apps/wbs/be-01/src/module/solver-supervisor/module.ts
@@ -74,1 +74,1 @@
-  .buildModule({ exportedServiceKeys: ['spawner'], moduleLabel: SOLVER_SUPERVISOR_LABEL });
+  .buildModule({ exportedServiceKeys: ['spawner'] });
```

#### Proof g-ssup

```diff
diff --git a/apps/wbs/be-01/src/module/solver-supervisor/module.ts b/apps/wbs/be-01/src/module/solver-supervisor/module.ts
--- a/apps/wbs/be-01/src/module/solver-supervisor/module.ts
+++ b/apps/wbs/be-01/src/module/solver-supervisor/module.ts
@@ -74,1 +74,1 @@
-  .buildModule({ exportedServiceKeys: ['spawner'], moduleLabel: SOLVER_SUPERVISOR_LABEL });
+  .buildModule({ exportedServiceKeys: ['spawner'] });
```

#### Proof w-dmgmt

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory-management/module.ts b/apps/wbs/fe-01/src/modules/directory-management/module.ts
--- a/apps/wbs/fe-01/src/modules/directory-management/module.ts
+++ b/apps/wbs/fe-01/src/modules/directory-management/module.ts
@@ -50,1 +50,1 @@
-    exportedServiceKeys: ['directoryManagement'],
+    exportedServiceKeys: ['directoryManagement', 'directory'],
```

#### Proof l-dmgmt

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory-management/module.ts b/apps/wbs/fe-01/src/modules/directory-management/module.ts
--- a/apps/wbs/fe-01/src/modules/directory-management/module.ts
+++ b/apps/wbs/fe-01/src/modules/directory-management/module.ts
@@ -51,1 +50,0 @@
-    moduleLabel: DIRECTORY_MANAGEMENT_LABEL,
```

#### Proof w-prefs

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/module.ts b/apps/wbs/fe-01/src/modules/preferences/module.ts
--- a/apps/wbs/fe-01/src/modules/preferences/module.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/module.ts
@@ -86,1 +86,1 @@
-    exportedServiceKeys: ['preferences', 'remembered'],
+    exportedServiceKeys: ['preferences', 'remembered', 'preferencesStore'],
```

#### Proof l-prefs

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/module.ts b/apps/wbs/fe-01/src/modules/preferences/module.ts
--- a/apps/wbs/fe-01/src/modules/preferences/module.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/module.ts
@@ -87,1 +86,0 @@
-    moduleLabel: PREFERENCES_LABEL,
```

#### Proof bs1

```diff
diff --git a/apps/wbs/be-01/src/boot.ts b/apps/wbs/be-01/src/boot.ts
--- a/apps/wbs/be-01/src/boot.ts
+++ b/apps/wbs/be-01/src/boot.ts
@@ -102 +102 @@
-        disposeService: (source) => source.close(),
+        disposeService: () => Promise.resolve(),
```

#### Proof bs2

```diff
diff --git a/apps/wbs/be-01/src/boot.ts b/apps/wbs/be-01/src/boot.ts
--- a/apps/wbs/be-01/src/boot.ts
+++ b/apps/wbs/be-01/src/boot.ts
@@ -102 +102 @@
-        disposeService: (source) => source.close(),
+        disposeService: (source) => source.close().catch(() => undefined),
```

#### Proof bs3

```diff
diff --git a/apps/wbs/be-01/src/boot.ts b/apps/wbs/be-01/src/boot.ts
--- a/apps/wbs/be-01/src/boot.ts
+++ b/apps/wbs/be-01/src/boot.ts
@@ -136 +136 @@
-        disposeService: (retention) => retention.stop(),
+        disposeService: () => Promise.resolve(),
```

#### Proof bs4

```diff
diff --git a/apps/wbs/be-01/src/boot.ts b/apps/wbs/be-01/src/boot.ts
--- a/apps/wbs/be-01/src/boot.ts
+++ b/apps/wbs/be-01/src/boot.ts
@@ -151 +150,0 @@
-              retention: _retention,
```

#### Proof bs5

```diff
diff --git a/apps/wbs/be-01/src/boot.ts b/apps/wbs/be-01/src/boot.ts
--- a/apps/wbs/be-01/src/boot.ts
+++ b/apps/wbs/be-01/src/boot.ts
@@ -211,3 +210,0 @@
-            factoryCtx.pushDisposer(async (disposerCtx) => {
-              if (disposerCtx.reason !== 'service-disposed') await app.stop();
-            });
```

#### Proof bs6

```diff
diff --git a/apps/wbs/be-01/src/boot.ts b/apps/wbs/be-01/src/boot.ts
--- a/apps/wbs/be-01/src/boot.ts
+++ b/apps/wbs/be-01/src/boot.ts
@@ -267 +267 @@
-          await app.stop();
+          await Promise.resolve(app);
```

#### Proof pf1

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/module.ts b/apps/wbs/fe-01/src/modules/preferences/module.ts
--- a/apps/wbs/fe-01/src/modules/preferences/module.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/module.ts
@@ -51,3 +51 @@
-      disposeService: (store) => {
-        store.revoke();
-      },
+      disposeService: () => undefined,
```

#### Proof pf2

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/module.ts b/apps/wbs/fe-01/src/modules/preferences/module.ts
--- a/apps/wbs/fe-01/src/modules/preferences/module.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/module.ts
@@ -65 +64,0 @@
-        preferencesStore,
@@ -66,0 +66 @@
+        preferencesStore,
```

#### Proof ar1

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.ts b/apps/wbs/fe-01/src/runtime/application-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -77 +77 @@
-      close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs }),
+      close: () => Promise.resolve(),
```

#### Proof ar2

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.ts b/apps/wbs/fe-01/src/runtime/application-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -83,0 +84 @@
+    throw failure;
```

#### Proof ar3

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-runtime.ts b/apps/wbs/fe-01/src/runtime/application-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/application-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/application-runtime.ts
@@ -88 +88 @@
-      graph.close({ waitTimeoutMs: options.timeoutMs }),
+      Promise.resolve(),
```

#### Proof ls1

```diff
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
@@ -165 +165 @@
-  return refusal.disposalPromise;
+  return null;
```

#### Proof ls2

```diff
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
@@ -271 +271 @@
-        lateEnded = 'settled';
+        return;
```

#### Proof ls3

```diff
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
@@ -345 +345 @@
-            refuse(releaseRefusal);
+            void releaseRefusal;
```

#### Proof ml1

```diff
diff --git a/libs/wbs/application/core/src/module/capacity/module.ts b/libs/wbs/application/core/src/module/capacity/module.ts
--- a/libs/wbs/application/core/src/module/capacity/module.ts
+++ b/libs/wbs/application/core/src/module/capacity/module.ts
@@ -65,0 +66 @@
+export const decoy = capacityModule;
```

#### Proof ml2

```diff
diff --git a/tools/tool-devsync/src/module-labels.test.ts b/tools/tool-devsync/src/module-labels.test.ts
--- a/tools/tool-devsync/src/module-labels.test.ts
+++ b/tools/tool-devsync/src/module-labels.test.ts
@@ -139 +139 @@
-    .filter((binding) => binding.serviceKeys.length === 0)
+    .filter((binding) => binding.serviceKeys.length < 0)
```

#### Proof ts1

```diff
diff --git a/libs/wbs/application/core/src/module/authentication/module.test.ts b/libs/wbs/application/core/src/module/authentication/module.test.ts
--- a/libs/wbs/application/core/src/module/authentication/module.test.ts
+++ b/libs/wbs/application/core/src/module/authentication/module.test.ts
@@ -101 +100,0 @@
-  // @ts-expect-error `account.users` must also satisfy `OidcIdentityStore` when `oidc` is supplied.
```

#### Proof ts2

```diff
diff --git a/libs/wbs/application/core/src/module/authentication/contract.ts b/libs/wbs/application/core/src/module/authentication/contract.ts
--- a/libs/wbs/application/core/src/module/authentication/contract.ts
+++ b/libs/wbs/application/core/src/module/authentication/contract.ts
@@ -37 +37 @@
-    readonly users: AuthServiceOptions['users'] & NonNullable<AuthServiceOptions['identities']>;
+    readonly users: AuthServiceOptions['users'];
```

#### Proof d9

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -52,0 +53,2 @@
+import { DiBag } from 'di-bag';
+export const bag = DiBag.createBuilder;
```

#### Proof j-o2

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -339 +338,0 @@
-        refusedByRuntime.add(refusal);
```

#### Proof j-o4

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -379 +379 @@
-            new PartialAcquisitionError(failure.cause, recorded(failure.release))
+            failure
```

#### Proof i-o2

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -361 +360,0 @@
-        refusedByRuntime.add(refusal);
```

#### Proof i-o3

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -379 +379 @@
-            new PartialAcquisitionError(failure.cause, recorded(failure.release))
+            failure
```

### 8.3 Slice 5 — every recorded model sabotage, at its run

The eleven model tests and their pins, read from the files on the base and unchanged by this packet:
`lifetime-slot.model.test.ts` seed 20260923, `theme.model.test.tsx` seed 20260925, and
`remembered-layout`, `channel`, `busy-store`, `delivered-plan-store`, `presence-store`,
`application-bootstrap`, `project-runtime`, `session-exit` and `session-runtime` model tests seed
20260924; every one `numRuns: 300` under fast-check 4.9.0 (each asserts `fc.__version`). Green on the
rehearsal's slice 4 commit: `Test Files 11 passed (11)`, `Tests 12 passed (12)`.

Where the sabotages come from: 050.7 f2, g, i, j and k carried diffs, converted mechanically to
`--unidiff-zero` against this tree (four needed the lines respelled by hand because 0.5.0's
`waitTimeoutMs` or a later `Proof:` comment sits in them: `f2-hf`, `g-d4`, `g-d5`, and the
`recorded(failure.release)` rewraps of section 8.2); 050.7 a (`A1`–`A6`), b (`ens`), e (`5`, `13`,
`14`, `15`) and f1 (`a`–`g`) described theirs in prose and are written here from those descriptions.
`a-A5` and `a-A6` were example-only in their packet and stay so.

The records for `$TMPDIR/proofs.txt`:

```text
a-A1
fail
vitest
apps/wbs/fe-01
src/runtime/lifetime-slot.model.test.ts
holds every invariant it claims
a-A2
fail
vitest
apps/wbs/fe-01
src/runtime/lifetime-slot.model.test.ts
holds every invariant it claims
a-A3
fail
vitest
apps/wbs/fe-01
src/runtime/lifetime-slot.model.test.ts
holds every invariant it claims
a-A4
fail
vitest
apps/wbs/fe-01
src/runtime/lifetime-slot.model.test.ts
holds every invariant it claims
a-A5
fail
vitest
apps/wbs/fe-01
src/runtime/lifetime-slot.test.ts
does not build for a request that a newer one overtook during the disposal
a-A6
fail
vitest
apps/wbs/fe-01
src/runtime/lifetime-slot.test.ts
cannot be superseded by a subscriber running inside a transition
b-ens
fail
vitest
apps/wbs/fe-01
src/runtime/lifetime-slot.model.test.ts
acquire, then retire a live runtime, then settled: the captured handle refuses afterward
e-5
fail
vitest
apps/wbs/fe-01
src/runtime/application-bootstrap.model.test.tsx
only ever draws the page from the runtime the slot publishes
e-13
fail
vitest
apps/wbs/fe-01
src/runtime/application-bootstrap.model.test.tsx
only ever draws the page from the runtime the slot publishes
e-14
fail
vitest
apps/wbs/fe-01
src/runtime/application-bootstrap.model.test.tsx
only ever draws the page from the runtime the slot publishes
e-15
fail
vitest
apps/wbs/fe-01
src/runtime/application-bootstrap.model.test.tsx
only ever draws the page from the runtime the slot publishes
f1-a
fail
vitest
apps/wbs/fe-01
src/lib/theme.model.test.tsx
shows and persists exactly what the model says, under generated interleavings
f1-b
fail
vitest
apps/wbs/fe-01
src/lib/theme.model.test.tsx
shows and persists exactly what the model says, under generated interleavings
f1-c
fail
vitest
apps/wbs/fe-01
src/lib/theme.model.test.tsx
shows and persists exactly what the model says, under generated interleavings
f1-d
fail
vitest
apps/wbs/fe-01
src/lib/theme.model.test.tsx
shows and persists exactly what the model says, under generated interleavings
f1-e
fail
vitest
apps/wbs/fe-01
src/lib/theme.model.test.tsx
shows and persists exactly what the model says, under generated interleavings
f1-f
fail
vitest
apps/wbs/fe-01
src/lib/theme.model.test.tsx
shows and persists exactly what the model says, under generated interleavings
f1-g
fail
vitest
apps/wbs/fe-01
src/lib/theme.model.test.tsx
shows and persists exactly what the model says, under generated interleavings
f2-ha
fail
vitest
apps/wbs/fe-01
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
f2-hb
fail
vitest
apps/wbs/fe-01
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
f2-hc
fail
vitest
apps/wbs/fe-01
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
f2-hd
fail
vitest
apps/wbs/fe-01
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
f2-he
fail
vitest
apps/wbs/fe-01
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
f2-hh
fail
vitest
apps/wbs/fe-01
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
f2-hf
fail
vitest
apps/wbs/fe-01
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
f2-hg
fail
vitest
apps/wbs/fe-01
src/components/wbs/remembered-layout.model.test.ts
answers and stores exactly what the model says, under generated interleavings
g-c1
fail
vitest
apps/wbs/fe-01
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
g-c2
fail
vitest
apps/wbs/fe-01
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
g-c3
fail
vitest
apps/wbs/fe-01
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
g-c4
fail
vitest
apps/wbs/fe-01
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
g-c5
fail
vitest
apps/wbs/fe-01
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
g-c6
fail
vitest
apps/wbs/fe-01
src/modules/channel.model.test.ts
delivers exactly what the model says, under generated interleavings
g-b1
fail
vitest
apps/wbs/fe-01
src/modules/plan-writer/busy-store.model.test.ts
holds the last value raised or lowered, and says so once per change
g-b2
fail
vitest
apps/wbs/fe-01
src/modules/plan-writer/busy-store.model.test.ts
holds the last value raised or lowered, and says so once per change
g-b3
fail
vitest
apps/wbs/fe-01
src/modules/plan-writer/busy-store.model.test.ts
holds the last value raised or lowered, and says so once per change
g-b4
fail
vitest
apps/wbs/fe-01
src/modules/plan-writer/busy-store.model.test.ts
holds the last value raised or lowered, and says so once per change
g-d1
fail
vitest
apps/wbs/fe-01
src/modules/plan-feed/delivered-plan-store.model.test.ts
folds every publication exactly as the model does, and changes only when it must
g-d2
fail
vitest
apps/wbs/fe-01
src/modules/plan-feed/delivered-plan-store.model.test.ts
folds every publication exactly as the model does, and changes only when it must
g-d3
fail
vitest
apps/wbs/fe-01
src/modules/plan-feed/delivered-plan-store.model.test.ts
folds every publication exactly as the model does, and changes only when it must
g-d4
fail
vitest
apps/wbs/fe-01
src/modules/plan-feed/delivered-plan-store.model.test.ts
folds every publication exactly as the model does, and changes only when it must
g-d5
fail
vitest
apps/wbs/fe-01
src/modules/plan-feed/delivered-plan-store.model.test.ts
folds every publication exactly as the model does, and changes only when it must
g-r1
fail
vitest
apps/wbs/fe-01
src/modules/plan-feed/presence-store.model.test.ts
shows exactly the last frame and connection, and changes only when they do
g-r2
fail
vitest
apps/wbs/fe-01
src/modules/plan-feed/presence-store.model.test.ts
shows exactly the last frame and connection, and changes only when they do
g-r3
fail
vitest
apps/wbs/fe-01
src/modules/plan-feed/presence-store.model.test.ts
shows exactly the last frame and connection, and changes only when they do
g-r4
fail
vitest
apps/wbs/fe-01
src/modules/plan-feed/presence-store.model.test.ts
shows exactly the last frame and connection, and changes only when they do
i-m1
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m2
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m3
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m4
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m5
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m6
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m7
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m8
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m9
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m10
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m11
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
i-m12
fail
vitest
apps/wbs/fe-01
src/runtime/session-runtime.model.test.ts
keys one runtime by user, and nothing of a withdrawn one — nor its project — reaches anybody
j-m1
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
j-m2
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
j-m3
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
j-m4
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
j-m5
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
j-m6
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
j-m7
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
j-m8
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
j-m9
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
j-m10
fail
vitest
apps/wbs/fe-01
src/runtime/project-runtime.model.test.ts
keeps one runtime current, and nothing of a withdrawn one reaches anybody
k-x1
fail
vitest
apps/wbs/fe-01
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
k-x2
fail
vitest
apps/wbs/fe-01
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
k-x3
fail
vitest
apps/wbs/fe-01
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
k-x4
fail
vitest
apps/wbs/fe-01
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
k-x5
fail
vitest
apps/wbs/fe-01
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
k-x6
fail
vitest
apps/wbs/fe-01
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
k-x7
fail
vitest
apps/wbs/fe-01
src/runtime/session-exit.model.test.ts
retires the project and then the session, sends nothing, and settles within the budget — signed out only when both let go
```

Rehearsed on `fcb45dbf5` (slice 4) with di-bag 0.5.0, 2026-09-25, every record `status=1`. "Run ·
shrunk" is fast-check's own `Property failed after N tests` and `Shrunk N time(s)`; "recorded" is the
run the originating packet or `verify.md` wrote; "0.4.0" is the same patch run on the base
`e93a564a0` with di-bag 0.4.0 installed, where it applies (the four faults inside a model test file
the codemod rewrote, and `j-m4`, whose added line has no anchor on the base, were not run there).

| Id      | From    | Test file                              | Run · shrunk | Recorded | 0.4.0     | Innermost cause                                                                                                                              |
| ------- | ------- | -------------------------------------- | ------------ | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `a-A1`  | 050.7a  | `lifetime-slot.model.test.ts`          | 3 · 3        | —        | 3·3       | AssertionError: r4: 1 acquisitions, 0 close attempts, live=null: expected +0 to be 1                                                         |
| `a-A2`  | 050.7a  | `lifetime-slot.model.test.ts`          | 1 · 5        | —        | 1·5       | AssertionError: the latest request did not win: expected 'refused' not to be 'refused'                                                       |
| `a-A3`  | 050.7a  | `lifetime-slot.model.test.ts`          | 4 · 3        | —        | 4·3       | AssertionError: r1: 1 acquisitions, 0 close attempts, live=null: expected +0 to be 1                                                         |
| `a-A4`  | 050.7a  | `lifetime-slot.model.test.ts`          | 9 · 4        | —        | 9·4       | AssertionError: r2: 1 acquisitions, 0 close attempts, live=r3: expected +0 to be 1                                                           |
| `a-A5`  | 050.7a  | `lifetime-slot.test.ts`                | example · -  | —        | example·- | AssertionError: expected 1 to be +0                                                                                                          |
| `a-A6`  | 050.7a  | `lifetime-slot.test.ts`                | example · -  | —        | example·- | AssertionError: third accounting: expected +0 to be 1                                                                                        |
| `b-ens` | 050.7b  | `lifetime-slot.model.test.ts`          | 27 · 2       | 27       | 27·2      | AssertionError: r2 is not live (live=null) but its read did not throw: expected false to be true                                             |
| `e-5`   | 050.7e  | `application-bootstrap.model.test.tsx` | 5 · 4        | 5        | 5·4       | AssertionError: the app was drawn while the slot was retiring: expected 'retiring' to be 'live'                                              |
| `e-13`  | 050.7e  | `application-bootstrap.model.test.tsx` | 175 · 0      | 175      | 175·0     | AssertionError: a runtime live before a pagehide trigger was still the one live at the end: expected [ { preferences: { …(3) }, …(1) } ] …   |
| `e-14`  | 050.7e  | `application-bootstrap.model.test.tsx` | 3 · 6        | 3        | 3·6       | AssertionError: the app was drawn while the slot was empty: expected 'empty' to be 'live'                                                    |
| `e-15`  | 050.7e  | `application-bootstrap.model.test.tsx` | 87 · 4       | 87       | 87·4      | AssertionError: the app was drawn while the slot was fatal: expected 'fatal' to be 'live'                                                    |
| `f1-a`  | 050.7f1 | `theme.model.test.tsx`                 | 14 · 5       | 14       | 14·5      | AssertionError: stored bytes in A: expected undefined to be '"system"'                                                                       |
| `f1-b`  | 050.7f1 | `theme.model.test.tsx`                 | 14 · 3       | 14       | 14·3      | AssertionError: persists: expected false to be true                                                                                          |
| `f1-c`  | 050.7f1 | `theme.model.test.tsx`                 | 42 · 1       | 42       | 42·1      | AssertionError: an ordinary storage failure did not propagate out of the chooser: expected null to be Error: write denied                    |
| `f1-d`  | 050.7f1 | `theme.model.test.tsx`                 | 1 · 2        | 1        | 1·2       | PreferenceStoreLifecycleError: the page withdrew this preference store before the access completed                                           |
| `f1-e`  | 050.7f1 | `theme.model.test.tsx`                 | 1 · 4        | 1        | 1·4       | AssertionError: persists: expected true to be false                                                                                          |
| `f1-f`  | 050.7f1 | `theme.model.test.tsx`                 | 9 · 1        | 9        | —         | Error: the property failed and its teardown refused: Error: retire refused during teardown with: Error: unexpected cleanup corruption \| E…  |
| `f1-g`  | 050.7f1 | `theme.model.test.tsx`                 | 1 · 1        | 1        | —         | Error: teardown refused: Error: teardown retire refused during teardown with: Error: unrelated teardown failure                              |
| `f2-ha` | 050.7f2 | `remembered-layout.model.test.ts`      | 8 · 4        | 8        | 8·4       | AssertionError: write(outline): what the handle answered: expected false to deeply equal true                                                |
| `f2-hb` | 050.7f2 | `remembered-layout.model.test.ts`      | 13 · 2       | 13       | 13·2      | AssertionError: read: what the handle answered: expected PreferenceStoreLifecycleError: the page w… { kind: '…' } to deeply equal { value…   |
| `f2-hc` | 050.7f2 | `remembered-layout.model.test.ts`      | 2 · 1        | 2        | 2·1       | AssertionError: read: what the handle answered: expected { value: null, persists: true } to deeply equal { value: null, persists: false }    |
| `f2-hd` | 050.7f2 | `remembered-layout.model.test.ts`      | 106 · 2      | 106      | 106·2     | AssertionError: stored bytes in B: expected '7' to be undefined                                                                              |
| `f2-he` | 050.7f2 | `remembered-layout.model.test.ts`      | 18 · 1       | 18       | 18·1      | AssertionError: write(outline): an ordinary storage failure did not propagate unchanged: expected false to be Error: write denied            |
| `f2-hh` | 050.7f2 | `remembered-layout.model.test.ts`      | 2 · 2        | 2        | 2·2       | AssertionError: write(outline) while acquiring: what the handle answered: expected true to deeply equal false                                |
| `f2-hf` | 050.7f2 | `remembered-layout.model.test.ts`      | 2 · 3        | 2        | —         | Error: the property failed and its teardown refused: Error: replace(A) refused during teardown with: Error: unexpected cleanup corruption…   |
| `f2-hg` | 050.7f2 | `remembered-layout.model.test.ts`      | 1 · 0        | 1        | —         | Error: teardown refused: Error: teardown retire refused during teardown with: Error: unrelated teardown failure                              |
| `g-c1`  | 050.7g  | `channel.model.test.ts`                | 5 · 5        | 5        | 5·5       | Error: teardown refused: AssertionError: who heard 1, in what order: expected [ { listener: +0, event: 1 }, …(1) ] to deeply equal [ { li…   |
| `g-c2`  | 050.7g  | `channel.model.test.ts`                | 16 · 4       | 16       | 16·4      | AssertionError: publish(1) threw with no failing listener: expected AssertionError: listener 1 heard 1 after … { …(4) } to be null           |
| `g-c3`  | 050.7g  | `channel.model.test.ts`                | 17 · 1       | 17       | 17·1      | AssertionError: listener 0 was entered re-entrantly: expected 2 to be 1                                                                      |
| `g-c4`  | 050.7g  | `channel.model.test.ts`                | 5 · 5        | 5        | 5·5       | Error: teardown refused: AssertionError: publish(1) did not rethrow the one failure by identity: expected null to be Error: listener 0 re…   |
| `g-c5`  | 050.7g  | `channel.model.test.ts`                | 5 · 4        | 5        | 5·4       | Error: teardown refused: AssertionError: who heard 1, in what order: expected [ { listener: +0, event: 1 } ] to deeply equal [ { listener…   |
| `g-c6`  | 050.7g  | `channel.model.test.ts`                | 5 · 5        | 5        | 5·5       | Error: teardown refused: AssertionError: publish(1) did not aggregate its failures: expected Error: listener 0 refused 1 to be an instanc…   |
| `g-b1`  | 050.7g  | `busy-store.model.test.ts`             | 1 · 0        | 1        | 1·0       | Error: the property failed and its teardown refused: AssertionError: teardown: changes heard by the listener that never leaves: expected …   |
| `g-b2`  | 050.7g  | `busy-store.model.test.ts`             | 1 · 1        | 1        | 1·1       | Error: the property failed and its teardown refused: AssertionError: teardown: the last value the sentinel read: expected false to be true   |
| `g-b3`  | 050.7g  | `busy-store.model.test.ts`             | 1 · 2        | 1        | 1·2       | Error: the property failed and its teardown refused: AssertionError: teardown: busy: expected true to be false                               |
| `g-b4`  | 050.7g  | `busy-store.model.test.ts`             | 2 · 1        | 2        | 2·1       | AssertionError: raise: busy: expected false to be true                                                                                       |
| `g-d1`  | 050.7g  | `delivered-plan-store.model.test.ts`   | 1 · 0        | 1        | 1·0       | AssertionError: redeliver: a new snapshot exactly when something changed: expected true to be false                                          |
| `g-d2`  | 050.7g  | `delivered-plan-store.model.test.ts`   | 1 · 13       | 1        | 1·13      | Error: the property failed and its teardown refused: AssertionError: teardown: tree: expected null to be { value: { …(19) }, generation: 1 } |
| `g-d3`  | 050.7g  | `delivered-plan-store.model.test.ts`   | 1 · 14       | 1        | 1·14      | Error: the property failed and its teardown refused: AssertionError: teardown: markers: expected [] to be []                                 |
| `g-d4`  | 050.7g  | `delivered-plan-store.model.test.ts`   | 5 · 10       | 5        | 5·10      | AssertionError: redeliver: a new snapshot exactly when something changed: expected true to be false                                          |
| `g-d5`  | 050.7g  | `delivered-plan-store.model.test.ts`   | 1 · 6        | 1        | 1·6       | Error: the property failed and its teardown refused: AssertionError: teardown: steps are not the store’s own: expected true to be false      |
| `g-r1`  | 050.7g  | `presence-store.model.test.ts`         | 1 · 3        | 1        | 1·3       | AssertionError: users(["lee"]): a new snapshot exactly when something changed: expected true to be false                                     |
| `g-r2`  | 050.7g  | `presence-store.model.test.ts`         | 1 · 2        | 1        | 1·2       | Error: the property failed and its teardown refused: AssertionError: teardown: users: expected [] to be []                                   |
| `g-r3`  | 050.7g  | `presence-store.model.test.ts`         | 1 · 2        | 1        | 1·2       | Error: the property failed and its teardown refused: AssertionError: teardown: users: expected [] to be []                                   |
| `g-r4`  | 050.7g  | `presence-store.model.test.ts`         | 1 · 1        | 1        | 1·1       | Error: the property failed and its teardown refused: AssertionError: teardown: users: expected [] to be []                                   |
| `i-m1`  | 050.7i  | `session-runtime.model.test.ts`        | 3 · 2        | 3        | 3·2       | Error: the property failed and its teardown refused: AssertionError: teardown: the published session is not the user last asked for: expe…   |
| `i-m2`  | 050.7i  | `session-runtime.model.test.ts`        | 10 · 6       | 10       | 10·6      | Error: teardown refused: AssertionError: teardown: the last user asked for is not the one live: expected 'fatal' to be 'u1'                  |
| `i-m3`  | 050.7i  | `session-runtime.model.test.ts`        | 2 · 6        | 2        | 2·6       | Error: teardown refused: AssertionError: teardown: s1's directory changed after it was withdrawn: expected false to be true                  |
| `i-m4`  | 050.7i  | `session-runtime.model.test.ts`        | 2 · 6        | 1        | 2·6       | Error: teardown refused: AssertionError: teardown: s1's directory changed after it was withdrawn: expected false to be true                  |
| `i-m5`  | 050.7i  | `session-runtime.model.test.ts`        | 1 · 5        | 1        | 1·5       | AssertionError: gesture: withdrawn s1 sent a request: expected 1 to be +0                                                                    |
| `i-m6`  | 050.7i  | `session-runtime.model.test.ts`        | 1 · 5        | 1        | 1·5       | Error: the property failed and its teardown refused: AssertionError: signOut settled before s1's retirement had run: expected false to be…   |
| `i-m7`  | 050.7i  | `session-runtime.model.test.ts`        | 14 · 7       | 14       | 14·7      | Error: teardown refused: AssertionError: teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live'   |
| `i-m8`  | 050.7i  | `session-runtime.model.test.ts`        | 14 · 5       | 14       | 14·5      | AssertionError: signInBroken(u2): a project is still current after its session was withdrawn: expected [ 's1.p1' ] to deeply equal []        |
| `i-m9`  | 050.7i  | `session-runtime.model.test.ts`        | 3 · 11       | 3        | 3·11      | Error: teardown refused: AssertionError: teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live'   |
| `i-m10` | 050.7i  | `session-runtime.model.test.ts`        | 2 · 6        | 2        | 2·6       | Error: teardown refused: AssertionError: teardown: more than one session says it is current: expected [ 's1', 's2' ] to have a length of …   |
| `i-m11` | 050.7i  | `session-runtime.model.test.ts`        | 14 · 7       | 14       | 14·7      | Error: teardown refused: AssertionError: teardown: s1 was retired while its project owner still held one: expected 'live' not to be 'live'   |
| `i-m12` | 050.7i  | `session-runtime.model.test.ts`        | 2 · 4        | 2        | 2·4       | Error: teardown refused: Error: a session transition was refused by the slot itself                                                          |
| `j-m1`  | 050.7j  | `project-runtime.model.test.ts`        | 2 · 2        | 2        | 2·2       | Error: the property failed and its teardown refused: AssertionError: teardown: more than one runtime says it is current: expected [ 'r1',…   |
| `j-m2`  | 050.7j  | `project-runtime.model.test.ts`        | 2 · 7        | 2        | 2·7       | Error: teardown refused: AssertionError: teardown: r1's delivered plan changed after it was withdrawn: expected false to be true             |
| `j-m3`  | 050.7j  | `project-runtime.model.test.ts`        | 6 · 5        | 6        | 6·5       | AssertionError: reread: withdrawn r2 sent a request: expected 1 to be +0                                                                     |
| `j-m4`  | 050.7j  | `project-runtime.model.test.ts`        | 2 · 5        | 2        | —         | Error: teardown refused: AssertionError: teardown: r1's feed closed 2 times, live=false: expected 2 to be 1                                  |
| `j-m5`  | 050.7j  | `project-runtime.model.test.ts`        | 2 · 5        | 2        | 2·5       | Error: teardown refused: AssertionError: teardown: r1's feed closed 0 times, live=false: expected +0 to be 1                                 |
| `j-m6`  | 050.7j  | `project-runtime.model.test.ts`        | 2 · 2        | 2        | 2·2       | AssertionError: mark: withdrawn r1 sent a request: expected 1 to be +0                                                                       |
| `j-m7`  | 050.7j  | `project-runtime.model.test.ts`        | 3 · 7        | 3        | 3·7       | Error: the property failed and its teardown refused: AssertionError: teardown: r2's presence changed after it was withdrawn: expected fal…   |
| `j-m8`  | 050.7j  | `project-runtime.model.test.ts`        | 6 · 5        | 6        | 6·5       | Error: the property failed and its teardown refused: AssertionError: teardown: r2's presence changed after it was withdrawn: expected fal…   |
| `j-m9`  | 050.7j  | `project-runtime.model.test.ts`        | 2 · 1        | 2        | 2·1       | Error: the property failed and its teardown refused: AssertionError: teardown: more than one runtime says it is current: expected [ 'r1',…   |
| `j-m10` | 050.7j  | `project-runtime.model.test.ts`        | 3 · 6        | 3        | 3·6       | Error: teardown refused: Error: a project transition was refused by the slot itself                                                          |
| `k-x1`  | 050.7k  | `session-exit.model.test.ts`           | 18 · 10      | 18       | 18·10     | AssertionError: read: withdrawn s1 sent a request: expected 5 to be +0                                                                       |
| `k-x2`  | 050.7k  | `session-exit.model.test.ts`           | 50 · 6       | 50       | 50·6      | Error: the property failed and its teardown refused: Error: s1 was given back before its project s1.p1.settles                               |
| `k-x3`  | 050.7k  | `session-exit.model.test.ts`           | 59 · 9       | 59       | 59·9      | Error: the property failed and its teardown refused: AssertionError: teardown: s1.p1.settles's plan changed after its session s1 was with…   |
| `k-x4`  | 050.7k  | `session-exit.model.test.ts`           | 75 · 6       | 75       | 75·6      | Error: teardown refused: AssertionError: teardown: leave never settled: expected false to be true                                            |
| `k-x5`  | 050.7k  | `session-exit.model.test.ts`           | 3 · 7        | 3        | 3·7       | Error: teardown refused: AssertionError: logOut#1 settled signed-out before s1 was given back: expected false to be true                     |
| `k-x6`  | 050.7k  | `session-exit.model.test.ts`           | 58 · 5       | 58       | 58·5      | Error: the property failed and its teardown refused: AssertionError: logOut#1 settled signed-out before s1 was given back: expected false…   |
| `k-x7`  | 050.7k  | `session-exit.model.test.ts`           | 43 · 4       | 43       | 43·4      | Error: teardown refused: AssertionError: logOut#1 settled signed-out though a sign-in was asked for while it retired: expected true to be…   |

Every run number equals its record except `i-m4` (recorded 1, now 2): the base with di-bag 0.4.0 gives
2 too, so the move predates this packet — packet 050.7i's own slice 2 and packet 050.7k changed the
session owner and its model after the run was recorded. No run number moved between 0.4.0 and 0.5.0
among the 69 compared.

#### Proof a-A1

```diff
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
@@ -314 +313,0 @@
-      if (ahead !== null) await ahead.catch(() => undefined);
```

#### Proof a-A2

```diff
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
@@ -331 +331 @@
-      if (ordinal !== newest) throw new TransitionSupersededError(ordinal, newest);
+      if (ordinal !== newest || newest >= 0) throw new TransitionSupersededError(ordinal, newest);
```

#### Proof a-A3

```diff
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
@@ -339 +339 @@
-        if (failure instanceof PartialAcquisitionError) {
+        if (failure instanceof PartialAcquisitionError && ordinal < 0) {
```

#### Proof a-A4

```diff
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
@@ -361 +361 @@
-      if (ordinal !== newest) {
+      if (ordinal < 0) {
```

#### Proof a-A5

```diff
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
@@ -331 +330,0 @@
-      if (ordinal !== newest) throw new TransitionSupersededError(ordinal, newest);
```

#### Proof a-A6

```diff
diff --git a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
--- a/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
+++ b/apps/wbs/fe-01/src/runtime/lifetime-slot.ts
@@ -254,6 +254 @@
-    if (notifying) return;
-    notifying = true;
-    void Promise.resolve().then(() => {
-      notifying = false;
-      for (const listener of [...listeners]) listener();
-    });
+    for (const listener of [...listeners]) listener();
```

#### Proof b-ens

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts b/apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts
--- a/apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/preferences.resource.ts
@@ -87 +87 @@
-    if (!isLive()) throw new PreferenceStoreLifecycleError(WITHDRAWN, 'withdrawn');
+    if (false) throw new PreferenceStoreLifecycleError(WITHDRAWN, 'withdrawn');
```

#### Proof e-5

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
@@ -264 +264 @@
-    if (dependencies.slot.snapshot().status !== 'live') return;
+    if (false) return;
```

#### Proof e-13

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
@@ -351 +350,0 @@
-  dependencies.eventTarget.addEventListener('pagehide', onPageHide);
```

#### Proof e-14

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
@@ -344 +344,9 @@
-    void attempt();
+    dependencies.acquire();
+    const Tree = dependencies.app;
+    rootFor().render(
+      <StrictMode>
+        <ApplicationServicesProvider slot={dependencies.slot}>
+          <Tree />
+        </ApplicationServicesProvider>
+      </StrictMode>,
+    );
```

#### Proof e-15

```diff
diff --git a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
--- a/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
+++ b/apps/wbs/fe-01/src/runtime/application-bootstrap.tsx
@@ -236,0 +237,8 @@
+      const Tree = dependencies.app;
+      rootFor().render(
+        <StrictMode>
+          <ApplicationServicesProvider slot={dependencies.slot}>
+            <Tree />
+          </ApplicationServicesProvider>
+        </StrictMode>,
+      );
```

#### Proof f1-a

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.ts b/apps/wbs/fe-01/src/lib/theme.ts
--- a/apps/wbs/fe-01/src/lib/theme.ts
+++ b/apps/wbs/fe-01/src/lib/theme.ts
@@ -109 +109 @@
-  themeStore.write(choice);
+  themeStore.read();
```

#### Proof f1-b

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.ts b/apps/wbs/fe-01/src/lib/theme.ts
--- a/apps/wbs/fe-01/src/lib/theme.ts
+++ b/apps/wbs/fe-01/src/lib/theme.ts
@@ -346 +346 @@
-      if (themeStore !== themeStoreRef.current) return;
+      if (false) return;
```

#### Proof f1-c

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.ts b/apps/wbs/fe-01/src/lib/theme.ts
--- a/apps/wbs/fe-01/src/lib/theme.ts
+++ b/apps/wbs/fe-01/src/lib/theme.ts
@@ -370 +369,0 @@
-        if (!isPreferenceStoreLifecycleError(refusal)) throw refusal;
```

#### Proof f1-d

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.ts b/apps/wbs/fe-01/src/lib/theme.ts
--- a/apps/wbs/fe-01/src/lib/theme.ts
+++ b/apps/wbs/fe-01/src/lib/theme.ts
@@ -300 +300 @@
-      if (!isPreferenceStoreLifecycleError(refusal)) throw refusal;
+      throw refusal;
```

#### Proof f1-e

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.ts b/apps/wbs/fe-01/src/lib/theme.ts
--- a/apps/wbs/fe-01/src/lib/theme.ts
+++ b/apps/wbs/fe-01/src/lib/theme.ts
@@ -278,2 +277,0 @@
-      setChoice('system');
-      setPersists(false);
```

#### Proof f1-f

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.model.test.tsx b/apps/wbs/fe-01/src/lib/theme.model.test.tsx
--- a/apps/wbs/fe-01/src/lib/theme.model.test.tsx
+++ b/apps/wbs/fe-01/src/lib/theme.model.test.tsx
@@ -280 +280 @@
-        if (hanging !== null) await hanging.close({ waitTimeoutMs: options.timeoutMs });
+        if (hanging !== null) throw new Error('unexpected cleanup corruption');
```

#### Proof f1-g

```diff
diff --git a/apps/wbs/fe-01/src/lib/theme.model.test.tsx b/apps/wbs/fe-01/src/lib/theme.model.test.tsx
--- a/apps/wbs/fe-01/src/lib/theme.model.test.tsx
+++ b/apps/wbs/fe-01/src/lib/theme.model.test.tsx
@@ -786 +786,6 @@
-  world.issued.push({ label: 'teardown retire', outcome: world.slot.retire() });
+  world.issued.push({
+    label: 'teardown retire',
+    outcome: world.slot.retire().then(() => {
+      throw new Error('unrelated teardown failure');
+    }),
+  });
```

#### Proof f2-ha

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -83 +83 @@
-  const storeNow = (): Remembered<T> | null => {
+  const resolved = ((): Remembered<T> | null => {
@@ -86 +86,2 @@
-  };
+  })();
+  const storeNow = (): Remembered<T> | null => resolved;
```

#### Proof f2-hb

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -76,0 +77 @@
+  let lastLive: Remembered<T> | null = null;
@@ -85 +86,2 @@
-    return state.status === 'live' ? state.services.preferences.json(key, isValid) : null;
+    if (state.status === 'live') lastLive = state.services.preferences.json(key, isValid);
+    return lastLive;
```

#### Proof f2-hc

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -93 +93 @@
-      if (store === null) return { value: null, persists: false };
+      if (store === null) return { value: null, persists: true };
```

#### Proof f2-hd

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -96 +96 @@
-      return { value: store.readAndDrop(), persists: true };
+      return { value: store.read(), persists: true };
```

#### Proof f2-he

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -107 +107,5 @@
-      store.write(value);
+      try {
+        store.write(value);
+      } catch {
+        return false;
+      }
```

#### Proof f2-hh

```diff
diff --git a/apps/wbs/fe-01/src/lib/remembered.ts b/apps/wbs/fe-01/src/lib/remembered.ts
--- a/apps/wbs/fe-01/src/lib/remembered.ts
+++ b/apps/wbs/fe-01/src/lib/remembered.ts
@@ -103 +103 @@
-      if (store === null) return false;
+      if (store === null) return true;
```

#### Proof f2-hf

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
--- a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
+++ b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
@@ -172 +172 @@
-        if (hanging !== null) await hanging.close({ waitTimeoutMs: options.timeoutMs });
+        if (hanging !== null) throw new Error('unexpected cleanup corruption');
```

#### Proof f2-hg

```diff
diff --git a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
--- a/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
+++ b/apps/wbs/fe-01/src/components/wbs/remembered-layout.model.test.ts
@@ -588 +588,6 @@
-  world.issued.push({ label: 'teardown retire', outcome: world.slot.retire() });
+  world.issued.push({
+    label: 'teardown retire',
+    outcome: world.slot.retire().then(() => {
+      throw new Error('unrelated teardown failure');
+    }),
+  });
```

#### Proof g-c1

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -73 +73 @@
-          const recipients = [...subscriptions];
+          const recipients = subscriptions;
```

#### Proof g-c2

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -78 +77,0 @@
-            if (!subscriptions.has(recipient)) continue;
```

#### Proof g-c3

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -65 +64,0 @@
-      if (delivering) return;
```

#### Proof g-c4

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -97 +96,0 @@
-      if (failures.length === 1) throw failures[0];
@@ -101 +99,0 @@
-      if (failures.length > 1) throw new AggregateError(failures, 'channel listeners failed');
```

#### Proof g-c5

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -87 +87 @@
-              failures.push(failure);
+              throw failure;
```

#### Proof g-c6

```diff
diff --git a/apps/wbs/fe-01/src/modules/channel.ts b/apps/wbs/fe-01/src/modules/channel.ts
--- a/apps/wbs/fe-01/src/modules/channel.ts
+++ b/apps/wbs/fe-01/src/modules/channel.ts
@@ -101 +101 @@
-      if (failures.length > 1) throw new AggregateError(failures, 'channel listeners failed');
+      if (failures.length > 1) throw failures[0];
```

#### Proof g-b1

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
@@ -41 +40,0 @@
-    if (next === busy) return;
```

#### Proof g-b2

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
@@ -45 +44,0 @@
-    busy = next;
@@ -46,0 +46 @@
+    busy = next;
```

#### Proof g-b3

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
@@ -56 +56 @@
-    lower: () => {
+    lower: () => undefined,
@@ -60,2 +59,0 @@
-      become(false);
-    },
```

#### Proof g-b4

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-writer/busy-store.ts
@@ -54 +54 @@
-      become(true);
+      become(!busy);
```

#### Proof g-d1

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -132 +132 @@
-        delivery.steps === null || sameSteps(current.steps, delivery.steps)
+        delivery.steps === null
```

#### Proof g-d2

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -127 +127 @@
-      const tree = delivery.tree ?? current.tree;
+      const tree = delivery.tree;
```

#### Proof g-d3

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -103 +102,0 @@
-    current = next;
@@ -104,0 +104 @@
+    current = next;
```

#### Proof g-d4

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -120 +120 @@
-            current.treeFailure !== null && current.treeFailure.cause === delivery.treeFailure.cause
+            current.treeFailure === delivery.treeFailure
```

#### Proof g-d5

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/delivered-plan-store.ts
@@ -138 +138 @@
-            [...delivery.steps];
+            delivery.steps;
```

#### Proof g-r1

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
@@ -58 +57,0 @@
-      if (users === current.users) return;
```

#### Proof g-r2

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
@@ -58 +58 @@
-      if (users === current.users) return;
+      if (users === current.users || !current.connected) return;
```

#### Proof g-r3

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
@@ -45 +44,0 @@
-    current = next;
@@ -46,0 +46 @@
+    current = next;
```

#### Proof g-r4

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
--- a/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
+++ b/apps/wbs/fe-01/src/modules/plan-feed/presence-store.ts
@@ -66 +66 @@
-      replace({ ...current, connected });
+      replace({ users: [], connected });
```

#### Proof i-m1

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -423 +423 @@
-      if (identity.userId === wanted?.userId) return latest;
+      if (wanted !== null) return latest;
```

#### Proof i-m2

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -423 +423 @@
-      if (identity.userId === wanted?.userId) return latest;
+      if (identity.userId === wanted?.userId && identity.credential === wanted.credential) return latest;
```

#### Proof i-m3

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
--- a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
+++ b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
@@ -52 +51,0 @@
-    if (!isActiveReader()) return;
```

#### Proof i-m4

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
--- a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
+++ b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
@@ -52 +51,0 @@
-    if (!isActiveReader()) return;
```

#### Proof i-m5

```diff
diff --git a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
--- a/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
+++ b/apps/wbs/fe-01/src/modules/directory/directory.resource.ts
@@ -144 +143,0 @@
-    if (!isActiveReader()) return Promise.resolve();
```

#### Proof i-m6

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -448,0 +449 @@
+      if (slot.snapshot().status !== 'live') return Promise.resolve();
```

#### Proof i-m7

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -224 +223,0 @@
-          await projects.leave();
```

#### Proof i-m8

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -150 +150 @@
-        isCurrent: () => isCurrent() && dependencies.isCurrent(),
+        isCurrent: dependencies.isCurrent,
```

#### Proof i-m9

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -162 +161,0 @@
-      if (!isCurrent()) return;
```

#### Proof i-m10

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -433 +433 @@
-            return state.status === 'live' && state.services === built;
+            return state.status === 'live';
```

#### Proof i-m11

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -237 +237 @@
-  return acquireTransactionally(bag, () => ({
+  return acquireTransactionally({ close: async () => undefined }, () => ({
```

#### Proof i-m12

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -385 +384,0 @@
-      refusedByRuntime.add(refusal);
```

#### Proof j-m1

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -407 +407 @@
-            return state.status === 'live' && state.services === built;
+            return state.status === 'live';
```

#### Proof j-m2

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -156 +156 @@
-              isActiveReader: isCurrent,
+              isActiveReader: () => true,
```

#### Proof j-m3

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -190 +189,0 @@
-            if (!isCurrent()) return;
```

#### Proof j-m4

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -168,0 +169 @@
+          feed.close();
```

#### Proof j-m5

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -168 +168 @@
-          feed.close();
+          void feed;
```

#### Proof j-m6

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -180 +180 @@
-            isCurrent() ? feed.owner : null,
+            feed.owner,
```

#### Proof j-m7

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -105 +105 @@
-                if (isCurrent()) presence.reportConnection(connected);
+                presence.reportConnection(connected);
```

#### Proof j-m8

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -116 +116 @@
-                if (isCurrent()) presence.reportUsers(users);
+                presence.reportUsers(users);
```

#### Proof j-m9

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -407 +407 @@
-            return state.status === 'live' && state.services === built;
+            return state.status === 'live' && state.services.projectId === projectId;
```

#### Proof j-m10

```diff
diff --git a/apps/wbs/fe-01/src/runtime/project-runtime.ts b/apps/wbs/fe-01/src/runtime/project-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/project-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/project-runtime.ts
@@ -387 +386,0 @@
-      refusedByRuntime.add(refusal);
```

#### Proof k-x1

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -457,0 +458,2 @@
+      const current = slot.snapshot();
+      if (current.status === 'live') await current.services.projects.leave();
```

#### Proof k-x2

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -224 +224 @@
-          await projects.leave();
+          void projects.leave();
```

#### Proof k-x3

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -150 +150 @@
-        isCurrent: () => isCurrent() && dependencies.isCurrent(),
+        isCurrent: dependencies.isCurrent,
```

#### Proof k-x4

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -338 +338 @@
-  const slot = createLifetimeSlot<SessionRuntime>(budgetMs);
+  const slot = createLifetimeSlot<SessionRuntime>(2 ** 31 - 1);
@@ -440 +440 @@
-            budgetMs,
+            budgetMs: 2 ** 31 - 1,
```

#### Proof k-x5

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -457,0 +458 @@
+      if (slot.snapshot().status !== 'live') return 'signed-out';
```

#### Proof k-x6

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -469 +468,0 @@
-      if (slot.snapshot().status === 'fatal') return 'fatal';
```

#### Proof k-x7

```diff
diff --git a/apps/wbs/fe-01/src/runtime/session-runtime.ts b/apps/wbs/fe-01/src/runtime/session-runtime.ts
--- a/apps/wbs/fe-01/src/runtime/session-runtime.ts
+++ b/apps/wbs/fe-01/src/runtime/session-runtime.ts
@@ -474 +474 @@
-      return wanted === null ? 'signed-out' : 'overtaken';
+      return 'signed-out';
```

### 8.4 Planner-only — the two Chromium proofs, in slice 3's commit

Section 3.4. Run on the executor's slice 3 clone before the planner commits, with the helper below;
then the planner writes the two `Proof:` comments above each spec's `expect(pageErrors).toEqual([]);`
and runs `prettier --check` on both specs. Pick a free `E2E_PORT_SHIFT` (the rehearsal used 3000:
6100, 6200, 7200; check them with `ss -ltn` first).

```sh
set -euo pipefail
cat > "$TMPDIR/chromium-faults.sh" <<'EOF'
#!/usr/bin/env bash
# Planner-only: the Chromium faults of section 8.3, each saved, applied, run, restored and compared
# before its status is asserted. Arguments: the E2E port shift, then "<id>:<spec>:<fail|pass>"...
set -euo pipefail
shift_by=$1
shift
mkdir -p "$TMPDIR/evidence" "$TMPDIR/passing"
for record in "$@"; do
  IFS=: read -r id spec expect <<< "$record"
  patch="$TMPDIR/mutations/$id.diff"
  test -f "$patch"
  mapfile -t touched < <(sed -n 's#^+++ b/##p' "$patch")
  for path in "${touched[@]}"; do
    mkdir -p "$TMPDIR/passing/$id/$(dirname "$path")"
    cp "$path" "$TMPDIR/passing/$id/$path"
  done
  cp "$patch" "$TMPDIR/evidence/$id.diff"
  git apply --unidiff-zero "$patch" < /dev/null
  if env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT CI=1 E2E_PORT_SHIFT="$shift_by" NX_DAEMON=false \
    bunx nx run wbs-fe-01:e2e --skip-nx-cache -- "e2e/$spec" > "$TMPDIR/evidence/$id.log" 2>&1 < /dev/null
  then status=0; else status=$?; fi
  for path in "${touched[@]}"; do
    cp "$TMPDIR/passing/$id/$path" "$path"
    cmp "$path" "$TMPDIR/passing/$id/$path"
  done
  if env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT CI=1 E2E_PORT_SHIFT="$shift_by" NX_DAEMON=false \
    bunx nx run wbs-fe-01:e2e --skip-nx-cache -- "e2e/$spec" > "$TMPDIR/evidence/$id-restored.log" 2>&1 < /dev/null
  then restored=0; else restored=$?; fi
  printf 'status=%s\n' "$restored" >> "$TMPDIR/evidence/$id-restored.log"
  test "$restored" -eq 0
  if [ "$expect" = fail ]; then test "$status" -ne 0; else test "$status" -eq 0; fi
  printf '%s | %s | status=%s\n' "$id" "$expect" "$status"
done
EOF
bash "$TMPDIR/chromium-faults.sh" 3000 \
  e1:browser-packages.spec.ts:fail e1c:browser-packages.spec.ts:pass \
  e2:fault-boundary.spec.ts:fail e2c:fault-boundary.spec.ts:pass | tee "$TMPDIR/evidence/chromium-loop.txt"
```

Expected, rehearsed on `83ebf251f` plus slice 3's executor comments, 2026-09-25: `e1 | fail |
status=1`, `e1c | pass | status=0`, `e2 | fail | status=1`, `e2c | pass | status=0`, exit 0. The two
failures, each `1 failed`:

- `e1`: `browser-packages.spec.ts:53`, `- Array []` against `+ "TypeError: he.isPromise is not a
function",`; every other assertion of the spec had its proof, because the microtask runs after the
  global was assigned.
- `e2`: `fault-boundary.spec.ts:76`, `+ "TypeError: ge.isPromise is not a function",`; the fault
  boundary still disclosed its public report.

The minified name (`he`, `ge`) is Vite's and may differ; the fact is a `TypeError` naming
`isPromise` in `pageErrors`, and the twin passing.

#### Proof e1

```diff
diff --git a/apps/wbs/fe-01/e2e/browser-packages-probe.ts b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
--- a/apps/wbs/fe-01/e2e/browser-packages-probe.ts
+++ b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
@@ -0,0 +1,1 @@
+import * as nodeTypes from 'node:util/types';
@@ -87,0 +89,1 @@
+queueMicrotask(() => nodeTypes.isPromise(null));
```

#### Proof e1c

```diff
diff --git a/apps/wbs/fe-01/e2e/browser-packages-probe.ts b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
--- a/apps/wbs/fe-01/e2e/browser-packages-probe.ts
+++ b/apps/wbs/fe-01/e2e/browser-packages-probe.ts
@@ -0,0 +1,1 @@
+import * as nodeTypes from 'node:util/types';
@@ -87,0 +89,1 @@
+queueMicrotask(() => nodeTypes.isPromise(null));
diff --git a/apps/wbs/fe-01/e2e/browser-packages.spec.ts b/apps/wbs/fe-01/e2e/browser-packages.spec.ts
--- a/apps/wbs/fe-01/e2e/browser-packages.spec.ts
+++ b/apps/wbs/fe-01/e2e/browser-packages.spec.ts
@@ -53,1 +53,1 @@
-  expect(pageErrors).toEqual([]);
+  expect(pageErrors).toBeInstanceOf(Array);
```

#### Proof e2

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts b/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts
--- a/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts
+++ b/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts
@@ -0,0 +1,1 @@
+import * as nodeTypes from 'node:util/types';
@@ -124,0 +126,1 @@
+queueMicrotask(() => nodeTypes.isPromise(null));
```

#### Proof e2c

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts b/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts
--- a/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts
+++ b/apps/wbs/fe-01/src/components/chrome/fault-disclosure.ts
@@ -0,0 +1,1 @@
+import * as nodeTypes from 'node:util/types';
@@ -124,0 +126,1 @@
+queueMicrotask(() => nodeTypes.isPromise(null));
diff --git a/apps/wbs/fe-01/e2e/fault-boundary.spec.ts b/apps/wbs/fe-01/e2e/fault-boundary.spec.ts
--- a/apps/wbs/fe-01/e2e/fault-boundary.spec.ts
+++ b/apps/wbs/fe-01/e2e/fault-boundary.spec.ts
@@ -76,1 +76,1 @@
-  expect(pageErrors).toEqual([]);
+  expect(pageErrors).toBeInstanceOf(Array);
```

## 9. Verification

### 9.1 Every fenced diff applies after the codemod, extracted from this document, in slice order

The requirement: these diffs, as this committed document spells them, applied in slice order around
a real run of the codemod, produce the rehearsal's final tree, and every fault patch applies to the
tree its slice leaves — on the base, on that base with the executors' own output varied, **and on
the real dispatch base**. Three modes:

- `fill=0` — the base `e93a564a0`; `.openspec.yaml` written as the command wrote it on 2026-09-25.
  After slice 2 the content hash must be slice 2 step 8's; the final result must equal the
  rehearsal's final commit byte for byte, except the five files that carry slice 3's `Proof:`
  comments (three the executor's, two the planner's), which must equal it once every `//` comment
  and blank line is stripped and whitespace squeezed.
- `fill=1` — the base with every executor-written text varied: `.openspec.yaml` dated another day,
  a simulated two-line `// Proof:` comment above each of slice 3's six sites (so later patches meet an
  unknown comment length), and a simulated entry appended to `verify.md` after each slice. The hash
  and every later diff and fault patch must still hold.
- `fill=real` — the base named by `REAL_BASE`: planning plus this plan branch's commits. The result
  must change exactly the paths the rehearsal changed; every TypeScript file must equal the
  rehearsal's final one once comments and blank lines are stripped; the five records another packet
  may also edit — `package.json`, `bun.lock`, the adoption plan and `adopt-di-composition`'s design
  and spec — must carry exactly this packet's delta; and every other path must equal the
  rehearsal's bytes. The content hash is printed, not asserted: a base that moved one of the 82
  paths gives another hash, and that is a re-rehearsal, not a waiver. Unset, the mode prints that it
  was skipped and proves nothing. **Its output is the dispatch evidence.**

Unlike a pure-diff packet this one needs a Bun install per mode — the codemod reads the 0.4.0 types
— and the Bun cache must hold `di-bag` 0.4.0 and 0.5.0 and `di-bag-codemod` 0.1.0 (it does on any
host that ran slice 2 or this script once). Each mode takes about three minutes.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-25-batch-7/140-3-di-bag-migration.md
base=e93a564a09c856d8bc2b2c5aa64a588855a3c2f2
final=9c364d0c8b96dea303880b00890ca50707b173d3
tree_hash=e80d38d714be97fc5b698cfeb6fb16fddc7eff44aa6c5567b877166a828c4f46
real_base=${REAL_BASE:-}
test -f "$packet"
proof_files="apps/wbs/fe-01/src/runtime/application-runtime.ts
  apps/wbs/fe-01/browser-packages.test.ts
  tools/tool-devsync/src/toolchain-pins.test.ts
  apps/wbs/fe-01/e2e/browser-packages.spec.ts
  apps/wbs/fe-01/e2e/fault-boundary.spec.ts"
# Inserts a two-line comment above the one line whose trimmed text is exactly $2.
fill_above() {
  file=$1
  test -f "$file"
  test "$(ANCHOR=$2 awk '{ t = $0; sub(/^ +/, "", t) } t == ENVIRON["ANCHOR"] { n++ } END { print n + 0 }' "$file")" -eq 1
  ANCHOR=$2 awk '
    BEGIN { a = ENVIRON["ANCHOR"] }
    { t = $0; sub(/^ +/, "", t) }
    t == a {
      match($0, /^ */); ind = substr($0, 1, RLENGTH)
      print ind "// Proof: simulated, standing where an executor writes one; the words are"
      print ind "// not knowable from here."
    }
    { print }
  ' "$file" > "$file.filled"
  mv "$file.filled" "$file"
}
append_entry() {
  printf '\n## Packet 140.3, slice %s — simulated\n\nObserved 2026-10-01.\n' "$1" \
    >> "$work/tree/openspec/changes/migrate-di-bag/verify.md"
}
ids_of() {
  awk -v want="### $1 " '
    index($0, want) == 1 { s=1; next }
    s && /^```text$/ { c=1; next }
    c && /^```$/ { exit }
    c { print }
  ' "$packet" | awk 'NR % 6 == 1'
}
check_faults() {
  for id in "$@"; do git -C "$work/tree" apply --unidiff-zero --check "$work/mutations/$id.diff"; done
}
apply_patch() {
  git -C "$work/tree" apply --check "$work/patches/$1.diff"
  git -C "$work/tree" apply "$work/patches/$1.diff"
}
code_of() { sed -e 's#[[:space:]]*//.*$##' -e '/^[[:space:]]*$/d' "$1" | tr -s '[:space:]' ' '; }
delta_of() {
  if diff -U0 "$1" "$2" > "$work/delta.d"; then :; else test $? -eq 1; fi
  sed -n -e '/^---/d' -e '/^+++/d' -e '/^[-+]/p' "$work/delta.d"
}
for fill in 0 1 real; do
  from=$base
  if [ "$fill" = real ]; then
    if [ -z "$real_base" ]; then echo "fill=real skipped: REAL_BASE unset, not dispatch evidence"; continue; fi
    from=$real_base
  fi
  work=$(mktemp -d "${TMPDIR:?}/extract-XXXXXX")
  mkdir -p "$work/patches" "$work/mutations" "$work/tree" "$work/final" "$work/evidence"
  awk -v out="$work/patches" '
    /^## 7\. The code$/ { inside=1; next }
    /^## 8\. Proofs$/   { inside=0 }
    inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print > f }
  ' "$packet"
  test "$(find "$work/patches" -name '*.diff' | wc -l)" -eq 7
  awk -v out="$work/mutations" '
    /^## 8\. Proofs$/ { inside=1; next }
    /^## 9\. Verification$/ { inside=0 }
    inside && /^#### Proof / { id=$3; next }
    inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print > f }
  ' "$packet"
  test "$(find "$work/mutations" -name '*.diff' | wc -l)" -eq 169
  echo "fill=$fill extracted 7 patches, 169 fault patches"
  git archive "$from" | tar -x -C "$work/tree"
  git -C "$work/tree" init -q
  git -C "$work/tree" add -A
  git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
  # Slice 1: the command's file, then 01.
  change="$work/tree/openspec/changes/migrate-di-bag"
  test ! -e "$change"
  mkdir -p "$change"
  day=2026-09-25
  if [ "$fill" = 1 ]; then day=2026-10-01; fi
  printf 'schema: sdd-lean\ncreated: %s\n' "$day" > "$change/.openspec.yaml"
  apply_patch 01
  if [ "$fill" = 1 ]; then append_entry 1; fi
  echo "fill=$fill slice 1 applied"
  # Slice 2: the codemod, 02, the install, Prettier over the codemod's paths, 03, 04.
  # Committed before the first install, which is what installs the repository's Git hooks.
  git -C "$work/tree" add -A
  git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm slice-1
  (cd "$work/tree" && env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bun install --frozen-lockfile) \
    > "$work/evidence/install-base.log" 2>&1
  grep -q '"version": "0.4.0"' "$work/tree/node_modules/di-bag/package.json"
  for project in \
    libs/wbs/application/core/tsconfig.spec.json libs/wbs/application/core/tsconfig.lib.json \
    apps/wbs/be-01/tsconfig.spec.json apps/wbs/be-01/tsconfig.lib.json \
    apps/wbs/fe-01/tsconfig.spec.json apps/wbs/fe-01/tsconfig.app.json \
    apps/wbs/fe-01/tsconfig.e2e.json tools/tool-devsync/tsconfig.spec.json; do
    (cd "$work/tree" && env -u CLAUDECODE -u AGENT bunx di-bag-codemod@0.1.0 --project "$project" --write) \
      > "$work/evidence/codemod.log" 2>&1 < /dev/null
  done
  git -C "$work/tree" status --porcelain --untracked-files=all | cut -c4- | sort > "$work/codemod-paths.txt"
  test "$(wc -l < "$work/codemod-paths.txt")" -eq 77
  sha256sum < "$work/codemod-paths.txt" | grep -q '^900a70bbaf29c7a62721a11c29eaa082c73cc0c5d896e5ba2e0b9dcc32471590 '
  apply_patch 02
  (cd "$work/tree" && env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bun install --frozen-lockfile) \
    > "$work/evidence/install-moved.log" 2>&1
  grep -q '"version": "0.5.0"' "$work/tree/node_modules/di-bag/package.json"
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  (cd "$work/tree" && env -u CLAUDECODE -u AGENT GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$work/codemod-paths.txt")) \
    > "$work/evidence/prettier.log" 2>&1
  apply_patch 03
  apply_patch 04
  git -C "$work/tree" diff --name-only HEAD | sort > "$work/owned.txt"
  test "$(wc -l < "$work/owned.txt")" -eq 82
  hash=$(cd "$work/tree" && while IFS= read -r path; do sha256sum "$path"; done < "$work/owned.txt" | sha256sum)
  if [ "$fill" != real ]; then test "$hash" = "$tree_hash  -"; fi
  echo "fill=$fill slice 2 applied, 82 owned paths, content hash ${hash%% *}"
  if [ "$fill" = 1 ]; then append_entry 2; fi
  # shellcheck disable=SC2046
  check_faults $(ids_of 8.1) e1 e1c e2 e2c
  echo "fill=$fill slice 3's 10 fault patches and the planner's 4 check"
  # Slice 3: the executor's and the planner's comments, then 05.
  if [ "$fill" = 1 ]; then
    fill_above "$work/tree/apps/wbs/fe-01/src/runtime/application-runtime.ts" 'close: (options) => graph.close({ waitTimeoutMs: options.timeoutMs }),'
    fill_above "$work/tree/apps/wbs/fe-01/src/runtime/application-runtime.ts" 'graph.close({ waitTimeoutMs: options.timeoutMs }),'
    fill_above "$work/tree/apps/wbs/fe-01/browser-packages.test.ts" 'expect((await theBundle()).externalizedForBrowser).toEqual([]);'
    fill_above "$work/tree/tools/tool-devsync/src/toolchain-pins.test.ts" 'expect(pinned).toEqual({ ...OWNER_PACKAGES });'
    fill_above "$work/tree/apps/wbs/fe-01/e2e/browser-packages.spec.ts" 'expect(pageErrors).toEqual([]);'
    fill_above "$work/tree/apps/wbs/fe-01/e2e/fault-boundary.spec.ts" 'expect(pageErrors).toEqual([]);'
    test "$(grep -rc 'Proof: simulated' "$work/tree/apps" "$work/tree/tools" | awk -F: '{ s += $2 } END { print s }')" -eq 6
  fi
  apply_patch 05
  if [ "$fill" = 1 ]; then append_entry 3; fi
  # shellcheck disable=SC2046
  check_faults $(ids_of 8.2)
  echo "fill=$fill slice 3 applied, slice 4's $(ids_of 8.2 | wc -l) fault patches check"
  apply_patch 06
  if [ "$fill" = 1 ]; then append_entry 4; fi
  # shellcheck disable=SC2046
  check_faults $(ids_of 8.3)
  echo "fill=$fill slice 4 applied, slice 5's $(ids_of 8.3 | wc -l) fault patches check"
  apply_patch 07
  if [ "$fill" = 1 ]; then append_entry 5; fi
  echo "fill=$fill slice 5 applied"
  git -C "$work/tree" diff --name-only "$(git -C "$work/tree" rev-list --max-parents=0 HEAD)" | sort > "$work/changed-tracked.txt"
  git -C "$work/tree" status --porcelain --untracked-files=all | cut -c4- | sort > "$work/changed.txt"
  cat "$work/changed-tracked.txt" "$work/changed.txt" | sort -u > "$work/changed-all.txt"
  wc -l < "$work/changed-all.txt"
  git archive "$final" | tar -x -C "$work/final"
  if [ "$fill" = 0 ]; then
    for f in $proof_files; do
      test "$(code_of "$work/tree/$f")" = "$(code_of "$work/final/$f")"
      cp "$work/final/$f" "$work/tree/$f"
    done
    diff -r --exclude=.git --exclude=node_modules "$work/tree" "$work/final"
    echo "fill=0 tree identical to $final, the five Proof-site files modulo comments"
  elif [ "$fill" = 1 ]; then
    echo "fill=1 simulated comments left: $(grep -rc 'Proof: simulated' "$work/tree/apps" "$work/tree/tools" | awk -F: '{ s += $2 } END { print s }')"
  else
    # Three files change only by slice 3's comments, which no diff carries.
    git diff --name-only "$base" "$final" | sort > "$work/rehearsed-all.txt"
    printf '%s\n' apps/wbs/fe-01/browser-packages.test.ts apps/wbs/fe-01/e2e/browser-packages.spec.ts \
      apps/wbs/fe-01/e2e/fault-boundary.spec.ts | sort > "$work/comment-only.txt"
    comm -23 "$work/rehearsed-all.txt" "$work/comment-only.txt" > "$work/owned-all.txt"
    test "$(wc -l < "$work/owned-all.txt")" -eq 89
    diff "$work/owned-all.txt" "$work/changed-all.txt"
    echo "fill=real changed exactly the $(wc -l < "$work/owned-all.txt") paths the rehearsal changed"
    while read -r f; do
      case "$f" in
        package.json | bun.lock | docs/superpowers/plans/2026-09-17-personal-package-adoption.md | \
          openspec/changes/adopt-di-composition/design.md | openspec/changes/adopt-di-composition/specs/di-composition/spec.md)
          git show "$base:$f" > "$work/authored"
          git show "$real_base:$f" > "$work/real"
          mine=$(delta_of "$work/authored" "$work/final/$f")
          landed=$(delta_of "$work/real" "$work/tree/$f")
          test -n "$mine"
          test "$landed" = "$mine"
          ;;
        openspec/changes/migrate-di-bag/.openspec.yaml) ;;
        *.ts | *.tsx) test "$(code_of "$work/tree/$f")" = "$(code_of "$work/final/$f")" ;;
        *) cmp "$work/tree/$f" "$work/final/$f" ;;
      esac
    done < "$work/owned-all.txt"
    echo "fill=real every owned path equals the rehearsal's: code modulo comments, records by delta"
  fi
done
````

Observed on 2026-09-25, after the final Prettier `--check` of this document, with the packet read
from this working tree and `REAL_BASE=e93a564a0`, the same base — so `fill=real` here proves the
mode's own checks, not the dispatch base; the planner reruns it on the reviewed base:

```text
fill=0 extracted 7 patches, 169 fault patches
fill=0 slice 1 applied
fill=0 slice 2 applied, 82 owned paths, content hash e80d38d714be97fc5b698cfeb6fb16fddc7eff44aa6c5567b877166a828c4f46
fill=0 slice 3's 10 fault patches and the planner's 4 check
fill=0 slice 3 applied, slice 4's 81 patches, including six planner-owned boot patches check
fill=0 slice 4 applied, slice 5's 74 fault patches check
fill=0 slice 5 applied
89
fill=0 tree identical to 9c364d0c8b96dea303880b00890ca50707b173d3, the five Proof-site files modulo comments
fill=1 extracted 7 patches, 169 fault patches
fill=1 slice 1 applied
fill=1 slice 2 applied, 82 owned paths, content hash e80d38d714be97fc5b698cfeb6fb16fddc7eff44aa6c5567b877166a828c4f46
fill=1 slice 3's 10 fault patches and the planner's 4 check
fill=1 slice 3 applied, slice 4's 81 patches, including six planner-owned boot patches check
fill=1 slice 4 applied, slice 5's 74 fault patches check
fill=1 slice 5 applied
92
fill=1 simulated comments left: 6
fill=real extracted 7 patches, 169 fault patches
fill=real slice 1 applied
fill=real slice 2 applied, 82 owned paths, content hash e80d38d714be97fc5b698cfeb6fb16fddc7eff44aa6c5567b877166a828c4f46
fill=real slice 3's 10 fault patches and the planner's 4 check
fill=real slice 3 applied, slice 4's 81 patches, including six planner-owned boot patches check
fill=real slice 4 applied, slice 5's 74 fault patches check
fill=real slice 5 applied
89
fill=real changed exactly the 89 paths the rehearsal changed
fill=real every owned path equals the rehearsal's: code modulo comments, records by delta
rc=0
```

The number printed after slice 5 is the paths changed against the base: 89 in `fill=0`, 92 in `fill=1` (three simulated verification entries), and 89 in `fill=real`. `git apply
--check` prints nothing on success, which is why the script's own `echo` lines are the evidence.

### 9.2 The strict OpenSpec block, reproduced

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
report=$(mktemp "$TMPDIR/evidence/openspec-validation.XXXXXX.json")
env -u CLAUDECODE -u AGENT OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

Rehearsed: `{"items":115,"passed":115,"failed":0}` on the base, `{"items":116,"passed":116,"failed":0}`
after each slice.

### 9.3 Commands actually run, and what each reported

All on 2026-09-25, by this packet's author, in a scratch clone of `e93a564a0` with its own
`bun install --frozen-lockfile`, each slice committed on `rehearse/140-3-r1` with the hooks on
(lefthook's tool-wiki, secrets, format and lint passed): `a0f8b9cef` (slice 1), `83ebf251f` (slice 2), `709f4346b` (slice 3), `fcb45dbf5` (slice 4), `9c364d0c8` (slice 5). Slice 2's red was the
slice-1 commit plus the codemod, 7.2, the install, Prettier and 7.3; its green 7.4 on top. Slice 3's
faults ran on slice 2's commit, slice 4's on slice 3's, slice 5's on slice 4's.

| Check                                                                        | Base `e93a564a0` | After slice 1 | Slice 2 red                                            | After slice 2                     | After slices 3–5     |
| ---------------------------------------------------------------------------- | ---------------- | ------------- | ------------------------------------------------------ | --------------------------------- | -------------------- |
| strict OpenSpec (items · passed · failed)                                    | 115 · 115 · 0    | 116 · 116 · 0 | —                                                      | 116 · 116 · 0                     | 116 · 116 · 0        |
| devsync pins + labels                                                        | 25 pass          | 25            | 25                                                     | 25                                | 25                   |
| `wbs-core` (`bun test ./src`)                                                | 626 pass         | 626           | 626                                                    | 626                               | 626                  |
| backend modules + boot + entrypoint                                          | 61 pass          | 61            | 61                                                     | 61                                | 61                   |
| frontend focused (25 files)                                                  | 25 · 222         | same          | 14 failed \| 11 passed · 94 failed \| 130 passed (224) | 25 · 224                          | 25 · 224             |
| typecheck, 4 projects                                                        | 0                | —             | 1: seven TS2345 in four runtime files                  | 0                                 | 0                    |
| lint, 4 projects; `wbs-fe-01:typecheck:module`                               | —                | —             | —                                                      | 0 · 0                             | 0 (slice 3)          |
| content hash of the 82 owned paths                                           | —                | —             | —                                                      | `e80d38d7…`, twice, in two clones | —                    |
| registry probe: Bun · `tsc` 7.0.2 · `tsc6` 6.0.3                             | —                | —             | —                                                      | 0 · 0 · 0                         | —                    |
| the eleven model tests at their seeds                                        | —                | —             | —                                                      | —                                 | 11 · 12 passed       |
| slice 3 faults (10) · offline slice 4 (75) · planner boot (6) · slice 5 (74) | —                | —             | —                                                      | —                                 | all as tabled        |
| Chromium faults `e1`, `e1c`, `e2`, `e2c`                                     | —                | —             | —                                                      | —                                 | 1 · 0 · 1 · 0        |
| model sabotages on the base with 0.4.0 (69 comparable)                       | same run numbers | —             | —                                                      | —                                 | —                    |
| Planner-only `tool-devsync:test`                                             | —                | —             | —                                                      | 372 pass, 0 fail                  | 372 pass, 0 fail     |
| Planner-only `wbs-core` + `wbs-be-01` whole targets                          | —                | —             | —                                                      | —                                 | status 0             |
| Planner-only `wbs-fe-01:test` / `test:unit`                                  | —                | —             | —                                                      | —                                 | 3,107 + 3 / 739 pass |
| Planner-only selected Chromium E2E                                           | —                | —             | —                                                      | —                                 | 3 pass               |
| Planner-only `nx format:check --all`                                         | —                | —             | —                                                      | —                                 | status 0             |

**The codemod is deterministic.** It was run in two fresh clones of the base, each with its own
install: the eight summary lines, the 77 paths and every byte after Prettier were identical, and the
second clone, taken through 7.2–7.4 from the extracted diffs, equalled the first clone's slice 2
commit (`git diff --quiet` exit 0) with content hash `e80d38d7…`.

The planner-only runs in the rehearsal clone are recorded in `planner.txt`: `tool-devsync:test`
reported 372 pass and 0 fail; the two whole backend/core targets exited 0; `wbs-fe-01:test`
reported 148 files and 3,107 tests plus 2 files and 3 Bun-spawn tests; `test:unit` reported 59
files and 739 tests; the selected Chromium run reported 3 passed; and `nx format:check --all`
exited 0. These are rehearsal observations, not claims that the later integration commit passed.
The full h2puni gate and the index check after each executor commit remain planner checks (section
9.4).

### 9.4 Planner-only, with the expected relative delta

The backend boot file binds a port. After slice 4's offline records and before its commit, the
planner runs the boot baseline and the six boot faults in the same installed clone with network
permission. The six records are kept here, outside the executor's `proofs.txt`:

```sh
set -euo pipefail
bash "$TMPDIR/run-check.sh" planner-boot-baseline env -u CLAUDECODE -u AGENT bash -c \
  'cd apps/wbs/be-01 && bun test ./src/boot.db.test.ts'
bash "$TMPDIR/expect-status.sh" planner-boot-baseline 0
cat > "$TMPDIR/boot-proofs.txt" <<'EOF'
bs1
fail
bun
apps/wbs/be-01
src/boot.db.test.ts
releases the source when the port it was given is already taken
bs2
fail
bun
apps/wbs/be-01
src/boot.db.test.ts
refuses to report a clean stop when a release is refused
bs3
fail
bun
apps/wbs/be-01
src/boot.db.test.ts
refuses to report a clean stop when a release is refused
bs4
fail
bun
apps/wbs/be-01
src/boot.db.test.ts
starts the retention timer
bs5
fail
bun
apps/wbs/be-01
src/boot.db.test.ts
releases the source and the port when a step after the listener fails
bs6
fail
bun
apps/wbs/be-01
src/boot.db.test.ts
stops accepting before it closes the source it opened
EOF
test "$(( $(wc -l < "$TMPDIR/boot-proofs.txt") / 6 ))" -eq 6
bash "$TMPDIR/fault-loop.sh" "$TMPDIR/boot-proofs.txt" | tee "$TMPDIR/evidence/planner-boot-fault-loop.txt"
bash "$TMPDIR/run-check.sh" planner-boot-restored env -u CLAUDECODE -u AGENT bash -c \
  'cd apps/wbs/be-01 && bun test ./src/boot.db.test.ts'
bash "$TMPDIR/expect-status.sh" planner-boot-restored 0
```

Observed rehearsal values: baseline and restored file `25 pass`, `0 fail`; `bs1` `18 pass`,
`7 fail`; `bs2` `24 pass`, `1 fail`; `bs3` `20 pass`, `5 fail`; `bs4`, `bs5`, and `bs6`
each `24 pass`, `1 fail`. The loop requires every fault to exit 1 and its named test to fail,
then requires a separate green restored run for each fault. Planner records these seven statuses
in `verify.md` before slice 4 is committed.

| Check                                                                                                                                    | Why the planner's                                           | Expected                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Section 9.4 boot baseline and `bs1`–`bs6`, before the slice 4 commit                                                                     | Port binding needs network permission                       | Baseline `25 pass`; failures and restored greens as recorded above                                     |
| Section 8.4, the four Chromium faults, on the executor's slice 3 clone, then the two `Proof:` comments                                   | Chromium                                                    | `e1` and `e2` fail on `pageErrors` with a `TypeError` naming `isPromise`; `e1c`, `e2c` pass            |
| `env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`, after each slice's commit                    | Its namespacing test writes Git objects                     | Base count, unchanged after every slice; rehearsed `372 pass`, `0 fail` on the base, slice 2 and final |
| `env -u CLAUDECODE -u AGENT bun apps/wiki/cli/src/cli.ts check-indexes committed . <commit>` after each commit                           | Writes Git objects (batch-7 addendum, point 3)              | exit 0; no module index is touched                                                                     |
| `env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx run-many -t test -p wbs-core wbs-be-01 --skip-nx-cache`                              | Whole targets, outside the focused files                    | exit 0                                                                                                 |
| `wbs-fe-01:test` and `wbs-fe-01:test:unit`, `--skip-nx-cache`                                                                            | Three tests spawn `bun` from Node                           | exit 0; test count base + 2                                                                            |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AGENT CI=1 E2E_PORT_SHIFT=<n> NX_DAEMON=false bunx nx run wbs-fe-01:e2e --skip-nx-cache` | Chromium; the lifetime and fault probes bundle di-bag 0.5.0 | exit 0                                                                                                 |
| `env -u CLAUDECODE -u AGENT NX_DAEMON=false bunx nx format:check --all`                                                                  | Repository-wide                                             | exit 0                                                                                                 |
| `bin/h2puni-gate.sh <sha>` on the batch's integration commit                                                                             | The host gate; it installs from the new lockfile            | exit 0                                                                                                 |

**Never install through a linked `node_modules`: it is shared with other lanes.** Run the planner
checks in the executor's clone, which has its own install. A worktree whose `node_modules` still
links to a 0.4.0 install fails the pins test's manifest case and every module test on 0.5.0 names:
that is the install, not a regression.

### 9.5 What none of this proves

- That the dev and prod deploys install the new tree: the dev poller restarts on a lockfile change,
  and prod builds images from the lockfile; neither is run.
- That any log query outside this repository keyed on `DI_BAG_MISSING_REGISTRATION` or
  `DiBagCleanupError` still matches; none is known here.
- That a module's label agrees with its README beyond what the unchanged label check proves: its
  known limit stands (section 1.1).
- That a fault this packet classifies as the repository's own (section 8.2's "what is out") behaves
  the same on 0.5.0 other than through the green suites that carry it.

## 10. Stop conditions

1. Step 0a's hash differs, or `status-before.txt` is not empty.
2. `openspec/changes/migrate-di-bag` exists before slice 1.
3. `node_modules/di-bag` is not 0.4.0 at slice 2 step 1, or not 0.5.0 after slice 2 step 5 or at
   the start of slices 3 to 5 (after the one permitted offline reinstall).
4. The registry's `latest` for `di-bag` or `di-bag-codemod` differs from 0.5.0 / 0.1.0, or 0.5.0
   declares any dependency, peer or engine (slice 2 step 2).
5. The codemod's eight summary lines, its 77 paths or their hash differ (slice 2 step 4), or any path
   it touched is not a plain modification.
6. `bun install --frozen-lockfile` exits non-zero or rewrites `package.json` or `bun.lock`.
7. `git apply --check` refuses 7.3 or 7.4.
8. A red fact of slice 2 step 7 differs — a frontend `status=0`, a typecheck that passes, a
   diagnostic outside the four named files, no `invalid close options` line, or devsync, core or
   backend red.
9. The content hash or the owned-path list of slice 2 step 8 differs.
10. A green suite's count differs from its N (plus 2 tests for the frontend), the probe prints fewer
    than eleven `ok` lines, or either compiler reports anything.
11. A `fail` record passes after the second try (preamble rule 20), or a `pass` twin **fails**
    (then another clause catches the fault, and the proof is not this clause's).
12. A model property passes under its sabotage (slice 5 step 2).
13. A file outside the slice's owned list changes, `cmp` reports a difference after a restore, or
    the hand-over `diff` prints anything.
14. Lint or typecheck fails on anything but an autofixable import-order or Prettier finding — and in
    slice 2 even those are a stop, because the hash would move.

## 11. Out of lane

Every path not in section 5. In particular: `application-exception` and
`caught-object-report-json`'s pins; the lifetime slot's, `RetirableRuntime`'s and
`PartialAcquisitionError`'s own `timeoutMs`; every historical `Proof:` comment (section 1.2);
`apps/wiki/**` and `docs/wiki-policy/**` (the suite directory move's lane); historical packets under
`docs/superpowers/plans/2026-09-*`; `openspec/changes/backend-startup-ownership/**`.

## 12. Hand-over to the next packet

- **WBS 040.13** (label surface) stays open. What closes it is a di-bag release whose `Module`
  exposes its label, or a documented, type-distinguishable marker on private bindings a
  slash-containing key cannot forge (packet D's route 1). The two forgeries of section 1.1 are its
  acceptance tests. The planner raises a possible 0.5.1 with Dany.
- **The next di-bag migration** reruns this packet's codemod pattern if the library ships one, and
  section 8's records against the new version: the fault patches are `--unidiff-zero` and
  re-expressible with the same conversion.
- **i-m4's recorded run** in `adopt-frontend-lifetimes/verify.md` (1) predates packet 050.7k's
  changes to the session owner; this packet's `verify.md` records the current run (2).

## 13. Assumptions recorded rather than asked

- **The lifetime contract keeps `timeoutMs`** (section 3.3); one translation in
  `acquireTransactionally`, proved by two tests and their faults.
- **Historical `Proof:` comments keep their 0.4.0 wording** (section 1.2).
- **`di-composition`'s requirement text is respelled in place** (`label` → `moduleLabel`,
  `inspectGraph()` → `graphSnapshot()`), with a dated design sentence, rather than MODIFIED by this
  change: the requirement's meaning is unchanged, and a second change owning it would collide at
  archive.
- **`backend-startup-ownership/design.md`** keeps `DiBag.withDisposal` in its historical reasoning.
- **The fault scope of section 8.2** is the faults whose outcome the library decides; the rest are
  carried by the green suites (section 8.2's "what is out").
- **No ADR, no CONTEXT.md term** (section 3.5).
- **The OpenSpec change's `.openspec.yaml` date is the executor's**; section 9.1 accepts any.
- **Rehearsal commits carry no `verify.md` entries**; the executors write theirs, and section 9.1's
  `fill=1` shows the diffs apply over them.

## 14. The brief, point by point

- **Batch-3 brief:** exact code as diffs around one deterministic, hash-checked codemod run; slices
  each finishable in one attempt (slice 2 is the largest, mostly waiting on four suites twice);
  red and green rehearsed; counts relative; every fault observed with its diagnostic;
  planner-only checks named; Prettier twice on this file; no absolute paths outside the Dispatch
  block.
- **Batch-6 addendum:** the red is rehearsed on the unchanged transaction (1); prescribed tests pass
  typecheck and lint (2); hand-over lists scoped to owned paths (3); every verification keeps its
  exit status (4); no staged rename (5); `bun test ./dir` paths (14); the fast-check model tests
  rerun at their seeds and every recorded sabotage rerun (15, 16); grep checks gated (19).
- **Batch-7 addendum:** Codex gpt-6-sol medium executor in a workspace-write sandbox and the `env -u` forms (1); each new clause its own negative,
  the clause-disabled twins `t1c`, `t2c`, `b1c`, `p1c`, `e1c`, `e2c` (2); index checks the planner's
  (3); `>` in every extraction (4); observed dates are the executor's and `fill=1` varies them (5);
  the pin moves here, as the planner allowed for this item (6); base named (8).

## 15. Ready to commit

| Slice | Subject                                                                                     | Paths |
| ----- | ------------------------------------------------------------------------------------------- | ----- |
| 1     | `docs(openspec): intent and spec for moving di-bag to 0.5.0`                                | 5     |
| 2     | `build(deps): move di-bag to 0.5.0 through its codemod and a residual edit`                 | 83    |
| 3     | `test(runtime): prove the close budget reaches di-bag and the browser entry holds on 0.5.0` | 5 + 2 |
| 4     | `docs(plans): record the di-bag move and observe its recorded faults again on 0.5.0`        | 5     |
| 5     | `test(frontend): observe every model sabotage again on di-bag 0.5.0`                        | 2     |

## 16. Planner decisions of 2026-09-25, disposed

The author stopped before writing this packet and reported that 0.5.0 exposes no module label
(section 1.1). The planner's five decisions, and where each is applied:

| Decision                                                                                                                                                                                                                                           | Applied in                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Take the label check (040.13) out; record the private `WeakMap`, the write-only `moduleLabel` and the two indistinguishable forgeries                                                                                                           | Section 1.1 (the evidence), 1.2, 12; the check's JSDoc (7.3) and the design sentence (7.6) name 040.13                                                                                                                                                        |
| 2. The executor runs the pinned codemod with the author's exact arguments, network for the registry only, then a fenced residual; a content hash must equal the rehearsal's; record the codemod's report and its 62 items                          | `codemod.sh` (step 0b), slice 2 steps 4–8; section 3.2 (the 62 items and each resolution); the eight reports kept as evidence; the hash is SHA-256 over sorted paths, no Git objects                                                                          |
| 3. Pin, codemod output and residual in one slice, one green commit; proofs after                                                                                                                                                                   | Slice 2; slices 3–5                                                                                                                                                                                                                                           |
| 4. New faults for the three `di-bag/node` proofs, each with a clause-isolating twin; Chromium the planner's, observed by the author; every model test at its seed and every recorded sabotage with its run number; the `@ts-expect-error` fixtures | `b1`/`b1c` (slice 3), `e1`/`e1c`, `e2`/`e2c` (section 8.4, observed by the author in Chromium); slice 5 and section 8.3 (74 sabotages, run numbers, and the same patches on 0.4.0); `ts1`, `ts2` and the finding that no `check.ts` carries one (section 4.1) |
| 5. A new `sdd-lean` change, `migrate-di-bag`                                                                                                                                                                                                       | Section 3.5, 7.1                                                                                                                                                                                                                                              |

## 17. Review 1 dispositions

- Critical 1: Dispatch selects Codex gpt-6-sol medium in a workspace-write sandbox; only slice 2 requests network.
- Critical 2: the socket-using boot baseline and `bs1`–`bs6` run at the planner checkpoint in §9.4; offline suites and records exclude them.
- Important 1: §2 names the existing frontend lifetime proposal and specification.
- Important 2: the budget helper throws every unrelated refusal and returns only the DI Bag wait budget; `t3` and `t3c` observe the numeric bypass and its clause-isolating twin.
- Important 3: both fault helpers preserve applied patches in `evidence` and require separate restored-green logs.
- Minor 1: inventory states 81 slice 4 patches, 20 `partial.build()` calls, and 14 test-file plus one probe closes.
- Minor 2: §9.4 invokes the index check through the Bun wiki CLI.
