-- Reverses 20261031120000_mcp_client_secret. Run only through rollbackMcpStore, whose preflight
-- (`preflightClientSecretDown`) refuses inside the same IMMEDIATE transaction while a
-- confidential client is live or a confidential family is still usable: without these columns
-- either would read as public and redeem codes or refresh with no secret. Expired, unswept
-- confidential client rows are deleted, so none is read as public afterwards; families left are
-- revoked or expired, so dropping their method changes nothing they can do.
-- Proof: 2026-10-31, turning the DELETE into a SELECT made `rolls back the client secret
-- migration once no confidential client is live` (store-migrations.test.ts) find the expired
-- confidential client after the rollback.
DELETE FROM mcp_client WHERE token_endpoint_auth_method IS NOT NULL;
ALTER TABLE mcp_family DROP COLUMN client_auth_method;
ALTER TABLE mcp_client DROP COLUMN client_secret_sha256;
ALTER TABLE mcp_client DROP COLUMN token_endpoint_auth_method;
