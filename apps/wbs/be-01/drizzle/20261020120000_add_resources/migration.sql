-- Resources, their per-project capacity and per-work-item demand
-- (`wbs-resources` R1, task 1.1). Additive: three new tables and the ownership
-- side table of the new directory root, with the legacy bridge and the
-- ownership freeze `service_team_organization` carries; no existing table
-- changes, so the outgoing release never sees any of it.
--
-- `resource` mirrors `service_team`: a directory root unique by name, here with
-- a kind and a unit label. `project_resource_capacity` mirrors
-- `project_team_capacity`: a row is a stated number, absence is unstated, and
-- both ends cascade. `work_item_resource_demand` mirrors `work_item_team`: a
-- satellite of the work item, cascading from it and from the resource, indexed
-- by resource for the directory usage.
--
-- Proof: each CHECK, the unique name index and each cascade removed alone
-- failed its own case in store-sqlite `resource-schema.db.test.ts`; the
-- bridge and freeze triggers are covered by the data-driven organization
-- tests that iterate `OWNED_ROOT_KINDS`. Watched 2026-10-20.
CREATE TABLE `resource` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`unit_label` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CONSTRAINT `resource_kind` CHECK (`kind` IN ('exclusive', 'divisible'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_name` ON `resource` (`name`);
--> statement-breakpoint
CREATE TABLE `project_resource_capacity` (
	`project_id` text NOT NULL REFERENCES `project`(`id`) ON DELETE CASCADE,
	`resource_id` text NOT NULL REFERENCES `resource`(`id`) ON DELETE CASCADE,
	`units` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY(`project_id`, `resource_id`),
	CONSTRAINT `project_resource_capacity_units` CHECK (typeof(`units`) = 'integer' AND `units` >= 0)
);
--> statement-breakpoint
CREATE INDEX `project_resource_capacity_by_resource` ON `project_resource_capacity` (`resource_id`);
--> statement-breakpoint
CREATE TABLE `work_item_resource_demand` (
	`work_item_id` text NOT NULL REFERENCES `work_item`(`id`) ON DELETE CASCADE,
	`resource_id` text NOT NULL REFERENCES `resource`(`id`) ON DELETE CASCADE,
	`units` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY(`work_item_id`, `resource_id`),
	CONSTRAINT `work_item_resource_demand_units` CHECK (typeof(`units`) = 'integer' AND `units` >= 1)
);
--> statement-breakpoint
CREATE INDEX `work_item_resource_demand_by_resource` ON `work_item_resource_demand` (`resource_id`);
--> statement-breakpoint
CREATE TABLE `resource_organization` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `resource`(`id`) ON DELETE CASCADE,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_organization_name` ON `resource_organization` (`organization_id`,`name`);
--> statement-breakpoint
CREATE TRIGGER `resource_organization_bridge`
AFTER INSERT ON `resource`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `resource_organization` (`resource_id`, `organization_id`, `name`)
	SELECT NEW.`id`, `organization`.`id`, NEW.`name` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `resource_organization_name_bridge`
AFTER UPDATE OF `name` ON `resource`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	UPDATE `resource_organization` SET `name` = NEW.`name`
	WHERE `resource_id` = NEW.`id`
		AND `organization_id` = (SELECT `id` FROM `organization` WHERE `legacy` = 1)
		AND (SELECT `state` FROM `organization_activation`) = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `resource_organization_frozen_insert`
BEFORE INSERT ON `resource_organization`
WHEN EXISTS (SELECT 1 FROM `resource_organization` WHERE `resource_id` = NEW.`resource_id`)
	OR EXISTS (SELECT 1 FROM `resource_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: resource_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `resource_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `resource_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: resource_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `resource_organization_frozen_delete`
BEFORE DELETE ON `resource_organization`
WHEN EXISTS (SELECT 1 FROM `resource` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: resource_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `resource_organization_frozen_name`
BEFORE UPDATE OF `name` ON `resource_organization`
WHEN EXISTS (SELECT 1 FROM `resource_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name` AND `resource_id` != OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: resource_organization name is held by another root');
END;
