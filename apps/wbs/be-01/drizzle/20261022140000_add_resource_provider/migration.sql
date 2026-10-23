-- Compute providers (`compute-providers` task 1.1, design P2, P3, P5):
-- two new tables and one nullable column, so the migration is additive and
-- the outgoing release, which never names any of them, is unaffected.
--
-- `compute_provider`: a provider instance one organization registered, with
-- its kind, a name unique in that organization and a display-only locator
-- WBS never dials.
--
-- `resource.provider_id`: the one instance that fulfils a resource, or null.
-- No `ON DELETE`: removing an instance clears its references in the same
-- transaction (cascade) or is refused `in_use`.
--
-- `resource_capacity_report`: the latest report per resource, no history.
-- It cascades from the resource, so the outgoing release's plain resource
-- delete meets no constraint it cannot see, and from the reporting person.
--
-- Proof, observed 2026-10-22 in `resource-provider-migration.db.test.ts`:
-- the outcome CHECK replaced by `CHECK (1)` made `refuses a report whose
-- columns contradict its outcome` store a measured report with a reason; the
-- name index made non-unique made `keeps one instance name per
-- organization` store the second `h4claw`.
CREATE TABLE `compute_provider` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`kind` text NOT NULL CHECK (`kind` IN ('ssh_host', 'docker', 'kubernetes', 'puni_pool')),
	`name` text NOT NULL CHECK (length(`name`) BETWEEN 1 AND 80),
	`locator` text NOT NULL CHECK (length(`locator`) BETWEEN 1 AND 256),
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compute_provider_name` ON `compute_provider` (`organization_id`, `name`);
--> statement-breakpoint
ALTER TABLE `resource` ADD COLUMN `provider_id` text REFERENCES `compute_provider`(`id`);
--> statement-breakpoint
CREATE INDEX `resource_provider` ON `resource` (`provider_id`);
--> statement-breakpoint
CREATE TABLE `resource_capacity_report` (
	`resource_id` text PRIMARY KEY NOT NULL REFERENCES `resource`(`id`) ON DELETE CASCADE,
	`provider_id` text NOT NULL REFERENCES `compute_provider`(`id`),
	`observed_at` integer NOT NULL CHECK (typeof(`observed_at`) = 'integer'),
	`cadence_seconds` integer NOT NULL CHECK (typeof(`cadence_seconds`) = 'integer' AND `cadence_seconds` BETWEEN 30 AND 86400),
	`outcome` text NOT NULL CHECK (`outcome` IN ('measured', 'unreachable')),
	`capacity_units` integer,
	`usage_units` integer,
	`reason` text,
	`reported_by_person_id` text NOT NULL REFERENCES `person`(`id`) ON DELETE CASCADE,
	`reported_at` integer NOT NULL,
	CONSTRAINT `resource_capacity_report_outcome_columns` CHECK (
		(`outcome` = 'measured' AND `reason` IS NULL
			AND typeof(`capacity_units`) = 'integer' AND `capacity_units` BETWEEN 0 AND 1000000000
			AND typeof(`usage_units`) = 'integer' AND `usage_units` BETWEEN 0 AND 1000000000)
		OR (`outcome` = 'unreachable' AND `capacity_units` IS NULL AND `usage_units` IS NULL
			AND length(`reason`) BETWEEN 1 AND 200)
	)
);
--> statement-breakpoint
CREATE INDEX `resource_capacity_report_provider` ON `resource_capacity_report` (`provider_id`);
--> statement-breakpoint
CREATE INDEX `resource_capacity_report_person` ON `resource_capacity_report` (`reported_by_person_id`);
