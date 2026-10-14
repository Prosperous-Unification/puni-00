# WBS080.25 Navigator receipt consistency verification

## Scope and implementation

Candidate based on exact parent `f179a1c680c71d86e124813e5559ff4f7cd07c6f` (draft PR #415), isolated in `/tmp/navigator-consistency-sol`. The candidate commit adds this change; its SHA is recorded by the release coordinator because embedding its own hash would change it.

`validatePlanTasks` retains strict unknown-input decoding and delegates to the exported typed `checkPlanTaskConsistency`. Navigator calls the checker before building maps, retaining receipt equality and membership checks. No dependency or CLI subprocess was introduced. Supported reference/task pairs are v6/schema1, v7/schema1 and v8/schema2.

## Failure proofs

All injected mutations were restored. Every command below used the real Navigator dispatcher; plan mismatch additionally used the real `runTwin` subprocess. The tests require exit 1, empty stdout, an invariant diagnostic and no output batch.

Initial test-first run before wiring the checker: **16 pass, 8 fail**. The eight new semantic refusals failed because conversion emitted batches. First green after wiring: **24 pass, 0 fail**. A later positive test checks native estimate retention and repeated batch bytes/digest.

| Check                          | Injected fault                                                  | Observing test in `receipt-to-commands.test.ts`                           | Observed mutation result                                                                  |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Shared consistency call        | Remove `checkPlanTaskConsistency(reference, tasks)`             | `refuses re-digested %s before writing`                                   | 8 fail; inconsistent batches emitted                                                      |
| Tasks digest binding           | Replace shared digest condition with false                      | `refuses a tampered native estimate %s`                                   | 2 fail; tampered native unit/value accepted                                               |
| Plan identity                  | Replace shared identity condition with false                    | `refuses re-digested plan mismatch before writing` via subprocess         | 1 fail; batch emitted                                                                     |
| Task count                     | Replace shared count condition with false                       | `refuses re-digested count mismatch before writing`                       | 1 fail; batch emitted                                                                     |
| Version pairing                | Replace shared pairing condition with false                     | `refuses re-digested v6 schema2`, `v7 schema2`, `v8 schema1`              | 3 fail; unsupported batches emitted                                                       |
| Task IDs                       | Replace shared uniqueness condition with false                  | `refuses re-digested duplicate task ID before writing`                    | 1 fail; batch emitted                                                                     |
| Step IDs                       | Replace shared uniqueness condition with false                  | `refuses re-digested duplicate step ID before writing`                    | 1 fail; batch emitted                                                                     |
| Step codes                     | Replace shared uniqueness condition with false                  | `refuses re-digested duplicate step code named by receipt before writing` | 1 fail; ambiguous batch emitted                                                           |
| Malformed task digest boundary | Widen `PlanReferenceRecord.tasksDigest` from `Sha256` to string | `refuses a malformed task digest before writing`                          | 1 fail; malformed reference reached consistency checking and lost its boundary diagnostic |

Mutation logs are `/tmp/navigator-consistency-fault-*.log`; the driver `/tmp/navigator-consistency-faults.py` restores each file in `finally`.

## Verification commands and output

- `NX_DAEMON=false bunx nx run-many -t lint typecheck -p twilight-navigator --skip-nx-cache`: exit 0; `Successfully ran targets lint, typecheck for project twilight-navigator` (7.8s).
- `NX_DAEMON=false bunx nx run-many -t lint:source typecheck build -p twilight-burokrat --skip-nx-cache`: exit 0; `Successfully ran targets lint:source, typecheck, build for project twilight-burokrat and 3 tasks it depends on` (16.8s). Nx printed its historical flaky-task notice for `shared-test-evidence:build` after the earlier missing-dependency failure; this run succeeded.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: exit 0; 191 items, 191 passed, 0 failed (173 changes, 18 specs).
- `bunx nx format:check --all`: exit 0; no stdout/stderr.
- `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-navigator/cli/src ./apps/twilight-structure/twilight-burokrat/cli/src/contracts ./apps/twilight-structure/twilight-burokrat/cli/src/packaging/build.test.ts --timeout=60000`: exit 0; source suite summary below.
- Changed-file `bunx prettier --check`: an initial check identified this new verification table, which was formatted with Prettier; the final check exited 0: `All matched files use Prettier code style!`.
- `git diff --check`: exit 0 with no output. Staged and committed diff checks are also required before handoff.

The first run reused stale parent workspace modules and found missing `@noble/hashes`. A private frozen installation fixed the dependency boundary: `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/navigator-consistency-bun-cache bun install --frozen-lockfile` exited 0, reporting `Checked 1573 installs across 1447 packages (no changes)`. One test-only unknown-overload assertion was corrected. A test run using Bun's unprefixed path filters passed 109 source tests but also collected generated `dist/out-tsc` tests and failed three imports; the final explicit `./` source paths avoid that collection.

## Task and spec status

Consistency and preservation requirements map to the shared checker call, existing receipt guards and the production test matrix. Design matches implementation. Delta specs remain **needs sync** until archive; no archive is requested. All four task slices are complete.

## Release limitations

The full `bin/h2puni-gate.sh <candidate-sha>` and raw full Nx gate were not run: this implementation task explicitly reserves gate, push and merge for the release coordinator. The scoped source lint target is `twilight-burokrat:lint:source`; the Tool Wiki activation lint target is left for the release gate. No claim of merge readiness or full host gate success is made here.

## Final source test output

```text
 131 pass
 0 fail
 644 expect() calls
Ran 131 tests across 8 files. [90.44s]
```
