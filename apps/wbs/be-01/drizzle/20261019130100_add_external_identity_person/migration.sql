-- "This credential may claim only as this person" (wbs-team-claims D6): a
-- fleet credential linked to a human's account is pinned to the one agent
-- person it acts as. Null is an unpinned credential, which every browser login
-- and every row before this column is.
ALTER TABLE `external_identity` ADD COLUMN `person_id` text REFERENCES `person`(`id`);
--> statement-breakpoint
CREATE INDEX `external_identity_person` ON `external_identity` (`person_id`);
