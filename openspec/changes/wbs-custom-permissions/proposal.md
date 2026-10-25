## Why

`wbs-permissions` seeds nine access roles and decides access by a numeric level. Dany
needs organizations to shape their own roles (2026-10-25, on P4: "AWS has a good flexible
model for custom permissions plus default ones"). A level threshold cannot express "manages budgets, writes no package", and retrofitting
sets onto a shipped threshold would rewrite the evaluator once.

## What Changes

**Access decision**

- From: `may` answers "effective level ≥ the permission's minimum level".
- To: `may` answers "the permission is in the effective set", the union of the sets of
  every grant that reaches the scope. Built-in roles are seeded as sets from the permission
  matrix. This lands inside `wbs-permissions` slice 1 so the threshold never ships (CP1).

**Catalogue**

- From: nine built-in roles, immutable.
- To: the nine built-ins (AWS managed policies: reserved, read-only) plus
  organization-owned custom roles (customer-managed policies): a unique name, an object
  kind, a set from the 27 permissions. A custom role starts empty; "copy from a built-in"
  is UI only (CP2).

**Administration**

- Audited routes list, create, edit and delete custom roles. Editing a set changes every
  grant of the role at once; a role in use cannot be deleted (CP6).
- A role holding any organization-kind permission needs
  `organization.manage_organization_roles` to define; any other needs
  `organization.manage_access`. Nobody puts a permission they lack into a role, and the
  granting escalation rule becomes "the role's set is a subset of the granter's" (CP5).

**Machine cap**

- From: `MIN(level, 2)`.
- To: intersection with the contributor set, the permissions-boundary idea (P12, CP8).

Depends on `wbs-permissions`: its slice 1 carries the tables and evaluator; this change's
slices follow its slice 4.

## Non-Goals

Explicit deny, access stays additive (CP3); conditions, resource patterns or per-object
exceptions beyond the grant's scope (CP4); editing built-in roles (P18); roles on spaces
(P14); a permission finer than the 27 of `permission-matrix.md`.

## Constraints

Additive migration folded into `add_access_grants` with its guarded `down.sql`. Every
check inside the write's transaction, every refusal with a negative and a `Proof:` comment,
one statement per effective-set read. Custom-role routes are excluded from MCP tools.

## Capabilities

### New Capabilities

- `custom-roles`: catalogue tables, role administration, audit, fe-01 roles page.

### Modified Capabilities

- `permissions` (delta of `wbs-permissions`, not yet synced): the decision is set
  membership; amended in place in that change.

## Domain Terms

**Access role** amended; **Built-in access role** and **Custom access role** added.

## Decisions Recorded

No ADR. CP1–CP6 fixed by Dany on 2026-10-25; CP7–CP12 assumed, overrulable by id.

## Impact

`@wbs/domain`, `@wbs/core`, `@wbs/store-sqlite`, `@wbs/contracts`, be-01, fe-01;
`wbs-permissions` design, tasks, matrix and `permissions` spec.
