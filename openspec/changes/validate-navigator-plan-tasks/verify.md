# Verification

## Scope

WBS080.25 validates only consistency of the supplied reference and task export. The report
contains no approval, admission, certification, requirements validation or composite dependency
closure claim. Navigator's task schemas moved to Burokrat unchanged, apart from an observed
unknown-key proof comment; Navigator consumes the existing contract alias.

## Observed commands

- Initial production CLI TDD run: 8 passed, 26 failed before the route existed. Boundary tests
  already exercising shared strict JSON reading passed; command-specific positives and refusals
  failed against the unknown-command diagnostic.
- Initial implemented CLI run: 34 passed, 0 failed.
- `bun test --timeout=60000 ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/plan-tasks.test.ts ./apps/twilight-structure/twilight-navigator/cli/src/cli.test.ts ./apps/twilight-structure/twilight-navigator/cli/src/plan-reference.test.ts ./apps/twilight-structure/twilight-navigator/cli/src/receipt-to-commands.test.ts`:
  85 passed, 0 failed, 396 assertions. Includes 37 validator cases, real v7/v8 Navigator output,
  a re-digested historical v6 reference, canonical key-order/whitespace equivalence, an empty
  plan and actual process entrypoint arity refusal.
- From the Burokrat CLI directory, `bun test --timeout=60000 ./src/contracts`: 70 passed,
  0 failed, 243 assertions across four files (52.08s).
- `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json apps/twilight-structure/twilight-navigator/cli/tsconfig.json`:
  exit 0 after resolving test-only index-signature accesses.
- Scoped `bunx eslint` over all changed TypeScript files: exit 0 after import ordering,
  test type assertions and replacing a cross-project test import with real Navigator subprocess
  exports generated once per supported wire version.
- Scoped `bunx prettier --write` over changed source and artifacts: exit 0.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: exit 0, 188 passed, 0 failed
  (170 changes and 18 specs). Existing archive warnings in unrelated changes remain.
- Bare cached OpenSpec executable failed because its cache tree lacked `commander`; the pinned
  `bunx` command above resolved the complete package successfully.
- Two exploratory root test runs used an ambiguous non-`./` path filter. The first hit default
  five-second hook timeouts; the second passed 82 source tests but also collected three emitted
  JavaScript test files under `dist/out-tsc`, which failed TypeScript alias resolution. The explicit
  source-only command above resolved both invocation errors.

## R5 production-path mutations

Each mutation was temporary, its named production CLI negative test was observed failing, and
the original guard was restored. Adjacent `Proof:` comments name the fault and observed oracle.

| Injected fault                        | Observed oracle failure                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Removed task digest equality          | Tampered task name accepted, expected exit 1 received 0                                    |
| Removed plan equality                 | Re-digested plan mismatch accepted, expected exit 1 received 0                             |
| Removed task count equality           | Re-digested count mismatch accepted, expected exit 1 received 0                            |
| Removed version pairing               | All three unsupported version pairs accepted, expected exit 1 received 0                   |
| Removed task ID uniqueness            | Duplicate task IDs accepted, expected exit 1 received 0                                    |
| Removed step ID uniqueness            | Duplicate step IDs accepted, expected exit 1 received 0                                    |
| Removed step code uniqueness          | Duplicate step codes accepted, expected exit 1 received 0                                  |
| Removed positional operand validation | All five invalid operand tests lost the required usage diagnostic                          |
| Ignored task-schema unknown keys      | Six task boundary unknown-key cases accepted; reference and planRef cases remained refused |

Both operands independently cover absence, unreadability (non-root chmod proof), malformed JSON
and invalid UTF-8. Shared JSON reader checks and the reference embedded-digest guard retain their
existing adjacent proofs; this slice adds production coverage through the new command.

## Deferred checks

The worker does not run the full host gate. `bin/h2puni-gate.sh <exact-sha>`, full build and full
repository tests remain the coordinating agent's responsibility. No remote push or deployment
was performed by this worker.

## Installed launcher review repair

Astra's review found that `src/bin.ts` omitted the command from its validator allowlist and
help. The source validator tests did not cover this independently built launcher. The existing
canonical package build test now generates real Navigator v8 output, then invokes the built
`dist/bin.mjs` outside the repository for a consistent pair, a tampered task name and help.

- Before adding the launcher route, the built acceptance test failed: expected exit 0, received
  exit 1 with `unknown command: validate-plan-tasks` (1 passed, 1 failed). The route carries
  the adjacent observed `Proof:` comment.
- Removing the task digest guard and rebuilding made the built tampered-name refusal fail:
  expected exit 1, received exit 0 (1 passed, 1 failed). The guard was restored and its adjacent
  proof now names both the source CLI and built executable oracles.
