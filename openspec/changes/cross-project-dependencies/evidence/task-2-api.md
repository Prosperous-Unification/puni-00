# Slice 2.2 project abbreviation API integration

Worktree: `/tmp/puni-cross-api`, branch `feat/cross-project-abbrev-api`, base `3fd1d9dce`. Only task 2.2 implemented; OpenSpec and WBS ledger remain root-owned. No external dependency authoring or abbreviation editor UI added.

## Implementation

- Required persisted abbreviation on live Project and HTTP read/list/create/PATCH responses. NewProject may omit it. Both store creation paths return typed abbreviation_taken/abbreviation_exhausted; both edit paths return typed conflict. Legacy ProjectService.create also exposes modeled creation refusals per Astra ruling; test-only expectCreated unwraps successful fixture premises.
- Automatic allocation uses reviewed ordered suggestions then three-letter stem plus AA..ZZ, deduplicated, within destination namespace and excluding the inserted project's temporary code. Existing legacy trigger still runs first. Project, counter advance, ownership, steps and selected abbreviation roll back together on modeled exhaustion/conflict. Exact legacy counter exhaustion message is translated; unexpected counter/state errors still throw.
- POST/PATCH optional manual abbreviation parses once at resource boundary, normalizing ASCII lowercase without trimming. Invalid input422, collision409, exhaustion409. Existing organization/edit checks precede conflict disclosure. Same-code-only PATCH preserves revision/audit; actual changes bump/stamp parent transaction once. Name-only writes and old SQL writers retain code.
- Shared pure decodeProjectAbbreviation validates joined trusted state. All repository reads, slug paths, list/paged list and post-write rereads LEFT JOIN abbreviation/ownership, preserving missing-row failures and organization filtering before decode. listFor remains one SQL statement.
- Historical/document project schema accepts missing abbreviation and validates present captured metadata; live schema requires it. No document version bump or live historical lookup. Import allocates destination identity, propagates creation refusal with commit:false, and rolls back directory changes too. v9 historical golden excludes only additive metadata; v10 current golden includes captured abbreviation.
- Memory/conformance/client fixtures updated. Frontend exhaustive project refusal classification and import exhaustion wording accommodate new shared contract outcomes; no editor UI. Imported typed dependency remap adds destination projectId to both whole and step-scoped variants, as coordinated for root's upcoming4.1 integration.

## Verification evidence

All commands ran on pop-os using Bun/Nx. The initial Nx default invocation returned0 after sandbox socket refusal without executing targets; it is explicitly NOT evidence. Subsequent Nx commands used `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`; final typecheck runs used `--skipNxCache`.

- RED: `bun test apps/wbs/be-01/src/controller/project-address.controller.db.test.ts`: 0pass/7fail before production changes. `/tmp/puni-cross-api-red.log`.
- Initial focused GREEN: new mounted controller + SQLite project repository + project/solution contracts + project module:60pass/0fail,252 assertions. `/tmp/puni-cross-api-tests6.log`.
- Mounted project/import regression: `bun test` new address controller, project-organization controller, project.controller.test, import-export-organization controller:121pass/0fail,605 assertions. `/tmp/puni-cross-api-mounted-final.log`.
- Changed fixture callers batch:503pass,1pre-existing skip,2canonical-byte failures; fixed additive metadata goldens and reran plan-document plus five subsequently narrowed backend fixture suites:197pass/0fail,509 assertions. `/tmp/puni-cross-api-adapted-tests.log`, `/tmp/puni-cross-api-fixtures-followup.log`. Existing skip: memory assignSubtree beyond batch, stale-undo case.
- Project conformance fault tests: `bun test libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts -t 'reinjects project step'`:2pass/0fail,182 assertions. `/tmp/puni-cross-api-conformance.log`.
- One-statement list test is in passing project.db.test.ts batch: `costs one statement however many projects there are`,50projects/one SQL query.
- Historical v10 mounted test removes captured abbreviation and validates document successfully, asserts live project rejects absence and document rejects malformed present metadata, then imports with fresh allocated PUNI rather than SOURCE. In passing controller batches above. v9 original byte digest retained after stripping only additive metadata; current v10 metadata digest updated and tested.
- Frontend RED: new plan-writer classifier test threw Unexpected response variant; import exhaustion wording test similarly failed. `/tmp/puni-cross-api-fe-red.log`, `/tmp/puni-cross-api-fe-import-red.log`.
- Frontend final: from apps/wbs/fe-01, `bunx vitest run --config vitest.config.ts src/components/wbs/plan-import-words.test.ts src/modules/plan-writer/plan-writer.test.ts src/lib/wbs-api.test.ts src/lib/api.test.ts src/testing/fake-project-api.test.ts`:5files/121pass. `/tmp/puni-cross-api-fe-final.log`. Existing Vite native-config advisory warning remains; selected tests completed.
- Fresh Nx core typecheck incl17module checks:PASS. `/tmp/puni-cross-api-coretypes2.log`.
- Fresh Nx contracts, store-memory, store-sqlite typechecks:PASS; initial same batch backend typecheck exposed fixture narrowing needs. `/tmp/puni-cross-api-types-final.log`. Backend follow-up all module+app typechecks PASS: `/tmp/puni-cross-api-betypes2.log`.
- Fresh frontend all module+app typechecks PASS: `/tmp/puni-cross-api-fetypes3.log`.

