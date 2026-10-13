## ADDED Requirements

### Requirement: Exact MCP resource body boundary

The public edge SHALL admit otherwise valid authenticated JSON-RPC requests to exact `/mcp` through 4,194,304 serialized UTF-8 body bytes and SHALL return HTTP 413 above that boundary without an upstream write.

#### Scenario: Notes exceed the former edge boundary

- **WHEN** an authenticated notes call has more than 64KB and at most 4,194,304 body bytes
- **THEN** Caddy forwards its full body to the MCP resource

#### Scenario: Exact boundary and overflow

- **WHEN** the body has exactly 4,194,304 bytes
- **THEN** the request reaches the resource
- **WHEN** the body has 4,194,305 bytes
- **THEN** Caddy returns 413 and upstream write state remains unchanged

### Requirement: Anonymous routes retain their boundary

Every `/mcp*` path other than exact `/mcp`, including OAuth registration and token routes, SHALL retain the existing Caddy `64KB` body limit.

#### Scenario: OAuth boundary and fallback

- **WHEN** a request to `/mcp/oauth/register`, `/mcp/oauth/token`, `/mcp/`, or `/mcpx` has 64,000 body bytes
- **THEN** it can reach the upstream
- **WHEN** its body has 64,001 bytes
- **THEN** Caddy returns 413 without an upstream write

### Requirement: Production configurations agree

The exposure candidate and swap-rendered exposed configuration SHALL enforce the same boundaries, preserve exact discovery routes, and overwrite MCP forwarding sources. Unexposed rendering SHALL omit MCP routes.

#### Scenario: Both exposed configuration paths

- **WHEN** either production configuration is exercised through disposable Caddy
- **THEN** it enforces both boundaries and forwards a source IP independent of spoofed caller headers

#### Scenario: Exposure disabled

- **WHEN** the persistent exposure marker is absent
- **THEN** the rendered configuration contains no MCP routes
