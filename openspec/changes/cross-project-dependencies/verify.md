# Verification record

**Change:** `cross-project-dependencies`  
**Status:** Implementation in progress; only recorded completed slices are verified.  
**Prepared:** 2026-10-22. This is not a completed `openspec-verify-change` report.
The schema normally produces final verify after apply; this initial record
preserves reported design evidence and clearly separates all unrun obligations.

## Design evidence and limits

The parent session reported these fresh checks on `85e0d8ab9`. They are
historical reported observations, not commands rerun by this plan author and
not evidence for implementation or later edited artifacts:

| Command                                                                                                                                                                                                                                        | Reported observation                                 | Scope                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| `bun node_modules/@fission-ai/openspec/bin/openspec.js validate cross-project-dependencies --strict --json`                                                                                                                                    | Exit 0; valid true, issues [], 1 passed, 0 failed    | Change structure at that revision only |
| `bun node_modules/prettier/bin/prettier.cjs --check openspec/changes/cross-project-dependencies/proposal.md openspec/changes/cross-project-dependencies/design.md openspec/changes/cross-project-dependencies/specs/project-addresses/spec.md` | Exit 0; `All matched files use Prettier code style!` | Those three documents only             |

The parent also reported formatting success for the earlier design documents
and `CONTEXT.md` at its earlier b021 revision, with no exact command/output
captured here. That report does not establish current formatting. Architect
corrections were subsequently committed at `278b7fe6d`; the parent reported
strict change validation passing and independent architecture re-review finding
no remaining actionable issue. Those are reported design reviews, not runtime
or production safety proofs. Final current-artifact validation belongs below
when actually run.

