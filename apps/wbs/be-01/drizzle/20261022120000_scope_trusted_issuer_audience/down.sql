-- Reverses `20261022120000_scope_trusted_issuer_audience`, refusing while two
-- OIDC credentials share an `(issuer, subject)` pair: the deployment-wide
-- pair index cannot hold them, and choosing which to drop would end a
-- tenant's machine without its admin.
-- Proof: the guard's INSERT replaced by one inserting 0 made `refuses
-- rollback while two organizations bind one subject` in
-- `trusted-issuer-audience-migration.db.test.ts` fail on the bare unique
-- index instead of the named guard; watched 2026-10-22.
CREATE TEMP TABLE trusted_issuer_audience_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "two OIDC machine credentials share an issuer and subject: revoke and remove one of each pair (recording it first) before migrate-down-cli.ts; no automatic recovery tool exists for machine credentials" CHECK (rows = 0)
);
--> statement-breakpoint
INSERT INTO trusted_issuer_audience_rollback_guard SELECT count(*) FROM (SELECT `issuer`, `subject` FROM `machine_credential` WHERE `source` = 'oidc' GROUP BY `issuer`, `subject` HAVING count(*) > 1);
--> statement-breakpoint
DROP TABLE trusted_issuer_audience_rollback_guard;
--> statement-breakpoint
DROP TRIGGER `organization_trusted_issuer_audience_update`;
--> statement-breakpoint
DROP TRIGGER `organization_trusted_issuer_audience_insert`;
--> statement-breakpoint
CREATE UNIQUE INDEX `machine_credential_pair` ON `machine_credential` (`issuer`, `subject`) WHERE `source` = 'oidc';
--> statement-breakpoint
DROP INDEX `machine_credential_trusted_subject`;
--> statement-breakpoint
DROP INDEX `organization_trusted_issuer_audience`;
