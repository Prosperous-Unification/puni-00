-- A resource's directory capacity (`wbs-shared-occupancy` task 1.1, design
-- S1): the units of it that exist for every project of its organization. A
-- satellite of `resource`, so `resource` rows and the plan export stay as they
-- are: a row is stated, its absence unstated, and unlike a project's capacity
-- nothing is remembered. Additive: an outgoing release never reads it, so
-- during a blue/green swap the old process checks per project only.
--
-- Proof, observed 2026-10-25 in `directory-capacity-migration.db.test.ts`:
-- with the `typeof` half of the CHECK removed, `refuses a negative or a text
-- directory capacity` stored the text 'sixteen'.
CREATE TABLE `resource_directory_capacity` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `resource`(`id`) ON DELETE CASCADE,
	`units` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CONSTRAINT `resource_directory_capacity_units` CHECK (typeof(`units`) = 'integer' AND `units` >= 0)
);
