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

| Check                                          | Injected fault                                               | Observed failure (`store-migrations.test.ts`, 2026-09-27)                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact-baseline adoption                        | comparison removed                                           | `refuses a partial pre-ledger store`: adopted, then refused only as drift                                                                  |
| Ledgered schema equals its recorded migrations | check removed                                                | both `refuses a ledgered store whose schema drifted` cases (missing `mcp_refresh`, unconstrained epoch table): did not throw               |
| Existing empty file is not initialized         | `empty && !created` guard removed                            | `refuses an existing zero-byte file instead of initializing it`: did not throw                                                             |
| Unedited, known history                        | checksum check, then prefix check, removed                   | `refuses edited SQL and unknown history`: did not throw; `undefined is not an object`                                                      |
| Epoch unreadable                               | reader returns 0 on error                                    | `refuses an unreadable epoch table instead of defaulting it`: did not throw                                                                |
| Epoch malformed                                | malformed throw removed                                      | `refuses startup on a malformed value …`: unsupported-epoch message instead                                                                |
| Only epoch 0 starts                            | startup epoch check removed                                  | `refuses startup on a unsupported epoch …`: did not throw                                                                                  |
| Null organization refused                      | `organization_id IS NOT NULL` dropped from the CHECK         | `rejects a family without organization`: did not throw                                                                                     |
| Nine triggers                                  | each disabled alone, including the `INSERT OR REPLACE` guard | its own `rejects a …` case, and `refuses to refresh a family issued before the epoch advanced` for the session epoch                       |
| Rollback preflight                             | epoch, usable-family and live-session checks, each removed   | `refuses at an advanced epoch`, `refuses while a bound family without sessions can still refresh`, `refuses while a bound session is live` |
| Dead bound rows purged on down                 | refresh purge, then family purge, turned into a SELECT       | `purges dead bound credentials, preserves legacy ones and reaches the baseline`; its connection has foreign keys off, so no cascade helps  |

Dev store check (2026-09-27): the orchestrator read the dev mcp-01 store's `sqlite_master` read-only. Its five objects equal the baseline under the adoption normalisation, and `migrateMcpStore(db, false)` adopted a copy built from that text. Main's first-parent history shipped one constructor schema only (`git log --first-parent` on `session-store.ts`); the variant without `upstream_refreshed_at` lived only inside PR #27. `adopts the dev store schema read from its sqlite_master on 2026-09-27` pins the dev text; with `upstream_refreshed_at` removed from it the test failed with the baseline refusal.

IMMEDIATE is not claimed as a safety check: with a deferred transaction SQLite still refuses the stale writer, so `applies each migration once when two processes start on one absent store` passes either way. Command: `env -u CLAUDECODE bun test` in `apps/wbs/mcp-01`, 200 pass.

## Slice 4 — durable activation marker (task 2.6)

Branch `batch-9/010-5-2-orgs-3`, stacked on slice 3. `apps/wbs/be-01/drizzle/20260927180000_add_organization_activation` adds the `organization_activation` singleton, seeded `pre_activation`, with CHECKs tying `activated_at` to the state and three triggers that make `activated` permanent (no update, no delete, no second insert, so `INSERT OR REPLACE` and upserts cannot replace it with `recursive_triggers` off). Its `down.sql` first proves one well-formed `pre_activation` row through a named `CHECK`, so an activated, missing or malformed marker refuses the reversal inside the runner's transaction. `readOrganizationActivation` in `@wbs/store-sqlite` throws `OrganizationActivationRefused` with `absent`, `unreadable` or `malformed` and never defaults. Nothing writes `activated` yet; activation is task 7.1.

Astra design call (2026-09-27): ship the marker and reader now, and do not wire a check into `swap.ts` from the target image: a missing CLI in an older green image proves nothing about database state. The swap-level refusal and its test move to 7.3, which must use a deploy-side checker independent of the target image and cover `abortSwap`.

| Check                      | Injected fault                                                                            | Observed failure (`organization-activation.db.test.ts`, 2026-09-27)                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Absent is not inactive     | reader returns `pre_activation` when the table is missing                                 | `refuses an absent marker table`                                                                                                 |
| Unreadable is not inactive | each catch returns `pre_activation`                                                       | `refuses an unreadable database`; `refuses an unreadable marker table`                                                           |
| Malformed is not inactive  | malformed throw returns `pre_activation`                                                  | all seven `refuses a malformed marker` cases                                                                                     |
| Row validation             | row count, singleton, null-time, integer-time test removed alone (`parseActivationState`) | its own case: second row, wrong singleton, time before activation, text/missing time                                             |
| Seed                       | seed `INSERT` replaced                                                                    | 15 cases, including `reads the seeded marker as pre-activation`                                                                  |
| Schema CHECKs              | state, singleton, integer-time, consistency CHECK removed alone                           | `refuses an unknown state`, `a wrong singleton`, `a text time`, `activation without a time`                                      |
| Permanence                 | `WHEN 0` on `_no_delete`, `_no_revert`, `_single_row`                                     | `keeps an activated marker permanent against` delete; reset and timestamp change; replacement                                    |
| Down guard                 | `CHECK (1)`; then the count, singleton, state and null-time predicates removed alone      | the five `refuses rollback across` damaged-marker cases; then second row, wrong singleton, unknown state, time before activation |

Command: `env -u CLAUDECODE bun test` over the eleven migration-listing suites in `libs/wbs/adapters/store-sqlite` plus `organization-activation.db.test.ts`.

## Slice 5 — legacy bridge (task 2.1)

Branch `batch-9/010-5-2-orgs-4`, stacked on slice 4. `apps/wbs/be-01/drizzle/20260927190000_add_organization_bridge` adds an `AFTER INSERT` trigger on each of the eight root tables and an `AFTER UPDATE OF name` trigger on the six catalogs. While the marker says `pre_activation` and a legacy organization exists, they map each new root to it and keep catalog side names equal. With no legacy organization they map nothing. After activation they map nothing and never touch display names. A missing or malformed marker aborts the root write. `OrganizationOwnershipRepository.backfillLegacyOwnership` maps every unmapped root in one immediate transaction and never overwrites. It refuses when no legacy organization exists, after activation, over a broken marker, or when any root is already owned by another organization. `findCatalogNameDrift` reports legacy side names that no longer equal their root's. Saved plans map to legacy like every other root. Their project-equality check, and the rest of task 2.2's dependent reconciliation, is the next slice.

