-- Lint-shape fixture only; not an executable or ready semantic migration.
-- Baseline: b0d2df4eb608827a4933f0840b05300e06158d8a, 110 applied identities, 2026-11-10.
-- foreign-keys-off-rebuild
CREATE TABLE setting_value (scope_kind TEXT NOT NULL CHECK(scope_kind IN ('organization','space','project','work_package')),scope_id TEXT NOT NULL,key TEXT NOT NULL,value_json TEXT NOT NULL CHECK(json_valid(value_json)),PRIMARY KEY(scope_kind,scope_id,key));
--> statement-breakpoint
CREATE TEMP TABLE _settings_budget_guard (violations INTEGER NOT NULL CHECK (violations = 0));
--> statement-breakpoint
INSERT INTO _settings_budget_guard SELECT COUNT(*) FROM (SELECT project_id FROM work_package GROUP BY project_id HAVING MIN(budget_factor)<>MAX(budget_factor));
--> statement-breakpoint
INSERT INTO setting_value SELECT 'work_package',id,'timezone',json_quote(timezone) FROM work_package WHERE timezone<>'UTC';
--> statement-breakpoint
INSERT INTO setting_value SELECT 'work_package',id,'pertWeights',json_object('optimistic',pert_weight_optimistic,'realistic',pert_weight_realistic,'pessimistic',pert_weight_pessimistic) FROM work_package WHERE pert_weight_optimistic<>1 OR pert_weight_realistic<>4 OR pert_weight_pessimistic<>1;
--> statement-breakpoint
INSERT INTO setting_value SELECT 'project',project_id,'budgetFactor',json(MIN(budget_factor)) FROM work_package GROUP BY project_id HAVING MIN(budget_factor)<>1;
--> statement-breakpoint
CREATE TABLE work_package_NEW (
	`id` text PRIMARY KEY,
 `project_id` text NOT NULL REFERENCES project(id),
	`name` text NOT NULL,
	`restricted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL, `estimate_method` text DEFAULT 'pert' NOT NULL, `start_date` text, `revision` integer DEFAULT 0 NOT NULL, `solution_slug` text, `solution_url` text, `dep_reach` text DEFAULT 'whole-item' NOT NULL, `estimate_rounding` text DEFAULT 'ceil' NOT NULL, `updated_at` integer, `created_by` text NOT NULL REFERENCES `users`(`id`), `optimization_delete_pending_at` integer, `optimization_enabled` integer DEFAULT 0 NOT NULL CONSTRAINT `work_package_optimization_enabled` CHECK (`optimization_enabled` IN (0, 1)), `schedule_engine` text DEFAULT 'fast' NOT NULL CONSTRAINT `work_package_schedule_engine` CHECK (`schedule_engine` IN ('fast', 'optimized')), `schedule_objective` text DEFAULT 'pri' NOT NULL CONSTRAINT `work_package_schedule_objective` CHECK (`schedule_objective` IN ('pri', 'time'))
);
--> statement-breakpoint
INSERT INTO work_package_NEW (`id`,`name`,`restricted`,`created_at`,`estimate_method`,`start_date`,`revision`,`solution_slug`,`solution_url`,`dep_reach`,`estimate_rounding`,`updated_at`,`created_by`,`optimization_delete_pending_at`,`optimization_enabled`,`schedule_engine`,`schedule_objective`,`project_id`) SELECT `id`,`name`,`restricted`,`created_at`,`estimate_method`,`start_date`,`revision`,`solution_slug`,`solution_url`,`dep_reach`,`estimate_rounding`,`updated_at`,`created_by`,`optimization_delete_pending_at`,`optimization_enabled`,`schedule_engine`,`schedule_objective`,`project_id` FROM work_package;
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
CREATE TABLE calendar_marker_NEW (id TEXT PRIMARY KEY NOT NULL,scope_kind TEXT NOT NULL CHECK(scope_kind IN ('organization','space','project','work_package')),scope_id TEXT NOT NULL,date TEXT NOT NULL,name TEXT NOT NULL,color TEXT,created_at INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO calendar_marker_NEW(id,scope_kind,scope_id,date,name,color,created_at) SELECT id,'work_package',work_package_id,date,name,color,created_at FROM calendar_marker;
--> statement-breakpoint
DROP TABLE calendar_marker;
--> statement-breakpoint
ALTER TABLE calendar_marker_NEW RENAME TO calendar_marker;
--> statement-breakpoint
CREATE INDEX `calendar_marker_work_package_date` ON `calendar_marker` (`scope_id`,`date`);
--> statement-breakpoint
CREATE TEMP TABLE _setting_foreign_keys (violations INTEGER NOT NULL CHECK (violations = 0));
--> statement-breakpoint
INSERT INTO _setting_foreign_keys SELECT COUNT(*) FROM pragma_foreign_key_check;
