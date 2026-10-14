# WBS persistence batch integration — 2026-10-14

This candidate preserves the reviewed commit histories using three ordered merge commits.
GitHub main was freshly read through `gh api repos/Prosperous-Unification/puni-00/commits/main --jq .sha` before preparing the isolated clone.

## Topology

| Merge                                      | First parent                               | Second parent                                     |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------- |
| `b65ea5236244bce130bb2de8b4e64d2d032ca120` | `8f324607e6c73c249faa79733c4cb7a7dddc605b` | `9896a3136acc776c5ac8180467d7c02865e18fb7` (#443) |
| `a6a3bf4106d22de095bf91a5049ffea38246bc2b` | `b65ea5236244bce130bb2de8b4e64d2d032ca120` | `f7b7d22a6f851108c1e68434177022c91bede1bb` (#435) |
| `48ee965b9340d962c408a2d8d1d0f1242ce42b85` | `a6a3bf4106d22de095bf91a5049ffea38246bc2b` | `8b6388e43f798ccb0558bcf7741620c3c2768720` (#440) |

The follow-up verification commit contains the cumulative empty-blockage rollback expectation, an adjacent Navigator proof comment, and this record. No original commit was rewritten.

## Conflict decisions

#443 conflicted in `apps/twilight-structure/twilight-navigator/cli/src/plan-reference.ts`.
Main's external v7/v8 support and explicit v9 refusal are retained. Both historical wire schemas omit the new required v9 `stepBlockages`; the v8 header remains explicitly pinned. Decoded v7/v8 documents become internal v9 documents with empty direct blockage facts. v7 retains its workdays upgrade; v8 retains native estimate units. The automatically combined tests included an older duplicate v9 refusal diagnostic; its distinct explicit-blockage case now asserts the retained v7/v8 diagnostic. The root coordinator authorized this preservation union before implementation.

#435 merged cleanly, including its Kubernetes coordinator and deployment/runbook changes.

#440 conflicted in the following 31 files:

- `apps/wbs/be-01/src/migration-cli.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/browser-auth-lifecycle.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/calendar-marker-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/delegation-use.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/email-challenge-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/email-verification-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/enterprise-sso-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/identity-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/migrate-down.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/migrate.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/optimized-schedule-cache.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-activation.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-audit.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-bridge.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-ownership-freeze.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-ownership.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/organization-records.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/project-rank.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/project-settings.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/project-solution.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/project.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/saved-plan-created-by-id.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/saved-plan-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/schema.ts`
- `libs/wbs/adapters/store-sqlite/src/shared-people-audit.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/shared-people-mode.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/shared-people-rollback.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/space-rollback.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/space.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/step-code-migration.db.test.ts`
- `libs/wbs/adapters/store-sqlite/src/step-estimate-unit-migration.db.test.ts`

The schema retains the entire Step blockage table and all four shared restore tables, with their original constraints and indexes. Test ledger lists retain all migrations in their actual forward/reverse order; historical schema filters retain all newly excluded tables. The latest-ledger assertions name the restore receipt migration. The estimate-unit damaged-journal test retains the watched exact-state proof comment, and begins at the same historical boundary with an explicit cumulative reverse list. Harnesses, core/store exports, and runbooks merged automatically; their retained surfaces are covered by lint, types, and focused tests.

Focused testing found an additional non-conflicted expectation in `step-blockage-migration.db.test.ts`: empty-table rollback also reverses both shared restore migrations before the blockage migration. Its expected sequence now lists all three.

## Verification

All commands ran in `/tmp/puni-persistence-batch-sol`, with logs retained under `/tmp/puni-persistence-*.log` for the independent review.

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: passed, 1573 installs across 1447 packages, no changes. The first attempt without `BUN_TMPDIR` was refused by the sandbox's temporary-directory policy.
- `NX_DAEMON=false bunx nx run-many -t lint,typecheck --projects=wbs-store-sqlite,wbs-core,wbs-store-memory,wbs-domain,wbs-contracts,tool-deploy,tool-remote-scripts,twilight-navigator --parallel=2`: passed, 17 tasks, no cache hits. Nx reported socket denial and used its documented in-process plugin fallback.
- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json`: passed.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` with the three new forward migration paths: passed. Each new migration has its paired `down.sql`; their existing migration and rollback suites exercise forward/down behavior.
- Prettier check across changed TypeScript, Markdown, JSON and YAML paths excluding evidence: passed.
- Navigator and Step blockage migration rerun: 31 pass, zero failures.
- SQLite adapter plus backend migration CLI suite: 1519 pass; five initial failures consisted of the corrected cumulative rollback expectation and four sandbox-denied child-process cases. The corrected migration case and lifecycle/concurrency/busy cases were rerun individually with zero failures.
- Broad focused core, memory, domain, contracts, Kubernetes, swap and Navigator run: 2780 pass, one deliberate elapsed benchmark skip; sandbox denied five local-server cases and one deploy module setup, and concurrent CPU accounting caused one benchmark assertion failure. Precise permitted reruns passed: 20 registry/lifecycle/concurrency cases, five Git HTTP/benchmark cases (one deliberate elapsed skip), three deploy cases.
- Fresh migrated SQLite audit retained `step_blockage_by_step`, operation digest uniqueness, approval binding/operation-organization uniqueness, and consumption operation-organization uniqueness. Composite restore foreign keys were present; `PRAGMA integrity_check` returned `ok`; `PRAGMA foreign_key_check` returned no rows.

## R5 proof

Injected fault: let both Navigator wire decoders inherit the v9 required blockage collection by removing `stepBlockages` from their omit lists. The production `plan-reference` path then failed valid v7 and v8 exports with `stepBlockages must be an array (was missing)`; the negative run exited 1. Restoring the omissions returned the exact 31-case focused suite to green. The adjacent decoder comment names this fault and observed test. Existing Step replay/restore safety checks and their proof comments remain intact; no new safety policy was introduced by the mechanical schema/ledger unions.

## Scope limits

No push, PR, shared checkout change, deployment, host gate, full build, secrets scan, or full browser suite was performed. This is a locally verified integration candidate awaiting independent review and the root coordinator's host gate. The elapsed benchmark certification remains deliberately skipped by its existing test condition.
