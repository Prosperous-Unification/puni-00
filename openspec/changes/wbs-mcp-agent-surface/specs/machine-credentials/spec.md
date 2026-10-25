## ADDED Requirements

### Requirement: be-01's HTTP API refuses machine bearers

Once #731 has retired operator links, every `/api` route SHALL refuse a `wbs_mk_` key, a
trusted-issuer token and a groups-less configured-issuer token presented as
`Authorization: Bearer` with `401 { error: 'machine_bearer_not_accepted' }` naming the MCP
endpoint, before any credential read. No environment variable SHALL disable this refusal.
Verification of the sources SHALL remain reachable only through
`POST /internal/mcp/machine-grants` under `MCP_BE_INTERNAL_SECRET`.

#### Scenario: A fleet still on HTTP

- **WHEN** a live API key calls `GET /api/projects`
- **THEN** the answer is `401 machine_bearer_not_accepted`, `last_used_at` is unchanged and no
  credential row was read

#### Scenario: A groups-less Auth0 token

- **WHEN** a verified configured-issuer token without the groups claim calls `GET /api/projects`
- **THEN** the answer is `401 machine_bearer_not_accepted`

#### Scenario: The internal route still verifies

- **WHEN** mcp-01 posts the same key to `/internal/mcp/machine-grants` with the secret
- **THEN** it answers a grant naming that credential. With gw-01's `x-internal-auth` value
  instead, or with no secret, it answers `401 internal_unauthorized`

## MODIFIED Requirements

### Requirement: An admin registers and removes trusted issuers

`POST /api/organization/trusted-issuers` SHALL be accepted from an admin with an `issuer`
HTTPS URL on a public name (a literal IP address, `localhost`, or a name under `.internal`,
`.local` or `.localhost` is `400 invalid_body`), a required `audience` and an optional
`ssoConnectionId`. For a registration
made after this change, the `audience` SHALL equal be-01's `WBS_MCP_AUTHORIZATION_SERVER` (mcp-01's
issuer, `<MCP_PUBLIC_URL>/oauth`) or start with it followed by `/`, else `400 audience_not_wbs`;
a credential-level audience narrowing (A25 (a)) SHALL meet the same rule. `(issuer, audience)` SHALL be unique across the deployment (`409
audience_taken`), and an organization SHALL hold at most eight trusted issuers (`409
trusted_issuer_limit`). The list and the registration answer SHALL carry the audience. WBS SHALL fetch
the issuer's OIDC discovery document once, require its `issuer` to equal the given URL and
record its `jwks_uri`, which SHALL be a public HTTPS URL as above; an unreachable document SHALL be `409 issuer_unreachable`, a
disagreeing one `409 issuer_mismatch`, and nothing is stored in either case. The configured
issuer SHALL be refused `409 issuer_reserved`. With `ssoConnectionId` the connection SHALL be
the organization's (`404 unknown_sso_connection` otherwise), of strategy `oidc` (`409
issuer_not_oidc` otherwise) and proven (`409 sso_connection_unproven`). `(organization, issuer)` SHALL be unique (`409 issuer_taken`).
`DELETE /api/organization/trusted-issuers/:id` SHALL be refused `409 in_use` with the count
while unrevoked credentials name it; once none does, the revoked credentials naming it SHALL
be removed with it in the same transaction, their audit rows kept. Every trusted issuer
route SHALL refuse a `member` or `viewer` `403 forbidden`, a delegation or a machine
credential `403 insufficient_scope`, and answer `403 no_active_organization` before
activation. Each act SHALL write its audit row in the same
transaction. Once be-01 refuses machine bearers on `/api`, a stored audience that breaks the rule SHALL be
refused at use with `invalid_grant`. Until then it SHALL keep verifying. The deploy preflight
(`trusted-issuer-audience-check-cli.ts`, a dry run by default) SHALL refuse a swap while it
lists any row not named in `WBS_ACCEPT_BREAKING_AUDIENCES`.

#### Scenario: Registering a workload identity issuer

- **WHEN** an admin posts `https://token.actions.githubusercontent.com` with audience
  `https://wbs.example/mcp/oauth/org/A`, where `WBS_MCP_AUTHORIZATION_SERVER` is
  `https://wbs.example/mcp/oauth`
