ALTER TABLE account_request ADD COLUMN draft_id TEXT REFERENCES intake_draft(id);
ALTER TABLE account_request ADD COLUMN submitted_at INTEGER;
ALTER TABLE concept_preview ADD COLUMN revisions INTEGER NOT NULL DEFAULT 0;
