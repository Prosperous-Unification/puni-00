-- Proof: removing this nonempty guard let the rollback test erase an expired
-- credential's revocation and migration ledger; watched 2026-10-01.
CREATE TEMP TABLE `browser_credential_revocations_down_check` (
	`empty` integer NOT NULL CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `browser_credential_revocations_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `browser_credential_revocations`) = 0;
--> statement-breakpoint
DROP TABLE `browser_credential_revocations_down_check`;
--> statement-breakpoint
DROP TABLE `browser_credential_revocations`;
