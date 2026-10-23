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

| Capability                 | Status                                  | Note                                        |
| -------------------------- | --------------------------------------- | ------------------------------------------- |
| project-addresses          | Partial: 1.1, 2.1, 2.2, 3.1             | Delta retained; no main-spec sync performed |
| cross-project-dependencies | Partial: storage and capture foundation | Delta retained; no main-spec sync performed |
| wbs-domain                 | Partial: graph and resolved engine      | Delta retained; no main-spec sync performed |
| plan-import                | N/A: unimplemented                      | Delta retained; no main-spec sync performed |
| saved-plans                | N/A: unimplemented                      | Delta retained; no main-spec sync performed |
| live-plan-snapshot         | N/A: unimplemented                      | Delta retained; no main-spec sync performed |
| scheduler-optimization     | N/A: unimplemented                      | Delta retained; no main-spec sync performed |
| plan-command-registry      | N/A: unimplemented                      | Delta retained; no main-spec sync performed |

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
| Organization and bounded lookup 3.1             | Remove project/organization predicate or response bound                                                                      | `project-address-search.controller.db.test.ts` scoped/bounded/foreign cases                                                               | Observed selected lookup faults; [search evidence](evidence/task-3-search.md)                       |
| HTTP/MCP boundary 3.2                           | Remove shared endpoint/version shape validation                                                                              | Mounted HTTP/MCP malformed scope/type/ID cases                                                                                            | NOT RUN                                                                                             |
| Relationship integrity 4.1                      | Remove each endpoint/project/step/organization/duplicate check                                                               | Unified repository and migration DB cases                                                                                                 | Observed/restored migration, store and review faults; [evidence](evidence/task-4-storage.md)        |
| Current write authority 4.2                     | Bypass current access, successor owner or remote endpoint shape                                                              | `cross-project-dependency-commands.controller.db.test.ts` revoked/foreign/second-owner cases; assert no partial state                     | NOT RUN                                                                                             |
| Actual graph 4.3                                | Omit expanded pair; use project DAG; use target reach globally; skip each structural admission site                          | `connected-step-node.test.ts` and mounted cycle/structural cases, retaining valid interleaving positive                                   | Closed; see Task 4.3 reconciliation below                                                           |
| Lifecycle/history 4.4                           | Remove deletion refusal, incident map, touched-ID/replay graph/current-access check separately                               | External deletion/hand-down/concurrent undo/redo controller cases                                                                         | NOT RUN                                                                                             |
| Coherent capture 5.1                            | Remove transaction; read cache/derive after closure; replace borrowed DB; omit close                                         | `connected-plan-capture.db.test.ts` concurrent endpoint and cache publication, borrowed and lifecycle cases                               | Closed; retained capture proofs and post-close packet below                                         |
| Capture authority/completeness 5.1              | Omit closure or authorization; delete/corrupt/unreadably supply required evidence                                            | Production factory capture cases; distinguish absence/unreadability where contract does                                                   | Closed; retained capture proofs and independent audit below                                         |
| Post-commit scoped fanout 5.2                   | Drop dependency traversal, emit before commit, bypass organization filter                                                    | `cross-project-events.controller.db.test.ts` no-shared-person, rollback and label privacy cases                                           | All named faults observed; delivery remains open                                                    |
| Placement constraints 6.1                       | Remove each eligibility/type inequality, capacity namespace or held reduction                                                | `schedule-connected.test.ts` and existing priority/resource/hold regressions                                                              | Closed; audit and fault receipts below                                                              |
| Calendars 6.2                                   | Substitute target anchor, round fractional bounds, omit floor, use day zero for missing date                                 | `schedule-connected-calendar.test.ts` and mounted missing-calendar projection                                                             | Closed; audit and six mounted faults below                                                          |
| Readiness 6.3                                   | Replace remote progress with empty/local progress or skip required evidence                                                  | `cross-project-startable.controller.db.test.ts` actual tree/startable cases                                                               | NOT RUN                                                                                             |
| Wire/model 7.1–7.2                              | Omit each bound/version/model inequality or Python schema member                                                             | Production request fixtures, actual solver/validate tests, omitted-expanded-pair case                                                     | NOT RUN                                                                                             |
| Boundary-infeasible preparation/outcome 7.2–7.3 | Require fake quantized feasible baseline; reject empty integer window; map stage outcome to malformed/global infeasible      | Real 0.2→one-day→1.2 quantum48 preparation/solve/exit/read cases, with and without local deadlines                                        | NOT RUN                                                                                             |
| Composite and proof scope 7.3                   | Bypass stage bound, foreign pinning, full-component validation or certificate scope                                          | `connected-optimization.test.ts` mixed/interleaved stages and proof/comparison cases                                                      | NOT RUN                                                                                             |
| Question identity 7.4                           | Remove every new hash member one at a time                                                                                   | Hash/cache tests for stable endpoints, type, anchors, capacity/mode, rank, boundaries, versions; report each separately                   | NOT RUN                                                                                             |
| Publication 7.4                                 | Bypass exact identity/generation/foreign-start/materialized FS SS FF check separately                                        | `connected-publication.test.ts` stale and forged solver responses                                                                         | NOT RUN                                                                                             |
| Terminal cache/restart/Retry 7.4                | Reuse failure/global-infeasible persistence; retain slot; bypass same-question retry suppression                             | DB/read/restart/manual Retry cases assert boundary-infeasible retained, slot released, no attempt; changed identity admits fresh question | NOT RUN                                                                                             |
| Capture non-admission 5.1 / 7.4 / 8.4           | Substitute admitting optimizer reader                                                                                        | Mounted captured/live reads assert no generation, queue entry, slot or event                                                              | 5.1 closed; 7.4/8.4 remain open                                                                     |
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

Astra High approved original `14b43aab4` after two P2 corrections in `da756535c`; integrated as `772fe335e` and `a7688e9f0`. Final test-only fixture typing correction `8d6083056` integrated as `7e1b083d5`. Independent Astra High [mechanical followup review](evidence/task-4-storage-fixture-review.md) also approved that final test-only correction, confirming its exact expectations are not weakened. [Implementation evidence](evidence/task-4-storage.md) and [independent review](evidence/task-4-storage-review.md) preserve this distinction.

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

## Task 3.1 — authorized address lookup completed 2026-10-22

Astra approved the implementation and three review fixes at `1b89328d5`;
see [implementation](evidence/task-3-search.md), [review](evidence/task-3-search-review.md),
and [integration test type correction](evidence/task-3-search-types-fix.md).
Integration commits are `63287849f`, `731b68a92` and test-only `3451ca740`.
The combined eight-file run passed 148 tests / 724 assertions; core/backend
Nx typechecks passed. The dedicated SQLite target initially failed on test
callback narrowing; after the stable alias correction, that actual target
passed with cache skipped and five adapter tests passed. Earlier root checks
passed 67 frontend tests and one socket test; unchanged frontend/socket paths
were not rerun for the test-only fix.

[Output and fault artifacts](evidence/task-3-search-proofs/) retain initial
failures and corrected proofs. Nineteen original fault runs and three new
runs show actual selected failures; the old zero-test placement run is
explicitly invalid. This closes lookup only, not endpoint writes, picker UI,
full contracts, host gate, CI or deployment.

## Task 4.3 — reviewed graph foundation, integration still open

Astra approved `cb6f4c45a`, integrated as `ec69ee0e4` and `3980e0bb5`.
[Implementation](evidence/task-4-graph.md), [review](evidence/task-4-graph-review.md)
and [proof output](evidence/task-4-graph-proofs/) cover own-project expanded
nodes, actual cycle resolution, both incident directions, overlays and required
authority/lifetime interfaces. There are 146 passing foundation tests plus a
14-test follow-up; the lookup integration adds the combined 148-test run.
Forty watched fault runs are audited with diagnostic-only and superseded
attempts explicitly distinguished. Concrete admitted SQLite authority,
existing guard facade and structural transaction callers remain unimplemented;
4.3 stays unchecked. WBS foundation leaf 010.05.2.1 alone is done.

## Integration checkpoint

Fresh `origin/main` at `e6e4e296f` was merged as `9182ddc92` before these
foundations. Draft [PR #630](https://github.com/Prosperous-Unification/puni-00/pull/630)
contains the developing change. CI on that earlier checkpoint is running;
no current candidate green gate or deployment is claimed. Tool Wiki normal
hooks still report inactive/uncertified. Full exact-SHA host gate, final CI,
remaining implementation and deployment evidence are required.

## Task 6.1 — reviewed resolved engine, connected integration still open

Astra approved original `2f70f34f5` and the test-only follow-up `a905e98d8`,
integrated as `0bad5ba8b` and `9f4c96881`. The domain tree matches the reviewed
branch exactly. See [implementation](evidence/task-6-resolved-schedule.md),
[review](evidence/task-6-resolved-schedule-review.md) and
[proof output](evidence/task-6-resolved-proofs/).
The existing leveller now accepts resolved graphs, preserving local/pinned
behavior and putting project rank only inside eligible-work ordering.
The observed regression count is 285 tests / 52,082 assertions / 18 files;
52,088 in the first handoff was incorrect. The added empty-component test has
24 connected tests / 30 assertions; Astra's targeted probes passed 15 tests /
39 assertions. Named Nx lint/types, dedicated library/spec types and formatting
passed. Thirteen fault runs had actual selected failures; diagnostic/redundant
check limits remain explicit. Both P3 review notes are resolved.

Only the domain foundation WBS leaf is done (currently 010.06.2, stable ID
`02ce784a-cdad-4cf1-ba20-a81b206c1938`). The complete 6.1 checkbox stays open:
core preparation, calendars, runtime callback/lifetime and connected live
projection are separate work. Pure core placement now has an independent lane
under the accepted capture value. The capture continuation finding was subsequently
fixed and independently approved as recorded below.

## Task 5.1 — reviewed connected capture foundation, live integration open

Astra approved original `467ad3f12` plus lifetime correction `ed5b19b6f`,
integrated as `627e648a3` and `dd7456145`. See [implementation](evidence/task-5-capture.md),
[independent review and re-review](evidence/task-5-capture-review.md), and
[retained outputs/probes](evidence/task-5-capture-proofs/).
The complete connected capture follows both relationship directions and shared-person
adjacency, preserves each project's facts, and uses one owned observation or the
admitted writer. Required fresh UoW lifetimes expire irreversibly before settlement;
post-await SQL and cached derivation accesses recheck the same lifetime.

The independent initial probe exposed 5/1/1 SQL reads after expiry in a subsequent
transaction. After the fix, the unchanged reviewer probe passed 3 tests / 6 assertions
with all three SQL lists exactly empty. The new 85-case continuation matrix covers
success, refusal and throw. Thirteen separately removed guards produced actual
selected failures: eleven demonstrate post-expiry SQL, one demonstrates cached
value reuse despite eventual outward refusal, and one establishes error precedence
without claiming further SQL. Earlier aggregate-cache, import-filter and diagnostic
only attempts are explicitly distinguished in the report. All production mutations
were restored.

Root's fresh combined integration at `dd7456145` passed **398 tests / 1,774 assertions /
22 files** (`puni-capture-integrated-tests.log`), combining the implementation report's
19-file command with read-continuation and both address-lookup adapter/controller
suites. Actual uncached Nx core/module, SQLite and backend/module typechecks passed
(`puni-capture-integrated-types.log`):

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-store-sqlite,wbs-be-01 --skipNxCache --parallel=1 --outputStyle=static
```

The integrated adapter files match the reviewed branch exactly. The only integration
conflict retained both the graph and capture type exports. Normal hooks passed and
reported Tool Wiki inactive/uncertified. Capture foundation WBS stable ID
`dead9960-3be7-4f8a-aee6-93bb9c315459` is done; full task 5.1 remains unchecked for
real connected derivation and live projection. No completed feature, host gate,
current green CI, build or deployment is claimed. Earlier pushed checkpoint
`b3f318912` CI run `39693163327` has a failed browser shard and ongoing workspace/
Twilight jobs; the failure is being investigated, not treated as a passing gate.

## Task 7 — reviewed exact stage identity foundation, optimization runtime open

Independent Astra review approved `94baeab1e` for canonical identity over authoritative
typed captures; nonbehavioral JSDoc/Proof/test-name corrections are `4332ca115`.
Integrated as `2ad64e22d` and `a79e8eabd`; all three domain files match that reviewed
branch plus its exact requested wording corrections. See [implementation](evidence/task-7-stage-identity.md),
[review](evidence/task-7-stage-identity-review.md), [wording correction](evidence/task-7-stage-identity-wording.md)
and [proof artifacts](evidence/task-7-stage-proofs/).

The pure domain serializer preserves exact real placement coordinates, original scoped
selectors, reduced graph/order/ownership, complete project ranks/anchors and scheduling
constraints. It excludes display labels and does not schedule, compute SHA, prove authored
capture completeness or validate baseline feasibility. Its input is an authoritative typed
capture, not an untrusted request parser. Runtime stage construction must establish those
upstream facts before using these bytes in the complete question key.

Root's fresh integration command from the domain project directory:

```sh
bun test ./src/canonical-connected-stage-input.test.ts ./src/canonical-schedule-input.test.ts ./src/connected-step-node.test.ts ./src/schedule-connected.test.ts
```

Passed **175 tests / 258 assertions / four files**. Independent Astra ran the same focused
set successfully. The author's named domain suite passed 1,331 tests, with one existing
optional performance skip; the invalid root-cwd emitted-test discovery run is retained
and explicitly not counted as a source-domain pass. Author named lint/typecheck, explicit
spec types and format passed. Root's actual uncached `wbs-domain:typecheck` passed on
`a79e8eabd`; normal original/follow-up commit hooks passed (Tool Wiki inactive/uncertified).

The 125 production fault probes contain 108 assertion-failing runs and 17 explicit
redundant/constant survivors. These are not 108 independent unsafe-acceptance proofs:
some distinguish diagnostics, some overlap, and combined removals expose redundant
checks. The matrix and reports preserve those limits. The 60 serialization-property
omissions include redundant fields; no missing independent valid-typed identity dimension
was found by review. Malformed values outside declared types are an upstream boundary
obligation and are not claimed to be exhaustively refused here.

Only stage-identity WBS leaf `b52f23c6-c7b8-4aec-ad80-83c8a0c3c279` is complete. All
full 7.1–7.4 checkboxes remain open: wire/Python, stage selection, complete hash tuple,
publication, terminal certificates, Retry/restart and persistence are not delivered by
these domain files. Full host gate, final CI/build/deployment remain pending.

## Task 6.1–6.2 — reviewed core Fast/calendar foundation, runtime still open

Original `d9deee3e0` and correction `802c37658` integrated together as
`3a58f3d73` and `734d5191d`. The ten manifest files match the reviewed worker tree.
[Implementation](evidence/task-6-fast.md), [initial review](evidence/task-6-fast-review.md),
[correction](evidence/task-6-fast-round1.md), [approval](evidence/task-6-fast-round1-review.md)
and [proof artifacts](evidence/task-6-fast-proofs/) retain the complete record.

One real resolved Fast pass now derives the connected projection with each project's
settings, reach, capacity namespace, anchor and fractional workday constraints. Shared
and isolated person modes remain distinct; authored held identities stay inspectable.
Required connected optimization is explicitly unavailable until implemented. Live and
saved local preparation both delegate to the same helper. A shared leaf owns unchanged
slice construction, eliminating the new resource/helper cycle while preserving exports.

The initial live patch exposed a Project/CapturedProject type mismatch and lint failures.
A five-setting structural parameter and import cleanup fixed them without fabricated
fields or casts. The review independently reproduced all 21 claimed mutations; two
remain diagnostic-only. The correction changes no guarded scheduling arithmetic, so
those unchanged mutations were not repeated; function syntax equality and fresh
before/after characterization cover the extraction. Thirty-two permanent real live/saved
cases and the independent 192-comparison probe preserve canonical bytes/display facts.

Author original full core suite: 1,195 tests passed. Correction focused suite: 220 tests /
1,093 assertions. Astra re-review: 77 tests / 694 assertions, actual noEmit types and named
lint passed. Root's fresh combined integration at `734d5191d` passed **270 tests /
1,246 assertions / eight files**, using the correction's exact six-file command plus
`connected-plan-capture.db.test.ts` and `saved-plan-capture.db.test.ts`. Actual uncached
Nx core/module, SQLite and backend/module types passed:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-store-sqlite,wbs-be-01 --skipNxCache --parallel=1 --outputStyle=static
```

Only pure core foundation leaf `a72b08c9-6bed-4fa1-aba8-13999591049c` is complete.
Full 6.1/6.2 remain unchecked for required runtime port, snapshot/live projection and
consumer wiring. The staged real synchronous callback is not installed connected
runtime capability. Readiness, optimization, history, activation and final release
verification remain open; no complete feature or deployment is claimed.

## Task 2.2 — spaces browser fixture follow-up

CI run `39693163327` at earlier `b3f318912` failed five spaces cases because mocked
project replies lacked the now-required abbreviation. Original schema probes refused
only those missing fields. Exactly two fixture fields were added in `16a3238d5`,
Astra approved, and root integrated `aa46186e2`; assertions and production validation
are unchanged. See [repair](evidence/task-2-browser.md), [review](evidence/task-2-browser-review.md)
and [logs/probes](evidence/task-2-browser-proofs/).

Actual Playwright config on isolated ports, fresh worktree database and `CI=1` to refuse
server reuse passed all **nine** spaces/timeline tests. The initial sandbox listen refusal
occurred before tests; the approved identical command with local-server permission
produced the counted pass. Actual frontend module/types, lint and formatting passed.
Astra independently removed only the new fields and observed exactly 4/2/6 abbreviation
errors for shared-space/timeline/project-list responses; restored bodies passed.

This closes browser fixture follow-up `6d57e884-c640-42d5-a32b-2c7d237f6855`, not the
full browser shard or final CI. Old failed checkpoint evidence remains a failure;
current candidate full CI, exact-SHA host gate and deployment are still required.

## Task 3.1 — lookup refusal declaration follow-up

Commit `205df84a4` corrects the shared lookup 400 enum. The existing global GET
shape invariant failed on the unmodified integrated source (2 pass / 1 fail);
the correction declares `invalid_query`, `invalid_params` and `invalid_body`.
Current mounted lookup bindings still normalize failures to `invalid_query`.
This aligns the generic adapter vocabulary and declaration invariant; it does
not claim that mounted lookup now emits additional codes or accepts more input.

[Report](evidence/task-3-lookup-refusal.md), [Astra approval](evidence/task-3-lookup-refusal-review.md)
and [logs](evidence/task-3-lookup-refusal-proofs/) record root's 23 focused tests /
175 assertions, actual uncached contracts test/lint/typecheck (495 tests /
1,541 assertions), and the reviewer's independent 62-test and 23-test runs.
Only follow-up leaf `2684d59b-fd17-4b17-aa8d-eab46349cea8` is complete.

## Task 4.2 — current command authority foundation

Original `eb3d6c2a7` and correction `26c836326` integrated as `d1d258552`
and `3363bac03`. [Implementation](evidence/task-4-authority.md),
[initial review](evidence/task-4-authority-review.md), [correction](evidence/task-4-authority-round1.md),
[Astra re-review](evidence/task-4-authority-round1-review.md) and
[proofs](evidence/task-4-authority-proofs/) preserve attribution and limits.

Authenticated runner and direct writes now carry the actual principal and
revalidate current organization authority inside the same writer transaction,
before audit, endpoint reads, capture or writes. Both mounted and composed
runners receive the real resolver; boot shares the verifier, connection and
clock. Explicit legacy wrappers refuse after activation. Repair discards only
through a fresh journal scope.

Astra found a P2 in direct project/step and recovery writes: their scope check
was missing even though the runner refused read-only credentials. Both guards
now precede UoW admission. Three real SQLite negatives watched successful writes
before the fix, and each guard bypass independently failed the selected refusal
assertion after the fix. They verify unchanged UoW/capture/push counters and
full tables, including audit/history/events. The unchanged vulnerability probe
now fails its old expectation; only the separate corrected expectation passes.
Its Bun tsconfig-override diagnostic is retained, not disguised as a clean run.

Original author and review checks are in the reports. Root's combined real
integration passed **154 tests / 747 assertions / eight files**: the correction's
six-file suite plus connected and saved capture. Actual uncached Nx core/module,
SQLite and backend/module typechecks passed (five tasks). Normal original/fix
commit hooks passed; Tool Wiki remained inactive/uncertified.

Only authority leaf `8b8d1ddc-4284-4b23-a3fa-b127015c0dec` is complete. Full 4.2
remains open. Endpoint evidence, graph/structural admission, remote typed-link
history and mounted negatives continue under leaf
`6088cd5b-50d3-472a-b302-cd14a44546cc` in a new isolated worktree based on
`3363bac03`. External production authoring remains dormant until real connected
readers/fanout and activation are implemented.

## Task 7.3 — domain publication replay foundation

Commit `05f696369` integrates two exact reviewed files and four named public
exports. [Implementation](evidence/task-7-publication.md),
[Astra approval](evidence/task-7-publication-review.md) and
[proofs](evidence/task-7-publication-proofs/) record the real replay boundary.
The captured baseline is validated exactly through the authoritative engine;
local candidate pins replay the complete component, preserving exact foreign
starts and finishes. Candidate deadlines and dense priority scores are local;
ties select optimized. Baseline lateness and infeasible movement origins retain
their explicitly permitted semantics.

Author full domain: 1,374 pass, one existing performance skip. Astra independently
passed 200 relevant tests plus three additional probes. Its 16 mutations produced
14 semantic failures, one diagnostic failure and one redundant survivor. Foreign
finish equality is retained but is not claimed independently mutation-killable
under deterministic replay and exact foreign starts. The combined removal allows
drift. No fake scheduling callback establishes these proofs.

Root combined publication, canonical stage, resolved scheduler and guard run:
**172 tests / 284 assertions / four files**, actual uncached domain lint/types
passed. The first integration command named a nonexistent stage test and collected
only three files (76 passes); the corrected four-file command is the counted
combined result. The initial barrel export ordering lint failure was corrected
mechanically, then both targets passed. These failed/incomplete checks remain in
the evidence rather than being counted as complete verification.

Only domain leaf `b6e1ccd6-8579-48fe-ab68-fa8893b4e31b` is complete. All full
7.1–7.4 checkboxes remain open for wire/Python, runtime stages, certificates,
persistence, retry and publication consumers. Fresh main `d504c9eae` (MCP client
persistence PR #622) merged cleanly as `3a9c23030`; this is not final gate evidence.
Full CI, exact-SHA host gate, browser feature coverage and delivery remain open.

## Repository OpenSpec checkpoint at 706e033e0

`./node_modules/.bin/openspec validate --all --json` exited 0 on the integrated
feature packet: **267 passed / zero failed** (249 changes and 18 specs), with
no invalid entries. [Exact output](evidence/openspec-all-706e033e0.json.txt).
This is repository schema validation at that checkpoint, not implementation,
behavioral gate, final-candidate CI or delivery evidence. Solver source remains
unintegrated pending independent review and backend compatibility corrections.

## Tasks 7.1–7.2 — solver checkpoint review requires corrections

Owned wire/Python/script checkpoint `05a5b85d5` is committed only in its isolated
worktree and is **not integrated or approved**. [Author report](evidence/task-7-wire.md),
[independent review](evidence/task-7-wire-review.md) and [review evidence](evidence/task-7-wire-review-proofs/)
record the exact 74-file byte set and findings. Original Sol is correcting all
six findings before re-review.

Astra freshly reproduced the baseline green suites (contracts 512, Python 273,
protocol 12, domain 1,331 with one existing skip, backend scripts 12), then found
seven actual assertion failures across eight adversarial cases. PRI and Time
shared a full question identity; malformed requests could produce prepared
terminals; Python admitted nonfinite foreign evidence; invalid declared witness
escaped the modeled CLI exit; finite range overflow bypassed typed preflight.
The sixth finding is a proof gap: removing Python's foreign-owner predicate left
all 273 tests passing, while the new real CLI probe detected unsafe acceptance.
Its initial sandbox setup error is explicitly not counted as a mutation proof.

These findings are independent of the already-known active backend wire-4 fixture
follow-up and deferred runtime/certificate/publication integration. No full 7.x
checkbox or WBS solver leaf is complete. The installed runtime smoke establishes
its observed wire/version behavior only, not the correctness contradicted by the
adversarial probes. Historical wire files and domain corpus cases were unchanged.

## Tasks 7.1–7.2 — correction checkpoint awaiting re-review

Isolated solver correction `388fb5410` follows the rejected `05a5b85d5`; neither
is integrated. [Checkpoint and raw evidence](evidence/task-7-wire-round1.md)
retain the nine-file source manifest, author-reported restored checks
(Python276, contracts516, installedCLI3/36), and actual failing fault-test output.
A giant finite JSON integer initially escaped as `OverflowError`; the amended
source and rebuilt installed runtime now refuse it as exit64 in those checks.

Independent Astra re-review has already reproduced a new packaging defect:
the new validator reads a schema relative to a bundled module, but the required
asset is not shipped. Root reproduced the bundled local import's ENOENT/exit1.
Final review remains pending, and this record does not approve the checkpoint
or complete any full7.x task, backend compatibility gate, rollout or deployment.

## Tasks 7.1–7.2 — independent correction review still requires changes

[Completed Astra round1 review](evidence/task-7-wire-round1-review.md) confirms
the six original repro cases pass, with fresh contracts516/Python276 and
adapted-installed11 checks. TwoP1 findings remain: built artifact schema loading
and long foreign-only occupancy acceptance parity. Exact failed assertions,
retained request and installedCLI outcome are preserved with SHA256 manifests.
The independently repeated owner mutation fails correctly; semantic-block
mutation is not claimed as a separate proof of each predicate.

Original Sol is correcting both findings in the same isolated source checkout.
`05a5b85d5` and `388fb5410` remain unintegrated; full7.1–7.4 and backend/runtime,
activation and delivery gates remain incomplete.

## Tasks 7.1–7.2 — approved wire integrated, compatibility still open

[Round 2 evidence](evidence/task-7-wire-round2.md) records independent approval,
exact source integration through `bb8bd4922`, contracts518/Python276/probes15,
actual built local and connected calls, and the bounded P3 raw-union follow-up.
Root ran all six contracts/domain test/typecheck/lint targets uncached on the
integrated source; all passed. Active backend fixtures and runtime remain open.

## Task 9.1 — first frontend review rejected

[Independent frontend review](evidence/task-9-autocomplete-review.md) records
six findings and fresh View335/1, Node26, six failed behavioral probes and one
passing real HTTP probe. Author336green is superseded. Original Sol is fixing
all six; source remains unintegrated and no full UI checkbox is closed.

## Pushed checkpoint e41 — CI failed, corrections assigned

[Terminal CI findings](evidence/checkpoint-e41-ci.md) record green browser shards
and failed workspace/Twilight test targets. Root preserved two binary evidence
logs as readable escapes plus byte-identical Base64 originals. Fixture and
classification corrections are assigned to the active Sol lanes. No final
CI, host gate, image smoke or deployment success is claimed.

## Tasks 3.2 / 4.2–4.4 — command checkpoint frozen for review

[Command checkpoint evidence](evidence/task-4-command-checkpoint.md) preserves
113 source hashes at isolated `db2d38ec9`, author checks, 51 fault observations
and two replay graph-close red/green checks. Root verified unchanged hashes and
clean status after normal-hook commit. Fresh Astra review is active; source is
unintegrated and the dormant production barrier remains closed. The full MCP,
incident lifecycle and live/runtime/activation requirements are still open.

## Tasks 3.2 / 4.2–4.4 — independent command review requires corrections

[Final command review](evidence/task-4-command-review.md) records two reproduced
redo defects: local create-and-update aliases and local-create/external-link
batches. Fresh focused suites and six actual type programs pass, but the
independent corrected probes fail replay assertions. The 51-fault audit records
what each failure proves without claiming every one admits an unsafe write.
Original Sol is correcting ordered owner-local restoration for typed add/update;
remote authority and metadata remain strict. Source is still unintegrated.

## Tasks 3.2 / 4.2–4.4 — approved command packet integrated, remaining work explicit

[Correction and independent review](evidence/task-4-command-round1.md) preserve the
original two redo regressions, a four-path correction, independent combined
external-UPDATE/revision probes and nine watched fault logs with separate
acceptance/diagnostic classifications. Astra approved the bounded dormant command
packet. Root cherry-picked original `db2d38ec9` and correction `02c8fdc65`
as `835e4e35b` and `2f7b7b4b7`; all 113 reviewed source hashes matched the
integration, and uncached integrated `wbs-core:typecheck` plus its module
program passed. Full task 3.2 MCP equivalence, task 4.4 incident lifecycle,
connected runtime and activation remain open. An exact task 4.2/4.3 closure
audit is pending; no checkbox is marked on this approval alone.

## Tasks 4.2–4.3 — exact closure audit

[Independent task audit](evidence/task-4-command-closure-audit.md) leaves whole
4.2 and 4.3 unchecked under their existing wording. The admitted transaction
and graph source are approved; mounted external success, specific owner/shape
predicate fault observations, actual remote structural-cycle command scenarios
and a graph-invalid later command after an earlier external batch write still
need named proofs. This does not revoke the approved dormant command checkpoint
or claim a defect in its exercised paths. Full 4.4 incident hand-down and 3.2
MCP equivalence are separate open work.

## Tasks 7.1–7.2 — backend compatibility and Python source slice

[Backend compatibility review and raw output](evidence/task-7-backend-compat.md)
record the approved 45-file fixture packet, full SQLite 1,953 pass/one skip,
independent changed-backend 346 pass, exact historical version and rollback
checks, and combined-feature uncached core/backend typechecks. The four-file
combined backend focus passed 127 tests/1,259 assertions, including all three
old-base command failures. The first full backend run before the command packet
and final scope fixture had four failures and is not relabeled green.

Astra supports task 7.2's bounded Python/source obligations as complete, and
its checkbox is checked. The review's valid six-assertion FS probe is preserved.
The subsequent proof closure below completes 7.1. Tasks 7.3/7.4
runtime/persistence, the final combined backend/host gate, activation and deploy
remain open.

## Task 7.1 — wire closure independently approved

[Wire proof closure](evidence/task-7-wire-closure.md) records the permanent
second-step external FS case, 52 independent request-member omissions, seven
response-member omissions and an independent 46-entry schema mutation sweep.
The reviewer observed 20 malformed-fixture admissions, 15 later semantic
refusals and 11 TypeErrors when the schema rule was removed, and approved the
bounded 7.1 obligation. Frozen test-only commit `38ca5cc37e83` integrated
as `30fed3310`; reviewer contracts 520 pass/1,697 assertions, focused three
pass/70 assertions, uncached typecheck/lint and changed-file format passed.
The raw artifacts and SHA-256 manifest are adjacent to that report. Task 7.1
is checked; connected runtime/persistence tasks 7.3/7.4 remain open.

After the fresh main merge, root ran uncached `wbs-mcp-01:test` on the
combined feature and credential-epoch source: 479 pass, 0 fail, 2,122
assertions in 20 files. Uncached MCP typecheck also passed. Mounted 3.2
transport equivalence and the full combined CI/host gate remain open.

## Task 9.1 — scoped frontend selection independently approved

[Round-two review and raw proofs](evidence/task-9-autocomplete-round2.md)
supersede the first frontend rejection. Original plus two corrections integrated
as `67a803993`, `0031c3418`, `766325bc7`; three provisional shared contracts
were excluded and match the separately reviewed integrated source. The Astra
reviewer reran 401 View, 26 Node, 11 original probes, two actual HTTP field
probes, four typechecks, lint and format, all green. Six independent round-two
fault injections failed at the selected UI assertions and restored tests passed.
Task 9.1 is checked for new selection; persisted remote relationship and
settings/outcome UI under 9.2, activation and browser delivery remain open.

## Task 4.3 — real graph scenario gap closed, lifecycle open

[Graph scenario review and raw proofs](evidence/task-4-graph-closure.md) cover
nine actual SQLite scenarios, including all four remote expanded pairs and an
external batch write followed by a later cyclic command and full-table rollback.
The reviewer repeated ten separate faults: seven invalid writes became
accepted, two legal interleavings became refused, and forced COMMIT retained
the earlier link and revisions. Fresh focus passed 133 tests/1,418 assertions;
types, effective Nx-boundary lint and format passed. Source `0f2111268`
integrated as `dbc57b2d5`, SHA-256 retained. Whole 4.3 stays unchecked until
the hand-down incident mapping under 4.4 exists. Mounted 4.2 external success
and post-commit fanout are not inferred from admitted transaction proofs.

## Task 9.1 — browser overflow regression after integration

CI run `39744552119` at `81316a58b` failed browser shard 3 on the existing
`plan-table-review.spec.ts` dependency-list title assertion: the new shared
`DependencyOptions` option had no `title` (162 other shard checks passed).
The missing attribute is the observed negative for the adjacent production
`Proof:` comment. Root restored the full option label as its hover title.
The exact failed case then passed through `CI=1 E2E_PORT_SHIFT=3400 NX_DAEMON=false
bunx nx run wbs-fe-01:e2e -- e2e/plan-table-review.spec.ts -g 'keeps the
dependency list inside the window'` on isolated local ports: one pass, exit 0.
Changed-file ESLint, Prettier and `git diff --check` passed. The fresh full
CI, host gate and deployment remain pending.

## Task 9.2 — project abbreviation settings slice

The [frozen 26-file manifest](evidence/task-9-settings-sha256.tsv)
and [settings packet report](evidence/task-9-settings-report.md) record
the General settings field, project-catalog refresh and typed PATCH response.
Its mounted modal/page/toolbar suites passed 185/185; four independent
production-path faults were observed failing their intended tests. Integration
used a three-way patch; 25 reviewed file hashes and the new component match the
packet, while `wbs-api.test.ts` also retains root's separate `addStep` fixture
correction. On the combined tree, four mounted settings/API View files passed
256/256 and frontend app/spec TypeScript programs passed. This closes only the
abbreviation clause of 9.2; remote relationship, navigation and optimization
outcomes remain open.

CI run `39744552119` also exposed two phone Depends-sheet regressions: both
existing browser cases could not find the named `Rows 020 could wait for` list
after the shared picker assigned it listbox semantics. Restoring the phone
list role, while keeping desktop listbox semantics, made those exact two cases
pass through the Nx browser target on isolated local ports (2/2, exit 0).
The original CI failures are the adjacent production `Proof:` negative.

## Task 9.1 — combined editor recovery correction

[Correction report](evidence/task-9-combined-frontend-report.md) and
[three-file hashes](evidence/task-9-combined-frontend-sha256.tsv) preserve the
numeric-list recovery and scoped active-option assertion. Astra independently
approved both this packet and the settings slice after configured affected
View suites passed 237/237 and three production-path mutations failed their
selected assertions, including the valid 20-character abbreviation boundary.
The integrated three source hashes match the frozen correction packet. Local
and remote submission lifetimes remain separate; the full frontend suite and
final PR CI are pending.

## Tasks 5.1 / 6.3 / 8.4 — connected producer slice, corrected

The [first independent review](evidence/task-5-live-readiness-initial-review.md)
rejected shared-person bridge routing, required test typechecks and a local-link
dependent ordinary-read cost. The [correction packet](evidence/task-5-live-readiness-correction-packet.md)
and [Astra re-review](evidence/task-5-live-readiness-correction-review.md)
record the fix, exact [eight-file hashes](evidence/task-5-live-readiness-correction-sha256.txt),
276 passing selected tests, actual configured core/store/backend typechecks and
lint, and three independently observed production-path faults. Ordinary isolated
reads measured nine statements with zero or 19 local links. The approved
producer remains bounded: claim/start admission, tree/HTTP/frontend delivery,
optimizer and export consumers are still open; external authoring remains dormant.
After applying the reviewed 22-file source commit and eight-file correction,
all eight hashes matched the frozen packet. Integrated selected suites passed
170/170 (529 assertions), and uncached configured core/store/backend Nx
typechecks plus both module-check dependencies ran and passed. The final
CI/host gate remains pending.

## Task 4.4 — incident deletion/history bounded slice, corrected

The [first review](evidence/task-4-incident-initial-review.md) rejected a
production TypeScript narrowing error. The [corrected packet](evidence/task-4-incident-v2-packet.md),
[Astra re-review](evidence/task-4-incident-v2-review.md) and
[ten-file manifest](evidence/task-4-incident-v2-sha256.txt) cover modeled
predecessor 409 with sorted link IDs, successor-owned link deletion and exact
undo/redo identities. The reviewer ran 1,589 source tests, configured
core/contracts/backend typechecks and four-package lint; all passed after the
correction. On integration, nine packet files match their frozen hashes and
`work-item.resource.ts` additionally retains four explicit connected-consumer
refusals from the independently reviewed live packet. The bounded slice does
not complete 4.4: first-child hand-down, compound replay and the remaining
authority/graph negatives remain open. Production external authoring is still
dormant. After three-way integration with the live packet, the real SQLite
focus passed 136/136 (1,630 assertions), and uncached configured
core/contracts/backend Nx typechecks plus module-check dependencies passed.
The final CI/host gate remains pending.

## Task 3.2 — scoped MCP/HTTP transport parity packet

The [reviewed parity packet](evidence/task-3-mcp-parity-integration.md) is integrated
as `4644ed62e`. Its booted generated-MCP and direct-HTTP command comparison
passes with the same dormant 409, and the generated schema exposes both
project endpoint IDs. Integrated MCP tests passed 17/17 (62 assertions) and
the MCP spec TypeScript check passed. The reviewer independently watched two
transport/schema faults fail the selected tests. Mounted positive authoring and
full task 3.2 remain open; the final CI/host gate is pending.

## Task 4.4 — bounded replay and endpoint-authority proof packet

The reviewed test-only packet `7a3a8f696` is integrated. Its [independent
review](evidence/task-4-incident-replay-review/puni-incident-completion-review.md),
[complete focused log](evidence/task-4-incident-replay-review/puni-incident-completion-review-full.log)
and [reproducible fault runner](evidence/task-4-incident-replay-review/puni-incident-completion-review-mutations.txt)
record 104 passing real SQLite controller tests and 1,487 assertions; the
integrated exact file also passed 104/104. The new cycle fixture changes only
unguarded remote endpoints, refuses replay and rolls back a preceding write;
the row-owner and row-identity fault probes admit unsafe replay when their
checks are removed. The typed-graph-only fault changes the refusal detail but
does not admit the cycle; removing both graph protections does. The scoped-read
fault changes a modeled refusal to a later throw, so it proves refusal ordering.
The reviewer confirmed the new adjacent Proof comments state only those
observed outcomes. The independent final-graph-only and writer-time-access
faults leave these new tests green. First-child hand-down, compound replay and
full independent graph/access proof remain open, as does the final CI/host gate.

## Task 9 settings browser regression — dynamic tab count

The new General settings tab made the old six-tab border assertion fail in
[CI shard 4](evidence/task-9-settings-tab-ci.md) at `833ceff80` (107 passed,
2 failed in the shard). The corrected test checks every rendered tab; the exact
light/dark Playwright cases passed 2/2 locally. Replacing the production tab
class `border-0` with `border-2` made the light case fail at the corrected
assertion, and the source was restored. Fresh full CI for this correction is
pending.

The same superseded CI head exposed one unscoped Timezone hint selector in
shard 1 and two six-section settings assertions in shard 3. The corrected
exact browser cases passed 3/3. A missing Timezone hint made the scoped
selector fail while General's hint remained; removing General made both the
ordered list and phone count assertions fail. Production sources were restored
after each probe. Full CI for these corrections remains pending.

## Task 8.1 — dormant transfer v11 parser/preparation checkpoint

The [first independent review](evidence/task-8-transfer-v11/puni-transfer-v11-review.md)
rejected a v1–v3 disguise path: those historical converters discarded a
relabeled external prerequisite, imported the project and returned 201. The
[corrected Astra review](evidence/task-8-transfer-v11/puni-transfer-v11-v2-review.md)
approved the bounded patch after 350 fresh tests, three project lint targets and
core/contracts typechecks passed. Its historical screen now runs before every
legacy converter. The [watched fault](evidence/task-8-transfer-v11/puni-transfer-v123-guard-fault.log)
returns 201 for each v1–v3 case when that screen is disabled; restored mounted
cases return 400 with all logical SQLite tables unchanged. Independent v1–v10
[compatibility probes](evidence/task-8-transfer-v11/puni-transfer-v11-v2-review-compat.test.txt)
and [results](evidence/task-8-transfer-v11/puni-transfer-v11-v2-review-compat.log)
cover local legacy conversion and both external endpoint disguises.

The 14 integrated source files match the reviewed isolated patch byte-for-byte.
Integrated mounted organization, import module and contract-shape tests passed
50/50 (184 assertions); contracts/core/backend TypeScript build passed with
write access to generated artifacts. The first sandboxed build emitted TS5033
write-denied diagnostics and is not counted. The writer still emits v10 and
v11 external import returns a typed dormant 409 before writes. Connected export,
positive external import, current authority/graph admission, fanout and
Navigator v11 support remain open; task 8.1 is unchecked. Final CI and host gate
are pending.

## Task 7.3 — bounded connected optimization stage builder

The corrected stage packet is integrated as two commits. Its [independent Astra
review](evidence/task-7-optimized-stages-review.md) approved the bounded pure
stage construction/selection after the first packet's empty-local stale-placement
bypass was fixed. The [source evidence](evidence/connected-optimization-core.md)
records watched membership, placement-key, foreign replay and empty-graph faults,
including the limits of redundant ownership checks. After integration, the three
focused suites passed 108/108 (284 assertions) and the configured core TypeScript
build passed. An initial sandboxed build failed only with TS5033 write denial and
is not counted. Runtime adapter/hash/certificate, final publication, durable
terminal state, Retry and restart remain open; 7.3/7.4 are unchecked. Final CI
and exact-SHA host gate remain pending.

## Task 8.4a — corrected detached connected tree projector

The first [independent projector review](evidence/task-8.4a-projector-review.md)
rejected a descendant-step label that implied one concrete step and null required
labels that produced a `null.010` address. The corrected
[Astra re-review](evidence/task-8.4a-projector-v2-review.md) approved the pure
bounded packet. The [source evidence](evidence/task-8.4a-connected-tree.md)
records the watched reference, label, identity, readiness and incident-filter
faults. After integration, projector/connected-plan/readiness suites passed 54/54
(146 assertions) and core source/spec TypeScript builds passed. The full core Nx
lint attempt in the isolated packet exited 1 without rule diagnostics; named-file
lint passed. The projector is detached and does no IO or rescheduling. Mounted
presenter, truthful unavailable DTO, announcement/claim, retained/aggregate paths
and task 8.4 completion remain open, as does the final CI/host gate.

## Task 8.1 — frontend dormant import refusal

The v11 dormant external-import 409 exposed an unhandled frontend refusal. A
focused `plan-import-words` Vitest case failed 1/15 at `unreachable` before the
exhaustive message arm was added, then passed 15/15. Named-file ESLint and diff
check passed. The adjacent `Proof:` comment records the removed-arm fault.
Frontend-wide typecheck remains blocked by the separately reviewed task 6.3
`referenced_by_external_dependency` refusal until that packet is integrated.

## Task 5.2 — bounded isolated dependency fanout

The [independent review](evidence/task-5.2-isolated-fanout-review.md) approved
the [isolated fanout packet](verify-task-5.2-isolated-fanout.md). After
integration, eight focused suites passed 131/131 (450 assertions) and the
backend TypeScript build passed. Old/new external components, transitive
recipients and post-commit delivery are covered without shared-person capture;
scoped label privacy proof remains bounded to the tested refusal path. Full
shared-mode external capture, all writers, successful mounted progress/topology
publication and socket/UI acceptance remain open. Task 5.2 is unchecked; final
CI and exact-SHA host gate remain pending.

## Task 8.1 — connected export boundary

The [export seam checkpoint](evidence/task-8-connected-export/README.md) records
why current v10 document, local endpoint IDs and connected `readExport` refusal
must remain until a coherent selected schedule/boundary and stable external
identity response contract is available. Existing SQLite, writer and HTTP
boundary suites passed 110/110 (293 assertions). Removing the production
connected-export refusal made its existing negative fail; restoration passed.
This is evidence only: connected export/import remain inactive and 8.1 is open.

## Task 6.3 — bounded execution admission integration

The [admission evidence](evidence/task-6-3-admission-proofs/README.md) and
[regression repair](evidence/task-6-3-regression-repair/README.md) describe the
isolated packet. The [independent Astra review](evidence/task-6-3-admission-v2-review.md)
approved bounded integration after an initial rejection. The reviewed source and regression
patches were applied to the feature tree; the pre-existing detached tree
projector was also updated to require captured `evidenceByNode` for every
target slice. Removing that guard made its targeted production-path test fail
before restoration. After integration, the eight-file admission and legacy
regression suite passed 207/207 (855 assertions), the connected projector suite
passed 23/23 (57 assertions), the frontend writer suite passed 19/19, and
frontend/core/SQLite/backend TypeScript builds exited 0. The first sandboxed
TypeScript/Vitest attempts could not write generated files and are not counted.
Changed-source ESLint, Prettier and strict OpenSpec validation exited 0 after
the independent review evidence was formatted.
An additional contracts-spec TypeScript check on the combined tree exposed a
test-only TS2345 at `work-item-shapes.test.ts:71,76`: a heterogeneous refusal
schema union could not be passed through one inferred generic argument. Each
declaration now runs its own standard validator; contracts-spec TypeScript,
changed-test lint/format and the four contract tests pass. No HTTP refusal
schema or production validation behavior changed.
Mounted connected claim publication, shared-mode and full observation faults,
MCP authenticated transport, full gate and CI remain open. Task 6.3 stays
unchecked.

## Task 8.4a — mounted connected tree and foreign person holder integration

The initial [mounted tree packet](evidence/task-8.4a-mounted-tree-read.md) and
[foreign person holder correction](evidence/task-8.4a-foreign-person-holder.md)
were combined with task 6.3 admission. The correction received an
[independent Astra approval](evidence/task-8.4a-foreign-person-holder-review.md)
after the first mounted presenter review rejected a dangling foreign person
predecessor in a real Gantt consumer. On the combined checkout, mounted tree,
captured SQLite and pure projector suites passed 72/72 (205 assertions), and
frontend/core/SQLite/backend TypeScript builds exited 0. The
[mounted claim publication witness](evidence/task-8.4a-mounted-claim/README.md)
passed after its previously observed post-commit 500; an
[independent combined review](evidence/task-8.4a-combined-admission-review.md)
approved this bounded integration and identified a freshness assertion added to
the permanent witness. The strengthened target event/sequence/envelope witness
passes 1/1 (14 assertions), backend spec TypeScript and named-file ESLint pass.
A fresh throw injected
at connected tree publication made the witness fail 0/1, then restoration
passed 1/1. It verifies target durable announcement, HTTP 200 and writer
release together. Task 8.4 remains open for unavailable DTOs, retained and
aggregate reads, optimizer admission and full mounted/browser checks; task 6.3
still has its broader evidence matrix. CI and exact-SHA host gate remain open.

## Task 7.3 — bounded connected optimizer outcome bridge

The [isolated runtime bridge](evidence/connected-optimizer-runtime.md) received
[independent Astra approval](evidence/connected-optimizer-runtime-review.md)
for bounded integration. It computes canonical stage/question hashes, pins
foreign replay, validates exact fractional outcomes and separates terminal
boundary evidence from local infeasibility. After integration, the new outcome,
adapter and core selection suites passed 53/53 (150 assertions) and the SQLite
TypeScript build passed. The review also ran a 558-test wider solver/adapter
regression set. The bridge is not installed in production: real snapshot-bound
SQLite capture, durable certificate/result persistence, publication fencing,
Retry/restart and post-close admission remain open. Tasks 7.3 and 7.4 stay
unchecked; CI and exact-SHA host gate are pending.

## Workspace CI — optional outside-edge undo restoration

The prior pushed head's workspace gate failed an archived conditional-undo
case: a historical outside legacy edge whose far endpoint had disappeared
reached the strict connected graph preflight before the existing optional
`canDepend` filter. The [Astra-reviewed correction](evidence/task-ci-undo-graph-review.md)
selects restorable optional edges in journal order before preflight and reuses
that exact set for writes; required live/internal graph guards remain strict.
The isolated packet passed 343 focused tests and a watched bypass of the
filter failed three intended cases. After integration, undo and connected
command admission suites passed 206/206 (1,858 assertions). The prior CI run
also has frontend fixture/typecheck and devsync inventory failures, handled in
separate packets; its twilight gate and a refreshed full CI run remain pending.

## Workspace CI — frontend fixture and devsync inventory correction

The prior pushed head's workspace job also failed on stale fake-project API
step-code expectations and on unregistered connected support services and the
frontend dependency-lookup module. The [independent Astra review](evidence/task-ci-frontend-devsync-review.md)
approved the bounded correction: exact response assertions remain strict and
all new service and module policy entries match production callers. Fresh
focused runs passed 13 frontend tests and 34 inventory/module tests. The
implementer's full devsync run passed 894 of 895 tests; its remaining poller
clone-alternates failure passed in an independent-clone rerun, so full-suite
convergence remains unverified.

The reviewer also found two tracked admission evidence logs containing literal
NUL bytes in printed node keys. Commits `af41d9799` and `8ebeb81de` replace
four NUL bytes in each log with visible `\\0` escapes, preserving the observed
key separator in reviewable text. With the required external TypeScript runtime
set to `/home/df/wd/puni/puni-00/node_modules`, the production Tool Wiki pilot
`pins exact pre-index tuples and passes observe lint from external trust`
passed 1/1 with 60 assertions on the committed receipts. The same pilot had
first failed on each binary log in turn, then refused a missing trusted runtime
when run without that required environment variable. Full CI and the exact-SHA
h2puni gate remain pending.

### Task 8.4 bounded unavailable connected tree packet — 2026-10-22

The [unavailable tree packet](evidence/task-8-4-unavailable-tree-packet.md) adds
structured captured reasons to successful connected tree reads, suppresses row
forecasts, and verifies durable postcommit publication for an edit and eligible
claim. It records watched production mutations, focused tests and exact excluded
integration boundaries. Tasks 8.4 and 9.2 remain incomplete.

Astra's bounded packet review found stale foreign holder catalog attachment after
connected calendar-range refusal. The same packet evidence now records the real
shared-person regression and watched final-availability guard removal. Holder
transfer and catalog attachment now require the final presented schedule to be
available; broader integration obligations remain open.

### Task 8.4 bounded unavailable-tree consumer compatibility — 2026-10-22

The [consumer packet](evidence/task-8-4-unavailable-consumers.md) records exact
space availability evidence, nullable connected displayed engine, coarse load
reason mapping, uncached connected isolated-capacity readings and their watched
production faults. The eight-suite regression run passed 96 tests/490 assertions;
the strengthened mounted recovery cases passed 4 tests/48 assertions. Core and
backend TypeScript and strict change validation passed. Named TypeScript lint
passed with a fresh Nx graph. Prettier and `git diff --check` passed for this
packet. Shared connected aggregate production support and the frontend reason
presenter remain outside this packet; tasks 8.4 and 9.2 stay unchecked. Full CI
and the exact-SHA host gate remain pending.

The [independent backend review](evidence/task-8-4-unavailable-consumers-review.md)
approved this bounded packet and identified a missing person-load presenter key.
On the combined branch, the mounted `person-load-page.test.tsx` case for
`dependency_calendar_missing` failed with the visible text `Platform could not
be read: .`; after adding its reason words, all 8 page tests passed. Frontend
TypeScript now reports only the separate structured schedule-error mismatches
in `wbs-table.tsx`; task 9.2 remains open.

### Task 4.4 bounded incident hand-down integration — 2026-10-22

The [incident hand-down packet](evidence/task-4-incident-handdown.md) was
combined with the current connected tree presenter in a disposable branch. A
new mounted command case, `mounted first-child creation publishes a remote-owned
pinned node on the new child`, passed 1/1 (10 assertions): HTTP returned 200
after publication, and the durable external predecessor endpoint named the
created child. The packet's old-base HTTP 500 reproduction is retained in its
evidence; it does not reproduce on this combined branch. The [independent Astra
review](evidence/task-4-incident-handdown-review.md) approved the bounded packet
after separate endpoint-conflict and cycle-result branch proofs. The corrected
packet and combined branch each passed the 41 lifecycle/history tests (658
assertions); combined backend TypeScript passed. Full task 4.4, full CI and the
exact-SHA host gate remain pending. Six trailing
spaces in two retained fault logs were stripped without altering their printed
fault text; commit-range `git diff --check 0c2264722..cb22c3164` passed.

### Task 9.2 bounded structured-unavailability UI packet — 2026-10-22

The [unavailable UI packet](evidence/task-9-2-unavailable-ui-packet.md) renders
captured missing-calendar project labels and explicit required-engine refusals
in the table and Gantt. Four new mounted negatives failed before implementation
and passed afterward; frontend TypeScript passed. The packet records scoped
lint/format status and the broader five-suite regression passing 551/551 tests.
Persisted external endpoint projection/navigation and terminal boundary certificate
UI remain open; task 9.2 stays unchecked.

The bounded UI packet's Astra review corrections also cover CSV/Markdown
structured refusal explanations and remove the unproven external inspection
promise. Six new export tests and two mounted wording assertions failed before
implementation; independent export catch-all and inspection-promise mutations
then failed six and two tests respectively. The packet evidence records the
restored checks; task 9.2 remains open.

The [independent Astra rereview](evidence/task-9-2-unavailable-ui-review.md)
closed both presentation findings and approved this bounded packet. Fresh
focused runs passed 11 tests and 10 production export combinations; the broad
551-case frontend run remains the packet's earlier observation rather than a
new combined-branch result. Full task 9.2, CI and exact-SHA host gate remain
pending.

### Task 8.4 bounded shared connected aggregate packet — 2026-10-22

The [shared aggregate packet](evidence/shared-connected-aggregate/README.md)
replaces the aggregate's external-edge refusal with observation-local connected
capture/derivation reuse and explicit member projection. Mounted load, weekly
totals, selected Space roll-ups and in-progress refresh foreign-only changes with
target identity fixed. It records seven independently watched production faults,
focused regressions and check outcomes. Task 8.4 remains unchecked; connected
arrangement/restart/admission, the remaining authority/lifetime matrix, browser
proofs and the committed host gate remain outside this bounded packet.

### Task 9.2 bounded persisted remote display/navigation packet — 2026-10-22

The [persisted remote display packet](evidence/task-9-2-persisted-remote-display-packet.md)
consumes the actual captured connected endpoint DTO through PlanRead, renders
qualified desktop/phone labels and stable project/work-item/step navigation,
and keeps foreign endpoints out of local Gantt arrows. It records initial red,
restored mounted coverage, regression checks and watched production-path faults.
Persisted remote scope edits remain an explicit read-only details state; terminal
boundary certificate/Retry and remaining 9.2 integration stay open. Task 9.2 is
not marked complete.

Independent review corrections in the same packet preserve the captured step
and all-descendants selector when its qualified reference names the parent,
and restore captured-details entry focus, Escape/ArrowLeft dismissal and picker
focus return. Eight added red cases, 38 restored packet/editor checks and four
independent watched mutations cover desktop and phone. The packet's correction
section records exact commands and excluded gates; task 9.2 remains unchecked.

The packet's captured-node-name rereview correction also retains the projected
step name beside a non-null qualified node address. Two mounted red cases,
40 restored packet/editor tests and an independent watched address-only mutation
cover desktop/phone labels, details and stable navigation. Scoped check receipts
and unchanged task 9.2 completion boundaries remain in the same packet.

### Task 7.3/7.4 bounded durable optimizer contract foundation — 2026-10-22

The [durable contract packet](evidence/task-7-durable-contracts/verify.md) adds
strict versioned stage, success and boundary-certificate codecs plus exact
question identity. An [independent Astra review](evidence/task-7-durable-contracts/independent-review.md)
approved this bounded packet after 38 focused tests (849 assertions), two
production-library typechecks and inspection of the 99 recorded mutation
failures. On the integrated branch, the same 38 tests and full contracts
TypeScript passed. A separate test-fixture correction at `37cfa290a` restored
the full SQLite TypeScript build; five identity tests passed. Runtime SQL
persistence, current-question admission, raw candidate publication, restart and
Retry remain open, so tasks 7.3 and 7.4 stay unchecked.

### Task 3.2 bounded dormant HTTP/MCP command parity — 2026-10-22

The [command parity packet](evidence/external-command-parity/README.md) pins
explicit scoped stable-ID validation, shared generated tool descriptions,
legacy local aliases and equivalent dormant external refusals through booted
HTTP and MCP. Its [independent Astra review](evidence/external-command-parity/independent-review.md)
approved the bounded packet and inspected seven watched production-path fault
receipts. At integrated head `eca2e15c0`, fresh shared/normalizer/publication
runs passed 57 tests (392 assertions), booted HTTP/MCP passed 21 (698), and
mounted controller regressions passed 127 (1,615). OpenSpec validated 268/268.
External authoring remains inactive; successful mounted external writes,
fanout/read-after-write, real calendar/optimizer outcomes and activation are
still required. Task 3.2 remains unchecked.

### Activation recovery contract correction — 2026-10-22

[ADR 0057](../../../docs/adr/0057-cross-project-dependency-activation-is-monotone.md)
and the delta specification now keep activation authority after the last live
external row and distinguish attended post-exposure recovery from independently
verified eligible dormant Kubernetes rollback. The former universal automatic
migration-reversal task wording conflicted with the current Compose runbook.
Independent Astra review accepted the corrected wording; strict validation of
this change passed 1/1 with no issues, and normal repository-wide validation
passed 268/268. Repository-wide strict validation still reports unrelated
existing warnings. No runtime activation, deploy or host gate is claimed by
this documentation correction.

## Task 8.2 bounded subtree copy packet

Subtree implementation and scoped evidence: [task-8-subtree-copy.md](evidence/task-8-subtree-copy.md).
This packet preserves typed prerequisites of copied successors, exact local and
remote revision preconditions, atomic graph/admission/persistence refusal, and
stable compensation IDs. Active positives are explicitly admitted semantic
fixtures; production mounted external copy remains a 409. Whole-project copy
still depends on task 8.1; task 8.2 remains unchecked. Host gate and mounted MCP
copy equivalence are unverified in this packet. The evidence records the
separately reproduced pre-existing command-fixture failure and follow-up repair.

Independent Astra High [review](evidence/task-8-subtree-copy-review.md) approved
`da939aa99` and the separate baseline fixture repair `ecf760d08`, with no
actionable findings. Root integrated them at `5739c6275` and reran the eight
copy, history, lifecycle, admission and command suites named in that review:
**260 passed, 0 failed, 2,898 assertions**. `git diff --check HEAD~3..HEAD`
and `git status --short` were clean after the merge. The normal merge commit
hooks passed format, lint, secrets and nesting; Tool Wiki reported inactive
and uncertified, which is not a release certification.

At the same feature head, `openspec validate --all --json` passed **268/268**.
The configured `wbs-solver-py:test` target initially failed import because the
local interpreter lacked pinned `ortools` and `jsonschema`. The repository's
`wbs-solver-py:setup-local-solver` target then provisioned and proved the pinned
Python 3.14.7 / solver 0.4.0 environment with a feasible golden request; with
that interpreter on `PATH`, the configured Python test target passed **276/276**.
The frontend `wbs-fe-01:test` target reached 992 passed and one `spawnSync bun
ETIMEDOUT` in the browser-port probe under parallel worker load; the focused
18-case probe passed when isolated. A serial invocation of the configured UTC
Vitest unit suite then passed **993/993 across 79 files**. This diagnoses the
local parallel timeout but does not establish the second timezone/browser tier
or the exact-SHA host gate.

### Task 5.2 bounded shared connected fanout — 2026-10-22

The [shared connected fanout packet](evidence/shared-connected-fanout/README.md)
partitions raw external/person component facts from ordinary selected shared
booking observations, captures inputs once per observation, and retains surviving
projects across last-edge removal. Mounted isolated/shared progress commits
notify successor and tail, and successor-only refetch observes changed readiness;
a mounted label write crosses a person bridge and an external edge. The packet
records seven independently watched production faults, 64 focused tests/297
assertions, scoped TypeScript/lint/format and strict change validation. Rank,
optimizer lifecycle, remaining writers and socket/browser acceptance stay open.
Task 5.2 remains unchecked; full CI and the exact-SHA host gate are pending.

Astra High [review](evidence/shared-connected-fanout/independent-review.md) approved this bounded packet with no P1/P2 findings. The one proof-description mismatch was corrected in `40bc0ab5c`; it now names the actual ordinary-partition assertion observed in the retained fault log.

### Task 10.1 bounded dormant authority storage — 2026-10-22

The [dormant authority packet](evidence/dormant-authority-20261022.md) adds a
paired additive migration, DISABLED singleton/receipt storage, exact inspector,
dynamic authoring getter and independent SQL guards for external relationship
insert/update/delete. The test-only authority seeder is explicit; no production
activation or startup capability is installed. Its evidence records 59 watched
production faults. An [Astra review](evidence/dormant-authority-review-20261022.md)
reproduced a JSON-boolean version bypass in all three SQL guards. The narrow
follow-up `5e4435a7a` fixed it; independent [rereview](evidence/dormant-authority-rereview-20261022.md)
approved the correction after real SQL action probes and 157 focused tests.

At integration, three shared fanout fixtures first failed with
`external_dependencies_inactive` because they inserted synthetic external edges
without the new test-only authority seeder. After adding that seeder, the
combined activation/fanout suite passed **97/97 tests, 222 assertions**. This is
fixture compatibility evidence, not production authoring activation. Startup,
participant fencing, retained-client downgrade protection, activation receipt
transport, deploy recovery and task 10.1/10.2 completion remain open.

A wider 18-file integrated run first passed 327 tests and failed 154 controller
cases, all traced to three newer fixture setup paths that inserted synthetic
external relationships without the new test-only persisted authority. Root
added explicit seeding in `cross-project-dependency-fixture.ts`,
`connected-command-admission.controller.db.test.ts`, and
`cross-project-events.controller.db.test.ts`; the five affected controller
suites then passed **177/177 tests, 2,594 assertions**. The synthetic marker
permits fixture edge setup only. Current mounted production commands still use
inactive authoring; when task 10.1 later binds the live authority to commands,
these mixed fixtures must split synthetic-active and dormant modes so a 409
assertion does not accidentally become an activated-production claim.

### Task 8.1 contract/preparation slice — 2026-10-22

Based on `6a03205c6`, isolated clone `/tmp/puni-external-transfer-contract`.
Task 8.1 remains unchecked. This slice reserves an explicit v11 response arm,
keeps the v10 writer and endpoint vocabulary frozen, requires the captured step
label for step-scoped external endpoints, rejects empty/repeated authored IDs
before splitting internal/external declarations, and rejects mapped destination
collisions during preparation. `findImportDependencyDuplicate` also accepts the
complete scoped set for the later transaction admission call.

Fresh checks:

- `bun test ./libs/wbs/application/core/src/service/prepare-import.test.ts ./libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts ./libs/wbs/application/core/src/module/plan-document/module.test.ts ./libs/wbs/domain/contracts/src/http/import-shapes.test.ts`: **163 pass, 0 fail**, 334 assertions.
- `bunx tsc --build --force libs/wbs/domain/contracts/tsconfig.json libs/wbs/application/core/tsconfig.json`: exit 0.
- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.app.json`: exit 0; the frontend transport consumes the shared response union without an additional adapter.
- `bunx eslint` on the seven changed TypeScript files: exit 0 after producing the Nx project graph. Initial lint had skipped module boundaries without that graph; the final run did not skip it.
- `bunx prettier --check` on those files: exit 0.
- `bunx openspec validate cross-project-dependencies --json`: one valid change, zero issues.

Watched faults, each independently restored:

- Bypass empty-ID check: both internal/external empty authored-ID tests fail.
- Bypass repeated-ID check: cross-arm repeated authored-ID test fails.
- Bypass mapped tuple lookup: mapped-destination and final scoped-tuple collision tests fail.
- Bypass preparation's duplicate refusal: mapped-destination collision test fails.
- Make external step label optional: missing-label classifier test fails.
- Replace the v11 response version with 10: versioned-response acceptance test fails.

The first four new refusal assertions were observed red against the original
preparation; both response/label assertions were observed red before their
implementation. Guard-adjacent `Proof:` comments name these witnessed faults.
A directory-based Bun invocation also matched generated `dist/out-tsc` tests and
reported two alias-resolution errors; the exact source-file command above fixes
test selection and is the reported result.

Not included or verified here: scoped transaction admission/persistence, final
post-allocation invocation of the duplicate helper, connected capture/export,
selected schedule/boundary evidence serialization, saved-plan storage, copy,
activation, mounted external-import tests, browser checks, full build or host
gate. No selected connected optimization evidence DTO is fabricated: the current
transfer producer has not yet supplied that evidence. V11 is a reserved contract
arm until the coherent export producer and admission slices are integrated.

### Task 8.1 review follow-up — 2026-10-22

Addressed the export descriptor regression identified by Astra High review.
`project-shapes.test.ts` now checks both `anyOf` object arms, exact document
versions 10/11 and the format discriminator, project/work-item fields, and the
absence of undo/redo fields in each arm. Production declarations are unchanged.

- Reproduced the original project-shape failure: **3 pass, 1 fail**.
- After the assertion change, the standalone suite: **4 pass, 0 fail**.
- Exact source-file Bun run covering document emission, project shapes, mounted
  plan-document boundary, preparation, plan-document resource/module and import
  shapes: **206 pass, 0 fail**, 503 assertions across seven files.
- `bunx tsc --build --force libs/wbs/domain/contracts/tsconfig.json libs/wbs/application/core/tsconfig.json apps/wbs/fe-01/tsconfig.app.json`: exit 0.
- Changed-test ESLint and Prettier checks: exit 0.
- Independently removed `project`, added `undoable`, and added `redoable` from/to
  each union arm at the production declaration: all six mutations made the
  descriptor test fail (exit 1), then were restored. The per-arm assertions are
  therefore nonvacuous.

Task 8.1 remains unchecked; the integration and verification limitations of the
contract/preparation slice above still apply.

### Task 10.1 bounded pre-service startup refusal — 2026-10-22

The [startup refusal packet](evidence/dormant-startup-20261022.md) moves development
migration and durable admission ahead of service construction and all active
startup work. The compiled backend advertises empty semantics and refuses even
enabled-empty authority. Missing, malformed, unreadable and disabled-with-retained
relationships refuse while closing the source. Four watched production faults
exposed actual identity writes or listener/DNS/retention/optimizer startup;
redundant dependency edges and the scope of their proof are recorded explicitly.
The six affected boot suites passed 85 tests; backend TypeScript and all 268
OpenSpec validations passed. Task 10.1 remains unchecked; runtime support,
participant exclusion, deployment activation and exact-SHA host gate remain open.

### Task 8.1 allocation and internal transaction slice — 2026-10-22

Based on `6255ae662`, isolated clone `/tmp/puni-import-transaction`. This is
Task A of the reviewed import transaction architecture, plus the existing
internal import consumer and focused SQLite atomicity proofs. Task 8.1 remains
unchecked. Preparation preserves original internal declaration paths by authored
ID. `resolveImportDependencies` allocates the complete located relationship set
in numeric document order, remaps internal project/row/step identities and all
successors, and preserves the selected external predecessor destination. Internal
imports now allocate every relationship before their first typed insert.

The mapper's external cases are allocation tests only. Production still refuses
external declarations with `external_dependencies_inactive` before any directory
or project write. No active public path, activation or deployment is introduced.
The post-allocation duplicate test proves the complete packet exposes a collision;
it does **not** claim the importer invokes final scoped duplicate admission yet.

SQLite tests use the real import module, real `servicesOver` tree announcement,
real typed stores and the existing outer writer. They persist whole/node/descendant
selectors with FS/SS/FF relationships, verify fresh IDs and unchanged original
rows, throw after the second actual relationship write, and refuse labels after
all three relationships are staged. Failure snapshots include every application
and migration table, including ownership, directory associations, abbreviation
allocation, audit, revisions, event log and sequencer; only SQLite implementation
tables are excluded. Both the actual writer and an independent read connection
are compared. No tree announcement is replaced with a no-op.

R5 observations, each fault independently restored:

- Retain file row, project or step IDs independently: SQLite allocation case fails.
- Substitute original external source for selected destination: all three scoped
  mapping cases fail.
- Remove required allocation or diagnostic-path guard: its missing-map case fails.
- Sort paths lexically: the declaration-index case beyond nine fails.
- Omit relationship persistence: all three SQLite cases fail.
- Replace outer refusal rollback with commit: label-refusal all-table snapshot fails.
- Omit catch-path rollback: actual-writer all-table snapshot fails. Initially this
  mutation survived independent-connection snapshots, because the uncommitted
  writes remained invisible there. Adding the writer snapshot made it fail; the
  restored production implementation passes.

The SQLite allocation test was observed red against the old per-edge allocation
(`Set` size 3, expected 1). Mapper tests were observed red against an empty mapper,
then passed with the producer implemented. Per-fault logs are retained locally
at `/tmp/puni-import-proof-*.log`; these are local evidence, not hosted artifacts.

Remaining prerequisites are architecture Tasks B/C: required service capability
wiring, scoped endpoint authority and shape admission, final full-set duplicate
and connected-graph admission, bound context/observation expiry, external positive
SQLite and mounted dormant proofs, and durable fanout ordering for that new path.
Current import calls carry actor ID and `ResourceAccess`; membership/role are
rechecked inside the writer, but session/machine/consent identity bindings cannot
be revalidated there. Carrying `CommandCaller` and resolving current access via
`CommandAccess` on the borrowed writer remains mandatory before activation.
Connected export and selected optimization evidence, copy/history, browser,
full build, CI and host gates are outside this slice and unverified.

Fresh verification in this clone:

```sh
bun test ./libs/wbs/application/core/src/service/prepare-import.test.ts ./libs/wbs/application/core/src/module/plan-import/module.test.ts ./libs/wbs/application/core/src/module/plan-import/resolve-import-dependencies.test.ts ./libs/wbs/adapters/store-sqlite/src/import-dependencies.db.test.ts ./libs/wbs/adapters/store-sqlite/src/import.service.db.test.ts ./apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts ./libs/wbs/adapters/store-memory/src/import.service.test.ts --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck --skipNxCache --outputStyle=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:typecheck --skipNxCache --outputStyle=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck --skipNxCache --outputStyle=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint --skipNxCache --outputStyle=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:lint --skipNxCache --outputStyle=static
./node_modules/.bin/openspec validate cross-project-dependencies --json
```

The seven exact test files pass **209 tests, 0 failures, 730 assertions**.
All three configured typechecks and both configured lints pass, uncached.
Prettier checks all eight changed files and `git diff --check` passes. Initial
Nx invocation could not use sandbox Unix sockets; explicit in-process plugin
and daemon settings above produced actual task execution. Initial concurrent
configured lint attempts exited nonzero without diagnostics; separate reruns
passed. Existing dependencies are linked from the workspace; a clean frozen
installation and full host gate were not performed. Mounted failure fixtures
emit expected application error logs while their assertions pass.

### Task 7.3/7.4 bounded connected durable repository — 2026-10-22

Isolated implementation based on `7efc7c029`; this packet does not complete either task.
The additive `20261022213000_add_optimization_boundary_certificates` migration retains
exact-question boundary evidence independently of generation eviction and cache budget
pruning. Connected envelope-v2 success stays physically separate from local envelope-v1
interpretation. The repository shares the existing writer fences and adds current input-hash
correspondence. Diagnostic replacement and certificate insertion share the caller transaction.
The captured adapter borrows its supplied database snapshot and performs no admission.

Fresh commands and results:

- `bun test` over `connected-optimization-cache.db.test.ts`,
  `optimization-boundary-certificate-migration.db.test.ts`,
  `connected-optimization-reader.test.ts`, `connected-question-identity.test.ts`,
  `connected-durable.test.ts`, `optimized-schedule-cache.db.test.ts`,
  `optimized-cache.db.test.ts`, `optimized-outcome.db.test.ts`,
  `optimization-generation.db.test.ts`, and `captured-optimization-reader.db.test.ts`:
  **179 passed, 0 failed**, 1,391 assertions. The new suites were rerun after mutation restoration.
- `bunx tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json`: exit 0.
- `bun tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/20261022213000_add_optimization_boundary_certificates/migration.sql`:
  exit 0.
- `bunx openspec validate cross-project-dependencies --strict`: valid.
- Changed TypeScript files were formatted with Prettier. Project lint initially found the
  barrel export ordering; that was repaired. `NX_DAEMON=false bunx nx run wbs-store-sqlite:lint` then exited 0. The changed-file Prettier check passed.

Watched R5 production-path mutations, each restored before the final green run:

| Injected fault                                                                                          | Command selector on `bun test libs/wbs/adapters/store-sqlite/src/connected-optimization-cache.db.test.ts -t` | Observed refusal of the fault                                                    |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Remove each project/hash/contract/budget predicate independently from either physical lookup            | `lookup`                                                                                                     | Corresponding `isolates ... lookup by ...` assertion failed.                     |
| Remove the cache objective predicate                                                                    | `strict connected success`                                                                                   | Expected PRI `miss`, received `corrupt`.                                         |
| Remove the certificate objective predicate                                                              | `retains the fractional`                                                                                     | Fractional retained roundtrip failed.                                            |
| Remove current-generation inputHash writer fence while holding generation constant                      | `fences changed input hash`                                                                                  | Expected `superseded`, received `stored`.                                        |
| Bypass the retained certificate source                                                                  | `retains the fractional`                                                                                     | Expected retained terminal after turnover, received miss.                        |
| Remove certificate/cache conflict refusal                                                               | `cannot mask`                                                                                                | Expected corruption throw was absent.                                            |
| Remove request identity validation                                                                      | `malformed request`                                                                                          | Invalid quantum/wire/hash/stage request became a miss.                           |
| Remove decoded project/hash/objective/contract/budget correspondence independently                      | `compares decoded <field>`                                                                                   | Each isolated per-field check passed before removal and failed after removal.    |
| Remove captured liveness inputHash correspondence                                                       | `different current input hash`                                                                               | Expected idle, received pending.                                                 |
| Substitute a fresh connection for the supplied snapshot; diagnostic fixture supplied its real file path | `stage selections from the supplied snapshot`                                                                | Isolated and shared cases expected idle after rival publication, received ready. |

Decoded identity checks are redundant with other identity fields and canonical stage
correspondence: simply removing one initially left all five decoded-field cases green.
For each diagnostic proof, the other correspondence fields and stage-byte comparison were
removed temporarily; the remaining single field still refused its coherent wrong envelope.
Removing that final field admitted it. No diagnostic mutations remain in production or tests.
Existing codec field-sweep proofs were not repeated; the codec implementation was untouched.

For migration guards, `bun test libs/wbs/adapters/store-sqlite/src/optimization-boundary-certificate-migration.db.test.ts -t 'refuses retained'`
failed when the retained-row predicate was removed, and `-t 'refuses replaced'` failed when
schema identity comparison was removed: both accepted destructive rollback unexpectedly.
Restored tests prove intact empty rollback preserves the preceding full ledger and retained,
missing, or replaced table rollback refuses without changing that ledger.
An injected real SQLite insertion trigger also proves diagnostic deletion rolls back when
certificate insertion aborts; removing the trigger allows the same admitted commit.

Limits and checks not performed: the adapter is not installed in production composition.
Existing borrowed reader lifetime wrappers were not extended or tested with this new connected
capability; the tests prove supplied-snapshot visibility, not post-settlement wrapper expiry.
The nonbinding-deadline certificate variation, complete repository-level quantum/wire identity
mutation matrix, same-attempt replacement timestamp mutation proof, and terminal duplicate
conflicting-valid-evidence mutation proof remain unverified here. The shared old writer fences
have focused stale-owner/epoch/generation/enablement tests and existing regression evidence;
this packet did not independently remutate every shared old predicate.
Coordinator admission, terminal event-before-release, Retry, restart, frontend outcomes,
installed solver handshake, Python/model suites, full CI and host gate are outside this packet.
Tasks 7.3 and 7.4 remain unchecked and connected runtime capability remains unavailable.

### Task 7.3/7.4 durable repository review correction — 2026-10-22

Addressed the P2 finding in `/tmp/puni-optimizer-durable-review.md` against
`47a7cb6f9`. Replayed the retained reviewer fixture as temporary
`connected-durable-review.db.test.ts`: the original code produced **1 pass, 2 fail**
with `connected outcome lacks payload`; the truncated-JSON control passed. Missing
cache payload and missing failed reason escaped before the modeled corruption catch,
so an admitted replacement could not retire those older diagnostics.

Moved both missing-field checks into the existing recoverable cache decoding boundary.
Retained certificate decoding remains outside that boundary and still throws on damaged
terminal evidence. Unknown stored enum validation likewise remains outside it.
No task checkbox or production composition changed; tasks 7.3/7.4 remain open.

Added ten production repository/adapter regressions covering missing `ok` payload,
missing ordinary `plan-infeasible` payload, missing failed reason, truncated `ok`
payload and truncated ordinary infeasible payload. Each fault checks repository
`corrupt`, expired captured `corrupt`, live captured `retrying`, unchanged diagnostic
on reads, and admitted replacement by one exact decoded boundary certificate with
no surviving cache diagnostic. The first red run was **4 pass, 6 fail**; the four
truncated-payload controls already passed. Corrected run: **10 pass, 0 fail**.
The independent reviewer reproduction then passed **3/3**; its temporary copied
fixture was removed.

Watched R5 faults, restored independently:

- Injected an early missing-payload throw before the cache recovery boundary.
  `bun test libs/wbs/adapters/store-sqlite/src/connected-optimization-cache.db.test.ts -t 'missing.*payload.*(repository|terminal)'`
  failed **4/4**: both missing `ok`/ordinary-infeasible read cases and admitted
  replacements threw `injected missing payload bypass`.
- Injected an early missing-failed-reason throw before that boundary.
  `bun test libs/wbs/adapters/store-sqlite/src/connected-optimization-cache.db.test.ts -t 'missing failed reason.*(repository|terminal)'`
  failed **2/2**: repository/captured read and exact admitted replacement both
  threw `injected missing reason bypass`.
- The adjacent production `Proof:` comment names these observed faults. All
  injected throws were removed before the restored full focused run.

Fresh restored verification:

- Same ten-suite focused command as the bounded repository packet above:
  **189 passed, 0 failed**, 1,447 assertions, including all prior 179 cases.
- `bunx tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json`: exit 0.
- `NX_DAEMON=false bunx nx run wbs-store-sqlite:lint`: exit 0.
- Changed source/test and this record formatted and checked with Prettier.
- `bunx openspec validate cross-project-dependencies --strict`: valid.

No migration/schema change: migration lint was not rerun for this correction.
Full CI, host gate, production composition, borrowed lifetime integration,
coordinator admission/Retry/restart and terminal event/release remain outside
this correction and unverified here.

### Task 10.1 bounded read-only observation transport — 2026-10-22

The [runtime observation packet](evidence/runtime-readonly-20261022/README.md)
adds an exact decoded runtime-capability parser, one shared frozen DB-free
backend advertisement, an argument-free capability executable and a strictly
read-only existing-database `inspect` executable. Semantics stay empty and
production authoring stays dormant. Tasks 10.1 and 10.2 remain unchecked.

The three focused parser/CLI suites passed 70/70 with 118 assertions; the
existing startup suite passed 8/8 with 32 assertions after a scoped escalation
for its health listener (sandbox EPERM initially). Targeted forced TypeScript
builds, ESLint with a generated Nx graph, Prettier and all-change OpenSpec
validation passed. Fifteen watched production faults cover six parser checks,
DB/migration-free capability, immutable empty support, capability/inspection
arguments, explicit DB_PATH, absent-file creation, real attempted SQL writes and
strict authority delegation. The writable mutation actually created the
forbidden table, and constant DISABLED admitted all ten corruption negatives.

Unreadability was tested with chmod 000 under uid 1000; no root-permission proof
is claimed. SQLite may create WAL coordination sidecars while reading; tests
prove unchanged persistent main-database bytes and rejected schema mutation.
The packet records red starts, corrected single-statement corruption fixtures,
commands, output and limits. No host/full gate, build, browser, CI-only checks,
deployment consumer, participant proof, activation or deploy ran. This bounded
slice is not task 10 completion or release readiness.

### Task 7.3/7.4 private snapshot scheduler prerequisite — 2026-10-22

Base: `895cb8643ca901b2754dad4e385c2858c05934b3`, isolated clone
`/tmp/puni-optimizer-runtime-v2`. This bounded packet extracts the existing
local captured-reader and scheduler lifetime wrappers into private
`capturedSchedulerIn`. Both production snapshot constructors use that helper
without its connected argument. Only the focused test passes the explicit
connected configuration; the helper is absent from the public barrel and
`SqliteSource` configuration. It does not read environment configuration.
`services.ts`, optimizer availability, coordinator and external authoring remain
unchanged. Tasks 7.3 and 7.4 remain unchecked.

The helper borrows the supplied database and existing `ReadSnapshotLifetime`.
The connected reader uses the real strict durable codec/repository and real
request preparation; it cannot acquire a fresh connection, settle the caller's
transaction, write runtime state or survive capability expiry. The fixture's
rival connection publishes a valid connected success after the first read:
both isolated and shared observations retain idle, and a subsequent observation
selects ready. Retained terminal evidence stays boundary-scoped and malformed
certificate bytes throw. The owner can still query/reuse its database after
reader expiry. Existing wrapper tests also retain their owned close-on-success,
refusal and failure checks.

TDD: the initial stub produced **1 pass, 3 fail**: connected capability absent
in both explicit-opt-in snapshots and retained local callback did not throw.
Implementation passed those four cases. Expanded coverage and watched faults
below finish at **10 pass, 0 fail**, 34 assertions.

All fault commands use
`bun test libs/wbs/adapters/store-sqlite/src/captured-scheduler.db.test.ts -t '<pattern>'`.
Every fault was restored independently; adjacent `Proof:` comments name the test.

| Injected fault                                                            | Pattern                               | Observed failure                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| Remove acquisition lifetime check                                         | `expires retained acquisition`        | 1 fail: new scheduler accepted after expiry                                       |
| Remove local callback lifetime check                                      | `expires retained local callback`     | 1 fail: idle returned after expiry                                                |
| Remove supports lifetime check                                            | `expires retained supports`           | 1 fail: true returned after expiry                                                |
| Remove resolved Fast lifetime check                                       | `expires retained resolved Fast`      | 1 fail: schedule returned after expiry                                            |
| Remove local schedule lifetime check                                      | `expires retained local schedule`     | 1 fail: schedule returned after expiry                                            |
| Remove connected callback lifetime check                                  | `expires retained connected callback` | 1 fail: idle returned after expiry                                                |
| Replace supplied connected database with fresh connection to same file    | `connected selections`                | 2 fail: ready instead of idle inside held isolated/shared snapshots               |
| Insert project update into connected read                                 | `connected selections`                | 2 fail: SQLite `total_changes()` count 1 instead of 0 before rival publication    |
| Force connected adapter construction with default installed configuration | `without the private`                 | 1 fail: connected capability present without opt-in, with `WBS_LOCAL_SOLVER=true` |

Restored verification:

- `bun test` with the exact files
  `libs/wbs/adapters/store-sqlite/src/{captured-scheduler.db.test.ts,chain-snapshot.db.test.ts,connected-plan-capture.db.test.ts,connected-live-plan.db.test.ts,connected-optimization-cache.db.test.ts,connected-optimization-reader.test.ts,captured-optimization-reader.db.test.ts}`:
  **145 passed, 0 failed**, 529 assertions. Includes production connected
  optimized-engine refusal with zero durable solver/execution allocations.
- A later rerun of `captured-scheduler.db.test.ts` after test-only lint cleanup:
  **10 passed, 0 failed**, 34 assertions.
- `bunx tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json`: exit 0.
- `NX_DAEMON=false bunx nx run wbs-store-sqlite:lint`: exit 0 after correcting
  two test cleanup arrows reported by the first lint run. Nx used its printed
  in-process fallback because the sandbox refused plugin-worker sockets.
- Changed files formatted and checked with Prettier; OpenSpec strict validation
  passed. Normal repository hooks installed before committing.

Limits: this proves the private snapshot-reader boundary, not production connected
optimization. The combined Fast derivation still refuses required optimized
connected projects. Exact-question admission and rechecks for initial, queued,
restart and manual Retry paths; terminal event commit before slot release;
same-question certificate admission suppression; connected outcome DTOs and final
runtime composition remain required. No frontend/import/CLI, schema or migration
changes. Installed solver handshake, Python/model suites, full CI/build, host
gate, deployment and external-authoring activation were not run in this packet.

## Compose binary capability prerequisite — 2026-10-22

This bounded task-10.2 prerequisite adds binary observations only. Task 10.2
remains unchecked. It does **not** prove strict DISABLED/no-edge authority,
participant fencing, semantic downgrade safety, dependency activation, Kubernetes
admission or a completed rollout. Existing automatic recovery policy is unchanged.

Production paths: ordinary Compose `preflight-green` probes independently resolved
candidate/rollback digests before stop intent; shared `checkBackendRecovery` probes
again before stored-vocabulary admission. First installation probes candidate only.
The coordinator's infra-owned decoder requires exact backend protocol/version/role,
closed keys and known unique semantics. The image-local executable runs with no
mount or DB_PATH injection and no network, under a shared 15-second pair deadline.
Missing, unreadable, failed, stalled and malformed observations throw. Explicit
empty support is an observation and never store admission.

TDD RED: `bun test tools/tool-remote-scripts/src/lib/dependency-preflight.test.ts`
against an empty-observation stub produced 29 failures. Ordinary execute negatives
were added before call-site wiring and failed twice because the old path continued
instead of refusing. Retained outputs:
[adapter RED](evidence/compose-binary-prerequisite/adapter-red.log.txt) and
[execute RED](evidence/compose-binary-prerequisite/execute-red.log.txt).

Watched R5 faults used the exact production helper or ordinary/shared recovery
routes, restoring production source after every fault. All named experiments
exited 1 with their behavior assertions failing; exit status alone was not used
as proof. The command for helper faults was
`bun test tools/tool-remote-scripts/src/lib/dependency-preflight.test.ts`.
Call-site faults used
`bun test tools/tool-remote-scripts/src/swap-writer-barrier.test.ts --test-name-pattern 'dependency capability refusal|standalone recovery refuses malformed|ordinary swap independently probes'`.

| Injected fault                                                                                           | Observed failed assertion                                                                                              |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Remove protocol, version, backend-role, exact-key, known-semantic and duplicate predicates independently | Each corresponding malformed subprocess transport was wrongly accepted, separately for candidate and rollback          |
| Omit candidate probe; omit rollback probe; substitute candidate image in rollback command                | Independent exact-image traces and asymmetric malformed-image refusals failed                                          |
| Add database mount; inject DB_PATH                                                                       | Exact DB-free command assertion failed                                                                                 |
| Replace shared deadline with a fresh 15-second deadline                                                  | Delayed subprocess resolved instead of the requested 30-ms deadline refusal                                            |
| Omit candidate digest validation                                                                         | Mutable-reference test reached Docker instead of refusing its pin                                                      |
| Convert caught CLI/transport failure to empty support                                                    | Actual missing and unreadable module imports, nonzero exit, malformed JSON and other malformed transport were accepted |
| Omit ordinary preflight probe                                                                            | Either malformed image reached writer stop; no-stop and independent pair-trace assertions failed                       |
| Omit shared recovery probe                                                                               | Both standalone malformed-image refusals and ordinary four-observation trace failed                                    |

[Watched fault output](evidence/compose-binary-prerequisite/mutations.log.txt) and
[failed-CLI/default and restored-baseline call-site experiments](evidence/compose-binary-prerequisite/extra-mutations.log.txt).
Unreadability used a real mode-000 module with effective UID 1000, asserted nonroot;
absence used a distinct nonexistent module. Positive controls included the actual
backend capability executable with no DB_PATH and supported/explicit-empty
subprocess payloads. No product import exception was widened.

Verification commands and scope:

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile --offline`: passed. The initial install without BUN_TMPDIR encountered a read-only temporary directory; no lockfile change.
- Final focused command: `bun test tools/tool-remote-scripts/src/lib/dependency-preflight.test.ts tools/tool-remote-scripts/src/swap-writer-barrier.test.ts tools/tool-remote-scripts/src/swap-maintenance.db.test.ts tools/tool-remote-scripts/src/swap-migration.db.test.ts tools/tool-remote-scripts/src/lib/sqlite-probe.test.ts`: 209 passed, 0 failed. Existing migration/maintenance fixtures explicitly answer the new capability command; the SQLite clean/retained-WAL recovery adapter preserves its source-family assertions.
- `bun test apps/wbs/be-01/src/dependency-capabilities-cli.test.ts apps/wbs/be-01/src/dependency-activation-cli.db.test.ts`: 24 passed, 0 failed.
- Scoped uncached Nx `tool-remote-scripts:lint`, `:typecheck` and `:build`: passed with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`; default Nx worker/daemon sockets were sandbox-denied. Initial lint/typecheck findings were fixed and rerun green.
- `./node_modules/.bin/openspec validate --all --json`: passed.
- Changed-file Prettier check and `git diff --check`: passed before final verification.

The first complete remote-script source run had 814 passed, 2 skipped and 11 failed:
eight Unix-socket fixture failures in the restricted sandbox and three new adapter
issues (relative backend CLI path and standalone image-inspect handling), subsequently
fixed. The permitted complete rerun of `bun test src --preload ../test/scratch/preload.ts --timeout=10000` from `tools/tool-remote-scripts` finished **824 passed, 2 skipped, 1 failed** (274.85 seconds). The remaining failure was existing `src/lib/docker.test.ts` test `boots local backend configuration from the rendered environment and keeps OIDC callback origin authoritative`, which exceeded 10 seconds. That test sequentially launches two actual backend configuration subprocesses; it does not invoke dependency-preflight code. Its exact isolated rerun with `--test-name-pattern 'boots local backend configuration from the rendered environment and keeps OIDC callback origin authoritative'` passed under the same 10-second budget in 7.78 seconds (1 passed, 127 filtered out). Timing varies; the timeout's root cause was not established and no unrelated test or budget was changed. The broad suite is **not claimed green**.

The two existing skips are managed-solver exceptional cleanup with real Docker: timer-setup failure for a merely created container, and removal after a container has already stopped. [Final verification output excerpts](evidence/compose-binary-prerequisite/verification.log.txt) retain command outcomes and the timeout/isolated-rerun observations.

Deferred/unverified: coordinator-owned SQLite authority scanner and its migration,
schema, trigger, receipt, retained-edge, unreadability and WAL fault matrix; real
stopped-store mutations before maintenance and after maintenance/pre-exposure;
installed source/built `swap --check-backend-recovery` dispatch; backend runtime
startup regressions beyond CLI conformance; Docker/Caddy/backend-recreation rehearsal;
full h2/h4 host gate; CI/secrets/migration full gate; activation, Kubernetes integration,
production deployment and independent implementation review. These are not claims
of this prerequisite. Ordinary/shared admission tests execute production functions
with controlled Docker adapters, not a real image daemon or installed host.

## 2026-10-22 — bounded typed Retry refusal reconciliation consumer

Base `a0a281d99882a01e6552e06ac51509833ddb5214`, isolated clone
`/tmp/puni-certificate-ui`. This packet adds `boundary-infeasible` to the
existing shared Retry 409 schema/type and preserves that envelope through the
generated HTTP client. The writer classifies validated not-retryable Retry
refusals as an obligation to reread only the tree, unioned with already
completed resources. Refused writes are still refused, never marked committed.
The response never writes a terminal state into the cue. Boundary refusal copy
names the captured question and retained valid schedule.

Task 9.2 remains unchecked. There is no certificate summary tree DTO or terminal
cue arm in this packet, and no backend producer, connected optimization wiring,
queue/admission/slot-release/restart proof, or full-question Retry request.
Production connected `engine_unavailable` behavior is untouched. Fixtures test
the consumer contract; they do not claim a live terminal outcome. Exact Q1
boundary-terminal tree/return-to-Q1 presentation, summary field correspondence,
Q48 evidence, retained Fast geometry and remote-dependency/readiness inspection
remain for the certificate DTO/cue packet.

TDD observations:

- Before the schema arm was added, generated-client `keeps the typed boundary
Retry refusal through the generated client` failed: `invalid_response`
  failure instead of the expected typed refusal.
- Before recovery was added, `rereads only the tree after a typed terminal Retry
refusal and preserves completed resources` failed: `[directory]` instead of
  `[directory, tree]`.

Watched independent faults, restored after each:

| Fault                                                | Command/test                                                                        | Observed failure                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Replace typed Retry recovery predicate with false    | Configured Vitest DOM `optimization-retry-reconciliation.test.tsx -t 'Q1 terminal'` | All three Q2 failed/corrupt/ready cases fail: tree read count 1 instead of 2 |
| Remove writer owner guard before refusal publication | Configured Vitest node `plan-writer.test.ts -t 'retired writer'`                    | Refusal array has a terminal sentence instead of `[]`                        |

The mounted same-project runtime replacement case passes and checks no replacement
refresh/toast. Removing the writer guard alone leaves that mounted test green:
runtime isolation supplies an independent boundary. It is **not** claimed as a
watched mounted proof of the writer guard. A mounted guard-specific negative
remains open; the adjacent guard Proof records only the observed unit failure.

Mounted Q1→Q2 cases hold the reconciliation read, check old unavailable state
while it is pending, then open the real menu. Fresh Q2 failed/corrupt still offers
Retry (and sends Q2's input hash), while Q2 ready removes it. The displayed Fast
label remains authoritative. Q2 changes contract/budget alongside its input hash;
this does not prove exact-question comparison when inputHash alone is unchanged.

Validation:

- Frozen Bun install passed (`BUN_TMPDIR=/tmp`, task-local install cache).
- Focused configured Vitest DOM run of `optimization-retry-reconciliation`,
  `optimization-integration`, `wbs-api`, and `plan-writer`: 110 passed.
- Shared `project-shapes.test.ts`: 4 passed, 39 assertions.
- Auckland configured Vitest suite: 5 passed across 4 files.
- `openspec validate --all --json`: exit 0, no failed checks.
- OpenAPI emitted using the production CLI to `/tmp/certificate-openapi.json`.
- Required configured Nx frontend target attempted twice; its node dependency
  exits nonzero in this sandbox. Direct configured node suite: 990 passed,
  5 failed in four subprocess suites (`spawnSync bun/sh EPERM`, plus missing
  timeout-child output). Scoped unsandboxed rerun of those exact four suites
  (`playwright-config`, `vitest-budget`, `node-tier`, `short-date`) passed:
  33 tests across 4 files. This establishes the sandbox limitation without
  claiming the original full target passed.

Final lint/type/UTC full-suite results are recorded below before commit.
Host SHA gate, full build, browser gate and deployment are not run by this
isolated frontend packet; integration owner must gate the reviewed candidate.

Final checks: frontend Nx lint and contracts Nx lint passed. Contracts and frontend
Nx typecheck targets passed before the mounted fixture was added; the final
frontend `tsc --build --force` passed after correcting the corrupt fixture to
carry its required `message`. The restored focused set passed 110 tests; the
final strengthened Q2-hash race fixture rerun passed all 4 tests. Changed-file
Prettier check and `git diff --check` passed. A supplementary strict validation
of this change exits 1 solely on the existing (>500-character) requirement
`Read-only dependency observations are explicit`; no spec text was modified.
The required non-strict all-change validation remains exit 0.

The extra direct configured full UTC DOM run was stopped on the integration
owner's request after a final poll still showed no completion output (only runner
startup). It is **incomplete**, not passing; its exact process group was inspected
and terminated without touching another lane. Normal commit hooks passed.

### Task 8.1 scoped admission transaction slice — 2026-10-22

Based on `e2014d36e`, isolated clone `/tmp/puni-import-admission`. Task 8.1 remains
unchecked. Architecture Task B is implemented, with the following Task C proofs;
this is not the complete transfer/activation workstream.

`PlanImportSource.externalDependencies` is required and validated at construction.
Every production composition binds inactive explicitly. Only isolated SQLite
fixtures supply active capability, and they separately seed synthetic persisted
storage authority. Active+legacy still receives the dormant refusal. The mounted
production import retains its 409 both without and with that seeded marker.

The private resource binds actor/access, the exact newly created owner and the
writer observation. It reuses raw staged endpoint evidence and the connected
graph guard with `NO_ADMISSION` for incident mutation. All endpoint existence,
project ownership/readability and shape checks, the full final scoped duplicate
check and the complete proposed graph check occur before any typed INSERT.
Expected faults return original document paths and `commit:false`; unknown or
foreign references share the same `unknown_ref` body. Trusted corruption and
persistence faults throw. When an existing corrupt component reports no imported
relationship ID, only after the full-set refusal do read-only diagnostic closure
checks identify which external declaration reached it. They never persist or
admit edges individually.

The new scoped SQLite suite exercises:

- Whole/node/descendant-step external prerequisites to restricted readable projects
  owned by another member; current stable IDs survive old descriptive labels.
- Multiple FS/SS/FF tuples, mixed internal typed and legacy reach, selected explicit
  mappings, invalid mapping without fallback to a valid original, final allocated
  internal/external duplicate, reverse mapping cycle, and trusted-corruption setup
  in an external component (including a later declaration after a clean component).
- Missing/foreign project, absent/wrong-project row, absent/wrong-project step,
  parent-as-node and leaf-as-descendant-step, with zero typed INSERTs on modeled
  admission refusal and all application tables unchanged.
- A mapping to a newly allocated local endpoint uses local typed storage; fresh
  relationship IDs are distinct from authored IDs.
- Exact existing store behavior: the referenced remote row keeps identity/content,
  gains one revision and updated-at stamp, and retains created-at/by. Its project,
  steps and unrelated rows are unchanged. Imports create no undo, plan-event or
  saved-plan rows. These assertions preserve the unified store's revision/audit
  contract rather than suppressing its normal endpoint bump.
- Actual `servicesOver` tree announcements and borrowed before/after fanout
  captures. Committed delivery must admit another real writer turn, proving release
  before transport; collected announcements follow successful settlement.
- Queued membership removal before admission; missing/malformed capability;
  declaration-gate bypass; forged private owner, actor and relationship ownership.
- A throw after the second actual typed write (including the external write), and
  a label refusal after relationships are staged. These populated documents also
  stage directory entries and associations, capacity, markers, estimates, actuals,
  progress, measures and legacy links. Every table on the actual writer is compared
  before/after, including remote revisions/audit, ownership, abbreviation counters,
  journals, events/sequencers and migration state; only SQLite implementation
  tables are excluded. No announcements or committed deliveries escape failure.
- Retained resources and contexts after success/refusal/throw, and a refused endpoint
  read suspended across observation closure. A rejected read is deliberate: a
  successful read's next pre-read guard could conceal a missing post-await guard.

Watched R5 faults are recorded in `/tmp/puni-import-admission-proof-*.log` locally:
independent inactive-capability/scoped-access bypasses; missing-capability
validation; active production substitution despite seeded storage authority;
current-membership bypass; selected-mapping substitution; endpoint organization,
row ownership and modeled-refusal bypasses; shape refusal bypass; final duplicate
refusal bypass; complete graph bypass; owner/actor/relationship-owner/successor-owner
predicate bypasses; observation expiry; remote persistence's second dormant guard;
commit on dependency refusal; omitted relationship persistence; delivery before
commit (real nested writer cannot progress, test times out); retained store access;
context cleanup; endpoint post-await assertion; and corrupt-component diagnosis.
Each selected test failed under its fault and the production source was restored.
Context cleanup was tested with its separate outer-observation dependency disabled:
the dependency-only control passed all three settlement cases, then omitting
cleanup failed all three. Production always supplies the real observation guard.
Guard-adjacent comments describe only these observed proofs.

Initial scoped tests were observed red against the old importer (18 failures,
2 existing dormant cases passing). The later corrupt-component path test was
observed red against the first implementation's first-reference fallback, then
passed after precise diagnosis. Test-only fixture/type/lint issues were corrected
before the final verification commands below.

Current-principal limitation remains a rollout blocker: import carries only actor
ID and `ResourceAccess`. Its borrowed membership/role recheck does not prove
session/machine/consent identity bindings. `CommandCaller` plumbing and current
`CommandAccess` resolution on the same writer are still required before activation.
Connected export and selected schedule/boundary evidence, remaining transfer/copy/
history work, live activation and public active-import success are not delivered.
This slice does not newly prove active-external abbreviation exhaustion, every
external mapping/workflow combination, failure of durable event insertion, or
actual gateway transport. Existing mounted allocation and import regressions are
rerun but are not relabeled as those missing active-path cases. Full host gates,
CI/build/browser, fresh frozen installation and deployment remain unverified.

An additional module-boundary audit caught a value-placement error inherited from
this change's allocation checkpoint: `StoredTypedDependency` was declared in a
repository port and the pure mapper imported it there, tainting the feature's
value packet. The audit reported five references and failed 1/15 tests.
The DTO now lives in `ports/typed-dependency-values.ts`; the store port re-exports
it for compatibility, and the mapper imports the value file directly. The
unchanged boundary audit now passes **15/15 tests, 20 assertions**. No debt entry,
checker exemption, duplicate DTO or repository-capability escape was introduced.

Fresh verification commands:

```sh
bun test ./libs/wbs/application/core/src/service/prepare-import.test.ts ./libs/wbs/application/core/src/module/plan-import/module.test.ts ./libs/wbs/application/core/src/module/plan-import/resolve-import-dependencies.test.ts ./libs/wbs/adapters/store-sqlite/src/import-dependencies.db.test.ts ./libs/wbs/adapters/store-sqlite/src/scoped-import-dependencies.db.test.ts ./libs/wbs/adapters/store-sqlite/src/import.service.db.test.ts ./libs/wbs/adapters/store-sqlite/src/import-performance.db.test.ts ./apps/wbs/be-01/src/controller/import-export-organization.controller.db.test.ts ./libs/wbs/adapters/store-memory/src/import.service.test.ts --timeout=30000
bun test ./libs/wbs/application/core/src/module-boundaries.test.ts --timeout=30000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck --skipNxCache --outputStyle=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:typecheck --skipNxCache --outputStyle=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck --skipNxCache --outputStyle=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint --skipNxCache --outputStyle=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:lint --skipNxCache --outputStyle=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint --skipNxCache --outputStyle=static
./node_modules/.bin/openspec validate cross-project-dependencies --json
```

The nine exact behavior suites pass **248 tests, 0 failures, 936 assertions**;
the separate module-boundary suite passes as noted above. All three configured
typechecks and three configured lints pass uncached. Prettier checks all changed
files and `git diff --check` passes. OpenSpec reports one valid change and one
warning about an unchanged existing long added requirement (`Read-only dependency
observations are explicit`); no specification error is reported. Initial direct
ESLint ran before the Nx graph existed and skipped module-boundary lint rules;
the final configured lint runs have the graph and do not skip them. Dependencies
are linked from the workspace; a clean frozen install was not performed.

## Task 8.5 — connected capture and scheduling benchmark (2026-10-22)

[Retained measurements and watched faults](evidence/connected-benchmark/README.md)
cover sparse 202-project alternating incident/person closure and dense 26-project
closure with 300 FS edges and a person-only final member. Production lookup pages
of 25/200 do not cap capture; all member projections reuse one capture and add zero
queries. Full work-item capture occurs exactly once per required member, excluding
unrelated projects. Actual capture query counts are 10,303/5,897; one observed
capture elapsed sample is 565.690243/124.554464 ms and core derive is
15.396044/1.914040 ms, respectively. No unsupported budget is asserted.

Watched full-input caps of 25 and 200 fail completeness; bypassed snapshot memo
reuse doubles first-projection capture queries to 20,606/11,794 and fails. All
mutations were restored before the green run. Focused Bun: 30 pass, 1 existing
opt-in certification skip, 0 fail. Nx domain/store lint and typecheck: four targets
pass, zero cache hits. OpenSpec: 18/18 valid. Normal hooks are installed; commit
verification is reported at handoff. Full host gate/CI build/secrets/migration and
frontend checks remain unrun for this focused slice; this evidence does not close
any other task or activate external authoring.

### Task 8.5 review correction — production live aggregate reuse

The initial packet measured the exposed snapshot capability's memo, which the
production live aggregate does not call. Sparse/dense fixtures now additionally
execute `createLivePlanStore(...).readAggregate(...)` and verify exact aggregate
member identities, shared connected-plan identity, project metadata and schedule
selection. The full-input diagnostic seam counts each required member once;
forwarding wrappers measure the actual production capture and core derivation
once per component, and the Fast scheduler callback runs once. Live metadata
adds a separate work-item table read per member and is accounted for explicitly.

Observed sparse/dense live aggregate query totals: 13,532/6,464; capture queries:
10,303/5,897. Actual capture elapsed: 985.658011/139.149972 ms; actual core derive:
12.123249/2.235134 ms; entire aggregate observation: 1,180.340053/178.418501 ms.
Single samples only, without performance budgets. Bypassing the actual
`connectedByProject` memo fails both fixtures on the first duplicate full-input
capture: expected 1, received 2, through the production `readAggregate` call path.
Mutation restored; expanded focused verification: 48 pass, 1 existing opt-in skip,
0 fail, 3,086 assertions. Uncached domain/store lint and typecheck: four targets
pass; OpenSpec: 268/268 valid (250 changes, 18 specs). Normal commit hooks run
again for this correction; the tool-wiki status is inactive/not certified. [Evidence and retained logs](evidence/connected-benchmark/README.md).
Task 8.5 remains checked based on this corrected production caller coverage.

## Compose dormant preservation prerequisite

Packet A is implemented against integrated base `9265f2933355e588e03722e6460ead9598477d9f`
in an isolated `/tmp/puni-compose-admission` shared clone. The original feature
checkout was not edited. It reuses the workspace's installed dependencies through
a node_modules symlink; this is not a frozen installation proof.

The coordinator's self-contained SQLite scanner checks actual ledger/relationship
tables, unique nonempty names and lowercase SHA256 identities, both dependency
migration identities, exact marker/receipt constrained schemas, all three exact
admission triggers (including numeric JSON version), one id=1 DISABLED marker,
zero receipts and zero external relationships. A missing authority is never a
DISABLED default. The source bind stays recursively readonly/private while the
scanner opens a scratch main/WAL/journal copy, never source SHM. Image-local
inspection is not authoritative and advertised support never admits ENABLED-empty.

Shared recovery and ordinary pre-maintenance admission use the same command.
After maintenance stops, Compose independently resolves the SQLite family again,
compares durable database/rollback image associations, inventories exactly the
outgoing and replacement maintenance identities, proves every one stopped and
executes a fresh scan before exposure. Null predecessor expects maintenance only
at this later boundary. Existing durable-stop failure handling retains current
bytes, migration capture and interruption evidence; it grants no automatic down,
restore, old-writer restart or marker clearance.

Tests first observed missing ordinary before/after admission reach application
startup. After implementation, [18 primary watched mutations](evidence/compose-dormant-preservation/mutations.log.txt)
and [9 additional watched mutations](evidence/compose-dormant-preservation/extra-mutations.log.txt)
failed named production-path negatives. These include independent action-trigger
removal, numeric JSON predicate drift, schemas/ledger/marker/receipt/edge faults,
coordinator substitution by deceptive image inspection, both admission-call
omissions, post-maintenance identity/stopped-state faults, WAL-copy omission,
source/built installed recovery bypass, pin/path/mount/deadline faults and removal
of the generated command's explicit path/read-only opening policy.

Unreadability uses a real mode-000 main file and asserts nonroot effective UID;
absence and malformed SQLite are distinct fixtures. Migrated positive stores agree
with the actual backend inspection CLI and authentic backend boot. The retained-WAL
positive moves an ENABLED main-file marker to DISABLED only in WAL, so omitting WAL
copy is detected. The authentic post-maintenance ENABLED-drift negative checks exact
current main/sidecar bytes after refusal, retained stop/migration markers and absence
of exposure/start. A coherent historical fixture actually omits both dependency
migrations, rather than merely dropping a migrated table. Missing first-install
files and historical bootstrap remain intentionally unsupported.

The exact installed source and freshly bundled recovery executables run with a
filesystem-only test preload redirecting hardcoded host paths to scratch and a
controlled Docker executable that executes the generated scanner. Both refuse
ENABLED and retain existing markers. These are CLI dispatch/transport tests, not
proofs of real Docker mounts or live installed-host behavior.

Verification:

- Focused serial Bun run with `--preload ./tools/test/scratch/preload.ts --timeout=10000`, covering dependency-inventory, dependency-admission, dependency-preflight, swap-writer-barrier, swap-maintenance.db, swap-migration.db and sqlite-probe: **267 passed, 0 failed** in the final repeat (58.17 seconds), including the strengthened authentic drift byte-preservation test.
- Backend capability/activation CLI and cross-project boot conformance combined sandbox run: **31 passed, 1 failed**; the sole failure was `EPERM: listen` for the existing health-server boot positive. The entire boot file rerun with permitted localhost socket access: **8 passed, 0 failed**. Both CLI files' 24 tests passed in the combined run; the restricted combined command is not claimed green.
- Scoped uncached Nx `tool-remote-scripts:lint`, `:typecheck`, `:build` passed with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. Initial export ordering/type findings were fixed. Default Nx daemon/plugin socket startup was sandbox-denied; in-process Nx execution supplied the checks.
- `openspec validate --all --json`: **268 passed, 0 failed** (250 changes and 18 specs). Existing nonfatal warnings remain; validation is not archive readiness.
- Changed-file Prettier check and `git diff --check`: passed. Normal lefthook hooks were installed in the isolated clone before commit; none are bypassed.

[Verification output excerpts](evidence/compose-dormant-preservation/verification.log.txt)
retain counts, scoped checks and the socket refusal/rerun. During proof development,
the first database-drift fixture was already refused by family canonicalization
without the new intent comparison; it was corrected to redirect a coherent entire
family, then removing comparison admitted it. A readonly-only opening mutation was
still refused under `create:false`; the recorded mutation replaces the complete
opening policy, and no independent readonly-flag proof is claimed.

Not run here: the complete remote-script suite/Caddy/backend-recreation daemon
rehearsal, real Docker/Kubernetes operation, frozen dependency install, full CI,
secrets/migration full gate, isolated h2/h4 host gate, deployment or independent
review. Parent integration owns review and the host gate against its integrated
SHA. Task 10.1/10.2 remain open: complete semantic participant fencing, activation
receipt mutation/transport, Kubernetes preservation and downgrade policy are not
implemented or proved by this prerequisite. The writer scanner still permits
readonly readers and cannot establish gateway/MCP/browser exclusion.

## Private connected derivation/capture slice (2026-10-22)

Base: `9015c1fbe561bf64a87da6c9eb3cdca7f3d614fc`; isolated clone
`/tmp/puni-optimizer-capture`. This is only slice 1 of the optimizer activation
plan. Tasks 7.3/7.4 remain open. Production installation, coordinator admission,
child outcomes, queue/restart/Retry and frontend DTO/presentation are unchanged.
The deliberately temporary detached `optimizationCapture` API and removal path
are recorded in design.md.

The initial derivation regression failed with `engine_unavailable` instead of
`scheduled` before the selector was connected. Restored production paths select
mixed engines coherently, retain an earlier immutable boundary while later stages
see earlier choices, preserve a Fast baseline and stage comparisons, order rank
and ID ties, observe enabled Fast members, skip disabled cache reads and empty
questions, and preserve repeat-read stage identity. SQLite production constructors
cover owned/borrowed observations in isolated/shared modes, detached foreground and
background capture, calendar refusal, held target idle, retained projections and
aggregate reads. Capture compares generation/cache/queue/slot/event state before
and after reading. Existing lifetime tests verify retained callbacks refuse after
expiry while the owner's database remains usable.

Watched faults were injected separately, restored, and rerun green:

| Fault                                                           | Observed production-path failure                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Project final composite from baseline                           | `selects actual mixed-engine stages...`: A start 3 instead of 0.                         |
| Build later stages from baseline                                | Same real derivation test: later A boundary 3 instead of 0.                              |
| Replace owned observation transaction with no-op methods        | `owned isolated real selection excludes a rival publication...`: failed instead of idle. |
| Replace borrowed DB with a fresh connection to the same DB file | Corresponding borrowed test: failed instead of idle.                                     |
| Omit private connected reader binding                           | Both `private connected capture` modes: unavailable instead of scheduled.                |
| Insert a generation during captured reader callback             | Both `connected selections` modes: total_changes 1 instead of 0.                         |

The same publication tests pass for both isolated and shared modes and observe the
rival outcome on the next observation. The transaction fault replaces all three
transaction methods so a later missing-COMMIT error cannot substitute for the
intended coherence assertion. The generation fault runs against the writable
borrowed production helper, so a read-only connection error cannot substitute
for the write-count assertion. Adjacent production `Proof:` comments identify
these checks. Evidence is retained under `evidence/task-7-slice1-capture-proofs/`.

Final focused command (241 tests, 0 failures, 807 assertions):

```sh
bun test libs/wbs/application/core/src/service/connected-optimization.test.ts libs/wbs/application/core/src/service/connected-plan.test.ts libs/wbs/application/core/src/service/connected-tree.test.ts libs/wbs/adapters/store-sqlite/src/captured-scheduler.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-optimization-cache.db.test.ts libs/wbs/adapters/store-sqlite/src/connected-optimization-reader.test.ts libs/wbs/adapters/store-sqlite/src/chain-snapshot.db.test.ts
bun test libs/wbs/application/core/src/module-boundaries.test.ts
bun test apps/wbs/be-01/src/controller/cross-project-dependency-lifecycle.controller.db.test.ts apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-store-sqlite,wbs-be-01 --output-style=static
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p wbs-core,wbs-store-sqlite --output-style=static
./node_modules/.bin/openspec validate --all --json
```

The separate module-boundary audit passes 15 tests / 20 assertions; mounted
lifecycle/admission passes 121 tests / 1741 assertions. All three configured
project typechecks and their module prerequisites pass. Configured core and SQLite
lint pass; the final lint run executes core and reuses SQLite's preceding clean
result. Initial core lint failures were import sorting and then sorting the new
barrel export; a direct complete ESLint run identified the latter after Nx's
failed task report omitted the diagnostic. Both are corrected. A fresh core
configured typecheck reruns after the last test parameterization.

OpenSpec all reports 268 passed / 0 failed, with existing advisory warnings.
Dependencies are linked from the source workspace, not freshly installed frozen.
Commit hooks are installed and run without bypass. Full host gate/CI, full build,
solver Python tests, frontend tests/browser, external authoring, deployment,
coordinator terminal publication/Retry/queue/restart and production connected
installation remain unverified or out of scope. No claim here completes 7.3/7.4.

### Current-principal import admission — 2026-10-22

Bounded slice based on `1e901393d69d91a60c759095f3231560c2461583`, implemented in an isolated clone. `ImportService.import` requires `CommandCaller`; HTTP retains the complete authenticated principal. Production composition supplies its existing process-bound `CommandAccess`. Import resolves authority after writer admission and `BEGIN IMMEDIATE`, before resource/graph/capture creation, and uses returned access in capture, callback, resource and dependency context. Explicit legacy callers require durable pre-activation; direct read scope refuses before the writer. Task 8.1 remains unchecked and production still supplies `INACTIVE_EXTERNAL_DEPENDENCIES`.

Observed integration coverage includes mounted/direct queued browser credential revocation and exact binding expiry, removed membership, viewer demotion, changed session policy and enforced SSO; complete modeled status/bodies; direct context kind/organization/user conflicts; explicit and queued-across-activation legacy refusal; mounted queued machine revocation; direct persisted machine/consent absent/revoked/person/account/unbound/organization/source/context/family/audience cases and unchanged controls. Consent principals follow the existing synthetic persisted-authority integration convention, not mounted MCP authentication. The real importer observes current machine member authority plus its delegation marker despite expected super-admin. Refusals compare sorted snapshots of every non-SQLite internal table after deliberate authority changes and assert unchanged capture/push counts.

The active synthetic SQLite fixture records `BEGIN IMMEDIATE` before credential/member SELECTs, before fanout capture and project insertion. A separate pragma-checked connection revokes the retained machine credential while the process coordinator is held without a transaction; the queued import sees the new committed row and refuses before active endpoint admission. Independent fresh-access observations cover the borrowed authorize hook, feature project-creation callback, private resource constructor and dependency context. Missing/unreadable authority relations and malformed activation/member/policy/browser-revocation/credential state throw without effects. Unreadable activation is a table with missing required columns, distinct from an absent table. Existing rollback/fanout/escaped-capability suites are retained.

R5 faults were injected independently, watched fail, restored, then checked green. The original after-resolve-only queue signal did not catch moving resolution early; the tests now also wait for the actual pre-admission UoW attempt, and that fault fails. No capture-throw tripwire is needed for the local unsafe-success observations.

| Injected fault                                                                                                            | Observed negative                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthesize principal from ID/scopes                                                                                       | Exact route authentication/delegation/binding preservation fails                                                                              |
| Substitute expected access for resolver; move resolver before writer                                                      | Queued revoked browser import returns 201 instead of 403                                                                                      |
| Admit explicit legacy after activation                                                                                    | Real direct import loses `no_active_organization`                                                                                             |
| Independently bind expected access in callback, resource or context                                                       | Fresh-access observations see expected super-admin instead of current member                                                                  |
| Remove write-scope guard                                                                                                  | Direct reader enters writer and commits                                                                                                       |
| Bypass borrowed write-role rejection                                                                                      | Queued viewer import returns 201                                                                                                              |
| Independently bypass revoked/person/account/unbound/organization/machine-source/consent-source/family/audience predicates | Corresponding real import loses its precise context refusal                                                                                   |
| Remove missing-credential or missing-context predicate                                                                    | Nullish dereference replaces the modeled conflict; this is exception evidence, not unsafe-success evidence                                    |
| Independently bypass expected kind/organization/user equality                                                             | Direct context mismatch is admitted; current-user comparison remains redundant with the real organization adapter                             |
| Skip credential read                                                                                                      | Absent credential table no longer throws                                                                                                      |
| Collapse resolver refusal into forbidden                                                                                  | Exact removed-member response is lost                                                                                                         |
| Replace production inactive capability with active                                                                        | Both mounted dormancy cases (with/without synthetic storage authority) return endpoint 400 instead of inactive 409; no external-success claim |

The 25 initial independent fault logs and summary are retained for this session in `/tmp/import-faults/`; production dormancy and skipping the browser revocation read add two separate logs (27 independent faults total). Adjacent `Proof:` comments name the observed checks. Source mutation restorations were inspected. These proofs do not establish selected API-secret rotation/expiry, current upstream verifier/JWKS or delegation expiry, or independently current remote MCP family state: retained principal evidence has no such verifier material.

Verification commands observed:

- The plan's 13-file focused Bun command with `--timeout=30000`: **441 pass, 0 fail, 2,130 assertions**, including unchanged command-authority, rollback, import performance and module-boundary suites. Four later trusted-state corruption cases independently pass (32 assertions); the complete final import-authority file is rerun below.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck --projects=wbs-core,wbs-store-sqlite,wbs-be-01 --skipNxCache --outputStyle=static`: all three projects and both module checks pass. A final be-01 typecheck after added corruption tests also passes.
- The corresponding configured uncached `lint` targets with `--parallel=1`: all three pass. Final be-01 lint after the additional tests is recorded below.
- `./node_modules/.bin/openspec validate cross-project-dependencies --json`: valid; `openspec validate --all --json`: **268/268 valid** (250 changes, 18 specs). Existing validation warnings are not certification.
- Exact changed-file Prettier write/check and `git diff --check`; normal installed lefthook commit checks are recorded below.

Session logs: `/tmp/import-focused-green.log`, `/tmp/import-malformed-green.log`, `/tmp/import-types-final.log`, `/tmp/import-typebe-last.log`, `/tmp/import-lint-final.log`, `/tmp/import-openspec-all.log`.

Dependencies were reused through the existing workspace `node_modules`; no fresh frozen install was run. Full h2/h4 host gate, full-repository CI/build/browser checks, deployment and mounted successful external activation were not run by this bounded implementation. No push was requested. Tool Wiki remains inactive/not certified where reported by the normal hook; no new boundary exemption was added.

Final supplement: the complete final `import-current-authority.controller.db.test.ts`
passes **64/64 tests, 501 assertions** after the revocation-read fault restoration
(`/tmp/import-authority-last.log`). Final configured uncached be-01 lint passes
(`/tmp/import-lintbe-last.log`). Exact changed-file Prettier check and
`git diff --check` pass. Normal commit hooks passed: staged ESLint, Prettier, plaintext-secrets,
private-nesting, inactive Tool Wiki validation and agent trailers. Migration/doc-cap
commands skipped by their configured file globs. No host gate or release-readiness
claim is made by this packet.

Kubernetes B1 transport evidence is recorded separately in [verify-k8s-dependency-observation.md](verify-k8s-dependency-observation.md); it does not complete task 10.2 or establish live runtime admission.

## Bounded connected v11 export (2026-10-22)

This read-side packet starts from `169c816db9feb7b257c39bd5ed4e25eaf5321d42`
in an isolated clone. It adds required v11 response history, a pure projection
of the detached component, and the actual connected `readExport` → work-item →
JSON/Markdown route. The existing read snapshot captures owner document facts
alongside foreign identities and cache/stage selection. Production external
write admission and connected optimizer installation are unchanged.

Observed red: the new SQLite export test reached the deliberate
`connected export is unsupported` error before capture wiring. Contract tests
first failed on the absent declaration, then on admitted Infinity before finite
numeric bounds. The missing selected-position test first returned an incomplete
component before exact baseline/selected key checking. Existing v11 response
fixture failed on missing `connected`; its updated test proves response-required
and archival-import-optional history independently.

Observed focused green: `bun test` over the two new contract/core suites,
`plan-document.resource.test.ts`, `module.test.ts`, `connected-live-plan.db.test.ts`,
`chain-snapshot.db.test.ts`, mounted `cross-project-export.controller.db.test.ts`,
`schedule-organization.controller.db.test.ts`,
`import-export-organization.controller.db.test.ts`, and
`plan-document-boundary.test.ts` passed **295 tests, 0 failures, 1053 assertions**.
A later producer missing-sequence/nonfinite-revision test passed 1 test/2 assertions.
The exact regression output is retained under `evidence/v11-export/`.

The mounted tests use synthetic persisted storage authority solely to seed
external reader fixtures. Actual production import dormancy tests remain green
with and without that fixture authority. The all-table before/after export
comparison includes optimizer/cache/generation/queue/event state; JSON and
Markdown allocate no durable work. The tests compare component-axis selected
start 2.5 with the target's existing shifted presentation. Unavailable calendar
and engine arms retain null row forecasts and inspectable links.

Watched faults, each restored before rerunning green, are under
`evidence/v11-export/`:

| Injected production fault                   | Observed failing assertion                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Make response `connected` optional          | Mounted absent-history returned 200 instead of required 500 (`optional-evidence.txt`). Malformed-history is independently refused. |
| Export all incident edges as authored links | Predecessor export gained a foreign-owned outgoing instruction (`incident-transfer.txt`).                                          |
| Remove stored owner/successor equality      | Malformed owner returned a document instead of throwing (`relationship-owner.txt`).                                                |
| Serialize baseline as selected              | Exact optimized selected start was 3 instead of 0 (`selected-baseline.txt`).                                                       |
| Replace retained canonical stage bytes      | Exact stage-boundary comparison failed (`stage-boundary.txt`).                                                                     |
| Replace captured variants with idle         | Distinct plan/boundary infeasibility assertions lost the captured certificate (`drop-certificate.txt`).                            |
| Remove owned observation BEGIN              | First connected export saw `Next remote` instead of the captured old name (`observation-transaction.txt`).                         |

Limits: tasks 8.1/8.2 remain open. This packet does not prove authorized
whole-project export/import, current-principal write admission integration,
production external authoring, saved-plan storage/history, general replay,
connected optimizer activation, or tasks 10.1/10.2. The project-page dormant-import
UI scenario, full transport matrix, independent Astra High review and isolated
h2/h4 host gate remain integration work. No deployment claim is made. Browser,
MCP, Python solver, host gate, CI secrets and migration gates were not run by
this packet. Scoped Nx and frontend results are recorded below when complete;
a started or interrupted command is not a passing check.

Additional watched negatives: `position-ownership.txt` removes the row-owner
predicate and the production projector accepts an A slice attributed to B;
`producer-validation.txt` removes the final trusted response-schema refusal and
accepts absent sequence and infinite revision. Both fail their exact projector
tests and were restored before the final focused rerun.

Scoped Nx verification: all five relevant lint targets passed
(`wbs-contracts`, `wbs-core`, `wbs-store-sqlite`, `wbs-be-01`, `wbs-fe-01`).
Contract/store/frontend typecheck targets passed in the first scoped run;
corrected core/backend test typings then passed their Nx typecheck and module
prerequisites. Initial failed runs are not counted as passing evidence.

`comparison-scope.txt` and `stage-metadata.txt` independently remove their
producer predicates; the exact foreign-scope and mismatched-engine tests fail.
The boundary-certificate mutation preserves PRI plan-infeasible state and drops
only the TIME boundary certificate, so its failure reaches the certificate
assertion independently. OpenSpec full validation passed 268/268 items.
Final restore-green focused rerun passed 40 tests/242 assertions before the last
foreign-stage/scope negative was added; that projector suite is rerun below.

Final projector suite: 10 tests/36 assertions passed, and the final mounted
export suite: 5 tests/42 assertions passed, including target local start 1.5
versus component start 2.5 and sparse/uncoded refusal precedence. Final
plan-document module `tsc -p` passed after these guard tests. Frontend full
Nx test and full repository Nx format check were started but had no completed
result at packet commit time; they remain unverified and are not passing claims.
Sandbox attempts that stalled/returned 130 are superseded by running the same
configured targets outside the sandbox. Review/integration must obtain their
completed output and the required isolated host gate before release.

## Private connected coordinator lifecycle slice (2026-10-22)

Base: `169c816db9feb7b257c39bd5ed4e25eaf5321d42`; isolated clone
`/tmp/puni-optimizer-lifecycle`. This is bounded slice 2 of the optimizer
activation plan. Tasks 7.3/7.4 remain open. `services.ts` still does not install
connected readers or connected admission; DTO/frontend connected presentation and
external authoring remain dormant.

`connected-publication.test.ts` composes the real SQLite repository, source UoW
observation/outcome/initial-reservation/Retry/dequeue owners, real connected
question preparation, strict durable codecs and actual child lifecycle with
controlled output. Its tests cover fractional preflight contradiction without a
child, independently solver-proven terminal output, exact terminal storage/release,
Q1→Q2 (C=1.25)→Q1 admission/Retry without generation or event mutation, stale and
old-budget queue restart, retained terminal suppression before queue launch,
connected edit capture, a diagnostic Retry including queued restart, a competing
terminal between observation and initial reservation, revoked enablement, required
runtime digest/contract, held terminal storage and real event-insert rollback.
The launcher port is now discriminated; existing local fixtures explicitly narrow
before inspecting local-only materialization fields.

The queue retains the existing complete address: stage input hash, objective,
contract and budget. Quantum/wire are fixed by the installed contract and current
connected preparation; objective question hashes are deterministically rebuilt
from this tuple and canonical captured stage bytes. No schema or second
coordinator was introduced. Connected capture never falls back to `inputOf`.
Expected failed/corrupt evidence can launch only a queued explicit Retry newer
than that evidence; retained boundary terminals cannot retry.

Watched production faults were injected separately, restored and rerun green.
Logs live in `evidence/task-7-slice2-lifecycle-proofs/`:

| Fault                                                          | Observed failure                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Allocate before consulting retained complete evidence          | Q1→Q2→Q1 changed generation 2 to 3.                                          |
| Omit Retry's pre-generation retained certificate lookup        | Q1 Retry returned idle instead of typed boundary terminal.                   |
| Drop await on connected preflight terminal storage             | The held-store test observed zero counted seats instead of one.              |
| COMMIT/BEGIN after certificate storage, before event insertion | The actual event-insert fault left one certificate instead of zero.          |
| Omit the reservation owner's terminal recheck                  | The competitor test returned two extra reserved decisions instead of closed. |
| Omit queued installed-budget correspondence                    | Restart failed to publish the two current-budget terminal certificates.      |

Proof development limits: splitting the transaction after the complete outcome
function was ineffective because its event insert had already thrown; the final
fault splits immediately after certificate storage and fails the durable snapshot
assertion. Merely checking final certificate/event counts also failed to expose
temporary duplicate reservation; the strengthened test observes actual committed
reservation decisions and fails when the terminal recheck is removed. The queued
Retry regression first failed with only two original launches, then passed with
the third connected launch after the eligibility fix. No independent mutation of
already-proved lower-level token/cancel/input fences or solver FS/SS/FF validators
was repeated in this slice.

Verification:

```sh
bun test apps/wbs/be-01/src/module/optimization/connected-publication.test.ts
bun test apps/wbs/be-01/src/module/optimization/connected-publication.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/service/optimization-restart.db.test.ts apps/wbs/be-01/src/service/optimization-events.db.test.ts apps/wbs/be-01/src/dependency-capabilities-cli.test.ts
bun test apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts apps/wbs/be-01/src/services.db.test.ts
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck,lint -p wbs-core,wbs-be-01 --output-style=static
./node_modules/.bin/openspec validate --all --json
```

Final connected suite: **15 passed, 0 failed / 60 assertions**. The combined
lifecycle/dormant CLI run before adding the final target-refusal case passed
**97 tests, 0 failed / 559 assertions**. Mounted local fixtures and installed
source-owner regressions passed **210 tests, 0 failed / 1221 assertions**.
Configured core/backend typechecks, module prerequisites and lint passed; core's
two unchanged checks used valid Nx cache while backend checks executed fresh.
A preceding type narrowing cleanup initially failed TypeScript; grouping the
connected question with its read outcome removed the impossible boundary branch
and final configured checks passed. Initial backend lint findings were import
ordering and test promise typing, corrected before the final run. Default Nx
socket startup was sandbox-denied; in-process Nx supplied the checks. OpenSpec
all reports **268 passed, 0 failed**, with existing advisory warnings. Changed-file
Prettier and `git diff --check` passed. Summary output is retained in
`evidence/task-7-slice2-lifecycle-proofs/verification.log.txt`. Dependencies are
linked from the source workspace, not freshly installed frozen. Normal lefthook
hooks are installed and run without bypass.

The initial lifecycle packet used legacy ownership. The scoped review follow-up
below now proves connected foreign-member invalidation in the source-owned
publication and generation-eviction turns. Post-close live installation still
needs slice 3's production binding and remains unverified here. The existing local fan-out paths remain
installed and are not replaced. Controlled solver output proves lifecycle and
publication handling, not a real CP-SAT execution. Solver Python tests, frontend
/browser, full build, frozen install, CI/secrets/migration full gate and isolated
h2/h4 host gate are not run here. Parent integration owns review and the final
exact-SHA host gate. No deployment, push or external authoring activation occurs.

### Scoped connected fan-out review correction (2026-10-22)

Independent review reproduced a selected connected B placement moving from
[2,3] to [1,2] through the durable decoder while C received no invalidation.
The source-owned outcome and generation-observation owners addressed a direct
cause only through `localFacts`. Connected members live in `dependency.projects`,
whose authoring fingerprint does not encode optimizer selection. Both owners now
recognize that captured membership and pass the explicit cause to the existing
old/new component traversal. No new connection, recursive read, source binding,
DTO/frontend installation or global production opt-in is introduced.

Four new activated/scoped tests in `connected-publication.test.ts` compose the
actual source UoW, dependency capture and event writer. The success test pins the
pre-solve B placement at [2,3], verifies the strict durable decoder chooses the
optimized [1,2] placement, and checks persisted plus delivered C←B invalidation.
The eviction test checks that advancing the question removes the selected cache
and records C←B. Real C-recipient insertion triggers separately verify rollback
of the complete outcome/cache/event/sequence snapshot and of generation
replacement/cache eviction/recipient events. Generation is seeded before the
success test so initial allocation fan-out cannot hide a missing outcome cause.

The four tests first failed **0 passed / 4 failed** before the two owner
predicates changed, then passed **4 passed / 0 failed**. Four separate watched
production mutations also failed and restored green:

| Fault                                                           | Observed failure                                                             |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Outcome owner ignores dependency membership                     | C←B events absent after durable optimized selection.                         |
| Observation owner ignores dependency membership                 | Generation eviction returns no C←B envelope.                                 |
| COMMIT/BEGIN after outcome storage, before recipient insert     | C's real insert fault leaves selected cache/event/sequence state committed.  |
| COMMIT/BEGIN after generation eviction, before recipient insert | C's real insert fault leaves changed generation and evicted cache committed. |

Adjacent `Proof:` comments and `scoped-*.log.txt` files in
`evidence/task-7-slice2-lifecycle-proofs/` retain these observations. The original
scoped regression output is retained as `scoped-red.log.txt`.

Final follow-up verification:

```sh
bun test apps/wbs/be-01/src/module/optimization/connected-publication.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/service/optimization-restart.db.test.ts apps/wbs/be-01/src/service/optimization-events.db.test.ts
bun test apps/wbs/be-01/src/services.db.test.ts
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck,lint -p wbs-be-01 --output-style=static
./node_modules/.bin/openspec validate --all --json
```

Focused lifecycle: **100 passed, 0 failed / 564 assertions**. Installed
`services.db.test.ts`: **138 passed, 0 failed / 962 assertions**. Fresh configured
backend typecheck, module prerequisite and lint: **all passed, no cache hits**.
OpenSpec: **268 passed, 0 failed**. Changed-file formatting and `git diff --check`
passed. Normal lefthook hooks run without bypass. Summary output is retained in
`scoped-verification.log.txt` beside the watched fault evidence. The global
connected production reader/admission binding, live connected DTO/frontend path
and exact-SHA host gate remain open. No external authoring is enabled outside the
synthetic trusted storage fixtures.

### Bounded downloaded-v11 integration slices 1–2 (2026-10-22)

The synthetic transfer importer is an explicitly requested test-harness-only second service over the same process source, `commandAccess`, writer/UoW and durable fanout. Production `services.imports` and mounted routes remain unchanged/inactive. Synthetic storage receipts prove neither public activation nor participant fencing. Parent 8.1/8.2 and slices 3–5 remain open.

`connected-transfer-fixture.ts` creates four actual mounted projects with parent/leaf trees, local/remote distinct step UUIDs with coincident labels/codes, internal typed/legacy links, five incoming links (whole/node/descendant-step, FS/SS/FF including two step-specific FS links), an outgoing link and another component member's link. A restricted remote project belongs to a different account; current readable authority suffices. The synthetic round trip additionally clears a remote step code and proves UUID resolution. Fresh project/row/step/link identities and exact remapped/local and unchanged external tuples are asserted, alongside original relationship rows and untouched history/journal tables.

The frontend JSON fixture is an actual mounted source export from that fixture, captured with the remote start date removed to preserve explicit `dependency_calendar_missing` evidence and bound fixture size. It is unedited producer JSON; generated client validation, the toolbar Blob and page archival projection consume the same bytes. Runtime-generated UUIDs and capture times in this test-only artifact carry no authority.

Initial red: the new harness capability tests failed because `syntheticImports` was absent (2 failures), then passed after the test-only seam. Existing production behavior already satisfies the new integration assertions; no product behavior was changed to manufacture a red. Initial richer-fixture failures exposed invalid test parent readiness and mismatched test expectations (partial array matching, read-only step project IDs, button role and exact refusal wording); those fixtures/assertions were corrected without changing production behavior.

Watched independent faults, each restored byte-for-byte before its selected control passed:

| Source fault                                                                              | Selected real-path observation                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove successor-owner export filter in `connected-document.ts`                           | Downloaded round-trip declaration-ID assertion gained `outgoing` (one failing test).                                                                                                                                 |
| Add writable `connected?: unknown` to archival schema                                     | Real mounted export/classification retained `connected`; `not.toHaveProperty` failed.                                                                                                                                |
| Add writable `schedule?: unknown`, then independently `dates?: unknown`, to authored rows | Mounted artifact classification retained each derived property; its precise `not.toHaveProperty` failed independently.                                                                                               |
| Retain file row ID in `resolveImportDependencies`                                         | Synthetic admitted import returned refusal instead of success (`Expected true / Received false`).                                                                                                                    |
| Retain file step ID independently                                                         | Synthetic admitted import returned refusal instead of success (`Expected true / Received false`).                                                                                                                    |
| Retain original internal relationship ID independently                                    | Connected graph consistency threw `conflicting relationship internal-node` in `connected-dependency-graph.ts:addEffective`, before typed persistence; test failed. This does not prove unsafe duplicate persistence. |
| Replace production `installPlanImport` capability with active                             | Both default and synthetic-enabled mounted incoming cases returned 201/new-project summaries instead of inactive 409.                                                                                                |
| Gate external authoring on version 11 regardless of prepared declarations                 | Mounted outgoing-only artifact returned 409 instead of required 201.                                                                                                                                                 |

Commands for each fault/control: `bun test ./apps/wbs/be-01/src/controller/cross-project-import.controller.db.test.ts --timeout=30000 -t '<selected name>'`, selecting `downloaded successor-owned`, `mounted incoming artifact stays inactive`, or `mounted outgoing-only`. Experiment logs are `/tmp/puni-v11-{incident-export,retain-connected,retain-schedule,retain-dates,preserve-row,preserve-step,preserve-link,production-active,gate-v11}{,-control}.log` in the implementation environment. No mutated production file is retained. Existing production `Proof:` comments were not expanded to claim these fresh experiments. Independent import-of-history, project-identity preservation, selected positions/candidate cache identity faults and planned slices 3–5 remain unproved by these new mounted transfer tests; narrower pre-existing tests are not promoted into whole-transfer evidence.

Fresh checks from the isolated `/tmp/puni-v11-import-work` clone at feature base `cca86df06da8e5afd4b0656d61887872ce3fcdbd`:

- `bun test` over mounted export/import, current-authority, organization transfer, route import and scoped SQLite dependency suites (`--timeout=30000`): **159 pass, 0 fail, 1010 assertions**. This includes the necessary adjacent correction of the stale route test's old `(document, actorId, access)` expectation to the retained human `CommandCaller` contract; its initial failure was witnessed in the preceding 158/159 run.
- Focused frontend Vitest over `wbs-api.test.ts`, `plan-toolbar.test.tsx` and `project-page.test.tsx`: **216 pass**; after lint-only edits the three mounted-v11 cases were rerun: **3 pass, 213 filtered**. Full configured frontend all-file and alternate-timezone targets were not run in this bounded packet.
- Both app configured Nx typecheck targets ran uncached and passed, including module checks. Changed-file ESLint and explicit changed-path Prettier checks passed. Configured full app lint targets were attempted separately and uncached; final outcomes are recorded below.
- `openspec validate cross-project-dependencies --json`: valid, no errors; five existing long-requirement warnings. `git diff --check` passed. Normal hooks were installed through the repository installer before committing.

Dependencies reuse the existing feature checkout's `node_modules` through a symlink; a fresh frozen dependency installation was not performed. No h2/h4 gate, full CI/build, browser/E2E, mounted active external success, old-binary, MCP, installation, rollout or deployment check was run. These slices add integration evidence without declaring release readiness or closing the remaining task 8.1/8.2 work.

Final configured checks: uncached `nx run wbs-be-01:lint` and `nx run wbs-fe-01:lint` both passed, using separate task cache/workspace directories after earlier attempts. Direct full backend ESLint exposed the earlier hidden failure as one new test's untyped `Reflect.get`; annotating that test value as `unknown` fixed it. Final `nx run-many -t typecheck -p wbs-be-01 wbs-fe-01 --parallel=1 --skipNxCache --outputStyle=static` passed both projects and their module prerequisites (28.4 s). No lint suppression or production change was needed. A final selected synthetic round trip checks link-ID freshness before Bun's mutating partial matcher inspects the row.

### Astra review correction: include real plan-event history (2026-10-22)

The original history-name regex omitted the real `plan_event` table. Both round-trip snapshots now use one explicit selection of `command_journal`, `plan_event`, `saved_plan`, `saved_plan_body` and `saved_plan_organization`. This closes a test gap; production import behavior is unchanged.

Watched negative: temporarily installed an `AFTER INSERT ON project` trigger immediately before the real synthetic import. It inserted `plan_event(id='injected-import-history', project_id=NEW.id, user_id=NEW.owner_id, kind='create_work_item', label='Injected import history', before='{}', after='{}', created_at=1)`. The old regex test incorrectly passed with the extra imported-project event. With the explicit snapshot, the same selected round-trip test failed at `expect(snapshotHistory()).toEqual(histories)`, displaying precisely the additional `injected-import-history` event. The transient trigger injection was removed from the test source; the restored selected control passed (1 pass, 49 assertions). The throwaway test DB and trigger were closed and deleted by the normal harness teardown.

All three runs used `bun test ./apps/wbs/be-01/src/controller/cross-project-import.controller.db.test.ts --timeout=30000 -t 'downloaded successor-owned'`. Logs: `/tmp/puni-v11-history-before-fix.log`, `/tmp/puni-v11-history-after-fix.log`, `/tmp/puni-v11-history-control.log`. The earlier preserved-link proof description is corrected above: the refusal comes from connected graph `addEffective` before typed persistence, not a late storage refusal.

Follow-up validation: mounted import/export suites passed **12 tests / 117 assertions**. Uncached configured `nx run-many -t lint typecheck -p wbs-be-01 --parallel=1 --skipNxCache --outputStyle=static` passed lint, typecheck and the module prerequisite (1m 9s). OpenSpec validation passed with the same five existing long-requirement warnings; `git diff --check` passed. Frontend tests and host/full CI gates were not repeated for this backend-test/documentation-only correction.

### Task 7.3/7.4 — detached connected optimization view prerequisite (2026-10-22)

This bounded Slice A prerequisite adds `projectConnectedOptimization` to the
actual `projectConnectedTree` producer as `optimizationView`. It does not attach
the view to the public `PlanTree`, widen the local optimization union, install a
connected source/runtime or enable external relationship authoring. Existing
internal selections, stage bytes, history versions and final placement remain
available unchanged. Tasks 7.3 and 7.4 remain unchecked.

The real domain connected selection fixture visits A→B→C with distinct anchors,
A/C optimized and B Fast. Both objective alternatives compare target-owned slices
against their retained stage baseline. A retains C's captured common-axis start
8 although final C starts at 6 (target-relative 4). Fast B stays at common-axis 5
while its alternative compares at 3. Null generation remains null. Pending and
boundary-infeasible retain dates without candidate comparisons; quantisation-floor
compares the published baseline. Idle/disabled/unavailable views remain absent.
Captured foreign project, row and step labels come from the same detached read.

TDD: initial new producer suite was **0 pass / 6 fail** because the view was absent
and foreign C labels were unchecked; after implementation **6 pass / 0 fail**.
Expanded final producer suite: **10 pass / 0 fail**, 24 assertions.

| Independent injected production fault                   | Watched failure before restoration                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Replace actual tree producer projection call with null  | 9 failures: scope/comparison, terminal, floor and label refusal assertions |
| Read fixed foreign starts from final combined placement | Mixed-engine scope assertion: C start 6 instead of captured 8              |
| Remove target-only schedule filtering                   | Mixed-engine and floor finish/order assertions fail                        |
| Remove null-label predicate                             | All 3 captured C project/row/step label refusals fail                      |
| Remove undefined-label predicate                        | Deleted C project-name refusal fails                                       |
| Default missing active stage to null                    | Active missing-stage assertion fails                                       |
| Replace exact canonical stage bytes with empty string   | Retained stage descriptor assertion fails                                  |
| Return retained variant objects by alias                | Consumer mutation changes a subsequent producer read's terminal state      |

Each mutation ran `bun test
libs/wbs/application/core/src/service/connected-optimization-view.test.ts`, exited 1,
and was restored independently. These are actual detached producer-path proofs;
**they do not prove a public HTTP producer→decoder path**.

Fresh verification:

- `bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts libs/wbs/application/core/src/service/connected-tree.test.ts libs/wbs/application/core/src/service/connected-optimization.test.ts libs/wbs/application/core/src/service/connected-plan.test.ts`: **129 pass / 0 fail**, 314 assertions after restoring all faults.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck`:
  succeeds, including required `typecheck:module`; no cache hits.
- `./node_modules/.bin/openspec validate --all --json`: **268 passed / 0 failed**.

- `bun test libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts libs/wbs/application/core/src/module/plan-document/connected-document.test.ts`:
  **138 pass / 0 fail**, 376 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint`:
  succeeds uncached. Initial changed-test lint found two unnecessary indexed-array
  absence checks; using `.at(0)` makes their actual optional boundary explicit.

The isolated clone reuses feature checkout dependencies through a node_modules
symlink; a fresh frozen dependency installation was not performed. Initial Nx
socket-restricted invocations did not execute targets; the explicit daemon/plugin
settings above produced actual target commands and success output.

Remaining Slice A work: closed local/connected public optimization union; public
presentation attachment without local optimized selection; strict response,
client and generated-client decoding of this actual payload; rejection of missing
scope/certificate identity, mismatched target/stage and unknown connected union
arms. The terminal-as-local and missing-public-scope R5 faults remain unverified.
Frontend Slice B, installed C/D/E, solver execution, browser checks, full
CI/build/secrets/migration checks and canonical host gate were not run by this
prerequisite. No release or activation claim follows.

### Saved history Slice 2 — dormant versioned readers (2026-10-22)

Input9 and connected schedule2 are reserved independently of plan-document v11.
The current `canonicalisePlanInput` writer, default normalizer and local/shared
schedule writer remain v8/v1 with their original bytes. `canonicalisePlanInputV9`
is an explicit future-capture fold requiring converted context.
`readSavedPlanInput` upgrades frozen local inputs to9 in memory and validates new
input shape plus captured history; it never edits the source. The historical
normalizer's existing default remains8 so the active legacy comparison does not
mix normalized9 stored input with a still-v8 current side.

`verifySavedPlanBodies` validates new input/schedule shapes and their connected
identity/evidence relationship after the caller's hash/link checks. Its new
`SavedPlanBodyInvalid` has stable body/path/code fields. This helper is **not yet
called by SavedPlanResource**; runtime/HTTP corruption unions, connected save,
current and comparison integration belong to the later slices. No claim is made
that current direct resource reads reject malformed v9/v2 bodies. The v9/v2
version whitelist alone is not semantic read validation.

Frozen fixtures were emitted by the actual historical v1–v8 builder revisions
listed in `saved-plan/fixtures/manifest.json`; each committed compact byte string
has a pinned SHA-256. The v8 writer still emits exactly the frozen bytes. The
legacy schedule1 fixture also preserves a retired algorithm identity. These are
historical-builder test fixtures, not production captures.

The initial reader tests failed **2 passed / 11 failed**, and the integrity helper
failed **0 passed / 4 failed** before implementation. Additional test-first gaps
in direct-fact validation and history collection order each failed before their
fix. Watched faults were restored after every run:

| Injected reader fault                                       | Observed failure                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| Remove v8→v9 local upgrade                                  | Frozen legacy reader tests fail                                 |
| Remove v9 whitelist entry                                   | Complete connected integrity helper test fails                  |
| Default missing v9 context to local                         | Required-context and typed malformed-body tests fail            |
| Canonicalize legacy input before checking external claims   | Explicit scoped-claim refusal test incorrectly accepts the body |
| Omit direct blockage/parallel validation                    | New-body unknown-owner/duplicate refusal test fails             |
| Allow a legacy schedule beside unavailable connected input9 | Unavailable-context schedule pairing test fails                 |
| Retain caller history insertion order                       | Unordered-history canonical bytes test fails                    |

These are **reader/helper-level mutation observations only**, retained under
`evidence/task-8-slice2-readers/`. They are provisional R5 evidence until a mounted
save/read integration observes each fault through the production resource path;
no new `Proof:` claim is attached. Task8.3 stays unchecked.

Final focused command:

```sh
bun test libs/wbs/domain/domain/src/saved-plan/versioned-plan-input.test.ts libs/wbs/domain/domain/src/saved-plan/canonical-plan-input.test.ts libs/wbs/domain/domain/src/saved-plan/normalise-plan-input.test.ts libs/wbs/domain/domain/src/saved-plan/step-blockages.test.ts libs/wbs/domain/domain/src/saved-plan/step-parallels.test.ts libs/wbs/domain/domain/src/saved-plan/connected-history.test.ts libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.test.ts libs/wbs/application/core/src/module/saved-plans/versioned-saved-plan-body.test.ts apps/wbs/be-01/src/service/saved-plan-read.db.test.ts apps/wbs/be-01/src/service/saved-plan-schedule-body.db.test.ts
```

Observed: **184 passed / 0 failed / 578 assertions**, including real legacy local
save/read and v1 schedule-body regressions. Exact output is retained in
`restored-tests.log.txt`. No SQL migration or stored-body backfill is needed.
Full canonical host gate, live deployment, public activation, connected runtime
capture and production-path R5 proofs are intentionally unverified in this slice.

Scoped verification uses `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` because the
sandbox denies daemon/plugin sockets. Fresh uncached domain lint and typecheck
passed after correcting test-only unsafe JSON expectations. OpenSpec validation
(`./node_modules/.bin/openspec validate --all --json`) passed **268 / 268**.

Fresh uncached core lint, full typecheck and its module-typecheck prerequisite
also passed. Commands and output are retained in `domain-nx.log.txt` and
`slice2-core-final-nx.log.txt`; log trailing whitespace is normalized. Normal
lefthook installation is active and no hooks are bypassed.

### Saved history Slice 2 — Astra High review corrections (2026-10-22)

The review found two reader gaps: a well-hashed v2 body could omit target slice
identity or contradict its captured composite, and v1/v2 normalization could
erase explicit scoped claims before the v8→v9 local guard saw them.

`readSavedPlanInput` now checks the original legacy body before any historical
upgrade, retaining the v8 guard as well. Frozen v1/v2 scoped claims, owner claims
and external-history markers refuse without editing the parsed body. These two
new tests first failed **16 passed / 2 failed**, then passed after the preflight.

The frozen v2 slice reader now requires its complete identity and scheduling
field set. `verifySavedPlanBodies` invokes `validateSavedConnectedTarget` after
the existing connected evidence validator. It checks exact target work-item and
slice key membership using captured ownership, stable slice identity, preserved
slice facts and spans, the four common-axis offsets translated through the
target's own captured anchor, calendar text and stage-anchor consistency, and
target waiting counts. The v2 UTC/weekend/ordinal/snap/day-inclusion arithmetic
is frozen beside that validator and imports no live scheduler or calendar
implementation. It validates stored evidence without replacing stored dates.

The new target regression tests first failed **5 passed / 4 failed**; the empty
component waiting-count test also failed before that predicate was moved ahead
of the legitimate empty-component return. Valid A and B bodies use distinct
October 1/2 anchors, including Friday→Monday calendar projection; a genuinely
empty component keeps a null axis and no invented stage. The original Slice 1
fixture has abstract ordinals inconsistent with its date labels and remains
unchanged as structural-only evidence. Core complete-body fixtures explicitly
use the matching calendar ordinals throughout every stage and question byte.

Eight watched reader/helper faults each failed, then restored green:

| Fault                                                             | Observed failure                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Remove original-body legacy preflight                             | Frozen v1/v2 explicit scoped claims are incorrectly accepted           |
| Replace required frozen target slice schema with span-only schema | Missing identity/scheduling-field shape refusal fails                  |
| Skip target evidence validator                                    | Missing/foreign maps and contradictory selected placement are accepted |
| Remove four-offset equality                                       | Altered selected offsets are accepted                                  |
| Remove captured calendar date equality                            | Altered stored dates are accepted                                      |
| Force every anchor shift to zero                                  | The valid B body with a distinct captured anchor is refused            |
| Omit stage-anchor consistency                                     | Contradictory packet target anchor is accepted                         |
| Omit target waiting-count validation                              | Empty-component and ordinary invented waiting facts are accepted       |

Logs are retained in `evidence/task-8-slice2-review/` with trailing whitespace
normalized. These remain reader/helper-level observations until the resource
path is wired; no production-path `Proof:` claim is made. The active v8 input
writer, v1 schedule writer, default v8 normalizer, raw legacy readers and public
activation state remain unchanged. SavedPlanResource and HTTP wiring remain
deferred; task8.3 and the canonical host gate remain open.

Follow-up verification passed: the same ten-file scoped saved-plan/codec/legacy
and database regression command above observed **193 passed / 0 failed / 639
assertions**. Fresh uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx
run-many -t typecheck,lint -p wbs-domain wbs-core --parallel=1 --skip-nx-cache
--output-style=static` passed both libraries and the core module prerequisite.
OpenSpec `validate --all --json` passed **268 / 268**. Outputs are retained as
`regression.log.txt`, `nx.log.txt` and `openspec.log.txt` in the review evidence
directory. The unchanged active-writer golden tests passed; no host gate,
deployment, public activation or runtime resource wiring is claimed.

Kubernetes prepared-only ownership evidence is recorded in [verify-k8s-storage-ownership.md](verify-k8s-storage-ownership.md). It adds no controller mutation, drain, release journal field or release dispatch, and does not complete B2 or tasks 10.1/10.2. Conditional suspension, post-patch crash acknowledgment, exact-owned Job/Pod drain and all release interval/restoration/admission work remain open.

### Bounded public optimization contract prerequisite (2026-10-22)

This packet follows private projection `e3e5d92df`. `PlanOptimization` now closes
local and connected alternatives: local has no scope and cannot contain a
boundary certificate; connected requires captured stage scope and structurally
complete objective certificates. `presentConnectedTree` attaches the existing
detached view without invoking a local optimizer or rebuilding earlier stages
from final pins. The shared HTTP declaration and shape-generated client preserve
that payload. Existing local response tests remain unchanged.

The frontend API explicitly throws
`connected_optimization_presentation_unavailable` for the connected arm before
creating its local presentation read. This is a temporary, tested refusal until
Slice B supplies scoped presentation. No production connected source is installed,
no authoring capability is activated, and no saved-history writer/version changes.

This is **not completion of Slice A or tasks 7.3/7.4**. The wire declaration checks
field types and required scope/certificate evidence; it does not compare a
certificate's project/objective/stage bytes/hash/version/budget/quantum fields
against its sibling scope and optimization fields, nor enforce variant-state
consistency with optional finish/order entries. The existing core selection
validates captured certificate identity, but that does not establish a semantic
wire decoder. A dedicated runtime wire identity guard and its watched negatives
remain required before connected public activation. Browser, mounted installed
production binding, CP-SAT execution and host-gate acceptance remain unverified.

TDD and R5 evidence:

- Adding the actual presentation/response/client fixture first returned missing
  optimization in all four ready/pending/terminal/floor cases: 10 passed, 4 failed.
- Frontend API refusal first failed because the connected pending tree resolved:
  75 passed, 1 failed. With the explicit boundary guard restored: 76 passed.
- Thirty-three independently injected faults made each newly required
  terminal/certificate/question/scope/fixed-slice property optional, widened the
  local arm to accept terminal state, or removed its scope exclusion. Each run of
  `bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts --test-name-pattern 'public connected'`
  failed at `issues` unexpectedly undefined. Three further independent faults
  made boundary `format`, `version`, or `canonical` optional and failed the same
  production response path. Missing-field payloads were serialized through JSON
  before validation so they represent absent wire properties.
- Every fault was restored. Focused restored run:
  `bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts libs/wbs/application/core/src/service/connected-optimization.test.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts libs/wbs/domain/contracts/src/http/client.test.ts`
  — **95 passed, 0 failed, 507 assertions**. This exercises the actual connected
  producer, Standard Schema response boundary and portable shape-generated client;
  it does not claim malformed sibling identities are semantically rejected.

Additional restored checks:

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck -p wbs-core,wbs-contracts,wbs-fe-01 --parallel=2 --skip-nx-cache`
  — passed all eight tasks, including core/frontend module typechecks.
- `./node_modules/.bin/openspec validate --all --json` — 268 passed, 0 failed.
- Initial unrestricted `wbs-fe-01:test` exited nonzero in `test:unit` without
  diagnostic output; that attempt does not establish a passing frontend target.
- Repeating the frontend target with `VITEST_MAX_WORKERS=1` inside the sandbox
  still failed its node prerequisite. A direct diagnostic node run showed five
  failures in `playwright-config.test.ts`, `vitest-budget.test.ts`,
  `src/node-tier.test.ts`, and `src/components/wbs/short-date.test.ts`; the same
  four suites on unchanged base `e3e5d92df` reproduced 5 failed/28 passed,
  including `spawnSync bun EPERM` and `spawnSync sh EPERM`. The diagnostic full
  node run was cancelled after collecting these failures (exit 130).
- `VITEST_MAX_WORKERS=1 TZ=UTC bunx vitest run --config vitest.config.ts src/lib/wbs-api.test.ts src/testing/refusing-api.test.ts --maxWorkers=1`
  from `apps/wbs/fe-01` — **111 passed, 0 failed**.
- Outside the sandbox, the full target's node tier passed 79 files/995 tests.
  Its DOM tier exposed an actual test-facade regression: materializing
  `optimization: undefined` instead of preserving absence made nested reads
  fail `fake_invalid_response`. The exact fifty-card index fixture failed on
  this packet and passed on the unchanged base; the import/toast fixture also
  failed in the full run. The stale full run was stopped (exit 130), omission
  was restored, and the two exact DOM fixtures then passed together (2 passed,
  246 skipped). This facade is test-only; the observed regression is recorded
  here without claiming an additional production safety proof.
- After the facade omission fix, repeated frontend `lint`, `typecheck:module`
  and `typecheck` passed via
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -p wbs-fe-01 -t lint,typecheck --parallel=2 --skip-nx-cache`.
- The restarted outside-sandbox full frontend run passed its node tier again
  (79 files/995 tests). Its DOM alias-parity test failed because the existing
  expected map omits `@wbs/domain/project-address` and
  `@wbs/domain/typed-dependency` (actual 32 entries versus expected 30).
  Running only that alias test on unchanged base `e3e5d92df` reproduced the same
  failure (1 failed, 17 skipped). Neither Vite config nor that unrelated test
  is changed by this packet.
- Final outside-sandbox full frontend command:
  `VITEST_MAX_WORKERS=4 NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:test --skip-nx-cache --output-style=stream`.
  Node tier: **79 files, 995 passed**. DOM tier: **223 files passed, 1 file
  failed; 4,438 tests passed, 1 failed**. Its only failure is the reproduced
  unchanged-base alias expectation above, so the configured target exits 1 and
  is **not green**. Both restored card/import fixtures pass in this full run.
- Since the target's `&&` skips its zoned command after that failure, ran the
  exact configured zoned command separately outside the sandbox:
  `TZ=Pacific/Auckland bunx vitest run --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`
  from `apps/wbs/fe-01` — **4 files, 5 passed, 0 failed**.
- Latest focused Bun confirmation after test naming cleanup: **95 passed,
  0 failed, 507 assertions**. Changed-file format and `git diff --check` pass.
  No full build, host gate, browser E2E, installed solver or full CI/migration/
  secrets gate was run here; normal commit hooks still apply.

### Saved history resource integration (2026-10-22)

This bounded packet adopts the Slice 2 readers in the production saved resource;
it does not complete task 8.3 or the connected save/current slice. The resource
first verifies stored body hashes and schedule-input linkage, then validates new
v9/v2 structure, captured ownership, stage questions, cross-body meaning and
selected target placement. Failures return `body_invalid` with saved plan, body,
path and code through both direct read and either saved comparison side. Stored
bytes and hashes are returned unchanged. Legacy v1–v8/v1 resource treatment,
unknown-version refusal and default v8 normalization remain unchanged.

Saved comparison input now admits v9 explicitly while older input keeps its
legacy normalizer. A mounted connected self-comparison succeeds, and changing a
captured external project name produces a `dependencyHistory.projects`
difference. These tests never create the fixture's foreign project in SQLite;
reading and comparing complete history succeeds without that live dependency.
This is stored-record inspection evidence, not evidence of production connected
capture. Mixed v8/v9 comparisons remain readable but can report format/context
differences: this packet does not normalize both sides to semantic v9 equivalence. Tests install complete bodies through deliberate SQL fault fixtures;
active writers remain input8/schedule1.

Mounted SQLite cases cover missing context/external label/graph ownership/stage
packet/target membership, mismatched candidate question, altered target offset,
body/header version mismatch and connected schedule against local input. Every
malformed case checks direct read and both comparison positions. Separate cases
cover malformed JSON for either body, missing selected schedule, and legitimate
explicitly unavailable context with no schedule. HTTP response validation rejects
malformed `body_invalid` refusals missing path or code.

The initial mounted run failed 9/9 before resource/comparison wiring: malformed
records incorrectly returned 200, and the complete v9 self-comparison returned
422 through the legacy normalizer. Six watched production-path faults failed
with the following observations, then were restored:

| Fault                                | Observed mounted failure                                       |
| ------------------------------------ | -------------------------------------------------------------- |
| Omit resource semantic validation    | Nine malformed-history cases return 200 instead of 422         |
| Omit target evidence validation      | Missing target membership and altered target offset return 200 |
| Omit cross-body validation           | Local input with connected schedule returns 200                |
| Make refusal path optional           | Malformed direct/compare refusal returns 422 instead of 500    |
| Make refusal code optional           | Malformed direct/compare refusal returns 422 instead of 500    |
| Always use legacy comparison decoder | Complete connected self-comparison returns 422 instead of 200  |

Exact outputs are under `evidence/task-8-saved-resource/`. Adjacent `Proof:`
comments name those injected faults. Earlier Slice 2 primitive checks without
matching mounted fault injection remain provisional; this packet does not claim
that every historical-codec safety check has its final production proof.

The first full focused run found six existing controller-fixture failures.
Running the original controller source from `92d75f32b` reproduced all six
(`baseline-controller.log.txt`): its unsupported-version expectation omitted the
already supported input9, and restriction setup through an unrelated project
PATCH used a counting unit of work whose missing dependency stores throw. The
expectation now includes 9; saved-route permission/broadcast tests seed restriction
through the real project repository, leaving all six route assertions intact.

Final focused regression command:

```sh
bun test libs/wbs/domain/domain/src/saved-plan/versioned-plan-input.test.ts libs/wbs/domain/domain/src/saved-plan/canonical-plan-input.test.ts libs/wbs/domain/domain/src/saved-plan/normalise-plan-input.test.ts libs/wbs/domain/domain/src/saved-plan/step-blockages.test.ts libs/wbs/domain/domain/src/saved-plan/step-parallels.test.ts libs/wbs/domain/domain/src/saved-plan/connected-history.test.ts libs/wbs/domain/domain/src/saved-plan/diff-plans.test.ts libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.test.ts libs/wbs/application/core/src/module/saved-plans/versioned-saved-plan-body.test.ts libs/wbs/application/core/src/module/saved-plans/module.test.ts libs/wbs/domain/contracts/src/http/saved-plan-shapes.test.ts apps/wbs/be-01/src/service/saved-plan-read.db.test.ts apps/wbs/be-01/src/service/saved-plan-schedule-body.db.test.ts apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts apps/wbs/be-01/src/controller/saved-plan-organization.controller.db.test.ts
```

Observed **298 passed / 0 failed / 1,091 assertions**, including the restored
six baseline controller failures. Expected error logs in refusal/rollback tests
are deliberate injected boundary failures. OpenSpec command
`./node_modules/.bin/openspec validate --all --json` passed **268/268**.

Scoped uncached Nx command:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck,lint -p wbs-domain wbs-core wbs-contracts wbs-be-01 --parallel=1 --skip-nx-cache --output-style=static
```

Domain, core and contracts lint/typecheck plus module prerequisites passed. The
backend typecheck exposed one existing current-plan test that serialized a
`PlanSide` without proving its now-versioned input was 8. That test now explicitly
requires the still-active v8 current writer; its focused run passed **10/10**.
The backend uncached typecheck then passed. Backend lint first exited nonzero
without an actionable diagnostic; a retry capped at 2 GiB diagnosed JavaScript
heap exhaustion. The same uncached Nx lint target with an 8 GiB heap also exited nonzero
without diagnostics (`backend-full-lint.log.txt`). Full backend lint therefore
**did not pass**; its remaining failure is unverified beyond the observed resource
exhaustion on the 2 GiB retry. A diagnostic-only direct ESLint debug run was
cancelled after that heap exhaustion was established. Scoped lint of the three changed backend files with a 2 GiB heap also
exited nonzero without diagnostics (`backend-scoped-lint.log.txt`); no backend
lint success is claimed. The full backend target remains for the integrator's
canonical host gate.

Normal pre-commit initially found two `prefer-optional-chain` errors in new test
guards. Both were converted to equivalent optional-chain guards; their three
focused tests passed. The final normal commit reruns changed-file lint, format,
plaintext-secrets, private-nesting and the tool-wiki entrypoint. Tool-wiki reports
`inactive` because no external activation root is provisioned; that output is
not a content certification.

Not verified by this packet: connected save/current writer and transaction/cache
capture lifecycle, whole external rename/delete lifecycle after a production
connected save, rendered side provenance, live deployment, semantic activation,
semantic mixed-format comparison equivalence, full build/secrets/migration CI
and canonical h2puni/h4claw host gate. No optimizer
or Kubernetes files are changed. Dependencies come from the existing installed
workspace through a node_modules symlink; no fresh frozen install is claimed.

### Saved history resource review correction (2026-10-22)

Astra's mounted review rejected `1e94094b6`: its supposed complete fixture held
input rows `w1/w2` and steps `s1/s2`, while captured history and schedule held
`root/a` and `design/test`. The resource returned 200 because only project identity
was linked across those inputs. The existing positive fixture therefore did not
establish coherent target identity.

`readSavedPlanInput` now checks the connected target at the versioned historical
input boundary used by both the explicit v9 builder and saved resource reads.
Target work-item and step membership is exact in both directions, including
unscheduled branches and unused steps. Missing, extra or duplicate members and
contradictory parentage refuse. Target value/measure/assignment references,
team/service row references, and legacy/typed dependency endpoints must belong
to those same target rows and steps. No collection is filtered or repaired.
Legacy input readers and the active input8/schedule1 writers remain unchanged.

The domain, core and mounted positive fixtures now construct canonical target
rows from the captured target project, retaining its work/step identities and
parents. A narrow fixture alias follows the existing connected-benchmark fixture
convention; it shares test construction without adding a production barrel
export. The mounted complete control explicitly asserts `a/root` and
`design/test`, returns exact bytes and compares captured labels. A separate
negative recreates unrelated `w1/w2,s1/s2` input identities against the captured
component, then verifies direct read and both saved comparison positions refuse.

The first mounted identity tests failed **0 passed / 3 failed** before the new
check; the expanded coherent-fixture negatives failed **0 passed / 12 failed**.
Two added team/legacy relationship negatives also failed before their guards.
A precise legacy-dependency path test first failed on `$.typedDependencies`,
then passed after reporting `$.dependencies` for that input collection.

Five watched guard omissions each failed the mounted production path:

| Injected fault                      | Observed failure                                                         |
| ----------------------------------- | ------------------------------------------------------------------------ |
| Remove work membership/parent guard | Foreign/missing/extra/duplicate rows and contradictory parent return 200 |
| Remove step membership guard        | Foreign/missing/extra/duplicate target steps return 200                  |
| Remove step-owned fact guard        | Foreign value/measure/assignment row or step owner returns200            |
| Remove row-owned fact guard         | Foreign team/service row owner returns200                                |
| Remove dependency-owner guards      | Foreign legacy endpoint or typed endpoint step returns200                |

Each guard was restored, with adjacent `Proof:` comments. Exact red, mutation
and restored output is under `evidence/task-8-saved-resource-review/`.

Final verification repeated the prior resource's focused regression command
with `apps/wbs/be-01/src/service/saved-plan-current.db.test.ts` included:
**327 passed / 0 failed / 1,258 assertions across 16 files**. The targeted mounted
identity run passed **19/19**. A valid owned-facts decoder case retains values,
measures, assignments and row facts unchanged.

```sh
NODE_OPTIONS=--max-old-space-size=8192 NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-domain wbs-core wbs-be-01 --parallel=1 --skip-nx-cache --output-style=static
NODE_OPTIONS=--max-old-space-size=8192 NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:lint --skip-nx-cache --output-style=static
./node_modules/.bin/openspec validate --all --json
```

All three commands passed, including both module typecheck prerequisites and
OpenSpec **268/268**. Changed-file lint is also rerun by the normal commit hooks.
This remains a bounded reader correction: connected capture/writer/current, broader cross-format semantic
comparison, rendered provenance, activation and canonical host gate remain open.
The prior full backend lint resource failures are not reclassified as passing;
this correction uses focused changed-file lint plus the domain lint target.

Project drain refusal and atomic successor cleanup evidence: [task-4-project-drain.md](evidence/task-4-project-drain.md). This bounded packet does not complete task 4.4 or activate external authoring.

### Semantic tree response prerequisite A — 2026-10-22

Isolated clone `/tmp/puni-semantic-wire`, based on `3f665cf15`. Added runtime
relations only to `getWorkItems`; its structural descriptor remains unchanged.
`questionHash` is preserved, not equated to input hash or verified as a digest.
The frontend continues refusing connected presentation pending B.

- Baseline: `bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts libs/wbs/domain/contracts/src/http/schema-shape.test.ts`: 34 passed.
- Tests first: the producer suite reported 13 failures (eight well-typed question mutations and five comparison mutations accepted). The API suite reported 76 passed/one failed: foreign URL expected `connected_optimization_project_mismatch`, received presentation refusal.
- Independent runtime faults: for each `projectId`, `objective`, `inputHash`, `contractVersion`, `budgetMs`, `quantum`, `wireVersion`, `stageBytes`, bypassed only that equality in the production wrapper. Ran `bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts -t 'connected terminal rejects semantic question mismatch: <field>'`. Each failed with generated client returning `kind: success` instead of `invalid_response`. Logs `/tmp/puni-semantic-fault-<field>.log`; production restored after every sweep.
- Independently removed displayed-ready, finish-presence and order-presence checks. Ran the same suite with `-t 'connected comparisons reject semantic mismatch: <fault>'` for `displayed`, `ready-finish`, `ready-order`, `nonready-finish`, `nonready-order`. Each generated client accepted the malformed projected response and the assertion failed. Logs `/tmp/puni-semantic-fault-<fault>.log`.
- Bypassed only the frontend URL equality. `TZ=UTC bunx vitest run src/lib/wbs-api.test.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000` from fe-01 failed for foreign URL: presentation refusal replaced required project mismatch. Restored production guard. Log `/tmp/puni-semantic-url-fault.log`.
- Restored green: the three Bun suites passed 48 tests, 390 assertions.

Full host gate, browser, live optimizer activation and CI are unrun in this bounded
packet. Shared frontend union support is completed by B before integrated frontend
typecheck can pass; A deliberately keeps the presentation refusal.

Focused verification details:

- `TZ=UTC bunx vitest run src/lib/wbs-api.test.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000` from fe-01: 77 passed.
- `bunx eslint` over the five changed TypeScript files: passed after replacing an issue-path `join` assertion (Standard Schema path segments may be objects) with precise JSON path equality.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false bunx nx run wbs-contracts:typecheck --outputStyle=stream`: passed.
- `bunx tsc --build --force libs/wbs/application/core/tsconfig.json`: passed.
- Broad Nx lint/typecheck attempt was interrupted after socket/recursive-task invocation problems; it is not evidence of a passing broad gate. Single-target contracts typecheck and the configured direct core compiler command above supply focused evidence.
- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`: fails pending B1's connected cue reading/words handling and local-only test fixture annotation. The public union is intentional; this packet must integrate with B1 before claiming frontend typecheck passes.
- `openspec validate --all --json` after the spec addition: passed (18/18).
- Strengthened URL fixture to cover pending and a correctly paired terminal certificate for both matching/foreign URL IDs: 79 API tests passed. Bypassing URL binding then failed exactly the two foreign-project cases (pending/terminal), receiving presentation refusal instead of project mismatch; `/tmp/puni-semantic-url-fault-final.log`. Matching IDs pass semantic/contextual validation and reach the deliberately retained presentation refusal.
- Full contracts lint command `bunx eslint libs/wbs/domain/contracts/src libs/wbs/domain/contracts/solver/src`: passed. A subsequent standalone `nx run wbs-core:typecheck --outputStyle=stream` with daemon/plugin isolation disabled passed both module and core compiler tasks.
- Normal commit hooks passed lint, format, plaintext secrets, private nesting and author trailers; tool-wiki returned its explicit inactive/noncertified state because the external activation root is not provisioned. Migration/doc-cap hooks had no matching files.

### Connected cue B1 pure presentation packet (2026-10-22)

This bounded packet derives captured-scope presentation from the generated
connected optimization type. It preserves local output, distinguishes terminal
rounded-bounds evidence from initial-model infeasibility, retains the selected
sibling's label, qualifies comparisons, suppresses stale arithmetic, and throws
for unknown internal state/proof/evidence/scope discriminators. The HTTP connected
refusal stays in place; this does not enable mounted connected presentation.

TDD command, from `apps/wbs/fe-01`:
`bunx vitest run --config vitest.node.config.ts src/components/wbs/optimization-cue-reading.test.ts`.
Initial run: 10 failed, 33 passed (43 collected). The failures named missing
scope/details/floor/retention/stale wording, absent discriminator throws and the
silent displayed-finish fallback. Restored implementation: 44 passed after adding
complete `chartReadOf` optimization equality.

Independent production faults, each run with that exact command and restored
before the next experiment, all exited 1 with the intended assertion:

- Replace the unknown state throw with `return null`: unknown internal state no longer throws.
- Replace the unknown proof throw with `return null`: unknown internal proof no longer throws.
- Replace the unknown evidence throw with empty words: unknown internal evidence no longer throws.
- Replace the unknown scope throw with `return null`: unknown internal scope no longer throws.
- Restore Fast fallback for missing displayed connected finish: contradiction no longer throws.
- Add `boundary-infeasible` to aggregate Retry admission: both terminal cases receive a forbidden Retry objective.
- Replace non-ready row refusal with null: both terminal selection refusal assertions fail.
- Omit optimization propagation in `chartReadOf`: full captured optimization equality receives undefined.

Session fault outputs: `/tmp/cue-b1-proof-{state,proof,evidence,scope,finish,retry,selection,chart}.log`.
These are pure reader/adapter proofs. Mounted action/HintLayer/focus/browser
geometry, real producer integration, Retry reconciliation, live runtime and host
gate verification remain unrun for this packet; B2–B5 and parent 7.3/7.4/9.2 remain
open. Ready scope currently carries no question hash; terminal details preserve
the certificate question hash that exists on the wire.

Fresh configured frontend typecheck passed with the semantic packet's generated
`LocalPlanOptimizationView` / `ConnectedPlanOptimizationView` union applied:
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck`.
The B1 commit depends on those exports, supplied separately by the semantic-wire
packet. The existing local integration fixture import is narrowed to the local
arm to prevent unrelated spread helpers from manufacturing a mixed union.

The initial Nx lint invocation exited 1 after 5m12s without diagnostic stdout;
changed-file ESLint subsequently identified and corrected the import sort/type
syntax and the intentional singleton-discriminator runtime check. The initial
configured Nx pure target exited 1 without collected test output, so it is not
counted as a passing test run. A serialized configured full-tier investigation
also reported infrastructure/date child-process failures in `playwright-config`,
`vitest-budget`, `node-tier` and `short-date`; these do not establish a clean
full-tier baseline. Exact session investigation logs are `/tmp/cue-b1-unit.log`
and `/tmp/cue-b1-nx-unit.log`. Full lint/test and the canonical host gate remain
required on the combined candidate.

Final bounded verification: `TZ=UTC bunx vitest run --config vitest.node.config.ts
src/components/wbs/optimization-cue-reading.test.ts
src/components/wbs/plan-chart-input.test.ts` passed 62 tests in 2 files (44 cue,
18 chart-input). Explicit ESLint over the five changed frontend files exited 0.
`openspec validate --all --json` passed. Serialized broad investigations were
interrupted with exit 130 after the failures above; no broad passing claim is
made. Normal commit hooks and combined-candidate host/CI checks are separate.

### B2 bounded mounted cue renderer (2026-10-22)

`optimization-cue.tsx` now renders the B1 connected overview (including its
scope and displayed-schedule retention) and each row's captured details through
the existing fact-card string. Connected algorithm words explain fixed foreign
positions and the retained stage baseline. Boundary infeasibility uses the
warning token independently of whole-plan infeasibility; a pending sibling still
wins the solving dot. Menu selection and Retry continue to consume B1's existing
refusals/admission without a second renderer policy. The HTTP refusal is intact.

Initial configured Nx test attempt could not use sandbox sockets and exited 0
without collecting tests; this is **not** test evidence. With
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false`, the configured full test target stopped at
its node-tier dependency without collected test output and did not reach the mounted selection
(`/tmp/cue-red.log`). The bounded DOM command uses the same checked-in Vitest
config directly, with explicit file selection and collected counts:

```sh
TZ=UTC bunx vitest run --config vitest.config.ts src/components/wbs/optimization-cue.test.tsx src/components/wbs/plan-cards.test.tsx --no-file-parallelism --maxWorkers=1
```

Run from `apps/wbs/fe-01`. Before implementation, the cue suite had 4 failures
and 49 passing tests: both terminal forms lacked target/captured facts, the
pending-sibling card lacked its question hash, and the stale card lacked its
boundary caveat. After implementation the two selected files passed 195 tests;
keyboard and additional stale-ready assertions were then added for final
verification below. Existing plan-card tests are regression coverage only; this
packet does not claim a connected producer/HTTP/cards retained-date oracle.

Each fault below was injected independently into the production branch, run
with the command below, observed exiting 1 at its named mounted assertion, and
restored before the next fault. Type errors are not the proof:

```sh
TZ=UTC bunx vitest run --config vitest.config.ts src/components/wbs/optimization-cue.test.tsx --no-file-parallelism --maxWorkers=1 --testNamePattern 'the connected captured cue'
```

- Drop `row.details`: captured target/labels/positions and question-hash assertions fail.
- Drop the connected overview: retained-stage and stale-boundary facts disappear.
- Drop the terminal dot arm: both terminal warning-dot assertions fail.
- Admit boundary-infeasible into `reading.retryable`: forbidden Retry entries appear.
- Allow boundary-infeasible row selection: both unavailable-entry assertions fail.
- Hardcode Fast retention for a selected ready sibling: sibling/floor negative-text assertions fail.
- Retain stale ready figures/comparisons: the stale card contains forbidden figures.
- Return null for unknown state: no application alert appears.
- Return null for unknown proof: no application alert appears.
- Return empty words for unknown evidence: no application alert appears.
- Return null for unknown scope: no application alert appears.

Fault outputs are `/tmp/cue-b2-proof-{details,scope,dot,retry,selection,retention,stale,unknown-state,unknown-proof,unknown-evidence,unknown-scope}.log`.
Mounted tests also inspect both evidence meanings, selected-ready retention,
selected floor, failed-sibling Retry identity, terminal open/close/reopen without
Retry, read-only fact focus and the application's alert/Reload fallback. These
are jsdom state/action proofs. Browser HintLayer geometry, live focus behavior,
producer-bound dates, B3 enabling, B4 reconciliation, host gate and live runtime
verification remain unrun for this packet.

Final bounded verification:

- The two-file configured DOM command above passed **196 tests in 2 files**, including 54 cue tests and 142 existing plan-card tests (`/tmp/cue-b2-final-tests.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:lint` passed uncached (`/tmp/cue-b2-lint.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck` passed both the module prerequisite and application build, uncached (`/tmp/cue-b2-typecheck.log`).
- `./node_modules/.bin/openspec validate --all --json` passed all 268 items, with existing advisory warnings (`/tmp/cue-b2-openspec.log`).
- Explicit ESLint on both changed frontend files and `git diff --check` passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:test --skipNxCache --args='src/components/wbs/optimization-cue.test.tsx'` exited 130: its `test:unit` prerequisite exited nonzero without collected test names/counts. This does not establish a frontend full-suite pass or identify a specific failing assertion. The targeted command above establishes the mounted assertions only.

Hooks were installed through `bunx nx run tool-git-hooks:install`; the bounded
commit uses normal pre-commit, prepare-commit-msg and commit-msg hooks.

## Packet A — bounded admission and graph acceptance, 2026-10-22

The [focused acceptance report](evidence/task-4-admission-acceptance.md) records
new mounted real foreign-step tests, exact step-ID/project delivery refusals,
add/update second-successor-owner rollback and protected-read boundaries,
resulting-owner replay refusal, actual qualified lookup followed by queued
membership/native credential revocation, and mounted local priority/dependency
scheduling. Existing actual SQLite A→B→A distinct-node interleaving and the
mounted local create/link/undo/redo alias batch are retained.

Nine independent watched fault receipts are retained under
[evidence/task-4-admission-acceptance](evidence/task-4-admission-acceptance/sha256.tsv).
They distinguish early admission failure from later graph/working-plan/publication
defense: no unsafe committed success is inferred when a redundant guard still
refuses. Moving the same current-authority resolution before the held writer
changes queued membership's HTTP403 error from `not_a_member` to `forbidden`,
proving the current-authority refusal contract. Only native revocation reaches
the forbidden fan-out tripwire's HTTP500 instead of HTTP403. The real writer
enqueue signal prevents mere request authentication from being mistaken for
queue admission.

Verification from the isolated `a31f8b5c8`-based proof checkout:

```sh
bun test apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-dependency-lifecycle.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-dependency-history.controller.db.test.ts apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts libs/wbs/application/core/src/service/dependency-endpoint-evidence.test.ts libs/wbs/application/core/src/service/connected-dependency-graph.test.ts libs/wbs/application/core/src/service/dependency-graph.test.ts libs/wbs/domain/domain/src/connected-step-node.test.ts libs/wbs/domain/domain/src/schedule-connected.test.ts --timeout=15000
NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-contracts,wbs-core,wbs-be-01 --skip-nx-cache
bunx openspec validate --all --json
```

Initial nine-suite regression: **338 passed, 0 failed, 3,231 assertions**.
A subsequent clean repeat under concurrent typechecking passed 337 and exposed
one existing authority test's clock margin: the credential policy fixture advanced
a clock initialized before setup by 301 seconds, which need not be 300 seconds
past actual JWT issuance after slow setup. The fixture now derives the injected
time from retained first-party `issuedAt + 301_000`. Its focused redo control
passed, followed by the **entire current-authority suite: 105 passed, 0 failed,
706 assertions**. The other eight suites passed in the repeat. No production
credential rule changed.

The final uncached configured contracts/core/backend typecheck completed all five
targets successfully. Uncached configured `wbs-core:lint` and `wbs-be-01:lint`
also passed, along with changed-file ESLint and Prettier checks. OpenSpec
validation passed **268 items** (250 changes, 18 specs), zero failures. Nx could
not create its plugin socket in the sandbox and used its supported in-process
fallback; the configured targets completed rather than being skipped.

Public external authoring remains dormant. Positive external graph and replay
cases use explicitly admitted semantic SQLite fixtures; mounted local scheduling
and public refusal witnesses are identified separately in the report. No whole
3.2/4.2/4.3/4.4 task closes here. Host gate, full build, CI secrets scan, public
activation, generated MCP enabled-success parity and deployment were not run or
claimed by this bounded packet.

### 2026-10-22 — saved history writer prerequisite Slice A (writer dormant)

Base: `a31f8b5c871aaf36d1169d4f9f8b83d78cb36a2f`, isolated shared clone
`/tmp/puni-codec-fit`. Scope is reserved input9/schedule2 codec fit only. Ordinary
input8/schedule1 writers and compose's connected-capture refusal are unchanged;
no migration, activation, push or deployment. Task 8.3 remains open.

The first mounted codec-fit run was red: 1 pass / 8 fail. Metadata, numeric code,
algorithm and absence contradictions were admitted; observations were not retained.
The missing-code rejection was existing structural coverage. Corrected historical
step codes to string/null, retained observation configuration independently of
ready questions, checked question configuration identity, matched overlapping
target metadata, and passed the header present/absent envelope into validation.
Retired algorithm identity remains accepted when body and header agree.

Fresh focused verification:

```sh
bun test libs/wbs/domain/domain/src/saved-plan/connected-history.test.ts libs/wbs/domain/domain/src/saved-plan/versioned-plan-input.test.ts libs/wbs/application/core/src/module/saved-plans/versioned-saved-plan-body.test.ts apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts
```

Passed: **170 tests, 738 assertions, 0 failures**, 103.59s. Includes the full
mounted controller suite, read and both comparison positions for 19 codec-fit
faults, retained pending/failed/corrupt observations, string and null codes,
retired algorithm read, local save/current and unknown-version regressions.
`./node_modules/.bin/openspec validate --all --json` exited 0, failures 0.

R5 watched faults were applied independently and restored before the next run.
Each mounted mutation run exited 1 at its first direct-read assertion because
the expected 422 became **HTTP 200**. It stopped before the comparison
assertions; the restored healthy suite separately verifies refusal in both
comparison positions:

| Removed/broken guard                             | Named mounted codec-fit case(s)                                       |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Accept numeric code                              | numeric step code                                                     |
| Make code optional                               | missing step code                                                     |
| Omit target project equality                     | target project metadata                                               |
| Omit target row equality                         | target row metadata                                                   |
| Omit target step equality                        | target step metadata                                                  |
| Omit observation/variants null equality          | observation absence (observed Fast stage with null variants)          |
| Omit question/observation configuration equality | observation identity, contractVersion, budgetMs, quantum, wireVersion |
| Omit header/body algorithm equality              | header algorithm                                                      |
| Omit absence-reason equality                     | absence reason, missing calendar reason                               |

Commands used `bun test apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts
--test-name-pattern '<named codec fit fault>'`. Session evidence is
`/tmp/puni-codec-proof-{numeric-code,missing-code,project-metadata,row-metadata,step-metadata,observation-presence,observation-identity,algorithm,absence}.log`.
Adjacent production `Proof:` comments identify these observed omissions. The
healthy mounted SQL-injected historical records prove direct-read and both-side
comparison rejection; the watched mutations prove direct-read guard
breakability. They do not prove production connected save/current lifecycle,
which remains dormant.

Full host gate, CI secrets/migration checks, connected writer/current activation,
immutable lifecycle and rendered provenance are unrun for this prerequisite.

Configured typechecks passed: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx
run-many -t typecheck --projects=wbs-domain,wbs-core,wbs-be-01` exited 0 (all five
tasks, including module checks; domain reused the output freshly generated by
the initial invocation). Initial backend test mutation compile errors were
corrected with test-only `Reflect.set`. Initial concurrent project lint was
interrupted (130) after domain exited nonzero without diagnostics; serial domain
Nx lint also exited 1 without diagnostics. These are not passing lint evidence.

The direct serial ESLint investigation identified two diagnostics in the new
project metadata guard (optional chaining/unnecessary conditional), exit 1,
13.23s, max RSS 1,518,636 KiB; no signal/resource cause was established. Corrected
with `projects.at(0)` and optional chaining. Final configured serial project lint
passed: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint
--projects=wbs-domain,wbs-core,wbs-be-01 --parallel=1 --outputStyle=stream`, all
three tasks, exit 0, 1m40s, zero cache hits. A fresh configured domain typecheck
after the lint correction also passed, exit 0, zero cache hits. Changed-file
Prettier check and `git diff --check` passed.

Post-lint focused rerun with the same four-suite command passed again:
**170 tests, 738 assertions, 0 failures**, 44.39s.

## Connected cue B3 producer-fixture prerequisite — 2026-10-22

Bounded packet based on `bad43141f2f8cd156fa26b4b801264e5aa13221c`, developed in the
isolated `/tmp/puni-b3` clone. The parent explicitly accepted a coherent producer
prerequisite while preserving `connected_optimization_presentation_unavailable`.
No frontend production adapter, activation or authoring behavior changes here.

`src/testing/connected-optimization-view.fixture.ts` in `wbs-core` has no test-runner
imports. Its mixed-engine observation was extracted from the existing producer
suite. `createConnectedOptimizationTree` returns the actual projected public tree
plus required undo/redo read fields. The existing ready/pending/terminal/floor
response/generated-client tests now consume that factory. Its JSDoc distinguishes
the synthetic mixed terminal identity fixture from mathematical infeasibility.

`createFractionalConnectedOptimizationTree` derives a real FS chain with the
ordinary connected derivation and scheduling path, preserving real B=0.2→1.2.
Only B requests optimization. The controlled captured port calls the actual
`buildConnectedSolverRequest` and `prepareConnectedBoundaryOutcome`; it does not
invent the terminal question or a child response. Question fields and canonical
stage bytes come from that prepared/classified request. Independent controlled
Pri idle/pending/failed states survive JSON serialization and generated-client
decoding beside terminal Time without finish/order figures. These states model
captured sibling observations, not installed optimizer admission or cache behavior.

Watched reds and restored greens:

- The first fractional public-tree test failed while the fixture export was absent;
  after implementation the existing suite plus the new test passed 29/29.
- `bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts`
  failed 2/33 when pending/failed Pri controls still returned idle; after independent
  sibling projection it passed 33/33.
- Fault: replace production `if (lower > upper)` in
  `solver/src/build-connected-solver-request.ts` with `if (false)`. Command:
  `bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts --test-name-pattern fractional`.
  Observed **0 pass / 4 fail / 29 filtered**, all four reporting
  `fractional fixture requires boundary-infeasible, received request` through
  actual connected selection/derivation. This is a runtime preparation dependency
  failure, not a typecheck failure or a handcrafted certificate. Restored the
  classifier and added its adjacent `Proof:` comment. Full targeted selection
  restored green; fault log: `/tmp/puni-b3-classifier-red.log`.

Verification commands and final results are recorded below. Dependencies reuse
this workspace's installed `node_modules` through a clone-local symlink; this
packet did not perform a fresh frozen dependency install. Nx required
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false` because sandbox sockets were refused.
An initial unqualified Nx invocation exited zero after socket warnings without
running a target; that output is explicitly **not** a typecheck pass. Initial core
lint caught an unsafe inline `JSON.parse`; the boundary now assigns it to
`unknown` before passing it to the decoder.

Deferred B3 assertions: the real HTTP frontend adapter and `projectServicesOf`
into mounted `WbsTableOverClient`; table/card rendered start/end/bar/span oracles;
terminal unavailable selection and zero Retry HTTP calls across reopen/refetch/
remount; selected-ready sibling and floor retention; failed-sibling Retry hash;
pending announcement; missing-calendar/engine-unavailable editable/readiness/
dependency navigation; unknown external refusal before cue rendering; full
adapter equality and URL mismatch over these producer fixtures. No connected
refusal removal, frontend alias/config changes, B4 reconciliation or mounted B5
proof is claimed. Frontend suites, build, browser geometry/focus, canonical host
gate, required CI checks, installed solver runtime, live Retry authority and safe
activation remain unrun for this packet. Parent 7.3/7.4/9.2 remain incomplete.

Final bounded checks (all exit 0 after restoring faults):

```sh
bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts libs/wbs/domain/contracts/solver/src/connected-solver-outcome.test.ts libs/wbs/domain/contracts/solver/src/build-solver-request.test.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts libs/wbs/domain/contracts/src/http/schema-shape.test.ts
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint --outputStyle=stream
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck --outputStyle=stream
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-contracts:lint
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-contracts:typecheck
./node_modules/.bin/openspec validate --all --json
git diff --check
```

The targeted tests passed **80 tests in 5 files / 480 assertions**, including
**33 producer tests**. Both Nx lint/typecheck projects ran successfully uncached;
core typecheck also ran its module prerequisite. OpenSpec validated **268/268**,
with existing advisory archive warnings. Final logs are
`/tmp/puni-b3-{tests-final,lint-final,typecheck-final,contracts-lint,contracts-typecheck,openspec-final}.log`.
An earlier command mistakenly included the nonexistent
`build-connected-solver-request.test.ts`; Bun collected only four real files,
so that invocation is not counted as builder-suite verification. The final
five-file command above includes the existing `build-solver-request.test.ts`.

`bunx lefthook install` installed the clone's normal pre-commit,
prepare-commit-msg and commit-msg hooks. The bounded commit uses those hooks.
Independent review is delegated to the parent after its current review slot frees;
this packet does not represent a review or a gate approval of B3 enablement.

### B4 connected Retry reconciliation (2026-10-22)

This packet extends the real mounted table/project-runtime/writer tests over an
internal connected `fakeProjectApi` fixture. It does not exercise the public
HTTP decoder or claim producer fixture coverage; those belong to B3. Q1 failed
and corrupt each reconcile Q2 failed, corrupt, ready and boundary-infeasible.
The held authoritative read keeps Q1's status and captured boundary; only Q2
supplies the new boundary, certificate and Retry hash. Ready/terminal cases
reopen and stream-refetch without issuing another Retry. Replacement API runtime
and same-API project transitions reject late refusal toast/read/state writes.
Writer tests also cover delayed replacement/withdrawal and busy ownership while
the covering tree read remains held. Stream refresh failure, rather than a
rendered stale prop, suppresses ready comparisons, finish/order figures and
suggestions, retains captured facts/certificate with stale wording, and then
accepts a fresh retryable authoritative Q3 question with a changed hash and fixed
boundary, without the old certificate. The explicit next Retry sends `q3`.

Watched production-path fault: temporarily add a catch to the actual table Retry
command which manufactures `boundary-infeasible` plus a certificate from the
old captured question before rethrowing the typed terminal 409. Run from
`apps/wbs/fe-01`:

```sh
TZ=UTC bunx vitest run src/components/wbs/optimization-retry-reconciliation.test.tsx -t 'a connected Q1 failed terminal Retry refusal reconciles Q2 failed only through its tree' --no-file-parallelism --maxWorkers=1
```

Observed **1 failed / 11 skipped**, exit 1. The held-read assertion expected
`Optimization unavailable` but received `Priority-first: This captured
optimization question cannot fit the fixed positions in other projects` before
Q2 arrived. This is the intended runtime failure, not a typecheck or another
guard. The temporary mutation was removed; the adjacent table Retry `Proof:`
comment records it. Log: `/tmp/puni-b4-optimistic-one-red.log`. An earlier whole
file fault run failed eight held-read matrix cases; it also contaminated the
shared old fixture in a replacement test, so the independent single-case run
above is the claimed proof.

Bounded verification commands and final outcomes are recorded below after
restoration. The clone borrows the existing workspace `node_modules` by symlink;
no fresh frozen dependency installation is claimed. Browser HintLayer/focus/
phone geometry, the full frontend gate, canonical isolated host gate, required
CI checks, live connected solver/Retry authority and session-owner integration
are unrun in this packet. Writer withdrawal is covered, but is not a mounted
session-transition claim. Public authoring remains dormant. Parent 7.3/7.4/9.2
remain incomplete.

Restored green (all exit 0):

```sh
# cwd apps/wbs/fe-01: 12 mounted tests passed, none skipped
TZ=UTC bunx vitest run src/components/wbs/optimization-retry-reconciliation.test.tsx --no-file-parallelism --maxWorkers=1
# cwd repository: selective configured unit target, 25 writer tests passed
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:test:unit --args='src/modules/plan-writer/plan-writer.test.ts'
bunx eslint apps/wbs/fe-01/src/components/wbs/optimization-retry-reconciliation.test.tsx apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts apps/wbs/fe-01/src/components/wbs/wbs-table.tsx
bunx tsc --build --force apps/wbs/fe-01/tsconfig.json
./node_modules/.bin/openspec validate --all --json
git diff --check
```

OpenSpec passed 268/268, including 250 specs and 18 changes. The direct frontend
typecheck did not run Nx's separate module prerequisite. The lint check covered
only the three changed TS/TSX files; it is not the full frontend lint gate.
Initial Nx without sandbox-safe daemon/plugin flags printed socket errors and
returned zero without running a target, so is not counted. Final logs are
`/tmp/puni-b4-{mounted,writer,lint,typecheck,openspec}-final.log`. Existing Vite
native-config advisory warnings remain. Normal lefthook hooks were installed
before committing; hooks were not bypassed.

### Saved history Slice B1 — endpoint extraction and schedule2 builder (2026-10-22)

Base: `a010b25a5`. Isolated clone: `/tmp/puni-converter-b`. This is a bounded
subpacket of Slice B, not completion of task 8.3. The production compose refusal,
`captureSharedPlan` callback, and active local/shared input8/schedule1 writers remain
unchanged.

Implemented:

- `createConnectedEndpointProjector` extracts the tree's captured endpoint labeling
  without invoking tree presentation or optimization views. The tree uses the same
  helper and shares its existing numbering cache with foreign-person labels.
- `buildConnectedScheduleBody` composes the ordinary calendar timing builder with
  required captured connection evidence, schedule2, and the single
  `CONNECTED_SCHEDULE_ALGORITHM_ID = connected-selection-v1:<SCHEDULE_ALGORITHM_ID>`.
  Historical component and target validators run before the body is returned.
- `serializeSavedConnectedScheduleBody` emits deterministic canonical bytes for the
  eventual shared save/current preparation path. Returned bodies are detached/frozen.

Fresh verification:

```sh
bun test libs/wbs/application/core/src/service/connected-endpoints.test.ts libs/wbs/application/core/src/service/connected-tree.test.ts libs/wbs/application/core/src/module/plan-document/connected-document.test.ts libs/wbs/domain/domain/src/saved-plan/versioned-schedule.test.ts libs/wbs/domain/domain/src/saved-plan/connected-history.test.ts libs/wbs/domain/domain/src/saved-plan/versioned-plan-input.test.ts libs/wbs/application/core/src/module/saved-plans/versioned-saved-plan-body.test.ts libs/wbs/domain/domain/src/saved-plan/canonical-plan-input.test.ts libs/wbs/domain/domain/src/saved-plan/normalise-plan-input.test.ts libs/wbs/domain/domain/src/saved-plan/diff-plans.test.ts
```

198 pass, 0 fail, 698 assertions across ten files. Output:
`/tmp/puni-b1-final-tests.log` (local scratch evidence). New endpoint tests cover
captured string codes and diagnostic row absence; existing tree/export tests cover
null codes, all selector scopes, incoming/outgoing labels, unavailable placement,
readiness and exact selected placement. The new builder tests use the existing
historical codec fixture with its synthetic calendar ordinals corrected in the
fixture adapter; they do not establish capture or writer lifecycle coverage.

Watched faults, restored individually before the green run:

| Injected fault                                     | Observed failing production primitive test                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Remove builder `validateSavedConnectedHistory`     | `refuses mismatched cross-body placement state`                                                                          |
| Remove builder `validateSavedConnectedTarget`      | `refuses target membership omissions before writer admission`; `refuses an anchor that would reinterpret captured dates` |
| Remove extracted undefined evidence refusal        | `refuses missing captured endpoint rows without live lookup` changes to an uncontextualized TypeError                    |
| Remove extracted null label refusal                | All three tree `refuses null endpoint ... evidence` cases fail                                                           |
| Replace canonical serializer with `JSON.stringify` | `serializes deterministic independent bytes after caller maps change`                                                    |

These are provisional primitive/tree-path proofs. None is claimed as a mounted
connected-save proof; Slice D must exercise required metadata/lookup failures in
actual save/current conversion and prove zero save effects.

`NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-core,wbs-domain --parallel=1`
ran core module typechecks and core typecheck successfully, but initially found a
readonly-array mismatch in the new domain test adapter. After explicitly copying
the capacity predecessor array, `NX_DAEMON=false bunx nx run wbs-domain:typecheck`
passed. The broader lint run passed `wbs-core:lint` and returned a nonzero
`wbs-domain:lint` without diagnostics; targeted ESLint exposed unsafe JSON member
access in the new serializer test. Replacing it with the historical reader fixed
the diagnostic. `NX_DAEMON=false bunx nx run wbs-domain:lint` then passed (41.5s),
and the final `wbs-domain:typecheck` rerun passed (4.6s). Prettier and
`git diff --check` passed. Nx used its documented in-process fallback because
plugin-worker sockets were denied in this sandbox; no check was skipped for it.
`./node_modules/.bin/openspec validate --all --json` passed all 268 items (250
changes, 18 specs), with existing requirement-length warnings.

Remaining B2 work: the detached `module/saved-plans/connected-history.ts` converter,
real migrated SQLite installed-live-store fixture, conversion of every explicit
observation/state/decision, restored public identities versus encoded decision
identities, range representability handling, required captured metadata guards,
and the full producer-state matrix. No new live read, scheduling, cache selection,
hashing, quota or writer integration is added by B1. Mounted D, immutable lifecycle
E, HTTP/UI summaries, CI secrets/migration checks and a canonical host gate are
unverified here. Task 8.3 remains unchecked.

#### B1 review correction — canonical idle-member order (2026-10-22)

Astra found that schedule2 serialization preserved the insertion order of
`connection.idleProjects`, although that collection is unordered. The new
`canonicalizes reversed idle members without changing stage execution order`
regression builds two valid empty connected A/B bodies with `['A','B']` and
`['B','A']` and initially failed on unequal canonical bytes (exit 1). The serializer
now bytewise-sorts a copied idle-member array. It preserves supplied stage
execution order and does not mutate the input body's idle-member order.

Watched fault: removing `.sort(compareHistoryKeys)` from the production schedule2
serializer failed that same regression (exit 1); restoring it returned green.
This is a serialization primitive proof; mounted connected-save coverage remains
pending in D. No new safety branch or writer activation was added.

```sh
bun test libs/wbs/domain/domain/src/saved-plan/versioned-schedule.test.ts libs/wbs/domain/domain/src/saved-plan/connected-history.test.ts libs/wbs/domain/domain/src/saved-plan/versioned-plan-input.test.ts libs/wbs/application/core/src/module/saved-plans/versioned-saved-plan-body.test.ts
NX_DAEMON=false bunx nx run wbs-domain:typecheck
```

Restored focused suite: 81 pass, 0 fail, 232 assertions across four files.
Typecheck: passed. `git diff --check`: passed. Test output is in local scratch
`/tmp/puni-b1-idle-correction-tests.log`. The previous B1 full-project checks are
recorded above; this correction reruns focused tests/typecheck and normal staged
lint/format hooks, not the canonical host gate. B2's detached converter and real
SQLite fixture remain deferred; task 8.3 stays unchecked.

## Saved comparison C1 pure projection (2026-10-22)

Bounded packet based on `2335bac3b50f9cc43d0b94ec1c471eecf798719e`, in isolated
`/tmp/puni-saved-comparison-c`. This is the dormant pure part of Slice C from
`/tmp/puni-saved-writer-next.md`; task 8.3 and the complete Slice C remain open.

`SavedComparisonSide` and `summarizeSavedComparisonSide` accept a resolved
`PlanSide` and its requested source. They retain schedule presence/absence,
legacy unknown provenance, explicit input9 local provenance, or captured
connected project labels, mode, placement state, idle labels and stage outcomes.
Ready summaries retain captured question hash, proof and actual chosen decision;
boundary infeasibility remains distinct from plan infeasibility and does not erase
a valid schedule. Exact canonical stage bytes and foreign pre-selection positions
come from `readSavedCanonicalStage`, never the final composite or live optimizer
view. Frozen detached summaries survive caller mutation. No store, scheduler,
directory, shelf or current-settings capability is accepted.

The public compare HTTP shape is unchanged. This helper is not called by the
production compare route yet. Writer/compose/current behavior and v8/v1 active
writers remain unchanged. The domain barrel now exposes the existing frozen
stage decoder and historical detachment helper to this application projection.

### Fresh checks

- TDD red: `bun test libs/wbs/application/core/src/module/saved-plans/saved-plan-comparison.test.ts`
  initially failed because the projection module did not exist (0 pass, 1 fail,
  1 module-load error). After implementation the frozen-output assertion also
  failed until the projection used historical detachment. Final focused run:
  **16 pass, 0 fail, 32 assertions**.
- `bun test libs/wbs/application/core/src/module/saved-plans/saved-plan-comparison.test.ts libs/wbs/application/core/src/module/saved-plans/versioned-saved-plan-body.test.ts libs/wbs/domain/domain/src/saved-plan/connected-history.test.ts libs/wbs/domain/domain/src/saved-plan/versioned-plan-input.test.ts libs/wbs/domain/domain/src/saved-plan/diff-plans.test.ts`:
  **115 pass, 0 fail, 325 assertions**.
- `bunx tsc --project libs/wbs/application/core/src/module/saved-plans/tsconfig.json --pretty false`:
  exit 0 after typed-fixture fixes.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:typecheck`:
  executed all 17 module checks and the forced project build; exit 0, 0/2 cache hits.
  The initial command without these environment variables exited 0 after socket
  refusal without running the target; that attempt is **not** passing evidence.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-domain:lint`:
  exit 0, 0/1 cache hits.
- Changed-file ESLint over both projection files and domain saved-plan barrel:
  exit 0 after resolving import-order and optional-chain diagnostics. Initial
  runs before Nx populated the graph skipped module-boundary rules; the final
  run had no skipped-rule warning.
- `./node_modules/.bin/openspec validate --all --json`: 268 items passed, 0 failed;
  existing long-requirement warnings remain.
- First `wbs-core:lint` attempt exited 1 after 46.2 seconds, without an ESLint
  diagnostic. It ran concurrently with module typechecks. This exit alone does
  not establish a resource cause or passing lint. Sequential retry recorded below.

### Watched pure-path faults — provisional until mounted

Nine independent mutations each produced exit 1 and a named failed test, then
were restored. Logs and exact observed failures are in
`evidence/task-8-comparison-projection/{mutations.json,*.log.txt}`.

| Injected fault                                                      | Observed failed projection test                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Remove missing project-label guard                                  | `refuses missing captured project labels rather than inventing them`                         |
| Remove missing row-label guard                                      | `refuses missing captured row labels rather than inventing them`                             |
| Remove missing step-label guard                                     | `refuses missing captured step labels rather than inventing them`                            |
| Omit foreign fixed members                                          | `retains captured context and exact stage boundaries when the diff is empty`                 |
| Substitute actual final composite offsets for pre-selection offsets | same empty-diff boundary test; B's later choice changes B after A observed it                |
| Relabel boundary terminal as plan infeasibility                     | `preserves boundary and plan terminal outcomes distinctly without losing a present schedule` |
| Infer local provenance for legacy input                             | `marks legacy input unknown while explicit input9 local stays local`                         |
| Remove frozen historical detachment                                 | `detaches summaries from caller changes and never needs live capabilities`                   |
| Substitute a generated hash for canonical bytes                     | empty-diff exact-boundary test                                                               |

These invoke the real pure production projector with captured fixture evidence;
they do **not** establish mounted read/compare/HTTP or real-save lifecycle proof.
The fixtures validate frozen stage/selection evidence, but their target HTTP
schedule payload is structural-only; no new mounted body-integrity claim is made.

### Explicitly deferred C2 and integration checks

- Update required `sides: {left,right}` server HTTP shapes, generated client types,
  frontend API/state and rendered compare/panel together. Preserve shelf names
  solely for pickers. No required field is optionalized by C1.
- Mounted complete SQL-injected equal saved/saved, unavailable/unavailable,
  legacy/connected, and saved-only comparisons with poisoned live capabilities
  and absent foreign projects. C1's signature excludes live capabilities but
  this is not a poisoned mounted-port test.
- Assert exactly one current capture for backend current/current and reuse its
  summary on both sides; ordinary saved/current stays v8/v1 until activation.
- Render empty-diff captured scope, fixed boundary, unknown legacy provenance,
  absent reason and scoped boundary-infeasible wording with preserved valid
  schedule and no history Retry action.
- Mount each fault individually: drop sides on empty diff, remove a fixed member,
  use final composite positions, label terminal whole-plan infeasible, and make
  a required summary field optional. Required generated-client/rendered tests
  and mounted label-guard negatives remain unverified.
- No frontend, controller/database, immutable-save lifecycle, build, secrets scan,
  migration lint or canonical host gate was run for this dormant pure packet.
  The integrator still owes `bin/h2puni-gate.sh <candidate-sha>` (or documented h4
  equivalent) and its printed actual SHA before claiming the feature complete.

Sequential lint retry after typechecks completed:
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint` executed the
whole core ESLint target and passed, exit 0, 39.5 seconds, 0/1 cache hits. The first
non-diagnostic failure is retained above rather than reclassified as passing.

## Connected cue B3 mounted unavailable-read prerequisite — 2026-10-22

Bounded continuation from `a010b25a5` in isolated `/tmp/puni-b3-mounted`; root
checkout files were not edited. `connected_optimization_presentation_unavailable`
remains unchanged. This packet does not enable connected schedule presentation.

The configured frontend suite now imports the existing runner-free producer
through a relative test import. Collection initially failed because the public
`@wbs/contracts` prefix alias swallowed its solver subpaths. Vitest alone receives
two specific solver entries before that prefix and the domain barrel after the
existing leaf entries. `vite-config.test.ts` verifies these three exact test-only
exceptions and retains complete production alias parity. Production Vite config
is unchanged. A single test-line Nx boundary exception allows the relative
producer import; no production boundary rule is widened. Test TypeScript paths include those imports, the domain leaves and
the scheduler port's plan-infeasible DTO; ES2023 library declarations cover the
actual producer graph's existing `toSorted`, without widening app compilation.

The 13 new cases exercise:

- Full generated-decoder body equality for real fractional Pri idle/pending/failed
  observations and mixed ready/terminal/pending/floor observations. B's 0.2→1.2
  slice and row schedule survive JSON. Captured C starts at 8 while final C's
  local start 4 under its Wednesday anchor is component start 6. These numerical
  assertions are producer/decoder evidence, **not mounted date/bar/span evidence**.
- Current real `httpProjectApi.tree` refuses these semantically valid connected
  packets and independently binds the URL project. Unknown state/evidence and
  correctly typed sibling objective/stage-byte mutations produce `invalid_response`
  before the presentation refusal. This bounded refusal oracle must be replaced
  with full adapter equality when the remaining enabling requirements close.
- Actual missing-calendar/required-engine trees, created with ordinary captured
  derivation and `presentConnectedTree`, cross the real HTTP adapter into
  `projectServicesOf` and mounted `WbsTableOverClient`. Table and cards preserve
  enabled name fields, unknown readiness and captured `A.010` stable navigation;
  render the precise refusal sentence; and offer no optimization cue, fabricated
  schedule bars/spans or Retry. Only unrelated catalog endpoints use the existing
  fake client. The HTTP tree route is never bypassed.

Watched negatives and restoration:

- With the new relative producer import and no solver alias, configured Vitest
  failed collection at `@wbs/contracts/solver/build-connected-request`. Adding the
  test-only aliases collected the real producer. No production alias was added.
- Fault: remove the production connected presentation guard alone from
  `src/lib/wbs-api.ts`, leaving URL binding and semantic decoding intact. Command
  (from fe-01): `TZ=UTC bunx vitest run src/components/wbs/connected-optimization-integration.test.tsx --no-file-parallelism --maxWorkers=1`.
  Observed **7 failed / 6 passed**: the seven valid producer reads resolved
  rather than refusing, while both mounted unavailable reads and four malformed
  packet refusals still passed. Restored the file byte-for-byte. Log:
  `/tmp/b3-mounted-guard-red.log`. No new production safety branch was added.
- Full changed-file lint initially rejected the cross-project relative import at
  the new test import. A single test-only `@nx/enforce-module-boundaries`
  suppression documents the runner-free producer boundary, retaining production
  import policy. This is the planned test import, not a production alias.
- The malformed packet assertions initially expected the wrong error label
  (`schema`); actual adapter failure is `invalid_response`. Corrected the test
  oracle. The first resize helper also attempted assignment to a read-only
  property after teardown; it now uses the suite's existing explicit viewport
  property definition before dispatching resize. Neither failed run is counted
  as a production regression proof.

Checks use the root workspace's installed `node_modules` through a clone-local
symlink, not a new frozen install. Nx uses `NX_DAEMON=false
NX_ISOLATE_PLUGINS=false`. The sandboxed configured frontend target stopped in
its node prerequisite without detailed output; running that exact node command
showed **1003 passed / 5 failed**, with existing subprocess tests rejected by
`spawnSync bun EPERM`. That is an unavailable sandbox check, not a green full
frontend run. An escalated configured target was requested to permit those Bun
subprocesses. One exploratory frontend invocation accidentally ran from the repo
root without its config (18 passed and one collection failure); it is excluded
from verification evidence.

Deferred: real connected tree adapter propagation and full adapter equality;
mounted fractional start/end/bar/card spans; mounted captured evidence versus
final placement; terminal unavailable selection and zero Retry HTTP calls across
reopen/refetch/remount; selected-ready/floor retention; failed-sibling current-hash
Retry; pending announcement; mounted enabling R5 mutations. B4 and its terminal
409/replacement-runtime/stale reconciliation proofs are independent work. Parent
7.3/7.4/9.2 and B3 enablement remain unchecked. Browser HintLayer/focus/phone
geometry, canonical clean host gate, required CI, installed solver runtime,
live admission/Retry authority and activation are unrun and unproven here.

Bounded checks restored green (exit 0):

```sh
# From apps/wbs/fe-01:
TZ=UTC bunx vitest run src/components/wbs/connected-optimization-integration.test.tsx vite-config.test.ts --no-file-parallelism --maxWorkers=1
TZ=Pacific/Auckland bunx vitest run --config vitest.zoned.config.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000
# From repo root; all Nx commands use NX_DAEMON=false NX_ISOLATE_PLUGINS=false:
bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts libs/wbs/domain/contracts/src/http/schema-shape.test.ts
bunx nx run wbs-fe-01:typecheck --outputStyle=stream
bunx nx run wbs-core:lint --outputStyle=stream
bunx nx run wbs-core:typecheck --outputStyle=stream
bunx eslint apps/wbs/fe-01/src/components/wbs/connected-optimization-integration.test.tsx apps/wbs/fe-01/vitest.config.ts apps/wbs/fe-01/vite-config.test.ts libs/wbs/application/core/src/testing/connected-optimization-view.fixture.ts
./node_modules/.bin/openspec validate --all --json
git diff --check
```

Counts: **31/31** targeted frontend tests in two files, including **13** new cases;
**5/5** Auckland tests in four files; **53/53** core/contracts tests with **414**
assertions; **268/268** OpenSpec items. The final frontend typecheck uses the
correct `plan-infeasible-dto.ts` test path; its initial attempt named a nonexistent
`plan-infeasible.ts` and failed. Changed TypeScript lint passes with the actual Nx
graph and the narrow documented test import exception. Core lint/typecheck ran
uncached. Formatting was checked on all seven changed paths. Logs use
`/tmp/b3-mounted-*`; targeted frontend green is `final-targeted-correct.log`, core
checks are `core-{tests,lint,typecheck}.log`, frontend typecheck is
`nx-typecheck-final.log`, changed lint is `changed-lint-restored.log`, and final
spec validation is `openspec-final.log`.

The required frontend lint target was rerun after the test import exception and
passed uncached (1m37s), log `fe-lint-final.log`; its earlier escalated run had
already read the pre-exception import and correctly failed that one boundary.
The escalated node tier reached **1007 passed / 1 failed**: the existing
`playwright-config.test.ts` shifted-auth Bun subprocess exceeded its 20 s budget
under concurrent checks (`unit-escalated.log`). Rerunning that test alone with the
same configured node runner passed **1/1** in 5.98 s, with 17 unrelated cases
filtered (`auth-recheck.log`). This selected pass does not itself make the full
configured target green. Build and browser execution remain unrun.

With the heavy checks finished, the full configured node command was rerun
unchanged and passed **1008/1008 tests in 79 files**, 23.19 s
(`unit-final.log`). The final selected frontend run, including exact unavailable
table start/finish `—` and card span `— → —`, passed **31/31**, 7.73 s
(`selected-final.log`). The earlier timed-out run remains a failed observation;
no timeout budget was changed. The full UTC jsdom command runs independently
because the original Nx target had stopped at its failed node prerequisite.

The complete configured UTC jsdom command finished green: **4479/4479 tests in
225 files**, 1156.07 s (`dom-full.log`). Final configured tiers are therefore
node **1008/1008**, UTC jsdom **4479/4479**, and Auckland **5/5**. The original
combined `nx run wbs-fe-01:test` invocation remains a failed historical run at
its node prerequisite; the three exact configured commands were then verified
individually. No aggregate-target success or canonical host gate is claimed.
The lengthy serial jsdom run was allowed to finish; active fresh workers were
confirmed while its reporter remained silent. All planned checks for this
bounded prerequisite now pass, with the enabling/deployment limits above.

The clone's normal lefthook pre-commit, prepare-commit-msg and commit-msg hooks
are installed; the local commit uses them. No push, merge or activation is part
of this packet. Independent review remains with the parent.

Normal commit hooks passed lint, format, plaintext secrets, private nesting and
agent message hooks. The tool-wiki hook returned `inactive`, `certified:false`
because its external activation root is not provisioned; this is not Tool Wiki
certification. Both migration hooks and doc-caps skipped because no matching
migration or LLM_README paths were staged. Hook log: `commit.log`.

### Task 8.3 saved-history B2 bounded detached converter (2026-10-22)

Workspace `/tmp/puni-b2`, isolated clone from exact `faa4056b79c3b9a174a24027f5c4ef180e3fd4da`. The installed writer still emits v8/v1 and compose still refuses connected saved capture. No push, merge, gate, deployment or activation is claimed. Existing dependencies are reused through a node_modules symlink; no dependency update was made.

Implemented the pure `captureConnectedHistory` preparation from one detached `LivePlanRead.connected`. It retains component projects, complete authored selectors and labels, authored graph/ownership, statuses/readings/causes/intrinsic/eligibility, explicit unavailable placement, exact stage canonical bytes, observation configuration without generation, both objective outcomes, encoded decision identities and public component placement. The B1 metadata identity check moved into its endpoint helper module and is shared with the tree projector. The production historical builders validate both new bodies before returning them. CalendarRangeError from dated timing conversion resolves both input state and schedule absence together.

The optimized displacement case exposed a dormant codec mismatch: `encodeSavedPlacement` refused legitimate `boundBy: 'optimizer'` values in selected composite and decision schedules. The reserved schedule2 placement schema now accepts that existing live discriminator (target schedule2 already accepted it). No published writer version or algorithm changed.

TDD: the new converter test initially failed because the function was absent; an explicit throwing stub then produced 0 pass/3 fail with “connected history conversion is not implemented”. The first full ready-displacement conversion failed with TraversalError for `boundBy: optimizer`; adding that discriminator made the case pass. The migrated fixture initially exposed a wrong SQL fixture assumption (abbreviation belongs in project_abbreviation) and held rows being excluded from placement; setup was corrected to use allocated abbreviations and a separate held cause. Those setup failures are not production proof.

Fresh verification:

- `bun test libs/wbs/application/core/src/module/saved-plans/connected-history.test.ts apps/wbs/be-01/src/service/saved-plan-connected.test.ts libs/wbs/application/core/src/service/connected-tree.test.ts libs/wbs/application/core/src/service/connected-endpoints.test.ts libs/wbs/domain/domain/src/saved-plan/connected-history.test.ts libs/wbs/domain/domain/src/saved-plan/versioned-schedule.test.ts libs/wbs/application/core/src/module/saved-plans/versioned-saved-plan-body.test.ts`: **129 pass, 0 fail, 304 assertions**. The migrated SQLite fixture captures the installed owned live store in isolated and shared modes, closes the snapshot and deletes the database before conversion; asserts A.design → B.build → A.test with differing anchors, fractional target start 1.75, actual string codes, three component relationships including outgoing and held-cause evidence, exact retained bytes, and independence from later map mutation.
- `bunx tsc --noEmit -p libs/wbs/application/core/src/module/saved-plans/tsconfig.json --pretty false`: exit 0.
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false`: exit 0. An earlier attempted tsconfig.app.json path does not exist and was corrected; it provides no verification.
- Scoped eslint initially found import sorting and unnecessary optional chaining; corrected. Its first run reported the Nx module-boundary rule skipped because the isolated clone lacked a cached graph; final hook/check evidence follows below.

Watched faults in the production pure converter, restored after each:

1. Remove `requireCaptured` nullish refusal: **10 pass/2 fail**. Missing status changed the required contextual error into `saved history json_required`; missing ready candidate became null.question TypeError. This establishes contextual fail-fast behavior, not a mounted save-side-effect proof.
2. Replace retained canonical stage bytes with `{}`: **4 pass/8 fail**, frozen stage-shape refusal including the retained-boundary case.
3. Force selected objective null: **11 pass/1 fail**, optimized displacement rejected selected-objective mismatch.
4. Encode baseline as the composite: **11 pass/1 fail**, optimized displacement rejected retained stage-boundary inconsistency.
5. Rethrow CalendarRangeError instead of modeled recovery: **11 pass/1 fail**, coherent input-state/schedule-absence test observed the injected range error.

After restoration the combined seven-file run above returned 129/0. These are converter/codec production-path proofs only. Mounted save/current failure proofs remain pending for activation slice D.

This is a bounded B2 prerequisite, not completion of B2 or task 8.3. Pending: real SQLite mixed Fast/optimized cache-ready displacement and later foreign-boundary changes; node/whole/descendant-step fixture breadth; public-versus-encoded person/team/resource identities; quantisation-floor selected baseline and ready-unselected sibling matrix; engine/cycle/range and nonempty-idle-member breadth; complete metadata/read-fact contradiction coverage and production guard proof matrix; deterministic bytes under reordered multi-slice candidate maps; the common final serializer/save/current integration and immutable lifecycle/HTTP/UI proofs. The range recovery case injects CalendarRangeError at the production builder dependency; actual out-of-range SQLite capture is not claimed. Full Nx/host gate, secrets/migration lint, external runtime activation and deployment were not run.

Additional fresh B2 verification: `bun test apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts` returned **95 pass, 0 fail, 523 assertions** (40.33s), including ordinary save/current and mounted historical integrity regressions. After `NX_DAEMON=false bunx nx show project wbs-core --json` populated the isolated graph, scoped eslint returned exit 0 without skipped-rule warnings. Repeated core module and be-01 spec typechecks returned exit 0. `openspec validate cross-project-dependencies --json` returned valid (1 passed/0 failed) with nine existing long-requirement warnings; this is scoped validation, not the all-change gate.

Normal hooks were installed with `bunx lefthook install`. The first commit attempt correctly failed its formatting check after import sorting changed the test file; Prettier corrected that file before retry. The tool-wiki hook reports inactive (external activation root not provisioned), so its exit does not establish certification. No hook was bypassed.

#### B2 review correction — foreign fact consistency and candidate order (2026-10-22)

Astra's Important finding reproduced against the real migrated fixture: metadata
for foreign a2/b could claim `hold: on_hold` while its captured read and readiness
retained the original null hold. The converter now checks every captured member's
historical overlaps before selection/conversion: project name, abbreviation,
anchor, engine/objective/enabled; row name, parent, position, frozen number and
hold; and step code, name and position. Identity/ownership checks remain shared
with the tree projector. Contradictions throw modeled `SavedHistoryError` with
`metadata_facts` and the precise member/field path. No metadata is repaired or
substituted, and no IO or scheduling was added.

Fourteen independently corrupted foreign project/row/step facts in the detached
migrated SQLite fixture initially produced **2 pass/14 fail**. The new guard
returned **16 pass/0 fail**. Watched removal of its equality refusal again produced
**2 pass/14 fail**: thirteen malformed captures were accepted, and the dangling
parent case threw an unmodeled root-reachability error. Restoring the guard
restored the modeled refusal. The adjacent Proof comment records this distinction.

The Minor finding reproduced with two ready multi-slice candidates: reversing
both captured start maps while keeping all facts/decisions unchanged produced
unequal saved schedule bytes (**12 pass/1 fail**). The converter now bytewise-sorts
a copied candidate start entry array. It retains exact stage order and bytes and
leaves the caller's map intact. Watched removal of sorting reproduced that one
failure; restoration returned green. This is deterministic serialization evidence,
with no new safety branch.

Fresh verification after both faults were restored:

- The same seven-file B2 suite listed above: **144 pass/0 fail, 333 assertions**.
- `bunx tsc --noEmit -p libs/wbs/application/core/src/module/saved-plans/tsconfig.json --pretty false`: exit 0.
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false`: exit 0.
- Scoped ESLint on the converter and both changed test files: exit 0, no diagnostics or skipped-rule warning.
- `openspec validate cross-project-dependencies --json`: valid, exit 0, existing requirement-length warnings.

Local scratch logs: `/tmp/puni-b2-review-{facts-fault,order-fault,restored-tests,core-types,be-types,eslint,spec}.log`.
The ordinary schema constant remains 8, ordinary schedule builder remains v1,
and compose retains its connected-capture refusal. These changes stay within the
dormant bounded B2 packet. The remaining B2 producer matrix and mounted D/E
proofs listed above remain pending. Full Nx/host gates, build, all-change spec
validation, secrets/migration checks, external activation and deployment were not
run for this correction. Normal commit-hook outcome follows below.

Normal pre-commit hooks passed format, lint, plaintext-secrets and private-nesting;
prepare-commit-msg passed agent attribution. Tool-wiki explicitly reported inactive
and uncertified because its external activation root is not provisioned. Migration
hooks and doc-caps skipped because no matching files were staged. No hook bypass
was used. `git diff --check` passed before commit.

#### B2 detached converter matrix and real durable cache producer corrections (2026-10-22)

The bounded matrix now uses the existing migrated SQLite fixture through the
installed `createLivePlanStore` capture path, closes all connections and removes
the database before historical conversion. Fixture-only options seed persisted
facts, prepare real durable optimizer cache rows and provide a controlled Fast
placement with valid pinned starts. No solver child process is run: feasible wire
responses are constructed in the fixture, checked by `encodeConnectedSuccess`,
persisted in `optimized_schedule_cache`, then read through the installed private
connected captured reader. Cache questions are prepared in execution order so the
second member's actual question retains the first member's selected movement.
This is cache/selection/converter fidelity evidence, not a solver optimality proof.

New real SQLite cases establish:

- Both isolated and shared mode retain mixed optimized/Fast stages: a1 moves from
  common-axis start 3 to 0 while a2 keeps its Fast start 8 despite a ready cache.
  The later a2 stage retains a1=0; the earlier a1 stage retains a1=3. Target a1 test
  starts at 0.5, while a2's own-anchor start is 7 rather than common-axis 8.
- Public person identity survives target/baseline/composite projection; the ready
  decision keeps encoded isolated person identity (shared people retain their
  public identity). Stage bytes retain encoded project-local team/resource IDs.
- A Time quantisation-floor observation selects its baseline, independently of a
  ready unselected Pri sibling whose decision chooses its candidate on a priority
  tie. Ready state does not imply optimized Time placement.
- Original parent/step identities and labels survive node, whole and
  descendant-step endpoints. A nonempty held a2 member stays in input history and
  idleProjects without a synthetic optimization stage.
- Real SQLite engine-unavailable, authored scheduling cycle and large-estimate
  calendar-range cases produce matching explicit input state and absent reason;
  all three authored relationships remain available in history.

Two producer defects were exposed and corrected before these captures could
reach the dormant converter. The stored-stage encoder spread captured metadata
and relationship ownership into closed DTOs; it now explicitly projects only the
DTO's row and relationship facts. The connected cache reader reconstructed a
candidate from the chosen schedule, losing a rejected candidate when publication
kept baseline; it now copies the already validated original candidate starts.
This preserves the original decision on the selection replay.

Watched production-path negatives, each restored afterward:

- Replacing explicit row projection with the old row spread made three real SQL
  ready cases fail with forbidden captured metadata fields (3 pass/3 fail in the
  SQL-filtered six-case run).
- Replacing explicit relationship projection with the old relationship spread
  made the same three cases fail with forbidden relationship.projectId
  (3 pass/3 fail).
- Reconstructing candidate starts from decision.schedule made the SQL floor case
  fail: retained Time decision became optimized instead of baseline
  (5 pass/1 fail). Adjacent Proof comments name these observations.

Fresh restored verification:

- Eleven-file focused suite: `saved-plan-connected.test.ts`, contracts
  `connected-durable.test.ts`, SQLite `connected-optimization-reader.test.ts`,
  `captured-scheduler.db.test.ts`, `connected-optimization-cache.db.test.ts`, core
  `connected-history.test.ts`, `connected-endpoints.test.ts`, domain
  `connected-history.test.ts`, `versioned-schedule.test.ts`,
  `versioned-plan-input.test.ts`, core `versioned-saved-plan-body.test.ts`:
  **201 pass/0 fail, 1394 assertions**.
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false`,
  `bunx tsc --noEmit -p libs/wbs/adapters/store-sqlite/tsconfig.lib.json --pretty false`
  and `bunx tsc --noEmit -p libs/wbs/domain/contracts/tsconfig.spec.json --pretty false`:
  exit 0.
- Store spec typecheck remains unverified as a whole: its attempted execution
  reported an unrelated existing `import-dependencies.db.test.ts:190` mock missing
  `TypedDependencyStore.hasDeletingEndpoint`. No unrelated test was changed.
- `openspec validate --all --json`: exit 0, **268 passed/0 failed**
  (250 changes and 18 specs), existing requirement-length warnings remain.

Scratch logs are `/tmp/puni-b2-matrix-{tests,types,spec}.log`,
`/tmp/puni-b2-matrix-{row-spread,relationship-spread,floor-candidate}-fault.log`.
The first scoped lint run found import ordering and an unnecessary optional
chain; final lint, format and normal-hook evidence is recorded below.

This advances the prior pending B2 list; task 8.3 remains unchecked. Complete
team/resource capacity-binding restoration in saved decision placements (beyond
encoded stage inputs), the complete metadata/read-fact contradiction matrix,
mounted save/current guard failures, immutable save lifecycle, common final
serialization, comparison HTTP/UI and the canonical host gate remain pending.
No full Nx/host gate, build, independent CI secrets/migration scan, activation or
deployment was run. Active save/current remain v8/v1 and compose retains its
connected refusal; the new converter still has no production writer caller.

Final scoped ESLint on the four changed TypeScript files returned exit 0 without
diagnostics. Prettier checked all six owned files with exit 0. After the lint-only
import/optional-chain corrections, the real SQL capture suite returned
**24 pass/0 fail, 98 assertions**. `git diff --check` returned exit 0. Normal
lefthook hooks were installed in this isolated clone; none were bypassed.

## Saved comparison C2 bounded backend/HTTP (2026-10-22)

Base: C1 `4e96371f343d5d5115c636a62bb31f91d9061537`; isolated clone
`/tmp/puni-c2-backend`. Required `left`/`right` summaries now travel from the
frozen C1 projector through service outcomes and the comparison HTTP shape.
The generated document requires both summaries even for empty diffs. A
current/current comparison reuses one resolved current side. Active ordinary
writers remain input8/schedule1 and compose still refuses connected capture.

TDD: `bun test libs/wbs/domain/contracts/src/http/saved-plan-shapes.test.ts
apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts` first reported
98 pass / 4 fail. The failures were missing connected/unavailable summaries,
two current captures instead of one, and a schema accepting absent summaries
(`/tmp/c2-red.log`). Additional mounted cases cover later-stage displacement
and a boundary-infeasible sibling while the selected schedule stays present.

Watched production faults, restored individually:

| Injected fault                                                      | Observed failing path                                                                  | Evidence                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Omit HTTP left summary                                              | Equal stored connected history returns 500 instead of 200                              | `/tmp/c2-fault-omit-side.log`                         |
| Skip every foreign boundary member                                  | Equal stored connected history loses B's captured interval                             | `/tmp/c2-fault-omit-fixed-member.log`                 |
| Replace retained starts/finishes with final composite positions     | Mounted later B displacement shows 3→5 instead of captured 1→3                         | `/tmp/c2-fault-final-position.log`                    |
| Relabel boundary-infeasible as plan-infeasible                      | Mounted boundary objective returns 500 instead of its preserved valid-schedule summary | `/tmp/c2-fault-terminal-label.log`                    |
| Make required left or right optional                                | Production response-schema validation accepts an omitted side                          | `/tmp/c2-fault-optional-{left,right}.log`             |
| Make boundary fixed/canonical/originOrdinal optional, one at a time | Mounted malformed-summary case returns 200 instead of 500                              | `/tmp/c2-fault-optional-{fixed,canonical,origin}.log` |
| Resolve current/current independently again                         | Mounted current/current observes two captures                                          | `/tmp/c2-fault-double-current-capture.log`            |
| Force a current read before saved-only comparison                   | SQLite saved-only comparison throws from its poisoned live capability                  | `/tmp/c2-fault-live-read.log`                         |

Each named fault run reported 0 pass / 1 fail. Optional top-level fields were
proved at the production schema validator: the mounted route writes explicit
undefined for malformed service output, which ArkType still rejects even when
the property is optional. Nested boundary omissions were proved through the
mounted HTTP response validator. C1's defensive missing-label guard mutations
remain pure/provisional; this packet does not relabel them as mounted proofs.

Saved-only service comparison uses real migrated SQLite with complete injected
v9/v2 records and no live B project. The installed local capture connection,
shared live capture, scheduler read/support/resolved-Fast, clock and ID
capabilities all throw. Mounted HTTP covers equal connected, equal unavailable,
legacy↔connected, exact boundaries, terminal scope and malformed required
summaries; it preserves the existing target authorization read.

Validation limitations and recovery: the initial directory-pattern Bun command
collected freshly emitted `dist/out-tsc` test copies after typecheck (201 source
tests passed; five emitted-JS alias import errors). The replacement uses explicit
`./` source file arguments. Initial Nx socket access was denied by the sandbox;
subsequent Nx commands use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. A broad
three-project lint attempt reported a contracts nonzero exit without diagnostics
and was interrupted while continuing to the next project (exit 130). A combined
owned-file lint was also interrupted to release memory; sequential file-scoped
checks supersede those attempts. The first backend typecheck found a test-double
Scheduler missing `readResolvedFast`; the corrected retry passed.

Deferred: frontend API/state/rendered provenance and generated-client use,
remaining B2/D lifecycle matrix, connected save/current writer activation,
canonical h2puni/h4claw gate, CI secrets/migration checks and full build. No push,
merge, deploy, participant fencing or runtime activation was performed. Task
8.3 remains open.

Final C2 backend evidence:

- `bun test ./libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.test.ts ./libs/wbs/application/core/src/module/saved-plans/saved-plan-comparison.test.ts ./libs/wbs/application/core/src/module/saved-plans/connected-history.test.ts ./libs/wbs/application/core/src/module/saved-plans/module.test.ts ./libs/wbs/application/core/src/module/saved-plans/versioned-saved-plan-body.test.ts ./libs/wbs/domain/contracts/src/http/saved-plan-shapes.test.ts ./apps/wbs/be-01/src/service/saved-plan-read.db.test.ts ./apps/wbs/be-01/src/service/saved-plan-current.db.test.ts ./apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts ./apps/wbs/be-01/src/controller/saved-plan-organization.controller.db.test.ts`: 201 pass / 0 fail; 896 assertions, 10 source files (`/tmp/c2-tests-clean.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-contracts,wbs-core,wbs-be-01 --parallel=1`: contracts/core and both module targets passed; backend initially failed the test-double omission documented above (`/tmp/c2-typecheck-final.log`). `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck --outputStyle=static` then passed both backend targets (`/tmp/c2-be-typecheck.log`).
- `bunx eslint libs/wbs/domain/contracts/src/http/saved-plan-shapes.ts libs/wbs/domain/contracts/src/http/saved-plan-shapes.test.ts`: exit 0 (`/tmp/c2-contract-lint2.log`). `bunx eslint libs/wbs/application/core/src/module/saved-plans/saved-plan-values.ts libs/wbs/application/core/src/module/saved-plans/saved-plans.feature.ts libs/wbs/application/core/src/module/saved-plans/saved-plan-comparison.ts libs/wbs/application/core/src/http/saved-plan.routes.ts`: exit 0 (`/tmp/c2-core-lint.log`).
- `./node_modules/.bin/openspec validate --all --json`: 268 valid / 0 failed; existing advisory warnings retained (`/tmp/c2-openspec-final.log`).
- `git diff --check`: exit 0.
- Backend changed-file lint initially found test-only unsafe JSON/matcher values, import ordering and an unnecessary async arrow. After explicit summary typing, ordinary string-array assertions and import sorting, `bunx eslint --fix apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts apps/wbs/be-01/src/service/saved-plan-read.db.test.ts` exited 0 (`/tmp/c2-backend-lint2.log`).
- Post-lint focused rerun: `bun test ./apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts ./apps/wbs/be-01/src/service/saved-plan-read.db.test.ts ./libs/wbs/domain/contracts/src/http/saved-plan-shapes.test.ts --test-name-pattern 'reads complete connected history|frozen connected SQL|generated comparison document'`: 3 pass / 0 fail (`/tmp/c2-post-lint-tests.log`).

### C2 review correction: shared frontend fixtures (2026-10-22)

Astra High identified the required shared reply's two outdated frontend fixtures.
A fresh `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
wbs-fe-01:typecheck --outputStyle=static` reproduced TS2739 at
`project-page.test.tsx:363` and `saved-plans-panel.test.tsx:54` for absent left/right
(`/tmp/c2-fe-red.log`). Both fixtures now provide explicit legacy provenance,
requested source and schedule presence/reason. This corrects fixture compatibility;
rendered historical provenance/state consumption remains the next slice.

The same Nx frontend typecheck then passed (`/tmp/c2-fe-green.log`).
`TZ=UTC bunx vitest run src/lib/saved-plan-api.test.ts
src/components/wbs/saved-plans-panel.test.tsx
src/components/wbs/project-page.test.tsx --no-file-parallelism --maxWorkers=1`
from `apps/wbs/fe-01` passed 150/150 tests in all three files
(`/tmp/c2-fe-tests.log`). Changed-file ESLint passed for those three files
(`/tmp/c2-fe-lint.log`).

The new browser-client production-path test preserves both empty-diff summaries
and refuses either omitted side. Making the shared shape's left or right
optional, one at a time, made this test receive success instead of invalid_response:
0 pass / 1 fail in each fault run
(`/tmp/c2-fe-fault-optional-{left,right}.log`). This extends the C2 top-level
required-field proofs through the generated browser client. Both mutations were
restored. No active writer or frontend runtime behavior changed.

## B3 bounded connected presentation (2026-10-22)

Isolated clone `/tmp/puni-b3-presentation-20261022`, based on prerequisite
`49d90415e`. Production changes only remove the temporary
`connected_optimization_presentation_unavailable` refusal; the existing precise
local/connected union already carries the complete scope, states, certificate,
finish figures and order relations. URL project binding and generated decoder
validation remain required. No scheduling, question reconstruction or fallback
packet is introduced in the frontend.

The producer integration suite now compares the complete optimization packet
from actual mixed and fractional captures with `httpProjectApi.tree`, then
crosses `projectServicesOf` and the installed project runtime into
`WbsTableOverClient`. It asserts real B bar attributes `0.2` and `1.2`, table
5/6 October dates and phone span/calendar facts. A's cue exposes captured fixed
C start 8/finish 9 while separately mounted C's final bar starts at local day 4,
which is common day 6 under its Wednesday anchor. Both selected-ready and
quantisation-floor observations remain displayed, with the latter explicitly
retaining its baseline. Floor C starts at local day 6; this is not the ready
placement.

Watched red/negative observations:

- Before removing the presentation refusal, the expanded integration suite
  failed **10** cases, with **6** passing. The real HTTP equality reads rejected
  with `connected_optimization_presentation_unavailable` and the mounted
  scheduled rows could not appear. Log: `/tmp/b3-presentation-red.log`.
- Bypassing only the URL project binding made all four mixed-producer
  foreign-project assertions fail because the promise resolved instead of
  refusing. Restored the predicate and retained adjacent `Proof:` evidence.
  Log: `/tmp/b3-presentation-mismatch-negative.log`.
- Initial green attempts exposed two incorrect test expectations: the calendar
  card fact intentionally prints ISO dates rather than fractional offsets, and
  the Time schedule's accessible label is Finish-first. Corrected those test
  oracles; those failed attempts are not claimed as regression proofs.

Bounded checks (all Nx commands set `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`):

```sh
# apps/wbs/fe-01:
TZ=UTC bunx vitest run src/components/wbs/connected-optimization-integration.test.tsx src/components/wbs/optimization-cue-reading.test.ts src/components/wbs/optimization-cue.test.tsx src/components/wbs/optimization-integration.test.tsx src/lib/wbs-api.test.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000
TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/wbs/optimization-cue-reading.test.ts src/modules/project/composition.test.ts src/modules/plan-feed/plan-feed.feature.test.ts src/modules/plan-feed/plan-feed.resource.test.ts --testTimeout=30000 --hookTimeout=30000
# repo root:
bunx nx run wbs-fe-01:typecheck --outputStyle=stream
bunx nx run wbs-fe-01:lint --outputStyle=stream
./node_modules/.bin/openspec validate --all --json
```

Selected UTC frontend: **205/205** in five files, including **16** producer
integration cases (**3** newly mounted scheduled cases). Node adapter/cue:
**74/74** in four files. Logs: `/tmp/b3-presentation-selected.log` and
`/tmp/b3-presentation-node.log`. An exploratory node-config invocation selecting
`wbs-api.test.ts` found no files (exit 1); that file belongs to the UTC jsdom
configuration and passed in the selected run above. Vite prints its existing
native config-loader migration warning. Dependencies use a clone-local symlink
to the workspace's existing installation; no frozen install is claimed.

Full frontend aggregate, Auckland tier, build, browser HintLayer/focus/phone
geometry, canonical clean host gate, required CI, installed solver runtime,
live admission/Retry authority and activation are unrun for this bounded slice.
Terminal selection/zero-Retry across reopen/refetch/remount, failed-sibling
current-hash Retry, mounted pending announcements and enabling R5 mutations
remain separate B3 work. B4 remains open. Reading connected packets does not
activate external authoring, connected production reads or deployment. Parent
7.3/7.4/9.2 and full B3 remain unchecked.

The initial configured lint failed without forwarding source diagnostics; direct
changed-file ESLint identified one `no-confusing-void-expression` test callback.
Added braces around its assertion. A concurrent attempt to repeat the same Nx
lint target was rejected as recursive task invocation; it is not counted as a
completed lint check. Typecheck passed uncached (both module/app tasks), and
OpenSpec validation passed **268/268** before and after the evidence updates.

After the test callback fix, selected UTC frontend remains **205/205**
(`/tmp/b3-presentation-selected-final.log`), and changed TypeScript ESLint passes
(`/tmp/b3-presentation-changed-lint-final.log`). Changed-path Prettier and
`git diff --check` also pass. The clone installed normal hooks via
`bunx nx run tool-git-hooks:install`; no hook bypass is used.

Final configured frontend lint passes uncached in 1m30s
(`/tmp/b3-presentation-lint-final.log`); executing the exact configured ESLint
command directly also exits 0 (`/tmp/b3-presentation-lint-direct.log`). The
earlier failed configured runs read the pre-fix callback and remain failed
observations. Final OpenSpec validation passes **268/268**. These bounded
checks do not stand in for the unrun canonical host gate or full frontend suite.

## B3 producer-mounted HTTP action proof follow-up (2026-10-22)

Independent review held the preceding presentation-enabling commit because its
mounted services still used fake action methods and both ready/floor producer
variants were ready. This follow-up retains the same isolated clone and adds
seven producer-mounted cases. `serveActions` delegates `tree`,
`retryOptimization` and `setOptimizationSettings` to `httpProjectApi`; its
fetch boundary records method, path and decoded body before replying. Other
unrelated methods keep the existing fake API. No production behavior branch
changes in this follow-up; protected production branches gain watched proofs.

The real fractional producer accepts an explicit controlled fixture identity
for two successive authoritative reads; its preparation/classification still
creates the terminal certificate. At desktop and phone widths, terminal Time
is unavailable by click, Enter and Space after arrow navigation. Reopening,
refetching a new captured question and remounting with a newly observed GET
leave **zero non-GET requests**, hence neither Retry POST nor settings PATCH.
Real B dates remain 5/6 October. With failed Pri, only Retry Pri is present and
one real HTTP POST sends `{objective:'pri',inputHash:'current-connected'}` to
`/api/projects/B/optimization/retry` after the updated question is rendered.
There is no Time Retry or settings PATCH.

A new mixed producer controlled-outcome state retains ready selected Time
while Pri carries its own terminal question, not Time's question. Both table
and phone retain Time's name, scoped comparison, 5 October placement, and
captured C start 8/finish 9. They explicitly reject the accessible claim that
Fast is retained. The initial phone oracle expected a 6 October finish; the
actual selected first slice finishes exactly on the day boundary, so its
inclusive calendar span is 5 October → 5 October. Corrected that test oracle;
this was not a production regression proof. Pending Pri beside terminal Time
announces `Optimizing`, keeps its solving dot, evidence and actual dates.

TDD observations: before adding fixture hash control and the mixed sibling
outcome, **6 failed / 17 passed** (`/tmp/b3-actions-red.log`): refetch facts kept
the old identity, and the unsupported sibling fixture could not decode. The
pending and initial terminal action assertions already passed against the
production behavior. The following independent runtime faults prove those
safety assertions can break; each edit was restored before the next:

| Fault injected into production                                                      | Matching mounted test filter  | Observed failure                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| Add `boundary-infeasible` to `cueReading.retryable`                                 | `suppresses terminal HTTP`    | 2 failures: forbidden Retry Time appears                                          |
| Permit terminal state in `variantRow` ready selection arm                           | `suppresses terminal HTTP`    | 2 failures: terminal menu item loses `aria-disabled=true`                         |
| Drop scope in `httpProjectApi.tree` after decoding                                  | `retains selected ready Time` | Original run hit `fake_invalid_response`; superseded by plain-adapter proof below |
| Substitute empty slices in `chartReadOf`                                            | `mounts fractional Fast`      | 1 failure: no bar with start 0.2/finish 1.2                                       |
| Read fixed starts from final `placement.combined` in `projectConnectedOptimization` | `retains selected ready Time` | 2 failures: captured C start 8 becomes final 6                                    |

Every fault ran the production producer/decoder/mounted integration suite with:

```sh
# apps/wbs/fe-01, filter from the table above:
TZ=UTC bunx vitest run src/components/wbs/connected-optimization-integration.test.tsx -t '<filter>' --no-file-parallelism --maxWorkers=1
```

Logs in the same table order: `/tmp/b3-actions-fault-{retry,selection,scope,positions,captured}.log`.
Each exited 1. Review found the original scope fault was intercepted by the
fake API proxy with `fake_invalid_response`, so that run does **not** prove
mounted scope forwarding. The other four faults reached their stated mounted
assertions. The corrected scope proof below replaces that invalid attribution.
Adjacent `Proof:` comments name the mounted failures at
selection, Retry, HTTP scope forwarding, chart slice forwarding and core
captured-position projection. The core and frontend state/identity contracts
remain unchanged.

Final bounded check commands (all Nx commands set `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`):

```sh
# apps/wbs/fe-01:
TZ=UTC bunx vitest run src/components/wbs/connected-optimization-integration.test.tsx src/components/wbs/optimization-cue-reading.test.ts src/components/wbs/optimization-cue.test.tsx src/components/wbs/optimization-integration.test.tsx src/components/wbs/optimization-retry-reconciliation.test.tsx src/lib/wbs-api.test.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000
# repo root:
bun test libs/wbs/application/core/src/service/connected-optimization-view.test.ts
bunx nx run wbs-fe-01:typecheck --outputStyle=stream
bunx nx run wbs-fe-01:lint --outputStyle=stream
bunx nx run wbs-core:typecheck --outputStyle=stream
bunx nx run wbs-core:lint --outputStyle=stream
./node_modules/.bin/openspec validate --all --json
```

This closes the bounded B3 presentation enabling action-proof gap; it does not
prove real backend Retry admission or terminal 409 authority. The existing
internal-service reconciliation suite is included as a regression, while B4's
full producer/HTTP 409, replaced-runtime and stale proofs remain distinct.
Full frontend aggregate, Auckland tier, browser HintLayer/focus/phone geometry,
canonical clean host gate, required CI, installed connected solver runtime,
production connected reads, external authoring and activation remain unrun and
unproven for this packet. Dependencies still use the clone-local symlink to the
workspace installation. Parent 7.3/7.4/9.2 and full Slice B stay unchecked.

Restored checks: selected UTC **224/224** in six files
(`/tmp/b3-actions-selected.log`); final producer integration **23/23**, including
the new remount GET assertion (`/tmp/b3-actions-integration-final.log`); core
view **33/33** with **320** assertions (`/tmp/b3-actions-core-tests.log`).
Frontend typecheck passed both module/app tasks uncached; core typecheck passed
both module/app tasks uncached; core lint passed uncached. Logs:
`/tmp/b3-actions-{fe-typecheck,core-typecheck,core-lint}.log`. OpenSpec passed
**268/268** (`/tmp/b3-actions-openspec.log`), and changed-path Prettier plus
`git diff --check` passed.

The first full frontend lint run failed without forwarding source diagnostics.
Focused changed-file ESLint identified one import-sort error in the new test;
its focused autofix passed (`/tmp/b3-actions-import-fix.log`). The failed run
remains a failed observation. A full frontend lint retry was deferred while the
parent's large normal hook occupied the memory-constrained shared host; no
already-running checks were stopped and no check budget was increased.

After the shared host's heavy hook completed, final configured frontend lint
passed uncached in **1m31s** (`/tmp/b3-actions-fe-lint-final.log`). Final OpenSpec
validation remained **268/268** (`/tmp/b3-actions-openspec-final.log`); all eight
changed paths passed Prettier and `git diff --check`. The follow-up commit uses
the clone's already installed normal pre-commit, prepare-commit-msg and
commit-msg hooks, with no bypass. Independent re-review remains with the parent.

The first normal pre-commit rejected a late fixture JSDoc `@param` tag because
it documented only the second parameter. Replaced the isolated tag with prose
on the symbol; no signature or behavior changed. This is a failed hook
observation, not a bypass. The normal hook is rerun for the final commit.

## B3 R5 scope-forwarding proof correction (2026-10-22)

Review identified a real proof-path defect: assigning HTTP methods onto
`fakeProjectApi()` still invokes that fake's response-validation proxy. The
original `/tmp/b3-actions-fault-scope.log` contains `fake_invalid_response`;
its failure cannot establish that missing scope reached presentation. The
historical table and assertion above are corrected rather than retaining the
incorrect claim that every fault bypassed alternate boundaries.

`serveActions` now creates a **plain object** by spreading the unrelated fake
operations and directly binding `tree`, `retryOptimization` and
`setOptimizationSettings` to the HTTP client. The three selected
operations do not run through the fake proxy. HTTP decoding still occurs once
at the real generated-client boundary. The selected-ready sibling cases now
assert two editable rows, absence of response-error text and the active Time
pill **before** obtaining the cue by its general active-schedule name and
asserting the connected retention sentence.

Re-injected exactly one production fault after HTTP decoding: replace the
forwarded optimization with `{...optimization,scope:undefined}` in
`httpProjectApi.tree`, leaving the decoded producer response and all other
branches unchanged. At widths 1024 and 390, both cases reached the accessible
name assertion after the row/pill assertions passed. The actual name was:

```text
Finish-first is the active schedule. Priority-first: This captured optimization question cannot fit the fixed positions in other projects. Finish-first: Earlier project deadline by 6 days.
```

The failed expectation was `/selected Finish-first schedule remains displayed/`.
This establishes presentation with lost connected scope; it is not a decoder,
fake response or missing-row failure. Command, from `apps/wbs/fe-01`:

```sh
TZ=UTC bunx vitest run src/components/wbs/connected-optimization-integration.test.tsx -t 'retains selected ready Time' --no-file-parallelism --maxWorkers=1
```

Observed **2 failed / 21 skipped**, exit 1, log
`/tmp/b3-scope-plain-fault-final.log` (repeated against the final bound delegates). Restored scope propagation immediately after
that run; updated the adjacent HTTP `Proof:` comment with this exact path.
No production guard or behavior is altered by this follow-up. Enabling
integration remains held for independent proof approval; the isolated branch
is not production activation.

Final bound-delegate checks: all **23/23** producer integration cases pass
(`/tmp/b3-scope-plain-green-final.log`), and frontend module/app typecheck
passes uncached (`/tmp/b3-scope-plain-typecheck-final.log`, 21.6s). Focused
ESLint initially rejected unbound HTTP method references; binding each method
to its HTTP owner preserves the plain adapter while satisfying that rule. The
scope fault was repeated after this change and again failed only the accessible
retention assertion in both mounted layouts. These corrections alter the test
composition and proof attribution, not the production response boundary.

Final commands, in addition to the fault command above:

```sh
# apps/wbs/fe-01:
TZ=UTC bunx vitest run src/components/wbs/connected-optimization-integration.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000
# repo root, Nx environment NX_DAEMON=false NX_ISOLATE_PLUGINS=false:
bunx nx run wbs-fe-01:typecheck --outputStyle=stream
bunx eslint apps/wbs/fe-01/src/components/wbs/connected-optimization-integration.test.tsx apps/wbs/fe-01/src/lib/wbs-api.ts
./node_modules/.bin/openspec validate --all --json
```

Focused ESLint passes (`/tmp/b3-scope-plain-lint-final.log`); OpenSpec passes
**268/268** (`/tmp/b3-scope-plain-openspec-final.log`); changed-path formatting
and `git diff --check` pass.

Full frontend aggregate/lint, core checks, Auckland, browser, canonical host
and deployment checks are not repeated for this test-adapter/proof correction;
the preceding packet's results retain their original scope. The normal commit
hooks run on the four changed files without bypass. B4 and activation limits
remain unchanged, and enabling integration still needs independent approval.

#### Bounded synthetic mounted command acceptance (2026-10-22)

Owned isolated clone `/tmp/puni-mounted-commands`, base `2d42598d3`. Production
compose still supplies inactive authoring. A named test-only harness option
replaces only app `writes.batch`'s work-item service, using actual batch stores,
clock, runtime scheduler in capture mode, current admission, dependency context
and collector. No route or production activation switch was added. The app still
constructs the ordinary `PlanCommandRunner`; SQLite topology, journal, fanout
capture/delivery and connected HTTP tree projection remain installed production
implementations.

Four mounted scenarios establish this bounded packet:

- Two isolated Fast projects with a restricted readable predecessor: its edit
  stays 403; the owner authors FS, both endpoints reach revision 1 and the journal
  retains predecessor revision 0→1. The real HTTP trees show predecessor 0→2 and
  owner 2→4, with dates Oct 21–22 on the Oct 19 anchor and stable relationship ID.
  An awaited gateway callback sees committed relationship/journal state through a
  separate SQLite connection and reacquires the actual non-reentrant writer,
  proving delivery follows writer release.
- Local→external→local update, external remove and their undo/redo retain the same
  relationship ID while moving exactly between local/external storage tables.
- An external add followed by a missing-row command rolls back every table and
  publishes nothing. A genuine remote revision edit then makes mounted undo 409
  stale_undo while preserving relationship/revision/event rows without pushes
  (the existing controlled stale-history discard remains allowed).
- Active synthetic authoring still conceals a foreign-organization endpoint with
  exactly the ordinary 404 not_found command envelope and no table/push changes.

Watched production faults, independently injected and restored:

1. Replace compose's inactive work-item authority with active: existing ordinary
   mounted dormant batch answers 200 instead of 409 (0 pass/1 fail).
2. Bypass external expected-revision comparison in WorkItemService history:
   synthetic mounted stale undo answers 200 instead of 409 (0 pass/1 fail).
3. Omit external relationships in resolveConnectedGraph: the mounted owner tree
   starts at 0 and finishes at 2 instead of 2→4 (0 pass/1 fail).
4. Deliver committed fanout inside commandTransaction immediately after recording
   but before UoW settlement: the separate reader sees uncommitted state and
   deliveredCommitted is false (0 pass/1 fail). The callback skips writer reentry
   on that already-detected defect, avoiding a synthetic deadlock.

Adjacent Proof comments name all four observations. An earlier attempted fault
sent the ordinary announcement collector before capture; that test stayed green
because connected invalidation uses committed fanout, so it is explicitly not a
proof. Fault 4 targets that actual delivery path.

Fresh verification:

- Entire `connected-command-admission.controller.db.test.ts`: **121 pass/0 fail,
  1710 assertions**. After the final writer-reentry assertion, the focused dormant
  plus four synthetic mounted cases were rerun (outcome below).
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false`: exit 0.
- Scoped ESLint on both changed TypeScript files: exit 0, no diagnostics after
  generating the real Nx project graph with `NX_DAEMON=false
NX_ISOLATE_PLUGINS=false`. Initial default Nx graph/hook-install attempts printed
  socket permission refusals with exit 0 but performed no graph/hook work; those
  attempts are not counted as evidence. Explicit main-process reruns created the
  graph and installed normal lefthook hooks.
- `./node_modules/.bin/openspec validate --all --json`: **269 passed/0 failed**
  (251 changes, 18 specs), existing requirement-length warnings.
- Frozen Bun installation succeeded with `BUN_TMPDIR=/tmp`; its first default-temp
  attempt failed EROFS and is not counted as a successful install.

Scratch logs: `/tmp/mounted-{revision,dormant,graph,delivery}-fault.log`,
`/tmp/mounted-controller-final.log`, `/tmp/mounted-focused-final.log`,
`/tmp/mounted-openspec.log`. Final format/diff and normal hooks follow below.

Tasks 3.2/4.2 remain unchecked. This packet does not cover all endpoint scopes or
FS/SS/FF combinations, shared capacity, optimizer engines, complete authority and
history matrices, active MCP parity, operator activation or deployment. No full
Nx/host gate, h2/h4 gate, build or independent CI secrets/migration scan was run.

After the final writer-reentry assertion, the focused dormant plus four synthetic
mounted cases returned **5 pass/0 fail, 88 assertions**. Backend spec typecheck
returned exit 0. Scoped ESLint first caught a no-await async test callback; replacing
that callback with Promise.resolve returned exit 0 with no diagnostics. Prettier
checked all five owned files and `git diff --check` returned exit 0.

Normal pre-commit hooks passed format, scoped lint, plaintext-secrets and
private-nesting. Tool-wiki explicitly reported inactive/uncertified because its
external activation root is not provisioned. Migration hooks and doc-caps skipped
because no matching files were staged. No hook was bypassed.

### B4 bounded connected Retry HTTP bridge (2026-10-22)

This packet changes the human-scoped Retry capture/HTTP boundary only. Its
fixture uses the normal mounted `buildApp` HTTP adapter, real migrated SQLite,
real scoped connected capture, real OptimizationCoordinator, and source-owned
observation/outcome/reservation/Retry/dequeue writers. Only the private connected
reader and controlled child process are supplied by the test. Production
`buildServices`, source installation, background capture and activation are not
changed. Local/shared ScheduleInput callers retain their existing shape.

Red/green: the first valid mounted terminal, stale, missing-calendar and idle
cases each returned 500 (`connected optimization input is unsupported`) before
the bridge; **0 pass/4 fail**. After the bridge and precise missing-calendar
Refusal/schema union, all nine new mounted cases passed. Earlier fixture setup
mistakes (audit table name, missing expected-organization header and expected
backfilled abbreviation) were corrected before counting relevant red/green
observations.

The nine cases cover terminal no-write/no-launch 409, stale-before-terminal,
missing-calendar target/list, idle, failed Pri beside terminal Time, changed
foreign boundary, retained terminal after generation replacement, unavailable
input and authorization-before-read plus membership removal after read-close.
The actual Retry owner and launcher both assert zero open read connections.
Refusals compare all rows in optimization_generation,
optimization_boundary_certificate, optimized_schedule_cache, solver_slot,
solver_queue, event_log, event_sequencer and organization_audit. The failed-Pri
case admits only Pri and observes the third launch as Pri after its initial pair.

Independent production faults, each injected alone and restored:

| Fault                                           | Selected mounted observation                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Bypass retained terminal preflight              | Replaced-generation Retry reports idle instead of boundary-infeasible; 0 pass/1 fail.  |
| Bypass connected current-hash comparison        | Stale Retry reports boundary-infeasible instead of stale-input-hash; 0 pass/1 fail.    |
| Remove missing-calendar route branch            | Missing-calendar Retry returns 500 instead of 409; 0 pass/1 fail.                      |
| Remove missing-calendar response schema variant | Mounted response validation returns 500 instead of 409; 0 pass/1 fail.                 |
| Remove idle route handling                      | Held-target Retry returns 500 instead of 409; 0 pass/1 fail.                           |
| Bypass unavailable route handling               | Unavailable Retry returns 500 instead of 409; 0 pass/1 fail.                           |
| Bypass initial target authorization             | Foreign Retry opens one read instead of zero before its 404; 0 pass/1 fail.            |
| Bypass writer membership refusal                | Removal after read-close returns terminal 409 instead of forbidden 403; 0 pass/1 fail. |

Adjacent production Proof comments name those watched outcomes. Scratch logs:
`/tmp/b4-{terminal-preflight,stale-first,calendar-branch,calendar-schema,idle-branch,unavailable-branch,read-auth-first,writer-auth}-fault.log`.
The bridge's connected delegation itself was exercised by the original 500 reds;
no fault was attributed to a check that remained green.

Fresh focused verification:

- `bun test apps/wbs/be-01/src/controller/connected-retry.controller.db.test.ts apps/wbs/be-01/src/module/optimization/connected-publication.test.ts`:
  **28 pass/0 fail, 134 assertions** before the final event_sequencer snapshot
  strengthening; final rerun is recorded below.
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false`: exit 0.
- Scoped ESLint on all seven changed TypeScript files: exit 0, no diagnostics.
  Initial lint caught only import ordering in the new test; autofix and rerun
  cleared it. Nx graph was generated with `NX_DAEMON=false
NX_ISOLATE_PLUGINS=false` before lint.
- `./node_modules/.bin/openspec validate --all --json`: **269 passed/0 failed**
  (251 changes, 18 specs); existing warnings remain.
- Frozen Bun installation succeeded with `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/b4-bun`.
  The initial BUN_TMPDIR-only attempt failed EROFS and is not successful evidence.
- Normal hooks installed through `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-git-hooks:install`;
  output explicitly reports pre-commit, prepare-commit-msg and commit-msg installed.

The broader attempted regression command was:

```sh
bun test apps/wbs/be-01/src/controller/connected-retry.controller.db.test.ts \
  apps/wbs/be-01/src/controller/project.controller.test.ts \
  apps/wbs/be-01/src/controller/project-organization.controller.db.test.ts \
  apps/wbs/be-01/src/module/optimization/connected-publication.test.ts \
  libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts
```

It returned **98 pass/30 fail**, 552 assertions. Running those same four existing
files without the new test at exact base **3757ad13c**, in detached isolated
`/tmp/puni-b4-baseline`, returned **89 pass/30 fail**, 490 assertions. The failure
names are identical. Logs: `/tmp/b4-focused.log` and `/tmp/b4-baseline.log`.
Most fail through the existing counting UnitOfWork fixture lacking
`typedDependencies`, including existing settings PATCH cases; no production PATCH
semantics or unrelated fixture were changed. The borrowed connected claim also
fails identically at base. These regressions are failed checks, not a green gate.
The exact baseline failure names are:

- before activation > keeps deployment-wide access whatever organization a session is bound to
- after activation > answers 404 alike for a foreign and an absent project, and changes nothing
- after activation > refuses a viewer every project write and lets the viewer read and open
- after activation > lets only the creator edit a restricted project, a super-admin only as recovery
- after activation > recovers a restricted project as an audited super-admin edit
- after activation > records nothing for a recovery that changes nothing, or an edit refused
- after activation > links a solution slug within the organization, blind to another organization's
- projects > exports the project WBS and Gantt payload as JSON
- projects > exports the referenced directory closure and authored calendar markers
- projects > exports a readable Markdown WBS and Gantt table
- projects > resolves a project by its solution slug
- projects > refuses a non-owner editing a restricted project, and writes nothing
- projects > lets any account edit an unrestricted project
- projects > sets the PERT weights and the rounding in one patch
- projects > refuses weights that cannot average a triple, and keeps the ones it had
- projects > patches each optimizer setting on its own, and the change survives a read
- projects > emits exactly one project_settings_changed, carrying all three values
- projects > announces nothing when a settings patch changes none of the three
- projects > refuses switching the optimizer on when this deployment has none, on either key alone
- projects > refuses switching the optimizer on with both keys in one patch, not just either alone
- projects > still lets an already-enabled project resend and disable after the optimizer is gone
- projects > lets a settings panel resend the values a project already holds, optimizer or not
- projects > refuses a read-only collaborator’s settings patch, and emits nothing
- projects > puts Retry under the settings PATCH project-write authorization
- refuses structural settings before the service but preserves its semantic refusal codes
- distinguishes absent project bodies from empty form patches without coercing form booleans
- preserves application/json-patch+json on migrated project writes
- preserves application/xml on migrated project writes
- exports complete deadline tree fields without undo flags and rejects malformed core fields
- borrowed service claim sees staged remote completion and collects its normal announcement

Parent tasks 7.3/7.4/9.2 remain unchecked. This bounded packet does not establish
three-project captured C=8 versus final C=6 mounted Retry, browser reconciliation,
full optimizer acceptance, production installation or activation. No host gate,
full Nx gate/build, standalone CI secrets/migration scan or deployment was run.
Settings PATCH regression was attempted above and remains blocked by the identical
base fixture failures; no server terminal-setting refusal was added.

After adding event_sequencer to the no-write snapshot, the final mounted plus
connected-publication rerun returned **28 pass/0 fail, 134 assertions**. No
additional behavior change followed. Final format/diff and normal hook outcomes
are recorded below.

Final backend spec typecheck and scoped seven-file ESLint reruns exited 0 with no
diagnostics. `git diff --check` and staged diff check exited 0. Explicit normal
pre-commit execution passed format, lint, plaintext-secrets and private-nesting.
Tool-wiki reported inactive/uncertified because its external activation root is
not provisioned. Migration/website-migration and doc-caps hooks skipped because no
matching files were staged. No hook was bypassed.

### 2026-10-22 bounded synthetic mounted successor lifecycle (task 4.4 remains open)

The lifecycle fixture now optionally forwards the existing
`syntheticExternalCommands: true` harness option; ordinary callers retain dormant
external authoring. The tested relationships are authored through mounted HTTP,
using Ada's real selected-organization session. Ada is a member owning successor
project B; Grace owns restricted predecessor project A in the same organization.
No production behavior changed.

The healthy mounted case adds two independent incoming external relationships
(from A and another project), one local relationship to B's doomed successor,
and an unrelated external relationship to another B row. An attempted ordinary
Ada edit to restricted A is 403 with no table changes. Deleting B's successor
removes exactly its three relationships, increments all three surviving
prerequisite revisions, and records remote revisions in B's journal. Mounted
undo restores the same work-item and relationship identities; redo removes them
again, with the same journal entry changing undone 0→1→0. Remote journals remain
unchanged; the unrelated relationship, including its audit fields, remains
byte-for-byte intact. The test activates the existing test-only step-blockage
fixture because deletion replay includes its governed snapshot even when empty;
an initial run without that fixture correctly returned 409
step_blockage_inactive. Restored relationships are compared by authored identity,
endpoints and type; this packet does not assert restoration of their audit times.

The refusal case authors A→B, deletes B's successor through HTTP, then has Grace
select org-a through `/api/organization/active` and legally delete now-unreferenced
A's predecessor through HTTP. Ada's mounted undo returns exactly HTTP 404
`{ error: 'not_found' }` before restoring B. Every application table, including
both journals, and the recorded push list remains unchanged; history is not
consumed.

Watched production faults, each restored before final verification:

1. Omit `removedTyped` from cascade deletion's inverse restoration in
   WorkItemService: healthy mounted undo returns 404 instead of 200 (0 pass/1
   fail). The production file was restored unchanged.
2. Remove the surviving-endpoint `bumpWorkItems` in SQLite typed-dependency
   `removeAllFor`: the mounted deletion leaves all three watched prerequisite
   revisions unchanged instead of incrementing once (0 pass/1 fail).
3. Bypass history's external endpoint checks alone: the refusal test remains
   green because its external revision read independently detects the destroyed
   predecessor. This is not an independent proof of that first consumer.
4. Additionally replace history's external `readRevisions` with the journal's
   expected revisions: mounted undo returns 409 stale_undo with "that
   relationship would now be refused: not_found." instead of the required 404
   not_found (0 pass/1 fail). This proves the combined early-read boundary and
   exact non-consuming refusal, not unsafe restoration success. Both redundant
   consumers were restored unchanged.

Adjacent test Proof comments record these observed outcomes. Scratch logs are
`/tmp/lifecycle-{inverse,bump,endpoint-only,endpoint-both}-fault.log`.

Fresh checks in the isolated `/tmp/puni-mounted-lifecycle` clone based on
3757ad13c:

- Full lifecycle, history and connected-command-admission controller suites:
  **168 pass/0 fail, 2481 assertions** (`/tmp/lifecycle-suite.log`). Final
  lifecycle/history rerun after normalizing the expected remote revision order
  is recorded below.
- Backend spec typecheck: `bunx tsc --noEmit -p
apps/wbs/be-01/tsconfig.spec.json --pretty false`, exit 0.
- Scoped ESLint on the three changed TypeScript files: exit 0, no diagnostics.
  The real Nx project graph was generated with `NX_DAEMON=false
NX_ISOLATE_PLUGINS=false`; normal tool-git-hooks installation succeeded.
- `./node_modules/.bin/openspec validate --all --json`: **269 passed/0 failed**
  (251 changes, 18 specs), existing warnings.
- Frozen Bun install checked **1801 installs across 1648 packages, no changes**
  with `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/puni-mounted-bun-cache`.
  The clone uses the existing workspace node_modules via symlink. The first
  install attempt without a writable cache returned EROFS and is not success
  evidence.

Task 4.4 remains unchecked. This bounded packet does not complete the lifecycle,
authority, endpoint-scope or compensation matrices, project deletion,
organization movement, MCP parity or rollout. No activation command, deployment,
full Nx/host gate, h2/h4 gate, build or independent CI secrets/migration scan was
run. Normal commit hooks and final formatting evidence follow below.

The final lifecycle/history rerun returned **47 pass/0 fail, 770 assertions**
(`/tmp/lifecycle-history-final.log`). Prettier checked all four changed files and
`git diff --check` returned exit 0.

Normal pre-commit hooks passed scoped lint, format, plaintext-secrets and
private-nesting. Tool-wiki explicitly returned inactive/uncertified because its
external activation root is not provisioned. Migration hooks and doc-caps skipped
because no matching files were staged. Prepare-commit-msg and commit-msg hooks
passed; no hook was bypassed.

### Task 8.3 C3 bounded frontend frozen comparison context (2026-10-22)

The frontend now retains C2's required side summaries through the comparison
state and renders distinct frozen provenance regions, exact captured stage
boundaries and exhaustive historical objective/availability states. The browser
adapter rejects decoded wrong-side/wrong-project evidence. Commands, runtime
coverage and independently observed post-decode guard mutations are recorded in
[C3 frontend evidence](evidence/c3-frontend-compare.md). This is the bounded C3
summary consumer only; connected save/current activation, the remaining immutable
lifecycle matrix and canonical host gate keep task 8.3 open.

## Task 9.2 — preserve abbreviation drafts during catalog refresh

The mounted General settings refresh cases reproduce a same-project catalog
refresh discarding an invalid `2PUNI` or conflicted `TAKEN` draft. Before the
fix both assertions received `FRESH`; the untouched-field control passed.
GeneralPanel now updates its saved/draft state atomically, preserves dirty drafts
and refusal visibility, and restores the newest saved `FRESH` value on Escape.
The existing project-keyed modal lifetime and canonical write behavior remain
covered by the full modal suite.

| Production fault                                                             | Observed mounted assertion                                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Replace the dirty-draft conditional with unconditional `draft: abbreviation` | Both refresh refusal cases fail: expected `2PUNI`/`TAKEN`, received `FRESH`; clean-refresh control passes. Source restored afterward. |

Focused verification in isolated `/tmp/puni-abbrev-ui`, based on `a0ac30ea7`:

- From `apps/wbs/fe-01`: `bunx vitest run --config vitest.view.config.ts src/components/wbs/project-settings-modal.test.tsx --maxWorkers=1`: 49/49 passed.
- `bunx tsc -p apps/wbs/fe-01/tsconfig.app.json --noEmit` and matching `tsconfig.spec.json`: exit 0.
- Changed-file ESLint initially skipped Nx boundary checks because no graph was cached; generated it with `NX_DAEMON=false bunx nx graph --file=/tmp/abbrev-project-graph.json`, then reran lint successfully with no skipped-boundary warning.
- Vitest reports existing config-loader compatibility warnings. An initial invocation from the repo root collected no files; corrected to the configured frontend cwd. Direct Bun execution failed with a forks-worker startup timeout and no tests; the standard `bunx vitest` invocation produced the recorded results.

This bounded correction does not claim fresh full frontend/browser/build checks,
CI, host gate, deploy, remote relationship navigation/authoring, activation or
completion of parent task 9.2. Those checks remain unrun in this packet.

Changed-file Prettier and `git diff --check` passed. `bun node_modules/.bin/openspec validate cross-project-dependencies --json` passed (one valid change, existing long-requirement warnings).

### Task 8.3 Slice D bounded connected writer/current (2026-10-22)

Isolated clone `/tmp/puni-connected-save-d`, based on `a0ac30ea7`. The mounted
connected POST test first failed with HTTP 500 from compose's explicit
`connected saved-plan capture is unsupported` guard. The installed feature now
accepts that existing detached observation. `captureSchedulePlan` converts and
serializes it once for saving and current comparison; digest work and persistence
follow closure. Legacy input8/schedule1 retain their existing serializers.
No schema migration is required. External authoring remains dormant.

The new controller suite mounts real production composition over a migrated
synthetic-authority SQLite store. It proves input9/schedule2 persistence,
saved/current equality with frozen connected provenance, one read and one
conversion/serialization for current/current after connection closure, viewer
demotion at capture close refused by the immediate writer, and schedule-insert
failure rolling back both header and input. Delivery observes committed rows and
occurs once. Enabled optimized capture without explicit connected configuration
records `unavailable` and writes no generation/cache rows.

The separately installed SavedPlans module uses the actual configured SQLite
live store in both isolated and shared modes. Its four real cache-ready cases
pin chosen optimized versus quantisation-floor baseline, input/body hashes and
link, exact saved/current bodies, later stage's captured foreign positions,
no target-only recapture, and successful historical read after cache eviction.
Cache rows are removed only after the save's live observation closes, before
conversion/hashing; the saved observation stays ready. A missing required foreign
readiness status throws before either table receives a row. Existing coherent
within-snapshot cache-selection proofs remain in the earlier B2 packet.

The added migrated capacity fixtures force actual waits in separate team and
resource cases: target body and encoded component baseline/composite retain
`boundBy:capacity`, nonempty predecessor IDs, positive start, original team or
resource identity and units. This extends B2 beyond merely finding names in
stage input bytes; it does not cover every optimized-decision contention shape.

Watched faults were injected separately and restored before final checks. Scratch
logs are `/tmp/slice-d-fault-<name>.log`:

| Fault name           | Injected production fault                   | Observed failure                                                         |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| current-recapture    | Remove current/current reuse                | Two read connections instead of one                                      |
| writer-authority     | Skip scoped writer admission                | Viewer-demoted save incorrectly returns 201                              |
| write-transaction    | Omit immediate writer begin                 | Header/input remain after injected schedule failure                      |
| announcement-repeat  | Publish saved_plans_changed twice           | Once-only announcement assertion fails                                   |
| selected-baseline    | Encode baseline as final composite          | Two selected optimized cases fail retained stage validation              |
| binding-restoration  | Omit team reverse identity restoration      | Actual public capacityTeamId is encoded                                  |
| resource-restoration | Omit resource reverse identity restoration  | Actual public capacityResource.resourceId is encoded                     |
| capture-twice        | Invoke live callback twice                  | Post-close cache eviction changes the second observation; equality fails |
| solver-admission     | Invoke live scheduler during connected save | optimization_generation becomes nonempty                                 |

Each mutation command exited 1 with the named assertion/semantic failure;
`Proof:` comments are adjacent to the new tests or connected capture branch.
The expected schedule-insert fault emits the endpoint's structured error log.
The fixture's first attempt at publishing a failed cache row violated its payload
constraint; the final test uses valid cache eviction instead. That failed setup
is not used as feature evidence.

Scoped verification and remaining limits are recorded below before the review
checkpoint. Task 8.3 remains open: production connected optimizer configuration,
all historical lifecycle/failure matrices, full optimized-decision capacity
coverage, broader browser/API acceptance, independent review and the canonical
exact-SHA host gate are not established by this packet. No production activation,
push, deployment or full repository gate was performed.

Fresh scoped checks:

- `bun test` on the new connected converter/writer/controller suites plus the
  existing current, schedule, organization controller and module suites:
  **69 pass, 0 fail, 354 assertions**, `/tmp/slice-d-final-regression.log`.
- `bun test libs/wbs/application/core/src/module/saved-plans
apps/wbs/be-01/src/service/saved-plan-atomicity.db.test.ts
apps/wbs/be-01/src/service/saved-plan-schedule-body.db.test.ts`:
  **68 pass, 0 fail, 208 assertions**, `/tmp/slice-d-extra-regression.log`.
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false`:
  exit 0, `/tmp/slice-d-final-typecheck.log`.
- Scoped ESLint on all six changed TypeScript files: exit 0, no diagnostics,
  `/tmp/slice-d-final-lint.log`. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false
bunx nx show projects` first built the real graph; the initial graph-less lint
  attempt was superseded and is not complete boundary-check evidence.
- `node_modules/.bin/openspec validate --all --json`: **269 passed, 0 failed**
  (251 changes, 18 specs), `/tmp/slice-d-final-openspec.log`.
- Existing workspace dependencies are reused via a node_modules symlink; no
  frozen reinstall is claimed. Normal Lefthook installation succeeded in this
  isolated clone. Formatting, diff and commit-hook receipts follow.

No broader frontend/browser/solver tests, standalone production build, full Nx
repository gate, CI secrets/migration scan or h2/h4 gate ran in this packet.

The moved legacy calendar-range absence branch was also independently removed:
`maps a calendar-range plan to infeasible` threw on null instead of returning the
modeled absent schedule (exit 1, `/tmp/slice-d-fault-calendar-range.log`). Its
adjacent Proof comment was carried onto the shared serialization boundary.

Prettier checked all eight changed files and `git diff --check` passed. Normal
pre-commit hooks passed scoped lint, format, plaintext-secrets and private-nesting;
prepare-commit-msg and commit-msg passed. Tool-wiki explicitly returned
inactive/uncertified because its external activation root is not provisioned.
Migration hooks and doc-caps skipped because no matching files were staged.
No hooks were bypassed. Receipt: `/tmp/slice-d-commit.log`.

### Reviewed bounded task 4.2 and 5.2 packets (2026-10-22)

The [node authoring report](evidence/node-authoring-2026-10-22/report.md) records
eight mounted/direct cases, full 129-case controller results, and four distinct
fault injections. Astra independently ran 8/8 focused and 129/129 full cases
and approved the test-only packet. The two shape-guard faults yielded 500 in
place of typed 409; they do not demonstrate an unsafe commit. Production
authoring, MCP equivalence and the parent 4.2 matrix remain open.

The [rank fanout report](evidence/rank-fanout/verification.md) records 41/41
focused cases, 264 assertions and seven watched faults. Astra independently
ran the 41-case matrix, checked the borrowed component-relative rank and
transaction/delivery boundaries, and approved this bounded production change.
Complete writer coverage and successor-only socket/browser acceptance remain
open under 5.2. Neither packet ran the canonical h2puni gate.

The integrated Slice D head passed 36/36 connected writer/controller tests
(234 assertions), backend spec typecheck, and OpenSpec 270/270 after main's
change-aware CI addition. Astra independently approved Slice D after 118/118
focused and legacy tests and backend spec typecheck. Production connected
optimizer installation and immutable-history lifecycle acceptance remain open.

### Task 4.3 graph closure reconciliation (2026-10-22)

The earlier matrix entry saying structural integration was not run was a dated
foundation finding and is superseded for task 4.3. The reviewed
[graph closure](evidence/task-4-graph-closure.md) covers actual task-node cycles,
all remote expansion pairs, positive A→B→A interleaving, structural moves,
step/reach/estimate changes, one-owner staged batch rollback and independently
watched guard faults. The [incident hand-down packet](evidence/task-4-incident-handdown.md)
and approved [P2 correction rereview](evidence/task-4-incident-handdown-review.md)
prove restored endpoint and resulting-graph findings reach their final consumers.

A fresh Astra read-only audit at `3cfe686f2` ran domain/reader 32/32
(113 assertions), nine real SQLite graph scenarios 9/9 (210 assertions),
and mounted first-child/remote-cycle-undo/final hand-down findings 5/5
(82 assertions): **46 pass, 0 fail, 405 assertions**. The auditor inspected
retained fault evidence but did not reinject mutations or run full CI/host gates.
Task 4.3 is closed as its bounded graph contract; 3.2, 4.2, full 4.4,
production authoring activation and delivery gates remain open.

### PR #630 replay capability Job OOM diagnosis and bounded fix (2026-10-22)

CI run `39848434568` reported forward and rollback previous-image replay
capability Jobs `OOMKilled` at exit 137 with empty application logs. The
[exact-image reproduction and import-isolation proof](evidence/replay-oom/2026-10-22-local-image-proof.md)
records baseline failure at the unchanged 512 MiB Job limit, success at 1 GiB
with about 728 MiB RSS, and success after a dependency-free replay vocabulary
import at 512 MiB with about 15 MiB RSS. The four capability strings/order and
existing core reexports remain unchanged. Astra independently reviewed the
source, 176/176 focused tests and both watched negative mutations. CI run
`39852151649` at exact SHA `a9f022563877f43da07d066dda7531e28c835da9`
passed its k3s rehearsal job `120082865697` after the fix. The complete journal
footprint, remaining CI gates and exact-SHA h2puni gate remain unverified;
task 11.2 stays open.

### Bounded task 4.4 promotion lifecycle coverage (2026-10-22)

The [promotion lifecycle report](evidence/promote-lifecycle-2026-10-22/report.md)
records three mounted synthetic-authoring cases and five independently watched
production faults. It covers parent-only promotion cleanup, surviving child
incidents, exact undo/redo identities and remote revision journal coverage,
stale remote-edit refusal with existing history pruning, and direct outgoing
predecessor typed refusal. Existing behavior passed; only test coverage and
observed Proof comments were added. Task 4.4, production external authoring and
host/CI acceptance remain open.

Astra independently approved the bounded promotion packet after a fresh
24/24 lifecycle run (433 assertions), 1/1 dormant-authoring control (11
assertions), backend TypeScript, changed-file ESLint and Prettier. The reviewer
inspected the five fault receipts without reinjecting them. Full packet
`git diff --check` reports only trailing whitespace in the preserved raw hook
transcript; the source/report diff passes. This does not close task 4.4.

### Bounded task 3.2 generated MCP parity (2026-10-23)

The [machine-key MCP/HTTP parity report](evidence/mcp-command-parity/report.md)
records six generated-tool cases against a real mounted backend, five watched
production faults, and three fixture-lifetime regressions added after Astra
reproduced a child leak. The fix reaps the child on setup and close failures;
Astra repeated the original fault and independently passed the configured MCP
suite, **533/533 tests and 3,014 assertions**, plus lint and typecheck. It
proves bounded whole-to-whole FS transport with machine-key authority. Delegated
OAuth, the remaining endpoint/type/history matrix, production activation and
task 3.2 remain open. No host gate ran for this packet.

### Bounded task 6.3 execution observation coherence (2026-10-23)

The [mounted execution observation report](evidence/task-6-3-execution-observation/report.md)
proves two GET startable reads use one owned snapshot. The FS fault returned
HTTP 200 with old completion and new claim/occupancy; the SS fault admitted
later attempt facts instead of retaining the old snapshot. Both assertions
failed with transaction methods replaced by no-ops and passed after restoration.
Astra independently approved the packet after fixing a composed-source teardown
leak: the final two-case and lifetime suites passed 13/13 (125 assertions), and
the old teardown left four deleted SQLite descriptors in the reviewer's probe.
The seven unchanged baseline fixture failures are tracked separately. Broader
readiness coverage, activation and task 6.3 remain open.

### Cross-project test fixture prerequisites (2026-10-23)

The [fixture repair receipt](verify-baseline-fixtures-2026-10-23.md) records
seven unchanged baseline test failures and their fixture-only correction:
synthetic persisted dependency authority is seeded after organization
activation, and the borrowed claim case supplies the real organization-limits
gauge. Astra independently reproduced the parent 24 pass / 7 fail and approved
the candidate 68 pass / 0 fail (346 assertions), with production guards and
assertions unchanged. Ten separate activation rollback-ledger failures remain
open and are not resolved by this packet.

### Bounded task 4.4 mounted compound replay cycle (2026-10-23)

The [compound replay proof](evidence/task-4.4-compound-remote-cycle/verify.md)
records healthy mounted undo/redo and both cycle refusals after an independent
remote bridge edit leaves guarded A/B endpoint revisions unchanged. Earlier
replayed patches roll back, nonjournal rows and pushes remain unchanged, and
only the selected stale owner journal entry is pruned. Four watched mutations
distinguish the early/final cycle guards, transaction rollback and journal
repair. Astra independently approved the bounded packet after 54/54
history/lifecycle tests (969 assertions), changed-file lint, typecheck and
format. Full backend lint exited 1 without diagnostics on three attempts, so
it is not verified by scoped lint. Task 4.4 and full delivery gates remain open.

### Plan-wide activation rollback admission (2026-10-23)

This bounded adapter prerequisite implements the Astra High P1 ruling at the
shared legacy/exact-set rollback seam. It does not close tasks 10.1/10.2 or grant
semantic rollback/deployment permission. Tests use synthetic authority receipts;
they establish persisted-store refusal, not compatible participant fencing.

Baseline TDD: `bun test libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.db.test.ts apps/wbs/be-01/src/controller/claim-limit.controller.db.test.ts --timeout=10000`
observed **87 pass / 10 fail**. Every original rollback negative remains, now with
complete SQLite schema, ledger and all-table-row certificates. Actual digest-pinned
`--capture-file` refusal and an older edited forward-hash certificate each failed
before implementation. Additional controls cover missing triggers, missing ledger,
closed native connection, admitted dormant rollback, enabled no-op/unrelated
selections and unnamed/missing-folder metadata before a newer reversal.

A new missing-ledger test initially compared a folder stamp with epoch-millisecond
`created_at` and selected no rows. That failed observation is not proof of ledger
inspection. The corrected fixture selects by migration name and asserts activation
membership before deleting the ledger row; the corrected restored case passes.

Watched production faults, independently restored after each:

| Fault                                                                                 | Observed assertion                                                                            |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Omit admission; move admission after the down loop; pass only the first selected name | Each produces 14 failed activation refusal/certificate cases; no-op/unrelated controls pass   |
| Bypass ENABLED refusal                                                                | Enabled-empty rollback changes its full migration ledger before SQL refusal                   |
| Bypass retained-edge refusal                                                          | Dormant retained-edge rollback changes its ledger before SQL refusal                          |
| Bypass the existing strict authority inspector                                        | 12 corrupt authority/schema/trigger/ledger refusal or certificate failures                    |
| Restore per-row forward-hash checking                                                 | Older edited migration refuses after a newer reversal; complete schema certificate fails      |
| Restore all metadata resolution inside the per-migration loop                         | Three unnamed/missing-folder/hash cases fail complete schema certificates                     |
| Replace SQL guard insertion with `VALUES (1)`                                         | Direct SQL down test, without runner admission, fails the compatible-recovery throw assertion |

Local logs: `/tmp/dependency-preflight-{initial-red,certificate-red,cli-red,hash-red}.log`,
`/tmp/dependency-preflight-fault-{omitted,late,first-only,enabled,edges,inspector,metadata,per-row-metadata,sql-guard}.log`.
Adjacent `Proof:` comments identify these exact boundaries. The independent SQL
proof adds only a comment to `down.sql`; forward migration bytes remain unchanged.

The inspector validates activation migration membership/count; this change does
not introduce a global migration-ledger schema validator. All selected forward
hashes still pass the shared migration runner's complete-selection metadata
preflight, and captured-set callers retain their existing full identity checks.

Limits: dependencies were reused through a local `node_modules` symlink; a fresh
frozen install, full repository test/build/secrets gate, canonical h2puni/h4claw
gate, live deployment and participant-fencing rehearsal are not claimed by this
bounded change. The parent release tasks remain open.

Restored scoped checks (exit 0):

- `bun test libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.db.test.ts libs/wbs/adapters/store-sqlite/src/migrate-down.db.test.ts apps/wbs/be-01/src/controller/claim-limit.controller.db.test.ts --timeout=60000`: **126 pass / 0 fail, 436 assertions**. This includes complete rollback/unwind and FK-off rebuild migration chains.
- `bun test apps/wbs/be-01/src/migration-cli.db.test.ts -t 'capture-file .*activation|rolls back a failed down|restores a partial forward' --timeout=60000`: **4 pass / 0 fail, 32 assertions**. Both actual capture-file semantic paths and unchanged generic partial-progress/retry behavior pass.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:typecheck` and `... nx run wbs-be-01:typecheck`: both pass (the backend also executes its module prerequisite).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-store-sqlite:lint`: uncached full adapter lint passes; `bunx eslint apps/wbs/be-01/src/migration-cli.db.test.ts` passes.
- `./node_modules/.bin/openspec validate --all --json`: all items pass.

Initial lint failed on four new test typing/void-expression violations and nullable
error interpolation after preflight extraction. These were corrected with a named
type import, block callbacks and the already-narrowed selected name; fresh full
adapter lint and scoped backend lint then passed. Initial combined green attempts
with the empty selected-ledger fixture failed and remain failed observations.
Logs: `/tmp/dependency-preflight-{final-db-controls,final-cli-controls,final-types,be-types,final-lint,cli-lint,openspec}.log`.

Normal staged `lefthook run pre-commit` passed lint, format, migration lint,
plaintext secrets and private nesting. The Tool Wiki hook reported `inactive`,
`certified:false` because the external activation root is not provisioned; this
is no Tool Wiki certification claim. Website migration lint and doc caps skipped
because no staged paths matched their configured scopes.

`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all`
passed (exit 0; `/tmp/dependency-preflight-format-all.log`). The final prose
additions were also formatted with Prettier and covered by normal commit hooks.

The complete four-file focused run passed **179/179 tests, 907 assertions**
(`bun test libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.db.test.ts libs/wbs/adapters/store-sqlite/src/migrate-down.db.test.ts apps/wbs/be-01/src/migration-cli.db.test.ts apps/wbs/be-01/src/controller/claim-limit.controller.db.test.ts --timeout=60000`,
`/tmp/dependency-preflight-final-tests.log`). That invocation loaded the CLI file
before its final dormant capture-file case was added; the final four-case CLI
control run above covers that added case, enabled refusal and both generic retry
contracts. The final backend typecheck was rerun after that test extension and
passed (`/tmp/dependency-preflight-final-be-types.log`).

Astra independently approved the bounded selection-admission packet after a
fresh **180/180 tests and 913 assertions** across the final four files,
uncached adapter lint, backend and store typechecks and same-native-connection
probe. The reviewer inspected all nine watched mutation receipts without
reinjection. Admission is a one-time check, not a fenced transaction across
all down scripts; deployment must still exclude incompatible participants.

### Bounded production connected optimizer composition (2026-10-23)

The [composition report](evidence/connected-production-composition/report.md)
records actual `buildServices` installation, both SQLite reader owners, mounted
read and upstream-edit consumers, startup queue recapture/release, durable
terminal suppression and seven independently watched production mutations.
The digest is forwarded through the actual DI provider/module as well as the
services root. Source-owned transactional optimizer owners remain installed.
The ready candidate equals Fast; improved displacement, complete stage/capacity
and failure matrices, installed Python/image execution, external authoring
activation and canonical host acceptance remain unverified. Parent tasks remain
open. Scoped check and normal hook receipts are in the linked report.

### Integrated verification follow-up (2026-10-23)

After integrating the rollback-preflight packet with the current feature head,
the four-file SQLite and migration CLI suite passed **180/180 tests, 913
assertions** (`/tmp/puni-integrated-p1-tests.log`). A separate uncached full
backend lint diagnosis passed twice on this pre-composition head, with no rule
diagnostics or skipped boundary warnings (`/tmp/puni-lint-{nx,static}.txt`).
The prior unexplained exit 1 did not reproduce; these passes do not establish
its cause or replace the exact-head host gate.

### Backend pre-migration startup admission — 2026-10-23

Bounded packet only; parent cross-project activation/deployment tasks remain open.

- Initial mounted regression (`bun test apps/wbs/be-01/src/cross-project-dependency.boot.db.test.ts`) observed pending table/ledger changes before refusal for enabled-empty authority and missing receipt/marker. The snapshot now contains complete ordered sqlite_master plus sorted serialized rows of every table, including the complete migration name/hash ledger.
- Final focused regression: `bun test apps/wbs/be-01/src/cross-project-dependency.boot.db.test.ts libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.db.test.ts apps/wbs/be-01/src/boot.db.test.ts` — **147 pass, 0 fail, 343 assertions**, 57.07 seconds. Local ephemeral listeners required sandbox escalation. Fresh install, certified historical upgrade and dormant pending-migration controls serve actual `/health`.
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json` — exit 0.
- Focused ESLint of all five changed TypeScript files — exit 0 after generating the Nx project graph, without skipped module-boundary warnings in the final lint output.
- Historical positive startup reconstructs the finite applied pre-authority prefix only in scratch storage; observed historical test around 220–235 ms in the focused runs. Current stores do not replay history. Noncanonical operator schema changes require attended upgrade.

Watched production mutations (each restored immediately):

| Injected fault                                 | Observed mounted negative                                                                 | Evidence                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Move preflight after `runMigrations`           | Enabled-empty pending migration changed complete schema/ledger certificate                | [ordering log](evidence/premigration-admission/preflight-after-migration.log) |
| Remove strict post-migration runtime assertion | Migration dropped receipt table; service factory started before refusal                   | [postflight log](evidence/premigration-admission/postflight-removed.log)      |
| Remove historical hash comparison              | Altered applied hash admitted source migration and changed complete certificate           | [hash log](evidence/premigration-admission/history-hash-unchecked.log)        |
| Remove complete historical schema comparison   | Missing `actual_by_step` index admitted source migration and changed complete certificate | [schema log](evidence/premigration-admission/history-schema-unchecked.log)    |
| Treat every nonempty schema as fresh           | Unrecorded partial source migrated instead of refusing unchanged                          | [fresh-routing log](evidence/premigration-admission/nonempty-as-fresh.log)    |

Explicit authority-read exception with a pending migration preserves the complete source certificate, retains the injected error in the cause chain and closes storage before any app factory. Postflight corruption checks source closure and no services, workers or listener startup. Existing lifecycle regressions continue to cover disposal ordering. No buildServices, connected admission or command capability changes are included.

Full host gate, full repository build/test/lint, deployment rehearsal and live runtime behavior were not run for this bounded implementation packet; the integrating branch remains responsible for its required host gate.

- Prettier check of all changed TypeScript and OpenSpec Markdown files — exit 0; `git diff --check` — exit 0.
- `openspec validate cross-project-dependencies --json` and `openspec validate --all --json` — exit 0. Strict validation was additionally attempted and refused existing long-requirement warnings across the parent change; the new requirements were split to avoid adding a warning.

### Bounded initial connected live admission (2026-10-23)

The [initial admission report](evidence/connected-live-admission/report.md)
records the core-owned callback installed only in the public graph, mounted cold
reads, retained terminal suppression, staged borrowed rollback and source-owned
post-close disable/drain refusal. Target admission preserves the captured response
and existing coordinator policy. Independent mutated wiring, guard, close and
recapture receipts and the unproven final-composite distinction are recorded in
the report. No full host gate or installed Python/image acceptance ran here;
parent 7.3/7.4 and external authoring activation remain open.

### Combined integration receipts (2026-10-23)

After independent Astra review, the plan-wide rollback preflight, backend
pre-migration admission and initial connected live admission were integrated
with the production composition on this branch. The combined rollback suite
passed **180/180 tests, 913 assertions** (`/tmp/puni-integrated-p1-tests.log`),
the combined startup boot suite passed **20/20, 76 assertions**
(`/tmp/puni-integrated-premigration-boot.log`), and the six-file connected
regression passed **99/99, 767 assertions**
(`/tmp/puni-integrated-live-tests.log`). OpenSpec validated all **270** items
after both startup and live-admission integrations
(`/tmp/puni-integrated-live-openspec.json`). The full repository format check
passed before those two packets (`/tmp/puni-integrated-format.log`); their
changed paths passed normal commit hooks. These focused receipts do not replace
the exact-head CI and canonical h2puni gate. Parent activation, deployment and
connected optimizer tasks remain open.

### Generated MCP node/alias parity follow-up (2026-10-23)

The [bounded MCP node parity report](evidence/mcp-node-command-parity/report.md)
extends the real generated SDK→MCP→HTTP/migrated SQLite fixture to remote FS
node encodings and a batch-local dotted successor alias. HTTP and MCP assert
identical durable endpoint identities, schedule and journal effects, and
whole-store rollback with no pushes on wrong remote step/scope, explicit
project-plus-alias and later-command refusals. Production external authoring
remains inactive; this packet uses the established synthetic active fixture.

The configured MCP suite passed **550/550 tests, 3,141 assertions**; its
focused packet passed **26/26, 188 assertions**. Independent Astra review
reproduced both, plus MCP lint/typecheck, backend typecheck, scoped lint and
OpenSpec validation. Eight restored fault receipts are in the report; the
wrong-step and scope faults prove loss of typed refusal through HTTP 500, not
unsafe commits. An initial 15-second fixture readiness run failed under
concurrent load. The final bounded 25-second readiness and 45-second test
limits passed, including a 1 ms readiness timeout that reaps the child. A
reviewer-found trailing space in its raw fault log was removed before
integration; committed-range `git diff --check` then passed. Tasks 3.2/4.2,
activation, exact-head host gate and full delivery checks remain open.

### Bounded mounted displaced-stage acceptance proof — 2026-10-23

The [mounted displaced-stage packet](evidence/mounted-displaced-stage/report.md)
adds real migrated SQLite/buildServices/installed-reader HTTP acceptance for B's
retained stage after a genuine durable C Pri candidate improves weighted
completion 17→16. It proves the outgoing named B→C.short FS bound remains 144
rather than final-composite 48, exact stage/question/request identity, single
owned live observation, closed-reader writer/child handoff, B-only initial live
launches, and failed-Pri Retry accepting the retained hash while refusing the
final-composite hash without ledger changes. The shared capture-helper fault
fails both mounted cases; the separate live callback fault fails live only.
The earlier survived cold-fixture receipt is preserved and explicitly explained.
Production edits are proof comments only. Tasks 7.3/7.4/8.4 remain open; installed
Python/image workers, full matrix, external authoring/activation and canonical
host gate are outside this bounded packet. See the report for commands, exact
observed failures and verification limits.

### Reviewed integration checkpoint — 2026-10-23

After independent Astra approval, the generated MCP node/alias parity and
mounted displaced-stage packets were integrated at `642c3929e` and
`b4e1f1278`. On the combined branch,
`bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts --timeout=45000`
passed **26/26 tests, 188 assertions** (`/tmp/puni-integrated-mcp-node-tests.log`),
and `bun test apps/wbs/be-01/src/services-connected.db.test.ts --timeout=45000`
passed **20/20, 278 assertions** (`/tmp/puni-integrated-displaced-tests.log`).
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx format:check --all` exited 0;
OpenSpec validated **270/270** before the subsequent dash-only main merge and
**271/271** after it (`/tmp/puni-openspec-after-main-merge.json`). Both packets
passed normal commit hooks, and `git diff --check 9ceb50181..b4e1f1278` exited 0. The reviewed head `b4e1f1278` was pushed to draft PR #630; local merge
`711ece2d6` brings in `origin/main` `52a41bfc4` but has not yet been pushed.

The prior pushed `9ceb50181` CI pixel shards 2/4 and 3/4 exceeded their
25-minute job cap while tests were still passing (117/150 and 133/163 cases
logged). Read-only job logs show their Playwright Ubuntu package downloads took
8m17s and 11m47s at 30–55 kB/s versus about 18–21s on passing shards. No
assertion failure was observed in those canceled shards; aggregate CI remained
red. This infrastructure diagnosis does not replace a green exact-head CI run,
the canonical h2puni gate, installed Python/image acceptance, or the unfinished
parent task matrices.

### B4 producer-backed HTTP 409 reconciliation — 2026-10-23

The [bounded producer HTTP packet](evidence/task-9-2-producer-http-409.md) joins
real fractional producer evidence and actual typed HTTP 409 decoding to mounted
project runtime/writer reconciliation on table and cards. Held GETs preserve the
complete Q1 cue and fractional Fast facts; Q2 alone supplies new Retry identity
or terminal Pri evidence. Late refusals after runtime and project replacement
produce no GET/toast/state mutation. The packet records five independent mounted
fault failures, the honestly surviving mounted retired-writer guard mutation,
its existing writer-boundary negative, restoration and verification commands.
It leaves parent 7.3/7.4/9.2 and full Slice B unchecked. Backend authority,
production hashing, activation, browser/session delivery, CI and host gate are
outside this bounded packet.

### Bounded generated MCP node SS/FF parity — 2026-10-23

The [SS/FF parity verification packet](verify-mcp-node-ss-ff.md) records real
generated MCP and HTTP transport for split/encoded node dependencies, with
independent SS 1→2, FF 3→4, FS 4→5 and absent-edge 0→1 placements after an
authenticated predecessor estimate change. It includes atomic later-command
rollback, ordinary dormant refusal, and watched production faults. The nominal
zero-weight FF fault survived independent materialized-boundary reconciliation;
the packet records that limit rather than claiming it was killed. The isolated
focused suite passed **48/48** and configured MCP suite **572/572**, 3,421
assertions; independent Astra review freshly passed a selected **12/12**, 145
assertions. This synthetic active fixture does not enable production authoring;
tasks 3.2/4.2 remain open. The canonical host gate and exact-head CI remain
pending.

The reviewed producer HTTP 409 packet was integrated at `97dfe80f7`; its
combined mounted frontend suite passed **29/29**
(`/tmp/puni-integrated-http409-tests.log`). The reviewed MCP SS/FF packet was
integrated at `4c59a8dc2`; its combined split-node cases passed **6/6**, 111
assertions (`/tmp/puni-integrated-mcp-ssff-tests.log`). OpenSpec validated all
**271/271** items after both integrations and the evidence link
(`/tmp/puni-openspec-after-mcp-ssff.json`). These are bounded regression
receipts, not complete frontend/backend delivery or host-gate evidence.

## Kubernetes journal-owned controller lifecycle prerequisite — 2026-10-23

The bounded two-interval implementation and its mounted executor/file-journal/kubectl
proofs are recorded in [the dedicated verification record](verify-k8s-controller-lifecycle.md).
This packet preserves the prepared-only ownership contract. It does not activate
external authoring, establish complete participant exclusion or complete B3; parent
10.1/10.2 remain open. Independent review and isolated host acceptance are recorded
only after they actually run.

## Detached Kubernetes dependency-evidence prerequisite — 2026-10-23

The [dedicated codec verification record](verify-k8s-dependency-evidence.md)
documents 78 production-boundary tests, 131 assertions, watched malformed and
sparse-array faults, isolated typecheck/lint/format and independent Astra review.
After integration, the same focused suite passed **78/78**, 131 assertions
(`/tmp/puni-integrated-k8s-evidence-tests.log`). The previously integrated
controller lifecycle suite passed **1,140/1,140**, 3,000 assertions
(`/tmp/puni-integrated-controller-target-test.log`), and OpenSpec validated
**271/271** after that controller integration
(`/tmp/puni-openspec-after-controller.json`). These are bounded prerequisites:
no release caller, durable evidence write, complete participant exclusion,
activation, candidate exposure or host gate is proven by this codec. Parent
10.1/10.2 remain open.

## Task 9.2 bounded stable-link landing through filters — 2026-10-23

The stable-link effect in `wbs-table.tsx` now uses the existing
`usePlanFilter.revealRow` when Find or facets exclude an accepted destination.
`narrowTree` supplies the destination's ancestors and expansion overlay. Stored
expansion is only changed by the existing unfiltered landing path. No new filter
state, persisted preference or dependency identity is introduced. The URL remains
pending until the destination reaches the visible row model; the existing focus
request mounts and focuses the actual name or step estimate input, then the link
parameters are consumed with unrelated query parameters retained. Existing
wrong-project, malformed, absent/non-leaf and step visibility checks remain.

Mounted coverage includes desktop and phone work-item/step destinations nested
two ancestors deep under Find, a tag facet and their combination (12 cases),
including initially hidden destination steps with UUID identity distinct from
the fake source step. Assertions cover actual input focus, ancestors, retained
query/facet/expansion, criteria expiry and unrelated URL state. Four additional
page-owned cases select the stable destination over a remembered project and
focus its name/step input on both viewports.

Fresh commands from `/tmp/puni-filtered-link` (Vitest from `apps/wbs/fe-01`):

- `TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx src/components/wbs/plan-cells.test.tsx src/components/wbs/plan-filter.test.tsx --maxWorkers=1 --no-file-parallelism`: 259 passed.
- `TZ=UTC bunx vitest run src/components/wbs/project-page.test.tsx --maxWorkers=1 --no-file-parallelism`: 110 passed.
- `TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx --maxWorkers=1 --no-file-parallelism`: 35 passed after adding initially hidden destination-step coverage.
- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`: exit 0.
- Focused ESLint over the three changed frontend files: exit 0, after generating the Nx project graph with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/filtered-graph.json`. The first direct lint reported skipped module-boundary rules without that graph; it was rerun with the graph present.
- `bunx openspec validate cross-project-dependencies --json`: valid, 1 passed / 0 failed; existing long-requirement warnings remain.
- `bunx prettier --check` over the six changed files and `git diff --check`: exit 0.

Watched production-path faults, restored before final validation:

- Before adding work-item filter reveal, `reveals a nested stable work-item through Find on desktop until criteria change` failed because `Name of 010.1.1` was absent.
- Removing only the step filter reveal made `reveals a nested stable step through facet on phone until criteria change` fail because `Dev estimate for 010.1.1` was absent; React also reported the former repeated stored-expansion update loop. Adjacent `Proof:` comments name both observed failures.

- Removing the hidden-column unhide branch made `reveals a nested stable step through Find on desktop until criteria change` fail because the actual estimate input was absent. The guard was restored and has an adjacent `Proof:` comment.

Scope limits: no full frontend suite, browser/Playwright gate, zoned suite, full
Nx build/lint/module-typecheck or remote h2puni/h4claw gate was run in this bounded
packet. The configured Vite warning about `__dirname` remains. This establishes
mounted frontend navigation/filter behavior only; parent 9.2, production
activation and remaining unavailable/Retry/transfer work stay open.

## Kubernetes live marked-Lease race — 2026-10-23

The [pushed checkpoint's k3s rehearsal](https://github.com/Prosperous-Unification/puni-00/actions/runs/39869773579/job/120142709665)
failed its concurrent-coordinator assertion. Its log shows one coordinator
promoted, while the loser read an initially unmarked live Lease, waited 19,912 ms,
then saw the winner's durable journal-required marker before its first journal
checkpoint. `executeRelease` had captured `journalTransaction=null` at startup;
`decideLease` evaluated that marker before the still-live different holder and
incorrectly reported missing-journal manual recovery. The loser performed no
release mutation. This was an ordering defect in refusal classification, not
evidence of a second promotion.

A mounted executor test now marks and renews the competing Lease during the
injected wait. An initial already-marked case failed with “requires its missing
authoritative journal” instead of “still renewed”
(`/tmp/puni-k3s-lease-race-red.log`). Moving only the live different-holder
decision ahead of the marker check makes it pass, without moving the marker
behind same-holder acceptance or lapsed/parked takeover. The restored source
passed the two `release.test.ts`/`execute.test.ts` suites: **91/91**, 421
assertions (`/tmp/puni-k3s-lease-race-green.log`). An independent watched
order-reversal fault against the final mounted transition case failed with the
same named diagnostic (`/tmp/puni-k3s-lease-race-order-fault.log`); the source was
restored. Unit cases also assert marked same-holder, lapsed and parked missing
journals still refuse, while valid marked-journal holder/wait/takeover decisions
remain. The full k3s rehearsal and exact-head CI have not yet
passed after this fix.

## Backend capability HTTP transport (2026-10-23)

Bounded task 10.1 prerequisite from `8b91ef66e`: the mounted public infrastructure
read `GET /api/runtime/dependency-capability` returns the same frozen binary
constant as the DB-free executable. Its shared `getDependencyCapability` shape
feeds generated clients and OpenAPI; identity/origin and organization-control
inventories explicitly classify the route. Migration readiness and storage probes
are independent of the observation. Production authoring remains INACTIVE; no
activation writer, receipt grant, store-capability inference or constructor-cached
permit refresh is wired. Parent 10.1 stays open.

Verification (Bun 1.4.2; isolated `/tmp/puni-backend-capability-http` worktree):

- `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/bun-capability-cache bun install --frozen-lockfile`: success, 1801 installs checked without changes. The first unqualified attempt refused its read-only default temp directory.
- `bun test apps/wbs/be-01/src/controller/dependency-capability.test.ts`: initial red, missing binding returned 404 and missing registry produced undefined; implemented green, 3 pass. Includes exact CLI equality, explicit empty semantics under activation environment values, frozen constant, readiness/probe independence, generated-client decoding, OpenAPI registration and framed GET 400.
- `bun test apps/wbs/be-01/src/controller/dependency-capability.test.ts apps/wbs/be-01/src/controller/infrastructure-endpoints.test.ts apps/wbs/be-01/src/dependency-capabilities-cli.test.ts apps/wbs/be-01/src/cross-project-dependency.boot.db.test.ts`: 27 pass when local ephemeral listeners are allowed. This includes the existing ENABLED-empty startup refusal control. Sandboxed listeners refuse with EPERM; that run is not a passing receipt.
- `bun test apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts --test-name-pattern 'mounted external authoring stays dormant'`: 1 pass, 13 assertions. The test reads capability first, then observes external-command refusal and complete SQLite rollback of the earlier successful patch.
- `bun test apps/wbs/be-01/src/app.routes.test.ts --test-name-pattern 'binds each|pinned identity'`: 2 pass, 558 assertions; mounted binding and explicit public/no-origin policies.
- `bun test apps/wbs/be-01/src/controller/organization-context.controller.db.test.ts --test-name-pattern 'covers every'`: 1 pass, 226 assertions; organization-control inventory includes the route.
- `bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts /tmp/backend-capability-openapi.json`: success; separately parsed and checked operation ID, JSON 200 and invalid-body 400 descriptors.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck,lint --projects=wbs-contracts,wbs-be-01`: contracts and backend typechecks (including module) and contracts lint pass; backend lint initially failed on the new test cleanup’s dynamic delete. A direct run exposed the diagnostic; replacing it with `Reflect.deleteProperty` passed changed-file lint. Final `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint --verbose --output-style=stream` passes (exit 0); Nx Cloud hostname lookup diagnostics do not affect the local target.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:build`: success, including three dependency tasks and generated OpenAPI.
- `bun test libs/wbs/domain/contracts/src/http/infrastructure-shapes.test.ts libs/wbs/domain/contracts/src/http/document-from-shapes.test.ts libs/wbs/domain/contracts/src/http/client.test.ts`: 61 pass, 238 assertions.
- `bunx --no-install openspec validate cross-project-dependencies --json`: valid, zero errors; pre-existing long-requirement warnings remain.

Watched R5 negatives (each separately injected, failed at its intended assertion,
and restored before final checks):

| Fault                                                                    | Observed production-path failure                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Omit infrastructure route binding                                        | Mounted CLI-equality response: expected 200, received 404.                         |
| Advertise `cross-project-dependencies-v1` in frozen binary support       | Mounted CLI-equality explicit empty-semantics assertion received the token.        |
| Omit capability from `httpShapes`                                        | Mounted generated-client/OpenAPI test found no registered operation.               |
| Replace compose's inactive authoring argument with `{ state: 'active' }` | Mounted SQLite command control, after capability read: expected 409, received 200. |

Adjacent `Proof:` comments identify the injected faults at the binding, frozen
semantic list, registry member and mounted dormant command control.

Broader checks and limits:

- Configured contracts suite: 603 pass, 1 fail. `project-shapes.test.ts` / `preserves seven operation ids and declares both export representations without undo flags` expects the old two-arm export schema while the current connected schema differs. Exact `8b91ef66e` was archived into `/tmp/puni-capability-baseline` with the same installed dependencies; the named test reproduces the identical failure (0 pass, 1 fail, line 47). No baseline fix is included in this transport slice.
- Full `app.routes.test.ts`: 3 pass, 3 fail before the new capability file (the combined invocation also passed its 3 new tests). The framed health listener is sandbox-denied; both local/OIDC general reachability tests encounter `postApiProjectsByIdSteps` 500 from the counting unit of work lacking `typedDependencies`. Restoring every changed tracked TypeScript file to exact `8b91ef66e` and running those three named tests reproduced all three failures. The complete route suite is not claimed green.
- Initial Nx invocation returned zero after socket refusal without executing targets; that output is not evidence. Configured checks use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` and inspect actual target completion.
- Changed-file ESLint, Prettier check and `git diff --check` pass.
- Canonical host gate and full backend suite remain outstanding. Independent Astra review accepted this bounded packet during integration. No deployment, activation, or semantic support grant is part of this slice.

After integration at `9ef3476aa`, the combined endpoint and shared
contract/client/OpenAPI suites passed **64/64**, 251 assertions
(`/tmp/puni-integrated-backend-capability-tests.log`). The mounted dormant
authoring rollback control passed **1/1**, 13 assertions
(`/tmp/puni-integrated-backend-dormant-test.log`); all **271/271** OpenSpec
items validated (`/tmp/puni-openspec-after-backend-capability.json`). This
does not turn the advertised empty semantic set into an authoring permit.

## Kubernetes release binary preflight (2026-10-23)

The bounded coordinator dispatch, mounted file-journal/kubectl tests, nine watched
production faults, configured checks and limits are recorded in
[verify-k8s-binary-preflight.md](verify-k8s-binary-preflight.md). This prerequisite
accepts binary observations only; parent 10.1/10.2 and semantic admission remain open.

Independent Astra review accepted the amended packet after reproducing and
closing the sticky heartbeat-loss defect. Integrated at `66df7ee07`, the
combined configured `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
tool-deploy:test --outputStyle=stream` passed **1,238/1,238**, 3,290
assertions across 40 files
(`/tmp/puni-integrated-preflight-tool-deploy-test.log`). This includes the
live marked-Lease regression and mounted fresh/resumed preflight refusal.
The exact integrated SHA still requires the canonical h2puni gate and fresh CI.

## Task 9.2 bounded remote blockage explanations — 2026-10-23

Review packet based on `2ddea72ee`, isolated branch `agent/remote-blockage-labels`.
The detached projection catalogs exactly referenced foreign roots from the full
captured component metadata. `presentConnectedTree` attaches stable identities
and qualified labels to scheduled and unavailable trees; the additive known HTTP
shape validates them, and the delivered read supplies the shared desktop/phone
step-card label index. Local labels, unknown-root refusal, calendar warnings,
readiness and placement remain governed by their existing paths. Parent 9.2 is
still open; this packet adds no authoring, activation or optimizer behavior.

Observed checks:

- `bun install --frozen-lockfile`: passed, 1493 packages installed.
- Initial producer tests failed because the foreign-root catalog was absent;
  the initial mounted HTTP tests failed because the presenter omitted it.
  Initial malformed-boundary cases failed because unknown additive metadata was
  accepted before its known shape was declared.
- `bun test libs/wbs/application/core/src/service/connected-tree.test.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts`:
  61 passed, 0 failed, 165 assertions.
- The same command expanded with `connected-endpoints.test.ts`,
  `connected-readiness.test.ts`, `connected-optimization-view.test.ts`,
  `module/work-item/work-item.resource.test.ts`, and `http/work-item.routes.test.ts`:
  230 passed, 0 failed, 848 assertions.
- From `apps/wbs/fe-01`, `TZ=UTC bunx vitest run --config vitest.view.config.ts src/components/wbs/connected-optimization-integration.test.tsx src/components/wbs/step-blockage.test.tsx --maxWorkers=1 --no-file-parallelism`:
  45 passed across two files. Existing Vite native-config deprecation warnings
  remain visible.
- `bunx nx run-many -t typecheck -p wbs-core,wbs-fe-01,wbs-contracts`:
  passed, including both configured module checks.
- `bunx nx run wbs-fe-01:build`: passed with its five dependency tasks;
  existing chunk-size warnings remain visible.
- `bunx openspec validate cross-project-dependencies --json`: valid.
  `--strict --json` exits 1 on 15 existing long-requirement warnings. A fresh
  validation with only the delta spec restored to `2ddea72ee` produced exactly
  the same 15 issues; the new requirement adds no warning.

Watched production faults, each restored immediately afterward:

| Injected fault                                    | Observed failure                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Omit the catalog in both presenter arms           | Unavailable hold/step and scheduled desktop/phone rename/clear mounted cases fail.                                  |
| Deliver no catalog from `usePlanReadState`        | The same four mounted cases fail on unknown roots.                                                                  |
| Restrict metadata projection to incident projects | Both transitive A→B→C root producer cases fail; A is absent from C's incident link.                                 |
| Remove captured endpoint null-label validation    | The malformed transitive root metadata test and existing null endpoint tests fail.                                  |
| Bypass the required root lookup                   | The absent-root contextual refusal test fails.                                                                      |
| Change the stable step root identity              | The step catalog identity assertion and both mounted rename/clear cases fail.                                       |
| Remove the known HTTP catalog shape               | Generated HTTP decoder tests admit malformed kind, absent identity and null label and fail their expected refusals. |
| Omit remote insertion into the label index        | Unavailable hold/step and both rename/clear mounted cases fail on unknown roots.                                    |

Removing only `remoteBlockageLabels` from the memo dependency list survived the
mounted rename/clear tests. Every delivered tree already rebuilds rows and the
flat index, invalidating that memo. The dependency is retained for the actual
closure; this is explicitly **not** claimed as an independently proved guard.

Not run for this isolated review packet: full host gate, complete repository
Nx tests and browser E2E. This record makes no live-host or activation claim.

Configured lint/typecheck follow-up: the combined configured run passed all
three project typechecks, both module checks and contracts lint, then reported
six autofixable lint errors in new lines (import order, void arrow bodies and
optional-parameter syntax). After correcting them, `bunx nx run wbs-core:lint
--output-style=static` and `bunx nx run wbs-fe-01:lint --output-style=static`
both passed. Changed-file Prettier and `git diff --check` passed.

`bunx lefthook run pre-commit`: passed applicable lint, format, plaintext-secret,
private-nesting and tool-wiki commands. Tool-wiki explicitly returned
`status: inactive`, `certified: false`, because its external activation root is
not provisioned; this is not certification evidence. Doc-caps and both migration
lint hooks skipped because no matching files are staged. The normal review
commit also runs its installed hooks; no hook bypass is used.

## Task 9.2 bounded remote navigation evidence audit — 2026-10-23

The assigned base already implements this display/navigation/chart slice.
[The fresh audit](evidence/task-9-2-remote-navigation-audit.md) traces the actual
consumer paths and records selected configured frontend checks plus independent
watched navigation-by-abbreviation, address-only-label and foreign-chart-input
regressions. Production sources and tests remain unchanged. Parent 9.2, semantic
activation and full integration/release gates remain open.

## Task 4.4 mounted incident replay evidence — 2026-10-23

[The mounted controller packet](evidence/task-4.4-mounted-incident-replay/verify.md)
proves a compound first-child hand-down and exact undo/redo receipts through
HTTP under restricted remote successor ownership. A timestamp-only receipt
corruption returns `409 stale_undo` after rolling back the earlier inverse
patch, with no additional push; removing the production creation-audit check
made the mounted undo succeed unsafely, then restoration passed. The focused
packet passed 32 combined history tests and configured backend lint/typecheck.
This closes only the mounted evidence gap; parent 4.4, activation and the
exact-SHA release gate remain open.

## Connected arrangement consumer (2026-10-23)

Bounded continuation of 6.1/6.2, based on `be436a9ef`, in isolated
`/tmp/puni-connected-arrange`. Production authoring and supported capacity modes
remain inactive. The parent scheduling tasks remain unchecked.

The command reads the borrowed connected observation before constructing any
local canonical input. It arranges captured target rows by the final target
placement, using the retained target optimization selection only to determine
readiness. Existing held-subtree reduction, positions journal and stored-position
undo/redo remain in the path. Missing anchors now produce a typed command 409
`dependency_calendar_missing`; route shape and client refusal vocabulary include it.

Focused evidence:

- Initial mounted RED: all three first cases returned 500 (`no work item remote
in this plan`), rather than connected order or typed missing-calendar refusal.
- `bun test apps/wbs/be-01/src/controller/connected-arrange.controller.db.test.ts
libs/wbs/application/core/src/service/connected-arrange.test.ts
libs/wbs/application/core/src/service/arrange-by-schedule.test.ts
libs/wbs/application/core/src/service/work-item-status-command.test.ts
--timeout=10000`: passing focused suite; final count recorded below.
- Mounted real SQLite cases cover foreign FS tree dates/order, held and foreign
  positions, one journal entry, repeated no-op with exact table equality,
  undo/redo, shared people, pending selected Optimized without solver admission,
  missing target/foreign anchors, an earlier collected edit rolled back, and cycle.
- Detached core consumer cases cover pending and boundary-infeasible selected
  objectives, ready selected objective with terminal sibling, quantisation-floor
  acceptance and final placement distinct from baseline. Final-placement order is
  controlled at the captured consumer boundary, not a new solver acceptance proof.
  Engine loss and calendar-range mapping are injected captured outcomes.

Watched independent production faults (restored before passing checks):

1. Original connected-to-local routing: mounted order/calendar cases fail with 500.
2. Bypassed selected readiness: pending and terminal core cases return success
   instead of `schedule_not_ready` (2 fail).
3. Component baseline substituted for final placement: ready, ready-sibling and
   floor final-order assertions fail (3 fail).
4. Removed missing-calendar refusal: both missing anchors and collected-edit case
   return 500 instead of typed 409 (3 fail).
5. Unreduced captured rows substituted: both mounted held-sibling cases throw
   `no scheduled start for work item held` (2 fail).

Adjacent `Proof:` comments name these faults and observations. Temporary receipts
are `/tmp/connected-arrange-proof-{pending,baseline,calendar,held}.log`.

Scoped checks: backend and frontend TypeScript project builds exited 0;
changed-file ESLint exited 0 after building the Nx graph in-process;
`openspec validate --all --json` passed all items. Format and final rerun results
are recorded below. An initial default Nx graph invocation refused sandbox sockets
without building a graph; it is not counted. An attempted configured four-project
lint has not yet completed and is not counted as passing.

Limits: a huge-estimate isolated/shared fixture remained scheduled rather than
producing `calendar_range`; no new producer range guarantee is claimed. Canonical
host gate, fresh CI, independent review, live activation and full product suites
remain separate obligations.

6. Removed engine-loss refusal: injected captured engine-loss case threw instead
   of returning `engine_unavailable` (1 fail).
7. Removed unavailable-placement refusal: injected captured calendar-range case
   threw instead of returning `calendar_range` (1 fail).

Final focused suite: **62 pass, 0 fail** across four files. Scoped backend/frontend
TypeScript builds, changed-file lint, Prettier and OpenSpec validation pass. The initial four-project configured lint and a fresh core-only Nx target both
exited 1 naming `wbs-core:lint` but printed no underlying ESLint diagnostics.
Those configured targets are not counted as passing; a direct invocation of the
configured ESLint command is recorded separately below. The cause of the silent
Nx failure is unverified.

The direct configured core command,
`bunx eslint libs/wbs/application/core/src libs/wbs/application/core/testing
libs/wbs/application/core/playwright.config.ts`, subsequently exited **0** with no
diagnostics. This establishes full core ESLint success; it does not erase the
unexplained configured Nx target failures. Final backend project typecheck also
exited 0 after the last test edits. Pre-commit format, secret, private-nesting and
inactive Tool Wiki checks ran normally; no hooks were bypassed.

## Connected arrangement held-slot repair (2026-10-23)

Independent review of `a9d9d8b42` found the held-row claim above was incomplete:
the eligible-only planner respaced moved rows to 10/20, so a held row at 200
fell to the bottom; an ID tie at position 20 also changed the mounted reader
order. The old test inspected a position-only SQL order and happened to pass its
particular tie. This repair keeps the parent scheduling/8.4 tasks open.

The connected command now uses domain `arrangeInSlots`. It first assigns the
schedule-ordered eligible siblings to their original numeric slots in each full
sibling group. If ADR 0016's valid duplicate positions cannot represent that
order, it allocates eligible runs using the closest IEEE-754 keys around held
anchors, respecting the reader's position/ID tie rule. Held positions and
revisions remain untouched. The complete intended reader order and finite keys
are verified before any mutation. An impossible order between immutable equal
held anchors returns typed HTTP/command 409 `arrangement_positions_unavailable`;
the route shape and frontend refusal vocabulary include it. Ordinary isolated
and shared-only planner semantics are unchanged.

Fresh evidence:

- RED: mounted sparse 100/200/300, fractional 10.25/20.5/30.75 and z-held ID-tie
  10/20/30 cases all failed the actual GET order with the previous implementation
  (3 fail, `/tmp/connected-arrange-slots-red.log`).
- The mounted repaired cases assert actual GET order, exact eligible slot reuse,
  held position/revision, no-op table equality and undo/redo. Additional mounted
  cases cover representable duplicate slots with finite readback, and an impossible
  pair of equal held anchors with both direct and earlier-collected-edit rollback.
- Domain cases cover both numeric extrema (no infinity leakage) and held child
  slots below a parent. Existing arrangement property and legacy/hold service
  suites remain in the focused invocation.
- Watched remap fault (legacy respaced positions substituted) fails all three
  mounted sparse/fractional/tie slot cases. Watched final-order validation removal
  changes the mounted impossible case from typed 409 to 200. Watched finite check
  removal admits infinite placements at both numeric extrema (2 fail).
  Receipts: `/tmp/connected-slots-proof-{remap,order,finite}.log`;
  adjacent `Proof:` comments name each fault and observed test.
- Focused invocation: `bun test` over
  `apps/wbs/be-01/src/controller/connected-arrange.controller.db.test.ts`,
  core `service/{connected-arrange,arrange-by-schedule,work-item-status-command}.test.ts`
  and domain `{arrange-siblings,arrange-siblings.property,arrange-siblings-in-slots}.test.ts`,
  with `--timeout=10000`: 94 passing tests before the final collected-refusal assertion;
  final rerun recorded below.
- Backend and frontend TypeScript project builds exit 0; changed-file ESLint exits 0. Final formatting/OpenSpec results are recorded below. Canonical host gate,
  fresh CI and independent rereview remain separate. Production authoring and
  capacity activation remain unchanged.

Final repair rerun: **94 pass, 0 fail, 292 assertions** across seven files
(`/tmp/connected-slots-tests.log`). Changed-file ESLint, backend/frontend project
typechecks, all changed-file Prettier checks, `git diff --check` and
`openspec validate --all --json` exit 0. This bounded repair has not run a canonical
host gate or fresh CI and requires independent rereview.

## Integrated Arrange and descendant command review (2026-10-23)

Astra High independently rereviewed the held-slot repair after the original
Arrange review failure and found no remaining blocker. Its read-only probes
checked 20,000 accepted allocations for finite placements, fixed held rows and
reader order, plus 5,000 refusal-feasibility cases with no false refusal among
127 refusals. The integrated seven-file mounted/domain suite passed 94/94 with
292 assertions (`/tmp/puni-integrated-arrange-test.log`); the neighboring
seven-file remote/connected suite passed 230/230 with 848 assertions
(`/tmp/puni-integrated-arrange-neighbor-test.log`). Uncached Nx typechecks for
`wbs-domain`, `wbs-contracts`, `wbs-core`, `wbs-be-01` and `wbs-fe-01` and their
dependencies passed (`/tmp/puni-integrated-arrange-typecheck.log`). OpenSpec
validated 271/271 (`/tmp/puni-openspec-fe736.json`). These local results do not
replace the canonical exact-SHA host gate or CI.

The bounded descendant-step parity packet is detailed in
[verify-descendant-command-parity.md](verify-descendant-command-parity.md).
Astra High reviewed its real mounted HTTP/generated MCP and SQLite path and
required one extra MCP refusal assertion: text alone did not prove the MCP
error flag. The added assertion checks the existing transport projection of
`isError` as status 0. With the projection deliberately forced to status 200,
the mounted wrong-project-step case failed while still containing HTTP 404
text (`/tmp/puni-descendant-mcp-flag-red.log`); the projection was restored.
The integrated 14-case suite passed with 158 assertions before and after the
fault; the final receipt is `/tmp/puni-descendant-mcp-flag-restored.log`.
Changed-file ESLint and Prettier passed, and OpenSpec validation remained
271/271 (`/tmp/puni-openspec-desc-integrated.json`). Parent 3.2/4.2 remain
open.

## Bounded copy replay integration (2026-10-23)

The independently reviewed bounded copy proof is recorded in
[verify-8-2-copy-slice.md](verify-8-2-copy-slice.md). Astra High initially
required immediate post-undo foreign snapshots and exact owner journal
identity/flag transitions; the amended test supplies both. Its independent
single-case rereview passed 1/1 with 36 assertions. After integration, the
four-file mounted/domain copy packet passed 42/42 with 487 assertions
(`/tmp/puni-integrated-copy-82-tests.log`). Task 8.2 remains open.

## Obsolete exact-SHA host gate triage (2026-10-23)

`bin/h2puni-gate.sh 2ddea72eede2ea6ea5a843077bfaa3955cd031d3` ran from
the isolated `/home/puni1/puni-00-gate-codex-cross-project-2ddea72ee` tree.
Its log printed `h2puni gate: running on 2ddea72eede2ea6ea5a843077bfaa3955cd031d3`.
The full Nx phase reported failures in six targets: frontend unit (2),
contracts (1), core (19), SQLite store (86), remote scripts (1) and devsync
(7). The deadline-copy failure is fixed in later feature commit `1cc02aa66`;
the other failures remain unverified at a new exact head. Representative
causes are stale test fixtures/inventories, migration expectation sets and two
host-load-sensitive subprocess timeouts; the old log is
`/tmp/puni-h2-gate-2ddea72ee.log`.

The contracts export-variant failure was an order-dependent test assumption,
not a missing v10/v11 arm. The actual OpenAPI union emitted v11 first.
`project-shapes.test.ts` now binds each arm by its declared version, asserts
both and still rejects undo/redo flags. The old test failed locally
(`/tmp/puni-export-union-order-red.log`); after repair the entire file passed
4/4 with 40 assertions (`/tmp/puni-project-shapes-full-green.log`). Changed-file
ESLint and uncached configured `wbs-contracts:typecheck` passed
(`/tmp/puni-contracts-order-typecheck.log`). Other old-gate failures remain.

Three core resource tests also claimed all unfinished workflow steps while
asserting unrelated capacity/calendar behavior. The current prerequisite guard
correctly refused the later step. Each fixture now selects only its first
ready step (the calendar fixture names `dev`), preserving the tested resource
behavior without changing production admission. All three failed first with
`prerequisites_unmet` (`/tmp/puni-core-claim-fixtures-red.log`), then passed
3/3; their complete three-file suite passed 18/18 with 217 assertions
(`/tmp/puni-core-claim-fixtures-full.log`). Changed-file ESLint and Prettier
and uncached configured `wbs-core:typecheck` passed
(`/tmp/puni-core-claim-fixtures-typecheck.log`). The remaining core
boundary/context fixture failures are still open.

The DevSync document-index repair restores five exact service-support
classifications and six module READMEs to match their current source trees;
checker behavior is unchanged. Its isolated focused suite passed 41/41 with
148 assertions (`/tmp/devsync-inventory-final.log`). Removing the actual
connected-publication membership made the production index check exit 1 on
that exact path (`/tmp/devsync-index-negative-final.log`); restoring it passed.
After integration, the configured `tool-devsync:check:docs` target passed
uncached (`/tmp/puni-devsync-integrated-check-docs.log`). The agent's configured
lint/typecheck, Prettier, diff check and OpenSpec validation also passed.

The core saved-plan module boundary now takes detached `Step` and
`StoredAttempt` values from neutral ports while the old repository-port exports
remain available to existing callers. The unchanged production boundary audit
reported 14 diagnostics before extraction (`/tmp/core-types-baseline.log`),
passed after it, failed again when a real repository-port import was injected
into connected history (`/tmp/core-types-negative.log`), and passed on restore.
The scoped and neighboring caller suites passed 128 tests combined, and
configured `wbs-core:lint` and `wbs-core:typecheck` passed. The integrated
production boundary case passed 1/1 (`/tmp/puni-core-boundary-integrated.log`).

Five core test consumers now supply the real memory typed-dependency incident
store required at eager graph construction. Production admission remains
unchanged. The isolated baseline had 15 failures; the final fixture packet
passed 52 tests with constructor negatives and a watched unexpected-store
tripwire. Configured core lint/typecheck, formatting and scoped OpenSpec
validation passed; commands and limits are in
[verify-core-context-fixtures.md](verify-core-context-fixtures.md). After
integration, those fixtures and the three resource-claim repairs passed 70/70
with 458 assertions (`/tmp/puni-core-gate-repairs-integrated.log`).

The SQLite migration oracle packet adds the exact newest certificate migration
to rollback lists and fixes historical baselines/ledger expectations where
additional migrations had changed the set. It changes only test fixtures and
preserves exact-set assertions. The isolated focused packet passed 33/33;
the further five-file regression passed 194/194
(`/tmp/puni-migration-regression.log`), and all 32 changed files passed 584/584
with 1,716 assertions (`/tmp/puni-migration-final-changed-tests.log`). Its
configured lint/typecheck passed. A broader configured SQLite test was stopped
after 4m58s with 754 observed passes, three stale pre-repair failures and three
sandbox child-process failures; full-project success is unverified.

The independent SQLite assignee fixture correction makes Review explicitly in
progress before claiming a later step, preserving production prerequisite
admission. The old case had 13 failures; the integrated one-file suite passes
13 tests, with one existing skip and 65 assertions
(`/tmp/puni-sqlite-claim-integrated.log`). Configured SQLite lint/typecheck and
normal hooks passed.

The SQLite audit repair preserves the original creation stamp when incident
links are restored while placing `auditOnCreate` in each physical insert where
the source audit can inspect it. Only machine-generated optimization boundary
certificates join the explicit no-general-audit-column exemptions. Four DB
cases cover local/external authored and legacy-null restoration by a different
actor. Separately removing each helper or creation override failed the named
DB/source-audit proof; adding audit columns to the exempt certificate schema
failed the exemption guard. The isolated combined packet passed 99/99 plus
configured SQLite lint/typecheck; the integrated production audit passed 6/6
(`/tmp/puni-sqlite-audit-integrated.log`). The former old-gate SQLite failure
classes are now repaired in bounded checks; a full exact-head gate is pending.

The k3s status-image fix binds the accepted bare digest to the verified OCI
config fetched through the pinned manifest/index and selected platform child,
under one observation deadline; the pinned Job/Pod spec, runtime manifest
imageID, owner/UID, zero restart and post-log checks remain. Production and
the exact F8/F11 lab authorities have readers. Isolated tests passed 179/179,
configured lint/typecheck and OpenSpec 271/271 passed, and 23 watched faults
are recorded in [verify-k8s-config-identity.md](verify-k8s-config-identity.md).
Independent Astra High review approved `e8599408d` with no actionable finding
and reran 144 core plus 35 mounted tests. The actual 3b42… runtime digest has
not yet been linked to the pinned 4cd0… manifest by a live registry read;
a new k3s infra-check on the integrated commit remains required.

The obsolete gate was already red and one coverage test remained
uninterruptibly blocked after 35 minutes. Its own Nx coordinator and hung test
were terminated, yielding exit 130; the wrapper released the canonical lock
(`heavy lock: holder none`). This is **not** a passing gate and does not satisfy
task 11.2. Focused repairs and a fresh exact-SHA gate are required.

## Persisted remote type editing integration (2026-10-23)

The bounded desktop/phone fixed-endpoint FS/SS/FF editor is detailed in
[verify-9-2-persisted-edit.md](verify-9-2-persisted-edit.md). Astra High
independently reviewed the stable relationship and remote endpoint identity,
owner/read-only state, stale gesture and refusal handling and found no blocker;
its 69-case mounted rerun passed. After integration, the six configured
frontend suites passed 158/158 (`/tmp/puni-integrated-persisted-edit-tests.log`)
and `tsc --build --force apps/wbs/fe-01/tsconfig.json` exited 0
(`/tmp/puni-integrated-persisted-edit-typecheck.log`). This proves frontend
serialization and the mounted inactive refusal, not accepted production
backend persistence, browser geometry or full task 9.2.

## Mounted active authoring authorization (2026-10-23)

The reviewed test-only [task 4.2 authorization packet](verify-active-authoring-42.md)
proves current HTTP writer authority, readable restricted predecessor use,
foreign/absent endpoint concealment, second-owner refusal, old-endpoint
revalidation, queued membership and token revocation, transaction rollback and
publication silence through 11 watched production faults. After integration and
reviewer refinements, its mounted suite passed 13/13 with 201 assertions;
changed-file ESLint, Prettier and diff check passed. Production authoring remains
inactive. The full 4.2 matrix, MCP parity and activation acceptance remain open.

## Task 5.1 post-close derivation and connected cache proof (2026-10-23)

[The bounded post-close packet](evidence/task-5-postclose/verify.md) records
two independent production mutations: a late real connected placement derivation
and a late real captured optimization question. Both mounted HTTP tests failed
with `read snapshot is closed`; restoring production passed the entire five-case
connected Saved plan controller suite. This supplies the previously unobserved
post-close derive/cache fault in the coherent-capture register. At this packet
checkpoint, other faults still needed reconciliation; the independent audit
below completes that work.

## Task 5.2 number-only label event (2026-10-23)

The [bounded fanout packet](evidence/task-5-fanout/verify.md) exercises mounted
`090`→`010` unfreeze, qualified-reference refresh, exact downstream and tail
events, unchanged relationship rows and foreign silence. Independent Astra High
review approved the test-only packet and reran 17/17 cases with 131 assertions.
The author repeated a production incident-traversal fault: the new mounted test
failed on a missing successor event, then passed when restored. Task 5.2 remains
open for topology changes, cause sweeps, delivery and the other R5 faults.

The separately reviewed [mounted topology packet](evidence/task-5-2-mounted-topology.md)
replaces A→B→C with D→B→C and checks ten exact old/new event pairs, unchanged
unrelated and foreign rows, transaction rollback and publication silence.
Omitting either graph or merging the two produced three witnessed wrong-pair
failures. The integrated topology, number-label and core fanout suites pass
18/18 with 160 assertions. Full task 5.2 remains open for remaining triggers,
payload-to-stream routing, live socket/browser delivery and activation.

## Task 5.1 capture reconciliation (2026-10-23)

The earlier task-5.1 checkpoint above predates real installed connected
derivation and live projection. Current `chain-snapshot.ts` derives the complete
connected plan and selects its captured optimization result within the guarded
observation, for owned and borrowed isolated/shared reads. Existing production
factory and mounted tests cover both-direction dependency closure, shared-person
bridges, one capture per project, complete project-specific facts, strict
absence/malformed/unreadable refusal, current authorization, borrowed staged
writes, ordinary isolated lifetime, exactly-once closure and non-admitting
capture. The retained [capture proofs](evidence/task-5-capture-proofs/) cover
removed BEGIN, closure, authorization, borrowed connection and close guards;
the [post-close packet](evidence/task-5-postclose/verify.md) separately watched
real late derivation and captured cache selection fail at snapshot expiry.

An independent Astra High audit mapped every task acceptance to current source,
tests and retained fault receipts and found no remaining 5.1 gap. Its fresh
eight-file bounded runs passed 214/214 tests with 1,008 assertions, including
the repaired mounted fixture. Task 5.1 is checked on that implementation and
proof evidence. This does not close optimization admission, frontend delivery,
semantic activation or the exact-head host/CI gate.

## Task 5.2 scheduling-cause invalidation (2026-10-23)

The independently reviewed [mounted cause packet](evidence/task-5-2-causes/report.md)
exercises estimate, calendar anchor, team capacity, persisted engine selection
and objective edits in isolated and shared modes. Each causes exactly one
durable invalidation for the downstream project and transitive tail, with no
foreign or unrelated event; repeated writes add none. Five separate watched
production faults remove the corresponding captured scheduling identity or
truncate traversal and fail the intended event assertions. On the integrated
branch, the cause, topology and earlier event suites pass 20/20 with 359
assertions. This proves backend invalidation, not changed schedule dates or
actual gateway/browser delivery; task 5.2 remains open.

## Task 6.1 bounded mounted Fast resource capacity (2026-10-23)

The composed `OrganizationHarness` now exercises migrated SQLite through the
installed connected runtime and mounted work-item/resources HTTP readers in
`connected-fast-capacity.controller.db.test.ts`. Two Fast projects have the same
Monday anchor and resource catalog identity `machine`; A has capacity one and B
has capacity two. Each owns two one-day leaves demanding one unit. A whole/whole
SS bridge connects the component without imposing a finish/start delay. Literal
placements assert A starts `[0, 1]`, B starts `[0, 0]`, with unchanged public
project/work-item/step/resource IDs, capacities, demands and capacity blocker label.
Synthetic dependency authority is test-only evidence, not activation approval.

Watched negative: in `connected-plan.ts`, changed the capacity encoder predicate
from `kind === 'person' && capture.mode === 'shared'` to
`kind === 'resource' || (kind === 'person' && capture.mode === 'shared')`, removing
project scope only for resources. The mounted test exited 1: A's second leaf had
start/finish `0/1` instead of `1/2`. Restored the production file with `git restore`
and the same final test exited 0 (one pass, eight assertions). No production
change was needed. The adjacent test `Proof:` names the fault and observation.

Commands and captured output are under
[evidence/fast-capacity-2026-10-23](evidence/fast-capacity-2026-10-23):

- `bun test apps/wbs/be-01/src/controller/connected-fast-capacity.controller.db.test.ts --timeout=10000`:
  resource-scope mutation exits 1 (`capacity-resource-scope-fault.log`); restoration
  exits 0 (`capacity-restored.log`).
- `bun test apps/wbs/be-01/src/controller/connected-fast-capacity.controller.db.test.ts apps/wbs/be-01/src/controller/connected-arrange.controller.db.test.ts libs/wbs/application/core/src/service/connected-plan.test.ts --timeout=10000`:
  exit 0, 43 tests, 219 assertions (`capacity-focused.log`), including held-subtree cases.
- `bun test libs/wbs/domain/domain/src/schedule-typed-dependency.test.ts libs/wbs/domain/domain/src/schedule-priority.test.ts libs/wbs/domain/domain/src/schedule-joint-capacity.test.ts libs/wbs/domain/domain/src/schedule-resources.test.ts --timeout=10000`:
  exit 0, 43 tests, 150 assertions (`capacity-regressions.log`).
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: exit 0, including all
  configured module checks (`capacity-typecheck.log`). Nx used its documented
  in-process plugin fallback after sandbox socket denial.
- `bunx eslint apps/wbs/be-01/src/controller/connected-fast-capacity.controller.db.test.ts`:
  exit 0 after correcting three numeric template expressions (`capacity-file-lint-fixed.log`).
- `NX_DAEMON=false bunx nx run wbs-be-01:lint` and retry with
  `NX_ISOLATE_PLUGINS=false` plus `--verbose`: both exit 1 with no ESLint diagnostic,
  only Nx's child-command failure (`capacity-lint.log`, `capacity-lint-retry.log`).
  The exact underlying configured command `bunx eslint apps/wbs/be-01/src`
  then exits 0 with no diagnostic (`capacity-direct-lint.log`). The configured
  Nx lint wrapper remains unsuccessful; its failure cause was not established.
- `bunx prettier --check apps/wbs/be-01/src/controller/connected-fast-capacity.controller.db.test.ts openspec/changes/cross-project-dependencies/tasks.md openspec/changes/cross-project-dependencies/verify.md`:
  exit 0 (`capacity-format.log`).
- `bunx openspec validate cross-project-dependencies --strict`: exit 1 for sixteen
  existing long-requirement warnings (`capacity-openspec.log`); no spec was edited.
  Normal `bunx openspec validate cross-project-dependencies` exits 0 with those
  warnings (`capacity-openspec-normal.log`).

This closes the mounted project-local resource capacity acceptance gap only.
Team namespace, distinct estimate settings and shared people remain covered by
existing detached/domain suites; this packet adds no mounted proofs for those
independent invariants. At this packet checkpoint, task 6.1 still needed the
producer-boundary proof and full acceptance reconciliation recorded below.
No build, full host gate, push, merge or production activation was attempted.

Independent Astra High review approved the mounted capacity packet without a
Critical or Important finding. The reviewer reran 43/43 with 219 assertions and
the exact underlying backend ESLint, while preserving the configured Nx lint
wrapper failure as unresolved. On the integrated branch, the 43-case mounted,
arrangement and core suite and the 43-case domain regression suite both passed.
The earlier domain-only checkpoint above describes its original date: current
core preparation, `readResolvedFast`, guarded capture and mounted connected
projection exist. At this packet checkpoint, task 6.1 still needed the later
producer-boundary proof and full acceptance reconciliation.

## Task 5.2 delivery and fault-register reconciliation (2026-10-23)

An independent Astra High audit found the backend broadcaster, production
`PushClient`, gateway subscription fanout and frontend tree-refresh consumer
already installed. The missing proof crosses those components with an actual
socket, rather than a new event protocol. The
[isolated fanout packet](verify-task-5.2-isolated-fanout.md) already records a
watched premature delivery inside the admitted writer: the mounted observer saw
the old `Upstream` name instead of `Committed name`. Its separate removal of
external-edge organization filtering failed the mounted foreign-edge case at
the remaining scoped reader with 500 instead of 200; this is a refusal proof,
not a disclosure. A command-transaction pre-commit mutation is also recorded
in the connected-command-admission evidence above. Alongside the later
[traversal](evidence/task-5-fanout/verify.md) and
[topology](evidence/task-5-2-mounted-topology.md) faults, all three named
backend 5.2 register faults have observed production-path failures. Real
gateway/socket delivery and browser-refresh acceptance remain open.

## Task 6.2 mounted calendar projection (2026-10-23)

The independently reviewed [calendar packet](verify-task-6.2-calendar.md)
mounts real SQLite and Fast reads from both connected project URLs in isolated
and shared modes. Eight cases assert fractional FS positions and dates, a
binding Wednesday project floor, weekend manual floor/deadline translation,
and explicit missing-calendar projections that retain links and readiness.
Six separately injected production faults failed the mounted tests. The
reviewer freshly reran 8/8 with 58 assertions and found no blocking issue.
The integrated calendar, mounted live and Fast capacity suites pass 30/30 with
307 assertions.
The floor and missing-anchor faults fail through existing downstream guards,
as the packet states. The task-level acceptance audit below joins this packet
with the prior numeric translation and ordinary undated-local evidence.

## Task 6.1 Fast producer boundaries (2026-10-23)

The independently reviewed [producer packet](evidence/task-6-1-fast-producer-boundaries.md)
adds four real Fast final-placement assertions: fractional FS, delayed SS and
both FF weight signs, with rank and priority favoring the successor. A
validator-only bypass keeps them green; removing each type's edge from the
actual Fast producer fails final starts, as do SS/FF→FS substitutions with
validation enabled. Archived red and restored logs are linked in the packet.
The integrated producer, mounted capacity and mounted calendar suites pass
37/37 with 108 assertions. This closes the bounded producer proof; the
task-level acceptance audit follows.

## Tasks 6.1 and 6.2 acceptance reconciliation (2026-10-23)

Independent Astra High audits found every literal 6.1 and 6.2 implementation,
test and named fault obligation satisfied, so both task checkboxes are now
checked. For 6.1, the existing leveller handles the resolved component,
project-specific settings, resource/team namespaces, shared-mode people,
hold reduction and retained authored inspection through the installed
`readResolvedFast` callback. Core and mounted tests cover interleaving,
eligibility, local-path compatibility and capacity; the new producer packet
proves exact FS/SS/FF final starts under independently removed or substituted
edges. The older all-nodes-ready fault failed before publication on an unplaced
predecessor; it is a detectable refusal, not an observed inverted final plan.
The 6.1 audit freshly passed 172 tests with 551 assertions across domain, core,
mounted, runtime and capture suites. The capacity packet's configured Nx lint
wrapper still has an unexplained nonzero exit; its exact underlying backend
ESLint passed. This limitation remains for the final gate.

For 6.2, mounted reads from both project URLs cover fractional positions and
calendar dates, own Wednesday start floor, weekend manual floor/deadline, and
explicit missing-calendar state. Existing connected core tests prove signed
fractional numeric floor/deadline translation; ordinary live and saved tests
prove undated local behavior remains unchanged. The four required and two
additional watched calendar faults failed production-path tests. The floor and
missing-anchor faults reached downstream refusals rather than fabricated
dates. The 6.2 audit freshly passed 83 tests with 768 assertions across five
files. Optimization lifecycle, historical connected evidence, browser
acceptance, activation and the exact-head host/CI gate remain separate open
tasks; neither checkbox claims those outcomes.

### Task 5.2 bounded real socket delivery (2026-10-23)

Mounted completion now crosses the production PushClient and gateway subprocess
through actual authorized B/C websocket streams, compares durable envelopes,
keeps unrelated/foreign observers silent and rereads B readiness. Independent
actual-send removal and wrong-subscription lookup faults both fail after admitted
presence. See [the delivery report](evidence/real-socket-delivery/report.md) for
commands, exact observations and limits. Browser reconciliation and rollout remain
open; parent 5.2 stays unchecked.

## Task 3.2 bounded optimization transport and shared shape negatives — 2026-10-23

The [optimization transport packet](verify-task-3.2-optimization-transport.md)
adds production-owned connected terminal and required-engine-unavailable tree
parity through generated MCP and mounted HTTP, with full read-side table/push
preservation. Five independently restored production faults caught omitted
optimization, changed terminal states, omitted engine errors, and loss of the
shared add/update input-boundary 400 contract (HTTP and MCP each became 422).
Final added cases passed 6/6; existing calendar/admission controls and the new
cases passed 10/10 before the final assertion lint cleanup. Shared command and
mounted controller suites passed 28/28; configured MCP lint/typecheck, backend
typecheck and changed-fixture lint passed. Independent Astra High review approved
the bounded packet without findings; the integrated six-case rerun passed 6/6.
No production behavior changed. Tasks 3.2/4.2 remain open pending complete
reconciliation and delivery gates.

## Task 4.4 independent final replay graph consumer proof — 2026-10-23

[The bounded final-consumer packet](evidence/task-4.4-final-replay/verify.md)
adds mounted undo/redo final-only graph findings after genuine healthy graph
inspection and staged reattachment. Removing only the final `walkStack` cycle
consumer, while retaining the earlier typed guard and genuine graph calls,
produced unsafe HTTP 200, persisted patch/relationship/journal/event changes and
publication in both directions. Restoration passes; complete table comparisons
allow exactly the established selected stale-entry pruning. The delta spec now
states that exception explicitly. Production behavior is unchanged. Independent
Astra High review approved the bounded proof after an evidence count correction.
Parent 4.4, activation and full host/CI delivery gates remain open.

## Task 4.4 mounted structural edit revocation — 2026-10-23

The [bounded mounted proof](evidence/task-4.4-structural-revocation/verify.md) covers both queued compound hand-down undo and redo after the structural project becomes restricted. Each direction returns typed 403 without changing tables, history, events, audit or pushes. Independent application and repository refusal bypasses each made both directions return unsafe 200; the exact fault outputs and restored checks are retained there. Production behavior is unchanged. Parent 4.4 and full host/CI gates remain open.

## Task 7.3 bounded mounted interleaving and stage-state acceptance — 2026-10-23

[The interleaving packet](verify-task-7.3-interleaving.md) adds two optimized
members across `A.design → B.build → A.test` using actual SQLite capture and
strict durable candidate acceptance. Eleven cases assert literal final dates,
per-stage Pri/Time identity, single visits, stable settled reads, rank/ID order,
engine/enablement/objective/held choices, and exact valid-composite retention for
idle, pending, failed, corrupt and boundary-infeasible states. Required faults
were independently watched red and restored; selector sort omission is proved
by the existing adversarial selector test because mounted derivation pre-sorts
members, with a separate inverted-sort mounted fault. No production behavior
changed. Parent 7.3, persistence/retry 7.4, historical 8.4 and activation stay open.

## Task 6.3 bounded required execution evidence matrix — 2026-10-23

The mounted startable/tree/claim matrix now covers absent/unreadable remote
attempts/progress, own-project foreign-step evidence, required-project absence,
remote holds, calendar-independent readiness and exact project-local resource
occupancy through a real shared-person peer bridge. Six independent production
faults fail precise assertions; omitting the missing-project capture guard still
refuses downstream and is diagnostic only. Complete table/publication invariance,
commands, raw logs, restoration and limits are in
[the evidence report](evidence/task-6-3-evidence/report.md).
Independent Astra High review found no actionable finding. Parent 6.3 remains
unchecked pending MCP/skip-policy reconciliation and integrated gates. No
production behavior or activation changed.

The [bounded execution predicate proof](evidence/task-6-3-execution-predicates/report.md)
independently replaced the production FS completion and SS actual-start/done
branches with `false`. Each fault failed all four selected mounted local/remote
isolated/shared advertised-permission cases (`canStart: true` instead of `false`);
restoration passed the full mounted file, 37 tests and 447 assertions. Raw fault
and restored logs are linked in the report. The faults stop at the advertised
permission assertion, so governed claim refusal is established by the restored
matrix and the existing separate admission-consumer proofs. Parent 6.3 stays open
for MCP/skip-policy reconciliation and integrated gates.

### Task 5.2 bounded mounted and real Chromium reconciliation (2026-10-23)

[The browser-refresh packet](evidence/browser-refresh/report.md) proves the
production page's stream→refresh→installation chain with three mounted race and
failure cases and one Chromium case crossing composed SQLite, real PushClient,
gateway subprocess and authenticated sockets. It establishes B unknown→waiting
only after its covering response, C's newly installed yet still unknown reading,
unrelated/foreign silence, disconnected replay and visible failure/Retry recovery.
Five separately restored production-path faults fail the mounted tests. Runtime
inputs and affected-routing negatives cover the subprocess fixture dependency.
This is page reconciliation; full organization-router/session activation and the
complete parent writer/rollout matrix remain outside the packet. Parent 5.2 stays open.

### Task 10.1 bounded gateway and MCP binary observations (2026-10-23)

Scope: each application owns a `runtime/dependency-support.ts` declaration using
`DependencyRuntimeCapability`, with its own gateway/MCP role, frozen outer object
and frozen empty semantics. Each `dependency-capabilities-cli.ts` accepts no
arguments and emits only the immutable observation. No backend decoder, startup,
activation writer, participant fencing or production authoring changed. Parent
10.1/10.2 remain open.

TDD: new tests first failed for absent modules; after declarations and empty CLI
entrypoints existed, all four initial assertions failed on empty stdout and
argument acceptance. Implemented entrypoints passed. Final focused command:
`bun test apps/wbs/gw-01/src/dependency-capabilities-cli.test.ts apps/wbs/mcp-01/src/dependency-capabilities-cli.test.ts`
passed 6 tests and 38 assertions. Missing and unusable `DB_PATH` are separate
subprocess cases, each with stripped application environment, hostile activation
variables, an empty working directory, exact JSON stdout and empty stderr.
Config/main imports are intercepted by a subprocess preload that throws at those
actual module load boundaries; no server, database or configuration is loaded.
Argument tests assert exact exit 1, empty stdout and the guard diagnostic with a
stripped environment (independent of Nx's forced terminal colors).

Independent watched production faults, applied one at a time in both apps and
restored after each: backend role; advertised `cross-project-dependencies-v1`;
side-effect config import; side-effect main import; removed argument guard;
removed outer freeze; removed semantics freeze. Every mutated focused test run
exited 1 (14 independent faults), then the restored focused suite passed.
Wrong-role/advertisement fail exact output equality; config/main faults fail the
successful observation boundary; guard removal exits 0 and emits an observation;
freeze removals fail the respective `Object.isFrozen` assertion. Adjacent `Proof:`
comments identify these faults.

Controls:
`bun test apps/wbs/be-01/src/dependency-capabilities-cli.test.ts libs/wbs/domain/contracts/src/dependency-runtime.test.ts tools/tool-remote-scripts/src/lib/dependency-capability.test.ts`
passed 61 tests, 72 assertions. The backend transport decoder retains its existing
non-backend-role rejection. `bunx --no-install openspec validate cross-project-dependencies --json`
reported 1 valid change, 0 failures, with existing long-requirement warnings.
Prettier check passed for the six new TypeScript files and modified spec/tasks.

Configured project verification:
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -p wbs-gw-01,wbs-mcp-01 -t test,lint,typecheck,build --skip-nx-cache`.
The initial restricted run could not bind gateway sockets (`EPERM`); socket-enabled
rerun passed gateway tests and both projects' lint/typecheck/build. Full MCP test
execution was stopped after 4m03s at the task owner's bounded verification request;
Nx exited 1 solely for `wbs-mcp-01:test` (11 successful tasks). The last reported
case was `HTTP descendant-step wrong-project-step refuses with complete rollback`
(3804.53ms). No assertion failure was reported before termination. This is an
incomplete slow integration suite, not evidence of a hang or successful full run.
A direct 45-second bounded configured MCP run captured the same slow connected
command parity cases; the timeout receipt is below. Dependencies were reused from the
local locked checkout through an ignored node_modules symlink; no dependency
changes. Independent Astra High review found no actionable findings; the
integrated isolated host gate remains outstanding. This local packet does not
establish deployment compatibility or semantic permission.

MCP bounded receipt: from `apps/wbs/mcp-01`,
`timeout --signal=TERM --kill-after=5s 45s bun test --coverage --coverage-reporter=lcov --timeout=10000`
exited 124. The last reported passing case was `a backend that misses graceful
exit is force killed reaped and reported` (4525.62ms); no assertion failure was
reported before the overall deadline. Full MCP suite remains unverified.
Raw local receipts are `/tmp/cap-nx-final.log`, `/tmp/cap-mcp-bounded.log`,
`/tmp/cap-controls.log` and `/tmp/cap-proof-{gw-01,mcp-01}-*.log`; none is a
host-gate receipt. Final targeted ESLint and nine-file Prettier checks exited 0;
`git diff --check` exited 0. No migration changed, so migration/rollback checks
were not run. No full monorepo gate, deployment or production activation ran.

### Repository policy gate repair (2026-10-23)

CI run 39892524231 at remote head `025c5ac94` failed the Twilight gate because
the new evidence included undeclared binary files; the first reported refusal
named `evidence/fast-capacity-2026-10-23/capacity-resource-scope-fault.log`.
The same run's committed-target-facts check found the new gateway source input
missing from `check.be-01.test`. Both shipped classification policies now declare
the nine evidence binaries with their formats, consumers and regeneration
authorities, and the relationship declaration matches the backend test target.
The old CI failures are the watched negative for these declarations: an omitted
binary is refused by the production classifier, and an omitted target input is
refused by the relationship extractor. Existing adjacent production-path proofs
remain in `classify-entries.ts` and `committed-target-facts.test.ts`.

Local repair checks: the committed-target-facts suite passed 2/2 with 24
assertions; the trusted production CLI pilot's selected observe-lint case passed
1/1 with 62 assertions under `TOOL_WIKI_TRUSTED_NODE_MODULES`; its bootstrap
policy load case passed 1/1 with 10 assertions. Prettier on the three changed
policy files and `git diff --check` passed. The first pilot attempt without
the trusted runtime environment failed before classification with `trusted
TypeScript runtime modules are not configured`; it is not a valid policy result.

The same remote workspace job failed after 33 minutes because Bun 1.4.2 crashed
inside `wbs-be-01:test` (`range end index 4955 out of range for slice of length
4096`). That crash is unresolved; no test assertion failure was reported before
it. The integrated exact-head CI and host gate remain outstanding.

### Task 8.1 — downloaded-v11 stable identity and mapping slice 3 (2026-10-23)

Bounded test-only extension based on `3080d3f2ed61b8dc7107c0c3f673a259819caa54`,
implemented in isolated clone `/tmp/puni-transfer-identity`. Parent task 8.1 stays
unchecked. Production import composition remains dormant; no production behavior,
contract, capability or fixture seam changed.

The mounted source export traverses unchanged JSON download cloning and
`classifyPlanDocument` before the same-source synthetic transactional importer.
The new tests prove:

- An artifact downloaded before remote project/row/step renames, project abbreviation
  change, step-code change and row renumber still binds the original external UUIDs.
  Fresh exports of the source and imported successor carry current remote labels
  and address `NEXT.990`.
- Explicit whole, node and descendant-step mappings select another readable project
  even while all original UUIDs remain valid. Distinct node-step mappings preserve
  their exact destination step UUIDs; all five external endpoint tuples are checked.
- Independently absent whole/node/descendant-step mapped rows and node/descendant-step
  mapped steps return `unknown_ref`, without falling back to valid original IDs.
  Each refusal preserves every table exactly, including event sequencers, durable
  event log, abbreviation allocation, journal and saved/plan-event history, with
  zero push calls.
- After a remote leaf is removed, a new UUID with the same name and exact display
  address cannot replace the absent UUID. The original artifact refuses atomically;
  adding only explicit endpoint mappings admits all four leaf-owned prerequisites
  to the replacement and retains the original parent descendant-step endpoint.

Successful imports intentionally append their own project/rows/links/publications.
The existing typed-dependency store bumps each external predecessor revision once
per inserted link and updates its audit timestamp. The new success oracle checks
those exact revision increments, preserves every other original row field/table
row (apart from the separately changing event sequencer/abbreviation counter),
keeps history tables exact, and checks push count against newly appended durable
publication rows. These success effects are distinct from the all-table refusal
invariance assertion.

No production implementation was invented to obtain a red. The first test runs
exposed fixture mistakes (abbreviation lives in `project_abbreviation`, dependency
and estimate foreign keys require explicit fixture removal, and success revisions
are intentional). Tightening invalid-step diagnostics exposed a fixture collision:
mapping both FS node steps to one absent step correctly refused as duplicate before
endpoint lookup. The final fault changes only the first node-step destination so
its `unknown_ref` observes the intended current-endpoint boundary.

Watched production faults, each restored byte-for-byte before its selected control:

| Fault                                                                        | Observed failure                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Replace `mapping?.destination ??` with `undefined ??` in `prepare-import.ts` | The valid-original mapping case imported the original remote project and failed the explicit destination-project assertion (1 fail). |
| Independently remove step equality from the mapping source key               | The valid distinct-step mapping case refused instead of succeeding (1 fail), detecting collapsed mapped tuples.                      |
| Repeat the ignored-mapping fault against invalid selected destinations       | All five invalid-row/step cases returned successful imported-project summaries instead of refusal (5 fail).                          |

Commands: `bun test ./apps/wbs/be-01/src/controller/cross-project-import.controller.db.test.ts --timeout=30000 -t 'wins while original'`
and the same command with `-t 'mapping refuses'`. Logs remain in the implementation
environment as `/tmp/identity-{precedence,step-key}-{fault,control}.log` and
`/tmp/identity-invalid-fallback-fault.log`. The ignored-mapping fault's valid-original
control and the independent step-key control each passed (1 pass, 118 assertions).
The final complete focused suite below includes the restored invalid-destination
controls. An earlier verification overlapped a transient mutation and was discarded;
all retained final verification runs use restored production files.

Fresh final verification:

- `bun test ./apps/wbs/be-01/src/controller/cross-project-import.controller.db.test.ts ./apps/wbs/be-01/src/controller/cross-project-export.controller.db.test.ts ./libs/wbs/adapters/store-sqlite/src/scoped-import-dependencies.db.test.ts --timeout=30000`: **60 pass, 0 fail, 698 assertions**, 21.84 seconds. The mounted response-corruption negative logs its expected endpoint failures. Log: `/tmp/identity-focused-final.log`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p wbs-be-01 --parallel=1 --skipNxCache --outputStyle=static`: backend configured lint/typecheck and all three module typechecks passed uncached (1m 3s). Log: `/tmp/identity-configured-restored.log`.
- `bunx openspec validate cross-project-dependencies --json`: valid, no errors,
  17 existing long-requirement warnings. Log: `/tmp/identity-openspec.log`.
- Explicit three-path Prettier check and `git diff --check` passed. Repository
  hooks were installed through `tools/tool-git-hooks/src/install.ts` before the
  normal commit; no hook bypass was used.

Dependencies reuse the base checkout's `node_modules` through a symlink; no fresh
frozen installation was performed. No h2/h4 host gate, full backend test target,
CI/build, frontend/browser/E2E, active mounted import success, MCP, old-binary,
transport failure, participant fencing, rollout or deployment check was run.
Success-side event-sequencer/abbreviation-counter values are not newly asserted;
refusals snapshot them exactly. Current endpoint/graph changes and injected
post-creation all-effects rollback remain later whole-transfer slices. Synthetic
storage proofs do not establish public activation or complete task 8.1.

### Slice 3 review correction — retain unmapped prerequisites (2026-10-23)

Astra High identified that the partial-mapping success oracle inspected only four
mapped leaf relationships. It could miss a dropped, unmapped remote-parent
`descendant-step` prerequisite. The correction compares all five complete imported
predecessor/successor project, row, scope, step and relationship-type tuples against
the original downloaded declarations with only the four explicitly mapped leaf
UUIDs replaced. Revision expectations now derive from those five intended tuples,
so the remote parent must increment once and the replacement leaf four times.
The publication oracle additionally requires the complete five-project component's
eight exact `elsewhere_changed` recipient/cause pairs, one imported settings event,
one imported tree event and ten push calls. History and refusal snapshots remain
unchanged; production remains dormant and parent 8.1 remains unchecked.

Watched fault: in `prepare-import.ts`, after mapping lookup, temporarily add
`if (document.externalMappings.length > 0 && mapping === undefined) continue`.
The old partial-mapping test passed incorrectly (**1 pass, 105 assertions**).
With the complete oracle, that identical fault failed (**1 fail**) showing exactly
the missing remote-parent/remote-step descendant-step SS tuple and its remapped
successor endpoint. After byte-for-byte source restoration, the selected control
passed (**1 pass, 111 assertions**). All three runs used
`bun test ./apps/wbs/be-01/src/controller/cross-project-import.controller.db.test.ts --timeout=30000 -t 'reused display address binds only'`.
Logs: `/tmp/identity-unmapped-{before,after,control}.log`. No mutation was retained.

The first configured correction check caught unnecessary successor-union fallback
accesses (`never`) and Bun matcher's untyped return values. The final test uses
precise v11 internal successor fields and `unknown`-typed matcher helpers; no
suppressions or production edits were needed. Changed-file ESLint passed after
these corrections. The earlier slice's installation, full gate and activation
limitations still apply.

Final correction checks:

- Same three-file mounted import/export plus scoped SQLite command recorded above:
  **60 pass, 0 fail, 703 assertions**, 23.54 seconds. Log:
  `/tmp/identity-correction-focused-final.log`.
- `bunx openspec validate cross-project-dependencies --json`: valid, no errors;
  the same 17 existing long-requirement warnings. Log:
  `/tmp/identity-correction-openspec.log`.
- Following the final type-only matcher overload annotation, the selected
  partial-mapping control again passed (**1 pass, 111 assertions**), and direct
  `bunx tsc --build --force apps/wbs/be-01/tsconfig.json` passed. Logs:
  `/tmp/identity-correction-typed-control.log` and
  `/tmp/identity-correction-direct-typecheck.log`.
- Final uncached configured
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p wbs-be-01 --parallel=1 --skipNxCache --outputStyle=static`:
  backend lint/typecheck and the three module typechecks passed (1m 2s). Log:
  `/tmp/identity-correction-configured-final.log`.
- Explicit changed-path Prettier check, `git diff --check` and byte comparison
  against the original production preparation source passed. Normal commit hooks
  remain enabled; no hook bypass was used.

## Task 7.4 bounded mounted publication, durable replay and explicit Retry — 2026-10-23

[The mounted publication packet](verify-task-7.4-mounted-publication.md) exercises
raw successful child-adapter output through installed parsing, real publication,
durable SQLite outcomes and repeated captured tree replay. Literal improved
target offsets retain fixed foreign timing. Invalid Pri metrics retain failed
state without automatic GET retries; current-hash POST Retry recovers only Pri
and preserves the healthy Time row. Structured candidate/comparison cache tamper
becomes corrupt without read admission. Five watched faults cover connected wire
validation, publication, cached candidate evidence, comparison equality and
mounted Retry binding. Production code is unchanged. The attempted fully mounted
fractional topology preserves its forcing internal edge and therefore does not
reproduce the independently padded lower-level C pin; that mounted acceptance
remains open. Parent 7.4 and production activation remain incomplete.

## Frontend Docker context repair — 2026-10-23

[The image-context packet](verify-fe-image-context.md) records the red
exact-head infra-check and two local inner Nx failures, followed by a real
default-network Docker image build passing with sibling project metadata and
the frontend-only Nx target. The subsequent exact-head infra-check on
`9b3bca6bf` passed both `fleet-check` and the real `k3s-rehearsal`; later code
changes still need their own exact-head gate.

## 2026-10-23 — gate test inventory repair

The exact-SHA gate exposed two declarations omitted when the cross-project tests
were added. `cross-project-live.controller.db.test.ts` bundles the actual frontend
Gantt consumer with the frontend TypeScript configuration. Backend `test` now hashes
frontend source (including the bundle's transitive imports), `tsconfig.app.json`
and its inherited `tsconfig.json` explicitly; no backend-to-frontend project dependency is introduced. The uncached
`e2e-cross-project` target is classified alongside `e2e-organization` as a real-backend
Browser runner without the test-axes slice's report binding. This does not grant
isolated-level evidence credit.

Observed on `pop-os`, in `/tmp/puni-devsync-inventory`, based on
`9b3bca6bfc3b0491b93f76bb609f61910d02278c`:

- Before repair, the two focused suites produced **121 pass, 10 fail**. The cached
  read inventory named `gantt-geometry.ts` and `tsconfig.app.json`; the remaining
  failures named the undeclared `wbs-fe-01:e2e-cross-project` target.
- Added the production-CLI classification regression first and watched it fail
  with `unknown test target declaration wbs-fe-01:e2e-cross-project` while the
  classification was absent. This is the classification's dependency-broken R5
  negative. The existing production inventory test independently failed with the
  two original backend inputs omitted. The added native `InProcessTaskHasher`
  regression then failed naming only `apps/wbs/fe-01/tsconfig.json` before its
  input was added. It also verifies the geometry entrypoint, transitive Gantt axis,
  app configuration and shared root configuration are hashed. Adjacent `Proof:`
  comments record these observations.
- `bun test --preload ./tools/test/scratch/preload.ts tools/tool-devsync/src/test-levels.test.ts tools/tool-devsync/src/workspace-targets.test.ts --timeout=30000`:
  **133 pass, 0 fail**, 497 assertions (final rerun includes inherited-config hash regression).
- `bun tools/tool-devsync/src/verify-test-levels-cli.ts`: exit 0.
- `NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache`: exit 0.
- `NX_DAEMON=false bunx nx run tool-devsync:typecheck --skip-nx-cache`: exit 0.
- The first sandboxed configured `tool-devsync:test --skip-nx-cache` run ended
  **813 pass, 43 fail, 1 error** because loopback listeners were denied (`EPERM`),
  Git scratch-object writes were read-only and local clone hardlinks crossed
  sandbox mounts. The same target was rerun with approved escalation:
  `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache` passed with
  **923 pass, 0 fail**, 3309 assertions across 49 files, in 739.08 seconds.
- Changed-code Prettier check and `git diff --check`: exit 0.
- `bunx openspec validate cross-project-dependencies --json`: exit 0, valid true.
  The additional `--strict` invocation marked the change invalid because of 17
  existing long-requirement warnings; this repair changes no delta specifications.

These are local regression observations. No full h2 gate or browser execution was
performed in this repair; the integrated commit still requires the exact-SHA gate.

### 2026-10-23 bounded task 10.1 HTTP client admission

Isolated tree `/tmp/puni-client-http`, based on
`9b3bca6bfc3b0491b93f76bb609f61910d02278c`. This packet implements only shared
client protocol declarations and dormant backend HTTP admission. Actual immutable
backend support remains empty; authoring, activation writer, gateway and client
claim sending/endpoint-specific client refusal decoding are unchanged. Parent
10.1 remains unchecked.

Fresh receipts:

- Focused six-file command: `bun test apps/wbs/be-01/src/http/elysia/dependency-client.db.test.ts apps/wbs/be-01/src/http/elysia/mount.test.ts apps/wbs/be-01/src/controller/dependency-capability.test.ts apps/wbs/be-01/src/app.routes.test.ts libs/wbs/domain/contracts/src/dependency-client.test.ts libs/wbs/domain/contracts/src/http/document-from-shapes.test.ts` — 79 pass, 0 fail, 1708 assertions. The existing real TCP health test initially failed with sandbox EPERM; rerunning with approved local socket access passed. A subsequent strengthening of the binary-support assertion to traverse actual `/api/projects` passed the five admission tests with 33 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-contracts` — both typechecks and backend module typecheck passed. Ordinary Nx daemon/plugin sockets were unavailable in the sandbox; in-process plugin execution was used explicitly.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p wbs-be-01,wbs-contracts` — backend lint passed. Contracts lint initially failed on barrel export ordering; after correcting it, `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-contracts:lint` passed.
- `bunx openspec validate cross-project-dependencies --json` — valid, with long-requirement warnings. Strict validation was also attempted and failed on such warnings; strict validation is not claimed passed.

Observed TDD and R5 production-path negatives, each restored independently:

- Before admission existed, the enabled mounted request returned 200 instead of 409. Omitting the required production callback also initially composed an app rather than throwing.
- Replacing the production AppOptions-to-mount binding with null admission returned 200 instead of 409 on `/api/projects`.
- Removing the mount's dependency refusal returned 200 instead of 409 on `/api/projects`.
- Removing exact claim validation admitted missing/invalid claims, returning 200 instead of 409.
- Removing immutable binary support validation admitted the exact claim on an incapable `/api/projects` app, returning 200 instead of 409.
- Bypassing fresh authority inspection admitted ENABLED authority as legacy, returning 200 instead of 409.
- Removing the read transaction let a rival connection's activation leak into a partly completed inspection: the first request returned 409 instead of its coherent DISABLED snapshot's 200. The restored transaction admitted that request and refused the next request with 409.
- Disabling shared operation coverage returned 200 instead of 409 on the actual resource route and failed the complete protected/exempt operation matrix.

Mounted real SQLite coverage also distinguishes malformed marker, missing marker,
missing authority table and closed connection; each receives infrastructure 500.
Origin and identity refusals precede inspection. Valid disabled requests retain
legacy admission despite missing/invalid claims. No project rows, revisions,
command journal, event log or sequencer rows change during admission. The explicit
matrix protects organization control/onboarding and exempts only process,
authentication and immutable catalogue operations. Generic adapter-only fixtures
can omit admission; production buildApp requires it statically and dynamically.

Full monorepo tests/build and integrated h2/h4 gate were not run in this bounded
local packet. Independent architecture review and integrated host gate remain open.

Final local checks: all changed/new files passed `bunx prettier --check`; `git diff
--check` passed. After the production binary-support test strengthening, both Nx
typechecks passed again and normal OpenSpec validation remained valid (17 existing
long-requirement warnings; none names the new HTTP requirement).

Downstream caller correction: actual `bun test apps/wbs/mcp-01/src/shape-document.test.ts`
initially failed 4 of 6 cases because MCP rejects OpenAPI header parameters. The
conditional header parameter was removed from generated OpenAPI; exact shared
constants and typed 409 remain. Header declaration and client/MCP claim handling
are deferred. Existing document parameter expectations return to their original
contract; no vendor extension or new tool input is introduced.

Post-correction checks:

- `bun test apps/wbs/mcp-01/src/shape-document.test.ts apps/wbs/mcp-01/src/openapi-tools.test.ts` — 38 pass, 0 fail, 409 assertions; actual generated schema/tool parsing remains compatible.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-contracts:test:unit` — 606 pass, 0 fail, 2609 assertions. One existing emitted-step 409 assertion was extended with the new exact refusal arm. A preceding root-level directory-filter test command incorrectly also collected stale generated `dist/out-tsc` tests and failed; its output is not treated as source-test evidence. The configured Nx target selected only source files and passed.
- First implementation commit `c2145d12e` passed normal lefthook formatting, staged lint, secrets and nesting checks. The configured Tool Wiki hook reported its explicit inactive/non-certified state because the external activation root is not provisioned. No hooks were bypassed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-be-01,wbs-contracts,wbs-mcp-01` — all three typechecks and backend module typecheck passed after the OpenAPI correction. Correction files passed formatting and `git diff --check`.

### 2026-10-23 bounded 10.1 SCIM review correction

Exact-commit review identified `/scim/v2/*` as a separately mounted foreign
protocol, outside the shared operation matrix. It mutates provisioning users and
memberships, so it is protected rather than exempted. The production app now
passes its required dependency admission callable into the SCIM adapter. A required
request-level resource-admission callback runs inside the service after existing
provisioning-token authentication and rate admission, before route dispatch/body
reads. The adapter keeps SCIM409/media/error fields, with
`detail: "client_dependency_incompatible"` and the exact `required` semantics.
Malformed or unreadable authority reaches the existing SCIM infrastructure500
boundary. No immutable capability, activation or gateway behavior changes.

The callback type was narrowed to exported `DependencyClientRefusal`: the general
`Refusal<C>` also includes optimizer retry variants, so it did not permit safe
access to the exact refusal fields. This is a type-only narrowing, coordinated
with the separate gateway packet; protocol constants and behavior are unchanged.

Observed production-path negatives, restored independently:

- Initial mounted real-SQLite ENABLED SCIM list returned200 instead of409.
- Replacing the production app's SCIM callback binding with null admission made
  the mounted ENABLED list return200 instead of409.
- Removing the service resource-admission refusal made the same route return200
  instead of409.
- Moving dependency inspection before provisioning authentication made a missing
  token with unreadable authority return500 instead of401.

Fresh focused command:
`bun test apps/wbs/be-01/src/controller/scim-authentication.controller.db.test.ts apps/wbs/be-01/src/controller/scim-body.controller.db.test.ts apps/wbs/be-01/src/controller/scim-deprovisioning.controller.db.test.ts apps/wbs/be-01/src/controller/scim-users.controller.db.test.ts apps/wbs/be-01/src/controller/scim-dependency-client.controller.db.test.ts apps/wbs/be-01/src/http/elysia/dependency-client.db.test.ts libs/wbs/domain/contracts/src/dependency-client.test.ts`
— 35 pass, 0 fail, 563 assertions. Mounted SQLite coverage includes the foreign
list/read/create/patch/delete matrix, disabled legacy201, exact-capable200,
incapable409, malformed and closed authority500, and missing-token401 before
inspection. A refused malformed POST body remains unread. Refused requests leave
SCIM users, memberships, organization audits, projects, event log and command
journal unchanged. Existing SCIM authentication, body bounds, provisioning,
deprovisioning and rate-limit tests pass.

Focused ESLint over all changed TypeScript files passed after fixing import order
and narrowing the refusal type. `bunx openspec validate cross-project-dependencies
--json` is valid; `git diff --check` passed. Strict OpenSpec, full monorepo
tests/build and integrated host gate remain unclaimed. Parent10.1 remains open.

SCIM correction final checks: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx
run-many -t typecheck -p wbs-be-01,wbs-core,wbs-contracts` passed all three
project typechecks and both module typechecks. Every changed/new file passed
Prettier check. The separately mounted `GET /api/openapi.json` is now explicitly
named as an immutable infrastructure exemption in its JSDoc/design/spec, and the
mounted test requests it with a throwing authority callback alongside health and
immutable capability; dependency admission is not invoked.

Gateway upgrade prerequisite evidence is recorded in
[verify-gateway-client-admission.md](verify-gateway-client-admission.md).
Parent task 10.1 remains open; existing-socket/delivery fencing and activation are
not established by this bounded packet.

### 2026-10-23 bounded task 8.1 downloaded import and late rollback proof

[The import slice 4 packet](verify-import-slice4.md) records six new mounted
downloaded-artifact and after-event-write rollback cases. The configured
three-file regression passed **66 tests, 750 assertions**; backend typecheck,
changed-file lint and format passed. A concurrent broad lint attempt exhausted
its 2 GiB Node heap without a code diagnostic. A serialized rerun with a 4 GiB
heap passed `wbs-be-01:lint` uncached in 49.0 seconds. Astra High reviewed the
exact two-file packet and independently reran the six new cases: **6 pass, 47
assertions**. Four separate safety mutations failed as recorded. The packet
found a pre-existing cycle-witness defect: a downstream authored edge can be
reported as part of the cycle, misattributing the original import declaration.
That defect, active external import, compatibility and the integrated host gate
remain open; parent 8.1 is not complete.

The [cycle witness correction](verify-cycle-witness.md) was integrated from the
Astra-reviewed isolated packet as feature commit `51b357d7c`. Iterative SCC
membership now excludes downstream and bridge edges from authored cycle IDs;
the mounted downloaded import blames the external declaration at index 0 and
preserves all rows and pushes on refusal. The isolated packet passed 78 focused
graph tests and 66 mounted import/export/store tests, and watched filter,
component-equality and presence faults fail those assertions. Domain and backend
typechecks plus domain lint passed on the isolated packet. Serialized uncached
`wbs-be-01:lint` passed on integrated `de89f662d` in 50.8 seconds with a 4 GiB
Node heap. The later integrated exact-SHA host/CI gates remain pending;
parent 8.1 and production external import remain open.

### 2026-10-23 bounded task 4.2 queued successor edit revalidation

[The mounted packet](verify-4-2-successor-edit-revalidation.md) was integrated
as `03a117729` plus the positive-control cleanup `068d91ee2` after independent
Astra High review. With an external add, update or remove queued behind an
actual SQLite writer, a separate connection revokes successor edit access after
initial lookup. Each request returns an exact whole-request 403 and leaves all
persisted tables and gateway publications unchanged. The isolated focused suite
passed 16 tests / 301 assertions. Removing only the production forbidden
branch made all three cases return unsafe 200 and fail; restored runs passed.
Configured uncached `wbs-be-01:lint` passed on integrated `de89f662d` in 50.8
seconds with a 4 GiB Node heap. The first uncached backend typecheck found a
test-fixture-only `string | undefined` expected relationship ID at the positive
update assertion (`TS2769`). An explicit fixture guard corrected that type
boundary; the uncached backend typecheck and its module prerequisite then passed
in 14.5 seconds. The exact three mounted revocation cases passed 3/3 with 100
assertions after the correction. Exact-head host gate and CI remain pending.
Production authoring remains dormant and parent 4.2 is open.

### 2026-10-23 bounded retained gateway delivery and client editor checks

The [retained-delivery packet](verify-retained-delivery.md) records the awaited
per-socket writer, bounded queue, physical-drop accounting and watched expiry
fault. Its integrated configured gateway test passed 174 tests / 3,736
assertions; serial uncached lint, typecheck and build passed. Astra High reviewed
the corrected source. Retained semantic authority, participant exclusion and
activation remain open under parent 10.1.

The [remote predecessor editor packet](verify-9-2-predecessor-scope.md) was
integrated with desktop and phone editing while preserving stable remote
identity. The restored-source configured frontend unit target passed 82 files /
1,012 tests. A separate integrated serial uncached frontend lint and typecheck
run passed. Exact-head CI/host gate and parent 9.2 remain open.

The [installed solver-image source packet](verify-task-7-installed-solver-image.md)
adds two connected authenticated child questions to both smoke modes and a
canonical contradiction revalidation correction. Focused scenarios passed
70 tests / 184 assertions; fake-Docker smoke passed 42 tests / 143 assertions.
The actual installed image/digest and disposable Python relabel negative were
subsequently proved on h2puni as recorded below. Parent 7.3/7.4 remain open.

The later exact `08b2fe31d` h2puni built-image smoke passed under the canonical
heavy lock: four authenticated child binds including connected-feasible and
connected-fractional, then 3 real-Docker orphan subprocess tests. The
disposable installed-Python relabel image passed baseline, shared-person and
connected-feasible binds, then failed precisely at the fractional child
response (`expected solver-proven boundary-infeasible: failed`); all owned
Docker resources were inspected absent afterward. The whole exact-head gate
remains pending; see the packet above for pinned digests and module hashes.

### 2026-10-23 bounded task 10.1 client incompatibility presentation

The [client packet](verify-client-compatibility.md) was integrated as
`63f2a26b2` after independent Astra High review. The exact protected 409
schema becomes a typed `dependency_incompatible` failure and the mounted plan
renders compatible-client guidance; ordinary 409s and exempt requests retain
their prior meaning. Focused shared/frontend controls passed 45/231 tests and
seven separate safety mutations failed their named assertions. Integrated
serial uncached frontend lint/typecheck passed. No V1 HTTP/WS claim, semantic
advertisement or authoring activation was added; parent 10.1 and exact-head
host/CI gates remain open.

### 2026-10-23 bounded task 10.1 retained gateway egress admission

Required fresh per-FIFO-head admission, synchronous physical acceptance and
retirement/revival proofs are recorded in
[verify-retained-egress.md](verify-retained-egress.md). Parent 10.1 remains open;
the delayed-204 post-read/pre-send race remains deployment-owned and unresolved.
No activation, authoring or semantic advertisement was enabled.

### 2026-10-23 bounded saved-history lifecycle

The [saved-history lifecycle packet](verify-saved-history-lifecycle.md) proves
genuine two-save connected history and mounted HTTP read/comparison through
foreign edits and deletion with poisoned live capabilities in isolated/shared
modes. Parent 8.3 and the canonical host gate remain open.

## Task 5.2 attempt-driven dependency invalidation (2026-10-23)

The borrowed dependency capture now fingerprints `StepNodeAttemptRepository.listByProject` for each authorized component member after validating its snapshot lifetime. Mounted HTTP cases cover A→B→C SS start, failed end and removal in isolated and shared mode: each command adds exactly one `elsewhere_changed` event to B and C, B's startability follows actual attempt evidence, a disconnected project in the same organization and a foreign organization receive none, and relationships do not change. A rejected two-command batch rolls its start back; an injected repository read failure returns 500 and leaves attempt, event, sequencer and journal tables unchanged. Both refusals leave the push observer count unchanged.

Proof logs: [attempt omission](evidence/attempt-fanout-fingerprint-fault.log) records 0 B/C events against 1 expected in both mounted modes when the fingerprint used `[]`; [snapshot expiry](evidence/attempt-fanout-lifetime-fault.log) records resolved fanout against required rejection when the post-await lifetime guard was removed. Both were restored before the focused green run. The mounted read-failure case itself injects the repository rejection and asserts atomic refusal. Existing `cross-project-events` mounted delivery test covers callback after commit and writer release.

Focused green: `bun test apps/wbs/be-01/src/controller/cross-project-attempt-events.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts --timeout=30000` — 31 pass, 284 assertions. Configured `wbs-store-sqlite:typecheck` and `wbs-be-01:typecheck` passed after a test-only `this` annotation fix. Configured lint and format checks are recorded in the commit packet. Astra High approved the bounded source at `0e55908d3` and identified the two evidence gaps closed by this correction. Astra High approved the correction at `2c3fb213` with no remaining findings. Integrated branch `0db53a280` reran the three mounted event/DB capture files: 31 pass, 284 assertions. It also reran the incident-replay and successor-access files: 7 pass, 222 assertions; the combined four-file mounted run passed 35 tests, 406 assertions. Configured backend typecheck passed uncached with module checks. Full host gate and CI remain pending; parent 5.2 is open.

## Task 3.2 consented HTTP/MCP command parity (2026-10-23)

The [bounded packet](verify-task-3.2-consented-active-command.md) uses real
OAuth consent/delegation transport with explicitly test-only synthetic active
command admission. Four watched faults failed and restored; Astra High approved
the source and correction. The integrated mounted suite passed 22 tests/732
assertions, and configured backend/MCP typecheck and lint passed uncached.
Production MCP semantic capability remains empty. Task 3.2 and the exact-head
host/CI gates remain open.

## Managed Compose gateway init prerequisite (2026-10-23)

Based on `a9829e2ed`, implemented in the isolated `/tmp/puni-gateway-init` clone.
The real swap renders `tier.compose.tmpl` through `tierComposeContext`; the separate
`previewContext` is only a build/CLI preview. Both now request `init: true` for
gateway services. Backend init remains true; frontend init remains absent. The
current production `Tier` union contains only `be`, `gw`, `fe`, so this packet does
not add MCP deployment support; preview MCP init remains absent.

This is future configuration only. No existing container was inspected, recreated,
paused, stopped or deployed. No claim establishes running gateway init, child-process
signal behavior, process-tree verification, quiescence, participant exclusion or
safe semantic activation. Parent 10.1/10.2 and the integrated host gate remain open.

Commands ran locally on `pop-os`, with existing workspace dependencies exposed by
an ignored `node_modules` symlink; no frozen installation or host-wide gate was run.

- Baseline: `bun test tools/tool-compose/src/render.test.ts --preload ./tools/test/scratch/preload.ts` exited 0: 11 pass, 0 fail.
- Red: `bun test tools/tool-compose/src/render.test.ts tools/tool-remote-scripts/src/lib/docker.test.ts --preload ./tools/test/scratch/preload.ts --timeout=10000 --test-name-pattern 'renders init'` exited 1: 12 pass, 6 fail, 139 filtered. Both gateway preview colours and all four production gateway environment/colour combinations received absent init instead of true.
- Restored green: the same targeted command exited 0: 18 pass, 0 fail, 139 filtered, 30 assertions. Parsed rendered YAML asserts the named service's init; production also asserts its sole service identity.
- `bun test tools/tool-remote-scripts/src/lib/docker.test.ts --preload ./tools/test/scratch/preload.ts --timeout=10000 --test-name-pattern tierComposeContext` exited 0: 21 pass, 0 fail, 119 filtered, 41 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-compose:test --skip-nx-cache` exited 0: 22 pass, 0 fail across two files, 50 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck build -p tool-compose,tool-remote-scripts --skip-nx-cache` exited 0: all six requested targets and two build dependencies succeeded, cache skipped. An initial invocation without those environment flags emitted socket-denial diagnostics and returned 0 without target receipts; it is not counted as verification.
- The unfiltered two-file Bun command was interrupted with exit 130 after it stalled following `assertTierEnvComplete against the release configuration > admits an env set that boots be under NODE_ENV=production`. Its synchronous configuration subprocess is not bounded by the Bun test timeout. This is an incomplete check, not a passing suite. Full `tool-remote-scripts:test` including its configured Caddy dependency was not run; focused coverage is limited to the changed renderer path.

Observed production-path fault proofs (each fault was temporary, restored in a
`finally` block, and followed by the restored green command above):

| Injected fault                                                      | Observed assertion                                                                                     | Outcome            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------ |
| Remove `tier === 'gw'` from production INIT selection               | `renders init true for the {prod,dev} gw {blue,green} service`: expected true, received undefined      | Exit 1; 4 failures |
| Remove `container.startsWith('gw-01-')` from preview INIT selection | `renders init true for the gw-01-{blue,green} preview service`: expected true, received undefined      | Exit 1; 2 failures |
| Replace production INIT selection with unconditional true           | `renders init undefined for the {prod,dev} fe {blue,green} service`: expected undefined, received true | Exit 1; 4 failures |

Adjacent `Proof:` comments identify the watched gateway branch-removal failures.
Final scoped receipts:

- `bunx prettier --check` over the six changed renderer/test/task/verify files exited 0: all matched files use Prettier style.
- `node_modules/.bin/openspec validate cross-project-dependencies --json` exited 0: one valid change, zero failed, with 18 existing long-requirement warnings in unchanged delta specs.
- `git diff --check` exited 0.

Astra High independently approved this bounded packet with no findings.
After integration as `07d0706a9`, the focused init cases passed 18 tests/30 assertions, the
production context cases 21 tests/41 assertions, configured `tool-compose:test`
22 tests/50 assertions, and
configured Compose/remote-scripts lint, typecheck and build all passed uncached
(eight targets including dependencies). Full repository checks,
`openspec validate --all --json` and the exact-head isolated host gate remain
pending.

## Task 4.4 mounted neighboring-history conflict (2026-10-23)

The [bounded mounted packet](evidence/mounted-history-neighbors/README.md)
proves an intervening remote endpoint edit leaves the older B history entry
conflicted after a newer B undo succeeds. The older undo returns exact 409,
prunes only its selected entry, preserves all other application tables and
publishes nothing. Removing the `WorkItemService.rebase` remote revision equality
turned that older undo into unsafe 200 and deleted the relationship; restored
source and two mounted cases passed 2 tests/41 assertions. Astra High approved
the packet after four captured CR line endings were normalized; the committed
range passed `git diff --check`. Integrated with incident replay, 6 tests/163
assertions passed. Parent 4.4 and full host/CI gates remain open.

## Task 7.3/7.4 bounded movement-reference parity — 2026-10-23

[The movement-reference packet](verify-task-7-movement-reference.md) records the
fractional Fast FS baseline discrepancy between durable evaluation, core
revalidation and saved history, its bounded local-reference correction and the
watched raw-reference regression. Astra High approved the bounded source
with no findings. On integrated `c1f4c3411`, four focused files passed
120 tests/391 assertions, and configured core/backend lint and typecheck passed
uncached with module checks. Parent tasks 7.3/7.4 and the exact-SHA host gate
remain open.

## Task 10.1 bounded gateway fence admission — 2026-10-23

[The admission packet](verify-gateway-fence-admission.md) refuses ordinary
Compose swaps under the deploy lock while gateway fence intent is retained,
including missing or unreadable trusted state and symlink markers. Independent
Astra High rereview approved the correction. The reviewer ran 112 focused and
293 adjacent regression tests, all passing. Integrated as `2c57b8206` and
`d459c8fdf`. The configured Caddy test and exact-SHA host gate remain open;
no marker lifecycle, process exclusion or activation is claimed.

## Task 8.3 mounted connected-save capture refusal (2026-10-23)

The [bounded packet](verify-mounted-save-refusal.md) covers absent, unreadable
and contradictory required foreign evidence through production HTTP in isolated
and shared mode. Actual foreign reads use the owned captured connection; all
SQLite tables and every push remain unchanged on refusal, followed by a healthy
restored save. Independent status-fallback, fact-agreement and persisted-code
fallback mutations produced unsafe 201 in both modes; rollback and close
removal faults broke owned transaction cleanup assertions. Restored focused
suites passed 49 tests/554 assertions. Independent Astra High review approved
with no blocking findings. Parent 8.3 and the integrated exact-SHA host gate
remain open.

## Task 9.2 bounded predecessor-scope browser persistence (2026-10-23)

[The browser packet](verify-9-2-predecessor-scope-browser.md) proves desktop
node-to-whole and phone whole-to-node edits through accepted HTTP, authoritative
refetch, reload/reopen and the same persisted SQLite relationship ID. Its
test-only writer seam leaves production authoring dormant. Configured browser
acceptance passed 3 tests; focused frontend tests passed 123. Two independent
serialization faults failed at the post-reload scope assertion. Configured
frontend lint, frontend/backend typechecks and OpenSpec 273/273 passed. Astra
High independently approved the bounded packet; integrated as `e675a7932`.
Parent 9.2 and the exact-SHA host gate remain open.

## Compute-provider dependency admission matrix reconciliation (2026-10-23)

After the compute-provider main merge, the h2puni gate on `3e8e98b99` found
one stale test expectation: five new HTTP operations were absent from the
pinned protected-operation matrix. The production exemption rule already
protects them. Updating the matrix as `a32ffb41d` restored the complete
contracts suite to 611 passed/0 failed, 2622 assertions. Temporarily exempting
`getApiOrganizationCompute-providers` moved it out of the protected set and
failed the real matrix assertion; restoring the source returned the focused
tests to 2 passed/0 failed. Changed-file ESLint, Prettier and diff checks
passed. The failing old-SHA gate is not a full verdict for this new head.

## Frontend dependency-lookup module consumer reconciliation (2026-10-23)

The h2puni gate on `3e8e98b99` found one undeclared production import:
`dependency-navigation.tsx` imports the dependency-lookup module but was absent
from its `externalConsumers` index. The pre-fix focused module graph test
failed at `dependency-lookup is imported only by its declared consumers`.
Adding that exact consumer to the established index restored the full module
graph test to 11 passed/0 failed; Prettier and `git diff --check` passed. This
is a metadata repair for an existing fail-closed check. The old-SHA gate is
not a verdict on this corrected head.

## SQLite abbreviation migration baseline reconciliation (2026-10-23)

[The ledger packet](verify-sqlite-migration-baseline.md) moves the test's
pre-abbreviation baseline past two newly merged compute-provider migrations.
The full configured SQLite suite passed 2,248 tests with one existing skip and
zero failures; the focused migration file passed 15 tests. Deleting one
retained provider ledger row in the production rollback path made the test
fail when reapplying the existing provider table. Astra High independently
reviewed the baseline and ledger proof with no blocking finding. The exact-SHA
host gate remains pending for the integrated head.

## Backend claim fixture reconciliation (2026-10-23)

The old-head h2puni backend gate exposed two existing mounted fixtures that
omitted `steps` from `claimWorkItem`. Under the new all-or-none workflow
prerequisite rule, those whole-leaf requests correctly returned
`prerequisites_unmet` before their resource and claim-cap assertions. The
swarm and compute-provider fixtures now explicitly select the ready first
step; the swarm's assignment/claimed-step assertions follow that same step.
Before the correction, the two-file run had 29 passes and five failures;
afterward it had 34 passes, zero failures and 260 assertions. Changed-file
ESLint, Prettier and diff checks passed. Production admission was unchanged;
the mounted omitted/explicit mixed-step whole-leaf refusal proof remains in
`cross-project-startable.controller.db.test.ts`. Independent review reran all
three changed backend files: 44 passes, zero failures and 298 assertions.
The old-SHA gate's Bun coverage crash and complete backend suite remain
unverified on this corrected head.

## Provider rollback sequence reconciliation (2026-10-23)

Completed old-head CI exposed one more stale backend assertion: the provider
rollback test expected only its two provider migrations, but the selected
rollback also reverses all four later cross-project migrations. The test now
pins the exact six-name reverse sequence and compares the complete CLI line.
Before correction CI failed at that assertion; afterward the entire mounted
provider migration file passed 10 tests/38 assertions. Production rollback
logic was unchanged. The integrated exact-SHA gate remains pending.

## Task 3.2 consented-scope transport parity (2026-10-23)

The [consented-scope packet](verify-task-3.2-consented-scope.md) exercises
active OAuth HTTP and generated MCP node-to-subtree SS/FF and dotted
descendant-step FS paths, endpoint and relationship IDs, journal identity,
per-call bearer isolation, and atomic rejection of an invalid 13-table
batch. The ordered OAuth suite passed 26 tests with 812 assertions. Six
production-path faults were watched fail and are recorded with their precise
boundaries; configured MCP lint and typecheck passed. Astra High reviewed the
corrected evidence with no blocker, and the committed range passes
`git diff --check`. This is a bounded test packet; task 3.2, activation and
the integrated exact-SHA gate remain open.

## Old-head h2puni gate verdict (2026-10-23)

`bin/h2puni-gate.sh 3e8e98b999e87e9019acc6648f2b1ca166aa07c7`
printed that exact running SHA and completed after 67m 36s with exit 1.
OpenSpec validated 273 changes/specs, and 176 Nx tasks succeeded. Four
targets failed: `wbs-contracts:test`, `wbs-store-sqlite:test`,
`tool-devsync:test`, and `wbs-be-01:test`. The first three failures and the
six backend assertion failures have bounded local corrections recorded above;
the backend target also panicked in Bun 1.4.2 during coverage after roughly
41 minutes. The six assertions were independently corrected and reviewed,
but the coverage panic is under separate investigation. This gate is an
old-head failure, not a pass for the integrated feature head.
