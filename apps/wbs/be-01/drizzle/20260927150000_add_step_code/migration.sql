-- A step code: the short, immutable, project-unique name a step reference
-- spells a step node with — `dev` in `010.dev` (ADR 0031,
-- `openspec/changes/address-step-nodes`).
--
-- **Nullable, no default, and that is what makes it additive.** Blue and green
-- share one SQLite file mid-swap, and the outgoing release's
-- `INSERT INTO step (...)` does not name this column, so a step it adds lands
-- with NULL. That row is not defaulted here or on read: it is the modeled
-- `uncoded` state, visible until the post-swap backfill codes it. A code is
-- derived from the step's name in TypeScript (`suggestStepCode`), which is why
-- no `UPDATE` seeds the existing rows in SQL — one derivation serves creation,
-- import and the backfill, and a second one here would drift from it.
--
-- **Partial, so any number of uncoded steps can coexist** while two coded ones
-- cannot share a code within a project. A plain unique index would also admit
-- several NULLs in SQLite, but saying `WHERE code IS NOT NULL` makes the rule
-- the index enforces the one the domain states, and keeps NULL rows out of it.
ALTER TABLE `step` ADD COLUMN `code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `step_project_code` ON `step` (`project_id`,`code`) WHERE `code` IS NOT NULL;