- **THEN** the trusted issuer is listed with the discovered `jwks_uri`, and one
  `trusted_issuer_registered` row records it

#### Scenario: A look-alike audience

- **WHEN** an admin posts the audience `https://wbs.example/mcp/oauth.evil.example` or `wbs:org:A`
- **THEN** WBS answers `400 audience_not_wbs` and stores nothing

#### Scenario: The preflight lists what would break

- **WHEN** a store holds one registration with audience `wbs:org:A` and the preflight runs
  with `WBS_ACCEPT_BREAKING_AUDIENCES` unset
- **THEN** it lists that registration and its credentials, changes nothing, and exits non-zero

#### Scenario: A SAML connection as the gate

- **WHEN** an admin names a proven `samlp` connection
- **THEN** WBS answers `409 issuer_not_oidc` and stores nothing

#### Scenario: Discovery disagrees

- **WHEN** the document at the URL publishes a different `issuer`
- **THEN** WBS answers `409 issuer_mismatch` and stores nothing

#### Scenario: Removing an issuer in use

- **WHEN** an admin deletes a trusted issuer two unrevoked credentials name
- **THEN** WBS answers `409 in_use` with `machineCredentials: 2` and changes nothing

### Requirement: One verification path admits every source

The API-key and trusted-issuer branches below, and the groups-less refusal, SHALL be reached
only through `POST /internal/mcp/machine-grants` (which answers a machine grant or the refusal
named) and through the test-only composition seam. On `/api`, an API key, a trusted-issuer
token and a groups-less configured-issuer token are refused `machine_bearer_not_accepted`
before them (`wbs-mcp-agent-surface` M9). The consent-delegation branch stays on `/api`, where
mcp-01 presents it. be-01 SHALL admit a presented token by exactly one of: a
WBS-signed delegation naming a live `mcp_consent` credential; an API key
`wbs_mk_<credential id>.<secret>` whose id selects an unrevoked credential by primary key
and whose secret's SHA-256 digest equals, compared in constant time, one of that
credential's unexpired secrets; a JWT whose `(iss, aud)` selects exactly one trusted issuer
registration, verified against its JWKS (asymmetric algorithms only, `exp` and `sub`
required, at most one hour of remaining lifetime, `aud` always checked: the credential's
audience, else the registration's), whose subject names an unrevoked `oidc` credential of
that registration. A JWT of the configured issuer with a groups claim SHALL keep the
browser login path; one without a groups claim SHALL be refused `401 unknown_identity` with
no credential lookup and no account created, whatever `external_identity` rows exist. A `wbs_mk_` token SHALL never be parsed as a JWT, SHALL never be matched by scanning digests,
and a malformed one (no `.`, or an id that is no credential) SHALL be refused `401
unknown_identity` without a read. No header other than `Authorization` SHALL carry a key. A verified token
matching no credential, a revoked credential or an expired secret SHALL be refused `401
unknown_identity` with no account created or changed. A token whose issuer is neither the
configured issuer nor a trusted issuer, an unverifiable token or a key set that cannot be
fetched SHALL be refused `401 invalid_token`, never admitted on a cached or default key.

#### Scenario: An API key is admitted

- **WHEN** a request bears a live API key of credential C of organization A
- **THEN** it is admitted as C's person's account with scopes `read` and `write`, bound to A
  without any cookie, and `getApiProjects` through `/mcp` (or `GET /api/projects` in the
  test-only composition seam, `wbs-mcp-agent-surface` M9) lists A's projects only

#### Scenario: A secret under another credential's id

- **WHEN** the grant route (or the seam) is given `wbs_mk_<id of credential A>.<live secret of
credential B>`
- **THEN** WBS answers `401 unknown_identity` and reads only credential A's secrets

#### Scenario: A key in a custom header

- **WHEN** a request carries a live key in `x-wbs-api-key` and no `Authorization` header
- **THEN** it is treated as unauthenticated, exactly as a request with no credential

#### Scenario: A revoked API key

- **WHEN** the grant route (or the seam) is given the secret of a revoked credential
- **THEN** WBS answers `401 unknown_identity`, mcp-01 answers the token request
  `401 invalid_client`, and the users table is unchanged

#### Scenario: A machine-to-machine token of the configured issuer

- **WHEN** a verified JWT of the configured issuer arrives without a groups claim, on the
  seam
- **THEN** WBS answers `401 unknown_identity`, reads no credential, and the users table is
  unchanged; on `/api` it is `401 machine_bearer_not_accepted`

#### Scenario: A trusted issuer's token for an unknown subject

- **WHEN** a JWT verified against trusted issuer T, given to the grant route (or the seam),
  carries a subject no credential of T names
- **THEN** WBS answers `401 unknown_identity`, mcp-01 answers `400 invalid_grant`, and no
  account is created

#### Scenario: A token of a stranger issuer

- **WHEN** a JWT's `iss` is neither the configured issuer nor any organization's trusted issuer
- **THEN** WBS answers `401 invalid_token` without fetching any key set

#### Scenario: The key set cannot be fetched

- **WHEN** trusted issuer T's JWKS endpoint answers 503
- **THEN** the request is refused `401 invalid_token`, the failure is reported, and no
  cached key of another issuer is tried

#### Scenario: A pair shared by two organizations' issuers

- **WHEN** A and B both trust the same issuer URL and only A holds a credential for subject S
- **THEN** a token for S is admitted as A's credential and B gains nothing

### Requirement: A machine token acts as its pinned person's account with capped scopes

A request admitted by a machine credential SHALL act as the account the pinned person is
bound to, with scopes exactly `read` and `write`, bound to the credential's organization,
and with the credential's person as the pin the claim decision reads. In that organization
it SHALL hold at most the role `member`, whatever role the bound account holds, so no
admin rule (the claim-admin bypass, person binding) applies to it. Organization
administration routes SHALL refuse it `403 insufficient_scope`. A claim or release naming
another person, outside a delegated claim under the pinned person's claim, SHALL be refused
`credential_not_for_person` as today. An account no longer a member of the credential's
organization SHALL be refused `403 not_a_member` with the credential unchanged. Enforced SSO
and the session policy SHALL NOT refuse a machine token.

#### Scenario: An admin's account, a member's reach

- **WHEN** a credential's person is bound to an account holding `super_admin` in A
- **THEN** a command batch on A's project is accepted through `/mcp`; the members routes are
  no MCP tool (`humanOnly`), and in the test-only seam `GET /api/organization/members` is
  refused `403 insufficient_scope`

#### Scenario: An admin's account gives a machine no admin rule

- **WHEN** a key pinned to `claire`, bound to an account holding `super_admin` in A, sends
  `patchPerson` binding another person to an account, or claims as a person bound to
  another account
- **THEN** the patch is refused `403 forbidden` and the claim `person_not_bound`, and
  nothing is written

#### Scenario: A claim for the wrong person

- **WHEN** a machine token pinned to `claire` claims a step as `claude-code` outside any
  subtree claim of `claire`
- **THEN** the batch is refused `credential_not_for_person` and writes nothing

#### Scenario: A delegated claim keeps working

- **WHEN** `claire` holds a subtree claim and a token pinned to `claire-worker`, bound to
  the same account, claims a leaf under it naming that claim as parent
- **THEN** the claim is accepted exactly as under the operator-linked credential

#### Scenario: Enforced SSO does not refuse a machine

- **WHEN** A enforces SSO and a machine token issued for A's live API key calls a tool
  through `/mcp`
- **THEN** the call is admitted