## Observed production-path negative proofs

Each mutation was restored before later checks; production source contains adjacent exact Proof comments.

| Check                             | Injected fault                          | Mounted observation                                   | Log                                             |
| --------------------------------- | --------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Manual PATCH grammar              | bypass parse refusal                    | invalid empty code accepted200, expected422           | `/tmp/puni-cross-api-mutation-grammar.log`      |
| Duplicate conflict translation    | bypass exact unique-constraint mapping  | duplicate manual edit500, expected409                 | `/tmp/puni-cross-api-mutation-conflict.log`     |
| Trusted joined namespace          | remove namespace guard                  | forged namespace read200, expected500                 | `/tmp/puni-cross-api-mutation-trusted.log`      |
| Organization filter before decode | remove findInOrganization predicate     | foreign viewer edit403, expected indistinguishable404 | `/tmp/puni-cross-api-mutation-organization.log` |
| Parent audit                      | remove auditOnUpdate from parent update | code-only edit retained updated_at1, expected>1       | `/tmp/puni-cross-api-mutation-parent-audit.log` |

Parent audit positive alone initially:1pass/0fail,5assertions (final suite also checks preserved created_at); `/tmp/puni-cross-api-audit-parent-green.log`. Project has created_by and updated_at, no updated_by. Actor creation attribution remains unchanged.

## Remaining coordination and limits

- Root relayed Astra approval for only projectAbbreviation exemption beside projectSolution. Applied with parent-transaction JSDoc obligation. Injecting auditColumns() into the side-table schema made the existing exemption guard fail naming projectAbbreviation; restored schema unchanged. `/tmp/puni-cross-api-mutation-audit-exemption.log`. Final address controller + audit policy + SQLite project repository:55pass/0fail,194assertions; `/tmp/puni-cross-api-final-green.log`. Creation attribution and instant are asserted unchanged; code-only update moves updated_at/revision once; normalized no-op preserves full stored snapshot; conflict rollback and combined-patch single bump are separately covered.
- Git staging blocked by shared `.git/worktrees/.../index.lock` permissions (exit128); `/tmp/puni-cross-api-git-add.log`. Root must stage/commit normally. No commit claimed.
- No full repository gate/build, full frontend suite/browser tests, deployment, migration/secrets CI or full external dependency feature verification. Root owns final review/gate. Focused checks establish this slice only.

## Final tooling

- Final all-changed TypeScript lint (including untracked new controller/helper):PASS, empty `/tmp/puni-cross-api-lint-final3.log`.
- Prettier wrote all changed paths; `git diff --check`:PASS. `/tmp/puni-cross-api-format-final3.log`.
- No live mutation remains; schema.ts has no diff. All six observed fault injections restored.

## Explicit changed paths

