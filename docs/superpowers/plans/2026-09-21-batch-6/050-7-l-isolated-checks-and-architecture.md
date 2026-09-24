# 050.7 l — isolated module checks, wiki indexes, and the architecture checks

|             |                                                                                                                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Work item   | 050.7 "Three lifetimes with DI Bag and the runtime owner: application, session, project" — **sixteenth packet**                                                                                                                                                                      |
| Size class  | M — three slices, each one executor attempt                                                                                                                                                                                                                                          |
| Predecessor | 050.7k (`050-7-k-log-out.md`, beside this packet once it lands), itself after 050.7i (`050-7-i-session-runtime.md`). Neither has landed; both touch files this packet only reads, and section 9.1 proves every hunk here against their comment sites.                                |
| Advances    | OpenSpec tasks **12** and **13** of `adopt-frontend-lifetimes` — each moved, **neither ticked** (section 3.5 names the sentence each still owes and its owner) — and task **3**, **ticked** in slice 2: its last open sentence, the preferences module's wiki index, is closed here. |
| Revision    | First.                                                                                                                                                                                                                                                                               |
| Schema      | OpenSpec change `adopt-frontend-lifetimes`, already `sdd-lean`. Three requirements appended to its delta spec, one per slice; tasks 3, 12 and 13 get dated notes; one dated update to the lifetime map.                                                                              |

## 1. Goal, non-goals, and the cut

**Goal.** Three checks the frontend lifetimes change promised and does not have yet, each built to
fail loudly and each watched failing:

