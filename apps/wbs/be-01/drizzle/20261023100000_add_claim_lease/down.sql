-- Reverses `20261023100000_add_claim_lease`. No guard: a leased claim stays
-- held with its lease dropped, which is how the older image holds every claim
-- (until somebody releases it); nothing it reads names either column.
DROP INDEX `claim_by_lease`;
--> statement-breakpoint
ALTER TABLE `claim` DROP COLUMN `lease_revoked_at`;
--> statement-breakpoint
ALTER TABLE `claim` DROP COLUMN `lease_expires_at`;
