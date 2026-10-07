-- Two statements a planner makes about a leaf beside its steps' progress
-- (`add-work-item-statuses`, ADR 0032): its readiness (draft, ready) and its
-- hold (on_hold, blocked). A work item's status is folded from these, the
-- progress and the dependency graph on every read and is never stored.
--
-- Nullable with no default, and that is what makes it additive: the outgoing
-- colour's INSERT names neither column, so every row it writes reads "nobody
-- has said", and NULL passes each CHECK. The vocabularies are `READINESSES`
-- and `HOLDS` in `@wbs/domain`, and the read refuses anything else.
ALTER TABLE `work_item` ADD `readiness` text CHECK (`readiness` IN ('draft', 'ready'));--> statement-breakpoint
ALTER TABLE `work_item` ADD `hold` text CHECK (`hold` IN ('on_hold', 'blocked'));
