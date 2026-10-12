-- Reverses `20261012090000_add_enterprise_sso_records`.
--
-- A connection, token, SCIM user or policy is customer configuration and
-- provisioning evidence, so a rollback never discards one: the first statement
-- fails its CHECK while any row exists in any of the four tables, and the
-- rollback runner reverts this script and its ledger row in one transaction.
--
-- Proof, observed 2026-10-12 in `enterprise-sso-migration.db.test.ts`: the
-- connection count replaced by a constant `0 = 0` made `refuses to roll back
-- over any enterprise SSO record` roll the tables away over a connection.
CREATE TEMP TABLE `enterprise_sso_records_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "enterprise SSO records exist: a rollback never discards customer configuration; delete them deliberately first" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `enterprise_sso_records_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `organization_sso_connection`) = 0
  AND (SELECT COUNT(*) FROM `organization_scim_token`) = 0
  AND (SELECT COUNT(*) FROM `organization_scim_user`) = 0
  AND (SELECT COUNT(*) FROM `organization_session_policy`) = 0;
--> statement-breakpoint
DROP TABLE `enterprise_sso_records_down_check`;
--> statement-breakpoint
DROP TABLE `organization_session_policy`;
--> statement-breakpoint
DROP INDEX `organization_scim_user_bound`;
--> statement-breakpoint
DROP INDEX `organization_scim_user_name`;
--> statement-breakpoint
DROP TABLE `organization_scim_user`;
--> statement-breakpoint
DROP INDEX `organization_scim_token_organization`;
--> statement-breakpoint
DROP INDEX `organization_scim_token_digest`;
--> statement-breakpoint
DROP TABLE `organization_scim_token`;
--> statement-breakpoint
DROP INDEX `organization_sso_connection_organization`;
--> statement-breakpoint
DROP INDEX `organization_sso_connection_proven`;
--> statement-breakpoint
DROP INDEX `organization_sso_connection_slug`;
--> statement-breakpoint
DROP INDEX `organization_sso_connection_claim`;
--> statement-breakpoint
DROP TABLE `organization_sso_connection`;
