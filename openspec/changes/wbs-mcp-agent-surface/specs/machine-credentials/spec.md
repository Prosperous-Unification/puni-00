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
- **THEN** it answers a grant naming that credential; with gw-01's `x-internal-auth` value
  instead it answers `401 unauthorized`

## MODIFIED Requirements

### Requirement: An admin registers and removes trusted issuers

`POST /api/organization/trusted-issuers` SHALL be accepted from an admin with an `issuer`
HTTPS URL on a public name (a literal IP address, `localhost`, or a name under `.internal`,
`.local` or `.localhost` is `400 invalid_body`), a required `audience` and an optional
`ssoConnectionId`. The `audience` SHALL equal be-01's `WBS_MCP_RESOURCE_URL` or start with it
followed by `/`, else `400 audience_not_wbs`; a credential-level audience narrowing (A25 (a))
SHALL meet the same rule. `(issuer, audience)` SHALL be unique across the deployment (`409
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
transaction. A registration or credential whose stored audience breaks the rule (for example
a `wbs:org:<id>` row, or any row after `WBS_MCP_RESOURCE_URL` changes) SHALL be refused at use
with `invalid_grant` and listed by `trusted-issuer-audience-check-cli.ts`. That CLI is a dry
run by default, and the deploy preflight SHALL refuse a swap while it lists any row not named
in `--accept-breaking`.

#### Scenario: Registering a workload identity issuer

- **WHEN** an admin posts `https://token.actions.githubusercontent.com` with audience
  `https://wbs.example/mcp/org/A`, where `WBS_MCP_RESOURCE_URL` is `https://wbs.example/mcp`
- **THEN** the trusted issuer is listed with the discovered `jwks_uri`, and one
  `trusted_issuer_registered` row records it

#### Scenario: A look-alike audience

- **WHEN** an admin posts the audience `https://wbs.example/mcp.evil.example` or `wbs:org:A`
- **THEN** WBS answers `400 audience_not_wbs` and stores nothing

#### Scenario: The preflight lists what would break

- **WHEN** a store holds one registration with audience `wbs:org:A` and the preflight runs
  without `--accept-breaking`
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
