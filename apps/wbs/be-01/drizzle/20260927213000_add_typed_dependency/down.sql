-- Refuse a rollback that would hide typed links from an older reader. Recovery:
-- docs/runbook-prod-deploy.md#typed-dependency-rollback.
CREATE TEMP TABLE typed_dependency_rollback_guard (
  typed_rows INTEGER NOT NULL,
  CONSTRAINT "typed dependencies exist: SELECT id, project_id FROM typed_dependency; remove each via removeTypedDependency (export projects first to keep them); rerun migrate-down-cli.ts --to=20260927150000_add_step_code; see docs/runbook-prod-deploy.md#typed-dependency-rollback" CHECK (typed_rows = 0)
);--> statement-breakpoint
INSERT INTO typed_dependency_rollback_guard SELECT count(*) FROM typed_dependency;--> statement-breakpoint
DROP TABLE typed_dependency_rollback_guard;--> statement-breakpoint
DROP INDEX `typed_dependency_by_successor_step`;--> statement-breakpoint
DROP INDEX `typed_dependency_by_predecessor_step`;--> statement-breakpoint
DROP INDEX `typed_dependency_by_successor`;--> statement-breakpoint
DROP INDEX `typed_dependency_project`;--> statement-breakpoint
DROP INDEX `typed_dependency_endpoints`;--> statement-breakpoint
DROP TABLE `typed_dependency`;
