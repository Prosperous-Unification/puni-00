CREATE TEMP TABLE accepted_plan_reference_down_check (
  history_rows INTEGER NOT NULL,
  initial_policy INTEGER NOT NULL,
  CONSTRAINT "accepted plan reference history exists; preserve its immutable records and roll forward" CHECK (history_rows = 0),
  CONSTRAINT "the protected acceptance policy differs from its initial empty row; preserve it and roll forward" CHECK (initial_policy = 1)
);
--> statement-breakpoint
INSERT INTO accepted_plan_reference_down_check (history_rows, initial_policy)
SELECT
  -- Proof: Substituting zero for the history count made "retains the full schema and migration
  -- ledger when rollback encounters retained history" fail. The faulted fixture returned the
  -- candidate migration from rollback where the fixture expected the history refusal.
  (SELECT count(*) FROM accepted_plan_reference),
  -- Proof: Substituting one for the initial-policy count made "retains the full schema and
  -- migration ledger when rollback encounters changed protected policy" and one other named case
  -- fail. The faulted fixtures returned the candidate migration from rollback where the
  -- changed-policy and missing-policy cases expected refusal.
  -- Proof: Ignoring changed grants at the original revision made "retains the full schema and
  -- migration ledger when rollback encounters changed grants at the migration-owned revision" fail.
  -- The faulted fixture returned the candidate migration from rollback where the fixture expected
  -- the protected-policy refusal.
  -- Proof: Counting only the pristine row made "refuses rollback when an extra policy row
  -- accompanies the pristine policy" return from rollback instead of refusing.
  (SELECT count(*) FROM accepted_plan_reference_policy) = 1 AND
  (SELECT count(*) FROM accepted_plan_reference_policy WHERE singleton = 1 AND revision = 1 AND grants = '[]') = 1;
--> statement-breakpoint
DROP TABLE accepted_plan_reference_down_check;
--> statement-breakpoint
DROP TABLE accepted_plan_reference;
--> statement-breakpoint
DROP TABLE accepted_plan_reference_policy;
