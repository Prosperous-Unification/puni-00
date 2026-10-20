-- Refuses while any credential is pinned: dropping the column would silently
-- widen every fleet credential to claim as any person its account is bound to.
-- Proof: the INSERT below replaced by one inserting 0 made
-- `refuses rollback while a credential is pinned` in `person-account-migration.db.test.ts`
-- observe the rollback succeed and the pin vanish with the column (2026-10-19).
CREATE TEMP TABLE external_identity_person_rollback_guard (pinned INTEGER NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER external_identity_person_rollback_refusal
BEFORE INSERT ON external_identity_person_rollback_guard
WHEN NEW.pinned > 0
BEGIN
  SELECT RAISE(ABORT, NEW.pinned || ' credentials are pinned to persons; unlink each with link-credential-cli.ts --unlink --issuer=<issuer> --subject=<subject>, then rerun migrate-down-cli.ts');
END;
--> statement-breakpoint
INSERT INTO external_identity_person_rollback_guard SELECT count(*) FROM external_identity WHERE person_id IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER external_identity_person_rollback_refusal;
--> statement-breakpoint
DROP TABLE external_identity_person_rollback_guard;
--> statement-breakpoint
DROP INDEX `external_identity_person`;
--> statement-breakpoint
ALTER TABLE `external_identity` DROP COLUMN `person_id`;
