-- Discards every entry on an agent person's stack, then drops the column.
-- Without the DELETE, dropping the column would move each agent entry onto its
-- human's own stack, so the human's undo would revert the agent's edit — the
-- bug the column fixes. The entries are disposable undo history (the plan's
-- history in plan_event keeps every one of them), and deleting them here keeps
-- the deploy's automatic abort (migrate-down-cli.ts --capture-file) free of a
-- manual step mid-incident.
-- Proof: with the DELETE removed, `discards only the agents' entries on
-- rollback` in `command-journal-person-migration.db.test.ts` found `agent` on
-- the human's stack (2026-10-26).
DELETE FROM `command_journal` WHERE `person_id` IS NOT NULL;
--> statement-breakpoint
DROP INDEX `command_journal_person`;
--> statement-breakpoint
DROP INDEX `command_journal_person_stack`;
--> statement-breakpoint
ALTER TABLE `command_journal` DROP COLUMN `person_id`;
