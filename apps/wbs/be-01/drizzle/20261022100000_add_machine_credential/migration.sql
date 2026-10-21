-- Machine credentials (`wbs-machine-credentials` task 1.1, design A9, A16,
-- A21, A22). Three new tables the outgoing release never reads or writes, so
-- the migration is additive.
--
-- `organization_trusted_issuer`: an OIDC issuer an organization admin trusts
-- for headless machines; its `jwks_uri` is the one discovered at registration.
--
-- `machine_credential`: one credential of one organization, pinned to one
-- person and recording the account that issued it. The source decides which
-- columns are set: an API key has none of the pair, trusted issuer or family;
-- an OIDC credential has its issuer, subject and trusted issuer; an MCP
-- consent credential has its family only. The id is a lowercase UUID because
-- an API key carries it in the clear (`wbs_mk_<id>.<secret>`, A22).
--
-- `machine_credential_secret`: only the SHA-256 digest of an API key's secret,
-- one row per secret so a rotation holds two with their own expiries. It is
-- read only through `credential_id` (A22), so no index lets anything look a
-- digest up.
--
-- Proof, observed 2026-10-22 in `machine-credential-migration.db.test.ts`:
-- the per-source CHECK replaced by `CHECK (1)` made `refuses a credential
-- whose columns contradict its source` store an API key carrying a subject;
-- the partial pair index made non-unique made `keeps one OIDC pair on one
-- credential` store the second credential.
CREATE TABLE `organization_trusted_issuer` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`issuer` text NOT NULL CHECK (`issuer` LIKE 'https://%' AND length(`issuer`) <= 2048),
	`jwks_uri` text NOT NULL CHECK (`jwks_uri` LIKE 'https://%' AND length(`jwks_uri`) <= 2048),
	`default_audience` text CHECK (`default_audience` IS NULL OR length(`default_audience`) BETWEEN 1 AND 512),
	`sso_connection_id` text REFERENCES `organization_sso_connection`(`id`),
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_trusted_issuer_issuer` ON `organization_trusted_issuer` (`organization_id`, `issuer`);
--> statement-breakpoint
CREATE INDEX `organization_trusted_issuer_by_issuer` ON `organization_trusted_issuer` (`issuer`);
--> statement-breakpoint
CREATE TABLE `machine_credential` (
	`id` text PRIMARY KEY NOT NULL CHECK (length(`id`) = 36 AND `id` NOT GLOB '*[^0-9a-f-]*'),
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`person_id` text NOT NULL REFERENCES `person`(`id`),
	`issued_by` text NOT NULL REFERENCES `users`(`id`),
	`source` text NOT NULL CHECK (`source` IN ('api_key', 'oidc', 'mcp_consent')),
	`name` text NOT NULL CHECK (length(`name`) BETWEEN 1 AND 80),
	`issuer` text,
	`subject` text CHECK (`subject` IS NULL OR length(`subject`) BETWEEN 1 AND 512),
	`audience` text CHECK (`audience` IS NULL OR length(`audience`) BETWEEN 1 AND 512),
	`trusted_issuer_id` text REFERENCES `organization_trusted_issuer`(`id`),
	`mcp_family_id` text CHECK (`mcp_family_id` IS NULL OR length(`mcp_family_id`) BETWEEN 1 AND 128),
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CONSTRAINT `machine_credential_source_columns` CHECK (
		(`source` = 'api_key' AND `issuer` IS NULL AND `subject` IS NULL AND `audience` IS NULL
			AND `trusted_issuer_id` IS NULL AND `mcp_family_id` IS NULL)
		OR (`source` = 'oidc' AND `issuer` IS NOT NULL AND `subject` IS NOT NULL
			AND `trusted_issuer_id` IS NOT NULL AND `mcp_family_id` IS NULL)
		OR (`source` = 'mcp_consent' AND `issuer` IS NULL AND `subject` IS NULL AND `audience` IS NULL
			AND `trusted_issuer_id` IS NULL AND `mcp_family_id` IS NOT NULL)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machine_credential_pair` ON `machine_credential` (`issuer`, `subject`) WHERE `source` = 'oidc';
--> statement-breakpoint
CREATE UNIQUE INDEX `machine_credential_family` ON `machine_credential` (`mcp_family_id`) WHERE `mcp_family_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `machine_credential_live_name` ON `machine_credential` (`organization_id`, `name`) WHERE `revoked_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `machine_credential_organization` ON `machine_credential` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `machine_credential_person` ON `machine_credential` (`person_id`);
--> statement-breakpoint
CREATE TABLE `machine_credential_secret` (
	`id` text PRIMARY KEY NOT NULL,
	`credential_id` text NOT NULL REFERENCES `machine_credential`(`id`),
	`digest` text NOT NULL CHECK (length(`digest`) = 64 AND `digest` NOT GLOB '*[^0-9a-f]*'),
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `machine_credential_secret_credential` ON `machine_credential_secret` (`credential_id`);
