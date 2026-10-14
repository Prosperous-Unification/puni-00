CREATE TEMP TABLE step_blockage_activation_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "step blockage facts or blockage-aware journal remain; stopped-writer recovery integration required; see docs/runbook-prod-deploy.md#step-blockage-rollback" CHECK (rows = 0)
);
--> statement-breakpoint
-- Proof: fact count omitted; retained-fact down negative lost authority/ledger.
-- Forward/inverse/precondition history branches omitted separately; each retained-history
-- down negative lost authority/ledger, including empty snapshots (2026-10-14).
INSERT INTO step_blockage_activation_rollback_guard
SELECT (SELECT count(*) FROM step_blockage) + (
  SELECT count(*) FROM command_journal journal
  WHERE EXISTS (
    SELECT 1 FROM json_tree(journal.payload) node
    WHERE (node.key = 'do' AND node.value = 'replace_blockage')
      OR node.key IN ('deletionState', 'expectedProgress')
  ) OR EXISTS (
    SELECT 1 FROM json_tree(journal.inverse) node
    WHERE (node.key = 'do' AND node.value = 'replace_blockage')
      OR node.key IN ('deletionState', 'expectedProgress')
  ) OR EXISTS (
    SELECT 1 FROM json_tree(journal.preconditions) node WHERE node.key = 'moveProgress'
  )
);
--> statement-breakpoint
DROP TABLE step_blockage_activation_rollback_guard;
--> statement-breakpoint
DROP TRIGGER step_blockage_admit_delete;
--> statement-breakpoint
DROP TRIGGER step_blockage_admit_update;
--> statement-breakpoint
DROP TRIGGER step_blockage_admit_insert;
--> statement-breakpoint
DROP TABLE step_blockage_activation;
