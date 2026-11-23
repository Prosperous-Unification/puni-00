-- foreign-keys-off-rebuild
-- migration-lint: compatible-table-rebuild
-- Adds access and aggregate membership audit evidence in the current project vocabulary.
-- Every outgoing action/kind, column, row, append-only trigger and machine-token
-- issuance index remains writable/usable while old and new releases share SQLite.
-- The foreign-key check closes the compatible rebuild before it can commit.
CREATE TABLE `organization_audit_new` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`actor_id` text NOT NULL,
	-- Proof: migration-action-whitelist failed `refuses unknown audit actions and subjects after widening`; restored GREEN.
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
		'machine_token_issued',
		'machine_token_issued_overflow',
		'agent_pool_created',
		'agent_pool_revoked',
		-- Proof: migration-retain-action failed `preserves all outgoing audit rows, actions, subjects, indexes and append-only triggers`; restored GREEN.
		'agent_pool_rekeyed',
		'directory_capacity_changed',
		'access_granted',
		'access_revoked',
		'access_group_created',
		'access_group_renamed',
		'access_group_deleted',
		'access_group_member_added',
		'access_group_member_removed',
		'organization_member_removed'
	)),
	-- Proof: migration-kind-whitelist failed `refuses unknown audit actions and subjects after widening`; restored GREEN.
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
		-- Proof: migration-retain-kind failed `preserves all outgoing audit rows, actions, subjects, indexes and append-only triggers`; restored GREEN.
		'agent_pool',
		'resource',
		'access_grant',
		'access_group',
		'organization_member'
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
-- Proof: migration-created-index failed `preserves all outgoing audit rows, actions, subjects, indexes and append-only triggers`; restored GREEN.
CREATE INDEX `organization_audit_organization_created` ON `organization_audit` (`organization_id`,`created_at`);
--> statement-breakpoint
-- Proof: migration-append-only-update failed `retains the access audit append-only guard on actual UPDATE`; restored GREEN.
CREATE TRIGGER `organization_audit_no_update` BEFORE UPDATE ON `organization_audit`
BEGIN
	SELECT RAISE(ABORT, 'organization_audit is append-only');
END;
--> statement-breakpoint
-- Proof: migration-append-only-delete failed `retains the access audit append-only guard on actual DELETE`; restored GREEN.
CREATE TRIGGER `organization_audit_no_delete` BEFORE DELETE ON `organization_audit`
BEGIN
	SELECT RAISE(ABORT, 'organization_audit is append-only');
END;
--> statement-breakpoint
-- Proof: migration-fk-owner failed `refuses an audit rebuild that would commit broken organization references`; restored GREEN.
-- Proof: migration-fk-lint failed `accepts the guarded current-vocabulary access audit rebuild`; restored GREEN.
CREATE TEMP TABLE `organization_audit_access_fk_guard` (`violations` integer CHECK (`violations` = 0));
--> statement-breakpoint
INSERT INTO `organization_audit_access_fk_guard` SELECT COUNT(*) FROM pragma_foreign_key_check;
--> statement-breakpoint
-- Proof: migration-run-index failed `retains both machine-token targeted insert indexes through the access audit rebuild`; restored GREEN.
CREATE UNIQUE INDEX `organization_audit_machine_token_issued_run` ON `organization_audit` (
	json_extract(`detail`, '$.credentialId'),
	`created_at` / 86400000,
	coalesce(json_extract(`detail`, '$.runId'), '')
) WHERE `action` = 'machine_token_issued';
--> statement-breakpoint
-- Proof: migration-overflow_day-index failed `retains both machine-token targeted insert indexes through the access audit rebuild`; restored GREEN.
CREATE UNIQUE INDEX `organization_audit_machine_token_issued_overflow_day` ON `organization_audit` (
	json_extract(`detail`, '$.credentialId'),
	`created_at` / 86400000
) WHERE `action` = 'machine_token_issued_overflow';
