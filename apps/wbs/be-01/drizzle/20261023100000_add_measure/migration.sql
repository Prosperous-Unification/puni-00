-- Measure definitions (`wbs-measure-budgets` D1, D2, task 1.1): one table of
-- what each organization estimates and records, seeded with the five
-- definitions `SEEDED_MEASURE_DEFINITIONS` in `@wbs/domain` lists. Additive:
-- a new table, two triggers on it and one on `organization`; no existing
-- column changes, and the outgoing release reads none of it.
--
-- `organization_id` is a column rather than an ownership side table: keys are
-- unique per organization, so `time` exists once in each, and a global root
-- with a legacy bridge would make the second organization's `time` collide.
-- Legacy access reads the legacy organization's definitions (design D9).
-- Definitions belong to their organization and go with it, so an
-- organization row deleted by hand is not held back by its own seed.
--
-- Seeding runs in SQL on both paths: the INSERTs below for organizations that
-- exist now, and `organization_seed_measures` for every organization inserted
-- later, inside the inserting statement's own transaction, whichever release
-- inserts it — blue and green share this file mid-swap (design D10).
--
-- `measure_one_scheduling` holds the one scheduling measure per organization
-- (D2) beneath the command's own `second_scheduling_measure` refusal;
-- `measure_shape_frozen` holds the key, owner, kind, scale and derived flag beneath
-- `measure_key_immutable` and `measure_shape_immutable` (design D13).
--
-- Proof: each CHECK replaced by `CHECK (1)`, each unique index made plain, the
-- frozen-shape trigger, the seeding INSERTs and the organization trigger each
-- removed alone failed its own case in store-sqlite
-- `measure-schema.db.test.ts`; watched 2026-10-23.
CREATE TABLE `measure` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organization`(`id`) ON DELETE CASCADE,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`kind` text NOT NULL,
	`scale` text NOT NULL,
	`three_point` integer NOT NULL,
	`show_by_default` integer NOT NULL,
	`schedules_work` integer NOT NULL,
	`derived` integer NOT NULL,
	`order` integer NOT NULL,
	`currency` text,
	`created_at` integer,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	CONSTRAINT `measure_key` CHECK (length(`key`) BETWEEN 1 AND 40 AND `key` GLOB '[a-z]*' AND `key` NOT GLOB '*[^a-z0-9_]*'),
	CONSTRAINT `measure_kind` CHECK (`kind` IN ('duration', 'count', 'money')),
	CONSTRAINT `measure_scale` CHECK (`scale` IN ('integer', 'real')),
	CONSTRAINT `measure_flags` CHECK (`three_point` IN (0, 1) AND `show_by_default` IN (0, 1) AND `schedules_work` IN (0, 1) AND `derived` IN (0, 1)),
	CONSTRAINT `measure_order` CHECK (typeof(`order`) = 'integer' AND `order` BETWEEN 0 AND 1000000),
	CONSTRAINT `measure_currency` CHECK ((`kind` = 'money') = (`currency` IS NOT NULL) AND (`currency` IS NULL OR (length(`currency`) = 3 AND `currency` NOT GLOB '*[^A-Z]*')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `measure_organization_key` ON `measure` (`organization_id`,`key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `measure_one_scheduling` ON `measure` (`organization_id`) WHERE `schedules_work` = 1;
--> statement-breakpoint
CREATE TRIGGER `measure_shape_frozen`
BEFORE UPDATE OF `key`, `organization_id`, `kind`, `scale`, `derived` ON `measure`
WHEN NEW.`key` IS NOT OLD.`key` OR NEW.`organization_id` IS NOT OLD.`organization_id`
	OR NEW.`kind` IS NOT OLD.`kind` OR NEW.`scale` IS NOT OLD.`scale`
	OR NEW.`derived` IS NOT OLD.`derived`