The plan author ran the locked CLI's `instructions tasks --change
cross-project-dependencies --json` and `instructions verify --change
cross-project-dependencies --json` (both returned artifact instructions). Read-only
source investigation confirmed actual typed store, graph guard, canonical/hold,
ChainSnapshot/LivePlan, solver and configured Nx seams. No implementation tests,
builds or heavy gates were required or run for plan preparation.

## Current planning validation — 2026-10-22

Root copied the plan author's two artifacts into the feature worktree after
independent Astra High re-review accepted the corrections in `278b7fe6d`.
Fresh commands on the complete planning packet:

- `bun node_modules/@fission-ai/openspec/bin/openspec.js validate cross-project-dependencies --strict --json`:
  exit 0, `valid: true`, `issues: []`, one passed and zero failed.
- `bun node_modules/prettier/bin/prettier.cjs --check openspec/changes/cross-project-dependencies`:
  exit 0, `All matched files use Prettier code style!`.
- `git diff --check`: exit 0 with no output.

The normal commit hooks ran for the review correction commit. Tool Wiki reported
`inactive`, `certified: false`, because the external activation root is not
provisioned; its successful process exit is not certification. No application
implementation tests, migration proofs, builds, host gate or CI were run for
this planning packet. Those remain required for delivery.

## Task completion and traceability

- [ ] All implementation checkboxes in [tasks.md](tasks.md) complete.
- [ ] Current artifact strict and full OpenSpec validation recorded.
- [ ] Every delta scenario mapped to an observed behavior test.
- [ ] Every changed safety check has a watched production-path negative below.
- [ ] Implementation review and required CI/host gates complete.

Remaining task slices block full implementation completion/archive.

Execution tracking: [WBS cross-project dependencies](https://dev.wbs.bulletpoints.club/?project=7a42c70a-9c86-4e2d-9246-b4d677224e91),
project `7a42c70a-9c86-4e2d-9246-b4d677224e91`, root `010`
(`ebdcb576-8f98-4cfb-8d57-b2347d202238`). The task headings map grammar to
`010.02`, storage `010.03`, lookup/contracts `010.04`, graph/lifecycle `010.05`,
schedule/readiness `010.06`, optimizer `010.07`, live/snapshot/transfers `010.08`,
UI `010.09`, activation `010.10`, delivery `010.11`; `010.01` tracks review/plan.
These are tracking receipts, not evidence that package implementation is done.

## Delta spec sync

| Capability                 | Status                 | Note                                        |
| -------------------------- | ---------------------- | ------------------------------------------- |
| project-addresses          | Partial: 1.1, 2.1, 2.2 | Delta retained; no main-spec sync performed |
| cross-project-dependencies | N/A: unimplemented     | Delta retained; no main-spec sync performed |
| wbs-domain                 | N/A: unimplemented     | Delta retained; no main-spec sync performed |
| plan-import                | N/A: unimplemented     | Delta retained; no main-spec sync performed |
| saved-plans                | N/A: unimplemented     | Delta retained; no main-spec sync performed |
| live-plan-snapshot         | N/A: unimplemented     | Delta retained; no main-spec sync performed |
| scheduler-optimization     | N/A: unimplemented     | Delta retained; no main-spec sync performed |
| plan-command-registry      | N/A: unimplemented     | Delta retained; no main-spec sync performed |

## Failure-proof register

Rows marked `NOT RUN` are planned injections, not observed proofs. Expand rows
per individual implemented guard/hash field/call site, cite exact file:line and
test name, and change their status only after actual observation. The task file
supplies concrete test names and production paths. No `Proof:` comment may
claim these observations in advance.

| Check / task                                    | Planned fault injection                                                                                                      | Production-path test that must observe failure                                                                                            | Observed result                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Grammar 1.1 / 2.2                               | Remove length, leading-letter, character or first-dot check individually                                                     | `project-address.test.ts` named grammar cases, then `project-address.controller.db.test.ts` malformed admission                           | 1.1: 11 restored failures; 2.2 HTTP: observed rejection bypass, [API proof](evidence/task-2-api.md) |
| Backfill/allocation 2.1                         | Omit backfill or allocator; disable namespace trigger/unique index; exhaust counter                                          | `project-abbreviation-migration.db.test.ts` old-writer/concurrent/backfill/namespace/exhaustion cases                                     | Observed; see task2 storage evidence and diagnostic-only limits                                     |
| Required project state 2.2                      | Delete or corrupt abbreviation row; bypass trusted-row guard                                                                 | `project-address.controller.db.test.ts`: absent/malformed rows refuse                                                                     | Observed trusted decoder fault; [API proof](evidence/task-2-api.md)                                 |
| Organization and bounded lookup 3.1             | Remove project/organization predicate or response bound                                                                      | `project-address-search.controller.db.test.ts` scoped/bounded/foreign cases                                                               | NOT RUN                                                                                             |
| HTTP/MCP boundary 3.2                           | Remove shared endpoint/version shape validation                                                                              | Mounted HTTP/MCP malformed scope/type/ID cases                                                                                            | NOT RUN                                                                                             |
| Relationship integrity 4.1                      | Remove each endpoint/project/step/organization/duplicate check                                                               | Unified repository and migration DB cases                                                                                                 | Observed/restored migration, store and review faults; [evidence](evidence/task-4-storage.md)        |
| Current write authority 4.2                     | Bypass current access, successor owner or remote endpoint shape                                                              | `cross-project-dependency-commands.controller.db.test.ts` revoked/foreign/second-owner cases; assert no partial state                     | NOT RUN                                                                                             |
| Actual graph 4.3                                | Omit expanded pair; use project DAG; use target reach globally; skip each structural admission site                          | `connected-step-node.test.ts` and mounted cycle/structural cases, retaining valid interleaving positive                                   | NOT RUN                                                                                             |
| Lifecycle/history 4.4                           | Remove deletion refusal, incident map, touched-ID/replay graph/current-access check separately                               | External deletion/hand-down/concurrent undo/redo controller cases                                                                         | NOT RUN                                                                                             |
| Coherent capture 5.1                            | Remove transaction; read cache/derive after closure; replace borrowed DB; omit close                                         | `connected-plan-capture.db.test.ts` concurrent endpoint and cache publication, borrowed and lifecycle cases                               | NOT RUN                                                                                             |
| Capture authority/completeness 5.1              | Omit closure or authorization; delete/corrupt/unreadably supply required evidence                                            | Production factory capture cases; distinguish absence/unreadability where contract does                                                   | NOT RUN                                                                                             |
| Post-commit scoped fanout 5.2                   | Drop dependency traversal, emit before commit, bypass organization filter                                                    | `cross-project-events.controller.db.test.ts` no-shared-person, rollback and label privacy cases                                           | NOT RUN                                                                                             |
| Placement constraints 6.1                       | Remove each eligibility/type inequality, capacity namespace or held reduction                                                | `schedule-connected.test.ts` and existing priority/resource/hold regressions                                                              | NOT RUN                                                                                             |
| Calendars 6.2                                   | Substitute target anchor, round fractional bounds, omit floor, use day zero for missing date                                 | `schedule-connected-calendar.test.ts` and mounted missing-calendar projection                                                             | NOT RUN                                                                                             |
| Readiness 6.3                                   | Replace remote progress with empty/local progress or skip required evidence                                                  | `cross-project-startable.controller.db.test.ts` actual tree/startable cases                                                               | NOT RUN                                                                                             |
| Wire/model 7.1–7.2                              | Omit each bound/version/model inequality or Python schema member                                                             | Production request fixtures, actual solver/validate tests, omitted-expanded-pair case                                                     | NOT RUN                                                                                             |
| Boundary-infeasible preparation/outcome 7.2–7.3 | Require fake quantized feasible baseline; reject empty integer window; map stage outcome to malformed/global infeasible      | Real 0.2→one-day→1.2 quantum48 preparation/solve/exit/read cases, with and without local deadlines                                        | NOT RUN                                                                                             |
| Composite and proof scope 7.3                   | Bypass stage bound, foreign pinning, full-component validation or certificate scope                                          | `connected-optimization.test.ts` mixed/interleaved stages and proof/comparison cases                                                      | NOT RUN                                                                                             |
| Question identity 7.4                           | Remove every new hash member one at a time                                                                                   | Hash/cache tests for stable endpoints, type, anchors, capacity/mode, rank, boundaries, versions; report each separately                   | NOT RUN                                                                                             |
| Publication 7.4                                 | Bypass exact identity/generation/foreign-start/materialized FS SS FF check separately                                        | `connected-publication.test.ts` stale and forged solver responses                                                                         | NOT RUN                                                                                             |
| Terminal cache/restart/Retry 7.4                | Reuse failure/global-infeasible persistence; retain slot; bypass same-question retry suppression                             | DB/read/restart/manual Retry cases assert boundary-infeasible retained, slot released, no attempt; changed identity admits fresh question | NOT RUN                                                                                             |
| Capture non-admission 5.1 / 7.4 / 8.4           | Substitute admitting optimizer reader                                                                                        | Mounted captured/live reads assert no generation, queue entry, slot or event                                                              | NOT RUN                                                                                             |
| Transfer 8.1                                    | Drop external evidence/version guard; rebind by reused text; bypass current mapping/access/graph; fail after staged creation | Mounted export/import/rollback cases                                                                                                      | NOT RUN                                                                                             |
| Copy 8.2                                        | Clone outgoing incident links, reuse IDs, bypass current access/graph                                                        | `typed-dependency-copy.controller.db.test.ts` no foreign-owner mutation and identity cases                                                | NOT RUN                                                                                             |
| Immutable history 8.3                           | Reread live foreign facts; omit required captured evidence; escape save transaction                                          | Actual save/read/compare tests with renamed/deleted/unreadable live endpoints                                                             | NOT RUN                                                                                             |
| Reader parity and closure 8.4–8.5               | Route surface through old rank-only path; derive after closure; truncate closure at search page size                         | Mounted tree/batch/load/spaces/arrangement/restart and capture-count cases                                                                | NOT RUN                                                                                             |
| UI 9.1–9.2                                      | Remove alpha/stale-token/cancel guards; substitute local step UUID; collapse refusal to empty; permit terminal Retry         | Mounted reference field/editor/settings/cards and outcome cases                                                                           | NOT RUN                                                                                             |
| Semantic activation 10.1                        | Skip participant capability, activation, startup or active-edge downgrade check                                              | Actual startup and `cross-project-activation.controller.db.test.ts` dormant/overlap/active cases                                          | NOT RUN                                                                                             |
| Deploy/restore 10.2                             | Suppress candidate capability; omit applied capture/hash member; edit applied migration; fail restore                        | Compose/Kubernetes production deploy adapter tests; inspect full ledger and pinned recovery command                                       | NOT RUN                                                                                             |

- [ ] All individual new/changed checks recorded with observed red then restored green.
- [ ] All negatives reach production paths; none merely reproduces the check.
- [ ] Filesystem absence and unreadability separately tested when distinguished.
- [ ] No claim exceeds the contract of the observed command or exit status.

## Gate output and implementation signal

The following table records current check scope; unavailable gate output is not
fabricated and no implementation completion is implied:

| Required implementation/release check                                 | State                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Focused Bun behavior/DB tests and API/conformance targets             | Completed slices 1.1/2.1/2.2/4.1: evidence below; remaining feature suites pending                |
| Frontend configured Vitest and browser scenarios                      | API affected files: 121 passed; browser/full frontend pending                                     |
| `bunx nx run wbs-solver-py:test`                                      | NOT RUN                                                                                           |
| Current `./node_modules/.bin/openspec validate --all --json`          | NOT RUN                                                                                           |
| `bunx nx format:check --all`                                          | NOT RUN                                                                                           |
| Full test/lint/typecheck/build gate                                   | NOT RUN                                                                                           |
| CI secrets and migration lint                                         | NOT RUN                                                                                           |
| Isolated h2puni `bin/h2puni-gate.sh <candidate-sha>`                  | NOT RUN                                                                                           |
| Runtime semantic activation, migration/rollback rehearsal, deployment | NOT RUN                                                                                           |
| Implementation clean-worktree and pushed commit-range proof           | Reviewed grammar/abbreviation API/dependency storage through 7e1b083d5; full pushed range pending |

On h2puni use the isolated-worktree host gate, not raw full Nx commands; capture
the printed `h2puni gate: running on <sha>`, full output and exit status. On
other authorized gate environments record actual configured CI-equivalent
commands/output. Re-run final verification after implementation; reported
earlier design checks do not cover a later candidate.

**Decision:** Slices 1.1, 2.1, 2.2 and 4.1 are implemented with the review scope recorded below.
The feature remains incomplete; remaining behavior, integration and release
verification block completion/archive/release. Slice evidence is not a full gate.

## Task1.1 — grammar completed2026-10-22

Commit `b06bf6595`; independent Astra High task review approved with no findings.
`bun test libs/wbs/domain/domain/src/project-address.test.ts libs/wbs/domain/domain/src/step-reference.test.ts` passed25tests,0fail,123assertions.
Eleven independently injected faults caused failures and were restored: length, initial-letter, allowed characters, normalization order, first-dot delimiter, invalid prefix, invalid endpoint reference, numeric grammar, step grammar, recommendation characters and recommendation length. Exact observed outputs and test names are retained in [task1 evidence](evidence/task-1-grammar.md). Adjacent production `Proof:` comments name those tests.

Focused ESLint (with Nx graph), Prettier and domain `tsc --noEmit` passed. Normal commit hooks passed; Tool Wiki reported inactive/uncertified. This receipt completes pure grammar only. Later storage/API evidence follows; lookup, complete feature behavior, host gate and CI remain unverified.

## Task2.1 — additive storage completed2026-10-22

Reviewed originals `56d1ec814` / `057968a92` integrated as `8acb32844` / `3fd1d9dce`. Independent Astra High review and scoped minor re-review approved. [Storage evidence](evidence/task-2-storage.md) retains positive/negative observations and linked mutation logs.

Final focused storage suite:15passed,0failed,57assertions. Corrected backfill/calendar/organization-records batch:113passed; corrected optimizer rollback:1passed. Root reran browser lifecycle outside sandbox:14passed,67assertions, resolving the baseline subprocess EPERM. Earlier676pass/5fail regression run is retained honestly:four actual regressions were corrected and rerun, fifth was sandbox-only. No claim that an untouched full-suite rerun occurred. Focused typecheck, changed-file lint,format,migrationlint and normalcommit hooks passed. Tool Wiki remains inactive/uncertified.

Fault proofs cover allocation/backfill, grammar (including NUL TDDred), namespace write/read, uniqueness, PK/FK/cascade, atomic concurrentwriters, globaloccupiedskip and rollback removal. Missing-counter and exhaustion mutations establish explicit diagnostic distinctions; lowerconstraints still refuse writes, so those observations do not prove the explicit guard alone prevents unsafe writes. Required-row read/write guards were observed failing after removal.

Ruling: preserve immutable organizationownership; initial mapping/allocator triggers work in either order. Ownership-backfill counts top-level INSERT RETURNING rows because Bun changes includes trigger writes. API integration2.2 is recorded below. External relationships and release gates remain pending. WBS allocator010.03.1 complete.

## Task 2.2 — project abbreviation API completed 2026-10-22

Reviewed originals `695869a1e` and `275826068` integrated as `28a28379d` and `c51ba1697`. Independent Astra High review found three Important issues; scoped re-review approved all three fixes with no new findings. [Implementation evidence](evidence/task-2-api.md) and [review](evidence/task-2-api-review.md) retain scope, commands, results and limitations.

Live project contracts expose required persisted abbreviations; creation/edit/import use typed refusals and atomic parent revision/audit behavior. A shared strict joined decoder preserves missing-row failures and one-query listing. Historical v10 metadata remains optional and validated separately. Import allocates destination identity and rolls back the complete import on refusal. Combined abbreviation/name/timezone edits now return the one persisted revision.

Original mounted project/import batch: 121 passed, 605 assertions. Changed-caller follow-up: 197 passed, 509 assertions after additive metadata goldens were corrected; earlier two failures and one pre-existing skipped memory case remain disclosed. Affected frontend files: 121 passed. Final review-fix batch: 52 passed, 259 assertions. Fresh affected core/module/backend/frontend/contracts/memory/SQLite typechecks passed at their reported slice revisions; initial Nx socket refusal was excluded from evidence. Changed lint/format, diff checks and normal commit hooks passed. Tool Wiki remained inactive/uncertified.

Seven watched production negatives were restored: manual grammar rejection, conflict translation, trusted namespace decoder, organization concealment, parent audit stamp, narrow audit-schema exemption, and complete outer-import rollback. For the last, forcing the outer refusal decision to commit produced two failed tests with real directory/mapping/association leaks; strengthened snapshots cover every SQLite table. Linked durable logs in the evidence report retain actual failures.

External import, lookup, authoring, graph/capture/scheduling, editor UI and full frontend/browser suites remain later work. Backend-before-strict-client rollout ordering is specified but not operationally rehearsed. No full gate, CI, deployment or external authoring activation is claimed. WBS 010.03.2 is done as a reviewed implementation slice.

## Task 4.1 — unified dependency storage completed 2026-10-22

Astra High approved original `14b43aab4` after two P2 corrections in `da756535c`; integrated as `772fe335e` and `a7688e9f0`. Final test-only fixture typing correction `8d6083056` integrated as `7e1b083d5`. Root inspected its unchanged exact normalization expectations; that mechanical correction is outside the preceding scoped Astra verdict and remains in the eventual whole-branch review scope. [Implementation evidence](evidence/task-4-storage.md) and [independent review](evidence/task-4-storage-review.md) preserve this distinction.

The unified store retains local legacy representation and adds scoped external rows with same-organization/composite endpoint ownership, restrictive deletion, coherent incident/owned reads, cross-table identity/key checks, atomic representation moves and old/new revision unions. Historical local capture remains explicit and refuses external incident facts rather than silently omitting them. Complete legacy journal values normalize to scoped endpoints; malformed mixed scope refuses. The additive migration has a paired down migration which refuses retained external relationships. This storage layer does not activate external authoring.

Original final focused tests: 160 passed, 626 assertions. Mounted/core regressions: 212 passed, 716 assertions. Complete memory and SQLite conformance: 150 passed, 12,318 assertions. Migration/rollback ledger suites: 91 passed, 440 assertions. Review-fix focused tests: 47 passed, 209 assertions; the specific SQLite terminal certification passed 1,969 assertions while 74 other scenarios were explicitly filtered. Changed lint/format, migration lint and normal hooks passed; Tool Wiki remained inactive/uncertified.

Fresh combined API/storage command at `a7688e9f0`:

```sh
bun test libs/wbs/adapters/store-sqlite/src/audit.test.ts libs/wbs/adapters/store-sqlite/src/import.service.db.test.ts libs/wbs/adapters/store-sqlite/src/typed-dependency.db.test.ts libs/wbs/adapters/store-sqlite/src/external-dependency-migration.db.test.ts libs/wbs/adapters/store-sqlite/src/typed-dependency-rollback.db.test.ts libs/wbs/application/core/src/service/compensating.test.ts libs/wbs/application/core/src/module/plan-import/module.test.ts apps/wbs/be-01/src/controller/project-address.controller.db.test.ts apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-graph.controller.db.test.ts --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-store-memory,wbs-store-sqlite,wbs-be-01 --skipNxCache --parallel=1
```

Behavior: 215 passed, 990 assertions. Fresh memory/SQLite/backend and core/backend module types passed; core failed two new history-test fixture inference errors. The final correction retains literal discriminants and constructs the exact nested expected dependency independently; 38 history tests passed, 127 assertions. At integrated `7e1b083d5`, `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck --skipNxCache --outputStyle=static` passed core plus its module dependency uncached. No diagnostics were suppressed; API integration resolved the previously reported import scope and abbreviation audit-policy issues.

Durable [fault artifacts](evidence/task-4-storage-proofs/) retain actual outputs and exact mutation scripts as text. Corrected SQL removals use valid SELECT statements instead of invalid empty migration statements. The review fixes prove differently owned filtered identity corruption and a coherent alternate-owner update are actually admitted if their respective checks are removed. The original owner-message proof is superseded; missing-local-table rollback remains diagnostic-only, while retained-external rollback independently proves destructive loss without its guard. Counts describe watched faults, not independently proved invariants. All production mutations were restored.

Remaining graph/admission/lifecycle, complete capture/scheduling/history/UI, activation and release checks stay open. No full host gate, CI, build, deployment or completed external-dependency feature is claimed.
