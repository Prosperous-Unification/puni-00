-- Reverses `20261012090100_add_browser_auth_times`.
--
-- A recorded time is the evidence a session policy decision rests on, so the
-- rollback refuses once any lifecycle carries one; the runner reverts this
-- script and its ledger row together.
--
-- Proof, observed 2026-10-12 in `enterprise-sso-migration.db.test.ts`: the
-- guard made constantly true made `refuses to roll back over a recorded
-- sign-in time` drop both columns.
CREATE TEMP TABLE `browser_auth_times_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "browser sign-in times are recorded: a rollback never discards session policy evidence" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `browser_auth_times_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `browser_auth_lifecycle`
  WHERE `opened_at` IS NOT NULL OR `reauthenticated_at` IS NOT NULL) = 0;
--> statement-breakpoint
DROP TABLE `browser_auth_times_down_check`;
--> statement-breakpoint
ALTER TABLE `browser_auth_lifecycle` DROP COLUMN `reauthenticated_at`;
--> statement-breakpoint
ALTER TABLE `browser_auth_lifecycle` DROP COLUMN `opened_at`;
