-- Lint-shape fixture only; not an executable or ready semantic migration.
-- Baseline: b0d2df4eb608827a4933f0840b05300e06158d8a, 110 applied identities, 2026-11-10.
-- foreign-keys-off-rebuild
CREATE TEMP TABLE _space_candidates AS SELECT w.project_id,sw.space_id,p.organization_id,MIN(sw.position) candidate_position,s.created_at space_created_at,p.created_at project_created_at FROM space_work_package sw JOIN work_package w ON w.id=sw.work_package_id JOIN project p ON p.id=w.project_id JOIN space s ON s.id=sw.space_id GROUP BY w.project_id,sw.space_id;
--> statement-breakpoint
CREATE TEMP TABLE _kept_spaces AS SELECT * FROM (SELECT c.*,row_number() OVER(PARTITION BY project_id ORDER BY candidate_position,space_created_at,space_id) candidate_rank FROM _space_candidates c) WHERE candidate_rank=1;
--> statement-breakpoint
CREATE TEMP TABLE _ranked_projects AS SELECT k.*,row_number() OVER(PARTITION BY space_id ORDER BY candidate_position,project_created_at,project_id)*10 space_position FROM _kept_spaces k;
--> statement-breakpoint
CREATE TABLE space_project_dropped (project_id TEXT NOT NULL,space_id TEXT NOT NULL,kept_space_id TEXT NOT NULL,organization_id TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(project_id,space_id));
--> statement-breakpoint
INSERT INTO space_project_dropped SELECT c.project_id,c.space_id,k.space_id,c.organization_id,c.candidate_position FROM _space_candidates c JOIN _kept_spaces k ON k.project_id=c.project_id WHERE c.space_id<>k.space_id;
--> statement-breakpoint
CREATE TEMP TABLE _space_completeness (violations INTEGER NOT NULL CHECK (violations = 0));
--> statement-breakpoint
INSERT INTO _space_completeness SELECT abs((SELECT COUNT(*) FROM _space_candidates)-((SELECT COUNT(*) FROM space_project_dropped)+(SELECT COUNT(*) FROM _kept_spaces)));
--> statement-breakpoint
CREATE TABLE project_NEW (id TEXT PRIMARY KEY NOT NULL,organization_id TEXT NOT NULL REFERENCES organization(id),name TEXT NOT NULL CHECK (length(name)>0),revision INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER,created_by TEXT REFERENCES users(id),space_id TEXT,space_position INTEGER,CHECK((space_id IS NULL)=(space_position IS NULL)),FOREIGN KEY(space_id,organization_id) REFERENCES space(id,organization_id),UNIQUE(organization_id,name),UNIQUE(id,organization_id));
--> statement-breakpoint
INSERT INTO project_NEW(id,organization_id,name,revision,created_at,updated_at,created_by,space_id,space_position) SELECT p.id,p.organization_id,p.name,p.revision,p.created_at,p.updated_at,p.created_by,r.space_id,r.space_position FROM project p LEFT JOIN _ranked_projects r ON r.project_id=p.id;
--> statement-breakpoint
DROP TABLE project;
--> statement-breakpoint
ALTER TABLE project_NEW RENAME TO project;
--> statement-breakpoint
DROP TABLE space_work_package;
--> statement-breakpoint
CREATE TRIGGER project_space_organization_insert BEFORE INSERT ON project WHEN NEW.space_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM space s WHERE s.id=NEW.space_id AND s.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'project space organization mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER project_space_organization_update BEFORE UPDATE ON project WHEN NEW.space_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM space s WHERE s.id=NEW.space_id AND s.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'project space organization mismatch'); END;
--> statement-breakpoint
CREATE UNIQUE INDEX person_organization_resource_organization ON person_organization(resource_id,organization_id);
--> statement-breakpoint
CREATE UNIQUE INDEX service_team_organization_resource_organization ON service_team_organization(resource_id,organization_id);
--> statement-breakpoint
CREATE TABLE space_person (space_id TEXT NOT NULL,person_id TEXT NOT NULL,organization_id TEXT NOT NULL,created_at INTEGER NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(space_id,person_id),FOREIGN KEY(space_id,organization_id) REFERENCES space(id,organization_id),FOREIGN KEY(person_id,organization_id) REFERENCES person_organization(resource_id,organization_id));
--> statement-breakpoint
CREATE TABLE space_team (space_id TEXT NOT NULL,service_team_id TEXT NOT NULL,organization_id TEXT NOT NULL,created_at INTEGER NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(space_id,service_team_id),FOREIGN KEY(space_id,organization_id) REFERENCES space(id,organization_id),FOREIGN KEY(service_team_id,organization_id) REFERENCES service_team_organization(resource_id,organization_id));
--> statement-breakpoint
CREATE TEMP TABLE _space_foreign_keys (violations INTEGER NOT NULL CHECK (violations = 0));
--> statement-breakpoint
INSERT INTO _space_foreign_keys SELECT COUNT(*) FROM pragma_foreign_key_check;
