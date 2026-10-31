-- Confidential consent clients (`wbs-mcp-agent-surface` M17): a dynamically registered client
-- that asked for `client_secret_basic` or `client_secret_post` keeps that method and the
-- SHA-256 of the secret issued once in its registration answer, never the secret. Both NULL is a
-- public client (`none`), exactly as every row before this migration. Additive, and, like the
-- client migration, a release without it refuses to open a store that recorded it; a colour
-- still running the older release reads a confidential row as public until it stops, which is
-- no weaker than the public clients it already serves (PKCE still binds every code). The CHECKs
-- read `coalesce(length(x), 0)` because SQLite accepts a CHECK whose expression is NULL and
-- migration lint reads any `NOT NULL` in an `ADD COLUMN` as a required column.
-- Proof: 2026-10-31, in `refuses a confidential client row without its secret digest, or a
-- public one with one` (store-migrations.test.ts), `CHECK (1)` on the method column stored the
-- unknown-method row, and on the digest column the other three rows.
ALTER TABLE mcp_client ADD COLUMN token_endpoint_auth_method TEXT CHECK (
  token_endpoint_auth_method IS NULL
  OR token_endpoint_auth_method IN ('client_secret_basic', 'client_secret_post')
);
ALTER TABLE mcp_client ADD COLUMN client_secret_sha256 TEXT CHECK (
  (token_endpoint_auth_method IS NULL AND client_secret_sha256 IS NULL)
  OR (coalesce(length(token_endpoint_auth_method), 0) > 0
    AND coalesce(length(client_secret_sha256), 0) = 64)
);
