## ADDED Requirements

### Requirement: Production ingress exposes MCP OAuth discovery

At the public HTTPS origin, production ingress SHALL route `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp`, and `/.well-known/oauth-authorization-server/mcp/oauth` to mcp-01, while `/mcp` continues to reach its MCP and OAuth endpoints. Release acceptance SHALL prove the deployed public URL returns valid discovery metadata with consistent resource, authorization-server and token endpoints, then completes ordinary-user DCR, sign-in, owned-project read and reversible write, actual refresh and revoked-token rejection.

#### Scenario: Discovery bypasses the SPA fallback

- **GIVEN** the production host and a client querying each well-known MCP OAuth route
- **WHEN** the public ingress responds
- **THEN** mcp-01 metadata is returned with the expected JSON content type and public HTTPS endpoint URLs

#### Scenario: A public import-capable session is evidenced

- **GIVEN** an ordinary user and disposable project
- **WHEN** a public client requests read/write, authenticates and exercises read, reversible write, refresh and revocation
- **THEN** each outcome is recorded against the public URL without exposing credentials
- **AND** the change is not marked live-proven when any required outcome is missing
