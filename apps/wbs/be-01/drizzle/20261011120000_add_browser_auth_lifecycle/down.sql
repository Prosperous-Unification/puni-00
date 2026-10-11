-- Proof: replacing either count with zero let the retained-row rollback test
-- erase the lifecycle ledger; watched 2026-10-01.
CREATE TEMP TABLE `browser_auth_lifecycle_down_check` (
	`empty` integer NOT NULL CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `browser_auth_lifecycle_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `browser_auth_lifecycle`) = 0
  AND (SELECT COUNT(*) FROM `browser_auth_association`) = 0;
--> statement-breakpoint
DROP TABLE `browser_auth_lifecycle_down_check`;
--> statement-breakpoint
DROP TABLE `browser_auth_association`;
--> statement-breakpoint
DROP TABLE `browser_auth_lifecycle`;
