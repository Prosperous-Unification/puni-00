-- The legacy bridge (task 2.1): while the activation marker says
-- `pre_activation` and a legacy organization exists, every root either release
-- inserts is mapped to it, and every catalog rename keeps the side-table name
-- equal. Triggers, not repository writes, because the outgoing release shares
-- this file and knows nothing of the side tables. With no legacy organization
-- they map nothing; after activation they map nothing and repositories write
-- the mapping explicitly. A missing or malformed marker aborts the write rather
-- than being read as either state. Rebuilding a root table drops its triggers;
-- `findUnmappedRoots` and `findCatalogNameDrift` catch what that misses.
-- Proof, observed 2026-09-27 in `organization-bridge.db.test.ts`: `WHEN 0` on
-- the `project` or `service` insert trigger failed `maps every root either
-- release writes …` and `maps late writes from a second connection without
-- another backfill`; dropping the `pre_activation` predicate from the `project`
-- or `tag` insert failed `leaves a second organization's roots and names to
-- explicit mappings`; replacing every marker RAISE with `SELECT 1` failed both
-- `refuses a root write over …` cases.
CREATE TRIGGER `project_organization_bridge`
AFTER INSERT ON `project`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `project_organization` (`resource_id`, `organization_id`)
	SELECT NEW.`id`, `organization`.`id` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `saved_plan_organization_bridge`
AFTER INSERT ON `saved_plan`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `saved_plan_organization` (`resource_id`, `organization_id`)
	SELECT NEW.`id`, `organization`.`id` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `person_organization_bridge`
AFTER INSERT ON `person`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `person_organization` (`resource_id`, `organization_id`, `name`)
	SELECT NEW.`id`, `organization`.`id`, NEW.`name` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `service_team_organization_bridge`
AFTER INSERT ON `service_team`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `service_team_organization` (`resource_id`, `organization_id`, `name`)
	SELECT NEW.`id`, `organization`.`id`, NEW.`name` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `service_organization_bridge`
AFTER INSERT ON `service`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `service_organization` (`resource_id`, `organization_id`, `name`)
	SELECT NEW.`id`, `organization`.`id`, NEW.`name` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `tag_organization_bridge`
AFTER INSERT ON `tag`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `tag_organization` (`resource_id`, `organization_id`, `name`)
	SELECT NEW.`id`, `organization`.`id`, NEW.`name` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `work_item_type_organization_bridge`
AFTER INSERT ON `work_item_type`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `work_item_type_organization` (`resource_id`, `organization_id`, `name`)
	SELECT NEW.`id`, `organization`.`id`, NEW.`name` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `external_system_organization_bridge`
AFTER INSERT ON `external_system`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	INSERT INTO `external_system_organization` (`resource_id`, `organization_id`, `name`)
	SELECT NEW.`id`, `organization`.`id`, NEW.`name` FROM `organization`, `organization_activation`
	WHERE `organization`.`legacy` = 1 AND `organization_activation`.`state` = 'pre_activation';
END;
--> statement-breakpoint
-- Proof, observed 2026-09-27: `WHEN 0` on the `tag` rename trigger failed
-- `keeps every catalog side name equal through renames`; dropping its
-- `pre_activation` predicate failed `stops mirroring legacy catalog renames
-- into organization display names`.
CREATE TRIGGER `person_organization_name_bridge`
AFTER UPDATE OF `name` ON `person`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	UPDATE `person_organization` SET `name` = NEW.`name`
	WHERE `resource_id` = NEW.`id`
		AND `organization_id` = (SELECT `id` FROM `organization` WHERE `legacy` = 1)
		AND (SELECT `state` FROM `organization_activation`) = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `service_team_organization_name_bridge`
AFTER UPDATE OF `name` ON `service_team`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	UPDATE `service_team_organization` SET `name` = NEW.`name`
	WHERE `resource_id` = NEW.`id`
		AND `organization_id` = (SELECT `id` FROM `organization` WHERE `legacy` = 1)
		AND (SELECT `state` FROM `organization_activation`) = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `service_organization_name_bridge`
AFTER UPDATE OF `name` ON `service`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	UPDATE `service_organization` SET `name` = NEW.`name`
	WHERE `resource_id` = NEW.`id`
		AND `organization_id` = (SELECT `id` FROM `organization` WHERE `legacy` = 1)
		AND (SELECT `state` FROM `organization_activation`) = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `tag_organization_name_bridge`
AFTER UPDATE OF `name` ON `tag`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	UPDATE `tag_organization` SET `name` = NEW.`name`
	WHERE `resource_id` = NEW.`id`
		AND `organization_id` = (SELECT `id` FROM `organization` WHERE `legacy` = 1)
		AND (SELECT `state` FROM `organization_activation`) = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `work_item_type_organization_name_bridge`
AFTER UPDATE OF `name` ON `work_item_type`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	UPDATE `work_item_type_organization` SET `name` = NEW.`name`
	WHERE `resource_id` = NEW.`id`
		AND `organization_id` = (SELECT `id` FROM `organization` WHERE `legacy` = 1)
		AND (SELECT `state` FROM `organization_activation`) = 'pre_activation';
END;
--> statement-breakpoint
CREATE TRIGGER `external_system_organization_name_bridge`
AFTER UPDATE OF `name` ON `external_system`
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker is absent or malformed')
	WHERE (SELECT COUNT(*) FROM `organization_activation`) != 1
		OR NOT EXISTS (SELECT 1 FROM `organization_activation` WHERE `singleton` = 1
			AND ((`state` = 'pre_activation' AND `activated_at` IS NULL)
				OR (`state` = 'activated' AND typeof(`activated_at`) = 'integer')));
	UPDATE `external_system_organization` SET `name` = NEW.`name`
	WHERE `resource_id` = NEW.`id`
		AND `organization_id` = (SELECT `id` FROM `organization` WHERE `legacy` = 1)
		AND (SELECT `state` FROM `organization_activation`) = 'pre_activation';
END;
