-- foreign-keys-off-rebuild
-- migration-lint: compatible-table-rebuild
-- Widens `organization_audit`'s vocabulary for directory capacities
-- (`wbs-shared-occupancy` task 1.0, design S11): action
-- `directory_capacity_changed` on subject kind `resource`.
--
-- The same compatible rebuild
-- `20261022140100_widen_organization_audit_compute_providers` did, under the
-- runner's foreign-keys-off protocol: columns and rows kept, the whole
-- vocabulary that rebuild left still admitted (organization limits and
-- compute providers included), an unknown action or kind still refused, the
-- append-only triggers created again on the new table. Issue #632's
-- rebuild-free vocabulary has not landed, so this is no cheaper another way.
--
-- Proof, observed 2026-10-25 in `directory-capacity-migration.db.test.ts`:
-- with the last compute-provider action dropped from the rebuilt CHECK,
-- `keeps one row of every earlier action and subject kind through the
-- rebuild` failed: the forward run threw on the rebuild's copy.
CREATE TABLE `organization_audit_new` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`actor_id` text NOT NULL,
	`action` text NOT NULL CHECK (`action` IN (
		'restricted_project_recovery',
		'sso_connection_created',
		'sso_connection_updated',
		'sso_connection_deleted',
		'sso_connection_proven',
		'sso_enforcement_changed',
		'provisioning_token_issued',
		'provisioning_token_rotated',
		'provisioning_token_revoked',
		'scim_user_provisioned',
		'scim_user_updated',
		'scim_user_deprovisioned',
		'pending_membership_activated',
		'session_policy_changed',
		'machine_credential_created',
		'machine_credential_rotated',
		'machine_credential_revoked',
		'trusted_issuer_registered',
		'trusted_issuer_removed',
		'organization_limits_changed',
		'compute_provider_registered',
		'compute_provider_updated',
		'compute_provider_removed',
		'directory_capacity_changed'
	)),
	`subject_kind` text NOT NULL CHECK (`subject_kind` IN (
		'project',
		'sso_connection',
		'provisioning_token',
		'scim_user',
		'session_policy',
		'machine_credential',
		'trusted_issuer',
		'organization_limits',
		'compute_provider',
		'resource'
	)),
	`subject_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `organization_audit_new`
	(`id`, `organization_id`, `actor_id`, `action`, `subject_kind`, `subject_id`, `detail`, `created_at`)
SELECT `id`, `organization_id`, `actor_id`, `action`, `subject_kind`, `subject_id`, `detail`, `created_at`
FROM `organization_audit`;
--> statement-breakpoint
DROP TABLE `organization_audit`;
--> statement-breakpoint
ALTER TABLE `organization_audit_new` RENAME TO `organization_audit`;
--> statement-breakpoint
CREATE INDEX `organization_audit_organization_created` ON `organization_audit` (`organization_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `organization_audit_no_update` BEFORE UPDATE ON `organization_audit`
BEGIN
	SELECT RAISE(ABORT, 'organization_audit is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `organization_audit_no_delete` BEFORE DELETE ON `organization_audit`
BEGIN
	SELECT RAISE(ABORT, 'organization_audit is append-only');
END;
--> statement-breakpoint
CREATE TEMP TABLE `organization_audit_directory_capacity_fk_guard` (`violations` integer CHECK (`violations` = 0));
--> statement-breakpoint
INSERT INTO `organization_audit_directory_capacity_fk_guard` SELECT COUNT(*) FROM pragma_foreign_key_check;
