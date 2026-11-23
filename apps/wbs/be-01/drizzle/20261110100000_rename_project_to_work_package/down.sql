CREATE TEMP TABLE _rename_down_refusal(message TEXT NOT NULL);
--> statement-breakpoint
CREATE TEMP TRIGGER _rename_down_refuse BEFORE INSERT ON _rename_down_refusal BEGIN SELECT RAISE(ABORT,NEW.message); END;
--> statement-breakpoint
INSERT INTO _rename_down_refusal VALUES('work-package rename rollback requires restoring the verified window snapshot');
