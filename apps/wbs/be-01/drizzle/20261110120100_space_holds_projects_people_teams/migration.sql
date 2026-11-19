-- foreign-keys-off-rebuild
CREATE TEMP TABLE _space_refusal(message TEXT NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER _space_refuse BEFORE INSERT ON _space_refusal BEGIN SELECT RAISE(ABORT,NEW.message); END;
--> statement-breakpoint
INSERT INTO _space_refusal
SELECT 'space membership position is malformed for work package ' || pair.work_package_id || ' in space ' || pair.space_id
FROM space_work_package pair
WHERE typeof(pair.position) NOT IN ('integer','real')
   OR pair.position < -1.7976931348623157e308 OR pair.position > 1.7976931348623157e308
LIMIT 1;
--> statement-breakpoint
INSERT INTO _space_refusal
SELECT 'space creation timestamp is malformed for space ' || s.id
FROM space s WHERE EXISTS(SELECT 1 FROM space_work_package pair WHERE pair.space_id=s.id)
AND (typeof(s.created_at) NOT IN ('integer','real') OR s.created_at < -1.7976931348623157e308 OR s.created_at > 1.7976931348623157e308)
LIMIT 1;
--> statement-breakpoint
INSERT INTO _space_refusal
SELECT 'project creation timestamp is malformed for project ' || p.id
FROM project p WHERE EXISTS(SELECT 1 FROM work_package w JOIN space_work_package pair ON pair.work_package_id=w.id WHERE w.project_id=p.id)
AND typeof(p.created_at)<>'integer'
LIMIT 1;
--> statement-breakpoint
CREATE TEMP TABLE _space_candidates AS SELECT p.id AS project_id,p.organization_id,s.id AS space_id,MIN(pair.position) AS position,s.created_at AS space_created_at,p.created_at AS project_created_at FROM space_work_package pair JOIN work_package w ON w.id=pair.work_package_id JOIN project p ON p.id=w.project_id JOIN space s ON s.id=pair.space_id GROUP BY p.id,s.id;
--> statement-breakpoint
INSERT INTO _space_refusal SELECT 'space membership has an incoherent project organization' WHERE EXISTS(SELECT 1 FROM space_work_package pair LEFT JOIN work_package w ON w.id=pair.work_package_id LEFT JOIN project p ON p.id=w.project_id LEFT JOIN space s ON s.id=pair.space_id WHERE w.id IS NULL OR p.id IS NULL OR s.id IS NULL OR pair.organization_id<>p.organization_id OR s.organization_id<>p.organization_id);
--> statement-breakpoint
CREATE TEMP TABLE _space_kept AS SELECT project_id,organization_id,space_id,position,project_created_at FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY project_id ORDER BY position,space_created_at,space_id) AS chosen FROM _space_candidates) WHERE chosen=1;
--> statement-breakpoint
CREATE TABLE space_project_dropped(project_id TEXT NOT NULL,space_id TEXT NOT NULL,kept_space_id TEXT NOT NULL,organization_id TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(project_id,space_id));
--> statement-breakpoint
INSERT INTO space_project_dropped SELECT c.project_id,c.space_id,k.space_id,c.organization_id,c.position FROM _space_candidates c JOIN _space_kept k ON k.project_id=c.project_id WHERE c.space_id<>k.space_id;
--> statement-breakpoint
INSERT INTO _space_refusal SELECT 'space project transition dropped-membership report is incomplete' WHERE (SELECT COUNT(*) FROM _space_candidates)<>(SELECT COUNT(*) FROM _space_kept)+(SELECT COUNT(*) FROM space_project_dropped);
--> statement-breakpoint
CREATE TABLE project_NEW(id TEXT PRIMARY KEY NOT NULL,organization_id TEXT NOT NULL REFERENCES organization(id),name TEXT NOT NULL CHECK(length(name)>0),revision INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER,created_by TEXT REFERENCES users(id),space_id TEXT REFERENCES space(id),space_position INTEGER,CHECK((space_id IS NULL AND space_position IS NULL) OR (space_id IS NOT NULL AND typeof(space_position)='integer')),UNIQUE(organization_id,name),UNIQUE(id,organization_id));
--> statement-breakpoint
INSERT INTO project_NEW(id,organization_id,name,revision,created_at,updated_at,created_by,space_id,space_position) SELECT p.id,p.organization_id,p.name,p.revision,p.created_at,p.updated_at,p.created_by,k.space_id,k.rank*10 FROM project p LEFT JOIN (SELECT project_id,space_id,ROW_NUMBER() OVER(PARTITION BY space_id ORDER BY position,project_created_at,project_id) AS rank FROM _space_kept) k ON k.project_id=p.id;
--> statement-breakpoint
DROP TRIGGER work_package_project_organization_insert;
--> statement-breakpoint
DROP TRIGGER work_package_project_organization_update;
--> statement-breakpoint
DROP TRIGGER work_package_project_ownership_insert;
--> statement-breakpoint
DROP TABLE project;
--> statement-breakpoint
ALTER TABLE project_NEW RENAME TO project;
--> statement-breakpoint
CREATE TRIGGER work_package_project_organization_insert BEFORE INSERT ON work_package WHEN EXISTS(SELECT 1 FROM project p JOIN work_package_organization wo ON wo.resource_id=NEW.id WHERE p.id=NEW.project_id AND p.organization_id<>wo.organization_id) BEGIN SELECT RAISE(ABORT,'work package project organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER work_package_project_organization_update BEFORE UPDATE ON work_package WHEN EXISTS(SELECT 1 FROM project p JOIN work_package_organization wo ON wo.resource_id=NEW.id WHERE p.id=NEW.project_id AND p.organization_id<>wo.organization_id) BEGIN SELECT RAISE(ABORT,'work package project organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER work_package_project_ownership_insert BEFORE INSERT ON work_package_organization
WHEN EXISTS (SELECT 1 FROM work_package w JOIN project p ON p.id=w.project_id WHERE w.id=NEW.resource_id AND p.organization_id<>NEW.organization_id)
BEGIN SELECT RAISE(ABORT,'work package project organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER project_work_package_organization_update BEFORE UPDATE OF organization_id ON project
WHEN EXISTS (SELECT 1 FROM work_package w JOIN work_package_organization wo ON wo.resource_id=w.id WHERE w.project_id=OLD.id AND wo.organization_id<>NEW.organization_id)
BEGIN SELECT RAISE(ABORT,'work package project organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER project_space_organization_insert BEFORE INSERT ON project WHEN NEW.space_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM space WHERE id=NEW.space_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'project space organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER project_space_organization_update BEFORE UPDATE ON project WHEN NEW.space_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM space WHERE id=NEW.space_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'project space organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER space_project_organization_update BEFORE UPDATE OF organization_id ON space WHEN EXISTS(SELECT 1 FROM project WHERE space_id=OLD.id AND organization_id<>NEW.organization_id) BEGIN SELECT RAISE(ABORT,'space project organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER space_project_detach BEFORE DELETE ON space BEGIN UPDATE project SET space_id=NULL,space_position=NULL WHERE space_id=OLD.id; END;
--> statement-breakpoint
CREATE TRIGGER project_settings_delete AFTER DELETE ON project BEGIN DELETE FROM setting_value WHERE scope_kind='project' AND scope_id=OLD.id; DELETE FROM calendar_marker WHERE scope_kind='project' AND scope_id=OLD.id; END;
--> statement-breakpoint
DROP TABLE space_work_package;
--> statement-breakpoint
CREATE TABLE space_person(space_id TEXT NOT NULL,person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,organization_id TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER,created_by TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(space_id,person_id),FOREIGN KEY(space_id,organization_id) REFERENCES space(id,organization_id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TRIGGER space_person_organization_insert BEFORE INSERT ON space_person WHEN NOT EXISTS(SELECT 1 FROM person_organization WHERE resource_id=NEW.person_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'space member organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER space_person_organization_update BEFORE UPDATE ON space_person WHEN NOT EXISTS(SELECT 1 FROM person_organization WHERE resource_id=NEW.person_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'space member organization mismatch'); END;
--> statement-breakpoint
CREATE TABLE space_team(space_id TEXT NOT NULL,service_team_id TEXT NOT NULL REFERENCES service_team(id) ON DELETE CASCADE,organization_id TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER,created_by TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(space_id,service_team_id),FOREIGN KEY(space_id,organization_id) REFERENCES space(id,organization_id) ON DELETE CASCADE);
--> statement-breakpoint
CREATE TRIGGER space_team_organization_insert BEFORE INSERT ON space_team WHEN NOT EXISTS(SELECT 1 FROM service_team_organization WHERE resource_id=NEW.service_team_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'space member organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER space_team_organization_update BEFORE UPDATE ON space_team WHEN NOT EXISTS(SELECT 1 FROM service_team_organization WHERE resource_id=NEW.service_team_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'space member organization mismatch'); END;
--> statement-breakpoint
INSERT INTO _space_refusal SELECT 'space project transition foreign keys invalid' WHERE EXISTS(SELECT 1 FROM pragma_foreign_key_check);
--> statement-breakpoint
DROP TABLE _space_kept;
--> statement-breakpoint
DROP TABLE _space_candidates;
--> statement-breakpoint
DROP TRIGGER _space_refuse;
--> statement-breakpoint
DROP TABLE _space_refusal;