1. **Every frontend module type-checks on its own** (task 12's first sentence). Each directory under
   `apps/wbs/fe-01/src/modules` gets a `tsconfig.json` extending one shared
   `modules/tsconfig.module.json`, a **composite** configuration: a composite program refuses, with
   TS6307, every file it reaches that its configuration does not list, so a module that imports a
   sibling module's private file or a component fails **its own** check while the application's
   type check still passes. A new `typecheck:module` target runs every module directory's check —
   a directory with no configuration fails it — and `typecheck` depends on it, so the host gate runs
   it.
2. **Every frontend module is a registered wiki module** (task 12's index sentence, and task 3's last
   one). Each module README gets a `module-index` block declaring `module.frontend.<name>` and every
   non-README file, and each module is registered in the content-review pilot exactly as the backend
   modules are: a `docs/wiki-policy/modules.json` row, a `policy.json` boundary bound to the
   pre-namespacing file it was extracted from at the pilot's frozen `sourceRevision`, and a
   `relationships.json` fact for its applicable check. No existing row changes. The pilot suite's
   `pilotPaths` and the legacy-occurrence pin are re-pinned, each after its observed red.
3. **Delivery reaches no infrastructure but the routes still owed** (task 13).
   `apps/wbs/fe-01/src/delivery-boundaries.test.ts` builds the application program with the
   TypeScript checker and judges every identifier, module specifier, string-keyed element access and
   destructured property of delivery by the **declarations it resolves to**, never its spelling, and
   the four types a context, a route or a runtime hands delivery by their members' types. It refuses
   a bag, a broad HTTP client, a repository or its port, a resource-service, a composition root, a
   socket and browser storage — except twenty routes recorded as still owed, each naming its owner,
   and a recorded route that has gone fails it too, so the record only shrinks.

**Non-goals.**

- **The catalog facade, and with it the header token.** `ProjectPage` still builds
  `httpProjectApi(token)` for the project catalog and the archival import, and still builds the
  project runtime's source — the socket factory and `projectServicesOver`. Moving both into the
  session runtime is the lifetime map's "project catalog" prerequisite, a change of `ProjectPage`'s
  props and of the twenty files that draw it; it is task 13's remainder, recorded route by route in
  the check's ledger (section 3.5), not done here.
- **Sealing the six unsealed modules** (`calendar-markers`, `directory`, `plan-commands`,
  `plan-feed`, `plan-writer`, `project`) as DI Bag modules. They have no graph of their own to check
  until they are; task 12 stays unticked for that one outcome (section 3.5).
- **Frontend label agreement** (WBS `021844c4`, "Frontend label agreement check over
  apps/wbs/fe-01/src/modules"). `tools/tool-devsync/src/module-labels.test.ts` requires every module
  directory under a root to seal a private binding under its label; six of the eight frontend
  directories have no `module.ts`, so a third `MODULE_ROOTS` row would refuse them. It stays its WBS
  item's, which now has the index blocks it was waiting for (section 12).
- **The backend twin** (WBS `6316cf1a`, task 7.3 of `adopt-di-composition`). Mirrored in shape,
  not done.
- **Task 11** (stale readers on switch, unmount and Strict Mode) and every residual packets i, j and
  k handed it.
- No dependency, `bun.lock` or `package.json` change, and no fe-01 source file changes. The one
  production module touched is the repository tool `tools/tool-devsync/workspace-inventory.mjs`
  (section 3.1).

**What a reader sees change:** nothing. Every change is a configuration, an index, a registration, a
test or a record.

**The cut, and why three slices.** Each slice is one kind of check with its own runner:

1. **The isolated type check**: nine new `tsconfig` files, one target, and the inventory module that
   must now see nested configurations — `tsc` and one devsync suite.
2. **The wiki registration**: eight README blocks, three policy files, two pins — the pilot suite and
   the legacy pin, both Bun.
3. **The architecture check**: one new Vitest suite and the records — Vitest only.

## 2. Read first

| File                                                                                                                                            | Why                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                                                                                                    | Rules R1–R5 and the routing index.                                                                   |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`                                                                                           | "Execution contract", "Standard blocks every packet uses".                                           |
| `docs/superpowers/specs/2026-09-19-code-organization-design.md`, "Modules" and "Import matrix"                                                  | The module layout (`tsconfig.json … for the isolated type check`), K2, and what delivery may import. |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, "Narrow context and K2 resolution" and exact lifecycle test 15      | What task 13 refuses, and the catalog facade it waits for.                                           |
| `apps/wbs/be-01/src/module-boundaries.test.ts`                                                                                                  | The backend's symbol-identity route check; slice 3's shape.                                          |
| `libs/wbs/application/core/src/module/plan-history/README.md`, `docs/wiki-policy/{modules.json,policy.json,relationships.json}`                 | The backend registration slice 2 mirrors.                                                            |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` (`every legacy source occurrence …`) | The two pins slice 2 moves.                                                                          |
| `apps/wbs/fe-01/src/modules/*/README.md`, `apps/wbs/fe-01/project.json`, `apps/wbs/fe-01/tsconfig*.json`                                        | What slices 1 and 2 change.                                                                          |

## 3. Design

### 3.1 The isolated type check

`modules/tsconfig.module.json` extends `apps/wbs/fe-01/tsconfig.spec.json` (so a module's own tests
type-check too, with Vitest's globals) and sets `composite`. Its `include` is
`${configDir}/**/*.ts` and `.tsx` — `${configDir}` is the **extending** configuration's directory,
so each module's `tsconfig.json` can be the one line `{ "extends": "../tsconfig.module.json" }` —
plus the outside world every module may reach: `modules/channel.ts`, `modules/store.ts`, the HTTP
client with its refusal words and the refresh routes (`lib/{http,refusal,wbs-api,plan-refresh}.ts`),
and the domain and contracts libraries. A module that reaches more names exactly what in its own
`files`, with a comment saying why:

| Module                                             | Names beyond the shared list                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calendar-markers`, `plan-commands`, `preferences` | nothing                                                                                                                                                                                                       |
| `directory`                                        | `components/wbs/plan-refusal.ts` — a module reaching delivery for its refusal words, kept visible                                                                                                             |
| `directory-management`                             | the directory resource it seals as its private binding, its contract and its fake client; `plan-refusal.ts` through it                                                                                        |
| `plan-feed`                                        | the stream adapter `lib/project-stream.ts` and `lib/api.ts`; three test-support files under `src/testing`                                                                                                     |
| `plan-writer`                                      | `lib/local-write.ts`, which takes its outcome type from `components/wbs/live-editing.ts` (and so `cell-navigation.ts`, `editable-grid.ts`) — a `lib/` file reaching delivery, kept visible; `plan-refusal.ts` |
| `project`                                          | the composition root: the four plan modules' factories and stores, and what they reach; three test-support files                                                                                              |

Each list was taken from the program `tsc --listFilesOnly` builds for that module, and nothing was
added that the module does not reach today. `emitDeclarationOnly` and an `outDir` under
`dist/out-tsc/fe-01-modules` exist only because a composite project may not disable declaration
emit (TS6304); the target passes `--noEmit`. The `libs` test files are excluded by three explicit
globs rather than one `libs/**` glob: `libs/**` is a "current recursive selector" to the legacy
occurrence pin, and would move it in slice 1.

**The configuration inventory.** `tools/tool-devsync/workspace-inventory.mjs`'s
`readDepthSensitiveConfigPaths` lists every parent-relative string in a project's configuration, the
facts a namespace move must rewrite; its suite compares that list with an oracle that walks every
`project.json` and `tsconfig*.json` under `apps/` and `libs/`. Until now every such file sat at a
project root, and the production reader read only the root. The nine new files sit below one, so the
oracle gains 59 rows the reader lacks and the suite goes red; the reader now walks each project's
directories the way the oracle does (skipping `node_modules`, `dist` and dot-directories), once per
file. Its only caller is its own suite. Observed load-bearing: reading the root alone again is `t7`.

`typecheck:module`:

```text
status=0; for module in apps/wbs/fe-01/src/modules/*/; do echo "typecheck:module $module"; bunx tsc -p "$module"tsconfig.json --noEmit || status=1; done; exit $status
```

It reports every failing module rather than the first, and a module directory without a
`tsconfig.json` fails it (TS5058) instead of being skipped. `typecheck` gains
`"dependsOn": ["typecheck:module"]`, which is what puts it under the host gate's `typecheck` step.

**What it proves, observed** (section 8.1): a type error inside a module (`t1`); a sibling's private
file (`t2`), which the application's own `tsc --build` still accepts (`t2b`) and which `typecheck`
now refuses through its dependency (`t2c`); a component (`t3`); a missing configuration (`t5`). And
that the two load-bearing parts are load-bearing: without `composite` the sibling import passes the
module check (`t4`), and without `dependsOn` it passes `typecheck` (`t6`). And the inventory reading the project root alone misses
the nested configurations again (`t7`).

### 3.2 The wiki registration

Mirrors the backend modules, field for field:

- **The block**, one line after each README's title:
  `moduleId` `module.frontend.<directory>`; `memberships` every file of the directory but the README,
  including `tsconfig.json` and `view/…`; `applicableChecks` `["check.fe-01.typecheck-module"]`;
  `inapplicableSections` for `relationships` (no extractor points here) and, for all but
  `preferences`, `invariants` (each module's invariants are on its symbols; `preferences` has an
  Invariants section); `externalConsumers` every production file outside the module that imports it,
  found on the planning date, with the knowledge limit that tests and `src/testing` are not tracked.
- **The fact** `check.fe-01.typecheck-module` in `relationships.json`: an `nx-target` fact for
  `wbs-fe-01:typecheck:module`, its expected configuration exactly what `nx show project` resolves.
- **The row and the boundary**: `modules.json` `module.frontend.<name>`, one `directory-prefix`
  membership, the same consumers; `policy.json` `boundary.frontend.<name>` selecting the directory,
  its `sourceSelector` and one `baselineEntries` tuple naming the file it was extracted from as it
  stood at the frozen `sourceRevision` `7851161bf96312750d07b933ca5d42b75ce575c7`, when fe-01 still
  lived at `apps/fe-01`:

| Module                 | Predecessor at the frozen revision                       | Why that file                                             |
| ---------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `calendar-markers`     | `apps/fe-01/src/components/wbs/wbs-table.tsx`            | the four marker gestures were the table's                 |
| `directory`            | `apps/fe-01/src/components/directory/directory-page.tsx` | the newest-read rule and the write runner were the page's |
| `directory-management` | `apps/fe-01/src/components/directory/directory-page.tsx` | so were the gestures                                      |
| `plan-commands`        | `apps/fe-01/src/lib/wbs-api.ts`                          | its port is the client's routes                           |
| `plan-feed`            | `apps/fe-01/src/lib/plan-refresh.ts`                     | the refresh owner                                         |
| `plan-writer`          | `apps/fe-01/src/components/wbs/use-plan-read.ts`         | "added beside the plan read hook"                         |
| `preferences`          | `apps/fe-01/src/lib/remembered.ts`                       | the stores it replaced                                    |
| `project`              | `apps/fe-01/src/components/wbs/project-page.tsx`         | where the page composed the table's services              |

Two boundaries sharing a predecessor is allowed: `trust.ts` asks only that a boundary's baseline be
non-empty, unique within it, and inside its own source selector.

**What the pilot catches, observed** (section 8.2): a module file its index leaves out (`w1`); a
module whose mapping row is dropped (`w2`); a boundary bound to a file that did not exist at the frozen
revision (`w3`). **What it does not**, rehearsed: dropping a module's row **and** its boundary
together leaves the pilot green — coverage is `selected-boundaries-only`, and nothing requires every
frontend module to be registered. The backend closes that with `module-labels.test.ts`'s "registers
every module in the pilot under that identifier, or is known not to"; the frontend's is WBS
`021844c4`'s (section 12).

**The two pins.** `pilotPaths` lists the eight READMEs, so the suite's candidate — a clone of `HEAD`
with `pilotPaths` overlaid from the working tree — carries the indexes before they are committed.
The legacy pin in `repo-namespacing-handoff.test.ts` counts sixteen new
`historical policy selector or baseline` occurrences, eight `sourceSelector`s and eight baseline
paths under `apps/fe-01/`: `71 → 87`, `289 → 305`, and a new digest. The digest depends on the line
numbers of every counted context, and `pilot-policy.test.ts` holds counted contexts below
`pilotPaths`, so the `Proof:` comments slice 2's executor writes there move it once more: slice 2
step 9 re-pins it to the value it then observes, and nothing else.

### 3.3 The architecture check

`delivery-boundaries.test.ts` runs in the jsdom tier (it names `WebSocket` and `localStorage`, which
`src/test-tiers.test.ts` reads as DOM evidence) and needs no DOM. What it calls delivery:
every production file under `src/components`, `src/app-router.tsx`, and each module's `view/`.
Composition roots — `main.tsx`, `app.tsx`, `src/runtime`, each `composition.ts` — may see
everything, and `src/lib` mixes adapters with hooks; neither is delivery here (section 3.6).

**The forbidden symbols**, each named once and then compared by identity:

| What                | Named by                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| a broad HTTP client | `ProjectApi`, `DirectoryApi`, `httpProjectApi`, `httpDirectoryApi` (`lib/wbs-api.ts`); `SavedPlanApi`, `httpSavedPlanApi` (`lib/saved-plan-api.ts`) |
| a repository port   | `PlanReadRoutes`, `CalendarMarkerRoutes`, `PlanCommandRoutes`                                                                                       |
| a repository        | `BrowserStorage`, `RevocableBrowserStorage`; any declaration in a module's `*.repository.ts`                                                        |
| a resource-service  | `Preferences`, `DirectoryResource`; any declaration in a module's `*.resource.ts`                                                                   |
| a composition root  | `projectServicesOver`; any declaration in a module's `composition.ts`                                                                               |
| a socket            | any declaration in `lib/project-stream.ts`; the DOM's `WebSocket`                                                                                   |
| storage             | the DOM's `localStorage`, `sessionStorage`, `indexedDB`, `Storage`, `IDBFactory`, `WindowLocalStorage`, `WindowSessionStorage`                      |
| a bag               | any declaration under `node_modules/di-bag/`                                                                                                        |

A symbol is infrastructure when any symbol of its alias chain is forbidden, is declared in a
forbidden file, or is a member of a forbidden interface, class or type literal — which is how
`localStorage.getItem` and `window.sessionStorage` are caught without naming them. Each delivery file
is walked for four kinds of node, each a route clause with its own observed negative (section 8.3):

| Clause                                                            | Catches                                                               | Negative                           |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| a module specifier (import, export, `import()`, `import(…)` type) | a forbidden **file** reached by path: a resource, a bag               | `d9`, `d10`                        |
| an identifier                                                     | named, renamed, type-only-namespace, global and member uses           | `d1`, `d2`, `d4`, `d6`, `d7`, `d8` |
| a string-keyed element access                                     | `wbs['httpDirectoryApi']` through a namespace import                  | `d3`                               |
| a destructured property                                           | `const { localStorage } = window` — the shorthand name is a new local | `d5`                               |

The last two are load-bearing and were shown to be: with the element-access clause removed `d3`
passes, and with the binding clause removed `d5` passes (section 9.3). The **context types** —
`ApplicationServices`, `SessionRuntime`, `ProjectRuntime`, `SignedInRegion` — are judged by each
member's declared type and its union members (`c1`). The **ledger** `OWED` is compared as a whole,
so a route that goes away fails the check until it is struck (`o1`).

### 3.4 Decisions

1. **Composite, not a lint rule, for isolation.** The design asks for a type check that "includes
   only this directory"; a composite program is the only `tsc` mode that refuses what it reaches but
   does not list. The price is a closed list per module, which is the point: each list is the
   module's outside world, reviewed.
2. **`typecheck` depends on `typecheck:module`.** A new target the gate does not run is a check that
   cannot fail where it matters; the dependency is observed load-bearing (`t6`).
3. **The frozen-revision binding for every module**, including the two whose predecessor is the same
   page, because a boundary without a source selector would need a baseline at the frozen revision,
   and `apps/wbs/fe-01/src/modules` did not exist then.
4. **A ledger, not a tick.** Task 13's check lands refusing everything its requirement refuses, with
   the twenty routes that exist today written down by owner; the alternative — a check that waits for
   the catalog facade — is a check nobody runs until then.
5. **Teach the inventory to read nested configurations**, rather than move the module
   configurations to the project root: the design puts `tsconfig.json` in the module directory, and a
   namespace move must rewrite a nested configuration's `../` paths as surely as a root one's.
6. **Leave label agreement to its item.** Landing it here means sealing six modules or weakening the
   check's "seals every module" clause for one root.

### 3.5 What this packet does and does not claim

- **Task 3 is met, and ticked in slice 2.** Its one open sentence was the preferences module's wiki
  index; the earlier ones are recorded as closed by 050.7f1 and f2 in its own note. The README now
  carries `module.frontend.preferences` and all twelve of its other files.
- **Task 12 moves, and stays open for one outcome.** Met: every module directory has an isolated
  type check (slice 1), a validated wiki index and a `contract.ts` (all eight already had one), the
  `preferences` resource is recorded as accepted debt with its one caller,
  `src/lib/remembered.ts`, named — in the module's README, and in slice 3's ledger — and no existing
  pilot row changes (section 9.3 compares them). **Open:** "its graph check" for the six modules that
  are not sealed DI Bag modules. `preferences` and `directory-management` verify theirs in
  `module.test.ts`; the other six have no `module.ts`, so there is no graph of their own to check,
  only the runtime that installs them. Owner: the change that seals them, which is also what WBS
  `021844c4` needs.
- **Task 13 moves, and stays open for its routes.** Met: the check exists, judges by symbol identity,
  refuses every category the task names but the credential itself (next point), and has a watched
  negative per route clause. **Open**, as the ledger records: the catalog and the import on
  `ProjectApi` in `ProjectPage`, `usePlanImport` and `SignedInRegion`, and the header token
  `httpProjectApi` is built from; the project runtime's source `ProjectPage` still builds — the
  socket and `projectServicesOver`. Owner: task 13's remainder, the catalog facade the lifetime map
  names as a prerequisite, which moves all of it into the session runtime. The saved-plan shelf's
  client is **task 10's**; `ApplicationServices.preferences` is **task 12's** accepted debt.
- **The credential is a string.** No symbol identity follows a string from `session.token` into
  `SignedInRegion.token` and `ProjectPageProps.token`; the check refuses the factories that consume a
  credential, not the string. Stated in the task note; a branded credential type would close it, and
  it belongs to the catalog facade's change.
- **Not claimed:** that delivery reaches nothing through `src/lib` hooks, which are not classified;
  that a forbidden member reached through a mapped type counts (a `Pick` of `ProjectApi` in delivery
  would count, since its members keep `ProjectApi`'s declarations, but no delivery file holds one to
  prove it on); that every sealed-module graph resolves (the DI checks separately prove that).

### 3.6 What delivery is, and why `src/lib` is not in it

`src/lib` holds the HTTP client and the stream (adapters), the refresh owner (a resource), and
`theme.ts` and `remembered.ts` (delivery hooks), side by side. Calling the whole directory delivery
would record the adapters as violations of themselves; calling none of it delivery leaves the two
hooks unchecked. The check classifies by directory and says so; moving the hooks next to their
components is the kind rules' work, not this packet's.

## 4. Verified facts

Every number is a fresh observation from this packet's rehearsal on 2026-09-24, on the authoring base
`59cfe22a4` — packet k's rehearsal tip: k's authoring base `2e237e20e` (batch-6 integration
`52876ae12`, which is main with packets h, G, H and I and packet j's real lane, plus packet i's
rehearsed diffs) and k's two rehearsal commits and one amendment — and on three rehearsal commits over
it. That base is **never dispatched**: the dispatch base is planning after packets i's and k's real
lanes have landed, which differs from it by their executors' `Proof:` comments, dated notes and
`verify.md` entries (section 9.1 simulates all three and checks a stand-in for the real one).

### 4.1 The code as it stands

| Fact                                                                                                                                                                      | Where                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Eight module directories, every one with a `contract.ts` and a README, none with a `module-index` block; only `preferences` and `directory-management` have a `module.ts` | `apps/wbs/fe-01/src/modules/*`                                                  |
| `typecheck` is `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`, with no dependency; no `typecheck:module` target exists                                           | `apps/wbs/fe-01/project.json`                                                   |
| `tsc` is TypeScript 7.0.2 (native); the `typescript` package the tests import is 6.0.2                                                                                    | `node_modules/.bin/tsc`, `node_modules/typescript`                              |
| A composite program refuses an unlisted reached file with TS6307 and may not set `noEmit` (TS6304); `${configDir}` resolves to the extending configuration's directory    | rehearsed, section 9.3                                                          |
| At `7851161bf…` fe-01 was `apps/fe-01`, with no `src/modules`; each predecessor in section 3.2 exists there                                                               | `git ls-tree -r 7851161bf96312750d07b933ca5d42b75ce575c7`                       |
| The pilot mapping has 22 rows and 22 boundaries; `relationships.json` has no fe-01 fact                                                                                   | `docs/wiki-policy/*.json`                                                       |
| Delivery reaches infrastructure by twenty routes today (section 3.5)                                                                                                      | slice 3's red, section 6                                                        |
| `readDepthSensitiveConfigPaths` reads configuration files at each project's root only; its oracle walks every directory                                                   | `tools/tool-devsync/workspace-inventory.mjs`, `src/workspace-inventory.test.ts` |

### 4.2 The measured blast radius

`git diff --stat 59cfe22a4 dbc639533`: **28 files changed, 1046 insertions(+), 29 deletions(-)** — 10
new — and `verify.md`, which only the executor writes, makes 29 distinct owned paths: slice 1 owns 13
(9 new), slice 2 owns 16, slice 3 owns 5 (1 new).

| Tree             | Sandbox node suite | `typecheck:module` | Pilot `pins …` test | Legacy pin   | `delivery-boundaries` | fe-01 `test`, UTC (planner) |
| ---------------- | ------------------ | ------------------ | ------------------- | ------------ | --------------------- | --------------------------- |
| base `59cfe22a4` | 57·713             | no such target     | 1 pass              | 1 pass (289) | —                     | 146·3094                    |
| after slice 1    | 57·713             | 0, eight modules   | 1 pass              | 1 pass (289) | —                     | —                           |
| after slice 2    | 57·713             | 0                  | 1 pass              | 1 pass (305) | —                     | —                           |
| after slice 3    | 57·713             | 0                  | 1 pass              | 1 pass (305) | 1·1                   | 147·3095                    |

### 4.3 Planner observations on the base, not stop conditions

- Strict OpenSpec `{"items":114,"passed":114,"failed":0}` on the base and after every step that
  touches `spec.md`.
- The whole pilot suite takes about 400 seconds; its `pins …` test alone about 50.
- On a loaded host, `wbs-fe-01:test:unit`'s `playwright-config.test.ts` › `lets a shifted browser
login reach authentication …` timed out spawning `bun` once (`spawnSync bun ETIMEDOUT`), and
  `wbs-fe-01:test` failed `plan-keyboard.test.tsx` › `Alt+N is the same chord …` once; the file passed
  alone (96 tests). Neither file is touched here.

## 5. File plan

Paths under `apps/wbs/fe-01/` unless they start with `openspec/`, `docs/`, `apps/wiki/` or `tools/`.

| File                                                                               | Slice   | Create/modify | Responsibility                                                    |
| ---------------------------------------------------------------------------------- | ------- | ------------- | ----------------------------------------------------------------- |
| `openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md` | 1, 2, 3 | modify        | one requirement per slice, appended                               |
| `openspec/changes/adopt-frontend-lifetimes/verify.md`                              | 1, 2, 3 | modify        | one fresh entry per slice, appended                               |
| `tools/tool-devsync/workspace-inventory.mjs`                                       | 1       | modify        | the inventory reads nested configurations                         |
| `project.json`                                                                     | 1       | modify        | `typecheck:module`; `typecheck` depends on it                     |
| `src/modules/tsconfig.module.json`                                                 | 1       | **create**    | the shared composite base                                         |
| `src/modules/<each of eight>/tsconfig.json`                                        | 1       | **create** ×8 | each module's check                                               |
| `src/modules/<each of eight>/README.md`                                            | 2       | modify ×8     | the index block; the Checks paragraph; preferences' Accepted debt |
| `apps/wiki/cli/src/policy/pilot-policy.test.ts`                                    | 2       | modify        | `pilotPaths` gains the eight READMEs                              |
| `docs/wiki-policy/modules.json`, `policy.json`, `relationships.json`               | 2       | modify        | eight rows, eight boundaries, one fact — appended                 |
| `tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                          | 2       | modify        | the legacy pin's three numbers                                    |
| `openspec/changes/adopt-frontend-lifetimes/tasks.md`                               | 2, 3    | modify        | task 3 ticked; tasks 12 and 13 moved                              |
| `src/delivery-boundaries.test.ts`                                                  | 3       | **create**    | the architecture check                                            |
| `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`         | 3       | modify        | one dated update, after 050.7h's under "Narrow context …"         |

Nothing else. Not `src/runtime/*`, `app.tsx`, `app-router.tsx`, `src/components/*`, `src/lib/*`,
any module's source or test, `vitest.node-suites.ts`, `tools/tool-devsync/src/module-labels.test.ts`,
`bun.lock` or `package.json`.

### Which hunks meet packets i's and k's files, and why they apply after their executors

Packets i's and k's executors write `// Proof:` comments into `src/runtime/session-runtime.ts` and
`src/app.tsx` — twenty-two sites between them — and date `<observed-date-i>` and `<observed-date-k>`
in `tasks.md` and the lifetime map. This packet touches neither source file. Its `tasks.md` hunks sit
at tasks 3, 12 and 13, and its lifetime-map hunk after packet h's update; none holds a line either
packet dates within its three lines of context. Section 9.1's `fill=1` run proves all of it against a
copy with all twenty-two sites filled and every note dated, and its `fill=real` run against a
stand-in built from packet i's real lane.

## 6. Slices

Each slice is one executor attempt and ends at a checkpoint: the executor stops and reports, and the
planner reviews and commits before the next slice is dispatched. Every block below is real `sh`, run
from the repository root unless it says `cd`, one command at a time — never two Vitest, Bun test or
Nx runs at once.

### Step 0 — at the start of **every** slice

**0a. The starting state.** Before running this block, replace `<the SHA named in this attempt's
slice note>` with the 40-character hash the slice note gives (`reviewed base <sha>`); unreplaced, the
block dies on the unterminated quote.

```sh
set -euo pipefail
mkdir -p "${TMPDIR:?}/evidence"
base=$(git rev-parse HEAD)
echo "base=$base" | tee "$TMPDIR/evidence/base.txt"
# The reviewed SHA reaches the executor through this attempt's own slice note
# (see Dispatch), not through the clone, so this comparison is independent of it.
reviewed=<the SHA named in this attempt's slice note>
test "$base" = "$reviewed"
# One snapshot, one emptiness test; --untracked-files=all lists a new file inside
# an untracked directory by itself rather than collapsing it into the directory.
git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-before.txt"
test ! -s "$TMPDIR/evidence/status-before.txt"
```

Expected: `base=` a 40-character hash equal to the slice note's, and an **empty** `status-before.txt`.

**0b. Three helpers, the patches and the fault patches**, written into `$TMPDIR` so that every later
block — each its own shell — can use them.

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
if summary=$(sed 's/\x1b\[[0-9;]*m//g' "$log" | grep -E "Test Files|Tests  | pass$| fail$|error TS|Successfully ran|Failed tasks|^status="); then
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
cat > "$TMPDIR/run-fault.sh" <<'EOF'
#!/usr/bin/env bash
# Usage: run-fault.sh <id> <runner> <expected status: 0, 1 or nz> <expected text or ->
# Saves every file the fault patch names, injects it, runs the runner, restores and
# compares the bytes, and only then judges the status and the text.
set -uo pipefail
id=$1 runner=$2 want=$3 text=$4
patch="$TMPDIR/mutations/$id.diff"
case "$id" in t2b|t2c) patch="$TMPDIR/mutations/t2.diff" ;; esac
test -f "$patch" || { echo "$id: no patch $patch" >&2; exit 2; }
saved="$TMPDIR/passing/$id"
mkdir -p "$saved"
mapfile -t files < <(grep -E '^(\+\+\+ b/|--- a/)' "$patch" | sed -E 's#^(\+\+\+ b/|--- a/)##' | sort -u)
for f in "${files[@]}"; do mkdir -p "$saved/$(dirname "$f")"; cp "$f" "$saved/$f"; done
git apply --unidiff-zero --check "$patch" < /dev/null || exit 2
git apply --unidiff-zero "$patch" < /dev/null || exit 2
cp "$patch" "$TMPDIR/evidence/$id.patch"
log="$TMPDIR/evidence/$id.log"
case "$runner" in
  module) NX_DAEMON=false bunx nx run wbs-fe-01:typecheck:module --skip-nx-cache ;;
  gate) NX_DAEMON=false bunx nx run wbs-fe-01:typecheck --skip-nx-cache ;;
  app) bunx tsc --build --force apps/wbs/fe-01/tsconfig.json ;;
  pins) (cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 \
    bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts \
    -t 'pins exact pre-index tuples and passes observe lint from external trust') ;;
  delivery) (cd apps/wbs/fe-01 && TZ=UTC bunx vitest run src/delivery-boundaries.test.ts) ;;
  inventory) bun test ./tools/tool-devsync/src/workspace-inventory.test.ts \
    -t 'pins the complete moved depth-sensitive configuration inventory' ;;
  *) echo "unknown runner $runner" >&2; exit 2 ;;
esac > "$log" 2>&1 < /dev/null
status=$?
echo "status=$status" >> "$log"
for f in "${files[@]}"; do cp "$saved/$f" "$f"; cmp "$f" "$saved/$f" || exit 3; done
case "$want" in
  nz) test "$status" -ne 0 ;;
  *) test "$status" -eq "$want" ;;
esac || { echo "$id: status $status, expected $want" >&2; exit 1; }
if [ "$text" != - ]; then
  sed 's/\x1b\[[0-9;]*m//g' "$log" > "$log.plain"
  grep -aqF -- "$text" "$log.plain" || { echo "$id: expected text not seen: $text" >&2; exit 1; }
fi
echo "$id | status=$status | ${text}"
EOF
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-l-isolated-checks-and-architecture.md
test -f "$packet"
mkdir -p "$TMPDIR/patches" "$TMPDIR/mutations"
# Section 7's fenced diffs, in document order, as 01.diff … 11.diff.
awk -v out="$TMPDIR/patches" '
  /^## 7\. The code$/ { inside=1; next }
  /^## 8\. Proofs$/   { inside=0 }
  inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$TMPDIR/patches" -name '*.diff' | wc -l)
echo "patches=$count"
test "$count" -eq 11
# Section 8's fault patches, each named by the heading "#### Proof <id>" above it.
awk -v out="$TMPDIR/mutations" '
  /^## 8\. Proofs$/ { inside=1; next }
  /^## 9\. Verification$/ { inside=0 }
  inside && /^#### Proof / { id=$3; next }
  inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
  capture && /^```$/ { capture=0; next }
  capture { print >> f }
' "$packet"
count=$(find "$TMPDIR/mutations" -name '*.diff' | wc -l)
echo "mutations=$count"
test "$count" -eq 22
````

Expected: `patches=11`, `mutations=22`, exit 0. **Applying section 7.N** below always means exactly
this, never a hand edit:

```sh
set -euo pipefail
git apply --check "$TMPDIR/patches/NN.diff"
git apply "$TMPDIR/patches/NN.diff"
```

`--check` and the apply are separate commands on purpose: joined with `&&` under `set -e`, a failed
check would not stop the shell. The eleven diffs are numbered in section order: 7.1 is `01.diff` and so
on to 7.11, `11.diff`. A diff that creates or deletes a file does so in the working tree only.

**0c. The baselines**, before any edit. Every slice records these three; slice 2 adds the pilot's
`pins …` test and slice 3 nothing more.

```sh
set -euo pipefail
bash "$TMPDIR/run-check.sh" base-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck --skip-nx-cache
bash "$TMPDIR/run-check.sh" base-legacy bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
  -t "every legacy source occurrence"
cd apps/wbs/fe-01
bash "$TMPDIR/run-check.sh" base-sandbox bunx vitest run --config vitest.node.config.ts \
  --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
for check in base-typecheck base-legacy base-sandbox; do bash "$TMPDIR/expect-status.sh" "$check" 0; done
```

`bun test ./tools/…` with the `./`: without it the argument is a filter, not a path, and collects
compiled copies under `dist/out-tsc` once any typecheck has run. And the OpenSpec baseline with the
strict block (section 9.2); record `passed`.

**Record every number.** Every later count in a slice is that slice's own step-0 number plus or minus
what the slice itself adds, never an absolute. Rehearsed values are given beside each expectation for
orientation only (section 9.3).

In the sandbox the executor never runs `wbs-fe-01:test`, `wbs-fe-01:test:unit`, `wbs-fe-01:build`,
`wbs-fe-01:e2e`, `tool-devsync:test`, the whole pilot suite or `check-indexes`; section 9.4 gives each
to the planner with its expected relative delta.

**The fault procedure, for every slice.** Each slice's faults are records of four lines — id, runner,
expected status, expected text — in the first `text` block of that slice's subsection of section 8.
Extract them rather than retyping them, then run them all, in order, **before** writing any `Proof:`
comment, so every fault patch still applies:

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-l-isolated-checks-and-architecture.md
section=8.1 # this slice's subsection: 8.1, 8.2 or 8.3
test -f "$packet"
awk -v want="### $section " '
  index($0, want) == 1 { s=1; next }
  s && /^```text$/ { c=1; next }
  c && /^```$/ { exit }
  c { print }
' "$packet" > "$TMPDIR/proofs.txt"
test -s "$TMPDIR/proofs.txt"
test $(( $(wc -l < "$TMPDIR/proofs.txt") % 4 )) -eq 0
wc -l < "$TMPDIR/proofs.txt"
while IFS= read -r id && IFS= read -r runner && IFS= read -r want && IFS= read -r text; do
  bash "$TMPDIR/run-fault.sh" "$id" "$runner" "$want" "$text" < /dev/null
done < "$TMPDIR/proofs.txt"
git status --porcelain --untracked-files=all > "$TMPDIR/evidence/after-faults.txt"
diff "$TMPDIR/evidence/after-green.txt" "$TMPDIR/evidence/after-faults.txt"
````

Expected: 36 lines for slice 1, 12 for slice 2, 48 for slice 3; then one line per fault, each
`<id> | status=<n> | <text>` as the slice's table gives it, and exit 0; the final `diff` prints
nothing — every injected file was restored byte for byte. (`after-green.txt` is written by the
slice's green checkpoint.) The loop stops at the first fault that does not behave as recorded,
**after** that fault's files were restored and compared — then preamble rule 20 applies: re-read the
row, redo that fault once by hand, and stop if it still differs about the fact. A fault that also
fails other tests is not a stop. Every command inside reads `/dev/null`, so nothing it runs can
consume the records the loop is reading.

**The comment** names the injected fault and the observed failure, as `//` line comments at the site
the slice's table names, dated with the executor's own `date -u +%F`, written only after the loop
above has passed. In a `tsconfig` file a `//` comment is valid JSONC; in the tests it is ordinary.

### Slice 1 — every module type-checks on its own

Owns (13 paths): `spec.md`, `verify.md`, `apps/wbs/fe-01/project.json`,
`tools/tool-devsync/workspace-inventory.mjs`, and nine new files under
`apps/wbs/fe-01/src/modules/`: `tsconfig.module.json` and `tsconfig.json` in each of
`calendar-markers`, `directory`, `directory-management`, `plan-commands`, `plan-feed`,
`plan-writer`, `preferences` and `project`.

- [ ] 1. Step 0. Expected: typecheck 0, legacy pin `1 pass`, sandbox rehearsed 57·713.
- [ ] 2. **The contract first (R4).** Apply section 7.1 (the requirement "Each frontend module
      type-checks on its own") and rerun the strict block. Expected: exit 0, `passed` equal to step
      0's number (rehearsed 114 → 114).
- [ ] 3. Apply section 7.2: the target, before any configuration. **Red checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-red-module env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck:module --skip-nx-cache
  bash "$TMPDIR/expect-status.sh" s1-red-module 1
  sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/evidence/s1-red-module.log" > "$TMPDIR/evidence/s1-red-module.plain"
  grep -c "TS5058: The specified path does not exist" "$TMPDIR/evidence/s1-red-module.plain"
  test "$(grep -c "TS5058: The specified path does not exist" "$TMPDIR/evidence/s1-red-module.plain")" -eq 8
  ```

  Expected, and rehearsed exactly: `status=1`, and `8` — one
  `error TS5058: The specified path does not exist: '…/src/modules/<name>/tsconfig.json'.` per module
  directory, `directory-management` before `directory` (shell glob order). The target reported every
  module rather than stopping at the first.

- [ ] 4. Apply section 7.3: the base configuration and the eight module configurations. The module
      check now passes, and the repository's depth-sensitive configuration inventory goes **red**:
      its oracle walks every configuration file under `apps/` and `libs/`, the production inventory
      only each project's root, and the new configurations carry parent-relative paths.

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-red-inventory bun test ./tools/tool-devsync/src/workspace-inventory.test.ts \
    -t "pins the complete moved depth-sensitive configuration inventory"
  bash "$TMPDIR/expect-status.sh" s1-red-inventory 1
  test "$(grep -ac '^-   "apps/wbs/fe-01/src/modules/' "$TMPDIR/evidence/s1-red-inventory.log")" -eq 59
  ```

  Expected, and rehearsed exactly: `status=1`, `@@ -3,69 +3,10 @@`, and `59` oracle rows absent from
  the production inventory, every one a `src/modules/…/tsconfig…json` row (`-a`: the rows carry NUL
  separators).

- [ ] 5. Apply section 7.4: `readDepthSensitiveConfigPaths` walks each project's directories for
      configuration files, as its oracle does. **Green checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s1-green-module env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck:module --skip-nx-cache
  bash "$TMPDIR/run-check.sh" s1-green-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck --skip-nx-cache
  bash "$TMPDIR/run-check.sh" s1-green-legacy bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
    -t "every legacy source occurrence"
  bash "$TMPDIR/run-check.sh" s1-green-inventory bun test ./tools/tool-devsync/src/workspace-inventory.test.ts
  bash "$TMPDIR/run-check.sh" s1-lint env NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache
  bash "$TMPDIR/run-check.sh" s1-lint-devsync env NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
  bash "$TMPDIR/run-check.sh" s1-typecheck-devsync env NX_DAEMON=false bunx nx run tool-devsync:typecheck --skip-nx-cache
  (cd apps/wbs/fe-01 && bash "$TMPDIR/run-check.sh" s1-green-sandbox bunx vitest run \
    --config vitest.node.config.ts --exclude playwright-config.test.ts \
    --exclude src/components/wbs/short-date.test.ts)
  for check in s1-green-module s1-green-typecheck s1-green-legacy s1-green-inventory s1-lint \
    s1-lint-devsync s1-typecheck-devsync s1-green-sandbox; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  test "$(grep -c '^typecheck:module apps/wbs/fe-01/src/modules/' "$TMPDIR/evidence/s1-green-module.log")" -eq 8
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/after-green.txt"
  ```

  Expected `status=0` everywhere, eight modules checked, the inventory suite `4 pass`, the legacy pin
  unchanged (`1 pass`; its
  count did not move, because no configuration names a `libs/**` or `apps/**` glob), and the sandbox
  suite equal to step 0 (rehearsed 57·713): the configurations change what Vitest reads for nothing
  it runs.

- [ ] 6. The nine faults of section 8.1 with the fault procedure (`section=8.1`), then the `Proof:`
      comments at the sites its table names: two in `src/modules/tsconfig.module.json`, one in
      `tools/tool-devsync/workspace-inventory.mjs`.
- [ ] 7. Rerun `s1-final-module`, `s1-final-typecheck`, `s1-final-inventory` and `s1-final-sandbox`
      (step 5's commands): unchanged from step 5. The comments changed no count.
- [ ] 8. Append this slice's `verify.md` entry (shape below), then owned-file Prettier over the
      thirteen paths, `--write` then `--check`, from this list, which step 9 reuses; then rerun the
      strict OpenSpec block — **after** the evidence edit.

  ```sh
  set -euo pipefail
  {
    printf '%s\n' apps/wbs/fe-01/project.json apps/wbs/fe-01/src/modules/tsconfig.module.json
    for m in calendar-markers directory directory-management plan-commands plan-feed plan-writer preferences project; do
      printf '%s\n' "apps/wbs/fe-01/src/modules/$m/tsconfig.json"
    done
    printf '%s\n' openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
      openspec/changes/adopt-frontend-lifetimes/verify.md tools/tool-devsync/workspace-inventory.mjs
  } > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 13
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  ```

  Expected: exit 0, and `All matched files use Prettier code style!` from the check.

- [ ] 9. Hand over — the working tree's changed paths compared with the owned list:

  ```sh
  set -euo pipefail
  git status --porcelain --untracked-files=all | tee "$TMPDIR/evidence/status-after.txt"
  cut -c4- "$TMPDIR/evidence/status-after.txt" | sort > "$TMPDIR/evidence/status-paths.txt"
  sort "$TMPDIR/owned.txt" > "$TMPDIR/evidence/owned-sorted.txt"
  diff "$TMPDIR/evidence/owned-sorted.txt" "$TMPDIR/evidence/status-paths.txt"
  ```

  Expected: the `diff` prints nothing and exits 0: four ` M` paths and nine `??`.

Planner commit subject: `feat(frontend): give every frontend module a type check of its own`.

### Slice 2 — every module indexed and registered, and task 3 closed

Owns (16 paths): `spec.md`, `verify.md`, `tasks.md` (under `openspec/changes/adopt-frontend-lifetimes/`),
the eight `apps/wbs/fe-01/src/modules/*/README.md`, `apps/wiki/cli/src/policy/pilot-policy.test.ts`,
`docs/wiki-policy/{modules.json,policy.json,relationships.json}` and
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`.

- [ ] 1. Step 0, and the pilot's `pins …` test:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" base-pins env bash -c 'cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts -t "pins exact pre-index tuples and passes observe lint from external trust"'
  bash "$TMPDIR/expect-status.sh" base-pins 0
  ```

  Expected: `1 pass`, `0 fail` (about 50 seconds). The suite clones committed `HEAD` into its own
  temporary directory and overlays only `pilotPaths` from the working tree.

- [ ] 2. **The contract first.** Apply section 7.5 ("Every frontend module is a registered wiki
      module") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.6: the eight index blocks and README paragraphs, and `pilotPaths`. **Red
      checkpoint** — indexes the pilot does not yet declare a check for:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-red-pins env bash -c 'cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts -t "pins exact pre-index tuples and passes observe lint from external trust"'
  bash "$TMPDIR/expect-status.sh" s2-red-pins 1
  grep -F "unknown applicable check in apps/wbs/fe-01/src/modules/calendar-markers/README.md: check.fe-01.typecheck-module" \
    "$TMPDIR/evidence/s2-red-pins.log"
  ```

  Expected, and rehearsed exactly: `status=1`, `0 pass`, `1 fail`, at the lint's `toBe(0)` with
  `error: unknown applicable check in apps/wbs/fe-01/src/modules/calendar-markers/README.md:
check.fe-01.typecheck-module` — the first README in path order, naming a fact nothing declares.

- [ ] 4. Apply section 7.7 — the fact, the eight rows and boundaries, and `tasks.md` — then date the
      two notes by observation, never by copying a date from this packet:

  ```sh
  set -euo pipefail
  observed=$(date -u +%F)
  note=openspec/changes/adopt-frontend-lifetimes/tasks.md
  test -f "$note"
  test "$(grep -c '<observed-date-l>' "$note")" -eq 2
  sed -i "s/<observed-date-l>/$observed/g" "$note"
  grep -n "050-7-l, observed $observed" "$note"
  if grep -n '<observed-date-l>' "$note"; then echo "placeholder left in $note" >&2; exit 1; else rc=$?; test "$rc" -eq 1; fi
  ```

  Expected: two lines printed, exit 0; task 3's box is `[x]`.

- [ ] 5. **Green checkpoint, and the legacy pin's red:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-green-pins env bash -c 'cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules timeout 900 bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts -t "pins exact pre-index tuples and passes observe lint from external trust"'
  bash "$TMPDIR/expect-status.sh" s2-green-pins 0
  bash "$TMPDIR/run-check.sh" s2-red-legacy bun test ./tools/tool-devsync/src/repo-namespacing-handoff.test.ts \
    -t "every legacy source occurrence"
  bash "$TMPDIR/expect-status.sh" s2-red-legacy 1
  ```

  Expected: the `pins …` test `1 pass`; the legacy pin `status=1`, `Expected - 3`, `Received + 3`:
  `"historical policy selector or baseline": 71` → `87`, `"occurrences": 289` → `305`, and the digest
  `8d9667b7d195746954849db31d5e6e106858109737d058581c5d33b4e7097d2e` →
  `68a1e15da4a66840c53c9a57c43583e1b303f2115504abc09e8bbe08d7294e02`, no unclassified entry. Only
  the two counts are the fact; if the digest alone differs, record the one observed — it moves with
  the line of every counted context in the repository, including files outside this slice — and use
  it in step 6.

- [ ] 6. Apply section 7.8 (the pin's three numbers). If step 5 recorded a different digest, then —
      and only then — replace the digest in that one line with the observed one (a named edit). Rerun
      `s2-green-legacy` (step 5's legacy command): `1 pass`. Then:

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s2-typecheck env NX_DAEMON=false bunx nx run-many -t typecheck -p tool-devsync,twilight-burokrat --skip-nx-cache
  bash "$TMPDIR/run-check.sh" s2-lint-wiki env NX_DAEMON=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
  bash "$TMPDIR/run-check.sh" s2-lint-devsync env NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache
  bash "$TMPDIR/run-check.sh" s2-module env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck:module --skip-nx-cache
  for check in s2-green-legacy s2-typecheck s2-lint-wiki s2-lint-devsync s2-module; do
    bash "$TMPDIR/expect-status.sh" "$check" 0
  done
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/after-green.txt"
  ```

  Expected `status=0` everywhere.

- [ ] 7. The three faults of section 8.2 with the fault procedure (`section=8.2`), then the `Proof:`
      comments in `pilot-policy.test.ts` at the site its table names.
- [ ] 8. The comments moved counted lines in `pilot-policy.test.ts`, so rerun the legacy pin
      (`s2-comments-legacy`, step 5's command). Expected: `status=1`, **the digest alone** differs —
      the categories and `occurrences: 305` agree. Replace the digest with the one observed (the named
      edit of this step), then write the pin's own `Proof:` comment above the digest line (section
      8.2's last row), and rerun: `1 pass`. `repo-namespacing-handoff.test.ts` does not count its own
      lines, so that comment moves nothing. If the rerun after the comments **passes**, the comments
      moved no counted line: record it and go on.
- [ ] 9. Rerun `s2-final-pins`, `s2-final-legacy` (both `1 pass`) and step 0c's three commands
      (`s2-final-*`): unchanged from step 0.
- [ ] 10. `verify.md` entry. Then owned-file Prettier over the sixteen paths from this list (step 11
      reuses it), `nx format:check --all` (`s2-format`), and the strict OpenSpec block — all after
      the evidence edit. Never a repository-wide format **write**.

  ```sh
  set -euo pipefail
  {
    for m in calendar-markers directory directory-management plan-commands plan-feed plan-writer preferences project; do
      printf '%s\n' "apps/wbs/fe-01/src/modules/$m/README.md"
    done
    printf '%s\n' apps/wiki/cli/src/policy/pilot-policy.test.ts docs/wiki-policy/modules.json \
      docs/wiki-policy/policy.json docs/wiki-policy/relationships.json \
      openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
      openspec/changes/adopt-frontend-lifetimes/tasks.md \
      openspec/changes/adopt-frontend-lifetimes/verify.md \
      tools/tool-devsync/src/repo-namespacing-handoff.test.ts
  } > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 16
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  bash "$TMPDIR/run-check.sh" s2-format env NX_DAEMON=false bunx nx format:check --all
  bash "$TMPDIR/expect-status.sh" s2-format 0
  ```

  Expected: exit 0 throughout. Prettier leaves each README's one-line index block on one line.

- [ ] 11. Hand over, with slice 1 step 9's block unchanged. Expected: the `diff` prints nothing — sixteen
      ` M` paths.

Planner commit subject:
`feat(frontend): index and register every frontend module in the wiki pilot, and close task 3`.

### Slice 3 — delivery reaches no infrastructure but the routes still owed

Owns (5 paths): `spec.md`, `verify.md`, `tasks.md`,
`docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md`, and one new file,
`apps/wbs/fe-01/src/delivery-boundaries.test.ts`.

- [ ] 1. Step 0. Expected as slice 2's step 0c.
- [ ] 2. **The contract first.** Apply section 7.9 ("Delivery reaches no infrastructure but the routes
      still owed") and rerun the strict block: exit 0, `passed` unchanged.
- [ ] 3. Apply section 7.10: the check, with an **empty** ledger — what the requirement asks of
      delivery. **Red checkpoint:**

  ```sh
  set -euo pipefail
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s3-red env TZ=UTC bunx vitest run src/delivery-boundaries.test.ts
  bash "$TMPDIR/expect-status.sh" s3-red 1
  grep -F "expected [ …(20) ] to deeply equal []" "$TMPDIR/evidence/s3-red.log"
  ```

  Expected, and rehearsed exactly: `status=1`, `Tests 1 failed (1)`, `AssertionError: expected [ …(20)
] to deeply equal []`, and the twenty received lines are exactly section 7.11's ledger entries — ten
  broad-client routes of the catalog and import, five of the project runtime's source, four of the
  saved-plan shelf, and `ApplicationServices.preferences is a resource-service`. Compare them line by
  line; a different set is a stop.

- [ ] 4. Apply section 7.11 (the ledger, the task 13 note, the lifetime map's update), then date the two
      notes:

  ```sh
  set -euo pipefail
  observed=$(date -u +%F)
  for note in openspec/changes/adopt-frontend-lifetimes/tasks.md \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md; do
    test -f "$note"
    test "$(grep -c '<observed-date-l>' "$note")" -eq 1
    sed -i "s/<observed-date-l>/$observed/" "$note"
    grep -n "observed $observed" "$note"
    if grep -n '<observed-date-l>' "$note"; then echo "placeholder left in $note" >&2; exit 1; else rc=$?; test "$rc" -eq 1; fi
  done
  ```

  Expected: at least one line printed per file, exit 0.

- [ ] 5. **Green checkpoint:**

  ```sh
  set -euo pipefail
  bash "$TMPDIR/run-check.sh" s3-typecheck env NX_DAEMON=false bunx nx run wbs-fe-01:typecheck --skip-nx-cache
  bash "$TMPDIR/run-check.sh" s3-lint env NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache
  cd apps/wbs/fe-01
  bash "$TMPDIR/run-check.sh" s3-green env TZ=UTC bunx vitest run --no-file-parallelism --maxWorkers=1 \
    src/delivery-boundaries.test.ts src/test-tiers.test.ts
  bash "$TMPDIR/run-check.sh" s3-green-sandbox bunx vitest run --config vitest.node.config.ts \
    --exclude playwright-config.test.ts --exclude src/components/wbs/short-date.test.ts
  for check in s3-typecheck s3-lint s3-green s3-green-sandbox; do bash "$TMPDIR/expect-status.sh" "$check" 0; done
  cd ../../..
  git status --porcelain --untracked-files=all > "$TMPDIR/evidence/after-green.txt"
  ```

  Expected `status=0` everywhere: 2 files, 6 tests (the check and the tier guard's five, which keeps
  the new suite out of the node tier: it names `WebSocket`); sandbox unchanged from step 0.

- [ ] 6. The twelve faults of section 8.3 with the fault procedure (`section=8.3`), then the `Proof:`
      comments in `delivery-boundaries.test.ts` at the sites its table names.
- [ ] 7. Rerun `s3-final-green` (step 5's Vitest command) and the sandbox: unchanged.
- [ ] 8. `verify.md` entry. Then owned-file Prettier over the five paths, `nx format:check --all`
      (`s3-format`) and the strict OpenSpec block, all after the evidence edit:

  ```sh
  set -euo pipefail
  printf '%s\n' apps/wbs/fe-01/src/delivery-boundaries.test.ts \
    docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md \
    openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md \
    openspec/changes/adopt-frontend-lifetimes/tasks.md \
    openspec/changes/adopt-frontend-lifetimes/verify.md > "$TMPDIR/owned.txt"
  test "$(wc -l < "$TMPDIR/owned.txt")" -eq 5
  # shellcheck disable=SC2046 # fixed repository paths without spaces
  GSETTINGS_BACKEND=memory bunx prettier --write $(cat "$TMPDIR/owned.txt")
  # shellcheck disable=SC2046
  GSETTINGS_BACKEND=memory bunx prettier --check $(cat "$TMPDIR/owned.txt")
  bash "$TMPDIR/run-check.sh" s3-format env NX_DAEMON=false bunx nx format:check --all
  bash "$TMPDIR/expect-status.sh" s3-format 0
  ```

- [ ] 9. Hand over, with slice 1 step 9's block unchanged. Expected: four ` M` paths and one `??`.

Planner commit subject:
`test(frontend): refuse infrastructure in delivery by symbol identity, the routes still owed recorded`.

### Verification record entries

Each slice appends one entry to `openspec/changes/adopt-frontend-lifetimes/verify.md`, headed
`## Packet 050.7l, slice N — <what the slice did>`, containing only its own observations: the attempt
id and starting hash; step 0's baselines as numbers; every command's status; the red checkpoint's own
diagnostics; the green counts; every fault with its status and observed line; for slice 2 the legacy
pin's digests as observed; and what stayed **pending planner verification** — `wbs-fe-01:test`,
`wbs-fe-01:test:unit`, `wbs-fe-01:build`, the whole pilot suite, `check-indexes committed`,
`tool-devsync:test` and the host gate. Evidence references are basenames relative to that attempt's
evidence directory, never absolute paths. Do not read, quote or restate an earlier entry.

### Dispatch

One attempt per slice, from the reviewed packet, with no network, driven by a Claude subagent. The
base of slice 1 is planning after packets i's and k's real lanes have landed, plus this packet's
commit **cherry-picked** — two paths, this document and one entry in
`docs/findings/current-document-check-exemptions.json`. Never merge the plan branch: its parent is
the undispatched authoring base. Before the first dispatch the planner runs section 9.1's script with
`REAL_BASE=<reviewed-base-sha>`; its `fill=real` output is the dispatch evidence. This block holds the
only absolute paths in this document.

```sh
# Slice 1, from the reviewed base; K2 is packet k's slice-2 planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-l-isolated-checks-and-architecture 1 <reviewed-base-sha> \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <K2> \
  --slice-note 'reviewed base <reviewed-base-sha>' \
  --preserve evidence

# Slice 2, into the same clone once slice 1 is reviewed and committed; P1 is
# slice 1's planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-l-isolated-checks-and-architecture 2 P1 \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <K2> \
  --resume --require-ancestor P1 \
  --slice-note 'reviewed base P1' \
  --preserve evidence

# Slice 3, likewise; P2 is slice 2's planner commit.
/home/df/wd/puni/puni-plan/exec/run-executor.sh \
  050-7-l-isolated-checks-and-architecture 3 P2 \
  --driver claude \
  --batch batch-6 \
  --require-ancestor <K2> \
  --resume --require-ancestor P2 \
  --slice-note 'reviewed base P2' \
  --preserve evidence
```

No `--seed`: no slice reads another attempt's evidence. No `--network`: nothing reaches a host; the
pilot suite clones the local repository only. `--slice-note` is the only channel by which the
reviewed SHA reaches the executor without passing through the clone, and step 0a reads it.
`--driver claude` writes the prompt and stops; the Claude subagent runs the slice and the planner
collects the attempt.

## 7. The code

Eleven fenced diffs, in slice order. Step 0b extracts them as `01.diff` … `11.diff`, and section 9.1
records the run that applies all of them, in this order, to a tree extracted from the authoring base
and proves the result byte-identical to the rehearsal's final commit. No diff adds a `Proof:`
comment, and none removes one.

### 7.1 `spec.md` — slice 1, the isolated type check's requirement

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index a19b2244f..f1fa637f7 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -542,3 +542,31 @@ and store surfaces.
 - **THEN** from the old runtime's withdrawal on, the header's presence slot is
   handed nobody and disconnected, and never the old project's list again, until
   the next project's own stream says who is there
+
+### Requirement: Each frontend module type-checks on its own
+
+fe-01 SHALL give every directory under `src/modules` a type check of its own, run by the
+`typecheck:module` target that `typecheck` depends on. A module's check SHALL compile its own files
+against only the shared outside files every module may reach — the store and channel primitives,
+the HTTP client with its refusal words and refresh routes, and the domain and contracts libraries —
+and the outside files its own configuration names. A module that breaks its own types, or reaches
+any other file, such as a sibling module's private file or a component, SHALL fail its own check,
+and a module directory without a configuration of its own SHALL fail the target.
+
+#### Scenario: A module reaches a sibling's private file
+
+- **WHEN** a file of one module imports a file of another module that its configuration does not
+  name
+- **THEN** `typecheck:module` fails, naming the reached file and the module whose check refused
+  it, while the application's own type check still passes
+
+#### Scenario: A module reaches a component
+
+- **WHEN** a file of a module other than the ones whose configurations name it imports a
+  component
+- **THEN** that module's check fails, naming the component
+
+#### Scenario: A module directory with no check of its own
+
+- **WHEN** a directory under `src/modules` has no `tsconfig.json`
+- **THEN** `typecheck:module` fails, naming the missing configuration, and so does `typecheck`
```

### 7.2 `project.json` — slice 1, the target first

`typecheck:module` loops over the module directories so a new one is checked without editing the
target, and `typecheck` depends on it.

```diff
diff --git a/apps/wbs/fe-01/project.json b/apps/wbs/fe-01/project.json
index d1ec8f797..81eb71b61 100644
--- a/apps/wbs/fe-01/project.json
+++ b/apps/wbs/fe-01/project.json
@@ -72,10 +72,17 @@
     },
     "typecheck": {
       "executor": "nx:run-commands",
+      "dependsOn": ["typecheck:module"],
       "options": {
         "command": "bunx tsc --build --force apps/wbs/fe-01/tsconfig.json"
       }
     },
+    "typecheck:module": {
+      "executor": "nx:run-commands",
+      "options": {
+        "command": "status=0; for module in apps/wbs/fe-01/src/modules/*/; do echo \"typecheck:module $module\"; bunx tsc -p \"$module\"tsconfig.json --noEmit || status=1; done; exit $status"
+      }
+    },
     "serve-local-solver": {
       "executor": "nx:run-commands",
       "continuous": true,
```

### 7.3 The nine configurations — slice 1

```diff
diff --git a/apps/wbs/fe-01/src/modules/calendar-markers/tsconfig.json b/apps/wbs/fe-01/src/modules/calendar-markers/tsconfig.json
new file mode 100644
index 000000000..311a04c64
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/calendar-markers/tsconfig.json
@@ -0,0 +1 @@
+{ "extends": "../tsconfig.module.json" }
diff --git a/apps/wbs/fe-01/src/modules/directory-management/tsconfig.json b/apps/wbs/fe-01/src/modules/directory-management/tsconfig.json
new file mode 100644
index 000000000..84cdc4513
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/directory-management/tsconfig.json
@@ -0,0 +1,13 @@
+{
+  "extends": "../tsconfig.module.json",
+  "files": [
+    // The directory resource this module seals as its private binding, its
+    // types, and the fake client its tests build it over: `modules/directory`
+    // has no module of its own to install it.
+    "../directory/contract.ts",
+    "../directory/directory.resource.ts",
+    "../directory/fake-directory-api.ts",
+    // Reached through the directory resource; see `../directory/tsconfig.json`.
+    "../../components/wbs/plan-refusal.ts"
+  ]
+}
diff --git a/apps/wbs/fe-01/src/modules/directory/tsconfig.json b/apps/wbs/fe-01/src/modules/directory/tsconfig.json
new file mode 100644
index 000000000..0e95a3a0f
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/directory/tsconfig.json
@@ -0,0 +1,7 @@
+{
+  "extends": "../tsconfig.module.json",
+  // The resource words its refusals through `failureText`, which lives beside the
+  // table it was written for: a module reaching delivery, kept visible here
+  // until those words move under `lib/`.
+  "files": ["../../components/wbs/plan-refusal.ts"]
+}
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/tsconfig.json b/apps/wbs/fe-01/src/modules/plan-commands/tsconfig.json
new file mode 100644
index 000000000..311a04c64
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-commands/tsconfig.json
@@ -0,0 +1 @@
+{ "extends": "../tsconfig.module.json" }
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/tsconfig.json b/apps/wbs/fe-01/src/modules/plan-feed/tsconfig.json
new file mode 100644
index 000000000..4bfb95e29
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-feed/tsconfig.json
@@ -0,0 +1,13 @@
+{
+  "extends": "../tsconfig.module.json",
+  "files": [
+    // The stream adapter the feed's resource opens, and the session shape it
+    // is typed against.
+    "../../lib/api.ts",
+    "../../lib/project-stream.ts",
+    // Test support the module's suites build their clients and views from.
+    "../../testing/fake-project-api.ts",
+    "../../testing/refusing-api.ts",
+    "../../testing/views.ts"
+  ]
+}
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/tsconfig.json b/apps/wbs/fe-01/src/modules/plan-writer/tsconfig.json
new file mode 100644
index 000000000..1a879a290
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/plan-writer/tsconfig.json
@@ -0,0 +1,14 @@
+{
+  "extends": "../tsconfig.module.json",
+  "files": [
+    // The local write the writer runs a gesture through, which takes its
+    // outcome type from the table's live editing — a `lib/` file reaching
+    // delivery, kept visible here.
+    "../../lib/local-write.ts",
+    "../../components/wbs/cell-navigation.ts",
+    "../../components/wbs/editable-grid.ts",
+    "../../components/wbs/live-editing.ts",
+    // The refusal words a refused gesture is announced in.
+    "../../components/wbs/plan-refusal.ts"
+  ]
+}
diff --git a/apps/wbs/fe-01/src/modules/preferences/tsconfig.json b/apps/wbs/fe-01/src/modules/preferences/tsconfig.json
new file mode 100644
index 000000000..311a04c64
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/preferences/tsconfig.json
@@ -0,0 +1 @@
+{ "extends": "../tsconfig.module.json" }
diff --git a/apps/wbs/fe-01/src/modules/project/tsconfig.json b/apps/wbs/fe-01/src/modules/project/tsconfig.json
new file mode 100644
index 000000000..2555b7596
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/project/tsconfig.json
@@ -0,0 +1,33 @@
+{
+  "extends": "../tsconfig.module.json",
+  "files": [
+    // The project composition root builds each plan module, so it alone sees
+    // their factories and stores, not only their contracts.
+    "../calendar-markers/calendar-markers.feature.ts",
+    "../calendar-markers/calendar-markers.resource.ts",
+    "../calendar-markers/composition.ts",
+    "../calendar-markers/contract.ts",
+    "../plan-commands/contract.ts",
+    "../plan-commands/plan-commands.feature.ts",
+    "../plan-feed/composition.ts",
+    "../plan-feed/contract.ts",
+    "../plan-feed/delivered-plan-store.ts",
+    "../plan-feed/plan-feed.feature.ts",
+    "../plan-feed/plan-feed.resource.ts",
+    "../plan-feed/presence-store.ts",
+    "../plan-writer/busy-store.ts",
+    "../plan-writer/contract.ts",
+    // What those reach: the stream adapter, and the writer's local write with
+    // the delivery types it takes (see `../plan-writer/tsconfig.json`).
+    "../../lib/api.ts",
+    "../../lib/project-stream.ts",
+    "../../lib/local-write.ts",
+    "../../components/wbs/cell-navigation.ts",
+    "../../components/wbs/editable-grid.ts",
+    "../../components/wbs/live-editing.ts",
+    // Test support its suite records calls on.
+    "../../testing/fake-project-api.ts",
+    "../../testing/record-calls.ts",
+    "../../testing/refusing-api.ts"
+  ]
+}
diff --git a/apps/wbs/fe-01/src/modules/tsconfig.module.json b/apps/wbs/fe-01/src/modules/tsconfig.module.json
new file mode 100644
index 000000000..99f634574
--- /dev/null
+++ b/apps/wbs/fe-01/src/modules/tsconfig.module.json
@@ -0,0 +1,43 @@
+{
+  // The isolated type check of one frontend module, run for every module
+  // directory by `typecheck:module` in `apps/wbs/fe-01/project.json`, which
+  // `typecheck` depends on. Each module's own `tsconfig.json` extends this and
+  // names in `files` only what its directory reaches beyond the shared list
+  // below.
+  //
+  // `composite` is what makes the check isolated rather than merely small: a
+  // composite program refuses, with TS6307, every file it reaches that its
+  // configuration does not list. So `include` is the whole outside world every
+  // module may type-check against — the two shared store primitives, the HTTP
+  // client and its refusal words under `lib/`, the refresh routes, and the
+  // domain and contracts libraries — and a module that reaches anything else,
+  // such as a sibling module's private file or a component, fails its own
+  // check. `emitDeclarationOnly` and `outDir` exist because a composite project
+  // may not disable declaration emit; the target passes `--noEmit`.
+  "extends": "../../tsconfig.spec.json",
+  "compilerOptions": {
+    "composite": true,
+    "declaration": true,
+    "emitDeclarationOnly": true,
+    "outDir": "../../../../../dist/out-tsc/fe-01-modules"
+  },
+  "include": [
+    "${configDir}/**/*.ts",
+    "${configDir}/**/*.tsx",
+    "channel.ts",
+    "store.ts",
+    "../lib/http.ts",
+    "../lib/plan-refresh.ts",
+    "../lib/refusal.ts",
+    "../lib/wbs-api.ts",
+    "../../../../../libs/shared/domain/validation/src/**/*.ts",
+    "../../../../../libs/wbs/domain/contracts/src/**/*.ts",
+    "../../../../../libs/wbs/domain/domain/src/**/*.ts",
+    "../../../../../libs/wbs/domain/validation/src/index.ts"
+  ],
+  "exclude": [
+    "../../../../../libs/shared/domain/validation/src/**/*.test.ts",
+    "../../../../../libs/wbs/domain/contracts/src/**/*.test.ts",
+    "../../../../../libs/wbs/domain/domain/src/**/*.test.ts"
+  ]
+}
```

### 7.4 `workspace-inventory.mjs` — slice 1, the inventory reads nested configurations

```diff
diff --git a/tools/tool-devsync/workspace-inventory.mjs b/tools/tool-devsync/workspace-inventory.mjs
index a569bbdbd..5dd9857d4 100644
--- a/tools/tool-devsync/workspace-inventory.mjs
+++ b/tools/tool-devsync/workspace-inventory.mjs
@@ -16,6 +16,31 @@ function isProjectConfig(name) {
   return name === 'project.json' || /^tsconfig(?:\.[^.]+)?\.json$/.test(name);
 }

+/**
+ * Every project or TypeScript configuration file at or below one directory of a project, skipping
+ * dependencies, build output and dot-directories. A configuration nested inside a project — a
+ * frontend module's own isolated type check — carries parent-relative paths that move with the
+ * project exactly as its root configuration's do.
+ *
+ * @param {string} root
+ * @param {string} directory
+ * @returns {Promise<string[]>}
+ */
+async function projectConfigFiles(root, directory) {
+  /** @type {string[]} */
+  const found = [];
+  const entries = await readdir(join(root, directory), { withFileTypes: true });
+  for (const entry of entries) {
+    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
+      continue;
+    }
+    const path = `${directory}/${entry.name}`;
+    if (entry.isDirectory()) found.push(...(await projectConfigFiles(root, path)));
+    else if (isProjectConfig(entry.name)) found.push(path);
+  }
+  return found;
+}
+
 /**
  * @param {unknown} candidate
  * @param {readonly string[]} segments
@@ -55,25 +80,24 @@ export async function readDepthSensitiveConfigPaths(workspace) {
   );
   /** @type {{file: string; propertyPath: string; value: string}[]} */
   const paths = [];
+  /** @type {Set<string>} */
+  const files = new Set();
   for (const project of projects) {
-    const names = (await readdir(join(root, project.root)))
-      .filter(isProjectConfig)
-      .sort((left, right) => left.localeCompare(right));
-    for (const name of names) {
-      const file = `${project.root}/${name}`;
-      /** @type {import('jsonc-parser').ParseError[]} */
-      const errors = [];
-      const config = parse(await readFile(join(root, file), 'utf8'), errors, {
-        allowTrailingComma: true,
-      });
-      // Proof: omitting the JSONC error check made the malformed-config fixture
-      // report `inventory unexpectedly succeeded` (2026-09-14).
-      if (errors.length > 0) {
-        const failures = errors.map(({ error }) => printParseErrorCode(error)).join(', ');
-        throw new Error(`cannot parse ${file}: ${failures}`);
-      }
-      collectParentRelativePaths(config, [], file, paths);
+    for (const file of await projectConfigFiles(root, project.root)) files.add(file);
+  }
+  for (const file of [...files].sort((left, right) => left.localeCompare(right))) {
+    /** @type {import('jsonc-parser').ParseError[]} */
+    const errors = [];
+    const config = parse(await readFile(join(root, file), 'utf8'), errors, {
+      allowTrailingComma: true,
+    });
+    // Proof: omitting the JSONC error check made the malformed-config fixture
+    // report `inventory unexpectedly succeeded` (2026-09-14).
+    if (errors.length > 0) {
+      const failures = errors.map(({ error }) => printParseErrorCode(error)).join(', ');
+      throw new Error(`cannot parse ${file}: ${failures}`);
     }
+    collectParentRelativePaths(config, [], file, paths);
   }
   return paths.sort((left, right) =>
     `${left.file}\0${left.propertyPath}\0${left.value}`.localeCompare(
```

### 7.5 `spec.md` — slice 2, the registration's requirement

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index f1fa637f7..0465493f3 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -570,3 +570,22 @@ and a module directory without a configuration of its own SHALL fail the target.

 - **WHEN** a directory under `src/modules` has no `tsconfig.json`
 - **THEN** `typecheck:module` fails, naming the missing configuration, and so does `typecheck`
+
+### Requirement: Every frontend module is a registered wiki module
+
+The README of every directory under fe-01's `src/modules` SHALL carry one `module-index` block
+declaring `module.frontend.<directory>` and naming every file of the directory but the README, with
+the module's own type check as its applicable check. Each SHALL be registered in the wiki's
+content-review pilot as one mapping row and one trusted boundary selecting that directory, bound to
+the file it was extracted from at the pilot's frozen source revision, and every row the pilot
+already held SHALL stay as it was.
+
+#### Scenario: A file added to a module its index does not name
+
+- **WHEN** a file is added to a module directory and the README's index does not name it
+- **THEN** the index check refuses the candidate, naming the README and the file
+
+#### Scenario: A module index the pilot does not map
+
+- **WHEN** a module's README carries an index and the pilot mapping has no row for it
+- **THEN** the pilot's lint refuses the candidate, naming the README
```

### 7.6 The eight index blocks, the README paragraphs, and `pilotPaths` — slice 2, the red side

Each block is one line, generated from the directory's files and its production importers on the
planning date; `directory-management` and `preferences` lose the sentence that said the block was
owed, and `preferences` gains "Accepted debt".

```diff
diff --git a/apps/wbs/fe-01/src/modules/calendar-markers/README.md b/apps/wbs/fe-01/src/modules/calendar-markers/README.md
index d2741e0a4..9a3ed891f 100644
--- a/apps/wbs/fe-01/src/modules/calendar-markers/README.md
+++ b/apps/wbs/fe-01/src/modules/calendar-markers/README.md
@@ -1,5 +1,7 @@
 # Calendar markers

+<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.calendar-markers","memberships":[{"kind":"path","path":"calendar-markers.feature.test.ts"},{"kind":"path","path":"calendar-markers.feature.ts"},{"kind":"path","path":"calendar-markers.resource.test.ts"},{"kind":"path","path":"calendar-markers.resource.ts"},{"kind":"path","path":"composition.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"What the resource and the feature own is documented on createCalendarMarkers and calendarMarkersFor; no invariant spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/composition.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->
+
 The dates a person marks on one project's chart, and the four edits that change them: putting a
 marker on a day, renaming it, recolouring it, and taking it off.

@@ -59,3 +61,7 @@ The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the modul
 extraction preserves is proved by `plan-chart-seam.test.tsx`, which drives the real table through
 the four gestures, and by the Gantt panel's own day-sheet suites, which run in the `test` target
 of the same project.
+
+Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
+depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
+extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
diff --git a/apps/wbs/fe-01/src/modules/directory-management/README.md b/apps/wbs/fe-01/src/modules/directory-management/README.md
index 72d0baf7d..f72eac300 100644
--- a/apps/wbs/fe-01/src/modules/directory-management/README.md
+++ b/apps/wbs/fe-01/src/modules/directory-management/README.md
@@ -1,5 +1,7 @@
 # Directory management

+<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.directory-management","memberships":[{"kind":"path","path":"contract.ts"},{"kind":"path","path":"directory-management.feature.test.ts"},{"kind":"path","path":"directory-management.feature.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"tsconfig.json"},{"kind":"path","path":"view/use-directory-management.ts"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"The refusal and completion rules are documented on the feature and its sealed module; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/directory/directory-page.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/session-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->
+
 Everything a person does to the account-wide directory: renaming an entry, adding one of the five
 kinds, making a team for somebody, making a service a team is responsible for, and removing an
 entry once its usage has been seen.
@@ -38,10 +40,12 @@ adapter its one page, `apps/wbs/fe-01/src/components/directory/directory-page.ts
 The page's suite draws the page over a client of its own with
 `apps/wbs/fe-01/src/testing/directory-page-over-client.tsx`.

-This module carries no `module-index` block yet; adding one is OpenSpec task 12's.
-
 ## Checks

 The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's own suites are
 `directory-management.feature.test.ts` and `module.test.ts`. The behaviour this extraction preserves is proved by
 `apps/wbs/fe-01/src/components/directory/directory-page.test.tsx`, in the `test` target.
+
+Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
+depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
+extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
diff --git a/apps/wbs/fe-01/src/modules/directory/README.md b/apps/wbs/fe-01/src/modules/directory/README.md
index 1ca47f62a..52f0aa857 100644
--- a/apps/wbs/fe-01/src/modules/directory/README.md
+++ b/apps/wbs/fe-01/src/modules/directory/README.md
@@ -1,5 +1,7 @@
 # Directory

+<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.directory","memberships":[{"kind":"path","path":"contract.ts"},{"kind":"path","path":"directory.resource.test.ts"},{"kind":"path","path":"directory.resource.ts"},{"kind":"path","path":"fake-directory-api.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"The newest-read rule, the write runner and withdrawal are documented on createDirectory; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/modules/directory-management/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/directory-management/module.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->
+
 The account-wide directory this deployment holds: its people, teams, tags, services and work item
 types, the rule for which read may install, and the one way a change to it is run.

@@ -39,3 +41,7 @@ The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the modul
 `directory.resource.test.ts`. The behaviour this extraction preserves is proved by
 `apps/wbs/fe-01/src/components/directory/directory-page.test.tsx`, which runs in the `test` target
 of the same project.
+
+Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
+depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
+extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/README.md b/apps/wbs/fe-01/src/modules/plan-commands/README.md
index 982380039..8c1c8d3cd 100644
--- a/apps/wbs/fe-01/src/modules/plan-commands/README.md
+++ b/apps/wbs/fe-01/src/modules/plan-commands/README.md
@@ -1,5 +1,7 @@
 # Plan commands

+<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.plan-commands","memberships":[{"kind":"path","path":"contract.ts"},{"kind":"path","path":"plan-commands.feature.test.ts"},{"kind":"path","path":"plan-commands.feature.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"The project a command is bound to and the route it reaches are documented on PlanCommands and planCommandsFor; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/plan-live.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-estimate-drafts.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-fields.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-read.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-structure.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-reference-sets.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/composition.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->
+
 Every request a plan gesture sends to one open project: the edits to its work items, its steps,
 its settings and its schedule, undo and redo, the archival download, and the directory entries a
 picker creates on the way to attaching one.
@@ -41,3 +43,7 @@ as its port; delivery receives `PlanCommands` through the table and never the po
 The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suite is
 `plan-commands.feature.test.ts`. The behaviour the move preserves is proved by the plan table's
 own suites, which run in the `test` target of the same project.
+
+Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
+depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
+extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
diff --git a/apps/wbs/fe-01/src/modules/plan-feed/README.md b/apps/wbs/fe-01/src/modules/plan-feed/README.md
index a38edce53..3a56e58f4 100644
--- a/apps/wbs/fe-01/src/modules/plan-feed/README.md
+++ b/apps/wbs/fe-01/src/modules/plan-feed/README.md
@@ -1,5 +1,7 @@
 # Plan feed

+<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.plan-feed","memberships":[{"kind":"path","path":"composition.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"delivered-plan-store.model.test.ts"},{"kind":"path","path":"delivered-plan-store.ts"},{"kind":"path","path":"plan-feed.feature.test.ts"},{"kind":"path","path":"plan-feed.feature.ts"},{"kind":"path","path":"plan-feed.resource.test.ts"},{"kind":"path","path":"plan-feed.resource.ts"},{"kind":"path","path":"presence-store.model.test.ts"},{"kind":"path","path":"presence-store.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"The anchor rule and the one-stream rule are documented on the resource, and the stores carry their own model tests; the ownership test between feature and resource is described under What the feature owns below."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/project-page.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-read.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/composition.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->
+
 One project's reading of the plan: the refresh owner of this project and API lifetime, the live
 subscription it opens once an anchor exists, the sequence it acknowledges, and the decision about
 which part of an owner snapshot the reader has not been given yet.
@@ -84,3 +86,7 @@ The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the modul
 `plan-feed.resource.test.ts`, `plan-feed.feature.test.ts` and the two store model tests. The behaviour this extraction
 preserves is proved by the plan table's and the project page's own suites, which run in the `test`
 target of the same project.
+
+Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
+depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
+extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
diff --git a/apps/wbs/fe-01/src/modules/plan-writer/README.md b/apps/wbs/fe-01/src/modules/plan-writer/README.md
index 9d5b33749..0c0d65456 100644
--- a/apps/wbs/fe-01/src/modules/plan-writer/README.md
+++ b/apps/wbs/fe-01/src/modules/plan-writer/README.md
@@ -1,5 +1,7 @@
 # Plan writer

+<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.plan-writer","memberships":[{"kind":"path","path":"busy-store.model.test.ts"},{"kind":"path","path":"busy-store.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"plan-writer.feature.ts"},{"kind":"path","path":"plan-writer.test.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"The reread ledger and the three ownership moments are documented on the writer, and the busy store carries its own model test; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-read.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->
+
 One plan gesture, and what has to be read again once it is over. Every command service in the
 table writes through this module.

@@ -41,3 +43,7 @@ gesture sends are not this module's: the table's hooks send them through the pro
 The applicable check is the `test:unit` target declared in `apps/wbs/fe-01/project.json`; the
 module's own suites are `plan-writer.test.ts` and `busy-store.model.test.ts`. The behaviour this extraction preserves is proved by
 the plan table's own suites, which run in the `test` target of the same project.
+
+Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
+depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
+extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
diff --git a/apps/wbs/fe-01/src/modules/preferences/README.md b/apps/wbs/fe-01/src/modules/preferences/README.md
index ec7aa56e9..630ec43b0 100644
--- a/apps/wbs/fe-01/src/modules/preferences/README.md
+++ b/apps/wbs/fe-01/src/modules/preferences/README.md
@@ -1,5 +1,7 @@
 # Preferences

+<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.preferences","memberships":[{"kind":"path","path":"browser-storage.repository.test.ts"},{"kind":"path","path":"browser-storage.repository.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"fake-browser-storage.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"preference-keys.ts"},{"kind":"path","path":"preferences.feature.test.ts"},{"kind":"path","path":"preferences.feature.ts"},{"kind":"path","path":"preferences.resource.test.ts"},{"kind":"path","path":"preferences.resource.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/gantt-detail.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/remembered-layout.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/lib/remembered.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/lib/theme.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/application-runtime.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/application-services-context.tsx"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->
+
 Everything this browser remembers for its reader: the palette they chose, whether the chart shows
 its detail, which project they had open, how wide each column was, which settings tab they were
 on. Fourteen keys, and the one rule that governs all of them.
@@ -50,9 +52,13 @@ of an event, `useApplicationServicesReader`, and there is no module-load duplica
 builds a store per project id, resolves the runtime's `preferences` from its lifetime slot at every
 call, and is the reason `preferences` is a public export at all.

-This module carries **no** `module-index` block yet, and adding one is its own packet: the
-`docs/wiki-policy` registration and the index that names these files land together, for the reason
-`libs/wbs/application/core/src/module/plan-history/README.md` gives.
+## Accepted debt
+
+`preferences`, the resource beneath `remembered`, is a public export of this module for one caller,
+`apps/wbs/fe-01/src/lib/remembered.ts`: its `remembered` factory builds the layout module's stores
+per project id, and a per-project key has no named answer in `preferences.feature.ts` to move behind.
+Recorded as accepted debt rather than moved, with that one caller named; a feature of its own for
+the per-project layout stores retires it.

 ## Checks

@@ -61,3 +67,7 @@ The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`, for
 own suite, `browser-storage.repository.test.ts`, names browser globals and therefore runs in the
 `test` target instead. The behaviour this extraction preserves is proved by the theme,
 layout, chart, settings and project page suites in that same target.
+
+Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
+depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
+extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
diff --git a/apps/wbs/fe-01/src/modules/project/README.md b/apps/wbs/fe-01/src/modules/project/README.md
index 920424d94..ea7199d53 100644
--- a/apps/wbs/fe-01/src/modules/project/README.md
+++ b/apps/wbs/fe-01/src/modules/project/README.md
@@ -1,5 +1,7 @@
 # Project

+<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.project","memberships":[{"kind":"path","path":"composition.test.ts"},{"kind":"path","path":"composition.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"That one client sits under all three ports and each module sees only its own is documented on projectServicesOver; it spans no other file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/project-page.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-read.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/session-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->
+
 The project composition root: the one place in the frontend that holds the plan's HTTP client
 and cuts each plan module's private repository port from it.

@@ -38,3 +40,7 @@ composition is a function, as `modules/directory-management/composition.ts` is.
 The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suite is
 `composition.test.ts`. The behaviour it preserves is proved by the plan table's and the project
 page's own suites, which run in the `test` target of the same project.
+
+Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
+depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
+extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
diff --git a/apps/wiki/cli/src/policy/pilot-policy.test.ts b/apps/wiki/cli/src/policy/pilot-policy.test.ts
index 26db27ed5..280705909 100644
--- a/apps/wiki/cli/src/policy/pilot-policy.test.ts
+++ b/apps/wiki/cli/src/policy/pilot-policy.test.ts
@@ -56,6 +56,14 @@ const pilotPaths = [
   'apps/wbs/be-01/src/module/optimization/README.md',
   'apps/wbs/be-01/src/module/solver-launcher/README.md',
   'apps/wbs/be-01/src/module/solver-supervisor/README.md',
+  'apps/wbs/fe-01/src/modules/calendar-markers/README.md',
+  'apps/wbs/fe-01/src/modules/directory/README.md',
+  'apps/wbs/fe-01/src/modules/directory-management/README.md',
+  'apps/wbs/fe-01/src/modules/plan-commands/README.md',
+  'apps/wbs/fe-01/src/modules/plan-feed/README.md',
+  'apps/wbs/fe-01/src/modules/plan-writer/README.md',
+  'apps/wbs/fe-01/src/modules/preferences/README.md',
+  'apps/wbs/fe-01/src/modules/project/README.md',
   'apps/wiki/cli/README.md',
 ] as const;
 const scratch: string[] = [];
```

### 7.7 The fact, the rows, the boundaries, and tasks 3 and 12 — slice 2, the green side

Appended after each file's last entry; no existing row changes (section 9.3 compares them).

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
index dc4a6b7d9..f8e5e8f02 100644
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -608,6 +608,195 @@
           { "kind": "path", "path": "tools/tool-dagger/src/main.ts" }
         ]
       }
+    },
+    {
+      "moduleId": "module.frontend.calendar-markers",
+      "name": "Calendar markers frontend module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/fe-01/src/modules/calendar-markers",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/fe-01/src/modules/calendar-markers/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/fe-01/src/modules/project/composition.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/modules/project/contract.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/project-runtime.ts" }
+        ]
+      }
+    },
+    {
+      "moduleId": "module.frontend.directory",
+      "name": "Directory frontend module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/fe-01/src/modules/directory",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/fe-01/src/modules/directory/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/fe-01/src/modules/directory-management/contract.ts" },
+          {
+            "kind": "path",
+            "path": "apps/wbs/fe-01/src/modules/directory-management/directory-management.feature.ts"
+          },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/modules/directory-management/module.ts" }
+        ]
+      }
+    },
+    {
+      "moduleId": "module.frontend.directory-management",
+      "name": "Directory management frontend module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/fe-01/src/modules/directory-management",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/fe-01/src/modules/directory-management/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/directory/directory-page.tsx" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/session-runtime.ts" }
+        ]
+      }
+    },
+    {
+      "moduleId": "module.frontend.plan-commands",
+      "name": "Plan commands frontend module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/fe-01/src/modules/plan-commands",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/fe-01/src/modules/plan-commands/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/plan-live.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/use-estimate-drafts.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/use-plan-fields.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/use-plan-read.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/use-plan-structure.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/use-reference-sets.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/modules/project/composition.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/modules/project/contract.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/project-runtime.ts" }
+        ]
+      }
+    },
+    {
+      "moduleId": "module.frontend.plan-feed",
+      "name": "Plan feed frontend module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/fe-01/src/modules/plan-feed",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/fe-01/src/modules/plan-feed/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/project-page.tsx" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/use-plan-read.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/modules/project/composition.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/modules/project/contract.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/project-runtime.ts" }
+        ]
+      }
+    },
+    {
+      "moduleId": "module.frontend.plan-writer",
+      "name": "Plan writer frontend module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/fe-01/src/modules/plan-writer",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/fe-01/src/modules/plan-writer/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/use-plan-read.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/modules/project/contract.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/project-runtime.ts" }
+        ]
+      }
+    },
+    {
+      "moduleId": "module.frontend.preferences",
+      "name": "Preferences frontend module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/fe-01/src/modules/preferences",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/fe-01/src/modules/preferences/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/gantt-detail.ts" },
+          {
+            "kind": "path",
+            "path": "apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx"
+          },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/remembered-layout.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/lib/remembered.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/lib/theme.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/application-runtime.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/application-services-context.tsx" }
+        ]
+      }
+    },
+    {
+      "moduleId": "module.frontend.project",
+      "name": "Project frontend module",
+      "memberships": [
+        {
+          "kind": "directory-prefix",
+          "prefix": "apps/wbs/fe-01/src/modules/project",
+          "exclusions": []
+        }
+      ],
+      "predecessorModuleIds": [],
+      "indexPath": "apps/wbs/fe-01/src/modules/project/README.md",
+      "externalConsumers": {
+        "kind": "declared",
+        "memberships": [
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/project-page.tsx" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/use-plan-read.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/project-runtime.ts" },
+          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/session-runtime.ts" }
+        ]
+      }
     }
   ]
 }
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
index c3b43db94..6fb90cec5 100644
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -1182,6 +1182,125 @@
         }
       ],
       "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.frontend.calendar-markers",
