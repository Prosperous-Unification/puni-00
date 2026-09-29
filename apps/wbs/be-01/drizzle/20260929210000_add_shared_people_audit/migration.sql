-- The audit trail of an organization's capacity mode (WBS 010.4.16,
-- `share-people-across-projects`, spec `shared-people-mode`): one row per
-- switch between isolated and shared people, written in the same transaction
-- as the switch. A switch moves other people's dates (ADR 0034), so who made
-- it and when is kept beside the mode rather than only in its audit columns.
--
-- `actor_id` references nothing, as in `organization_audit`: the record must
-- outlive the account. `organization_id` references its organization.
--
-- Additive: a new table the outgoing release never reads or writes.
--
-- Proof, observed 2026-09-29 in `shared-people.db.test.ts`: the
-- `shared_people` check dropped made `refuses a record of a third mode` store
-- the row.
CREATE TABLE `shared_people_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`actor_id` text NOT NULL,
	`shared_people` integer NOT NULL CHECK (`shared_people` IN (0, 1)),
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shared_people_audit_organization_created` ON `shared_people_audit` (`organization_id`,`created_at`);
