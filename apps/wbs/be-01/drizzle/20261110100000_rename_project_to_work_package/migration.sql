-- foreign-keys-off-rebuild
CREATE TEMP TABLE _rename_refusal(message TEXT NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER _rename_refuse BEFORE INSERT ON _rename_refusal BEGIN
 SELECT RAISE(ABORT,NEW.message);
END;
--> statement-breakpoint
INSERT INTO _rename_refusal SELECT 'unmapped work packages: ' || COUNT(*) FILTER (WHERE po.resource_id IS NULL) FROM project p LEFT JOIN project_organization po ON po.resource_id=p.id HAVING COUNT(*) FILTER (WHERE po.resource_id IS NULL)>0;
--> statement-breakpoint
CREATE TEMP TABLE _rename_json_roots(
 owner TEXT NOT NULL,row_id TEXT NOT NULL,column_name TEXT NOT NULL,document TEXT NOT NULL,root_path TEXT NOT NULL,
 PRIMARY KEY(owner,row_id,column_name)
);
--> statement-breakpoint
INSERT INTO _rename_json_roots
 SELECT 'command_journal',id,'payload',payload,'$.forward' FROM command_journal
 UNION ALL SELECT 'command_journal',id,'inverse',inverse,'$' FROM command_journal
 UNION ALL SELECT 'command_journal',id,'preconditions',preconditions,'$' FROM command_journal
 UNION ALL SELECT 'plan_event',id,'before',before,'$' FROM plan_event
 UNION ALL SELECT 'plan_event',id,'after',after,'$' FROM plan_event;
--> statement-breakpoint
INSERT INTO _rename_refusal SELECT 'malformed rename history: '||owner||'/'||row_id||'/'||column_name||' invalid JSON'
 FROM _rename_json_roots WHERE NOT json_valid(document);
--> statement-breakpoint
INSERT INTO _rename_refusal SELECT 'malformed rename history: '||owner||'/'||row_id||'/'||column_name||' non-object root'
 FROM _rename_json_roots WHERE json_type(document,root_path) IS NOT 'object';
--> statement-breakpoint
INSERT INTO _rename_refusal
 SELECT 'malformed rename history: '||owner||'/'||row_id||'/'||column_name||' duplicate root container'
 FROM _rename_json_roots r
 WHERE (column_name='payload' AND (SELECT COUNT(*) FROM json_each(r.document) WHERE key='forward')!=1)
 OR (column_name='preconditions' AND (
  (SELECT COUNT(*) FROM json_each(r.document) WHERE key='externalRevisions')>1
  OR (json_type(document,'$.externalRevisions') IS NOT NULL AND (
   (SELECT COUNT(*) FROM json_each(r.document,'$.externalRevisions') WHERE key='expected')!=1
   OR (SELECT COUNT(*) FROM json_each(r.document,'$.externalRevisions') WHERE key='from')!=1))));
--> statement-breakpoint
CREATE TEMP TABLE _rename_commands AS
 WITH RECURSIVE commands(owner,row_id,column_name,document,path) AS (
  SELECT owner,row_id,column_name,document,root_path FROM _rename_json_roots WHERE column_name!='preconditions'
  UNION ALL
  SELECT c.owner,c.row_id,c.column_name,c.document,c.path||'.steps['||e.key||']'
  FROM commands c,json_each(c.document,c.path||'.steps') e
  WHERE json_extract(c.document,c.path||'.do')='batch' AND json_type(c.document,c.path||'.steps')='array'
  UNION ALL
  SELECT c.owner,c.row_id,c.column_name,c.document,c.path||'.structural' FROM commands c
  WHERE json_extract(c.document,c.path||'.do')='transition_incident_nodes'
 ) SELECT * FROM commands;
--> statement-breakpoint
INSERT INTO _rename_refusal
 SELECT 'malformed rename history: '||owner||'/'||row_id||'/'||column_name||' command at '||path
 FROM _rename_commands c
 WHERE json_type(document,path) IS NOT 'object'
 OR json_type(document,path||'.do') IS NOT 'text'
 OR json_extract(document,path||'.do') NOT IN ('patch','set_estimate','clear_estimate','set_actual','clear_actual','set_measure','clear_measure','set_measure_estimate','clear_measure_estimate','set_budget','clear_budget','set_progress','clear_progress','replace_blockage','assign','set_demand','add_claims','remove_claims','move_claims','restore_attempt','remove_attempt','add_dependency','remove_dependency','add_typed_dependency','remove_typed_dependency','update_typed_dependency','transition_incident_nodes','move','set_positions','set_frozen','set_step_allowance','batch','delete_subtree','restore_subtree')
 OR (SELECT COUNT(*) FROM json_each(c.document,c.path) WHERE key='do')!=1
 OR (json_extract(document,path||'.do')='batch' AND json_type(document,path||'.steps') IS NOT 'array')
 OR (json_extract(document,path||'.do')='restore_subtree' AND json_type(document,path||'.rows') IS NOT 'array')
 OR (json_extract(document,path||'.do')='transition_incident_nodes' AND (
  json_type(document,path||'.receipts') IS NOT 'array'
  OR json_type(document,path||'.fromWorkItemId') IS NOT 'text'
  OR json_type(document,path||'.toWorkItemId') IS NOT 'text'));
--> statement-breakpoint
INSERT INTO _rename_refusal
 SELECT 'malformed rename history: '||owner||'/'||row_id||'/'||column_name||' duplicate command container at '||path
 FROM _rename_commands c
 WHERE (json_extract(document,path||'.do')='batch' AND (SELECT COUNT(*) FROM json_each(c.document,c.path) WHERE key='steps')!=1)
 OR (json_extract(document,path||'.do')='restore_subtree' AND (SELECT COUNT(*) FROM json_each(c.document,c.path) WHERE key='rows')!=1)
 OR (json_extract(document,path||'.do')='transition_incident_nodes' AND (
  (SELECT COUNT(*) FROM json_each(c.document,c.path) WHERE key='structural')!=1
  OR (SELECT COUNT(*) FROM json_each(c.document,c.path) WHERE key='receipts')!=1))
 OR (json_extract(document,path||'.do') IN ('add_typed_dependency','remove_typed_dependency') AND (SELECT COUNT(*) FROM json_each(c.document,c.path) WHERE key='dependency')!=1)
 OR (json_extract(document,path||'.do')='update_typed_dependency' AND (
  (SELECT COUNT(*) FROM json_each(c.document,c.path) WHERE key='from')!=1
  OR (SELECT COUNT(*) FROM json_each(c.document,c.path) WHERE key='to')!=1));
--> statement-breakpoint
INSERT INTO _rename_refusal
 SELECT 'malformed rename history: '||c.owner||'/'||c.row_id||'/'||c.column_name||' duplicate incident receipt at '||c.path||'.receipts['||r.key||']'
 FROM _rename_commands c,json_each(c.document,c.path||'.receipts') r
 WHERE json_extract(c.document,c.path||'.do')='transition_incident_nodes' AND (
  (SELECT COUNT(*) FROM json_each(c.document,c.path||'.receipts['||r.key||']') WHERE key='from')!=1
  OR (SELECT COUNT(*) FROM json_each(c.document,c.path||'.receipts['||r.key||']') WHERE key='to')!=1
  OR (SELECT COUNT(*) FROM json_each(c.document,c.path||'.receipts['||r.key||'].from') WHERE key='dependency')!=1
  OR (SELECT COUNT(*) FROM json_each(c.document,c.path||'.receipts['||r.key||'].to') WHERE key='dependency')!=1);
--> statement-breakpoint
CREATE TEMP TABLE _rename_dependencies(owner TEXT,row_id TEXT,column_name TEXT,document TEXT,path TEXT);
--> statement-breakpoint
INSERT INTO _rename_dependencies
 SELECT owner,row_id,column_name,document,path||'.dependency' FROM _rename_commands
 WHERE json_extract(document,path||'.do') IN ('add_typed_dependency','remove_typed_dependency')
 UNION ALL SELECT owner,row_id,column_name,document,path||'.from' FROM _rename_commands WHERE json_extract(document,path||'.do')='update_typed_dependency'
 UNION ALL SELECT owner,row_id,column_name,document,path||'.to' FROM _rename_commands WHERE json_extract(document,path||'.do')='update_typed_dependency'
 UNION ALL SELECT c.owner,c.row_id,c.column_name,c.document,c.path||'.receipts['||r.key||'].'||direction.value||'.dependency'
 FROM _rename_commands c,json_each(c.document,c.path||'.receipts') r,json_each('["from","to"]') direction
 WHERE json_extract(c.document,c.path||'.do')='transition_incident_nodes';
--> statement-breakpoint
INSERT INTO _rename_refusal
 SELECT 'malformed rename history: '||owner||'/'||row_id||'/'||column_name||' duplicate dependency endpoint at '||path
 FROM _rename_dependencies d
 WHERE (SELECT COUNT(*) FROM json_each(d.document,d.path) WHERE key='predecessor')!=1
 OR (SELECT COUNT(*) FROM json_each(d.document,d.path) WHERE key='successor')!=1;
--> statement-breakpoint
INSERT INTO _rename_refusal
 SELECT 'malformed rename history: '||owner||'/'||row_id||'/'||column_name||' dependency at '||path
 FROM _rename_dependencies
 WHERE json_type(document,path) IS NOT 'object'
 OR json_type(document,path||'.id') IS NOT 'text'
 OR json_type(document,path||'.predecessor') IS NOT 'object'
 OR json_type(document,path||'.successor') IS NOT 'object';
--> statement-breakpoint
INSERT INTO _rename_refusal
 SELECT 'malformed rename history: '||owner||'/'||row_id||'/'||column_name||' external revisions'
 FROM _rename_json_roots
 WHERE column_name='preconditions' AND json_type(document,'$.externalRevisions') IS NOT NULL AND (
  json_type(document,'$.externalRevisions') IS NOT 'object'
  OR json_type(document,'$.externalRevisions.expected') IS NOT 'array'
  OR json_type(document,'$.externalRevisions.from') IS NOT 'array');
--> statement-breakpoint
CREATE TEMP TABLE _rename_owned_fields(owner TEXT,row_id TEXT,column_name TEXT,document TEXT,path TEXT,required INTEGER);
--> statement-breakpoint
INSERT INTO _rename_owned_fields
 SELECT owner,row_id,column_name,document,path,1 FROM _rename_commands WHERE json_extract(document,path||'.do')='transition_incident_nodes'
 UNION ALL SELECT c.owner,c.row_id,c.column_name,c.document,c.path||'.rows['||r.key||']',1
 FROM _rename_commands c,json_each(c.document,c.path||'.rows') r WHERE json_extract(c.document,c.path||'.do')='restore_subtree'
 UNION ALL SELECT owner,row_id,column_name,document,path,1 FROM _rename_dependencies
 UNION ALL SELECT owner,row_id,column_name,document,path||'.predecessor',0 FROM _rename_dependencies
 UNION ALL SELECT owner,row_id,column_name,document,path||'.successor',0 FROM _rename_dependencies
 UNION ALL SELECT r.owner,r.row_id,r.column_name,r.document,'$.externalRevisions.'||direction.value||'['||e.key||']',1
 FROM _rename_json_roots r,json_each('["expected","from"]') direction,json_each(r.document,'$.externalRevisions.'||direction.value) e
 WHERE r.column_name='preconditions';
--> statement-breakpoint
INSERT INTO _rename_refusal
 SELECT 'malformed rename history: '||owner||'/'||row_id||'/'||column_name||' owned identifier at '||path
 FROM _rename_owned_fields f
 WHERE json_type(document,path) IS NOT 'object'
 OR json_type(document,path||'.workPackageId') IS NOT NULL
 OR (required=1 AND json_type(document,path||'.projectId') IS NULL)
 OR (json_type(document,path||'.projectId') IS NOT NULL AND (
  json_type(document,path||'.projectId') IS NOT 'text'
  OR length(json_extract(document,path||'.projectId'))=0
  OR (SELECT COUNT(*) FROM json_each(f.document,f.path) WHERE key='projectId')!=1));
--> statement-breakpoint
CREATE TEMP TABLE _rename_json_edits AS
 SELECT owner,row_id,column_name,path||'.projectId' AS before_path,path||'.workPackageId' AS after_path,
 json_extract(document,path||'.projectId') AS identifier,
 ROW_NUMBER() OVER(PARTITION BY owner,row_id,column_name ORDER BY path) AS ordinal
 FROM _rename_owned_fields WHERE json_type(document,path||'.projectId') IS NOT NULL;
--> statement-breakpoint
CREATE TEMP TABLE _rename_json_after AS
 WITH RECURSIVE rewritten(owner,row_id,column_name,ordinal,document) AS (
  SELECT owner,row_id,column_name,0,document FROM _rename_json_roots
  UNION ALL
  SELECT r.owner,r.row_id,r.column_name,e.ordinal,
   json_remove(json_set(r.document,e.after_path,e.identifier),e.before_path)
  FROM rewritten r JOIN _rename_json_edits e ON e.owner=r.owner AND e.row_id=r.row_id AND e.column_name=r.column_name AND e.ordinal=r.ordinal+1
 ) SELECT r.owner,r.row_id,r.column_name,r.document FROM rewritten r
 WHERE r.ordinal>0 AND NOT EXISTS(
  SELECT 1 FROM _rename_json_edits e WHERE e.owner=r.owner AND e.row_id=r.row_id AND e.column_name=r.column_name AND e.ordinal=r.ordinal+1);
--> statement-breakpoint
UPDATE command_journal SET payload=(SELECT document FROM _rename_json_after a WHERE a.owner='command_journal' AND a.row_id=command_journal.id AND a.column_name='payload')
 WHERE EXISTS(SELECT 1 FROM _rename_json_after a WHERE a.owner='command_journal' AND a.row_id=command_journal.id AND a.column_name='payload');
--> statement-breakpoint
UPDATE command_journal SET inverse=(SELECT document FROM _rename_json_after a WHERE a.owner='command_journal' AND a.row_id=command_journal.id AND a.column_name='inverse')
 WHERE EXISTS(SELECT 1 FROM _rename_json_after a WHERE a.owner='command_journal' AND a.row_id=command_journal.id AND a.column_name='inverse');
--> statement-breakpoint
UPDATE command_journal SET preconditions=(SELECT document FROM _rename_json_after a WHERE a.owner='command_journal' AND a.row_id=command_journal.id AND a.column_name='preconditions')
 WHERE EXISTS(SELECT 1 FROM _rename_json_after a WHERE a.owner='command_journal' AND a.row_id=command_journal.id AND a.column_name='preconditions');
--> statement-breakpoint
UPDATE plan_event SET before=(SELECT document FROM _rename_json_after a WHERE a.owner='plan_event' AND a.row_id=plan_event.id AND a.column_name='before')
 WHERE EXISTS(SELECT 1 FROM _rename_json_after a WHERE a.owner='plan_event' AND a.row_id=plan_event.id AND a.column_name='before');
--> statement-breakpoint
UPDATE plan_event SET after=(SELECT document FROM _rename_json_after a WHERE a.owner='plan_event' AND a.row_id=plan_event.id AND a.column_name='after')
 WHERE EXISTS(SELECT 1 FROM _rename_json_after a WHERE a.owner='plan_event' AND a.row_id=plan_event.id AND a.column_name='after');
--> statement-breakpoint
ALTER TABLE `cross_project_dependency_activation` RENAME TO `cross_work_package_dependency_activation`;
--> statement-breakpoint
ALTER TABLE `cross_project_dependency_activation_receipt` RENAME TO `cross_work_package_dependency_activation_receipt`;
--> statement-breakpoint
ALTER TABLE `project` RENAME TO `work_package`;
--> statement-breakpoint
ALTER TABLE `project_abbreviation` RENAME TO `work_package_abbreviation`;
--> statement-breakpoint
ALTER TABLE `project_abbreviation_counter` RENAME TO `work_package_abbreviation_counter`;
--> statement-breakpoint
ALTER TABLE `project_access` RENAME TO `work_package_access`;
--> statement-breakpoint
ALTER TABLE `project_organization` RENAME TO `work_package_organization`;
--> statement-breakpoint
ALTER TABLE `project_priority_band` RENAME TO `work_package_priority_band`;
--> statement-breakpoint
ALTER TABLE `project_rank` RENAME TO `work_package_rank`;
--> statement-breakpoint
ALTER TABLE `project_resource_capacity` RENAME TO `work_package_resource_capacity`;
--> statement-breakpoint
ALTER TABLE `project_solution` RENAME TO `work_package_solution`;
--> statement-breakpoint
ALTER TABLE `project_team_capacity` RENAME TO `work_package_team_capacity`;
--> statement-breakpoint
ALTER TABLE `space_project` RENAME TO `space_work_package`;
--> statement-breakpoint
ALTER TABLE `calendar_marker` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `command_journal` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `dependency` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `external_dependency` RENAME COLUMN `predecessor_project_id` TO `predecessor_work_package_id`;
--> statement-breakpoint
ALTER TABLE `external_dependency` RENAME COLUMN `successor_project_id` TO `successor_work_package_id`;
--> statement-breakpoint
ALTER TABLE `optimization_boundary_certificate` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `optimization_generation` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `optimized_schedule_cache` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `plan_event` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_abbreviation` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_access` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_priority_band` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_rank` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_resource_capacity` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_solution` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_team_capacity` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `resource_use` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `resource_use_event` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `runtime_authority` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `runtime_claim_binding` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `runtime_command_receipt` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `saved_plan` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `solver_queue` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `solver_slot` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `space_work_package` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `step` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `typed_dependency` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_item` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
DROP INDEX `calendar_marker_project_date`;
--> statement-breakpoint
CREATE INDEX `calendar_marker_work_package_date` ON `calendar_marker` (`work_package_id`,`date`);
--> statement-breakpoint
DROP INDEX `dependency_project`;
--> statement-breakpoint
CREATE INDEX `dependency_work_package` ON `dependency` (`work_package_id`);
--> statement-breakpoint
DROP INDEX `external_dependency_by_predecessor_project`;
--> statement-breakpoint
CREATE INDEX `external_dependency_by_predecessor_work_package` ON `external_dependency` (`predecessor_work_package_id`);
--> statement-breakpoint
DROP INDEX `external_dependency_by_successor_project`;
--> statement-breakpoint
CREATE INDEX `external_dependency_by_successor_work_package` ON `external_dependency` (`successor_work_package_id`);
--> statement-breakpoint
DROP INDEX `plan_event_project_time`;
--> statement-breakpoint
CREATE INDEX `plan_event_work_package_time` ON `plan_event` (`work_package_id`,`created_at`);
--> statement-breakpoint
DROP INDEX `project_abbreviation_code`;
--> statement-breakpoint
CREATE INDEX work_package_abbreviation_code ON work_package_abbreviation(abbreviation);
--> statement-breakpoint
DROP INDEX `project_abbreviation_namespace_code`;
--> statement-breakpoint
CREATE UNIQUE INDEX work_package_abbreviation_namespace_code ON work_package_abbreviation(namespace, abbreviation);
--> statement-breakpoint
DROP INDEX `project_organization_organization`;
--> statement-breakpoint
CREATE INDEX `work_package_organization_organization` ON `work_package_organization` (`organization_id`);
--> statement-breakpoint
DROP INDEX `project_organization_resource_organization`;
--> statement-breakpoint
CREATE UNIQUE INDEX `work_package_organization_resource_organization` ON `work_package_organization` (`resource_id`,`organization_id`);
--> statement-breakpoint
DROP INDEX `project_rank_order`;
--> statement-breakpoint
CREATE INDEX `work_package_rank_order` ON `work_package_rank` (`organization_id`,`position`,`work_package_id`);
--> statement-breakpoint
DROP INDEX `project_resource_capacity_by_resource`;
--> statement-breakpoint
CREATE INDEX `work_package_resource_capacity_by_resource` ON `work_package_resource_capacity` (`resource_id`);
--> statement-breakpoint
DROP INDEX `project_solution_organization_slug`;
--> statement-breakpoint
CREATE UNIQUE INDEX `work_package_solution_organization_slug` ON `work_package_solution` (`organization_id`,`slug`);
--> statement-breakpoint
DROP INDEX `project_solution_slug`;
--> statement-breakpoint
CREATE UNIQUE INDEX `work_package_solution_slug` ON `work_package` (`solution_slug`);
--> statement-breakpoint
DROP INDEX `resource_use_project`;
--> statement-breakpoint
CREATE INDEX resource_use_work_package ON resource_use(work_package_id, id);
--> statement-breakpoint
DROP INDEX `saved_plan_project_time`;
--> statement-breakpoint
CREATE INDEX `saved_plan_work_package_time` ON `saved_plan` (`work_package_id`,`created_at`);
--> statement-breakpoint
DROP INDEX `space_project_order`;
--> statement-breakpoint
CREATE INDEX `space_work_package_order` ON `space_work_package` (`space_id`,`position`);
--> statement-breakpoint
DROP INDEX `space_project_project`;
--> statement-breakpoint
CREATE INDEX `space_work_package_work_package` ON `space_work_package` (`work_package_id`,`organization_id`);
--> statement-breakpoint
DROP INDEX `step_id_project`;
--> statement-breakpoint
CREATE UNIQUE INDEX `step_id_work_package` ON `step` (`id`,`work_package_id`);
--> statement-breakpoint
DROP INDEX `step_project_code`;
--> statement-breakpoint
CREATE UNIQUE INDEX `step_work_package_code` ON `step` (`work_package_id`,`code`) WHERE `code` IS NOT NULL;
--> statement-breakpoint
DROP INDEX `step_project_name`;
--> statement-breakpoint
CREATE UNIQUE INDEX `step_work_package_name` ON `step` (`work_package_id`,`name`);
--> statement-breakpoint
DROP INDEX `typed_dependency_project`;
--> statement-breakpoint
CREATE INDEX `typed_dependency_work_package` ON `typed_dependency` (`work_package_id`);
--> statement-breakpoint
DROP INDEX `work_item_id_project`;
--> statement-breakpoint
CREATE UNIQUE INDEX `work_item_id_work_package` ON `work_item` (`id`,`work_package_id`);
--> statement-breakpoint
DROP INDEX `work_item_project_id_id`;
--> statement-breakpoint
CREATE INDEX `work_item_work_package_id_id` ON `work_item` (`work_package_id`,`id`);
--> statement-breakpoint
DROP TRIGGER `claim_step_project_insert`;
--> statement-breakpoint
DROP TRIGGER `claim_step_project_update`;
--> statement-breakpoint
DROP TRIGGER `project_abbreviation_allocate`;
--> statement-breakpoint
DROP TRIGGER `project_abbreviation_namespace`;
--> statement-breakpoint
DROP TRIGGER `project_abbreviation_scope_insert`;
--> statement-breakpoint
DROP TRIGGER `project_abbreviation_scope_update`;
--> statement-breakpoint
DROP TRIGGER `project_organization_bridge`;
--> statement-breakpoint
DROP TRIGGER `project_organization_frozen_delete`;
--> statement-breakpoint
DROP TRIGGER `project_organization_frozen_insert`;
--> statement-breakpoint
DROP TRIGGER `project_organization_frozen_update`;
--> statement-breakpoint
DROP TRIGGER `project_organization_keys_measure_estimates`;
--> statement-breakpoint
DROP TRIGGER `project_organization_keys_measure_facts`;
--> statement-breakpoint
DROP TRIGGER `project_organization_keys_work_item_budgets`;
--> statement-breakpoint
DROP VIEW `project_abbreviation_candidate`;
--> statement-breakpoint
CREATE VIEW work_package_abbreviation_candidate AS
WITH RECURSIVE candidate(ordinal, abbreviation) AS (
 SELECT next, char(65 + ((next) / 456976) % 26, 65 + ((next) / 17576) % 26, 65 + ((next) / 676) % 26, 65 + ((next) / 26) % 26, 65 + ((next) / 1) % 26) FROM work_package_abbreviation_counter WHERE singleton=1 AND next < 11881376
 UNION ALL
 SELECT ordinal+1, char(65 + ((ordinal+1) / 456976) % 26, 65 + ((ordinal+1) / 17576) % 26, 65 + ((ordinal+1) / 676) % 26, 65 + ((ordinal+1) / 26) % 26, 65 + ((ordinal+1) / 1) % 26) FROM candidate
 WHERE ordinal+1 < 11881376
 AND EXISTS (SELECT 1 FROM work_package_abbreviation WHERE abbreviation=candidate.abbreviation)
)
SELECT ordinal FROM candidate
WHERE NOT EXISTS (SELECT 1 FROM work_package_abbreviation WHERE abbreviation=candidate.abbreviation)
LIMIT 1;
--> statement-breakpoint
CREATE TRIGGER `claim_step_work_package_insert` BEFORE INSERT ON `claim`
WHEN NEW.step_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.work_package_id != s.work_package_id
  ) THEN RAISE(ABORT, 'claim step work_package mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER `claim_step_work_package_update` BEFORE UPDATE ON `claim`
WHEN NEW.step_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.work_package_id != s.work_package_id
  ) THEN RAISE(ABORT, 'claim step work_package mismatch') END;
