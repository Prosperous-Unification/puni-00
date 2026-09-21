CREATE TABLE mcp_family (family_id TEXT PRIMARY KEY, client_id TEXT NOT NULL, subject TEXT NOT NULL, scope TEXT NOT NULL, upstream_access_ct BLOB NOT NULL, upstream_refresh_ct BLOB, upstream_expires_at INTEGER NOT NULL, idle_expires_at INTEGER NOT NULL, absolute_expires_at INTEGER NOT NULL, revoked_at INTEGER, lease_owner TEXT, lease_until INTEGER, version INTEGER NOT NULL);
CREATE TABLE mcp_session (jti TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES mcp_family(family_id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE mcp_refresh (token_digest BLOB PRIMARY KEY, family_id TEXT NOT NULL REFERENCES mcp_family(family_id) ON DELETE CASCADE, consumed_at INTEGER, expires_at INTEGER NOT NULL);
CREATE INDEX mcp_session_family ON mcp_session(family_id);
CREATE INDEX mcp_refresh_family ON mcp_refresh(family_id);
