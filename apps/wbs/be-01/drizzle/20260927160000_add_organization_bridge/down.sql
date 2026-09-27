-- Reverses `20260927160000_add_organization_bridge`. Dropping the triggers
-- touches no row; mappings they wrote stay and remain valid.
DROP TRIGGER `project_organization_bridge`;
--> statement-breakpoint
DROP TRIGGER `saved_plan_organization_bridge`;
--> statement-breakpoint
DROP TRIGGER `person_organization_bridge`;
--> statement-breakpoint
DROP TRIGGER `service_team_organization_bridge`;
--> statement-breakpoint
DROP TRIGGER `service_organization_bridge`;
--> statement-breakpoint
DROP TRIGGER `tag_organization_bridge`;
--> statement-breakpoint
DROP TRIGGER `work_item_type_organization_bridge`;
--> statement-breakpoint
DROP TRIGGER `external_system_organization_bridge`;
--> statement-breakpoint
DROP TRIGGER `person_organization_name_bridge`;
--> statement-breakpoint
DROP TRIGGER `service_team_organization_name_bridge`;
--> statement-breakpoint
DROP TRIGGER `service_organization_name_bridge`;
--> statement-breakpoint
DROP TRIGGER `tag_organization_name_bridge`;
--> statement-breakpoint
DROP TRIGGER `work_item_type_organization_name_bridge`;
--> statement-breakpoint
DROP TRIGGER `external_system_organization_name_bridge`;
