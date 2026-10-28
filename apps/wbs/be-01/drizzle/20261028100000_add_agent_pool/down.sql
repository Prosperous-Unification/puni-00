-- Reverses `20261028100000_add_agent_pool`.
--
-- A pool's credentials are live keys an operator handed out, and a pool row
-- is the only record of which keys one act issued: the first statement fails
-- its CHECK while any pool exists, and the runner reverts this script and its
-- ledger row in one transaction. Revoked pools count too: dropping their rows
-- would leave revoked keys that no longer say which pool they ended with.
--
-- Proof: with the guard's count replaced by `0 = 0`, `refuses rollback while
-- a pool exists, keeping it` (agent-pool-migration.db.test.ts) saw exit 0 and
-- the pool dropped; watched 2026-10-28.
CREATE TEMP TABLE `agent_pool_down_check` (
	`empty` integer NOT NULL,
	CONSTRAINT "agent pools exist: a rollback never forgets which keys a pool issued" CHECK (`empty` = 1)
);
--> statement-breakpoint
INSERT INTO `agent_pool_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `agent_pool`) = 0;
--> statement-breakpoint
DROP TABLE `agent_pool_down_check`;
--> statement-breakpoint
DROP INDEX `machine_credential_agent_pool`;
--> statement-breakpoint
ALTER TABLE `machine_credential` DROP COLUMN `agent_pool_id`;
--> statement-breakpoint
DROP INDEX `agent_pool_organization`;
--> statement-breakpoint
DROP INDEX `agent_pool_live_name`;
--> statement-breakpoint
DROP TABLE `agent_pool`;
