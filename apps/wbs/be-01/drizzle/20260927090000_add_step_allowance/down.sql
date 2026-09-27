-- Reverses `20260927090000_add_step_allowance`, and refuses while any step
-- carries a nonzero allowance.
--
-- Dropping the column would silently change what every such step charges: the
-- release this rolls back to reads base days, so `QA +30%` would plan as
-- `QA +0%` with nothing on screen saying the policy was lost. A rollback that
-- must proceed anyway is an operator decision — record the allowances
-- (`SELECT id, project_id, name, allowance_bps FROM step WHERE allowance_bps <> 0`),
-- set them to zero, then rerun this rollback.
--
-- The refusal is a CHECK on a temporary table, because plain SQL has no RAISE
-- outside a trigger: the INSERT fails with `CHECK constraint failed:
-- step_allowance_rollback_guard` when any nonzero allowance exists, which
-- aborts this script before the DROP runs.
CREATE TEMP TABLE `step_allowance_rollback_guard` (
  `nonzero` integer NOT NULL CONSTRAINT `step_allowance_rollback_guard` CHECK (`nonzero` = 0)
);
--> statement-breakpoint
INSERT INTO `step_allowance_rollback_guard` (`nonzero`)
  SELECT count(*) FROM `step` WHERE `allowance_bps` <> 0;
--> statement-breakpoint
DROP TABLE `step_allowance_rollback_guard`;
--> statement-breakpoint
ALTER TABLE `step` DROP COLUMN `allowance_revision`;
--> statement-breakpoint
ALTER TABLE `step` DROP COLUMN `allowance_bps`;
