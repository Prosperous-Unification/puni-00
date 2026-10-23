-- foreign-keys-off-rebuild
-- Reverses `20261023150000_key_step_measure`, refusing while any fact is on a
-- measure the legacy `metric` cannot express (a row whose `metric` is NULL):
-- dropping `measure_id` would discard it. Otherwise the table is rebuilt in
-- the shape it had, primary key and constraint names included, keeping every
-- row; `measure_id` is dropped, since every remaining row carries its legacy
-- name, and the project-mapping trigger goes with it.
--
-- Proof, observed 2026-10-23 in `step-measure-key-migration.db.test.ts`: the
-- guard's count replaced by `0` made `refuses rollback while a fact is on a
-- defined measure, keeping it` drop the `gpu_minutes` fact on the narrow
-- table's NOT NULL instead of refusing by name.
CREATE TEMP TABLE `step_measure_key_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "facts on defined measures exist: record every step_measure row whose metric is NULL (a fact on a measure other than tokens and hours), remove each with clearMeasure (or by hand) before migrate-down-cli.ts --to=<baseline>; no automatic recovery tool exists for these facts" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `step_measure_key_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `step_measure` WHERE `metric` IS NULL) = 0;
--> statement-breakpoint
DROP TABLE `step_measure_key_down_check`;
--> statement-breakpoint
DROP TRIGGER `project_organization_keys_measure_facts`;
--> statement-breakpoint
CREATE TABLE `step_measure_new` (
	`work_item_id` text NOT NULL,
	"step_id" text NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`recorded_at` integer NOT NULL, `created_at` integer, `updated_at` integer, `created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY(`work_item_id`, "step_id", `metric`),
	CONSTRAINT `fk_role_measure_work_item_id_work_item_id_fk` FOREIGN KEY (`work_item_id`) REFERENCES `work_item`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_role_measure_role_id_role_id_fk` FOREIGN KEY ("step_id") REFERENCES "step"(`id`),
	CONSTRAINT `role_measure_metric` CHECK (`metric` IN ('token_estimate', 'token_actual', 'hours_actual'))
);
--> statement-breakpoint
INSERT INTO `step_measure_new`
	(`work_item_id`, `step_id`, `metric`, `value`, `recorded_at`, `created_at`, `updated_at`, `created_by`)
SELECT `work_item_id`, `step_id`, `metric`, `value`, `recorded_at`, `created_at`, `updated_at`, `created_by`
FROM `step_measure`;
--> statement-breakpoint
DROP TABLE `step_measure`;
--> statement-breakpoint
ALTER TABLE `step_measure_new` RENAME TO `step_measure`;
--> statement-breakpoint
CREATE INDEX `step_measure_by_step` ON `step_measure` (`step_id`);
