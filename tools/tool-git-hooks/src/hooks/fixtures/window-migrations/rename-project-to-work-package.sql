-- Lint-shape fixture only; not an executable or ready semantic migration.
-- Baseline: b0d2df4eb608827a4933f0840b05300e06158d8a, 110 applied identities, 2026-11-10.
-- foreign-keys-off-rebuild
CREATE TEMP TABLE _rename_scoped_roots (violations INTEGER NOT NULL CHECK (violations = 0));
--> statement-breakpoint
INSERT INTO _rename_scoped_roots SELECT COUNT(*) FROM project p LEFT JOIN project_organization po ON po.resource_id=p.id WHERE po.resource_id IS NULL;
--> statement-breakpoint
ALTER TABLE `cross_project_dependency_activation` RENAME TO `cross_work_package_dependency_activation`;
--> statement-breakpoint
ALTER TABLE `cross_project_dependency_activation_receipt` RENAME TO `cross_work_package_dependency_activation_receipt`;
--> statement-breakpoint
ALTER TABLE `project` RENAME TO `work_package`;
--> statement-breakpoint
ALTER TABLE `project_abbreviation` RENAME TO `work_package_abbreviation`;
--> statement-breakpoint
ALTER TABLE `project_abbreviation_counter` RENAME TO `work_package_abbreviation_counter`;
--> statement-breakpoint
ALTER TABLE `project_access` RENAME TO `work_package_access`;
--> statement-breakpoint
ALTER TABLE `project_organization` RENAME TO `work_package_organization`;
--> statement-breakpoint
ALTER TABLE `project_priority_band` RENAME TO `work_package_priority_band`;
--> statement-breakpoint
ALTER TABLE `project_rank` RENAME TO `work_package_rank`;
--> statement-breakpoint
ALTER TABLE `project_resource_capacity` RENAME TO `work_package_resource_capacity`;
--> statement-breakpoint
ALTER TABLE `project_solution` RENAME TO `work_package_solution`;
--> statement-breakpoint
ALTER TABLE `project_team_capacity` RENAME TO `work_package_team_capacity`;
--> statement-breakpoint
ALTER TABLE `space_project` RENAME TO `space_work_package`;
--> statement-breakpoint
ALTER TABLE `calendar_marker` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `command_journal` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `dependency` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `external_dependency` RENAME COLUMN `predecessor_project_id` TO `predecessor_work_package_id`;
--> statement-breakpoint
ALTER TABLE `external_dependency` RENAME COLUMN `successor_project_id` TO `successor_work_package_id`;
--> statement-breakpoint
ALTER TABLE `optimization_boundary_certificate` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `optimization_generation` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `optimized_schedule_cache` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `plan_event` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_abbreviation` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_access` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_priority_band` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_rank` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_resource_capacity` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_solution` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_package_team_capacity` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `resource_use` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `resource_use_event` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `runtime_authority` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `runtime_claim_binding` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `runtime_command_receipt` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `saved_plan` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `solver_queue` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `solver_slot` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `space_work_package` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `step` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `typed_dependency` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
ALTER TABLE `work_item` RENAME COLUMN `project_id` TO `work_package_id`;
--> statement-breakpoint
DROP INDEX `calendar_marker_project_date`;
--> statement-breakpoint
CREATE INDEX `calendar_marker_work_package_date` ON `calendar_marker` (`work_package_id`,`date`);
--> statement-breakpoint
DROP INDEX `dependency_project`;
--> statement-breakpoint
CREATE INDEX `dependency_work_package` ON `dependency` (`work_package_id`);
--> statement-breakpoint
DROP INDEX `external_dependency_by_predecessor_project`;
--> statement-breakpoint
CREATE INDEX `external_dependency_by_predecessor_work_package` ON `external_dependency` (`predecessor_work_package_id`);
--> statement-breakpoint
DROP INDEX `external_dependency_by_successor_project`;
--> statement-breakpoint
CREATE INDEX `external_dependency_by_successor_work_package` ON `external_dependency` (`successor_work_package_id`);
--> statement-breakpoint
DROP INDEX `plan_event_project_time`;
--> statement-breakpoint
CREATE INDEX `plan_event_work_package_time` ON `plan_event` (`work_package_id`,`created_at`);
--> statement-breakpoint
DROP INDEX `project_abbreviation_code`;
--> statement-breakpoint
CREATE INDEX work_package_abbreviation_code ON work_package_abbreviation(abbreviation);
--> statement-breakpoint
DROP INDEX `project_abbreviation_namespace_code`;
--> statement-breakpoint
CREATE UNIQUE INDEX work_package_abbreviation_namespace_code ON work_package_abbreviation(namespace, abbreviation);
--> statement-breakpoint
DROP INDEX `project_organization_organization`;
--> statement-breakpoint
CREATE INDEX `work_package_organization_organization` ON `work_package_organization` (`organization_id`);
--> statement-breakpoint
DROP INDEX `project_organization_resource_organization`;
--> statement-breakpoint
CREATE UNIQUE INDEX `work_package_organization_resource_organization` ON `work_package_organization` (`resource_id`,`organization_id`);
--> statement-breakpoint
DROP INDEX `project_rank_order`;
--> statement-breakpoint
CREATE INDEX `work_package_rank_order` ON `work_package_rank` (`organization_id`,`position`,`work_package_id`);
--> statement-breakpoint
DROP INDEX `project_resource_capacity_by_resource`;
--> statement-breakpoint
CREATE INDEX `work_package_resource_capacity_by_resource` ON `work_package_resource_capacity` (`resource_id`);
--> statement-breakpoint
DROP INDEX `project_solution_organization_slug`;
--> statement-breakpoint
CREATE UNIQUE INDEX `work_package_solution_organization_slug` ON `work_package_solution` (`organization_id`,`slug`);
--> statement-breakpoint
DROP INDEX `project_solution_slug`;
--> statement-breakpoint
CREATE UNIQUE INDEX `work_package_solution_slug` ON `work_package` (`solution_slug`);
--> statement-breakpoint
DROP INDEX `resource_use_project`;
--> statement-breakpoint
CREATE INDEX resource_use_work_package ON resource_use(work_package_id, id);
--> statement-breakpoint
DROP INDEX `saved_plan_project_time`;
--> statement-breakpoint
CREATE INDEX `saved_plan_work_package_time` ON `saved_plan` (`work_package_id`,`created_at`);
--> statement-breakpoint
DROP INDEX `space_project_order`;
--> statement-breakpoint
CREATE INDEX `space_work_package_order` ON `space_work_package` (`space_id`,`position`);
--> statement-breakpoint
DROP INDEX `space_project_project`;
--> statement-breakpoint
CREATE INDEX `space_work_package_work_package` ON `space_work_package` (`work_package_id`,`organization_id`);
--> statement-breakpoint
DROP INDEX `step_id_project`;
--> statement-breakpoint
CREATE UNIQUE INDEX `step_id_work_package` ON `step` (`id`,`work_package_id`);
--> statement-breakpoint
DROP INDEX `step_project_code`;
--> statement-breakpoint
CREATE UNIQUE INDEX `step_work_package_code` ON `step` (`work_package_id`,`code`) WHERE `code` IS NOT NULL;
--> statement-breakpoint
DROP INDEX `step_project_name`;
--> statement-breakpoint
CREATE UNIQUE INDEX `step_work_package_name` ON `step` (`work_package_id`,`name`);
--> statement-breakpoint
DROP INDEX `typed_dependency_project`;
--> statement-breakpoint
CREATE INDEX `typed_dependency_work_package` ON `typed_dependency` (`work_package_id`);
--> statement-breakpoint
DROP INDEX `work_item_id_project`;
--> statement-breakpoint
CREATE UNIQUE INDEX `work_item_id_work_package` ON `work_item` (`id`,`work_package_id`);
--> statement-breakpoint
DROP INDEX `work_item_project_id_id`;
--> statement-breakpoint
CREATE INDEX `work_item_work_package_id_id` ON `work_item` (`work_package_id`,`id`);
--> statement-breakpoint
DROP TRIGGER `claim_step_project_insert`;
--> statement-breakpoint
DROP TRIGGER `claim_step_project_update`;
--> statement-breakpoint
DROP TRIGGER `project_abbreviation_allocate`;
--> statement-breakpoint
DROP TRIGGER `project_abbreviation_namespace`;
--> statement-breakpoint
DROP TRIGGER `project_abbreviation_scope_insert`;
--> statement-breakpoint
DROP TRIGGER `project_abbreviation_scope_update`;
--> statement-breakpoint
DROP TRIGGER `project_organization_bridge`;
--> statement-breakpoint
DROP TRIGGER `project_organization_frozen_delete`;
--> statement-breakpoint
DROP TRIGGER `project_organization_frozen_insert`;
--> statement-breakpoint
DROP TRIGGER `project_organization_frozen_update`;
--> statement-breakpoint
DROP TRIGGER `project_organization_keys_measure_estimates`;
--> statement-breakpoint
DROP TRIGGER `project_organization_keys_measure_facts`;
--> statement-breakpoint
DROP TRIGGER `project_organization_keys_work_item_budgets`;
--> statement-breakpoint
DROP VIEW `project_abbreviation_candidate`;
--> statement-breakpoint
CREATE VIEW work_package_abbreviation_candidate AS
WITH RECURSIVE candidate(ordinal, abbreviation) AS (
 SELECT next, char(65 + ((next) / 456976) % 26, 65 + ((next) / 17576) % 26, 65 + ((next) / 676) % 26, 65 + ((next) / 26) % 26, 65 + ((next) / 1) % 26) FROM work_package_abbreviation_counter WHERE singleton=1 AND next < 11881376
 UNION ALL
 SELECT ordinal+1, char(65 + ((ordinal+1) / 456976) % 26, 65 + ((ordinal+1) / 17576) % 26, 65 + ((ordinal+1) / 676) % 26, 65 + ((ordinal+1) / 26) % 26, 65 + ((ordinal+1) / 1) % 26) FROM candidate
 WHERE ordinal+1 < 11881376
 AND EXISTS (SELECT 1 FROM work_package_abbreviation WHERE abbreviation=candidate.abbreviation)
)
SELECT ordinal FROM candidate
WHERE NOT EXISTS (SELECT 1 FROM work_package_abbreviation WHERE abbreviation=candidate.abbreviation)
LIMIT 1;
--> statement-breakpoint
CREATE TRIGGER `claim_step_work_package_insert` BEFORE INSERT ON `claim`
WHEN NEW.step_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.work_package_id != s.work_package_id
  ) THEN RAISE(ABORT, 'claim step work_package mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER `claim_step_work_package_update` BEFORE UPDATE ON `claim`
WHEN NEW.step_id IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM work_item w JOIN step s ON s.id = NEW.step_id
    WHERE w.id = NEW.work_item_id AND w.work_package_id != s.work_package_id
  ) THEN RAISE(ABORT, 'claim step work_package mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER work_package_abbreviation_allocate AFTER INSERT ON work_package
BEGIN
 SELECT RAISE(ABORT,'work_package abbreviation counter missing')
 WHERE (SELECT COUNT(*) FROM work_package_abbreviation_counter WHERE singleton=1) != 1;
 SELECT RAISE(ABORT,'work_package abbreviation exhausted')
 WHERE NOT EXISTS (SELECT 1 FROM work_package_abbreviation_candidate);
 UPDATE work_package_abbreviation_counter SET next=(SELECT ordinal+1 FROM work_package_abbreviation_candidate) WHERE singleton=1;
 INSERT INTO work_package_abbreviation(work_package_id,namespace,abbreviation)
 SELECT NEW.id,
 CASE WHEN EXISTS (SELECT 1 FROM work_package_organization WHERE resource_id=NEW.id)
 THEN 'org:' || (SELECT organization_id FROM work_package_organization WHERE resource_id=NEW.id)
 ELSE 'legacy' END,
 char(65 + ((next-1) / 456976) % 26, 65 + ((next-1) / 17576) % 26, 65 + ((next-1) / 676) % 26, 65 + ((next-1) / 26) % 26, 65 + ((next-1) / 1) % 26)
 FROM work_package_abbreviation_counter WHERE singleton=1;
END;
--> statement-breakpoint
CREATE TRIGGER work_package_abbreviation_namespace AFTER INSERT ON work_package_organization
BEGIN
 UPDATE work_package_abbreviation SET namespace='org:' || NEW.organization_id WHERE work_package_id=NEW.resource_id;
END;
--> statement-breakpoint
CREATE TRIGGER work_package_abbreviation_scope_insert BEFORE INSERT ON work_package_abbreviation
WHEN NEW.namespace IS NOT CASE
 WHEN EXISTS (SELECT 1 FROM work_package_organization WHERE resource_id=NEW.work_package_id)
 THEN 'org:' || (SELECT organization_id FROM work_package_organization WHERE resource_id=NEW.work_package_id)
 ELSE 'legacy' END
BEGIN
 SELECT RAISE(ABORT,'work_package abbreviation namespace differs from ownership');
END;
--> statement-breakpoint
CREATE TRIGGER work_package_abbreviation_scope_update BEFORE UPDATE ON work_package_abbreviation
WHEN NEW.namespace IS NOT CASE
 WHEN EXISTS (SELECT 1 FROM work_package_organization WHERE resource_id=NEW.work_package_id)
 THEN 'org:' || (SELECT organization_id FROM work_package_organization WHERE resource_id=NEW.work_package_id)
 ELSE 'legacy' END
BEGIN
 SELECT RAISE(ABORT,'work_package abbreviation namespace differs from ownership');
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_bridge`
AFTER INSERT ON `work_package`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `work_package_organization` (`resource_id`, `organization_id`)
	SELECT NEW.`id`, `organization`.`id` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_frozen_delete`
BEFORE DELETE ON `work_package_organization`
WHEN EXISTS (SELECT 1 FROM `work_package` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_package_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_frozen_insert`
BEFORE INSERT ON `work_package_organization`
WHEN EXISTS (SELECT 1 FROM `work_package_organization` WHERE `resource_id` = NEW.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_package_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `work_package_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_package_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_keys_measure_estimates`
AFTER INSERT ON `work_package_organization`
BEGIN
	UPDATE `measure_estimate` SET `measure_id` = (
		SELECT m.`id` FROM `measure` AS m
		WHERE m.`organization_id` = NEW.`organization_id` AND m.`key` = `measure_estimate`.`measure_key`
	)
	WHERE `measure_id` IS NULL
		AND `work_item_id` IN (SELECT `id` FROM `work_item` WHERE `work_package_id` = NEW.`resource_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_keys_measure_facts`
AFTER INSERT ON `work_package_organization`
BEGIN
	UPDATE `step_measure` SET `measure_id` = (
		SELECT m.`id` FROM `measure` AS m
		WHERE m.`organization_id` = NEW.`organization_id`
			AND m.`key` = CASE `step_measure`.`metric` WHEN 'token_actual' THEN 'tokens' ELSE 'hours' END
	)
	WHERE `measure_id` IS NULL AND `metric` IN ('token_actual', 'hours_actual')
		AND `work_item_id` IN (SELECT `id` FROM `work_item` WHERE `work_package_id` = NEW.`resource_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `work_package_organization_keys_work_item_budgets`
AFTER INSERT ON `work_package_organization`
BEGIN
	UPDATE `work_item_budget` SET `measure_id` = (
		SELECT m.`id` FROM `measure` AS m
		WHERE m.`organization_id` = NEW.`organization_id` AND m.`key` = `work_item_budget`.`measure_key`
	)
	WHERE `measure_id` IS NULL
		AND `work_item_id` IN (SELECT `id` FROM `work_item` WHERE `work_package_id` = NEW.`resource_id`);
END;
--> statement-breakpoint
CREATE TABLE "organization_audit_NEW" (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`),
	`actor_id` text NOT NULL,
	`action` text NOT NULL CHECK (`action` IN (
		'restricted_work_package_recovery',
		'sso_connection_created',
		'sso_connection_updated',
		'sso_connection_deleted',
		'sso_connection_proven',
		'sso_enforcement_changed',
		'provisioning_token_issued',
		'provisioning_token_rotated',
		'provisioning_token_revoked',
		'scim_user_provisioned',
		'scim_user_updated',
		'scim_user_deprovisioned',
		'pending_membership_activated',
		'session_policy_changed',
		'machine_credential_created',
		'machine_credential_rotated',
		'machine_credential_revoked',
		'trusted_issuer_registered',
		'trusted_issuer_removed',
		'organization_limits_changed',
		'compute_provider_registered',
		'compute_provider_updated',
		'compute_provider_removed',
		'machine_token_issued',
		'machine_token_issued_overflow',
		'agent_pool_created',
		'agent_pool_revoked',
		'agent_pool_rekeyed',
		'directory_capacity_changed',
		'access_granted',
		'access_revoked',
		'access_group_created',
		'access_group_renamed',
		'access_group_deleted',
		'access_group_member_added',
		'access_group_member_removed',
		'organization_member_removed'
	)),
	`subject_kind` text NOT NULL CHECK (`subject_kind` IN (
		'work_package',
		'sso_connection',
		'provisioning_token',
		'scim_user',
		'session_policy',
		'machine_credential',
		'trusted_issuer',
		'organization_limits',
		'compute_provider',
		'agent_pool',
		'resource',
		'access_grant',
		'access_group',
		'organization_member'
	)),
	`subject_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO organization_audit_NEW (id,organization_id,actor_id,action,subject_kind,subject_id,detail,created_at) SELECT id,organization_id,actor_id,CASE action WHEN 'restricted_project_recovery' THEN 'restricted_work_package_recovery' ELSE action END,CASE subject_kind WHEN 'project' THEN 'work_package' ELSE subject_kind END,subject_id,detail,created_at FROM organization_audit;
--> statement-breakpoint
DROP TABLE organization_audit;
--> statement-breakpoint
ALTER TABLE organization_audit_NEW RENAME TO organization_audit;
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_audit_machine_token_issued_overflow_day` ON `organization_audit` (
	json_extract(`detail`, '$.credentialId'),
	`created_at` / 86400000
) WHERE `action` = 'machine_token_issued_overflow';
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_audit_machine_token_issued_run` ON `organization_audit` (
	json_extract(`detail`, '$.credentialId'),
	`created_at` / 86400000,
	coalesce(json_extract(`detail`, '$.runId'), '')
) WHERE `action` = 'machine_token_issued';
--> statement-breakpoint
CREATE INDEX `organization_audit_organization_created` ON `organization_audit` (`organization_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `organization_audit_no_delete` BEFORE DELETE ON `organization_audit`
BEGIN
	SELECT RAISE(ABORT, 'organization_audit is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `organization_audit_no_update` BEFORE UPDATE ON `organization_audit`
BEGIN
	SELECT RAISE(ABORT, 'organization_audit is append-only');
END;
--> statement-breakpoint
CREATE TEMP TABLE _rename_foreign_keys (violations INTEGER NOT NULL CHECK (violations = 0));
--> statement-breakpoint
INSERT INTO _rename_foreign_keys SELECT COUNT(*) FROM pragma_foreign_key_check;