apps/wbs/be-01/src/boot.db.test.ts
apps/wbs/be-01/src/controller/capacity-body.db.test.ts
apps/wbs/be-01/src/service/announcement-ownership.db.test.ts
apps/wbs/be-01/src/service/directory.service.db.test.ts
apps/wbs/be-01/src/service/plan-commands.db.test.ts
apps/wbs/be-01/src/service/revision.db.test.ts
apps/wbs/be-01/src/service/service-empty-diff.db.test.ts
apps/wbs/be-01/src/service/step.service.db.test.ts
apps/wbs/be-01/src/service/tag-empty-diff.db.test.ts
apps/wbs/be-01/src/service/undo.db.test.ts
apps/wbs/be-01/src/services.db.test.ts
apps/wbs/fe-01/src/components/wbs/plan-import-words.test.ts
apps/wbs/fe-01/src/components/wbs/plan-import-words.ts
apps/wbs/fe-01/src/components/wbs/plan-refusal.ts
apps/wbs/fe-01/src/lib/wbs-api.test.ts
apps/wbs/fe-01/src/modules/plan-writer/plan-writer.test.ts
apps/wbs/fe-01/src/testing/refusing-api.ts
libs/wbs/adapters/store-memory/src/memory-source.test.ts
libs/wbs/adapters/store-memory/src/project-fixture.ts
libs/wbs/adapters/store-sqlite/src/assignee-commands.db.test.ts
libs/wbs/adapters/store-sqlite/src/audit.test.ts
libs/wbs/adapters/store-sqlite/src/claim-occupancy-race.db.test.ts
libs/wbs/adapters/store-sqlite/src/claim-race.db.test.ts
libs/wbs/adapters/store-sqlite/src/constraint.ts
libs/wbs/adapters/store-sqlite/src/project-abbreviation.ts
libs/wbs/adapters/store-sqlite/src/project.db.test.ts
libs/wbs/adapters/store-sqlite/src/project.ts
libs/wbs/adapters/store-sqlite/src/resource-occupancy.db.test.ts
libs/wbs/adapters/store-sqlite/src/sqlite-unit-of-work.db.test.ts
libs/wbs/adapters/store-sqlite/src/write-coordinator.db.test.ts
libs/wbs/application/conformance/src/stores/projects.ts
libs/wbs/application/core/src/compose.test.ts
libs/wbs/application/core/src/http/import.routes.ts
libs/wbs/application/core/src/http/project.routes.ts
libs/wbs/application/core/src/module/plan-commands/assignee-calendar.test.ts
libs/wbs/application/core/src/module/plan-commands/claim-command.test.ts
libs/wbs/application/core/src/module/plan-commands/plan-commands.test.ts
libs/wbs/application/core/src/module/plan-commands/resource-command.test.ts
libs/wbs/application/core/src/module/plan-commands/resource-schedule.test.ts
libs/wbs/application/core/src/module/plan-commands/step-blockage.test.ts
libs/wbs/application/core/src/module/plan-commands/working-plan.test.ts
libs/wbs/application/core/src/module/plan-document/module.test.ts
libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts
libs/wbs/application/core/src/module/plan-import/imported-plan.resource.ts
libs/wbs/application/core/src/module/plan-import/plan-import.feature.ts
libs/wbs/application/core/src/module/project/project.resource.ts
libs/wbs/application/core/src/module/saved-plans/module.test.ts
libs/wbs/application/core/src/module/work-item/startable.test.ts
libs/wbs/application/core/src/ports/project-store.ts
libs/wbs/application/core/src/ports/project-values.ts
libs/wbs/application/core/src/testing/import-service-source-contract.ts
libs/wbs/application/core/testing/portable-composition.ts
libs/wbs/domain/contracts/src/http/import-shapes.ts
libs/wbs/domain/contracts/src/http/plan-document-shapes.ts
libs/wbs/domain/contracts/src/http/project-response.ts
libs/wbs/domain/contracts/src/http/project-shapes.ts
libs/wbs/domain/contracts/src/http/refusal.ts
libs/wbs/domain/contracts/src/http/solution-shapes.test.ts
libs/wbs/domain/domain/src/project-address.ts
apps/wbs/be-01/src/controller/project-address.controller.db.test.ts
libs/wbs/application/core/src/testing/expect-created.ts

## Review round 1 fixes (base 695869a1e)

Read the complete independent review and verified all three Important findings.

