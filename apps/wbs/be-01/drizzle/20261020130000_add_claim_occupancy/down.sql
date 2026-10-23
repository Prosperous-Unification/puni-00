-- Reverses `20261020130000_add_claim_occupancy`, refusing while any claim holds
-- units: dropping the rows would leave those claims standing with their leaves'
-- units silently freed for the next claim.
-- Proof: guard statements removed; the add_claim_occupancy down negative in
-- claim-occupancy-schema.db.test.ts dropped the table with its row; watched 2026-10-20.
CREATE TEMP TABLE claim_occupancy_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "claim occupancy exists: release every claim holding units (releaseWorkItem) or record and remove the claim_occupancy rows before migrate-down-cli.ts --to=<baseline>; no automatic recovery tool exists for occupancy" CHECK (rows = 0)
);
--> statement-breakpoint
INSERT INTO claim_occupancy_rollback_guard SELECT count(*) FROM claim_occupancy;
--> statement-breakpoint
DROP TABLE claim_occupancy_rollback_guard;
--> statement-breakpoint
DROP INDEX claim_occupancy_by_resource;
--> statement-breakpoint
DROP TABLE claim_occupancy;