+      "selector": { "kind": "prefix", "value": "apps/wbs/fe-01/src/modules/calendar-markers" },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "apps/fe-01/src/components/wbs/wbs-table.tsx"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "28ae8d3249a826f4968d8647f3ddc5e979e7a3a2",
+          "path": "apps/fe-01/src/components/wbs/wbs-table.tsx"
+        }
+      ],
+      "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.frontend.directory",
+      "selector": { "kind": "prefix", "value": "apps/wbs/fe-01/src/modules/directory" },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "apps/fe-01/src/components/directory/directory-page.tsx"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "4228bd0c539b8165daee941c672a6cb62e8a5219",
+          "path": "apps/fe-01/src/components/directory/directory-page.tsx"
+        }
+      ],
+      "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.frontend.directory-management",
+      "selector": { "kind": "prefix", "value": "apps/wbs/fe-01/src/modules/directory-management" },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "apps/fe-01/src/components/directory/directory-page.tsx"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "4228bd0c539b8165daee941c672a6cb62e8a5219",
+          "path": "apps/fe-01/src/components/directory/directory-page.tsx"
+        }
+      ],
+      "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.frontend.plan-commands",
+      "selector": { "kind": "prefix", "value": "apps/wbs/fe-01/src/modules/plan-commands" },
+      "sourceSelector": { "kind": "prefix", "value": "apps/fe-01/src/lib/wbs-api.ts" },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "4e9b7ea1a042babab25fae9125a6502dbb734c04",
+          "path": "apps/fe-01/src/lib/wbs-api.ts"
+        }
+      ],
+      "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.frontend.plan-feed",
+      "selector": { "kind": "prefix", "value": "apps/wbs/fe-01/src/modules/plan-feed" },
+      "sourceSelector": { "kind": "prefix", "value": "apps/fe-01/src/lib/plan-refresh.ts" },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "2ec425ba2927d4e8d11e75b5f6b16ac8e7ebd786",
+          "path": "apps/fe-01/src/lib/plan-refresh.ts"
+        }
+      ],
+      "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.frontend.plan-writer",
+      "selector": { "kind": "prefix", "value": "apps/wbs/fe-01/src/modules/plan-writer" },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "apps/fe-01/src/components/wbs/use-plan-read.ts"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "27fd51181d467f5da11d87f95492e92fd0e5a118",
+          "path": "apps/fe-01/src/components/wbs/use-plan-read.ts"
+        }
+      ],
+      "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.frontend.preferences",
+      "selector": { "kind": "prefix", "value": "apps/wbs/fe-01/src/modules/preferences" },
+      "sourceSelector": { "kind": "prefix", "value": "apps/fe-01/src/lib/remembered.ts" },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "7ec3f1f0e2a46705419cbcd26764a6ced867c5a0",
+          "path": "apps/fe-01/src/lib/remembered.ts"
+        }
+      ],
+      "obligationIds": []
+    },
+    {
+      "boundaryId": "boundary.frontend.project",
+      "selector": { "kind": "prefix", "value": "apps/wbs/fe-01/src/modules/project" },
+      "sourceSelector": {
+        "kind": "prefix",
+        "value": "apps/fe-01/src/components/wbs/project-page.tsx"
+      },
+      "baselineEntries": [
+        {
+          "mode": "100644",
+          "blob": "7b2a79a20c845410e4c8d4454a53263bd619153b",
+          "path": "apps/fe-01/src/components/wbs/project-page.tsx"
+        }
+      ],
+      "obligationIds": []
     }
   ],
   "obligations": [],
