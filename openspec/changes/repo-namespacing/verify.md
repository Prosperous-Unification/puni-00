# Verification Report

**Change**: `repo-namespacing`

**Task 1 implementation base**: `6ca89944d37ee1bdaed7f7290df0fc4272847d81`

**Task 2 implementation base**: `35677e3e6c6ecffd22a8871953f73affcc8fd83e`

**Verified at**: 2026-09-14

**Scope**: Tasks 1.1–4.4 evidence accumulated below; Tasks 4.2–4.4 remain partial and open on
their named external prerequisites and final integration obligations.

## Preflight inventory

[`preflight-inventory.md`](preflight-inventory.md) pins 31 recursively discovered projects,
the exact 18 WBS root/name rows from the design, 288 workspace-root token consumer files,
148 parent-relative values across 72 app/library configs, 41 documentation files carrying
current-root tokens, four additional non-JSON depth-sensitive operational paths, 51 public
alias keys, 92 tracked migration path/blob pairs, 27 direct Nx selector matches, 60 target
label matches, cross-root reads, and deployment identities. The recursive reader and Nx
graph returned identical complete `(root, name)` sets. The migration list matched
`git ls-files -s apps/be-01/drizzle`; no project move was made.

## Focused and owning checks

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test src/workspace-projects.test.ts src/workspace-targets.test.ts src/sync.test.ts --test-name-pattern='readProjects|RESTART_PATHS coverage|every typecheck target|every cached target|deploy contract|every project says'` from `tools/tool-devsync` — 26 passed, 0 failed, 83 expectations.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx test tool-devsync` — 142 passed, 0 failed, 440 expectations. An immediate identical rerun reported `[local cache]`, `1 out of 1`, and `100% cache hit rate`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx test tool-devsync --skip-nx-cache` — final owning run: 142 passed, 0 failed, 440 expectations.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p tool-devsync --skip-nx-cache --parallel=1 --output-style=stream` — both targets passed.
- `bunx prettier --check <seven changed files>` — all matched files use Prettier style.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate repo-namespacing --strict --json` — 1 passed, 0 failed.
- `git diff --check` — passed.
- Removing `ring:adapter` from the nested supervisor manifest after that warm hit forced execution rather than a cached pass: the focused owning target failed with `libs/contracts/solver/supervisor-protocol/project.json must carry exactly one ring: tag; found 0`.

The restricted-sandbox baseline before the worktree dependency link reached 131 passes and
10 environmental failures: the worktree-local TypeScript executable was absent, Git fixture
operations crossed the sandbox device, and listener fixtures received `EPERM`. Linking this
worktree's ignored `node_modules` to the repository's pinned install and running the owning
target with its required host permissions resolved those failures without product changes.

## R5 production-path faults

| Check                                    | Injected fault                                                   | Observed RED                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Recursive descent                        | Replaced child recursion with `continue`                         | Nested fixture expected `outer`, `protocol`, and `probe-core`; received `[]`.         |
| `.git` exclusion                         | Removed `.git` from the named exclusions                         | Recursive fixture received forbidden `libs/outer/.git/hidden`.                        |
| Descendant symlink refusal               | Returned instead of rejecting a directory symlink                | Ordinary linked-directory test reported `readProjects unexpectedly succeeded`.        |
| Top-level group no-follow                | Omitted the `lstat` group guard                                  | The apps/libs/tools regression reported `readProjects unexpectedly succeeded`.        |
| Nested metadata totality and cache input | Removed the nested supervisor `ring:adapter` after a warm Nx hit | Target executed and named the complete manifest path with `found 0`.                  |
| Nx graph command                         | Spawned `bunx nx` from the Bun test                              | Child exited 0 with empty stdout; strict JSON parsing failed with `Unexpected EOF`.   |
| Depth-sensitive configuration coverage   | Filtered out `compilerOptions.outDir`                            | Production-workspace inventory had 111 rows instead of 148 and omitted core's outDir. |
| Malformed inventory configuration        | Omitted the JSONC parse-error guard                              | Malformed tsconfig fixture reported `inventory unexpectedly succeeded`.               |

Adjacent `Proof:` comments record these faults at their checks. Fixture coverage also keeps
an absent manifest as a non-project directory while unreadable directories, unreadable
manifests, malformed JSON, duplicate names, invalid metadata, and directory symlinks fail by
name. The core-extraction base already supplied the shared recursive entrypoint and declared
it in tool-devsync lint/test inputs; this slice migrated the remaining root/name assumptions
in sync and target coverage and removed the fixed project-count oracle.

## Inventory review repair

The review of `35677e3e6c6ecffd22a8871953f73affcc8fd83e` found that the root-token
sweep could not observe paths whose meaning depends only on directory depth. The new
`workspace-inventory.mjs` uses recursive project discovery and JSONC parsing to inventory
all parent-relative values in root `project.json` and `tsconfig*.json` files. Its fixture
proves property-path reporting and ignores sibling `./` references; its actual-workspace
oracle pins all 148 values and 72 owning files, including backend `extends`, core `outDir`,
nested-supervisor four-level ascents, and all frontend relative alias targets.

The preflight now calls the prior 288-file list a workspace-root token sweep instead of a
complete path inventory. A separate reproducible documentation sweep records all 41 tracked
Markdown files with current-root tokens and explicitly leaves current-versus-historical
classification to Section 4.
The non-JSON sweep separately names the backend image-smoke workspace ascent, frontend
compose fixture, frontend Vite output, and core Playwright output paths.

Fresh repair evidence after restoring both injected faults:

- `bun test src/workspace-inventory.test.ts` — 3 passed, 0 failed, 8 expectations.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test src/workspace-inventory.test.ts src/workspace-projects.test.ts src/workspace-targets.test.ts src/sync.test.ts --test-name-pattern='depth-sensitive|readProjects|RESTART_PATHS coverage|every typecheck target|every cached target|deploy contract|every project says'` — 28 passed, 0 failed, 90 expectations.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx test tool-devsync --skip-nx-cache` with host permissions required by its listener and Git fixtures — 145 passed, 0 failed, 448 expectations.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p tool-devsync --skip-nx-cache --parallel=1 --output-style=stream` — both targets passed after adding the explicit JSONC `ParseError[]` boundary type.

## Inventory cache-input review repair

