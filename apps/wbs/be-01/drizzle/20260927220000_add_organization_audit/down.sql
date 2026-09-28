-- Reverses `20260927220000_add_organization_audit`.
--
-- Audit evidence is never discarded by a rollback: the first statement fails
-- its `CHECK` while any record exists, and the rollback runner reverts this
-- script and its ledger row in one transaction. An empty table carries
-- nothing, so only then are the index and the table dropped.
-- Proof, observed 2026-09-27 in `organization-audit.db.test.ts`: `CHECK (1)`
-- failed `refuses to roll back over a recorded act`.
CREATE TEMP TABLE `organization_audit_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT `organization_audit_must_be_empty` CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `organization_audit_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `organization_audit`) = 0;
--> statement-breakpoint
DROP TABLE `organization_audit_down_check`;
--> statement-breakpoint
DROP INDEX `organization_audit_organization_created`;
--> statement-breakpoint
DROP TABLE `organization_audit`;
