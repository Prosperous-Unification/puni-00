-- Reverses `20261022140000_add_resource_provider`, refusing while any
-- provider instance, resource reference or capacity report exists: dropping
-- them would discard what an organization registered and which host fulfils
-- which resource.
--
-- Proof, observed 2026-10-22 in `resource-provider-migration.db.test.ts`:
-- the trigger's `WHEN NEW.held > 0` replaced by `WHEN 0` made `refuses
-- rollback over one referencing resource, keeping it` observe the rollback
-- succeed, the instance deleted and the reference dropped with the column.
CREATE TEMP TABLE compute_provider_rollback_guard (held INTEGER NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER compute_provider_rollback_refusal
BEFORE INSERT ON compute_provider_rollback_guard
WHEN NEW.held > 0
BEGIN
  SELECT RAISE(ABORT, NEW.held || ' compute provider instances, resource references or capacity reports exist; remove each instance with DELETE /api/organization/compute-providers/<id>?cascade=true, then rerun migrate-down-cli.ts');
END;
--> statement-breakpoint
INSERT INTO compute_provider_rollback_guard SELECT
  (SELECT count(*) FROM compute_provider)
  + (SELECT count(*) FROM resource WHERE provider_id IS NOT NULL)
  + (SELECT count(*) FROM resource_capacity_report);
--> statement-breakpoint
DROP TRIGGER compute_provider_rollback_refusal;
--> statement-breakpoint
DROP TABLE compute_provider_rollback_guard;
--> statement-breakpoint
DROP INDEX `resource_capacity_report_person`;
--> statement-breakpoint
DROP INDEX `resource_capacity_report_provider`;
--> statement-breakpoint
DROP TABLE `resource_capacity_report`;
--> statement-breakpoint
DROP INDEX `resource_provider`;
--> statement-breakpoint
ALTER TABLE `resource` DROP COLUMN `provider_id`;
--> statement-breakpoint
DROP INDEX `compute_provider_name`;
--> statement-breakpoint
DROP TABLE `compute_provider`;
