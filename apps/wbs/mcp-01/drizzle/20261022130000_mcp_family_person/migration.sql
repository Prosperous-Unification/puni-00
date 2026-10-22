-- A consent that acts as an agent person (`wbs-machine-credentials` A8, A20). Additive: a family
-- or session without a person behaves exactly as before. A family that names a person carries
-- both the agent person (`act_as_person_id`) and the be-01 `mcp_consent` credential
-- (`credential_id`) it rides on, never one without the other, and only when it is bound to an
-- organization. Every session copies them from its family. `consent_ended_reported_at` records
-- when be-01 acknowledged that the family ended, so a family's end is reported exactly until
-- acknowledged. `mcp_consent_pending` holds a consent whose credential be-01 may have minted
-- while its code is not yet exchanged: written before the mint, deleted with the family insert,
-- and reported ended once it expires unexchanged. Like the binding and client migrations, a
-- release without this migration refuses to open a store that recorded it. The CHECKs read
-- `coalesce(length(x), 0) > 0` for "set and non-empty", because SQLite accepts a CHECK whose
-- expression is NULL and migration lint reads any `NOT NULL` in an `ADD COLUMN` as a required
-- column.
-- Proof: 2026-10-22, in store-migrations.test.ts: dropping the credential half of the family
-- CHECK made `refuses a family that names a person without its credential` store the row, and
-- its organization half made `refuses a person on an unbound family` store it;
-- `WHEN 0` on `mcp_session_family_person` made `refuses a session unlike its family's person`
-- and `refuses a session of a person's family acting as its human` store it; `WHEN 0` on either
-- immutability trigger made `refuses a changed family person` or `refuses a changed session
-- person` change it; `CHECK (1)` on the report column made `refuses a reported end of a family
-- acting as nobody` store it.
ALTER TABLE mcp_family ADD COLUMN act_as_person_id TEXT;
ALTER TABLE mcp_family ADD COLUMN credential_id TEXT CHECK (
  (act_as_person_id IS NULL AND credential_id IS NULL)
  OR (coalesce(length(act_as_person_id), 0) > 0
    AND coalesce(length(credential_id), 0) > 0
    AND coalesce(length(organization_id), 0) > 0)
);
ALTER TABLE mcp_family ADD COLUMN consent_ended_reported_at INTEGER CHECK (
  consent_ended_reported_at IS NULL OR (coalesce(length(credential_id), 0) > 0
    AND typeof(consent_ended_reported_at) = 'integer')
);
ALTER TABLE mcp_session ADD COLUMN act_as_person_id TEXT;
ALTER TABLE mcp_session ADD COLUMN credential_id TEXT;
CREATE UNIQUE INDEX mcp_family_credential ON mcp_family(credential_id) WHERE credential_id IS NOT NULL;
CREATE TABLE mcp_consent_pending (
  family_id TEXT PRIMARY KEY CHECK (length(family_id) > 0),
  credential_id TEXT NOT NULL UNIQUE CHECK (length(credential_id) > 0),
  expires_at INTEGER NOT NULL CHECK (typeof(expires_at) = 'integer')
);
CREATE TRIGGER mcp_family_person_immutable BEFORE UPDATE OF act_as_person_id, credential_id ON mcp_family
WHEN NEW.act_as_person_id IS NOT OLD.act_as_person_id OR NEW.credential_id IS NOT OLD.credential_id
BEGIN
  SELECT RAISE(ABORT, 'mcp_family person is immutable');
END;
CREATE TRIGGER mcp_session_family_person BEFORE INSERT ON mcp_session
WHEN NOT EXISTS (
  SELECT 1 FROM mcp_family f WHERE f.family_id = NEW.family_id
    AND f.act_as_person_id IS NEW.act_as_person_id AND f.credential_id IS NEW.credential_id
)
BEGIN
  SELECT RAISE(ABORT, 'mcp_session person must equal its family');
END;
CREATE TRIGGER mcp_session_person_immutable BEFORE UPDATE OF act_as_person_id, credential_id ON mcp_session
WHEN NEW.act_as_person_id IS NOT OLD.act_as_person_id OR NEW.credential_id IS NOT OLD.credential_id
BEGIN
  SELECT RAISE(ABORT, 'mcp_session person is immutable');
END;
