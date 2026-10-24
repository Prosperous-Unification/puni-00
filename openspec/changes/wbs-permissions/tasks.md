Every refusal and every omission a slice adds or changes ships with a production-path
negative: the slice watches its test fail with the check removed or its dependency broken,
then adds an adjacent `Proof:` comment naming the injected fault and the observed test
(R5). Each negative below names that fault; verify.md (8.2) records them.

## 0. Dany reads P1 to P16

- [ ] 0.1 Dany confirms or amends design.md P1 to P16, in particular P5 as revised
      (organization-scope grants do not write a restricted work package; `org-admin` and
      `org-super-admin` still read it), P7 (what narrows at the swap), P10 as revised (one
      shape for lists), P11 (who grants what), P12 (the cap is evaluated, not stored) and
      P15 (`revoke-backfill`). Slice 1 waits for P1, P2, P8, P9, P12, P13 and P7, because
      its backfill mapping is P7's decision on what E8 keeps; slice 2 also for P16; slice 3
      for P3, P4, P5 and P10; slice 4 for P11; slice 6 for P5, P7 and P15. Slices 3 to 7
      run after #698 slice 1; slice 3's project rules (3.4) after #698 slice 2.

## 1. Catalogue, grant tables and backfill

- [ ] 1.1 Migration `add_access_grants`: `access_role` seeded with the nine roles,
      `access_group`, `access_group_member`, `access_grant` with the CHECKs, unique and
      composite foreign keys, the `organization_members` trigger, the two indexes, the
      backfill of memberships and work package owners (no project-scope row), and a
      `down.sql` refusing while a non-backfill grant or a group exists — test:
      `access-grant-migration.db.test.ts` forward (counts per role equal memberships and
      owned work packages), back on a backfill-only store, refusal over one route-origin
      grant; negatives: drop the refusal and the rollback silently deletes a route grant;
      drop the owner predicate and a non-member owner receives a grant; watched.
- [ ] 1.2 Red: `access-role.test.ts` in `@wbs/domain` for the pure catalogue,
      the `ScopeChain` value type shared with #698 (design.md P13) and
      `may(effective, permission)`: the 9 × 21 table of permission-matrix.md as a
      property (every cell), kind filtering (a project role never satisfies an
      organization permission), and the cap — test: one case per permission plus the
      table; negative: lower `package.claim_for_others` to level 2 and the machine case
      passes; watched.
- [ ] 1.3 Green: port `AccessDecisions` (`effectiveRoleAt`, `readablePackageIds`) in
      `@wbs/core`, SQLite implementation with the two statements of design.md, exposed on
      the admitted turn's stores and the read stores; provenance returned; work package
      targets without a project until #698 slice 2 (design.md, "The `may` port") — test:
      `access-decisions.db.test.ts`: direct, group, members subject, strongest wins, the
      kind filter, the restricted rule (org-admin and org-super-admin read, org-viewer,
      organization-scope project and package roles and the members subject skipped),
      membership gone, cap 2 and 5, one statement per call (statement counter);
      negatives: remove the membership `EXISTS` and a removed member keeps access; remove
      the kind filter and the case "a package role at organization scope satisfies a
      project permission" passes where it must fail; remove the P5 clause and an
      `org-viewer` reads a restricted work package; remove the `CASE` and an `org-admin`
      writes one; replace `MIN(…, :cap)` with `MAX` and the machine case is manager;
      watched.
- [ ] 1.4 Grant store `AccessGrants` (`grant`, `revoke`, `list`, groups and members) with
      the in-transaction invariants (`role_scope_mismatch`, scope ownership through
      `work_package_organization`, today's `project_organization`; `not_a_member`,
      `unknown_group`, `already_granted`, `last_super_admin`) — test: `access-grant-store.db.test.ts` one case per refusal and
      the two-super-admins-one-leaves case across two connections (precedent
      `organization-records.db.test.ts`); negatives: drop the last-super-admin count and
      the organization is left without one; drop the ownership join and B's package is
      granted in A; watched.

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
      asserting each of the 54 kinds against the matrix (a contributor, a manager, a
      viewer, a machine); negatives: one per rewired site, the fault being "skip the
      `authorize` call", each watched against its named existing test (for example
      `refuses a viewer every batch, undo and redo`); the `Proof:` comments move with the
      checks.
- [ ] 2.3 Rewire the organization sites, old helpers kept: directory batches and binding,
      spaces, capacity mode, claims (`isClaimAdmin` → `package.claim_for_others`), machine
      credential reach, directory agent visibility — test: the directory, space, capacity
      and claim controller tests green on backfilled grants, P7's narrowing visible as
      named refusals; negatives: skip each `authorize` call against its named test;
      watched.
