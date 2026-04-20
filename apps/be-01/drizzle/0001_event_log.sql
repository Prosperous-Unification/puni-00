CREATE TABLE IF NOT EXISTS `event_sequencer` (
  `subscription` text PRIMARY KEY NOT NULL,
  `next_seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `event_log` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `subscription` text NOT NULL,
  `seq` integer NOT NULL,
  `message` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `event_log_sub_seq` ON `event_log` (`subscription`, `seq`);