| Check                                     | Injected fault                                                             | Observed failure (`organization-bridge.db.test.ts`, 2026-09-27)                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Insert bridge                             | `WHEN 0` on the `project`, then the `service`, trigger                     | `maps every root either release writes …`, `maps late writes from a second connection without another backfill` (plus backfill and rollback cases) |
| Rename bridge                             | `WHEN 0` on the `tag` rename trigger                                       | `keeps every catalog side name equal through renames`                                                                                              |
| Insert lifecycle                          | `pre_activation` predicate dropped (`project`, then `tag`)                 | `leaves a second organization's roots and names to explicit mappings`                                                                              |
| Rename lifecycle                          | `pre_activation` predicate dropped (`tag`)                                 | `stops mirroring legacy catalog renames into organization display names`                                                                           |
| Broken marker                             | the RAISE in each of the 14 triggers replaced by `SELECT 1`, one at a time | that trigger's own `refuses a <kind> insert/rename over a missing marker row` and `… malformed marker`                                             |
| Foreign owner before activation           | refusal removed                                                            | `refuses to backfill over a root another organization owns`                                                                                        |
| Backfill after activation / broken marker | marker read removed                                                        | `refuses to backfill after activation`, `refuses backfill over a broken marker`                                                                    |
| Backfill without legacy                   | refusal returns empty counts                                               | `maps nothing and refuses backfill while no legacy organization exists`                                                                            |
| Name drift                                | comparison replaced by `WHERE 0`                                           | `reports catalog name drift the bridge missed`                                                                                                     |

Command: `env -u CLAUDECODE bun test` over 22 store-sqlite files, including every migration-listing suite, `directory`, `import.service` and `saved-plan*`: 378 pass.

## Slice 6 — dependent reconciliation (task 2.2)

Branch `batch-9/010-5-2-orgs-5`, stacked on slice 5. Following Astra's 2.1 design call, dependents have no side tables: each takes its organization from the root it hangs off, so the slice 5 triggers already bridge their late writes. `OrganizationOwnershipRepository.findOwnershipConflicts` reports every dependent whose ends disagree:

- a saved plan owned apart from its project;
- a dependency whose endpoint lies in another project;
- a work item's parent in another project;
- a work item's team or service in another organization;
- a tag, team, type, service or external-ref link across organizations;
- an assignment to another organization's person, or an assignment, estimate, actual, step progress or step measure on another project's step;
- a person-team or team-service pair across organizations;
- a team capacity across organizations;
- a plan event naming another project's work item or step;
- an event stream (`event_sequencer` or `event_log`) that names no mapped project.

A deleted project's retained stream is reported rather than guessed. Its retention or purge is an open 7.1 decision. No allowance table exists. Command-journal payloads and captured schedule bodies are not parsed; 7.1 owns them.

| Check                           | Injected fault                                     | Observed failure (`organization-reconciliation.db.test.ts`, 2026-09-27)                    |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Each of the 21 conflict queries | that query alone replaced by one selecting nothing | its own `reports a <kind> conflict` case                                                   |
| Late writes bridged             | `saved_plan_organization_bridge` set to `WHEN 0`   | `keeps late legacy-era writes of every family mapped and conflict-free through the bridge` |

Command: `env -u CLAUDECODE bun test src/organization-reconciliation.db.test.ts`: 23 pass.

## Slice 7 — project boundary (task 3.1)

Branch `batch-9/010-5-2-orgs-6`, stacked on slice 6. Design call: Astra, saved in the lane records as `010-5-2-orgs-task-3.1-design.md`.

- Every project route (`list`, `read`, `opened`, `create`, `PATCH`, `export`, and the optimization `retry`) resolves `OrganizationAccess` before any lookup.
- `SqliteOrganizationAccess` re-reads the activation marker on every request:
  - an explicit `pre_activation` answers `legacy`, which is the old deployment-wide behaviour;
  - a broken marker throws, and the request answers 500;
  - after activation, the session's bound organization must still list the user. No binding answers typed 403 `no_active_organization`, and no current membership answers 403 `not_a_member`.
- Scoped reads, and the ownership predicate inside each scoped write (`updateInOrganization`, `recordOpenInOrganization`), go through `project_organization`. A foreign project and an absent one both answer the same 404. Scoped creation writes the ownership row in the project's own transaction.
- Viewers may read and open but not write. A restricted project stays creator-only.
- Inert: production wires `NO_BOUND_ORGANIZATION` until task 2.4. After activation every project route would answer 403, so activation (7.1) must wait for 2.4.
- Not in this slice:
  - The super-admin recovery override: it must be audited, so 3.7 owns it. Until then it fails closed.
  - `readBySolutionSlug`, and the saved-plan routes' project reads: 3.5 and 3.6.
  - Export's tree and references beyond the project itself: 3.5.
  - Solution links: slugs are still unique across the deployment, so a collision would reveal another organization's project. After activation, setting `solutionRef` is refused with 403 `forbidden` until 3.5 scopes solution references. Clearing a link stays allowed.
- A stored membership role outside the four known roles throws, and the request answers 500.
- No project delete endpoint exists.

| Check                                  | Injected fault                                                 | Observed failure (2026-09-27)                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Viewer write policy                    | `canWriteInOrganization` answers `true`                        | `refuses a viewer every project write and lets the viewer read and open`                                                                         |
| Restricted creator rule                | `canEditProjectInOrganization` drops `canEditProject`          | `lets only the creator edit a restricted project, super-admin included`: the super-admin PATCH answered the renamed project                      |
| Scoped create refusal                  | viewer check in `createWithin` disabled                        | the viewer case                                                                                                                                  |
| Scoped edit policy                     | `authorizeEdit` uses legacy `canEditProject` for scoped access | the viewer case                                                                                                                                  |
| Scoped find                            | `findInOrganization` predicate made tautological               | `answers 404 alike for a foreign and an absent project, and changes nothing`: the foreign read answered 200                                      |
| Scoped list                            | `listForInOrganization` predicate removed                      | `lists only the active organization's projects`: `B plan` listed                                                                                 |
| Scoped create mapping                  | `project_organization` insert skipped                          | `creates a project only its own organization can see`: the creator's read answered 404                                                           |
| Marker read per request                | `resolve` answers `legacy` without the marker                  | `scopes the same running app once another connection activates isolation`                                                                        |
| Current membership                     | membership lookup bypassed                                     | `refuses a removed member on the next request`: 200                                                                                              |
| Export reads through access            | export reads with unscoped `projects.read`                     | the 404 case: the foreign Markdown answered 200                                                                                                  |
| Production wiring                      | `boot.ts` wires legacy access                                  | `boot.db.test.ts` `refuses the project list after activation until a session binds an organization`: 200                                         |
| No bound organization                  | `resolve` answers `legacy` for an unbound session              | `refuses a session bound to no organization before any lookup`: the list answered 200                                                            |
| Stored role validated                  | `validateStoredRole` returns the value unchecked               | `fails as a server error on a malformed membership role`: 200 instead of 500                                                                     |
| Solution link refused after activation | scoped `solutionRef` refusal disabled                          | `refuses a solution link that could reveal another organization's project`: 500 for the foreign slug, where 403 was expected                     |
| Scoped update in the write             | `updateInOrganization` ownership predicate dropped             | `project.db.test.ts` `records an open and a write only while the organization owns the project`: the foreign rename was answered instead of null |
| Scoped open in the write               | `recordOpenInOrganization` ownership check dropped             | same case: `true` for the foreign open                                                                                                           |

