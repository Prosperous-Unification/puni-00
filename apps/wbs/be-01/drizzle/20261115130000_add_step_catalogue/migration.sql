-- foreign-keys-off-rebuild
CREATE TEMP TABLE _catalogue_refusal(message TEXT NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER _catalogue_refusal_raise BEFORE INSERT ON _catalogue_refusal BEGIN SELECT RAISE(ABORT,NEW.message); END;
--> statement-breakpoint
INSERT INTO _catalogue_refusal SELECT message FROM (
 SELECT 'step catalogue incomplete or incoherent survivor decision: '||quote(s.id) AS message
 FROM step s LEFT JOIN _catalogue_merge m ON m.old_step_id=s.id LEFT JOIN step survivor ON survivor.id=m.survivor_step_id
 LEFT JOIN work_package_organization source_org ON source_org.resource_id=s.work_package_id
 LEFT JOIN work_package_organization survivor_org ON survivor_org.resource_id=survivor.work_package_id
 WHERE m.old_step_id IS NULL OR survivor.id IS NULL OR source_org.organization_id IS NULL OR survivor_org.organization_id IS NULL
 OR source_org.organization_id<>survivor_org.organization_id OR (s.code IS NOT NULL AND m.resolved_code<>s.code)
 OR NOT EXISTS(SELECT 1 FROM _catalogue_merge root WHERE root.old_step_id=m.survivor_step_id AND root.survivor_step_id=root.old_step_id AND root.resolved_code=m.resolved_code)
 UNION ALL
 SELECT 'step catalogue unknown source decision: '||quote(m.old_step_id) FROM _catalogue_merge m LEFT JOIN step s ON s.id=m.old_step_id WHERE s.id IS NULL
) ORDER BY message COLLATE BINARY LIMIT 1;
--> statement-breakpoint
INSERT INTO _catalogue_refusal SELECT 'step catalogue ambiguous package survivor metadata: '||quote(s.work_package_id)||'/'||quote(m.survivor_step_id)
FROM step s JOIN _catalogue_merge m ON m.old_step_id=s.id GROUP BY s.work_package_id,m.survivor_step_id HAVING COUNT(*)>1 ORDER BY s.work_package_id,m.survivor_step_id LIMIT 1;
--> statement-breakpoint
INSERT INTO _catalogue_refusal SELECT 'step catalogue ambiguous organization code survivors: '||quote(wo.organization_id)||'/'||quote(m.resolved_code)
FROM step s JOIN work_package_organization wo ON wo.resource_id=s.work_package_id JOIN _catalogue_merge m ON m.old_step_id=s.id
GROUP BY wo.organization_id,m.resolved_code HAVING COUNT(DISTINCT m.survivor_step_id)>1 ORDER BY wo.organization_id,m.resolved_code LIMIT 1;
--> statement-breakpoint
INSERT INTO _catalogue_refusal SELECT 'step catalogue name clash in organization '||quote(wo.organization_id)||': '||quote(s.name)
FROM step s JOIN work_package_organization wo ON wo.resource_id=s.work_package_id JOIN _catalogue_merge m ON m.old_step_id=s.id
GROUP BY wo.organization_id,s.name HAVING COUNT(DISTINCT m.resolved_code)>1 ORDER BY wo.organization_id,s.name LIMIT 1;
--> statement-breakpoint
INSERT INTO _catalogue_refusal SELECT 'step catalogue divergent project step sets require regrouping: '||quote(a.project_id)
FROM work_package a JOIN work_package b ON b.project_id=a.project_id AND a.id<b.id
WHERE EXISTS(SELECT m.resolved_code FROM step s JOIN _catalogue_merge m ON m.old_step_id=s.id WHERE s.work_package_id=a.id
 EXCEPT SELECT m.resolved_code FROM step s JOIN _catalogue_merge m ON m.old_step_id=s.id WHERE s.work_package_id=b.id)
OR EXISTS(SELECT m.resolved_code FROM step s JOIN _catalogue_merge m ON m.old_step_id=s.id WHERE s.work_package_id=b.id
 EXCEPT SELECT m.resolved_code FROM step s JOIN _catalogue_merge m ON m.old_step_id=s.id WHERE s.work_package_id=a.id)
ORDER BY a.project_id,a.id,b.id LIMIT 1;
--> statement-breakpoint
INSERT INTO _catalogue_refusal SELECT 'step catalogue typed endpoint package mismatch: '||quote(d.id) FROM typed_dependency d LEFT JOIN work_item a ON a.id=d.predecessor_work_item_id LEFT JOIN work_item b ON b.id=d.successor_work_item_id WHERE a.id IS NULL OR b.id IS NULL OR a.work_package_id<>d.work_package_id OR b.work_package_id<>d.work_package_id ORDER BY d.id LIMIT 1;
--> statement-breakpoint
INSERT INTO _catalogue_refusal SELECT message FROM (
SELECT 'step catalogue foreign or missing estimate.step_id: '||quote(f.step_id) AS message FROM estimate f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing actual.step_id: '||quote(f.step_id) AS message FROM actual f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing step_progress.step_id: '||quote(f.step_id) AS message FROM step_progress f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing step_measure.step_id: '||quote(f.step_id) AS message FROM step_measure f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing measure_estimate.step_id: '||quote(f.step_id) AS message FROM measure_estimate f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing step_node_attempt.step_id: '||quote(f.step_id) AS message FROM step_node_attempt f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing step_node_attempt_issued.step_id: '||quote(f.step_id) AS message FROM step_node_attempt_issued f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing assignment.step_id: '||quote(f.step_id) AS message FROM assignment f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing claim.step_id: '||quote(f.step_id) AS message FROM claim f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing step_blockage.step_id: '||quote(f.step_id) AS message FROM step_blockage f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing step_parallel.step_id: '||quote(f.step_id) AS message FROM step_parallel f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step s ON s.id=f.step_id WHERE f.step_id IS NOT NULL AND (s.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing typed_dependency.predecessor_step_id: '||quote(f.predecessor_step_id) AS message FROM typed_dependency f  LEFT JOIN step s ON s.id=f.predecessor_step_id WHERE f.predecessor_step_id IS NOT NULL AND (s.id IS NULL OR f.work_package_id IS NULL OR f.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing typed_dependency.successor_step_id: '||quote(f.successor_step_id) AS message FROM typed_dependency f  LEFT JOIN step s ON s.id=f.successor_step_id WHERE f.successor_step_id IS NOT NULL AND (s.id IS NULL OR f.work_package_id IS NULL OR f.work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing external_dependency.predecessor_step_id: '||quote(f.predecessor_step_id) AS message FROM external_dependency f  LEFT JOIN step s ON s.id=f.predecessor_step_id WHERE f.predecessor_step_id IS NOT NULL AND (s.id IS NULL OR f.predecessor_work_package_id IS NULL OR f.predecessor_work_package_id<>s.work_package_id)
UNION ALL
SELECT 'step catalogue foreign or missing external_dependency.successor_step_id: '||quote(f.successor_step_id) AS message FROM external_dependency f  LEFT JOIN step s ON s.id=f.successor_step_id WHERE f.successor_step_id IS NOT NULL AND (s.id IS NULL OR f.successor_work_package_id IS NULL OR f.successor_work_package_id<>s.work_package_id)
) ORDER BY message COLLATE BINARY LIMIT 1;
--> statement-breakpoint
CREATE TEMP TABLE _catalogue_source AS SELECT s.*,w.project_id AS binding_project_id,wo.organization_id AS organization_id,p.organization_id AS parent_organization_id FROM step s LEFT JOIN work_package w ON w.id=s.work_package_id LEFT JOIN work_package_organization wo ON wo.resource_id=w.id LEFT JOIN project p ON p.id=w.project_id;
--> statement-breakpoint
INSERT INTO _catalogue_refusal SELECT 'step catalogue inconsistent package/project organization for '||quote(id) FROM _catalogue_source WHERE binding_project_id IS NULL OR organization_id IS NULL OR parent_organization_id IS NULL OR organization_id<>parent_organization_id ORDER BY id LIMIT 1;
--> statement-breakpoint
DROP TRIGGER `claim_step_work_package_insert`;
--> statement-breakpoint
DROP TRIGGER `claim_step_work_package_update`;
--> statement-breakpoint
DROP TRIGGER `step_blockage_owner_insert`;
--> statement-breakpoint
DROP TRIGGER `step_blockage_owner_update`;
--> statement-breakpoint
DROP TRIGGER `step_parallel_owner_insert`;
--> statement-breakpoint
DROP TRIGGER `step_parallel_owner_update`;
--> statement-breakpoint
DROP TRIGGER `typed_dependency_cross_identity_insert`;
--> statement-breakpoint
DROP TRIGGER `typed_dependency_cross_endpoints_insert`;
--> statement-breakpoint
DROP TRIGGER `typed_dependency_cross_identity_update`;
--> statement-breakpoint
DROP TRIGGER `typed_dependency_cross_endpoints_update`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_cross_identity_insert`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_cross_endpoints_insert`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_cross_identity_update`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_cross_endpoints_update`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_admit_insert`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_admit_update`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_admit_delete`;
--> statement-breakpoint
ALTER TABLE step RENAME TO step_definition;
--> statement-breakpoint
CREATE TABLE step_definition_NEW(
 id TEXT PRIMARY KEY NOT NULL,
 organization_id TEXT NOT NULL REFERENCES organization(id),
 code TEXT NOT NULL CHECK(length(code)>0),
 name TEXT NOT NULL CHECK(length(name)>0),
 estimate_unit TEXT NOT NULL CHECK(estimate_unit IN ('workdays','minutes')),
 default_allowance_bps INTEGER NOT NULL CHECK(typeof(default_allowance_bps)='integer' AND default_allowance_bps BETWEEN 0 AND 100000),
 position INTEGER NOT NULL CHECK(typeof(position)='integer'),
 created_at INTEGER CHECK(created_at IS NULL OR typeof(created_at)='integer'),
 updated_at INTEGER CHECK(updated_at IS NULL OR typeof(updated_at)='integer'),
 created_by TEXT REFERENCES users(id),
 defined_at_scope_kind TEXT NOT NULL CHECK(defined_at_scope_kind IN ('organization','space','project')),
 defined_at_scope_id TEXT NOT NULL CHECK(length(defined_at_scope_id)>0),
 origin TEXT NOT NULL CHECK(origin IN ('migration','authored')),
 legacy_work_package_id TEXT REFERENCES work_package(id) ON DELETE SET NULL,
 legacy_code TEXT CHECK(legacy_code IS NULL OR typeof(legacy_code)='text'),
 legacy_code_captured INTEGER NOT NULL DEFAULT 0 CHECK(typeof(legacy_code_captured)='integer' AND legacy_code_captured IN (0,1)),
 CHECK((origin='migration' AND legacy_code_captured=1) OR (origin='authored' AND legacy_code_captured=0 AND legacy_code IS NULL)),
 CHECK(origin='migration' OR legacy_work_package_id IS NULL),
 UNIQUE(organization_id,code),UNIQUE(organization_id,name),UNIQUE(id,organization_id)
);
--> statement-breakpoint
INSERT INTO step_definition_NEW(id,organization_id,code,name,estimate_unit,default_allowance_bps,position,created_at,updated_at,created_by,defined_at_scope_kind,defined_at_scope_id,origin,legacy_work_package_id,legacy_code,legacy_code_captured)
SELECT s.id,s.organization_id,m.resolved_code,s.name,s.estimate_unit,s.allowance_bps,s.position,s.created_at,s.updated_at,s.created_by,'project',s.binding_project_id,'migration',s.work_package_id,s.code,1
FROM _catalogue_source s JOIN _catalogue_merge m ON m.old_step_id=s.id WHERE m.survivor_step_id=s.id;
--> statement-breakpoint
DROP TABLE step_definition;
--> statement-breakpoint
ALTER TABLE step_definition_NEW RENAME TO step_definition;
--> statement-breakpoint
CREATE TABLE step_binding(
 id TEXT PRIMARY KEY NOT NULL,organization_id TEXT NOT NULL REFERENCES organization(id),
 scope_kind TEXT NOT NULL CHECK(scope_kind IN ('organization','space','project')),
 scope_id TEXT NOT NULL CHECK(length(scope_id)>0),step_id TEXT NOT NULL REFERENCES step_definition(id),
 work_item_type_id TEXT REFERENCES work_item_type(id),
 type_key TEXT GENERATED ALWAYS AS (ifnull(work_item_type_id,'')) STORED,
 position INTEGER NOT NULL CHECK(typeof(position)='integer'),
 origin TEXT NOT NULL CHECK(origin IN ('migration','authored')),
 CHECK(work_item_type_id IS NULL OR length(work_item_type_id)>0),
 UNIQUE(scope_kind,scope_id,step_id,type_key)
);
--> statement-breakpoint
CREATE TRIGGER step_binding_scope_insert BEFORE INSERT ON step_binding BEGIN
 SELECT RAISE(ABORT,'step binding organization mismatch') WHERE NOT EXISTS(SELECT 1 FROM step_definition d WHERE d.id=NEW.step_id AND d.organization_id=NEW.organization_id)
 OR (NEW.scope_kind='organization' AND NEW.scope_id<>NEW.organization_id)
 OR (NEW.scope_kind='space' AND NOT EXISTS(SELECT 1 FROM space s WHERE s.id=NEW.scope_id AND s.organization_id=NEW.organization_id))
 OR (NEW.scope_kind='project' AND NOT EXISTS(SELECT 1 FROM project p WHERE p.id=NEW.scope_id AND p.organization_id=NEW.organization_id))
 OR (NEW.work_item_type_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_item_type_organization t WHERE t.resource_id=NEW.work_item_type_id AND t.organization_id=NEW.organization_id));
 END;
--> statement-breakpoint
CREATE TRIGGER step_binding_scope_update BEFORE UPDATE ON step_binding BEGIN
 SELECT RAISE(ABORT,'step binding organization mismatch') WHERE NOT EXISTS(SELECT 1 FROM step_definition d WHERE d.id=NEW.step_id AND d.organization_id=NEW.organization_id)
 OR (NEW.scope_kind='organization' AND NEW.scope_id<>NEW.organization_id)
 OR (NEW.scope_kind='space' AND NOT EXISTS(SELECT 1 FROM space s WHERE s.id=NEW.scope_id AND s.organization_id=NEW.organization_id))
 OR (NEW.scope_kind='project' AND NOT EXISTS(SELECT 1 FROM project p WHERE p.id=NEW.scope_id AND p.organization_id=NEW.organization_id))
 OR (NEW.work_item_type_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_item_type_organization t WHERE t.resource_id=NEW.work_item_type_id AND t.organization_id=NEW.organization_id));
 END;
--> statement-breakpoint
INSERT INTO step_binding(id,organization_id,scope_kind,scope_id,step_id,work_item_type_id,position,origin)
SELECT 'migration:'||s.id,s.organization_id,'project',s.binding_project_id,m.survivor_step_id,NULL,s.position,'migration'
FROM _catalogue_source s JOIN _catalogue_merge m ON m.old_step_id=s.id
WHERE NOT EXISTS(
 SELECT 1 FROM _catalogue_source earlier JOIN _catalogue_merge decision ON decision.old_step_id=earlier.id
 WHERE earlier.organization_id=s.organization_id AND earlier.binding_project_id=s.binding_project_id AND decision.survivor_step_id=m.survivor_step_id
 AND ((earlier.created_at IS NOT NULL AND s.created_at IS NULL) OR earlier.created_at<s.created_at
 OR (earlier.created_at IS s.created_at AND earlier.id COLLATE BINARY<s.id COLLATE BINARY))
);
--> statement-breakpoint
CREATE TABLE work_package_step(
 work_package_id TEXT NOT NULL REFERENCES work_package(id) ON DELETE CASCADE,
 step_id TEXT NOT NULL REFERENCES step_definition(id),
 estimate_unit TEXT NOT NULL CHECK(estimate_unit IN ('workdays','minutes')),
 allowance_bps INTEGER NOT NULL CHECK(typeof(allowance_bps)='integer' AND allowance_bps BETWEEN 0 AND 100000),
 allowance_revision INTEGER NOT NULL CHECK(typeof(allowance_revision)='integer'),
 PRIMARY KEY(work_package_id,step_id),UNIQUE(step_id,work_package_id)
);
--> statement-breakpoint
CREATE TRIGGER work_package_step_scope_insert BEFORE INSERT ON work_package_step BEGIN SELECT RAISE(ABORT,'work package step organization mismatch') WHERE NOT EXISTS(SELECT 1 FROM work_package_organization w JOIN step_definition d ON d.id=NEW.step_id WHERE w.resource_id=NEW.work_package_id AND w.organization_id=d.organization_id); END;
--> statement-breakpoint
CREATE TRIGGER work_package_step_scope_update BEFORE UPDATE ON work_package_step BEGIN SELECT RAISE(ABORT,'work package step organization mismatch') WHERE NOT EXISTS(SELECT 1 FROM work_package_organization w JOIN step_definition d ON d.id=NEW.step_id WHERE w.resource_id=NEW.work_package_id AND w.organization_id=d.organization_id); END;
--> statement-breakpoint
INSERT INTO work_package_step(work_package_id,step_id,estimate_unit,allowance_bps,allowance_revision)
SELECT s.work_package_id,m.survivor_step_id,s.estimate_unit,s.allowance_bps,s.allowance_revision FROM _catalogue_source s JOIN _catalogue_merge m ON m.old_step_id=s.id;
--> statement-breakpoint
CREATE TABLE step_identity_history(old_step_id TEXT PRIMARY KEY NOT NULL,step_id TEXT NOT NULL REFERENCES step_definition(id),merged_at INTEGER NOT NULL CHECK(typeof(merged_at)='integer'),CHECK(old_step_id<>step_id));
--> statement-breakpoint
INSERT INTO step_identity_history(old_step_id,step_id,merged_at)
SELECT old_step_id,survivor_step_id,merged_at FROM _catalogue_merge WHERE old_step_id<>survivor_step_id ORDER BY old_step_id COLLATE BINARY;
--> statement-breakpoint
UPDATE estimate SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=estimate.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE actual SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=actual.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE step_progress SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=step_progress.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE measure_estimate SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=measure_estimate.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE step_measure SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=step_measure.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE step_node_attempt SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=step_node_attempt.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE step_node_attempt_issued SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=step_node_attempt_issued.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE assignment SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=assignment.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE claim SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=claim.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE step_blockage SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=step_blockage.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE step_parallel SET step_id=(SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=step_parallel.step_id)
WHERE step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
UPDATE typed_dependency SET
 predecessor_step_id=CASE WHEN predecessor_step_id IS NULL THEN NULL ELSE (SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=typed_dependency.predecessor_step_id) END,
 successor_step_id=CASE WHEN successor_step_id IS NULL THEN NULL ELSE (SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=typed_dependency.successor_step_id) END
WHERE predecessor_step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id)
 OR successor_step_id IN (SELECT old_step_id FROM _catalogue_merge WHERE old_step_id<>survivor_step_id);
--> statement-breakpoint
CREATE TABLE `external_dependency_NEW` (

 `id` text PRIMARY KEY NOT NULL,
 `organization_id` text NOT NULL,
 `predecessor_work_package_id` text NOT NULL,
 `successor_work_package_id` text NOT NULL,
 `predecessor_work_item_id` text NOT NULL,

 `predecessor_scope` text NOT NULL CHECK (`predecessor_scope` IN ('whole','node','descendant-step')),
 `predecessor_step_id` text,
 `successor_work_item_id` text NOT NULL,

 `successor_scope` text NOT NULL CHECK (`successor_scope` IN ('whole','node','descendant-step')),
 `successor_step_id` text,

 `type` text NOT NULL CHECK (`type` IN ('FS','SS','FF')),
 `created_at` integer,
 `updated_at` integer,
 `created_by` text REFERENCES `users`(`id`),

 CHECK (`predecessor_work_package_id` <> `successor_work_package_id`),

 CHECK ((`predecessor_scope` = 'whole') = (`predecessor_step_id` IS NULL)),

 CHECK ((`successor_scope` = 'whole') = (`successor_step_id` IS NULL)),

 FOREIGN KEY (`predecessor_work_package_id`,`organization_id`) REFERENCES `work_package_organization`(`resource_id`,`organization_id`) ON DELETE RESTRICT,

 FOREIGN KEY (`successor_work_package_id`,`organization_id`) REFERENCES `work_package_organization`(`resource_id`,`organization_id`) ON DELETE RESTRICT,

 FOREIGN KEY (`predecessor_work_item_id`,`predecessor_work_package_id`) REFERENCES `work_item`(`id`,`work_package_id`) ON DELETE RESTRICT,

 FOREIGN KEY (`successor_work_item_id`,`successor_work_package_id`) REFERENCES `work_item`(`id`,`work_package_id`) ON DELETE RESTRICT,

 FOREIGN KEY (`predecessor_step_id`,`predecessor_work_package_id`) REFERENCES `work_package_step`(`step_id`,`work_package_id`) ON DELETE RESTRICT,

 FOREIGN KEY (`successor_step_id`,`successor_work_package_id`) REFERENCES `work_package_step`(`step_id`,`work_package_id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO external_dependency_NEW(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type,created_at,updated_at,created_by)
SELECT e.id,e.organization_id,e.predecessor_work_package_id,e.successor_work_package_id,e.predecessor_work_item_id,e.predecessor_scope,
 CASE WHEN e.predecessor_step_id IS NULL THEN NULL ELSE (SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=e.predecessor_step_id) END,
 e.successor_work_item_id,e.successor_scope,
 CASE WHEN e.successor_step_id IS NULL THEN NULL ELSE (SELECT survivor_step_id FROM _catalogue_merge WHERE old_step_id=e.successor_step_id) END,
 e.type,e.created_at,e.updated_at,e.created_by FROM external_dependency e;
--> statement-breakpoint
DROP TABLE external_dependency;
--> statement-breakpoint
ALTER TABLE external_dependency_NEW RENAME TO external_dependency;
--> statement-breakpoint
CREATE UNIQUE INDEX `external_dependency_endpoints` ON `external_dependency` (`predecessor_work_item_id`,`predecessor_scope`,ifnull(`predecessor_step_id`,''),`successor_work_item_id`,`successor_scope`,ifnull(`successor_step_id`,''),`type`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_predecessor_work_package` ON `external_dependency` (`predecessor_work_package_id`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_predecessor_work_item` ON `external_dependency` (`predecessor_work_item_id`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_predecessor_step` ON `external_dependency` (`predecessor_step_id`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_successor_work_package` ON `external_dependency` (`successor_work_package_id`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_successor_work_item` ON `external_dependency` (`successor_work_item_id`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_successor_step` ON `external_dependency` (`successor_step_id`);
--> statement-breakpoint
CREATE TRIGGER `typed_dependency_cross_identity_insert` BEFORE INSERT ON `typed_dependency`
WHEN EXISTS (SELECT 1 FROM `external_dependency` AS existing WHERE existing.id = NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency identity'); END;
--> statement-breakpoint
CREATE TRIGGER `typed_dependency_cross_endpoints_insert` BEFORE INSERT ON `typed_dependency`
WHEN EXISTS (SELECT 1 FROM `external_dependency` AS existing WHERE existing.predecessor_work_item_id = NEW.predecessor_work_item_id AND existing.predecessor_scope = NEW.predecessor_scope AND existing.successor_work_item_id = NEW.successor_work_item_id AND existing.successor_scope = NEW.successor_scope AND existing.type = NEW.type AND ifnull(existing.predecessor_step_id,'') = ifnull(NEW.predecessor_step_id,'') AND ifnull(existing.successor_step_id,'') = ifnull(NEW.successor_step_id,''))
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency endpoints'); END;
--> statement-breakpoint
CREATE TRIGGER `typed_dependency_cross_identity_update` BEFORE UPDATE OF id ON `typed_dependency`
WHEN EXISTS (SELECT 1 FROM `external_dependency` AS existing WHERE existing.id = NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency identity'); END;
--> statement-breakpoint
CREATE TRIGGER `typed_dependency_cross_endpoints_update` BEFORE UPDATE OF predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type,predecessor_step_id,successor_step_id ON `typed_dependency`
WHEN EXISTS (SELECT 1 FROM `external_dependency` AS existing WHERE existing.predecessor_work_item_id = NEW.predecessor_work_item_id AND existing.predecessor_scope = NEW.predecessor_scope AND existing.successor_work_item_id = NEW.successor_work_item_id AND existing.successor_scope = NEW.successor_scope AND existing.type = NEW.type AND ifnull(existing.predecessor_step_id,'') = ifnull(NEW.predecessor_step_id,'') AND ifnull(existing.successor_step_id,'') = ifnull(NEW.successor_step_id,''))
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency endpoints'); END;
--> statement-breakpoint
CREATE TRIGGER `external_dependency_cross_identity_insert` BEFORE INSERT ON `external_dependency`
WHEN EXISTS (SELECT 1 FROM `typed_dependency` AS existing WHERE existing.id = NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency identity'); END;
--> statement-breakpoint
CREATE TRIGGER `external_dependency_cross_endpoints_insert` BEFORE INSERT ON `external_dependency`
WHEN EXISTS (SELECT 1 FROM `typed_dependency` AS existing WHERE existing.predecessor_work_item_id = NEW.predecessor_work_item_id AND existing.predecessor_scope = NEW.predecessor_scope AND existing.successor_work_item_id = NEW.successor_work_item_id AND existing.successor_scope = NEW.successor_scope AND existing.type = NEW.type AND ifnull(existing.predecessor_step_id,'') = ifnull(NEW.predecessor_step_id,'') AND ifnull(existing.successor_step_id,'') = ifnull(NEW.successor_step_id,''))
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency endpoints'); END;
--> statement-breakpoint
CREATE TRIGGER `external_dependency_cross_identity_update` BEFORE UPDATE OF id ON `external_dependency`
WHEN EXISTS (SELECT 1 FROM `typed_dependency` AS existing WHERE existing.id = NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency identity'); END;
--> statement-breakpoint
CREATE TRIGGER `external_dependency_cross_endpoints_update` BEFORE UPDATE OF predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type,predecessor_step_id,successor_step_id ON `external_dependency`
WHEN EXISTS (SELECT 1 FROM `typed_dependency` AS existing WHERE existing.predecessor_work_item_id = NEW.predecessor_work_item_id AND existing.predecessor_scope = NEW.predecessor_scope AND existing.successor_work_item_id = NEW.successor_work_item_id AND existing.successor_scope = NEW.successor_scope AND existing.type = NEW.type AND ifnull(existing.predecessor_step_id,'') = ifnull(NEW.predecessor_step_id,'') AND ifnull(existing.successor_step_id,'') = ifnull(NEW.successor_step_id,''))
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency endpoints'); END;
--> statement-breakpoint
CREATE TRIGGER external_dependency_admit_insert
BEFORE INSERT ON external_dependency
WHEN (SELECT count(*) FROM cross_work_package_dependency_activation) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_work_package_dependency_activation WHERE id = 1 AND state = 'ENABLED')
 OR (SELECT count(*) FROM cross_work_package_dependency_activation_receipt) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_work_package_dependency_activation_receipt WHERE id = 1 AND json_valid(receipt) AND json_extract(receipt,'$.protocol') = 'wbs-dependency-activation' AND json_type(receipt,'$.version') IN ('integer','real') AND json_extract(receipt,'$.version') = 1)
BEGIN
 SELECT RAISE(ABORT, 'external_dependencies_inactive');
END;
--> statement-breakpoint
CREATE TRIGGER external_dependency_admit_update
BEFORE UPDATE ON external_dependency
WHEN (SELECT count(*) FROM cross_work_package_dependency_activation) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_work_package_dependency_activation WHERE id = 1 AND state = 'ENABLED')
 OR (SELECT count(*) FROM cross_work_package_dependency_activation_receipt) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_work_package_dependency_activation_receipt WHERE id = 1 AND json_valid(receipt) AND json_extract(receipt,'$.protocol') = 'wbs-dependency-activation' AND json_type(receipt,'$.version') IN ('integer','real') AND json_extract(receipt,'$.version') = 1)
BEGIN
 SELECT RAISE(ABORT, 'external_dependencies_inactive');
END;
--> statement-breakpoint
CREATE TRIGGER external_dependency_admit_delete
BEFORE DELETE ON external_dependency
WHEN (SELECT count(*) FROM cross_work_package_dependency_activation) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_work_package_dependency_activation WHERE id = 1 AND state = 'ENABLED')
 OR (SELECT count(*) FROM cross_work_package_dependency_activation_receipt) <> 1
 OR NOT EXISTS (SELECT 1 FROM cross_work_package_dependency_activation_receipt WHERE id = 1 AND json_valid(receipt) AND json_extract(receipt,'$.protocol') = 'wbs-dependency-activation' AND json_type(receipt,'$.version') IN ('integer','real') AND json_extract(receipt,'$.version') = 1)
BEGIN
 SELECT RAISE(ABORT, 'external_dependencies_inactive');
END;
--> statement-breakpoint
CREATE TRIGGER claim_step_work_package_insert BEFORE INSERT ON claim WHEN NEW.step_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'claim step work_package mismatch') WHERE NOT EXISTS(SELECT 1 FROM work_item w JOIN work_package_step p ON p.work_package_id=w.work_package_id AND p.step_id=NEW.step_id JOIN step_definition d ON d.id=p.step_id WHERE w.id=NEW.work_item_id);
 END;
--> statement-breakpoint
CREATE TRIGGER claim_step_work_package_update BEFORE UPDATE ON claim WHEN NEW.step_id IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'claim step work_package mismatch') WHERE NOT EXISTS(SELECT 1 FROM work_item w JOIN work_package_step p ON p.work_package_id=w.work_package_id AND p.step_id=NEW.step_id JOIN step_definition d ON d.id=p.step_id WHERE w.id=NEW.work_item_id);
 END;
--> statement-breakpoint
CREATE TRIGGER step_blockage_owner_insert BEFORE INSERT ON step_blockage BEGIN
 SELECT RAISE(ABORT,'step blockage work package mismatch') WHERE NOT EXISTS(SELECT 1 FROM work_item w JOIN work_package_step p ON p.work_package_id=w.work_package_id AND p.step_id=NEW.step_id JOIN step_definition d ON d.id=p.step_id WHERE w.id=NEW.work_item_id);
 SELECT RAISE(ABORT,'step blockage owner is not a leaf') WHERE EXISTS(SELECT 1 FROM work_item WHERE parent_id=NEW.work_item_id);
 END;
--> statement-breakpoint
CREATE TRIGGER step_blockage_owner_update BEFORE UPDATE ON step_blockage BEGIN
 SELECT RAISE(ABORT,'step blockage work package mismatch') WHERE NOT EXISTS(SELECT 1 FROM work_item w JOIN work_package_step p ON p.work_package_id=w.work_package_id AND p.step_id=NEW.step_id JOIN step_definition d ON d.id=p.step_id WHERE w.id=NEW.work_item_id);
 SELECT RAISE(ABORT,'step blockage owner is not a leaf') WHERE EXISTS(SELECT 1 FROM work_item WHERE parent_id=NEW.work_item_id);
 END;
--> statement-breakpoint
CREATE TRIGGER step_parallel_owner_insert BEFORE INSERT ON step_parallel BEGIN
 SELECT RAISE(ABORT,'step parallelism work package mismatch') WHERE NOT EXISTS(SELECT 1 FROM work_item w JOIN work_package_step p ON p.work_package_id=w.work_package_id AND p.step_id=NEW.step_id JOIN step_definition d ON d.id=p.step_id WHERE w.id=NEW.work_item_id);
 SELECT RAISE(ABORT,'step parallelism owner is not a leaf') WHERE EXISTS(SELECT 1 FROM work_item WHERE parent_id=NEW.work_item_id);
 END;
--> statement-breakpoint
CREATE TRIGGER step_parallel_owner_update BEFORE UPDATE ON step_parallel BEGIN
 SELECT RAISE(ABORT,'step parallelism work package mismatch') WHERE NOT EXISTS(SELECT 1 FROM work_item w JOIN work_package_step p ON p.work_package_id=w.work_package_id AND p.step_id=NEW.step_id JOIN step_definition d ON d.id=p.step_id WHERE w.id=NEW.work_item_id);
 SELECT RAISE(ABORT,'step parallelism owner is not a leaf') WHERE EXISTS(SELECT 1 FROM work_item WHERE parent_id=NEW.work_item_id);
 END;
--> statement-breakpoint
CREATE TEMP TABLE _catalogue_integrity(violations INTEGER NOT NULL CHECK(violations=0));
--> statement-breakpoint
INSERT INTO _catalogue_integrity SELECT
  (SELECT COUNT(*) FROM estimate f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM actual f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_progress f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_measure f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM measure_estimate f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_node_attempt f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_node_attempt_issued f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM assignment f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM claim f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_blockage f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_parallel f LEFT JOIN step_definition p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM typed_dependency f LEFT JOIN step_definition p ON p.id=f.predecessor_step_id WHERE f.predecessor_step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM typed_dependency f LEFT JOIN step_definition p ON p.id=f.successor_step_id WHERE f.successor_step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM external_dependency f LEFT JOIN work_package_step p ON p.step_id=f.predecessor_step_id AND p.work_package_id=f.predecessor_work_package_id WHERE f.predecessor_step_id IS NOT NULL AND p.step_id IS NULL)
  + (SELECT COUNT(*) FROM external_dependency f LEFT JOIN work_package_step p ON p.step_id=f.successor_step_id AND p.work_package_id=f.successor_work_package_id WHERE f.successor_step_id IS NOT NULL AND p.step_id IS NULL)
  + (SELECT COUNT(*) FROM pragma_foreign_key_check);
--> statement-breakpoint
DROP TABLE _catalogue_integrity;
--> statement-breakpoint
DROP TABLE _catalogue_source;
--> statement-breakpoint
DROP TABLE _catalogue_merge;
--> statement-breakpoint
DROP TRIGGER _catalogue_refusal_raise;
--> statement-breakpoint
DROP TABLE _catalogue_refusal;
