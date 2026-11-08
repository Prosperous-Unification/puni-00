# Verify: wbs-measure-budgets

## Slice 1 — tasks 1.1 and 1.2 (2026-10-23)

Worktree `feat/wbs-measure-definitions`, base `plan/wbs-measure-budgets` (48474ed7e). Laptop
run, every Bun test under `env -u CLAUDECODE`; the h2puni gate was not run (slice PR into the
plan branch).

### Commands and results

| Command                                                                                                                                                                                                                 | Result                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                             | exit 0; new files indexed in the store-memory, directory and plan-commands module READMEs; review debt of `store-memory/src/README.md` 48 → 49 entries (limit 40, over before this slice)                                                                                 |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-auth,wbs-gw-01,wbs-mcp-01,wbs-realtime,wbs-runtime-portable,wbs-conformance --skip-nx-cache` | exit 0, 11 projects; only wbs-core has `typecheck:module`                                                                                                                                                                                                                 |
| `bunx nx run-many -t typecheck -p wbs-be-01,wbs-fe-01 --skip-nx-cache`                                                                                                                                                  | exit 0                                                                                                                                                                                                                                                                    |
| `bunx nx run-many -t lint -p wbs-domain,wbs-contracts,wbs-core,wbs-store-sqlite,wbs-store-memory,wbs-conformance,wbs-be-01,wbs-mcp-01,wbs-fe-01 --skip-nx-cache`                                                        | exit 0                                                                                                                                                                                                                                                                    |
| `bun test` in libs/wbs/domain/domain                                                                                                                                                                                    | 1227 pass, 0 fail                                                                                                                                                                                                                                                         |
| `bun test` in libs/wbs/domain/contracts                                                                                                                                                                                 | 495 pass, 0 fail                                                                                                                                                                                                                                                          |
| `bun test src --timeout=30000` in libs/wbs/application/core                                                                                                                                                             | 1167 pass, 0 fail                                                                                                                                                                                                                                                         |
| `bun test` in libs/wbs/adapters/store-memory                                                                                                                                                                            | 193 pass, 0 fail                                                                                                                                                                                                                                                          |
| `bun test` in libs/wbs/application/conformance                                                                                                                                                                          | 35 pass, 0 fail                                                                                                                                                                                                                                                           |
| `bun test --timeout=30000` in libs/wbs/adapters/store-sqlite                                                                                                                                                            | 1829 pass, 0 fail (1830 tests)                                                                                                                                                                                                                                            |
| `bun test --timeout=10000` in apps/wbs/be-01                                                                                                                                                                            | 3300 pass, 3 skip, 3 fail; the route-inventory failure was fixed and its file reran 6 pass; the two `refresh wins a two-process OIDC refresh race` cases failed at their 10 s timeout under load and `browser-lifecycle.mounted-process.db.test.ts` reran alone 11 pass   |
| `bun test --timeout=10000` in apps/wbs/mcp-01                                                                                                                                                                           | 515 pass, 0 fail (tool count 85 → 86, `getApiMeasures`)                                                                                                                                                                                                                   |
| fe-01 `vitest run src/components/wbs/plan-refusal src/lib/wbs-api.test.ts`                                                                                                                                              | 65 pass                                                                                                                                                                                                                                                                   |
| `bunx nx format:check --all`                                                                                                                                                                                            | exit 0                                                                                                                                                                                                                                                                    |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                                | 270 of 270 passed                                                                                                                                                                                                                                                         |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                                                                         | 919 pass, 1 fail: `the production index checker resolves current Markdown links and anchors` refused this file while it was untracked; staged, `repo-namespacing-handoff.test.ts` reran 15 pass, 0 fail. tools/tool-devsync was not touched, so its typecheck was not run |

Memory and SQLite each certify the four new `directory` conformance cases
(`listMeasures:seeded-per-organization`, `addMeasure:index-backstop`,
`patchMeasure:scoped-key-frozen`, `removeMeasure:scoped`).

### Failure proofs

Each fault was injected into production code, the named test watched failing, and the code
restored; the adjacent `Proof:` comments carry the same.

| Guard                                                                                           | Fault injected                                                   | Test that observed it                                                                                           | Result                          |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| decideMeasureCreate key check                                                                   | key comparison removed                                           | domain `refuses a key the organization already holds`                                                           | 11 pass 1 fail                  |
| decideMeasureCreate scheduling                                                                  | scheduling test removed                                          | domain `refuses a second scheduling measure`                                                                    | 11 pass 1 fail                  |
| currency_required                                                                               | rule answers null                                                | domain create + patch currency cases                                                                            | 10 pass 2 fail                  |
| currency_forbidden                                                                              | rule answers null                                                | domain create + patch currency cases                                                                            | 10 pass 2 fail                  |
| measure_key_immutable                                                                           | key comparison removed                                           | domain `refuses a patch that changes the key`                                                                   | 11 pass 1 fail                  |
| measure_shape_immutable                                                                         | refusal answers ok                                               | domain `refuses a patch that changes the kind or the scale`                                                     | 11 pass 1 fail                  |
| patch second_scheduling_measure                                                                 | other-holder test -> false                                       | domain `refuses a second scheduling measure and keeps time scheduling`                                          | 11 pass 1 fail                  |
| scheduling_measure_fixed                                                                        | fixed-flag test removed                                          | same                                                                                                            | 11 pass 1 fail                  |
| measure_in_use seeded                                                                           | seeded test removed                                              | domain `refuses removing a seeded definition, or one anything references`                                       | 11 pass 1 fail                  |
| measure_in_use references                                                                       | reference count ignored                                          | same                                                                                                            | 11 pass 1 fail                  |
| migration seeds existing organizations                                                          | five seeding INSERTs removed                                     | measure-schema `seeds the five definitions for every organization that existed before it` (+ come-forward case) | 5 pass 2 fail                   |
| organization_seed_measures trigger                                                              | trigger replaced by SELECT 1                                     | measure-schema `seeds ... created after it` (+5 cases needing seeds)                                            | 1 pass 6 fail                   |
| measure_organization_key unique                                                                 | index made plain                                                 | measure-schema `holds one key and one scheduling measure per organization`                                      | 6 pass 1 fail                   |
| measure_one_scheduling unique                                                                   | index made plain                                                 | same                                                                                                            | 6 pass 1 fail                   |
| CHECK measure_key / kind / scale / flags / order / currency                                     | each CHECK (1) alone                                             | measure-schema `refuses a malformed key, kind, scale, flag, order or currency`                                  | 6 pass 1 fail each              |
| measure.organization_id ON DELETE CASCADE                                                       | cascade removed                                                  | measure-schema `goes with its organization`                                                                     | 7 pass 1 fail                   |
| memory replaceWith copies measure tables                                                        | copy removed                                                     | core measure-command `defines, patches and removes a measure...` (+ currency case)                              | 6 pass 2 fail                   |
| MeasureDefinitions.addWithin decision                                                           | decideMeasureCreate call skipped                                 | core measure-command `requires a currency on money and refuses one elsewhere`                                   | 7 pass 1 fail                   |
| scheduling uniqueness, two layers                                                               | service decision skipped AND memory twin scheduling test removed | core measure-command `refuses a second scheduling measure and a taken key, writing nothing`                     | 6 pass 2 fail                   |
| MeasureDefinitions.patchWithin decision                                                         | refusal answered as unchanged target                             | core measure-command `refuses a patch that would move the key, the shape or the scheduling measure`             | 7 pass 1 fail                   |
| MeasureDefinitions.removeWithin refusal                                                         | refusal skipped                                                  | core measure-command `refuses removing a seeded definition`                                                     | 7 pass 1 fail                   |
| legacy owner lookup / organization_required                                                     | ownerOf answers a constant org                                   | core measure-command `refuses every read and write under legacy access with no legacy organization`             | 6 pass 2 fail                   |
| answerBatch measure cases                                                                       | cases absent                                                     | wbs-core tsc                                                                                                    | TS2366 (observed before adding) |
| measure normalizers (key, unit length, kind, scale, order, currency)                            | each check reduced to a type test / removed                      | core measure-command `refuses a malformed key, unit, kind, scale, order or currency`                            | 7 pass 1 fail each              |
| SQLite key-index-before-scheduling-index translation                                            | the two isUniqueViolation tests swapped                          | SQLite certification `directory.addMeasure:index-backstop`                                                      | 74 pass 1 fail (case named)     |
| SQLite patch scoped to organization                                                             | organization condition dropped from update                       | SQLite certification `directory.patchMeasure:scoped-key-frozen`                                                 | 74 pass 1 fail (case named)     |
| SQLite delete scoped to organization                                                            | organization condition dropped from delete                       | SQLite certification `directory.removeMeasure:scoped`                                                           | 74 pass 1 fail (case named)     |
| memory index twin: scheduling                                                                   | scheduling test removed                                          | memory certification `directory.addMeasure:index-backstop`, `directory.patchMeasure:scoped-key-frozen`          | 74 pass 1 fail                  |
| memory index twin: key                                                                          | key test removed                                                 | memory certification `directory.addMeasure:index-backstop`                                                      | 74 pass 1 fail                  |
| memory key frozen on patch                                                                      | stored key not kept                                              | memory certification `directory.patchMeasure:scoped-key-frozen`                                                 | 74 pass 1 fail                  |
| command endpoint 409 measure arm                                                                | arm removed from work-item-shapes.ts                             | be-01 measure-organization `refuses with typed 409s, writing nothing` (+2) answered 500 undeclared refusal      | 4 pass 3 fail                   |
| GET /api/measures reads through resolved access                                                 | legacy access passed instead                                     | be-01 measure-organization `lists each organization’s own definitions...` (+4)                                  | 2 pass 5 fail                   |
| MeasureDefinitions.ownerOf scoped branch                                                        | scope ignored, legacy lookup always                              | be-01 measure-organization (same 5 cases)                                                                       | 2 pass 5 fail                   |
| measure_shape_frozen trigger (key, organization, kind, scale, derived)                          | RAISE replaced by SELECT 1                                       | measure-schema `never changes key/organization_id/kind/scale/derived`                                           | 14 pass 5 fail                  |
| trigger WHEN per column (kind, scale, derived)                                                  | that column's IS NOT test dropped                                | measure-schema `never changes <column>`                                                                         | 18 pass 1 fail each             |
| down.sql guard                                                                                  | guard statements removed                                         | measure-schema defined-measure refusal and six edited-seed refusals                                             | 12 pass 7 fail                  |
| down.sql seed comparison per column (name, unit, three_point, show_by_default, order, currency) | that comparison removed                                          | measure-schema `refuses rollback over a seeded definition edited by <edit>` / repriced cost                     | 18 pass 1 fail each             |

### Review of PR #665 (2026-10-23)

| Finding                              | Fix                                                                                                                                                                                                                                                                                                                           | Proof                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S2-1 shape not frozen in the stores  | trigger renamed `measure_shape_frozen`, now `BEFORE UPDATE OF key, organization_id, kind, scale, derived`; `down.sql` drops the new name; the SQLite store rethrows its abort under the trigger's words; the memory store refuses a shape change alike; new case `directory.patchMeasure:shape-frozen` in both certifications | trigger RAISE replaced: SQLite certification failed `directory.patchMeasure:shape-frozen` (74 pass 1 fail) and measure-schema 14 pass 5 fail; memory refusal removed: memory certification failed the same case (74 pass 1 fail); SQLite rethrow removed: the case received drizzle's "Failed query" message |
| S2-2 rollback discarded edited seeds | guard also counts seeded rows differing from their seed (name, unit, kind, scale, flags, order, currency); message "defined or edited measures exist"; the old come-forward case split into an untouched-seed rollback and six edited-seed refusals                                                                           | guard removed: 12 pass 7 fail (exactly the refusal cases); each comparison removed: its own case failed, 18 pass 1 fail                                                                                                                                                                                      |
| S3-1 empty unit label accepted       | domain refusal `unit_required` (409) in create and patch, declared on the command endpoints and in fe-01                                                                                                                                                                                                                      | the unit test removed from create: domain, core and be-01 cases failed (25 pass 3 fail); from patch: 19 pass 2 fail                                                                                                                                                                                          |
| S3-3 OpenAPI form change             | `postApiSharedPeopleRestoreApprove`'s 409 is now published as two arms (an anyOf) where it was one enumerated `error`; the wire bytes of both refusals are unchanged                                                                                                                                                          | none needed (document form only)                                                                                                                                                                                                                                                                             |
| S3-4 TS2366 proof wording            | the `answerBatch` comment now says compile-time only                                                                                                                                                                                                                                                                          | n/a                                                                                                                                                                                                                                                                                                          |
| S3-5 unused `MeasureRow`             | removed from store-sqlite `schema.ts`                                                                                                                                                                                                                                                                                         | typecheck                                                                                                                                                                                                                                                                                                    |
| S3-2, S3-6                           | left as review notes for a later slice, not changed here                                                                                                                                                                                                                                                                      | n/a                                                                                                                                                                                                                                                                                                          |

Reruns after the review fixes: domain 1228 pass, contracts 495, store-memory 193, conformance
35, core 1167, mcp-01 515, store-sqlite 1840 (1841 tests), be-01 measure controller, migration
and route tests 88 pass, each with 0 fail; `nx run-many -t typecheck,typecheck:module,lint` over
the nine touched projects exit 0; check-indexes exit 0; `format:check --all` exit 0; openspec
270 of 270.

## Slice 2 — tasks 1.3 and 1.4 (2026-10-23)

Worktree `feat/wbs-measure-keyed-facts`, stacked on slice 1 (13545ddbf). Laptop run, every Bun
test under `env -u CLAUDECODE`; the h2puni gate was not run (slice PR into the plan branch).
Assumptions D18–D26 in design.md. The migration test runs over a fixture shaped like dev data
(owned and unowned projects, token estimates, token and hours facts with audit columns), not a
copy of the dev store.

### Commands and results

| Command                                                                                                                                                                                                 | Result                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                             | exit 0 (new core test indexed in the plan-commands README)                                                                                                                                     |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-auth,wbs-gw-01,wbs-mcp-01,wbs-realtime,wbs-runtime-portable,wbs-conformance` | 12 tasks succeeded                                                                                                                                                                             |
| `bunx nx run-many -t typecheck -p wbs-fe-01,wbs-be-01`                                                                                                                                                  | succeeded                                                                                                                                                                                      |
| `bunx nx run-many -t lint -p wbs-domain,wbs-contracts,wbs-store-memory,wbs-conformance,wbs-store-sqlite,wbs-core,wbs-be-01,wbs-mcp-01,wbs-fe-01 --skip-nx-cache`                                        | succeeded                                                                                                                                                                                      |
| `bunx nx run-many -t test -p wbs-domain,wbs-contracts,wbs-store-memory,wbs-conformance,wbs-core,wbs-mcp-01`                                                                                             | domain 1238, contracts 495, store-memory 193, core 1174 pass 0 fail; conformance 34/1 (inventory list, fixed, rerun 1/0), mcp-01 514/1 (10 s crypto timing case under load; rerun alone 515/0) |
| store-sqlite `bun test` (full)                                                                                                                                                                          | 1847 pass, 0 fail (1848 tests)                                                                                                                                                                 |
| `bunx nx run wbs-be-01:test --skip-nx-cache` (full)                                                                                                                                                     | 3304 pass, 3 skip, 0 fail                                                                                                                                                                      |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                | 270 of 270                                                                                                                                                                                     |