- [ ] 2.4 Rewire the store-side `super_admin` reads (domains, SSO, session policy,
      provisioning, shared-people restore) to `organization.manage_security` in the same
      transaction, then delete `canWriteInOrganization`, `mayBindAccountInOrganization`,
      `canEditProjectInOrganization`, `mayAdministerMembership`, `mayInvite`,
      `mayEditProjectWithin`, `isClaimAdmin`, `organizationRoleOf`,
      `roleMaySwitchCapacityMode` and the fixtures' `role:` helper — test: the security
      controller tests green on grants; `git grep` for each deleted helper answers
      nothing; `OrganizationScope.role` leaves the type; negative: skip the `authorize`
      call in `session-policy.ts` and a `project-contributor` sets the session policy;
      watched.
- [ ] 2.5 Membership routes: `changeMemberRole` removed, `listMembers` answers effective
      role and grant count, `removeMember` deletes grants and group memberships in the
      transaction with one audit row, invitations and join-request approval carry an
      optional initial grant obeying P11, onboarding's creator receives `org-super-admin`,
      SCIM-provisioned members receive none — test:
      `membership-organization.controller.db.test.ts` rewritten; negative: skip the grant
      cascade on removal and the removed member's grant row survives; watched.

## 3. Listing, visibility and the 404 rule

- [ ] 3.1 `findReadablePackage` replaces `findProjectWithin`; every single-work-package route,
      the gateway access routes and `readSolution` answer `404 not_found` for an unreadable
      package with the absent-id body — test: `visibility.controller.db.test.ts` per verb
      of the "Invisible is 404 on every verb" scenario, byte-comparing bodies; negative:
      answer 403 for the invisible case and the body comparison fails; watched.
- [ ] 3.2 `listWorkPackages`, spaces (list, read, roll-ups, in-progress), work package
      rank, person load and startable reads filter through `readablePackageIds` in one
      statement (design.md's listing statement); every list answers `200` with the
      visible subset (P10), and a space read without `organization.navigate` is 404 — test:
      the spaces' hidden-member cases rerun under grants, the plain-member `[]` on every
      list route, a statement counter proving one query per page; negatives: filter
      through `listForInOrganization` and the hidden work package appears in the roll-up;
      answer `403` on the plain member's `GET /api/spaces` and the `[]` case fails;
      watched.
- [ ] 3.3 Restricted work packages (P5, P6): the evaluator's read-only rule, creation
      grants for creators, the flag clear through `organization.recover_restricted` with
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
      allow-list); `createProject` writes the creator's `project-manager` grant (P6) —
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
      refusals; `subject=me` for any member; OpenAPI emit golden; mcp-01 `EXCLUDED_PATHS`
      gains `/api/organization/grants` and `…/*` — test:
      `grant.controller.db.test.ts` for the four grant scenarios of the spec and the
      audit-cannot-be-written case; the mcp-01 exclusion test; negatives: skip the
      escalation comparison and a package-manager grants project-manager; remove the
      exclusion entry and the tool appears; watched.
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

- [ ] 6.1 The cap through every subject kind and on every grant route; A23's controller
      cases rewritten to the contributor cap; `package.claim_for_others` for a machine —
      test: `machine-cap.controller.db.test.ts` for the three machine scenarios of the
      spec, the consent-credential variant through mcp-01's delegation; negatives: pass
      cap 5 for a `consent` principal and the agent freezes the work package; let a machine
      reach `grantRole` and a row is written; watched.
- [ ] 6.2 P7 narrowing recorded as behaviour: a backfilled member is refused directory
      commands, space writes, `createWorkPackage` and binding with the permission named,
      trusted issuers are refused an `org-admin`, and an `org-admin` grant restores each
      member act — test: `member-narrowing.controller.db.test.ts`; negative: map `member`
      to `org-admin` in the backfill and every refusal case passes as accepted; watched.
- [ ] 6.3 `apps/wbs/be-01/src/revoke-backfill-cli.ts` (P15): prints the organization's
      backfilled `project-contributor` and `project-viewer` grants, deletes them only
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
      subject member/group/every member), access groups section; refusals render the named
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

- [ ] 8.1 `CONTEXT.md` terms landed (Access grant, Access role, Access group, Grant
      scope, Effective role, Organization members subject, Machine cap; Membership and
      Super-admin amended; Role deleted; Restricted project renamed **Restricted work
      package** with P5's meaning); `docs/auth-integration.md` section
      "Authorization" rewritten to grants; `apps/wbs/mcp-01/README.md` tool exclusions;
      JSDoc on `authorize`, `AccessDecisions` and the migration; Burokrat `check-indexes`
      exit 0 — test: `bunx openspec validate --all --json`, `bunx nx format:check --all`,
      the index check.
- [ ] 8.2 verify.md with the failure-proof table: one row per negative above (the
      injected fault, the test watched failing, the `Proof:` comment's location), so that
      every refusal and omission this change adds has its production-path negative on
      record; the gate output from `bin/h2puni-gate.sh <sha>` or h4claw; the commit range.
      Before archiving, the archive order of design.md ("Archive order") holds.
