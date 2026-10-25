# Verification

## Baseline

Fresh origin/main: `830e774d2302d852432c51ded1e1b38e85728f66`.

`bun test libs/wbs/domain/domain/src/claim-occupancy.test.ts libs/wbs/domain/domain/src/compute-provider.test.ts`:
31 pass, 0 fail, 686 assertions.

One registered worktree: `.worktrees/wbs-resource-release`, branch
`feat/wbs-resource-release`. Dependencies link to the main checkout's existing
`node_modules`; no dependency installation or extra temporary clone was made.

## Implementation verification

Implementation and task reviews are complete. The final combined fixes are committed as
`d92479207b217eec8aa406aafbcd7deab1c6d1bb`; their scoped re-review approved all findings, with no new breakage.
The evidence below is durable; temporary task reports were removed after review closure.

## Required proof matrix

| Check                       | Fault to inject                        | Observation                                       | Status   |
| --------------------------- | -------------------------------------- | ------------------------------------------------- | -------- |
| Project/organization access | Skip authorization                     | Foreign/viewer read or write incorrectly succeeds | Verified |
| Revision                    | Skip expected revision                 | Competing event overwrites state                  | Verified |
| Release evidence            | Remove evidence requirement            | Empty evidence incorrectly records release        | Verified |
| Terminal state              | Permit mutation after reported release | History changes after terminal settlement         | Verified |
| Lifecycle matching          | Ignore run/attempt binding             | Another run's use requests cleanup                | Verified |
| UI request state            | Treat pending as released              | Incorrect completion label appears                | Verified |

These tracking checks do not certify physical release. The implemented companion runtime
and its physical cleanup proofs are recorded in [Dash verification](../dash-resource-cleanup/verify.md).

The backend implementer watched 21 restored production mutants fail at the intended assertion:
manual evidence/revision/terminal/retention checks; tenant/viewer/pinned-person access;
remaining-claim/run/attempt matching; exact runtime credential/live grant/admin binding;
source sequence/release evidence/immutable declaration; provider/resource deletion guards;
both guarded rollbacks; and the audit-schema exemption. Production `Proof:` comments retain
the fault and observation beside each guard. These are behavioral negative proofs, not only
passing tests. UI watched negatives are recorded below.

## Independent frontend verification (2026-10-25)

At frontend commit `dd368da5a`, the coordinator ran:

```sh
# cwd: apps/wbs/fe-01
TZ=UTC bunx vitest run --config vitest.view.config.ts src/components/wbs/resource-uses-panel.test.tsx src/components/wbs/resources-panel.test.tsx --no-file-parallelism --maxWorkers=1
bunx vite build
```

Results: 2 files, 54 tests passed; browser production build passed (1152 modules).
Existing Vite native-config compatibility and chunk-size warnings were visible; neither
command reported an error. Independent code review remains in progress.

Implementer watched negatives: changing pending to a release label failed the pending-state
test; removing the release evidence gate failed the missing-evidence alert test; exposing
manual report actions for managed uses failed the runtime-action test. Each mutation was
restored before the passing run and frontend commit.

## Frontend review closure

Independent review found a conflict path that stranded the modal in busy state, an offered
retry that necessarily conflicted with an already queued request, Cancel hiding an in-flight
refusal, and later-page failures discarding loaded context. Fix `de3f66d32` addressed these.
Scoped review then found a managed-conflict notice disappearing when the queued state
invalidated its form; fix `27622c66d` renders that notice independently. Final scoped review
approved specification compliance and code quality, with no remaining frontend findings.

The coordinator reran the same focused two-file view command at `27622c66d`: **59 passed**.
The production `bunx vite build` also passed again (1152 modules), with the same existing
configuration and bundle-size warnings. These proofs cover real React behavior and the production build. The subsequent browser
check below covers presentation; the separate WBS–Dash roundtrip covers physical cleanup.

## Browser presentation smoke

The focused `resource-uses.spec.ts` ordinary Playwright smoke passed 1/1 with
`CI=1 E2E_PORT_SHIFT=7500` (isolated ports 10600/10700/11700). Authentication, project creation
and the actual Project settings/Resources screen were real; only resource-use list/history
GET responses were fixture-controlled. The test covers queued managed requests and verified
release/history separately. It does not substitute for the physical runtime proof.

The coordinator inspected the queued and verified-history screenshots. Queued uses remain
visibly Active with “Cleanup request queued for Dash” and no cleanup/report actions. Verified
uses show “Release verified” and the authority/evidence history. Text was readable and not
clipped in the captured rows. Test servers stopped and its generated environment/database
files were removed. Screenshots were inspected, then removed with task-owned test artifacts after final review.

## Independent backend regression gate

At backend commit `71de05db7`, the coordinator combined the backend report's main regression
and storage/race commands into one 15-file Bun invocation with `--timeout=30000`.
Result: **269 passed, 0 failed, 6454 assertions** in 65.09s. Coverage included the actual
resource-use controller, auth/organization routes, provider management, OpenAPI/MCP output,
audit schema, claim/attempt hooks, directory/resource storage and concurrent claim/lease paths.
Independent backend review is still in progress; this result does not close its findings.

