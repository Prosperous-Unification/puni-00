CREATE TABLE resource_use_location_down_guard (use_id TEXT NOT NULL);
--> statement-breakpoint
CREATE TRIGGER resource_use_location_down_refusal BEFORE INSERT ON resource_use_location_down_guard
WHEN EXISTS(SELECT 1 FROM resource_use_location l JOIN resource_use u ON u.id=l.use_id
 WHERE u.id=NEW.use_id AND u.state='active' AND l.kind<>'unassociated' AND l.work_item_id<>u.work_item_id)
BEGIN
  SELECT RAISE(ABORT,'resource use '||NEW.use_id||' has moved lifecycle addresses; finish its authorized resource-use cleanup before downgrade');
END;
--> statement-breakpoint
INSERT INTO resource_use_location_down_guard SELECT id FROM resource_use WHERE state='active';
--> statement-breakpoint
DROP TRIGGER resource_use_location_down_refusal;
--> statement-breakpoint
DROP TABLE resource_use_location_down_guard;
--> statement-breakpoint
DROP TRIGGER resource_use_location_active_update;
--> statement-breakpoint
DROP TABLE resource_use_location;
