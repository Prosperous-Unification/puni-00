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
