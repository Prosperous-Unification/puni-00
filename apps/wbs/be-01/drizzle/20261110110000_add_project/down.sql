CREATE TEMP TABLE _project_down_refusal(message TEXT NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER _project_down_refuse BEFORE INSERT ON _project_down_refusal BEGIN SELECT RAISE(ABORT,NEW.message); END;
--> statement-breakpoint
INSERT INTO _project_down_refusal VALUES('project rollback requires restoring the verified window snapshot');
