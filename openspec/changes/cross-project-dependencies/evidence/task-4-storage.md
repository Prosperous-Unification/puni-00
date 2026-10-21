# Unified local/external typed dependency storage — task 4.1

Status: implementation ready for independent review and integration; not an integrated completed slice. Root owns OpenSpec/WBS, independent Astra review, integration and required remote gate.

## Baseline and ownership

Worktree `/tmp/puni-cross-storage`, branch `feat/cross-project-dependency-storage`, base `9bce1aaabd384ae0a8bd6fc50c57d2ae9e4145b3`. Read the complete task brief and `/tmp/puni-external-storage-architecture.md`, repository instructions, approved cross-project design and delta specs. No import files or constraint classifier edited; API worker owns those. Migration identity was asserted absent immediately before creating it.

## Implementation

- Retained local `DependencyEndpoint`/`TypedDependency`; exported required scoped endpoint/relationship subtypes through existing domain wildcard barrel. Stored relationships require both endpoint projects; owner equals successor project.
- One typed store now supplies successor-owned and incident reads across both physical tables. Both component reads, strict endpoint/step/org evidence reads and duplicate identity/key checks run within one explicit transaction. Incident requests deduplicate project arguments and return deterministic relationship-ID order; no corrupt relationship deduplication.
- Added additive `20261022211000_add_external_dependencies` migration and down script. New external table has composite same-org project mappings and work-item/step project FKs; restrictive endpoint/step/mapping deletion; all discriminant/nullability/distinct-project checks; complete incident indexes and parent unique indexes. Both tables guard cross-table identity and endpoint keys on INSERT and relevant UPDATE. Existing local rows/table retained.
- Add/update/remove retain gate and transactional boundary; representation moves delete then insert atomically with original ID/creation audit (including legacy nulls), normal update time and deduplicated old/new endpoint revision bumps. Destination/revision failure tests prove rollback.
- Bulk removal refuses before mutation if an external predecessor is doomed while its successor survives; owned doomed external successors and local incident links remain journalable.
- Memory fixture explicitly documents its identity/uniqueness testing boundary, adds scoped owner/immutable-owner enforcement, incident queries, endpoint moves and protected deletion. SQLite alone proves endpoint/organization integrity. Shared conformance now exercises owned/incident/movement; its SQLite typed fixture seeds real same-org ownership.
- Local constructors attach known projects; remaps/copies retain scoped endpoints. Legacy journal decoding explicitly normalizes complete unscoped local payloads and validates complete scoped payloads, rejects mixed/partial malformed scope, and normalizes nested batches. Historical captures explicitly project old endpoint fields and refuse incident external links in either direction using one core projection helper; no transfer/capture version change.
- Current applied/reversed migration expectations were individually inspected and updated in migrate{,-down}.db.test.ts; historical target constants and prior-only rollback expectations retained.

## RED / GREEN evidence

Commands run from `/tmp/puni-cross-storage`, Bun 1.4.2. No full gate/build or h1claw work performed.

- Initial memory fixture test: 3 pass/3 fail; missing incident method, missing owner refusal, unsafe predecessor deletion. After implementation:6 pass/0 fail.
- Initial external DB suite:0 pass/6 fail at the old local-only endpoint boundary. After implementation:6 pass/0 fail; expanded suite later16 pass/0 fail (75 assertions), then18 cases including indexes/ownership-row restrictions added.
- History normalization tests watched RED before decoder change (`/tmp/puni-storage-history-red.log`). Historical capture test watched RED because scoped endpoint project fields leaked into old bodies, and explicit external refusal watched RED because old capture resolved (`/tmp/puni-storage-integration-red.log`, `/tmp/puni-storage-capture-red.log`).
- Focused typed store/external/saved capture/history/working-plan tests:102 pass/0 fail (`/tmp/puni-storage-focused.log`).
- Full memory + SQLite source conformance files:150 pass/0 fail,12,318 assertions (`/tmp/puni-storage-conformance.log`).
- Current migration/rollback ledger suites:91 pass/0 fail,440 assertions (`/tmp/puni-storage-ledger.log`).
- Expanded mounted typed/copy/lifecycle/graph/saved tests initially94 pass/1 historical expected-shape failure; fixture corrected explicitly to remain unscoped (`/tmp/puni-storage-mounted-final.log`).
- Latest focused mounted commands/saved routes + work-item resource unit + external DB suite:212 pass/0 fail,716 assertions (`/tmp/puni-storage-final-regression.log`). This includes real first-child hand-down/undo regressions.
- Migration lint executed successfully against both new SQL paths with `bun tools/tool-git-hooks/src/hooks/migration-lint.ts ...`.
- ESLint all changed TypeScript paths:initial9 errors; corrected imports/precise selectors/async boundaries, then `eslint --fix` exit0 (`/tmp/puni-storage-lint-fix.log`). Final format/lint/check evidence pending below.

