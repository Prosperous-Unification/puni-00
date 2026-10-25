## ADDED Requirements

### Requirement: be-01's HTTP API refuses machine bearers

Every `/api` route SHALL refuse a `wbs_mk_` key and a trusted-issuer token presented as
`Authorization: Bearer` with `401 { error: 'machine_bearer_not_accepted' }`, whose body names
the MCP endpoint, before any credential read. The verification of both sources SHALL remain
reachable only through `POST /internal/mcp/machine-grants` under `x-internal-auth`. Browser
sessions, MCP delegations and machine grants SHALL be admitted as before.

#### Scenario: A fleet still on HTTP

- **WHEN** a live API key calls `GET /api/projects`
- **THEN** the answer is `401 machine_bearer_not_accepted`, `last_used_at` is unchanged and no
  credential row was read

#### Scenario: The internal route still verifies

- **WHEN** mcp-01 posts the same key to `/internal/mcp/machine-grants` with `x-internal-auth`
- **THEN** the answer is a machine grant naming that credential and its person; without
  `x-internal-auth` it is `401 unauthorized`
