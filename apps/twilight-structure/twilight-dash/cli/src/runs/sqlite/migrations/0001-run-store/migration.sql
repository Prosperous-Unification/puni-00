CREATE TABLE run_meta (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  schema_version INTEGER NOT NULL,
  migration_hash TEXT NOT NULL,
  down_hash TEXT NOT NULL,
  ownership TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK(capacity > 0),
  lease_milliseconds INTEGER NOT NULL CHECK(lease_milliseconds > 0),
  last_observed_at INTEGER NOT NULL CHECK(last_observed_at >= 0)
);
CREATE TABLE run_manifest (
  digest TEXT PRIMARY KEY,
  record TEXT NOT NULL
);
CREATE TABLE run_record (
  run_id TEXT PRIMARY KEY,
  manifest_digest TEXT NOT NULL REFERENCES run_manifest(digest),
  record TEXT NOT NULL,
  initial_record TEXT NOT NULL
);
CREATE TABLE run_attempt (
  attempt_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES run_record(run_id),
  occurrence_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal > 0),
  record TEXT NOT NULL,
  admission TEXT NOT NULL,
  UNIQUE(run_id, occurrence_id, ordinal)
);
CREATE TABLE run_reservation (
  attempt_id TEXT PRIMARY KEY REFERENCES run_attempt(attempt_id)
);
CREATE UNIQUE INDEX run_active_occurrence ON run_attempt(run_id, occurrence_id)
  WHERE json_extract(record, '$.state.kind') NOT IN ('interrupted','terminal');
CREATE TABLE run_artifact (
  digest TEXT PRIMARY KEY,
  reference TEXT NOT NULL,
  content BLOB NOT NULL
);
CREATE TABLE run_execution (
  command_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES run_attempt(attempt_id),
  record TEXT NOT NULL,
  reply TEXT NOT NULL
);
CREATE TABLE run_completion (
  command_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES run_attempt(attempt_id),
  record TEXT NOT NULL
);
CREATE TABLE run_outbox (
  command_id TEXT PRIMARY KEY REFERENCES run_completion(command_id)
);

CREATE TABLE run_decision (
 decision_id TEXT PRIMARY KEY,
 attempt_id TEXT NOT NULL REFERENCES run_attempt(attempt_id),
 record TEXT NOT NULL
);
CREATE TABLE run_consumption (
 decision_id TEXT PRIMARY KEY REFERENCES run_decision(decision_id),
 attempt_id TEXT NOT NULL REFERENCES run_attempt(attempt_id),
 correlation_key TEXT NOT NULL,
 wait TEXT NOT NULL,
 reply TEXT NOT NULL,
 UNIQUE(attempt_id,correlation_key)
);
CREATE TABLE run_receipt (
 command_id TEXT PRIMARY KEY REFERENCES run_completion(command_id),
 attempt_id TEXT NOT NULL UNIQUE REFERENCES run_attempt(attempt_id),
 record TEXT NOT NULL,
 reply TEXT NOT NULL
);
