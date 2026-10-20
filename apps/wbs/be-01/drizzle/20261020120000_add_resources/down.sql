-- Reverses `20261020120000_add_resources`, refusing while any resource,
-- capacity or demand exists: dropping them would discard what an operator
-- declared about hosts and what plans state they consume.
-- Proof: guard statements removed; the add_resources CLI down negative exited 0
-- and dropped the tables with their rows; watched 2026-10-20.
CREATE TEMP TABLE resource_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "resources exist: delete every resource (deleteResource with cascade) or record and remove the resource, project_resource_capacity and work_item_resource_demand rows before migrate-down-cli.ts --to=<baseline>; no automatic recovery tool exists for resources" CHECK (rows = 0)
);
--> statement-breakpoint
INSERT INTO resource_rollback_guard SELECT
  (SELECT count(*) FROM resource)
  + (SELECT count(*) FROM project_resource_capacity)
  + (SELECT count(*) FROM work_item_resource_demand);
--> statement-breakpoint
DROP TABLE resource_rollback_guard;
--> statement-breakpoint
DROP TRIGGER resource_organization_frozen_name;
--> statement-breakpoint
DROP TRIGGER resource_organization_frozen_delete;
--> statement-breakpoint
DROP TRIGGER resource_organization_frozen_update;
--> statement-breakpoint
DROP TRIGGER resource_organization_frozen_insert;
--> statement-breakpoint
DROP TRIGGER resource_organization_name_bridge;
--> statement-breakpoint
DROP TRIGGER resource_organization_bridge;
--> statement-breakpoint
DROP INDEX resource_organization_name;
--> statement-breakpoint
DROP TABLE resource_organization;
--> statement-breakpoint
DROP INDEX work_item_resource_demand_by_resource;
--> statement-breakpoint
DROP TABLE work_item_resource_demand;
--> statement-breakpoint
DROP INDEX project_resource_capacity_by_resource;
--> statement-breakpoint
DROP TABLE project_resource_capacity;
--> statement-breakpoint
DROP INDEX resource_name;
--> statement-breakpoint
DROP TABLE resource;
