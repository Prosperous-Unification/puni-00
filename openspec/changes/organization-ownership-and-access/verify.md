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

| Check                                 | Injected fault                          | Observed failure (`organization-ownership.db.test.ts`, 2026-09-27)                               |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Reconciliation covers every root kind | `saved_plan` filtered out of the walk   | `reports an unmapped root of every kind`: `- "saved_plan"`                                       |
| Organization-scoped catalog name      | `tag_organization_name` made non-unique | `holds the same catalog name in two organizations, once each`: `Received function did not throw` |

The same-name case proves storage capability only; live two-organization naming belongs to task 3.2's mounted test. Pre-activation rollback keeps every root (`rolls back before activation, keeping every root`). Command: `env -u CLAUDECODE bun test libs/wbs/adapters/store-sqlite/src`: 789 pass, 1 fail. The failure is the `Bun.spawn` lock-holder case that also fails on an untouched main checkout on this host.

## Pending gate output

- Targeted unit, mounted API, socket, MCP, migration and browser tests: pending.
- Migration lint: slice 1's `migration.sql` passes `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts`. Paired MCP-store rollback: pending task 1.6.
- `bunx nx format:check --all` and `bunx nx run-many -t test lint typecheck build`: pending.
- `bin/h2puni-gate.sh <sha>`: pending a committed implementation SHA; record its printed running SHA and full outcome.
- Implementation commit range and host gate: per slice, recorded by the batch integration gate.

## Decision

Implementation verification is pending. Do not mark the change complete or archive it from this spec-time record.

## Astra consultation

The requested `codex exec -m gpt-6-astra -c model_reasoning_effort=high --skip-git-repo-check` review of the MCP epoch cutover was attempted during this spec pass. It exited 1 with model refresh and workspace routing connection failures; no answer was returned. The mixed-version writer gap was closed by requiring old mcp-01 processes to drain and be fenced from restart before epoch advancement, with a planned production-path overlap test.
