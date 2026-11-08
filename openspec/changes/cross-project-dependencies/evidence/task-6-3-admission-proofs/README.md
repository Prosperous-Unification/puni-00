# Task 6.3 bounded execution admission evidence

Base: `833ceff80`. Worktree: `/tmp/puni-start-admission`. No activation, push,
merge, migration, transfer/import or incident structural mutation. Task 6.3
remains open.

## Implemented boundary

`LivePlanStore.readExecution(projectId, access, teamId)` observes required live
execution evidence and target-local startable/claim/resource facts without
constructing any scheduler. Its owned and borrowed lifetimes reuse the existing
`createLivePlanStore` observation owner. Local graphs use the same resolver and
eligibility evaluator as the connected captured graph; no fake project metadata
or actual-date values are manufactured. `deriveExecutionReadiness` shares the
existing per-project evidence folds with connected live readiness.

Startable filters only newly starting work; existing actual-start evidence keeps
continuation visible, and claimed steps remain visible. Its `prerequisites`
reading reports current FS/SS/FF truth independently of continuation and reports
stable blocker IDs, type, provenance and authored relationship identity.
`decideClaim` requires each newly acquired leaf step's admission, after claim
conflict/idempotence selection and before writes. The default all-unfinished-step
request stays atomic. Replay checks only recorded new in-progress statements;
release undo without them remains restoration. Manual progress/status/actuals and
historical attempts remain authored observations.

## Fresh checks

- Focused production/domain/readiness/lifetime/HTTP suite: **169 passed, 0 failed
  across 14 files**, [focused-green.log](focused-green.log). The command is the
  `bun test` invocation over the following files:
  `apps/wbs/be-01/src/controller/{cross-project-startable,startable-organization}.controller.db.test.ts`,
  `libs/wbs/domain/domain/src/{claim,claim-occupancy,execution-eligibility}.test.ts`,
  `libs/wbs/application/core/src/module/work-item/startable.test.ts`,
  `libs/wbs/application/core/src/service/{connected-readiness,node-readings,work-item-statuses}.test.ts`,
  `libs/wbs/adapters/store-sqlite/src/{connected-live-plan,startable-scope,read-snapshot-lifetime}.db.test.ts`,
  `libs/wbs/domain/contracts/src/http/{startable-shapes,work-item-shapes}.test.ts`.
- Shared refusal/document/MCP derivation suite: **71 passed, 0 failed across five
  files**, [transport-green.log](transport-green.log). Command:
  `bun test libs/wbs/domain/contracts/src/http/work-item-shapes.test.ts apps/wbs/mcp-01/src/generated-document.test.ts apps/wbs/mcp-01/src/openapi-tools.test.ts apps/wbs/mcp-01/src/shape-document.test.ts libs/wbs/domain/contracts/src/http/document-from-shapes.test.ts`.
- Core, SQLite and MCP forced TypeScript build: **exit 0, no diagnostics**. Command:
  `bunx tsc --build --force libs/wbs/application/core/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json apps/wbs/mcp-01/tsconfig.json --pretty false`.
- Changed TypeScript files plus new execution/controller files: **exit 0, no diagnostics**, linted with
  `bunx eslint`. Nx project graph was first generated with
  `NX_DAEMON=false bunx nx show projects`; the final lint has no warnings/errors.
  An earlier lint correctly warned that module-boundary checks were unavailable
  before graph generation; that earlier run is not the final lint evidence.
- OpenAPI emission: `bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts /tmp/start-admission-openapi.json`.
  MCP tools derive directly from shared declarations; there is no tracked
  generated OpenAPI/tool artifact to rewrite.
- `bunx openspec validate cross-project-dependencies --strict --json`: **exit 0**,
  [openspec.log](openspec.log). The full `--all` host gate was not run.

The borrowed-service test uses the real SQLite UoW and normal
`WorkItemService.collect` path: an initial remote FS refuses, a staged remote
completion releases the exact next claim evaluation, and the accepted claim,
collected recording and dirty announcement are observed before the test rolls
back. Its scheduler factory throws if used. This proves service admission,
not successful final connected tree publication.

## Watched production faults