The review of `eb4f2f19bfbcb698e2026eae08fa4ac18ec2937e` found that the owning Nx
target hashed the inventory module but not the recursively read TypeScript configurations.
Its exact inputs now include `{workspaceRoot}/apps/**/tsconfig*.json` and
`{workspaceRoot}/libs/**/tsconfig*.json`; a source assertion prevents either family from
disappearing.

The focused production target first executed with `0/1` cache hits, then an identical run
reported `[local cache]`, `1/1` and `100%`. Changing only
`libs/core/tsconfig.lib.json` from `../../dist/out-tsc` to `./dist/out-tsc` caused the next
identical invocation to execute and fail with 147 rather than 148 inventory rows. After
restoring the config, the combined inventory/input target passed 2 tests with 7 expectations.

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx test tool-devsync --skip-nx-cache`
  with host permissions required by listener and Git fixtures — 146 passed, 0 failed, 450
  expectations.

## Product and final-layout fixture proof

The product axis is active on all 18 pre-move WBS apps and libraries. Thirteen manifests that
did not already carry the tag received `product:wbs`; no second product was committed.
`productConstraints(projects)` discovers and sorts products, permits each product to depend
on itself and `product:shared`, and restricts shared sources to shared targets. Production,
general-test and store-memory-test ESLint configurations all include those rules; only the
existing ring constraints remain exempt in tests. Lint cache inputs include the generator and
recursive app/lib/tool manifest globs.

The final namespace validator remains fixture-only until the atomic move in Task 3. It accepts
both app kinds, all three library ring directories (`adapters` maps to `ring:adapter`) and
product-neutral infra adapter tools. It names malformed roots, ring/product directory
disagreement, unqualified Nx names, invalid tools and absent/duplicate tags on all four axes.

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test src/product-constraints.test.ts src/namespace-layout.test.ts src/lint-policy-cache.test.ts` from `tools/tool-devsync` — 21 passed, 0 failed, 36 expectations.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx test tool-devsync --skip-nx-cache --output-style=stream` — 167 passed, 0 failed, 483 expectations with the host permissions required by existing listener and Git fixtures. The restricted-sandbox run reached 158 passes and 9 environmental failures: seven listener cases received `EPERM`, and two poller Git fixtures could not complete.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p tool-devsync --skip-nx-cache --parallel=1 --output-style=stream` — both targets passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p be-01,fe-01,gw-01,mcp-01,auth,config,conformance,contracts,solver-supervisor-protocol,core,domain,observability,realtime,runtime-portable,store-memory,store-sqlite,validation --skip-nx-cache --parallel=1 --output-style=stream` — all 17 TypeScript WBS lint targets passed; `solver-py` has no lint target.
- `bunx prettier --check <all Task 2 changed files>` — all matched files use Prettier style.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate repo-namespacing --strict --json` — 1 passed, 0 failed.
- `git diff --check` — passed.

### R5 product/layout faults

| Check                     | Injected fault                                                                                      | Observed RED                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Generated product rule    | Removed only `product:probe` from the generated rules                                               | Real uncached Nx lint accepted the forbidden production `@wbs/core` import with exit 0.                                                 |
| Shared-product isolation  | Allowed `product:wbs` from `product:shared`                                                         | Real uncached Nx lint accepted the forbidden shared-to-WBS import with exit 0.                                                          |
| ESLint placement          | Removed product rules separately from production, general-test and store-memory-test configurations | Effective-config oracle failed at `libs/core/src/index.ts`, `libs/core/src/example.test.ts` and `libs/store-memory/src/source.test.ts`. |
| WBS product totality      | Removed `product:wbs` from `libs/contracts/project.json`                                            | Exact 18-root oracle named `libs/contracts` with `[]`; the real Nx graph oracle also reported all ten incoming WBS edges.               |
| Policy-module cache input | Omitted the generated module from lint inputs after two warm runs                                   | Third real Nx lint reused 1/1 cached task and exited 0 after the policy denied every product.                                           |
| Manifest cache input      | Omitted recursive manifest inputs after two warm runs                                               | Third real Nx lint reused 1/1 cached task and exited 0 after the imported target changed product.                                       |
| Axis cardinality          | Disabled the shared scope/ring/runtime guard, then the product guard                                | Owning Nx target reported six missing absent/duplicate failures, then both product cases, each with received `[]`.                      |
| App layout                | Disabled app shape, ring, product and name checks individually                                      | Each owning target lost the named refusal; without shape validation it emitted misleading derived product/name faults.                  |
| Library layout            | Disabled library shape, ring, product and name checks individually                                  | Each owning target lost the named refusal; without shape validation it emitted `requires undefined`.                                    |
| Tool layout               | Disabled tool scope, ring and product checks individually                                           | Each owning target omitted only the corresponding invalid-tool refusal.                                                                 |
| Root groups               | Disabled the apps/libs/tools guard                                                                  | Owning target replaced the named outside-root refusal with a misleading library-shape fault.                                            |

All injected source and metadata faults were restored. Adjacent `Proof:` comments record the
specific mutation and observed result.

## Deferred verification

Tasks 3.4–4, the whole-workspace h2puni gate, browser gate, image checks, production dry-run,
publication, and archive remain intentionally unverified.

## Section 3.1 coordinated project move

The move started from `c63e9010cb0fb61e757e3ddd71f19db13e242e2c`. The nested supervisor
protocol moved out of contracts first, then all four applications and fourteen libraries moved
to the exact `design.md` roots. Their Nx identities are product-qualified while the 51 public
`@wbs/*` alias keys remain unchanged. The recursive reader and real Nx graph agree on all 31
projects and the exact 18 moved WBS root/name pairs. All original product, scope, ring and runtime
tags remain present; final-layout validation is now active against the actual workspace.

`git diff --raw -M100% HEAD -- apps/be-01/drizzle apps/wbs/be-01/drizzle` reported exactly
92 `R100` records, so every migration path moved with byte-identical content. A deployment-token
diff over the moved app configuration reported no changes to `APP_NAME`, `IMAGE_NAME` or ports.

- The first actual-workspace namespace run failed on all 18 legacy roots before the move. The
  restored `workspace-projects` and `namespace-layout` tests pass against the moved graph.
- Injecting `const deliberatelyWrong: number = 'not a number'` into the moved domain estimate
  test made uncached `wbs-domain:typecheck` fail at the namespaced path with `TS2322`; restoring it
  returned the target to green. The adjacent `Proof:` comment records that observation.
