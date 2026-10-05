-- Proof: independently removing NOT NULL or the encoding CHECK accepts invalid values in the constrained-mode test.
ALTER TABLE `organization` ADD COLUMN `shared_people` integer NOT NULL DEFAULT 0 CHECK (`shared_people` IN (0, 1));
