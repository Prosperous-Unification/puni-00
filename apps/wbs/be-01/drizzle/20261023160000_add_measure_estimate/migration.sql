-- Three-point estimates per measure (`wbs-measure-budgets` D3, tasks 2.1 and
-- 2.3): one trio per step node and measure other than time, in the measure's
-- unit and scale, ordered as the time trio is. Additive: a new table, its
-- back-fill and four triggers; no existing column changes. The time trio stays
-- in `estimate`, the solver's only input (D2).
--
-- `measure_key` is the identity and `measure_id` the reference: a project no
-- organization owns has no definitions and keeps NULL until
-- `project_organization_keys_measure_estimates` keys its trios in the
-- statement that maps the project, as its facts are (design D19). The
-- reference has no `ON DELETE`, so a definition holding a trio cannot go.
--
-- The legacy `token_estimate` rows become single-point `tokens` trios
-- (`single_point = 1`), and stay in `step_measure` for the outgoing release,
-- which reads and writes only them (design D28). The single-point trio and the
-- legacy row are one figure, kept in step here:
-- - `step_measure_mirrors_token_estimate_insert` and `..._update` write the
--   single-point trio for every legacy row any release inserts, rewrites or
--   moves (a hand-down's `moveAll`), replacing a three-point trio there, which
--   is what writing the old single figure means;
-- - `step_measure_mirrors_token_estimate_delete` takes the single-point trio
--   with its legacy row, and leaves a three-point trio alone;
-- - the new release writes a three-point trio here and deletes the legacy row
--   itself, so a single figure is never shown for a range
--   (`MeasureEstimateRepository` in store-sqlite `measure-estimate.ts`).
--
-- Proof, observed 2026-10-23 in `measure-estimate-migration.db.test.ts`: the
-- back-fill made `WHERE 0` failed `turns every legacy token estimate into a
-- single-point tokens trio, keyed to its organization`; the insert trigger's
-- WHEN made `0` failed `mirrors a token estimate the outgoing release writes,
-- and takes it with its delete`; the update trigger's WHEN made `0` failed
-- `moves the single-point trio with its legacy row`; the delete trigger's
-- WHEN made `0` failed the insert-and-delete case; the ordering CHECK made
-- `CHECK (1)` failed `refuses an unordered trio and a single point that is
-- not one`; the keying trigger's UPDATE replaced by `SELECT 1` failed `keys an
-- unowned project's trios when an organization takes it`.
CREATE TABLE `measure_estimate` (
	`work_item_id` text NOT NULL REFERENCES `work_item`(`id`) ON DELETE CASCADE,
	`step_id` text NOT NULL REFERENCES `step`(`id`),
	`measure_key` text NOT NULL,
	`measure_id` text REFERENCES `measure`(`id`),
	`optimistic` real NOT NULL,
	`realistic` real NOT NULL,
	`pessimistic` real NOT NULL,
	`single_point` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY (`work_item_id`, `step_id`, `measure_key`),
	CONSTRAINT `measure_estimate_ordered` CHECK (0 <= `optimistic` AND `optimistic` <= `realistic` AND `realistic` <= `pessimistic`),
	CONSTRAINT `measure_estimate_single_point` CHECK (`single_point` IN (0, 1) AND (`single_point` = 0 OR (`measure_key` = 'tokens' AND `optimistic` = `realistic` AND `realistic` = `pessimistic`)))
);
--> statement-breakpoint
CREATE INDEX `measure_estimate_by_step` ON `measure_estimate` (`step_id`);
--> statement-breakpoint
CREATE INDEX `measure_estimate_by_measure` ON `measure_estimate` (`measure_id`);
--> statement-breakpoint
INSERT INTO `measure_estimate`
	(`work_item_id`, `step_id`, `measure_key`, `measure_id`, `optimistic`, `realistic`, `pessimistic`, `single_point`, `created_at`, `updated_at`, `created_by`)
SELECT sm.`work_item_id`, sm.`step_id`, 'tokens', (
		SELECT m.`id` FROM `work_item` AS w
		JOIN `project_organization` AS po ON po.`resource_id` = w.`project_id`
		JOIN `measure` AS m ON m.`organization_id` = po.`organization_id` AND m.`key` = 'tokens'
		WHERE w.`id` = sm.`work_item_id`
	),
	sm.`value`, sm.`value`, sm.`value`, 1, sm.`created_at`, sm.`updated_at`, sm.`created_by`
FROM `step_measure` AS sm
WHERE sm.`metric` = 'token_estimate';
--> statement-breakpoint
CREATE TRIGGER `step_measure_mirrors_token_estimate_insert`
AFTER INSERT ON `step_measure`
WHEN NEW.`metric` = 'token_estimate'
BEGIN
	INSERT INTO `measure_estimate`
		(`work_item_id`, `step_id`, `measure_key`, `measure_id`, `optimistic`, `realistic`, `pessimistic`, `single_point`, `created_at`, `updated_at`, `created_by`)
	SELECT NEW.`work_item_id`, NEW.`step_id`, 'tokens', (
			SELECT m.`id` FROM `work_item` AS w
			JOIN `project_organization` AS po ON po.`resource_id` = w.`project_id`
			JOIN `measure` AS m ON m.`organization_id` = po.`organization_id` AND m.`key` = 'tokens'
			WHERE w.`id` = NEW.`work_item_id`
		),
		NEW.`value`, NEW.`value`, NEW.`value`, 1, NEW.`created_at`, NEW.`updated_at`, NEW.`created_by`
	WHERE 1
	ON CONFLICT (`work_item_id`, `step_id`, `measure_key`) DO UPDATE SET
		`optimistic` = excluded.`optimistic`, `realistic` = excluded.`realistic`,
		`pessimistic` = excluded.`pessimistic`, `single_point` = 1,
		`updated_at` = excluded.`updated_at`;
END;
--> statement-breakpoint
CREATE TRIGGER `step_measure_mirrors_token_estimate_update`
AFTER UPDATE OF `work_item_id`, `step_id`, `metric`, `value` ON `step_measure`
WHEN OLD.`metric` = 'token_estimate' OR NEW.`metric` = 'token_estimate'
BEGIN
	DELETE FROM `measure_estimate`
	WHERE OLD.`metric` = 'token_estimate' AND `work_item_id` = OLD.`work_item_id`
		AND `step_id` = OLD.`step_id` AND `measure_key` = 'tokens' AND `single_point` = 1;
	INSERT INTO `measure_estimate`
		(`work_item_id`, `step_id`, `measure_key`, `measure_id`, `optimistic`, `realistic`, `pessimistic`, `single_point`, `created_at`, `updated_at`, `created_by`)
	SELECT NEW.`work_item_id`, NEW.`step_id`, 'tokens', (
			SELECT m.`id` FROM `work_item` AS w
			JOIN `project_organization` AS po ON po.`resource_id` = w.`project_id`
			JOIN `measure` AS m ON m.`organization_id` = po.`organization_id` AND m.`key` = 'tokens'
			WHERE w.`id` = NEW.`work_item_id`
		),
		NEW.`value`, NEW.`value`, NEW.`value`, 1, NEW.`created_at`, NEW.`updated_at`, NEW.`created_by`
	WHERE NEW.`metric` = 'token_estimate'
	ON CONFLICT (`work_item_id`, `step_id`, `measure_key`) DO UPDATE SET
		`optimistic` = excluded.`optimistic`, `realistic` = excluded.`realistic`,
		`pessimistic` = excluded.`pessimistic`, `single_point` = 1,
		`updated_at` = excluded.`updated_at`;
END;
--> statement-breakpoint
CREATE TRIGGER `step_measure_mirrors_token_estimate_delete`
AFTER DELETE ON `step_measure`
WHEN OLD.`metric` = 'token_estimate'
BEGIN
	DELETE FROM `measure_estimate`
	WHERE `work_item_id` = OLD.`work_item_id` AND `step_id` = OLD.`step_id`
		AND `measure_key` = 'tokens' AND `single_point` = 1;
END;
--> statement-breakpoint
CREATE TRIGGER `project_organization_keys_measure_estimates`
AFTER INSERT ON `project_organization`
BEGIN
	UPDATE `measure_estimate` SET `measure_id` = (
		SELECT m.`id` FROM `measure` AS m
		WHERE m.`organization_id` = NEW.`organization_id` AND m.`key` = `measure_estimate`.`measure_key`
	)
	WHERE `measure_id` IS NULL
		AND `work_item_id` IN (SELECT `id` FROM `work_item` WHERE `project_id` = NEW.`resource_id`);
END;
