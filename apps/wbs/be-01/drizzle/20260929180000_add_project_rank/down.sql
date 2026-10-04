-- Reverses `20260929180000_add_project_rank`.
--
-- Refuses while any rank exists: dropping the table would lose every
-- organization's order with no copy, so it is saved and removed first with
-- `project-rank-rollback-cli.ts save|remove`, and restored after a later
-- forward run with `restore` (docs/runbook-prod-deploy.md#project-rank-rollback).
-- The CHECK's name is the message the operator reads, so it carries the
-- procedure. The rollback runner reverts this script and its ledger row in one
-- transaction.
--
-- Proof, observed 2026-09-29 in `project-rank.db.test.ts`: with the guard's
-- INSERT removed, `refuses while a rank exists, keeping the table and the
-- ledger` failed because the rollback answered
-- `[20260929180000_add_project_rank]` and dropped the table.
CREATE TEMP TABLE `project_rank_rollback_guard` (
	`ranks` integer NOT NULL,
	CONSTRAINT "project ranks exist: save and remove them with project-rank-rollback-cli.ts save|remove first, then rerun migrate-down-cli.ts --to=<baseline>, and restore after the next forward run; see docs/runbook-prod-deploy.md#project-rank-rollback" CHECK (`ranks` = 0)
);
--> statement-breakpoint
INSERT INTO `project_rank_rollback_guard` (`ranks`) SELECT COUNT(*) FROM `project_rank`;
--> statement-breakpoint
DROP TABLE `project_rank_rollback_guard`;
--> statement-breakpoint
DROP INDEX `project_rank_order`;
--> statement-breakpoint
DROP TABLE `project_rank`;
