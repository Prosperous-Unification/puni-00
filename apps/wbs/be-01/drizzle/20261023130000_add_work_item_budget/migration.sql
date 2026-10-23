-- Budgets per work item and measure, the project budget factor and the money
-- basis (`wbs-measure-budgets` D5, D6, tasks 3.1–3.3). Additive: a new table,
-- its keying trigger and five nullable or defaulted columns; no existing
-- column changes.
--
-- `work_item_budget` holds stated budgets only (design D36): a derived budget
-- is computed on read from the pessimistic points and `project.budget_factor`
-- (D38) and never stored. `measure_key` is the identity and `measure_id` the
-- reference, as `measure_estimate` keys them (D30): a project no organization
-- owns keeps NULL until `project_organization_keys_work_item_budgets` keys its
-- budgets in the statement that maps the project. The reference has no
-- `ON DELETE`, so a definition holding a budget cannot go.
--
-- `currency` and `rate_card_digest` on `step_measure` and `measure_estimate`
-- record what a money figure was priced with (D43): both set or both NULL,
-- set by the new release on money definitions only. The outgoing release
-- writes neither, which reads as an unpriced figure.
--
-- Proof, observed 2026-10-23 in `work-item-budget-migration.db.test.ts`: the
-- policy CHECK made `CHECK (1)` failed `refuses a budget outside the two
-- policies, a negative cap and a half basis`; the keying trigger's UPDATE
-- replaced by `SELECT 1` failed `keys an unowned project's budgets when an
-- organization takes it`; the factor's CHECK made `CHECK (1)` failed `defaults
-- every project's budget factor to 1 and refuses 0`.
CREATE TABLE `work_item_budget` (
	`work_item_id` text NOT NULL REFERENCES `work_item`(`id`) ON DELETE CASCADE,
	`measure_key` text NOT NULL,
	`measure_id` text REFERENCES `measure`(`id`),
	`cap` real NOT NULL,
	`policy` text NOT NULL,
	`hold_per_attempt` real,
	`created_at` integer,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY (`work_item_id`, `measure_key`),
	CONSTRAINT `work_item_budget_policy` CHECK (`policy` IN ('strict', 'advisory')),
	CONSTRAINT `work_item_budget_figures` CHECK (`cap` >= 0 AND (`hold_per_attempt` IS NULL OR `hold_per_attempt` >= 0))
);
--> statement-breakpoint
CREATE INDEX `work_item_budget_by_measure` ON `work_item_budget` (`measure_id`);
--> statement-breakpoint
ALTER TABLE `project` ADD COLUMN `budget_factor` real DEFAULT 1 NOT NULL CHECK (`budget_factor` > 0 AND `budget_factor` <= 1000);
--> statement-breakpoint
ALTER TABLE `step_measure` ADD COLUMN `currency` text;
--> statement-breakpoint
ALTER TABLE `step_measure` ADD COLUMN `rate_card_digest` text CHECK ((`currency` IS NULL) = (`rate_card_digest` IS NULL));
--> statement-breakpoint
ALTER TABLE `measure_estimate` ADD COLUMN `currency` text;
--> statement-breakpoint
ALTER TABLE `measure_estimate` ADD COLUMN `rate_card_digest` text CHECK ((`currency` IS NULL) = (`rate_card_digest` IS NULL));
--> statement-breakpoint
CREATE TRIGGER `project_organization_keys_work_item_budgets`
AFTER INSERT ON `project_organization`
BEGIN
	UPDATE `work_item_budget` SET `measure_id` = (
		SELECT m.`id` FROM `measure` AS m
		WHERE m.`organization_id` = NEW.`organization_id` AND m.`key` = `work_item_budget`.`measure_key`
	)
	WHERE `measure_id` IS NULL
		AND `work_item_id` IN (SELECT `id` FROM `work_item` WHERE `project_id` = NEW.`resource_id`);
END;
