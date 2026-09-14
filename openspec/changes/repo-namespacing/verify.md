# Verification Report

**Change**: `repo-namespacing`

**Task 1 implementation base**: `6ca89944d37ee1bdaed7f7290df0fc4272847d81`

**Task 2 implementation base**: `35677e3e6c6ecffd22a8871953f73affcc8fd83e`

**Verified at**: 2026-09-14

**Scope**: Tasks 1.1–2.2 only

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

The live module mapping, policy selectors, relationship declarations, module README indexes and
Nx check names use moved roots. Immutable bootstrap activation artifacts remain byte-identical.
The full Tool Wiki run consequently refuses the current moved policy against its pinned pre-move
`sourceRevision`; an intermediate dirty-base fixture also reported duplicate legacy and moved
module identities. This is the required visible indication that a fresh activation must be
prepared after the exact candidate is published. No activation, external store mutation or
publication occurred. The contracts/relationship run reached 34 pass with all 19 relationship
selector cases green; its one contract expectation was an accidental edit to a frozen benchmark
criterion and was restored before final verification.

Tasks 3.4–4, fresh Tool Wiki activation, the whole browser gate, images, deployment/migration
transition tooling, publication and the h2puni gate remain open.

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

Tasks 3.4–4, recursive Dockerfile/cache mutation proof, production deployment, publication,
whole-workspace/browser gates and the h2puni gate remain open.
