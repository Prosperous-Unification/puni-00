-- Reverses 20261022130000_mcp_family_person. Run only through rollbackMcpStore, whose preflight
-- (`preflightFamilyPersonDown`) refuses inside the same IMMEDIATE transaction while any family
-- names a person whose end be-01 has not acknowledged, or any consent is pending: dropping the
-- columns would strip the person from a live family (it would act as its human) or lose a
-- credential end that was never reported. What remains is dead and reported, and is purged so it
-- cannot be reinterpreted as the human's own family. Refresh rows are deleted explicitly, as in
-- the binding reversal.
-- Proof: 2026-10-22, turning the family purge into a SELECT made `refuses to roll back while a
-- family names a person` (store-migrations.test.ts) find the reported claire family after the
-- rollback, beside the legacy one.
DELETE FROM mcp_refresh WHERE family_id IN (SELECT family_id FROM mcp_family
  WHERE credential_id IS NOT NULL);
DELETE FROM mcp_session WHERE credential_id IS NOT NULL OR family_id IN (SELECT family_id
  FROM mcp_family WHERE credential_id IS NOT NULL);
DELETE FROM mcp_family WHERE credential_id IS NOT NULL;
DROP TRIGGER mcp_session_person_immutable;
DROP TRIGGER mcp_session_family_person;
DROP TRIGGER mcp_family_person_immutable;
DROP TABLE mcp_consent_pending;
DROP INDEX mcp_family_credential;
ALTER TABLE mcp_session DROP COLUMN credential_id;
ALTER TABLE mcp_session DROP COLUMN act_as_person_id;
ALTER TABLE mcp_family DROP COLUMN consent_ended_reported_at;
ALTER TABLE mcp_family DROP COLUMN credential_id;
ALTER TABLE mcp_family DROP COLUMN act_as_person_id;
