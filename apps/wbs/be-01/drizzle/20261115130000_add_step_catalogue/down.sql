-- foreign-keys-off-rebuild
CREATE TEMP TABLE _catalogue_down_refusal(message TEXT NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER _catalogue_down_refusal_raise BEFORE INSERT ON _catalogue_down_refusal BEGIN SELECT RAISE(ABORT,NEW.message); END;
--> statement-breakpoint
-- Proof: before this pre-transform admission existed, the fixture proved two orphan metadata
-- references with foreign_keys restored ON, then public rollback resolved instead of refusing.
-- 'refuses public catalogue rollback before erasing orphan binding and package metadata with restored foreign keys'
-- in step-catalogue-report.db.test.ts failed at outcome.rejected: false versus true (37 total
-- expects, Root down-orphan-red-v1). Later diagnostic/full-state assertions were unreached.
-- This is the watched missing-check RED, not a claimed literal check-removal or global down proof.
INSERT INTO _catalogue_down_refusal
SELECT 'step catalogue rollback requires valid foreign keys before schema change: '||quote("table")
FROM pragma_foreign_key_check
ORDER BY "table" COLLATE BINARY,rowid
LIMIT 1;
--> statement-breakpoint
-- Proof: replacing this whole provenance predicate with WHERE 0 made both
-- 'refuses public catalogue rollback with a cleared raw-code capture marker after CHECK enforcement is restored'
-- and 'refuses public catalogue rollback with non-NULL raw legacy code differing from its immutable catalogue code'
-- in step-catalogue-report.db.test.ts fail at outcome.rejected: false versus true.
-- Group baseline/omission/unchanged-after were 2/0, 0/2, 2/0 pass/fail with
-- 84/74/84 total expects (provenance-omission-v1). Fault diagnostic/full-state tails
-- were unreached. This is one complete admission effect, not independent conjunct,
-- schema-CHECK, arbitrary-tampering or global rollback proof.
INSERT INTO _catalogue_down_refusal
SELECT 'step catalogue rollback requires captured raw legacy code for '||quote(id)
FROM step_definition
WHERE origin='migration' AND (legacy_code_captured<>1 OR (legacy_code IS NOT NULL AND (typeof(legacy_code)<>'text' OR legacy_code<>code)))
ORDER BY id COLLATE BINARY LIMIT 1;
--> statement-breakpoint
INSERT INTO _catalogue_down_refusal SELECT message FROM (
SELECT 1 AS priority,old_step_id AS identity,'step catalogue rollback requires snapshot after merge '||quote(old_step_id) AS message FROM step_identity_history
UNION ALL
SELECT 2,id,'step catalogue rollback requires migration-origin definition and legacy package '||quote(id) FROM step_definition WHERE origin<>'migration' OR legacy_work_package_id IS NULL
UNION ALL
SELECT 3,d.id,'step catalogue rollback requires coherent legacy package '||quote(d.id) FROM step_definition d LEFT JOIN work_package w ON w.id=d.legacy_work_package_id LEFT JOIN work_package_organization wo ON wo.resource_id=w.id WHERE w.id IS NULL OR wo.organization_id IS NULL OR wo.organization_id<>d.organization_id
UNION ALL
SELECT 4,d.id,'step catalogue rollback requires one original every-type project binding '||quote(d.id) FROM step_definition d JOIN work_package w ON w.id=d.legacy_work_package_id WHERE (SELECT COUNT(*) FROM step_binding b WHERE b.step_id=d.id)<>1 OR NOT EXISTS(SELECT 1 FROM step_binding b WHERE b.step_id=d.id AND b.organization_id=d.organization_id AND b.scope_kind='project' AND b.scope_id=w.project_id AND b.work_item_type_id IS NULL AND b.origin='migration' AND b.position=d.position) OR d.defined_at_scope_kind<>'project' OR d.defined_at_scope_id<>w.project_id
UNION ALL
SELECT 5,d.id,'step catalogue rollback cannot represent package metadata for '||quote(d.id) FROM step_definition d WHERE (SELECT COUNT(*) FROM work_package_step p WHERE p.step_id=d.id)<>1 OR NOT EXISTS(SELECT 1 FROM work_package_step p WHERE p.step_id=d.id AND p.work_package_id=d.legacy_work_package_id AND p.estimate_unit=d.estimate_unit AND p.allowance_bps=d.default_allowance_bps)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign estimate.step_id '||quote(f.step_id) FROM estimate f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign actual.step_id '||quote(f.step_id) FROM actual f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign step_progress.step_id '||quote(f.step_id) FROM step_progress f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign step_measure.step_id '||quote(f.step_id) FROM step_measure f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign measure_estimate.step_id '||quote(f.step_id) FROM measure_estimate f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign step_node_attempt.step_id '||quote(f.step_id) FROM step_node_attempt f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign step_node_attempt_issued.step_id '||quote(f.step_id) FROM step_node_attempt_issued f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign assignment.step_id '||quote(f.step_id) FROM assignment f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign claim.step_id '||quote(f.step_id) FROM claim f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign step_blockage.step_id '||quote(f.step_id) FROM step_blockage f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.step_id,'step catalogue rollback requires snapshot for foreign step_parallel.step_id '||quote(f.step_id) FROM step_parallel f LEFT JOIN work_item w ON w.id=f.work_item_id LEFT JOIN step_definition d ON d.id=f.step_id WHERE f.step_id IS NOT NULL AND (d.id IS NULL OR w.work_package_id IS NULL OR w.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.predecessor_step_id,'step catalogue rollback requires snapshot for foreign typed_dependency.predecessor_step_id '||quote(f.predecessor_step_id) FROM typed_dependency f  LEFT JOIN step_definition d ON d.id=f.predecessor_step_id WHERE f.predecessor_step_id IS NOT NULL AND (d.id IS NULL OR f.work_package_id IS NULL OR f.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.successor_step_id,'step catalogue rollback requires snapshot for foreign typed_dependency.successor_step_id '||quote(f.successor_step_id) FROM typed_dependency f  LEFT JOIN step_definition d ON d.id=f.successor_step_id WHERE f.successor_step_id IS NOT NULL AND (d.id IS NULL OR f.work_package_id IS NULL OR f.work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.predecessor_step_id,'step catalogue rollback requires snapshot for foreign external_dependency.predecessor_step_id '||quote(f.predecessor_step_id) FROM external_dependency f  LEFT JOIN step_definition d ON d.id=f.predecessor_step_id WHERE f.predecessor_step_id IS NOT NULL AND (d.id IS NULL OR f.predecessor_work_package_id IS NULL OR f.predecessor_work_package_id<>d.legacy_work_package_id)
UNION ALL
SELECT 6,f.successor_step_id,'step catalogue rollback requires snapshot for foreign external_dependency.successor_step_id '||quote(f.successor_step_id) FROM external_dependency f  LEFT JOIN step_definition d ON d.id=f.successor_step_id WHERE f.successor_step_id IS NOT NULL AND (d.id IS NULL OR f.successor_work_package_id IS NULL OR f.successor_work_package_id<>d.legacy_work_package_id)
) ORDER BY priority,identity COLLATE BINARY LIMIT 1;
--> statement-breakpoint
-- Proof: before raw legacy-code provenance was retained, public rollback removed migration117,
-- then 'restores original NULL step code and unmerged facts and history through public catalogue rollback'
-- in step-catalogue-report.db.test.ts failed at code deploy versus original NULL (77 total expects,
-- uncoded-down-first-red-v3). The later full-row/fact/history/ledger tails were unreached.
-- This watched representation-loss negative does not prove each provenance refusal or global rollback safety.
CREATE TEMP TABLE _catalogue_restore AS SELECT d.id,d.legacy_work_package_id AS work_package_id,d.name,d.position,d.legacy_code AS code,p.allowance_bps,p.allowance_revision,p.estimate_unit,d.created_at,d.updated_at,d.created_by FROM step_definition d JOIN work_package_step p ON p.step_id=d.id AND p.work_package_id=d.legacy_work_package_id;
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
DROP TRIGGER step_binding_scope_insert;
--> statement-breakpoint
DROP TRIGGER step_binding_scope_update;
--> statement-breakpoint
DROP TRIGGER work_package_step_scope_insert;
--> statement-breakpoint
DROP TRIGGER work_package_step_scope_update;
--> statement-breakpoint
DROP TABLE step_binding;
--> statement-breakpoint
DROP TABLE step_identity_history;
--> statement-breakpoint
ALTER TABLE step_definition RENAME TO step;
--> statement-breakpoint
CREATE TABLE step_NEW(
 id TEXT PRIMARY KEY,work_package_id TEXT NOT NULL REFERENCES work_package(id),name TEXT NOT NULL,
 position INTEGER DEFAULT 0 NOT NULL,code TEXT,
 allowance_bps INTEGER DEFAULT 0 NOT NULL CHECK(allowance_bps BETWEEN 0 AND 100000 AND allowance_bps=CAST(allowance_bps AS INTEGER)),
 allowance_revision INTEGER DEFAULT 0 NOT NULL,
 estimate_unit TEXT DEFAULT 'workdays' NOT NULL CHECK(estimate_unit IN ('workdays','minutes')),
 created_at INTEGER,updated_at INTEGER,created_by TEXT REFERENCES users(id)
);
--> statement-breakpoint
INSERT INTO step_NEW(id,work_package_id,name,position,code,allowance_bps,allowance_revision,estimate_unit,created_at,updated_at,created_by) SELECT id,work_package_id,name,position,code,allowance_bps,allowance_revision,estimate_unit,created_at,updated_at,created_by FROM _catalogue_restore;
--> statement-breakpoint
DROP TABLE step;
--> statement-breakpoint
ALTER TABLE step_NEW RENAME TO step;
--> statement-breakpoint
CREATE UNIQUE INDEX step_id_work_package ON step(id,work_package_id);
--> statement-breakpoint
CREATE UNIQUE INDEX step_work_package_name ON step(work_package_id,name);
--> statement-breakpoint
CREATE UNIQUE INDEX step_work_package_code ON step(work_package_id,code) WHERE code IS NOT NULL;
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

 FOREIGN KEY (`predecessor_step_id`,`predecessor_work_package_id`) REFERENCES `step`(`id`,`work_package_id`) ON DELETE RESTRICT,

 FOREIGN KEY (`successor_step_id`,`successor_work_package_id`) REFERENCES `step`(`id`,`work_package_id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO external_dependency_NEW(id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type,created_at,updated_at,created_by) SELECT id,organization_id,predecessor_work_package_id,successor_work_package_id,predecessor_work_item_id,predecessor_scope,predecessor_step_id,successor_work_item_id,successor_scope,successor_step_id,type,created_at,updated_at,created_by FROM external_dependency;
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
DROP TABLE work_package_step;
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
CREATE TEMP TABLE _catalogue_integrity(violations INTEGER NOT NULL CHECK(violations=0));
--> statement-breakpoint
INSERT INTO _catalogue_integrity SELECT
  (SELECT COUNT(*) FROM estimate f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM actual f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_progress f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_measure f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM measure_estimate f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_node_attempt f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_node_attempt_issued f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM assignment f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM claim f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_blockage f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM step_parallel f LEFT JOIN step p ON p.id=f.step_id WHERE f.step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM typed_dependency f LEFT JOIN step p ON p.id=f.predecessor_step_id WHERE f.predecessor_step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM typed_dependency f LEFT JOIN step p ON p.id=f.successor_step_id WHERE f.successor_step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM external_dependency f LEFT JOIN step p ON p.id=f.predecessor_step_id AND p.work_package_id=f.predecessor_work_package_id WHERE f.predecessor_step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM external_dependency f LEFT JOIN step p ON p.id=f.successor_step_id AND p.work_package_id=f.successor_work_package_id WHERE f.successor_step_id IS NOT NULL AND p.id IS NULL)
  + (SELECT COUNT(*) FROM pragma_foreign_key_check);
--> statement-breakpoint
DROP TABLE _catalogue_integrity;
--> statement-breakpoint
DROP TABLE _catalogue_restore;
--> statement-breakpoint
DROP TRIGGER _catalogue_down_refusal_raise;
--> statement-breakpoint
DROP TABLE _catalogue_down_refusal;