- The uncached 17-project TypeScript matrix passed for every renamed TypeScript project; the
  Python adapter has no typecheck target. A later combined lint/typecheck run reconfirmed every
  typecheck while exposing legacy circular-exemption names; replacing all three occurrences with
  `wbs-core`/`wbs-store-memory` restored the three affected real lint targets.
- Focused Tool Devsync moved-graph, layout, target, out-of-project-read and cache declarations pass.
  Its complete intermediate run was 166 pass/6 fail: three failures fixed by this slice and three
  expected `RESTART_PATHS` failures owned by Task 3.3, whose production paths remain unchanged.

## Section 3.2 frontend and cross-tree consumers

Vite and Vitest aliases resolve to `libs/wbs`; Vite emits to `dist/apps/wbs/fe-01`. Both source
and packaged Playwright configurations use moved roots, the packaged server reads the namespaced
artifact and Caddyfile, frontend lint lists every moved root TypeScript input, and CI uploads both
browser artifact directories from `apps/wbs/fe-01`. SQLite, domain, contracts, conformance, core,
backend and Python cross-tree readers now resolve from their new depths.

### R5 observations

| Check                | Injected fault                                                                                        | Observed RED                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Moved alias target   | Restored Vite's workday alias to the deleted old root                                                 | Actual uncached `wbs-fe-01:build` exited 1 with `UNLOADABLE_DEPENDENCY` at `completion-prompt.tsx`.                      |
| Root lint reach      | Kept an unused-variable fault in `vite.config.ts` while omitting that file from the real lint command | Actual uncached lint incorrectly exited 0; the owning tier oracle failed naming exactly `apps/wbs/fe-01/vite.config.ts`. |
| CI browser artifacts | Restored only `apps/fe-01/test-results/`                                                              | The production workflow oracle failed with the complete received legacy path.                                            |

All three faults were removed. Fresh restored evidence:

- `TZ=UTC bunx vitest run vite-config.test.ts playwright-config.test.ts` from the frontend root —
  29 passed, 0 failed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:test:unit
--skip-nx-cache --output-style=stream` with host process permissions — 34 files, 554 tests
  passed.
- The actual uncached frontend build transformed 916 modules and wrote the namespaced output.
- Focused moved readers: backend 26 passed with the existing orphan-process case skipped;
  domain/contracts/core 87 passed; CI workflow 1 passed; Python metadata/path 4 passed. The core
  portable target built the moved bundle and passed its Chromium check (1 test).
- The full SQLite target passed 764 tests across 65 files with 9,002 expectations in 104.13s from
  clean candidate `7c5dee9e3552d05418287ce4f42b6a90d762277f`. Its performance proof observed the
  unchanged clean SHA/status before and after all samples. Homogeneous cached median/range was
  155.481/138.685–163.546ms against uncached 254.278/242.047–260.453ms (ratio 0.6115); mixed
  cached median/range was 216.958/206.188–224.891ms against uncached
  264.365/250.525–274.994ms (ratio 0.8207). Both are within the fixed 1.10 ceiling. Functional
  counts were one full read for each of the six retained collections in both fixtures;
  homogeneous had 400 targeted reads, 1 assignment read and 404 writes, while mixed had 994
  targeted reads, 41 assignment reads and 404 writes.

### Portable artifact output repair

Task 1's depth-sensitive inventory deliberately enumerates `project.json` and
`tsconfig*.json`; it did not inspect the TypeScript Playwright configuration. After the core
project moved three namespace levels deeper, its unchanged `../../tmp/core-portable-results`
therefore resolved to `libs/wbs/tmp/core-portable-results`, while Nx declared
`{workspaceRoot}/tmp/core-portable-results`. A production-path Playwright assertion now writes an
artifact through `testInfo.outputPath` and requires that actual path to be below the declared Nx
output.

- Watched RED: the real uncached `wbs-core:test:portable` target ran two Chromium tests; the new
  artifact assertion failed with `Received: false`, and Playwright reported its error context below
  `libs/wbs/tmp/core-portable-results`.
- Restored GREEN: changing the config to `../../../../tmp/core-portable-results` made the same real
  target pass both tests in 2.1s.
- The analogous non-JSON parent-relative scan found the already-rewritten Vite/Vitest paths and one
  deferred `solver-image-smoke.sh` repository-root ascent. The latter belongs to unchecked Task 3.4
  image verification and is recorded there rather than silently broadening this repair.

### Tool Wiki reconciliation boundary

The live module mapping, policy selectors, module README indexes and Nx check names use moved
roots. The live relationship declaration originally did not: its `check.tool-dagger.test` fact
retained only five inputs after the target gained five namespaced candidate inputs. The
candidate-built pilot fixture refused that exact current-fact mismatch before external activation
could matter. Immutable bootstrap activation artifacts remain byte-identical and preserve their
historical tuple. No activation, external store mutation or publication occurred. The initial
contracts/relationship run reached 34 pass with all 19 relationship selector cases green; its one
contract expectation was an accidental edit to a frozen benchmark criterion and was restored
before final verification.

## Section 3.3 development and sync consumers

Development setup reads and writes its three managed environments below `apps/wbs`; the port
preflight defaults to that same root, and both supervisor modes select all four qualified Nx
projects. The macOS solver environment, package install and golden request resolve the mapped
adapter and contracts roots. Dev deployment and sync use the moved remote MCP environment without
reading or changing a live `.env`. Restart fingerprints cover every moved application config,
migration root and library manifest discovered from the actual graph. Solver compatibility binds
the moved Python adapter and backend Dockerfile while preserving the existing preparation,
restart and recreate ordering.

The directly affected `tool-dev-setup:test` target now declares the namespaced environment,
solver-lock and request-corpus inputs that its tests read. This is the narrow declaration required
to keep the changed caller cache-sound; Task 3.5 still owns recursive Dockerfile inputs, cache
mutation proofs and the broad final old-path sweep.

### R5 observations

| Check                      | Injected fault                                                                       | Production-path observer                          | Observed RED                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup root                 | Restored `seedApp` to `apps/<app>`                                                   | Temporary moved-layout fixture                    | 10 setup/solver cases failed; setup threw the legacy-path `MissingEnvExampleError`, so the exact namespaced diagnostic also failed.                                      |
| Solver environment/request | Restored lock, package and contract request roots                                    | `solverEnvironment` and `solveGoldenRequest`      | The lock assertion returned `/repo/libs/solver-py/...`; the request caller threw ENOENT before invoking the fake solver.                                                 |
| Solver test cache input    | Restored the lock input to `libs/solver-py`, then changed the moved Linux NumPy lock | Real `tool-dev-setup:test` Nx target              | The second run was a `[local cache]` hit (1/1) and exited 0; with the namespaced input restored, the same mutation reran and exited 1 on Linux 2.5.3 versus macOS 2.5.2. |
| Port-preflight app root    | Restored `apps_dir` to `$repo_root/apps`                                             | Copied production script in moved-layout fixture  | `default app root resolves the moved configured port` failed with `expected: be-01:43117` and an empty actual value; no root or `--apps-dir` override was supplied.      |
| Development selectors      | Restored all four unqualified selectors in `bin/dev.sh`                              | Host `bin/dev.test.sh`                            | `local solver runs all four tiers` observed the wrong selector list while fake Nx was still reached.                                                                     |
| Restart inventory          | Retained the pre-move app/library paths                                              | Actual project discovery and `needsRestart` tests | Coverage first named missing `libs/wbs/adapters/auth/project.json`; the moved migration/config path assertions failed.                                                   |
| Solver compatibility       | Restored `libs/solver-py` and `apps/be-01/Dockerfile`                                | Real target-tree object reader                    | Threw `fixture has no object id` at the first deleted path instead of accepting the moved source tree.                                                                   |
| Remote MCP environment     | Restored `src/apps/mcp-01/.env` at deploy and sync callers                           | Production script/default-path assertions         | The sync module initially could not export the expected default, and the deploy source missed the exact namespaced path; neither test read remote state.                 |

All injected old paths were removed. Adjacent `Proof:` comments identify the watched faults.
Restored evidence:

- `bun test tools/dev` — 19 passed, 0 failed, 37 expectations.
- Host-permitted `bun test tools/tool-devsync/src` — 173 passed, 0 failed, 496 expectations.
- Host-permitted `bash bin/dev.test.sh` — all 48 shell checks passed, including the moved
  default app root, loopback refusal/cleanup and the exact four namespaced selectors.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t test lint typecheck -p
tool-dev-setup,tool-devsync --skip-nx-cache --parallel=1 --output-style=stream` — all six owning
  targets passed; tests repeated the 19/173 counts.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx build tool-devsync --skip-nx-cache