BEGIN
	SELECT RAISE(ABORT, 'measure key, organization, kind, scale and derived are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `organization_seed_measures`
AFTER INSERT ON `organization`
BEGIN
	INSERT INTO `measure` (`id`, `organization_id`, `key`, `name`, `unit`, `kind`, `scale`, `three_point`, `show_by_default`, `schedules_work`, `derived`, `order`, `currency`, `created_at`, `created_by`)
	VALUES (lower(hex(randomblob(16))), NEW.`id`, 'time', 'Time', 'days', 'duration', 'real', 1, 1, 1, 0, 1, NULL, NEW.`created_at`, NEW.`created_by`);
	INSERT INTO `measure` (`id`, `organization_id`, `key`, `name`, `unit`, `kind`, `scale`, `three_point`, `show_by_default`, `schedules_work`, `derived`, `order`, `currency`, `created_at`, `created_by`)
	VALUES (lower(hex(randomblob(16))), NEW.`id`, 'tokens', 'Tokens', 'tokens', 'count', 'integer', 1, 0, 0, 0, 2, NULL, NEW.`created_at`, NEW.`created_by`);
	INSERT INTO `measure` (`id`, `organization_id`, `key`, `name`, `unit`, `kind`, `scale`, `three_point`, `show_by_default`, `schedules_work`, `derived`, `order`, `currency`, `created_at`, `created_by`)
	VALUES (lower(hex(randomblob(16))), NEW.`id`, 'hours', 'Hours', 'hours', 'duration', 'real', 0, 0, 0, 0, 3, NULL, NEW.`created_at`, NEW.`created_by`);
	INSERT INTO `measure` (`id`, `organization_id`, `key`, `name`, `unit`, `kind`, `scale`, `three_point`, `show_by_default`, `schedules_work`, `derived`, `order`, `currency`, `created_at`, `created_by`)
	VALUES (lower(hex(randomblob(16))), NEW.`id`, 'cost', 'Cost', 'micro-USD', 'money', 'integer', 1, 0, 0, 0, 4, 'USD', NEW.`created_at`, NEW.`created_by`);
	INSERT INTO `measure` (`id`, `organization_id`, `key`, `name`, `unit`, `kind`, `scale`, `three_point`, `show_by_default`, `schedules_work`, `derived`, `order`, `currency`, `created_at`, `created_by`)
	VALUES (lower(hex(randomblob(16))), NEW.`id`, 'agent_minutes', 'Agent minutes', 'minutes', 'duration', 'integer', 0, 0, 0, 1, 5, NULL, NEW.`created_at`, NEW.`created_by`);
END;
--> statement-breakpoint
INSERT INTO `measure` (`id`, `organization_id`, `key`, `name`, `unit`, `kind`, `scale`, `three_point`, `show_by_default`, `schedules_work`, `derived`, `order`, `currency`, `created_at`, `created_by`)
SELECT lower(hex(randomblob(16))), `id`, 'time', 'Time', 'days', 'duration', 'real', 1, 1, 1, 0, 1, NULL, `created_at`, `created_by`
FROM `organization`;
--> statement-breakpoint
INSERT INTO `measure` (`id`, `organization_id`, `key`, `name`, `unit`, `kind`, `scale`, `three_point`, `show_by_default`, `schedules_work`, `derived`, `order`, `currency`, `created_at`, `created_by`)
SELECT lower(hex(randomblob(16))), `id`, 'tokens', 'Tokens', 'tokens', 'count', 'integer', 1, 0, 0, 0, 2, NULL, `created_at`, `created_by`
FROM `organization`;
--> statement-breakpoint
INSERT INTO `measure` (`id`, `organization_id`, `key`, `name`, `unit`, `kind`, `scale`, `three_point`, `show_by_default`, `schedules_work`, `derived`, `order`, `currency`, `created_at`, `created_by`)
SELECT lower(hex(randomblob(16))), `id`, 'hours', 'Hours', 'hours', 'duration', 'real', 0, 0, 0, 0, 3, NULL, `created_at`, `created_by`
FROM `organization`;
--> statement-breakpoint
INSERT INTO `measure` (`id`, `organization_id`, `key`, `name`, `unit`, `kind`, `scale`, `three_point`, `show_by_default`, `schedules_work`, `derived`, `order`, `currency`, `created_at`, `created_by`)
SELECT lower(hex(randomblob(16))), `id`, 'cost', 'Cost', 'micro-USD', 'money', 'integer', 1, 0, 0, 0, 4, 'USD', `created_at`, `created_by`
FROM `organization`;
--> statement-breakpoint
INSERT INTO `measure` (`id`, `organization_id`, `key`, `name`, `unit`, `kind`, `scale`, `three_point`, `show_by_default`, `schedules_work`, `derived`, `order`, `currency`, `created_at`, `created_by`)
SELECT lower(hex(randomblob(16))), `id`, 'agent_minutes', 'Agent minutes', 'minutes', 'duration', 'integer', 0, 0, 0, 1, 5, NULL, `created_at`, `created_by`
FROM `organization`;
