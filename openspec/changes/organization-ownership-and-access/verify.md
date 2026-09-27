# Verification — organization ownership and access

Written as a spec-time plan; implementation slices record their observed evidence in their own sections below. Rows still marked Pending have no implementation yet; a check without an observed production-path failure is incomplete.

## Structural validation

- Spec-time `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0: 127 items passed, 0 failed; this change had no issues. Other existing items emitted non-failing information and warnings.
- Round-2 `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0: 127 passed, 0 failed; 27 informational archive-prerequisite notices and one unrelated `dev-deploy` purpose warning. `bunx prettier --write` and `bunx prettier --check` on all changed files, `git diff --check`, and the seven reviewed proposal intent counts (maximum 314 words) exited 0.

## Task completion and delta sync

- Tasks 1.2, 1.3, 1.4 and 1.5 are complete at the storage boundary (slice 1 below); every other checkbox remains open and archive is blocked.
- `organization-access`, `organization-onboarding`, `organization-domains`, `organization-realtime`, `organization-mcp` and `organization-migration` are new delta capabilities; main-spec sync is pending after implementation.

## R5 failure proofs — pending implementation

| Production-path check                        | Fault to inject                                                  | Test that must fail when broken               | Observed result |
| -------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------- | --------------- |
| Unique external identity and Dany resolution | Duplicate issuer/subject or Dany candidate                       | Mounted resolver and activation inventory     | Pending         |
| Complete legacy ownership/backfill           | Old writer creates unmapped project                              | Mixed-version activation preflight            | Pending         |
| Current membership and active organization   | Forge org context or remove member with live token               | Mounted be-01 read/write matrix               | Pending         |
| Cross-organization references                | Remove organization predicate in batch or import                 | Mounted foreign-reference write test          | Pending         |
| Role and final-owner guards                  | Bypass role check or demote final super-admin                    | Mounted role-action matrix                    | Pending         |
| Domain policy and TXT proof                  | Remove public-domain guard, use stale token, or lose policy file | DNS claim fixture through production service  | Pending         |
| Unique verified domain owner                 | Remove transactional uniqueness guard                            | Concurrent domain-claim test                  | Pending         |
| Invitation acceptance                        | Disable atomic consumption                                       | Expired/address-mismatch/replay mounted tests | Pending         |
| Join approval                                | Approve after domain suspension or twice                         | Mounted approval test                         | Pending         |
| Gateway admission/replay                     | Disable subscription or replay check                             | Live cross-org subscribe/replay test          | Pending         |
| Gateway revocation                           | Drop invalidation and remove lease/replay recheck                | Timed removed-member socket test              | Pending         |
| MCP delegation                               | Drop or forge org binding during upstream token translation      | End-to-end MCP-to-be-01 tool test             | Pending         |
| MCP current membership                       | Remove per-call check                                            | Removed-member live-token tool test           | Pending         |
| Rollback activation fence                    | Bypass durable marker check                                      | Actual swap-abort rollback test               | Pending         |

Additional production-path negatives are required separately for project, directory, step/allowance/schedule, dependency/batch, import/copy, and saved-plan/history/event authorization; each boundary must fail its own mounted foreign-resource fixture when its predicate is removed. Password-account email verification must fail when an unverified address is accepted; Auth0 linking must fail when email alone merges two local IDs. Domain checks must distinguish missing, unreadable and malformed policy, day-7 retained-proof success, day-14 suspension with retained owner, rotation and suspended-to-verified recovery. MCP cutover must refuse an active or restartable old writer before epoch advancement and fail old access, code and refresh use after restart, unbound direct-token fallback and a refresh-retry that loses delegation. Activation state must distinguish absent, unreadable and malformed marker/epoch, and the actual swap must refuse both WBS and MCP-store down migrations after activation. Record the observed command, injected fault and failed assertion for every task-specified guard; these are pending until implementation.

Every implemented guard needs an adjacent `Proof:` comment naming its injected fault and observed test. Test absence and unreadability separately wherever a policy file or trusted state distinguishes them. A command exit code alone does not prove the intended effect.

## Slice 1 — organization records (tasks 1.2, 1.3, 1.5)

