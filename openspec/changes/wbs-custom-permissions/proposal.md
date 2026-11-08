## Why

`wbs-permissions` seeds nine access roles and decides access by a numeric level. Dany
needs organizations to shape their own roles (2026-10-25, on P4: "AWS has a good flexible
model for custom permissions plus default ones"). A level threshold cannot express
"manages budgets, writes no package", and retrofitting sets onto a shipped threshold
rewrites the evaluator.

## What Changes

**Access decision**

- From: `may` answers "effective level ≥ the permission's minimum level".
- To: `may` answers "the permission is in the effective set", the union of the sets of
  every grant reaching the scope. Built-ins are seeded as sets from the permission
  matrix. This lands inside `wbs-permissions` slice 1, so the threshold never ships (CP1).

**Catalogue**

- From: nine immutable built-in roles.
- To: the built-ins (AWS managed policies) plus organization-owned custom roles
  (customer-managed policies): a unique name, an object kind, a set from the
  enumerated vocabulary of `permission-matrix.md` (CP2, CP4).

**Administration**

- Audited routes list, create, edit and delete custom roles; delegated granters read the
  roles they may grant (CP6, CP19).
- Nobody defines, edits, grants or hands out through group membership a permission they
  lack; organization-kind permissions need `organization.manage_organization_roles`
  (CP5, CP13, CP15).
- One human always keeps the built-in super-admin role (CP14).

**Machine cap**

- From: `MIN(level, 2)`.
- To: intersection with the contributor set, a permissions boundary (CP8).

Depends on `wbs-permissions` (its slice 1 carries the tables and evaluator; slices here
follow its slice 4) and on #723, which merges first.

## Non-Goals

Explicit deny (CP3); conditions, resource patterns or per-object exceptions (CP4);
editing built-ins (P18); roles on spaces (P14); a permission finer than the vocabulary.

## Constraints

Additive migration folded into `add_access_grants` with its guarded `down.sql`. Every
check inside the write's transaction, every refusal with a negative and a `Proof:`
comment, one statement per read. Role routes are excluded from MCP tools.

## Capabilities

### New Capabilities

- `custom-roles`: catalogue tables, role administration, audit, fe-01 roles page.

### Modified Capabilities

- `permissions` (delta of `wbs-permissions`, not yet synced): the decision is set
  membership; amended in place in that change.

## Domain Terms

**Access role**, **Access grant**, **Machine cap** amended; **Effective role** renamed
**Effective permissions**; **Built-in access role** and **Custom access role** added.

## Decisions Recorded

No ADR. CP1–CP6 fixed by Dany on 2026-10-25; CP7–CP20 assumed, overrulable by id.

## Impact

`@wbs/domain`, `@wbs/core`, `@wbs/store-sqlite`, `@wbs/contracts`, be-01, fe-01, mcp-01;
`wbs-permissions` design, tasks, matrix note and `permissions` spec.