diff --git a/docs/wiki-policy/relationships.json b/docs/wiki-policy/relationships.json
index 3426fe3da..d0a7e5993 100644
--- a/docs/wiki-policy/relationships.json
+++ b/docs/wiki-policy/relationships.json
@@ -208,6 +208,22 @@
         "cache": true,
         "inputs": ["default", "^production", "{workspaceRoot}/tsconfig.base.json"]
       }
+    },
+    {
+      "factId": "check.fe-01.typecheck-module",
+      "family": "targets",
+      "at": { "kind": "current" },
+      "kind": "nx-target",
+      "project": "wbs-fe-01",
+      "target": "typecheck:module",
+      "expectedConfiguration": {
+        "executor": "nx:run-commands",
+        "options": {
+          "command": "status=0; for module in apps/wbs/fe-01/src/modules/*/; do echo \"typecheck:module $module\"; bunx tsc -p \"$module\"tsconfig.json --noEmit || status=1; done; exit $status"
+        },
+        "configurations": {},
+        "parallelism": true
+      }
     }
   ],
   "edges": []
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index 9512b89c9..50b1dfc90 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -14,7 +14,7 @@
       bag; the installer's close really is the bag's close. Negatives: the label removed;
       a registered cycle; the bag leaked into the returned surface; the close delegation
       replaced by a resolved no-op.
