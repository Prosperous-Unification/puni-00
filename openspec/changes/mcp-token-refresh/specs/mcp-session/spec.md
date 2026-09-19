## ADDED Requirements

### Requirement: Token responses carry a rotating refresh token

Every successful MCP token response SHALL include a `refresh_token`, and authorization-server metadata and dynamic registration SHALL advertise `refresh_token` in `grant_types_supported`.

#### Scenario: authorization code exchange

- **WHEN** a client exchanges a valid authorization code
- **THEN** the response contains `access_token`, `expires_in: 300` and a `refresh_token`

### Requirement: A refresh token is single-use and bound to its client

`grant_type=refresh_token` SHALL succeed only for an unconsumed, unexpired token presented by the `client_id` it was issued to, SHALL consume it, and SHALL return a new access token and a new refresh token in the same family. A token consumed more than 10 seconds earlier SHALL revoke its whole refresh family and answer `invalid_grant`.

#### Scenario: normal refresh

- **WHEN** a client presents its current refresh token
- **THEN** it receives a working access token and a successor refresh token, and the presented token no longer refreshes

#### Scenario: replay of a consumed token

- **WHEN** a consumed refresh token is presented again after 10 seconds
- **THEN** the response is `invalid_grant` and every access and refresh token of that family is refused

#### Scenario: another client presents the token

- **WHEN** a refresh token is presented with a different `client_id`
- **THEN** the response is `invalid_grant` and the token remains usable by its own client

### Requirement: Refresh keeps the provider session alive

An MCP refresh SHALL refresh the provider token when the stored provider access token expires within 120 seconds. A provider refusal SHALL revoke the family and answer `invalid_grant`.

#### Scenario: provider token near expiry

- **WHEN** a refresh arrives 60 seconds before the provider access token expires
- **THEN** mcp-01 calls the provider refresh once and later tool calls use the new provider token

#### Scenario: provider revoked the user

- **WHEN** the provider refuses the refresh
- **THEN** the MCP response is `invalid_grant` and the family's MCP access tokens are refused

### Requirement: Sessions survive a restart

MCP sessions, refresh families and the signing key SHALL survive an mcp-01 restart and a blue/green swap. mcp-01 SHALL refuse to start when its signing key or store key is missing or malformed.

#### Scenario: deploy between two calls

- **WHEN** mcp-01 restarts between a client's two tool calls within the token lifetime
- **THEN** the second call succeeds with the same access token, and the refresh token still refreshes

#### Scenario: signing key absent

- **WHEN** mcp-01 starts without `MCP_SIGNING_KEY`
- **THEN** startup fails with an error naming the variable
