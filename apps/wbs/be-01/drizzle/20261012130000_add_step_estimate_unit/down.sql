-- Proof: ignoring journal bindings let workday-only undo/redo history pass rollback (step-estimate-unit-migration.db.test.ts).
CREATE TEMP TABLE estimate_journal_rollback_guard (
  entries INTEGER NOT NULL,
  CONSTRAINT "minute journal entries exist: rollback refused; keep this image until supported journal recovery is available" CHECK (entries = 0)
);--> statement-breakpoint
INSERT INTO estimate_journal_rollback_guard
SELECT count(*) FROM command_journal j WHERE
CASE
  WHEN json_type(j.preconditions, '$.estimateUnits') IS NULL THEN 0
  WHEN json_type(j.preconditions, '$.estimateUnits') != 'object' THEN 1
  ELSE EXISTS (SELECT 1 FROM json_each(j.preconditions, '$.estimateUnits') WHERE type != 'text' OR value != 'workdays')
END;--> statement-breakpoint
DROP TABLE estimate_journal_rollback_guard;--> statement-breakpoint
-- Proof: removing the guard let rollback drop stored minutes; the named refusal test failed (2026-10-12).
CREATE TEMP TABLE estimate_unit_rollback_guard (
  minute_steps INTEGER NOT NULL,
  CONSTRAINT "minute steps exist: use estimate-unit-rollback-cli.ts save|remove, then restore after the forward run; see docs/runbook-prod-deploy.md#estimate-unit-rollback" CHECK (minute_steps = 0)
);--> statement-breakpoint
INSERT INTO estimate_unit_rollback_guard SELECT count(*) FROM step WHERE estimate_unit = 'minutes';--> statement-breakpoint
DROP TABLE estimate_unit_rollback_guard;--> statement-breakpoint
ALTER TABLE `step` DROP COLUMN `estimate_unit`;
