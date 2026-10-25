-- Reverses `20261025100000_add_access_grants`, refusing while anything the
-- backfill did not write exists (`wbs-permissions` "Tables",
-- `wbs-custom-permissions` "Tables"): a grant whose origin is not `backfill`,
-- an access group, a custom role, or a permission row of any role but a
-- built-in. Dropping the tables would discard each of them, and the backfill
-- is the only state the migration can recreate. Built-in roles, their seed
-- rows and backfilled grants are removable. Otherwise the five tables go in
-- dependency order; their triggers and indexes go with them.
--
-- Proof, observed 2026-10-25 in be-01 `access-grant-migration.db.test.ts`,
-- each guard's count replaced by `0`: the grant guard made `refuses rollback
-- over one route-origin grant, keeping it` roll back, deleting the route
-- grant; the group guard made `refuses rollback over one access group` delete
-- the group; the permission-row guard made `refuses rollback over a permission
-- row of no built-in role` delete the orphan row; the custom-role guard alone
-- made `refuses rollback over an ungranted custom role, keeping it and its
-- rows` refuse under the permission-row guard's name instead, and with that
-- guard's count also `0` it deleted the role and its rows.
CREATE TEMP TABLE `access_grants_down_check` (
	`non_backfill_grants` integer NOT NULL,
	`access_groups` integer NOT NULL,
	`custom_roles` integer NOT NULL,
	`custom_role_permissions` integer NOT NULL,
	CONSTRAINT "access grants written after the backfill exist: record every access_grant row whose origin is not backfill and revoke it before migrate-down-cli.ts; no automatic recovery tool exists for them" CHECK (`non_backfill_grants` = 0),
	CONSTRAINT "access groups exist: record every access_group and its members and delete them before migrate-down-cli.ts; no automatic recovery tool exists for them" CHECK (`access_groups` = 0),
	CONSTRAINT "custom access roles exist: record every access_role whose organization_id is set, with its permission rows, and delete them before migrate-down-cli.ts; no automatic recovery tool exists for them" CHECK (`custom_roles` = 0),
	CONSTRAINT "permission rows of no built-in role exist: record every access_role_permission row whose role is not built-in and delete it before migrate-down-cli.ts; no automatic recovery tool exists for them" CHECK (`custom_role_permissions` = 0)
);
--> statement-breakpoint
INSERT INTO `access_grants_down_check` (`non_backfill_grants`, `access_groups`, `custom_roles`, `custom_role_permissions`)
SELECT
	(SELECT COUNT(*) FROM `access_grant` WHERE `origin` <> 'backfill'),
	(SELECT COUNT(*) FROM `access_group`),
	(SELECT COUNT(*) FROM `access_role` WHERE `organization_id` IS NOT NULL),
	(SELECT COUNT(*) FROM `access_role_permission`
		WHERE `role_id` NOT IN (SELECT `id` FROM `access_role` WHERE `organization_id` IS NULL));
--> statement-breakpoint
DROP TABLE `access_grants_down_check`;
--> statement-breakpoint
DROP TABLE `access_grant`;
--> statement-breakpoint
DROP TABLE `access_group_member`;
--> statement-breakpoint
DROP TABLE `access_group`;
--> statement-breakpoint
DROP TABLE `access_role_permission`;
--> statement-breakpoint
DROP TABLE `access_role`;
