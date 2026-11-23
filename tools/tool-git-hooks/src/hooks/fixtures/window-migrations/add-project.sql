-- Lint-shape fixture only; not an executable or ready semantic migration.
-- Baseline: b0d2df4eb608827a4933f0840b05300e06158d8a, 110 applied identities, 2026-11-10.
-- foreign-keys-off-rebuild
CREATE TEMP TABLE _project_owner_backfill (violations INTEGER NOT NULL CHECK (violations = 0));
--> statement-breakpoint
SELECT COUNT(*) FROM access_grant;
--> statement-breakpoint
UPDATE work_package SET created_by=owner_id WHERE created_by IS NULL;
--> statement-breakpoint
INSERT INTO _project_owner_backfill SELECT COUNT(*) FROM work_package w LEFT JOIN work_package_organization wo ON wo.resource_id=w.id WHERE wo.resource_id IS NULL OR w.created_by IS NULL;
--> statement-breakpoint
CREATE TABLE project (id TEXT PRIMARY KEY NOT NULL,organization_id TEXT NOT NULL REFERENCES organization(id),name TEXT NOT NULL CHECK (length(name)>0),revision INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER,created_by TEXT REFERENCES users(id),UNIQUE(organization_id,name),UNIQUE(id,organization_id));
--> statement-breakpoint
INSERT INTO project(id,organization_id,name,revision,created_at,updated_at,created_by) SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),wo.organization_id,'Migrated work packages',0,MIN(w.created_at),NULL,NULL FROM work_package w JOIN work_package_organization wo ON wo.resource_id=w.id GROUP BY wo.organization_id;
--> statement-breakpoint
CREATE TABLE work_package_NEW (
	`id` text PRIMARY KEY,
 `project_id` text NOT NULL REFERENCES project(id),
	`name` text NOT NULL,
	`restricted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL, `estimate_method` text DEFAULT 'pert' NOT NULL, `start_date` text, `revision` integer DEFAULT 0 NOT NULL, `solution_slug` text, `solution_url` text, `dep_reach` text DEFAULT 'whole-item' NOT NULL, `pert_weight_optimistic` real DEFAULT 1 NOT NULL, `pert_weight_realistic` real DEFAULT 4 NOT NULL, `pert_weight_pessimistic` real DEFAULT 1 NOT NULL, `estimate_rounding` text DEFAULT 'ceil' NOT NULL, `updated_at` integer, `created_by` text NOT NULL REFERENCES `users`(`id`), `optimization_delete_pending_at` integer, `optimization_enabled` integer DEFAULT 0 NOT NULL CONSTRAINT `work_package_optimization_enabled` CHECK (`optimization_enabled` IN (0, 1)), `schedule_engine` text DEFAULT 'fast' NOT NULL CONSTRAINT `work_package_schedule_engine` CHECK (`schedule_engine` IN ('fast', 'optimized')), `schedule_objective` text DEFAULT 'pri' NOT NULL CONSTRAINT `work_package_schedule_objective` CHECK (`schedule_objective` IN ('pri', 'time')), `timezone` text DEFAULT 'UTC' NOT NULL, `budget_factor` real DEFAULT 1 NOT NULL CHECK (`budget_factor` > 0 AND `budget_factor` <= 1000)
);
--> statement-breakpoint
INSERT INTO work_package_NEW (`id`,`name`,`restricted`,`created_at`,`estimate_method`,`start_date`,`revision`,`solution_slug`,`solution_url`,`dep_reach`,`pert_weight_optimistic`,`pert_weight_realistic`,`pert_weight_pessimistic`,`estimate_rounding`,`updated_at`,`created_by`,`optimization_delete_pending_at`,`optimization_enabled`,`schedule_engine`,`schedule_objective`,`timezone`,`budget_factor`,project_id) SELECT w.`id`,w.`name`,w.`restricted`,w.`created_at`,w.`estimate_method`,w.`start_date`,w.`revision`,w.`solution_slug`,w.`solution_url`,w.`dep_reach`,w.`pert_weight_optimistic`,w.`pert_weight_realistic`,w.`pert_weight_pessimistic`,w.`estimate_rounding`,w.`updated_at`,w.`created_by`,w.`optimization_delete_pending_at`,w.`optimization_enabled`,w.`schedule_engine`,w.`schedule_objective`,w.`timezone`,w.`budget_factor`,p.id FROM work_package w JOIN work_package_organization wo ON wo.resource_id=w.id JOIN project p ON p.organization_id=wo.organization_id;
--> statement-breakpoint
DROP TABLE work_package;
--> statement-breakpoint
ALTER TABLE work_package_NEW RENAME TO work_package;
--> statement-breakpoint
CREATE UNIQUE INDEX `work_package_solution_slug` ON `work_package` (`solution_slug`);
--> statement-breakpoint
CREATE TRIGGER work_package_abbreviation_allocate AFTER INSERT ON work_package
BEGIN
 SELECT RAISE(ABORT,'work_package abbreviation counter missing')
 WHERE (SELECT COUNT(*) FROM work_package_abbreviation_counter WHERE singleton=1) != 1;
 SELECT RAISE(ABORT,'work_package abbreviation exhausted')
 WHERE NOT EXISTS (SELECT 1 FROM work_package_abbreviation_candidate);
 UPDATE work_package_abbreviation_counter SET next=(SELECT ordinal+1 FROM work_package_abbreviation_candidate) WHERE singleton=1;
 INSERT INTO work_package_abbreviation(work_package_id,namespace,abbreviation)
 SELECT NEW.id,
 CASE WHEN EXISTS (SELECT 1 FROM work_package_organization WHERE resource_id=NEW.id)
 THEN 'org:' || (SELECT organization_id FROM work_package_organization WHERE resource_id=NEW.id)
 ELSE 'legacy' END,
 char(65 + ((next-1) / 456976) % 26, 65 + ((next-1) / 17576) % 26, 65 + ((next-1) / 676) % 26, 65 + ((next-1) / 26) % 26, 65 + ((next-1) / 1) % 26)
 FROM work_package_abbreviation_counter WHERE singleton=1;
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_bridge`
AFTER INSERT ON `work_package`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `work_package_organization` (`resource_id`, `organization_id`)
	SELECT NEW.`id`, `organization`.`id` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER work_package_project_organization_insert BEFORE INSERT ON work_package WHEN EXISTS(SELECT 1 FROM project p JOIN work_package_organization wo ON wo.resource_id=NEW.id WHERE p.id=NEW.project_id AND p.organization_id<>wo.organization_id) BEGIN SELECT RAISE(ABORT,'work package project organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER work_package_project_organization_update BEFORE UPDATE ON work_package WHEN EXISTS(SELECT 1 FROM project p JOIN work_package_organization wo ON wo.resource_id=NEW.id WHERE p.id=NEW.project_id AND p.organization_id<>wo.organization_id) BEGIN SELECT RAISE(ABORT,'work package project organization mismatch'); END;
--> statement-breakpoint
CREATE TEMP TABLE _project_foreign_keys (violations INTEGER NOT NULL CHECK (violations = 0));
--> statement-breakpoint
INSERT INTO _project_foreign_keys SELECT COUNT(*) FROM pragma_foreign_key_check;
