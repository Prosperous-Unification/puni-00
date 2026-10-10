-- Additive: the journal position, the applied-event mirror and erasure state are new columns and
-- tables an older release never names. The content fences bind every release that opens this file.
ALTER TABLE retention_journal_position ADD COLUMN journal_id TEXT;
ALTER TABLE retention_journal_position ADD COLUMN applied_hash TEXT NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';
ALTER TABLE retention_journal_position ADD COLUMN head_version_id TEXT;
ALTER TABLE retention_journal_position ADD COLUMN head_sequence_seen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE retention_journal_position ADD COLUMN state TEXT NOT NULL DEFAULT 'detached' CHECK(state IN ('detached', 'attached', 'forked'));
ALTER TABLE retention_subject ADD COLUMN classification_evidence TEXT;
ALTER TABLE retention_subject ADD COLUMN classification_actor TEXT;
ALTER TABLE retention_subject ADD COLUMN classification_at INTEGER;
ALTER TABLE retention_subject ADD COLUMN classification_sequence INTEGER;
ALTER TABLE retention_subject ADD COLUMN erasure_state TEXT NOT NULL DEFAULT 'none' CHECK(erasure_state IN ('none', 'fenced', 'erased'));
ALTER TABLE retention_subject ADD COLUMN erasure_sequence INTEGER;
ALTER TABLE retention_subject ADD COLUMN erased_at INTEGER;
-- Proof: without this trigger, the erased-is-final schema test moved an erased subject back to none.
CREATE TRIGGER retention_subject_erasure_final
BEFORE UPDATE OF erasure_state, erasure_sequence, erased_at ON retention_subject
WHEN OLD.erasure_state = 'erased'
BEGIN
  SELECT RAISE(ABORT, 'retention erasure is final');
