-- Organization binding and the credential epoch for the durable MCP store (WBS 010.5.2, task 1.6).
-- Additive: legacy issuance stays valid at epoch 0 with null bindings. A bound row carries all
-- three bindings; at epoch >= 1 every row must be bound. The CHECKs spell `IS NOT NULL` because
-- SQLite accepts a CHECK whose expression evaluates to NULL. Bindings reference be-01's separate
-- database, so there are no foreign keys; the triggers keep them immutable, keep each session
-- equal to its family, and pin every inserted row to the durable epoch.
ALTER TABLE mcp_family ADD COLUMN organization_id TEXT;
ALTER TABLE mcp_family ADD COLUMN user_id TEXT;
ALTER TABLE mcp_family ADD COLUMN issuer TEXT;
-- Proof: 2026-09-27, dropping `organization_id IS NOT NULL` from the family CHECK made
-- store-migrations.test.ts `rejects a family without organization` accept the row.
ALTER TABLE mcp_family ADD COLUMN credential_epoch INTEGER NOT NULL DEFAULT 0 CHECK (
  typeof(credential_epoch) = 'integer' AND credential_epoch >= 0 AND (
    (credential_epoch = 0 AND organization_id IS NULL AND user_id IS NULL AND issuer IS NULL)
    OR (organization_id IS NOT NULL AND length(organization_id) > 0
      AND user_id IS NOT NULL AND length(user_id) > 0
      AND issuer IS NOT NULL AND length(issuer) > 0)
  )
);
ALTER TABLE mcp_session ADD COLUMN organization_id TEXT;
ALTER TABLE mcp_session ADD COLUMN user_id TEXT;
ALTER TABLE mcp_session ADD COLUMN issuer TEXT;
ALTER TABLE mcp_session ADD COLUMN credential_epoch INTEGER NOT NULL DEFAULT 0 CHECK (
  typeof(credential_epoch) = 'integer' AND credential_epoch >= 0 AND (
    (credential_epoch = 0 AND organization_id IS NULL AND user_id IS NULL AND issuer IS NULL)
    OR (organization_id IS NOT NULL AND length(organization_id) > 0
      AND user_id IS NOT NULL AND length(user_id) > 0
      AND issuer IS NOT NULL AND length(issuer) > 0)
  )
);
CREATE TABLE mcp_credential_epoch (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  epoch INTEGER NOT NULL CHECK (typeof(epoch) = 'integer' AND epoch >= 0)
);
INSERT INTO mcp_credential_epoch (singleton, epoch) VALUES (1, 0);
-- Proof: 2026-09-27, disabling each trigger below in turn made its store-migrations.test.ts case
-- pass the fault: deleted epoch, replaced epoch, decreased epoch, family at a future epoch, changed family
-- binding, session unlike its family, unbound session of a bound family, refresh of a family
-- issued before the epoch advanced, and changed session binding.
CREATE TRIGGER mcp_credential_epoch_no_delete BEFORE DELETE ON mcp_credential_epoch
BEGIN
  SELECT RAISE(ABORT, 'mcp_credential_epoch cannot be deleted');
END;
CREATE TRIGGER mcp_credential_epoch_no_replace BEFORE INSERT ON mcp_credential_epoch
WHEN EXISTS (SELECT 1 FROM mcp_credential_epoch)
BEGIN
  SELECT RAISE(ABORT, 'mcp_credential_epoch is seeded once');
END;
CREATE TRIGGER mcp_credential_epoch_no_decrease BEFORE UPDATE ON mcp_credential_epoch
WHEN NEW.singleton IS NOT OLD.singleton OR NEW.epoch < OLD.epoch
BEGIN
  SELECT RAISE(ABORT, 'mcp_credential_epoch cannot decrease');
END;
CREATE TRIGGER mcp_family_current_epoch BEFORE INSERT ON mcp_family
WHEN NEW.credential_epoch IS NOT (SELECT epoch FROM mcp_credential_epoch WHERE singleton = 1)
BEGIN
  SELECT RAISE(ABORT, 'mcp_family credential_epoch must equal the durable epoch');
END;
CREATE TRIGGER mcp_family_binding_immutable BEFORE UPDATE OF organization_id, user_id, issuer, credential_epoch ON mcp_family
WHEN NEW.organization_id IS NOT OLD.organization_id OR NEW.user_id IS NOT OLD.user_id
  OR NEW.issuer IS NOT OLD.issuer OR NEW.credential_epoch IS NOT OLD.credential_epoch
BEGIN
  SELECT RAISE(ABORT, 'mcp_family binding is immutable');
END;
CREATE TRIGGER mcp_session_family_binding BEFORE INSERT ON mcp_session
WHEN NEW.credential_epoch IS NOT (SELECT epoch FROM mcp_credential_epoch WHERE singleton = 1)
  OR NOT EXISTS (
    SELECT 1 FROM mcp_family f WHERE f.family_id = NEW.family_id
      AND f.organization_id IS NEW.organization_id AND f.user_id IS NEW.user_id
      AND f.issuer IS NEW.issuer AND f.credential_epoch IS NEW.credential_epoch
  )
BEGIN
  SELECT RAISE(ABORT, 'mcp_session binding must equal its family and the durable epoch');
END;
CREATE TRIGGER mcp_session_binding_immutable BEFORE UPDATE OF family_id, organization_id, user_id, issuer, credential_epoch ON mcp_session
WHEN NEW.family_id IS NOT OLD.family_id OR NEW.organization_id IS NOT OLD.organization_id
  OR NEW.user_id IS NOT OLD.user_id OR NEW.issuer IS NOT OLD.issuer
  OR NEW.credential_epoch IS NOT OLD.credential_epoch
BEGIN
  SELECT RAISE(ABORT, 'mcp_session binding is immutable');
END;
