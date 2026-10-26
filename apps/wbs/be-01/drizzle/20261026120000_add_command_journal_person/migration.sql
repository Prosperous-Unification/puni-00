-- The acting person of an undo stack (`UndoStack`): the agent person a machine
-- or consent credential acts as, NULL for an account acting as itself. Nullable
-- without a default, so every existing entry stays its account's own and the
-- outgoing colour's INSERT, which names no person_id, keeps working mid-swap.
-- Cascades with the person: a deleted agent's stack can never be pressed again,
-- and SET NULL would hand its entries to its human's stack.
ALTER TABLE `command_journal` ADD COLUMN `person_id` text REFERENCES `person`(`id`) ON DELETE cascade;
--> statement-breakpoint
-- One stack's rows in order: the stack read, the redo clear, the ranked prune
-- and the undo state all filter (project, account, person) and order by seq.
CREATE INDEX `command_journal_person_stack` ON `command_journal` (`project_id`,`user_id`,`person_id`,`seq`);
--> statement-breakpoint
-- The cascade's lookup: deleting a person finds its entries without a scan.
CREATE INDEX `command_journal_person` ON `command_journal` (`person_id`);