- `bun test --timeout=180000 ./apps/twilight-structure/twilight-burokrat/cli/src/packaging/build.test.ts`:
  2 passed, 0 failed, 62 assertions after restoring the guard. This uses the real package builder,
  bundled launcher, bundled validator and packaged toolkit verification.
- `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`, scoped
  ESLint over the three changed TypeScript files, formatting, `git diff --check` and pinned
  OpenSpec validation all exited 0. Full host gate and push remain delegated to the coordinator.

## Cached test input repair (2026-10-14)

CI's workspace-target oracle found that the real Navigator subprocesses in the contract and
package-build tests read outside Burokrat without a declared Nx input. The test target now
names `apps/twilight-structure/twilight-navigator/cli/src/**/*`, covering the entrypoint,
its transitive source modules and versioned fixtures. No check logic changed.

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: exit 0. The default temporary directory
  was read-only; the first install exited 1 before the explicit temporary directory was set.
- Before the repair, `bun test ./tools/tool-devsync/src/workspace-targets.test.ts
--test-name-pattern 'names every file a suite reads from outside its own project'
--timeout=30000`: 0 passed, 1 failed, naming Navigator's `entrypoint.ts`, `src/fixtures`
  and `plan-export.v8.json`, matching CI. The oracle carries the adjacent observed proof.
- After the repair, the same focused command with `NX_ISOLATE_PLUGINS=false`: 1 passed,
  0 failed. Nx plugin isolation is disabled only in the verification environment because
  the sandbox refused Unix sockets; the initial failing run used Nx's in-process fallback.
- `NX_ISOLATE_PLUGINS=false bun test ./tools/tool-devsync/src/workspace-targets.test.ts
--timeout=30000`: 22 passed, 0 failed, 80 assertions.
- `bun test --preload ./tools/test/scratch/preload.ts --timeout=60000
./apps/twilight-structure/twilight-navigator/cli/src
./apps/twilight-structure/twilight-burokrat/cli/src/contracts/plan-tasks.test.ts`:
  85 passed, 0 failed, 396 assertions across four source files.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many --targets=lint,typecheck
--projects=twilight-navigator,tool-devsync --parallel=2`: exit 0, all four tasks executed
  with zero cache hits.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many --targets=lint:source,typecheck
--projects=twilight-burokrat --parallel=2`: exit 0, both tasks executed with zero cache hits.
- Scoped Prettier check over the three changed files and `git diff --check`: exit 0 after
  formatting this verification record.

Full host gate, full repository tests, full build and the package-build suite remain with
the coordinator; this repair changes only cache declarations and verification documentation.

## Subprocess dependency closure review repair (2026-10-14)

Review identified that the Navigator source input alone omitted the runtime WBS contract
import in `plan-reference.ts`. Burokrat now declares `wbs-contracts` as an implicit dependency;
its existing `^production` input includes that project's production dependency closure through
`wbs-validation` and `shared-validation`. This adds no Burokrat-to-Navigator cycle. The explicit
Navigator source input remains necessary for the subprocess source and fixtures.

The new workspace-target regression invokes Nx's real in-process task hasher with input
collection enabled and checks the expanded hashed files, without modifying source files:

- Removing the `wbs-contracts` implicit dependency made the focused test fail because
  `libs/wbs/domain/contracts/src/http/plan-document-shapes.ts` was absent from the hash inputs.
- Removing `^production` made it fail on that contract and both validation entrypoints,
  `libs/wbs/domain/validation/src/index.ts` and `libs/shared/domain/validation/src/index.ts`.
  Both mutations were restored; the assertion carries the adjacent observed proof.
- `NX_ISOLATE_PLUGINS=false bun test ./tools/tool-devsync/src/workspace-targets.test.ts
--timeout=30000`: 23 passed, 0 failed, 81 assertions, including the original outside-read
  oracle and the new production hash-input oracle.
- Repeated the Navigator and plan-task source command from the cache-input repair:
  85 passed, 0 failed, 396 assertions across four files.
- Repeated both scoped Nx command groups from the cache-input repair: all six lint/typecheck
  tasks passed, with zero cache hits. Scoped Prettier and `git diff --check` exited 0.

Full host gate, full repository tests, full build and the package-build suite remain delegated
to the coordinator.

## Composition with public main (2026-10-14)

Rebased the four PR-only commits onto exact public main
`f5db65113063ea33ae2a21e7b3f2ab86cefa18b6`, which already contains the Navigator export parent
commit `a5750895f33e04f2bca029da87ee7463665fa540`. The single conflict was the unknown-command
usage string in Burokrat's `src/cli.ts`: main's Performance inspector added `inspect-performance`
while this change added `validate-plan-tasks`. The resolution advertises both commands.

