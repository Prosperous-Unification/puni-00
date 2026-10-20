-- The units each claim holds of its leaf's demand (`wbs-resources` R3, task
-- 2.2). Additive: one new table beside `claim`, which no existing table or the
-- outgoing release reads.
--
-- Every claim on a leaf carries a copy of the leaf's whole occupancy vector, so
-- a leaf's units of a resource are the largest copy among its claims: releasing
-- one of two claims leaves the other's copy, releasing the last takes the last.
-- A row goes with its claim and with its resource (`deleteResource` cascade).
--
-- Proof: the CHECK, the primary key and each cascade removed alone failed its
-- own case in store-sqlite `claim-occupancy-schema.db.test.ts`; watched 2026-10-20.
CREATE TABLE `claim_occupancy` (
	`claim_id` text NOT NULL REFERENCES `claim`(`id`) ON DELETE CASCADE,
	`resource_id` text NOT NULL REFERENCES `resource`(`id`) ON DELETE CASCADE,
	`units` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY(`claim_id`, `resource_id`),
	CONSTRAINT `claim_occupancy_units` CHECK (typeof(`units`) = 'integer' AND `units` >= 1)
);
--> statement-breakpoint
CREATE INDEX `claim_occupancy_by_resource` ON `claim_occupancy` (`resource_id`);