Memory and SQLite each certify the two new cases `measures.set:defined-key` and
`directory.usageOfMeasure:facts` (75 pass each). Twilight Navigator is unchanged (D26), so its
targets were not run.

### Failure proofs

Each fault was injected into production code, the named test watched failing, and the code
restored; the adjacent `Proof:` comments carry the same.

| Guard                                                     | Fault injected                          | Test that observed it                                                                                                         | Result                      |
| --------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| decideMeasureFact definition lookup                       | lookup matches any definition           | domain `refuses a key the organization does not define` (+4)                                                                  | 4 pass 5 fail               |
| decideMeasureFact derived_measure                         | derived test removed                    | domain `refuses a fact, and a clear, on a derived measure`                                                                    | 8 pass 1 fail               |
| decideMeasureFact scale_mismatch                          | integer test removed                    | domain `refuses a fraction on an integer-scale measure...` (+unowned case)                                                    | 7 pass 2 fail               |
| agentMinutesOf ended only                                 | running-attempt skip removed            | domain `counts ended attempts only; a running one adds nothing`                                                               | 8 pass 1 fail               |
| decideMeasureCreate legacy names                          | legacy-name test removed                | domain `refuses a key that is a legacy metric name`                                                                           | 13 pass 1 fail              |
| export legacy metrics only                                | filter removed                          | core `exports legacy metrics only, leaving defined and derived measures out`                                                  | 78 pass 1 fail              |
| WorkItemService.setMeasure decision                       | refusal skipped                         | core `refuses a fact in a measure the organization does not define, in a derived measure or in the wrong scale` (store threw) | 5 pass 1 fail               |
| undo set_measure on a deleted definition                  | check skipped                           | core `refuses an undo that would put a fact back in a measure deleted since` (store threw)                                    | 5 pass 1 fail               |
| undo restore_subtree on a deleted definition              | refusal removed                         | core `refuses an undo of a delete whose fact is in a measure deleted since` (store threw)                                     | 5 pass 1 fail               |
| agent_minutes joins the row read                          | derived facts left out                  | core `reads agent minutes from ended attempts and rolls them up; a running attempt adds nothing`                              | 5 pass 1 fail               |
| memory usageOfMeasure counts facts                        | answers zero                            | core `refuses deleting a definition that holds a fact, and deletes it once the fact is cleared`                               | 5 pass 1 fail               |
| SQLite store throws on an undefined key                   | throw removed (NULL id passed on)       | SQLite certification `measures.set:defined-key` (CHECK message instead of the store's)                                        | 74 pass 1 fail (case named) |
| SQLite usageOfMeasureIn counts facts                      | answers zero                            | SQLite certification `directory.usageOfMeasure:facts`                                                                         | case named                  |
| SQLite read names a defined fact by its key               | coalesce replaced by `metric` alone     | SQLite certification `measures.set:defined-key`                                                                               | case named                  |
| memory store throws on an undefined key                   | check removed                           | memory certification `measures.set:defined-key`                                                                               | case named                  |
| memory usageOfMeasure counts facts                        | answers zero                            | memory certification `directory.usageOfMeasure:facts` (and core delete case)                                                  | case named                  |
| migration back-fill                                       | back-fill CASE made `WHEN 0`            | migration `keys every existing token and hours fact...` (+ come-forward case)                                                 | 5 pass 2 fail               |
| step_measure_keys_legacy_fact trigger                     | `WHEN 0`                                | migration `keys a fact the outgoing release inserts by metric alone, and takes its upsert`                                    | 6 pass 1 fail               |
| project_organization_keys_measure_facts trigger           | UPDATE replaced by `SELECT 1`           | migration `keys an unowned project's facts when an organization takes it`                                                     | 6 pass 1 fail               |
| step_measure_measure_key unique                           | index made plain                        | migration `holds one fact per definition and step node, and refuses a row naming nothing`                                     | 6 pass 1 fail               |
| down.sql guard                                            | guard count replaced by a constant pass | migration `refuses rollback while a fact is on a defined measure, keeping it`                                                 | 6 pass 1 fail               |
| SQLite targeted reader refuses a non-legacy stored metric | stored-metric test removed              | store-sqlite `rejects malformed measure metrics after constraint-bypassing corruption`                                        | 8 pass 1 fail               |
| command endpoint 409 arm derived_measure/scale_mismatch   | arm removed from work-item.routes.ts    | be-01 `answers 409 for a derived measure and for a fraction of an integer one, storing nothing` (500, 500)                    | 0 pass 1 fail               |

### Review of PR #673 (2026-10-23)

| Finding                                                            | Fix                                                                                                                                                                                                                 | Proof                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 a fact in `time` stored beside `actual.days`                  | `decideMeasureFact` refuses `schedulesWork` definitions `409 scheduling_measure_fact` (design D27); declared in contract refusal codes and the command 409 arm, mapped in `answerBatch` and fe-01 `plan-refusal.ts` | check removed: domain `refuses a fact, and a clear, in the scheduling measure` 9 pass 1 fail; core refusal case 6 pass 1 fail; be-01 409 case got 500 for `time`                                               |
| S2-2 store `set`/`remove` with `tokens`/`hours` bypassed the alias | both stores map through `factMetricOf` (`storedColumnsOf`, `factCondition`, memory `set`/`remove`); new conformance case `measures.set:alias-one-row`, certified on memory and SQLite                               | mapping removed from each of the four sites: `measures.set:alias-one-row` named as failed in that store's certification                                                                                        |
| S3-2 redo hand-up wrote facts in a deleted measure                 | `applyDelete` refuses through the shared `measuresRefusal` before writing (also used by `applyRestore`)                                                                                                             | refusal removed: core `refuses an undo of a first-child create whose handed-down fact is in a measure deleted since` threw from the store, 6 pass 1 fail; restore site via the helper re-proved, 6 pass 1 fail |
| S3-1 D23 described a shared window that swaps do not have          | D23 rewritten (writer stopped before migration; recovery exits closed while defined facts exist); runbook section _Measure fact rollback_ added                                                                     | docs                                                                                                                                                                                                           |
| S3-3, S3-4                                                         | D22 notes exports silently omit defined facts until slice 7; D20 notes saved-plan comparisons churn on `agent_minutes`                                                                                              | docs                                                                                                                                                                                                           |

Migration lint: `bun tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/20261023150000_key_step_measure/migration.sql apps/wbs/be-01/drizzle/20261023150000_key_step_measure/down.sql` exit 0.

Reruns after the review fixes: domain 1239, contracts 495, store-memory 193, conformance 35,
core 1175, mcp-01 515, store-sqlite 1847 (full, 1848 tests), be-01 `work-item.controller`,
`measure-organization.controller` and `migration-cli` 166, fe-01 refusal-word suites 15, each
with 0 fail; `nx run-many -t typecheck,typecheck:module,lint` over 13 projects exit 0;
check-indexes exit 0; `format:check --all` exit 0; openspec 270 of 270.

## Slice 3 — tasks 2.1 to 2.4 (2026-10-23)

Worktree `feat/wbs-measure-estimates`, stacked on slice 2 (a0e495796). Laptop run, every Bun
test under `env -u CLAUDECODE`; the h2puni gate was not run (slice PR into the plan branch).
Assumptions D28–D34 in design.md. The migration test runs over a fixture shaped like dev data
(an owned and an unowned project, legacy token estimates beside token and hours facts, audit
columns), not a copy of the dev store.

### Commands and results

| Command                                                                                                                                                                                                                                     | Result                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                                                 | exit 0 (new files indexed in the store-memory, plan-commands and work-item module READMEs)                                                    |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-auth,wbs-gw-01,wbs-mcp-01,wbs-realtime,wbs-runtime-portable,wbs-conformance,wbs-be-01,wbs-fe-01 --skip-nx-cache` | 13 projects succeeded                                                                                                                         |
| `bunx nx run-many -t lint -p wbs-domain,wbs-contracts,wbs-store-memory,wbs-conformance,wbs-store-sqlite,wbs-core,wbs-be-01,wbs-mcp-01,wbs-fe-01 --skip-nx-cache`                                                                            | 9 projects succeeded                                                                                                                          |
| `bunx nx run tool-devsync:test --skip-nx-cache` (full)                                                                                                                                                                                      | 920 pass, 0 fail                                                                                                                              |
| `bunx nx run wbs-core:test --skip-nx-cache`                                                                                                                                                                                                 | 1195 pass, 0 fail (property test: 200 runs)                                                                                                   |
| domain, store-memory `bun test`                                                                                                                                                                                                             | 1253 and 193 pass, 0 fail                                                                                                                     |
| `bunx nx run-many -t test -p wbs-mcp-01,wbs-contracts,wbs-conformance --skip-nx-cache`                                                                                                                                                      | succeeded (contracts 495, conformance 35 pass; mcp-01's 10 s crypto timing case timed out once under load in an earlier run and passed alone) |
| store-sqlite `bun test` (full)                                                                                                                                                                                                              | 1856 pass, 0 fail (1857 tests)                                                                                                                |
| `bunx nx run wbs-be-01:test --skip-nx-cache` (full)                                                                                                                                                                                         | 3305 pass, 3 skip, 0 fail                                                                                                                     |
| fe-01 `vitest run` over the four suites importing `plan-refusal.ts`                                                                                                                                                                         | 15 pass                                                                                                                                       |
| `bun tools/tool-git-hooks/src/hooks/migration-lint.ts` on `20261023160000_add_measure_estimate`                                                                                                                                             | exit 0                                                                                                                                        |
| `bunx nx format:check --all`                                                                                                                                                                                                                | exit 0                                                                                                                                        |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                                                    | 270 of 270                                                                                                                                    |

Memory and SQLite each certify the five new cases `measures.set:legacy-estimate-replaces-trio`,
`measureEstimates.set:defined-key`, `measureEstimates.set:three-point-clears-flag`,
`measureEstimates.moveAll:every-key` and `directory.usageOfMeasure:estimates` (75 pass each:
the certification runs every case inside one test per source).

### Failure proofs

Each fault was injected into production code (or the migration SQL), the named test watched
failing, and the code restored; the adjacent `Proof:` comments carry the same.

| Guard                                               | Fault injected                                                       | Test that observed it                                                                                                                      | Result                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| decideMeasureEstimate lookup                        | find matches any definition                                          | domain `refuses a key the organization does not define, legacy names included` (+4)                                                        | 9 pass 5 fail                                           |
| decideMeasureEstimate scheduling_measure_estimate   | test removed                                                         | domain `refuses a trio, and a clear, in the scheduling measure`                                                                            | 13 pass 1 fail                                          |
| decideMeasureEstimate three_point_forbidden         | test removed                                                         | domain `refuses a trio where the definition forbids three points` (+unowned)                                                               | 12 pass 2 fail                                          |
| decideMeasureEstimate scale_mismatch                | integer test made false                                              | domain `refuses a fractional point on an integer measure, and accepts a clear there`                                                       | 13 pass 1 fail                                          |
| expectedMeasure half up                             | Math.floor                                                           | domain `rounds an integer measure half up, once` (+roll-up)                                                                                | 12 pass 2 fail                                          |
| measureVariance                                     | fact + expected                                                      | domain `subtracts the expected measure from the fact` (+spec scenario)                                                                     | 12 pass 2 fail                                          |
| rollUpMeasureEstimates single-point fold            | && made \|\|                                                         | domain `reads a parent single-point only when every trio beneath it is`                                                                    | 13 pass 1 fail                                          |
| WorkItemService.setMeasureEstimate decision         | refusal skipped                                                      | core `refuses an unknown, scheduling, two-point-only or fractional measure estimate and stores nothing` (store threw)                      | 14 pass 1 fail                                          |
| setMeasureEstimate rolled_up                        | refusal skipped                                                      | core `refuses a trio on a parent as rolled_up`                                                                                             | 14 pass 1 fail                                          |
| setMeasure token_estimate over a three-point trio   | trio inverse branch made false                                       | core `undoes a legacy token estimate written over a three-point trio by putting the trio back`                                             | 14 pass 1 fail                                          |
| undo set_measure_estimate on a deleted definition   | refusal skipped                                                      | core `refuses an undo that would put a trio back in a measure deleted since` (+first-child case)                                           | 13 pass 2 fail                                          |
| row read attaches measureEstimates                  | attachment skipped                                                   | core `reads expected and variance per step node and rolled up` (+legacy read)                                                              | 13 pass 2 fail                                          |
| last-child delete hands trios up                    | write skipped                                                        | core `hands a deleted last child's trios up to the parent and takes them off again on undo`                                                | 14 pass 1 fail                                          |
| delete journals trios for undo                      | replay fields left out                                               | core `puts a deleted branch's trios back on undo` (+2)                                                                                     | 12 pass 3 fail                                          |
| first child takes the trios                         | moveAll skipped                                                      | core `hands a leaf's trios down to its first child and back up on undo` (+1)                                                               | 13 pass 2 fail                                          |
| applyDelete writes setMeasureEstimates              | writes skipped                                                       | core `hands a leaf's trios down ...` (+hand-up case)                                                                                       | 13 pass 2 fail                                          |
| applyDelete refusal on a deleted definition         | refusal removed                                                      | core `refuses an undo of a first-child create whose handed-down trio is in a measure deleted since`                                        | 14 pass 1 fail                                          |
| applyRestore refusal on a deleted definition        | refusal removed                                                      | core `refuses an undo of a delete whose trio is in a measure deleted since`                                                                | 14 pass 1 fail                                          |
| applyRestore writes measureEstimates                | writes skipped                                                       | core `puts a deleted branch's trios back on undo` (+3)                                                                                     | 11 pass 4 fail                                          |
| duplicate copies trios                              | copy skipped                                                         | core `copies a duplicated branch's trios and takes them with the copy on undo`                                                             | 14 pass 1 fail                                          |
| working plan refreshes measures after a trio write  | set and remove refreshes skipped                                     | core `refreshes the retained measures when a tokens trio writes or retires the legacy token estimate`                                      | 19 pass 1 fail                                          |
| setMeasureEstimate ordering narrow                  | EstimateTrio parse replaced by a pass-through                        | core `refuses an unordered trio and stores nothing`                                                                                        | 15 pass 1 fail                                          |
| migration back-fill                                 | `WHERE 0`                                                            | store-sqlite `turns every legacy token estimate into a single-point tokens trio, keyed to its organization` (+4)                           | 3 pass 5 fail                                           |
| step_measure_mirrors_token_estimate_insert          | WHEN made `0`                                                        | store-sqlite `mirrors a token estimate the outgoing release writes, and takes it with its delete` (+1)                                     | 6 pass 2 fail                                           |
| step_measure_mirrors_token_estimate_update          | WHEN made `0`                                                        | store-sqlite `moves the single-point trio with its legacy row` (+1)                                                                        | 6 pass 2 fail                                           |
| step_measure_mirrors_token_estimate_delete          | WHEN made `0`                                                        | store-sqlite `mirrors a token estimate the outgoing release writes, and takes it with its delete`                                          | 7 pass 1 fail                                           |
| measure_estimate_ordered CHECK                      | `CHECK (1)`                                                          | store-sqlite `refuses an unordered trio and a single point that is not one`                                                                | 7 pass 1 fail                                           |
| project_organization_keys_measure_estimates         | UPDATE replaced by `SELECT 1`                                        | store-sqlite `keys an unowned project's trios when an organization takes it`                                                               | 7 pass 1 fail                                           |
| down.sql guard                                      | count compared `>= 0`                                                | store-sqlite `refuses rollback while a three-point or defined trio exists, keeping it`                                                     | 7 pass 1 fail                                           |
| memory store refuses an undefined key               | check made `false`                                                   | memory certification `measureEstimates.set:defined-key`                                                                                    | 74 pass 1 fail (case named)                             |
| memory three-point write retires the legacy row     | removal skipped                                                      | memory certification `measureEstimates.set:three-point-clears-flag`; core legacy cases                                                     | 74/1; 13 pass 3 fail                                    |
| memory legacy write retires the tokens trio         | `retireTokensTrio` call removed                                      | memory certification `measures.set:legacy-estimate-replaces-trio`; core `undoes a legacy token estimate written over a three-point trio …` | 74/1; 15 pass 1 fail                                    |
| memory commit copies the trio table                 | copy removed                                                         | core `records, re-estimates and clears a trio …` (+7)                                                                                      | 8 fail                                                  |
| memory usageOfMeasure counts trios                  | estimates count removed                                              | memory certification `directory.usageOfMeasure:estimates`; core `refuses deleting a definition that holds a trio …`                        | 74/1; 15 pass 1 fail                                    |
| SQLite store refuses an undefined key               | throw removed                                                        | SQLite certification `measureEstimates.set:defined-key`                                                                                    | 74 pass 1 fail (case named)                             |
| SQLite three-point write retires the legacy row     | delete skipped                                                       | SQLite certification `measureEstimates.set:three-point-clears-flag`                                                                        | 74 pass 1 fail (case named)                             |
| SQLite usageOfMeasureIn counts trios                | estimates count dropped                                              | SQLite certification `directory.usageOfMeasure:estimates`                                                                                  | 74 pass 1 fail (case named)                             |
| step removal counts three-point trios               | count left out                                                       | store-sqlite `refuses removing a step holding only a three-point trio, and takes it with a confirmed cascade`                              | 39 pass 1 fail                                          |
| property: non-time measures never move the schedule | tokens trios appended to the solver's time estimates in treeIsolated | core `keeps the schedule digest byte-identical over 200 random plans and measure writes`                                                   | failed, seed -519583450, counterexample shrunk 16 times |
| command 409 mapping in work-item.routes.ts          | both cases removed                                                   | be-01 `answers 409 for a trio in time or hours and 400 for an unordered one, and reads a stored trio back with its expected measure` (500) | 1 fail                                                  |
| contract 409 arms in work-item-shapes.ts            | both arms removed                                                    | the same be-01 case (500, undeclared refusal)                                                                                              | 1 fail                                                  |
| row read uses the project's PERT weights            | DEFAULT_PERT_WEIGHTS in their place                                  | core `weighs the trio by the project's own PERT weights`                                                                                   | 16 pass 1 fail                                          |
| readCommand validates set_measure_estimate          | check removed                                                        | core `refuses a malformed measure estimate replay`                                                                                         | 37 pass 1 fail                                          |
| readCommand validates subtree trio lists            | check removed                                                        | core `refuses a malformed measure estimate replay`                                                                                         | 37 pass 1 fail                                          |

### Review of PR #675 (2026-10-23)

| Finding                                                                                              | Fix                                                                                                                                                                                                                                                        | Proof                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 undo stale after `tokens` is patched to `threePoint: false` (legacy single-point trios refused) | `measureEstimatesRefusal` refuses only a key no definition holds (D32 reworded); `clearMeasureEstimate` passes `three_point_forbidden`                                                                                                                     | the old `decideMeasureEstimate` check restored: core `undoes a delete and a first-child create after tokens stops allowing three points` 19 pass 1 fail; the clear exception removed: `clears a trio stored before its measure stopped allowing three points` 19 pass 1 fail                                                                                                                                                 |
| S3-2 restores, hand-ups and duplicates restamped the legacy row's `recordedAt`                       | single-point trios are filtered out of the trio writes (`isRanged`) in the hand-up, duplicate, `applyDelete` and `applyRestore`; they ride with their legacy rows                                                                                          | filter removed from `applyRestore`: core `restores a deleted leaf's legacy token estimate with its recordedAt verbatim` 19 pass 1 fail                                                                                                                                                                                                                                                                                       |
| S3-3 absolute 1e-9 half snap rounded real halves down at ~1e7 (16352134.499999998)                   | exact BigInt half-up over weights scaled to integers; relative snap only for a fractional legacy point                                                                                                                                                     | old absolute snap with no exact path: domain `rounds a real half up at ten million tokens under fractional weights` 17 pass 1 fail; exact path skipped: `rounds a third down at a magnitude where any relative tolerance would call it a half` 17/1; truncation for half-up: the 500-run random-weights property and three more 13/4; `Math.floor` on the fallback: `rounds a legacy fractional token estimate half up` 16/1 |
| S3-4 D28 overstated undo protection                                                                  | D28 and runbook _Measure estimate rollback_ record the asymmetric legacy clear and the older image's losses (undo of a write over a trio, delete/undo/hand-down, the step-removal FK)                                                                      | docs                                                                                                                                                                                                                                                                                                                                                                                                                         |
| S3-5 property too narrow                                                                             | random writes include create child, cascade delete and duplicate; each run compares against a twin taking only the structural writes; digest adds `scheduleError` and the three waiting counts; ids normalized by place. Memory only (no SQLite run added) | tokens trios appended to the solver's time estimates: property failed, seed 2087327825, shrunk 19 times                                                                                                                                                                                                                                                                                                                      |
| S3-6 D34 said the schedule read never reads trios                                                    | reworded: the scheduling input never does, the row read does                                                                                                                                                                                               | docs                                                                                                                                                                                                                                                                                                                                                                                                                         |
| S3-7 displaced JSDoc                                                                                 | `storedMeasureEstimate` moved above `storedMeasure`'s JSDoc; the measure estimate journal helpers moved above `readRestoredDemands`' JSDoc                                                                                                                 | lint                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Slice 4 — tasks 3.1 to 3.3 (2026-10-23)

Worktree `feat/wbs-measure-budget-entity`, rebased onto slice 3's fixed head 65c82254f
(91de259bc plus slice 2's f3b125807). Laptop run, every Bun test under `env -u CLAUDECODE`;
the h2puni gate was not run (slice PR into the plan branch). Assumptions D35–D45 in design.md;
runbook _Budget rollback_ in `docs/runbook-prod-deploy.md`. The migration test runs over a
fixture shaped like dev data (an owned and an unowned project, a cost fact and trio written
before bases existed), not a copy of the dev store.

### Commands and results

| Command                                                                                                                                                                                                                     | Result                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                                 | exit 0 (new files indexed in the store-memory, work-item and plan-commands module READMEs)                                                              |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-auth,wbs-gw-01,wbs-mcp-01,wbs-realtime,wbs-runtime-portable,wbs-conformance,wbs-be-01,wbs-fe-01` | 13 projects succeeded                                                                                                                                   |
| `bunx nx run-many -t lint -p wbs-domain,wbs-contracts,wbs-store-memory,wbs-conformance,wbs-store-sqlite,wbs-core,wbs-be-01,wbs-mcp-01,wbs-fe-01 --skip-nx-cache`                                                            | 9 projects succeeded                                                                                                                                    |
| `bunx nx run tool-devsync:test --skip-nx-cache` (full)                                                                                                                                                                      | 920 pass, 0 fail (a run before the slice was committed failed 6 docs-target cases on the then-unindexed `budget-command.test.ts`, fixed by indexing it) |
| `bunx nx run wbs-core:test --skip-nx-cache`                                                                                                                                                                                 | 1227 pass, 0 fail (property test: 200 runs, budgets among the writes)                                                                                   |
| `bunx nx run-many -t test -p wbs-domain,wbs-contracts,wbs-store-memory,wbs-conformance,wbs-mcp-01 --skip-nx-cache`                                                                                                          | succeeded (store-memory 193 pass after adding `budgets` to its binding list)                                                                            |
| store-sqlite `bun test` (full)                                                                                                                                                                                              | 1863 pass, 0 fail (1864 tests)                                                                                                                          |
| `bunx nx run wbs-be-01:test --skip-nx-cache` (full)                                                                                                                                                                         | 3308 pass, 3 skip, 0 fail                                                                                                                               |
| fe-01 `vitest run` over the four suites importing `plan-refusal.ts`                                                                                                                                                         | 15 pass                                                                                                                                                 |
| `bun tools/tool-git-hooks/src/hooks/migration-lint.ts` on `20261023170000_add_work_item_budget`                                                                                                                             | exit 0                                                                                                                                                  |
| `bunx nx format:check --all`                                                                                                                                                                                                | exit 0                                                                                                                                                  |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                                    | 270 of 270                                                                                                                                              |

Memory and SQLite each certify the five new cases `measures.set:basis`,
`measureEstimates.set:basis`, `budgets.set:defined-key`, `budgets.set:replace-remove` and
`directory.usageOfMeasure:budgets` (the certification runs every case inside one test per
source).

### Failure proofs

Each fault was injected into production code (or the migration SQL), the named test watched
failing, and the code restored; the adjacent `Proof:` comments carry the same.

| Guard                                                                | Fault injected                                                                  | Test that observed it                                                                                  | Result                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| decideBudget lookup                                                  | find falls back to a definition                                                 | domain `refuses a key the organization does not define, legacy names included` (+unowned)              | 18 pass 2 fail              |
| decideBudget scheduling_measure_budget                               | test removed                                                                    | domain `refuses a budget, and a clear, in the scheduling measure`                                      | 19 pass 1 fail              |
| decideBudget invalid_budget                                          | test made false                                                                 | domain `refuses a negative or non-finite cap or hold`                                                  | 19 pass 1 fail              |
| decideBudget scale_mismatch                                          | integer test made false                                                         | domain `refuses a fraction on an integer measure`                                                      | 19 pass 1 fail              |
| readBudgets subtree fold                                             | row's own facts in place of the fold                                            | domain `reads a parent's budget against its three leaves' facts` (+3)                                  | 16 pass 4 fail              |
| readBudgets holds reduce remaining                                   | hold left out of remaining                                                      | domain `holds the allowance of each running attempt of unknown usage, and releases it on its end` (+1) | 18 pass 2 fail              |
| readBudgets exceeded                                                 | `>=` for `>`                                                                    | domain `reports exceeded only once the facts cross the cap`                                            | 19 pass 1 fail              |
| readBudgets unknown usage                                            | recordedAt test made true                                                       | domain `holds nothing for an attempt whose usage was recorded since it started`                        | 19 pass 1 fail              |
| readBudgets derived factor                                           | factor left out                                                                 | domain `derives a budget from the pessimistic points times the project factor …`                       | 19 pass 1 fail              |
| readBudgets mixed skip                                               | skip removed                                                                    | domain `reads no budget where the bases mix …`                                                         | 13 pass 1 fail              |
| decideRateCard rate_card_forbidden                                   | refusal made ok                                                                 | domain `refuses a digest on a measure that is not money`                                               | 19 pass 1 fail              |
| decideRateCard rate_card_required                                    | refusal removed                                                                 | domain `requires a digest on a money write, not on a clear`                                            | 19 pass 1 fail              |
| mixedRateCardsOf                                                     | `<= 2` for `< 2`                                                                | domain `names the two digests a parent mixes …` (+1)                                                   | 18 pass 2 fail              |
| property: non-time measures never move the schedule (budgets)        | first stated cap added to the first time estimate's pessimistic in treeIsolated | core `keeps the schedule digest byte-identical …`                                                      | 0 pass 1 fail (seed named)  |
| work_item_budget_policy CHECK                                        | `CHECK (1)`                                                                     | store-sqlite `refuses a budget outside the two policies, a negative cap and a half basis`              | 6 pass 1 fail               |
| project.budget_factor CHECK                                          | `CHECK (1)`                                                                     | store-sqlite `defaults every project's budget factor to 1 and refuses 0`                               | 6 pass 1 fail               |
| project_organization_keys_work_item_budgets                          | UPDATE replaced by `SELECT 1`                                                   | store-sqlite `keys an unowned project's budgets when an organization takes it`                         | 6 pass 1 fail               |
| down.sql guard                                                       | comparison made `>= 0`                                                          | store-sqlite `refuses rollback while a budget, a factor or a priced figure exists, keeping it`         | 6 pass 1 fail               |
| memory budget store refuses an undefined key                         | check made `false`                                                              | memory certification `budgets.set:defined-key`                                                         | 74 pass 1 fail (case named) |
| memory usageOfMeasure counts budgets                                 | budget count multiplied by 0                                                    | memory certification `directory.usageOfMeasure:budgets`                                                | 74 pass 1 fail (case named) |
| SQLite budget store refuses an undefined key                         | throw made unreachable                                                          | SQLite certification `budgets.set:defined-key`                                                         | 74 pass 1 fail (case named) |
| SQLite usageOfMeasureIn counts budgets                               | budget count dropped                                                            | SQLite certification `directory.usageOfMeasure:budgets`                                                | 74 pass 1 fail (case named) |
| SQLite measure estimate rewrite replaces the basis                   | basis left out of the upsert's update                                           | SQLite certification `measureEstimates.set:basis`                                                      | 74 pass 1 fail (case named) |
| SQLite fact rewrite replaces the basis                               | basis left out of the upsert's update                                           | SQLite certification `measures.set:basis`                                                              | 74 pass 1 fail (case named) |
| contract 409 arms `scheduling_measure_budget`, `rate_card_forbidden` | both arms removed                                                               | be-01 `answers 409 for a budget in time and a rate card on tokens, 400 for a negative cap …` (500)     | 0 pass 1 fail               |
| contract 409 arm `rate_card_required`                                | arm removed                                                                     | be-01 `answers 409 for an unpriced cost fact and reads a parent mixing two cards, naming both` (500)   | 8 pass 1 fail               |
| contract 409 arm `mixed_rate_cards` with `digests`                   | arm renamed away                                                                | be-01 `refuses a last-child delete whose hand-up would add two cards with 409 naming both` (500)       | 8 pass 1 fail               |
| parser 400 arm `invalid_budget`                                      | arm renamed away                                                                | be-01 `answers 409 for a budget in time and a rate card on tokens, 400 for a negative cap …` (500)     | 0 pass 1 fail               |
| setMeasure rate card decision                                        | refusal skipped                                                                 | core `requires a rate card on a cost fact and refuses one on tokens`                                   | 24 pass 1 fail              |
| setMeasureEstimate rate card decision                                | refusal turned into no basis                                                    | core `requires a rate card on a cost trio and refuses one on tokens`                                   | 24 pass 1 fail              |
| set_measure replay carries the basis                                 | spread removed                                                                  | core `undoes a cost fact back to the figure and rate card it replaced`                                 | 24 pass 1 fail              |
| WorkItemService.setBudget decision                                   | unknown_measure skipped (answered ok)                                           | core `refuses an unknown, scheduling, negative or fractional budget and stores nothing`                | 24 pass 1 fail              |
| setBudget inverse puts the replaced budget back                      | inverse made a clear                                                            | core `sets, replaces and clears a budget, undoably`                                                    | 24 pass 1 fail              |
| undo set_budget on a deleted definition                              | refusal skipped                                                                 | core `refuses an undo that would put a budget back in a measure deleted since`                         | 24 pass 1 fail              |
| last-child delete refuses mixed cards                                | refusal skipped                                                                 | core `refuses a last-child delete whose hand-up would add two rate cards, naming both`                 | 24 pass 1 fail              |
| hand-up keeps the trio's basis                                       | basis left off                                                                  | core `hands a branch's priced figures up under their one rate card`                                    | 24 pass 1 fail              |
| hand-up keeps the fact's basis                                       | basis left off                                                                  | the same core case                                                                                     | 24 pass 1 fail              |
| delete journals the branch's budgets                                 | replay field left out                                                           | core `puts a deleted branch's budgets back on undo` (+2)                                               | 22 pass 3 fail              |
| duplicate copies budgets                                             | copy skipped                                                                    | core `copies a duplicated branch's budgets and takes them with the copy on undo`                       | 24 pass 1 fail              |
| applyRestore refusal on a deleted definition                         | refusal removed                                                                 | core `refuses an undo of a delete whose budget is in a measure deleted since`                          | 24 pass 1 fail              |
| applyRestore writes budgets                                          | writes skipped                                                                  | core `puts a deleted branch's budgets back on undo` (+2)                                               | 22 pass 3 fail              |
| row read attaches budgets                                            | attachment skipped                                                              | core `sets, replaces and clears a budget, undoably` (+6)                                               | 18 pass 7 fail              |
| row read uses the project's budget factor                            | 1 in its place                                                                  | core `derives a budget from the pessimistic points times the project's budget factor`                  | 24 pass 1 fail              |
| row read strips a mixed key                                          | `measures` kept                                                                 | core `reads a parent whose leaves hold two rate cards as mixed, naming both, with no cost sum`         | 24 pass 1 fail              |
| headroom read refuses a mix                                          | refusal skipped                                                                 | core `refuses the headroom read while a bounding budget mixes rate cards, naming both`                 | 24 pass 1 fail              |
| headroom keeps the tightest budget                                   | `>=` for `<`                                                                    | core `reports the tightest budget among a step's work item and its ancestors`                          | 2 pass 1 fail               |
| batch refusal carries digests                                        | guard bypassed (plain refusal)                                                  | core `refuses a last-child delete whose hand-up would add two rate cards, naming both`                 | 24 pass 1 fail              |
| parseBudget                                                          | test made false                                                                 | core `refuses a negative cap or hold, or an unknown policy, before anything runs`                      | 24 pass 1 fail              |
| asRateCardDigest length                                              | length tests removed                                                            | core `refuses an empty rate card digest`                                                               | 24 pass 1 fail              |
| project bad_budget_factor                                            | check made false                                                                | core `refuses a budget factor of 0 and keeps the one it had`                                           | 24 pass 1 fail              |
| memory commit copies the budget table                                | copy removed                                                                    | core `sets, replaces and clears a budget, undoably` (+12)                                              | 12 pass 13 fail             |
| memory delete cascades budgets                                       | cascade removed                                                                 | core `refuses an undo of a delete whose budget is in a measure deleted since`                          | 24 pass 1 fail              |
| readCommand validates a set_measure basis                            | check removed                                                                   | core `refuses a malformed budget or basis replay`                                                      | 38 pass 1 fail              |
| readCommand validates set_budget                                     | check removed                                                                   | the same case                                                                                          | 38 pass 1 fail              |
| readCommand validates a restore's budgets                            | check removed                                                                   | the same case                                                                                          | 38 pass 1 fail              |

Not proven at runtime: the batch 422 arm `invalid_budget` (and the route's mapping of it). The
command boundary refuses a negative cap or hold with the parser's 400 `invalid_budget` first, so
no HTTP request reaches the domain check; the domain refusal is proven at the service
(`decideBudget invalid_budget` above), the arm is kept because the route's switch over every
refusal must map it.

### Skipped or unverified

- No dedicated HTTP route or MCP tool serves the headroom read (D41, slice 5); it is proven in
  core only.
- No older-image restart over the new schema was exercised (runbook _Budget rollback_ says so).
- The h2puni gate was not run.

### Review of PR #676 (2026-10-23)

Fixes on top of a5a130f15, decisions recorded in design.md (D36, D38, D39, D41, D43, D44
updated; D46 added). Each fault was injected, the named test watched failing, and the code
restored.

| Finding                                                                                     | Fix                                                                                                                                                                                                                            | Proof (fault → observed)                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 headroom let an advisory or derived budget hide an exhausted strict one                | per key `{strict?, advisory?}`, the tightest of each policy (D46)                                                                                                                                                              | policy split removed → `keeps an exhausted strict budget beside a looser advisory one` (headroom unit, 3 pass 1 fail); core case on the reviewer's fixture (P strict 1000 spent 1000, A derived 300 spent 500) reads strict remaining 0 bounded by P                                                |
| S2-2a NULL basis                                                                            | kept as a basis of its own                                                                                                                                                                                                     | `counts an unpriced figure as a basis of its own, named null first` (domain, unchanged)                                                                                                                                                                                                             |
| S2-2b unpriced money replays                                                                | a money `set_measure`/`set_measure_estimate` replay without a basis refuses `rate_card_required`                                                                                                                               | refusal skipped → `refuses an undo that would put an unpriced cost fact back` / `… cost trio back` (core, 29 pass 1 fail each)                                                                                                                                                                      |
| S2-2c facts and trios mixed together (and S3-6, the delete over-refusing)                   | folded apart in the row read and the last-child delete; `mixedRateCards: {key: {facts?, estimates?}}`                                                                                                                          | kinds folded together in the row read → `reads a leaf whose trio and fact sit on two cards as unmixed, and strips a mix among trios from the estimates alone`; in the delete → `hands up a fact on one card beside a trio on another`; trio strip kept → the first case (core, 29 pass 1 fail each) |
| S2-2d headroom refused whole on any mix                                                     | never refused; a blocked budget is named on its step and key (`mixedRateCards`, `mixedAt`); `readBudgets` answers `blocked`                                                                                                    | read emptied whenever a budget is blocked → `names a mix on the blocked step and key only, the read itself never refused` (the reviewer's repro, core 29 pass 1 fail); blocked mark skipped → `names a blocked cost budget on its step alone, tokens kept` (headroom unit, 3 pass 1 fail)           |
| S3-1 basis identity was the digest alone                                                    | identity is (currency, digest); pairs name whole bases                                                                                                                                                                         | digest-only identity → `reads one digest in two currencies as mixed` (domain, 22 pass 1 fail)                                                                                                                                                                                                       |
| S3-2 agent minutes released by an earlier end's fact                                        | a derived measure holds for every running attempt; typed-measure limits recorded in D39                                                                                                                                        | test removed → `holds agent minutes for every running attempt, a fact from an earlier end beside it` (domain, 22 pass 1 fail)                                                                                                                                                                       |
| S3-3 `invalid_budget` decided twice                                                         | removed from `decideBudget`, `CommandRefusalCode` and the 422 arm; the parser's 400 is the boundary                                                                                                                            | the parser arm's proof stands (be-01 500 when renamed away, slice 4)                                                                                                                                                                                                                                |
| S3-4 derived cap from some leaves' estimates against every leaf's spend                     | derived only where every spending leaf also estimates                                                                                                                                                                          | mark skipped → `derives no budget over a leaf that spends without an estimate` (domain, 22 pass 1 fail)                                                                                                                                                                                             |
| S3-5 spec promised a conversion                                                             | dropped from the requirement; D44 says WBS converts nothing                                                                                                                                                                    | spec text                                                                                                                                                                                                                                                                                           |
| missing Proof on the derived `exceeded`                                                     | added                                                                                                                                                                                                                          | `>=` → `reports a derived budget exceeded only once the facts cross its cap` (domain, 22 pass 1 fail)                                                                                                                                                                                               |
| found while fixing: the export carried `project.budgetFactor` (it embeds the project whole) | stripped from the document until slice 7 (D22, D38)                                                                                                                                                                            | factor left in → `v9 zero-fact export retains canonical bytes` (+2, core plan-document, 76 pass 3 fail)                                                                                                                                                                                             |
| found while fixing: slice 4's typecheck row overstated                                      | the first run bailed on be-01 and only be-01 was rerun; `typecheck:module` of wbs-core and wbs-fe-01 had two errors (a fixture without `budgetFactor`, fe-01's project refusal switch without `bad_budget_factor`), both fixed | 13 projects typecheck clean below                                                                                                                                                                                                                                                                   |

Rechecked after the fixes (fresh): the rows below.

| Command                                                                                                          | Result                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t typecheck,typecheck:module -p` (the 13 projects)                                            | 13 projects succeeded                                                                                                                                                                                                                                                         |
| `bunx nx run-many -t lint -p` (the 9 changed projects) `--skip-nx-cache`                                         | 9 projects succeeded                                                                                                                                                                                                                                                          |
| `bunx nx run-many -t test -p wbs-domain,wbs-core,wbs-store-memory,wbs-conformance,wbs-contracts --skip-nx-cache` | domain 1280, store-memory 193, contracts 495, conformance 35 pass; core 1231 pass 2 fail (the export bytes, fixed above), then `wbs-core:test` 1233 pass, 0 fail (property included)                                                                                          |
| store-sqlite `bun test` (full)                                                                                   | 1862 pass, 1 fail: `Task 6.3 observes each saved-plan capture boundary fault and reversals` timed out at 8.3 s under load average 9 (another agent's suites); alone 1 pass, and the whole conformance file 75 pass, 0 fail. No store-sqlite source changed in this fix commit |
| be-01 measure, work-item, migration and export suites (21 files)                                                 | 232 + 471 pass, 0 fail                                                                                                                                                                                                                                                        |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                      | exit 0                                                                                                                                                                                                                                                                        |
| `bunx nx format:check --all`                                                                                     | exit 0                                                                                                                                                                                                                                                                        |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                         | 270 of 270                                                                                                                                                                                                                                                                    |

No SQL changed, so migration lint was not rerun; be-01 was not rerun in full.

### k3s rehearsal: mcp-01 OOMKilled (2026-10-23)

CI `infra-check` / `k3s-rehearsal` failed on a5a130f15 and e09afa3bb: `wbs-mcp` `OOMKilled`,
exit 137, limit 512Mi. Reproduced with the built mcp-01 images run under `--memory=512m`
(gateway mode, RSA signing key, no be-01), cgroup `memory.peak` and `VmHWM`:

| Image               | Peak (cgroup)              | VmHWM      | Ready | OOM kill |
| ------------------- | -------------------------- | ---------- | ----- | -------- |
| slice 3 (65c82254f) | 536 866 816 (at the limit) | 552 376 kB | 4.1 s | 0        |
| slice 4 (e09afa3bb) | 536 870 912                | —          | never | 1        |
| slice 4 with D47    | 401 059 840                | 420 556 kB | 2.4 s | 0        |

Cause: arktype compiling 210 refusal arms that each repeat the 61-kind enumeration. Importing
`command-parser-refusal.ts` alone took 528 MB RSS (149 MB before it); `work-item-shapes.ts`
took another 120 MB. Loading every shape over arktype: 756 MB before, 370 MB after (laptop);
parser collapse alone saves 314 MB, batch collapse 60 MB. Proofs: with the parser arms restored,
`bounds the memory the contracts take to load` failed at 686 MB against its 500 MB bound; with
the codes' enumeration made `'string'`, `admits a known code with its context and refuses an
unknown code or kind` failed.

Rechecked: contracts 496 pass, mcp-01 515 pass, core 1233 pass, be-01 OpenAPI and refusal
suites (10 files) 423 pass; 13 projects typecheck; lint of contracts, core, be-01, mcp-01. The
k3s rehearsal (`tool-deploy:test:k3s`, a k3d cluster with all four images) was not run locally:
a second heavy agent shares the 30 GB laptop.

## Slice 5 — task 4.1 (2026-10-23)

Worktree `feat/wbs-measure-surface`, rebased onto slice 4's head e239e7198 (review fixes and
the refusal-schema collapse). Laptop run, every Bun test under `env -u CLAUDECODE`; the h2puni
gate was not run (slice PR into the plan branch). Assumptions D48–D51 in design.md. No new
refusal code was added, so the enumerations of D47 are untouched.

### Commands and results

| Command                                                                                                                                                                                                                                     | Result                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                                                 | exit 0 (review debt only `store-memory/src/README.md`, 51 of 40, over before this slice)                                |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-auth,wbs-gw-01,wbs-mcp-01,wbs-realtime,wbs-runtime-portable,wbs-conformance,wbs-be-01,wbs-fe-01 --skip-nx-cache` | 13 projects succeeded                                                                                                   |
| `bunx nx run-many -t lint -p wbs-domain,wbs-contracts,wbs-store-sqlite,wbs-core,wbs-be-01,wbs-mcp-01 --skip-nx-cache`                                                                                                                       | 6 projects succeeded                                                                                                    |
| `bunx nx run tool-devsync:test --skip-nx-cache` (full)                                                                                                                                                                                      | 920 pass, 0 fail                                                                                                        |
| `bunx nx run-many -t test -p wbs-domain,wbs-contracts,wbs-store-memory,wbs-conformance,wbs-mcp-01,wbs-core --skip-nx-cache`                                                                                                                 | domain 1281, contracts 499, store-memory 193, conformance 35, mcp-01 515, core 1234 pass; 0 fail                        |
| store-sqlite `bun test` (full)                                                                                                                                                                                                              | 1864 pass, 0 fail                                                                                                       |
| `bunx nx run wbs-be-01:test --skip-nx-cache` (full)                                                                                                                                                                                         | 3318 pass, 3 skip, 0 fail                                                                                               |
| contracts `bun test src/http/contracts-boot-memory.test.ts`                                                                                                                                                                                 | 2 pass; shape load measured 329–332 MB over three runs (bound 500; 361–365 MB with this slice stashed, so within noise) |
| `bunx nx format:check --all`                                                                                                                                                                                                                | exit 0                                                                                                                  |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                                                    | 270 of 270                                                                                                              |

fe-01 was not changed (`kinds.json`, `vitest.node-suites.json` and the conformance inventory
untouched); the generated document grows by one operation, which mcp-01's pinned list, README
count (87) and be-01's route inventories carry.

### Failure proofs

Each fault was injected into production code (or the contract), the named test watched
failing, and the code restored; the adjacent `Proof:` comments carry the same.

| Guard                                                  | Fault injected                             | Test that observed it                                                                                  |
| ------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| headroom route repeated-key check                      | check removed                              | be-01 `refuses a repeated team and an undeclared key`                                                  |
| headroom route resolves organization access            | legacy access in place of the resolved one | be-01 `refuses a stranger exactly as the startable read does` and the team case                        |
| headroom route maps `unknown_team`                     | `not_found` answered instead               | be-01 `narrows to a team, and refuses one the caller's organization does not hold`                     |
| headroom contract requires `spent` and `workItemId`    | both made optional                         | contracts `refuses a budget that names no bounding work item or no spend`                              |
| batch contract arm (refusal table)                     | `scale_mismatch` arm renamed away          | be-01 `answers each code with its declared status and body, writing nothing` (three rows answered 500) |
| row read strips `spent` from `budgets`                 | strip skipped                              | core `sets, replaces and clears a budget, undoably` (+3 row-read cases)                                |
| row read attaches `moneyBases`                         | attachment skipped                         | core `names the one basis a row's cost sums are in, per kind, and none on a mixed parent`              |
| `soleMoneyBasesOf` one-basis test                      | size test removed                          | domain `names the one basis a subtree is priced in, and none where it mixes or is unpriced`            |
| `findCrossReferences` outgoing `measure_estimate_step` | arm removed                                | be-01 `fails the schedule read closed over a crossing measure_estimate_step` (200 where 500 was owed)  |
| `findCrossReferences` incoming trio                    | `measure_estimate` entry removed           | be-01 `fails closed on a project another project reaches into, changing neither`                       |
| activation conflict `measure_estimate_step`            | query made to answer no row                | store-sqlite `reports a measure_estimate_step conflict`                                                |

Not proven at runtime: the route switch over the core's answers (`unknown_team`, `null`) is
exhaustive by type, so removing an arm does not compile. `measureId_must_be_an_id` answers only a
non-string id; an empty one is an id and answers 404 (D51).

### Skipped or unverified

- The h2puni gate and the k3s rehearsal were not run (second heavy agent on the laptop).
- The MCP tool was checked through the generated document and mcp-01's suite, not called
  against a live be-01.

### Review of PR #679 (2026-10-23)

Fixed on top of 03319990d as one new commit. Rerun after the fixes: domain 1282, contracts 499
(shape load printed: 328 MB, bound 500), core 1235, mcp-01 515 pass, 0 fail; be-01 headroom,
refusal, measure, startable, schedule and command organization suites, `app.routes.test.ts` and
`work-item.controller.test.ts` 243 pass; store-sqlite reconciliation and project 62 pass; 13
projects typecheck; lint of domain, contracts, store-sqlite, core, be-01, mcp-01; check-indexes
exit 0; `format:check --all` exit 0; openspec 270 of 270. The full be-01 and store-sqlite suites
were not rerun (a slice-6 worker shares the laptop).

| Finding                                      | Fix                                                                                                                                  | Proof                                                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 a blocked budget's policy is lost       | `blocked` carries bases, policy and source; per key `{strict?, advisory?, blocked?: {strict?, advisory?}}`, nearest per policy (D52) | domain `names a blocked budget with its policy and source` failed with the policy forced to advisory; core `keeps a blocked strict budget behind a nearer blocked advisory one` failed with every blocked budget in the advisory slot |
| S2-1 tests                                   | derived blocked reads only `blocked.advisory` (core unit, be-01); strict behind nearer advisory both present (core unit)             | as above; be-01 `names a blocked derived budget as advisory alone, which never refuses` and the strict case updated                                                                                                                   |
| S3-1 missing table rows                      | rows for `unit_must_be_text`, the three flag codes and `measureRef_must_be_an_id`; a hand list of every code the change added        | be-01 `drives every code the change added, each one the batch declares` named `unit_must_be_text` missing with its row removed                                                                                                        |
| S3-2 no positive team filter, no legacy case | a labelled leaf's steps alone answer for the team; a pre-activation read of another account's project under legacy access            | be-01 team and `reads any project deployment-wide under legacy access` cases pass                                                                                                                                                     |
| S3-3 `holdPerAttempt` not exposed            | on each strict and advisory entry where stated; stripped from the row read with `spent`                                              | core and domain expectations carry it; the row-read strip proof of D49 covers both fields                                                                                                                                             |
| S3-4 not a snapshot                          | said in the operation description, the shape's JSDoc, `findBudgetHeadroom` and D50                                                   | documentation                                                                                                                                                                                                                         |
| S3-5 stale "twenty-one queries"              | twenty-four, with the dates of each addition                                                                                         | documentation                                                                                                                                                                                                                         |
| boot memory not quotable                     | `contracts-boot-memory.test.ts` prints `contracts shape load: <n> MB (bound 500 MB)`                                                 | printed 328 MB                                                                                                                                                                                                                        |

## Slice 6 — tasks 4.2 and 4.3 (2026-10-23)

Worktree `feat/wbs-measure-columns`, rebased onto slice 5's review head 376e7d1c2. Laptop run,
every test under `env -u CLAUDECODE`; the h2puni gate was not run (slice PR into the plan
branch). Assumptions D53–D59 in design.md. fe-01 only: no backend, contract or migration change.
The row read (`budgets`, `mixedRateCards`, `moneyBases`) is the panel's only source; the headroom
read is not used.

### Commands and results

| Command                                                                                                 | Result                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`             | exit 0 (review debt only `store-memory/src/README.md`, 51 of 40, over before this slice)                     |
| `bunx nx run-many -t typecheck,lint -p wbs-fe-01 wbs-contracts`                                         | succeeded (typecheck includes `typecheck:module`)                                                            |
| `bunx nx run tool-devsync:test --skip-nx-cache` (full)                                                  | 920 tests, exit 0                                                                                            |
| `bunx nx run wbs-fe-01:test:unit --skip-nx-cache`                                                       | 81 files, 1002 pass (`test-tiers.test.ts` among them)                                                        |
| fe-01 DOM tier `TZ=UTC bunx vitest run --maxWorkers=2` (whole tier)                                     | 221 files, 4336 pass                                                                                         |
| fe-01 zoned tier `TZ=Pacific/Auckland bunx vitest run --config vitest.zoned.config.ts`                  | 4 files, 5 pass                                                                                              |
| `E2E_PORT_SHIFT=1900 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts measure-columns` | 4 pass (real be-01, gw-01, fe-01; definitions and three rows' budgets answered at the browser, see the spec) |
| `bunx nx format:check --all`                                                                            | exit 0                                                                                                       |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                | 270 of 270                                                                                                   |

The first whole-tier DOM run before the fixes failed 12 cases: menu lists and the Columns list now
carry `Measures…` and the Measures group (expectations updated), the chooser's loading line was a
`role="status"` that `findByRole('status')` in the optimization suite picked up and its failed line
a `role="alert"` (both made plain sentences inside the closed menu), and a hand-spread fake without
`listMeasures` threw synchronously out of the effect (the read now runs inside a promise, so that is
the rendered `failed` state). Four file-level ENOENT errors in the vitest transform cache did not
recur.

### Failure proofs

Each fault was injected into production code, the named test watched failing, and the code
restored; the adjacent `Proof:` comments carry the same.

| Guard                                             | Fault injected                            | Test that observed it                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `isMeasureShown` default filter                   | `?? definition.showByDefault` → `?? true` | node `a fresh reader sees no measure column but time` (3 of 18 failed); DOM and browser `a fresh reader sees time only…` (10 measure headings) |
| `listMeasures` models `409 organization_required` | arm removed                               | `answers organization_required as a modeled state` (rejected with WbsRequestError)                                                             |
| measure column width arm                          | arm removed                               | `lays every measure column at its declared width` (UnknownColumnError)                                                                         |
| measure column hint arm                           | arm removed                               | `explains each facet of any measure…` (UnexplainedColumnError)                                                                                 |
| panel write keeps the refusal sentence            | sentence assignment removed               | `shows a refusal beside the control that asked, in plan-refusal words` (no alert)                                                              |
| `useMeasureDefinitions` project check             | answered `state.reading` unconditionally  | `shows no project’s definitions against another, nor a late answer` (read p1's `ready`)                                                        |
| `useMeasureDefinitions` stale answer              | `if (!current) return` removed            | `drops the answer of commands it no longer reads through` (read the old `ready`)                                                               |
| strict bar versus advisory marker                 | policy test negated (renderings swapped)  | `draws a strict budget as a bar and an advisory one as a marker…` (no meter in Tokens)                                                         |
| measure refusal words                             | `unknown_measure` entry renamed away      | `words every measure refusal the panel can reach` (fallback carried the code)                                                                  |

Not proven at runtime: the exhaustive `measuresReadCode` switch (an arm removed does not compile).

### Visual review (Dany's UI rule)

Evidence under `evidence/slice-6/`, written by `e2e/measure-columns.spec.ts` with
`MEASURE_EVIDENCE_DIR` set (CI writes only to its test output): `desktop-table-tokens-cost.png`,
`desktop-column-chooser.png`, `desktop-panel-strict-advisory.png`, `desktop-panel-mixed.png`,
`desktop-panel-empty.png`, `mobile-cards.png`, `mobile-column-chooser.png`,
`mobile-panel-strict-advisory.png`, `mobile-panel-mixed.png`, `mobile-panel-empty.png` and the
recording `interaction-toggle-estimate-variance.webm` (enable Tokens, type a trio and a fact in
the panel, variance `+50` appears in the cell). About 1.4 MB in all.

Judged and changed:

- Columns control rows gained a hover tint, a focus ring around the wrapped box and a pressed
  tint, eased over 150 ms and still under `prefers-reduced-motion`; same height in every state.
  The Measures group sits under a rule with units right-aligned; Time reads `steps · Days`.
- Measure headings are two lines (name over facet and unit) at 96 px; enabling measures makes the
  frame scroll sideways, as unfolding steps does, and the pinned number and name hold. Absent
  figures are dashes, a legacy single figure carries a dot, mixed money is a dashed amber
  `mixed cards` marker, positive variance red, negative green (status tokens, both palettes).
- Panel: first review showed bullet points and a doubled `….` on the basis lines and the mixed
  sentence twice in the Cost card; the list lost its bullets, the basis lost the period, and the
  blocked budget now says "Budget unknown: its facts mix rate cards (A and B)". Strict budgets are
  a bar with the spent/cap/over line and an "Exceeded" sentence in the blocked colour; advisory
  and derived budgets are a pill and a line. Form messages reserve their line so a refusal does
  not push controls down; the bar width eases and stands still under reduced motion.
- Phone: the panel fits 390 px with three figures per row; the cards draw no measure figures
  (D53) and the chooser lives in the Plan actions sheet with 44 px rows.
- No pixel baseline exists to update: the `pixels` job measures geometry, and the default column
  set (time only) is unchanged, which `table-frame.test.ts` pins.

### Skipped or unverified

- The h2puni gate and the CI `pixels` shards were not run here; the new spec joins that suite.
- `GET /api/measures` was answered at the browser in the spec: the ordinary e2e be-01 has no
  organization, so a live definitions read before activation answers 409 (rendered as a state,
  covered in jsdom), and an activated organization's read was not exercised in a browser.
- A viewer's refusal is worded as `forbidden` for every edit (D58); no browser session with a
  viewer role was driven.

### Review of PR #680 — fixes (2026-10-23)

Fixed on `feat/wbs-measure-columns` as new commits on 21866eb90. Assumptions D60–D62 in
design.md; D54 amended. The row read gains one additive field (`holdPerAttempt`, only where a
hold is stated); no migration.

| Finding                               | Fix                                                                                                                                                                                                           | Proof (fault injected → test observed)                                                                                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S2-1 Saving a budget dropped its hold | row read keeps `holdPerAttempt` (core strip, contract `holdPerAttempt?`, D60); panel prefills the hold box and sends it, an emptied box sends `null`                                                          | strip restored → core `holds the allowance of each running attempt…` failed (30 pass 1 fail); contract field removed → `carries a stated hold on a row budget, and only a number` accepted `'300'`; prefill emptied → DOM `keeps a stated hold when a budget is saved…` found an empty box |
| S2-2 Sub-unit money read as `$0.00`   | `fractionDigitsFor`: two significant digits, up to 6, where the usual digits round to zero (D62)                                                                                                              | answering the usual digits → `never shows a non-zero figure as zero` read `$0.00` for 1500 micro-USD                                                                                                                                                                                       |
| S2-3 Warning keyed on `exceeded`      | `refusing = strict && remaining <= 0` drives bar colour and the sentence; "nothing left · N held" for holds; badge stays on `exceeded` (D61)                                                                  | keyed on `exceeded` → node `refuses at the cap and on holds…` failed; panel sentence keyed on `over` → DOM `warns at the cap and on holds…` found no sentence                                                                                                                              |
| S3 commas                             | only thousands grouping accepted, field message otherwise; currency to micros on the digits                                                                                                                   | "drop every comma" regex → `refuses a comma that does not group thousands` read `1,5` as 15                                                                                                                                                                                                |
| S3 stale forms                        | trio, fact and budget forms keyed on their stored value                                                                                                                                                       | keyed on the step alone → DOM `clears through the panel, and the boxes follow what is stored` read `100`                                                                                                                                                                                   |
| S3 D54                                | Reset layout forgets `wbs.measureColumns.<project>`; a project switch reads its own answers; spec scenario says "per browser and project, beside the remembered layout"                                       | forget call removed → DOM `Reset layout forgets the measure columns` kept the tokens columns; project check removed → DOM `reads another project’s measure columns afresh` showed p1's columns on p2                                                                                       |
| S3 empty state                        | "in any measure but time"                                                                                                                                                                                     | text asserted in DOM and browser                                                                                                                                                                                                                                                           |
| S3 a11y                               | `aria-controls` dropped (forms unmounted while closed); single-point dot `aria-hidden` with sr-only text                                                                                                      | asserted by the DOM queries; not fault-injected                                                                                                                                                                                                                                            |
| S3 basis list gap                     | list `m-0`                                                                                                                                                                                                    | judged in `desktop-panel-forms.png`                                                                                                                                                                                                                                                        |
| S3 numeric cells                      | measure cells and headings right-aligned, tabular numerals                                                                                                                                                    | judged in `desktop-table-tokens-cost.png`                                                                                                                                                                                                                                                  |
| S3 preferences README                 | fifteen keys, JSON for twelve                                                                                                                                                                                 | doc                                                                                                                                                                                                                                                                                        |
| S3 tests                              | money payload (`0.29` → 290000, digest), `setBudget` payload (policy, hold), Clear flows, forms by rolled-up and derived rows, refusal through `WbsRequestError`, e2e sleeps replaced by web-first assertions | the cases themselves                                                                                                                                                                                                                                                                       |

Commands after the fixes (fresh):

| Command                                                                                                           | Result                                                    |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `bunx nx run-many -t typecheck,lint -p wbs-fe-01 wbs-contracts wbs-core`                                          | succeeded                                                 |
| `bunx nx run-many -t test -p wbs-contracts wbs-core --skip-nx-cache`                                              | contracts 500 pass, core 1235 pass                        |
| `bunx nx run wbs-mcp-01:test --skip-nx-cache`                                                                     | 515 pass (the generated document grew one optional field) |
| be-01 `bun test src/openapi src/controller/work-item` and the five measure, budget and row-read controller suites | 126 pass; 141 pass                                        |
| `bunx nx run wbs-fe-01:test:unit --skip-nx-cache`                                                                 | 81 files, 1008 pass                                       |
| fe-01 whole DOM tier `TZ=UTC bunx vitest run --maxWorkers=2`                                                      | 221 files, 4351 pass                                      |
| `E2E_PORT_SHIFT=1900 … playwright test … measure-columns`                                                         | 4 pass                                                    |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                                   | 920 pass, 0 fail (689 s), run by the coordinating session |

Also run by the coordinating session on 5d8beaa51: `check-indexes committed . HEAD` exit 0, `nx format:check --all`
exit 0, `openspec validate --all --json` 270 of 270. It reviewed `desktop-panel-at-cap-tiny-cost.png` and
`mobile-panel-forms.png` by eye and accepted them.

Visual review of the fixes, from the re-shot evidence: `desktop-panel-forms.png` and
`mobile-panel-forms.png` show the open estimate, fact and budget forms; at 390 px the trio's labels
("Cost pessimistic") wrap above their boxes and the three boxes stay on one row inside the panel,
which the spec asserts (one top, right edge ≤ 390). `desktop-panel-at-cap-tiny-cost.png` and
`mobile-panel-at-cap-tiny-cost.png` show a strict tokens budget spent exactly to its cap in the
refusing colour with "1,000 of 1,000 · nothing left" and "Spent to the cap — the coordinator
refuses the next attempt here.", no exceeded badge, and a cost fact of 4999 micro-USD reading
`$0.0050`. The table re-shot with right-aligned figures; the hold box is prefilled; the basis
list sits one gap below the trio line. Re-shot: every file under `evidence/slice-6/` (15 files,
about 1.7 MB).

## CI pixels fixes (run 39956229555)

- `layout.spec.ts` `drives the actions menu from the keyboard`: failed at `Delete` with
  `Received: "Measures…"`. The order is the intended one (design D57: "Measures…" after
  Duplicate; it opens a dialog and writes nothing, Delete stays last in the destructive tint), so
  the spec walks `Duplicate → Measures… → Delete` and ArrowUp from Delete back to `Measures…`; the
  Escape and Tab focus-return checks are unchanged. The order comments in `plan-columns/actions.tsx`
  and `plan-cards.tsx` now name Measures….
- `plan-table-review.spec.ts` `holds a lone chip too wide for its cell steady, counted`: the chip
  geometry was not the cause. The failing assertion was `expect(logged).toEqual([])`, which received
  Chromium's `Failed to load resource: the server responded with a status of 409 (Conflict)`. A
  temporary response log named it `GET /api/measures 409`: every opened plan read the definitions,
  and the ordinary e2e be-01 is pre-activation, where the read can only answer
  `organization_required`. Fix in code: `useMeasureDefinitions` answers `organization_required`
  without asking when the session read reports `onboarding: false` (the spaces page's precedent,
  `quiet-load.spec.ts`'s rule), as one constant object; a fresh literal per render rebuilt the
  table's memoized columns and broke the dependency search (layout spec seeding timed out at
  `Stop 020 waiting for 010`, three of three). `measure-columns.spec.ts` now answers the session read
  as an activated deployment's (`onboarding: true`) beside its `/api/measures` answer.
- Proofs: removing the effect's early return failed `asks nothing of a deployment reported before
activation` (`listMeasures` called once); removing the render-time return failed it with
  `{ kind: 'loading' }`; answering `onboarding: false` in `measure-columns.spec.ts` failed
  `a fresh reader sees time only` (no tokens choice).
- Commands (`env -u CLAUDECODE`, `E2E_PORT_SHIFT=2300 bunx playwright test --config
apps/wbs/fe-01/playwright.config.ts …`): both specs failed on 4779f9674 as in CI; after the fix
  `layout.spec.ts:2235 plan-table-review.spec.ts:854 measure-columns.spec.ts` 6 passed; vitest
  `measure-panel`, `plan-cards`, `plan-structure` 213 passed; `nx run-many -t typecheck lint -p
wbs-fe-01` passed; `nx format:check --all` exit 0.

### CI gate twilight fix (run 39963265943, 2026-10-23)

`gate twilight` failed six `pilot-policy.test.ts` cases. Causes, both real: the slice-6 evidence
binaries (15 files under `evidence/slice-6/`) were undeclared in `docs/wiki-policy/policy.json`
and `bootstrap-policy.json` (`undeclared binary content`), and the pinned pilot mapping
`docs/wiki-policy/modules.json` did not list the plan-commands module's new external consumer
`use-measure-definitions.ts` that the module index declares. Fix: one binary declaration per file
in both policies (consumer `verify.md`, regenerated by `measure-columns.spec.ts`) and the consumer
added to the mapping. `pilot-policy.test.ts` 24 pass / 0 fail; `nx run twilight-burokrat:test
--skip-nx-cache` exit 0; `check-indexes` exit 0; `format:check --all` exit 0. The same run's
`pixels shard 4/4` failure (`toolbar-panels.spec.ts:472`) passed 2/2 locally on the same head and
is recorded as a timing flake.

## Slice 7 — tasks 4.4 and 4.5 (2026-10-23)

Plan document version 11 (D63), row readings out of the document (D64), import matching
definitions by key (D65), saved plan input schema 9 (D66), golden fixtures (D67); CONTEXT.md,
`docs/wbs/measures-and-budgets.md` (indexed in `LLM_README.md`), the prod runbook and the
proposal's Impact updated. Branch `feat/wbs-measure-export` from slice 5's head 376e7d1c2.

**Golden hashes.** The v9 (`016181aa…`) and v10 (`f2308a55…`) export hashes in
`plan-document.resource.test.ts` are unchanged; their fixture now states `budgetFactor: 1`
(slice 4 had set 1.5 to prove the strip; under D63 a factor other than 1 is version-11 data,
D67). Version 11 adds `62708699…`. Saved-plan bodies are schema 9, so new captures hash
differently from schema-8 ones; no stored-body golden exists, and every stored body upgrades in
memory. The SQLite capture conformance seed gained a tokens trio and budget, so the
sqlite-bumped revision of A's first row moved from 7 to 9 (two more writes).

**Found while round-tripping (D65).** SQLite's `insertSubtree` wrote facts without their
basis: an import and an undo of a delete put a priced `cost` fact back unpriced (memory kept
it). It now writes `currency` and `rate_card_digest`; `undo of a delete puts a priced fact back
with its basis` (be-01) covers the undo path.

### Commands and results

| Command                                                                                                                                                                                                                     | Result                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` (new files staged)                                                                                                              | exit 0; review debt only the pre-existing store-memory README (51 of 40)                                                                                                                                                                |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-auth,wbs-gw-01,wbs-mcp-01,wbs-realtime,wbs-runtime-portable,wbs-conformance,wbs-be-01,wbs-fe-01` | 13 projects, both targets, success                                                                                                                                                                                                      |
| `bunx nx run tool-devsync:test --skip-nx-cache` (full)                                                                                                                                                                      | 918 pass, 2 fail: both in `poller.test.ts`, `No space left on device` (the shared laptop's root disk at 100%); `bun test src/poller.test.ts` rerun alone 26 pass, 0 fail                                                                |
| `bunx nx run-many -t test -p wbs-domain,wbs-contracts,wbs-core --skip-nx-cache`                                                                                                                                             | domain 1284, contracts 499, core 1277 + 1 fail (`module-boundaries`: the feature named the repository type `MeasureAdded`; fixed with `MeasureDefined`), then core 1278 pass, 0 fail                                                    |
| `bunx nx run-many -t test -p wbs-core,wbs-store-memory,wbs-conformance --skip-nx-cache`                                                                                                                                     | core 1278, store-memory 195, conformance 35 pass, 0 fail                                                                                                                                                                                |
| store-sqlite `bun test` (full)                                                                                                                                                                                              | 1866 pass, 0 fail                                                                                                                                                                                                                       |
| `bunx nx run wbs-be-01:test --skip-nx-cache` (full)                                                                                                                                                                         | 3325 pass, 2 fail: the version-12 future-file boundary case (was 11, now a real version) and the 501 `supported` list (now ends 9); both expectations updated, then those suites with import-export and measure-export 104 pass, 0 fail |
| `bunx nx run wbs-mcp-01:test --skip-nx-cache` (full)                                                                                                                                                                        | 515 pass, 0 fail                                                                                                                                                                                                                        |
| contracts `bun test src/http/contracts-boot-memory.test.ts`                                                                                                                                                                 | 2 pass; `contracts shape load: 331 MB (bound 500 MB)` (slice 5: 328 MB)                                                                                                                                                                 |
| fe-01 `bunx vitest run src/lib/wbs-api.test.ts`                                                                                                                                                                             | 65 pass (the generated client still validates a version-10 export)                                                                                                                                                                      |
| `bunx nx run-many -t lint -p wbs-domain,wbs-contracts,wbs-store-sqlite,wbs-store-memory,wbs-conformance,wbs-core,wbs-be-01 --skip-nx-cache`                                                                                 | first run: import order in four files; after `eslint --fix`, 7 projects success                                                                                                                                                         |
| `bunx nx format:check --all`                                                                                                                                                                                                | exit 0                                                                                                                                                                                                                                  |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                                                    | 270 of 270 passed                                                                                                                                                                                                                       |

No SQL changed (no migration lint). fe-01 code, `kinds.json`, `vitest.node-suites.json` and
the conformance inventory are untouched (a test file was added in be-01 only). No refusal code
was added: import refusals reuse `400 invalid_body`/`unknown_ref` and `409 source_refused`
with a `detail`, so D47's enumerations are unchanged.

### Failure proofs

Each fault was injected into production code, the named test watched failing, and the code
restored; the adjacent `Proof:` comments carry the same.

| Guard                                                | Fault injected                                | Test that observed it                                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| version 11 only when it carries something            | test made `true`                              | core v9 and v10 golden hashes and 16 legacy-shape cases (70 pass, 18 fail)                                                                                                 |
| the same                                             | test made `false`                             | core `exports version 11 with every measure the plan holds` and 5 more v11 cases                                                                                           |
| legacy metrics stay out of `measureFacts`            | filter removed                                | core `exports version 11 …`, `a plan whose measures are all legacy exports version 10 …`                                                                                   |
| single-point trios stay out of `measureEstimates`    | filter removed                                | the same two cases and the v11 golden                                                                                                                                      |
| row readings stripped (D64)                          | the four omissions removed                    | core `leaves the row’s measure readings out of the document`                                                                                                               |
| older versions refuse measure lists and a factor ≠ 1 | refusal bypassed                              | core `refuses measures in a file older than version 11`                                                                                                                    |
| version-11 factor bound                              | `isBudgetFactor` removed                      | core `refuses a version-11 file with a malformed measure entry or factor`                                                                                                  |
| version-11 entry shapes                              | refusal removed                               | the same                                                                                                                                                                   |
| every refusal in `prepareMeasures` (28)              | each bypassed alone                           | its case of `refuses a version-11 file whose measures do not hold together` (one gap, the trio's placement, closed with a case)                                            |
| shape mismatch refused, not remapped                 | comparison's refusal removed                  | memory contract `refuses a defined measure under legacy access, writing no project`; be-01 `refuses a definition the organization holds in another shape, writing nothing` |
| legacy access defines nothing                        | `held === null` refusal removed               | memory contract `refuses a defined measure under legacy access …`                                                                                                          |
| factor, trios and budgets written on import          | each left out                                 | memory contract `round-trips a version-11 plan’s trios, budgets and factor byte for byte`                                                                                  |
| isolated export reads the measures                   | reads made empty                              | be-01 isolated `round-trips a version-11 plan byte for byte into an organization lacking a measure` (and the shape refusal)                                                |
| shared export reads the measures on the snapshot     | reads made empty                              | be-01 shared `round-trips …`                                                                                                                                               |
| SQLite subtree insert writes the basis               | basis columns left out                        | be-01 both `round-trips …` and `undo of a delete puts a priced fact back with its basis`                                                                                   |
| capture folds trios (minus single-point) and budgets | filter removed; either collection made empty  | core `captures every measure estimate, budget, basis and the factor, and compares a change in each`                                                                        |
| schema 8 → 9 upgrade                                 | upgrade made the identity                     | domain `reads a version-8 body with no trios, budgets or bases and a factor of 1` (+5 earlier-upgrade cases)                                                               |
| the upgrade's three guards                           | each removed alone                            | domain `refuses a version-8 body without a project object or a measures list`                                                                                              |
| schema 9 admitted on read                            | 9 left out of `SUPPORTED_INPUT_BODY_VERSIONS` | be-01 `saved plan compare names a change in a trio, a budget, a basis and the factor` (501)                                                                                |

The memory and SQLite capture reads are covered by the conformance case
`savedPlanCapture.readPlanInput:complete`, which failed when the seeded trio and budget were first
added (the SQLite revision moved by two), and each read replaced by `[]` was injected as its
`Proof:` comment says: memory (`store-memory/src/source.ts`, `source-conformance.test.ts`) went
from 75 pass to 8 fail (verified by the PR #681 reviewer); SQLite
(`store-sqlite/src/saved-plan-capture.ts`, `source-conformance.db.test.ts`) went from 75 pass to
68 pass, 7 fail for the trio read and for the budget read alone, naming
`savedPlanCapture.readPlanInput:complete` (re-run 2026-10-23 for the review).

### Skipped or unverified

- The h2puni gate was not run (shared laptop; a slice-6 worker runs beside it).
- Twilight Navigator, Burokrat and Dash still read plan documents up to version 10 (D63 lag,
  tracked as task 4.6); they were not changed and not rerun, since no legacy-shape export
  changed a byte.
- fe-01's full suites were not run: no fe-01 file changed; its contract-facing `wbs-api.test.ts` was.

### Review of PR #681 (2026-10-23)

Each fault was injected into production code, the named test watched failing, and the code
restored.

| Finding                                                                              | Fix                                                                                                                                                                    | Proof                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 legacy access refused a plan's own v11 export when a legacy organization exists | `ImportedPlanResource.measureDefinitionsWithin` and `addMeasureWithin` resolve the legacy organization under legacy access (null only when none exists); D65 corrected | answering null under legacy access again: be-01 `before activation, with a legacy organization: re-import of its own v11 export succeeds and matches its definitions` got 409 where 201 was expected (7 pass, 1 fail); the no-legacy-organization case `refuses a defined measure under legacy access, writing no project` (memory contract) still passes |
| S2-2 import accepted a money basis in another currency than its definition           | `prepareImport` refuses `basis.currency !== definition.currency` with `invalid_body` at `<path>.currency`, for facts and trios                                         | equality dropped: `refuses a version-11 file whose measures do not hold together: a fact basis …` and `… a trio basis in another currency than its definition` failed (100 pass, 2 fail)                                                                                                                                                                  |
| S3-1 Navigator, Burokrat and Dash refuse v11                                         | recorded in D63 as a tracked follow-up, task 4.6; tools unchanged                                                                                                      | n/a (documentation)                                                                                                                                                                                                                                                                                                                                       |
| S3-2 no atomic-rollback test for a created definition                                | be-01 `rolls back a definition it created when a later definition refuses, writing nothing`                                                                            | `ImportService.import` committing on a `resolveMeasures` refusal (`commit: true`): org-b held `gpu_minutes` (gpu 1, expected 0; 7 pass, 1 fail)                                                                                                                                                                                                           |
| S3-3 verify.md disagreed with the capture `Proof:` comments                          | paragraph above rewritten; both comments carry the counts                                                                                                              | memory 75 pass → 8 fail (reviewer); SQLite trio read and budget read each `[]`: 75 pass → 68 pass, 7 fail, naming `savedPlanCapture.readPlanInput:complete`                                                                                                                                                                                               |
| S3-4 docs restated rules and lacked the legacy rule                                  | `docs/wbs/measures-and-budgets.md` links D65 and states the legacy-access rule and the D63 follow-up                                                                   | `check-indexes` (below)                                                                                                                                                                                                                                                                                                                                   |
| S3-5 D66 silent on captures taken between slices                                     | D66 notes the spurious factor change and "added" trios/budgets, and why one merge avoids it                                                                            | n/a (documentation)                                                                                                                                                                                                                                                                                                                                       |

Reruns after the fixes (`env -u CLAUDECODE`): `nx run wbs-core:test --skip-nx-cache` succeeded
(1280 tests across 112 files); store-memory `import.service.test.ts` 39 pass; store-sqlite
`import.service.db.test.ts`, `saved-plan-capture.db.test.ts`, `work-item.db.test.ts` 108 pass;
be-01 `import.controller` 5, `import-export-organization.controller` 34,
`measure-export.controller` 8, `saved-plan.controller` 44, `saved-plan-organization.controller`
10 and the eleven `service/saved-plan*` files 81 pass, 0 fail; contracts 499 pass (boot memory
331 MB, alone 329 MB, bound 500 MB); typecheck and lint for wbs-core, wbs-be-01,
wbs-store-sqlite and wbs-store-memory succeeded; `bunx nx format:check --all` exit 0; Burokrat
`check-indexes working . HEAD` exit 0; `openspec validate --all --json` exit 0 (252 and 18
passed, 0 failed). The h2puni gate was not run (shared laptop).

## Main sync 2026-10-23

`origin/main` at `1de2778500f7c62f48f32fc568ec2a6c949334bb` merged into the plan branch.
Mechanical only: no behavior or decision changed.

Re-stamp. Main's newest migration is `20261023100000_add_claim_lease`, the same stamp as the
plan's first measure migration, so the four measure migrations moved past it before the merge
(`git mv`, each `migration.sql` beside its `down.sql`). Dev has applied none of the four, so no
ledger names the old stamps. Every reference to the old names moved with them, the earlier
sections of this file included.

| Old                                   | New                                   |
| ------------------------------------- | ------------------------------------- |
| `20261023100000_add_measure`          | `20261023140000_add_measure`          |
| `20261023110000_key_step_measure`     | `20261023150000_key_step_measure`     |
| `20261023120000_add_measure_estimate` | `20261023160000_add_measure_estimate` |
| `20261023130000_add_work_item_budget` | `20261023170000_add_work_item_budget` |

Resolution. Ledger lists are main's complete list with the four measure migrations after
`add_claim_lease`, in each list's own order. `measure-schema.db.test.ts` rolls back to
`add_claim_lease`, its new predecessor, and main's `resource-provider-migration.db.test.ts`
now drops and reverses the four measure migrations too. The contracts keep D47's single
parser-refusal object and gain main's `providerId_must_be_id_or_null` and
`personKind_must_be_text` codes, the `unknown_provider` (404) and `provider_not_in_organization`
(409) batch refusals. `work-item.routes.ts` keeps `provider_not_in_organization` on its own
409 return: folded into the measure codes' case group, the 11-code union no longer assigned to
the refusal union (TS2322). `budget-headroom.test.ts` gains main's `leaseExpiresAt: null`.
mcp-01's README counts 88 tools (85 at the merge base, one added by main, two by the plan).

Checks (`env -u CLAUDECODE` throughout; local Bun 1.4.4):

| Command                                                                                                  | Result                                      |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `bun test libs/wbs/domain/contracts/src/http/contracts-boot-memory.test.ts`                              | 2 pass, 0 fail; 336 MB (bound 500 MB)       |
| be-01 `migration-cli`, `migrate`, and the six `*-migration.db.test.ts` files                             | 86 pass, 0 fail across 8 files              |
| `bunx nx run wbs-store-sqlite:test --skip-nx-cache`                                                      | 1883 pass, 0 fail across 143 files          |
| be-01 `budget-headroom`, `claim-lease`, `measure-export`, `measure-organization`, `measure-refusal` (db) | 32 pass, 0 fail                             |
| be-01 `swarm-end-to-end`, `compute-provider`, `agent-person-limit`, `work-item.controller`               | 164 pass, 0 fail                            |
| `bunx nx run-many -t typecheck,typecheck:module` over the 13 wbs projects                                | succeeded                                   |
| `bunx nx run tool-devsync:test --skip-nx-cache`, `tool-devsync:typecheck`                                | 921 pass, 0 fail across 49 files; succeeded |
| fe-01 `vitest run src/test-tiers.test.ts`; `nx run wbs-fe-01:test:unit`                                  | 6 passed; 1019 passed across 83 files       |
| mcp-01 `openapi-tools.test.ts`                                                                           | 32 pass, 0 fail                             |
| Burokrat `check-indexes working . HEAD`; `pilot-policy.test.ts`                                          | exit 0; 24 pass, 0 fail                     |
| store-sqlite `audit.test.ts`                                                                             | 6 pass, 0 fail                              |
| `migration-lint.ts` on the four renamed migrations                                                       | exit 0                                      |
| `bunx nx format:check --all`; `bunx openspec validate --all --json`                                      | exit 0; exit 0 (275 passed, 0 failed)       |

The merge commit's lint hook ran out of the default 4 GB Node heap on the merge's 208 staged
scripts; it passed with `NODE_OPTIONS=--max-old-space-size=10240`. The full be-01 suite and the
h2puni/h4claw gate were not run (CI carries them).

## Review fixes A 2026-10-24

Branch `feat/wbs-measure-budgets-fixes-a` (from the main sync, #696, with `origin/main` merged:
#695 Bun 1.4.4, #566, #601; no conflicts). Items: derived coverage per step node (A-1) and
single-point trios seeding nothing (D68); import refuses an unpriced money fact or trio (B-1,
detail `rate_card_required`); the panel reads a derived budget mixed trios block as blocked
(B-3); the spec states `measure_in_use` with no cascade (A-2/B-2); `Proof:` comments and
negatives for the measure guards, journal clears and store drift throws (A-3); definitions
admin-only (D70); the backup is the rollback (D72).

### Failure proofs

Each fault was injected into production code, the named test watched failing, and the code
restored; the adjacent `Proof:` comments carry the same.

| Guard                                                  | Fault injected                       | Test that observed it                                                                                               | Result          |
| ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------- |
| readBudgets three-point trios only (D68)               | single-point trios kept              | domain `derives nothing from a single-point tokens trio, the legacy token estimate`                                 | 18 pass 1 fail  |
| readBudgets coverage per step node (A-1)               | node keyed by work item alone        | domain `derives no budget where a step spends without a trio beside another step's`                                 | 18 pass 1 fail  |
| prepareImport unpriced money basis (B-1)               | refusal answers null                 | core `refuses a version-11 file whose measures do not hold together: an unpriced money fact` / `… trio`             | 102 pass 2 fail |
| budgetReadingOf blocked by mixed trios (B-3)           | estimates arm disabled               | fe-01 `reads a derived budget mixed trios keep from being read as blocked` (rendered "No budget.")                  | 21 pass 1 fail  |
| MeasureDefinitions.addWithin admin role (D70)          | role check made to pass              | be-01 `refuses a member every definition write, an admin and a super-admin allowed` (200)                           | 1 fail          |
| MeasureDefinitions.patchWithin admin role (D70)        | role check made to pass              | same (200)                                                                                                          | 1 fail          |
| MeasureDefinitions.removeWithin admin role (D70)       | role check made to pass              | same (409 `measure_in_use` instead of 403)                                                                          | 1 fail          |
| resolveMeasures admin role on create (D70)             | role check made to pass              | be-01 `refuses a member's import that would define a measure, writing nothing` (201)                                | 1 fail          |
| decideMeasureCreate measure_key_taken                  | held-key test removed                | domain `refuses a key the organization already holds`                                                               | 13 pass 1 fail  |
| decideMeasureCreate second_scheduling_measure          | test removed                         | domain `refuses a second scheduling measure`                                                                        | 13 pass 1 fail  |
| decideMeasureCreate unit_required                      | test removed                         | domain `refuses an empty or whitespace unit label`                                                                  | 13 pass 1 fail  |
| decideMeasurePatch measure_key_immutable               | test removed                         | domain `refuses a patch that changes the key`                                                                       | 13 pass 1 fail  |
| decideMeasurePatch measure_shape_immutable             | refusal answers the target unchanged | domain `refuses a patch that changes the kind or the scale`                                                         | 13 pass 1 fail  |
| decideMeasurePatch scheduling_measure_fixed            | test removed                         | domain `refuses a second scheduling measure and keeps time scheduling`                                              | 13 pass 1 fail  |
| decideMeasurePatch second_scheduling_measure           | other-holder test made `false`       | same                                                                                                                | 13 pass 1 fail  |
| decideMeasurePatch unit_required                       | test removed                         | domain `refuses an empty or whitespace unit label`                                                                  | 13 pass 1 fail  |
| decideMeasurePatch currency                            | rule answers null                    | domain `keeps a money measure priced and refuses a currency elsewhere`                                              | 13 pass 1 fail  |
| refuseMeasureRemoval seeded                            | test removed                         | domain `refuses removing a seeded definition, or one anything references`                                           | 13 pass 1 fail  |
| refuseMeasureRemoval references                        | reference count ignored              | same                                                                                                                | 13 pass 1 fail  |
| decideMeasureFact unknown_measure                      | lookup falls back to `cost`          | domain `refuses a key the organization does not define`                                                             | 9 pass 1 fail   |
| decideMeasureFact derived_measure                      | test removed                         | domain `refuses a fact, and a clear, on a derived measure` (+ unowned case)                                         | 8 pass 2 fail   |
| readCommand clear_budget                               | check removed                        | core `refuses a budget clear that names no whole budget` (+ budget/basis case)                                      | 42 pass 2 fail  |
| readCommand clear_measure_estimate                     | check removed                        | core `refuses a measure estimate clear that names no whole step node and key` (+ estimate case)                     | 42 pass 2 fail  |
| readCommand removedMeasureEstimates                    | check removed                        | core `refuses a subtree replay whose removed trios name no whole step node and key` (+ estimate case)               | 42 pass 2 fail  |
| WorkItemBudgetRepository.listByProject policy          | check made to pass                   | store-sqlite `rejects a stored budget policy outside the two after constraint-bypassing corruption`                 | 12 pass 1 fail  |
| basisOf half basis                                     | throw answers no basis               | store-sqlite `rejects a stored figure carrying half a money basis after constraint-bypassing corruption`            | 12 pass 1 fail  |
| metricOrThrow                                          | check made to pass                   | store-sqlite `rejects a stored fact naming neither a metric nor a definition after constraint-bypassing corruption` | 12 pass 1 fail  |
| MeasureEstimateRepository.set single-point consistency | check made to pass                   | store-sqlite `refuses to write a single-point trio that is not an equal tokens trio, writing nothing` (resolved)    | 12 pass 1 fail  |

### Checks

`env -u CLAUDECODE` throughout; local Bun 1.4.4; each test file run alone.

| Command                                                                                                                       | Result                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| domain `budget`, `measure-definition`, `measure-fact`                                                                         | 19, 14, 10 pass; 0 fail                                     |
| core `prepare-import`, `compensating`                                                                                         | 104, 44 pass; 0 fail                                        |
| core measure, estimate, fact and budget command tests, plan-document, headroom, startable, progress, saved-plan-input, freeze | all pass, 0 fail                                            |
| store-memory and store-sqlite `import.service` (source contract)                                                              | 39, 39 pass; 0 fail                                         |
| store-sqlite `targeted-readers`, `step-measure`, `measure-schema`, budget and estimate migration, `audit`                     | 13, 11, 19, 7, 8, 6 pass; 0 fail                            |
| be-01 `measure-organization`, `measure-refusal`, `measure-export`, `budget-headroom` (db)                                     | 10, 5, 9, 7 pass; 0 fail                                    |
| be-01 `import.controller`, `import-export-organization` (db), `boot.db`                                                       | 5, 34, 38 pass; 0 fail                                      |
| contracts `definitions`, mcp-01 `openapi-tools`                                                                               | 2, 32 pass; 0 fail                                          |
| fe-01 `vitest run` `test-tiers`, `measure-panel`, `measure-reading`                                                           | 52 passed across 3 files                                    |
| `nx run-many -t typecheck,typecheck:module` over core, store-sqlite, contracts, store-memory, domain, be-01, fe-01, mcp-01    | succeeded                                                   |
| `nx run tool-devsync:test --skip-nx-cache`, `tool-devsync:typecheck`                                                          | 921 tests across 49 files, exit 0; succeeded                |
| Burokrat `check-indexes working . HEAD`; `pilot-policy.test.ts`                                                               | exit 0 (existing store-memory README debt); 24 pass, 0 fail |
| `bunx nx format:check --all`; `bunx openspec validate --all --json`                                                           | exit 0; exit 0 (278 passed, 0 failed)                       |

D70 changed the role of the writing user in `measure-organization`, `measure-refusal` and
`measure-export` to `admin`; members are the negatives. Not run: the full be-01 and fe-01 suites
and the host gate (CI carries them).

## Review fixes B 2026-10-24

D69 (budget admission inside the attempt start's write) and D71 (plan document always version
11, admitted by Twilight Navigator, Burokrat and Dash). Stacked on review fixes A (#701).

### Failure proofs

Each fault injected, the named test watched failing, the code restored.

| Guard                                     | Fault                                          | Observed                                                                                                            | Result         |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------- |
| `findExhaustedBudget` nothing-left test   | `held.remaining < 0` alone                     | domain `refuses at a strict budget spent to its cap, hold or none`                                                  | 5 pass 1 fail  |
| `findExhaustedBudget` hold test           | `reading.remaining <= 0` alone                 | domain `admits while the hold fits…` and `names the nearest refusing budget…`                                       | 4 pass 2 fail  |
| `findExhaustedBudget` strict-only blocked | policy test removed                            | domain `never refuses on an advisory or derived budget, readable or blocked`                                        | 5 pass 1 fail  |
| `startAttempt` admission                  | refusal skipped                                | be-01 `budget-admission.controller.db.test.ts` started the attempts                                                 | 1 pass 3 fail  |
| batch 409 `budget_exhausted` arm          | arm removed                                    | be-01 same file answered 500 "returned an undeclared refusal"                                                       | 0 pass 4 fail  |
| `refuseOutcome` detail                    | `remaining` replaced by 0                      | be-01 strict and blocked cases named remaining 0                                                                    | 2 pass 2 fail  |
| race model, admission read                | attempts read before the race queued (`stale`) | store-sqlite model: seed 20261024, shrunk `[RacingStarts(0), RacingStarts(1, 2, 0)]`, "Expected: <= 2, Received: 3" | 1 pass 1 fail  |
| race model, admission removed             | refusal skipped in `startAttempt`              | same seed and counterexample, "Expected: <= 2, Received: 3"                                                         | 1 pass 1 fail  |
| fe-01 `budget_exhausted` sentence         | entry struck                                   | `words each attempt refusal rather than naming its code` read the fallback carrying the code                        | 6 pass 1 fail  |
| export version (D71)                      | D63's conditional put back                     | core plan-document: the legacy-measures case and eight more read version 10                                         | 80 pass 9 fail |
| Navigator admits 11                       | 11 dropped from the guard and list             | `plan-reference.test.ts` "has version 11; twin reads versions 7 and 8 and 9 and 10 only"                            | 38 pass 6 fail |
| Navigator v11 branch                      | v11 parsed through the v10 shape               | the v11 positive exited 1 as malformed                                                                              | 43 pass 1 fail |
| Burokrat `planDocumentVersion`            | 11 dropped; 12 admitted                        | `navigator-records.test.ts` (13 pass 1 fail each) and Navigator's v11 positive                                      | as stated      |
| Dash through Burokrat                     | 11 dropped from Burokrat                       | `record-progress.test.ts` `beforeAll` failed generating the v11 reference                                           | 0 pass 1 fail  |

The "v10 bytes unchanged" pins (D63, D67) are retired as such: a plan without measures now
exports version 11. The v9 (`016181aa…`) and v10 (`f2308a55…`) goldens now hash a version-11
export with its additions removed (factor 1, four empty lists) and its version read as 9 or 10,
so they prove version 11 adds exactly those fields. The case "a plan whose measures are all
legacy exports version 10 without the factor" became "… exports version 11 with empty lists".
New golden: "a plan without measures exports canonical version-11 bytes",
`f8ed917417cae0509dc4fb4d1f5faacc49c246a2e108ebee04b638e045590a64`; `62708699…` is unchanged.
`budget-command.test.ts`'s two-attempt hold case now states the parent advisory, since a strict
parent refuses the second start (D69).

### Checks

`env -u CLAUDECODE` throughout; local Bun 1.4.4; each test invocation alone.

| Command                                                                                                                              | Result                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| domain `budget`, `budget-admission`                                                                                                  | 25 pass, 0 fail                            |
| core `src/module/plan-commands`, `src/module/work-item`, `src/http`; core `src/module/plan-document`                                 | 480 pass; 94 pass; 0 fail                  |
| store-sqlite `budget-admission-race`, `claim-lease`, `claim-lease-race`, `audit`, `step-node-attempt`, `step-node-attempt-migration` | 2, 11, 2, 6, 14, 6 pass; 0 fail            |
| store-memory `src`                                                                                                                   | 195 pass, 0 fail                           |
| be-01 `budget-admission`, `budget-headroom`, `measure-refusal`, `step-node-attempt`, `claim-lease` (controller, db)                  | 4, 7, 5, 124, 3 pass; 0 fail               |
| be-01 `measure-export` (db), `swarm-end-to-end.db`, `boot.db`                                                                        | 9, 7, 38 pass; 0 fail                      |
| contracts `refusal`, `contracts-boot-memory` (331 MB, bound 500 MB)                                                                  | 1, 2 pass; 0 fail                          |
| fe-01 `vitest run` `test-tiers`, `plan-refusal-measures`, `measure-panel`, `attempt-actions`, `measure-reading`                      | 61 passed across 5 files                   |
| Navigator `plan-reference`; Burokrat `navigator-records`, `plan-tasks`, `progress-receipt`; Dash `record-progress`                   | 44, 14, 44, 63, 70 pass; 0 fail            |
| `nx run-many -t typecheck,typecheck:module` over the eight WBS projects and the three Twilight ones                                  | succeeded                                  |
| `nx run tool-devsync:test --skip-nx-cache`, `tool-devsync:typecheck`                                                                 | succeeded; succeeded                       |
| Burokrat `check-indexes working . HEAD`; `pilot-policy.test.ts`                                                                      | exit 0 (store-memory README debt); 24 pass |
| `bunx nx format:check --all`; `bunx openspec validate --all --json`                                                                  | exit 0; 278 passed, 0 failed               |

Not run: the full be-01, fe-01 and Twilight suites, the fe-01 e2e spec whose sentence changed
(`measure-columns.spec.ts`), and the host gate (CI carries them).

## Main sync 2 2026-10-24

`origin/main` at `6a9a50abfbb0693de99394b4c72e0b0e185f69f0` merged into the plan branch at
`3b77052ba` (#690 claim display slices 1 and 2, #692 delivery tracking, #703 flake budgets,
#698 and #699 plan docs). Mechanical only: no behavior or decision changed. Main gained no
migration after `20261023100000_add_claim_lease`, so the four measure migrations keep their
stamps and no ledger list changed.

Conflicts, each resolved keeping both sides:

- `apps/wbs/be-01/src/testing/organization-harness.ts`: main's `openReadOnlyConnection` import
  beside the plan's `MeasureEstimateRepository` import.
- `libs/wbs/adapters/store-memory/src/in-memory-source.ts`: the plan's measure and measure
  estimate tables beside main's `memoryWorkItemTables` (the claims read takes the work-item
  tables).
- `libs/wbs/adapters/store-memory/src/source.ts`: the plan's `addOrganization` seam beside main's
  `endLeasesOf`.
- `libs/wbs/application/core/src/module/work-item/README.md`: the module index is the sorted
  union (the plan's budget and measure estimate reads, main's `project-claims.ts` and its test).
- `apps/wbs/mcp-01/README.md`: 90 tools. The arithmetic from the READMEs (86 at the merge base,
  plan 88, main 87) gave 89; `openapi-tools.test.ts` failed `Expected: 90 / Received: 89`, since
  main added two reads (claims and delivery) while its README count rose by one. 90 passes.

One auto-merge fix: fe-01 `throwReply` in `wbs-api.ts` drops the plan's `as WbsProblem` cast.
Main's `WbsProblem` failure arm takes the whole operation id union, so the 26-member
discriminant workaround became unnecessary and the pre-commit lint failed it
(`no-unnecessary-type-assertion`).

Checks (`env -u CLAUDECODE` throughout; local Bun 1.4.4):

| Command                                                                                     | Result                                       |
| ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `bun test libs/wbs/domain/contracts/src/http/contracts-boot-memory.test.ts`                 | 2 pass, 0 fail; peak RSS 403 MB (bound 500)  |
| `bunx nx run wbs-store-memory:test --skip-nx-cache`                                         | 195 pass, 0 fail across 13 files             |
| `bunx nx run wbs-store-sqlite:test --skip-nx-cache`                                         | 1897 pass, 0 fail of 1898 across 145 files   |
| be-01 `claim-lease`, `project-claims-organization` (new from main) controller db tests      | 3 and 8 pass, 0 fail                         |
| be-01 `budget-admission`, `budget-headroom`, `measure-export` controller db tests           | 4, 7 and 9 pass, 0 fail                      |
| be-01 `swarm-end-to-end`, `boot`, `migration-cli` db tests, one at a time                   | 7, 38 and 52 pass, 0 fail                    |
| mcp-01 `generated-document.test.ts` and `openapi-tools.test.ts`                             | 44 pass, 0 fail                              |
| `bunx nx run wbs-conformance:test --skip-nx-cache`                                          | 35 pass, 0 fail                              |
| `bunx nx run-many -t typecheck,typecheck:module` over the 13 wbs projects                   | succeeded                                    |
| `bunx nx run tool-devsync:test --skip-nx-cache`, `tool-devsync:typecheck`                   | 921 pass, 0 fail; succeeded                  |
| `bunx nx run wbs-fe-01:test:unit --skip-nx-cache`                                           | 1034 pass across 83 files (`test-tiers` too) |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0                                       |
| `pilot-policy.test.ts` with `TOOL_WIKI_TRUSTED_NODE_MODULES` as the nx target sets it       | 24 pass, 0 fail                              |
| `bunx nx format:check --all`                                                                | exit 0                                       |
| `bunx openspec validate --all --json`                                                       | 283 of 283 passed                            |

Not run: the host gate, the browser tiers and the full be-01 db suite.
