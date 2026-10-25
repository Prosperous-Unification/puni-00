# Verification

## Baseline

Fresh origin/main: `830e774d2302d852432c51ded1e1b38e85728f66`.

`bun test libs/wbs/domain/domain/src/claim-occupancy.test.ts libs/wbs/domain/domain/src/compute-provider.test.ts`:
31 pass, 0 fail, 686 assertions.

One registered worktree: `.worktrees/wbs-resource-release`, branch
`feat/wbs-resource-release`. Dependencies link to the main checkout's existing
`node_modules`; no dependency installation or extra temporary clone was made.

## Implementation verification

Pending implementation and independent review. Per-task reports are in this worktree's
`.superpowers/sdd/wbs-resource-release-tracking/` until durable evidence is copied here.

## Required proof matrix

| Check                       | Fault to inject                        | Observation                                       | Status  |
| --------------------------- | -------------------------------------- | ------------------------------------------------- | ------- |
| Project/organization access | Skip authorization                     | Foreign/viewer read or write incorrectly succeeds | Pending |
| Revision                    | Skip expected revision                 | Competing event overwrites state                  | Pending |
| Release evidence            | Remove evidence requirement            | Empty evidence incorrectly records release        | Pending |
| Terminal state              | Permit mutation after reported release | History changes after terminal settlement         | Pending |
| Lifecycle matching          | Ignore run/attempt binding             | Another run's use requests cleanup                | Pending |
| UI request state            | Treat pending as released              | Incorrect completion label appears                | Pending |

Automatic host cleanup and verified runtime accounting are outside this increment and are
not exercised or claimed by these checks.

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
files were removed. Screenshots remain as local test artifacts pending final cleanup.

## Independent backend regression gate

At backend commit `71de05db7`, the coordinator combined the backend report's main regression
and storage/race commands into one 15-file Bun invocation with `--timeout=30000`.
Result: **269 passed, 0 failed, 6454 assertions** in 65.09s. Coverage included the actual
resource-use controller, auth/organization routes, provider management, OpenAPI/MCP output,
audit schema, claim/attempt hooks, directory/resource storage and concurrent claim/lease paths.
Independent backend review is still in progress; this result does not close its findings.

Browser smoke commit `6f8804f6b` received independent specification and quality approval.
A minor fixture revision inconsistency is recorded for final review: the read-only
presentation test uses revision1 for later lifecycle states while one history row uses2.
It does not exercise writes or revision agreement.

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
