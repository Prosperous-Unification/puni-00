-- Spaces (WBS 010.4.15, `add-spaces`, ADR 0033): an organization's named,
-- ordered set of its projects. Membership carries the organization and
-- references both `space(id, organization_id)` and
-- `project_organization(resource_id, organization_id)`, the
-- `project_solution` device: a pair joining a space and a project of
-- different organizations has no parent, so SQLite refuses it whatever the
-- service does. Deleting a project cascades through `project_organization`
-- out of every space; deleting a space takes only its membership.
--
-- Proof, observed 2026-09-29 in `space.db.test.ts`: dropping the project
-- reference let `(s-a, b1)` be stored naming org-a, and dropping the space
-- reference let it be stored naming org-b, each failing `refuses a membership
-- joining a space and a project of different organizations`; dropping the
-- project reference's `ON DELETE CASCADE` failed `removes a deleted project
-- from every space` on `FOREIGN KEY constraint failed`.
--
-- Additive: two new tables the outgoing colour never reads or writes. A space
-- is born organization-aware, so no bridge trigger maps it.
CREATE TABLE `space` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`name` text NOT NULL CHECK (length(`name`) > 0),
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text NOT NULL REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `space_organization_name` ON `space` (`organization_id`,`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `space_id_organization` ON `space` (`id`,`organization_id`);
--> statement-breakpoint
CREATE TABLE `space_project` (
	`space_id` text NOT NULL,
	`project_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text NOT NULL REFERENCES `users`(`id`),
	PRIMARY KEY (`space_id`, `project_id`),
	FOREIGN KEY (`space_id`, `organization_id`) REFERENCES `space`(`id`, `organization_id`) ON DELETE CASCADE,
	FOREIGN KEY (`project_id`, `organization_id`) REFERENCES `project_organization`(`resource_id`, `organization_id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `space_project_order` ON `space_project` (`space_id`,`position`);
--> statement-breakpoint
CREATE INDEX `space_project_project` ON `space_project` (`project_id`,`organization_id`);