Branch `batch-9/010-5-2-orgs`. One additive folder, `apps/wbs/be-01/drizzle/20260927120000_add_organization_records`, creates `external_identity`, `organization`, `organization_membership`, `organization_invitation`, `organization_join_request` and `organization_domain_claim`; its `down.sql` drops them children first. No route reads them, so the release is inert. Repository guards live in `libs/wbs/adapters/store-sqlite/src/{external-identity,organization,domain-claim}.ts`; the mounted-route halves of these proofs belong to tasks 2.3, 3.7 and 5.2.

| Check                                             | Injected fault                                     | Observed failure (`organization-records.db.test.ts`, 2026-09-27)                                 |
| ------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Unique issuer/subject                             | `external_identity_issuer_subject` made non-unique | two mapping cases fail: `ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint` |
| One organization per unaffiliated creator         | zero-membership recheck removed                    | concurrent-creation case fails: both outcomes `created`                                          |
| Final super-admin                                 | guard returns null                                 | `Expected: "last-super-admin"`, `Received: "changed"`                                            |
| Unique verified domain owner                      | owner index made non-partial, non-unique           | `Expected: "taken"`, `Received: "verified"`                                                      |
| Join-request invitation stays in its organization | composite FK replaced by single-column FK          | `Received function did not throw`                                                                |

Each migration constraint (single legacy organization, invitation expiry and consumption, one pending join request, join-request resolution, domain challenge pair, previous-proof pair, owned proof) has its own `refuses a row that breaks …` case, and each failed alone when its constraint was removed. Removing the creation transaction left an organization behind (`Received: 1`); dropping the digest or expiry predicate from `promoteClaim` answered `verified` for a stale challenge.

Command: `env -u CLAUDECODE bun test libs/wbs/adapters/store-sqlite/src/organization-records.db.test.ts`, 21 pass with the faults restored.

Pre-activation rollback round trip: `rolls back before activation, taking only its tables and keeping users` passes; every existing rollback-list test now names the new folder.

## Slice 2 — ownership side tables (task 1.4)

Branch `batch-9/010-5-2-orgs-ownership`, stacked on slice 1. `apps/wbs/be-01/drizzle/20260927130000_add_organization_ownership` adds one `<root>_organization` side table per root (project, person, service_team, service, tag, work_item_type, external_system, saved_plan). The six catalog tables carry an organization-scoped `name` under `UNIQUE (organization_id, name)`. The legacy global name indexes are unchanged; Astra's design call was that no additive index can relax them. `ON DELETE CASCADE` lets the outgoing release delete a mapped root. `OrganizationOwnershipRepository.findUnmappedRoots` is the reconciliation that activation preflight (7.1) will require to be empty.

| Check                                     | Injected fault                                                                      | Observed failure (`organization-ownership.db.test.ts`, 2026-09-27)                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Reconciliation covers every root kind     | `saved_plan` removed from the kinds and pairs                                       | `reports an unmapped root of every kind, and only the unmapped ones`                                   |
| Ownership row well-formed (8 tables)      | `NOT NULL`, organization reference or `resource_id` primary key dropped, each alone | all eight `refuses a malformed … ownership row` cases                                                  |
| Mapping points at a real root             | root reference dropped                                                              | those eight and the populated round trip                                                               |
| Outgoing release can delete a mapped root | `ON DELETE CASCADE` dropped                                                         | `lets the outgoing release delete a mapped root`                                                       |
| Organization-scoped catalog name          | `*_organization_name` made non-unique                                               | six `refuses one … name twice` cases and `holds the same catalog name in two organizations, once each` |

`round-trips a populated previous schema, leaving every legacy row as it was` seeds the previous schema with linked roots, applies the migration, writes mappings and old-release inserts and deletes, reverses it, and compares every legacy table row for row.

The same-name case proves storage capability only; live two-organization naming belongs to task 3.2's mounted test. Pre-activation rollback keeps every root (`rolls back before activation, keeping every root`). Command: `env -u CLAUDECODE bun test libs/wbs/adapters/store-sqlite/src/organization-ownership.db.test.ts`: 19 pass. The earlier full `libs/wbs/adapters/store-sqlite/src` run had 789 pass and 1 fail; the failure is the `Bun.spawn` lock-holder case that also fails on an untouched main checkout on this host.

