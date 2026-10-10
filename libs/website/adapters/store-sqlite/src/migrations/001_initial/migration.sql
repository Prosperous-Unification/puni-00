CREATE TABLE intake_draft (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  claim_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE TABLE proposal_submission (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE REFERENCES intake_draft(id),
  email TEXT NOT NULL,
  brief TEXT NOT NULL,
  receipt TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('submitted','reviewing','contacted','closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE TABLE submission_replay (
  claim_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  receipt TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (claim_hash, idempotency_key)
);
CREATE TABLE operator_session (
  token_hash TEXT PRIMARY KEY,
  csrf_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE prospect_session (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE prospect_account (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE chat_turn (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES prospect_account(id),
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE account_request (
  account_id TEXT PRIMARY KEY REFERENCES prospect_account(id),
  description TEXT NOT NULL,
  brief TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE concept_preview (
  account_id TEXT PRIMARY KEY REFERENCES prospect_account(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
