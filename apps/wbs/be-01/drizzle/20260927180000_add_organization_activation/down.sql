-- Reverses `20260927180000_add_organization_activation`.
--
-- Safe only before activation, so the first statement checks for exactly one
-- well-formed `pre_activation` row and fails the `CHECK` otherwise: an
-- activated, missing or malformed marker all refuse, and the rollback runner
-- reverts this script, and its ledger row, in one transaction. Only then are
-- the row, the triggers and the table dropped.
-- Proof, observed 2026-09-27 in `organization-activation.db.test.ts`: `CHECK (1)`
-- failed the five `refuses rollback across` cases for a missing row, second row,
-- wrong singleton, unknown state and time before activation; removing the row
-- count, singleton, state or null-time predicate alone failed its own case.
CREATE TEMP TABLE `organization_activation_down_check` (
	`pre_activation` integer NOT NULL,
	CONSTRAINT `organization_activation_must_be_pre_activation` CHECK (`pre_activation` = 1)
);
--> statement-breakpoint
INSERT INTO `organization_activation_down_check` (`pre_activation`)
SELECT (SELECT COUNT(*) FROM `organization_activation`) = 1
	AND (SELECT COUNT(*) FROM `organization_activation`
		WHERE `singleton` = 1 AND `state` = 'pre_activation' AND `activated_at` IS NULL) = 1;
--> statement-breakpoint
DROP TABLE `organization_activation_down_check`;
--> statement-breakpoint
DELETE FROM `organization_activation`;
--> statement-breakpoint
DROP TRIGGER `organization_activation_single_row`;
--> statement-breakpoint
DROP TRIGGER `organization_activation_no_revert`;
--> statement-breakpoint
DROP TRIGGER `organization_activation_no_delete`;
--> statement-breakpoint
DROP TABLE `organization_activation`;
