## Context

What exists, read on 2026-10-21:

| Need                                 | Exists today                                                                                                                                           | Missing                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| A machine that writes as itself      | `external_identity (issuer, subject, user_id, person_id)`; `link-credential-cli.ts` writes it inside the be-01 container                               | a tenant-facing record: **Machine credential**               |
| A person a machine acts as           | `person.kind = agent`, `person.account_id` (D5), the claim decision's `pinnedPersonId` (`claim.ts`)                                                    | nothing                                                      |
| Verifying a bearer                   | `@wbs/auth` `token-verifier.ts`: one issuer, one audience, one cached JWKS from `AUTH_ISSUER_DISCOVERY_URL`                                            | a second issuer, a non-JWT secret                            |
| Scoping a machine token              | `authentication.feature.ts`: a groups-less verified token reads its link and takes `scopesOfRoles` of the account (D6b)                                | scopes capped for a machine; organization binding            |
| Binding a request to an organization | `organization-access.ts` `resolve`: a delegation's organization or the browser session's; a raw Bearer is `no_active_organization`                     | the credential's organization as a direct context            |
| A human authorizing an MCP client    | mcp-01 `oauth.ts`: upstream login, `organizationsFor` consent, an organization choice page, a refresh family and sessions bound to one organization    | choosing an agent person at consent: **Consent credential**  |
| be-01 learning who an MCP call is    | `/internal/mcp/{organizations,delegation,authority}`: memberships, a single-use delegation naming user, organization, client, family; authority reread | the delegated person and the credential it rides on          |
| A secret shown once, digest stored   | `organization_scim_token` (`digest` SHA-256 hex, `expires_at`, `revoked_at`, two live, 24 h rotation overlap)                                          | the same shape for a credential                              |
| A verified company IdP               | `organization_sso_connection` (`strategy` `samlp`/`oidc`, `proven_at`)                                                                                 | an issuer URL and JWKS to verify against: **Trusted issuer** |
| An audited administrative act        | `organization_audit`, widened once by compatible table rebuild (`20261012090200`)                                                                      | five actions and two subject kinds                           |
| An admin page per organization       | `organization-page.tsx` composes one panel per concern; `provisioning-tokens-panel.tsx` shows a secret once; the people page lists agent persons       | a credentials panel; credentials under a person              |

Three facts shape the design. First, `AuthenticatedUser.delegation` is documented as "the
organization a verified WBS-signed delegation **or direct context** bound this request
to", and `resolve` already prefers it over the session: a machine credential is such a
direct context, so no new binding mechanism is needed. Second, `person.account_id` is what
lets delegated claims under a subtree claim come "from the same account" (D7): a credential
that acts as its person's bound account keeps every claim rule byte for byte, and is also
what A7 means by "the agent persons bound to their own account". Third, an MCP family is
already a durable, revocable, organization-bound authority whose every call asks be-01 for
a delegation and whose every request rereads its authority; adding a person to it is a
column and a check, not a new mechanism.

## Goals / Non-Goals

**Goals:** a member admits, rotates and revokes a machine for their own agents, an admin for
every agent, without an operator; a human who signs in at the MCP consent page can
authorize an agent person instead of themself; one verification path admits an API key, a
trusted issuer's token and a consent-issued family; a
machine acts as its person, scoped to its organization and capped below administration;
every act is audited; our fleets move onto it.

**Non-Goals:** quotas, hosted compute, billing, SCIM for agents, production activation, the
credential epoch (6.5), how humans log in (Auth0 connections per organization unchanged),
Auth0 machine-to-machine applications as a source (A21), MCP `client_credentials`, SAML as
an OIDC source, changes to claims.

## Decisions

A1 to A8, A21 and A22 are Dany's and fixed (the task brief of 2026-10-21 and his additions
of 2026-10-22). A9 to A20 are **assumed** by this draft; each is overrulable by id without
moving another decision unless noted. A14 is superseded by A22; A19 is withdrawn by A21.

**A1. Tenant = WBS organization**, one deployment, row-level scoping.

**A2. A machine credential is an organization-scoped record**, pinned to exactly one agent
person of that organization. Persons, claims, occupancy and delegated claims are unchanged.
It replaces `link-credential-cli.ts`; our fleets are the first tenant.

