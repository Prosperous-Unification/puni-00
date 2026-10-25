Every refusal and omission ships with a production-path negative watched red with the
check removed, then an adjacent `Proof:` comment (R5). Slices C1 and C2 are carried by
`wbs-permissions` slice 1 (its tasks 1.1–1.3, amended by this change); C3 onward run after
`wbs-permissions` slice 4 (grant administration) and land in this change's branch.

## 0. Decisions

- [x] 0.1 Dany fixed CP1–CP6 (2026-10-25); CP7–CP12 assumed by the planner, overrulable by
      id. Nothing merges until Dany's in-progress changes land (goal of 2026-10-25).

## 1. Inside `wbs-permissions` slice 1 (amended there)

- [ ] 1.1 `access_role` with `name`, nullable `level` and the built-in/custom CHECK,
      `access_role_permission`, the reserved-name trigger, the nine built-in sets seeded
      from `permission-matrix.md` — test: `access-grant-migration.db.test.ts` asserts the
      seed equals the matrix cell by cell (a generated fixture read from the markdown
      table); negatives: flip one matrix cell and the seed test fails; drop the trigger and
      a custom role named `org-admin` is inserted; watched.
- [ ] 1.2 `@wbs/domain`: `EffectiveRole { permissions, via }`, `may` as set membership,
      `CONTRIBUTOR_CAP` from the seed, `permissionKind(permission)` and
      `roleMayHold(objectKind, permission)` — test: `access-role.test.ts` every matrix cell
      as a property, kind rule, cap excludes every `*.grant` and `*.manage_*` permission;
      negatives: widen the cap with `project.manage_budgets` and the machine scenario
      passes; drop the kind rule and a package role satisfies `project.manage_settings`;
      watched.
- [ ] 1.3 `effectiveRoleAt` joins `access_role_permission` (one statement, provenance per
      permission); `readablePackageIds` on `package.read`; `UnknownPermissionRow` thrown on
      an id outside `PERMISSIONS` — test: `access-decisions.db.test.ts` statement counter
      unchanged, the throw on an injected row; negatives: catch-and-skip the unknown row and
      the throw test fails; watched.

## 2. Custom role store and routes (after `wbs-permissions` slice 4)

- [ ] 2.1 Red: `access-role-store.db.test.ts` for `createAccessRole`, `updateAccessRole`,
      `deleteAccessRole`, `listAccessRoles` with the invariants in one transaction:
      `name_taken`, `reserved_name`, `permission_kind_mismatch`, `unknown_permission`,
      `empty_set`, `built_in`, `in_use { grants }`; the actor-subset rule and the
      organization-kind permission rule (CP5); audit rows with added/removed. Green: the
      store on both stores through the conformance suite. Negatives: drop the `in_use`
      count and a granted role is deleted (its grants dangle: the FK refuses, so the test
      watches `FOREIGN KEY constraint failed` turn into a clean `409`); drop the subset
      rule and an `org-admin` stores `organization.manage_security`; drop `built_in` and
      `project-manager` is renamed; each watched.
- [ ] 2.2 `grantRole` with a custom role: `404 unknown_role` for another organization's
      role, the set-subset escalation rule, the cap on a credential holding a custom
      manager role — test: extend `access-grants.db.test.ts`; negatives: drop the
      organization predicate on the role lookup and a foreign role is granted; replace the
      subset test with the old level comparison and a `project-manager` grants
      `project.grant` it lacks at the package; watched.
- [ ] 2.3 `@wbs/contracts` shapes for the four routes (refusal codes typed once, P10's
      `forbiddenRefusal` reused), be-01 routes under the organization, mcp-01 exclusion
      list extended, `openapi-tools.test.ts` count asserted — test: route tests for every
      refusal and the audit rows; `contracts-boot-memory.test.ts` still under 500 MB.
- [ ] 2.4 Audit rebuild: three actions and the `access_role` subject kind, folded into
      `widen_organization_audit_access` or its own compatible rebuild with `down.sql`
      refusing while a new-action row exists — test: insert refused before, accepted
      after; negative: the refusal removed and `down.sql` deletes an `access_role_created`
      row; watched.

## 3. fe-01

- [ ] 3.1 Settings → Access → Roles: built-ins read-only, custom role editor (checkboxes
      by kind, "copy from…" filling the editor only, CP2), grant count with a link, delete
      disabled with the `in_use` reason; the members page role picker lists custom roles
      beneath the built-ins of the same kind — Playwright scenarios for create, edit, copy,
      refused delete; rendered states for loading, empty and query failure.

## 4. Verify

- [ ] 4.1 `verify.md`: commands, outputs, the R5 proofs of 1.1–2.4; `openspec validate
    --all --json` 0 invalid; dev window: create a custom role on dev, grant it to a test
      account, observe the 403/200 pair of the budgets-only scenario, revoke, delete.
