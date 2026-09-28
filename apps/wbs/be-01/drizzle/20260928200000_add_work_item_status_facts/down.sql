-- Reverses `20260928200000_add_work_item_status_facts`.
--
-- Refuses while any work item holds a hold: an older release cannot read the
-- column and would schedule held work as if nothing were held (ADR 0032), so
-- the holds are saved and removed first with `work-item-hold-rollback-cli.ts
-- save|remove`, and restored after a later forward run with `restore`
-- (docs/runbook-prod-deploy.md#work-item-hold-rollback). The CHECK's name is
-- the message the operator reads, so it carries the procedure.
--
-- Readiness is dropped without a guard, as the fact dates are: nothing is
-- scheduled from it, and what is lost is a planner's word about a leaf.
CREATE TEMP TABLE work_item_hold_rollback_guard (
  held_rows INTEGER NOT NULL,
  CONSTRAINT "work item holds exist: save and remove them with work-item-hold-rollback-cli.ts first, then rerun migrate-down-cli.ts --to=<baseline>; see docs/runbook-prod-deploy.md#work-item-hold-rollback" CHECK (held_rows = 0)
);--> statement-breakpoint
INSERT INTO work_item_hold_rollback_guard SELECT count(*) FROM work_item WHERE hold IS NOT NULL;--> statement-breakpoint
DROP TABLE work_item_hold_rollback_guard;--> statement-breakpoint
ALTER TABLE `work_item` DROP COLUMN `hold`;--> statement-breakpoint
ALTER TABLE `work_item` DROP COLUMN `readiness`;