## R5 watched faults

`/tmp/puni-storage-mutate.py`, `/tmp/puni-storage-mutate-corrected.py` and `/tmp/puni-storage-mutate-extra.py` contain exact edits and commands. Each mutation restores the original source in `finally`; no fault left installed. Individual full outputs live in `/tmp/puni-storage-mutations/<fault>.log`.

First batch distinct faults39: successor-owner agreement; work-item, step, org mapping and recorded-org read evidence; duplicate physical IDs and keys; protected predecessor deletion; immutable owner; historical capture external refusal; mixed history scope and history successor owner; fixture owner/immutable owner/deletion; working-plan incident authorization; external retention on down; all8 SQL cross-table triggers; all6 composite ownership FKs; both scope checks, relationship type, both step-nullability checks, distinct project check, non-null ID and external endpoint unique index.

Important proof corrections: initially removing complete trigger/index declarations created empty migration statements, so those were setup failures and not accepted as evidence. Replaced each removed declaration with valid `SELECT 1;` and reran all8 triggers plus unique-index negative. Initial scope negatives were masked by step-nullability; supplied valid referenced steps with the unknown scopes and reran both individual checks. Distinct-project negative was also changed to a valid same-project work-item pair to isolate that check. Every corrected removal fails at its production negative, with `Received function did not throw`; the error is not a migration setup failure. Read guard removals returned injected corrupt rows (`Received: (resolved)`). Down guard removal dropped the meaningful external row/ledger, and its actual rollback test failed. Summary overrides are `/tmp/puni-storage-mutations/summary-corrected.json`; use them instead of invalid initial entries. No SQL guard or FK was merely inferred from an exit code.

Additional fault batch passed the proof requirement: all8 removals (history full/endpoint/project/step/whole shape, fixture required predecessor project, incident closed-plan boundary and coherent read transaction) failed their matching negatives. Coherent transaction removal saw both old local and new external representations and threw duplicate identity. `/tmp/puni-storage-mutations/summary-extra.json` records exact commands and observed failures. A final required-local-table-read substitution in down.sql also failed its missing-table reason assertion (`/tmp/puni-storage-mutations/down-missing-local-table.log`). Total48 distinct watched faults; adjacent Proof comments name observed failing tests only.

## Known integration / verification boundaries

- API worker has destination projectId scoped import remap changes in its worktree. This worktree intentionally leaves import files untouched. Last storage+memory typecheck and expanded be-01 app typecheck report those known import diagnostics; the expanded app check also found typed fixture diagnostics now adapted. A fully integrated green typecheck has not been claimed.
- Existing `audit.test.ts` fails on baseline `project-abbreviation.ts: update of projectAbbreviation` lacking an `auditOnUpdate` token; root/API worker informed. Storage insert and update audit policy checks themselves introduce no exemptions. This unrelated file was preserved.
- No complete feature activation, authoring capability barrier, connected capture/scheduler, full remote gate, deployment or OpenSpec checkoff claimed. Those belong to later slices/root.

## Final focused evidence

- After restoring all faults, adding Proof comments and formatting: `bun test` the external DB, local typed DB/migration/rollback, memory typed fixture, compensating history, working-plan and plan-commands files:160 pass/0 fail,626 assertions (`/tmp/puni-storage-final-focused.log`). External suite now18 tests, including ownership-map deletion/update restrictions and complete incident indexes.
- Final all-changed-TypeScript ESLint exit0; Prettier --check exit0, “All matched files use Prettier code style!” (`/tmp/puni-storage-final-lint.log`, `/tmp/puni-storage-final-format-check.log`). `git diff --check` exit0. Migration lint rerun after final SQL Proof comments exit0.
- Local work-item resource + mounted commands/saved routes/external suite212 pass/0 fail remains the fresh functional regression evidence preceding comment/format-only changes; full source conformance150 pass and migration ledger91 pass are recorded above. No full Nx gate substituted for these checks.

## Self-review

