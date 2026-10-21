-- Dynamically registered OAuth clients (issue #607), so a client that still holds its
-- `client_id` can authorize again after mcp-01 restarts. Additive: a release without this
-- table keeps its clients in memory and never reads it. A promotion reservation held during a
-- token exchange stays in process memory and is deliberately not a column (`src/oauth.ts`).
-- `redirect_uris` is a JSON array of the exact registered strings; `proven` is 0 or 1.
CREATE TABLE mcp_client (client_id TEXT PRIMARY KEY, source TEXT NOT NULL, redirect_uris TEXT NOT NULL, proven INTEGER NOT NULL, expires_at INTEGER NOT NULL, unproven_expires_at INTEGER NOT NULL);
CREATE INDEX mcp_client_source ON mcp_client(source);
CREATE INDEX mcp_client_expires ON mcp_client(expires_at);
