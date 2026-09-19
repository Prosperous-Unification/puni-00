## ADDED Requirements

### Requirement: Token responses carry a rotating refresh token

Every successful MCP token response SHALL include a `refresh_token`, and authorization-server metadata and dynamic registration SHALL advertise `refresh_token` in `grant_types_supported`.

#### Scenario: authorization code exchange

- **WHEN** a client exchanges a valid authorization code
- **THEN** the response contains `access_token`, `expires_in` equal to the configured lifetime, and a `refresh_token`

### Requirement: A refresh token is single-use and bound to its client

`grant_type=refresh_token` SHALL succeed only for an unconsumed, unexpired token presented with the `client_id` it was issued to, SHALL consume it, and SHALL return a new access token and refresh token in the same family. Presenting a consumed token SHALL revoke the whole family and answer `invalid_grant`.

#### Scenario: normal refresh

- **WHEN** a client presents its current refresh token
- **THEN** it receives a working access token and a successor, and the presented token no longer refreshes

#### Scenario: reuse of a consumed token

- **WHEN** a consumed refresh token is presented again
- **THEN** the response is `invalid_grant` and every access and refresh token of that family is refused

#### Scenario: another client presents the token

- **WHEN** a refresh token is presented with a different `client_id`
- **THEN** the response is `invalid_grant` and the token remains usable by its own client

### Requirement: mcp-01 keeps the provider token alive

Before calling be-01 and on an MCP refresh, mcp-01 SHALL refresh the provider token when it expires within 120 seconds, and exactly one provider refresh SHALL run per family at a time. A be-01 401 after a successful refresh SHALL be retried once; a provider refusal SHALL revoke the family.

#### Scenario: two concurrent calls near expiry

- **WHEN** two requests of one family arrive together 60 seconds before provider expiry, on separate database connections
- **THEN** the provider refresh is called exactly once and both requests use the new provider token

#### Scenario: provider revoked the user

- **WHEN** the provider refuses the refresh
- **THEN** the family is revoked and the caller's next request receives HTTP 401 with `error="invalid_token"`

#### Scenario: provider returned no refresh token

- **WHEN** a login's token set has no refresh token
- **THEN** the family's absolute expiry equals the provider access-token expiry

### Requirement: Sessions and keys survive a restart and fail closed

MCP sessions, families and signing keys SHALL survive an mcp-01 restart. Startup SHALL fail when a current key is missing or malformed or the store is unreadable. Stored provider tokens that fail authentication or carry an unknown version SHALL revoke their family.

#### Scenario: restart between two calls

- **WHEN** mcp-01 restarts between a client's two tool calls within the token lifetime
- **THEN** the second call succeeds with the same access token, and the refresh token still refreshes

#### Scenario: signing key rotated

- **WHEN** `MCP_SIGNING_KEY_CURRENT` is replaced and the old key moved to `_PREVIOUS`
- **THEN** tokens signed with either key verify and new tokens use the new key

#### Scenario: tampered ciphertext

- **WHEN** one byte of a family's stored provider token is changed
- **THEN** that family's next refresh answers `invalid_grant` and the family is revoked
