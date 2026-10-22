-- Scopes the OIDC machine source by audience (`wbs-machine-credentials` A25).
-- A shared public issuer (GitHub Actions) is told apart per organization by
-- the audience the organization registered, so:
--
-- - `organization_trusted_issuer_audience`: one `(issuer, audience)` across
--   the deployment (the column keeps its slice 1 name, `default_audience`);
-- - `machine_credential_trusted_subject`: one subject per trusted issuer row,
--   replacing the deployment-wide `machine_credential_pair`, so two
--   organizations may bind the same subject and neither learns of the other;
-- - two triggers holding `default_audience` non-null, where a tightened
--   column would need a table rebuild.
--
-- Additive for a release that shares the file mid-swap: no release before
-- this one creates an OIDC credential or a trusted issuer (the create routes
-- of slices 1 and 2 admit `api_key` only), and dropping a unique index
-- removes no row.
--
-- Proof, observed 2026-10-22 in `trusted-issuer-audience-migration.db.test.ts`:
-- the insert trigger's WHEN replaced by `WHEN 0` made `refuses a trusted
-- issuer without an audience` store one; the subject index made non-unique
-- made `keeps one subject per trusted issuer, and lets two issuers share it`
-- store the second credential.
CREATE UNIQUE INDEX `organization_trusted_issuer_audience` ON `organization_trusted_issuer` (`issuer`, `default_audience`);
--> statement-breakpoint
CREATE UNIQUE INDEX `machine_credential_trusted_subject` ON `machine_credential` (`trusted_issuer_id`, `subject`) WHERE `source` = 'oidc';
--> statement-breakpoint
DROP INDEX `machine_credential_pair`;
--> statement-breakpoint
CREATE TRIGGER `organization_trusted_issuer_audience_insert` BEFORE INSERT ON `organization_trusted_issuer`
WHEN NEW.`default_audience` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'organization_trusted_issuer.default_audience is required');
END;
--> statement-breakpoint
CREATE TRIGGER `organization_trusted_issuer_audience_update` BEFORE UPDATE OF `default_audience` ON `organization_trusted_issuer`
WHEN NEW.`default_audience` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'organization_trusted_issuer.default_audience is required');
END;
