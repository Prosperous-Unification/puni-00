-- Evidence and activated organization routing must survive an attempted revert.
-- Proof: 2026-09-28, bypassing the evidence predicate failed `refuses rollback
-- with retained evidence`; bypassing the marker predicate failed `refuses
-- rollback after activation even without verified rows`.
CREATE TEMP TABLE `email_verification_down_check` (
  `reversible` integer NOT NULL CHECK (`reversible` = 1)
);
--> statement-breakpoint
INSERT INTO `email_verification_down_check` (`reversible`)
SELECT (SELECT COUNT(*) FROM `users` WHERE `email_verified` = 1) = 0
  AND (SELECT COUNT(*) FROM `organization_activation`) = 1
  AND (SELECT COUNT(*) FROM `organization_activation`
    WHERE `singleton` = 1 AND `state` = 'pre_activation' AND `activated_at` IS NULL) = 1;
--> statement-breakpoint
DROP TABLE `email_verification_down_check`;
--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `email_verified`;
