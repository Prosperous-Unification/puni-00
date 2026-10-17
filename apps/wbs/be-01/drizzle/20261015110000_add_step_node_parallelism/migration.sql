-- Proof: integer/range check, pair key and owner/step foreign keys removed
-- independently; corresponding raw SQL negatives failed. Project and leaf guards
-- removed independently for INSERT and UPDATE; ownership negatives failed.
-- Observed 2026-10-15; receipts in set-step-node-parallelism/evidence/receipts.json.
CREATE TABLE `step_parallel` (
  `work_item_id` text NOT NULL REFERENCES `work_item`(`id`) ON DELETE CASCADE,
  `step_id` text NOT NULL REFERENCES `step`(`id`),
  `max_parallel` integer NOT NULL,
  `created_at` integer,
  `updated_at` integer,
  `created_by` text REFERENCES `users`(`id`),
  PRIMARY KEY (`work_item_id`, `step_id`),
  CONSTRAINT `step_parallel_range` CHECK (typeof(`max_parallel`) = 'integer' AND `max_parallel` BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE INDEX `step_parallel_by_step` ON `step_parallel` (`step_id`);
--> statement-breakpoint
CREATE TRIGGER `step_parallel_owner_insert` BEFORE INSERT ON `step_parallel`
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.project_id != s.project_id
  ) THEN RAISE(ABORT, 'step parallelism project mismatch') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item WHERE parent_id = NEW.work_item_id
  ) THEN RAISE(ABORT, 'step parallelism owner is not a leaf') END;
END;
--> statement-breakpoint
CREATE TRIGGER `step_parallel_owner_update` BEFORE UPDATE ON `step_parallel`
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.project_id != s.project_id
  ) THEN RAISE(ABORT, 'step parallelism project mismatch') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item WHERE parent_id = NEW.work_item_id
  ) THEN RAISE(ABORT, 'step parallelism owner is not a leaf') END;
END;
