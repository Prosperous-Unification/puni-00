# Receiver gate reconciliation

The first full canonical gate at e6aa12bd6 revealed a closed-module repository capability leak and stale integration fixtures, despite the accepted receiver slice/final reviews. Restore the existing module architecture and complete migration/catalog expectations without changing the receiver protocol or weakening guards. This is a fix to precise existing specifications within twilight-agentic-workflows, not a new runtime feature. The original packet is accepted at immutable5ba6ccbdf98b0794dacfed441464fb28a8b8e5ed after scoped/final review, exact h4 host gate and all applicable CI passed. Checklist completion below refers only to that historical packet. The current-main integration has a separately named unique runtime migration and requires its own review, exact-SHA host gate and CI.

## Global Constraints

- Root owns commits, planning, verify and integration. One source implementer at a time; no subagents or commits from implementer. Bun/Nx only. Preserve unrelated work and native worktrees.
- Keep the module-boundary audit, shrink-only debt, parser/authorization/ledger/rollback guards and every existing protocol/refusal unchanged. No allowlist, skip, eslint disable, renamed business logic as a resource, empty snapshot or tautological expected-from-actual oracle.
- Keep real borrowed UoW ownership and current-scope authorization. No second transaction engine, public store reentry, new source migration, hash edit, fallback or recovery claim.
- New safety checks require actual production-path negative and watched fault/restoration with adjacent Proof; pure delegation/type relocation adds no new safety guard. Existing fault matrices need not be recertified.

### Task 1: Restore receiver conformance in the full workspace gate

**Files:** Create libs/wbs/application/core/src/module/plan-commands/runtime-commands.resource.ts and libs/wbs/application/core/src/ports/runtime-command-values.ts. Update only runtime-authority.ts, runtime-command.ts, runtime-claim.ts, runtime-write.ts, composition.ts and README.md in that module; ports/runtime-command-store.ts and runtime-command-records.ts for value-type relocation/re-exports; libs/wbs/adapters/store-memory/src/memory-source.test.ts; the named SQLite migration fixture files listed below. If a real dependency requires any other final source edit, report to root before expanding.

- libs/wbs/adapters/store-sqlite/src/browser-auth-lifecycle.db.test.ts
- libs/wbs/adapters/store-sqlite/src/calendar-marker-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/claim-occupancy-schema.db.test.ts
- libs/wbs/adapters/store-sqlite/src/delegation-use.db.test.ts
- libs/wbs/adapters/store-sqlite/src/email-challenge-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/email-verification-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/enterprise-sso-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/identity-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/migrate-down.db.test.ts
- libs/wbs/adapters/store-sqlite/src/migrate.db.test.ts
- libs/wbs/adapters/store-sqlite/src/optimized-schedule-cache.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-activation.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-audit.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-bridge.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-ownership-freeze.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-ownership.db.test.ts
- libs/wbs/adapters/store-sqlite/src/organization-records.db.test.ts
- libs/wbs/adapters/store-sqlite/src/project-rank.db.test.ts
- libs/wbs/adapters/store-sqlite/src/project-settings.db.test.ts
- libs/wbs/adapters/store-sqlite/src/project-solution.db.test.ts
- libs/wbs/adapters/store-sqlite/src/project.db.test.ts
- libs/wbs/adapters/store-sqlite/src/saved-plan-created-by-id.db.test.ts
- libs/wbs/adapters/store-sqlite/src/saved-plan-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/shared-people-audit.db.test.ts
- libs/wbs/adapters/store-sqlite/src/shared-people-mode.db.test.ts
- libs/wbs/adapters/store-sqlite/src/shared-people-rollback.db.test.ts
- libs/wbs/adapters/store-sqlite/src/space-rollback.db.test.ts
- libs/wbs/adapters/store-sqlite/src/space.db.test.ts
- libs/wbs/adapters/store-sqlite/src/step-blockage-receipt.db.test.ts
- libs/wbs/adapters/store-sqlite/src/step-code-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/step-estimate-unit-migration.db.test.ts
- libs/wbs/adapters/store-sqlite/src/step-parallel.db.test.ts

Additional exact backend gate failures discovered while the same aggregate run continued:

- apps/wbs/be-01/src/person-account-migration.db.test.ts
- apps/wbs/be-01/src/migration-cli.db.test.ts
- apps/wbs/be-01/src/test-tiers.test.ts

The completed same gate also exposes these exact declaration files:

