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

| Check / task                                    | Planned fault injection                                                                                                      | Production-path test that must observe failure                                                                                            | Observed result                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Grammar 1.1 / 2.2                               | Remove length, leading-letter, character or first-dot check individually                                                     | `project-address.test.ts` named grammar cases, then `project-address.controller.db.test.ts` malformed admission                           | 1.1: 11 restored failures; 2.2 HTTP: observed rejection bypass, [API proof](evidence/task-2-api.md)   |
| Backfill/allocation 2.1                         | Omit backfill or allocator; disable namespace trigger/unique index; exhaust counter                                          | `project-abbreviation-migration.db.test.ts` old-writer/concurrent/backfill/namespace/exhaustion cases                                     | Observed; see task2 storage evidence and diagnostic-only limits                                       |
| Required project state 2.2                      | Delete or corrupt abbreviation row; bypass trusted-row guard                                                                 | `project-address.controller.db.test.ts`: absent/malformed rows refuse                                                                     | Observed trusted decoder fault; [API proof](evidence/task-2-api.md)                                   |
| Organization and bounded lookup 3.1             | Remove project/organization predicate or response bound                                                                      | `project-address-search.controller.db.test.ts` scoped/bounded/foreign cases                                                               | Observed selected lookup faults; [search evidence](evidence/task-3-search.md)                         |
| HTTP/MCP boundary 3.2                           | Remove shared endpoint/version shape validation                                                                              | Mounted HTTP/MCP malformed scope/type/ID cases                                                                                            | NOT RUN                                                                                               |
| Relationship integrity 4.1                      | Remove each endpoint/project/step/organization/duplicate check                                                               | Unified repository and migration DB cases                                                                                                 | Observed/restored migration, store and review faults; [evidence](evidence/task-4-storage.md)          |
| Current write authority 4.2                     | Bypass current access, successor owner or remote endpoint shape                                                              | `cross-project-dependency-commands.controller.db.test.ts` revoked/foreign/second-owner cases; assert no partial state                     | NOT RUN                                                                                               |
| Actual graph 4.3                                | Omit expanded pair; use project DAG; use target reach globally; skip each structural admission site                          | `connected-step-node.test.ts` and mounted cycle/structural cases, retaining valid interleaving positive                                   | Foundation observed; structural integration NOT RUN; [graph evidence](evidence/task-4-graph.md)       |
| Lifecycle/history 4.4                           | Remove deletion refusal, incident map, touched-ID/replay graph/current-access check separately                               | External deletion/hand-down/concurrent undo/redo controller cases                                                                         | NOT RUN                                                                                               |
| Coherent capture 5.1                            | Remove transaction; read cache/derive after closure; replace borrowed DB; omit close                                         | `connected-plan-capture.db.test.ts` concurrent endpoint and cache publication, borrowed and lifecycle cases                               | NOT RUN                                                                                               |
| Capture authority/completeness 5.1              | Omit closure or authorization; delete/corrupt/unreadably supply required evidence                                            | Production factory capture cases; distinguish absence/unreadability where contract does                                                   | NOT RUN                                                                                               |
| Post-commit scoped fanout 5.2                   | Drop dependency traversal, emit before commit, bypass organization filter                                                    | `cross-project-events.controller.db.test.ts` no-shared-person, rollback and label privacy cases                                           | NOT RUN                                                                                               |
| Placement constraints 6.1                       | Remove each eligibility/type inequality, capacity namespace or held reduction                                                | `schedule-connected.test.ts` and existing priority/resource/hold regressions                                                              | Domain seam observed; core/calendar/runtime NOT RUN; [evidence](evidence/task-6-resolved-schedule.md) |
| Calendars 6.2                                   | Substitute target anchor, round fractional bounds, omit floor, use day zero for missing date                                 | `schedule-connected-calendar.test.ts` and mounted missing-calendar projection                                                             | NOT RUN                                                                                               |
| Readiness 6.3                                   | Replace remote progress with empty/local progress or skip required evidence                                                  | `cross-project-startable.controller.db.test.ts` actual tree/startable cases                                                               | NOT RUN                                                                                               |
| Wire/model 7.1–7.2                              | Omit each bound/version/model inequality or Python schema member                                                             | Production request fixtures, actual solver/validate tests, omitted-expanded-pair case                                                     | NOT RUN                                                                                               |
| Boundary-infeasible preparation/outcome 7.2–7.3 | Require fake quantized feasible baseline; reject empty integer window; map stage outcome to malformed/global infeasible      | Real 0.2→one-day→1.2 quantum48 preparation/solve/exit/read cases, with and without local deadlines                                        | NOT RUN                                                                                               |
| Composite and proof scope 7.3                   | Bypass stage bound, foreign pinning, full-component validation or certificate scope                                          | `connected-optimization.test.ts` mixed/interleaved stages and proof/comparison cases                                                      | NOT RUN                                                                                               |
| Question identity 7.4                           | Remove every new hash member one at a time                                                                                   | Hash/cache tests for stable endpoints, type, anchors, capacity/mode, rank, boundaries, versions; report each separately                   | NOT RUN                                                                                               |
| Publication 7.4                                 | Bypass exact identity/generation/foreign-start/materialized FS SS FF check separately                                        | `connected-publication.test.ts` stale and forged solver responses                                                                         | NOT RUN                                                                                               |
| Terminal cache/restart/Retry 7.4                | Reuse failure/global-infeasible persistence; retain slot; bypass same-question retry suppression                             | DB/read/restart/manual Retry cases assert boundary-infeasible retained, slot released, no attempt; changed identity admits fresh question | NOT RUN                                                                                               |
| Capture non-admission 5.1 / 7.4 / 8.4           | Substitute admitting optimizer reader                                                                                        | Mounted captured/live reads assert no generation, queue entry, slot or event                                                              | NOT RUN                                                                                               |
| Transfer 8.1                                    | Drop external evidence/version guard; rebind by reused text; bypass current mapping/access/graph; fail after staged creation | Mounted export/import/rollback cases                                                                                                      | NOT RUN                                                                                               |
| Copy 8.2                                        | Clone outgoing incident links, reuse IDs, bypass current access/graph                                                        | `typed-dependency-copy.controller.db.test.ts` no foreign-owner mutation and identity cases                                                | NOT RUN                                                                                               |
| Immutable history 8.3                           | Reread live foreign facts; omit required captured evidence; escape save transaction                                          | Actual save/read/compare tests with renamed/deleted/unreadable live endpoints                                                             | NOT RUN                                                                                               |
| Reader parity and closure 8.4–8.5               | Route surface through old rank-only path; derive after closure; truncate closure at search page size                         | Mounted tree/batch/load/spaces/arrangement/restart and capture-count cases                                                                | NOT RUN                                                                                               |
| UI 9.1–9.2                                      | Remove alpha/stale-token/cancel guards; substitute local step UUID; collapse refusal to empty; permit terminal Retry         | Mounted reference field/editor/settings/cards and outcome cases                                                                           | NOT RUN                                                                                               |
| Semantic activation 10.1                        | Skip participant capability, activation, startup or active-edge downgrade check                                              | Actual startup and `cross-project-activation.controller.db.test.ts` dormant/overlap/active cases                                          | NOT RUN                                                                                               |
| Deploy/restore 10.2                             | Suppress candidate capability; omit applied capture/hash member; edit applied migration; fail restore                        | Compose/Kubernetes production deploy adapter tests; inspect full ledger and pinned recovery command                                       | NOT RUN                                                                                               |

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
