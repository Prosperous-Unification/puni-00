-- Existing accounts have no durable verification evidence. A later validated
-- OIDC callback may set this only while retaining a non-null email.
-- Proof: 2026-09-28, removing IN (0, 1) let value 2 through with a non-null
-- email; removing the email predicate let value 1 through with null email.
-- Both faults failed `starts old accounts unverified and checks the boolean and email`.
ALTER TABLE `users` ADD COLUMN `email_verified` integer NOT NULL DEFAULT 0
  CHECK (`email_verified` IN (0, 1) AND (`email_verified` = 0 OR `email` IS NOT NULL));
