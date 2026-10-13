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
