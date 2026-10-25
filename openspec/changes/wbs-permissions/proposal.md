## Why

One membership role governs everything in an organization: a member writes every project,
a viewer reads all of it, and nothing isolates one client engagement from another. Tenants'
agents and contractors must see one engagement only, and `wbs-work-packages` gives WBS the
project → work package shape that access must follow.

## What Changes

**Authority**

- From: `organization_membership.role`, read once per request.
- To: access grants (principal, grant scope, access role), nine seeded scope-prefixed roles
  (E7), and `may(scope, permission)` evaluated inside the write turn.
- Impact: breaking (E8); dev data is backfilled so today's behaviour holds until the
  backfilled grants are removed deliberately.

**Plain membership**

- From: a member writes everything.
- To: a member sees only their own agents and credentials until granted, once the
  backfill is revoked.

**Reach and principals**

- From: one organization-wide role held by accounts.
- To: grants at organization, project or work package to an account, a machine
  credential, an access group or every current member; the strongest wins down the chain
  (E9); organization-wide grants only read a restricted work package; a machine credential
  holds only its own grants, capped at contributor.

**Visibility and administration**

- From: a foreign project answers 404; `changeMemberRole`.
- To: an unreadable work package is absent from lists and 404 by URL; a missing permission
  answers 403 naming it; audited grant, revoke and access-group routes on the members page.

Depends on `wbs-work-packages` (#698): slices 3 to 7 follow its renames.

## Non-Goals

Deny rules; custom roles; grants on spaces; group sync from SSO or SCIM; nested groups;
claim semantics; production activation; budget behaviour (this change only gates
`setBudget` and `clearBudget`); the reserved `project.manage_dependencies`; renaming access
roles at runtime (E7's renaming is the scope-prefixed vocabulary, P18).

## Constraints

Additive migrations with guarded `down.sql`; blue and green share one SQLite file, so the
role column stays until no release reads it. Every check runs inside the write's own
transaction; every refusal ships with a production-path negative and a `Proof:` comment.
The machine cap applies at every check and refuses a machine principal every grant write.

## Capabilities

### New Capabilities

- `permissions`: catalogue, grants, groups, effective role, visibility, administration,
  backfill, audit.

### Modified Capabilities

- `organization-access`: the role matrix becomes the permission matrix.
- `space-authorization`: space writes need `organization.manage_spaces`.
- `machine-credentials`: A23's member cap becomes the contributor cap.
- `organization-audit`: grant and group acts.

## Domain Terms

Nine added; four amended, one renamed, one retired.

## Decisions Recorded

No ADR. E7–E9 fixed by Dany; P1–P18 assumed, overrulable by id (design.md); P17 (machine
credentials as grant subjects, overriding P2) and P18 await Dany's confirmation.

## Impact

`@wbs/*` libraries, be-01, gw-01, mcp-01, fe-01.