Coherent reads use explicit transactions and strict checked reads, not INNER JOIN omission. Strict evidence excludes leafhood so hand-down can read between first-child insertion and endpoint remap. Local↔external movement retains ID/null creation audit and uses one transaction with revision union bumps; failure rollback is proven at destination insertion and revision write. SQL ownership constraints also protect updates to referenced parent project identity. Capture checks incident links so outgoing-only external links cannot be stripped into a local historical body. Current type diagnostics are deliberately not suppressed; import integration remains required. No raw local backup format was extended to pretend it can back up external rows. No project abbreviation/API/import changes were made.

The previous audit policy failure is an independent known baseline/integration item, not hidden by an exemption or altered abbreviation implementation. OpenSpec checkoff, integrated all-target types, independent review, full required host gate and feature release remain pending root work.

## Changed paths

- `apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts`
- `apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts`
- `apps/wbs/be-01/src/controller/typed-dependency-graph.controller.db.test.ts`
- `apps/wbs/be-01/src/controller/typed-dependency-lifecycle.controller.db.test.ts`
- `libs/wbs/adapters/store-memory/src/memory-source.test.ts`
- `libs/wbs/adapters/store-memory/src/source.ts`
- `libs/wbs/adapters/store-memory/src/typed-dependency-fixture.test.ts`
- `libs/wbs/adapters/store-memory/src/typed-dependency-fixture.ts`
- `libs/wbs/adapters/store-sqlite/src/migrate-down.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/migrate.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/saved-plan-capture.ts`
- `libs/wbs/adapters/store-sqlite/src/schema.ts`
- `libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/typed-dependency-rollback.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/typed-dependency.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/typed-dependency.ts`
- `libs/wbs/application/conformance/src/stores/saved-plan-capture.ts`
- `libs/wbs/application/conformance/src/stores/typed-dependencies.ts`
- `libs/wbs/application/core/src/index.ts`
- `libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts`
- `libs/wbs/application/core/src/module/plan-commands/working-plan.resource.ts`
- `libs/wbs/application/core/src/module/plan-commands/working-plan.test.ts`
- `libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts`
- `libs/wbs/application/core/src/module/work-item/work-item.resource.ts`
- `libs/wbs/application/core/src/ports/typed-dependency-store.ts`
- `libs/wbs/application/core/src/service/compensating.test.ts`
- `libs/wbs/application/core/src/service/compensating.ts`
- `libs/wbs/domain/domain/src/typed-dependency.ts`
- `apps/wbs/be-01/drizzle/20261022211000_add_external_dependencies/down.sql`
- `apps/wbs/be-01/drizzle/20261022211000_add_external_dependencies/migration.sql`
- `libs/wbs/adapters/store-sqlite/src/external-dependency-migration.db.test.ts`
- `libs/wbs/application/core/src/service/local-typed-dependency.ts`

## Commit handoff

Attempted `git add -- <all33 explicitly collected changed paths>` after verification. Git exited128 before staging: `Unable to create '/home/df/wd/puni/puni-00/.git/worktrees/puni-cross-storage/index.lock': Read-only file system`. No commit attempted and no staged partial state created. Root must stage the33 named paths above and commit through normal hooks; no --no-verify or metadata workaround was used.

## Independent review fix round 1/5

Baseline: clean frozen storage commit `14b43aab431c1d2cb87f72fc217f9235920e01d9`. Read the complete review `/tmp/puni-external-storage-review.md` and its concrete production probe `/tmp/puni-storage-review-probe.ts`. Both P2 findings were verified against the implementation, then addressed in `/tmp/puni-cross-storage` without import, abbreviation/audit, constraint classifier, project/API, migration or OpenSpec edits.

### P2: identity corruption hidden by ownership/incident/work-item filters

Added five real SQLite corruption cases: valid local `B.b2 → B.b` and valid external `B.b → A.a` share `same-id`, after dropping only the external INSERT identity trigger. All project/work-item/organization evidence remains valid. Both owned reads, incident A, and separate `removeAllFor(['a'])` / `removeAllFor(['b2'])` paths must refuse. Every restored-guard case asserts unchanged complete raw local/external rows (including all creation/update audit) and work-item revisions/update instants.

RED command: `bun test libs/wbs/adapters/store-sqlite/src/external-dependency-migration.db.test.ts -t 'hidden by'`:0 pass/5 fail, all five incorrectly resolved (`/tmp/puni-storage-review-fix1-red.log`).

