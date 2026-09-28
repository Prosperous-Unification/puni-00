-- Reverses `20260928010000_add_project_solution`.
--
-- A scoped link exists only after activation and has no legacy column to fall
-- back to, so the first statement fails its `CHECK` while any link is recorded
-- or the marker is anything but one well-formed `pre_activation` row. The
-- rollback runner reverts this script and its ledger row in one transaction.
-- Only then are the table and the index dropped.
-- Proof, observed 2026-09-28 in `project-solution.db.test.ts` after first
-- rolling back the newer email-verification migration: dropping the emptiness
-- predicate failed `refuses while a link is recorded`; dropping the exact
-- marker predicate failed `refuses with a missing or malformed marker, keeping
-- the table and the ledger` and `refuses after activation even with no link`.
-- The row-count predicate is shadowed by the single-row marker trigger.
CREATE TEMP TABLE `project_solution_down_check` (
	`reversible` integer NOT NULL,
	CONSTRAINT `project_solution_must_be_reversible` CHECK (`reversible` = 1)
);
--> statement-breakpoint
INSERT INTO `project_solution_down_check` (`reversible`)
SELECT (SELECT COUNT(*) FROM `project_solution`) = 0
	AND (SELECT COUNT(*) FROM `organization_activation`) = 1
	AND (SELECT COUNT(*) FROM `organization_activation`
		WHERE `singleton` = 1 AND `state` = 'pre_activation' AND `activated_at` IS NULL) = 1;
--> statement-breakpoint
DROP TABLE `project_solution_down_check`;
--> statement-breakpoint
DROP INDEX `project_solution_organization_slug`;
--> statement-breakpoint
DROP TABLE `project_solution`;
--> statement-breakpoint
DROP INDEX `project_organization_resource_organization`;
