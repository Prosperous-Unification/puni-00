-- The organization audit trail (task 3.7 of
-- `organization-ownership-and-access`): one row per audited act, written in
-- the same transaction as the act. The first act audited is a super-admin's
-- recovery edit of a restricted project someone else created.
--
-- `subject_id` references nothing: the record must outlive the project it
-- describes, which may later be deleted. `organization_id` does reference its
-- organization, because an audit row of no organization is not one.
--
-- Additive: a new table the outgoing release never reads or writes.
--
-- Proof, observed 2026-09-27 in `organization-audit.db.test.ts`: dropping the
-- `action` check failed `refuses an unknown action or subject kind` for the
-- action, dropping the `subject_kind` check failed it for the kind, and
-- dropping the `organization_id` reference failed `refuses a record of no
-- organization`.
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
CREATE INDEX `organization_audit_organization_created` ON `organization_audit` (`organization_id`,`created_at`);
