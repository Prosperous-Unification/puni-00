-- Proof: bypassing completion refusal lost its named error; bypassing approval refusal changed the migration ledger before the older guard refused.
CREATE TEMP TABLE `shared_people_restore_receipt_down_check` (
  `completion_empty` integer NOT NULL,
  `approval_empty` integer NOT NULL,
  CONSTRAINT "shared people restore completion evidence is recorded: rollback cannot discard receipts" CHECK (`completion_empty` = 1),
  CONSTRAINT "shared people restore evidence is recorded: rollback cannot discard approvals" CHECK (`approval_empty` = 1)
);
--> statement-breakpoint
INSERT INTO `shared_people_restore_receipt_down_check` (`completion_empty`, `approval_empty`)
SELECT (SELECT COUNT(*) FROM `shared_people_restore_receipt`) = 0 AND (SELECT COUNT(*) FROM `shared_people_restore_consumption`) = 0,
       (SELECT COUNT(*) FROM `shared_people_restore_operation`) = 0 AND (SELECT COUNT(*) FROM `shared_people_restore_approval`) = 0;
--> statement-breakpoint
DROP TABLE `shared_people_restore_receipt_down_check`;
--> statement-breakpoint
DROP TABLE `shared_people_restore_consumption`;
--> statement-breakpoint
DROP TABLE `shared_people_restore_receipt`;
--> statement-breakpoint
DROP INDEX `shared_people_restore_approval_binding`;
--> statement-breakpoint
DROP INDEX `shared_people_restore_operation_digest`;
