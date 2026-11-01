-- The WBS projection of Dash's host pool (`dash-host-jobs` J10, tasks 5.1 and
-- 5.2). Additive only, since blue and green share this file mid-swap: the
-- outgoing release never names either addition.
--
-- `reserved_units` is what a host pool's ledger reserves of the resource,
-- beside the measured `usage_units` and never inside it; only a measured
-- report carries it, and a report without it reads as before. Nothing in
-- planning reads the column.
ALTER TABLE `resource_capacity_report` ADD COLUMN `reserved_units` integer CHECK (
	`reserved_units` IS NULL
	OR (typeof(`reserved_units`) = 'integer' AND `reserved_units` BETWEEN 0 AND 1000000000
		AND `outcome` = 'measured')
);
--> statement-breakpoint
-- One host job as its resource authority published it: owned by that
-- authority and its organization, never by a planning row, so deleting a
-- project, a work item or a person leaves it in place (the declaration keeps
-- the optional links as they were sent). `revision` is the authority's:
-- 1 registered, 2 returned with its settlement evidence.
CREATE TABLE `resource_host_job` (
	`use_id` text PRIMARY KEY NOT NULL,
	`authority_id` text NOT NULL REFERENCES `resource_authority`(`authority_id`),
	`organization_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`incarnation` text NOT NULL,
	`revision` integer NOT NULL CHECK (`revision` IN (1, 2)),
	`declaration` text NOT NULL CHECK (json_valid(`declaration`)),
	`state` text NOT NULL CHECK (`state` IN ('registered', 'release_verified')),
	`registered_at` integer NOT NULL,
	`released_at` integer,
	`evidence` text CHECK (`evidence` IS NULL OR json_valid(`evidence`)),
	CONSTRAINT `resource_host_job_settlement` CHECK (
		(`state` = 'registered' AND `revision` = 1 AND `released_at` IS NULL AND `evidence` IS NULL)
		OR (`state` = 'release_verified' AND `revision` = 2 AND `released_at` IS NOT NULL
			AND `evidence` IS NOT NULL)
	)
);
--> statement-breakpoint
CREATE INDEX `resource_host_job_provider` ON `resource_host_job` (`organization_id`, `provider_id`, `state`);