--output-style=stream` — Tool Devsync and all four dependencies passed.
- The real `serve-local-solver` task graph listed exactly `wbs-be-01`, `wbs-fe-01`, `wbs-gw-01`
  and `wbs-mcp-01`.

## Section 3.4 operational paths

Dagger now maps all three image Dockerfiles below `apps/wbs`, launches the Bun tiers from
their namespaced image workdirs, and validates each selected Dockerfile and repository-local
`COPY` input before connecting to the Dagger engine. The backend image keeps `./drizzle`
relative to `/app/apps/wbs/be-01`. The solver smoke script ascends four levels to the workspace
root, Dagger and heavy-gate Nx selectors use `wbs-*` identities, and CI, corpus, migration-lint,
lefthook, frontend artifacts and directly owned Dockerfile cache inputs use moved paths.

Migration discovery now asks Git which of exactly `apps/be-01/drizzle` and
`apps/wbs/be-01/drizzle` is a tree at each requested revision. A fixture history proves a
rename-only commit adds no migration ID while a later folder requires `--with-migrations`.
Neither tree, both trees, a blob at the tree path, and an unreadable revision are named
failures. Migration lint validates an explicit workspace root and resolves its unchanged
waiver at repository-root `bin/assert-no-prod-release.sh`.

### TDD and R5 observations

- Initial migration RED: `cd tools/tool-deploy && bun test src/migrations.test.ts` — 10 passed,
  4 failed; the old function treated the repository argument as a migration directory and the
  neither/both/blob cases did not throw. Restored GREEN: 14 passed, 0 failed, 21 expectations.
- Always-new-root injection: forcing every revision to
  `apps/wbs/be-01/drizzle` made the rename-spanning focused test fail 0/1 with legacy IDs
  expected as `['0001_init']` and received as `[]`; restoring revision-local selection passed.
- Migration-lint RED: `cd tools/tool-git-hooks && bun test src/hooks/migration-lint.test.ts`
  reached 10 passed, 3 failed; the moved waiver was falsely absent and an unrelated root was
  accepted. Explicit validated root handling restored the dedicated suite, and the final
  migration-focused surface passed 26/26.
- Dagger RED: the focused image-plan tests failed 0/2 on the legacy entrypoint and missing
  input validator. Restored GREEN passed 4/4. Mutating the production map back to
  `apps/be-01/Dockerfile` then failed 0/1 naming that missing Dockerfile. Mutating the real
  backend Dockerfile `COPY` back to `apps/be-01` failed 0/1 with
  `apps/wbs/be-01/Dockerfile COPY input does not exist: apps/be-01`; both were restored.
- The old smoke-script ascent invoked fake Docker with
  `<workspace>/apps/apps/wbs/be-01/Dockerfile` and context `<workspace>/apps`; the corrected
  production entrypoint passed. The retained poller target input exited 42 with
  `missing target file: apps/be-01/Dockerfile`; its moved input passed after restoration.
- Hook/corpus and CI/gate focused RED runs each failed 0/2 on their received legacy paths.
  Their restored focused runs passed, and adjacent `Proof:` comments record every injected
  fault and observed production-path negative.

### Restored verification

- Focused Dagger input/plan/smoke tests: 4 passed, 0 failed, 10 expectations.
- Tool Deploy migration tests: 17 passed, 0 failed, 25 expectations.
- Migration lint/corpus/hook tests: 26 passed, 0 failed, 29 expectations.
- Tool Devsync operational-path/poller tests: 3 passed, 0 failed, 11 expectations.
- Moved backend migration CLI fixture: 2 passed, 0 failed, 11 expectations.
- Owning matrix with host permissions: Tool Dagger 61/0. Final complete Tool Deploy and Tool Git
  Hooks suites passed 91/0 and 114/0 after the malformed-state proof cases were added. Tool
  Devsync's Task 3.4 poller path is green; its complete run is 170 passed, with only the three
  Task 3.3-owned `RESTART_PATHS` assertions failing on this Task 3.1/3.2 base.
- All eight lint/typecheck targets for the four owning tools passed uncached. Shellcheck and
  the real migration-lint invocation over every tracked SQL file passed.
- The pre/post-move migration oracle reported `migration_records=92` and
  `non_identical_records=0`. The authoritative deploy-contract/docker/environment sources
  are byte-unchanged from `c63e9010`, and runtime assertions confirmed the pinned app/image
  names, ports, DNS alias, colour names, registry repository names, state paths and env files.
- `dagger version` exited 127 with `dagger: command not found`; no live Dagger CLI image build
  was claimed. Production-path candidate input validation, fake-Docker smoke execution,
  shellcheck and all Dagger unit tests were exhausted instead.

Tasks 4.1–4.4, fresh Tool Wiki activation, live images and deployment, publication,
whole-workspace/browser gates and the h2puni gate remain open.

## Section 3.5 recursive cache inputs and active-path sweep

The Tool Devsync test target retains the direct Task 3.3/3.4 inputs owned by its setup and
operational-path tests and adds the root ignore files those tests now read. Its repository
inventory inputs recurse through application, library and tool manifests, application/library
TypeScript configurations and application Dockerfiles. The moved backend development entrypoint
is excluded from Docker contexts; Drizzle snapshots and generated solver build/package metadata
are excluded from formatting, and the same solver outputs are ignored by Git. Both golden-corpus
writers resolve the moved domain fixture root.

### TDD and R5 observations

- The focused initial RED passed 33 tests and failed 4 with 92 expectations: the fast-corpus
  writer still named `../../libs/domain/fixtures/fast-golden-corpus.json`, `.dockerignore`
  contained only `apps/be-01/src/dev`, and the formatter/Git ignore files lacked the moved solver
  output paths. Restored focused evidence passed 38/38 with 104 expectations.
- A cold real `tool-devsync:test` run passed 178 tests with 516 expectations, then the unchanged
  warm run replayed 1/1 from the local cache. Removing the `ring:adapter` tag from nested
  `libs/wbs/adapters/solver-supervisor-protocol/project.json` with recursive inputs present caused
  a cache miss and named failure: the manifest had zero ring tags. Removing the library-manifest
  input was not accepted as the omission proof because Nx still invalidated the target through
  its `^production` dependency edge.
- The independent manifest omission used nondependency `apps/wbs/fe-01/project.json`. With the
  recursive app-manifest input and its assertion removed, removing `product:wbs` replayed 1/1
  from local cache and exited 0. Restoring the input while retaining the fault reran the target
  and failed 176/2 in the product-axis and actual-layout guards.
- Changing the real `apps/wbs/be-01/Dockerfile` Bun tag from 1.4.2 to 0.0.0 with its recursive
  input present caused a cache miss and failed 177/1, naming
  `apps/wbs/be-01/Dockerfile: 0.0.0`. Removing the Dockerfile input and its assertion, warming,
  and repeating that mutation replayed 1/1 from local cache and exited 0. Restoring the input
  while retaining the fault reran and reproduced the named 177/1 failure.
- All injected manifest, Dockerfile and input-pattern faults were restored. Adjacent `Proof:`
  comments pin the accepted stale-cache observations.

The active-path sweep used
`rg -n --hidden '(apps/(be-01|fe-01|gw-01|mcp-01)|libs/(domain|application|adapters|contracts|solver-py))'`
while excluding documentation, OpenSpec, notes, frozen migrations, tests and worktrees. Remaining
hits are classified: `MIGRATION_DIRS` and `CORPUS_LAYOUTS` intentionally read both sides of the
rename at historical Git revisions; the Dockerignore database incident, CI, Dagger and lefthook
comments are dated or watched-fault evidence; Tool Wiki comments and contract fixtures are
preserved historical/negative examples.
Current human/LLM indexes remain Task 4.1 work. The dated 2026-09-09 poller observation was restored
to its actually observed `apps/be-01/Dockerfile`; the separate 2026-09-14 proof records the moved
path.

The first complete touched-owner matrix exposed two test-side imports of the deleted backend root
in Tool Remote Scripts: 276 passed, 2 failed, 2 skipped. Both failures were `MODULE_NOT_FOUND` at
`apps/be-01/src/config`; the moved imports then passed the focused file 70/70. The final uncached
matrix ran test, lint and typecheck for Tool Dev Setup, Devsync, Bootstrap, Remote Scripts and
Smoke: all 15 targets passed in 38.7s. Test totals included Dev Setup 20/0, Devsync 178/0,
Bootstrap 61/0, Remote Scripts 278/0 with 2 Docker-dependent skips, and Smoke 33/0.
The moved Tool Remote Scripts runtime contract read is now an explicit test input; its manifest
assertion failed 0/1 before that declaration was added and passed 1/1 after restoration.
The final focused Dev Setup/Devsync surface passed 38/38 with 104 expectations, including the
repository's external-read totality guard. The final Tool Remote Scripts test/lint/typecheck rerun
passed all three targets (278 tests, 584 expectations, 2 real-Docker skips). All-tree Prettier,
`git diff --check` and strict all OpenSpec validation passed; OpenSpec reported 83/83 items valid.

### Tool Remote Scripts transitive runtime cache closure repair

The Tool Remote Scripts test computes an import of the backend `BeConfig` without adding an
infrastructure-to-app project dependency. A Bun build metafile for
`apps/wbs/be-01/src/config.ts` identified its workspace runtime closure as the backend entrypoint
plus production TypeScript sources in Auth, Config and Validation. The test target now declares
those source-root globs explicitly and excludes colocated tests. Its manifest assertion initially
failed 0/1 on the absent Auth input and passed 1/1 after the complete closure was declared.

The real target was primed uncached at 278/0 with 590 expectations and then replayed 1/1 from local
cache unchanged. Changing `libs/wbs/adapters/config/src/define-config.ts` to throw caused a cache
miss and failed 277/1 in `boots local backend configuration from the rendered environment and
keeps OIDC callback origin authoritative`. For the omission oracle, removing all six transitive
input patterns, warming the target, and applying the same source fault replayed 1/1 from local
cache and falsely exited 0 with 278 tests and 584 expectations. Restoring the inputs while retaining
the fault caused a cache miss and the same named 277/1 failure. All source and manifest faults were
then restored.

The restored host-permission uncached Tool Remote Scripts matrix passed test, lint and typecheck;
tests passed 278/278 with 590 expectations and the two intentional real-Docker skips. The focused
external-read totality suite passed 16/16 with 51 expectations. All-tree Prettier,
`git diff --check`, and strict all OpenSpec validation passed; OpenSpec reported 83/83 items valid.

## Section 4.1 documentation and handoff verification

Current indexes, runbooks, architectural pointers and the two active solver packet surfaces now
name the final `apps/wbs/...`, `libs/wbs/{domain,application,adapters}/...` roots and `wbs-*` Nx
projects. Of the preflight inventory's 41 documentation files, 13 current files were revised and
28 dated audits, plans, reviews, evidence and frozen specifications were retained as historical.
The legacy roots in the routed current-document set are four exact historical observations: the
two original diff locations in ADRs 0008 and 0009, the `docs/local-dev.md` measurement and the
dated 2026-08-31 `docs/runbook-dev-deploy.md` incident. Each ADR now follows its historical
observation with the current namespaced source location.

The candidate handoff suite pins complete manifests: 51 public alias keys, all 31 recursive Nx
root/name tuples, and all 92 migration path/Git-blob tuples. Its candidate-wide source/config
sweep covers TypeScript/JavaScript, Python, shell, JSON/YAML/TOML/INI/config/service/SQL,
Dockerfiles, dot-configs, extensionless `bin/` scripts, and every application/library/tool README.
It pins all 261 legacy-root occurrences by line context and digest: 22 current recursive
selectors, 19 frozen migration occurrences, 65 historical bootstrap-policy/mapping occurrences,
39 historical policy selector/baseline occurrences, 18 production proof/revision-transition
occurrences and 98 test fixture/proof occurrences. Bootstrap Tool Wiki policy/mapping files,
frozen migrations, test fixtures, OpenSpec/history and external activation state remain
classified evidence rather than current-reference rewrite targets.

### TDD and R5 observations

- The initial focused documentation command was
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx test tool-devsync --skip-nx-cache --output-style=stream --test-name-pattern='current documentation and active solver packets use namespaced roots'`.
  It exited 1 with 62 references across 19 current files; after classification and current-path
  repairs it passed 1/1.