END;
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
CREATE TRIGGER work_package_abbreviation_namespace AFTER INSERT ON work_package_organization
BEGIN
 UPDATE work_package_abbreviation SET namespace='org:' || NEW.organization_id WHERE work_package_id=NEW.resource_id;
END;
--> statement-breakpoint
CREATE TRIGGER work_package_abbreviation_scope_insert BEFORE INSERT ON work_package_abbreviation
WHEN NEW.namespace IS NOT CASE
 WHEN EXISTS (SELECT 1 FROM work_package_organization WHERE resource_id=NEW.work_package_id)
 THEN 'org:' || (SELECT organization_id FROM work_package_organization WHERE resource_id=NEW.work_package_id)
 ELSE 'legacy' END
BEGIN
 SELECT RAISE(ABORT,'work_package abbreviation namespace differs from ownership');
END;
--> statement-breakpoint
CREATE TRIGGER work_package_abbreviation_scope_update BEFORE UPDATE ON work_package_abbreviation
WHEN NEW.namespace IS NOT CASE
 WHEN EXISTS (SELECT 1 FROM work_package_organization WHERE resource_id=NEW.work_package_id)
 THEN 'org:' || (SELECT organization_id FROM work_package_organization WHERE resource_id=NEW.work_package_id)
 ELSE 'legacy' END
