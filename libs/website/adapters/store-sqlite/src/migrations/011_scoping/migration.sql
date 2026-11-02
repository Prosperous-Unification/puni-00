-- Proof: disabling SQLite CHECK constraints failed each schema-invalid-write fixture for version,
-- start intent, revision, reference/candidate length, invitation state and operation reply version.
ALTER TABLE intake_draft ADD COLUMN scoping_version INTEGER CHECK(scoping_version IS NULL OR scoping_version = 1);
ALTER TABLE intake_draft ADD COLUMN start_conversation INTEGER CHECK(start_conversation IS NULL OR start_conversation IN (0, 1));
ALTER TABLE intake_draft ADD COLUMN starting_choice TEXT;
ALTER TABLE conversation_operation ADD COLUMN reply_version INTEGER CHECK(reply_version IS NULL OR reply_version = 1);
-- Proof: a nullable primary key let the null-owner fixture orphan scoping text; removing the
-- safe-integer revision ceiling let a reply persist an unreadable revision in the exhaustion fixture.
CREATE TABLE draft_scoping (
  draft_id TEXT PRIMARY KEY NOT NULL REFERENCES intake_draft(id) ON DELETE CASCADE,
  question_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0 AND revision <= 9007199254740991),
  reference_text TEXT CHECK(reference_text IS NULL OR length(reference_text) <= 4000),
  candidate_brief TEXT CHECK(candidate_brief IS NULL OR length(candidate_brief) <= 4000),
  email_invitation_declined INTEGER NOT NULL DEFAULT 0 CHECK(email_invitation_declined IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  first_content_at INTEGER
);
-- Proof: disabling this trigger let both ownership fixtures move text to another draft.
CREATE TRIGGER scoping_owner_immutable
BEFORE UPDATE OF draft_id ON draft_scoping
WHEN NEW.draft_id <> OLD.draft_id
BEGIN
  SELECT RAISE(ABORT, 'scoping owner is immutable');
END;
-- Proof: disabling this fence admitted inserted text for both fenced subject ownership paths.
CREATE TRIGGER retention_fence_draft_scoping_insert
BEFORE INSERT ON draft_scoping
WHEN EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = NEW.draft_id)) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = NEW.draft_id))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
-- Proof: disabling this fence let both erasure fixtures restore reference and candidate sentinels.
CREATE TRIGGER retention_fence_draft_scoping_update
BEFORE UPDATE OF reference_text, candidate_brief ON draft_scoping
WHEN (trim(coalesce(NEW.reference_text, ''), char(9, 10, 11, 12, 13, 32)) <> '' OR trim(coalesce(NEW.candidate_brief, ''), char(9, 10, 11, 12, 13, 32)) <> '') AND EXISTS (SELECT 1 FROM retention_subject AS fence WHERE fence.erasure_state <> 'none' AND ((fence.subject_kind = 'software_request' AND fence.subject_id IN (SELECT id FROM software_request WHERE draft_id = NEW.draft_id)) OR (fence.subject_kind = 'proposal_submission' AND fence.subject_id IN (SELECT id FROM proposal_submission WHERE draft_id = NEW.draft_id))))
BEGIN
  SELECT RAISE(ABORT, 'retention: subject content is fenced');
END;
