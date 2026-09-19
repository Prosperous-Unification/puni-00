## ADDED Requirements

### Requirement: A rejected upstream token ends the MCP session

When be-01 answers an MCP tool call with 401 and no edge challenge, mcp-01 SHALL delete the caller's MCP session and SHALL answer that MCP request with HTTP 401 carrying `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="<url>"`. A 401 carrying an edge `WWW-Authenticate` challenge remains the existing deployment-gate tool error and SHALL NOT end the session.

#### Scenario: upstream token expired behind a live session

- **WHEN** a caller with a live MCP session calls a tool and be-01 returns 401 without an edge challenge
- **THEN** the response is HTTP 401 with `error="invalid_token"`, and the same MCP access token is refused on the next request

#### Scenario: edge gate refusal

- **WHEN** be-01's route answers 401 with an edge `WWW-Authenticate` challenge
- **THEN** the caller receives the existing deployment-gate tool error and its MCP session remains live

### Requirement: An invalid MCP token tells the client to re-authorize

A request whose MCP access token is missing, expired, revoked, or tied to a deleted MCP session SHALL receive HTTP 401 with `error="invalid_token"` when a token was presented, and without an `error` parameter when none was.

#### Scenario: presented token revoked

- **WHEN** a caller presents a token whose MCP session was deleted
- **THEN** the response is 401 and `WWW-Authenticate` includes `error="invalid_token"`

### Requirement: A failed login returns to the MCP client

After the pending authorization is matched, a callback that fails (provider `error` parameter, exchange failure, upstream token verification failure, or no `wbs:read` scope) SHALL redirect to the pending authorization's validated redirect URI with an RFC 6749 `error` code and the client's original `state`, and SHALL clear the browser-binding cookie. A callback whose pending authorization cannot be matched SHALL keep the existing local error response.

#### Scenario: account lacks wbs:read

- **WHEN** the provider signs in an account without the wbs read group
- **THEN** the browser is redirected to the client's redirect URI with `error=access_denied` and the client's `state`

#### Scenario: unmatched callback

- **WHEN** a callback arrives with no matching pending authorization
- **THEN** no redirect to any client URI occurs

### Requirement: The login after a failed login re-authenticates

After a failed login, the next authorization started from the same browser SHALL send `prompt=login` to the provider. When provider discovery advertises `end_session_endpoint`, the failed-login response SHALL end the provider session before returning to the client.

#### Scenario: retry after access_denied

- **WHEN** a browser's login failed with `access_denied` and the user retries
- **THEN** the upstream authorization URL includes `prompt=login`
