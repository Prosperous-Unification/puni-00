-- Reverses `20260927150000_add_step_code`.
--
-- **What is lost is every step code.** No schedule, estimate or fact moves: the
-- scheduler and every pair-keyed fact are keyed on the step's id, never on its
-- code. What changes is spelling — a step reference such as `010.dev` no longer
-- resolves, and a later forward run leaves every step uncoded until the
-- post-swap backfill derives the codes again from the names. A code somebody
-- chose explicitly, or that a rename has since left different from its name, is
-- derived afresh rather than restored.
--
-- The index goes first because it names the column, and without `IF EXISTS`:
-- a schema missing it is not the one this release made, and saying so beats
-- dropping the column from under an unknown state. `DROP COLUMN` rather than a
-- table rebuild: SQLite has supported it since 3.35, and
-- `20260912120000_add_work_item_facts`'s down script is the precedent. It runs
-- solely when the release that added the column is being taken away.
DROP INDEX `step_project_code`;--> statement-breakpoint
ALTER TABLE `step` DROP COLUMN `code`;
