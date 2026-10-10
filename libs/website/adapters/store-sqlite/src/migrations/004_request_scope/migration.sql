CREATE TABLE software_request (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES prospect_account(id),
  draft_id TEXT UNIQUE REFERENCES intake_draft(id),
  description TEXT NOT NULL,
  brief TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  submitted_at INTEGER,
  inactive_at INTEGER
);
CREATE UNIQUE INDEX software_request_active_account ON software_request(account_id) WHERE submitted_at IS NULL AND inactive_at IS NULL;
INSERT INTO software_request (id, account_id, draft_id, description, brief, created_at, submitted_at)
  SELECT COALESCE(draft_id, lower(hex(randomblob(16)))), account_id, draft_id, description, brief, created_at, submitted_at FROM account_request;
INSERT INTO software_request (id, account_id, description, brief, created_at)
  SELECT lower(hex(randomblob(16))), prospect_account.id, '', '', prospect_account.created_at FROM prospect_account
  WHERE NOT EXISTS (SELECT 1 FROM account_request WHERE account_request.account_id = prospect_account.id);
ALTER TABLE chat_turn ADD COLUMN request_id TEXT REFERENCES software_request(id);
UPDATE chat_turn SET request_id = (SELECT id FROM software_request WHERE software_request.account_id = chat_turn.account_id ORDER BY created_at DESC LIMIT 1);
CREATE INDEX chat_turn_request ON chat_turn(request_id, created_at);
CREATE TABLE request_concept_preview (
  request_id TEXT PRIMARY KEY REFERENCES software_request(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revisions INTEGER NOT NULL DEFAULT 0
);
INSERT INTO request_concept_preview (request_id, body, created_at, revisions)
  SELECT software_request.id, concept_preview.body, concept_preview.created_at, concept_preview.revisions
  FROM concept_preview JOIN software_request ON software_request.account_id = concept_preview.account_id
  WHERE software_request.id = (SELECT id FROM software_request AS latest WHERE latest.account_id = concept_preview.account_id ORDER BY created_at DESC LIMIT 1);
ALTER TABLE provider_call ADD COLUMN request_id TEXT REFERENCES software_request(id);
UPDATE provider_call SET request_id = (SELECT id FROM software_request WHERE software_request.account_id = provider_call.account_id ORDER BY created_at DESC LIMIT 1);
CREATE INDEX provider_call_request ON provider_call(request_id);
ALTER TABLE submission_replay ADD COLUMN request_id TEXT REFERENCES software_request(id);
CREATE INDEX submission_replay_request ON submission_replay(request_id);
