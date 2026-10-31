-- Agent pools (`wbs-mcp-agent-surface` task 6.1, design M7): one admin act
-- that made `size` agent persons and one API key each. A new table the
-- outgoing release never reads, and a nullable column on `machine_credential`
-- with no default, which the outgoing release's INSERT never names, so the
-- migration is additive.
--
-- `agent_pool`: the pool's organization-unique live name, its size as
-- created (a pool never gains a person, M7), its optional `expires_at`, judged
-- for every pool credential at admission, and `revoked_at`, set once when the
-- pool is revoked as a unit. A revoked pool's name is free again.
--
-- `machine_credential.agent_pool_id`: the pool a credential was issued by,
-- NULL for every credential issued alone. A re-key keeps the revoked keys on
-- the pool and adds the fresh ones beside them.
CREATE TABLE `agent_pool` (
	`id` text PRIMARY KEY NOT NULL CHECK (length(`id`) = 36 AND `id` NOT GLOB '*[^0-9a-f-]*'),
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`name` text NOT NULL CHECK (length(`name`) BETWEEN 1 AND 60),
	`size` integer NOT NULL CHECK (`size` BETWEEN 1 AND 100),
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_pool_live_name` ON `agent_pool` (`organization_id`, `name`) WHERE `revoked_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `agent_pool_organization` ON `agent_pool` (`organization_id`);
--> statement-breakpoint
ALTER TABLE `machine_credential` ADD COLUMN `agent_pool_id` text REFERENCES `agent_pool`(`id`);
--> statement-breakpoint
CREATE INDEX `machine_credential_agent_pool` ON `machine_credential` (`agent_pool_id`);
