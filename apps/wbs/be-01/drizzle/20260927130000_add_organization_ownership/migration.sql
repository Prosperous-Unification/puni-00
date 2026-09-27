-- Which organization owns each root resource (task 1.4 of
-- `organization-ownership-and-access`), as one side table per root.
--
-- **Side tables, not a nullable `organization_id` column.** Absence of a row
-- is the one spelling of "unmapped", which is what the activation
-- reconciliation counts, and every present row names a real organization. The
-- outgoing release keeps inserting roots without knowing these tables exist;
-- the bridge release and the idempotent backfill map them.
--
-- **Catalog names live here too.** `person_name`, `tag_name` and the other
-- global name indexes stay exactly as they are: no index added beside them can
-- let two rows share `tag.name`, and dropping them is not additive. Each
-- catalog side table carries the display name under `UNIQUE (organization_id,
-- name)`, which is what lets two organizations both hold `urgent` once
-- organization-aware releases read names from here. Until activation the
-- legacy name is authoritative and the bridge keeps the two equal.
--
-- `ON DELETE CASCADE` on `resource_id` is for the outgoing release: it deletes
-- a tag knowing nothing of `tag_organization`, and a plain reference would
-- turn that delete into a foreign-key failure mid-swap.
--
-- Proof, each fault applied to all eight tables alone, observed 2026-09-27 in
-- `organization-ownership.db.test.ts`: dropping `NOT NULL` from
-- `organization_id`, its reference to `organization`, or the `resource_id`
-- primary key failed all eight `refuses a malformed … ownership row` cases;
-- dropping the root reference failed those eight and the round trip; dropping
-- `ON DELETE CASCADE` failed `lets the outgoing release delete a mapped root`;
-- making the `*_organization_name` indexes non-unique failed the six `refuses
-- one … name twice in one organization` cases and `holds the same catalog name
-- in two organizations, once each`.
CREATE TABLE `person_organization` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `person`(`id`) ON DELETE CASCADE,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_organization_name` ON `person_organization` (`organization_id`,`name`);
--> statement-breakpoint
CREATE TABLE `service_team_organization` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `service_team`(`id`) ON DELETE CASCADE,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_team_organization_name` ON `service_team_organization` (`organization_id`,`name`);
--> statement-breakpoint
CREATE TABLE `service_organization` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `service`(`id`) ON DELETE CASCADE,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_organization_name` ON `service_organization` (`organization_id`,`name`);
--> statement-breakpoint
CREATE TABLE `tag_organization` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `tag`(`id`) ON DELETE CASCADE,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_organization_name` ON `tag_organization` (`organization_id`,`name`);
--> statement-breakpoint
CREATE TABLE `work_item_type_organization` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `work_item_type`(`id`) ON DELETE CASCADE,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_item_type_organization_name` ON `work_item_type_organization` (`organization_id`,`name`);
--> statement-breakpoint
CREATE TABLE `external_system_organization` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `external_system`(`id`) ON DELETE CASCADE,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_system_organization_name` ON `external_system_organization` (`organization_id`,`name`);
--> statement-breakpoint
CREATE TABLE `project_organization` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `project`(`id`) ON DELETE CASCADE,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`)
);
--> statement-breakpoint
CREATE INDEX `project_organization_organization` ON `project_organization` (`organization_id`);
--> statement-breakpoint
CREATE TABLE `saved_plan_organization` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `saved_plan`(`id`) ON DELETE CASCADE,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`)
);
--> statement-breakpoint
CREATE INDEX `saved_plan_organization_organization` ON `saved_plan_organization` (`organization_id`);
