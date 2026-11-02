-- Reverses `20261101120000_add_host_job_projection`, refusing while any host
-- job row exists: its authority's accepted sequence already counts the events
-- that wrote it, so Dash would never publish them again and the projection
-- would be lost for good. Reserved units are display state every report
-- replaces; dropping the column loses only the latest figure.
--
-- Proof, watched 2026-11-01: with the guard's count replaced by `0`, `refuses
-- rollback over one host job, keeping it` (host-job-projection-migration.db.test.ts)
-- saw the rollback exit 0.
CREATE TEMP TABLE host_job_projection_rollback_guard (held INTEGER NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER host_job_projection_rollback_refusal
BEFORE INSERT ON host_job_projection_rollback_guard
WHEN NEW.held > 0
BEGIN
  SELECT RAISE(ABORT, NEW.held || ' host jobs are projected from a resource authority; they cannot be published again, so roll forward instead');
END;
--> statement-breakpoint
INSERT INTO host_job_projection_rollback_guard SELECT (SELECT count(*) FROM resource_host_job);
--> statement-breakpoint
DROP TRIGGER host_job_projection_rollback_refusal;
--> statement-breakpoint
DROP TABLE host_job_projection_rollback_guard;
--> statement-breakpoint
DROP INDEX `resource_host_job_provider`;
--> statement-breakpoint
DROP TABLE `resource_host_job`;
--> statement-breakpoint
ALTER TABLE `resource_capacity_report` DROP COLUMN `reserved_dimension`;
--> statement-breakpoint
ALTER TABLE `resource_capacity_report` DROP COLUMN `reserved_units`;
