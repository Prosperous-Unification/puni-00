# Verification Report

## Isolated scheduler checkpoint

Base: `87a2b7edbfaabae889d91daa823f16f520a51cec`. This checkpoint implements the injected scheduling loop only; it does not activate production scheduling or change the existing core service.

- `bun test apps/wbs/be-01/src/runtime/domain-proof-worker.test.ts`: 6 pass, 0 fail, 19 assertions.
- Red baseline: new test file failed because `startDomainProofWorker` was absent.
- `bunx eslint` for both worker files: exit 0. Nx module-boundary rule skipped because the isolated clone has no cached project graph; this rule remains unverified.
- `bunx prettier --check` for both worker files: passed.
- `bunx @fission-ai/openspec@1.12.0 validate organization-domain-proof-scheduling --json`: 1 passed, 0 failed, no issues.

## Failure proofs

All mutations were applied separately to the production worker and restored before the green run.

| Check                         | Injected fault                                | Observed production-path failure                                                |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| Immediate sweep               | Remove sweep call                             | `sweeps immediately`: expected 1 call, received 0                               |
| Serialization                 | Remove sweep await                            | `joins a running sweep`: expected 0 waits while held, received 1                |
| Stop cancellation             | Remove abort call                             | `aborts and joins in-flight work`: expected aborted signal true, received false |
| Stop join                     | Return resolved promise instead of completion | Same test: expected stopped false while lookup held, received true              |
| Post-stop wait refusal        | Remove post-sweep cancellation check          | Same test: expected 0 waits after stop, received 1                              |
| Production timer cancellation | Remove abort listener                         | `joins cancellation of the production timer`: timeout after 200 ms              |

## Bounded sweep checkpoint

The runtime now validates its limit (integer 1 through 32), reads the repository's fully validated due snapshot set, sorts by last check time then claim ID, and selects the bounded lookup/commit batch. The repository still materializes and validates all verified claims. This is not a bounded database read.

Red baseline after fixing the activation fixture: matching and missing-TXT startup checked 65 instead of 32; the one-claim oldest-first case checked 2 instead of 1. The activation fixture now explicitly removes the irreversible trigger to model storage rollback, as the existing mounted currentness test does.

- `bun test apps/wbs/be-01/src/runtime/domain-proof-worker.test.ts apps/wbs/be-01/src/runtime/domain-proof-worker.db.test.ts apps/wbs/be-01/src/controller/domain-organization.controller.db.test.ts`: 68 pass, 0 fail, 245 assertions. Existing endpoint fault-injection tests emitted their expected error reports.
- Both 65-claim scheduler cases observed 32, 32 and 1 checked claims. Missing TXT preserved all 65 last-success times and verified ownership during grace.
- Focused ESLint for all three worker files: exit 0, with the same unverified module-boundary-rule warning.
- Changed-file Prettier formatting and change-specific OpenSpec validation passed (1 change, no issues).

Additional separately watched and restored production-path mutations:

| Check                         | Injected fault                                   | Observed failure                                                                        |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Integer batch limit           | Remove integer validation                        | Invalid-limit test accepted NaN instead of throwing RangeError                          |
| Positive batch limit          | Remove lower bound                               | Invalid-limit test accepted zero                                                        |
| Maximum batch limit           | Remove upper bound                               | Invalid-limit test accepted 33                                                          |
| Batch selection               | Remove slice                                     | Both scheduled progress cases checked 65 on startup instead of 32                       |
| Oldest-first selection        | Remove timestamp ordering                        | Selected claim-00 instead of older claim-01                                             |
| Stable tie-break              | Remove ID ordering                               | Both progress cases selected reverse-inserted IDs instead of claim-00 through claim-31  |
| Full trusted-state validation | Replace repository missing-proof throw with skip | Malformed out-of-batch claim was hidden; worker returned checked 32 instead of throwing |
| Digest currentness            | Remove repository digest comparison              | Changed proof committed checked 1 instead of stale 1                                    |
| Timestamp currentness         | Remove repository timestamp comparison           | Changed check timestamp committed checked 1 instead of stale 1                          |
| Release currentness           | Remove repository missing/status check           | Released snapshot threw TypeError on absent current claim instead of returning stale 1  |
| Activation currentness        | Remove repository finish-time activation check   | Rolled-back activation committed checked 1 instead of stale 1                           |

Existing repository proof comments remain adjacent to the currentness and trusted-state guards; repository source was restored byte-for-byte after mutations.

## Pending work and checks

Cancellation before proof commit, modeled DNS failure contract, production boot/disposal binding, entrypoint failure ownership, exact Astra review and push remain pending. Full typecheck, build, host gate, CI, external live-domain evidence, spec synchronization and archive have not run. The full feature is not complete.