- `git range-diff a5750895f..3abf516f f5db651..HEAD` preserved all four intended patches;
  the feature patch differs only by keeping `inspect-performance` in the usage string, the
  launcher patch has updated context, and both cache fixes are identical.
- The diff against exact main contains only the validator, launcher route, shared task-schema
  move and its import/test updates, OpenSpec artifacts and reviewed cache repair. An explicit
  `git diff --exit-code f5db651 HEAD` scoped to Navigator fixtures/README, the export parent's
  OpenSpec directory, WBS contracts and the Twilight glossary exited 0.
- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: exit 0, no changes.
- `NX_ISOLATE_PLUGINS=false bun test ./tools/tool-devsync/src/workspace-targets.test.ts
--timeout=30000`: 23 passed, 0 failed, 81 assertions.
- `bun test --preload ./tools/test/scratch/preload.ts --timeout=60000
./apps/twilight-structure/twilight-navigator/cli/src
./apps/twilight-structure/twilight-burokrat/cli/src/contracts/plan-tasks.test.ts
./apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance.test.ts`:
  106 passed, 0 failed, 566 assertions across five files.
- Repeated both scoped Nx command groups from the cache-input repair: all six lint/typecheck
  tasks passed with zero cache hits.
- `bun test --preload ./tools/test/scratch/preload.ts --timeout=180000
./apps/twilight-structure/twilight-burokrat/cli/src/packaging/build.test.ts`:
  2 passed, 0 failed, 62 assertions. The canonical bundled executable validates real Navigator
  output outside the repository and refuses tampered tasks.
- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate validate-navigator-plan-tasks --json`:
  1 passed, 0 failed, no issues.
- Scoped formatting over the final diff and `git diff --check`: exit 0.

Full host gate, full repository tests and full repository build remain delegated to the
coordinator. The focused package-build suite was rerun on the composed branch as recorded above.

## CI declaration repair (2026-10-14)

Exact head `e8b5d785d5d1860df2b1c655ca3c405a015a7ab3` reproduced both committed-target-fact failures and the pilot failure. The real `twilight-burokrat:test` target already declares Navigator's source glob; both committed `check.wiki-cli.test` declarations omitted it. The pilot's frozen pre-index tuple assertions passed, then production lint refused that same authority-selector mismatch. The two declarations now include the existing glob; the frozen pilot expectations and real Nx inputs are preserved.

- Red: `committed-target-facts.test.ts` had **0 passed, 2 failed, 19 assertions**. The focused `pins exact pre-index tuples` pilot had **0 passed, 1 failed, 59 assertions**, naming `fact check.wiki-cli.test authority-selector mismatch`. These original omissions are the watched production-path negatives; adjacent `Proof:` comments and the [receipt](evidence/cache-relationship-declarations.txt) record them.
- Green: `bun test apps/twilight-structure/twilight-burokrat/cli/src/relationships/committed-target-facts.test.ts --timeout=60000`: **2 passed, 0 failed, 24 assertions**. `TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/pr415-cache-inputs/node_modules bun test apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts -t 'pins exact pre-index tuples' --timeout=60000`: **1 passed, 0 failed, 60 assertions**, including observe-mode production lint.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint:source,typecheck -p twilight-burokrat --skip-nx-cache --parallel=2`: **2 tasks passed, caching disabled**. Strict OpenSpec validation through the installed `@fission-ai/openspec@1.12.0` CLI with `validate validate-navigator-plan-tasks --strict --json`: one valid change, zero issues.
- A broader directory invocation omitted `TOOL_WIKI_TRUSTED_NODE_MODULES` and used a Bun substring selector that also collected compiled `dist` copies: **47 passed, 22 failed, 3 import errors**. The corrected command selects the three explicit `./apps/.../src/relationships/*.test.ts` files and configures the required external runtime modules; the rerun passed **66 tests, 0 failures, 1113 assertions** across the three source files (98.16s). No production workaround was added.
- Changed-file Prettier, diff whitespace checks and pre-commit lint, format, plaintext-secrets and private-nesting passed. The Tool Wiki hook reported inactive without an external activation root. Migration hooks and doc-caps skipped because their file globs did not match. `git diff --exit-code HEAD` over the real Burokrat project, frozen policy and module mappings passed.
- Full host gate, complete product suite, package build and GitHub CI remain with the coordinator after independent review. No push is performed from this repair checkout.

## Product graph CI repair (2026-10-14)