-- [ ] 3. The page's application lifetime is opened through the slot at module load and
+- [x] 3. The page's application lifetime is opened through the slot at module load and
       delivery reads its preferences out of that one graph, with the module's wiki index
       declaring `module.frontend.preferences` and its files.
       Partly moved by 050-7-f1: `lib/theme.ts` reads through
@@ -27,9 +27,11 @@
       and `lib/remembered.ts` resolves the runtime's `preferences` from the slot at
       every call, so `remembered-layout.ts`'s module-scope `storedMermaidSectionMode`
       holds no store. `modules/preferences/composition.ts` and its two tests are
-      deleted. This box stays unchecked for the one outcome still owed: the module's
-      wiki index (`apps/wbs/fe-01/src/modules/preferences/README.md` says it carries
-      no `module-index` block yet, and that adopting one is its own packet).
+      deleted. The one outcome still owed, the module's wiki index, is closed by
+      050-7-l, observed <observed-date-l>: `apps/wbs/fe-01/src/modules/preferences/README.md`
+      carries a `module-index` block declaring `module.frontend.preferences` and every
+      file of the module, registered in the content-review pilot beside the other seven
+      frontend modules (task 12).
 - [x] 4. The application bootstrap owns the React root: it builds the runtime before
       `createRoot`, publishes `RememberedPreferences` — the feature facade only, never
       the `Preferences` resource — through one context, and renders the sanitized fatal
@@ -143,5 +145,20 @@
       `src/lib/remembered.ts`'s per-project layout stores — moves behind a feature of
       its own or is recorded as accepted debt with its one caller named. Existing
       trusted pilot mappings are preserved untouched.
+      Moved by 050-7-l, observed <observed-date-l>: every directory under
+      `apps/wbs/fe-01/src/modules` has a `tsconfig.json` extending
+      `modules/tsconfig.module.json`, a composite configuration that refuses any file the
+      module reaches beyond the shared list and the files it names, run by the new
+      `typecheck:module` target that `typecheck` depends on; every one already has a
+      `contract.ts`, and now a `module-index` README block registered as
+      `module.frontend.<name>` in `docs/wiki-policy/modules.json` and `policy.json`, whose
+      existing rows are unchanged, with `check.fe-01.typecheck-module` as its applicable
+      check. The `preferences` resource is recorded as accepted debt in the module's
+      README, its one caller `src/lib/remembered.ts` named. This box stays unchecked for
+      the one outcome still owed: a graph check of their own for the six modules that are
+      not sealed DI Bag modules — `calendar-markers`, `directory`, `plan-commands`,
+      `plan-feed`, `plan-writer` and `project` have no `module.ts`, so no graph to verify
+      but the runtime that installs them; `preferences` and `directory-management` verify
+      theirs in `module.test.ts`.
 - [ ] 13. No infrastructure escapes a context: the architecture checks refuse a
       bag, credential, broad client, repository or resource in delivery.
```

### 7.8 The legacy pin's three numbers — slice 2

The digest is the rehearsal's; slice 2 steps 5, 6 and 8 say when the observed one replaces it.

```diff
diff --git a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
index e428a2591..a957f9df4 100644
--- a/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
+++ b/tools/tool-devsync/src/repo-namespacing-handoff.test.ts
@@ -621,7 +621,7 @@ test('every legacy source occurrence and relevant text family is pinned', async
       'current recursive selector': 31,
       'frozen migration evidence': 19,
       'historical bootstrap policy or mapping': 44,
-      'historical policy selector or baseline': 71,
+      'historical policy selector or baseline': 87,
       'production proof or revision transition': 18,
       'test fixture or proof': 106,
     },
@@ -850,8 +850,8 @@ test('every legacy source occurrence and relevant text family is pinned', async
     // `apps/be-01/src/service/solver-supervisor-client.ts` they were extracted from; raised
     // `historical policy selector or baseline` from 67 to 71 and occurrences from 285 to 289, no
     // unclassified entries (2026-09-24).
-    digest: '8d9667b7d195746954849db31d5e6e106858109737d058581c5d33b4e7097d2e',
-    occurrences: 289,
+    digest: '68a1e15da4a66840c53c9a57c43583e1b303f2115504abc09e8bbe08d7294e02',
+    occurrences: 305,
     unclassified: [],
   });
 });
```

### 7.9 `spec.md` — slice 3, the architecture check's requirement

```diff
diff --git a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
index 0465493f3..60176de36 100644
--- a/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
+++ b/openspec/changes/adopt-frontend-lifetimes/specs/adopt-frontend-lifetimes/spec.md
@@ -589,3 +589,36 @@ already held SHALL stay as it was.

 - **WHEN** a module's README carries an index and the pilot mapping has no row for it
 - **THEN** the pilot's lint refuses the candidate, naming the README
+
+### Requirement: Delivery reaches no infrastructure but the routes still owed
+
+fe-01 SHALL keep an architecture check that judges delivery — every production file under
+`src/components`, `src/app-router.tsx` and each module's `view/` — by symbol identity through the
+TypeScript checker, and the types a context, a route or a runtime hands delivery by their members'
+types. It SHALL refuse any route to a bag, a broad HTTP client, a repository or its port, a
+resource-service, a composition root, a socket or browser storage, however the use is spelled,
+except the routes it records as still owed, each naming the task that owns removing it; a recorded
+route that no longer exists SHALL fail the check as well.
+
+#### Scenario: A new route to a broad client, under any spelling
+
+- **WHEN** a delivery file reaches a broad HTTP client by a named, renamed, namespace, type-only or
+  string-keyed import
+- **THEN** the check fails, naming the file, the symbol reached and what it is
+
+#### Scenario: Storage, a socket or a bag reached from delivery
+
+- **WHEN** a delivery file reads browser storage as a global, a window property or a destructured
+  property, opens a socket, or imports the DI container
+- **THEN** the check fails, naming the file and what it reached
+
+#### Scenario: A context hands delivery a client
+
+- **WHEN** a member of a type delivery is handed by a context, a route or a runtime is typed as a
+  broad client
+- **THEN** the check fails, naming the type and the member
+
+#### Scenario: A route still owed is paid off
+
+- **WHEN** a route the check records as still owed no longer exists
+- **THEN** the check fails until the record is struck
```

### 7.10 `delivery-boundaries.test.ts` (**new**) — slice 3, with an empty ledger

```diff
diff --git a/apps/wbs/fe-01/src/delivery-boundaries.test.ts b/apps/wbs/fe-01/src/delivery-boundaries.test.ts
new file mode 100644
index 000000000..af3e7fa4e
--- /dev/null
+++ b/apps/wbs/fe-01/src/delivery-boundaries.test.ts
@@ -0,0 +1,338 @@
+import { readdirSync } from 'node:fs';
+import { join, relative } from 'node:path';
+
+import ts from 'typescript';
+import { describe, expect, it } from 'vitest';
+
+/**
+ * `apps/wbs/fe-01`, where every config runs; `process.cwd()` for the reason
+ * `src/test-tiers.test.ts` gives — under jsdom a module URL is a `/@fs/…` path.
+ */
+const APP = process.cwd();
+const REPOSITORY = join(APP, '../../..');
+
+/**
+ * What delivery is: every production file under `src/components`, the router
+ * that hands the signed-in region to its pages, and a module's own `view/`
+ * adapters. Composition roots — `main.tsx`, `app.tsx`, `src/runtime` and each
+ * module's `composition.ts` — are allowed to see everything, and `src/lib`
+ * mixes adapters with hooks, so neither is delivery here.
+ */
+function deliveryFiles(): readonly string[] {
+  const found: string[] = [];
+  const walk = (dir: string): void => {
+    for (const entry of readdirSync(join(APP, dir), { withFileTypes: true })) {
+      const path = `${dir}/${entry.name}`;
+      if (entry.isDirectory()) walk(path);
+      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(path);
+    }
+  };
+  walk('src/components');
+  for (const module of readdirSync(join(APP, 'src/modules'), { withFileTypes: true })) {
+    if (!module.isDirectory()) continue;
+    const view = `src/modules/${module.name}/view`;
+    if (readdirSync(join(APP, 'src/modules', module.name)).includes('view')) walk(view);
+  }
+  found.push('src/app-router.tsx');
+  return found.sort();
+}
+
+/**
+ * The infrastructure delivery may not reach, each by the symbols that are it.
+ *
+ * A symbol is named here once, by the export or global that declares it, and
+ * everything after that compares identities: a use is judged by where its
+ * alias chain ends and where that symbol and each member it was reached
+ * through are declared, never by how the use is spelled.
+ */
+const FORBIDDEN_EXPORTS: readonly { file: string; names: readonly string[]; is: string }[] = [
+  {
+    file: 'src/lib/wbs-api.ts',
+    names: ['ProjectApi', 'DirectoryApi', 'httpProjectApi', 'httpDirectoryApi'],
+    is: 'a broad HTTP client',
+  },
+  {
+    file: 'src/lib/saved-plan-api.ts',
+    names: ['SavedPlanApi', 'httpSavedPlanApi'],
+    is: 'a broad HTTP client',
+  },
+  { file: 'src/lib/plan-refresh.ts', names: ['PlanReadRoutes'], is: 'a repository port' },
+  {
+    file: 'src/modules/calendar-markers/contract.ts',
+    names: ['CalendarMarkerRoutes'],
+    is: 'a repository port',
+  },
+  {
+    file: 'src/modules/plan-commands/contract.ts',
+    names: ['PlanCommandRoutes'],
+    is: 'a repository port',
+  },
+  {
+    file: 'src/modules/preferences/contract.ts',
+    names: ['BrowserStorage', 'RevocableBrowserStorage'],
+    is: 'a repository',
+  },
+  { file: 'src/modules/preferences/contract.ts', names: ['Preferences'], is: 'a resource-service' },
+  {
+    file: 'src/modules/directory/contract.ts',
+    names: ['DirectoryResource'],
+    is: 'a resource-service',
+  },
+  {
+    file: 'src/modules/project/composition.ts',
+    names: ['projectServicesOver'],
+    is: 'a composition root',
+  },
+];
+
+/** Files every declaration of which is infrastructure, by what the file is. */
+function forbiddenFile(path: string): string | undefined {
+  // Wherever the package is installed: a linked `node_modules` resolves outside the checkout.
+  if (/(^|\/)node_modules\/di-bag\//.test(path)) return 'a bag';
+  if (path === 'apps/wbs/fe-01/src/lib/project-stream.ts') return 'a socket';
+  if (/^apps\/wbs\/fe-01\/src\/modules\/[^/]+\/[^/]+\.resource\.ts$/.test(path)) {
+    return 'a resource-service';
+  }
+  if (/^apps\/wbs\/fe-01\/src\/modules\/[^/]+\/[^/]+\.repository\.ts$/.test(path))
+    return 'a repository';
+  if (/^apps\/wbs\/fe-01\/src\/modules\/[^/]+\/composition\.ts$/.test(path))
+    return 'a composition root';
+  return undefined;
+}
+
+/** The browser globals that are a socket or storage, as the DOM library declares them. */
+const FORBIDDEN_GLOBALS: readonly { names: readonly string[]; is: string }[] = [
+  { names: ['WebSocket'], is: 'a socket' },
+  {
+    names: [
+      'localStorage',
+      'sessionStorage',
+      'indexedDB',
+      'Storage',
+      'IDBFactory',
+      'WindowLocalStorage',
+      'WindowSessionStorage',
+    ],
+    is: 'storage',
+  },
+];
+
+/**
+ * The types delivery is handed by a context, a route or a runtime: none of
+ * their members may be typed as infrastructure.
+ */
+const CONTEXT_TYPES: readonly { file: string; name: string }[] = [
+  { file: 'src/runtime/application-runtime.ts', name: 'ApplicationServices' },
+  { file: 'src/runtime/session-runtime.ts', name: 'SessionRuntime' },
+  { file: 'src/modules/project/contract.ts', name: 'ProjectRuntime' },
+  { file: 'src/app-router.tsx', name: 'SignedInRegion' },
+];
+
+/**
+ * Every route by which delivery reaches infrastructure today, each with the
+ * task that owns removing it. The check refuses any route not listed here, and
+ * any route listed here that no longer exists, so this list only shrinks.
+ */
+const OWED: readonly string[] = [];
+
+function underRepository(fileName: string): string {
+  return relative(REPOSITORY, fileName).replaceAll('\\', '/');
+}
+
+/** The fe-01 application program, with its own `tsconfig.app.json` options. */
+function applicationProgram(rootNames: readonly string[]): ts.Program {
+  const configPath = join(APP, 'tsconfig.app.json');
+  const read = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
+  if (read.error !== undefined) {
+    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, ' '));
+  }
+  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, APP);
+  if (parsed.errors.length > 0) {
+    throw new Error(
+      `refused tsconfig.app.json: ${parsed.errors.map((each) => each.code).join(', ')}`,
+    );
+  }
+  return ts.createProgram({
+    rootNames: rootNames.map((path) => join(APP, path)),
+    options: { ...parsed.options, noEmit: true },
+  });
+}
+
+/** The end of an alias chain, and every symbol passed through on the way. */
+function aliasChain(checker: ts.TypeChecker, symbol: ts.Symbol): readonly ts.Symbol[] {
+  const chain = [symbol];
+  let current = symbol;
+  while ((current.flags & ts.SymbolFlags.Alias) !== 0) {
+    const next = checker.getAliasedSymbol(current);
+    if (chain.includes(next)) break;
+    chain.push(next);
+    current = next;
+  }
+  return chain;
+}
+
+/** The module specifier of a node that introduces one. */
+function moduleSpecifierOf(node: ts.Node): ts.Expression | undefined {
+  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
+  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
+    return node.argument.literal;
+  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
+    return node.arguments[0];
+  }
+  return undefined;
+}
+
+/** The declarations whose members are also forbidden: interfaces, classes and type literals. */
+function containerOf(declaration: ts.Node): ts.Node | undefined {
+  if (ts.isSourceFile(declaration)) return undefined;
+  const parent = declaration.parent;
+  if (ts.isInterfaceDeclaration(parent) || ts.isClassDeclaration(parent)) return parent;
+  if (ts.isTypeLiteralNode(parent) && ts.isTypeAliasDeclaration(parent.parent))
+    return parent.parent;
+  return undefined;
+}
+
+function nameOf(container: ts.Node): ts.Identifier | undefined {
+  if (
+    ts.isInterfaceDeclaration(container) ||
+    ts.isClassDeclaration(container) ||
+    ts.isTypeAliasDeclaration(container)
+  ) {
+    return container.name;
+  }
+  return undefined;
+}
+
+interface Judge {
+  /** What a symbol is, when it is infrastructure. */
+  readonly infrastructure: (symbol: ts.Symbol) => string | undefined;
+  readonly checker: ts.TypeChecker;
+  readonly program: ts.Program;
+}
+
+function judgeOver(program: ts.Program): Judge {
+  const checker = program.getTypeChecker();
+  const forbidden = new Map<ts.Symbol, string>();
+  for (const { file, names, is } of FORBIDDEN_EXPORTS) {
+    const source = program.getSourceFile(join(APP, file));
+    if (source === undefined) throw new Error(`the program holds no ${file}`);
+    const moduleSymbol = checker.getSymbolAtLocation(source);
+    if (moduleSymbol === undefined) throw new Error(`${file} is not a module`);
+    const exports = checker.getExportsOfModule(moduleSymbol);
+    for (const name of names) {
+      const exported = exports.find((each) => each.name === name);
+      if (exported === undefined) throw new Error(`${file} exports no ${name}`);
+      for (const symbol of aliasChain(checker, exported)) forbidden.set(symbol, is);
+    }
+  }
+  const dom = program.getSourceFiles().find((each) => each.fileName.endsWith('/lib.dom.d.ts'));
+  if (dom === undefined) throw new Error('the program holds no DOM library');
+  const globals = checker.getSymbolsInScope(dom, ts.SymbolFlags.Value | ts.SymbolFlags.Type);
+  for (const { names, is } of FORBIDDEN_GLOBALS) {
+    for (const name of names) {
+      const symbol = globals.find((each) => each.name === name);
+      if (symbol === undefined) throw new Error(`the DOM library declares no ${name}`);
+      forbidden.set(symbol, is);
+    }
+  }
+
+  const infrastructure = (symbol: ts.Symbol): string | undefined => {
+    for (const each of aliasChain(checker, symbol)) {
+      const named = forbidden.get(each);
+      if (named !== undefined) return named;
+      for (const declaration of each.declarations ?? []) {
+        const byFile = forbiddenFile(underRepository(declaration.getSourceFile().fileName));
+        if (byFile !== undefined) return byFile;
+        const container = containerOf(declaration);
+        const name = container === undefined ? undefined : nameOf(container);
+        const owner = name === undefined ? undefined : checker.getSymbolAtLocation(name);
+        const byOwner = owner === undefined ? undefined : forbidden.get(owner);
+        if (byOwner !== undefined) return byOwner;
+      }
+    }
+    return undefined;
+  };
+  return { infrastructure, checker, program };
+}
+
+/** The routes by which delivery reaches infrastructure, one per file and kind. */
+function deliveryRoutes(judge: Judge, files: readonly string[]): readonly string[] {
+  const { checker, program, infrastructure } = judge;
+  const routes = new Set<string>();
+  for (const path of files) {
+    const source = program.getSourceFile(join(APP, path));
+    if (source === undefined) throw new Error(`the program holds no ${path}`);
+    const judgeSymbol = (symbol: ts.Symbol | undefined, how: string): void => {
+      if (symbol === undefined) return;
+      const is = infrastructure(symbol);
+      if (is !== undefined) routes.add(`${path}: ${how} is ${is}`);
+    };
+    const visit = (node: ts.Node): void => {
+      const specifier = moduleSpecifierOf(node);
+      if (specifier !== undefined) {
+        const moduleSymbol = checker.getSymbolAtLocation(specifier);
+        const declared = moduleSymbol?.declarations?.[0]?.getSourceFile().fileName;
+        const byFile =
+          declared === undefined ? undefined : forbiddenFile(underRepository(declared));
+        if (byFile !== undefined) routes.add(`${path}: ${specifier.getText()} is ${byFile}`);
+      }
+      if (ts.isIdentifier(node)) judgeSymbol(checker.getSymbolAtLocation(node), node.text);
+      if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
+        judgeSymbol(
+          checker.getSymbolAtLocation(node.argumentExpression),
+          node.argumentExpression.text,
+        );
+      }
+      if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
+        const key = node.propertyName ?? node.name;
+        if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) {
+          judgeSymbol(checker.getTypeAtLocation(node.parent).getProperty(key.text), key.text);
+        }
+      }
+      ts.forEachChild(node, visit);
+    };
+    visit(source);
+  }
+  return [...routes].sort();
+}
+
+/** The members of each context type that are typed as infrastructure. */
+function contextRoutes(judge: Judge): readonly string[] {
+  const { checker, program, infrastructure } = judge;
+  const routes: string[] = [];
+  for (const { file, name } of CONTEXT_TYPES) {
+    const source = program.getSourceFile(join(APP, file));
+    if (source === undefined) throw new Error(`the program holds no ${file}`);
+    const moduleSymbol = checker.getSymbolAtLocation(source);
+    const declared =
+      moduleSymbol === undefined
+        ? undefined
+        : checker.getExportsOfModule(moduleSymbol).find((each) => each.name === name);
+    if (declared === undefined) throw new Error(`${file} exports no ${name}`);
+    for (const member of checker.getDeclaredTypeOfSymbol(declared).getProperties()) {
+      const type = checker.getNonNullableType(checker.getTypeOfSymbol(member));
+      const parts = type.isUnion() ? type.types : [type];
+      for (const part of parts) {
+        const symbols = [part.aliasSymbol, part.getSymbol()].filter((each) => each !== undefined);
+        const is = symbols.map(infrastructure).find((each) => each !== undefined);
+        if (is !== undefined) routes.push(`${name}.${member.name} is ${is}`);
+      }
+    }
+  }
+  return [...new Set(routes)].sort();
+}
+
+describe('delivery reaches no infrastructure', () => {
+  it('refuses every route but the ones still owed', () => {
+    const files = deliveryFiles();
+    expect(files).toContain('src/components/wbs/project-page.tsx');
+    const program = applicationProgram([
+      ...files,
+      ...FORBIDDEN_EXPORTS.map(({ file }) => file),
+      ...CONTEXT_TYPES.map(({ file }) => file),
+    ]);
+    const judge = judgeOver(program);
+    const found = [...deliveryRoutes(judge, files), ...contextRoutes(judge)].sort();
+    expect(found).toEqual([...OWED].sort());
+  }, 120_000);
+});
```

### 7.11 The ledger, task 13's note and the lifetime map — slice 3

```diff
diff --git a/apps/wbs/fe-01/src/delivery-boundaries.test.ts b/apps/wbs/fe-01/src/delivery-boundaries.test.ts
--- a/apps/wbs/fe-01/src/delivery-boundaries.test.ts
+++ b/apps/wbs/fe-01/src/delivery-boundaries.test.ts
@@ -133,7 +133,32 @@
  * task that owns removing it. The check refuses any route not listed here, and
  * any route listed here that no longer exists, so this list only shrinks.
  */
