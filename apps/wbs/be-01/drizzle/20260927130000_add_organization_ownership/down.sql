-- Reverses `20260927130000_add_organization_ownership`.
--
-- Safe only before tenancy activation: the forward migration touched no
-- existing table, so dropping the side tables leaves every root, name and
-- relationship as the previous release reads them. The mappings themselves are
-- lost and the backfill rebuilds them. After activation this must never run.
DROP TABLE `saved_plan_organization`;
--> statement-breakpoint
DROP TABLE `project_organization`;
--> statement-breakpoint
DROP TABLE `external_system_organization`;
--> statement-breakpoint
DROP TABLE `work_item_type_organization`;
--> statement-breakpoint
DROP TABLE `tag_organization`;
--> statement-breakpoint
DROP TABLE `service_organization`;
--> statement-breakpoint
DROP TABLE `service_team_organization`;
--> statement-breakpoint
DROP TABLE `person_organization`;