Browser smoke commit `6f8804f6b` received independent specification and quality approval.
The final review identified inconsistent fixture revisions. Commit `d92479207` corrects
reported revisions to 2/3, queued runtime source/projection to 1/2, and verified
source/projection/history to 3/4/4. The test remains a read-only presentation fixture.

## Backend review closure

Independent review confirmed three Important issues: expired historical retention was
validated against delivery time; a queued runtime actor was not rechecked against the
current person/account binding; and terminal acknowledgements could change evidence
disposition while keeping its digest/locator. Commit `0d4e7e050` fixes all three with
four composed regressions observed red before the change, then green (29 assertions).
The covering route/controller/MCP/schema suite passed 94 tests/2534 assertions, with
store/backend typechecks and scoped lint passing. Scoped re-review approved specification
compliance and code quality with no remaining backend findings.

Final coordinator backend rerun after review fixes:273 passed, 0 failed,6483 assertions
across 15 files. All45 changed source/test files passed graph-backed ESLint. The actual
backend build target and all six dependency tasks passed; the dependency-layout prerequisite
and final physical cleanup proof are recorded in the companion Dash verify record.

## Final combined-fix verification

The coordinator independently ran the following frozen final-tree backend gate:

```sh
bun test apps/wbs/be-01/src/controller/resource-use.controller.db.test.ts apps/wbs/be-01/src/app.routes.test.ts apps/wbs/be-01/src/controller/organization-context.controller.db.test.ts apps/wbs/be-01/src/controller/compute-provider.controller.db.test.ts apps/wbs/mcp-01/src/openapi-tools.test.ts apps/wbs/mcp-01/src/generated-document.test.ts libs/wbs/domain/contracts/src/http/document-from-shapes.test.ts libs/wbs/adapters/store-sqlite/src/audit.test.ts libs/wbs/adapters/store-sqlite/src/claim.db.test.ts libs/wbs/adapters/store-sqlite/src/claim-lease.db.test.ts libs/wbs/adapters/store-sqlite/src/step-node-attempt.db.test.ts libs/wbs/adapters/store-sqlite/src/directory.db.test.ts libs/wbs/adapters/store-sqlite/src/resource.db.test.ts libs/wbs/adapters/store-sqlite/src/resource-occupancy.db.test.ts libs/wbs/adapters/store-sqlite/src/claim-lease-race.db.test.ts libs/wbs/adapters/store-sqlite/src/claim-race.db.test.ts --timeout=30000
```

Result: 292 passed, one failed, 6600 assertions across 16 files (87.88s). The only failure
was the MCP README's old count of 99 versus 100 generated tools. After correcting that
one documentation value, the covering command passed **46 tests, 476 assertions**, zero failures:

```sh
bun test apps/wbs/mcp-01/src/openapi-tools.test.ts apps/wbs/mcp-01/src/generated-document.test.ts --timeout=30000
```

No production source changed between those two runs. The generated-document check also pins
the actual resource endpoint names independently, including durable admission. Final controller
coverage includes 41 cases, provisional source-0 requests, deleted task/project snapshots,
provider/resource guards, revoked/rebound actors and authority-wide admission event identity.

The corrected browser fixture passed **1/1 (11.7s)** with a fresh built frontend and actual
ordinary servers. Command from the repository root (fresh temporary cache path parameterized):

```sh
CI=1 E2E_PORT_SHIFT=8000 E2E_TEST_DATABASE=/tmp/release-final-browser-8000.db PWTEST_CACHE_DIR="<fresh-task-directory>" bunx playwright test --config apps/wbs/fe-01/playwright.config.ts apps/wbs/fe-01/e2e/resource-uses.spec.ts --project chromium
```

The run used ports 11100/11200/12200 and refused server reuse. Its temporary environment
files, database/WAL/SHM and cache were removed after the run. A temporary hardlink dependency
layout used for the backend packaging check had caused duplicate Playwright/React instances;
the browser first stopped before API traffic. Restoring the original dependency symlink and
rebuilding the frontend (1152 modules) resolved it without a production change. The browser
proof still controls resource-use GET responses; real cleanup is established by the composed
smoke, not those UI fixtures.

## Final closure

Independent whole-branch review and the scoped re-review of `449146ec1..d92479207` are complete.
All C1/I1/I2/M1 findings were addressed, with no new breakage or deferred findings. The reviewer
approved the code within the documented local-provider boundary. Final task checklists are
complete; the broader historical architecture checklist continues to distinguish future scope.

Task-owned probes/logs, build output, Nx/Vite caches, Playwright reports/screenshots/JUnit and
the unique SDD workspace were removed after preserving evidence here and in the companion
record. No disposable runtime or roundtrip fixture directories remained in `/tmp`. The feature
branch/worktree and original shared dependency symlink remain for review. Unrelated main-tree
website staging and earlier design edits were preserved. No merge, push, deployment, live
root enrollment or deletion of existing unmanaged laptop data was performed.
