-- Confidential consent clients (`wbs-mcp-agent-surface` M17): a dynamically registered client
-- that asked for `client_secret_basic` or `client_secret_post` keeps that method and the
-- SHA-256 of the secret issued once in its registration answer, never the secret. Both NULL is a
-- public client (`none`), exactly as every row before this migration. Each family also records
-- its client's method at creation (`client_auth_method`, NULL for public), so a refresh fails
-- closed when a confidential family's client row is gone or was re-admitted as public. Additive;
-- mcp-01 runs as one replica (Recreate), and a release without this migration refuses to open a
-- store whose ledger records it, so no older process ever reads a confidential row as public.
-- The CHECKs read `coalesce(length(x), 0)` because SQLite accepts a CHECK whose expression is
-- NULL and migration lint reads any `NOT NULL` in an `ADD COLUMN` as a required column.
-- Proof: 2026-10-31, in `refuses a confidential client row without its secret digest, or a
-- public one with one` (store-migrations.test.ts), `CHECK (1)` on the method column stored the
-- unknown-method row, and on the digest column the other three rows; `CHECK (1)` on the family
-- column made `refuses a family client method outside the confidential two` store it.
ALTER TABLE mcp_client ADD COLUMN token_endpoint_auth_method TEXT CHECK (
  token_endpoint_auth_method IS NULL
  OR token_endpoint_auth_method IN ('client_secret_basic', 'client_secret_post')
);
ALTER TABLE mcp_client ADD COLUMN client_secret_sha256 TEXT CHECK (
  (token_endpoint_auth_method IS NULL AND client_secret_sha256 IS NULL)
  OR (coalesce(length(token_endpoint_auth_method), 0) > 0
    AND coalesce(length(client_secret_sha256), 0) = 64)
);
ALTER TABLE mcp_family ADD COLUMN client_auth_method TEXT CHECK (
  client_auth_method IS NULL OR client_auth_method IN ('client_secret_basic', 'client_secret_post')
);
