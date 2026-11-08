-- foreign-keys-off-rebuild
-- migration-lint: compatible-table-rebuild
-- Facts keyed by measure definition (`wbs-measure-budgets` D4, task 1.3):
-- `step_measure` gains `measure_id`, a reference to `measure`, and `metric`
-- becomes nullable so a fact on a defined measure (`cost`, `gpu_minutes`) is a
-- row with no legacy name. Rebuilt because SQLite cannot relax `NOT NULL` or
-- move a primary key in place; columns and rows are kept.
--
-- Compatible with the outgoing release, which shares this file mid-swap:
-- - `metric` keeps its CHECK under its stored name `role_measure_metric`;
--   every row that existed, and every row either release writes for tokens,
--   hours or the token estimate, carries its legacy name, so the old reads
--   answer exactly as before.
-- - The old primary key becomes the unique index `step_measure_metric_key`
--   on the same three columns, which is what the old release's upsert
--   (`ON CONFLICT (work_item_id, step_id, metric)`) names; NULL metrics are
--   distinct in it, and `step_measure_measure_key` holds one fact per
--   definition per step node.
-- - The old release inserts `metric` alone. `step_measure_keys_legacy_fact`
--   fills `measure_id` for its `token_actual` and `hours_actual` rows inside
--   the inserting statement, from the owning organization's `tokens` or
--   `hours` definition; the new release writes legacy facts the same way.
-- - A project no organization owns has no definitions: its facts keep a NULL
--   `measure_id` until `project_organization_keys_measure_facts` keys them in
--   the statement that maps the project (design D19).
-- - `token_estimate` rows stay unkeyed (NULL `measure_id`): slice 3 turns them
--   into single-point trios, and keying them to `tokens` would collide with
--   the tokens fact in `step_measure_measure_key` (design D18).
-- A fact on a defined measure is a row the outgoing release cannot name; none
-- exists until the new release writes one, and `down.sql` refuses while any does.
--
-- Proof, observed 2026-10-23 in `step-measure-key-migration.db.test.ts`: the
-- back-fill made `CASE WHEN 0` failed `keys every existing token and hours
-- fact to its organization's definition`; `WHEN 0` on the insert trigger
-- failed `keys a fact the outgoing release inserts by metric alone, and takes
-- its upsert`; the project-mapping trigger's UPDATE replaced by `SELECT 1`
-- failed `keys an unowned project's facts when an organization takes it`; the
-- `step_measure_measure_key` index made plain failed `holds one fact per
-- definition and step node, and refuses a row naming nothing`.
CREATE TABLE `step_measure_new` (
	`work_item_id` text NOT NULL,
	"step_id" text NOT NULL,
	`metric` text,
	`measure_id` text REFERENCES `measure`(`id`),
	`value` real NOT NULL,
	`recorded_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CONSTRAINT `fk_role_measure_work_item_id_work_item_id_fk` FOREIGN KEY (`work_item_id`) REFERENCES `work_item`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_role_measure_role_id_role_id_fk` FOREIGN KEY ("step_id") REFERENCES "step"(`id`),
	CONSTRAINT `role_measure_metric` CHECK (`metric` IN ('token_estimate', 'token_actual', 'hours_actual')),
	CONSTRAINT `step_measure_addressed` CHECK (`metric` IS NOT NULL OR `measure_id` IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `step_measure_new`
	(`work_item_id`, `step_id`, `metric`, `measure_id`, `value`, `recorded_at`, `created_at`, `updated_at`, `created_by`)
SELECT sm.`work_item_id`, sm.`step_id`, sm.`metric`,
	CASE WHEN sm.`metric` IN ('token_actual', 'hours_actual') THEN (
		SELECT m.`id` FROM `work_item` AS w
		JOIN `project_organization` AS po ON po.`resource_id` = w.`project_id`
		JOIN `measure` AS m ON m.`organization_id` = po.`organization_id`
			AND m.`key` = CASE sm.`metric` WHEN 'token_actual' THEN 'tokens' ELSE 'hours' END
		WHERE w.`id` = sm.`work_item_id`
	) END,
	sm.`value`, sm.`recorded_at`, sm.`created_at`, sm.`updated_at`, sm.`created_by`
FROM `step_measure` AS sm;
--> statement-breakpoint
DROP TABLE `step_measure`;
--> statement-breakpoint
ALTER TABLE `step_measure_new` RENAME TO `step_measure`;
--> statement-breakpoint
CREATE INDEX `step_measure_by_step` ON `step_measure` (`step_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `step_measure_metric_key` ON `step_measure` (`work_item_id`,`step_id`,`metric`);
--> statement-breakpoint
CREATE UNIQUE INDEX `step_measure_measure_key` ON `step_measure` (`work_item_id`,`step_id`,`measure_id`);
--> statement-breakpoint
CREATE INDEX `step_measure_by_measure` ON `step_measure` (`measure_id`);
--> statement-breakpoint
CREATE TRIGGER `step_measure_keys_legacy_fact`
AFTER INSERT ON `step_measure`
WHEN NEW.`measure_id` IS NULL AND NEW.`metric` IN ('token_actual', 'hours_actual')
BEGIN
	UPDATE `step_measure` SET `measure_id` = (
		SELECT m.`id` FROM `work_item` AS w
		JOIN `project_organization` AS po ON po.`resource_id` = w.`project_id`
		JOIN `measure` AS m ON m.`organization_id` = po.`organization_id`
			AND m.`key` = CASE NEW.`metric` WHEN 'token_actual' THEN 'tokens' ELSE 'hours' END
		WHERE w.`id` = NEW.`work_item_id`
	)
	WHERE `rowid` = NEW.`rowid`;
END;
--> statement-breakpoint
CREATE TRIGGER `project_organization_keys_measure_facts`
AFTER INSERT ON `project_organization`
BEGIN
	UPDATE `step_measure` SET `measure_id` = (
		SELECT m.`id` FROM `measure` AS m
		WHERE m.`organization_id` = NEW.`organization_id`
			AND m.`key` = CASE `step_measure`.`metric` WHEN 'token_actual' THEN 'tokens' ELSE 'hours' END
	)
	WHERE `measure_id` IS NULL AND `metric` IN ('token_actual', 'hours_actual')
		AND `work_item_id` IN (SELECT `id` FROM `work_item` WHERE `project_id` = NEW.`resource_id`);
END;
--> statement-breakpoint
CREATE TEMP TABLE `step_measure_key_fk_guard` (`violations` integer CHECK (`violations` = 0));
--> statement-breakpoint
INSERT INTO `step_measure_key_fk_guard` SELECT COUNT(*) FROM pragma_foreign_key_check;
