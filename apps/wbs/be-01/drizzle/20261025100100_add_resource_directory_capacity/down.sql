-- Reverses `20261025100100_add_resource_directory_capacity`, refusing while
-- any directory capacity is stated: dropping the table would discard it, and
-- the older release would then promise the resource once per project again.
--
-- Proof, observed 2026-10-25 in `directory-capacity-migration.db.test.ts`:
-- with the guard's comparison made `>= 0`, `refuses rollback over a stated
-- directory capacity, keeping it` dropped the table with the row.
CREATE TEMP TABLE `resource_directory_capacity_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "directory capacities are stated: record every resource_directory_capacity row and clear each with setDirectoryCapacity units null before migrate-down-cli.ts --to=<baseline>; no automatic recovery tool exists for them" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `resource_directory_capacity_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `resource_directory_capacity`) = 0;
--> statement-breakpoint
DROP TABLE `resource_directory_capacity_down_check`;
--> statement-breakpoint
DROP TABLE `resource_directory_capacity`;
