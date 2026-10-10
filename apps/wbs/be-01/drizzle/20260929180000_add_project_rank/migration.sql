-- Project rank (WBS 010.4.16, `share-people-across-projects`, ADR 0034): the
-- organization's total order over its projects. A ranked project holds one
-- row; ranked projects order by position then project id, and every unranked
-- one follows them by creation. The row carries its organization and
-- references `project_organization(resource_id, organization_id)`, the
-- `project_solution` and `space_project` device: a rank naming a project of
-- another organization has no parent, so SQLite refuses it whatever the
-- service does. Deleting a project cascades through `project_organization`
-- and takes its rank.
--
-- Proof, observed 2026-09-29 in `project-rank.db.test.ts`: with the composite
-- reference dropped, `refuses a rank naming another organization's project`
-- stored the row instead of failing on `FOREIGN KEY constraint failed`.
--
-- Additive: one new table the outgoing colour never reads or writes.
CREATE TABLE `project_rank` (
	`project_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text NOT NULL REFERENCES `users`(`id`),
	FOREIGN KEY (`project_id`, `organization_id`) REFERENCES `project_organization`(`resource_id`, `organization_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `project_rank_order` ON `project_rank` (`organization_id`,`position`,`project_id`);
