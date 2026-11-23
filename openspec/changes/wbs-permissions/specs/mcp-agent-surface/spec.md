## MODIFIED Requirements

### Requirement: A machine credential obtains an MCP access token through the client credentials grant

mcp-01's token endpoint SHALL accept `grant_type=client_credentials` in standalone mode from a
live `api_key` machine credential of an activated deployment, verified only through be-01's
`POST /internal/mcp/machine-grants`. It SHALL answer an mcp-01-signed access token for the
canonical `MCP_PUBLIC_URL` that carries the machine grant, and no refresh token.

#### Scenario: The token's shape

- **WHEN** a live key gets a token
- **THEN** the token has `aud` = the canonical `MCP_PUBLIC_URL`, `token_use: machine`, the
  scopes be-01 returned in the grant, the grant as a claim, and `exp` 60 s before the grant's

#### Scenario: An SDK client gets a token and lists tools

- **WHEN** the MCP SDK's `ClientCredentialsProvider` is configured with a live key as
  `clientSecret` and connects to `/mcp`
- **THEN** the token request uses HTTP Basic, the answer is `200` with no `refresh_token`, and
  `tools/list` answers the same names and descriptions as a consented session's

#### Scenario: Before activation nothing is issued

- **WHEN** a `client_credentials` request and a JWT-bearer request arrive before organization
  activation
- **THEN** be-01 answers `409 not_activated`, and mcp-01 answers `401 invalid_client` and
  `400 invalid_grant` respectively

#### Scenario: A compatibility viewer with its own write grant

- **WHEN** a key bound to a current member labeled viewer holds its own package.write grant
- **THEN** be-01 freshly issues the fixed read/write machine envelope and the actual write is decided from that credential's current grant and contributor permission cap
- **AND** changing only the stored compatibility membership label does not change authority.

#### Scenario: Requested or older outer token scope remains narrower

- **WHEN** a client requests only read, holds an existing read-only MCP access token, or mcp-01 receives a read-only grant response
- **THEN** mcp-01 retains that narrower signed/requested scope and refuses a write as insufficient_scope without widening it
- **AND** no credential without its own grant inherits the bound account's grants.

#### Scenario: An assertion is not client authentication

- **WHEN** a `client_credentials` request carries only a `client_assertion` and no secret
- **THEN** the answer is `401 invalid_client`

### Requirement: A machine grant yields the API-key principal

An admitted grant SHALL yield `authentication.kind` `machine`, the pinned person, the grant's
run when one was opted in, the fresh fixed read/write MACHINE_SCOPES envelope, and the
P12 contributor permission cap over its own P17 grants. Current account membership,
credential source/binding/revocation and proof lifetime remain required. The bound account's
stored membership label SHALL NOT narrow or widen this machine envelope. Requested and
existing signed MCP access-token scope attenuation remains unchanged; no new inner grant
JWT scope claim or verifier API is introduced.

#### Scenario: Parity with a raw key

- **WHEN** the same credential claims a step through a grant, and through its raw key on `/api`
  in the test-only composition seam
- **THEN** both claims carry the same person, are leased, are renewed by `postApiClaimsRenew`,
  and meet the same `claim_limit` refusal, given no `wbs_run`
