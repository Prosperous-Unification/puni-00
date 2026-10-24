DROP TRIGGER project_abbreviation_scope_update;
--> statement-breakpoint
DROP TRIGGER project_abbreviation_scope_insert;
--> statement-breakpoint
DROP TRIGGER project_abbreviation_namespace;
--> statement-breakpoint
DROP TRIGGER project_abbreviation_allocate;
--> statement-breakpoint
DROP VIEW project_abbreviation_candidate;
--> statement-breakpoint
DROP TABLE project_abbreviation_counter;
--> statement-breakpoint
-- Proof: SELECT 1 instead left side objects in sqlite_master despite a restored ledger
-- in `backfills every project and rollback preserves old project rows and complete ledger` (2026-10-22).
DROP TABLE project_abbreviation;
