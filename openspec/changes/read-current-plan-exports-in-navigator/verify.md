# Verification Report

**Change**: `read-current-plan-exports-in-navigator`
**Verified at**: 2026-10-13
**Verifier**: implementation worker; independent architecture review follows.

## Structural validation

OpenSpec 1.12.0, invoked from its existing Bun cache:

```text
validate --all --json
items: 187, passed: 187, failed: 0
changes: 169 passed; specs: 18 passed
```

All four TDD tasks are implemented. Both requirements and all five scenarios map to the CLI and Burokrat tests. Delta `current-plan-exports` is pending sync until archive; original Navigator capabilities remain in their separate active change.

## Focused checks

```text
bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-navigator/cli/src ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/navigator-records.test.ts
59 pass, 0 fail (4 files)

NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p twilight-navigator twilight-burokrat --skip-nx-cache
NX Successfully ran target typecheck for 2 projects

NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p twilight-navigator --skip-nx-cache
NX Successfully ran target lint for project twilight-navigator

NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint:source typecheck build -p twilight-burokrat --skip-nx-cache
lint:source and build passed; initial typecheck found a test assertion type mismatch.
The mismatch was fixed and both project typechecks passed in the command above.
```

Navigator has no build target. Burokrat's build and its three dependency builds passed. The first test helpers' lint and assertion type findings were fixed. One unprefixed Bun path filter collected generated `dist/out-tsc` tests after typecheck; the explicit `./` paths above restrict execution to the source trees and pass. Production behavior checks use real CLI dispatch or Burokrat decoding, not copies.

The mixed-unit fixture was generated through current `PlanDocumentService.exportCaptured` from the historical fixture's tree: dev uses workdays, qa uses minutes with 30/60/120 estimates, each work item carries `charged`, the project uses the settings timezone, typed endpoints are restored to tree `workItemId`, and the clock stays at the original exported instant. The current schema validated the exporter output before it was saved. Tests bind its actual raw bytes and preserve its native values.

## Failure proofs

Each mutation was applied to the production path, the named test failed, then the original source was restored. Existing absence/unreadability tests pass under the non-root runner.

| Check                   | Injected fault                             | Observed test                                                        | Result                                                            |
| ----------------------- | ------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| v8 admission            | Restore v7-only header pin                 | writes native minute and workday estimates from the current exporter | 1 failing test                                                    |
| Required v8 unit        | Invent workday unit before strict decoding | refuses a current export with missing unit                           | 1 failing test; mutated command exited 0                          |
| Version classifier      | Remove unsupported-version guard           | refuses a version-9 document before writing                          | 1 failing diagnostic assertion                                    |
| Strict current export   | Remove deep undeclared-key rejection       | refuses a current export with unknown root/step key                  | 2 failing tests; mutated commands exited 0                        |
| Required task unit      | Make schema-2 estimate unit optional       | refuses a current task export with missing unit                      | 1 failing refusal assertion                                       |
| Strict task estimate    | Remove estimate undeclared-key rejection   | refuses a current task export with unknown key                       | 1 failing refusal assertion                                       |
| Task digest identity    | Skip tasksDigest comparison                | refuses a tampered native estimate unit/value                        | 2 failing tests; mutated commands emitted batches                 |
| Historical tasks        | Drop schema-1 union branch                 | historical task export keeps its digest and emits the same commands  | 1 failing test; repeated after switching to actual v7 preparation |
| Burokrat versions       | Retain 6/7-only literal                    | decodes a version-8 plan reference without rewriting its digest      | observed RED before implementation                                |
| Future Burokrat version | Admit v9 literal                           | refuses a wrong schemaVersion or plan document version               | 1 failing test                                                    |

Adjacent `Proof:` comments describe each changed boundary. Historical v7 output retains schema 1, original wire version and canonical task digest. Receipt schema 2 keeps native units until the digest comparison. Reference and receipt tampering remains covered by the existing digest tests.

## Gate and implementation signal

The full `bin/h2puni-gate.sh <sha>` is **not run** in this worker packet; the manager coordinates it after independent review. Therefore full format/test/lint/typecheck/build and host-wide gate success are **unverified**. Burokrat's trusted whole-tree wiki lint and its complete test suite are not run here; source lint, build, typecheck and the relevant contract tests are run. No push, merge or deploy is performed.

Base: `0ea6a1166242edf694294d1ed6e715fb7e1aed60`. The isolated clone's final commit and clean status are reported in the worker handoff. Hook installation is enabled for that commit; required checks are not bypassed.

**Decision**: focused implementation ready for independent review; release gate and archival sync pending manager coordination.