1. Timezone now belongs to the existing ProjectPatch passed to the authorized repository write. The resource validates it as before and sends one patch; the existing parent UPDATE/audit/revision and final repository reread cover abbreviation, timezone and any other fields together. Removed the second resource setTimezone call; standalone/import setTimezone stays available. Memory fixture retains timezone storage/revision behavior on this unified path. Added mounted abbreviation+timezone and abbreviation+name+timezone assertions for returned/persisted/read-back revision1, normalized code and zone. Existing same-code-only no-op, invalid timezone, authorization, conflict rollback and combined-name tests remain.
2. Updated UNIQUE_INDEXES inventory non-vacuity expectation from11 to12. The real migrated-index comparison and positive count/index-width assertions remain intact.
3. Replaced six-table snapshot with every SQLite table (including sqlite_sequence and migration ledger), canonicalizing each table's rows. This includes all directory entities, organization mappings, associations and durable event/history tables. Both exhaustion imports explicitly use fresh named service/team/person/tag/type/external-system entries. Forced only the creation-refusal outer decision to commit:true; both mounted exhaustion tests then failed on leaked directory entities, organization mappings and person_team rows while still returning409. Restored commit:false; adjacent production Proof comment records the observed fault.

Round1 evidence:

- `/tmp/puni-cross-api-r1-timezone-red.log`: two new mounted combined-timezone cases failed against frozen production, expected revision1/received2.
- `/tmp/puni-cross-api-r1-constraint-red.log`: complete constraint suite8pass/1fail, expected inventory11/received12.
- `/tmp/puni-cross-api-r1-green.log`: address controller + existing timezone controller + complete constraint suite27pass/0fail,146assertions.
- `/tmp/puni-cross-api-r1-mutation-import-rollback.log`: commit:true injection yielded0pass/2fail; both counter and bounded-family exhaustion snapshots detected new directory/ownership/association rows. Production restored before final verification.
- Final round 1 focused GREEN: `bun test apps/wbs/be-01/src/controller/project-address.controller.db.test.ts apps/wbs/be-01/src/controller/project.controller.db.test.ts apps/wbs/be-01/src/controller/project-organization.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/constraint.db.test.ts libs/wbs/application/core/src/module/project/module.test.ts`: **52 pass, 0 fail, 259 assertions**. `/tmp/puni-cross-api-r1-final-tests.log`.
- Fresh `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core,wbs-store-memory,wbs-store-sqlite --parallel=1 --skipNxCache`: **PASS**, including core module checks. `/tmp/puni-cross-api-r1-types.log`.
- Changed-file ESLint: **PASS**, empty `/tmp/puni-cross-api-r1-lint.log`. Prettier check: **PASS**, `/tmp/puni-cross-api-r1-format-check.log`. `git diff --check`: **PASS**.
- Round 1 limits: no full gate/build, deployment, full frontend/browser tests or migration/secrets CI rerun. Shared HTTP shape did not change in this fix; only the internal store patch now carries the already-supported timezone setting. Prior frontend evidence remains in the main report.
- No storage-worker files changed. Production import rollback mutation restored before final GREEN. Root owns commit and scoped re-review.

Round 1 changed paths:

apps/wbs/be-01/src/controller/project-address.controller.db.test.ts
libs/wbs/adapters/store-memory/src/project-fixture.ts
libs/wbs/adapters/store-sqlite/src/constraint.db.test.ts
libs/wbs/application/core/src/module/plan-import/plan-import.feature.ts
libs/wbs/application/core/src/module/project/project.resource.ts
libs/wbs/application/core/src/ports/project-values.ts

## Integration and durable proof receipt

Reviewed originals `695869a1e` and `275826068` integrated with cherry-pick provenance as `28a28379d` and `c51ba1697`. The integrated apps/libs tree matched the reviewed API branch. Independent [Astra review](task-2-api-review.md) approved all three corrected findings. Normal hooks passed; Tool Wiki remained inactive/uncertified. Full feature, CI, exact-SHA host gate and deployment remain pending.

The following original fault outputs are retained here; only trailing terminal whitespace was normalized. Other `/tmp` paths above identify session logs and are not a durable-log claim.

- [puni-cross-api-mutation-audit-exemption.log](puni-cross-api-mutation-audit-exemption.log)
- [puni-cross-api-mutation-conflict.log](puni-cross-api-mutation-conflict.log)
- [puni-cross-api-mutation-grammar.log](puni-cross-api-mutation-grammar.log)
- [puni-cross-api-mutation-organization.log](puni-cross-api-mutation-organization.log)
- [puni-cross-api-mutation-parent-audit.log](puni-cross-api-mutation-parent-audit.log)
- [puni-cross-api-mutation-trusted.log](puni-cross-api-mutation-trusted.log)
- [puni-cross-api-r1-mutation-import-rollback.log](puni-cross-api-r1-mutation-import-rollback.log)
