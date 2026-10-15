CREATE TEMP TABLE step_blockage_receipt_rollback_guard (
  admitted INTEGER NOT NULL,
  CONSTRAINT "step blockage activation receipt retained or authority invalid; attended recovery required" CHECK (admitted = 1)
);
--> statement-breakpoint
-- Proof: singleton, disabled-state and receipt-count predicates removed separately; duplicate-marker, enabled-without-receipt and disabled-receipt down negatives lost schema/ledger (2026-10-15).
INSERT INTO step_blockage_receipt_rollback_guard
SELECT CASE WHEN
  (SELECT count(*) FROM step_blockage_activation) = 1
  AND EXISTS (SELECT 1 FROM step_blockage_activation WHERE id = 1 AND state = 'DISABLED')
  AND (SELECT count(*) FROM step_blockage_activation_receipt) = 0
THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE step_blockage_receipt_rollback_guard;
--> statement-breakpoint
DROP TABLE step_blockage_activation_receipt;