`readPhysical` now checks selected local IDs against the external table and selected external IDs against the local table independently of each query's owner/project/work-item filter. Both checked ID queries stay within the existing read transaction; they return no out-of-scope relationships. Removed the obsolete ID set over filtered rows; endpoint-key corruption checks remain. GREEN: same command5 pass/0 fail,20 assertions (`/tmp/puni-storage-review-fix1-green.log`).

R5 isolated fault: in `typed-dependency.ts`, replaced only `if (duplicate !== undefined)` with `if (false)`, ran the same five-case command, and observed0 pass/5 fail with `Received: "(resolved)"` for both owners, incident A and both removal paths. Restored source in `finally`. Exact script `/tmp/puni-storage-review-fix-mutate.py`, summary `/tmp/puni-storage-review-fix-mutations.json`, full fault output `/tmp/puni-storage-review-fix-filtered-identity-mutation.log`. Added an adjacent Proof comment naming the actual five-case negative.

### P2: owner immutability needs a coherent behavioral negative

Replaced the invalid top-owner-only proposal in the existing SQLite test with a complete local-to-local move to another seeded project: top-level owner and both endpoint projects agree, both destination work items really belong to that project, both whole scopes are valid and no organization/representation guard is involved. The refusal test now checks both project read scopes, complete raw physical rows/audit and all four old/new endpoint revisions/update instants. Baseline guard-on command `bun test libs/wbs/adapters/store-sqlite/src/typed-dependency.db.test.ts -t 'refuses moving a typed'`:1 pass/0 fail,6 assertions (`/tmp/puni-storage-review-fix2-baseline.log`).

R5 isolated fault: replaced only `if (prior.dependency.projectId !== row.projectId)` with `if (false)`, ran that command, and observed0 pass/1 fail with `Received: "(resolved without throwing)"`: the coherent owner move was accepted, rather than refused by successor agreement or another constraint. Restored source in `finally`. Full output `/tmp/puni-storage-review-fix-coherent-owner-move-mutation.log`; the script/summary above record exact edit/command. Replaced the old diagnostic-precedence Proof with this actual owner-invariant Proof.

### Correction to earlier proof accounting

The original `immutable-owner.log` established diagnostic precedence only and is superseded by the coherent owner-move fault above; it must not be counted as an isolated owner-invariant proof. The earlier `down-missing-local-table.log` remains strictly a diagnostic-only negative: replacing the explicit read changed the error from missing table to missing trigger, and did not establish a newly possible successful destructive rollback. The separate retained-external down fault (`down-external-retention.log`) is the proof that bypassing the retention barrier actually loses a meaningful external row and ledger. The earlier48-fault total describes watched faults, not48 independent integrity invariants. This round adds two current behavioral fault observations with the distinctions above.

### Restored-source verification

- `bun test` local typed DB, external migration/repository DB, memory typed fixture and local typed rollback files:47 pass/0 fail,209 assertions (`/tmp/puni-storage-review-fix-focused.log`). Includes complete owned/incident/movement/removal/coherent-snapshot regression cases.
- `bun test libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts -t 'terminal certification'`:1 pass/0 fail,1,969 assertions; the exact offered case certification includes `typedDependencies.write:identity-and-bulk`, owned/incident/moves and removal (`/tmp/puni-storage-review-fix-conformance.log`). Other74 scenarios explicitly filtered out; no unrelated broad gate repeated.
- ESLint, Prettier --check and git diff --check were run only against the three changed paths. Their final exit evidence is recorded in `/tmp/puni-storage-review-fix-{lint,format,diff}.log` and tool output.

Changed tracked paths this round:

- `libs/wbs/adapters/store-sqlite/src/typed-dependency.ts`
- `libs/wbs/adapters/store-sqlite/src/typed-dependency.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/external-dependency-migration.db.test.ts`

No integrated typecheck, import/audit verification, full Nx/host gate, commit, feature activation or OpenSpec checkoff claimed. Combined types remain pending API integration. Root owns the normal-hook commit and scoped Astra re-review; shared Git metadata remains outside this worker's writable roots.

## Integration fixture typing fix 2

Baseline: clean storage branch `da756535c`; root integrated the approved storage fixes with the API lane and reported two core spec-fixture diagnostics in `/tmp/puni-cross-storage-integrated-types.log`. This round changes only `libs/wbs/application/core/src/service/compensating.test.ts`.

The legacy local typed relationship fixture now uses `as const` to retain the whole/node and FS discriminants. A separate expected scoped dependency is constructed from those known fixture values. Both top-level and nested-batch equality assertions use that expected value directly; the batch expectation no longer spreads `readCommand`'s full `CompensatingCommand` union under a different discriminator. The historical input remains unscoped, the exact normalized output and touched-ID/subject assertions remain intact, and no production semantics, casts to broader types, malformed-history tests or assertions were weakened.

