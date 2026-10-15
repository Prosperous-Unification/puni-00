# Verification: Dash record-progress

Implementation of the bounded producer on design commit
`fc352e7d3a882a93ddaa8a185bfa9243439eebd2`, based on exact #488
`f7f982cae8c633779f10f4f786da389dc1138be8`. This does not complete WBS 080.25.

## Scope and contracts

The production Dash dispatcher emits only the existing v1 receipt from explicit operator
entries. Tests cover v6/v7 reference + schema-1 tasks and v8/v9 reference + schema-2 tasks,
exact PlanRef/digest/canonical bytes, repeated nonchronological entries, absent versus zero
measures, both evidence forms and v9 direct blockage facts. Production Burokrat validation
and Navigator conversion retain their existing bounded report and exact ordered commands.
Inputs and native estimates remain unchanged. No CheckRun inference, evidence authentication,
authorship, certification, current WBS authority or WBS application is added.

The Astra review's untrusted-step diagnostic finding is addressed at the producer boundary:
consistency exceptions retain their cause behind a fixed safe outer message. Existing
Burokrat and Navigator contracts and diagnostics are preserved.

## Environment and commands

Non-root uid 1000, Bun 1.4.2. A separate frozen install of the unchanged package.json/bun.lock
installed 1292 packages in 3.39s with lifecycle scripts disabled. Those local dependencies
were moved into this isolated checkout. The original shared node_modules tree lacked
@noble/hashes and leaked its external checkout path into the launcher build; neither shared
state nor the design checkout was changed. The affected relationship case passed after
using the independent locked install.

