-- Reverses `20260929210000_add_shared_people_audit`.
--
-- Audit evidence is never discarded by a rollback, as with
-- `organization_audit`: the first statement fails its `CHECK` while any
-- switch is recorded, and the rollback runner reverts this script and its
-- ledger row in one transaction. An empty table carries nothing, so only then
-- are the index and the table dropped.
--
-- Proof, observed 2026-09-29 in `shared-people.db.test.ts`: `CHECK (1)`
-- failed `refuses to roll back over a recorded switch`.
CREATE TEMP TABLE `shared_people_audit_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "shared people switches are recorded: audit evidence is never discarded by a rollback; see docs/runbook-prod-deploy.md#shared-people-rollback" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `shared_people_audit_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `shared_people_audit`) = 0;
--> statement-breakpoint
DROP TABLE `shared_people_audit_down_check`;
--> statement-breakpoint
DROP INDEX `shared_people_audit_organization_created`;
--> statement-breakpoint
DROP TABLE `shared_people_audit`;