**A3. Two headless sources behind one verification path:** `api_key` (WBS-issued, ships
first) and `oidc` (a trusted issuer or a proven `oidc` enterprise connection; SAML cannot),
beside the interactive `mcp_consent` source of A8. There is no Auth0 machine-to-machine
source (A21).

**A4. Lifecycle:** create, list, rotate with a bounded overlap, revoke, last-used, audit
rows in `organization_audit`. The credential epoch stays the kill switch, out of scope.

**A5. Authorization of use:** a token acts as its pinned person only and never gains its
issuer's rights; unlinked or revoked tokens are `401 unknown_identity`; a claim for another
person is `credential_not_for_person`.

**A6. UI:** a credentials panel under the organization on `@ui/core-01`/`@ui/saas-01`;
states only.

**A7. Issuance by members, not only admins.** Any member creates, rotates and revokes
credentials for the agent persons bound to their own account; an admin or super-admin for
every agent person of the organization. A credential records its issuer (the human
account) and its person; the token never gains the issuer's rights. Audit reads "<agent
person> acted, credential issued by <account>".

**A8. A fourth, interactive source: the MCP consent page.** After the human signs in with
the tenant's own method, the consent page offers "authorize as yourself" or one of the agent
persons bound to the signed-in account. Choosing an agent mints the refresh family and
sessions **for that agent person**, with the human account as issuer, so the agent keeps its
own session alive through refresh exactly as a human session does; the family appears under
the agent person as a credential revocable from the people page. This is the owner's
primary mental model ("you auth with Google and it authenticates the agent"); the headless
sources are its equivalents. It is a row of the same table and lifecycle.

**A9. One table with a source discriminator, plus one child table for API-key secrets.**
`machine_credential (id, organization_id, person_id, issued_by, source, name, issuer,
subject, audience, trusted_issuer_id, mcp_family_id, last_used_at, revoked_at, audit
columns)` with `source IN ('api_key', 'oidc', 'mcp_consent')` and CHECKs per source:
`api_key` has null issuer, subject, audience, trusted issuer and family; `oidc` has issuer,
subject and `trusted_issuer_id`, audience nullable; `mcp_consent` has `mcp_family_id` only. `issued_by` references `users` and is the
account that created it (A7). A partial unique index on `(issuer, subject)` where
`source = 'oidc'` keeps a pair on one credential deployment-wide, as
`external_identity_issuer_subject` does; `mcp_family_id` is unique.
`machine_credential_secret (id, credential_id, digest, expires_at, created_at)` holds the
API-key digests, indexed by `credential_id` and read only through it (A22), `digest`
CHECKed like `organization_scim_token.digest`, at most two live per credential. Why not per-source columns for the secret too: rotation needs two
digests with their own expiries, and a row per secret is what the provisioning tokens
already proved. Why not a child table per source: the verification path reads one
credential row by one of three lookups (primary key, pair, family), and a later JWT
source would differ only in how its key set is found. Why not reuse `external_identity`: it
is the sign-in table of human accounts, has no organization and no revocation, and a browser
pair in it must never be mistaken for a machine.

**A10. Machine credentials are outside the credential rules.** Enforced SSO
(`sso_required`) and the session policy (`reauthentication_required`) judge a human
sign-in; a headless machine has none to reauthenticate. The organization's control is the
issuer who created it, the trusted-issuer gate (A16) and revoke. `authentication` on a
machine principal is `{ kind: 'machine', credentialId, personId }` for both `api_key` and
`oidc` (slice 5 as built: the draft's `upstream` for `oidc` would have escaped A23's role
cap, which reads the `machine` kind); the rules return `ok` for a machine
principal, with a negative that a machine of an enforcing organization is still admitted.
The `mcp_consent` source is the exception: its family was opened by a human sign-in, so the
rules keep judging that sign-in's upstream pair as they do today (an enforcing organization
admits only a family whose human signed in through its connection; a session policy still
refuses every MCP delegation until grant-lifecycle evidence exists). Consequence: an
organization that enforces SSO still runs headless machines from its own trusted issuer,
which is the point of the OIDC source.

**A11. Rotation is the `api_key` source's act.** `rotate` issues a second secret and gives
the current one `expires_at = now + rotation window`; the credential then has two live
secrets until the window ends. The `oidc` source rotates at its issuer and `mcp_consent` rotates by
refresh, with nothing to change in WBS, so `rotate` on them answers
`409 rotation_at_issuer`. A subject change is a new credential.