All Bun commands used writable `BUN_TMPDIR=/tmp TMPDIR=/tmp`. Nx used
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false`; it ran in process without sandbox sockets.

- Dash production/dispatcher/clock: 95 pass, 0 fail, 490 assertions (175.26s).
- Navigator/Burokrat receipt regressions: 87 pass, 0 fail, 311 assertions (34.35s).
- Effective ESLint policy, project graph and native Nx cache oracle: 69 pass, 0 fail,
  264 assertions (38.55s).
- Relationship/declaration suites: 54 pass, one dependency-resolution failure; that exact
  bundled-validator case passed after locked installation (1 pass, 10 assertions, 7.63s).
  Thus all 55 named cases have passing observed output. Relationship declarations do not
  name the Dash test target, so no corresponding declaration required an update.
- ESLint on both changed tool-devsync test files: exit 0, no diagnostics.
- Scoped Nx lint/typecheck/build: all three targets passed uncached (29.0s).
- OpenSpec 1.12.0 `validate --all --json`: 211/211 valid, 193 changes + 18 specs, 0 failed.
- Full `bunx nx format:check --all`: exit 0, no diagnostics.

Commands:

```sh
bun test apps/twilight-structure/twilight-dash/cli/src/progress/record-progress.test.ts apps/twilight-structure/twilight-dash/cli/src/cli.test.ts apps/twilight-structure/twilight-dash/cli/src/no-ambient-clock.test.ts --timeout=60000
bun test apps/twilight-structure/twilight-navigator/cli/src/receipt-to-commands.test.ts apps/twilight-structure/twilight-burokrat/cli/src/contracts/progress-receipt.test.ts --timeout=60000
bun test tools/tool-devsync/src/eslint-boundaries.test.ts tools/tool-devsync/src/workspace-projects.test.ts tools/tool-devsync/src/workspace-targets.test.ts --timeout=60000
bun test apps/twilight-structure/twilight-burokrat/cli/src/relationships/relationships.test.ts apps/twilight-structure/twilight-burokrat/cli/src/relationships/committed-target-facts.test.ts --timeout=60000
bunx nx run-many -t lint typecheck build -p twilight-dash --skip-nx-cache --output-style=static
bunx nx format:check --all
bun /tmp/puni-ci-repair-openspec-tool/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json
```

## Watched failure proofs

Each production mutation below was applied independently, its named test was observed
failing, and the original source was restored. Refusal tests invoke the real entrypoint;
the fleet dependency test invokes the real dispatcher. Their success assertions include
empty stdout and no retained new output, except the explicit cleanup-failure case.

| Boundary                    | Injected fault                                          | Observed test failure                                                                                     |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Reference decoder           | Skip its contract decoder                               | `refuses planning fault referenceExtra`: expected exit 1, received 0                                      |
| Task decoder                | Skip its contract decoder                               | `refuses planning fault tasksExtra`: expected exit 1, received 0                                          |
| Receipt decoder             | Skip its contract decoder                               | `refuses malformed entries extra`: expected exit 1, received 0                                            |
| Shared consistency          | Omit checker call                                       | `refuses planning fault unknownStep`: expected exit 1, received 0                                         |
| Safe consistency diagnostic | Rethrow raw cause                                       | `consistency diagnostics never expose untrusted step text or newline`: raw SECRET and forged line escaped |
| Flag allowlist              | Omit unknown-flag guard with all required flags present | `invocation unknown refuses before reading`: reached missing entries instead of usage                     |
| Duplicate flag              | Omit duplicate guard                                    | `invocation repeated refuses before reading`: reached input read instead of usage                         |
| Flag value                  | Omit value guard                                        | `invocation empty refuses before reading`: lost usage refusal                                             |
| Required flags              | Omit presence guard                                     | `invocation missing refuses before reading`: lost usage refusal                                           |
| Strict UTF-8                | Use replacement decoding                                | `entries input utf8 refuses safely`: lost entries-malformed diagnostic for quoted 0xff                    |
| Required read               | Skip entries read                                       | `entries input missing refuses safely`: lost missing-file refusal                                         |
| Exclusive output            | Replace wx with w                                       | `exclusive output preserves existing file`: expected refusal, received success/overwrite                  |
| Owner-only mode             | Omit 0600                                               | Canonical-v9 test: expected 0600, received 0644                                                           |
| Partial output removal      | Omit unlink                                             | Injected publication-write test: retained partial output                                                  |
| Acknowledgement order       | Print digest before publication                         | Injected publication-write test: stdout was nonempty                                                      |
| Clock                       | Inject Date.now                                         | Production effect canary: expected exit 0, received 1                                                     |
| Network                     | Inject fetch                                            | Production effect canary: expected exit 0, received 1                                                     |
| Subprocess                  | Inject Bun.spawnSync                                    | Production effect canary: expected exit 0, received 1                                                     |
| Authority                   | Inject statically imported SQLite construction          | Production effect canary: expected exit 0, received 1                                                     |
| Fleet                       | Inject dispatcher planner call                          | `dispatcher uses no clocks or fleet planner`: forbidden dependency threw                                  |
| Import allowance            | Remove exact contracts allowance                        | Effective-policy test rejected the legitimate production import                                           |
| Sibling import              | Widen contracts allowance to Burokrat namespace         | Effective-policy test accepted forbidden judge alias                                                      |
| Relative import             | Add relative Burokrat contracts allowance               | Effective-policy test accepted forbidden relative import                                                  |
| Peer path                   | Widen progress file selector to all Dash sources        | Effective-policy test accepted contracts import in peer entrypoint                                        |
| Navigator cache input       | Remove Navigator workspace input                        | Native hash oracle omitted source entrypoint and v9 fixture                                               |
| WBS contracts cache input   | Remove contracts workspace input                        | Native hash oracle omitted plan-document-shapes.ts                                                        |
| WBS validation cache input  | Remove validation workspace input                       | Native hash oracle omitted validation/src/index.ts                                                        |
| Dependency cache input      | Remove ^production                                      | Native hash oracle omitted shared validation/src/index.ts                                                 |

The initial require-based SQLite probe was vacuous because Bun's ESM module mock did not
intercept that probe. It was replaced with a static import matching production authority
code and observed failing. The proof above claims that static production path only.

Real missing and mode-000 unreadable input cases passed separately for each of entries,
reference and tasks; the tests refuse a vacuous root run. Empty JSON, malformed JSON,
invalid UTF-8, schema/semantic faults and secret-content diagnostics are exercised. Existing
file/directory/symlink/input collisions retain their bytes. Missing and unwritable parents
refuse without creating directories. Injected write and close failures leave no partial
output; an injected cleanup failure retains a visible refusal and no digest.

Observed scoped output:

```text
95 pass
0 fail
490 expect() calls
Ran 95 tests across 3 files. [175.26s]

