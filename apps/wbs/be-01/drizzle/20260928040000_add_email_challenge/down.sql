CREATE TEMP TABLE `email_challenge_down_check` (
  `reversible` integer NOT NULL CHECK (`reversible` = 1)
);
--> statement-breakpoint
-- Proof: 2026-09-28, replacing the retained-row predicate with 1 failed
-- `challenge migration rolls back empty before activation and refuses retained rows`.
-- Removing the activation-state predicate failed
-- `challenge rollback refuses activation without retained challenge rows`.
INSERT INTO `email_challenge_down_check` (`reversible`)
SELECT (SELECT COUNT(*) FROM `email_challenge`) = 0
  AND (SELECT COUNT(*) FROM `organization_activation`) = 1
  AND (SELECT COUNT(*) FROM `organization_activation`
    WHERE `singleton` = 1 AND `state` = 'pre_activation' AND `activated_at` IS NULL) = 1;
--> statement-breakpoint
DROP TABLE `email_challenge_down_check`;
--> statement-breakpoint
DROP TABLE `email_challenge`;
