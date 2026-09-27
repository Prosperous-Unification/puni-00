-- Freezes which organization owns each root (task 3.3 of
-- `organization-ownership-and-access`). Organization-scoped reads check the
-- owner once and later writes address the root by id; that is sound only
-- while ownership cannot move, so the database refuses every move:
--
-- * an UPDATE that changes `resource_id` or `organization_id` (a catalog
--   display-name rename still passes);
-- * a DELETE while the root still exists (the root's own deletion cascades and
--   passes, because the root is gone by then);
-- * an INSERT for a root that is already mapped, which is also what stops
--   `INSERT OR REPLACE`: its implicit delete fires no trigger;
-- * on a catalog table, an INSERT or name UPDATE onto a display name another
--   root of the organization holds, which is what stops `INSERT OR REPLACE`
--   and `UPDATE OR REPLACE` from deleting that root's mapping through the
--   `(organization_id, name)` unique index.
--
-- Additive: triggers only. The organization-unaware release never writes these
-- tables; its root deletions cascade through the delete trigger.
--
-- Proof, observed 2026-09-27 in `organization-ownership-freeze.db.test.ts`:
-- each of the 30 triggers made `WHEN 0` alone failed that table's own case:
-- `refuses moving the root to another organization` for an update trigger,
-- `refuses unmapping a live root, and a second or replacing mapping` for an
-- insert or delete trigger, and `refuses replacing another root's display
-- name` for a catalog insert or name trigger; removing only the name clause
-- from each catalog insert trigger failed that last case too.
CREATE TRIGGER `project_organization_frozen_insert`
BEFORE INSERT ON `project_organization`
WHEN EXISTS (SELECT 1 FROM `project_organization` WHERE `resource_id` = NEW.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: project_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `project_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `project_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: project_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `project_organization_frozen_delete`
BEFORE DELETE ON `project_organization`
WHEN EXISTS (SELECT 1 FROM `project` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: project_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `saved_plan_organization_frozen_insert`
BEFORE INSERT ON `saved_plan_organization`
WHEN EXISTS (SELECT 1 FROM `saved_plan_organization` WHERE `resource_id` = NEW.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: saved_plan_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `saved_plan_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `saved_plan_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: saved_plan_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `saved_plan_organization_frozen_delete`
BEFORE DELETE ON `saved_plan_organization`
WHEN EXISTS (SELECT 1 FROM `saved_plan` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: saved_plan_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `person_organization_frozen_insert`
BEFORE INSERT ON `person_organization`
WHEN EXISTS (SELECT 1 FROM `person_organization` WHERE `resource_id` = NEW.`resource_id`)
	OR EXISTS (SELECT 1 FROM `person_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: person_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `person_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `person_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: person_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `person_organization_frozen_delete`
BEFORE DELETE ON `person_organization`
WHEN EXISTS (SELECT 1 FROM `person` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: person_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `person_organization_frozen_name`
BEFORE UPDATE OF `name` ON `person_organization`
WHEN EXISTS (SELECT 1 FROM `person_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name` AND `resource_id` != OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: person_organization name is held by another root');
END;
--> statement-breakpoint
CREATE TRIGGER `service_team_organization_frozen_insert`
BEFORE INSERT ON `service_team_organization`
WHEN EXISTS (SELECT 1 FROM `service_team_organization` WHERE `resource_id` = NEW.`resource_id`)
	OR EXISTS (SELECT 1 FROM `service_team_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: service_team_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `service_team_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `service_team_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: service_team_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `service_team_organization_frozen_delete`
BEFORE DELETE ON `service_team_organization`
WHEN EXISTS (SELECT 1 FROM `service_team` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: service_team_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `service_team_organization_frozen_name`
BEFORE UPDATE OF `name` ON `service_team_organization`
WHEN EXISTS (SELECT 1 FROM `service_team_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name` AND `resource_id` != OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: service_team_organization name is held by another root');
END;
--> statement-breakpoint
CREATE TRIGGER `service_organization_frozen_insert`
BEFORE INSERT ON `service_organization`
WHEN EXISTS (SELECT 1 FROM `service_organization` WHERE `resource_id` = NEW.`resource_id`)
	OR EXISTS (SELECT 1 FROM `service_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: service_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `service_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `service_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: service_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `service_organization_frozen_delete`
BEFORE DELETE ON `service_organization`
WHEN EXISTS (SELECT 1 FROM `service` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: service_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `service_organization_frozen_name`
BEFORE UPDATE OF `name` ON `service_organization`
WHEN EXISTS (SELECT 1 FROM `service_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name` AND `resource_id` != OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: service_organization name is held by another root');
END;
--> statement-breakpoint
CREATE TRIGGER `tag_organization_frozen_insert`
BEFORE INSERT ON `tag_organization`
WHEN EXISTS (SELECT 1 FROM `tag_organization` WHERE `resource_id` = NEW.`resource_id`)
	OR EXISTS (SELECT 1 FROM `tag_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: tag_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `tag_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `tag_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: tag_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `tag_organization_frozen_delete`
BEFORE DELETE ON `tag_organization`
WHEN EXISTS (SELECT 1 FROM `tag` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: tag_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `tag_organization_frozen_name`
BEFORE UPDATE OF `name` ON `tag_organization`
WHEN EXISTS (SELECT 1 FROM `tag_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name` AND `resource_id` != OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: tag_organization name is held by another root');
END;
--> statement-breakpoint
CREATE TRIGGER `work_item_type_organization_frozen_insert`
BEFORE INSERT ON `work_item_type_organization`
WHEN EXISTS (SELECT 1 FROM `work_item_type_organization` WHERE `resource_id` = NEW.`resource_id`)
	OR EXISTS (SELECT 1 FROM `work_item_type_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_item_type_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `work_item_type_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `work_item_type_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_item_type_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `work_item_type_organization_frozen_delete`
BEFORE DELETE ON `work_item_type_organization`
WHEN EXISTS (SELECT 1 FROM `work_item_type` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_item_type_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `work_item_type_organization_frozen_name`
BEFORE UPDATE OF `name` ON `work_item_type_organization`
WHEN EXISTS (SELECT 1 FROM `work_item_type_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name` AND `resource_id` != OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: work_item_type_organization name is held by another root');
END;
--> statement-breakpoint
CREATE TRIGGER `external_system_organization_frozen_insert`
BEFORE INSERT ON `external_system_organization`
WHEN EXISTS (SELECT 1 FROM `external_system_organization` WHERE `resource_id` = NEW.`resource_id`)
	OR EXISTS (SELECT 1 FROM `external_system_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: external_system_organization already maps this root or name');
END;
--> statement-breakpoint
CREATE TRIGGER `external_system_organization_frozen_update`
BEFORE UPDATE OF `resource_id`, `organization_id` ON `external_system_organization`
WHEN NEW.`resource_id` IS NOT OLD.`resource_id` OR NEW.`organization_id` IS NOT OLD.`organization_id`
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: external_system_organization cannot move a root');
END;
--> statement-breakpoint
CREATE TRIGGER `external_system_organization_frozen_delete`
BEFORE DELETE ON `external_system_organization`
WHEN EXISTS (SELECT 1 FROM `external_system` WHERE `id` = OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: external_system_organization cannot unmap a live root');
END;
--> statement-breakpoint
CREATE TRIGGER `external_system_organization_frozen_name`
BEFORE UPDATE OF `name` ON `external_system_organization`
WHEN EXISTS (SELECT 1 FROM `external_system_organization` WHERE `organization_id` = NEW.`organization_id` AND `name` = NEW.`name` AND `resource_id` != OLD.`resource_id`)
BEGIN
	SELECT RAISE(ABORT, 'organization ownership is immutable: external_system_organization name is held by another root');
END;
