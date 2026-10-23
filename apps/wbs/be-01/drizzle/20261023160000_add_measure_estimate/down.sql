-- Reverses `20261023160000_add_measure_estimate`, refusing while any trio is
-- one the legacy `token_estimate` row cannot express: a trio in any measure
-- but tokens, a three-point tokens trio, or a single-point one whose legacy
-- row is missing or disagrees (drifted state the triggers should have
-- prevented). Dropping the table would discard each of them. Otherwise every
-- single-point trio has its legacy row, which the outgoing release reads, and
-- the table and its triggers go.
--
-- Proof, observed 2026-10-23 in `measure-estimate-migration.db.test.ts`: the
-- guard's comparison made `>= 0` made `refuses rollback while a three-point or
-- defined trio exists, keeping it` drop the table with the trios.
CREATE TEMP TABLE `measure_estimate_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "measure estimates the legacy token estimate cannot hold exist: record every measure_estimate row whose measure_key is not tokens or whose single_point is 0 (and any single-point row without an equal step_measure token_estimate row), remove each with clearMeasureEstimate (or by hand) before migrate-down-cli.ts --to=<baseline>; no automatic recovery tool exists for these estimates" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `measure_estimate_down_check` (`empty`)
SELECT (
	SELECT COUNT(*) FROM `measure_estimate` AS me
	WHERE me.`measure_key` != 'tokens' OR me.`single_point` = 0
		OR NOT EXISTS (
			SELECT 1 FROM `step_measure` AS sm
			WHERE sm.`work_item_id` = me.`work_item_id` AND sm.`step_id` = me.`step_id`
				AND sm.`metric` = 'token_estimate' AND sm.`value` = me.`optimistic`
		)
) = 0;
--> statement-breakpoint
DROP TABLE `measure_estimate_down_check`;
--> statement-breakpoint
DROP TRIGGER `project_organization_keys_measure_estimates`;
--> statement-breakpoint
DROP TRIGGER `step_measure_mirrors_token_estimate_delete`;
--> statement-breakpoint
DROP TRIGGER `step_measure_mirrors_token_estimate_update`;
--> statement-breakpoint
DROP TRIGGER `step_measure_mirrors_token_estimate_insert`;
--> statement-breakpoint
DROP TABLE `measure_estimate`;
