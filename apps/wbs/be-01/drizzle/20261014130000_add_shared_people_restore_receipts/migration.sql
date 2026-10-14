CREATE UNIQUE INDEX `shared_people_restore_operation_digest` ON `shared_people_restore_operation` (`id`, `backup_digest`);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_people_restore_approval_binding` ON `shared_people_restore_approval` (`id`, `operation_id`, `organization_id`);
--> statement-breakpoint
-- Proof: removing receipt PK/digest FK or integer/count checks admitted duplicate, foreign or malformed durable facts in SQLite negatives.
CREATE TABLE `shared_people_restore_receipt` (
  `operation_id` text PRIMARY KEY NOT NULL,
  `backup_digest` text NOT NULL,
  `completed_at` integer NOT NULL CHECK (typeof(`completed_at`) = 'integer'),
  `organizations` integer NOT NULL CHECK (typeof(`organizations`) = 'integer' AND `organizations` >= 0),
  `ranks` integer NOT NULL CHECK (typeof(`ranks`) = 'integer' AND `ranks` >= 0),
  `mode_changes` integer NOT NULL CHECK (typeof(`mode_changes`) = 'integer' AND `mode_changes` >= 0),
  `events` integer NOT NULL CHECK (typeof(`events`) = 'integer' AND `events` >= 0),
  FOREIGN KEY (`operation_id`, `backup_digest`) REFERENCES `shared_people_restore_operation` (`id`, `backup_digest`)
);
--> statement-breakpoint
-- Proof: removing either consumption FK admitted absent receipts or foreign approval bindings; removing PK admitted duplicate consumption.
CREATE TABLE `shared_people_restore_consumption` (
  `approval_id` text PRIMARY KEY NOT NULL,
  `operation_id` text NOT NULL REFERENCES `shared_people_restore_receipt` (`operation_id`),
  `organization_id` text NOT NULL,
  FOREIGN KEY (`approval_id`, `operation_id`, `organization_id`) REFERENCES `shared_people_restore_approval` (`id`, `operation_id`, `organization_id`)
);
--> statement-breakpoint
-- Proof: removing this index admitted a second approval for one consumed organization after approval uniqueness was faulted.
CREATE UNIQUE INDEX `shared_people_restore_consumption_organization` ON `shared_people_restore_consumption` (`operation_id`, `organization_id`);
