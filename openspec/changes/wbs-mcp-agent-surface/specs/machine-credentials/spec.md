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
