## ADDED Requirements

### Requirement: A machine credential obtains an MCP access token through the client credentials grant

mcp-01's token endpoint SHALL accept `grant_type=client_credentials` in standalone mode, after
activation, from a live `api_key` or `oidc` machine credential, verified only through be-01's
`POST /internal/mcp/machine-grants`. It SHALL answer an mcp-01-signed access token with `aud`
equal to `MCP_PUBLIC_URL`, `token_use` `machine`, scope `wbs:read wbs:write`, the machine grant
as a claim, `expires_in` at most `MCP_MACHINE_TOKEN_TTL`, and no refresh token.

#### Scenario: An API key gets a token and lists tools

- **WHEN** a live API key of agent person `claire` posts
  `grant_type=client_credentials&client_id=<id>&client_secret=wbs_mk_<id>.<secret>&resource=<MCP_PUBLIC_URL>`
- **THEN** the answer is `200` with a bearer token whose `aud` is the MCP resource, no
  `refresh_token`, and `expires_in` ≤ 3600, and `tools/list` with that token answers the same
  tool names and descriptions as a consented session's

#### Scenario: A workload token gets a token

- **WHEN** a GitHub Actions token with the registration's audience and the credential's
  subject is sent as `client_assertion` with `client_id` = that credential's id
- **THEN** the answer is `200`; the same token with another credential's id as `client_id` is
  `401 invalid_client`

### Requirement: Each credential source has one presentation at the token endpoint

An API key SHALL be presented as `client_id` = its credential id and `client_secret` = the
whole key, in the body or by HTTP Basic. An OIDC credential SHALL be presented as `client_id` =
its credential id and a `client_assertion` of type
`urn:ietf:params:oauth:client-assertion-type:jwt-bearer` holding the workload's token, and the
credential be-01 matches SHALL have that id.

#### Scenario: Basic and body are equivalent

- **WHEN** the same key is sent once in the body and once by HTTP Basic
- **THEN** both answer `200` with tokens naming the same credential

### Requirement: Token endpoint refusals reveal nothing

An unknown id, a wrong secret, a `client_id` that differs from the key's id, a revoked
credential, an unverifiable assertion and a `mcp_consent` credential SHALL all be answered the
same `401 invalid_client`. A scope beyond `wbs:read wbs:write` SHALL be `400 invalid_scope`.

#### Scenario: Failures are indistinguishable

- **WHEN** the token endpoint is asked with an id that names no credential, with a revoked
  credential's correct key, and with a live credential's wrong secret
- **THEN** all three answer `401 invalid_client` with the same body

#### Scenario: Editor scope is refused

- **WHEN** a live key asks for `scope=wbs:read wbs:write wbs:editor`
- **THEN** the answer is `400 invalid_scope` and be-01 is not asked

### Requirement: Only admin-created credentials are machine clients

The authorization server metadata SHALL list `client_credentials` and the client authentication
methods `client_secret_post`, `client_secret_basic` and `private_key_jwt`. Dynamic client
registration SHALL keep refusing a client that asks for `client_credentials`.

#### Scenario: A self-registered client cannot become a machine

- **WHEN** a dynamic registration asks for `grant_types: ['client_credentials']`
- **THEN** it is refused `400 invalid_client_metadata` and no client is stored

### Requirement: mcp-01 accepts on /mcp only tokens its own server issued, and never forwards a client's token

`/mcp` SHALL refuse a `wbs_mk_` key, a trusted-issuer token and any other token not signed by
mcp-01's authorization server `401 invalid_token`, with `WWW-Authenticate` naming the resource
metadata. For a machine token, every be-01 call SHALL carry the embedded machine grant with
`x-internal-auth`, never the client's access token or the credential's secret.

#### Scenario: A raw API key on /mcp is refused

- **WHEN** `POST /mcp` carries `Authorization: Bearer wbs_mk_<id>.<secret>` of a live credential
- **THEN** the answer is `401 invalid_token` and be-01 receives no request

#### Scenario: Tool calls carry the grant, not the token

- **WHEN** a machine token calls `getApiProjects`
- **THEN** be-01 receives `Authorization: Bearer <machine grant>` and `x-internal-auth`, and
  neither the mcp-01 access token nor any `wbs_mk_` string appears in that request

### Requirement: be-01 admits a machine grant only from mcp-01 and rereads its credential at every use

be-01 SHALL admit a `wbs-be-01/machine-grant` bearer only with a valid `x-internal-auth`, a
verifying signature and `exp`, and a credential that is unrevoked, whose person is still bound
to the same account and whose account is still a member. A grant SHALL be reusable until `exp`
and SHALL cost no write other than the coarse last-use touch.

