-- Reverses `20261022120000_add_organization_limits`, refusing while any
-- organization holds its own caps: dropping the rows would silently move each
-- such tenant back to the deployment default an operator had overridden.
-- Proof: guard statements removed; `refuses rollback while an organization
-- holds its own caps` in organization-limits-migration.db.test.ts dropped the
-- table with its row; watched 2026-10-22.
CREATE TEMP TABLE organization_limits_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "organization limits exist: record each organization_limits row, delete them (organization-limits-cli.ts reset once it exists, else by hand) and accept that those organizations fall back to the deployment defaults before migrate-down-cli.ts --to=<baseline>" CHECK (rows = 0)
);
--> statement-breakpoint
INSERT INTO organization_limits_rollback_guard SELECT count(*) FROM organization_limits;
--> statement-breakpoint
DROP TABLE organization_limits_rollback_guard;
--> statement-breakpoint
DROP TABLE organization_limits;