BEGIN
 SELECT RAISE(ABORT,'work_package abbreviation namespace differs from ownership');
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
CREATE TRIGGER `work_package_organization_frozen_delete`
BEFORE DELETE ON `work_package_organization`
WHEN EXISTS (SELECT 1 FROM `work_package` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_package_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_frozen_insert`
BEFORE INSERT ON `work_package_organization`
WHEN EXISTS (SELECT 1 FROM `work_package_organization` WHERE `resource_id` = NEW.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_package_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `work_package_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_package_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_keys_measure_estimates`
AFTER INSERT ON `work_package_organization`
BEGIN
	UPDATE `measure_estimate` SET `measure_id` = (
		SELECT m.`id` FROM `measure` AS m
		WHERE m.`organization_id` = NEW.`organization_id` AND m.`key` = `measure_estimate`.`measure_key`
	)
	WHERE `measure_id` IS NULL
		AND `work_item_id` IN (SELECT `id` FROM `work_item` WHERE `work_package_id` = NEW.`resource_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_keys_measure_facts`
AFTER INSERT ON `work_package_organization`
BEGIN
	UPDATE `step_measure` SET `measure_id` = (
		SELECT m.`id` FROM `measure` AS m
		WHERE m.`organization_id` = NEW.`organization_id`
			AND m.`key` = CASE `step_measure`.`metric` WHEN 'token_actual' THEN 'tokens' ELSE 'hours' END
	)
	WHERE `measure_id` IS NULL AND `metric` IN ('token_actual', 'hours_actual')
		AND `work_item_id` IN (SELECT `id` FROM `work_item` WHERE `work_package_id` = NEW.`resource_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_keys_work_item_budgets`
AFTER INSERT ON `work_package_organization`
BEGIN
	UPDATE `work_item_budget` SET `measure_id` = (
		SELECT m.`id` FROM `measure` AS m
		WHERE m.`organization_id` = NEW.`organization_id` AND m.`key` = `work_item_budget`.`measure_key`
	)
	WHERE `measure_id` IS NULL
		AND `work_item_id` IN (SELECT `id` FROM `work_item` WHERE `work_package_id` = NEW.`resource_id`);
END;
--> statement-breakpoint
CREATE TABLE "organization_audit_NEW" (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`actor_id` text NOT NULL,
	`action` text NOT NULL CHECK (`action` IN (
		'restricted_work_package_recovery',
		'sso_connection_created',
		'sso_connection_updated',
		'sso_connection_deleted',
		'sso_connection_proven',
		'sso_enforcement_changed',
		'provisioning_token_issued',
		'provisioning_token_rotated',
		'provisioning_token_revoked',
		'scim_user_provisioned',
		'scim_user_updated',
		'scim_user_deprovisioned',
		'pending_membership_activated',
		'session_policy_changed',
		'machine_credential_created',
		'machine_credential_rotated',
		'machine_credential_revoked',
		'trusted_issuer_registered',
		'trusted_issuer_removed',
		'organization_limits_changed',
		'compute_provider_registered',
		'compute_provider_updated',
		'compute_provider_removed',
		'machine_token_issued',
		'machine_token_issued_overflow',
		'agent_pool_created',
		'agent_pool_revoked',
		'agent_pool_rekeyed',
		'directory_capacity_changed',
		'access_granted',
		'access_revoked',
		'access_group_created',
		'access_group_renamed',
		'access_group_deleted',
		'access_group_member_added',
		'access_group_member_removed',
		'organization_member_removed'
	)),
	`subject_kind` text NOT NULL CHECK (`subject_kind` IN (
		'work_package',
		'sso_connection',
		'provisioning_token',
		'scim_user',
		'session_policy',
		'machine_credential',
		'trusted_issuer',
		'organization_limits',
		'compute_provider',
		'agent_pool',
		'resource',
		'access_grant',
		'access_group',
		'organization_member'
	)),
	`subject_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO organization_audit_NEW (id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) SELECT id,organization_id,actor_id,CASE action WHEN 'restricted_project_recovery' THEN 'restricted_work_package_recovery' ELSE action END,CASE subject_kind WHEN 'project' THEN 'work_package' ELSE subject_kind END,subject_id,detail,created_at FROM organization_audit;
--> statement-breakpoint
DROP TABLE organization_audit;
--> statement-breakpoint
ALTER TABLE organization_audit_NEW RENAME TO organization_audit;
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_audit_machine_token_issued_overflow_day` ON `organization_audit` (
	json_extract(`detail`, '$.credentialId'),
	`created_at` / 86400000
) WHERE `action` = 'machine_token_issued_overflow';
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_audit_machine_token_issued_run` ON `organization_audit` (
	json_extract(`detail`, '$.credentialId'),
	`created_at` / 86400000,
	coalesce(json_extract(`detail`, '$.runId'), '')
) WHERE `action` = 'machine_token_issued';
--> statement-breakpoint
CREATE INDEX `organization_audit_organization_created` ON `organization_audit` (`organization_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `organization_audit_no_delete` BEFORE DELETE ON `organization_audit`
BEGIN
	SELECT RAISE(ABORT, 'organization_audit is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `organization_audit_no_update` BEFORE UPDATE ON `organization_audit`
BEGIN
	SELECT RAISE(ABORT, 'organization_audit is append-only');
END;
--> statement-breakpoint
DROP TRIGGER `step_blockage_owner_insert`;
--> statement-breakpoint
CREATE TRIGGER `step_blockage_owner_insert` BEFORE INSERT ON `step_blockage`
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.work_package_id != s.work_package_id
  ) THEN RAISE(ABORT, 'step blockage work package mismatch') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item WHERE parent_id = NEW.work_item_id
  ) THEN RAISE(ABORT, 'step blockage owner is not a leaf') END;
END;
--> statement-breakpoint
DROP TRIGGER `step_blockage_owner_update`;
--> statement-breakpoint
CREATE TRIGGER `step_blockage_owner_update` BEFORE UPDATE ON `step_blockage`
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.work_package_id != s.work_package_id
  ) THEN RAISE(ABORT, 'step blockage work package mismatch') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item WHERE parent_id = NEW.work_item_id
  ) THEN RAISE(ABORT, 'step blockage owner is not a leaf') END;
END;
--> statement-breakpoint
DROP TRIGGER `step_parallel_owner_insert`;
--> statement-breakpoint
CREATE TRIGGER `step_parallel_owner_insert` BEFORE INSERT ON `step_parallel`
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.work_package_id != s.work_package_id
  ) THEN RAISE(ABORT, 'step parallelism work package mismatch') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item WHERE parent_id = NEW.work_item_id
  ) THEN RAISE(ABORT, 'step parallelism owner is not a leaf') END;
END;
--> statement-breakpoint
DROP TRIGGER `step_parallel_owner_update`;
--> statement-breakpoint
CREATE TRIGGER `step_parallel_owner_update` BEFORE UPDATE ON `step_parallel`
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.work_package_id != s.work_package_id
  ) THEN RAISE(ABORT, 'step parallelism work package mismatch') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item WHERE parent_id = NEW.work_item_id
  ) THEN RAISE(ABORT, 'step parallelism owner is not a leaf') END;
END;
--> statement-breakpoint
INSERT INTO _rename_refusal SELECT 'rename foreign key violations: '||COUNT(*) FROM pragma_foreign_key_check HAVING COUNT(*)>0;
--> statement-breakpoint
DROP TABLE _rename_json_after;
--> statement-breakpoint
DROP TABLE _rename_json_edits;
--> statement-breakpoint
DROP TABLE _rename_owned_fields;
--> statement-breakpoint
DROP TABLE _rename_dependencies;
--> statement-breakpoint
DROP TABLE _rename_commands;
--> statement-breakpoint
DROP TABLE _rename_json_roots;
--> statement-breakpoint
DROP TRIGGER _rename_refuse;
--> statement-breakpoint
DROP TABLE _rename_refusal;
