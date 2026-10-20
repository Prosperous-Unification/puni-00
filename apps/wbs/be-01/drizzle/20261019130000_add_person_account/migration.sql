-- "This account may act as this person" (wbs-team-claims D5). Nullable and
-- without a default: an unbound person is the state of every row that predates
-- the column, and the outgoing colour's `INSERT INTO person (id, name)` keeps
-- working mid-swap. One account may be bound to many persons, so the index is
-- plain, not unique.
ALTER TABLE `person` ADD COLUMN `account_id` text REFERENCES `users`(`id`);
--> statement-breakpoint
CREATE INDEX `person_account` ON `person` (`account_id`);
