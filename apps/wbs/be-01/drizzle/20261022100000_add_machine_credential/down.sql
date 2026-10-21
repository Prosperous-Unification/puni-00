-- Reverses `20261022100000_add_machine_credential`, refusing while any machine
-- credential, secret or trusted issuer exists: dropping them would silently
-- end every machine's access and lose who issued it.
-- Proof: the guard's INSERT replaced by one inserting 0 made `refuses rollback
-- while one credential exists` in `machine-credential-migration.db.test.ts`
-- observe the rollback succeed and the credential vanish; watched 2026-10-22.
CREATE TEMP TABLE machine_credential_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "machine credentials or trusted issuers exist: revoke and remove every machine_credential, machine_credential_secret and organization_trusted_issuer row (recording them first) before migrate-down-cli.ts; no automatic recovery tool exists for machine credentials" CHECK (rows = 0)
);
--> statement-breakpoint
INSERT INTO machine_credential_rollback_guard SELECT (SELECT count(*) FROM machine_credential) + (SELECT count(*) FROM machine_credential_secret) + (SELECT count(*) FROM organization_trusted_issuer);
--> statement-breakpoint
DROP TABLE machine_credential_rollback_guard;
--> statement-breakpoint
DROP INDEX machine_credential_secret_credential;
--> statement-breakpoint
DROP TABLE machine_credential_secret;
--> statement-breakpoint
DROP INDEX machine_credential_person;
--> statement-breakpoint
DROP INDEX machine_credential_organization;
--> statement-breakpoint
DROP INDEX machine_credential_live_name;
--> statement-breakpoint
DROP INDEX machine_credential_family;
--> statement-breakpoint
DROP INDEX machine_credential_pair;
--> statement-breakpoint
DROP TABLE machine_credential;
--> statement-breakpoint
DROP INDEX organization_trusted_issuer_by_issuer;
--> statement-breakpoint
DROP INDEX organization_trusted_issuer_issuer;
--> statement-breakpoint
DROP TABLE organization_trusted_issuer;