Fresh precise RED check: `bunx tsc --project libs/wbs/application/core/tsconfig.spec.json --noEmit --incremental false` exited1 and reported four diagnostics: the two known import callers plus `compensating.test.ts:36` and `:50` (`/tmp/puni-storage-fix2-types-red.log`). After the fixture edit, the same precise command still exits1 because this isolated branch lacks the API import adaptation; its only two diagnostics are `plan-import.feature.ts:570–571`. Both compensating fixture diagnostics are gone (`/tmp/puni-storage-fix2-types-restored.log`). This is evidence for the fixture correction, not a green integrated core typecheck; root must rerun that after cherry-pick.

Focused command `bun test libs/wbs/application/core/src/service/compensating.test.ts`:38 pass/0 fail,127 assertions (`/tmp/puni-storage-fix2-focused.log`). File-scoped ESLint, Prettier --check and git diff --check were run; exact output lives in `/tmp/puni-storage-fix2-{lint,format,diff}.log`.

Explicit tracked manifest for root's normal-hook commit:

- `libs/wbs/application/core/src/service/compensating.test.ts`

No other tracked file changed; no production/import/API/audit edits, subagents, full gates, commit or integrated-green claim. This report append is an external handoff artifact, not a tracked OpenSpec edit.

## Durable proof artifacts and integration status

Reviewed original `14b43aab4` and scoped fix `da756535c` integrated as `772fe335e` and `a7688e9f0`; test-only typing correction `8d6083056` integrated as `7e1b083d5`. Independent [Astra review](task-4-storage-review.md) approved production storage and both P2 fixes. The final test-only fixture correction preserves exact expected normalization and removes a misleading union spread; root inspected that diff.

Fresh combined API/storage behavior check at `a7688e9f0`: 215 passed, 990 assertions across 11 files including import, audit, history, local/external repositories and mounted typed graph/commands. Fresh memory, SQLite, backend and module typechecks passed. Core typecheck exposed two fixture inference errors, corrected in the final test-only commit; its integrated rerun is recorded in verify.md when available. No full feature/gate/CI/deploy claim.

Fault outputs are retained in [task-4-storage-proofs](task-4-storage-proofs/), with trailing terminal whitespace normalized. Mutation scripts are retained as text, not executable repository tooling. Their original absolute worktree paths are historical evidence, not portable replay commands. The original summary includes invalid setup attempts; corrected and extra summaries supersede affected entries. In particular, the original immutable-owner proof is diagnostic-only and is superseded by the coherent-owner-move proof; down-missing-local-table remains diagnostic-only. This is 48 original watched faults plus two corrected review negatives, not 50 independent proven invariants.

