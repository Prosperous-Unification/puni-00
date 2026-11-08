-- Proof: removing this precondition discarded the sole retained charge in the orphaned-financial-record rollback test.
CREATE TEMP TABLE paid_attempt_rollback_requirement (orphaned INTEGER NOT NULL CHECK(orphaned = 0));
INSERT INTO paid_attempt_rollback_requirement
SELECT EXISTS (
  SELECT 1 FROM paid_attempt AS charge WHERE
    (charge.origin = 'conversation' AND NOT EXISTS (SELECT 1 FROM conversation_operation WHERE id = charge.operation_id)) OR
    (charge.origin = 'provider' AND NOT EXISTS (SELECT 1 FROM provider_call WHERE id = charge.operation_id))
);
DROP TABLE paid_attempt_rollback_requirement;
DROP TRIGGER paid_attempt_retained_provider_delete;
DROP TRIGGER paid_attempt_retained_operation_delete;
DROP TABLE testing_conversation;
DROP TABLE testing_allowance;
DROP TRIGGER paid_attempt_provider_update;
DROP TRIGGER paid_attempt_provider_insert;
DROP TRIGGER paid_attempt_conversation_update;
DROP TRIGGER paid_attempt_conversation_insert;
DROP TABLE paid_attempt;
DROP TABLE intake_draft_browser;
DROP TABLE browser_claim;