**A12. A credential acts as the account its person is bound to, with capped scopes.** The
principal's `id` is `person.account_id`; creation refuses an unbound person
(`409 person_not_bound`) and a person of another organization (`404 unknown_person`); a
member may name only a person bound to their own account (`403 forbidden` otherwise, A7);
`patchPerson` to unbind or rebind a person with a live credential is refused `in_use` with
`machineCredentials` count, like deletion. Scopes are exactly `read` and `write`: never
`editor`, whatever role the account holds, and every organization administration route
refuses a machine principal `403 insufficient_scope` as it refuses a delegation today
(`principal.delegation !== undefined`). Why via the person: D5 and D7 already make the
account the unit that claims and delegates, and `created_by`, journal and audit columns
reference `users`; a synthetic actor would reach every one of them. For a member-issued
credential the issuer and the bound account coincide; for an admin-issued one they differ,
and only the bound account's reach, capped, is what the token gets (A5, A7). Why capped: A5
says a token never gains an issuer's rights; the cap is the mechanism, not a per-credential
role. Scopes alone do not cap a role: the claim-admin bypass, `patchPerson` binding and
project-edit checks read the organization role, so A23 caps that too.

**A13. Verification path order.** For a request with `Authorization: Bearer <token>` and
no cookie:

1. The token starts with `wbs_mk_`: it must be `wbs_mk_<credential id>.<secret>` (A22).
   Split at the first `.`; a token without one, or with an id that is not a credential id,
   is `401 unknown_identity` with no read. Read `machine_credential` by primary key, require
   it unrevoked, SHA-256 the secret and compare it in constant time against each of that
   credential's unexpired secrets (two inside a rotation window); no match is
   `401 unknown_identity`. No digest scan, no other header, never a JWT parse.
2. Otherwise decode the JWT header and `iss` without verifying. `iss` equal to the
   configured issuer: verify with today's verifier (audience, RS256, JWKS). A token with a
   groups claim is a browser login as before. A verified token without one is
   `401 unknown_identity`, as an unlinked machine token is today: the configured issuer
   mints human sign-ins only, nothing links its other tokens, and no account is minted
   (A21). No credential lookup happens on this branch.
3. `iss` equal to a trusted issuer of any organization: verify against that issuer's cached
   JWKS with the credential's audience (or the trusted issuer's default audience), read the
   credential by the pair with source `oidc` and that trusted issuer; a credential of another
   trusted issuer with the same issuer URL does not match. None is `401 unknown_identity`.
4. A WBS-signed `wbs-be-01/via-mcp-01` delegation keeps its own verifier; one that names a
   person is admitted only while its `mcp_consent` credential is unrevoked (A20).
5. Any other `iss`, an unverifiable token or a key set that cannot be fetched:
   `401 invalid_token`; a JWKS fetch failure is reported, never retried into a default.

A matched credential yields a principal with `id = person.account_id`, scopes `read`,
`write`, `delegation`-slot direct context `{ organizationId }` of the credential,
`pinnedPersonId`, and `authentication` per A10. `last_used_at` is written in the same request
when older than 60 s (coarse on purpose: one write per credential per minute, not per
request) and a failed write is a server fault like any other. Membership of the account in
the credential's organization is rechecked by `resolve` as today; an account removed from the
organization is `403 not_a_member` with the credential intact.

**A14. Superseded by A22.** (It fixed the key as `wbs_mk_` + secret, looked up by digest.)

**A15. Rotation window: 24 hours, fixed.** The provisioning tokens' window, reused. A
second `rotate` during the window is `409 rotation_in_progress`; revoke ends both secrets
at once. Configurable windows are a quota-shaped feature, a non-goal.