Every mutation was applied independently to the real production function, the
named test was run and failed at its assertion, then the original file was
restored. The complete restored focused suites above passed afterward. Adjacent
`Proof:` comments name these observations.

| Removed/broken dependency      | Observed failing consumer                                      | Evidence                                       |
| ------------------------------ | -------------------------------------------------------------- | ---------------------------------------------- |
| Startable prerequisite filter  | Mounted remote FS advertised a blocked step                    | [startable-filter.log](startable-filter.log)   |
| Pure claim admission predicate | Mounted remote FS escaped its required 409                     | [claim-filter.log](claim-filter.log)           |
| Claim redo predicate           | Mounted local redo returned 200 instead of 409                 | [replay-filter.log](replay-filter.log)         |
| Actual attempted evidence      | Mounted ended-failed SS did not release start                  | [attempt-evidence.log](attempt-evidence.log)   |
| Captured progress              | Mounted remote completion failed to release successor          | [progress-evidence.log](progress-evidence.log) |
| External resolved pairs        | Mounted remote FS advertised a premature start                 | [external-edge.log](external-edge.log)         |
| FF finish blocker projection   | Mounted FF lost the reported finish condition                  | [finish-projection.log](finish-projection.log) |
| Current membership recheck     | Execution observation disclosed ready facts after revocation   | [membership.log](membership.log)               |
| Activation parity              | Legacy execution observation proceeded after activation        | [activation.log](activation.log)               |
| Scoped target selection        | Execution observation disclosed foreign b1                     | [ownership.log](ownership.log)                 |
| Shared 409 refusal arm         | Shared validator and generated MCP document lost prerequisites | [refusal-shape.log](refusal-shape.log)         |

## Remaining work and limitations

- **Task 8.4 blocks mounted connected command success:** after accepted admission,
  final command tree publication reaches the existing explicit
  `connected tree projection is unsupported` in `tree()`/`treeWithin()`.
  No local substitute, skipped publication or activation was introduced.
- Historical broad claim/resource regressions were run with
  `bun test libs/wbs/application/core/src/module/plan-commands/claim-command.test.ts libs/wbs/adapters/store-sqlite/src/claim-race.db.test.ts libs/wbs/adapters/store-sqlite/src/resource-occupancy.db.test.ts libs/wbs/adapters/store-sqlite/src/read-snapshot-lifetime.db.test.ts libs/wbs/application/core/src/service/connected-readiness.test.ts`:
  **53 passed, 63 failed across 116 cases**, [legacy-regressions.log](legacy-regressions.log).
  Failures are in the three claim/occupancy suites: their historical default
  all-step claims request QA before Dev completion. Readiness/lifetime cases
  pass. A separate scenario reconciliation must choose explicit available steps,
  actual continuing-work evidence or an expected all-step refusal; blanket
  parallelization or weakening admission is not justified.
- Frontend typecheck still reports an unhandled
  `referenced_by_external_dependency` refusal in `plan-refusal.ts`; this packet
  adds only the new `prerequisites_unmet` branch. Full frontend success is not
  claimed.
- New execution observation reuses established connected topology/capture,
  including shared-person closure, but its full mounted shared-mode/bridge,
  multi-pair expansion, remote hold, atomic batch rollback and dedicated
  execution-read concurrent-snapshot mutation matrix remains incomplete.
- Required evidence boundaries throw; the full missing/unreadable/foreign-project
  evidence production-path mutation matrix has not been completed here.
- The connected capture rereads some target facts also needed by the narrow
  local startable observation. No capture/query-count optimization is claimed.
- No standalone MCP authenticated request/refusal transport test, full frontend
  check, host exact-SHA gate, CI secrets/migration lint or complete OpenSpec gate
  has been claimed by this bounded packet. FF completion is reported, not
  universally enforced; there is no newly invented runner consumer.

## Legacy regression correction

The subsequent [regression repair](../task-6-3-regression-repair/README.md)
supersedes the legacy-red status above: all 103 repaired/extended legacy cases
pass within a 207-case focused run, and the frontend refusal compilation blocker
is corrected. The task 8.4 publication blocker and remaining observation matrix
remain open.
