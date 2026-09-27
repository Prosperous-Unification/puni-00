-- The durable organization activation marker (task 2.6 of
-- `organization-ownership-and-access`): one row saying whether organization
-- isolation was enabled on this database.
--
-- **Inert on arrival.** It is seeded `pre_activation` and nothing in this
-- release writes it. Bridge triggers (task 2.1) read it to switch themselves
-- off, and activation (task 7.1) is the only planned writer.
--
-- **A present row, never an absent one.** Absence of the table or the row is
-- broken trusted state, which `readOrganizationActivation` refuses; it is not
-- a spelling of "not activated". The singleton key and the two CHECKs make
-- every other shape unwritable.
--
-- **Activation is permanent.** Once `activated`, the row can be neither
-- updated nor deleted, so a later deletion of every second-organization row
-- still leaves the marker. No second row can be inserted at all: the primary
-- key alone would let `INSERT OR REPLACE` or an upsert replace the activated
-- row, and SQLite fires delete triggers for a replacement only with
-- `recursive_triggers` on. Nothing here activates; only fixtures and the future
-- activation transaction (task 7.1) write `activated`.
--
-- Proof, each fault applied alone, observed 2026-09-27 in
-- `organization-activation.db.test.ts`: dropping the seed failed 15 cases
-- including `reads the seeded marker as pre-activation`; dropping the state,
-- singleton, integer-time or consistency CHECK failed `refuses an unknown
-- state`, `refuses a wrong singleton`, `refuses a text time` and `refuses
-- activation without a time`; `WHEN 0` on `organization_activation_no_delete`,
-- `_no_revert` and `_single_row` failed `keeps an activated marker permanent
-- against` delete, reset and timestamp change, and replacement.
CREATE TABLE `organization_activation` (
	`singleton` integer PRIMARY KEY NOT NULL CHECK (`singleton` = 1),
	`state` text NOT NULL CHECK (`state` IN ('pre_activation', 'activated')),
	`activated_at` integer CHECK (`activated_at` IS NULL OR typeof(`activated_at`) = 'integer'),
	CHECK ((`state` = 'activated') = (`activated_at` IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `organization_activation` (`singleton`, `state`, `activated_at`) VALUES (1, 'pre_activation', NULL);
--> statement-breakpoint
CREATE TRIGGER `organization_activation_no_delete`
BEFORE DELETE ON `organization_activation`
WHEN OLD.`state` = 'activated'
BEGIN
	SELECT RAISE(ABORT, 'organization isolation is activated; the marker is permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `organization_activation_no_revert`
BEFORE UPDATE ON `organization_activation`
WHEN OLD.`state` = 'activated'
BEGIN
	SELECT RAISE(ABORT, 'organization isolation is activated; the marker is permanent');
END;
--> statement-breakpoint
CREATE TRIGGER `organization_activation_single_row`
BEFORE INSERT ON `organization_activation`
WHEN (SELECT COUNT(*) FROM `organization_activation`) > 0
BEGIN
	SELECT RAISE(ABORT, 'organization activation marker already exists');
END;
