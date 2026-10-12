-- Proof: dropping the CHECK admitted hours in step-estimate-unit-migration.db.test.ts (2026-10-12).
ALTER TABLE `step` ADD COLUMN `estimate_unit` TEXT NOT NULL DEFAULT 'workdays' CONSTRAINT step_estimate_unit CHECK (estimate_unit IN ('workdays', 'minutes'));