Hosted run `38479959068` at exact head `f179a1c680c71d86e124813e5559ff4f7cd07c6f`
failed the production product graph oracle on `twilight-burokrat -> wbs-contracts`.
The implicit dependency had represented subprocess cache reads as a forbidden product edge.
Burokrat now declares the WBS contracts and WBS validation directories as explicit test
workspace inputs. The Navigator source glob remains; shared validation is still reached
through Burokrat's direct shared dependency and `^production`. Both committed relationship
authorities declare the same test inputs.

- Fresh isolated checkout: `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/puni-ci415-bun bun install
--frozen-lockfile` exited 0. `BUN_TMPDIR` alone failed with EROFS before this adjustment.
- Red: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun test
./tools/tool-devsync/src/workspace-projects.test.ts -t 'is satisfiable by every internal
dependency' --timeout=30000` failed on exactly the hosted forbidden edge.
- Removing the edge before adding inputs made the real task-hasher test fail on both WBS
  source entrypoints. With explicit inputs, the combined workspace-projects/workspace-targets
  suites passed: 40 tests, 0 failures, 104 assertions. The hasher test also asserts the direct
  shared-validation edge and absence of both WBS product edges.
- R5: independently removing the contracts glob omitted
  `libs/wbs/domain/contracts/src/http/plan-document-shapes.ts`; removing the validation glob
  omitted `libs/wbs/domain/validation/src/index.ts`; removing `^production` omitted
  `libs/shared/domain/validation/src/index.ts`. Each focused real-hasher run had 0 passes,
  1 failure, 4 assertions. All mutations were restored; the assertion carries the observed proof.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show projects --affected
--files=<path> --json` exited 0 and selected `twilight-burokrat` independently for each
  of those three representative paths. This exercises Nx affected selection with the repaired
  graph rather than inferring selection from the declared globs.
- Navigator source and Burokrat plan-task tests with the scratch preload: 85 passed,
  0 failed, 396 assertions. Canonical package-build tests: 2 passed, 0 failed, 62 assertions.
- Scoped Navigator lint/typecheck, tool-devsync typecheck and Burokrat lint:source/typecheck
  passed with caching disabled. The first tool-devsync lint found an unnecessary undefined
  guard against Nx's precise dependency type; it was removed before rerunning lint.
- Pinned OpenSpec `validate --all --json` exited 0: 172 changes and 18 specs passed.

Full host gate, full repository tests and full repository build remain with the coordinator.
The separate hosted browser-auth-lifecycle readiness failure is outside this graph repair.
No remote push or merge was performed.

## Composition with public main 8f324607 (2026-10-14)

Rebased the seven PR-only commits, including the product graph repair, onto exact public main
`8f324607e6c73c249faa79733c4cb7a7dddc605b`. The only conflict was Burokrat's unknown-command
usage string: main added `inspect-performance-sources` and this PR added `validate-plan-tasks`.
The resolution keeps both. Range-diff preserved the other patches, including the graph repair;
the launcher patch differs only in context. No feature scope changed.

- Frozen dependency installation exited 0. The composed workspace-projects/workspace-targets
  suites passed: 40 tests, 0 failures, 104 assertions.
- Repeated all three independent real-hasher mutations and all three Nx affected selections
  recorded above on the composed branch: each mutation failed on its intended missing path,
  and each affected command selected Burokrat. All mutations were restored.
- Navigator, plan-task, Burokrat CLI and main's Performance source production tests passed:
  118 tests, 0 failures, 669 assertions across six source files.
- Canonical package build passed: 2 tests, 0 failures, 62 assertions, including real Navigator
  output through the built executable outside the repository and tampering refusal.
- Committed relationship declarations and focused pilot/bootstrap production tests passed:
  9 tests, 0 failures, 119 assertions. The separately focused committed pilot passed before
  restacking as well: 1 test, 0 failures, 60 assertions.
- Scoped Navigator/tool-devsync lint/typecheck and Burokrat lint:source/typecheck all passed
  with caching disabled on the composed branch.

An exploratory full Burokrat target began before the repair commit. Its pilot fixture cloned
committed HEAD's old project.json while overlaying the edited relationship declarations and
reported authority-selector mismatch. The committed focused rerun passed. The broad run was
then interrupted with controlled exit 130 before restacking to avoid changing its checkout
under live tests; its complete suite is unverified. Its abandoned named contract-test scratch
directory was removed. Full host gate and full repository checks remain delegated. The separate
hosted browser-auth-lifecycle readiness failure was not exercised by these scoped checks.

## Ordered tooling integration on stabilized WBS, 2026-10-14

Integration workspace: `/tmp/puni-tooling-batch-integration-sol`, local workstation,
uid 1000. Reviewed histories were merged without squashing in this order:

1. Stabilized WBS base `8446c9c51e20c34695986f3095c58adbcb535685`.
2. Reviewed test-axes tip `c466eb746bc88add38d437c862c74c32ac33ce6a`, merge
   `141f567833876ea2218ad5bacbdd12516521f843`.
3. Reviewed Navigator tip `b7f722d7d93c0a7a987443e297af1740a2106051`, merge
   `fddf44bef008e7c9a1b3714f2fb262573bae89cd`.

The only conflict was Burokrat's unknown-command usage string. The resolution
preserves `validate-plan-tasks`, `inspect-performance-levels`, and
`inspect-manual-observation`. Running the real `src/bin.ts` without a command
printed all three names. No safety check was added or changed by this merge;
the existing adjacent R5 mutation proofs remain on their owning checks.

| Command                                                                                                                                                                                                                                                                                                                             | Fresh observation                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BUN_TMPDIR=/tmp bun install --frozen-lockfile`                                                                                                                                                                                                                                                                                     | Exit 0; 1573 installs across 1447 packages, no lockfile changes. The initial invocation without `BUN_TMPDIR` exited 1 on a read-only temporary directory.                   |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-devsync/src/performance-processes.test.ts tools/tool-devsync/src/test-levels.test.ts tools/tool-devsync/src/workspace-targets.test.ts tools/tool-devsync/src/workspace-projects.test.ts libs/shared/domain/test-levels/src --timeout=60000` (approved socket access) | Exit 0; 176 tests passed, 0 failed, 633 assertions across 6 files, including production CLI refusals, real Nx hash dependency assertions and process fault injection cases. |
| Navigator: `bun test --preload ../../../../tools/test/scratch/preload.ts src --timeout=30000`                                                                                                                                                                                                                                       | Exit 0; 59 tests passed, 0 failed, 339 assertions across 3 files.                                                                                                           |
| `BUN_TMPDIR=/tmp NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p twilight-navigator tool-devsync shared-test-levels --skip-nx-cache --output-style=static`                                                                                                                                           | Exit 0; all six requested targets passed uncached.                                                                                                                          |
| Same environment, `bunx nx run twilight-burokrat:lint:source --skip-nx-cache --output-style=static` and `bunx nx run twilight-burokrat:typecheck --skip-nx-cache --output-style=static`                                                                                                                                             | Both exited 0, uncached.                                                                                                                                                    |
| `OPENSPEC_TELEMETRY=0 BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                                                                                                       | Exit 0; 174 changes and 18 canonical specs passed, zero failures.                                                                                                           |

