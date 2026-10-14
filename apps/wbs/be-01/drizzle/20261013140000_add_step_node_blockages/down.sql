-- Proof: temporary guard statements removed; rollback-over-a-fact negative
-- did not throw and lost the retained table/ledger; watched 2026-10-13.
CREATE TEMP TABLE step_blockage_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "step blockages exist: save and remove with step-blockage-rollback-cli.ts save|remove, rerun migrate-down-cli.ts --to=<baseline>, restore after forward migration; see docs/runbook-prod-deploy.md#step-blockage-rollback" CHECK (rows = 0)
);
--> statement-breakpoint
INSERT INTO step_blockage_rollback_guard SELECT count(*) FROM step_blockage;
--> statement-breakpoint
DROP TABLE step_blockage_rollback_guard;
--> statement-breakpoint
DROP TRIGGER step_blockage_owner_update;
--> statement-breakpoint
DROP TRIGGER step_blockage_owner_insert;
--> statement-breakpoint
DROP INDEX step_blockage_by_step;
--> statement-breakpoint
DROP TABLE step_blockage;
