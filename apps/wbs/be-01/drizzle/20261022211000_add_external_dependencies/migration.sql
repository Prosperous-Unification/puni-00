CREATE UNIQUE INDEX `work_item_id_project` ON `work_item` (`id`,`project_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `step_id_project` ON `step` (`id`,`project_id`);
--> statement-breakpoint
CREATE TABLE `external_dependency` (
-- Proof: removing this check separately admitted its malformed row in `enforces external discriminants, step nullability, distinct projects, identity and duplicate keys` (2026-10-22).
 `id` text PRIMARY KEY NOT NULL,
 `organization_id` text NOT NULL,
 `predecessor_project_id` text NOT NULL,
 `successor_project_id` text NOT NULL,
 `predecessor_work_item_id` text NOT NULL,
-- Proof: removing this check separately admitted its malformed row in `enforces external discriminants, step nullability, distinct projects, identity and duplicate keys` (2026-10-22).
 `predecessor_scope` text NOT NULL CHECK (`predecessor_scope` IN ('whole','node','descendant-step')),
 `predecessor_step_id` text,
 `successor_work_item_id` text NOT NULL,
-- Proof: removing this check separately admitted its malformed row in `enforces external discriminants, step nullability, distinct projects, identity and duplicate keys` (2026-10-22).
 `successor_scope` text NOT NULL CHECK (`successor_scope` IN ('whole','node','descendant-step')),
 `successor_step_id` text,
-- Proof: removing this check separately admitted its malformed row in `enforces external discriminants, step nullability, distinct projects, identity and duplicate keys` (2026-10-22).
 `type` text NOT NULL CHECK (`type` IN ('FS','SS','FF')),
 `created_at` integer,
 `updated_at` integer,
 `created_by` text REFERENCES `users`(`id`),
-- Proof: removing this check separately admitted its malformed row in `enforces external discriminants, step nullability, distinct projects, identity and duplicate keys` (2026-10-22).
 CHECK (`predecessor_project_id` <> `successor_project_id`),
-- Proof: removing this check separately admitted its malformed row in `enforces external discriminants, step nullability, distinct projects, identity and duplicate keys` (2026-10-22).
 CHECK ((`predecessor_scope` = 'whole') = (`predecessor_step_id` IS NULL)),
-- Proof: removing this check separately admitted its malformed row in `enforces external discriminants, step nullability, distinct projects, identity and duplicate keys` (2026-10-22).
 CHECK ((`successor_scope` = 'whole') = (`successor_step_id` IS NULL)),
-- Proof: removing this composite FK separately admitted its ownership violation in `enforces endpoint and organization foreign keys and referenced ownership updates` (2026-10-22).
 FOREIGN KEY (`predecessor_project_id`,`organization_id`) REFERENCES `project_organization`(`resource_id`,`organization_id`) ON DELETE RESTRICT,
-- Proof: removing this composite FK separately admitted its ownership violation in `enforces endpoint and organization foreign keys and referenced ownership updates` (2026-10-22).
 FOREIGN KEY (`successor_project_id`,`organization_id`) REFERENCES `project_organization`(`resource_id`,`organization_id`) ON DELETE RESTRICT,
-- Proof: removing this composite FK separately admitted its ownership violation in `enforces endpoint and organization foreign keys and referenced ownership updates` (2026-10-22).
 FOREIGN KEY (`predecessor_work_item_id`,`predecessor_project_id`) REFERENCES `work_item`(`id`,`project_id`) ON DELETE RESTRICT,
-- Proof: removing this composite FK separately admitted its ownership violation in `enforces endpoint and organization foreign keys and referenced ownership updates` (2026-10-22).
 FOREIGN KEY (`successor_work_item_id`,`successor_project_id`) REFERENCES `work_item`(`id`,`project_id`) ON DELETE RESTRICT,
-- Proof: removing this composite FK separately admitted its ownership violation in `enforces endpoint and organization foreign keys and referenced ownership updates` (2026-10-22).
 FOREIGN KEY (`predecessor_step_id`,`predecessor_project_id`) REFERENCES `step`(`id`,`project_id`) ON DELETE RESTRICT,
-- Proof: removing this composite FK separately admitted its ownership violation in `enforces endpoint and organization foreign keys and referenced ownership updates` (2026-10-22).
 FOREIGN KEY (`successor_step_id`,`successor_project_id`) REFERENCES `step`(`id`,`project_id`) ON DELETE RESTRICT
);
--> statement-breakpoint
-- Proof: removing this index admitted the second endpoint key in `enforces external discriminants, step nullability, distinct projects, identity and duplicate keys` (2026-10-22).
CREATE UNIQUE INDEX `external_dependency_endpoints` ON `external_dependency` (`predecessor_work_item_id`,`predecessor_scope`,ifnull(`predecessor_step_id`,''),`successor_work_item_id`,`successor_scope`,ifnull(`successor_step_id`,''),`type`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_predecessor_project` ON `external_dependency` (`predecessor_project_id`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_predecessor_work_item` ON `external_dependency` (`predecessor_work_item_id`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_predecessor_step` ON `external_dependency` (`predecessor_step_id`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_successor_project` ON `external_dependency` (`successor_project_id`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_successor_work_item` ON `external_dependency` (`successor_work_item_id`);
--> statement-breakpoint
CREATE INDEX `external_dependency_by_successor_step` ON `external_dependency` (`successor_step_id`);
--> statement-breakpoint
-- Proof: removing this trigger admitted its INSERT/UPDATE identity/key collision in `duplicates refuse across representations on insert and relevant update in both tables` (2026-10-22).
CREATE TRIGGER `typed_dependency_cross_identity_insert` BEFORE INSERT ON `typed_dependency`
WHEN EXISTS (SELECT 1 FROM `external_dependency` AS existing WHERE existing.id = NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency identity'); END;
--> statement-breakpoint
-- Proof: removing this trigger admitted its INSERT/UPDATE identity/key collision in `duplicates refuse across representations on insert and relevant update in both tables` (2026-10-22).
CREATE TRIGGER `typed_dependency_cross_endpoints_insert` BEFORE INSERT ON `typed_dependency`
WHEN EXISTS (SELECT 1 FROM `external_dependency` AS existing WHERE existing.predecessor_work_item_id = NEW.predecessor_work_item_id AND existing.predecessor_scope = NEW.predecessor_scope AND existing.successor_work_item_id = NEW.successor_work_item_id AND existing.successor_scope = NEW.successor_scope AND existing.type = NEW.type AND ifnull(existing.predecessor_step_id,'') = ifnull(NEW.predecessor_step_id,'') AND ifnull(existing.successor_step_id,'') = ifnull(NEW.successor_step_id,''))
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency endpoints'); END;
--> statement-breakpoint
-- Proof: removing this trigger admitted its INSERT/UPDATE identity/key collision in `duplicates refuse across representations on insert and relevant update in both tables` (2026-10-22).
CREATE TRIGGER `typed_dependency_cross_identity_update` BEFORE UPDATE OF id ON `typed_dependency`
WHEN EXISTS (SELECT 1 FROM `external_dependency` AS existing WHERE existing.id = NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency identity'); END;
--> statement-breakpoint
-- Proof: removing this trigger admitted its INSERT/UPDATE identity/key collision in `duplicates refuse across representations on insert and relevant update in both tables` (2026-10-22).
CREATE TRIGGER `typed_dependency_cross_endpoints_update` BEFORE UPDATE OF predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type,predecessor_step_id,successor_step_id ON `typed_dependency`
WHEN EXISTS (SELECT 1 FROM `external_dependency` AS existing WHERE existing.predecessor_work_item_id = NEW.predecessor_work_item_id AND existing.predecessor_scope = NEW.predecessor_scope AND existing.successor_work_item_id = NEW.successor_work_item_id AND existing.successor_scope = NEW.successor_scope AND existing.type = NEW.type AND ifnull(existing.predecessor_step_id,'') = ifnull(NEW.predecessor_step_id,'') AND ifnull(existing.successor_step_id,'') = ifnull(NEW.successor_step_id,''))
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency endpoints'); END;
--> statement-breakpoint
-- Proof: removing this trigger admitted its INSERT/UPDATE identity/key collision in `duplicates refuse across representations on insert and relevant update in both tables` (2026-10-22).
CREATE TRIGGER `external_dependency_cross_identity_insert` BEFORE INSERT ON `external_dependency`
WHEN EXISTS (SELECT 1 FROM `typed_dependency` AS existing WHERE existing.id = NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency identity'); END;
--> statement-breakpoint
-- Proof: removing this trigger admitted its INSERT/UPDATE identity/key collision in `duplicates refuse across representations on insert and relevant update in both tables` (2026-10-22).
CREATE TRIGGER `external_dependency_cross_endpoints_insert` BEFORE INSERT ON `external_dependency`
WHEN EXISTS (SELECT 1 FROM `typed_dependency` AS existing WHERE existing.predecessor_work_item_id = NEW.predecessor_work_item_id AND existing.predecessor_scope = NEW.predecessor_scope AND existing.successor_work_item_id = NEW.successor_work_item_id AND existing.successor_scope = NEW.successor_scope AND existing.type = NEW.type AND ifnull(existing.predecessor_step_id,'') = ifnull(NEW.predecessor_step_id,'') AND ifnull(existing.successor_step_id,'') = ifnull(NEW.successor_step_id,''))
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency endpoints'); END;
--> statement-breakpoint
-- Proof: removing this trigger admitted its INSERT/UPDATE identity/key collision in `duplicates refuse across representations on insert and relevant update in both tables` (2026-10-22).
CREATE TRIGGER `external_dependency_cross_identity_update` BEFORE UPDATE OF id ON `external_dependency`
WHEN EXISTS (SELECT 1 FROM `typed_dependency` AS existing WHERE existing.id = NEW.id)
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency identity'); END;
--> statement-breakpoint
-- Proof: removing this trigger admitted its INSERT/UPDATE identity/key collision in `duplicates refuse across representations on insert and relevant update in both tables` (2026-10-22).
CREATE TRIGGER `external_dependency_cross_endpoints_update` BEFORE UPDATE OF predecessor_work_item_id,predecessor_scope,successor_work_item_id,successor_scope,type,predecessor_step_id,successor_step_id ON `external_dependency`
WHEN EXISTS (SELECT 1 FROM `typed_dependency` AS existing WHERE existing.predecessor_work_item_id = NEW.predecessor_work_item_id AND existing.predecessor_scope = NEW.predecessor_scope AND existing.successor_work_item_id = NEW.successor_work_item_id AND existing.successor_scope = NEW.successor_scope AND existing.type = NEW.type AND ifnull(existing.predecessor_step_id,'') = ifnull(NEW.predecessor_step_id,'') AND ifnull(existing.successor_step_id,'') = ifnull(NEW.successor_step_id,''))
BEGIN SELECT RAISE(ABORT,'duplicate unified dependency endpoints'); END;
