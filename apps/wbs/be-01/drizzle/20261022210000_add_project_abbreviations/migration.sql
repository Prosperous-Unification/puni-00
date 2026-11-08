CREATE TABLE project_abbreviation (
-- Proof: removing PK/FK independently admitted duplicate/orphan in `namespace scope insert`;
 -- removing cascade prevented project deletion in `counter refuses malformed ordinals` (2026-10-22).
 project_id TEXT PRIMARY KEY NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 namespace TEXT NOT NULL,
 -- Proof: replacing grammar with CHECK(1) admitted invalid manual codes;
 -- removing the NUL predicate admitted A\0B in `manual uniqueness` (2026-10-22).
 abbreviation TEXT NOT NULL CONSTRAINT project_abbreviation_grammar CHECK (
 length(abbreviation) BETWEEN 1 AND 20
 AND abbreviation GLOB '[A-Z]*'
 AND abbreviation NOT GLOB '*[^A-Z0-9_-]*'
 AND instr(abbreviation,char(0)) = 0
 )
);
--> statement-breakpoint
-- Proof: UNIQUE -> nonunique admitted duplicate in `manual uniqueness` and failed `concurrent old and new writers` (2026-10-22).
CREATE UNIQUE INDEX project_abbreviation_namespace_code ON project_abbreviation(namespace, abbreviation);
--> statement-breakpoint
CREATE INDEX project_abbreviation_code ON project_abbreviation(abbreviation);
--> statement-breakpoint
CREATE TABLE project_abbreviation_counter (
-- Proof: CHECK(1) for each constraint admitted invalid singleton/ordinal in
 -- `counter refuses malformed ordinals` (2026-10-22).
 singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton = 1),
 next INTEGER NOT NULL CHECK(typeof(next) = 'integer' AND next BETWEEN 0 AND 11881376)
);
--> statement-breakpoint
INSERT INTO project_abbreviation_counter(singleton,next) SELECT 1, COUNT(*) FROM project;
--> statement-breakpoint
-- Proof: WHERE 0 on backfill left zero rows in `backfills every project` (2026-10-22).
INSERT INTO project_abbreviation(project_id,namespace,abbreviation)
SELECT id, CASE WHEN organization_id IS NULL THEN 'legacy' ELSE 'org:' || organization_id END,
 char(65 + ((ordinal) / 456976) % 26, 65 + ((ordinal) / 17576) % 26, 65 + ((ordinal) / 676) % 26, 65 + ((ordinal) / 26) % 26, 65 + ((ordinal) / 1) % 26)
FROM (SELECT project.id, project_organization.organization_id,
 row_number() OVER (ORDER BY project.id) - 1 AS ordinal
 FROM project LEFT JOIN project_organization ON project_organization.resource_id = project.id);
--> statement-breakpoint
-- Proof: removing the final occupied-code predicate returned AAAAB instead of AAAAC
-- in `allocator skips occupied codes` across namespaces (2026-10-22).
CREATE VIEW project_abbreviation_candidate AS
WITH RECURSIVE candidate(ordinal, abbreviation) AS (
 SELECT next, char(65 + ((next) / 456976) % 26, 65 + ((next) / 17576) % 26, 65 + ((next) / 676) % 26, 65 + ((next) / 26) % 26, 65 + ((next) / 1) % 26) FROM project_abbreviation_counter WHERE singleton=1 AND next < 11881376
 UNION ALL
 SELECT ordinal+1, char(65 + ((ordinal+1) / 456976) % 26, 65 + ((ordinal+1) / 17576) % 26, 65 + ((ordinal+1) / 676) % 26, 65 + ((ordinal+1) / 26) % 26, 65 + ((ordinal+1) / 1) % 26) FROM candidate
 WHERE ordinal+1 < 11881376
 AND EXISTS (SELECT 1 FROM project_abbreviation WHERE abbreviation=candidate.abbreviation)
)
SELECT ordinal FROM candidate
WHERE NOT EXISTS (SELECT 1 FROM project_abbreviation WHERE abbreviation=candidate.abbreviation)
LIMIT 1;
--> statement-breakpoint
-- Proof: WHEN 0 left zero rows in `old writer insert` and `concurrent old and new writers` (2026-10-22).
CREATE TRIGGER project_abbreviation_allocate AFTER INSERT ON project
BEGIN
 -- Proof: replacing with SELECT 1 misclassified an absent counter as exhaustion
 -- in `occupied final code and absent counter refuse atomically` (2026-10-22).
 SELECT RAISE(ABORT,'project abbreviation counter missing')
 WHERE (SELECT COUNT(*) FROM project_abbreviation_counter WHERE singleton=1) != 1;
 -- Proof: replacing with SELECT 1 exposed a NOT NULL fault instead of exhaustion
 -- in `allocator skips occupied codes` and `occupied final code` (2026-10-22).
 SELECT RAISE(ABORT,'project abbreviation exhausted')
 WHERE NOT EXISTS (SELECT 1 FROM project_abbreviation_candidate);
 UPDATE project_abbreviation_counter SET next=(SELECT ordinal+1 FROM project_abbreviation_candidate) WHERE singleton=1;
 INSERT INTO project_abbreviation(project_id,namespace,abbreviation)
 SELECT NEW.id,
 CASE WHEN EXISTS (SELECT 1 FROM project_organization WHERE resource_id=NEW.id)
 THEN 'org:' || (SELECT organization_id FROM project_organization WHERE resource_id=NEW.id)
 ELSE 'legacy' END,
 char(65 + ((next-1) / 456976) % 26, 65 + ((next-1) / 17576) % 26, 65 + ((next-1) / 676) % 26, 65 + ((next-1) / 26) % 26, 65 + ((next-1) / 1) % 26)
 FROM project_abbreviation_counter WHERE singleton=1;
END;
--> statement-breakpoint
-- The bridge may run before allocation: zero rows is transient; allocation reads ownership.
-- Proof: WHEN 0 retained legacy namespace in `organization mapping moves namespace atomically` and `concurrent old and new writers` (2026-10-22).
CREATE TRIGGER project_abbreviation_namespace AFTER INSERT ON project_organization
BEGIN
 UPDATE project_abbreviation SET namespace='org:' || NEW.organization_id WHERE project_id=NEW.resource_id;
END;
--> statement-breakpoint
-- Proof: WHEN 0 admitted forged namespace in `namespace scope insert` (2026-10-22).
CREATE TRIGGER project_abbreviation_scope_insert BEFORE INSERT ON project_abbreviation
WHEN NEW.namespace IS NOT CASE
 WHEN EXISTS (SELECT 1 FROM project_organization WHERE resource_id=NEW.project_id)
 THEN 'org:' || (SELECT organization_id FROM project_organization WHERE resource_id=NEW.project_id)
 ELSE 'legacy' END
BEGIN
 SELECT RAISE(ABORT,'project abbreviation namespace differs from ownership');
END;
--> statement-breakpoint
-- Proof: WHEN 0 admitted forged namespace in `manual uniqueness` (2026-10-22).
CREATE TRIGGER project_abbreviation_scope_update BEFORE UPDATE ON project_abbreviation
WHEN NEW.namespace IS NOT CASE
 WHEN EXISTS (SELECT 1 FROM project_organization WHERE resource_id=NEW.project_id)
 THEN 'org:' || (SELECT organization_id FROM project_organization WHERE resource_id=NEW.project_id)
 ELSE 'legacy' END
BEGIN
 SELECT RAISE(ABORT,'project abbreviation namespace differs from ownership');
END;
