-- Proof: replacing the unexpired-use predicate with an impossible one made
-- `refuses rollback after activation or while a live use remains` succeed
-- on a live use; watched 2026-09-28.
-- Proof: treating every historical use as live failed `allows pre-activation
-- rollback once every use has expired`; watched 2026-09-28.
-- Proof: replacing the pre-activation marker predicate with 1 = 1 failed the
-- same test after activation; watched 2026-09-28.
CREATE TEMP TABLE `delegation_use_down_check` (
	`reversible` integer NOT NULL CHECK (`reversible` = 1)
);
--> statement-breakpoint
INSERT INTO `delegation_use_down_check` (`reversible`)
SELECT (SELECT COUNT(*) FROM `delegation_use` WHERE `expires_at` > unixepoch()) = 0
	AND (SELECT COUNT(*) FROM `organization_activation`) = 1
	AND (SELECT COUNT(*) FROM `organization_activation`
		WHERE `singleton` = 1 AND `state` = 'pre_activation' AND `activated_at` IS NULL) = 1;
--> statement-breakpoint
DROP TABLE `delegation_use_down_check`;
--> statement-breakpoint
DROP INDEX `delegation_use_expires_at`;
--> statement-breakpoint
DROP TABLE `delegation_use`;