NX Successfully ran targets lint, typecheck, build for project twilight-dash
Run duration: 29.0s
Cache: Skipped (--skip-nx-cache)
```

All six task slices are complete. Independent Astra code review remains pending.

## Remaining acceptance

Delta spec sync and archive are pending the coordinating workflow. No full repository Nx
gate, canonical exact-SHA h2puni gate, hosted CI, push, PR, deployment or release acceptance
was performed or claimed. The requested deliverable is an isolated local implementation
commit, with `fc352e7d3..HEAD` as its implementation range.

## Restack on repaired #488 (2026-10-15)

The coordinating agent supplied Astra's approval of exact implementation
`d30e983225e76c94527af08f5fda4f359e3772c9`. This restack preserves that reviewed
production/test scope and its bounded operator assertions; it adds no certification or
current WBS authority claim.

An isolated clone at `/tmp/navigator-progress-restack-sol` starts at repaired #488
`fca16386e8c993c35f169ebf57d07b04da0170a9`. Cherry-picking the reviewed design and
implementation required no conflict resolution and produced:

- Design: `3f226b1312280fefc7aa4ae8b8fb509c39ed0719`.
- Implementation: `cc0e6e2f33149c666ab7e675860f0cf834142c56`.
- Implementation tree: `2d045e1048bf801701c064afd3f3b405491bbbed`.

Fresh `git merge-base --is-ancestor` confirmed the repaired base. Comparing all 15
paths touched by the reviewed design/implementation against the implementation commit
above returned no differences. The complete tree difference from the reviewed source
was exactly the two-file #488 DB_PATH repair. This evidence section is the only
subsequent content change.

The isolated checkout copied the reviewed checkout's independently installed locked
dependencies into its own node_modules tree. Fresh commands used uid 1000,
`BUN_TMPDIR=/tmp TMPDIR=/tmp`, and `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` for Nx
and graph checks. The commands listed above were repeated on the combined tree:

- Dash production/dispatcher/clock: 95 pass, 0 fail, 490 assertions (175.33s).
- Navigator/Burokrat receipts: 87 pass, 0 fail, 311 assertions (38.65s).
- Effective policy/project graph/native cache oracle: 69 pass, 0 fail, 264 assertions
  (31.29s), after graph initialization as described below.
- Relationship/declaration suites: 55 pass, 0 fail, 695 assertions (197.57s).
- Uncached Dash Nx lint/typecheck/build: all three passed (31.2s).
- ESLint on both changed tool-devsync test files: exit 0, no diagnostics.
- OpenSpec `validate --all --json`: 211/211 valid, 193 changes + 18 specs, 0 failed.
- Full `bunx nx format:check --all`: exit 0, no diagnostics.
- `git diff --check`: exit 0.

The first direct policy run on the fresh clone reported 59 pass and 10 fail. Each
failure expected an Nx module-boundary diagnostic while Nx printed `No cached
ProjectGraph is available. The rule will be skipped.` The scoped Nx command populated
the graph; repeating the unchanged three-file policy command then passed all 69 cases,
including the new exact Dash import allowance. No check or reviewed blob was weakened.
This records a setup failure followed by a graph-backed passing run, not an initial
passing run.

The existing mutation proofs above were not repeated during this mechanical restack;
their production/test blobs are preserved. No new safety check was added. The canonical
exact-SHA h2puni gate, hosted CI, push, PR, specification sync/archive, deployment and
release acceptance remain with the coordinating workflow and were not performed here.