-const OWED: readonly string[] = [];
+const OWED: readonly string[] = [
+  // The project catalog and the archival import: the catalog facade, task 13's remainder.
+  'src/app-router.tsx: ProjectApi is a broad HTTP client',
+  'src/components/wbs/project-page.tsx: ProjectApi is a broad HTTP client',
+  'src/components/wbs/project-page.tsx: createProject is a broad HTTP client',
+  'src/components/wbs/project-page.tsx: httpProjectApi is a broad HTTP client',
+  'src/components/wbs/project-page.tsx: listProjects is a broad HTTP client',
+  'src/components/wbs/project-page.tsx: openProject is a broad HTTP client',
+  'src/components/wbs/project-page.tsx: renameProject is a broad HTTP client',
+  'src/components/wbs/use-plan-import.ts: ProjectApi is a broad HTTP client',
+  'src/components/wbs/use-plan-import.ts: importPlan is a broad HTTP client',
+  'SignedInRegion.projectApi is a broad HTTP client',
+  // The project runtime's source, which the page still builds: task 13's remainder.
+  "src/components/wbs/project-page.tsx: '@/lib/project-stream' is a socket",
+  "src/components/wbs/project-page.tsx: '@/modules/project/composition' is a composition root",
+  'src/components/wbs/project-page.tsx: ProjectStreamDeps is a socket',
+  'src/components/wbs/project-page.tsx: projectServicesOver is a composition root',
+  'src/components/wbs/project-page.tsx: subscribeToProject is a socket',
+  // The saved-plan shelf, which has no feature facade yet: task 10's.
+  'src/components/wbs/saved-plans-panel.tsx: SavedPlanApi is a broad HTTP client',
+  'src/components/wbs/saved-plans-panel.tsx: compare is a broad HTTP client',
+  'src/components/wbs/saved-plans-panel.tsx: httpSavedPlanApi is a broad HTTP client',
+  'src/components/wbs/saved-plans-panel.tsx: rename is a broad HTTP client',
+  // The resource beneath `remembered`, for `src/lib/remembered.ts` alone: task 12's accepted debt.
+  'ApplicationServices.preferences is a resource-service',
+];

 function underRepository(fileName: string): string {
   return relative(REPOSITORY, fileName).replaceAll('\\', '/');
diff --git a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
index 87f9872b0..fe6fc5ae7 100644
--- a/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
+++ b/docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md
@@ -131,6 +131,8 @@ Two gaps must be handled as extraction work, not bypassed by context: project ca

 Update, observed 2026-09-24 (050.7h, OpenSpec task 9): the broad `ProjectApi` no longer serves the command extractions or any plan module. `ProjectPage` holds it for the project catalog and the archival import, which are the session's, and hands it to `projectServicesOver` (`apps/wbs/fe-01/src/modules/project/composition.ts`) only; the table, its hooks, its toolbar and its columns receive `ProjectServices` and `PlanCommands`. The command policy itself still lives in the table's hooks — the command services' extraction, each over a narrower port, remains a prerequisite of the final project surface.

+Update, observed <observed-date-l> (050.7l, OpenSpec tasks 12 and 13): exact lifecycle test 15 is `apps/wbs/fe-01/src/delivery-boundaries.test.ts`. It judges delivery by symbol identity through the TypeScript checker — the declarations a use resolves to, never its spelling — and the four context types by their members' types, and it refuses every route to a bag, a broad client, a repository or port, a resource-service, a composition root, a socket or browser storage but a closed list of routes still owed, each naming its owner; that list only shrinks, because a route that has gone fails the check until it is struck. The catalog facade above is the largest owner: until it exists `ProjectPage` still builds `httpProjectApi(token)` and the project runtime's source, and the router's region still carries the token and an injected `ProjectApi`. Each frontend module also type-checks alone (`typecheck:module`, which `typecheck` depends on) and is a registered wiki module.
+
 ## Replacement and cleanup policy

 Routine consequences already fixed by the accepted design:
diff --git a/openspec/changes/adopt-frontend-lifetimes/tasks.md b/openspec/changes/adopt-frontend-lifetimes/tasks.md
index 50b1dfc90..fb34514b1 100644
--- a/openspec/changes/adopt-frontend-lifetimes/tasks.md
+++ b/openspec/changes/adopt-frontend-lifetimes/tasks.md
@@ -162,3 +162,19 @@
       theirs in `module.test.ts`.
 - [ ] 13. No infrastructure escapes a context: the architecture checks refuse a
       bag, credential, broad client, repository or resource in delivery.
+      Moved by 050-7-l, observed <observed-date-l>: `apps/wbs/fe-01/src/delivery-boundaries.test.ts`
+      resolves every identifier, module specifier, string-keyed element access and
+      destructured property of delivery — `src/components`, `src/app-router.tsx` and each
+      module's `view/` — through the TypeScript checker, and refuses any that is a bag, a
+      broad HTTP client, a repository or its port, a resource-service, a composition root,
+      a socket or browser storage, and any member of `ApplicationServices`,
+      `SessionRuntime`, `ProjectRuntime` or `SignedInRegion` typed as one. It refuses every
+      route but twenty recorded as still owed, and a recorded route that has gone. This
+      box stays unchecked for those routes: the project catalog and the archival import on
+      `ProjectApi` in `ProjectPage`, `usePlanImport` and the router's region, with the
+      header token `httpProjectApi` is built from, and the project runtime's source — the
+      socket and `projectServicesOver` — that `ProjectPage` still builds, all of which the
+      lifetime map's catalog facade moves into the session runtime (this task's
+      remainder); the saved-plan shelf's client (task 10); and the application's
+      `preferences` resource, task 12's accepted debt. A credential is a string, so the
+      check follows it only where a factory that takes one is reached.
```

## 8. Proofs

Every fault below was injected for real in the planner's rehearsal on 2026-09-24, on the rehearsal
commit of the slice that owns it, through the same `run-fault.sh`: its runner watched with the status
and text its record gives, the files restored and compared, before the next fault. The executor
repeats each one and writes the adjacent `Proof:` comment **only after observing its own result**,
dated with its own observed date — never copied from this document, never before the observation.
Faults that share a site share one comment block, one sentence each.

Two faults per slice kind are **positive** observations — the fault removes the protective part and
the check then lets the bad route through (`t4`, `t6`, and `t2b`, which shows the application's own
check does not see what `t2` sees). For those, status `0` is the observed fact.

### 8.1 Slice 1 — the isolated type check (`apps/wbs/fe-01/src/modules/tsconfig.module.json`, `tools/tool-devsync/workspace-inventory.mjs`)

The records for `$TMPDIR/proofs.txt` (`t2b` and `t2c` reuse `t2`'s patch):

```text
t1
module
1
TS2554: Expected 1 arguments, but got 0.
t2
module
1
plan-feed/plan-feed.resource.ts' is not listed within the file list of project
t2b
app
0
-
t2c
gate
nz
Tasks not run because their dependencies failed
t3
module
1
components/ui/button.tsx' is not listed within the file list of project
t4
module
0
Successfully ran target typecheck:module for project wbs-fe-01
t5
module
1
TS5058: The specified path does not exist
t6
gate
0
Successfully ran target typecheck for project wbs-fe-01
t7
inventory
1
-   "apps/wbs/fe-01/src/modules/calendar-markers/tsconfig.json
```

| Id    | Fault                                                                               | Observed (rehearsed)                                                                                                                                                                | Comment above                                                                                                  |
| ----- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `t1`  | a module breaks its own types: `undo` loses its bound project                       | `status=1`; `plan-commands.feature.ts:14:31 - error TS2554: Expected 1 arguments, but got 0.`                                                                                       | `"extends": …` (the target)                                                                                    |
| `t2`  | `plan-commands` imports a sibling's private file, `../plan-feed/plan-feed.resource` | `status=1`; four TS6307, among them `File '…/plan-feed/plan-feed.resource.ts' is not listed within the file list of project '…/plan-commands/tsconfig.json'`                        | `"composite": true,`                                                                                           |
| `t2b` | the same import, against the application's own `tsc --build`                        | `status=0` — the application's check does not see it                                                                                                                                | `"composite": true,` (with `t2`)                                                                               |
| `t2c` | the same import, against `wbs-fe-01:typecheck`                                      | `status=130`; `Tasks not run because their dependencies failed`, `Failed tasks: - wbs-fe-01:typecheck:module`                                                                       | `"extends": …` (with `t1`)                                                                                     |
| `t3`  | `preferences` imports a component, `@/components/ui/button`                         | `status=1`; five TS6307, the first naming `components/ui/button.tsx`                                                                                                                | `"composite": true,` (with `t2`)                                                                               |
| `t4`  | `composite` removed from the base, with `t2`'s import                               | `status=0`; `Successfully ran target typecheck:module` — without `composite` the check sees nothing                                                                                 | `"composite": true,` (with `t2`)                                                                               |
| `t5`  | `preferences/tsconfig.json` deleted                                                 | `status=1`; `error TS5058: The specified path does not exist: '…/preferences/tsconfig.json'.`                                                                                       | `"extends": …` (with `t1`)                                                                                     |
| `t6`  | `typecheck`'s `dependsOn` removed, with `t2`'s import                               | `status=0`; `Successfully ran target typecheck for project wbs-fe-01` — without the dependency the gate's step misses it                                                            | `"extends": …` (with `t1`)                                                                                     |
| `t7`  | the inventory reads each project's root alone again: a directory is skipped         | `status=1`; `@@ -3,69 +3,10 @@`, the first missing row `-   "apps/wbs/fe-01/src/modules/calendar-markers/tsconfig.json␀extends␀../tsconfig.module.json",` (`␀` is a NUL in the log) | `if (entry.isDirectory()) found.push(...(await projectConfigFiles(root, path)));` in `workspace-inventory.mjs` |

"`"extends": …`" is the line `"extends": "../../tsconfig.spec.json",` of `tsconfig.module.json`; the
comment goes directly above it, below the file's opening comment block. `t2c`'s status `130` is how
this Nx reports a task skipped because its dependency failed; any nonzero status is the fact.

#### Proof t1 — a module breaks its own types

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
index b72a11d8c..c5b7b14ed 100644
--- a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
@@ -11,7 +11,7 @@ import type { PlanCommandPorts, PlanCommands } from './contract';
 // @capability wbs-table-modules
 export function createPlanCommands({ projectId, routes }: PlanCommandPorts): PlanCommands {
   return {
-    undo: (...rest) => routes.undo(projectId, ...rest),
+    undo: (...rest) => routes.undo(...rest),
     redo: (...rest) => routes.redo(projectId, ...rest),
     // Proof: on 2026-09-24, wrapping the route's promise in another (`.then((plan) => plan)`)
     // failed `sends every project command to the project it was bound to, with the rest as
```

#### Proof t2 — a module imports a sibling's private file

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
index b72a11d8c..3bb79ecbe 100644
--- a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
@@ -1,3 +1,4 @@
+import '../plan-feed/plan-feed.resource';
 import type { PlanCommandPorts, PlanCommands } from './contract';

 /**
```

