-- Holds `machine_credential.id` to the lowercase UUID shape an API key
-- carries (`wbs-machine-credentials` A22, task 2.5): `parseMachineKey` reads
-- only `8-4-4-4-12` lowercase hex, while the table's CHECK from
-- `20261022100000_add_machine_credential` admits any 36 characters of
-- `[0-9a-f-]`, so a credential with such an id could never be presented.
--
-- Triggers, not a tightened CHECK: SQLite cannot alter a CHECK in place, and a
-- rebuild of `machine_credential` would be a destructive statement the
-- outgoing release's table shares mid-swap. The triggers refuse only inserts
-- and id updates the routes never make (they mint `crypto.randomUUID()`), so
-- the outgoing release is unaffected and the migration stays additive.
--
-- Proof, observed 2026-10-22 in `machine-credential-audit-migration.db.test.ts`:
-- the insert trigger's WHEN replaced by `WHEN 0` made `refuses a credential
-- id that is not a lowercase UUID` store a misplaced-hyphen id the older
-- CHECK admits.
CREATE TRIGGER `machine_credential_id_shape_insert` BEFORE INSERT ON `machine_credential`
WHEN NEW.`id` NOT GLOB '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'
BEGIN
	SELECT RAISE(ABORT, 'machine_credential.id must be a lowercase UUID');
END;
--> statement-breakpoint
CREATE TRIGGER `machine_credential_id_shape_update` BEFORE UPDATE OF `id` ON `machine_credential`
WHEN NEW.`id` NOT GLOB '[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'
BEGIN
	SELECT RAISE(ABORT, 'machine_credential.id must be a lowercase UUID');
END;
