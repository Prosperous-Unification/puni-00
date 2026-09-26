## Why

WBS currently lets authenticated users read every project and shares directory records across the deployment. A company cannot use it beside another company without exposing its work. Identity sign-in alone does not establish who owns a resource or who may act for an organization.

## What Changes

- Every project, directory record, external system and saved plan belongs to one organization. Reads, writes, exports, history, scheduling, events and references stay within that boundary.
- A new user creates an organization as its first super-admin, or sees a matching verified organization domain and requests membership. A matching domain never grants access automatically.
- Organization members use one active organization at a time. Super-admin, admin, member and viewer roles govern actions; administrators manage invitations, join requests and member roles through organization pages.
- WBS verifies domain control through DNS TXT challenges and refuses public email domains. Invitations are addressed, expiring, revocable and single-use.
- Existing shared content and users enter one legacy organization after an inventory identifies Dany's account unambiguously.
- be-01, gw-01 and mcp-01 enforce current organization membership, including live sockets and MCP grants.

## Non-Goals

Social login with Google, GitHub or Apple; Auth0 email code or email/password login; Auth0 Organizations; provider migration; enterprise SSO policy; SCIM; automatic domain or SSO joining; cross-organization content transfer.

## Constraints

Auth0 remains the identity provider; WBS owns organization policy and stores stable issuer/subject mappings. Existing first-party password and development identity paths must pass the same authorization boundary. Blue/green processes share SQLite: schema expansion is additive, each migration has `migration.sql` and `down.sql`, and organization-unaware releases must never receive traffic after tenancy activation. Public-domain refusal, invitation-only matching, and one legacy organization owned by Dany are product-owner defaults recorded here as assumptions for review.

## Capabilities

### New Capabilities

- `organization-access`: organization ownership, roles, active context and backend authorization.
- `organization-onboarding`: creation, invitations, join requests and frontend administration.
- `organization-domains`: DNS verification and domain-aware signup.
- `organization-realtime`: gateway subscriptions, presence, replay and revocation.
- `organization-mcp`: organization-bound MCP authorization and tool calls.
- `organization-migration`: legacy backfill, staged activation and rollback safety.

## Domain Terms

Organization, membership, role, super-admin, verified domain, join request, invitation, legacy organization, project-step allowance, charged estimate.

## Decisions Recorded

None; the product owner fixed the identity and organization boundaries for this change.

## Impact

WBS contracts, storage, be-01, gw-01, mcp-01, fe-01, shared authorization, SQLite migrations and deployment rollback checks.
