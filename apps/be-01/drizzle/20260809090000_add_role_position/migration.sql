-- Role order becomes a stored fact.
--
-- It could not be read off the rows: `WHERE project_id = ?` is answered from
-- the `role_project_name` index, so a project's roles come back in name order.
-- `Dev, QA` only looks like the order they were seeded in, and the schedule now
-- runs a work item's slices in that order.
--
-- The default is what keeps this additive across a swap: the outgoing release's
-- INSERT does not name this column, and both colours share the file.
ALTER TABLE `role` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfilled from the rowid, which is the order the rows were inserted in, so
-- every project keeps the order it was seeded with. Multiplied by the same step
-- new roles are spaced by; only the relative order within one project matters.
UPDATE `role` SET `position` = `rowid` * 10;