- libs/wbs/adapters/store-memory/src/README.md
- apps/wbs/mcp-01/src/generated-document.test.ts
- apps/wbs/mcp-01/README.md

The focused committed-candidate pilot follow-up additionally requires exactly docs/wiki-policy/modules.json to declare the already indexed real runtime-command route consumer in the plan-commands module mapping. No bootstrap mapping entry exists for this module.

**Interfaces:** RuntimeCommands is a real private-store resource bound to the admitted organization/project/person scope, with explicit portable value signatures. Feature callers cannot choose another store scope. Remove repeated scope arguments from its authority/binding/receipt reads and writes; resource construction captures the admitted scope and acceptance insertion supplies that scope internally. Keep every existing receiver authorization/canonical/receipt guard in the feature helpers. Its store is private and its public surface exposes no RuntimeCommandStore, Scope, UnitOfWork or indexed repository method types. Move the actual RuntimeLedger/StoredRuntimeAcceptance value declarations to runtime-command-values.ts; preserve existing store-module type re-exports for adapter consumers. Feature code imports values directly and gets RuntimeCommands from RuntimeAdmission; composition constructs it over the already admitted runtime store. Do not change method behavior or protocol checks; preserve existing helper bodies where possible.

- [x] Reproduce the production closed-feature audit failure and memory catalog failure before source corrections. The retained h4 failure log is aggregate RED for legacy migration arrays; reproduce one representative rollback case locally. Use actual files/tests, not a generated stand-in.
- [x] Implement the resource/value ownership mapping. The unchanged module-boundaries.test.ts production audit must pass. Keep repository capability private; explicitly type delegate return values from non-store-owned records. Do not move policy/receiver business logic into the exempt resource file. Add the real resource/value navigation memberships as appropriate.
- [x] Extend STORE_BINDINGS and actual detached-value cases for the runtime family, using real seeded raw storage records and both public/admitted paths. Claim no business acceptance from raw fixtures. Preserve caller mutation plus reread assertions and existing table coverage; do not merely bypass the exact catalog comparison.
- [x] Update only stale independent migration names/order/ledger cardinality expectations in the listed legacy fixtures for additive migration20261022120000_add_runtime_commands. Preserve rollback refusal/row/hash/full-ledger and down/up checks, not subsets or expected values copied from the actual command output. If a failure is not mechanical catalog drift, report its exact cause before editing. No forward/down SQL changes.
- [x] Restore the existing backend tier recognizer for the actual openSpaceDatabase helper used by the three new SQLite controller suites. Inspect its real migrated SQLite opening; reproduce the exact misfiling RED, add the opener and watch removal reproduce it, then restore GREEN with adjacent truthful Proof. No suite exclusions, renamed files or weakened assertion. Update only independent complete rollback/latest/ledger expectations in the two named backend migration fixtures, preserving all existing row/hash/refusal/down-up checks.
- [x] Restore complete declarations exposed in the final same-gate inventory: explicit memory index memberships for runtime-command.ts and runtime-command.test.ts; the independent complete MCP operation-name list adds acquireRuntimeAuthority, applyRuntimeCommands, lookupRuntimeReceipt and readRuntimeState; MCP README states the actual 88-tool count and describes these four receiver operations. Reproduce and pass the unchanged production index-checker test plus generated-document/README coverage. No index wildcard, missing-member exclusion, generated expectation or MCP authentication/consent/credential/derivation changes.
- [x] Reconcile only the plan-commands module mapping in docs/wiki-policy/modules.json with its existing explicit README external consumer: libs/wbs/application/core/src/http/runtime-command.routes.ts. Preserve every existing consumer, predecessor, source revision and authority field; no wildcard, policy-rule, bootstrap-map or validator change. The actual pilot positive/refusal cases must reach their intended outcomes after this exact declaration repair.
- [x] Watch a temporary public repository exposure from the new real resource make the unchanged production module audit fail, then restore exact source bytes and final passing output. This substantiates ownership mapping; do not recertify every old guard.
- [x] Run relevant focused tests while iterating, then one complete test run for wbs-core,wbs-store-memory,wbs-store-sqlite and scoped lint/typecheck for core/backend/both adapters/contracts as needed by changed type propagation. Root owns all full host gates. Do not rerun unchanged suites after cosmetic edits. Record real outputs/warnings and every failed attempt.

**Report:** .superpowers/sdd/receiver-gate-tasks/task-1-report.md; evidence task-1-evidence/. Return DONE/concerns, no commits, exact checks, source stable/slot released. No other task.
