CREATE TABLE step_retirement(
 step_id TEXT PRIMARY KEY NOT NULL CHECK(typeof(step_id)='text' AND length(step_id)>0),
 organization_id TEXT NOT NULL REFERENCES organization(id),
 retired_at INTEGER NOT NULL CHECK(typeof(retired_at)='integer'),
 retired_by TEXT NOT NULL REFERENCES users(id) CHECK(typeof(retired_by)='text' AND length(retired_by)>0),
 FOREIGN KEY(step_id,organization_id) REFERENCES step_definition(id,organization_id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TRIGGER step_retirement_requires_unbound BEFORE INSERT ON step_retirement
WHEN EXISTS(SELECT 1 FROM step_binding WHERE step_id=NEW.step_id)
BEGIN
 SELECT RAISE(ABORT,'step definition is still bound');
END;
--> statement-breakpoint
CREATE TRIGGER step_retirement_immutable_update BEFORE UPDATE ON step_retirement
BEGIN
 SELECT RAISE(ABORT,'step retirement is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER step_retirement_immutable_delete BEFORE DELETE ON step_retirement
BEGIN
 SELECT RAISE(ABORT,'step retirement is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER step_binding_active_insert BEFORE INSERT ON step_binding
WHEN EXISTS(SELECT 1 FROM step_retirement WHERE step_id=NEW.step_id)
BEGIN
 SELECT RAISE(ABORT,'step definition is retired');
END;
--> statement-breakpoint
CREATE TRIGGER step_binding_active_update BEFORE UPDATE ON step_binding
WHEN EXISTS(SELECT 1 FROM step_retirement WHERE step_id=NEW.step_id)
BEGIN
 SELECT RAISE(ABORT,'step definition is retired');
END;
