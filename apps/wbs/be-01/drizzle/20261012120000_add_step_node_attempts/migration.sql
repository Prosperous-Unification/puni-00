-- Attempts at step nodes (`step-node-attempts`, ADR 0045): one row per run at
-- a step node's work, numbered from 1 per node and never pruned. Running is one
-- state, `ended_at` and `outcome` both null, and an end before its start is
-- unstorable. The partial unique index holds at most one running attempt per
-- node, so the `409 attempt_running` refusal is the modeled face of a
-- constraint the database also holds. The outcome vocabulary is
-- `ATTEMPT_OUTCOMES` in `@wbs/domain`.
--
-- `work_item_id` cascades for the swap window, as `step_progress` does: the
-- outgoing release's plain `DELETE FROM work_item` must not meet a constraint
-- it cannot see. `step_id` does not, as no step satellite does. The executor
-- is set null when its person goes: the attempt is history and outlives them.
--
-- `project.timezone` is the zone every day derived from an instant is read
-- in. NOT NULL with a default, and that is what makes it additive: the
-- outgoing colour's INSERT names no zone and its project reads `UTC`, which is
-- the day every reading had before.
--
-- Proof, observed 2026-10-12 in `step-node-attempt-migration.db.test.ts` and
-- `step-node-attempt.db.test.ts`: `step_node_attempt_running_state` dropped
-- made `refuses an outcome without an end and an end without an outcome` store
-- the row; `step_node_attempt_running` dropped made `lets one of two
-- concurrent starts win and tells the other attempt_running` read
-- `["started", "started"]`, two running rows.
CREATE TABLE `step_node_attempt` (
	`work_item_id` text NOT NULL REFERENCES `work_item`(`id`) ON DELETE CASCADE,
	`step_id` text NOT NULL REFERENCES `step`(`id`),
	`attempt_number` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`outcome` text,
	`executor_person_id` text REFERENCES `person`(`id`) ON DELETE SET NULL,
	`reference` text,
	`note` text,
	`created_at` integer,
	`updated_at` integer,
	`created_by` text REFERENCES `users`(`id`),
	PRIMARY KEY (`work_item_id`, `step_id`, `attempt_number`),
	CONSTRAINT `step_node_attempt_number` CHECK (`attempt_number` >= 1),
	CONSTRAINT `step_node_attempt_outcome` CHECK (`outcome` IN ('succeeded', 'failed', 'cancelled')),
	CONSTRAINT `step_node_attempt_running_state` CHECK ((`ended_at` IS NULL) = (`outcome` IS NULL)),
	CONSTRAINT `step_node_attempt_order` CHECK (`ended_at` IS NULL OR `ended_at` >= `started_at`)
);
--> statement-breakpoint
CREATE INDEX `step_node_attempt_by_step` ON `step_node_attempt` (`step_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `step_node_attempt_running` ON `step_node_attempt` (`work_item_id`, `step_id`) WHERE `ended_at` IS NULL;
--> statement-breakpoint
ALTER TABLE `project` ADD `timezone` text DEFAULT 'UTC' NOT NULL;
