-- Proof: independently replacing either count with zero fails its shared/rank rollback negative.
CREATE TEMP TABLE `shared_people_rollback_guard` (
  `shared` integer NOT NULL,
  `ranks` integer NOT NULL,
  CONSTRAINT "shared organizations exist: use shared-people-rollback-cli.ts save|remove|restore; see docs/runbook-prod-deploy.md#shared-people-rollback" CHECK (`shared` = 0),
  CONSTRAINT "project ranks exist: use shared-people-rollback-cli.ts save|remove|restore; see docs/runbook-prod-deploy.md#shared-people-rollback" CHECK (`ranks` = 0)
);
--> statement-breakpoint
INSERT INTO `shared_people_rollback_guard` (`shared`, `ranks`)
SELECT (SELECT COUNT(*) FROM `organization` WHERE `shared_people` <> 0), (SELECT COUNT(*) FROM `project_rank`);
--> statement-breakpoint
DROP TABLE `shared_people_rollback_guard`;
--> statement-breakpoint
ALTER TABLE `organization` DROP COLUMN `shared_people`;
