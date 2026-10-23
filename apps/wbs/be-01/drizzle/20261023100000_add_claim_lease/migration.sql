-- The lease an agent's claim carries (`wbs-claim-leases` L1, L3, L8, task 1.2).
-- Additive: two nullable columns on `claim` and one index. The outgoing release
-- names neither column, so a claim it writes mid-swap is leaseless and is held
-- until released, exactly as every claim was before this change.
--
-- `lease_expires_at` is the instant the claim must be renewed by, null for a
-- claim nobody renews (a human's). `lease_revoked_at` is the instant the
-- holder's last live machine credential was revoked, which also moves
-- `lease_expires_at` to that instant; a revoked lease is never renewed.
ALTER TABLE `claim` ADD `lease_expires_at` integer;
--> statement-breakpoint
ALTER TABLE `claim` ADD `lease_revoked_at` integer;
--> statement-breakpoint
CREATE INDEX `claim_by_lease` ON `claim` (`lease_expires_at`) WHERE `lease_expires_at` IS NOT NULL;
