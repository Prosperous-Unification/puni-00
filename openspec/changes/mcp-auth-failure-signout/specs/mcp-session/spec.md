## ADDED Requirements

### Requirement: An upstream rejection ends the MCP session

When be-01 answers an MCP tool call with 401 and the response is not the configured Basic edge challenge, mcp-01 SHALL end the caller's MCP session before returning the tool result, and the result SHALL say that the session ended. A 401 carrying the configured Basic edge challenge SHALL keep the existing deployment-gate error and SHALL NOT end the session.

#### Scenario: upstream token rejected

- **WHEN** a caller with a live MCP session calls a tool and be-01 returns 401 with no challenge or a Bearer challenge
- **THEN** the tool result says the session ended, and the caller's next request with the same token receives HTTP 401 with `error="invalid_token"`

#### Scenario: edge gate refusal

- **WHEN** be-01's route answers 401 with the configured Basic challenge
- **THEN** the caller receives the deployment-gate tool error and its next request still succeeds

### Requirement: A presented invalid token is labelled

A request that presents an MCP access token that is missing its session, expired, revoked or ended SHALL receive HTTP 401 whose `WWW-Authenticate` includes `error="invalid_token"` and `resource_metadata`. A request with no token SHALL receive 401 without an `error` parameter.

#### Scenario: no token presented

- **WHEN** a request carries no `Authorization` header
- **THEN** the 401 challenge has `resource_metadata` and no `error`

### Requirement: A failed login returns to the MCP client

After the pending authorization is matched, every callback failure SHALL redirect to that authorization's validated redirect URI with the `error` from the failure table and the client's original `state`, SHALL clear the browser-binding cookie, and SHALL revoke any provider refresh token the failed login produced. A callback with no matched pending authorization SHALL NOT redirect to any client URI.

#### Scenario: account lacks wbs:read

- **WHEN** the provider signs in an account without the wbs read group
- **THEN** the browser is redirected to the client URI with `error=access_denied` and the client's `state`, and the provider refresh token from that exchange is revoked

#### Scenario: exchange fails

- **WHEN** the provider token exchange throws
- **THEN** the browser is redirected to the client URI with `error=server_error`

#### Scenario: unmatched callback

- **WHEN** a callback arrives with no matching pending authorization
- **THEN** the response is local and no `Location` points at any client URI

### Requirement: The login after a failed login re-authenticates

A failed login SHALL set a single-use reauthentication marker, and the next authorization from that browser SHALL send `prompt=login` to the provider and consume the marker.

#### Scenario: retry after access_denied

- **WHEN** a login failed and the same browser starts a new authorization
- **THEN** the upstream authorization URL includes `prompt=login`, and a third authorization does not
