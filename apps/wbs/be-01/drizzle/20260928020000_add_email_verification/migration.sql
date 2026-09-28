-- Existing accounts have no durable verification evidence. A later validated
-- OIDC callback may set this only while retaining a non-null email.
-- Proof: 2026-09-28, replacing the CHECK with CHECK (1) failed `starts old
-- accounts unverified and checks the boolean and email`.
ALTER TABLE `users` ADD COLUMN `email_verified` integer NOT NULL DEFAULT 0
  CHECK (`email_verified` IN (0, 1) AND (`email_verified` = 0 OR `email` IS NOT NULL));
