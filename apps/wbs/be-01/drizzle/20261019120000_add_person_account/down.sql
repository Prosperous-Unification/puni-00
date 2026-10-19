-- Refuses while any person is bound: dropping the column would silently unbind
-- every agent from the account it acts for, and nothing else records that.
-- The trigger computes the message so it names the count (SQLite 3.53 accepts
-- an expression as RAISE's message).
-- Proof: the INSERT below replaced by one inserting 0 made
-- `refuses rollback while a person is bound` in `person-account-migration.db.test.ts`
-- observe the rollback succeed and the binding vanish with the column (2026-10-19).
CREATE TEMP TABLE person_account_rollback_guard (bound INTEGER NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER person_account_rollback_refusal
BEFORE INSERT ON person_account_rollback_guard
WHEN NEW.bound > 0
BEGIN
  SELECT RAISE(ABORT, NEW.bound || ' people are bound to accounts; unbind each with a patchPerson command carrying accountId null, then rerun migrate-down-cli.ts');
END;
--> statement-breakpoint
INSERT INTO person_account_rollback_guard SELECT count(*) FROM person WHERE account_id IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER person_account_rollback_refusal;
--> statement-breakpoint
DROP TABLE person_account_rollback_guard;
--> statement-breakpoint
DROP INDEX `person_account`;
--> statement-breakpoint
ALTER TABLE `person` DROP COLUMN `account_id`;
