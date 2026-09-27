-- Reverses 20260927120000_mcp_credential_binding. Run only through rollbackMcpStore, which
-- preflights under the same IMMEDIATE transaction: epoch exactly 0 and no usable new-format
-- family or live new-format session. What remains new-format is dead; it is purged so it cannot
-- be reinterpreted as legacy once its bindings are gone. Legacy rows are preserved.
-- Proof: 2026-09-27, turning this purge into a SELECT made `purges dead bound credentials,
-- preserves legacy ones and reaches the baseline` fail with the bound family still present.
DELETE FROM mcp_family WHERE organization_id IS NOT NULL OR user_id IS NOT NULL
  OR issuer IS NOT NULL OR credential_epoch > 0;
DELETE FROM mcp_session WHERE organization_id IS NOT NULL OR user_id IS NOT NULL
  OR issuer IS NOT NULL OR credential_epoch > 0;
DROP TRIGGER mcp_session_binding_immutable;
DROP TRIGGER mcp_session_family_binding;
DROP TRIGGER mcp_family_binding_immutable;
DROP TRIGGER mcp_family_current_epoch;
DROP TRIGGER mcp_credential_epoch_no_decrease;
DROP TRIGGER mcp_credential_epoch_no_delete;
DROP TABLE mcp_credential_epoch;
ALTER TABLE mcp_session DROP COLUMN credential_epoch;
ALTER TABLE mcp_session DROP COLUMN issuer;
ALTER TABLE mcp_session DROP COLUMN user_id;
ALTER TABLE mcp_session DROP COLUMN organization_id;
ALTER TABLE mcp_family DROP COLUMN credential_epoch;
ALTER TABLE mcp_family DROP COLUMN issuer;
ALTER TABLE mcp_family DROP COLUMN user_id;
ALTER TABLE mcp_family DROP COLUMN organization_id;
