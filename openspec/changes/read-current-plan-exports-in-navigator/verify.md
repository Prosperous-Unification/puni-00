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

## WBS080.25 strict v9 reader and receipt amendment — 2026-10-15

Base: `3b80e0d9fce1c35ade3ffe32d84ae31a02cfba01`; isolated checkout `/tmp/puni-wbs080-25`.

The v9 fixture was generated with `PlanDocumentService.exportCaptured` using the historical
mixed-unit tree, fixed original export clock, reconstructed tree dependency endpoints,
and a leaf's dev blockage at `blockedAt: -1` with dev progress `done`. The export was asserted
against `planDocument` before saving. The fixture has one actual direct fact; empty facts
are a separate case. No domain import or product fence was added to Navigator.

Focused commands:

```sh
bun test --timeout=30000 --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-navigator/cli/src ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/navigator-records.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/plan-tasks.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/contracts/progress-receipt.test.ts
bun test --timeout=180000 --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/packaging/build.test.ts
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p twilight-navigator twilight-burokrat --skip-nx-cache
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-navigator:lint --skip-nx-cache
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache
bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json
```

Packaged external consumer: **2 passed, 0 failed, 68 assertions**. It generates a v9
reference through Navigator and invokes both consistency commands on the canonical executable
from outside the repository, then exercises tampering and unknown membership refusal.
Both project typechecks and source lints pass. OpenSpec 1.12.0 validates all 207 items
(189 changes and 18 specs), with zero failures. Changed files are formatted with Prettier,
and `git diff --check` passes. **Final focused suite: 184 passed, 0 failed, 708 assertions across 6 files.**
The first focused invocation hit default five-second setup timeouts. The second run exposed
an EEXIST test setup error for the v8 matrix member; the corrected setup reuses the already
created v8 directory. Test JSON values were given precise fixture types after source lint
reported unsafe JSON access. These issues were corrected before final verification.

Watched production mutation proofs (every injected change was restored immediately):

| Boundary               | Injected fault                     | Observed production test failure                          |
| ---------------------- | ---------------------------------- | --------------------------------------------------------- |
| Owner                  | Remove owner membership            | `refuses v9 owner` exits 0; 1 failing test                |
| Leaf                   | Remove leaf ownership              | `refuses v9 parent` exits 0; 1 failing test               |
| Step                   | Remove step membership             | `refuses v9 step` exits 0; 1 failing test                 |
| Timestamp bound        | Remove Number.isSafeInteger        | `refuses v9 unsafe time` exits 0; 1 failing test          |
| Integer time           | Truncate fact time before decoding | `refuses v9 fractional time` exits 0; 1 failing test      |
| Pair uniqueness        | Remove pair guard                  | `refuses v9 duplicate` exits 0; 1 failing test            |
| Required collection    | Invent empty facts before decoding | `refuses v9 missing facts` exits 0; 1 failing test        |
| Strict shape           | Remove deep unknown-key rejection  | `refuses v9 unknown nested key` exits 0; 1 failing test   |
| Version admission      | Restore v7/v8 header pin           | Both v9 positives fail; 2 failing tests                   |
| Future version         | Bypass header version guard        | v10 refusal diagnostic fails; 1 failing test              |
| Raw export identity    | Hash decoded canonical document    | Both raw-byte assertions fail; 2 failing tests            |
| Version/schema pairing | Remove shared pairing guard        | Re-digested v9/schema1 conversion exits 0; 1 failing test |
| Burokrat versions      | Admit v10 literal                  | Future-version decoder refusal fails; 1 failing test      |

The initial TDD RED run showed 14 failures before v9 support was added. Production dispatch
negatives assert no output files and empty success stdout. Final regression coverage retains
v7/schema1, v8/schema2, historical v6 references, both consistency commands, re-digested
v9/schema1 refusals, and v10 refusals. The blockedAt-only test asserts equal tasks/tasksDigest
and distinct exportDigest/referenceDigest. Receipts still bind the six-field PlanRef and do
not certify blockage freshness.

Full canonical h2puni gate, complete repository tests, trusted whole-tree wiki lint and
release activation are **not run by this worker**. The installed pre-commit tool-wiki hook
returned `inactive`, `certified: false`, because the external activation root is not provisioned;
this is not a trusted wiki validation result. Other installed hooks passed. The parent coordinates the exact-SHA gate
and independent review. No push, merge or deploy is performed before that review.
