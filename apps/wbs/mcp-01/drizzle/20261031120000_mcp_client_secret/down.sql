-- Reverses 20261031120000_mcp_client_secret. Run only through rollbackMcpStore, whose preflight
-- (`preflightClientSecretDown`) refuses inside the same IMMEDIATE transaction while a
-- confidential client is live: dropping the columns would make it a public client that redeems
-- codes and refreshes without its secret. Expired, unswept confidential rows are deleted, so
-- none is read as public afterwards; a proven client outlives every family of its id, so no
-- live family is left without its client.
-- Proof: 2026-10-31, turning the DELETE into a SELECT made `rolls back the client secret
-- migration once no confidential client is live` (store-migrations.test.ts) find the expired
-- confidential client after the rollback.
DELETE FROM mcp_client WHERE token_endpoint_auth_method IS NOT NULL;
ALTER TABLE mcp_client DROP COLUMN client_secret_sha256;
ALTER TABLE mcp_client DROP COLUMN token_endpoint_auth_method;
