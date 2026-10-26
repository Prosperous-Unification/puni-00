-- foreign-keys-off-rebuild
-- Reverses `20261026130000_widen_organization_audit_machine_tokens`.
--
-- Audit evidence is never discarded by a rollback: the first statement fails
-- its CHECK while any row of either machine-token action exists, and the
-- runner reverts this script and its ledger row in one transaction. Otherwise
-- the two issuance indexes are dropped and the table is rebuilt with the
-- vocabulary `20261022140100_widen_organization_audit_compute_providers` gave
-- it, keeping every row and the append-only triggers, built as
-- `organization_audit_new` and renamed so the restored schema is
-- byte-identical to the one it left.
CREATE TEMP TABLE `organization_audit_machine_tokens_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "machine token audit rows exist: audit evidence is never discarded by a rollback" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `organization_audit_machine_tokens_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `organization_audit`
  WHERE `action` IN ('machine_token_issued', 'machine_token_issued_overflow')) = 0;
--> statement-breakpoint
DROP TABLE `organization_audit_machine_tokens_down_check`;
--> statement-breakpoint
DROP INDEX `organization_audit_machine_token_issued_run`;
--> statement-breakpoint
DROP INDEX `organization_audit_machine_token_issued_overflow_day`;
--> statement-breakpoint
DROP INDEX `organization_audit_organization_created`;
--> statement-breakpoint
DROP TRIGGER `organization_audit_no_update`;
--> statement-breakpoint
DROP TRIGGER `organization_audit_no_delete`;
--> statement-breakpoint
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
		'compute_provider_removed'
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
		'compute_provider'
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
CREATE TEMP TABLE `organization_audit_machine_tokens_down_fk_guard` (`violations` integer CHECK (`violations` = 0));
--> statement-breakpoint
INSERT INTO `organization_audit_machine_tokens_down_fk_guard` SELECT COUNT(*) FROM pragma_foreign_key_check;
--> statement-breakpoint
DROP TABLE `organization_audit_machine_tokens_down_fk_guard`;
