-- An organization's own caps (`wbs-organization-limits` L6, task 1.1).
-- Additive: one new table no existing table or the outgoing release reads.
--
-- A missing row is the deployment default (the three
-- `ORGANIZATION_DEFAULT_*` variables be-01 refuses to boot without), never
-- "no cap": every cap is an integer from 0 to 1,000,000 and a row holds all
-- three, so a read never mixes a row with a default. There is no unlimited
-- value; an operator who wants no practical bound sets 1,000,000.
--
-- Proof: each CHECK replaced by `CHECK (1)` in turn failed exactly its own
-- column's case in store-sqlite `organization-limits-migration.db.test.ts`
-- (7 pass, 1 fail each); watched 2026-10-22.
CREATE TABLE `organization_limits` (
	`organization_id` text PRIMARY KEY NOT NULL REFERENCES `organization`(`id`),
	`max_agent_persons` integer NOT NULL,
	`max_concurrent_claims` integer NOT NULL,
	`max_capacity_units_per_resource` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CONSTRAINT `organization_limits_max_agent_persons` CHECK (typeof(`max_agent_persons`) = 'integer' AND `max_agent_persons` BETWEEN 0 AND 1000000),
	CONSTRAINT `organization_limits_max_concurrent_claims` CHECK (typeof(`max_concurrent_claims`) = 'integer' AND `max_concurrent_claims` BETWEEN 0 AND 1000000),
	CONSTRAINT `organization_limits_max_capacity_units_per_resource` CHECK (typeof(`max_capacity_units_per_resource`) = 'integer' AND `max_capacity_units_per_resource` BETWEEN 0 AND 1000000)
);
