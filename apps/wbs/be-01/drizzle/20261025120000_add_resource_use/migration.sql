-- Snapshots deliberately have no planning or identity foreign keys: deleting a source
-- row cannot erase unresolved responsibility or release history.
CREATE TABLE resource_use (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT,
  project_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  responsible_person_id TEXT NOT NULL,
  agent_run TEXT NOT NULL,
  step_id TEXT,
  attempt_number INTEGER,
  state TEXT NOT NULL CHECK(state IN ('active','cleanup_pending','blocked','retained','release_reported','release_verified')),
  revision INTEGER NOT NULL CHECK(revision > 0),
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
  request_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  registration_response TEXT NOT NULL CHECK(json_valid(registration_response)),
  UNIQUE(project_id, request_id)
);
--> statement-breakpoint
CREATE INDEX resource_use_project ON resource_use(project_id, id);
--> statement-breakpoint
CREATE INDEX resource_use_lifecycle ON resource_use(work_item_id, responsible_person_id, agent_run);
--> statement-breakpoint
CREATE TABLE resource_use_event (
  id TEXT NOT NULL,
  use_id TEXT NOT NULL REFERENCES resource_use(id),
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
  fingerprint TEXT NOT NULL,
  response TEXT NOT NULL CHECK(json_valid(response)),
  PRIMARY KEY(project_id,id),
  UNIQUE(use_id,revision)
);
--> statement-breakpoint
CREATE TRIGGER resource_use_event_immutable_update BEFORE UPDATE ON resource_use_event
BEGIN SELECT RAISE(ABORT, 'resource use history is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER resource_use_event_immutable_delete BEFORE DELETE ON resource_use_event
BEGIN SELECT RAISE(ABORT, 'resource use history is immutable'); END;
