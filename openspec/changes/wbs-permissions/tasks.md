## 0. Dany reads P1 to P14

- [ ] 0.1 Dany confirms or amends design.md P1 to P14, in particular P5 (restriction
      excludes `org-admin` and `org-viewer`), P7 (what narrows at the swap), P11 (who
      grants what) and P12 (the cap is evaluated, not stored). Slices 1 and 2 may proceed
      on P1, P2, P8, P9, P12 and P13; slice 3 waits for P3, P4 and P5; slice 4 for P11;
      slice 6 for P5 and P7. Slices 3 to 7 also wait for `wbs-work-packages`' project
      entity.

## 1. Catalogue, grant tables and backfill

- [ ] 1.1 Migration `add_access_grants`: `access_role` seeded with the nine roles,
      `access_group`, `access_group_member`, `access_grant` with the CHECKs, unique and
      composite foreign keys, the `organization_members` trigger, the two indexes, the
      backfill of memberships and package owners, and a `down.sql` refusing while a
      non-backfill grant or a group exists — test: `access-grant-migration.db.test.ts`
      forward (counts per role equal memberships and owned packages), back on a
      backfill-only store, refusal over one route-origin grant; negatives: drop the
      refusal and the rollback silently deletes a route grant; drop the owner predicate
      and a non-member owner receives a grant; watched.
- [ ] 1.2 Red: `access-role.test.ts` in `@wbs/domain` for the pure catalogue and
      `may(effective, permission)`: the 9 × 21 table of permission-matrix.md as a
      property (every cell), kind filtering (a project role never satisfies an
      organization permission), and the cap — test: one case per permission plus the
      table; negative: lower `package.claim_for_others` to level 2 and the machine case
      passes; watched.
- [ ] 1.3 Green: port `AccessDecisions` (`effectiveRoleAt`, `readablePackageIds`) in
      `@wbs/core`, SQLite implementation with the two statements of design.md, exposed on
      the admitted turn's stores and the read stores; provenance returned — test:
      `access-decisions.db.test.ts`: direct, group, members subject, strongest wins,
      restricted skip, membership gone, cap 2 and 5, listing fast path and the
      project-id and package-id branches, one statement per call (statement counter);
      negatives: remove the membership `EXISTS` and a removed member keeps access; remove
      the `organization_wide` predicate and an `org-admin` reads a restricted package;
      replace `MIN(…, :cap)` with `MAX` and the machine case is manager; watched.
- [ ] 1.4 Grant store `AccessGrants` (`grant`, `revoke`, `list`, groups and members) with
      the in-transaction invariants (`role_scope_mismatch`, scope ownership through
      `project_organization`, `not_a_member`, `unknown_group`, `already_granted`,
      `last_super_admin`) — test: `access-grant-store.db.test.ts` one case per refusal and
      the two-super-admins-one-leaves case across two connections (precedent
      `organization-records.db.test.ts`); negatives: drop the last-super-admin count and
      the organization is left without one; drop the ownership join and B's package is
      granted in A; watched.

## 2. `may()` wired into core, the old checks removed

- [ ] 2.1 `authorize(decisions, principal, scope, permission)` in `@wbs/core` with the
      P10 answers; `OrganizationScope.role` removed from the type; `resolve` answers
      membership, `delegated` and the cap; `scopesOfRoles` reads the organization-kind
      level — test: `authorize.test.ts` (not_found, forbidden-with-permission, ok) and the
      existing `authentication.feature` tests with grants; negative: answer `forbidden`
      where the level is null and the "invisible is 404" controller case leaks; watched.
- [ ] 2.2 Rewire every site in the "The `may` port" table of design.md: batches
      (`admitted-scope.resource.ts`, per kind from permission-matrix.md), directory,
      project, step, calendar marker, saved plan, import, spaces, capacity mode, claims
      (`isClaimAdmin` → `package.claim_for_others`), machine credential reach, directory
      agent visibility, the store-side `super_admin` reads (domains, SSO, session policy,
      provisioning, shared-people restore), the recovery branch of `classifyProjectEdit`;
      delete `canWriteInOrganization`, `mayBindAccountInOrganization`,
      `canEditProjectInOrganization`, `mayAdministerMembership`, `mayInvite`,
      `mayEditProjectWithin`, `isClaimAdmin`, `organizationRoleOf`,
      `roleMaySwitchCapacityMode`; controller fixtures gain `grants:` in place of `role:`
      — test: every existing `*-organization.controller.db.test.ts` green on backfilled
      grants, plus `command-permission.controller.db.test.ts` asserting each of the 54
      kinds against the matrix (a contributor, a manager, a viewer, a machine); negatives:
      one per rewired site, the fault being "skip the `authorize` call", each watched
      against its named existing test (for example `refuses a viewer every batch, undo
and redo`); the `Proof:` comments move with the checks.
- [ ] 2.3 Membership routes: `changeMemberRole` removed, `listMembers` answers effective
      role and grant count, `removeMember` deletes grants and group memberships in the
      transaction with one audit row, invitations and join-request approval carry an
      optional initial grant obeying P11, onboarding's creator receives `org-super-admin`,
      SCIM-provisioned members receive none — test:
      `membership-organization.controller.db.test.ts` rewritten; negative: skip the grant
      cascade on removal and the removed member's grant row survives; watched.

## 3. Listing, visibility and the 404 rule

- [ ] 3.1 `findReadablePackage` replaces `findProjectWithin`; every single-package route,
      the gateway access routes and `readSolution` answer `404 not_found` for an unreadable
      package with the absent-id body — test: `visibility.controller.db.test.ts` per verb
      of the "Invisible is 404 on every verb" scenario, byte-comparing bodies; negative:
      answer 403 for the invisible case and the body comparison fails; watched.
- [ ] 3.2 `listProjects`, spaces (list, read, roll-ups, in-progress), project rank,
      person load and startable reads filter through `readablePackageIds` in one
      statement; the project shell of a package-only grant (P3); `organization.navigate`
      gates the list routes — test: the spaces' hidden-member cases rerun under grants,
      the shell case, the plain-member empty list, a statement counter proving one query
      per page; negative: filter through `listForInOrganization` and the hidden package
      appears in the roll-up; watched.
- [ ] 3.3 Restricted packages (P5, P6): the evaluator's skip, creation grants for
      creators, recovery through `organization.recover_restricted` audited — test:
      `restricted-package.controller.db.test.ts` for the three scenarios of the spec;
      negatives: drop the creation grant and the creator loses their restricted package;
      drop the audit and the recovery writes without a row; watched.

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
      cap 5 for a `consent` principal and the agent freezes the project; let a machine
      reach `grantRole` and a row is written; watched.
- [ ] 6.2 P7 narrowing recorded as behaviour: a backfilled member is refused directory
      commands, space writes, `createProject` and binding with the permission named, and
      an `org-admin` grant restores each — test:
      `member-narrowing.controller.db.test.ts`; negative: map `member` to `org-admin` in
      the backfill and every refusal case passes as accepted; watched.

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
      scope, Effective role, Organization members subject, Machine cap; Membership, Role,
      Super-admin, Restricted project amended); `docs/auth-integration.md` section
      "Authorization" rewritten to grants; `apps/wbs/mcp-01/README.md` tool exclusions;
      JSDoc on `authorize`, `AccessDecisions` and the migration; Burokrat `check-indexes`
      exit 0 — test: `bunx openspec validate --all --json`, `bunx nx format:check --all`,
      the index check.
- [ ] 8.2 verify.md with the failure-proof table: one row per negative above, the gate
      output from `bin/h2puni-gate.sh <sha>` or h4claw, and the commit range.
