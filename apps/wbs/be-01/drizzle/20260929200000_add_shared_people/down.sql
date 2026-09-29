-- Reverses `20260929200000_add_shared_people`.
--
-- Refuses while any organization is shared: an older release cannot read the
-- column and would schedule a shared organization's projects as isolated, and
-- dropping it would lose which organizations chose to share. The modes are
-- saved and reset first with `shared-people-rollback-cli.ts save|remove`, and
-- restored after a later forward run with `restore`
-- (docs/runbook-prod-deploy.md#shared-people-rollback). Ranks are guarded by
-- `20260929180000_add_project_rank`'s own down script. The CHECK's name is the
-- message the operator reads, so it carries the procedure.
--
-- Proof, observed 2026-09-29 in `shared-people-rollback.db.test.ts`: with the guard's
-- INSERT removed, `refuses while an organization is shared, keeping the
-- column and the ledger` failed because the rollback dropped the column.
CREATE TEMP TABLE `shared_people_rollback_guard` (
	`shared` integer NOT NULL,
	CONSTRAINT "organizations share people: save and reset them with shared-people-rollback-cli.ts save|remove first, then rerun migrate-down-cli.ts --to=<baseline>, and restore after the next forward run; see docs/runbook-prod-deploy.md#shared-people-rollback" CHECK (`shared` = 0)
);
--> statement-breakpoint
INSERT INTO `shared_people_rollback_guard` (`shared`) SELECT COUNT(*) FROM `organization` WHERE `shared_people` = 1;
--> statement-breakpoint
DROP TABLE `shared_people_rollback_guard`;
--> statement-breakpoint
ALTER TABLE `organization` DROP COLUMN `shared_people`;
