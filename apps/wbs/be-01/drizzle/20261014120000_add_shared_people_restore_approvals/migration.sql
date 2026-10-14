CREATE TABLE `shared_people_restore_operation` (
  -- Proof: removing the ID check admitted an empty operation in the durable-binding negative.
  `id` text PRIMARY KEY NOT NULL CHECK (length(`id`) > 0),
  -- Proof: removing this check admitted a malformed digest in the durable-binding negative.
  `backup_digest` text NOT NULL CHECK (length(`backup_digest`) = 64 AND `backup_digest` NOT GLOB '*[^a-f0-9]*'),
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shared_people_restore_approval` (
  `id` text PRIMARY KEY NOT NULL,
  -- Proof: removing this reference admitted consent for an absent operation in the parent negative.
  `operation_id` text NOT NULL REFERENCES `shared_people_restore_operation`(`id`),
  -- Proof: removing this reference admitted consent for an absent organization in the parent negative.
  `organization_id` text NOT NULL REFERENCES `organization`(`id`),
  `actor_id` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
-- Proof: replacing UNIQUE with a plain index admitted duplicate consent in the parent negative.
CREATE UNIQUE INDEX `shared_people_restore_approval_operation_organization` ON `shared_people_restore_approval` (`operation_id`, `organization_id`);
