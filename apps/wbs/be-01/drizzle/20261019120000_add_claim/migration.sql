-- Proof: placeholder, replaced once the negatives below are watched.
CREATE TABLE `claim` (
  `id` text PRIMARY KEY NOT NULL,
  `work_item_id` text NOT NULL REFERENCES `work_item`(`id`) ON DELETE CASCADE,
  `step_id` text REFERENCES `step`(`id`),
  `person_id` text NOT NULL REFERENCES `person`(`id`) ON DELETE CASCADE,
  `run_id` text,
  `parent_claim_id` text REFERENCES `claim`(`id`) ON DELETE CASCADE,
  `created_at` integer,
  `updated_at` integer,
  `created_by` text REFERENCES `users`(`id`),
  CONSTRAINT `claim_run_id_length` CHECK (`run_id` IS NULL OR (typeof(`run_id`) = 'text' AND length(`run_id`) BETWEEN 1 AND 256)),
  CONSTRAINT `claim_not_own_parent` CHECK (`parent_claim_id` IS NULL OR `parent_claim_id` <> `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_step` ON `claim` (`work_item_id`, `step_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_subtree` ON `claim` (`work_item_id`) WHERE `step_id` IS NULL;
--> statement-breakpoint
CREATE INDEX `claim_by_step` ON `claim` (`step_id`);
--> statement-breakpoint
CREATE INDEX `claim_by_person` ON `claim` (`person_id`);
--> statement-breakpoint
CREATE INDEX `claim_by_parent` ON `claim` (`parent_claim_id`);
--> statement-breakpoint
CREATE TRIGGER `claim_step_project_insert` BEFORE INSERT ON `claim`
WHEN NEW.step_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.project_id != s.project_id
  ) THEN RAISE(ABORT, 'claim step project mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER `claim_step_project_update` BEFORE UPDATE ON `claim`
WHEN NEW.step_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.project_id != s.project_id
  ) THEN RAISE(ABORT, 'claim step project mismatch') END;
END;
