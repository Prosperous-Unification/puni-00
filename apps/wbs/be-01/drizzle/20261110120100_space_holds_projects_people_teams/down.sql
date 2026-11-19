CREATE TEMP TABLE _settings_down_refusal(message TEXT NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER _settings_down_refuse BEFORE INSERT ON _settings_down_refusal BEGIN SELECT RAISE(ABORT,NEW.message); END;
--> statement-breakpoint
INSERT INTO _settings_down_refusal VALUES('space project rollback requires restoring the verified window snapshot');