Commands, all under `env -u CLAUDECODE`:

- `bun test` in `apps/wbs/be-01`: 1157 pass, 0 fail (1158 tests across 98 files).
- wbs-core: 629 pass.
- store-sqlite: 929 pass. `audit.test.ts` exempts `projectOrganization`, which carries no audit columns.
- store-memory: 113 pass.
- domain: 692 pass.
- contracts: 397 pass.
- mcp-01: 212 pass.
- fe-01 vitest, 6 refusal and project files: 129 pass.

## Slice 8 — directory lists (task 3.2)

Branch `batch-9/010-5-2-orgs-7`, stacked on slice 7. Design call: Astra, saved in the lane records as `010-5-2-orgs-task-3.2-design.md`.

- The six directory list routes resolve `OrganizationAccess` before any read, using `DirectoryService.listWithin`.
- Under scoped access, `DirectoryStore.listInOrganization` reads only the organization's side-table rows, under their organization-local display names, ordered by them. Two organizations can each show `urgent` over distinct opaque root names.
- A person's `teamIds` and a team's `serviceIds` must be the organization's own. A crossing link is corrupt trusted state: the read throws and answers 500 rather than reveal a foreign id.
- No directory read takes an id. Directory commands, including activated create and rename and foreign-id 404, are 3.4.
- The mounted organization suites now share `apps/wbs/be-01/src/testing/organization-harness.ts`.

| Check                               | Injected fault                                                                                          | Observed failure (`directory-organization.controller.db.test.ts`, 2026-09-27)           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Six side-table ownership predicates | each `organization_id` predicate removed alone (people, teams, services, tags, types, external systems) | `lists only the organization's own entries under their local names`, once per predicate |
| Side-table names                    | scoped `tags` read from the root table                                                                  | same case: both roots' token names listed                                               |
| Scoped service path                 | `listWithin` answers the legacy list under scoped access                                                | same case: both organizations' people listed                                            |
| Team-service owner                  | owner comparison skipped                                                                                | `refuses a team-service link that crosses organizations`: 200 instead of 500            |
| Team-service owner present          | the service-owner left join made inner                                                                  | `refuses a team-service link whose service has no owner`: 200                           |
| Membership owner                    | owner comparison skipped                                                                                | `refuses a membership that crosses organizations`: 200 instead of 500                   |
| Membership owner present            | the team-owner left join made inner                                                                     | `refuses a membership whose team has no owner`: 200                                     |
| Access resolved before the read     | resolution bypassed in each of the six routes alone                                                     | `refuses an unbound session and a removed member on every list`, once per route         |

Not a safety check: removing an ORDER BY does not fail `orders each list by the local name, not the root name, id or insertion`. SQLite already answers from the `(organization_id, name)` unique index in name order. The ORDER BY stays so the order does not depend on the query plan.

Commands, all under `env -u CLAUDECODE`:

- be-01 `bun test src`: 1163 pass and 1 fail before the tier check learned about `OrganizationHarness.open`. After that, the three organization and boot files pass 48 of 48, and `test-tiers.test.ts` passes.
- wbs-core `bun test src`: 629. store-sqlite: 929. store-memory: 113. contracts: 397. conformance: 35. mcp-01: 212.
- fe-01 vitest, 6 files: 149.
- tsc passes for core, be-01, store-sqlite, store-memory, contracts, conformance, fe-01 and mcp-01.

## Slice 9 — steps, calendar markers and the ownership freeze (task 3.3, part 1)

Branch `batch-9/010-5-2-orgs-8`, stacked on slice 8. Design call: Astra, saved in the lane records as `010-5-2-orgs-task-3.3-design.md`.

**Ownership freeze.** Migration `20260927200000_freeze_organization_ownership` adds 30 triggers over the eight side tables. The database refuses:

- an UPDATE of `resource_id` or `organization_id`;
- a DELETE while the root lives (the root's own cascade passes);
- an INSERT for an already-mapped root, which also stops `INSERT OR REPLACE`;
- on the six catalog tables, an INSERT or name UPDATE onto a display name another root of the organization holds, which stops `INSERT OR REPLACE` and `UPDATE OR REPLACE` from deleting that root's mapping through the `(organization_id, name)` index.

The migration is additive and its `down.sql` drops all 30 triggers. Reconciliation fixtures and the ownership migration's primary-key cases run below the freeze, because they build states the freeze refuses. What this proves is narrow: each tested statement shape is refused. It does not prove that no other statement can move ownership, for example a direct write with triggers dropped.

**Routes.**

- The three step routes and the four calendar-marker routes resolve `OrganizationAccess` first. `StepService` and `CalendarMarkerService` gain `…Within` methods, which use the shared `findProjectWithin` and `mayEditProjectWithin`.
- A foreign project is a 404 identical to an absent one. A foreign step or marker under the caller's own project path is a 404.
- `StepStore.rename` now takes the project and puts it in the UPDATE's own predicate, so a check made before the write cannot be outrun. `remove` already did.
- A viewer may list markers but not write.

**Accepted residual.** A client-minted marker id that collides with another organization's marker answers 409 `taken`. The foreign marker stays unchanged, which is tested. The answer reveals only that a v4 UUID the caller already holds exists. Scoping marker ids by project would need a non-additive key change. The mounted tests do not observe broadcasts.

| Check                                                   | Injected fault                                                               | Observed failure (2026-09-27)                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each of the 30 freeze triggers                          | that trigger's `WHEN` made `0` alone                                         | `organization-ownership-freeze.db.test.ts`: that table's `refuses moving the root to another organization` (update), `refuses unmapping a live root, and a second or replacing mapping` (insert, delete) or `refuses replacing another root's display name` (catalog insert, name) |
| Catalog name clause                                     | the `OR EXISTS … name` clause removed from each catalog insert trigger alone | `refuses replacing another root's display name`                                                                                                                                                                                                                                    |
| Step rename in its write                                | the UPDATE addressed by step id alone                                        | `step.db.test.ts` `renames nothing of another project, whatever it is called by`                                                                                                                                                                                                   |
| Step gate scoped                                        | `gate` finds the project unscoped                                            | `step-marker-organization.controller.db.test.ts` `answers 404 alike for a foreign and an absent project on every step and marker route`                                                                                                                                            |
| Step add scoped                                         | `addWithin` finds the project unscoped                                       | same case                                                                                                                                                                                                                                                                          |
| Marker gate scoped                                      | marker `gate` finds the project unscoped                                     | same case                                                                                                                                                                                                                                                                          |
| Marker list scoped                                      | `listWithin` finds the project unscoped                                      | same case                                                                                                                                                                                                                                                                          |
| Role rule                                               | `mayEditProjectWithin` answers the legacy rule under scoped access           | `refuses a viewer every step and marker write and lets the viewer list markers`                                                                                                                                                                                                    |
| Access resolved first                                   | resolution bypassed in each of the seven routes alone                        | `refuses an unbound session and a removed member before any lookup`, once per route                                                                                                                                                                                                |
| Allowance edit scoped (after main's 010.4.5 allowances) | `findWithin` admission skipped before the `setStepAllowance` command         | `refuses an allowance edit of a foreign step or project, changing nothing`: B's allowance changed from 0 to 25                                                                                                                                                                     |

## Slice 10 — the schedule read (task 3.3, part 2)

Branch `batch-9/010-5-2-orgs-9`, stacked on slice 9.

- `GET /api/projects/:id/work-items` and `GET /api/projects/:id/step-references` resolve organization access first. Both then go through `WorkItemService.treeWithin` and `readAddressesWithin`.
- The project export and optimizer retry now use `treeWithin` and `scheduleInputWithin`.
- Under scoped access, `ProjectStore.findCrossReferences` runs one UNION over every relation the read follows. Owners compare with `IS NOT`, so an unowned catalog entry counts as crossing. Any hit throws, and the request answers 500 rather than scheduling on it.
- Legacy access is unchanged. Before activation a project with crossing rows still reads (tested), because inertness wins; activation reconciliation (2.2, 7.1) refuses such data first.
- Under scoped access, assignees carry their organization-local names.
- Still pending for 3.5: JSON export follows assignee→team→service links through global directory reads, so it needs a scoped closure check with JSON-export negatives before activation.

| Check                               | Injected fault                                                                  | Observed failure (`schedule-organization.controller.db.test.ts`, 2026-09-27)                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each of the 16 cross-reference arms | that arm removed from the UNION alone                                           | its own `fails the schedule read closed over a crossing <kind>` case, for 15 of them. For `work_item_parent` the tree read already throws, so the arm is proven in `project.db.test.ts` `reports a work item whose parent lies in another project`. |
| Check only under scoped access      | the cross-reference check also run under legacy access                          | `reads any project deployment-wide, crossing rows and all`                                                                                                                                                                                          |
| Organization-local assignee names   | `treeWithin` returns the tree's legacy names                                    | `shows assignees under the organization's own names`: `root-pe-a`                                                                                                                                                                                   |
| Cross-reference check               | `admits` skips it under scoped access                                           | `… crossing estimate_step`: 200 instead of 500                                                                                                                                                                                                      |
| Scoped project find                 | `admits` finds the project unscoped                                             | `answers 404 alike for a foreign and an absent project`                                                                                                                                                                                             |
| Access resolved first               | the work-items route, and separately the step-references route, skip resolution | `refuses an unbound session and a removed member before any lookup`                                                                                                                                                                                 |
| Export tree scoped                  | export reads `tree` unscoped                                                    | `fails the export and the optimizer retry closed over a crossing row`: 200                                                                                                                                                                          |
| Retry input scoped                  | retry reads `scheduleInput` unscoped                                            | same case: 409 instead of 500                                                                                                                                                                                                                       |

## Slice 11 — command batches, undo and redo (task 3.4, part 1)

Branch `batch-9/010-5-2-orgs-10`, stacked on slice 10. Design call: Astra, 2026-09-27.

- `POST /api/projects/:id/commands`, `POST /api/directory/commands`, undo and redo resolve organization access first. They then run through `PlanCommandRunner.runWithin`, `runDirectoryWithin`, `undoWithin` and `redoWithin`.
- Under scoped access, each act's unit of work does the following:
  - Refuses a project the organization does not own with the same plain 404 as an absent one.
  - Refuses a viewer, or a non-creator of a restricted project, with a plain 403.
  - Fails closed with 500 when the project already crosses its organization.
- A batch holds every command to the organization in three ways:
  - **Directory commands** are refused as `forbidden` at their index until part 2.
  - **References outside the final state** are checked before the command runs: a predecessor, parent, sibling or step must be the project's own. These are references that a later closure check would not see.
  - **After each command,** `findCrossReferences` must stay empty. Otherwise the batch is refused at that index with the matching 404 code and rolled back.
- Undo and redo check the whole replay before writing anything. `referencesOf` collects, through nested batches, every row, claimed project, step and directory entry. A replay naming anything outside the project or organization answers `not_found` and discards nothing. A closure check after the replay stays as a backstop.
- `findCrossReferences` also reports references **into** the project: a per-step row of another project on its step, a child row in another project, and a dependency filed under another project. Admission fails closed on them, so a write here cannot change a foreign row.
- A capacity's team must be the organization's, clears included. A foreign team answers the same `not_found` as an absent one.
- Astra review 1: 2 Critical and 3 Important findings (replay write set, incoming dependency, capacity clear, nested replay, stale discard), all fixed above.
- Astra review 2: no Critical findings and 2 Important ones, both fixed. First, a patch's directory ids are checked against the organization before it runs, so a foreign id answers exactly as an absent one. Second, the replay collector now includes restored `typeIds`.
- `ProjectCrossReference.kind` is now the closed `PROJECT_CROSS_REFERENCE_KINDS`. `crossingRefusal` maps it exhaustively.
- Legacy access is unchanged (tested). The mounted suite runs over be-01's production composition (`OrganizationHarness.openComposed`), so rollback is real SQLite.

| Check                                                                               | Injected fault                                    | Observed failure (`command-organization.controller.db.test.ts`, 2026-09-27)                                                                                                                   |
| ----------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch admission in the unit of work                                                 | refusal ignored                                   | `answers 404 alike for a foreign and an absent project`: 200 instead of 404                                                                                                                   |
| Role rule                                                                           | `mayEditProjectWithin` check removed              | `refuses a viewer every batch, undo and redo`: 200 instead of 403                                                                                                                             |
| Pre-existing crossing                                                               | initial check disabled                            | `fails closed on a project that already crosses its organization`: 404 instead of 500                                                                                                         |
| Directory commands refused                                                          | refusal removed                                   | `refuses every directory command until organization-local writes land`: 200 with the created tag                                                                                              |
| Foreign row references                                                              | row check disabled                                | `refuses a foreign predecessor, parent, sibling and step …`: 200 instead of 404 for `removeDependency`                                                                                        |
| Foreign step references                                                             | step check disabled alone                         | same case: 200 instead of 404 `unknown_step` for `clearEstimate`                                                                                                                              |
| Per-command closure                                                                 | crossing refusal removed                          | `refuses a foreign service, team, tag, type, person and predecessor, all or none`: 200 instead of 404 `unknown_service`                                                                       |
| Undo admission                                                                      | walk admission ignored                            | `refuses undo and redo of a foreign project as of an absent one`: 409 `nothing_to_undo` instead of 404                                                                                        |
| Undo closure                                                                        | walk closure ignored                              | `rolls back an undo that would restore a foreign label`: 200 instead of 404                                                                                                                   |
| Replay references (`referencesOf`, nested)                                          | `namesOutside` disabled                           | `refuses an undo whose entry names another project's row`, the nested foreign label and the restored foreign row: 200 instead of 404. A foreign step: 409 `stale_undo`, discarding the entry. |
| Undo closure backstop                                                               | walk closure and `namesOutside` disabled together | `rolls back an undo that would restore a foreign label`: 200 instead of 404                                                                                                                   |
| Capacity team, clears included                                                      | team check removed                                | `refuses clearing a foreign team's capacity as it refuses an absent team's`: 200 instead of 404                                                                                               |
| Directory ids named by a command, before it runs                                    | pre-check removed                                 | `refuses a foreign directory id exactly as an absent one, before anything is written`: `unknown_tag` for the foreign team beside an absent tag, versus `unknown_team` for an absent team      |
| Restored type links in replays                                                      | `typeIds` not collected                           | `… a restored row carrying a foreign type, cleared again in the same replay`: 200 instead of 404                                                                                              |
| Incoming references (`incoming_step_row`, `incoming_parent`, `incoming_dependency`) | each arm disabled alone                           | `fails closed on a project another project reaches into, changing neither`: 200 instead of 500                                                                                                |
| Access resolved first                                                               | project batch route skips resolution              | `refuses an unbound session and a removed member before any batch`: 200 instead of 403                                                                                                        |

## Slice 12 — organization-local directory writes (task 3.4, part 2)

Branch `batch-9/010-5-2-orgs-11`, stacked on slice 11.

- Under scoped access, every directory command (both endpoints) goes through `DirectoryService.addWithin`, `renameWithin`, `patchTeamWithin`, `addPersonWithin`, `patchPersonWithin` and `removeWithin`.
- **Creates** are idempotent by the organization-local name. Otherwise the root is inserted under an opaque name, its own id, retried on a collision up to three ids. It is then mapped with `mapInOrganization`.
- **Renames** move only the side name, through `renameInOrganization`, which also answers `not_found` for a foreign entry and `taken` for a local clash.
- **Links and targets.** A person's teams and a team's services must be the organization's. A foreign target answers exactly what an absent one does.
- **Removal usage** shows local names. A foreign project naming the entry fails closed before anything is shown or removed.
- Legacy access is unchanged. The in-memory directory rejects organization-local writes, which exist only over SQLite.
- Astra review 1: 3 Important findings, all fixed. First, a cascade or a non-rename patch could change links that a foreign person, team or project holds; every scoped write of an existing entry now calls `foreignReferencesTo` first. Second, an opaque-name collision could add memberships to the colliding person; the root is now created alone.
- Astra review 2: "One Important issue remains; no Critical issues found": the assignment arm ignored the step's organization. Fixed.

| Check                                                                           | Injected fault                        | Observed failure (`directory-command-organization.controller.db.test.ts` unless named, 2026-09-27)                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scoped create                                                                   | legacy add under scoped access        | `creates the same names in two organizations, each finding only its own`: 404 `unknown_team`, because the new team was left unmapped                                                                                                                                                                              |
| Opaque name collision                                                           | answered row accepted whatever its id | `directory.resource.test.ts` `retries an opaque root name another root holds, then gives up`: `id-1` instead of `id-2`                                                                                                                                                                                            |
| Rename scoped to the organization                                               | side row found by resource id alone   | `answers a foreign entry exactly as an absent one, changing nothing`: 200, renaming B's tag                                                                                                                                                                                                                       |
| Local name clash                                                                | name check removed                    | `renames only the organization-local name, refusing one another entry holds`: 500 from the freeze trigger instead of 409                                                                                                                                                                                          |
| Rename of an entry a foreign project names                                      | check disabled                        | `fails closed on a directory entry a foreign project names`: 200 instead of 500                                                                                                                                                                                                                                   |
| Team target                                                                     | ownership check disabled              | `answers a foreign entry …`: 500 instead of 404                                                                                                                                                                                                                                                                   |
| Person target                                                                   | ownership check disabled              | same case: 500 instead of 404                                                                                                                                                                                                                                                                                     |
| Removal target                                                                  | ownership check disabled              | same case: 200, deleting B's tag                                                                                                                                                                                                                                                                                  |
| Team's services                                                                 | check disabled                        | `refuses a foreign service or team link exactly as an absent one`: 500 instead of 404 `unknown_service`                                                                                                                                                                                                           |
| New person's teams                                                              | check disabled                        | same case: 200, creating a person in B's team                                                                                                                                                                                                                                                                     |
| Person's teams                                                                  | check disabled                        | same case: 500 instead of 404 `unknown_team`                                                                                                                                                                                                                                                                      |
| Usage projects                                                                  | check disabled                        | `fails closed on a directory entry a foreign project names`: 409 with B's project instead of 500                                                                                                                                                                                                                  |
| Removed projects                                                                | check disabled                        | same case: 200 to the cascade instead of 500                                                                                                                                                                                                                                                                      |
| Usage names                                                                     | rows returned unmapped                | `shows removal usage under organization-local names only`: `root-pe-a` shown                                                                                                                                                                                                                                      |
| Incoming reach (`foreignReferencesTo`), before every write of an existing entry | check disabled                        | `fails closed on an entry another organization reaches, whatever the write`: 200 instead of 500, for example a cascade dropping B's person's membership                                                                                                                                                           |
| Incoming reach, per arm                                                         | each arm disabled                     | same case: the assignment, capacity, foreign member, foreign owning team and both scalar label arms fail alone. The four label arms fail together with the rename's foreign-project check. The person-in-foreign-team and team-owning-foreign-service arms are shadowed by `listInOrganization`'s own link check. |
| Opaque person created without teams first                                       | teams added in the colliding call     | `directory.resource.test.ts` `retries a colliding opaque person name without touching the person it collided with`: the colliding person joined `t`                                                                                                                                                               |
| Assignment arm checks the step's project too                                    | step clause dropped                   | `fails closed on an entry another organization reaches …`: 200, deleting A's assignment on B's step                                                                                                                                                                                                               |

## Slice 13 — import, JSON export and solution lookup (task 3.5, part 1)

Branch `batch-9/010-5-2-orgs-12`, stacked on slice 12.

- `PlanDocumentService.export` takes the caller's access. Under scoped access it reads `listInOrganization`, so every name is local and a crossing person-team or team-service link throws.
- `ImportService.import` takes the caller's access. Under scoped access:
  - a viewer answers 403 `forbidden`;
  - names resolve and create through `DirectoryService.listWithin` and the `*Within` writes (external systems included);
  - the project is created with `createInOrganization`;
  - a solution reference is `left-off`;
  - the `directory_changed` fan-out reaches only the organization's projects.
- `GET /plans/by-solution/:slug` resolves access and answers a foreign slug with the absent slug's 404.
- The import and solution contracts gain the organization refusals, and import gains `forbidden`.
- Astra review 1: 2 Important findings, both fixed. First, a foreign slug whose row is unreadable answered 500; the slug is now filtered by organization before any decoding, through `findBySolutionSlugInOrganization`. Second, the fan-out filter lacked a proof.

| Check                                         | Injected fault                                     | Observed failure (`import-export-organization.controller.db.test.ts`, 2026-09-27)                                         |
| --------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Scoped export directory                       | legacy lists under scoped access                   | `exports only the organization's own directory, under its local names`: `root-pe-a`, `root-tm-a` and `root-sv-a` exported |
| Viewer import                                 | refusal skipped                                    | `refuses a viewer's import`: 201                                                                                          |
| Scoped name resolution                        | tags read through legacy access                    | `imports into the organization, resolving names among its own entries`: a second `Release` tag created                    |
| Scoped project creation                       | project created unmapped                           | same case: the project missing from A's list                                                                              |
| Solution reference left off                   | slug kept under scoped access                      | `leaves a solution reference off, revealing nothing`: `kept`                                                              |
| Access resolved first                         | import route skips resolution                      | `refuses an unbound session and a removed member before any import`: 500 instead of 403                                   |
| Scoped solution lookup                        | ownership check skipped                            | `answers a foreign solution slug as an absent one`: 200 with B's project                                                  |
| Slug filtered by organization before decoding | slug found deployment-wide, then ownership checked | `answers a foreign solution slug as an absent one, even when its row is unreadable`: 500 instead of 404                   |
| `directory_changed` fan-out scoped            | every project told                                 | `tells only the organization's projects that its directory changed`: B's project told                                     |

## Slice 14 — saved plans and history (task 3.6)

Branch `batch-9/010-5-2-orgs-13`, stacked on slice 13.

- Save, list, compare and history read the project through `readWithin`: a foreign project answers exactly as an absent one.
- Read, rename and delete check the saved plan's project through `SavedPlanService.projectOf` and `readWithin`. Rename and delete also need a writing role under scoped access.
- `savePlan` takes the caller's access and applies `mayEditProjectWithin`.
- The SQLite save maps the new plan to its project's organization inside its own transaction. `NOT EXISTS` defers to the pre-activation bridge trigger.
- After activation, the save refuses a project without an owner and a plan already mapped elsewhere, and rolls back. Astra review 1 raised this as an Important finding.

| Check                              | Injected fault                  | Observed failure (`saved-plan-organization.controller.db.test.ts`, 2026-09-27)                           |
| ---------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Save scoped                        | project read with legacy access | `answers 404 alike for a foreign and an absent project on every saved-plan and history route`: 201       |
| List scoped                        | same, in the list route         | same case: 200                                                                                           |
| Compare scoped                     | same, in the compare route      | same case: 200                                                                                           |
| History scoped                     | same, in the history route      | same case: 200                                                                                           |
| Plan's project checked             | `reachesPlan` answers true      | `answers a foreign saved plan exactly as an absent one`: 200                                             |
| Writing role for rename and delete | role check skipped              | `refuses a viewer every saved-plan write and lets the viewer read`: 200 for the demoted creator's rename |
| Access resolved first              | save route skips resolution     | `refuses an unbound session and a removed member before any lookup`: 201                                 |
| Saved plan mapped                  | mapping insert selects nothing  | `maps a plan saved after activation to its project's organization`: no mapping                           |

## Slice 15 — membership administration (task 3.7, part 1)

Branch `batch-9/010-5-2-orgs-14`, stacked on slice 14.

| Check                                  | Injected fault                                          | Observed failure (`membership-organization.controller.db.test.ts` unless named, 2026-09-27)                       |
| -------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Admin limited to viewer and member     | `mayAdministerMembership` lets an admin change any role | `refuses an admin promoting a member to admin, or changing or removing an admin`: 200 with the promoted admin     |
| Members and viewers administer nothing | actor role only checked for viewers                     | `refuses a member and a viewer every membership change`: 200                                                      |
| Final super-admin                      | guard result ignored                                    | `refuses demoting or removing the last super-admin`: 200                                                          |
| Absent or foreign target               | an absent target answered as removed                    | `answers a foreign or absent member as not found, changing nothing`: 500 instead of 404                           |
| Access resolved first                  | resolution failure ignored                              | `refuses an unbound session and a removed member`: `forbidden` instead of `no_active_organization`                |
| No administration before activation    | legacy access administered                              | `has no organization to administer`: 200                                                                          |
| Invitation authority                   | `mayInvite` lets an admin invite any role               | `organization-access.test.ts` `lets an admin invite viewers and members, a super-admin any role, and nobody else` |

## Slice 16 — audited recovery through the project PATCH (task 3.7, part 2a)

Branch `batch-9/010-5-2-orgs-15`, stacked on slice 15. Migration `20260927220000_add_organization_audit` sorts after every migration on main and in the queue (newest queued: `20260927213000_add_typed_dependency`).

| Check                                    | Injected fault                           | Observed failure (2026-09-27)                                                                                            |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Audit action vocabulary                  | `action` CHECK dropped                   | `organization-audit.db.test.ts` `refuses an unknown action or subject kind`                                              |
| Audit subject vocabulary                 | `subject_kind` CHECK dropped             | same case                                                                                                                |
| Audit organization reference             | `organization_id` REFERENCES dropped     | `refuses a record of no organization`                                                                                    |
| Rollback keeps evidence                  | `down.sql` CHECK made `CHECK (1)`        | `refuses to roll back over a recorded act`: the migration reversed                                                       |
| Classified in the write's transaction    | classification forced to `ordinary`      | `organization-audit.db.test.ts` `audits a recovery the project became after the request read it`: written with no record |
| Refused edits write nothing              | refusal skipped                          | `refuses an actor who is no longer a writing member`: the project written                                                |
| A removed member is refused              | missing membership answered as absent    | same case: null instead of `forbidden`                                                                                   |
| Foreign project absent before permission | absent project refused                   | `answers a project of another organization as absent, before any permission`: `forbidden`                                |
| Audit failure rolls the edit back        | audit insert errors swallowed            | `rolls the edit back when its audit record cannot be written`: no failure, rename kept                                   |
| Audit record written                     | audit insert skipped                     | `project-organization.controller.db.test.ts` `recovers a restricted project as an audited super-admin edit`: no record   |
| Recovery classified                      | `classifyProjectEdit` answers `ordinary` | `organization-access.test.ts` `calls a super-admin's edit … a recovery`                                                  |
| Recovery admitted                        | service refuses `recovery`               | the mounted recovery case: 403 instead of 200                                                                            |

Astra review 1 raised 2 Important and 4 Minor findings, all fixed:

- **Important:** classification now happens inside the write's own transaction, which closes the restriction race.
- **Important:** the audit-failure rollback is now proven.
- **Minor:** an absent or foreign project answers null.
- **Minor:** the spec scenario is updated.
- **Minor:** the detail is typed as `RecoveryAuditDetail`.
- **Minor:** the classifier is renamed `classifyProjectEdit`.

## Slice 17 — organization selection preview (task 2.4 groundwork)

Branch `batch-9/010-5-2-orgs-15` (same PR as slice 16), a read-only dry run with no production access.

| Check                          | Injected fault            | Observed failure (`organization-selection-preview.db.test.ts`, 2026-09-28)                                |
| ------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Stored roles validated         | every role accepted       | `fails on a malformed membership role`: no throw                                                          |
| No membership means onboarding | onboarding never answered | `reports zero, one and several memberships, choosing for nobody`: `selection_required` with no candidates |
| Membership references checked  | reference check skipped   | `fails on a membership of a missing user or organization`: reported                                       |
| Read-only connection           | `readonly` dropped        | `refuses every write through the read-only connection`: the DELETE ran                                    |

The file is left byte for byte as it was (`leaves the database file byte for byte as it was`), and the CLI fails without a database (`migration-cli.db.test.ts`).

Astra review 1 raised 2 Important findings, both fixed: the references are now checked, and the read-only refusal is proven. Its 2 Minor findings were handled as follows:

- The spec scenario is added.
- The CLI header is kept. It follows the invocation comment on every sibling deploy CLI (`migrate-status-cli.ts`, `migrate-down-cli.ts`, `backfill-step-codes-cli.ts`), and a runbook entry belongs with the task 1.1 dry run.

## Slice 18 — solution slugs per organization (task 3.5, part 2)

Branch `batch-9/010-5-2-orgs-16`, stacked on slice 16/17 (#157). Design call: Astra, 2026-09-28.

- The additive migration `20260928010000_add_project_solution` adds:
  - a `project_solution` table, keyed by project and unique on (organization, slug);
  - a composite reference to `project_organization`, so a link's organization is always its project's owner;
  - a `down.sql` that refuses while any link exists or the marker is not one well-formed `pre_activation` row.
- A scoped PATCH or import writes the link there and clears any legacy pair. The legacy `project.solution_slug` keeps serving links made before activation, and a project holding both fails its read.
- Collisions are judged only among the organization's own projects, and only after authorization:
  - PATCH answers `409 solution_taken`, inside one `BEGIN IMMEDIATE` transaction;
  - import answers `left-off`.
- The scoped lookup matches both representations within the organization.
- Every project read joins the link, so capture, export and the project DTO carry the local slug.

| Check                                 | Injected fault                           | Observed failure (2026-09-28)                                                                                                     |
| ------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Link organization is the owner        | composite reference dropped              | `refuses a link naming an organization other than its project's owner`: no throw                                                  |
| Rollback keeps links                  | emptiness predicate dropped              | `refuses while a link is recorded`: rolled back                                                                                   |
| Rollback refused after activation     | marker predicates dropped                | `refuses after activation even with no link`: rolled back                                                                         |
| Collision answered, nothing written   | in-transaction check skipped             | `refuses a slug another project of the organization holds, writing nothing`: SQLite uniqueness error                              |
| Legacy slugs collide within the org   | legacy arm of the check dropped          | `refuses a slug a project of the organization kept from before activation`: linked                                                |
| One representation per project        | both-present refusal dropped             | `refuses a project holding both a legacy and a scoped reference`: read succeeded                                                  |
| Legacy pair cleared on a scoped link  | legacy columns left as they were         | `moves a legacy pair into the organization link, relinks and unlinks`: read threw                                                 |
| Scoped lookup sees scoped links       | lookup on the legacy column alone        | `links a slug only another organization holds`: nothing found                                                                     |
| Scoped import judges its own org only | import looks the slug up deployment-wide | `keeps a slug only another organization holds` (`import-export-organization.controller.db.test.ts`): `left-off` instead of `kept` |

Store tests are in `project-solution.db.test.ts`. The mounted PATCH test in `project-organization.controller.db.test.ts` covers four cases: a viewer gets 403 and a foreign project gets 404, each before any collision is judged; a same-organization collision gets 409; and a slug held only in another organization links normally.

Astra review 1 raised 3 Important findings, all fixed with new negatives, each faulted and seen failing on 2026-09-28:

| Check                               | Injected fault                        | Observed failure                                                                            |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Cross-process collision is modeled  | deferred instead of `BEGIN IMMEDIATE` | `answers solution_taken to a link racing another process, writing nothing`: busy error      |
| Link has a project                  | `NOT NULL` dropped from `project_id`  | `refuses a link of no project`: inserted                                                    |
| Ambiguous lookup refused            | two matches let through               | `refuses a lookup two of the organization's projects answer`: one returned                  |
| Slug unique in the organization     | plain index                           | `refuses a slug twice in one organization and allows it in two`: inserted                   |
| Non-empty slug and url              | either length check dropped           | `refuses an empty slug or url`: inserted                                                    |
| Rollback needs a well-formed marker | only an activated row checked         | `refuses with a missing or malformed marker, keeping the table and the ledger`: rolled back |
| Marker time must be empty           | `activated_at IS NULL` dropped        | same case: rolled back                                                                      |

Astra review 2 raised 1 Important finding, fixed: an empty solution slug or url in an imported document reached `project_solution`'s length checks as a 500. The plan-document schema now requires both to be non-empty, as a PATCH already did. Removing that made `refuses an empty solution slug or url as input, importing nothing` (`import-export-organization.controller.db.test.ts`) answer 500 instead of 400.

The race holder is a second `bun` process holding `BEGIN IMMEDIATE` while it inserts the competing link. The row-count predicate of the down check is shadowed by the marker's single-row trigger.

## Slice 19 — edit-admission seam (task 3.7, part 2b, mechanical)

Branch `batch-9/010-5-2-orgs-17` (#164), stacked on slice 18. `WorkItemService`, `CapacityService` and `PriorityBandService` ask an injected `EditAdmission` at their nine former `canEditProject` sites, and every graph passes `CREATOR_ADMISSION`. There is no behaviour change and no migration.

| Check                                     | Injected fault                                          | Observed failure (2026-09-28)                                                                  |
| ----------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Each module wires the supplied admission  | the resource handed `{ admits: () => true }`            | each module's `asks the admission install… wires before a … write`: `ok: true`                 |
| `servicesOver` forwards its admission     | one installer handed `CREATOR_ADMISSION`, one at a time | `compose.test.ts` `hands its admission to every gated writing service it installs`: `ok: true` |
| A graph without an admission fails closed | `shared.admission ?? CREATOR_ADMISSION`                 | `fails closed on a write through a graph built without an admission`: resolved                 |

## Slice 20 — audited recovery through command batches, undo and redo (task 3.7, part 2b)

Branch `batch-9/010-5-2-orgs-18`, stacked on slice 19. There is no migration, because slice 16's `organization_audit` table holds the records.

| Check                                      | Injected fault                                        | Observed failure (2026-09-28)                                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recovery recorded in the unit of work      | `recordRecovery` skipped in `admitEditInOrganization` | `organization-audit.db.test.ts` `records one recovery …` and `fails when its audit record cannot be written`; the mounted recovery case found no record  |
| Scoped graph uses the unit of work's grant | `admissionOf` answers `CREATOR_ADMISSION` when scoped | mounted `recovers a restricted project through a batch, undo and redo, one record each`: 403; `never falls back to the creator rule under scoped access` |
| Refused writers stay refused               | `forbidden` from the admission ignored                | `refuses a viewer every batch, undo and redo`, `refuses a super-admin removed or demoted before the batch`, `keeps no record of a refused batch …`: 200  |
| The grant ends with its batch              | `expire` skipped in `execute`                         | `plan-command-admission.test.ts` `admits the granted actor on the granted project only while its unit of work runs`: still admitted                      |
| The grant ends with its journal walk       | `expire` skipped in `walk`                            | `grants a journal walk until it settles, and its repair nothing`: still admitted                                                                         |
| A journal repair is granted nothing        | the repair graph built with the walk's grant          | same case                                                                                                                                                |

The grant is refused for another actor or another project: dropping the project equality or the actor equality in `grantAdmission`, each alone, failed `admits the granted actor on the granted project only while its unit of work runs` (Astra review 1, Important; watched 2026-09-28). The mounted cases show three more things: a batch that fails at its second command, a refused batch and a failed undo each leave no record, and a creator's ordinary batch leaves none.

## Slice 21 — identity resolution after activation (task 2.3)

Branch `batch-9/010-5-2-orgs-19`, stacked on slice 20. There is no migration.

| Check                                        | Injected fault                            | Observed failure (2026-09-28)                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activated logins resolve through the mapping | marker branch skipped (legacy email link) | `oidc-identity.controller.db.test.ts` `refuses an unmapped identity whose verified email an account holds, issuing no session`: 302 as `legacy`; five `user-oidc.db.test.ts` cases |
| Email never selects an account               | email-holder refusal skipped              | the same mounted case: 302 with a new account; `user-oidc.db.test.ts` store case                                                                                                   |
| Legacy pair mapped at activation             | unmapped-legacy throw skipped             | `throws on a legacy pair activation never mapped`: a second account                                                                                                                |
| Mapping names a user                         | dangling-owner throw skipped              | `throws on a mapping to no user and on one its user disagrees with`                                                                                                                |
| Mapping agrees with the user's pair          | disagreement throw skipped                | same case                                                                                                                                                                          |
| Issuer and subject non-empty                 | empty check skipped                       | `throws on an empty issuer or subject`: an account created                                                                                                                         |
| Backfill refuses half or empty pairs         | check skipped                             | `external-identity.db.test.ts` `refuses a half or empty legacy pair, mapping nothing`                                                                                              |
| Backfill refuses a pair owned by another     | owner check skipped                       | `refuses a pair already mapped to another user, mapping nothing`                                                                                                                   |

Astra review 1 raised 3 Important findings, all fixed. Each fault below was watched failing on 2026-09-28:

| Check                                  | Injected fault                      | Observed failure                                                     |
| -------------------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| One mapping per pair                   | duplicate check skipped             | `throws on a duplicate or malformed mapping`                         |
| Mapping user id is text                | type check skipped                  | same case                                                            |
| Pair is not another user's legacy pair | legacy-owner check skipped          | `throws when the pair maps to one user and is another's legacy pair` |
| A user's own pair is whole or absent   | only the issuer compared with null  | `throws on a user whose own pair is half present`                    |
| Backfill reads text pairs only         | values stringified before the check | `refuses a half, empty or non-text legacy pair, mapping nothing`     |

Three more cases have no dedicated guard, because SQLite already refuses them:

- a missing mapping table throws;
- a failed mapping insert keeps no account (`keeps no account when its mapping cannot be written`);
- two concurrent first logins of one pair create one account and one mapping.

A broken marker throws before any resolution (`throws on a broken marker instead of resolving as before activation`). The marker is read on every call (`reads the marker on every call, so activation needs no restart`).

## Slice 22 — delegation verifier (task 2.5, first slice)

Branch `batch-9/010-5-2-orgs-20`, stacked on slice 21. There is no migration and no configuration change. Production wires `REFUSE_DELEGATIONS`.

All faults were watched failing in `delegation.controller.db.test.ts` on 2026-09-28:

| Check                                        | Injected fault                                              | Observed failure                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Audience fixed by the route policy           | `audience` dropped from `jwtVerify`                         | `refuses a gateway or unknown audience`                                                                         |
| A refused delegation stays refused           | JOSE refusal answered `not_delegation`                      | the audience case and `refuses an expired, re-signed or forged-organization delegation`                         |
| No fallback to the session                   | identity resolver falls through on `refused`                | five cases, the session-key-signed delegation among them                                                        |
| Upstream identity binds the user             | any mapped upstream identity accepted                       | `refuses a delegation whose upstream identity maps to someone else`                                             |
| Lifetime capped at five minutes              | cap skipped                                                 | `refuses a delegation longer than five minutes`                                                                 |
| No key, no delegation                        | `REFUSE_DELEGATIONS` answers `not_delegation`               | `refuses every delegation when no delegation key is configured`: 200                                            |
| Delegation's organization is the one checked | session binding used instead                                | `lists only the delegated organization’s projects`; `refuses a delegation to an organization the user has left` |
| No header selects authority                  | `x-wbs-organization` replaces the delegation's organization | `lets no header select the organization`: B's project read                                                      |

Astra review 1 raised 4 Important and 2 Minor findings, all fixed. Each fault below was watched failing on 2026-09-28:

| Check                                 | Injected fault                              | Observed failure                                                              |
| ------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| No legacy access through a delegation | pre-activation delegation answered `legacy` | `refuses a verified delegation before activation`                             |
| Not issued in the future              | `iat` check skipped                         | `refuses a delegation issued in the future, of no lifetime, or with no grant` |
| Grant or family bound                 | `grant` claim check skipped                 | same case                                                                     |
| No delegation in the session cookie   | cookie-carrier refusal skipped              | `refuses a delegation carried in the session cookie, or beside one`           |
| No delegation beside a session cookie | ambiguity refusal skipped                   | same case                                                                     |

A lifetime of zero or less is refused by JOSE's `exp` check combined with the `iat` check, so it has no guard of its own. The `jti` must be non-empty text. The Minor findings are also fixed: `lets no header select the organization` now covers an unbound session with forged headers (403), and the verifier's JSDoc now sits on `delegationVerifier`.

## Slice 23 — public domains are never claimable (task 5.1, first part)

Branch `batch-9/010-5-2-orgs-21`, stacked on slice 22. There is no migration.

| Check                              | Injected fault                      | Observed failure (2026-09-28)                                                          |
| ---------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| Public mailbox providers refused   | provider check dropped              | `public-email-domain.test.ts` `never lets a public mailbox provider be claimed`        |
| Public suffixes refused            | suffix check dropped                | `never lets a public suffix or a top-level domain be claimed`                          |
| Top-level domains refused          | single-label check dropped          | same case                                                                              |
| Canonical input required           | canonical check skipped             | `throws on a domain that is not canonical`                                             |
| No claim opened on a public domain | `openClaim` policy check skipped    | `organization-records.db.test.ts` `never opens or promotes a claim on a public domain` |
| No planted public claim promoted   | `promoteClaim` policy check skipped | same case                                                                              |

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