- Replacing the findings index target with `current.md#missing` made the production
  `check-indexes working` path exit 1 with
  `Markdown anchor absent in docs/findings/README.md: docs/findings/current.md#missing`.
- Adding `[fault](missing-round-one.md)` to the non-index guide `docs/capacity.md` made the
  complete routed-document link oracle fail 0/1 with
  `docs/capacity.md -> missing-round-one.md (absent docs/missing-round-one.md)`; restoring the
  guide passed 1/1. The reader covers the root routers, changed ADRs/runbooks, active solver
  packet surfaces, and all application/library/tool READMEs rather than only Tool Wiki indexes.
- Comparing the root router to the first fixed document list failed with six live omissions:
  `docs/2026-09-08-hosted-optimization-api.md`, `docs/findings/README.md`, Radical Modularity and
  the production-deploy, Tool Wiki activation and Dagger registry-DNS runbooks. Current-document
  discovery now follows every existing Markdown path linked or named by `LLM_README.md`, excluding
  only explicitly classified history. Adding `missing-round-two.md` to the newly discovered
  production runbook then failed the routed-link check with its exact source and missing target.
- The Nx-command oracle initially failed 0/1 with five exact unqualified selectors at
  `docs/local-dev.md:101-104` and `:151`; replacing them with the qualified `wbs-*` projects
  passed 1/1. The explicitly labelled historical `fe-01` measurement remains evidence.
