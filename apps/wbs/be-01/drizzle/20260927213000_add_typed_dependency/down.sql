-- Refuses a rollback that would hide typed links from an older reader, and
-- names the lossless procedure: save the rows, remove them, roll back, and
-- restore them after a later forward run
-- (docs/runbook-prod-deploy.md#typed-dependency-rollback). The CHECK's name is
-- the message the operator reads, so it carries the procedure.
CREATE TEMP TABLE typed_dependency_rollback_guard (
  typed_rows INTEGER NOT NULL,
  CONSTRAINT "typed dependencies exist: save and remove them first, then rerun migrate-down-cli.ts --to=<baseline>; see docs/runbook-prod-deploy.md#typed-dependency-rollback" CHECK (typed_rows = 0)
);--> statement-breakpoint
INSERT INTO typed_dependency_rollback_guard SELECT count(*) FROM typed_dependency;--> statement-breakpoint
DROP TABLE typed_dependency_rollback_guard;--> statement-breakpoint
DROP INDEX `typed_dependency_by_successor_step`;--> statement-breakpoint
DROP INDEX `typed_dependency_by_predecessor_step`;--> statement-breakpoint
DROP INDEX `typed_dependency_by_successor`;--> statement-breakpoint
DROP INDEX `typed_dependency_project`;--> statement-breakpoint
DROP INDEX `typed_dependency_endpoints`;--> statement-breakpoint
DROP TABLE `typed_dependency`;
