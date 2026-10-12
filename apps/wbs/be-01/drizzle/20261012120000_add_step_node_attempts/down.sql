-- Reverses `20261012120000_add_step_node_attempts`.
--
-- Refuses while any attempt is stored: attempts are execution history that
-- nothing else holds, so they are saved and removed first with
-- `step-node-attempt-rollback-cli.ts save|remove`, and restored after a later
-- forward run with `restore` (docs/runbook-prod-deploy.md#step-node-attempt-rollback).
-- The CHECK's name is the message the operator reads, so it carries the
-- procedure.
--
-- `step_node_attempt_issued` is dropped without a guard of its own: once the
-- attempt guard has passed, its marks hold nothing but the numbers attempts
-- removed earlier had, no history. `save` keeps them beside the attempts, and
-- `restore` writes them back, so a node still never reissues a number.
--
-- `project.timezone` is dropped without a guard, as readiness is: it is a
-- planner's setting, nothing is scheduled from it, and a later forward run
-- reads every project as `UTC` again.
--
-- Proof, observed 2026-10-12 in `step-node-attempt-migration.db.test.ts`: the
-- three guard statements removed made `rollback refused over a row, naming the
-- CLI, keeping the row and the record` drop the attempt and its record.
CREATE TEMP TABLE step_node_attempt_rollback_guard (
  attempt_rows INTEGER NOT NULL,
  CONSTRAINT "step node attempts exist: save and remove them with step-node-attempt-rollback-cli.ts save|remove, rerun migrate-down-cli.ts --to=<baseline>, then restore after the forward run; see docs/runbook-prod-deploy.md#step-node-attempt-rollback" CHECK (attempt_rows = 0)
);--> statement-breakpoint
INSERT INTO step_node_attempt_rollback_guard SELECT count(*) FROM step_node_attempt;--> statement-breakpoint
DROP TABLE step_node_attempt_rollback_guard;--> statement-breakpoint
DROP INDEX `step_node_attempt_issued_by_step`;--> statement-breakpoint
DROP TABLE `step_node_attempt_issued`;--> statement-breakpoint
DROP INDEX `step_node_attempt_running`;--> statement-breakpoint
DROP INDEX `step_node_attempt_by_step`;--> statement-breakpoint
DROP TABLE `step_node_attempt`;--> statement-breakpoint
ALTER TABLE `project` DROP COLUMN `timezone`;
