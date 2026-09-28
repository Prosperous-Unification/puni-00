-- Solution references scoped by organization (task 3.5 of
-- `organization-ownership-and-access`). `project.solution_slug` is unique
-- across the deployment, so after activation one organization's link would
-- collide with, and so reveal, another's. A scoped link lives here instead,
-- unique within its organization; the legacy columns keep serving links
-- written before activation, and a project never holds both.
--
-- The organization is carried beside the project so the uniqueness can name
-- it, and the composite reference keeps it equal to the project's frozen
-- owner: a row naming any other organization has no parent.
--
-- Proof, observed 2026-09-28 in `project-solution.db.test.ts`: dropping the
-- composite reference failed `refuses a link naming an organization other
-- than its project's owner`.
--
-- Additive: one index on an existing table, whose primary key already makes
-- the pair unique, and a new table the outgoing release never reads or writes.
CREATE UNIQUE INDEX `project_organization_resource_organization` ON `project_organization` (`resource_id`,`organization_id`);
--> statement-breakpoint
CREATE TABLE `project_solution` (
	`project_id` text PRIMARY KEY NOT NULL REFERENCES `project`(`id`) ON DELETE CASCADE,
	`organization_id` text NOT NULL,
	`slug` text NOT NULL CHECK (length(`slug`) > 0),
	`url` text NOT NULL CHECK (length(`url`) > 0),
	FOREIGN KEY (`project_id`, `organization_id`) REFERENCES `project_organization`(`resource_id`, `organization_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_solution_organization_slug` ON `project_solution` (`organization_id`,`slug`);
