-- Lint-shape fixture only; not an executable or ready semantic migration.
-- Baseline: b0d2df4eb608827a4933f0840b05300e06158d8a, 110 applied identities, 2026-11-10.
-- foreign-keys-off-rebuild
-- migration-lint: compatible-table-rebuild
CREATE TABLE "organization_audit_NEW" (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`actor_id` text NOT NULL,
	`action` text NOT NULL CHECK (`action` IN (
		'restricted_work_package_recovery',
 'project_created','project_renamed','project_deleted','work_package_moved',
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
	`subject_kind` text NOT NULL CHECK (`subject_kind` IN (
		'work_package','project',
		'sso_connection',
		'provisioning_token',
		'scim_user',
		'session_policy',
		'machine_credential',
		'trusted_issuer',
		'organization_limits',
		'compute_provider',
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
INSERT INTO organization_audit_NEW (id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) SELECT id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at FROM organization_audit;
--> statement-breakpoint
DROP TABLE organization_audit;
--> statement-breakpoint
ALTER TABLE organization_audit_NEW RENAME TO organization_audit;
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_audit_machine_token_issued_overflow_day` ON `organization_audit` (
	json_extract(`detail`, '$.credentialId'),
	`created_at` / 86400000
) WHERE `action` = 'machine_token_issued_overflow';
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_audit_machine_token_issued_run` ON `organization_audit` (
	json_extract(`detail`, '$.credentialId'),
	`created_at` / 86400000,
	coalesce(json_extract(`detail`, '$.runId'), '')
) WHERE `action` = 'machine_token_issued';
--> statement-breakpoint
CREATE INDEX `organization_audit_organization_created` ON `organization_audit` (`organization_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `organization_audit_no_delete` BEFORE DELETE ON `organization_audit`
BEGIN
	SELECT RAISE(ABORT, 'organization_audit is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `organization_audit_no_update` BEFORE UPDATE ON `organization_audit`
BEGIN
	SELECT RAISE(ABORT, 'organization_audit is append-only');
END;
--> statement-breakpoint
CREATE TEMP TABLE _audit_projects_foreign_keys (violations INTEGER NOT NULL CHECK (violations = 0));
--> statement-breakpoint
INSERT INTO _audit_projects_foreign_keys SELECT COUNT(*) FROM pragma_foreign_key_check;
