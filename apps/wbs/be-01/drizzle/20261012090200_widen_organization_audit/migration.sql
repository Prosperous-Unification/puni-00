-- foreign-keys-off-rebuild
-- migration-lint: compatible-table-rebuild
-- Widens `organization_audit`'s action and subject-kind vocabulary for
-- enterprise SSO, provisioning and session policy (`organization-audit`,
-- task 1.1) and makes the table append-only.
--
-- SQLite cannot alter a CHECK in place, so the table is rebuilt under the
-- runner's foreign-keys-off protocol (precedent
-- `20260824010000_add_oidc_identity`). Columns and rows are kept exactly, and
-- `restricted_project_recovery`/`project` stays admitted, so the outgoing
-- release keeps writing the only rows it knows while both colours share the
-- database. An unknown action or kind is still refused.
--
-- The two triggers refuse every UPDATE and DELETE of a row: an audit row is
-- evidence, never edited and never cleaned up. No writer updates or deletes
-- one (`organization-audit-append-only.test.ts` reads every writer's source).
--
-- Proof, observed 2026-10-12: replacing the `CHECK (violations = 0)` guard
-- below with `CHECK (1)` made `migration-lint.test.ts` `accepts the enterprise
-- SSO audit rebuild` report `contains destructive statement: DROP TABLE`;
-- narrowing the UPDATE trigger to `UPDATE OF id` made `refuses to change or
-- delete an audit row` in `enterprise-sso-migration.db.test.ts` change the
-- detail.
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
		'session_policy_changed'
	)),
	`subject_kind` text NOT NULL CHECK (`subject_kind` IN (
		'project',
		'sso_connection',
		'provisioning_token',
		'scim_user',
		'session_policy'
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
CREATE TEMP TABLE `organization_audit_fk_guard` (`violations` integer CHECK (`violations` = 0));
--> statement-breakpoint
INSERT INTO `organization_audit_fk_guard` SELECT COUNT(*) FROM pragma_foreign_key_check;