- Removing `@wbs/validation/fixtures` exposed the complete 50-key received alias list. Replacing
  `wbs-domain` with `domain` exposed the differing complete project tuple. Removing
  `apps/wbs/be-01/drizzle/20260830120000_add_dep_reach/down.sql` exposed that exact missing
  path/blob tuple while retaining the other 91. Injecting executable
  `const roundOneFault = 'apps/be-01/src'` into already-classified
  `tools/tool-dagger/src/main.ts` changed the occurrence total from 261 to 262 and the pinned
  digest from `9a0613f4...` to `879d8e14...`, so a historical Proof comment elsewhere in that
  file could not exempt the new reference. Restoring a
  stale `apps/be-01` path in `docs/capacity.md` made the executable historical-document
  inventory fail 0/1 (185 filtered) with that current document classified as `UNCLASSIFIED`;
  after restoring the namespaced path it passed 1/1 (185 filtered).
- With the universal candidate input omitted, the full 188-test target warmed green. An old root
  added only to previously unwatched `bin/dev-ports.sh` then replayed 1/1 from local cache and
  falsely exited 0 with 188/188. Restoring `{workspaceRoot}/**/*` while keeping the fault caused
  a cache miss and the exact 187/1 failure at `bin/dev-ports.sh:2`; the occurrence total became
  262 and digest `61c8d9f6...`. All faults and omitted inputs were restored; adjacent `Proof:`
  comments preserve each observation. The 12 declared handoff inputs now include the universal
  candidate read required by `candidatePaths()` and the production index command.
- The Dockerfile-family manifest initially failed with the omitted
  `apps/wbs/be-01/scripts/solver-orphan-fixture.Dockerfile`. Matching canonical Dockerfiles and
  `.Dockerfile` suffix variants pins all five candidate paths. Replacing that variant's line 4
  with `COPY apps/be-01/...` failed the occurrence inventory with one exact `UNCLASSIFIED`
  context, count 262 and digest `116ba02b...`; restoring it returned to 261 classified
  occurrences and the pinned digest.

### Tool Wiki boundary

`check-indexes working` validates the repository's current eight-index graph, links, anchors and
case. Trusted Tool Wiki activation remains pending: the moved mapping must be committed and
published at one exact source SHA before an operator can materialize and activate immutable
authority artifacts. This task did not mutate the external store, activated archive, bootstrap
policy/mappings or selected activation.

