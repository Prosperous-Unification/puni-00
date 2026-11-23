-- foreign-keys-off-rebuild
CREATE TEMP TABLE _setting_refusal(message TEXT NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER _setting_refuse BEFORE INSERT ON _setting_refusal BEGIN SELECT RAISE(ABORT,NEW.message); END;
--> statement-breakpoint
INSERT INTO _setting_refusal SELECT 'project '||project_id||' has disagreeing budget factors' FROM work_package GROUP BY project_id HAVING COUNT(DISTINCT budget_factor)<>1;
--> statement-breakpoint
CREATE TEMP TABLE _setting_lift_event(at INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO _setting_lift_event VALUES(CAST(strftime('%s','now') AS INTEGER)*1000);
--> statement-breakpoint
CREATE TABLE setting_value(scope_kind TEXT NOT NULL CHECK(scope_kind IN ('organization','space','project','work_package')),scope_id TEXT NOT NULL,key TEXT NOT NULL,value_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER,created_by TEXT REFERENCES users(id),PRIMARY KEY(scope_kind,scope_id,key));
--> statement-breakpoint
CREATE TABLE setting_value_lift_source(migration_name TEXT NOT NULL,scope_kind TEXT NOT NULL,scope_id TEXT NOT NULL,key TEXT NOT NULL,source_work_package_id TEXT NOT NULL,source_project_id TEXT NOT NULL,source_value_json TEXT NOT NULL,source_created_at INTEGER NOT NULL,source_updated_at INTEGER,source_created_by TEXT,source_revision INTEGER NOT NULL,recorded_at INTEGER NOT NULL,PRIMARY KEY(migration_name,scope_kind,scope_id,key,source_work_package_id));
--> statement-breakpoint
INSERT INTO setting_value(scope_kind,scope_id,key,value_json,revision,created_at,updated_at,created_by) SELECT 'work_package',w.id,'timezone',json_quote(w.timezone),0,e.at,e.at,NULL FROM work_package w CROSS JOIN _setting_lift_event e WHERE w.timezone<>'UTC';
--> statement-breakpoint
INSERT INTO setting_value(scope_kind,scope_id,key,value_json,revision,created_at,updated_at,created_by) SELECT 'work_package',w.id,'pertWeights',json_object('optimistic',w.pert_weight_optimistic,'realistic',w.pert_weight_realistic,'pessimistic',w.pert_weight_pessimistic),0,e.at,e.at,NULL FROM work_package w CROSS JOIN _setting_lift_event e WHERE w.pert_weight_optimistic<>1 OR w.pert_weight_realistic<>4 OR w.pert_weight_pessimistic<>1;
--> statement-breakpoint
INSERT INTO setting_value(scope_kind,scope_id,key,value_json,revision,created_at,updated_at,created_by) SELECT 'project',w.project_id,'budgetFactor',json_quote(MIN(w.budget_factor)),0,e.at,e.at,NULL FROM work_package w CROSS JOIN _setting_lift_event e GROUP BY w.project_id HAVING MIN(w.budget_factor)<>1;
--> statement-breakpoint
INSERT INTO setting_value_lift_source SELECT '20261110120000_add_setting_value',v.scope_kind,v.scope_id,v.key,w.id,w.project_id,CASE v.key WHEN 'timezone' THEN json_quote(w.timezone) WHEN 'pertWeights' THEN json_object('optimistic',w.pert_weight_optimistic,'realistic',w.pert_weight_realistic,'pessimistic',w.pert_weight_pessimistic) WHEN 'budgetFactor' THEN json_quote(w.budget_factor) END,w.created_at,w.updated_at,w.created_by,w.revision,e.at FROM setting_value v JOIN work_package w ON (v.scope_kind='work_package' AND v.scope_id=w.id) OR (v.scope_kind='project' AND v.scope_id=w.project_id) CROSS JOIN _setting_lift_event e;
--> statement-breakpoint
CREATE TABLE work_package_NEW (
	`id` text PRIMARY KEY,
 `project_id` text NOT NULL REFERENCES project(id),
	`name` text NOT NULL,
	`restricted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL, `estimate_method` text DEFAULT 'pert' NOT NULL, `start_date` text, `revision` integer DEFAULT 0 NOT NULL, `solution_slug` text, `solution_url` text, `dep_reach` text DEFAULT 'whole-item' NOT NULL, `estimate_rounding` text DEFAULT 'ceil' NOT NULL, `updated_at` integer, `created_by` text NOT NULL REFERENCES `users`(`id`), `optimization_delete_pending_at` integer, `optimization_enabled` integer DEFAULT 0 NOT NULL CONSTRAINT `project_optimization_enabled` CHECK (`optimization_enabled` IN (0, 1)), `schedule_engine` text DEFAULT 'fast' NOT NULL CONSTRAINT `project_schedule_engine` CHECK (`schedule_engine` IN ('fast', 'optimized')), `schedule_objective` text DEFAULT 'pri' NOT NULL CONSTRAINT `project_schedule_objective` CHECK (`schedule_objective` IN ('pri', 'time'))
);
--> statement-breakpoint
INSERT INTO work_package_NEW(id,project_id,name,restricted,created_at,estimate_method,start_date,revision,solution_slug,solution_url,dep_reach,estimate_rounding,updated_at,created_by,optimization_delete_pending_at,optimization_enabled,schedule_engine,schedule_objective) SELECT id,project_id,name,restricted,created_at,estimate_method,start_date,revision,solution_slug,solution_url,dep_reach,estimate_rounding,updated_at,created_by,optimization_delete_pending_at,optimization_enabled,schedule_engine,schedule_objective FROM work_package;
--> statement-breakpoint
DROP TRIGGER work_package_organization_frozen_delete;
--> statement-breakpoint
DROP TRIGGER work_package_project_ownership_insert;
--> statement-breakpoint
DROP TRIGGER project_work_package_organization_update;
--> statement-breakpoint
DROP TABLE work_package;
--> statement-breakpoint
ALTER TABLE work_package_NEW RENAME TO work_package;
--> statement-breakpoint
CREATE TRIGGER work_package_project_ownership_insert BEFORE INSERT ON work_package_organization
WHEN EXISTS (SELECT 1 FROM work_package w JOIN project p ON p.id=w.project_id WHERE w.id=NEW.resource_id AND p.organization_id<>NEW.organization_id)
BEGIN SELECT RAISE(ABORT,'work package project organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER project_work_package_organization_update BEFORE UPDATE OF organization_id ON project
WHEN EXISTS (SELECT 1 FROM work_package w JOIN work_package_organization wo ON wo.resource_id=w.id WHERE w.project_id=OLD.id AND wo.organization_id<>NEW.organization_id)
BEGIN SELECT RAISE(ABORT,'work package project organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_frozen_delete`
BEFORE DELETE ON `work_package_organization`
WHEN EXISTS (SELECT 1 FROM `work_package` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_package_organization cannot unmap a live root');
END;
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
CREATE TABLE calendar_marker_NEW(id TEXT PRIMARY KEY,scope_kind TEXT NOT NULL CHECK(scope_kind IN ('organization','space','project','work_package')),scope_id TEXT NOT NULL,date TEXT NOT NULL,name TEXT NOT NULL,color TEXT,created_at INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO calendar_marker_NEW SELECT id,'work_package',work_package_id,date,name,color,created_at FROM calendar_marker;
--> statement-breakpoint
DROP TABLE calendar_marker;
--> statement-breakpoint
ALTER TABLE calendar_marker_NEW RENAME TO calendar_marker;
--> statement-breakpoint
CREATE INDEX calendar_marker_scope_date ON calendar_marker(scope_kind,scope_id,date);
--> statement-breakpoint
CREATE TRIGGER organization_settings_delete AFTER DELETE ON organization BEGIN DELETE FROM setting_value WHERE scope_kind='organization' AND scope_id=OLD.id; DELETE FROM calendar_marker WHERE scope_kind='organization' AND scope_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER space_settings_delete AFTER DELETE ON space BEGIN DELETE FROM setting_value WHERE scope_kind='space' AND scope_id=OLD.id; DELETE FROM calendar_marker WHERE scope_kind='space' AND scope_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER project_settings_delete AFTER DELETE ON project BEGIN DELETE FROM setting_value WHERE scope_kind='project' AND scope_id=OLD.id; DELETE FROM calendar_marker WHERE scope_kind='project' AND scope_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER work_package_settings_delete AFTER DELETE ON work_package BEGIN DELETE FROM setting_value WHERE scope_kind='work_package' AND scope_id=OLD.id; DELETE FROM calendar_marker WHERE scope_kind='work_package' AND scope_id=OLD.id; END;
--> statement-breakpoint
INSERT INTO _setting_refusal SELECT 'settings lift foreign keys invalid' WHERE EXISTS(SELECT 1 FROM pragma_foreign_key_check);
--> statement-breakpoint
DROP TABLE _setting_lift_event;
--> statement-breakpoint
DROP TRIGGER _setting_refuse;
--> statement-breakpoint
DROP TABLE _setting_refusal;
