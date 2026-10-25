-- The acting person of an undo stack (`UndoStack`): the agent person a machine
-- or consent credential acts as, NULL for an account acting as itself. Nullable
-- without a default, so every existing entry stays its account's own and the
-- outgoing colour's INSERT, which names no person_id, keeps working mid-swap.
-- Cascades with the person: a deleted agent's stack can never be pressed again,
-- and SET NULL would hand its entries to its human's stack.
ALTER TABLE `command_journal` ADD COLUMN `person_id` text REFERENCES `person`(`id`) ON DELETE cascade;