## Slice 3 — MCP store migration (task 1.6)

Branch `batch-9/010-5-2-orgs-2`, stacked on slice 2. `apps/wbs/mcp-01/drizzle/20260927120000_mcp_credential_binding` adds `organization_id`, `user_id`, `issuer` and `credential_epoch` to `mcp_family` and `mcp_session`, the `mcp_credential_epoch` singleton seeded at 0, and triggers for immutable bindings, session/family equality and the durable epoch. `src/store-migrations.ts` replaces the constructor's `CREATE TABLE IF NOT EXISTS` text with a checksummed `mcp_migration` ledger run under one IMMEDIATE transaction, exact-baseline adoption of pre-ledger stores, a fail-closed epoch reader and a preflighted rollback. `McpSessionStore` refuses startup at any epoch but 0 and copies each family's binding and epoch into its sessions. Nothing issues a bound credential yet (task 6.4).

Astra design call (2026-09-27): keep creating an **absent** path before activation so dev, k3s and local first starts keep working; treat an existing zero-byte or empty-schema file as partial and refuse it. Activation work must withdraw creation before the epoch advances.

| Check                                  | Injected fault                                             | Observed failure (`store-migrations.test.ts`, 2026-09-27)                                                                                  |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact-baseline adoption                | comparison removed                                         | `refuses a partial pre-ledger store`: `Received function did not throw`                                                                    |
| Existing empty file is not initialized | `empty && !created` guard removed                          | `refuses an existing zero-byte file instead of initializing it`: did not throw                                                             |
| Unedited, known history                | checksum check, then prefix check, removed                 | `refuses edited SQL and unknown history`: did not throw; `undefined is not an object`                                                      |
| Epoch unreadable                       | reader returns 0 on error                                  | `refuses startup on a missing table without reseeding`: did not throw                                                                      |
| Epoch malformed                        | malformed throw removed                                    | `refuses startup on a malformed value …`: unsupported-epoch message instead                                                                |
| Only epoch 0 starts                    | startup epoch check removed                                | `refuses startup on a unsupported epoch …`: did not throw                                                                                  |
| Null organization refused              | `organization_id IS NOT NULL` dropped from the CHECK       | `rejects a family without organization`: did not throw                                                                                     |
| Eight triggers                         | each disabled alone                                        | its own `rejects a …` case, and `refuses to refresh a family issued before the epoch advanced` for the session epoch                       |
| Rollback preflight                     | epoch, usable-family and live-session checks, each removed | `refuses at an advanced epoch`, `refuses while a bound family without sessions can still refresh`, `refuses while a bound session is live` |
| Dead bound rows purged on down         | purge turned into a SELECT                                 | `purges dead bound credentials, preserves legacy ones and reaches the baseline`                                                            |

IMMEDIATE is not claimed as a safety check: with a deferred transaction SQLite still refuses the stale writer, so `applies each migration once when two processes start on one absent store` passes either way. Command: `env -u CLAUDECODE bun test` in `apps/wbs/mcp-01`, 196 pass.

## Pending gate output

- Targeted unit, mounted API, socket, MCP, migration and browser tests: pending.
- Migration lint: slice 1's `migration.sql` passes `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts`. Paired MCP-store rollback: `rollbackMcpStore` with preflight (slice 3); the swap-level MCP rollback is task 7.2.
- `bunx nx format:check --all` and `bunx nx run-many -t test lint typecheck build`: pending.
- `bin/h2puni-gate.sh <sha>`: pending a committed implementation SHA; record its printed running SHA and full outcome.
- Implementation commit range and host gate: per slice, recorded by the batch integration gate.

## Decision

Implementation verification is pending. Do not mark the change complete or archive it from this spec-time record.

## Astra consultation

The requested `codex exec -m gpt-6-astra -c model_reasoning_effort=high --skip-git-repo-check` review of the MCP epoch cutover was attempted during this spec pass. It exited 1 with model refresh and workspace routing connection failures; no answer was returned. The mixed-version writer gap was closed by requiring old mcp-01 processes to drain and be fenced from restart before epoch advancement, with a planned production-path overlap test.
