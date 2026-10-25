Every refusal and omission ships with a production-path negative watched red with the
check removed, then an adjacent `Proof:` comment (R5). Slices C1 and C2 are carried by
`wbs-permissions` slice 1 (its tasks 1.1–1.3, amended by this change); C3 onward run after
`wbs-permissions` slice 4 (grant administration) and land in this change's branch. Every
fixture of a negative passes each check that precedes the one under test (design.md
CP10's precedence) and fails only there.

## 0. Decisions

- [x] 0.1 Dany fixed CP1–CP6 (2026-10-25); CP7–CP20 assumed by the planner, overrulable by
      id; CP13 settled 2026-10-25 (implement); CP14, CP18's flag and CP20 await Dany. Nothing merges until Dany's
      in-progress changes land (goal of 2026-10-25), #723 first.

## 1. Inside `wbs-permissions` slice 1 (amended there)

- [ ] 1.1 `access_role` with `name`, nullable `level` and the built-in/custom CHECK,
      `access_role_permission`, the reserved-name trigger, the nine built-in sets seeded
      from `permission-matrix.md`, and `down.sql` naming the five tables in dependency
      order and refusing while custom catalogue state exists (design.md "Tables") — test:
      `access-grant-migration.db.test.ts` asserts the seed's ids equal the matrix cell by
      cell (a generated fixture read from the markdown table) and `PERMISSIONS`' ids equal
      the matrix's, rollback succeeds over built-in rows only and is refused over an
      ungranted custom role, keeping it and its rows; negatives: flip one matrix cell and
      the seed test fails; drop the trigger and a custom role named `org-admin` is
      inserted; drop the custom-role guard and the rollback deletes the ungranted role;
      watched.
- [ ] 1.2 `@wbs/domain`: `PERMISSIONS` entries with `kind` metadata (CP16), `EffectiveRole`
      with `permissions` and `via`, `may` as set membership, `CONTRIBUTOR_CAP` from the
      seed, `roleMayHold(objectKind, permission)` read from the metadata, and the CP18
      transformation `permissionsOnTarget(grant, target)` — test: `access-role.test.ts`
      every matrix cell as a property, every seeded row satisfies `roleMayHold`, the cap
      excludes every grant and manage permission, navigation allowed in every kind, the
      transformation's three outcomes for built-in and custom organization roles;
      negatives: widen the cap with `project.manage_budgets` and the machine scenario
      passes; make `roleMayHold` read the id prefix and copying `package-manager` is
      refused `permission_kind_mismatch`; return a built-in admin's set unchanged on a
      restricted target and an `org-admin` writes one; keep a custom organization role
      equal to `org-admin` on a restricted target and its holder reads one; watched.
- [ ] 1.3 `effectiveRoleAt` and `readablePackageIds` as design.md "Effective set" (one
      statement each, raw rows validated before the transformation and the cap, null
      without the target's read permission) — test: `access-decisions.db.test.ts`
      statement counter unchanged, `EXPLAIN QUERY PLAN` naming `access_grant_subject`,
      the three throws on injected rows on both paths, an organization-scope role without
      `package.read` listing nothing with every detail `404`, list and detail agreeing on
      generated fixtures; negatives: catch-and-skip the unknown row and the throw test
      fails; filter by vocabulary in SQL before validation and the listing answers instead
      of throwing; turn the permission `LEFT JOIN` inner and a role with no rows reads as
      "no grant" instead of `EmptyRoleSet`; add `project.manage_settings` to
      `package-manager`'s seed and the case "a package role at organization scope
      satisfies no project permission" passes unless `PermissionKindRow` throws; drop
      `reads_packages` and the budgets-only organization role lists every package;
      watched.

## 2. Custom role store and routes (after `wbs-permissions` slice 4)

- [ ] 2.1 Red: `access-role-store.db.test.ts` for `createAccessRole`, `updateAccessRole`,
      `deleteAccessRole`, `listAccessRoles` with the invariants in one transaction, in
      CP10's precedence: `not_found` (absent and foreign identical, foreign row unchanged),
      `built_in`, `unknown_permission`, `empty_set`, `permission_kind_mismatch`, the
      organization-kind rule and the actor-subset rule over existing ∪ resulting (CP5,
      CP15), `reserved_name`, `name_taken`, `in_use { grants }`; audit rows with
      added/removed; a set edit racing a decision (the role loses `package.write` between
      a batch's resolve and its write turn and the batch is refused naming it). Green: the
      store on both stores through the conformance suite. Negatives: drop the `in_use`
      check and the test sees `FOREIGN KEY constraint failed` where it asserts
      `409 in_use { grants: 2 }`; authorize PATCH against the resulting set only and an
      `org-admin` replaces a security role's set with `package.read`; drop the subset
      rule and a role steward stores `project.manage_budgets` it lacks; drop `built_in`
      and `project-manager` is renamed; drop the organization predicate and a foreign
      role is patched; each watched.
- [ ] 2.2 `grantRole` with a custom role: `404 unknown_role` for another organization's
      role, the subset rule against the grant-comparison set (CP13), the cap on a
      credential holding a custom manager role — test: extend `access-grants.db.test.ts`
      with the spec's project-manager and grant-clerk scenarios; negatives: drop the
      organization predicate on the role lookup and a foreign role is granted; drop the
      subset test and the grant clerk binds `Claims lead`; watched.
- [ ] 2.3 Group and super-admin rules (CP13, CP14), amending `wbs-permissions` 1.4 and
      slice 4: `addGroupMember`, `removeGroupMember` and `deleteAccessGroup` checked
      against every grant of the group, the organization-members subject needing
      `organization.manage_organization_roles`, and one `last_super_admin` guard run after
      every write that can remove a direct `org-super-admin` grant or its holder — test:
      the spec's self-add, every-member, group-held and concurrent-removal scenarios;
      negatives: drop the group-grant check and the `org-admin` joins the security group;
      count group-held grants in the guard and the last direct grant is revoked; drop the
      guard from member removal and the concurrent pair leaves none; watched.
- [ ] 2.4 `@wbs/contracts` shapes for the four routes and `grantable=true` (refusal codes
      typed once, P10's `forbiddenRefusal` reused), be-01 routes under the organization,
      mcp-01 exclusion list extended — test: route tests for every refusal and the audit
      rows; the grantable listing for a `project-manager` without `organization.read`;
      `openapi-tools.test.ts` asserts none of the four operations is a generated tool;
      `contracts-boot-memory.test.ts` still under 500 MB; negative: drop the new exclusion
      and the absence test names the operation; watched.
- [ ] 2.5 Audit rebuild: three actions and the `access_role` subject kind, folded into
      `widen_organization_audit_access` or its own compatible rebuild with `down.sql`
      refusing through a named guard while a new-action row exists — test: insert refused
      before, accepted after; rollback over one `access_role_created` row fails with the
      guard's named refusal and keeps the row; negative: the guard replaced by `WHERE 0`
      and the failure becomes the narrow table's CHECK, not the guard's name (precedent
      `20261022140100`); watched.

## 3. fe-01

- [ ] 3.1 Settings → Access → Roles: built-ins read-only, custom role editor (checkboxes
      by kind, "copy from…" filling the editor only, CP2, the CP20 warning), grant count
      with a link, delete disabled with the `in_use` reason; the members page grant form's
      role picker from the grantable listing; effective permissions shown as a set with
      provenance — Playwright scenarios for create, edit, copy, refused delete, and a
      `project-manager` granting a custom package role; rendered states for loading, empty
      and query failure.

## 4. Verify

- [ ] 4.1 `verify.md`: commands, outputs, the R5 proofs of 1.1–2.5;
      `openspec validate --all --json` 0 invalid; dev window: create a custom role on dev,
      grant it to a test account, observe the 403/200 pair of the budgets-only scenario, revoke, delete.
