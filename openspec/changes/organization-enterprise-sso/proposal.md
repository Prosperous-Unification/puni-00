## Why

A company cannot require its identity provider for WBS, manage directory membership, or bound sessions; `organization-ownership-and-access` deferred all three. Leavers retain access until manually removed.

## What Changes

- A super-admin records an **enterprise connection** on a verified domain: the Auth0 connection name, strategy `samlp` or `oidc`, a login slug and an enforced flag.
- The Company sign-in browser panel supports scoped editing and confirmed removal with authoritative server state.
- Login with `?organization=<slug>`, or with an email on that verified domain, sends `connection=<name>` to Auth0.
- **Enforced SSO**: WBS issues and resolves the organization's context only for an identity whose `sub` starts with the connection's subject prefix. Others get typed `403 sso_required` with the SSO link; their other organizations are unaffected.
- WBS serves SCIM 2.0 `Users` for each organization under a provisioning token that a super-admin issues, rotates and revokes, storing only a digest of it. POST creates a **pending membership**, which the first SSO login activates. Deactivation or DELETE removes the membership and ends that user's access to the organization in one transaction.
- **Session policy**: `max_session_seconds` and `reauthenticate_after_seconds` per organization, checked at context issue and resolution. A typed refusal sends the user through a `prompt=login` sign-in.
- Every connection, token, policy and provisioning change writes one `organization_audit` row in the same transaction. If that row cannot be written, the change fails.

## Non-Goals

Auth0 tenant changes; Auth0 Organizations; JIT organizations; mapping groups to roles; SCIM `Groups`; per-connection role defaults; unlinking identities.

## Constraints

Additive migrations with `down.sql`, because blue and green share SQLite. Identity stays `(issuer, subject)`, and an email never merges accounts. The prefix check must be provable with a fixture `sub`. Implementation waits for #330 (browser authority in production) and #326 (social sign-in). Auth0 entitlement, the first customer connection and the SCIM token handover belong to Dany.

## Capabilities

### New Capabilities

- `organization-sso`: connection records, login routing, enforcement by subject prefix.
- `organization-scim`: provisioning tokens, the SCIM `Users` subset, pending membership, deprovisioning.
- `organization-session-policy`: per-organization session bounds and their refusals.
- `organization-audit`: audit rows for SSO, SCIM and policy acts.

## Domain Terms

Enterprise connection, Subject prefix, Enforced SSO, Pending membership, Provisioning token, Session policy.

## Decisions Recorded

[Enterprise SSO is a WBS connection record](../../../docs/adr/0049-enterprise-sso-is-a-wbs-connection-record.md) (proposed).

## Impact

be-01 auth, organization context and SCIM routes; contracts; store-sqlite (four tables, widened audit check); fe-01 settings and refusal states; mcp-01 delegation.
