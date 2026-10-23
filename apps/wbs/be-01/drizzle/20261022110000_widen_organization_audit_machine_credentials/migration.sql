-- foreign-keys-off-rebuild
-- migration-lint: compatible-table-rebuild
-- Widens `organization_audit`'s vocabulary for machine credentials and
-- trusted issuers (`wbs-machine-credentials` task 2.1, design A17): five
-- actions and two subject kinds, all admitted now so slice 5 needs no second
-- rebuild.
--
-- SQLite cannot alter a CHECK in place, so the table is rebuilt under the
-- runner's foreign-keys-off protocol, exactly as
-- `20261012090200_widen_organization_audit` did. Columns and rows are kept,
-- every action and kind the outgoing release writes stays admitted, and an
-- unknown action or kind is still refused. The append-only triggers die with
-- the old table and are created again on the new one.
--
-- Proof, observed 2026-10-22: replacing the `CHECK (violations = 0)` guard
-- below with `CHECK (1)` made `migration-lint.test.ts` `accepts the machine
-- credential audit rebuild` report `contains destructive statement: DROP
-- TABLE`.
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
		'trusted_issuer_removed'
	)),
	`subject_kind` text NOT NULL CHECK (`subject_kind` IN (
		'project',
		'sso_connection',
		'provisioning_token',
		'scim_user',
		'session_policy',
		'machine_credential',
		'trusted_issuer'
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
CREATE TEMP TABLE `organization_audit_machine_credentials_fk_guard` (`violations` integer CHECK (`violations` = 0));
--> statement-breakpoint
INSERT INTO `organization_audit_machine_credentials_fk_guard` SELECT COUNT(*) FROM pragma_foreign_key_check;
