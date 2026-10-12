-- Enterprise SSO, SCIM provisioning and session policy records
-- (`organization-enterprise-sso`, task 1.1; ADR 0049). Four new tables the
-- outgoing release never reads or writes, so the migration is additive.
--
-- `organization_sso_connection`: one Auth0 enterprise connection per verified
-- domain claim. A record is created unproven and unenforced; `proven_at` and
-- `proven_by` are set together by a super-admin's routed link, and only a
-- proven record may be enforced. The partial unique index lets at most one
-- PROVEN record name a given Auth0 connection, so an unproven duplicate
-- (a squatted name) blocks nobody.
--
-- `organization_scim_token`: only the SHA-256 digest of a provisioning token.
--
-- `organization_scim_user`: a SCIM `User` of one organization. Active and
-- unbound is a pending membership; `user_id`, `issuer` and `subject` are bound
-- together at activation.
--
-- `organization_session_policy`: a missing row is no policy. A row always
-- holds at least one bound; clearing the policy deletes the row.
--
-- Proof, observed 2026-10-12 in `enterprise-sso-migration.db.test.ts`: the
-- proven index made non-unique made `lets exactly one of two organizations
-- prove the same Auth0 connection` commit both proofs; the binding check
-- replaced by `CHECK (1)` made `binds a SCIM user's pair all together or not
-- at all` store a user id without its pair.
CREATE TABLE `organization_sso_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`domain_claim_id` text NOT NULL REFERENCES `organization_domain_claim`(`id`),
	`auth0_connection` text NOT NULL CHECK (length(`auth0_connection`) BETWEEN 1 AND 128 AND `auth0_connection` NOT GLOB '*[^A-Za-z0-9-]*'),
	`strategy` text NOT NULL CHECK (`strategy` IN ('samlp', 'oidc')),
	`login_slug` text NOT NULL CHECK (length(`login_slug`) BETWEEN 3 AND 63 AND `login_slug` NOT GLOB '*[^a-z0-9-]*'),
	`enforced` integer NOT NULL DEFAULT 0 CHECK (`enforced` IN (0, 1)),
	`proven_at` integer,
	`proven_by` text REFERENCES `users`(`id`),
	`last_prefix_mismatch_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CHECK ((`proven_at` IS NULL) = (`proven_by` IS NULL)),
	CHECK (`enforced` = 0 OR `proven_at` IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_sso_connection_claim` ON `organization_sso_connection` (`domain_claim_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_sso_connection_slug` ON `organization_sso_connection` (`login_slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_sso_connection_proven` ON `organization_sso_connection` (`auth0_connection`) WHERE `proven_at` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `organization_sso_connection_organization` ON `organization_sso_connection` (`organization_id`);
--> statement-breakpoint
CREATE TABLE `organization_scim_token` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`digest` text NOT NULL CHECK (length(`digest`) = 64 AND `digest` NOT GLOB '*[^0-9a-f]*'),
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_scim_token_digest` ON `organization_scim_token` (`digest`);
--> statement-breakpoint
CREATE INDEX `organization_scim_token_organization` ON `organization_scim_token` (`organization_id`);
--> statement-breakpoint
CREATE TABLE `organization_scim_user` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`user_name` text NOT NULL CHECK (length(`user_name`) > 0 AND `user_name` = lower(`user_name`)),
	`external_id` text,
	`active` integer NOT NULL CHECK (`active` IN (0, 1)),
	`user_id` text REFERENCES `users`(`id`),
	`issuer` text,
	`subject` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CHECK ((`user_id` IS NULL) = (`issuer` IS NULL) AND (`issuer` IS NULL) = (`subject` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_scim_user_name` ON `organization_scim_user` (`organization_id`,`user_name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_scim_user_bound` ON `organization_scim_user` (`organization_id`,`user_id`) WHERE `user_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `organization_session_policy` (
	`organization_id` text PRIMARY KEY NOT NULL REFERENCES `organization`(`id`),
	`max_session_seconds` integer CHECK (`max_session_seconds` IS NULL OR `max_session_seconds` BETWEEN 300 AND 2592000),
	`reauthenticate_after_seconds` integer CHECK (`reauthenticate_after_seconds` IS NULL OR `reauthenticate_after_seconds` BETWEEN 300 AND 2592000),
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CHECK (`max_session_seconds` IS NOT NULL OR `reauthenticate_after_seconds` IS NOT NULL),
	CHECK (`max_session_seconds` IS NULL OR `reauthenticate_after_seconds` IS NULL OR `reauthenticate_after_seconds` <= `max_session_seconds`)
);
