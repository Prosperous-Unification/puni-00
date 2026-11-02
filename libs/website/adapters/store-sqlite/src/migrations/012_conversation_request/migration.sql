-- Proof: removing this CHECK admitted the 13,001-character serialization fixture.
ALTER TABLE conversation_operation ADD COLUMN request_json TEXT CHECK(request_json IS NULL OR length(request_json) <= 13000);
-- Proof: disabling this update fence restored raw text for both subject owners; disabling 010's existing operation-insert fence admitted the matching inserted payloads.
CREATE TRIGGER retention_fence_conversation_request_update
BEFORE UPDATE OF request_json ON conversation_operation
WHEN NEW.request_json IS NOT NULL AND EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = (SELECT draft_id FROM conversation WHERE id = NEW.conversation_id))) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = (SELECT draft_id FROM conversation WHERE id = NEW.conversation_id)))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
-- Proof: disabling this trigger moved raw input into another conversation; the ownership fixture also observed move-then-restore after payload erasure with a conditional fence.
CREATE TRIGGER conversation_request_owner_immutable
BEFORE UPDATE OF conversation_id ON conversation_operation
WHEN NEW.conversation_id <> OLD.conversation_id
BEGIN
  SELECT RAISE(ABORT, 'conversation request owner is immutable');
END;
-- Proof: disabling this trigger moved the conversation into another unfenced draft in the ownership fixture.
CREATE TRIGGER conversation_draft_immutable
BEFORE UPDATE OF draft_id ON conversation
WHEN NEW.draft_id <> OLD.draft_id
BEGIN
  SELECT RAISE(ABORT, 'conversation draft is immutable');
END;
