-- Proof: removing the guard let rollback drop stored minutes; the named refusal test failed (2026-10-12).
CREATE TEMP TABLE estimate_unit_rollback_guard (
  minute_steps INTEGER NOT NULL,
  CONSTRAINT "minute steps exist: use estimate-unit-rollback-cli.ts save|remove, then restore after the forward run; see docs/runbook-prod-deploy.md#estimate-unit-rollback" CHECK (minute_steps = 0)
);--> statement-breakpoint
INSERT INTO estimate_unit_rollback_guard SELECT count(*) FROM step WHERE estimate_unit = 'minutes';--> statement-breakpoint
DROP TABLE estimate_unit_rollback_guard;--> statement-breakpoint
ALTER TABLE `step` DROP COLUMN `estimate_unit`;