#### Scenario: A grant without the service secret is refused

- **WHEN** a client extracts the machine grant from its access token and calls be-01
  `GET /api/projects` with it and no `x-internal-auth`
- **THEN** the answer is `401 invalid_token`

#### Scenario: Revocation takes effect at the next tool call

- **WHEN** an admin revokes a credential while its machine token still has 50 minutes to run
- **THEN** that token's next tool call answers a tool error naming `credential_revoked`, and
  its next token request is `401 invalid_client`

#### Scenario: No write per call

- **WHEN** a machine token makes 100 tool reads within one minute
- **THEN** be-01's delegation-use table gains no row and `machine_credential.last_used_at`
  changes at most once

### Requirement: A machine grant yields the API-key principal

An admitted grant SHALL yield the principal an API key of the same credential yields:
`authentication.kind` `machine`, the pinned person, scopes `read` and `write`, and the A23 role
cap.

#### Scenario: A grant names the API-key principal exactly

- **WHEN** the same credential claims a step once through an MCP tool call and once (in a
  fixture with M9 disabled) through its raw key over HTTP
- **THEN** both claims carry the same person, are leased (L1), are renewed by
  `postApiClaimsRenew`, and are refused the same way under the claim cap

### Requirement: A machine session leaves no mcp-01 store rows

A machine token SHALL be verified by signature, audience, expiry and the activated
credential epoch alone. Issuing or using one SHALL write no family, session or pending row,
and two mcp-01 processes sharing only their signing keys and service secret SHALL each accept
the other's machine tokens. A machine token presented to the refresh or revoke endpoint SHALL
be refused `400 invalid_grant`.

#### Scenario: A second replica accepts the token

- **WHEN** replica A issues a machine token and replica B, with a separate empty session
  store and the same signing key, receives a tool call with it
- **THEN** B answers the call, and neither store gained a row

### Requirement: Every MCP principal sees one tool list without human-only tools

`tools/list` SHALL answer the same names and descriptions for a consented human, a consented
agent and a machine token. An endpoint shape carrying the `humanOnly` policy SHALL never be a
tool. A `humanOnly` shape that matches no operation of the document SHALL fail mcp-01's
startup.

#### Scenario: Credential and organization administration are absent

- **WHEN** any MCP principal calls `tools/list`
- **THEN** no tool reaches machine credentials, trusted issuers, agent pools, provisioning
  tokens, memberships, invitations, join requests, domains, SSO connections, session policy,
  the limits read, the capacity-mode switch, restore approvals or onboarding

#### Scenario: The capacity report is a tool

- **WHEN** a machine token of a provider's reporter calls the capacity report tool
- **THEN** be-01 records the report; a consented agent calling it gets the typed
  `not_an_agent_principal` refusal

### Requirement: mcp-01 bounds machine traffic per credential and per organization

mcp-01 SHALL refuse a token request over the per-`client_id` or per-source-IP rate
`429 slow_down` before asking be-01, a `/mcp` request over the per-credential rate HTTP `429`
with `Retry-After`, and a tool call that would exceed the organization's in-flight cap HTTP
`429` with `Retry-After`. The limits SHALL be read from configuration at startup and refused
when malformed.

#### Scenario: A runaway agent is slowed, its neighbour is not

- **WHEN** one credential sends 50 `/mcp` requests in one second and another credential of the
  same organization sends 2
- **THEN** the first sees `429` after its burst and the second sees none

#### Scenario: Token guessing never reaches be-01

- **WHEN** one source IP sends 100 token requests in a minute with random ids
- **THEN** at most 60 reach be-01's machine-grant route

### Requirement: Gateway mode offers no machine admission

With `MCP_AUTH_MODE=gateway`, the token endpoint SHALL answer `client_credentials` with
`400 unsupported_grant_type`, the metadata SHALL omit it, and a JWT carrying
`token_use: machine` on `/mcp` SHALL be refused `401 invalid_token`, never decoded as gateway
claims.

#### Scenario: A machine token in gateway mode

- **WHEN** gateway-mode mcp-01 receives a machine token on `/mcp`
- **THEN** it answers `401 invalid_token` and forwards nothing to be-01

### Requirement: Secrets never reach logs or reports

Neither a `wbs_mk_` key, a client assertion, a machine grant nor an access token SHALL appear
in route evidence, unexpected-failure reports, error bodies or `toString`/`toJSON` of the
values that carry them.

#### Scenario: A failing token request is reported without its secret

- **WHEN** be-01's machine-grant route throws during a token request
- **THEN** the captured report and route evidence contain no `wbs_mk_` string and no
  assertion, and the `plaintext-secrets` pattern finds nothing in them
