# Verification Report

**Change**: `repo-namespacing`

**Implementation base**: `6ca89944d37ee1bdaed7f7290df0fc4272847d81`

**Verified at**: 2026-09-14

**Scope**: Tasks 1.1–1.2 only

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

## Deferred verification

Tasks 2–4, all project moves, the whole-workspace h2puni gate, browser gate, image checks,
production dry-run, publication, and archive remain intentionally unverified.