#### Proof t3 — a module imports a component

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/preference-keys.ts b/apps/wbs/fe-01/src/modules/preferences/preference-keys.ts
index 02e69af6c..9311ad6b3 100644
--- a/apps/wbs/fe-01/src/modules/preferences/preference-keys.ts
+++ b/apps/wbs/fe-01/src/modules/preferences/preference-keys.ts
@@ -1,3 +1,4 @@
+import '@/components/ui/button';
 /**
  * Every key this app writes into browser storage, in one place.
  *
```

#### Proof t4 — the base without `composite`

```diff
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
index b72a11d8c..3bb79ecbe 100644
--- a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
@@ -1,3 +1,4 @@
+import '../plan-feed/plan-feed.resource';
 import type { PlanCommandPorts, PlanCommands } from './contract';

 /**
diff --git a/apps/wbs/fe-01/src/modules/tsconfig.module.json b/apps/wbs/fe-01/src/modules/tsconfig.module.json
index 99f634574..8286667f8 100644
--- a/apps/wbs/fe-01/src/modules/tsconfig.module.json
+++ b/apps/wbs/fe-01/src/modules/tsconfig.module.json
@@ -16,7 +16,6 @@
   // may not disable declaration emit; the target passes `--noEmit`.
   "extends": "../../tsconfig.spec.json",
   "compilerOptions": {
-    "composite": true,
     "declaration": true,
     "emitDeclarationOnly": true,
     "outDir": "../../../../../dist/out-tsc/fe-01-modules"
```

#### Proof t5 — a module directory without its configuration

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/tsconfig.json b/apps/wbs/fe-01/src/modules/preferences/tsconfig.json
deleted file mode 100644
index 311a04c64..000000000
--- a/apps/wbs/fe-01/src/modules/preferences/tsconfig.json
+++ /dev/null
@@ -1 +0,0 @@
-{ "extends": "../tsconfig.module.json" }
```

#### Proof t6 — `typecheck` without its dependency

```diff
diff --git a/apps/wbs/fe-01/project.json b/apps/wbs/fe-01/project.json
index 81eb71b61..824fc738a 100644
--- a/apps/wbs/fe-01/project.json
+++ b/apps/wbs/fe-01/project.json
@@ -72,7 +72,6 @@
     },
     "typecheck": {
       "executor": "nx:run-commands",
-      "dependsOn": ["typecheck:module"],
       "options": {
         "command": "bunx tsc --build --force apps/wbs/fe-01/tsconfig.json"
       }
diff --git a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
index b72a11d8c..3bb79ecbe 100644
--- a/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
+++ b/apps/wbs/fe-01/src/modules/plan-commands/plan-commands.feature.ts
@@ -1,3 +1,4 @@
+import '../plan-feed/plan-feed.resource';
 import type { PlanCommandPorts, PlanCommands } from './contract';

 /**
```

#### Proof t7 — the inventory blind below a project's root

```diff
diff --git a/tools/tool-devsync/workspace-inventory.mjs b/tools/tool-devsync/workspace-inventory.mjs
index 5dd9857d4..2bdcbe88e 100644
--- a/tools/tool-devsync/workspace-inventory.mjs
+++ b/tools/tool-devsync/workspace-inventory.mjs
@@ -35,7 +35,7 @@ async function projectConfigFiles(root, directory) {
       continue;
     }
     const path = `${directory}/${entry.name}`;
-    if (entry.isDirectory()) found.push(...(await projectConfigFiles(root, path)));
+    if (entry.isDirectory()) continue;
     else if (isProjectConfig(entry.name)) found.push(path);
   }
   return found;
```

### 8.2 Slice 2 — the registration (`apps/wiki/cli/src/policy/pilot-policy.test.ts`)

The records for `$TMPDIR/proofs.txt`:

```text
w1
pins
1
unindexed candidate path in apps/wbs/fe-01/src/modules/preferences/README.md: apps/wbs/fe-01/src/modules/preferences/tsconfig.json
w2
pins
1
expect(modules.length).toBe(policy.boundaries.length);
w3
pins
1
"path": "apps/fe-01/src/lib/remembered.ts",
```

| Id   | Fault                                                                                                          | Observed (rehearsed)                                                                                                                                                        | Comment above                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `w1` | `tsconfig.json` left out of the preferences index                                                              | `status=1`, `0 pass`, `1 fail`; `error: unindexed candidate path in apps/wbs/fe-01/src/modules/preferences/README.md: apps/wbs/fe-01/src/modules/preferences/tsconfig.json` | `'apps/wbs/fe-01/src/modules/calendar-markers/README.md',` in `pilotPaths`                                                                          |
| `w2` | the preferences row dropped from `modules.json`, its boundary kept                                             | `status=1`; at `expect(modules.length).toBe(policy.boundaries.length);`, `Expected: 30`, `Received: 29`                                                                     | the same                                                                                                                                            |
| `w3` | the preferences boundary's source selector re-pointed at the namespaced `apps/wbs/fe-01/src/lib/remembered.ts` | `status=1`; the frozen-revision comparison received `[{ "blob": "7ec3f1f0…", "mode": "100644", "path": "apps/fe-01/src/lib/remembered.ts" }]` against `[]`                  | the same                                                                                                                                            |
| pin  | (slice 2 step 8, not a fault patch) the legacy pin before and after the registration                           | `71 → 87`, `289 → 305`, digest as observed                                                                                                                                  | the digest line of `every legacy source occurrence …`, in `repo-namespacing-handoff.test.ts`, below the Optimization and Solver supervisor sentence |

The `w2` counts are this base's (22 existing rows, eight added); the fact is that the two counts
differ by the one dropped row. **Rehearsed and not a fault:** dropping the row **and** its boundary
together left the `pins …` test green (section 3.2).

#### Proof w1 — a module file its index leaves out

```diff
diff --git a/apps/wbs/fe-01/src/modules/preferences/README.md b/apps/wbs/fe-01/src/modules/preferences/README.md
index 630ec43b0..fdb14d225 100644
--- a/apps/wbs/fe-01/src/modules/preferences/README.md
+++ b/apps/wbs/fe-01/src/modules/preferences/README.md
@@ -1,6 +1,6 @@
 # Preferences

-<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.preferences","memberships":[{"kind":"path","path":"browser-storage.repository.test.ts"},{"kind":"path","path":"browser-storage.repository.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"fake-browser-storage.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"preference-keys.ts"},{"kind":"path","path":"preferences.feature.test.ts"},{"kind":"path","path":"preferences.feature.ts"},{"kind":"path","path":"preferences.resource.test.ts"},{"kind":"path","path":"preferences.resource.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/gantt-detail.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/remembered-layout.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/lib/remembered.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/lib/theme.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/application-runtime.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/application-services-context.tsx"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->
+<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.preferences","memberships":[{"kind":"path","path":"browser-storage.repository.test.ts"},{"kind":"path","path":"browser-storage.repository.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"fake-browser-storage.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"preference-keys.ts"},{"kind":"path","path":"preferences.feature.test.ts"},{"kind":"path","path":"preferences.feature.ts"},{"kind":"path","path":"preferences.resource.test.ts"},{"kind":"path","path":"preferences.resource.ts"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/gantt-detail.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/remembered-layout.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/lib/remembered.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/lib/theme.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/application-runtime.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/application-services-context.tsx"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->

 Everything this browser remembers for its reader: the palette they chose, whether the chart shows
 its detail, which project they had open, how wide each column was, which settings tab they were
```

#### Proof w2 — a module's mapping row dropped

```diff
diff --git a/docs/wiki-policy/modules.json b/docs/wiki-policy/modules.json
index f8e5e8f02..a015dfdc7 100644
--- a/docs/wiki-policy/modules.json
+++ b/docs/wiki-policy/modules.json
@@ -748,34 +748,6 @@
         ]
       }
     },
-    {
-      "moduleId": "module.frontend.preferences",
-      "name": "Preferences frontend module",
-      "memberships": [
-        {
-          "kind": "directory-prefix",
-          "prefix": "apps/wbs/fe-01/src/modules/preferences",
-          "exclusions": []
-        }
-      ],
-      "predecessorModuleIds": [],
-      "indexPath": "apps/wbs/fe-01/src/modules/preferences/README.md",
-      "externalConsumers": {
-        "kind": "declared",
-        "memberships": [
-          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/gantt-detail.ts" },
-          {
-            "kind": "path",
-            "path": "apps/wbs/fe-01/src/components/wbs/project-settings-modal.tsx"
-          },
-          { "kind": "path", "path": "apps/wbs/fe-01/src/components/wbs/remembered-layout.ts" },
-          { "kind": "path", "path": "apps/wbs/fe-01/src/lib/remembered.ts" },
-          { "kind": "path", "path": "apps/wbs/fe-01/src/lib/theme.ts" },
-          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/application-runtime.ts" },
-          { "kind": "path", "path": "apps/wbs/fe-01/src/runtime/application-services-context.tsx" }
-        ]
-      }
-    },
     {
       "moduleId": "module.frontend.project",
       "name": "Project frontend module",
```

#### Proof w3 — a boundary bound to a file the frozen revision does not hold

```diff
diff --git a/docs/wiki-policy/policy.json b/docs/wiki-policy/policy.json
index 6fb90cec5..7fe96ee73 100644
--- a/docs/wiki-policy/policy.json
+++ b/docs/wiki-policy/policy.json
@@ -1276,7 +1276,7 @@
     {
       "boundaryId": "boundary.frontend.preferences",
       "selector": { "kind": "prefix", "value": "apps/wbs/fe-01/src/modules/preferences" },
-      "sourceSelector": { "kind": "prefix", "value": "apps/fe-01/src/lib/remembered.ts" },
+      "sourceSelector": { "kind": "prefix", "value": "apps/wbs/fe-01/src/lib/remembered.ts" },
       "baselineEntries": [
         {
           "mode": "100644",
```

### 8.3 Slice 3 — the architecture check (`apps/wbs/fe-01/src/delivery-boundaries.test.ts`)

Every fault but `c1` and `o1` appends two lines at most to `src/components/chrome/page-nav.tsx`, a
delivery file neither packet i nor k touches; `c1` adds a member to `ProjectRuntime` in
`src/modules/project/contract.ts`; `o1` narrows `SignedInRegion.projectApi` in `src/app-router.tsx`.
None needs to type-check: Vitest transpiles and the check reads the program the checker builds.

```text
d1
delivery
1
"src/components/chrome/page-nav.tsx: httpDirectoryApi is a broad HTTP client",
d2
delivery
1
"src/components/chrome/page-nav.tsx: connect is a broad HTTP client",
d3
delivery
1
"src/components/chrome/page-nav.tsx: httpDirectoryApi is a broad HTTP client",
d4
delivery
1
"src/components/chrome/page-nav.tsx: DirectoryApi is a broad HTTP client",
d5
delivery
1
"src/components/chrome/page-nav.tsx: localStorage is storage",
d6
delivery
1
"src/components/chrome/page-nav.tsx: getItem is storage",
d7
delivery
1
"src/components/chrome/page-nav.tsx: sessionStorage is storage",
d8
delivery
1
"src/components/chrome/page-nav.tsx: WebSocket is a socket",
d9
delivery
1
"src/components/chrome/page-nav.tsx: 'di-bag' is a bag",
d10
delivery
1
"src/components/chrome/page-nav.tsx: createDirectory is a resource-service",
c1
delivery
1
"ProjectRuntime.client is a broad HTTP client",
o1
delivery
1
"SignedInRegion.projectApi is a broad HTTP client",
```

Each is `status=1`, `Tests 1 failed (1)`, the received list gaining (or, for `o1`, losing) the lines
below:

| Id    | Bypass class                                               | Observed lines                                                                                                      | Comment above                                                                                  |
| ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `d1`  | named import of a client factory                           | `+ …: httpDirectoryApi is a broad HTTP client`                                                                      | `file: 'src/lib/wbs-api.ts',`                                                                  |
| `d2`  | renamed import, `httpDirectoryApi as connect`              | `+ …: connect is …`, `+ …: httpDirectoryApi is …`                                                                   | the same                                                                                       |
| `d3`  | namespace import, string-keyed `wbs['httpDirectoryApi']`   | `+ …: httpDirectoryApi is a broad HTTP client`                                                                      | `if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {` |
| `d4`  | `import type * as wbs`, `wbs.DirectoryApi`                 | `+ …: DirectoryApi is a broad HTTP client`                                                                          | `file: 'src/lib/wbs-api.ts',` (with `d1`)                                                      |
| `d5`  | shorthand destructuring, `const { localStorage } = window` | `+ …: localStorage is storage`                                                                                      | `if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {`                   |
| `d6`  | the global, `localStorage.getItem('kept')`                 | `+ …: getItem is storage`, `+ …: localStorage is storage`                                                           | `'localStorage',` in `FORBIDDEN_GLOBALS`                                                       |
| `d7`  | a window property, `window.sessionStorage`                 | `+ …: sessionStorage is storage` — a member of `WindowSessionStorage`                                               | `'WindowSessionStorage',`                                                                      |
| `d8`  | `new WebSocket(…)`                                         | `+ …: WebSocket is a socket`                                                                                        | `{ names: ['WebSocket'], is: 'a socket' },`                                                    |
| `d9`  | `import { DiBag } from 'di-bag'`                           | `+ …: 'di-bag' is a bag`, `+ …: DiBag is a bag`, `+ …: createBuilder is a bag`                                      | `if (/(^\|\/)node_modules\/di-bag\//.test(path)) return 'a bag';`                              |
| `d10` | a resource file by path                                    | `+ …: '@/modules/directory/directory.resource' is a resource-service`, `+ …: createDirectory is a resource-service` | `if (/^apps\/wbs\/fe-01\/src\/modules\/[^/]+\/[^/]+\.resource\.ts$/.test(path)) {`             |
| `c1`  | `ProjectRuntime` gains `readonly client: ProjectApi;`      | `+ "ProjectRuntime.client is a broad HTTP client"`                                                                  | `{ file: 'src/modules/project/contract.ts', name: 'ProjectRuntime' },`                         |
| `o1`  | a route paid off: `projectApi?: undefined;`                | `- "SignedInRegion.projectApi is a broad HTTP client"` — and the ledger fails until it is struck                    | `const OWED: readonly string[] = [`                                                            |

(`…` stands for `"src/components/chrome/page-nav.tsx`. In the `d9` row the `\|` is the table's
escape for `|`; the line in the file has none.)

#### Proof d1 — a client factory by a named import

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
index b044a3c4f..8344b99c3 100644
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -50,3 +50,5 @@ export function PageNav() {
     </nav>
   );
 }
+import { httpDirectoryApi } from '@/lib/wbs-api';
+export const client = httpDirectoryApi;
```

#### Proof d2 — a client factory by a renamed import

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
index b044a3c4f..68f3804d1 100644
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -50,3 +50,5 @@ export function PageNav() {
     </nav>
   );
 }
+import { httpDirectoryApi as connect } from '@/lib/wbs-api';
+export const client = connect;
```

#### Proof d3 — a client factory by a string key through a namespace

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
index b044a3c4f..62a281544 100644
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -50,3 +50,5 @@ export function PageNav() {
     </nav>
   );
 }
+import * as wbs from '@/lib/wbs-api';
+export const client = wbs['httpDirectoryApi'];
```

#### Proof d4 — a client type through a type-only namespace

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
index b044a3c4f..c785dede2 100644
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -50,3 +50,5 @@ export function PageNav() {
     </nav>
   );
 }
+import type * as wbs from '@/lib/wbs-api';
+export type Client = wbs.DirectoryApi;
```

#### Proof d5 — storage by shorthand destructuring

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
index b044a3c4f..8fd771b8b 100644
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -50,3 +50,4 @@ export function PageNav() {
     </nav>
   );
 }
+export const { localStorage } = window;
```

#### Proof d6 — storage by the global

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
index b044a3c4f..b147acfba 100644
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -50,3 +50,4 @@ export function PageNav() {
     </nav>
   );
 }
+export const kept = (): string | null => localStorage.getItem('kept');
```

#### Proof d7 — storage by a window property

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
index b044a3c4f..17c344667 100644
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -50,3 +50,4 @@ export function PageNav() {
     </nav>
   );
 }
+export const kept = () => window.sessionStorage;
```

#### Proof d8 — a socket

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
index b044a3c4f..d2b77441f 100644
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -50,3 +50,4 @@ export function PageNav() {
     </nav>
   );
 }
+export const open = () => new WebSocket('ws://localhost');
```

#### Proof d9 — the DI container

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
index b044a3c4f..d21ec5267 100644
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -50,3 +50,5 @@ export function PageNav() {
     </nav>
   );
 }
+import { DiBag } from 'di-bag';
+export const bag = DiBag.createBuilder;
```

#### Proof d10 — a resource-service file

```diff
diff --git a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
index b044a3c4f..1328ccdb7 100644
--- a/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
+++ b/apps/wbs/fe-01/src/components/chrome/page-nav.tsx
@@ -50,3 +50,5 @@ export function PageNav() {
     </nav>
   );
 }
+import { createDirectory } from '@/modules/directory/directory.resource';
+export const directory = createDirectory;
```

#### Proof c1 — a context type handing delivery a client

```diff
diff --git a/apps/wbs/fe-01/src/modules/project/contract.ts b/apps/wbs/fe-01/src/modules/project/contract.ts
index 610adf93e..7c477e652 100644
--- a/apps/wbs/fe-01/src/modules/project/contract.ts
+++ b/apps/wbs/fe-01/src/modules/project/contract.ts
@@ -1,4 +1,5 @@
 import type { RefreshResource } from '@/lib/plan-refresh';
+import type { ProjectApi } from '@/lib/wbs-api';
 import type { ProjectStream } from '@/lib/project-stream';
 import type {
   CalendarMarkerRefusal,
@@ -102,6 +103,7 @@ export interface ProjectSource {
  */
 export interface ProjectRuntime {
   readonly projectId: string;
+  readonly client: ProjectApi;
   /** Whether this runtime is still the one its owner publishes. */
   readonly isCurrent: () => boolean;
   /** Every publication of the feed, folded; the table selects from it. */
```

#### Proof o1 — a route still owed, paid off

```diff
diff --git a/apps/wbs/fe-01/src/app-router.tsx b/apps/wbs/fe-01/src/app-router.tsx
index 47cded860..399113624 100644
--- a/apps/wbs/fe-01/src/app-router.tsx
+++ b/apps/wbs/fe-01/src/app-router.tsx
@@ -30,11 +30,7 @@ export interface SignedInRegion {
   token: string;
   presence: (roster: Roster) => ReactNode;
   account: ReactNode;
-  /**
-   * Injected in tests. Production leaves it out and the project page builds the
-   * real client from `token`, exactly as it already did.
-   */
-  projectApi?: ProjectApi;
+  projectApi?: undefined;
 }

 /** The region, plus the navigation both pages draw and neither owns. */
```

## 9. Verification

### 9.1 Every fenced diff applies, extracted from this document, in slice order

The requirement is not "these diffs were once correct" but "these diffs, as this committed document
spells them, apply in slice order, produce exactly the rehearsal's final tree, and every fault patch
applies to the tree its slice leaves" — on the authoring base, on that base with packets i's and k's
executor output simulated, **and on the real dispatch base**. The script has three modes:

- `fill=0` — the authoring base; the result must be byte-identical to the rehearsal's final commit.
- `fill=1` — the authoring base with a two-line `// Proof:` comment inserted above each of the
  twenty-two comment sites packets i and k name — packet i's twelve in `session-runtime.ts` and three
  in `app.tsx`, packet k's four more in `session-runtime.ts` and three in `app.tsx` — and every
  `<observed-date-i>` and `<observed-date-k>` note dated; between slices 2 and 3 this packet's own
  slice-2 notes are dated too, as its executor does.
- `fill=real` — the base named by `REAL_BASE`: planning after packets i's and k's real lanes, plus
  this packet's commit cherry-picked (section 6, Dispatch). Nothing is filled. The result must change
  exactly the twenty-eight owned paths; every one of them but `tasks.md` and the lifetime map must
  equal the rehearsal's final bytes, and those two must equal them once every `observed <date>` is
  normalised. **This mode's output is the dispatch evidence**: the planner runs it with
  `REAL_BASE=<the reviewed base SHA>` before the first dispatch and records it beside the review.
  Unset, the mode prints that it was skipped and proves nothing.

No script, no Prettier and no `node_modules` are needed: every change is a diff.

````sh
set -euo pipefail
packet=docs/superpowers/plans/2026-09-21-batch-6/050-7-l-isolated-checks-and-architecture.md
base=59cfe22a42c5471fa1f3aa714a722faabce9e8d5
final=dbc6395338f1e3ec2ff779609fafd16b20832112
real_base=${REAL_BASE:-}
test -f "$packet"
# Inserts a two-line comment above the Nth line (default 1) whose trimmed text is exactly $2.
fill_above() {
  file=$1
  anchor=$2
  nth=${3:-1}
  test -f "$file"
  test "$(awk -v a="$anchor" '{ t = $0; sub(/^ +/, "", t) } t == a { n++ } END { print n + 0 }' "$file")" -ge "$nth"
  awk -v a="$anchor" -v n="$nth" '
    { t = $0; sub(/^ +/, "", t) }
    t == a { seen++ }
    t == a && seen == n {
      match($0, /^ */); ind = substr($0, 1, RLENGTH)
      print ind "// Proof: simulated, standing where an executor writes one; the words are"
      print ind "// not knowable from here."
    }
    { print }
  ' "$file" > "$file.filled"
  mv "$file.filled" "$file"
}
# Checks every fault patch named on the command line against the tree.
check_faults() {
  for id in "$@"; do git -C "$work/tree" apply --unidiff-zero --check "$work/mutations/$id.diff"; done
}
# Applies the numbered patches named on the command line, each checked first.
apply_patches() {
  for n in "$@"; do
    git -C "$work/tree" apply --check "$work/patches/$n.diff"
    git -C "$work/tree" apply "$work/patches/$n.diff"
  done
}
# A note with every "observed <date>" normalised, placeholder or date.
dates_of() { sed -E 's/observed (<observed-date-[a-z]+>|[0-9]{4}-[0-9]{2}-[0-9]{2})/observed D/g' "$1"; }
notes="openspec/changes/adopt-frontend-lifetimes/tasks.md docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md"
for fill in 0 1 real; do
  from=$base
  if [ "$fill" = real ]; then
    if [ -z "$real_base" ]; then echo "fill=real skipped: REAL_BASE unset, not dispatch evidence"; continue; fi
    from=$real_base
  fi
  work=$(mktemp -d "${TMPDIR:?}/extract-XXXXXX")
  mkdir -p "$work/patches" "$work/mutations" "$work/tree"
  awk -v out="$work/patches" '
    /^## 7\. The code$/ { inside=1; next }
    /^## 8\. Proofs$/   { inside=0 }
    inside && /^```diff$/ { n++; f=sprintf("%s/%02d.diff", out, n); capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print >> f }
  ' "$packet"
  count=$(find "$work/patches" -name '*.diff' | wc -l)
  echo "fill=$fill extracted=$count"
  test "$count" -eq 11
  awk -v out="$work/mutations" '
    /^## 8\. Proofs$/ { inside=1; next }
    /^## 9\. Verification$/ { inside=0 }
    inside && /^#### Proof / { id=$3; next }
    inside && /^```diff$/ { f=sprintf("%s/%s.diff", out, id); capture=1; next }
    capture && /^```$/ { capture=0; next }
    capture { print >> f }
  ' "$packet"
  count=$(find "$work/mutations" -name '*.diff' | wc -l)
  echo "fill=$fill fault-patches=$count"
  test "$count" -eq 22
  git archive "$from" | tar -x -C "$work/tree"
  fe="$work/tree/apps/wbs/fe-01"
  if [ "$fill" = 1 ]; then
    runtime="$fe/src/runtime/session-runtime.ts"
    # Packet i's eleven slice-1 runtime sites, as its own section 9.1 fills them, and g1;
    # then packet k's four: x1/x5, x4/e2, x6/e3 and x7 (x2/e1 and x3 are packet i's lines).
    for anchor in "if (identity.userId === wanted?.userId) return latest;" "wanted = null;" \
      "await projects.leave();" "isCurrent: () => isCurrent() && dependencies.isCurrent()," \
      "if (!isCurrent()) return;" "return state.status === 'live' && state.services === built;" \
      "return acquireTransactionally(bag, () => ({" \
      "if (refusal instanceof TransitionSupersededError) return;" \
      "? new PartialAcquisitionError(failure.cause, recorded(failure.release))" \
      "return state.status === 'live' && state.services.userId === userId ? state.services : null;" \
      "await owner.leave();" "const slot = createLifetimeSlot<SessionRuntime>(budgetMs);" \
      "if (slot.snapshot().status === 'fatal') return 'fatal';" \
      "return wanted === null ? 'signed-out' : 'overtaken';"; do
      fill_above "$runtime" "$anchor"
    done
    fill_above "$runtime" "refusedByRuntime.add(refusal);" 2
    fill_above "$runtime" "refusedByRuntime.add(refusal);" 1
    test "$(grep -c 'Proof: simulated' "$runtime")" -eq 16
    app="$fe/src/app.tsx"
    # Packet i's g2 to g4, then packet k's a1, a2 and p1.
    for anchor in "if (sessionState.status === 'fatal') return <LifetimeFault fault={sessionState.fault} />;" \
      "void sessionOwner.leave();" \
      "void sessionOwner.open({ userId: session.user.id, credential: session.token });" \
      "account={<ThemedAccountMenu username={session.user.username} onSignOut={signOut} />}" \
      "if (exit === 'signed-out') onSignedOut();" \
      "if (projectState.status === 'fatal' && projectState.terminal)"; do
      fill_above "$app" "$anchor"
    done
    test "$(grep -c 'Proof: simulated' "$app")" -eq 6
    for note in $notes; do
      sed -i -E 's/<observed-date-[ik]>/2026-09-25/g' "$work/tree/$note"
      if grep -n '<observed-date-[ik]>' "$work/tree/$note"; then exit 1; else rc=$?; test "$rc" -eq 1; fi
    done
    echo "fill=1 filled-sites=22, packets i's and k's notes dated"
  fi
  git -C "$work/tree" init -q
  git -C "$work/tree" add -A --force
  git -C "$work/tree" -c user.email=x@example.invalid -c user.name=x commit -qm base
  apply_patches 01 02 03 04
  check_faults t1 t2 t3 t4 t5 t6 t7
  echo "fill=$fill slice 1 applied, its 7 fault patches check"
  apply_patches 05 06 07 08
  check_faults w1 w2 w3
  echo "fill=$fill slice 2 applied, its 3 fault patches check"
  if [ "$fill" = 1 ]; then
    sed -i 's/<observed-date-l>/2026-09-26/g' "$work/tree/openspec/changes/adopt-frontend-lifetimes/tasks.md"
    echo "fill=1 slice 2's two notes dated"
  fi
  apply_patches 09 10 11
  check_faults d1 d2 d3 d4 d5 d6 d7 d8 d9 d10 c1 o1
  echo "fill=$fill slice 3 applied, its 12 fault patches check"
  git -C "$work/tree" status --porcelain --untracked-files=all | wc -l
  mkdir "$work/final"
  git archive "$final" | tar -x -C "$work/final"
  if [ "$fill" = 0 ]; then
    diff -r --exclude=.git "$work/tree" "$work/final"
    echo "fill=0 tree identical to $final"
  elif [ "$fill" = 1 ]; then
    echo "fill=1 simulated comments left: $(cat "$fe/src/runtime/session-runtime.ts" "$fe/src/app.tsx" | grep -c 'Proof: simulated')"
  else
    git -C "$work/tree" status --porcelain --untracked-files=all | cut -c4- | sort > "$work/changed.txt"
    git diff --name-only "$base" "$final" | sort > "$work/owned.txt"
    diff "$work/owned.txt" "$work/changed.txt"
    echo "fill=real changed exactly the $(wc -l < "$work/owned.txt") owned paths"
    while IFS= read -r f; do
      case " $notes " in
        *" $f "*) diff <(dates_of "$work/tree/$f") <(dates_of "$work/final/$f") ;;
        *) cmp "$work/tree/$f" "$work/final/$f" ;;
      esac
    done < "$work/owned.txt"
    echo "fill=real every owned path equals the rehearsal's, the two notes but for dates"
  fi
done
````

Observed on 2026-09-24, after the final Prettier `--check` of this document, with
`REAL_BASE=6de293ec4` — a stand-in for the real dispatch base built for this run only (not on any
branch): packet k's own stand-in `50e4e7e48` (packet i's real slice-2 lane head `e46c8d3d9` with
packet i's slice-3 diffs applied and its notes dated), packet k's six diffs from its packet applied,
and packet k's two notes dated:

```text
fill=0 extracted=11
fill=0 fault-patches=22
fill=0 slice 1 applied, its 7 fault patches check
fill=0 slice 2 applied, its 3 fault patches check
fill=0 slice 3 applied, its 12 fault patches check
28
fill=0 tree identical to dbc6395338f1e3ec2ff779609fafd16b20832112
fill=1 extracted=11
fill=1 fault-patches=22
fill=1 filled-sites=22, packets i's and k's notes dated
fill=1 slice 1 applied, its 7 fault patches check
fill=1 slice 2 applied, its 3 fault patches check
fill=1 slice 2's two notes dated
fill=1 slice 3 applied, its 12 fault patches check
28
fill=1 simulated comments left: 22
fill=real extracted=11
fill=real fault-patches=22
fill=real slice 1 applied, its 7 fault patches check
fill=real slice 2 applied, its 3 fault patches check
fill=real slice 3 applied, its 12 fault patches check
28
fill=real changed exactly the 28 owned paths
fill=real every owned path equals the rehearsal's, the two notes but for dates
```

The stand-in is not the real base: packet i's slice 3 and all of packet k are still rehearsed diffs
there, so its run proves only that packet i's real slices 1 and 2 disturb nothing here.

`git apply --check` prints nothing on success, which is why the script's own `echo` lines are the
evidence and why every count is asserted rather than printed. The number printed after slice 3 is
the paths changed against the base: twenty-eight — every owned path of the three slices but
`verify.md`, which the executor writes. **A failed check stops the run.**

Every **intermediate** tree typechecks: `wbs-fe-01:typecheck` exit 0 on all three rehearsal commits,
each committed with the hooks on. Exactly three trees do not pass their slice's check: the red
checkpoints, each the previous slice's commit plus that slice's contract and test side (section 6
gives each one's diagnostics).

### 9.2 The strict OpenSpec block, reproduced

```sh
set -euo pipefail
mkdir -p "$TMPDIR/evidence"
report=$(mktemp "$TMPDIR/evidence/openspec-validation.XXXXXX.json")
OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json | tee "$report"
jq -s -e '
  length == 1 and
  (.[0] | type == "object") and
  (.[0].summary.totals.failed | type == "number" and floor == . and . == 0) and
  (.[0].summary.totals.passed | type == "number" and floor == . and . > 0)
' "$report" >/dev/null
```

Expected: one JSON report, exit 0. `failed` that is `false` rather than `0` is refused by
`type == "number"`. Rehearsed on the base and after every contract step:
`{"items":114,"passed":114,"failed":0}`.

### 9.3 Commands actually run, and what each reported

All on 2026-09-24, by this packet's author, on the throwaway branch `rehearse/050-7-l` cut at the
authoring base `59cfe22a`, each slice committed **with the hooks on** (lefthook's wiki, secrets,
format and lint checks passed for all three): `02b1d077` (slice 1), `993a7ba3` (slice 2) and
`dbc63953` (slice 3), the final tree section 9.1 compares against. Each red was observed on the
previous slice's commit plus that slice's contract and test side only; each fault was run through
`run-fault.sh` on the final tree, where each file it touches is as its slice left it.

| Check                                                       | Base `59cfe22a` | Slice 1                            | Slice 2                                          | Slice 3                        |
| ----------------------------------------------------------- | --------------- | ---------------------------------- | ------------------------------------------------ | ------------------------------ |
| sandbox node suite (files·tests)                            | 57·713          | 57·713                             | 57·713                                           | 57·713                         |
| `wbs-fe-01:typecheck`, `wbs-fe-01:lint`                     | 0, 0            | 0, 0                               | 0, —                                             | 0, 0                           |
| `wbs-fe-01:typecheck:module`                                | no target       | red: 8 × TS5058; green: 0          | 0                                                | 0                              |
| depth-sensitive inventory suite                             | 4 pass          | red: 59 rows absent; green: 4 pass | 4 pass                                           | 4 pass                         |
| pilot `pins …` test                                         | 1 pass          | 1 pass                             | red: `unknown applicable check …`; green: 1 pass | 1 pass                         |
| whole pilot suite                                           | —               | —                                  | 21 pass, 0 fail (398 s)                          | —                              |
| legacy pin                                                  | 1 pass (289)    | 1 pass (289)                       | red `71→87`, `289→305`; green 1 pass             | 1 pass                         |
| `typecheck` tool-devsync + twilight-burokrat; `lint:source` | —               | —                                  | 0; 0                                             | —                              |
| `delivery-boundaries` + tier guard                          | —               | —                                  | —                                                | red `…(20)` vs `[]`; green 2·6 |
| faults observed, files restored and compared                | —               | 9 of 9                             | 3 of 3                                           | 12 of 12                       |
| strict OpenSpec                                             | 114 · 114 · 0   | 114 · 114 · 0                      | 114 · 114 · 0                                    | 114 · 114 · 0                  |

On the final tree the planner-only runs of section 9.4 gave: `tool-devsync:test` `371 pass`, `0 fail` (26 files);
`wbs-fe-01:test` UTC `147` files, `3095` tests and Auckland `2`·`3`, all passing — `146`·`3094` on the base (one
earlier whole run failed `plan-keyboard.test.tsx` once under load; the file passed alone). On an earlier draft of slice 1 whose base configuration excluded `libs`
tests by one `libs/**` glob, `tool-devsync:test` failed only `every legacy source occurrence …`, on
one more `current recursive selector` — why the exclusion is three explicit globs now.

**Also rehearsed, and not faults:**

- With the element-access clause removed from the check, `d3` **passed**; with the binding clause
  removed, `d5` **passed**; with it back, a renamed destructuring (`const { localStorage: kept } =
window`) is caught by the identifier clause alone. Both clauses are the only witnesses of their
  bypass class.
- Dropping the preferences row **and** its boundary left the `pins …` test green (section 3.2).
- The whole pilot suite, run with the indexes present but `modules.json`, `policy.json` and
  `relationships.json` as on the base, failed three tests — the `pins …` lint, `refuses prose facts
…` and `refuses a selected pilot index omitted …` — each on the first frontend README in path order;
  with the registration, 21 pass. `refuses prose facts …`'s pinned first offender stays
  `apps/wbs/be-01/src/module/optimization/README.md`: `apps/wbs/be-01` sorts before `apps/wbs/fe-01`.
- Faults `t1` to `t6` ran against the slice-1 tree before slice 2 existed, and again on the final
  tree through `run-fault.sh`, with the same statuses and lines.
- This document's own step 0b and fault procedure, extracted from the committed text, reran all
  twenty-four observations on the final tree: every one as its record says, and `git status`
  identical before and after.

### 9.4 Planner-only, with the expected relative delta

| Check                                                                                                                                                                                               | Expected, relative to the base                                                                                   | Planner's own rehearsal                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test:unit`                                                                                                       | unchanged by every slice                                                                                         | 59·736 on the final tree, one known host-load timeout (4.3)  |
| `NX_DAEMON=false env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bunx nx run wbs-fe-01:test`                                                                                                            | UTC: slice 3 **+ 1 file, + 1 test**; Auckland zoned unchanged                                                    | UTC 147·3095 and zoned 2·3 on the final tree (base 146·3094) |
| `NX_DAEMON=false bunx nx run wbs-fe-01:build`                                                                                                                                                       | exit 0 after each slice; no module configuration is read by Vite's build beyond its compiler options             | **Not run.** Pending planner verification.                   |
| `(cd apps/wiki/cli && TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../node_modules bun test --preload ../../../tools/test/scratch/preload.ts src/policy/pilot-policy.test.ts)`, after slice 2's commit | 21 pass, 0 fail — unchanged                                                                                      | 21 pass on slice 2's tree (9.3)                              |
| `bun run apps/wiki/cli/src/cli.ts check-indexes committed . <slice-2 commit>`                                                                                                                       | exit 0; eight `module.frontend.*` indexes                                                                        | `check-indexes working` exit 0 with the eight                |
| `NX_DAEMON=false env -u CLAUDECODE -u AGENT bunx nx run tool-devsync:test --skip-nx-cache`, with each slice committed or staged                                                                     | unchanged; the legacy pin as slice 2 re-pinned it                                                                | 371 pass, 0 fail on the final tree                           |
| `CI=1 E2E_PORT_SHIFT=<…> … bunx nx run wbs-fe-01:e2e`, **unfiltered**, on the final integration commit                                                                                              | exit 0. No reader-visible change; the batch README requires the whole browser suite once a frontend change lands | **Pending planner verification.** Not run, not waived.       |
| `bin/h2puni-gate.sh <sha>`                                                                                                                                                                          | exit 0 on the shared build host — its `typecheck` step now runs `typecheck:module` first                         | **Not run**; reported as pending, never as passed.           |

`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` is not decoration: `CLAUDECODE=1` changes Bun's test
output and fails thirteen unrelated tests in this repository.

### 9.5 What none of this proves

- **Isolation is per list, not per rule.** A module may reach anything in the shared list and its own
  `files`; the lists were cut from what each module reaches today and are reviewed, not derived from
  the K-rules. `plan-writer` and `project` reach delivery through `lib/local-write.ts`, and
  `directory`, `directory-management` and `plan-writer` through `plan-refusal.ts`: recorded in their
  configurations, not refused.
- **The pilot does not require registration.** A module dropped from both `modules.json` and
  `policy.json` goes unnoticed (section 3.2) until WBS `021844c4`'s check.
- **The architecture check does not follow a string** (the credential), does not classify `src/lib`,
  and judges context types one member deep.
- **No browser ran**, and no build: nothing reader-visible changed, and the planner's unfiltered
  Chromium run and build are pending, not waived.
- The authoring base carries packets i's and k's **rehearsed** diffs; section 9.1's `fill=real` run on
  the real base after both lanes land is what proves the rest.

## 10. Stop conditions

Each is false on the rehearsal tree, checked on 2026-09-24.

1. Step 0a's status is not empty, or `base` differs from the slice note's SHA.
2. Step 0b extracts other than 10 patches or other than 21 fault patches.
3. A patch fails `git apply --check`. Stop and report the exact error; never hand-edit a file into
   shape.
4. A baseline (step 0c, or slice 2's `base-pins`) exits non-zero. Stop, except for the known cases in 11.
5. A red checkpoint shows **no** failure, or different diagnostics than section 6 names — for slice
   3, a received list other than section 7.10's twenty entries.
6. A green run differs from its step-0 number by anything but the slice's own additions.
7. A fault's runner does not end as its record says, after the one redo preamble rule 20 allows.
8. The strict OpenSpec block exits non-zero, or `passed` falls below step 0's number.
9. The legacy pin's red in slice 2 shows counts other than `87` and `305`, or any unclassified entry.
   A different **digest** alone is not a stop (slice 2 steps 5 and 8).
10. The pilot `pins …` test cannot clone the repository in the sandbox (a Git permission or
    cross-device error, not a test failure): record it, mark every slice-2 pilot observation pending
    planner verification, and stop after step 6 — do not guess at the faults.
11. **Known, not this packet's:** `spawnSync bun ETIMEDOUT` in `playwright-config.test.ts`, or a single
    Vitest timeout in a suite this packet does not touch, on a loaded host. Record it, rerun **that
    file alone once**, and stop only if it fails again.
12. At hand-over, the status shows any path outside the slice's own list.
13. Anything asks for a `git` state change in the clone, a network call, a browser, or `--no-verify`.

## 11. Out of lane

- Every production source file of fe-01: `src/components`, `src/runtime`, `src/lib`, `app.tsx`,
  `app-router.tsx`, `main.tsx`, every module's source and tests. The faults inject into
  `page-nav.tsx`, `project/contract.ts`, `app-router.tsx`, `plan-commands.feature.ts` and
  `preference-keys.ts` and restore them byte for byte; none is committed.
- `tools/tool-devsync/src/module-labels.test.ts` (frontend label agreement is WBS `021844c4`'s),
  `tools/tool-devsync/src/workspace-inventory.test.ts` (its oracle is the reference slice 1 meets),
  `docs/code-organization/kinds.json`, the backend modules.
- `bun.lock`, `package.json`, `nx.json`, every Vitest configuration and `vitest.node-suites.ts`.

## 12. Hand-over to the next packet

- **Task 13's remainder — the catalog facade.** A session-owned `ProjectCatalog` feature (list,
  create, open, rename, import) over a port cut from a `ProjectApi` the session runtime builds from
  its credential, beside the directory's; the project runtime's source (the client, the socket
  factory, `projectServicesOver`) built by the session and handed to its project owner; `ProjectPage`
  then takes the catalog and the owner and neither `token` nor `api`, and `SignedInRegion` loses
  `token` and `projectApi`. Each of those strikes ledger lines in `delivery-boundaries.test.ts`, which
  fails until they are struck. `testing/project-page-over-owner.tsx` can keep its `api` prop and build
  the catalog and the services from it, so the page's suites need not change. A branded credential
  type would let the check follow the token as well.
- **Task 10** strikes the four saved-plan lines when the shelf gets its feature facade.
- **Task 12's graph checks**: sealing the six unsealed modules gives each a graph and a `check.ts`;
  then WBS `021844c4` can add `{ root: 'apps/wbs/fe-01/src/modules', segment: 'frontend' }` to
  `MODULE_ROOTS`, whose "registers every module in the pilot" clause closes section 3.2's gap. The
  `preferences` resource's ledger line goes when the per-project layout stores get a feature.
- **WBS `6316cf1a`**, the backend twin: this packet's `tsconfig.module.json` shape — composite, one
  shared base with `${configDir}`, `files` per module, a looping target that a `typecheck` depends on
  — carries over; the backend's lists will be longer.
- **Task 11** is untouched and keeps every residual packets i, j and k gave it.

## 13. Assumptions recorded rather than asked

1. **"Isolated" means refuses what it reaches but does not list** (section 3.4, decision 1), the only
   reading under which the backend follow-up's watched negative — "a module importing a sibling's
   private file fails its own target" — can be observed.
2. **The predecessors of section 3.2** are the files each module's code left, read from the module
   READMEs and the commits that created them; two modules share one.
3. **What delivery is** (section 3.6): `src/components`, `app-router.tsx` and `view/`. `app.tsx` is the
   signed-in region's composition root — it builds the session owner and hands it the credential.
4. **Twenty routes recorded, not removed**, each with an owner, rather than a check held back until
   the catalog facade exists.
5. **Task 12 stays unticked** over the six unsealed modules' graph checks: "each module has … its
   graph check" cannot honestly be read as met by the runtime that installs them.
6. **The legacy pin's digest is observed, not prescribed**, in slice 2 step 8: `Proof:` comments of
   unknown length in `pilot-policy.test.ts` move counted lines.

## 14. The brief, point by point

### 14.1 The non-negotiables of the commissioning brief

| Requirement                                                                                                                                                                     | Where this packet meets it                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| every new check has a production-path negative rehearsed red with a `Proof:` comment                                                                                            | section 8: twenty-four observations over twenty-two fault patches, each with its comment site                                       |
| checks resolve by symbol identity, never by import-string regex                                                                                                                 | section 3.3; the only path tests are on **declaration files** the checker resolved to, never on specifier text                      |
| the wiki registration follows the backend pilot: a block naming every non-README file, rows and boundaries, `check-indexes committed` clean, pins re-pinned after observed reds | section 3.2; slice 2's reds (`pins …`, legacy); `check-indexes committed` is the planner's (9.4)                                    |
| if the frontend cannot be registered without a structural change, say what blocks it                                                                                            | nothing blocks it: each module has a frozen-revision predecessor (section 3.2)                                                      |
| the isolated type check is a per-module tsconfig and a `typecheck:module` target with its own failing proof, mirroring `6316cf1a`                                               | section 3.1; `t1`–`t6`                                                                                                              |
| no `any`, unchecked cast or `!` outside tests; module-identifier grammar `module.frontend.<name>`; no product names; Twilight Burokrat spelling                                 | no production code; `module.frontend.<name>` and `boundary.frontend.<name>`; no product name                                        |
| tick 12 and 13 only if every sentence is met; tick 3 only if the preferences index was its only open sentence                                                                   | 3 ticked; 12 and 13 moved, each open sentence and owner named (section 3.5)                                                         |
| label agreement `021844c4`: land it or leave it, and say so                                                                                                                     | left, with the reason (section 1) and the hand-over (section 12)                                                                    |
| task 11 not ours; name what is left to it                                                                                                                                       | section 12                                                                                                                          |
| rehearsal on `rehearse/050-7-l`, one commit per slice, hooks on; reds observed; faults run, restored, `cmp`                                                                     | section 9.3                                                                                                                         |
| exact planner commit subjects and `owned.txt` per slice; relative counts; planner-only list                                                                                     | section 6; sections 4.2, 9.3, 9.4                                                                                                   |
| three-mode section 9.1 (`fill=0`, `fill=1` over packets i's and k's sites, `real` driven by `REAL_BASE`)                                                                        | section 9.1                                                                                                                         |
| no `/home` or `/tmp` path outside the Dispatch block; `--driver claude` and `--require-ancestor <K2>` on every dispatch line                                                    | section 6, Dispatch                                                                                                                 |
| a `legacy-root` exemption only if the packet cites a pre-namespacing path                                                                                                       | it does (section 3.2's predecessors, section 7.6's boundaries): one entry in `docs/findings/current-document-check-exemptions.json` |

### 14.2 The batch-6 addendum's twenty points

| Point                       | Assessment                                                                                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Reproduced red           | Met for all three slices, each rebuilt from the previous slice plus its test side, diagnostics pasted (section 6).                                                                                                                                         |
| 2. Typecheck and lint       | Met: native per slice, exit 0 on each rehearsed commit, every slice committed with lefthook on.                                                                                                                                                            |
| 3. Path counts              | Met: each hand-over lists its exact paths (13, 16, 5); the planner's own commit adds this document and one exemption entry.                                                                                                                                |
| 4. Failure-visible commands | Met: every check records its own status; the fault harness judges status and text after restoring.                                                                                                                                                         |
| 5. HEAD-reading tests       | Met: the pilot suite clones `HEAD` and overlays `pilotPaths`, which is why the READMEs join it before they are committed; the whole suite and `check-indexes committed` run after the planner's commit.                                                    |
| 6. Sandbox constraints      | Met: whole targets, build, devsync, the whole pilot suite, `check-indexes` and Chromium are the planner's (section 9.4).                                                                                                                                   |
| 7. Known race               | Met: the host-load timeouts named, one rerun, no repair authority (section 10.11).                                                                                                                                                                         |
| 8. Names                    | Met: `module.frontend.<name>`, `boundary.frontend.<name>`, `check.fe-01.typecheck-module`; no product name.                                                                                                                                                |
| 9. Packet form and evidence | Met: three slices, each ending in a planner commit with its exact subject; relative baselines; production-path negatives with observed lines; the unprovable named.                                                                                        |
| 10. Pins                    | Met: no dependency pin touched; the two test pins moved only after their observed reds.                                                                                                                                                                    |
| 11. Pipeline exit handling  | Met: every `                                                                                                                                                                                                                                               |     | test $? -eq 1` follows one command. |
| 12. Planner chaining        | Met: section 9.1 stops at the first failed check.                                                                                                                                                                                                          |
| 13. Module index            | Met: every file of every module directory is in its index, `tsconfig.json` included; `w1` proves a missing one is refused.                                                                                                                                 |
| 14. Bun directory filters   | Met: `bun test ./tools/…` with `./`; the pilot runs from `apps/wiki/cli` on a named file.                                                                                                                                                                  |
| 15. Interleaving property   | N/A: no concurrent or lifecycle code changes.                                                                                                                                                                                                              |
| 16. Model-based remedy      | N/A: likewise.                                                                                                                                                                                                                                             |
| 17. Seeded evidence         | N/A: no slice reads an earlier attempt's evidence.                                                                                                                                                                                                         |
| 18. Symbol-based checks     | Met: `TypeChecker` identity (`getSymbolAtLocation`, `getAliasedSymbol`, `getExportsOfModule`) to the declaring symbol or file; one watched negative per route clause and bypass class (`d1`–`d10`, `c1`, `o1`); the two bypass clauses shown load-bearing. |
| 19. Missing-file grep       | Met: every grep over a file follows a `test -f`, reads a log the same block wrote, or is inside the harness after a status check.                                                                                                                          |
| 20. Honest limits           | Met: sections 3.5 and 9.5 — the credential, `src/lib`, one-member context types, per-list isolation, the unrequired registration.                                                                                                                          |

## 15. Ready to commit

| Slice | Paths                                                                                                                                                                                                                                                                    | Subject                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1     | `spec.md`, `verify.md`, `apps/wbs/fe-01/project.json`, `tools/tool-devsync/workspace-inventory.mjs` — **4 modified**; `apps/wbs/fe-01/src/modules/tsconfig.module.json` and eight `apps/wbs/fe-01/src/modules/*/tsconfig.json` — **9 new**                               | `feat(frontend): give every frontend module a type check of its own`                                   |
| 2     | `spec.md`, `verify.md`, `tasks.md`, eight `apps/wbs/fe-01/src/modules/*/README.md`, `apps/wiki/cli/src/policy/pilot-policy.test.ts`, `docs/wiki-policy/{modules,policy,relationships}.json`, `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` — **16 modified** | `feat(frontend): index and register every frontend module in the wiki pilot, and close task 3`         |
| 3     | `spec.md`, `verify.md`, `tasks.md`, `docs/superpowers/plans/2026-09-21-batch-4/050-7-frontend-lifetime-map.md` — **4 modified**; `apps/wbs/fe-01/src/delivery-boundaries.test.ts` — **1 new**                                                                            | `test(frontend): refuse infrastructure in delivery by symbol identity, the routes still owed recorded` |

(`spec.md`, `verify.md` and `tasks.md` are under `openspec/changes/adopt-frontend-lifetimes/`.) After
the last commit the host gate runs on the shared build host with the committed hash, and its printed
running-hash line and exit status are recorded. Anywhere else it is reported as not run, with the
reason — never as passed.
