-- Typed links live beside legacy project-reach dependencies. This new table
-- is additive: the outgoing release neither reads nor writes it, and its
-- existing dependency inserts keep their schema throughout a blue/green swap.
-- Work-item deletes cascade so an outgoing writer can still delete a row;
-- step references deliberately restrict deletion until the application removes
-- the link. SS and FF are reserved in storage for the follow-on release, while
-- this release's domain accepts FS alone. `id` is NOT NULL explicitly: SQLite
-- lets a text PRIMARY KEY hold NULL, and a relationship without an identity
-- cannot be edited, undone or removed.
CREATE TABLE `typed_dependency` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `project`(`id`),
  `predecessor_work_item_id` text NOT NULL REFERENCES `work_item`(`id`) ON DELETE CASCADE,
  `predecessor_scope` text NOT NULL CHECK (`predecessor_scope` IN ('whole','node','descendant-step')),
  `predecessor_step_id` text REFERENCES `step`(`id`),
  `successor_work_item_id` text NOT NULL REFERENCES `work_item`(`id`) ON DELETE CASCADE,
  `successor_scope` text NOT NULL CHECK (`successor_scope` IN ('whole','node','descendant-step')),
  `successor_step_id` text REFERENCES `step`(`id`),
  `type` text NOT NULL CHECK (`type` IN ('FS','SS','FF')),
  `created_at` integer,
  `updated_at` integer,
  `created_by` text REFERENCES `users`(`id`),
  CHECK ((`predecessor_scope` = 'whole') = (`predecessor_step_id` IS NULL)),
  CHECK ((`successor_scope` = 'whole') = (`successor_step_id` IS NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX `typed_dependency_endpoints` ON `typed_dependency` (`predecessor_work_item_id`,`predecessor_scope`,ifnull(`predecessor_step_id`,''),`successor_work_item_id`,`successor_scope`,ifnull(`successor_step_id`,''),`type`);--> statement-breakpoint
CREATE INDEX `typed_dependency_project` ON `typed_dependency` (`project_id`);--> statement-breakpoint
CREATE INDEX `typed_dependency_by_successor` ON `typed_dependency` (`successor_work_item_id`);--> statement-breakpoint
CREATE INDEX `typed_dependency_by_predecessor_step` ON `typed_dependency` (`predecessor_step_id`);--> statement-breakpoint
CREATE INDEX `typed_dependency_by_successor_step` ON `typed_dependency` (`successor_step_id`);