The first devsync invocation used a preload path without its required `./` and
exited 1 before collecting tests; the corrected command ran. That sandboxed run
reported 169 passes and two failures: the adopted listener fixtures could not
write their readiness markers because their TCP listeners could not start.
An independent localhost `node:net` listener probe also failed to bind in the
sandbox. The identical suite was rerun with approved socket access.

Independent Astra review on source head `fddf44bef008e7c9a1b3714f2fb262573bae89cd`
reported no blocker. Its completed CLI/evidence/package selection passed 328 tests,
zero failures, 1529 assertions across 10 files; its runner selection passed 181 tests,
zero failures, 585 assertions across 3 files. Focused ESRCH/EIO/malformed identity
cases additionally passed 3 tests, zero failures, 15 assertions. Review logs are
`/tmp/tooling-batch-astra-review-tests.log` and
`/tmp/tooling-batch-astra-runners.log`.

The integration worker's broader Burokrat selection completed with exit 0:
595 tests passed, zero failed, 2924 assertions across 20 files (473.77s).
From the Burokrat CLI directory, the command was
`TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/../../../../node_modules bun test --preload ../../../../tools/test/scratch/preload.ts src/architecture-level.test.ts src/contracts/plan-tasks.test.ts src/cli.test.ts src/evidence src/packaging/build.test.ts src/packaging/installed-dispatch.test.ts src/policy/pilot-policy.test.ts src/relationships/committed-target-facts.test.ts src/activation/review-attestation.test.ts --timeout=60000`.
The log is `/tmp/tooling-burokrat-tests.log`. No production changes were made
while either selection ran. Formatting of the conflict resolution and this
verification record, `git diff --check`, and ancestry checks for all three
input tips passed.

Full repository tests/build, secrets and migration checks, and the canonical
`bin/h2puni-gate.sh <sha>` are unperformed by this integration worker and remain
with the coordinator. No deployment, push, PR creation or remote merge occurred.
