-- Proof: pair key and each foreign key removed independently; duplicate/reference
-- migration negatives failed. Time type/range clauses removed independently;
-- fractional/unsafe-time negatives failed. Project/leaf trigger clauses removed
-- independently for insert and update; ownership negatives failed. Watched 2026-10-13.
CREATE TABLE `step_blockage` (
  `work_item_id` text NOT NULL REFERENCES `work_item`(`id`) ON DELETE CASCADE,
  `step_id` text NOT NULL REFERENCES `step`(`id`),
  `blocked_at` integer NOT NULL,
  `created_at` integer,
  `updated_at` integer,
  `created_by` text REFERENCES `users`(`id`),
  PRIMARY KEY (`work_item_id`, `step_id`),
  CONSTRAINT `step_blockage_time` CHECK (typeof(`blocked_at`) = 'integer' AND `blocked_at` BETWEEN -9007199254740991 AND 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX `step_blockage_by_step` ON `step_blockage` (`step_id`);
--> statement-breakpoint
CREATE TRIGGER `step_blockage_owner_insert` BEFORE INSERT ON `step_blockage`
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.project_id != s.project_id
  ) THEN RAISE(ABORT, 'step blockage project mismatch') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item WHERE parent_id = NEW.work_item_id
  ) THEN RAISE(ABORT, 'step blockage owner is not a leaf') END;
END;
--> statement-breakpoint
CREATE TRIGGER `step_blockage_owner_update` BEFORE UPDATE ON `step_blockage`
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.project_id != s.project_id
  ) THEN RAISE(ABORT, 'step blockage project mismatch') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item WHERE parent_id = NEW.work_item_id
  ) THEN RAISE(ABORT, 'step blockage owner is not a leaf') END;
END;
