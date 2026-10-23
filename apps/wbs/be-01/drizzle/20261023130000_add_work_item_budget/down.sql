-- Reverses `20261023130000_add_work_item_budget`, refusing while anything the
-- older schema cannot hold exists: a stated budget, a project budget factor
-- other than 1, or a priced fact or trio (a non-NULL rate card digest).
-- Dropping the table or the columns would discard each of them. Otherwise the
-- trigger, the table and the five columns go.
--
-- Proof, observed 2026-10-23 in `work-item-budget-migration.db.test.ts`: the
-- guard's comparison made `>= 0` made `refuses rollback while a budget, a
-- factor or a priced figure exists, keeping it` drop the table with the budget.
CREATE TEMP TABLE `work_item_budget_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "budgets, budget factors or priced figures exist: record every work_item_budget row, every project whose budget_factor is not 1, and every step_measure or measure_estimate row whose rate_card_digest is set; remove each with clearBudget, a project patch back to budgetFactor 1, and clearMeasure or clearMeasureEstimate (or by hand) before migrate-down-cli.ts --to=<baseline>; no automatic recovery tool exists for them" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `work_item_budget_down_check` (`empty`)
SELECT (
	(SELECT COUNT(*) FROM `work_item_budget`)
	+ (SELECT COUNT(*) FROM `project` WHERE `budget_factor` != 1)
	+ (SELECT COUNT(*) FROM `step_measure` WHERE `rate_card_digest` IS NOT NULL)
	+ (SELECT COUNT(*) FROM `measure_estimate` WHERE `rate_card_digest` IS NOT NULL)
) = 0;
--> statement-breakpoint
DROP TABLE `work_item_budget_down_check`;
--> statement-breakpoint
DROP TRIGGER `project_organization_keys_work_item_budgets`;
--> statement-breakpoint
DROP TABLE `work_item_budget`;
--> statement-breakpoint
ALTER TABLE `measure_estimate` DROP COLUMN `rate_card_digest`;
--> statement-breakpoint
ALTER TABLE `measure_estimate` DROP COLUMN `currency`;
--> statement-breakpoint
ALTER TABLE `step_measure` DROP COLUMN `rate_card_digest`;
--> statement-breakpoint
ALTER TABLE `step_measure` DROP COLUMN `currency`;
--> statement-breakpoint
ALTER TABLE `project` DROP COLUMN `budget_factor`;
