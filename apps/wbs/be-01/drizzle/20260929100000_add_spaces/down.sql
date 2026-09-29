-- Reverses `20260929100000_add_spaces`.
--
-- Refuses while any space exists: dropping the tables would lose every space
-- and its order with no copy, so they are saved and removed first with
-- `spaces-rollback-cli.ts save|remove`, and restored after a later forward run
-- with `restore` (docs/runbook-prod-deploy.md#space-rollback). The CHECK's name
-- is the message the operator reads, so it carries the procedure. The
-- rollback runner reverts this script and its ledger row in one transaction.
--
-- Proof, observed 2026-09-29 in `space.db.test.ts`: with the guard's INSERT
-- removed, `refuses while a space exists, keeping both tables and the ledger`
-- failed because the rollback answered `[20260929100000_add_spaces]` and
-- dropped both tables.
CREATE TEMP TABLE `space_rollback_guard` (
	`spaces` integer NOT NULL,
	CONSTRAINT "spaces exist: save and remove them with spaces-rollback-cli.ts save|remove first, then rerun migrate-down-cli.ts --to=<baseline>, and restore after the next forward run; see docs/runbook-prod-deploy.md#space-rollback" CHECK (`spaces` = 0)
);
--> statement-breakpoint
INSERT INTO `space_rollback_guard` (`spaces`) SELECT COUNT(*) FROM `space`;
--> statement-breakpoint
DROP TABLE `space_rollback_guard`;
--> statement-breakpoint
DROP INDEX `space_project_project`;
--> statement-breakpoint
DROP INDEX `space_project_order`;
--> statement-breakpoint
DROP TABLE `space_project`;
--> statement-breakpoint
DROP INDEX `space_id_organization`;
--> statement-breakpoint
DROP INDEX `space_organization_name`;
--> statement-breakpoint
DROP TABLE `space`;
