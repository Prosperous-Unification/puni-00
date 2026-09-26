## Context

Current project reads are deployment-wide; `project.owner_id` controls restricted writes, and `project_access` is recent-open history. Directory catalogs have global unique names. be-01 accepts current Auth0 OIDC identity and existing first-party password sessions; gw-01 validates subscription names but not project membership; mcp-01 replaces its own credential with an upstream token before calling be-01. Browser OIDC transaction and refresh state is in memory. Production's issuer and user inventory remain unverified.

## Goals / Non-Goals

**Goals:** Make organization ownership and current membership the sole WBS resource authority across HTTP, sockets and MCP; preserve existing local user IDs and legacy relationships; permit a later identity-provider swap through stable `(issuer, subject)` mapping.

**Non-Goals:** Change login methods, migrate providers, add Auth0 Organizations, enable SSO JIT or SCIM, transfer content between organizations, or solve durable browser session storage in this stage.

## Decisions

### Ownership and roles

Add local organization, membership, external-identity, invitation, join-request and domain-verification records. Assign organization ownership to every root resource; dependent rows inherit through their parent but every query, reference and event path must resolve the same organization. Organization-scoped catalog names require replacement uniqueness structures staged for coexistence with old global indexes. Keep `project.owner_id` as creator/steward and `project_access` as history. The [role matrix](specs/organization-access/spec.md) is normative. WBS membership governs roles; current IdP scopes remain an additional ceiling until callers migrate. A super-admin may recover a restricted project, with the action recorded. An ownerless organization caused by external deprovisioning needs a separate audited recovery path; ordinary role changes cannot create one.

### Active organization and identity

Auth0 only establishes verified `(issuer, subject)` and, for onboarding, verified email. Resolve that pair to a stable WBS user; do not merge existing accounts on email alone. A browser selects an organization through a same-origin endpoint that checks current membership and binds the choice to its WBS session; switching rotates that context, clears organization-scoped frontend caches and requires socket reconnection. Bearer clients receive a short-lived WBS-signed organization context bound to the verified identity and audience. A raw Auth0 bearer token can authenticate onboarding or request a WBS context, but cannot authorize resource access alone. Internal gateway and MCP calls use audience-specific, short-lived signed delegation; be-01 verifies signature, audience, identity binding, organization and current membership. Caller-controlled headers and route IDs cannot select authority. A user with zero memberships can only use onboarding routes. Local development identity needs an explicit seeded membership; production-local mode remains forbidden.

### Onboarding and administration

Once the identity has a verified email, look for a matching invitation, then an exact verified domain. A matching domain routes to the organization with a join-request action and forbids creation by that address; without a match, creation atomically creates organization and first super-admin membership. Creating an organization does not claim a domain. Invitations contain normalized recipient email, organization, role, random token digest, expiry, revocation and consumption state; 7-day default expiry is an implementation assumption. Acceptance compares the current verified email and consumes atomically. Join requests are unique while pending; approval rechecks domain verification, email and administrator authority and issues one invitation. Only acceptance creates membership, including after company SSO. Admins can grant viewer/member only. The members page and domain settings render permission loss and query failure explicitly.

### DNS verification

Normalize domains to lowercase ASCII IDNA form, reject invalid/public suffix, relay and maintained public-provider entries, and compare exact domains. A super-admin requests a 256-bit random token for `_wbs-verification.<domain>`; store only its digest, bind it to organization and domain, expire it after 24 hours and recommend DNS TTL 300 seconds in the UI. Rotation invalidates older challenges. Query authoritative DNS with a bounded timeout and require an exact TXT value; a provider outage or malformed response is an explicit failed verification, not proof. Pending claims do not reserve a domain. A unique verified-domain key and transactional claim decide races; the loser receives typed 409. Recheck every seven days. Warn on DNS failure; suspend onboarding after 14 days without successful proof. Suspension leaves existing members and content intact. Release requires current super-admin authority, and transfer requires a new claim. The public-domain list is maintained as a reviewed, versioned policy input; unreadable or missing policy blocks claims and checks.

### HTTP, gateway and MCP enforcement

Place authorization at the application service boundary and require repository queries to carry organization scope; Elysia controllers map expected auth, permission, missing-resource and conflict outcomes to typed 401/403/404/409. Every list/detail/write/export/import/batch/scheduler/history path and referenced ID must be checked. A gateway subscription, presence query, replay and forwarded command obtains be-01 authorization for its bound user/org; event routing includes organization. Recheck queued replay before delivery, invalidate sockets on membership changes and cap authorization leases so access ends within five seconds despite a dropped notification. A switch creates a new socket. mcp-01 binds selection to consent, code, grant, refresh family and access session; the signed delegation reaching be-01 includes local user ID, upstream issuer/subject, org ID, OAuth client ID, grant/family ID, scopes, audience and expiry. Its direct-upstream-token path is refused for resource tools unless it can establish the same binding. Current membership is checked on each tool request and refresh.

## Risks / Trade-offs

- Existing global catalog uniqueness and old writers require a bridge release. Do not open new organizations until every old reader and writer has drained and reconciliation passes.
- The current in-memory OIDC stores remain a restart limitation. Their durability is outside stage A; an organization context must never outlive its underlying session.
- The five-second gateway bound requires measured lease and invalidation behavior. Fail closed if membership checking becomes unavailable.
- Production may use a different identity mode or have users whose effective rights do not map cleanly to a role. Inventory is a hard activation gate.

## Migration Plan

1. **Inventory:** inspect deployed SHA, sanitized issuer/auth mode, users, Dany candidates, project owners, global catalogs, saved plans and relationship graph. Record a reviewed manifest; refuse zero or multiple Dany matches or access mappings that cannot preserve effective rights.
2. **Expand:** ship additive `migration.sql` and paired `down.sql` for identity mappings, organizations, membership and onboarding records plus nullable ownership mappings/shadow catalog structures. Preserve old columns and old-reader compatibility; test up/down on a copy of production-shaped data. No SQL is authored in this spec.
3. **Bridge:** deploy a version that writes legacy organization mappings for every new resource while preserving old behavior. Backfill existing rows idempotently, drain old writers, then reconcile again; require zero unmapped roots, zero cross-organization references and reviewed role parity.
4. **Enforce:** deploy organization-aware be-01/gw-01/mcp-01/fe-01 before activating the durable isolation marker. The deploy executor must prohibit routing an organization-unaware version once marked. Activate only after all old processes drain; enable creation of second organizations afterward.
5. **Rollback:** before activation, preflight and reverse paired migrations in dependency order without losing legacy records, and report the manual completion command on failure. After activation, both application downgrade and schema reversal across the marker refuse before changing routing or schema, even if second-organization data was deleted. Recover with an organization-aware release or forward repair. Test the actual swap abort path, which currently can continue restoring routing after schema reversal failure.

## Open Questions

1. Which exact production user ID is Dany's, and what are existing users' effective rights? Recommend: resolve from a reviewed inventory; block activation until unambiguous.
2. Which existing catalogs and saved-plan tables have global uniqueness or indirect references that need shadow structures? Recommend: finish a relation-by-relation inventory before migration design; refuse activation if any owner is unmapped.
