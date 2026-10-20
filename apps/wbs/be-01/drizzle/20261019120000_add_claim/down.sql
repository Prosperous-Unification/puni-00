-- Proof: guard statements removed; the add_claim CLI down negative exited 0 and
-- dropped the table with its claim; watched 2026-10-19.
CREATE TEMP TABLE claim_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "claims exist: release every claim (releaseWorkItem) or record and remove them before migrate-down-cli.ts --to=<baseline>; no automatic recovery tool exists for claims" CHECK (rows = 0)
);
--> statement-breakpoint
INSERT INTO claim_rollback_guard SELECT count(*) FROM claim;
--> statement-breakpoint
DROP TABLE claim_rollback_guard;
--> statement-breakpoint
DROP TRIGGER claim_step_project_update;
--> statement-breakpoint
DROP TRIGGER claim_step_project_insert;
--> statement-breakpoint
DROP INDEX claim_by_parent;
--> statement-breakpoint
DROP INDEX claim_by_person;
--> statement-breakpoint
DROP INDEX claim_by_step;
--> statement-breakpoint
DROP INDEX claim_subtree;
--> statement-breakpoint
DROP INDEX claim_step;
--> statement-breakpoint
DROP TABLE claim;
