## Why

WBS's legacy access lets authenticated users read every project and share directory records. Companies need ownership and membership boundaries. Browser tabs also share cookies: after one switches organizations, another must not read or mutate the new organization using its old screen.

## What Changes

- Every project, directory record, external system and saved plan belongs to one organization; dependent records, references, exports, history, schedules and events remain within it.
- Verified users create an organization as first super-admin or request membership through a matching verified domain. Matching never grants access automatically. Roles govern resource and administration actions.
- Invitations are addressed, expiring, revocable and single-use. Domain ownership requires DNS proof and excludes public email domains.
- Browser organization selection is explicit and bound to the verified credential. Switching retires organization state; resource mutations require an expected organization, and stale context refuses without retry. Reads carrying that expectation also refuse a mismatch.
- Legacy content and users enter one organization after inventory identifies Dany unambiguously. Backend, gateway and MCP enforce current membership.

## Non-Goals

Social login; Auth0 email/password or email-code login; Auth0 Organizations; provider migration; enterprise SSO policy; SCIM; automatic domain or SSO joining; cross-organization transfer. C1/C2 do not activate a deployment or configure live Auth0, mail or DNS.

## Constraints

Auth0 remains the identity provider; WBS owns policy and stable local identity mappings. Password accounts retain IDs and establish verified email through address proof or an explicit Auth0 link proving both sessions. Development identities cross the same authorization boundary. Blue/green shares SQLite: migrations are additive and paired; organization-unaware releases must never serve after activation. C1/C2 preserve preactivation behavior, existing SSO/session-policy refusals, the explicit browser authority setting and operator-controlled rollout. Local fixtures cannot establish live-provider readiness.

## Capabilities

### New Capabilities

- `organization-access`: ownership, roles, active context and authorization.
- `organization-onboarding`: creation, invitations, join requests and frontend administration.
- `organization-domains`: verification and domain-aware signup.
- `organization-realtime`: subscriptions, presence, replay and revocation.
- `organization-mcp`: bound authorization and tools.
- `organization-migration`: backfill, activation and rollback safety.

## Domain Terms

Organization, membership, active organization, expected organization, role, super-admin, verified domain, join request, invitation, legacy organization.

## Decisions Recorded

None requiring a new ADR. C1/C2 defaults were adopted by the coordinator on 2026-10-13 under standing authorization.

## Impact

WBS contracts, core, storage, be-01, gw-01, mcp-01, fe-01 and deployment gates.