- [capture-external.log](task-4-storage-proofs/capture-external.log)
- [coherent-union-transaction.log](task-4-storage-proofs/coherent-union-transaction.log)
- [down-external-retention.log](task-4-storage-proofs/down-external-retention.log)
- [down-missing-local-table.log](task-4-storage-proofs/down-missing-local-table.log)
- [duplicate-physical-id.log](task-4-storage-proofs/duplicate-physical-id.log)
- [duplicate-physical-key.log](task-4-storage-proofs/duplicate-physical-key.log)
- [external_dependency_cross_endpoints_insert.log](task-4-storage-proofs/external_dependency_cross_endpoints_insert.log)
- [external_dependency_cross_endpoints_update.log](task-4-storage-proofs/external_dependency_cross_endpoints_update.log)
- [external_dependency_cross_identity_insert.log](task-4-storage-proofs/external_dependency_cross_identity_insert.log)
- [external_dependency_cross_identity_update.log](task-4-storage-proofs/external_dependency_cross_identity_update.log)
- [fixture-immutable-owner.log](task-4-storage-proofs/fixture-immutable-owner.log)
- [fixture-owner.log](task-4-storage-proofs/fixture-owner.log)
- [fixture-predecessor-delete.log](task-4-storage-proofs/fixture-predecessor-delete.log)
- [fixture-predecessor-scope.log](task-4-storage-proofs/fixture-predecessor-scope.log)
- [foreign-key-predecessor_project_id.log](task-4-storage-proofs/foreign-key-predecessor_project_id.log)
- [foreign-key-predecessor_step_id.log](task-4-storage-proofs/foreign-key-predecessor_step_id.log)
- [foreign-key-predecessor_work_item_id.log](task-4-storage-proofs/foreign-key-predecessor_work_item_id.log)
- [foreign-key-successor_project_id.log](task-4-storage-proofs/foreign-key-successor_project_id.log)
- [foreign-key-successor_step_id.log](task-4-storage-proofs/foreign-key-successor_step_id.log)
- [foreign-key-successor_work_item_id.log](task-4-storage-proofs/foreign-key-successor_work_item_id.log)
- [history-endpoint-shape.log](task-4-storage-proofs/history-endpoint-shape.log)
- [history-partial.log](task-4-storage-proofs/history-partial.log)
- [history-project-shape.log](task-4-storage-proofs/history-project-shape.log)
- [history-required-shape.log](task-4-storage-proofs/history-required-shape.log)
- [history-step-shape.log](task-4-storage-proofs/history-step-shape.log)
- [history-successor-owner.log](task-4-storage-proofs/history-successor-owner.log)
- [history-whole-step.log](task-4-storage-proofs/history-whole-step.log)
- [immutable-owner.log](task-4-storage-proofs/immutable-owner.log)
- [incident-closed-boundary.log](task-4-storage-proofs/incident-closed-boundary.log)
- [incident-project-boundary.log](task-4-storage-proofs/incident-project-boundary.log)
- [organization-evidence.log](task-4-storage-proofs/organization-evidence.log)
- [organization-row-evidence.log](task-4-storage-proofs/organization-row-evidence.log)
- [owner.log](task-4-storage-proofs/owner.log)
- [predecessor-delete.log](task-4-storage-proofs/predecessor-delete.log)
- [puni-storage-fix2-focused.log](task-4-storage-proofs/puni-storage-fix2-focused.log)
- [puni-storage-fix2-types-red.log](task-4-storage-proofs/puni-storage-fix2-types-red.log)
- [puni-storage-fix2-types-restored.log](task-4-storage-proofs/puni-storage-fix2-types-restored.log)
- [puni-storage-mutate-corrected.py.txt](task-4-storage-proofs/puni-storage-mutate-corrected.py.txt)
- [puni-storage-mutate-extra.py.txt](task-4-storage-proofs/puni-storage-mutate-extra.py.txt)
- [puni-storage-mutate.py.txt](task-4-storage-proofs/puni-storage-mutate.py.txt)
- [puni-storage-review-fix-coherent-owner-move-mutation.log](task-4-storage-proofs/puni-storage-review-fix-coherent-owner-move-mutation.log)
- [puni-storage-review-fix-filtered-identity-mutation.log](task-4-storage-proofs/puni-storage-review-fix-filtered-identity-mutation.log)
- [puni-storage-review-fix-mutate.py.txt](task-4-storage-proofs/puni-storage-review-fix-mutate.py.txt)
- [puni-storage-review-fix-mutations.json](task-4-storage-proofs/puni-storage-review-fix-mutations.json)
- [sql-different-projects.log](task-4-storage-proofs/sql-different-projects.log)
- [sql-id-null.log](task-4-storage-proofs/sql-id-null.log)
- [sql-predecessor-scope.log](task-4-storage-proofs/sql-predecessor-scope.log)
- [sql-predecessor-step.log](task-4-storage-proofs/sql-predecessor-step.log)
- [sql-successor-scope.log](task-4-storage-proofs/sql-successor-scope.log)
- [sql-successor-step.log](task-4-storage-proofs/sql-successor-step.log)
- [sql-type.log](task-4-storage-proofs/sql-type.log)
- [sql-unique-endpoints.log](task-4-storage-proofs/sql-unique-endpoints.log)
- [step-evidence.log](task-4-storage-proofs/step-evidence.log)
- [summary-corrected.json](task-4-storage-proofs/summary-corrected.json)
- [summary-extra.json](task-4-storage-proofs/summary-extra.json)
- [summary.json](task-4-storage-proofs/summary.json)
- [typed_dependency_cross_endpoints_insert.log](task-4-storage-proofs/typed_dependency_cross_endpoints_insert.log)
- [typed_dependency_cross_endpoints_update.log](task-4-storage-proofs/typed_dependency_cross_endpoints_update.log)
- [typed_dependency_cross_identity_insert.log](task-4-storage-proofs/typed_dependency_cross_identity_insert.log)
- [typed_dependency_cross_identity_update.log](task-4-storage-proofs/typed_dependency_cross_identity_update.log)
- [work-item-evidence.log](task-4-storage-proofs/work-item-evidence.log)
