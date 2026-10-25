Every refusal and every omission a slice adds or changes ships with a production-path
negative: the slice watches its test fail with the check removed or its dependency broken,
then adds an adjacent `Proof:` comment naming the injected fault and the observed test
(R5). Each negative below names that fault; verify.md (8.2) records them.

## 0. Dany reads P1 to P18

- [ ] 0.1 Dany confirms or amends design.md P1 to P18, in particular P17 (a machine
      credential is a grant subject and holds only its own grants; overrides P2 and answers
      E7's machine-principal grantee), P18 (renaming access roles at runtime is a non-goal;
      E7's "rename the roles" is the scope-prefixed vocabulary already adopted), P5 as revised
      (organization-scope grants do not write a restricted work package; `org-admin` and
      `org-super-admin` still read it), P7 (what narrows at the swap), P10 as revised (one
      shape for lists), P11 (who grants what), P12 (the cap is evaluated, not stored) and
      P15 (`revoke-backfill`). Slice 1 waits for P1, P8, P9, P12, P13, P17 and P7, because
      its backfill mapping is P7's decision on what E8 keeps; slice 2 also for P16; slice 3
      for P3, P4, P5 and P10; slice 4 for P11 and P17; slice 6 for P5, P7, P15 and P17.
      Slices 3 to 7 run after #698 slice 1; 3.2 (its listing statement joins
      `work_package.project_id`) and 3.4 (slice 3's project rules) after #698 slice 2. The
      full order is #698 design.md's "Dependency graph" (#698 E41): 4.1 lands before 3.3
      (creation grants are audited as `access_granted`), and 3.3 and 4.1 land before #698
      slice 2.

## 1. Catalogue, grant tables and backfill

- [ ] 1.1 Migration `add_access_grants`: `access_role` (with `name`, nullable `level`, the built-in/custom CHECK) seeded with the nine roles, `access_role_permission` seeded with their sets from permission-matrix.md and the reserved-name trigger (`wbs-custom-permissions` 1.1),
      `access_group`, `access_group_member`, `access_grant` with the CHECKs, unique and
      composite foreign keys, the `organization_members` trigger, the two indexes, the
      backfill of memberships and work package owners (no project-scope row) and the
      machine credentials' copies capped at contributor (P17), and a
      `down.sql` refusing while a non-backfill grant, a group, a custom role or a custom
      role's permission row exists, then dropping the five tables in dependency order —
      test: `access-grant-migration.db.test.ts` forward (counts per role equal memberships
      and owned work packages, seed ids equal the matrix's), back on a backfill-only store,
      refusal over one route-origin grant and over one ungranted custom role; negatives:
      drop the refusal and the rollback silently deletes a route grant; drop the custom-role
      guard and the ungranted role is deleted;
      drop the owner predicate and a non-member owner receives a grant; drop the cap in
      the credential copy and an `org-admin`'s credential receives `org-admin`; watched.
- [ ] 1.2 Red: `access-role.test.ts` in `@wbs/domain` for the pure catalogue,
      the `ScopeChain` value type shared with #698 (design.md P13) and
      `may(effective, permission)`: the matrix of permission-matrix.md as a
      property (every cell is a seeded set row), `may` as set membership, the kind rule
      (a project role never satisfies an organization permission) and `CONTRIBUTOR_CAP`
      as a set, the P5 transformation (`wbs-custom-permissions` 1.2, CP16, CP18) — test:
      one case per permission plus the table, ids compared with `PERMISSIONS`; negatives:
      widen the cap with `project.manage_budgets` and the machine case manages budgets; add
      `package.claim_for_others` to `package-contributor`'s seed and the machine case
      passes; watched.
- [ ] 1.3 Green: port `AccessDecisions` (`effectiveRoleAt`, `readablePackageIds`) in
      `@wbs/core`, SQLite implementation with the two statements of design.md, exposed on
      the admitted turn's stores and the read stores; provenance returned; work package
      targets without a project until #698 slice 2 (design.md, "The `may` port") — test:
      `access-decisions.db.test.ts`: direct, group, members subject, grants adding up,
      the kind rule on stored rows, the restricted rule (built-in org-admin and
      org-super-admin read only, org-viewer, custom organization roles, organization-scope
      project and package roles and the members subject skipped), visibility needing the
      read permission, membership gone, the cap set and no cap, injected corrupt rows
      throwing `UnknownPermissionRow`, `PermissionKindRow` and `EmptyRoleSet` on both
      statements (`wbs-custom-permissions` 1.3), a machine principal holding only its
      credential's grants (P17), one statement per call (statement counter, query plan);
      negatives: remove the membership `EXISTS` and a removed member keeps access; add
      `project.manage_settings` to `package-manager`'s seed and the case "a package role at
      organization scope satisfies a project permission" passes unless
      `PermissionKindRow` throws; remove the P5 skip and an `org-viewer` reads a restricted
      work package; return a built-in admin's set unchanged instead of intersecting it with
      the read-only set and an `org-admin` writes one; widen the cap set and the machine
      case is manager; catch-and-skip the unknown row and the throw test fails; drop the
      `:machine = 0` guards and an `org-admin`'s agent writes a package no grant of its
      credential names; watched.
- [ ] 1.4 Grant store `AccessGrants` (`grant`, `revoke`, `list`, groups and members) with
      the in-transaction invariants (`role_scope_mismatch`, scope ownership through
      `work_package_organization`, today's `project_organization`; `not_a_member`,
      `unknown_group`, `unknown_credential`, `already_granted`, `last_super_admin`), and a
      revoked credential's grants deleted with it (P17) — test: `access-grant-store.db.test.ts` one case per refusal and
      the two-super-admins-one-leaves case across two connections (precedent
      `organization-records.db.test.ts`); negatives: drop the last-super-admin count and
      the organization is left without one; drop the ownership join and B's package is
      granted in A; skip the credential cascade and a revoked credential's grant row
      survives; watched.

## 2. `may()` wired into core, the old checks removed

- [ ] 2.1 `authorize(decisions, principal, scope, permission)` in `@wbs/core` with the
      P10 answers; `resolve` answers membership, `delegated` and the cap
      (`OrganizationScope.role` stays for the old helpers until 2.4); `scopesOfRoles`
      reads the organization-kind level — test: `authorize.test.ts` (not_found, forbidden-with-permission, ok) and the
      existing `authentication.feature` tests with grants; negative: answer `forbidden`
      where the level is null and the "invisible is 404" controller case leaks; watched.
- [ ] 2.2 Rewire the work-package sites, old helpers kept: batches
      (`admitted-scope.resource.ts`, per kind from permission-matrix.md), project, step,
      calendar marker, saved plan, import, create (P16: `organization.create_project`
      until #698 slice 2), the recovery branch of `classifyProjectEdit` (flag clear only,
      P5); controller fixtures gain `grants:` beside `role:` — test: the existing
      project, step, marker, saved-plan and import `*-organization.controller.db.test.ts`
      green on backfilled grants, plus `command-permission.controller.db.test.ts`
      asserting each of the 61 kinds (40 work package, 21 directory) against the matrix
      (a contributor, a manager, a viewer, a machine), `setBudget` and `clearBudget` under
      `project.manage_budgets` (a `project-contributor` refused naming it); negatives: one per rewired site, the fault being "skip the
      `authorize` call", each watched against its named existing test (for example
      `refuses a viewer every batch, undo and redo`); the `Proof:` comments move with the
      checks.
- [ ] 2.3 Rewire the organization sites, old helpers kept: directory batches and binding,
      spaces, capacity mode, claims (`isClaimAdmin` → `package.claim_for_others`), machine
      credential reach, directory agent visibility, measure definitions and plan import's
      measure rows (`mayDefineMeasuresInOrganization` → `organization.manage_directory`),
      work package rank move (→ `organization.manage_spaces`) — test: the directory, space, capacity
      and claim controller tests green on backfilled grants, P7's narrowing visible as
      named refusals; negatives: skip each `authorize` call against its named test;
      watched.
- [ ] 2.4 Rewire the store-side `super_admin` reads (domains, SSO, session policy,
      provisioning, shared-people restore) to `organization.manage_security` in the same
      transaction, then delete `canWriteInOrganization`, `mayBindAccountInOrganization`,
      `canEditProjectInOrganization`, `mayDefineMeasuresInOrganization`,
      `mayAdministerMembership`, `mayInvite`,
      `mayEditProjectWithin`, `isClaimAdmin`, `organizationRoleOf`,
      `roleMaySwitchCapacityMode` and the fixtures' `role:` helper — test: the security
      controller tests green on grants; `git grep` for each deleted helper answers
      nothing; `OrganizationScope.role` leaves the type; negative: skip the `authorize`
      call in `session-policy.ts` and a `project-contributor` sets the session policy;
      watched.
- [ ] 2.5 Membership routes: `changeMemberRole` removed, `listMembers` answers effective
      role and grant count, `removeMember` deletes grants and group memberships in the
      transaction with one audit row (removing an organization-role holder also needs
      `organization.manage_organization_roles`, P11), invitations and join-request approval
      carry an optional initial grant obeying P11, onboarding's creator receives
      `org-super-admin`, SCIM-provisioned members receive none — test:
      `membership-organization.controller.db.test.ts` rewritten, with the scenarios "A
      SCIM-provisioned member arrives with no grant" and "Removing an organization-role
      holder"; negatives: skip the grant cascade on removal and the removed member's grant
      row survives; write a `project-contributor` grant on SCIM provisioning and the
      no-grant case lists a work package; check only `organization.manage_members` on
      removal and an `org-admin` removes another `org-admin`; watched.

## 3. Listing, visibility and the 404 rule

- [ ] 3.1 `findReadablePackage` replaces `findProjectWithin`; every single-work-package route,
      the gateway access routes and `readSolution` answer `404 not_found` for an unreadable
      package with the absent-id body — test: `visibility.controller.db.test.ts` per verb
      of the "Invisible is 404 on every verb" scenario, byte-comparing bodies; negative:
      answer 403 for the invisible case and the body comparison fails; watched.
- [ ] 3.2 After #698 slice 2: `listWorkPackages`, spaces (list, read, roll-ups,
      in-progress), work package rank, person load and startable reads filter through `readablePackageIds` in one
      statement (design.md's listing statement); every list answers `200` with the
      visible subset (P10), and a space read without `organization.navigate` is 404 — test:
      the spaces' hidden-member cases rerun under grants, the plain-member `[]` on every
      list route, a statement counter proving one query per page; negatives: filter
      through `listForInOrganization` and the hidden work package appears in the roll-up;
      answer `403` on the plain member's `GET /api/spaces` and the `[]` case fails;
      watched.
- [ ] 3.3 Restricted work packages (P5, P6), with work package targets built from
      `InterimPackageChain` (P13): the evaluator's read-only rule, creation
      grants for creators (each with its `access_granted` row, after 4.1), the flag clear through `organization.recover_restricted` with
      one `restricted_work_package_recovery` row, every other super-admin write refused —
      test: `restricted-work-package.controller.db.test.ts` for the five scenarios of the
      spec and organization-access's three; negatives: drop the creation grant and the
      creator loses their restricted work package; drop the audit and the recovery
      writes without a row; let `recover_restricted` admit a batch and the "no other
      recovery write" case commits; watched.
- [ ] 3.4 Project rules, after #698 slice 2: `createWorkPackage` and `importWorkPackage`
      move from P16's interim rule to `project.manage_packages` at the project the body
      names; `moveWorkPackage` at both projects; the `/api/projects` family
      (`organization.create_project`, `project.read` with the P3 shell,
      `project.manage_settings` for patch, delete, settings, project steps and the type
      allow-list); `InterimPackageChain` replaced by `ProjectChain` and `WorkPackageChain`;
      the creator's `project-manager` grant, written by #698 slice 2's `createProject` in its
      transaction (#698 E41), is honoured —
      test: `project-permission.controller.db.test.ts` for every project row of
      permission-matrix.md and the "Moving a work package needs both projects" and "A
      role counts only for the kinds it governs" scenarios; negatives: check the move at
      the source only and the one-side case is accepted; drop the creator grant and the
      creator of P is refused its settings; watched.

## 4. Grant commands and audit

- [ ] 4.1 Audit widening `widen_organization_audit_access` (compatible rebuild, precedent
      `20261012090200`), `ORGANIZATION_AUDIT_ACTIONS` and subject kinds, `down.sql`
      refusing while a new-action row exists — test: the migration test forward, back
      and refusal; negative: `CHECK (1)` in place of the guard and `migration-lint.test.ts`
      reports it; watched.
- [ ] 4.2 Shapes in `@wbs/contracts` for `listGrants`, `grantRole`, `revokeRole`;
      routes in `grant.routes.ts` with P11's permissions, escalation and the store's
      refusals, a `machine_credential` subject under the same permission and escalation
      rule as a person (P17); every 403 shape reuses one shared `forbiddenRefusal` whose
      `permission` is a single `type.enumerated(...PERMISSIONS)` (P10, `wbs-measure-budgets`
      D47); `subject=me` for any member; OpenAPI emit golden; mcp-01 `EXCLUDED_PATHS`
      gains `/api/organization/grants` and `…/*` — test:
      `grant.controller.db.test.ts` for the grant scenarios of the spec and the
      audit-cannot-be-written case; the mcp-01 exclusion test; `contracts-boot-memory.test.ts`
      stays under its 500 MB bound with the permission field added, and a shapes test
      asserts every `status: 403` declaration's schema is the shared constant; negatives:
      skip the escalation comparison and a package-manager grants project-manager; skip it
      for a credential subject and a project-manager grants its agent `org-admin`; remove
      the exclusion entry and the tool appears; declare a per-route literal subset on one
      shape and the shared-constant assertion fails; watched.
- [ ] 4.3 Check-inside-the-turn proofs: the two scenarios of "Every check runs inside the
      write's transaction" with a second connection revoking before the write gate (the
      `admitEditInOrganization` precedent) — test: `grant-race.controller.db.test.ts`;
      negative: evaluate `may` on the request's resolved stores instead of the turn's and
      the revoked batch commits; watched.

## 5. Access groups

- [ ] 5.1 Shapes and routes for `listAccessGroups`, `createAccessGroup`,
      `renameAccessGroup`, `deleteAccessGroup`, `addGroupMember`, `removeGroupMember`
      under `organization.manage_access`; `name_taken`, `not_a_member`, cascade of a
      deleted group's grants and members with one audit row each; excluded from MCP tools
      — test: `access-group.controller.db.test.ts` for the group scenario of the spec
      and each refusal; negatives: drop the membership foreign key check and a non-member
      joins a group; skip the cascade and a deleted group's grant still grants; watched.

## 6. Machine cap and restricted-project negatives on the production paths

- [ ] 6.1 Machine credentials as subjects (P17) and the cap on every grant route; A23's
      controller cases rewritten to credential grants and the contributor cap;
      `package.claim_for_others` for a machine; lease renewal (`POST /api/claims/renew` and
      the committed agent batch's renewal) skips work packages the principal cannot read —
      test: `machine-cap.controller.db.test.ts` for the machine scenarios of the spec
      ("A machine credential confined to one work package", "Grants to people do not
      reach a machine", "Renewal skips an unreadable work package" among them), the
      consent-credential variant through mcp-01's delegation; negatives: pass cap 5 for a
      `consent` principal and the agent freezes the work package; let a machine reach
      `grantRole` and a row is written; evaluate a machine principal with its bound
      account's `user` row and the confined agent reads the second package; renew without
      the readable filter and the lease in the revoked package moves; watched.
- [ ] 6.2 P7 narrowing recorded as behaviour: a backfilled member is refused directory
      commands, space writes, `createWorkPackage` and binding with the permission named,
      trusted issuers are refused an `org-admin`, and an `org-admin` grant restores each
      member act — test: `member-narrowing.controller.db.test.ts`; negative: map `member`
      to `org-admin` in the backfill and every refusal case passes as accepted; watched.
- [ ] 6.3 `apps/wbs/be-01/src/revoke-backfill-cli.ts` (P15): prints the organization's
      backfilled `project-contributor` and `project-viewer` grants, the machine
      credentials' copies included (P17), deletes them only
      when `--expect-count` matches, one transaction, one `access_revoked` row each
      (origin `operator`); `docs/runbook-dev-deploy.md` gains the line "after the swap,
      per organization: back up, run `revoke-backfill` without `--expect-count`, read the
      list, rerun with `--expect-count=<n>`" — test: `revoke-backfill-cli.db.test.ts` for
      the spec's scenario, a second organization untouched, `org-*` and creator rows
      kept; negatives: drop the count guard and a mismatched run deletes; drop the origin
      predicate and a route grant is deleted; watched.

## 7. fe-01

- [ ] 7.1 Members page: effective role column, grants drawer with provenance and revoke,
      grant form (scope picker over readable projects and packages, role by scope kind,
      subject member/group/every member/machine credential), access groups section;
      refusals render the named
      permission; `organization-role.ts` and the role select removed — test:
      `members-panel.test.tsx` states: loading, empty, rows, grant added, revoke, refusal
      with permission, transport failure; negative: render the grant form from the role
      list instead of the catalogue and the organization-role option appears for an
      org-admin; watched. Reviewed by eye for a fluent flow (ui-work-acceptance).
- [ ] 7.2 Plain-member empty state with own agents and credentials; lists render only
      readable packages; package URL 404 renders the not-found state — test:
      `organization-gate.test.tsx` and the project catalog feature test with an empty
      readable set and a 404 open; negative: render a "no access" hint on 404 and the
      no-hint assertion fails; watched.

## 8. Docs and CONTEXT

- [ ] 8.1 Verify the landed `CONTEXT.md` terms (already on main: Access grant, Access
      role, Access group, Grant scope, Effective role, Organization members subject,
      Machine cap; Membership and Super-admin amended; Role deleted; Restricted project
      renamed **Restricted work package** with P5's meaning; the review amendment's
      Principal and Machine principal, and Directory, Machine credential and Machine cap as
      amended for P17) still match the code as built; `docs/auth-integration.md` section
      "Authorization" rewritten to grants; `apps/wbs/mcp-01/README.md` tool exclusions;
      JSDoc on `authorize`, `AccessDecisions` and the migration; Burokrat `check-indexes`
      exit 0 — test: `bunx openspec validate --all --json`, `bunx nx format:check --all`,
      the index check.
- [ ] 8.2 verify.md with the failure-proof table: one row per negative above (the
      injected fault, the test watched failing, the `Proof:` comment's location), so that
      every refusal and omission this change adds has its production-path negative on
      record; the gate output from `bin/h2puni-gate.sh <sha>` or h4claw; the commit range.
      Before archiving, the archive order of design.md ("Archive order") holds.
