-- When an OIDC browser sign-in opened, and when its person last authenticated
-- interactively (`organization-session-policy`, task 1.1). Both are integer
-- milliseconds since the epoch and nullable: a lifecycle opened by the outgoing
-- release has neither, and session policy refuses an unknown time rather than
-- defaulting it, so such a lifecycle reauthenticates once.
--
-- Additive: two nullable columns the outgoing release neither reads nor writes.
ALTER TABLE `browser_auth_lifecycle` ADD `opened_at` integer CHECK (`opened_at` IS NULL OR `opened_at` >= 0);
--> statement-breakpoint
ALTER TABLE `browser_auth_lifecycle` ADD `reauthenticated_at` integer CHECK (`reauthenticated_at` IS NULL OR `reauthenticated_at` >= 0);
