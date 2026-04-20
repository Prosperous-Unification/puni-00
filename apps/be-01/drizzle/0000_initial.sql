-- Initial migration: create a schema_meta breadcrumb table.
-- Drizzle's migrator runs each file's statements; purely-comment files fail on some SQLite drivers.
CREATE TABLE IF NOT EXISTS `schema_meta` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `schema_meta` (`key`, `value`) VALUES ('initialized_at', CAST(strftime('%s','now') AS text));
