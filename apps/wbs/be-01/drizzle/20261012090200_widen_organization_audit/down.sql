-- foreign-keys-off-rebuild
-- Reverses `20261012090200_widen_organization_audit`.
--
-- Audit evidence is never discarded by a rollback: the first statement fails
-- its CHECK while any row of a new action or subject kind exists, and the
-- runner reverts this script and its ledger row in one transaction. Otherwise
-- the table is rebuilt with the narrow vocabulary it had, keeping every
-- `restricted_project_recovery` row, and loses its append-only triggers. The
-- widened table is renamed aside first so the restored definition is
-- byte-identical to `20260927220000_add_organization_audit`'s.
--
-- Proof, observed 2026-10-12 in `enterprise-sso-migration.db.test.ts`: the
-- new-kind filter replaced by `WHERE 0` made `refuses to roll back the audit
-- widening over a new-kind row` fail on the narrow table's CHECK instead,
-- losing the guard's named refusal.
CREATE TEMP TABLE `organization_audit_widen_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "enterprise SSO audit rows exist: audit evidence is never discarded by a rollback" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `organization_audit_widen_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `organization_audit`
  WHERE `action` <> 'restricted_project_recovery' OR `subject_kind` <> 'project') = 0;
--> statement-breakpoint
DROP TABLE `organization_audit_widen_down_check`;
--> statement-breakpoint
DROP TRIGGER `organization_audit_no_update`;
--> statement-breakpoint
DROP TRIGGER `organization_audit_no_delete`;
--> statement-breakpoint
DROP INDEX `organization_audit_organization_created`;
--> statement-breakpoint
ALTER TABLE `organization_audit` RENAME TO `organization_audit_widened`;
--> statement-breakpoint
CREATE TABLE `organization_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`actor_id` text NOT NULL,
	`action` text NOT NULL CHECK (`action` IN ('restricted_project_recovery')),
	`subject_kind` text NOT NULL CHECK (`subject_kind` IN ('project')),
	`subject_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `organization_audit`
	(`id`, `organization_id`, `actor_id`, `action`, `subject_kind`, `subject_id`, `detail`, `created_at`)
SELECT `id`, `organization_id`, `actor_id`, `action`, `subject_kind`, `subject_id`, `detail`, `created_at`
FROM `organization_audit_widened`;
--> statement-breakpoint
DROP TABLE `organization_audit_widened`;
--> statement-breakpoint
CREATE INDEX `organization_audit_organization_created` ON `organization_audit` (`organization_id`,`created_at`);
--> statement-breakpoint
CREATE TEMP TABLE `organization_audit_down_fk_guard` (`violations` integer CHECK (`violations` = 0));
--> statement-breakpoint
INSERT INTO `organization_audit_down_fk_guard` SELECT COUNT(*) FROM pragma_foreign_key_check;
--> statement-breakpoint
DROP TABLE `organization_audit_down_fk_guard`;