The production index command exited 0 with eight indexes and no review debt. The uncached Tool
Devsync suite passed 190/190 with 529 expectations; its lint and typecheck targets also passed.
Tool Wiki source lint and typecheck passed, while the complete suite passed 578 tests and failed
one of 579 with 5,358 expectations: the candidate-built pilot fixture correctly reported that the
live `check.tool-dagger.test` relationship fact omitted five current target inputs. That mismatch
was candidate-owned; a fresh external activation could not repair it. Production
`tool-wiki-lint.sh` returned exit 0 with `status: inactive`, `certified: false` and `external
activation root is not provisioned`; no activation success is claimed. The pinned Bun OpenSpec
CLI validated all 83/83 changes/specs strictly. The unpinned `openspec` executable was unavailable
(exit 127), so `bunx @fission-ai/openspec@1.3.0` supplied the recorded result. Task 4.2 owns the
frozen-candidate h2puni/browser/image gates; they were not run here.

### Astra follow-up: absent root-route destinations

`rootRoutedDocuments()` now preserves concrete Markdown destinations named by `LLM_README.md`
even when the candidate inventory does not contain them. Wildcard families and prose suffixes
remain non-routes. Existing files continue into the current-document readers; absent destinations
are diagnosed first as an exact `LLM_README.md` link failure rather than disappearing from both
sets.

The focused RED command was:

```sh
bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts --test-name-pattern 'absent inline-code root routes'
```

Before the fix it exited 1 with 0 pass, 2 fail, 12 filtered and 2 expectations. Extraction
returned only the 18 existing routes instead of containing `docs/missing-runbook.md`; validation
returned `[]` instead of
`LLM_README.md -> docs/missing-runbook.md (absent docs/missing-runbook.md)`. After separating
explicit route extraction from candidate-backed document reads, the identical command passed 2/2
with 12 filtered and 2 expectations. Adjacent `Proof:` comments retain both injected-fault
observations.

Final verification passed: the complete handoff file reported 14/14 tests and 15 expectations;
ESLint over all Tool Devsync sources and the uncached Tool Devsync typecheck both exited 0;
`nx format:check --all` exited 0; and pinned strict OpenSpec validation reported 83/83 valid
(72 changes and 11 specs). The read-only Tool Wiki lint remained intentionally noncertifying:
`status: inactive`, `certified: false`, `external activation root is not provisioned`.

## Section 4.3 local release verification

The candidate worktree was clean at exact HEAD
`7abb72f5107e5c9c03aaa077ce4d9b41549e707c`. Fresh uncached builds completed through the
existing Nx dependency graph:

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:build --skip-nx-cache`
  built `dist/tool-remote-scripts/swap.js` (35,796 bytes, SHA-256
  `c80baa10adcb8629106233c7caaa6764e668d4b1add409a46218e2f6eadbca20`) and
  `dist/tool-remote-scripts/solver-supervisor.js` (52,596 bytes, SHA-256
  `2fe2ddb9fc6b538ad586642290f37c792c7eee8e008815b5f40c9852ab9cb696`) from
  the current `tools/tool-remote-scripts/src/` input and its Tool Compose, test-scratch and
  solver-supervisor protocol dependencies.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-smoke:build --skip-nx-cache`
  built `dist/tool-smoke/smoke.js` (35,065 bytes, SHA-256
  `23181078dce7dc3cb5d13804c5892b26c7c6ff73d7b3fb3619a470788f819a8d`) from the current
  `tools/tool-smoke/src/` input. All three outputs are ignored under the repository's `dist/`
  contract and did not dirty the worktree.

The task's original command,
`bunx nx run tool-deploy:deploy --all --env=prod --dry-run`, ran all five declared dependency
tasks but exited 1 before `deploy.ts`: Nx treated `--env=prod` as the `nx:run-commands` executor's
object-valued `env` option and reported `Property 'env' does not match the schema. 'prod' should
be a 'object'.` The installed Nx target help names `--args` as its supported extra-argument
boundary, while the ordinary `-- --all --env=prod --dry-run` form hit the same collision.
Task 4.3 now records the executable form
`bunx nx run tool-deploy:deploy --args='--all --env=prod --dry-run'`; the failed original
invocation remains evidence rather than a claimed deploy result.

The corrected production dry-run reached `deploy.ts` and the read-only h2puni state lookup, then
exited 1 with the modeled refusal
`release manifest not found at dist/tool-dagger/release.json — run "nx run
tool-dagger:publish-all" first`. No release was synthesized or reused, no registry publication
or executor installation occurred, and no live deploy was requested. Because release validation
precedes plan emission, no tier plan was printed and the migration gate was not evaluated. Static
inspection of the freshly generated `swap.js` found the image-relative
`src/migrate-status-cli.ts` and `src/migrate-down-cli.ts` paths; that is bundle verification, not
evidence that a release exercised either CLI.

The candidate image-input check passed 1/1 before any Dagger connection. It resolved the exact
Dockerfile map `apps/wbs/{be-01,gw-01,fe-01}/Dockerfile`, including namespaced local COPY inputs
`libs/wbs/adapters/solver-py`, `apps/wbs/be-01`, `apps/wbs/gw-01` and `apps/wbs/fe-01`; the
frontend's build-stage COPY also names `dist/apps/wbs/fe-01`. The rename-spanning Git
migration-root fixture passed 1/1 with six expectations, and the four focused executor
migration-command tests passed 4/4: status and down resolution remain relative to the backend
image workdir as `src/migrate-status-cli.ts` and `src/migrate-down-cli.ts`, with an explicit named
down baseline.

Task 4.3 remains open. Its exact prerequisite is a real, clean-tree tool-dagger publication at
the candidate HEAD that creates `dist/tool-dagger/release.json` with current entries for be, gw
and fe; the corrected dry-run must then be repeated to emit and review every tier plan. Bundle
installation is a separate live-execution preflight and was not required or performed by this dry
run. This local verification did not publish, install or mutate host state.

## Section 4.2 local production-path verification

The frozen candidate was `7abb72f5107e5c9c03aaa077ce4d9b41549e707c`. Remote reachability
was rechecked from advertised branch refs, not by treating the SHA as a ref-name pattern. The exact
commands were:

```sh
git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'
git ls-remote --heads origin
git branch -r --contains 7abb72f5107e5c9c03aaa077ce4d9b41549e707c
```

The fetch advanced `origin/main` from `e8dcc24a` to `d3342da5`; `git ls-remote --heads origin`
enumerated 236 advertised branch refs and object IDs; and the ancestry query against the freshly
updated remote-tracking refs printed no lines. No advertised remote branch therefore contained the
candidate. The canonical h2puni gate was not invoked: its checkout-under-lock contract requires the
candidate object to be available after the build host fetches advertised remote refs. The remaining
prerequisite is a published remote branch containing the exact candidate SHA, followed by
`bin/h2puni-gate.sh 7abb72f5107e5c9c03aaa077ce4d9b41549e707c` on h2puni. Task 4.2 remains
unchecked until that gate and every obligation below are accepted together.

