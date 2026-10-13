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
