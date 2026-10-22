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