Before the browser run, `lsof -nP -iTCP:<port> -sTCP:LISTEN` found no listener on the assigned
5000/5100/6100 ports or packaged port 4341, and no process was rooted in this worktree. The complete
browser command was:

```sh
CI=1 E2E_PORT_SHIFT=1900 NX_DAEMON=false NX_ISOLATE_PLUGINS=false \
  bunx nx run wbs-fe-01:e2e --skip-nx-cache --output-style=stream
```

It built 916 modules into `dist/apps/wbs/fe-01`, ran one Chromium worker with zero retries, and
passed 374 tests with 36 opt-in rendering-baseline cases skipped, one existing Gantt
`test.fixme` skipped, and zero failures in 19m26s. The backend, gateway and frontend listened only
on 5000, 5100 and 6100. Repeated Vite proxy
`EPIPE`/`ECONNRESET` diagnostics accompanied deliberate page/socket teardown but did not fail a
case. All three ports were unbound after Playwright exited.

Docker client/server 29.7.2 and ShellCheck were available with host permissions. The packaged
command was:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false \
  bunx nx run wbs-fe-01:e2e-packaged --skip-nx-cache --output-style=stream
```

It rebuilt the same 916-module artifact, served `dist/apps/wbs/fe-01` with the moved Caddyfile, and
passed 2/2 Chromium cases in 12.5s. Port 4341 and the temporary Caddy container were gone after the
run. The renamed backend image command was:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false \
  bunx nx run wbs-be-01:solver-image-smoke --skip-nx-cache --output-style=stream
```

It passed in 40.3s after building from `apps/wbs/be-01/Dockerfile`, executing the moved solver
request, publishing to a temporary local registry, resolving a digest-pinned image and completing
the authenticated supervisor launch. One bounded registry readiness probe received a transient
`curl: (56) Recv failure: Connection reset by peer`; the subsequent required probe passed. The
temporary registry, caller and attempt containers were absent afterward. The conditional
`WBS_RUN_SOLVER_ORPHAN_PROC=1` half was not run because it requires the persistent systemd timer in
the h2puni user session that the canonical gate supplies; this remains part of the blocked h2puni
obligation rather than a local success claim.

The non-destructive setup step had created three ignored `.env` copies byte-identical to their
checked-in examples; those files and the run's exact timestamped SQLite database were removed after
the services stopped. Normal Playwright reports and screenshots remain as ignored gate artifacts.

## Section 4.4 Astra live relationship repair

Review of `343ee3bd9aed2e4d2e6192bf6aadd3dcc7106ae9` found a candidate-owned Tool
Wiki mismatch before any external activation boundary. The live
`docs/wiki-policy/relationships.json` fact for `check.tool-dagger.test` pinned five inputs while
the current Nx target pinned ten. The omitted inputs were exactly:

- `{workspaceRoot}/apps/wbs/be-01/**/*`
- `{workspaceRoot}/apps/wbs/gw-01/**/*`
- `{workspaceRoot}/apps/wbs/fe-01/**/*`
- `{workspaceRoot}/libs/**/*`
- `{workspaceRoot}/nx.json`

The focused production-path command was
`TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../node_modules bun test
src/policy/pilot-policy.test.ts --test-name-pattern='pins exact pre-index tuples'` from
`tools/tool-wiki`. Before repair it exited 1 after 48.66 seconds with 0 pass, 1 fail, 15 filtered
and 26 expectations; line 388 reported the complete expected five-input authority selector and
received ten-input target configuration. Adding only the five omitted inputs to the live current
relationship tuple made the identical command pass 1/1 with 15 filtered and 27 expectations in
47.71 seconds. An adjacent `Proof:` comment records the watched omission and exact production CLI
failure.

The bootstrap relationship declaration retains its historical five-input tuple. Bootstrap policy,
bootstrap/live mappings, the live policy, frozen history and external activation archives were not
changed. The restored contracts and relationship surface passed 59/59 with 1,013 expectations
across three files. The complete Tool Wiki run reached 565 pass and 14 fail across 579 tests with
5,361 expectations in 929.84 seconds. Every failure was confined to
`root-migration.test.ts` and was preempted by
`mapped destination block mismatch: docs/findings/current.md#router-landmines-001`; the pilot,
contracts and relationship files all completed green in that aggregate.

That failure was candidate-owned, not an unrelated base condition. The root-migration map and test
blobs are identical at `7abb72f5`, `343ee3bd` and this repair, while blame and the two merge parents
showed Task 4.1 had rewritten two paths inside the exact migrated `router.landmines.001` payload.
Restoring the historical `be-01/src/repository/db.ts` and `apps/be-01/src` text returned the entire
destination file to its pre-Task4.1 blob and its extracted payload to the map/source SHA-256
`ffd7294cc5ee56476bd3053fe8b0bf484dec2fe9a11addcd4c77e4f875d60f02`. The handoff inventory
initially failed 3/3 on that restored evidence; classifying the document as a historical migrated
root payload and pinning its exact legacy occurrence made the same focused command pass 3/3. The
live relationship's new `{workspaceRoot}/libs/**/*` input also raises the current recursive
selector inventory from 22 to 23 and the complete occurrence total from 261 to 262, with digest
`c3d5e0c4bb0845cfbdda63bb64686893cc181af36a14894899a5e2f73a56d588`.

After committing the candidate so the production root-migration CLI could inspect the exact
selected tree, its focused suite passed 32/32 with 324 expectations in 63.81 seconds. The complete
handoff suite passed 14/14 with 15 expectations in 12.71 seconds under the host-permitted Git
fixture environment. The final complete Tool Wiki run then passed 579/579 across 30 files with
5,362 expectations in 927.35 seconds, including the repaired pilot relationship tuple and every
root-migration refusal. Uncached `tool-wiki:lint:source` and both affected tools' typechecks
completed, their regular lint targets passed with the expected inactive/non-certified Tool Wiki
activation result, `nx format:check --all` passed, and strict OpenSpec validation passed all 83
items.

Task 4.4 remains open: Tasks 4.2 and 4.3 still retain their published-candidate and release-input
prerequisites, and this scoped repair is not the final integration/archive review.
