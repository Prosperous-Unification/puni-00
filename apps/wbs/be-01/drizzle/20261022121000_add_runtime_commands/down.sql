-- Proof: P21 removed refusal; rollbackTo dropped retained runtime history. P22-P25/P38-P42 removed each row/count/marker clause and its isolated rollback negative succeeded.
CREATE TABLE runtime_history_down_guard (violations INTEGER NOT NULL CONSTRAINT "runtime history must be empty" CHECK (violations = 0));
--> statement-breakpoint
INSERT INTO runtime_history_down_guard SELECT CASE WHEN
  (SELECT count(*) FROM runtime_ledger) = 1
  AND (SELECT count(*) FROM runtime_ledger WHERE id = 1 AND schema_version = 1 AND typeof(ledger_id) = 'text' AND length(ledger_id) > 0 AND authority_count = 0 AND binding_count = 0 AND receipt_count = 0) = 1
  AND (SELECT count(*) FROM runtime_authority) = 0
  AND (SELECT count(*) FROM runtime_claim_binding) = 0
  AND (SELECT count(*) FROM runtime_command_receipt) = 0
THEN 0 ELSE 1 END;
--> statement-breakpoint
DROP TABLE runtime_history_down_guard;
--> statement-breakpoint
DROP TABLE runtime_command_receipt;
--> statement-breakpoint
DROP TABLE runtime_claim_binding;
--> statement-breakpoint
DROP TABLE runtime_authority;
--> statement-breakpoint
DROP TABLE runtime_ledger;