**A16. A trusted issuer is an organization record; a proven `oidc` connection is a gate,
not a proof of the URL.** `organization_trusted_issuer (id, organization_id, issuer,
jwks_uri, default_audience, sso_connection_id, audit columns)`, unique on
`(organization_id, issuer)`, administered by admins only (an issuer admits subjects for
every person of the organization, so it is not a member's act). Registering one discovers
`<issuer>/.well-known/openid-configuration` once, requires `issuer` to equal the document's
and records its `jwks_uri`; an unreachable or disagreeing document refuses
`409 issuer_unreachable` / `409 issuer_mismatch` and stores nothing. With `sso_connection_id`
the connection must be the organization's, `oidc` (`409 issuer_not_oidc` for `samlp`) and
proven (`409 sso_connection_unproven`). WBS stores only the Auth0 connection's name, so it
cannot prove the URL belongs to that connection; the proof that matters is at verification
(A13 step 3), and the connection check decides who may register, which is what A3 asks.
Removing a trusted issuer with live credentials is `409 in_use` with the count. The
configured issuer (`AUTH_ISSUER_DISCOVERY_URL`) cannot be registered (`409 issuer_reserved`):
it is the human sign-in issuer, and PUNI's own machines use the self-serve sources like every
tenant's (A21).

**A17. Audit vocabulary.** Actions `machine_credential_created`, `machine_credential_rotated`,
`machine_credential_revoked`, `trusted_issuer_registered`, `trusted_issuer_removed`; subject
kinds `machine_credential`, `trusted_issuer`; detail carries source, person id, issuer
account (`issuedBy`), name, issuer URL, client name for `mcp_consent` and the secret id,
never a secret, a digest or a subject. The actor is the issuing account, so a row reads
"<person> acted, credential issued by <account>" (A7). Same transaction as the act, same
compatible table rebuild as `20261012090200`, `down.sql` refusing while any new-action row
exists. Last use is not audited. A verification refusal is not audited (it is a 401 on a
hot path); the credential epoch, not the audit, answers abuse.

**A18. The operator links retire with nothing to migrate.** No migration copies
`external_identity` rows with `person_id` into `machine_credential`: PUNI's own fleets are
onboarded as the first tenant through the self-serve path, exactly as a customer would be (an
admin creates API-key credentials for the agent persons through the panel or the API, slices
1 and 2; laptop Claude Code authorizes its agent person at the MCP consent page, slice 3).
The new release never reads `external_identity.person_id`, so a pinned row admits nothing
after the swap; the swap window in the runbook says that each fleet must hold its API key
before the swap and that the outgoing colour still honours the links until it stops. The CLI
file, `credential-link.ts`, the runbook section "Fleet credential links" and the
`docs/auth-integration.md` section "Fleet credentials" are deleted in the same slice, with
the sections rewritten to the settings page. Dropping the `person_id` column and its guard
is a later cleanup change, once no release reads it.

**A19. Withdrawn by A21.** (It fixed the Auth0 source's issuer to the configured one.)

**A20. How a consent credential is minted, carried and ended (the mechanics of A8).**

- _Offer._ be-01's `POST /internal/mcp/organizations` answer grows, per admitted
  membership, `agents: [{ personId, name }]`: the agent persons of that organization bound
  to the signed-in account (`person.account_id = userId`). mcp-01's consent page (today's
  organization choice page, shown now even for one organization when agents exist) offers
  "authorize as yourself" and one entry per agent. A pre-activation consent offers nothing
  and behaves as today.
- _Mint._ Choosing an agent, mcp-01 asks be-01 `POST /internal/mcp/credentials` (service
  secret plus the user's upstream token, `organizationId`, `personId`, the OAuth client's
  name) in the consent transaction, before the code is issued. be-01 writes one
  `machine_credential` of source `mcp_consent`, person the agent, `issued_by` the user,
  `mcp_family_id` the family mcp-01 is about to durably create, with its audit row. It
  refuses `403 person_not_bound` when the person is not bound to that account or is of
  another organization or not an agent, and `403 not_a_member` when the account is not a
  current member; mcp-01 then answers the client `access_denied` and creates no family. The
  family and its sessions carry `act_as_person_id` and `credential_id` (additive mcp-01
  store migration `20261022130000_mcp_family_person` with a guarded `down.sql`); the code
  carries them in memory. As built (slice 3): mcp-01 chooses the family id and the credential
  id (a lowercase UUID) and records them in `mcp_consent_pending` before it asks be-01, so a
  credential minted for a code that is never exchanged is still reported ended; the exchange
  takes the pending row over in the family's insert and refuses `invalid_grant` once it is gone.
  The credential's name is `MCP <redirect host> <first block of its id>`: a host, never the
  client's self-declared name, and unique per consent. A second consent for the same agent
  mints a second credential, one family each.
- _Carry._ Every tool call's `POST /internal/mcp/delegation` names `credentialId` beside the
  family; be-01 checks, under the same service secret and upstream token as today, that the
  credential is unrevoked, names that family, that its person is still bound to the token's
  account and that the account is still a member, and issues the single-use delegation with
  `pinnedPersonId`, scopes narrowed to `read`/`write` ∩ the grant, and `credentialId`. A
  delegation naming a person is what step 4 of A13 admits. The principal's `id` stays the
  human account (the person is bound to it by construction, A12); the pin is what changes.
  As built: the delegation carries `credential_id` and `person_id` claims, the verifier rereads
  the credential at every use, and the principal's `authentication` is a fourth kind,
  `{ kind: 'consent', issuer, subject, credentialId, personId }`: the credential rules read its
  upstream pair as they read an upstream delegation's (A10), the claim pin reads its person,
  and A23's role cap treats it as a machine.
  `POST /internal/mcp/authority` answers `denied` for a revoked or unbound credential; for a
  consent family mcp-01 then revokes the family at once (so its end is reported) and refuses
  the request and every refresh.
- _End._ Revoking the credential (from the people page, the organization panel, or a
  person's removal cascade) sets `revoked_at` and writes `machine_credential_revoked`; the
  next tool call's delegation request and the next authority reread refuse, and the family
  cannot refresh. Rotation is by refresh (A11). The other way round (slice 3 closes the gap
  this paragraph first recorded) is a **durable callback, not an on-read reconciliation**:
  mcp-01 reports every consent family it ended, by any path (revoke endpoint, refresh reuse,
  provider refusal, idle or absolute expiry, an epoch advance), and every pending consent
  whose code expired, to `POST /internal/mcp/credentials/ended`, keeping each end
  (`consent_ended_reported_at`, the pending row) until be-01 acknowledges it. A sweep in
  mcp-01's main does it once a minute, because expiry and an epoch advance are no event any
  process observes. be-01 revokes only the credential naming that family, audited with actor
  `mcp-01`. Why not on read: be-01 cannot ask mcp-01 anything, and mcp-01 alone knows its
  families. A family whose credential WBS revoked first is revoked by mcp-01 at its next
  request or refresh (the authority read or the delegation answers the revocation), and
  reported as `already_revoked` at the next sweep. mcp-01 also sweeps once at startup.
- _Why a credential row and not only a family column._ Revoke, list, last-used and audit
  are then one surface for all four sources, which is what A8 asks ("same table/lifecycle").
  The family stays the secret holder; be-01 holds no refresh token.

**A21. No Auth0 machine-to-machine source (Dany, 2026-10-22).** "If clients don't do M2M
then I don't want to do M2M as well; I need a self-serving setup where I use the offering
that I try to build." The sources are `api_key`, `oidc` and `mcp_consent`; an application in
PUNI's Auth0 tenant is not a way in, today's operator-linked path is not migrated (A18), and
PUNI's fleets dogfood the self-serve offering as the first tenant.

**A23. Machine principals are members of their organization (assumed by the
coordinator, 2026-10-22, from the slice 1 review; for Dany to confirm).** Whatever
role the bound account holds, a machine principal acts in its credential's organization
as a `member` (a `viewer` account's machine stays a viewer). Its scopes are `read` and
`write`, and it never administers. `resolve` caps the role it answers
(`organizationRoleOf`, beside `machinePrincipalOf`). So a key of a super-admin's agent has
no claim-admin bypass (`person_not_bound` for a person bound to another account) and
cannot rebind a person through `patchPerson` (`403 forbidden`). Why: the slice 1 review
reproduced a key pinned to an admin-bound person rebinding its own person to a
super-admin's account and then acting as that super-admin.

**A24. A person's cascade reaches only the credentials its caller could revoke (assumed by
the coordinator, 2026-10-22, from the slice 2 review; for Dany to confirm).** A
`deletePerson … cascade: true` that would revoke machine credentials needs the reach
`DELETE /api/organization/machine-credentials/:id` has on each of them. An admin or
super-admin may cascade. A member may cascade only a person bound to their own account. A
delegation or a machine credential (A23) may not. Otherwise the batch is refused `forbidden`
and nothing is removed or revoked. Without a cascade the removal stays `in_use`. A `patchPerson`
that changes the kind of a person with a live credential is refused `in_use`, like an unbind.
Why: the review reproduced a member cascading another account's agent, and a machine key
cascading its own person, each revoking a credential it could not have revoked by its route.
Because every delegation and machine principal is refused, no cascade or revoke audit row is
ever written by one, so the detail carries no acting credential id.

**A22. API key format (Dany, 2026-10-22).** The key is `wbs_mk_<credential id>.<secret>`,
sent as `Authorization: Bearer`: the id selects the credential by primary key, the secret's
SHA-256 digest is compared in constant time against that credential's live secrets (two
during the rotation window), no digest scan, no custom `x-wbs-api-key-*` headers, one
Authorization header and one boundary parser. Rotation therefore happens under one stable
credential id. The credential id is public (UI, audit, `last_used_at`); the secret is 256
random bits as base64url, shown once and stored as its SHA-256 hex digest. The
`plaintext-secrets` hook matches the whole `wbs_mk_<id>.` form.

**A25. The OIDC source is scoped by audience (assumed by the coordinator, 2026-10-22,
from the slice 5 review; for Dany to confirm).** (a) A trusted issuer registration
requires an `audience`, and every token is verified with one: the credential's own when it
sets one (a narrowing: the token then carries both), else the registration's. The list and
the registration answer carry it so an admin can paste it into the IdP's token request
(GitHub Actions: `audience` on the OIDC token request); `wbs:org:<organizationId>` is
recommended in the API documentation, not hard-coded. (b) `(issuer, audience)` is unique
across the deployment (`409 audience_taken`): that is what tells two organizations'
registrations of one public issuer apart. A credential's subject is unique per registration
(`machine_credential_trusted_subject` replaces the deployment-wide pair index), so
`subject_taken` is no cross-tenant oracle. Verification selects the registration by
`(iss, aud)` (the `aud` string or array; none or more than one match is `invalid_token`, with
no fetch), then the credential by `(registration, sub)` within the registration's
organization. The column keeps its slice 1 name `default_audience`, held non-null by
triggers in `20261022120000_scope_trusted_issuer_audience`, which is additive (no release
before it writes an OIDC row). Why: without an audience a token any party obtains from a
shared issuer for the same subject (a GitHub repository's workflow) is admitted for every
organization that bound the subject, and the deployment-wide pair index let one tenant
learn another's subjects.

## Risks / Trade-offs

- **A12 is the decision most likely to be overruled.** Binding a machine to a human's
  account keeps D5/D7 and every `users` reference intact, but it means a tenant's agent
  must be bound to some member account before it can hold a credential, and removing that
  member refuses while credentials exist. The alternative (a machine account per
  credential) is a second account kind in `users`, every FK and the journal; recorded, not
  chosen.
- **A consent credential's human can leave.** When the issuing account loses membership,
  `resolve` answers `not_a_member` and the family ends, exactly as a human session does; the
  agent's work stops with its human. Accepted: A8 ties the agent's session to the human's
  authorization on purpose.
- **One issuer URL, several trusted-issuer rows.** Two organizations may both trust
  `https://token.actions.githubusercontent.com`; step 3 of A13 reads every row for the
  `iss` and matches the pair per row, so a GitHub workflow subject of organization A never
  admits a credential of B. The JWKS is cached per URL, not per row.
- **Subject strings of workload identities are long and structured**
  (`repo:org/repo:ref:refs/heads/main`); WBS compares them exactly and parses nothing.
  Wildcards are a later feature, not v1.
- **A URL an admin registers is trusted on the admin's word** (A16). The blast radius is
  that admin's own organization, scoped by A1, capped by A12.
- **Last-used coarsening** means a list may lag a minute behind. Stated in the panel.
- **The operator links stop admitting at the swap (A18, A21).** A fleet that has not been
  given an API key or a consent session before the swap is refused `401 unknown_identity`
  by the incoming colour. The runbook's swap window names it; the retired CLI cannot make a
  link afterwards. Accepted: the cost of dogfooding the self-serve path is one onboarding
  per fleet, which is what a customer pays.
- **A family ended by mcp-01 revokes its credential up to a minute later** (A20, _End_), and
  later still while be-01 is unreachable; until then the credential lists as live though no
  family can use it.
