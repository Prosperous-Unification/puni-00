-- The records `organization-ownership-and-access` (WBS 010.5.2) keeps about who
-- may act for which organization: external identities, organizations,
-- memberships, invitations, join requests and domain claims.
--
-- **Inert on arrival.** No route reads or writes these tables in the release
-- that adds them; authorization still follows `project.owner_id` and
-- `restricted`. They exist first so the bridge release can map the legacy
-- organization while blue and green share this file, which is why every
-- statement is a `CREATE` and nothing here touches an existing table.
--
-- `external_identity` sits beside `users.idp_issuer`/`idp_sub` rather than
-- replacing them: the outgoing release still resolves logins through those
-- columns. A user may hold several identities (the later provider swap), but a
-- verified `(issuer, subject)` belongs to exactly one local user, and that
-- uniqueness is what refuses merging two accounts on email alone.
-- Proof: the unique index made plain failed both mapping cases in
-- `organization-records.db.test.ts` with `ON CONFLICT clause does not match any PRIMARY KEY or
-- UNIQUE constraint`. Observed 2026-09-27.
CREATE TABLE `external_identity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_identity_issuer_subject` ON `external_identity` (`issuer`,`subject`);
--> statement-breakpoint
CREATE INDEX `external_identity_user` ON `external_identity` (`user_id`);
--> statement-breakpoint
-- `legacy` marks the one organization that receives every record written
-- before tenancy; the partial unique index is what makes "one" true.
-- Proof: `organization_one_legacy` made non-unique failed `organization-records.db.test.ts` `refuses a row
-- that breaks organization_one_legacy`. Observed 2026-09-27.
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legacy` integer DEFAULT 0 NOT NULL CHECK (`legacy` IN (0, 1)),
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_one_legacy` ON `organization` (`legacy`) WHERE `legacy` = 1;
--> statement-breakpoint
-- A removed membership is a deleted row: current membership is the only
-- authority, so there is no lifecycle state a reader could mistake for access.
CREATE TABLE `organization_membership` (
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`role` text NOT NULL CHECK (`role` IN ('super_admin', 'admin', 'member', 'viewer')),
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY(`organization_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `organization_membership_user` ON `organization_membership` (`user_id`);
--> statement-breakpoint
-- Only the token's digest is stored. `role` excludes `super_admin`: an
-- invitation never grants ownership. `consumed_at` and `revoked_at` are the
-- single-use and revocation states the accepting transaction checks.
-- Proof: removing the expiry check, or reducing the consumption check to
-- `CHECK (1)`, failed its own `refuses a row that breaks …` case in
-- `organization-records.db.test.ts`. Observed 2026-09-27.
CREATE TABLE `organization_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`recipient_email` text NOT NULL,
	`role` text NOT NULL CHECK (`role` IN ('admin', 'member', 'viewer')),
	`token_digest` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`consumed_at` integer,
	`consumed_by` text REFERENCES `users`(`id`),
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	UNIQUE (`organization_id`, `id`),
	CHECK (`expires_at` > `created_at`),
	CHECK ((`consumed_at` IS NULL) = (`consumed_by` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_invitation_token_digest` ON `organization_invitation` (`token_digest`);
--> statement-breakpoint
CREATE INDEX `organization_invitation_organization` ON `organization_invitation` (`organization_id`);
--> statement-breakpoint
-- A request grants nothing. Approval issues one invitation, recorded in
-- `invitation_id`; the partial unique index allows one pending request per
-- user and organization. The composite foreign key keeps that invitation in the
-- request's own organization, and the status check keeps each state's
-- resolution columns honest (SQLite passes a CHECK that yields NULL, hence the
-- explicit IS NULL tests).
-- Proof, each fault alone, observed 2026-09-27 in `organization-records.db.test.ts`: the
-- composite key made single-column failed `refuses a join request pointing at
-- another organization's invitation`; `one_pending` made non-unique and the
-- pending arm without `resolved_at IS NULL` each failed its `refuses a row
-- that breaks …` case.
CREATE TABLE `organization_join_request` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`user_id` text NOT NULL REFERENCES `users`(`id`),
	`email` text NOT NULL,
	`status` text NOT NULL CHECK (`status` IN ('pending', 'approved', 'denied')),
	`resolved_at` integer,
	`resolved_by` text REFERENCES `users`(`id`),
	`invitation_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	FOREIGN KEY (`organization_id`, `invitation_id`) REFERENCES `organization_invitation`(`organization_id`, `id`),
	CHECK (
		(`status` = 'pending' AND `resolved_at` IS NULL AND `resolved_by` IS NULL AND `invitation_id` IS NULL)
		OR (`status` = 'approved' AND `resolved_at` IS NOT NULL AND `resolved_by` IS NOT NULL AND `invitation_id` IS NOT NULL)
		OR (`status` = 'denied' AND `resolved_at` IS NOT NULL AND `resolved_by` IS NOT NULL AND `invitation_id` IS NULL)
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_join_request_one_pending` ON `organization_join_request` (`organization_id`,`user_id`) WHERE `status` = 'pending';
--> statement-breakpoint
-- One row per organization and exact domain. Pending challenges reserve
-- nothing; the partial unique index on verified and suspended claims is what
-- decides a concurrent verification race, and a suspended claim keeps it.
-- `challenge_*` is the 24-hour initial or rotation challenge; `proof_digest` is
-- the retained ownership proof promoted on success, and `previous_proof_*` the
-- bounded overlap a rotation allows.
-- Proof, each fault alone, observed 2026-09-27 in `organization-records.db.test.ts`: the owner
-- index made non-partial and non-unique failed `lets exactly one organization
-- own a verified domain` (`Received: "verified"`); dropping the challenge-pair
-- or previous-proof-pair check, or short-circuiting the owned-proof check,
-- failed its `refuses a row that breaks …` case.
CREATE TABLE `organization_domain_claim` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`domain` text NOT NULL,
	`status` text NOT NULL CHECK (`status` IN ('pending', 'verified', 'suspended')),
	`challenge_digest` text,
	`challenge_expires_at` integer,
	`proof_digest` text,
	`previous_proof_digest` text,
	`previous_proof_valid_until` integer,
	`last_success_at` integer,
	`last_checked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CHECK ((`challenge_digest` IS NULL) = (`challenge_expires_at` IS NULL)),
	CHECK ((`previous_proof_digest` IS NULL) = (`previous_proof_valid_until` IS NULL)),
	CHECK (
		`status` = 'pending'
		OR (`last_success_at` IS NOT NULL AND (`proof_digest` IS NOT NULL OR `previous_proof_digest` IS NOT NULL))
	)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_domain_claim_per_organization` ON `organization_domain_claim` (`organization_id`,`domain`);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_domain_claim_owner` ON `organization_domain_claim` (`domain`) WHERE `status` IN ('verified', 'suspended');
