## ADDED Requirements

### Requirement: MCP authorization binds one organization end to end

mcp-01 SHALL require a user to select one current organization during OAuth consent. It SHALL bind the organization to the authorization code, grant, refresh family and access session. Changing organizations SHALL require fresh authorization. The credential or authenticated delegation reaching be-01 SHALL bind WBS user, organization, client, grant/family, granted scopes, audience and expiry; be-01 SHALL verify that binding, upstream identity where used, and current membership on every tool call. Client scopes SHALL only narrow membership permissions. Caller-supplied organization headers, tool arguments and upstream tokens without an accepted organization binding SHALL not confer access. A direct upstream-token path SHALL meet the same audience and binding contract or be refused.

#### Scenario: Binding lost during translation

- **GIVEN** an MCP token selected organization A
- **WHEN** mcp-01 forwards an upstream credential without authenticated A delegation
- **THEN** be-01 refuses the tool call before reading project data

#### Scenario: Forged organization argument

- **GIVEN** an MCP grant bound to A
- **WHEN** a tool request names B in an argument or header
- **THEN** be-01 refuses B access even if the upstream identity belongs to B too

#### Scenario: Switching organizations

- **GIVEN** a user belongs to A and B with an MCP grant bound to A
- **WHEN** the client asks to use B without a new authorization
- **THEN** the request is refused; a fresh B consent may issue a separate B grant

### Requirement: Membership revocation reaches live MCP credentials

be-01 SHALL check current membership for each MCP call and mcp-01 SHALL revoke or reject the affected grant and refresh family after membership removal. Replayed refresh tokens SHALL remain refused. An Auth0 group or still-valid upstream token SHALL not restore removed access.

#### Scenario: Removed member retains token

- **GIVEN** an unexpired MCP access token bound to A
- **WHEN** the user's A membership is removed and the token calls a tool
- **THEN** the call is refused and refresh cannot mint renewed A access

### Requirement: Pre-activation MCP credentials cannot cross the organization cutover

The durable mcp-01 store SHALL have a versioned, paired migration that adds organization, local-user and identity binding to newly issued refresh families and access sessions, with a persistent credential epoch. Authorization codes and consent transactions, including the current process-local grants, SHALL carry the same epoch and organization binding. After all organization-unaware mcp-01 processes have drained and cannot restart, and before the WBS isolation marker is committed, mcp-01 SHALL atomically advance its store epoch and revoke every pre-activation family and session, and activation SHALL wait for this durable acknowledgment; outstanding codes and consent transactions SHALL be rejected at exchange, including after process restart. Every routable mcp-01 process SHALL read the current durable epoch before code exchange, tool calls and refresh, and fail closed if its code cannot understand it. Legacy rows with null organization or an older epoch SHALL never be interpreted as a current grant or refreshed into one. Clients SHALL reauthorize and select an organization. The paired down migration SHALL be executable only before activation after all new-format credentials are revoked or expired; after activation the permanent marker SHALL refuse mcp-01 schema reversal as well as WBS rollback. A missing, unreadable or malformed MCP store or cutover epoch SHALL fail closed. Before activation, and only until the epoch advance begins, mcp-01 MAY create an absent store path at epoch 0; an existing empty, partial or unreadable store SHALL refuse startup rather than be reinitialized.

#### Scenario: Old writer cannot mint a credential after the fence

- **GIVEN** a blue/green overlap with an organization-unaware mcp-01 process
- **WHEN** activation preflight has not proved that process drained and cannot restart
- **THEN** the MCP credential epoch cannot advance and isolation cannot activate

#### Scenario: Restart cannot revive an old refresh family

- **GIVEN** a pre-activation family and refresh token survive in the durable MCP store
- **WHEN** isolation activates, mcp-01 restarts and the client refreshes
- **THEN** refresh is refused and fresh organization-selecting authorization is required

#### Scenario: Old code or direct token cannot bypass cutover

- **GIVEN** a pre-activation authorization code or an unbound direct upstream token
- **WHEN** either is used for a resource tool after activation
- **THEN** code exchange or the tool call is refused without be-01 resource access

#### Scenario: Refresh retry keeps authenticated delegation

- **GIVEN** a current organization-bound MCP session whose upstream credential expires
- **WHEN** mcp-01 refreshes upstream and retries the be-01 call
- **THEN** the retry carries the same verified user, organization, client, family, scope and audience binding, and current membership is rechecked
