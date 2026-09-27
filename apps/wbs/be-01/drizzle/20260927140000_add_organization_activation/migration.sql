-- The durable organization activation marker (task 2.6): one row that is
-- `pre_activation` until activation (task 7.1) makes it `activated` for good.
-- Absence or any other shape is broken trusted state, never "not activated";
-- `readOrganizationActivation` refuses it. Nothing in this release writes it.
--
-- Proof: dropping the state, singleton, integer-time or consistency CHECK alone
-- failed `refuses an unknown state`, `refuses a wrong singleton`, `refuses a
-- text time` or `refuses activation without a time` in
-- `organization-activation.db.test.ts`. Observed 2026-09-27.
CREATE TABLE `organization_activation` (
	`singleton` integer PRIMARY KEY NOT NULL CHECK (`singleton` = 1),
	`state` text NOT NULL CHECK (`state` IN ('pre_activation', 'activated')),
	`activated_at` integer CHECK (`activated_at` IS NULL OR typeof(`activated_at`) = 'integer'),
	CHECK ((`state` = 'activated') = (`activated_at` IS NOT NULL))
);
--> statement-breakpoint
-- Proof: without this seed 15 cases failed, including `reads the seeded marker
-- as pre-activation`. Observed 2026-09-27.
INSERT INTO `organization_activation` (`singleton`, `state`, `activated_at`) VALUES (1, 'pre_activation', NULL);
--> statement-breakpoint
-- Proof: `WHEN 0` failed `keeps an activated marker permanent against delete`.
-- Observed 2026-09-27.
CREATE TRIGGER `organization_activation_no_delete`
BEFORE DELETE ON `organization_activation`
WHEN OLD.`state` = 'activated'
BEGIN
	SELECT RAISE(ABORT, 'organization isolation is activated; the marker is permanent');
END;
--> statement-breakpoint
-- Proof: `WHEN 0` failed `keeps an activated marker permanent against reset`
-- and `against timestamp change`. Observed 2026-09-27.
CREATE TRIGGER `organization_activation_no_revert`
BEFORE UPDATE ON `organization_activation`
WHEN OLD.`state` = 'activated'
BEGIN
	SELECT RAISE(ABORT, 'organization isolation is activated; the marker is permanent');
END;
--> statement-breakpoint
-- The primary key alone lets `INSERT OR REPLACE` replace the activated row, and
-- SQLite fires delete triggers for a replacement only with `recursive_triggers`.
-- Proof: `WHEN 0` failed `keeps an activated marker permanent against
-- replacement`. Observed 2026-09-27.
CREATE TRIGGER `organization_activation_single_row`
BEFORE INSERT ON `organization_activation`
WHEN (SELECT COUNT(*) FROM `organization_activation`) > 0
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker already exists');
END;
