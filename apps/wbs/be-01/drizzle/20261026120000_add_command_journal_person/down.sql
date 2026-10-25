-- Refuses while any entry sits on an agent person's stack: dropping the column
-- would silently move every such entry onto its human's own stack, so the
-- human's undo would revert the agent's edits — the bug the column fixes.
-- Discarding those entries is the operator's explicit choice, not this file's.
-- Proof: the INSERT below replaced by one inserting 0 made `refuses rollback
-- while an agent's entry is journalled, naming the count and the discard` in
-- `command-journal-person-migration.db.test.ts` observe exit 0 (2026-10-26).
CREATE TEMP TABLE command_journal_person_rollback_guard (held INTEGER NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER command_journal_person_rollback_refusal
BEFORE INSERT ON command_journal_person_rollback_guard
WHEN NEW.held > 0
BEGIN
  SELECT RAISE(ABORT, NEW.held || ' undo journal entries belong to agent persons; discard them with DELETE FROM command_journal WHERE person_id IS NOT NULL, then rerun migrate-down-cli.ts');
END;
--> statement-breakpoint
INSERT INTO command_journal_person_rollback_guard SELECT count(*) FROM command_journal WHERE person_id IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER command_journal_person_rollback_refusal;
--> statement-breakpoint
DROP TABLE command_journal_person_rollback_guard;
--> statement-breakpoint
ALTER TABLE `command_journal` DROP COLUMN `person_id`;