END;
CREATE TABLE retention_journal_applied (
  sequence INTEGER PRIMARY KEY CHECK(sequence > 0),
  hash TEXT NOT NULL,
  event_type TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
-- Proof: without either trigger, the append-only mirror test rewrote or deleted an applied event.
CREATE TRIGGER retention_journal_applied_no_update
BEFORE UPDATE ON retention_journal_applied
BEGIN
  SELECT RAISE(ABORT, 'retention journal mirror is append-only');
END;
CREATE TRIGGER retention_journal_applied_no_delete
BEFORE DELETE ON retention_journal_applied
BEGIN
  SELECT RAISE(ABORT, 'retention journal mirror is append-only');
END;
-- Content fences: a fenced or erased subject refuses every content insert, and every update that
-- would leave nonblank content, so the eraser's blanking passes and nothing else does.
-- Proof: dropping any one fence failed that table's case in the older-binary fence test; a fence
-- `WHEN 0` kept the blanking case green and failed the refusal case.
CREATE TRIGGER retention_fence_software_request_insert
BEFORE INSERT ON software_request
WHEN EXISTS (SELECT 1 FROM retention_subject WHERE subject_kind = 'software_request' AND subject_id = NEW.id AND erasure_state <> 'none')
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_software_request_update
BEFORE UPDATE OF description, brief ON software_request
WHEN (trim(NEW.description, char(9, 10, 11, 12, 13, 32)) <> '' OR trim(NEW.brief, char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject WHERE subject_kind = 'software_request' AND subject_id = NEW.id AND erasure_state <> 'none')
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_intake_draft_insert
BEFORE INSERT ON intake_draft
WHEN EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = NEW.id)) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = NEW.id))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_intake_draft_update
BEFORE UPDATE OF description, brief ON intake_draft
WHEN (trim(NEW.description, char(9, 10, 11, 12, 13, 32)) <> '' OR trim(NEW.brief, char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = NEW.id)) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = NEW.id))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_proposal_submission_insert
BEFORE INSERT ON proposal_submission
WHEN EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = NEW.draft_id)) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = NEW.draft_id))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_proposal_submission_update
BEFORE UPDATE OF brief, email ON proposal_submission
WHEN (trim(NEW.brief, char(9, 10, 11, 12, 13, 32)) <> '' OR trim(NEW.email, char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = NEW.draft_id)) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = NEW.draft_id))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_chat_turn_insert
BEFORE INSERT ON chat_turn
WHEN EXISTS (SELECT 1 FROM retention_subject WHERE subject_kind = 'software_request' AND subject_id = NEW.request_id AND erasure_state <> 'none')
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_chat_turn_update
BEFORE UPDATE OF content ON chat_turn
WHEN (trim(NEW.content, char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject WHERE subject_kind = 'software_request' AND subject_id = NEW.request_id AND erasure_state <> 'none')
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_chat_operation_insert
BEFORE INSERT ON chat_operation
WHEN EXISTS (SELECT 1 FROM retention_subject WHERE subject_kind = 'software_request' AND subject_id = NEW.request_id AND erasure_state <> 'none')
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_chat_operation_update
BEFORE UPDATE OF message, reply ON chat_operation
WHEN (trim(NEW.message, char(9, 10, 11, 12, 13, 32)) <> '' OR trim(coalesce(NEW.reply, ''), char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject WHERE subject_kind = 'software_request' AND subject_id = NEW.request_id AND erasure_state <> 'none')
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_request_concept_preview_insert
BEFORE INSERT ON request_concept_preview
WHEN EXISTS (SELECT 1 FROM retention_subject WHERE subject_kind = 'software_request' AND subject_id = NEW.request_id AND erasure_state <> 'none')
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_request_concept_preview_update
BEFORE UPDATE OF body ON request_concept_preview
WHEN (trim(NEW.body, char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject WHERE subject_kind = 'software_request' AND subject_id = NEW.request_id AND erasure_state <> 'none')
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_conversation_turn_insert
BEFORE INSERT ON conversation_turn
WHEN EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = (SELECT draft_id FROM conversation WHERE id = NEW.conversation_id))) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = (SELECT draft_id FROM conversation WHERE id = NEW.conversation_id)))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_conversation_turn_update
BEFORE UPDATE OF content ON conversation_turn
WHEN (trim(NEW.content, char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = (SELECT draft_id FROM conversation WHERE id = NEW.conversation_id))) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = (SELECT draft_id FROM conversation WHERE id = NEW.conversation_id)))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_conversation_operation_insert
BEFORE INSERT ON conversation_operation
WHEN EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = (SELECT draft_id FROM conversation WHERE id = NEW.conversation_id))) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = (SELECT draft_id FROM conversation WHERE id = NEW.conversation_id)))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_conversation_operation_update
BEFORE UPDATE OF message, reply ON conversation_operation
WHEN (trim(NEW.message, char(9, 10, 11, 12, 13, 32)) <> '' OR trim(coalesce(NEW.reply, ''), char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = (SELECT draft_id FROM conversation WHERE id = NEW.conversation_id))) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = (SELECT draft_id FROM conversation WHERE id = NEW.conversation_id)))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_account_request_insert
BEFORE INSERT ON account_request
WHEN EXISTS (SELECT 1 FROM retention_subject AS fence JOIN software_request AS request ON request.id = fence.subject_id WHERE fence.subject_kind = 'software_request' AND fence.erasure_state <> 'none' AND request.account_id = NEW.account_id)
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_account_request_update
BEFORE UPDATE OF description, brief ON account_request
WHEN (trim(NEW.description, char(9, 10, 11, 12, 13, 32)) <> '' OR trim(NEW.brief, char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject AS fence JOIN software_request AS request ON request.id = fence.subject_id WHERE fence.subject_kind = 'software_request' AND fence.erasure_state <> 'none' AND request.account_id = NEW.account_id)
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_concept_preview_insert
BEFORE INSERT ON concept_preview
WHEN EXISTS (SELECT 1 FROM retention_subject AS fence JOIN software_request AS request ON request.id = fence.subject_id WHERE fence.subject_kind = 'software_request' AND fence.erasure_state <> 'none' AND request.account_id = NEW.account_id)
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
CREATE TRIGGER retention_fence_concept_preview_update
BEFORE UPDATE OF body ON concept_preview
WHEN (trim(NEW.body, char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject AS fence JOIN software_request AS request ON request.id = fence.subject_id WHERE fence.subject_kind = 'software_request' AND fence.erasure_state <> 'none' AND request.account_id = NEW.account_id)
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
